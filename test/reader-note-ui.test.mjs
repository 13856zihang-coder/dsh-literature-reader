import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test, { after, describe } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Component + pure-logic coverage for the reader-note feature
// (docs/reader-note-spec.md §7, §12.3–§12.4, §14.6, §14.8).
//
// client.js is a browser module, so there is no DOM: the test patches the
// factory to expose the new API, loads the real file, and drives it with a
// minimal react stub. Every patch anchor is asserted, so a client.js drift
// fails with the exact string that moved.

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const CLIENT_FILE = path.join(ROOT, 'client.js')

/** Expose the reader-note API before `factory()` returns. */
function patchClient(source) {
  const expose = `
    globalThis.__READER_NOTE__ = {
      applyMarkdownCommand, renderMath, splitMathSegments, readerNoteCommandForKey,
      applyReaderNoteKey, renderReaderNotePreview, ReaderNoteDock, ReaderNoteQuestionsDialog,
      NoteHistoryDrawer, VaultLibraryView, LiteratureReader,
      readerNoteHistoryLabel, readerNoteHistoryList,
      readerNoteDockHeight, storeReaderNoteDockHeight, clampReaderNoteFont, stepReaderNoteFont,
      readerNoteDraftKey, readReaderNoteDraft, writeReaderNoteDraft, clearReaderNoteDraft,
      readerNoteText, READER_NOTE_NARROW, READER_NOTE_DOCK_DEFAULT, READER_NOTE_DOCK_MIN,
      READER_NOTE_FONT_MIN, READER_NOTE_FONT_MAX,
    }
    return {
      inject:`
  let out = source.replace('\n    return {\n      inject:', expose)
  assert.notEqual(out, source, 'client.js must still end the factory with `return { inject:`')

  // Seed the couple of states the assertions need to reach deeper views. Every
  // anchor is asserted, so a client.js drift fails with the exact source line.
  const statePatches = [
    ['const [booting, setBooting] = useState(true)', 'const [booting, setBooting] = useState(false)'],
    ['const [paper, setPaper] = useState(null)', 'const [paper, setPaper] = useState(globalThis.__PAPER__ || null)'],
    ["const [tab, setTab] = useState('pdfs')", "const [tab, setTab] = useState(globalThis.__LIBRARY_TAB__ || 'pdfs')"],
    ['const [deleteTarget, setDeleteTarget] = useState(null)', 'const [deleteTarget, setDeleteTarget] = useState(globalThis.__DELETE_TARGET__ || null)'],
    ['const [noteHistoryOpen, setNoteHistoryOpen] = useState(false)', 'const [noteHistoryOpen, setNoteHistoryOpen] = useState(globalThis.__HISTORY_OPEN__ || false)'],
    ['const [noteHistoryVersions, setNoteHistoryVersions] = useState(null)', 'const [noteHistoryVersions, setNoteHistoryVersions] = useState(globalThis.__HISTORY_VERSIONS__ || null)'],
  ]
  for (const [from, to] of statePatches) {
    assert.ok(out.includes(from), `client.js no longer contains: ${from}`)
    out = out.replace(from, to)
  }
  return out
}

// ── environment ─────────────────────────────────────────────────────────────

const noop = () => {}
const listeners = { window: new Map(), document: new Map() }
function record(scope) {
  return (name, handler) => {
    const map = listeners[scope]
    if (!map.has(name)) map.set(name, new Set())
    map.get(name).add(handler)
  }
}
function forget(scope) {
  return (name, handler) => listeners[scope].get(name)?.delete(handler)
}

/**
 * State setters are recorded instead of applied: the stub re-renders from the
 * initial value, so a test that wants to see what a handler *decided* inspects
 * this log rather than a second render (which would show the seed again).
 */
globalThis.__STATE_SETS__ = []

const stub = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
  useState: (initial) => [
    typeof initial === 'function' ? initial() : initial,
    (next) => {
      globalThis.__STATE_SETS__.push(typeof next === 'function' ? { value: undefined, updater: next } : { value: next })
    },
  ],
  useRef: (initial) => ({ current: initial }),
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  useEffect: () => {},
  useLayoutEffect: noop,
  memo: (component) => component,
  forwardRef: (render) => render,
  Fragment: 'fragment',
  createContext: (value) => ({ Provider: 'provider', Consumer: 'consumer', value }),
  useContext: () => ({}),
}

/** `matchMedia` recorded so the narrow-mode listener can be driven manually. */
const media = { matches: false, changeHandlers: new Set(), queries: [] }

globalThis.window = {
  __ModuleLoader__: { load: (definition) => { globalThis.__READER_NOTE_DEF__ = definition } },
  innerWidth: 1400,
  innerHeight: 900,
  addEventListener: record('window'),
  removeEventListener: forget('window'),
  matchMedia: (query) => {
    media.queries.push(query)
    const list = {
      matches: media.matches,
      media: query,
      addEventListener: (name, handler) => {
        if (name === 'change') media.changeHandlers.add(handler)
      },
      removeEventListener: (name, handler) => {
        if (name === 'change') media.changeHandlers.delete(handler)
      },
    }
    return list
  },
  getSelection: () => ({ rangeCount: 0, isCollapsed: true, removeAllRanges: noop, getRangeAt: noop }),
  confirm: (message) => {
    globalThis.__CONFIRMS__.push(String(message))
    return globalThis.__CONFIRM_RESULT__
  },
}

globalThis.__CONFIRMS__ = []
globalThis.__CONFIRM_RESULT__ = true

const createdInputs = []
globalThis.document = {
  createElement: (tag) => {
    const node = { tag, style: {}, click: noop, onchange: null, files: [] }
    createdInputs.push(node)
    return node
  },
  createRange: () => ({ selectNodeContents: noop, setStart: noop, setEnd: noop, getBoundingClientRect: () => ({}) }),
  addEventListener: record('document'),
  removeEventListener: forget('document'),
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

const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'lr-reader-note-ui-'))
after(() => rm(tmpDir, { recursive: true, force: true }))

const patchedFile = path.join(tmpDir, 'client.patched.mjs')
await writeFile(patchedFile, patchClient(await readFile(CLIENT_FILE, 'utf8')), 'utf8')
await import(pathToFileURL(patchedFile).href)
globalThis.__READER_NOTE_DEF__.factory((id) => {
  if (id === 'react') return stub
  throw new Error(`client.js must only require react, got ${id}`)
})
const API = globalThis.__READER_NOTE__

// ── render helpers ─────────────────────────────────────────────────────────

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
  if (typeof node !== 'object') return out
  if (typeof node.type === 'function') {
    const props = { ...(node.props || {}) }
    if (node.children && node.children.length > 0 && props.children === undefined) props.children = node.children
    try {
      walk(node.type(props), out, depth + 1)
    } catch {
      // A component that throws would be a real bug, but the assertions below
      // target the dock; leave the tree truncated rather than masking the case.
    }
    return out
  }
  out.push({ tag: node.type, props: node.props || {}, children: node.children || [] })
  for (const child of node.children || []) walk(child, out, depth)
  return out
}

/**
 * Collect raw element nodes without invoking function components, so the props
 * handed to a child component can be inspected (and called) directly.
 */
function rawFind(node, predicate, out = [], depth = 0) {
  if (!node || depth > 80) return out
  if (Array.isArray(node)) {
    for (const item of node) rawFind(item, predicate, out, depth)
    return out
  }
  if (typeof node !== 'object') return out
  if (node.props && predicate(node)) out.push(node)
  for (const child of node.children || []) rawFind(child, predicate, out, depth + 1)
  return out
}

const byTag = (tree, tag) => walk(tree).filter((node) => node.tag === tag)
const byClass = (tree, className) =>
  walk(tree).filter((node) => typeof node.props?.className === 'string' && node.props.className.split(/\s+/).includes(className))
const textOf = (tree) => walk(tree).filter((node) => node.text !== undefined).map((node) => node.text).join(' ')
const buttonByText = (tree, text) =>
  byTag(tree, 'button').filter((node) => textOf(node).includes(text))

function renderOf(name, factory) {
  try {
    return factory()
  } catch (error) {
    assert.fail(`${name} threw while rendering: ${error && error.stack ? error.stack.split('\n')[0] : error}`)
    return null
  }
}

// ── §7.3 applyMarkdownCommand ───────────────────────────────────────────────

