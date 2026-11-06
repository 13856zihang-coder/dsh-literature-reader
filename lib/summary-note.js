import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { HttpError, nowIso, readJson, writeFileAtomic, writeJson } from './util.js'
import { locateQuote, parseMarkdown, plainProjection } from './markdown-core.js'

// Local storage for one paper's study note:
//   summary.md                      the authoritative body (no frontmatter)
//   summary-annotations.json        current annotations
//   summary-history/<stamp>.md      snapshots, newest 30 kept
//   figures/<name>.png              local copies used by the preview route

export const SUMMARY_FILE = 'summary.md'
export const ANNOTATIONS_FILE = 'summary-annotations.json'
export const SOURCE_FILE = 'summary-source.json'
export const HISTORY_DIR = 'summary-history'
export const FIGURES_DIR = 'figures'
export const HISTORY_LIMIT = 30
export const MAX_ANNOTATIONS = 200
export const MAX_QUOTE_CHARS = 2000
export const MAX_NOTE_CHARS = 2000
export const MAX_CONTEXT_CHARS = 48
export const ANNOTATION_COLORS = ['amber', 'rose', 'sky', 'mint']
export const ANNOTATION_STATUSES = ['open', 'resolved', 'orphan']

// `YYYYMMDD-HHmmss-SSS`, optionally suffixed with `-2`, `-3`, ... when two
// snapshots land in the same millisecond.
export const HISTORY_STAMP_RE = /^\d{8}-\d{6}-\d{3}(-\d+)?$/

const FIGURE_NAME_RE = /^(?:fig-p\d{2,4}-\d{2,4}|img-\d{8}-\d{6}-[A-Za-z0-9]{4})\.(?:png|jpe?g)$/

function normalizeMarkdown(value) {
  return String(value === undefined || value === null ? '' : value).replace(/\r\n?/g, '\n')
}

function ensureTrailingNewline(markdown) {
  if (!markdown) return ''
  return markdown.endsWith('\n') ? markdown : `${markdown}\n`
}

function two(value) {
  return String(value).padStart(2, '0')
}

function stampFor(date) {
  const day = `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}`
  const time = `${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`
  return `${day}-${time}-${String(date.getMilliseconds()).padStart(3, '0')}`
}

/** sha256 of the note body, first 16 hex characters (see spec §2.3). */
export function summaryVersion(markdown) {
  return createHash('sha256').update(normalizeMarkdown(markdown), 'utf8').digest('hex').slice(0, 16)
}

export function summaryPath(dir) {
  return path.join(dir, SUMMARY_FILE)
}

export function annotationsPath(dir) {
  return path.join(dir, ANNOTATIONS_FILE)
}

/** Tracks how the *current* `summary.md` was written (see writeSummary). */
export function sourcePath(dir) {
  return path.join(dir, SOURCE_FILE)
}

export function figureDir(dir) {
  return path.join(dir, FIGURES_DIR)
}

/** `fig-p07-01.png` — page and index zero padded to two digits (1-based). */
export function figureFileName(page, index) {
  const pageNumber = Number.parseInt(String(page), 10)
  const sequence = Number.parseInt(String(index), 10)
  if (!Number.isFinite(pageNumber) || pageNumber < 1) throw new HttpError(400, '无效的页码')
  if (!Number.isFinite(sequence) || sequence < 1) throw new HttpError(400, '无效的图片序号')
  return `fig-p${String(pageNumber).padStart(2, '0')}-${String(sequence).padStart(2, '0')}.png`
}

/** Whitelist for the `/figure/:name` preview route: ASCII only, no separators. */
export function isFigureName(name) {
  return typeof name === 'string' && FIGURE_NAME_RE.test(name)
}

export function isHistoryStamp(stamp) {
  return typeof stamp === 'string' && HISTORY_STAMP_RE.test(stamp)
}

export async function readSummary(dir) {
  const file = summaryPath(dir)
  try {
    const raw = await readFile(file, 'utf8')
    const markdown = normalizeMarkdown(raw)
    const info = await stat(file)
    return { markdown, updatedAt: info.mtime.toISOString(), version: summaryVersion(markdown) }
  } catch (error) {
    if (error?.code === 'ENOENT') return { markdown: '', updatedAt: '', version: summaryVersion('') }
    throw error
  }
}

async function nextStamp(dir) {
  const historyDir = path.join(dir, HISTORY_DIR)
  const base = stampFor(new Date())
  for (let attempt = 1; attempt < 1000; attempt += 1) {
    const stamp = attempt === 1 ? base : `${base}-${attempt}`
    try {
      await stat(path.join(historyDir, `${stamp}.md`))
    } catch {
      return stamp
    }
  }
  throw new HttpError(500, '无法创建历史版本')
}

