import { createReadStream, existsSync } from 'node:fs'
import { appendFile, copyFile, link, mkdir, open, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { LiteratureAI } from './lib/ai.js'
import { Catalog } from './lib/catalog.js'
import { createLiteratureReviewSource } from './lib/review-source.js'
import { createManagementApi } from './lib/management-api.js'
import {
  buildFullText,
  ensurePageImage,
  extractPdfText,
  looksScanned,
  pdfInfo,
  resolvePoppler,
} from './lib/pdf.js'
import {
  detectVault,
  openInObsidian,
  readNoteBody,
  updateSummaryNote,
  writeSummaryNote,
} from './lib/obsidian.js'
import {
  applyReplacements,
  findFigurePlaceholders,
  locateQuote,
  parseMarkdown,
  plainProjection,
} from './lib/markdown-core.js'
import {
  READER_NOTE_HISTORY_DIR,
  MAX_QUESTION_MESSAGES,
  appendEntryToBody,
  applyOrganizeResult,
  attachmentRelPath,
  checkOrganizeRewrite,
  countEntries,
  createReaderNote,
  listReaderNoteHistory,
  noteHash,
  normalizeQuestions,
  readerNoteFolder,
  readQuestions,
  readReaderNoteFile,
  readReaderNoteHistoryVersion,
  resolveReaderNotePath,
  restoreReaderNoteHistory,
  writeQuestions,
  writeReaderNoteFile,
} from './lib/reader-note.js'
import {
  anchorAnnotations,
  figureDir,
  figurePath,
  HISTORY_DIR,
  isFigureName,
  isHistoryStamp,
  listHistory,
  readAnnotations as readSummaryAnnotations,
  readSummary,
  restoreHistory,
  saveFigure,
  summaryPath,
  summaryVersion,
  writeAnnotations as writeSummaryAnnotations,
  writeSummary,
} from './lib/summary-note.js'
import {
  autoFigureName,
  bboxToPixels,
  copyFigureToVault,
  cropPageRegion,
  pageSizePoints,
} from './lib/figures.js'
import {
  DEFAULT_WORD_NOTE,
  extractVocabularyAnswer,
  isVocabularyKind,
  looksLikeVocabularyAnswer,
  MAX_GLOSSARY_ENTRIES,
  readGlossary,
  recordWord,
} from './lib/words.js'
import {
  baseNameRel,
  createVaultFolder,
  deleteVaultEntry,
  dirnameRel,
  editVaultItem,
  fileStem,
  invalidateVaultCache,
  moveVaultEntry,
  normalizeRel,
  relatedNotesForPdf,
  relJoin,
  renameVaultFolder,
  safeVaultPath,
  scanVault,
  setFrontmatterFields,
  uniqueTags,
} from './lib/vault.js'
import {
  HttpError,
  PAPER_ID_RE,
  baseDirs,
  ensureBaseDirs,
  errorMessage,
  nowIso,
  readJson,
  safeFileName,
  safePaperDir,
  slugForPaper,
  stripDataUrl,
  writeFileAtomic,
  writeJson,
} from './lib/util.js'
import { normalizePreference, readPreference, writePreference } from './lib/settings.js'

const ROUTE_PREFIX = '/literature-reader'
const PREFIX = '/literature-reader/'
const API_PREFIX = '/literature-reader/api'
const VERSION = '2.0.0'
const MAX_UPLOAD = 350 * 1024 * 1024
const SUMMARY_MAX_CHARS = 400 * 1024
const IMAGE_MAX_BYTES = 8 * 1024 * 1024
const PENDING_IMAGE_TTL = 24 * 60 * 60 * 1000
const DEFAULT_SUMMARY_FIGURES = 5
const MAX_SUMMARY_FIGURES = 10
const MAX_FIGURE_PLACEHOLDERS = 12
const MAX_PLACEMENT_ASKS = 2
const FIGURE_DPI = 200
const FIGURES_BLOCK_RE = /!\[[^\]]*\]\(_附件\//g
// Two writes of the same save land milliseconds apart, and some filesystems
// only keep whole-second mtimes. A small window keeps a single save from
// reporting itself as an external edit.
const VAULT_MTIME_TOLERANCE_MS = 2000

/** Study-note figure limit: 0 disables images, invalid values fall back to 5. */
function normalizeFigureLimit(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_SUMMARY_FIGURES
  const parsed = Number.parseInt(String(value), 10)
  if (!Number.isFinite(parsed)) return DEFAULT_SUMMARY_FIGURES
  return Math.min(MAX_SUMMARY_FIGURES, Math.max(0, parsed))
}

function normalizeConfig(config = {}) {
  return {
    dataDir: config.dataDir,
    obsidianVault: config.obsidianVault,
    notesFolder: config.notesFolder || '文献阅读',
    autoOpenObsidian: config.autoOpenObsidian !== false,
    provider: config.provider || undefined,
    model: config.model || undefined,
    reasoningEffort: config.reasoningEffort || undefined,
    popplerDir: config.popplerDir || undefined,
    importFolder: config.importFolder || '',
    wordNote: String(config.wordNote || DEFAULT_WORD_NOTE).trim() || DEFAULT_WORD_NOTE,
    maxSummaryFigures: normalizeFigureLimit(config.maxSummaryFigures),
  }
}

function json(res, status, value) {
  if (res.writableEnded) return
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(body)
}

async function readBody(req, limit = 12 * 1024 * 1024) {
  const declared = Number(req.headers['content-length'] || 0)
  if (declared > limit) throw new HttpError(413, '上传内容过大')
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > limit) throw new HttpError(413, '上传内容过大')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function readJsonBody(req, limit = 12 * 1024 * 1024) {
  const buffer = await readBody(req, limit)
  if (buffer.length === 0) return {}
  try {
    return JSON.parse(buffer.toString('utf8'))
  } catch {
    throw new HttpError(400, '请求体不是有效 JSON')
  }
}

function mergeTags(...groups) {
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
  return out.slice(0, 18)
}

function extractCitations(text) {
  const found = new Set()
  const regex = /\[p{1,2}\.\s*(\d+)(?:\s*[-–]\s*(\d+))?\]/gi
  let match
  while ((match = regex.exec(String(text || ''))) !== null) {
    found.add(Number(match[1]))
    if (match[2]) found.add(Number(match[2]))
  }
  return [...found].filter((n) => Number.isFinite(n)).sort((a, b) => a - b).slice(0, 40)
}

function padNumber(value, size = 2) {
  return String(value).padStart(size, '0')
}

/** `img-20261105-221500-ab12.png` — the upload naming scheme of spec §2.1. */
function uploadedImageName(date, mediaType) {
  const day = `${date.getFullYear()}${padNumber(date.getMonth() + 1)}${padNumber(date.getDate())}`
  const time = `${padNumber(date.getHours())}${padNumber(date.getMinutes())}${padNumber(date.getSeconds())}`
  const suffix = randomUUID().replace(/-/g, '').slice(0, 4)
  return `img-${day}-${time}-${suffix}.${mediaType === 'image/png' ? 'png' : 'jpg'}`
}

/** Magic-number check: only PNG and JPEG are accepted for note images. */
function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return ''
  const png =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  if (png) return 'image/png'
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  return ''
}

/** Decode one uploaded data URL, enforcing type, magic number and size. */
function decodeImageUpload(value, mediaTypeHint) {
  const raw = stripDataUrl(String(value || ''))
  if (!raw) throw new HttpError(400, '缺少图片数据')
  const buffer = Buffer.from(raw, 'base64')
  if (buffer.length === 0) throw new HttpError(400, '图片内容为空')
  if (buffer.length > IMAGE_MAX_BYTES) throw new HttpError(413, '图片不能超过 8MB')
  const hint = String(mediaTypeHint || '').toLowerCase()
  if (hint && !['image/png', 'image/jpeg', 'image/jpg'].includes(hint)) {
    throw new HttpError(400, '只支持 PNG 或 JPEG 图片')
  }
  const detected = detectImageType(buffer)
  if (!detected) throw new HttpError(400, '只支持 PNG 或 JPEG 图片')
  if (hint === 'image/png' && detected !== 'image/png') {
    throw new HttpError(400, '图片内容与声明的类型不一致')
  }
  if ((hint === 'image/jpeg' || hint === 'image/jpg') && detected !== 'image/jpeg') {
    throw new HttpError(400, '图片内容与声明的类型不一致')
  }
  return { buffer, mediaType: detected }
}

function figureFileType(name) {
  return /\.png$/i.test(String(name || '')) ? 'image/png' : 'image/jpeg'
}