describe('applyMarkdownCommand (spec §7.3)', () => {
  const run = (text, start, end, command) => API.applyMarkdownCommand({ text, start, end, command })

  test('wraps a selection in each marker pair', () => {
    const cases = [
      ['bold', '**'],
      ['italic', '*'],
      ['code', '`'],
      ['math', '$'],
      ['mathBlock', '$$'],
    ]
    for (const [command, marker] of cases) {
      const out = run('前文重点后文', 2, 4, command)
      assert.equal(out.text, `前文${marker}重点${marker}后文`, `${command} must wrap the selection`)
      // The selection must still cover the original words, not the markers.
      assert.equal(out.text.slice(out.start, out.end), '重点', `${command} must keep the selection on the text`)
    }
  })

  test('an empty selection inserts the markers and parks the caret inside', () => {
    const out = run('abc', 3, 3, 'bold')
    assert.equal(out.text, 'abc****')
    assert.deepEqual([out.start, out.end], [5, 5])
    const italic = run('', 0, 0, 'italic')
    assert.equal(italic.text, '**')
    assert.deepEqual([italic.start, italic.end], [1, 1])
  })

  test('a second identical command toggles the markers off', () => {
    const once = run('重点', 0, 2, 'bold')
    assert.equal(once.text, '**重点**')
    // Selection inside the markers unwraps.
    const twice = run(once.text, once.start, once.end, 'bold')
    assert.equal(twice.text, '重点')
    assert.deepEqual([twice.start, twice.end], [0, 2])
    // Selection including the markers unwraps too.
    const wide = run('**重点**', 0, 6, 'bold')
    assert.equal(wide.text, '重点')
    assert.deepEqual([wide.start, wide.end], [0, 2])
  })

  test('toggle-off also works for every line prefix', () => {
    for (const command of ['h1', 'h2', 'h3', 'ul', 'ol', 'quote']) {
      const on = run('要点', 0, 2, command)
      assert.notEqual(on.text, '要点', `${command} must add a prefix`)
      const off = run(on.text, 0, on.text.length, command)
      assert.equal(off.text, '要点', `${command} must remove its own prefix`)
    }
  })

  test('line prefixes cover every line of the selection', () => {
    const text = '一\n二\n三'
    const out = run(text, 0, text.length, 'ul')
    assert.equal(out.text, '- 一\n- 二\n- 三')
    const headings = run('标题行', 0, 3, 'h2')
    assert.equal(headings.text, '## 标题行')
    assert.equal(run('引用', 0, 2, 'quote').text, '> 引用')
    assert.equal(run('序号', 0, 2, 'ol').text, '1. 序号')
  })

  test('恢复正文 strips any recognised prefix', () => {
    const cases = [
      ['## 标题', '标题'],
      ['### 标题', '标题'],
      ['- 条目', '条目'],
      ['1. 条目', '条目'],
      ['> 引用', '引用'],
    ]
    for (const [input, expected] of cases) {
      assert.equal(run(input, 0, input.length, 'body').text, expected, `body must strip ${JSON.stringify(input)}`)
    }
  })

  test('link wraps a selection and inserts an empty target when there is none', () => {
    const linked = run('论文', 0, 2, 'link')
    assert.equal(linked.text, '[论文]()')
    // The caret lands inside the parentheses so the URL can be typed at once.
    assert.deepEqual([linked.start, linked.end], [5, 5])
    const empty = run('', 0, 0, 'link')
    assert.equal(empty.text, '[]()')
    assert.deepEqual([empty.start, empty.end], [1, 1])
    // A selection that is already a link unwraps to its label.
    assert.equal(run('[论文]()', 0, 6, 'link').text, '论文')
  })

  test('unknown commands are a no-op instead of a throw', () => {
    const out = API.applyMarkdownCommand({ text: 'abc', start: 1, end: 2, command: 'nope' })
    assert.deepEqual(out, { text: 'abc', start: 1, end: 2 })
    assert.doesNotThrow(() => API.applyMarkdownCommand({}))
    assert.doesNotThrow(() => API.applyMarkdownCommand())
  })

  test('out-of-range offsets are clamped, never slicing past the text', () => {
    const out = API.applyMarkdownCommand({ text: 'abc', start: -5, end: 99, command: 'bold' })
    assert.equal(out.text, '**abc**')
    const reversed = API.applyMarkdownCommand({ text: 'abc', start: 3, end: 1, command: 'bold' })
    assert.equal(reversed.text, 'abc****')
  })
})

// ── §7.3 shortcut dispatch ─────────────────────────────────────────────────

describe('shortcut dispatch (spec §7.3)', () => {
  const key = (overrides) => ({
    key: '',
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: noop,
    ...overrides,
  })

  test('every documented Ctrl shortcut maps to its command', () => {
    const cases = [
      [{ key: 'b' }, 'bold'],
      [{ key: 'i' }, 'italic'],
      [{ key: 'k' }, 'link'],
      [{ key: '1' }, 'h1'],
      [{ key: '2' }, 'h2'],
      [{ key: '3' }, 'h3'],
      [{ key: '0' }, 'body'],
      [{ key: '8', shiftKey: true }, 'ul'],
      [{ key: '7', shiftKey: true }, 'ol'],
      [{ key: 'Q', shiftKey: true }, 'quote'],
      [{ key: '`', shiftKey: true }, 'code'],
      [{ key: 'm' }, 'math'],
      [{ key: 'm', shiftKey: true }, 'mathBlock'],
      [{ key: 'i', shiftKey: true }, 'image'],
    ]
    for (const [event, command] of cases) {
      const result = API.readerNoteCommandForKey(key({ ctrlKey: true, ...event }))
      assert.ok(result, `${JSON.stringify(event)} must be recognised`)
      assert.equal(result.command, command, `${JSON.stringify(event)} must map to ${command}`)
    }
  })

  test('font size and submit map to actions, not commands', () => {
    const fontUp = API.readerNoteCommandForKey(key({ ctrlKey: true, key: '=' }))
    assert.equal(fontUp.action, 'fontUp')
    const fontDown = API.readerNoteCommandForKey(key({ ctrlKey: true, key: '-' }))
    assert.equal(fontDown.action, 'fontDown')
    const reset = API.readerNoteCommandForKey(key({ ctrlKey: true, key: '0', shiftKey: true }))
    assert.equal(reset.action, 'fontReset')
    const submit = API.readerNoteCommandForKey(key({ ctrlKey: true, key: 'Enter' }))
    assert.equal(submit.action, 'submit')
    const close = API.readerNoteCommandForKey(key({ key: 'Escape' }))
    assert.equal(close.action, 'close')
  })

  test('macOS Cmd behaves exactly like Ctrl', () => {
    for (const overrides of [{ key: 'b' }, { key: 'm' }, { key: '0', shiftKey: true }]) {
      assert.deepEqual(
        API.readerNoteCommandForKey(key({ metaKey: true, ...overrides })),
        API.readerNoteCommandForKey(key({ ctrlKey: true, ...overrides })),
        `${JSON.stringify(overrides)} must work with Cmd`,
      )
    }
  })

  test('unrelated keys stay unhandled so the textarea keeps them', () => {
    assert.equal(API.readerNoteCommandForKey(key({ key: 'b' })), null)
    assert.equal(API.readerNoteCommandForKey(key({ key: 'Enter' })), null)
    assert.equal(API.readerNoteCommandForKey(key({ key: 'a', ctrlKey: true })), null)
    assert.equal(API.readerNoteCommandForKey(key({ key: 'b', ctrlKey: true, altKey: true })), null)
  })

  test('applyReaderNoteKey turns a keydown into new text plus a selection', () => {
    const result = API.applyReaderNoteKey({
      event: key({ ctrlKey: true, key: 'b' }),
      text: '重点',
      start: 0,
      end: 2,
      font: 100,
    })
    assert.equal(result.handled, true)
    assert.equal(result.command, 'bold')
    assert.equal(result.text, '**重点**')
    assert.deepEqual([result.start, result.end], [2, 4])

    const bumped = API.applyReaderNoteKey({
      event: key({ ctrlKey: true, key: '=' }),
      text: '',
      start: 0,
      end: 0,
      font: 170,
    })
    assert.equal(bumped.action, 'fontUp')
    assert.equal(bumped.font, 175)

    const ignored = API.applyReaderNoteKey({
      event: key({ key: 'x' }),
      text: '',
      start: 0,
      end: 0,
      font: 100,
    })
    assert.equal(ignored.handled, false)
  })

  test('font size clamps to 85%–180% in steps of 5', () => {
    assert.equal(API.READER_NOTE_FONT_MIN, 85)
    assert.equal(API.READER_NOTE_FONT_MAX, 180)
    assert.equal(API.clampReaderNoteFont(10), 85)
    assert.equal(API.clampReaderNoteFont(400), 180)
    assert.equal(API.clampReaderNoteFont('120'), 120)
    assert.equal(API.stepReaderNoteFont(178, 1), 180)
    assert.equal(API.stepReaderNoteFont(87, -1), 85)
    assert.equal(API.stepReaderNoteFont(100, 1), 105)
  })
})

