import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import {
  PAPER_ID,
  PNG_BYTES,
  createApp,
  dataUrl,
  doneEvent,
  seedPaper,
} from './helpers.mjs'

// End-to-end regression for the reader-note "tripod" (docs/reader-note-spec.md
// §1, §3, §7.9, §12, §14). Every case walks the real HTTP routes of one fresh
// plugin instance: PDF in a nested vault folder → summary → reader note →
// entries → image → organize → discuss → resolve → rename → move → delete.
// Nothing here touches the real Obsidian vault or D:\DSH-Literature.

const TITLE = '测试文献'
const FOLDER = 'serdes/接收端'
const PDF_REL = `${FOLDER}/${TITLE}.pdf`
const SUMMARY_REL = `${FOLDER}/${TITLE} 总结.md`
const NOTE_REL = `${FOLDER}/${TITLE} 笔记.md`
const ASSETS_REL = `${FOLDER}/_附件/${PAPER_ID}`

const SUMMARY_BODY = `# 测试速览

## 速览
均衡器补偿信道损耗，是高速串行链路的关键模块。

## 核心方法
前馈均衡与判决反馈均衡的组合，按信道长度自适应。

## 关键结论
25 Gb/s 下眼图张开度提升 30%，误码率满足目标。
`

const NOTE_GET_KEYS = [
  'exists',
  'path',
  'relative',
  'markdown',
  'hash',
  'updatedAt',
  'entryCount',
  'questions',
  'historyStamp',
]

function summaryScript(body = SUMMARY_BODY) {
  return `TAGS: 均衡器, 高速链路\n\n${body}`
}

function organizeAnswer(markdown, extra = {}) {
  return JSON.stringify({
    markdown,
    report: { typos: 2, merges: 1, formatting: 3, summary: '统一了标点与空格' },
    questions: [],
    ...extra,
  })
}

function abs(app, rel) {
  return path.join(app.vaultPath, ...rel.split('/'))
}

