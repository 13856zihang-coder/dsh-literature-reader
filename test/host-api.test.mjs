import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { hasPoppler } from '../lib/figures.js'
import {
  JPEG_BYTES,
  NOTES_FOLDER,
  PAPER_ID,
  PNG_BYTES,
  SAMPLE_NOTE,
  createApp,
  dataUrl,
  doneEvent,
  minimalPdf,
  seedPaper,
} from './helpers.mjs'

// End-to-end tests for the study-note host API (spec §7). Every case boots a
// fresh plugin instance with its own temp dataDir/vault, so they are order
// independent and safe to re-run.

const NOTE_WITH_FIGURE = `${SAMPLE_NOTE}
## 6. 我的理解与知识连接

实验部分的整体架构见下图。

[[FIGURE: p.1 | 图 1 测试架构 | 用来确认整页渲染与裁剪链路]]
`

function summaryScript(body, tags = '均衡器, 高速链路, 眼图, 信号完整性') {
  return `TAGS: ${tags}\n\n${body}`
}

// `locateFigure` answers the vision call with a full-page box: the fake PDF is
// one small page, so any box inside 0-1000 is a legal crop region.
const LOCATE_ANSWER = JSON.stringify({
  found: true,
  bbox: [50, 50, 950, 950],
  label: '图 1',
  confidence: 0.9,
  note: '整页',
})

function reviseAnswer(edits, unresolved = [], reply = '按标注修改完成') {
  return JSON.stringify({ reply, edits, unresolved })
}

async function appWithNote(options = {}) {
  const app = await createApp(options)
  await seedPaper(app, { pdf: minimalPdf() })
  return app
}

test('POST /summary generates a note, resolves figure placeholders and mirrors it into the vault', async (t) => {
  if (!(await hasPoppler())) {
    t.skip('Poppler is not installed')
    return
  }
  const app = await appWithNote({ script: [summaryScript(NOTE_WITH_FIGURE), LOCATE_ANSWER] })
  try {
    const res = await app.post(`/papers/${PAPER_ID}/summary`)
    assert.equal(res.status, 200)
    assert.match(res.contentType, /event-stream/)
    const done = doneEvent(res)
    assert.ok(Array.isArray(done.figures), 'done.figures must be an array (spec §7.1)')
    assert.ok(Array.isArray(done.figureFailures), 'done.figureFailures must be an array (spec §7.1)')
    // The one placeholder had a page inside the document, so it must be cropped.
    assert.equal(done.figures.length, 1, JSON.stringify(done.figureFailures))
    assert.deepEqual(done.figureFailures, [])

    const body = await app.readSummary()
    // Spec §3.2: the placeholder line becomes an image block plus an italic
    // page caption. The visible label may come from the vision model's own
    // label, so only the shape and the link target are asserted here.
    const imageLine = body.split('\n').find((line) => line.startsWith('![') && line.includes('fig-p01-01.png'))
    assert.ok(imageLine, 'the placeholder must be replaced by an image block')
    // spec §7.8b: summary figures live under _附件/<id>/图/ next to the PDF.
    assert.match(imageLine, /^!\[[^\]]+\]\(_附件\/paper-test-001\/图\/fig-p01-01\.png\)$/)
    assert.match(body, /\n\*[^*\n]+ · p\.1\*\n/, 'the image must be followed by a p.1 caption line')
    assert.doesNotMatch(body, /\[\[FIGURE/, 'no placeholder may survive the generation step')
    assert.deepEqual(await readdir(path.join(app.paperDir(), 'figures')), ['fig-p01-01.png'])

    // The Obsidian mirror keeps frontmatter and the source footer.
    const notePath = path.join(app.vaultPath, done.relative)
    const note = await readFile(notePath, 'utf8')
    assert.match(note, /^---\n/)
    assert.match(note, /> \[!info\] 来源/)
    assert.match(note, /fig-p01-01\.png/)
    const attachment = path.join(app.vaultPath, NOTES_FOLDER, '_附件', PAPER_ID, '图', 'fig-p01-01.png')
    assert.deepEqual([...(await readFile(attachment)).subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47])

    const meta = await app.readMeta()
    assert.equal(meta.summaryVersion, done.version)
    assert.equal(meta.summaryFigureCount, 1)
  } finally {
    await app.close()
  }
})

test('POST /summary keeps the note readable when the PDF is missing (figure failure callout)', async () => {
  const app = await createApp({ script: [summaryScript(NOTE_WITH_FIGURE)] })
  try {
    await seedPaper(app) // no source.pdf on purpose
    const res = await app.post(`/papers/${PAPER_ID}/summary`)
    assert.equal(res.status, 200)
    const done = doneEvent(res)
    assert.equal(done.figures.length, 0)
    assert.equal(done.figureFailures.length, 1)
    const body = await app.readSummary()
    assert.doesNotMatch(body, /\[\[FIGURE/)
    assert.match(body, /> \[!figure\] 图未自动截取：图 1 测试架构（p\.1）/)
    assert.match(body, /> 可在编辑模式下自行插入图片。/)
  } finally {
    await app.close()
  }
})

test('GET /summary reports 404 before a note exists and the full payload afterwards', async () => {
  const app = await appWithNote()
  try {
    const missing = await app.get(`/papers/${PAPER_ID}/summary`)
    assert.equal(missing.status, 404)
    assert.match(missing.json().error, /还没有生成总结/)

    const dir = app.paperDir()
    const { writeSummary } = await import('../lib/summary-note.js')
    await writeSummary(dir, SAMPLE_NOTE, { source: 'generate' })

    const res = await app.get(`/papers/${PAPER_ID}/summary`)
    assert.equal(res.status, 200)
    const body = res.json()
    assert.equal(typeof body.markdown, 'string')
    assert.match(body.markdown, /均衡器学习笔记/)
    assert.equal(typeof body.version, 'string')
    assert.equal(body.version.length, 16)
    assert.ok(Array.isArray(body.annotations))
    assert.deepEqual(body.note, { path: '', relative: '', exists: false })
  } finally {
    await app.close()
  }
})

test('PUT /summary rejects an empty body and oversized markdown', async () => {
  const app = await appWithNote()
  try {
    const { writeSummary } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), SAMPLE_NOTE)

    const empty = await app.put(`/papers/${PAPER_ID}/summary`, { markdown: '   \n' })
    assert.equal(empty.status, 400)

    const huge = await app.put(`/papers/${PAPER_ID}/summary`, { markdown: 'x'.repeat(400 * 1024 + 1) })
    assert.equal(huge.status, 413)
    // Neither request may clobber the stored body.
    assert.match(await app.readSummary(), /均衡器学习笔记/)
  } finally {
    await app.close()
  }
})

test('PUT /summary detects a stale baseVersion, honours force and re-anchors annotations', async () => {
  const app = await appWithNote()
  try {
    const { writeSummary, writeAnnotations } = await import('../lib/summary-note.js')
    const first = await writeSummary(app.paperDir(), SAMPLE_NOTE)
    await writeAnnotations(app.paperDir(), [
      { id: 'a1', quote: '眼图张开度提升 30%', note: '补图', start: 0, end: 0 },
    ])

    const nextBody = SAMPLE_NOTE.replace('结论是均衡能显著改善误码率 [p.9]。', '结论：在 25 Gb/s 下误码率显著下降 [p.9]。')
    const conflict = await app.put(`/papers/${PAPER_ID}/summary`, { markdown: nextBody, baseVersion: 'deadbeefdeadbeef' })
    assert.equal(conflict.status, 409)
    const conflictBody = conflict.json()
    assert.equal(conflictBody.conflict, true)
    assert.equal(conflictBody.version, first.version)
    assert.equal(conflictBody.markdown, SAMPLE_NOTE)
    assert.match(conflictBody.error, /已在别处更新/)

    const forced = await app.put(`/papers/${PAPER_ID}/summary`, { markdown: nextBody, baseVersion: 'deadbeefdeadbeef', force: true })
    assert.equal(forced.status, 200)
    const saved = forced.json()
    assert.equal(saved.ok, true)
    assert.notEqual(saved.version, first.version)
    assert.ok(Array.isArray(saved.lost))
    assert.ok(Array.isArray(saved.annotations))
    // The quote still exists, so the annotation survived and was re-anchored.
    assert.equal(saved.lost.length, 0)
    assert.equal(saved.annotations[0].status, 'open')
    const at = nextBody.indexOf('眼图张开度提升 30%')
    assert.equal(saved.annotations[0].start, at)
    assert.equal((await app.readSummary()).includes('误码率显著下降'), true)
    // A snapshot of the old body was taken before overwriting.
    const history = await app.get(`/papers/${PAPER_ID}/summary/history`)
    assert.ok(history.json().versions.length >= 1)
  } finally {
    await app.close()
  }
})

test('annotations round-trip: valid quotes are anchored, missing quotes become orphan', async () => {
  const app = await appWithNote()
  try {
    const { writeSummary } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), SAMPLE_NOTE)

    const res = await app.put(`/papers/${PAPER_ID}/summary/annotations`, {
      annotations: [
        { id: 'keep', quote: '眼图张开度提升 30%', note: '补上图表引用', color: 'rose', status: 'open' },
        { id: 'lost', quote: '这段原文根本不存在', note: '失效标注', status: 'open' },
      ],
    })
    assert.equal(res.status, 200)
    const body = res.json()
    assert.equal(body.ok, true)
    const keep = body.annotations.find((item) => item.id === 'keep')
    const lost = body.annotations.find((item) => item.id === 'lost')
    assert.equal(keep.status, 'open')
    assert.equal(keep.color, 'rose')
    assert.equal(SAMPLE_NOTE.slice(keep.start, keep.end), '眼图张开度提升 30%')
    assert.deepEqual(body.orphans, ['lost'])
    assert.equal(lost.status, 'orphan')
    assert.equal(lost.quote, '这段原文根本不存在')

    const stored = await app.readAnnotationsFile()
    assert.equal(stored.version, 1)
    assert.deepEqual(stored.annotations.map((item) => item.status), ['open', 'orphan'])

    // Invalid payloads are refused outright.
    const bad = await app.put(`/papers/${PAPER_ID}/summary/annotations`, { annotations: 'nope' })
    assert.equal(bad.status, 400)
  } finally {
    await app.close()
  }
})

