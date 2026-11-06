import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  applyReplacements,
  findFigurePlaceholders,
  locateQuote,
  mapPlainToSource,
  parseMarkdown,
  plainProjection,
} from '../lib/markdown-core.js'

const SAMPLE = `TAGS: 均衡器, 信道, 仿真

# 高速链路均衡

> [!abstract] 速览
> **一句话**：均衡器补偿信道损耗。
> **结论**：有效。

## 1. 研究背景与问题

正文里有 **粗体**、*斜体*、\`代码\`、[链接](https://example.com/a) 与 [p.3]。

- 无序一
- 无序二 **重点**

1. 有序一
2. 有序二

| 概念 | 含义 |
| --- | --- |
| EQ | 均衡 |

\`\`\`js
const a = 1
\`\`\`

---

![图 3](_附件/abc/fig-p07-01.png)

[[FIGURE: p.7 | 图 3 整体架构 | 为什么这里需要图]]
`

function findBlock(blocks, type) {
  const found = blocks.find((block) => block.type === type)
  assert.ok(found, `missing block ${type}`)
  return found
}

test('parses headings, paragraphs, code, tables, quotes, lists, hr and images', () => {
  const { blocks } = parseMarkdown(SAMPLE)
  const types = blocks.map((block) => block.type)
  assert.deepEqual(types, [
    'paragraph',
    'heading',
    'quote',
    'heading',
    'paragraph',
    'list',
    'list',
    'table',
    'code',
    'hr',
    'image',
    'paragraph',
  ])

  const heading = findBlock(blocks, 'heading')
  assert.equal(heading.level, 1)
  assert.equal(heading.inline.map((item) => item.text).join(''), '高速链路均衡')
  assert.equal(SAMPLE.slice(heading.start, heading.end), '# 高速链路均衡')

  const secondHeading = blocks.filter((block) => block.type === 'heading')[1]
  assert.equal(secondHeading.level, 2)

  const quote = findBlock(blocks, 'quote')
  assert.deepEqual(quote.callout, { title: '速览', kind: 'abstract' })
  // The callout title line is metadata; the remaining lines form one paragraph
  // because they are not separated by a blank line.
  assert.equal(quote.blocks.length, 1)
  assert.equal(quote.blocks[0].type, 'paragraph')
  assert.equal(quote.blocks[0].inline[0].type, 'strong')
  assert.equal(quote.blocks[0].inline[0].text, '一句话')
  assert.equal(SAMPLE.slice(quote.start, quote.start + 2), '> ')

  const lists = blocks.filter((block) => block.type === 'list')
  assert.equal(lists[0].ordered, false)
  assert.equal(lists[0].items.length, 2)
  assert.equal(lists[1].ordered, true)
  assert.equal(lists[1].items.length, 2)

  const table = findBlock(blocks, 'table')
  assert.equal(table.header.length, 2)
  assert.equal(table.header[0][0].text, '概念')
  assert.equal(table.rows.length, 1)
  assert.equal(table.rows[0][1][0].text, '均衡')

  const code = findBlock(blocks, 'code')
  assert.equal(code.lang, 'js')
  assert.equal(code.text, 'const a = 1')
  assert.equal(SAMPLE.slice(code.textStart, code.textStart + code.text.length), 'const a = 1')

  const image = findBlock(blocks, 'image')
  assert.equal(image.alt, '图 3')
  assert.equal(image.src, '_附件/abc/fig-p07-01.png')
})

test('parses inline runs with exact source offsets', () => {
  const { blocks } = parseMarkdown(SAMPLE)
  const paragraph = blocks.filter((block) => block.type === 'paragraph')[1]
  const inline = paragraph.inline
  const strong = inline.find((item) => item.type === 'strong')
  assert.equal(strong.text, '粗体')
  assert.equal(SAMPLE.slice(strong.srcStart, strong.srcEnd), '粗体')
  assert.equal(SAMPLE[strong.srcStart - 2] + SAMPLE[strong.srcStart - 1], '**')

  const em = inline.find((item) => item.type === 'em')
  assert.equal(em.text, '斜体')
  assert.equal(SAMPLE.slice(em.srcStart, em.srcEnd), '斜体')

  const code = inline.find((item) => item.type === 'code')
  assert.equal(code.text, '代码')
  assert.equal(SAMPLE.slice(code.srcStart, code.srcEnd), '代码')

  const link = inline.find((item) => item.type === 'link')
  assert.equal(link.text, '链接')
  assert.equal(link.href, 'https://example.com/a')
  assert.equal(SAMPLE.slice(link.srcStart, link.srcEnd), '链接')

  const cite = inline.find((item) => item.type === 'cite')
  assert.equal(cite.text, '[p.3]')
  assert.equal(SAMPLE.slice(cite.srcStart, cite.srcEnd), '[p.3]')
})

