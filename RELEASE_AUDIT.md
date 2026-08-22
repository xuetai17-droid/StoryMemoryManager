# v0.11.11 Release Audit

Baseline: user-uploaded v0.11.10 CODE GitHub package.

Checks performed:
- `node --check index.js`: PASS.
- `manifest.json` parses and reports `0.11.11`: PASS.
- UI badges/startup log/version header all report `v0.11.11`: PASS.
- Hybrid triage code present: preset plot -> reliable; strong factual fallback -> reliable; ambiguous -> needs-AI queue: PASS (static branch audit).
- Empty/placeholder timeline creation removed from v0.11.11 path: PASS (static branch audit).
- Coverage and visible timeline facts separated via `local_code_coverage_v01111`: PASS.
- Needs-AI ranges stored only in audit metadata, not timeline: PASS.
- Gap detector recognizes local code coverage ranges: PASS.
- Prior code-repair detector now recognizes v0.11.10 and v0.11.11 in addition to v0.11.4-v0.11.9: PASS.
- Existing v0.11.10 absolute-date weekday normalization and preset `<abstract><plot>` parser retained: PASS.
- No API call added to the local hybrid path: PASS (static call-path audit).

Behavioral contract:
- Reliable `<abstract><plot>` is preserved directly.
- Conservative fallback is emitted only when existing strong-action filters produce a non-empty factual event.
- Ambiguous rows produce no visible timeline event and are queued for optional later AI processing.
- Code coverage prevents intentionally deferred rows from being mistaken for a new silent-drop gap.

Limitations:
- Pure JavaScript still does not have LLM-level semantic understanding. `needs_ai` is intentional, not a failure.
- Runtime integration with the user's exact SillyTavern chat data must be verified in SillyTavern after installation.
