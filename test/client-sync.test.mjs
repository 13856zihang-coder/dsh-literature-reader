import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

// Cross-checks between the Node side and the single-file browser module:
//   1. the `#region markdown-core` text in client.js is byte-identical to
//      lib/markdown-core.js (spec §1/§4),
//   2. every locale key the client asks for exists in both `zh` and `en`
//      (spec §9),
//   3. client.js loads as a browser module (mocked `window.__ModuleLoader__`
//      plus a minimal react stub) and `apply()` runs against a fake ctx.

const ROOT = path.resolve(import.meta.dirname, '..')
const CLIENT_FILE = path.join(ROOT, 'client.js')
const CORE_FILE = path.join(ROOT, 'lib', 'markdown-core.js')
const REGION_START = '// #region markdown-core'
const REGION_END = '// #endregion markdown-core'

const CORE_EXPORTS = [
  'parseMarkdown',
  'plainProjection',
  'locateQuote',
  'mapPlainToSource',
  'applyReplacements',
  'findFigurePlaceholders',
]

async function readSource(file) {
  return readFile(file, 'utf8')
}

/** Slice out an inclusive `#region` … `#endregion` block (throws when absent). */
function regionOf(source, file) {
  const start = source.indexOf(REGION_START)
  assert.ok(start >= 0, `${file} must contain ${REGION_START}`)
  const end = source.indexOf(REGION_END, start)
  assert.ok(end >= 0, `${file} must contain ${REGION_END}`)
  return source.slice(start, end + REGION_END.length)
}

function countOccurrences(source, needle) {
  let count = 0
  let at = source.indexOf(needle)
  while (at !== -1) {
    count += 1
    at = source.indexOf(needle, at + needle.length)
  }
  return count
}

/**
 * Read the object literal assigned by `marker` (`const zh = {` …) with a
 * brace matcher that skips string literals, then evaluate it as plain data.
 */
function objectLiteralAfter(source, marker) {
  const markerAt = source.indexOf(marker)
  assert.ok(markerAt >= 0, `client.js must contain ${marker}`)
  const start = source.indexOf('{', markerAt)
  assert.ok(start >= 0, `${marker} must be followed by an object literal`)
  let depth = 0
  let quote = ''
  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (char === '\\') index += 1
      else if (char === quote) quote = ''
      continue
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  throw new Error(`unterminated object literal after ${marker}`)
}

function localeDict(source, language) {
  const literal = objectLiteralAfter(source, `const ${language} = {`)
  const value = vm.runInNewContext(`(${literal})`, Object.create(null), { timeout: 1_000 })
  assert.equal(typeof value, 'object')
  assert.ok(value !== null)
  for (const [key, text] of Object.entries(value)) {
    assert.equal(typeof text, 'string', `${language}.${key} must be a string`)
  }
  return value
}

/** Every `t('literal')` key in the file (dynamic keys would be a bug). */
function usedLocaleKeys(source) {
  const keys = new Set()
  for (const match of source.matchAll(/(?<![\w.$])t\(\s*'([^']*)'/g)) keys.add(match[1])
  return keys
}

/**
 * Load client.js the way the DSH web client does: it calls
 * `window.__ModuleLoader__.load({id, factory})` at the top level.
 */
function loadClientModule(source) {
  let definition
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(value) {
          definition = value
        },
      },
    },
    console,
  }
  vm.runInNewContext(source, sandbox, { filename: 'client.js', timeout: 10_000 })
  assert.ok(definition, 'client.js must register itself through window.__ModuleLoader__')
  assert.equal(typeof definition.id, 'string')
  assert.ok(definition.id.length > 0)
  assert.equal(typeof definition.factory, 'function')
  return definition
}

