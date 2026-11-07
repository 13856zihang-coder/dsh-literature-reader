# t5 QA 覆盖矩阵

工作目录：`F:\dsh\dsh-literature-reader`　作者：qa　最近更新：2026-11-07

本文件保留两轮 QA 的矩阵：

- **本轮（阅读笔记）** → `docs/reader-note-spec.md`，见下方 §0 与 §5–§9。
- **上一轮（总结编辑器）** → `docs/summary-editor-spec.md`，内容保留为**附录 A–D**（其基线 185 例已被本轮 405 例取代）。

---

## 0. 本轮基线（阅读笔记，2026-11-07 实测）

```
node --test   →  tests 405 / suites 38 / pass 405 / fail 0 / cancelled 0 / skipped 0 / 11.5s
node --check  →  index.js client.js lib/{ai,reader-note,vault,obsidian,figures}.js  7/7 OK
```

按文件分布（阅读笔记相关的六个文件全部为本轮新增，`host-api` 与 `client-sync` 有既有用例被本轮改动）：

| 测试文件 | 用例数 | 归属 | 本轮 |
| --- | --- | --- | --- |
| `test/reader-note.test.mjs` | 31 | core-logic | 新增 |
| `test/reader-note-ai.test.mjs` | 19 | ai-prompts | 新增 |
| `test/reader-note-api.test.mjs` | 39 | host-api | 新增 |
| `test/tripod.test.mjs` | 18 | data-layer | 新增 |
| `test/reader-note-ui.test.mjs` | 60 | client-ui | 新增 |
| `test/reader-note-integration.test.mjs` | 8 | **qa (t5)** | 新增 |
| `test/fullscreen.test.mjs` | 13 | client-ui | 新增（全屏阅读） |
| `test/host-api.test.mjs` | 37 | **qa (t5)** | 既有，3 处断言随三件套更新 |
| `test/client-sync.test.mjs` | 5 | **qa (t5)** | 既有，§7 路由清单更新 |
| `test/ai-prompts.test.mjs` | 54 | ai-prompts | 既有 |
| `test/note-render.test.mjs` / `test/note-functional.test.mjs` | 46 / 33 | client-editor | 既有 |
| `test/markdown-core.test.mjs` / `test/summary-note.test.mjs` / `test/figures.test.mjs` | 9 / 12 / 6 | core-logic | 既有 |
| `test/settings.test.mjs` / `test/words.test.mjs` | 7 / 7 | 既有 | 既有 |
| `test/helpers.mjs`（被 `node --test` 当作一个测试文件计入） | 1 | 测试基础设施 | 既有 |
| **合计** | **405** | | |

上面 17 个文件的用例数相加 = 404，加上 `test/helpers.mjs` 自身的 1 条 = 405，与 `node --test` 的 `tests 405 / suites 38` 对齐（38 = 四个文件里的 38 个 `describe` 块）。

---

## 5. 契约逐条对照（`docs/reader-note-spec.md`）

### 5.1 §1 文件与路径

| 契约要求 | 断言位置 | 状态 |
| --- | --- | --- |
| 三件套同目录、命名 `<PDF stem> 总结.md` / `<PDF stem> 笔记.md` | `tripod.test.mjs#a new summary is written next to the PDF as …`；`reader-note.test.mjs#readerNoteFolder follows the PDF folder, the vault root and the notesFolder fallback`；集成 #1 | 覆盖 |
| PDF 在 vault 根目录 | `reader-note-api.test.mjs#reader note for a PDF in the vault root lands in the root`；`reader-note.test.mjs#… the vault root …` | 覆盖 |
| PDF 不在 vault 内 → 回退 `notesFolder` | `tripod.test.mjs#a paper outside the vault falls back to notesFolder for its summary`；`reader-note.test.mjs#… the notesFolder fallback` | 覆盖 |
| 文件名取 PDF stem、非法字符被 `safeFileName` 清理 | `reader-note.test.mjs#the note name is the PDF stem plus 笔记, with unsafe characters sanitised` | 覆盖 |
| 解析顺序：`meta.readerNotePath` → adopt by `paper_id` → 跑号 2/3 → 新建 | `reader-note.test.mjs#resolveReaderNotePath favours the recorded path, adopts by paper_id and runs numbers`、`#resolveReaderNotePath adopts an existing file whose paper_id matches` | 覆盖 |
| 跑号不覆盖别人的文献 | `tripod.test.mjs#a summary name owned by another paper runs the number instead of overwriting` | 覆盖 |
| `associateNote` 跳过阅读笔记（`note_role` / 文件名 / 模糊三路） | `tripod.test.mjs#associateNote prefers the summary and never picks the reader note`、`#associateNote skips a reader note named after the PDF even without a summary`、`#the reader note loses the fuzzy branch too`；集成 #1 断言 `entry.noteRel === SUMMARY_REL` | 覆盖（qa 另用真实 `scanVault` 复验：无 frontmatter 的 `<stem> 笔记.md` 不被认领，同目录其它笔记照常认领） |
| `isReaderNoteNote` / `isSummaryNote` 两个导出 | `tripod.test.mjs#isReaderNoteNote and isSummaryNote read both role and name` | 覆盖 |

### 5.2 §2 / §14.3 文件格式与条目

| 契约要求 | 断言位置 | 状态 |
| --- | --- | --- |
| frontmatter 全字段（`paper_id`/`note_role`/`pdf`/`summary_note`/`vault_path`/`created`/`updated`） | `reader-note.test.mjs#buildReaderNoteFile writes the tripod frontmatter, the callout and the first day`；集成 #1 | 覆盖 |
| 关联 callout `> [!info] 关联` 双向链接 | `reader-note.test.mjs#buildReaderNoteFile …`；集成 #1 | 覆盖 |
| 首日 `# YYYY-MM-DD` 本地时区 | 同上；集成 #1 正则 `^# \d{4}-\d{2}-\d{2}$` | 覆盖 |
| 条目标题 `## HH:mm · <首句 ≤24 码点>`，超出加 `…`，取不到文字退化为 `## HH:mm` | `reader-note.test.mjs#entryTitle handles the six boundary cases`；集成 #2 | 覆盖（qa 用 `[...str].length` 复验 24 码点上限与 emoji 边界） |
| 同日追加 / 跨日新建日分组 / 空正文 | `reader-note.test.mjs#appendEntryToBody appends inside today, or opens a new day group`；`reader-note-api.test.mjs#…appends one entry with a timestamped heading`、`#…across days starts a new day heading`；集成 #2 | 覆盖 |
| 条目正文逐字保留 | `reader-note.test.mjs#an entry whose body keeps its own Markdown is stored verbatim` | 覆盖 |
| 块之间恰好一个空行 | 集成 #2 `assert.doesNotMatch(third.markdown, /\n{3,}/)` | 覆盖 |
| 旧格式 `## HH:mm 记录` 仍被识别、不改写 | `reader-note.test.mjs#countEntries recognises the new and the legacy heading and nothing else`；集成 #2 写入旧标题后 `entryCount` +1 且正文原样保留 | 覆盖 |
| `countEntries` 只数 `##`，不数 `###` | `reader-note.test.mjs#countEntries …`（qa 另验 `### 21:03 · x` 计 0） | 覆盖 |
| `noteHash` = sha256(body).slice(0,16) | `reader-note.test.mjs#noteHash is the first 16 hex chars of the sha256 of the body`；集成多处 `^[a-f0-9]{16}$` | 覆盖 |
| frontmatter 拆分容忍无 frontmatter | `reader-note.test.mjs#splitNoteFile separates frontmatter from body and tolerates a bare body` | 覆盖 |

