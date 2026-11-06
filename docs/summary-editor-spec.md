# 阅读总结：标注修订 · 自动/手动插图 · Markdown 编辑 — 实现规格

> 本文是本次改动的唯一契约。所有实现以本文为准；如需偏离，先通知 Lead（captain），由 Lead 更新本文后再继续。
> 代码风格沿用仓库现状：ESM、单引号、无分号、2 空格缩进、代码注释用英文、界面文案中英双语（client.js 内的 `zh` / `en` 对象）。
> 不新增 npm 依赖，不引入构建步骤。

> ## ⚠️ v2 定位变更（2026-11-06，最新，优先于下文任何旧描述）
>
> **「学习总结」与「学习笔记」是两件事，本项目只做前者。**
>
> 用户反馈：AI 直接生成学习笔记效果一般；要的是**快速回顾文献**用的速览总结，不是可以反复研读的笔记。
>
> - 总结**不再**写成学习笔记形态：不再有术语表、闪卡、自测题、逐节复述
> - 结构要**简洁明了**，板块数量大幅减少，能一眼看完
> - 目标是「一个月后回来看，这篇讲了什么、结论是什么、能不能信」
> - **不是**「又一次把文献读一遍」——禁止逐节逐子节复述论文行文顺序
> - 篇幅随文献而定，通常 **600–1200 字**；短文 300–500 字也正常
>
> 界面措辞同步改为「总结 / 速览」，不再叫「学习笔记」。

## 0. 目标（P0）

1. **可标注的总结**：生成总结后，用户可以打开它，用鼠标选中任意一段文字，在旁边写下标注；可以连续标注多处；**不会自动修改**，只有点击总结最下方的「应用修改」按钮，AI 才根据全部标注修订总结。
2. **AI 按标注修订**：逐条处理标注，只替换被标注的片段，未标注内容保持原样；对无法处理的标注给出原因；修订结果写回本地 `summary.md` 与 Obsidian 笔记。
3. **合适的图片**：生成总结时，AI 在合适位置插入图片占位符，插件自动从文献 PDF 中截取对应图片；用户也可以自己提供图片（本地上传或从 PDF 页面框选），并告诉 AI 放在哪里——**如果用户没说位置，AI 必须主动提问**，确认后再插入。
4. **手动编辑**：总结支持像编辑 Markdown 文档一样直接改源码并保存（本地 + Obsidian），带冲突检测、历史版本与恢复。
5. **简洁速览**：总结是**快速回顾用**的速览文档，不是学习笔记。结构见 §3.1。

### 0.1 总结内容原则（v2，优先级高于任何具体格式）

- **目的单一**：帮读者快速想起这篇文献。不是教学材料，不是复习题库。
- **技术内核最重要**：必须写清这篇文献真正的技术点（核心方法 / 电路结构 / 算法流程）。这是回顾时最有价值的信息，不可省略。
- **板块少**：通常 4–5 个板块，最多不超过 5 个。
- **不逐节复述**：不要按论文行文顺序一节一节讲。抓主干、抓技术内核、抓结论、抓可信度。
- **不重复**：同一个概念只解释一次，不要既在正文解释又列表格再列附录。
- **不混入翻译**：单词/短语的翻译记录不得进入总结（见 §8.1 `filterStudyHistory`）。
- **篇幅**：通常 600–1200 字；短文献 300–500 字可以；长文献上限 1800 字。
- **可读性优先**：连续文字优于分点罗列，读者应当能一口气读完。

P1（有余力再做，不阻塞验收）：工具栏「按模板重组」、自动补图重跑、撤销上次修订。

非目标：不改 DSH 其他插件；不写学习工作台数据库；不改动 profile 配置；不引入第三方 Markdown/编辑库；不重启 DSH。

## 1. 环境与硬约束

- Host 端：Node ESM，现有 `index.js` + `lib/*.js`。不要新增依赖。
- Client 端：`client.js` 是单文件浏览器模块，`window.__ModuleLoader__.load({ id, factory(require) { ... } })`，只能 `require('react')`，**不能 import 本地文件、不能 JSX**，用 `h(...)`。也没有构建步骤。
- Client 里的 Markdown 核心（§4）必须与 `lib/markdown-core.js` 中 `#region markdown-core` 区域**逐字一致**（QA 有同步测试）。为此该区域只能包含不依赖 Node/浏览器 API 的纯函数，且不能含 `export`/`import`；导出语句写在 region 之外。
- 现有功能不得回归：问答、框选翻译、单词归档、文献库、画笔、历史总结打开。
- 测试与调试**禁止**写入 `D:\note`、`D:\DSH-Literature`；一律使用临时目录（`os.tmpdir()`）。
- 禁止 git commit/push；禁止修改 `$DSH_PROFILE_DIR`（`C:\Users\黄梓航\.dsh\profiles\desktop`）与 `cordis.patch.yml`（配置项与 README 由 Lead 最后统一处理）。

## 2. 数据文件与约定

### 2.1 文件布局

```
<dataDir>/papers/<id>/summary.md                      // 正文（无 frontmatter），本地权威副本
<dataDir>/papers/<id>/summary-annotations.json        // 当前标注
<dataDir>/papers/<id>/summary-history/<stamp>.md      // 历史快照，最多保留 30 份
<dataDir>/papers/<id>/figures/<name>.png              // 图片本地副本（预览用）
<vault>/<notesFolder>/_附件/<paperId>/<name>.png       // 图片在 Obsidian 中的位置
```