test('plainProjection maps every character monotonically onto the source', () => {
  const { blocks } = parseMarkdown(SAMPLE)
  const projection = plainProjection(blocks)
  assert.equal(projection.map.length, projection.text.length)
  for (let index = 1; index < projection.map.length; index += 1) {
    assert.ok(projection.map[index] >= projection.map[index - 1], `map decreases at ${index}`)
  }
  for (const block of blocks) {
    assert.equal(typeof block.plainStart, 'number')
    assert.equal(typeof block.plainEnd, 'number')
    assert.ok(block.plainEnd >= block.plainStart)
    assert.ok(block.plainEnd <= projection.text.length)
  }
  // Lists put one item per line and tables use tabs between cells.
  assert.ok(projection.text.includes('无序一\n无序二 重点'))
  assert.ok(projection.text.includes('概念\t含义'))
  assert.ok(projection.text.includes('const a = 1'))
  // Rendered text never contains Markdown markers.
  assert.ok(!projection.text.includes('**'))
  assert.ok(!projection.text.includes('> [!abstract]'))
  assert.ok(projection.text.includes('[p.3]'))
})

test('locateQuote finds unique, ambiguous, prefix-disambiguated and re-wrapped quotes', () => {
  const source = `# 标题

第一段提到 信道 均衡。

第二段又提到 信道 均衡，但语境不同。

> 引用里的 信道
> 均衡 被换行拆开了。
`
  const projection = plainProjection(parseMarkdown(source).blocks)

  const unique = locateQuote(projection, { quote: '第一段提到' })
  assert.ok(unique)
  assert.equal(unique.exact, true)
  assert.equal(source.slice(unique.start, unique.end), '第一段提到')

  const ambiguous = locateQuote(projection, { quote: '信道 均衡' })
  assert.ok(ambiguous)
  assert.equal(ambiguous.exact, false)
  assert.ok(source.slice(ambiguous.start, ambiguous.end).includes('信道'))

  const second = source.indexOf('第二段')
  const withPrefix = locateQuote(projection, {
    quote: '信道 均衡',
    prefix: '第二段又提到 ',
    start: second,
  })
  assert.ok(withPrefix)
  assert.ok(source.slice(withPrefix.start - 20, withPrefix.start).includes('第二段'))

  const withSuffix = locateQuote(projection, {
    quote: '信道',
    suffix: ' 均衡，但语境不同',
  })
  assert.ok(withSuffix)
  assert.ok(source.slice(withSuffix.end).startsWith(' 均衡，但语境不同'))

  // Extra whitespace inside the quote is normalised before matching. The
  // source range spans the quote markers of the wrapped line, so only the
  // first and last characters are asserted.
  const wrapped = locateQuote(projection, { quote: '引用里的 信道 均衡 被换行拆开了。' })
  assert.ok(wrapped)
  assert.ok(source.slice(wrapped.start, wrapped.end).startsWith('引用里的 信道'))
  assert.ok(source.slice(wrapped.start, wrapped.end).endsWith('被换行拆开了。'))

  assert.equal(locateQuote(projection, { quote: '不存在的文字' }), null)
  assert.equal(locateQuote(projection, { quote: '   ' }), null)
  assert.equal(locateQuote(projection, {}), null)
})

test('mapPlainToSource returns trimmed source ranges and rejects illegal ranges', () => {
  const source = '# 标题\n\n正文 甲 乙\n'
  const projection = plainProjection(parseMarkdown(source).blocks)
  const start = projection.text.indexOf('正文')
  const mapped = mapPlainToSource(projection, start, start + '正文 甲 乙'.length)
  assert.ok(mapped)
  assert.equal(source.slice(mapped.start, mapped.end), '正文 甲 乙')

  // Surrounding whitespace inside the range is trimmed away.
  const padded = mapPlainToSource(projection, start - 1, start + 2)
  assert.ok(padded)
  assert.equal(source.slice(padded.start, padded.end), '正文')

  assert.equal(mapPlainToSource(projection, -1, 2), null)
  assert.equal(mapPlainToSource(projection, 3, 3), null)
  assert.equal(mapPlainToSource(projection, 5, 2), null)
  assert.equal(mapPlainToSource(projection, 0, projection.text.length + 10), null)
  assert.equal(mapPlainToSource(projection, Number.NaN, 3), null)
})

