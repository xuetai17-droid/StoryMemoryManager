# Changelog

## v0.11.15 HYBRID

- 实体归一收口：`用户 / User / 主角 / 玩家 / 你 / 您 / {{user}}` 的实体字段统一为当前 SillyTavern 用户角色名。
- 自动从现有人物全名建立安全短名映射：仅当短名唯一对应一个 `名·姓` 人物时才合并，例如 `科尔 -> 科尔·布雷迪`。
- 人物重复键会合并，规范全名字段优先，短名重复只能补空字段，不能覆盖规范人物资料。
- relationships / character_anchors / open_loops / timeline / facts / events / semantic_anchors / active_arcs / items / locations / current_scene 统一经过同一实体映射。
- 关系在实体归一后再次规范化，同一人物对只保留 source 最新的关系状态。
- 明显群体名称若误入 characters 会从“人物”实体池移除；群体级关系本身不强行拆成个人关系，避免编造。
- 质量审计新增：人物泛称键、人物别名重复、重复关系对。
- 保留 v0.11.14 的 timeline 去重、needsAI HYBRID、时间/source 保护。
