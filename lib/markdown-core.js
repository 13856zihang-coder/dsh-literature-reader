// Markdown core: a small, dependency-free Markdown reader shared by the host
// and the study-note editor in the browser.
//
// The region below is pasted verbatim into client.js, so it must stay pure
// JavaScript: no module syntax, no Node APIs, no DOM APIs and no references to
// anything declared outside the region. Offsets are UTF-16 code unit indices
// into the LF-normalised source text (CRLF/CR are normalised by parseMarkdown,
// so offsets returned by it always refer to that normalised text).

// #region markdown-core
const MD_FENCE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^`]*)$/
const MD_CLOSING_FENCE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/
const MD_HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/
const MD_HR_RE = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/
const MD_QUOTE_LINE_RE = /^ {0,3}>[ ]?(.*)$/
const MD_LIST_RE = /^( {0,3})([-*+]|\d{1,9}[.)])([ \t]+)(.*)$/
const MD_IMAGE_RE = /^ {0,3}!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+["'][^"']*["'])?\s*\)\s*$/
const MD_TABLE_DELIM_RE = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/
const MD_CALLOUT_RE = /^\[!([A-Za-z0-9_-]+)\]([+-])?[ \t]*(.*)$/
const MD_CITE_RE = /^\[p\.\s*\d+(?:\s*[-–]\s*\d+)?\]/i
const MD_FIGURE_LINE_RE = /^[ \t]*\[\[FIGURE:([\s\S]*?)\]\][ \t]*$/
const MD_FIGURE_PAGE_RE = /^(?:p\.?\s*)?(\d+)$/i
const MD_WS_RE = /[ \t\n\r\f\v]/

function mdIsBlank(value) {
  return /^[ \t]*$/.test(value)
}

function mdClip(value, limit) {
  const text = typeof value === 'string' ? value : String(value === undefined || value === null ? '' : value)
  return text.length > limit ? text.slice(0, limit) : text
}

// Split the normalised source into lines carrying absolute source offsets.
function mdSplitLines(source) {
  const lines = []
  let index = 0
  for (;;) {
    const newline = source.indexOf('\n', index)
    if (newline === -1) {
      lines.push({ text: source.slice(index), start: index, end: source.length })
      break
    }
    lines.push({ text: source.slice(index, newline), start: index, end: newline })
    index = newline + 1
  }
  return lines
}

// Inline parser. `text` is a contiguous slice of the source that starts at
// `base`, so every element keeps exact source offsets even after the markers
// are stripped from the rendered text.
function mdParseInline(value, base) {
  const text = typeof value === 'string' ? value : ''
  const offset = Number.isFinite(base) ? base : 0
  const inline = []
  let bufferStart = 0
  let index = 0
  const flush = (end) => {
    if (end > bufferStart) {
      inline.push({
        type: 'text',
        text: text.slice(bufferStart, end),
        srcStart: offset + bufferStart,
        srcEnd: offset + end,
      })
    }
  }
  while (index < text.length) {
    const char = text[index]
    if (char === '\\' && index + 1 < text.length) {
      index += 2
      continue
    }
    if (char === '`') {
      const close = text.indexOf('`', index + 1)
      if (close > index + 1) {
        flush(index)
        inline.push({
          type: 'code',
          text: text.slice(index + 1, close),
          srcStart: offset + index + 1,
          srcEnd: offset + close,
        })
        index = close + 1
        bufferStart = index
        continue
      }
    }
    if (char === '*' || char === '_') {
      const doubled = text[index + 1] === char
      if (doubled) {
        const close = text.indexOf(char + char, index + 2)
        if (close > index + 1) {
          flush(index)
          inline.push({
            type: 'strong',
            text: text.slice(index + 2, close),
            srcStart: offset + index + 2,
            srcEnd: offset + close,
          })
          index = close + 2
          bufferStart = index
          continue
        }
      } else if (!(char === '_' && /[A-Za-z0-9]/.test(text[index + 1] || ''))) {
        const close = text.indexOf(char, index + 1)
        if (close > index + 1) {
          flush(index)
          inline.push({
            type: 'em',
            text: text.slice(index + 1, close),
            srcStart: offset + index + 1,
            srcEnd: offset + close,
          })
          index = close + 1
          bufferStart = index
          continue
        }
      }
    }
    if (char === '[') {
      const cite = MD_CITE_RE.exec(text.slice(index))
      if (cite) {
        flush(index)
        inline.push({
          type: 'cite',
          text: cite[0],
          srcStart: offset + index,
          srcEnd: offset + index + cite[0].length,
        })
        index += cite[0].length
        bufferStart = index
        continue
      }
      const close = text.indexOf(']', index + 1)
      if (close > index && text[close + 1] === '(') {
        const end = text.indexOf(')', close + 2)
        if (end > close + 1) {
          flush(index)
          inline.push({
            type: 'link',
            text: text.slice(index + 1, close),
            srcStart: offset + index + 1,
            srcEnd: offset + close,
            href: text.slice(close + 2, end),
          })
          index = end + 1
          bufferStart = index
          continue
        }
      }
    }
    index += 1
  }
  flush(text.length)
  return inline
}

