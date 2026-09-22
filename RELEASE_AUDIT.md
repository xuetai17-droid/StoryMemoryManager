# v0.11.40 HYBRID Release Audit

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