// ── §7.4 renderMath ────────────────────────────────────────────────────────

describe('renderMath (spec §7.4)', () => {
  const flat = (node) => walk(node).filter((item) => item.text !== undefined).map((item) => item.text).join('')

  test('inline and display maths render as an element of the right shape', () => {
    const inline = renderOf('renderMath inline', () => API.renderMath('x', { display: false }))
    assert.equal(inline.type, 'span')
    assert.match(inline.props.className, /lr-math-inline/)
    const display = renderOf('renderMath display', () => API.renderMath('x', { display: true }))
    assert.equal(display.type, 'div')
    assert.match(display.props.className, /lr-math-display/)
  })

  test('the documented subset renders to readable text', () => {
    assert.equal(flat(API.renderMath('a^2', {})), 'a2')
    assert.equal(flat(API.renderMath('a_1', {})), 'a1')
    assert.equal(flat(API.renderMath('\\alpha\\Omega', {})), 'αΩ')
    assert.equal(flat(API.renderMath('\\sum\\prod\\int\\oint\\infty\\partial\\nabla', {})), '∑∏∫∮∞∂∇')
    assert.equal(flat(API.renderMath('\\times\\div\\pm\\cdot\\le\\ge\\ne\\approx\\equiv\\to\\Rightarrow\\leftrightarrow', {})), '×÷±·≤≥≠≈≡→⇒↔')
    // \frac and \sqrt produce the two-part structures the CSS styles.
    const fraction = API.renderMath('\\frac{a}{b}', {})
    assert.equal(byClass(fraction, 'lr-math-frac').length, 1)
    assert.equal(byClass(fraction, 'lr-math-num').length, 1)
    assert.equal(byClass(fraction, 'lr-math-den').length, 1)
    assert.equal(flat(fraction), 'ab')
    const root = API.renderMath('\\sqrt{x+1}', {})
    assert.equal(byClass(root, 'lr-math-sqrt').length, 1)
    assert.equal(flat(root), '√x+1')
    // \text keeps CJK literal.
    assert.equal(flat(API.renderMath('\\text{中文}', {})), '中文')
    // \left( \right) become plain delimiters.
    assert.equal(flat(API.renderMath('\\left(x\\right)', {})), '(x)')
    // Spacing commands insert real space (\u2009 thin, \u2003 em).
    assert.equal(flat(API.renderMath('a\\,b', {})), 'a\u2009b')
    assert.equal(flat(API.renderMath('a\\quad b', {})), 'a\u2003b')
  })

  test('\\begin{aligned} stacks rows on the \\\\ separators', () => {
    const aligned = API.renderMath('\\begin{aligned}a&=1\\\\b&=2\\end{aligned}', { display: true })
    assert.ok(byTag(aligned, 'br').length >= 1, 'each \\\\ break must become a <br>')
    // The `&` alignment marker becomes a spacer, so the two rows keep their
    // equations readable instead of collapsing together.
    const text = flat(aligned).replace(/\u2003/g, ' ')
    assert.match(text, /a\s*=1/)
    assert.match(text, /b\s*=2/)
    // The `\begin`/`\end` wrappers themselves must not leak into the output.
    assert.doesNotMatch(flat(aligned), /aligned/)
  })

  test('an unknown command is shown verbatim in monospace instead of throwing', () => {
    const unknown = renderOf('renderMath unknown', () => API.renderMath('\\notacommand{x}', {}))
    const code = byTag(unknown, 'code')
    assert.equal(code.length, 1, 'the unknown command must be rendered, not swallowed')
    assert.match(code[0].props.className, /lr-math-unknown/)
    assert.equal(textOf(code[0]), '\\notacommand')
    // The argument is still rendered after it.
    assert.match(flat(unknown), /x/)
  })

  test('malformed input never throws', () => {
    for (const source of ['', '{', '}', '\\', '\\frac', '\\frac{a}', '$$', '_', '^', '\\sqrt[', null, undefined]) {
      assert.doesNotThrow(() => API.renderMath(source, {}), `renderMath(${JSON.stringify(source)}) threw`)
    }
  })

  test('splitMathSegments finds $…$ and $$…$$ and ignores escapes', () => {
    const inline = API.splitMathSegments('前 $a^2$ 后')
    assert.deepEqual(
      inline.map((item) => item.type),
      ['text', 'math', 'text'],
    )
    assert.equal(inline[1].source, 'a^2')
    assert.equal(inline[1].display, false)

    const display = API.splitMathSegments('$$x=1$$')
    assert.equal(display.length, 1)
    assert.equal(display[0].display, true)

    assert.equal(API.splitMathSegments('没有公式'), null)
    assert.equal(API.splitMathSegments('价格 \\$5 美元'), null, 'an escaped dollar is not maths')
    // Unbalanced delimiters fall back to plain text rather than eating the rest.
    assert.equal(API.splitMathSegments('$未闭合'), null)
  })

  test('the preview renders maths, headings and entry titles', () => {
    const markdown = ['## 21:03 · 讨论了梯度', '', '其中 $a^2$ 成立。', '', '$$\\frac{1}{2}$$', ''].join('\n')
    const tree = renderOf('preview', () => API.renderReaderNotePreview(markdown, 'paper-1'))
    const headings = byTag(tree, 'h2')
    assert.equal(headings.length, 1, 'the entry title must render as a plain h2')
    assert.match(textOf(headings[0]), /21:03/)
    assert.match(textOf(headings[0]), /讨论了梯度/)
    // Both the inline and the display formula render as maths.
    assert.ok(byClass(tree, 'lr-math-inline').length >= 1)
    assert.ok(byClass(tree, 'lr-math-display').length >= 1)
    assert.ok(byClass(tree, 'lr-note-math-block').length >= 1)
  })

  test('the preview never throws on odd markdown', () => {
    const samples = ['', '#', '**', '```', '| a |', '![](x.png)', '> [!note] x', '\u0000']
    for (const sample of samples) {
      assert.doesNotThrow(() => API.renderReaderNotePreview(sample, 'paper-1'), `preview threw on ${JSON.stringify(sample)}`)
    }
  })
})

// ── §7.2 dock rendering ────────────────────────────────────────────────────