function mdLooksLikeTable(lines, at) {
  if (at + 1 >= lines.length) return false
  const header = lines[at].text
  const delimiter = lines[at + 1].text
  if (header.indexOf('|') === -1 || delimiter.indexOf('|') === -1) return false
  return MD_TABLE_DELIM_RE.test(delimiter)
}

// Build the inline runs of a multi-line paragraph one line at a time. Parsing
// the joined text in one slice would be cheaper, but quoted blocks are
// reconstructed without their `> ` markers, so neighbouring lines are not
// contiguous in the source. A synthetic newline element keeps the mapping
// monotonic in both cases.
function mdJoinLineInline(lines, from, to) {
  const inline = []
  for (let index = from; index < to; index += 1) {
    if (index > from) {
      const offset = lines[index - 1].end
      inline.push({ type: 'text', text: '\n', srcStart: offset, srcEnd: offset + 1 })
    }
    for (const item of mdParseInline(lines[index].text, lines[index].start)) inline.push(item)
  }
  return inline
}

function mdStartsBlock(lines, at) {
  const value = lines[at].text
  if (mdIsBlank(value)) return true
  if (MD_FENCE_RE.test(value)) return true
  if (MD_HEADING_RE.test(value)) return true
  if (MD_HR_RE.test(value)) return true
  if (MD_QUOTE_LINE_RE.test(value)) return true
  if (MD_IMAGE_RE.test(value)) return true
  if (MD_LIST_RE.test(value)) return true
  return mdLooksLikeTable(lines, at)
}

// Split one table row into trimmed cells that keep their source offsets.
function mdSplitTableRow(line) {
  const raw = line.text
  const cells = []
  let segmentStart = 0
  let index = 0
  const push = (from, to) => {
    let left = from
    let right = to
    while (left < right && /[ \t]/.test(raw[left])) left += 1
    while (right > left && /[ \t]/.test(raw[right - 1])) right -= 1
    cells.push({ text: raw.slice(left, right), start: line.start + left })
  }
  while (index <= raw.length) {
    if (index === raw.length || (raw[index] === '|' && raw[index - 1] !== '\\')) {
      push(segmentStart, index)
      segmentStart = index + 1
    }
    index += 1
  }
  if (cells.length > 0 && cells[0].text === '' && /^[ \t]*\|/.test(raw)) cells.shift()
  if (cells.length > 0 && cells[cells.length - 1].text === '' && /\|[ \t]*$/.test(raw)) cells.pop()
  return cells
}

