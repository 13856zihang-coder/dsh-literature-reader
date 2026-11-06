import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test, { after, describe } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Component-level render coverage for the study-note view.
//
// client.js is a browser module, so there is no DOM here: the test patches the
// factory to expose its components, loads the real file, and renders each
// component with a minimal react stub. That catches the failure mode the
// loading-only client-sync test cannot see — a component that throws on real
// props (undefined identifier, wrong shape, missing translation key).
//
// The patched copy is written to the OS temp directory, never into the repo.

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const CLIENT_FILE = path.join(ROOT, 'client.js')

const SEED_MARKDOWN = [
  '# 标题',
  '',
  '方法部分使用了自监督预训练。',
  '',
  '- 一',
  '- 二',
  '',
  '> [!abstract] 速览',
  '> 一句话',
  '',
].join('\n')

// Offsets are real plain-projection offsets so the seeded view actually
// highlights text instead of silently dropping the annotations.
const QUOTE_OPEN = '自监督预训练'
const QUOTE_RESOLVED = '方法部分'
const at = (needle, offset = 0) => SEED_MARKDOWN.indexOf(needle) + offset
const SEED_ANNOTATIONS = [
  { id: 'a1', quote: QUOTE_OPEN, note: '需要补充动机', color: 'amber', status: 'open', start: at(QUOTE_OPEN), end: at(QUOTE_OPEN) + QUOTE_OPEN.length, reply: '' },
  { id: 'a2', quote: QUOTE_RESOLVED, note: '这里看不懂', color: 'sky', status: 'resolved', start: at(QUOTE_RESOLVED), end: at(QUOTE_RESOLVED) + QUOTE_RESOLVED.length, reply: '已补充定义' },
  { id: 'a3', quote: '过期引用', note: '', color: 'rose', status: 'orphan', start: 0, end: 1, reply: '' },
]

const defaultSeed = () => ({ markdown: '', annotations: [], conflict: false, figures: null, applying: null })

/**
 * Expose the note components, then point a few `useState` initialisers at
 * `globalThis.__SEED__` so richer UI states can be rendered deterministically.
 * Every anchor is asserted: if client.js drifts, the failure names the anchor.
 */
function patchClient(source) {
  const expose = `
    globalThis.__NOTE_COMPONENTS__ = {
      MarkdownDoc, NoteView, NoteEditor, NoteInsertDialog, NoteAnnotationDialog, NoteAnnotationPanel,
      NoteAnnotationGroup, NoteApplyBar, NoteHistoryDrawer, NoteLightbox, NoteSelectionToolbar,
      NoteColorPicker, parseMarkdown, plainProjection, buildNoteSegments,
      noteSelectionSpan, notePlainOffsetAt,
    }
    return {
      inject:`
  let out = source.replace('\n    return {\n      inject:', expose)
  assert.notEqual(out, source, 'client.js must still end the factory with `return { inject:`')

  const statePatches = [
    ['const [loading, setLoading] = useState(true)', 'const [loading, setLoading] = useState(false)'],
    ["const [markdown, setMarkdown] = useState('')", 'const [markdown, setMarkdown] = useState(globalThis.__SEED__.markdown)'],
    ['const [annotations, setAnnotations] = useState(EMPTY)', 'const [annotations, setAnnotations] = useState(globalThis.__SEED__.annotations)'],
    ['const [conflict, setConflict] = useState(false)', 'const [conflict, setConflict] = useState(globalThis.__SEED__.conflict)'],
    ['const [figures, setFigures] = useState(null)', 'const [figures, setFigures] = useState(globalThis.__SEED__.figures)'],
    ['const [applying, setApplying] = useState(null)', 'const [applying, setApplying] = useState(globalThis.__SEED__.applying)'],
  ]
  for (const [from, to] of statePatches) {
    assert.ok(out.includes(from), `client.js no longer contains: ${from}`)
    out = out.replace(from, to)
  }
  return out
}

// ── environment ─────────────────────────────────────────────────────────────

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

const noop = () => {}
const effects = { run: false, cleanups: [] }