test('POST /summary/revise applies annotation edits and marks them resolved', async () => {
  const app = await appWithNote({
    script: [reviseAnswer([{ id: 'a1', replacement: '在 25 Gb/s 下眼图张开度提升 30%（图 5）[p.7]', why: '补图表引用' }])],
  })
  try {
    const { writeSummary, writeAnnotations } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), SAMPLE_NOTE)
    await writeAnnotations(app.paperDir(), [
      { id: 'a1', quote: '眼图张开度提升 30%', note: '补上图表引用', status: 'open' },
    ])

    const res = await app.post(`/papers/${PAPER_ID}/summary/revise`, {})
    assert.equal(res.status, 200)
    assert.match(res.contentType, /event-stream/)
    const done = doneEvent(res)
    assert.match(done.markdown, /眼图张开度提升 30%（图 5）\[p\.7\]/)
    assert.equal(done.applied.length, 1)
    assert.equal(done.applied[0].id, 'a1')
    assert.equal(done.applied[0].why, '补图表引用')
    assert.deepEqual(done.unresolved, [])
    assert.equal(done.version, done.version)
    assert.equal(typeof done.historyStamp, 'string')
    assert.ok(done.annotations.find((item) => item.id === 'a1').status === 'resolved')
    assert.match(await app.readSummary(), /（图 5）/)
  } finally {
    await app.close()
  }
})