// Translate every offset stored on a block (and its inline runs) through `map`.
function mdShiftBlocks(blocks, map) {
  const last = map.length - 1
  const at = (position) => {
    if (!Number.isFinite(position)) return map[0] || 0
    const clamped = Math.max(0, Math.min(last, Math.trunc(position)))
    return map[clamped]
  }
  const shiftInline = (inline) => {
    if (!Array.isArray(inline)) return
    for (const item of inline) {
      if (!item) continue
      item.srcStart = at(item.srcStart)
      item.srcEnd = at(item.srcEnd)
    }
  }
  for (const block of blocks) {
    if (!block) continue
    block.start = at(block.start)
    block.end = at(block.end)
    if (Number.isFinite(block.textStart)) block.textStart = at(block.textStart)
    shiftInline(block.inline)
    if (Array.isArray(block.items)) {
      for (const item of block.items) {
        if (!item) continue
        item.start = at(item.start)
        item.end = at(item.end)
        shiftInline(item.inline)
      }
    }
    if (Array.isArray(block.header)) {
      for (const cell of block.header) shiftInline(cell)
    }
    if (Array.isArray(block.rows)) {
      for (const row of block.rows) {
        if (!Array.isArray(row)) continue
        for (const cell of row) shiftInline(cell)
      }
    }
    if (Array.isArray(block.blocks)) mdShiftBlocks(block.blocks, map)
  }
  return blocks
}

