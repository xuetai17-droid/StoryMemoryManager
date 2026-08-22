# Story Memory Manager v0.11.12

## Fixed

- Fixed a deterministic `ReferenceError: triage is not defined` in the v0.11.11 hybrid 0-API rebuild path.
- Hybrid triage state is now initialized inside `makeLocalTimelineNodesV0117()` before any structured/fallback branch uses it.
- Structured `<abstract><plot>` records now mark their source rows as `reliable` only when at least one non-empty visible event was actually accepted.
- Structured records that parse but collapse to no safe event are now routed to `needsAI` instead of being silently counted as reliable.
- `presetPlotNodes` and `factualFallbackNodes` counters are updated only on accepted nodes.
- Existing transaction rollback behavior is preserved: any unexpected code-mode exception restores the pre-run memory snapshot.

## Compatibility

- Keeps the v0.11.11 hybrid policy: reliable preset plot first, conservative factual fallback second, otherwise coverage-only + optional AI queue.
- No API call is introduced by code rebuild, time calibration, coverage recording, or triage statistics.