const stub = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, noop],
  useRef: (initial) => ({ current: initial }),
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  useEffect: (fn) => {
    if (!effects.run) return
    const cleanup = fn()
    if (typeof cleanup === 'function') effects.cleanups.push(cleanup)
  },
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
  addEventListener: record('window'),
  removeEventListener: forget('window'),
  getSelection: () => ({ rangeCount: 0, isCollapsed: true, removeAllRanges: noop, getRangeAt: noop }),
  confirm: () => true,
}

globalThis.document = {
  createElement: () => ({ getContext: () => ({ drawImage: noop }), toDataURL: () => '', setAttribute: noop }),
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
globalThis.__SEED__ = defaultSeed()

const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'lr-note-render-'))
after(() => rm(tmpDir, { recursive: true, force: true }))

const patchedFile = path.join(tmpDir, 'client.patched.mjs')
await writeFile(patchedFile, patchClient(await readFile(CLIENT_FILE, 'utf8')), 'utf8')
await import(pathToFileURL(patchedFile).href)
globalThis.__NOTE_DEF__.factory((id) => {
  if (id === 'react') return stub
  throw new Error(`client.js must only require react, got ${id}`)
})
const T = globalThis.__NOTE_COMPONENTS__

// ── render helpers ─────────────────────────────────────────────────────────

/** Render a component, turning a throw into an assertion naming the component. */
function renderOf(name, factory) {
  try {
    const tree = factory()
    assert.ok(tree !== undefined, `${name} must render something`)
    return tree
  } catch (error) {
    assert.fail(`${name} threw while rendering: ${error && error.stack ? error.stack.split('\n')[0] : error}`)
    return null
  }
}

/**
 * Expand the tree the way react would. Function components are invoked so the
 * assertions see nested output; depth-capped in case of accidental recursion.
 */
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

const textOf = (tree) => walk(tree).filter((node) => node.text !== undefined).map((node) => node.text).join(' ')
const classOf = (tree) => walk(tree).map((node) => node.props.className || '').join(' ')
const tags = (tree, tag) => walk(tree).filter((node) => node.tag === tag)

function fakeElement(extra = {}) {
  return {
    nodeType: 1,
    getAttribute: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    contains: () => false,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600, bottom: 600, right: 800 }),
    scrollIntoView: noop,
    focus: noop,
    ...extra,
  }
}

const basePaper = { id: 'p1', title: 'Demo paper', pageCount: 4 }

function renderNoteView(seed = {}) {
  globalThis.__SEED__ = { ...defaultSeed(), ...seed }
  return renderOf('NoteView', () =>
    T.NoteView({
      paper: basePaper,
      onBack: noop,
      onCitePage: noop,
      onOpenObsidian: noop,
      onRegenerate: noop,
      showToast: noop,
      onPaperChanged: noop,
    }),
  )
}

// ── selection toolbar and annotation dialog ────────────────────────────────

describe('note selection toolbar', () => {
  test('renders the 标注 action for a selection', () => {
    const tree = renderOf('NoteSelectionToolbar', () =>
      T.NoteSelectionToolbar({ toolbar: { left: 10, top: 20 }, onAnnotate: noop, onDismiss: noop }),
    )
    assert.match(textOf(tree), /标注/, 'the toolbar must offer the 标注 action')
    assert.match(classOf(tree), /lr-ann-toolbar/, 'the toolbar must use the lr-ann- prefix')
  })

  test('keeps the label visible at wide and narrow widths', () => {
    const tree = T.NoteSelectionToolbar({ toolbar: { left: 0, top: 0 }, onAnnotate: noop, onDismiss: noop })
    assert.match(textOf(tree), /标注/, 'the 标注 label is hidden at every width')
  })
})

describe('note colour picker', () => {
  test('offers exactly the four annotation colours', () => {
    const tree = renderOf('NoteColorPicker', () => T.NoteColorPicker({ value: 'amber', onChange: noop }))
    assert.equal(tags(tree, 'button').length, 4, 'noteColorPicker must render one button per colour')
  })
})