- 图片名只用 ASCII：自动截图 `fig-p<两位页号>-<两位序号>.png`（如 `fig-p07-01.png`），用户上传 `img-<yyyymmdd>-<hhmmss>-<4位随机>.png`。
- 正文中图片写法：`![图注](_附件/<paperId>/<name>.png)`（相对笔记所在目录；实际用 `%20` 编码空格即可，卡片名本身无空格），下一行可跟 `*图注 · p.7*` 斜体说明。
- 本地预览需要把相对图片地址改写为 `GET /literature-reader/api/papers/<id>/figure/<name>`；host 用文件名白名单校验，禁止路径穿越。
- 历史快照 stamp：`YYYYMMDD-HHmmss-SSS`，同秒冲突时追加 `-2`、`-3`。

### 2.2 `summary-annotations.json`

```json
{
  "version": 1,
  "updatedAt": "2026-11-05T06:20:00.000Z",
  "annotations": [
    {
      "id": "uuid",
      "quote": "被选中的原文（纯文本，可能来自渲染后的文本）",
      "prefix": "选区前最多 48 个字符",
      "suffix": "选区后最多 48 个字符",
      "start": 1234,
      "end": 1250,
      "note": "用户的标注内容",
      "color": "amber",
      "status": "open",
      "createdAt": "iso",
      "resolvedAt": "",
      "revision": 0,
      "reply": ""
    }
  ]
}
```

- `status`: `open` | `resolved` | `orphan`（重新定位失败）。
- `color`: `amber` | `rose` | `sky` | `mint`，默认 `amber`。
- `start`/`end` 是**源 markdown 偏移**；`quote` 是从**渲染纯文本**中选出的文字。host 必须重新定位（§7.2），不能盲信偏移。
- 上限：单篇 200 条标注；`note` ≤ 2000 字符；`quote` ≤ 2000 字符。

### 2.3 `meta.json` 新增字段（可选，缺失时按默认处理）

- `summaryUpdatedAt`: ISO；`summaryVersion`: 正文 sha256 前 16 位；`summaryFigureCount`: 数字。
- 只做 best-effort 回写，不影响读取。

## 3. 总结模板与图片占位符

### 3.1 总结模板（`ai.summarize` 必须产出的结构，v2 速览型）

目标：**快速回顾**。读者隔一段时间打开，扫一眼就想起来这篇讲了什么、**核心技术点是什么**、结论能不能信。

```
# <标题>

> [!abstract] 速览
> **一句话**：这篇文献做了什么、核心结论是什么
> **为什么值得读 / 我的判断**：证据够不够、值不值得深入

## 这篇文献讲了什么
（2-4 段连贯文字，不要小标题、不要分点罗列。让人一口气读完就明白全貌）

## 核心方法 / 技术点
（这篇文献真正的技术内核：它是怎么做到的、关键在哪）

## 关键结论
（3-5 条最重要的结论，带页码或数字。这是回顾时最需要抓住的东西）

## 论文未解决的问题
（作者视角的未完成事项；无则整节省略）

## 已弄懂的知识点
（用户通过与 AI 问答已彻底搞懂的内容，写成陈述句知识点；无则整节省略）

## 名词解释
（唯一允许的表格，位于文末）
```

**不再有「需要注意」板块**：局限与前提判断不再单独立节，而是自然融入「这篇文献讲了什么」「核心方法 / 技术点」「关键结论」的叙述中；速览里的「我的判断」继续承载整体评价。

**「已弄懂的知识点」不是问题列表**：每条必须是**陈述句**知识点，取材于用户问过且已得到实质解答的内容。反例：`pre-emphasis 为什么等价于 FIR？`；正例：`pre-emphasis 等价于多抽头 FIR：每个抽头对应符号前后不同位置的影响，加权相加即可抵消对应位置的 ISI。` 不要写「用户问了……」这类元叙述。2-6 条，无则省略。

**「核心方法 / 技术点」是最重要的一节，必写，不得省略。**
写不出「它是怎么做到的」，说明还没读懂——不许省略，不许用空话敷衍。

按文献类型自适应：

- **电路 / 器件类**：核心电路结构是什么？由哪些模块/元件构成？信号怎么走？关键设计参数各起什么作用。**优先配结构示意图**（占位符放在这一节）。
- **算法 / 方法类**：核心算法或流程、关键步骤、关键公式，与朴素做法的**本质区别**。
- **实验 / 测量类**：测量方法、装置或流程的关键设计，以及**为什么能测准**。
- **综述类**：分类框架、按什么维度切分、各类方法的取舍。
- **理论类**：核心假设与推导思路、关键那一步怎么来的。
- **讲解型 / 应用笔记 / 教程**：这类文献没有新方法与实验对比，价值在于**把某个原理或器件特性讲清楚**。核心要点就是它想讲明白的那几件事：这个功能怎么工作、有哪几个可配置项及各自作用、什么情况下效果好或变差。**不要硬套「方法/实验/结论」的语气**，要还原它「教会读者什么」。

### 单一要点 vs 多个要点（重要）

- **只有一个技术内核** → 连贯成文，3-6 句或 2-3 小段。**不要**退化成项目符号清单。
- **有 2 个及以上并列的核心要点** → 在 `## 核心方法 / 技术点` **内部用 `###` 无编号小标题分块**，每块讲清一个要点，块数 2-4 个为宜（超过 4 个说明切太碎）。

