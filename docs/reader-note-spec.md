# 阅读笔记（Reader Note）功能契约 · v1

> 目标：在文献阅读室的界面上直接记笔记。笔记是 Obsidian vault 里的普通 Markdown 文件，
> 与「速览总结」和 PDF 双向可达（正向链接写在笔记里，反向由 Obsidian 反链面板提供）。
> 本文是实现的唯一依据。任何与本文冲突的代码都算缺陷；本文没写的都不做（见 §11 非目标）。

## 0. 术语与现状

- 速览总结：由 `lib/obsidian.js` 的 `writeSummaryNote` / `updateSummaryNote` 写入。
  本轮改造后它与 PDF、阅读笔记**同目录**（见 §1），本地副本 `<dataDir>/papers/<id>/summary.md` 仍是权威正文。
- 阅读笔记：本文新增的文件，放在**文献（PDF）所在的同一个文件夹**里，`<vault>/<PDF 目录>/<PDF stem> 笔记.md`。
- **vault 文件本身是阅读笔记的唯一权威**。插件不保存正文副本；插件只保存历史快照、问题清单和图片。
  用户在 Obsidian 里手改之后，插件读到的就是最新内容。

## 1. 文件与路径

**一篇文章 = 三件套，放在同一个文件夹，互相链接，一起搬。**

```
<vault>/<PDF 所在文件夹>/<PDF stem>.pdf                文献
<vault>/<PDF 所在文件夹>/<PDF stem> 总结.md             速览总结（本轮从 notesFolder 迁到此处）
<vault>/<PDF 所在文件夹>/<PDF stem> 笔记.md             阅读笔记（唯一权威）
<vault>/<PDF 所在文件夹>/_附件/<paperId>/img-*.png     三件套共用的图片
<dataDir>/papers/<id>/reader-note-history/<stamp>.md      每次写入前的完整文件快照
<dataDir>/papers/<id>/reader-note-history/<stamp>.json    快照边车 {reason, at}
<dataDir>/papers/<id>/reader-note-questions.json          整理笔记发现的问题与讨论记录
```

**三件套目录** = `<vault>/<dir(meta.vaultPath)>`：PDF 在哪个文件夹，总结和笔记就在哪个文件夹；
PDF 在 vault 根目录时两者也在根目录。`meta.vaultPath` 为空（本地导入、尚未归入 vault）时退化成 `<vault>/<notesFolder>`。

**命名一律取 PDF 文件名（去扩展名，经 `safeFileName`）**：

- 速览总结 `'<PDF stem> 总结.md'`
- 阅读笔记 `'<PDF stem> 笔记.md'`

`meta.fileName` 缺失时依次退到 `meta.title`、`meta.id`。文件名里不允许出现 `\ / : * ? " < > |` 与控制字符。

**旧命名的处理**：速览总结此前叫 `<标题> (<年份>).md` 且固定在 `<notesFolder>/`。本轮**不自动迁移**
（现网存量只是测试内容，用户已确认不关心）。规则是：

- `meta.summaryPath` 指向的文件存在 → 继续原地更新，不强制改名/搬家；
- 只有新建总结时才用新命名与新位置；
- 用户在文献库里手动移动/重命名 PDF 时，三件套随之同步（见 §9 与 §12）。

路径解析顺序（`resolveReaderNotePath`）：

1. `meta.readerNotePath` 存在且在磁盘上 → 用它（覆盖「PDF 建完笔记后被移动」的情况）；
2. 目标文件 `<PDF stem> 笔记.md` 已存在且其 frontmatter `paper_id` 等于 `meta.id` → 认领（adopt）；
3. 目标名已存在但 `paper_id` 属于别的文献 → 依次尝试 `<PDF stem> 笔记 2.md`、`笔记 3` …；
4. 都不存在 → 新建第 2 条里的目标名。

**与文献库「关联笔记」的关系（必读）**：`lib/vault.js` 的 `associateNote` 会把「同目录同名」「frontmatter 或正文含 `[[*.pdf]]`」
「同目录前缀模糊匹配」的笔记认作文献的关联笔记。三件套同目录后，笔记与总结都满足这些条件，会互相抢占
（文献库列表里「笔记」一栏可能显示成阅读笔记）。因此：

- 阅读笔记 frontmatter 固定写 `note_role: "reader-note"`，`associateNote` 必须**跳过**它
  （判定：`isReaderNoteNote(note)` —— `frontmatter.note_role === 'reader-note'` 或文件名以 ` 笔记` 结尾）；
- 速览总结 frontmatter 固定写 `note_role: "summary"`，`associateNote` 优先选中它
  （判定：`isSummaryNote(note)`），这样「关联笔记」始终指向总结，不会被阅读笔记抢走。

## 2. 文件格式

新建时的完整内容（frontmatter + 正文）：

```markdown
---
title: "<PDF 文件名去扩展名> 阅读笔记"
authors:
  - "作者"
year: 2024
tags:
  - "文献阅读"
  - "阅读笔记"
paper_id: "<paperId>"
source_app: "DSH Literature Reader"
pdf: "[[<PDF 文件名>]]"
summary_note: "[[<速览总结文件名，不含 .md>]]"
vault_path: "<PDF 的 vault 相对路径>"
created: "<ISO>"
updated: "<ISO>"
---

> [!info] 关联
> 文献：[[<PDF 文件名>]]
> 速览：[[<速览总结文件名>]]

# 2026-11-07

## 21:03 记录

第一条笔记正文。
```

规则：

- `pdf` / `vault_path`：`pdf` 写 `"[[<PDF 文件名含 .pdf>]]"`；`vault_path` 写 PDF 的 vault 相对路径（`meta.vaultPath`，可能为空字符串）。
- `note_role: "reader-note"`：固定写死，供 `associateNote` 与外部工具识别，不随内容变化。
  速览总结对应写 `note_role: "summary"`（见 §12.1）。
- `summary_note` 取 `meta.summaryPath` 的 basename（去扩展名）；速览总结尚未生成时用速览总结的**预命名**
  `safeFileName(title) + (' (' + year + ')' 若需)`，此刻是空链接，Obsidian 里显示为灰色，生成总结后自然命中，不需要插件回填。
- `tags` = `mergeTags(meta.tags, ['文献阅读', '阅读笔记'])`，最多 18 个。
- 正文第一天用 `# YYYY-MM-DD`（本地时区）作为日分组标题。本地时区、24 小时制、分钟补零。

**条目标题 = 用户输入的第一行文字**（用户 2026-11-07 确认的书写习惯）：

```
用户输入                          落盘结果
────────────────────────────────  ──────────────────────────────────────
眼图与 ISI                        ## 21:03 · 眼图与 ISI
预加重把高频分量抬起来。           （空行）
                                  预加重把高频分量抬起来。
```

规则（`splitEntry`）：

1. **从上往下找第一行有文字的**（空行跳过），该行成为 `## HH:mm · <该行>` 的标题部分。
2. 该行**通常从正文里移除**——正文 = 其余所有行按原顺序拼接，首尾空行裁掉。所以标题文字在文件里
   **只出现一次**，不会在标题和正文里各显示一遍。**唯一例外见第 3 条**：标题被截断时该行留在正文。
3. **超过 60 个 Unicode 码点就截断并加 `…`**（`MAX_ENTRY_TITLE_CHARS = 60`，2026-11-07 确认；先定 30，同日改为 60）。
   **但被截断的那一行会整行留在正文里**——标题是缩短的视图，原文一个字都不丢：

   ```
   输入（63 字）                    落盘
   ──────────────────────────────  ──────────────────────────────────────
   预加重在发射端把高频分量抬起来     ## 22:05 · 预加重在发射端把高频分量抬起来补偿信道损耗而均衡在接收端再补…
   补偿信道损耗而均衡在接收端再      （空行）
   补偿一次                          预加重在发射端把高频分量抬起来补偿信道损耗而均衡在接收端再补偿一次
   ```
   这一点是硬约束：**只有「截断 + 保留原文」这一种组合是无损的**。只截断不保留 = 静默删字；
   不截断 = 标题可能长到失控（用户明确要上限）。反过来，**未截断的短标题仍然从正文移除**，不重复。
