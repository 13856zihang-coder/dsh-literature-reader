import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  AUTOMATIC_EFFORT,
  normalizePreference,
  readPreference,
  resolveEffort,
  settingsPath,
  writePreference,
} from '../lib/settings.js'

const EFFORTS = ['off', 'low', 'medium', 'high', 'xhigh', 'max']

test('normalizes a preference and drops unknown fields', () => {
  assert.deepEqual(normalizePreference({ provider: ' patrick ', model: ' deepseek-v4.1-flash ', extra: 1 }), {
    provider: 'patrick',
    model: 'deepseek-v4.1-flash',
    reasoningEffort: '',
  })
  assert.deepEqual(normalizePreference(null), { provider: '', model: '', reasoningEffort: '' })
  assert.equal(normalizePreference({ reasoningEffort: ' high ' }).reasoningEffort, 'high')
})

test('an explicit selection wins over every other source', () => {
  assert.equal(
    resolveEffort({ explicit: 'high', configured: 'low', modelDefault: 'medium', supported: EFFORTS }),
    'high',
  )
  // A model with no advertised default falls back to the deployment config.
  assert.equal(resolveEffort({ configured: 'medium', supported: EFFORTS }), 'medium')
})

test('without an explicit pick the model default wins, then the deployment config', () => {
  assert.equal(
    resolveEffort({ configured: 'low', modelDefault: 'high', supported: EFFORTS }),
    'high',
  )
  // `auto` means "follow the resolved default", not "low".
  assert.equal(
    resolveEffort({ explicit: AUTOMATIC_EFFORT, modelDefault: 'medium', configured: 'low', supported: EFFORTS }),
    'medium',
  )
  // No model default: keep the deployment value.
  assert.equal(resolveEffort({ explicit: AUTOMATIC_EFFORT, configured: 'xhigh', supported: EFFORTS }), 'xhigh')
})

test('resolves a usable value when nothing is configured', () => {
  // No model default and no `low` support: the call runs without an effort.
  assert.equal(resolveEffort({ supported: ['high', 'max'] }), '')
  assert.equal(resolveEffort({ supported: EFFORTS }), 'low')
  // A model that does not advertise efforts at all passes none; an invented
  // effort would be rejected by the adapter before the request is sent.
  assert.equal(resolveEffort(), '')
  assert.equal(resolveEffort({ supported: [] }), '')
})

test('a value the model does not advertise is skipped, never forwarded', () => {
  // `max` and `xhigh` are absent from the new model -> fall through to `low`.
  assert.equal(
    resolveEffort({ explicit: 'max', configured: 'xhigh', supported: ['low', 'medium'] }),
    'low',
  )
  // Nothing in the chain is advertised -> the call runs without an effort.
  assert.equal(resolveEffort({ explicit: 'max', supported: ['high'] }), '')
  // An unknown model (capabilities not resolved) still honours the explicit pick.
  assert.equal(resolveEffort({ explicit: 'xhigh' }), 'xhigh')
  // A model that advertises no efforts at all advertises none, not "unknown".
  assert.equal(resolveEffort({ explicit: 'xhigh', supported: [] }), '')
})

test('read/write keeps unrelated settings keys intact', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lr-settings-'))
  try {
    await writeFile(
      settingsPath(root),
      JSON.stringify({ model: { provider: 'a', model: 'b' }, unrelated: { keep: true } }),
      'utf8',
    )
    assert.deepEqual(await readPreference(root), {
      provider: 'a',
      model: 'b',
      reasoningEffort: '',
    })
    const saved = await writePreference(root, {
      provider: 'patrick',
      model: 'deepseek-v4.1-flash',
      reasoningEffort: 'high',
    })
    assert.deepEqual(saved, { provider: 'patrick', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' })
    const raw = JSON.parse(await readFile(settingsPath(root), 'utf8'))
    assert.deepEqual(raw.unrelated, { keep: true })
    assert.deepEqual(raw.model, saved)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('a missing or corrupt settings file reads as "no preference"', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lr-settings-'))
  try {
    assert.deepEqual(await readPreference(root), { provider: '', model: '', reasoningEffort: '' })
    await writeFile(settingsPath(root), '{not json', 'utf8')
    assert.deepEqual(await readPreference(root), { provider: '', model: '', reasoningEffort: '' })
    await writeFile(settingsPath(root), '[]', 'utf8')
    assert.deepEqual(await readPreference(root), { provider: '', model: '', reasoningEffort: '' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
