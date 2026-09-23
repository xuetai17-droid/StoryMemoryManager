# Changelog

## v0.11.54 HYBRID

- Direct external summaries now request a plain-text `SMM-LINES-1` protocol instead of JSON.
- Added local conversion of timeline, facts, primary characters, NPCs, relationships, and current scene into the canonical memory delta.
- Kept one request per batch, no paid repair retries, cursor preservation, and backward-compatible JSON parsing.

## v0.11.53 HYBRID

- Added local recovery for restarted or concatenated root JSON objects, preferring the latest complete root.
- Reduced the direct-API compact skeleton to a required timeline core; other memory categories remain optional incremental fields.
- Preserved all v0.11.52 source normalization and local timeline recovery behavior.
- No parsing or recovery path makes another API request.

## v0.11.52 HYBRID

- Required at least one timeline item for narrative batches in the compact external prompt.
- Added strict relative-to-absolute batch source normalization.
- Added local timeline recovery from already-paid sourced events, semantic anchors, facts, relationships, and NPC records.
- Recovery performs zero additional model/API calls and retains the existing commit guard.

## v0.11.51 HYBRID

- Added iterative local recovery for missing commas between array elements and object properties.
- Added local completion of missing closing array/object delimiters.
- Kept repair strictly local: no model retry and no additional API charge.
- Preserved all existing validation, failure rollback, and cursor-safety behavior.

## v0.11.50 HYBRID

- Matched Memory Palace's direct external API transport: minimal body (`messages`, optional `model`) and plain fetch without SMM's 120-second abort.
- Added a compact incremental direct-API prompt while retaining the existing long-term memory merge/validation architecture.
- Historical batches now use a 15-message ceiling and 36k estimated-input target; routine automatic batches remain capped at ten.
- Added per-request diagnostics (anonymous request id, elapsed time, HTTP status, input estimate) without logging credentials or chat text.
- Preserved one request per click, no automatic retry/fallback, no write on failure, and cursor preservation.

## v0.11.49 HYBRID

- Replaced fixed 30-message historical requests with local token/byte-adaptive planning (28k token target, 30-message ceiling).
- Applied the same adaptive ceiling to later automatic 10-message API batches.
- Added immediate busy/disabled button feedback and visible request range/count/token estimate.
- Preserved single-request, no-auto-retry, no-commit-on-failure, cursor-preservation semantics.
- Previously processed raw messages are not re-sent; only compact memory is used for continuity.

## v0.11.48 HYBRID

- 将历史补总结从每批50条下调为每批30条，缓解直接外部 API 请求超时。
- 147条积压按30＋30＋30＋30＋27处理；每次点击仍只发送一个请求。
- 保留当前聊天已经建立的历史快照、断点和成功记忆，不重置游标。
- 费用保护继续关闭；失败后不锁定，可由用户从原断点再次手动点击。
- 历史范围完成后，新增剧情仍固定每10条自动总结。

## v0.11.47 HYBRID

- 按用户明确选择关闭全部费用保护：取消输入长度阻止和失败后的持久接口锁定。
- 旧的 Profile/直接 API 锁定在升级时自动清除；失败后无需重新拉取模型即可手动重试。
- 保留首次 /models 验证门、每次点击一次请求、零自动重试和事务式游标保护。
- 历史50条批次仍显示预计 token/字节数并要求确认，但不再因数值过大而本地阻止。
- 保留v0.11.46的历史快照、50＋50＋47断点以及历史完成后每10条自动总结。

## v0.11.46 HYBRID

- 将v0.11.45的一次性50条改为按聊天保存的历史范围：未完成前可反复手动执行50条批次。
- 147条历史积压按50＋50＋47处理，共3次付费请求；每次仍只发送一个批次。
- 历史范围在第一次手动点击时快照锁定；期间新增消息不会被混入历史批次。
- 历史补总结期间暂停自动付费总结；历史全部提交成功后，自动模式固定每10条触发。
- 历史进度写入聊天元数据；失败、取消或本地超限后保留断点和原楼层。
- 设置页显示历史剩余数量，按钮明确标为“继续历史补总结（最多50条）”。

