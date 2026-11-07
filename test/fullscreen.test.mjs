import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test, { describe } from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

// Fullscreen entry point and the removal of the old bottom-left hint.
//
// client.js is a browser module. The factory is loaded through a mocked
// ModuleLoader with a minimal React stub; the module-level fullscreen helpers
// and the toolbar button are exposed by the same test-only patch used by the
// note-render suites. Nothing here touches a real DOM: the fake document owns
// `fullscreenElement`, and the fake nodes record the request calls, so the
// success, failure and WebKit-fallback paths are all deterministic.

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const CLIENT_FILE = path.join(ROOT, 'client.js')
const HINT_TEXT = '在页面上拖动框选内容'

function reactStub() {
  return {
    createElement(type, props, ...children) {
      return { type, props: props || {}, children }
    },
    memo(component) {
      return component
    },
    useState(initial) {
      return [typeof initial === 'function' ? initial() : initial, () => {}]
    },
    useEffect() {},
    useLayoutEffect() {},
    useRef(value) {
      return { current: value }
    },
    useMemo(factory) {
      return factory()
    },
    useCallback(fn) {
      return fn
    },
  }
}

/** Expose the module-scope fullscreen API before factory() returns. */
function patchClient(source) {
  const expose = `
    window.__LR_FULLSCREEN__ = {
      fullscreenElement, enterFullscreen, exitFullscreen, FullscreenButton,
      hostLayoutFrame, hostSidebarCollapsed,
    }
    return {
      inject:`
  const out = source.replace('\n    return {\n      inject:', expose)
  assert.notEqual(out, source, 'client.js must still end the factory with `return { inject:`')
  return out
}

function fakeDocument() {
  return {
    fullscreenElement: null,
    webkitFullscreenElement: null,
    exitFullscreen: undefined,
    webkitExitFullscreen: undefined,
    querySelector: () => null,
  }
}

async function loadClient() {
  const source = patchClient(await readFile(CLIENT_FILE, 'utf8'))
  const doc = fakeDocument()
  const sandbox = {
    window: { __ModuleLoader__: { load(definition) { sandbox.window.__definition__ = definition } } },
    document: doc,
  }
  vm.runInNewContext(source, sandbox, { filename: 'client.js', timeout: 10_000 })
  const definition = sandbox.window.__definition__
  assert.ok(definition, 'client.js must register itself through window.__ModuleLoader__')
  const exported = definition.factory((id) => {
    if (id === 'react') return reactStub()
    throw new Error(`client.js must only require('react'), got ${id}`)
  })
  assert.deepEqual(Array.from(exported.inject), ['slots', 'locale', 'layout'])
  assert.ok(sandbox.window.__LR_FULLSCREEN__, 'the patched factory must expose the fullscreen API')
  return { source, doc, api: sandbox.window.__LR_FULLSCREEN__ }
}

/** Expand function components so the assertions see the rendered button. */
function walk(node, out = []) {
  if (node === null || node === undefined || node === false) return out
  if (Array.isArray(node)) {
    for (const item of node) walk(item, out)
    return out
  }
  if (typeof node === 'string' || typeof node === 'number') {
    out.push({ text: String(node), props: {} })
    return out
  }
  if (typeof node.type === 'function') {
    walk(node.type(node.props || {}), out)
    return out
  }
  out.push({ tag: node.type, props: node.props || {}, children: node.children || [] })
  for (const child of node.children || []) walk(child, out)
  return out
}

const byTag = (tree, tag) => walk(tree).filter((node) => node.tag === tag)
const textOf = (tree) => walk(tree).filter((node) => node.text !== undefined).map((node) => node.text).join(' ')

describe('fullscreen toolbar button', () => {
  test('offers 全屏 when inactive and 退出全屏 when active', async () => {
    const { api } = await loadClient()
    const noop = () => {}

    const inactive = byTag(api.FullscreenButton({ active: false, onClick: noop }), 'button')
    assert.equal(inactive.length, 1, 'the fullscreen control must be one button')
    assert.equal(inactive[0].props['aria-label'], '全屏')
    assert.equal(inactive[0].props['aria-pressed'], 'false')
    assert.match(inactive[0].props.className, /lr-fullscreen-tool/)
    assert.match(textOf(api.FullscreenButton({ active: false, onClick: noop })), /全屏/)
    assert.equal(typeof inactive[0].props.onClick, 'function')

    const active = byTag(api.FullscreenButton({ active: true, onClick: noop }), 'button')
    assert.equal(active[0].props['aria-label'], '退出全屏')
    assert.equal(active[0].props['aria-pressed'], 'true')
    assert.match(textOf(api.FullscreenButton({ active: true, onClick: noop })), /退出全屏/)
  })

  test('wires the button to the supplied handler', async () => {
    const { api } = await loadClient()
    let clicks = 0
    const button = byTag(api.FullscreenButton({ active: false, onClick: () => { clicks += 1 } }), 'button')[0]
    button.props.onClick()
    assert.equal(clicks, 1, 'clicking the button must call the toggle handler')
  })
})