/** Minimal react stub: enough to evaluate the module and render one tree. */
function reactStub() {
  const state = []
  const stub = {
    state,
    createElement(type, props, ...children) {
      return { type, props: props || {}, children }
    },
    memo(component) {
      return component
    },
    forwardRef(render) {
      return render
    },
    useState(initial) {
      const value = typeof initial === 'function' ? initial() : initial
      state.push(value)
      return [value, () => {}]
    },
    useReducer(reducer, initial) {
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
    useId() {
      return 'id'
    },
  }
  return stub
}

/** Fake plugin context for `apply()`: locale + slots are the only injections. */
function fakeClientContext() {
  const registrations = []
  const localeDicts = new Map()
  const t = (key) => `{${key}}`
  const ctx = {
    effect(fn) {
      const dispose = fn()
      return typeof dispose === 'function' ? dispose : () => {}
    },
    locale: {
      register(namespace, dicts) {
        localeDicts.set(namespace, dicts)
        return () => {}
      },
      bind(namespace) {
        return (key) => `{${namespace}:${key}}`
      },
    },
    slots: {
      inject(name, fn) {
        return fn()
      },
      register(props, component) {
        registrations.push({ props, component })
        return () => {}
      },
    },
  }
  return { ctx, registrations, localeDicts, t }
}

async function loadAndApply() {
  const source = await readSource(CLIENT_FILE)
  const definition = loadClientModule(source)
  const required = []
  const react = reactStub()
  const exported = definition.factory((id) => {
    required.push(id)
    if (id === 'react') return react
    throw new Error(`client.js must only require('react'), got ${id}`)
  })
  assert.deepEqual(required, ['react'], 'client.js may only require react (spec §1)')
  const { ctx, registrations, localeDicts } = fakeClientContext()
  assert.doesNotThrow(() => exported.apply(ctx), 'apply() must not throw against a valid ctx')
  return { source, exported, registrations, localeDicts, react, required }
}

test('the markdown-core region in client.js is byte-identical to lib/markdown-core.js', async () => {
  const [core, client] = await Promise.all([readSource(CORE_FILE), readSource(CLIENT_FILE)])
  const coreRegion = regionOf(core, 'lib/markdown-core.js')
  const clientRegion = regionOf(client, 'client.js')

  assert.equal(countOccurrences(core, REGION_START), 1, 'lib must declare the region exactly once')
  assert.equal(countOccurrences(client, REGION_START), 1, 'client.js must paste the region exactly once')
  assert.equal(
    clientRegion,
    coreRegion,
    'client.js region drifted from lib/markdown-core.js; re-paste it verbatim (spec §1)',
  )
  // Same line count is implied by byte equality, but state it for a clearer diff.
  assert.equal(clientRegion.split('\n').length, coreRegion.split('\n').length)
})

test('the shared region stays browser-safe and exports the six contract functions', async () => {
  const core = await readSource(CORE_FILE)
  const region = regionOf(core, 'lib/markdown-core.js')
  for (const forbidden of [/\bexport\b/, /\bimport\b/, /\brequire\s*\(/, /node:/, /\bprocess\./, /\bwindow\./, /\bdocument\./]) {
    assert.doesNotMatch(region, forbidden, `the shared region must not contain ${forbidden}`)
  }
  // Everything the client and the host rely on must be defined inside the region.
  for (const name of CORE_EXPORTS) {
    assert.match(region, new RegExp(`function ${name}\\s*\\(`), `${name} must be defined inside the region`)
  }
  // The region evaluates to plain functions in a bare factory scope.
  const api = vm.runInNewContext(
    `${region}\n;({ ${CORE_EXPORTS.join(', ')} })`,
    Object.create(null),
    { timeout: 5_000 },
  )
  for (const name of CORE_EXPORTS) assert.equal(typeof api[name], 'function', `${name} must be callable`)
  const parsed = api.parseMarkdown('# 标题\n\n正文 **加粗** [p.3]\n')
  assert.ok(Array.isArray(parsed.blocks) && parsed.blocks.length >= 2)
})

test('every locale key used by the client exists in both zh and en (spec §9)', async () => {
  const source = await readSource(CLIENT_FILE)
  const zh = localeDict(source, 'zh')
  const en = localeDict(source, 'en')
  const used = usedLocaleKeys(source)

  assert.ok(Object.keys(zh).length > 300, 'the zh dictionary looks truncated')
  assert.ok(used.size > 300, 'the t() scan found too few keys; the pattern may have drifted')

  const missingZh = [...used].filter((key) => !(key in zh))
  const missingEn = [...used].filter((key) => !(key in en))
  assert.deepEqual(missingZh, [], `t() keys missing from zh: ${missingZh.join(', ')}`)
  assert.deepEqual(missingEn, [], `t() keys missing from en: ${missingEn.join(', ')}`)

  const zhOnly = Object.keys(zh).filter((key) => !(key in en))
  const enOnly = Object.keys(en).filter((key) => !(key in zh))
  assert.deepEqual(zhOnly, [], `zh-only keys: ${zhOnly.join(', ')}`)
  assert.deepEqual(enOnly, [], `en-only keys: ${enOnly.join(', ')}`)

  // Translated strings must carry the same placeholders, otherwise a language
  // switch silently drops a value.
  const placeholders = (text) => [...String(text).matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]).sort()
  const mismatched = Object.keys(zh).filter(
    (key) => placeholders(zh[key]).join(',') !== placeholders(en[key]).join(','),
  )
  assert.deepEqual(mismatched, [], `locale placeholders differ: ${mismatched.join(', ')}`)
})

test('client.js loads through window.__ModuleLoader__ and apply() runs on a fake ctx', async () => {
  const { exported, registrations, localeDicts, required } = await loadAndApply()
  // The module object comes from the vm realm, so compare plain copies.
  assert.deepEqual(Array.from(exported.inject), ['slots', 'locale', 'layout'])
  assert.deepEqual(required, ['react'])

  // Both slots are registered and the locale dictionary is handed to the host.
  const names = registrations.map((entry) => entry.props?.name).filter(Boolean)
  assert.ok(names.includes('main'), 'the main panel slot must be registered')
  assert.ok(names.includes('sidebar.panellist'), 'the sidebar entry must be registered')
  for (const entry of registrations) {
    assert.ok(entry.props.locale, `${entry.props.name} must declare its locale namespace`)
    assert.equal(typeof entry.component, 'function')
  }
  const dicts = [...localeDicts.values()][0]
  assert.ok(dicts, 'apply() must register the locale dictionary')
  assert.ok(dicts.zh && dicts.en)
})

test('the registered note view is wired to the spec §7 routes', async () => {
  const source = await readSource(CLIENT_FILE)
  // The UI must talk to the host endpoints the spec defines, not invent new ones.
  for (const route of [
    '/summary',
    '/summary/annotations',
    '/summary/revise',
    '/summary/history',
    '/summary/history/',
    '/summary/images',
    '/summary/figures',
    '/place',
    '/figure/',
  ]) {
    assert.ok(source.includes(route), `client.js never references ${route}`)
  }
  assert.match(source, /status === 'needs_question'/, 'the client must handle the AI question state')
  assert.match(source, /fallback/, 'the client should surface the "inserted at the end" fallback')
})