### 5.3 §3 路由（9 条 + 2 条辅助）

| 路由 | 契约要点 | 断言位置 | 状态 |
| --- | --- | --- | --- |
| `GET /reader-note` | 缺失 200+`exists:false`；字段 `{exists,markdown,hash,entryCount,relative,path,questions,historyStamp}`；丢了加 `lostPath`；真失败非 2xx | `reader-note-api.test.mjs#GET /reader-note before creation answers 200 with exists:false`、`#a note file deleted outside the plugin reports lostPath`；集成 #1 逐字段断言 `NOTE_GET_KEYS`、#8 | 覆盖 |
| `POST /reader-note` | 幂等：新建 `created:true`；已存在 **200 + `created:false`，正文不变**；无 vault 400；回写 `meta.readerNotePath` | `reader-note-api.test.mjs#POST /reader-note creates the note next to the PDF and remembers the path`、`#POST /reader-note without a vault answers 400`；集成 #1 字节级比对 | 覆盖（qa 实跑确认是 200 而非 409，与 §7.9 注一致） |
| `POST /reader-note/entries` | 1..20000 字；追加不拦 `baseHash`；返回完整正文 + `entry.anchor` | `reader-note-api.test.mjs#…validates the payload and the note presence`；集成 #2 校验 `anchor` 切片、400 两条 | 覆盖 |
| `POST /reader-note/images` | PNG/JPEG 魔数、≤8MB、`img-YYYYMMDD-HHmmss-xxxx` 命中 `isFigureName`、双写、`rel=_附件/<id>/笔记/<name>` | `reader-note-api.test.mjs#…writes the bytes under _附件/<id>/笔记/`、`#…follows the PDF folder for the vault copy`、`#…rejects non PNG/JPEG magic numbers`、`#…rejects an image larger than 8MB`；集成 #3、#7 | 覆盖 |
| `GET /reader-note/history` | 30 份、最新在前、`{stamp,updatedAt,chars,reason}` | `reader-note-api.test.mjs#reader-note history lists snapshots newest first and restores one`；集成 #4 断言 `reason` 依次为 `organize`/`resolve`/`restore` | 覆盖 |
| `POST /reader-note/history/:stamp/restore` | 恢复前快照当前正文；非法 stamp 404、穿越 400 | `reader-note-api.test.mjs#reader-note history rejects path traversal and unknown stamps`；`reader-note.test.mjs#restoreReaderNoteHistory writes the snapshot back and snapshots the current file`；集成 #4 | 覆盖 |
| `POST /reader-note/organize`（SSE） | `baseHash` 冲突 → **SSE 之前** 409；`report` 而非 `stats`；`status`/`done`/`error` 终止事件；安全闸拒绝不落盘 | `reader-note-api.test.mjs#…rewrites the body, writes history and returns report`、`#…answers 409 before the SSE when baseHash is stale`、`#…refuses a rewrite that breaks the structure`、`#…rejects a missing note and a too-short body`、`#…stores open questions with context anchors`；集成 #4 | 覆盖（集成 #4 额外断言 `done.stats === undefined` 与 409 时 `app.calls.length` 不变，即冲突不调模型） |
| `POST /reader-note/questions/:qid/discuss`（SSE） | `delta` 流 + `done{question}`；`messages` 落盘；未知 qid 404 | `reader-note-api.test.mjs#…streams deltas and stores the thread`、`#…answers 404 for an unknown question`；集成 #4 断言 role 序列 `['user','assistant']` | 覆盖 |
| `POST /reader-note/questions/:qid/resolve` | `apply` 只替换引用片段；`dismiss` 只改状态；`orphan` 409；非法 mode 400 | `reader-note-api.test.mjs` 六例（apply / unchanged / orphan / only-fragment / dismiss / unknown mode）；集成 #4 | 覆盖 |
| `GET /papers/:id` | §3.10 `hasReaderNote` / `readerNoteRelative` / `readerNoteOpen` | `reader-note-api.test.mjs#GET /papers/:id reports hasReaderNote and the open question count`；集成 #1、#4 | 覆盖 |
| §7.9 字段表整体 | 客户端实际读写的字段名 | 集成 #1 对 `GET` 逐字段断言；qa 另用探针跑过 POST/entries/images/history/restore/organize 的响应键名 | 覆盖（`POST /reader-note` 的 `created:false`+200 判定按 §3.2，见 §9-1） |

### 5.4 §5 `lib/reader-note.js` 契约

| 契约要求 | 断言位置 | 状态 |
| --- | --- | --- |
| 目录 / 命名 / 解析 / adopt / 跑号 | 见 §5.1 | 覆盖 |
| `tripodPaths` / `tripodCandidates` | `reader-note.test.mjs#tripodPaths and tripodCandidates name the three files in one folder` | 覆盖 |
| 历史快照 30 份裁剪、同毫秒加 `-2`/`-3` 且排序稳定 | `reader-note.test.mjs#history snapshots keep 30 per paper, newest first, with their sidecars`、`#same-millisecond snapshots get -2 / -3 suffixes and still sort newest first` | 覆盖 |
| `readReaderNoteHistoryVersion` 非法 stamp 404 / 穿越 400 | `reader-note.test.mjs#readReaderNoteHistoryVersion parses the snapshot and rejects bad stamps` | 覆盖 |
| 问题对象清洗 / 锚定 / orphan / 去重 | `reader-note.test.mjs#questions round-trip through the sidecar file and are cleaned on the way in`、`#normalizeQuestions anchors open questions, orphans missing quotes and dedupes`、`#applyOrganizeResult re-anchors onto the new body and drops what disappeared` | 覆盖 |
| `checkOrganizeRewrite` 六条拒绝规则各一例 + 合法通过例 | `reader-note.test.mjs#checkOrganizeRewrite accepts a rewrite that only fixes typos and formatting` + `rule 1`…`rule 7` 七例 + 旧标题一例（实现里是 7 条 + 2b，见 §9.2-2） | 覆盖（超出 §8 要求的「6 条」） |

### 5.5 §6 `lib/ai.js`（只新增）