test('applyReplacements applies descending and skips overlaps', () => {
  const source = 'abcdef'
  const both = applyReplacements(source, [
    { start: 0, end: 2, replacement: 'QQ' },
    { start: 3, end: 5, replacement: 'XY' },
  ])
  assert.equal(both.text, 'QQcXYf')
  assert.equal(both.applied.length, 2)
  assert.equal(both.skipped.length, 0)

  const overlap = applyReplacements(source, [
    { start: 1, end: 4, replacement: 'X' },
    { start: 2, end: 3, replacement: 'Y' },
  ])
  assert.equal(overlap.text, 'abYdef')
  assert.equal(overlap.applied.length, 1)
  assert.equal(overlap.applied[0].start, 2)
  assert.equal(overlap.skipped.length, 1)
  assert.equal(overlap.skipped[0].start, 1)

  const deletion = applyReplacements(source, [{ start: 1, end: 3, replacement: '' }])
  assert.equal(deletion.text, 'adef')

  const invalid = applyReplacements(source, [
    { start: -1, end: 2, replacement: 'x' },
    { start: 4, end: 2, replacement: 'x' },
    { start: 3, end: 99, replacement: 'x' },
    { start: 'a', end: 2, replacement: 'x' },
  ])
  assert.equal(invalid.text, source)
  assert.equal(invalid.applied.length, 0)
  assert.equal(invalid.skipped.length, 4)

  const adjacent = applyReplacements(source, [
    { start: 0, end: 3, replacement: 'A' },
    { start: 3, end: 6, replacement: 'B' },
  ])
  assert.equal(adjacent.text, 'AB')
  assert.equal(adjacent.applied.length, 2)

  const empty = applyReplacements(source, [])
  assert.equal(empty.text, source)
  assert.deepEqual(empty.applied, [])
})

test('findFigurePlaceholders reports whole-line ranges and parsed fields', () => {
  const source = [
    '正文',
    '[[FIGURE: p.7 | 图 3 整体架构 | 为什么需要这张图]]',
    '[[FIGURE: P12 | 图 9]]',
    '[[FIGURE: 3]]',
    '[[FIGURE: 图呢 | 无页码]]',
    '[[FIGURE:p.2|图 1|提示]]',
  ].join('\n')
  const found = findFigurePlaceholders(source)
  assert.equal(found.length, 4)
  assert.deepEqual(found.map((item) => item.page), [7, 12, 3, 2])
  assert.deepEqual(found.map((item) => item.index), [0, 1, 2, 3])
  assert.deepEqual(
    found.map((item) => item.line),
    [2, 3, 4, 6],
  )
  assert.equal(found[0].caption, '图 3 整体架构')
  assert.equal(found[0].hint, '为什么需要这张图')
  assert.equal(found[1].caption, '图 9')
  assert.equal(found[1].hint, '')
  assert.equal(source.slice(found[0].start, found[0].end), '[[FIGURE: p.7 | 图 3 整体架构 | 为什么需要这张图]]\n')
  assert.equal(source.slice(found[3].start, found[3].end), '[[FIGURE:p.2|图 1|提示]]')
  assert.ok(found.every((item) => item.end >= item.start))

  // Long captions and hints are capped, pages must be positive integers.
  const long = `[[FIGURE: p.1 | ${'图'.repeat(300)} | ${'提'.repeat(500)}]]`
  const [clipped] = findFigurePlaceholders(long)
  assert.equal(clipped.caption.length, 200)
  assert.equal(clipped.hint.length, 400)
  assert.deepEqual(findFigurePlaceholders('[[FIGURE: p.0 | 零页]]'), [])
  assert.deepEqual(findFigurePlaceholders('[[FIGURE: p.-1 | 负页]]'), [])
  assert.deepEqual(findFigurePlaceholders(''), [])
})

test('parser tolerates CRLF, tabs, unclosed markers and empty input', () => {
  const crlf = '# 标题\r\n\r\n正文 **未闭合\r\n\r\n- 项目\r\n'
  const { blocks } = parseMarkdown(crlf)
  const projection = plainProjection(blocks)
  assert.ok(!projection.text.includes('\r'))
  assert.ok(projection.text.includes('未闭合'))
  const heading = blocks.find((block) => block.type === 'heading')
  assert.equal(heading.inline[0].text, '标题')

  assert.deepEqual(parseMarkdown('').blocks, [])
  assert.deepEqual(parseMarkdown(undefined).blocks, [])
  assert.deepEqual(parseMarkdown(null).blocks, [])
  assert.deepEqual(parseMarkdown(42).blocks, [])
  // Unterminated code fence consumes the rest without throwing.
  const fence = parseMarkdown('```js\nconst a = 1\n').blocks
  assert.equal(fence.length, 1)
  assert.equal(fence[0].type, 'code')
  assert.equal(fence[0].text, 'const a = 1')
  // Empty projection is well formed.
  const empty = plainProjection([])
  assert.deepEqual(empty, { text: '', map: [] })
})

test('markdown-core region stays pasteable into the browser client', async () => {
  const source = await readFile(new URL('../lib/markdown-core.js', import.meta.url), 'utf8')
  const start = source.indexOf('// #region markdown-core')
  const end = source.indexOf('// #endregion markdown-core')
  assert.ok(start >= 0 && end > start, 'missing region markers')
  const region = source.slice(start, end)
  assert.doesNotMatch(region, /\bexport\b|\bimport\b|require\(|node:|process\.|window\.|document\.|globalThis\./)
  for (const name of [
    'parseMarkdown',
    'plainProjection',
    'locateQuote',
    'mapPlainToSource',
    'applyReplacements',
    'findFigurePlaceholders',
  ]) {
    assert.match(region, new RegExp(`function ${name}\\(`), `${name} must be declared inside the region`)
  }
})
