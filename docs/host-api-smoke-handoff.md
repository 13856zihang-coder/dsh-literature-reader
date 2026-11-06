# host-api 冒烟断言清单（交接给 qa）

> 临时脚本位置：`C:\Users\黄梓航\AppData\Local\Temp\lr-smoke\smoke.mjs`（**不要入库**，结构仅供思路参考）
> 45 项断言，全部在 `os.tmpdir()` 内运行，未写入 `D:\note` / `D:\DSH-Literature`。

## 给 qa 的提醒（务必先读）

1. **以 `docs/summary-editor-spec.md` §7 的语义自己写断言**，不要把这份清单当成真理。
   下面列的是「我在实现里验证过什么」，不是「契约要求什么」；若两者有出入，以契约为准并报给 captain。
2. 不要照搬我的脚本结构。我的脚本是单文件顺序执行、用共享的可变状态串起来的，适合冒烟不适合回归。
   建议 qa 用 `test/helpers.mjs` 起一个 `apply(fakeCtx, config)` 实例 + `mkdtemp` 临时 dataDir/vault，每个 case 独立。
3. 我的脚本会**跳过**真实 Poppler 相关断言（无 Poppler 时 `GET /figure serves image with type` 直接记 PASS）。
   真实裁剪请按契约 §6 用 `hasPoppler()` 守卫 skip。
4. 我的 `scripted` 假 LLM 队列是「一次 `runText` 弹一条」，`reviseNote` / `planImagePlacement` 解析失败会重试一次，
   所以喂坏 JSON 时要推**两条**（见下面 §revise 失败用例）。

---

## 一、POST /summary（生成，SSE）

| # | 断言 | 分支 |
|---|---|---|
| 1 | 返回 200 且 `Content-Type` 含 `event-stream` | 成功 |
| 2 | `done` 事件含数组型 `figures` 与 `figureFailures`（契约 §7.1 扩展） | 成功 |
| 3 | 本地 `summary.md` 已写入正文 | 成功 |
| 4 | Obsidian 笔记已创建且含正文 | 成功 |
| 5 | 笔记保留 frontmatter（以 `---\n` 开头）与 `> [!info] 来源` 脚注 | 成功 |
| 6 | 正文中不再残留 `[[FIGURE`（占位符已解析为图片或 callout） | 成功 / 失败降级 |

## 二、GET /summary

| # | 断言 | 分支 |
|---|---|---|
| 7 | 200，含 `markdown: string`、`version: string`、`annotations: array`、`note.exists === true` | 成功 |

> 另需补：无总结时 → 404「还没有生成总结」（我脚本因先跑了生成未覆盖这条，**qa 应补**）。

## 三、PUT /summary

| # | 断言 | 分支 |
|---|---|---|
| 8 | `baseVersion` 过期且无 `force` → 409，且 `conflict === true`、响应带当前 `markdown` | 冲突 |
| 9 | `force: true` → 200，`ok === true`，`lost` 为数组 | 强写 |
| 10 | 写入后 `version` 相对旧值改变 | 成功 |

> 另需补：空正文 → 400；> 400KB → 413（我脚本未覆盖，**qa 应补**）。

## 四、PUT /summary/annotations

| # | 断言 | 分支 |
|---|---|---|
| 11 | 200，标注落盘且 `start` 被重新锚定到当前正文的真实位置 | 成功 |
| 12 | quote 在正文中不存在 → 200，且该 id 出现在 `orphans`，`status` 变 `orphan` | 失效 |

## 五、POST /summary/revise（SSE）

| # | 断言 | 分支 |
|---|---|---|
| 13 | 200，流中出现 `"type":"done"` | 成功 |
| 14 | `done.markdown` 含 `edits` 的替换文本，`applied.length === 1` | 成功 |
| 15 | 对应标注变为 `resolved`（`status === 'resolved'`） | 成功 |
| 16 | 模型返回不可解析 JSON（推 2 条坏响应）→ 出现 `{type:'error'}`，`message` 匹配 `/无法使用/` | 失败 |
| 17 | 失败后正文与调用前**逐字一致**（不落盘半成品） | 失败 |

> 另需补：无标注且无 `instruction` → 400；`ids` 只处理选中子集；`replacement: ''` 应删除该片段；
> AI 返回 `unresolved` 的标注保持 `open` 且写 `reply`（我脚本只覆盖了成功与模型崩两条，**qa 应补**）。

## 六、历史