| 契约要求 | 断言位置 | 状态 |
| --- | --- | --- |
| 提示词写死改写禁令（不新增事实、不翻译、不删记录、保 `[[链接]]`/代码块/frontmatter/时间戳） | `reader-note-ai.test.mjs#organizeReaderNote spells out the rewrite limits and the conservative error scale` | 覆盖 |
| 疑似错误只报四类硬错误 | 同上（system prompt 断言） | 覆盖 |
| JSON 解析 / 围栏兜底 / 计数 clamp / 坏 JSON 重试后抛错 | `#organizeReaderNote parses the JSON object and normalizes the report`、`#…accepts a fenced answer and clamps the report counters`、`#…retries once on a bad answer and then throws`、`#…rejects an empty markdown body` | 覆盖 |
| `questions` 上限 8、非法条目丢弃、超长字段截断 | `#organizeReaderNote caps questions at 8 and drops quotes that are not in the note`、`#…truncates oversized question fields and skips unusable entries` | 覆盖 |
| 超长笔记截断但留头尾 | `#a very long note keeps its head and tail inside the prompt` | 覆盖 |
| `discussReaderNoteQuestion` 流式与空 message | `#discussReaderNoteQuestion streams plain text and passes onDelta through`、`#…forwards a non-empty user message` | 覆盖 |
| `rewriteReaderNoteQuestion` fix/ok/无 quote/长度闸/空 replacement=删除/重试 | 该文件 7 例 | 覆盖 |

### 5.6 §7 客户端

| 契约要求 | 断言位置 | 状态 |
| --- | --- | --- |
| §7.1 入口按钮随 `hasReaderNote` 切换、`整理笔记` 带角标 | `reader-note-ui.test.mjs#header entry buttons …`（4 例）、`#organize button and questions dialog …`（`整理笔记 appears only once a note exists`、`the badge counts open suspicious findings`） | 覆盖 |
| §7.2 下方面板不覆盖（flex sibling）、默认 260px、160px–60vh、拖动、高度入 localStorage | `#wide renders as an in-flow dock with a resize handle, not a fixed overlay`、`#font size and height come from storage with the documented defaults`、`#dragging the top edge reports a new height and persists on release only`、`#the drag respects the 160px floor and the 60vh ceiling`；源码核对 `client.js` 中 dock 是 `lr-root` 里 `lr-split` 的兄弟节点 | 覆盖（静态 + 组件树，无真实浏览器） |
| §7.2 工具条 / 编辑区 / 预览 / 底栏（字数、取消二次确认、记录） | `#wide shows the toolbar, the preview toggle and the footer actions`；源码 `READER_NOTE_TOOLS`、底栏字数与 `Ctrl+↵` | 覆盖 |
| §7.2 草稿按 paperId、≤200KB、防抖 400ms、提交后清空 | `#drafts are per paper, round-trip, and clear on demand`；源码 `READER_NOTE_DRAFT_DEBOUNCE = 400`、`READER_NOTE_DRAFT_LIMIT = 200*1024` | 覆盖（防抖时序为源码核对，未用假时钟验证） |
| §7.3 快捷键全表 + Cmd 等价 + 未识别键放行 | `#every documented Ctrl shortcut maps to its command`、`#font size and submit map to actions, not commands`、`#macOS Cmd behaves exactly like Ctrl`、`#unrelated keys stay unhandled so the textarea keeps them`、`#applyReaderNoteKey turns a keydown into new text plus a selection` | 覆盖 |
| §7.3 `applyMarkdownCommand` 全命令矩阵（包裹/取消/行前缀/链接） | 该文件 9 例 | 覆盖 |
| §7.4 `renderMath` 子集 + 未知命令原样显示 + 不抛异常 | `#the documented subset renders to readable text`、`#\begin{aligned} stacks rows…`、`#an unknown command is shown verbatim in monospace instead of throwing`、`#malformed input never throws`、`#inline and display maths render as an element of the right shape` | 覆盖（希腊字母大小写、`\sum` 等符号为源码枚举核对） |
| §7.4 预览里 `## HH:mm · …` 按普通二级标题渲染 | `#the preview renders maths, headings and entry titles`、`#the preview never throws on odd markdown` | 覆盖 |
| §7.5 整理完成 toast、疑似错误对话框（quote/problem/ask + 讨论 + 修正 + 保留） | `#organize toast accepts either stats or report`、`#the questions dialog shows quote, problem and ask for each item`、`#resolved items drop out and an empty state explains why`、`#the dialog prefers the persisted discussion thread over the session one`、`#the dialog renders without questions at all` | 覆盖 |
| §7.5b 历史抽屉（列表 / 预览 / 恢复二次确认 / 来源标签 / 空态） | `reader note history …` 9 例（含 `restore POSTs to the documented URL after confirmation`、`declining the restore confirmation sends nothing`、`the empty list shows 暂无历史版本`） | 覆盖 |
| §7.6 `修改笔记` 走 `POST /vault/open-note` | `#an existing note offers 记录笔记 plus 修改笔记`；源码 `openReaderNoteInObsidian` 调 `/vault/open-note` | 覆盖（未真实拉起 Obsidian，`autoOpenObsidian: false`） |
| §7.7 三种加载结果不能混淆（404 / 传输错误 / 500） | `#the three load outcomes stay distinct: 404 no-note / transport / 500`、`#a failed load is retried on the next click instead of pinning the button` | 覆盖（契约点名「404→1 次 POST、传输→0、500→0」三条全断） |
| §7.8 层叠顺序 130/120/80 | `#the narrow full-page editor cannot cover the history sheet or the preview`；CSS `lr-note-history-mask`/`lr-modal-backdrop.elevated` = 130、`lr-note-dock-full` = 120、`lr-modal-backdrop` = 80 | 覆盖 |
| §7.8b 图片路径三方一致 | `test/host-api.test.mjs` 五处 `_附件/<id>/图/` 断言 + `tripod.test.mjs#vaultFigureDir and copyFigureToVault honour the optional sub folder`；笔记侧集成 #3、#7 | 覆盖（qa 复验：三参调用仍进旧扁平目录，旧链接不失效） |
| §14.1 窄屏 ≤860px 全屏编辑 | `#narrow renders as a full-page editor with close and record in the top bar`、`#the breakpoint constant matches the CSS media query` | 覆盖（断点常量与 `@media(max-width:860px)` 双向核对） |

### 5.7 §12 三件套同步

