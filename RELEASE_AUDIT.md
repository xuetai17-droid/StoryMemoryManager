# v0.11.71 release audit

Confirmed root cause using the newly provided Rosenberg exports (161 messages, 30 timeline rows, cursor150): 66 historical assistant replies were hidden. SillyTavern uses is_system as prompt-exclusion visibility; the existing digest parser and archive reader erroneously rejected it as an author role. For actual source #6, narrativeSummaryRecords returned zero records when hidden but returned the explicit 2024-05-17 record when the same source was visible. The old raw exporter additionally serialized hidden assistants as role=system, conflating two concepts. In the baseline replay, exported visibility reproduced the wrong 14/15/16 date groups; making the same messages visible changed 23 dates without any model request. This demonstrates a local software defect, independent of provider policy errors from the earlier different chat.

Secondary confirmed issues: the raw source has <日历><月份><今日><事件> tags, while the extractor gated on a rendered STORY CALENDAR/剧情日历 marker and therefore returned null. A separate local fixture confirmed MM月DD日 prefixes were parsed using their initial month as a day (05月17日 became May5). Generic machine-date fallback could use the first data-date attribute without evidence of selection. These are corrected; generic fuzzy event matching is stricter and excludes future/planned matches.

New versioned pure modules avoid browser module-cache reuse: digest-parser-v01171 accepts hidden assistants but still rejects explicit system/user roles; character-archive-v01171 uses it and the same visibility rule. calendar-evidence-v01171 parses bounded raw Chinese calendar tags, requires valid explicit current dates, checks same-floor digest disagreement, and preserves future entries as future metadata only. No day is invented from month-only appointments.

Source-specific repair does not rewrite event text or source references. Unique-date sources are retained; mixed-source dates require a clear content match or remain a range. The source #23–#24 retrospective spanning Saturday/Sunday/Monday is retained as May18–20 rather than stamped May20 only. The #31–#44 planning record is matched to May20 instead of borrowing the current-day May22/14:31 at the end of the broad source range. The separate Tuesday recollection in #44 resolves to May21 from the explicit same-floor May22 anchor and weekday evidence; its unrelated 14:31 timestamp is cleared. A user-only #29 action is dated contextually from agreeing neighbors #28/#30, not labeled direct absolute evidence. Verified source repairs survive subsequent legacy normalization; cross-day grouping is explicit in the readable view and prompt. Repair persistence failures restore the prior in-memory record.

Executed tests/v01171-regression.mjs, including v69 API-cadence/failure and v70 hiding regression suites. New tests pass for hidden/visible source invariance, true system/user exclusion, raw Chinese calendar recognition, MM月DD日, unknown/future/month-only inputs, actual 23 date corrections, 18–20 cross-day record, May20/May21/May22 distinction, time rejection, contextual user dates, row/source/event/cursor/facts/characters/NPC/relationships/knowledge/tasks preservation, repeated-run idempotence, full current-state refresh invariance and metadata-save rollback. The old 46-message fixture remains 23 nodes/11 profiles/cursor44/08:05, and the prior pending-history protections remain intact. No real API requests were made.

The corrected user copy retains current state 2024-05-24 周五16:02, exactly30 timeline rows and cursor150; ten messages #151–#160 remain unprocessed. Original raw and memory export bytes are unchanged. The copy includes a source-checksum/date-change audit. Syntax, manifest/versioned compatibility entry and all ZIP imports were checked. Device installation, rendered grouping after update and actual model adoption remain device-side acceptance items; do not claim they were remotely verified. This release does not re-summarize or complete the ten pending floors.

## Previous audits

# v0.11.70 release audit

New device evidence (2026-10-23): main Chat Completion API reported context window full; user reports floors not hidden. The screenshot alone does not establish the current auto-hide setting or current cursor. The previously supplied 487-message export has cursor 240 and deferred range [[0,0]]; it is not treated as the current 900-plus-message state.

Confirmed code defects: autoHideSummarizedV0101 was only called after successful summarizeNew; toggling the checkbox saved a setting without applying it; zero-API digest reads and initialization did not run the hide path. The earliest deferred range clamped hideEnd to deferredStart-1, so #0 pending suppressed every later covered floor. It marked SMM ownership before importing/calling native hide, counted ownership instead of is_system, and refused subsequent retry when all ownership flags were already set. Native failure could therefore leave a misleading permanent hidden count.

