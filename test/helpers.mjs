import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { Writable } from 'node:stream'
import os from 'node:os'
import path from 'node:path'
import { apply } from '../index.js'

// Shared harness for the host API tests.
//
// Every test gets its own temp data directory, its own temp "vault" and its
// own scripted fake plugin context, so cases never share mutable state and
// never touch the real Obsidian vault or the real DSH-Literature data.
//
// The fake context implements exactly what `apply()` and the routes use:
//   webServer.register  capture the prefix handler
//   llm.stream          replay scripted answers as SSE chunks
//   attachments         in-memory saveImage / saveImages
//   agentDefaultModel   a fixed selection
//   effect              run the disposer callback

export const PAPER_ID = 'paper-test-001'
export const NOTES_FOLDER = '文献阅读'
export const DEFAULT_PAPER_TITLE = '均衡器与高速链路（测试文献）'

// 1x1 transparent PNG: valid magic number and IHDR, enough for the upload path.
export const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

// A small JPEG (SOI + padding) is enough for the magic-number check.
export const JPEG_BYTES = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  Buffer.alloc(16, 0x20),
  Buffer.from([0xff, 0xd9]),
])

export function dataUrl(buffer, mediaType = 'image/png') {
  return `data:${mediaType};base64,${buffer.toString('base64')}`
}

/**
 * Fake plugin context. `script` is a list of model answers; each `llm.stream`
 * call consumes one entry, and the last entry repeats forever so a retry
 * (strict-JSON calls retry once) still sees a deterministic answer.
 */
export function createFakeContext({ script = [], images = true, contextWindow = 128_000 } = {}) {
  const calls = []
  const routes = []
  const disposers = []
  const localeDicts = new Map()
  const slots = []
  const savedImages = []
  let queue = [...script]

  const ctx = {
    attachments: {
      async saveImage({ data, mediaType, name }) {
        const attachment = { id: `att-${savedImages.length + 1}`, mediaType, name }
        savedImages.push({ data, mediaType, name, attachment })
        return attachment
      },
      async saveImages(items) {
        const out = []
        for (const item of items) {
          out.push(await ctx.attachments.saveImage(item))
        }
        return out
      },
    },
    agentDefaultModel: {
      currentSelection: () => ({ provider: 'test-provider', model: 'test-model' }),
    },
    llm: {
      listProviders: () => [{ id: 'test-provider', name: 'Test Provider' }],
      listModels: async () => [
        { id: 'test-model', name: 'Test Model', inputModalities: images ? ['text', 'image'] : ['text'] },
      ],
      resolveModelInfo: async (provider, model) => ({
        provider,
        id: model,
        inputModalities: images ? ['text', 'image'] : ['text'],
        context: { contextWindow },
      }),
      async *stream(options) {
        calls.push(options)
        const answer = queue.length > 1 ? queue.shift() : queue[0] ?? ''
        yield { type: 'text-delta', text: answer }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
    webServer: {
      register(route) {
        routes.push(route)
        return () => {}
      },
    },
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose)
      return dispose
    },
  }

  return {
    ctx,
    calls,
    routes,
    slots,
    localeDicts,
    savedImages,
    disposers,
    get queue() {
      return queue
    },
    script(answers) {
      queue = [...answers]
    },
    pushScript(...answers) {
      queue.push(...answers)
    },
  }
}

/** Capture response: a Writable so `createReadStream().pipe(res)` also works. */
class CaptureResponse extends Writable {
  constructor() {
    super()
    this.chunks = []
    this.statusCode = 200
    this.headers = {}
    this.headersSent = false
  }

  writeHead(status, headers) {
    this.statusCode = status
    this.headersSent = true
    // Real Node responses expose header names lower-cased; mirror that so
    // assertions read like they would against a live server.
    for (const [key, value] of Object.entries(headers || {})) {
      this.headers[String(key).toLowerCase()] = value
    }
    return this
  }

  setHeader(key, value) {
    this.headers[String(key).toLowerCase()] = value
  }

  getHeader(key) {
    return this.headers[String(key).toLowerCase()]
  }

  getHeaders() {
    return { ...this.headers }
  }