test('POST /summary/revise keeps unresolved annotations open with a reply, and can delete text', async () => {
  const app = await appWithNote({
    script: [
      reviseAnswer(
        [{ id: 'del', replacement: '', why: '删除重复句' }],
        [{ id: 'open', reason: '原文里没有对应数据，无法补' }],
      ),
    ],
  })
  try {
    const { writeSummary, writeAnnotations } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), SAMPLE_NOTE)
    await writeAnnotations(app.paperDir(), [
      { id: 'del', quote: '在 25 Gb/s 下眼图张开度提升 30% [p.7]。', note: '这句重复，删掉', status: 'open' },
      { id: 'open', quote: '现有均衡器在 25 Gb/s 下功耗偏高', note: '补一个对比实验', status: 'open' },
    ])

    const res = await app.post(`/papers/${PAPER_ID}/summary/revise`, {})
    const done = doneEvent(res)
    assert.equal(done.applied.length, 1)
    assert.equal(done.applied[0].id, 'del')
    assert.deepEqual(done.unresolved.map((item) => item.id), ['open'])
    assert.equal(done.unresolved[0].reason, '原文里没有对应数据，无法补')
    // An empty replacement deletes the fragment instead of leaving it in place.
    assert.doesNotMatch(done.markdown, /眼图张开度提升 30% \[p\.7\]/)

    const states = Object.fromEntries(done.annotations.map((item) => [item.id, item]))
    assert.equal(states.del.status, 'resolved')
    assert.equal(states.del.reply, '删除重复句')
    assert.equal(states.open.status, 'open')
    assert.equal(states.open.reply, '原文里没有对应数据，无法补')
  } finally {
    await app.close()
  }
})

test('POST /summary/revise rejects a request with no annotations and no instruction', async () => {
  const app = await appWithNote()
  try {
    const { writeSummary } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), SAMPLE_NOTE)
    const res = await app.post(`/papers/${PAPER_ID}/summary/revise`, { ids: [], instruction: '  ' })
    assert.equal(res.status, 400)
    assert.match(res.json().error, /没有待应用的标注/)
  } finally {
    await app.close()
  }
})

test('POST /summary/revise only revises the selected ids and reports skipped ones', async () => {
  const app = await appWithNote({
    script: [reviseAnswer([{ id: 'a1', replacement: '改写后的句子', why: '只改选中的那条' }])],
  })
  try {
    const { writeSummary, writeAnnotations } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), SAMPLE_NOTE)
    await writeAnnotations(app.paperDir(), [
      { id: 'a1', quote: '眼图张开度提升 30%', note: '改一下', status: 'open' },
      { id: 'a2', quote: '结论是均衡能显著改善误码率 [p.9]。', note: '这条这次不处理', status: 'open' },
    ])

    const res = await app.post(`/papers/${PAPER_ID}/summary/revise`, { ids: ['a1'] })
    const done = doneEvent(res)
    assert.deepEqual(done.applied.map((item) => item.id), ['a1'])
    // Only the selected annotation is sent to the model; the other stays open.
    const sent = app.calls.at(-1).messages[0].content[0].text
    assert.match(sent, /id=a1/)
    assert.doesNotMatch(sent, /id=a2/)
    const states = Object.fromEntries(done.annotations.map((item) => [item.id, item]))
    assert.equal(states.a1.status, 'resolved')
    assert.equal(states.a2.status, 'open')
  } finally {
    await app.close()
  }
})

test('POST /summary/revise turns an unusable model answer into an SSE error and keeps the body', async () => {
  // Strict-JSON calls retry once, so an unusable answer must be fed twice.
  const app = await appWithNote({ script: ['不是 JSON 的答案', '仍然不是 JSON'] })
  try {
    const { writeSummary, writeAnnotations } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), SAMPLE_NOTE)
    await writeAnnotations(app.paperDir(), [
      { id: 'a1', quote: '眼图张开度提升 30%', note: '补图表引用', status: 'open' },
    ])
    const before = await app.readSummary()

    const res = await app.post(`/papers/${PAPER_ID}/summary/revise`, {})
    assert.equal(res.status, 200)
    const failure = res.events.find((event) => event.type === 'error')
    assert.ok(failure, 'an unusable model answer must surface as an SSE error event')
    assert.match(failure.message, /无法使用/)
    assert.doesNotMatch(res.text, /"type":"done"/)
    assert.equal(await app.readSummary(), before)
  } finally {
    await app.close()
  }
})

test('history lists versions, previews one and rejects unknown or malformed stamps', async () => {
  const app = await appWithNote()
  try {
    const { writeSummary } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), `${SAMPLE_NOTE}\n第一版补充。\n`)
    await writeSummary(app.paperDir(), `${SAMPLE_NOTE}\n第二版补充。\n`)

    const list = await app.get(`/papers/${PAPER_ID}/summary/history`)
    assert.equal(list.status, 200)
    const versions = list.json().versions
    assert.ok(Array.isArray(versions))
    assert.ok(versions.length >= 1)
    for (const entry of versions) {
      assert.equal(typeof entry.stamp, 'string')
      assert.equal(typeof entry.updatedAt, 'string')
      assert.equal(typeof entry.chars, 'number')
      assert.ok(!('markdown' in entry), 'the list must not carry the body (spec §7.1)')
    }
    const stamp = versions[0].stamp
    assert.match(stamp, /^\d{8}-\d{6}-\d{3}(-\d+)?$/)

    const preview = await app.get(`/papers/${PAPER_ID}/summary/history/${stamp}`)
    assert.equal(preview.status, 200)
    const body = preview.json()
    assert.equal(body.stamp, stamp)
    assert.match(body.markdown, /第一版补充/)
    assert.equal(body.chars, body.markdown.length)
    assert.equal(typeof body.version, 'string')
    assert.equal(typeof body.updatedAt, 'string')

    // Read side: a bean-shaped stamp or a pruned version is a plain 404.
    const unknown = await app.get(`/papers/${PAPER_ID}/summary/history/20990101-000000-000`)
    assert.equal(unknown.status, 404)
    const malformed = await app.get(`/papers/${PAPER_ID}/summary/history/not-a-stamp`)
    assert.equal(malformed.status, 404)
    const traversal = await app.get(`/papers/${PAPER_ID}/summary/history/..%2F..%2Fmeta.json`)
    assert.equal(traversal.status, 404)
  } finally {
    await app.close()
  }
})

