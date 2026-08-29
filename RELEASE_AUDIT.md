# v0.11.22 HYBRID Release Audit

- `node --check index.js`: PASS
- manifest version: 0.11.22
- visible version badge: 0.11.22（经典面板 + 原生扩展面板）
- JSON local repair regression tests: PASS
  - valid JSON containing Chinese curly quotes `“ ”` remains valid and unchanged
  - malformed stage JSON containing unescaped ASCII quotes around Chinese phrases is repaired locally
  - malformed English quoted phrase followed by prose comma is repaired locally
  - already escaped ASCII quotes remain valid
  - trailing commas and bare property names continue to be repaired
  - screenshot-shaped `stages[]` payload with multiple naked quoted phrases parses successfully after local repair
- Stage summary failure safety retained: previous `stage_summaries` are restored on failure; no partial stage result is persisted.
- v0.11.21 current-state resolver, injection audit UI and stage-summary schema are unchanged except for this JSON/output hardening.
- Original chat JSONL mutation: none added.
