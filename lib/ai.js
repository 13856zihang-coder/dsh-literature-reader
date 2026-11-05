import { delay, parseJsonLoose } from './util.js'
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
        notes.push(`## 第 ${from}-${to} 页精读笔记\n${note}`)
      }
      onProgress('正在综合全文，形成完整理解…')
      memo = await this.runText({
        system:
          '你是一位严谨的科研导师。请把分段笔记综合成一份完整、连贯、可用来答疑的论文理解备忘。只依据笔记与元数据，不编造。',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `${this.analysisPrompt(metadata)}\n\n以下是分段笔记：\n\n${notes.join('\n\n')}`,
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
                text: buildPrompt(`（原文较长，以下为分段提炼笔记，请综合成最终版本）\n\n${notes.join('\n\n')}`),
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

  async summarize({ meta, pages, analysis, history, signal, onDelta }) {
    const fullText = pages
      .map((page) => `\n\n=== 第 ${page.n} 页 ===\n${page.text || ''}`)
      .join('')
      .trim()
    const budget = (await this.contextChars()) - 30_000
    const qa = (history || [])
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => `${message.role === 'user' ? '我的提问' : 'AI 回答'}：${trimText(String(message.content || ''), 4_500)}`)
      .join('\n\n')
    const prompt = `请基于论文原文、深度阅读备忘和用户问答记录，写一份用于复习和知识整理的中文学习总结报告。\n\n文献：${meta.title || meta.fileName}\n作者：${(meta.authors || []).join(', ') || '未知'}\n年份：${meta.year || '未知'}\nVenue：${meta.venue || '未知'}\n\n报告必须包含以下部分，并按这个顺序组织：\n1. 文献档案（标题、作者、年份、来源；如果信息缺失就写“未确认”）\n2. 一句话总结\n3. 研究背景与要解决的问题\n4. 方法与技术路线（关键公式、变量和直觉解释）\n5. 实验、数据与主要结论（保留关键数字，尽量带页码）\n6. 论证强度、局限与可质疑之处\n7. 我的提问与知识收获：把问答记录按主题归纳，说明通过提问解决了什么困惑、形成了哪些理解；不要逐条流水账\n8. 可迁移的方法与概念（对以后研究/学习有什么用）\n9. 仍待探索的问题\n10. 标签建议\n\n写作要求：\n- 直接输出 Markdown 正文，不要输出 YAML frontmatter，不要用代码围栏包住全文。\n- 第一行必须是“TAGS: 标签1, 标签2, ...”这样的单行标记，给出 4-9 个适合 Obsidian 检索的短标签（中英混合可以）。\n- 长度根据文献内容与问答收获决定，通常 1500-3000 字；材料少时不要硬凑。\n- 事实尽量标 [p.X]；明确区分论文结论与你的整理/推断。\n- 第 7 部分必须真正吸收用户的提问，而不是只写“用户问了……”。\n- 不要编造论文没有的实验、数字、引用。\n\n${analysis ? `深度阅读备忘：\n${trimText(analysis, 24_000)}\n\n` : ''}${qa ? `用户问答记录：\n${trimText(qa, 30_000)}\n\n` : ''}${fullText.length <= budget ? `论文原文：\n${fullText}` : '（原文过长，已由深度阅读备忘覆盖；不要虚构未出现的细节。）'}`
    const raw = await this.runText({
      system:
        '你是一位善于把论文转化为可复习知识的科研导师。输出中文 Markdown，结构清楚、言之有据、不编造。',
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      maxTokens: 20_000,
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
