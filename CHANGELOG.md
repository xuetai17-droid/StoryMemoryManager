# Story Memory Manager v0.11.9

## 0 API preset-summary-first repair

- Fixed a major v0.11.4-v0.11.8 issue where code-mode backfill could ignore PLUTO XML `<abstract>` structure and re-extract tiny dialogue fragments from raw prose.
- Added direct XML parsing for `<abstract><serial>...<time>...<scene>...<plot>...</abstract>`.
- `<plot>` is now treated as the canonical no-extra-API timeline summary and is preserved directly (only whitespace/length cleanup).
- `<time>` now supplies absolute date + clock/range and `<scene>` supplies location.
- Existing legacy/colon-style summaries remain supported as fallback.
- If no structured summary exists, local fallback is deliberately conservative and will not promote a tiny dialogue fragment into long-term memory merely to satisfy coverage.
- Added a render-time weekday guard: displayed weekday is always derived from the stored absolute date, preventing stale `周五` text from appearing under a Monday/Tuesday date.
- Time-repair metadata lookup now also uses the v0.11.9 XML parser.

No original chat messages are modified. Code-mode rebuild remains 0 API.