function mdParseBlocks(source) {
  const lines = mdSplitLines(source)
  const blocks = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    const text = line.text
    if (mdIsBlank(text)) {
      index += 1
      continue
    }

    // Fenced code block.
    const fence = MD_FENCE_RE.exec(text)
    if (fence) {
      const marker = fence[1]
      const lang = (fence[2] || '').trim().split(/[ \t]+/)[0] || ''
      let close = index + 1
      while (close < lines.length) {
        const closing = MD_CLOSING_FENCE_RE.exec(lines[close].text)
        if (closing && closing[1][0] === marker[0] && closing[1].length >= marker.length) break
        close += 1
      }
      const closed = close < lines.length
      const bodyLines = lines.slice(index + 1, close)
      // An unclosed fence runs to EOF; the trailing newline produces one empty
      // sentinel line that is not part of the code.
      if (!closed && bodyLines.length > 0 && bodyLines[bodyLines.length - 1].text === '') bodyLines.pop()
      const inner = bodyLines.map((item) => item.text).join('\n')
      const textStart = bodyLines.length > 0
        ? bodyLines[0].start
        : index + 1 < lines.length ? lines[index + 1].start : line.end
      blocks.push({
        type: 'code',
        lang,
        text: inner,
        textStart,
        start: line.start,
        end: closed ? lines[close].end : lines[lines.length - 1].end,
      })
      index = closed ? close + 1 : lines.length
      continue
    }

    // Heading.
    const heading = MD_HEADING_RE.exec(text)
    if (heading) {
      const level = Math.min(heading[1].length, 4)
      const raw = heading[2] === undefined ? '' : heading[2]
      const contentOffset = text.length - raw.length
      const content = raw.replace(/[ \t]+#+[ \t]*$/, '').replace(/[ \t]+$/, '')
      blocks.push({
        type: 'heading',
        level,
        inline: mdParseInline(content, line.start + contentOffset),
        start: line.start,
        end: line.end,
      })
      index += 1
      continue
    }

    // Horizontal rule.
    if (MD_HR_RE.test(text)) {
      blocks.push({ type: 'hr', start: line.start, end: line.end })
      index += 1
      continue
    }

    // Table.
    if (mdLooksLikeTable(lines, index)) {
      const header = mdSplitTableRow(lines[index]).map((cell) => mdParseInline(cell.text, cell.start))
      let cursor = index + 2
      const rows = []
      while (cursor < lines.length && !mdIsBlank(lines[cursor].text) && lines[cursor].text.indexOf('|') !== -1) {
        rows.push(mdSplitTableRow(lines[cursor]).map((cell) => mdParseInline(cell.text, cell.start)))
        cursor += 1
      }
      blocks.push({ type: 'table', header, rows, start: line.start, end: lines[cursor - 1].end })
      index = cursor
      continue
    }

    // Block quote, with optional Obsidian callout marker on the first line.
    if (MD_QUOTE_LINE_RE.test(text)) {
      const collected = []
      let cursor = index
      while (cursor < lines.length) {
        const match = MD_QUOTE_LINE_RE.exec(lines[cursor].text)
        if (!match) break
        const value = match[1]
        collected.push({ text: value, start: lines[cursor].start + (lines[cursor].text.length - value.length) })
        cursor += 1
      }
      let callout = null
      const marker = MD_CALLOUT_RE.exec(collected[0].text)
      if (marker) {
        callout = { title: (marker[3] || '').trim(), kind: marker[1].toLowerCase() }
        // The callout title is metadata for the renderer, not body text.
        collected.shift()
      }
      const content = collected.map((item) => item.text).join('\n')
      const map = []
      collected.forEach((item, position) => {
        if (position > 0) map.push(item.start)
        for (let offset = 0; offset < item.text.length; offset += 1) map.push(item.start + offset)
      })
      const tail = cursor < lines.length ? lines[cursor].start : lines[lines.length - 1].end
      map.push(Math.max(tail, map.length > 0 ? map[map.length - 1] : tail))
      blocks.push({
        type: 'quote',
        blocks: mdShiftBlocks(mdParseBlocks(content), map),
        callout,
        start: line.start,
        end: lines[cursor - 1].end,
      })
      index = cursor
      continue
    }

    // Block image (own line).
    const image = MD_IMAGE_RE.exec(text)
    if (image) {
      blocks.push({ type: 'image', src: image[2], alt: image[1], start: line.start, end: line.end })
      index += 1
      continue
    }

    // Flat list; continuation lines are folded into the item and nested
    // markers stay plain text on purpose.
    const listItem = MD_LIST_RE.exec(text)
    if (listItem) {
      const ordered = /\d/.test(listItem[2])
      const items = []
      let cursor = index
      while (cursor < lines.length) {
        const item = MD_LIST_RE.exec(lines[cursor].text)
        if (!item) break
        if (/\d/.test(item[2]) !== ordered) break
        const contentStart = lines[cursor].start + item[1].length + item[2].length + item[3].length
        let inline = mdParseInline(item[4], contentStart)
        let itemEnd = lines[cursor].end
        let next = cursor + 1
        while (next < lines.length) {
          const continuation = lines[next].text
          if (mdIsBlank(continuation)) break
          if (MD_LIST_RE.test(continuation)) break
          if (mdStartsBlock(lines, next)) break
          if (!/^[ \t]/.test(continuation)) break
          const stripped = continuation.replace(/^[ \t]+/, '')
          const offset = lines[next].start + (continuation.length - stripped.length)
          inline = inline.concat(
            [{ type: 'text', text: '\n', srcStart: lines[next].start, srcEnd: lines[next].start + 1 }],
            mdParseInline(stripped, offset),
          )
          itemEnd = lines[next].end
          next += 1
        }
        items.push({ inline, start: lines[cursor].start, end: itemEnd })
        cursor = next
      }
      blocks.push({ type: 'list', ordered, items, start: line.start, end: items[items.length - 1].end })
      index = cursor
      continue
    }

    // Paragraph: consume lines until a blank line or the start of another block.
    let cursor = index + 1
    while (cursor < lines.length && !mdIsBlank(lines[cursor].text) && !mdStartsBlock(lines, cursor)) cursor += 1
    blocks.push({
      type: 'paragraph',
      inline: mdJoinLineInline(lines, index, cursor),
      start: line.start,
      end: lines[cursor - 1].end,
    })
    index = cursor
  }
  return blocks
}