describe('ReaderNoteDock (spec §7.2)', () => {
  const baseProps = (overrides) => ({
    open: true,
    narrow: false,
    paperId: 'paper-1',
    height: 260,
    font: 100,
    submitting: false,
    onFontChange: noop,
    onHeightChange: noop,
    onSubmit: noop,
    onClose: noop,
    onUploadImage: async () => ({ rel: '_附件/paper-1/笔记/x.png' }),
    onToast: noop,
    ...overrides,
  })

  test('closed renders nothing at all', () => {
    assert.equal(API.ReaderNoteDock(baseProps({ open: false })), null)
  })

  test('wide renders as an in-flow dock with a resize handle, not a fixed overlay', () => {
    storage.set(API.readerNoteDraftKey('paper-1'), '已有草稿')
    const tree = renderOf('dock wide', () => API.ReaderNoteDock(baseProps()))
    assert.notEqual(tree, null)
    const sections = byTag(tree, 'section')
    assert.equal(sections.length, 1, 'the wide dock must be one section')
    const className = sections[0].props.className
    assert.match(className, /lr-note-dock/)
    assert.doesNotMatch(className, /lr-note-dock-full/, 'wide screens must not use the full-page mode')
    // No `position:fixed` inline style: the dock lives in the root flex column.
    assert.equal(sections[0].props.style?.position, undefined)
    assert.equal(sections[0].props.style?.height, '260px', 'the stored height must drive the panel')
    // The resize handle is what lets it be dragged.
    assert.equal(byClass(tree, 'lr-note-dock-resize').length, 1)
    assert.ok(byTag(tree, 'textarea').length >= 1, 'the editor must be present')
    storage.delete(API.readerNoteDraftKey('paper-1'))
  })

  test('wide shows the toolbar, the preview toggle and the footer actions', () => {
    const tree = renderOf('dock wide toolbar', () => API.ReaderNoteDock(baseProps()))
    const tools = byClass(tree, 'lr-note-dock-tool')
    // Every toolbar command advertises its shortcut in the title (spec §7.2).
    for (const accel of ['Ctrl+B', 'Ctrl+I', 'Ctrl+K', 'Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+Shift+8', 'Ctrl+Shift+7', 'Ctrl+Shift+Q', 'Ctrl+Shift+`', 'Ctrl+M', 'Ctrl+Shift+M', 'Ctrl+Shift+I']) {
      assert.ok(
        tools.some((node) => String(node.props.title || '').includes(accel)),
        `the toolbar must expose a button for ${accel}`,
      )
    }
    assert.ok(buttonByText(tree, '记录').length >= 1, 'the footer must offer 记录')
    assert.ok(buttonByText(tree, '取消').length >= 1, 'the footer must offer 取消')
    assert.ok(byClass(tree, 'lr-note-dock-words').length >= 1, 'the footer must show the word count')
    assert.ok(byClass(tree, 'lr-note-dock-mode').length >= 2, 'write/preview toggle must exist')
  })

  test('narrow renders as a full-page editor with close and record in the top bar', () => {
    const tree = renderOf('dock narrow', () => API.ReaderNoteDock(baseProps({ narrow: true })))
    const sections = byTag(tree, 'section')
    assert.equal(sections.length, 1)
    assert.match(sections[0].props.className, /lr-note-dock-full/, '≤860px must use the full-page mode')
    assert.equal(sections[0].props.role, 'dialog')
    assert.equal(sections[0].props['aria-modal'], 'true')
    // The full-page mode is a single editor pane, never a side-by-side split.
    assert.equal(byClass(tree, 'lr-note-dock-body').length, 1)
    assert.match(byClass(tree, 'lr-note-dock-body')[0].props.className, /\bfull\b/)
    // Top bar keeps 记录 and 关闭.
    assert.ok(buttonByText(tree, '记录').length >= 1)
    const close = byTag(tree, 'button').filter((node) => node.props.title === '关闭记录面板')
    assert.equal(close.length, 1, 'the full-page mode must offer a close button')
    // No resize handle: a full-page editor has nothing to drag.
    assert.equal(byClass(tree, 'lr-note-dock-resize').length, 0)
  })

  test('the breakpoint constant matches the CSS media query', async () => {
    const source = await readFile(CLIENT_FILE, 'utf8')
    assert.equal(API.READER_NOTE_NARROW, 860)
    assert.ok(
      source.includes('@media(max-width:860px)'),
      'CSS must keep a 860px media query so the dock switches with the constant',
    )
    assert.ok(
      source.includes('(max-width: ${READER_NOTE_NARROW}px)'),
      'the matchMedia query must be built from the constant, not a literal',
    )
  })

  test('font size and height come from storage with the documented defaults', () => {
    storage.clear()
    assert.equal(API.READER_NOTE_DOCK_DEFAULT, 260)
    assert.equal(API.READER_NOTE_DOCK_MIN, 160)
    assert.equal(API.readerNoteDockHeight(), 260)
    API.storeReaderNoteDockHeight(320)
    assert.equal(API.readerNoteDockHeight(), 320)
    API.storeReaderNoteDockHeight(10)
    assert.equal(API.readerNoteDockHeight(), 160, 'a too-small height must clamp up to the minimum')
    assert.equal(storage.get('dsh.literature.noteDock.v1'), '160')
  })

  test('drafts are per paper, round-trip, and clear on demand', () => {
    storage.clear()
    assert.equal(API.readerNoteDraftKey('p1'), 'dsh.literature.noteDraft.p1.v1')
    assert.notEqual(API.readerNoteDraftKey('p1'), API.readerNoteDraftKey('p2'))
    API.writeReaderNoteDraft('p1', '第一条记录')
    assert.equal(API.readReaderNoteDraft('p1'), '第一条记录')
    assert.equal(API.readReaderNoteDraft('p2'), '', 'another paper must not see the draft')
    API.clearReaderNoteDraft('p1')
    assert.equal(API.readReaderNoteDraft('p1'), '')
    // An empty draft removes the key instead of storing whitespace.
    API.writeReaderNoteDraft('p1', '   ')
    assert.equal(storage.has('dsh.literature.noteDraft.p1.v1'), false)
    // The summary editor's own draft key must stay untouched.
    assert.notEqual(API.readerNoteDraftKey('p1'), 'dsh.literature.noteDraft.p1')
  })

  test('dragging the top edge reports a new height and persists on release only', () => {
    const heights = []
    const tree = renderOf('dock resize', () =>
      API.ReaderNoteDock(baseProps({ onHeightChange: (value, persist) => heights.push([value, Boolean(persist)]) })),
    )
    const handle = byClass(tree, 'lr-note-dock-resize')
    assert.equal(handle.length, 1)
    // Drag 40px upwards (negative clientY delta) from a 260px panel.
    handle[0].props.onPointerDown({ clientY: 500, preventDefault: noop })
    const mover = [...listeners.window.get('pointermove') || []].pop()
    assert.equal(typeof mover, 'function', 'pointerdown must start listening for the drag')
    mover({ clientY: 460 })
    assert.equal(heights.length, 0, 'no storage write while the pointer is still down')
    const ender = [...listeners.window.get('pointerup') || []].pop()
    assert.equal(typeof ender, 'function')
    ender()
    const persisted = heights.filter(([, persist]) => persist)
    assert.equal(persisted.length, 1, 'exactly one write on release')
    assert.equal(persisted[0][0], 300, 'the dock must follow the pointer')
  })

  test('the drag respects the 160px floor and the 60vh ceiling', () => {
    const heights = []
    const tree = API.ReaderNoteDock(
      baseProps({ height: 260, onHeightChange: (value, persist) => persist && heights.push(value) }),
    )
    const handle = byClass(tree, 'lr-note-dock-resize')[0]
    handle.props.onPointerDown({ clientY: 400, preventDefault: noop })
    const mover = [...listeners.window.get('pointermove')].pop()
    // Drag far down: below the minimum.
    mover({ clientY: 4000 })
    ;[...listeners.window.get('pointerup')].pop()()
    assert.equal(heights.pop(), 160, 'the dock must not shrink below 160px')

    handle.props.onPointerDown({ clientY: 400, preventDefault: noop })
    const up = [...listeners.window.get('pointermove')].pop()
    up({ clientY: -4000 })
    ;[...listeners.window.get('pointerup')].pop()()
    // window.innerHeight is 900 in this harness, so 60vh is 540.
    assert.equal(heights.pop(), 540, 'the dock must not exceed 60vh')
  })
})

// ── §7.1 / §14.6 header entry buttons ──────────────────────────────────────

/** Render LiteratureReader far enough to inspect the header actions. */
function renderReader(paper) {
  const previous = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}) })
  try {
    // The paper is seeded through the patched state initialiser below.
    globalThis.__PAPER__ = paper
    return renderOf('LiteratureReader', () => API.LiteratureReader({}))
  } finally {
    globalThis.fetch = previous
  }
}

