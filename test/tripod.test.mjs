import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  editVaultItem,
  invalidateVaultCache,
  isReaderNoteNote,
  isSummaryNote,
  moveVaultEntry,
  scanVault,
} from '../lib/vault.js'
import { copyFigureToVault, vaultFigureDir } from '../lib/figures.js'
import { updateSummaryNote, writeSummaryNote } from '../lib/obsidian.js'

// The tripod contract (docs/reader-note-spec.md §1, §12.1, §12.2): a PDF, its
// summary and its reader note always share one folder, share one stem and move
// as one unit. Every test builds its own mkdtemp vault; the real vault
// (D:\note) and the real data directory (D:\DSH-Literature) are never touched.

async function tempVault() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lr-tripod-'))
  const vault = path.join(root, 'vault')
  await mkdir(path.join(vault, '.obsidian'), { recursive: true })
  return { root, vault, dataDir: path.join(root, 'data') }
}

function meta(overrides = {}) {
  return {
    id: 'paper-abc',
    title: '均衡器与高速链路',
    fileName: 'a.pdf',
    vaultPath: 'serdes/a.pdf',
    tags: ['信道'],
    authors: ['A. Author'],
    year: 2024,
    ...overrides,
  }
}

const PDF_BYTES = Buffer.from('%PDF-1.4\n%%EOF\n', 'latin1')

async function seedPdf(vault, rel = 'serdes/a.pdf', bytes = PDF_BYTES) {
  const abs = path.join(vault, ...rel.split('/'))
  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, bytes)
  return abs
}

