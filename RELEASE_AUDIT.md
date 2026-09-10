# v0.11.29 HYBRID Release Audit

- 基线：v0.11.28 HYBRID；每聊天剧情起点、原有长期记忆、注入诊断和阶段大总结架构保留。
- manifest version 与可见徽标：0.11.29。
- 默认总结方式：`summaryMode=local`；普通“总结新增”的本地回归中 `generateRaw` 调用数为 0。
- 批大小：新默认 30；从旧版升级且仍为默认 20 时迁移为 30。
- 本地输入边界：优先采用消息内现成 `abstract/plot`；无结构摘要时仅写入通过强事实过滤的内容。
- 隐藏安全：无法确认的楼层记录到 `local_deferred_ranges`，自动隐藏不会跨过首个 deferred 范围。
- 持久覆盖：`local_coverage_ranges` 不依赖最多 50 条的 audit 窗口，长聊天不会因旧 audit 被裁剪而虚构断档。
- 524 安全：Cloudflare `errorcode_524` / `cf-error-details` 响应在第一次请求后立即识别，不进入兼容 JSON 与 JSON 修复请求。
- AI 超时保底：超时批次本地提交，`summaryMode` 自动切回 `local`；失败响应未写入 canonical memory。
- 阶段大总结：local 模式的 `api_attempts=0`，所有阶段从已确认 canonical timeline 构建并标注 `local_zero_api`。
- 双日历边界：仅当本聊天存在可识别的 `/世界/现实时间` 时启用硬守卫；普通单时间轴卡不受影响。
- 历史场景保留：例如 2003-10-15 不删除，而是从 `timeline.date` 降级为 `timeline.time` 的“场景第二时间轴”；外层日期使用同 source 之前最近现实锚点。
- 当前状态：错误 2003 顶部日期可在升级刷新时本地恢复；空白/“未建立”地点不得覆盖已确认地点。
- 地点恢复：仅从最近可追溯 timeline 地点、白名单世界地点或明确地点正文中恢复。
- 原聊天 JSONL：无写入、删除或全量重建路径新增。
- 回归：v0.11.27 双时间轴、v0.11.28 剧情起点、v0.11.29 0 API/524/双日历/地点覆盖套件全部通过。
- JS syntax：`node --check` 通过。
- ZIP：打包后再解压，校验文件清单、manifest/徽标版本、JS syntax 及回归测试。
