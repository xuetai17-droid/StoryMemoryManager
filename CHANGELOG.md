# v0.11.17 HYBRID

- 修复“修复全部实体 / 关系去重 / 质量审计”遇到旧版字符串型 facts 时崩溃：`Cannot create property 'fact' on string ...`。
- 实体统一器现在兼容历史记忆中的混合结构：timeline/facts/events/relationships/open_loops/semantic_anchors/character_anchors/active_arcs/items/locations 可同时存在字符串与对象记录。
- 对字符串记录只做安全文本规范化，不再向 primitive 值写对象属性。
- timeline 的纯字符串旧记录会安全升级为 `{event, source:null}`，便于后续质量审计处理；其余字段尽量保留原结构，避免无依据改写历史。
- 保留 v0.11.16 的按钮委托绑定、错误提示、实体别名合并、关系去重、timeline 去重和质量审计。
