import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test, { after, describe } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Functional coverage for the annotation pipeline: the real markdown-core code
// inside client.js (it is embedded verbatim from lib/markdown-core.js) is
// driven through selection → annotation → highlight → revision → re-anchor.
//
// Everything here runs against the actual client.js source, so a regression in
// the embedded region fails here even if lib/markdown-core.js stays green.
// The patched copy is written to the OS temp directory, never into the repo.

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const CLIENT_FILE = path.join(ROOT, 'client.js')
const CORE_FILE = path.join(ROOT, 'lib', 'markdown-core.js')
const REGION_START = '// #region markdown-core'
const REGION_END = '// #endregion markdown-core'

const DOC = '## 方法\n\n我们使用 **自监督** 预训练，并用 [p.4] 标注来源。\n'
const QUOTE = '自监督'

/**
 * Guard: the logic under test is the copy of markdown-core embedded in
 * client.js. If that copy drifted from lib/markdown-core.js, every assertion
 * below would be testing stale code and fail in a confusing way, so check
 * parity first and name the real problem.
 */
function coreRegionOf(source) {
  const start = source.indexOf(REGION_START)
  assert.ok(start >= 0, `client.js must embed ${REGION_START}`)
  const end = source.indexOf(REGION_END, start)
  assert.ok(end >= 0, `client.js must embed ${REGION_END}`)
  return source.slice(start, end + REGION_END.length)
}

function patchClient(source) {
  const expose = `
    globalThis.__NOTE_CORE__ = {
      MarkdownDoc, parseMarkdown, plainProjection, locateQuote, mapPlainToSource,
      applyReplacements, findFigurePlaceholders, buildNoteSegments,
    }
    return {
      inject:`
  const out = source.replace('\n    return {\n      inject:', expose)
  assert.notEqual(out, source, 'client.js must still end the factory with `return { inject:`')
  return out
}

// ── environment ─────────────────────────────────────────────────────────────

const noop = () => {}
const stub = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, noop],
  useRef: (initial) => ({ current: initial }),
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  useEffect: noop,
  useLayoutEffect: noop,
  memo: (component) => component,
  forwardRef: (render) => render,
  Fragment: 'fragment',
  createContext: (value) => ({ Provider: 'provider', Consumer: 'consumer', value }),
  useContext: () => ({}),
}

globalThis.window = {
  __ModuleLoader__: { load: (definition) => { globalThis.__NOTE_DEF__ = definition } },
  innerWidth: 1400,
  addEventListener: noop,
  removeEventListener: noop,
  getSelection: () => ({ rangeCount: 0, isCollapsed: true, removeAllRanges: noop }),
  confirm: () => true,
}
globalThis.document = {
  createElement: () => ({ getContext: () => ({ drawImage: noop }), toDataURL: () => '' }),
  createRange: () => ({ selectNodeContents: noop }),
  addEventListener: noop,
  removeEventListener: noop,
  body: { style: {} },
  querySelector: () => null,
}
const storage = new Map()
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
}
globalThis.requestAnimationFrame = (fn) => fn()
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) })

const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'lr-note-functional-'))
after(() => rm(tmpDir, { recursive: true, force: true }))

const clientSource = await readFile(CLIENT_FILE, 'utf8')
const coreSource = (await readFile(CORE_FILE, 'utf8')).replace(/\r\n/g, '\n')

// Parity guard first: everything below exercises the embedded copy, so a
// drifted copy must be reported as such rather than as a mysterious assertion
// failure in an unrelated case.
const embeddedRegion = coreRegionOf(clientSource)
const referenceRegion = coreRegionOf(coreSource)
test('client.js embeds lib/markdown-core.js verbatim', () => {
  assert.equal(
    embeddedRegion,
    referenceRegion,
    'the #region markdown-core copy in client.js has drifted from lib/markdown-core.js — re-sync the paste before trusting the assertions below',
  )
})

const patchedFile = path.join(tmpDir, 'client.patched.mjs')
await writeFile(patchedFile, patchClient(clientSource), 'utf8')
await import(pathToFileURL(patchedFile).href)
globalThis.__NOTE_DEF__.factory((id) => {
  if (id === 'react') return stub
  throw new Error(`client.js must only require react, got ${id}`)
})
const T = globalThis.__NOTE_CORE__