/**
 * Parse Markdown into a block tree. Tolerant by design: unclosed markers,
 * unbalanced tables and odd indentation never throw.
 * @param {string} source
 * @returns {{ blocks: object[] }}
 */
function parseMarkdown(source) {
  try {
    const text = typeof source === 'string' ? source : ''
    return { blocks: mdParseBlocks(text.replace(/\r\n?/g, '\n')) }
  } catch {
    return { blocks: [] }
  }
}

function mdPushRun(state, value, offsetAt) {
  if (typeof value !== 'string' || value.length === 0) return
  for (let index = 0; index < value.length; index += 1) state.map.push(offsetAt(index))
  state.text += value
}

function mdPushInline(state, inline) {
  if (!Array.isArray(inline)) return
  for (const item of inline) {
    if (!item || typeof item.text !== 'string' || item.text.length === 0) continue
    const base = Number.isFinite(item.srcStart) ? item.srcStart : 0
    mdPushRun(state, item.text, (index) => base + index)
  }
}

function mdInlineStart(inline, fallback) {
  if (Array.isArray(inline)) {
    for (const item of inline) {
      if (item && Number.isFinite(item.srcStart)) return item.srcStart
    }
  }
  return Number.isFinite(fallback) ? fallback : 0
}

function mdProjectBlock(block, state) {
  if (block.type === 'heading' || block.type === 'paragraph') {
    mdPushInline(state, block.inline)
    return
  }
  if (block.type === 'list') {
    const items = Array.isArray(block.items) ? block.items : []
    items.forEach((item, position) => {
      if (!item) return
      if (position > 0) mdPushRun(state, '\n', () => (Number.isFinite(item.start) ? item.start : 0))
      mdPushInline(state, item.inline)
    })
    return
  }
  if (block.type === 'code') {
    if (typeof block.text === 'string' && block.text.length > 0) {
      const base = Number.isFinite(block.textStart)
        ? block.textStart
        : Number.isFinite(block.start) ? block.start : 0
      mdPushRun(state, block.text, (index) => base + index)
    }
    return
  }
  if (block.type === 'table') {
    const rows = []
    if (Array.isArray(block.header)) rows.push(block.header)
    if (Array.isArray(block.rows)) {
      for (const row of block.rows) rows.push(row)
    }
    rows.forEach((row, rowIndex) => {
      if (!Array.isArray(row)) return
      if (rowIndex > 0) {
        const offset = mdInlineStart(row[0], block.start)
        mdPushRun(state, '\n', () => offset)
      }
      row.forEach((cell, cellIndex) => {
        if (cellIndex > 0) {
          const offset = mdInlineStart(cell, block.start)
          mdPushRun(state, '\t', () => offset)
        }
        mdPushInline(state, cell)
      })
    })
    return
  }
  if (block.type === 'quote') {
    const children = Array.isArray(block.blocks) ? block.blocks : []
    let first = true
    for (const child of children) {
      if (!child || typeof child !== 'object') continue
      if (!first) mdPushRun(state, '\n', () => (Number.isFinite(child.start) ? child.start : 0))
      first = false
      child.plainStart = state.text.length
      mdProjectBlock(child, state)
      child.plainEnd = state.text.length
    }
  }
}

/**
 * Flatten parsed blocks into the plain text a reader selects from.
 * `map[i]` is the source offset of `text[i]` and is non-decreasing.
 * Block objects get `plainStart`/`plainEnd` written back in place.
 * @param {object[]} blocks
 * @returns {{ text: string, map: number[] }}
 */
function plainProjection(blocks) {
  const state = { text: '', map: [] }
  const list = Array.isArray(blocks) ? blocks : []
  for (const block of list) {
    if (!block || typeof block !== 'object') continue
    const start = Number.isFinite(block.start) ? block.start : 0
    if (state.text.length > 0) mdPushRun(state, '\n', () => start)
    block.plainStart = state.text.length
    mdProjectBlock(block, state)
    block.plainEnd = state.text.length
  }
  return { text: state.text, map: state.map }
}