Fix uses a pure source-coverage/deferred/keep-window planner. It never hides uncovered, pending or unprocessed floors and does not advance the cursor. Covered intervals on both sides of a gap can be handled separately. Eligibility comes from sourced timeline records plus durable local coverage. Existing deferred and large-gap ranges remain protected. A local dry-run World Info activation preflight runs before any new exclusion from the prompt; no model API is invoked. Native hide uses the official inclusive hideChatMessageRange(start,end,unhide) signature. Official release public/scripts/chats.js was inspected and confirmed it sets message.is_system and persists with saveChatConditional. SMM ownership is persisted with the corresponding operation; failed operations restore flags/ownership in memory and attempt native/save rollback. Disk persistence cannot be guaranteed if the server refuses the rollback save too.

Statistics count SMM ownership only when is_system is true, expose stale markers, and report all unhidden/unsummarized counts. The one-shot button works even with automatic mode off. Automatic mode remains opt-in, applies when enabled and on retained-count changes, and is checked on chat load, new messages, successful digest intake and summary completion/failure. It can hide previously covered history while a new summary is paused, without sending another summary request. Increasing the retained window or reducing the cursor restores SMM-owned messages that have become ineligible; foreign hidden messages are not owned/restored. Restore-all turns automatic hiding off. No generated-chat-array interceptor mutation was introduced.

Executed tests/v01170-regression.mjs, including the v01169 regression suite, with fake fetch/native persistence: deferred #0, middle holes, uncovered sources, last-30 retention, expanded last-60 retention, cursor rollback, stale-marker retry and actual-flag counts, foreign ownership, native import failure and retry, native save failure rollback, no-op native detection, inactive-book/off guards, one-shot operation, idempotence and cross-chat preflight cancellation all passed. Source message strings and processed cursor remain unchanged. The supplied old export plans/hides known history while leaving #0 and all 246 unprocessed messages visible. The earlier 46-message export regression still produces 23 timeline nodes/11 profiles/cursor44/08:05, with no network or inferred knowledge. Syntax, manifest entrypoint, imported modules and ZIP integrity passed.

Limitations: no current phone state export was provided; hiding and context-window recovery on the phone remain to be verified. Large unsummarized history must remain in the input until it has reliable memory coverage; this patch is not a force-crop-to-30 switch. Fixed preset/worldbook/tool token overhead and the model's real context size can independently cause overflow. Native hiding retains messages and changes their prompt participation, not their existence in the chat UI. No real summary/main-model API call, credential access, original chat deletion or raw content rewrite occurred.

## Previous audits

# v0.11.69 release audit

Observed new evidence: user configured triggerMessages=30 and batchMessages=50, but direct API button still stated max 10. One failed request returned 400 after 4.2 seconds; a subsequent request returned 503 after 3.2 seconds. Screenshots did not contain response bodies, so the true provider/model route failure cannot be determined. Key invalidity, context overflow, unsupported fields or route availability have not been inferred as established causes.

Code cause for cadence inconsistency: native setting handler saved triggerMessages, but autoSummaryThresholdV01162 and paidRoutineBatch read the legacy autoBatchMessagesV01145 default 10; inner summarizeNew independently gated on triggerMessages. Consequently diagnostic thresholds, actual paid batch caps and outer/inner gates disagreed. New shared pure policy uses triggerMessages for cadence, caps paid routine batches by min(triggerMessages,batchMessages), and renders dynamic values. Legacy migration no longer resets an existing explicit 30. Historical manual catch-up retains its separate 15-message cap; token/byte adaptive shrinking remains active. Thirty refers to combined user and assistant messages, not thirty assistant-only turns.

HTTP diagnostic cause: previous code read response.text() but rethrew a generic HTTP error, discarding the returned reason from user-visible errors. New extraction captures limited structured message/code/type/param, redacts current API key, Bearer authorization and common key fields before truncation, adds non-authoritative hints, and persists the safe diagnostic in the originating chat on failure. The diagnostic does not contain request headers, credentials or full chat prompt/response. Global diagnostic projection is now scoped to chat metadata; persistent records remain available on reload. The unchanged minimal request still contains only messages and model; no guessed provider parameters, fallback routes or retries have been introduced.

