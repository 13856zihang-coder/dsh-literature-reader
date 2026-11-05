import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { nowIso, readJson, safeFileName, writeFileAtomic } from './util.js'

function appDataDir() {
  if (process.platform === 'win32') {
    return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  }
  return path.join(os.homedir(), '.config')
}

export async function detectVault(config = {}) {
  if (config.obsidianVault) {
    const vaultPath = path.resolve(config.obsidianVault)
    return {
      path: vaultPath,
      name: path.basename(vaultPath),
      exists: existsSync(vaultPath),
      isVault: existsSync(path.join(vaultPath, '.obsidian')),
      source: 'config',
    }
  }
  const registryFile = path.join(appDataDir(), 'obsidian', 'obsidian.json')
  const registry = await readJson(registryFile, {})
  const vaults = registry && typeof registry.vaults === 'object' ? Object.entries(registry.vaults) : []
  if (vaults.length === 0) return undefined
  const ranked = vaults
    .map(([id, value]) => ({ id, ...(value || {}) }))
    .sort((a, b) => Number(Boolean(b.open)) - Number(Boolean(a.open)) || Number(b.ts || 0) - Number(a.ts || 0))
  const chosen = ranked[0]
  if (!chosen?.path) return undefined
  return {
    path: path.resolve(chosen.path),
    name: path.basename(chosen.path),
    exists: existsSync(chosen.path),
    isVault: existsSync(path.join(path.resolve(chosen.path), '.obsidian')),
    source: 'obsidian-registry',
  }
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ''))
}

function frontmatterFor(meta, tags, sourcePdf, sourcePath) {
  const lines = ['---']
  lines.push(`title: ${yamlString(meta.title || meta.fileName)}`)
  const authors = Array.isArray(meta.authors) ? meta.authors : []
  if (authors.length > 0) {
    lines.push('authors:')
    for (const author of authors) lines.push(`  - ${yamlString(author)}`)
  } else {
    lines.push('authors: []')
  }
  if (meta.year) lines.push(`year: ${meta.year}`)
  if (meta.venue) lines.push(`venue: ${yamlString(meta.venue)}`)
  if (meta.doi) lines.push(`doi: ${yamlString(meta.doi)}`)
  lines.push('tags:')
  for (const tag of tags) lines.push(`  - ${yamlString(tag)}`)
  lines.push(`paper_id: ${yamlString(meta.id)}`)
  lines.push(`source_app: "DSH Literature Reader"`)
  lines.push(`source_pdf: ${yamlString(sourcePdf)}`)
  lines.push(`source_path: ${yamlString(sourcePath)}`)
  if (meta.vaultPath) lines.push(`vault_path: ${yamlString(meta.vaultPath)}`)
  if (meta.sha256) lines.push(`source_sha256: ${yamlString(meta.sha256)}`)
  if (meta.sourceAsset) lines.push(`source_asset: ${yamlString(meta.sourceAsset)}`)
  if (meta.fileName) lines.push(`source_original_name: ${yamlString(meta.fileName)}`)
  lines.push(`created: ${yamlString(meta.createdAt || nowIso())}`)
  lines.push(`updated: ${yamlString(nowIso())}`)
  lines.push('---')
  return `${lines.join('\n')}\n\n`
}

async function existingPaperId(file) {
  try {
    const content = await readFile(file, 'utf8')
    const match = content.match(/^paper_id:\s*"([^"]+)"/m)
    return match?.[1]
  } catch {
    return undefined
  }
}

async function chooseNotePath(folder, meta) {
  const base = safeFileName(meta.title || meta.fileName)
  const dated = meta.year && !base.endsWith(`(${meta.year})`) ? `${base} (${meta.year})` : base
  let candidate = path.join(folder, `${dated}.md`)
  if (existsSync(candidate)) {
    const owner = await existingPaperId(candidate)
    if (owner === meta.id) return candidate
    candidate = path.join(folder, `${dated} (${meta.id.slice(-6)}).md`)
    if (!existsSync(candidate)) return candidate
    for (let index = 2; index < 100; index += 1) {
      const next = path.join(folder, `${dated} (${meta.id.slice(-6)}-${index}).md`)
      if (!existsSync(next)) return next
    }
  }
  return candidate
}

function escapeMdLinkTarget(target) {
  return target.replace(/\s/g, '%20').replace(/\)/g, '%29')
}

export async function writeSummaryNote({ vault, config, meta, body, tags, pdfPath }) {
  if (!vault?.path || !vault.exists) {
    throw new Error(`Obsidian 库不存在：${vault?.path || '未配置'}`)
  }
  const notesFolder = config.notesFolder || '文献阅读'
  const folder = path.join(vault.path, notesFolder)
  await mkdir(folder, { recursive: true })
  let notePath = meta.summaryPath && meta.summaryPath.startsWith(folder) ? meta.summaryPath : ''
  if (!notePath) notePath = await chooseNotePath(folder, meta)
  const pdfUrl = pathToFileURL(pdfPath).href
  const footer = `\n\n---\n\n> [!info] 来源\n> 由 DSH 文献阅读助手生成。\n> PDF 原件：[打开本地文件](${escapeMdLinkTarget(pdfUrl)})\n`
  const markdown = `${frontmatterFor(meta, tags, pdfUrl, pdfPath)}${body.trim()}\n${footer}`
  await writeFileAtomic(notePath, markdown)
  const relative = path.relative(vault.path, notePath).split(path.sep).join('/')
  return {
    path: notePath,
    relative,
    markdown,
  }
}

export function obsidianUrl(vault, notePath) {
  const relative = path.relative(vault.path, notePath).split(path.sep).join('/').replace(/\.md$/i, '')
  const fileParam = relative
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `obsidian://open?vault=${encodeURIComponent(vault.name)}&file=${fileParam}`
}

export async function openInObsidian(vault, notePath) {
  if (!vault?.path) throw new Error('未找到 Obsidian 库')
  if (!notePath || !existsSync(notePath)) throw new Error('笔记文件还不存在')
  const uri = obsidianUrl(vault, notePath)
  // Always go through the registered obsidian:// handler. Launching the exe
  // first can create a second instance that shows the vault chooser, while
  // the URI handler alone focuses the running app or starts it when needed.
  if (process.platform === 'win32') {
    const child = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', uri], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
  } else if (process.platform === 'darwin') {
    const child = spawn('open', [uri], { detached: true, stdio: 'ignore' })
    child.unref()
  } else {
    const child = spawn('xdg-open', [uri], { detached: true, stdio: 'ignore' })
    child.unref()
  }
  return { uri }
}