## v0.11.45 HYBRID

- 新增一次性手动50条历史总结；只对升级后的首个成功独立 API 批次生效。
- 50条请求发送前显示准确输入估算与楼层范围，并要求用户二次确认。
- 一次性批次使用120,000 tokens / 480,000 bytes绝对上限；普通批次继续使用30,000 tokens / 120,000 bytes保护。
- 一次性批次成功后自动切换为每10条一次；付费通道累计10条新消息后才执行自动总结。
- 取消、超限、520–526、超时、非 JSON 或提交校验失败都不消耗一次性资格、不推进游标、不自动重试。

## v0.11.44 HYBRID

- 修复角色卡可见摘要已经包含准确日期/时分，但 SMM 只读取状态栏时间并将分钟降级的问题。
- 新增摘要时间范围与开头卡片时间范围解析；末尾摘要优先，消息发送时间明确排除。
- 新增 `SMM_ROLE_RECAP_TIME` 白名单提示行，只向总结器提供同楼剧情日期/时间，不提供额外变量。
- 时间证据审计认可同 source 的结构化角色卡摘要，即使剧情轴与现实轴日期不同也保留精确时分。
- 升级时使旧时间校准缓存失效，自动以 0 API 修复已有时间显示。

## v0.11.43 HYBRID

- 直接 API 改为先 GET `/models`，再通过下拉列表选择总结模型，不再要求用户预先知道模型 ID。
- 模型选择仅接受本次地址拉取到的 ID；地址或 Key 改变后自动清空模型缓存与验证状态。
- 修复手机端嵌套按钮宽度被压缩、文字竖排的问题。
- 模型拉取不发送 Chat Completion；总结费用保护与失败事务语义不变。

## v0.11.42 HYBRID

- 新增参考 Memory Palace 的直接 OpenAI 兼容 API 通道，绕开 Connection Manager 的请求转换。
- 新增 `/models` 非总结验证门：验证前不允许发送 Chat Completion；改变地址或模型后须重新验证。
- 直接请求保持最小请求体，仅发送一条 user message 与 model，不附加 Schema、response_format、预设或 instruct 元数据。
- 延续输入长度保护、一键一付费批次、每批最多 6 条消息及失败熔断；520、非 JSON 与提交校验失败后不会自动重试。
- 保留全部既有长期记忆、人物/NPC、关系、时间线、剧情起点与原聊天数据。

## v0.11.41 HYBRID

- 新增独立 Profile 持久费用熔断；任意请求、解析或提交失败后锁定，解除前所有总结点击均在本地阻止。
- Cloudflare 识别从单一 524 扩展到 520–526，并递归读取 error/cause/response/body/data/status 等被包装字段。
- 手动“总结新增”对独立 Profile 改为一键一调用：一次点击只处理一个批次，不再连续跑完全部积压消息。
- 独立 Profile 每批最多 6 条消息，输入硬上限降为约 30,000 tokens / 120,000 bytes，输出硬上限降为 3,072 tokens。
- 设置页新增锁定原因和“手动解除独立 API 费用锁定”；解除本身不发送请求。
- 升级时已有独立 Profile 默认进入待确认锁定，保留 Profile、API 地址、密钥和全部长期记忆。

## v0.11.40 HYBRID

- 用紧凑单行 JSON 输出骨架替代提示词中的完整 JSON Schema，避免结构说明把独立 API 请求异常放大。
- 新增发送前本地长度保护：预计超过 42,000 tokens 或 160,000 bytes 时不调用 API，并明确告知未扣费、未写入、未推进游标。
- 独立 Profile 最大输出硬限制为 6,144 tokens；升级时收紧旧的超大输出设置，但保留 API 地址、密钥与 Profile 选择。
- 移除失败后自动回退当前模型和 source 校验失败后的自动拆分；每个批次最多一次模型调用。
- 400、524、超时、空响应、非 JSON 与提交校验失败均保留原楼层，允许用户调整批量后手动重试。
- `manifest.json` 增加正确 `homePage` 仓库地址并启用 `auto_update`。

