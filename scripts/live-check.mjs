// End-to-end probe against a running DSH instance and a REAL paper.
// Usage: node scripts/live-check.mjs <paperId> [--apply]
//
// It only reads by default. `--apply` writes a real study note via the plugin
// API, which is what the user approved for this validation run.
const BASE = process.env.LR_BASE || 'http://127.0.0.1:58117'
const API = `${BASE}/literature-reader/api`
const paperId = process.argv[2]
const apply = process.argv.includes('--apply')
if (!paperId) {
  console.error('usage: node scripts/live-check.mjs <paperId> [--apply]')
  process.exit(2)
}

const results = []
function ok(name, detail = '') {
  results.push({ name, pass: true, detail })
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`)
}
function bad(name, detail = '') {
  results.push({ name, pass: false, detail })
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
}
function check(name, condition, detail = '') {
  condition ? ok(name, detail) : bad(name, detail)
}

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

async function sse(path, body) {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  if (!response.ok) {
    let detail
    try {
      detail = await response.json()
    } catch {
      detail = undefined
    }
    return { status: response.status, events: [], detail }
  }
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
      // ignore a malformed frame
    }
  }
  return { status: response.status, events }
}

console.log(`\n=== live check · paper=${paperId} · apply=${apply} ===\n`)

// 1. Health
{
  const health = await json('/health')
  check('health responds', health.status === 200)
  check('model can see images (needed for figure capture)', Boolean(health.body?.supportImages),
    health.body ? `${health.body.model}` : 'no body')
  check('poppler available', Boolean(health.body?.poppler))
}

// 2. New read routes
{
  const annotations = await json(`/papers/${paperId}/summary/annotations`)
  check('GET /summary/annotations', annotations.status === 200 && Array.isArray(annotations.body?.annotations),
    `count=${annotations.body?.annotations?.length}`)

  const history = await json(`/papers/${paperId}/summary/history`)
  const versions = history.body?.versions
  // A 200 here already proves the new host build is live: the route did not
  // exist before this feature landed.
  check('GET /summary/history (proves the new host build is live)',
    history.status === 200 && Array.isArray(versions),
    `versions=${versions?.length}`)
  if (Array.isArray(versions) && versions.length > 0) {
    check('history list carries a source field', versions.every((item) => 'source' in item),
      JSON.stringify(versions[0]))
  }

  const before = await json(`/papers/${paperId}/summary`)
  check('GET /summary answers with a payload or an explicit "not generated" 404',
    before.status === 200 || before.status === 404,
    `${before.status}`)
}

// 3. Guards
{
  const traversal = await json(`/papers/${paperId}/figure/..%2F..%2Fmeta.json`)
  check('figure route rejects traversal', traversal.status === 400 || traversal.status === 404, `${traversal.status}`)
  const badStamp = await json(`/papers/${paperId}/summary/history/not-a-stamp`)
  check('history preview rejects a malformed stamp with 404', badStamp.status === 404, `${badStamp.status}`)
  const unknown = await json('/papers/does-not-exist-000/summary')
  check('unknown paper is rejected', unknown.status === 404, `${unknown.status}`)
}

// 4. Generate the study note (the user approved a real run)
let done
if (apply) {
  console.log('\n--- generating a study note (real model call, may take a few minutes) ---')
  const started = Date.now()
  const result = await sse(`/papers/${paperId}/summary`, {})
  const secs = Math.round((Date.now() - started) / 1000)
  check('POST /summary streamed to completion', result.status === 200, `${secs}s, ${result.events.length} events`)
  const errorEvent = result.events.find((event) => event.type === 'error')
  if (errorEvent) bad('generation reported an error', errorEvent.message)
  const statuses = result.events.filter((event) => event.type === 'status').map((event) => event.label)
  console.log(`  statuses: ${statuses.join(' → ')}`)
  done = result.events.find((event) => event.type === 'done')
  check('done event received', Boolean(done))
  if (done) {
    check('done carries figures/figureFailures arrays',
      Array.isArray(done.figures) && Array.isArray(done.figureFailures),
      `figures=${done.figures?.length} failures=${done.figureFailures?.length}`)
    check('note written into the vault', Boolean(done.hasNote), done.relative || done.openError || '')
    check('tags extracted', Array.isArray(done.tags) && done.tags.length > 0, (done.tags || []).join(', '))
  }
}

// 5. Inspect the generated note
if (apply) {
  const note = await json(`/papers/${paperId}/summary`)
  check('GET /summary returns the new note', note.status === 200)
  const md = note.body?.markdown || ''
  check('note follows the study-note template (abstract callout)', md.includes('[!abstract]'))
  check('note has the numbered sections', /## 1\./.test(md) && /## 10\./.test(md))
  check('no raw figure placeholder survives', !md.includes('[[FIGURE'))
  console.log(`  note: ${md.length} chars, ${md.split('\n').length} lines`)
  const headings = md.split('\n').filter((line) => /^##\s/.test(line))
  console.log('  headings:')
  for (const heading of headings) console.log(`    ${heading}`)
  if (/!\[[^\]]*\]\(/.test(md)) {
    const images = md.match(/!\[[^\]]*\]\([^)]+\)/g) || []
    console.log(`  images: ${images.length}`)
    for (const image of images.slice(0, 8)) console.log(`    ${image}`)
  }

  // 6. Stand-in for the annotation → revise loop, using the real note.
  const lines = md.split('\n')
  const target = lines.find((line) => line.trim().length > 30 && !line.startsWith('#') && !line.startsWith('>'))
  if (target) {
    const quote = target.trim().slice(0, 24)
    const saved = await json(`/papers/${paperId}/summary/annotations`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        annotations: [{
          id: `live-${Date.now()}`,
          quote,
          note: '这条标注来自端到端验证，用来确认修订链路可用。',
          color: 'amber',
          status: 'open',
        }],
      }),
    })
    check('PUT /summary/annotations accepts a real quote',
      saved.status === 200 && Array.isArray(saved.body?.annotations),
      saved.status === 200 ? `anchored=${saved.body?.annotations?.length}` : JSON.stringify(saved.body))

    const anchored = saved.body?.annotations?.find((item) => item.id?.startsWith('live-'))
    if (anchored) {
      check('annotation was anchored to a source range',
        anchored.status === 'open' && Number.isFinite(anchored.start) && anchored.end > anchored.start,
        `${anchored.start}..${anchored.end} "${quote}"`)
    }
  }
}

const failed = results.filter((item) => !item.pass)
console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`)
if (failed.length > 0) {
  console.log('failed:')
  for (const item of failed) console.log(`  - ${item.name} ${item.detail}`)
  process.exitCode = 1
}
