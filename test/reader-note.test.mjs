import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  MAX_HISTORY,
  QUESTIONS_FILE,
  QUESTION_STATUSES,
  READER_NOTE_HISTORY_DIR,
  applyOrganizeResult,
  appendEntryToBody,
  attachmentRelPath,
  buildEntryBlock,
  buildReaderNoteFile,
  checkOrganizeRewrite,
  countEntries,
  createReaderNote,
  entryTitle,
  listReaderNoteHistory,
  normalizeQuestions,
  noteHash,
  readQuestions,
  readReaderNoteFile,
  splitEntry,
  readReaderNoteHistoryVersion,
  readerNoteFolder,
  readerNoteRelativePath,
  readerNoteStem,
  resolveReaderNotePath,
  restoreReaderNoteHistory,
  snapshotReaderNote,
  splitNoteFile,
  tripodCandidates,
  tripodPaths,
  writeQuestions,
  writeReaderNoteFile,
} from '../lib/reader-note.js'

// Every fixture lives in its own mkdtemp; the real vault (D:\note) and the real
// data directory (D:\DSH-Literature) are never touched.

async function tempDir(prefix = 'lr-reader-note-') {
  return mkdtemp(path.join(os.tmpdir(), prefix))
}

const two = (value) => String(value).padStart(2, '0')
const clockOf = (date) => `${two(date.getHours())}:${two(date.getMinutes())}`
const dayOf = (date) =>
  `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`

function paper(meta = {}) {
  return {
    id: 'paper-abc',
    title: '均衡器与高速链路',
    fileName: 'a.pdf',
    vaultPath: 'serdes/a.pdf',
    tags: ['信道'],
    authors: ['A. Author'],
    year: 2024,
    ...meta,
  }
}

// ── tripod: folder, stem, paths ─────────────────────────────────────────────

test('readerNoteFolder follows the PDF folder, the vault root and the notesFolder fallback', () => {
  assert.equal(readerNoteFolder({ meta: paper(), notesFolder: '文献阅读' }), 'serdes')
  assert.equal(readerNoteFolder({ meta: paper({ vaultPath: 'serdes/接收端/a.pdf' }), notesFolder: 'x' }), 'serdes/接收端')
  // PDF in the vault root: the note is in the vault root too, not in notesFolder.
  assert.equal(readerNoteFolder({ meta: paper({ vaultPath: 'a.pdf' }), notesFolder: '文献阅读' }), '')
  // Not in the vault yet: fall back to the configured notes folder.
  assert.equal(readerNoteFolder({ meta: paper({ vaultPath: '' }), notesFolder: '文献阅读' }), '文献阅读')
  assert.equal(readerNoteFolder({ meta: paper({ vaultPath: '' }) }), '文献阅读')
})

test('the note name is the PDF stem plus 笔记, with unsafe characters sanitised', () => {
  assert.equal(readerNoteStem(paper()), 'a 笔记')
  assert.equal(readerNoteStem(paper({ fileName: 'X (2024).pdf' })), 'X (2024) 笔记')
  assert.equal(readerNoteStem(paper({ fileName: 'a/b:c.pdf' })), 'a／b：c 笔记')
  // fileName → title → id
  assert.equal(readerNoteStem(paper({ fileName: '', title: '标题甲' })), '标题甲 笔记')
  assert.equal(readerNoteStem(paper({ fileName: '', title: '' })), 'paper-abc 笔记')
  assert.equal(readerNoteRelativePath({ meta: paper(), notesFolder: '文献阅读' }), 'serdes/a 笔记.md')
  assert.equal(readerNoteRelativePath({ meta: paper({ vaultPath: 'a.pdf' }), notesFolder: '文献阅读' }), 'a 笔记.md')
  assert.equal(attachmentRelPath('paper-abc', 'img-20260101-120000-abcd.png'), '_附件/paper-abc/img-20260101-120000-abcd.png')
  // §14.2: the optional sub folder mirrors where `vaultFigureDir` wrote the file.
  assert.equal(
    attachmentRelPath('paper-abc', 'img-1.png', '笔记'),
    '_附件/paper-abc/笔记/img-1.png',
  )
  assert.equal(attachmentRelPath('', 'x.png'), '')
  // The sub folder is sanitised exactly like the file name: a caller that ever
  // forwards a request field into it cannot walk out of `_附件/<paperId>/`.
  assert.equal(attachmentRelPath('pid', 'a.png', '../../etc'), '_附件/pid/etc/a.png')
  assert.equal(attachmentRelPath('pid', 'a.png', '..'), attachmentRelPath('pid', 'a.png'))
  assert.equal(attachmentRelPath('pid', 'a.png', '.'), attachmentRelPath('pid', 'a.png'))
  assert.equal(attachmentRelPath('pid', 'a.png', '笔记/../..'), '_附件/pid/笔记/a.png')
  assert.equal(attachmentRelPath('pid', 'a.png', '../../etc').includes('..'), false)
  // paperId carries the same guard even though PAPER_ID_RE already filters it.
  assert.equal(attachmentRelPath('..', 'a.png'), '')
  assert.equal(attachmentRelPath('../..', 'a.png'), '')
  assert.equal(attachmentRelPath('../..', 'a.png').includes('..'), false)
})

