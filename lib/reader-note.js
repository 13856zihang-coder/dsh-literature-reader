import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { HttpError, nowIso, readJson, safeFileName, writeFileAtomic, writeJson } from './util.js'
import { baseNameRel, dirnameRel, fileStem, normalizeRel, relJoin, safeVaultPath } from './vault.js'
import { isHistoryStamp } from './summary-note.js'
import { locateQuote, parseMarkdown, plainProjection } from './markdown-core.js'

// The reader note is one third of the "tripod" that lives next to the PDF:
//   <vault>/<pdf folder>/<pdf stem>.pdf
//   <vault>/<pdf folder>/<pdf stem> 总结.md      (lib/obsidian.js)
//   <vault>/<pdf folder>/<pdf stem> 笔记.md      (this module, the only source of truth)
//   <vault>/<pdf folder>/_附件/<paperId>/        shared images
// Plugin-side state lives under <dataDir>/papers/<id>/:
//   reader-note-history/<stamp>.md|.json         full-file snapshots, newest 30
//   reader-note-questions.json                   suspected mistakes + discussion

export const READER_NOTE_HISTORY_DIR = 'reader-note-history'
export const QUESTIONS_FILE = 'reader-note-questions.json'
export const MAX_HISTORY = 30
export const QUESTION_STATUSES = ['open', 'resolved', 'dismissed', 'orphan']

export const ATTACHMENT_DIR = '_附件'
export const SUMMARY_SUFFIX = ' 总结'
export const READER_NOTE_SUFFIX = ' 笔记'
export const DEFAULT_NOTES_FOLDER = '文献阅读'
export const MAX_ENTRY_TITLE_CHARS = 24
export const MAX_QUESTIONS = 200
export const MAX_QUESTION_QUOTE_CHARS = 500
export const MAX_QUESTION_CONTEXT_CHARS = 48
export const MAX_QUESTION_MESSAGES = 40
export const MAX_QUESTION_MESSAGE_CHARS = 4000
/**
 * Mirrors `READER_NOTE_PROMPT_LIMIT` in `lib/ai.js`: above this the organizer
 * only sees the head and tail of the note, so its answer cannot be complete
 * (spec §5 rule 2b).
 */
export const READER_NOTE_PROMPT_LIMIT = 12_000

/**
 * Entry heading recognition. Deliberately loose after the clock so that
 * `## 21:03`, the legacy `## 21:03 记录` and the current
 * `## 21:03 · 首句摘要` are all entries; the trailing text is never inspected.
 */
const ENTRY_HEADING_RE = /^## \d{2}:\d{2}(?: · |\s|$)/
const DAY_HEADING_RE = /^# (\d{4}-\d{2}-\d{2})\s*$/
const MESSAGE_ROLES = ['user', 'assistant']

// ── small pure helpers ──────────────────────────────────────────────────────

function normalizeMarkdown(value) {
  return String(value === undefined || value === null ? '' : value).replace(/\r\n?/g, '\n')
}

function ensureTrailingNewline(text) {
  if (!text) return ''
  return text.endsWith('\n') ? text : `${text}\n`
}

function two(value) {
  return String(value).padStart(2, '0')
}

