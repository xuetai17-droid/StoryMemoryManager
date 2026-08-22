# Story Memory Manager v0.11.15 HYBRID — Release Audit

## Scope
This release is a cleanup/stability pass over v0.11.14. It does not re-summarize chat and does not require API calls for entity repair.

## Fixed
- Generic user entities in entity fields: `User / 用户 / 主角 / 玩家 / 你 / 您 / {{user}} / <user>` resolve to the current SillyTavern user-character name.
- Safe short-name to full-name canonicalization is inferred only when exactly one existing `名·姓` character owns that short name, e.g. `科尔 -> 科尔·布雷迪`.
- Duplicate character keys are merged. Canonical/full-name rows win conflicts; alias rows may only fill missing data.
- Entity repair is applied across timeline, facts, events, relationships, open loops, semantic anchors, character anchors, active arcs, items, locations and current scene.
- Relationships are normalized again after canonicalization, so duplicate alias pairs collapse to the newest source-backed relationship state.
- Obvious group labels accidentally stored in `characters` are removed from the person-entity pool. Group relationships are not expanded into invented individual relationships.
- Quality audit adds generic-character-key, alias-character-duplicate and duplicate-relationship-pair counters.

## Safety rules
- No fuzzy name similarity matching.
- No merge when one short name maps to multiple full-name candidates.
- No global replacement of the pronouns `你/您` inside prose/quoted dialogue; those are only canonicalized when they are entity fields/keys.
- Source/date/time fields are not rewritten by entity cleanup.
- Existing v0.11.14 timeline/source/time protections remain in place.

## Validation performed
- `node --check index.js`: PASS.
- `manifest.json` parse/version `0.11.15`: PASS.
- UI badges and load log show `v0.11.15`: PASS.
- Synthetic entity test: PASS.
  - `你 -> 薛伶`
  - `科尔 -> 科尔·布雷迪`
  - `尼科 -> 尼科·索拉诺`
  - duplicate relationship pair collapses to newer source state
  - group character row removed
- Real exported memory regression (`story-memory-1787320494743.json`): PASS.
  - characters: 14 -> 12 after entity normalization
  - removed duplicate `科尔` and generic `你`
  - canonical full-name entities preserved
  - no residual generic character keys in tested memory
- Package contents and SHA256 checked after build.

## Recommended first action
After updating, keep automatic summary / memory injection / auto-hide off for the first validation run. Use:
`更多工具 -> 历史重建 -> 修复全部实体 / 关系去重 / 质量审计（0 API）`
Then inspect Characters and Relationships before re-enabling automation.
