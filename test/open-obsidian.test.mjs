import assert from 'node:assert/strict'
import { describe, test, afterEach } from 'node:test'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { obsidianUrl, openInObsidian, revealObsidianWindow } from '../lib/obsidian.js'

// Spawning PowerShell is not allowed in the suite: a real window would pop up on
// the developer machine. `LR_NO_WINDOW_REVEAL=1` short-circuits it, which also
// exercises the escape hatch users get if the nudge ever misbehaves.
const saved = process.env.LR_NO_WINDOW_REVEAL
afterEach(() => {
  if (saved === undefined) delete process.env.LR_NO_WINDOW_REVEAL
  else process.env.LR_NO_WINDOW_REVEAL = saved
})

describe('revealing the Obsidian window (tray recovery)', () => {
  test('the opt-out returns false immediately without spawning', async () => {
    process.env.LR_NO_WINDOW_REVEAL = '1'
    const started = Date.now()
    const revealed = await revealObsidianWindow()
    assert.equal(revealed, false)
    assert.ok(Date.now() - started < 1000, 'the opt-out must not wait for a shell')
  })

  test('openInObsidian still hands over the URI when reveal is off', async () => {
    process.env.LR_NO_WINDOW_REVEAL = '1'
    const vault = mkdtempSync(path.join(tmpdir(), 'lr-vault-'))
    const notePath = path.join(vault, 'A 笔记.md')
    writeFileSync(notePath, '# 笔记\n', 'utf8')
    const result = await openInObsidian({ path: vault, name: 'note' }, notePath)
    assert.equal(result.revealed, false, 'the opt-out is reported honestly')
    assert.match(result.uri, /^obsidian:\/\/open\?vault=note&file=/)
    assert.equal(result.uri.includes('A%20%E7%AC%94%E8%AE%B0'), true, 'the file is URL-encoded')
  })

  test('a missing note is refused before any launch', async () => {
    process.env.LR_NO_WINDOW_REVEAL = '1'
    const vault = mkdtempSync(path.join(tmpdir(), 'lr-vault-'))
    await assert.rejects(
      () => openInObsidian({ path: vault, name: 'note' }, path.join(vault, 'missing.md')),
      /笔记文件还不存在/,
    )
  })

  test('a missing vault is refused', async () => {
    process.env.LR_NO_WINDOW_REVEAL = '1'
    await assert.rejects(() => openInObsidian({}, path.join(tmpdir(), 'x.md')), /未找到 Obsidian 库/)
  })
})

describe('obsidianUrl', () => {
  test('encodes every path segment but keeps the separators', () => {
    const uri = obsidianUrl({ path: 'D:/note', name: 'note' }, 'D:/note/serdes/新 论文.md')
    assert.equal(uri, 'obsidian://open?vault=note&file=serdes/%E6%96%B0%20%E8%AE%BA%E6%96%87')
  })

  test('drops the .md extension because Obsidian resolves by name', () => {
    const uri = obsidianUrl({ path: 'D:/note', name: 'note' }, 'D:/note/A.md')
    assert.equal(uri.endsWith('file=A'), true)
  })
})