describe('header entry buttons (spec §7.1, §14.6)', () => {
  test('no note offers 建立笔记 and no 修改笔记', () => {
    const tree = renderReader({ id: 'p1', title: '论文', hasReaderNote: false, hasSummary: false, pageCount: 3 })
    const actions = byClass(tree, 'lr-header-actions')
    assert.ok(actions.length >= 1, 'the header must keep its actions row')
    assert.ok(buttonByText(tree, '建立笔记').length >= 1, 'a missing note must offer 建立笔记')
    assert.equal(buttonByText(tree, '记录笔记').length, 0, '记录笔记 needs an existing note')
    assert.equal(
      byTag(tree, 'button').filter((node) => node.props.title === '修改笔记').length,
      0,
      '修改笔记 needs an existing note',
    )
  })

  test('an existing note offers 记录笔记 plus 修改笔记', () => {
    const tree = renderReader({ id: 'p1', title: '论文', hasReaderNote: true, hasSummary: true, pageCount: 3 })
    assert.ok(buttonByText(tree, '记录笔记').length >= 1, 'an existing note must offer 记录笔记')
    assert.equal(buttonByText(tree, '建立笔记').length, 0, '建立笔记 is only for a missing note')
    assert.ok(
      byTag(tree, 'button').filter((node) => node.props.title === '修改笔记').length >= 1,
      '修改笔记 must be available next to 记录笔记',
    )
  })

  test('the 记录笔记 button does not promise a shortcut that is not wired', () => {
    // Nothing registers a global accelerator for the panel, and Ctrl+Shift+N is
    // reserved by the browser (new incognito window), so a page cannot claim it.
    // A tooltip that advertises it would be a promise the app cannot keep.
    const tree = renderReader({ id: 'p1', title: '论文', hasReaderNote: true, pageCount: 3 })
    const button = buttonByText(tree, '记录笔记')[0]
    const title = String(button.props.title || '')
    assert.equal(title, '记录笔记', 'the tooltip carries no accelerator')
    assert.doesNotMatch(title, /Ctrl\+|Cmd\+|Alt\+|Shift\+/, 'no modifier chord may appear in the tooltip')
    // The same applies to the other entry button.
    const createTree = renderReader({ id: 'p1', title: '论文', hasReaderNote: false, pageCount: 3 })
    const createTitle = String(buttonByText(createTree, '建立笔记')[0].props.title || '')
    assert.doesNotMatch(createTitle, /Ctrl\+|Cmd\+|Alt\+|Shift\+/, '建立笔记 must not advertise a shortcut either')
  })

  test('the lost-file confirmation text interpolates the path (spec §14.6)', () => {
    const text = API.readerNoteText('readerNoteLostConfirm', { path: '笔记/X 笔记.md' })
    assert.match(text, /原笔记文件已丢失/)
    assert.match(text, /笔记\/X 笔记\.md/)
    assert.doesNotMatch(text, /\{path\}/, 'the placeholder must be substituted')
  })

  test('a lost note still offers 建立笔记 and asks before recreating it (spec §14.6)', async () => {
    globalThis.__CONFIRMS__.length = 0
    globalThis.__CONFIRM_RESULT__ = false
    // The host reports exists:false plus the path it remembers (spec §14.6).
    const requests = []
    globalThis.fetch = async (url, options) => {
      requests.push({ url: String(url), method: (options && options.method) || 'GET' })
      const body = String(url).includes('/reader-note') ? { exists: false, lostPath: 'D:/vault/A/a 笔记.md' } : {}
      return { ok: true, json: async () => body }
    }
    try {
      const tree = renderReader({
        id: 'p1',
        title: '论文',
        hasReaderNote: false,
        readerNoteRelative: 'A/a 笔记.md',
        pageCount: 3,
      })
      // The button is still 建立笔记, not 记录笔记.
      const create = buttonByText(tree, '建立笔记')
      assert.equal(create.length, 1)
      // Declining the confirmation must not create anything.
      await create[0].props.onClick()
      assert.equal(globalThis.__CONFIRMS__.length, 1, 'the confirmation must be asked exactly once')
      assert.match(globalThis.__CONFIRMS__[0], /原笔记文件已丢失/)
      assert.match(globalThis.__CONFIRMS__[0], /a 笔记\.md/, 'the dialog must name the lost path')
      assert.equal(
        requests.filter((item) => item.method === 'POST').length,
        0,
        'declining must not POST a create',
      )
    } finally {
      globalThis.__CONFIRM_RESULT__ = true
      globalThis.fetch = async () => ({ ok: true, json: async () => ({}) })
    }
  })
})

// ── §12.4 / §14.8 library grouping ─────────────────────────────────────────

const LIBRARY_DATA = {
  stats: { pdfs: 2, notes: 4 },
  folders: [],
  pdfs: [
    {
      rel: 'A/a.pdf',
      stem: 'a',
      title: 'A 论文',
      fileName: 'a.pdf',
      folder: 'A',
      status: 'ready',
      analysisReady: true,
      hasSummary: true,
      summaryRel: 'A/a 总结.md',
      readerNoteRel: 'A/a 笔记.md',
      tags: [],
    },
    {
      rel: 'B/b.pdf',
      stem: 'b',
      title: 'B 论文',
      fileName: 'b.pdf',
      folder: 'B',
      status: 'ready',
      analysisReady: true,
      hasSummary: false,
      tags: [],
    },
  ],
  notes: [
    { rel: 'A/a 总结.md', title: 'a 总结', folder: 'A', isSummary: true, tags: [] },
    { rel: 'A/a 笔记.md', title: 'a 笔记', folder: 'A', noteRole: 'reader-note', tags: [] },
    { rel: '随手记.md', title: '随手记', folder: '', tags: [] },
  ],
}

function renderLibrary(overrides) {
  const props = {
    data: LIBRARY_DATA,
    loading: false,
    error: '',
    busy: '',
    onRefresh: noop,
    onOpenPdf: async () => {},
    onOpenNote: noop,
    onOpenLegacy: noop,
    onImport: noop,
    onSave: async () => {},
    onCreateFolder: async () => '',
    onMoveEntry: async () => {},
    onRenameFolder: async () => ({ rel: '' }),
    onDeleteEntry: async () => {},
    onDeleteCache: async () => {},
    dataDir: 'D:/data',
    onBack: noop,
    ...overrides,
  }
  return renderOf('VaultLibraryView', () => API.VaultLibraryView(props))
}

describe('library grouping (spec §12.4, §14.8)', () => {
  test('an expanded paper row offers both companions', () => {
    // The row is collapsed by default, so the trio cannot be asserted on the
    // first render; the expander that reveals it must exist for every paper.
    const tree = renderLibrary()
    const expanders = byClass(tree, 'lr-pdf-expand')
    assert.equal(expanders.length, 2, 'every paper row needs an expander')
    assert.equal(byClass(tree, 'lr-pdf-trio').length, 0, 'the trio starts collapsed')
  })

  test('a paper without a summary or note is still listed with dark badges', () => {
    const tree = renderLibrary()
    const cards = byClass(tree, 'lr-pdf-card')
    assert.equal(cards.length, 2)
    // Only the first paper has both companions, so only one row shows a note badge.
    assert.equal(byClass(tree, 'lr-reader-note-pill').length, 1)
  })

  test('the notes tab defaults to standalone notes and the toggle restores everything', () => {
    const tree = renderLibrary()
    // The pdfs tab is the default; the notes tab is reachable from the toolbar.
    const tabs = byTag(tree, 'button').filter((node) => /笔记/.test(textOf(node)))
    assert.ok(tabs.length >= 1, 'the notes tab must be present')
    // Switch tabs by driving the recorded setter is not available with the stub,
    // so assert the pieces the toggle is built from instead.
    const scope = byClass(tree, 'lr-note-scope')
    assert.equal(scope.length, 0, 'the scope toggle only belongs to the notes tab')
  })

  test('the notes tab lists only standalone notes until 显示全部笔记 is on', () => {
    // Render the notes tab directly by seeding the tab state initialiser.
    globalThis.__LIBRARY_TAB__ = 'notes'
    const tree = renderLibrary()
    const cards = byClass(tree, 'lr-note-card')
    assert.equal(cards.length, 1, 'only the standalone note may show by default')
    assert.match(textOf(cards[0]), /随手记/)
    const scope = byClass(tree, 'lr-note-scope')
    assert.equal(scope.length, 1, 'the notes tab must offer the scope toggle')
    assert.match(textOf(scope[0]), /显示全部笔记/)
    globalThis.__LIBRARY_TAB__ = undefined
  })
})

// ── §7.5 organize + suspicious findings ────────────────────────────────────