describe('fullscreen helpers', () => {
  test('enterFullscreen requests the node and fullscreenElement reports it', async () => {
    const { api, doc } = await loadClient()
    let requested = 0
    const node = {
      requestFullscreen() {
        requested += 1
        doc.fullscreenElement = node
        return Promise.resolve()
      },
    }

    assert.equal(api.fullscreenElement(), null)
    assert.equal(await api.enterFullscreen(node), true)
    assert.equal(requested, 1)
    assert.equal(api.fullscreenElement(), node)
  })

  test('exitFullscreen calls document.exitFullscreen and clears the element', async () => {
    const { api, doc } = await loadClient()
    const node = { requestFullscreen: () => { doc.fullscreenElement = node; return Promise.resolve() } }
    doc.exitFullscreen = () => {
      doc.fullscreenElement = null
      return Promise.resolve()
    }

    await api.enterFullscreen(node)
    assert.equal(api.fullscreenElement(), node)
    assert.equal(await api.exitFullscreen(), true)
    assert.equal(api.fullscreenElement(), null)
  })

  test('reports failure instead of throwing when the browser refuses', async () => {
    const { api } = await loadClient()
    assert.equal(await api.enterFullscreen(null), false)
    assert.equal(await api.enterFullscreen({}), false)
    assert.equal(
      await api.enterFullscreen({ requestFullscreen: () => Promise.reject(new Error('denied')) }),
      false,
    )
    assert.equal(
      await api.enterFullscreen({ requestFullscreen: () => { throw new Error('sync failure') } }),
      false,
    )
  })

  test('reports failure when document.exitFullscreen is unavailable or rejects', async () => {
    const { api, doc } = await loadClient()
    assert.equal(await api.exitFullscreen(), false, 'no exitFullscreen means an honest false')

    doc.exitFullscreen = () => Promise.reject(new Error('not fullscreen'))
    assert.equal(await api.exitFullscreen(), false)

    doc.exitFullscreen = () => { throw new Error('sync failure') }
    assert.equal(await api.exitFullscreen(), false)
  })

  test('supports the WebKit-prefixed spellings', async () => {
    const { api, doc } = await loadClient()
    const node = {
      webkitRequestFullscreen() {
        doc.webkitFullscreenElement = node
      },
    }
    assert.equal(await api.enterFullscreen(node), true)
    assert.equal(api.fullscreenElement(), node)

    doc.webkitExitFullscreen = () => {
      doc.webkitFullscreenElement = null
    }
    assert.equal(await api.exitFullscreen(), true)
    assert.equal(api.fullscreenElement(), null)
  })
})

describe('host layout helpers', () => {
  test('reads the sidebar state from the documented shell markers', async () => {
    const { api, doc } = await loadClient()
    const frame = {
      hasAttribute(name) {
        return name === 'data-sidebar-collapsed' ? frame.collapsed : false
      },
      collapsed: false,
    }
    const overlay = { parentElement: frame }
    doc.querySelector = (selector) => (selector === '[data-shell-overlay]' ? overlay : null)

    assert.equal(api.hostLayoutFrame(), frame)
    assert.equal(api.hostSidebarCollapsed(), false)
    frame.collapsed = true
    assert.equal(api.hostSidebarCollapsed(), true)
  })

  test('returns null outside the Harness shell instead of guessing', async () => {
    const { api, doc } = await loadClient()
    assert.equal(api.hostLayoutFrame(), null)
    assert.equal(api.hostSidebarCollapsed(), null)

    doc.querySelector = () => ({ parentElement: null })
    assert.equal(api.hostSidebarCollapsed(), null)
  })
})

describe('fullscreen wiring and hint removal', () => {
  test('fullscreens the page root and mounts the toolbar button', async () => {
    const { source } = await loadClient()
    assert.match(
      source,
      /enterFullscreen\(document\.documentElement\)/,
      'the page root must be the fullscreen element so host overlays stay mounted',
    )
    assert.ok(!source.includes('rootRef'), 'the reader root no longer owns fullscreen state')
    assert.match(
      source,
      /h\(FullscreenButton, \{ active: fullscreen, onClick: toggleFullscreen \}\)/,
      'the reading toolbar must mount the fullscreen button',
    )
    assert.match(source, /fullscreenElement\(\) === document\.documentElement/, 'Esc exit must sync back into React')
    assert.match(source, /fullscreenchange/, 'the browser fullscreen events must be observed')
  })

  test('the sidebar is collapsed on entry and restored on exit', async () => {
    const { source } = await loadClient()
    assert.match(source, /hostSidebarCollapsed\(\) === false/, 'only an open sidebar should be collapsed')
    assert.match(source, /layoutService\.toggleSidebar\(\)/, 'the hosted layout API must perform the collapse')
    assert.match(source, /sidebarCollapsedByUs\.current = true/)
    assert.match(source, /restoreSidebarAfterFullscreen/, 'the exit path must restore a sidebar this mode closed')
    assert.match(source, /fullscreenOwner\.current/, 'unmounting must exit a page fullscreen this mode owns')
  })

  test('fullscreen hides the plugin title row and the Windows caption strip', async () => {
    const { source } = await loadClient()
    assert.match(source, /html:fullscreen\{--dsh-windows-titlebar-height:0px!important\}/)
    assert.match(source, /html:fullscreen \.lr-header\{display:none\}/)
    assert.match(source, /html:fullscreen \[data-windows-menu\]\{display:none!important\}/)
    assert.match(
      source,
      /html:fullscreen \[data-sidebar-collapsed\] > :first-child\{display:none!important\}/,
      'the collapsed sidebar rail controls must not float over the reader',
    )
    assert.match(source, /html:fullscreen \[data-shell-leading\]\{display:none!important\}/)
    assert.ok(!source.includes('.lr-root:fullscreen'), 'the reader root must no longer be the fullscreen target')
    assert.match(source, /\.lr-fullscreen-tool\{margin-left:auto\}/, 'the button must sit at the right edge')
  })

  test('the bottom-left drag hint is gone from markup and styles', async () => {
    const { source } = await loadClient()
    assert.ok(!source.includes('lr-hint-pill'), 'the hint pill must not survive in JSX or CSS')
    assert.ok(!source.includes(HINT_TEXT), 'the selection hint copy must be removed')
    assert.ok(!source.includes('selectionHint'), 'the selectionHint locale key must be removed')
    assert.ok(!source.includes('panHint'), 'the pan-mode hint copy must be removed too')
  })
})
