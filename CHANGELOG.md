# Story Memory Manager v0.11.13 HYBRID

## Selective needsAI completion

- Adds `AI 仅补 needsAI（省 API）`.
- Reads the latest 0-API hybrid triage queue and sends only rows classified as `needsAI` to the summarizer.
- Rows already classified as reliable are not re-sent to the API.
- Consecutive needsAI rows are compacted into ranges and split into pair-safe batches using the configured batch size.
- Each successful batch is committed immediately and recorded as resolved. If a later batch fails or API quota is exhausted, completed batches remain saved; rerunning skips them.
- The existing full-range API backfill remains available, but is relabeled as high-consumption.
- Current story date/time/scene, lifecycle state, open loops, and `last_processed_index` remain protected during historical AI completion.
- After selective completion, the existing 0-API temporal calibrator runs across the repaired interval.

## Preserved from v0.11.12

- 0-API hybrid triage (`reliable` vs `needsAI`).
- Source firewall / cursor commit protection.
- Local abstract/plot extraction and conservative fallback.
- Date/weekday/time calibration and world-state metadata isolation.
- Gap detection, rollback, and code-only rebuild.
