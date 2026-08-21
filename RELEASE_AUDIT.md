# Story Memory Manager v0.11.2 Release Audit

## Scope

This final v0.11.2 package fixes silent summary-batch drops, adds targeted historical gap backfill, and adds a strictly bounded world-state metadata bridge for date/time/location without rewriting original chat JSONL.

## Source integrity

- Built from the uploaded current SMM source, preserving the v0.11.1 character anchors, active arcs, canonical-input purification, item ownership model, semantic anchors, date calibration, safe injection, and hiding logic.
- `manifest.json` version: `0.11.2`.
- `index.js` header, both visible version badges, and startup log all report `v0.11.2`.
- No original chat message mutation was added by this release.

## Gap / cursor safety checks

- `node --check index.js`: passed.
- JSON parse of `manifest.json`: passed.
- Reported memory snapshot detects exactly one large suspicious gap: `#1489-#1622` (134 floors), bounded by `#1488` and `#1623`.
- Historical working memory for repair starts at cursor `#1488`, anchored to the prior canonical `2025-09-22 / 18:30`, excluding later current-state context.
- Batch commit guard rejects invalid, fake-summary, and out-of-range timeline sources; a valid in-batch source range is accepted.
- Safe memory injection is blocked while the suspicious gap remains.
- Auto-hide is clamped before the first suspicious gap.
- Targeted backfill merge preserves current cursor/date/time/current_scene/active_arcs/open_loops and current character transient state.
- Synthetic post-repair coverage test returns no large gap.

## World-state metadata safety checks

- `UpdateVariable`, `Analysis`, and `JSONPatch` remain excluded from canonical summary prose.
- Only three exact assistant JSONPatch paths are extracted: `/世界/当前日期`, `/世界/当前时间`, `/世界/当前地点`.
- User-authored JSONPatch is ignored.
- Favorability and every other variable path are excluded from the metadata bridge and were verified absent from summarizer input.
- Real `SMM-recent24.txt` sample `#1490` extracts `2025-09-22 / 秋季学期 周一 18:35 / Rusty's drive-through` while keeping the whole UpdateVariable block out of canonical prose.
- Timeline time sourced only from these fields is labeled `变量状态时间`, not `原文明确时间`.
- Metadata fills missing/unknown timeline or current-story date/time and may upgrade explicitly unresolved fuzzy time (for example `下午（具体时间未明确）`) when same-source metadata has a precise HH:MM; it does not overwrite an already precise non-empty time.
- Direct canonical `<date>` on the same source has priority over structured JSONPatch date.
- A `+1 day` JSONPatch date without real rollover evidence is rejected by date continuity validation.
- Explicit `第二天` is accepted as next-day evidence.
- Explicit negation such as `没有跨过午夜` is rejected as rollover evidence.

## Important behavior

Historical gap repair still calls the configured summary model/API for each requested batch. It does not fabricate missing events locally. Structured world-state metadata is supplemental evidence only; canonical story text and verified continuity rules remain authoritative.