const parse = (text) => {
  const result = T.parseMarkdown(text)
  return { blocks: result.blocks, projection: T.plainProjection(result.blocks) }
}

/** Flatten a rendered tree, invoking function components as react would. */
function walk(node, out = [], depth = 0) {
  if (node === null || node === undefined || node === false || depth > 60) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push({ text: String(node), props: {}, children: [] })
    return out
  }
  if (Array.isArray(node)) {
    for (const item of node) walk(item, out, depth)
    return out
  }
  if (typeof node.type === 'function') {
    const props = { ...(node.props || {}) }
    if (node.children && node.children.length > 0 && props.children === undefined) props.children = node.children
    walk(node.type(props), out, depth + 1)
    return out
  }
  out.push({ tag: node.type, props: node.props || {}, children: node.children || [] })
  for (const child of node.children || []) walk(child, out, depth + 1)
  return out
}
const textOf = (tree) => walk(tree).filter((node) => node.text !== undefined).map((node) => node.text).join('')

/** Render MarkdownDoc against a fresh parse of `text`. */
function renderDoc(text, annotations = []) {
  return T.MarkdownDoc({ text, parsed: parse(text), paperId: 'paper-1', annotations })
}

function marksOf(tree) {
  return walk(tree).filter((node) => String(node.props.className || '').includes('lr-ann-mark'))
}

// ── selection → source offsets ─────────────────────────────────────────────

describe('selection maps to exact source offsets', () => {
  test('the quote is present in the plain projection', () => {
    const { projection } = parse(DOC)
    assert.ok(projection.text.includes(QUOTE), `projection must contain ${QUOTE}`)
  })

  test('marker-adjacent text maps without swallowing the ** markers', () => {
    const { projection } = parse(DOC)
    const from = projection.text.indexOf(QUOTE)
    const mapped = T.mapPlainToSource(projection, from, from + QUOTE.length)
    assert.ok(mapped, 'the range must map back to source')
    assert.equal(DOC.slice(mapped.start, mapped.end), QUOTE, 'the mapped source range must exclude the emphasis markers')
  })

  test('link text maps inside the brackets', () => {
    const { projection } = parse(DOC)
    const from = projection.text.indexOf('标注来源')
    assert.ok(from >= 0, 'the link text must survive the plain projection')
    const mapped = T.mapPlainToSource(projection, from, from + 4)
    assert.ok(mapped, 'link text must map back to source')
    assert.equal(DOC.slice(mapped.start, mapped.end), '标注来源')
  })

  test('whitespace-only ranges are rejected instead of producing an empty annotation', () => {
    const { projection } = parse(DOC)
    const blanks = projection.text.search(/\n/)
    assert.ok(blanks >= 0, 'the projection must contain a blank run')
    assert.equal(
      T.mapPlainToSource(projection, blanks, blanks + 1),
      null,
      'a whitespace-only selection must not map',
    )
  })
})

// ── re-anchoring after an edit ─────────────────────────────────────────────

describe('locateQuote re-anchors after the note changes', () => {
  const { projection } = parse(DOC)
  const from = projection.text.indexOf(QUOTE)
  const mapped = T.mapPlainToSource(projection, from, from + QUOTE.length)

  test('finds the quote again when text is inserted above it', () => {
    const edited = DOC.replace('我们使用', '本文中我们使用')
    const { projection: editedProjection } = parse(edited)
    const relocated = T.locateQuote(editedProjection, {
      quote: QUOTE,
      prefix: '我们使用 **',
      suffix: '** 预训练',
      start: mapped.start,
    })
    assert.ok(relocated, 'the quote must be relocated')
    assert.equal(edited.slice(relocated.start, relocated.end), QUOTE)
    assert.equal(relocated.exact, true, 'an unambiguous match must be reported as exact')
  })

  test('reports a missing quote instead of inventing a position', () => {
    const { projection: staleProjection } = parse('## 别的章节\n\n完全无关的正文。\n')
    const relocated = T.locateQuote(staleProjection, {
      quote: QUOTE,
      prefix: '我们使用 **',
      suffix: '** 预训练',
      start: mapped.start,
    })
    assert.equal(relocated, null, 'a vanished quote must report null so the caller can mark it orphan')
  })
})

