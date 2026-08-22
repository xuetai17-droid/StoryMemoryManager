# Story Memory Manager v0.11.6 Release Audit

## Scope

This release is based on the user's v0.11.5 CODE package and changes only the local 0-API timeline repair path plus version/docs. It does not redesign the main SMM memory architecture.

## User-visible fixes

1. **Local fact compression**
   - v0.11.5 fallback nodes could still contain long dialogue-heavy prose.
   - v0.11.6 strips quoted dialogue/repeated exclamations, filters micro-detail, selects traceable plot-action clauses, and caps the local event text aggressively.
   - No LLM/API is called and no bridge facts are invented to make the prose smoother.

2. **Existing `未明确` timeline time repair**
   - v0.11.5 rebuilt only the selected gap. Existing rows after the selected range (for example `#1623+`) were intentionally left untouched, so their old `未明确` labels remained.
   - v0.11.6 repairs unresolved date/time/location on existing timeline rows through the current processed cursor, using only each row's own `source` messages.
   - Priority: same-source `/世界/当前*` UpdateVariable metadata -> same-source structured preset summary -> same-source raw explicit clock.
   - Existing explicit/verified time is never overwritten.

3. **Current story time sync**
   - After local repair, `current_story_time` is synchronized from the latest world-state metadata at or before `last_processed_index`.
   - `current_story_date` is only moved forward/equal, never backward.
   - `current_scene.location` may be synchronized from the same latest processed world-state metadata.

4. **Standalone 0-API time repair button**
   - Added `仅修复时间线“未明确时间”（0 API）` under History Rebuild.
   - This can be run without rebuilding the gap again.

## Safety invariants retained

- Original SillyTavern chat messages are never edited.
- `last_processed_index` is preserved by local gap rebuild.
- Local code does not regenerate relationships, character anchors, active arcs, open loops, facts, or current-scene narrative content.
- UpdateVariable remains excluded from canonical story prose.
- Metadata whitelist remains exactly:
  - `/世界/当前日期`
  - `/世界/当前时间`
  - `/世界/当前地点`
- Favorability, gossip, Analysis, and other JSONPatch paths are not admitted through the metadata bridge.
- Repair failure restores the pre-operation memory snapshot.
- v0.11.2/v0.11.3 gap/source/commit protections remain present.

## Verification performed

- `node --check index.js`: PASS.
- `manifest.json` parses and version is `0.11.6`: PASS.
- Two UI version badges show `v0.11.6`: PASS.
- Startup log shows `v0.11.6`: PASS.
- Standalone time-repair control is present and bound: PASS.
- Static whitelist check confirms only three `/世界/当前*` metadata paths: PASS.
- Synthetic source test: `#1623-#1624` with `time: 未明确` and same-source JSONPatch `秋季学期 周二 13:25` -> repaired to that exact value and labeled `变量状态时间`: PASS.
- Synthetic current-state test: stale `current_story_time=秋季学期 周一 下午（具体时间未明确）` + latest processed metadata `秋季学期 周二 13:40` -> top-level time synchronized: PASS.
- Dialogue-heavy local compression samples: quoted speech and selected micro-detail removed; output remains under configured cap: PASS.

## Known limitation

0-API compression is deterministic extraction, not semantic LLM summarization. It can shorten and structure source-grounded facts, but it cannot reliably infer hidden motives, relationship-state changes, causal interpretation, or which subtle detail matters most. Those fields remain intentionally untouched.