No real summary or verification API was called. GitHub origin was fetched read-only; at verification origin/main manifest still selected v0.11.67. v0.11.69 includes the earlier local v0.11.68 archive and mode-refresh corrections without changing existing selected mode/provider/credentials/auto settings or clearing failure pauses.

Executed tests/v01169-regression.mjs with a fake fetch implementation and neutral source fixture: 29 pending messages makes zero requests; 30 pending messages makes exactly one actual request covering 30, not 10, when size fits. Simulated HTTP 400 and 503 persist detailed, redacted errors, preserve canonical memory/cursor, and block subsequent automatic attempts. A deliberate manual retry makes one additional request. Diagnostics persist after module-global reset and are absent in another chat. Simulated valid line-protocol success commits once. A chat switch before response consumption prevents parsing/commit. Old settings migration preserves 30. Pure zero-API digest mode continues handling unknown dates and sparse character fields.

Original 46-message export regression also passed: 22 digests produce 23 timeline records and 11 profiles, cursor 44, date 2024-08-27, scene time ending 08:05, no inferred knowledge. A repeated read is idempotent and the original export bytes are unchanged; no network requests. JavaScript syntax, manifest, import closure and ZIP integrity passed.

Actual device/provider 400 and 503 resolution remains unverified: their old bodies are unavailable. Future real-task errors will show the new safe details; viewing details is local and free. Failure pause remains in place on update, avoiding automatic paid diagnostic calls. Do not describe this release as proving the user's API fault is fixed.

## Previous audits

# v0.11.68 release audit

Existing profile parser accepted only location/clothing/identity/age/gender. Worldbook projection retained only stable fields and capped the visible cast at four. Added a separate pure archive parser for existing assistant Memory profile rows, bounded to already processed sources, excluding user/system and thinking text. Adds explicit companions; stores relationship labels, numeric affection and task notes as separate attributed source claims rather than canonical relationship/knowledge/open-loop states. Latest nonempty field records win by source while manual unsourced fields are preserved. No missing character is removed.

The existing read-summary action now also backfills already scanned profiles; when only profiles change it does not add timeline rows or advance the cursor. Metadata-save failure rolls back. Worldbook sync failure is reported after a successful save. Existing chat identity checks protect both commit and book synchronization. All stored fields remain available even if low-priority World Info rows are trimmed.

Projection provides up to 16 compact static identities, relevant last-recorded transient fields, and the latest original digest portrait. Location/clothing/companions have explicit history/source semantics. Old numeric relationship/task claims are never asserted as current, confirmed knowledge or pending tasks. Portrait-only continuation does not infer structured location/clothing/relationships. Raw portraits are capped in the prompt; total projection retains the 8,500-character limit. Full semantic profile updates cannot be promised from unlabeled literary text.

Removed a call from the global mode selector to a function scoped inside the native binding function; this caused the v167 selector to save the mode but stop before refreshing its labels. New tests do not supply a fake global definition for that function.

Local validation used the original 46-message export: 22 digests/23 timeline rows/11 characters, initial cursor 44, scene 2024-08-27 08:05; original input unchanged, zero paid requests. Expanded checks passed for archived companions and source notes, scanned-row backfill, idempotence, save-failure rollback, no inferred knowledge, malformed digest rollback, portrait-only new reply, chat-switch preflight safety, native/legacy selector option and mode switching. Initial projected memory was 6,101 characters, higher than v166 because it now carries more profile context. Syntax/import and ZIP checks passed.

Device acceptance remains: upload all nine ZIP files to GitHub, update/reopen, and click read-existing-summary once in the same chat. Device verification of this version's archive view and final model request remains pending. Prior v166 dry-run selected 4,268 characters; that does not prove the final request or model adoption for the expanded projection.

## Previous audits

# v0.11.67 release audit

Device screenshot showed only AI/local options in the native mode selector, despite the digest handler existing. The native HTML omitted the digest option, whereas the legacy menu included it but mapped its change event incorrectly to local. Both are corrected. Summary auto controls in the legacy panel now route to chat-local digest settings when appropriate. Digest UI disables API configuration controls and displays the zero-summary-API path. Switching modes disarms global paid autoSummarize; it does not change existing memory, cursor, chat book binding or explicitly enabled chat-local digest intake.

