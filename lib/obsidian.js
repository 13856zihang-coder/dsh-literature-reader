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

const FOOTER_TITLE = '> [!info] 来源'
/** Attribution line present only in a footer this plugin generated itself. */
const FOOTER_GENERATED_LINE = '> 由 DSH 文献阅读助手生成。'

/** The "source" footer appended below every generated note. */
function sourceFooter(pdfUrl) {
  const lines = ['', '', '---', '', FOOTER_TITLE, FOOTER_GENERATED_LINE]
  if (pdfUrl) lines.push(`> PDF 原件：[打开本地文件](${escapeMdLinkTarget(pdfUrl)})`)
  return `${lines.join('\n')}\n`
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
  // Same two guards as `updateSummaryNote`: never write an empty note, and
  // never end up with the source footer twice when the body already has one.
  const content = stripTrailingSourceFooter(body)
  if (!content) throw new Error('正文为空，已跳过 Obsidian 写入')
  const markdown = `${frontmatterFor(meta, tags, pdfUrl, pdfPath)}${content}\n${sourceFooter(pdfUrl)}`
  await writeFileAtomic(notePath, markdown)
  const relative = path.relative(vault.path, notePath).split(path.sep).join('/')
  return {
    path: notePath,
    relative,
    markdown,
  }
}

/** Split an existing note into YAML frontmatter (without fences) and the body. */
function splitFrontmatter(content) {
  const text = String(content || '')
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/)
  if (!match) return { frontmatter: '', body: text }
  return { frontmatter: match[1], body: text.slice(match[0].length) }
}

