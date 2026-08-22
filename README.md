# Story Memory Manager v0.11.9 CODE

This release is intended for zero-extra-API gap repair when the active RP preset already emits structured summaries such as PLUTO `<abstract>`.

Recommended recovery flow:
1. Keep auto summary OFF.
2. Keep memory injection OFF.
3. Keep automatic hiding OFF.
4. Open `更多工具 → 历史重建 → 补总结缺失楼层`.
5. Rebuild the missing range with `代码压缩重建这个范围（0 API）`.
6. Review the timeline before re-enabling injection/hiding.

### v0.11.9 behavior
- PLUTO XML abstract: uses `<plot>` directly as timeline text.
- `<time>`: parsed into absolute date and time/range.
- `<scene>`: parsed as location.
- No re-summarization API call is made.
- If an old message has no structured summary, only a conservative local fallback is used.

Important limitation: code mode cannot semantically recreate a high-quality summary for arbitrary old prose that contains no structured summary. Such rows are intentionally kept conservative rather than hallucinated.
