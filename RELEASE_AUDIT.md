# v0.11.35 HYBRID Release Audit

- 基线：v0.11.34 HYBRID；assistant-only、本地 deferred、月份精度、双时间轴、0 API、30 条批次与 524 保底均保留。
- manifest version 与两个可见徽标：0.11.35。
- 问题复现：角色回复已有完整可视摘要，但它使用通用“摘要”面板且可能位于 `<content>` 外；旧解析器丢弃该面板后，只从普通正文抽取零散句。
- 新解析边界：只从 assistant 原始回复读取有摘要标题且带时间/人物元数据的区块；提示模板、脚本、样式和状态栏非事实字段不进入事件。
- 摘要保真：保存完整摘要正文（上限 800 字）及 `recap_start_date` / `recap_end_date`；时间线以范围末日归档。
- 优先级：结构化摘要/角色卡摘要 > assistant 已确认事实句 > deferred；user 仅用于回显检测，永不直接持久化。
- 旧数据迁移：仅替换 v0.11.35 以前的 `local_zero_api` 行，按原 source 重读 assistant 回复；AI/导入数据、story start、人物关系和游标保持不变。
- 阶段派生数据：受旧条目影响的本地阶段总结随 canonical timeline 重建；仍有 deferred 时移除失去依据的本地阶段结论。
- 状态白名单：仍只接收 `<status>` 中时间与可判定地点；内心、真我、待办、弹幕和头条不进入 timeline/event。
- API 与 JSONL：摘要读取与迁移均为 0 API；不写入、删除或改动原始聊天 JSONL。
- 验证：JS syntax、manifest JSON、v0.11.27、v0.11.29/v0.11.32、v0.11.33、v0.11.34 与 v0.11.35 回归均通过；ZIP 保持六文件清单并复验完整性。