/** Read the `tags:` list back out of a frontmatter block. */
function readFrontmatterTags(frontmatter) {
  const tags = []
  let inTags = false
  for (const line of String(frontmatter || '').split(/\r?\n/)) {
    if (/^tags\s*:/.test(line)) {
      inTags = true
      const inline = line.slice(line.indexOf(':') + 1).trim()
      const bracket = inline.match(/^\[(.*)\]$/)
      if (bracket) {
        for (const item of bracket[1].split(',')) {
          const tag = item.trim().replace(/^["']|["']$/g, '')
          if (tag) tags.push(tag)
        }
      }
      continue
    }
    if (!inTags) continue
    const item = line.match(/^\s+-\s+(.+)$/)
    if (item) {
      const tag = item[1].trim().replace(/^["']|["']$/g, '')
      if (tag) tags.push(tag)
      continue
    }
    inTags = false
  }
  return tags
}

function mergeTagList(...groups) {
  const seen = new Set()
  const out = []
  for (const group of groups) {
    for (const item of group || []) {
      const tag = String(item || '').trim()
      if (!tag || seen.has(tag)) continue
      seen.add(tag)
      out.push(tag)
    }
  }
  return out
}

/**
 * Merge new tags into a frontmatter block and refresh its `updated` stamp.
 * Everything else (`title`, authors, paper_id, ...) is left untouched.
 */
function updateFrontmatter(frontmatter, tags) {
  const stored = readFrontmatterTags(frontmatter)
  const merged = mergeTagList(stored, tags)
  const tagBlock = ['tags:', ...merged.map((tag) => `  - ${yamlString(tag)}`)]
  const output = []
  let inTags = false
  let wroteTags = false
  let wroteUpdated = false
  for (const line of String(frontmatter || '').split(/\r?\n/)) {
    if (/^tags\s*:/.test(line)) {
      inTags = true
      if (!wroteTags) {
        output.push(...tagBlock)
        wroteTags = true
      }
      continue
    }
    if (inTags) {
      if (/^\s+-\s+/.test(line)) continue
      inTags = false
    }
    if (/^updated\s*:/.test(line)) {
      output.push(`updated: ${yamlString(nowIso())}`)
      wroteUpdated = true
      continue
    }
    output.push(line)
  }
  if (!wroteTags) output.push(...tagBlock)
  if (!wroteUpdated) output.push(`updated: ${yamlString(nowIso())}`)
  return output.join('\n')
}

/** Pull the trailing `> [!info] 来源` footer out of a note body. */
function splitFooter(body) {
  const text = String(body || '')
  const marker = text.indexOf(FOOTER_TITLE)
  if (marker === -1) return { content: text, footer: '' }
  let start = marker
  const rule = text.lastIndexOf('\n---', marker)
  // Only treat a `---` right above the callout as the footer separator, so a
  // horizontal rule in the note body is never mistaken for it.
  if (rule !== -1 && text.slice(rule + 1, marker).trim() === '---') start = rule + 1
  return { content: text.slice(0, start), footer: text.slice(start) }
}

/**
 * Read the body of one existing note, with its frontmatter and source footer
 * stripped. Read-only: never writes, never creates. Returns null when the
 * note is not there, so callers can answer 404 without catching.
 */
export async function readNoteBody(notePath) {
  if (!notePath) return null
  let raw
  try {
    raw = await readFile(notePath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'EISDIR') return null
    throw error
  }
  const split = splitFrontmatter(raw)
  const body = splitFooter(split.body).content
  return { markdown: body.replace(/\r\n?/g, '\n').trim() }
}

/** The PDF a note points back to, when it lives inside the vault. */
function vaultPdfPath(meta, vault) {
  if (!meta?.vaultPath) return ''
  const relative = String(meta.vaultPath).split('/').join(path.sep)
  const abs = path.resolve(vault.path, relative)
  if (!abs.startsWith(path.resolve(vault.path))) return ''
  return existsSync(abs) ? abs : ''
}

/**
 * Strip a source footer that a caller appended to `body`, but only when it is
 * genuinely the *trailing* block. `splitFooter` is unusable here: it anchors on
 * the first occurrence of the marker, so a note that merely *quotes* a
 * `> [!info] 来源` callout would lose everything after the quote.
 *
 * A trailing footer is recognised structurally — the marker is followed only by
 * quote lines and blank lines to the end — so a body that ends in its own
 * hand-written 来源 callout is de-duplicated too. Returns the body unchanged
 * when no trailing callout is present.
 */
function stripTrailingSourceFooter(body) {
  const text = String(body || '').trim()
  const marker = text.lastIndexOf(FOOTER_TITLE)
  if (marker === -1) return text
  const tail = text.slice(marker)
  const onlyCalloutBody = tail
    .split('\n')
    .every((line, index) => (index === 0 ? true : /^\s*(?:>.*)?$/.test(line)))
  if (!onlyCalloutBody) return text
  let start = marker
  const rule = text.lastIndexOf('\n---', marker)
  if (rule !== -1 && text.slice(rule + 1, marker).trim() === '---') start = rule + 1
  return text.slice(0, start).trim()
}

/**
 * Replace the body of an existing study note while keeping its frontmatter
 * (title, authors, ...), merged tags and the source footer. Creates the note
 * when it is missing. Used by every save/revision/figure write.
 */
export async function updateSummaryNote({ vault, config, meta, body, tags }) {
  if (!vault?.path || !vault.exists) {
    throw new Error(`Obsidian 库不存在：${vault?.path || '未配置'}`)
  }
  const notesFolder = config?.notesFolder || '文献阅读'
  const folder = path.join(vault.path, notesFolder)
  await mkdir(folder, { recursive: true })
  const pdfPath = vaultPdfPath(meta, vault)
  const pdfUrl = pdfPath ? pathToFileURL(pdfPath).href : ''
  let notePath = ''
  if (meta?.summaryPath && existsSync(meta.summaryPath)) {
    notePath = meta.summaryPath
  } else if (meta?.summaryPath && path.resolve(meta.summaryPath).startsWith(path.resolve(folder))) {
    notePath = meta.summaryPath
  } else {
    notePath = await chooseNotePath(folder, meta || {})
  }
  const created = !existsSync(notePath)
  if (created) {
    const markdown = `${frontmatterFor(meta || {}, mergeTagList(tags), pdfUrl, pdfPath)}${String(body || '').trim()}\n${sourceFooter(pdfUrl)}`
    await writeFileAtomic(notePath, markdown)
  } else {
    const raw = await readFile(notePath, 'utf8')
    const split = splitFrontmatter(raw)
    const frontmatter = split.frontmatter
      ? updateFrontmatter(split.frontmatter, tags)
      : splitFrontmatter(frontmatterFor(meta || {}, mergeTagList(tags), pdfUrl, pdfPath)).frontmatter
    // The body comes from the caller: the local summary is authoritative.
    // `footer.content` is the old body and must never win here — using it was
    // the bug that kept every save from reaching the note.
    const content = stripTrailingSourceFooter(body)
    if (!content) throw new Error('正文为空，已跳过 Obsidian 写入')
    const footer = splitFooter(split.body).footer.trim() || sourceFooter(pdfUrl).trim()
    let markdown = `---\n${frontmatter}\n---\n\n${content}\n`
    if (footer) markdown += `\n${footer}\n`
    await writeFileAtomic(notePath, markdown)
  }
  return {
    path: notePath,
    relative: path.relative(vault.path, notePath).split(path.sep).join('/'),
    created,
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