test('restoring a version snapshots the current body and refuses path traversal', async () => {
  const app = await appWithNote()
  try {
    const { writeSummary, listHistory } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), `${SAMPLE_NOTE}\n被恢复的旧版本。\n`)
    await writeSummary(app.paperDir(), `${SAMPLE_NOTE}\n当前正文。\n`)
    const [first] = await listHistory(app.paperDir())
    const countBefore = (await listHistory(app.paperDir())).length

    const res = await app.post(`/papers/${PAPER_ID}/summary/history/${first.stamp}/restore`, {})
    assert.equal(res.status, 200)
    const body = res.json()
    assert.equal(body.ok, true)
    assert.match(body.markdown, /被恢复的旧版本/)
    assert.equal(typeof body.version, 'string')
    assert.equal(typeof body.updatedAt, 'string')

    // The body that was live before the restore is saved as a new snapshot.
    const after = await listHistory(app.paperDir())
    assert.equal(after.length, countBefore + 1)
    const restored = after.find((entry) => entry.stamp === body.historyStamp)
    assert.ok(restored, 'restore must report the snapshot it created')

    // An illegal stamp is a client error on this write route (spec keeps 400).
    const traversal = await app.post(`/papers/${PAPER_ID}/summary/history/..%2F..%2Fmeta/restore`, {})
    assert.equal(traversal.status, 400)
    const missing = await app.post(`/papers/${PAPER_ID}/summary/history/20990101-000000-000/restore`, {})
    assert.equal(missing.status, 404)
  } finally {
    await app.close()
  }
})

test('GET /figure serves whitelisted images and rejects traversal or foreign names', async (t) => {
  if (!(await hasPoppler())) {
    t.skip('Poppler is not installed')
    return
  }
  const app = await appWithNote({ script: [summaryScript(NOTE_WITH_FIGURE), LOCATE_ANSWER] })
  try {
    await app.post(`/papers/${PAPER_ID}/summary`)
    const res = await app.get(`/papers/${PAPER_ID}/figure/fig-p01-01.png`)
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'image/png')
    assert.deepEqual([...res.body.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47])

    const traversal = await app.get(`/papers/${PAPER_ID}/figure/..%2Fmeta.json`)
    assert.ok([400, 404].includes(traversal.status) || traversal.status === undefined)
    const foreign = await app.get(`/papers/${PAPER_ID}/figure/meta.json`)
    assert.ok([400, 404].includes(foreign.status))
    const missing = await app.get(`/papers/${PAPER_ID}/figure/fig-p99-99.png`)
    assert.equal(missing.status, 404)
  } finally {
    await app.close()
  }
})

test('POST /summary/images asks for a location when the plan cannot pick a section', async () => {
  const app = await appWithNote({
    script: [JSON.stringify({ action: 'ask', question: '这张图应该放在哪一节？', suggestion: '看起来和 4.2 节的结果有关' })],
  })
  try {
    const { writeSummary } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), SAMPLE_NOTE)
    const res = await app.post(`/papers/${PAPER_ID}/summary/images`, {
      dataUrl: dataUrl(PNG_BYTES),
      mediaType: 'image/png',
      instruction: '这张图放在哪里合适？',
    })
    assert.equal(res.status, 200)
    const body = res.json()
    assert.equal(body.status, 'needs_question')
    assert.equal(body.imageId, body.imageName)
    assert.equal(typeof body.question, 'string')
    assert.ok(body.question.length > 0)
    assert.equal(await app.readSummary(), SAMPLE_NOTE, 'asking must not modify the note')
    assert.equal(body.round, 1)
  } finally {
    await app.close()
  }
})

test('POST /summary/images inserts at an explicit heading and copies the file twice', async () => {
  const app = await appWithNote()
  try {
    const { writeSummary } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), SAMPLE_NOTE)
    const res = await app.post(`/papers/${PAPER_ID}/summary/images`, {
      dataUrl: dataUrl(PNG_BYTES),
      mediaType: 'image/png',
      caption: '测试插图',
      anchor: { heading: '## 4. 实验、数据与结果' },
    })
    assert.equal(res.status, 200)
    const body = res.json()
    assert.equal(body.status, 'inserted')
    assert.ok(!('fallback' in body), 'an explicit anchor must not report a fallback')
    // spec §7.8b: summary figures live under _附件/<id>/图/ next to the PDF.
    assert.match(body.markdown, /!\[测试插图\]\(_附件\/paper-test-001\/图\/img-/)

    // Inserted inside the chosen section, before the next same-level heading.
    const headingAt = body.markdown.indexOf('## 4. 实验、数据与结果')
    const imageAt = body.markdown.indexOf('![测试插图]')
    const nextSection = body.markdown.indexOf('## 5. 结论、论证强度与局限')
    assert.ok(headingAt >= 0 && imageAt > headingAt && imageAt < nextSection)

    const localFigures = await readdir(path.join(app.paperDir(), 'figures'))
    assert.equal(localFigures.length, 1)
    const vaultFigures = await readdir(
      path.join(app.vaultPath, NOTES_FOLDER, '_附件', PAPER_ID, '图'),
    )
    assert.deepEqual(vaultFigures, localFigures)
  } finally {
    await app.close()
  }
})

test('POST /summary/images rejects an unresolvable explicit anchor with 400 (no silent fallback)', async () => {
  const app = await appWithNote()
  try {
    const { writeSummary } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), SAMPLE_NOTE)
    const res = await app.post(`/papers/${PAPER_ID}/summary/images`, {
      dataUrl: dataUrl(PNG_BYTES),
      mediaType: 'image/png',
      anchor: { heading: '## 9. 不存在的章节' },
    })
    assert.equal(res.status, 400)
    assert.match(res.json().error, /插入位置/)
    assert.equal(await app.readSummary(), SAMPLE_NOTE, 'a rejected anchor must not touch the note')
  } finally {
    await app.close()
  }
})

