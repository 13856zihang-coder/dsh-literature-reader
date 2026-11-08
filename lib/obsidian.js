import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { nowIso, readJson, writeFileAtomic } from './util.js'
import { tripodPaths } from './reader-note.js'

function appDataDir() {
  if (process.platform === 'win32') {
    return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  }
  return path.join(os.homedir(), '.config')
}

export async function detectVault(config = {}) {
  if (config.obsidianVault) {
    const vaultPath = path.resolve(config.obsidianVault)
    const exists = existsSync(vaultPath)
    const isVault = exists && existsSync(path.join(vaultPath, '.obsidian'))
    // An explicit path is a hint, not permission to treat an arbitrary or
    // missing folder as a vault. Returning undefined makes every caller take
    // the same local-only path and prevents a missing vault from looking like
    // an empty library.
    if (!exists || !isVault) return undefined
    return {
      path: vaultPath,
      name: path.basename(vaultPath),
      exists: true,
      isVault: true,
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
  const vaultPath = path.resolve(chosen.path)
  const exists = existsSync(vaultPath)
  const isVault = exists && existsSync(path.join(vaultPath, '.obsidian'))
  if (!exists || !isVault) return undefined
  return {
    path: vaultPath,
    name: path.basename(vaultPath),
    exists: true,
    isVault: true,
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
  lines.push('note_role: "summary"')
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

/**
 * The tripod folder of one paper (spec §1/§12.1): the PDF's own folder inside
 * the vault, or `<vault>/<notesFolder>` when the paper is not in the vault yet.
 * `tripodPaths` is the single source of truth for the naming, so the summary and
 * the reader note can never drift apart.
 */
function tripodTarget(vault, config, meta) {
  const notesFolder = config?.notesFolder || '文献阅读'
  const { summaryRel } = tripodPaths({ meta: meta || {}, pdfRel: meta?.vaultPath || '', notesFolder })
  const segments = summaryRel.split('/')
  const fileName = segments.pop() || ''
  return {
    folder: path.join(vault.path, ...segments),
    folderRel: segments.join('/'),
    fileName,
    stem: fileName.replace(/\.md$/i, ''),
  }
}

/**
 * Pick the summary file: the tripod name when free, adopt it when its
 * `paper_id` is ours, otherwise `<stem> 总结 2.md`, `… 3.md`, … (rule 4).
 */
async function chooseSummaryPath(target, meta) {
  const candidate = path.join(target.folder, target.fileName)
  if (!existsSync(candidate)) return candidate
  if ((await existingPaperId(candidate)) === meta?.id) return candidate
  for (let index = 2; index < 100; index += 1) {
    const next = path.join(target.folder, `${target.stem} ${index}.md`)
    if (!existsSync(next)) return next
    if ((await existingPaperId(next)) === meta?.id) return next
  }
  return candidate
}

/**
 * Pick the summary file (spec §12.1): a path that really exists on disk is
 * updated in place — never renamed, never moved, so legacy summaries in the old
 * notes folder keep working. Everything else gets the tripod name, adopting it
 * when its `paper_id` is ours (rule 3) or running `<stem> 总结 2.md` (rule 4).
 */
async function summaryPathFor(target, meta) {
  if (meta?.summaryPath && existsSync(meta.summaryPath)) return meta.summaryPath
  return chooseSummaryPath(target, meta || {})
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
  const target = tripodTarget(vault, config, meta)
  const folder = target.folder
  await mkdir(folder, { recursive: true })
  // §12.1 rule 1: an existing summary keeps its path and its name, wherever it
  // lives (the legacy notes folder included). Only a missing summary gets the
  // tripod name.
  const notePath = await summaryPathFor(target, meta)
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
  const target = tripodTarget(vault, config, meta)
  const folder = target.folder
  await mkdir(folder, { recursive: true })
  const pdfPath = vaultPdfPath(meta, vault)
  const pdfUrl = pdfPath ? pathToFileURL(pdfPath).href : ''
  // Rule 1 of §12.1: an existing summary is updated where it lies; only a
  // missing one is created under the tripod name (adopting it by `paper_id`
  // or running `<stem> 总结 2.md`).
  const notePath = await summaryPathFor(target, meta)
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

/**
 * Obsidian keeps its process alive with a hidden window when the user closed it
 * to the tray. Handing over an `obsidian://` URI then switches the active note
 * *inside that hidden window*: the file really opens (the window title follows),
 * but no window appears, so the reader concludes the button did nothing. This
 * was reported as "点击修改笔记没有反应" and traced to exactly that state.
 *
 * `WScript.Shell.AppActivate` cannot help — it returns false for a hidden window
 * (verified). Win32 is the only lever: enumerate top-level windows owned by an
 * Obsidian process, take the real title-bearing `Chrome_WidgetWin_1`, then
 * `ShowWindow(SW_RESTORE)` + `SetForegroundWindow`.
 *
 * Best effort by design: a failure here must never fail the open request, and
 * `LR_NO_WINDOW_REVEAL=1` turns it off (the test suite relies on that).
 */
const REVEAL_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$sig = @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public class ObsReveal {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  static uint[] wanted = new uint[0];
  public static void SetPids(uint[] p) { wanted = p; }
  static bool Wanted(uint pid) {
    for (int i = 0; i < wanted.Length; i++) { if (wanted[i] == pid) return true; }
    return false;
  }
  public static int RevealAll() {
    List<IntPtr> hits = new List<IntPtr>();
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      if (!Wanted(pid)) return true;
      StringBuilder cls = new StringBuilder(256);
      GetClassName(h, cls, 256);
      if (cls.ToString() != "Chrome_WidgetWin_1") return true;
      StringBuilder txt = new StringBuilder(512);
      GetWindowText(h, txt, 512);
      if (txt.Length == 0) return true;
      hits.Add(h);
      return true;
    }, IntPtr.Zero);
    for (int i = 0; i < hits.Count; i++) {
      ShowWindow(hits[i], 9);
      ShowWindow(hits[i], 5);
      SetForegroundWindow(hits[i]);
    }
    return hits.Count;
  }
}
"@
Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue
for ($i = 0; $i -lt 16; $i++) {
  $procs = @(Get-Process -Name Obsidian -ErrorAction SilentlyContinue)
  if ($procs.Count -gt 0) {
    $pids = @()
    foreach ($proc in $procs) { $pids += [uint32]$proc.Id }
    [ObsReveal]::SetPids($pids)
    $count = [ObsReveal]::RevealAll()
    if ($count -gt 0) {
      Write-Output ("revealed:" + $count)
      exit 0
    }
  }
  Start-Sleep -Milliseconds 200
}
Write-Output "not-found"
`

export function revealObsidianWindow(timeoutMs = 8000) {
  if (process.platform !== 'win32') return Promise.resolve(false)
  if (process.env.LR_NO_WINDOW_REVEAL === '1') return Promise.resolve(false)
  return new Promise((resolve) => {
    let settled = false
    let timer = null
    let child = null
    const finish = (value) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve(value)
    }
    try {
      const encoded = Buffer.from(REVEAL_SCRIPT, 'utf16le').toString('base64')
      child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
        { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true },
      )
    } catch {
      finish(false)
      return
    }
    timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* already gone */
      }
      finish(false)
    }, timeoutMs)
    let out = ''
    child.stdout?.on('data', (chunk) => {
      out += String(chunk)
    })
    child.on('error', () => finish(false))
    child.on('close', () => finish(/revealed/.test(out)))
  })
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
  // Only Windows needs the nudge: macOS `open` and Linux `xdg-open` already
  // raise the target window, and Obsidian's tray behaviour is Windows-specific.
  const revealed = await revealObsidianWindow()
  return { uri, revealed }
}
