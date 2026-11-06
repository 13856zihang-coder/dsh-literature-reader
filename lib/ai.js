import { delay, errorMessage, parseJsonLoose, stripDataUrl } from './util.js'
import { normalizePreference, resolveEffort } from './settings.js'

const MAX_ANALYSIS_CHUNK = 90_000

function textOfBlocks(blocks) {
  return blocks
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
}

function normalizeTags(value) {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,，、;；#\s]+/)
      : []
  const seen = new Set()
  const tags = []
  for (const item of list) {
    const tag = String(item || '')
      .replace(/^#/, '')
      .replace(/[\[\]"']/g, '')
      .trim()
    if (!tag || tag.length > 24) continue
    if (seen.has(tag)) continue
    seen.add(tag)
    tags.push(tag)
  }
  return tags.slice(0, 10)
}

function normalizeMetadata(raw, fallbackTitle) {
  const source = raw && typeof raw === 'object' ? raw : {}
  const authors = Array.isArray(source.authors)
    ? source.authors.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 12)
    : typeof source.authors === 'string'
      ? source.authors.split(/[，,;；]/).map((item) => item.trim()).filter(Boolean).slice(0, 12)
      : []
  const yearValue = Number.parseInt(String(source.year ?? ''), 10)
  return {
    title: String(source.title || fallbackTitle || '').trim() || fallbackTitle || '未命名文献',
    authors,
    year: Number.isFinite(yearValue) && yearValue > 1800 && yearValue < 2200 ? yearValue : null,
    venue: String(source.venue || source.journal || source.conference || '').trim(),
    doi: String(source.doi || '')
      .replace(/^https?:\/\/doi\.org\//i, '')
      .trim(),
    abstract: String(source.abstract || '').trim().slice(0, 6000),
    keywords: normalizeTags(source.keywords).slice(0, 10),
    field: String(source.field || '').trim().slice(0, 80),
    tags: normalizeTags(source.tags),
  }
}

function extractTldr(memo) {
  if (!memo) return ''
  const heading = memo.match(
    /##\s*(?:\d+[.、]\s*)?(?:一句话(?:总结|结论)|摘要|论文速览)[^\n]*\n+([^\n#]+)/i,
  )
  if (heading && heading[1].trim()) return heading[1].trim().replace(/^[-*]\s*/, '').slice(0, 360)
  const paragraphs = memo
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/\n{2,}/)
    .map((item) => item.replace(/^#+\s*/, '').trim())
    .filter((item) => item.length > 20 && !/^[-|]/.test(item))
  return (paragraphs[0] || memo.replace(/\s+/g, ' ')).slice(0, 360)
}

function trimText(text, limit) {
  if (text.length <= limit) return text
  return `${text.slice(0, limit)}\n\n（后续内容因篇幅过长已省略）`
}

function sanitizeModelText(text) {
  return String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/\u0000/g, '')
    .trim()
}

// The study-note template asks the model for at most this many figure
// placeholders; the host crops them from the PDF afterwards.
const DEFAULT_SUMMARY_FIGURES = 5
const MAX_SUMMARY_FIGURES = 10
// A figure box narrower than 5% of the page is treated as a miss.
const BBOX_MIN_SPAN = 50

function normalizeFigureLimit(value) {
  const parsed = Number.parseInt(String(value ?? DEFAULT_SUMMARY_FIGURES), 10)
  if (!Number.isFinite(parsed)) return DEFAULT_SUMMARY_FIGURES
  return Math.min(MAX_SUMMARY_FIGURES, Math.max(0, parsed))
}

/** Heading lines of a note, with their source offsets. */
function headingLines(markdown) {
  const list = []
  let offset = 0
  for (const raw of String(markdown || '').split('\n')) {
    const line = raw.trimEnd()
    const match = /^(#{1,6})\s+(.+)$/.exec(line)
    if (match) {
      list.push({
        level: match[1].length,
        text: match[2].replace(/\s+#+\s*$/, '').trim(),
        line,
        offset,
      })
    }
    offset += raw.length + 1
  }
  return list
}

/**
 * Find the heading line a model named. The model may omit the leading hashes
 * or repeat the title with different spacing, but it must name exactly one
 * real heading; an ambiguous name is treated as a miss.
 */
function matchHeading(markdown, candidate) {
  const raw = String(candidate || '')
    .replace(/^#+\s*/, '')
    .replace(/\s+#+\s*$/, '')
    .trim()
  if (!raw) return null
  const items = headingLines(markdown)
  const exact = items.filter((item) => item.text === raw)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return null
  const compact = raw.replace(/\s+/g, ' ')
  const loose = items.filter((item) => item.text.replace(/\s+/g, ' ') === compact)
  return loose.length === 1 ? loose[0] : null
}

/**
 * Split a note into paragraphs/headings. A heading always starts a new block,
 * so the annotation excerpt can be reassembled without mangling structure.
 */
function splitSourceBlocks(markdown) {
  const blocks = []
  let current = null
  let offset = 0
  for (const line of String(markdown || '').split('\n')) {
    const start = offset
    offset += line.length + 1
    if (!line.trim()) {
      current = null
      continue
    }
    const heading = /^#{1,6}\s+/.test(line)
    if (!current || heading || current.heading) {
      current = { heading, start, end: offset, text: line }
      blocks.push(current)
    } else {
      current.text += `\n${line}`
      current.end = offset
    }
  }
  return blocks
}

/**
 * Keep the paragraphs around every annotation plus every heading, so a note
 * longer than the context budget can still be revised in place.
 */
function excerptAroundAnnotations(markdown, annotations, budget) {
  const source = String(markdown || '')
  const headings = headingLines(source)
  const headingText = headings.length
    ? headings.map((item) => item.line).join('\n')
    : '（正文没有标题行）'
  if (source.length <= budget) return source
  const blocks = splitSourceBlocks(source)
  const picked = new Set()
  const window = 800
  for (const annotation of annotations) {
    let start = Number.isFinite(annotation.start) ? annotation.start : -1
    let end = Number.isFinite(annotation.end) ? annotation.end : -1
    if (start < 0 && annotation.quote) {
      const index = source.indexOf(annotation.quote)
      if (index >= 0) {
        start = index
        end = index + annotation.quote.length
      }
    }
    if (start < 0) continue
    const from = Math.max(0, start - window)
    const to = (end > start ? end : start) + window
    for (let index = 0; index < blocks.length; index += 1) {
      if (blocks[index].end >= from && blocks[index].start <= to) picked.add(index)
    }
  }
  const parts = []
  let previous = -2
  for (const index of [...picked].sort((a, b) => a - b)) {
    if (previous >= 0 && index !== previous + 1) parts.push('（……此处省略部分正文……）')
    parts.push(blocks[index].text)
    previous = index
  }
  const textBudget = Math.max(4_000, budget - headingText.length - 200)
  let excerpt = parts.length ? parts.join('\n\n') : trimText(source, textBudget)
  if (excerpt.length > textBudget) excerpt = trimText(excerpt, textBudget)
  // A plain marker, not a heading: the model must not mistake it for note text.
  return `${excerpt}\n\n【节选之外的全文标题（仅供参考，不要输出、不要改动）】\n${headingText}`
}

/** Normalize a vision bbox to integer 0-1000 corners, or null when unusable. */
function normalizeBbox(value) {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? [value.x0 ?? value.x, value.y0 ?? value.y, value.x1, value.y1]
      : null
  if (!source || source.length !== 4) return null
  const numbers = source.map((item) => Number(item))
  if (numbers.some((item) => !Number.isFinite(item))) return null
  let [x0, y0, x1, y1] = numbers.map((item) => Math.round(item))
  if (x0 > x1) [x0, x1] = [x1, x0]
  if (y0 > y1) [y0, y1] = [y1, y0]
  const clamp = (item) => Math.min(1000, Math.max(0, item))
  const box = [clamp(x0), clamp(y0), clamp(x1), clamp(y1)]
  if (box[2] - box[0] < BBOX_MIN_SPAN || box[3] - box[1] < BBOX_MIN_SPAN) return null
  return box
}

/**
 * Insertion offset for "put the image in section X": the end of that section,
 * before the next heading of the same or a higher level.
 */
function sectionEndOffset(markdown, heading) {
  const source = String(markdown || '')
  const items = headingLines(source)
  const index = items.findIndex((item) => item.offset === heading.offset)
  let end = source.length
  for (let cursor = index + 1; cursor >= 0 && cursor < items.length; cursor += 1) {
    if (items[cursor].level <= heading.level) {
      end = items[cursor].offset
      break
    }
  }
  while (end > heading.offset && /\s/.test(source[end - 1])) end -= 1
  return end
}

/** Collapse a caption to one bounded line. */
function cleanCaption(value, fallback = '') {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
  return (text || fallback).slice(0, 200)
}

/** Move an insertion offset back to the start of its line. */
function snapToLineStart(markdown, offset) {
  const source = String(markdown || '')
  const position = Math.min(source.length, Math.max(0, offset))
  const previousBreak = source.lastIndexOf('\n', Math.max(0, position - 1))
  return previousBreak + 1
}

// ---------------------------------------------------------------------------
// Study-note template (docs/summary-editor-spec.md §3.1)
// ---------------------------------------------------------------------------

// Reader actions whose answers are look-up glosses rather than study discussion.
// They are worth keeping in the chat, but they must not reach the summary: a
// list of one-word translations is noise in a reading note. Add an action here
// only when its answer is a lookup rather than an explanation.
const GLOSS_ACTIONS = new Set(['translate'])

/**
 * Drop look-up turns (word/sentence translations) from a chat history before it
 * becomes summary material. An assistant reply carries no `action` of its own,
 * so replies are dropped by association: every assistant message that follows a
 * dropped user turn belongs to that turn. A user message without an `action`
 * predates the field and is always kept.
 */
export function filterStudyHistory(history) {
  const kept = []
  let dropReplies = false
  for (const message of Array.isArray(history) ? history : []) {
    const role = message?.role
    if (role === 'user') {
      dropReplies = GLOSS_ACTIONS.has(String(message.action || '').toString())
      if (!dropReplies) kept.push(message)
      continue
    }
    if (role === 'assistant' && !dropReplies) kept.push(message)
  }
  return kept
}

/**
 * Render the caller-supplied glossary for the prompt. Terms the reader actually
 * looked up (`source: 'translated'`) lead, because those are the ones worth
 * explaining again; the host caps the list, this only orders and labels it.
 */
function formatGlossaryForPrompt(glossary) {
  const list = (Array.isArray(glossary) ? glossary : [])
    .map((item) => ({
      term: String(item?.term || '').trim(),
      translation: String(item?.translation || '').trim(),
      translated: item?.source === 'translated',
    }))
    .filter((item) => item.term)
  if (!list.length) return ''
  const ordered = [...list.filter((item) => item.translated), ...list.filter((item) => !item.translated)]
  const lines = ordered.map((item) =>
    item.translation ? `- ${item.term}：${item.translation}${item.translated ? '（用户查过的词）' : ''}` : `- ${item.term}${item.translated ? '（用户查过的词）' : ''}`,
  )
  return `名词表（来自用户翻译记录与本篇判断，合并去重后写进"## 名词解释"，用户查过的词优先收录）：\n${lines.join('\n')}\n`
}

/**
 * The summary skeleton. Verbatim and flush-left: the returned Markdown must have
 * exactly this shape. This is a quick-recall card, not a study note — a reader
 * comes back a month later to remember what the paper said, how it is actually
 * done, and how far to trust it. No numbered sub-sections, ever; the only place a
 * `###` is allowed is inside the technical block, one per parallel idea, and the
 * only table is the glossary at the very end.
 */
const SUMMARY_SKELETON = `# <论文标题>

> [!abstract] 速览
> **一句话**：这篇文献做了什么，核心结论是什么
> **为什么值得读 / 我的判断**：证据够不够、值不值得深入

## 这篇文献讲了什么

…

## 核心方法 / 技术点

…

## 关键结论

…

## 论文未解决的问题

…

## 已弄懂的知识点

…

## 名词解释

| 名词 | 解释 |
| --- | --- |
`

/** What belongs in each block, so the model fills the frame instead of the hints. */
const SUMMARY_SECTION_GUIDE = `各块写什么：
- 速览：两行实话。第一行说清"做了什么 + 结论是什么"，第二行给判断（证据够不够、值不值得深入）。不要铺垫，不要罗列。
- 这篇文献讲了什么：2-4 段连贯文字，不要小标题、不要分点。按"问题是什么 → 怎么做 → 得到什么"的思路写，让人一口气读完就明白全貌。这一块给全貌，技术细节留给下一块，两块不要重复。
- 核心方法 / 技术点：**这一块最重要，必写**。回答"这篇文献真正的技术内核是什么、它是怎么做到的"，不是复述流程。按文献类型换写法：
  - 电路 / 器件类：核心电路结构由哪些模块或元件构成，信号怎么走，关键设计参数各自起什么作用（例如"发射端 VOD 主 driver + pre-tap + 2× post-tap 抽头，接收端连续时间线性均衡 + 判决反馈"这类结构描述）。
  - 算法 / 方法类：核心算法或流程是什么，关键步骤与关键公式，和朴素做法的本质区别在哪。
  - 实验 / 测量类：测量方法、装置或流程的关键设计，以及它为什么能测准。
  - 综述类：分类框架是什么，按什么维度切分，各类方法的取舍。
  - 理论类：核心假设与推导思路，关键的那一步是怎么来的。
  - 讲解型 / 应用笔记 / 教程型：这类文档没有新方法、也没有实验对比，价值就在"把某个器件特性或技术原理讲清楚"。核心要点**就是它想讲解出来的内容本身**：这个功能/器件是怎么工作的；有哪几个可配置项，各自的作用与相互影响；什么情况下效果好、什么情况下会变差（操作性的经验判断）。**不要硬套"方法 / 实验 / 结论"的语气**，要还原它"教会读者什么"。
  **这一块写多详细，由这篇文献技术内核的实际复杂度决定，不设字数标准**：
  - 技术点简单、单一（例如短文只介绍一个方法）：讲透即可，不要为凑长度展开。
  - 技术点复杂、要点多（例如多个抽头结构 + 量化公式 + 接收端均衡一起出现）：该展开就展开，把每个要点的机理讲清楚。
  - 判断标准是"**读者能否仅凭这一节理解技术内核**"，不是写了多少字。
  - 宁可写长而清楚，也不要短而含糊；反过来，内容简单时不要注水。
  可展开的方向（按需取用，不是清单任务）：
  - 结构描述更具体：信号怎么走、模块之间怎么连接、可配置项之间**如何相互影响**。
  - 关键参数的作用机理，而不只是"有这个参数"。
  - 为什么要这样设计（设计动机），以及不这样设计会怎样。
  - 数值示例的具体条件与来源。
  不得注入与"理解技术内核"无关的细节（论文的排版、章节安排、致谢、投稿信息）。加长的是技术密度，不是字数。
  块内组织（按技术点数量二选一）：
  - **只有一个技术点**：连贯成文，不要小标题，**不要退化成项目符号清单**。
  - **两个及以上并列的核心要点 / 技术点**：在"## 核心方法 / 技术点"内部用"### <技术点名称>"分块，**每个要点一块**。块数与要点数量一致，不要为了对称硬拆；要点很多时（例如 4 个抽头、16 个均衡模式）**不要逐项罗列，按作用分组讲**。
  块内还可以先写一两句总述再分块；术语就地解释。涉及电路结构、系统框图、算法流程的，把 [[FIGURE: ...]] 占位符放在这一块，这是插图最有价值的位置。
- 关键结论：3-5 条，每条一句话，带页码或关键数字。这是回顾时最需要抓住的东西。结论是否可信、前提是否苛刻、哪里容易误读，**就地写进这一条里**（例如"…提升 30%，但只在一条背板上验证，外推要谨慎"），不要另起一节做风险清单。
- 论文未解决的问题：**作者视角**——文献自己承认的未完成部分，或明确写出的"留待将来""本文未给出""需要进一步研究"。3-5 条，每条一句话，带 [p.X]。只写作者说的，不要写我们推测的。**文献没有这类表述就整节省略（连标题一起不要写）**。与"关键结论"里的谨慎措辞分工：这里写"作者说自己没做完什么"，那里写"我们该对哪些结论保持警惕"，同一件事不要两边各写一遍。
- 已弄懂的知识点：取材于用户问答记录里**已经得到解答**的部分——也就是"我原来不懂、后来通过与 AI 反复问答搞明白了"的内容，判断依据是问答记录里 AI 给出了实质解释。
  - **每条必须是一句陈述句知识点，不是问句**。反例："pre-emphasis 为什么等价于 FIR 多抽头？"；正例："pre-emphasis 等价于多抽头 FIR：每个抽头对应当前符号前后不同位置的影响，加权相加即可抵消对应位置的 ISI。"
  - 写成读者自己能直接读懂的结论；读完应当能回忆起"哦对，这点我当时搞明白了"。
  - 2-6 条；只收有理解价值的，不要收翻译、单词释义。没有值得收的就整节省略。
  - **不要写"用户问了……""通过与 AI 对话了解到……"这类元叙述**，直接给知识点本身。
- 名词解释：全文**唯一允许的表格**，放在文章最末。两个来源合并去重：①用户翻译过的词条（标了 source=translated 的，优先考虑收录）；②判断本文确实需要解释的关键术语。
  用户查过的词条**不是照单全收**：只有真正的专业名词 / 技术术语才收，判断标准是"**理解本文技术内容是否需要它**"。
  - **不要收录**：动词短语（travel through、be subject to）、普通副词（primarily、thereby、roughly）、常见形容词（specific、adjacent、optimal、typical）、通用基础词（purple、green、waveform 之外的一般词汇）。这些是查词行为，不是本文概念。
  - **必须收录**：本文的核心概念术语，哪怕是短单词——例如 pre-emphasis、linear equalization、ISI、pre-cursor、post-cursor、cursor、polarity、VOD、DFE、CDR 这类，正是读者回头最可能忘的。
  - 判断依据是"是否属于本文的技术概念"，**不是词条长度、不是它来自哪里**：短词可能是核心术语（cursor），长词也可能是普通词（implementation）。
  - 数量上限 12 条；超过时按"对理解本文技术内核的重要程度"取舍，不要按长度或字母顺序。
  没有可解释的名词就整节省略（连标题和表格一起不要写）。`

const SUMMARY_RULES = `写作要求：
- 第一行必须是"TAGS: 标签1, 标签2, ..."这样的单行标记，给出 3-8 个适合 Obsidian 检索的短标签（中英混合可以）；TAGS 行之后空一行再写标题。
- 直接输出 Markdown 正文，不要 YAML frontmatter，不要用代码围栏包住全文。
- 板块只有骨架里这几个，标题文字照抄，顺序不变；不要自造板块，也不要把可省略的板块留成空标题。
- 层级只允许两层："##" 是骨架里的固定板块（文字照抄，不编号）；"###" 只允许出现在"## 核心方法 / 技术点"内部、用于并列的技术点分块，且不带编号。其余任何地方都不许出现三级标题，更不许出现"## 1." "## 2." 这类编号大节或 1.1 / 1.2 这类论文式编号子节——那是逐节复述原文，不是速览。
- 全文只允许"## 名词解释"下面这一张表格，其他板块不要用表格。
- "## 核心方法 / 技术点"必写：任何文献都有技术内核，写不出"它是怎么做到的"就说明还没读懂，不许省略、不许用一句空话敷衍。详略按这篇文献技术内核的实际复杂度来定，见上面对这一块的说明。
- 这份材料的身份是"文献总结"：正文里不要称它为"笔记""学习笔记"；需要自称时用"本文""这份总结"，或者直接省略主语。
- 中文写作，保留必要的英文术语、变量名与公式；正文里不常见的术语第一次出现时就地用一个括号说明；需要成体系解释的名词统一放到"## 名词解释"，不要在正文重复一遍。
- 事实标 [p.X] 页码；关键数字、实验条件、公式（对理解必要时）都要保留。
- 面向"一个月后回来快速回忆"：写结论和判断，不要按论文的行文顺序复述，不要逐节展开，不要把一个概念解释两遍。
- 用户问答记录只用来补充理解（为什么这样设计、和别的方案比如何、某个现象怎么解释），以及提炼"已弄懂的知识点"；不要复述单词释义、术语翻译或逐句译文。
- 按文献类型调整重心：实验论文多写数据集、基线、关键数字；应用笔记/设计报告写实测或仿真条件与验证结果，不要硬凑"消融"；讲解型/教程型还原它讲清了哪些原理与操作经验；综述写清分类框架与各类方法的取舍；理论论文写清假设、主要结论与验证方式。
- 篇幅由文献实际内容决定：简单文献可以很短（几百字），复杂文献可以长一些。约束的是"不注水"而不是"不超过多少字"——每一句都要有信息量，不要为了填满板块而复述或铺垫。通常不超过 3000 字，除非文献本身技术内容极其密集。
- 简洁不等于省略判断：结论是否可信、前提是否苛刻、哪里容易误读，要写，但**写进"关键结论"的对应条目里**，不要单独立节。
- 不要编造论文没有的实验、数字、引用。`

export class LiteratureAI {
  constructor(ctx, config) {
    this.ctx = ctx
    this.config = config
    this.infoCache = new Map()
    // The user's own pick, loaded from the plugin data directory. The
    // deployment config stays as the fallback for a fresh install.
    this.preference = { provider: '', model: '', reasoningEffort: '' }
  }

  setPreference(preference) {
    this.preference = normalizePreference(preference)
    this.infoCache.clear()
  }

  getPreference() {
    return { ...this.preference }
  }

  selection() {
    const fallback = this.ctx.agentDefaultModel.currentSelection()
    return {
      provider: this.preference.provider || this.config.provider || fallback.provider,
      model: this.preference.model || this.config.model || fallback.model,
      reasoningEffort: this.preference.reasoningEffort || '',
    }
  }

  label() {
    const selection = this.selection()
    return `${selection.provider}/${selection.model}`
  }

  /** Every provider route with its models, used by the picker in the panel. */
  async listModels() {
    const providers = this.ctx.llm.listProviders()
    const groups = await Promise.all(
      providers.map(async (provider) => {
        const models = await this.ctx.llm.listModels(provider.id).catch(() => [])
        return {
          provider: provider.id,
          name: provider.name || provider.id,
          models: models.map((model) => ({
            id: model.id,
            name: model.name || model.id,
            description: model.description || '',
            inputModalities: Array.isArray(model.inputModalities) ? [...model.inputModalities] : [],
          })),
        }
      }),
    )
    return groups.filter((group) => group.models.length > 0)
  }

  async modelInfo(selection = this.selection()) {
    const key = `${selection.provider}/${selection.model}`
    if (!this.infoCache.has(key)) {
      this.infoCache.set(
        key,
        this.ctx.llm
          .resolveModelInfo(selection.provider, selection.model)
          .catch(() => ({ provider: selection.provider, id: selection.model, unresolved: true })),
      )
    }
    return this.infoCache.get(key)
  }

  /**
   * Effort levels one route advertises, plus the one it defaults to.
   * `known` is false when the adapter could not describe the model at all;
   * then `efforts` is empty because nothing is known, not because the model
   * has no levels.
   */
  async effortOptions(selection = this.selection()) {
    const info = await this.modelInfo(selection).catch(() => undefined)
    const known = Boolean(info) && info.unresolved !== true
    const efforts = Array.isArray(info?.reasoning?.efforts) ? info.reasoning.efforts : []
    return {
      known,
      efforts: efforts.map((item) => ({
        id: String(item.id),
        name: String(item.name || item.id),
        description: String(item.description || ''),
      })),
      defaultEffort: info?.reasoning?.defaultEffort ? String(info.reasoning.defaultEffort) : '',
    }
  }

  async supportsImages() {
    const info = await this.modelInfo()
    return !Array.isArray(info.inputModalities) || info.inputModalities.includes('image')
  }

  async contextChars() {
    const info = await this.modelInfo()
    const contextWindow = info.context?.contextWindow || 128_000
    return Math.max(60_000, Math.min(420_000, Math.floor(contextWindow * 2.3)))
  }

  /** Resolve the effort actually sent for one call. */
  async effortFor(explicit) {
    const selection = this.selection()
    const options = await this.effortOptions(selection)
    return resolveEffort({
      explicit: explicit || selection.reasoningEffort,
      configured: this.config.reasoningEffort,
      modelDefault: options.defaultEffort,
      // Unknown capabilities stay `undefined` so the pick is honoured.
      supported: options.known ? options.efforts.map((item) => item.id) : undefined,
    })
  }

  async runText({
    system,
    messages,
    maxTokens = 8_000,
    signal,
    onDelta,
    allowRetry = true,
    effort,
  }) {
    const selection = this.selection()
    let budget = maxTokens
    let currentEffort = effort || selection.reasoningEffort
    const options = await this.effortOptions(selection)
    // Both the call sites and the user preference go through one resolver, so
    // an effort the model does not advertise is never forwarded.
    currentEffort = resolveEffort({
      explicit: currentEffort,
      configured: this.config.reasoningEffort,
      modelDefault: options.defaultEffort,
      supported: options.known ? options.efforts.map((item) => item.id) : undefined,
    })
    const base = {
      provider: selection.provider,
      model: selection.model,
      system,
      messages,
      maxTokens: budget,
      signal,
    }
    if (currentEffort) base.reasoningEffort = currentEffort
    let attempt = 0
    let truncationRetry = 0
    for (;;) {
      let text = ''
      let finish
      let usage
      let emitted = false
      try {
        for await (const chunk of this.ctx.llm.stream(base)) {
          if (chunk.type === 'text-delta') {
            text += chunk.text
            emitted = true
            onDelta?.(chunk.text)
          } else if (chunk.type === 'usage') {
            usage = chunk.usage
          } else if (chunk.type === 'finish') {
            finish = chunk.reason
          }
        }
      } catch (error) {
        if (signal?.aborted) throw error
        if (!allowRetry || attempt >= 2 || emitted) throw error
        attempt += 1
        await delay(1_200 * attempt)
        continue
      }
      this.lastCall = {
        finish: finish?.kind || 'unknown',
        chars: text.length,
        usage,
        effort: currentEffort,
        maxTokens: budget,
      }
      if (finish?.kind === 'error') {
        const failure = finish.failure
        const error = new Error(
          `AI 调用失败（${failure?.code || 'UNKNOWN'}）：${failure?.message || '未知错误'}`,
        )
        if (!allowRetry || attempt >= 2 || emitted) throw error
        attempt += 1
        await delay(1_200 * attempt)
        continue
      }
      if (finish?.kind === 'aborted') {
        const error = new Error('AI 调用已取消')
        error.name = 'AbortError'
        throw error
      }
      if (finish?.kind === 'max-tokens') {
        if (!onDelta && truncationRetry < 1) {
          truncationRetry += 1
          budget = Math.min(32_000, Math.max(budget * 2, 20_000))
          currentEffort = 'low'
          base.maxTokens = budget
          base.reasoningEffort = currentEffort
          continue
        }
        const error = new Error(
          'AI 输出达到了长度上限而被截断。请重试，或在插件配置里把 reasoningEffort 设为 low/off。',
        )
        error.code = 'OUTPUT_TRUNCATED'
        if (onDelta) {
          return `${sanitizeModelText(text)}\n\n> ⚠️ 回答达到长度上限，内容可能不完整。`
        }
        throw error
      }
      return sanitizeModelText(text)
    }
  }

  /**
   * One strict-JSON call with a single retry. `parse` normalizes the answer or
   * throws a readable error; the error is fed back into the retry prompt so the
   * model can repair its own output instead of repeating the same mistake.
   */
  /**
   * Run one strict-JSON call. A parse/validation failure gets one retry with
   * the failure fed back, because models routinely wrap JSON in prose.
   * `attachments` are message content parts placed before the prompt text.
   */
  async runJson({ system, prompt, maxTokens = 4_000, signal, parse, attachments = [] }) {
    let failure = ''
    let failureCode = ''
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const reminder = failure
        ? `\n\n（上一次输出无法使用：${failure}\n请只输出符合上面要求的 JSON 对象，不要代码围栏、不要多余文字。）`
        : ''
      const raw = await this.runText({
        system,
        messages: [
          {
            role: 'user',
            content: [
              ...attachments,
              { type: 'text', text: `${prompt}${reminder}` },
            ],
          },
        ],
        maxTokens,
        signal,
      })
      try {
        return parse(raw)
      } catch (error) {
        if (signal?.aborted) throw error
        failure = errorMessage(error)
        failureCode = error?.code || ''
      }
    }
    const error = new Error(`AI 返回的内容无法使用：${failure}`)
    if (failureCode) error.code = failureCode
    throw error
  }

  async extractMetadata(meta, fullText, signal) {
    const head = trimText(fullText, 28_000)
    const system =
      '你是严谨的学术文献元数据抽取器。只输出一个 JSON 对象，不要 Markdown 代码围栏，不要解释。'
    const prompt = `请从下面的论文开头与正文中抽取元数据。无法确认的字段用空字符串或空数组，不要编造 DOI 或作者。\n\n文件名：${meta.fileName}\n页数：${meta.pageCount}\n\nJSON 字段：\n{\n  "title": "论文真实标题（不是文件名）",\n  "authors": ["作者"],\n  "year": 2024,\n  "venue": "期刊/会议/arXiv",\n  "doi": "",\n  "abstract": "论文摘要，尽量保留原意，200-500 字",\n  "keywords": ["关键词"],\n  "field": "研究领域",\n  "tags": ["4-8 个中文短标签，便于 Obsidian 检索"]\n}\n\n论文内容：\n${head}`
    const raw = await this.runText({
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      maxTokens: 3_000,
      signal,
    })
    const parsed = parseJsonLoose(raw)
    return normalizeMetadata(parsed, meta.title || meta.fileName.replace(/\.pdf$/i, ''))
  }

  analysisPrompt(meta) {
    return `你是一位严谨、耐心的科研导师，正在精读一篇论文。请为后续答疑生成一份“深度阅读备忘”，而不是泛泛的内容摘要。\n\n输出格式硬性要求：\n- 第一行必须是“# 深度阅读备忘”，不要写任何前言、免责声明或页码约定说明；\n- 紧接着写“## 一句话结论”，用一两句话说清论文解决了什么、结论是什么；\n- 全文使用中文 Markdown，按下面 10 点组织。\n\n文献：${meta.title || meta.fileName}\n作者：${(meta.authors || []).join(', ') || '未知'}\n年份：${meta.year || '未知'}\n\n必须覆盖以下内容：\n1. 一句话结论（它到底解决了什么、结论是什么）\n2. 研究问题、动机与已有工作的缺口\n3. 方法/模型/实验设计的拆解（关键步骤、变量、假设）\n4. 关键公式、符号与它们直觉上的含义（不要只抄公式）\n5. 实验设置、数据集、baseline 与主要结果（数字尽量保留，并标页码）\n6. 作者的核心主张及其证据强度：哪些结论有直接证据，哪些是推断\n7. 局限、失败情形、可能被审稿人质疑的地方\n8. 与相邻工作的关系（仅依据文中内容，不编造引用）\n9. 阅读路线：哪些页/图表最值得看，为什么\n10. 12 个读者最可能问的问题，并给出简短、准确的回答\n\n写作要求：中文，保留英文术语；每个事实尽量用 [p.X] 标注页码；明确区分“论文明确说明”与“你的推断”；不要编造论文没有的实验或数字；总长度约 3000-6000 字。`
  }

  chunkNotesPrompt(meta, from, to) {
    return `你在为论文《${meta.title || meta.fileName}》做分段精读。下面是第 ${from}-${to} 页的内容。请提炼这一部分的事实、论点、方法细节、关键数字、公式和可能的疑问，供最终综合使用。用中文，保留术语与页码标记 [p.X]，不要写客套话，不要编造。约 1200-2200 字。`
  }

  async analyze(meta, pages, onProgress = () => {}, signal) {
    const fullText = pages
      .map((page) => `\n\n=== 第 ${page.n} 页 ===\n${page.text || '（本页没有可提取文字）'}`)
      .join('')
      .trim()
    if (!fullText || fullText.length < 40) {
      throw new Error('没有可用的正文文本，无法自动通读。扫描版请等待 OCR 完成。')
    }
    onProgress('正在识别文献元数据…')
    let metadata
    try {
      metadata = await this.extractMetadata(meta, fullText, signal)
    } catch (error) {
      if (signal?.aborted) throw error
      metadata = normalizeMetadata({}, meta.title || meta.fileName.replace(/\.pdf$/i, ''))
    }
    if (!metadata.title) metadata.title = meta.title || meta.fileName.replace(/\.pdf$/i, '')
    onProgress('正在生成深度阅读备忘…')

    const budget = (await this.contextChars()) - 18_000
    let memo = ''
    if (fullText.length <= budget) {
      memo = await this.runText({
        system:
          '你是一位严谨的科研导师。只依据给定论文内容作答，不编造事实、实验或引用。用中文输出结构清晰的 Markdown。',
        messages: [{ role: 'user', content: [{ type: 'text', text: `${this.analysisPrompt(metadata)}\n\n论文全文：\n${fullText}` }] }],
        maxTokens: 24_000,
        signal,
      })
    } else {
      const groups = []
      let cursor = 0
      let chars = 0
      let group = []
      for (const page of pages) {
        const pageChars = (page.text || '').length + 40
        if (group.length > 0 && chars + pageChars > MAX_ANALYSIS_CHUNK) {
          groups.push(group)
          group = []
          chars = 0
        }
        group.push(page)
        chars += pageChars
      }
      if (group.length > 0) groups.push(group)
      const notes = []
      for (let index = 0; index < groups.length; index += 1) {
        const part = groups[index]
        const from = part[0]?.n || 1
        const to = part[part.length - 1]?.n || from
        onProgress(`正在分段精读 ${index + 1}/${groups.length}（第 ${from}-${to} 页）…`)
        const note = await this.runText({
          system: '你是科研论文分段阅读器。只依据给定片段提炼，不编造。',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `${this.chunkNotesPrompt(metadata, from, to)}\n\n${part
                    .map((page) => `\n\n=== 第 ${page.n} 页 ===\n${page.text || ''}`)
                    .join('')}`,
                },
              ],
            },
          ],
          maxTokens: 5_000,
          signal,
        })
        notes.push(`## 第 ${from}-${to} 页精读摘要\n${note}`)
      }
      onProgress('正在综合全文，形成完整理解…')
      memo = await this.runText({
        system:
          '你是一位严谨的科研导师。请把分段摘要综合成一份完整、连贯、可用来答疑的论文理解备忘。只依据摘要与元数据，不编造。',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `${this.analysisPrompt(metadata)}\n\n以下是分段摘要：\n\n${notes.join('\n\n')}`,
              },
            ],
          },
        ],
        maxTokens: 24_000,
        signal,
      })
    }
    const cleanedMemo = sanitizeModelText(memo)
    return {
      metadata,
      memo: cleanedMemo,
      tldr: extractTldr(cleanedMemo),
    }
  }

  async ocrPageBatch(images, signal) {
    if (!(await this.supportsImages())) {
      throw new Error('当前默认模型不支持图片输入，无法 OCR 扫描版 PDF。请在设置中切换支持视觉的模型。')
    }
    const refs = await this.ctx.attachments.saveImages(
      images.map((image) => ({
        data: image.data,
        mediaType: 'image/jpeg',
        name: `page-${image.n}.jpg`,
      })),
    )
    const pageList = images.map((image) => image.n).join('、')
    const content = [
      {
        type: 'text',
        text: `请对下面 ${images.length} 页扫描文献做逐页 OCR。要求：\n- 按页输出，每页以“=== PAGE 页码 ===”单独一行开始。\n- 忠实保留原文，不要翻译、总结或补写。\n- 保留标题层级、作者、摘要、正文、图表标题、参考文献；公式尽量转成 LaTeX 或可读线性写法。\n- 忽略页眉页脚中的重复页码和期刊信息，但保留章节标题。\n- 如果某页几乎空白，输出空内容也要保留页码标记。\n页码：${pageList}。`,
      },
      ...refs.map((ref) => ({ type: 'image', attachment: ref })),
    ]
    const raw = await this.runText({
      system: '你是学术 PDF 的 OCR 引擎。只做文字识别与版面还原，不解释、不总结、不编造。',
      messages: [{ role: 'user', content }],
      maxTokens: 8_000,
      signal,
    })
    const parts = new Map()
    const marker = /===\s*PAGE\s*(\d+)\s*===/gi
    const matches = [...raw.matchAll(marker)]
    for (let index = 0; index < matches.length; index += 1) {
      const match = matches[index]
      const start = (match.index || 0) + match[0].length
      const end = index + 1 < matches.length ? matches[index + 1].index : raw.length
      parts.set(Number(match[1]), raw.slice(start, end).trim())
    }
    return images.map((image) => ({
      n: image.n,
      text: parts.get(image.n) || '',
    }))
  }

  selectPassages(pages, question, currentPage) {
    const terms = new Set(
      String(question || '')
        .toLowerCase()
        .match(/[a-z][a-z0-9+_-]{2,}|[\u4e00-\u9fff]{2,}/g) || [],
    )
    const scored = pages.map((page) => {
      const text = (page.text || '').toLowerCase()
      let score = 0
      for (const term of terms) {
        if (!term) continue
        let index = text.indexOf(term)
        while (index >= 0) {
          score += term.length >= 4 ? 3 : 1
          index = text.indexOf(term, index + term.length)
        }
      }
      if (page.n === currentPage) score += 8
      if (Math.abs(page.n - currentPage) === 1) score += 3
      return { page, score }
    })
    scored.sort((a, b) => b.score - a.score || a.page.n - b.page.n)
    const chosen = new Map()
    for (const item of scored.slice(0, 11)) {
      if (item.score === 0 && chosen.size >= 5) break
      chosen.set(item.page.n, item.page)
    }
    if (currentPage) {
      const page = pages.find((item) => item.n === currentPage)
      if (page) chosen.set(page.n, page)
    }
    return [...chosen.values()].sort((a, b) => a.n - b.n)
  }

  async saveCrop(crop, page) {
    return this.ctx.attachments.saveImage({
      data: crop,
      mediaType: 'image/jpeg',
      name: `selection-p${page || 0}.jpg`,
    })
  }

  /**
   * Read the selection screenshot before answering, so the reply can follow
   * the user's rule: a single word/phrase gets a short gloss, while a whole
   * sentence/paragraph gets a translation only. Returns undefined when the
   * classifier is unavailable; the answer prompt then uses a hybrid fallback.
   */
  async classifySelection({ meta, pages, currentPage, quote, cropRef, signal }) {
    if (!cropRef) return undefined
    const nearbyText = pages
      .filter((page) => Math.abs(page.n - currentPage) <= 1)
      .map((page) => `=== 第 ${page.n} 页 ===\n${trimText(page.text || '', 2_500)}`)
      .join('\n\n')
    const prompt = `请判断用户在论文 PDF 上框选的内容属于哪一类，并逐字转写截图中的文字。\n\n文献：${meta.title || meta.fileName}\n当前页：第 ${currentPage} 页\n${quote ? `用户选区的文字层内容（可能为空）：${trimText(quote, 600)}\n` : ''}\n${nearbyText ? `当前页附近原文（仅用于确认上下文）：\n${nearbyText}\n` : ''}\n只输出一个 JSON 对象，不要 Markdown 代码围栏，不要解释：\n{"kind":"word|phrase|sentence|paragraph|formula|figure|other","text":"截图中被框选的英文原文，逐字转写；多行用空格连接；没有文字则为空字符串","term":"当 kind 为 word 或 phrase 时，给出干净的英文单词/短语（去掉标点，最多 80 字符）；否则为空字符串"}\n\n判定标准：\n- word：单个英文单词（可含连字符、缩写）。\n- phrase：2-8 个词组成的词组，没有完整句子结构。\n- sentence：一个完整句子（有主谓结构，通常到句号/问号/感叹号结束）。\n- paragraph：两句及以上或明显成段。\n- formula / figure：框选的是公式、图表、表格或示意图，而不是普通正文。\n- other：无法判断。`
    const raw = await this.runText({
      system: '你是学术 PDF 的框选内容识别器。只输出严格 JSON 对象。',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', attachment: cropRef },
            { type: 'text', text: prompt },
          ],
        },
      ],
      maxTokens: 700,
      signal,
    })
    const parsed = parseJsonLoose(raw)
    if (!parsed || typeof parsed !== 'object') return undefined
    const kindMap = {
      word: 'word',
      phrase: 'phrase',
      sentence: 'sentence',
      paragraph: 'paragraph',
      formula: 'formula',
      figure: 'figure',
      other: 'other',
    }
    const kind = kindMap[String(parsed.kind || '').trim().toLowerCase()] || 'other'
    const text = String(parsed.text || '')
      .replace(/\r?\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1_200)
    const term = String(parsed.term || '')
      .replace(/[*_`~]/g, '')
      .replace(/^[\s"'“”‘’([{【<]+/, '')
      .replace(/[\s"'“”‘’)\]}>.,;:!?，。；：！？]+$/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80)
    return { kind, text, term: term || (kind === 'word' || kind === 'phrase' ? text : '') }
  }

  quickModeRules(mode, kind, currentPage, term, hasSelection) {
    if (mode === 'translate') {
      if (kind === 'word' || kind === 'phrase') {
        const label = term || '该词'
        return `用户框选的只是一个${kind === 'word' ? '单词' : '短语'}${term ? `（识别为：“${term}”）` : ''}。请只做两件事：\n1. 第一行严格用“**${label}** — 中文释义”的格式，给出简洁准确的中文意思（可带词性；多个义项用“；”分隔，最多 3 个）。\n2. 从第二行开始，用“语境义：”开头，用一句话说明它在这篇论文当前语境中的具体含义。\n不要展开词源、同义词、搭配、例句或延伸讲解；总长不超过 3 行。`
      }
      if (kind === 'sentence' || kind === 'paragraph') {
        return `用户框选的是一句话或一段话。请结合上下文，只输出这段内容的中文翻译：\n- 忠实、通顺，保持原文语气；专业术语首次出现时可在括号中保留英文原文。\n- 不要加标题、不要解释、不要总结、不要点评、不要补充原文没有的信息。\n- 只输出译文本身，长度与原文相当，不要扩写。`
      }
      if (kind === 'formula' || kind === 'figure') {
        return `框选的是公式或图表。只翻译其中出现的文字与符号说明，保留公式本身；如果几乎没有文字，用一两句话说明它表达的内容。不要展开解释，不要翻译整页。`
      }
      if (!hasSelection) {
        return `请翻译第 ${currentPage} 页最关键的一段正文。只输出这段中文译文，不要解释、总结或点评，不要扩写。`
      }
      return `请先判断框选内容的类型，再严格按类型回答，不要输出多余内容：\n- 若只是一个单词或短语：第一行用“**词** — 中文释义”，第二行用“语境义：”说明它在本文语境中的含义；不要展开词源、例句或同义词。\n- 若是一句话或一段话：只输出结合上下文的中文译文，不要解释、总结或点评。\n- 若是公式或图表：只翻译其中文字，或简要说明它表达什么。\n只输出答案本身，保持最小篇幅。`
    }
    if (mode === 'explain') {
      if (!hasSelection) {
        return `请解释第 ${currentPage} 页的核心内容，以及它在整篇论文中的作用。用一小段或 3-6 条短句，不要复述全文。`
      }
      return `用户点击了“解释”。请解释框选内容：\n- 若是一个词或短语：给出一句话定义，说明它在本文语境中的含义，必要时给一个直观例子；最多 6 行。\n- 若是一句话或一段话：说明它在论文中起什么作用、作者为什么这样写、关键逻辑是什么；用 3-6 条短句或一小段。\n- 不要逐句翻译，不要复述全文，不要输出与解释无关的内容。`
    }
    if (mode === 'term') {
      return `用户要求解释框选内容中的关键术语：先给一句话定义，再说明它在这篇论文中的具体含义，并举一个直观例子。若框选不止一个术语，只挑最重要的 1-3 个，每个 2-4 行。`
    }
    if (mode === 'points') {
      return `用户要求提炼框选内容的要点：用 3-5 条短句，只保留核心事实与结论，必要时标注页码，不要展开成长篇总结。`
    }
    if (mode === 'critique') {
      return `用户要求从审稿人角度质疑框选内容：只列出 3-5 条最关键的质疑（论证是否充分、替代解释、证据缺口），每条一两句话，不要复述原文。`
    }
    return ''
  }

  async answer({
    meta,
    pages,
    analysis,
    history,
    question,
    currentPage,
    quote,
    crop,
    cropRef,
    signal,
    onDelta,
    mode = 'ask',
    selectionKind,
  }) {
    const kind = selectionKind?.kind || ''
    const detectedText = String(selectionKind?.text || quote || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4_000)
    const hasSelection = Boolean(crop || cropRef || quote || kind)
    const quick = mode !== 'ask'
    const content = []
    let ref = cropRef
    if (!ref && crop) ref = await this.saveCrop(crop, currentPage).catch(() => undefined)
    if (ref) content.push({ type: 'image', attachment: ref })
    let system
    let maxTokens
    if (quick) {
      const nearbyText = pages
        .filter((page) => Math.abs(page.n - currentPage) <= 1)
        .map((page) => `\n\n=== 第 ${page.n} 页 ===\n${trimText(page.text || '', 4_500)}`)
        .join('')
      const rules = this.quickModeRules(
        mode,
        kind,
        currentPage,
        selectionKind?.term || '',
        hasSelection,
      )
      const context = [
        `# 文献信息\n${meta.title || meta.fileName}\n作者：${(meta.authors || []).join(', ') || '未知'}\n年份：${meta.year || '未知'}\nVenue：${meta.venue || '未知'}`,
        analysis ? `# 已通读形成的理解备忘（节选）\n${trimText(analysis, 8_000)}` : '',
        nearbyText ? `# 当前页及相邻页原文\n${nearbyText}` : '',
        detectedText ? `# 框选内容的文字识别结果\n${trimText(detectedText, 4_000)}` : '',
        quote && quote !== detectedText ? `# 用户选中的文字\n${trimText(quote, 4_000)}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
      system = `你是用户的中文文献阅读助手，已经通读过这篇论文。\n\n${rules}\n\n硬性要求：\n- 只依据原文与上下文回答，不编造论文没有的内容。\n- 中文表达；必要的英文术语、变量和公式保留原文。\n- 不要输出与本次请求无关的客套话、总结、扩展阅读建议或免责声明。\n\n${context}`
      maxTokens = {
        translate: 3_000,
        explain: 5_000,
        term: 4_000,
        points: 4_000,
        critique: 5_000,
      }[mode] || 4_000
    } else {
      const fullText = pages
        .map((page) => `\n\n=== 第 ${page.n} 页 ===\n${page.text || ''}`)
        .join('')
        .trim()
      const budget = (await this.contextChars()) - 24_000
      let sourceText = ''
      if (fullText.length <= budget) {
        sourceText = fullText
      } else {
        const selected = this.selectPassages(pages, question, currentPage)
        sourceText = selected
          .map((page) => `\n\n=== 第 ${page.n} 页 ===\n${trimText(page.text || '', 5_000)}`)
          .join('')
        sourceText = `（全文较长，以下是与问题最相关的原文片段）${sourceText}`
      }
      const historyText = (history || [])
        .slice(-10)
        .map((message) => `${message.role === 'user' ? '我' : 'AI'}：${trimText(String(message.content || ''), 3_000)}`)
        .join('\n\n')
      const pageText = pages.find((page) => page.n === currentPage)?.text || ''
      const context = [
        `# 文献信息\n${meta.title || meta.fileName}\n作者：${(meta.authors || []).join(', ') || '未知'}\n年份：${meta.year || '未知'}\nVenue：${meta.venue || '未知'}`,
        analysis ? `# 已通读形成的理解备忘\n${trimText(analysis, 30_000)}` : '',
        `# 论文原文\n${sourceText}`,
        pageText ? `# 用户当前所在页（第 ${currentPage} 页）\n${trimText(pageText, 6_000)}` : '',
        quote ? `# 用户选中的文字\n${trimText(quote, 4_000)}` : '',
        historyText ? `# 本次对话历史\n${historyText}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
      system = `你是用户的中文文献阅读助手。你已经通读过这篇论文，现在要帮助用户理解它。\n\n回答原则：\n- 直接回答，先给结论，再给依据；不要复述整篇论文。\n- 依据论文原文时用 [p.X] 标注页码；无法从原文确定时明确说“论文没有直接说明”。\n- 区分“论文的结论”和“你的解释/推断”。\n- 中文回答，保留英文术语、变量名和公式；推导要逐步展开。\n- 如果用户框选了一块内容，优先解释/翻译这一块，并结合上下文说明它在论文中的作用。\n- 用户要求翻译时，逐句忠实翻译，术语给出原文；不要擅自扩写。\n- 用户要求解释名词时，给出一句话定义、在本论文中的具体含义、以及一个直观例子。\n- 回答可以适当使用 Markdown 小标题、列表和表格，但不要过长。\n- 不要编造论文没有的引用、数字或实验。\n\n${context}`
      maxTokens = 12_000
    }
    content.push({
      type: 'text',
      text: `我的问题：${question || '请解释我框选的内容。'}\n\n（当前页：第 ${currentPage || 1} 页${hasSelection ? '；我同时提供了框选内容的截图' : ''}）`,
    })
    return this.runText({
      system,
      messages: [{ role: 'user', content }],
      maxTokens,
      signal,
      onDelta,
    })
  }

  heuristicOutline(pages) {
    const headings = []
    const common =
      /^(abstract|introduction|related work|background|methods?|methodology|approach|experiments?|results?|evaluation|discussion|conclusions?|future work|references|引言|绪论|相关工作|研究背景|方法|实验|结果|讨论|结论|参考文献)(?:\s|$)/i
    const runningHeader =
      /^(?:\d{1,3}\s+)?(?:journal|proceedings|ieee|acm|arxiv|doi|vol\.?|no\.?)\b|doi\s*:/i
    for (const page of pages) {
      const lines = String(page.text || '')
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 80)
      for (const line of lines) {
        if (line.length < 3 || line.length > 90) continue
        if (runningHeader.test(line)) continue
        const numberedMatch = line.match(/^(\d{1,2})(?:\.\d{1,2})?[.)、]?\s+[A-Z\u4e00-\u9fff][^\n]{1,80}$/)
        const numbered = Boolean(numberedMatch) && Number(numberedMatch[1]) <= 20
        const named = common.test(line)
        if (numbered || named) {
          if (headings.length > 0 && headings[headings.length - 1].start === page.n) break
          headings.push({
            title: line.replace(/\s+/g, ' ').slice(0, 80),
            start: page.n,
            end: page.n,
          })
          break
        }
      }
      if (headings.length >= 16) break
    }
    if (headings.length < 2) return []
    for (let index = 0; index < headings.length; index += 1) {
      headings[index].end =
        index + 1 < headings.length ? Math.max(headings[index].start, headings[index + 1].start - 1) : pages.length
    }
    return headings.filter((item) => item.end >= item.start)
  }

  async buildOutline(meta, pages, signal) {
    if (!pages.length) return []
    let snippets = ''
    const headerPattern =
      /^(?:\d{1,3}\s+)?(?:journal|proceedings|ieee|acm|arxiv|doi|vol\.?|no\.?)\b|doi\s*:|^\d{1,3}$/i
    for (const page of pages) {
      const cleaned = String(page.text || '')
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => line && !headerPattern.test(line))
        .join(' ')
      const snippet = trimText(cleaned.replace(/\s+/g, ' '), 300)
      snippets += `[p.${page.n}] ${snippet}\n`
      if (snippets.length > 34_000) break
    }
    const hints = this.heuristicOutline(pages)
    const prompt = `请识别下面这篇论文的章节结构，用于阅读器里的“选择章节→提炼”。\n\n文献：${meta.title || meta.fileName}\n总页数：${pages.length}\n\n要求：\n- 只返回 JSON 数组，不要 Markdown 围栏，不要解释。\n- 每项：{"title":"章节标题","start":起始页,"end":结束页}。\n- 按页码升序，页码从 1 开始，范围必须在 1-${pages.length} 之间。\n- 合并过短的子小节，保留 4-14 个主要章节；标题尽量用论文原文。\n- 绝对不要使用页眉、页脚、期刊名、DOI、卷期号、纯页码或续表行作为章节标题；应使用 Introduction、Method、Experiment、Conclusion 等真正的章节名。\n- 不要编造论文没有的章节。\n\n${hints.length ? `从正文中初步发现的标题候选（仅供参考，请校正）：${hints.map((item) => `${item.title}@p.${item.start}`).join('；')}\n` : ''}\n每页开头片段：\n${snippets}`
    const raw = await this.runText({
      system: '你是学术论文结构识别器。只输出严格 JSON 数组。',
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      maxTokens: 6_000,
      signal,
    })
    const parsed = parseJsonLoose(raw)
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.sections)
        ? parsed.sections
        : Array.isArray(parsed?.chapters)
          ? parsed.chapters
          : []
    const cleaned = []
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const title = String(item.title || item.name || '').trim().slice(0, 90)
      const start = Number.parseInt(String(item.start ?? item.startPage ?? ''), 10)
      const end = Number.parseInt(String(item.end ?? item.endPage ?? start), 10)
      if (!title || !Number.isInteger(start) || !Number.isInteger(end)) continue
      if (/^(?:\d{1,3}\s+)?(?:journal|proceedings|ieee|acm|arxiv|doi|vol\.?|no\.?)\b|doi\s*:/i.test(title)) continue
      if (start < 1 || end < start || start > pages.length) continue
      cleaned.push({ title, start, end: Math.min(end, pages.length) })
    }
    cleaned.sort((a, b) => a.start - b.start || a.end - b.end)
    if (cleaned.length < 2) return this.heuristicOutline(pages)
    return cleaned.slice(0, 20)
  }

  async extractSection({ meta, pages, start, end, title, signal, onDelta }) {
    const from = Math.max(1, Math.min(start, end))
    const to = Math.min(pages.length, Math.max(start, end))
    const sectionPages = pages.filter((page) => page.n >= from && page.n <= to)
    if (!sectionPages.length) throw new Error('所选章节没有可提取的正文')
    const label = title || `第 ${from}-${to} 页`
    const budget = (await this.contextChars()) - 18_000
    const buildPrompt = (content) => `下面是这篇论文的一个章节（用户称为“${label}”，第 ${from}-${to} 页）的原文。请直接提炼下面原文的内容，用于快速阅读和复习。\n\n注意：不要把章节名称当作检索词，也不要因为标题文字没有出现在正文里就认为内容为空；请以给出的原文为准。\n\n输出要求：\n1. 一句话说明这一章/节要解决什么\n2. 结构地图：这一章分成哪几个部分，逻辑如何推进\n3. 核心概念、公式、符号与直觉解释\n4. 关键结论、数字或证据（用 [p.X] 标注页码）\n5. 容易误解或值得质疑的地方\n6. 3-5 个复习问题（只给问题，不给答案）\n\n用中文，保留英文术语；只依据给定内容，不编造；篇幅约 800-1800 字。\n\n章节原文：\n${content}`
    const full = sectionPages
      .map((page) => `\n\n=== 第 ${page.n} 页 ===\n${page.text || ''}`)
      .join('')
      .trim()
    let body
    if (full.length <= budget) {
      body = await this.runText({
        system: '你是科研阅读助手，擅长把章节内容压缩成结构清晰、可复习的要点。',
        messages: [{ role: 'user', content: [{ type: 'text', text: buildPrompt(full) }] }],
        maxTokens: 12_000,
        signal,
        onDelta,
      })
    } else {
      const notes = []
      let chunk = []
      let chars = 0
      const groups = []
      for (const page of sectionPages) {
        const size = (page.text || '').length + 30
        if (chunk.length > 0 && chars + size > 80_000) {
          groups.push(chunk)
          chunk = []
          chars = 0
        }
        chunk.push(page)
        chars += size
      }
      if (chunk.length > 0) groups.push(chunk)
      for (let index = 0; index < groups.length; index += 1) {
        const part = groups[index]
        const note = await this.runText({
          system: '你是科研论文分段提炼器。只依据给定片段，不编造。',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `请提炼第 ${part[0].n}-${part[part.length - 1].n} 页的论点、方法、公式和结论，供最终章节要点综合。约 800-1200 字，带 [p.X]。\n\n${part
                    .map((page) => `\n\n=== 第 ${page.n} 页 ===\n${page.text || ''}`)
                    .join('')}`,
                },
              ],
            },
          ],
          maxTokens: 4_000,
          signal,
        })
        notes.push(`## 第 ${part[0].n}-${part[part.length - 1].n} 页\n${note}`)
      }
      body = await this.runText({
        system: '你是科研阅读助手，擅长把章节内容压缩成结构清晰、可复习的要点。',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: buildPrompt(`（原文较长，以下为分段提炼摘要，请综合成最终版本）\n\n${notes.join('\n\n')}`),
              },
            ],
          },
        ],
        maxTokens: 8_000,
        signal,
        onDelta,
      })
    }
    return sanitizeModelText(body)
  }

  /**
   * Sort the reader's looked-up words into certain-include, certain-exclude and
   * "ask the reader" buckets before the summary is generated. Deciding whether a
   * word is a term needs the paper's context, which string heuristics cannot
   * supply; when it is genuinely unclear the reader decides, not the model.
   */
  async classifyGlossary({ meta, candidates, signal }) {
    const list = (Array.isArray(candidates) ? candidates : [])
      .map((item) => ({
        term: String(item?.term || '').trim(),
        translation: String(item?.translation || '').trim(),
      }))
      .filter((item) => item.term)
    // Nothing to sort: answer without spending a model call.
    if (!list.length) return { include: [], exclude: [], uncertain: [] }
    const fallback = { include: list, exclude: [], uncertain: [] }
    // A handful of words is not worth a dialog: whatever the model cannot place
    // is included, and the reader can trim the summary itself.
    const noDialog = list.length <= 3
    try {
      const parsed = await this.runJson({
        system: '你是文献阅读助手的术语分类器。只输出严格 JSON 对象。',
        prompt: this.glossaryPrompt(meta, list),
        maxTokens: Math.min(4_000, Math.max(800, 400 + list.length * 60)),
        signal,
        parse: (raw) => this.parseGlossaryAnswer(raw, list),
      })
      // A short list has no dialog worth showing: promote the question marks
      // into the include bucket, keeping whatever the model was sure about.
      if (noDialog) return { include: [...parsed.include, ...parsed.uncertain], exclude: parsed.exclude, uncertain: [] }
      return parsed
    } catch (error) {
      if (signal?.aborted) throw error
      // A failed classification must not lose the reader's words: fall back to
      // the pre-classification behaviour and include everything.
      return fallback
    }
  }

  glossaryPrompt(meta, candidates) {
    const list = candidates
      .map((item, index) => `${index + 1}. ${item.term}${item.translation ? `（用户查到的释义：${item.translation}）` : ''}`)
      .join('\n')
    return `用户在读下面这篇文献时查过一批英文词。请判断每个词是不是**这篇文献的专业术语**——即理解本文技术内容是否需要它。

文献：${meta?.title || meta?.fileName || '未命名文献'}
${meta?.venue ? `Venue：${meta.venue}\n` : ''}
待判断的词（共 ${candidates.length} 个）：
${list}

分成三桶：
- include：确定是本文的专业术语 / 核心概念。例如 pre-emphasis、linear equalization、ISI、pre-cursor、post-cursor、cursor、polarity、VOD、DFE、CDR 这类，哪怕是很短的单词。
- exclude：确定是普通英语词，不是本文概念。例如动词短语（travel through、be subject to）、普通副词（primarily、thereby）、常见形容词（specific、adjacent、optimal）、通用基础词（purple、green、waveforms）。
- uncertain：**不确定就放这里**。典型情况：跨领域但非本文重点的词（dielectric、termination、implementation）、本文用到但通用性很强的词（amplitude、interval）、看不出上下文的孤立单词。

判断依据是"是否属于本文的技术概念"，**不是词条长度、不是它来自哪里**：短词可能是核心术语（cursor），长词也可能是普通词（implementation）。
**拿不准就放 uncertain，不要硬猜**——客户端会弹窗让用户自己决定，猜错的代价比多问一次高。

每条 uncertain 还要给一个 guess：true 表示你倾向收录，false 表示倾向排除；用户会用它的初始勾选状态。

只输出一个 JSON 对象，不要代码围栏，不要解释：
{"include":["term1","term2"],"exclude":["term3"],"uncertain":[{"term":"term4","guess":true}]}

要求：每个词必须恰好出现在三桶之一，不要遗漏、不要重复；**只允许出现上面列出的词**，不要新增。`
  }

  /**
   * Read one classification answer. Every candidate ends up in exactly one
   * bucket: unknown or duplicated ids are dropped from the model's answer and
   * anything still unaccounted for is asked about rather than guessed.
   */
  parseGlossaryAnswer(raw, candidates) {
    const parsed = parseJsonLoose(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('返回的不是 JSON 对象')
    }
    const byTerm = new Map(candidates.map((item) => [item.term.toLowerCase(), item]))
    const seen = new Set()
    const include = []
    const exclude = []
    const uncertain = []
    const take = (value, bucket) => {
      const term = String(typeof value === 'string' ? value : value?.term || '').trim()
      if (!term) return
      const key = term.toLowerCase()
      const candidate = byTerm.get(key)
      if (!candidate || seen.has(key)) return
      seen.add(key)
      if (bucket === 'uncertain') {
        const guessValue = typeof value === 'object' && value ? value.guess : undefined
        uncertain.push({ ...candidate, guess: guessValue !== false })
      } else if (bucket === 'exclude') {
        exclude.push({ ...candidate })
      } else {
        include.push({ ...candidate })
      }
    }
    for (const item of Array.isArray(parsed.include) ? parsed.include : []) take(item, 'include')
    for (const item of Array.isArray(parsed.exclude) ? parsed.exclude : []) take(item, 'exclude')
    for (const item of Array.isArray(parsed.uncertain) ? parsed.uncertain : []) take(item, 'uncertain')
    // Never drop a word the reader looked up: anything the model failed to
    // place is surfaced as a question instead of disappearing.
    for (const candidate of candidates) {
      if (seen.has(candidate.term.toLowerCase())) continue
      seen.add(candidate.term.toLowerCase())
      uncertain.push({ ...candidate, guess: true })
    }
    return { include, exclude, uncertain }
  }

  /**
   * Ask the vision model where one figure sits on a page. The returned box is
   * normalized to 0-1000 corners; a box that is out of range is clamped and one
   * thinner than 5% of the page counts as "not found".
   */
  async locateFigure({ meta, pageImage, caption, hint, pageSize, signal }) {
    const page = Number.parseInt(String(pageImage?.page ?? 0), 10)
    if (!pageImage?.data) throw new Error('缺少页面图片，无法定位插图')
    if (!(await this.supportsImages())) {
      throw new Error('当前默认模型不支持图片输入，无法自动定位插图。请在设置中切换支持视觉的模型。')
    }
    const size =
      pageSize && Number.isFinite(Number(pageSize.width)) && Number.isFinite(Number(pageSize.height))
        ? `页面尺寸：${Math.round(Number(pageSize.width))} × ${Math.round(Number(pageSize.height))} 点。\n`
        : ''
    const attachment = await this.ctx.attachments.saveImage({
      data: Buffer.isBuffer(pageImage.data) ? pageImage.data : stripDataUrl(String(pageImage.data)),
      mediaType: pageImage.mediaType || 'image/jpeg',
      name: `figure-p${page || 0}.jpg`,
    })
    const prompt = `这是一篇论文第 ${page || '?'} 页的整页图片。请在页面里找到下面描述的那张图或表，给出它的外接矩形。\n\n文献：${meta.title || meta.fileName}\n${caption ? `图注：${trimText(String(caption), 300)}\n` : ''}${hint ? `提示：${trimText(String(hint), 600)}\n` : ''}${size}\n坐标约定：\n- 使用归一化的 0-1000 整数坐标，左上角为原点：(0,0) 是页面左上，(1000,1000) 是页面右下。\n- bbox 顺序为 [x0, y0, x1, y1]，必须完整包住图或表的可见范围（包括坐标轴、图例与图注本身可以是同一块），不要框选正文段落或整页。\n- 只框一张图；页面上有多张时选与图注/提示最匹配的那一张。\n\n只输出一个 JSON 对象，不要代码围栏，不要解释：\n{"found":true,"bbox":[x0,y0,x1,y1],"label":"图 3","confidence":0.9,"note":"定位依据一句话"}\n找不到时输出：{"found":false,"bbox":null,"label":"","confidence":0.2,"note":"为什么找不到"}`
    return this.runJson({
      system: '你是论文版面的视觉定位器。只输出严格 JSON 对象，坐标用 0-1000 的归一化整数。',
      prompt,
      attachments: [{ type: 'image', attachment }],
      maxTokens: 800,
      signal,
      parse: (raw) => {
        const parsed = parseJsonLoose(raw)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('返回的不是 JSON 对象')
        }
        const label = String(parsed.label || '').trim().slice(0, 160)
        const note = String(parsed.note || '').trim().slice(0, 400)
        const confidenceValue = Number(parsed.confidence)
        const confidence = Number.isFinite(confidenceValue)
          ? Math.min(1, Math.max(0, confidenceValue))
          : 0
        if (parsed.found !== true) return { found: false, bbox: null, label, confidence, note }
        const bbox = normalizeBbox(parsed.bbox)
        if (!bbox) {
          // The model claimed a hit but the box cannot be used: report why, so
          // the reader sees a reason instead of a silent miss.
          return {
            found: false,
            bbox: null,
            label,
            confidence,
            note: `模型给出的框选范围无效（越界或过小）${note ? `：${note}` : ''}`.slice(0, 400),
          }
        }
        return { found: true, bbox, label, confidence, note }
      },
    })
  }

  /**
   * Decide where a user-supplied image belongs. An unknown heading degrades to
   * a question rather than an insert, so the host never fabricates a location.
   */
  async planImagePlacement({ meta, markdown, instruction, image, answer, signal }) {
    const source = String(markdown || '')
    const headings = headingLines(source)
    const headingList = headings.map((item) => item.line).join('\n') || '（正文没有标题行）'
    const budget = Math.max(6_000, (await this.contextChars()) - 16_000)
    const gist = String(instruction || '').trim()
    const reply = String(answer || '').trim()
    const context =
      source.length <= budget
        ? source
        : `${trimText(source, budget)}\n\n（正文过长已截断；以下是全部标题行）\n${headingList}`
    const imageText = image
      ? `用户上传了一张图片${image.name ? `（文件名：${image.name}）` : ''}，请同时参考图片内容判断它适合放在哪一节。\n`
      : ''
    let attachment
    if (image?.data) {
      attachment = await this.ctx.attachments
        .saveImage({
          data: Buffer.isBuffer(image.data) ? image.data : stripDataUrl(String(image.data)),
          mediaType: image.mediaType || 'image/png',
          name: image.name || 'figure-placement.png',
        })
        .catch(() => undefined)
    }
    const prompt = `用户在编辑自己的论文总结，想插入一张图片，请你判断应该插到哪一节。\n\n文献：${meta?.title || meta?.fileName || '未命名文献'}\n${imageText}用户的说明：${gist || '（用户没有说明图片内容，也没有指定位置）'}\n${reply ? `用户对上一轮提问的回答：${trimText(reply, 800)}\n` : ''}\n总结正文：\n<<<NOTE\n${context}\nNOTE>>>\n\n判断规则：\n- 用户明确说了位置（例如“放在 4.2 节后面”“加到结论里”），并且正文里确实有对应标题时，返回 action=insert，并把 heading 逐字写成正文里的那行标题（包括 ## 前缀，例如 "## 4. 实验、数据与结果"）。\n- 用户没说位置、或说明里看不出唯一匹配的章节时，返回 action=ask，向用户提一个具体问题，并在 suggestion 里给出你的猜测，例如“看起来和 4.2 节的结果有关”。\n- 无法判断时不要硬猜：宁可问一次，也不要随便插到某一节。\n- caption 用中文一句话概括图片内容，优先用用户说明里的描述；不要编造图片里不存在的细节。\n\n只输出一个 JSON 对象，不要代码围栏，不要解释：\n插入：{"action":"insert","heading":"## 4.2 主要结果","afterOffset":null,"caption":"图注","reason":"为什么放这里"}\n提问：{"action":"ask","question":"这张图应该放在哪一节？","suggestion":"看起来和 4.2 节的结果有关"}\n通常只给 heading，afterOffset 一律留 null；只有在你确实知道正文里的字符位置时才填 afterOffset（两者都给时以 afterOffset 为准）。`
    const content = []
    if (attachment) content.push({ type: 'image', attachment })
    let parsed
    try {
      parsed = await this.runJson({
        system: '你是文献总结的图文编辑助手。只输出严格 JSON 对象。',
        prompt,
        attachments: content,
        maxTokens: 900,
        signal,
        parse: (raw) => {
          const value = parseJsonLoose(raw)
          if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error('返回的不是 JSON 对象')
          }
          return value
        },
      })
    } catch (error) {
      if (signal?.aborted) throw error
      // The model could not answer in JSON even after one retry: ask the user
      // instead of guessing a section.
      parsed = undefined
    }
    return this.resolvePlacement(parsed, source, gist)
  }

  /** Turn one planImagePlacement answer into an insert or a question. */
  resolvePlacement(parsed, markdown, instruction) {
    const source = String(markdown || '')
    const value = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined
    const ask = (question, suggestion) => ({ action: 'ask', question, suggestion })
    if (!value) {
      return ask(
        '这张图你希望放在哪一节？',
        instruction ? `我看到你的说明是「${trimText(instruction, 120)}」，但没能确定对应章节。` : '',
      )
    }
    const action = String(value.action || '').trim().toLowerCase()
    if (action !== 'insert') {
      const question = String(value.question || '').trim()
      return ask(
        (question || '这张图你希望放在哪一节？').slice(0, 300),
        String(value.suggestion || '').trim().slice(0, 300),
      )
    }
    const caption = cleanCaption(value.caption, cleanCaption(instruction))
    const reason = String(value.reason || '').trim().slice(0, 400)
    const heading = matchHeading(source, value.heading)
    // An explicit offset wins, but only when it is a real position in this note.
    const hasOffset = value.afterOffset !== null && value.afterOffset !== undefined && value.afterOffset !== ''
    const offset = hasOffset ? Number(value.afterOffset) : Number.NaN
    if (Number.isInteger(offset) && offset >= 0 && offset <= source.length) {
      return {
        action: 'insert',
        heading: heading ? heading.line : '',
        afterOffset: snapToLineStart(source, offset),
        caption,
        reason,
      }
    }
    if (heading) {
      return {
        action: 'insert',
        heading: heading.line,
        afterOffset: sectionEndOffset(source, heading),
        caption,
        reason,
      }
    }
    const named = String(value.heading || '').trim()
    return ask(
      named ? `正文里没有找到「${named.replace(/^#+\s*/, '')}」这一节，这张图应该放在哪一节？` : '这张图你希望放在哪一节？',
      String(value.suggestion || reason || '').trim().slice(0, 300) ||
        '可以告诉我章节名，例如「4.2 主要结果」。',
    )
  }

  parseReviseAnswer(raw, ids) {
    const parsed = parseJsonLoose(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('返回的不是 JSON 对象')
    }
    const known = new Set(ids)
    const seen = new Set()
    const edits = []
    const unresolved = []
    const editList = Array.isArray(parsed.edits) ? parsed.edits : []
    for (const item of editList) {
      if (!item || typeof item !== 'object') continue
      const id = String(item.id || '').trim()
      if (!known.has(id) || seen.has(id)) continue
      seen.add(id)
      edits.push({
        id,
        replacement: String(item.replacement ?? '').slice(0, 60_000),
        why: String(item.why || '').trim().slice(0, 400),
      })
    }
    const unresolvedList = Array.isArray(parsed.unresolved) ? parsed.unresolved : []
    for (const item of unresolvedList) {
      if (!item || typeof item !== 'object') continue
      const id = String(item.id || '').trim()
      if (!known.has(id) || seen.has(id)) continue
      seen.add(id)
      unresolved.push({
        id,
        reason: String(item.reason || '').trim().slice(0, 400) || '无法按要求修改',
      })
    }
    const missing = ids.filter((id) => !seen.has(id))
    if (missing.length) {
      throw new Error(`没有给出这些标注的处理结果：${missing.join('、')}（每条标注都要出现在 edits 或 unresolved 中）`)
    }
    return {
      reply: String(parsed.reply || '').trim().slice(0, 600),
      edits,
      unresolved,
    }
  }

  revisePrompt(meta, excerpt, annotations, instruction) {
    const items = annotations
      .map((item, index) => {
        const parts = [`标注 ${index + 1}：id=${item.id}`]
        if (item.quote) parts.push(`被标注的原文：${trimText(item.quote, 2_000)}`)
        if (item.prefix) parts.push(`前文：…${trimText(item.prefix, 200)}`)
        if (item.suffix) parts.push(`后文：${trimText(item.suffix, 200)}…`)
        parts.push(`用户标注：${item.note || '（只做了标记，没有写具体内容，按你的判断优化这一段）'}`)
        return parts.join('\n')
      })
      .join('\n\n')
    return `你是用户的文献总结编辑。用户读自己这篇论文的总结时做了若干标注，现在请你只按这些标注修改总结的对应片段。\n\n文献：${meta.title || meta.fileName}\n\n标注列表（共 ${annotations.length} 条）：\n${items || '（没有标注，只按下面的补充要求修改）'}\n\n${instruction ? `补充要求：${trimText(instruction, 1_500)}\n\n` : ''}当前总结正文（已按标注位置节选；节选之外的内容不得改动，也无法被替换）：\n<<<NOTE\n${excerpt}\nNOTE>>>\n\n输出要求：\n- 只输出一个 JSON 对象，不要 Markdown 代码围栏，不要解释。\n- 结构：{"reply":"一句话说明这次改了什么","edits":[{"id":"标注 id","replacement":"用来替换被标注片段的 Markdown","why":"处理说明"}],"unresolved":[{"id":"标注 id","reason":"为什么无法处理"}]}\n- 每条标注必须出现在 edits 或 unresolved 之一，不能遗漏，也不能编造新的 id。\n- replacement 只替换“被标注的那一段原文”，不是整篇总结：保持 Markdown 结构（标题、列表、表格、引用块）与上下文衔接，不要在开头或结尾重复上下文。\n- 只改被标注的片段，未标注的内容一律保持原样；replacement 为空字符串表示删除该片段。\n- 标注要求补图时，可以在 replacement 里单独一行插入 [[FIGURE: p.7 | 图注 | 为什么需要]]（页码必须是论文真实页码），不要编造图片路径。\n- 标注与正文对不上、或要求无法用文字改动完成（例如要求插入一张论文里不存在的图）时，放进 unresolved 并写清原因，不要硬改。\n- 用中文写作，保留英文术语；不要引入论文没有的事实或数字。`
  }

  async reviseNote({ meta, markdown, annotations, instruction, signal }) {
    const list = (Array.isArray(annotations) ? annotations : [])
      .map((item) => ({
        id: String(item?.id || '').trim(),
        quote: String(item?.quote || ''),
        note: String(item?.note || '').trim(),
        prefix: String(item?.prefix || ''),
        suffix: String(item?.suffix || ''),
      }))
      .filter((item) => item.id)
    const extra = String(instruction || '').trim()
    if (!list.length && !extra) throw new Error('没有需要应用的标注或补充要求')
    const source = String(markdown || '')
    const budget = Math.max(8_000, (await this.contextChars()) - 18_000)
    const excerpt = excerptAroundAnnotations(source, list, budget)
    const ids = list.map((item) => item.id)
    return this.runJson({
      system: '你是严谨的中文文献总结编辑，只按用户标注做最小必要修改，并且只输出严格 JSON 对象。',
      prompt: this.revisePrompt(meta, excerpt, list, extra),
      maxTokens: Math.min(16_000, Math.max(4_000, 2_000 + list.length * 900)),
      signal,
      parse: (raw) => this.parseReviseAnswer(raw, ids),
    })
  }

  /**
   * Prompt for the study-note template in docs/summary-editor-spec.md §3.1.
   * The skeleton is spelled out verbatim so the renderer can rely on it.
   */
  summarizePrompt(meta, maxFigures) {
    const figureLimit = normalizeFigureLimit(maxFigures)
    const figureRules =
      figureLimit > 0
        ? `- 图片占位符：优先放在"## 核心方法 / 技术点"这一块——电路结构图、系统框图、算法流程图在这里最有价值。如果文中确实有对理解很有帮助的图或表，就在正文里合适的位置单独一行写\n  [[FIGURE: p.7 | 图 3 整体架构 | 为什么这张图对理解有帮助]]\n  - 页码写成 p.N，N 必须是这篇论文真实存在的页码；图注 ≤200 字符（可以留空），提示 ≤400 字符，用来说明在这一页找哪张图。\n  - 全篇最多 ${figureLimit} 条；不确定图在第几页时宁可不插；禁止描述论文里不存在的图或表。\n  - 占位符必须独占一行，前后各空一行；除这一行外不要用任何其他方式提图。\n  - 没有合适的图就不插；不要为了放图而生造小节，也不要打断正文的连贯叙述。`
        : '- 本次不需要插图：不要输出任何 [[FIGURE: ...]] 占位符。'
    return `请基于论文原文、深度阅读备忘和用户问答记录，写一份用来快速回顾这篇文献的中文总结。\n\n文献：${meta.title || meta.fileName}\n作者：${(meta.authors || []).join(', ') || '未知'}\n年份：${meta.year || '未知'}\nVenue：${meta.venue || '未知'}\n\n这是一份"速览卡"，定位是文献总结：读者一个月后打开它，希望几分钟内想起这篇文献讲了什么、技术内核是什么、结论是什么、能不能信。所以只保留回顾需要的东西，写得简洁明了，不要拆成很多条目和板块。\n\n必须严格按下面的骨架输出（标题文字照抄，只把 … 换成内容；## 论文未解决的问题、## 已弄懂的知识点、## 名词解释 这三节在没有内容时可以连标题一起省略，其余三块必须写，尤其 ## 核心方法 / 技术点 不可省略）：\n\n${SUMMARY_SKELETON}\n${SUMMARY_SECTION_GUIDE}\n\n${SUMMARY_RULES}\n${figureRules}`
  }

  async summarize({
    meta,
    pages,
    analysis,
    history,
    signal,
    onDelta,
    maxFigures = DEFAULT_SUMMARY_FIGURES,
    glossary = [],
  }) {
    const fullText = pages
      .map((page) => `\n\n=== 第 ${page.n} 页 ===\n${page.text || ''}`)
      .join('')
      .trim()
    const budget = (await this.contextChars()) - 30_000
    // Translations and other look-ups are chat history, not study material: they
    // would otherwise be quoted back into the summary as "what I learned".
    const qa = filterStudyHistory(history)
      .map((message) => `${message.role === 'user' ? '我的提问' : 'AI 回答'}：${trimText(String(message.content || ''), 2_000)}`)
      .join('\n\n')
    const glossaryText = formatGlossaryForPrompt(glossary)
    const prompt = `${this.summarizePrompt(meta, maxFigures)}\n\n${analysis ? `深度阅读备忘：\n${trimText(analysis, 24_000)}\n\n` : ''}${qa ? `用户问答记录（仅用于补充理解与提炼"我的提问"，不要复述）：\n${trimText(qa, 20_000)}\n\n` : ''}${glossaryText}\n${fullText.length <= budget ? `论文原文：\n${fullText}` : '（原文过长，已由深度阅读备忘覆盖；不要虚构未出现的细节。）'}`
    const raw = await this.runText({
      system:
        '你是一位帮人快速回顾文献的科研助手。输出中文 Markdown，简洁、直白、言之有据，不编造，不注水。',
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      // Generous enough for the longest legitimate summary (the technical block
      // scales with the paper), tight enough to stop a slide back into a study
      // note. The prompt itself carries the length guidance.
      maxTokens: 12_000,
      signal,
    })
    let body = sanitizeModelText(raw)
    const tagLine = body.match(/^\s*TAGS\s*[:：]\s*(.+)$/im)
    let tags = tagLine ? normalizeTags(tagLine[1]) : []
    if (tagLine) body = body.replace(tagLine[0], '').replace(/^\s*\n/, '')
    if (!tags.length) tags = meta.tags || []
    if (!tags.length) tags = ['文献阅读']
    body = body.replace(/^```(?:markdown|md)?\s*\n/i, '').replace(/\n```\s*$/i, '')
    body = body.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '')
    return { body: body.trim(), tags: tags.slice(0, 9) }
  }
}