// ── revision replacements ──────────────────────────────────────────────────

describe('applyReplacements matches the host revision contract', () => {
  test('applies several non-overlapping edits', () => {
    const result = T.applyReplacements('AAA BBB CCC', [
      { start: 4, end: 7, replacement: 'X' },
      { start: 8, end: 11, replacement: 'Y' },
    ])
    assert.equal(result.text, 'AAA X Y')
    assert.equal(result.applied.length, 2)
  })

  test('skips overlapping edits rather than corrupting the body', () => {
    const result = T.applyReplacements('AAA BBB CCC', [
      { start: 0, end: 7, replacement: 'X' },
      { start: 4, end: 11, replacement: 'Y' },
    ])
    assert.equal(result.applied.length, 1, 'only the first edit may win')
    assert.equal(result.skipped.length, 1, 'the overlapping edit must be reported as skipped')
  })

  test('treats an empty replacement as a deletion', () => {
    // 'keep this' is 9 characters; [4,9) is the trailing ' this'.
    const result = T.applyReplacements('keep this', [{ start: 4, end: 9, replacement: '' }])
    assert.equal(result.text, 'keep')
    assert.equal(result.applied.length, 1)
  })

  test('rejects a range past the end of the body instead of truncating silently', () => {
    const result = T.applyReplacements('keep this', [{ start: 5, end: 10, replacement: '' }])
    assert.equal(result.text, 'keep this', 'the body must be untouched')
    assert.equal(result.skipped.length, 1, 'an out-of-range edit must be reported as skipped')
  })
})

// ── figure placeholders ────────────────────────────────────────────────────

describe('figure placeholders', () => {
  const withPlaceholder = '## 结果\n\n[[FIGURE: p.7 | 训练曲线 | 图中三条线分别是]]\n\n正文。\n'

  test('parses page, caption and hint', () => {
    const found = T.findFigurePlaceholders(withPlaceholder)
    assert.equal(found.length, 1, 'exactly one placeholder must be found')
    const [placeholder] = found
    assert.equal(placeholder.page, 7, 'the page number must be parsed')
    assert.equal(placeholder.caption, '训练曲线', 'the caption must be parsed')
    assert.match(placeholder.hint, /三条线/, 'the hint must be parsed')
  })

  test('the reported range covers the whole placeholder line', () => {
    const [placeholder] = T.findFigurePlaceholders(withPlaceholder)
    const slice = withPlaceholder.slice(placeholder.start, placeholder.end)
    assert.ok(slice.includes('[[FIGURE'), 'the range must start at the placeholder')
    assert.ok(slice.endsWith('\n'), 'the range must cover the trailing newline so replacement leaves no blank line')
  })

  test('finds every placeholder in order', () => {
    const two = 'A\n\n[[FIGURE: p.1 | 一]]\n\nB\n\n[[FIGURE: p.2 | 二]]\n'
    const found = T.findFigurePlaceholders(two)
    assert.equal(found.length, 2)
    assert.deepEqual(found.map((item) => item.page), [1, 2])
  })

  test('returns nothing when the note has no placeholders', () => {
    assert.deepEqual(T.findFigurePlaceholders('## 只有正文\n\n没有占位符。\n'), [])
  })
})

// ── highlight rendering ────────────────────────────────────────────────────