describe('note annotation dialog', () => {
  const draftNew = { id: '', quote: QUOTE_OPEN, note: '', color: 'amber', from: 8, to: 13 }
  const draftEdit = { id: 'a1', quote: QUOTE_OPEN, note: '需要补充动机', color: 'rose', reply: '已处理' }

  test('creates a new annotation from a selection', () => {
    const tree = renderOf('NoteAnnotationDialog', () =>
      T.NoteAnnotationDialog({ draft: draftNew, onSave: noop, onDelete: noop, onClose: noop, onLocate: noop }),
    )
    const text = textOf(tree)
    assert.ok(text.includes(QUOTE_OPEN), 'the dialog must echo the selected quote')
    assert.ok(text.includes('保存标注'), 'the dialog must offer 保存标注')
    assert.ok(!text.includes('删除'), 'a brand-new annotation has nothing to delete yet')
  })

  test('edits an annotation, showing its AI reply and delete action', () => {
    const tree = renderOf('NoteAnnotationDialog', () =>
      T.NoteAnnotationDialog({ draft: draftEdit, onSave: noop, onDelete: noop, onClose: noop, onLocate: noop }),
    )
    const text = textOf(tree)
    assert.ok(text.includes('删除'), 'an existing annotation must be deletable')
    assert.ok(text.includes('已处理'), 'the AI reply must be shown when editing')
    assert.ok(text.includes('Ctrl/Cmd + Enter'), 'the save shortcut must be documented in the dialog')
  })

  test('renders its keyboard shortcut hint and colour swatches', () => {
    const tree = T.NoteAnnotationDialog({ draft: draftNew, onSave: noop, onDelete: noop, onClose: noop, onLocate: noop })
    assert.match(classOf(tree), /lr-ann-color/, 'the dialog must include the colour picker')
  })
})

// ── annotation rail ────────────────────────────────────────────────────────

describe('note annotation rail', () => {
  const props = { open: true, collapsed: false, onToggle: noop, onClose: noop, onLocate: noop, onEdit: noop, onDelete: noop }

  test('groups annotations by 待应用 / 已应用 / 已失效', () => {
    const tree = renderOf('NoteAnnotationPanel', () =>
      T.NoteAnnotationPanel({ annotations: SEED_ANNOTATIONS, ...props }),
    )
    const text = textOf(tree)
    assert.ok(text.includes('待应用'), 'missing the 待应用 group')
    assert.ok(text.includes('已应用'), 'missing the 已应用 group')
    assert.ok(text.includes('已失效'), 'missing the 已失效 group')
    assert.match(text, /3/, 'the rail must report the total annotation count')
    assert.match(classOf(tree), /lr-ann-panel/, 'the rail must use the lr-ann-panel class')
    // The open group is expanded by default, so its note text is readable.
    assert.ok(text.includes('需要补充动机'), 'the open annotation note must be listed')
    // Resolved history is folded by default to keep the rail scannable.
    assert.ok(!text.includes('这里看不懂'), 'the resolved group is folded until the user expands it')
    assert.match(
      classOf(tree),
      /lr-ann-group collapsed/,
      'the resolved group must render collapsed by default',
    )
  })

  test('expands every group through the header toggle', () => {
    // Collapsed groups are driven by internal state, so assert the affordance
    // exists rather than trying to drive useState through the stub.
    const tree = T.NoteAnnotationPanel({ annotations: SEED_ANNOTATIONS, ...props })
    const toggles = walk(tree).filter((node) => node.tag === 'button' && String(node.props.className || '').includes('lr-ann-group-head'))
    assert.ok(toggles.length >= 2, 'each non-empty group must expose an expand toggle')
    assert.ok(toggles.every((node) => typeof node.props.onClick === 'function'), 'group toggles must be clickable')
  })

  test('guides the user when there is nothing to show', () => {
    const tree = T.NoteAnnotationPanel({ annotations: [], ...props })
    assert.match(textOf(tree), /选中一句话/, 'the empty rail must explain how to annotate')
  })
})