async function exists(target) {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

async function readVault(app, rel) {
  return readFile(abs(app, rel), 'utf8')
}

/**
 * Boot one instance with a real summary and a real reader note inside
 * `serdes/接收端/`. The summary goes through `POST /summary` (not a hand-written
 * fixture) so the placement/naming rules of §12.1 are exercised for real.
 */
async function setupTripod() {
  const app = await createApp({ script: [summaryScript()] })
  await seedPaper(app, {
    title: TITLE,
    meta: { fileName: `${TITLE}.pdf`, vaultPath: PDF_REL },
  })
  await mkdir(path.dirname(abs(app, PDF_REL)), { recursive: true })
  await writeFile(abs(app, PDF_REL), '%PDF-1.4\n%%EOF\n', 'latin1')

  const summary = await app.post(`/papers/${PAPER_ID}/summary`)
  assert.equal(summary.status, 200, summary.text)
  const summaryDone = doneEvent(summary)
  assert.equal(summaryDone.relative, SUMMARY_REL)
  assert.ok(await exists(abs(app, SUMMARY_REL)), 'the summary lands next to the PDF')
  const summaryRaw = await readVault(app, SUMMARY_REL)
  assert.ok(summaryRaw.includes('note_role: "summary"'))
  assert.ok(summaryRaw.includes(`paper_id: "${PAPER_ID}"`))

  const created = await app.post(`/papers/${PAPER_ID}/reader-note`)
  assert.equal(created.status, 200, created.text)
  const note = created.json()
  assert.equal(note.created, true)
  assert.equal(note.relative, NOTE_REL)
  assert.ok(await exists(abs(app, NOTE_REL)), 'the note lands next to the PDF')

  return {
    app,
    summaryAbs: abs(app, SUMMARY_REL),
    noteAbs: abs(app, NOTE_REL),
    assetsAbs: abs(app, ASSETS_REL),
    pdfAbs: abs(app, PDF_REL),
  }
}

async function appendEntry(app, markdown, at) {
  const response = await app.post(`/papers/${PAPER_ID}/reader-note/entries`, { markdown, at })
  assert.equal(response.status, 200, response.text)
  return response.json()
}

// ── 1. tripod placement, naming, mutual links and the §7.9 payload ──────────

test('the tripod shares one folder and links PDF ⇄ summary ⇄ note both ways', async () => {
  const { app, pdfAbs, summaryAbs, noteAbs } = await setupTripod()
  try {
    // §1: same folder, `<PDF stem> 总结.md` / `<PDF stem> 笔记.md`.
    assert.equal(path.dirname(pdfAbs), path.dirname(summaryAbs))
    assert.equal(path.dirname(noteAbs), path.dirname(summaryAbs))
    assert.equal(path.basename(summaryAbs), `${TITLE} 总结.md`)
    assert.equal(path.basename(noteAbs), `${TITLE} 笔记.md`)

    const noteRaw = await readFile(noteAbs, 'utf8')
    assert.ok(noteRaw.includes(`pdf: "[[${TITLE}.pdf]]"`))
    assert.ok(noteRaw.includes(`summary_note: "[[${TITLE} 总结]]"`))
    assert.ok(noteRaw.includes(`> 文献：[[${TITLE}.pdf]]`))
    assert.ok(noteRaw.includes(`> 速览：[[${TITLE} 总结]]`))
    assert.ok(noteRaw.includes('note_role: "reader-note"'))
    assert.ok(noteRaw.includes(`paper_id: "${PAPER_ID}"`))
    assert.ok(noteRaw.includes(`vault_path: "${PDF_REL}"`))
    assert.match(noteRaw, /^# \d{4}-\d{2}-\d{2}$/m, 'the first day heading is local YYYY-MM-DD')

    // §7.9 / §3.1: the GET payload keeps every documented field.
    const listed = await app.get(`/papers/${PAPER_ID}/reader-note`)
    assert.equal(listed.status, 200, listed.text)
    const payload = listed.json()
    for (const key of NOTE_GET_KEYS) assert.ok(key in payload, `GET /reader-note lacks ${key}`)
    assert.equal(payload.exists, true)
    assert.equal(payload.relative, NOTE_REL)
    assert.equal(payload.path, noteAbs)
    assert.equal(payload.entryCount, 0)
    assert.deepEqual(payload.questions, [])
    assert.match(payload.hash, /^[a-f0-9]{16}$/)

    // §3.10: publicPaper gains hasReaderNote / readerNoteRelative / readerNoteOpen.
    const paper = (await app.get(`/papers/${PAPER_ID}`)).json().paper
    assert.equal(paper.hasReaderNote, true)
    assert.equal(paper.readerNoteRelative, NOTE_REL)
    assert.equal(paper.readerNoteOpen, 0)
    assert.equal(paper.hasSummary, true)

    // §12.4: the library reports both companions explicitly, and the
    // associated note stays the summary (associateNote skips the reader note).
    // `refresh=1` because `scanVault` caches the directory listing for ~2.5s and
    // this test creates the note moments after the summary.
    const library = await app.get('/vault/library?refresh=1')
    assert.equal(library.status, 200, library.text)
    const entry = library.json().pdfs.find((item) => item.rel === PDF_REL)
    assert.ok(entry, 'the PDF is listed')
    assert.equal(entry.noteRel, SUMMARY_REL)
    assert.equal(entry.summaryRel, SUMMARY_REL)
    assert.equal(entry.readerNoteRel, NOTE_REL)

    // Idempotent create: the second POST leaves the file byte-identical.
    const before = await readFile(noteAbs, 'utf8')
    const again = (await app.post(`/papers/${PAPER_ID}/reader-note`)).json()
    assert.equal(again.created, false)
    assert.equal(again.markdown, payload.markdown)
    assert.equal(await readFile(noteAbs, 'utf8'), before)

    // §3.2: the recorded paths are written back into meta.json.
    const meta = await app.readMeta()
    assert.equal(meta.readerNotePath, noteAbs)
    assert.equal(meta.readerNoteRelative, NOTE_REL)
    assert.equal(meta.summaryPath, summaryAbs)
  } finally {
    await app.close()
  }
})

// ── 2. entries: `## HH:mm · …`, day headings, legacy format ────────────────

test('entries append under a day heading with `## HH:mm · 首句` and keep legacy headings', async () => {
  const { app, noteAbs } = await setupTripod()
  try {
    const dayOne = new Date()
    const dayTwo = new Date(dayOne)
    dayTwo.setDate(dayTwo.getDate() + 1)

    const first = await appendEntry(app, '第一条：25 Gb/s 下功耗降低 30%。', dayOne.toISOString())
    assert.equal(first.entryCount, 1)
    assert.match(first.entry.heading, /^## \d{2}:\d{2} · 第一条：25 Gb\/s 下功耗降低 30%。$/)
    assert.match(first.markdown, /## \d{2}:\d{2} · 第一条/)
    assert.match(first.hash, /^[a-f0-9]{16}$/)
    assert.ok(first.historyStamp.length > 0)
    // The anchor covers exactly the inserted block inside the new body.
    const anchored = first.markdown.slice(first.anchor.start, first.anchor.end)
    assert.ok(anchored.startsWith('## '))
    assert.ok(anchored.includes('第一条：25 Gb/s 下功耗降低 30%。'))

    // The confirmed workflow end to end (spec §2): first line = title, the rest
    // is the body, and the title line is never repeated inside the body.
    const twoLine = await appendEntry(
      app,
      '眼图与 ISI\n预加重把高频分量抬起来。\n\n均衡器再补一次。',
      dayOne.toISOString(),
    )
    assert.match(twoLine.entry.heading, /^## \d{2}:\d{2} · 眼图与 ISI$/)
    const anchoredTwoLine = twoLine.markdown.slice(twoLine.anchor.start, twoLine.anchor.end)
    assert.equal(
      anchoredTwoLine,
      `${twoLine.entry.heading}\n\n预加重把高频分量抬起来。\n\n均衡器再补一次。`,
    )
    // The heading text appears once, not again at the top of the body.
    assert.equal(twoLine.markdown.split('眼图与 ISI').length - 1, 1)
    assert.equal(twoLine.entryCount, 2)

    const second = await appendEntry(app, '第二条：眼图张开度提升 30%。', dayTwo.toISOString())
    assert.equal(second.entryCount, 3, 'first + twoLine + second')
    assert.match(second.entry.heading, /^## \d{2}:\d{2} · 第二条/)
    const days = second.markdown.match(/^# \d{4}-\d{2}-\d{2}$/gm) || []
    assert.equal(days.length, 2, 'a new local day gets its own `# YYYY-MM-DD` heading')

    // §14.3 back-compat: a heading written by an older version still counts and
    // is never rewritten by the next append.
    const raw = await readFile(noteAbs, 'utf8')
    await writeFile(
      noteAbs,
      raw.replace(/(^# \d{4}-\d{2}-\d{2}$)/m, '$1\n\n## 21:03 记录\n\n旧格式（v0）的记录正文。'),
      'utf8',
    )
    const listed = (await app.get(`/papers/${PAPER_ID}/reader-note`)).json()
    assert.equal(listed.entryCount, 4, 'three new-format entries + the legacy one')
    const third = await appendEntry(app, '第三条：新格式继续追加。')
    assert.equal(third.entryCount, 5)
    assert.ok(third.markdown.includes('## 21:03 记录'), 'the legacy heading is preserved verbatim')
    assert.ok(third.markdown.includes('旧格式（v0）的记录正文。'))
    // Only one blank line between blocks (the file stays diff-friendly).
    assert.doesNotMatch(third.markdown, /\n{3,}/)

    // Validation and the "no note yet" gate (§3.3).
    const empty = await app.post(`/papers/${PAPER_ID}/reader-note/entries`, { markdown: '   ' })
    assert.equal(empty.status, 400)
    const tooLong = await app.post(`/papers/${PAPER_ID}/reader-note/entries`, {
      markdown: 'x'.repeat(20_001),
    })
    assert.equal(tooLong.status, 400)
  } finally {
    await app.close()
  }
})

// ── 3. note images land under `_附件/<id>/笔记/` (and preview) ─────────────

test('a note image lands under _附件/<id>/笔记/ next to the PDF', async () => {
  const { app, assetsAbs } = await setupTripod()
  try {
    const uploaded = await app.post(`/papers/${PAPER_ID}/reader-note/images`, {
      dataUrl: dataUrl(PNG_BYTES),
    })
    assert.equal(uploaded.status, 200, uploaded.text)
    const info = uploaded.json()
    assert.equal(info.ok, true)
    assert.equal(info.rel, `_附件/${PAPER_ID}/笔记/${info.name}`)
    assert.equal(info.vaultError, '')

    const vaultFile = path.join(assetsAbs, '笔记', info.name)
    assert.ok(await exists(vaultFile), 'the vault copy follows the note folder')
    assert.deepEqual([...(await readFile(vaultFile)).subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47])

    // The local copy stays in the plugin data directory (§10).
    const localFile = path.join(app.paperDir(), 'figures', info.name)
    assert.ok(await exists(localFile))

    // The preview route replays the same name (spec §3.4 / `/figure/:name`).
    const preview = await app.get(`/papers/${PAPER_ID}/figure/${info.name}`)
    assert.equal(preview.status, 200)
    assert.deepEqual([...preview.body.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47])

    // A referenced image survives the round trip in the body.
    const appended = await appendEntry(app, `看图：![](${info.rel})`)
    assert.ok(appended.markdown.includes(info.rel))

    // Rejecting a non PNG/JPEG upload keeps the folder clean.
    const bad = await app.post(`/papers/${PAPER_ID}/reader-note/images`, {
      dataUrl: `data:image/png;base64,${Buffer.from('not-an-image').toString('base64')}`,
    })
    assert.equal(bad.status, 400)
  } finally {
    await app.close()
  }
})

// ── 4. organize → questions → discuss → resolve apply ─────────────────────

test('organize stores open questions, discuss streams, resolve applies one fragment', async () => {
  const { app, noteAbs } = await setupTripod()
  try {
    await appendEntry(app, '论文说 25 Gb/s 下功耗降低 30%。')
    await appendEntry(app, '第二条：眼图张开度提升。')
    const before = (await app.get(`/papers/${PAPER_ID}/reader-note`)).json()
    assert.equal(before.entryCount, 2)

    // §3.6: one typo fix in the body + one suspected hard error in questions.
    const polished = before.markdown.replace('论文说 25 Gb/s', '论文提到 25 Gb/s')
    assert.notEqual(polished, before.markdown)
    app.script([
      organizeAnswer(polished, {
        questions: [
          {
            quote: '功耗降低 30%',
            problem: '正文没有给出对照基线',
            suggestion: '这处 30% 可能是相对未均衡链路',
            ask: '这个 30% 是相对哪一组基线？',
          },
        ],
      }),
    ])
    const organized = await app.post(`/papers/${PAPER_ID}/reader-note/organize`, {
      baseHash: before.hash,
    })
    assert.equal(organized.status, 200, organized.text)
    assert.equal(organized.sse, true)
    const done = doneEvent(organized)
    assert.ok(done.markdown.includes('论文提到 25 Gb/s'))
    assert.match(done.hash, /^[a-f0-9]{16}$/)
    assert.ok(done.historyStamp.length > 0)
    // §3.6: `report` is the only spelling the host may emit.
    assert.deepEqual(done.report, {
      typos: 2,
      merges: 1,
      formatting: 3,
      summary: '统一了标点与空格',
    })
    assert.equal(done.stats, undefined)
    assert.equal(done.questions.length, 1)
    const question = done.questions[0]
    assert.match(question.id, /^q-[a-z0-9]{8}$/)
    assert.equal(question.status, 'open')
    assert.equal(question.quote, '功耗降低 30%')
    assert.ok(question.prefix.length > 0 && question.prefix.length <= 48)
    assert.ok(question.suffix.length > 0 && question.suffix.length <= 48)

    // Persisted: history reason `organize`, question file, meta.readerNoteOpen.
    const history = (await app.get(`/papers/${PAPER_ID}/reader-note/history`)).json()
    assert.equal(history.versions[0].reason, 'organize')
    assert.ok(await exists(path.join(app.paperDir(), 'reader-note-questions.json')))
    const meta = await app.readMeta()
    assert.equal(meta.readerNoteOpen, 1)
    const paper = (await app.get(`/papers/${PAPER_ID}`)).json().paper
    assert.equal(paper.readerNoteOpen, 1)

    // §3.6: a stale baseHash is answered before the SSE handshake.
    const callsBefore = app.calls.length
    const stale = await app.post(`/papers/${PAPER_ID}/reader-note/organize`, {
      baseHash: 'deadbeefdeadbeef',
    })
    assert.equal(stale.status, 409)
    assert.equal(stale.sse, false)
    assert.equal(stale.json().conflict, true)
    assert.equal(app.calls.length, callsBefore, 'a conflict never calls the model')

    // §3.7: discuss streams deltas and keeps the thread.
    app.script(['这处确实缺少对照基线，建议补上「相对未均衡链路」。'])
    const discussed = await app.post(
      `/papers/${PAPER_ID}/reader-note/questions/${question.id}/discuss`,
      { message: '我记得是和未均衡链路比的' },
    )
    assert.equal(discussed.status, 200, discussed.text)
    assert.equal(discussed.sse, true)
    const deltas = discussed.events.filter((event) => event.type === 'delta')
    assert.ok(deltas.length > 0)
    assert.ok(deltas.map((event) => event.text).join('').includes('缺少对照基线'))
    const discussDone = doneEvent(discussed)
    assert.equal(discussDone.question.id, question.id)
    assert.deepEqual(
      discussDone.question.messages.map((item) => item.role),
      ['user', 'assistant'],
    )
    assert.equal(discussDone.question.messages[0].content, '我记得是和未均衡链路比的')

    // §3.8: apply rewrites only the quoted fragment and snapshots first.
    app.script([
      JSON.stringify({
        verdict: 'fix',
        quote: '功耗降低 30%',
        replacement: '功耗降低 30%（相对未均衡链路）',
        why: '补上对照基线',
      }),
    ])
    const applied = await app.post(
      `/papers/${PAPER_ID}/reader-note/questions/${question.id}/resolve`,
      { mode: 'apply' },
    )
    assert.equal(applied.status, 200, applied.text)
    const resolved = applied.json()
    assert.equal(resolved.ok, true)
    assert.ok(resolved.markdown.includes('功耗降低 30%（相对未均衡链路）'))
    assert.equal(resolved.question.status, 'resolved')
    assert.equal(resolved.question.verdict, 'fix')
    assert.equal(resolved.replacement, '功耗降低 30%（相对未均衡链路）')
    assert.equal(resolved.entryCount, 2)
    assert.match(resolved.hash, /^[a-f0-9]{16}$/)
    const onDisk = await readFile(noteAbs, 'utf8')
    assert.ok(onDisk.includes('功耗降低 30%（相对未均衡链路）'))
    assert.ok(onDisk.includes('论文提到 25 Gb/s'), 'the organize rewrite is on disk too')
    const afterHistory = (await app.get(`/papers/${PAPER_ID}/reader-note/history`)).json()
    assert.equal(afterHistory.versions[0].reason, 'resolve')
    assert.equal((await app.get(`/papers/${PAPER_ID}`)).json().paper.readerNoteOpen, 0)

    // §3.5/§4: every snapshot holds the complete *previous* file, so the
    // `organize` snapshot is the body from before the polish (still 「论文说」,
    // no resolved fragment). Restoring it is the documented undo.
    const older = afterHistory.versions.find((item) => item.reason === 'organize')
    assert.ok(older, JSON.stringify(afterHistory.versions))
    const restored = await app.post(
      `/papers/${PAPER_ID}/reader-note/history/${older.stamp}/restore`,
    )
    assert.equal(restored.status, 200, restored.text)
    const restoredBody = restored.json()
    assert.ok(restoredBody.markdown.includes('论文说 25 Gb/s'))
    assert.equal(restoredBody.markdown.includes('论文提到 25 Gb/s'), false)
    assert.equal(restoredBody.markdown.includes('（相对未均衡链路）'), false)
    const restoredRaw = await readFile(noteAbs, 'utf8')
    assert.ok(restoredRaw.startsWith('---\n'), 'a restore writes the whole file back')
    assert.ok(
      restoredRaw.includes(`paper_id: "${PAPER_ID}"`),
      'frontmatter survives the restore',
    )
    assert.equal((await app.get(`/papers/${PAPER_ID}/reader-note/history`)).json().versions[0].reason, 'restore')
  } finally {
    await app.close()
  }
})

// ── 5. rename and move carry the whole tripod ────────────────────────────

test('renaming and moving the PDF carries the summary, the note and the attachments', async () => {
  const { app } = await setupTripod()
  try {
    await appendEntry(app, '重命名前的一条记录')
    const image = await app.post(`/papers/${PAPER_ID}/reader-note/images`, {
      dataUrl: dataUrl(PNG_BYTES),
    })
    assert.equal(image.status, 200, image.text)
    await appendEntry(app, `重命名前的图片：![](${image.json().rel})`)

    // §12.2 rename: all three files follow `<旧 stem>` → `<新 stem>`.
    const renamed = await app.request('PATCH', '/vault/item', {
      rel: PDF_REL,
      fileName: '改名后的文献',
    })
    assert.equal(renamed.status, 200, renamed.text)
    const renameBody = renamed.json()
    assert.equal(renameBody.renamed, true)
    assert.equal(renameBody.summaryRenamed, true)
    assert.ok(renameBody.summaryRenamedPath)

    const newPdfRel = `${FOLDER}/改名后的文献.pdf`
    const newSummaryRel = `${FOLDER}/改名后的文献 总结.md`
    const newNoteRel = `${FOLDER}/改名后的文献 笔记.md`
    assert.ok(await exists(abs(app, newPdfRel)))
    assert.ok(await exists(abs(app, newSummaryRel)))
    assert.ok(await exists(abs(app, newNoteRel)))
    assert.equal(await exists(abs(app, PDF_REL)), false)
    assert.equal(await exists(abs(app, SUMMARY_REL)), false)
    assert.equal(await exists(abs(app, NOTE_REL)), false)

    // Interlinks and path fields are rewritten by the existing link pass.
    const noteRaw = await readVault(app, newNoteRel)
    assert.ok(noteRaw.includes('pdf: "[[改名后的文献.pdf]]"'))
    assert.ok(noteRaw.includes('summary_note: "[[改名后的文献 总结]]"'))
    assert.ok(noteRaw.includes('> 文献：[[改名后的文献.pdf]]'))
    assert.ok(noteRaw.includes(`vault_path: "${newPdfRel}"`))
    assert.ok(noteRaw.includes('重命名前的一条记录'), 'entries survive the rename')

    const metaAfterRename = await app.readMeta()
    assert.equal(metaAfterRename.vaultPath, newPdfRel)
    assert.equal(metaAfterRename.summaryPath, abs(app, newSummaryRel))
    const listedAfterRename = (await app.get(`/papers/${PAPER_ID}/reader-note`)).json()
    assert.equal(listedAfterRename.exists, true)
    assert.equal(listedAfterRename.relative, newNoteRel)
    assert.equal(listedAfterRename.path, abs(app, newNoteRel))

    // §12.2 move: PDF, summary, note and `_附件/<paperId>/` move together.
    await mkdir(abs(app, 'archive'), { recursive: true })
    const moved = await app.post('/vault/item/move', {
      rel: newPdfRel,
      folder: 'archive',
      kind: 'pdf',
    })
    assert.equal(moved.status, 200, moved.text)
    const moveBody = moved.json()
    assert.equal(moveBody.changed, true)
    const kinds = moveBody.moved.map((item) => item.kind).sort()
    assert.deepEqual(kinds, ['assets', 'note', 'pdf', 'summary'])
    assert.equal(moveBody.paperId, PAPER_ID)

    const movedPdfRel = 'archive/改名后的文献.pdf'
    const movedNoteRel = 'archive/改名后的文献 笔记.md'
    assert.ok(await exists(abs(app, movedPdfRel)))
    assert.ok(await exists(abs(app, 'archive/改名后的文献 总结.md')))
    assert.ok(await exists(abs(app, movedNoteRel)))
    assert.ok(await exists(abs(app, `archive/_附件/${PAPER_ID}/笔记`)))
    assert.equal(await exists(abs(app, `${FOLDER}/_附件/${PAPER_ID}`)), false)

    const metaAfterMove = await app.readMeta()
    assert.equal(metaAfterMove.vaultPath, movedPdfRel)
    assert.equal(metaAfterMove.readerNoteRelative, movedNoteRel)
    assert.equal(metaAfterMove.readerNotePath, abs(app, movedNoteRel))
    const listedAfterMove = (await app.get(`/papers/${PAPER_ID}/reader-note`)).json()
    assert.equal(listedAfterMove.exists, true)
    assert.equal(listedAfterMove.relative, movedNoteRel)
    // The relative image link stays valid from the new folder.
    assert.match(listedAfterMove.markdown, /_附件\/paper-test-001\/笔记\/img-/)
    assert.ok(await exists(abs(app, `archive/_附件/${PAPER_ID}/笔记/${image.json().name}`)))
    // The summary route keeps working (absolute paths were rebased).
    const summary = await app.get(`/papers/${PAPER_ID}/summary`)
    assert.equal(summary.status, 200, summary.text)
    // The library still associates the summary, not the reader note.
    const library = await app.get('/vault/library?refresh=1')
    const entry = library.json().pdfs.find((item) => item.rel === movedPdfRel)
    assert.equal(entry.noteRel, 'archive/改名后的文献 总结.md')
    assert.equal(entry.readerNoteRel, movedNoteRel)
  } finally {
    await app.close()
  }
})

// ── 6. delete: the three-way vault choice (§12.3) ────────────────────────

test('deleting a paper offers keep / summary / all and keeps the PDF in every case', async () => {
  // keep (the default): nothing in the vault is touched.
  {
    const { app, pdfAbs, summaryAbs, noteAbs, assetsAbs } = await setupTripod()
    try {
      await app.post(`/papers/${PAPER_ID}/reader-note/images`, { dataUrl: dataUrl(PNG_BYTES) })
      const response = await app.delete(`/papers/${PAPER_ID}?confirm=true`)
      assert.equal(response.status, 200, response.text)
      const body = response.json()
      assert.equal(body.vaultFiles, 'keep')
      assert.equal(body.vaultPreserved, true)
      assert.ok(await exists(pdfAbs))
      assert.ok(await exists(summaryAbs))
      assert.ok(await exists(noteAbs))
      assert.ok(await exists(assetsAbs))
      // The plugin-side state always goes, history included.
      assert.equal(await exists(app.paperDir()), false)
      assert.equal((await app.get(`/papers/${PAPER_ID}`)).status, 404)
    } finally {
      await app.close()
    }
  }

  // summary: the study note leaves, the rest stays.
  {
    const { app, pdfAbs, summaryAbs, noteAbs, assetsAbs } = await setupTripod()
    try {
      await app.post(`/papers/${PAPER_ID}/reader-note/images`, { dataUrl: dataUrl(PNG_BYTES) })
      const response = await app.delete(`/papers/${PAPER_ID}?confirm=true&vaultFiles=summary`)
      assert.equal(response.status, 200, response.text)
      assert.equal(response.json().vaultFiles, 'summary')
      assert.ok(await exists(pdfAbs))
      assert.equal(await exists(summaryAbs), false)
      assert.ok(await exists(noteAbs))
      assert.ok(await exists(assetsAbs))
    } finally {
      await app.close()
    }
  }

  // all: summary + note + `_附件/<paperId>/` are removed, the PDF stays.
  {
    const { app, pdfAbs, summaryAbs, noteAbs, assetsAbs } = await setupTripod()
    try {
      await app.post(`/papers/${PAPER_ID}/reader-note/images`, { dataUrl: dataUrl(PNG_BYTES) })
      assert.ok(await exists(assetsAbs))
      const response = await app.delete(`/papers/${PAPER_ID}?confirm=true&vaultFiles=all`)
      assert.equal(response.status, 200, response.text)
      const body = response.json()
      assert.equal(body.vaultFiles, 'all')
      assert.ok(await exists(pdfAbs), 'the PDF itself is never deleted here')
      assert.equal(await exists(summaryAbs), false)
      assert.equal(await exists(noteAbs), false)
      assert.equal(await exists(assetsAbs), false)
    } finally {
      await app.close()
    }
  }

  // The legacy `deleteNotes: true` body flag still means `all`.
  {
    const { app, summaryAbs, noteAbs } = await setupTripod()
    try {
      const response = await app.request('DELETE', `/papers/${PAPER_ID}?confirm=true`, {
        deleteNotes: true,
      })
      assert.equal(response.status, 200, response.text)
      assert.equal(response.json().vaultFiles, 'all')
      assert.equal(await exists(summaryAbs), false)
      assert.equal(await exists(noteAbs), false)
    } finally {
      await app.close()
    }
  }

  // An unknown choice is refused instead of silently falling back to `keep`.
  {
    const { app, summaryAbs } = await setupTripod()
    try {
      const response = await app.delete(`/papers/${PAPER_ID}?confirm=true&vaultFiles=everything`)
      assert.equal(response.status, 400)
      assert.ok(await exists(summaryAbs))
    } finally {
      await app.close()
    }
  }
})

// ── 7. §14.2 figure folders stay split, §14.6 lost note asks first ────────

test('summary and note images live in separate attachment sub folders', async () => {
  const { app, assetsAbs } = await setupTripod()
  try {
    const uploaded = await app.post(`/papers/${PAPER_ID}/reader-note/images`, {
      dataUrl: dataUrl(PNG_BYTES),
    })
    assert.equal(uploaded.status, 200, uploaded.text)
    const rel = uploaded.json().rel
    assert.match(rel, new RegExp(`^_附件/${PAPER_ID}/笔记/img-\\d{8}-\\d{6}-[a-z0-9]{4}\\.png$`))
    assert.ok(existsSync(path.join(assetsAbs, '笔记')))
    assert.equal(existsSync(path.join(assetsAbs, '图')), false, 'a note image never lands in 图/')
    // §14.2: three-argument `vaultFigureDir` keeps the legacy flat folder so
    // links written before the split stay valid.
    const legacy = path.join(abs(app, FOLDER), '_附件', PAPER_ID)
    assert.equal(legacy, assetsAbs)
  } finally {
    await app.close()
  }
})

test('a note file deleted outside the plugin reports lostPath before recreating', async () => {
  const { app, noteAbs } = await setupTripod()
  try {
    // One entry is enough to leave an `append` snapshot behind.
    await appendEntry(app, '外部删除前的一条记录')
    const { rm } = await import('node:fs/promises')
    await rm(noteAbs, { force: true })
    const listed = (await app.get(`/papers/${PAPER_ID}/reader-note`)).json()
    assert.equal(listed.exists, false)
    assert.equal(listed.lostPath, noteAbs)
    assert.equal((await app.get(`/papers/${PAPER_ID}`)).json().paper.hasReaderNote, false)
    // History survives, so the reader can still recover the content (§14.6).
    const history = (await app.get(`/papers/${PAPER_ID}/reader-note/history`)).json()
    assert.ok(history.versions.length > 0)
    // Re-creating is explicit (the client asks first) and works.
    const recreated = await app.post(`/papers/${PAPER_ID}/reader-note`)
    assert.equal(recreated.status, 200, recreated.text)
    assert.equal(recreated.json().created, true)
    assert.ok(await exists(noteAbs))
  } finally {
    await app.close()
  }
})