describe('annotation highlights', () => {
  const { projection } = parse(DOC)
  const from = projection.text.indexOf(QUOTE)
  const mapped = T.mapPlainToSource(projection, from, from + QUOTE.length)
  const openAnnotation = {
    id: 'x1',
    quote: QUOTE,
    start: mapped.start,
    end: mapped.end,
    note: 'n',
    color: 'mint',
    status: 'open',
  }

  test('cover exactly the annotated text in the chosen colour', () => {
    const marks = marksOf(renderDoc(DOC, [openAnnotation]))
    assert.equal(marks.length, 1, 'exactly one highlight element must wrap the quote')
    assert.equal(textOf(marks[0]), QUOTE, 'the highlight must wrap only the annotated text')
    assert.match(String(marks[0].props.className), /lr-ann-mint/, 'the highlight must use the annotation colour')
  })

  test('carry the annotation id so 定位 can find them', () => {
    const [mark] = marksOf(renderDoc(DOC, [openAnnotation]))
    assert.equal(mark.props['data-ann'], 'x1', 'the highlight must expose data-ann for scroll-to')
  })

  test('are numbered so the bubble matches the rail', () => {
    const bubbles = walk(renderDoc(DOC, [openAnnotation])).filter((node) =>
      String(node.props.className || '').includes('lr-ann-seq'),
    )
    assert.ok(bubbles.length > 0, 'the highlight must carry a numbered bubble')
    assert.match(textOf(bubbles[0]) || '1', /1/, 'the first annotation must be numbered 1')
  })

  test('are skipped for orphaned annotations (they have no valid anchor)', () => {
    const marks = marksOf(renderDoc(DOC, [{ ...openAnnotation, status: 'orphan' }]))
    assert.deepEqual(marks, [], 'an orphan must not be highlighted anywhere')
  })

  test('still highlight resolved annotations, marked as is-resolved', () => {
    // Spec §9.2 keeps all three rail groups live: a resolved annotation must
    // stay locatable and clickable in the body, so the highlight remains and
    // only its styling is muted (client.js marks it `is-resolved`).
    const marks = marksOf(renderDoc(DOC, [{ ...openAnnotation, status: 'resolved' }]))
    assert.equal(marks.length, 1, 'a resolved annotation keeps its highlight')
    assert.equal(textOf(marks[0]), QUOTE)
    assert.match(
      String(marks[0].props.className),
      /\bis-resolved\b/,
      'a resolved highlight must carry is-resolved so CSS can mute it',
    )
  })

  test('an open highlight is not marked is-resolved', () => {
    const [mark] = marksOf(renderDoc(DOC, [openAnnotation]))
    assert.doesNotMatch(String(mark.props.className), /\bis-resolved\b/)
  })

  test('fail safe when the range no longer fits the document', () => {
    assert.doesNotThrow(() => {
      renderDoc(DOC, [{ ...openAnnotation, start: 9999, end: 10005 }])
    }, 'an out-of-range annotation must be ignored, not thrown')
    const marks = marksOf(renderDoc(DOC, [{ ...openAnnotation, start: 9999, end: 10005 }]))
    assert.deepEqual(marks, [], 'an unresolvable range must render no highlight')
  })
})

// ── overlapping annotations ────────────────────────────────────────────────

describe('overlapping annotations', () => {
  const first = { ann: { id: 'a', color: 'amber', status: 'open' }, number: 1, plainStart: 1, plainEnd: 6 }
  const second = { ann: { id: 'b', color: 'sky', status: 'open' }, number: 2, plainStart: 4, plainEnd: 9 }

  test('split into contiguous segments that never lose text', () => {
    const segments = T.buildNoteSegments([first, second])
    let previous = null
    let covered = 0
    for (const segment of segments) {
      if (previous !== null) {
        assert.equal(segment.start, previous, 'segments must be contiguous with no gap or overlap')
      }
      previous = segment.end
      covered += segment.end - segment.start
    }
    assert.equal(covered, 8, 'the union of [1,6) and [4,9) must cover exactly 8 characters')
  })

  test('give the overlap to the later annotation', () => {
    const segments = T.buildNoteSegments([first, second])
    // Adjacent segments owned by the same annotation are merged, so the second
    // annotation owns [4,9) as one run rather than a fragmented pair.
    const overlapping = segments.filter((segment) => segment.start <= 4 && segment.end >= 6)
    assert.ok(overlapping.length > 0, 'the overlap must be covered by some segment')
    assert.ok(
      overlapping.every((segment) => segment.entry.ann.id === 'b'),
      'the later annotation must own the overlapping characters',
    )
  })

  test('render both annotations without throwing', () => {
    const text = 'abcdefghij'
    const { projection } = parse(text)
    assert.ok(projection.text.length >= 10, 'the test document must be long enough')
    const tree = T.MarkdownDoc({
      text,
      parsed: parse(text),
      paperId: 'paper-1',
      annotations: [
        { id: 'a', quote: 'bcdef', start: 1, end: 6, note: '', color: 'amber', status: 'open' },
        { id: 'b', quote: 'efghi', start: 4, end: 9, note: '', color: 'sky', status: 'open' },
      ],
    })
    assert.doesNotThrow(() => walk(tree), 'overlapping highlights must render without recursion or throw')
  })
})