示例（多要点时）：

```markdown
## 核心方法 / 技术点

（可选：一两句总述）

### 发射端 pre-emphasis 抽头结构

…

### 接收端均衡器的 16 个模式

…

### 过强调 / 过均衡的边界

…
```

注意区分：这里允许的 `###` 是**技术点分块**；仍然禁止 `## 1.` 这类论文式编号大节与逐节复述。
约束：「讲了什么」给全貌，技术细节留给这一块，两块不要互相复述。

硬性要求：

- **板块数 4–5 个**（速览 + 讲了什么 + 核心方法 + 关键结论 + 可选注意事项）。不得再出现 10 个大节、22 个子节那种结构。
- **禁止**出现「术语表」「闪卡」「自测」「复习题」「可迁移概念」「我的理解」这类学习笔记专属板块。
- **禁止**按论文行文顺序逐节复述（不要「1.1 研究背景 → 1.2 Gap → 1.3 问题」这种）。
- **禁止**把同一个概念解释多遍（不要同时出现概念表 + 闪卡 + 术语表）。
- **禁止**把单词翻译记录写进来。
- 篇幅通常 **600–1200 字**；短文 300–500 字正常；长文献上限 **1800 字**。
- 事实标 `[p.X]`；关键数字保留；区分「论文结论」与「我的推断」；不编造。
- 第一行仍是 `TAGS: a, b, c`（4-9 个），生成后由 host 剥离写入 frontmatter。

### 3.2 图片占位符

- 语法（独占一行）：`[[FIGURE: p.7 | 图 3 整体架构 | 为什么这里的图对理解有帮助]]`
- 字段：页码（可写 `p.7`、`P7`、`7`）、图注（≤200 字符，可为空）、提示（≤400 字符，供视觉模型定位）。
- 生成时由提示词要求：只在确实有图/表、且对理解有价值处插入；每篇最多 `maxSummaryFigures`（默认 5，可配）；没有合适的图就不插。
- **位置**：放在正文中真正相关的位置即可，不强制绑定某个小节编号（旧版写死「2、3、4 节」，v2 废除）。
- 处理成功：整行替换为两行

  ```
  ![图 3 整体架构](_附件/<paperId>/fig-p07-01.png)
  *图 3 整体架构 · p.7*
  ```

- 处理失败：替换为

  ```
  > [!figure] 图未自动截取：图 3 整体架构（p.7）
  > 可在编辑模式下自行插入图片。
  ```

### 3.3 Client 渲染器需支持的 Markdown 子集

标题 h1-h4、段落、无序/有序列表（单层）、表格、引用块、Obsidian callout（`> [!abstract] 标题`）、水平线、围栏代码块、图片（块级）、行内 **粗体** / *斜体* / `代码` / `[文字](链接)` / `[p.3]` 页码引用（可点击跳页）。不支持 HTML。

## 4. `lib/markdown-core.js`（纯函数，client 共享）

文件结构必须是：

```js
// #region markdown-core
function parseMarkdown(source) { ... }
function plainProjection(blocks) { ... }
function locateQuote(projection, selection) { ... }
function mapPlainToSource(projection, plainStart, plainEnd) { ... }
function applyReplacements(source, replacements) { ... }
function findFigurePlaceholders(source) { ... }
// #endregion markdown-core

export { parseMarkdown, plainProjection, locateQuote, mapPlainToSource, applyReplacements, findFigurePlaceholders }
```

`client.js` 中把 region 内容原样粘贴到 factory 内部（同样注释包裹），region 内不得出现 `export`、`import`、Node API、DOM API。

### 4.1 `parseMarkdown(source) -> { blocks }`

`blocks` 元素（`start`/`end` 为源偏移，`plainStart`/`plainEnd` 为纯文本偏移）：

- `{ type:'heading', level:1..4, inline:[...], start, end }`
- `{ type:'paragraph', inline:[...], start, end }`
- `{ type:'list', ordered:boolean, items:[{ inline:[...] }], start, end }`（单层；嵌套列表按普通文本处理）
- `{ type:'code', lang, text, start, end }`
- `{ type:'table', header:[ cell[] ], rows:[ cell[] ], start, end }`；`cell` 为 `inline[]`
- `{ type:'quote', blocks:[...], callout:{ title, kind }|null, start, end }`
- `{ type:'hr', start, end }`
- `{ type:'image', src, alt, start, end }`

`inline` 元素：`{ type:'text'|'strong'|'em'|'code'|'link'|'cite', text, srcStart, srcEnd, href? }`。
`text` 是渲染文字（不含 markdown 标记）；`srcStart`/`srcEnd` 指向源中该段的起止（不含标记符）。`cite` 的 text 保留 `[p.3]` 原文。
解析要求：容忍空行、缩进、未闭合强调；CRLF 统一；任何输入不得抛错。

### 4.2 `plainProjection(blocks) -> { text, map }`

- `text`：块之间用 `\n` 连接后的纯文本；列表项各占一行；表格单元格用 `\t` 连接、行间 `\n`；代码块整段。
- `map[i]`：`text` 第 i 个字符对应的源偏移，**单调不减**；`map.length === text.length`。
- 块对象在 projection 中可回填 `plainStart`/`plainEnd`（可直接修改并返回相同 blocks 引用；文档注明）。