  _write(chunk, _encoding, callback) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    callback()
  }

  get body() {
    return Buffer.concat(this.chunks)
  }

  get text() {
    return this.body.toString('utf8')
  }
}

function makeRequest(method, url, body) {
  let buffer = Buffer.alloc(0)
  if (body !== undefined) {
    buffer = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body), 'utf8')
  }
  const req = {
    method,
    url,
    headers: {
      'content-length': String(buffer.length),
      'content-type': 'application/json',
    },
    async *[Symbol.asyncIterator]() {
      if (buffer.length) yield buffer
    },
  }
  return req
}

/** Parse every `data: {...}` SSE line; ignores comments and blank frames. */
export function parseSse(text) {
  const events = []
  for (const frame of String(text || '').split('\n\n')) {
    const lines = frame.split('\n').filter((line) => line.startsWith('data:'))
    for (const line of lines) {
      const payload = line.slice(5).trim()
      if (!payload) continue
      try {
        events.push(JSON.parse(payload))
      } catch {
        events.push({ type: 'unparsed', payload })
      }
    }
  }
  return events
}

function normalizeResponse(res) {
  const text = res.text
  const contentType = String(res.headers['content-type'] || '')
  const result = {
    status: res.statusCode,
    headers: res.headers,
    body: res.body,
    text,
    contentType,
    events: [],
    get sse() {
      return contentType.includes('event-stream')
    },
    json() {
      try {
        return JSON.parse(text)
      } catch {
        throw new Error(`response is not JSON: ${text.slice(0, 400)}`)
      }
    },
  }
  if (contentType.includes('event-stream')) result.events = parseSse(text)
  return result
}

async function waitForResponse(res) {
  if (res.writableFinished) return
  await Promise.race([once(res, 'finish'), once(res, 'close'), new Promise((resolve) => setTimeout(resolve, 3_000))])
}

/**
 * Boot one isolated plugin instance.
 *
 * `vault: false` points `obsidianVault` at a path that does not exist, which
 * is how the spec models "vault unavailable" (config present, folder gone).
 */
export async function createApp({ script = [], vault = true, images = true, config = {} } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lr-host-'))
  const dataDir = path.join(root, 'data')
  const vaultPath = path.join(root, vault ? 'vault' : 'missing-vault')
  if (vault) await mkdir(path.join(vaultPath, '.obsidian'), { recursive: true })

  const fake = createFakeContext({ script, images })
  const pluginConfig = {
    dataDir,
    obsidianVault: vaultPath,
    notesFolder: NOTES_FOLDER,
    // Never launch a real Obsidian window from a test.
    autoOpenObsidian: false,
    maxSummaryFigures: 5,
    ...config,
  }
  apply(fake.ctx, pluginConfig)

  const route = fake.routes[0]
  if (!route) throw new Error('the plugin did not register a web route')
  if (!route.path.startsWith('/literature-reader')) {
    throw new Error(`unexpected route prefix: ${route.path}`)
  }

  const dispatch = async (method, urlPath, body) => {
    const req = makeRequest(method, `/literature-reader/api${urlPath}`, body)
    const res = new CaptureResponse()
    const done = (async () => {
      await route.handler(req, res)
      await waitForResponse(res)
      return normalizeResponse(res)
    })()
    return { res, req, done }
  }

  const request = async (method, urlPath, body) => {
    const { done } = await dispatch(method, urlPath, body)
    return done
  }

  const app = {
    root,
    dataDir,
    vaultPath,
    config: pluginConfig,
    ctx: fake.ctx,
    fake,
    calls: fake.calls,
    savedImages: fake.savedImages,
    route,
    request,
    /**
     * Fire a request without awaiting it, so a test can simulate the client
     * going away (`res.emit('close')`) while the handler is still running.
     */
    start: (method, urlPath, body) => dispatch(method, urlPath, body),
    get: (urlPath) => request('GET', urlPath),
    put: (urlPath, body) => request('PUT', urlPath, body),
    post: (urlPath, body) => request('POST', urlPath, body),
    delete: (urlPath) => request('DELETE', urlPath),
    script: (answers) => fake.script(answers),
    paperDir: (id = PAPER_ID) => path.join(dataDir, 'papers', id),
    readSummary: async (id = PAPER_ID) => readFile(path.join(app.paperDir(id), 'summary.md'), 'utf8'),
    readAnnotationsFile: async (id = PAPER_ID) => {
      const raw = await readFile(path.join(app.paperDir(id), 'summary-annotations.json'), 'utf8')
      return JSON.parse(raw)
    },
    readMeta: async (id = PAPER_ID) => JSON.parse(await readFile(path.join(app.paperDir(id), 'meta.json'), 'utf8')),
    async close() {
      for (const dispose of fake.disposers) {
        try {
          dispose()
        } catch {
          // best effort
        }
      }
      await rm(root, { recursive: true, force: true }).catch(() => undefined)
    },
  }
  return app
}

