import assert from 'node:assert/strict'
import { mkdir, readFile, stat, writeFile, utimes } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { createApp, seedPaper, PAPER_ID } from './helpers.mjs'

async function fixture(t, options = {}) {
  const app = await createApp(options)
  t.after(() => app.close())
  await mkdir(path.join(app.vaultPath, 'A'), { recursive: true })
  await mkdir(path.join(app.vaultPath, 'B'), { recursive: true })
  await writeFile(path.join(app.vaultPath, 'A/a.pdf'), '%PDF filing fixture')
  await writeFile(path.join(app.vaultPath, 'A/a 总结.md'), `---\ntitle: 原题\nnote_role: summary\npaper_id: ${PAPER_ID}\npdf: "[[a.pdf]]"\n---\n正文 [[a.pdf#page=1|PDF]]\n`)
  await writeFile(path.join(app.vaultPath, 'A/a 笔记.md'), `---\nnote_role: reader-note\npaper_id: ${PAPER_ID}\npdf: "[[a.pdf]]"\n---\n![图片](_附件/${PAPER_ID}/笔记/x.png)\n`)
  await mkdir(path.join(app.vaultPath, `A/_附件/${PAPER_ID}/笔记`), { recursive: true })
  await writeFile(path.join(app.vaultPath, `A/_附件/${PAPER_ID}/笔记/x.png`), Buffer.from([1, 2, 3]))
  await writeFile(path.join(app.vaultPath, 'refs.md'), '[[A/a.pdf#page=2|原文]]\n[文献](A/a.pdf)\n`[[A/a.pdf]]`\n```md\n[[A/a.pdf]]\n```\n')
  await seedPaper(app, { meta: { vaultPath: 'A/a.pdf', fileName: 'a.pdf', summaryPath: path.join(app.vaultPath, 'A/a 总结.md'), readerNotePath: path.join(app.vaultPath, 'A/a 笔记.md') } })
  assert.equal((await app.post('/vault/catalog/refresh')).status, 200)
  app.item = (await app.get('/vault/catalog?type=pdf')).json().items[0]
  return app
}

async function preview(app, extra = {}) {
  const response = await app.post('/vault/filing/preview', { items: [{ id: app.item.id, folder: 'B', ...extra }] })
  assert.equal(response.status, 200, response.text)
  return response.json().plan
}

test('filing preview and cancellation leave vault files unchanged', async (t) => {
  const app = await fixture(t)
  const plan = await preview(app, { folder: '新建/目录' })
  assert.equal(plan.blocked.length, 0)
  assert.ok(plan.newFolders.includes('新建'))
  assert.equal((await stat(path.join(app.vaultPath, 'A/a.pdf'))).isFile(), true)
  assert.equal(await stat(path.join(app.vaultPath, '新建')).catch(() => null), null)
  assert.equal((await app.post(`/vault/operations/${plan.id}/cancel`)).status, 200)
  assert.equal((await app.post('/vault/filing/execute', { planId: plan.id, revision: plan.revision, editorsClosed: true })).status, 409)
})

test('filing moves the trio and attachments, repairs actual links, preserves code and can undo', async (t) => {
  const app = await fixture(t)
  const plan = await preview(app)
  assert.equal(plan.blocked.length, 0, JSON.stringify(plan.blocked))
  const response = await app.post('/vault/filing/execute', { planId: plan.id, revision: plan.revision, editorsClosed: true })
  assert.equal(response.status, 200, response.text)
  assert.equal(response.json().operation.status, 'completed')
  assert.equal(await readFile(path.join(app.vaultPath, 'B/a.pdf'), 'utf8'), '%PDF filing fixture')
  assert.deepEqual(await readFile(path.join(app.vaultPath, `B/_附件/${PAPER_ID}/笔记/x.png`)), Buffer.from([1, 2, 3]))
  const refs = await readFile(path.join(app.vaultPath, 'refs.md'), 'utf8')
  assert.match(refs, /\[\[B\/a.pdf#page=2\|原文\]\]/)
  assert.match(refs, /\[文献\]\(B\/a.pdf\)/)
  assert.match(refs, /`\[\[A\/a.pdf\]\]`/)
  assert.match(refs, /```md\n\[\[A\/a.pdf\]\]\n```/)
  assert.equal((await app.readMeta()).vaultPath, 'B/a.pdf')
  const beforeUndo = await app.post(`/vault/operations/${plan.id}/rollback`, { preview: true })
  assert.equal(beforeUndo.status, 200, beforeUndo.text)
  const undo = await app.post(`/vault/operations/${plan.id}/rollback`, { confirmed: true, recoveryVersion: beforeUndo.json().recoveryVersion, editorsClosed: true })
  assert.equal(undo.status, 200, undo.text)
  assert.equal(undo.json().operation.status, 'rolled_back')
  assert.equal(await readFile(path.join(app.vaultPath, 'A/a.pdf'), 'utf8'), '%PDF filing fixture')
  assert.equal((await app.readMeta()).vaultPath, 'A/a.pdf')
})

test('filing invalidates a preview on changed bytes even with the same size and mtime', async (t) => {
  const app = await fixture(t)
  const plan = await preview(app)
  const file = path.join(app.vaultPath, 'A/a.pdf')
  const info = await stat(file)
  const before = await readFile(file, 'utf8')
  await writeFile(file, before.replace('fixture', 'changed'))
  await utimes(file, info.atime, info.mtime)
  const response = await app.post('/vault/filing/execute', { planId: plan.id, revision: plan.revision, editorsClosed: true })
  assert.equal(response.status, 409)
  assert.equal(await stat(path.join(app.vaultPath, 'B/a.pdf')).catch(() => null), null)
})

test('filing refuses to undo edits made after a successful move', async (t) => {
  const app = await fixture(t)
  const plan = await preview(app)
  assert.equal((await app.post('/vault/filing/execute', { planId: plan.id, revision: plan.revision, editorsClosed: true })).status, 200)
  await writeFile(path.join(app.vaultPath, 'B/a 总结.md'), '# 后续编辑，必须保留\n')
  const response = await app.post(`/vault/operations/${plan.id}/rollback`, { preview: true })
  assert.equal(response.status, 409)
  assert.equal(await readFile(path.join(app.vaultPath, 'B/a 总结.md'), 'utf8'), '# 后续编辑，必须保留\n')
})

test('legacy moves require a confirmed filing preview', async (t) => {
  const app = await fixture(t)
  assert.equal((await app.post('/vault/item/move', { rel: 'A/a.pdf', folder: 'B', kind: 'pdf' })).status, 409)
})

test('AI filing receives selected metadata only, suggestions never move files', async (t) => {
  const app = await fixture(t)
  const input = await app.post('/vault/filing/input', { ids: [app.item.id], folderScope: '' })
  assert.equal(input.status, 200, input.text)
  app.script([JSON.stringify({ suggestions: [{ id: app.item.id, folder: '新目录', reason: '主题一致' }] })])
  const response = await app.post('/vault/filing/suggest', { inputToken: input.json().inputToken, confirmed: true })
  assert.equal(response.status, 200, response.text)
  const done = response.events.find((event) => event.type === 'done')
  assert.equal(done.suggestions[0].folder, '新目录')
  assert.equal(app.calls.length, 1)
  const sent = JSON.stringify(app.calls[0])
  assert.ok(!sent.includes('正文 [[a.pdf'))
  assert.ok(!sent.includes('%PDF'))
  assert.ok(!sent.includes('D:\\'))
  assert.equal(await stat(path.join(app.vaultPath, '新目录')).catch(() => null), null)
})