// Collapse whitespace runs into one space and remember where every remaining
// character came from, so quote matching survives re-wrapped text.
function mdNormalizeWhitespace(value) {
  const text = typeof value === 'string' ? value : ''
  const chars = []
  const index = []
  let previousSpace = false
  for (let position = 0; position < text.length; position += 1) {
    const char = text[position]
    if (MD_WS_RE.test(char)) {
      if (!previousSpace) {
        chars.push(' ')
        index.push(position)
        previousSpace = true
      }
    } else {
      chars.push(char)
      index.push(position)
      previousSpace = false
    }
  }
  let from = 0
  let to = chars.length
  while (from < to && chars[from] === ' ') from += 1
  while (to > from && chars[to - 1] === ' ') to -= 1
  return { text: chars.slice(from, to).join(''), index: index.slice(from, to) }
}

function mdPlainPositionForSource(projection, sourceOffset) {
  if (!Number.isFinite(sourceOffset)) return -1
  const map = projection.map
  let low = 0
  let high = map.length - 1
  let found = -1
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    if (map[middle] >= sourceOffset) {
      found = middle
      high = middle - 1
    } else {
      low = middle + 1
    }
  }
  return found
}

/**
 * Find `quote` inside the projection, preferring prefix/suffix context and then
 * the candidate closest to the stored source offset.
 * @returns {{plainStart:number, plainEnd:number, start:number, end:number, exact:boolean}|null}
 */
function locateQuote(projection, selection) {
  if (!projection || typeof projection.text !== 'string' || !Array.isArray(projection.map)) return null
  const request = selection && typeof selection === 'object' ? selection : {}
  const needle = mdNormalizeWhitespace(request.quote)
  if (!needle.text) return null
  const haystack = mdNormalizeWhitespace(projection.text)
  const matches = []
  let from = 0
  while (from <= haystack.text.length) {
    const at = haystack.text.indexOf(needle.text, from)
    if (at === -1) break
    matches.push(at)
    from = at + 1
  }
  if (matches.length === 0) return null
  const prefix = mdNormalizeWhitespace(request.prefix)
  const suffix = mdNormalizeWhitespace(request.suffix)
  const target = mdPlainPositionForSource(projection, request.start)
  let best = null
  for (const at of matches) {
    // Slice one extra character on each side: whitespace runs in the haystack
    // are single spaces, while the stored context may end with a space that
    // normalisation trimmed away.
    const before = haystack.text.slice(Math.max(0, at - prefix.text.length - 1), at).replace(/ $/, '')
    const after = haystack.text.slice(at + needle.text.length, at + needle.text.length + suffix.text.length + 1).replace(/^ /, '')
    const prefixOk = prefix.text.length > 0 && before.endsWith(prefix.text)
    const suffixOk = suffix.text.length > 0 && after.startsWith(suffix.text)
    const candidate = {
      plainStart: haystack.index[at],
      plainEnd: haystack.index[at + needle.text.length - 1] + 1,
      score: (prefixOk ? 2 : 0) + (suffixOk ? 1 : 0),
      distance: target >= 0 ? Math.abs(haystack.index[at] - target) : 0,
    }
    if (!best || candidate.score > best.score
      || (candidate.score === best.score && candidate.distance < best.distance)) {
      best = candidate
    }
  }
  const mapped = mapPlainToSource(projection, best.plainStart, best.plainEnd)
  if (!mapped) return null
  return {
    plainStart: best.plainStart,
    plainEnd: best.plainEnd,
    start: mapped.start,
    end: mapped.end,
    exact: matches.length === 1,
  }
}

/**
 * Translate a plain-text range into source offsets. Leading/trailing
 * whitespace of the range is dropped; illegal ranges return null.
 * @returns {{start:number, end:number}|null}
 */
