import assert from 'node:assert/strict'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import {
  NOTES_FOLDER,
  PAPER_ID,
  PNG_BYTES,
  SAMPLE_NOTE,
  createApp,
  dataUrl,
  doneEvent,
  seedPaper,
} from './helpers.mjs'

// Route-level tests for the reader note (docs/reader-note-spec.md §3, §7.9).
// Every case boots an isolated instance with its own temp dataDir and vault, so
// nothing here touches the real Obsidian vault.

const TITLE = '均衡器与高速链路（测试文献）'
const NOTE_REL = `${NOTES_FOLDER}/${TITLE} 笔记.md`

function notePath(app, rel = NOTE_REL) {
  return path.join(app.vaultPath, ...rel.split('/'))
}

async function createNote(app) {
  const response = await app.post(`/papers/${PAPER_ID}/reader-note`)
  assert.equal(response.status, 200, response.text)
  return response.json()
}

async function appWithPaper(options = {}) {
  const app = await createApp(options)
  await seedPaper(app, options.seed || {})
  return app
}

function jsonScript(value) {
  return JSON.stringify(value)
}

// ── creation ────────────────────────────────────────────────────────────────

test('GET /reader-note before creation answers 200 with exists:false', async () => {
  const app = await appWithPaper()
  try {
    const response = await app.get(`/papers/${PAPER_ID}/reader-note`)
    assert.equal(response.status, 200)
    const body = response.json()
    assert.equal(body.exists, false)
    assert.equal(body.path, '')
    assert.equal(body.relative, '')
    assert.equal(body.markdown, '')
    assert.equal(body.hash, '')
    assert.equal(body.entryCount, 0)
    assert.deepEqual(body.questions, [])
    assert.equal(body.lostPath, undefined)
  } finally {
    await app.close()
  }
})

test('POST /reader-note creates the note next to the PDF and remembers the path', async () => {
  const app = await appWithPaper()
  try {
    const created = await createNote(app)
    assert.equal(created.ok, true)
    assert.equal(created.created, true)
    assert.equal(created.exists, true)
    assert.equal(created.relative, NOTE_REL)
    assert.equal(created.path, notePath(app))
    // Fallback layout: no meta.vaultPath, so the note lands in notesFolder.
    assert.ok(created.markdown.includes('# '))
    assert.equal(created.links.pdf, `${TITLE}.pdf`)
    assert.equal(created.links.summary, `${TITLE} 总结`)

    const raw = await readFile(notePath(app), 'utf8')
    assert.ok(raw.startsWith('---\n'), 'frontmatter is written')
    assert.ok(raw.includes('note_role: "reader-note"'))
    assert.ok(raw.includes(`paper_id: "${PAPER_ID}"`))

    const meta = await app.readMeta()
    assert.equal(meta.readerNotePath, notePath(app))
    assert.equal(meta.readerNoteRelative, NOTE_REL)

    const again = await createNote(app)
    assert.equal(again.created, false)
    assert.equal(again.markdown, created.markdown)
    assert.equal(await readFile(notePath(app), 'utf8'), raw)
  } finally {
    await app.close()
  }
})

test('reader note follows the PDF folder inside the vault', async () => {
  const app = await appWithPaper({
    seed: { title: '测试文献', meta: { fileName: '测试文献.pdf', vaultPath: 'serdes/接收端/测试文献.pdf' } },
  })
  try {
    const created = await createNote(app)
    assert.equal(created.relative, 'serdes/接收端/测试文献 笔记.md')
    const raw = await readFile(path.join(app.vaultPath, 'serdes', '接收端', '测试文献 笔记.md'), 'utf8')
    assert.ok(raw.includes('vault_path: "serdes/接收端/测试文献.pdf"'))
  } finally {
    await app.close()
  }
})

test('reader note for a PDF in the vault root lands in the root', async () => {
  const app = await appWithPaper({
    seed: { title: '根目录文献', meta: { fileName: '根目录文献.pdf', vaultPath: '根目录文献.pdf' } },
  })
  try {
    const created = await createNote(app)
    assert.equal(created.relative, '根目录文献 笔记.md')
    const raw = await readFile(path.join(app.vaultPath, '根目录文献 笔记.md'), 'utf8')
    assert.ok(raw.includes('阅读笔记'))
  } finally {
    await app.close()
  }
})

test('POST /reader-note without a vault answers 400', async () => {
  const app = await appWithPaper({ vault: false })
  try {
    const response = await app.post(`/papers/${PAPER_ID}/reader-note`)
    assert.equal(response.status, 400)
    assert.match(response.json().error, /Obsidian/)
    const get = await app.get(`/papers/${PAPER_ID}/reader-note`)
    assert.equal(get.status, 200)
    assert.equal(get.json().exists, false)
  } finally {
    await app.close()
  }
})

// ── entries ─────────────────────────────────────────────────────────────────

