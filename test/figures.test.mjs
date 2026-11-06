import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  FIGURE_MAX_SIDE,
  FIGURE_MIN_SIDE,
  autoFigureName,
  bboxToPixels,
  copyFigureToVault,
  cropPageRegion,
  hasPoppler,
  pageSizePoints,
  vaultFigureDir,
} from '../lib/figures.js'

async function tempDir(prefix = 'lr-figures-') {
  return mkdtemp(path.join(os.tmpdir(), prefix))
}

// 612x792pt is US Letter; at 200 dpi that is 1700x2200 px.
const LETTER = { widthPt: 612, heightPt: 792, dpi: 200 }

test('bboxToPixels converts normalised boxes and applies default padding', () => {
  const full = bboxToPixels({ ...LETTER, bboxNorm: [0, 0, 1000, 1000] })
  assert.ok(full)
  assert.equal(full.dpi, 200)
  // Page is 1700x2200 px; the box is clamped to the page even after padding.
  assert.equal(full.x, 0)
  assert.equal(full.y, 0)
  assert.equal(full.width, 1700)
  assert.equal(full.height, 2200)

  const middle = bboxToPixels({ ...LETTER, bboxNorm: [100, 100, 500, 400] })
  assert.ok(middle)
  // 10%-50% of the width, padded by 2% of the page on each side.
  assert.equal(middle.x, Math.floor(1700 * 0.1 - 1700 * 0.02))
  assert.equal(middle.y, Math.floor(2200 * 0.1 - 2200 * 0.02))
  assert.equal(middle.width, Math.ceil(1700 * 0.5 + 1700 * 0.02) - middle.x)
  assert.equal(middle.height, Math.ceil(2200 * 0.4 + 2200 * 0.02) - middle.y)

  const noPadding = bboxToPixels({ ...LETTER, bboxNorm: [100, 100, 500, 400], padding: 0 })
  assert.equal(noPadding.x, 170)
  assert.equal(noPadding.y, 220)
  assert.equal(noPadding.width, 680)
  assert.equal(noPadding.height, 660)
})

test('bboxToPixels clamps out-of-range boxes and honours the minimum size', () => {
  // A box that extends past the page edge is clamped, never negative.
  const overflow = bboxToPixels({ ...LETTER, bboxNorm: [-200, -300, 1500, 2000], padding: 0 })
  assert.ok(overflow)
  assert.equal(overflow.x, 0)
  assert.equal(overflow.y, 0)
  assert.equal(overflow.width, 1700)
  assert.equal(overflow.height, 2200)

  // A hair-thin selection grows to the 40x40 minimum.
  const tiny = bboxToPixels({ ...LETTER, bboxNorm: [500, 500, 502, 502], padding: 0 })
  assert.ok(tiny)
  assert.ok(tiny.width >= FIGURE_MIN_SIDE)
  assert.ok(tiny.height >= FIGURE_MIN_SIDE)
  // Growing keeps the box inside the page.
  assert.ok(tiny.x + tiny.width <= 1700)
  assert.ok(tiny.y + tiny.height <= 2200)

  // Tiny selections near the bottom-right corner are pushed back inside.
  const corner = bboxToPixels({ ...LETTER, bboxNorm: [998, 998, 1000, 1000], padding: 0 })
  assert.ok(corner)
  assert.ok(corner.x + corner.width <= 1700)
  assert.ok(corner.y + corner.height <= 2200)

  // The long side never exceeds 4000 px even at a very high dpi.
  const huge = bboxToPixels({ widthPt: 612, heightPt: 792, dpi: 900, bboxNorm: [0, 0, 1000, 1000] })
  assert.ok(huge)
  assert.equal(huge.width, FIGURE_MAX_SIDE)
  assert.equal(huge.height, FIGURE_MAX_SIDE)
})

test('bboxToPixels rejects malformed input', () => {
  const bad = [
    undefined,
    {},
    { ...LETTER },
    { ...LETTER, bboxNorm: [] },
    { ...LETTER, bboxNorm: [0, 0, 1000] },
    { ...LETTER, bboxNorm: [0, 0, 1000, 'x'] },
    { ...LETTER, bboxNorm: [500, 500, 100, 100] },
    { ...LETTER, bboxNorm: [100, 100, 100, 400] },
    { widthPt: 0, heightPt: 792, dpi: 200, bboxNorm: [0, 0, 100, 100] },
    { widthPt: 612, heightPt: -1, dpi: 200, bboxNorm: [0, 0, 100, 100] },
    { widthPt: 612, heightPt: 792, dpi: 0, bboxNorm: [0, 0, 100, 100] },
  ]
  for (const options of bad) {
    assert.equal(bboxToPixels(options), null, `should reject ${JSON.stringify(options)}`)
  }
})

