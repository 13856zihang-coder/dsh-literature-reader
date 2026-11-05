import { existsSync } from 'node:fs'
import {
  copyFile,
  cp,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { HttpError, safeFileName, writeFileAtomic } from './util.js'

const IGNORED_DIRS = new Set([
  '.obsidian',
  '.trash',
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  '.literature-reader',
])
const NOTE_PREFIX_BYTES = 48 * 1024
const MAX_LINK_SCAN_BYTES = 8 * 1024 * 1024
let scanCache = undefined

export function normalizeRel(input) {
  return String(input || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/')
}

export function safeVaultPath(vault, rel) {
  const normalized = normalizeRel(rel)
  if (!normalized) return path.resolve(vault)
  for (const segment of normalized.split('/')) {
    if (!segment || segment === '.' || segment === '..') throw new HttpError(400, '无效的 vault 路径')
    if (segment.startsWith('.')) throw new HttpError(400, '不能访问隐藏目录')
  }
  const root = path.resolve(vault)
  const target = path.resolve(root, ...normalized.split('/'))
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new HttpError(400, '路径越界')
  }
  return target
}

export function relJoin(...parts) {
  return parts
    .flatMap((part) => String(part || '').split('/'))
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/')
}

export function dirnameRel(rel) {
  const normalized = normalizeRel(rel)
  const index = normalized.lastIndexOf('/')
  return index < 0 ? '' : normalized.slice(0, index)
}

export function baseNameRel(rel) {
  const normalized = normalizeRel(rel)
  const index = normalized.lastIndexOf('/')
  return index < 0 ? normalized : normalized.slice(index + 1)
}

export function fileStem(rel) {
  return baseNameRel(rel).replace(/\.pdf$/i, '').replace(/\.md$/i, '')
}

async function readPrefix(file, maxBytes) {
  const handle = await open(file, 'r')
  try {
    const buffer = Buffer.alloc(maxBytes)
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0)
    return buffer.subarray(0, bytesRead).toString('utf8')
  } finally {
    await handle.close()
  }
}