| 契约要求 | 断言位置 | 状态 |
| --- | --- | --- |
| §12.1 总结落盘到三件套目录、命名、`note_role: "summary"` | `tripod.test.mjs` 前 5 例；集成 #1（总结经真实 `POST /summary` 生成）；`test/host-api.test.mjs` 既有断言 | 覆盖 |
| §12.1 `meta.summaryPath` 存在 → 原地更新不搬家（兼容旧文件） | `tripod.test.mjs#an existing summary path inside the tripod folder is updated in place`、`#a summary still sitting in the old notes folder is kept, not renamed or moved` | 覆盖（qa 另用真实 `writeSummaryNote` 复验：旧路径 `文献阅读/a 学习总结.md` 保留且正文写入成功） |
| §12.2 重命名 PDF → 三件套同步改名 + 改写链接 | `tripod.test.mjs#renaming a PDF renames the canonical summary and note with it`、`#a custom-named summary or note keeps its name when the PDF is renamed`、`#a rename conflict is rejected before anything is renamed`；集成 #5 | 覆盖 |
| §12.2 移动 PDF → 总结/笔记/`_附件` 一起移，返回 `moved[]` | `tripod.test.mjs#moving a PDF moves the summary, the note and the attachment folder`、`#a move conflict answers 409 and moves nothing at all`、`#a failure halfway through rolls the already-moved files back`、`#moving into the same folder is a no-op`；集成 #5 断言 `moved` 种类 `['assets','note','pdf','summary']` | 覆盖 |
| §12.2 单独移动笔记 → 不动 PDF | `tripod.test.mjs#moving a note on its own leaves the PDF where it is` | 覆盖 |
| §12.2 移动后 `meta.readerNotePath` / `summaryPath` 回写 | `reader-note-api.test.mjs#moving the PDF moves the note and rewrites meta.readerNotePath`、`#renaming the PDF renames the tripod and rewrites meta.summaryPath`；集成 #5 | 覆盖 |
| §12.3 三选一 `keep`/`summary`/`all` + 旧 `deleteNotes:true` = `all` + 非法值 400 | `reader-note-api.test.mjs` 五例；集成 #6 五段（含 `keep` 时插件侧状态仍全删） | 覆盖 |
| §12.4 文献库 `summaryRel` / `readerNoteRel`、按文献分组、笔记 tab 默认只显示独立笔记 + 开关 | `reader-note-api.test.mjs#GET /vault/library exposes summaryRel and readerNoteRel`、`#…reports empty rels for a PDF without the companions`；`reader-note-ui.test.mjs#library grouping …` 4 例；集成 #1 断言 `noteRel === summaryRel` 且 `readerNoteRel` 指向笔记 | 覆盖（`scanVault` 有 ~2.5s 缓存，测试一律带 `?refresh=1`） |
| §12.5 `meta.json` 新字段 | 集成 #1 与 #5 直接读 `meta.json` 断言三个字段 | 覆盖 |

### 5.8 §14 定稿细节（除上面已列的 14.1/14.2/14.3）

| 条款 | 断言位置 | 状态 |
| --- | --- | --- |
| §14.4 整理用当前模型、不加二次确认、busy 409 | `reader-note-api.test.mjs#…rejects a missing note and a too-short body`（含 409 路径，见 §9.2-3）；`test/host-api.test.mjs#30 busy 409` 同机制 | 覆盖（客户端「点了就干」由源码核对，无 confirm 调用） |
| §14.5 保守尺度：只报四类硬错误 | `reader-note-ai.test.mjs#organizeReaderNote spells out the rewrite limits and the conservative error scale` | 覆盖 |
| §14.6 外部删除 → `lostPath` + 客户端先确认再重建 | `reader-note-api.test.mjs#a note file deleted outside the plugin reports lostPath`；`reader-note-ui.test.mjs#the lost-file confirmation text interpolates the path`、`#a lost note still offers 建立笔记 and asks before recreating it`；集成 #8 | 覆盖 |
| §14.7 历史 30 份 | 见 §5.4 | 覆盖 |
| §14.8 笔记 tab 默认独立笔记 | 见 §5.7 §12.4（`#the notes tab lists only standalone notes until 显示全部笔记 is on`） | 覆盖 |

---

## 6. 端到端场景链（`test/reader-note-integration.test.mjs`，qa 新写）

一次 `createApp()` 只会写进 `mkdtemp` 出来的临时 dataDir 与临时 vault，绝不碰真实 `D:\note` 与 `D:\DSH-Literature`。`setupTripod()` 先把 PDF 放进 `serdes/接收端/`，再用**真实的** `POST /summary` 与 `POST /reader-note` 建出三件套（不是手写 fixture），因此 §12.1 的落盘位置与命名是实跑验证的。

| # | 场景链 | 关键断言 |
| --- | --- | --- |
| 1 | 三件套同目录 + 双向链接 + §7.9 载荷 + 库分组 + 幂等创建 + meta 回写 | 目录相同、文件名 `<stem> 总结.md`/`<stem> 笔记.md`、`pdf`/`summary_note`/callout 链接、`note_role: "reader-note"`、`NOTE_GET_KEYS` 九字段、hash 形如 16 hex、`paper.hasReaderNote`、`entry.noteRel===SUMMARY_REL`、第二次 POST 字节不变且 `created:false` |
| 2 | 记录：同日 → 跨日 → 旧格式兼容 → 校验 | `## \d{2}:\d{2} · ` 标题、`anchor` 切片、跨日新增 `# YYYY-MM-DD`、旧标题写入后 `entryCount` 3→4 且原文保留、无三连空行、空正文与 20001 字均 400 |
| 3 | 笔记图片 | `rel` 形如 `_附件/<id>/笔记/img-…png`、vault 副本落在 `笔记/` 且前四字节是 PNG 魔数、本地副本仍在 `figures/`、`/figure/:name` 可回放、正文引用往返、坏魔数 400 |
| 4 | 整理 → 讨论 → 修正 → 恢复 | `report` 四字段且 `stats` 不存在、`questions` 一条 `open` 带 prefix/suffix、历史 `reason='organize'`、`reader-note-questions.json` 落盘、`meta.readerNoteOpen=1`、过期 `baseHash` 409 且不调模型、discuss 有 `delta` 且 `messages` 角色为 `['user','assistant']`、resolve 只改引用片段并写盘、`reason='resolve'`、还原 `organize` 快照后正文退回整理前且 frontmatter 存活、`reason='restore'` |
| 5 | 重命名 → 移动 | `summaryRenamed:true`、三个新名都在且旧名都不在、互链与 `vault_path` 被改写、条目存活、`meta.summaryPath`/`readerNoteRelative` 更新、`moved` 种类 `['assets','note','pdf','summary']`、`_附件` 连同 `笔记/` 一起搬、图片相对链接在新目录仍有效、`GET /summary` 仍 200、库里仍认总结为关联笔记 |
| 6 | 删除三选一 | `keep`（默认，什么都不动，插件侧仍清空）/ `summary` / `all`（含 `_附件`）/ 旧 `deleteNotes:true` = `all` / 非法值 400 且不删；四种情形 PDF 都保留 |
| 7 | §14.2 目录分离 | 笔记图只进 `笔记/`，`图/` 一个文件都没有；三参 `vaultFigureDir` 仍指向旧扁平目录 |
| 8 | §14.6 丢失笔记 | `exists:false` + `lostPath`、`paper.hasReaderNote=false`、历史仍可读、重新创建 `created:true` |

---

## 7. 契约一致性专项核对（qa 手工跑，非测试文件）