## v0.11.39 HYBRID

- 修复独立 Connection Profile 向 Gemini/部分中转接口传递通用 `json_schema` 后，被转换为不兼容的 `generationConfig.responseSchema` 并返回 HTTP 400 的问题。
- 独立 Profile 改为 prompt-only Schema：完整输出结构随提示词发送，请求 override payload 保持为空。
- 返回内容继续执行本地 JSON 修复、Schema 字段清理、source 边界校验和事务式提交；兼容处理不会放宽 canonical memory 安全门槛。
- 独立 Profile 回退当前聊天模型时继续携带完整 Schema，避免回退结果结构漂移。
- UI 将独立 API 标记为兼容模式；每批仍严格一次生成，失败不写入、不推进游标。

## v0.11.38 HYBRID

- 修复 Android/窄屏下“总结方式”选择器因 `flex-basis` 与纵向布局冲突而被撑成大块空白的问题。
- 原生设置页改用紧凑总结方式卡片；选择器在桌面端固定 42px、手机端固定 40px，不再随父级纵向拉伸。
- 新增总结通道徽标，实时区分当前聊天模型、独立 API Profile 与实验性 0 API 模式。
- 总结按钮和统计文字同步反映独立 API 状态；Connection Profile 创建、切换、更新或删除后自动刷新显示。
- 本次不改总结、记忆合并、时间线、处理游标、隐藏楼层或 JSONL 逻辑。

## v0.11.37 HYBRID

- 参考 SillyTavern Memory Palace 的结构化总结方案，把完整 JSON Schema 嵌入当前模型的单次静默请求，减少返回 Markdown、字段缺失或结构漂移导致的拒绝提交。
- 强化语义总结：合并连续 USER/CHARACTER 往来，保留关键行动、因果与结果；禁止逐楼复制玩家输入，玩家提议不得自动升级为已完成事实。
- 新增独立 `npcs` 记忆库，字段为姓名、身份、极简关键简述、当前状态、别名与真实 source；NPC 不再与主要人物状态混存。
- 增加主角色写入保护：玩家/当前角色永不归为 NPC；角色卡与世界书候选名须在真实正文反复出现；模型误分的主要角色会退回人物表。
- NPC 新增必须命中当前批真实 source；越界来源、空档案和未登场隐藏人物会被拒绝。
- NPC 注入采用按需触发：只有最近正文或当前场景命中姓名/身份/别名时才注入，最多 6 个，避免无关 NPC 占用上下文。
- 记忆浏览、历史搜索、统计、注入诊断、导入与 v4 兼容视图增加 NPC 分区。
- 保留 v0.11.36 的一次请求、失败不写入/不推进游标、524 不切换本地模式和 JSONL 保护。

## v0.11.36 HYBRID

- 普通增量总结改为复用当前聊天模型的 `generateQuietPrompt({quietPrompt})`；系统指令与批次正文合并发送，不需要独立 API/Profile。
- 每批同时提供 USER 与 CHARACTER 的真实正文；角色卡渲染摘要面板不再充当普通增量总结发动机。
- 每批严格限制为一次模型生成；常见 JSON 格式问题只做本地修复，不再发起第 2/3 次模型请求。
- 非 JSON、空响应、524、120 秒超时或 source 校验失败时不写入、不推进游标、不切换 0 API、不隐藏该批楼层。
- 默认总结方式从旧版 0 API 迁移为当前聊天模型；已有独立 Profile 的 AI 用户保持原选择。
- 新增“撤销错误 0 API 记录并重新排队”：撤销旧本地派生数据、回退游标并保留备份；剧情起点与原聊天 JSONL 不变。
- 0 API 规则抽取降为实验性选项；保留 30 条批次、阈值 8、双时间轴、月份精度、阶段大总结与安全记忆注入。

## v0.11.35 HYBRID