4. **不转义、不剥离 Markdown**。`**`/`` ` ``/`$`/链接目标一律保留——Obsidian 在标题里能正常渲染
   `**粗体**`、`` `代码` ``、`$公式$`、`[[双链]]`，剥掉等于毁掉格式。
5. 只去掉**行首块级标记**（`#`、`>`、`-`、`*`、`1.`/`1、`、`|`），因为它们会让 `## HH:mm · - 列表` 读起来别扭。
   **标记后面必须跟空格**（或 `、`），因此 `-5 dB`、`1.5 倍` 这类正文内容不会被误伤。
6. **整行只有图片**时跳过该行（图片没有可显示的文字，且必须留在正文里，否则图片会丢），
   继续找下一行；若整条没有任何文字，退化为 `## HH:mm`，图片原样留在正文。
7. 只有一行输入（且不超过 60 码点）= 只有标题、没有正文的条目，落盘为单独一行 `## HH:mm · xxx`
   （不再追加空行正文）；超过 60 码点则标题截断、该行同时成为正文。

- 每条记录正文严格保留用户输入的 Markdown（只做行尾归一与首尾空行裁剪），不得改写
  ——**除标题行以外**：未截断的标题行移出正文，被截断的标题行保留在正文。
- 条目之间、以及与前后块之间恰好一个空行。
- 同一分钟内多条记录允许重复标题（不强制去重）。
- 写入一律 `writeFileAtomic`；每次写前先快照（§4）。
- 新建文件的正文 = 关联 callout + 第一个日分组标题 + 一个空行使光标就绪（不含空的记录标题）。

正文解析：去掉首部 `---\n…\n---\n` frontmatter 后剩下的部分即「正文（body）」。
`noteHash(body) = sha256(body).slice(0,16)`，与 `summaryVersion()` 同算法。

## 3. HTTP 路由（全部挂在 `/literature-reader/api` 下）

所有路由继承现有约定：`id` 必须通过 `PAPER_ID_RE`；错误统一 `{error}`；409 带结构化字段。
新增路由不改变任何既有路由的行为。

### 3.1 `GET /papers/:id/reader-note`

未创建时 `200`：
```json
{ "exists": false, "path": "", "relative": "", "markdown": "", "hash": "", "updatedAt": "", "entryCount": 0, "questions": [] }
```

已创建时 `200`：
```json
{ "exists": true, "path": "D:\\note\\文献阅读\\X (2024) 笔记.md", "relative": "文献阅读/X (2024) 笔记.md",
  "markdown": "<body>", "hash": "<bodyHash>", "updatedAt": "<ISO mtime>", "entryCount": 3,
  "questions": [ /* 见 §3.9 */ ] }
```

`entryCount` = 正文里 `^## \d{2}:\d{2} 记录$` 的行数。

### 3.2 `POST /papers/:id/reader-note`

幂等创建。无 body 或 `{}`。成功 `200`：
```json
{ "ok": true, "created": true, "path": "...", "relative": "...", "markdown": "<body>", "hash": "<hash>",
  "links": { "pdf": "<PDF 文件名>", "summary": "<总结文件名>" } }
```

- 已存在时 `created:false`，内容不变。
- 无可用 vault（未配置 / 目录不存在 / 不是目录）→ `400 {error:"未找到 Obsidian 库"}`。
- 命中已存在文件后把 `meta.readerNotePath` / `meta.readerNoteRelative` 写回 `meta.json`。
- 创建成功后 `GET /papers/:id` 与文献库列表里 `paper.hasReaderNote` 变 `true`。

### 3.3 `POST /papers/:id/reader-note/entries`

追加一条记录。body：
```json
{ "markdown": "记录正文", "baseHash": "<可选，客户端当前 hash>", "at": "<可选 ISO 时间>" }
```

- `markdown` trim 后必须非空，长度 1..20000，否则 `400`。
- `baseHash` 只用于提示「文件在 Obsidian 里被改过」；**追加不做冲突拦截**（追加永远安全）。
- `at` 缺省用服务端 now。
- 成功 `200`：
```json
{ "ok": true, "markdown": "<新 body>", "hash": "<新 hash>",
  "entry": { "heading": "## 21:03 记录", "at": "<ISO>" },
  "anchor": { "start": 120, "end": 168 }, "historyStamp": "<stamp>" }
```
`anchor` 指向插入的整段（含标题与正文）在新 body 中的源码区间。

### 3.4 `POST /papers/:id/reader-note/images`

body `{ "dataUrl": "data:image/png;base64,..." }`。只接受 PNG/JPEG（魔数校验，与 `POST /summary/images` 同规则），解码后 ≤ 8MB。

- 文件名 `img-YYYYMMDD-HHmmss-<4 位随机字母数字>.png|jpg`，必须匹配 `lib/summary-note.js` 的 `isFigureName` 白名单，这样 `/papers/:id/figure/:name` 能直接回放。
- 同时写两份：`<dataDir>/papers/<id>/figures/` 与 `<vault>/<笔记所在文件夹>/_附件/<paperId>/`。
  调用 `vaultFigureDir(vaultPath, 笔记所在文件夹, paperId)`（`lib/figures.js`，第二个参数传**笔记目录**而不是 `notesFolder`），
  这样正文里的相对链接 `_附件/<id>/<name>` 从笔记自身位置解析就能命中。
- `rel` 返回 `_附件/<paperId>/<name>`，vault 不可写 → 本地仍写入但 `vaultError` 非空。
- 成功 `200`：`{ "ok": true, "name": "...", "url": "<API>/papers/<id>/figure/<name>", "rel": "_附件/<id>/<name>", "vaultError": "" }`

### 3.5 历史

- `GET /papers/:id/reader-note/history` → `{ "versions": [ { "stamp", "updatedAt", "chars", "reason" } ] }`，最多 30 条，最新在前。
- `POST /papers/:id/reader-note/history/:stamp/restore` → `{ "ok": true, "markdown", "hash" }`；恢复前先给当前正文做一次快照（`reason:"restore"`）。
- 非法 stamp → `404`；路径穿越 → `400`。只保留 30 份，超出按 stamp 从旧到新删除（含边车）。

### 3.6 `POST /papers/:id/reader-note/organize`（SSE）

「整理笔记」：一次 AI 调用返回美化后的正文 + 疑似错误清单。body `{ "baseHash": "<可选>" }`。

- 给了 `baseHash` 且与磁盘当前 hash 不一致 → **在建立 SSE 之前**返回 `409 { "error": "笔记已在别处更新", "conflict": true, "markdown": "<当前 body>", "hash": "<当前 hash>" }`。
- 笔记不存在 → `404 {error:"还没有建立阅读笔记"}`；正文 < 10 字 → `400`；与同文献其它 AI 任务并发 → `409`。

SSE 事件：
```
{ "type": "status", "label": "正在整理笔记…" }
{ "type": "done", "markdown": "<新 body>", "hash": "<新 hash>", "historyStamp": "<stamp>",
  "report": { "typos": 2, "merges": 1, "formatting": 6, "summary": "一句话说明" },
  "questions": [ /* §3.9，status 全为 open */ ] }
{ "type": "error", "message": "..." }
```

**字段名以 `report` 为准**（与 `lib/ai.js` 的 `organizeReaderNote` 返回一致）。原稿此处写作 `stats`
且含 `charsBefore`/`charsAfter`，但 AI 层不返回这两个字段——`charsBefore` 由宿主用 `before.length` 得知，
`charsAfter` 用 `after.length`，若确实需要请在宿主侧补算，**不要在 AI 层改名**。
客户端已做 `done.report || done.stats || {}` 的兼容，但宿主必须只发 `report`。