Validation: actual 46-message export retained 22 digests, 23 timeline rows, 11 character snapshots, initial cursor 44, scene end 08:05. Existing malformed/save-failure rollback, idempotence, book synchronization, activation hit/miss and time repair checks passed. Added native/legacy HTML option checks, recovery from explicit digest opt-out, both menu selection values, correct automatic label, disabled provider control and paid automatic disarm when switching modes. Zero paid calls; original export unchanged. JavaScript syntax and ZIP entrypoint/import integrity passed.

Previous phone evidence: v0.11.66 ST World Info dry-run selected the complete 4268-character SMM memory body. This is not verification of the final main model request or model adoption. v0.11.67 menu selection still needs phone confirmation; no additional paid test is necessary.

## Previous audits

# v0.11.66 release audit

Observed device evidence: current chat book contains actual SMM text; duplicate attributed/unattributed recap facts and premature downgrade of explicit time intervals were visible.

Changes: digest timeline rows excluded from legacy keyword promotion; dedup ignores the attribution prefix for display only; recap evidence now carries both interval endpoints; source-matched repair preserves memory row count and processed cursor. No character knowledge inferred. Existing stored facts are preserved.

New activation preflight uses the current context's getWorldInfoPrompt(reverseChat, maxContext, true). It checks enabled constant SMM entry and looks for the complete selected memory body. Current chat-completion context size is used for OpenAI-compatible backends. No Generate/sendRequest/summary request or global budget change. Missing scan API or context size reports an incomplete check instead of guessing. Preflight is not proof of final model request inclusion or model adoption.

Local tests passed: original 46-message export, 22 digests/23 timeline rows/11 character snapshots, cursor 44, 4 source-time conflicts, current date/time 2024-08-27 08:05; no paid API calls. Added checks for prefix dedup, skipped duplicate promotion, restored intervals, activation match/miss, and existing rollback/idempotence checks. Phone-side preflight remains to be run.

## Previous audits

# v0.11.65 HYBRID Release Audit

Actual export used locally: story-raw-chat-1792001629198.json. 46 messages, 23 assistant messages, 22 complete digests. The initial greeting #0 has no digest; the last user message #45 has no response.

Validated runtime results: 23 timeline records, 11 named character snapshots, scan cursor #44, current scene 2024-08-27 08:05. #36 retains a 2024-08-26 record and a 2024-08-27 record. Conflicts at #4, #6, #10, #32 retain the literary digest marker instead of substituting a disagreeing Memory endpoint. These are source annotations, not independent semantic verification of the story.

Mocked integrated checks passed: existing worldbook synchronization; second-click idempotence; malformed digest causes no batch commit or cursor advance; metadata save failure rolls back; automatic digest intake ignores an external API circuit lock because it sends no API request; original export unchanged; no inferred knowledge states. Prompt length in the tested initial snapshot: 4,266 characters.

Both manual and automatic digest paths make zero summary API calls. The automatic setting is chat-local. Missing digests are not silently upgraded to paid requests. Only bounded Memory character fields are carried; private psychology, generic relationship labels, and inferred knowers are not generated. Missing #0 remains deferred; original greeting stays in the chat.

Android acceptance: upload all ZIP files to the GitHub repository root, update the installed extension, reopen the page and verify v0.11.65. On the same bound chat, click “读取已有摘要（0 API）”; inspect the saved memory/worldbook. Actual final prompt placement and model adoption remain to be checked on the phone, without an extra summary request.

## Previous audits

# v0.11.64 HYBRID Release Audit

- One click creates an SMM-owned World Info book for the current chat, writes the current confirmed memory table, and binds it as this chat's Chat Lorebook.
- Future SMM memory saves update only the marked SMM entry. No import/export step, global binding, or summary API call is needed for setup/sync.
- If another chat lorebook is already assigned, SMM asks before switching; it preserves the old book file. Missing APIs or a mismatched entry marker stop safely.
- Automatic summary remains opt-in. Its trigger threshold defaults to 10; failures pause automatic attempts and preserve the cursor.
- The mobile panel foregrounds one-click chat memory setup, summary, and memory preview; repair controls and model configuration remain under advanced details.
- Local validation: JavaScript syntax, manifest JSON, and mocked one-click create/bind/sync. Android/ST 1.18.0 final prompt placement and model adoption remain device-side checks.

- v0.11.64: manifest points to a newly named script; both UI badges and the load log read the same version constant. No selected character/group means setup stops before World Info or memory writes.