- 新增角色卡/预设通用摘要面板解析，识别 `摘要：标题`、时间范围、人物元数据和完整摘要正文。
- 摘要可以位于 `<content>` 之外；SMM 从原始 assistant 消息读取有边界区块，同时继续排除 `<status>`、内心、待办、弹幕、头条、脚本和样式。
- 保存摘要范围的 `recap_start_date` / `recap_end_date`，timeline 使用摘要末日，不以玩家输入中的日期替代。
- 0 API 本地优先级调整为角色回复既有摘要优先，其次才是 assistant 事实句；user 输入继续禁止直接写入 canonical timeline。
- 新增每聊天一次的 v0.11.35 安全迁移：重扫旧 `local_zero_api` source，将旧的玩家句子/碎片句替换为角色卡摘要或可靠角色回复事实；无法确认者回到 deferred。
- 迁移不调用 API、不改聊天 JSONL，并保留剧情起点、人物关系、游标和非本地记忆。

## v0.11.34 HYBRID

- 修复 0 API fallback 将 user 输入与 assistant 回复拼接、甚至在回复难以提取时只保存 user 原句的问题。
- fallback 改为严格 assistant-only；user 文本仅用于识别回复中的逐字回显，不直接进入 canonical timeline。
- 新增角色回复候选句评分，降低纯氛围描写、无主体片段、UI/模板文字进入时间线的概率。
- 新增每聊天一次的旧本地时间线安全迁移：移除 v0.11.34 以前的 `local_zero_api` 条目并按原 source 从角色回复重建。
- 无可靠角色回复事实的旧条目回到 deferred；本地阶段总结同步重建或失效，避免继续传播错误玩家原句。
- 迁移保留 story start、人物关系、处理游标、AI/导入记忆和聊天 JSONL；全程 0 API。

## v0.11.33 HYBRID

- 修复本地模式推进 `last_processed_index` 后，大量普通剧情楼层只进入 `local_deferred_ranges`、时间线和人物仍近乎为空的问题。
- 新增角色卡 `<status>` 白名单解析：只接收时间/地点，排除内心、真我、待办、弹幕和今日头条。
- 新增可见“剧情摘要/故事摘要/本轮摘要”区块解析；纯页签文字不会被当作摘要。
- 新增 0 API 对话原句抽取保底；保留严格的 UI、模板、情色微观描写和低信息动作过滤。
- 新增 deferred 一键补录及“总结新增”自动补录；保持现有记忆、剧情起点和处理游标，不修改原聊天 JSONL。
- 统计界面区分“已扫描 / 已形成时间线 / 待补录”，避免把扫描覆盖误解为 canonical 总结成功。
- 当前剧情状态可采用最新同楼角色状态栏时间/地点；并行多人物地点无法判定时保持未知，不串线。
- 阶段大总结在 deferred 尚未清零时停止，自动隐藏仍受 deferred 保护。
- 增加 v0.11.33 状态栏、本地抽取、旧楼层补录和污染隔离回归测试。

## v0.11.32 HYBRID

- 新增 month-level 日期精度：`date=null`、`date_hint=YYYY-MM`、`date_precision=month` 表示月份已知但具体日期未明确。
- 新聊天开场只出现“2003年10月”等年月信息时，剧情起点自动保存为 `2003-10 / 本聊天剧情正式起点（具体日期未明确）`，不再虚构日号。
- 已处理聊天允许在明确确认后安全修正错误剧情起点，无需清空记忆或全量重建；修正不调用 API，不修改事件/source、人物关系、处理游标或原聊天 JSONL。
- 月级起点会把首个可靠完整日期之前的无日期时间线重标为同月未知日，并移除由错误日期推导出的星期。
- 位于不同日历段边界、靠近后续完整日期的无摘要事件只继承后续场景月份，不再借用后续事件的具体日。
- 剧情起点修正时，只有当前聊天完全没有 reality-axis 证据才清理错误遗留的现实钟；真实 MVU 双时间轴聊天继续保留独立现实时间。
- 时间线浏览器、0 API 持久化和安全注入均识别月级日期；注入明确禁止主模型把 month-only 事件补成具体日。
- 保留 v0.11.31 的无依据分钟降级，以及 v0.11.30 的场景日历分离、v0.11.29 的默认 0 API/30 条批次/524 本地保底。

