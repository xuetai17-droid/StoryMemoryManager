# v0.11.52 HYBRID Release Audit

## v0.11.52 traceable timeline recovery audit

- Trigger observed: HTTP 200 / usable JSON for batch `#36-#45`, followed by zero traceable timeline nodes and cursor preservation.
- Relative sources are mapped only when every referenced ordinal fits the current batch size; dates and out-of-range values are rejected.
- Timeline recovery only accepts entries carrying a source that resolves inside the current batch.
- Recovery priority: events → semantic anchors → facts → relationships → NPC summaries; maximum 12 recovered nodes.
- The recovered delta still passes the unchanged commit validator. Zero-source responses remain rejected; no second API request exists in the recovery path.

## v0.11.51 malformed JSON audit

- Trigger observed: `Expected ',' or ']' after array element ... position 865` after a successful paid response.
- Repair order: strict `JSON.parse` → existing safe string repair → iterative delimiter/bracket repair.
- The iterative stage uses the engine-reported error position and JSON structural stack; it does not call any model or API.
- Valid JSON is never rewritten. A repaired object still passes the unchanged summary sanitizer, source validation, commit validation, merge rollback, and cursor rules.

## v0.11.50 strict direct-API audit

- Reference reviewed: Memory Palace commit `9d291e9be16d114f1a5a2ff27a1d19a9da4b983c`; its external summary path uses plain fetch, a merged user message, optional model, and no plugin timeout.
- SMM direct body now has only `messages` plus optional `model`; credentials remain headers only and are never logged.
- SMM no longer applies the 120-second outer Promise timeout or AbortController timeout to direct external summaries.
- Direct prompt is an incremental delta prompt. Historical ceiling is 15 messages with a 36,000-token / 144,000-byte target; routine ceiling remains ten.
- Exactly one request per accepted click. HTTP errors, gateway HTML, non-JSON, invalid summary JSON, and validation failures do not merge memory or advance the cursor.
- Cloudflare 520/524 remains an upstream host failure and cannot be repaired client-side.

## v0.11.49 adaptive request audit

- Historical candidate window: at most 30 messages.
- Routine automatic candidate window: at most 10 messages.
- Actual range is selected locally against the fully assembled compact-skeleton request, targeting 28,000 estimated input tokens / 112,000 bytes.
- A single oversized message remains sendable because the user-requested fee guard is disabled.
- Accepted clicks immediately disable the action button and expose the exact range/count/estimate.
- Exactly one generation call per accepted click; no automatic retry, split retry, fallback, memory write, or cursor advance on failure.

## v0.11.48 30-message catch-up audit

- Historical catch-up batch size is fixed at 30 while routine automatic batches remain 10.
- A 147-message snapshot resolves as 30 + 30 + 30 + 30 + 27.
- Existing per-chat snapshot and checkpoint metadata from v0.11.46/v0.11.47 are reused without reset.
- Disabled cost-protection behavior, one-request-per-click, transaction boundaries and automatic pause remain unchanged.

## v0.11.47 disabled cost-protection audit

- Request-size statistics remain visible, but no token or byte threshold blocks transmission.
- Profile and direct-API circuit-open checks always remain false under the explicit disabled policy.
- All previous circuit state is cleared on migration; configuration verification remains required.
- Transport, JSON and commit failures do not lock the provider and do not trigger an automatic retry.
- Cursor, memory and historical catch-up checkpoints still advance only after a valid transactional commit.

## v0.11.46 historical catch-up audit

- The first manual paid action snapshots the current chat's pending end index into chat metadata.
- While the snapshot remains active, each manual click selects at most 50 messages and performs one completion request.
- A 147-message snapshot resolves as 50 + 50 + 47; only successful transactional commits advance the stored checkpoint.
- Messages appended after the snapshot are excluded from historical batches.
- Automatic paid generation is paused during catch-up and resumes at 10 pending messages only after the snapshot is complete.
- Cancellation, local size rejection, transport failure, invalid JSON and commit rejection preserve both cursor and catch-up state.

## v0.11.45 batch policy audit

