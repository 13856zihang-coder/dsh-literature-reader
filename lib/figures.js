import { mkdirSync } from 'node:fs'
import { copyFile, mkdir, open, rename, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { runCapture } from './util.js'
import { resolvePoppler } from './pdf.js'
import { isFigureName } from './summary-note.js'

// Figures embedded in a study note come from two places: a rendered PDF page
// (cropped with pdftoppm) or a user upload. Both end up in
// `<dataDir>/papers/<id>/figures` and, when a vault is configured, in
// `<vault>/<notesFolder>/_附件/<paperId>`.

export const FIGURE_MAX_BYTES = 12 * 1024 * 1024
export const FIGURE_MIN_SIDE = 40
export const FIGURE_MAX_SIDE = 4000
const BBOX_SCALE = 1000

function toolPath(dir, name) {
  return path.join(dir, process.platform === 'win32' ? `${name}.exe` : name)
}

function positiveInt(value) {
  const number = Number.parseInt(String(value), 10)
  return Number.isFinite(number) && number > 0 ? number : 0
}

/** True when pdfinfo/pdftoppm can be located (cached by lib/pdf.js). */
export async function hasPoppler(config = {}) {
  try {
    return Boolean(await resolvePoppler(config))
  } catch {
    return false
  }
}

function parseSizeLine(output, page) {
  const lines = String(output || '').split(/\r?\n/)
  const sizes = []
  for (const line of lines) {
    const match = line.match(/^Page\s*(\d*)\s*size:\s*([\d.]+)\s*x\s*([\d.]+)/i)
    if (match) {
      sizes.push({ page: match[1] ? Number.parseInt(match[1], 10) : 0, width: Number(match[2]), height: Number(match[3]) })
      continue
    }
    const box = line.match(/^Page\s*(\d*)\s*MediaBox:\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/i)
    if (box) {
      sizes.push({
        page: box[1] ? Number.parseInt(box[1], 10) : 0,
        width: Number(box[4]) - Number(box[2]),
        height: Number(box[5]) - Number(box[3]),
      })
    }
  }
  const exact = sizes.find((item) => item.page === page) || sizes[0]
  if (!exact || !(exact.width > 0) || !(exact.height > 0)) return null
  return { width: exact.width, height: exact.height }
}

/**
 * Page size in points. Uses the per-page box first (`-f p -l p -box`) and
 * falls back to the first page reported by a plain `pdfinfo` run.
 */
export async function pageSizePoints(pdfPath, page, options = {}) {
  const pageNumber = positiveInt(page)
  if (!pageNumber) throw new Error('无效的页码')
  const dir = await resolvePoppler(options.config || {})
  if (!dir) throw new Error('未找到 Poppler。请安装 Poppler，或在本插件配置里填写 popplerDir。')
  const binary = toolPath(dir, 'pdfinfo')
  const readBox = async (args) => {
    const output = await runCapture(binary, args, { timeoutMs: 60_000, maxBytes: 4 * 1024 * 1024 })
    return parseSizeLine(output, pageNumber)
  }
  let size = null
  try {
    size = await readBox(['-f', String(pageNumber), '-l', String(pageNumber), '-box', '-enc', 'UTF-8', pdfPath])
  } catch {
    size = null
  }
  if (!size) {
    size = await readBox(['-box', '-enc', 'UTF-8', pdfPath])
  }
  if (!size) throw new Error(`无法获取 PDF 第 ${pageNumber} 页的尺寸`)
  return size
}

function clamp(value, min, max) {
  if (value < min) return min
  if (value > max) return max
  return value
}

/**
 * Convert a 0-1000 normalised box (top-left origin) into pixel geometry for
 * pdftoppm. Padding is a fraction of the page size; the result is clamped to
 * the page, at least 40x40 and at most 4000 px on either side.
 * Returns null for malformed input.
 */
export function bboxToPixels(options = {}) {
  const widthPt = Number(options.widthPt)
  const heightPt = Number(options.heightPt)
  const dpi = Number(options.dpi ?? 200)
  const padding = options.padding === undefined ? 0.02 : Number(options.padding)
  const box = options.bboxNorm
  if (!(widthPt > 0) || !(heightPt > 0) || !(dpi > 0)) return null
  if (!Array.isArray(box) || box.length !== 4) return null
  if (!box.every((value) => Number.isFinite(Number(value)))) return null
  const [x0, y0, x1, y1] = box.map(Number)
  if (x1 <= x0 || y1 <= y0) return null
  const pad = Number.isFinite(padding) && padding >= 0 ? padding : 0
  const scale = dpi / 72
  const pageWidth = widthPt * scale
  const pageHeight = heightPt * scale
  const pageW = Math.ceil(pageWidth)
  const pageH = Math.ceil(pageHeight)
  // Normalised coordinates may extend slightly past the page; clamp before
  // padding so a bad model answer can never produce a negative offset.
  const left = clamp((x0 / BBOX_SCALE) * pageWidth, 0, pageWidth) - pad * pageWidth
  const top = clamp((y0 / BBOX_SCALE) * pageHeight, 0, pageHeight) - pad * pageHeight
  const right = clamp((x1 / BBOX_SCALE) * pageWidth, 0, pageWidth) + pad * pageWidth
  const bottom = clamp((y1 / BBOX_SCALE) * pageHeight, 0, pageHeight) + pad * pageHeight
  let x = clamp(Math.floor(left), 0, Math.max(0, pageW - 1))
  let y = clamp(Math.floor(top), 0, Math.max(0, pageH - 1))
  // Padding may push the box past the page edge; trim it back so the crop is
  // always fully inside the rendered page.
  let width = Math.min(Math.max(1, Math.ceil(right) - x), pageW - x)
  let height = Math.min(Math.max(1, Math.ceil(bottom) - y), pageH - y)
  // Grow tiny selections to the minimum, keeping the box on the page when the
  // page itself is large enough.
  const minWidth = Math.min(FIGURE_MIN_SIDE, pageW)
  const minHeight = Math.min(FIGURE_MIN_SIDE, pageH)
  if (width < minWidth) {
    width = minWidth
    x = Math.min(x, Math.max(0, pageW - width))
  }
  if (height < minHeight) {
    height = minHeight
    y = Math.min(y, Math.max(0, pageH - height))
  }
  width = Math.min(width, FIGURE_MAX_SIDE)
  height = Math.min(height, FIGURE_MAX_SIDE)
  return { x, y, width, height, dpi }
}

// PNG IHDR keeps the real pixel size in the first 24 bytes; pdftoppm rounds
// the requested box, so report what was actually produced when we can.
async function readPngSize(file) {
  try {
    const handle = await open(file, 'r')
    try {
      const buffer = Buffer.alloc(24)
      const { bytesRead } = await handle.read(buffer, 0, 24, 0)
      if (bytesRead < 24) return null
      if (buffer.readUInt32BE(0) !== 0x89504e47) return null
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
    } finally {
      await handle.close()
    }
  } catch {
    return null
  }
}

/**
 * Crop one region out of a PDF page as PNG at `dpi`. The temp render lives
 * next to `outFile` so the final rename stays on the same volume.
 */
export async function cropPageRegion(pdfPath, outFile, page, bboxNorm, options = {}) {
  const pageNumber = positiveInt(page)
  if (!pageNumber) throw new Error('无效的页码')
  const dpi = Number(options.dpi ?? 200) || 200
  const config = options.config || {}
  const dir = await resolvePoppler(config)
  if (!dir) throw new Error('未找到 Poppler。请安装 Poppler，或在本插件配置里填写 popplerDir。')
  const size = await pageSizePoints(pdfPath, pageNumber, { config })
  const pixels = bboxToPixels({
    widthPt: size.width,
    heightPt: size.height,
    dpi,
    bboxNorm,
    padding: options.padding,
  })
  if (!pixels) throw new Error('无效的裁剪区域')
  await mkdir(path.dirname(outFile), { recursive: true })
  const prefix = outFile.replace(/\.png$/i, '')
  const tmpPrefix = `${prefix}.${process.pid}.${Date.now()}`
  const produced = `${tmpPrefix}.png`
  const cleanup = async () => {
    try {
      await unlink(produced)
    } catch {
      // nothing to clean up
    }
  }
  try {
    await runCapture(
      toolPath(dir, 'pdftoppm'),
      [
        '-f', String(pageNumber),
        '-l', String(pageNumber),
        '-singlefile',
        '-png',
        '-r', String(Math.round(dpi)),
        '-x', String(pixels.x),
        '-y', String(pixels.y),
        '-W', String(pixels.width),
        '-H', String(pixels.height),
        pdfPath,
        tmpPrefix,
      ],
      { timeoutMs: 180_000, maxBytes: 8 * 1024 * 1024 },
    )
    const info = await stat(produced)
    if (info.size === 0) throw new Error(`PDF 第 ${pageNumber} 页截图失败`)
    if (info.size > FIGURE_MAX_BYTES) throw new Error('截图超过 12MB，请缩小选区或降低分辨率')
    const actual = await readPngSize(produced)
    await rename(produced, outFile)
    return {
      file: outFile,
      width: actual?.width || pixels.width,
      height: actual?.height || pixels.height,
    }
  } catch (error) {
    await cleanup()
    throw error
  }
}

/** Where a paper's figures live inside the vault; the folder is created. */
export function vaultFigureDir(vaultPath, notesFolder, paperId) {
  const dir = path.join(vaultPath || '', notesFolder || '', '_附件', String(paperId || ''))
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Copy one local figure into the vault attachment folder. */
export async function copyFigureToVault({ vaultPath, notesFolder, paperId, localFile, name }) {
  if (!vaultPath) throw new Error('未配置 Obsidian 库')
  if (!paperId) throw new Error('缺少文献编号')
  if (!isFigureName(name)) throw new Error('无效的图片文件名')
  const dir = vaultFigureDir(vaultPath, notesFolder, paperId)
  const file = path.join(dir, name)
  await copyFile(localFile, file)
  return { file, dir, name, size: (await stat(file)).size }
}

/** `fig-p07-01.png` for page 7, first figure on that page. */
export function autoFigureName(page, index) {
  const pageNumber = positiveInt(page)
  const sequence = Number.parseInt(String(index), 10)
  if (!pageNumber) throw new Error('无效的页码')
  if (!Number.isFinite(sequence) || sequence < 1) throw new Error('无效的图片序号')
  return `fig-p${String(pageNumber).padStart(2, '0')}-${String(sequence).padStart(2, '0')}.png`
}
