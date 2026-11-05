import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  appendWordToNote,
  extractVocabularyAnswer,
  parseWordNote,
  recordWord,
} from '../lib/words.js'

const NOTE = `[[Altera_EQ(1)]]
1.travel through → 穿过
2.backplane → 背板（PAB背板）
3.be subject to → 可能受到...的影响，取决于，受什么支配
4.primarily 主要地
5.skin effect 趋肤效应
13.interval 间隔：symbol interval 符号间隔，UI
28.amplitude 幅度
`

test('parses link sections, arrows and bare Chinese definitions', () => {
  const parsed = parseWordNote(NOTE)
  assert.equal(parsed.sections.length, 1)
  assert.equal(parsed.sections[0].target, 'Altera_EQ(1)')
  assert.equal(parsed.sections[0].items.length, 7)
  assert.equal(parsed.sections[0].items[0].term, 'travel through')
  assert.equal(parsed.sections[0].items[0].translation, '穿过')
  assert.equal(parsed.sections[0].items[3].term, 'primarily')
  assert.equal(parsed.sections[0].items[4].term, 'skin effect')
  assert.equal(parsed.sections[0].items[5].term, 'interval')
})

test('appends to the matching paper section with the next number', () => {
  const result = appendWordToNote(NOTE, {
    targets: ['Altera_EQ(1)', 'Understanding the Pre-Emphasis and Linear Equalization Features'],
    linkTarget: 'Altera_EQ(1)',
    term: 'equalization',
    translation: '均衡',
  })
  assert.equal(result.duplicate, undefined)
  assert.equal(result.entry.number, 29)
  assert.match(result.content, /29\.equalization → 均衡\n$/)
  assert.match(result.content, /^\[\[Altera_EQ\(1\)\]\]\n1\.travel through/)
})

test('reports duplicates instead of appending again', () => {
  const result = appendWordToNote(NOTE, {
    targets: ['Altera_EQ(1)'],
    linkTarget: 'Altera_EQ(1)',
    term: '  Skin   Effect ',
    translation: '趋肤效应',
  })
  assert.ok(result.duplicate)
  assert.equal(result.duplicate.number, 5)
  assert.equal(result.duplicate.term, 'skin effect')
  assert.equal(result.content, NOTE)
})

test('creates a new link section at the end of the note', () => {
  const result = appendWordToNote(NOTE, {
    targets: ['Lecture 5'],
    linkTarget: 'lecture5_ee720_termination_txdriver',
    term: 'termination',
    translation: '端接',
  })
  assert.equal(result.isNewSection, true)
  assert.equal(result.entry.number, 1)
  assert.match(
    result.content,
    /28\.amplitude 幅度\n\n\[\[lecture5_ee720_termination_txdriver\]\]\n1\.termination → 端接\n$/,
  )
})

test('inserts before the next link section without losing separation', () => {
  const content = `[[Paper A]]
1.alpha → 阿尔法
[[Paper B]]
1.beta → 贝塔
`
  const result = appendWordToNote(content, {
    targets: ['Paper A'],
    linkTarget: 'Paper A',
    term: 'gamma',
    translation: '伽马',
  })
  assert.equal(result.entry.number, 2)
  assert.equal(
    result.content,
    `[[Paper A]]
1.alpha → 阿尔法
2.gamma → 伽马

[[Paper B]]
1.beta → 贝塔
`,
  )
})

test('extracts the translation from the model answer formats', () => {
  assert.deepEqual(
    extractVocabularyAnswer('**travel through** — 穿过，经过\n语境义：信号通过背板。', 'travel through'),
    { term: 'travel through', translation: '穿过，经过' },
  )
  assert.deepEqual(
    extractVocabularyAnswer('**attenuate**：使衰减\n语境义：……', 'attenuate'),
    { term: 'attenuate', translation: '使衰减' },
  )
  assert.deepEqual(
    extractVocabularyAnswer('**pre-emphasis**\n预加重', 'pre-emphasis'),
    { term: 'pre-emphasis', translation: '预加重' },
  )
})

test('recordWord writes the note, backs it up and detects the duplicate', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'lr-words-'))
  try {
    const vault = path.join(root, 'vault')
    const dataDir = path.join(root, 'data')
    await mkdir(vault, { recursive: true })
    await writeFile(path.join(vault, '英文单词.md'), NOTE, 'utf8')
    const meta = {
      fileName: 'Altera_EQ(1).pdf',
      title: 'Understanding the Pre-Emphasis and Linear Equalization Features',
      vaultPath: 'serdes/发送端/均衡/文献/Altera_EQ(1).pdf',
    }
    const first = await recordWord({
      vault: { path: vault, exists: true, name: 'vault' },
      dataDir,
      meta,
      term: 'backplane',
      translation: '背板',
      noteName: '英文单词',
    })
    assert.equal(first.status, 'duplicate')
    assert.equal(first.number, 2)
    const second = await recordWord({
      vault: { path: vault, exists: true, name: 'vault' },
      dataDir,
      meta,
      term: 'equalization',
      translation: '均衡',
      noteName: '英文单词',
    })
    assert.equal(second.status, 'saved')
    assert.equal(second.noteRel, '英文单词.md')
    const saved = await readFile(path.join(vault, '英文单词.md'), 'utf8')
    assert.match(saved, /29\.equalization → 均衡\n$/)
    const backupDir = path.join(dataDir, 'backups', 'word-note')
    const backups = await (await import('node:fs/promises')).readdir(backupDir)
    assert.equal(backups.length, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