### 4.3 `locateQuote(projection, { quote, prefix, suffix, start, end })`

- 先在 `projection.text` 中查找 `quote` 的全部出现位置（允许空白规范化：连续空白视为一个空格）。
- 多于一个时：优先 `prefix`/`suffix` 匹配者；仍然多个时取与传入 `start`（客户端源偏移）对应的 plain 位置最近者。
- 返回 `{ plainStart, plainEnd, start, end, exact:boolean }`（`start/end` 为源偏移，`exact` 表示是否只有一个匹配）。
- 找不到返回 `null`。空 quote 返回 null。

### 4.4 `mapPlainToSource(projection, plainStart, plainEnd)`

返回 `{ start, end }`（源偏移，`end` 不含标记符之后的位置）；非法范围返回 null。

### 4.5 `applyReplacements(source, replacements)`

`replacements: [{ start, end, replacement }]`；按 start 降序拼接，重叠的后者失效；返回 `{ text, applied:[replacement], skipped:[replacement] }`。

### 4.6 `findFigurePlaceholders(source)`

返回 `[{ index, start, end, line, page, caption, hint }]`；`start`/`end` 覆盖整行（含行尾换行，若无换行则到行尾）。`page` 为正整数；无法解析页码的行忽略。

## 5. `lib/summary-note.js`（本地文件 IO）

所有导出函数；写入必须原子（复用 `lib/util.js` 的 `writeFileAtomic`/`writeJson`）；路径只接收已校验的 paper 目录。

- `readSummary(dir)` → `{ markdown, updatedAt, version }`（不存在时 `markdown:''`）。
- `writeSummary(dir, markdown, { source = 'manual', label = '' } = {})` → 先把**旧正文**快照到 history（旧正文非空时），再原子写；返回 `{ updatedAt, version, snapshot }`。快照超出 30 份时删最旧。
- `summaryVersion(markdown)` → sha256 前 16 位。
- `readAnnotations(dir)` / `writeAnnotations(dir, annotations)`：读取时做校验与清洗（忽略非法项、截断超长、去重 id）。
- `anchorAnnotations(markdown, annotations)`：
  - 用 §4 的 projection + `locateQuote` 重新定位 `open` 标注；
  - 成功：更新 start/end/prefix/suffix，`status` 保持 `open`；
  - 失败：`status='orphan'`，写入 `reply='原文已改动，无法定位'`（保留 quote 供人工处理）；
  - 返回 `{ annotations: [...更新后], anchored: [ids], orphans: [ids] }`。
- `listHistory(dir, limit = 30)` → `[{ stamp, updatedAt, chars }]`（按时间倒序）。
- `restoreHistory(dir, stamp)` → 先快照当前正文，再用该历史版本覆盖；返回 `{ markdown, version, snapshot }`；stamp 必须匹配 `^\d{8}-\d{6}-\d{3}(-\d+)?$`，禁止路径穿越。
- `figureDir(dir)`、`figureFileName(page, index)`、`isFigureName(name)`、`saveFigure(dir, name, buffer)`。

## 6. `lib/figures.js`（从 PDF 截取图片）

- `pageSizePoints(pdfPath, page, { config })` → `{ width, height }`（pt；用 `pdfinfo -f <page> -l <page> -box`，解析 `Page size:` / `Page     size:`；失败时用 `pdfinfo` 首页尺寸兜底）。依赖 `lib/pdf.js` 的 `resolvePoppler`/`toolPath` 能力（可复用 `runCapture`）。
- `bboxToPixels({ widthPt, heightPt, dpi, bboxNorm, padding = 0.02 })`：
  `bboxNorm = [x0, y0, x1, y1]`，取值 0-1000（左上角原点）；换算像素并 clamp 到页内，补 padding 后取整；最小 `40x40`，最大边 `4000`；不合法返回 null。
- `cropPageRegion(pdfPath, outFile, page, bboxNorm, { dpi = 200, padding, config })`：用 `pdftoppm -f p -l p -singlefile -png -r dpi -x X -y Y -W W -H H`；成功后返回 `{ file, width, height }`；`outFile` 目录自动创建；产物 < 12MB。
- `vaultFigureDir(vaultPath, notesFolder, paperId)` → `path.join(vaultPath, notesFolder, '_附件', paperId)`（含创建）；`copyFigureToVault({ vaultPath, notesFolder, paperId, localFile, name })`。
- `autoFigureName(page, index)` → `fig-pXX-YY.png`（页号/序号补零）。
- 图片剪裁尺寸计算必须有单测；真实裁剪测试用 `hasPoppler()` 守卫，无 Poppler 时 skip。

## 7. Host API（`index.js` + `lib/obsidian.js`）

所有路由前缀 `/literature-reader/api`；`busy` 复用现有 Set（同一篇文献同时只允许一个 AI 任务）；错误统一 `HttpError`。请求体默认上限 12MB；标注/正文请求用 1MB；图片请求 8MB（base64 解码后 ≤ 8MB，只接受 jpeg/png，校验魔数）。

