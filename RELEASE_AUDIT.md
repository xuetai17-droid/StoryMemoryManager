# Story Memory Manager v0.10.7 Release Audit

Audit target: GitHub upload package for SillyTavern.

## Scope

v0.10.7 is intentionally limited to:

- mobile-first settings UI polish;
- compact grouping of common automatic-management controls;
- folding low-frequency summary-model / cadence settings;
- non-invasive broken-image fallback for images inside chat message text;
- version and documentation updates.

No memory-core redesign is included in this release.

## Static validation completed

- `node --check index.js`: PASS.
- `manifest.json` JSON parse: PASS.
- manifest version: `0.10.7`.
- required native UI element IDs are present exactly once.
- public-package privacy scan for known private story names / locations / story-start date: PASS.
- package contains no chat JSONL, exported memory, API credentials, Connection Profile data, or `.bak` files.

## Core invariance check

SHA-256 comparison of the following `index.js` sections against the audited v0.10.6 GitHub baseline shows them unchanged:

- automatic hiding;
- JSON schema;
- open-loop normalization;
- open-loop merge / lifecycle;
- memory merge;
- summary execution (`summarizeRange`);
- safe memory injection.

Therefore v0.10.7 does not intentionally alter summary semantics, date continuity, semantic anchors, open-loop lifecycle, safe injection, or hiding behavior.

## UI checks

The following runtime element IDs remain unique and unchanged, preserving existing event bindings:

- `smm2_native_enabled`
- `smm2_native_auto`
- `smm100_safe_inject`
- `smm100_auto_hide`
- `smm100_keep_recent`
- `smm100_unhide_all`
- `smm93_summary_provider`
- `smm93_summary_profile`
- `smm93_summary_fallback`
- `smm93_summary_tokens`
- `smm2_native_trigger`
- `smm2_native_batch`
- `smm2_native_start`

## Broken-image fallback safety

The v0.10.7 fallback is scoped to `<img>` elements inside `.mes_text` only.

When an image fails to load it:

1. hides the browser's broken-image glyph in the current DOM;
2. inserts a small textual placeholder after the failed image;
3. removes the placeholder again if the same image later loads successfully.

It does **not**:

- modify the message JSON / JSONL;
- modify or replace the original `src` URL;
- fetch through a proxy;
- download or cache the remote resource;
- touch avatars or images outside message text.

Accordingly, v0.10.7 improves presentation of failed resources but cannot restore an image whose remote URL is actually dead, blocked, expired, or protected against hotlinking.

## Release caveat

Static and source-level checks passed. The final UI appearance and SillyTavern DOM integration should still be smoke-tested once after updating from GitHub, because browser/theme CSS and third-party message-card HTML can vary between installations.