| 核对项 | 方法 | 结论 |
| --- | --- | --- |
| 路由响应字段 vs §3 / §7.9 | 逐一发请求打印 `Object.keys(body).sort()` | 全部命中；`POST /reader-note` 实际是 200 + `created:false`（§7.9 原稿写作 409，spec 已修正为「以 §3.2 为准」） |
| zh/en 本地化齐平 | 用花括号匹配器取出两份字典求值 | zh 496 == en 496，无单侧键；阅读笔记相关 135 个键两侧齐全 |
| `markdown-core` 两处逐字一致 | 取 `#region`…`#endregion` 切片算 sha256 | 26515 字节 / 766 行 / sha256 前 16 位 `1a17d606e0fabca5`，两侧完全相同 |
| 条目正则兼容旧格式 | 直接调 `countEntries` / `entryTitle` | `## 21:03 记录`、`## 21:04 · x`、`## 21:05` 计 3；`### …` 计 0；码点上限与 `…` 正确 |
| 附件相对路径 | 调 `attachmentRelPath` | `_附件/p1/a.png`、`_附件/p1/笔记/a.png`；`../evil.png` 被清洗成 `evil.png` |
| 三件套目录（真实文件系统） | 用真实 `writeSummaryNote` 写新总结 + 旧路径总结 | 新总结落 `serdes/a 总结.md`；带 `meta.summaryPath` 的旧总结原地更新不搬家 |
| `associateNote` 不抢阅读笔记（真实 `scanVault`） | 造无 frontmatter 的 `<stem> 笔记.md` + 一份普通笔记 | PDF 的 `noteRel` 指向普通笔记，阅读笔记被跳过 |
| 安全闸规则 2b | 调 `checkOrganizeRewrite` 20000→13000 字 | 正确拒绝并给出「笔记过长…本次整理已放弃」 |
| `git` 清单 | `git status` / `git diff --stat` | 见 §8；`package.json`、`cordis.patch.yml`、`lib/markdown-core.js`、`lib/util.js` **零改动** |
| 语法检查 | `node --check` | 7/7 OK（含新文件 `lib/reader-note.js`） |

---

## 8. 改动清单（本轮，`git diff --stat` + `git status`）

```
 README.md                 |  101 +-
 client.js                 | 3014 +++++++++++++++++++++++++++++++++++++++++++--
 docs/qa-coverage.md       |  285 ++++-
 index.js                  |  921 +++++++++++++-
 lib/ai.js                 |  374 ++++++
 lib/figures.js            |   30 +-
 lib/obsidian.js           |   85 +-
 lib/vault.js              |  286 ++++-
 test/client-sync.test.mjs |    2 +-
 test/host-api.test.mjs    |   21 +-
 10 files changed, 4929 insertions(+), 190 deletions(-)
```

（`README.md` 与 `docs/qa-coverage.md` 是 qa 本轮改的两个既有文件——前者补阅读笔记说明并纠正过时的总结/图片路径，后者是本文件。）

未跟踪（新增）：`docs/reader-note-spec.md`、`lib/reader-note.js`、`test/{fullscreen,reader-note,reader-note-ai,reader-note-api,reader-note-integration,reader-note-ui,tripod}.test.mjs`。

**零改动确认**：`package.json`、`cordis.patch.yml`、`lib/markdown-core.js`、`lib/util.js` 均不在 `git status` 与 `git diff` 中——不新增依赖、不改宿主注入、不动共享渲染核心。

---

## 9. 已知未覆盖 / 已知偏差（如实记录）

### 9.1 未覆盖的断言

1. **没有真实浏览器验证**：§7 的客户端结论来自「源码 + 组件树渲染 + 纯函数直调」，没有 Playwright 级别的真实点击、拖拽改高、`localStorage` 跨刷新恢复、文件选择上传。这是本轮最大的一块空白。
2. **真实 Obsidian 未拉起**：`修改笔记` 只断言到 `POST /vault/open-note` 被调用，`autoOpenObsidian: false`；没有验证 `obsidian://` 真的打开到正确文件。
3. **拖拽改高的指针事件序列未模拟**：面板拖动只测到「回调收到新高度、松手才落盘」和上下限 clamp，没有真实的 `pointerdown/move/up` 序列与多显示器 DPI 差异。
4. **草稿防抖时序**：400ms 防抖只核对了常量与分支，没有用假时钟验证「连续输入只写一次」。
5. **`renderMath` 的符号枚举**：希腊字母 24×2、`\sum \prod \int \oint \infty \partial \nabla`、关系符等靠源码枚举核对，没有逐符号断言渲染结果。
6. **并发**：`busy` 409 只在既有 `host-api` 用例里覆盖同一机制，阅读笔记路由本身没有构造「整理与总结同时跑」的并发用例。
7. **`_附件` 里新旧目录共存**：§7.8b 要求读取与删除不能假设只有一个目录；本轮只断言了新目录写入与旧扁平目录「仍然有效」，没有构造「同一篇文献的图分散在老/新两个目录」的删除与重命名用例。
8. **Poppler 门控**：本机 Poppler 存在，裁剪相关用例实跑未跳过；若 CI 无 Poppler，`test/figures.test.mjs` 与 `host-api` 的裁剪用例会 `skip`，跳过时不算覆盖。
9. **超大数据量**：8MB 图片上限有正/负例，但没有验证「刚好 8MB」的边界；20000 字条目上限只测了 20001 拒绝，没测 20000 通过。

### 9.2 契约与实现的偏差

1. `POST /reader-note` 的幂等语义：spec §7.9 原稿表格写「已存在 → 409」，与 §3.2「幂等 200 + `created:false`」冲突。**实现与测试都按 §3.2**，spec 已加注说明「以 §3.2 为准」。判定：**契约已自洽，非缺陷**。
2. `checkOrganizeRewrite` 实际有 **7 条 + 规则 2b**，§8 的测试要求写的是「6 条拒绝规则」。实现更严，测试逐条覆盖（`rule 1`…`rule 7` + 旧标题一例）。判定：**实现超集，非缺陷**。
3. §14.4 说「被 `busy` 占用或模型任务进行中返回 409」——该路径由 `handleReaderNoteOrganize` 开头的 `busy.has(id)` 提供，测试通过 `host-api` 的同机制用例间接覆盖，阅读笔记路由本身没有单独断言文案。属于**覆盖深度不足，非实现缺陷**。
4. 整理 SSE 的 `status` 事件文案由宿主给出（`正在整理笔记…`），客户端只做展示；集成用例没有逐字断言 `status.label`，只断言了事件类型序列。属**展示细节未锁死**。
5. **已上报待 owner 修（D1）**「记录笔记」按钮 tooltip 写 `Ctrl+Shift+N`（`client.js:11947`），但全文没有任何键盘处理：`readerNoteCommandForKey`（`client.js:5260`）只在编辑区内生效且不含 `n`，三处 `window.addEventListener('keydown')` 只处理 Escape，`event.key ===` 只匹配 `Enter/Escape/S/s/Tab`。spec §7.3 的快捷键表里也没有这一项。要么补 handler 并写进 §7.3，要么删掉 tooltip 里的标注。**属实现与自身提示不一致，非契约缺失。**
6. **已上报待 owner 定（D2）** spec §7.5 第 407 行说未处理的问题「下次点『整理笔记』**或打开面板时**仍可见」，但 `openNoteDock()`（`client.js:10677`）不读 `questions`、`ReaderNoteDock` 没有 `questions` prop，`setNoteQuestions` 只在 `organizeReaderNote` 成功分支调用。角标（来自 `paper.readerNoteOpen`）是对的，但缺少「只看待确认」的入口，只能重跑一次整理（会再调模型、再改写正文）。**实现与文档不一致，二选一收口。**
   README 已按**实际行为**描述（角标 + 下次整理重新列出），未写「打开面板可见」。

