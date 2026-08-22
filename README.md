# Story Memory Manager v0.11.13 HYBRID

For large historical gaps, the recommended workflow is now:

1. Run **代码压缩重建这个范围（0 API）** first.
2. Review the reported `可靠 X 楼 / 需要 AI X 楼` counts.
3. If semantic recovery is required, use **AI 仅补 needsAI（省 API）**.
4. Do not use **API 补总结整个范围（高消耗）** unless you intentionally want to resend the whole interval.

The selective AI action only submits rows that the 0-API triage explicitly marked `needsAI`. Reliable rows are kept locally and are not billed again. Successful AI batches are committed incrementally, so an interruption does not discard already-paid work; rerunning resumes from unresolved needsAI rows.

During historical repair, current story state and the live processing cursor remain protected.