## v0.11.31 HYBRID

- 新增 timeline 时间精度审计：具体钟点只有在同 source canonical 正文或允许的状态元数据中可验证时才保留。
- 阻止预设 `<abstract>/<plot>` 中的模型总结时间“自我验证”；摘要独有的精确分钟自动降级为自然时段或“时间未明确”。
- 修复中文 12 小时钟解析，`下午3:00` 不再误读为 `03:00`；明确的 `下午3:30—5:00` 时间范围可正确验证并保留。
- 被降级的推测分钟不再作为同日倒退、跨午夜或事件排序锚点。
- 双时间轴进一步隔离：2026 MVU 现实钟不能验证 2003 场景 timeline 的具体分钟。
- 对位于两个不同日历段之间、且明显更接近后续直接场景锚点的无摘要旧事件，按 source 邻近性继承后续场景日期并标注“邻近场景日期”；不据此补分钟。
- 升级刷新自动处理已有 timeline，包括完全没有旧摘要的楼层；只改 SMM 时间字段和证据标签，不改 event/source、人物关系、游标或聊天 JSONL，且不调用 API。
- 保留 v0.11.30 的 source 顺序场景日历、当前状态解析，以及 v0.11.29 的默认 0 API、每批 30 条和 524 本地保底。

## v0.11.30 HYBRID

- 修复剧情起点为 2026、当前历史场景为 2003 时，旧 source-axis 校准器把整段场景时间线强制写回 2026 的问题。
- `story_start` 改为“开场身份锚点”，不再充当所有后续场景日期的数值下限；允许结构化预设摘要建立明确的历史场景日历段。
- 0 API 时间证据优先级改为：同 source 预设剧情摘要场景时间 > 同 source 正文当前场景标记 > 世界/MVU 元数据兜底。
- `/世界/现实时间` 作为独立 `current_reality_date/current_reality_time` 及 timeline `reality_date/reality_time` 保存；不再覆盖带完整年月日的当前场景时间。
- 新增仅时间字段的升级校正：根据已有 timeline source 复核并修复 v0.11.29 产生的 2026 错桶及“场景第二时间轴”包装，不重写事件内容，不调用 API。
- 时间线查看顺序改为 source 叙事顺序，支持 `2026 开场 → 2003 场景 → 2026 返回`，避免按 ISO 日期排序打乱剧情先后。
- 当前剧情状态新增“即时状态/当前状态”时间识别，同一最新楼层优先于该楼较早的事件摘要时刻。
- 继续保留 v0.11.29 的默认 0 API、每批 30 条、524 单次失败后本地保底、地点空值保护和阶段总结本地模式。

## v0.11.29 HYBRID

- 新增默认“0 API 本地事实”总结模式；普通增量总结、自动总结和阶段大总结均可完全不调用模型 API。
- 本地模式复用已审计的 HYBRID 管线：结构化 `abstract/plot` 优先，明确强事实保守抽取，不确定楼层标记 deferred 且禁止自动隐藏。
- 新增持久化 `local_coverage_ranges` / `local_deferred_ranges`，长聊天审计被裁剪后仍不会虚构断档或隐藏未压缩原文。
- 默认批大小调整为 30；旧设置仍为默认 20 时自动迁移到 30。
- 修复 `2026-04-01 / 本聊天剧情正式起点` 这类带说明的自动起点在日期校准/本地总结中无法解析的问题。
- Cloudflare 524 HTML 现在被识别为上游超时，不再误进入三次 JSON 重试链。AI 模式的超时批次会本地保底并切换至 0 API。
- 新增双日历硬守卫：有 `/世界/现实时间` 时，现实日历独占主时间轴；早于剧情起点的副本/场景日历改存为 timeline 第二时间轴标签。
- 修复后续批次的空白/“未建立” `current_scene` 覆盖旧的已知地点；升级刷新时会本地尝试恢复现有错误状态。
- 保留 v0.11.28 每聊天剧情起点自动初始化、v0.11.27 现实时间白名单及 v0.11.26 阶段保底架构；不全量重建，不修改原聊天 JSONL。