test('tripodPaths and tripodCandidates name the three files in one folder', () => {
  const expected = tripodPaths({ meta: paper(), notesFolder: '文献阅读' })
  assert.deepEqual(expected, {
    pdfRel: 'serdes/a.pdf',
    summaryRel: 'serdes/a 总结.md',
    noteRel: 'serdes/a 笔记.md',
  })
  // pdfRel wins: the real file name on disk can differ from meta.fileName.
  assert.equal(
    tripodPaths({ meta: paper(), pdfRel: 'serdes/改名后的.pdf' }).summaryRel,
    'serdes/改名后的 总结.md',
  )

  const vault = path.join(os.tmpdir(), 'tripod-vault')
  const candidates = tripodCandidates({
    meta: paper({ summaryPath: path.join(vault, '旧目录/自定义总结.md') }),
    notesFolder: '文献阅读',
    vaultPath: vault,
  })
  assert.equal(candidates.summaryRel, '旧目录/自定义总结.md')
  assert.equal(candidates.noteRel, 'serdes/a 笔记.md')
  // A path outside the vault cannot be mapped back: fall back to the naming rule.
  const outside = tripodCandidates({
    meta: paper({ summaryPath: path.join(os.tmpdir(), 'other', 'x.md') }),
    vaultPath: vault,
  })
  assert.equal(outside.summaryRel, 'serdes/a 总结.md')
})

// ── note file: split, hash, build ───────────────────────────────────────────

test('splitNoteFile separates frontmatter from body and tolerates a bare body', () => {
  const raw = '---\ntitle: "x"\nnote_role: "reader-note"\n---\n\n# 2026-11-07\n\n正文\n'
  const split = splitNoteFile(raw)
  assert.equal(split.frontmatter, 'title: "x"\nnote_role: "reader-note"')
  // The blank separator line after the fences is not part of the body.
  assert.equal(split.body, '# 2026-11-07\n\n正文\n')

  const bare = splitNoteFile('# 只有正文\n')
  assert.equal(bare.frontmatter, '')
  assert.equal(bare.body, '# 只有正文\n')
  // CRLF input is normalised before splitting.
  const crlf = splitNoteFile('---\r\na: 1\r\n---\r\nbody\r\n')
  assert.equal(crlf.frontmatter, 'a: 1')
  assert.equal(crlf.body, 'body\n')
})

test('noteHash is the first 16 hex chars of the sha256 of the body', () => {
  assert.equal(noteHash('abc'), 'ba7816bf8f01cfea')
  assert.equal(noteHash(''), 'e3b0c44298fc1c14')
  assert.equal(noteHash('a\r\nb'), noteHash('a\nb'))
})

test('buildReaderNoteFile writes the tripod frontmatter, the callout and the first day', () => {
  const now = new Date(2026, 10, 7, 21, 3)
  const file = buildReaderNoteFile({ meta: paper(), summaryStem: 'a 总结', tags: ['额外'], now })
  assert.match(file, /^---\n/)
  for (const line of [
    'title: "a 阅读笔记"',
    'paper_id: "paper-abc"',
    'note_role: "reader-note"',
    'source_app: "DSH Literature Reader"',
    'pdf: "[[a.pdf]]"',
    'summary_note: "[[a 总结]]"',
    'vault_path: "serdes/a.pdf"',
    'year: 2024',
    '- "作者"',
    `created: "2026-11-07T`,
  ]) {
    if (line === '- "作者"') continue
    assert.ok(file.includes(line), `missing ${line}\n${file}`)
  }
  assert.ok(file.includes('- "A. Author"'))
  assert.ok(file.includes('- "文献阅读"'))
  assert.ok(file.includes('- "阅读笔记"'))
  assert.ok(file.includes('- "额外"'))
  const split = splitNoteFile(file)
  assert.match(split.body, /> \[!info\] 关联/)
  assert.match(split.body, /> 文献：\[\[a\.pdf\]\]/)
  assert.match(split.body, /> 速览：\[\[a 总结\]\]/)
  assert.match(split.body, new RegExp(`^# ${dayOf(now)}$`, 'm'))
  // A brand-new note has no entry heading yet.
  assert.equal(countEntries(split.body), 0)
  // Without an explicit summary name the pre-naming rule applies.
  assert.match(file, /summary_note: "\[\[a 总结\]\]"/)
})

// ── entry titles ────────────────────────────────────────────────────────────

test('splitEntry turns the first line with text into the title and leaves the body', () => {
  // The confirmed workflow: type a title line, press Enter, then the body.
  assert.deepEqual(splitEntry('预加重补偿 ISI\n正文第一段\n\n正文第二段'), {
    title: '预加重补偿 ISI',
    body: '正文第一段\n\n正文第二段',
  })
  // A one-line entry is all title: the body is empty, not a duplicate.
  assert.deepEqual(splitEntry('只是一个标题'), { title: '只是一个标题', body: '' })
  // Leading blank lines are skipped, they never become the title.
  assert.deepEqual(splitEntry('\n\n真正的首行\n正文'), { title: '真正的首行', body: '正文' })
  // Whitespace-only input has no title and no body.
  assert.equal(splitEntry('   \n\n ').title, '')
  assert.equal(splitEntry('').title, '')

  // The title line is removed, never repeated at the top of the body.
  const single = splitEntry('标题\n正文')
  assert.equal(single.body.includes('标题'), false, 'the heading must not repeat in the body')
})

test('splitEntry keeps inline Markdown in the title because the line leaves the body', () => {
  // Stripping `**`, backticks, `$` or link targets here would delete content
  // that no longer exists anywhere else — Obsidian renders all of it in a heading.
  assert.equal(splitEntry('**重点**：这是结论\n细节').title, '**重点**：这是结论')
  assert.equal(splitEntry('$E=mc^2$ 的含义\n推导').title, '$E=mc^2$ 的含义')
  assert.equal(splitEntry('用 `code()` 计算\n例子').title, '用 `code()` 计算')
  assert.equal(
    splitEntry('见 [论文正文](https://x.test/a) 第二节\n下文').title,
    '见 [论文正文](https://x.test/a) 第二节',
  )
  assert.equal(splitEntry('见 [[a.pdf|原文]] 的图\n下图').title, '见 [[a.pdf|原文]] 的图')
})

