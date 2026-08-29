# v0.11.25 HYBRID Release Audit

- `node --check index.js`: PASS
- manifest version: 0.11.25
- visible version badge: 0.11.25（经典面板 + 原生扩展面板）
- 基线：v0.11.24 HYBRID；本版仅针对阶段大总结独立 Profile 输出链做兼容收口。
- Chat Completion 判定：优先使用 `ConnectionManagerRequestService.validateProfile(profile).selected === "openai"`，`profile.mode === "cc"` 仅作兼容兜底。
- `json_schema`：实际 Chat Completion Profile 会经 `sendRequest` 第五参数 `overridePayload` 透传。
- 阶段分组：单组最多 36 条有效 timeline；schema 单组最多 3 阶段；单组输出上限 4200 tokens。
- JSON 根包装兼容：`stages`、`stage_summaries`、`chapters`、`value.stages`、`data.stages`、`result.stages`。
- 失败安全：任何一组仍无法得到可靠阶段数组时，恢复旧 `stage_summaries`，不持久化半成品。
- 原聊天 JSONL：未新增写入、删除或重建路径。
- v0.11.21 已通过的 current date/time/location resolver 与 v0.11.22–0.11.24 的 JSON 修复/response 兼容逻辑保留。
