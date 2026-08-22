# Story Memory Manager v0.11.9 CODE — Release Audit

## Scope
This release fixes the zero-extra-API timeline rebuild path after v0.11.8 produced dialogue-fragment entries such as a single short user quote instead of a plot summary.

## Root cause confirmed
PLUTO 2.0 emits structured XML summaries:

`<abstract><serial>…</serial><time>…</time><scene>…</scene><plot>…</plot></abstract>`

The older code-mode parser flattened the inside of `<abstract>` before reading the child tags. As a result, the XML fields were lost and the rebuild often fell back to heuristic raw-prose extraction. That fallback could select short dialogue or local body-detail sentences as the timeline event.

## v0.11.9 changes
- Parses raw PLUTO XML `<abstract>` before stripping tags.
- Reads `<serial>`, `<time>`, `<scene>`, and `<plot>` separately.
- Uses `<plot>` directly as the no-extra-API timeline event. It is not re-scored or re-summarized by the local dialogue extractor.
- Uses `<time>` for absolute date + clock/range and `<scene>` for location.
- Keeps legacy colon-style abstract parsing as fallback.
- If no structured summary exists, local fallback is conservative and refuses to promote a tiny dialogue fragment into long-term memory just to satisfy coverage.
- Adds a render-time weekday guard: displayed weekday is derived from the stored absolute date.
- Time-repair metadata lookup also uses the v0.11.9 XML parser.

## Static checks
- `node --check index.js`: PASS
- `manifest.json` version: 0.11.9
- UI version badges: v0.11.9
- startup log: v0.11.9

## Parser/behavior tests
### PLUTO XML abstract
Input:
- `<serial>047</serial>`
- `<time>2025-09-22｜19:30-19:32</time>`
- `<scene>KΣ宅邸·一楼厨房</scene>`
- `<plot>科尔驾车带薛伶返回KΣ宅邸。薛伶表示饥饿，科尔带她进入厨房并加热剩饭。</plot>`

Result: PASS
- date = `2025-09-22`
- time = `周一 19:30-19:32`
- location preserved
- plot preserved verbatim apart from whitespace/punctuation cleanup
- user dialogue outside `<plot>` did not leak into event
- `Analysis`, `JSONPatch`, favorability data did not leak into event

### Stale weekday display guard
Input: date `2025-09-23`, time text `秋季学期 周五 09:45`
Result: `秋季学期 周二 09:45` — PASS

### Legacy colon-style abstract
Existing `serial: ... time: ... scene: ... plot: ...` parser remains functional — PASS

## Known limitation
Zero-API code cannot semantically reconstruct a high-quality summary for arbitrary historical prose that contains no structured summary. For those messages v0.11.9 intentionally uses a conservative fallback rather than inventing or over-interpreting events.

## Safety/compatibility
- Does not modify original chat messages / JSONL.
- Does not call the summary API in code rebuild mode.
- Does not change the current processed cursor during range rebuild.
- Existing memory-injection, hiding, source-gap protection, and world-state metadata whitelist remain intact.
