# Story Memory Manager v0.11.4

## 0 API 本地代码补档

- 新增“代码补档这个范围（0 API）”。该路径完全不调用总结模型/API。
- 优先复用角色预设已经生成的 `<abstract>`、`<meow_FM>`、`<scene_summary>`、`<memory_summary>`。
- 若原回复没有内嵌摘要，则从 USER 原文与 assistant canonical `<content>` 做本地抽取式压缩。
- 每两个 user/assistant 对合并为一个 timeline 节点，避免一次补档生成过多时间线条目。
- 代码补档只补 `timeline`，不凭本地启发式重写 characters / relationships / facts / open_loops / active_arcs。
- 继续使用 `/世界/当前日期`、`/世界/当前时间`、`/世界/当前地点` 的白名单元数据来校准本地节点。
- 本地日期规则拒绝旧 metadata 导致的日期回退；+1 日仅在明确“第二天/次日”等、可靠跨午夜钟点、或 canonical 正文明示日期时接受。
- 补档前自动备份 SMM memory；失败时恢复原记忆；不修改原聊天，不改变 `last_processed_index`。
- 保留 v0.11.3 的 API 补总结按钮作为可选方式，但不再是缺口修复的首选按钮。

## 继承

- v0.11.2/v0.11.3 的 silent-drop 游标保护、source 校验、断档检测、断档期间禁止安全注入/自动隐藏、World State metadata bridge 均保留。
