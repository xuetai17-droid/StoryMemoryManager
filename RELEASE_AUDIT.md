# v0.11.4 Release Audit

## Scope

本版只新增本地代码型缺口补档，并继承 v0.11.3 的 API 补档与安全保护。

## Static checks

- `node --check index.js`: PASS
- `manifest.json` JSON parse: PASS
- manifest version = `0.11.4`: PASS
- UI version badges = `v0.11.4`: PASS
- startup log = `v0.11.4`: PASS

## 0 API path inspection

`repairTimelineGapLocalV0114()` 内部不调用：
- `smmGenerateV093`
- `summarizeRange`
- `summarizeGapRangeAdaptiveV0113`
- Connection Profile / fetch / generation API

本地补档仅访问当前 `C().chat`、当前 memory、字符串解析与 `saveMetadata()`。

## Real sample test: SMM-recent24

测试源：已上传的 `SMM-recent24.txt`，#1489-#1512，共 24 楼。

结果：
- 生成 timeline 节点：6
- source 覆盖：24 / 24
- missing source indexes：0
- `/世界/当前日期/时间/地点` 可从同楼 JSONPatch 白名单读取。
- UpdateVariable 其他变量与 campus_gossip 不作为 canonical event 输入。

## Date safety

Local code date choice rules:
- stale metadata date < current reliable date: rejected
- same date: accepted
- +1 day: accepted only with explicit next-day cue, verified late→early clock rollover, or canonical prose explicit date
- larger forward jump: requires canonical prose explicit date

This specifically prevents old/stale world-state metadata from dragging the repaired history backward.

## Memory safety

Before local repair:
- automatic metadata backup created

On success:
- only timeline nodes are added
- current_story_date/current_story_time/current_scene restored
- active_arcs/open_loops/closed_loops/tombstones restored
- last_processed_index preserved

On failure:
- original memory object restored and saved

## Known limitation

Extractive code summaries are intentionally conservative and may be less elegant than LLM summaries. This is accepted because the mode is designed for 0-API historical coverage repair, not semantic character/relationship reconstruction.
