import assert from 'node:assert/strict'
import test from 'node:test'
import { LiteratureAI, filterStudyHistory } from '../lib/ai.js'

const META = { title: 'Equalization for High-Speed Links', authors: ['A. Author'], year: 2024, venue: 'IEEE' }

/**
 * Minimal fake plugin context. `script` is a list of model answers; each call
 * consumes one entry and streams it back as chunks.
 */
function fakeCtx(script, { images = true, contextWindow = 128_000 } = {}) {
  const calls = []
  const queue = [...script]
  const ctx = {
    attachments: {
      saved: [],
      async saveImage({ data, mediaType, name }) {
        const attachment = { id: `att-${this.saved.length + 1}`, mediaType, name }
        this.saved.push({ data, mediaType, name, attachment })
        return attachment
      },
    },
    agentDefaultModel: {
      currentSelection: () => ({ provider: 'p', model: 'm' }),
    },
    llm: {
      listProviders: () => [{ id: 'p', name: 'P' }],
      listModels: async () => [{ id: 'm', name: 'M', inputModalities: images ? ['text', 'image'] : ['text'] }],
      resolveModelInfo: async () => ({ provider: 'p', id: 'm', inputModalities: images ? ['text', 'image'] : ['text'], context: { contextWindow } }),
      async *stream(options) {
        calls.push(options)
        const answer = queue.length > 1 ? queue.shift() : (queue[0] ?? '')
        yield* [{ type: 'text-delta', text: answer }, { type: 'finish', reason: { kind: 'stop' } }]
      },
    },
  }
  return { ctx, calls }
}

/**
 * Cut the rendered glossary out of a summary prompt.
 *
 * Slice with lastIndexOf, never indexOf: the words we look for also appear in
 * the rules text above. 「名词解释」 shows up five times in the template and
 * 「用户查过的词」 three times, so an indexOf slice silently lands in the rules
 * and any assertion on it is meaningless — it can pass while the real glossary
 * is wrong. `名词表（` is unique and only the rendered block starts with it.
 */
function glossarySection(prompt) {
  const start = prompt.lastIndexOf('名词表（')
  if (start < 0) return ''
  const end = prompt.indexOf('论文原文：', start)
  return prompt.slice(start, end < 0 ? undefined : end)
}

/** Run summarize with the given glossary and return the model-facing prompt. */
async function summarizeWithGlossary(glossary) {
  const { ctx, calls } = fakeCtx(['TAGS: a\n\n# T\n'])
  const ai = new LiteratureAI(ctx, {})
  await ai.summarize({
    meta: META,
    pages: [{ n: 1, text: 'x'.repeat(60) }],
    analysis: '',
    history: [],
    glossary,
  })
  return calls[0].messages[0].content[0].text
}

const NOTE = `# 学习笔记

> [!abstract] 速览
> **一句话**：均衡器补偿信道损耗。

## 1. 研究背景与问题

高速串行链路中，信道会衰减高频分量 [p.2]。

## 4. 实验、数据与结果

### 4.2 主要结果

在 25 Gb/s 下眼图张开度提升 30% [p.7]。

## 5. 结论、论证强度与局限

结论是均衡能显著改善误码率 [p.9]。
`

test('reviseNote parses a plain JSON answer and keeps every annotation accounted for', async () => {
  const { ctx, calls } = fakeCtx([
    JSON.stringify({
      reply: '补充了 4.2 节的数据来源',
      edits: [{ id: 'a1', replacement: '在 25 Gb/s 下眼图张开度提升 30% [p.7]（图 5）', why: '补上图表引用' }],
      unresolved: [{ id: 'a2', reason: '原文里没有对应数据' }],
    }),
  ])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.reviseNote({
    meta: META,
    markdown: NOTE,
    annotations: [
      { id: 'a1', quote: '提升 30%', note: '补上图表引用' },
      { id: 'a2', quote: '结论', note: '加一个对比实验' },
    ],
    instruction: '',
    signal: undefined,
  })
  assert.equal(calls.length, 1)
  assert.equal(result.reply, '补充了 4.2 节的数据来源')
  assert.deepEqual(result.edits, [
    { id: 'a1', replacement: '在 25 Gb/s 下眼图张开度提升 30% [p.7]（图 5）', why: '补上图表引用' },
  ])
  assert.deepEqual(result.unresolved, [{ id: 'a2', reason: '原文里没有对应数据' }])
  // The excerpt keeps the annotated paragraph so the model can see its context.
  assert.match(calls[0].messages[0].content[0].text, /眼图张开度提升 30%/)
})

test('reviseNote accepts a fenced answer and drops ids that were never asked about', async () => {
  const { ctx } = fakeCtx([
    '```json\n' +
      JSON.stringify({
        reply: '改了一处',
        edits: [
          { id: 'a1', replacement: '改写后的句子', why: '更简洁' },
          { id: 'other', replacement: '不应该出现', why: '编造的 id' },
        ],
        unresolved: [],
      }) +
      '\n```',
  ])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.reviseNote({
    meta: META,
    markdown: NOTE,
    annotations: [{ id: 'a1', quote: '提升 30%', note: '更简洁' }],
  })
  assert.equal(result.edits.length, 1)
  assert.equal(result.edits[0].id, 'a1')
  assert.equal(result.unresolved.length, 0)
})

test('reviseNote retries once when an annotation has no verdict, then succeeds', async () => {
  const { ctx, calls } = fakeCtx([
    JSON.stringify({ reply: '只处理了一条', edits: [{ id: 'a1', replacement: 'X', why: 'w' }] }),
    JSON.stringify({
      reply: '补上了第二条',
      edits: [{ id: 'a1', replacement: 'X', why: 'w' }],
      unresolved: [{ id: 'a2', reason: '找不到对应片段' }],
    }),
  ])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.reviseNote({
    meta: META,
    markdown: NOTE,
    annotations: [
      { id: 'a1', quote: '提升 30%', note: '改一改' },
      { id: 'a2', quote: '不存在的话', note: '改一改' },
    ],
  })
  assert.equal(calls.length, 2)
  // The retry prompt reports the missing annotation back to the model.
  assert.match(calls[1].messages[0].content[0].text, /没有给出这些标注的处理结果：a2/)
  assert.equal(result.unresolved[0].id, 'a2')
})

test('reviseNote reports a readable error when both answers are unusable', async () => {
  const { ctx, calls } = fakeCtx(['这不是 JSON', '还是不是 JSON'])
  const ai = new LiteratureAI(ctx, {})
  await assert.rejects(
    () =>
      ai.reviseNote({
        meta: META,
        markdown: NOTE,
        annotations: [{ id: 'a1', quote: '提升 30%', note: '改改' }],
      }),
    (error) => {
      assert.match(error.message, /AI 返回的内容无法使用/)
      assert.match(error.message, /JSON/)
      return true
    },
  )
  assert.equal(calls.length, 2)
})

test('reviseNote requires annotations or an instruction', async () => {
  const { ctx } = fakeCtx([])
  const ai = new LiteratureAI(ctx, {})
  await assert.rejects(
    () => ai.reviseNote({ meta: META, markdown: NOTE, annotations: [], instruction: '' }),
    /没有需要应用的标注或补充要求/,
  )
})