## Manual Android acceptance check

1. Install the zip, reload SillyTavern, and verify that the SMM title shows v0.11.64 before opening a test chat.
2. Tap **一键启用本聊天记忆**. Confirm that SMM reports success and the current chat has an SMM Chat Lorebook.
3. Inspect the prompt once: the SMM entry should show the current memory table.
4. Keep automatic summary off until ready; setup and synchronization send no summary request.

## v0.11.61 HYBRID Release Audit (historical)

- Exports six always-active World Info entries, each rendering one SMM memory section through a dedicated macro; the legacy aggregate `smm_memory_table` macro remains registered for older v0.11.60 lorebooks.
- Section groups preserve the existing SMM storage and priority rules: usage instructions, current state, knowledge/facts, people/relationships, timeline, and plot/continuity.
- The exported World Info is still chat-bound by the user. No SMM data migration or summary API request is required to export it.

## v0.11.60 HYBRID Release Audit

- Exports a single constant World Info entry whose content expands the synchronous `smm_memory_table` macro to the active chat's current SMM table.
- Per-chat Worldbook mode clears only the current chat's SMM extension prompt to prevent double injection; disabling worldbook mode restores the extension-prompt channel.
- Exported lorebook is independent and must be imported and bound by the user. SMM does not modify existing World Info files or chat JSONL.
- Local tests validate worldbook JSON shape, constant activation, macro handler output, channel exclusivity, syntax, and current-memory table rendering; no summary API call.
- Mobile SillyTavern final-prompt expansion/binding has not been exercised in this environment.

# v0.11.59 HYBRID Release Audit

- Generation prompt now renders explicit labeled table sections with per-row source floors instead of a single JSON blob.
- Knowledge state remains separate from author-level facts; absent knowledge rows are labeled as unrecorded rather than treated as proof of awareness or ignorance.
- Existing SMM memory model, extension-prompt location/depth, injection toggle, and 8,500-character cap are preserved.
- The output is not a SillyTavern World Info entry and does not consume Yuzi's `{{MEMORY_TABLE}}` variable; it remains an SMM extension prompt. Final phone-side prompt placement is unverified.
- Local simulation used the supplied SMM memory export and a synthetic, sourced per-character knowledge row; verified source visibility, knowledge boundary text, and length cap. No API request; no chat JSONL, memory record, or cursor mutation.

# v0.11.58 HYBRID Release Audit

- Failure pause is stored in current-chat metadata; failure does not advance `last_processed_index` or commit new memory. A later event cannot silently repeat the same automatic model request. A deliberate manual action clears the pause.
- Local panel diagnostics distinguish plugin disabled, auto toggle disabled, no observed `MESSAGE_RECEIVED`, below-threshold pending count, active catch-up, and failure pause. The diagnostic cannot reconstruct pre-upgrade event history or read a phone's local extension settings from an exported memory JSON.
- `knowledge_states` accepts only explicit statuses with a real source inside the active batch and at least one named knower/unaware person. Invalid or out-of-batch states are excluded and audited. Timeline/facts remain the canonical long-term architecture.
- Generation injection labels keyword-promoted facts as author-level truth and only supplies person-level knowledge from explicit knowledge-state records; unknown awareness remains undetermined and may not be disclosed.
- No API is used during migration/repair. Original chat JSONL is unchanged.

# v0.11.57 HYBRID Release Audit

## v0.11.57 memory injection audit

- Coverage gaps are disclosed but no longer suppress already-confirmed memory.
- Canonical facts, critical historical knowledge, current roles, relationships, and recent events are injected separately.
- Critical identity/investigation knowledge is retained across ordinary fact-window pruning.
- Existing timeline knowledge is promoted locally with zero API calls.

## v0.11.55 preset calendar audit

- Reads explicit date attributes, selected calendar cells, and rendered calendar state.
- Matches named calendar events to their own day before using the selected current day.
- Reprocesses existing timeline dates locally with zero API calls and no cursor movement.
- Removes protocol-header artifacts without removing story events.

## v0.11.54 direct line-protocol audit

- Direct external prompt explicitly requests non-JSON `SMM-LINES-1` records.
- Local parser converts valid T/F/P/N/R/C records without any model retry.
- A refusal or malformed record cannot commit memory or advance the cursor.
- Legacy JSON, JSON repair, and restarted-root recovery remain available.