function parseScalar(raw) {
  let value = String(raw || '').trim()
  if (!value) return ''
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    const quote = value[0]
    value = value.slice(1, -1)
    if (quote === '"') {
      try {
        return JSON.parse(`"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
      } catch {
        return value
      }
    }
    return value
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((item) => parseScalar(item))
      .filter(Boolean)
  }
  return value
}

function parseYamlLite(block) {
  const data = {}
  let currentKey = ''
  for (const line of block.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const keyMatch = line.match(/^([A-Za-z0-9_.-]+):(.*)$/)
    if (keyMatch && !/^\s/.test(line)) {
      currentKey = keyMatch[1]
      const rest = keyMatch[2].trim()
      data[currentKey] = rest ? parseScalar(rest) : ''
      continue
    }
    const itemMatch = line.match(/^\s*-\s+(.*)$/)
    if (itemMatch && currentKey) {
      if (!Array.isArray(data[currentKey])) data[currentKey] = data[currentKey] ? [data[currentKey]] : []
      data[currentKey].push(parseScalar(itemMatch[1]))
    }
  }
  return data
}

export function parseFrontmatter(content) {
  const normalized = String(content || '').replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) {
    return { has: false, data: {}, body: normalized, block: '' }
  }
  const end = normalized.indexOf('\n---', 4)
  if (end < 0) return { has: false, data: {}, body: normalized, block: '' }
  const after = normalized.indexOf('\n', end + 4)
  const block = normalized.slice(4, end)
  const body = after < 0 ? '' : normalized.slice(after + 1)
  return { has: true, data: parseYamlLite(block), body, block }
}

export function tagList(value) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,，、;；\s]+/)
      : []
  const seen = new Set()
  const tags = []
  for (const item of source) {
    const tag = String(item || '')
      .trim()
      .replace(/^#/, '')
      .replace(/^["']|["']$/g, '')
    if (!tag || tag.length > 40 || seen.has(tag)) continue
    seen.add(tag)
    tags.push(tag)
  }
  return tags
}

function tagsFromData(data) {
  return tagList(data.tags).concat(tagList(data.tag)).concat(tagList(data.keywords))
}

function uniqueTags(...groups) {
  const seen = new Set()
  const out = []
  for (const group of groups) {
    for (const tag of tagList(group)) {
      if (seen.has(tag)) continue
      seen.add(tag)
      out.push(tag)
    }
  }
  return out.slice(0, 30)
}

function extractLinks(text) {
  const links = []
  const wiki = /\[\[([^\]]+)\]\]/g
  let match
  while ((match = wiki.exec(text)) !== null) {
    const target = match[1].split('|')[0].split('#')[0].trim()
    if (target) links.push(target)
  }
  return links
}

function titleFromContent(content, data, fallback) {
  if (data.title && String(data.title).trim()) return String(data.title).trim()
  const body = parseFrontmatter(content).body
  const heading = body.match(/^#\s+(.+)$/m)
  if (heading) return heading[1].trim()
  return fallback
}

function pdfTargets(data, links) {
  const targets = []
  if (data.pdf) targets.push(String(data.pdf).replace(/^\[\[|\]\]$/g, '').split('|')[0].trim())
  for (const link of links) {
    if (/\.pdf$/i.test(link) || /\.pdf\b/i.test(link)) targets.push(link)
  }
  return targets.filter(Boolean)
}

function segmentsOfBlock(block) {
  const segments = []
  let current = null
  for (const line of block.split(/\r?\n/)) {
    const keyMatch = line.match(/^([A-Za-z0-9_.-]+):/)
    if (keyMatch && !/^\s/.test(line)) {
      current = { key: keyMatch[1], lines: [line] }
      segments.push(current)
    } else if (current) {
      current.lines.push(line)
    }
  }
  return segments
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ''))
}

function yamlBlockList(key, values) {
  const lines = [`${key}:`]
  for (const value of values) lines.push(`  - ${yamlString(value)}`)
  return lines
}

export function setFrontmatterFields(content, fields) {
  const parsed = parseFrontmatter(content)
  let segments = parsed.has ? segmentsOfBlock(parsed.block) : []
  const set = (key, lines) => {
    const index = segments.findIndex((segment) => segment.key === key)
    if (lines.length === 0) {
      if (index >= 0) segments.splice(index, 1)
      return
    }
    const segment = { key, lines }
    if (index >= 0) segments[index] = segment
    else segments.push(segment)
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'title')) {
    set('title', fields.title ? [`title: ${yamlString(fields.title)}`] : [])
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'tags')) {
    set('tags', fields.tags?.length ? yamlBlockList('tags', fields.tags) : [])
    // Remove the old singular form; `tags` is the managed field.
    segments = segments.filter((segment) => segment.key !== 'tag')
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'pdf')) {
    set('pdf', fields.pdf ? [`pdf: "[[${String(fields.pdf).replace(/^\[\[|\]\]$/g, '')}]]"`] : [])
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'aliases')) {
    set('aliases', fields.aliases?.length ? yamlBlockList('aliases', fields.aliases) : [])
  }
  const block = segments.map((segment) => segment.lines.join('\n')).join('\n')
  const body = parsed.has ? parsed.body.replace(/^\n+/, '') : String(content || '').replace(/^\n+/, '')
  if (!block) return body
  return `---\n${block}\n---\n\n${body}`
}

async function walk(vault) {
  const folders = []
  const files = []
  let guard = 0
  async function visit(absDir, relDir, depth) {
    if (depth > 14 || guard > 12000) return
    let entries
    try {
      entries = await readdir(absDir, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    for (const entry of entries) {
      guard += 1
      if (guard > 12000) break
      if (entry.name.startsWith('.')) continue
      const rel = relJoin(relDir, entry.name)
      const abs = path.join(absDir, entry.name)
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name.toLowerCase())) continue
        folders.push({ rel, name: entry.name, depth })
        await visit(abs, rel, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (ext !== '.pdf' && ext !== '.md') continue
      let info
      try {
        info = await stat(abs)
      } catch {
        continue
      }
      files.push({
        abs,
        rel,
        folder: relDir,
        fileName: entry.name,
        stem: ext === '.pdf' ? entry.name.replace(/\.pdf$/i, '') : entry.name.replace(/\.md$/i, ''),
        ext,
        size: info.size,
        mtime: info.mtimeMs,
      })
    }
  }
  await visit(vault, '', 0)
  return { folders, files }
}

async function noteMeta(file) {
  let content = ''
  try {
    content = await readPrefix(file.abs, NOTE_PREFIX_BYTES)
  } catch {
    return undefined
  }
  const parsed = parseFrontmatter(content)
  const links = extractLinks(content)
  return {
    ...file,
    type: 'note',
    title: titleFromContent(content, parsed.data, file.stem),
    explicitTitle: Boolean(parsed.data.title && String(parsed.data.title).trim()),
    tags: uniqueTags(tagsFromData(parsed.data)),
    aliases: tagList(parsed.data.aliases),
    pdfTargets: pdfTargets(parsed.data, links),
    frontmatter: parsed.data,
  }
}

function targetMatches(target, pdf) {
  const clean = String(target).replace(/\\/g, '/').replace(/^.*\//, '').toLowerCase()
  return (
    clean === pdf.fileName.toLowerCase() ||
    clean.replace(/\.pdf$/i, '') === pdf.stem.toLowerCase() ||
    String(target).replace(/\\/g, '/').toLowerCase() === pdf.rel.toLowerCase()
  )
}

function associateNote(pdf, notes) {
  const sameFolder = notes.filter((note) => note.folder === pdf.folder)
  const parentFolder = notes.filter((note) => note.folder === dirnameRel(pdf.folder))
  const stemLower = pdf.stem.toLowerCase()
  const exact = sameFolder.find((note) => note.stem.toLowerCase() === stemLower)
  if (exact) return exact
  const byTarget = notes.find((note) => note.pdfTargets.some((target) => targetMatches(target, pdf)))
  if (byTarget) return byTarget
  const parentExact = parentFolder.find((note) => note.stem.toLowerCase() === stemLower)
  if (parentExact) return parentExact
  const cleanStem = stemLower.replace(/\s*[（(]\d+[)）]\s*$/u, '').trim()
  if (cleanStem.length >= 3) {
    const candidates = [...sameFolder, ...parentFolder]
    const fuzzy = candidates
      .filter((note) => {
        const noteStem = note.stem.toLowerCase()
        return noteStem.startsWith(cleanStem) || cleanStem.startsWith(noteStem)
      })
      .sort((a, b) => a.stem.length - b.stem.length)
    if (fuzzy.length > 0) return fuzzy[0]
  }
  return undefined
}

function folderStats(folders, pdfs, notes) {
  const map = new Map()
  map.set('', { rel: '', name: '', depth: 0, pdfCount: 0, noteCount: 0 })
  for (const folder of folders) {
    map.set(folder.rel, {
      rel: folder.rel,
      name: folder.name,
      depth: folder.depth + 1,
      pdfCount: 0,
      noteCount: 0,
    })
  }
  for (const pdf of pdfs) {
    const folder = map.get(pdf.folder)
    if (folder) folder.pdfCount += 1
  }
  for (const note of notes) {
    const folder = map.get(note.folder)
    if (folder) folder.noteCount += 1
  }
  const list = [...map.values()]
  // Aggregate bottom-up so every ancestor receives the full subtree total.
  const byDepth = [...list].sort((a, b) => {
    const depthA = a.rel ? a.rel.split('/').length : 0
    const depthB = b.rel ? b.rel.split('/').length : 0
    return depthB - depthA
  })
  for (const folder of byDepth) {
    if (!folder.rel) continue
    const parent = map.get(dirnameRel(folder.rel))
    if (parent) {
      parent.pdfCount += folder.pdfCount
      parent.noteCount += folder.noteCount
    }
  }
  return {
    folders: list
      .filter((folder) => folder.rel !== '')
      .sort((a, b) => a.rel.localeCompare(b.rel, 'zh-CN')),
    root: map.get(''),
  }
}

export async function scanVault(vault, options = {}) {
  const root = path.resolve(vault)
  if (
    !options.refresh &&
    scanCache &&
    scanCache.root === root &&
    Date.now() - scanCache.time < 2500
  ) {
    return scanCache.data
  }
  const { folders, files } = await walk(root)
  const notes = []
  const pdfs = []
  for (const file of files) {
    if (file.ext === '.md') {
      const note = await noteMeta(file)
      if (note) notes.push(note)
    } else {
      pdfs.push({ ...file, type: 'pdf' })
    }
  }
  for (const pdf of pdfs) {
    const note = associateNote(pdf, notes)
    pdf.noteRel = note?.rel || ''
    pdf.noteTitle = note?.title || ''
    pdf.noteExplicitTitle = Boolean(note?.explicitTitle)
    pdf.noteTags = note?.tags || []
    pdf.tags = uniqueTags(pdf.noteTags)
    pdf.title = note?.explicitTitle ? note.title : pdf.stem
  }
  for (const note of notes) {
    note.isSummary = /^文献阅读\//.test(note.rel) && /学习总结|总结报告/.test(note.title)
  }
  const stats = folderStats(folders, pdfs, notes)
  const data = {
    vault: root,
    folders: stats.folders,
    root: stats.root,
    pdfs: pdfs
      .map((pdf) => ({
        type: 'pdf',
        rel: pdf.rel,
        folder: pdf.folder,
        fileName: pdf.fileName,
        stem: pdf.stem,
        size: pdf.size,
        mtime: pdf.mtime,
        title: pdf.title,
        tags: pdf.tags,
        noteRel: pdf.noteRel,
        noteTitle: pdf.noteTitle,
        noteExplicitTitle: pdf.noteExplicitTitle,
      }))
      .sort((a, b) => a.folder.localeCompare(b.folder, 'zh-CN') || a.title.localeCompare(b.title, 'zh-CN')),
    notes: notes
      .map((note) => ({
        type: 'note',
        rel: note.rel,
        folder: note.folder,
        fileName: note.fileName,
        stem: note.stem,
        size: note.size,
        mtime: note.mtime,
        title: note.title,
        tags: note.tags,
        pdfTargets: note.pdfTargets,
        isSummary: note.isSummary,
      }))
      .sort((a, b) => b.mtime - a.mtime),
  }
  scanCache = { root, time: Date.now(), data }
  return data
}

export async function findPdfInVault(vault, rel) {
  const normalized = normalizeRel(rel)
  const data = await scanVault(vault, { refresh: true })
  const pdf = data.pdfs.find((item) => item.rel === normalized)
  if (!pdf) throw new HttpError(404, 'Vault 中找不到这篇 PDF')
  return { data, pdf }
}

function replacePairsInContent(content, pairs) {
  let next = content
  for (const pair of pairs) {
    for (let index = 0; index < pair.olds.length; index += 1) {
      const oldValue = pair.olds[index]
      const newValue = pair.news[index]
      if (!oldValue || !newValue || oldValue === newValue) continue
      next = next.split(`[[${oldValue}]]`).join(`[[${newValue}]]`)
      next = next.split(`[[${oldValue}|`).join(`[[${newValue}|`)
      next = next.split(`[[${oldValue}#`).join(`[[${newValue}#`)
      next = next.split(`](<${oldValue}>)`).join(`](<${newValue}>)`)
      next = next.split(`](${oldValue})`).join(`](${newValue})`)
      const encodedOld = encodeURI(oldValue)
      const encodedNew = encodeURI(newValue)
      next = next.split(`](${encodedOld})`).join(`](${encodedNew})`)
      next = next.split(`](<${encodedOld}>)`).join(`](<${encodedNew}>)`)
    }
  }
  return next
}

// Path-bearing frontmatter written by the plugin:
//   vault_path: "serdes/接收端/a.pdf"                             (vault-relative)
//   source_path: "D:\\note\\serdes\\接收端\\a.pdf"                (absolute, native separators)
//   source_pdf: "file:///D:/note/serdes/%E6%8E%A5%E6%94%B6%E7%AB%AF/a.pdf" (percent-encoded URL)
const PATH_FRONTMATTER_KEYS = ['vault_path', 'source_path', 'source_pdf']

// The decoded, forward-slash, lower-cased form used only for comparisons.
function comparablePath(value) {
  let text = String(value || '').replace(/\\/g, '/').replace(/\/{2,}/g, '/')
  if (/%[0-9A-Fa-f]{2}/.test(text)) {
    try {
      text = decodeURIComponent(text)
    } catch {
      // Not valid percent-encoding; fall back to the raw value.
    }
  }
  return text.toLowerCase()
}

// Rewrites a single path-bearing frontmatter field, preserving the separator
// style and percent-encoding that the field already uses.
function rewritePathValue(current, oldValue, newValue) {
  if (!oldValue || !newValue || oldValue === newValue) return current
  const hadBackslashes = current.includes('\\')
  const wasEncoded = /%[0-9A-Fa-f]{2}/.test(current)
  let next = String(newValue)
  if (hadBackslashes) next = next.replace(/\//g, '\\')
  if (wasEncoded) next = encodeURI(next).replace(/#/g, '%23')
  return next
}

function replacePathField(content, key, oldValue, newValue) {
  if (!oldValue || !newValue || oldValue === newValue) return content
  const target = comparablePath(oldValue)
  const pattern = new RegExp(`^(\\s*${key}:[ \\t]*)(["']?)(.*?)\\2[ \\t]*$`, 'm')
  return content.replace(pattern, (line, prefix, quote, current) => {
    if (comparablePath(current) !== target) return line
    return `${prefix}${quote}${rewritePathValue(current, oldValue, newValue)}${quote}`
  })
}

// Prefix rewrite used by folder renames: rewrites any field whose value lives
// inside the renamed subtree, whatever its encoding or separator style.
// Everything before the matched prefix (drive letter, `file://` scheme, the
// untouched ancestor folders) is preserved verbatim.
function replacePathFieldPrefix(content, key, oldPrefix, newPrefix) {
  if (!oldPrefix || !newPrefix || oldPrefix === newPrefix) return content
  const cleanOld = String(oldPrefix).replace(/\/+$/, '')
  const cleanNew = String(newPrefix).replace(/\/+$/, '')
  // Candidate spellings of the same folder path inside a field value.
  const needles = [cleanOld, encodeURI(cleanOld), cleanOld.replace(/\//g, '\\')].filter(Boolean)
  const pattern = new RegExp(`^(\\s*${key}:[ \\t]*)(["']?)(.*?)\\2[ \\t]*$`, 'm')
  return content.replace(pattern, (line, prefix, quote, current) => {
    const hadBackslashes = current.includes('\\')
    const flat = current.replace(/\\/g, '/')
    let at = -1
    let found = ''
    for (const needle of needles) {
      const index = flat.toLowerCase().indexOf(needle.replace(/\\/g, '/').toLowerCase())
      if (index >= 0) {
        at = index
        found = flat.slice(index, index + needle.replace(/\\/g, '/').length)
        break
      }
    }
    if (at < 0) return line
    const encoded = /%[0-9A-Fa-f]{2}/.test(found)
    let replacement = cleanNew
    if (encoded) replacement = encodeURI(replacement).replace(/#/g, '%23')
    if (hadBackslashes) replacement = replacement.replace(/\//g, '\\')
    const next = `${current.slice(0, at)}${replacement}${current.slice(at + found.length)}`
    if (next === current) return line
    return `${prefix}${quote}${next}${quote}`
  })
}

async function updateVaultLinks(vault, pairs, backups) {
  const normalized = await scanVault(vault, { refresh: true })
  const notes = normalized.notes
  const changed = []
  for (const note of notes) {
    if (note.size > MAX_LINK_SCAN_BYTES) continue
    const abs = safeVaultPath(vault, note.rel)
    let before
    try {
      before = await readFile(abs, 'utf8')
    } catch {
      continue
    }
    let after = replacePairsInContent(before, pairs)
    // Repair path-bearing frontmatter so Obsidian queries and downstream tools
    // do not keep pointing at the old location after a move or rename.
    for (const pair of pairs) {
      for (let index = 0; index < pair.olds.length; index += 1) {
        for (const key of PATH_FRONTMATTER_KEYS) {
          after = replacePathField(after, key, pair.olds[index], pair.news[index])
        }
      }
    }
    if (after === before) continue
    if (backups) await backups.save(note.rel, note.rel, before)
    await writeFileAtomic(abs, after)
    changed.push(note.rel)
  }
  return changed
}

function noteStemSuggestion(noteStem, oldStem, desired) {
  const lowerNote = noteStem.toLowerCase()
  const lowerOld = oldStem.toLowerCase()
  const index = lowerNote.indexOf(lowerOld)
  if (index >= 0) {
    return `${noteStem.slice(0, index)}${desired}${noteStem.slice(index + oldStem.length)}`
  }
  const cleanOld = oldStem.replace(/\s*[（(]\d+[)）]\s*$/u, '').trim()
  if (cleanOld.length >= 3 && lowerNote.startsWith(cleanOld.toLowerCase())) {
    return `${desired}${noteStem.slice(cleanOld.length)}`
  }
  return desired
}

function createBackupSession(dataDir) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const root = path.join(dataDir, 'backups', `rename-${stamp}`)
  const saved = new Set()
  let dir = ''
  let index = 0
  return {
    get dir() {
      return dir
    },
    async save(key, rel, content) {
      if (saved.has(key)) return
      saved.add(key)
      if (!dir) {
        dir = root
        await mkdir(dir, { recursive: true })
      }
      index += 1
      const label = safeFileName(baseNameRel(rel), 'note') || 'note'
      await writeFile(path.join(dir, `${String(index).padStart(4, '0')}-${label}`), content, 'utf8')
    },
  }
}

async function ensureNote(vault, pdf, title, tags) {
  if (pdf.noteRel) return { noteRel: pdf.noteRel, created: false }
  const base = path.posix.join(pdf.folder, `${pdf.stem}.md`)
  const abs = safeVaultPath(vault, base)
  if (existsSync(abs)) return { noteRel: base, created: false }
  const content = setFrontmatterFields('', {
    title: title || pdf.stem,
    tags: tags || [],
    pdf: pdf.fileName,
  })
  const body = `# ${title || pdf.stem}\n\n![[${pdf.fileName}]]\n`
  await writeFileAtomic(abs, `${content.trimEnd()}\n\n${body}`)
  scanCache = undefined
  return { noteRel: base, created: true }
}

async function writeNoteMeta(vault, noteRel, pdf, fields, backups) {
  const abs = safeVaultPath(vault, noteRel)
  let content = ''
  try {
    content = await readFile(abs, 'utf8')
  } catch {
    content = ''
  }
  const updated = setFrontmatterFields(content, {
    ...fields,
    pdf: fields.pdf ?? pdf.fileName,
  })
  if (content && updated === content) return false
  if (content && backups) await backups.save(noteRel, noteRel, content)
  await writeFileAtomic(abs, updated)
  return true
}

export async function editVaultItem({
  vault,
  dataDir,
  pdfRel,
  fileName,
  title,
  tags,
  summaryPath,
  renameNote,
}) {
  const normalized = normalizeRel(pdfRel)
  const originalAbs = safeVaultPath(vault, normalized)
  if (!existsSync(originalAbs)) throw new HttpError(404, 'PDF 不存在')

  const old = await findPdfInVault(vault, normalized)
  const oldPdf = old.pdf
  let currentRel = normalized
  let noteRel = oldPdf.noteRel
  let renamed = false
  let noteRenamed = false
  let linksUpdated = []
  const backups = createBackupSession(dataDir)

  const desired = safeFileName(String(fileName || '').replace(/\.pdf$/i, ''), '')
  if (desired && desired !== oldPdf.stem) {
    const folder = oldPdf.folder
    const newRel = relJoin(folder, `${desired}.pdf`)
    const newAbs = safeVaultPath(vault, newRel)
    const oldLower = path.resolve(originalAbs).toLowerCase()
    if (existsSync(newAbs) && path.resolve(newAbs).toLowerCase() !== oldLower) {
      throw new HttpError(409, '目标文件名已存在')
    }
    let oldNoteAbs = ''
    let newNoteRel = ''
    if (noteRel) {
      const noteStem = fileStem(noteRel)
      const noteFolder = dirnameRel(noteRel)
      const sameNameNote = noteStem.toLowerCase() === oldPdf.stem.toLowerCase()
      let targetStem = ''
      if (renameNote !== false) {
        if (sameNameNote) targetStem = desired
        else if (renameNote === true) {
          targetStem = safeFileName(
            noteStemSuggestion(noteStem, oldPdf.stem, desired),
            noteStem,
          )
        }
      }
      if (targetStem && targetStem !== noteStem) {
        newNoteRel = relJoin(noteFolder, `${targetStem}.md`)
        oldNoteAbs = safeVaultPath(vault, noteRel)
        const newNoteAbs = safeVaultPath(vault, newNoteRel)
        if (
          existsSync(newNoteAbs) &&
          path.resolve(newNoteAbs).toLowerCase() !== path.resolve(oldNoteAbs).toLowerCase()
        ) {
          throw new HttpError(409, '同名笔记文件已存在')
        }
      }
    }
    await rename(originalAbs, newAbs)
    renamed = true
    const pairs = [
      {
        olds: [oldPdf.fileName, oldPdf.stem, oldPdf.rel, oldPdf.rel.replace(/\.pdf$/i, '')],
        news: [`${desired}.pdf`, desired, newRel, newRel.replace(/\.pdf$/i, '')],
      },
    ]
    if (newNoteRel) {
      await rename(oldNoteAbs, safeVaultPath(vault, newNoteRel))
      noteRenamed = true
      noteRel = newNoteRel
      pairs.push({
        olds: [
          baseNameRel(oldPdf.noteRel),
          fileStem(oldPdf.noteRel),
          oldPdf.noteRel,
          oldPdf.noteRel.replace(/\.md$/i, ''),
        ],
        news: [
          baseNameRel(newNoteRel),
          fileStem(newNoteRel),
          newNoteRel,
          newNoteRel.replace(/\.md$/i, ''),
        ],
      })
    }
    currentRel = newRel
    if (summaryPath && existsSync(summaryPath)) {
      try {
        const before = await readFile(summaryPath, 'utf8')
        const newAbs = safeVaultPath(vault, newRel)
        const oldUrl = pathToFileURL(originalAbs).href
        const newUrl = pathToFileURL(newAbs).href
        let after = before.split(oldUrl).join(newUrl)
        after = after.split(originalAbs).join(newAbs)
        after = after.split(normalized).join(newRel)
        if (after !== before) {
          await backups.save(summaryPath, 'summary.md', before)
          await writeFileAtomic(summaryPath, after)
        }
      } catch {
        // The generic link pass below still runs; summary metadata is best-effort.
      }
    }
    linksUpdated = await updateVaultLinks(vault, pairs, backups)
  }

  const fresh = await findPdfInVault(vault, currentRel)
  const pdf = fresh.pdf
  // Keep the note we already tracked: re-association may fail for an
  // unrelated custom note name right after the rename.
  if (noteRel) pdf.noteRel = noteRel
  const finalTitle = String(title || '').trim() || pdf.title || pdf.stem
  const finalTags = uniqueTags(tags === undefined ? pdf.tags : tags)
  const noteResult = await ensureNote(vault, pdf, finalTitle, finalTags)
  noteRel = noteResult.noteRel
  let noteChanged = false
  if (noteRel) {
    noteChanged = await writeNoteMeta(
      vault,
      noteRel,
      pdf,
      {
        title: finalTitle,
        tags: finalTags,
        pdf: baseNameRel(currentRel),
      },
      backups,
    )
  }
  scanCache = undefined
  return {
    rel: currentRel,
    noteRel,
    noteCreated: noteResult.created,
    noteRenamed,
    noteChanged,
    renamed,
    linksUpdated,
    backupDir: backups.dir,
    title: finalTitle,
    tags: finalTags,
  }
}

function vaultKindOf(rel) {
  const lower = normalizeRel(rel).toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (lower.endsWith('.md')) return 'note'
  return ''
}

/**
 * Every note that references a PDF: the primary note chosen by
 * associateNote plus any note whose frontmatter/links point at the file.
 */
export function relatedNotesForPdf(pdf, notes) {
  const seen = new Set()
  const out = []
  const push = (note) => {
    if (!note || seen.has(note.rel)) return
    seen.add(note.rel)
    out.push({ rel: note.rel, title: note.title, isSummary: Boolean(note.isSummary) })
  }
  if (pdf.noteRel) push(notes.find((note) => note.rel === pdf.noteRel))
  for (const note of notes) {
    if (note.pdfTargets?.some((target) => targetMatches(target, pdf))) push(note)
    else if (note.folder === pdf.folder && note.stem.toLowerCase() === pdf.stem.toLowerCase()) push(note)
  }
  return out.slice(0, 30)
}

async function updateVaultFolderLinks(vault, oldRel, newRel, backups) {
  const data = await scanVault(vault, { refresh: true })
  const oldPrefix = `${oldRel}/`
  const newPrefix = `${newRel}/`
  const changed = []
  for (const note of data.notes) {
    if (note.size > MAX_LINK_SCAN_BYTES) continue
    const abs = safeVaultPath(vault, note.rel)
    let before
    try {
      before = await readFile(abs, 'utf8')
    } catch {
      continue
    }
    let after = before.split(oldPrefix).join(newPrefix)
    // The raw prefix swap above cannot reach percent-encoded `file://` URLs or
    // native-separator absolute paths, so path fields get a decoded pass too.
    for (const key of PATH_FRONTMATTER_KEYS) {
      after = replacePathFieldPrefix(after, key, oldPrefix, newPrefix)
    }
    if (after === before) continue
    if (backups) await backups.save(note.rel, note.rel, before)
    await writeFileAtomic(abs, after)
    changed.push(note.rel)
  }
  return changed
}

function deleteBackupRoot(dataDir) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return path.join(dataDir, 'backups', `delete-${stamp}`)
}

async function moveToDeleteBackup(dataDir, abs, rel) {
  let root = deleteBackupRoot(dataDir)
  let dest = path.join(root, ...rel.split('/'))
  let counter = 1
  while (existsSync(dest) && counter < 50) {
    root = `${deleteBackupRoot(dataDir)}-${counter}`
    dest = path.join(root, ...rel.split('/'))
    counter += 1
  }
  if (existsSync(dest)) throw new HttpError(500, '无法创建删除备份')
  await mkdir(path.dirname(dest), { recursive: true })
  try {
    await rename(abs, dest)
  } catch (error) {
    if (error?.code === 'EXDEV') {
      const info = await stat(abs)
      if (info.isDirectory()) {
        await cp(abs, dest, { recursive: true, errorOnExist: true, force: false })
        await rm(abs, { recursive: true, force: false })
      } else {
        await copyFile(abs, dest)
        await rm(abs, { force: false })
      }
    } else if (['EPERM', 'EBUSY', 'EACCES'].includes(error?.code)) {
      throw new HttpError(409, '文件被占用，无法删除。请先在 Obsidian 中关闭它，再重试。')
    } else {
      throw error
    }
  }
  return { root, dest }
}

/** Move a vault file (PDF or note) into another folder and repair path links. */
export async function moveVaultEntry({ vault, dataDir, rel, folder, kind }) {
  const oldRel = normalizeRel(rel)
  if (!oldRel) throw new HttpError(400, '缺少文件路径')
  const expectedKind = vaultKindOf(oldRel)
  if (!expectedKind) throw new HttpError(400, '只支持移动 PDF 或 Markdown 笔记')
  if (kind && kind !== expectedKind) throw new HttpError(400, '文件类型不匹配')
  const targetFolder = normalizeRel(folder)
  const currentFolder = dirnameRel(oldRel)
  if (targetFolder === currentFolder) {
    return { rel: oldRel, oldRel, folder: currentFolder, kind: expectedKind, changed: false, linksUpdated: [] }
  }
  const oldAbs = safeVaultPath(vault, oldRel)
  const info = await stat(oldAbs).catch(() => undefined)
  if (!info?.isFile()) throw new HttpError(404, '要移动的文件不存在')
  const targetAbs = targetFolder ? safeVaultPath(vault, targetFolder) : path.resolve(vault)
  const targetInfo = await stat(targetAbs).catch(() => undefined)
  if (!targetInfo?.isDirectory()) throw new HttpError(400, '目标文件夹不存在')
  const newRel = relJoin(targetFolder, baseNameRel(oldRel))
  const newAbs = safeVaultPath(vault, newRel)
  if (existsSync(newAbs)) throw new HttpError(409, '目标文件夹中已有同名文件')
  try {
    await rename(oldAbs, newAbs)
  } catch (error) {
    if (['EPERM', 'EBUSY', 'EACCES'].includes(error?.code)) {
      throw new HttpError(409, '文件被占用，无法移动。请先在 Obsidian 中关闭它，再重试。')
    }
    throw error
  }
  const oldBare = oldRel.replace(/\.(pdf|md)$/i, '')
  const newBare = newRel.replace(/\.(pdf|md)$/i, '')
  const backups = dataDir ? createBackupSession(dataDir) : null
  let linksUpdated = []
  try {
    linksUpdated = await updateVaultLinks(vault, [{ olds: [oldRel, oldBare], news: [newRel, newBare] }], backups)
  } catch {
    // The move is authoritative; a locked note must not make it look failed.
    linksUpdated = []
  }
  scanCache = undefined
  return { rel: newRel, oldRel, folder: targetFolder, kind: expectedKind, changed: true, linksUpdated }
}

/** Rename one vault folder and update path references in notes. */
export async function renameVaultFolder({ vault, dataDir, rel, name }) {
  const oldRel = normalizeRel(rel)
  if (!oldRel) throw new HttpError(400, '不能重命名库根目录')
  const abs = safeVaultPath(vault, oldRel)
  const info = await stat(abs).catch(() => undefined)
  if (!info?.isDirectory()) throw new HttpError(404, '文件夹不存在')
  const requested = String(name || '').trim()
  const safe = safeFileName(requested, '')
  if (!safe) throw new HttpError(400, '文件夹名不能为空')
  const newRel = relJoin(dirnameRel(oldRel), safe)
  // Two different "no-ops" that the caller must distinguish:
  //   unchanged  — the name is already exactly this; nothing to do.
  //   sanitized  — the typed name was rewritten (e.g. "a#b[c]" -> "a b c"),
  //                so the folder really does get a different name.
  const unchanged = newRel === oldRel
  const sanitized = !unchanged && requested !== safe
  if (unchanged) {
    return { rel: oldRel, oldRel, name: safe, changed: false, sanitized, linksUpdated: [] }
  }
  const newAbs = safeVaultPath(vault, newRel)
  // A case-only rename ("RX" -> "rx") collides with the folder itself on a
  // case-insensitive filesystem; that is a legitimate rename, not a conflict.
  const sameFolder = path.resolve(newAbs).toLowerCase() === path.resolve(abs).toLowerCase()
  if (!sameFolder && existsSync(newAbs)) throw new HttpError(409, '同名文件夹已存在')
  try {
    if (sameFolder) {
      // `rename` is a no-op on Windows for case-only changes; stage through a
      // temporary name so the new casing is actually written to disk.
      const staged = `${abs}.${Date.now().toString(36)}.rename`
      await rename(abs, staged)
      try {
        await rename(staged, newAbs)
      } catch (error) {
        await rename(staged, abs).catch(() => {})
        throw error
      }
    } else {
      await rename(abs, newAbs)
    }
  } catch (error) {
    if (['EPERM', 'EBUSY', 'EACCES'].includes(error?.code)) {
      throw new HttpError(409, '文件夹被占用，无法重命名。请先在 Obsidian 中关闭相关文件。')
    }
    throw error
  }
  const backups = dataDir ? createBackupSession(dataDir) : null
  let linksUpdated = []
  try {
    linksUpdated = await updateVaultFolderLinks(vault, oldRel, newRel, backups)
  } catch {
    // The rename is authoritative; a locked note must not make it look failed.
    linksUpdated = []
  }
  scanCache = undefined
  return { rel: newRel, oldRel, name: safe, changed: true, sanitized, linksUpdated }
}

/**
 * Delete one PDF, note, or folder. The entry is first moved into
 * <dataDir>/backups/delete-<stamp> so a mistaken deletion is recoverable.
 */
export async function deleteVaultEntry({ vault, dataDir, rel, kind }) {
  const normalized = normalizeRel(rel)
  if (!normalized) throw new HttpError(400, '不能删除库根目录')
  const expected = vaultKindOf(normalized)
  const resolvedKind = kind || expected || 'folder'
  if (!['pdf', 'note', 'folder'].includes(resolvedKind)) throw new HttpError(400, '不支持的删除类型')
  if (resolvedKind === 'pdf' && expected !== 'pdf') throw new HttpError(400, '不是 PDF 文件')
  if (resolvedKind === 'note' && expected !== 'note') throw new HttpError(400, '不是 Markdown 笔记')
  const abs = safeVaultPath(vault, normalized)
  const info = await stat(abs).catch(() => undefined)
  if (!info) throw new HttpError(404, '要删除的内容不存在')
  if (resolvedKind === 'folder' && !info.isDirectory()) throw new HttpError(400, '目标不是文件夹')
  if (resolvedKind !== 'folder' && !info.isFile()) throw new HttpError(400, '目标不是文件')
  const backup = await moveToDeleteBackup(dataDir, abs, normalized)
  scanCache = undefined
  const backupRel = path.relative(path.join(dataDir, 'backups'), backup.dest).split(path.sep).join('/')
  return { rel: normalized, kind: resolvedKind, backupRel, backupRoot: backup.root }
}

export async function createVaultFolder(vault, parent, name) {
  const safe = safeFileName(String(name || '').trim(), '')
  if (!safe) throw new HttpError(400, '文件夹名不能为空')
  const rel = relJoin(normalizeRel(parent), safe)
  const abs = safeVaultPath(vault, rel)
  if (existsSync(abs)) throw new HttpError(409, '文件夹已存在')
  await mkdir(abs, { recursive: false })
  scanCache = undefined
  return rel
}

export function invalidateVaultCache() {
  scanCache = undefined
}

export { uniqueTags }
