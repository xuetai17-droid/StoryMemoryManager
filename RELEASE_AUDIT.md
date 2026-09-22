# v0.11.38 HYBRID Release Audit

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
- 版本：源码头、两处界面徽标与 manifest 均为 0.11.38。
- 验证：JS 语法、manifest JSON、v0.11.27、v0.11.29/v0.11.32、v0.11.33、v0.11.34、v0.11.36、v0.11.37、v0.11.38 回归通过；v0.11.35 的“摘要面板自动成为 canonical timeline”测试已由 v0.11.36 的安全策略明确取代。
- 原始数据：测试与迁移均不写入、删除或改动原始聊天 JSONL。
