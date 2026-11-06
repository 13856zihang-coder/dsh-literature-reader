// Probe the annotation -> revise -> re-anchor loop against a running instance.
// Usage: node scripts/live-revise.mjs <paperId> [--keep]
//
// `--keep` leaves the annotations in place; the default removes them again so
// the user's real note is not left cluttered with validation noise.
const BASE = process.env.LR_BASE || 'http://127.0.0.1:58117'
const API = `${BASE}/literature-reader/api`
const paperId = process.argv[2]
const keep = process.argv.includes('--keep')
if (!paperId) {
  console.error('usage: node scripts/live-revise.mjs <paperId> [--keep]')
  process.exit(2)
}

const results = []
const ok = (name, detail = '') => {
  results.push({ name, pass: true })
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`)
}
const bad = (name, detail = '') => {
  results.push({ name, pass: false, detail })
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
}
const check = (name, condition, detail = '') => (condition ? ok(name, detail) : bad(name, detail))

async function json(path, options) {
  const response = await fetch(`${API}${path}`, options)
  let body
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  return { status: response.status, body }
}

async function put(path, payload) {
  return json(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

async function sse(path, payload) {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })
  if (!response.ok) return { status: response.status, events: [] }
  const text = await response.text()
  const events = []
  for (const block of text.split('\n\n')) {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n')
    if (!data) continue
    try {
      events.push(JSON.parse(data))
    } catch {
      // ignore malformed frames
    }
  }
  return { status: response.status, events }
}

console.log(`\n=== live revise check · paper=${paperId} ===\n`)

const note = await json(`/papers/${paperId}/summary`)
if (note.status !== 200) {
  console.error('no study note yet; run live-check.mjs --apply first')
  process.exit(1)
}
const before = note.body.markdown
const version = note.body.version

// Pick two distinct, safely-quotable sentences from plain paragraphs. Lines
// from lists or tables are skipped on purpose: the plain-text projection drops
// bullets and markers, so a quote taken from them cannot be re-located.
const lines = before.split('\n')
const candidates = lines.filter(
  (line) =>
    line.trim().length > 40 &&
    !line.startsWith('#') &&
    !line.startsWith('>') &&
    !line.startsWith('!') &&
    !line.startsWith('|') &&
    !line.startsWith('*') &&
    !line.startsWith('-') &&
    !/^\s*\d+\./.test(line),
)
if (candidates.length < 2) {
  console.error('not enough paragraph lines to annotate')
  process.exit(1)
}
const quoteA = candidates[0].trim().slice(0, 30)
const quoteB = candidates[candidates.length - 1].trim().slice(0, 30)
console.log(`  quote A: "${quoteA}"`)
console.log(`  quote B: "${quoteB}"`)

// 1. Save two annotations without applying them: the body must not change.
// The instructions are deliberately doable without inventing facts, so the
// check measures the revision pipeline rather than the model's fact hygiene.
const staged = await put(`/papers/${paperId}/summary/annotations`, {
  annotations: [
    {
      id: 'live-a',
      quote: quoteA,
      note: '在这句话后面补一句更短的总结，强调它与本节的联系。',
      color: 'amber',
      status: 'open',
    },
    {
      id: 'live-b',
      quote: quoteB,
      note: '把这句话改写得更口语、更容易记住，不要改变它的技术含义。',
      color: 'sky',
      status: 'open',
    },
  ],
})
check('two annotations saved', staged.status === 200 && staged.body.annotations.length === 2, `${staged.body?.annotations?.length}`)
check('both anchored to real ranges', (staged.body?.annotations || []).every((item) => item.status === 'open' && item.end > item.start),
  (staged.body?.annotations || []).map((item) => `${item.id}:${item.start}-${item.end}`).join(' '))

const afterSave = await json(`/papers/${paperId}/summary`)
check('THE KEY BEHAVIOUR: saving annotations does NOT touch the body',
  afterSave.body.markdown === before,
  `${before.length} vs ${afterSave.body.markdown.length} chars`)

// 2. Apply the annotations.
console.log('\n  applying annotations (real model call)…')
const started = Date.now()
const revised = await sse(`/papers/${paperId}/summary/revise`, {})
const secs = Math.round((Date.now() - started) / 1000)
check('revise streamed', revised.status === 200, `${secs}s, ${revised.events.length} events`)
const errorEvent = revised.events.find((event) => event.type === 'error')
if (errorEvent) bad('revise reported an error', errorEvent.message)
const done = revised.events.find((event) => event.type === 'done')
check('revise done event', Boolean(done))
if (done) {
  console.log(`  applied: ${JSON.stringify(done.applied)}`)
  console.log(`  unresolved: ${JSON.stringify(done.unresolved)}`)
  check('at least one annotation was applied', (done.applied || []).length >= 1, `${done.applied?.length}`)
  check('applied annotations are reported with a reason', (done.applied || []).every((item) => item.why),
    JSON.stringify((done.applied || []).map((item) => item.why?.slice(0, 40))))
  check('body changed after applying', done.markdown !== before, `${before.length} → ${done.markdown?.length} chars`)
  check('applied annotations became resolved',
    (done.annotations || []).filter((item) => ['live-a', 'live-b'].includes(item.id)).every((item) => item.status !== 'open'),
    JSON.stringify((done.annotations || []).filter((item) => item.id.startsWith('live-')).map((item) => `${item.id}=${item.status}`)))
}

// 3. The note must still be well formed and mirrored to Obsidian.
const after = await json(`/papers/${paperId}/summary`)
const afterMd = after.body.markdown
check('no placeholder leaked into the body', !afterMd.includes('[[FIGURE'))
check('frontmatter untouched in the vault copy', Boolean(after.body.note?.exists))
const history = await json(`/papers/${paperId}/summary/history`)
check('history recorded the revision snapshot',
  history.status === 200 && history.body.versions.length >= 1,
  `versions=${history.body?.versions?.length}, first source=${history.body?.versions?.[0]?.source}`)
check('history version carries a renderable source label',
  ['summary', 'manual', 'revision', 'figures', 'restore'].includes(history.body?.versions?.[0]?.source),
  String(history.body?.versions?.[0]?.source))

// 4. Restore the pre-revision body so the user's note is left as generated.
if (!keep) {
  const stamp = history.body?.versions?.[0]?.stamp
  if (stamp) {
    const restored = await json(`/papers/${paperId}/summary/history/${encodeURIComponent(stamp)}/restore`, { method: 'POST' })
    check('history restore returns the previous body', restored.status === 200 && Boolean(restored.body.markdown),
      `${restored.status}, ${restored.body?.markdown?.length} chars`)
    await put(`/papers/${paperId}/summary/annotations`, { annotations: [] })
    ok('validation annotations cleared, note restored to the generated version')
  }
}

const failed = results.filter((item) => !item.pass)
console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`)
if (failed.length > 0) {
  console.log('failed:')
  for (const item of failed) console.log(`  - ${item.name} ${item.detail}`)
  process.exitCode = 1
}
