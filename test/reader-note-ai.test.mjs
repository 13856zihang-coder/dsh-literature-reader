import assert from 'node:assert/strict'
import test from 'node:test'
import { LiteratureAI } from '../lib/ai.js'

// Contract: docs/reader-note-spec.md §5 (reader-note core), §6 (lib/ai.js),
// §8 (test matrix) and §14.5 (conservative "suspected error" scale).

const META = {
  title: '均衡器与高速链路',
  authors: ['A. Author', 'B. Author'],
  year: 2024,
}

/** Minimal fake plugin context: each `llm.stream` call replays one script entry. */
function fakeCtx(script, { contextWindow = 128_000 } = {}) {
  const calls = []
  const queue = [...script]
  const ctx = {
    attachments: {
      async saveImage({ mediaType, name }) {
        return { id: 'att-1', mediaType, name }
      },
    },
    agentDefaultModel: {
      currentSelection: () => ({ provider: 'p', model: 'm' }),
    },
    llm: {
      listProviders: () => [{ id: 'p', name: 'P' }],
      listModels: async () => [{ id: 'm', name: 'M', inputModalities: ['text'] }],
      resolveModelInfo: async () => ({
        provider: 'p',
        id: 'm',
        inputModalities: ['text'],
        context: { contextWindow },
      }),
      async *stream(options) {
        calls.push(options)
        const answer = queue.length > 1 ? queue.shift() : (queue[0] ?? '')
        yield* [{ type: 'text-delta', text: answer }, { type: 'finish', reason: { kind: 'stop' } }]
      },
    },
  }
  return { ctx, calls }
}

const NOTE = `# 2026-11-07

## 21:03 · 均衡器的作用

高速串行链路里，信道对高频分量的衰减更严重。

## 21:10 · 误码率

在 25 Gb/s 下眼图张开度提升 30%[p.7]。

## 21:15 · 待确认

均衡器的增益越大越好。`

// --- prompt contract -------------------------------------------------------

test('organizeReaderNote spells out the rewrite limits and the conservative error scale', async () => {
  const { ctx, calls } = fakeCtx([
    JSON.stringify({ markdown: NOTE, report: { typos: 0, merges: 0, formatting: 0, summary: '' }, questions: [] }),
  ])
  const ai = new LiteratureAI(ctx, {})
  await ai.organizeReaderNote({ meta: META, markdown: NOTE })
  // The hard rules live in the system prompt (§6).
  const system = calls[0].system
  for (const phrase of [
    '不许新增任何事实、数字',
    '不许翻译',
    '不许删掉任何一条记录',
    '[[链接]]',
    '代码块',
    'frontmatter',
    '时间戳',
  ]) {
    assert.ok(system.includes(phrase), `system prompt must state：${phrase}`)
  }
  // §14.5: only the four hard-error kinds may be reported…
  for (const phrase of ['数字/年份/引用与原文对不上', '因果关系说反', '术语用错', '结论与前提矛盾']) {
    assert.ok(system.includes(phrase), `system prompt must list hard error：${phrase}`)
  }
  // …and style / mergeability / academic-tone complaints are explicitly excluded.
  for (const phrase of ['措辞风格', '可合并性', '表达不够学术']) {
    assert.ok(system.includes(phrase), `system prompt must exclude：${phrase}`)
  }
  assert.match(system, /最多 8 条/)
  // The note body and the paper identity reach the model-visible prompt.
  const prompt = calls[0].messages[0].content[0].text
  assert.ok(prompt.includes('均衡器与高速链路'))
  assert.ok(prompt.includes('A. Author、B. Author'))
  assert.ok(prompt.includes('2024'))
  assert.ok(prompt.includes('## 21:10 · 误码率'))
})

test('rewriteReaderNoteQuestion carries the same [[链接]] / timestamp bans and the discussion', async () => {
  const { ctx, calls } = fakeCtx([
    JSON.stringify({ verdict: 'ok', quote: '', replacement: '', why: '原文没问题' }),
  ])
  const ai = new LiteratureAI(ctx, {})
  await ai.rewriteReaderNoteQuestion({
    meta: META,
    markdown: NOTE,
    question: { quote: '均衡器的增益越大越好。', problem: '结论可疑', ask: '这句是结论吗？' },
    history: [
      { role: 'user', content: '这是我从论文里推出来的' },
      { role: 'assistant', content: '那要标清是推断' },
    ],
  })
  const system = calls[0].system
  assert.ok(system.includes('[[链接]]'))
  assert.ok(system.includes('时间戳'))
  assert.ok(system.includes('verdict 填 "ok"'))
  assert.match(system, /3 倍加 200/)
  const prompt = calls[0].messages[0].content[0].text
  assert.ok(prompt.includes('均衡器的增益越大越好。'))
  assert.ok(prompt.includes('这是我从论文里推出来的'))
  assert.ok(prompt.includes('那要标清是推断'))
})