/** One-line caption that can live inside Markdown link text. */
function sanitizeCaption(value, max = 160) {
  return String(value || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/** Parse the optional `at` of one reader-note entry; invalid values mean now. */
function parseReaderNoteTime(value) {
  if (value === undefined || value === null || value === '') return new Date()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function countNoteFigures(markdown) {
  const matches = String(markdown || '').match(/!\[[^\]]*\]\(_附件\//g)
  return matches ? matches.length : 0
}

/**
 * True when the vault note is newer than the local body by more than the
 * tolerance window. `localTime` may be 0 (no local file yet), in which case
 * any existing note counts as external content, not as an edit of ours.
 */
function vaultIsNewer(vaultTime, localTime) {
  if (!Number.isFinite(vaultTime) || vaultTime <= 0) return false
  return vaultTime - (Number.isFinite(localTime) ? localTime : 0) > VAULT_MTIME_TOLERANCE_MS
}

/** How many terms the dialog may ask about before we quietly keep the rest. */
const MAX_GLOSSARY_QUESTIONS = 10

/**
 * Validate a caller-supplied glossary. Returns a clean list or throws, because
 * a malformed override would otherwise reach the prompt as `[object Object]`.
 */
function normalizeGlossaryOverride(value) {
  if (!Array.isArray(value)) throw new HttpError(400, 'glossaryOverride 必须是数组')
  if (value.length > MAX_GLOSSARY_ENTRIES) {
    throw new HttpError(400, `glossaryOverride 最多 ${MAX_GLOSSARY_ENTRIES} 条`)
  }
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new HttpError(400, `glossaryOverride 第 ${index + 1} 条格式不正确`)
    }
    const term = String(item.term ?? '').trim()
    if (!term) throw new HttpError(400, `glossaryOverride 第 ${index + 1} 条缺少 term`)
    return { term, translation: String(item.translation ?? '').trim(), source: 'translated' }
  })
}

function lineStartAt(text, offset) {
  const source = String(text || '')
  const safe = Math.max(0, Math.min(source.length, Math.trunc(Number(offset) || 0)))
  if (safe === 0) return 0
  const newline = source.lastIndexOf('\n', safe - 1)
  return newline === -1 ? 0 : newline + 1
}

/**
 * Find the single heading line matching `candidate`. The name may omit the
 * `##` prefix; an ambiguous name resolves to null so the caller never guesses.
 */
function findHeadingLine(text, candidate) {
  const wanted = String(candidate || '')
    .replace(/^#+\s*/, '')
    .replace(/\s+#+\s*$/, '')
    .trim()
  if (!wanted) return null
  const compact = (value) => value.replace(/\s+/g, ' ')
  let hit = null
  let offset = 0
  for (const line of String(text || '').split('\n')) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
    if (match) {
      const title = match[2].replace(/\s+#+\s*$/, '').trim()
      if (title === wanted || compact(title) === compact(wanted)) {
        if (hit) return null
        hit = { level: match[1].length, offset }
      }
    }
    offset += line.length + 1
  }
  return hit
}

/** Offset right before the next heading of the same or a higher level. */
function sectionEndOffset(text, heading) {
  const source = String(text || '')
  let offset = 0
  for (const line of source.split('\n')) {
    const lineStart = offset
    offset += line.length + 1
    if (lineStart <= heading.offset) continue
    const match = /^(#{1,6})\s+/.exec(line)
    if (match && match[1].length <= heading.level) return lineStart
  }
  return source.length
}

/** Resolve an explicit `{ heading, afterOffset }` anchor to an insert offset. */
function resolveAnchorOffset(markdown, anchor) {
  const text = String(markdown || '')
  const raw = Number(anchor?.afterOffset)
  if (anchor?.afterOffset !== undefined && anchor?.afterOffset !== null && anchor?.afterOffset !== '') {
    if (Number.isFinite(raw) && raw >= 0 && raw <= text.length) {
      return lineStartAt(text, raw)
    }
  }
  const heading = findHeadingLine(text, anchor?.heading)
  if (heading) return sectionEndOffset(text, heading)
  return null
}

/** Insert a standalone Markdown block at a line-aligned offset. */
function insertBlockAt(text, offset, block) {
  const source = String(text || '')
  const safe = Math.max(0, Math.min(source.length, Math.trunc(Number(offset) || 0)))
  const before = source.slice(0, safe)
  const after = source.slice(safe)
  const lead = before === '' ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
  const tail = after === '' || after.startsWith('\n') ? '' : '\n'
  return `${before}${lead}${block}${tail}${after}`
}

function figureMarkdownFor(paperId, name, caption, page) {
  const label = sanitizeCaption(caption) || (page ? `第 ${page} 页的图` : '插图')
  // Spec §7.8b: the summary's figures live under `_附件/<id>/图/`, so the link
  // must say the same — the in-app preview reads the local copy and would hide
  // a mismatch until the note is opened in Obsidian.
  const lines = [`![${label}](_附件/${paperId}/图/${name})`]
  if (page) {
    const note = sanitizeCaption(caption) || '图片'
    lines.push(`*${note} · p.${page}*`)
  }
  return `${lines.join('\n')}\n`
}

// The failure callout is part of the contract (spec §3.2): exactly two quote
// lines. The machine-readable reason travels in the SSE/JSON payload instead.
function figureFailureMarkdown(caption, page) {
  const label = sanitizeCaption(caption) || '这张图'
  const title = `> [!figure] 图未自动截取：${label}${page ? `（p.${page}）` : ''}`
  return `${title}\n> 可在编辑模式下自行插入图片。\n`
}

function validateStrokes(input, pageCount) {
  if (!Array.isArray(input)) throw new HttpError(400, '批注数据格式错误')
  if (input.length > 6000) throw new HttpError(413, '批注数量过多')
  const strokes = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const page = Number(raw.page)
    const width = Number(raw.width)
    const opacity = raw.opacity === undefined ? 1 : Number(raw.opacity)
    const color = String(raw.color || '')
    const points = Array.isArray(raw.points)
      ? raw.points
          .map((point) => {
            if (!Array.isArray(point) || point.length < 2) return undefined
            const x = Number(point[0])
            const y = Number(point[1])
            if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined
            return [Math.max(0, Math.min(1, Number(x.toFixed(5)))), Math.max(0, Math.min(1, Number(y.toFixed(5))))]
          })
          .filter(Boolean)
      : []
    if (!Number.isInteger(page) || page < 1 || page > Math.max(1, pageCount)) continue
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) continue
    if (!Number.isFinite(width) || width < 0.5 || width > 30) continue
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) continue
    if (points.length < 2) continue
    strokes.push({
      id: String(raw.id || randomUUID()).slice(0, 80),
      page,
      color,
      width: Number(width.toFixed(2)),
      opacity: Number(opacity.toFixed(2)),
      points: points.slice(0, 800),
    })
  }
  return strokes
}

function makeSse(res, onAbort) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    'X-Content-Type-Options': 'nosniff',
  })
  res.write(': connected\n\n')
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      try {
        res.write(': ping\n\n')
      } catch {
        // response went away
      }
    }
  }, 15_000)
  let closed = false
  const send = (payload) => {
    if (closed || res.writableEnded) return
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`)
    } catch {
      // response went away
    }
  }
  const end = () => {
    if (closed) return
    closed = true
    clearInterval(heartbeat)
    if (!res.writableEnded) res.end()
  }
  res.on('close', () => {
    if (!closed) {
      closed = true
      clearInterval(heartbeat)
      onAbort?.()
    }
  })
  return { send, end }
}

function publicPaper(meta) {
  const summaryExists = Boolean(meta.summaryPath) && existsSync(meta.summaryPath)
  const storageMode = meta.storageMode || (meta.vaultPath ? 'obsidian' : 'local')
  const syncState = meta.syncState || (storageMode === 'obsidian' ? 'synced' : 'local-only')
  // The reader note lives in the vault, so its presence is a file check like the
  // summary's (spec §3.10). A path recorded in meta that no longer exists must
  // not claim `hasReaderNote: true`.
  const readerNoteExists = Boolean(meta.readerNotePath) && existsSync(meta.readerNotePath)
  return {
    id: meta.id,
    title: meta.title || meta.fileName,
    fileName: meta.fileName,
    fileSize: meta.fileSize,
    pageCount: meta.pageCount || 0,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    status: meta.status || 'processing',
    phase: meta.phase || '',
    progress: meta.progress || null,
    scanned: Boolean(meta.scanned),
    chars: meta.chars || 0,
    ocrDone: meta.ocrDone || 0,
    ocrTotal: meta.ocrTotal || 0,
    authors: meta.authors || [],
    year: meta.year || null,
    venue: meta.venue || '',
    doi: meta.doi || '',
    abstract: meta.abstract || '',
    keywords: meta.keywords || [],
    tags: meta.tags || [],
    tldr: meta.tldr || '',
    analysisReady: Boolean(meta.analysisReady),
    analysisError: meta.analysisError || '',
    outline: Array.isArray(meta.outline) ? meta.outline : [],
    error: meta.error || '',
    hasSummary: summaryExists,
    summaryPath: meta.summaryPath || '',
    hasReaderNote: readerNoteExists,
    readerNoteRelative: meta.readerNoteRelative || '',
    readerNoteOpen: Number(meta.readerNoteOpen) || 0,
    summarizedAt: meta.summarizedAt || '',
    chatCount: meta.chatCount || 0,
    sha256: meta.sha256 || '',
    sourceAsset: meta.sourceAsset || '',
    storageMode,
    syncState,
    vaultPath: meta.vaultPath || '',
    vaultFolder: meta.vaultPath ? dirnameRel(meta.vaultPath) : '',
    vaultMissing: Boolean(meta.vaultPath) && meta.vaultExists === false,
    pdfUrl: `${API_PREFIX}/papers/${meta.id}/pdf`,
  }
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(file)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

export const inject = ['webServer', 'llm', 'agentDefaultModel', 'attachments']

export function apply(ctx, rawConfig = {}) {
  const config = normalizeConfig(rawConfig)
  const dirs = baseDirs(config)
  const ai = new LiteratureAI(ctx, config)
  const metaCache = new Map()
  const jobs = new Map()
  const pageJobs = new Map()
  const uploads = new Map()
  const busy = new Set()
  const controllers = new Map()
  // Pending image placements (`imageId` -> record); answers arrive up to 24h
  // later, so they cannot live in the request scope.
  const pendingImages = new Map()
  const ready = ensureBaseDirs(dirs)
  const catalog = new Catalog({
    dataDir: dirs.dataDir,
    getVault: getVaultInfo,
    listPapers: listMetaRecords,
    updatePaper: async (id, values) => {
      const meta = await loadMeta(id)
      const fields = ['title', 'tags', 'authors', 'year', 'venue', 'doi']
      const manual = fields.filter((field) => Object.hasOwn(values, field))
      meta.catalogManualFields = [...new Set([...(meta.catalogManualFields || []), ...manual])]
      for (const key of [...fields, 'vaultPath', 'fileName', 'vaultExists', 'summaryPath', 'readerNotePath', 'readerNoteRelative']) {
        if (Object.hasOwn(values, key)) meta[key] = values[key]
      }
      await saveMeta(meta)
    },
  })
  const reviewSource = createLiteratureReviewSource(catalog)
  const managementApi = createManagementApi({ catalog, readBody: readJsonBody, json })
  // Load the saved model preference once the data directory exists. Calls that
  // arrive before it settles simply use the deployment config.
  const preferenceReady = ready
    .then(() => readPreference(dirs.dataDir))
    .then((preference) => ai.setPreference(preference))
    .catch(() => undefined)
  // Two papers can be translated in parallel (one ask per paper is allowed), so
  // serialize read-modify-write cycles on the shared vocabulary note.
  let wordNoteQueue = Promise.resolve()

  function recordWordSerialized(options) {
    const run = wordNoteQueue.then(
      () => recordWord(options),
      () => recordWord(options),
    )
    wordNoteQueue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
  let vaultInfoPromise

  async function getVaultInfo() {
    if (!vaultInfoPromise) {
      vaultInfoPromise = detectVault(config)
        .then((vault) => {
          if (!vault) return undefined
          return {
            ...vault,
            path: path.resolve(vault.path),
          }
        })
        .catch(() => undefined)
    }
    return vaultInfoPromise
  }

  async function sourcePathFor(meta, dir) {
    if (meta.vaultPath) {
      const vault = await getVaultInfo()
      if (vault) {
        try {
          const abs = safeVaultPath(vault.path, meta.vaultPath)
          const info = await stat(abs).catch(() => undefined)
          if (info?.isFile()) {
            meta.vaultExists = true
            return abs
          }
        } catch {
          // fall through to the legacy local copy
        }
      }
      meta.vaultExists = false
    }
    return path.join(dir, 'source.pdf')
  }

  function paperDirOf(id) {
    return safePaperDir(dirs, id)
  }

  async function loadMeta(id) {
    await ready
    if (metaCache.has(id)) return metaCache.get(id)
    const dir = paperDirOf(id)
    const meta = await readJson(path.join(dir, 'meta.json'))
    if (!meta) throw new HttpError(404, '文献不存在')
    metaCache.set(id, meta)
    return meta
  }

  async function saveMeta(meta) {
    meta.updatedAt = nowIso()
    metaCache.set(meta.id, meta)
    const dir = paperDirOf(meta.id)
    await writeJson(path.join(dir, 'meta.json'), meta)
    return meta
  }

  async function loadText(id) {
    const dir = paperDirOf(id)
    return readJson(path.join(dir, 'text.json'))
  }

  async function saveText(id, textState) {
    const dir = paperDirOf(id)
    textState.chars = textState.pages.reduce((sum, page) => sum + (page.text || '').trim().length, 0)
    await writeJson(path.join(dir, 'text.json'), textState)
    return textState
  }

  async function loadChat(id) {
    const dir = paperDirOf(id)
    const value = await readJson(path.join(dir, 'chat.json'), [])
    return Array.isArray(value) ? value : []
  }

  async function saveChat(id, messages) {
    const dir = paperDirOf(id)
    await writeJson(path.join(dir, 'chat.json'), messages)
  }

  async function loadAnnotations(id) {
    const dir = paperDirOf(id)
    const value = await readJson(path.join(dir, 'annotations.json'), { strokes: [] })
    return Array.isArray(value?.strokes) ? value : { strokes: [] }
  }

  async function saveAnnotations(id, strokes) {
    const dir = paperDirOf(id)
    await writeJson(path.join(dir, 'annotations.json'), { strokes, updatedAt: nowIso() })
  }

  // ---- study-note helpers (spec §7) -------------------------------------

  async function loadNoteAnnotations(id) {
    return readSummaryAnnotations(paperDirOf(id))
  }

  async function noteState(id) {
    const dir = paperDirOf(id)
    const summary = await readSummary(dir)
    const annotations = await readSummaryAnnotations(dir)
    return { dir, ...summary, annotations }
  }

  /**
   * Mirror the local body into the Obsidian note. A missing vault is not an
   * error: the local copy stays authoritative and the failure is reported.
   */
  async function syncNoteToVault(meta, markdown) {
    const dir = paperDirOf(meta.id)
    const tags = mergeTags(meta.tags, ['文献阅读'])
    try {
      const vault = await getVaultInfo()
      if (!vault) throw new Error('未找到 Obsidian 库，请在插件配置里填写 obsidianVault')
      const existing = Boolean(meta.summaryPath) && existsSync(meta.summaryPath)
      if (existing) {
        const note = await updateSummaryNote({ vault, config, meta, body: markdown, tags })
        meta.storageMode = 'obsidian'
        meta.syncState = 'synced'
        return { notePath: note.path, noteRelative: note.relative, noteCreated: false, noteError: '' }
      }
      // A fresh note gets the full source frontmatter, not just the tags.
      const sourcePdf = await sourcePathFor(meta, dir).catch(() => '')
      const note = await writeSummaryNote({
        vault,
        config,
        meta,
        body: markdown,
        tags,
        pdfPath: sourcePdf && existsSync(sourcePdf) ? sourcePdf : path.join(dir, 'source.pdf'),
      })
      meta.summaryPath = note.path
      meta.storageMode = 'obsidian'
      meta.syncState = 'synced'
      return { notePath: note.path, noteRelative: note.relative, noteCreated: true, noteError: '' }
    } catch (error) {
      meta.storageMode = meta.vaultPath ? 'obsidian' : 'local'
      meta.syncState = 'local-only'
      return {
        notePath: meta.summaryPath || '',
        noteRelative: '',
        noteCreated: false,
        noteError: errorMessage(error),
      }
    }
  }

  /**
   * Refresh meta and mirror an already-written body into Obsidian. Used by
   * every mutation so the local file, the note and `meta.json` never drift.
   */
  async function finishWrittenNote(meta, markdown, written) {
    meta.summaryUpdatedAt = written.updatedAt
    meta.summaryVersion = written.version
    meta.summaryFigureCount = countNoteFigures(markdown)
    const synced = await syncNoteToVault(meta, markdown)
    if (!meta.summarizedAt) meta.summarizedAt = written.updatedAt
    await saveMeta(meta).catch(() => {})
    return { ...written, ...synced }
  }

  /** Write the local body (snapshotting the old one), then finish the sync. */
  async function persistNoteBody(meta, markdown, options = {}) {
    // Sample the vault *before* the local write: afterwards both mtimes are
    // ours and the comparison would always look clean. Obsidian is read-only
    // for us, so a note newer than `summary.md` means a hand edit is about to
    // be replaced — we still honour the save, but say so in the response.
    const before = await vaultState(meta).catch(() => ({ vaultModified: false }))
    const written = await writeSummary(paperDirOf(meta.id), markdown, {
      source: options.source || 'manual',
      label: options.label || '',
    })
    const done = await finishWrittenNote(meta, markdown, written)
    return { ...done, vaultOverwritten: Boolean(before.vaultModified) }
  }

  /** Re-anchor annotations after the body changed, persisting the result. */
  async function reanchorNote(id, markdown) {
    const dir = paperDirOf(id)
    const existing = await readSummaryAnnotations(dir)
    const anchored = anchorAnnotations(markdown, existing)
    const saved = await writeSummaryAnnotations(dir, anchored.annotations)
    return { annotations: saved.annotations, anchors: anchored, lost: anchored.orphans }
  }

  /** Note metadata for the GET /summary payload. */
  async function noteInfo(meta) {
    const notePath = meta.summaryPath || ''
    const exists = Boolean(notePath) && existsSync(notePath)
    let relative = ''
    if (exists) {
      const vault = await getVaultInfo()
      if (vault) relative = path.relative(vault.path, notePath).split(path.sep).join('/')
    }
    return { path: notePath, relative, exists }
  }

  /**
   * Compare the vault note's mtime with the local body's. The plugin is the
   * only writer; Obsidian is read-only (user decision), so a note that is
   * clearly newer than `summary.md` can only come from a hand edit there.
   * Any stat failure answers "not modified" — a GET must never fail over this.
   */
  async function vaultState(meta, localUpdatedAt) {
    const notePath = meta.summaryPath || ''
    const blank = { vaultModified: false, vaultUpdatedAt: '', localUpdatedAt: localUpdatedAt || '' }
    if (!notePath) return blank
    const [noteStat, localStat] = await Promise.all([
      stat(notePath).catch(() => undefined),
      stat(summaryPath(paperDirOf(meta.id))).catch(() => undefined),
    ])
    if (!noteStat?.isFile()) return blank
    const vaultUpdatedAt = noteStat.mtime.toISOString()
    const localTime = localStat?.isFile() ? localStat.mtime.getTime() : 0
    return {
      vaultModified: vaultIsNewer(noteStat.mtime.getTime(), localTime),
      vaultUpdatedAt,
      localUpdatedAt: localStat?.isFile() ? localStat.mtime.toISOString() : localUpdatedAt || '',
    }
  }

  /** Pending image records expire after 24h; drop stale entries lazily. */
  function pendingImageFor(imageId, id) {
    const record = pendingImages.get(String(imageId || ''))
    if (!record) throw new HttpError(404, '图片已过期，请重新插入')
    if (Date.now() - record.createdAt > PENDING_IMAGE_TTL) {
      pendingImages.delete(record.imageId)
      throw new HttpError(404, '图片已过期，请重新插入')
    }
    if (record.paperId !== id) throw new HttpError(404, '图片已过期，请重新插入')
    return record
  }

  /**
   * Copy one local figure into the vault attachment folder. A missing vault is
   * not an error: the note keeps the relative link and the local copy.
   *
   * Spec §7.8b: the summary's images live in `_附件/<id>/图/` next to the PDF,
   * and the link in the note says the same thing — otherwise the preview route
   * (which reads the local copy) hides the breakage until Obsidian is opened.
   */
  async function mirrorFigureToVault(id, name, meta) {
    const vault = await getVaultInfo()
    if (!vault?.path) return { copied: false, reason: '未找到 Obsidian 库' }
    try {
      const folder = readerNoteFolder({
        meta: meta || { id },
        notesFolder: config.notesFolder,
      })
      await copyFigureToVault({
        vaultPath: vault.path,
        notesFolder: folder,
        paperId: id,
        localFile: path.join(figureDir(paperDirOf(id)), name),
        name,
        sub: '图',
      })
      return { copied: true, reason: '' }
    } catch (error) {
      return { copied: false, reason: errorMessage(error) }
    }
  }

  // ---- reader note helpers (docs/reader-note-spec.md §1, §3, §14.6) -------

  function readerNoteHistoryDir(id) {
    return path.join(paperDirOf(id), READER_NOTE_HISTORY_DIR)
  }

  /**
   * The note lives next to the PDF (spec §1). Without a usable vault there is
   * nowhere to put it, so every write path answers 400 with the documented
   * wording (spec §3.2, §10: unconfigured, missing or not a directory).
   */
  async function usableVaultPath() {
    const vault = await getVaultInfo()
    if (!vault?.path) return ''
    const info = await stat(vault.path).catch(() => undefined)
    return info?.isDirectory() ? vault.path : ''
  }

  async function readerNoteVaultPath() {
    const vaultPath = await usableVaultPath()
    if (!vaultPath) throw new HttpError(400, '未找到 Obsidian 库')
    return vaultPath
  }

  /** Resolve the note path for a paper inside the current vault. */
  async function resolveNoteFor(meta) {
    const vaultPath = await readerNoteVaultPath()
    const resolved = await resolveReaderNotePath({
      vaultPath,
      notesFolder: config.notesFolder,
      meta,
    })
    return { vaultPath, ...resolved }
  }

  /** Persist `meta.readerNotePath` / `meta.readerNoteRelative` (spec §12.5). */
  async function rememberReaderNote(meta, resolved) {
    let changed = false
    if (resolved?.path && meta.readerNotePath !== resolved.path) {
      meta.readerNotePath = resolved.path
      changed = true
    }
    if (resolved?.relative !== undefined && meta.readerNoteRelative !== resolved.relative) {
      meta.readerNoteRelative = resolved.relative
      changed = true
    }
    if (changed) await saveMeta(meta).catch(() => {})
  }

  /** Keep `meta.readerNoteOpen` in step with the stored question list. */
  async function setReaderNoteOpen(meta, questions) {
    const open = (Array.isArray(questions) ? questions : []).filter(
      (item) => item && item.status === 'open',
    ).length
    if (meta.readerNoteOpen !== open) {
      meta.readerNoteOpen = open
      await saveMeta(meta).catch(() => {})
    }
  }

  function openQuestionCount(questions) {
    return (Array.isArray(questions) ? questions : []).filter((item) => item && item.status === 'open')
      .length
  }

  /**
   * Re-anchor `open` questions against the body and persist any status change
   * (§3.9). A quote that no longer exists turns into `orphan` while keeping the
   * text, so the reader can still repair it by hand.
   */
  async function anchorNoteQuestions(id, body, stored) {
    const base = Array.isArray(stored) ? stored : await readQuestions(paperDirOf(id))
    if (!base.length || !body) return base
    const anchored = normalizeQuestions(base, body, base)
    if (JSON.stringify(anchored) !== JSON.stringify(base)) {
      await writeQuestions(paperDirOf(id), anchored).catch(() => {})
    }
    return anchored
  }

  /** Shape shared by GET/POST /reader-note; `exists:false` per spec §3.1. */
  function readerNotePayload(meta, questions) {
    return {
      exists: false,
      path: '',
      relative: '',
      markdown: '',
      hash: '',
      updatedAt: '',
      entryCount: 0,
      questions,
      historyStamp: '',
      // §14.6: a recorded path that no longer exists means the file was deleted
      // outside the plugin; the client asks once before re-creating it.
      ...(meta.readerNotePath && !existsSync(meta.readerNotePath)
        ? { lostPath: meta.readerNotePath }
        : {}),
    }
  }

  /**
   * Read + re-anchor the note for one paper. Returns `null` when the file does
   * not exist (which is not an error: the client shows 「建立笔记」).
   */
  async function loadReaderNote(meta) {
    const resolved = await resolveNoteFor(meta)
    const file = await readReaderNoteFile({ path: resolved.path })
    return { resolved, file }
  }

  /**
   * Crop one figure out of the PDF. Returns the stored name, or a readable
   * failure reason. Never throws: one bad figure must not stop the others.
   */
  async function captureFigure(meta, dir, pdf, placeholder, signal) {
    const page = Number(placeholder?.page)
    if (!Number.isInteger(page) || page < 1) return { ok: false, reason: '页码无效' }
    if (meta.pageCount && page > meta.pageCount) {
      return { ok: false, reason: `第 ${page} 页超出文献范围` }
    }
    try {
      const pageFile = await ensurePageImage(pdf, dir, page, { config })
      const pageImage = { data: await readFile(pageFile), page, mediaType: 'image/jpeg' }
      const pageSize = await pageSizePoints(pdf, page, { config }).catch(() => undefined)
      const located = await ai.locateFigure({
        meta,
        pageImage,
        caption: placeholder.caption || '',
        hint: placeholder.hint || '',
        pageSize,
        signal,
      })
      if (!located?.found || !Array.isArray(located.bbox)) {
        return { ok: false, reason: located?.note || '没有在页面上找到这张图' }
      }
      const size = pageSize || (await pageSizePoints(pdf, page, { config }))
      const pixels = bboxToPixels({
        widthPt: size.width,
        heightPt: size.height,
        dpi: FIGURE_DPI,
        bboxNorm: located.bbox,
      })
      if (!pixels) return { ok: false, reason: '框选范围无效' }
      let index = 1
      let name = autoFigureName(page, index)
      const outDir = figureDir(dir)
      while (existsSync(path.join(outDir, name))) {
        index += 1
        if (index > 99) return { ok: false, reason: '这一页的图片太多' }
        name = autoFigureName(page, index)
      }
      await cropPageRegion(pdf, path.join(outDir, name), page, located.bbox, {
        dpi: FIGURE_DPI,
        config,
      })
      const mirrored = await mirrorFigureToVault(meta.id, name, meta)
      return {
        ok: true,
        name,
        page,
        // The raw label the vision model gave ("图 3"). The caller decides
        // which caption wins (spec §3.2: the placeholder's own caption does).
        label: located.label || '',
        note: mirrored.copied ? '' : mirrored.reason,
      }
    } catch (error) {
      return { ok: false, reason: errorMessage(error) }
    }
  }

  /**
   * Replace every pending `[[FIGURE: ...]]` placeholder with either an image
   * block or a "not captured" callout. Offsets are taken from one body and
   * applied from the end, so a later failure never shifts an earlier range.
   */
  async function resolveFigures(meta, dir, markdown, placeholders, onProgress, signal) {
    const items = Array.isArray(placeholders) && placeholders.length
      ? placeholders
      : findFigurePlaceholders(markdown)
    const created = []
    const failed = []
    if (items.length === 0) return { markdown, created, failed, total: 0 }
    const pdf = await sourcePathFor(meta, dir).catch(() => '')
    if (!pdf || !existsSync(pdf)) {
      const reason = 'PDF 文件不存在，无法自动截取图片'
      for (const placeholder of items) {
        failed.push({ page: placeholder.page, caption: placeholder.caption, reason })
        onProgress?.(placeholder, false, reason, '')
      }
      const replacements = items.map((placeholder) => ({
        start: placeholder.start,
        end: placeholder.end,
        replacement: figureFailureMarkdown(placeholder.caption, placeholder.page),
      }))
      const applied = applyReplacements(markdown, replacements)
      return { markdown: applied.text, created, failed, total: items.length }
    }
    const replacements = []
    for (let index = 0; index < items.length; index += 1) {
      const placeholder = items[index]
      onProgress?.(placeholder, null, '', '')
      const result = await captureFigure(meta, dir, pdf, placeholder, signal)
      if (result.ok) {
        // Spec §3.2: the caption of a captured figure comes from the
        // placeholder the note author wrote, not from the vision model's short
        // label. `result.label` is only the fallback for an empty caption.
        const caption = placeholder.caption || result.label || ''
        created.push({ name: result.name, page: result.page, caption })
        replacements.push({
          start: placeholder.start,
          end: placeholder.end,
          replacement: figureMarkdownFor(meta.id, result.name, caption, result.page),
        })
        onProgress?.(placeholder, true, '', result.name)
      } else {
        failed.push({ page: placeholder.page, caption: placeholder.caption, reason: result.reason })
        replacements.push({
          start: placeholder.start,
          end: placeholder.end,
          replacement: figureFailureMarkdown(placeholder.caption, placeholder.page),
        })
        onProgress?.(placeholder, false, result.reason, '')
      }
    }
    const applied = applyReplacements(markdown, replacements)
    return { markdown: applied.text, created, failed, total: items.length }
  }

  /**
   * SSE helper: send figure progress for one placeholder. `index` is 0-based
   * and `total` rides along so the client can render "i/N" without guessing.
   */
  function figureProgressSender(sse, total) {
    let index = 0
    return (placeholder, ok, reason, name) => {
      if (ok === null) {
        sse.send({ type: 'status', label: `正在截取第 ${index + 1}/${total} 张图…` })
        return
      }
      sse.send({
        type: 'figure',
        index,
        total,
        page: placeholder?.page || 0,
        ok: Boolean(ok),
        name: name || '',
        reason: reason || '',
      })
      index += 1
    }
  }

  async function setProgress(meta, label, done = 0, total = 1) {
    meta.progress = { label, done, total }
    await saveMeta(meta)
  }

  async function ensureSourceReady(meta, dir) {
    const pdf = await sourcePathFor(meta, dir)
    const info = await stat(pdf).catch(() => undefined)
    if (!info || info.size < 100) {
      throw new Error(
        meta.vaultPath
          ? `Obsidian 中的 PDF 已移动或不存在：${meta.vaultPath}`
          : 'PDF 文件不存在或已损坏',
      )
    }
    if (!meta.pageCount) {
      try {
        const details = await pdfInfo(pdf, config)
        if (details.pages > 0) meta.pageCount = details.pages
      } catch {
        // page count can also come from pdftotext
      }
    }
    return pdf
  }

  async function ensureContentIdentity(meta, dir) {
    const pdf = await sourcePathFor(meta, dir)
    if (!existsSync(pdf)) return
    if (meta.vaultPath) {
      if (!meta.sha256) {
        meta.sha256 = await sha256File(pdf)
        await saveMeta(meta)
      }
      return
    }
    if (meta.sha256 && meta.sourceAsset) return
    const sha256 = await sha256File(pdf)
    const assetDir = path.join(dirs.dataDir, 'assets', sha256.slice(0, 2))
    await mkdir(assetDir, { recursive: true })
    const assetPath = path.join(assetDir, `${sha256}.pdf`)
    if (!existsSync(assetPath)) {
      try {
        await link(pdf, assetPath)
      } catch {
        await copyFile(pdf, assetPath)
      }
    }
    meta.sha256 = sha256
    meta.sourceAsset = path.relative(dirs.dataDir, assetPath).split(path.sep).join('/')
    await saveMeta(meta)
  }

  async function ensureCover(meta, dir, pdf) {
    await Promise.allSettled([
      ensurePageImage(pdf, dir, 1, { thumb: true, config }),
      ensurePageImage(pdf, dir, 1, { config }),
    ])
  }

  async function ocrOne(meta, page, pdf, dir, signal, state) {
    const file = await ensurePageImage(pdf, dir, page.n, { dpi: 168, quality: 86, config })
    const data = await readFile(file)
    const result = await ai.ocrPageBatch([{ n: page.n, data }], signal)
    const text = String(result[0]?.text || '').trim()
    page.text = text
    page.ocr = true
    page.ocrAt = nowIso()
    state.done += 1
    delete page.ocrError
  }

  async function ocrPaper(meta, textState, pdf, dir, signal) {
    const pages = textState.pages
    const needed = pages.filter(
      (page) => page.ocr !== true && (page.text || '').trim().length < 30,
    )
    if (needed.length === 0) {
      textState.ocrComplete = true
      await saveText(meta.id, textState)
      return textState
    }
    meta.phase = 'ocr'
    meta.ocrTotal = needed.length
    meta.ocrDone = 0
    meta.ocrError = ''
    await setProgress(meta, `扫描版识别 0/${needed.length} 页…`, 0, needed.length)
    const state = { done: 0, failed: 0, cursor: 0 }
    const worker = async () => {
      while (state.cursor < needed.length) {
        if (signal.aborted) throw new Error('已取消')
        const batch = needed.slice(state.cursor, state.cursor + 2)
        state.cursor += batch.length
        let images
        try {
          images = []
          for (const page of batch) {
            const file = await ensurePageImage(pdf, dir, page.n, { dpi: 168, quality: 86, config })
            images.push({ n: page.n, data: await readFile(file) })
          }
          const results = await ai.ocrPageBatch(images, signal)
          const missing = []
          for (const page of batch) {
            const hit = results.find((item) => item.n === page.n)
            if (hit && hit.text.trim().length > 0) {
              page.text = hit.text.trim()
              page.ocr = true
              page.ocrAt = nowIso()
              delete page.ocrError
              state.done += 1
            } else if (hit) {
              page.text = ''
              page.ocr = true
              page.ocrAt = nowIso()
              state.done += 1
            } else {
              missing.push(page)
            }
          }
          for (const page of missing) {
            try {
              await ocrOne(meta, page, pdf, dir, signal, state)
            } catch (error) {
              if (signal.aborted) throw error
              page.ocrError = errorMessage(error)
              state.failed += 1
            }
          }
        } catch (error) {
          if (signal.aborted) throw error
          for (const page of batch) {
            try {
              await ocrOne(meta, page, pdf, dir, signal, state)
            } catch (inner) {
              if (signal.aborted) throw inner
              page.ocrError = errorMessage(inner)
              state.failed += 1
            }
          }
        }
        await saveText(meta.id, textState)
        meta.ocrDone = state.done
        meta.chars = textState.chars
        await setProgress(meta, `扫描版识别 ${state.done}/${needed.length} 页…`, state.done, needed.length)
      }
    }
    await Promise.all([worker(), worker()])
    textState.ocrComplete = true
    await saveText(meta.id, textState)
    meta.chars = textState.chars
    meta.ocrDone = state.done
    if (state.failed > 0) {
      meta.ocrError = `${state.failed} 页识别失败，可稍后重试`
    }
    return textState
  }

  async function analyzePaper(meta, textState, dir, signal, forceAnalysis) {
    const pages = textState.pages
    const chars = pages.reduce((sum, page) => sum + (page.text || '').trim().length, 0)
    meta.chars = chars
    if (chars < 40) {
      meta.analysisReady = false
      meta.analysisError =
        meta.ocrError ||
        '这篇 PDF 没有可提取的正文。扫描版可以用框选截图提问，但暂时无法自动通读和生成完整总结。'
      meta.status = 'ready'
      meta.phase = 'done'
      meta.progress = null
      await saveMeta(meta)
      return
    }
    const analysisPath = path.join(dir, 'analysis.md')
    let memo = ''
    if (!forceAnalysis) {
      try {
        memo = await readFile(analysisPath, 'utf8')
      } catch {
        memo = ''
      }
    }
    if (!memo.trim()) {
      meta.phase = 'analyze'
      await setProgress(meta, 'AI 正在通读全文…', 0, 1)
      const result = await ai.analyze(
        meta,
        pages,
        (label) => {
          meta.progress = { label, done: 0, total: 1 }
          saveMeta(meta).catch(() => {})
        },
        signal,
      )
      memo = result.memo
      if (!memo.trim()) throw new Error('AI 没有返回有效的阅读备忘')
      await writeFileAtomic(analysisPath, `${memo.trim()}\n`)
      meta.extractedMetadata = result.metadata
      meta.originalTitle = result.metadata.title || meta.originalTitle || meta.title
      const manual = new Set(meta.catalogManualFields || [])
      if (!manual.has('title')) meta.title = result.metadata.title || meta.title
      if (!manual.has('authors')) meta.authors = result.metadata.authors?.length ? result.metadata.authors : meta.authors || []
      if (!manual.has('year')) meta.year = result.metadata.year || meta.year || null
      if (!manual.has('venue')) meta.venue = result.metadata.venue || meta.venue || ''
      if (!manual.has('doi')) meta.doi = result.metadata.doi || meta.doi || ''
      meta.abstract = result.metadata.abstract || meta.abstract || ''
      meta.keywords = result.metadata.keywords?.length ? result.metadata.keywords : meta.keywords || []
      if (!manual.has('tags')) meta.tags = mergeTags(meta.tags, result.metadata.tags, result.metadata.keywords)
      meta.tldr = result.tldr
    } else {
      meta.analysisReady = true
      if (!meta.tldr) meta.tldr = memo.replace(/\s+/g, ' ').slice(0, 320)
    }
    if (forceAnalysis || !Array.isArray(meta.outline) || meta.outline.length === 0) {
      try {
        meta.progress = { label: '正在识别章节结构…', done: 0, total: 1 }
        await saveMeta(meta)
        meta.outline = await ai.buildOutline(meta, pages, signal)
      } catch (error) {
        if (signal.aborted) throw error
        meta.outline = forceAnalysis ? [] : Array.isArray(meta.outline) ? meta.outline : []
      }
    }
    meta.analysisReady = true
    meta.analysisError = ''
    meta.status = 'ready'
    meta.phase = 'done'
    meta.progress = null
    await saveMeta(meta)
  }

  async function processPaper(id, options = {}) {
    const meta = await loadMeta(id)
    const dir = paperDirOf(id)
    const controller = new AbortController()
    controllers.set(id, controller)
    const signal = controller.signal
    try {
      meta.status = 'processing'
      meta.error = ''
      meta.phase = 'extract'
      meta.analysisError = ''
      await setProgress(meta, '正在解析 PDF 页面…', 0, 1)
      const pdf = await ensureSourceReady(meta, dir)
      await ensureContentIdentity(meta, dir)
      await ensureCover(meta, dir, pdf)
      let textState = await loadText(id)
      if (!textState || !Array.isArray(textState.pages) || textState.pages.length === 0) {
        const pages = await extractPdfText(pdf, meta.pageCount || 0, config)
        if (!meta.pageCount) meta.pageCount = pages.length
        textState = {
          pages,
          scanned: looksScanned(pages),
          ocrComplete: false,
          chars: pages.reduce((sum, page) => sum + (page.text || '').trim().length, 0),
        }
        await saveText(id, textState)
      }
      if (!meta.pageCount) meta.pageCount = textState.pages.length
      while (textState.pages.length < meta.pageCount) {
        textState.pages.push({ n: textState.pages.length + 1, text: '', ocr: false })
      }
      textState.scanned = Boolean(textState.scanned || looksScanned(textState.pages))
      meta.scanned = textState.scanned
      meta.chars = textState.pages.reduce((sum, page) => sum + (page.text || '').trim().length, 0)
      await saveMeta(meta)
      if (textState.scanned) {
        textState = await ocrPaper(meta, textState, pdf, dir, signal)
      }
      await analyzePaper(meta, textState, dir, signal, Boolean(options.forceAnalysis))
    } catch (error) {
      if (signal.aborted) return
      meta.status = 'error'
      meta.phase = 'error'
      meta.progress = null
      meta.error = errorMessage(error)
      await saveMeta(meta).catch(() => {})
      throw error
    } finally {
      controllers.delete(id)
    }
  }

  function startProcessing(id, options = {}) {
    if (jobs.has(id)) return jobs.get(id)
    const job = processPaper(id, options)
      .catch((error) => {
        console.warn('[literature-reader] processing failed', id, errorMessage(error))
      })
      .finally(() => {
        jobs.delete(id)
      })
    jobs.set(id, job)
    return job
  }

  async function listMetaRecords() {
    await ready
    const entries = await readdir(dirs.papersDir, { withFileTypes: true }).catch(() => [])
    const records = []
    const papers = entries.filter((entry) => entry.isDirectory() && PAPER_ID_RE.test(entry.name))
    for (let offset = 0; offset < papers.length; offset += 8) {
      const results = await Promise.allSettled(
        papers.slice(offset, offset + 8).map((entry) =>
          readJson(path.join(dirs.papersDir, entry.name, 'meta.json')),
        ),
      )
      for (const result of results) {
        if (result.status === 'rejected') throw result.reason
        if (result.value?.id) records.push(result.value)
      }
    }
    records.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    return records
  }

  async function listLibrary() {
    const records = await listMetaRecords()
    return records.map(publicPaper)
  }

  async function buildVaultLibrary(refresh = false) {
    const vault = await getVaultInfo()
    if (!vault) {
      const records = await listMetaRecords()
      return {
        available: false,
        reason: '未找到 Obsidian 库。当前可继续使用本地阅读缓存；配置 vault 后才能同步文件与笔记。',
        vault: null,
        folders: [],
        root: '',
        pdfs: [],
        notes: [],
        detached: records.map((meta) => ({
          paperId: meta.id,
          title: meta.title || meta.fileName,
          fileName: meta.fileName || '',
          status: meta.status || 'ready',
          analysisReady: Boolean(meta.analysisReady),
          hasSummary: Boolean(meta.summaryPath && existsSync(meta.summaryPath)),
          vaultPath: meta.vaultPath || '',
          vaultMissing: Boolean(meta.vaultPath) && meta.vaultExists === false,
        })),
        stats: { pdfs: 0, notes: 0, folders: 0, linked: 0 },
        defaultFolder: '',
      }
    }
    /** Absolute path → POSIX path relative to the vault ('' when outside). */
    const vaultRelOf = (abs) => {
      if (!abs) return ''
      const rel = path.relative(vault.path, abs)
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return ''
      return rel.split(path.sep).join('/')
    }
    const scan = await scanVault(vault.path, { refresh })
    const records = await listMetaRecords()
    const byVault = new Map(records.filter((meta) => meta.vaultPath).map((meta) => [meta.vaultPath, meta]))
    const matched = new Set()
    const pdfs = []
    for (const pdf of scan.pdfs) {
      const record = byVault.get(pdf.rel)
      if (record) matched.add(record.id)
      const title =
        (pdf.noteExplicitTitle && pdf.noteTitle && pdf.noteTitle.trim()) ||
        record?.title ||
        (record?.fileName ? record.fileName.replace(/\.pdf$/i, '') : pdf.title)
      const tags = uniqueTags(pdf.tags, record?.tags)
      // §12.4: report the two companions explicitly so the client can group the
      // tripod without guessing from note titles. Empty string = not present.
      const summaryRel =
        record?.summaryPath && existsSync(record.summaryPath)
          ? vaultRelOf(record.summaryPath)
          : ''
      const readerNoteRel =
        record?.readerNotePath && existsSync(record.readerNotePath)
          ? vaultRelOf(record.readerNotePath)
          : ''
      pdfs.push({
        ...pdf,
        title,
        tags,
        relatedNotes: relatedNotesForPdf(pdf, scan.notes),
        paperId: record?.id || '',
        status: record?.status || 'unread',
        analysisReady: Boolean(record?.analysisReady),
        hasSummary: Boolean(record?.summaryPath && existsSync(record.summaryPath)),
        summaryPath: record?.summaryPath || '',
        summaryRel,
        readerNoteRel,
        progress: record?.progress || null,
        scanned: Boolean(record?.scanned),
        chars: record?.chars || 0,
        createdAt: record?.createdAt || '',
        updatedAt: record?.updatedAt || '',
      })
    }
    const detached = records
      .filter((meta) => !matched.has(meta.id))
      .map((meta) => ({
        paperId: meta.id,
        title: meta.title || meta.fileName,
        fileName: meta.fileName || '',
        status: meta.status || 'ready',
        analysisReady: Boolean(meta.analysisReady),
        hasSummary: Boolean(meta.summaryPath && existsSync(meta.summaryPath)),
        vaultPath: meta.vaultPath || '',
        vaultMissing: Boolean(meta.vaultPath) && meta.vaultExists === false,
      }))
      .filter((item) => item.vaultPath || item.status !== 'ready')
    return {
      available: true,
      vault: { path: vault.path, name: vault.name, isVault: Boolean(vault.isVault) },
      folders: scan.folders,
      root: scan.root,
      pdfs: pdfs.sort(
        (a, b) =>
          String(a.folder).localeCompare(String(b.folder), 'zh-CN') ||
          String(a.title).localeCompare(String(b.title), 'zh-CN'),
      ),
      notes: scan.notes,
      detached,
      stats: {
        pdfs: pdfs.length,
        notes: scan.notes.length,
        folders: scan.folders.length,
        linked: pdfs.filter((item) => item.paperId).length,
      },
      defaultFolder:
        config.importFolder ||
        (scan.folders.some((folder) => folder.rel === '文献') ? '文献' : ''),
    }
  }

  async function openVaultPdf(rel) {
    const vault = await getVaultInfo()
    if (!vault) throw new HttpError(400, '未找到 Obsidian 库')
    const normalized = normalizeRel(rel)
    const abs = safeVaultPath(vault.path, normalized)
    const info = await stat(abs).catch(() => undefined)
    if (!info?.isFile()) throw new HttpError(404, 'PDF 不存在')
    const sha256 = await sha256File(abs)
    let records = await listMetaRecords()
    let record = records.find((meta) => meta.vaultPath === normalized)
    if (record) {
      if (record.vaultPath !== normalized) {
        record.vaultPath = normalized
        record.vaultExists = true
        await saveMeta(record)
      }
      if (record.status === 'processing' && !jobs.has(record.id)) startProcessing(record.id)
      return publicPaper(record)
    }
    let details = { pages: 0 }
    try {
      details = await pdfInfo(abs, config)
    } catch {
      details = { pages: 0 }
    }
    const scan = await scanVault(vault.path, { refresh: true })
    const pdf = scan.pdfs.find((item) => item.rel === normalized)
    let id = `vault-${createHash('sha1').update(normalized).digest('hex').slice(0, 12)}`
    if (metaCache.has(id) || records.some((meta) => meta.id === id)) {
      id = `${id}-${Date.now().toString(36).slice(-5)}`
    }
    const dir = paperDirOf(id)
    await mkdir(dir, { recursive: true })
    const meta = {
      id,
      title:
        (pdf?.noteExplicitTitle && pdf?.noteTitle) ||
        details.title ||
        pdf?.title ||
        fileStem(normalized),
      fileName: baseNameRel(normalized),
      fileSize: info.size,
      sha256,
      vaultPath: normalized,
      vaultExists: true,
      storageMode: 'obsidian',
      syncState: 'synced',
      sourceAsset: '',
      pageCount: details.pages || 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      status: 'processing',
      phase: 'extract',
      progress: { label: '已打开 vault 文献，准备解析…', done: 0, total: 1 },
      scanned: false,
      chars: 0,
      ocrDone: 0,
      ocrTotal: 0,
      authors: [],
      year: null,
      venue: '',
      doi: '',
      abstract: '',
      keywords: [],
      tags: uniqueTags(pdf?.tags),
      tldr: '',
      outline: [],
      analysisReady: false,
      analysisError: '',
      error: '',
      summaryPath: '',
      summarizedAt: '',
      chatCount: 0,
    }
    await writeJson(path.join(dir, 'meta.json'), meta)
    metaCache.set(id, meta)
    startProcessing(id)
    return publicPaper(meta)
  }

  async function handleAsk(req, res, id) {
    const body = await readJsonBody(req, 12 * 1024 * 1024)
    const meta = await loadMeta(id)
    if (busy.has(id)) throw new HttpError(409, '上一条回答还在生成，请稍候')
    const question = String(body.question || '').trim()
    const action = ['translate', 'explain', 'term', 'points', 'critique', 'ask'].includes(
      String(body.action || ''),
    )
      ? String(body.action)
      : 'ask'
    const currentPage = Math.max(
      1,
      Math.min(meta.pageCount || 1, Number.parseInt(String(body.page || 1), 10) || 1),
    )
    let cropBuffer
    let cropUrl = ''
    if (body.selection?.imageData) {
      const raw = Buffer.from(stripDataUrl(String(body.selection.imageData)), 'base64')
      if (raw.length > 6 * 1024 * 1024) throw new HttpError(413, '框选截图过大')
      const isJpeg = raw[0] === 0xff && raw[1] === 0xd8
      const isPng = raw[0] === 0x89 && raw[1] === 0x50
      if (!isJpeg && !isPng) throw new HttpError(400, '框选截图格式不正确')
      cropBuffer = raw
    }
    if (!question && !cropBuffer) throw new HttpError(400, '请输入问题或框选一段内容')
    const selection = body.selection
      ? {
          page: Math.max(1, Number(body.selection.page) || currentPage),
          quote: String(body.selection.quote || '').slice(0, 5000),
          imageUrl: '',
        }
      : undefined
    const dir = paperDirOf(id)
    if (cropBuffer) {
      const selectionDir = path.join(dir, 'selections')
      await mkdir(selectionDir, { recursive: true })
      const name = `${Date.now()}-${randomUUID().slice(0, 8)}.jpg`
      await writeFile(path.join(selectionDir, name), cropBuffer)
      cropUrl = `${API_PREFIX}/papers/${id}/selection/${name}`
      selection.imageUrl = cropUrl
    }
    const chat = await loadChat(id)
    const history = chat.slice()
    const userMessage = {
      id: randomUUID(),
      role: 'user',
      content: question || '请解释我框选的内容。',
      createdAt: nowIso(),
      page: currentPage,
      selection,
      action,
    }
    chat.push(userMessage)
    await saveChat(id, chat)
    meta.chatCount = chat.length
    await saveMeta(meta)

    const textState = await loadText(id)
    const pages = textState?.pages || []
    const analysis = await readFile(path.join(dir, 'analysis.md'), 'utf8').catch(() => '')
    const controller = new AbortController()
    let finished = false
    const sse = makeSse(res, () => {
      if (!finished) controller.abort()
    })
    busy.add(id)
    let answer = ''
    try {
      sse.send({ type: 'user', message: userMessage })
      let cropRef
      if (cropBuffer) {
        cropRef = await ai.saveCrop(cropBuffer, currentPage).catch(() => undefined)
      }
      // The reply style depends on what was selected. Classifying first keeps
      // a word/phrase answer short and lets a full sentence be translation-only.
      let selectionKind
      if (cropBuffer && action === 'translate') {
        sse.send({ type: 'status', label: '正在识别框选内容…' })
        selectionKind = await ai
          .classifySelection({
            meta,
            pages,
            currentPage,
            quote: selection?.quote || '',
            cropRef,
            signal: controller.signal,
          })
          .catch(() => undefined)
      }
      const result = await ai.answer({
        meta,
        pages,
        analysis,
        history,
        question: question || '请解释我框选的内容，并说明它在论文中的作用。',
        currentPage,
        quote: selection?.quote || '',
        crop: cropBuffer,
        cropRef,
        signal: controller.signal,
        mode: action,
        selectionKind,
        onDelta: (delta) => {
          answer += delta
          sse.send({ type: 'delta', text: delta })
        },
      })
      answer = result
      const assistantMessage = {
        id: randomUUID(),
        role: 'assistant',
        content: answer,
        createdAt: nowIso(),
        page: currentPage,
        citations: extractCitations(answer),
      }
      chat.push(assistantMessage)
      await saveChat(id, chat)
      meta.chatCount = chat.length
      await saveMeta(meta)
      sse.send({ type: 'done', message: assistantMessage })
      // Translated words and phrases are appended to the Obsidian vocabulary
      // note. Duplicates are reported to the client instead of written again.
      if (action === 'translate' && cropBuffer) {
        const shouldRecord =
          isVocabularyKind(selectionKind?.kind) ||
          (!selectionKind?.kind && looksLikeVocabularyAnswer(answer))
        if (shouldRecord) {
          try {
            const vocabulary = extractVocabularyAnswer(
              answer,
              selectionKind?.term || selectionKind?.text || '',
            )
            if (!vocabulary?.term || !vocabulary.translation) {
              sse.send({ type: 'vocab', status: 'skipped', page: currentPage })
            } else {
              const vault = await getVaultInfo()
              if (!vault) throw new Error('未找到 Obsidian 库，无法记录单词')
              const recorded = await recordWordSerialized({
                vault,
                dataDir: dirs.dataDir,
                meta,
                term: vocabulary.term,
                translation: vocabulary.translation,
                noteName: config.wordNote,
              })
              sse.send({ type: 'vocab', ...recorded, page: currentPage })
            }
          } catch (error) {
            sse.send({ type: 'vocab', status: 'error', message: errorMessage(error) })
          }
        }
      }
      finished = true
      sse.end()
    } catch (error) {
      if (controller.signal.aborted) {
        finished = true
        sse.end()
        return
      }
      const message = errorMessage(error)
      if (answer && answer.trim()) {
        const assistantMessage = {
          id: randomUUID(),
          role: 'assistant',
          content: `${answer}\n\n> ⚠️ 回答中断：${message}`,
          createdAt: nowIso(),
          page: currentPage,
          citations: extractCitations(answer),
          error: true,
        }
        chat.push(assistantMessage)
        await saveChat(id, chat)
        meta.chatCount = chat.length
        await saveMeta(meta)
      }
      sse.send({ type: 'error', message })
      finished = true
      sse.end()
    } finally {
      busy.delete(id)
    }
  }

  async function handleExtract(req, res, id) {
    const body = await readJsonBody(req, 2 * 1024 * 1024)
    const meta = await loadMeta(id)
    if (busy.has(id)) throw new HttpError(409, '当前还有回答或提炼正在生成，请稍候')
    const textState = await loadText(id)
    if (!textState?.pages?.length) throw new HttpError(400, '还没有可用的正文，无法提炼章节')
    const total = textState.pages.length
    const start = Math.max(1, Math.min(total, Number.parseInt(String(body.start || 1), 10) || 1))
    const end = Math.max(start, Math.min(total, Number.parseInt(String(body.end || start), 10) || start))
    const title = String(body.title || `第 ${start}-${end} 页`).trim().slice(0, 120)
    const chat = await loadChat(id)
    const history = chat.slice()
    const userMessage = {
      id: randomUUID(),
      role: 'user',
      content: `提炼“${title}”的要点（第 ${start}-${end} 页）`,
      createdAt: nowIso(),
      page: start,
      kind: 'extract-request',
      chapter: { title, start, end },
    }
    chat.push(userMessage)
    await saveChat(id, chat)
    meta.chatCount = chat.length
    await saveMeta(meta)
    const controller = new AbortController()
    let finished = false
    const sse = makeSse(res, () => {
      if (!finished) controller.abort()
    })
    busy.add(id)
    try {
      sse.send({ type: 'user', message: userMessage })
      let bodyText = ''
      const result = await ai.extractSection({
        meta,
        pages: textState.pages,
        start,
        end,
        title,
        signal: controller.signal,
        onDelta: (delta) => {
          bodyText += delta
          sse.send({ type: 'delta', text: delta })
        },
      })
      bodyText = result
      const assistantMessage = {
        id: randomUUID(),
        role: 'assistant',
        content: bodyText,
        createdAt: nowIso(),
        page: start,
        citations: extractCitations(bodyText),
        kind: 'extract',
        chapter: { title, start, end },
      }
      chat.push(assistantMessage)
      await saveChat(id, chat)
      meta.chatCount = chat.length
      await saveMeta(meta)
      sse.send({ type: 'done', message: assistantMessage })
      finished = true
      sse.end()
    } catch (error) {
      if (controller.signal.aborted) {
        finished = true
        sse.end()
        return
      }
      const message = errorMessage(error)
      sse.send({ type: 'error', message })
      finished = true
      sse.end()
    } finally {
      busy.delete(id)
    }
  }

  async function handleOutline(req, res, id) {
    const body = await readJsonBody(req, 1024 * 1024).catch(() => ({}))
    const force = Boolean(body.force)
    const meta = await loadMeta(id)
    if (!force && Array.isArray(meta.outline) && meta.outline.length > 0) {
      json(res, 200, { outline: meta.outline })
      return
    }
    const textState = await loadText(id)
    if (!textState?.pages?.length) throw new HttpError(400, '还没有可用的正文')
    if (busy.has(id)) throw new HttpError(409, '当前模型任务正在进行，请稍候')
    busy.add(id)
    try {
      const outline = await ai.buildOutline(meta, textState.pages, undefined)
      meta.outline = outline
      await saveMeta(meta)
      json(res, 200, { outline })
    } finally {
      busy.delete(id)
    }
  }

  /**
   * POST /papers/:id/summary/prepare — read the vocabulary note and ask the
   * model which of those terms belong in this paper's glossary.
   *
   * Two-phase by design: the summary itself is one long SSE stream, and asking
   * the reader a question halfway through it would need a bidirectional
   * connection that nothing else in this plugin uses. A separate, retryable
   * call keeps the dialog stateless — if it fails or the reader closes the tab,
   * `POST /summary` still runs with whatever glossary it can read itself.
   */
  async function handleSummaryPrepare(req, res, id) {
    const meta = await loadMeta(id)
    const empty = { ok: true, total: 0, include: [], excluded: 0, questions: [] }
    const candidates = await readGlossary({
      vault: await getVaultInfo().catch(() => null),
      config,
      meta,
    }).catch(() => [])
    if (!candidates.length) {
      json(res, 200, empty)
      return
    }
    // Classification is best-effort: a failure falls back to "include
    // everything", which is exactly what single-phase generation used to do.
    const classified = await ai
      .classifyGlossary({ meta, candidates })
      .catch(() => ({ include: candidates, exclude: [], uncertain: [] }))
    const include = Array.isArray(classified?.include) ? classified.include : candidates
    const uncertain = Array.isArray(classified?.uncertain) ? classified.uncertain : []
    const excluded = Array.isArray(classified?.exclude) ? classified.exclude.length : 0
    // `guess: false` means the model leans towards excluding it, so those are
    // the questions worth asking first when the list has to be trimmed.
    const ranked = [...uncertain].sort(
      (a, b) => Number(a?.guess === false ? 0 : 1) - Number(b?.guess === false ? 0 : 1),
    )
    const questions = ranked.slice(0, MAX_GLOSSARY_QUESTIONS).map((item) => ({
      term: String(item?.term || ''),
      translation: String(item?.translation || ''),
      guess: item?.guess !== false,
    }))
    json(res, 200, {
      ok: true,
      total: candidates.length,
      include: include.map((item) => ({
        term: String(item?.term || ''),
        translation: String(item?.translation || ''),
      })),
      excluded,
      questions,
    })
  }

  async function handleSummary(req, res, id) {
    if (busy.has(id)) throw new HttpError(409, '当前还有回答或总结正在生成，请稍候')
    // Read the body before the stream opens: once SSE headers are sent we can
    // no longer answer with a plain 400. An empty body means "no override".
    const body = await readJsonBody(req, 1024 * 1024)
    const override = body?.glossaryOverride === undefined
      ? null
      : normalizeGlossaryOverride(body.glossaryOverride)
    const meta = await loadMeta(id)
    const dir = paperDirOf(id)
    const textState = await loadText(id)
    if (!textState?.pages?.length) throw new HttpError(400, '还没有可用的正文，无法生成总结')
    const chars = textState.pages.reduce((sum, page) => sum + (page.text || '').trim().length, 0)
    if (chars < 40) throw new HttpError(400, '没有可提取的正文，无法生成总结')
    await ensureContentIdentity(meta, dir).catch(() => {})
    const chat = await loadChat(id)
    const analysis = await readFile(path.join(dir, 'analysis.md'), 'utf8').catch(() => '')
    const controller = new AbortController()
    let finished = false
    const sse = makeSse(res, () => {
      if (!finished) controller.abort()
    })
    busy.add(id)
    try {
      sse.send({ type: 'status', label: '正在综合全文和你的提问…' })
      sse.send({ type: 'start' })
      const maxFigures = config.maxSummaryFigures
      // The reader's own lookups carry the terms they actually cared about, so
      // they win over the model's guesses. Failure here is silent by design: a
      // missing or unreadable vocabulary note must not block the summary.
      // An explicit override from the confirm dialog replaces both: the reader
      // already saw and trimmed that list, so re-reading the note would undo it.
      const glossary = override ?? await readGlossary({
        vault: await getVaultInfo().catch(() => null),
        config,
        meta,
      }).catch(() => [])
      const result = await ai.summarize({
        meta,
        pages: textState.pages,
        analysis,
        history: chat,
        signal: controller.signal,
        maxFigures,
        glossary,
      })
      if (!result.body.trim()) throw new Error('AI 没有返回有效的总结内容')
      let body = result.body.trim()
      let figures = []
      let figureFailures = []
      // Crop the placeholders the model asked for before anything is written,
      // so the local copy and the Obsidian note carry the final image links.
      if (maxFigures > 0) {
        const placeholders = findFigurePlaceholders(body)
        if (placeholders.length > 0) {
          sse.send({ type: 'status', label: `正在截取图片（共 ${placeholders.length} 张）…` })
          const resolved = await resolveFigures(
            meta,
            dir,
            body,
            placeholders,
            figureProgressSender(sse, placeholders.length),
          )
          body = resolved.markdown
          figures = resolved.created
          figureFailures = resolved.failed
        }
      }
      const written = await writeSummary(dir, body, { source: 'generate' })
      meta.summaryUpdatedAt = written.updatedAt
      meta.summaryVersion = written.version
      meta.summaryFigureCount = countNoteFigures(body)
      let note
      let openResult
      let openError = ''
      try {
        const vault = await getVaultInfo()
        if (!vault) throw new Error('未找到 Obsidian 库，请在插件配置里填写 obsidianVault')
        const sourcePdf = await sourcePathFor(meta, dir)
        note = await writeSummaryNote({
          vault,
          config,
          meta,
          body,
          tags: result.tags,
          pdfPath: existsSync(sourcePdf) ? sourcePdf : path.join(dir, 'source.pdf'),
        })
        meta.summaryPath = note.path
        meta.summarizedAt = nowIso()
        meta.tags = mergeTags(meta.tags, result.tags, ['文献阅读'])
        if (config.autoOpenObsidian) {
          try {
            openResult = await openInObsidian(vault, note.path)
          } catch (error) {
            openError = errorMessage(error)
          }
        }
      } catch (error) {
        openError = errorMessage(error)
      }
      await saveMeta(meta)
      sse.send({
        type: 'done',
        tags: result.tags,
        chars: body.length,
        path: note?.path || '',
        relative: note?.relative || '',
        obsidianUrl: note ? `${API_PREFIX}/papers/${id}/open-note` : '',
        opened: Boolean(openResult),
        openError,
        hasNote: Boolean(note),
        localSummary: path.join(dir, 'summary.md'),
        version: written.version,
        updatedAt: written.updatedAt,
        figures,
        figureFailures,
      })
      finished = true
      sse.end()
    } catch (error) {
      if (controller.signal.aborted) {
        finished = true
        sse.end()
        return
      }
      sse.send({ type: 'error', message: errorMessage(error) })
      finished = true
      sse.end()
    } finally {
      busy.delete(id)
    }
  }

  /** GET /papers/:id/summary — body + version + annotations + note metadata. */
  async function handleSummaryGet(req, res, id) {
    const meta = await loadMeta(id)
    const state = await noteState(id)
    if (!state.markdown) throw new HttpError(404, '还没有生成总结')
    json(res, 200, {
      markdown: state.markdown,
      path: meta.summaryPath || '',
      updatedAt: state.updatedAt,
      version: state.version,
      annotations: state.annotations,
      note: await noteInfo(meta),
      // Spec §7.1 extension: expose hand edits made in Obsidian, which is
      // read-only for us. Additive only — older clients ignore these.
      ...(await vaultState(meta, state.updatedAt)),
    })
  }

  /** PUT /papers/:id/summary — manual Markdown save with conflict detection. */
  async function handleSummaryPut(req, res, id) {
    const body = await readJsonBody(req, 1024 * 1024)
    const meta = await loadMeta(id)
    const dir = paperDirOf(id)
    const markdown = String(body.markdown ?? '')
    if (!markdown.trim()) throw new HttpError(400, '正文不能为空')
    if (markdown.length > SUMMARY_MAX_CHARS) throw new HttpError(413, '正文不能超过 400KB')
    const current = await readSummary(dir)
    if (!body.force && body.baseVersion && body.baseVersion !== current.version) {
      json(res, 409, {
        error: '笔记已在别处更新',
        conflict: true,
        markdown: current.markdown,
        version: current.version,
      })
      return
    }
    const written = await persistNoteBody(meta, markdown, { source: 'manual' })
    const anchored = await reanchorNote(id, markdown)
    json(res, 200, {
      ok: true,
      markdown,
      version: written.version,
      updatedAt: written.updatedAt,
      notePath: written.notePath,
      noteError: written.noteError,
      historyStamp: written.snapshot || '',
      annotations: anchored.annotations,
      lost: anchored.lost,
      // Additive warning: this save replaced hand edits made in Obsidian. The
      // old body is already in history, so the client can offer a rollback.
      vaultOverwritten: written.vaultOverwritten,
    })
  }

  /** PUT /papers/:id/summary/annotations — clean, re-anchor, persist. */
  async function handleSummaryAnnotationsPut(req, res, id) {
    const body = await readJsonBody(req, 1024 * 1024)
    if (!Array.isArray(body.annotations)) throw new HttpError(400, 'annotations 必须是数组')
    const dir = paperDirOf(id)
    const state = await readSummary(dir)
    if (!state.markdown) throw new HttpError(404, '还没有生成总结')
    const anchored = anchorAnnotations(state.markdown, body.annotations)
    const saved = await writeSummaryAnnotations(dir, anchored.annotations)
    json(res, 200, {
      ok: true,
      annotations: saved.annotations,
      updatedAt: saved.updatedAt,
      orphans: anchored.orphans,
    })
  }

  /** POST /papers/:id/summary/revise — AI revision driven by annotations. */
  async function handleSummaryRevise(req, res, id) {
    const body = await readJsonBody(req, 1024 * 1024)
    if (busy.has(id)) throw new HttpError(409, '当前还有回答或总结正在生成，请稍候')
    const meta = await loadMeta(id)
    const dir = paperDirOf(id)
    const state = await readSummary(dir)
    if (!state.markdown) throw new HttpError(404, '还没有生成总结')
    const instruction = String(body.instruction || '').trim().slice(0, 2000)
    const wantedIds = Array.isArray(body.ids)
      ? body.ids.map((value) => String(value || '').trim()).filter(Boolean)
      : []
    const existing = await readSummaryAnnotations(dir)
    const anchored = anchorAnnotations(state.markdown, existing)
    const openList = anchored.annotations.filter((item) => item.status === 'open')
    const selected = wantedIds.length
      ? openList.filter((item) => wantedIds.includes(item.id))
      : openList.slice()
    if (selected.length === 0 && !instruction) {
      throw new HttpError(400, '没有待应用的标注，也没有补充要求')
    }
    const controller = new AbortController()
    let finished = false
    const sse = makeSse(res, () => {
      if (!finished) controller.abort()
    })
    busy.add(id)
    try {
      sse.send({ type: 'status', label: '正在按你的标注修改…' })
      let answer
      try {
        answer = await ai.reviseNote({
          meta,
          markdown: state.markdown,
          annotations: selected,
          instruction,
          signal: controller.signal,
        })
      } catch (error) {
        if (controller.signal.aborted) {
          finished = true
          sse.end()
          return
        }
        sse.send({ type: 'error', message: errorMessage(error) })
        finished = true
        sse.end()
        return
      }
      const byId = new Map(selected.map((item) => [item.id, item]))
      const replacements = []
      for (const edit of answer.edits || []) {
        const annotation = byId.get(edit.id)
        if (!annotation) continue
        replacements.push({
          id: annotation.id,
          start: annotation.start,
          end: annotation.end,
          // An empty replacement means "delete this fragment", not "skip".
          replacement: String(edit.replacement ?? ''),
          why: edit.why || '',
        })
      }
      const result = applyReplacements(state.markdown, replacements)
      const appliedIds = new Set(result.applied.map((item) => item.id))
      const unresolved = (answer.unresolved || []).filter((item) => byId.has(item.id))
      const unresolvedIds = new Set(unresolved.map((item) => item.id))
      const missed = selected.filter(
        (item) => !appliedIds.has(item.id) && !unresolvedIds.has(item.id),
      )
      const nextRevision = Math.max(0, ...existing.map((item) => Number(item.revision) || 0)) + 1
      const revisionAt = nowIso()
      const nextAnnotations = anchored.annotations.map((item) => {
        if (appliedIds.has(item.id)) {
          const hit = replacements.find((entry) => entry.id === item.id)
          return {
            ...item,
            status: 'resolved',
            resolvedAt: revisionAt,
            revision: nextRevision,
            reply: hit?.why || answer.reply || '已按标注修改',
          }
        }
        if (unresolvedIds.has(item.id)) {
          const hit = unresolved.find((entry) => entry.id === item.id)
          return { ...item, reply: hit?.reason || '无法按要求修改' }
        }
        return item
      })
      let markdown = result.text
      let figures = { created: [], failed: [] }
      let historyStamp = ''
      let vaultOverwritten = false
      const baseVersion = summaryVersion(markdown)
      const placeholders = findFigurePlaceholders(markdown)
      if (placeholders.length > 0 && config.maxSummaryFigures > 0) {
        sse.send({ type: 'status', label: `正在截取图片（共 ${placeholders.length} 张）…` })
        const resolved = await resolveFigures(
          meta,
          dir,
          markdown,
          placeholders,
          figureProgressSender(sse, placeholders.length),
          controller.signal,
        )
        markdown = resolved.markdown
        figures = { created: resolved.created, failed: resolved.failed }
      }
      if (!controller.signal.aborted) {
        const written = await persistNoteBody(meta, markdown, { source: 'revision' })
        historyStamp = written.snapshot || ''
        vaultOverwritten = Boolean(written.vaultOverwritten)
        await writeSummaryAnnotations(dir, nextAnnotations)
      }
      sse.send({
        type: 'done',
        reply: answer.reply || '',
        markdown,
        version: summaryVersion(markdown),
        beforeVersion: state.version,
        baseVersion,
        updatedAt: nowIso(),
        applied: [...appliedIds].map((entry) => {
          const annotation = byId.get(entry)
          const hit = replacements.find((item) => item.id === entry)
          return { id: entry, why: hit?.why || '', quote: annotation?.quote || '' }
        }),
        unresolved: unresolved.map((item) => ({
          id: item.id,
          reason: item.reason,
          quote: byId.get(item.id)?.quote || '',
        })),
        skipped: missed.map((item) => ({ id: item.id, reason: '未返回处理结果' })),
        orphans: anchored.orphans,
        annotations: await loadNoteAnnotations(id),
        figures: { created: figures.created.length, failed: figures.failed.length, items: figures.created },
        figureFailures: figures.failed,
        notePath: meta.summaryPath || '',
        historyStamp,
        // Additive warning, same meaning as in PUT /summary.
        vaultOverwritten,
      })
      finished = true
      sse.end()
    } catch (error) {
      if (controller.signal.aborted) {
        finished = true
        sse.end()
        return
      }
      sse.send({ type: 'error', message: errorMessage(error) })
      finished = true
      sse.end()
    } finally {
      busy.delete(id)
    }
  }

  /** GET /papers/:id/summary/history */
  async function handleSummaryHistory(req, res, id) {
    const meta = await loadMeta(id)
    const versions = await listHistory(paperDirOf(id))
    json(res, 200, {
      versions,
      notePath: meta.summaryPath || '',
      note: await noteInfo(meta),
    })
  }

  /** GET /papers/:id/summary/history/:stamp — read one snapshot, read-only. */
  async function handleSummaryHistoryItem(req, res, id, stamp) {
    // Spec §7.1: a malformed stamp is reported as "not found" too, so the
    // preview route never leaks the difference between bad input and a
    // version that was pruned.
    if (!isHistoryStamp(stamp)) throw new HttpError(404, '历史版本不存在')
    const dir = paperDirOf(id)
    const historyDir = path.join(dir, HISTORY_DIR)
    const file = path.join(historyDir, `${stamp}.md`)
    // The stamp regex already excludes separators; keep the resolved path
    // inside the history directory as a second line of defence.
    if (path.dirname(path.resolve(file)) !== path.resolve(historyDir)) {
      throw new HttpError(404, '历史版本不存在')
    }
    let content
    let info
    try {
      ;[content, info] = await Promise.all([readFile(file, 'utf8'), stat(file)])
    } catch (error) {
      if (error?.code === 'ENOENT') throw new HttpError(404, '历史版本不存在')
      throw error
    }
    const markdown = String(content).replace(/\r\n?/g, '\n')
    json(res, 200, {
      stamp,
      markdown,
      chars: markdown.length,
      updatedAt: info.mtime.toISOString(),
      version: summaryVersion(markdown),
    })
  }

  /**
   * GET /papers/:id/summary/vault-body — the Obsidian note's body, read-only.
   * Lets the client show what a hand edit changed before it is overwritten.
   */
  async function handleSummaryVaultBody(req, res, id) {
    const meta = await loadMeta(id)
    const notePath = meta.summaryPath || ''
    const body = await readNoteBody(notePath)
    if (!body) throw new HttpError(404, 'Obsidian 笔记不存在')
    const info = await stat(notePath).catch(() => undefined)
    json(res, 200, {
      ok: true,
      markdown: body.markdown,
      updatedAt: info ? info.mtime.toISOString() : '',
    })
  }

  /** POST /papers/:id/summary/history/:stamp/restore */
  async function handleSummaryRestore(req, res, id, stamp) {    const meta = await loadMeta(id)
    const dir = paperDirOf(id)
    // `restoreHistory` already snapshots the current body and writes the file,
    // so only the Obsidian mirror and meta remain.
    const restored = await restoreHistory(dir, stamp)
    const current = await readSummary(dir)
    const written = await finishWrittenNote(meta, restored.markdown, {
      updatedAt: current.updatedAt || nowIso(),
      version: restored.version,
      snapshot: restored.snapshot || '',
    })
    const anchored = await reanchorNote(id, restored.markdown)
    json(res, 200, {
      ok: true,
      markdown: restored.markdown,
      version: restored.version,
      updatedAt: written.updatedAt,
      notePath: written.notePath,
      noteError: written.noteError,
      annotations: anchored.annotations,
      lost: anchored.lost,
      historyStamp: written.snapshot || '',
    })
  }

  /**
   * Insert one uploaded/cropped image into the note body at an anchor the
   * model (or the user) picked. Returns the new body; never writes the note.
   * `offset` is null when an explicit anchor could not be resolved.
   */
  async function insertImageIntoBody(meta, markdown, name, options) {
    const caption = sanitizeCaption(options.caption || options.instruction || '', 200)
    const block = figureMarkdownFor(meta.id, name, caption, 0)
    const hasAnchor =
      Boolean(options.heading) ||
      (options.afterOffset !== undefined && options.afterOffset !== null && options.afterOffset !== '')
    const offset = resolveAnchorOffset(markdown, {
      heading: options.heading,
      afterOffset: options.afterOffset,
    })
    if (hasAnchor && offset === null) return { markdown, offset: null, caption }
    const target = offset === null ? String(markdown).length : offset
    return { markdown: insertBlockAt(markdown, target, block), offset: target, caption }
  }

  function imagePreviewUrl(id, name) {
    return `${API_PREFIX}/papers/${id}/figure/${encodeURIComponent(name)}`
  }

  /** Persist an inserted image, re-anchor annotations and answer the client. */
  async function commitImageInsertion(res, meta, imageId, previewUrl, markdown, extra = {}) {
    const written = await persistNoteBody(meta, markdown, { source: 'manual' })
    const anchored = await reanchorNote(meta.id, markdown)
    json(res, 200, {
      status: 'inserted',
      markdown,
      version: written.version,
      updatedAt: written.updatedAt,
      notePath: written.notePath,
      noteError: written.noteError,
      previewUrl,
      imageId,
      annotations: anchored.annotations,
      lost: anchored.lost,
      ...extra,
    })
  }

  /** Append the image at the very end of the note (the documented fallback). */
  function appendImageBlock(meta, markdown, name, caption) {
    return insertBlockAt(markdown, String(markdown).length, figureMarkdownFor(meta.id, name, caption, 0))
  }

  /**
   * Where an `action:'insert'` plan wants the image (spec §7.3 step 3):
   * `afterOffset` wins, then the section named by `heading`. `anchored` is
   * false only when the model gave neither, so the caller can report the
   * end-of-note fallback to the client.
   */
  function plannedInsertTarget(markdown, plan) {
    const text = String(markdown || '')
    const raw = Number(plan?.afterOffset)
    if (
      plan?.afterOffset !== undefined &&
      plan?.afterOffset !== null &&
      plan?.afterOffset !== '' &&
      Number.isFinite(raw)
    ) {
      const clamped = Math.max(0, Math.min(text.length, Math.trunc(raw)))
      return { offset: lineStartAt(text, clamped), anchored: true }
    }
    const heading = findHeadingLine(text, plan?.heading)
    if (heading) return { offset: sectionEndOffset(text, heading), anchored: true }
    return { offset: text.length, anchored: false }
  }

  /** POST /papers/:id/summary/images — upload and place (or ask where). */
  async function handleSummaryImage(req, res, id) {
    if (busy.has(id)) throw new HttpError(409, '当前还有模型任务正在进行，请稍候')
    const body = await readJsonBody(req, IMAGE_MAX_BYTES * 2)
    const meta = await loadMeta(id)
    const dir = paperDirOf(id)
    const state = await readSummary(dir)
    if (!state.markdown) throw new HttpError(404, '还没有生成总结')
    // Validate and store the bytes before touching the model or the note, so a
    // bad upload never leaves a half-inserted reference behind.
    const image = decodeImageUpload(body.dataUrl ?? body.data, body.mediaType)
    const name = uploadedImageName(new Date(), image.mediaType)
    await saveFigure(dir, name, image.buffer)
    const mirrored = await mirrorFigureToVault(id, name, meta)
    const imageId = name
    const previewUrl = imagePreviewUrl(id, name)
    const instruction = String(body.instruction || '').trim().slice(0, 2000)
    const caption = String(body.caption || '').trim() || instruction
    const anchor = body.anchor && typeof body.anchor === 'object' ? body.anchor : {}
    const hasAnchor =
      Boolean(anchor.heading) ||
      (anchor.afterOffset !== undefined && anchor.afterOffset !== null && anchor.afterOffset !== '')
    if (hasAnchor) {
      // An explicit anchor must resolve: silently asking instead would hide a
      // client bug behind a question the user cannot answer.
      const placed = await insertImageIntoBody(meta, state.markdown, name, {
        heading: anchor.heading,
        afterOffset: anchor.afterOffset,
        caption,
      })
      if (placed.offset === null) {
        throw new HttpError(400, '指定的插入位置在正文里不存在，请重新选择章节')
      }
      pendingImages.delete(imageId)
      await commitImageInsertion(res, meta, imageId, previewUrl, placed.markdown, {
        imageName: name,
        vaultCopied: mirrored.copied,
      })
      return
    }
    busy.add(id)
    let plan
    try {
      plan = await ai.planImagePlacement({
        meta,
        markdown: state.markdown,
        instruction,
        image: { data: image.buffer, mediaType: image.mediaType, name },
      })
    } finally {
      busy.delete(id)
    }
    if (plan.action === 'insert') {
      const block = figureMarkdownFor(meta.id, name, plan.caption || caption, 0)
      const target = plannedInsertTarget(state.markdown, plan)
      pendingImages.delete(imageId)
      await commitImageInsertion(res, meta, imageId, previewUrl, insertBlockAt(state.markdown, target.offset, block), {
        imageName: name,
        vaultCopied: mirrored.copied,
        ...(target.anchored ? {} : { fallback: 'end' }),
      })
      return
    }
    pendingImages.set(imageId, {
      imageId,
      paperId: id,
      name,
      instruction,
      caption: String(body.caption || ''),
      asks: 1,
      createdAt: Date.now(),
    })
    json(res, 200, {
      status: 'needs_question',
      question: plan.question || '这张图应该放在哪一节？',
      suggestion: plan.suggestion || '',
      imageId,
      previewUrl,
      imageName: name,
      vaultCopied: mirrored.copied,
      notePath: meta.summaryPath || '',
      round: 1,
    })
  }

  /** POST /papers/:id/summary/images/:imageId/place — answer the question. */
  async function handleSummaryImagePlace(req, res, id, imageId) {
    if (busy.has(id)) throw new HttpError(409, '当前还有模型任务正在进行，请稍候')
    const body = await readJsonBody(req, 1024 * 1024)
    const meta = await loadMeta(id)
    const dir = paperDirOf(id)
    const record = pendingImageFor(imageId, id)
    const state = await readSummary(dir)
    if (!state.markdown) throw new HttpError(404, '还没有生成总结')
    const answer = String(body.answer || '').trim().slice(0, 2000)
    const caption = String(body.caption || '').trim() || record.caption || record.instruction
    const previewUrl = imagePreviewUrl(id, record.name)
    const wantsExplicit =
      Boolean(body.heading) ||
      (body.afterOffset !== undefined && body.afterOffset !== null && body.afterOffset !== '')
    if (wantsExplicit) {
      // A section/offset from the user always wins over another model round.
      const explicit = await insertImageIntoBody(meta, state.markdown, record.name, {
        heading: body.heading,
        afterOffset: body.afterOffset,
        caption,
      })
      if (explicit.offset === null) {
        throw new HttpError(400, '指定的插入位置在正文里不存在，请重新选择章节')
      }
      pendingImages.delete(record.imageId)
      await commitImageInsertion(res, meta, record.imageId, previewUrl, explicit.markdown)
      return
    }
    if (body.force === true) {
      // "Let the AI decide" with no anchor: append rather than ask again.
      pendingImages.delete(record.imageId)
      await commitImageInsertion(res, meta, record.imageId, previewUrl, appendImageBlock(meta, state.markdown, record.name, caption), {
        fallback: 'end',
      })
      return
    }
    let buffer
    try {
      buffer = await readFile(path.join(figureDir(dir), record.name))
    } catch {
      pendingImages.delete(record.imageId)
      throw new HttpError(404, '图片已过期，请重新插入')
    }
    busy.add(id)
    let plan
    try {
      plan = await ai.planImagePlacement({
        meta,
        markdown: state.markdown,
        instruction: record.instruction,
        image: { data: buffer, mediaType: figureFileType(record.name), name: record.name },
        answer,
      })
    } finally {
      busy.delete(id)
    }
    if (plan.action === 'insert') {
      const block = figureMarkdownFor(meta.id, record.name, plan.caption || caption, 0)
      const target = plannedInsertTarget(state.markdown, plan)
      pendingImages.delete(record.imageId)
      await commitImageInsertion(
        res,
        meta,
        record.imageId,
        previewUrl,
        insertBlockAt(state.markdown, target.offset, block),
        target.anchored ? {} : { fallback: 'end' },
      )
      return
    }
    record.asks += 1
    if (record.asks > MAX_PLACEMENT_ASKS) {
      // Two rounds of questions are the contract; after that the image must
      // land somewhere instead of looping forever.
      pendingImages.delete(record.imageId)
      await commitImageInsertion(res, meta, record.imageId, previewUrl, appendImageBlock(meta, state.markdown, record.name, caption), {
        fallback: 'end',
      })
      return
    }
    pendingImages.set(record.imageId, record)
    json(res, 200, {
      status: 'needs_question',
      question: plan.question || '这张图应该放在哪一节？',
      suggestion: plan.suggestion || '',
      imageId: record.imageId,
      previewUrl,
      round: record.asks,
    })
  }

  /** POST /papers/:id/summary/figures — SSE figure completion. */
  async function handleSummaryFigures(req, res, id) {
    if (busy.has(id)) throw new HttpError(409, '当前还有回答或总结正在生成，请稍候')
    const body = await readJsonBody(req, 1024 * 1024).catch(() => ({}))
    const meta = await loadMeta(id)
    const dir = paperDirOf(id)
    const state = await readSummary(dir)
    if (!state.markdown) throw new HttpError(404, '还没有生成总结')
    const requested = Array.isArray(body.placeholders)
      ? body.placeholders
          .filter((item) => item && Number.isFinite(Number(item.start)) && Number.isFinite(Number(item.end)))
          .slice(0, MAX_FIGURE_PLACEHOLDERS)
          .map((item) => ({
            start: Math.max(0, Math.trunc(Number(item.start))),
            end: Math.max(0, Math.trunc(Number(item.end))),
            page: Number.parseInt(String(item.page), 10) || 0,
            caption: sanitizeCaption(item.caption, 200),
            hint: String(item.hint || '').slice(0, 400),
          }))
          // A client body can lag behind a server-side save; only trust offsets
          // that still cover a placeholder line, so a stale range never
          // splices an image into unrelated text.
          .filter(
            (item) =>
              item.end > item.start &&
              item.end <= state.markdown.length &&
              state.markdown.slice(item.start, item.end).includes('[[FIGURE'),
          )
      : []
    const placeholders = requested.length ? requested : findFigurePlaceholders(state.markdown)
    const controller = new AbortController()
    let finished = false
    const sse = makeSse(res, () => {
      if (!finished) controller.abort()
    })
    busy.add(id)
    try {
      if (placeholders.length === 0) {
        sse.send({ type: 'start', total: 0 })
        sse.send({
          type: 'done',
          markdown: state.markdown,
          version: state.version,
          updatedAt: state.updatedAt,
          created: [],
          failed: [],
          total: 0,
          notePath: meta.summaryPath || '',
        })
        finished = true
        sse.end()
        return
      }
      sse.send({ type: 'start', total: placeholders.length })
      const resolved = await resolveFigures(
        meta,
        dir,
        state.markdown,
        placeholders,
        figureProgressSender(sse, placeholders.length),
        controller.signal,
      )
      if (controller.signal.aborted) {
        finished = true
        sse.end()
        return
      }
      const written = await persistNoteBody(meta, resolved.markdown, { source: 'figures' })
      sse.send({
        type: 'done',
        markdown: resolved.markdown,
        version: written.version,
        updatedAt: written.updatedAt,
        created: resolved.created,
        failed: resolved.failed,
        total: resolved.total,
        notePath: written.notePath,
        noteError: written.noteError,
      })
      finished = true
      sse.end()
    } catch (error) {
      if (controller.signal.aborted) {
        finished = true
        sse.end()
        return
      }
      sse.send({ type: 'error', message: errorMessage(error) })
      finished = true
      sse.end()
    } finally {
      busy.delete(id)
    }
  }

  async function serveFile(res, file, contentType, cache = true) {
    const info = await stat(file)
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': info.size,
      'Cache-Control': cache ? 'public, max-age=31536000, immutable' : 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    createReadStream(file).pipe(res)
  }

  // ---- reader note routes (docs/reader-note-spec.md §3) ------------------

  /** GET /papers/:id/reader-note — never 404 for "no note" (spec §3.1, §7.9). */
  async function handleReaderNoteGet(req, res, id) {
    const meta = await loadMeta(id)
    const stored = await readQuestions(paperDirOf(id))
    const vaultPath = await usableVaultPath()
    if (!vaultPath) {
      json(res, 200, readerNotePayload(meta, stored))
      return
    }
    const { resolved, file } = await loadReaderNote(meta)
    if (!file) {
      json(res, 200, readerNotePayload(meta, stored))
      return
    }
    const questions = await anchorNoteQuestions(id, file.markdown, stored)
    await rememberReaderNote(meta, resolved)
    await setReaderNoteOpen(meta, questions)
    json(res, 200, {
      exists: true,
      path: resolved.path,
      relative: resolved.relative,
      markdown: file.markdown,
      hash: file.hash,
      updatedAt: file.updatedAt,
      entryCount: file.entryCount,
      questions,
      historyStamp: '',
    })
  }

  /** POST /papers/:id/reader-note — idempotent create (spec §3.2). */
  async function handleReaderNoteCreate(req, res, id) {
    await readJsonBody(req, 256 * 1024)
    const meta = await loadMeta(id)
    const vaultPath = await readerNoteVaultPath()
    const tags = mergeTags(meta.tags, ['文献阅读', '阅读笔记'])
    let created
    try {
      created = await createReaderNote({
        vaultPath,
        notesFolder: config.notesFolder,
        meta,
        tags,
        now: new Date(),
      })
    } catch (error) {
      // A vault that exists but rejects the write must not crash the route: the
      // client needs the real reason (§10).
      if (error instanceof HttpError) throw error
      throw new HttpError(500, `写笔记失败：${errorMessage(error)}`)
    }
    await rememberReaderNote(meta, created)
    const questions = await anchorNoteQuestions(id, created.markdown, await readQuestions(paperDirOf(id)))
    await setReaderNoteOpen(meta, questions)
    const info = await stat(created.path).catch(() => undefined)
    json(res, 200, {
      ok: true,
      created: created.created,
      exists: true,
      path: created.path,
      relative: created.relative,
      markdown: created.markdown,
      hash: created.hash,
      updatedAt: info?.mtime ? info.mtime.toISOString() : '',
      entryCount: countEntries(created.markdown),
      links: created.links,
      questions,
      historyStamp: '',
    })
  }

  /** POST /papers/:id/reader-note/entries — append one entry (spec §3.3). */
  async function handleReaderNoteEntry(req, res, id) {
    const body = await readJsonBody(req, 1024 * 1024)
    const markdown = String(body.markdown ?? '')
      .replace(/\r\n?/g, '\n')
      .trim()
    if (!markdown) throw new HttpError(400, '记录内容不能为空')
    if (markdown.length > 20_000) throw new HttpError(400, '记录内容不能超过 20000 字')
    const meta = await loadMeta(id)
    const { resolved, file } = await loadReaderNote(meta)
    if (!file) throw new HttpError(404, '还没有建立阅读笔记')
    const at = parseReaderNoteTime(body.at)
    const appended = appendEntryToBody({ body: file.markdown, markdown, at })
    let written
    try {
      written = await writeReaderNoteFile({
        path: resolved.path,
        body: appended.body,
        meta,
        reason: 'append',
        historyDir: readerNoteHistoryDir(id),
        now: at,
      })
    } catch (error) {
      if (error instanceof HttpError) throw error
      throw new HttpError(500, `写笔记失败：${errorMessage(error)}`)
    }
    await rememberReaderNote(meta, resolved)
    json(res, 200, {
      ok: true,
      markdown: written.body,
      hash: written.hash,
      entryCount: countEntries(written.body),
      entry: appended.entry,
      anchor: appended.anchor,
      historyStamp: written.historyStamp,
    })
  }

  /** POST /papers/:id/reader-note/images — upload one note image (spec §3.4). */
  async function handleReaderNoteImage(req, res, id) {
    const body = await readJsonBody(req, IMAGE_MAX_BYTES * 2)
    const meta = await loadMeta(id)
    const image = decodeImageUpload(body.dataUrl ?? body.data, body.mediaType)
    const name = uploadedImageName(new Date(), image.mediaType)
    // The name must stay inside the `/figure/:name` whitelist so the preview
    // route can replay it (spec §3.4).
    if (!isFigureName(name)) throw new HttpError(500, '图片文件名不符合规范')
    const dir = paperDirOf(id)
    await saveFigure(dir, name, image.buffer)
    const rel = attachmentRelPath(id, name, '笔记')
    // §7.8b: the bytes and the link must both live under the *note's* folder,
    // so `_附件/<id>/笔记/<name>` resolves from the note itself in Obsidian.
    const folder = readerNoteFolder({ meta, notesFolder: config.notesFolder })
    let vaultError = ''
    try {
      const vaultPath = await usableVaultPath()
      if (!vaultPath) throw new Error('未找到 Obsidian 库')
      await copyFigureToVault({
        vaultPath,
        notesFolder: folder,
        paperId: id,
        localFile: path.join(figureDir(dir), name),
        name,
        sub: '笔记',
      })
    } catch (error) {
      // A missing/unwritable vault never loses the local copy (§10).
      vaultError = errorMessage(error)
    }
    json(res, 200, { ok: true, name, url: imagePreviewUrl(id, name), rel, vaultError })
  }

  /** GET /papers/:id/reader-note/history — newest first (spec §3.5). */
  async function handleReaderNoteHistory(req, res, id) {
    await loadMeta(id)
    const versions = await listReaderNoteHistory(readerNoteHistoryDir(id))
    json(res, 200, { versions })
  }

  /** GET /papers/:id/reader-note/history/:stamp — read-only preview. */
  async function handleReaderNoteHistoryItem(req, res, id, stamp) {
    await loadMeta(id)
    const version = await readReaderNoteHistoryVersion({
      historyDir: readerNoteHistoryDir(id),
      stamp,
    })
    json(res, 200, {
      stamp: version.stamp,
      markdown: version.markdown,
      chars: version.chars,
      updatedAt: version.updatedAt,
      reason: version.reason,
    })
  }

  /** POST /papers/:id/reader-note/history/:stamp/restore (spec §3.5). */
  async function handleReaderNoteRestore(req, res, id, stamp) {
    await readJsonBody(req, 256 * 1024)
    const meta = await loadMeta(id)
    const resolved = await resolveNoteFor(meta)
    let restored
    try {
      restored = await restoreReaderNoteHistory({
        path: resolved.path,
        historyDir: readerNoteHistoryDir(id),
        stamp,
        now: new Date(),
      })
    } catch (error) {
      if (error instanceof HttpError) throw error
      throw new HttpError(500, `恢复笔记失败：${errorMessage(error)}`)
    }
    await rememberReaderNote(meta, resolved)
    const questions = await anchorNoteQuestions(id, restored.markdown)
    await setReaderNoteOpen(meta, questions)
    json(res, 200, {
      ok: true,
      markdown: restored.markdown,
      hash: restored.hash,
      entryCount: countEntries(restored.markdown),
      historyStamp: restored.historyStamp,
      questions,
    })
  }

  /** POST /papers/:id/reader-note/organize — AI polish (spec §3.6, SSE). */
  async function handleReaderNoteOrganize(req, res, id) {
    const body = await readJsonBody(req, 256 * 1024)
    if (busy.has(id)) throw new HttpError(409, '当前模型任务正在进行，请稍候')
    const meta = await loadMeta(id)
    const { resolved, file } = await loadReaderNote(meta)
    if (!file) throw new HttpError(404, '还没有建立阅读笔记')
    if (file.markdown.trim().length < 10) throw new HttpError(400, '笔记正文太短，无法整理')
    const baseHash = String(body.baseHash || '').trim()
    // The conflict has to be answered *before* the SSE handshake, otherwise the
    // client only sees an error event where it expects a 409 (spec §3.6).
    if (baseHash && baseHash !== file.hash) {
      json(res, 409, {
        error: '笔记已在别处更新',
        conflict: true,
        markdown: file.markdown,
        hash: file.hash,
      })
      return
    }
    const controller = new AbortController()
    let finished = false
    const sse = makeSse(res, () => {
      if (!finished) controller.abort()
    })
    busy.add(id)
    try {
      sse.send({ type: 'status', label: '正在整理笔记…' })
      let answer
      try {
        answer = await ai.organizeReaderNote({
          meta,
          markdown: file.markdown,
          signal: controller.signal,
        })
      } catch (error) {
        if (controller.signal.aborted) {
          finished = true
          sse.end()
          return
        }
        sse.send({ type: 'error', message: errorMessage(error) })
        finished = true
        sse.end()
        return
      }
      if (controller.signal.aborted) {
        finished = true
        sse.end()
        return
      }
      // Safety gate (§3.6, §5): a rewrite that breaks structure is refused as a
      // whole — no write, no questions, so the note is exactly as it was.
      const gate = checkOrganizeRewrite({ before: file.markdown, after: answer.markdown })
      if (!gate.ok) {
        const reason = (gate.problems || []).filter(Boolean).join('；') || '结构校验未通过'
        sse.send({
          type: 'error',
          message: `AI 改写破坏了笔记结构（${reason}），已放弃本次整理`,
        })
        finished = true
        sse.end()
        return
      }
      const existing = await anchorNoteQuestions(id, file.markdown)
      const written = await writeReaderNoteFile({
        path: resolved.path,
        body: answer.markdown,
        meta,
        reason: 'organize',
        historyDir: readerNoteHistoryDir(id),
        now: new Date(),
      })
      // Old questions keep their id, status and discussion; the new suspects
      // arrive as `open` (spec §3.6).
      const mapped = applyOrganizeResult({ body: written.body, questions: existing })
      const fresh = (Array.isArray(answer.questions) ? answer.questions : []).map((item) => ({
        quote: item?.quote || '',
        problem: item?.problem || '',
        suggestion: item?.suggestion || '',
        ask: item?.ask || '',
        status: 'open',
      }))
      const merged = normalizeQuestions([...mapped.questions, ...fresh], written.body, existing)
      await writeQuestions(paperDirOf(id), merged)
      await rememberReaderNote(meta, resolved)
      await setReaderNoteOpen(meta, merged)
      const report = answer.report && typeof answer.report === 'object' ? answer.report : {}
      sse.send({
        type: 'done',
        markdown: written.body,
        hash: written.hash,
        historyStamp: written.historyStamp,
        report: {
          typos: Number(report.typos) || 0,
          merges: Number(report.merges) || 0,
          formatting: Number(report.formatting) || 0,
          summary: String(report.summary || ''),
        },
        questions: merged,
        entryCount: countEntries(written.body),
      })
      finished = true
      sse.end()
    } catch (error) {
      if (controller.signal.aborted) {
        finished = true
        sse.end()
        return
      }
      sse.send({ type: 'error', message: errorMessage(error) })
      finished = true
      sse.end()
    } finally {
      busy.delete(id)
    }
  }

  /** POST /papers/:id/reader-note/questions/:qid/discuss (spec §3.7, SSE). */
  async function handleReaderNoteDiscuss(req, res, id, qid) {
    const body = await readJsonBody(req, 256 * 1024)
    if (busy.has(id)) throw new HttpError(409, '当前模型任务正在进行，请稍候')
    const meta = await loadMeta(id)
    const { file } = await loadReaderNote(meta)
    if (!file) throw new HttpError(404, '还没有建立阅读笔记')
    const questions = await anchorNoteQuestions(id, file.markdown)
    const question = questions.find((item) => item && item.id === qid)
    if (!question) throw new HttpError(404, '问题不存在')
    const message = String(body.message ?? '').trim().slice(0, 4000)
    const controller = new AbortController()
    let finished = false
    const sse = makeSse(res, () => {
      if (!finished) controller.abort()
    })
    busy.add(id)
    try {
      let reply = ''
      try {
        reply = await ai.discussReaderNoteQuestion({
          meta,
          markdown: file.markdown,
          question,
          history: question.messages || [],
          userMessage: message,
          signal: controller.signal,
          onDelta: (text) => sse.send({ type: 'delta', text: String(text || '') }),
        })
      } catch (error) {
        if (controller.signal.aborted) {
          finished = true
          sse.end()
          return
        }
        sse.send({ type: 'error', message: errorMessage(error) })
        finished = true
        sse.end()
        return
      }
      if (controller.signal.aborted) {
        finished = true
        sse.end()
        return
      }
      const at = nowIso()
      const messages = Array.isArray(question.messages) ? question.messages.slice() : []
      if (message) messages.push({ role: 'user', content: message, at })
      const text = String(reply || '').trim()
      if (text) messages.push({ role: 'assistant', content: text, at })
      question.messages = messages.slice(-MAX_QUESTION_MESSAGES)
      const nextQuestions = questions.map((item) => (item.id === question.id ? question : item))
      await writeQuestions(paperDirOf(id), nextQuestions)
      await setReaderNoteOpen(meta, nextQuestions)
      // `done` must carry the *complete* question: the client replaces its copy
      // and the thread has to survive a reload (§7.9).
      sse.send({ type: 'done', question, reply: text })
      finished = true
      sse.end()
    } catch (error) {
      if (controller.signal.aborted) {
        finished = true
        sse.end()
        return
      }
      sse.send({ type: 'error', message: errorMessage(error) })
      finished = true
      sse.end()
    } finally {
      busy.delete(id)
    }
  }

  /** POST /papers/:id/reader-note/questions/:qid/resolve (spec §3.8). */
  async function handleReaderNoteResolve(req, res, id, qid) {
    const body = await readJsonBody(req, 256 * 1024)
    const mode = String(body.mode || '').trim()
    if (mode !== 'apply' && mode !== 'dismiss') throw new HttpError(400, '不支持的修正方式')
    if (mode === 'apply' && busy.has(id)) throw new HttpError(409, '当前模型任务正在进行，请稍候')
    const meta = await loadMeta(id)
    const { resolved, file } = await loadReaderNote(meta)
    if (!file) throw new HttpError(404, '还没有建立阅读笔记')
    const questions = await anchorNoteQuestions(id, file.markdown)
    const question = questions.find((item) => item && item.id === qid)
    if (!question) throw new HttpError(404, '问题不存在')
    if (mode === 'dismiss') {
      question.status = 'dismissed'
      question.resolvedAt = nowIso()
      await writeQuestions(paperDirOf(id), questions)
      await setReaderNoteOpen(meta, questions)
      json(res, 200, { ok: true, unchanged: true, question })
      return
    }
    // §3.9: re-anchoring already turned a quote the body no longer contains
    // into `orphan`; there is nothing left to replace.
    if (question.status === 'orphan') {
      json(res, 409, { error: '原文已改动，无法定位这处问题', orphan: true, question })
      return
    }
    let answer
    busy.add(id)
    try {
      answer = await ai.rewriteReaderNoteQuestion({
        meta,
        markdown: file.markdown,
        question,
        history: question.messages || [],
      })
    } finally {
      busy.delete(id)
    }
    if (answer.verdict !== 'fix') {
      // Discussing it settled the doubt: resolve without touching the body.
      question.status = 'resolved'
      question.verdict = 'ok'
      question.resolvedAt = nowIso()
      await writeQuestions(paperDirOf(id), questions)
      await setReaderNoteOpen(meta, questions)
      json(res, 200, {
        ok: true,
        unchanged: true,
        question,
        markdown: file.markdown,
        hash: file.hash,
      })
      return
    }
    // Locate the quoted span in the *source* so `replacement` only touches that
    // fragment (spec §3.8). The question's stored prefix/suffix disambiguate a
    // quote that occurs more than once; a plain indexOf is the last resort and
    // only ever hits text the AI layer already proved is present verbatim.
    const source = file.markdown
    const projection = source.trim()
      ? plainProjection(parseMarkdown(source).blocks)
      : { text: '', map: [] }
    const located = projection.text
      ? locateQuote(projection, {
          quote: answer.quote,
          prefix: question.prefix,
          suffix: question.suffix,
          start: answer.quote === question.quote ? question.start : undefined,
        })
      : null
    const start = located ? located.start : source.indexOf(answer.quote)
    const end = located ? located.end : start + answer.quote.length
    if (!answer.quote || start < 0 || end <= start) {
      question.status = 'orphan'
      await writeQuestions(paperDirOf(id), questions)
      await setReaderNoteOpen(meta, questions)
      json(res, 409, { error: '原文已改动，无法定位这处问题', orphan: true, question })
      return
    }
    const applied = applyReplacements(source, [
      { start, end, replacement: answer.replacement },
    ])
    if (applied.applied.length === 0) {
      question.status = 'orphan'
      await writeQuestions(paperDirOf(id), questions)
      await setReaderNoteOpen(meta, questions)
      json(res, 409, { error: '原文已改动，无法定位这处问题', orphan: true, question })
      return
    }
    const written = await writeReaderNoteFile({
      path: resolved.path,
      body: applied.text,
      meta,
      reason: 'resolve',
      historyDir: readerNoteHistoryDir(id),
      now: new Date(),
    })
    question.status = 'resolved'
    question.verdict = 'fix'
    question.resolvedAt = nowIso()
    const nextQuestions = await anchorNoteQuestions(
      id,
      written.body,
      questions.map((item) => (item.id === question.id ? question : item)),
    )
    await rememberReaderNote(meta, resolved)
    await setReaderNoteOpen(meta, nextQuestions)
    const settled = {
      ...(nextQuestions.find((item) => item.id === question.id) || question),
      status: 'resolved',
      verdict: 'fix',
    }
    json(res, 200, {
      ok: true,
      markdown: written.body,
      hash: written.hash,
      entryCount: countEntries(written.body),
      historyStamp: written.historyStamp,
      question: settled,
      replacement: answer.replacement,
      why: answer.why || '',
    })
  }

  /**
   * DELETE /papers/:id with the three-way vault choice (spec §12.3).
   *
   * `keep` (the default) leaves the tripod alone; `summary` also removes the
   * summary note; `all` removes the note, the framework files and the whole
   * `_附件/<paperId>/` folder. The legacy `deleteNotes: true` means `all`.
   * Every vault removal goes through `deleteVaultEntry`, so it lands in
   * `backups/delete-*` and can be restored; failures are reported in
   * `warnings[]` rather than aborting a half-done deletion.
   */
  async function deletePaperWithVaultFiles(req, res, id, meta, body) {
    const requested = (() => {
      let value = String(body?.vaultFiles ?? '').trim().toLowerCase()
      if (!value) {
        try {
          value = String(new URL(req.url, 'http://127.0.0.1').searchParams.get('vaultFiles') || '')
            .trim()
            .toLowerCase()
        } catch {
          value = ''
        }
      }
      if (!value && body?.deleteNotes === true) return 'all'
      if (!value) return 'keep'
      if (!['keep', 'summary', 'all'].includes(value)) {
        throw new HttpError(400, 'vaultFiles 只能是 keep、summary 或 all')
      }
      return value
    })()
    const vaultPreserved = requested === 'keep'
    const deleted = []
    const warnings = []
    const vault = await getVaultInfo()
    /** Absolute paths (meta) → the vault-relative form `deleteVaultEntry` takes. */
    const vaultRelFor = (abs) => {
      if (!abs) return ''
      if (!vault?.path) return ''
      const rel = path.relative(vault.path, path.resolve(abs))
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return ''
      return rel.split(path.sep).join('/')
    }
    const removeVaultEntry = async (rel, kind) => {
      if (!rel) return
      if (!vault?.path) {
        warnings.push(`${rel}: 未找到 Obsidian 库`)
        return
      }
      try {
        const result = await deleteVaultEntry({
          vault: vault.path,
          dataDir: dirs.dataDir,
          rel,
          kind,
        })
        deleted.push(result)
      } catch (error) {
        // Already gone is not a failure worth reporting; anything else is.
        if (error instanceof HttpError && error.status === 404) return
        warnings.push(`${rel}: ${errorMessage(error)}`)
      }
    }
    if (requested !== 'keep' && meta.summaryPath) {
      await removeVaultEntry(vaultRelFor(meta.summaryPath), 'note')
    }
    if (requested === 'all') {
      // `meta.readerNotePath` is absolute; fall back to the recorded relative
      // path when the absolute one points outside the current vault.
      const noteRel =
        vaultRelFor(meta.readerNotePath) || normalizeRel(meta.readerNoteRelative || '')
      await removeVaultEntry(noteRel, 'note')
      if (vault?.path) {
        const folder = readerNoteFolder({ meta, notesFolder: config.notesFolder })
        const assetsRel = relJoin(folder, '_附件', id)
        const assetsAbs = safeVaultPath(vault.path, assetsRel)
        const info = await stat(assetsAbs).catch(() => undefined)
        if (info?.isDirectory()) await removeVaultEntry(assetsRel, 'folder')
      }
    }
    // The plugin-side copies always go: history snapshots and the question list
    // live inside the paper directory, which is removed wholesale (spec §9).
    await rm(paperDirOf(id), { recursive: true, force: true }).catch(() => {})
    metaCache.delete(id)
    invalidateVaultCache()
    json(res, 200, {
      ok: true,
      vaultPreserved,
      vaultFiles: requested,
      deleted,
      warnings,
    })
  }

  async function handlePaperRoute(req, res, id, rest) {
    const method = req.method || 'GET'
    // The confirmation gate runs before anything else so an unconfirmed DELETE
    // is refused on its own merits, not masked by a later lookup error.
    if (rest.length === 0 && method === 'DELETE') {
      const confirmed = (() => {
        try {
          return new URL(req.url, 'http://127.0.0.1').searchParams.get('confirm') === 'true'
        } catch {
          return false
        }
      })()
      if (!confirmed && req.headers?.['x-lr-confirm'] !== 'true') {
        throw new HttpError(400, '删除需要二次确认')
      }
    }
    const meta = await loadMeta(id)
    const dir = paperDirOf(id)
    if (rest.length === 0) {
      if (method === 'GET') {
        if (meta.status === 'processing' && !jobs.has(id)) startProcessing(id)
        json(res, 200, { paper: publicPaper(meta) })
        return
      }
      if (method === 'DELETE') {
        if (meta.status === 'processing' || jobs.has(id)) {
          throw new HttpError(409, '文献正在处理中，完成后才能删除')
        }
        const body = await readJsonBody(req, 64 * 1024)
        await deletePaperWithVaultFiles(req, res, id, meta, body)
        return
      }
      throw new HttpError(405, '不支持的请求方法')
    }
    const [resource, a, b] = rest
    if (resource === 'page' && method === 'GET') {
      const page = Number.parseInt(a, 10)
      if (!Number.isInteger(page) || page < 1 || page > Math.max(1, meta.pageCount)) {
        throw new HttpError(404, '页码不存在')
      }
      const key = `${id}:${page}`
      let promise = pageJobs.get(key)
      if (!promise) {
        const pdf = await sourcePathFor(meta, dir)
        promise = ensurePageImage(pdf, dir, page, { config })
          .finally(() => pageJobs.delete(key))
        pageJobs.set(key, promise)
      }
      const file = await promise
      await serveFile(res, file, 'image/jpeg')
      return
    }
    if (resource === 'thumb' && method === 'GET') {
      const key = `${id}:thumb`
      let promise = pageJobs.get(key)
      if (!promise) {
        const pdf = await sourcePathFor(meta, dir)
        promise = ensurePageImage(pdf, dir, 1, { thumb: true, config }).finally(() =>
          pageJobs.delete(key),
        )
        pageJobs.set(key, promise)
      }
      const file = await promise
      await serveFile(res, file, 'image/jpeg')
      return
    }
    if (resource === 'pdf' && method === 'GET') {
      await serveFile(res, await sourcePathFor(meta, dir), 'application/pdf', false)
      return
    }
    if (resource === 'chat' && method === 'GET') {
      const messages = await loadChat(id)
      json(res, 200, { messages })
      return
    }
    if (resource === 'ask' && method === 'POST') {
      await handleAsk(req, res, id)
      return
    }
    if (resource === 'extract' && method === 'POST') {
      await handleExtract(req, res, id)
      return
    }
    if (resource === 'outline' && method === 'POST') {
      await handleOutline(req, res, id)
      return
    }
    if (resource === 'summary' && a === 'prepare' && method === 'POST') {
      await handleSummaryPrepare(req, res, id)
      return
    }
    if (resource === 'summary' && !a && method === 'POST') {
      await handleSummary(req, res, id)
      return
    }
    if (resource === 'summary' && !a && method === 'GET') {
      await handleSummaryGet(req, res, id)
      return
    }
    if (resource === 'summary' && !a && method === 'PUT') {
      await handleSummaryPut(req, res, id)
      return
    }
    if (resource === 'summary' && a === 'annotations' && method === 'PUT') {
      await handleSummaryAnnotationsPut(req, res, id)
      return
    }
    if (resource === 'summary' && a === 'annotations' && method === 'GET') {
      const state = await noteState(id)
      json(res, 200, { annotations: state.annotations })
      return
    }
    if (resource === 'summary' && a === 'revise' && method === 'POST') {
      await handleSummaryRevise(req, res, id)
      return
    }
    if (resource === 'summary' && a === 'history' && !b && method === 'GET') {
      await handleSummaryHistory(req, res, id)
      return
    }
    if (resource === 'summary' && a === 'history' && b && rest[3] === 'restore' && method === 'POST') {
      await handleSummaryRestore(req, res, id, b)
      return
    }
    if (resource === 'summary' && a === 'history' && b && !rest[3] && method === 'GET') {
      await handleSummaryHistoryItem(req, res, id, b)
      return
    }
    if (resource === 'summary' && a === 'vault-body' && !b && method === 'GET') {
      await handleSummaryVaultBody(req, res, id)
      return
    }
    if (resource === 'summary' && a === 'images' && !b && method === 'POST') {
      await handleSummaryImage(req, res, id)
      return
    }
    if (resource === 'summary' && a === 'images' && b && rest[3] === 'place' && method === 'POST') {
      await handleSummaryImagePlace(req, res, id, b)
      return
    }
    if (resource === 'summary' && a === 'figures' && method === 'POST') {
      await handleSummaryFigures(req, res, id)
      return
    }
    if (resource === 'reader-note' && !a && method === 'GET') {
      await handleReaderNoteGet(req, res, id)
      return
    }
    if (resource === 'reader-note' && !a && method === 'POST') {
      await handleReaderNoteCreate(req, res, id)
      return
    }
    if (resource === 'reader-note' && a === 'entries' && !b && method === 'POST') {
      await handleReaderNoteEntry(req, res, id)
      return
    }
    if (resource === 'reader-note' && a === 'images' && !b && method === 'POST') {
      await handleReaderNoteImage(req, res, id)
      return
    }
    if (resource === 'reader-note' && a === 'history' && !b && method === 'GET') {
      await handleReaderNoteHistory(req, res, id)
      return
    }
    if (resource === 'reader-note' && a === 'history' && b && !rest[3] && method === 'GET') {
      await handleReaderNoteHistoryItem(req, res, id, b)
      return
    }
    if (resource === 'reader-note' && a === 'history' && b && rest[3] === 'restore' && method === 'POST') {
      await handleReaderNoteRestore(req, res, id, b)
      return
    }
    if (resource === 'reader-note' && a === 'organize' && !b && method === 'POST') {
      await handleReaderNoteOrganize(req, res, id)
      return
    }
    if (
      resource === 'reader-note' &&
      a === 'questions' &&
      b &&
      rest[3] === 'discuss' &&
      method === 'POST'
    ) {
      await handleReaderNoteDiscuss(req, res, id, b)
      return
    }
    if (
      resource === 'reader-note' &&
      a === 'questions' &&
      b &&
      rest[3] === 'resolve' &&
      method === 'POST'
    ) {
      await handleReaderNoteResolve(req, res, id, b)
      return
    }
    if (resource === 'figure' && method === 'GET') {
      const file = figurePath(dir, String(a || ''))
      if (!file) throw new HttpError(400, '无效的图片文件名')
      const info = await stat(file).catch(() => undefined)
      if (!info?.isFile()) throw new HttpError(404, '图片不存在')
      await serveFile(res, file, figureFileType(a))
      return
    }
    if (resource === 'analysis' && method === 'GET') {
      const analysis = await readFile(path.join(dir, 'analysis.md'), 'utf8').catch(() => '')
      if (!analysis) throw new HttpError(404, '还没有完成 AI 通读')
      json(res, 200, { markdown: analysis })
      return
    }
    if (resource === 'annotations' && method === 'GET') {
      const annotations = await loadAnnotations(id)
      json(res, 200, annotations)
      return
    }
    if (resource === 'annotations' && method === 'PUT') {
      const body = await readJsonBody(req, 4 * 1024 * 1024)
      const strokes = validateStrokes(body.strokes, meta.pageCount || 1)
      await saveAnnotations(id, strokes)
      json(res, 200, { ok: true, count: strokes.length })
      return
    }
    if (resource === 'open-note' && method === 'POST') {
      if (!meta.summaryPath || !existsSync(meta.summaryPath)) {
        throw new HttpError(400, '还没有可打开的总结笔记')
      }
      const vault = await detectVault(config)
      if (!vault) throw new HttpError(400, '未找到 Obsidian 库')
      const result = await openInObsidian(vault, meta.summaryPath)
      json(res, 200, { ok: true, ...result })
      return
    }
    if (resource === 'retry' && method === 'POST') {
      if (jobs.has(id) || meta.status === 'processing') {
        throw new HttpError(409, '文献正在处理中')
      }
      meta.status = 'processing'
      meta.error = ''
      meta.analysisError = ''
      meta.phase = 'extract'
      meta.outline = []
      await saveMeta(meta)
      startProcessing(id, { forceAnalysis: true })
      json(res, 202, { ok: true, paper: publicPaper(meta) })
      return
    }
    if (resource === 'selection' && method === 'GET') {
      const name = String(a || '')
      if (!/^[a-z0-9-]+\.jpg$/i.test(name)) throw new HttpError(400, '无效的文件名')
      const file = path.join(dir, 'selections', name)
      if (!existsSync(file)) throw new HttpError(404, '截图不存在')
      await serveFile(res, file, 'image/jpeg')
      return
    }
    throw new HttpError(404, '接口不存在')
  }

  async function handleImportStart(req, res) {
    const body = await readJsonBody(req, 1024 * 1024)
    const name = String(body.name || 'paper.pdf')
    if (!/\.pdf$/i.test(name)) throw new HttpError(400, '只支持 PDF 文件')
    const size = Number(body.size)
    if (!Number.isFinite(size) || size <= 0) throw new HttpError(400, '文件大小无效')
    if (size > MAX_UPLOAD) throw new HttpError(413, 'PDF 不能超过 350 MB')
    await ready
    const uploadId = randomUUID()
    const file = path.join(dirs.tmpDir, `${uploadId}.pdf`)
    await writeFile(file, Buffer.alloc(0))
    const folder = normalizeRel(body.folder || config.importFolder || '')
    uploads.set(uploadId, {
      file,
      expected: size,
      received: 0,
      name,
      folder,
      createdAt: Date.now(),
    })
    json(res, 200, { uploadId, chunkSize: 3 * 1024 * 1024, folder })
  }

  async function handleImportChunk(req, res) {
    const body = await readJsonBody(req, 12 * 1024 * 1024)
    const upload = uploads.get(String(body.uploadId || ''))
    if (!upload) throw new HttpError(404, '上传会话不存在或已过期')
    const raw = Buffer.from(stripDataUrl(String(body.data || '')), 'base64')
    if (raw.length === 0) throw new HttpError(400, '空数据块')
    if (upload.received + raw.length > upload.expected) throw new HttpError(400, '上传数据超过文件大小')
    await appendFile(upload.file, raw)
    upload.received += raw.length
    json(res, 200, { received: upload.received, expected: upload.expected })
  }

  async function handleImportFinish(req, res) {
    const body = await readJsonBody(req, 1024 * 1024)
    const uploadId = String(body.uploadId || '')
    const upload = uploads.get(uploadId)
    if (!upload) throw new HttpError(404, '上传会话不存在或已过期')
    uploads.delete(uploadId)
    if (upload.received !== upload.expected) {
      await unlink(upload.file).catch(() => {})
      throw new HttpError(400, '文件没有完整上传，请重试')
    }
    const uploadInfo = await stat(upload.file).catch(() => undefined)
    if (!uploadInfo) throw new HttpError(404, '上传文件已丢失')
    if (uploadInfo.size > MAX_UPLOAD) {
      await unlink(upload.file).catch(() => {})
      throw new HttpError(413, 'PDF 不能超过 350 MB')
    }
    const handle = await open(upload.file, 'r')
    const head = Buffer.alloc(5)
    try {
      await handle.read(head, 0, 5, 0)
    } finally {
      await handle.close()
    }
    if (head.toString('latin1') !== '%PDF-') {
      await unlink(upload.file).catch(() => {})
      throw new HttpError(400, '文件不是有效的 PDF')
    }
    await ready
    const vault = await getVaultInfo()
    const sha256 = await sha256File(upload.file)
    const existing = (await listMetaRecords()).find((item) => item.sha256 === sha256)
    // Obsidian is optional. Keep an imported PDF inside its paper cache when
    // no vault is available, so the core reader remains usable and can be
    // synced later after the user configures a vault.
    if (!vault) {
      if (existing) {
        await unlink(upload.file).catch(() => {})
        const existingMeta = await loadMeta(existing.id)
        if (existingMeta.status === 'processing' && !jobs.has(existing.id)) startProcessing(existing.id)
        json(res, 200, { paper: publicPaper(existingMeta), deduped: true, localOnly: true })
        return
      }
      const fileName = `${safeFileName(upload.name.replace(/\.pdf$/i, ''), 'paper')}.pdf`
      const id = slugForPaper(fileName)
      const dir = paperDirOf(id)
      await mkdir(dir, { recursive: true })
      const targetAbs = path.join(dir, 'source.pdf')
      await rename(upload.file, targetAbs).catch(async () => {
        await copyFile(upload.file, targetAbs)
        await unlink(upload.file).catch(() => {})
      })
      let info = { pages: 0 }
      try {
        info = await pdfInfo(targetAbs, config)
      } catch {
        info = { pages: 0 }
      }
      const meta = {
        id,
        title: safeFileName(upload.name),
        fileName,
        fileSize: uploadInfo.size,
        vaultPath: '',
        vaultExists: false,
        storageMode: 'local',
        syncState: 'local-only',
        sourceAsset: '',
        pageCount: info.pages || 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        status: 'processing',
        phase: 'extract',
        progress: { label: '已导入本地缓存，准备解析…', done: 0, total: 1 },
        scanned: false,
        chars: 0,
        ocrDone: 0,
        ocrTotal: 0,
        authors: [],
        year: null,
        venue: '',
        doi: '',
        abstract: '',
        keywords: [],
        tags: [],
        tldr: '',
        outline: [],
        analysisReady: false,
        analysisError: '',
        error: '',
        summaryPath: '',
        summarizedAt: '',
        chatCount: 0,
      }
      await writeJson(path.join(dir, 'meta.json'), meta)
      metaCache.set(id, meta)
      startProcessing(id)
      json(res, 200, { paper: publicPaper(meta), localOnly: true })
      return
    }
    if (existing?.vaultPath) {
      await unlink(upload.file).catch(() => {})
      const existingMeta = await loadMeta(existing.id)
      if (existingMeta.status === 'processing' && !jobs.has(existing.id)) startProcessing(existing.id)
      json(res, 200, { paper: publicPaper(existingMeta), deduped: true })
      return
    }
    const legacyExisting = existing && !existing.vaultPath ? existing : undefined
    const folder = normalizeRel(upload.folder || config.importFolder || '')
    if (folder) {
      await mkdir(safeVaultPath(vault.path, folder), { recursive: true })
    }
    const base = safeFileName(upload.name.replace(/\.pdf$/i, ''), 'paper')
    let fileName = `${base}.pdf`
    let targetRel = relJoin(folder, fileName)
    let targetAbs = safeVaultPath(vault.path, targetRel)
    let targetExists = existsSync(targetAbs)
    let targetReady = !targetExists
    if (targetExists) {
      const targetHash = await sha256File(targetAbs).catch(() => '')
      if (targetHash === sha256) targetReady = true
      if (!targetReady) {
        for (let index = 2; index < 100; index += 1) {
          fileName = `${base} (${index}).pdf`
          targetRel = relJoin(folder, fileName)
          targetAbs = safeVaultPath(vault.path, targetRel)
          if (!existsSync(targetAbs)) {
            targetExists = false
            targetReady = true
            break
          }
          if ((await sha256File(targetAbs).catch(() => '')) === sha256) {
            targetExists = true
            targetReady = true
            break
          }
        }
      }
    }
    if (!targetReady) {
      await unlink(upload.file).catch(() => {})
      throw new HttpError(409, '同名文件过多，请先整理该文件夹')
    }
    if (!targetExists) {
      try {
        await rename(upload.file, targetAbs)
      } catch {
        await copyFile(upload.file, targetAbs)
        await unlink(upload.file).catch(() => {})
      }
    } else {
      await unlink(upload.file).catch(() => {})
    }
    invalidateVaultCache()
    const existingAtTarget = (await listMetaRecords()).find((item) => item.vaultPath === targetRel)
    if (existingAtTarget) {
      if (existingAtTarget.status === 'processing' && !jobs.has(existingAtTarget.id)) {
        startProcessing(existingAtTarget.id)
      }
      json(res, 200, { paper: publicPaper(existingAtTarget), deduped: true })
      return
    }
    if (legacyExisting) {
      const legacyMeta = await loadMeta(legacyExisting.id)
      legacyMeta.vaultPath = targetRel
      legacyMeta.vaultExists = true
      legacyMeta.fileName = fileName
      legacyMeta.fileSize = uploadInfo.size
      legacyMeta.sha256 = sha256
      legacyMeta.sourceAsset = ''
      if (!legacyMeta.pageCount) {
        const details = await pdfInfo(targetAbs, config).catch(() => ({ pages: 0 }))
        legacyMeta.pageCount = details.pages || 0
      }
      await saveMeta(legacyMeta)
      if (legacyMeta.status === 'processing' && !jobs.has(legacyMeta.id)) startProcessing(legacyMeta.id)
      json(res, 200, { paper: publicPaper(legacyMeta), deduped: true })
      return
    }
    const id = slugForPaper(fileName)
    const dir = paperDirOf(id)
    await mkdir(dir, { recursive: true })
    const pdf = targetAbs
    let info = { pages: 0 }
    try {
      info = await pdfInfo(pdf, config)
    } catch {
      info = { pages: 0 }
    }
    const meta = {
      id,
      title: safeFileName(upload.name),
      fileName,
      fileSize: uploadInfo.size,
      sha256,
      vaultPath: targetRel,
      vaultExists: true,
      storageMode: 'obsidian',
      syncState: 'synced',
      sourceAsset: '',
      pageCount: info.pages || 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      status: 'processing',
      phase: 'extract',
      progress: { label: '已导入，准备解析…', done: 0, total: 1 },
      scanned: false,
      chars: 0,
      ocrDone: 0,
      ocrTotal: 0,
      authors: [],
      year: null,
      venue: '',
      doi: '',
      abstract: '',
      keywords: [],
      tags: [],
      tldr: '',
      outline: [],
      analysisReady: false,
      analysisError: '',
      error: '',
      summaryPath: '',
      summarizedAt: '',
      chatCount: 0,
    }
    await writeJson(path.join(dir, 'meta.json'), meta)
    metaCache.set(id, meta)
    startProcessing(id)
    json(res, 200, { paper: publicPaper(meta) })
  }

  async function handleVaultOpen(req, res) {
    const body = await readJsonBody(req, 1024 * 1024)
    const rel = normalizeRel(body.rel)
    if (!rel) throw new HttpError(400, '缺少 PDF 路径')
    const paper = await openVaultPdf(rel)
    json(res, 200, { paper })
  }

  async function handleVaultEdit(req, res) {
    const body = await readJsonBody(req, 1024 * 1024)
    const vault = await getVaultInfo()
    if (!vault) throw new HttpError(400, '未找到 Obsidian 库')
    const records = await listMetaRecords()
    const oldRel = normalizeRel(body.rel)
    const sameName = records.filter((meta) => meta.fileName === baseNameRel(oldRel))
    const record =
      records.find((meta) => meta.vaultPath === oldRel) ||
      (sameName.length === 1 ? sameName[0] : undefined)
    const result = await editVaultItem({
      vault: vault.path,
      dataDir: dirs.dataDir,
      pdfRel: oldRel,
      fileName: body.fileName,
      title: body.title,
      tags: body.tags,
      summaryPath: record?.summaryPath || '',
      renameNote: typeof body.renameNote === 'boolean' ? body.renameNote : undefined,
    })
    if (record) {
      record.vaultPath = result.rel
      record.fileName = baseNameRel(result.rel)
      record.title = result.title
      record.tags = result.tags
      record.vaultExists = true
      record.sourceAsset = ''
      const info = await stat(safeVaultPath(vault.path, result.rel)).catch(() => undefined)
      if (info) record.fileSize = info.size
      // Spec §12.2: a canonical summary renamed alongside the PDF moved on disk,
      // so the absolute `meta.summaryPath` has to follow or every later read
      // (GET /summary, open-note) targets a path that no longer exists.
      if (result.summaryRenamedPath && existsSync(result.summaryRenamedPath)) {
        record.summaryPath = result.summaryRenamedPath
      }
      // The reader note rename follows the same tripod rule. `editVaultItem`
      // does not return its new path, so drop a stale absolute path and let
      // `resolveReaderNotePath` re-derive it from `meta.vaultPath` (it adopts by
      // paper_id), then record the fresh one.
      if (record.readerNotePath && !existsSync(record.readerNotePath)) {
        const resolvedNote = await resolveReaderNotePath({
          vaultPath: vault.path,
          notesFolder: config.notesFolder,
          meta: record,
        }).catch(() => undefined)
        if (resolvedNote) {
          record.readerNotePath = resolvedNote.path
          record.readerNoteRelative = resolvedNote.relative
        }
      }
      await saveMeta(record)
      if (record.summaryPath && existsSync(record.summaryPath)) {
        try {
          const before = await readFile(record.summaryPath, 'utf8')
          const after = setFrontmatterFields(before, {
            title: result.title,
            tags: result.tags,
          })
          if (after !== before) await writeFileAtomic(record.summaryPath, after)
        } catch {
          // Summary metadata is best-effort; the report itself is untouched.
        }
      }
    }
    json(res, 200, {
      ok: true,
      ...result,
      paper: record ? publicPaper(record) : null,
    })
  }

  async function handleVaultOpenNote(req, res) {
    const body = await readJsonBody(req, 1024 * 1024)
    const vault = await getVaultInfo()
    if (!vault) throw new HttpError(400, '未找到 Obsidian 库')
    const rel = normalizeRel(body.rel)
    if (!/\.md$/i.test(rel)) throw new HttpError(400, '不是 Markdown 笔记')
    const abs = safeVaultPath(vault.path, rel)
    if (!existsSync(abs)) throw new HttpError(404, '笔记不存在')
    const opened = await openInObsidian(vault, abs)
    json(res, 200, { ok: true, ...opened })
  }

  async function handleVaultFolder(req, res) {
    const body = await readJsonBody(req, 1024 * 1024)
    const vault = await getVaultInfo()
    if (!vault) throw new HttpError(400, '未找到 Obsidian 库')
    const rel = await createVaultFolder(vault.path, body.parent, body.name)
    invalidateVaultCache()
    json(res, 200, { ok: true, rel })
  }

  async function recordsForPdfs(pdfs) {
    if (!pdfs.length) return []
    const records = await listMetaRecords()
    const byVault = new Map(records.filter((meta) => meta.vaultPath).map((meta) => [meta.vaultPath, meta]))
    const byNameSize = new Map()
    for (const meta of records) {
      if (!meta.fileName || !meta.fileSize) continue
      const key = `${meta.fileName}\u0000${meta.fileSize}`
      const previous = byNameSize.get(key)
      if (!previous || String(meta.updatedAt) > String(previous.updatedAt)) byNameSize.set(key, meta)
    }
    const found = new Map()
    for (const pdf of pdfs) {
      const record = byVault.get(pdf.rel) || byNameSize.get(`${pdf.fileName}\u0000${pdf.size}`)
      if (record) found.set(record.id, record)
    }
    return [...found.values()]
  }

  async function purgePaperCaches(records) {
    const ids = []
    for (const record of records) {
      if (!record?.id || !PAPER_ID_RE.test(record.id)) continue
      controllers.get(record.id)?.abort()
      controllers.delete(record.id)
      jobs.delete(record.id)
      for (const key of [...pageJobs.keys()]) {
        if (key.startsWith(`${record.id}:`)) pageJobs.delete(key)
      }
      await rm(paperDirOf(record.id), { recursive: true, force: true }).catch(() => {})
      metaCache.delete(record.id)
      ids.push(record.id)
    }
    return ids
  }

  async function touchSummaryPaths(summaryPath, replace) {
    if (!summaryPath || !existsSync(summaryPath)) return
    try {
      const before = await readFile(summaryPath, 'utf8')
      const after = replace(before)
      if (after !== before) await writeFileAtomic(summaryPath, after)
    } catch {
      // Summary metadata is best-effort; the report itself is untouched.
    }
  }

  async function handleVaultMove(req, res) {
    const body = await readJsonBody(req, 1024 * 1024)
    const vault = await getVaultInfo()
    if (!vault) throw new HttpError(400, '未找到 Obsidian 库')
    const oldRel = normalizeRel(body.rel)
    // Look the record up *before* the move: `moveVaultEntry` needs `paperId` to
    // find `_附件/<id>/`, and afterwards the old `vaultPath` is already gone.
    const records = await listMetaRecords()
    const record = records.find((meta) => meta.vaultPath === oldRel)
    const result = await moveVaultEntry({
      vault: vault.path,
      dataDir: dirs.dataDir,
      rel: body.rel,
      folder: body.folder,
      kind: body.kind,
      paperId: record?.id || '',
    })
    let recordId = ''
    if (result.changed && record) {
      record.vaultPath = result.rel
      record.vaultExists = true
      const info = await stat(safeVaultPath(vault.path, result.rel)).catch(() => undefined)
      if (info) record.fileSize = info.size
      // Spec §12.2/§12.4: the tripod moved with the PDF, so the absolute paths
      // the client opens must follow. `moved[]` reports what actually moved, so
      // this never invents a path for a file that stayed behind.
      const movedTo = (kind) => (result.moved || []).find((item) => item.kind === kind)?.to || ''
      const summaryTo = movedTo('summary')
      const noteTo = movedTo('note')
      if (summaryTo) record.summaryPath = safeVaultPath(vault.path, summaryTo)
      if (noteTo) {
        record.readerNotePath = safeVaultPath(vault.path, noteTo)
        record.readerNoteRelative = noteTo
      }
      await saveMeta(record)
      recordId = record.id
      await touchSummaryPaths(record.summaryPath, (content) =>
        content.split(result.oldRel).join(result.rel),
      )
    } else if (!result.changed) {
      // Nothing moved: still answer with the record so the client can refresh.
      recordId = record?.id || ''
    }
    invalidateVaultCache()
    json(res, 200, { ok: true, ...result, paperId: recordId })
  }

  async function handleVaultRenameFolder(req, res) {
    const body = await readJsonBody(req, 1024 * 1024)
    const vault = await getVaultInfo()
    if (!vault) throw new HttpError(400, '未找到 Obsidian 库')
    const result = await renameVaultFolder({
      vault: vault.path,
      dataDir: dirs.dataDir,
      rel: body.rel,
      name: body.name,
    })
    let updated = 0
    if (result.changed) {
      const rebaseValue = (value) => {
        if (!value) return value
        if (value === result.oldRel) return result.rel
        if (value.startsWith(`${result.oldRel}/`)) {
          return `${result.rel}${value.slice(result.oldRel.length)}`
        }
        return value
      }
      const records = await listMetaRecords()
      for (const record of records) {
        if (!record.vaultPath) continue
        if (record.vaultPath !== result.oldRel && !record.vaultPath.startsWith(`${result.oldRel}/`)) continue
        const next = `${result.rel}${record.vaultPath.slice(result.oldRel.length)}`
        record.vaultPath = next
        record.vaultExists = true
        // summaryPath is absolute, so a rename inside the vault must rebase it or
        // /papers/:id/open-note starts returning 404 for an existing summary.
        if (record.summaryPath) record.summaryPath = rebaseValue(record.summaryPath)
        await saveMeta(record)
        updated += 1
        await touchSummaryPaths(record.summaryPath, (content) =>
          content.split(`${result.oldRel}/`).join(`${result.rel}/`),
        )
      }
      // The default import folder is a live path too: leaving it stale makes the
      // next import silently recreate the folder the user just renamed away.
      if (config.importFolder) {
        const rebased = rebaseValue(config.importFolder)
        if (rebased !== config.importFolder) config.importFolder = rebased
      }
    }
    invalidateVaultCache()
    json(res, 200, { ok: true, ...result, updated })
  }

  async function handleVaultDelete(req, res) {
    const body = await readJsonBody(req, 1024 * 1024)
    if (body.confirm !== true) throw new HttpError(400, '删除需要二次确认')
    const kind = body.kind
    if (!['pdf', 'note', 'folder'].includes(kind)) throw new HttpError(400, '不支持的删除类型')
    const vault = await getVaultInfo()
    if (!vault) throw new HttpError(400, '未找到 Obsidian 库')
    const rel = normalizeRel(body.rel)
    if (!rel) throw new HttpError(400, '缺少路径')
    const scan = await scanVault(vault.path, { refresh: true })
    let pdfs = []
    let relatedNotes = []
    let folderNotes = []
    if (kind === 'pdf') {
      const pdf = scan.pdfs.find((item) => item.rel === rel)
      if (!pdf) throw new HttpError(404, 'Vault 中找不到这篇 PDF')
      pdfs = [pdf]
      relatedNotes = relatedNotesForPdf(pdf, scan.notes)
    } else if (kind === 'folder') {
      pdfs = scan.pdfs.filter((item) => item.rel.startsWith(`${rel}/`))
      // The folder is deleted wholesale, including its notes; enumerate them so
      // the caller can report exactly what disappears before it happens.
      folderNotes = scan.notes.filter((item) => item.rel.startsWith(`${rel}/`))
    }
    const affected = await recordsForPdfs(pdfs)
    if (kind === 'folder' || kind === 'note') {
      // A record can still point inside the deleted subtree while its file is
      // already gone from the vault (renamed outside the plugin, or deleted in
      // Obsidian). Matching only scanned PDFs would leave that cache behind and
      // the library would show it as a phantom detached entry afterwards.
      const known = new Set(affected.map((record) => record.id))
      for (const record of await listMetaRecords()) {
        if (!record?.id || known.has(record.id)) continue
        const vaultPath = record.vaultPath || ''
        const inside =
          kind === 'folder'
            ? vaultPath === rel || vaultPath.startsWith(`${rel}/`)
            : vaultPath === rel
        if (!inside) continue
        known.add(record.id)
        affected.push(record)
      }
    }
    if (affected.some((record) => record.status === 'processing' || jobs.has(record.id))) {
      throw new HttpError(409, '有文献正在处理中，请完成后再删除')
    }
    const deleted = []
    const warnings = []
    if (kind === 'folder' || kind === 'note') {
      deleted.push(await deleteVaultEntry({ vault: vault.path, dataDir: dirs.dataDir, rel, kind }))
    } else {
      deleted.push(await deleteVaultEntry({ vault: vault.path, dataDir: dirs.dataDir, rel, kind: 'pdf' }))
      if (body.deleteNotes === true) {
        for (const note of relatedNotes) {
          try {
            deleted.push(
              await deleteVaultEntry({ vault: vault.path, dataDir: dirs.dataDir, rel: note.rel, kind: 'note' }),
            )
          } catch (error) {
            warnings.push(`${note.rel}: ${errorMessage(error)}`)
          }
        }
      }
    }
    const removedPaperIds = await purgePaperCaches(affected)
    invalidateVaultCache()
    json(res, 200, {
      ok: true,
      kind,
      rel,
      deleted,
      deletedNotes: deleted.filter((item) => item.kind === 'note').map((item) => item.rel),
      relatedNotes: relatedNotes.map((item) => item.rel),
      folderNotes: folderNotes.map((item) => item.rel),
      folderPdfs: pdfs.map((item) => item.rel),
      removedPaperIds,
      warnings,
    })
  }

  async function dispatch(req, res) {
    if (!req.url) throw new HttpError(404, 'Not found')
    const url = new URL(req.url, 'http://127.0.0.1')
    if (!url.pathname.startsWith(PREFIX)) throw new HttpError(404, 'Not found')
    const tail = url.pathname.slice(PREFIX.length)
    const segments = tail
      .split('/')
      .filter(Boolean)
      .map((segment) => {
        try {
          return decodeURIComponent(segment)
        } catch {
          return segment
        }
      })
    if (segments[0] !== 'api') throw new HttpError(404, 'Not found')
    const method = req.method || 'GET'
    if (segments.length === 2 && segments[1] === 'review-source') {
      const site = req.headers['sec-fetch-site']
      const expectedOrigin = `${req.socket?.encrypted ? 'https' : 'http'}://${req.headers.host}`
      if (['cross-site', 'same-site'].includes(site) || req.headers.origin && req.headers.origin !== expectedOrigin) throw new HttpError(403, '拒绝跨站请求')
      if (method !== 'GET') throw new HttpError(405, '仅支持 GET')
      try { json(res, 200, { ok: true, ...await reviewSource(url) }) }
      catch (error) { throw new HttpError(error.status || 500, error.message) }
      return
    }
    if (segments[1] === 'vault') {
      await ready
      if (await managementApi(req, res, url, segments)) return
    }
    if (segments.length === 2 && segments[1] === 'health' && method === 'GET') {
      await preferenceReady
      const popplerDir = await resolvePoppler(config).catch(() => undefined)
      const vault = await getVaultInfo()
      const selection = ai.selection()
      const effortOptions = await ai.effortOptions(selection).catch(() => ({ efforts: [], defaultEffort: '' }))
      json(res, 200, {
        ok: true,
        version: VERSION,
        model: `${selection.provider}/${selection.model}`,
        provider: selection.provider,
        modelId: selection.model,
        dataDir: dirs.dataDir,
        poppler: Boolean(popplerDir),
        popplerDir: popplerDir || '',
        vaultPath: vault?.path || '',
        vaultName: vault?.name || '',
        vaultExists: Boolean(vault?.exists),
        vaultIsObsidian: Boolean(vault?.isVault),
        notesFolder: config.notesFolder,
        wordNote: config.wordNote,
        importFolder: config.importFolder || '',
        autoOpenObsidian: config.autoOpenObsidian,
        lastCall: ai.lastCall || null,
        supportImages: await ai.supportsImages().catch(() => false),
        reasoningEfforts: effortOptions.efforts.map((item) => item.id),
        effortLabels: effortOptions.efforts,
        defaultEffort: effortOptions.defaultEffort || null,
        activeEffort: await ai.effortFor().catch(() => ''),
        preference: ai.getPreference(),
        configSelection: {
          provider: config.provider || '',
          model: config.model || '',
          reasoningEffort: config.reasoningEffort || '',
        },
      })
      return
    }
    if (segments.length === 2 && segments[1] === 'models' && method === 'GET') {
      await preferenceReady
      const groups = await ai.listModels()
      // Effort levels are advertised per model, so the picker needs them up
      // front for every route rather than fetching one at a time on hover.
      const detailed = await Promise.all(
        groups.map(async (group) => ({
          ...group,
          models: await Promise.all(
            group.models.map(async (model) => {
              const options = await ai
                .effortOptions({ provider: group.provider, model: model.id })
                .catch(() => ({ efforts: [], defaultEffort: '' }))
              return {
                ...model,
                reasoningEfforts: options.efforts,
                defaultEffort: options.defaultEffort || '',
              }
            }),
          ),
        })),
      )
      json(res, 200, {
        groups: detailed,
        providers: ctx.llm.listProviders(),
        preference: ai.getPreference(),
        selection: ai.selection(),
        activeEffort: await ai.effortFor().catch(() => ''),
      })
      return
    }
    if (segments.length === 2 && segments[1] === 'models' && method === 'PUT') {
      await preferenceReady
      const body = await readJsonBody(req, 64 * 1024)
      const next = normalizePreference(body)
      if (!next.provider || !next.model) throw new HttpError(400, '请选择模型')
      const groups = await ai.listModels()
      const group = groups.find((item) => item.provider === next.provider)
      if (!group) throw new HttpError(400, `未知的模型服务：${next.provider}`)
      if (!group.models.some((item) => item.id === next.model)) {
        throw new HttpError(400, `该服务下没有模型：${next.model}`)
      }
      // Validate the effort against the route being selected before anything is
      // written: an unsupported level would otherwise reject every later call.
      // A route that advertises no efforts keeps no stale level either.
      const effortOptions = await ai
        .effortOptions({ provider: next.provider, model: next.model })
        .catch(() => ({ known: true, efforts: [], defaultEffort: '' }))
      const known = effortOptions.efforts.map((item) => item.id)
      if (next.reasoningEffort && effortOptions.known) {
        if (known.length === 0) next.reasoningEffort = ''
        else if (!known.includes(next.reasoningEffort)) {
          throw new HttpError(400, `该模型不支持思考强度：${next.reasoningEffort}`)
        }
      }
      const saved = await writePreference(dirs.dataDir, next)
      ai.setPreference(saved)
      json(res, 200, {
        ok: true,
        preference: saved,
        selection: ai.selection(),
        supportImages: await ai.supportsImages().catch(() => false),
        reasoningEfforts: known,
        effortLabels: effortOptions.efforts,
        defaultEffort: effortOptions.defaultEffort || null,
        activeEffort: await ai.effortFor().catch(() => ''),
      })
      return
    }
    if (segments.length === 2 && segments[1] === 'library' && method === 'GET') {
      json(res, 200, { papers: await listLibrary() })
      return
    }
    if (segments.length === 3 && segments[1] === 'vault' && segments[2] === 'library' && method === 'GET') {
      const refresh = url.searchParams.get('refresh') === '1'
      json(res, 200, await buildVaultLibrary(refresh))
      return
    }
    if (segments.length === 3 && segments[1] === 'vault' && segments[2] === 'open' && method === 'POST') {
      await handleVaultOpen(req, res)
      return
    }
    if (segments.length === 3 && segments[1] === 'vault' && segments[2] === 'item' && method === 'PATCH') {
      await handleVaultEdit(req, res)
      return
    }
    if (segments.length === 3 && segments[1] === 'vault' && segments[2] === 'open-note' && method === 'POST') {
      await handleVaultOpenNote(req, res)
      return
    }
    if (segments.length === 3 && segments[1] === 'vault' && segments[2] === 'folder' && method === 'POST') {
      await handleVaultFolder(req, res)
      return
    }
    if (
      segments.length === 4 &&
      segments[1] === 'vault' &&
      segments[2] === 'item' &&
      segments[3] === 'move' &&
      method === 'POST'
    ) {
      await handleVaultMove(req, res)
      return
    }
    if (
      segments.length === 4 &&
      segments[1] === 'vault' &&
      segments[2] === 'folder' &&
      segments[3] === 'rename' &&
      method === 'POST'
    ) {
      await handleVaultRenameFolder(req, res)
      return
    }
    if (segments.length === 3 && segments[1] === 'vault' && segments[2] === 'delete' && method === 'POST') {
      await handleVaultDelete(req, res)
      return
    }
    if (segments.length === 3 && segments[1] === 'import' && segments[2] === 'start' && method === 'POST') {
      await handleImportStart(req, res)
      return
    }
    if (segments.length === 3 && segments[1] === 'import' && segments[2] === 'chunk' && method === 'POST') {
      await handleImportChunk(req, res)
      return
    }
    if (segments.length === 3 && segments[1] === 'import' && segments[2] === 'finish' && method === 'POST') {
      await handleImportFinish(req, res)
      return
    }
    if (segments[1] === 'papers' && segments[2]) {
      const id = segments[2]
      if (!PAPER_ID_RE.test(id)) throw new HttpError(400, '无效的文献编号')
      await handlePaperRoute(req, res, id, segments.slice(3))
      return
    }
    throw new HttpError(404, '接口不存在')
  }

  const disposeRoute = ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: async (req, res) => {
      try {
        await dispatch(req, res)
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 500
        if (res.headersSent) {
          if (!res.writableEnded) res.end()
          return
        }
        json(res, status, { error: errorMessage(error) })
      }
    },
  })

  ctx.effect(() => {
    ready.catch((error) => console.error('[literature-reader] cannot create data directory', error))
    return () => {
      disposeRoute()
      for (const controller of controllers.values()) controller.abort()
      controllers.clear()
    }
  }, 'literature-reader: storage and web routes')
}