test('POST /summary/images validates the payload: magic numbers, media type and size', async () => {
  const app = await appWithNote()
  try {
    const { writeSummary } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), SAMPLE_NOTE)

    const text = await app.post(`/papers/${PAPER_ID}/summary/images`, {
      dataUrl: dataUrl(Buffer.from('这不是图片，只是一段普通文本'), 'image/png'),
      mediaType: 'image/png',
    })
    assert.equal(text.status, 400)
    assert.match(text.json().error, /PNG 或 JPEG/)

    const gif = await app.post(`/papers/${PAPER_ID}/summary/images`, {
      dataUrl: dataUrl(PNG_BYTES, 'image/gif'),
      mediaType: 'image/gif',
    })
    assert.equal(gif.status, 400)

    // Declared PNG but actually JPEG: the magic-number check must catch it.
    const mismatch = await app.post(`/papers/${PAPER_ID}/summary/images`, {
      dataUrl: dataUrl(JPEG_BYTES, 'image/png'),
      mediaType: 'image/png',
    })
    assert.equal(mismatch.status, 400)
    assert.match(mismatch.json().error, /类型不一致/)

    const missing = await app.post(`/papers/${PAPER_ID}/summary/images`, { instruction: '没有图' })
    assert.equal(missing.status, 400)
    assert.match(missing.json().error, /缺少图片数据/)

    // Base64 payload larger than 8MB after decoding.
    const big = Buffer.concat([PNG_BYTES, Buffer.alloc(8 * 1024 * 1024, 0x20)])
    const oversized = await app.post(`/papers/${PAPER_ID}/summary/images`, {
      dataUrl: dataUrl(big),
      mediaType: 'image/png',
    })
    assert.equal(oversized.status, 413)
    assert.match(oversized.json().error, /8MB/)
  } finally {
    await app.close()
  }
})

test('POST /summary/images follows the model plan heading instead of appending to the end', async () => {
  const app = await appWithNote({
    script: [
      JSON.stringify({
        action: 'insert',
        heading: '### 4.2 主要结果',
        afterOffset: null,
        caption: '眼图结果',
        reason: '和主要结果一节相关',
      }),
    ],
  })
  try {
    const { writeSummary } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), SAMPLE_NOTE)
    const res = await app.post(`/papers/${PAPER_ID}/summary/images`, {
      dataUrl: dataUrl(PNG_BYTES),
      mediaType: 'image/png',
      instruction: '插到主要结果那里',
    })
    assert.equal(res.status, 200)
    const body = res.json()
    assert.equal(body.status, 'inserted')
    assert.ok(!('fallback' in body))
    const imageAt = body.markdown.indexOf('![眼图结果]')
    const sectionAt = body.markdown.indexOf('### 4.2 主要结果')
    const nextSection = body.markdown.indexOf('## 5. 结论')
    assert.ok(imageAt > sectionAt, 'image must land after the chosen heading')
    assert.ok(imageAt < nextSection, 'image must stay inside the chosen section, not at the end')
  } finally {
    await app.close()
  }
})

test('POST /summary/images/:imageId/place answers the question and inserts the image', async () => {
  const app = await appWithNote({
    script: [
      JSON.stringify({ action: 'ask', question: '这张图应该放在哪一节？', suggestion: '看起来像实验结果' }),
      JSON.stringify({ action: 'insert', heading: '### 4.2 主要结果', afterOffset: null, caption: '结果插图', reason: '用户回答是结果' }),
    ],
  })
  try {
    const { writeSummary } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), SAMPLE_NOTE)
    const asked = await app.post(`/papers/${PAPER_ID}/summary/images`, {
      dataUrl: dataUrl(PNG_BYTES),
      mediaType: 'image/png',
      instruction: '不太确定放哪',
    })
    const first = asked.json()
    assert.equal(first.status, 'needs_question')

    const placed = await app.post(`/papers/${PAPER_ID}/summary/images/${first.imageId}/place`, {
      answer: '放在主要结果那节',
    })
    assert.equal(placed.status, 200)
    const body = placed.json()
    assert.equal(body.status, 'inserted')
    assert.ok(!('fallback' in body))
    assert.match(body.markdown, /!\[结果插图\]/)
    assert.ok(body.markdown.indexOf('![结果插图]') < body.markdown.indexOf('## 5. 结论'))
  } finally {
    await app.close()
  }
})

test('POST /summary/images/:imageId/place honours an explicit anchor from the client', async () => {
  const app = await appWithNote({
    script: [JSON.stringify({ action: 'ask', question: '放在哪一节？', suggestion: '' })],
  })
  try {
    const { writeSummary } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), SAMPLE_NOTE)
    const asked = await app.post(`/papers/${PAPER_ID}/summary/images`, {
      dataUrl: dataUrl(PNG_BYTES),
      mediaType: 'image/png',
      instruction: '不知道放哪',
    })
    const question = asked.json()
    assert.equal(question.status, 'needs_question')

    const bad = await app.post(`/papers/${PAPER_ID}/summary/images/${question.imageId}/place`, {
      heading: '## 9. 不存在的章节',
    })
    assert.equal(bad.status, 400)

    const placed = await app.post(`/papers/${PAPER_ID}/summary/images/${question.imageId}/place`, {
      heading: '## 1. 研究背景与问题',
      caption: '背景插图',
    })
    assert.equal(placed.status, 200)
    assert.equal(placed.json().status, 'inserted')
    assert.match(placed.json().markdown, /!\[背景插图\]/)
  } finally {
    await app.close()
  }
})

test('image placement answers twice, then forces the end with fallback="end" (spec §7.3)', async () => {
  const ask = JSON.stringify({ action: 'ask', question: '这张图应该放在哪一节？', suggestion: '再看一眼说明' })
  const app = await appWithNote({ script: [ask, ask, ask] })
  try {
    const { writeSummary } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), SAMPLE_NOTE)
    const first = (await app.post(`/papers/${PAPER_ID}/summary/images`, {
      dataUrl: dataUrl(PNG_BYTES),
      mediaType: 'image/png',
      instruction: '随便放',
    })).json()
    assert.equal(first.status, 'needs_question')
    assert.equal(first.round, 1)

    const second = (await app.post(`/papers/${PAPER_ID}/summary/images/${first.imageId}/place`, { answer: '还是不知道' })).json()
    assert.equal(second.status, 'needs_question')
    assert.equal(second.round, 2)

    const third = (await app.post(`/papers/${PAPER_ID}/summary/images/${first.imageId}/place`, { answer: '再想想' })).json()
    assert.equal(third.status, 'inserted')
    assert.equal(third.fallback, 'end')
    const imageAt = third.markdown.indexOf(')')
    assert.ok(third.markdown.trimEnd().length - third.markdown.lastIndexOf('](/') < 400)
    // spec §7.8b: summary figures live under _附件/<id>/图/ next to the PDF.
    assert.match(third.markdown, /!\[[^\]]*\]\(_附件\/paper-test-001\/图\/img-/)
  } finally {
    await app.close()
  }
})