- First successful manual paid catch-up selects exactly the next 50 messages and still performs one completion request.
- The exact request size and source range are shown before transmission; cancellation performs zero completion calls.
- The one-time path has an absolute 120,000-token / 480,000-byte local ceiling; routine requests keep the 30,000-token / 120,000-byte guard.
- The one-time flag is cleared only after a successful transactional commit. Failure, cancellation and local rejection preserve it.
- After success, paid manual and automatic summaries use 10-message batches; automatic triggering waits for 10 pending messages.
- Local simulations cover ordinary-limit rejection, one-time confirmation, cancellation, absolute-limit rejection and policy constants.

## v0.11.44 recap clock audit

- Parses labelled assistant recap ranges such as `2026-09-20 07:51—23:47`.
- Uses opening-card date/weekday/range only as fallback and rejects ordinary message timestamps.
- End-of-reply structured recap wins when opening and recap ranges conflict.
- Existing timeline rows are recalibrated locally through a cache-version bump; no API request or cursor movement is involved.

## v0.11.43 model discovery audit

- `/models` can be fetched with endpoint and key only; no model ID or completion request is required.
- A model can be selected only from the current fetched list, after which the existing verified fingerprint gate is enabled.
- Endpoint or key changes clear cached models and prior verification.
- Nested direct-API controls have explicit full-width mobile layout rules.

## v0.11.42 direct API audit

- Direct transport mirrors Memory Palace's OpenAI-compatible `/chat/completions` approach and bypasses Connection Manager conversion.
- `/models` verification sends no completion request and is invalidated whenever endpoint or model changes.
- Completion body is restricted to `messages` plus `model`; one click can send at most one six-message paid batch.
- Transport, gateway, parse and commit failures preserve the cursor and open the selected provider circuit breaker.
- Existing memory schema, chat metadata and original JSONL are unchanged.

- 事故依据：`api.astroflowing.com` 返回 Cloudflare 520，浏览器与 Cloudflare 正常、Host Error；请求无有效输出但供应商已计费。
- 一键一调用：独立 Profile 的普通总结按钮即使由手动 force 路径触发，也会在第一个批次后退出；静态回归检查覆盖循环守卫。
- 批次整形：独立 Profile 每批上限 6 条，输入 30,000 tokens / 120,000 bytes，输出 3,072 tokens。
- 错误识别：递归提取嵌套错误对象，覆盖 Cloudflare 520–526 HTML、状态码和文案；Connection Manager 仅返回通用 `API request failed` 时仍执行通用熔断。
- 持久熔断：400、520–526、超时、空响应、非 JSON、source/提交失败均锁定当前 Profile；锁定检查位于 `sendRequest` 之前。
- 解锁边界：设置页手动解锁只修改本地设置，不发起 API；切换到不同 Profile 不继承另一个 Profile 的活动锁，但该 Profile 一旦失败会单独成为当前锁定目标。
- 事务边界：失败不合并记忆、不推进游标、不隐藏楼层；原始聊天 JSONL 不读写。
- 模拟验证：成功、发送前拦截、3,072 输出上限、400、嵌套 HTML 520、524、超时、非 JSON、锁定后二次点击零调用、手动解锁全部通过。

## v0.11.40 历史审计

- 根因修复：完整 JSON Schema 不再进入模型请求；改为按 required 字段生成紧凑单行 JSON 骨架。
- 发送前保护：请求在本地按字符类型估算 token，并计算 UTF-8 bytes；超过 42,000 tokens 或 160,000 bytes 时在 `sendRequest` 前抛出专用错误，提示未调用 API、未扣费。
- 输出保护：独立 Profile 输出上限硬锁 6,144 tokens，设置页与旧设置迁移同步收紧。
- 单次调用：删除独立 Profile 的自动 fallback；删除 source 失败后的自动拆分和 timeline 二次生成。一个批次一次请求，任何失败都等待用户手动重试。
- 事务保护：解析和校验仍位于 merge/游标推进之前；400、524、超时、空响应、非 JSON、source 越界均不会写入 canonical memory 或推进游标。
- 配置保留：不修改 API 地址、密钥、Connection Profile、选中 Profile、既有长期记忆或原始聊天 JSONL。
- 更新配置：manifest 版本为 0.11.40，`homePage` 指向 `https://github.com/xuetai17-droid/StoryMemoryManager`，`auto_update` 为 true。
- 本地验证：覆盖紧凑骨架体积、发送前阻止、输出上限、成功单次调用、400/524/超时/非 JSON 单次失败与游标/记忆不变。

