# v0.11.19 HYBRID Release Audit

- `node --check index.js`: PASS
- manifest version: 0.11.19
- visible version badge: 0.11.19
- Main fix: `refresh()` now calls `refreshSafeMemoryInjectionV0100()` so CHAT_CHANGED / MESSAGE_RECEIVED / MESSAGE_SENT / edit/delete refresh the extension prompt for the current chat.
- Added injection audit UI: reports switch state, gap blocking, payload counts, prompt length, and the exact SMM continuity prompt that is eligible for injection.
- Existing legacy `generate_interceptor` remains intentionally no-op; this release continues to use SillyTavern `setExtensionPrompt` and does not mutate/save the chat array.
- v0.11.18 JSON repair and timeline display behavior retained.