test('a very long note keeps its head and tail inside the prompt', async () => {
  const body = `HEAD_MARKER\n${'中'.repeat(20_000)}\nTAIL_MARKER`
  const { ctx, calls } = fakeCtx([
    JSON.stringify({ markdown: 'x', report: { typos: 0, merges: 0, formatting: 0, summary: '' }, questions: [] }),
  ])
  const ai = new LiteratureAI(ctx, {})
  await ai.organizeReaderNote({ meta: META, markdown: body })
  const prompt = calls[0].messages[0].content[0].text
  assert.ok(prompt.length < body.length, 'over-long note must be truncated')
  assert.ok(prompt.includes('HEAD_MARKER'))
  assert.ok(prompt.includes('TAIL_MARKER'))
  assert.match(prompt, /因篇幅过长已省略/)
})

// --- organizeReaderNote ----------------------------------------------------

test('organizeReaderNote parses the JSON object and normalizes the report', async () => {
  const { ctx } = fakeCtx([
    JSON.stringify({
      markdown: NOTE.replace('衰减更严重', '衰减更严重。'),
      report: { typos: 2, merges: 1, formatting: 6, summary: '修正 2 处错别字、合并 1 处重复、整理 6 处格式' },
      questions: [
        {
          quote: '均衡器的增益越大越好。',
          problem: '结论与前提矛盾',
          suggestion: '增益受噪声限制',
          ask: '这句是你的推断吗？',
        },
      ],
    }),
  ])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.organizeReaderNote({ meta: META, markdown: NOTE })
  assert.equal(result.markdown, NOTE.replace('衰减更严重', '衰减更严重。'))
  assert.deepEqual(result.report, {
    typos: 2,
    merges: 1,
    formatting: 6,
    summary: '修正 2 处错别字、合并 1 处重复、整理 6 处格式',
  })
  assert.deepEqual(result.questions, [
    {
      quote: '均衡器的增益越大越好。',
      problem: '结论与前提矛盾',
      suggestion: '增益受噪声限制',
      ask: '这句是你的推断吗？',
    },
  ])
})

test('organizeReaderNote accepts a fenced answer and clamps the report counters', async () => {
  const { ctx } = fakeCtx([
    '```json\n' +
      JSON.stringify({
        markdown: NOTE,
        report: { typos: -5, merges: '不是数字', formatting: 1200, summary: 's'.repeat(300) },
        questions: 'not-an-array',
      }) +
      '\n```',
  ])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.organizeReaderNote({ meta: META, markdown: NOTE })
  assert.equal(result.report.typos, 0)
  assert.equal(result.report.merges, 0)
  assert.equal(result.report.formatting, 999)
  assert.equal(result.report.summary.length, 200)
  assert.deepEqual(result.questions, [])
})

test('organizeReaderNote caps questions at 8 and drops quotes that are not in the note', async () => {
  const sentences = Array.from({ length: 10 }, (_, index) => `第 ${index + 1} 条记录的正文内容。`)
  const note = sentences
    .map((text, index) => `## 21:${String(index).padStart(2, '0')} · 记录\n\n${text}`)
    .join('\n\n')
  const questions = [
    { quote: '正文里根本不存在的一句话', problem: 'p', suggestion: 's', ask: 'a' },
    ...sentences.map((text) => ({ quote: text, problem: `p ${text}`, suggestion: 's', ask: 'a' })),
  ]
  const { ctx } = fakeCtx([
    JSON.stringify({
      markdown: note,
      report: { typos: 0, merges: 0, formatting: 0, summary: '' },
      questions,
    }),
  ])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.organizeReaderNote({ meta: META, markdown: note })
  assert.equal(result.questions.length, 8)
  // The fabricated quote is gone; every kept quote is a verbatim slice.
  assert.ok(!result.questions.some((item) => item.quote === '正文里根本不存在的一句话'))
  assert.ok(result.questions.every((item) => note.includes(item.quote)))
  assert.equal(result.questions[0].quote, sentences[0])
  assert.equal(result.questions[7].quote, sentences[7])
})

