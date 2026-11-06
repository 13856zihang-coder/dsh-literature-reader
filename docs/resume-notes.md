# 续作存档（2026-11-05 夜 · 暂停）

> 用户要求暂停，明天继续。本文记录「已完成 / 待办 / 如何续跑」，供下次会话直接接续。
> 契约文件：`docs/summary-editor-spec.md`（已按实现更新，含新增的 `GET /summary/history/:stamp` 与两处语义澄清）。

## 一、当前状态快照

```
node --test  →  168 tests（t5/t8 仍在补测试，最终数字待定）
node --check →  index.js、client.js、lib/*.js 全部通过
markdown-core region 与 client.js 内粘贴副本：byte-identical
git：未 commit，工作区即交付物
```

### 真实端到端验证（2026-11-06，已通过）

用真实文献 `altera-eq-1-mw0f73ck-3603c5`（Stratix IV GX 应用笔记，16 页）对运行实例
`http://127.0.0.1:58117` 做了两轮真实验证，脚本保留在 `scripts/`：

| 脚本 | 结果 | 验证内容 |
| --- | --- | --- |
| `scripts/live-check.mjs <id>` | 9/9 | 只读路由、穿越防护、404 语义 |
| `scripts/live-check.mjs <id> --apply` | **20/20** | 真实生成学习笔记 |
| `scripts/live-revise.mjs <id>` | **14/15** | 标注→应用修改→历史→恢复 |

实测数据：
- 生成耗时 95 秒 / 14 个 SSE 事件，**5 张图全部成功截取、0 失败**
- 模板完整：`[!abstract]` 速览 + 10 个章节（研究背景 / 核心思想 / 方法 / 实验 / 结论 / 我的理解 / 可迁移 / 复习自测 / 待解决 / 术语表）
  - ⚠️ 该结构已于同日废弃（v2 定位变更）：总结改为速览型，最终形态为 速览 / 这篇文献讲了什么 / 核心方法 技术点 / 关键结论 / 论文未解决的问题 / 已弄懂的知识点 / 名词解释。「需要注意」板块后来也被去掉，局限判断融入正文。上面的实测数据记录的是 v1 那一轮。
- 图片裁剪经人工目视确认**精准命中**（Figure 2 数字滤波器框图、Figure 13 四条眼图曲线，含图注与坐标轴，无多余内容）
- 图注取自正文占位符（`图 2 Pre-Emphasis Digital Filter` 等），t6 的修复在真实链路上生效
- 标注锚定精确（`918..948`、`8377..8407`）
- **核心行为验证**：保存标注后正文逐字不变（12552 → 12552）
- 修订：2 条标注全部应用，AI 给出可读理由，正文 12552 → 12713，标注转 `resolved`
- 历史恢复：正文正确回滚，vault 笔记保留 frontmatter 与「来源」页脚

**AI 的诚实行为（值得记录）**：第一轮我给的标注是「补充一个具体数值」，AI **拒绝执行**并说明
「没有可确认的数值和图号，补入 p.10 的 3.25 GHz/–16.5 dB 会改变原句语境，因此不硬改」，
该标注保持 `open` 并写入 `reply`。这证明 `reviseNote` 不会为了讨好用户而编造事实。

### 唯一未通过项（已定位，非代码缺陷）

`live-revise.mjs` 报 `history version carries a renderable source label → undefined`。
根因：**t7 的修复是在 DSH 进程启动之后写入磁盘的**，运行中的实例仍持有旧的
`lib/summary-note.js` 模块。磁盘上的实现已验证正确（`listHistory` 返回 `source`，
`<stamp>.json` 边车由 `snapshotCurrent` 写入）。**重启 DSH 后即可生效**。

改动文件：
- 修改：`client.js`、`index.js`、`lib/ai.js`、`lib/obsidian.js`、`README.md`、`cordis.patch.yml`
- 新增：`lib/markdown-core.js`、`lib/summary-note.js`、`lib/figures.js`
- 新增测试：`test/{markdown-core,summary-note,figures,ai-prompts,host-api,client-sync,note-render,note-functional}.test.mjs`、`test/helpers.mjs`
- 新增脚本：`scripts/live-check.mjs`、`scripts/live-revise.mjs`（真实链路验证，可重复使用）
- 文档：`docs/summary-editor-spec.md`、`docs/host-api-smoke-handoff.md`、`docs/resume-notes.md`

## 二、已完成的任务（团队 t1–t4、t6）

