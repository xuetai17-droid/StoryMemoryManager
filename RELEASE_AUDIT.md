# Story Memory Manager v0.11.7 Release Audit

## Scope

This release is based on the v0.11.6 CODE package and only extends the local/0-API gap-rebuild and temporal-calibration path. Existing API summary logic, source firewall, memory schema, original-chat protection, and UI architecture were not refactored.

## Fixes verified

1. **Unified date + weekday + clock calibration**
   - `event.date` and `event.time` are calibrated together.
   - Strong same-source absolute dates from `/世界/当前日期` or structured preset summaries are allowed to move the source axis forward but never backward.
   - If a reliable date conflicts with `周X/星期X`, the date wins and the weekday token is rewritten to match the real calendar day.
   - If the date is only inherited/weak and the weekday is exactly the next day, the date may advance by one day.
   - Weak same-day raw clocks that move backward are rejected; deep-night to early-morning remains a permitted rollover.

2. **Existing timeline repair now fixes wrong date groups, not only missing time**
   - v0.11.7 repairs existing rows whose date grouping is inconsistent with same-source world-state metadata.
   - The repair result reports `timeFixed`, `dateFixed`, `weekdayFixed`, and `regressionBlocked` separately.

3. **Pluto-style abstract parser**
   - Added support for records shaped like `serial:... time:2025-09-22 周一 | 19:30 ... scene: ... plot: ...`.
   - `serial/time/NSFW/scene/plot` labels are not kept in the timeline event body.

4. **Local event cleanup**
   - Repeated speaker names and broken punctuation are normalized.
   - Very weak residual actions can fall back to one short non-explicit question/decision quote when present.
   - Event length remains capped for long-term-memory use.

## Tests executed

- `node --check index.js`: PASS.
- `manifest.json` parses and reports `0.11.7`: PASS.
- Runtime route check confirms the active 0-API rebuild calls `makeLocalTimelineNodesV0117`: PASS.
- Runtime route check confirms temporal repair calls `repairExistingTimelineTemporalV0117`: PASS.
- VM test with the real `SMM-recent24.txt` sample (#1489-#1512): PASS.
  - No auxiliary `campus_gossip / JSONPatch / UpdateVariable / Analysis` content enters timeline events.
  - All generated sample nodes remain on the reliable `2025-09-22` date axis.
  - Event text cap is enforced.
- Synthetic Pluto abstract test: PASS.
  - `2025-09-22`, `周一 19:30`, scene, and plot are parsed separately.
  - Metadata labels do not leak into the event body.
- Weekday rollover test (`2025-09-21 周日` + weak `周一 19:40`): PASS -> `2025-09-22 周一`.
- Strong-date weekday-conflict test (`2025-09-23` + stale `周一 09:45`): PASS -> date remains `2025-09-23`, weekday normalized to `周二`.
- Weak same-day clock-regression test: PASS -> backward clock rejected.
- Midnight rollover test (`23:40` -> `01:10`): PASS -> next day and weekday corrected.
- Existing wrong-group repair test:
  - `#1517-#1518` old date `2025-09-21`, same-source world metadata `2025-09-22 周一 19:40`: corrected to `2025-09-22`.
  - later row with same-source `2025-09-23 周二 07:00`: corrected to `2025-09-23`.

## Safety boundaries

- 0-API mode makes no external/model summary call.
- Original SillyTavern chat messages are not rewritten.
- `last_processed_index` remains protected during local timeline rebuild.
- Only the three exact world-state JSONPatch paths are read as temporal/location metadata.
- Favorability and other variables are not admitted as canonical story prose.
- Local code does not infer relationships, character anchors, active arcs, or open-loop outcomes.

## Remaining limitation

Local compression is deterministic extraction, not semantic model summarization. It can still be less elegant than API summaries. v0.11.7 prioritizes traceability, compactness, and temporal correctness over literary paraphrase quality.