test('reviseNote keeps every heading when the note is over budget', async () => {
  const block = (marker, char) => `${marker}\n${char.repeat(14_000)}`
  const quote = '眼图张开度提升 30%'
  const longNote = `# 学习笔记\n\n${block('AAA_UNRELATED', 'a')}\n\n## 1. 研究背景与问题\n\n${block('BBB_UNRELATED', 'b')}\n\n## 4. 实验、数据与结果\n\n${block('CCC_ANNOTATED', 'c')}\n\n关键结论在 4.2 节 [p.7]，${quote}。\n\n## 9. 待解决问题\n\n${block('DDD_UNRELATED', 'd')}\n`
  // A small window keeps the excerpt path cheap to exercise.
  const { ctx, calls } = fakeCtx(
    [JSON.stringify({ reply: 'ok', edits: [{ id: 'a1', replacement: '替换', why: 'w' }], unresolved: [] })],
    { contextWindow: 30_000 },
  )
  const ai = new LiteratureAI(ctx, {})
  const start = longNote.indexOf(quote)
  await ai.reviseNote({
    meta: META,
    markdown: longNote,
    annotations: [{ id: 'a1', quote, note: '改写', start, end: start + quote.length }],
  })
  const prompt = calls[0].messages[0].content[0].text
  assert.ok(prompt.length < longNote.length, 'over-budget note must be excerpted')
  // Every heading survives, plus the annotated paragraph and its neighbours.
  for (const heading of ['## 1. 研究背景与问题', '## 4. 实验、数据与结果', '## 9. 待解决问题']) {
    assert.match(prompt, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(prompt, /CCC_ANNOTATED/)
  assert.match(prompt, new RegExp(quote))
  // Far-away prose is dropped; the paragraph right after the annotation stays
  // so the replacement still fits its context.
  assert.doesNotMatch(prompt, /AAA_UNRELATED/)
})

test('locateFigure sends the page image and normalizes the bbox', async () => {
  const { ctx, calls } = fakeCtx([
    JSON.stringify({ found: true, bbox: [120, 240, 880, 960], label: '图 3', confidence: 0.92, note: '页面上半部分' }),
  ])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.locateFigure({
    meta: META,
    pageImage: { data: Buffer.from('fake-jpeg'), page: 7 },
    caption: '图 3 整体架构',
    hint: '整体框图',
    pageSize: { width: 612, height: 792 },
  })
  assert.deepEqual(result, { found: true, bbox: [120, 240, 880, 960], label: '图 3', confidence: 0.92, note: '页面上半部分' })
  assert.equal(ctx.attachments.saved.length, 1)
  assert.equal(ctx.attachments.saved[0].name, 'figure-p7.jpg')
  const content = calls[0].messages[0].content
  assert.equal(content[0].type, 'image')
  assert.equal(content[1].type, 'text')
  assert.match(content[1].text, /第 7 页/)
  assert.match(content[1].text, /图 3 整体架构/)
})

test('locateFigure clamps an out-of-range box and rejects one that is too small', async () => {
  const { ctx } = fakeCtx([
    JSON.stringify({ found: true, bbox: [-40, 120, 1200, 900], label: '图 1', confidence: 0.8, note: '' }),
  ])
  const ai = new LiteratureAI(ctx, {})
  const clamped = await ai.locateFigure({ meta: META, pageImage: { data: Buffer.from('x'), page: 2 } })
  assert.deepEqual(clamped.bbox, [0, 120, 1000, 900])

  const small = fakeCtx([
    JSON.stringify({ found: true, bbox: [100, 100, 130, 140], label: '图 1', confidence: 0.8, note: '太小' }),
  ])
  const aiSmall = new LiteratureAI(small.ctx, {})
  const rejected = await aiSmall.locateFigure({ meta: META, pageImage: { data: Buffer.from('x'), page: 2 } })
  assert.equal(rejected.found, false)
  assert.equal(rejected.bbox, null)
  assert.match(rejected.note, /框选范围无效/)
  assert.match(rejected.note, /太小/)
})

test('locateFigure reports found=false when the model cannot find the figure', async () => {
  const { ctx } = fakeCtx([
    '```json\n{"found":false,"bbox":null,"label":"","confidence":0.2,"note":"这一页没有匹配的图"}\n```',
  ])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.locateFigure({ meta: META, pageImage: { data: Buffer.from('x'), page: 1 } })
  assert.equal(result.found, false)
  assert.equal(result.bbox, null)
  assert.equal(result.note, '这一页没有匹配的图')
})

test('locateFigure retries once and then fails with a readable message', async () => {
  const { ctx, calls } = fakeCtx(['not json at all', 'still not json'])
  const ai = new LiteratureAI(ctx, {})
  await assert.rejects(
    () => ai.locateFigure({ meta: META, pageImage: { data: Buffer.from('x'), page: 3 } }),
    /AI 返回的内容无法使用/,
  )
  assert.equal(calls.length, 2)
})

test('locateFigure treats an unusable bbox as not found instead of failing', async () => {
  const { ctx } = fakeCtx(['{"found":true,"bbox":"oops","label":"图 1","confidence":0.4,"note":""}'])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.locateFigure({ meta: META, pageImage: { data: Buffer.from('x'), page: 3 } })
  assert.equal(result.found, false)
  assert.equal(result.bbox, null)
  assert.match(result.note, /框选范围无效/)
})

test('locateFigure refuses to run without image support', async () => {
  const { ctx } = fakeCtx([], { images: false })
  const ai = new LiteratureAI(ctx, {})
  await assert.rejects(
    () => ai.locateFigure({ meta: META, pageImage: { data: Buffer.from('x'), page: 1 } }),
    /不支持图片输入/,
  )
})

test('planImagePlacement inserts under a heading that exists verbatim', async () => {
  const { ctx, calls } = fakeCtx([
    JSON.stringify({
      action: 'insert',
      heading: '## 4. 实验、数据与结果',
      afterOffset: null,
      caption: '25 Gb/s 眼图',
      reason: '和结果最相关',
    }),
  ])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.planImagePlacement({ meta: META, markdown: NOTE, instruction: '放在实验结果那节' })
  assert.equal(result.action, 'insert')
  assert.equal(result.heading, '## 4. 实验、数据与结果')
  assert.equal(result.caption, '25 Gb/s 眼图')
  // The offset lands at the end of the chosen section, not in the next one.
  const before = NOTE.slice(0, result.afterOffset)
  assert.match(before, /## 4\. 实验、数据与结果/)
  assert.match(before, /眼图张开度提升 30%/)
  assert.doesNotMatch(NOTE.slice(result.afterOffset), /眼图张开度提升 30%/)
  assert.equal(calls.length, 1)
})

test('planImagePlacement degrades to a question when the heading is missing', async () => {
  const { ctx } = fakeCtx([
    JSON.stringify({
      action: 'insert',
      heading: '## 6. 不存在的章节',
      afterOffset: null,
      caption: '',
      reason: '看起来像放这里',
    }),
  ])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.planImagePlacement({ meta: META, markdown: NOTE, instruction: '随便放' })
  assert.equal(result.action, 'ask')
  assert.match(result.question, /正文里没有找到/)
  assert.match(result.question, /6\. 不存在的章节/)
  assert.equal(result.suggestion, '看起来像放这里')
})

test('planImagePlacement asks when the user gave no location', async () => {
  const { ctx } = fakeCtx([
    JSON.stringify({ action: 'ask', question: '这张图应该放在哪一节？', suggestion: '看起来和 4.2 节的结果有关' }),
  ])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.planImagePlacement({ meta: META, markdown: NOTE, instruction: '' })
  assert.deepEqual(result, {
    action: 'ask',
    question: '这张图应该放在哪一节？',
    suggestion: '看起来和 4.2 节的结果有关',
  })
})

test('planImagePlacement treats an ambiguous heading as a question', async () => {
  const duplicated = `${NOTE}\n## 4. 实验、数据与结果\n\n重复的小节标题。\n`
  const { ctx } = fakeCtx([
    JSON.stringify({ action: 'insert', heading: '## 4. 实验、数据与结果', caption: '', reason: '重复标题' }),
  ])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.planImagePlacement({ meta: META, markdown: duplicated, instruction: '放在实验结果' })
  assert.equal(result.action, 'ask')
  assert.match(result.question, /正文里没有找到/)
})

test('planImagePlacement honours an explicit offset that lands inside the note', async () => {
  const offset = NOTE.indexOf('### 4.2 主要结果')
  const { ctx } = fakeCtx([
    JSON.stringify({ action: 'insert', heading: '## 4. 实验、数据与结果', afterOffset: offset, caption: '图', reason: '指定偏移' }),
  ])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.planImagePlacement({ meta: META, markdown: NOTE, instruction: '放在 4.2 前面' })
  assert.equal(result.action, 'insert')
  assert.equal(result.afterOffset, offset)
  assert.equal(NOTE.slice(offset, offset + '### 4.2 主要结果'.length), '### 4.2 主要结果')
})

test('planImagePlacement ignores an out-of-range offset and falls back to the heading', async () => {
  const { ctx } = fakeCtx([
    JSON.stringify({ action: 'insert', heading: '## 4. 实验、数据与结果', afterOffset: 999_999, caption: '图', reason: '偏移越界' }),
  ])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.planImagePlacement({ meta: META, markdown: NOTE, instruction: '放在实验结果' })
  assert.equal(result.action, 'insert')
  assert.ok(result.afterOffset <= NOTE.length)
  assert.match(NOTE.slice(0, result.afterOffset), /## 4\. 实验、数据与结果/)
})

test('planImagePlacement accepts an answer round and treats unparsable output as a question', async () => {
  const { ctx, calls } = fakeCtx(['完全不是 JSON', '仍然不是 JSON'])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.planImagePlacement({
    meta: META,
    markdown: NOTE,
    instruction: '放在结论',
    answer: '就放在第 5 节吧',
  })
  assert.equal(result.action, 'ask')
  assert.match(result.question, /哪一节/)
  // Both replies were unusable, so the user is asked instead of guessing.
  assert.equal(calls.length, 2)
  assert.match(calls[1].messages[0].content[0].text, /上一次输出无法使用/)
})

test('planImagePlacement forwards an uploaded image to the model', async () => {
  const { ctx, calls } = fakeCtx([
    JSON.stringify({ action: 'insert', heading: '## 5. 结论、论证强度与局限', caption: '自绘图', reason: '总结处' }),
  ])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.planImagePlacement({
    meta: META,
    markdown: NOTE,
    instruction: '放在结论',
    image: { data: Buffer.from('png-bytes'), mediaType: 'image/png', name: 'shot.png' },
  })
  assert.equal(result.action, 'insert')
  assert.equal(result.heading, '## 5. 结论、论证强度与局限')
  assert.equal(ctx.attachments.saved.length, 1)
  assert.equal(ctx.attachments.saved[0].name, 'shot.png')
  assert.equal(calls[0].messages[0].content[0].type, 'image')
})

test('summarize asks for a quick-recall summary and strips the TAGS line', async () => {
  const { ctx, calls } = fakeCtx([
    'TAGS: 均衡器, 高速链路, 眼图, 信道\n\n# 均衡器如何补偿信道损耗\n\n> [!abstract] 速览\n> **一句话**：用 FFE/DFE 组合补偿 25 Gb/s 链路的信道损耗，误码率降到 1e-12 [p.7]。\n> **为什么值得读 / 我的判断**：测试只覆盖一条背板，证据够用但不宜外推。\n\n## 这篇文献讲了什么\n\n高速串行链路里信道会衰减高频分量 [p.2]…\n\n## 关键结论\n\n- 25 Gb/s 下眼图张开度提升 30% [p.7]。\n',
  ])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.summarize({
    meta: META,
    pages: [
      { n: 1, text: 'Introductory text about equalization and high-speed serial links.' },
      { n: 2, text: 'More detail about the channel loss and the equalizer design.' },
    ],
    analysis: '',
    history: [],
  })
  const prompt = calls[0].messages[0].content[0].text
  // The blocks the reader relies on, and the abstract callout above them.
  assert.match(prompt, /\[!abstract\] 速览/)
  assert.match(prompt, /## 这篇文献讲了什么/)
  assert.match(prompt, /## 核心方法 \/ 技术点/)
  assert.match(prompt, /## 关键结论/)
  assert.match(prompt, /## 论文未解决的问题/)
  assert.match(prompt, /## 已弄懂的知识点/)
  assert.match(prompt, /## 名词解释/)
  // 需要注意 was dropped at the reader's request; its judgement content now
  // lives inside 关键结论 rather than as its own section.
  assert.doesNotMatch(prompt, /## 需要注意/)
  assert.doesNotMatch(prompt, /## 我的提问/)
  // Figures are steered to the technical block, but have no fixed section.
  assert.match(prompt, /优先放在"## 核心方法 \/ 技术点"这一块/)
  assert.match(prompt, /全篇最多 5 条/)
  assert.match(prompt, /\[\[FIGURE: p\.7 \| 图 3 整体架构 \|/)
  assert.doesNotMatch(prompt, /第 2、3、4 节/)
  assert.deepEqual(result.tags, ['均衡器', '高速链路', '眼图', '信道'])
  assert.doesNotMatch(result.body, /^TAGS/)
  assert.match(result.body, /^# 均衡器如何补偿信道损耗/)
})

test('the technical block scales with the paper instead of a target length', async () => {
  const { ctx, calls } = fakeCtx(['TAGS: a\n\n# T\n'])
  const ai = new LiteratureAI(ctx, {})
  await ai.summarize({ meta: META, pages: [{ n: 1, text: 'x'.repeat(60) }], analysis: '', history: [] })
  const prompt = calls[0].messages[0].content[0].text
  // Depth is decided by the paper's actual complexity, never by a word count.
  assert.match(prompt, /由这篇文献技术内核的实际复杂度决定/)
  assert.match(prompt, /不设字数标准/)
  assert.match(prompt, /读者能否仅凭这一节理解技术内核/)
  assert.match(prompt, /宁可写长而清楚，也不要短而含糊/)
  assert.match(prompt, /内容简单时不要注水/)
  // The two directions are both spelled out, so neither becomes the default.
  assert.match(prompt, /技术点简单、单一/)
  assert.match(prompt, /技术点复杂、要点多/)
  // Ways to add depth that raise information density, not word count.
  assert.match(prompt, /如何相互影响/)
  assert.match(prompt, /作用机理/)
  assert.match(prompt, /为什么要这样设计/)
  // And what must never be added just to fill space.
  assert.match(prompt, /不得注入与"理解技术内核"无关的细节/)
  assert.match(prompt, /加长的是技术密度，不是字数/)
  // No hard multiples or character targets leaked into the prompt.
  assert.doesNotMatch(prompt, /1\.5\s*倍/)
  assert.doesNotMatch(prompt, /2000-2100/)
  assert.doesNotMatch(prompt, /2600 字/)
  assert.doesNotMatch(prompt, /1800 字/)
})

test('length is bounded by "no padding", not by a hard word count', async () => {
  const { ctx, calls } = fakeCtx(['TAGS: a\n\n# T\n'])
  const ai = new LiteratureAI(ctx, {})
  await ai.summarize({ meta: META, pages: [{ n: 1, text: 'x'.repeat(60) }], analysis: '', history: [] })
  const prompt = calls[0].messages[0].content[0].text
  assert.match(prompt, /篇幅由文献实际内容决定/)
  assert.match(prompt, /简单文献可以很短/)
  assert.match(prompt, /约束的是"不注水"而不是"不超过多少字"/)
  // A soft ceiling may exist, but it must read as guidance rather than a gate.
  assert.match(prompt, /通常不超过 3000 字/)
  assert.match(prompt, /除非文献本身技术内容极其密集/)
})

test('the technical-core block is mandatory and covers each paper type', async () => {
  const { ctx, calls } = fakeCtx(['TAGS: a\n\n# T\n'])
  const ai = new LiteratureAI(ctx, {})
  await ai.summarize({ meta: META, pages: [{ n: 1, text: 'x'.repeat(60) }], analysis: '', history: [] })
  const prompt = calls[0].messages[0].content[0].text
  // The block must survive any future slimming of the template.
  assert.match(prompt, /核心方法/, 'skeleton must keep the technical-core block')
  assert.match(prompt, /技术点/)
  // It is required, not optional — unlike the omit-when-empty blocks.
  assert.match(prompt, /必写/)
  assert.match(prompt, /不许省略/)
  // And it must adapt to the kind of paper rather than assume an experiment paper.
  for (const kind of ['电路 / 器件类', '算法 / 方法类', '实验 / 测量类', '综述类', '理论类']) {
    assert.match(prompt, new RegExp(kind), `technical-core guide must cover ${kind}`)
  }
  // Coherent prose, not a bullet dump.
  assert.match(prompt, /不要退化成项目符号清单/)
})

test('a tutorial / application-note paper is described by what it teaches', async () => {
  const { ctx, calls } = fakeCtx(['TAGS: a\n\n# T\n'])
  const ai = new LiteratureAI(ctx, {})
  await ai.summarize({ meta: META, pages: [{ n: 1, text: 'x'.repeat(60) }], analysis: '', history: [] })
  const prompt = calls[0].messages[0].content[0].text
  // The sixth paper type: no new method, no experiments, value is the explanation.
  assert.match(prompt, /讲解型 \/ 应用笔记 \/ 教程型/)
  assert.match(prompt, /它想讲解出来的内容本身/)
  assert.match(prompt, /怎么工作的/)
  assert.match(prompt, /可配置项/)
  assert.match(prompt, /什么情况下效果好、什么情况下会变差/)
  // It must not be forced into the research-paper voice.
  assert.match(prompt, /不要硬套"方法 \/ 实验 \/ 结论"的语气/)
  assert.match(prompt, /教会读者什么/)
})

test('parallel technical points get their own unnumbered ### block', async () => {
  const { ctx, calls } = fakeCtx(['TAGS: a\n\n# T\n'])
  const ai = new LiteratureAI(ctx, {})
  await ai.summarize({ meta: META, pages: [{ n: 1, text: 'x'.repeat(60) }], analysis: '', history: [] })
  const prompt = calls[0].messages[0].content[0].text
  // Single idea stays as prose; several parallel ideas get sub-blocks.
  assert.match(prompt, /只有一个技术点/)
  assert.match(prompt, /两个及以上并列的核心要点 \/ 技术点/)
  assert.match(prompt, /### <技术点名称>/)
  assert.match(prompt, /每个要点一块/)
  // Block count follows the number of real ideas — no fixed quota, no padding.
  assert.match(prompt, /块数与要点数量一致/)
  assert.match(prompt, /不要为了对称硬拆/)
  // Options are grouped by role, not listed one by one.
  assert.match(prompt, /不要逐项罗列，按作用分组讲/)
})

test('### headings are confined to the technical-core block', async () => {
  const { ctx, calls } = fakeCtx(['TAGS: a\n\n# T\n'])
  const ai = new LiteratureAI(ctx, {})
  await ai.summarize({ meta: META, pages: [{ n: 1, text: 'x'.repeat(60) }], analysis: '', history: [] })
  const prompt = calls[0].messages[0].content[0].text
  // The skeleton itself never emits a ### line: sub-blocks are model output,
  // permitted only inside the technical block.
  assert.doesNotMatch(prompt, /^### /m)
  // Every line that talks about a ### sub-heading must sit inside the
  // technical-core guidance, or name that block explicitly — so the model is
  // never told to add ### anywhere else.
  const guideStart = prompt.indexOf('核心方法 / 技术点：')
  const guideEnd = prompt.indexOf('- 关键结论：')
  assert.ok(guideStart >= 0 && guideEnd > guideStart, 'technical-core guide must be bounded')
  let inside = false
  for (const line of prompt.split('\n')) {
    if (line.includes('核心方法 / 技术点：')) inside = true
    else if (line.startsWith('- 关键结论：')) inside = false
    if (line.includes('###')) {
      assert.ok(
        inside || line.includes('核心方法 / 技术点'),
        `### must be scoped to the technical block: ${line.trim()}`,
      )
    }
  }
  // The scope is stated both in the block guide (where to put them) and in the
  // global rules (where NOT to put them).
  assert.match(prompt, /只允许出现在"## 核心方法 \/ 技术点"内部/)
  assert.match(prompt, /其余任何地方都不许出现三级标题/)
  // Numbered hierarchy stays banned even inside the block.
  assert.match(prompt, /且不带编号/)
})

test('the summary skeleton carries no study-note sections', async () => {
  const { ctx, calls } = fakeCtx(['TAGS: a\n\n# T\n'])
  const ai = new LiteratureAI(ctx, {})
  await ai.summarize({ meta: META, pages: [{ n: 1, text: 'x'.repeat(60) }], analysis: '', history: [] })
  const prompt = calls[0].messages[0].content[0].text
  // Whatever else changes, these must never come back: they are what made the
  // summary read like a second pass over the paper.
  // Note: 「术语与符号表」/「术语表」 are the old study-note tables and stay
  // banned; the user-requested 「名词解释」 block at the end is a different
  // thing and is asserted separately.
  for (const banned of ['术语与符号表', '术语表', '闪卡', '复习自测', '自测题', '可迁移的方法', '概念/符号']) {
    assert.doesNotMatch(prompt, new RegExp(banned), `skeleton must not reintroduce 「${banned}」`)
  }
  // Numbered sections are still forbidden — that is the "re-read the paper"
  // shape, and it is what `###` blocks inside one section must never become.
  assert.doesNotMatch(prompt, /^## \d+\./m)
  assert.doesNotMatch(prompt, /^#{3,4} \d+(\.\d+)?[\s.]/m)
  assert.match(prompt, /不许出现"## 1\." "## 2\." 这类编号大节/)
})

/** Every 笔记 left in a prompt must be a paper genre or an exclusion clause. */
function assertNoStrayNoteLabel(text, where) {
  for (const line of String(text).split('\n')) {
    if (!line.includes('笔记')) continue
    const allowed = line.includes('应用笔记') || line.includes('不要称它为')
    assert.ok(allowed, `${where} 不该出现未加排除的「笔记」：${line.trim()}`)
  }
}

/**
 * Strip the quoted document out of a prompt. Its wording is user data — a note
 * that happens to be titled 学习笔记 is not the prompt calling itself one.
 */
function instructionOnly(prompt) {
  return String(prompt).replace(/<<<NOTE[\s\S]*?NOTE>>>/g, '')
}

test('the summary never calls itself a study note', async () => {
  const { ctx, calls } = fakeCtx(['TAGS: a\n\n# T\n'])
  const ai = new LiteratureAI(ctx, {})
  await ai.summarize({ meta: META, pages: [{ n: 1, text: 'x'.repeat(60) }], analysis: '', history: [] })
  const prompt = calls[0].messages[0].content[0].text
  const system = calls[0].system
  // The product is a 总结, not a 笔记. The model echoes whatever noun the prompt
  // uses, so the wording itself has to stay clean.
  assert.match(prompt, /这份材料的身份是"文献总结"/)
  assert.match(prompt, /不要称它为"笔记""学习笔记"/)
  assert.match(prompt, /"本文""这份总结"/)
  assertNoStrayNoteLabel(prompt, '总结提示词')
  assert.doesNotMatch(system, /笔记/, 'system prompt must not call the output a 笔记')
})

test('reviseNote and planImagePlacement talk about 总结, never 笔记', async () => {
  // Both edit the very same document the summary produces, so a stray 笔记 in
  // their prompts leaks straight into the revised body.
  const revise = fakeCtx([
    JSON.stringify({ reply: 'ok', edits: [{ id: 'a1', replacement: '替换', why: 'w' }], unresolved: [] }),
  ])
  const aiRevise = new LiteratureAI(revise.ctx, {})
  await aiRevise.reviseNote({
    meta: META,
    markdown: NOTE,
    annotations: [{ id: 'a1', quote: '提升 30%', note: '改写' }],
  })
  const reviseCall = revise.calls[0]
  assert.match(reviseCall.messages[0].content[0].text, /文献总结编辑/)
  assert.match(reviseCall.messages[0].content[0].text, /当前总结正文/)
  assert.match(reviseCall.messages[0].content[0].text, /不是整篇总结/)
  assert.match(reviseCall.system, /文献总结编辑/)
  for (const call of revise.calls) {
    assertNoStrayNoteLabel(instructionOnly(call.messages[0].content[0].text), 'reviseNote 提示词')
    assertNoStrayNoteLabel(call.system, 'reviseNote system')
  }

  const place = fakeCtx([
    JSON.stringify({ action: 'insert', heading: '## 4. 实验、数据与结果', caption: '图', reason: '结果' }),
  ])
  const aiPlace = new LiteratureAI(place.ctx, {})
  await aiPlace.planImagePlacement({ meta: META, markdown: NOTE, instruction: '放在实验结果' })
  const placeCall = place.calls[0]
  assert.match(placeCall.messages[0].content[0].text, /在编辑自己的论文总结/)
  assert.match(placeCall.messages[0].content[0].text, /总结正文/)
  assert.match(placeCall.system, /文献总结的图文编辑助手/)
  for (const call of place.calls) {
    assertNoStrayNoteLabel(instructionOnly(call.messages[0].content[0].text), 'planImagePlacement 提示词')
    assertNoStrayNoteLabel(call.system, 'planImagePlacement system')
  }
})

test('the analysis memo describes its intermediate output as 摘要, not 笔记', async () => {
  // The memo feeds summarization, so its section labels must not reintroduce
  // the word either.
  const { ctx, calls } = fakeCtx(['MEMO'])
  const ai = new LiteratureAI(ctx, {})
  // A 30k window yields a 51k-char budget; longer text forces the chunked path,
  // which is the only one that emits the per-range section label.
  ctx.llm.resolveModelInfo = async () => ({
    provider: 'p',
    id: 'm',
    inputModalities: ['text'],
    context: { contextWindow: 30_000 },
  })
  const pages = Array.from({ length: 10 }, (_, index) => ({
    n: index + 1,
    text: `Page ${index + 1} about equalization and channel loss. `.repeat(300),
  }))
  await ai.analyze({ title: 'T', fileName: 'f.pdf' }, pages, () => {})
  // Guard the guard: the chunked path must actually have run.
  assert.ok(
    calls.some((call) => call.messages[0].content[0].text.includes('以下是分段摘要')),
    'chunked analyse path must be exercised',
  )
  for (const call of calls) {
    const text = instructionOnly(call.messages[0].content[0].text)
    assertNoStrayNoteLabel(text, 'analyze 提示词')
    assertNoStrayNoteLabel(call.system, 'analyze system')
  }
})

test('the glossary sits last and is the only table', async () => {
  const { ctx, calls } = fakeCtx(['TAGS: a\n\n# T\n'])
  const ai = new LiteratureAI(ctx, {})
  await ai.summarize({ meta: META, pages: [{ n: 1, text: 'x'.repeat(60) }], analysis: '', history: [] })
  const prompt = calls[0].messages[0].content[0].text
  // Skeleton: 名词解释 must be the final ## block, and its table the only one.
  const skeleton = prompt.slice(prompt.indexOf('# <论文标题>'), prompt.indexOf('各块写什么'))
  const headings = skeleton.split('\n').filter((line) => /^## /.test(line))
  assert.equal(headings[headings.length - 1], '## 名词解释')
  assert.equal(skeleton.match(/\| --- \| --- \|/g).length, 1, 'glossary must be the only table')
  assert.match(prompt, /全文只允许"## 名词解释"下面这一张表格/)
  // Both sources feed it, and looked-up terms win.
  assert.match(prompt, /用户翻译过的词条/)
  assert.match(prompt, /source=translated 的，优先考虑收录/)
  // Omitting it entirely is allowed when nothing needs explaining.
  assert.match(prompt, /没有可解释的名词就整节省略/)
})

test('looked-up words are filtered by the model, not by length or origin', async () => {
  const { ctx, calls } = fakeCtx(['TAGS: a\n\n# T\n'])
  const ai = new LiteratureAI(ctx, {})
  await ai.summarize({ meta: META, pages: [{ n: 1, text: 'x'.repeat(60) }], analysis: '', history: [] })
  const prompt = calls[0].messages[0].content[0].text
  // The reader's dictionary is a record of lookups, not a term list: only real
  // technical terms belong in the table.
  assert.match(prompt, /只有真正的专业名词 \/ 技术术语才收/)
  assert.match(prompt, /理解本文技术内容是否需要它/)
  // Ordinary vocabulary is excluded by part of speech, with examples.
  assert.match(prompt, /不要收录.*动词短语/)
  assert.match(prompt, /普通副词/)
  assert.match(prompt, /常见形容词/)
  assert.match(prompt, /通用基础词/)
  // Short words are exactly what must be kept — that is where the heuristic failed.
  assert.match(prompt, /必须收录/)
  assert.match(prompt, /cursor/)
  assert.match(prompt, /polarity/)
  assert.match(prompt, /短词可能是核心术语/)
  // The real discriminator is the concept, never the shape of the string.
  assert.match(prompt, /不是词条长度、不是它来自哪里/)
  assert.match(prompt, /数量上限 12 条/)
  assert.match(prompt, /不要按长度或字母顺序/)
})

test('the unresolved-issues block is the author view, not the reader view', async () => {
  const { ctx, calls } = fakeCtx(['TAGS: a\n\n# T\n'])
  const ai = new LiteratureAI(ctx, {})
  await ai.summarize({ meta: META, pages: [{ n: 1, text: 'x'.repeat(60) }], analysis: '', history: [] })
  const prompt = calls[0].messages[0].content[0].text
  // It reports what the paper itself admits is unfinished.
  assert.match(prompt, /论文未解决的问题：\*\*作者视角\*\*/)
  assert.match(prompt, /留待将来/)
  assert.match(prompt, /只写作者说的，不要写我们推测的/)
  assert.match(prompt, /\*\*文献没有这类表述就整节省略（连标题一起不要写）\*\*/)
  // The reader-view cautions did not disappear with the 需要注意 section: they
  // moved into 关键结论, and the split is still spelled out so nothing repeats.
  assert.match(prompt, /结论是否可信、前提是否苛刻、哪里容易误读，\*\*就地写进这一条里\*\*/)
  assert.match(prompt, /不要另起一节做风险清单/)
  assert.match(prompt, /与"关键结论"里的谨慎措辞分工：这里写"作者说自己没做完什么"，那里写"我们该对哪些结论保持警惕"/)
  assert.match(prompt, /同一件事不要两边各写一遍/)
})

test('the understood-points block states knowledge, never questions', async () => {
  const { ctx, calls } = fakeCtx(['TAGS: a\n\n# T\n'])
  const ai = new LiteratureAI(ctx, {})
  await ai.summarize({ meta: META, pages: [{ n: 1, text: 'x'.repeat(60) }], analysis: '', history: [] })
  const prompt = calls[0].messages[0].content[0].text
  assert.match(prompt, /已弄懂的知识点：取材于用户问答记录里\*\*已经得到解答\*\*的部分/)
  // The core requirement: a statement, not a question.
  assert.match(prompt, /\*\*每条必须是一句陈述句知识点，不是问句\*\*/)
  // The guide carries a worked bad example and a good one.
  assert.match(prompt, /反例："pre-emphasis 为什么等价于 FIR 多抽头？"/)
  assert.match(prompt, /正例："pre-emphasis 等价于多抽头 FIR/)
  // No meta narration about the conversation itself.
  assert.match(prompt, /不要写"用户问了……""通过与 AI 对话了解到……"这类元叙述/)
  assert.match(prompt, /不要收翻译、单词释义/)
  assert.match(prompt, /没有值得收的就整节省略/)
})

test('summarize accepts a glossary and forwards it to the model', async () => {
  const { ctx, calls } = fakeCtx(['TAGS: a\n\n# T\n'])
  const ai = new LiteratureAI(ctx, {})
  await ai.summarize({
    meta: META,
    pages: [{ n: 1, text: 'x'.repeat(60) }],
    analysis: '',
    history: [],
    glossary: [
      { term: 'pre-emphasis', translation: '预加重', source: 'translated' },
      { term: 'VOD', translation: '差分输出电压', source: 'ai' },
    ],
  })
  const prompt = calls[0].messages[0].content[0].text
  assert.match(prompt, /名词表（来自用户翻译记录与本篇判断/)
  assert.match(prompt, /- pre-emphasis：预加重（用户查过的词）/)
  assert.match(prompt, /- VOD：差分输出电压/)
  // Looked-up terms are listed before the model's own picks. Compare inside the
  // rendered glossary only: bare indexOf('pre-emphasis') would hit the word in
  // the rules text far above and pass even when the ordering is broken.
  const glossary = glossarySection(prompt)
  assert.ok(
    glossary.indexOf('- pre-emphasis：预加重') < glossary.indexOf('- VOD：差分输出电压'),
    'translated entries must render before the model-suggested ones',
  )
  // Missing or empty glossary is fine: the model picks terms itself.
  const bare = fakeCtx(['TAGS: a\n\n# T\n'])
  const aiBare = new LiteratureAI(bare.ctx, {})
  await aiBare.summarize({ meta: META, pages: [{ n: 1, text: 'x'.repeat(60) }], analysis: '', history: [] })
  assert.doesNotMatch(bare.calls[0].messages[0].content[0].text, /名词表（来自用户翻译记录/)
  assert.doesNotMatch(bare.calls[0].messages[0].content[0].text, /undefined/)
})

test('summarize honours maxFigures = 0 and the default of 5', async () => {
  const none = fakeCtx(['TAGS: a\n\n# T\n'])
  const aiNone = new LiteratureAI(none.ctx, {})
  await aiNone.summarize({
    meta: META,
    pages: [{ n: 1, text: 'x'.repeat(60) }],
    analysis: '',
    history: [],
    maxFigures: 0,
  })
  const nonePrompt = none.calls[0].messages[0].content[0].text
  assert.match(nonePrompt, /不要输出任何 \[\[FIGURE/)
  assert.doesNotMatch(nonePrompt, /全篇最多/)

  const many = fakeCtx(['TAGS: a\n\n# T\n'])
  const aiMany = new LiteratureAI(many.ctx, {})
  await aiMany.summarize({
    meta: META,
    pages: [{ n: 1, text: 'x'.repeat(60) }],
    analysis: '',
    history: [],
    maxFigures: 8,
  })
  assert.match(many.calls[0].messages[0].content[0].text, /全篇最多 8 条/)
})

test('filterStudyHistory drops translations together with their answers', () => {
  const history = [
    { role: 'user', action: 'translate', content: '**waveforms** — 波形' },
    { role: 'assistant', content: '**waveforms** — 波形；信号波形（名词复数）' },
    { role: 'user', action: 'translate', content: '**termination** — 端接' },
    { role: 'assistant', content: '**termination** — 端接；终端电阻' },
    { role: 'user', action: 'points', content: '提炼这一段的要点' },
    { role: 'assistant', content: '三条要点…' },
  ]
  const kept = filterStudyHistory(history)
  assert.equal(kept.length, 2)
  assert.deepEqual(
    kept.map((message) => message.content),
    ['提炼这一段的要点', '三条要点…'],
  )
})

test('filterStudyHistory keeps legacy turns without an action field', () => {
  const history = [
    { role: 'user', content: '为什么这里要用 DFE？' },
    { role: 'assistant', content: '因为后游标 ISI 无法在发送端消除…' },
    { role: 'user', content: '那 FFE 呢？' },
    { role: 'assistant', content: 'FFE 处理前游标…' },
  ]
  assert.deepEqual(filterStudyHistory(history), history)
})

test('filterStudyHistory keeps asked questions and tolerates odd input', () => {
  const history = [
    { role: 'user', action: 'ask', content: '这条结论的外推性如何？' },
    { role: 'assistant', content: '只在一条背板上验证过…' },
    { role: 'user', action: 'critique', content: '从审稿人角度看有什么问题' },
    { role: 'assistant', content: '三点质疑…' },
    { role: 'user', action: 'translate', content: '**purple** — 紫色的' },
    { role: 'assistant', content: '**purple** — 紫色的；紫的' },
  ]
  const kept = filterStudyHistory(history)
  assert.equal(kept.length, 4)
  assert.equal(kept[3].content, '三点质疑…')
  // Defensive: no history, null entries, assistant-only input.
  assert.deepEqual(filterStudyHistory(undefined), [])
  assert.deepEqual(filterStudyHistory(null), [])
  assert.deepEqual(filterStudyHistory([{ role: 'assistant', content: '孤立的回答' }]), [
    { role: 'assistant', content: '孤立的回答' },
  ])
})

test('summarize leaves translation records out of the prompt', async () => {
  const { ctx, calls } = fakeCtx(['TAGS: a\n\n# T\n'])
  const ai = new LiteratureAI(ctx, {})
  await ai.summarize({
    meta: META,
    pages: [{ n: 1, text: 'x'.repeat(60) }],
    analysis: '',
    history: [
      { role: 'user', action: 'translate', content: '**waveforms** — 波形' },
      { role: 'assistant', content: '**waveforms** — 波形；信号波形（名词复数）' },
      { role: 'user', action: 'points', content: '这一页的要点是什么' },
      { role: 'assistant', content: '三条要点：均衡、信道、误码率。' },
    ],
  })
  const prompt = calls[0].messages[0].content[0].text
  assert.doesNotMatch(prompt, /waveforms/)
  assert.match(prompt, /这一页的要点是什么/)
  assert.match(prompt, /三条要点/)
})

// ---------------------------------------------------------------------------
// classifyGlossary
// ---------------------------------------------------------------------------

const CANDIDATES = [
  { term: 'pre-emphasis', translation: '预加重' },
  { term: 'cursor', translation: '游标' },
  { term: 'primarily', translation: '主要地' },
  { term: 'purple', translation: '紫色的' },
  { term: 'implementation', translation: '实现' },
]

test('classifyGlossary sorts candidates into include / exclude / uncertain', async () => {
  const { ctx, calls } = fakeCtx([
    JSON.stringify({
      include: ['pre-emphasis', 'cursor'],
      exclude: ['primarily', 'purple'],
      uncertain: [{ term: 'implementation', guess: false }],
    }),
  ])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.classifyGlossary({ meta: META, candidates: CANDIDATES })
  assert.deepEqual(result.include.map((item) => item.term), ['pre-emphasis', 'cursor'])
  assert.deepEqual(result.exclude.map((item) => item.term), ['primarily', 'purple'])
  assert.deepEqual(result.uncertain.map((item) => item.term), ['implementation'])
  // Translation travels with the term, so the client can show it in the dialog.
  assert.equal(result.include[0].translation, '预加重')
  // The buckets are mutually exclusive and cover every candidate exactly once.
  const all = [...result.include, ...result.exclude, ...result.uncertain].map((item) => item.term)
  assert.equal(all.length, CANDIDATES.length)
  assert.equal(new Set(all).size, CANDIDATES.length)
  assert.equal(calls.length, 1)
})

test('classifyGlossary answers empty input without calling the model', async () => {
  const { ctx, calls } = fakeCtx([])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.classifyGlossary({ meta: META, candidates: [] })
  assert.deepEqual(result, { include: [], exclude: [], uncertain: [] })
  assert.equal(calls.length, 0, 'empty candidate list must not spend a model call')
  // Missing / malformed candidate lists behave the same way.
  assert.deepEqual(await ai.classifyGlossary({ meta: META }), { include: [], exclude: [], uncertain: [] })
  assert.equal(calls.length, 0)
})

test('classifyGlossary asks about anything the model left out', async () => {
  const { ctx } = fakeCtx([
    JSON.stringify({ include: ['pre-emphasis'], exclude: ['primarily'] }),
  ])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.classifyGlossary({ meta: META, candidates: CANDIDATES })
  assert.deepEqual(result.include.map((item) => item.term), ['pre-emphasis'])
  assert.deepEqual(result.exclude.map((item) => item.term), ['primarily'])
  // The three words the model never placed are surfaced as questions, not lost.
  assert.deepEqual(result.uncertain.map((item) => item.term).sort(), ['cursor', 'implementation', 'purple'])
})

test('classifyGlossary ignores invented and duplicate terms', async () => {
  const { ctx } = fakeCtx([
    JSON.stringify({
      include: ['cursor', 'cursor', 'not-in-the-list'],
      exclude: ['primarily'],
      uncertain: [{ term: 'purple', guess: true }],
    }),
  ])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.classifyGlossary({ meta: META, candidates: CANDIDATES })
  assert.deepEqual(result.include.map((item) => item.term), ['cursor'])
  const all = [...result.include, ...result.exclude, ...result.uncertain].map((item) => item.term)
  assert.equal(all.length, CANDIDATES.length)
  assert.ok(!all.includes('not-in-the-list'))
})

test('classifyGlossary includes everything when the model fails', async () => {
  const { ctx } = fakeCtx(['this is not JSON', 'still not JSON'])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.classifyGlossary({ meta: META, candidates: CANDIDATES })
  // Degrading to "include all" preserves the pre-classification behaviour.
  assert.deepEqual(result.include.map((item) => item.term), CANDIDATES.map((item) => item.term))
  assert.deepEqual(result.exclude, [])
  assert.deepEqual(result.uncertain, [])
})

test('classifyGlossary always gives uncertain entries a boolean guess', async () => {
  const { ctx } = fakeCtx([
    JSON.stringify({
      include: [],
      exclude: [],
      // guess omitted on one, explicitly false on the other, truthy string on a third.
      uncertain: [{ term: 'pre-emphasis' }, { term: 'cursor', guess: false }, { term: 'purple', guess: 'yes' }],
    }),
  ])
  const ai = new LiteratureAI(ctx, {})
  const result = await ai.classifyGlossary({ meta: META, candidates: CANDIDATES })
  // Three explicit, plus the two unplaced ones backfilled as questions.
  assert.equal(result.uncertain.length, 5)
  for (const item of result.uncertain) {
    assert.equal(typeof item.guess, 'boolean', `guess must be a boolean for ${item.term}`)
  }
  // Default leans towards including (the reader can always untick it).
  assert.equal(result.uncertain.find((item) => item.term === 'pre-emphasis').guess, true)
  assert.equal(result.uncertain.find((item) => item.term === 'cursor').guess, false)
  // Backfilled entries default to include too.
  const backfilled = result.uncertain.filter((item) => ['primarily', 'implementation'].includes(item.term))
  assert.equal(backfilled.length, 2)
  for (const item of backfilled) assert.equal(typeof item.guess, 'boolean')
})

test('classifyGlossary tells the model it may defer instead of guessing', async () => {
  const { ctx, calls } = fakeCtx([
    JSON.stringify({ include: [], exclude: [], uncertain: CANDIDATES.map((item) => ({ term: item.term, guess: true })) }),
  ])
  const ai = new LiteratureAI(ctx, {})
  await ai.classifyGlossary({ meta: META, candidates: CANDIDATES })
  const prompt = calls[0].messages[0].content[0].text
  // The paper's identity is what makes "is this a term *here*" answerable.
  assert.match(prompt, /Equalization for High-Speed Links/)
  assert.match(prompt, /IEEE/)
  // All three buckets are defined with examples.
  assert.match(prompt, /include：确定是本文的专业术语/)
  assert.match(prompt, /exclude：确定是普通英语词/)
  assert.match(prompt, /uncertain：\*\*不确定就放这里\*\*/)
  // Deferring is explicitly preferred over guessing.
  assert.match(prompt, /拿不准就放 uncertain，不要硬猜/)
  // Every candidate is listed for the model to classify.
  for (const item of CANDIDATES) assert.match(prompt, new RegExp(item.term))
  assert.match(calls[0].system, /术语分类器/)
})

test('classifyGlossary never asks the reader about a short list', async () => {
  // Three words are not worth a dialog: unresolved ones join the include bucket.
  const small = fakeCtx([
    JSON.stringify({
      include: ['cursor'],
      exclude: ['purple'],
      uncertain: [{ term: 'dielectric', guess: true }],
    }),
  ])
  const aiSmall = new LiteratureAI(small.ctx, {})
  const result = await aiSmall.classifyGlossary({
    meta: META,
    candidates: [
      { term: 'cursor', translation: '游标' },
      { term: 'purple', translation: '紫色的' },
      { term: 'dielectric', translation: '介质' },
    ],
  })
  assert.deepEqual(result.uncertain, [], 'a short list must not trigger a dialog')
  assert.deepEqual(result.include.map((item) => item.term), ['cursor', 'dielectric'])
  assert.deepEqual(result.exclude.map((item) => item.term), ['purple'])

  // Four or more is worth asking about.
  const big = fakeCtx([
    JSON.stringify({
      include: ['cursor'],
      exclude: ['purple'],
      uncertain: [{ term: 'dielectric', guess: true }, { term: 'amplitude', guess: false }],
    }),
  ])
  const aiBig = new LiteratureAI(big.ctx, {})
  const asked = await aiBig.classifyGlossary({
    meta: META,
    candidates: [{ term: 'cursor' }, { term: 'purple' }, { term: 'dielectric' }, { term: 'amplitude' }],
  })
  assert.equal(asked.uncertain.length, 2)
  assert.equal(asked.uncertain.find((item) => item.term === 'amplitude').guess, false)
})

// ---------------------------------------------------------------------------
// glossary source field: the failure mode is silent, so guard it here
// ---------------------------------------------------------------------------

test('a translated entry is labelled and an unlabelled one still renders', async () => {
  // source: 'translated' → the reader actually looked this word up.
  const translated = await summarizeWithGlossary([
    { term: 'cursor', translation: '游标', source: 'translated' },
  ])
  assert.match(glossarySection(translated), /- cursor：游标（用户查过的词）/)

  // No source field at all: the term must still be rendered. Losing the label is
  // acceptable; losing the word is not.
  const plain = await summarizeWithGlossary([{ term: 'cursor', translation: '游标' }])
  assert.match(glossarySection(plain), /- cursor：游标/)
  assert.doesNotMatch(glossarySection(plain), /（用户查过的词）/)

  // An explicit non-translated source behaves like a missing one.
  const aiPicked = await summarizeWithGlossary([
    { term: 'cursor', translation: '游标', source: 'ai' },
  ])
  assert.match(glossarySection(aiPicked), /- cursor：游标/)
  assert.doesNotMatch(glossarySection(aiPicked), /（用户查过的词）/)
})

test('translated entries are hoisted above plain ones in the summary prompt', async () => {
  // This is the end-to-end guard: it checks the text actually sent to the model,
  // so a regression inside formatGlossaryForPrompt cannot hide. Assert on whole
  // lines and compare indexes inside the glossary slice — never slice with
  // indexOf, which lands in the rules text where these words also appear.
  const prompt = await summarizeWithGlossary([
    { term: 'interval', translation: '间隔', source: 'ai' },
    { term: 'cursor', translation: '游标', source: 'translated' },
  ])
  const glossary = glossarySection(prompt)
  const translatedAt = glossary.indexOf('- cursor：游标（用户查过的词）')
  const plainAt = glossary.indexOf('- interval：间隔')
  assert.ok(translatedAt >= 0, 'translated line must render')
  assert.ok(plainAt >= 0, 'plain line must render')
  assert.ok(translatedAt < plainAt, 'translated entries must be listed first')
})

test('hoisting preserves the relative order of translated entries', async () => {
  // [translated, plain, translated] → both translated keep the order the host
  // sent them in; sorting must not reshuffle the reader's own word list.
  const prompt = await summarizeWithGlossary([
    { term: 'pre-emphasis', translation: '预加重', source: 'translated' },
    { term: 'interval', translation: '间隔', source: 'ai' },
    { term: 'cursor', translation: '游标', source: 'translated' },
  ])
  const glossary = glossarySection(prompt)
  const first = glossary.indexOf('- pre-emphasis：预加重')
  const second = glossary.indexOf('- cursor：游标')
  const plain = glossary.indexOf('- interval：间隔')
  assert.ok(first >= 0 && second >= 0 && plain >= 0)
  // Both translated lines come before the plain one...
  assert.ok(first < plain && second < plain, 'both translated entries must precede the plain one')
  // ...and keep their original relative order.
  assert.ok(first < second, 'translated entries must keep the incoming order')
})

test('the glossary slice anchor stays unique in the prompt', async () => {
  // Guards the guards: if 名词表（ ever appears twice, glossarySection would pick
  // the wrong one and every assertion above would silently test the wrong text.
  const prompt = await summarizeWithGlossary([
    { term: 'cursor', translation: '游标', source: 'translated' },
  ])
  assert.equal(prompt.split('名词表（').length - 1, 1, 'glossary anchor must be unique')
  // And the full-width label only ever comes from the rendered block, not the rules.
  assert.equal(prompt.split('（用户查过的词）').length - 1, 1)
})

test('a looked-up word survives even without a translation', async () => {
  // classifyGlossary passes `translation: ''` for words the reader looked up but
  // never got a gloss for. Dropping them would silently lose the reader's word,
  // which is the one thing this pipeline must never do.
  const prompt = await summarizeWithGlossary([
    { term: 'cursor', source: 'translated' },
    { term: 'interval', translation: '间隔', source: 'ai' },
  ])
  const glossary = glossarySection(prompt)
  assert.match(glossary, /- cursor（用户查过的词）/, 'a translation-less term must still render')
  assert.match(glossary, /- interval：间隔/)
  // And it still keeps the head position that its source earns it.
  assert.ok(glossary.indexOf('- cursor') < glossary.indexOf('- interval'))
})