落盘规则（用户已确认）：**格式美化、错别字、重复合并直接写入**，写前快照（`reason:"organize"`）；
**疑似错误不改正文**，只生成 `questions` 并以 `open` 落盘。已存在且 `quote` 状态相同的旧问题保留原 `id` 与讨论历史（按 quote 去重）。

安全闸 `checkOrganizeRewrite`（§5）：AI 返回正文违反任一条件则整次失败，`{type:"error", message:"AI 改写破坏了笔记结构（<原因>），已放弃本次整理"}`，**不落盘、不产出问题**。

### 3.7 `POST /papers/:id/reader-note/questions/:qid/discuss`（SSE）

body `{ "message": "<用户补充的话，可为空>" }`；空表示「先听 AI 怎么说」。

- 事件：`{type:"delta", text}`、`{type:"done", "question": {...}, "reply": "<完整回答>"}`、`{type:"error", message}`。
- 讨论历史写回 `messages`（`[{role:'user'|'assistant', content, at}]`，最多 40 条）。`qid` 不存在 → `404`。

### 3.8 `POST /papers/:id/reader-note/questions/:qid/resolve`

body `{ "mode": "apply" | "dismiss" }`。

- `apply`：AI 结合讨论，只替换该问题 `quote` 覆盖的那一段（`applyReplacements` 语义）。
  → `200 { "ok": true, "markdown", "hash", "question": {...,"status":"resolved"}, "replacement": "..." }`；
  找不到锚点 → `409 { "error": "原文已改动，无法定位这处问题", "orphan": true }`，问题转 `orphan`；
  AI 认为其实没问题 → `200 { "ok": true, "unchanged": true, "question": {...,"status":"resolved","verdict":"ok"} }`，正文不变。
- `dismiss`：`200 { "ok": true, "unchanged": true, "question": {..., "status":"dismissed"} }`。
- 有正文写入则写历史快照（`reason:"resolve"`）。

### 3.9 问题对象（存储形态）

```json
{
  "id": "q-<8 位小写字母数字>",
  "quote": "原文中逐字出现的问题片段（≤500 字）",
  "prefix": "前置上下文 ≤48 字",
  "suffix": "后置上下文 ≤48 字",
  "start": 120,
  "end": 168,
  "problem": "为什么可能有问题",
  "suggestion": "AI 认为更可能的正确理解（不直接写进正文）",
  "ask": "要问用户的具体问题",
  "status": "open | resolved | dismissed | orphan",
  "messages": [ { "role": "user", "content": "...", "at": "<ISO>" } ],
  "createdAt": "...",
  "resolvedAt": "..."
}
```

- `status` 只允许这四个值，非法回落 `open`；`messages` 逐条清洗（role 只允许 user/assistant，content ≤4000）。
- 每次读到正文时，`open` 问题用 `locateQuote` 重新锚定；找不到 quote 的转 `orphan`（保留 quote 供人工修）。
- `GET /papers/:id/reader-note` 返回前先锚定。

### 3.10 paper 载荷扩展

`publicPaper()` 增加 `hasReaderNote: boolean`、`readerNoteRelative: string`（形如 `serdes/接收端/a 笔记.md`）、`readerNoteOpen: number`（open 问题数，允许 0）。旧字段一个都不删。

## 4. 历史快照

独立目录 `reader-note-history/`：

- 文件名 `YYYYMMDD-HHmmss-SSS.md`，同毫秒冲突加 `-2`、`-3`；
- 边车同名 `.json`：`{ "reason": "append|organize|resolve|restore", "at": "<ISO>" }`；
- 最多 30 份；`listReaderNoteHistory` 返回 `{stamp, updatedAt, chars, reason}`，未知 reason 返回 `''`；
- 快照内容 = **完整文件**（含 frontmatter），恢复时整体写回，这样 Obsidian 手改的版本也能可靠回滚。

## 5. `lib/reader-note.js` 契约（core-logic 独占此文件）

```js
export const READER_NOTE_HISTORY_DIR = 'reader-note-history'
export const QUESTIONS_FILE = 'reader-note-questions.json'
export const MAX_HISTORY = 30
export const QUESTION_STATUSES = ['open', 'resolved', 'dismissed', 'orphan']

export function readerNoteFolder({ meta, notesFolder })      // PDF 所在目录（POSIX 相对路径）；无 vaultPath 时回退 notesFolder
export function readerNoteStem(meta)                         // '<PDF 文件名去扩展名> 笔记'
export function readerNoteRelativePath({ meta, notesFolder })  // '<folder>/<stem>.md'（POSIX 分隔）
export function attachmentRelPath(paperId, name, sub)        // '_附件/<paperId>/[<sub>/]<name>'（相对笔记目录；sub 不传则不带子目录）
export function splitNoteFile(raw)                   // { frontmatter, body }（frontmatter 不含 --- 分隔行）
export function noteHash(body)                       // sha256 前 16 hex
export function buildReaderNoteFile({ meta, summaryStem, tags, now })   // 完整文件字符串（PDF 名/路径取自 meta）
export function splitEntry(markdown)                            // { title, body }：首行即标题，其余为正文（§2）
export function entryTitle(markdown, at)                        // '## HH:mm · <首行>'（规则见 §2）
export function buildEntryBlock({ markdown, at, body })   // { text, needsDayHeader }
export function appendEntryToBody({ body, markdown, at }) // { body, anchor, entry, needsDayHeader }
export function countEntries(body)
export async function resolveReaderNotePath({ vaultPath, notesFolder, meta })            // { path, relative }
export async function createReaderNote({ vaultPath, notesFolder, meta, summaryStem, tags, now })
export async function readReaderNoteFile({ path })
export async function writeReaderNoteFile({ path, body, meta, reason, historyDir, now })
export async function snapshotReaderNote({ historyDir, raw, reason, now })
export async function listReaderNoteHistory(historyDir)
export async function readReaderNoteHistoryVersion({ historyDir, stamp })
export async function restoreReaderNoteHistory({ path, historyDir, stamp, now })
export async function readQuestions(dir)
export async function writeQuestions(dir, list)
export function normalizeQuestions(list, body)       // 清洗 + 锚定 + 按 quote+problem 去重
export function applyOrganizeResult({ body, questions })  // 把锚点落到新 body；找不到的丢弃并返回 droppedIds
export function checkOrganizeRewrite({ before, after })   // { ok: true } | { ok: false, problems: [...] }
```

`lib/vault.js` 的改动范围（仅此四项，其它导出与行为一律不动）：
1. 新增 `export function isReaderNoteNote(note)`、`export function isSummaryNote(note)`；
2. `associateNote`：优先返回总结笔记，跳过阅读笔记（§1）；
3. `editVaultItem`：重命名 PDF 时同步改名三件套，返回值加 `summaryRenamed`；
4. `moveVaultEntry`：`kind==='pdf'` 时同步移动总结、笔记与 `_附件/<paperId>/`，返回值加 `moved`。
   签名扩展为 `moveVaultEntry({ vault, dataDir, rel, folder, kind, paperId })`——`paperId` 可选，
   传了优先用它定位 `_附件/<paperId>/`，不传则从笔记 frontmatter 的 `paper_id` 反查，都拿不到就只搬文件不搬附件。
   返回 `{ rel, oldRel, folder, kind, changed, linksUpdated, moved: [{kind, from, to}] }`，
   `moved[].kind` ∈ `pdf|summary|note|assets`；`changed:false` 时 `moved` 为空数组（不是 undefined）。
   `editVaultItem` 返回值另加 `summaryRenamedPath`（改名后总结的绝对路径），供调用方回写 `meta.summaryPath`。