test('splitEntry drops leading block markers but keeps signs and decimals', () => {
  assert.equal(splitEntry('# 标题\n正文').title, '标题')
  assert.equal(splitEntry('> 引用\n正文').title, '引用')
  assert.equal(splitEntry('- 列表\n正文').title, '列表')
  assert.equal(splitEntry('1. 有序\n正文').title, '有序')
  assert.equal(splitEntry('1、有序\n正文').title, '有序')
  assert.equal(splitEntry('| 表格 |\n正文').title, '表格 |')
  // A marker needs a following space (or 、): these are content, not markers.
  assert.equal(splitEntry('-5 dB 是什么\n说明').title, '-5 dB 是什么')
  assert.equal(splitEntry('1.5 倍提升\n说明').title, '1.5 倍提升')
  // Whitespace runs collapse so the heading stays on one line.
  assert.equal(splitEntry('第一行  有   空格\n第二行').title, '第一行 有 空格')
})

test('splitEntry skips an image-only line instead of losing the image', () => {
  // The image has no text to show as a heading, so it stays in the body and the
  // next text line becomes the title.
  assert.deepEqual(splitEntry('![图](a.png)\n图注说明'), {
    title: '图注说明',
    body: '![图](a.png)',
  })
  // Nothing to title: the image is kept under a bare `## HH:mm`.
  assert.deepEqual(splitEntry('![图](_附件/paper-abc/img-1.png)'), {
    title: '',
    body: '![图](_附件/paper-abc/img-1.png)',
  })
  assert.deepEqual(splitEntry('![[a.png]]'), { title: '', body: '![[a.png]]' })
})

test('the first line is never truncated, so no text is lost with it', () => {
  const at = new Date(2026, 10, 7, 21, 3)
  const long = '一二三四五六七八九十甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午'
  assert.equal([...long].length, 27)
  // It used to clip at 24 code points; that would now delete the tail outright.
  assert.equal(entryTitle(long, at), `## 21:03 · ${long}`)
  // Emoji still count as one code point each when measured for length.
  const emoji = '🙂'.repeat(30)
  assert.equal(entryTitle(emoji, at), `## 21:03 · ${emoji}`)
})

test('entryTitle renders the clock and the first line', () => {
  const at = new Date(2026, 10, 7, 21, 3)
  assert.equal(entryTitle('标题\n正文', at), '## 21:03 · 标题')
  // No text at all degrades to a bare heading.
  assert.equal(entryTitle('', at), '## 21:03')
  assert.equal(entryTitle('   \n\n  ', at), '## 21:03')
  // Minutes are zero padded.
  assert.equal(entryTitle('x', new Date(2026, 10, 7, 9, 5)), '## 09:05 · x')
})

test('countEntries recognises the new and the legacy heading and nothing else', () => {
  const body = [
    '# 2026-11-07',
    '',
    '## 21:03 · 摘要标题',
    '',
    '正文',
    '',
    '## 21:04 记录',
    '',
    '旧格式正文',
    '',
    '## 21:05',
    '',
    '无摘要',
    '',
    '### 不是条目',
    '',
    '## 2:3 不是条目',
    '',
  ].join('\n')
  assert.equal(countEntries(body), 3)
  assert.equal(countEntries(''), 0)
  assert.equal(countEntries('# 2026-11-07\n'), 0)
})

// ── entry insertion ─────────────────────────────────────────────────────────

test('appendEntryToBody appends inside today, or opens a new day group', () => {
  const day = new Date(2026, 10, 7, 8, 0)
  const later = new Date(2026, 10, 7, 21, 3)
  const tomorrow = new Date(2026, 10, 8, 9, 5)

  // Same day: no new day heading. A one-line entry is heading only (spec §2).
  const first = appendEntryToBody({ body: '', markdown: '第一条', at: day })
  assert.equal(first.needsDayHeader, true)
  assert.equal(first.body, `# ${dayOf(day)}\n\n## 08:00 · 第一条\n`)
  assert.equal(first.entry.heading, '## 08:00 · 第一条')
  assert.equal(first.body.slice(first.anchor.start, first.anchor.end), '## 08:00 · 第一条')

  // First line = title, the rest = body, one blank line between blocks.
  const second = appendEntryToBody({ body: first.body, markdown: '第二条\n第二段', at: later })
  assert.equal(second.needsDayHeader, false)
  assert.equal(second.body, `${first.body}\n## 21:03 · 第二条\n\n第二段\n`)
  // The anchor covers exactly the inserted block (heading + body), no blank line.
  assert.equal(second.body.slice(second.anchor.start, second.anchor.end), '## 21:03 · 第二条\n\n第二段')
  assert.equal(second.anchor.end - second.anchor.start, '## 21:03 · 第二条\n\n第二段'.length)

  // A different day inserts the day heading before the entry.
  const nextDay = appendEntryToBody({ body: second.body, markdown: '次日\n正文', at: tomorrow })
  assert.equal(nextDay.needsDayHeader, true)
  assert.equal(
    nextDay.body.slice(nextDay.anchor.start, nextDay.anchor.end),
    '## 09:05 · 次日\n\n正文',
  )
  assert.ok(nextDay.body.endsWith(`\n\n# ${dayOf(tomorrow)}\n\n## 09:05 · 次日\n\n正文\n`))

  // buildEntryBlock reports the same decision without mutating a body.
  const block = buildEntryBlock({ markdown: '新条目\n说明', at: later, body: first.body })
  assert.equal(block.needsDayHeader, false)
  assert.equal(block.text, '## 21:03 · 新条目\n\n说明')
  assert.equal(buildEntryBlock({ markdown: 'x', at: later, body: '' }).needsDayHeader, true)
})