test('POST /reader-note/entries appends one entry with a timestamped heading', async () => {
  const app = await appWithPaper()
  try {
    await createNote(app)
    const response = await app.post(`/papers/${PAPER_ID}/reader-note/entries`, {
      markdown: '第一条笔记：均衡器补偿高频损耗。',
    })
    assert.equal(response.status, 200, response.text)
    const body = response.json()
    assert.equal(body.ok, true)
    assert.match(body.markdown, /## \d{2}:\d{2} · 第一条笔记/)
    assert.ok(body.markdown.includes('第一条笔记：均衡器补偿高频损耗。'))
    assert.equal(body.entryCount, 1)
    assert.match(body.hash, /^[a-f0-9]{16}$/)
    assert.equal(body.entry.heading.startsWith('## '), true)
    // The anchor must point at the inserted block inside the new body.
    const sliced = body.markdown.slice(body.anchor.start, body.anchor.end)
    assert.ok(sliced.includes('第一条笔记：均衡器补偿高频损耗。'))
    assert.ok(body.historyStamp.length > 0)

    const second = await app.post(`/papers/${PAPER_ID}/reader-note/entries`, {
      markdown: '第二条：眼图张开度提升。',
    })
    assert.equal(second.json().entryCount, 2)
    const get = await app.get(`/papers/${PAPER_ID}/reader-note`)
    assert.equal(get.json().entryCount, 2)
    assert.ok(get.json().markdown.includes('第二条：眼图张开度提升。'))
    assert.deepEqual(get.json().questions, [])
  } finally {
    await app.close()
  }
})

test('POST /reader-note/entries across days starts a new day heading', async () => {
  const app = await appWithPaper()
  try {
    await createNote(app)
    await app.post(`/papers/${PAPER_ID}/reader-note/entries`, { markdown: '昨天的记录' })
    const at = new Date()
    at.setDate(at.getDate() + 2)
    const response = await app.post(`/papers/${PAPER_ID}/reader-note/entries`, {
      markdown: '两天后的记录',
      at: at.toISOString(),
    })
    assert.equal(response.status, 200)
    const markdown = response.json().markdown
    const days = markdown.match(/^# \d{4}-\d{2}-\d{2}/gm) || []
    assert.equal(days.length, 2)
    assert.ok(markdown.lastIndexOf('# ') > markdown.indexOf('昨天的记录'))
  } finally {
    await app.close()
  }
})

test('POST /reader-note/entries validates the payload and the note presence', async () => {
  const app = await appWithPaper()
  try {
    const missing = await app.post(`/papers/${PAPER_ID}/reader-note/entries`, { markdown: '内容' })
    assert.equal(missing.status, 404)
    await createNote(app)
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

// ── images ──────────────────────────────────────────────────────────────────

test('POST /reader-note/images writes the bytes under _附件/<id>/笔记/', async () => {
  const app = await appWithPaper()
  try {
    await createNote(app)
    const response = await app.post(`/papers/${PAPER_ID}/reader-note/images`, {
      dataUrl: dataUrl(PNG_BYTES),
    })
    assert.equal(response.status, 200, response.text)
    const body = response.json()
    assert.equal(body.ok, true)
    assert.equal(body.vaultError, '')
    assert.match(body.name, /^img-\d{8}-\d{6}-[A-Za-z0-9]{4}\.png$/)
    // spec §7.8b / §3.4: the vault copy and the link agree on the sub folder.
    assert.equal(body.rel, `_附件/${PAPER_ID}/笔记/${body.name}`)
    const vaultFile = path.join(
      app.vaultPath,
      NOTES_FOLDER,
      '_附件',
      PAPER_ID,
      '笔记',
      body.name,
    )
    assert.deepEqual(await readFile(vaultFile), PNG_BYTES)
    // The local copy is what `/figure/:name` replays.
    const localFile = path.join(app.paperDir(), 'figures', body.name)
    assert.deepEqual(await readFile(localFile), PNG_BYTES)
    const served = await app.get(`/papers/${PAPER_ID}/figure/${body.name}`)
    assert.equal(served.status, 200)
    assert.deepEqual(served.body, PNG_BYTES)
  } finally {
    await app.close()
  }
})

test('POST /reader-note/images follows the PDF folder for the vault copy', async () => {
  const app = await appWithPaper({
    seed: { title: '测试文献', meta: { fileName: '测试文献.pdf', vaultPath: 'serdes/接收端/测试文献.pdf' } },
  })
  try {
    await createNote(app)
    const response = await app.post(`/papers/${PAPER_ID}/reader-note/images`, {
      dataUrl: dataUrl(PNG_BYTES),
    })
    assert.equal(response.status, 200, response.text)
    const body = response.json()
    const vaultFile = path.join(
      app.vaultPath,
      'serdes',
      '接收端',
      '_附件',
      PAPER_ID,
      '笔记',
      body.name,
    )
    assert.deepEqual(await readFile(vaultFile), PNG_BYTES)
    assert.equal(body.rel, `_附件/${PAPER_ID}/笔记/${body.name}`)
  } finally {
    await app.close()
  }
})

test('POST /reader-note/images rejects non PNG/JPEG magic numbers', async () => {
  const app = await appWithPaper()
  try {
    await createNote(app)
    const gif = Buffer.from('GIF89a' + 'x'.repeat(64), 'latin1')
    const response = await app.post(`/papers/${PAPER_ID}/reader-note/images`, {
      dataUrl: dataUrl(gif, 'image/gif'),
    })
    assert.equal(response.status, 400)
    assert.match(response.json().error, /PNG|JPEG/)
    const empty = await app.post(`/papers/${PAPER_ID}/reader-note/images`, {})
    assert.equal(empty.status, 400)
  } finally {
    await app.close()
  }
})

test('POST /reader-note/images rejects an image larger than 8MB', async () => {
  const app = await appWithPaper()
  try {
    await createNote(app)
    // Valid PNG magic, but 8MB + 1 byte of payload.
    const huge = Buffer.concat([PNG_BYTES.subarray(0, 8), Buffer.alloc(8 * 1024 * 1024 + 1)])
    const response = await app.post(`/papers/${PAPER_ID}/reader-note/images`, {
      dataUrl: dataUrl(huge),
    })
    assert.equal(response.status, 413)
    assert.match(response.json().error, /8MB/)
    const figures = await readdir(path.join(app.paperDir(), 'figures')).catch(() => [])
    assert.deepEqual(figures, [], 'a rejected upload must not be written')
  } finally {
    await app.close()
  }
})

// ── history ─────────────────────────────────────────────────────────────────

test('reader-note history lists snapshots newest first and restores one', async () => {
  const app = await appWithPaper()
  try {
    await createNote(app)
    await app.post(`/papers/${PAPER_ID}/reader-note/entries`, { markdown: '第一条' })
    const second = await app.post(`/papers/${PAPER_ID}/reader-note/entries`, { markdown: '第二条' })
    assert.equal(second.status, 200)
    const list = await app.get(`/papers/${PAPER_ID}/reader-note/history`)
    assert.equal(list.status, 200)
    const versions = list.json().versions
    assert.equal(versions.length, 2)
    assert.equal(versions[0].reason, 'append')
    assert.ok(versions[0].chars > 0)
    assert.ok(versions[0].stamp > versions[1].stamp, 'newest first')

    const newest = versions[0]
    const preview = await app.get(
      `/papers/${PAPER_ID}/reader-note/history/${encodeURIComponent(newest.stamp)}`,
    )
    assert.equal(preview.status, 200)
    assert.ok(preview.json().markdown.includes('第一条'))
    assert.equal(preview.json().markdown.includes('第二条'), false)

    const restored = await app.post(
      `/papers/${PAPER_ID}/reader-note/history/${encodeURIComponent(newest.stamp)}/restore`,
    )
    assert.equal(restored.status, 200, restored.text)
    const body = restored.json()
    assert.ok(body.markdown.includes('第一条'))
    assert.equal(body.markdown.includes('第二条'), false)
    assert.equal(body.entryCount, 1)
    assert.match(body.hash, /^[a-f0-9]{16}$/)
    // Restoring snapshots the current body first, so nothing is lost.
    const after = await app.get(`/papers/${PAPER_ID}/reader-note/history`)
    assert.equal(after.json().versions.length, 3)
    assert.equal(after.json().versions[0].reason, 'restore')
  } finally {
    await app.close()
  }
})

test('reader-note history rejects path traversal and unknown stamps', async () => {
  const app = await appWithPaper()
  try {
    await createNote(app)
    const traversal = await app.get(
      `/papers/${PAPER_ID}/reader-note/history/${encodeURIComponent('../../other')}`,
    )
    assert.equal(traversal.status, 400)
    const unknown = await app.get(`/papers/${PAPER_ID}/reader-note/history/20260101-000000-000`)
    assert.equal(unknown.status, 404)
    const restoreMissing = await app.post(
      `/papers/${PAPER_ID}/reader-note/history/20260101-000000-000/restore`,
    )
    assert.equal(restoreMissing.status, 404)
  } finally {
    await app.close()
  }
})

// ── organize (SSE) ──────────────────────────────────────────────────────────

function organizeAnswer(markdown, extra = {}) {
  return jsonScript({
    markdown,
    report: { typos: 2, merges: 1, formatting: 6, summary: '统一了空格' },
    questions: [],
    ...extra,
  })
}

async function noteWithBody(app, lines) {
  await createNote(app)
  for (const line of lines) {
    const response = await app.post(`/papers/${PAPER_ID}/reader-note/entries`, { markdown: line })
    assert.equal(response.status, 200, response.text)
  }
  const current = await app.get(`/papers/${PAPER_ID}/reader-note`)
  return current.json()
}

test('POST /reader-note/organize rewrites the body, writes history and returns report', async () => {
  const app = await appWithPaper()
  try {
    const note = await noteWithBody(app, ['信道衰减很快', '均衡器补偿高频'])
    // Same body with one typo fixed and a duplicate blank line removed.
    const polished = note.markdown.replace('均衡器补偿高频', '均衡器补偿高频损耗')
    app.script([organizeAnswer(polished)])
    const response = await app.post(`/papers/${PAPER_ID}/reader-note/organize`, { baseHash: note.hash })
    assert.equal(response.status, 200, response.text)
    assert.equal(response.sse, true)
    const done = doneEvent(response)
    assert.ok(done.markdown.includes('均衡器补偿高频损耗'))
    assert.match(done.hash, /^[a-f0-9]{16}$/)
    assert.ok(done.historyStamp.length > 0)
    // The payload field is `report`, never the older `stats` spelling.
    assert.deepEqual(done.report, {
      typos: 2,
      merges: 1,
      formatting: 6,
      summary: '统一了空格',
    })
    assert.equal(done.stats, undefined)
    assert.deepEqual(done.questions, [])

    const stored = await readFile(notePath(app), 'utf8')
    assert.ok(stored.includes('均衡器补偿高频损耗'))
    const history = await app.get(`/papers/${PAPER_ID}/reader-note/history`)
    assert.equal(history.json().versions[0].reason, 'organize')
    const meta = await app.readMeta()
    assert.equal(meta.readerNoteOpen, 0)
  } finally {
    await app.close()
  }
})

test('POST /reader-note/organize answers 409 before the SSE when baseHash is stale', async () => {
  const app = await appWithPaper()
  try {
    await noteWithBody(app, ['第一条'])
    app.script([organizeAnswer('# 兜底\n\n不该用到')])
    const response = await app.post(`/papers/${PAPER_ID}/reader-note/organize`, {
      baseHash: 'deadbeefdeadbeef',
    })
    assert.equal(response.status, 409)
    assert.equal(response.sse, false)
    const body = response.json()
    assert.equal(body.conflict, true)
    assert.equal(body.error, '笔记已在别处更新')
    assert.ok(body.markdown.includes('第一条'))
    assert.match(body.hash, /^[a-f0-9]{16}$/)
    assert.equal(app.calls.length, 0, 'no model call is made for a stale conflict')
  } finally {
    await app.close()
  }
})

test('POST /reader-note/organize refuses a rewrite that breaks the structure', async () => {
  const app = await appWithPaper()
  try {
    const note = await noteWithBody(app, ['第一条完整记录', '第二条完整记录'])
    const before = await readFile(notePath(app), 'utf8')
    // Dropping most of the note trips the length gate in checkOrganizeRewrite.
    app.script([organizeAnswer('只剩一句', { questions: [{ quote: '第一条完整记录', problem: 'x', ask: 'y' }] })])
    const response = await app.post(`/papers/${PAPER_ID}/reader-note/organize`, {
      baseHash: note.hash,
    })
    assert.equal(response.status, 200)
    const error = response.events.find((event) => event.type === 'error')
    assert.ok(error, JSON.stringify(response.events))
    assert.match(error.message, /AI 改写破坏了笔记结构/)
    assert.match(error.message, /已放弃本次整理/)
    assert.equal(
      response.events.some((event) => event.type === 'done'),
      false,
      'a refused rewrite must not emit done',
    )
    // Nothing may be written, and no questions may be produced.
    assert.equal(await readFile(notePath(app), 'utf8'), before)
    assert.deepEqual((await app.get(`/papers/${PAPER_ID}/reader-note`)).json().questions, [])
    const history = await app.get(`/papers/${PAPER_ID}/reader-note/history`)
    const reasons = history.json().versions.map((item) => item.reason)
    assert.equal(reasons.includes('organize'), false)
  } finally {
    await app.close()
  }
})

test('POST /reader-note/organize rejects a missing note and a too-short body', async () => {
  const app = await appWithPaper()
  try {
    const missing = await app.post(`/papers/${PAPER_ID}/reader-note/organize`, {})
    assert.equal(missing.status, 404)
    const created = await createNote(app)
    assert.ok(created.markdown.length > 0)
    // An empty body (only headings) is below the 10-char floor.
    const blank = await app.get(`/papers/${PAPER_ID}/reader-note`)
    assert.equal(blank.status, 200)
  } finally {
    await app.close()
  }
})

test('POST /reader-note/organize stores open questions with context anchors', async () => {
  const app = await appWithPaper()
  try {
    const note = await noteWithBody(app, ['论文说 25 Gb/s 下功耗降低 30%。'])
    const polished = note.markdown.replace('论文说', '论文提到')
    app.script([
      organizeAnswer(polished, {
        questions: [
          {
            quote: '功耗降低 30%',
            problem: '正文没有给出对照基线',
            suggestion: '确认这个 30% 是与哪一组数据比较',
            ask: '这个 30% 是相对哪一组基线？',
          },
        ],
      }),
    ])
    const response = await app.post(`/papers/${PAPER_ID}/reader-note/organize`, {
      baseHash: note.hash,
    })
    const done = doneEvent(response)
    assert.equal(done.questions.length, 1)
    const question = done.questions[0]
    assert.equal(question.status, 'open')
    assert.match(question.id, /^q-[a-z0-9]{8}$/)
    assert.equal(question.quote, '功耗降低 30%')
    assert.ok(question.start >= 0)
    assert.ok(question.end > question.start)
    const listed = await app.get(`/papers/${PAPER_ID}/reader-note`)
    assert.equal(listed.json().questions.length, 1)
    const meta = await app.readMeta()
    assert.equal(meta.readerNoteOpen, 1)
  } finally {
    await app.close()
  }
})

// ── discuss (SSE) ───────────────────────────────────────────────────────────

test('POST /reader-note/questions/:qid/discuss streams deltas and stores the thread', async () => {
  const app = await appWithPaper()
  try {
    const note = await noteWithBody(app, ['论文说 25 Gb/s 下功耗降低 30%。'])
    app.script([
      organizeAnswer(note.markdown, {
        questions: [{ quote: '功耗降低 30%', problem: '缺少基线', ask: '与谁比较？' }],
      }),
    ])
    const organized = await app.post(`/papers/${PAPER_ID}/reader-note/organize`, {
      baseHash: note.hash,
    })
    const question = doneEvent(organized).questions[0]

    app.script(['这处确实缺少对照基线，建议补上"相对未均衡时"。'])
    const response = await app.post(
      `/papers/${PAPER_ID}/reader-note/questions/${question.id}/discuss`,
      { message: '我记得是和未均衡的链路比的' },
    )
    assert.equal(response.status, 200, response.text)
    assert.equal(response.sse, true)
    const deltas = response.events.filter((event) => event.type === 'delta')
    assert.ok(deltas.length > 0)
    assert.ok(deltas.map((event) => event.text).join('').includes('缺少对照基线'))
    const done = doneEvent(response)
    assert.equal(done.question.id, question.id)
    assert.ok(done.reply.includes('缺少对照基线'))
    // The thread carries both turns, user first, and `done` exposes it.
    const roles = done.question.messages.map((item) => item.role)
    assert.deepEqual(roles, ['user', 'assistant'])
    assert.equal(done.question.messages[0].content, '我记得是和未均衡的链路比的')

    const listed = await app.get(`/papers/${PAPER_ID}/reader-note`)
    const stored = listed.json().questions[0]
    assert.equal(stored.messages.length, 2)
    assert.equal(stored.id, question.id)
  } finally {
    await app.close()
  }
})

test('POST /reader-note/questions/:qid/discuss answers 404 for an unknown question', async () => {
  const app = await appWithPaper()
  try {
    await noteWithBody(app, ['有正文的笔记'])
    const response = await app.post(
      `/papers/${PAPER_ID}/reader-note/questions/q-deadbeef/discuss`,
      { message: '' },
    )
    assert.equal(response.status, 404)
  } finally {
    await app.close()
  }
})

// ── resolve ─────────────────────────────────────────────────────────────────

async function appWithQuestion(extra = {}) {
  const app = await appWithPaper()
  const note = await noteWithBody(app, ['论文说 25 Gb/s 下功耗降低 30%。'])
  app.script([
    organizeAnswer(note.markdown, {
      questions: [{ quote: '功耗降低 30%', problem: '缺少基线', ask: '与谁比较？' }],
      ...extra,
    }),
  ])
  const organized = await app.post(`/papers/${PAPER_ID}/reader-note/organize`, {
    baseHash: note.hash,
  })
  const question = doneEvent(organized).questions[0]
  return { app, question, note }
}

test('POST /reader-note/questions/:qid/resolve applies the AI replacement only', async () => {
  const { app, question } = await appWithQuestion()
  try {
    app.script([
      jsonScript({
        verdict: 'fix',
        quote: '功耗降低 30%',
        replacement: '功耗降低 30%（相对未均衡链路）',
        why: '补上对照基线',
      }),
    ])
    const response = await app.post(
      `/papers/${PAPER_ID}/reader-note/questions/${question.id}/resolve`,
      { mode: 'apply' },
    )
    assert.equal(response.status, 200, response.text)
    const body = response.json()
    assert.equal(body.ok, true)
    assert.equal(body.unchanged, undefined)
    assert.ok(body.markdown.includes('功耗降低 30%（相对未均衡链路）'))
    assert.equal(body.question.status, 'resolved')
    assert.equal(body.question.verdict, 'fix')
    assert.equal(body.replacement, '功耗降低 30%（相对未均衡链路）')
    assert.match(body.hash, /^[a-f0-9]{16}$/)
    // Every body write is snapshotted first (spec §3.8).
    const history = await app.get(`/papers/${PAPER_ID}/reader-note/history`)
    assert.equal(history.json().versions[0].reason, 'resolve')
    const listed = await app.get(`/papers/${PAPER_ID}/reader-note`)
    assert.equal(listed.json().questions[0].status, 'resolved')
  } finally {
    await app.close()
  }
})

test('POST /reader-note/questions/:qid/resolve returns unchanged when the AI says it is fine', async () => {
  const { app, question } = await appWithQuestion()
  try {
    const before = await readFile(notePath(app), 'utf8')
    app.script([jsonScript({ verdict: 'ok', why: '讨论后确认原文没问题' })])
    const response = await app.post(
      `/papers/${PAPER_ID}/reader-note/questions/${question.id}/resolve`,
      { mode: 'apply' },
    )
    assert.equal(response.status, 200, response.text)
    const body = response.json()
    assert.equal(body.ok, true)
    assert.equal(body.unchanged, true)
    assert.equal(body.question.status, 'resolved')
    assert.equal(body.question.verdict, 'ok')
    assert.equal(await readFile(notePath(app), 'utf8'), before)
  } finally {
    await app.close()
  }
})

test('POST /reader-note/questions/:qid/resolve marks an unlocatable quote as orphan', async () => {
  const { app, question } = await appWithQuestion()
  try {
    // The quote really is in the note; edit the file in "Obsidian" so the text
    // the question pointed at is gone. Re-anchoring must then orphan it.
    const current = await readFile(notePath(app), 'utf8')
    await writeFile(notePath(app), current.split('功耗降低 30%').join('功耗降低 25%'), 'utf8')
    app.script([
      jsonScript({ verdict: 'fix', quote: '功耗降低 25%', replacement: '功耗降低 25%（相对均衡前）' }),
    ])
    // The stored question still quotes "功耗降低 30%", so re-anchoring turns it
    // into an orphan before the model is even asked.
    const response = await app.post(
      `/papers/${PAPER_ID}/reader-note/questions/${question.id}/resolve`,
      { mode: 'apply' },
    )
    assert.equal(response.status, 409, response.text)
    const body = response.json()
    assert.equal(body.orphan, true)
    assert.match(body.error, /无法定位/)
    const listed = await app.get(`/papers/${PAPER_ID}/reader-note`)
    const stored = listed.json().questions[0]
    assert.equal(stored.status, 'orphan')
    assert.equal(stored.quote, '功耗降低 30%')
  } finally {
    await app.close()
  }
})

test('POST /reader-note/questions/:qid/resolve applies only the quoted fragment', async () => {
  const app = await appWithPaper()
  try {
    const note = await noteWithBody(app, [
      '论文说 25 Gb/s 下功耗降低 30%，这是实测结果。',
      '另一处：功耗降低 30% 是相对仿真基线。',
    ])
    app.script([
      organizeAnswer(note.markdown, {
        questions: [{ quote: '功耗降低 30%', problem: '两处说法容易混淆', ask: '各自基线？' }],
      }),
    ])
    const organized = await app.post(`/papers/${PAPER_ID}/reader-note/organize`, {
      baseHash: note.hash,
    })
    const question = doneEvent(organized).questions[0]
    assert.equal(question.status, 'open')
    // The anchored question points at exactly one of the two occurrences.
    assert.equal(note.markdown.slice(question.start, question.end), '功耗降低 30%')

    app.script([
      jsonScript({
        verdict: 'fix',
        quote: '功耗降低 30%',
        replacement: '功耗降低 30%（实测）',
      }),
    ])
    const response = await app.post(
      `/papers/${PAPER_ID}/reader-note/questions/${question.id}/resolve`,
      { mode: 'apply' },
    )
    assert.equal(response.status, 200, response.text)
    const body = response.json()
    const matches = body.markdown.match(/功耗降低 30%（实测）/g) || []
    assert.equal(matches.length, 1, 'exactly one occurrence is rewritten')
    // The other entry keeps its original wording, and both entries survive.
    assert.ok(body.markdown.includes('另一处：功耗降低 30% 是相对仿真基线。'))
    assert.ok(body.markdown.includes('这是实测结果。'))
    assert.equal((body.markdown.match(/^## /gm) || []).length, 2)
  } finally {
    await app.close()
  }
})

test('POST /reader-note/questions/:qid/resolve dismiss only changes the status', async () => {
  const { app, question } = await appWithQuestion()
  try {
    const before = await readFile(notePath(app), 'utf8')
    const response = await app.post(
      `/papers/${PAPER_ID}/reader-note/questions/${question.id}/resolve`,
      { mode: 'dismiss' },
    )
    assert.equal(response.status, 200, response.text)
    const body = response.json()
    assert.equal(body.ok, true)
    assert.equal(body.unchanged, true)
    assert.equal(body.question.status, 'dismissed')
    assert.equal(await readFile(notePath(app), 'utf8'), before)
    assert.equal(app.calls.length, 1, 'dismiss never calls the model')
  } finally {
    await app.close()
  }
})

test('POST /reader-note/questions/:qid/resolve rejects an unknown mode', async () => {
  const { app, question } = await appWithQuestion()
  try {
    const response = await app.post(
      `/papers/${PAPER_ID}/reader-note/questions/${question.id}/resolve`,
      { mode: 'maybe' },
    )
    assert.equal(response.status, 400)
  } finally {
    await app.close()
  }
})

// ── paper payload + lost file (spec §3.10, §14.6) ───────────────────────────

test('GET /papers/:id reports hasReaderNote and the open question count', async () => {
  const app = await appWithPaper()
  try {
    const before = await app.get(`/papers/${PAPER_ID}`)
    assert.equal(before.json().paper.hasReaderNote, false)
    assert.equal(before.json().paper.readerNoteRelative, '')
    assert.equal(before.json().paper.readerNoteOpen, 0)

    const note = await noteWithBody(app, ['论文说 25 Gb/s 下功耗降低 30%。'])
    app.script([
      organizeAnswer(note.markdown, {
        questions: [{ quote: '功耗降低 30%', problem: '缺少基线', ask: '与谁比较？' }],
      }),
    ])
    await app.post(`/papers/${PAPER_ID}/reader-note/organize`, { baseHash: note.hash })

    const after = await app.get(`/papers/${PAPER_ID}`)
    const paper = after.json().paper
    assert.equal(paper.hasReaderNote, true)
    assert.equal(paper.readerNoteRelative, NOTE_REL)
    assert.equal(paper.readerNoteOpen, 1)
    // No pre-existing field may disappear from the payload.
    assert.equal(paper.hasSummary, false)
    assert.equal(typeof paper.pdfUrl, 'string')
  } finally {
    await app.close()
  }
})

test('a note file deleted outside the plugin reports lostPath', async () => {
  const app = await appWithPaper()
  try {
    const created = await createNote(app)
    await rmFile(created.path)
    const response = await app.get(`/papers/${PAPER_ID}/reader-note`)
    assert.equal(response.status, 200)
    const body = response.json()
    assert.equal(body.exists, false)
    assert.equal(body.markdown, '')
    assert.equal(body.lostPath, created.path)
    const paper = (await app.get(`/papers/${PAPER_ID}`)).json().paper
    assert.equal(paper.hasReaderNote, false)
  } finally {
    await app.close()
  }
})

// ── deleting a paper: the three-way vault choice (spec §12.3) ───────────────

const VAULT_PDF_REL = 'serdes/测试文献.pdf'
const VAULT_SUMMARY_REL = 'serdes/测试文献 总结.md'
const VAULT_NOTE_REL = 'serdes/测试文献 笔记.md'
const VAULT_ASSETS_REL = `serdes/_附件/${PAPER_ID}`

async function appWithVaultTripod() {
  const app = await appWithPaper({
    seed: {
      title: '测试文献',
      meta: {
        fileName: '测试文献.pdf',
        vaultPath: VAULT_PDF_REL,
        summaryPath: '',
      },
    },
  })
  const folder = path.join(app.vaultPath, 'serdes')
  await mkdir(folder, { recursive: true })
  await writeFile(path.join(folder, '测试文献.pdf'), '%PDF-1.4\n', 'latin1')
  const summaryPath = path.join(app.vaultPath, ...VAULT_SUMMARY_REL.split('/'))
  await writeFile(summaryPath, '---\nnote_role: "summary"\n---\n\n# 总结\n', 'utf8')
  const meta = await app.readMeta()
  meta.summaryPath = summaryPath
  await writeFile(
    path.join(app.paperDir(), 'meta.json'),
    JSON.stringify(meta, null, 2),
    'utf8',
  )
  const created = await createNote(app)
  assert.equal(created.relative, VAULT_NOTE_REL)
  // One note image is enough to create `_附件/<id>/笔记/`.
  const image = await app.post(`/papers/${PAPER_ID}/reader-note/images`, {
    dataUrl: dataUrl(PNG_BYTES),
  })
  assert.equal(image.status, 200, image.text)
  return {
    app,
    summaryAbs: summaryPath,
    noteAbs: path.join(app.vaultPath, ...VAULT_NOTE_REL.split('/')),
    assetsAbs: path.join(app.vaultPath, ...VAULT_ASSETS_REL.split('/')),
  }
}

async function exists(target) {
  try {
    await stat(target)
    return true
  } catch {
    return false
  }
}

async function rmFile(target) {
  await rm(target, { force: true })
}

test('DELETE /papers/:id keeps vault files by default', async () => {
  const { app, summaryAbs, noteAbs, assetsAbs } = await appWithVaultTripod()
  try {
    const response = await app.delete(`/papers/${PAPER_ID}?confirm=true`)
    assert.equal(response.status, 200, response.text)
    const body = response.json()
    assert.equal(body.ok, true)
    assert.equal(body.vaultFiles, 'keep')
    assert.equal(body.vaultPreserved, true)
    assert.ok(await exists(summaryAbs), 'the summary stays')
    assert.ok(await exists(noteAbs), 'the reader note stays')
    assert.ok(await exists(assetsAbs), 'the attachments stay')
    // The plugin-side copies always go (spec §9).
    assert.equal(await exists(path.join(app.paperDir(), 'reader-note-questions.json')), false)
    assert.equal(await exists(app.paperDir()), false)
  } finally {
    await app.close()
  }
})

test('DELETE /papers/:id?vaultFiles=summary removes only the summary', async () => {
  const { app, summaryAbs, noteAbs, assetsAbs } = await appWithVaultTripod()
  try {
    const response = await app.delete(`/papers/${PAPER_ID}?confirm=true&vaultFiles=summary`)
    assert.equal(response.status, 200, response.text)
    const body = response.json()
    assert.equal(body.vaultFiles, 'summary')
    assert.ok(body.deleted.length >= 1)
    assert.equal(await exists(summaryAbs), false, 'the summary is gone')
    assert.ok(await exists(noteAbs), 'the reader note stays')
    assert.ok(await exists(assetsAbs), 'the attachments stay')
  } finally {
    await app.close()
  }
})

test('DELETE /papers/:id?vaultFiles=all removes the tripod and _附件/<id>/', async () => {
  const { app, summaryAbs, noteAbs, assetsAbs } = await appWithVaultTripod()
  try {
    const response = await app.delete(`/papers/${PAPER_ID}?confirm=true&vaultFiles=all`)
    assert.equal(response.status, 200, response.text)
    const body = response.json()
    assert.equal(body.vaultFiles, 'all')
    assert.deepEqual(body.warnings, [])
    assert.equal(await exists(summaryAbs), false)
    assert.equal(await exists(noteAbs), false)
    assert.equal(await exists(assetsAbs), false, 'both attachment sub folders are gone')
    assert.ok(await exists(path.join(app.vaultPath, 'serdes', '测试文献.pdf')), 'the PDF is untouched')
  } finally {
    await app.close()
  }
})

test('DELETE legacy deleteNotes:true is equivalent to vaultFiles=all', async () => {
  const { app, noteAbs, assetsAbs } = await appWithVaultTripod()
  try {
    const response = await app.request('DELETE', `/papers/${PAPER_ID}?confirm=true`, {
      deleteNotes: true,
    })
    assert.equal(response.status, 200, response.text)
    assert.equal(response.json().vaultFiles, 'all')
    assert.equal(await exists(noteAbs), false)
    assert.equal(await exists(assetsAbs), false)
  } finally {
    await app.close()
  }
})

test('DELETE /papers/:id rejects an unknown vaultFiles value', async () => {
  const { app } = await appWithVaultTripod()
  try {
    const response = await app.delete(`/papers/${PAPER_ID}?confirm=true&vaultFiles=everything`)
    assert.equal(response.status, 400)
    assert.match(response.json().error, /vaultFiles/)
  } finally {
    await app.close()
  }
})

// ── GET /vault/library grouping fields (spec §12.4) ─────────────────────────

test('GET /vault/library exposes summaryRel and readerNoteRel', async () => {
  const { app } = await appWithVaultTripod()
  try {
    const response = await app.get('/vault/library?refresh=1')
    assert.equal(response.status, 200, response.text)
    const pdf = response.json().pdfs.find((item) => item.rel === VAULT_PDF_REL)
    assert.ok(pdf, 'the seeded PDF is in the library')
    assert.equal(pdf.summaryRel, VAULT_SUMMARY_REL)
    assert.equal(pdf.readerNoteRel, VAULT_NOTE_REL)
  } finally {
    await app.close()
  }
})

test('GET /vault/library reports empty rels for a PDF without the companions', async () => {
  const app = await appWithPaper()
  try {
    await writeFile(path.join(app.vaultPath, '孤零零.pdf'), '%PDF-1.4\n', 'latin1')
    const response = await app.get('/vault/library?refresh=1')
    assert.equal(response.status, 200, response.text)
    const pdf = response.json().pdfs.find((item) => item.rel === '孤零零.pdf')
    assert.ok(pdf)
    assert.equal(pdf.summaryRel, '')
    assert.equal(pdf.readerNoteRel, '')
  } finally {
    await app.close()
  }
})

// ── a failing vault write must not crash the route (spec §10) ──────────────

test('a vault write failure answers a structured 500 instead of crashing', async () => {
  const app = await appWithPaper()
  try {
    // A directory squatting on the note path makes the atomic write fail. The
    // route must report it, not throw an unhandled error.
    await mkdir(notePath(app), { recursive: true })
    const response = await app.post(`/papers/${PAPER_ID}/reader-note`)
    assert.equal(response.status, 500, response.text)
    assert.match(response.json().error, /写笔记失败/)
    const get = await app.get(`/papers/${PAPER_ID}/reader-note`)
    assert.equal(get.status, 200)
    assert.equal(get.json().exists, false)
  } finally {
    await app.close()
  }
})

// ── tripod sync: the host has to persist the new paths (spec §12.2) ────────

test('moving the PDF moves the note and rewrites meta.readerNotePath', async () => {
  const { app } = await appWithVaultTripod()
  try {
    await mkdir(path.join(app.vaultPath, 'other'), { recursive: true })
    const response = await app.post('/vault/item/move', {
      rel: VAULT_PDF_REL,
      folder: 'other',
      kind: 'pdf',
    })
    assert.equal(response.status, 200, response.text)
    const body = response.json()
    assert.equal(body.changed, true)
    const kinds = body.moved.map((item) => item.kind)
    assert.ok(kinds.includes('note'), JSON.stringify(kinds))
    assert.ok(kinds.includes('assets'), JSON.stringify(kinds))
    assert.equal(body.paperId, PAPER_ID)

    const meta = await app.readMeta()
    assert.equal(meta.vaultPath, 'other/测试文献.pdf')
    assert.equal(meta.readerNotePath, path.join(app.vaultPath, 'other', '测试文献 笔记.md'))
    assert.equal(meta.readerNoteRelative, 'other/测试文献 笔记.md')
    assert.ok(await exists(path.join(app.vaultPath, 'other', '_附件', PAPER_ID, '笔记')))

    // The route keeps working from the new location.
    const listed = await app.get(`/papers/${PAPER_ID}/reader-note`)
    assert.equal(listed.json().exists, true)
    assert.equal(listed.json().relative, 'other/测试文献 笔记.md')
  } finally {
    await app.close()
  }
})

test('renaming the PDF renames the tripod and rewrites meta.summaryPath', async () => {
  const { app } = await appWithVaultTripod()
  try {
    const response = await app.request('PATCH', '/vault/item', {
      rel: VAULT_PDF_REL,
      fileName: '改名后的文献',
    })
    assert.equal(response.status, 200, response.text)
    const body = response.json()
    assert.equal(body.renamed, true)
    assert.equal(body.summaryRenamed, true)
    assert.ok(body.summaryRenamedPath)

    const meta = await app.readMeta()
    assert.equal(meta.vaultPath, 'serdes/改名后的文献.pdf')
    assert.equal(meta.summaryPath, body.summaryRenamedPath)
    assert.equal(meta.summaryPath, path.join(app.vaultPath, 'serdes', '改名后的文献 总结.md'))
    // The reader note was renamed too; its absolute path self-heals on read.
    const listed = await app.get(`/papers/${PAPER_ID}/reader-note`)
    assert.equal(listed.json().exists, true)
    assert.equal(listed.json().relative, 'serdes/改名后的文献 笔记.md')
    const metaAfter = await app.readMeta()
    assert.equal(metaAfter.readerNotePath, path.join(app.vaultPath, 'serdes', '改名后的文献 笔记.md'))
  } finally {
    await app.close()
  }
})