async function writeNote(vault, rel, frontmatter, body = '# 2026-11-07\n') {
  const abs = path.join(vault, ...rel.split('/'))
  await mkdir(path.dirname(abs), { recursive: true })
  const block = Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${JSON.stringify(String(value))}`)
    .join('\n')
  await writeFile(abs, `---\n${block}\n---\n\n${body}`, 'utf8')
  return abs
}

async function exists(abs) {
  try {
    await stat(abs)
    return true
  } catch {
    return false
  }
}

// ── §12.1 summary placement and naming ──────────────────────────────────────

test('a new summary is written next to the PDF as `<PDF stem> 总结.md`', async () => {
  const { root, vault } = await tempVault()
  try {
    await seedPdf(vault)
    const result = await writeSummaryNote({
      vault: { path: vault, exists: true },
      config: { notesFolder: '文献阅读' },
      meta: meta(),
      body: '# 均衡器\n\n正文内容。\n',
      tags: ['信道'],
      pdfPath: path.join(vault, 'serdes', 'a.pdf'),
    })
    assert.equal(result.relative, 'serdes/a 总结.md')
    assert.equal(result.path, path.join(vault, 'serdes', 'a 总结.md'))
    const written = await readFile(result.path, 'utf8')
    assert.match(written, /^---\n/)
    assert.match(written, /note_role: "summary"/)
    assert.match(written, /paper_id: "paper-abc"/)
    // Nothing was created in the notes folder any more.
    assert.equal(await exists(path.join(vault, '文献阅读')), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('an existing summary path inside the tripod folder is updated in place', async () => {
  const { root, vault } = await tempVault()
  try {
    await seedPdf(vault)
    // A custom name the user chose; rule 1 of §12.1 keeps it.
    const custom = await writeNote(vault, 'serdes/我的总结.md', { paper_id: 'paper-abc' })
    const result = await updateSummaryNote({
      vault: { path: vault, exists: true },
      config: { notesFolder: '文献阅读' },
      meta: meta({ summaryPath: custom }),
      body: '# 更新后的正文\n',
      tags: [],
    })
    assert.equal(result.path, custom)
    assert.equal(result.created, false)
    assert.equal(result.relative, 'serdes/我的总结.md')
    assert.match(await readFile(custom, 'utf8'), /更新后的正文/)
    assert.equal(await exists(path.join(vault, 'serdes', 'a 总结.md')), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a summary still sitting in the old notes folder is kept, not renamed or moved', async () => {
  const { root, vault } = await tempVault()
  try {
    await seedPdf(vault)
    const legacy = await writeNote(vault, '文献阅读/均衡器 (2024).md', { paper_id: 'paper-abc' })
    const updated = await updateSummaryNote({
      vault: { path: vault, exists: true },
      config: { notesFolder: '文献阅读' },
      meta: meta({ summaryPath: legacy }),
      body: '# 旧位置正文\n',
      tags: [],
    })
    assert.equal(updated.path, legacy)
    assert.equal(await exists(path.join(vault, 'serdes', 'a 总结.md')), false)
    assert.match(await readFile(legacy, 'utf8'), /旧位置正文/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a summary name owned by another paper runs the number instead of overwriting', async () => {
  const { root, vault } = await tempVault()
  try {
    await seedPdf(vault)
    await writeNote(vault, 'serdes/a 总结.md', { paper_id: 'someone-else' })
    const first = await updateSummaryNote({
      vault: { path: vault, exists: true },
      config: { notesFolder: '文献阅读' },
      meta: meta(),
      body: '# 我的总结\n',
      tags: [],
    })
    assert.equal(first.relative, 'serdes/a 总结 2.md')
    assert.match(await readFile(path.join(vault, 'serdes', 'a 总结.md'), 'utf8'), /someone-else/)

    // Writing again adopts the file that now carries our paper_id.
    const second = await updateSummaryNote({
      vault: { path: vault, exists: true },
      config: { notesFolder: '文献阅读' },
      meta: meta({ summaryPath: first.path }),
      body: '# 我的总结第二版\n',
      tags: [],
    })
    assert.equal(second.path, first.path)
    assert.match(await readFile(first.path, 'utf8'), /我的总结第二版/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a paper outside the vault falls back to notesFolder for its summary', async () => {
  const { root, vault } = await tempVault()
  try {
    const result = await writeSummaryNote({
      vault: { path: vault, exists: true },
      config: { notesFolder: '文献阅读' },
      meta: meta({ vaultPath: '' }),
      body: '# 不在库里的文献\n',
      tags: [],
      pdfPath: path.join(root, 'imported.pdf'),
    })
    assert.equal(result.relative, '文献阅读/a 总结.md')
    assert.equal(result.path, path.join(vault, '文献阅读', 'a 总结.md'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

// ── §14.2 image folders: summary `图`, reader note `笔记` ────────────────────

test('vaultFigureDir and copyFigureToVault honour the optional sub folder', async () => {
  const { root, vault } = await tempVault()
  try {
    const localDir = path.join(root, 'local')
    await mkdir(localDir, { recursive: true })
    const localFile = path.join(localDir, 'img-20260101-120000-abcd.png')
    await writeFile(localFile, Buffer.from([9, 8, 7]))

    assert.equal(
      vaultFigureDir(vault, '文献阅读', 'paper-abc', '图'),
      path.join(vault, '文献阅读', '_附件', 'paper-abc', '图'),
    )
    assert.equal(
      vaultFigureDir(vault, '文献阅读', 'paper-abc', '笔记'),
      path.join(vault, '文献阅读', '_附件', 'paper-abc', '笔记'),
    )
    // The legacy three-argument call keeps the historical location, so links
    // already written into existing notes still resolve.
    assert.equal(
      vaultFigureDir(vault, '文献阅读', 'paper-abc'),
      path.join(vault, '文献阅读', '_附件', 'paper-abc'),
    )
    // An explicit undefined falls back to the default sub folder.
    assert.equal(
      vaultFigureDir(vault, '文献阅读', 'paper-abc', undefined),
      path.join(vault, '文献阅读', '_附件', 'paper-abc', '图'),
    )

    const copied = await copyFigureToVault({
      vaultPath: vault,
      notesFolder: '文献阅读',
      paperId: 'paper-abc',
      localFile,
      name: 'img-20260101-120000-abcd.png',
      sub: '笔记',
    })
    assert.equal(copied.dir, path.join(vault, '文献阅读', '_附件', 'paper-abc', '笔记'))
    assert.deepEqual([...await readFile(copied.file)], [9, 8, 7])
    // The summary's own `图` folder was not written to by the note copy.
    assert.equal(
      await exists(path.join(vault, '文献阅读', '_附件', 'paper-abc', 'img-20260101-120000-abcd.png')),
      false,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

// ── §1 associateNote: summary wins, reader note is skipped ──────────────────

test('isReaderNoteNote and isSummaryNote read both role and name', () => {
  assert.equal(isReaderNoteNote({ stem: 'a 笔记', frontmatter: { note_role: 'reader-note' } }), true)
  assert.equal(isReaderNoteNote({ stem: '自定义名', frontmatter: { note_role: 'reader-note' } }), true)
  assert.equal(isReaderNoteNote({ stem: 'a 笔记', frontmatter: {} }), true)
  assert.equal(isReaderNoteNote({ stem: 'a 总结', frontmatter: { note_role: 'summary' } }), false)
  assert.equal(isReaderNoteNote({ stem: 'a' }), false)
  assert.equal(isReaderNoteNote(undefined), false)

  assert.equal(isSummaryNote({ rel: 'serdes/a 总结.md', stem: 'a 总结', frontmatter: { note_role: 'summary' } }), true)
  // Legacy detection: the old path+title rule still classifies old summaries.
  assert.equal(isSummaryNote({ rel: '文献阅读/均衡器 (2024).md', title: '均衡器 学习总结' }), true)
  assert.equal(isSummaryNote({ rel: 'serdes/a.pdf 笔记', title: '阅读笔记', frontmatter: {} }), false)
})

test('associateNote prefers the summary and never picks the reader note', async () => {
  const { root, vault } = await tempVault()
  try {
    await seedPdf(vault, 'serdes/a.pdf')
    // Both live in the PDF folder; the reader note would win every old branch.
    await writeNote(vault, 'serdes/a 笔记.md', { note_role: 'reader-note', paper_id: 'paper-abc', pdf: '[[a.pdf]]' })
    await writeNote(vault, 'serdes/a 总结.md', { note_role: 'summary', paper_id: 'paper-abc', pdf: '[[a.pdf]]' })
    invalidateVaultCache()
    const scan = await scanVault(vault, { refresh: true })
    const pdf = scan.pdfs.find((entry) => entry.rel === 'serdes/a.pdf')
    assert.equal(pdf.noteRel, 'serdes/a 总结.md')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('associateNote skips a reader note named after the PDF even without a summary', async () => {
  const { root, vault } = await tempVault()
  try {
    await seedPdf(vault, 'serdes/a.pdf')
    await writeNote(vault, 'serdes/a 笔记.md', { note_role: 'reader-note', paper_id: 'paper-abc' })
    invalidateVaultCache()
    const scan = await scanVault(vault, { refresh: true })
    const pdf = scan.pdfs.find((entry) => entry.rel === 'serdes/a.pdf')
    assert.equal(pdf.noteRel, '')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the reader note loses the fuzzy branch too', async () => {
  const { root, vault } = await tempVault()
  try {
    await seedPdf(vault, 'serdes/均衡器研究.pdf')
    // Same folder, name is a prefix of the PDF stem → the old fuzzy match.
    await writeNote(vault, 'serdes/均衡器研究 笔记.md', { note_role: 'reader-note', paper_id: 'paper-abc' })
    await writeNote(vault, 'serdes/均衡器研究 阅读.md', { paper_id: 'paper-abc' })
    invalidateVaultCache()
    const scan = await scanVault(vault, { refresh: true })
    const pdf = scan.pdfs.find((entry) => entry.rel === 'serdes/均衡器研究.pdf')
    assert.equal(pdf.noteRel, 'serdes/均衡器研究 阅读.md')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

// ── §12.2 renaming a PDF renames the tripod ─────────────────────────────────

test('renaming a PDF renames the canonical summary and note with it', async () => {
  const { root, vault, dataDir } = await tempVault()
  try {
    await seedPdf(vault, 'serdes/a.pdf')
    await writeNote(vault, 'serdes/a 总结.md', { note_role: 'summary', paper_id: 'paper-abc', pdf: '[[a.pdf]]' })
    await writeNote(vault, 'serdes/a 笔记.md', {
      note_role: 'reader-note',
      paper_id: 'paper-abc',
      pdf: '[[a.pdf]]',
      summary_note: '[[a 总结]]',
    })
    const result = await editVaultItem({ vault, dataDir, pdfRel: 'serdes/a.pdf', fileName: 'b' })
    assert.equal(result.renamed, true)
    assert.equal(result.rel, 'serdes/b.pdf')
    assert.equal(result.summaryRenamed, true)
    assert.equal(result.noteRenamed, true)
    assert.equal(await exists(path.join(vault, 'serdes', 'b.pdf')), true)
    assert.equal(await exists(path.join(vault, 'serdes', 'b 总结.md')), true)
    assert.equal(await exists(path.join(vault, 'serdes', 'b 笔记.md')), true)
    assert.equal(await exists(path.join(vault, 'serdes', 'a 笔记.md')), false)
    assert.equal(await exists(path.join(vault, 'serdes', 'a 总结.md')), false)
    // The caller learns the new absolute summary path so meta.summaryPath can follow.
    assert.equal(result.summaryRenamedPath, path.join(vault, 'serdes', 'b 总结.md'))
    // The internal links were rewritten.
    const note = await readFile(path.join(vault, 'serdes', 'b 笔记.md'), 'utf8')
    assert.match(note, /\[\[b\.pdf\]\]/)
    assert.match(note, /\[\[b 总结\]\]/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a custom-named summary or note keeps its name when the PDF is renamed', async () => {
  const { root, vault, dataDir } = await tempVault()
  try {
    await seedPdf(vault, 'serdes/a.pdf')
    await writeNote(vault, 'serdes/自定义总结.md', { paper_id: 'paper-abc', pdf: '[[a.pdf]]' })
    await writeNote(vault, 'serdes/我的笔记.md', { note_role: 'reader-note', paper_id: 'paper-abc' })
    const result = await editVaultItem({ vault, dataDir, pdfRel: 'serdes/a.pdf', fileName: 'b' })
    assert.equal(result.summaryRenamed, false)
    assert.equal(await exists(path.join(vault, 'serdes', '自定义总结.md')), true)
    assert.equal(await exists(path.join(vault, 'serdes', '我的笔记.md')), true)
    assert.equal(await exists(path.join(vault, 'serdes', 'b 总结.md')), false)
    assert.equal(await exists(path.join(vault, 'serdes', 'b 笔记.md')), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a rename conflict is rejected before anything is renamed', async () => {
  const { root, vault, dataDir } = await tempVault()
  try {
    await seedPdf(vault, 'serdes/a.pdf')
    await writeNote(vault, 'serdes/a 总结.md', { note_role: 'summary', paper_id: 'paper-abc' })
    await writeNote(vault, 'serdes/a 笔记.md', { note_role: 'reader-note', paper_id: 'paper-abc' })
    // Somebody already owns `<new stem> 笔记.md`.
    await writeNote(vault, 'serdes/b 笔记.md', { note_role: 'reader-note', paper_id: 'other' })
    await assert.rejects(
      () => editVaultItem({ vault, dataDir, pdfRel: 'serdes/a.pdf', fileName: 'b' }),
      /同名笔记文件已存在/,
    )
    // Nothing moved at all.
    assert.equal(await exists(path.join(vault, 'serdes', 'a.pdf')), true)
    assert.equal(await exists(path.join(vault, 'serdes', 'a 总结.md')), true)
    assert.equal(await exists(path.join(vault, 'serdes', 'a 笔记.md')), true)
    assert.equal(await exists(path.join(vault, 'serdes', 'b.pdf')), false)
    assert.equal(await exists(path.join(vault, 'serdes', 'b 总结.md')), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

// ── §12.2 moving a PDF moves the tripod ─────────────────────────────────────

test('moving a PDF moves the summary, the note and the attachment folder', async () => {
  const { root, vault, dataDir } = await tempVault()
  try {
    await seedPdf(vault, 'serdes/接收端/a.pdf')
    await writeNote(vault, 'serdes/接收端/a 总结.md', {
      note_role: 'summary',
      paper_id: 'paper-abc',
      pdf: '[[a.pdf]]',
      vault_path: 'serdes/接收端/a.pdf',
    })
    await writeNote(vault, 'serdes/接收端/a 笔记.md', {
      note_role: 'reader-note',
      paper_id: 'paper-abc',
      pdf: '[[a.pdf]]',
      summary_note: '[[a 总结]]',
      vault_path: 'serdes/接收端/a.pdf',
    })
    const attachment = path.join(vault, 'serdes', '接收端', '_附件', 'paper-abc', 'img-20260101-120000-abcd.png')
    await mkdir(path.dirname(attachment), { recursive: true })
    await writeFile(attachment, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    await mkdir(path.join(vault, '归档'), { recursive: true })

    const result = await moveVaultEntry({
      vault,
      dataDir,
      rel: 'serdes/接收端/a.pdf',
      folder: '归档',
      kind: 'pdf',
    })
    assert.equal(result.rel, '归档/a.pdf')
    assert.equal(result.changed, true)
    assert.deepEqual(
      result.moved.map((entry) => entry.kind).sort(),
      ['assets', 'note', 'pdf', 'summary'],
    )
    for (const rel of [
      '归档/a.pdf',
      '归档/a 总结.md',
      '归档/a 笔记.md',
      '归档/_附件/paper-abc/img-20260101-120000-abcd.png',
    ]) {
      assert.equal(await exists(path.join(vault, ...rel.split('/'))), true, `${rel} must have moved`)
    }
    assert.equal(await exists(path.join(vault, 'serdes', '接收端', 'a.pdf')), false)
    assert.equal(await exists(path.join(vault, 'serdes', '接收端', '_附件', 'paper-abc')), false)
    // The moved entries report where they came from and where they went.
    const noteMove = result.moved.find((entry) => entry.kind === 'note')
    assert.deepEqual(noteMove, {
      kind: 'note',
      from: 'serdes/接收端/a 笔记.md',
      to: '归档/a 笔记.md',
    })
    // Path-bearing frontmatter follows the move; the bare `[[a.pdf]]` wikilink
    // is name-based in Obsidian, so it is left as the file name.
    const movedNote = await readFile(path.join(vault, '归档', 'a 笔记.md'), 'utf8')
    assert.match(movedNote, /vault_path: "归档\/a\.pdf"/)
    assert.match(movedNote, /\[\[a\.pdf\]\]/)
    assert.match(movedNote, /\[\[a 总结\]\]/)
    assert.equal(await exists(path.join(vault, '归档', 'a.pdf')), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a move conflict answers 409 and moves nothing at all', async () => {
  const { root, vault, dataDir } = await tempVault()
  try {
    await seedPdf(vault, 'serdes/a.pdf')
    await writeNote(vault, 'serdes/a 总结.md', { note_role: 'summary', paper_id: 'paper-abc' })
    await writeNote(vault, 'serdes/a 笔记.md', { note_role: 'reader-note', paper_id: 'paper-abc' })
    // Only the *sibling* collides; the PDF target is free.
    await mkdir(path.join(vault, '归档'), { recursive: true })
    await writeNote(vault, '归档/a 笔记.md', { note_role: 'reader-note', paper_id: 'other' })

    await assert.rejects(
      () => moveVaultEntry({ vault, dataDir, rel: 'serdes/a.pdf', folder: '归档', kind: 'pdf' }),
      (error) => error.status === 409,
    )
    assert.equal(await exists(path.join(vault, 'serdes', 'a.pdf')), true)
    assert.equal(await exists(path.join(vault, 'serdes', 'a 总结.md')), true)
    assert.equal(await exists(path.join(vault, 'serdes', 'a 笔记.md')), true)
    assert.equal(await exists(path.join(vault, '归档', 'a.pdf')), false)
    assert.equal(await exists(path.join(vault, '归档', 'a 总结.md')), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('moving a note on its own leaves the PDF where it is', async () => {
  const { root, vault, dataDir } = await tempVault()
  try {
    await seedPdf(vault, 'serdes/a.pdf')
    await writeNote(vault, 'serdes/a 笔记.md', { note_role: 'reader-note', paper_id: 'paper-abc' })
    await writeNote(vault, 'serdes/a 总结.md', { note_role: 'summary', paper_id: 'paper-abc' })
    await mkdir(path.join(vault, '归档'), { recursive: true })
    const result = await moveVaultEntry({
      vault,
      dataDir,
      rel: 'serdes/a 笔记.md',
      folder: '归档',
      kind: 'note',
    })
    assert.equal(result.rel, '归档/a 笔记.md')
    assert.deepEqual(result.moved, [
      { kind: 'note', from: 'serdes/a 笔记.md', to: '归档/a 笔记.md' },
    ])
    assert.equal(await exists(path.join(vault, 'serdes', 'a.pdf')), true)
    assert.equal(await exists(path.join(vault, 'serdes', 'a 总结.md')), true)
    assert.equal(await exists(path.join(vault, '归档', 'a.pdf')), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a failure halfway through rolls the already-moved files back', async () => {
  const { root, vault, dataDir } = await tempVault()
  try {
    await seedPdf(vault, 'serdes/接收端/a.pdf')
    await writeNote(vault, 'serdes/接收端/a 总结.md', { note_role: 'summary', paper_id: 'paper-abc' })
    await writeNote(vault, 'serdes/接收端/a 笔记.md', { note_role: 'reader-note', paper_id: 'paper-abc' })
    const attachment = path.join(vault, 'serdes', '接收端', '_附件', 'paper-abc', 'x.png')
    await mkdir(path.dirname(attachment), { recursive: true })
    await writeFile(attachment, Buffer.from([1]))
    await mkdir(path.join(vault, '归档'), { recursive: true })
    // `归档/_附件` is a *file*, so the pre-flight cannot see the clash
    // (`归档/_附件/paper-abc` does not resolve) and the assets move blows up
    // after the PDF and both notes already moved.
    await writeFile(path.join(vault, '归档', '_附件'), 'not a folder')

    await assert.rejects(
      () => moveVaultEntry({ vault, dataDir, rel: 'serdes/接收端/a.pdf', folder: '归档', kind: 'pdf' }),
    )
    // Every file that had already moved is back where it started.
    for (const rel of ['serdes/接收端/a.pdf', 'serdes/接收端/a 总结.md', 'serdes/接收端/a 笔记.md']) {
      assert.equal(await exists(path.join(vault, ...rel.split('/'))), true, `${rel} must be restored`)
    }
    assert.equal(await exists(path.join(vault, '归档', 'a.pdf')), false)
    assert.equal(await exists(path.join(vault, '归档', 'a 总结.md')), false)
    assert.equal(await exists(path.join(vault, '归档', 'a 笔记.md')), false)
    assert.equal(await exists(attachment), true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('moving into the same folder is a no-op that reports no moved entries', async () => {
  const { root, vault, dataDir } = await tempVault()
  try {
    await seedPdf(vault, 'serdes/a.pdf')
    const result = await moveVaultEntry({
      vault,
      dataDir,
      rel: 'serdes/a.pdf',
      folder: 'serdes',
      kind: 'pdf',
    })
    assert.equal(result.changed, false)
    assert.deepEqual(result.moved, [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
