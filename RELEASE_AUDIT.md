# v0.11.12 Release Audit

## Scope

This release fixes the v0.11.11 hybrid 0-API runtime failure and triage accounting. It intentionally does not redesign the timeline/time parser again.

## Static checks

- `makeLocalTimelineNodesV0117()` declares a local `triage` object before all branches: PASS.
- Structured accepted records populate `triage.reliable`: PASS.
- Structured records with no accepted event populate `triage.needsAI`: PASS.
- Factual fallback accepted records populate `reliable` and `factualFallbackNodes`: PASS.
- Unsafe fallback rows populate `needsAI` and do not create visible placeholder events: PASS.
- No code-mode API call added: PASS.
- Existing rollback catch/restore path retained: PASS.
- Manifest parses and reports `0.11.12`: PASS.
- UI badges/startup log/version header report `v0.11.12`: PASS.

## Runtime-oriented regression checks

- JavaScript syntax (`node --check`): PASS.
- VM harness: calling the hybrid builder no longer throws `ReferenceError: triage is not defined`: PASS.
- Hybrid triage metadata is attached to returned node arrays: PASS.
- Reliable/needs-AI sets are de-duplicated by the existing stats layer: PASS.
- Package ZIP integrity test: PASS.

## Operational note

The user should re-run the failed range after installing v0.11.12. Because v0.11.11 restored the original memory on failure, no manual memory rollback is required before retrying.