test('organizeReaderNote truncates oversized question fields and skips unusable entries', async () => {
  const quote = '均衡器的增益越大越好。'
  const second = '在 25 Gb/s 下眼图张开度提升 30%[p.7]。'
  const { ctx } = fakeCtx([
    JSON.stringify({
      markdown: NOTE,
      report: { typos: 0, merges: 0, formatting: 0, summary: '' },
      questions: [
        { quote, problem: 'p'.repeat(600), suggestion: 's'.repeat(600), ask: 'a'.repeat(600) },
        null,
        { problem: '没有 quote' },
        { quote: second },
        // A repeated quote is the same problem twice: keep it once.
        { quote: second, problem: '重复' },
      ],
    }),
  ])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.organizeReaderNote({ meta: META, markdown: NOTE })
  assert.equal(result.questions.length, 2)
  assert.equal(result.questions[0].quote, quote)
  assert.equal(result.questions[0].problem.length, 400)
  assert.equal(result.questions[0].suggestion.length, 400)
  assert.equal(result.questions[0].ask.length, 400)
  assert.deepEqual(result.questions[1], { quote: second, problem: '', suggestion: '', ask: '' })
})

test('organizeReaderNote retries once on a bad answer and then throws', async () => {
  const { ctx, calls } = fakeCtx(['这不是 JSON', '还是不是 JSON'])
  const ai = new LiteratureAI(ctx, {})
  await assert.rejects(
    () => ai.organizeReaderNote({ meta: META, markdown: NOTE }),
    (error) => {
      assert.match(error.message, /AI 返回的内容无法使用/)
      assert.match(error.message, /JSON/)
      return true
    },
  )
  assert.equal(calls.length, 2)
  // The retry prompt feeds the failure back so the model can repair its answer.
  assert.match(calls[1].messages[0].content[0].text, /上一次输出无法使用/)
})

test('organizeReaderNote rejects an empty markdown body', async () => {
  const { ctx } = fakeCtx([
    JSON.stringify({ markdown: '', report: { typos: 0, merges: 0, formatting: 0, summary: '' }, questions: [] }),
    JSON.stringify({ markdown: '   ', report: {}, questions: [] }),
  ])
  const ai = new LiteratureAI(ctx, {})
  await assert.rejects(() => ai.organizeReaderNote({ meta: META, markdown: NOTE }), /AI 返回的内容无法使用/)
})

// --- discussReaderNoteQuestion --------------------------------------------

test('discussReaderNoteQuestion streams plain text and passes onDelta through', async () => {
  const { ctx, calls } = fakeCtx(['这处确实有问题：25 Gb/s 和你前面写的 50 Gb/s 对不上。'])
  const ai = new LiteratureAI(ctx, {})
  const chunks = []
  const reply = await ai.discussReaderNoteQuestion({
    meta: META,
    markdown: NOTE,
    question: { quote: '在 25 Gb/s 下眼图张开度提升 30%[p.7]。', problem: '数字对不上', ask: '哪个是对的？' },
    history: [{ role: 'user', content: '我记得论文里是 50 Gb/s' }],
    userMessage: '',
    onDelta: (text) => chunks.push(text),
  })
  assert.match(reply, /这处确实有问题/)
  assert.equal(chunks.join(''), reply)
  // History becomes real chat turns, then the "speak first" nudge.
  const messages = calls[0].messages
  assert.equal(messages[0].role, 'user')
  assert.equal(messages[0].content[0].text, '我记得论文里是 50 Gb/s')
  assert.equal(messages[messages.length - 1].role, 'user')
  assert.match(messages[messages.length - 1].content[0].text, /请先说说你对这处问题的判断/)
  // The question and the note context are both in the system prompt.
  assert.ok(calls[0].system.includes('数字对不上'))
  assert.ok(calls[0].system.includes('## 21:10 · 误码率'))
  assert.match(calls[0].system, /不要输出整理后的整篇笔记/)
})

test('discussReaderNoteQuestion forwards a non-empty user message', async () => {
  const { ctx, calls } = fakeCtx(['明白了，那就保留。'])
  const ai = new LiteratureAI(ctx, {})
  await ai.discussReaderNoteQuestion({
    meta: META,
    markdown: NOTE,
    question: { quote: '均衡器的增益越大越好。', problem: '结论可疑', ask: '是推断吗？' },
    history: [],
    userMessage: '这是我从论文的图 3 推出来的',
  })
  const messages = calls[0].messages
  assert.equal(messages.length, 1)
  assert.equal(messages[0].content[0].text, '这是我从论文的图 3 推出来的')
})

// --- rewriteReaderNoteQuestion --------------------------------------------

test('rewriteReaderNoteQuestion applies a fix when the quote is verbatim', async () => {
  const quote = '均衡器的增益越大越好。'
  const { ctx } = fakeCtx([
    JSON.stringify({
      verdict: 'fix',
      quote,
      replacement: '均衡器的增益越大越好，但要受噪声与线性度限制。',
      why: '原文结论没有前提',
    }),
  ])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.rewriteReaderNoteQuestion({
    meta: META,
    markdown: NOTE,
    question: { quote, problem: '结论与前提矛盾', ask: '有前提吗？' },
    history: [{ role: 'assistant', content: '增益受噪声限制，应补上前提' }],
  })
  assert.equal(result.verdict, 'fix')
  assert.equal(result.quote, quote)
  assert.equal(result.replacement, '均衡器的增益越大越好，但要受噪声与线性度限制。')
  assert.equal(result.why, '原文结论没有前提')
})