// ── figure image rewriting ─────────────────────────────────────────────────

describe('figure images in the note body', () => {
  const withImage = '## 图\n\n![图 1 曲线](_附件/paper-1/fig-p01-01.png)\n'

  test('render the attachment path as a served figure URL', () => {
    const images = walk(renderDoc(withImage)).filter((node) => node.tag === 'img')
    assert.equal(images.length, 1, 'the figure must render as one image')
    assert.equal(
      images[0].props.src,
      '/literature-reader/api/papers/paper-1/figure/fig-p01-01.png',
      'the _附件/ path must be rewritten to the served figure URL',
    )
  })

  test('keep the caption as the alt text', () => {
    const [image] = walk(renderDoc(withImage)).filter((node) => node.tag === 'img')
    assert.match(String(image.props.alt), /图 1 曲线/, 'the caption must survive as alt text')
  })
})

// ── citation jumps ─────────────────────────────────────────────────────────

describe('citation buttons', () => {
  test('render [p.X] as a button that reports the page number', () => {
    const calls = []
    const tree = T.MarkdownDoc({
      text: DOC,
      parsed: parse(DOC),
      paperId: 'paper-1',
      annotations: [],
      onCite: (page) => calls.push(page),
    })
    const cites = walk(tree).filter((node) => String(node.props.className || '').includes('lr-note-cite'))
    assert.equal(cites.length, 1, 'the single [p.4] must render one citation button')
    assert.match(textOf(cites[0]), /p\.4/, 'the button must keep the citation text')
    cites[0].props.onClick({ stopPropagation: noop })
    assert.deepEqual(calls, [4], 'clicking the citation must report page 4 to the reader')
  })

  test('render several citations independently', () => {
    const text = '结论见 [p.2] 与 [p.11]。\n'
    const calls = []
    const tree = T.MarkdownDoc({
      text,
      parsed: parse(text),
      paperId: 'paper-1',
      annotations: [],
      onCite: (page) => calls.push(page),
    })
    const cites = walk(tree).filter((node) => String(node.props.className || '').includes('lr-note-cite'))
    assert.equal(cites.length, 2)
    for (const cite of cites) cite.props.onClick({ stopPropagation: noop })
    assert.deepEqual(calls, [2, 11])
  })
})

// ── callouts and structure ─────────────────────────────────────────────────

describe('structural rendering', () => {
  test('renders a callout with its kind and body', () => {
    const text = '> [!warning] 注意\n> 这里有个坑。\n'
    const tree = renderDoc(text)
    const classes = walk(tree).map((node) => String(node.props.className || '')).join(' ')
    assert.match(classes, /lr-note-callout/, 'the callout must use the callout class')
    assert.match(textOf(tree), /这里有个坑/, 'the callout body must be rendered')
  })

  test('keeps the callout title out of the body text', () => {
    const text = '> [!abstract] 速览\n> 一句话总结。\n'
    const rendered = textOf(renderDoc(text))
    assert.ok(rendered.includes('速览'), 'the callout title must be shown')
    assert.ok(rendered.includes('一句话总结'), 'the callout body must be shown')
    assert.ok(!rendered.includes('[!abstract]'), 'the raw marker must not leak into the output')
  })

  test('never leaks markdown syntax into the preview', () => {
    const text = '## 标题\n\n**粗体** 与 `代码` 与 [链接](https://example.com)。\n'
    const rendered = textOf(renderDoc(text))
    assert.ok(!rendered.includes('##'), 'heading markers must not leak')
    assert.ok(!rendered.includes('**'), 'emphasis markers must not leak')
    assert.ok(!rendered.includes(']('), 'link syntax must not leak')
  })

  test('an empty document renders without throwing', () => {
    assert.doesNotThrow(() => renderDoc(''))
    assert.doesNotThrow(() => renderDoc('   \n\n  \n'))
  })
})
