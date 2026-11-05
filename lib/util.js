import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'

export const PAPER_ID_RE = /^[a-z0-9][a-z0-9-]{2,80}$/

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function baseDirs(config = {}) {
  const dataDir = path.resolve(
    config.dataDir ||
      (process.platform === 'win32' && existsSync('D:\\')
        ? 'D:\\DSH-Literature'
        : path.join(os.homedir(), 'Documents', 'DSH-Literature')),
  )
  return {
    dataDir,
    papersDir: path.join(dataDir, 'papers'),
    tmpDir: path.join(dataDir, 'tmp'),
  }
}

export async function ensureBaseDirs(dirs) {
  await Promise.all([
    mkdir(dirs.dataDir, { recursive: true }),
    mkdir(dirs.papersDir, { recursive: true }),
    mkdir(dirs.tmpDir, { recursive: true }),
  ])
}

export function safePaperDir(dirs, id) {
  if (!PAPER_ID_RE.test(id)) throw new HttpError(400, '无效的文献编号')
  return path.join(dirs.papersDir, id)
}

const FILE_CHAR_MAP = {
  '<': '＜',
  '>': '＞',
  ':': '：',
  '"': '＂',
  '/': '／',
  '\\': '＼',
  '|': '｜',
  '?': '？',
  '*': '＊',
}

export function safeFileName(input, fallback = '未命名文献') {
  let name = String(input || '')
    .replace(/\.pdf$/i, '')
    .replace(/[<>:"/\\|?*#\[\]^\u0000-\u001f]/g, (char) => FILE_CHAR_MAP[char] || ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+|[. ]+$/g, '')
    .trim()
  if (!name) name = fallback
  if (name.length > 78) {
    let cut = name.slice(0, 78)
    const lastSpace = cut.lastIndexOf(' ')
    if (lastSpace > 45) cut = cut.slice(0, lastSpace)
    name = cut.replace(/[. ]+$/g, '')
  }
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `_${name}`
  return name.replace(/[. ]+$/g, '') || fallback
}

export function nowIso() {
  return new Date().toISOString()
}

export async function readJson(file, fallback = undefined) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback
    if (error instanceof SyntaxError) return fallback
    throw error
  }
}

export async function writeJson(file, value) {
  const tmp = `${file}.${randomUUID()}.tmp`
  await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
  await rename(tmp, file)
}

export async function writeFileAtomic(file, content) {
  const tmp = `${file}.${randomUUID()}.tmp`
  await writeFile(tmp, content, 'utf8')
  await rename(tmp, file)
}

export async function fileSize(file) {
  try {
    return (await stat(file)).size
  } catch {
    return 0
  }
}

export function stripDataUrl(value) {
  if (typeof value !== 'string') return ''
  const comma = value.indexOf(',')
  return value.startsWith('data:') && comma >= 0 ? value.slice(comma + 1) : value
}

export function parseJsonLoose(text) {
  if (typeof text !== 'string') return undefined
  const trimmed = text.trim()
  const candidates = [trimmed]
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) candidates.push(fenced[1].trim())
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first >= 0 && last > first) candidates.push(trimmed.slice(first, last + 1))
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      // try the next candidate
    }
  }
  return undefined
}

export function errorMessage(error) {
  if (error instanceof Error) return error.message
  return String(error)
}

export function runCapture(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 120_000
  const maxBytes = options.maxBytes ?? 64 * 1024 * 1024
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        windowsHide: true,
        env: options.env ?? process.env,
      })
    } catch (error) {
      reject(error)
      return
    }
    const stdout = []
    const stderr = []
    let outBytes = 0
    let errBytes = 0
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(value)
    }
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        // ignore
      }
      finish(new Error(`${path.basename(command)} 执行超时`))
    }, timeoutMs)
    child.stdout?.on('data', (chunk) => {
      outBytes += chunk.length
      if (outBytes > maxBytes) {
        try {
          child.kill()
        } catch {
          // ignore
        }
        finish(new Error(`${path.basename(command)} 输出过大`))
        return
      }
      stdout.push(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      errBytes += chunk.length
      if (errBytes <= maxBytes) stderr.push(chunk)
    })
    child.on('error', (error) => finish(error))
    child.on('close', (code) => {
      const out = Buffer.concat(stdout).toString('utf8')
      const err = Buffer.concat(stderr).toString('utf8').trim()
      if (code === 0) finish(undefined, out)
      else finish(new Error(`${path.basename(command)} 退出码 ${code}${err ? `：${err.slice(0, 1200)}` : ''}`))
    })
  })
}

export function slugForPaper(fileName) {
  const stamp = Date.now().toString(36)
  const random = randomUUID().replace(/-/g, '').slice(0, 6)
  const slug = String(fileName || 'paper')
    .replace(/\.pdf$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  return `${slug || 'paper'}-${stamp}-${random}`
}