test('rewriteReaderNoteQuestion returns ok when the discussion cleared the doubt', async () => {
  const { ctx } = fakeCtx([
    JSON.stringify({
      verdict: 'ok',
      quote: '均衡器的增益越大越好。',
      replacement: '',
      why: '这是作者自己的推断，可以保留',
    }),
  ])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.rewriteReaderNoteQuestion({
    meta: META,
    markdown: NOTE,
    question: { quote: '均衡器的增益越大越好。', problem: '结论可疑', ask: '是推断吗？' },
    history: [],
  })
  assert.deepEqual(result, { verdict: 'ok', quote: '', replacement: '', why: '这是作者自己的推断，可以保留' })
})

test('rewriteReaderNoteQuestion degrades to ok when the quote no longer exists', async () => {
  const { ctx } = fakeCtx([
    JSON.stringify({ verdict: 'fix', quote: '原文里已经删掉的一句话', replacement: '新的说法', why: '改了' }),
  ])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.rewriteReaderNoteQuestion({
    meta: META,
    markdown: NOTE,
    question: { quote: '原文里已经删掉的一句话', problem: 'p', ask: 'a' },
    history: [],
  })
  assert.deepEqual(result, { verdict: 'ok', quote: '', replacement: '', why: '改了' })
})

test('rewriteReaderNoteQuestion clamps an oversized replacement to quote*3+200', async () => {
  const quote = '在 25 Gb/s 下眼图张开度提升 30%[p.7]。'
  const limit = quote.length * 3 + 200
  const { ctx } = fakeCtx([
    JSON.stringify({ verdict: 'fix', quote, replacement: 'x'.repeat(limit + 500), why: '扩写' }),
  ])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.rewriteReaderNoteQuestion({
    meta: META,
    markdown: NOTE,
    question: { quote, problem: 'p', ask: 'a' },
    history: [],
  })
  assert.equal(result.verdict, 'fix')
  assert.equal(result.quote, quote)
  assert.equal(result.replacement.length, limit)
})

test('rewriteReaderNoteQuestion keeps a replacement that fits the limit untouched', async () => {
  const quote = '在 25 Gb/s 下眼图张开度提升 30%[p.7]。'
  const limit = quote.length * 3 + 200
  const replacement = 'y'.repeat(limit)
  const { ctx } = fakeCtx([JSON.stringify({ verdict: 'fix', quote, replacement, why: '顶格' })])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.rewriteReaderNoteQuestion({
    meta: META,
    markdown: NOTE,
    question: { quote, problem: 'p', ask: 'a' },
    history: [],
  })
  assert.equal(result.replacement.length, limit)
  assert.equal(result.replacement, replacement)
})

test('rewriteReaderNoteQuestion treats a fix without a replacement string as ok', async () => {
  const quote = '均衡器的增益越大越好。'
  const { ctx } = fakeCtx([JSON.stringify({ verdict: 'fix', quote, replacement: null, why: '改了' })])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.rewriteReaderNoteQuestion({
    meta: META,
    markdown: NOTE,
    question: { quote, problem: 'p', ask: 'a' },
    history: [],
  })
  // Never apply a "fix" that would silently delete the fragment.
  assert.deepEqual(result, { verdict: 'ok', quote: '', replacement: '', why: '改了' })
})

test('rewriteReaderNoteQuestion accepts an explicit empty replacement as a deletion', async () => {
  const quote = '均衡器的增益越大越好。'
  const { ctx } = fakeCtx([JSON.stringify({ verdict: 'fix', quote, replacement: '', why: '整句删掉' })])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.rewriteReaderNoteQuestion({
    meta: META,
    markdown: NOTE,
    question: { quote, problem: 'p', ask: 'a' },
    history: [],
  })
  assert.deepEqual(result, { verdict: 'fix', quote, replacement: '', why: '整句删掉' })
})

test('rewriteReaderNoteQuestion retries once and then throws on unusable JSON', async () => {
  const { ctx, calls } = fakeCtx(['不是 JSON', '仍然不是 JSON'])
  const ai = new LiteratureAI(ctx, {})
  await assert.rejects(
    () =>
      ai.rewriteReaderNoteQuestion({
        meta: META,
        markdown: NOTE,
        question: { quote: '均衡器的增益越大越好。', problem: 'p', ask: 'a' },
        history: [],
      }),
    /AI 返回的内容无法使用/,
  )
  assert.equal(calls.length, 2)
})