`checkOrganizeRewrite` 必须拒绝（返回 `ok:false` + 可读原因）：

1. `after` 不是字符串或 trim 后为空；
2. 长度 `< before*0.5` 或 `> before*1.5`；
2b. **超长笔记的截断保护**：当 `before.length > 12000`（即模型只收到首尾节选，`lib/ai.js` 的
    `READER_NOTE_PROMPT_LIMIT`）时，比例闸会失效——一篇 20000 字的笔记，模型只看得到 12000 字，
    返回 12000 字时比例是 0.6 > 0.5，闸放行，中间 8000 字被静默删除。因此额外要求：
    `before.length > 12000` 时，`after` 的长度必须 `>= before.length * 0.95` 且 `< before.length * 1.5`，
    否则拒绝并给出原因「笔记过长（<n> 字），超出模型单次整理范围，本次整理已放弃」。
    这条同时要求 host 在发起 organize 前提示用户：正文超过 12000 字时建议分段整理。
3. `before` 里每个 `[[...]]` 与 `!\[...\]\(...\)` 片段在 `after` 里必须仍存在（多重集合包含）；
4. `before` 里的 `# ` 日分组标题数量不能减少；
5. `after` 正文首行不得是 `---`（防误塞 frontmatter）；
6. `before` 里每条 `## HH:mm 记录` 在 `after` 里至少保留 `ceil(条目数 * 0.8)` 条（允许合并，不能整体删光）。

## 6. `lib/ai.js` 契约（ai-prompts 独占此文件，只新增不修改既有方法）

```js
async organizeReaderNote({ meta, markdown, signal })
// → { markdown, report: { typos, merges, formatting, summary }, questions: [{quote, problem, suggestion, ask}] }
async discussReaderNoteQuestion({ meta, markdown, question, history, userMessage, signal, onDelta })  // 纯文本流式
async rewriteReaderNoteQuestion({ meta, markdown, question, history, signal })  // { verdict:'fix'|'ok', quote, replacement, why }
```

硬性要求（写进 system prompt 并由解析器兜底）：

- 输出必须是**单个 JSON 对象**，不要代码围栏。
- 只允许改：错别字、标点、全半角、空格、标题层级/空行、列表符号、重复内容合并。
- **禁止**：新增事实/数字/引用；翻译；总结；删整条记录；改动 `[[链接]]`、图片、公式、代码块、frontmatter、`## HH:mm 记录` 的时间戳。
- 疑似「写错了/逻辑不通/理解偏差」的内容**不要改**，放进 `questions`（最多 8 条），`quote` 必须逐字摘自正文（≤500 字）。
- 保持第一人称与用户语气；中文标点优先；不输出元叙述。
- `rewriteReaderNoteQuestion`：`verdict:'ok'` 表示讨论后确认原文没问题；否则 `replacement` 只替换 `quote` 那一段，长度 ≤ `quote.length * 3 + 200`。

## 7. 客户端（client.js）契约（client-ui 独占此文件）

### 7.1 入口按钮

- 阅读器头部 `lr-header-actions`（右上角）：文献已选中时显示
  - 笔记不存在 → `建立笔记`（`Icon note` + 文本）；
  - 笔记存在 → `记录笔记`（主按钮）+ icon 按钮 `修改笔记`（`pen`，在 Obsidian 中打开）。
  - 建立中显示 spinner，失败用现有 `setError` / toast。
- AI 阅读助手标题行（`lr-chat-title-row`）在有阅读笔记时显示 `整理笔记`（`sparkle`）；
  `paper.readerNoteOpen > 0` 时带角标数字。

### 7.2 记录面板（下方面板，不覆盖）

- 位于 `lr-split` **下方**、`lr-root` 的纵向布局里，占满宽度，默认高度 `260px`，范围 `160px–60vh`，可拖动上边缘调整；高度存 `localStorage['dsh.literature.noteDock.v1']`。
- 展开时 `lr-split` 自动缩小（flex），PDF 与 AI 对话同时让出空间（用户明确要求「不覆盖」）。
- 结构：
  1. 工具条：加粗 / 斜体 / 链接 / 一·二·三级标题 / 无序 / 有序 / 引用 / 行内代码 / 行内公式 / 块公式 / 插入图片 / 字号 − % + / 预览切换 / 快捷键帮助（`?`）；每个按钮 `title` 带快捷键。
  2. 编辑区：`textarea`（等宽，`font-size` 由字号状态控制，`85%–180%`，点百分比复位）；`onPaste` 有图片则自动上传并插入。
  3. 预览区：与编辑区二选一或 ≥900px 时左右分栏，用 `MarkdownDoc` + 公式渲染。
  4. 底栏：字数 / `取消`（有内容时二次确认）/ `记录`（`Ctrl/Cmd+Enter`）。
- 草稿：按 `paperId` 存 `localStorage['dsh.literature.noteDraft.<id>.v1']`（≤200KB，防抖 400ms），提交成功后清除；再打开若非空则恢复。
- 「记录」成功后：关闭面板、toast「已记录到笔记」、重新拉 `GET /reader-note` 更新 hash。

### 7.3 快捷键（编辑区内生效，macOS 上 `Cmd` 等价 `Ctrl`）

| 动作 | 快捷键 |
| --- | --- |
| 加粗 | `Ctrl+B` |
| 斜体 | `Ctrl+I` |
| 链接 | `Ctrl+K` |
| 一级 / 二级 / 三级标题 | `Ctrl+1` / `Ctrl+2` / `Ctrl+3` |
| 恢复正文 | `Ctrl+0` |
| 无序列表 | `Ctrl+Shift+8` |
| 有序列表 | `Ctrl+Shift+7` |
| 引用 | `Ctrl+Shift+Q` |
| 行内代码 | `Ctrl+Shift+`` ` `` |
| 行内公式 | `Ctrl+M` |
| 块公式 | `Ctrl+Shift+M` |
| 插入图片 | `Ctrl+Shift+I` |
| 字号 + / − / 复位 | `Ctrl+=` / `Ctrl+-` / `Ctrl+Shift+0` |
| 记录 | `Ctrl/Cmd+Enter` |
| 关闭面板 | `Esc` |

变换由纯函数 `applyMarkdownCommand({ text, start, end, command })` → `{ text, start, end }` 完成（可单测、不依赖 DOM）：
支持包裹（`**`、`*`、`` ` ``、`$`、`$$`）、行前缀（`# `、`## `、`### `、`- `、`1. `、`> ` 及「恢复正文」移除行首标记）、
链接（有选区 `[选区](url)`，无选区插入 `[]()`）。已有同类标记时执行「取消」。

### 7.3b 输入法（IME）合成期间不得抢跑

中文/日文/韩文输入在候选未上屏前处于**合成中**（`compositionstart` … `compositionend`）。这段时间里的
按键属于输入法，不属于应用：

- 合成中的 `keydown` 报 `key === 'Process'` 或 `keyCode === 229`；`nativeEvent.isComposing === true` 也成立。
- 用于**上屏的那次 `Enter`** 只应提交候选词，不能触发「记录」「确定」「应用」等动作，也不能 `preventDefault`。
- 用于**取消候选列表的那次 `Esc`** 只应收起候选框，不能关闭弹窗/面板。
- 合成中不得移动焦点，否则浏览器会直接 `compositionend`，用户表现为「打一个字就退出来」。

统一判定（`client.js` 的 `isComposingEvent` / `isActionableEnter`）：
`isComposingEvent` 覆盖 `isComposing`、`keyCode === 229`、`key === 'Process'` 三种形态；
所有「回车提交」一律走 `isActionableEnter(event[, { modifiers: true }])`；
`readerNoteCommandForKey` 在合成中直接返回 `null`，把按键交还给 textarea。