### 7.1 路由表（`/papers/:id/...`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/summary` | 已存在；扩展返回 `{ markdown, path, updatedAt, version, annotations, note:{path,relative,exists} }` |
| PUT | `/summary` | 手动保存：`{ markdown, baseVersion?, force? }` → 校验 ≤ 400KB；版本不一致且未 `force` 时 409 `{ error, conflict:true, markdown, version }`；成功后快照+写本地+写 Obsidian+重定位标注 → `{ ok, markdown, version, updatedAt, notePath, annotations, lost:[ids] }` |
| PUT | `/summary/annotations` | 保存标注：`{ annotations }` → 清洗+重定位+落盘 → `{ ok, annotations, updatedAt }` |
| POST | `/summary/revise` | SSE 修订：`{ ids?: [], instruction?: '' }`（ids 省略=全部 open 标注；两者皆空时报 400）|
| GET | `/summary/history` | `{ versions: [...] }`（列表不含正文，只给 stamp/时间/字数/来源） |
| GET | `/summary/history/:stamp` | 只读预览单条历史：`{ stamp, markdown, chars, updatedAt, version }`；stamp 非法或不存在 → 404 |
| POST | `/summary/history/:stamp/restore` | 恢复历史 → `{ ok, markdown, version, updatedAt, notePath }` |
| POST | `/summary/images` | 插图：`{ dataUrl, mediaType, name?, instruction?, anchor?: {heading?, afterOffset?} }` |
| POST | `/summary/images/:imageId/place` | 回答 AI 的位置提问并插入：`{ answer?: '', heading?, afterOffset?, caption?, force?: true }` |
| POST | `/summary/figures` | SSE 补图：`{ placeholders?: [{start,end,page,caption,hint}], auto?: true }`（省略=扫描当前正文） |
| GET | `/figure/:name` | 返回本地图片（`Content-Type` 按扩展；`isFigureName` 校验） |
| POST | `/summary` | 已存在；生成后自动处理占位符并插图（受配置控制），`done` 事件扩展 `figures`/`figureFailures` |

### 7.2 修订流程（`POST /summary/revise`）

1. 读取正文与标注；`anchorAnnotations` 重新定位；没有可处理标注且无 `instruction` → 400。
2. 推送 SSE `{type:'status', label:'正在按你的标注修改…'}`。
3. 调用 `ai.reviseNote({ meta, markdown, annotations: anchored, instruction, signal })`。
4. 把返回的 `edits` 映射为 `applyReplacements`（按 annotation id 取 start/end；同一标注只应用一次；`replacement` 可为空=删除）。
5. 成功替换的标注置 `resolved`（`resolvedAt`, `revision`, `reply=why`），AI 返回 `unresolved` 的标注写 `reply=reason`，保持 `open`。
6. 新正文：`writeSummary`（source=`revision`，先快照）→ 写 Obsidian → 更新 meta（`summaryUpdatedAt/summaryVersion/summaryFigureCount`）。
7. 若新正文含 `[[FIGURE: ...]]` 占位符且未超过上限，继续自动截取（同一 SSE 推送 `figure` 进度事件），然后结束。
8. `done` 事件：`{ type:'done', markdown, version, updatedAt, applied:[{id, why}], unresolved:[{id, reason}], orphans:[ids], figures:{created,failed}, notePath, historyStamp }`。
9. 客户端断开时中止模型调用（复用现有 SSE abort 模式）。

### 7.3 插图流程（`POST /summary/images`）

1. 保存图片到 `figures/`（`img-...png`），生成 `imageId`（无状态=文件名；在内存 Map 中保存 24h 的待放置记录，键为 imageId）。
2. 若 `anchor.heading` 或 `anchor.afterOffset` 已给出：这是用户**显式指定**的位置，直接按锚点插入正文。锚点必须能解析（`heading` 逐字存在于标题行、`afterOffset` 落在正文长度内）；无法解析时返回 400 并说明原因，**不得静默回落**到末尾或改为 AI 提问——否则用户会以为图插到了自己指定的章节。
3. 否则调用 `ai.planImagePlacement({ meta, markdown, instruction, image, signal })`：
   - `action='ask'`：**不修改正文**，返回 `{ status:'needs_question', question, suggestion, imageId, previewUrl }`；客户端展示问题让用户回答。
   - `action='insert'`：按返回的 `heading`（二级/三级标题文本，必须存在）或 `afterOffset` 插入，图注优先用 `caption`，其次 `instruction`，最后文件名。
4. `POST /summary/images/:imageId/place`：携带用户 `answer` 再调一次 `planImagePlacement`（把 answer 作为补充说明）；仍无法确定时可再问一次（最多 2 轮）；**第 3 轮仍无锚点时强制插入正文末尾**（响应带 `fallback:'end'` 以便客户端提示用户），不得无限追问。
5. 插入后版本号、meta、Obsidian 同步更新；返回 `{ status:'inserted', markdown, version, updatedAt, notePath, previewUrl }`。
6. 用户上传的图片同样复制到 vault `_附件/<paperId>/`。若 Obsidian 库不可用：只写本地，正文图片链接保持相对路径。

### 7.4 补图流程（`POST /summary/figures`，SSE）

1. 确定占位符：优先请求里传入的 `placeholders`（客户端已解析，带 start/end），否则从正文解析。
2. 每个占位符：`ensurePageImage`（已有页图直接复用）→ `ai.locateFigure`（视觉）→ `bboxToPixels` → `cropPageRegion` → 保存本地+复制 vault → 替换占位符（从后往前应用，偏移基于同一份正文）。
3. 单图失败不中断；事件：`{type:'start', total}`、`{type:'figure', index, page, ok, name, reason}`、`{type:'status', label}`、`{type:'done', markdown, version, updatedAt, created, failed}`。
4. 已成功插入的图片不重复处理（正文里已无该占位符）。

