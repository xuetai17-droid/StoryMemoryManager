# v0.11.24 HYBRID
- 独立总结 Profile 请求改为 `includePreset:false`，隔离 RP/聊天 generation preset 对总结任务的干扰。
- Chat Completion Profile 现在会把 SMM 的 `jsonSchema` 作为 `json_schema` 透传给 SillyTavern Connection Manager 的 override payload，使用原生结构化输出。
- 支持结构化返回时 `response.content` 为 JSON 对象，并安全序列化后进入既有 parse/repair/normalize 链。
- 保留 v0.11.23 reasoning JSON 恢复与 v0.11.22 本地 JSON 修复；普通 reasoning prose 仍拒绝进入 canonical memory。
- 阶段大总结失败时继续保留旧结果，不修改原聊天 JSONL。

# v0.11.23 HYBRID
- 修复独立总结 Connection Profile 成功返回但 `content` 为空、有效 JSON 落在 `reasoning` 时被误判为空响应。
- 仅在 reasoning 可解析/本地修复为 JSON 时启用恢复，避免把普通推理内容写入长期记忆。
- 增强 Connection Profile 响应包装兼容：支持 `message.content` / `data.content` / `choices[0].message.content` 等。
- 保持 v0.11.22 的 JSON 裸双引号修复、时间/地点追踪、注入诊断 UI 和阶段大总结结构不变。

# v0.11.22 HYBRID
- 修复阶段大总结返回“几乎正确但字符串内含未转义 ASCII 双引号”时的 JSON 解析失败。
- JSON 本地修复器不再全局替换中文弯引号；新增字符串内裸双引号的结构感知修复。
- 阶段大总结 prompt 明确要求标准 JSON，并建议正文引用使用中文引号。
- 阶段大总结错误 toast 改为短摘要，完整错误继续写入控制台。
- 不改变 v0.11.21 的时间/地点追踪、注入诊断 UI 与 stage_summaries 数据结构。

# v0.11.21 HYBRID
- 修复 current_story_date/current_story_time 被旧 timeline 拉回的问题；新增最近正文优先的 current-state resolver。
- current_scene.location 同步采用“最近可靠正文 > 世界状态元数据 > 旧状态”的保守策略。
- 自动总结关闭时，生成前仍会轻量检查最近正文并刷新当前剧情状态。
- 新聊天允许无绝对日期启动；剧情起点不再强制必须填写 YYYY-MM-DD。
- 重做“本轮注入诊断”移动端 UI：摘要优先、原始 prompt 折叠、刷新按钮横向全宽。
- 注入 prompt 的分隔符恢复为真实换行。
- 新增阶段大总结 stage_summaries：基于现有 canonical 长期记忆按剧情阶段压缩，不重扫原聊天、不修改 JSONL。
- 阶段大总结至少需要 6 条有效 timeline 且无大段断档；失败时保留旧结果；主模型只注入少量高价值阶段摘要。

# v0.11.20
- 主模型注入改为精简事实包：当前时间/场景、相关人物与关系、近期事件、主线和未完成事项。
- 移除 character_anchors 等内部机制说明型提示，避免主模型转为说明/防御式回答。
- 仅选择当前场景和近期事件相关实体，并减少 timeline/open_loops 数量。
- 保留 v0.11.19 注入诊断，可直接查看实际注入文本与长度。

# v0.11.19 HYBRID

- 修复安全记忆注入只在扩展入口安装/开关变化时刷新的问题；现在聊天状态变化会重新同步当前聊天记忆。
- 新增注入诊断与实际 prompt 预览，明确区分“关闭”“被时间线断档阻止”“正常注入”。
- 保留 v0.11.18 的 JSON 本地修复、未知调试字段清理和 timeline 自然时间显示。

# v0.11.18 HYBRID

## JSON 容错
- API 返回轻微损坏 JSON 时，先在本地修复，再决定是否需要额外 API 重试。
- 支持常见问题：Markdown 围栏、弯引号、字符串内裸换行/控制字符、JS 注释、未加引号的属性名、尾逗号、裸 `-` 占位、独立 `__debug`/`__note` 成员。
- 已知后端别名 `current_scene_core` 会映射为 `current_scene`。
- 总结对象写入前使用顶层字段白名单，未知调试字段不会进入长期记忆。
- 缺失的标准数组/对象字段会补为空结构，减少仅因包装格式导致的整次总结报废。

## 时间显示粒度
- 底层日期/时分仍保留用于排序与连续性校验。
- 如果具体 HH:MM 仅来自 `/世界/当前时间` 的变量状态元数据，历史时间线 UI 改为自然时段显示：凌晨/早晨/上午/中午/下午/晚间/深夜。
- 原文明确时间、预设 `<abstract>` 明确时间仍保留精确时分。
- 不修改原聊天，也不降低底层时间校准精度。