### 7.3c 弹窗不得在重渲染时抢焦点

`Modal` 的 `onClose` 在每个调用点都是内联箭头函数，每次渲染都是新引用。若 effect 依赖 `onClose`，
则**输入一个字母引起的重渲染就会重跑 effect**，其中安排的光标复位会把焦点从输入框挪到 `✕` 按钮上，
既打断输入也打断输入法（与 §7.3b 叠加，就是「每次打一个字母就会退出」）。

约定：`Modal` 用 ref 持有最新 `onClose`，监听器只在挂载时安装一次（依赖 `[]`）；
初始焦点在挂载后只决定一次——正文若已有焦点（`autoFocus` 生效或用户正在输入）则**不打扰**，
否则聚焦正文里第一个文本输入控件，没有文本控件才回落到 `✕`（保证 `Esc` 可达）。

### 7.4 公式

`renderMath(source, { display })` → React 节点。**离线自研，不引入外部库**（客户端 bundle 不能 require npm 包）。

支持子集：`\frac{a}{b}`、`\sqrt{x}`、`^`、`_`、`{}`、希腊字母（`\alpha`…`\Omega` 大小写各 24 个）、
`\sum \prod \int \oint \infty \partial \nabla`、常见运算符（`\times \div \pm \cdot \le \ge \ne \approx \equiv \to \Rightarrow \leftrightarrow`）、
`\left( \right)`、`\text{中文}`、`\,` `\;` `\quad` 空格、`\begin{aligned}` + `\\` 换行（最简）。
不认识的命令：原样以等宽字体显示该命令，不抛异常、不吞内容。`$$…$$` 单独成段为块级（居中），`$…$` 为行内。
预览里 `## 21:03 · …` 按普通二级标题渲染，` · ` 后的摘要正常显示，不做特殊处理。

### 7.5 整理笔记

点击 → `POST /reader-note/organize`（SSE）：

- 进行中：按钮 spinner + 状态文案；完成后正文刷新为返回的 `markdown`。
- 完成 toast 汇总（`已修正 2 处错别字、合并 1 处重复、整理 6 处格式`）。
- `questions.length > 0` → 打开 `ReaderNoteQuestionsDialog`：逐条显示 quote（高亮）/ problem / ask；每条有输入框 +
  `与 AI 讨论`（`/discuss` 流式显示）、`在 AI 对话中继续讨论`（把片段与疑问作为一条用户消息交给右侧 AI 助手，走现有 `sendQuestion`）、
  `按讨论结果修正`（`/resolve {mode:'apply'}`）、`保留原文`（`/resolve {mode:'dismiss'}`）。
- 未处理的问题保持 `open`，下次点「整理笔记」或打开面板时仍可见（角标来自 `paper.readerNoteOpen`）。
  **实现要求**：`openNoteDock()` 在展开面板前，从 `GET /reader-note` 已返回的 `questions` 里筛出
  `status === 'open'` 的项并传给对话框；该请求本来就要发，因此**不能为此多调一次模型**。
  只在 `length > 0` 时覆盖，避免清掉用户正在看的对话框。新建笔记路径要使用 `createReaderNote()` 的
  返回值（它同样带 `questions`），否则「新建当次」读不到。

### 7.2b 全屏时笔记入口必须仍然可用

页面全屏（`html:fullscreen`）会隐藏 `.lr-header`（`html:fullscreen .lr-header{display:none}`），
如果笔记按钮只放在 header，**进入全屏后「建立笔记 / 记录笔记 / 修改笔记」会整个消失**。

实现要求：同一个按钮组渲染两次——header 一次、**PDF 工具栏**一次（位置在「提炼」与「退出全屏」之间）。
两处共用 `renderReaderNoteActions(variant)`：
- `variant='header'` 用 `lr-btn` / `lr-btn icon` 与 `lr-label` 文本；
- `variant='toolbar'` 用 `lr-tool` / `lr-tool compact`，不带 `lr-label` 类（工具栏已有全局小屏隐藏规则）。

两处的 `onClick`、`disabled`、角标必须完全一致，不要各写一套。

测试必须断言：有笔记时「记录笔记」按钮出现 **2 次**（header + toolbar），且工具栏那组带 `lr-tool-group`。

### 7.2b2 Windows 托盘态必须把窗口带到前台（实测血案）

**症状**：用户点「修改笔记」，Obsidian 毫无反应，看起来像按钮坏了。

**实测结论**（2026-11-07 复现）：

1. `obsidian://open?...` **确实被 Obsidian 收到了**——窗口标题会跟着变成目标笔记
   （实测 `端接基础 - note - Obsidian 1.15.0` → `Altera_EQ(1) 笔记 - note - Obsidian 1.15.0`）。
   也就是说**笔记是打开了**。
2. 但 Obsidian 关闭到托盘时，进程还活着（4 个 `Obsidian.exe`），主窗口是一个
   **不带标题的隐藏窗口**（`Chrome_WidgetWin_1`，`IsWindowVisible == false`）。
3. 这个状态下 `obsidian://` **只切换内部当前文件，不弹窗口**；`rundll32` 返回退出码 0，
   所以宿主完全看不出失败。
4. `WScript.Shell.AppActivate` 对隐藏窗口返回 `False`，**没用**。
5. 直接启动 `Obsidian.exe "obsidian://..."` 同样不弹窗口，**也没用**。
6. 唯一有效的手段：Win32 `ShowWindow(hwnd, SW_RESTORE)` + `ShowWindow(hwnd, SW_SHOW)` + `SetForegroundWindow`。

**实现**：`lib/obsidian.js` 的 `openInObsidian()` 在交出 URI 后调用 `revealObsidianWindow()`：

- 仅 `win32`，其余平台直接返回 false（macOS `open` / Linux `xdg-open` 本来就会抬窗口）。
- 通过 `powershell.exe -EncodedCommand`（base64/UTF-16LE，避免中文路径的编码损坏）执行一段
  内联 C#：枚举 `Obsidian.exe` 所有进程的顶层窗口，取 `Chrome_WidgetWin_1` 且**有非空标题**的窗口，
  **全部**恢复并置前。
- 每次调用都重新枚举、**不缓存窗口句柄**：实测同一次排查里先后读到过 `328750` 与 `4721384`，
  隐藏/恢复过程中句柄并不稳定，缓存会指向已经不存在的窗口。
- 必须按 **PID 过滤**（`GetWindowThreadProcessId` 结果属于 Obsidian 进程）。只按窗口类名
  `Chrome_WidgetWin_1` 过滤会抓到 Edge、ChatGPT、墨笺等其它 Electron 应用的窗口——
  排查时踩过这个坑，会误把别人的窗口抬到前台。
- 轮询最多 ~3.2s（16 次 × 200ms）等 Obsidian 建窗，整体 8s 超时后 `kill` 并返回 false。
- **尽力而为**：任何失败都不影响 open 请求本身；返回值多一个 `revealed` 字段，路由原样透传。
- `LR_NO_WINDOW_REVEAL=1` 关闭该行为（测试套件依赖它，否则会真的弹窗）。

测试必须断言：opt-out 时 `revealed === false` 且**不 spawn**；URI 仍然正常生成。

### 7.2c 「修改笔记」必须给出可见反馈

`openReaderNoteInObsidian()`：宿主只能把 `obsidian://` URI 交给 OS，**无法确认 Obsidian 是否真的切到了那个文件**。
因此必须有可见结果，否则用户会以为按钮坏了（曾出现过「点了没反应」的反馈）：

- 点击后立即置 `noteOpening`，按钮 `disabled` 并显示 `Spinner`（title 换成 `readerNoteEditOpening`）；
- 成功 → toast `readerNoteOpenedInObsidian`（文案要说明「若窗口没切过去请手动切换」，不要谎称已打开）；
- 失败 → `setError` + 红色 toast `readerNoteOpenFailed`；
- `finally` 里复位 `noteOpening`。