function mapPlainToSource(projection, plainStart, plainEnd) {
  if (!projection || typeof projection.text !== 'string' || !Array.isArray(projection.map)) return null
  const length = projection.text.length
  if (!Number.isFinite(plainStart) || !Number.isFinite(plainEnd)) return null
  let from = Math.trunc(plainStart)
  let to = Math.trunc(plainEnd)
  if (from < 0 || to > length || from >= to) return null
  while (from < to && MD_WS_RE.test(projection.text[from])) from += 1
  while (to > from && MD_WS_RE.test(projection.text[to - 1])) to -= 1
  if (from >= to) return null
  const start = projection.map[from]
  const end = projection.map[to - 1] + 1
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
  return { start, end }
}

/**
 * Apply non-overlapping replacements. Replacements are spliced from the end of
 * the text backwards; the ones that overlap an already applied range are
 * reported as skipped (invalid entries are skipped as well).
 * @returns {{text:string, applied:object[], skipped:object[]}}
 */
function applyReplacements(source, replacements) {
  const text = typeof source === 'string' ? source : ''
  const list = Array.isArray(replacements) ? replacements : []
  const candidates = []
  const skipped = []
  for (const item of list) {
    if (!item || typeof item !== 'object') {
      if (item && typeof item === 'object') skipped.push(item)
      continue
    }
    const start = Number(item.start)
    const end = Number(item.end)
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      skipped.push(item)
      continue
    }
    const from = Math.trunc(start)
    const to = Math.trunc(end)
    if (from < 0 || to < from || to > text.length) {
      skipped.push(item)
      continue
    }
    candidates.push({
      item,
      start: from,
      end: to,
      replacement: typeof item.replacement === 'string' ? item.replacement : '',
    })
  }
  candidates.sort((left, right) => (right.start - left.start) || (right.end - left.end))
  const applied = []
  let output = text
  let boundary = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    if (candidate.end > boundary) {
      skipped.push(candidate.item)
      continue
    }
    output = output.slice(0, candidate.start) + candidate.replacement + output.slice(candidate.end)
    applied.push(candidate.item)
    boundary = candidate.start
  }
  return { text: output, applied, skipped }
}

/**
 * Find `[[FIGURE: p.7 | caption | hint]]` placeholders. `start`/`end` cover the
 * whole line including its trailing newline; `line` is the 1-based line number.
 * @returns {{index:number,start:number,end:number,line:number,page:number,caption:string,hint:string}[]}
 */
function findFigurePlaceholders(source) {
  const text = typeof source === 'string' ? source : ''
  const found = []
  let position = 0
  let lineNumber = 0
  while (position <= text.length) {
    const newline = text.indexOf('\n', position)
    const lineEnd = newline === -1 ? text.length : newline
    let lineText = text.slice(position, lineEnd)
    if (lineText.endsWith('\r')) lineText = lineText.slice(0, -1)
    lineNumber += 1
    const match = MD_FIGURE_LINE_RE.exec(lineText)
    if (match) {
      const fields = match[1].split('|')
      const pageMatch = MD_FIGURE_PAGE_RE.exec((fields[0] || '').trim())
      const page = pageMatch ? Number.parseInt(pageMatch[1], 10) : 0
      if (Number.isFinite(page) && page > 0) {
        found.push({
          index: found.length,
          start: position,
          end: newline === -1 ? lineEnd : newline + 1,
          line: lineNumber,
          page,
          caption: mdClip((fields[1] || '').trim(), 200),
          hint: mdClip(fields.slice(2).join('|').trim(), 400),
        })
      }
    }
    if (newline === -1) break
    position = newline + 1
  }
  return found
}
// #endregion markdown-core

export {
  parseMarkdown,
  plainProjection,
  locateQuote,
  mapPlainToSource,
  applyReplacements,
  findFigurePlaceholders,
}