## v0.11.39 历史审计

- 触发问题：独立 API 已连通，但上游把 Connection Manager 的通用 `json_schema` 转成 Gemini `generation_config.response_schema`；其中 `type:["string","null"]` 等标准 JSON Schema 写法不被其 Proto Schema 接受，返回 HTTP 400。
- 请求修复：独立 Profile 的 override payload 固定为空，不再发送 provider-specific `json_schema` / `response_schema`；完整 Schema 仅作为提示词内容发送。
- 安全边界：响应仍经过本地 JSON 解析、清理、source 楼层约束与 batch commit 校验，只有 timeline 非空且可追溯时才推进游标。
- 请求次数：每批一次；未增加修复请求、自动重试或付费 fallback。若用户明确开启回退，当前聊天模型会收到同一完整 Schema。
- 配置保留：不修改 Connection Profile、API 地址/密钥、SMM Profile 选择、已有记忆、隐藏状态或原始 JSONL。

- 变更范围：仅优化总结方式控件及其状态展示；不触碰 canonical memory、时间线、楼层处理游标、隐藏逻辑或原始聊天 JSONL。
- 问题根因：旧选择器使用 `flex: 1 1 220px`；移动端父容器切为纵向后，220px basis 变成垂直尺寸，叠加主题样式后形成巨型空白框。
- 尺寸约束：原生设置页选择器强制 `flex:none`，桌面高度 42px、窄屏高度 40px，并固定 min/max-height，避免第三方主题再次拉伸。
- 信息层级：总结方式以紧凑卡片显示；徽标区分 AI 语义、独立 API、实验模式，帮助文字保留失败不写入提示。
- 状态同步：Connection Profile 的创建、选择、更新与删除事件会同时刷新 Profile 控件、徽标、总结按钮和统计文字。

- 基线：保留时间/地点追踪、双时间轴、月份精度、注入诊断、阶段大总结与 JSONL 保护。
- 参考实现：核对 SillyTavern Memory Palace 的分批结构化总结、主要角色判定、NPC 独立存储和按命中注入逻辑。
- 总结运输：当前通道使用一次 `generateQuietPrompt({quietPrompt})`；同一提示词含系统规则、完整 JSON Schema、已有可靠记忆、人物/NPC 分类参考及 USER/CHARACTER 真实楼层。
- 总结质量：明确要求语义合并、关键行动/因果/结果和独立可理解事件；禁止逐楼复制玩家输入或把玩家提议直接写成完成事实。
- NPC 分区：`npcs` 与 `characters` 分离，只保存 identity/brief/current_status/aliases/source；写入前再次校验主要角色和本批 source。
- 主要角色保护：当前玩家与当前角色永不进入 NPC；角色卡/世界书候选名必须在真实正文反复出现；模型误分项会被拒绝或修回主要人物表。
- 注入控制：NPC 只有在最近正文或当前场景命中姓名、身份或别名时才发送，最多 6 个。
- 提交事务：JSON、本批 source 与 timeline 校验通过后才合并并推进 `last_processed_index`；NPC 越界 source 单独拒绝。
- 失败事务：空响应、非 JSON、524、120 秒超时和 timeline source 校验失败均不写入、不推进游标、不切换本地模式。
- UI/兼容：记忆浏览、搜索、统计、注入诊断、导入和 v4 兼容视图均包含 NPC 分区。
- 版本：源码头、两处界面徽标与 manifest 均为 0.11.39。
- 验证：JS 语法、manifest JSON、v0.11.27、v0.11.29/v0.11.32、v0.11.33、v0.11.34、v0.11.36、v0.11.37、v0.11.38、v0.11.39 回归通过；v0.11.35 的“摘要面板自动成为 canonical timeline”测试已由 v0.11.36 的安全策略明确取代。
- 原始数据：测试与迁移均不写入、删除或改动原始聊天 JSONL。