## v0.11.28 HYBRID

- 新聊天在第一次增量总结前自动初始化剧情起点，无需逐个聊天手动填写。
- 自动识别优先采用开场消息中的 `/世界/现实时间`，其次采用 `<date>`、开场正文绝对日期和普通世界日期变量。
- 自动扫描仅限开场前 8 条消息，防止把较后剧情的当前日期误认成聊天起点。
- 开场无可靠绝对日期时使用“本聊天剧情正式起点”，不推测或编造日期。
- `story_start` 改为严格保存在当前聊天 metadata；旧的全局设置不再向新聊天传播。
- 已处理聊天的既有起点继续锁定；不重建记忆，不修改原聊天 JSONL。

## v0.11.27 HYBRID

- 修复 MVU 双时间轴：新增 `/世界/现实时间`、`/世界/现实日期`、`/世界/现实地点` 白名单，兼容 `JSONPatch` 与嵌套 `UpdateVariable`。
- `/世界/现实时间` 的 `YYYY年MM月DD日 HH:MM` 会拆为绝对剧情日期与现实钟点，并作为现实主时间轴。
- 副本第几轮、第几天和副本内钟点只作为场景第二时间轴保留，不再把“第1天”重复绑定到剧情起点。
- 现实主时间轴允许单向多日推进；仍拒绝无明确时间旅行依据的倒退。
- 新增升级时的一次性 timeline 日期轴校准，只处理 SMM 记忆元数据，不重扫 AI、不修改聊天 JSONL。
- 保持 v0.11.26 的阶段大总结本地事实保底、连续失败熔断、移动端诊断界面与注入长度策略不变。

## v0.11.26 HYBRID

- 重构阶段大总结为单窗口单阶段输出，取消对 `stages` 数组根结构的硬依赖。
- 单组最大 30 条 timeline；阶段 source/date 边界由本地 canonical 数据确定。
- 新增 direct-stage / array / wrapper 多形态兼容。
- 新增逐组本地事实保底：AI/Profile/JSON 任一异常只影响该组，不再使整个大总结失败。
- 连续两组 AI 异常后触发本轮熔断，剩余组直接本地保底，减少无效 Token 消耗。
- 本地保底只抽取已有 timeline/open_loops，标记 `generation_mode=local_fallback`，不把异常模型 prose 写入 canonical memory。
- 阶段浏览器显示本地保底标记；重新生成时会重新尝试 AI。
- 不修改原聊天 JSONL，不重扫 1700+ 楼，不改变已通过的时间/地点、注入诊断和普通增量总结逻辑。

## v0.11.25 HYBRID

- 修复独立 Connection Profile 的结构化输出识别：不再只依赖 `profile.mode`，改用 SillyTavern `validateProfile()` 的实际 API 映射判断 Chat Completion。
- 对旧/迁移 Profile 即使缺少或残留错误的 `mode`，只要实际走 Chat Completion，也会正确传入 `json_schema`。
- 阶段大总结单组输出从 2600 提升到 4200 tokens，并把单组切分收紧为最多 36 条时间线、1–3 个阶段，降低长输出被截断的概率。
- 强化 JSON-only 输出约束；兼容 `stage_summaries` / `chapters` / `value.stages` 等无害包装别名。
- 保持失败关闭：仍未得到可靠阶段数组时不写入长期记忆，旧阶段结果继续保留。

# v0.11.24 HYBRID
- 独立总结 Profile 请求改为 `includePreset:false`，隔离 RP/聊天 generation preset 对总结任务的干扰。
- Chat Completion Profile 现在会把 SMM 的 `jsonSchema` 作为 `json_schema` 透传给 SillyTavern Connection Manager 的 override payload，使用原生结构化输出。
- 支持结构化返回时 `response.content` 为 JSON 对象，并安全序列化后进入既有 parse/repair/normalize 链。
- 保留 v0.11.23 reasoning JSON 恢复与 v0.11.22 本地 JSON 修复；普通 reasoning prose 仍拒绝进入 canonical memory。
- 阶段大总结失败时继续保留旧结果，不修改原聊天 JSONL。