function localDay(date) {
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`
}

function localClock(date) {
  return `${two(date.getHours())}:${two(date.getMinutes())}`
}

function localStamp(date) {
  const day = `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}`
  const time = `${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`
  return `${day}-${time}-${String(date.getMilliseconds()).padStart(3, '0')}`
}

/** Everything time-related is the *local* timezone (spec §2). */
function asDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date
  }
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value.trim())
    if (!Number.isNaN(date.getTime())) return date
  }
  return new Date()
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ''))
}

function cleanText(value, limit) {
  if (value === undefined || value === null) return ''
  const text = typeof value === 'string' ? value : String(value)
  return limit && text.length > limit ? text.slice(0, limit) : text
}

function cleanOffset(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0
}

async function fileExists(file) {
  if (!file) return false
  try {
    return (await stat(file)).isFile()
  } catch {
    return false
  }
}

/** Merge tag groups, dedupe, cap at 18 (spec §2). */
export function mergeReaderNoteTags(...groups) {
  const seen = new Set()
  const out = []
  for (const group of groups) {
    if (!group) continue
    const list = Array.isArray(group) ? group : String(group).split(/[,，、;；\s]+/)
    for (const item of list) {
      const tag = String(item || '')
        .trim()
        .replace(/^#/, '')
        .replace(/^["']|["']$/g, '')
      if (!tag || seen.has(tag) || tag.length > 40) continue
      seen.add(tag)
      out.push(tag)
    }
  }
  return out.slice(0, 18)
}

/** `<PDF 文件名去扩展名>`: fileName → title → id (spec §1). */
function pdfStem(meta, rel = '') {
  const relStem = fileStem(baseNameRel(rel))
  if (relStem) return safeFileName(relStem)
  for (const candidate of [meta?.fileName, meta?.title, meta?.id]) {
    const stem = String(candidate || '').replace(/\.pdf$/i, '')
    const clean = safeFileName(stem, '')
    if (clean) return clean
  }
  return safeFileName('', '未命名文献')
}

function pdfFileName(meta, rel = '') {
  const explicit = String(meta?.fileName || '').trim()
  if (explicit) return /\.pdf$/i.test(explicit) ? explicit : `${explicit}.pdf`
  return `${pdfStem(meta, rel)}.pdf`
}

function summaryStemFor(meta, summaryStem) {
  const explicit = String(summaryStem || '').trim().replace(/\.md$/i, '')
  if (explicit) return explicit
  const stored = fileStem(String(meta?.summaryPath || '').trim())
  if (stored) return stored
  return `${pdfStem(meta)}${SUMMARY_SUFFIX}`
}

/** POSIX, vault-relative form of an absolute path, or '' when outside. */
function vaultRelative(vaultPath, abs) {
  if (!vaultPath || !abs) return ''
  const root = path.resolve(vaultPath)
  const rel = path.relative(root, path.resolve(abs))
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return ''
  return normalizeRel(rel.split(path.sep).join('/'))
}

// ── tripod: folder, names, paths ────────────────────────────────────────────

/** PDF folder inside the vault (POSIX relative); `notesFolder` when not in a vault. */
export function readerNoteFolder({ meta, notesFolder } = {}) {
  const rel = normalizeRel(meta?.vaultPath || '')
  if (rel) return dirnameRel(rel)
  return normalizeRel(notesFolder || DEFAULT_NOTES_FOLDER)
}

/** `<PDF stem> 笔记` (no extension). */
export function readerNoteStem(meta) {
  return `${pdfStem(meta)}${READER_NOTE_SUFFIX}`
}

/** `<pdf folder>/<stem>.md`, POSIX separators. */
export function readerNoteRelativePath({ meta, notesFolder } = {}) {
  return relJoin(readerNoteFolder({ meta, notesFolder }), `${readerNoteStem(meta)}.md`)
}

/**
 * One path segment of `_附件/…` as a bare name: no separators, no `.`/`..`, no
 * characters Windows refuses. `paperId` already travels through `PAPER_ID_RE`
 * at the route layer and `sub` is a hard-coded literal at every current call
 * site, but this function is exported and pure, so it sanitises both itself
 * rather than trusting its callers.
 */
function attachmentSegment(value) {
  const text = String(value ?? '')
    .replace(/[^A-Za-z0-9_\u4e00-\u9fa5-]/g, '')
    .trim()
  if (!text || text === '.' || text === '..') return ''
  return text
}

/**
 * `_附件/<paperId>/[<sub>/]<name>` — relative to the note itself (spec §5).
 *
 * The optional third argument adds the per-note sub folder that §14.2 splits
 * the two notes with (`图` for the summary, `笔记` for the reader note), so a
 * caller can build the link that matches where `vaultFigureDir` actually wrote
 * the file. Omitting it keeps the historical `_附件/<paperId>/<name>` link that
 * notes written before the split still carry.
 */
export function attachmentRelPath(paperId, name, sub) {
  const id = attachmentSegment(paperId)
  const file = baseNameRel(String(name || '').trim())
  if (!id || !file) return ''
  const parts = [ATTACHMENT_DIR, id]
  const extra = attachmentSegment(sub)
  if (extra) parts.push(extra)
  parts.push(file)
  return relJoin(...parts)
}

/**
 * Where the tripod is expected to live:
 * `{ pdfRel, summaryRel: '<dir>/<stem> 总结.md', noteRel: '<dir>/<stem> 笔记.md' }`.
 * `pdfRel` wins over `meta.vaultPath` because callers inside the vault know the
 * real file name (it can drift from `meta.fileName`).
 */
export function tripodPaths({ meta, pdfRel, notesFolder } = {}) {
  const rel = normalizeRel(pdfRel || meta?.vaultPath || '')
  const folder = rel ? dirnameRel(rel) : readerNoteFolder({ meta, notesFolder })
  const stem = pdfStem(meta, rel)
  return {
    pdfRel: rel,
    summaryRel: relJoin(folder, `${stem}${SUMMARY_SUFFIX}.md`),
    noteRel: relJoin(folder, `${stem}${READER_NOTE_SUFFIX}.md`),
  }
}

/**
 * The tripod files at their *actual* current location: paths recorded in
 * `meta.summaryPath` / `meta.readerNotePath` / `meta.readerNoteRelative` win
 * when they can be mapped back into the vault (`vaultPath` is passed by callers
 * that have it), otherwise the naming rule above is used.
 */
export function tripodCandidates({ meta, pdfRel, notesFolder, vaultPath } = {}) {
  const expected = tripodPaths({ meta, pdfRel, notesFolder })
  const summaryRel = vaultRelative(vaultPath, meta?.summaryPath) || expected.summaryRel
  const noteRel =
    vaultRelative(vaultPath, meta?.readerNotePath) ||
    normalizeRel(meta?.readerNoteRelative || '') ||
    expected.noteRel
  return { pdfRel: expected.pdfRel, summaryRel, noteRel }
}

// ── note file: split / hash / build ─────────────────────────────────────────

/**
 * Split a note into `{ frontmatter, body }`; the frontmatter excludes the `---`
 * fences and the body excludes the blank separator line after them, so
 * `noteHash(split(raw).body)` is stable across a read → write → read cycle.
 */
export function splitNoteFile(raw) {
  const text = normalizeMarkdown(raw)
  const match = text.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/)
  if (!match) return { frontmatter: '', body: text }
  return { frontmatter: match[1], body: text.slice(match[0].length).replace(/^\n+/, '') }
}

/** sha256 of the body, first 16 hex chars (same algorithm as summaryVersion). */
export function noteHash(body) {
  return createHash('sha256').update(normalizeMarkdown(body), 'utf8').digest('hex').slice(0, 16)
}

function frontmatterForReaderNote(meta = {}, { now, summaryStem, tags } = {}) {
  const date = asDate(now)
  const stem = pdfStem(meta)
  const pdfName = pdfFileName(meta)
  const noteStem = summaryStemFor(meta, summaryStem)
  const merged = mergeReaderNoteTags(meta.tags, tags, ['文献阅读', '阅读笔记'])
  const lines = ['---']
  lines.push(`title: ${yamlString(`${stem} 阅读笔记`)}`)
  const authors = Array.isArray(meta.authors) ? meta.authors.filter(Boolean) : []
  if (authors.length > 0) {
    lines.push('authors:')
    for (const author of authors) lines.push(`  - ${yamlString(author)}`)
  } else {
    lines.push('authors: []')
  }
  if (meta.year) {
    const year = Number(meta.year)
    const numeric = Number.isFinite(year) && String(meta.year).trim() !== ''
    lines.push(`year: ${numeric ? Math.trunc(year) : yamlString(meta.year)}`)
  }
  lines.push('tags:')
  for (const tag of merged) lines.push(`  - ${yamlString(tag)}`)
  lines.push(`paper_id: ${yamlString(meta.id)}`)
  lines.push('note_role: "reader-note"')
  lines.push('source_app: "DSH Literature Reader"')
  lines.push(`pdf: ${yamlString(`[[${pdfName}]]`)}`)
  lines.push(`summary_note: ${yamlString(`[[${noteStem}]]`)}`)
  lines.push(`vault_path: ${yamlString(normalizeRel(meta.vaultPath || ''))}`)
  lines.push(`created: ${yamlString(date.toISOString())}`)
  lines.push(`updated: ${yamlString(date.toISOString())}`)
  lines.push('---')
  return `${lines.join('\n')}\n`
}

function readerNoteBody({ meta, summaryStem, now } = {}) {
  const date = asDate(now)
  const pdfName = pdfFileName(meta)
  const noteStem = summaryStemFor(meta, summaryStem)
  return [
    '> [!info] 关联',
    `> 文献：[[${pdfName}]]`,
    `> 速览：[[${noteStem}]]`,
    '',
    `# ${localDay(date)}`,
    '',
  ].join('\n')
}

