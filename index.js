import { createReadStream, existsSync } from 'node:fs'
import { appendFile, copyFile, link, mkdir, open, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { LiteratureAI } from './lib/ai.js'
import {
  buildFullText,
  ensurePageImage,
  extractPdfText,
  looksScanned,
  pdfInfo,
  resolvePoppler,
} from './lib/pdf.js'
import { detectVault, openInObsidian, writeSummaryNote } from './lib/obsidian.js'
import {
  DEFAULT_WORD_NOTE,
  extractVocabularyAnswer,
  isVocabularyKind,
  looksLikeVocabularyAnswer,
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
const VERSION = '1.4.0'
const MAX_UPLOAD = 350 * 1024 * 1024

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
    summarizedAt: meta.summarizedAt || '',
    chatCount: meta.chatCount || 0,
    sha256: meta.sha256 || '',
    sourceAsset: meta.sourceAsset || '',
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
  const ready = ensureBaseDirs(dirs)
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
      meta.title = result.metadata.title || meta.title
      meta.authors = result.metadata.authors?.length ? result.metadata.authors : meta.authors || []
      meta.year = result.metadata.year || meta.year || null
      meta.venue = result.metadata.venue || meta.venue || ''
      meta.doi = result.metadata.doi || meta.doi || ''
      meta.abstract = result.metadata.abstract || meta.abstract || ''
      meta.keywords = result.metadata.keywords?.length ? result.metadata.keywords : meta.keywords || []
      meta.tags = mergeTags(meta.tags, result.metadata.tags, result.metadata.keywords)
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
    for (const entry of entries) {
      if (!entry.isDirectory() || !PAPER_ID_RE.test(entry.name)) continue
      const meta = await readJson(path.join(dirs.papersDir, entry.name, 'meta.json'))
      if (meta?.id) records.push(meta)
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
    if (!vault) throw new HttpError(400, '未找到 Obsidian 库')
    const scan = await scanVault(vault.path, { refresh })
    const records = await listMetaRecords()
    const byVault = new Map(records.filter((meta) => meta.vaultPath).map((meta) => [meta.vaultPath, meta]))
    const byNameSize = new Map()
    for (const meta of records) {
      if (!meta.fileName || !meta.fileSize) continue
      const key = `${meta.fileName}\u0000${meta.fileSize}`
      const previous = byNameSize.get(key)
      if (!previous || String(meta.updatedAt) > String(previous.updatedAt)) byNameSize.set(key, meta)
    }
    const matched = new Set()
    const pdfs = []
    for (const pdf of scan.pdfs) {
      let record = byVault.get(pdf.rel)
      if (!record) {
        record = byNameSize.get(`${pdf.fileName}\u0000${pdf.size}`)
        if (record && !record.vaultPath) {
          record.vaultPath = pdf.rel
          record.sourceAsset = ''
          record.vaultExists = true
          await saveMeta(record).catch(() => {})
        }
      }
      if (record && record.vaultPath !== pdf.rel) {
        record.vaultPath = pdf.rel
        record.vaultExists = true
        await saveMeta(record).catch(() => {})
      }
      if (record) matched.add(record.id)
      const title =
        (pdf.noteExplicitTitle && pdf.noteTitle && pdf.noteTitle.trim()) ||
        record?.title ||
        (record?.fileName ? record.fileName.replace(/\.pdf$/i, '') : pdf.title)
      const tags = uniqueTags(pdf.tags, record?.tags)
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
    let record = records.find((meta) => meta.vaultPath === normalized) ||
      records.find((meta) => meta.sha256 === sha256)
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

  async function handleSummary(req, res, id) {
    if (busy.has(id)) throw new HttpError(409, '当前还有回答或总结正在生成，请稍候')
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
      const result = await ai.summarize({
        meta,
        pages: textState.pages,
        analysis,
        history: chat,
        signal: controller.signal,
      })
      if (!result.body.trim()) throw new Error('AI 没有返回有效的总结内容')
      const summaryPath = path.join(dir, 'summary.md')
      await writeFileAtomic(summaryPath, `${result.body.trim()}\n`)
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
          body: result.body,
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
        chars: result.body.length,
        path: note?.path || '',
        relative: note?.relative || '',
        obsidianUrl: note ? `${API_PREFIX}/papers/${id}/open-note` : '',
        opened: Boolean(openResult),
        openError,
        hasNote: Boolean(note),
        localSummary: summaryPath,
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
        const vaultPreserved = Boolean(meta.vaultPath)
        await rm(dir, { recursive: true, force: true })
        metaCache.delete(id)
        json(res, 200, { ok: true, vaultPreserved })
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
    if (resource === 'summary' && method === 'POST') {
      await handleSummary(req, res, id)
      return
    }
    if (resource === 'summary' && method === 'GET') {
      const summary = await readFile(path.join(dir, 'summary.md'), 'utf8').catch(() => '')
      if (!summary) throw new HttpError(404, '还没有生成总结')
      json(res, 200, { markdown: summary, path: meta.summaryPath || '' })
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
    if (!vault) throw new HttpError(400, '未找到 Obsidian 库，无法导入到 vault')
    const sha256 = await sha256File(upload.file)
    const existing = (await listMetaRecords()).find((item) => item.sha256 === sha256)
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
    const result = await moveVaultEntry({
      vault: vault.path,
      dataDir: dirs.dataDir,
      rel: body.rel,
      folder: body.folder,
      kind: body.kind,
    })
    let recordId = ''
    if (result.changed) {
      const records = await listMetaRecords()
      const record = records.find((meta) => meta.vaultPath === result.oldRel)
      if (record) {
        record.vaultPath = result.rel
        record.vaultExists = true
        const info = await stat(safeVaultPath(vault.path, result.rel)).catch(() => undefined)
        if (info) record.fileSize = info.size
        await saveMeta(record)
        recordId = record.id
        await touchSummaryPaths(record.summaryPath, (content) =>
          content.split(result.oldRel).join(result.rel),
        )
      }
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