### 7.5 Obsidian 写入（`lib/obsidian.js`）

新增 `updateSummaryNote({ vault, config, meta, body, tags })`：

- 笔记存在：读取原文，保留 YAML frontmatter（`title` 等不动），合并 `tags`（保留原标签并去重），更新 `updated` 字段；保留结尾的 `> [!info] 来源` 脚注；用新正文替换 frontmatter 与脚注之间的内容；原子写入。
- 笔记不存在：复用现有 `writeSummaryNote` 逻辑创建（图片目录 `_附件/<paperId>` 已由 figures 创建）。
- 返回 `{ path, relative, created:boolean }`。vault 不可用时抛错，由调用方降级为「只写本地」。

## 8. `lib/ai.js` 新增/修改

全部沿用现有 `runText`，`system`/`prompt` 用中文，严格 JSON 输出用 `parseJsonLoose` 解析并校验；一次解析失败可重试一次。

### 8.1 `summarize({ meta, pages, analysis, history, signal, maxFigures = 5 })`

- 使用 §3.1 模板重写提示词；明确结构、写作要求、`[p.X]` 页码、TAGS 行。
- 图片：允许在 §2/§3/§4 中插入 `[[FIGURE: p.N | 图注 | 为什么需要]]`，最多 `maxFigures` 条；不确定图在哪一页时宁可不插；禁止描述不存在的图。
- 返回 `{ body, tags }` 不变。

### 8.2 `reviseNote({ meta, markdown, annotations, instruction, signal })`

- 输入：正文（超预算时保留全部标注附近段落 + 各章节标题，见 `contextChars` 预算）+ 标注列表（id / quote / note / prefix / suffix）。
- 输出严格 JSON：

  ```json
  {
    "reply": "一句话说明这次改了什么",
    "edits": [{ "id": "标注id", "replacement": "替换后的 Markdown（可为空字符串）", "why": "处理说明" }],
    "unresolved": [{ "id": "标注id", "reason": "为什么无法处理" }]
  }
  ```

- 要求：只改被标注的片段；`replacement` 必须与上下文字体、Markdown 结构衔接；不得改动未标注内容；标注要求补图时可插入 `[[FIGURE: ...]]` 占位符；每条标注必须出现在 `edits` 或 `unresolved` 之一。

### 8.3 `locateFigure({ meta, pageImage:{data,page}, caption, hint, pageSize, signal })`

- 输入页图（复用 `this.ctx.attachments.saveImage` + `{type:'image',attachment}`）+ 页码 + 图注 + 提示。
- 输出 JSON：`{"found":true,"bbox":[x0,y0,x1,y1],"label":"图 3","confidence":0.9,"note":"..."}`；`bbox` 为归一化 0-1000 整数，左上原点，`found=false` 时 `bbox:null`。校验：越界 clamp，宽高 < 5% 视为无效。

### 8.4 `planImagePlacement({ meta, markdown, instruction, image, answer, signal })`

- 输入：正文（截断到预算，保留全部标题）、用户说明、图片（视觉）、可选上一轮回答。
- 输出 JSON：

  ```json
  {"action":"insert","heading":"## 4. 实验、数据与结果","afterOffset":null,"caption":"…","reason":"…"}
  {"action":"ask","question":"这张图应该放在哪一节？","suggestion":"看起来和 4.2 节的结果有关"}
  ```

- 判定：用户没说位置、且正文中没有明显唯一匹配的章节 → `ask`；说明含糊时问题要具体、给建议。`heading` 必须逐字出现在正文标题行中；`afterOffset` 为正文插入位置的字符偏移（优先）；两者都无 → 客户端回退到「插入正文末尾」。
- 禁止编造图注：`caption` 优先用用户说明里的描述，其次图片内容概括。

## 9. Client UI（`client.js`）

### 9.1 视图与入口

- 根组件 `view` 增加 `'note'`；进入时加载 `GET /papers/:id/summary`，离开时若有未保存编辑要确认。
- 入口：
  - `OverviewCard`：新增「速览总结」按钮（有总结时显示；无总结时显示「生成速览总结」）。
  - 总结卡片：新增「标注 / 编辑」按钮。
  - 顶部阅读区总结预览弹窗保留（只读），可加「在总结视图中打开」。
- 总结视图头部：返回阅读、标题、`速览总结 · 快速回顾` 定位标签、`预览 | 编辑` 切换、保存状态（已保存 / 未保存 / 保存中 / 保存失败）、按钮：插入图片、补全图片、历史、更多（重新生成总结、打开 Obsidian、按模板重组[P1]）。
- 主体：左侧纸面（最大宽度 820px，居中，可滚动），右侧标注栏（宽 300px，可折叠）；底部固定应用栏。
- 界面措辞：一律用「总结 / 速览」，不得再出现「学习笔记 / study note」。

### 9.1.1 生成前的术语确认（两阶段生成）

用户翻译过的专业名词会收进总结文末的「名词解释」。但「是不是专业名词」只能由模型判断，模型又可能拿不准——拿不准时**弹窗问用户**，不要硬猜。

流程（三个生成入口共用 `runSummary()`，不得有旁路）：

