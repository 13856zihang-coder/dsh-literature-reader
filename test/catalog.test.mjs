import assert from 'node:assert/strict'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { createApp, seedPaper, PAPER_ID } from './helpers.mjs'

async function fixture(t) {
  const app = await createApp()
  t.after(() => app.close())
  await mkdir(path.join(app.vaultPath, 'papers'))
  await writeFile(path.join(app.vaultPath, 'papers/a.pdf'), '%PDF catalog fixture')
  await writeFile(path.join(app.vaultPath, 'papers/a 总结.md'), '---\r\ntitle: "原标题"\r\ntags: [old]\r\nnote_role: summary\r\ncustom: keep\r\n---\r\n\r\n# 正文\r\n正文不能改变。\r\n')
  const response = await app.post('/vault/catalog/refresh')
  assert.equal(response.status, 200, response.text)
  return app
}

test('catalog registration and reads do not parse PDFs, create notes or infer reading completion', async (t) => {
  const app = await fixture(t)
  const response = await app.get('/vault/catalog')
  assert.equal(response.status, 200)
  assert.equal(response.json().total, 2)
  const pdf = response.json().items.find((item) => item.type === 'pdf')
  assert.equal(pdf.title, '原标题')
  assert.equal(pdf.readingState, 'unread')
  assert.equal(pdf.sourceRel, 'papers/a 总结.md')
  assert.equal(app.calls.length, 0)
  const before = await readFile(path.join(app.dataDir, 'catalog.json'), 'utf8')
  await app.get('/vault/catalog')
  assert.equal(await readFile(path.join(app.dataDir, 'catalog.json'), 'utf8'), before)
})

test('catalog shares title/tags with Markdown without changing body or unrelated frontmatter', async (t) => {
  const app = await fixture(t)
  const pdf = (await app.get('/vault/catalog')).json().items.find((item) => item.type === 'pdf')
  const detail = (await app.get(`/vault/catalog/${pdf.id}`)).json().item
  const response = await app.request('PATCH', `/vault/catalog/${pdf.id}`, {
    revision: detail.revision, sourceVersion: detail.sourceVersion,
    patch: { title: '人工标题', tags: ['new'], authors: ['作者'], year: 2026, importance: 'high', readingState: 'read' },
  })
  assert.equal(response.status, 200, response.text)
  const raw = await readFile(path.join(app.vaultPath, 'papers/a 总结.md'), 'utf8')
  assert.match(raw, /title: "人工标题"/)
  assert.match(raw, /custom: keep\r\n/)
  assert.ok(raw.endsWith('---\r\n\r\n# 正文\r\n正文不能改变。\r\n'))
  assert.equal(response.json().item.importance, 'high')
  assert.equal(response.json().item.readingState, 'read')
  assert.ok(response.json().item.readAt)
})

test('catalog rejects stale revisions and external Markdown edits without overwriting either file', async (t) => {
  const app = await fixture(t)
  const pdf = (await app.get('/vault/catalog')).json().items.find((item) => item.type === 'pdf')
  const detail = (await app.get(`/vault/catalog/${pdf.id}`)).json().item
  const file = path.join(app.vaultPath, 'papers/a 总结.md')
  await writeFile(file, '# 外部编辑\n不能覆盖\n')
  const response = await app.request('PATCH', `/vault/catalog/${pdf.id}`, {
    revision: detail.revision, sourceVersion: detail.sourceVersion, patch: { title: '不应保存' },
  })
  assert.equal(response.status, 409)
  assert.equal(await readFile(file, 'utf8'), '# 外部编辑\n不能覆盖\n')
})

test('catalog preserves identities after external moves and never adopts another same-name same-size paper', async (t) => {
  const app = await fixture(t)
  await seedPaper(app, { meta: { vaultPath: 'papers/a.pdf', fileName: 'a.pdf', fileSize: 20 } })
  await app.post('/vault/catalog/refresh')
  const original = (await app.get('/vault/catalog')).json().items.find((item) => item.type === 'pdf')
  await mkdir(path.join(app.vaultPath, 'other'))
  await rename(path.join(app.vaultPath, 'papers/a.pdf'), path.join(app.vaultPath, 'other/a.pdf'))
  await app.post('/vault/catalog/refresh')
  const item = (await app.get(`/vault/catalog/${original.id}`)).json().item
  assert.equal(item.rel, 'papers/a.pdf')
  assert.equal(item.fileState, 'needs_relink')
  assert.equal((await app.readMeta(PAPER_ID)).vaultPath, 'papers/a.pdf')
  const relink = await app.post(`/vault/catalog/${original.id}/relink`, { rel: 'other/a.pdf', revision: item.revision, confirmed: true })
  assert.equal(relink.status, 200, relink.text)
  assert.equal(relink.json().item.id, original.id)
  assert.equal((await app.readMeta(PAPER_ID)).vaultPath, 'other/a.pdf')
})

test('catalog supports batch metadata, combination filters, pagination and saved views', async (t) => {
  const app = await fixture(t)
  const items = (await app.get('/vault/catalog')).json().items
  const details = await Promise.all(items.map(async (item) => (await app.get(`/vault/catalog/${item.id}`)).json().item))
  const batch = await app.post('/vault/catalog/batch', { items: details.map(({ id, revision, sourceVersion }) => ({ id, revision, sourceVersion })), patch: { addTags: ['review'], importance: 'high' } })
  assert.equal(batch.status, 200, batch.text)
  const found = (await app.get('/vault/catalog?tags=review&importance=high&type=pdf&pageSize=1')).json()
  assert.equal(found.total, 1)
  assert.equal(found.items.length, 1)
  const view = await app.post('/vault/views', { name: '重要文献', query: { tags: ['review'], importance: 'high' } })
  assert.equal(view.status, 200, view.text)
  assert.equal((await app.get('/vault/views')).json().views[0].name, '重要文献')
  assert.equal((await app.delete(`/vault/views/${view.json().view.id}`)).status, 200)
})

test('catalog does not reset a corrupt or unknown schema file', async (t) => {
  const app = await createApp()
  t.after(() => app.close())
  await mkdir(app.dataDir, { recursive: true })
  const file = path.join(app.dataDir, 'catalog.json')
  const raw = '{"schema":999,"records":[{"private":"keep"}]}'
  await writeFile(file, raw)
  const response = await app.post('/vault/catalog/refresh')
  assert.equal(response.status, 409)
  assert.equal(await readFile(file, 'utf8'), raw)
})