| # | 断言 | 分支 |
|---|---|---|
| 18 | `GET /summary/history` → 200，`versions` 为数组，元素含 `stamp/updatedAt/chars` | 成功 |
| 19 | `GET /summary/history/:stamp` → 200，含 `markdown/stamp/chars/updatedAt`，`stamp` 原样回显 | 预览成功 |
| 20 | 不存在的合法 stamp → **404** | 预览缺失 |
| 21 | 格式非法 stamp → **404**（契约 §7.1 明确要求 404，不是 400） | 预览非法 |
| 22 | `POST …/:stamp/restore` → 200，含 `ok/markdown/version` | 恢复成功 |
| 23 | 路径穿越 stamp（`..%2F..%2Fmeta`）→ 400 或 404 | 恢复拒绝 |

> **注意 21 vs 23 的差异**：预览是读操作，非法输入也归 404；restore 是写操作，保持 400（captain 已确认不要统一）。
> 另需补：restore 后应**再产生一份当前正文的快照**（恢复前快照，可再恢复回去），我脚本未断言。

## 七、GET /figure/:name

| # | 断言 | 分支 |
|---|---|---|
| 24 | 合法图片名 → 200 且 `Content-Type` 为 `image/png` 或 `image/jpeg` | 成功（我的脚本在无 Poppler 时跳过） |
| 25 | `..%2Fmeta.json` → 400 或 404 | 穿越拒绝 |
| 26 | `meta.json`（非白名单）→ 400 或 404 | 白名单拒绝 |

## 八、POST /summary/images

| # | 断言 | 分支 |
|---|---|---|
| 27 | 无 anchor 且模型返回 `ask` → 200，`status === 'needs_question'`，含 `imageId` | 提问 |
| 28 | 带 `anchor.heading` → 200，`status === 'inserted'` | 显式锚点成功 |
| 29 | `anchor.heading` 在正文中不存在 → **400**（契约 §7.3 第 2 条禁止静默回落） | 显式锚点失败 |
| 30 | `dataUrl` 是纯文本 → 400 | 非图片 |
| 31 | GIF（`image/gif`）→ 400 | 类型不支持 |
| 32 | 模型返回 `ask` → 200 + `needs_question` + 有 `question` 文案 | AI 提问 |
| 33 | 模型返回 `action:'insert'` 且只给 `heading` → 图片落在**该章节内**（不在文末） | plan 按章节 |
| 34 | 同上响应**不带** `fallback` 字段 | plan 有锚点 |
| 35 | 模型返回 insert 但锚点全无效 → 归一成 `needs_question`（因 `lib/ai.js` 会归一） | plan 无锚点 |

> 另需补（我脚本未覆盖但契约要求）：解码后 > 8MB → 413；声明 `image/png` 但内容为 JPEG → 400（魔数不一致）；
> 双写：本地 `figures/` 与 vault `_附件/<paperId>/` 都存在该文件；无 vault 时降级只写本地且正文链接仍为相对路径。

## 九、POST /summary/images/:imageId/place

| # | 断言 | 分支 |
|---|---|---|
| 36 | 带 `heading` → 200，`status === 'inserted'`，正文含 caption 文本 | 显式锚点 |
| 37 | 模型再次 `ask` → 200，`status === 'needs_question'`，`round === 2` | 第二轮提问 |
| 38 | 第三轮仍 `ask` → 200，`status === 'inserted'`，`fallback === 'end'` | 强制回退 |

> 另需补：`force: true` → 直接 inserted + `fallback:'end'`；过期/跨文献 imageId → 404「图片已过期，请重新插入」。

## 十、POST /summary/figures（SSE）

| # | 断言 | 分支 |
|---|---|---|
| 39 | 无占位符 → 200，`done` 含 `created: []`、`failed: []` | 空集 |
| 40 | 有占位符 → `done.total >= 1` 且 `created.length >= 1` | 成功 |
| 41 | `figure` 事件条数 === `done.total`，每个含 `index/total/page/ok/name/reason` | 进度事件 |
| 42 | 客户端传入**陈旧** `placeholders`（区间已不覆盖 `[[FIGURE`）→ 服务端回退重扫，`total >= 1` | 陈旧偏移 |
| 43 | 陈旧偏移**不会**把图片插进无关文本（正文开头逐字未变） | 安全 |

> 另需补：单图失败不中断其余占位符；失败占位符替换为契约 §3.2 的两行 callout；
> 事件 `index` 是 **0-based** 且带 `total`（client.js 按 `index + 1` 渲染）。

## 十一、无 vault 降级

| # | 断言 | 分支 |
|---|---|---|
| 44 | vault 路径不存在时 `PUT /summary` → 200，`ok === true`，`noteError` 非空 | 降级 |
| 45 | 尽管如此本地 `summary.md` 仍写入成功 | 降级 |

---

## 快速提取原始断言名

```bash
grep -n "^check(" "C:/Users/<you>/AppData/Local/Temp/lr-smoke/smoke.mjs"
```