```
点生成
  ↓ 已有总结时先 confirm 覆盖（有意放在最前：用户取消时不必白等分类）
POST /papers/:id/summary/prepare          ← 非流式
  ↓
questions.length > 0 ?
  ├─ 否 → POST /summary { glossaryOverride: include }
  └─ 是 → 术语确认弹窗 → 用户勾选 → POST /summary { glossaryOverride: [...picked, ...include] }
```

**`POST /summary/prepare`** 返回 `{ ok, total, include[], excluded, questions[{term, translation, guess}] }`；`questions` 最多 10 条，`guess:false` 的优先排前。

**`POST /summary`** 新增可选 body 字段 `glossaryOverride: [{term, translation}]`（≤50 条，非法 400）。**校验必须在 SSE 开流之前完成**——开流后状态码已发出，无法再回 400。

⚠️ **`glossaryOverride` 是全量替换，不是增量**：
- 必须传 `include` 与用户勾选项的**并集**，只传勾选项会静默丢掉 AI 已确定的词
- 并集里 **picked 排在 include 前**：host 上限 50 条会截断，用户刚勾选的词必须优先存活
- `questions` 为空时也要带 `include`，否则退化成「重读单词本全传」，与 prepare 的分类结果不一致

**降级**（任何失败都不能卡住用户）：

| 情况 | 行为 |
| --- | --- |
| prepare 失败 / 404 / 超时（20s）/ 模型失败 | 静默跳过弹窗，走旧流程（不带 override） |
| 用户取消或关闭弹窗 | 不生成，不开 SSE |
| 弹窗已开着再次点击 | 早返回，不重复请求 |

弹窗内容：标题说明「AI 判断不了这些词是不是本文专业术语，请确认」；每条 `[复选框] term — translation`，默认勾选取 `guess`；提供全选 / 全不选；主按钮「开始生成」、可取消。列表可滚动。

### 9.2 预览模式与标注

- 用 §3.3 子集的渲染器渲染（新组件 `MarkdownDoc`），文本节点带 `data-p`（纯文本偏移）与块级 `data-block`。
- 选中文字（mouseup / selectionchange 防抖）→ 选区上方浮动小工具条「标注」→ 点击弹出框：textarea（自动聚焦）+ 颜色选择 + 保存（Ctrl/Cmd+Enter）+ 取消（Esc）。选择为空/纯空白时不出现。
- 保存标注：本地状态立即更新并 `PUT /summary/annotations` 落盘；标注文字在正文中以高亮显示，右上角小序号气泡；与标注栏序号一致。
- 点击高亮/序号：打开该标注的编辑弹窗（可改文字、颜色、删除、跳转到正文位置）。
- 标注范围重叠时按边界切分渲染，后加入的优先着色；不要抛错。
- 标注栏：分组「待应用 / 已应用 / 已失效」，每条显示序号、原文摘录（≤80字）、标注内容、状态；操作：定位、编辑、删除；顶部计数与「全部展开/收起」；无标注时显示引导文案（「选中一句话，写下你的标注」）。
- 应用栏：左侧「N 条标注待应用」+ 提示（「不会自动修改，确认后再点应用」）；中间可选补充要求输入框（placeholder：「补充要求（可选），例如：第 5 节讲得更细一点」）；右侧主按钮「应用修改」（无标注且无补充要求时禁用）。点击后 SSE 进度、禁用编辑；完成后替换正文、刷新标注、提示「已应用 N 条标注（M 条未处理）」，并滚动到第一处改动附近；失败时保留原文并提示。
- 阅读体验：`[p.X]` 点击跳回阅读视图对应页；图片点击放大（Lightbox，可用现有的简单实现）。

### 9.3 Obsidian 外部修改提示

数据流是单向的：本地 `summary.md` 是权威副本，每次保存整体写入 Obsidian 笔记。Obsidian 只读，但用户仍可能直接改它，因此需要显式提示，避免静默丢数据。

- `GET /summary` 返回 `vaultModified` / `vaultUpdatedAt` / `localUpdatedAt`（容差 2000ms）。
- 当 `vaultModified: true`：`NoteView` 顶部显示提醒横幅（纯提醒，**不得**禁用编辑或拦截保存），含「查看 Obsidian 版本」「打开 Obsidian」两个操作与关闭按钮；关闭状态在组件内保留，静默刷新不得重置。
- **进入视图时即预拉** `GET /summary/vault-body` 并缓存，点击「查看 Obsidian 版本」立即展开只读预览；404 与加载失败分别提示。
- `PUT /summary` 与 `revise` 的完成事件返回 `vaultOverwritten: true` 时提示已覆盖。
- ⚠️ 提示文案**不得**声称「可从历史找回」：`writeSummary` 快照的是本地正文，Obsidian 侧手写内容从未被读取，覆盖后无法从历史恢复。文案必须说明这一限制。

### 9.4 编辑模式

- 源码编辑：等宽 textarea（Markdown 原文），`Tab` 插入两空格，行号可选；顶部小工具条：保存、取消、字数、插入图片。
- `Ctrl/Cmd+S` 保存；`GET /summary` 的 version 作为 `baseVersion`；409 时提示「笔记已在别处更新」并给「覆盖保存 / 重新载入」。
- 离开编辑模式或离开笔记视图时，未保存内容弹确认；草稿另存 `localStorage['dsh.literature.noteDraft.<paperId>']`（含版本号），刷新可恢复。
- 保存成功后：正文更新、标注重新定位（服务端返回 `lost` 时提示「N 条标注因改动无法定位，已标记为失效」）、写 Obsidian。

