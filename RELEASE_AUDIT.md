# Release Audit — v0.11.17 HYBRID

- `node --check index.js`: PASS
- manifest version = 0.11.17: PASS
- UI version badges = v0.11.17: PASS
- startup log = v0.11.17: PASS
- legacy string fact crash path removed: PASS
- mixed primitive/object normalization guards added for timeline, facts, events, relationships, open_loops, semantic_anchors, character_anchors, active_arcs, items, locations: PASS
- no remaining direct `.fact=` assignment outside guarded object branch: PASS
- v0.11.16 delegated button binding and try/catch rollback behavior retained: PASS
- ZIP integrity: PASS

This release deliberately does not re-summarize story content and makes no API calls for entity cleanup.