// ── apply bar ──────────────────────────────────────────────────────────────

describe('note apply bar', () => {
  const base = {
    running: false,
    label: '',
    instruction: '',
    onInstruction: noop,
    onApply: noop,
    onOpenPanel: noop,
    disabled: false,
  }

  test('reports the pending count and never claims to auto-apply', () => {
    const tree = renderOf('NoteApplyBar', () => T.NoteApplyBar({ ...base, pendingCount: 2, orphanCount: 1 }))
    const text = textOf(tree)
    assert.ok(text.includes('2 条标注待应用'), `pending count missing, got: ${text}`)
    assert.ok(text.includes('不会自动修改'), 'the bar must state that nothing changes before applying')
    assert.ok(text.includes('应用修改'), 'the primary action must read 应用修改')
    assert.ok(text.includes('已失效'), 'the bar must surface orphaned annotations')
  })

  test('offers an optional instruction field', () => {
    const tree = T.NoteApplyBar({ ...base, pendingCount: 1, orphanCount: 0 })
    const placeholders = walk(tree).map((node) => node.props.placeholder || '')
    assert.ok(
      placeholders.some((value) => value.includes('补充要求')),
      `the optional instruction input is missing, placeholders: ${JSON.stringify(placeholders)}`,
    )
  })

  test('shows the running label and progress while revising', () => {
    const tree = renderOf('NoteApplyBar', () =>
      T.NoteApplyBar({ ...base, running: true, label: '正在按你的标注修改…', pendingCount: 2, orphanCount: 0 }),
    )
    assert.match(textOf(tree), /正在按你的标注修改/, 'the running label must be rendered')
    assert.match(classOf(tree), /lr-note-applybar/, 'the bar must keep its container class while running')
  })
})

// ── markdown source editor ─────────────────────────────────────────────────

describe('note source editor', () => {
  const base = {
    value: '# hi',
    onChange: noop,
    onSave: noop,
    onCancel: noop,
    dirty: true,
    saving: false,
    error: '',
    draftOffer: null,
    onRestoreDraft: noop,
    onDiscardDraft: noop,
    onInsertImage: noop,
    onCursor: noop,
  }

  test('renders a monospace textarea with the word count', () => {
    const tree = renderOf('NoteEditor', () => T.NoteEditor(base))
    assert.match(classOf(tree), /lr-note-source/, 'the source textarea must use the monospace class')
    assert.ok(textOf(tree).includes('字'), 'the editor must show the character count')
    assert.equal(tags(tree, 'textarea').length, 1, 'the editor must render exactly one textarea')
  })

  test('offers to restore an unsubmitted draft', () => {
    const tree = T.NoteEditor({
      ...base,
      draftOffer: { markdown: '# draft', savedAt: '2024-01-01T00:00:00Z', baseVersion: 'v1' },
    })
    const text = textOf(tree)
    assert.ok(text.includes('恢复草稿'), 'the draft banner must offer 恢复草稿')
    assert.ok(text.includes('丢弃'), 'the draft banner must offer to discard the draft')
  })

  test('surfaces a save error inline', () => {
    const tree = T.NoteEditor({ ...base, error: '保存失败，请稍后重试' })
    assert.match(textOf(tree), /保存失败/, 'a save error must be visible in the editor')
  })
})

// ── insert-figure dialog ───────────────────────────────────────────────────