### 9.5 插图

- 「插入图片」弹窗，两个页签：
  1. **上传图片**：文件选择（png/jpeg）+ 预览 + 说明输入框（「告诉我放哪里；不确定的话我会问你」）+ 位置选择（当前光标处 / 选择章节 / 让 AI 决定）。
  2. **从文献截取**：页码输入 + 上一页/下一页 + 页面图 + 拖拽矩形选择区域 + 预览裁剪结果 + 说明输入框 + 位置选择。
- 提交 `POST /summary/images`：
  - `status='inserted'`：更新正文，关闭弹窗，提示已插入。
  - `status='needs_question'`：弹窗切换为问答态，展示 AI 问题、建议与输入框 + 「让 AI 直接决定」+「取消」；回答后 `POST /summary/images/:imageId/place`；仍返回问题时允许再答一次。
- 「补全图片」按钮：对正文中未处理的 `[[FIGURE: ...]]` 调 `/summary/figures`，显示进度（第 i/N 张）与结果；没有占位符时提示「当前总结没有待插入的图片」。
- 生成总结时（`POST /summary`）：现有 SSE `done` 已含 `figures`；客户端在总结卡片显示「已插入 N 张图片」，图片在笔记视图可见。

### 9.6 历史

- 「历史」抽屉：版本列表（时间、字数、来源标签：自动生成 / 手动保存 / 按标注修订 / 恢复），每项可预览（只读弹窗）与恢复（二次确认）；恢复后重新加载正文与标注。

### 9.7 样式与状态

- 复用现有 `--lr-*` 与 `--dsw-alias-*` token；新增样式追加在 `CSS` 字符串末尾，类名统一 `lr-note-*` / `lr-ann-*`，不得覆盖既有类。
- 三种主题（跟随 DSH）下均可读：纸面背景用 `var(--dsw-alias-bg-layer-1)`，边框 `var(--lr-line)`。
- 响应式：< 1100px 时标注栏折叠为底部抽屉；< 900px 时工具栏按钮只留图标。
- 性能：正文解析用 `useMemo`；高亮切分对 100KB 文本、200 条标注不卡顿；SSE 进度不导致整页重渲染（只更新状态字段）。

## 10. 兼容与迁移

- 旧 `summary.md`（无图片、无标注、旧结构）：正常打开、标注、编辑；不强制重建结构。
- 旧 Obsidian 笔记：首次保存/插图时创建 `_附件/<paperId>`；frontmatter 中不存在的 `updated` 字段就补上。
- 旧 `/summary` GET 的调用方（预览弹窗）继续可用：仅新增字段。
- 生成总结的旧行为保留：写入本地 + Obsidian + 自动打开（配置）。

## 11. 测试与验证

必须全部通过（在工作区根目录执行）：

```
node --test
node --check index.js
node --check client.js
node --check lib/ai.js
node --check lib/summary-note.js
node --check lib/figures.js
node --check lib/markdown-core.js
```

新增测试至少覆盖：

1. `test/markdown-core.test.mjs`：解析各类块、纯文本映射单调、quote 定位（唯一/多义/前缀消歧/空白规范化）、applyReplacements（重叠/降序）、占位符解析。
2. `test/summary-note.test.mjs`：读写、版本、历史轮转（>30 裁剪）、标注重定位与 orphan、路径穿越拒绝。
3. `test/figures.test.mjs`：bbox 换算与 clamp、命名、文件名校验；真实裁剪在 Poppler 可用时跑。
4. `test/ai-prompts.test.mjs`：用假 `ctx.llm`（返回脚本化 JSON）验证 `reviseNote` / `locateFigure` / `planImagePlacement` 的解析、校验、重试、错误信息。
5. `test/host-api.test.mjs`：假 `ctx`（捕获 `webServer.register` 的 handler、假 `llm`/`attachments`/`agentDefaultModel`）+ 临时 dataDir + 假 vault，端到端调用新路由：生成（含占位符处理）、GET、PUT 冲突、标注保存、修订、插图提问→回答、历史恢复、路径穿越拒绝。
6. `test/client-sync.test.mjs`：region 逐字一致；`t('key')` 使用到的 key 在 zh/en 中都存在；`client.js` 能被 Node 加载（mock `window.__ModuleLoader__` 与 `require('react')` 返回最小 stub）并 `apply` 到假 ctx 不报错。

测试禁止触碰真实 vault 与真实 dataDir。

## 12. 协作规则

- 文件归属（只有对应成员可写）：
  - `core-logic`：`lib/markdown-core.js`、`lib/summary-note.js`、`lib/figures.js`、`test/markdown-core.test.mjs`、`test/summary-note.test.mjs`、`test/figures.test.mjs`
  - `ai-prompts`：`lib/ai.js`、`test/ai-prompts.test.mjs`
  - `host-api`：`index.js`、`lib/obsidian.js`
  - `client-editor`：`client.js`
  - `qa`：`test/host-api.test.mjs`、`test/client-sync.test.mjs`、`test/helpers.mjs`
  - Lead：`docs/*`、`README.md`、`package.json`、`cordis.patch.yml`
- 其他成员禁止写上述文件；接口问题用消息通知 Lead，不要自行改契约。
- 完成后在任务里写清 `acceptanceResults` 与 `commandsRun`；结论要附实际命令输出摘要。
- 不要 commit；不要重启 DSH；不要清理别人的临时文件。
