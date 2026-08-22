# Release Audit — v0.11.13 HYBRID

## Scope

Base: user-supplied StoryMemoryManager v0.11.12 HYBRID package.

## Changes verified

- Manifest version: `0.11.13`.
- UI version badges: `v0.11.13`.
- Startup log: `v0.11.13 loaded successfully`.
- Added selective action: `AI 仅补 needsAI（省 API）`.
- Full-range API action retained and explicitly marked high-consumption.
- Selective queue is derived from the latest `local_needs_ai_v01111` triage audit for the requested interval.
- Previously resolved `needs_ai_api_resolved_v01113` ranges are subtracted before any new API call.
- Consecutive unresolved indexes are compacted and pair-safe chunked.
- Each successful chunk is merged through the existing historical backfill merger and saved immediately.
- Later failure does not roll back earlier successful chunks.
- Protected live state restored after each historical merge: current date/time/scene, arcs, open/closed loops, tombstones, story start, and cursor.
- Existing adaptive source-retry/split logic remains in use for each AI chunk.
- Existing temporal repair runs after completion.

## Static validation

- `node --check index.js`: PASS.
- `manifest.json` parses and reports `0.11.13`: PASS.
- Selective button has a bound click handler: PASS.
- Version badges and startup log match manifest: PASS.
- ZIP contains root extension files (`index.js`, `style.css`, `manifest.json`, docs): PASS.

## Runtime limitation

A real summarizer/API call cannot be executed in the build container because it requires the user's SillyTavern connection/profile. Runtime validation therefore still requires one in-app selective needsAI run.