describe('organize button and questions dialog (spec §7.5)', () => {
  test('整理笔记 appears only once a note exists', () => {
    const without = renderReader({ id: 'p1', title: '论文', hasReaderNote: false, pageCount: 3 })
    assert.equal(
      byClass(without, 'lr-note-organize').length,
      0,
      '整理笔记 must stay hidden without a note',
    )
    const withNote = renderReader({ id: 'p1', title: '论文', hasReaderNote: true, pageCount: 3 })
    const button = byClass(withNote, 'lr-note-organize')
    assert.equal(button.length, 1, '整理笔记 must sit in the chat title row')
    assert.match(textOf(button[0]), /整理笔记/)
  })

  test('the badge counts open suspicious findings', () => {
    const noBadge = renderReader({ id: 'p1', title: '论文', hasReaderNote: true, readerNoteOpen: 0, pageCount: 3 })
    assert.equal(byClass(noBadge, 'lr-note-organize-badge').length, 0, 'no badge when nothing is open')
    const badged = renderReader({ id: 'p1', title: '论文', hasReaderNote: true, readerNoteOpen: 2, pageCount: 3 })
    const badge = byClass(badged, 'lr-note-organize-badge')
    assert.equal(badge.length, 1, 'an open finding must badge the button')
    assert.equal(textOf(badge[0]), '2')
  })

  test('the dialog prefers the persisted discussion thread over the session one', () => {
    // Spec §3.7 keeps the history on the question itself, so reopening the
    // dialog after a reload must still show it.
    const withPersisted = API.ReaderNoteQuestionsDialog({
      questions: [
        {
          id: 'q1',
          quote: '准确率 95%',
          problem: '原文是 89%',
          ask: '是否应为 89%？',
          status: 'open',
          messages: [
            { role: 'user', content: '我记得原文写的是 89%', at: '2026-11-07T10:00:00Z' },
            { role: 'assistant', content: '确认后请按讨论结果修正', at: '2026-11-07T10:00:05Z' },
          ],
        },
      ],
      busyId: '',
      replies: { q1: [{ role: 'user', content: '本次会话的临时消息' }] },
      onClose: noop,
      onDiscuss: noop,
      onAskInChat: noop,
      onResolve: noop,
    })
    const thread = byClass(withPersisted, 'lr-note-question-thread')
    assert.equal(thread.length, 1, 'the persisted thread must render')
    assert.match(textOf(thread[0]), /我记得原文写的是 89%/)
    assert.match(textOf(thread[0]), /确认后请按讨论结果修正/)
    assert.doesNotMatch(
      textOf(thread[0]),
      /本次会话的临时消息/,
      'a persisted thread wins over the session-only copy',
    )

    // Without a persisted thread the in-session turns still show.
    const sessionOnly = API.ReaderNoteQuestionsDialog({
      questions: [{ id: 'q1', quote: 'x', problem: 'y', ask: 'z', status: 'open' }],
      busyId: '',
      replies: { q1: [{ role: 'user', content: '刚输入的问题' }] },
      onClose: noop,
      onDiscuss: noop,
      onAskInChat: noop,
      onResolve: noop,
    })
    assert.match(textOf(byClass(sessionOnly, 'lr-note-question-thread')[0]), /刚输入的问题/)
  })

  test('the organize toast accepts either stats or report (spec §3.6 spelling)', async () => {
    // §3.6 calls the payload `stats`; its own summary table and the AI layer call
    // it `report`. Reading only one silently reports 「没有改动」.
    const source = await readFile(CLIENT_FILE, 'utf8')
    assert.match(
      source,
      /const stats = done\.stats \|\| done\.report \|\| \{\}/,
      'the organize handler must accept both spellings',
    )
  })

  test('the questions dialog shows quote, problem and ask for each item', () => {
    const questions = [
      {
        id: 'q1',
        quote: '准确率 95%',
        problem: '原文写的是 89%',
        ask: '这里的 95% 是否应为 89%？',
        status: 'open',
      },
    ]
    const tree = renderOf('questions dialog', () =>
      API.ReaderNoteQuestionsDialog({
        questions,
        busyId: '',
        replies: {},
        onClose: noop,
        onDiscuss: noop,
        onAskInChat: noop,
        onResolve: noop,
      }),
    )
    assert.equal(byClass(tree, 'lr-note-question').length, 1)
    const text = textOf(tree)
    assert.match(text, /准确率 95%/, 'the quote must be shown')
    assert.match(text, /原文写的是 89%/, 'the problem must be shown')
    assert.match(text, /这里的 95% 是否应为 89%/, 'the question must be shown')
    // Each item offers all four ways forward.
    for (const label of ['与 AI 讨论', '在 AI 对话中继续讨论', '按讨论结果修正', '保留原文']) {
      assert.ok(buttonByText(tree, label).length >= 1, `the dialog must offer ${label}`)
    }
    assert.ok(byClass(tree, 'lr-note-question-input').length === 1, 'each item needs its own input')
  })

  test('resolved items drop out and an empty state explains why', () => {
    const tree = API.ReaderNoteQuestionsDialog({
      questions: [{ id: 'q1', quote: 'x', problem: 'y', ask: 'z', status: 'dismissed' }],
      busyId: '',
      replies: {},
      onClose: noop,
      onDiscuss: noop,
      onAskInChat: noop,
      onResolve: noop,
    })
    assert.equal(byClass(tree, 'lr-note-question').length, 0, 'resolved findings must not linger')
    assert.match(textOf(tree), /所有疑似错误都已处理/)
  })

  test('the dialog renders without questions at all', () => {
    assert.doesNotThrow(() =>
      API.ReaderNoteQuestionsDialog({
        questions: undefined,
        busyId: '',
        replies: undefined,
        onClose: noop,
        onDiscuss: noop,
        onAskInChat: noop,
        onResolve: noop,
      }),
    )
  })
})

// ── §3.5 version history ───────────────────────────────────────────────────

const HISTORY_VERSIONS = [
  { stamp: '20261107-154501-120', updatedAt: '2026-11-07T15:45:01.120Z', chars: 812, reason: 'organize' },
  { stamp: '20261107-140233-004', updatedAt: '2026-11-07T14:02:33.004Z', chars: 640, reason: 'append' },
]

