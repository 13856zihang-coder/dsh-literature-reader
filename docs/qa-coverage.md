# t5 QA 覆盖矩阵（契约 §11）

工作目录：`F:\dsh\dsh-literature-reader`　契约：`docs/summary-editor-spec.md`
作者：qa　最近更新：2026-11-06

实测基线（本机，工作区根目录）：

```
node --test  →  tests 185 / suites 25 / pass 185 / fail 0 / cancelled 0 / skipped 0
node --check →  index.js client.js lib/{ai,summary-note,figures,markdown-core,
                obsidian,pdf,util,vault,words,settings}.js   12/12 OK
```

按文件分布：

| 测试文件 | 用例数 | 归属 |
| --- | --- | --- |
| `test/markdown-core.test.mjs` | 9 | core-logic (t1) |
| `test/summary-note.test.mjs` | 12 | core-logic (t1) |
| `test/figures.test.mjs` | 6 | core-logic (t1) |
| `test/ai-prompts.test.mjs` | 22 | ai-prompts (t2) |
| `test/host-api.test.mjs` | 37 | **qa (t5)** |
| `test/client-sync.test.mjs` | 5 | **qa (t5)** |
| `test/note-render.test.mjs` | 46 | client-editor (t8) |
| `test/note-functional.test.mjs` | 33 | client-editor (t8) |
| `test/settings.test.mjs` / `test/words.test.mjs` | 7 / 7 | 既有（回归） |
| **合计** | **185** | |

---

## 1. 契约 §11 六类测试逐条对照

### 1.1 `test/markdown-core.test.mjs`（§11-1）— 覆盖

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

### 1.2 `test/summary-note.test.mjs`（§11-2）— 覆盖

| 契约要求 | 对应用例 | 状态 |
| --- | --- | --- |
| 读写 | `readSummary returns empty state until the file exists`、`writeSummary snapshots the previous body and reports a version` | 覆盖 |
| 版本号 | `summaryVersion is the first 16 hex chars of the sha256` | 覆盖 |
| 历史轮转（>30 裁剪） | `history keeps the newest 30 snapshots and lists them newest first`、`pruning removes the source sidecar together with its snapshot` | 覆盖 |
| 历史来源（§7.1） | `history snapshots keep the origin of the body they contain`、`history source labels stay renderable by the editor`、`history tolerates legacy snapshots without a sidecar` | 覆盖 |
| 标注重定位与 orphan | `anchorAnnotations re-locates open quotes and marks missing ones orphan`、`annotations round-trip, get cleaned and are capped` | 覆盖 |
| 路径穿越拒绝 | `restoreHistory snapshots the current body and rejects path traversal`、`figure helpers produce and validate safe file names` | 覆盖 |

### 1.3 `test/figures.test.mjs`（§11-3）— 覆盖（真实裁剪受 Poppler 门控）

| 契约要求 | 对应用例 | 状态 |
| --- | --- | --- |
| bbox 换算与 clamp | `bboxToPixels converts normalised boxes and applies default padding`、`bboxToPixels clamps out-of-range boxes and honours the minimum size`、`bboxToPixels rejects malformed input` | 覆盖 |
| 命名 | `autoFigureName pads the page and the index` | 覆盖 |
| 文件名校验 | `figure helpers produce and validate safe file names`（summary-note） | 覆盖 |
| 真实裁剪（Poppler 可用时跑） | `pageSizePoints and cropPageRegion work when Poppler is installed` | 覆盖（本机 Poppler 存在，实跑未跳过） |
| vault 附件目录 + 复制 | `vaultFigureDir creates the attachment folder and copyFigureToVault copies into it` | 覆盖 |

### 1.4 `test/ai-prompts.test.mjs`（§11-4）— 覆盖

| 契约要求 | 对应用例 | 状态 |
| --- | --- | --- |
| reviseNote 解析正常/围栏 JSON | `reviseNote parses a plain JSON answer…`、`reviseNote accepts a fenced answer and drops ids…` | 覆盖 |
| 重试与最终错误信息 | `reviseNote retries once when an annotation has no verdict, then succeeds`、`reviseNote reports a readable error when both answers are unusable`、`reviseNote requires annotations or an instruction` | 覆盖 |
| 超预算只留标注邻域 + 全部标题 | `reviseNote keeps every heading when the note is over budget` | 覆盖 |
| locateFigure 解析、clamp、过小拒绝、found=false、无视觉模型 | 6 个 `locateFigure …` 用例 | 覆盖 |
| planImagePlacement 正常/缺标题/歧义/无位置/answer 轮/非法 JSON/附件/显式 offset/越界 | 9 个 `planImagePlacement …` 用例 | 覆盖 |
| summarize 模板与 TAGS 剥离、maxFigures | `summarize uses the study-note template and strips the TAGS line`、`summarize honours maxFigures = 0 and the default of 5` | 覆盖 |

### 1.5 `test/host-api.test.mjs`（§11-5）— 覆盖（37 例，端到端）

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

### 1.6 `test/client-sync.test.mjs`（§11-6）— 覆盖

