import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathKey } from './catalog.js'

function protectedRanges(source) {
  const ranges = []
  const fence = /^ {0,3}(`{3,}|~{3,})[^\r\n]*(?:\r?\n|$)/gm
  let match
  while ((match = fence.exec(source))) {
    const close = new RegExp(`^ {0,3}${match[1][0]}{${match[1].length},}[ \\t]*(?:\\r?\\n|$)`, 'gm')
    close.lastIndex = fence.lastIndex
    const end = close.exec(source)
    ranges.push([match.index, end ? close.lastIndex : source.length])
    fence.lastIndex = ranges.at(-1)[1]
  }
  for (const pattern of [/<!--[\s\S]*?(?:-->|$)/g, /%%[\s\S]*?(?:%%|$)/g, /(`+)[\s\S]*?\1/g]) {
    while ((match = pattern.exec(source))) if (!ranges.some(([start, end]) => match.index >= start && match.index < end)) ranges.push([match.index, pattern.lastIndex])
  }
  return ranges
}

function linkTargets(source) {
  const ranges = protectedRanges(source)
  const targets = []
  const hidden = (at) => ranges.some(([start, end]) => at >= start && at < end)
  let match
  const wiki = /!?\[\[([^\]\r\n]+)\]\]/g
  while ((match = wiki.exec(source))) {
    if (hidden(match.index)) continue
    const value = match[1].split('|')[0]
    const at = match.index + match[0].indexOf(match[1])
    targets.push({ start: at, end: at + value.length, value, wiki: true })
  }
  const inline = /!?\[(?:\\.|[^\]\\\r\n])*\]\([ \t]*/g
  while ((match = inline.exec(source))) {
    if (hidden(match.index)) continue
    const start = inline.lastIndex
    let end = start
    if (source[start] === '<') {
      end = source.indexOf('>', start + 1)
      if (end < 0) continue
      targets.push({ start: start + 1, end, value: source.slice(start + 1, end), wiki: false })
    } else {
      let depth = 0
      while (end < source.length) {
        const char = source[end]
        if (char === '\\') { end += 2; continue }
        if (char === '(') depth += 1
        if (char === ')') { if (!depth) break; depth -= 1 }
        if (/\s/.test(char) && !depth) break
        end += 1
      }
      if (end > start) targets.push({ start, end, value: source.slice(start, end), wiki: false })
    }
  }
  const definition = /^ {0,3}\[[^\]\r\n]+\]:[ \t]*(<[^>\r\n]+>|\S+)/gm
  while ((match = definition.exec(source))) {
    if (hidden(match.index)) continue
    const angle = match[1].startsWith('<')
    const start = match.index + match[0].lastIndexOf(match[1]) + (angle ? 1 : 0)
    const value = angle ? match[1].slice(1, -1) : match[1]
    targets.push({ start, end: start + value.length, value, wiki: false })
  }
  const frontmatter = source.match(/^(?:\uFEFF)?---\r?\n[\s\S]*?^---[ \t]*(?:\r?\n|$)/m)
  if (frontmatter?.index === 0) {
    const fields = /^(?:source_path|source_pdf|vault_path|pdf|summary_note):[ \t]*(["']?)([^\r\n]*?)\1[ \t]*$/gm
    while ((match = fields.exec(frontmatter[0]))) {
      if (match[2].includes('[[')) continue
      const start = match.index + match[0].indexOf(':') + 1 + match[0].slice(match[0].indexOf(':') + 1).search(/\S/) + match[1].length
      targets.push({ start, end: start + match[2].length, value: match[2], wiki: true, field: true })
    }
  }
  return targets.sort((a, b) => a.start - b.start).filter((target, index, all) => !index || target.start >= all[index - 1].end)
}

/** Only link destinations are replaced; code, labels, anchors and all other bytes stay intact. */
export function rewriteVaultLinks(source, fromRel, toRel, mappings, files, vaultRoot) {
  const moves = new Map(mappings.map((entry) => [pathKey(entry.from), entry.to]))
  const known = new Map(files.map((file) => [pathKey(typeof file === 'string' ? file : file.rel), typeof file === 'string' ? file : file.rel]))
  const blocked = []
  const changes = []
  for (const target of linkTargets(source)) {
    const raw = target.value
    let decoded
    try { decoded = decodeURIComponent(raw.trim().replace(/\\([ ()])/g, '$1')) } catch {
      blocked.push('链接含无法解析的 URL 编码'); continue
    }
    const suffixAt = decoded.search(/[#?]/)
    const suffix = suffixAt < 0 ? '' : decoded.slice(suffixAt)
    let name = suffixAt < 0 ? decoded : decoded.slice(0, suffixAt)
    if (!name || /^(?:https?|data|mailto|obsidian):/i.test(name)) continue
    let absolute = false
    let fileUrl = false
    if (/^file:/i.test(name)) {
      try { name = fileURLToPath(name); fileUrl = true } catch { blocked.push('file 链接无法解析'); continue }
    }
    if (path.isAbsolute(name) || /^[A-Za-z]:[\\/]/.test(name)) {
      const relative = path.relative(vaultRoot, name)
      if (path.isAbsolute(relative) || relative.split(path.sep).includes('..')) continue
      name = relative.split(path.sep).join('/')
      absolute = true
    }
    name = name.replace(/\\/g, '/')
    let resolved
    if (!target.wiki) resolved = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), name))
    else if (known.has(pathKey(name))) resolved = known.get(pathKey(name))
    else {
      const local = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), name))
      const matches = [...known.values()].filter((rel) => rel.toLowerCase() === local.toLowerCase()
        || !name.includes('/') && (path.posix.basename(rel).toLowerCase() === name.toLowerCase() || rel.replace(/\.(md|pdf)$/i, '').split('/').at(-1).toLowerCase() === name.toLowerCase()))
      const localMatch = matches.filter((rel) => path.posix.dirname(rel) === path.posix.dirname(fromRel))
      const candidates = localMatch.length === 1 ? localMatch : matches
      if (candidates.length === 1) resolved = candidates[0]
      else if (candidates.some((rel) => moves.has(pathKey(rel)))) { blocked.push(`同名链接有歧义：${name}`); continue }
      else continue
    }
    if (resolved.startsWith('../') || path.posix.isAbsolute(resolved)) continue
    const moved = moves.get(pathKey(resolved)) || resolved
    if (moved === resolved && fromRel === toRel) continue
    let replacement
    if (absolute) {
      replacement = path.join(vaultRoot, ...moved.split('/'))
      if (fileUrl) replacement = new URL(`file:///${replacement.replace(/\\/g, '/').replace(/^\//, '')}`).href
      else if (!raw.includes('\\')) replacement = replacement.replace(/\\/g, '/')
    } else if (target.wiki) {
      if (moved === resolved) continue
      replacement = moved
      if (!/\.(md|pdf)$/i.test(name)) replacement = replacement.replace(/\.(md|pdf)$/i, '')
    } else replacement = path.posix.relative(path.posix.dirname(toRel), moved)
    if (/%[0-9a-f]{2}/i.test(raw) && !fileUrl) replacement = encodeURI(replacement).replace(/#/g, '%23')
    if (replacement + suffix !== raw) changes.push({ start: target.start, end: target.end, old: raw, value: replacement + suffix })
  }
  let content = source
  for (const change of [...changes].reverse()) content = content.slice(0, change.start) + change.value + content.slice(change.end)
  return { content, changes, blocked }
}
