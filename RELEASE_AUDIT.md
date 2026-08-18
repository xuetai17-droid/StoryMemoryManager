# Story Memory Manager v0.11.0 Release Audit

## Scope

This release is a continuity-structure experiment based on v0.10.8. It does not rewrite chat JSONL.

## Main changes

- Canonical story-body extraction before summarization.
- Auxiliary block exclusion.
- character_anchors / active_arcs.
- trusted-core summary and injection payloads.
- Stable item ownership semantics.
- current_scene snapshot semantics.

## Safety boundaries

Unchanged core mechanisms: source-based timeline firewall, date continuity calibration, semantic_anchors, open_loop lifecycle, safe hidden-floor mechanism.

## Recommended test

1. Upgrade.
2. Keep auto-hide off for the first summary batch.
3. Manually summarize 8-20 new messages.
4. Inspect Current Arcs / Character Anchors / Timeline.
5. If correct, re-enable auto summary, memory injection, then auto-hide.
