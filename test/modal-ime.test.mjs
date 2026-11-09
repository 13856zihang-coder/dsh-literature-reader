import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test, { after, describe } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Regression coverage for the IME bug: typing one letter into 新建文件夹 closed
// the field, because <Modal> re-ran its effect on every render (its `onClose`
// prop is a fresh arrow at every call site) and each run scheduled
// `closeRef.focus()`, which pulled focus out of the input and aborted the
// composition. `client.js` is a browser module, so this file supplies a tiny
// React with REAL effects and a fake DOM, which is what the reader-note tests
// (whose `useEffect` is a no-op) cannot do.

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const CLIENT_FILE = path.join(ROOT, 'client.js')

/** Expose the Modal + key helpers before `factory()` returns. */
function patchClient(source) {
  const expose = `
    globalThis.__MODAL__ = {
      Modal, isComposingEvent, isActionableEnter,
      readerNoteCommandForKey, applyReaderNoteKey,
    }
    return {
      inject:`
  const out = source.replace('\n    return {\n      inject:', expose)
  assert.notEqual(out, source, 'client.js must still end the factory with `return { inject:`')
  return out
}

// ── micro React: real effects, real refs ────────────────────────────────────

let hookIndex = 0
let hookStore = []
let pendingEffects = []
let pendingCleanups = []
let focusLog = []
let timerQueue = []

function depsEqual(next, prev) {
  if (!prev) return false
  if (!next || !prev) return next === prev
  if (next.length !== prev.length) return false
  return next.every((value, index) => Object.is(value, prev[index]))
}

const tiny = {
  createElement: (type, props, ...children) => {
    const node = {
      type,
      props: props || {},
      children: children.flat(Infinity).filter((child) => child !== null && child !== undefined && typeof child !== 'boolean'),
      parent: null,
    }
    return node
  },
  Fragment: 'fragment',
  useState: (initial) => {
    const index = hookIndex++
    if (!(index in hookStore)) hookStore[index] = typeof initial === 'function' ? initial() : initial
    return [
      hookStore[index],
      (next) => {
        hookStore[index] = typeof next === 'function' ? next(hookStore[index]) : next
      },
    ]
  },
  useRef: (initial) => {
    const index = hookIndex++
    if (!(index in hookStore)) hookStore[index] = { current: initial }
    return hookStore[index]
  },
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  useEffect: (fn, deps) => {
    const index = hookIndex++
    const prev = hookStore[index]
    if (prev && depsEqual(deps, prev.deps)) return
    if (prev?.cleanup) pendingCleanups.push(prev.cleanup)
    hookStore[index] = { deps, cleanup: undefined }
    pendingEffects.push({ index, fn })
  },
  useLayoutEffect: (fn, deps) => tiny.useEffect(fn, deps),
  memo: (component) => component,
  forwardRef: (render) => render,
  createContext: (value) => ({ Provider: 'provider', Consumer: 'consumer', value }),
  useContext: () => ({}),
}

// ── fake DOM ───────────────────────────────────────────────────────────────

function fakeNode(tag, props = {}) {
  const node = {
    tag,
    get tagName() {
      return String(tag).toUpperCase()
    },
    classList: [],
    focus() {
      globalThis.document.activeElement = node
      focusLog.push(node)
    },
    contains(other) {
      if (!other) return false
      if (other === node) return true
      return node.children.some((child) => child && typeof child.contains === 'function' && child.contains(other))
    },
    closest(selector) {
      let current = node
      while (current) {
        const classes = String(current.className || '').split(/\s+/).filter(Boolean)
        if (selector === '.lr-modal' && classes.includes('lr-modal')) return current
        current = current.parent
      }
      return null
    },
    querySelector(selector) {
      return node.querySelectorAll(selector)[0] || null
    },
    querySelectorAll(selector) {
      const wanted = selector.split(',').map((part) => part.trim())
      const found = []
      const visit = (current) => {
        if (!current) return
        if (wanted.includes(current.tag)) found.push(current)
        for (const child of current.children || []) visit(child)
      }
      visit(node)
      return found
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    style: {},
  }
  Object.defineProperty(node, 'className', {
    get: () => node.classList.join(' '),
    set: (value) => {
      node.classList = String(value || '').split(/\s+/).filter(Boolean)
    },
  })
  // `<input>` exposes its type as a property; the default is `text`.
  Object.defineProperty(node, 'type', {
    get: () => String(props.type || 'text').toLowerCase(),
    configurable: true,
  })
  return node
}

function realDom(node) {
  if (!node || typeof node !== 'object') return null
  if (typeof node.type === 'function') return null // rendered separately
  const dom = fakeNode(node.type, node.props)
  dom.className = node.props?.className || ''
  dom.props = node.props || {}
  // Refs are assigned as React would, once the node exists.
  if (dom.props.ref && typeof dom.props.ref === 'object') dom.props.ref.current = dom
  dom.children = node.children.map(realDom).filter(Boolean)
  for (const child of dom.children) child.parent = dom
  return dom
}

globalThis.window = {
  __ModuleLoader__: { load: (definition) => { globalThis.__MODAL_DEF__ = definition } },
  addEventListener: () => {},
  removeEventListener: () => {},
  matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  getSelection: () => ({ rangeCount: 0 }),
}
globalThis.document = {
  activeElement: null,
  createElement: (tag) => fakeNode(tag),
  createRange: () => ({ selectNodeContents: () => {}, setStart: () => {} }),
  addEventListener: () => {},
  removeEventListener: () => {},
  body: { style: {} },
  querySelector: () => null,
}
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
}
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) })
globalThis.requestAnimationFrame = (fn) => fn()