test('image placement force:true appends at the end with fallback="end"', async () => {
  const app = await appWithNote({
    script: [JSON.stringify({ action: 'ask', question: '放哪？', suggestion: '' })],
  })
  try {
    const { writeSummary } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), SAMPLE_NOTE)
    const asked = (await app.post(`/papers/${PAPER_ID}/summary/images`, {
      dataUrl: dataUrl(PNG_BYTES),
      mediaType: 'image/png',
      instruction: '看图',
    })).json()
    const forced = await app.post(`/papers/${PAPER_ID}/summary/images/${asked.imageId}/place`, { force: true })
    assert.equal(forced.status, 200)
    const body = forced.json()
    assert.equal(body.status, 'inserted')
    assert.equal(body.fallback, 'end')
    // The image block is the last thing in the note.
    // spec §7.8b: summary figures live under _附件/<id>/图/ next to the PDF.
    assert.match(body.markdown.trimEnd().split('\n').slice(-1)[0], /_附件\/paper-test-001\/图\/img-/)
  } finally {
    await app.close()
  }
})

test('image placement rejects an expired or foreign imageId with 404', async () => {
  const app = await appWithNote()
  try {
    const { writeSummary } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), SAMPLE_NOTE)
    const res = await app.post(`/papers/${PAPER_ID}/summary/images/img-20990101-000000-abcd/place`, {
      answer: '放在结果一节',
    })
    assert.equal(res.status, 404)
    assert.match(res.json().error, /图片已过期/)
  } finally {
    await app.close()
  }
})

test('figures SSE completes remaining placeholders and reports progress events', async (t) => {
  if (!(await hasPoppler())) {
    t.skip('Poppler is not installed')
    return
  }
  const app = await appWithNote({ script: [LOCATE_ANSWER] })
  try {
    const { writeSummary } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), NOTE_WITH_FIGURE)
    const res = await app.post(`/papers/${PAPER_ID}/summary/figures`, {})
    assert.equal(res.status, 200)
    assert.match(res.contentType, /event-stream/)
    const start = res.events.find((event) => event.type === 'start')
    assert.ok(start, 'the SSE stream must announce the total first')
    assert.equal(start.total, 1)
    const done = doneEvent(res)
    assert.equal(done.total, 1)
    assert.equal(done.created.length, 1)
    assert.deepEqual(done.failed, [])
    assert.doesNotMatch(done.markdown, /\[\[FIGURE/)

    const figureEvents = res.events.filter((event) => event.type === 'figure')
    assert.equal(figureEvents.length, done.total)
    for (const event of figureEvents) {
      assert.equal(typeof event.index, 'number')
      assert.equal(event.total, done.total)
      assert.equal(typeof event.page, 'number')
      assert.equal(typeof event.ok, 'boolean')
      assert.equal(typeof event.name, 'string')
      assert.equal(typeof event.reason, 'string')
    }
    // Indices are 0-based; the client renders `index + 1` (spec §7.4).
    assert.equal(figureEvents[0].index, 0)
  } finally {
    await app.close()
  }
})

test('figures SSE reports an empty set when the note has no placeholders', async () => {
  const app = await appWithNote()
  try {
    const { writeSummary } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), SAMPLE_NOTE)
    const res = await app.post(`/papers/${PAPER_ID}/summary/figures`, {})
    assert.equal(res.status, 200)
    const done = doneEvent(res)
    assert.deepEqual(done.created, [])
    assert.deepEqual(done.failed, [])
    assert.equal(done.total, 0)
    assert.equal(await app.readSummary(), SAMPLE_NOTE)
  } finally {
    await app.close()
  }
})

test('figures SSE ignores stale client offsets and re-scans the body instead', async (t) => {
  if (!(await hasPoppler())) {
    t.skip('Poppler is not installed')
    return
  }
  const app = await appWithNote({ script: [LOCATE_ANSWER] })
  try {
    const { writeSummary } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), NOTE_WITH_FIGURE)
    const before = await app.readSummary()
    // Offsets point at unrelated text and do not cover a placeholder line.
    const res = await app.post(`/papers/${PAPER_ID}/summary/figures`, {
      placeholders: [{ start: 0, end: 12, page: 1, caption: '假的', hint: '' }],
    })
    const done = doneEvent(res)
    assert.ok(done.total >= 1, 'a stale range must fall back to scanning the body')
    assert.ok(done.created.length >= 1)
    // The opening of the note is untouched: nothing was spliced into it.
    assert.ok(done.markdown.startsWith(before.slice(0, 40)))
    assert.doesNotMatch(done.markdown, /!\[假的\]/)
  } finally {
    await app.close()
  }
})