## v0.11.53 restarted JSON audit

- Trigger observed: a timeline event string was interrupted by a second `{"story_start":...}` root, producing a concatenated malformed response.
- Parser locates repeated root markers and tries candidates newest-first. It only accepts a candidate that passes the existing local JSON parser/repair stages.
- Direct external schema retains all original properties but marks only timeline as required, so the transmitted skeleton is substantially smaller while optional delta categories remain supported.
- No restart recovery, delimiter repair, source recovery, or validation path invokes the API.

## v0.11.52 traceable timeline recovery audit

- Trigger observed: HTTP 200 / usable JSON for batch `#36-#45`, followed by zero traceable timeline nodes and cursor preservation.
- Relative sources are mapped only when every referenced ordinal fits the current batch size; dates and out-of-range values are rejected.
- Timeline recovery only accepts entries carrying a source that resolves inside the current batch.
- Recovery priority: events → semantic anchors → facts → relationships → NPC summaries; maximum 12 recovered nodes.
- The recovered delta still passes the unchanged commit validator. Zero-source responses remain rejected; no second API request exists in the recovery path.

## v0.11.51 malformed JSON audit

- Trigger observed: `Expected ',' or ']' after array element ... position 865` after a successful paid response.
- Repair order: strict `JSON.parse` → existing safe string repair → iterative delimiter/bracket repair.
- The iterative stage uses the engine-reported error position and JSON structural stack; it does not call any model or API.
- Valid JSON is never rewritten. A repaired object still passes the unchanged summary sanitizer, source validation, commit validation, merge rollback, and cursor rules.

## v0.11.50 strict direct-API audit

- Reference reviewed: Memory Palace commit `9d291e9be16d114f1a5a2ff27a1d19a9da4b983c`; its external summary path uses plain fetch, a merged user message, optional model, and no plugin timeout.
- SMM direct body now has only `messages` plus optional `model`; credentials remain headers only and are never logged.
- SMM no longer applies the 120-second outer Promise timeout or AbortController timeout to direct external summaries.
- Direct prompt is an incremental delta prompt. Historical ceiling is 15 messages with a 36,000-token / 144,000-byte target; routine ceiling remains ten.
- Exactly one request per accepted click. HTTP errors, gateway HTML, non-JSON, invalid summary JSON, and validation failures do not merge memory or advance the cursor.
- Cloudflare 520/524 remains an upstream host failure and cannot be repaired client-side.

## v0.11.49 adaptive request audit

- Historical candidate window: at most 30 messages.
- Routine automatic candidate window: at most 10 messages.
- Actual range is selected locally against the fully assembled compact-skeleton request, targeting 28,000 estimated input tokens / 112,000 bytes.
- A single oversized message remains sendable because the user-requested fee guard is disabled.
- Accepted clicks immediately disable the action button and expose the exact range/count/estimate.
- Exactly one generation call per accepted click; no automatic retry, split retry, fallback, memory write, or cursor advance on failure.

## v0.11.48 30-message catch-up audit

- Historical catch-up batch size is fixed at 30 while routine automatic batches remain 10.
- A 147-message snapshot resolves as 30 + 30 + 30 + 30 + 27.
- Existing per-chat snapshot and checkpoint metadata from v0.11.46/v0.11.47 are reused without reset.
- Disabled cost-protection behavior, one-request-per-click, transaction boundaries and automatic pause remain unchanged.

## v0.11.47 disabled cost-protection audit

- Request-size statistics remain visible, but no token or byte threshold blocks transmission.
- Profile and direct-API circuit-open checks always remain false under the explicit disabled policy.
- All previous circuit state is cleared on migration; configuration verification remains required.
- Transport, JSON and commit failures do not lock the provider and do not trigger an automatic retry.
- Cursor, memory and historical catch-up checkpoints still advance only after a valid transactional commit.

## v0.11.46 historical catch-up audit

- The first manual paid action snapshots the current chat's pending end index into chat metadata.
- While the snapshot remains active, each manual click selects at most 50 messages and performs one completion request.
- A 147-message snapshot resolves as 50 + 50 + 47; only successful transactional commits advance the stored checkpoint.
- Messages appended after the snapshot are excluded from historical batches.
- Automatic paid generation is paused during catch-up and resumes at 10 pending messages only after the snapshot is complete.
- Cancellation, local size rejection, transport failure, invalid JSON and commit rejection preserve both cursor and catch-up state.

