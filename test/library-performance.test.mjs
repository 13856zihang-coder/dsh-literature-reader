import assert from 'node:assert/strict'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setImmediate } from 'node:timers/promises'
import test from 'node:test'
import vm from 'node:vm'
import { PAPER_ID_RE, readJson } from '../lib/util.js'
import { createApp, seedPaper } from './helpers.mjs'

const hostSource = await readFile(new URL('../index.js', import.meta.url), 'utf8')
const clientSource = await readFile(new URL('../client.js', import.meta.url), 'utf8')

function between(source, start, end) {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from)
  assert.ok(from >= 0 && to > from, `missing source anchors: ${start} / ${end}`)
  return source.slice(from, to).trim()
}

function metadataReader(app, read = readJson) {
  const source = between(hostSource, '  async function listMetaRecords() {', '  async function listLibrary() {')
  return vm.runInNewContext(`(${source})`, {
    ready: Promise.resolve(), dirs: { papersDir: path.join(app.dataDir, 'papers') },
    readdir, path, PAPER_ID_RE, readJson: read,
  })
}

test('metadata reads overlap within a bounded batch and preserve sorting and skipped records', async () => {
  const app = await createApp()
  try {
    await Promise.all(Array.from({ length: 20 }, (_, i) => seedPaper(app, {
      id: `paper-${String(i).padStart(3, '0')}`,
      meta: { updatedAt: i % 2 ? '2026-11-08' : '2026-11-09' },
    })))
    for (const id of ['paper-missing', 'paper-invalid', 'paper-empty', 'invalid_id']) {
      await mkdir(app.paperDir(id), { recursive: true })
    }
    await writeFile(path.join(app.paperDir('paper-invalid'), 'meta.json'), '{')
    await writeFile(path.join(app.paperDir('paper-empty'), 'meta.json'), '{}')
    let active = 0
    let peak = 0
    let reads = 0
    const records = await metadataReader(app, async (file) => {
      reads += 1
      active += 1
      peak = Math.max(peak, active)
      try {
        await setImmediate()
        return await readJson(file)
      } finally {
        active -= 1
      }
    })()
    const ids = Array.from({ length: 20 }, (_, i) => `paper-${String(i).padStart(3, '0')}`)
    assert.deepEqual(Array.from(records, (record) => record.id), [
      ...ids.filter((_, i) => i % 2 === 0), ...ids.filter((_, i) => i % 2 === 1),
    ])
    assert.equal(reads, 23, 'invalid directory names must not be read')
    assert.equal(active, 0)
    assert.ok(peak > 1 && peak <= 8, `expected 2..8 pending reads, got ${peak}`)
  } finally {
    await app.close()
  }
})

test('metadata read errors retain directory order and finish pending reads before rejecting', async () => {
  const app = await createApp()
  try {
    await Promise.all(['paper-000', 'paper-001', 'paper-002'].map((id) => seedPaper(app, { id })))
    const first = new Error('first read failed')
    let active = 0
    const read = metadataReader(app, async (file) => {
      active += 1
      try {
        if (file.includes('paper-000')) {
          await setImmediate()
          throw first
        }
        if (file.includes('paper-001')) throw new Error('later read failed')
        await setImmediate()
        return await readJson(file)
      } finally {
        active -= 1
      }
    })
    await assert.rejects(read, (error) => error === first)
    assert.equal(active, 0)
  } finally {
    await app.close()
  }
})

test('vault scanning classifies each note once while retaining association priorities', async () => {
  const source = (await readFile(new URL('../lib/vault.js', import.meta.url), 'utf8'))
    .replace("'./util.js'", JSON.stringify(new URL('../lib/util.js', import.meta.url).href))
    .replace('export function isReaderNoteNote(note) {', '$&\n  counts.reader += 1')
    .replace('export function isSummaryNote(note) {', '$&\n  counts.summary += 1')
  const { scanVault, counts } = await import(`data:text/javascript;base64,${Buffer.from(
    `export const counts = { reader: 0, summary: 0 };\n${source}`,
  ).toString('base64')}`)
  const app = await createApp()
  try {
    const files = {
      'A/exact.pdf': '', 'A/linked.pdf': '', 'A/plain.pdf': '',
      'A/sub/parent.pdf': '', 'A/sub/target.pdf': '', 'A/fuzzy (2).pdf': '',
      'root.pdf': '', 'A/reader.pdf': '', 'A/legacy.pdf': '',
      'A/exact 总结.md': '---\nnote_role: summary\n---\n',
      'B/exact.md': '---\nnote_role: summary\npdf: "[[exact.pdf]]"\n---\n',
      'A/linked.md': '# ordinary same-name note',
      'B/linked.md': '---\nnote_role: summary\npdf: "[[linked.pdf]]"\n---\n',
      'A/plain.md': '# exact ordinary note',
      'B/plain.md': '[[plain.pdf]]',
      'A/parent.md': '# parent match',
      'A/target.md': '# parent match loses to target',
      'B/target.md': '[[target.pdf]]',
      'A/fuzzy-a.md': '# first equally short fuzzy match',
      'A/fuzzy-b.md': '# second equally short fuzzy match',
      'root.md': '# root note',
      'A/reader 笔记.md': '---\nnote_role: reader-note\npdf: "[[reader.pdf]]"\n---\n',
      '文献阅读/legacy 学习总结.md': '[[legacy.pdf]]',
    }
    for (const [rel, content] of Object.entries(files)) {
      const file = path.join(app.vaultPath, rel)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, content)
    }
    const scan = await scanVault(app.vaultPath, { refresh: true })
    const associations = Object.fromEntries(scan.pdfs.map((pdf) => [pdf.rel, pdf.noteRel]))
    assert.deepEqual(associations, {
      'A/exact.pdf': 'A/exact 总结.md', 'A/linked.pdf': 'B/linked.md',
      'A/plain.pdf': 'A/plain.md', 'A/sub/parent.pdf': 'A/parent.md',
      'A/sub/target.pdf': 'B/target.md', 'A/fuzzy (2).pdf': 'A/fuzzy-a.md',
      'root.pdf': 'root.md', 'A/reader.pdf': '',
      'A/legacy.pdf': '文献阅读/legacy 学习总结.md',
    })
    assert.equal(counts.reader, scan.notes.length, 'reader-note classification must be reused across PDFs')
    assert.equal(counts.summary, scan.notes.length, 'summary classification must be reused across PDFs')
  } finally {
    await app.close()
  }
})

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  return [tree, ...nodes(tree.children)]
}