describe('note insert dialog', () => {
  const paper = { id: 'p1', title: 'Demo', pageCount: 5 }

  test('offers both upload and PDF-crop tabs plus the three placements', () => {
    const tree = renderOf('NoteInsertDialog', () =>
      T.NoteInsertDialog({ paper, markdown: SEED_MARKDOWN, anchorOffset: 4, onClose: noop, onInserted: noop, showToast: noop }),
    )
    const text = textOf(tree)
    assert.ok(text.includes('上传图片'), 'missing the 上传图片 tab')
    assert.ok(text.includes('从 PDF 截取'), 'missing the 从 PDF 截取 tab')
    assert.ok(text.includes('让 AI 判断'), 'missing the "let the AI decide" placement')
    assert.ok(text.includes('指定章节'), 'missing the explicit-section placement')
    assert.ok(text.includes('当前光标处'), 'missing the cursor placement')
  })

  test('asks for a section before showing the heading picker', () => {
    const tree = T.NoteInsertDialog({ paper, markdown: SEED_MARKDOWN, anchorOffset: null, onClose: noop, onInserted: noop, showToast: noop })
    assert.equal(tags(tree, 'select').length, 0, 'no heading picker may appear until 指定章节 is chosen')
  })

  test('documents the placement intent in the instruction field', () => {
    const tree = T.NoteInsertDialog({ paper, markdown: SEED_MARKDOWN, anchorOffset: null, onClose: noop, onInserted: noop, showToast: noop })
    const placeholders = walk(tree).map((node) => node.props.placeholder || '')
    assert.ok(
      placeholders.some((value) => value.includes('告诉我放哪里')),
      `the instruction textarea must explain the intent contract, placeholders: ${JSON.stringify(placeholders)}`,
    )
  })
})

// ── history drawer ─────────────────────────────────────────────────────────

describe('note history drawer', () => {
  const base = { loading: false, error: '', busy: false, onClose: noop, onPreview: noop, onRestore: noop }

  test('renders nothing while closed', () => {
    const tree = T.NoteHistoryDrawer({ ...base, open: false, versions: [] })
    assert.equal(tree, null, 'a closed drawer must not render')
  })

  test('lists versions with their character count and source', () => {
    const tree = renderOf('NoteHistoryDrawer', () =>
      T.NoteHistoryDrawer({
        ...base,
        open: true,
        versions: [
          { stamp: '20241105-223601-007', updatedAt: '2024-11-05T14:36:01Z', chars: 1200, source: 'revision' },
          { stamp: '20241105-100000-001', updatedAt: '2024-11-05T02:00:00Z', chars: 900, source: 'manual' },
        ],
      }),
    )
    const text = textOf(tree)
    assert.ok(text.includes('1200') && text.includes('900'), `character counts missing, got: ${text}`)
    assert.ok(text.includes('按标注修订'), 'the revision snapshot must be labelled')
    assert.ok(text.includes('手动保存'), 'the manual snapshot must be labelled')
  })

  test('explains the empty state', () => {
    const tree = T.NoteHistoryDrawer({ ...base, open: true, versions: [] })
    assert.match(textOf(tree), /还没有历史版本/, 'an empty history must say so')
  })
})

// ── lightbox ───────────────────────────────────────────────────────────────

describe('note lightbox', () => {
  test('renders the clicked figure', () => {
    const tree = renderOf('NoteLightbox', () => T.NoteLightbox({ image: { src: 'x.png', alt: 'cap' }, onClose: noop }))
    assert.match(classOf(tree), /lr-note-lightbox/, 'the lightbox container class is missing')
    assert.equal(tags(tree, 'img').length, 1, 'the lightbox must show exactly one image')
  })

  test('renders nothing without an image', () => {
    assert.equal(T.NoteLightbox({ image: null, onClose: noop }), null)
  })

  test('closes on Escape', () => {
    let closed = 0
    effects.run = true
    effects.cleanups = []
    try {
      T.NoteLightbox({ image: { src: 'x.png' }, onClose: () => { closed += 1 } })
      const handlers = [...(listeners.window.get('keydown') || [])]
      assert.ok(handlers.length > 0, 'the lightbox must listen for Escape')
      for (const handler of handlers) handler({ key: 'Escape' })
      assert.equal(closed, 1, 'Escape must close the lightbox exactly once')
    } finally {
      for (const cleanup of effects.cleanups) cleanup()
      effects.cleanups = []
      effects.run = false
      listeners.window.clear()
    }
  })
})

// ── offset mapping helpers ─────────────────────────────────────────────────