test('figures SSE keeps going when one placeholder fails (spec §7.4)', async () => {
  const app = await appWithNote()
  try {
    const { writeSummary } = await import('../lib/summary-note.js')
    // No source.pdf: every placeholder fails, but the body must still be updated
    // with a failure callout and the stream must end with done (not error).
    await writeSummary(
      app.paperDir(),
      `${SAMPLE_NOTE}
## 6. 我的理解与知识连接

[[FIGURE: p.1 | 图 1 找不到 | 用于验证失败分支]]

[[FIGURE: p.2 | 图 2 同样失败 | 用于验证单图失败不中断]]
`,
    )
    const res = await app.post(`/papers/${PAPER_ID}/summary/figures`, {})
    assert.equal(res.status, 200)
    const done = doneEvent(res)
    assert.equal(done.total, 2)
    assert.equal(done.created.length, 0)
    assert.equal(done.failed.length, 2)
    assert.match(done.markdown, /> \[!figure\] 图未自动截取：图 1 找不到（p\.1）/)
    assert.match(done.markdown, /> \[!figure\] 图未自动截取：图 2 同样失败（p\.2）/)
    assert.doesNotMatch(done.markdown, /\[\[FIGURE/)
    const figureEvents = res.events.filter((event) => event.type === 'figure')
    assert.equal(figureEvents.length, 2)
    assert.ok(figureEvents.every((event) => event.ok === false && event.reason.length > 0))
  } finally {
    await app.close()
  }
})

test('an unavailable vault degrades to a local-only save with a noteError', async () => {
  const app = await createApp({ vault: false, script: [summaryScript(SAMPLE_NOTE)] })
  try {
    await seedPaper(app)
    const generated = await app.post(`/papers/${PAPER_ID}/summary`)
    assert.equal(generated.status, 200)
    const done = doneEvent(generated)
    assert.equal(done.hasNote, false)
    assert.ok(done.openError && done.openError.length > 0)

    const saved = await app.put(`/papers/${PAPER_ID}/summary`, {
      markdown: `${SAMPLE_NOTE}\n手动补充一段。\n`,
    })
    assert.equal(saved.status, 200)
    const body = saved.json()
    assert.equal(body.ok, true)
    assert.ok(body.noteError && body.noteError.length > 0)
    assert.equal(body.notePath, '')
    // The local copy stays authoritative.
    assert.match(await app.readSummary(), /手动补充一段/)
    // Relative image links are kept as-is when there is no vault.
    const withImage = await app.post(`/papers/${PAPER_ID}/summary/images`, {
      dataUrl: dataUrl(PNG_BYTES),
      mediaType: 'image/png',
      anchor: { afterOffset: 0 },
      caption: '降级插图',
    })
    assert.equal(withImage.status, 200)
    // spec §7.8b: summary figures live under _附件/<id>/图/ next to the PDF.
    assert.match(withImage.json().markdown, /!\[降级插图\]\(_附件\/paper-test-001\/图\/img-/)
  } finally {
    await app.close()
  }
})

test('busy state blocks a concurrent revision of the same paper', async () => {
  // A never-ending model answer keeps the first revision in flight while the
  // second request arrives.
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const app = await appWithNote()
  try {
    const { writeSummary, writeAnnotations } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), SAMPLE_NOTE)
    await writeAnnotations(app.paperDir(), [{ id: 'a1', quote: '眼图张开度提升 30%', note: '改', status: 'open' }])
    app.ctx.llm.stream = async function* stream() {
      await gate
      yield { type: 'text-delta', text: reviseAnswer([{ id: 'a1', replacement: '改好了', why: 'ok' }]) }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
    const pending = app.post(`/papers/${PAPER_ID}/summary/revise`, {})
    await new Promise((resolve) => setTimeout(resolve, 60))
    const conflict = await app.post(`/papers/${PAPER_ID}/summary/revise`, {})
    assert.equal(conflict.status, 409)
    assert.match(conflict.json().error, /正在生成|正在进行/)
    release()
    const first = await pending
    assert.equal(first.status, 200)
    doneEvent(first)
  } finally {
    release?.()
    await app.close()
  }
})

test('unknown papers and malformed ids are rejected before touching the disk', async () => {
  const app = await appWithNote()
  try {
    const unknown = await app.get('/papers/paper-does-not-exist/summary')
    assert.equal(unknown.status, 404)
    const malformed = await app.get('/papers/A%20B/summary')
    assert.equal(malformed.status, 400)
    const unknownRoute = await app.get('/nope')
    assert.equal(unknownRoute.status, 404)
  } finally {
    await app.close()
  }
})

// ---------------------------------------------------------------------------
// Spec §11 gap coverage: the cases the first pass reported as missing.
// ---------------------------------------------------------------------------

test('a disconnect during /summary/revise aborts the model call and keeps the body (spec §7.2-9)', async () => {
  // The fake llm waits on this gate, so the handler is still inside the model
  // call when the response emits 'close' (what a dropped client looks like).
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const app = await appWithNote()
  try {
    const { writeSummary, writeAnnotations } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), SAMPLE_NOTE)
    await writeAnnotations(app.paperDir(), [{ id: 'a1', quote: '眼图张开度提升 30%', note: '改', status: 'open' }])
    let sawAbort = false
    let threwAbort = false
    app.ctx.llm.stream = async function* stream(options) {
      const signal = options.signal
      signal?.addEventListener('abort', () => {
        sawAbort = true
        release()
      })
      await gate
      if (signal?.aborted) {
        threwAbort = true
        const error = new Error('AI 调用已取消')
        error.name = 'AbortError'
        throw error
      }
      yield { type: 'text-delta', text: reviseAnswer([{ id: 'a1', replacement: '不应该写进去', why: 'x' }]) }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
    const pending = await app.start('POST', `/papers/${PAPER_ID}/summary/revise`, {})
    // Let the handler reach the model call, then drop the connection.
    for (let i = 0; i < 40 && !sawAbort; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    assert.equal(sawAbort, false, 'the model must not be aborted before the client goes away')
    pending.res.emit('close')
    const res = await pending.done
    assert.equal(threwAbort, true, 'the abort signal must reach the model call')
    // No `error` frame is pushed at a client that is already gone, and the body
    // is untouched because the revision never completed.
    assert.equal(res.events.some((event) => event.type === 'error'), false)
    assert.equal(res.events.some((event) => event.type === 'done'), false)
    assert.equal(await app.readSummary(), SAMPLE_NOTE)
    // The busy lock is released, so the paper is usable again.
    app.ctx.llm.stream = async function* stream() {
      yield { type: 'text-delta', text: reviseAnswer([{ id: 'a1', replacement: '改好了', why: 'ok' }]) }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
    const retry = await app.post(`/papers/${PAPER_ID}/summary/revise`, {})
    assert.equal(retry.status, 200)
    assert.equal(doneEvent(retry).applied.length, 1)
  } finally {
    release?.()
    await app.close()
  }
})

test('figures SSE reuses an already rendered page image instead of re-rendering (spec §7.4-2)', async (t) => {
  if (!(await hasPoppler())) {
    t.skip('Poppler is not installed')
    return
  }
  const app = await appWithNote({ script: [LOCATE_ANSWER] })
  try {
    const { mkdir, stat, utimes, writeFile } = await import('node:fs/promises')
    const { writeSummary } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), NOTE_WITH_FIGURE)
    // Pretend a previous request already rendered page 1.
    const pagesDir = path.join(app.paperDir(), 'pages')
    await mkdir(pagesDir, { recursive: true })
    const pageFile = path.join(pagesDir, 'p0001.jpg')
    await writeFile(pageFile, Buffer.alloc(4096, 7))
    const old = new Date('2020-01-02T03:04:05Z')
    await utimes(pageFile, old, old)
    const before = await stat(pageFile)

    const res = await app.post(`/papers/${PAPER_ID}/summary/figures`, {})
    const done = doneEvent(res)
    assert.equal(done.created.length, 1)
    const after = await stat(pageFile)
    assert.equal(after.mtime.getTime(), before.mtime.getTime(), 'the cached page image must not be re-rendered')
    assert.equal(after.size, before.size)
    // The vision model received the cached bytes, not a fresh render.
    assert.equal(app.savedImages.at(-1).data.length, 4096)
  } finally {
    await app.close()
  }
})

test('a successful save reports the real note path and stamps meta.summaryUpdatedAt', async () => {
  const app = await appWithNote()
  try {
    const { writeSummary } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), SAMPLE_NOTE)
    const saved = await app.put(`/papers/${PAPER_ID}/summary`, { markdown: `${SAMPLE_NOTE}\n手动补一句。\n` })
    assert.equal(saved.status, 200)
    const body = saved.json()
    assert.equal(body.noteError, '')
    assert.ok(body.notePath, 'a healthy vault must report a real note path')
    assert.ok(path.isAbsolute(body.notePath))
    assert.ok(body.notePath.startsWith(app.vaultPath), body.notePath)
    assert.match(await readFile(body.notePath, 'utf8'), /手动补一句/)
    const meta = await app.readMeta()
    assert.equal(meta.summaryUpdatedAt, body.updatedAt)
    assert.equal(meta.summaryVersion, body.version)
    // GET /summary exposes the same note identity to the client.
    const loaded = (await app.get(`/papers/${PAPER_ID}/summary`)).json()
    assert.equal(loaded.note.exists, true)
    assert.equal(loaded.note.path, body.notePath)
    assert.match(loaded.note.relative, /\.md$/)
    assert.doesNotMatch(loaded.note.relative, /\\/, 'relative paths must use forward slashes')
    assert.equal(loaded.note.relative.split('/')[0], NOTES_FOLDER)
  } finally {
    await app.close()
  }
})

