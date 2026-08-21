# Story Memory Manager v0.11.3 Release Audit

## Why this release exists

v0.11.2 correctly stopped the silent-drop bug, but the user's real gap repair repeatedly stopped at `#1489-#1508` with “没有任何可追溯到本批原文的 timeline”. The raw export proves that range contains normal canonical RP messages (for example `#1489` user prose and `#1490` assistant `<content>`, plus later `#1505/#1506`), so the range is not empty and should be summarizable. The failure path therefore needed robust source recovery rather than repeated manual retries.

## Source / version integrity

- Base: final v0.11.2 package that already contains gap/cursor safety and world-state metadata fixes.
- `manifest.json`: `0.11.3`.
- `index.js` header, visible UI badges, and startup log: `v0.11.3`.
- `node --check index.js`: passed.
- Original chat JSONL mutation: none added.

## v0.11.3 source recovery

- Canonical `#123`, `#123-#126`, `#123,#125` remain accepted.
- Safely normalized model variants include: `#1489-1508`, `1489-1508`, `1489至1508`, `1489,1491`, and `楼层 1490`.
- Only integers inside the active summary batch are recoverable.
- Date-like text such as `2025-09-23` does not produce an in-batch source for the `1489-1508` batch.
- Explicit out-of-batch `#` references are rejected as a whole (`#1480-#1490`, `#1480,#1490` do not get trimmed into a false-valid source).
- Normalized sources are rewritten into canonical `#...` form before the existing v0.11.2 firewall runs.

## Dedicated timeline retry

If the full structured memory summary still has zero accepted timeline nodes:

1. SMM runs one dedicated timeline-only extraction request using only the current batch's canonical cleaned messages.
2. The allowed `#floor` identifiers are listed explicitly.
3. The retry is instructed to ignore thinking/campus_gossip/UpdateVariable/auxiliary blocks as story facts.
4. Structured JSON is attempted first; a plain-JSON compatibility retry is available.
5. Recovered timeline sources are normalized and passed through the same strict in-batch validation.

The retry does not fabricate local events; it still uses the configured summary model/API.

## Adaptive split during gap repair

If source recovery still fails, targeted gap repair splits only the failing batch recursively:

- Typical path: 20 messages -> ~10 -> ~4/6 -> 2.
- API timeouts/general transport failures are not disguised as source failures and are not recursively retried by this path.
- If a smallest two-message chunk still cannot produce a valid traceable timeline, the repair stops.
- The entire targeted repair then restores the pre-repair memory snapshot, so partial historical writes do not survive a failed run.
- `last_processed_index` remains protected exactly as in v0.11.2.

## Existing v0.11.2 protections retained

- Large timeline gap blocks memory injection.
- Auto-hide cannot cross the first unresolved gap.
- Targeted backfill preserves current cursor/date/time/current_scene/active_arcs/open_loops and current transient character state.
- UpdateVariable remains excluded from canonical prose.
- Only `/世界/当前日期`, `/世界/当前时间`, `/世界/当前地点` may enter as bounded end-state metadata.
- Favorability and other variable paths remain excluded from SMM canonical memory input.
- Explicit “第二天” rollover is supported; negated rollover phrases such as “没有跨过午夜” do not advance the date.

## Static tests run

- `node --check index.js`: PASS.
- `manifest.json` parse/version: PASS.
- Source normalization variants: PASS.
- Date-like non-source rejection: PASS.
- Explicit out-of-batch `#` source rejection: PASS.
- Visible version badge/startup string check: PASS.

## Runtime limitation

The actual historical backfill still requires the user's configured SillyTavern summary model/API. This environment cannot execute that connected model request, so the final acceptance test is one real in-app repair run. v0.11.3 is designed specifically so the user should no longer manually retry the identical `#1489-#1508` batch: it normalizes, retries, and splits automatically before stopping.