// `setTimeout` is captured so a test decides when the 30 ms focus timer fires.
const realSetTimeout = globalThis.setTimeout
globalThis.setTimeout = (fn) => {
  timerQueue.push(fn)
  return timerQueue.length
}
globalThis.clearTimeout = () => {}

const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'lr-modal-ime-'))
after(() => rm(tmpDir, { recursive: true, force: true }))

const patchedFile = path.join(tmpDir, 'client.patched.mjs')
await writeFile(patchedFile, patchClient(await readFile(CLIENT_FILE, 'utf8')), 'utf8')
await import(pathToFileURL(patchedFile).href)
globalThis.__MODAL_DEF__.factory((id) => {
  if (id === 'react') return tiny
  throw new Error(`client.js must only require react, got ${id}`)
})
const API = globalThis.__MODAL__

// ── render driver ──────────────────────────────────────────────────────────

let tree = null
let dom = null

/**
 * Mount or re-render `Modal` with the given props. The fake DOM is built
 * before effects flush, because refs must be attached by the time the focus
 * effect runs — that ordering is what the real renderer guarantees.
 */
function renderModal(props) {
  hookIndex = 0
  pendingEffects = []
  pendingCleanups = []
  tree = API.Modal(props)
  dom = realDom(tree)
  flushEffects()
  return tree
}

function flushEffects() {
  for (const cleanup of pendingCleanups) cleanup()
  pendingCleanups = []
  const effects = pendingEffects
  pendingEffects = []
  for (const effect of effects) {
    const cleanup = effect.fn()
    hookStore[effect.index].cleanup = typeof cleanup === 'function' ? cleanup : undefined
  }
}

/** Fire the queued timers; the 30 ms focus is the only one we schedule. */
function fireTimers() {
  const queue = timerQueue
  timerQueue = []
  for (const fn of queue) fn()
}

/** The DOM node for the ✕ button and the body input, as the effect sees them. */
function closeButtonDom() {
  return dom?.querySelector('button')
}

function bodyInputDom() {
  return dom?.querySelector('input')
}

function reset() {
  hookStore = []
  timerQueue = []
  focusLog = []
  globalThis.document.activeElement = null
  globalThis.document.body.style = {}
}

// ── the bug: a keystroke must not move focus out of the field ──────────────