### 9.3 §15 非目标复核

契约 §15 九条非目标（无 diff 界面、无 Obsidian 插件集成、无 WYSIWYG、无全文搜索、不改宿主不加依赖、不批量迁移旧总结、无删除回收站界面、无跨库同步、公式不导出图片/MathML）**均未越界**：`package.json` 与 `cordis.patch.yml` 零改动，公式渲染是自研纯函数只产 React 节点，历史只有列表 + 恢复，删除走 `backups/delete-*`。

---

## 10. 本轮总评（阅读笔记）

**pass-with-notes（可交付）**

- 契约 §8 点名的六类测试文件全部存在且全绿：`node --test` **405/405**、`node --check` **7/7**。
- §3 的 12 条路由、§7 的全部交互点、§12 的三件套联动、§14 的八条定稿细节都有对应断言；门禁链路（建三件套 → 记录 → 图片 → 整理 → 讨论 → 修正 → 改名 → 移动 → 删除 → 丢失重建）由 qa 新写的 8 个端到端用例串起来实跑。
- 阻塞项 **0**。遗留均为「没有真实浏览器 / 真实 Obsidian 验证」这类环境性空白（§9.1），以及契约自身已经注明的两处措辞偏差（§9.2-1、§9.2-2，均已判定非缺陷）。
- 另有两条**实现侧**问题已上报 captain 由 owner 收口（§9.2-5 `Ctrl+Shift+N` 空头承诺、§9.2-6 待确认问题缺少入口），两者都不影响本轮测试结论，也不阻塞交付。

（上一轮总结编辑器的基线是 185 例 / 25 套件，作为历史记录留在附录 D，不再代表当前状态。）

| 测试文件 | 用例数 | 归属 |
| --- | --- | --- |
| `test/markdown-core.test.mjs` | 9 | core-logic (t1) |
| `test/summary-note.test.mjs` | 12 | core-logic (t1) |
| `test/figures.test.mjs` | 6 | core-logic (t1) |
| `test/ai-prompts.test.mjs` | 54 | ai-prompts (t2) |
| `test/host-api.test.mjs` | 37 | **qa (t5)** |
| `test/client-sync.test.mjs` | 5 | **qa (t5)** |
| `test/note-render.test.mjs` | 46 | client-editor (t8) |
| `test/note-functional.test.mjs` | 33 | client-editor (t8) |
| `test/settings.test.mjs` / `test/words.test.mjs` | 7 / 7 | 既有（回归） |
| 阅读笔记六个文件 + `fullscreen` | 188 | 见 §0 |

---

## 附录 A. 上一轮：契约 §11 六类测试逐条对照

### A.1 `test/markdown-core.test.mjs`（§11-1）— 覆盖

| 契约要求 | 对应用例 | 状态 |
| --- | --- | --- |
| 解析各类块 | `parses headings, paragraphs, code, tables, quotes, lists, hr and images` | 覆盖 |
| 解析容忍异常输入 | `parser tolerates CRLF, tabs, unclosed markers and empty input` | 覆盖 |
| 纯文本映射单调 | `plainProjection maps every character monotonically onto the source` | 覆盖 |
| quote 定位（唯一/多义/前缀消歧/空白规范化） | `locateQuote finds unique, ambiguous, prefix-disambiguated and re-wrapped quotes` | 覆盖 |
| inline 偏移 | `parses inline runs with exact source offsets`、`mapPlainToSource returns trimmed source ranges and rejects illegal ranges` | 覆盖 |
| applyReplacements（重叠/降序） | `applyReplacements applies descending and skips overlaps` | 覆盖 |
| 占位符解析 | `findFigurePlaceholders reports whole-line ranges and parsed fields` | 覆盖 |
| region 可粘贴进浏览器 | `markdown-core region stays pasteable into the browser client` | 覆盖 |

### A.2 `test/summary-note.test.mjs`（§11-2）— 覆盖

| 契约要求 | 对应用例 | 状态 |
| --- | --- | --- |
| 读写 | `readSummary returns empty state until the file exists`、`writeSummary snapshots the previous body and reports a version` | 覆盖 |
| 版本号 | `summaryVersion is the first 16 hex chars of the sha256` | 覆盖 |
| 历史轮转（>30 裁剪） | `history keeps the newest 30 snapshots and lists them newest first`、`pruning removes the source sidecar together with its snapshot` | 覆盖 |
| 历史来源（§7.1） | `history snapshots keep the origin of the body they contain`、`history source labels stay renderable by the editor`、`history tolerates legacy snapshots without a sidecar` | 覆盖 |
| 标注重定位与 orphan | `anchorAnnotations re-locates open quotes and marks missing ones orphan`、`annotations round-trip, get cleaned and are capped` | 覆盖 |
| 路径穿越拒绝 | `restoreHistory snapshots the current body and rejects path traversal`、`figure helpers produce and validate safe file names` | 覆盖 |

### A.3 `test/figures.test.mjs`（§11-3）— 覆盖（真实裁剪受 Poppler 门控）

| 契约要求 | 对应用例 | 状态 |
| --- | --- | --- |
| bbox 换算与 clamp | `bboxToPixels converts normalised boxes and applies default padding`、`bboxToPixels clamps out-of-range boxes and honours the minimum size`、`bboxToPixels rejects malformed input` | 覆盖 |
| 命名 | `autoFigureName pads the page and the index` | 覆盖 |
| 文件名校验 | `figure helpers produce and validate safe file names`（summary-note） | 覆盖 |
| 真实裁剪（Poppler 可用时跑） | `pageSizePoints and cropPageRegion work when Poppler is installed` | 覆盖（本机 Poppler 存在，实跑未跳过） |
| vault 附件目录 + 复制 | `vaultFigureDir creates the attachment folder and copyFigureToVault copies into it` | 覆盖 |

### A.4 `test/ai-prompts.test.mjs`（§11-4）— 覆盖

| 契约要求 | 对应用例 | 状态 |
| --- | --- | --- |
| reviseNote 解析正常/围栏 JSON | `reviseNote parses a plain JSON answer…`、`reviseNote accepts a fenced answer and drops ids…` | 覆盖 |
| 重试与最终错误信息 | `reviseNote retries once when an annotation has no verdict, then succeeds`、`reviseNote reports a readable error when both answers are unusable`、`reviseNote requires annotations or an instruction` | 覆盖 |
| 超预算只留标注邻域 + 全部标题 | `reviseNote keeps every heading when the note is over budget` | 覆盖 |
| locateFigure 解析、clamp、过小拒绝、found=false、无视觉模型 | 6 个 `locateFigure …` 用例 | 覆盖 |
| planImagePlacement 正常/缺标题/歧义/无位置/answer 轮/非法 JSON/附件/显式 offset/越界 | 9 个 `planImagePlacement …` 用例 | 覆盖 |
| summarize 模板与 TAGS 剥离、maxFigures | `summarize uses the study-note template and strips the TAGS line`、`summarize honours maxFigures = 0 and the default of 5` | 覆盖 |