function libraryRenderer() {
  const states = []
  const memos = []
  let stateAt = 0
  let memoAt = 0
  const noop = () => {}
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) {
      const at = stateAt++
      if (!(at in states)) states[at] = typeof initial === 'function' ? initial() : initial
      return [states[at], (value) => { states[at] = typeof value === 'function' ? value(states[at]) : value }]
    },
    useMemo(factory, deps) {
      const at = memoAt++
      const old = memos[at]
      if (!old || deps.some((dep, i) => !Object.is(dep, old.deps[i]))) {
        memos[at] = { deps, value: factory() }
      }
      return memos[at].value
    },
    useEffect: noop, useLayoutEffect: noop, useRef: (value) => ({ current: value }),
    useCallback: (fn) => fn, memo: (fn) => fn, forwardRef: (fn) => fn,
  }
  const sandbox = { window: { __ModuleLoader__: { load: (value) => { sandbox.definition = value } } } }
  const source = clientSource.replace('\n    return {\n      inject:',
    '\n    globalThis.Library = VaultLibraryView;\n    return {\n      inject:')
  assert.notEqual(source, clientSource)
  vm.runInNewContext(source, sandbox)
  sandbox.definition.factory(() => react)
  return (props) => {
    stateAt = 0
    memoAt = 0
    return sandbox.Library(props)
  }
}

test('library filtering is reused on unrelated renders and updates with its inputs', () => {
  const render = libraryRenderer()
  let filters = 0
  const pdfs = [
    { rel: 'A/alpha.pdf', folder: 'A', fileName: 'alpha.pdf', title: 'Alpha', stem: 'alpha', tags: [] },
    { rel: 'A/sub/beta.pdf', folder: 'A/sub', fileName: 'beta.pdf', title: 'Beta', stem: 'beta', tags: [] },
    { rel: 'B/gamma.pdf', folder: 'B', fileName: 'gamma.pdf', title: 'Gamma', stem: 'gamma', tags: [] },
  ]
  pdfs.filter = (fn) => { filters += 1; return Array.prototype.filter.call(pdfs, fn) }
  const data = {
    vault: { name: 'test' }, pdfs, notes: [], detached: [],
    stats: { folders: 2, pdfs: 3, notes: 0 },
    folders: [{ rel: 'A', name: 'A' }, { rel: 'B', name: 'B' }],
  }
  const props = { data }
  const cards = (tree) => nodes(tree).filter((node) => (node.props.className || '').split(/\s+/).includes('lr-pdf-card'))
  const search = (tree, value) => nodes(tree).find((node) => node.type === 'input' && node.props.placeholder)
    .props.onChange({ target: { value } })
  let tree = render(props)
  assert.equal(cards(tree).length, 3)
  render({ ...props, busy: 'moving' })
  assert.equal(filters, 1, 'unrelated props must not repeat the list scan')
  search(tree, ' alpha ')
  tree = render(props)
  assert.equal(cards(tree).length, 1)
  assert.equal(filters, 2)
  search(tree, '')
  tree = render(props)
  const folder = nodes(tree).find((node) => node.props.className === 'lr-folder-main'
    && node.props.title === 'A')
  assert.ok(folder, 'the A folder control must exist')
  folder.props.onClick()
  tree = render(props)
  assert.equal(cards(tree).length, 2, 'subfolders are included by default')
  nodes(tree).find((node) => node.type === 'input' && node.props.type === 'checkbox')
    .props.onChange({ target: { checked: false } })
  tree = render(props)
  assert.equal(cards(tree).length, 1, 'includeChildren must invalidate the filter')
  tree = render({ data: { ...data, pdfs: [] } })
  assert.equal(cards(tree).length, 0, 'new library data must invalidate the filter')
})