# v0.11.23 HYBRID
- 修复独立总结 Connection Profile 成功返回但 `content` 为空、有效 JSON 落在 `reasoning` 时被误判为空响应。
- 仅在 reasoning 可解析/本地修复为 JSON 时启用恢复，避免把普通推理内容写入长期记忆。
- 增强 Connection Profile 响应包装兼容：支持 `message.content` / `data.content` / `choices[0].message.content` 等。
- 保持 v0.11.22 的 JSON 裸双引号修复、时间/地点追踪、注入诊断 UI 和阶段大总结结构不变。

# v0.11.22 HYBRID
- 修复阶段大总结返回“几乎正确但字符串内含未转义 ASCII 双引号”时的 JSON 解析失败。
- JSON 本地修复器不再全局替换中文弯引号；新增字符串内裸双引号的结构感知修复。
- 阶段大总结 prompt 明确要求标准 JSON，并建议正文引用使用中文引号。
- 阶段大总结错误 toast 改为短摘要，完整错误继续写入控制台。
- 不改变 v0.11.21 的时间/地点追踪、注入诊断 UI 与 stage_summaries 数据结构。

# v0.11.21 HYBRID
- 修复 current_story_date/current_story_time 被旧 timeline 拉回的问题；新增最近正文优先的 current-state resolver。
- current_scene.location 同步采用“最近可靠正文 > 世界状态元数据 > 旧状态”的保守策略。
- 自动总结关闭时，生成前仍会轻量检查最近正文并刷新当前剧情状态。
- 新聊天允许无绝对日期启动；剧情起点不再强制必须填写 YYYY-MM-DD。
- 重做“本轮注入诊断”移动端 UI：摘要优先、原始 prompt 折叠、刷新按钮横向全宽。
- 注入 prompt 的分隔符恢复为真实换行。
- 新增阶段大总结 stage_summaries：基于现有 canonical 长期记忆按剧情阶段压缩，不重扫原聊天、不修改 JSONL。
- 阶段大总结至少需要 6 条有效 timeline 且无大段断档；失败时保留旧结果；主模型只注入少量高价值阶段摘要。

# v0.11.20
- 主模型注入改为精简事实包：当前时间/场景、相关人物与关系、近期事件、主线和未完成事项。
- 移除 character_anchors 等内部机制说明型提示，避免主模型转为说明/防御式回答。
- 仅选择当前场景和近期事件相关实体，并减少 timeline/open_loops 数量。
- 保留 v0.11.19 注入诊断，可直接查看实际注入文本与长度。

# v0.11.19 HYBRID

- 修复安全记忆注入只在扩展入口安装/开关变化时刷新的问题；现在聊天状态变化会重新同步当前聊天记忆。
- 新增注入诊断与实际 prompt 预览，明确区分“关闭”“被时间线断档阻止”“正常注入”。
- 保留 v0.11.18 的 JSON 本地修复、未知调试字段清理和 timeline 自然时间显示。

# v0.11.18 HYBRID

## JSON 容错
- API 返回轻微损坏 JSON 时，先在本地修复，再决定是否需要额外 API 重试。
- 支持常见问题：Markdown 围栏、弯引号、字符串内裸换行/控制字符、JS 注释、未加引号的属性名、尾逗号、裸 `-` 占位、独立 `__debug`/`__note` 成员。
- 已知后端别名 `current_scene_core` 会映射为 `current_scene`。
- 总结对象写入前使用顶层字段白名单，未知调试字段不会进入长期记忆。
- 缺失的标准数组/对象字段会补为空结构，减少仅因包装格式导致的整次总结报废。

## 时间显示粒度
- 底层日期/时分仍保留用于排序与连续性校验。
- 如果具体 HH:MM 仅来自 `/世界/当前时间` 的变量状态元数据，历史时间线 UI 改为自然时段显示：凌晨/早晨/上午/中午/下午/晚间/深夜。
- 原文明确时间、预设 `<abstract>` 明确时间仍保留精确时分。
- 不修改原聊天，也不降低底层时间校准精度。
