# Changelog

## 0.11.2

- 修复总结批次被 source firewall 全部拒绝、或模型返回空 timeline 时游标仍继续推进导致的 silent-drop / 时间线断档。
- 新增结构化世界状态元数据桥：`UpdateVariable/JSONPatch` 仍整体排除在 canonical 剧情正文之外，仅允许精确读取 `/世界/当前日期`、`/世界/当前时间`、`/世界/当前地点` 作为同楼回复结束状态的候选元数据。
- 当 timeline 或顶层 current story 的日期/时间为空、明确为“未明确”，或只有“下午（具体时间未明确）”这类无钟点状态时，可由同 source 的精确 HH:MM 世界状态时间补齐；不会读取或注入好感度、数值状态、Analysis 等其他变量。
- 时间证据 UI 区分“原文明确时间”与“变量状态时间”，避免把 JSONPatch 时间误标成正文原文证据。
- 修正时间连续性中的否定语义误判：例如“没有跨过午夜”不会再被识别成真实跨日证据。
- 新增本批 source 范围校验：timeline source 必须引用本批真实 #消息编号。
- 新增大段时间线覆盖缺口检测，并阻止安全记忆注入与自动隐藏跨过未修复缺口。
- 新增“补总结缺失楼层”工具：仅重做指定 #楼层区间，保留 `last_processed_index`、当前剧情日期/时间、current_scene、active_arcs、open_loops 与当前人物临时状态。
- 定向补总结使用缺口之前的历史工作记忆作为上下文，避免后续剧情状态反向污染历史修复。
- 定向补总结自动创建最近一次回滚备份，失败时恢复原记忆。

## 0.11.1

- 修正 v0.11.0 两处 UI 版本徽标仍显示 `v0.10.7` 的问题。
- 修正启动日志仍显示 `v0.10.8 loaded successfully` 的问题。
- 不修改 v0.11.0 的总结、正文净化、人物锚点、主线、物品所有权、日期、语义锚点、隐藏楼层或注入逻辑。

## 0.11.0

- 总结输入净化：优先 `<content>`，过滤 thinking / HTML 草稿注释 / 故事考据 / campus_gossip / UpdateVariable / Analysis / JSONPatch 等非 canonical 剧情块。
- 新增 `character_anchors` 与 `active_arcs`。
- 主聊天与总结模型改用 trusted-core 记忆视图，降低旧污染反馈循环。
- 角色卡/世界书明确高于 SMM 压缩人物摘要。
- current_scene 改为快照覆盖。
- items 拆分所有权/持有/使用/位置并保护 owner。
- 记忆查看新增“当前主线”和“核心人物锚点”。

## v0.10.8

- Removed the v0.10.7 chat-image error/load fallback because repeated chat-card rerenders can cause visible flicker on mobile.
- SMM no longer observes, hides, restores, replaces, or inserts placeholders for images inside chat messages.
- Keeps all v0.10.7 mobile UI polish.
- No changes to summarization, memory injection, date continuity, semantic anchors, open-loop lifecycle, or automatic hiding.

## v0.10.7

UI-only polish and safe broken-image fallback.

- 移动端自动管理区改为紧凑卡片，常用开关集中展示。
- 总结模型、总结节奏与剧情起点改为折叠式低频设置。
- 继续保留记忆查看入口，不改变长期记忆结构或总结算法。
- 聊天正文中的图片加载失败时隐藏裂图图标并显示轻量占位提示。
- 图片容错只操作当前 DOM，不修改消息正文、聊天 JSONL 或远程图片 URL。
- 未修改日期连续性、semantic anchors、open loop 生命周期、安全记忆注入或自动隐藏核心逻辑。

## v0.10.6

Public-release cleanup and continuity hardening.

- 活动事项后台化：过期 / 完成 / 取消 / 错过 / 替代 / 失效事项不再长期保留在可见历史池。
- 旧 `closed_loops` 迁移为最多 80 条轻量 tombstone，仅用于防止旧事项复活。
- tombstone 不保存完整事项描述、不显示、不注入模型。
- 增加中文时间解析，例如“上午10点”“下午3点30分”。
- 增强“历史事实防补写”规则，禁止无依据补写过去对话、承诺、动机、物品来源、关系历史等。
- 记忆主视图隐藏待办、隔离、冲突、当前场景和内部审计，只保留适合人工核查的剧情记忆。
- 主状态面板减少内部技术统计，移动端更简洁。
- 新安装默认关闭插件与自动总结，避免安装后自动处理聊天。
- 安全重建不再使用任何特定剧情日期作为默认起点；未设置剧情起点时会要求先配置。
- 移除公开代码中所有特定剧情人物、地点、事件和别名硬编码。
- 保持 v0.10.5 的日期连续性、semantic anchors、安全注入和隐藏楼层核心逻辑。

## v0.10.5

- 统一 open loop 生命周期。
- 修复 future + in_progress 时间判断顺序。
- 修复旧 `closed` / `waiting_condition` 兼容。
- 修复安全重建完成状态。
- 修复 loop key 与部分时间解析问题。
- `current_story_date` 与 `semantic_anchors` 进入 schema required。
- 增强元指令过滤。
- 优化移动端 UI 与版本显示。