test('history versions carry the origin of each snapshot (spec §7.1)', async () => {
  const app = await appWithNote()
  try {
    const { writeSummary } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), SAMPLE_NOTE)
    await app.put(`/papers/${PAPER_ID}/summary`, { markdown: `${SAMPLE_NOTE}\n第一次手动保存。\n` })
    await app.put(`/papers/${PAPER_ID}/summary`, { markdown: `${SAMPLE_NOTE}\n第二次手动保存。\n` })
    const listed = (await app.get(`/papers/${PAPER_ID}/summary/history`)).json()
    assert.ok(listed.versions.length >= 2)
    for (const version of listed.versions) {
      assert.equal(typeof version.stamp, 'string')
      assert.equal(typeof version.updatedAt, 'string')
      assert.equal(typeof version.chars, 'number')
      // Spec §7.1: the list gives stamp/time/chars/source, never the body.
      assert.equal(Object.hasOwn(version, 'markdown'), false)
      assert.equal(typeof version.source, 'string')
      assert.equal(version.source, 'manual')
    }
    // The preview endpoint still reports the body for a listed stamp.
    const preview = await app.get(`/papers/${PAPER_ID}/summary/history/${listed.versions[0].stamp}`)
    assert.equal(preview.status, 200)
    assert.match(preview.json().markdown, /手动保存|均衡器学习笔记/)
  } finally {
    await app.close()
  }
})

test('an explicit afterOffset outranks an explicit heading (spec §7.3-3)', async () => {
  const app = await appWithNote()
  try {
    const { writeSummary } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), SAMPLE_NOTE)
    const res = await app.post(`/papers/${PAPER_ID}/summary/images`, {
      dataUrl: dataUrl(PNG_BYTES),
      mediaType: 'image/png',
      caption: '两个锚点',
      // Heading points at section 5, offset at the very top: offset must win.
      anchor: { heading: '## 5. 结论、论证强度与局限', afterOffset: 0 },
    })
    assert.equal(res.status, 200)
    const markdown = res.json().markdown
    const imageAt = markdown.indexOf('两个锚点')
    const firstSectionAt = markdown.indexOf('## 1. 研究背景与问题')
    assert.ok(imageAt >= 0)
    assert.ok(imageAt < firstSectionAt, 'afterOffset must place the image above section 1, not in section 5')
  } finally {
    await app.close()
  }
})

test('an upload only carrying instruction still becomes the caption (spec §7.3-3)', async () => {
  const app = await appWithNote()
  try {
    const { writeSummary } = await import('../lib/summary-note.js')
    await writeSummary(app.paperDir(), SAMPLE_NOTE)
    const res = await app.post(`/papers/${PAPER_ID}/summary/images`, {
      dataUrl: dataUrl(PNG_BYTES),
      mediaType: 'image/png',
      instruction: '这里放一张示意图',
      anchor: { afterOffset: 0 },
    })
    assert.equal(res.status, 200)
    // No caption was supplied: the instruction is the documented fallback.
    assert.match(res.json().markdown, /!\[这里放一张示意图\]/)
  } finally {
    await app.close()
  }
})
