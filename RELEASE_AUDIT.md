# Story Memory Manager v0.11.5 Release Audit

## Scope

本版仅调整 0 API 历史缺口补档/重建路径，核心目标是将 `<abstract>/<meow_FM>` 中的多条结构化记录拆分为独立 timeline，并安全替换 v0.11.4 已生成的整块节点。

## Safety invariants

- 0 API 路径不调用总结 API。
- 不修改 `C().chat` 原聊天。
- 不推进或回退 `last_processed_index`。
- 不重写 characters / relationships / facts / active_arcs / open_loops / current_scene。
- 补档前写入 memory backup；异常时恢复 snapshot。
- 只有检测到此前存在 `timeline_gap_code_backfill_v0114/v0115` 审计时，重建才会删除“source 完全位于目标范围内”的旧 timeline；跨出范围的节点不会删除。

## Structured parser checks

测试样本：

`049 2025-09-23 | 12:55-13:00 意式餐厅Bistro 19·二楼包间 薛伶...；050 2025-09-23 | 13:00-13:10 意式餐厅Bistro 19至KΣ宅邸·三楼会长套房 薛伶...`

预期并验证：

- 解析为 2 条记录。
- record_no 分别为 049 / 050。
- 日期均为 2025-09-23。
- 时间分别为 12:55-13:00 / 13:00-13:10。
- 地点前缀与事件正文正确分离。
- event 正文不再包含编号、日期、时间头。

## Static checks

- `node --check index.js`: PASS
- `manifest.json`: valid JSON
- manifest version: 0.11.5
- UI version badges: v0.11.5
- startup log: v0.11.5

## Known limitation

地点拆分只在检测到已知角色名/用户名前存在合理地点前缀时执行；无法可靠判断时宁可保留原 event，不做激进切分。