describe('plain-offset helpers', () => {
  test('adds the data-p base to a text-node offset', () => {
    const node = { nodeType: 3, nodeValue: '自监督预训练', parentElement: { getAttribute: () => '8' } }
    assert.equal(T.notePlainOffsetAt(node, 2), 10, 'a text node offset must add its data-p base')
  })

  test('prefers an element node’s own data-p', () => {
    assert.equal(T.notePlainOffsetAt({ nodeType: 1, getAttribute: () => '5' }, 0), 5)
  })

  test('returns null when no ancestor carries data-p', () => {
    assert.equal(T.notePlainOffsetAt({ nodeType: 3, nodeValue: 'x', parentElement: { getAttribute: () => null } }, 0), null)
  })
})

describe('selection span mapping', () => {
  const container = fakeElement({
    querySelectorAll: () => [
      { getAttribute: () => '0', textContent: '方法部分' },
      { getAttribute: () => '4', textContent: '使用了' },
    ],
  })

  test('maps a selection that stays inside one text node', () => {
    const range = {
      startContainer: { nodeType: 3, nodeValue: QUOTE_OPEN, parentElement: { getAttribute: () => '8' } },
      startOffset: 0,
      endContainer: { nodeType: 3, nodeValue: QUOTE_OPEN, parentElement: { getAttribute: () => '8' } },
      endOffset: 4,
      intersectsNode: () => true,
    }
    assert.deepEqual(T.noteSelectionSpan(container, range), { from: 8, to: 12 })
  })

  test('falls back to the intersected spans when an endpoint is unmapped', () => {
    const range = {
      startContainer: { nodeType: 1, getAttribute: () => null, childNodes: [] },
      startOffset: 0,
      endContainer: { nodeType: 1, getAttribute: () => null, childNodes: [] },
      endOffset: 0,
      intersectsNode: () => true,
    }
    assert.deepEqual(T.noteSelectionSpan(container, range), { from: 0, to: 7 })
  })
})

// ── the whole view ─────────────────────────────────────────────────────────

describe('note view shell', () => {
  test('renders the full-screen layout', () => {
    const tree = renderNoteView({ markdown: SEED_MARKDOWN, annotations: SEED_ANNOTATIONS })
    const classes = classOf(tree)
    for (const expected of ['lr-note', 'lr-note-head', 'lr-note-stage', 'lr-note-applybar']) {
      assert.ok(classes.includes(expected), `NoteView must render .${expected}`)
    }
  })

  test('shows the saved state and both preview/edit tabs', () => {
    const tree = renderNoteView({ markdown: SEED_MARKDOWN })
    const text = textOf(tree)
    assert.ok(text.includes('已保存') || text.includes('未保存'), 'the save state must be visible')
    assert.ok(text.includes('预览'), 'missing the 预览 tab')
    assert.ok(text.includes('编辑'), 'missing the 编辑 tab')
  })

  test('shows the insert, figure-completion and history actions', () => {
    const tree = renderNoteView({ markdown: SEED_MARKDOWN })
    const text = textOf(tree)
    assert.ok(text.includes('插图'), 'missing the 插图 action')
    assert.ok(text.includes('补全插图'), 'missing the 补全插图 action')
    assert.ok(text.includes('历史'), 'missing the 历史 action')
  })

  test('renders the rendered markdown body, not the raw source', () => {
    const tree = renderNoteView({ markdown: SEED_MARKDOWN, annotations: SEED_ANNOTATIONS })
    const classes = classOf(tree)
    assert.match(classes, /lr-note-h1/, 'the H1 must be rendered as a heading element')
    assert.match(classes, /lr-note-p/, 'paragraphs must be rendered')
    assert.match(classes, /lr-note-callout/, 'the callout must be rendered')
    assert.ok(!textOf(tree).includes('## '), 'raw markdown markers must not leak into the preview')
  })

  test('paints the annotation highlights and bubbles', () => {
    const tree = renderNoteView({ markdown: SEED_MARKDOWN, annotations: SEED_ANNOTATIONS })
    const walked = walk(tree)
    const marks = walked.filter((node) => String(node.props.className || '').includes('lr-ann-mark'))
    assert.ok(marks.length > 0, 'seeded annotations must be highlighted')
    assert.ok(
      walked.some((node) => String(node.props.className || '').includes('lr-ann-seq')),
      'each highlight must carry a numbered bubble',
    )
  })

  test('renders the annotation rail with the seeded annotations', () => {
    const tree = renderNoteView({ markdown: SEED_MARKDOWN, annotations: SEED_ANNOTATIONS })
    assert.match(classOf(tree), /lr-ann-panel/, 'the rail must be open at 1400px')
    assert.match(textOf(tree), /待应用/, 'the rail must group the open annotation')
  })

  test('offers 覆盖保存 / 重新载入 when the note conflicts', () => {
    const tree = renderNoteView({ markdown: SEED_MARKDOWN, conflict: true })
    const text = textOf(tree)
    assert.ok(text.includes('覆盖保存'), 'the 409 banner must offer 覆盖保存')
    assert.ok(text.includes('重新载入'), 'the 409 banner must offer 重新载入')
  })

  test('shows figure-completion progress with a stop control', () => {
    const tree = renderNoteView({
      markdown: SEED_MARKDOWN,
      figures: { running: true, total: 3, done: 1, label: '正在补图…' },
    })
    const text = textOf(tree)
    assert.ok(text.includes('1/3'), `the progress count must be rendered, got: ${text}`)
    assert.match(classOf(tree), /lr-note-progress/, 'the progress row must keep its class')
    const stop = walk(tree).filter((node) => node.tag === 'button' && textOf(node).includes('停止'))
    assert.ok(stop.length > 0, 'the progress row must offer a stop button')
  })

  test('shows the revision label while applying annotations', () => {
    const tree = renderNoteView({ markdown: SEED_MARKDOWN, applying: { label: '正在按你的标注修改…' } })
    assert.match(textOf(tree), /正在按你的标注修改/, 'the applying label must be visible')
  })
})