test('autoFigureName pads the page and the index', () => {
  assert.equal(autoFigureName(7, 1), 'fig-p07-01.png')
  assert.equal(autoFigureName(7, 12), 'fig-p07-12.png')
  assert.equal(autoFigureName(123, 2), 'fig-p123-02.png')
  assert.equal(autoFigureName('9', '3'), 'fig-p09-03.png')
  assert.throws(() => autoFigureName(0, 1), /无效的页码/)
  assert.throws(() => autoFigureName(7, 0), /无效的图片序号/)
  assert.throws(() => autoFigureName(Number.NaN, 1), /无效的页码/)
})

test('vaultFigureDir creates the attachment folder and copyFigureToVault copies into it', async () => {
  const root = await tempDir()
  try {
    const vault = path.join(root, 'vault')
    const dir = vaultFigureDir(vault, '文献阅读', 'paper-abc')
    assert.equal(dir, path.join(vault, '文献阅读', '_附件', 'paper-abc'))
    assert.ok((await stat(dir)).isDirectory())

    const localDir = path.join(root, 'local')
    await mkdir(localDir, { recursive: true })
    const localFile = path.join(localDir, 'fig-p07-01.png')
    await writeFile(localFile, Buffer.from([1, 2, 3, 4, 5]))

    const copied = await copyFigureToVault({
      vaultPath: vault,
      notesFolder: '文献阅读',
      paperId: 'paper-abc',
      localFile,
      name: 'fig-p07-01.png',
    })
    assert.equal(copied.name, 'fig-p07-01.png')
    assert.equal(copied.size, 5)
    assert.equal(copied.file, path.join(dir, 'fig-p07-01.png'))
    assert.deepEqual([...await readFile(copied.file)], [1, 2, 3, 4, 5])

    await assert.rejects(
      () => copyFigureToVault({ vaultPath: vault, notesFolder: 'x', paperId: 'paper-abc', localFile, name: '../evil.png' }),
      /无效的图片文件名/,
    )
    await assert.rejects(
      () => copyFigureToVault({ notesFolder: 'x', paperId: 'paper-abc', localFile, name: 'fig-p07-01.png' }),
      /未配置 Obsidian 库/,
    )
    await assert.rejects(
      () => copyFigureToVault({ vaultPath: vault, notesFolder: 'x', localFile, name: 'fig-p07-01.png' }),
      /缺少文献编号/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

// A minimal one-page PDF with a known MediaBox, so the real Poppler path can be
// exercised without shipping a binary fixture.
function minimalPdf(widthPt = 300, heightPt = 200) {
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

test('pageSizePoints and cropPageRegion work when Poppler is installed', async (t) => {
  if (!(await hasPoppler())) {
    t.skip('Poppler is not installed')
    return
  }
  const root = await tempDir('lr-figures-pdf-')
  try {
    const pdf = path.join(root, 'sample.pdf')
    await writeFile(pdf, minimalPdf(), 'latin1')

    const size = await pageSizePoints(pdf, 1)
    assert.ok(size.width > 0 && size.height > 0)
    assert.ok(Math.abs(size.width - 300) < 1)
    assert.ok(Math.abs(size.height - 200) < 1)

    const outFile = path.join(root, 'out', 'fig-p01-01.png')
    const crop = await cropPageRegion(pdf, outFile, 1, [100, 100, 700, 700], { dpi: 200 })
    assert.equal(crop.file, outFile)
    assert.ok(crop.width >= FIGURE_MIN_SIDE)
    assert.ok(crop.height >= FIGURE_MIN_SIDE)
    const info = await stat(outFile)
    assert.ok(info.size > 0)
    const header = await readFile(outFile)
    assert.equal(header.readUInt32BE(0), 0x89504e47, 'output must be a PNG')

    // An invalid box is rejected before the renderer runs.
    await assert.rejects(
      () => cropPageRegion(pdf, path.join(root, 'bad.png'), 1, [500, 500, 100, 100]),
      /无效的裁剪区域/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