describe('Modal focus must survive a re-render (IME regression)', () => {
  test('typing a letter does not steal focus from the input', () => {
    reset()
    const input = { current: null }
    const child = () => {
      const node = tiny.createElement('input', { ref: input, autoFocus: true })
      return node
    }

    // Mount: React would honour autoFocus, so model that by focusing the field.
    renderModal({
      title: '新建文件夹',
      onClose: () => {},
      children: [tiny.createElement('input', { autoFocus: true })],
    })
    const field = bodyInputDom()
    assert.ok(field, 'the dialog body must contain the folder-name input')
    field.focus()
    assert.equal(globalThis.document.activeElement, field)
    fireTimers()
    assert.equal(
      globalThis.document.activeElement,
      field,
      'opening the dialog must not move focus off the auto-focused field',
    )

    // A keystroke: the parent re-renders with a brand-new `onClose` arrow, which
    // is exactly what every call site does.
    const before = focusLog.length
    renderModal({
      title: '新建文件夹',
      onClose: () => {},
      children: [tiny.createElement('input', { autoFocus: true })],
    })
    fireTimers()

    assert.equal(
      globalThis.document.activeElement,
      field,
      're-rendering on a keystroke must not pull focus out of the field',
    )
    assert.equal(focusLog.length, before, 'no extra focus() may run after a re-render')
    void child
  })

  test('a dialog without a text field falls back to focusing the close button', () => {
    reset()
    renderModal({ title: '删除', onClose: () => {}, children: [] })
    fireTimers()
    const close = closeButtonDom()
    assert.ok(close, 'the dialog must render a close button')
    assert.equal(
      globalThis.document.activeElement,
      close,
      'with no field to type into, Escape must stay reachable via the close button',
    )
  })

  test('a dialog whose field did not auto-focus gets that field focused', () => {
    reset()
    // No `autoFocus` and nothing focused yet: the fallback must pick the text
    // input rather than the ✕ button, so typing starts in the right place.
    const input = { current: null }
    renderModal({
      title: '重命名',
      onClose: () => {},
      children: [tiny.createElement('input', { ref: input })],
    })
    fireTimers()
    assert.equal(
      globalThis.document.activeElement,
      input.current,
      'the dialog must focus its text field, not its close button',
    )
    assert.notEqual(globalThis.document.activeElement, closeButtonDom())
  })

  test('a list-only dialog keeps the close button even though it has checkboxes', () => {
    reset()
    // The glossary dialog is made only of checkboxes; focusing the first one
    // would be a behaviour change unrelated to the IME bug.
    renderModal({
      title: '术语',
      onClose: () => {},
      children: [tiny.createElement('input', { type: 'checkbox' })],
    })
    fireTimers()
    const close = closeButtonDom()
    assert.equal(
      globalThis.document.activeElement,
      close,
      'a checkbox list must not become the focus target',
    )
  })

  test('the close button and Escape route use the latest onClose', () => {
    reset()
    let closed = 0
    renderModal({ title: 't', onClose: () => { closed += 1 }, children: [] })
    // Re-render with a different callback: the ref must follow the new prop.
    renderModal({ title: 't', onClose: () => { closed += 10 }, children: [] })
    const close = closeButtonDom()
    close.props.onClick()
    assert.equal(closed, 10, 'the close button must call the current onClose')
  })
})

// ── composition guards ─────────────────────────────────────────────────────

describe('IME composition guards', () => {
  const composing = { key: 'Enter', isComposing: true }
  const composingNative = { key: 'Enter', nativeEvent: { isComposing: true } }
  const processing = { key: 'Process' }
  const keyCode229 = { key: 'Enter', keyCode: 229 }

  test('every composition shape is recognised', () => {
    for (const event of [composing, composingNative, processing, keyCode229]) {
      assert.equal(API.isComposingEvent(event), true, `${JSON.stringify(event)} must count as composing`)
    }
    assert.equal(API.isComposingEvent({ key: 'Enter' }), false)
    assert.equal(API.isComposingEvent(null), false)
  })

  test('the Enter that commits a candidate is never actionable', () => {
    for (const event of [composing, composingNative, processing, keyCode229]) {
      assert.equal(API.isActionableEnter(event), false, 'a committing Enter must not submit')
      assert.equal(API.isActionableEnter(event, { modifiers: true }), false)
    }
    assert.equal(API.isActionableEnter({ key: 'Enter' }), true)
    assert.equal(API.isActionableEnter({ key: 'Enter', shiftKey: true }), true)
    assert.equal(API.isActionableEnter({ key: 'a' }), false)
    assert.equal(API.isActionableEnter({ key: 'Enter' }, { modifiers: true }), false, 'Ctrl+Enter needs the modifier')
    assert.equal(API.isActionableEnter({ key: 'Enter', ctrlKey: true }, { modifiers: true }), true)
    assert.equal(API.isActionableEnter({ key: 'Enter', metaKey: true }, { modifiers: true }), true)
  })

  test('the reader-note dock ignores keystrokes while composing', () => {
    // Escape would otherwise close the dock mid-composition…
    assert.equal(API.readerNoteCommandForKey({ key: 'Escape', isComposing: true }), null)
    // …and Ctrl+Enter would submit a half-typed note.
    assert.equal(API.readerNoteCommandForKey({ key: 'Enter', ctrlKey: true, isComposing: true }), null)
    assert.equal(API.readerNoteCommandForKey({ key: 'Process', ctrlKey: true }), null)
    // The same keys still work once the composition has finished.
    assert.deepEqual(API.readerNoteCommandForKey({ key: 'Escape' }), { action: 'close' })
    assert.deepEqual(API.readerNoteCommandForKey({ key: 'Enter', ctrlKey: true }), { action: 'submit' })
  })

  test('applying a composing key reports it as unhandled', () => {
    const base = { text: '你好', start: 2, end: 2, font: 100 }
    const composingEvent = { key: 'Enter', ctrlKey: true, isComposing: true }
    assert.deepEqual(
      API.applyReaderNoteKey({ ...base, event: composingEvent }),
      { handled: false },
      'a composing Enter must fall through to the textarea',
    )
    const submitted = API.applyReaderNoteKey({ ...base, event: { key: 'Enter', ctrlKey: true } })
    assert.equal(submitted.action, 'submit')
  })
})

// Keep the real timer referenced so the override is clearly a test-local swap.
void realSetTimeout