/**
 * Seed one processed paper: meta.json + text.json (+ optional source.pdf).
 * Returns the paper directory.
 */
export async function seedPaper(app, options = {}) {
  const {
    id = PAPER_ID,
    title = DEFAULT_PAPER_TITLE,
    pages = [
      {
        n: 1,
        text: '这是一篇关于高速链路均衡器的测试论文正文。文章讨论了 25 Gb/s 串行链路中信道衰减对眼图的影响，并给出了均衡器的设计取舍与实验结果，内容长度足以通过生成总结的最短字数校验。',
      },
    ],
    pageCount = pages.length,
    pdf = null,
    meta = {},
  } = options
  const dir = app.paperDir(id)
  await mkdir(dir, { recursive: true })
  const now = new Date().toISOString()
  const record = {
    id,
    title,
    fileName: `${title}.pdf`,
    fileSize: 1024,
    pageCount,
    createdAt: now,
    updatedAt: now,
    status: 'ready',
    phase: '',
    tags: ['均衡器'],
    authors: ['A. Author'],
    year: 2024,
    venue: 'IEEE Test',
    chars: pages.reduce((sum, page) => sum + (page.text || '').trim().length, 0),
    ...meta,
  }
  await writeFile(path.join(dir, 'meta.json'), JSON.stringify(record, null, 2), 'utf8')
  await writeFile(path.join(dir, 'text.json'), JSON.stringify({ pages }, null, 2), 'utf8')
  if (pdf !== null) {
    await writeFile(path.join(dir, 'source.pdf'), pdf, 'latin1')
  }
  return dir
}

// A minimal one-page PDF with a known MediaBox, so the real Poppler path can
// be exercised without shipping a binary fixture.
export function minimalPdf(widthPt = 300, heightPt = 200) {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt} ${heightPt}] /Contents 4 0 R >>\nendobj\n`,
    '4 0 obj\n<< /Length 44 >>\nstream\n1 0 0 RG 10 w 20 20 m 280 180 l S\nendstream\nendobj\n',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = []
  for (const body of objects) {
    offsets.push(pdf.length)
    pdf += body
  }
  const xrefStart = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  return pdf
}

/** The done event of one SSE response (throws when absent). */
export function doneEvent(response) {
  const done = response.events.find((event) => event.type === 'done')
  if (!done) {
    const error = response.events.find((event) => event.type === 'error')
    throw new Error(`no done event (error: ${error?.message || 'none'})`)
  }
  return done
}

/** The error event of one SSE response (throws when absent). */
export function errorEvent(response) {
  const error = response.events.find((event) => event.type === 'error')
  if (!error) throw new Error(`no error event: ${JSON.stringify(response.events).slice(0, 500)}`)
  return error
}

export const SAMPLE_NOTE = `# 均衡器学习笔记

> [!abstract] 速览
> **一句话**：均衡器补偿信道损耗。

## 1. 研究背景与问题

### 1.2 现有方法的不足（Gap）

高速串行链路中，信道会衰减高频分量 [p.2]，现有均衡器在 25 Gb/s 下功耗偏高。

## 4. 实验、数据与结果

### 4.2 主要结果

在 25 Gb/s 下眼图张开度提升 30% [p.7]。

## 5. 结论、论证强度与局限

结论是均衡能显著改善误码率 [p.9]。
`