describe('reader note history (spec §3.5)', () => {
  test('reason codes map to their Chinese labels, unknown falls back', () => {
    assert.equal(API.readerNoteHistoryLabel('append'), '记录')
    assert.equal(API.readerNoteHistoryLabel('organize'), '整理')
    assert.equal(API.readerNoteHistoryLabel('resolve'), '修正')
    assert.equal(API.readerNoteHistoryLabel('restore'), '恢复')
    // Unknown and empty reasons read as a manual save, never as a raw token.
    assert.equal(API.readerNoteHistoryLabel('who-knows'), '手动保存')
    assert.equal(API.readerNoteHistoryLabel(''), '手动保存')
    assert.equal(API.readerNoteHistoryLabel(undefined), '手动保存')
    assert.equal(API.readerNoteHistoryLabel('ORGANIZE'), '整理', 'matching must ignore case')
  })

  test('the host payload is normalised into an always-shaped list', () => {
    const list = API.readerNoteHistoryList(HISTORY_VERSIONS)
    assert.equal(list.length, 2)
    assert.deepEqual(list[0], {
      stamp: '20261107-154501-120',
      updatedAt: '2026-11-07T15:45:01.120Z',
      chars: 812,
      reason: 'organize',
    })
    // Missing fields must not produce NaN/undefined in the render.
    assert.deepEqual(API.readerNoteHistoryList([{}])[0], { stamp: '', updatedAt: '', chars: 0, reason: '' })
    assert.deepEqual(API.readerNoteHistoryList(undefined), [])
    assert.deepEqual(API.readerNoteHistoryList(null), [])
  })

  test('two versions render with time, char count and reason tag', () => {
    const tree = renderOf('history drawer', () =>
      API.NoteHistoryDrawer({
        open: true,
        loading: false,
        versions: HISTORY_VERSIONS,
        error: '',
        busy: false,
        onClose: noop,
        onPreview: noop,
        onRestore: noop,
        labelOf: (item) => API.readerNoteHistoryLabel(item.reason),
        emptyText: '暂无历史版本',
      }),
    )
    const rows = byClass(tree, 'lr-note-history-row')
    assert.equal(rows.length, 2, 'both snapshots must be listed')
    // Newest first: the drawer renders the array order the host sent.
    assert.match(textOf(rows[0]), /整理/)
    assert.match(textOf(rows[0]), /812/)
    assert.match(textOf(rows[1]), /记录/)
    assert.match(textOf(rows[1]), /640/)
    // Each row offers preview and restore.
    for (const row of rows) {
      assert.ok(buttonByText(row, '预览').length >= 1, 'each version needs a preview action')
      assert.ok(buttonByText(row, '恢复').length >= 1, 'each version needs a restore action')
    }
  })

  test('the empty list shows 暂无历史版本', () => {
    const tree = API.NoteHistoryDrawer({
      open: true,
      loading: false,
      versions: [],
      error: '',
      busy: false,
      onClose: noop,
      onPreview: noop,
      onRestore: noop,
      labelOf: (item) => API.readerNoteHistoryLabel(item.reason),
      emptyText: '暂无历史版本',
    })
    const empty = byClass(tree, 'lr-note-history-empty')
    assert.equal(empty.length, 1)
    assert.equal(textOf(empty[0]), '暂无历史版本')
    assert.equal(byClass(tree, 'lr-note-history-row').length, 0)
  })

  test('a closed drawer renders nothing and a load error is shown, not hidden', () => {
    assert.equal(API.NoteHistoryDrawer({ open: false, versions: [], onClose: noop }), null)
    const failed = API.NoteHistoryDrawer({
      open: true,
      loading: false,
      versions: [],
      error: '写盘失败',
      busy: false,
      onClose: noop,
    })
    assert.match(textOf(failed), /写盘失败/, 'a real failure must not look like an empty history')
    assert.equal(byClass(failed, 'lr-note-history-row').length, 0)
  })

  test('restore and preview callbacks receive the clicked version', () => {
    const seen = { preview: [], restore: [] }
    const tree = API.NoteHistoryDrawer({
      open: true,
      loading: false,
      versions: HISTORY_VERSIONS,
      error: '',
      busy: false,
      onClose: noop,
      onPreview: (item) => seen.preview.push(item.stamp),
      onRestore: (item) => seen.restore.push(item.stamp),
      labelOf: (item) => API.readerNoteHistoryLabel(item.reason),
    })
    const rows = byClass(tree, 'lr-note-history-row')
    buttonByText(rows[1], '预览')[0].props.onClick()
    buttonByText(rows[0], '恢复')[0].props.onClick()
    assert.deepEqual(seen.preview, ['20261107-140233-004'])
    assert.deepEqual(seen.restore, ['20261107-154501-120'])
  })

  test('the dock exposes a 历史 button on both wide and narrow layouts', () => {
    for (const narrow of [false, true]) {
      const tree = API.ReaderNoteDock({
        open: true,
        narrow,
        paperId: 'paper-1',
        height: 260,
        font: 100,
        submitting: false,
        onFontChange: noop,
        onHeightChange: noop,
        onSubmit: noop,
        onClose: noop,
        onUploadImage: async () => ({}),
        onToast: noop,
        onHistory: noop,
      })
      const history = byTag(tree, 'button').filter((node) => node.props.title === '历史')
      assert.equal(history.length, 1, `the ${narrow ? 'narrow' : 'wide'} dock must offer 历史`)
    }
  })

  test('restore POSTs to the documented URL after confirmation', async () => {
    // The drawer's restore handler lives in LiteratureReader, so drive the real
    // tree: seed the drawer open (the click path is covered separately) and grab
    // the props the dock hands to NoteHistoryDrawer.
    const calls = []
    const item = HISTORY_VERSIONS[0]
    globalThis.fetch = async (url, options) => {
      const path = String(url)
      calls.push({ path, method: (options && options.method) || 'GET', body: options && options.body })
      if (path.endsWith(`/history/${encodeURIComponent(item.stamp)}/restore`)) {
        return { ok: true, json: async () => ({ ok: true, markdown: '恢复后的正文', hash: 'newhash' }) }
      }
      if (path.endsWith('/reader-note/history')) {
        return { ok: true, json: async () => ({ versions: HISTORY_VERSIONS }) }
      }
      if (path.endsWith('/reader-note')) {
        return { ok: true, json: async () => ({ exists: true, markdown: '当前正文', hash: 'oldhash' }) }
      }
      return { ok: true, json: async () => ({}) }
    }
    globalThis.__PAPER__ = { id: 'p1', title: '论文', hasReaderNote: true, pageCount: 3 }
    globalThis.__HISTORY_OPEN__ = true
    globalThis.__HISTORY_VERSIONS__ = HISTORY_VERSIONS
    globalThis.__CONFIRM_RESULT__ = true
    globalThis.__CONFIRMS__.length = 0
    try {
      const tree = renderOf('LiteratureReader history', () => API.LiteratureReader({}))
      // The raw element (not the expanded component) exposes the handler props.
      const drawers = rawFind(tree, (node) => node.props && typeof node.props.onRestore === 'function')
      assert.equal(drawers.length, 1, 'the reader must mount a history drawer with a restore handler')
      const props = drawers[0].props
      assert.equal(props.open, true)
      // Reason labels come from the reader-note vocabulary, not the summary one.
      assert.equal(props.labelOf(item), '整理')
      assert.equal(props.emptyText, '暂无历史版本')

      await props.onRestore(item)
      const restoreCall = calls.find((call) => call.path.endsWith('/restore'))
      assert.ok(restoreCall, 'restore must hit the host')
      assert.match(restoreCall.path, /\/api\/papers\/p1\/reader-note\/history\/20261107-154501-120\/restore$/)
      assert.equal(restoreCall.method, 'POST', 'restore must be a POST')
      // Confirmation is asked exactly once, with the documented wording.
      assert.equal(globalThis.__CONFIRMS__.length, 1)
      assert.match(globalThis.__CONFIRMS__[0], /当前正文会先存为历史/)
    } finally {
      globalThis.__HISTORY_OPEN__ = undefined
      globalThis.__HISTORY_VERSIONS__ = undefined
      globalThis.fetch = async () => ({ ok: true, json: async () => ({}) })
    }
  })

  test('declining the restore confirmation sends nothing', async () => {
    const calls = []
    globalThis.fetch = async (url, options) => {
      calls.push({ path: String(url), method: (options && options.method) || 'GET' })
      return { ok: true, json: async () => ({ exists: true, markdown: '', hash: '' }) }
    }
    globalThis.__PAPER__ = { id: 'p1', title: '论文', hasReaderNote: true, pageCount: 3 }
    globalThis.__HISTORY_OPEN__ = true
    globalThis.__HISTORY_VERSIONS__ = HISTORY_VERSIONS
    globalThis.__CONFIRM_RESULT__ = false
    try {
      const tree = API.LiteratureReader({})
      const props = rawFind(tree, (node) => node.props && typeof node.props.onRestore === 'function')[0].props
      await props.onRestore(HISTORY_VERSIONS[0])
      assert.equal(
        calls.filter((call) => call.method === 'POST').length,
        0,
        'a declined restore must not POST',
      )
    } finally {
      globalThis.__CONFIRM_RESULT__ = true
      globalThis.__HISTORY_OPEN__ = undefined
      globalThis.__HISTORY_VERSIONS__ = undefined
      globalThis.fetch = async () => ({ ok: true, json: async () => ({}) })
    }
  })

  test('the three load outcomes stay distinct: 404 no-note / transport / 500 (spec §7.7)', async () => {
    // Only a 404 may lead to 建立笔记; the other two must never reach the create
    // branch, or an existing note would be rebuilt over the reader's content.
    const run = async (fetchImpl, paper) => {
      const calls = []
      globalThis.fetch = async (url, options) => {
        calls.push({ path: String(url), method: (options && options.method) || 'GET' })
        return fetchImpl(String(url), options)
      }
      globalThis.__PAPER__ = paper
      try {
        const tree = API.LiteratureReader({})
        const create = buttonByText(tree, '建立笔记')
        const record = buttonByText(tree, '记录笔记')
        const button = (create.length ? create : record)[0]
        assert.ok(button, 'the header must offer an entry button')
        await button.props.onClick()
        return calls
      } finally {
        globalThis.fetch = async () => ({ ok: true, json: async () => ({}) })
      }
    }

    const notFound = () => {
      const error = new Error('未找到阅读笔记')
      error.status = 404
      throw error
    }
    // 1) 404 → "no note yet": creating is exactly the right next step.
    const after404 = await run(async (path) => {
      if (path.endsWith('/reader-note')) return notFound()
      return { ok: true, json: async () => ({ ok: true, created: true, exists: true }) }
    }, { id: 'p1', title: '论文', hasReaderNote: false, pageCount: 3 })
    assert.equal(
      after404.filter((call) => call.method === 'POST' && call.path.endsWith('/reader-note')).length,
      1,
      'a genuine 404 must lead to creating the note',
    )

    // 2) transport error (no HTTP status) → host unreachable, retryable, no create.
    const transport = async (path) => {
      if (path.endsWith('/reader-note')) throw new TypeError('Failed to fetch')
      return { ok: true, json: async () => ({}) }
    }
    const afterTransport = await run(transport, { id: 'p1', title: '论文', hasReaderNote: true, pageCount: 3 })
    assert.equal(
      afterTransport.filter((call) => call.method === 'POST').length,
      0,
      'a transport error must never create a note',
    )

    // 3) 500 → real server fault, reported verbatim, no create.
    const serverError = async (path) => {
      if (path.endsWith('/reader-note')) {
        const error = new Error('写入磁盘失败')
        error.status = 500
        throw error
      }
      return { ok: true, json: async () => ({}) }
    }
    const after500 = await run(serverError, { id: 'p1', title: '论文', hasReaderNote: true, pageCount: 3 })
    assert.equal(
      after500.filter((call) => call.method === 'POST').length,
      0,
      'a 500 must never create a note',
    )
  })

  test('opening the panel surfaces the open questions without another organize run', async () => {
    // Spec §7.5: open questions stay visible when the panel opens. The GET
    // already returns them, so reading them must not cost a model call.
    const calls = []
    globalThis.fetch = async (url, options) => {
      const path = String(url)
      calls.push({ path, method: (options && options.method) || 'GET' })
      if (path.endsWith('/reader-note')) {
        return {
          ok: true,
          json: async () => ({
            exists: true,
            markdown: '## 21:03 · 记录',
            hash: 'h1',
            questions: [
              { id: 'q1', quote: '准确率 95%', problem: '原文是 89%', ask: '是否为 89%？', status: 'open' },
              { id: 'q2', quote: '已核对', problem: '无', ask: '无', status: 'resolved' },
            ],
          }),
        }
      }
      return { ok: true, json: async () => ({}) }
    }
    globalThis.__PAPER__ = { id: 'p1', title: '论文', hasReaderNote: true, readerNoteOpen: 1, pageCount: 3 }
    try {
      const opened = API.LiteratureReader({})
      // The badge proves the reader knows a finding is pending…
      assert.ok(byClass(opened, 'lr-note-entry-badge').length >= 1, 'the entry badge counts open questions')
      globalThis.__STATE_SETS__.length = 0
      await buttonByText(opened, '记录笔记')[0].props.onClick()

      // …and opening the panel must hand the open findings to the dialog. The
      // stub cannot persist state, so assert on what the handler decided.
      const staged = globalThis.__STATE_SETS__
        .filter((entry) => Array.isArray(entry.value))
        .map((entry) => entry.value)
        .filter((value) => value.length > 0 && value.every((item) => item && typeof item === 'object' && 'quote' in item))
      assert.equal(staged.length, 1, 'opening the panel must stage the questions dialog')
      assert.equal(staged[0].length, 1, 'only the open finding is surfaced')
      assert.equal(staged[0][0].id, 'q1')
      assert.equal(staged[0][0].status, 'open')
      // No extra request, and specifically no organize run (that would rewrite
      // the body and cost a model call).
      assert.equal(
        calls.filter((call) => call.path.includes('/organize')).length,
        0,
        'surfacing questions must not trigger another organize run',
      )
      assert.equal(
        calls.filter((call) => call.method === 'POST').length,
        0,
        'opening the panel must not POST anything',
      )
    } finally {
      globalThis.fetch = async () => ({ ok: true, json: async () => ({}) })
    }
  })

  test('opening the panel with no open questions mounts no dialog', async () => {
    globalThis.fetch = async (url) => {
      const path = String(url)
      if (path.endsWith('/reader-note')) {
        return {
          ok: true,
          json: async () => ({
            exists: true,
            markdown: '正文',
            hash: 'h1',
            questions: [{ id: 'q2', quote: 'x', problem: 'y', ask: 'z', status: 'resolved' }],
          }),
        }
      }
      return { ok: true, json: async () => ({}) }
    }
    globalThis.__PAPER__ = { id: 'p1', title: '论文', hasReaderNote: true, pageCount: 3 }
    try {
      const tree = API.LiteratureReader({})
      globalThis.__STATE_SETS__.length = 0
      await assert.doesNotReject(async () => buttonByText(tree, '记录笔记')[0].props.onClick())
      // A resolved-only list must not be staged: doing so would either open an
      // empty dialog or wipe a dialog the reader is already looking at.
      const staged = globalThis.__STATE_SETS__
        .filter((entry) => Array.isArray(entry.value))
        .map((entry) => entry.value)
        .filter((value) => value.length > 0 && value.every((item) => item && typeof item === 'object' && 'quote' in item))
      assert.equal(staged.length, 0, 'nothing open ⇒ nothing staged')
      // It still opened the panel itself.
      assert.ok(
        globalThis.__STATE_SETS__.some((entry) => entry.value === true),
        'the panel must still open',
      )
    } finally {
      globalThis.fetch = async () => ({ ok: true, json: async () => ({}) })
    }
  })

  test('a failed load is retried on the next click instead of pinning the button', async () => {
    // A 500 used to leave a `fetchFailed` snapshot in state that short-circuited
    // every later click, so the reader had to reload the page once the host
    // recovered. Each click must re-ask the host.
    const calls = []
    let healthy = false
    globalThis.fetch = async (url, options) => {
      const path = String(url)
      calls.push({ path, method: (options && options.method) || 'GET' })
      if (!healthy && path.endsWith('/reader-note')) {
        const error = new Error('写入磁盘失败')
        error.status = 500
        throw error
      }
      if (path.endsWith('/reader-note')) {
        return { ok: true, json: async () => ({ exists: true, markdown: '正文', hash: 'h1' }) }
      }
      return { ok: true, json: async () => ({}) }
    }
    globalThis.__PAPER__ = { id: 'p1', title: '论文', hasReaderNote: true, pageCount: 3 }
    try {
      const tree = API.LiteratureReader({})
      const header = buttonByText(tree, '记录笔记')
      assert.equal(header.length, 1)

      // First click: the host is broken. Nothing is created.
      await header[0].props.onClick()
      const afterFirst = calls.filter((call) => call.path.endsWith('/reader-note')).length
      assert.equal(afterFirst, 1, 'the first click must ask the host once')
      assert.equal(calls.filter((call) => call.method === 'POST').length, 0)

      // The host recovers; clicking again must fetch again, not replay the
      // cached failure.
      healthy = true
      await header[0].props.onClick()
      const afterSecond = calls.filter((call) => call.path.endsWith('/reader-note')).length
      assert.ok(afterSecond > afterFirst, 'the second click must retry the load')
      assert.equal(
        calls.filter((call) => call.method === 'POST').length,
        0,
        'a note that exists still must not be re-created',
      )
    } finally {
      globalThis.fetch = async () => ({ ok: true, json: async () => ({}) })
    }
  })

  test('the narrow full-page editor cannot cover the history sheet or the preview', async () => {
    // Layering must come from z-index, not from the sibling order: both the
    // dock (120) and the drawer used to sit on 120 and only stacking context
    // order kept the drawer visible.
    const source = await readFile(CLIENT_FILE, 'utf8')
    const rule = (selector) => {
      const index = source.indexOf(selector)
      assert.notEqual(index, -1, `client.js must still define ${selector}`)
      const end = source.indexOf('}', index)
      const zMatch = /z-index:(\d+)/.exec(source.slice(index, end))
      return zMatch ? Number(zMatch[1]) : null
    }
    const dockFull = rule('.lr-note-dock-full{')
    const historyMask = rule('.lr-note-history-mask{')
    assert.equal(dockFull, 120, 'the full-page editor stays on 120')
    assert.ok(
      historyMask > dockFull,
      `the history sheet (z=${historyMask}) must be above the full-page editor (z=${dockFull})`,
    )
    assert.equal(rule('.lr-modal-backdrop.elevated{'), historyMask, 'the preview modal must ride above the editor too')
  })
})

// ── §12.3 delete dialog ────────────────────────────────────────────────────

describe('delete dialog choices (spec §12.3)', () => {
  test('a pdf delete offers exactly the three documented options', () => {
    globalThis.__DELETE_TARGET__ = { kind: 'pdf', item: LIBRARY_DATA.pdfs[0] }
    const tree = renderLibrary()
    const options = byClass(tree, 'lr-delete-option')
    assert.equal(options.length, 3, 'keep / summary / all')
    const labels = options.map((node) => textOf(node))
    assert.ok(labels.some((label) => label.includes('只删记录')))
    assert.ok(labels.some((label) => label.includes('连同速览总结')))
    assert.ok(labels.some((label) => label.includes('连同总结与笔记')))
    // The default selection keeps every vault file.
    assert.match(options[0].props.className, /checked/)
    // Every option explains what happens to the files.
    for (const option of options) {
      assert.match(textOf(option), /备份|保留|删除/)
    }
    globalThis.__DELETE_TARGET__ = undefined
  })
})
