import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { detectVault } from '../lib/obsidian.js'
import { baseDirs } from '../lib/util.js'
import { createApp, minimalPdf } from './helpers.mjs'

test('portable defaults do not select a machine-specific drive', () => {
  const dirs = baseDirs({})
  assert.equal(dirs.dataDir, path.resolve(os.homedir(), 'Documents', 'DSH-Literature'))
  assert.doesNotMatch(dirs.dataDir, /^[A-Za-z]:[\\/]DSH-Literature$/)
})

test('an explicit missing or non-vault path is treated as unavailable', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lr-no-vault-'))
  try {
    assert.equal(await detectVault({ obsidianVault: path.join(root, 'missing') }), undefined)
    assert.equal(await detectVault({ obsidianVault: root }), undefined)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the vault route reports local-only mode instead of an empty vault', async () => {
  const app = await createApp({ vault: false })
  try {
    const result = await app.get('/vault/library')
    assert.equal(result.status, 200)
    assert.equal(result.json().available, false)
    assert.match(result.json().reason, /本地阅读缓存/)
  } finally {
    await app.close()
  }
})

test('PDF import works without Obsidian and stores the source in the paper cache', async () => {
  const app = await createApp({ vault: false })
  try {
    const pdf = Buffer.from(minimalPdf(), 'latin1')
    const started = await app.post('/import/start', { name: 'local-paper.pdf', size: pdf.length })
    assert.equal(started.status, 200)
    const uploadId = started.json().uploadId
    const chunk = await app.post('/import/chunk', { uploadId, data: pdf.toString('base64') })
    assert.equal(chunk.status, 200)
    const finished = await app.post('/import/finish', { uploadId })
    assert.equal(finished.status, 200)
    assert.equal(finished.json().localOnly, true)
    const paper = finished.json().paper
    assert.equal(paper.vaultPath, '')
    assert.equal(existsSync(path.join(app.paperDir(paper.id), 'source.pdf')), true)
    assert.equal((await readFile(path.join(app.paperDir(paper.id), 'source.pdf'))).subarray(0, 5).toString(), '%PDF-')
  } finally {
    await app.close()
  }
})