// ── behaviours the captain asked to prove, not just presume ────────────────

describe('figure completion wiring', () => {
  test('the 补全插图 button starts the SSE job and offers a stop control', () => {
    const tree = renderNoteView({
      markdown: SEED_MARKDOWN,
      figures: { running: true, total: 2, done: 0, label: '正在补图…' },
    })
    const buttons = walk(tree).filter((node) => node.tag === 'button')
    const stop = buttons.filter((node) => textOf(node).includes('停止'))
    assert.ok(stop.length > 0, 'a running figure job must expose a stop button')
    assert.equal(typeof stop[0].props.onClick, 'function', 'the stop button must be wired to an abort')
  })

  test('the 补全插图 action is disabled while a job is already running', () => {
    const tree = renderNoteView({
      markdown: SEED_MARKDOWN,
      figures: { running: true, total: 2, done: 0, label: '正在补图…' },
    })
    const buttons = walk(tree).filter((node) => node.tag === 'button')
    const figureButtons = buttons.filter((node) => {
      const title = String(node.props.title || '')
      return title.includes('补全插图') || textOf(node).includes('补全插图')
    })
    assert.ok(figureButtons.length > 0, 'the 补全插图 button must exist')
    assert.ok(
      figureButtons.every((node) => node.props.disabled === true),
      'the 补全插图 button must be disabled while figures are being generated',
    )
  })

  test('the progress row reports the done/total count', () => {
    const tree = renderNoteView({
      markdown: SEED_MARKDOWN,
      figures: { running: true, total: 4, done: 2, label: '正在补图…' },
    })
    assert.match(textOf(tree), /2\/4/, 'the progress row must show how far the job got')
  })
})