/** Full new-file content: frontmatter + link callout + the first day heading. */
export function buildReaderNoteFile({ meta, summaryStem, tags, now } = {}) {
  const frontmatter = frontmatterForReaderNote(meta, { now, summaryStem, tags })
  const body = readerNoteBody({ meta, summaryStem, now })
  return `${frontmatter}\n${body}`
}

/** Replace (or append) the `updated:` field, leaving every other line alone. */
function touchUpdated(frontmatter, date) {
  const text = String(frontmatter || '')
  const value = `updated: ${yamlString(date.toISOString())}`
  if (/^updated[ \t]*:.*$/m.test(text)) return text.replace(/^updated[ \t]*:.*$/m, value)
  return `${text.replace(/\n+$/, '')}\n${value}`
}

// ── entries ─────────────────────────────────────────────────────────────────

/**
 * First line with text turned into a short summary: link text is kept, image
 * syntax / inline-code backticks / `$` markers and leading block markers are
 * dropped. An entry that is only an image yields ''.
 */
function summaryTextOf(markdown) {
  for (const line of normalizeMarkdown(markdown).split('\n')) {
    let text = String(line || '')
    // Leading Markdown markers: # > - * 1. | (and their combinations).
    text = text.replace(/^[\s#>*+\-|]+/u, '')
    text = text.replace(/^\d{1,3}[.)、]\s*/u, '')
    // Emphasis markers are decoration, not text.
    text = text.replace(/\*\*|__/g, '')
    // Images are dropped entirely: an entry that is only an image has no text.
    text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    text = text.replace(/!\[\[[^\]]*\]\]/g, ' ')
    // Links keep their visible text.
    text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    text = text.replace(/\[\[([^\]]*)\]\]/g, (_match, inner) =>
      String(inner).split('|').pop().split('#')[0],
    )
    text = text.replace(/[`$]+/g, '')
    text = text.replace(/\s+/g, ' ').trim()
    if (text) return text
  }
  return ''
}

function clipCodePoints(text, limit) {
  const points = [...text]
  if (points.length <= limit) return text
  return `${points.slice(0, limit).join('')}…`
}

/** `## HH:mm · <首句摘要>`; falls back to `## HH:mm` when there is no text. */
export function entryTitle(markdown, at) {
  const clock = localClock(asDate(at))
  const summary = clipCodePoints(summaryTextOf(markdown), MAX_ENTRY_TITLE_CHARS)
  return summary ? `## ${clock} · ${summary}` : `## ${clock}`
}

function trimmedEntry(markdown) {
  return normalizeMarkdown(markdown).replace(/^\n+/, '').replace(/\n+$/, '')
}

function lastDayHeading(body) {
  let found = ''
  for (const line of normalizeMarkdown(body).split('\n')) {
    const match = line.match(DAY_HEADING_RE)
    if (match) found = match[1]
  }
  return found
}

function needsDayHeader(body, date) {
  return lastDayHeading(body) !== localDay(date)
}

/** `{ text: '## HH:mm · …\n\n正文', needsDayHeader }` for one new entry. */
export function buildEntryBlock({ markdown, at, body } = {}) {
  const date = asDate(at)
  return {
    text: `${entryTitle(markdown, date)}\n\n${trimmedEntry(markdown)}`,
    needsDayHeader: needsDayHeader(body, date),
  }
}

/**
 * Append one entry: inserts a `# YYYY-MM-DD` heading first when the last day
 * group is not today, keeps exactly one blank line between blocks and returns
 * the `[start, end)` source range of the inserted block (heading + body).
 */
export function appendEntryToBody({ body, markdown, at } = {}) {
  const date = asDate(at)
  const base = normalizeMarkdown(body).replace(/\s+$/, '')
  const title = entryTitle(markdown, date)
  const block = `${title}\n\n${trimmedEntry(markdown)}`
  const addDay = needsDayHeader(base, date)
  const prefix = `${base ? `${base}\n\n` : ''}${addDay ? `# ${localDay(date)}\n\n` : ''}`
  return {
    body: `${prefix}${block}\n`,
    anchor: { start: prefix.length, end: prefix.length + block.length },
    entry: { heading: title, at: date.toISOString() },
    needsDayHeader: addDay,
  }
}

/** Number of `## HH:mm…` entry headings (new and legacy formats). */
export function countEntries(body) {
  const text = normalizeMarkdown(body)
  if (!text) return 0
  let count = 0
  for (const line of text.split('\n')) if (ENTRY_HEADING_RE.test(line)) count += 1
  return count
}

// ── reading / writing the vault file ────────────────────────────────────────

async function readPaperId(file) {
  try {
    const raw = await readFile(file, 'utf8')
    const match = splitNoteFile(raw).frontmatter.match(/^paper_id:\s*"?([^"\n]+)"?\s*$/m)
    return match?.[1]?.trim() || ''
  } catch {
    return ''
  }
}

async function isOwnedBy(file, id) {
  if (!id) return false
  const owner = await readPaperId(file)
  return Boolean(owner) && owner === id
}

/**
 * Resolve the reader-note file (spec §1): a recorded path wins; otherwise the
 * tripod name is adopted when its `paper_id` matches, and a name owned by
 * another paper falls through to `<stem> 笔记 2.md`, `… 3.md`, …
 */
export async function resolveReaderNotePath({ vaultPath, notesFolder, meta } = {}) {
  if (!vaultPath) throw new HttpError(400, '未找到 Obsidian 库')
  const id = String(meta?.id || '').trim()
  const stored = String(meta?.readerNotePath || '').trim()
  if (stored && (await fileExists(stored))) {
    return { path: stored, relative: vaultRelative(vaultPath, stored), exists: true }
  }
  const targetRel = readerNoteRelativePath({ meta, notesFolder })
  const folder = dirnameRel(targetRel)
  const stem = fileStem(targetRel)
  const targetAbs = safeVaultPath(vaultPath, targetRel)
  if (!(await fileExists(targetAbs))) return { path: targetAbs, relative: targetRel, exists: false }
  if (await isOwnedBy(targetAbs, id)) return { path: targetAbs, relative: targetRel, exists: true }
  for (let index = 2; index < 100; index += 1) {
    const rel = relJoin(folder, `${stem} ${index}.md`)
    const abs = safeVaultPath(vaultPath, rel)
    if (!(await fileExists(abs))) return { path: abs, relative: rel, exists: false }
    if (await isOwnedBy(abs, id)) return { path: abs, relative: rel, exists: true }
  }
  throw new HttpError(409, '无法为阅读笔记分配文件名')
}

/**
 * Read one note. Returns `null` (never throws) when the file is not there so
 * callers can answer `exists:false` without catching.
 */
export async function readReaderNoteFile({ path: filePath } = {}) {
  if (!filePath) return null
  let raw
  let info
  try {
    raw = await readFile(filePath, 'utf8')
    info = await stat(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'EISDIR') return null
    throw error
  }
  const split = splitNoteFile(raw)
  const body = split.body
  return {
    path: filePath,
    raw,
    frontmatter: split.frontmatter,
    body,
    markdown: body,
    hash: noteHash(body),
    updatedAt: info.mtime.toISOString(),
    entryCount: countEntries(body),
  }
}

function linksOf(meta, summaryStem) {
  return { pdf: pdfFileName(meta), summary: summaryStemFor(meta, summaryStem) }
}

/**
 * Idempotent create. An existing file (adopted by paper_id) is left untouched.
 * Returns `{ created, path, relative, markdown, hash, links }`.
 */
export async function createReaderNote({ vaultPath, notesFolder, meta, summaryStem, tags, now } = {}) {
  if (!vaultPath) throw new HttpError(400, '未找到 Obsidian 库')
  const resolved = await resolveReaderNotePath({ vaultPath, notesFolder, meta })
  const existing = await readReaderNoteFile({ path: resolved.path })
  if (existing) {
    return {
      created: false,
      path: resolved.path,
      relative: resolved.relative,
      markdown: existing.markdown,
      hash: existing.hash,
      links: linksOf(meta, summaryStem),
    }
  }
  const content = buildReaderNoteFile({ meta, summaryStem, tags, now })
  await mkdir(path.dirname(resolved.path), { recursive: true })
  await writeFileAtomic(resolved.path, content)
  const body = splitNoteFile(content).body
  return {
    created: true,
    path: resolved.path,
    relative: resolved.relative,
    markdown: body,
    hash: noteHash(body),
    links: linksOf(meta, summaryStem),
  }
}

/**
 * Snapshot the *complete* previous file into `historyDir` before every write,
 * so a version edited in Obsidian can be restored faithfully. Returns the
 * stamp ('' when there was nothing to snapshot).
 */
export async function snapshotReaderNote({ historyDir, raw, reason, now } = {}) {
  const content = normalizeMarkdown(raw)
  if (!content.trim() || !historyDir) return ''
  const date = asDate(now)
  await mkdir(historyDir, { recursive: true })
  const base = localStamp(date)
  let stamp = base
  for (let attempt = 2; attempt < 500; attempt += 1) {
    if (!(await fileExists(path.join(historyDir, `${stamp}.md`)))) break
    stamp = `${base}-${attempt}`
  }
  await writeFileAtomic(path.join(historyDir, `${stamp}.md`), content)
  await writeJson(path.join(historyDir, `${stamp}.json`), {
    reason: cleanText(reason, 40) || '',
    at: date.toISOString(),
  })
  await pruneReaderNoteHistory(historyDir)
  return stamp
}

async function historyStamps(historyDir) {
  let entries = []
  try {
    entries = await readdir(historyDir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => entry.isFile() && /\.md$/.test(entry.name) && isHistoryStamp(entry.name.slice(0, -3)))
    .map((entry) => entry.name.slice(0, -3))
}

// Newest first: the stamp starts with a sortable timestamp and the `-2`, `-10`
// collision suffix is compared numerically so it never reorders versions.
function compareStamps(left, right) {
  const parse = (stamp) => {
    const [day, time, ms, ...rest] = stamp.split('-')
    return `${day}${time}${ms}|${String(Number.parseInt(rest[0] || '1', 10)).padStart(6, '0')}`
  }
  const a = parse(left)
  const b = parse(right)
  return a < b ? 1 : a > b ? -1 : 0
}

async function pruneReaderNoteHistory(historyDir) {
  const stamps = (await historyStamps(historyDir)).sort(compareStamps)
  const excess = stamps.slice(MAX_HISTORY)
  await Promise.all(
    excess.map(async (stamp) => {
      for (const file of [`${stamp}.md`, `${stamp}.json`]) {
        try {
          await unlink(path.join(historyDir, file))
        } catch {
          // already gone
        }
      }
    }),
  )
}

/** Newest first, at most 30: `{ stamp, updatedAt, chars, reason }`. */
export async function listReaderNoteHistory(historyDir) {
  if (!historyDir) return []
  const stamps = (await historyStamps(historyDir)).sort(compareStamps).slice(0, MAX_HISTORY)
  const versions = []
  for (const stamp of stamps) {
    const file = path.join(historyDir, `${stamp}.md`)
    try {
      const [content, info] = await Promise.all([readFile(file, 'utf8'), stat(file)])
      const sidecar = await readJson(path.join(historyDir, `${stamp}.json`), undefined)
      const reason = sidecar && typeof sidecar.reason === 'string' ? sidecar.reason : ''
      versions.push({ stamp, updatedAt: info.mtime.toISOString(), chars: content.length, reason })
    } catch {
      // vanished between readdir and stat
    }
  }
  return versions
}

/** Read one full-file snapshot. Invalid stamps are 404, traversal is 400. */
export async function readReaderNoteHistoryVersion({ historyDir, stamp } = {}) {
  const value = String(stamp || '').trim()
  if (!value || /[\\/]/.test(value) || value.includes('..')) {
    throw new HttpError(400, '无效的历史版本编号')
  }
  if (!isHistoryStamp(value)) throw new HttpError(404, '历史版本不存在')
  if (!historyDir) throw new HttpError(404, '历史版本不存在')
  const root = path.resolve(historyDir)
  const file = path.resolve(root, `${value}.md`)
  if (path.dirname(file) !== root) throw new HttpError(400, '无效的历史版本编号')
  let raw
  let info
  try {
    raw = await readFile(file, 'utf8')
    info = await stat(file)
  } catch (error) {
    if (error?.code === 'ENOENT') throw new HttpError(404, '历史版本不存在')
    throw error
  }
  const sidecar = await readJson(path.join(root, `${value}.json`), undefined)
  const content = normalizeMarkdown(raw)
  const split = splitNoteFile(content)
  return {
    stamp: value,
    raw: content,
    frontmatter: split.frontmatter,
    markdown: split.body,
    chars: content.length,
    reason: sidecar && typeof sidecar.reason === 'string' ? sidecar.reason : '',
    at: sidecar && typeof sidecar.at === 'string' ? sidecar.at : '',
    updatedAt: info.mtime.toISOString(),
  }
}

/**
 * Atomically replace the note body, snapshotting the previous file first.
 * Frontmatter is preserved verbatim except `updated`; the body is replaced.
 * Returns `{ body, hash, historyStamp }`.
 */
export async function writeReaderNoteFile({ path: filePath, body, meta, reason, historyDir, now } = {}) {
  if (!filePath) throw new HttpError(400, '缺少阅读笔记路径')
  const date = asDate(now)
  const nextBody = ensureTrailingNewline(normalizeMarkdown(body))
  if (!nextBody.trim()) throw new HttpError(400, '笔记正文为空')
  await mkdir(path.dirname(filePath), { recursive: true })
  let raw = ''
  try {
    raw = await readFile(filePath, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  let historyStamp = ''
  if (raw.trim()) {
    historyStamp = await snapshotReaderNote({ historyDir, raw, reason, now: date })
  }
  const previousFrontmatter = splitNoteFile(raw).frontmatter
  const frontmatter = previousFrontmatter
    ? touchUpdated(previousFrontmatter, date)
    : frontmatterForReaderNote(meta || {}, { now: date })
  const content = `---\n${frontmatter.replace(/\n+$/, '')}\n---\n\n${nextBody}`
  await writeFileAtomic(filePath, content)
  return { body: nextBody, hash: noteHash(nextBody), historyStamp }
}

/** Restore one full-file snapshot; snapshots the current file first. */
export async function restoreReaderNoteHistory({ path: filePath, historyDir, stamp, now } = {}) {
  const version = await readReaderNoteHistoryVersion({ historyDir, stamp })
  const date = asDate(now)
  let current = ''
  try {
    current = await readFile(filePath, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  let historyStamp = ''
  if (current.trim()) {
    historyStamp = await snapshotReaderNote({ historyDir, raw: current, reason: 'restore', now: date })
  }
  await mkdir(path.dirname(filePath), { recursive: true })
  const raw = ensureTrailingNewline(normalizeMarkdown(version.raw))
  await writeFileAtomic(filePath, raw)
  const body = splitNoteFile(raw).body
  return { markdown: body, hash: noteHash(body), historyStamp, stamp: version.stamp }
}

// ── questions ───────────────────────────────────────────────────────────────

function newQuestionId() {
  return `q-${randomUUID().replace(/-/g, '').slice(0, 8)}`
}

function cleanMessages(value) {
  const list = Array.isArray(value) ? value : []
  const out = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const role = String(item.role || '').trim().toLowerCase()
    if (!MESSAGE_ROLES.includes(role)) continue
    const content = cleanText(normalizeMarkdown(item.content), MAX_QUESTION_MESSAGE_CHARS)
    if (!content.trim()) continue
    out.push({ role, content, at: cleanText(item.at, 40) })
  }
  return out.slice(-MAX_QUESTION_MESSAGES)
}

function cleanQuoteText(value) {
  return cleanText(normalizeMarkdown(value), MAX_QUESTION_QUOTE_CHARS).trim()
}

function cleanQuestion(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const quote = cleanQuoteText(raw.quote)
  if (!quote) return null
  const start = cleanOffset(raw.start)
  return {
    id: cleanText(raw.id, 64).trim() || newQuestionId(),
    quote,
    prefix: cleanText(normalizeMarkdown(raw.prefix), MAX_QUESTION_CONTEXT_CHARS),
    suffix: cleanText(normalizeMarkdown(raw.suffix), MAX_QUESTION_CONTEXT_CHARS),
    start,
    end: Math.max(cleanOffset(raw.end), start),
    problem: cleanText(normalizeMarkdown(raw.problem), 1000),
    suggestion: cleanText(normalizeMarkdown(raw.suggestion), 2000),
    ask: cleanText(normalizeMarkdown(raw.ask), 500),
    status: QUESTION_STATUSES.includes(raw.status) ? raw.status : 'open',
    messages: cleanMessages(raw.messages),
    createdAt: cleanText(raw.createdAt, 40),
    resolvedAt: cleanText(raw.resolvedAt, 40),
  }
}

function questionKey(quote, problem) {
  return `${quote}\u0000${problem}`
}

function sanitizeQuestions(list) {
  const seen = new Set()
  const out = []
  for (const raw of Array.isArray(list) ? list : []) {
    const question = cleanQuestion(raw)
    if (!question) continue
    const key = questionKey(question.quote, question.problem)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(question)
    if (out.length >= MAX_QUESTIONS) break
  }
  return out
}

export async function readQuestions(dir) {
  if (!dir) return []
  const raw = await readJson(path.join(dir, QUESTIONS_FILE), undefined)
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.questions) ? raw.questions : []
  return sanitizeQuestions(list)
}

export async function writeQuestions(dir, list) {
  if (!dir) throw new HttpError(400, '缺少问题清单目录')
  const questions = sanitizeQuestions(list)
  const updatedAt = nowIso()
  await mkdir(dir, { recursive: true })
  await writeJson(path.join(dir, QUESTIONS_FILE), { version: 1, updatedAt, questions })
  return { questions, updatedAt }
}

/**
 * Clean the list, re-anchor every `open` question against `body`, turn
 * unlocatable ones into `orphan` (the quote is kept for manual repair), dedupe
 * by quote+problem and carry over id/discussion from `existing`.
 */
export function normalizeQuestions(list, body, existing = []) {
  const source = normalizeMarkdown(body)
  const projection = source.trim() ? plainProjection(parseMarkdown(source).blocks) : { text: '', map: [] }
  const priors = new Map()
  for (const item of Array.isArray(existing) ? existing : []) {
    if (!item || typeof item !== 'object') continue
    const quote = cleanQuoteText(item.quote)
    if (!quote) continue
    const key = questionKey(quote, cleanText(normalizeMarkdown(item.problem), 1000))
    if (!priors.has(key)) priors.set(key, item)
  }
  const seen = new Set()
  const out = []
  for (const raw of Array.isArray(list) ? list : []) {
    const question = cleanQuestion(raw)
    if (!question) continue
    const key = questionKey(question.quote, question.problem)
    if (seen.has(key)) continue
    seen.add(key)
    const prior = priors.get(key)
    if (prior) {
      const priorId = cleanText(prior.id, 64).trim()
      if (priorId) question.id = priorId
      const priorMessages = cleanMessages(prior.messages)
      if (priorMessages.length > 0) question.messages = priorMessages
      if (!question.createdAt) question.createdAt = cleanText(prior.createdAt, 40)
    }
    if (question.status === 'open' && projection.text) {
      const located = locateQuote(projection, {
        quote: question.quote,
        prefix: question.prefix,
        suffix: question.suffix,
        start: question.start,
        end: question.end,
      })
      if (!located) {
        question.status = 'orphan'
      } else {
        question.start = located.start
        question.end = located.end
        question.prefix = projection.text.slice(
          Math.max(0, located.plainStart - MAX_QUESTION_CONTEXT_CHARS),
          located.plainStart,
        )
        question.suffix = projection.text.slice(
          located.plainEnd,
          located.plainEnd + MAX_QUESTION_CONTEXT_CHARS,
        )
      }
    }
    out.push(question)
    if (out.length >= MAX_QUESTIONS) break
  }
  return out
}

/**
 * Map question anchors onto a rewritten body. `open` questions whose quote no
 * longer exists are dropped (their ids are returned in `droppedIds`); every
 * other question is kept as-is.
 */
export function applyOrganizeResult({ body, questions } = {}) {
  const source = normalizeMarkdown(body)
  const projection = source.trim() ? plainProjection(parseMarkdown(source).blocks) : { text: '', map: [] }
  const kept = []
  const droppedIds = []
  for (const raw of Array.isArray(questions) ? questions : []) {
    const question = cleanQuestion(raw)
    if (!question) continue
    if (question.status !== 'open') {
      kept.push(question)
      continue
    }
    const located = projection.text
      ? locateQuote(projection, {
          quote: question.quote,
          prefix: question.prefix,
          suffix: question.suffix,
          start: question.start,
          end: question.end,
        })
      : null
    if (!located) {
      droppedIds.push(question.id)
      continue
    }
    question.start = located.start
    question.end = located.end
    question.prefix = projection.text.slice(
      Math.max(0, located.plainStart - MAX_QUESTION_CONTEXT_CHARS),
      located.plainStart,
    )
    question.suffix = projection.text.slice(
      located.plainEnd,
      located.plainEnd + MAX_QUESTION_CONTEXT_CHARS,
    )
    kept.push(question)
  }
  return { questions: kept, droppedIds }
}

// ── safety gate for the AI rewrite ──────────────────────────────────────────

function tokenCounts(text) {
  const counts = new Map()
  for (const pattern of [/\[\[[^\]]*\]\]/g, /!\[[^\]]*\]\([^)]*\)/g]) {
    for (const match of text.match(pattern) || []) counts.set(match, (counts.get(match) || 0) + 1)
  }
  return counts
}

function dayHeadingCount(text) {
  return (text.match(/^# \d{4}-\d{2}-\d{2}\s*$/gm) || []).length
}

function entryHeadingCount(text) {
  let count = 0
  for (const line of text.split('\n')) if (ENTRY_HEADING_RE.test(line)) count += 1
  return count
}

function entryTimes(text) {
  const times = new Set()
  for (const line of text.split('\n')) {
    const match = line.match(/^## (\d{2}:\d{2})(?: · |\s|$)/)
    if (match) times.add(match[1])
  }
  return times
}

/**
 * Reject an AI rewrite that breaks the note structure (spec §5). Every problem
 * is a readable Chinese reason; `{ ok: true }` means the rewrite may be saved.
 */
export function checkOrganizeRewrite({ before, after } = {}) {
  const problems = []
  if (typeof after !== 'string' || !after.trim()) {
    return { ok: false, problems: ['整理后的正文为空'] }
  }
  const source = typeof before === 'string' ? before : ''
  const next = after

  if (source.length > 0) {
    if (next.length < source.length * 0.5) {
      problems.push(`正文从 ${source.length} 字缩短到 ${next.length} 字，删减超过一半`)
    }
    if (next.length > source.length * 1.5) {
      problems.push(`正文从 ${source.length} 字增加到 ${next.length} 字，新增内容超出允许范围`)
    }
  }

  // Rule 2b: past READER_NOTE_PROMPT_LIMIT the model only saw a head+tail
  // excerpt, so the 0.5 ratio gate would happily accept a body that silently
  // dropped the middle. Demand the length stay essentially intact instead.
  if (source.length > READER_NOTE_PROMPT_LIMIT) {
    if (next.length < source.length * 0.95) {
      problems.push(`笔记过长（${source.length} 字），超出模型单次整理范围，本次整理已放弃`)
    }
  }

  const beforeTokens = tokenCounts(source)
  const afterTokens = tokenCounts(next)
  for (const [token, count] of beforeTokens) {
    if ((afterTokens.get(token) || 0) < count) problems.push(`链接或图片被删除/改动：${token}`)
  }

  const daysBefore = dayHeadingCount(source)
  const daysAfter = dayHeadingCount(next)
  if (daysAfter < daysBefore) problems.push(`日分组标题从 ${daysBefore} 个减少到 ${daysAfter} 个`)

  const firstLine = next.split('\n').map((line) => line.trim()).find(Boolean) || ''
  if (firstLine === '---') problems.push('正文首行是 ---，可能误写入了 frontmatter')

  const entriesBefore = entryHeadingCount(source)
  const entriesAfter = entryHeadingCount(next)
  const minKeep = Math.ceil(entriesBefore * 0.8)
  if (entriesBefore > 0 && entriesAfter < minKeep) {
    problems.push(`条目从 ${entriesBefore} 条减少到 ${entriesAfter} 条，至少要保留 ${minKeep} 条`)
  }

  const beforeTimes = entryTimes(source)
  const rewritten = [...entryTimes(next)].filter((time) => !beforeTimes.has(time))
  if (rewritten.length > 0) problems.push(`条目标题的时间戳被改写了：${rewritten.join('、')}`)

  return problems.length > 0 ? { ok: false, problems } : { ok: true }
}
