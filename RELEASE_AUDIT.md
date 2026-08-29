# v0.11.26 HYBRID Release Audit

- 基线：v0.11.25 HYBRID。
- manifest version：0.11.26。
- 可见版本徽标：0.11.26（经典面板 + 原生扩展面板）。
- 阶段大总结：一个 deterministic timeline window 生成一个 stage；单组最多 30 条 timeline。
- AI 返回兼容：direct stage object、stages/stage_summaries/chapters arrays、value/data/result wrappers。
- 逐组失败策略：任何 Profile/timeout/JSON/shape 错误转为 local canonical fallback，不中止整次生成。
- 熔断：连续 2 组 AI 失败后，本轮剩余组不再调用 AI，避免重复失败和 Token 浪费。
- 本地 fallback 仅使用现有 canonical timeline 与 open_loops；异常模型 prose 不写入 canonical memory。
- 写入策略：先在内存中构建完整 stage 集合，最后统一 saveMeta；若最终持久化失败仍恢复旧 stage_summaries。
- 原聊天 JSONL：无写入/删除/重建路径新增。
- 旧 memory：兼容；stage_summaries 新增可选 generation_mode/fallback_reason 字段，不影响旧数据读取。
- JS syntax：node --check 通过。
- helper regression：direct object / array merge / wrapper / local fallback 通过。
- ZIP：打包后需再次解压并执行 node --check 与 manifest/版本一致性检查。