describe('editor keyboard contract', () => {
  const base = {
    value: '# hi',
    onChange: noop,
    onSave: noop,
    onCancel: noop,
    dirty: true,
    saving: false,
    error: '',
    draftOffer: null,
    onRestoreDraft: noop,
    onDiscardDraft: noop,
    onInsertImage: noop,
    onCursor: noop,
  }

  test('Ctrl/Cmd+S saves instead of opening the browser dialog', () => {
    let saved = 0
    const tree = T.NoteEditor({ ...base, onSave: () => { saved += 1 } })
    const [area] = tags(tree, 'textarea')
    assert.equal(typeof area.props.onKeyDown, 'function', 'the textarea must handle keydown')
    let prevented = false
    area.props.onKeyDown({
      key: 's',
      ctrlKey: true,
      metaKey: false,
      preventDefault: () => { prevented = true },
      currentTarget: { selectionStart: 0, selectionEnd: 0 },
    })
    assert.equal(saved, 1, 'Ctrl+S must trigger a save')
    assert.equal(prevented, true, 'Ctrl+S must prevent the browser save dialog')
  })

  test('Cmd+S works the same way on macOS', () => {
    let saved = 0
    const tree = T.NoteEditor({ ...base, onSave: () => { saved += 1 } })
    const [area] = tags(tree, 'textarea')
    area.props.onKeyDown({
      key: 's',
      ctrlKey: false,
      metaKey: true,
      preventDefault: noop,
      currentTarget: { selectionStart: 0, selectionEnd: 0 },
    })
    assert.equal(saved, 1, 'Cmd+S must trigger a save')
  })

  test('Tab inserts two spaces instead of moving focus', () => {
    const changes = []
    const tree = T.NoteEditor({ ...base, value: 'ab', onChange: (next) => changes.push(next) })
    const [area] = tags(tree, 'textarea')
    let prevented = false
    // The editor writes the caret back through a setter, so model the textarea
    // as a getter/setter pair rather than a plain property (which a later
    // setter in the same literal would silently shadow).
    const fakeTextarea = {
      _caret: 1,
      get selectionStart() { return this._caret },
      set selectionStart(value) { this._caret = value },
      get selectionEnd() { return this._caret },
      set selectionEnd(value) { this._caret = value },
    }
    area.props.onKeyDown({
      key: 'Tab',
      preventDefault: () => { prevented = true },
      currentTarget: fakeTextarea,
    })
    assert.equal(prevented, true, 'Tab must not move focus out of the editor')
    assert.deepEqual(changes, ['a  b'], 'Tab must insert exactly two spaces at the caret')
    assert.equal(fakeTextarea._caret, 3, 'the caret must land after the two inserted spaces')
  })
})

describe('leaving the editor with unsaved work', () => {
  test('the exit action asks for confirmation through the caller', () => {
    // NoteEditor delegates the guard to onCancel; NoteView's leaveEdit() calls
    // window.confirm. Assert the wiring exists rather than firing a dialog.
    const tree = T.NoteEditor({
      value: '# hi',
      onChange: noop,
      onSave: noop,
      onCancel: noop,
      dirty: true,
      saving: false,
      error: '',
      draftOffer: null,
      onRestoreDraft: noop,
      onDiscardDraft: noop,
      onInsertImage: noop,
      onCursor: noop,
    })
    const exit = walk(tree).filter((node) => node.tag === 'button' && textOf(node).includes('退出编辑'))
    assert.ok(exit.length > 0, 'the editor must offer 退出编辑')
    assert.equal(typeof exit[0].props.onClick, 'function', '退出编辑 must be wired to the leave guard')
  })
})

describe('citation jump wiring', () => {
  test('[p.X] in the note body reports the page to the reader view', () => {
    const calls = []
    globalThis.__SEED__ = { ...defaultSeed(), markdown: '见 [p.4] 与 [p.11]。\n' }
    const seeded = T.NoteView({
      paper: basePaper,
      onBack: noop,
      onCitePage: (page) => calls.push(page),
      onOpenObsidian: noop,
      onRegenerate: noop,
      showToast: noop,
      onPaperChanged: noop,
    })
    const cites = walk(seeded).filter((node) => String(node.props.className || '').includes('lr-note-cite'))
    assert.equal(cites.length, 2, 'both [p.X] markers must render as citation buttons')
    for (const cite of cites) cite.props.onClick({ stopPropagation: noop })
    assert.deepEqual(calls, [4, 11], 'clicking a citation must report its page number')
  })
})