## v0.11.45 batch policy audit

- First successful manual paid catch-up selects exactly the next 50 messages and still performs one completion request.
- The exact request size and source range are shown before transmission; cancellation performs zero completion calls.
- The one-time path has an absolute 120,000-token / 480,000-byte local ceiling; routine requests keep the 30,000-token / 120,000-byte guard.
- The one-time flag is cleared only after a successful transactional commit. Failure, cancellation and local rejection preserve it.
- After success, paid manual and automatic summaries use 10-message batches; automatic triggering waits for 10 pending messages.
- Local simulations cover ordinary-limit rejection, one-time confirmation, cancellation, absolute-limit rejection and policy constants.

## v0.11.44 recap clock audit

- Parses labelled assistant recap ranges such as `2026-09-20 07:51—23:47`.
- Uses opening-card date/weekday/range only as fallback and rejects ordinary message timestamps.
- End-of-reply structured recap wins when opening and recap ranges conflict.
- Existing timeline rows are recalibrated locally through a cache-version bump; no API request or cursor movement is involved.

## v0.11.43 model discovery audit

- `/models` can be fetched with endpoint and key only; no model ID or completion request is required.
- A model can be selected only from the current fetched list, after which the existing verified fingerprint gate is enabled.
- Endpoint or key changes clear cached models and prior verification.
- Nested direct-API controls have explicit full-width mobile layout rules.

## v0.11.42 direct API audit

- Direct transport mirrors Memory Palace's OpenAI-compatible `/chat/completions` approach and bypasses Connection Manager conversion.
- `/models` verification sends no completion request and is invalidated whenever endpoint or model changes.
- Completion body is restricted to `messages` plus `model`; one click can send at most one six-message paid batch.
- Transport, gateway, parse and commit failures preserve the cursor and open the selected provider circuit breaker.
- Existing memory schema, chat metadata and original JSONL are unchanged.

- 事故依据：`api.astroflowing.com` 返回 Cloudflare 520，浏览器与 Cloudflare 正常、Host Error；请求无有效输出但供应商已计费。
- 一键一调用：独立 Profile 的普通总结按钮即使由手动 force 路径触发，也会在第一个批次后退出；静态回归检查覆盖循环守卫。
- 批次整形：独立 Profile 每批上限 6 条，输入 30,000 tokens / 120,000 bytes，输出 3,072 tokens。
- 错误识别：递归提取嵌套错误对象，覆盖 Cloudflare 520–526 HTML、状态码和文案；Connection Manager 仅返回通用 `API request failed` 时仍执行通用熔断。
- 持久熔断：400、520–526、超时、空响应、非 JSON、source/提交失败均锁定当前 Profile；锁定检查位于 `sendRequest` 之前。
- 解锁边界：设置页手动解锁只修改本地设置，不发起 API；切换到不同 Profile 不继承另一个 Profile 的活动锁，但该 Profile 一旦失败会单独成为当前锁定目标。
- 事务边界：失败不合并记忆、不推进游标、不隐藏楼层；原始聊天 JSONL 不读写。
- 模拟验证：成功、发送前拦截、3,072 输出上限、400、嵌套 HTML 520、524、超时、非 JSON、锁定后二次点击零调用、手动解锁全部通过。

## v0.11.40 历史审计

- 根因修复：完整 JSON Schema 不再进入模型请求；改为按 required 字段生成紧凑单行 JSON 骨架。
- 发送前保护：请求在本地按字符类型估算 token，并计算 UTF-8 bytes；超过 42,000 tokens 或 160,000 bytes 时在 `sendRequest` 前抛出专用错误，提示未调用 API、未扣费。
- 输出保护：独立 Profile 输出上限硬锁 6,144 tokens，设置页与旧设置迁移同步收紧。
- 单次调用：删除独立 Profile 的自动 fallback；删除 source 失败后的自动拆分和 timeline 二次生成。一个批次一次请求，任何失败都等待用户手动重试。
- 事务保护：解析和校验仍位于 merge/游标推进之前；400、524、超时、空响应、非 JSON、source 越界均不会写入 canonical memory 或推进游标。
- 配置保留：不修改 API 地址、密钥、Connection Profile、选中 Profile、既有长期记忆或原始聊天 JSONL。
- 更新配置：manifest 版本为 0.11.40，`homePage` 指向 `https://github.com/xuetai17-droid/StoryMemoryManager`，`auto_update` 为 true。
- 本地验证：覆盖紧凑骨架体积、发送前阻止、输出上限、成功单次调用、400/524/超时/非 JSON 单次失败与游标/记忆不变。