### 7.5c 不得在 UI 里承诺未实现的快捷键

按钮 tooltip、帮助面板等任何用户可见处，**只能写代码里真的处理了的快捷键**。

反例（QA 发现并已删除）：记录笔记按钮的 tooltip 曾写 `(Ctrl+Shift+N)`，但全文没有任何对应
`keydown` 处理，spec §7.3 的快捷键表里也没有这一项。

**更关键的是**：`Ctrl+Shift+N` 在 Chrome/Edge 里是保留键（新建无痕窗口），**网页无法通过
`preventDefault` 拦截**。所以这个键从根上就不该承诺——写监听器也没用，用户按下只会开出无痕窗口。
凡是要新增全局快捷键，先确认它在目标浏览器里可被页面接管。

### 7.5b 历史查看与恢复（§3.5 的 UI）

记录面板顶栏加「历史」按钮，打开历史抽屉：

- `GET /papers/:id/reader-note/history` → 列表，最新在前；
- 每项显示 `YYYY-MM-DD HH:mm` + `chars` 字 + reason 中文标签
  （`append` 记录 / `organize` 整理 / `resolve` 修正 / `restore` 恢复 / 未知 → 手动保存）；
- 点开只读预览（Lavender `MarkdownDoc` + 公式渲染）；
- 「恢复此版本」二次确认，文案要说清「当前版本会先存进历史」；
- `POST /reader-note/history/:stamp/restore` 成功后刷新正文与 hash 并 toast；
- 空列表显示「暂无历史版本」。

这是「整理笔记直接改写正文」的安全网，不可省略。

### 7.6 修改笔记

`修改笔记` → 用已拿到的 `relative` 调现有 `POST /vault/open-note`（`{rel}`），无需新路由。
### 7.7 加载失败与「暂无笔记」必须区分（实现中发现的真实缺陷）

`GET /reader-note` 的失败分三种，**不可混为一谈**：

| 情形 | 判定依据 | 客户端行为 |
|---|---|---|
| 404（路由已部署但笔记不存在） | `error.status === 404` | 视为「暂无笔记」，按钮显示「建立笔记」，可走创建 |
| 网络/传输错误 | **无 `status`**（如 `TypeError: Failed to fetch`） | 按「主机不可达」处理，专用文案 `readerNoteUnreachable`，可重试 |
| 其它（500、401、写盘失败） | 有 `status` 且非 404 | **显示真实错误**（`readerNoteLoadFailed` + 服务端原因），**绝不能落入创建分支** |

判定必须写成 `noNote = status === 404` / `failed = !noNote`，**不要**写成
`failed = Boolean(status && status !== 404)`——后者会把无 status 的传输错误算成「非失败」，
用户点按钮只得到一次无原因的静默失败。

测试必须分别锁住三类：404 → 恰好 1 次 `POST`；传输错误 → `POST` 为 0；500 → `POST` 为 0。

**为什么必须分开**：若把 500 当成 `exists:false`，「记录笔记」会顺着分支调用 `POST /reader-note`，
**把已存在的笔记当缺失去重建**，覆盖用户内容。这是数据丢失级缺陷。

实现要求：`refreshReaderNote()` 的失败分支返回 `failure` 标记而不是单纯的 `exists:false`；
`openNoteDock` / `organizeReaderNote` / `openReaderNoteInObsidian` 三处在 `failure` 时必须 toast 真实原因并 return。

**失败状态不得被缓存**：带 `failure` 标记的结果只能用于本次提示，不能当作「已知没有笔记」长期复用。
`openNoteDock` / `organizeReaderNote` / `openReaderNoteInObsidian` 每次进入时若当前状态带 `failure`，
必须重新 `GET` 一次。否则用户修好服务器后每次点击都只会重复旧的错误，必须刷新页面才能恢复。

### 7.8 层叠顺序（窄屏全屏编辑时）

窄屏记录面板是 `position:fixed` 的全屏层。所有可能在其上方打开的浮层必须**显式**高于它，
不能依赖挂载顺序（挂载顺序会随代码调整而失效，失效后表现为「点了没反应」，且不报错）：

| 层 | z-index |
|---|---|
| 历史抽屉遮罩 | 130 |
| 历史预览弹窗（`Modal` 的 `elevated` 变体） | 130 |
| 窄屏全屏编辑层 | 120 |
| 普通 `Modal` 遮罩 | 80 |

`Modal` 新增可选 `elevated` prop（默认 false），既有调用不受影响。

### 7.8b 图片路径的三方一致性（易漏，且不报错）

总结搬到 PDF 同目录后，以下三处必须指向同一个位置，否则在 Obsidian 里图片显示不出来：

1. **落盘位置**：`vaultFigureDir(vault, <总结所在目录>, paperId, '图')` → `<PDF 目录>/_附件/<id>/图/`
2. **正文链接**：`_附件/<id>/图/<name>`
3. **总结所在目录**：`<PDF 目录>`

笔记同理：`vaultFigureDir(..., '笔记')` + `attachmentRelPath(paperId, name, '笔记')` + 笔记所在目录。

**为什么容易漏**：浏览器里的预览走 `/papers/:id/figure/:name` 路由，**不依赖 vault 相对路径**，
所以预览一切正常，只有真的用 Obsidian 打开才会发现图裂了。测试必须断言落盘目录
是 `<PDF 目录>/_附件/<id>/图/`，而不是 `文献阅读/_附件/<id>/`。

存量旧链接 `_附件/<id>/<name>` 保持有效（不迁移、不搬家），新旧共存是预期行为；
读取与删除不得假设只有一个目录。

### 7.9 客户端↔宿主的字段契约（以客户端实现为准，改动需同步）

实现完成后从 client.js 读出的真实调用形态，宿主必须逐条对齐：

| 路由 | 请求 | 成功响应 |
|---|---|---|
| `GET /reader-note` | — | `{exists, markdown, hash, entryCount, relative, path, questions, historyStamp}`；缺失 → **200 + `exists:false`**；文件丢了 → 加 `lostPath`；**真失败必须非 2xx** |
| `POST /reader-note` | — | 幂等创建：新建 → `created:true`；已存在 → **200 + `created:false`，内容不变**（不是 409，见下） |
| `POST /reader-note/entries` | `{markdown, baseHash?}` | `{markdown(追加后的完整正文), hash, entryCount}` |
| `POST /reader-note/images` | `{dataUrl}` | `{rel, name}`，`rel` 形如 `_附件/<id>/笔记/<name>` |
| `GET /reader-note/history` | — | `{versions:[{stamp, updatedAt, chars, reason}]}` 最新在前 |
| `POST /reader-note/history/:stamp/restore` | — | `{markdown, hash, entryCount}` |
| `POST /reader-note/organize`（SSE） | `{baseHash?}` | 事件 `status` / `done` / `error`；`done` 须含 `{markdown, hash, questions, report}` |
| `POST /reader-note/questions/:qid/discuss`（SSE） | `{message}` | 事件 `delta{text}` / `done{question}` |
| `POST /reader-note/questions/:qid/resolve` | `{mode:'apply'|'dismiss'}` | `{question, markdown?, hash?}` |

**`POST /reader-note` 为何是幂等 200 而非 409**：客户端 `createReaderNote` 对非 2xx 一律弹错误
toast，而「笔记已存在」不是错误——用户重复点「建立笔记」不应看到报错。原稿 §7.9 表格写作 409，
与 §3.2 的幂等语义冲突，**以 §3.2 为准**（实现与测试均锁 `created:false` + 200）。

两条硬性约束：

1. **`entries` / `restore` / `resolve` 的 `markdown` 必须是操作后的完整正文**，不能回增量——客户端是整体替换。
2. **SSE 必须发出终止事件**。organize 只发 `status` 不发 `done`/`error`，discuss 不发 `done`，客户端会一直等待。