test('the body keeps the Markdown after the title line verbatim', () => {
  const at = new Date(2026, 10, 7, 21, 3)
  const markdown = '代码片段\n\n```js\nconst a = 1\n```\n\n- 第一点\n- 第二点'
  const result = appendEntryToBody({ body: '', markdown, at })
  // The first line becomes the heading and leaves the body.
  assert.ok(result.body.endsWith('## 21:03 · 代码片段\n\n```js\nconst a = 1\n```\n\n- 第一点\n- 第二点\n'))
  assert.equal(result.body.includes('代码片段\n\n代码片段'), false, 'no duplicated title')
  // Trailing/leading blank lines are trimmed, inner structure is untouched.
  const padded = appendEntryToBody({ body: '', markdown: `\n\n${markdown}\n\n`, at })
  assert.equal(padded.body, result.body)
  // A whitespace-only entry appends a bare heading, not a blank tail.
  const blank = appendEntryToBody({ body: '', markdown: '   \n\n ', at })
  assert.equal(blank.body, `# ${dayOf(at)}\n\n## 21:03\n`)
})

// ── vault reads and writes ──────────────────────────────────────────────────

test('resolveReaderNotePath favours the recorded path, adopts by paper_id and runs numbers', async () => {
  const root = await tempDir()
  try {
    const vault = path.join(root, 'vault')
    await mkdir(path.join(vault, 'serdes'), { recursive: true })
    const meta = paper({ id: 'paper-abc' })
    const args = { vaultPath: vault, notesFolder: '文献阅读', meta }

    // 1. Nothing on disk → the tripod target, not created yet.
    const free = await resolveReaderNotePath(args)
    assert.equal(free.relative, 'serdes/a 笔记.md')
    assert.equal(free.exists, false)

    // 3. The name exists but belongs to another paper → 笔记 2, then 笔记 3.
    await writeFile(path.join(vault, 'serdes/a 笔记.md'), '---\npaper_id: "other"\n---\n\nx\n', 'utf8')
    const second = await resolveReaderNotePath(args)
    assert.equal(second.relative, 'serdes/a 笔记 2.md')
    await writeFile(path.join(vault, 'serdes/a 笔记 2.md'), '---\npaper_id: "other-2"\n---\n\nx\n', 'utf8')
    const third = await resolveReaderNotePath(args)
    assert.equal(third.relative, 'serdes/a 笔记 3.md')

    // 2. A matching paper_id is adopted in place.
    const stored = path.join(root, 'elsewhere', 'moved 笔记.md')
    await mkdir(path.dirname(stored), { recursive: true })
    await writeFile(stored, '---\npaper_id: "paper-abc"\n---\n\n# x\n', 'utf8')
    const adopted = await resolveReaderNotePath({
      ...args,
      meta: paper({ id: 'paper-abc', readerNotePath: stored }),
    })
    assert.equal(adopted.path, stored)
    assert.equal(adopted.exists, true)

    // A recorded path that vanished falls back to the naming rule.
    const lost = await resolveReaderNotePath({
      ...args,
      meta: paper({ id: 'paper-abc', readerNotePath: path.join(root, 'gone.md') }),
    })
    assert.equal(lost.relative, 'serdes/a 笔记 3.md')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('resolveReaderNotePath adopts an existing file whose paper_id matches', async () => {
  const root = await tempDir()
  try {
    const vault = path.join(root, 'vault')
    await mkdir(path.join(vault, 'serdes'), { recursive: true })
    const target = path.join(vault, 'serdes', 'a 笔记.md')
    const content = '---\npaper_id: "paper-abc"\n---\n\n# 2026-11-07\n\n## 21:03 · 已有\n\n已有内容\n'
    await writeFile(target, content, 'utf8')
    const meta = paper()
    const resolved = await resolveReaderNotePath({ vaultPath: vault, notesFolder: '文献阅读', meta })
    assert.equal(resolved.relative, 'serdes/a 笔记.md')
    assert.equal(resolved.exists, true)

    // createReaderNote is idempotent and leaves the adopted content alone.
    const created = await createReaderNote({ vaultPath: vault, notesFolder: '文献阅读', meta })
    assert.equal(created.created, false)
    assert.equal(created.relative, 'serdes/a 笔记.md')
    assert.equal(created.hash, noteHash(splitNoteFile(content).body))
    assert.equal(await readFile(target, 'utf8'), content)

    // Creating a fresh one writes the file and reports links.
    const freshMeta = paper({ id: 'paper-new', fileName: 'b.pdf', vaultPath: 'serdes/b.pdf' })
    const fresh = await createReaderNote({
      vaultPath: vault,
      notesFolder: '文献阅读',
      meta: freshMeta,
      summaryStem: 'b 总结',
      now: new Date(2026, 10, 7, 21, 3),
    })
    assert.equal(fresh.created, true)
    assert.equal(fresh.relative, 'serdes/b 笔记.md')
    assert.deepEqual(fresh.links, { pdf: 'b.pdf', summary: 'b 总结' })
    const onDisk = await readFile(fresh.path, 'utf8')
    assert.ok(onDisk.includes('note_role: "reader-note"'))
    assert.equal(fresh.hash, noteHash(splitNoteFile(onDisk).body))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('readReaderNoteFile returns null when missing and the full shape when present', async () => {
  const root = await tempDir()
  try {
    const file = path.join(root, 'n.md')
    assert.equal(await readReaderNoteFile({ path: file }), null)
    assert.equal(await readReaderNoteFile({}), null)
    const body = '# 2026-11-07\n\n## 21:03 · 标题\n\n正文\n'
    await writeFile(file, `---\npaper_id: "p"\n---\n\n${body}`, 'utf8')
    const read = await readReaderNoteFile({ path: file })
    assert.equal(read.markdown, body)
    assert.equal(read.hash, noteHash(body))
    assert.equal(read.entryCount, 1)
    assert.ok(read.updatedAt)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('writeReaderNoteFile snapshots the whole old file, keeps frontmatter and bumps updated', async () => {
  const root = await tempDir()
  try {
    const file = path.join(root, 'note 笔记.md')
    const historyDir = path.join(root, READER_NOTE_HISTORY_DIR)
    const meta = paper()
    await writeFile(
      file,
      [
        '---',
        'title: "自定义标题"',
        'paper_id: "paper-abc"',
        'note_role: "reader-note"',
        'created: "2026-01-01T00:00:00.000Z"',
        'updated: "2026-01-01T00:00:00.000Z"',
        '---',
        '',
        '# 2026-11-07',
        '',
        '## 21:03 记录',
        '',
        '旧正文',
        '',
      ].join('\n'),
      'utf8',
    )
    const nextBody = '# 2026-11-07\n\n## 21:03 记录\n\n新正文\n'
    const result = await writeReaderNoteFile({
      path: file,
      body: nextBody,
      meta,
      reason: 'append',
      historyDir,
      now: new Date(2026, 10, 7, 21, 3, 12, 123),
    })
    assert.equal(result.body, nextBody)
    assert.equal(result.hash, noteHash(nextBody))
    assert.match(result.historyStamp, /^20261107-210312-123$/)

    // Frontmatter survived verbatim except `updated`; the body is the new one.
    const written = await readFile(file, 'utf8')
    const split = splitNoteFile(written)
    assert.match(split.frontmatter, /title: "自定义标题"/)
    assert.match(split.frontmatter, /paper_id: "paper-abc"/)
    assert.match(split.frontmatter, /created: "2026-01-01T00:00:00.000Z"/)
    assert.doesNotMatch(split.frontmatter, /updated: "2026-01-01T00:00:00.000Z"/)
    assert.match(split.frontmatter, /updated: "2026-11-07T/)
    assert.equal(split.body, nextBody)

    // The snapshot holds the complete previous file (frontmatter included).
    const snapshot = await readFile(path.join(historyDir, `${result.historyStamp}.md`), 'utf8')
    assert.match(snapshot, /^---\ntitle: "自定义标题"/)
    assert.match(snapshot, /旧正文/)
    const sidecar = JSON.parse(await readFile(path.join(historyDir, `${result.historyStamp}.json`), 'utf8'))
    assert.equal(sidecar.reason, 'append')
    assert.ok(sidecar.at)

    // Creating a note that does not exist yet writes frontmatter from meta and
    // takes no snapshot (nothing to snapshot).
    const fresh = path.join(root, 'fresh 笔记.md')
    const created = await writeReaderNoteFile({
      path: fresh,
      body: '# 2026-11-07\n',
      meta,
      reason: 'append',
      historyDir,
      now: new Date(2026, 10, 7, 21, 4),
    })
    assert.equal(created.historyStamp, '')
    assert.match(await readFile(fresh, 'utf8'), /note_role: "reader-note"/)
    await assert.rejects(
      () => writeReaderNoteFile({ path: fresh, body: '   ', meta, reason: 'append', historyDir }),
      /笔记正文为空/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('history snapshots keep 30 per paper, newest first, with their sidecars', async () => {
  const root = await tempDir()
  try {
    const historyDir = path.join(root, READER_NOTE_HISTORY_DIR)
    const stamps = []
    for (let index = 0; index < MAX_HISTORY + 2; index += 1) {
      const now = new Date(2026, 10, 7, 21, 3, 0, index)
      stamps.push(await snapshotReaderNote({ historyDir, raw: `v${index}\n`, reason: 'append', now }))
    }
    assert.equal(new Set(stamps).size, stamps.length)
    const entries = (await readdir(historyDir)).sort()
    // 30 snapshots × (`.md` + `.json`); the two oldest are gone.
    assert.equal(entries.length, MAX_HISTORY * 2)
    assert.ok(!entries.includes(`${stamps[0]}.md`))
    assert.ok(!entries.includes(`${stamps[1]}.md`))
    assert.ok(entries.includes(`${stamps[stamps.length - 1]}.md`))

    const versions = await listReaderNoteHistory(historyDir)
    assert.equal(versions.length, MAX_HISTORY)
    assert.equal(versions[0].stamp, stamps[stamps.length - 1])
    assert.equal(versions[0].reason, 'append')
    assert.ok(versions[0].updatedAt)
    assert.equal(versions[0].chars, 'v31\n'.length)
    // Unknown reason reads back as '' rather than undefined.
    await writeFile(path.join(historyDir, `${stamps[stamps.length - 2]}.json`), '{"at":"x"}', 'utf8')
    const reread = await listReaderNoteHistory(historyDir)
    const legacy = reread.find((entry) => entry.stamp === stamps[stamps.length - 2])
    assert.equal(legacy.reason, '')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('same-millisecond snapshots get -2 / -3 suffixes and still sort newest first', async () => {
  const root = await tempDir()
  try {
    const historyDir = path.join(root, READER_NOTE_HISTORY_DIR)
    const now = new Date(2026, 10, 7, 21, 3, 12, 123)
    const first = await snapshotReaderNote({ historyDir, raw: 'a\n', reason: 'append', now })
    const second = await snapshotReaderNote({ historyDir, raw: 'b\n', reason: 'append', now })
    const third = await snapshotReaderNote({ historyDir, raw: 'c\n', reason: 'append', now })
    assert.equal(first, '20261107-210312-123')
    assert.equal(second, '20261107-210312-123-2')
    assert.equal(third, '20261107-210312-123-3')
    const versions = await listReaderNoteHistory(historyDir)
    assert.deepEqual(versions.map((entry) => entry.stamp), [third, second, first])
    // An empty snapshot request is a no-op.
    assert.equal(await snapshotReaderNote({ historyDir, raw: '  ', reason: 'append', now }), '')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('readReaderNoteHistoryVersion parses the snapshot and rejects bad stamps', async () => {
  const root = await tempDir()
  try {
    const historyDir = path.join(root, READER_NOTE_HISTORY_DIR)
    const stamp = await snapshotReaderNote({
      historyDir,
      raw: '---\npaper_id: "p"\n---\n\n# 2026-11-07\n\n## 21:03 · t\n\n正文\n',
      reason: 'organize',
      now: new Date(2026, 10, 7, 21, 3, 12, 123),
    })
    const version = await readReaderNoteHistoryVersion({ historyDir, stamp })
    assert.equal(version.stamp, stamp)
    assert.equal(version.reason, 'organize')
    assert.equal(version.frontmatter, 'paper_id: "p"')
    assert.equal(version.markdown, '# 2026-11-07\n\n## 21:03 · t\n\n正文\n')

    await assert.rejects(() => readReaderNoteHistoryVersion({ historyDir, stamp: '../x' }), /无效的历史版本编号/)
    await assert.rejects(
      () => readReaderNoteHistoryVersion({ historyDir, stamp: '20260101-000000-000' }),
      /历史版本不存在/,
    )
    // A traversal-shaped stamp is rejected before the whitelist is consulted.
    await assert.rejects(() => readReaderNoteHistoryVersion({ historyDir, stamp: 'a/b' }), /无效的历史版本编号/)
    await assert.rejects(() => readReaderNoteHistoryVersion({ historyDir, stamp: '' }), /无效的历史版本编号/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('restoreReaderNoteHistory writes the snapshot back and snapshots the current file', async () => {
  const root = await tempDir()
  try {
    const file = path.join(root, 'note 笔记.md')
    const historyDir = path.join(root, READER_NOTE_HISTORY_DIR)
    const meta = paper()
    const original = '---\npaper_id: "paper-abc"\nnote_role: "reader-note"\n---\n\n# 2026-11-07\n\n## 21:03 记录\n\n原始\n'
    await writeFile(file, original, 'utf8')
    const stamp = await snapshotReaderNote({
      historyDir,
      raw: original,
      reason: 'organize',
      now: new Date(2026, 10, 7, 21, 3),
    })
    await writeReaderNoteFile({
      path: file,
      body: '# 2026-11-07\n\n## 21:03 记录\n\n被改坏了\n',
      meta,
      reason: 'organize',
      historyDir,
      now: new Date(2026, 10, 7, 21, 4),
    })
    const restored = await restoreReaderNoteHistory({
      path: file,
      historyDir,
      stamp,
      now: new Date(2026, 10, 7, 21, 5),
    })
    assert.match(restored.hash, /^[0-9a-f]{16}$/)
    const onDisk = await readFile(file, 'utf8')
    assert.equal(onDisk, original)
    assert.equal(restored.markdown, splitNoteFile(original).body)
    // The body that was replaced got its own snapshot with reason "restore".
    const versions = await listReaderNoteHistory(historyDir)
    assert.ok(versions.some((entry) => entry.reason === 'restore'))
    assert.ok(versions.some((entry) => entry.stamp === stamp))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

// ── questions ───────────────────────────────────────────────────────────────

test('questions round-trip through the sidecar file and are cleaned on the way in', async () => {
  const dir = await tempDir()
  try {
    assert.deepEqual(await readQuestions(dir), [])
    assert.equal(path.basename(path.join(dir, QUESTIONS_FILE)), 'reader-note-questions.json')
    const written = await writeQuestions(dir, [
      {
        id: 'q-aaaaaaaa',
        quote: '原文片段',
        problem: '数字与原文不一致',
        suggestion: '应为 25',
        ask: '这里是不是 25？',
        status: 'open',
        messages: [{ role: 'user', content: '是的', at: '2026-11-07T00:00:00.000Z' }],
      },
      { quote: '', problem: 'no quote → dropped' },
      { quote: '重复', problem: '同一问题' },
      { quote: '重复', problem: '同一问题' },
      {
        quote: '状态非法',
        problem: 'x',
        status: 'wat',
        messages: [{ role: 'system', content: 'x' }, { role: 'assistant', content: 'ok' }],
      },
    ])
    assert.equal(written.questions.length, 3)
    assert.equal(written.questions[2].status, 'open')
    assert.deepEqual(written.questions[2].messages.map((m) => m.role), ['assistant'])

    const reread = await readQuestions(dir)
    assert.equal(reread.length, 3)
    assert.equal(reread[0].id, 'q-aaaaaaaa')
    assert.equal(reread[0].quote, '原文片段')
    assert.ok(QUESTION_STATUSES.includes(reread[0].status))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('normalizeQuestions anchors open questions, orphans missing quotes and dedupes', () => {
  const body = [
    '# 2026-11-07',
    '',
    '## 21:03 · 数字',
    '',
    '论文报告了 20 Gb/s 的速率，但摘要写的是 25 Gb/s。',
    '',
  ].join('\n')
  const existing = [
    {
      id: 'q-keep0001',
      quote: '论文报告了 20 Gb/s 的速率',
      problem: '数字与摘要不一致',
      status: 'open',
      messages: [{ role: 'user', content: '我记得是 25', at: '2026-11-07T00:00:00.000Z' }],
      createdAt: '2026-11-06T00:00:00.000Z',
    },
    {
      id: 'q-gone0001',
      quote: '已经不在正文里的片段',
      problem: '旧问题',
      status: 'open',
    },
  ]
  const list = [
    {
      quote: '论文报告了 20 Gb/s 的速率',
      problem: '数字与摘要不一致',
      ask: '到底是多少？',
      status: 'open',
    },
    // Same quote+problem again: deduped, kept once.
    {
      quote: '论文报告了 20 Gb/s 的速率',
      problem: '数字与摘要不一致',
      status: 'open',
    },
    { quote: '已经不在正文里的片段', problem: '旧问题', status: 'open' },
    { quote: '摘要写的是 25 Gb/s', problem: '与上一句矛盾', status: 'weird' },
    { quote: '', problem: 'no quote' },
    null,
  ]
  const result = normalizeQuestions(list, body, existing)
  assert.equal(result.length, 3)
  const kept = result[0]
  assert.equal(kept.id, 'q-keep0001', 'the stored id must survive')
  assert.equal(kept.status, 'open')
  assert.equal(kept.messages.length, 1, 'the discussion history must survive')
  assert.equal(kept.messages[0].content, '我记得是 25')
  assert.equal(kept.createdAt, '2026-11-06T00:00:00.000Z')
  // Anchors land on real source offsets of the quote.
  assert.ok(kept.end > kept.start)
  assert.ok(body.slice(kept.start, kept.end).includes('20 Gb/s'))
  assert.ok(kept.prefix.length <= 48)
  // The orphan keeps its quote for manual repair and gets the orphan status.
  const orphan = result.find((question) => question.quote === '已经不在正文里的片段')
  assert.equal(orphan.status, 'orphan')
  // An unknown status falls back to open.
  assert.equal(result[2].status, 'open')
})

test('applyOrganizeResult re-anchors onto the new body and drops what disappeared', () => {
  const before = '# 2026-11-07\n\n## 21:03 · 速率\n\n论文报告了 20 Gb/s 的速率。\n'
  const after = '# 2026-11-07\n\n## 21:03 · 速率\n\n论文报告了 20 Gb/s 的速率。\n\n补充一句。\n'
  const questions = [
    { id: 'q-a', quote: '20 Gb/s', problem: 'p', status: 'open' },
    { id: 'q-b', quote: '不存在的片段', problem: 'p', status: 'open' },
    { id: 'q-c', quote: '任意', problem: 'p', status: 'resolved', start: 3, end: 5 },
  ]
  const result = applyOrganizeResult({ body: after, questions })
  assert.deepEqual(result.droppedIds, ['q-b'])
  assert.deepEqual(result.questions.map((question) => question.id), ['q-a', 'q-c'])
  const kept = result.questions[0]
  assert.equal(after.slice(kept.start, kept.end), '20 Gb/s')
  // Non-open questions keep their anchors untouched.
  assert.equal(result.questions[1].start, 3)
  assert.equal(result.questions[1].end, 5)
})

// ── the safety gate ─────────────────────────────────────────────────────────

const NOTE_HEAD = '# 2026-11-07\n\n'

test('checkOrganizeRewrite accepts a rewrite that only fixes typos and formatting', () => {
  const before = `${NOTE_HEAD}## 21:03 · 速率\n\n论文报告了 20 Gb/s 的速率，「眼图」张开度提升 30% [p.7]。\n\n## 21:04 · 结论\n\n结论是均衡能改善误码率。\n`
  const after = `${NOTE_HEAD}## 21:03 · 速率\n\n论文报告了 20 Gb/s 的速率，「眼图」张开度提升 30% [p.7]。\n\n## 21:04 · 结论\n\n结论是：均衡能改善误码率。\n`
  assert.deepEqual(checkOrganizeRewrite({ before, after }), { ok: true })
  // A no-op rewrite is fine too.
  assert.deepEqual(checkOrganizeRewrite({ before, after: before }), { ok: true })
})

test('checkOrganizeRewrite rule 1: an empty or non-string rewrite is rejected', () => {
  const before = `${NOTE_HEAD}## 21:03 · a\n\n正文\n`
  for (const after of ['', '   \n\n  ', undefined, null, 42]) {
    const result = checkOrganizeRewrite({ before, after })
    assert.equal(result.ok, false)
    assert.match(result.problems[0], /为空/)
  }
})

test('checkOrganizeRewrite rule 2: the length ratio must stay between 0.5x and 1.5x', () => {
  const before = `${NOTE_HEAD}${'这是一段没有标题的正文。'.repeat(40)}`
  const tooShort = checkOrganizeRewrite({ before, after: before.slice(0, Math.floor(before.length * 0.4)) })
  assert.equal(tooShort.ok, false)
  assert.ok(tooShort.problems.some((problem) => /删减超过一半/.test(problem)), tooShort.problems.join())
  const tooLong = checkOrganizeRewrite({ before, after: `${before}${'新增'.repeat(before.length)}` })
  assert.equal(tooLong.ok, false)
  assert.ok(tooLong.problems.some((problem) => /新增内容超出允许范围/.test(problem)), tooLong.problems.join())
})

test('checkOrganizeRewrite rule 2b: a note over 12000 chars must come back intact', () => {
  // Build a 20k-char note: the organizer only sees 9000 head + 3000 tail chars.
  const before = `# 2026-11-07\n\n## 21:03 · 长笔记\n\n${'这是一段很长的正文内容。'.repeat(1600)}`
  assert.ok(before.length > 12_000, `fixture is only ${before.length} chars`)
  // 15000/20000 = 0.75 — comfortably above the 0.5 gate, still a truncation.
  const truncated = checkOrganizeRewrite({ before, after: before.slice(0, 15_000) })
  assert.equal(truncated.ok, false)
  assert.ok(
    truncated.problems.some((problem) =>
      problem.includes(`笔记过长（${before.length} 字），超出模型单次整理范围，本次整理已放弃`),
    ),
    truncated.problems.join(),
  )
  // >= 95% of the original is accepted.
  const ninetyFive = Math.ceil(before.length * 0.95)
  assert.equal(checkOrganizeRewrite({ before, after: before.slice(0, ninetyFive) }).ok, true)
  assert.equal(checkOrganizeRewrite({ before, after: before.slice(0, ninetyFive - 50) }).ok, false)
  // Just under the limit the plain ratio gate applies: 0.8 is fine.
  const shorterNote = `${NOTE_HEAD}${'短正文。'.repeat(1000)}`
  assert.ok(shorterNote.length <= 12_000)
  assert.equal(
    checkOrganizeRewrite({
      before: shorterNote,
      after: shorterNote.slice(0, Math.floor(shorterNote.length * 0.8)),
    }).ok,
    true,
  )
})

test('checkOrganizeRewrite rule 3: every [[link]] and image must survive', () => {
  const before = `${NOTE_HEAD}## 21:03 · 见 [[a.pdf]]\n\n见图 ![图](_附件/paper-abc/img-1.png) 的说明。\n`
  const after = `${NOTE_HEAD}## 21:03 · 见 a.pdf\n\n见图 图(_附件/paper-abc/img-1.png) 的说明。\n`
  const result = checkOrganizeRewrite({ before, after })
  assert.equal(result.ok, false)
  assert.ok(result.problems.some((problem) => problem.includes('[[a.pdf]]')), result.problems.join())
  assert.ok(result.problems.some((problem) => problem.includes('![')), result.problems.join())

  // Duplicated links must keep their multiplicity.
  const twice = `${NOTE_HEAD}[[a.pdf]] 与 [[a.pdf]]\n`
  const once = `${NOTE_HEAD}[[a.pdf]] 与 a。pdf\n`
  assert.equal(checkOrganizeRewrite({ before: twice, after: once }).ok, false)
})

test('checkOrganizeRewrite rule 4: day headings may not disappear', () => {
  const before = `# 2026-11-06\n\n## 21:03 · 前一天\n\n前一天的正文\n\n# 2026-11-07\n\n## 08:00 · 今天\n\n今天的正文\n`
  const after = `# 2026-11-07\n\n## 21:03 · 前一天\n\n前一天的正文\n\n## 08:00 · 今天\n\n今天的正文\n`
  const result = checkOrganizeRewrite({ before, after })
  assert.equal(result.ok, false)
  assert.ok(result.problems.some((problem) => problem.includes('日分组标题')), result.problems.join())
})

test('checkOrganizeRewrite rule 5: a leading --- would smuggle in frontmatter', () => {
  const before = `${NOTE_HEAD}## 21:03 · a\n\n正文\n`
  const after = `---\ntitle: x\n---\n\n${NOTE_HEAD}## 21:03 · a\n\n正文\n`
  const result = checkOrganizeRewrite({ before, after })
  assert.equal(result.ok, false)
  assert.ok(result.problems.some((problem) => problem.includes('frontmatter')), result.problems.join())
})

test('checkOrganizeRewrite rule 6: entries may merge but never be wiped out', () => {
  const entries = ['21:01', '21:02', '21:03', '21:04', '21:05']
  const before = `${NOTE_HEAD}${entries
    .map((time) => `## ${time} · 标题${time}\n\n这里是这一条的具体内容，长度足够保持总字数稳定。\n`)
    .join('\n')}`
  // Drop two headings but keep their paragraphs: only the entry count changes.
  const after = before.replace('## 21:02 · 标题21:02\n\n', '').replace('## 21:05 · 标题21:05\n\n', '')
  const result = checkOrganizeRewrite({ before, after })
  assert.equal(result.ok, false)
  assert.ok(result.problems.some((problem) => /条目从 5 条减少到 3 条/.test(problem)), result.problems.join())
  // Four out of five (>= ceil(5*0.8)) is a legitimate merge.
  const merged = before.replace('## 21:02 · 标题21:02\n\n', '')
  assert.equal(checkOrganizeRewrite({ before, after: merged }).ok, true)
})

test('checkOrganizeRewrite rule 7: an existing HH:mm timestamp may not be rewritten', () => {
  const before = `${NOTE_HEAD}## 21:03 · 速率\n\n正文内容。\n\n## 21:04 记录\n\n旧格式正文。\n`
  const after = `${NOTE_HEAD}## 21:33 · 速率\n\n正文内容。\n\n## 21:44 记录\n\n旧格式正文。\n`
  const result = checkOrganizeRewrite({ before, after })
  assert.equal(result.ok, false)
  assert.ok(result.problems.some((problem) => problem.includes('时间戳')), result.problems.join())
  // A rewrite that keeps the clock but merges the legacy entry into the earlier
  // heading (4 entries out of 5, so rule 6 still passes) is accepted.
  const five = `${NOTE_HEAD}${['21:01', '21:02', '21:03', '21:04', '21:05']
    .map((time) => `## ${time} · 标题${time}\n\n${time} 这一条的正文内容，长度足够。\n`)
    .join('\n')}`
  const merged = five.replace('## 21:05 · 标题21:05\n\n', '')
  assert.ok(merged.includes('## 21:01 · 标题21:01'))
  assert.equal(checkOrganizeRewrite({ before: five, after: merged }).ok, true)
})

test('checkOrganizeRewrite keeps legacy `## HH:mm 记录` headings working', () => {
  assert.equal(countEntries('## 21:03 记录\n\n正文\n'), 1)
  const before = `${NOTE_HEAD}## 21:03 记录\n\n旧格式正文。\n`
  // The heading text after the clock must not be read as a rewritten timestamp.
  const after = `${NOTE_HEAD}## 21:03 记录\n\n旧格式正文，已修正。\n`
  assert.equal(checkOrganizeRewrite({ before, after }).ok, true)
})
