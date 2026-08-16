# v0.10.6 Release Audit

本文件记录发布前静态审计范围。

## 已通过

- `index.js`：`node --check` 通过。
- `manifest.json`：JSON 可解析，版本为 `0.10.6`。
- 新安装默认 `enabled=false`、`autoSummarize=false`，不会安装后自动处理聊天。
- 未发现 API Key、Bearer Token、本机绝对路径或聊天文件路径硬编码。
- 未发现开发用特定剧情人物、地点或事件名称硬编码。
- `current_story_date` 与 `semantic_anchors` 仍为结构化输出 required 字段。
- 安全记忆注入仍包含 semantic anchor 优先规则。
- 增加历史事实防补写规则。
- `open_loops` 终止项会从活动池移除。
- `pending` / `at_risk` 过期项会清理；跨日仍残留的 `in_progress` 会清理；同日 `in_progress` 不会仅因开始时间已过而误删。
- 旧 `closed_loops` 会迁移为最多 80 条的轻量 `loop_tombstones`。
- tombstone 不保存完整事项描述，且不进入 `compact()` / safe memory injection。
- 记忆 UI 不再展示待办、隔离、冲突、当前场景原始 JSON。
- 记忆 UI 保留时间线、人物、人物关系和关键连续性锚点，便于人工核对。
- 公开版安全重建不再使用任何特定剧情日期作为默认起点。
- 自动隐藏与聊天正文逻辑未改；升级不会主动重写聊天 JSONL。

## 自动测试

已对实际 v0.10.6 源码中的生命周期函数执行测试：

- 中文 `上午10点` / `下午3点30分` / `凌晨12点` 时间解析。
- 过期 pending / at_risk 清理。
- 同日 in_progress 保留。
- 跨日 in_progress 清理。
- terminal 状态直接移出活动事项。
- tombstone 防止同一旧事项复活。
- 相同稳定 ID、不同 due 的新安排仍可进入。
- v0.10.5 `closed_loops` 迁移为 tombstone。
- `waiting_condition -> pending` 兼容迁移。

全部通过。

## 仍需真实 UI / 生成链验证

静态与函数级测试不能替代 SillyTavern 实际运行。正式打 GitHub Release tag 前建议在真实聊天中再确认一次：

1. 扩展面板显示 v0.10.6。
2. “查看 / 收起记忆”只显示面向人工核对的内容。
3. 自动增量总结正常触发。
4. 总结后活动事项按新规则清理。
5. 安全记忆注入与自动隐藏正常。
6. 重启 SillyTavern 后 metadata 与隐藏状态保持正常。

