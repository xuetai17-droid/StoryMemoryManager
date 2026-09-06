# v0.11.27 HYBRID Release Audit

- 基线：用户提供的 v0.11.26 HYBRID；阶段大总结、注入诊断及普通单时间轴架构保留。
- manifest version：0.11.27。
- 可见版本徽标：0.11.27（经典面板 + 原生扩展面板）。
- 角色卡核对：《洗牌》定义 `世界.现实时间` 为 `YYYY年MM月DD日 HH:MM`，并明确要求副本时钟推进时同步写入 `/世界/现实时间`。
- 元数据边界：仅新增世界级白名单路径；`/玩家副本/副本内时间` 与 `/考官副本/副本内时间` 不进入主时间解析器。
- 主时间轴：同 source 的 `/世界/现实时间` 可单向推进多日；日期倒退仍拒绝。
- 第二时间轴：timeline.time 可保留“副本第 N 轮·第 M 天 HH:MM”，但不拥有 timeline.date 或 current_story_date/current_story_time。
- 旧记忆迁移：检测到现实主时间轴后，仅对已有 timeline 日期轴做一次本地重新校准并同步 current date；不调用 AI。
- 原聊天 JSONL：无写入、删除或重建路径新增。
- 回归覆盖：现实时间字符串、点路径、嵌套 UpdateVariable/JSONPatch、非白名单副本时钟隔离、4/1→4/8→4/10 多日推进、同楼层主/副时钟竞争、日期倒退保护、旧单时间轴次日推进。
- JS syntax：`node --check` 通过。
- ZIP：打包后再次解压，检查文件清单、manifest/徽标版本一致性、JS syntax 与回归测试。