## v0.11.39 历史审计

- 触发问题：独立 API 已连通，但上游把 Connection Manager 的通用 `json_schema` 转成 Gemini `generation_config.response_schema`；其中 `type:["string","null"]` 等标准 JSON Schema 写法不被其 Proto Schema 接受，返回 HTTP 400。
- 请求修复：独立 Profile 的 override payload 固定为空，不再发送 provider-specific `json_schema` / `response_schema`；完整 Schema 仅作为提示词内容发送。
- 安全边界：响应仍经过本地 JSON 解析、清理、source 楼层约束与 batch commit 校验，只有 timeline 非空且可追溯时才推进游标。
- 请求次数：每批一次；未增加修复请求、自动重试或付费 fallback。若用户明确开启回退，当前聊天模型会收到同一完整 Schema。
- 配置保留：不修改 Connection Profile、API 地址/密钥、SMM Profile 选择、已有记忆、隐藏状态或原始 JSONL。

- 变更范围：仅优化总结方式控件及其状态展示；不触碰 canonical memory、时间线、楼层处理游标、隐藏逻辑或原始聊天 JSONL。
- 问题根因：旧选择器使用 `flex: 1 1 220px`；移动端父容器切为纵向后，220px basis 变成垂直尺寸，叠加主题样式后形成巨型空白框。
- 尺寸约束：原生设置页选择器强制 `flex:none`，桌面高度 42px、窄屏高度 40px，并固定 min/max-height，避免第三方主题再次拉伸。
- 信息层级：总结方式以紧凑卡片显示；徽标区分 AI 语义、独立 API、实验模式，帮助文字保留失败不写入提示。
- 状态同步：Connection Profile 的创建、选择、更新与删除事件会同时刷新 Profile 控件、徽标、总结按钮和统计文字。

- 基线：保留时间/地点追踪、双时间轴、月份精度、注入诊断、阶段大总结与 JSONL 保护。
- 参考实现：核对 SillyTavern Memory Palace 的分批结构化总结、主要角色判定、NPC 独立存储和按命中注入逻辑。
- 总结运输：当前通道使用一次 `generateQuietPrompt({quietPrompt})`；同一提示词含系统规则、完整 JSON Schema、已有可靠记忆、人物/NPC 分类参考及 USER/CHARACTER 真实楼层。
- 总结质量：明确要求语义合并、关键行动/因果/结果和独立可理解事件；禁止逐楼复制玩家输入或把玩家提议直接写成完成事实。
- NPC 分区：`npcs` 与 `characters` 分离，只保存 identity/brief/current_status/aliases/source；写入前再次校验主要角色和本批 source。
- 主要角色保护：当前玩家与当前角色永不进入 NPC；角色卡/世界书候选名必须在真实正文反复出现；模型误分项会被拒绝或修回主要人物表。
- 注入控制：NPC 只有在最近正文或当前场景命中姓名、身份或别名时才发送，最多 6 个。
- 提交事务：JSON、本批 source 与 timeline 校验通过后才合并并推进 `last_processed_index`；NPC 越界 source 单独拒绝。
- 失败事务：空响应、非 JSON、524、120 秒超时和 timeline source 校验失败均不写入、不推进游标、不切换本地模式。
- UI/兼容：记忆浏览、搜索、统计、注入诊断、导入和 v4 兼容视图均包含 NPC 分区。
- 版本：源码头、两处界面徽标与 manifest 均为 0.11.39。
- 验证：JS 语法、manifest JSON、v0.11.27、v0.11.29/v0.11.32、v0.11.33、v0.11.34、v0.11.36、v0.11.37、v0.11.38、v0.11.39 回归通过；v0.11.35 的“摘要面板自动成为 canonical timeline”测试已由 v0.11.36 的安全策略明确取代。
- 原始数据：测试与迁移均不写入、删除或改动原始聊天 JSONL。
