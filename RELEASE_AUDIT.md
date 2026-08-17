# Story Memory Manager v0.10.8 Release Audit

Audit target: GitHub upload package for SillyTavern.

## Scope

v0.10.8 is a corrective UI release. It removes the v0.10.7 broken-image DOM fallback after real-device testing showed that repeated message/card rerenders can cause visible flicker.

## Changes

- Removed document-level `error` / `load` listeners for chat `<img>` elements.
- Removed failed-image hide/restore state and placeholder insertion.
- Removed related CSS classes.
- Preserved the v0.10.7 mobile SMM UI polish.
- Updated manifest version and visible load log to v0.10.8.

## Explicitly unchanged core behavior

- summarization pipeline and retry logic;
- schema and structured memory fields;
- canonical story-date continuity rules;
- semantic anchors;
- open-loop lifecycle;
- safe memory injection;
- automatic hiding and restore-hidden-floor behavior;
- chat JSONL content.

## Verification performed

- `node --check index.js`: passed.
- `manifest.json`: parses as JSON and reports `0.10.8`.
- No `SMM107_IMAGE_FALLBACK`, `installBrokenImageFallbackV0107`, `smm107-broken-image-*`, or document image load/error handlers remain.
- Core function bodies were compared against v0.10.7 and remain byte-identical for schema, summary range, open-loop normalize/merge, result merge, safe injection, and auto-hide functions.
- Package contains no local backup files or chat JSONL.

## Image behavior

SMM deliberately does not attempt to fix broken images in v0.10.8. A broken image must be diagnosed at its actual source URL / HTML provider. This avoids masking or destabilizing unrelated chat rendering.