async function snapshotCurrent(dir, content, source) {
  const historyDir = path.join(dir, HISTORY_DIR)
  await mkdir(historyDir, { recursive: true })
  const stamp = await nextStamp(dir)
  await writeFileAtomic(path.join(historyDir, `${stamp}.md`), normalizeMarkdown(content))
  // Sidecar describing how the snapshotted body was originally written. The
  // `.md` alone cannot answer that, and a later write must not relabel it.
  await writeJson(path.join(historyDir, `${stamp}.json`), {
    source: source || '',
    updatedAt: nowIso(),
  })
  await pruneHistory(dir)
  return stamp
}

/** Read how the current body was written; '' when unknown (legacy notes). */
async function readCurrentSource(dir) {
  const raw = await readJson(sourcePath(dir), undefined)
  const value = raw && typeof raw === 'object' ? raw.source : undefined
  return typeof value === 'string' ? value : ''
}

async function listHistoryStamps(dir) {
  const historyDir = path.join(dir, HISTORY_DIR)
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

// Newest first: the stamp starts with a sortable timestamp; the `-2`, `-10`
// suffix is compared numerically so it never reorders versions.
function compareStamps(left, right) {
  const parse = (stamp) => {
    const [day, time, ms, ...rest] = stamp.split('-')
    return `${day}${time}${ms}` + `|${String(Number.parseInt(rest[0] || '1', 10)).padStart(6, '0')}`
  }
  return parse(left) < parse(right) ? 1 : parse(left) > parse(right) ? -1 : 0
}

async function pruneHistory(dir) {
  const historyDir = path.join(dir, HISTORY_DIR)
  const stamps = (await listHistoryStamps(dir)).sort(compareStamps)
  const excess = stamps.slice(HISTORY_LIMIT)
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

/**
 * Origin labels the editor knows how to render (see the history rows in
 * `client.js`). `generate`/`auto` both mean "produced by the summarizer", so
 * they collapse to the canonical `summary`; anything else is passed through and
 * the editor falls back to "other".
 */
function normalizeSource(value, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return fallback
  if (text === 'generate' || text === 'auto') return 'summary'
  return text
}

/**
 * Atomically replace `summary.md`, snapshotting the previous non-empty body
 * into `summary-history/` first. Returns the new metadata plus the stamp of
 * the snapshot that was taken (empty when there was nothing to snapshot).
 *
 * A snapshot records how the *old* body was written, not what just triggered
 * this write, so the panel can label each history entry by its own origin.
 * The current body's origin lives in `summary-source.json`; a missing state
 * file means the note predates this bookkeeping, and the snapshot is then
 * recorded with an empty source (the editor falls back to "other").
 */
export async function writeSummary(dir, markdown, options = {}) {
  const source = normalizeSource(options.source, 'manual')
  const label = typeof options.label === 'string' ? options.label : ''
  await mkdir(dir, { recursive: true })
  const file = summaryPath(dir)
  let previous = ''
  try {
    previous = await readFile(file, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const body = ensureTrailingNewline(normalizeMarkdown(markdown))
  let snapshot = ''
  if (previous && previous.trim()) {
    const previousSource = await readCurrentSource(dir)
    snapshot = await snapshotCurrent(dir, previous, previousSource)
  }
  await writeFileAtomic(file, body)
  await writeJson(sourcePath(dir), { source, updatedAt: nowIso() })
  return { updatedAt: nowIso(), version: summaryVersion(body), snapshot, source, label }
}

/** Restore one history snapshot, snapshotting the current body first. */
export async function restoreHistory(dir, stamp) {
  if (!isHistoryStamp(stamp)) throw new HttpError(400, '无效的历史版本编号')
  const historyDir = path.join(dir, HISTORY_DIR)
  const file = path.join(historyDir, `${stamp}.md`)
  // The stamp is already restricted to digits and dashes, but keep the resolved
  // path inside the history directory as a second line of defence.
  if (path.dirname(path.resolve(file)) !== path.resolve(historyDir)) {
    throw new HttpError(400, '无效的历史版本编号')
  }
  let markdown = ''
  try {
    markdown = normalizeMarkdown(await readFile(file, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') throw new HttpError(404, '历史版本不存在')
    throw error
  }
  const written = await writeSummary(dir, markdown, { source: 'restore', label: stamp })
  return { markdown: ensureTrailingNewline(markdown), version: written.version, snapshot: written.snapshot }
}

/**
 * Newest first; `limit` caps the list (default 30). `source` is the origin of
 * that snapshot's body (`summary`/`generate`/`manual`/`revision`/`figures`/
 * `restore`); it is `''` for snapshots written before the sidecar existed, so
 * the editor can fall back to "other" without breaking on old data.
 */
export async function listHistory(dir, limit = HISTORY_LIMIT) {
  const historyDir = path.join(dir, HISTORY_DIR)
  const stamps = (await listHistoryStamps(dir)).sort(compareStamps)
  const capped = Number.isFinite(limit) && limit >= 0 ? stamps.slice(0, limit) : stamps
  const versions = []
  for (const stamp of capped) {
    const file = path.join(historyDir, `${stamp}.md`)
    try {
      const [content, info] = await Promise.all([readFile(file, 'utf8'), stat(file)])
      const sidecar = await readJson(path.join(historyDir, `${stamp}.json`), undefined)
      const source = sidecar && typeof sidecar.source === 'string' ? sidecar.source : ''
      versions.push({ stamp, updatedAt: info.mtime.toISOString(), chars: content.length, source })
    } catch {
      // The file vanished between readdir and stat; skip it.
    }
  }
  return versions
}

function cleanString(value, limit) {
  if (typeof value !== 'string') return ''
  return value.length > limit ? value.slice(0, limit) : value
}

function cleanOffset(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : 0
}

/** Validate and clean one annotation; returns null when it is unusable. */
function cleanAnnotation(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const id = cleanString(raw.id, 80).trim()
  const quote = cleanString(normalizeMarkdown(raw.quote), MAX_QUOTE_CHARS).trim()
  if (!id || !quote) return null
  const start = cleanOffset(raw.start)
  const end = Math.max(cleanOffset(raw.end), start)
  return {
    id,
    quote,
    prefix: cleanString(normalizeMarkdown(raw.prefix), MAX_CONTEXT_CHARS),
    suffix: cleanString(normalizeMarkdown(raw.suffix), MAX_CONTEXT_CHARS),
    start,
    end,
    note: cleanString(normalizeMarkdown(raw.note), MAX_NOTE_CHARS),
    color: ANNOTATION_COLORS.includes(raw.color) ? raw.color : 'amber',
    status: ANNOTATION_STATUSES.includes(raw.status) ? raw.status : 'open',
    createdAt: cleanString(raw.createdAt, 40),
    resolvedAt: cleanString(raw.resolvedAt, 40),
    revision: Number.isFinite(Number(raw.revision)) && Number(raw.revision) >= 0 ? Math.trunc(Number(raw.revision)) : 0,
    reply: cleanString(normalizeMarkdown(raw.reply), MAX_NOTE_CHARS),
  }
}

/** Clean a list: drop invalid entries, truncate long fields, dedupe ids, cap at 200. */
export function normalizeAnnotations(annotations) {
  const list = Array.isArray(annotations) ? annotations : []
  const seen = new Set()
  const cleaned = []
  for (const entry of list) {
    const item = cleanAnnotation(entry)
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    cleaned.push(item)
    if (cleaned.length >= MAX_ANNOTATIONS) break
  }
  return cleaned
}

export async function readAnnotations(dir) {
  const raw = await readJson(annotationsPath(dir), undefined)
  return normalizeAnnotations(raw?.annotations)
}

export async function writeAnnotations(dir, annotations) {
  const cleaned = normalizeAnnotations(annotations)
  const updatedAt = nowIso()
  await mkdir(dir, { recursive: true })
  await writeJson(annotationsPath(dir), { version: 1, updatedAt, annotations: cleaned })
  return { annotations: cleaned, updatedAt }
}

/**
 * Re-anchor annotations against the current body. Only `open` annotations are
 * re-located: `resolved` ones keep their history, and an annotation whose quote
 * no longer exists becomes `orphan` while keeping the quote for manual repair.
 */
export function anchorAnnotations(markdown, annotations) {
  const source = normalizeMarkdown(markdown)
  const projection = plainProjection(parseMarkdown(source).blocks)
  const anchored = []
  const orphans = []
  const result = []
  for (const raw of Array.isArray(annotations) ? annotations : []) {
    const annotation = cleanAnnotation(raw)
    if (!annotation) continue
    if (annotation.status !== 'open') {
      result.push(annotation)
      continue
    }
    const located = locateQuote(projection, {
      quote: annotation.quote,
      prefix: annotation.prefix,
      suffix: annotation.suffix,
      start: annotation.start,
      end: annotation.end,
    })
    if (!located) {
      result.push({ ...annotation, status: 'orphan', reply: '原文已改动，无法定位' })
      orphans.push(annotation.id)
      continue
    }
    result.push({
      ...annotation,
      start: located.start,
      end: located.end,
      prefix: projection.text.slice(Math.max(0, located.plainStart - MAX_CONTEXT_CHARS), located.plainStart),
      suffix: projection.text.slice(located.plainEnd, located.plainEnd + MAX_CONTEXT_CHARS),
    })
    anchored.push(annotation.id)
  }
  return { annotations: result, anchored, orphans }
}

/**
 * Store one figure under `figures/<name>`. `name` must already match the
 * whitelist, so the preview route can serve it without another check.
 */
export async function saveFigure(dir, name, data) {
  if (!isFigureName(name)) throw new HttpError(400, '无效的图片文件名')
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data ?? '')
  if (buffer.length === 0) throw new HttpError(400, '图片内容为空')
  const outDir = figureDir(dir)
  await mkdir(outDir, { recursive: true })
  const file = path.join(outDir, name)
  const tmp = `${file}.${randomUUID()}.tmp`
  await writeFile(tmp, buffer)
  await rename(tmp, file)
  return { name, path: file, size: buffer.length }
}

/** Path of a stored figure, or null when the name is not whitelisted. */
export function figurePath(dir, name) {
  return isFigureName(name) ? path.join(figureDir(dir), name) : null
}