| 契约要求 | 对应用例 | 状态 |
| --- | --- | --- |
| region 逐字一致 | `the markdown-core region in client.js is byte-identical to lib/markdown-core.js` | 覆盖（两侧各出现 1 次、字节与行数相同） |
| region 浏览器安全 | `the shared region stays browser-safe and exports the six contract functions` | 覆盖（无 export/import/require(/node:/process./window./document.，6 函数可在裸 vm 求值） |
| `t('key')` 在 zh/en 都存在 | `every locale key used by the client exists in both zh and en (spec §9)` | 覆盖（在用 325 key；zh 356 == en 356；占位符集合一致） |
| client.js 能被加载并 apply 到假 ctx | `client.js loads through window.__ModuleLoader__ and apply() runs on a fake ctx` | 覆盖（mock `window.__ModuleLoader__` + react stub，仅允许 `require('react')`；`inject=['slots','locale']`；注册 main 与 `sidebar.panellist`；locale 字典下发） |
| 路由接线 | `the registered note view is wired to the spec §7 routes` | 覆盖（§7 全部路由被引用 + `needs_question` + `fallback` 处理） |

---

## 2. §9 交互核验（9 类）

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

## 3. 已知未覆盖 / 已知偏差（如实记录）

### 3.1 未覆盖的断言

1. **真实浏览器交互未验证**：§9 的交互核验只做到「源码 + 组件树渲染」，没有 Playwright/Chromium 级别的真实点击、拖拽框选、localStorage 刷新恢复验证（client-editor 在 t4 自测时做过截图核对，qa 未独立复验）。
2. **Poppler 缺失路径走 `t.skip`**：本机 Poppler 存在，所以 `cropPageRegion` 分支是实跑的；但若 CI 无 Poppler，`test/figures.test.mjs` 的真实裁剪与 `host-api` 的三个裁剪用例会整体跳过（`hasPoppler()` 门控，符合契约 §11-3「Poppler 可用时跑」，但**跳过时不算覆盖**）。
3. **§7.4 `ensurePageImage` 的渲染失败分支**：只覆盖了「已有页图直接复用」（#33），未覆盖「页图存在但损坏/过小 → 重新渲染」的负向分支。
4. **客户端 offset 过期在 `place` 路由**：`place` 的 `afterOffset` 越界回退只在 `planImagePlacement` 单测（ai-prompts）覆盖，host 路由层没有单独断言。
5. **§7.3 第 5 条「插入后 Obsidian 同步失败」**：插图成功的 notePath 有断言，#29 覆盖了 vault 全不可用，但「vault 存在、单次写入失败」的中途降级没有单独构造。
6. **`/summary/revise` 的 `figure` 进度事件**：`revise` 内部也会补图（§7.2-7），但该 SSE 分支的 `figure` 事件没有在 host 层断言（`figures` 路由已覆盖同类事件形状）。

### 3.2 契约与实现的偏差（均已修复或判定为非阻塞）

1. ~~`GET /summary/history` 列表缺 `source` 字段~~ → **已修复（t7）**：`lib/summary-note.js` 现为每个快照写 `.json` 边车，`listHistory` 返回 `{stamp, updatedAt, chars, source}`；`generate`/`auto` 归一为 `summary`，与 `client.js:5554` 的标签链对齐。`test/summary-note.test.mjs` 与 `test/host-api.test.mjs` #35 双端断言。
2. **`source='figures'`（补图落盘）没有专门标签**：客户端标签链只认 `manual/revision/restore/summary|auto`，补图产生的快照会显示「其他」。契约 §9.5 只列了四种来源标签，属**契约未定义**，非实现缺陷；不影响交付。
3. **问答轮次协议**：服务端在 `record.asks > 2` 时强制末尾插入（`index.js:2274`），客户端在 `question.round < 2` 时才继续追问答（`client.js:5245`），第 2 轮问题会自动走「让 AI 直接决定」按钮由用户点 `force:true`。行为与 §7.3-4「最多 2 轮、第 3 轮强制插入」一致，只是强制点落在客户端按钮而非自动续问——**判定为可接受的实现选择**。
4. **「按模板重组」**：契约 §0 明确标注 P1（不阻塞验收），未实现；头部「更多」菜单只有「重新生成总结」和「打开 Obsidian」。

### 3.3 契约未点名但已额外覆盖的语义

见 §1.5「补充覆盖」段落（魔数校验、8MB 上限、busy 409、断连中止、页图复用、`afterOffset` 优先级、`meta.summaryUpdatedAt`、历史来源、instruction 作为图注等）。t5 期间发现并已由对应成员修复的问题：图注优先级（t6）、历史来源（t7）、vault 路径重复拼接 NOTES_FOLDER（t3 → qa 测试修正）。

---

## 4. 总评

**pass-with-notes（可交付）**

- 契约 §11 六类测试全部存在且全绿；`node --test` 185/185、`node --check` 12/12。
- §7 全部 12 条路由都有端到端断言，§9 九类交互全部有实现（「按模板重组」除外，契约明示 P1 不阻塞）。
- 阻塞项 **0**。遗留项均为「未覆盖的边界断言」与「契约未定义的展示细节」，不影响功能正确性，已如实列在 §3。