### A.5 `test/host-api.test.mjs`（§11-5）— 覆盖（37 例，端到端）

假 ctx（捕获 `webServer.register` 的 handler、脚本化 `llm.stream`、`attachments.saveImage/saveImages`、`agentDefaultModel.currentSelection`）+ 每例独立 `mkdtemp` 临时 dataDir 与临时 vault，`autoOpenObsidian: false`（绝不拉起真实 Obsidian）。

契约 §11-5 点名的每一跳与用例对应：

| 契约点名的场景 | 对应用例（序号见文件内 test 定义顺序） |
| --- | --- |
| 生成（含占位符处理） | #1 `POST /summary generates a note, resolves figure placeholders and mirrors it into the vault`；#2 缺 PDF 时 callout 降级 |
| GET | #3 `GET /summary reports 404 before a note exists and the full payload afterwards` |
| PUT 冲突 | #5 `PUT /summary detects a stale baseVersion, honours force and re-anchors annotations`（另有 #4 空正文 400 / >400KB 413） |
| 标注保存 | #6 `annotations round-trip: valid quotes are anchored, missing quotes become orphan` |
| 修订 | #7 应用并 resolved；#8 unresolved 保持 open + 删除片段；#9 无标注无要求 400；#10 只处理选中 ids；#11 坏 JSON → SSE error 且正文不变 |
| 插图提问→回答 | #15 needs_question；#20 `place` 回答后 inserted；#21 显式锚点优先；#22 两问后强制末尾 `fallback:"end"`；#23 `force:true`；#24 过期/跨文献 404 |
| 历史恢复 | #12 列表/预览/非法与不存在 404；#13 restore 快照当前 + 拒绝穿越 |
| 路径穿越拒绝 | #14 `GET /figure` 白名单 + 穿越 400/404；#13 `..%2F..` 404 |
| vault 不可用降级 | #29 `an unavailable vault degrades to a local-only save with a noteError` |

补充覆盖（超出 §11 点名范围，均为契约语义）：#16 显式章节插入 + 双写、#17 锚点无法解析 400 且不静默回落、#18 魔数/类型/8MB 校验、#19 按模型章节而非文末、#25–#28 补图 SSE（进度/index 0 基/无占位符/陈旧偏移重扫/单图失败不中断）、#30 busy 409、#31 未知文献与非法 id、#32 断连中止（§7.2-9）、#33 页图复用（§7.4-2）、#34 notePath 与 `meta.summaryUpdatedAt`、#35 历史来源字段、#36 `afterOffset` 优先于 `heading`（§7.3-3）、#37 仅有 instruction 时作为图注。

### A.6 `test/client-sync.test.mjs`（§11-6）— 覆盖

