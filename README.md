# Story Memory Manager v0.11.3

This build is a targeted reliability release for long-form SillyTavern chats.

Key behavior:

- Prevents summary cursor advancement when a real batch produces no traceable timeline.
- Detects large historical source gaps and blocks memory injection/auto-hide across them.
- Provides targeted “补总结缺失楼层”.
- v0.11.3 automatically normalizes common model source formatting, retries timeline extraction once, and adaptively splits a failing repair batch instead of requiring repeated manual attempts.
- Historical gap repair is rollback-safe and does not modify original chat JSONL.
- Date/time/location may be read only from the three exact world-state JSONPatch paths as bounded metadata; all other UpdateVariable data remains excluded from canonical story memory.

For the known gap, use the detected range `#1489-#1622` after updating. Keep automatic summary, memory injection, and auto-hide off until the repaired timeline is inspected.