| 任务 | 负责人 | 交付 |
| --- | --- | --- |
| t1 纯逻辑 | core-logic | `lib/markdown-core.js`（6 个纯函数，region 可裸粘贴）、`lib/summary-note.js`（读写/版本/历史/标注锚定）、`lib/figures.js`（页尺寸/bbox 换算/pdftoppm 裁剪）+ 23 项测试 |
| t2 提示词层 | ai-prompts | `lib/ai.js`：新学习笔记模板（10 小节）、`summarize(maxFigures)`、`reviseNote`、`locateFigure`、`planImagePlacement`、`runJson`（2 次重试）+ 22 项测试 |
| t3 Host 路由 | host-api | `index.js` 12 条路由、`lib/obsidian.js` `updateSummaryNote` |
| t4 笔记视图 | client-editor | `client.js` +4335 行：NoteView、MarkdownDoc、框选标注、应用修改、编辑模式、插图、历史 |
| t6 图注缺陷 | host-api | `index.js` 图注优先级修复（占位符图注优先于视觉模型短标签） |
| t5 质量验收 | qa | **进行中**，见下节 |

## 三、t5（QA 质量门）未完部分

已落地的测试资产（均已入库、全绿）：
- `test/helpers.mjs`（12.8KB）：假 ctx、临时 dataDir/vault、SSE 响应封装
- `test/host-api.test.mjs`（40KB，31 例）：覆盖全部 12 条路由的成功与失败分支，含 409 冲突、force、标注 orphan、revise 的 applied/unresolved/skipped、历史恢复防穿越、图片魔数与 8MB 超限、显式锚点 400 不静默回落、place 两轮后 `fallback:'end'`、figures 忽略陈旧 offsets 与单图失败不中断、vault 降级、busy 并发阻断
- `test/client-sync.test.mjs`（11.5KB）：region 逐字一致、zh/en 双向齐全、mock ModuleLoader + react stub 加载并 apply

**暂停时 t5 的状态**：`in_progress`（QA 收尾回合被用户暂停打断，未提交最终报告）。
**注意**：t5 当前是 `in_progress` 而非 failed。下次续跑时先 `agent_teams_status` 看它是否已变成 failed/idle；若仍是 in_progress 但成员 idle，用
`agent_teams_reassign_task({ task_id: 't5', assignee: 'qa', reason: '继续未完成的验收' })` 重新接管即可（reassign 会吊销旧 attempt）。

**QA 真正还没做完的事**（下次可直接交给 qa）：
1. 出一份正式的「契约 §11 覆盖矩阵」：逐条对比 §11 要求的 6 类测试与实际断言，标出缺项。
2. 逐条核对契约 §9 的 9 类交互（预览/标注/标注栏/应用栏/编辑/插图/补图/历史/响应式）与 client.js 实现的对应关系——**这部分目前只有 client-editor 的自述，没有独立核验**。
3. 最终全量回归报告（含 node --check 全文件）。


## 四、下次如何续跑

1. **恢复团队**：`agent_teams_status` 查看 t5 状态；t5 已被 QA 置为 failed（刻意为之，以便可重新派发）。
2. **重派 t5**：`agent_teams_reassign_task({ task_id: 't5', assignee: 'qa', reason: '继续未完成的验收：先读上一次 output 的未完成清单，逐条补齐' })`。
   - 若 qa 成员已不在（隔天会话成员可能需重建），先 `agent_teams_add_member` 加回 qa，再派发。
3. qa 完成后：跑最终全量验证（见第五节），然后由 Lead 做交付说明。
4. 全部通过后，按用户意愿决定是否 commit（**当前明确未 commit**）。

## 五、最终验收清单（Lead 亲自复核）

```bash
node --test                 # 期望 96+ 项全绿
node --check index.js
node --check client.js
node --check lib/ai.js
node --check lib/obsidian.js
node --check lib/markdown-core.js
node --check lib/summary-note.js
node --check lib/figures.js
```

外加：
- region 逐字同步（`lib/markdown-core.js` 与 `client.js` 内副本）
- zh/en 文案 key 双向齐全
- `client.js` 能被 mock 的 ModuleLoader 加载并 `apply` 不抛错（client-sync 测试覆盖）

## 六、尚未做的收尾事项

- [ ] t5 完成 QA 最终验收
- [ ] Lead 整体集成复核（可能需要人工在浏览器里实际点一遍：标注→应用修改→编辑→插图）
- [ ] 决定是否 git commit（当前未 commit，用户未指示）
- [ ] `.tmp-note/`（client-editor 脚手架，已被 .gitignore 忽略）可清理
- [ ] 插件是否需要重新安装/重启才能生效——注意：本插件以 link 方式安装（`link:F:/dsh/dsh-literature-reader`），改动后**需重启 DSH 或重载插件**才会在 Web GUI 生效；重启需用户明确同意

## 七、重要背景（供下次会话参考）

- 本次开发**从未**触碰真实 vault `D:\note` 与 `D:\DSH-Literature`，所有测试用 `os.tmpdir()`。
- 真实 Poppler 裁剪测试已实际跑通（非跳过）。
- 三次网络中断（PI_AI_ERROR / TRANSPORT）导致回合丢失，但产物均已落盘；恢复策略是「核对已落盘产物 → 只补缺口 → 不重写」。
- 用户的两个明确决策：笔记采用**全屏「学习笔记」视图**；标注**立即保存到本地并保留到下次打开**。