| 契约要求 | 对应用例 | 状态 |
| --- | --- | --- |
| region 逐字一致 | `the markdown-core region in client.js is byte-identical to lib/markdown-core.js` | 覆盖（两侧各出现 1 次、字节与行数相同） |
| region 浏览器安全 | `the shared region stays browser-safe and exports the six contract functions` | 覆盖（无 export/import/require(/node:/process./window./document.，6 函数可在裸 vm 求值） |
| `t('key')` 在 zh/en 都存在 | `every locale key used by the client exists in both zh and en (spec §9)` | 覆盖（在用 325 key；zh 356 == en 356；占位符集合一致） |
| client.js 能被加载并 apply 到假 ctx | `client.js loads through window.__ModuleLoader__ and apply() runs on a fake ctx` | 覆盖（mock `window.__ModuleLoader__` + react stub，仅允许 `require('react')`；`inject=['slots','locale']`；注册 main 与 `sidebar.panellist`；locale 字典下发） |
| 路由接线 | `the registered note view is wired to the spec §7 routes` | 覆盖（§7 全部路由被引用 + `needs_question` + `fallback` 处理） |

---

## 附录 B. 上一轮：§9 交互核验（9 类）

核验方式：静态代码审查 + `test/note-render.test.mjs`(46) / `test/note-functional.test.mjs`(33) 的真实组件渲染（非浏览器点击）。行号为 `client.js` 当前版本。

| # | §9 要求 | 位置 | 结论 |
| --- | --- | --- | --- |
| 9.1 | `view='note'` 全屏视图 + 进入时加载 GET /summary + 离开确认 | `openStudyNote` 8034、渲染分支 9049、`requestBack` 5805（dirty 时 `window.confirm(t('noteLeaveBody'))`） | 有实现 |
| 9.1 | 三个入口（OverviewCard / 总结卡片 / 预览弹窗） | `onStudyNote` 8582、`openStudyNote` 8628 / 8665 / 9324 | 有实现 |
| 9.1 | 头部按钮：返回、标题、预览\|编辑、保存状态、插图、补全图片、历史、更多 | 头部 6240+；`notePreviewTab`/`noteEditorTab` 6276/6290；保存状态 6220–6228；`noteFixFigures` 6316；`noteHistory` 6338；更多菜单含「重新生成总结」「打开 Obsidian」6370+ | 有实现；「按模板重组」为契约 §0 标注的 **P1（不阻塞验收）**，未实现——见 §3 |
| 9.2 | MarkdownDoc + `data-p`/`data-block` 偏移 | `data-p` 读取 4080/4086/4108/4116，`MarkdownDoc` 由 region 内渲染器承担 | 有实现 |
| 9.2 | 选中 → 浮动工具条 → 对话框（4 色、Ctrl/Cmd+Enter、Esc） | `NoteSelectionToolbar` 4592；`NoteAnnotationDialog` 4621；4 色 `noteColorAmber/Rose/Sky/Mint` 298–301 + `noteColorLabel` 3883；Ctrl/Cmd+Enter 4674；Esc 由 `Modal` 1905/2325 统一处理 | 有实现 |
| 9.2 | 重叠标注按边界切分、后者优先、不抛错 | `buildNoteSegments` 4015（注释即「later annotations win when they overlap (spec §9.2)」） | 有实现 |
| 9.2 | 标注栏三组 + 计数 + 全部展开/收起 + 空态引导 + 定位/编辑/删除 | 三组 4874/4883/4892；`noteAnnOpen/Resolved/Orphan` 287/303/304；计数 4928；`noteAnnExpandAll/CollapseAll` 4844；空态 4868–4869（`noteAnnEmptyHint`）；`NoteAnnotationGroup` 4730 | 有实现 |
| 9.2 | 底部应用栏（N 条待应用 + 补充要求 + 应用按钮 + 禁用条件 + 完成/未处理提示 + 滚动到首处改动） | 4928–4962；禁用条件 4957 `pendingCount === 0 && !instruction.trim()`；完成/未处理 6024–6036；滚动 `scrollToAnnotation(firstId)` 6037 | 有实现 |
| 9.2 | `[p.X]` 跳回阅读视图对应页 | `onCitePage` 9057（`setView('reader')` + `scrollToPage`） | 有实现 |
| 9.2 | 图片点击放大（Lightbox） | `NoteLightbox` 4542、挂载 6661 | 有实现 |
| 9.3 | 等宽 textarea、Tab 两空格、Ctrl/Cmd+S、字数、插入图片 | `NoteEditor` 4965+；Tab 5045；Ctrl/Cmd+S 5040；字数 4998；插图按钮 5004 | 有实现 |
| 9.3 | `baseVersion` 冲突 → 409 提示「覆盖保存 / 重新载入」 | 冲突横幅 `noteConflictBody/Overwrite/Reload` 261–263；发送 location 5843/5864/5697 区段 | 有实现 |
| 9.3 | 草稿 `localStorage['dsh.literature.noteDraft.<paperId>']`（含版本号）+ 恢复/丢弃 | `noteDraftKey` 4483、`readNoteDraft`/`writeNoteDraft`/`clearNoteDraft` 4487–4514、写入点 5695（`{markdown, baseVersion, savedAt}`，600ms 防抖 5700）、恢复横幅 5016+ | 有实现 |
| 9.3 | beforeunload 守卫 | 5723 | 有实现 |
| 9.3 | 保存后 `lost` 提示「N 条标注因改动无法定位」 | `noteAnnLost` 297/655，toast 5855–5856 | 有实现 |
| 9.4 | 插图弹窗两页签（上传 / 从 PDF 截取）+ 页码上下页 + 框选 + 说明 + 三位置 | `NoteInsertDialog` 5078；页签文案 322–323；翻页 327–328；框选 `finishCrop` 5146+；三位置 333–335 + `buildAnchor` 5182（光标处 / 指定章节 / 让 AI 决定） | 有实现 |
| 9.4 | `needs_question` 问答态（最多 2 轮 + 「让 AI 直接决定」） | 5216 `setQuestion({...round:1})`；5245 `if (status === 'needs_question' && !force && question.round < 2)`；`answerQuestion(true)` 5300（`force:true`） | 有实现（轮次协议见 §3 备注） |
| 9.4 | 补全图片 SSE 进度（第 i/N）+ 无占位符提示 | `runFigures` 6042；进度 6574 `${done}/${total}`；`noteNoPlaceholders` 355 + 6052 | 有实现 |
| 9.5 | 历史抽屉：列表（时间/字数/来源标签）+ 只读预览 + 恢复（二次确认） | `NoteHistoryDrawer` 5523；来源标签链 5554–5562；预览 `previewHistory` 6120+；恢复 `restoreHistory` 6143（`window.confirm` 6145） | 有实现（来源标签缺陷见 §3-1，已由 t7 修复） |
| 9.6 | 样式追加在 CSS 末尾、`lr-note-*`/`lr-ann-*`、三主题、1100/900/620 响应式 | CSS 末尾 10011+；`@media(max-width:1100px)` 10333、`900px` 10341、`620px` 10353；窄屏标注栏转覆盖层 + scrim 10226 | 有实现 |
| 9.6 | 正文解析 `useMemo` | `entries`/`segments` 4420/4431、`parsed` 5654、`openAnnotations`/`orphanCount` 5784/5788 | 有实现 |

---

## 附录 C. 上一轮：已知未覆盖 / 已知偏差

### C.1 未覆盖的断言

1. **真实浏览器交互未验证**：§9 的交互核验只做到「源码 + 组件树渲染」，没有 Playwright/Chromium 级别的真实点击、拖拽框选、localStorage 刷新恢复验证（client-editor 在 t4 自测时做过截图核对，qa 未独立复验）。
2. **Poppler 缺失路径走 `t.skip`**：本机 Poppler 存在，所以 `cropPageRegion` 分支是实跑的；但若 CI 无 Poppler，`test/figures.test.mjs` 的真实裁剪与 `host-api` 的三个裁剪用例会整体跳过（`hasPoppler()` 门控，符合契约 §11-3「Poppler 可用时跑」，但**跳过时不算覆盖**）。
3. **§7.4 `ensurePageImage` 的渲染失败分支**：只覆盖了「已有页图直接复用」（#33），未覆盖「页图存在但损坏/过小 → 重新渲染」的负向分支。
4. **客户端 offset 过期在 `place` 路由**：`place` 的 `afterOffset` 越界回退只在 `planImagePlacement` 单测（ai-prompts）覆盖，host 路由层没有单独断言。
5. **§7.3 第 5 条「插入后 Obsidian 同步失败」**：插图成功的 notePath 有断言，#29 覆盖了 vault 全不可用，但「vault 存在、单次写入失败」的中途降级没有单独构造。
6. **`/summary/revise` 的 `figure` 进度事件**：`revise` 内部也会补图（§7.2-7），但该 SSE 分支的 `figure` 事件没有在 host 层断言（`figures` 路由已覆盖同类事件形状）。

### C.2 契约与实现的偏差（均已修复或判定为非阻塞）

1. ~~`GET /summary/history` 列表缺 `source` 字段~~ → **已修复（t7）**：`lib/summary-note.js` 现为每个快照写 `.json` 边车，`listHistory` 返回 `{stamp, updatedAt, chars, source}`；`generate`/`auto` 归一为 `summary`，与 `client.js:5554` 的标签链对齐。`test/summary-note.test.mjs` 与 `test/host-api.test.mjs` #35 双端断言。
2. **`source='figures'`（补图落盘）没有专门标签**：客户端标签链只认 `manual/revision/restore/summary|auto`，补图产生的快照会显示「其他」。契约 §9.5 只列了四种来源标签，属**契约未定义**，非实现缺陷；不影响交付。
3. **问答轮次协议**：服务端在 `record.asks > 2` 时强制末尾插入（`index.js:2274`），客户端在 `question.round < 2` 时才继续追问答（`client.js:5245`），第 2 轮问题会自动走「让 AI 直接决定」按钮由用户点 `force:true`。行为与 §7.3-4「最多 2 轮、第 3 轮强制插入」一致，只是强制点落在客户端按钮而非自动续问——**判定为可接受的实现选择**。
4. **「按模板重组」**：契约 §0 明确标注 P1（不阻塞验收），未实现；头部「更多」菜单只有「重新生成总结」和「打开 Obsidian」。

### C.3 契约未点名但已额外覆盖的语义

见 A.5「补充覆盖」段落（魔数校验、8MB 上限、busy 409、断连中止、页图复用、`afterOffset` 优先级、`meta.summaryUpdatedAt`、历史来源、instruction 作为图注等）。t5 期间发现并已由对应成员修复的问题：图注优先级（t6）、历史来源（t7）、vault 路径重复拼接 NOTES_FOLDER（t3 → qa 测试修正）。

---

## 附录 D. 上一轮总评（总结编辑器）

**pass-with-notes（可交付）**

- 契约 §11 六类测试全部存在且全绿；`node --test` 185/185、`node --check` 12/12。
- §7 全部 12 条路由都有端到端断言，§9 九类交互全部有实现（「按模板重组」除外，契约明示 P1 不阻塞）。
- 阻塞项 **0**。遗留项均为「未覆盖的边界断言」与「契约未定义的展示细节」，不影响功能正确性，已如实列在附录 C。