## 8. 测试要求

| 层 | 文件 | 必须覆盖 |
| --- | --- | --- |
| 纯逻辑 | `test/reader-note.test.mjs`（core-logic） | 笔记目录随 PDF 所在文件夹（含 vault 根目录、`vaultPath` 为空回退 `notesFolder`）、文件名取 PDF stem、adopt 已有文件、跑号 2/3、`associateNote` 不把阅读笔记认作关联笔记（`note_role`/文件名/模糊匹配三路各一例，且真正的总结笔记仍能被认领）、条目插入（同日/跨日/空正文）、`countEntries`、hash、frontmatter 拆分、历史快照与 30 份裁剪、恢复、问题清洗/锚定/去重、`checkOrganizeRewrite` 6 条拒绝规则各一例 + 一个合法通过例 |
| AI 层 | `test/reader-note-ai.test.mjs`（ai-prompts） | 提示词含禁令、`organizeReaderNote` 正常解析、坏 JSON 重试后报错、`questions` 上限 8、`rewriteReaderNoteQuestion` 的 fix/ok 两路径、replacement 长度闸 |
| 路由 | `test/reader-note-api.test.mjs`（host-api） | `test/helpers.mjs` 起实例：创建幂等 / 无 vault 400 / append 同日与跨日 / 图片 magic 与 8MB / history 列表与恢复与穿越 / organize 409 冲突、成功落盘与快照、被安全闸拒绝时不落盘 / discuss 流式 / resolve 的 apply·dismiss·orphan / `paper.hasReaderNote` |
| 三件套 | `test/tripod.test.mjs`(data-layer) | 总结命名 `<PDF stem> 总结.md`、总结目录随 PDF、`note_role` 写入、`associateNote` 优先选总结且跳过阅读笔记、重命名 PDF 时三件套同步改名、移动 PDF 时三件套同步移动并改写链接、移动笔记单独移动不影响 PDF |
| 客户端 | `test/reader-note-ui.test.mjs`（client-ui） | 复用 `test/note-render.test.mjs` 的 patch + react stub：`applyMarkdownCommand` 全命令矩阵、`renderMath` 子集与未知命令兜底、面板 open/closed 两态渲染不抛、快捷键分发（直接构造 `keydown` 事件对象调 handler）、按钮文案随 `hasReaderNote` 切换 |

`node --test` 全绿、`node --check index.js client.js lib/*.js` 全绿是交付底线。

## 9. 与既有功能的边界

- 速览总结的**生成、修改、标注、图片逻辑**不改；只改它的**落盘位置与命名**（§12.1），以及关联识别（§1）。
- `lib/vault.js` 的改动限于：`associateNote` 的关联优先级、`editVaultItem` / `moveVaultEntry` 的三件套联动、新增 `isReaderNoteNote` / `isSummaryNote` 导出。其它行为不动。
- 删除文献时不再一律保留文件：改为用户在弹窗里三选一（§12.3）。
- 不改动 `/papers/:id/ask` 的会话记录；「在 AI 对话中继续讨论」只是把一段话交给现有发送流程。
- `busy` 集合复用：整理/讨论/修正与总结生成互斥（都改正文或占用模型）。
- 英文单词归档的既有行为不变。删除文献时一定删除插件侧的 `reader-note-history/` 与问题文件；vault 里三件套的去留由 §12.3 的三选一决定。

## 10. 兼容与降级

- 没有 vault：不能建立笔记，点击给出明确错误，不静默失败。
- 速览总结还停在旧的 `<notesFolder>` 时，三件套联动只搬「实际存在且在预期位置」的文件，绝不因为找不到就报错中断。
- vault 读写出错（权限/占用）：`500` + 明确文案；本地历史与问题文件不受影响。
- 用户在 Obsidian 里改了正文：下次任何写入前都会快照；`organize` 用 `baseHash` 拦一次，返回 409 让用户重新整理。
- 模型不支持图片输入不影响本功能（不需要视觉）。

## 11. 非目标（明确不做）

1. 不做笔记版本 diff 界面（只有历史列表 + 恢复）。
2. 不做 Obsidian 插件 / 数据 API 集成，只写文件 + `obsidian://` 打开。
3. 不做富文本 WYSIWYG（Markdown 源码 + 预览）。
4. 不做笔记全文搜索、标签管理界面。
5. 不改 DSH 宿主、不新增 npm 依赖。

## 12. 三件套同步（本轮新增）

### 12.1 速览总结的落盘位置与命名（`lib/obsidian.js`）

`writeSummaryNote` 与 `updateSummaryNote` 的目标目录改为**三件套目录**（§1），文件名改为 `'<PDF stem> 总结.md'`。
路径选择顺序：

1. `meta.summaryPath` 存在且在磁盘上 → 原地更新，不改名不搬家（兼容旧文件）；
2. 三件套目录下 `'<PDF stem> 总结.md'` 不存在 → 新建它；
3. 已存在且其 frontmatter `paper_id === meta.id` → 认领更新；
4. 已存在但属于别的文献 → `'<PDF stem> 总结 2.md'`、`3` ……（复用现有 `chooseNotePath` 的跑号思路）。

`frontmatterFor` 增加一行 `note_role: "summary"`。`config.notesFolder` 仍保留：仅作为「文献不在 vault 内」时的回退目录，
以及 `_附件` 的回退位置。

**改动的函数签名保持不变**，只改内部目录与命名推导；`writeSummaryNote` 里 `meta.summaryPath.startsWith(folder)` 的
判断要改成按三件套目录判断，否则旧路径会被误判为「在外面」而被改名。

### 12.2 重命名 / 移动 / 文件夹重命名时的联动（`lib/vault.js`）

统一原则：**三件套是一个整体，PDF 动，另外两个跟着动；笔记或总结单独动不影响 PDF。**

统一工具函数（新增，放 `lib/reader-note.js`）：

```js
export function tripodPaths({ meta, pdfRel, notesFolder })
// → { pdfRel, summaryRel: '<dir>/<stem> 总结.md', noteRel: '<dir>/<stem> 笔记.md' }
export function tripodCandidates({ meta, pdfRel, notesFolder })
// → 三个文件在「旧位置」的实际相对路径（基于 meta.summaryPath / meta.readerNotePath 反推，找不到则按命名推）
```

**重命名 PDF**（`editVaultItem`）：PDF 改成 `<新名>.pdf` 后，
若总结/笔记当时位于旧 PDF 同目录且文件名是 `<旧 stem> 总结.md` / `<旧 stem> 笔记.md`，
则同步改名为 `<新 stem> 总结.md` / `<新 stem> 笔记.md`；自定义命名的文件不动名字，只随目录。
随后 `updateVaultLinks` 统一改写 `[[旧名]]` → `[[新名]]`（已有能力，覆盖三件套内部互链）。
`editVaultItem` 的返回值新增 `summaryRenamed: boolean`、`noteRenamed` 已在。

**移动 PDF**（`moveVaultEntry`，`kind === 'pdf'`）：移动 PDF 后，
把同目录的 `<旧 stem> 总结.md`、`<旧 stem> 笔记.md` 以及 `_附件/<paperId>/` 一并移到目标文件夹同名位置。
目标位置已有同名文件 → `409`，且**不移动任何文件**（先全部预检，再执行，失败回滚已移动的文件）。
返回值新增 `moved: [{ kind: 'pdf'|'summary'|'note'|'assets', from, to }]`。

**移动笔记或总结**（`kind === 'note'`）：只移动该文件，不动 PDF；但若移动的是阅读笔记，
要同步更新 `meta.readerNoteRelative`（由 `handleVaultMove` 负责，见 §12.4）。

