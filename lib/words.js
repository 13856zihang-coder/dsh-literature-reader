import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileStem, safeVaultPath, scanVault } from './vault.js'
import { writeFileAtomic } from './util.js'

export const DEFAULT_WORD_NOTE = '英文单词'

// A link line opens a section for one paper in the vocabulary note, e.g.
// [[Altera_EQ(1)]] or ## [[Altera_EQ(1)|Altera EQ]].
const LINK_LINE_RE = /^\s{0,3}#{0,6}\s*\[\[([^\]|#]+?)(?:#[^\]]*?)?(?:\|([^\]]*))?\]\]\s*$/
const ITEM_LINE_RE = /^\s*(\d{1,4})\s*[.、)]\s*(.+?)\s*$/
const ARROW_RE = /\s*(?:→|⟶|⇒|->|=>)\s*/
const CJK_RE = /[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef\uac00-\ud7af\u3040-\u30ff]/
const MAX_TRANSLATION_CHARS = 300
const MAX_TERM_CHARS = 80

export function normalizeTerm(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[*_`~]/g, '')
    .replace(/^[\s"'“”‘’`([{【<]+/, '')
    .replace(/[\s"'“”‘’`)\]}>.,;:!?，。；：！？、…]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function cleanTerm(value) {
  const text = String(value || '')
    .replace(/[*_`~]/g, '')
    .replace(/^[\s"'“”‘’([{【<]+/, '')
    .replace(/[\s"'“”‘’)\]}>.,;:!?，。；：！？]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.slice(0, MAX_TERM_CHARS)
}

function cleanTranslation(value) {
  return String(value || '')
    .replace(/\r?\n+/g, ' ')
    .replace(/^\s*(?:翻译|释义|意思|translation)\s*[:：]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TRANSLATION_CHARS)
}

function splitTermTranslation(body) {
  const text = String(body || '').trim()
  if (!text) return undefined
  const arrow = ARROW_RE.exec(text)
  if (arrow && arrow.index > 0) {
    const term = text.slice(0, arrow.index)
    const translation = text.slice(arrow.index + arrow[0].length)
    if (normalizeTerm(term)) return { term: cleanTerm(term), translation: cleanTranslation(translation) }
  }
  const cjk = text.search(CJK_RE)
  if (cjk > 0) {
    const term = text.slice(0, cjk)
    const translation = text.slice(cjk)
    if (normalizeTerm(term)) return { term: cleanTerm(term), translation: cleanTranslation(translation) }
  }
  return { term: cleanTerm(text), translation: '' }
}

/**
 * Parse the vocabulary note into link sections and numbered entries.
 * Both "term → translation" and "term 中文释义" lines are understood so
 * duplicate detection keeps working on notes written by hand.
 */
export function parseWordNote(content) {
  const source = String(content || '')
  const eol = source.includes('\r\n') ? '\r\n' : '\n'
  const lines = source.split(/\r?\n/)
  const sections = []
  let current = null
  for (let index = 0; index < lines.length; index += 1) {
    const link = LINK_LINE_RE.exec(lines[index])
    if (link) {
      current = {
        target: link[1].trim(),
        label: String(link[2] || '').trim(),
        line: index,
        lastItemLine: -1,
        items: [],
      }
      sections.push(current)
      continue
    }
    const itemMatch = ITEM_LINE_RE.exec(lines[index])
    if (!itemMatch) continue
    const split = splitTermTranslation(itemMatch[2])
    if (!split || !normalizeTerm(split.term)) continue
    if (!current) {
      current = { target: '', label: '', line: -1, lastItemLine: -1, items: [] }
      sections.push(current)
    }
    current.items.push({
      number: Number(itemMatch[1]),
      term: split.term,
      translation: split.translation,
      normalized: normalizeTerm(split.term),
      line: index,
      raw: lines[index],
    })
    current.lastItemLine = index
  }
  for (let index = 0; index < sections.length; index += 1) {
    const next = sections[index + 1]
    sections[index].endLine = next ? next.line : lines.length
  }
  return { lines, eol, sections }
}

function normalizeTarget(value) {
  return String(value || '')
    .split('#')[0]
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\.(?:pdf|md)$/i, '')
    .replace(/^\/+|\/+$/g, '')
    .trim()
    .toLowerCase()
}

function targetMatches(target, candidates) {
  const normalized = normalizeTarget(target)
  if (!normalized) return false
  const base = normalized.slice(normalized.lastIndexOf('/') + 1)
  return (candidates || []).some((candidate) => {
    const other = normalizeTarget(candidate)
    if (!other) return false
    const otherBase = other.slice(other.lastIndexOf('/') + 1)
    return (
      normalized === other ||
      normalized === otherBase ||
      base === other ||
      base === otherBase
    )
  })
}

function findDuplicate(parsed, normalized) {
  for (const section of parsed.sections) {
    for (const item of section.items) {
      if (item.normalized !== normalized) continue
      return {
        term: item.term,
        translation: item.translation,
        number: item.number,
        line: item.line + 1,
        section: section.label || section.target || '',
      }
    }
  }
  return undefined
}

/**
 * Append one "term → translation" entry under the paper's link section.
 * Existing entries are never rewritten, and duplicates are reported instead
 * of being inserted a second time.
 */
export function appendWordToNote(content, { targets, linkTarget, label, term, translation }) {
  const displayTerm = cleanTerm(term)
  const displayTranslation = cleanTranslation(translation)
  const normalized = normalizeTerm(displayTerm)
  if (!normalized) throw new Error('要记录的单词或短语为空')
  if (!displayTranslation) throw new Error('这条单词记录没有可写入的翻译')
  const parsed = parseWordNote(content)
  const duplicate = findDuplicate(parsed, normalized)
  if (duplicate) return { content, duplicate }
  const itemText = `${displayTerm} → ${displayTranslation}`
  const sectionTargets = [linkTarget, ...(targets || [])].filter(Boolean)
  const section = parsed.sections.find((item) => item.line >= 0 && targetMatches(item.target, sectionTargets))
  if (!section) {
    const trimmed = String(content || '')
      .replace(/[ \t]+$/gm, '')
      .replace(/\s+$/, '')
    const block = `${trimmed ? `${trimmed}\n\n` : ''}[[${linkTarget}]]\n1.${itemText}`
    return {
      content: `${block}\n`,
      entry: { term: displayTerm, translation: displayTranslation, number: 1 },
      isNewSection: true,
      sectionTarget: linkTarget,
      sectionLabel: String(label || ''),
    }
  }
  const lastNumber = section.items.reduce((max, item) => Math.max(max, item.number || 0), 0)
  const number = lastNumber + 1
  const insertAt = section.items.length > 0
    ? section.lastItemLine + 1
    : Math.max(section.line + 1, 0)
  const after = parsed.lines.slice(insertAt)
  const gap = after.length > 0 && after[0].trim() !== '' ? [''] : []
  const lines = [
    ...parsed.lines.slice(0, insertAt),
    `${number}.${itemText}`,
    ...gap,
    ...after,
  ]
  return {
    content: lines.join(parsed.eol),
    entry: { term: displayTerm, translation: displayTranslation, number },
    isNewSection: false,
    sectionTarget: section.target,
    sectionLabel: section.label || '',
  }
}

/**
 * Pull the concise translation out of the model's answer. The word/phrase
 * prompt asks for "**term** — translation" on the first line; this parser is
 * tolerant of the usual Markdown variations.
 */
function stripTermPrefix(text, term) {
  if (!term) return text
  const words = String(term)
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+')
  if (!words) return text
  const pattern = new RegExp(`^\\s*\\*{0,2}${words}\\*{0,2}\\s*(?:—|–|－|->|→|-|:|：)?\\s*`, 'i')
  return text.replace(pattern, '').trim()
}

export function extractVocabularyAnswer(answer, fallbackTerm = '') {
  const text = String(answer || '').trim()
  if (!text) return undefined
  const fallback = cleanTerm(fallbackTerm)
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const stripLead = (line) =>
    line
      .replace(/^(?:[-+>]\s+|\*\s+|\d+\s*[.、)]\s*)/, '')
      .trim()
  const plainSeparators = [
    /^(.+?)\s*(?:→|⟶|⇒|->|=>)\s*(.+)$/,
    /^(.+?)\s*(?:—|–|－)\s*(.+)$/,
    /^(.+?)\s*(?::|：)\s*(.+)$/,
    /^([A-Za-z][A-Za-z0-9+'’._-]*(?:\s+[A-Za-z0-9+'’._-]+){0,7})\s+([\u3400-\u9fff].*)$/,
  ]
  for (const rawLine of lines.slice(0, 4)) {
    const line = stripLead(rawLine)
    const bold = /^\*\*(.+?)\*\*\s*(?:(?:—|–|－|->|→|-|:|：)\s*)?(.+)$/.exec(line)
    if (bold) {
      const term = cleanTerm(bold[1]) || fallback
      const translation = cleanTranslation(bold[2])
      if (normalizeTerm(term) && translation) return { term, translation }
    }
    for (const separator of plainSeparators) {
      const match = separator.exec(line)
      if (!match) continue
      const term = cleanTerm(match[1]) || fallback
      const translation = cleanTranslation(match[2])
      if (normalizeTerm(term) && translation) return { term, translation }
    }
  }
  // Some answers put the term alone on the first line and the meaning on the
  // next one. Only accept that shape when the first line is exactly the term.
  if (lines.length >= 2 && fallback) {
    const first = stripLead(lines[0]).replace(/^\*\*(.+?)\*\*$/, '$1')
    if (normalizeTerm(first) === normalizeTerm(fallback)) {
      const translation = cleanTranslation(stripLead(lines[1]))
      if (translation) return { term: fallback, translation }
    }
  }
  if (fallback) {
    const translation = cleanTranslation(stripTermPrefix(stripLead(lines[0]), fallback))
    if (translation) return { term: fallback, translation }
  }
  return undefined
}

function findWordNote(notes, name) {
  const wanted = String(name || DEFAULT_WORD_NOTE)
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\.md$/i, '')
  const matches = (notes || []).filter((note) => {
    const stem = String(note.stem || '').normalize('NFKC').trim().toLowerCase()
    const title = String(note.title || '').normalize('NFKC').trim().toLowerCase()
    return stem === wanted || title === wanted
  })
  matches.sort(
    (a, b) =>
      Number(Boolean(a.folder)) - Number(Boolean(b.folder)) ||
      String(a.rel).length - String(b.rel).length,
  )
  return matches[0]
}

function paperLinkInfo(meta, scan) {
  const candidates = []
  const push = (value) => {
    const text = String(value || '').trim()
    if (text && !candidates.includes(text)) candidates.push(text)
  }
  push(meta.title)
  if (meta.vaultPath) push(String(meta.vaultPath).replace(/\.pdf$/i, ''))
  push(fileStem(meta.vaultPath || meta.fileName || ''))
  if (meta.summaryPath) push(fileStem(meta.summaryPath))
  const stem = fileStem(meta.vaultPath || meta.fileName || '')
  const stemLower = stem.toLowerCase()
  let ambiguous = false
  if (stemLower) {
    ambiguous =
      (scan.pdfs || []).some(
        (item) => item.rel !== meta.vaultPath && String(item.stem || '').toLowerCase() === stemLower,
      ) ||
      (scan.notes || []).some((item) => String(item.stem || '').toLowerCase() === stemLower)
  }
  let linkTarget = stem
  if (ambiguous && meta.vaultPath) linkTarget = String(meta.vaultPath).replace(/\.pdf$/i, '')
  return { linkTarget, targets: candidates }
}

async function backupWordNote(dataDir, content, noteRel) {
  const dir = path.join(dataDir, 'backups', 'word-note')
  await mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const fileName = `${stamp}-${path.basename(noteRel)}`
  await writeFileAtomic(path.join(dir, fileName), content)
}

/**
 * Record one translated word/phrase in the user's Obsidian vocabulary note.
 * Returns { status: 'saved' | 'duplicate', ... } and never creates a new note
 * when the configured note is missing (a silent second note would be worse
 * than an explicit error).
 */
export async function recordWord({
  vault,
  dataDir,
  meta,
  term,
  translation,
  noteName = DEFAULT_WORD_NOTE,
}) {
  if (!vault?.path) throw new Error('未找到 Obsidian 库，无法记录单词')
  if (!vault.exists) throw new Error(`Obsidian 库不存在：${vault.path}`)
  const scan = await scanVault(vault.path)
  const note = findWordNote(scan.notes, noteName)
  if (!note) throw new Error(`没有找到 Obsidian 笔记「${noteName}」，请确认笔记仍在库中`)
  const abs = safeVaultPath(vault.path, note.rel)
  const content = await readFile(abs, 'utf8')
  const link = paperLinkInfo(meta, scan)
  if (!link.linkTarget) throw new Error('无法确定当前文献的 Obsidian 链接')
  const result = appendWordToNote(content, {
    targets: link.targets,
    linkTarget: link.linkTarget,
    label: meta.title || '',
    term,
    translation,
  })
  if (result.duplicate) {
    return {
      status: 'duplicate',
      noteName,
      noteRel: note.rel,
      term: result.duplicate.term,
      translation: result.duplicate.translation,
      number: result.duplicate.number,
      line: result.duplicate.line,
      section: result.duplicate.section,
    }
  }
  if (dataDir) await backupWordNote(dataDir, content, note.rel)
  await writeFileAtomic(abs, result.content)
  return {
    status: 'saved',
    noteName,
    noteRel: note.rel,
    term: result.entry.term,
    translation: result.entry.translation,
    number: result.entry.number,
    isNewSection: result.isNewSection,
    section: result.sectionLabel || result.sectionTarget || '',
  }
}

export function isVocabularyKind(kind) {
  return kind === 'word' || kind === 'phrase'
}

/**
 * Used only when the selection classifier was unavailable: a short answer that
 * opens with a bold term immediately followed by a dash/colon is the documented
 * word/phrase shape, while sentence translations are plain text.
 */
export function looksLikeVocabularyAnswer(answer) {
  const first = String(answer || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
  if (!first || first.length > 160) return false
  return /^\*\*[^*\n]{1,80}\*\*\s*(?:—|–|－|-|:|：)/.test(first)
}
