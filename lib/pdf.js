import { existsSync } from 'node:fs'
import { mkdir, readdir, rename, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { runCapture } from './util.js'

let cachedPoppler = null
let cachedPromise = null

async function searchWinGet() {
  const root = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages')
  if (!existsSync(root)) return undefined
  let entries = []
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return undefined
  }
  const candidates = entries
    .filter((entry) => entry.isDirectory() && /poppler/i.test(entry.name))
    .map((entry) => path.join(root, entry.name))
  for (const base of candidates) {
    const stack = [base]
    let guard = 0
    while (stack.length > 0 && guard < 5000) {
      guard += 1
      const current = stack.pop()
      let children = []
      try {
        children = await readdir(current, { withFileTypes: true })
      } catch {
        continue
      }
      for (const child of children) {
        const full = path.join(current, child.name)
        if (child.isFile() && /^pdftoppm(\.exe)?$/i.test(child.name)) return path.dirname(full)
        if (child.isDirectory()) stack.push(full)
      }
    }
  }
  return undefined
}

async function locatePoppler(config = {}) {
  if (config.popplerDir) {
    const candidate = path.join(config.popplerDir, process.platform === 'win32' ? 'pdftoppm.exe' : 'pdftoppm')
    if (existsSync(candidate)) return config.popplerDir
  }
  const command = process.platform === 'win32' ? 'where.exe' : 'which'
  const binary = process.platform === 'win32' ? 'pdftoppm.exe' : 'pdftoppm'
  try {
    const output = await runCapture(command, [binary], { timeoutMs: 10_000, maxBytes: 1024 * 1024 })
    const first = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0)
    if (first && existsSync(first)) return path.dirname(first)
  } catch {
    // fall through to the WinGet package scan
  }
  if (process.platform === 'win32') {
    const found = await searchWinGet()
    if (found) return found
  }
  return undefined
}

export function resolvePoppler(config = {}) {
  if (cachedPoppler) return Promise.resolve(cachedPoppler)
  if (!cachedPromise) {
    cachedPromise = locatePoppler(config).then((dir) => {
      if (dir) cachedPoppler = dir
      return dir
    })
  }
  return cachedPromise
}

function toolPath(dir, name) {
  return path.join(dir, process.platform === 'win32' ? `${name}.exe` : name)
}

export async function pdfInfo(pdfPath, config = {}) {
  const dir = await resolvePoppler(config)
  if (!dir) throw new Error('未找到 Poppler。请安装 Poppler，或在本插件配置里填写 popplerDir。')
  const output = await runCapture(toolPath(dir, 'pdfinfo'), ['-enc', 'UTF-8', pdfPath], {
    timeoutMs: 60_000,
    maxBytes: 4 * 1024 * 1024,
  })
  const fields = {}
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([^:]+):\s*(.*)$/)
    if (match) fields[match[1].trim()] = match[2].trim()
  }
  const pages = Number.parseInt(fields.Pages || '0', 10)
  return {
    pages: Number.isFinite(pages) ? pages : 0,
    title: fields.Title || '',
    author: fields.Author || '',
    subject: fields.Subject || '',
    keywords: fields.Keywords || '',
    creator: fields.Creator || '',
    producer: fields.Producer || '',
  }
}

export async function extractPdfText(pdfPath, pageCount, config = {}) {
  const dir = await resolvePoppler(config)
  if (!dir) throw new Error('未找到 Poppler。请安装 Poppler，或在本插件配置里填写 popplerDir。')
  const output = await runCapture(
    toolPath(dir, 'pdftotext'),
    ['-layout', '-enc', 'UTF-8', pdfPath, '-'],
    { timeoutMs: 180_000, maxBytes: 120 * 1024 * 1024 },
  )
  const rawPages = output.split('\f')
  if (rawPages.length > 0 && rawPages[rawPages.length - 1].trim() === '') rawPages.pop()
  const total = Math.max(pageCount, rawPages.length)
  const pages = []
  for (let index = 0; index < total; index += 1) {
    const text = (rawPages[index] || '')
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim()
    pages.push({ n: index + 1, text, ocr: false })
  }
  return pages
}

export function buildFullText(pages) {
  return pages
    .map((page) => `\n\n=== 第 ${page.n} 页 ===\n${page.text || '（本页没有可提取文字）'}`)
    .join('')
    .trim()
}

export async function renderPage(pdfPath, outFile, page, dpi = 168, quality = 86, config = {}) {
  const dir = await resolvePoppler(config)
  if (!dir) throw new Error('未找到 Poppler。请安装 Poppler，或在本插件配置里填写 popplerDir。')
  await mkdir(path.dirname(outFile), { recursive: true })
  const prefix = outFile.replace(/\.jpe?g$/i, '')
  const tmpPrefix = `${prefix}.${process.pid}.${Date.now()}`
  await runCapture(
    toolPath(dir, 'pdftoppm'),
    [
      '-f',
      String(page),
      '-l',
      String(page),
      '-singlefile',
      '-jpeg',
      '-r',
      String(dpi),
      '-jpegopt',
      `quality=${quality}`,
      pdfPath,
      tmpPrefix,
    ],
    { timeoutMs: 180_000, maxBytes: 8 * 1024 * 1024 },
  )
  const produced = `${tmpPrefix}.jpg`
  try {
    await stat(produced)
  } catch {
    throw new Error(`PDF 第 ${page} 页渲染失败`)
  }
  await rename(produced, outFile)
  return outFile
}

export async function ensurePageImage(pdfPath, paperDir, page, options = {}) {
  const dpi = options.dpi ?? 168
  const quality = options.quality ?? 86
  const thumb = options.thumb === true
  const name = thumb ? 'thumb.jpg' : `p${String(page).padStart(4, '0')}.jpg`
  const dir = path.join(paperDir, thumb ? 'thumbs' : 'pages')
  const file = path.join(dir, name)
  try {
    const info = await stat(file)
    if (info.size > 512) return file
  } catch {
    // render below
  }
  await renderPage(pdfPath, file, page, thumb ? 46 : dpi, thumb ? 70 : quality, options.config)
  return file
}

export function looksScanned(pages) {
  if (!pages.length) return true
  const chars = pages.reduce((sum, page) => sum + (page.text || '').trim().length, 0)
  const blank = pages.filter((page) => (page.text || '').trim().length < 30).length
  return chars < pages.length * 70 || blank / pages.length > 0.45
}

export async function removeQuietly(file) {
  try {
    await unlink(file)
  } catch {
    // ignore
  }
}