**文件夹重命名**（`renameVaultFolder`）：文件夹整体重命名，三件套一起被搬，只需改写路径类字段（已有能力），无需额外联动。

### 12.3 删除文献：弹窗三选一

`DELETE /papers/:id` 现有两种模式（只删记录 / `deleteNotes` 附带删笔记）。扩展为三选一，
body 或 query 传 `vaultFiles`：

| 值 | 行为 |
| --- | --- |
| `keep`（默认，不传时） | 只删插件记录与本地缓存，vault 里三件套全留 |
| `summary` | 连同速览总结一起删（走 `backups/delete-*`，可还原） |
| `all` | 速览总结 + 阅读笔记 + `_附件/<paperId>/` 一起删（同样走备份） |

旧参数 `deleteNotes: true` 继续接受，等价于 `all`（向后兼容，不破坏既有测试）。

客户端 `confirmDelete` 对 `kind === 'pdf'` 弹出三选一（单选按钮 + 说明文字），
其它 kind 保持现有二次确认。文案要写清「删除会先进备份目录，可以还原」。

### 12.4 文献库列表：按文献分组

当前「PDF」「笔记」两个 tab 各自平铺。改为：**PDF tab 一个文献一行，行内可展开看到它的总结与笔记**。

- 每行显示：PDF 文件名、状态、标签、`总结` / `笔记` 徽标（有则亮，无则暗）。
- 点「展开」或点行 → 展开区显示两组按钮：`打开速览总结`、`打开阅读笔记`（不存在则显示 `尚未生成` 并禁用）。
- 拖拽移动仍作用于 PDF 本身（三件套跟着走，§12.2）。
- 「笔记」tab 改为**默认只显示「不属于任何文献的独立笔记」**，阅读笔记与速览总结收进上面的文献行。
  顶部加一个开关「显示全部笔记」，打开后回到平铺全量视图（并给阅读笔记 / 速览总结打不同徽标）。
  这是用户确认的「先做一版，用了不适应再调」的取舍。
- 服务端 `GET /api/vault/library` 的 `pdfs[]` 增加 `summaryRel: string`、`readerNoteRel: string`，
  客户端据此渲染，不再靠 `noteRel` 猜。

### 12.5 `meta.json` 新增字段

```json
{ "readerNotePath": "D:\\note\\serdes\\a 笔记.md", "readerNoteRelative": "serdes/a 笔记.md", "readerNoteOpen": 0 }
```

`summaryPath` 沿用现有字段（绝对路径），不新增。三件套联动时若改了总结路径，要同步写回 `meta.summaryPath`。

## 13. 非目标（本轮追加）

6. 不做旧总结的批量迁移工具（用户已明确存量只是测试内容）。
7. 不做「笔记随 PDF 移动」之外的跨库同步（vault 外文件不参与）。
8. 不做三件套的删除回收站界面（沿用 `backups/delete-*` 目录）。

## 13b. 存量旧总结不迁移（用户 2026-11-07 再次确认，最终）

旧总结（自定义命名、或停在 `文献阅读/` 里）**保持原地，不改名、不搬家、不做批量迁移工具**。

理由：用户明确只导入新文献，不会导入旧文献；现存的那几篇是历史测试遗留，不值得为它们增加迁移逻辑。

因此：

- **不实现**「整理为三件套 / 一键迁移旧总结」这类动作（曾考虑过，已否决）。
- 新生成的总结一律走三件套命名与位置（`<PDF stem> 总结.md` 放在 PDF 同目录）。
- 对于旧总结，重命名/移动 PDF 时**不会**带动它（因为文件名不匹配 `<旧 stem> 总结.md`），这是预期行为。
- 已在盘上的 `meta.summaryPath` 会被继续沿用（原地更新），不会因为新规则而被改写到别处。

**只建总结、不建笔记**是受支持的主要用法：`hasReaderNote` 为 false 时按钮显示「建立笔记」，
`GET /reader-note` 返回 `exists:false`（200，非 404），三个写路由（entries / resolve / organize）
在笔记不存在时返回 404 而不是 500。删除时的三选一始终显示三项——缺文件由 `removeVaultEntry`
吞掉 404，只记 `warnings[]`，不会失败。

## 14. 本轮已定稿的细节（用户 2026-11-07 确认）

这一节是「拿不准、问过、已定」的记录，实现时以本节为准，不要再自由发挥。

1. **窄屏（≤860px）记录面板 = 全屏编辑**（§7.2）。不是覆盖浮层、不是抽屉，是占满插件面板的整页编辑。
   顶栏保留「关闭」「记录」，预览改为整页切换。
2. **图片分目录**：总结 `_附件/<paperId>/图/`，笔记 `_附件/<paperId>/笔记/`（§3.4）。互不干扰。
   `vaultFigureDir(vaultPath, notesFolder, paperId, sub)` 增加第四个参数 `sub`，**仅四参调用**才进子目录（三参调用保持 `_附件/<id>/`，旧链接不失效）（保持对既有
   `copyFigureToVault` 调用方的兼容）；图片路由对笔记传 `'笔记'`。
   已有笔记里的旧相对链接 `_附件/<id>/<name>` 不迁移、不改写，文件也不搬。
3. **条目标题 `## HH:mm · <首行>`**（§2，2026-11-07 由「首句摘要 + 24 码点截断」改为「首行即标题」）。
   用户的实际写法是：先写一行标题、回车、再写正文；第一行成为条目标题**并从正文中移除**，不重复显示。
   **软上限 60 个 Unicode 码点**（先定 30，同日因为「30 个中文只有半句话」改为 60）：超出则标题截断加 `…`，
   且**该行整行保留在正文里**（只截断不保留会静默删字）。
   取不到文字（如整条只有一张图）时退化为 `## HH:mm`。
   旧格式 `## HH:mm 记录` 仍被识别（正则 `/^## \d{2}:\d{2}(?: · |\s|$)/`），不改写已存在的旧标题。
4. **整理笔记的模型与代价**：「整理笔记」直接用当前选中的模型，不加二次确认弹窗（点了就干）。
   若被 `busy` 占用或模型任务进行中，返回 409 并提示「当前模型任务正在进行，请稍候」。
5. **疑似错误的判定尺度＝保守**。只报「数字/年份/引用与原文对不上」「因果关系说反」「术语用错」「结论与前提矛盾」
   这四类硬错误；措辞风格、可合并性、表达不够学术一律不提。提示词必须把这四类与排除项写死。
6. **笔记文件被外部删除**：`meta.readerNotePath` 指向的文件不存在时，`GET /reader-note` 返回 `exists:false` 且
   额外带 `lostPath: "<原路径>"`。客户端此时按钮仍是「建立笔记」，但点击前弹一次确认
   「原笔记文件已丢失（<路径>），要重新建立吗？」。历史快照仍在，可从「已保存的历史」里找回内容。
7. **历史快照按文献各存 30 份**（`MAX_HISTORY = 30`，每篇文献一个 `reader-note-history/` 目录），与总结一致，不放宽。
8. **「笔记」tab 默认只显示独立笔记**，顶部开关「显示全部笔记」可回到全量平铺（§12.4）。

## 15. 非目标（最终）

1. 不做笔记版本 diff 界面（只有历史列表 + 恢复）。
2. 不做 Obsidian 插件 / 数据 API 集成，只写文件 + `obsidian://` 打开。
3. 不做富文本 WYSIWYG（Markdown 源码 + 预览）。
4. 不做笔记全文搜索、标签管理界面。
5. 不改 DSH 宿主、不新增 npm 依赖。
6. 不做旧总结的批量迁移工具。
7. 不做三件套的删除回收站界面（沿用 `backups/delete-*`）。
8. 不做笔记随 PDF 移动之外的跨库同步。
9. 不把笔记里的数学公式导出成图片或 MathML，只在预览里渲染。
