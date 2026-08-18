// Story Memory Manager v0.11.0
// canonical-input purification / character-core preservation / story-arc continuity
// does not rewrite original chat JSONL
// does not rewrite original chat JSONL

const MODULE = 'story_memory_manager_v2';
const META_KEY = 'story_memory_manager_v2';
const PANEL_ID = 'smm2_panel';
const BUTTON_ID = 'smm2_fab';

const DEFAULTS = Object.freeze({
    enabled: false,
    autoSummarize: false,
    triggerMessages: 8,
    batchMessages: 20,
    injectMemory: false,
    maxTimeline: 50,
    maxFacts: 60,
    maxEvents: 40,
    maxLoops: 30,
    storyStart: '',
    currentStoryTime: '',
    ignoreMessageTimestamps: true,

    // v0.9.3：总结模型通道
    summaryProvider: 'current',      // current | profile
    summaryProfileId: '',
    summaryFallback: 'stop',         // stop | fallback
    summaryMaxTokens: 4096,

    // v0.10.0
    safeMemoryInject: false,
    autoHideSummarized: false,
    keepRecentMessages: 30
});

function C() { return SillyTavern.getContext(); }

function S() {
    const c = C();
    if (!c.extensionSettings[MODULE]) c.extensionSettings[MODULE] = structuredClone(DEFAULTS);
    for (const [k,v] of Object.entries(DEFAULTS)) {
        if (!Object.hasOwn(c.extensionSettings[MODULE], k)) c.extensionSettings[MODULE][k] = v;
    }
    return c.extensionSettings[MODULE];
}

function freshMemory() {
    return {
        schema: 'story_memory_manager_v2',
        version: 2,
        story_start: S().storyStart || null,
        current_story_date: null,
        current_story_time: S().currentStoryTime || null,
        last_processed_index: -1,
        timeline: [],
        facts: [],
        events: [],
        characters: {},
        relationships: [],
        open_loops: [],
        closed_loops: [], // legacy compatibility; v0.10.6 migrates these to compact tombstones
        loop_tombstones: [],
        locations: [],
        items: [],
        conflicts: [],
        quarantined: [],
        current_scene: {},
        semantic_anchors: [],
        character_anchors: [],
        active_arcs: [],
        audit: []
    };
}

function M() {
    const c = C();
    if (!c.chatMetadata[META_KEY]) c.chatMetadata[META_KEY] = freshMemory();
    const mem = c.chatMetadata[META_KEY];
    if (!Array.isArray(mem.character_anchors)) mem.character_anchors = [];
    if (!Array.isArray(mem.active_arcs)) mem.active_arcs = [];
    return mem;
}

async function saveMeta() { await C().saveMetadata(); }
function saveSettings() { C().saveSettingsDebounced(); }

function toast(msg, kind='info') {
    if (globalThis.toastr?.[kind]) globalThis.toastr[kind](msg, '剧情自动记忆');
    else console.log('[StoryMemory]', msg);
}

function esc(s='') {
    return String(s).replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[x]));
}


function stableCharactersForPromptV0110(mem) {
    const out = {};
    const src = mem?.characters && typeof mem.characters === 'object'
        ? mem.characters
        : {};
    const stable = new Set(['age','gender','identity','personality']);
    for (const [name, row] of Object.entries(src)) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
        const next = {};
        for (const key of stable) {
            if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
                next[key] = row[key];
            }
        }
        out[name] = next;
    }
    return out;
}

function currentSceneCoreV0110(scene) {
    if (!scene || typeof scene !== 'object' || Array.isArray(scene)) return {};
    const out = {};
    for (const key of ['location','time','date','participants','people','activity','situation']) {
        if (Object.prototype.hasOwnProperty.call(scene, key)) out[key] = scene[key];
    }
    return out;
}

function buildSafeMemoryPromptV0100() {
    const mem = M();

    const payload = {
        current_story_date: mem.current_story_date || null,
        current_story_time: mem.current_story_time || null,
        current_scene_core: currentSceneCoreV0110(mem.current_scene),
        character_anchors: (mem.character_anchors || []).slice(-20),
        active_arcs: (mem.active_arcs || []).slice(0, 6),
        semantic_anchors: (mem.semantic_anchors || []).slice(-20),
        recent_timeline: (mem.timeline || []).slice(-10),
        characters: stableCharactersForPromptV0110(mem),
        relationships: (mem.relationships || []).slice(-12),
        open_loops: (mem.open_loops || []).slice(-8)
    };

    return [
        '【Story Memory｜已确认长期连续性】',
        '这是一份压缩连续性记忆，不是角色卡，也不是写作模板。',
        '角色的基础人格、语言风格、价值观与原始设定，以角色卡/世界书为最高优先级；SMM 的压缩人物摘要不得覆盖或重写角色卡。',
        'character_anchors 只保存由剧情长期验证出的稳定行为/语言锚点；若与角色卡冲突，以角色卡为准。',
        'semantic_anchors 中事件性质、因果、主动/被动和明确意愿状态属于连续性硬事实。',
        'active_arcs 是仍在发展的主线方向，不是任务清单；不得为了推进主线而强行让角色做不符合人设的行为。',
        '如果一个局部生活片段已经自然结束，不要用反复吃饭、洗澡、睡觉、通勤、上药或重复解释同一问题来替代剧情发展；应在符合人设和当前因果的前提下，自然进入下一个有意义的剧情节点。',
        '近期原始聊天优先于长期摘要中的瞬时状态。',
        '禁止把长期记忆和近期正文都未支持的过去细节补成既定历史。',
        'open_loops 仅表示仍有效的连续性事项，不是必须执行的任务。',
        JSON.stringify(payload, null, 2),
    ].join('\\n');
}

function refreshSafeMemoryInjectionV0100() {
    const settings = S();
    const ctx = C();

    if (!ctx || typeof ctx.setExtensionPrompt !== 'function') return false;

    const tag = 'story_memory_manager_v2_safe_memory';

    if (!settings.safeMemoryInject) {
        ctx.setExtensionPrompt(tag, '', 0, 4, false, 0);
        return true;
    }

    ctx.setExtensionPrompt(
        tag,
        buildSafeMemoryPromptV0100(),
        0,
        4,
        false,
        0
    );

    return true;
}


async function getNativeHideRangeV0101() {
    const mod = await import('/scripts/chats.js');

    if (typeof mod.hideChatMessageRange !== 'function') {
        throw new Error('SillyTavern hideChatMessageRange 不可用');
    }

    return mod.hideChatMessageRange;
}

function getSmmAutoHiddenInfoV0101() {
    const chat = C().chat || [];
    const ids = [];

    for (let i = 0; i < chat.length; i++) {
        if (chat[i]?.extra?.smm_auto_hidden_v0101 === true) {
            ids.push(i);
        }
    }

    return {
        count: ids.length,
        first: ids.length ? ids[0] : -1,
        last: ids.length ? ids[ids.length - 1] : -1,
        ids,
    };
}

async function autoHideSummarizedV0101() {
    const settings = S();

    if (!settings.autoHideSummarized) return false;

    if (!settings.safeMemoryInject) {
        console.warn('[StoryMemory] 自动隐藏跳过：安全记忆注入未开启');
        return false;
    }

    const chat = C().chat || [];
    const mem = M();

    if (!chat.length) return false;

    const processed = Math.max(
        -1,
        Math.min(
            chat.length - 1,
            Number(mem.last_processed_index ?? -1)
        )
    );

    if (processed < 0) return false;

    const keep = Math.max(
        10,
        Math.min(
            200,
            Number(settings.keepRecentMessages) || 30
        )
    );

    const keepStart = Math.max(0, chat.length - keep);
    const hideEnd = Math.min(processed, keepStart - 1);

    if (hideEnd < 0) return false;

    let newlyMarked = 0;

    for (let i = 0; i <= hideEnd; i++) {
        const msg = chat[i];
        if (!msg) continue;

        // 已经由其他机制隐藏的消息，不标记为 SMM 所有。
        if (msg.is_system && !msg?.extra?.smm_auto_hidden_v0101) {
            continue;
        }

        msg.extra = msg.extra && typeof msg.extra === 'object'
            ? msg.extra
            : {};

        if (msg.extra.smm_auto_hidden_v0101 !== true) {
            msg.extra.smm_auto_hidden_v0101 = true;
            newlyMarked++;
        }
    }

    if (!newlyMarked) {
        refreshNative();
        return false;
    }

    const hideChatMessageRange = await getNativeHideRangeV0101();

    // 使用 SillyTavern 原生隐藏机制，真正退出正常聊天上下文。
    await hideChatMessageRange(0, hideEnd, false);

    console.info('[StoryMemory] 自动隐藏完成', {
        hideEnd,
        keep,
        processed,
        newlyMarked,
    });

    refreshNative();
    return true;
}

async function restoreSmmHiddenMessagesV0101() {
    const chat = C().chat || [];

    if (!chat.length) {
        toast('当前聊天为空。', 'info');
        return;
    }

    const hideChatMessageRange = await getNativeHideRangeV0101();

    const ids = [];

    for (let i = 0; i < chat.length; i++) {
        if (chat[i]?.extra?.smm_auto_hidden_v0101 === true) {
            ids.push(i);
        }
    }

    if (!ids.length) {
        toast('没有由剧情自动记忆隐藏的楼层。', 'info');
        refreshNative();
        return;
    }

    // 只恢复 SMM 自己标记过的连续区间。
    const ranges = [];
    let start = ids[0];
    let prev = ids[0];

    for (let k = 1; k < ids.length; k++) {
        const id = ids[k];

        if (id === prev + 1) {
            prev = id;
            continue;
        }

        ranges.push([start, prev]);
        start = prev = id;
    }

    ranges.push([start, prev]);

    for (const [a, b] of ranges) {
        await hideChatMessageRange(a, b, true);
    }

    for (const id of ids) {
        const msg = chat[id];
        if (!msg?.extra) continue;

        delete msg.extra.smm_auto_hidden_v0101;
    }

    // hideChatMessageRange 已保存聊天；这里再保存一次标记清理。
    if (typeof C().saveChat === 'function') {
        await C().saveChat();
    }

    toast('已恢复剧情自动记忆隐藏的楼层。', 'success');
    refreshNative();
}

function cleanMes(m) {
    let t = String(m?.mes ?? '').trim();
    if (!t) return '';

    // v0.7.1: 清除模型 reasoning / thinking，避免其中的日期、时间词污染剧情时间轴。
    // 支持常见成对标签。
    t = t.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '');
    t = t.replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, '');

    // 支持 Subtext thinking 注释块。
    t = t.replace(
        /<!--\s*begin_of_Subtext_think\s*-->[\s\S]*?<!--\s*end_of_Subtext_think\s*-->/gi,
        ''
    );

    // 某些后端会留下孤立的 thinking 标签，单独清理标签本身。
    t = t.replace(/<\/?think\b[^>]*>/gi, '');
    t = t.replace(/<\/?thinking\b[^>]*>/gi, '');

    return t.trim();
}

function stripAuxiliaryBlocksV0110(text) {
    let t = String(text || '');

    // Writing/debug annotations are never canonical story facts.
    t = t.replace(/<!--[\s\S]*?-->/g, '');

    const tags = [
        'campus_gossip', 'UpdateVariable', 'JSONPatch', 'Analysis',
        'StatusPlaceHolderImpl', 'thinking', 'think'
    ];
    for (const tag of tags) {
        const paired = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
        t = t.replace(paired, '');
        const selfClosing = new RegExp(`<${tag}\\b[^>]*/\\s*>`, 'gi');
        t = t.replace(selfClosing, '');
    }

    // Remove known meta-only <details> blocks even if they were nested inside <content>.
    t = t.replace(/<details\b[^>]*>[\s\S]*?<\/details>/gi, block => {
        const m = block.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i);
        const title = String(m?.[1] || '').replace(/<[^>]+>/g, '').trim();
        return /(故事考据|淫语|写作|思考|分析|草稿|行动建议|CHOIR|创作说明|作者注)/i.test(title)
            ? ''
            : block;
    });

    // Orphan wrappers left by malformed templates.
    t = t.replace(/<\/?(?:campus_gossip|UpdateVariable|JSONPatch|Analysis|StatusPlaceHolderImpl)\b[^>]*>/gi, '');
    return t.replace(/^\s*###\s*正文\s*/i, '').trim();
}

function cleanMesForSummaryV0110(m) {
    let t = cleanMes(m);
    if (!t) return '';

    // USER prose is preserved; USER meta-instructions are filtered by the memory auditor.
    if (m?.is_user) return stripAuxiliaryBlocksV0110(t);

    // If the reply provides an explicit canonical story body, only that body may enter SMM.
    const bodies = [];
    const re = /<content\b[^>]*>([\s\S]*?)<\/content>/gi;
    let match;
    while ((match = re.exec(t))) bodies.push(match[1]);
    if (bodies.length) t = bodies.join('\n\n');

    return stripAuxiliaryBlocksV0110(t);
}

function messagesText(start, end) {
    const chat = C().chat || [];
    return chat.slice(start, end).map((m, j) => {
        const idx = start + j;
        const who = m.is_user ? 'USER' : (m.name || 'CHARACTER');
        return `[#${idx} ${who}]\n${cleanMesForSummaryV0110(m)}`;
    }).join('\n\n');
}

function parseJSON(text) {
    let t = String(text ?? '').trim();
    if (!t) throw new Error('模型返回为空，无法解析 JSON');

    // Remove common markdown fences.
    t = t.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();

    // Prefer the outermost JSON object if the model added prose before/after it.
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) {
        t = t.slice(a, b + 1);
    } else {
        const preview = t.replace(/\s+/g, ' ').slice(0, 240);
        throw new Error(`模型未返回 JSON 对象：${preview}`);
    }

    let obj;
    try {
        obj = JSON.parse(t);
    } catch (e) {
        const preview = t.replace(/\s+/g, ' ').slice(0, 240);
        throw new Error(`JSON 解析失败：${e.message}；响应开头：${preview}`);
    }

    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        throw new Error('返回内容不是 JSON 对象');
    }
    return obj;
}

function uniqMerge(oldArr, newArr, keyFn) {
    const out = Array.isArray(oldArr) ? [...oldArr] : [];
    for (const x of (Array.isArray(newArr) ? newArr : [])) {
        const k = keyFn(x);
        if (!out.some(y => keyFn(y) === k)) out.push(x);
    }
    return out;
}

function isMetaInstructionSignal(x) {
    const text = JSON.stringify(x || {}).toLowerCase();
    // These are model explanations/categories that explicitly identify a non-diegetic
    // user editing/generation instruction rather than an in-story contradiction.
    return /(用户修改请求|用户.*(?:修改|重写|改写).*(?:请求|要求)|非正文事实|非剧情事实|元指令|ooc|写作指令|生成指令|回复修改|重写要求|改写要求|文风要求|格式要求|尺度要求|剧情规则变更|写作规则变更)/i.test(text);
}

function filterMetaSignals(r) {
    if (!r || typeof r !== 'object') return r;

    const arrayFields = [
        'timeline',
        'facts',
        'events',
        'relationships',
        'open_loops',
        'locations',
        'items',
        'conflicts',
        'quarantined',
        'semantic_anchors',
        'character_anchors',
        'active_arcs'
    ];

    for (const field of arrayFields) {
        if (Array.isArray(r[field])) {
            r[field] = r[field].filter(x => !isMetaInstructionSignal(x));
        }
    }

    if (r.current_scene && isMetaInstructionSignal(r.current_scene)) {
        r.current_scene = {};
    }

    if (r.characters && typeof r.characters === 'object' && !Array.isArray(r.characters)) {
        for (const [name, value] of Object.entries(r.characters)) {
            if (isMetaInstructionSignal(value)) delete r.characters[name];
        }
    }

    return r;
}

function sourceRangeSize(source) {
    const nums = String(source || '').match(/\d+/g)?.map(Number) || [];
    if (nums.length >= 2) return Math.abs(nums[nums.length - 1] - nums[0]) + 1;
    return nums.length ? 1 : 0;
}

function looksLikeTemporalEvolutionConflict(c) {
    if (!c || typeof c !== 'object') return false;

    const topic = String(c.topic || '').toLowerCase();
    const oldv = String(c.old_value || '').toLowerCase();
    const newv = String(c.new_value || '').toLowerCase();
    const joined = `${topic} ${oldv} ${newv}`;

    // Explicit progression/state-change language: these normally describe "then → later",
    // not two incompatible facts asserted for the same moment.
    const evolutionWords = [
        '升级','进展','发展','推进','转变','变化','改变','更新','切换','转换',
        '后来','随后','之后','进一步','加深','升温','恶化','缓和','和好','分手',
        '关系变化','关系进展','态度变化','情绪变化','状态变化','地点变化','场景变化',
        '玩法升级','行为升级','行为变化','姿势变化','阶段变化','身份变化',
        '从冷淡','变得亲密','从敌对','转为','改为','换成','开始','停止','结束'
    ];

    if (evolutionWords.some(w => joined.includes(w))) return true;

    // A source spanning several sequential messages is more likely to be a progression
    // when the topic is behavior/scene/relationship/state rather than a fixed biography fact.
    if (sourceRangeSize(c.source) >= 2) {
        const dynamicTopics = [
            '行为','互动','玩法','姿势','场景','地点','关系','态度','情绪',
            '状态','约会','行动','活动','安排','计划','衣着','位置'
        ];
        if (dynamicTopics.some(w => topic.includes(w))) return true;
    }

    return false;
}

function filterConflictsForStoryContinuity(items) {
    const keep = [];
    const evolved = [];

    for (const c of Array.isArray(items) ? items : []) {
        if (looksLikeTemporalEvolutionConflict(c)) {
            evolved.push(c);
        } else {
            keep.push(c);
        }
    }

    return { keep, evolved };
}


function sourceIndexes(source) {
    const s=String(source||'');
    const nums=[...s.matchAll(/#(\d+)/g)].map(m=>Number(m[1])).filter(Number.isFinite);
    if (!nums.length) return [];
    if (nums.length===2 && /#\d+\s*[-–—]\s*#?\d+/.test(s)) {
        const a=Math.min(nums[0],nums[1]), b=Math.max(nums[0],nums[1]);
        const out=[]; for(let i=a;i<=b && out.length<500;i++) out.push(i); return out;
    }
    return [...new Set(nums)].sort((a,b)=>a-b);
}
function sourceFirst(source) {
    const x=sourceIndexes(source); return x.length?x[0]:Number.MAX_SAFE_INTEGER;
}
function sourceLast(source) {
    const x=sourceIndexes(source); return x.length?x[x.length-1]:-1;
}
function mergeSources(a,b) {
    const x=[...new Set([...sourceIndexes(a),...sourceIndexes(b)])].sort((m,n)=>m-n);
    return x.length ? x.map(n=>`#${n}`).join(',') : (a||b||null);
}

function sourceTextForTime(source) {
    const chat = C().chat || [];
    return sourceIndexes(source)
        .map(i => cleanMes(chat[i]))
        .filter(Boolean)
        .join('\n');
}

function classifySourceTimeEvidence(e) {
    const time = String(e?.time || '').trim();
    if (!time) {
        return {
            level: 'none',
            label: '无时间',
            reason: '记忆没有 time 字段'
        };
    }

    const src = sourceTextForTime(e?.source);
    if (!src) {
        return {
            level: 'unverified',
            label: '无法验证',
            reason: '找不到 source 对应的原始聊天'
        };
    }

    // HH:MM，例如 22:00 / 02:30
    const numeric = [...time.matchAll(/(?:^|[^\d])([01]?\d|2[0-3])[:：]([0-5]\d)/g)];

    if (numeric.length) {
        const checks = numeric.map(m => {
            const hh = String(Number(m[1]));
            const hh2 = hh.padStart(2, '0');
            const mm = m[2];

            const forms = [
                hh + ':' + mm,
                hh2 + ':' + mm,
                hh + '：' + mm,
                hh2 + '：' + mm
            ];

            return {
                clock: hh2 + ':' + mm,
                found: forms.some(x => src.includes(x))
            };
        });

        const found = checks.filter(x => x.found);
        const missing = checks.filter(x => !x.found);

        if (missing.length === 0) {
            return {
                level: 'explicit',
                label: checks.length > 1 ? '原文时间范围已验证' : '原文明确时间',
                reason: 'source 原文中找到全部时间：' + found.map(x => x.clock).join('、')
            };
        }

        if (found.length > 0) {
            return {
                level: 'partial',
                label: '原文部分时间已验证',
                reason: '已找到 ' + found.map(x => x.clock).join('、') +
                        '；未找到 ' + missing.map(x => x.clock).join('、')
            };
        }

        return {
            level: 'inferred',
            label: '总结推测时间',
            reason: '时间 ' + checks.map(x => x.clock).join('、') +
                    ' 均未在 source 原文中找到'
        };
    }

    // 中文“X点”，例如 凌晨2点 / 晚上10点
    const chineseHour = time.match(/(?:凌晨|半夜|早晨|早上|上午|中午|下午|傍晚|晚上|晚间|夜间|深夜)?\s*(\d{1,2})(?:点|时)/);

    if (chineseHour) {
        const token = chineseHour[0].replace(/\s+/g, '');
        const compactSrc = src.replace(/\s+/g, '');

        if (compactSrc.includes(token)) {
            return {
                level: 'explicit',
                label: '原文明确时间',
                reason: `source 原文中找到“${token}”`
            };
        }

        return {
            level: 'inferred',
            label: '总结推测时间',
            reason: '具体钟点只存在于记忆 time 字段'
        };
    }

    // 只有“凌晨/上午/晚间”等时段
    const dayparts = [
        '凌晨','半夜','清晨','早晨','早上','上午',
        '中午','下午','傍晚','晚上','晚间','夜间','深夜'
    ];

    const hit = dayparts.find(x => time.includes(x));

    if (hit) {
        if (src.includes(hit)) {
            return {
                level: 'fuzzy',
                label: '原文模糊时段',
                reason: `source 原文中存在“${hit}”`
            };
        }

        return {
            level: 'inferred',
            label: '总结推测时段',
            reason: `“${hit}”只存在于记忆 time 字段`
        };
    }

    return {
        level: 'unverified',
        label: '时间无法验证',
        reason: '无法在 source 原文中验证该时间'
    };
}

function explicitClockFromSource(source) {
    const src = sourceTextForTime(source);
    if (!src) return null;

    // HH:MM / HH：MM
    let m = src.match(/(?:^|[^\d])([01]?\d|2[0-3])[:：]([0-5]\d)/);
    if (m) {
        return Number(m[1]) * 60 + Number(m[2]);
    }

    function zhNum(v) {
        if (/^\d{1,2}$/.test(v)) return Number(v);

        const n = {
            '零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,
            '五':5,'六':6,'七':7,'八':8,'九':9
        };

        if (v === '十') return 10;
        if (v.length === 1 && n[v] != null) return n[v];

        if (v.length === 2 && v[0] === '十' && n[v[1]] != null)
            return 10 + n[v[1]];

        if (v.length === 2 && v[1] === '十' && n[v[0]] != null)
            return n[v[0]] * 10;

        if (v.length === 3 && v[1] === '十' &&
            n[v[0]] != null && n[v[2]] != null)
            return n[v[0]] * 10 + n[v[2]];

        return null;
    }

    // 凌晨/半夜/上午 X点
    m = src.match(/(?:凌晨|半夜|清晨|早晨|早上|上午)\s*([0-9]{1,2}|[零〇一二两三四五六七八九十]{1,3})\s*(?:点|时)/);
    if (m) {
        const h = zhNum(m[1]);
        if (h != null && h >= 0 && h <= 12)
            return h * 60;
    }

    // 下午/晚上/深夜 X点
    m = src.match(/(?:下午|傍晚|晚上|晚间|夜间|深夜)\s*([0-9]{1,2}|[零〇一二两三四五六七八九十]{1,3})\s*(?:点|时)/);
    if (m) {
        let h = zhNum(m[1]);
        if (h != null) {
            if (h < 12) h += 12;
            if (h < 24) return h * 60;
        }
    }

    // “九点四十一分”这类表达，只在 source 有明确 AM/PM 语境时采用
    m = src.match(/([0-9]{1,2}|[零〇一二两三四五六七八九十]{1,3})\s*点\s*([0-9]{1,2}|[零〇一二两三四五六七八九十]{1,3})?\s*分?/);

    if (m) {
        let h = zhNum(m[1]);
        const min = m[2] ? zhNum(m[2]) : 0;

        if (h != null && min != null && min >= 0 && min < 60) {
            if (/晚上|晚间|夜间|深夜/.test(src)) {
                if (h < 12) h += 12;
                if (h < 24) return h * 60 + min;
            }

            if (/凌晨|半夜|清晨|早晨|早上|上午/.test(src)) {
                if (h <= 12) return h * 60 + min;
            }
        }
    }

    return null;
}

function clockCandidatesFromTimelineTime(time) {
    const s = String(time || '').trim();
    if (!s) return [];

    const out = [];

    // 先抽 HH:MM，包括 21:07-21:55 / 02:00–03:15。
    for (const m of s.matchAll(/(?:^|[^\d])([01]?\d|2[0-3])[:：]([0-5]\d)/g)) {
        const h = Number(m[1]);
        const min = Number(m[2]);
        const total = h * 60 + min;
        if (!out.includes(total)) out.push(total);
    }

    // 如果没有 HH:MM，再尝试 timeline.time 自身的中文钟点。
    if (!out.length) {
        const x = parseStoryClock(s);
        if (x != null) out.push(x);
    }

    return out;
}

function chineseNumberToInt(v) {
    v = String(v || '').trim();

    if (/^\d{1,2}$/.test(v)) return Number(v);

    const n = {
        '零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,
        '五':5,'六':6,'七':7,'八':8,'九':9
    };

    if (v === '十') return 10;
    if (v.length === 1 && n[v] != null) return n[v];

    if (v.length === 2 && v[0] === '十' && n[v[1]] != null)
        return 10 + n[v[1]];

    if (v.length === 2 && v[1] === '十' && n[v[0]] != null)
        return n[v[0]] * 10;

    if (v.length === 3 && v[1] === '十' &&
        n[v[0]] != null && n[v[2]] != null)
        return n[v[0]] * 10 + n[v[2]];

    return null;
}

function sourceContainsClock(source, targetMinutes) {
    const src = sourceTextForTime(source);
    if (!src || targetMinutes == null) return false;

    const targetH = Math.floor(targetMinutes / 60);
    const targetM = targetMinutes % 60;

    // 1. 原文直接出现 HH:MM / HH：MM。
    for (const m of src.matchAll(/(?:^|[^\d])([01]?\d|2[0-3])[:：]([0-5]\d)/g)) {
        const h = Number(m[1]);
        const min = Number(m[2]);

        if (h === targetH && min === targetM)
            return true;
    }

    // 2. 带明确时段的中文 X点 / X点XX分。
    const re = /(?:凌晨|半夜|清晨|早晨|早上|上午|中午|下午|傍晚|晚上|晚间|夜间|深夜)\s*([0-9]{1,2}|[零〇一二两三四五六七八九十]{1,3})\s*(?:点|时)(?:\s*([0-9]{1,2}|[零〇一二两三四五六七八九十]{1,3})\s*分)?/g;

    for (const m of src.matchAll(re)) {
        const full = m[0];
        let h = chineseNumberToInt(m[1]);
        const min = m[2] ? chineseNumberToInt(m[2]) : 0;

        if (h == null || min == null || min < 0 || min >= 60)
            continue;

        if (/下午|傍晚|晚上|晚间|夜间|深夜/.test(full)) {
            if (h < 12) h += 12;
        } else if (/中午/.test(full)) {
            if (h < 11) h += 12;
        }

        if (h === targetH && min === targetM)
            return true;
    }

    return false;
}

function verifiedStoryClock(e) {
    // v0.7.6：
    // 先从 timeline.time 得到“候选钟点”，再回原始 source 验证。
    // 不再从长 source 中随便取第一个时间。
    const candidates = clockCandidatesFromTimelineTime(e?.time);

    for (const clock of candidates) {
        if (sourceContainsClock(e?.source, clock))
            return clock;
    }

    // 兼容旧数据：timeline.time 与原文完全同格式时仍可使用。
    const evidence = classifySourceTimeEvidence(e);

    if (evidence.level === 'explicit')
        return parseStoryClock(e?.time);

    return null;
}

function parseStoryClock(time) {
    const s=String(time||'').trim();
    if(!s) return null;
    let m=s.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
    if(m){
        const h=Number(m[1]), min=Number(m[2]);
        if(h>=0&&h<24&&min>=0&&min<60) return h*60+min;
    }
    m=s.match(/(?:凌晨|半夜)\s*(\d{1,2})(?:点|时)/);
    if(m){const h=Number(m[1]); if(h>=0&&h<=11)return h*60;}
    m=s.match(/(?:早晨|早上|上午)\s*(\d{1,2})(?:点|时)?/);
    if(m){const h=Number(m[1]); if(h>=0&&h<=12)return h*60;}
    m=s.match(/(?:中午)\s*(\d{1,2})(?:点|时)?/);
    if(m){let h=Number(m[1]); if(h<11)h+=12; if(h<24)return h*60;}
    m=s.match(/(?:下午)\s*(\d{1,2})(?:点|时)?/);
    if(m){let h=Number(m[1]); if(h<12)h+=12; if(h<24)return h*60;}
    m=s.match(/(?:傍晚|晚上|晚间)\s*(\d{1,2})(?:点|时)?/);
    if(m){let h=Number(m[1]); if(h<12)h+=12; if(h<24)return h*60;}
    // 只有明确钟点才返回 clock。
    // 单独的“凌晨/上午/晚间”等只保留文字，不伪造分钟值。
    return null;
}
function normalizeEventText(text) {
    return String(text||'')
      .toLowerCase()
      .replace(/[\s，。！？、；："'“”‘’（）()\[\]【】<>《》·…—-]+/g,'')
      .replace(/\d{4}年\d{1,2}月\d{1,2}日/g,'')
      .replace(/\d{1,2}[:：]\d{2}/g,'');
}
function charBigrams(s) {
    s=normalizeEventText(s);
    const set=new Set();
    if(s.length<2){ if(s)set.add(s); return set; }
    for(let i=0;i<s.length-1;i++) set.add(s.slice(i,i+2));
    return set;
}
function textSimilarity(a,b) {
    const A=charBigrams(a), B=charBigrams(b);
    if(!A.size||!B.size) return 0;
    let inter=0; for(const x of A) if(B.has(x)) inter++;
    return inter/(A.size+B.size-inter);
}
function addDaysISO(date, days=1) {
    const d=normalizeDateInput(date); if(!d)return null;
    const x=new Date(`${d.iso}T00:00:00Z`);
    x.setUTCDate(x.getUTCDate()+days);
    return x.toISOString().slice(0,10);
}

function previousDayISO(date) { return addDaysISO(date,-1); }

/*
 * v0.6.0 夜间归属修正：
 * 旧摘要常把“前一日晚间 -> 次日凌晨”整段贴到次日。
 * 当同一日期桶同时出现“凌晨/半夜”和“21:00以后晚间”时，
 * 且该日期前一天已经存在于时间线，允许把晚间段回拨到前一天。
 * 这是“归属修正”，不是改变原始聊天。
 */
function repairNightOwnership(rows) {
    let fixed=0;
    const dates=[...new Set(rows.map(x=>isoDateFromAny(x.date)).filter(Boolean))].sort();
    const dateSet=new Set(dates);
    for(const d of dates){
        const prev=previousDayISO(d);
        if(!prev || !dateSet.has(prev)) continue;
        const same=rows.filter(x=>isoDateFromAny(x.date)===d);
        const hasEarly=same.some(x=>{
            const c=x.__clock ?? parseStoryClock(x.time);
            return (c!=null && c<=5*60) || /凌晨|半夜|清晨/.test(`${x.time||''} ${x.event||''}`);
        });
        if(!hasEarly) continue;

        // If this bucket begins as an overnight continuation, late-night records are
        // much more likely to belong to the previous calendar date.
        const earlySources=same.filter(x=>{
            const c=x.__clock ?? parseStoryClock(x.time);
            return (c!=null && c<=5*60) || /凌晨|半夜/.test(`${x.time||''} ${x.event||''}`);
        }).map(x=>x.__src).filter(Number.isFinite);
        if(!earlySources.length) continue;

        for(const x of same){
            const c=x.__clock ?? parseStoryClock(x.time);
            const isLate=(c!=null && c>=21*60) || /晚间\s*2[1-3]|晚上\s*2[1-3]|深夜/.test(`${x.time||''} ${x.event||''}`);
            if(!isLate) continue;
            // Limit correction to the same local narrative cluster, avoiding distant
            // events from a genuinely later evening on the same calendar day.
            const near=earlySources.some(s=>Math.abs((x.__src??1e9)-s)<=40);
            if(near){
                x.date=prev;
                x.__nightOwnershipFixed=true;
                fixed++;
            }
        }
    }
    return fixed;
}


function explicitDateFromEvent(e) {
    // IMPORTANT: e.date is the OLD memory bucket produced by earlier rebuilds.
    // It is not evidence from the original chat and must never be treated as
    // an explicit date. Only time/event text may anchor an absolute date.
    const blob=`${e?.time||''} ${e?.event||''}`;
    const m=blob.match(/(20\d{2})[年\-\/.](\d{1,2})[月\-\/.](\d{1,2})日?/);
    if(!m) return null;
    const iso=`${m[1]}-${String(Number(m[2])).padStart(2,'0')}-${String(Number(m[3])).padStart(2,'0')}`;
    return normalizeDateInput(iso)?.iso || null;
}
function hasStrongNextDayCue(e) {
    return /次日|第二天|翌日|隔天|第二日/.test(`${e?.time||''} ${e?.event||''}`);
}
function hasStrongSameDayCue(e) {
    return /当天|当日|同一天|当晚|当夜/.test(`${e?.time||''} ${e?.event||''}`);
}

function sourceDateAnchor(source) {
    const chat = C().chat || [];
    const indexes = sourceIndexes(source);

    if (!indexes.length) return null;

    const first = indexes[0];

    // 从该 source 向前寻找最近一个原始聊天 <date>。
    // 注意：这里只返回“候选日期锚点”，不代表一定可信。
    for (let i = first; i >= 0; i--) {
        const text = cleanMes(chat[i]);
        const d = extractDateTagFromMessage(text);

        if (d) {
            return {
                date: d,
                source_index: i,
                source: '#' + i + ' <date>',
                distance: first - i,
                text
            };
        }
    }

    return null;
}

function sourceTextAround(index, before=2, after=2) {
    const chat = C().chat || [];
    const a = Math.max(0, Number(index||0) - before);
    const b = Math.min(chat.length, Number(index||0) + after + 1);
    return chat.slice(a,b).map((m,j)=>cleanMes(m)).filter(Boolean).join('\n');
}

function hasStrongRolloverEvidenceText(text) {
    const t = String(text||'');
    if (/次日|第二天|翌日|隔天|第二日/.test(t)) return true;
    if (/跨过(?:午夜|零点)|过了(?:午夜|零点)|午夜之后|零点之后|零点刚过|00[:：]\d{2}/.test(t)) return true;
    if (/第二天早晨|第二天清晨|第二天上午|翌日清晨|翌日上午|次日清晨|次日上午/.test(t)) return true;
    if (/昨晚|昨夜|昨天晚上/.test(t) && /今早|今天早上|清晨|早晨/.test(t)) return true;
    return false;
}

function dateDiffDays(a,b){
    const A=normalizeDateInput(a), B=normalizeDateInput(b);
    if(!A||!B) return null;
    const x=new Date(`${A.iso}T00:00:00Z`), y=new Date(`${B.iso}T00:00:00Z`);
    return Math.round((y-x)/86400000);
}


function detectRawRolloverBetween(startIndex, endIndex) {
    const chat = C().chat || [];
    const a = Math.max(0, Number(startIndex ?? 0));
    const b = Math.min(chat.length - 1, Number(endIndex ?? -1));

    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;

    let lateNightSleep = null;

    for (let i = a; i <= b; i++) {
        const text = cleanMes(chat[i]);
        if (!text) continue;

        // 明确“第二天 / 次日”
        if (/(?:^|[。！？\n])\s*(?:第二天|次日|翌日|隔天|第二日)(?:早晨|清晨|上午|醒来|起床)?/.test(text)) {
            return {
                type:'explicit_next_day',
                source_index:i,
                source:'#' + i
            };
        }

        // 明确跨午夜
        if (/跨过(?:午夜|零点)|过了(?:午夜|零点)|午夜之后|零点之后|零点刚过/.test(text)) {
            return {
                type:'explicit_midnight',
                source_index:i,
                source:'#' + i
            };
        }

        // 明确睡了一夜
        if (/睡了(?:一整)?夜|睡了一夜|一觉睡到(?:第二天|次日)|睡到(?:第二天|次日)/.test(text)) {
            return {
                type:'explicit_overnight_sleep',
                source_index:i,
                source:'#' + i
            };
        }

        // 只有真正的“晚上/深夜 + 入睡”才建立睡眠跨日候选。
        // 凌晨/半夜已经属于新的一天，不能再次触发 +1。
        const lateNight =
            /当晚|当夜|晚上|晚间|夜里|夜间|深夜|22[:：]\d{2}|23[:：]\d{2}/.test(text) &&
            !/凌晨|半夜|零点后|午夜后/.test(text);

        const sleep =
            /睡着|睡下|入睡|睡去|睡觉|合上眼|闭上眼.*睡|抱回.*睡|回.*睡/.test(text);

        if (lateNight && sleep) {
            lateNightSleep = {
                index:i,
                text
            };
        }

        const woke = /醒来|醒过来|睡醒|起床/.test(text);
        const morning = /清晨|早晨|早上|上午|晨光|天亮|早餐/.test(text);

        if (lateNightSleep &&
            i > lateNightSleep.index &&
            woke &&
            morning) {

            return {
                type:'late_night_sleep_to_morning',
                night_index:lateNightSleep.index,
                wake_index:i,
                source:'#' + lateNightSleep.index + '→#' + i
            };
        }
    }

    return null;
}

function validateSourceDateAnchor(r, currentDate, lastAcceptedAnchorIndex=null) {
    const cand = r?.__sourceDate;
    if (!cand?.date) return {accept:false, reason:'no_candidate'};

    if (!currentDate) return {accept:true, reason:'initial_anchor'};

    const diff = dateDiffDays(currentDate, cand.date);
    if (diff === 0) return {accept:true, reason:'same_date'};
    if (diff != null && diff < 0) {
        return {accept:false, reason:'candidate_regression'};
    }

    // 只检查候选 <date> 所在原始消息本身以及当前 source 原文。
    // 不再查看 ±2 条邻居，避免把附近对白中的“第二天/上午/下午”误当成跨日。
    const anchorText = String(cand.text || '');
    const rowText = sourceTextForTime(r.source);
    const joined = `${anchorText}\n${rowText}`;

    if (diff === 1) {
        if (/(?:^|[。！？\n])\s*(?:第二天|次日|翌日|隔天|第二日)(?:早晨|清晨|上午|醒来|起床)?/.test(joined)) {
            return {accept:true, reason:'explicit_next_day_narration'};
        }

        if (/跨过(?:午夜|零点)|过了(?:午夜|零点)|午夜之后|零点之后|零点刚过/.test(joined)) {
            return {accept:true, reason:'explicit_midnight_crossing'};
        }

        if (/天快亮了|天已经亮了|天亮了|窗外(?:已经)?泛白|晨光/.test(anchorText) &&
            /睡吧|睡着|合上眼|醒来|清晨|早晨/.test(joined)) {
            return {accept:true, reason:'dawn_transition'};
        }

        if (/醒来|醒过来|睡醒/.test(joined) && /清晨|早晨|晨光/.test(anchorText)) {
            return {accept:true, reason:'wake_into_morning'};
        }

        // v0.7.0：若当前 <date> 本身没有跨日措辞，则检查“上一个已接受日期锚点”
        // 到当前候选 <date> 之间的原始聊天。这样可识别：
        // 9/12 夜间睡着 -> 中间 #243 醒来/上午 -> 后面 #288 才再次出现 <date>9/13。
        if (Number.isInteger(lastAcceptedAnchorIndex) && Number.isInteger(cand.source_index) &&
            cand.source_index > lastAcceptedAnchorIndex) {
            const intervalRollover = detectRawRolloverBetween(lastAcceptedAnchorIndex, cand.source_index);
            if (intervalRollover) {
                return {
                    accept:true,
                    reason:`raw_interval_${intervalRollover.type}_${intervalRollover.source}`
                };
            }
        }

        return {accept:false, reason:'date_plus_one_without_direct_or_interval_rollover_evidence'};
    }

    if (diff != null && diff > 1) {
        return {accept:false, reason:'large_date_jump_without_evidence'};
    }

    return {accept:false, reason:'unverified_candidate'};
}
/* 直接检查 source 原文里的时间段，不信任摘要自己补的词 */
function sourceDaypart(source) {
    const text = sourceTextForTime(source);

    if (!text) return null;

    if (/凌晨|半夜|午夜后|零点后|清晨/.test(text)) {
        return 'early';
    }

    if (/晚上|晚间|夜间|深夜/.test(text)) {
        return 'late';
    }

    if (/早晨|早上|上午|中午|下午|傍晚/.test(text)) {
        return 'day';
    }

    return null;
}


function hasVerifiedRelativeNextDayCue(r) {
    const src = sourceTextForTime(r?.source);
    if (!src) return false;

    // 只接受叙事推进，不接受角色讨论“第二天要做什么”之类的对白。
    if (/(?:^|[。！？\n])\s*(?:第二天|次日|翌日|隔天|第二日)(?:早晨|清晨|上午|醒来|起床)?/.test(src)) return true;
    if (/跨过(?:午夜|零点)|过了(?:午夜|零点)|午夜之后|零点之后/.test(src)) return true;

    return false;
}


function hasVerifiedWakeAfterNight(prev, r) {
    if (!prev || !r) return false;

    const prevSrc = sourceTextForTime(prev.source);
    const curSrc = sourceTextForTime(r.source);
    if (!prevSrc || !curSrc) return false;

    const lateNight =
        /当晚|当夜|晚上|晚间|夜里|夜间|深夜|22[:：]\d{2}|23[:：]\d{2}/.test(prevSrc) &&
        !/凌晨|半夜|零点后|午夜后/.test(prevSrc);

    const slept =
        /睡着|睡下|入睡|睡去|睡觉|合上眼|闭上眼.*睡|抱回.*睡|回.*睡/.test(prevSrc);

    if (!(lateNight && slept)) return false;

    const woke =
        /醒来|醒过来|睡醒|起床/.test(curSrc);

    const morning =
        /清晨|早晨|早上|上午|晨光|天亮|早餐/.test(curSrc);

    return woke && morning;
}

function rawMessageTextAt(index) {
    const chat = C().chat || [];
    if (!Number.isInteger(index) || index < 0 || index >= chat.length) return '';
    return cleanMes(chat[index]);
}

function detectRawSourceBoundaryRollover(prev, r) {
    if (!prev || !r) return null;

    const prevLast = sourceLast(prev.source);
    const curFirst = sourceFirst(r.source);

    if (!Number.isFinite(prevLast) || !Number.isFinite(curFirst) ||
        prevLast < 0 || curFirst === Number.MAX_SAFE_INTEGER ||
        curFirst <= prevLast) return null;

    const chat = C().chat || [];
    const start = Math.max(0, prevLast - 3);
    const end = Math.min(chat.length - 1, curFirst + 2);

    let sleepIndex = null;

    for (let i = start; i <= end; i++) {
        const text = rawMessageTextAt(i);
        if (!text) continue;

        const lateNight =
            /当晚|当夜|晚上|晚间|夜里|夜间|深夜|22[:：]\d{2}|23[:：]\d{2}/.test(text) &&
            !/凌晨|半夜|零点后|午夜后/.test(text);

        const slept =
            /睡着|睡下|入睡|睡去|睡觉|合上眼|闭上眼.*睡|抱回.*睡|回.*睡/.test(text);

        if (lateNight && slept) {
            sleepIndex = i;
        }

        const woke =
            /醒来|醒过来|睡醒|起床/.test(text);

        const morning =
            /清晨|早晨|早上|上午|晨光|天亮|早餐/.test(text);

        if (sleepIndex !== null &&
            i > sleepIndex &&
            i >= curFirst - 1 &&
            woke &&
            morning) {

            return {
                night_index: sleepIndex,
                wake_index: i,
                night_source: '#' + sleepIndex,
                wake_source: '#' + i
            };
        }
    }

    return null;
}

function rebuildDatesBySourceAxis(mem=M()) {
    const rows=(mem.timeline||[]).map((e,i)=>({
        ...e,
        __i:i,
        __src:sourceFirst(e.source),
        __clock:verifiedStoryClock(e),
        __oldDate:isoDateFromAny(e.date),
        __explicitDate:explicitDateFromEvent(e),
        __sourceDate:sourceDateAnchor(e.source)
    })).sort((a,b)=>(a.__src-b.__src)||(a.__i-b.__i));

    if(!rows.length) return {
        changed:0,midnight_rollovers:0,explicit_overrides:0,
        source_anchor_accepted:0,source_anchor_rejected:0,diagnostics:[]
    };

    const diagnostics=[];
    let changed=0, midnightRollovers=0, explicitOverrides=0;
    let sourceAnchorAccepted=0, sourceAnchorRejected=0;

    const storyStart = normalizeDateInput(mem.story_start||S().storyStart)?.iso || null;

    function isEarlyNight(r){
        if (r.__clock!=null && r.__clock <= 5*60) return true;
        return sourceDaypart(r.source) === 'early';
    }
    function isLateNight(r){
        if (r.__clock!=null && r.__clock >= 21*60) return true;
        return sourceDaypart(r.source) === 'late';
    }

    // 剧情起点是硬锚点；旧 timeline.date 仅作为显示遗留，不用于初始化主日期。
    let currentDate = storyStart || null;
    let prev = null;
    let lastAcceptedAnchorIndex = null;

    // v0.8.1：跨日证据只能消费一次。
    let lastConsumedRolloverIndex = null;

    for(const r of rows){
        const oldDate = r.__oldDate;
        const explicit = r.__explicitDate;
        const sourceAnchor = r.__sourceDate?.date || null;
        let acceptedSourceAnchor = false;

        // 0) 原始聊天 <date> 是“候选锚点”，必须通过连续性验证。
        if(sourceAnchor){
            const validationStartIndex =
                Number.isInteger(lastConsumedRolloverIndex)
                    ? Math.max(
                        Number.isInteger(lastAcceptedAnchorIndex) ? lastAcceptedAnchorIndex : -1,
                        lastConsumedRolloverIndex
                      )
                    : lastAcceptedAnchorIndex;

            const verdict = validateSourceDateAnchor(r, currentDate, validationStartIndex);
            if(verdict.accept){

                // v0.7.8：
                // 如果当前 <date> 只是“与 currentDate 相同”，
                // 但 source 顺序已经出现可靠的晚间 -> 凌晨具体钟点，
                // 则不能让旧 <date> 抢先锁死日期。
                const sameDateMidnightBoundary =
                    verdict.reason === 'same_date' &&
                    prev &&
                    prev.__clock != null &&
                    r.__clock != null &&
                    prev.__clock >= 21 * 60 &&
                    r.__clock <= 5 * 60 + 59;

                if (sameDateMidnightBoundary) {
                    diagnostics.push({
                        type:'same_date_anchor_deferred_for_midnight',
                        source:r.source,
                        content:`候选 ${sourceAnchor} 暂不接受；${prev.time||''} → ${r.time||''}`,
                        reason:'同日 <date> 被可靠晚间→凌晨钟点边界覆盖，交由跨午夜状态机处理'
                    });
                } else {

                if(currentDate !== sourceAnchor){
                    diagnostics.push({
                        type:'source_date_anchor_accepted',
                        source:r.source,
                        content:`${currentDate||'无日期'} → ${sourceAnchor}`,
                        reason:`接受 ${r.__sourceDate.source}：${verdict.reason}`
                    });
                }
                currentDate = sourceAnchor;
                acceptedSourceAnchor = true;
                sourceAnchorAccepted++;
                if (Number.isInteger(r.__sourceDate?.source_index)) {
                    lastAcceptedAnchorIndex = r.__sourceDate.source_index;
                }

                }
            } else {
                sourceAnchorRejected++;
                diagnostics.push({
                    type:'source_date_anchor_rejected',
                    source:r.source,
                    content:`候选 ${sourceAnchor}，维持 ${currentDate||storyStart||'未定'}`,
                    reason:`忽略 ${r.__sourceDate.source}：${verdict.reason}`
                });
            }
        }

        // 1) source 日期候选未被接受时，事件正文里的绝对日期仍需连续性约束。
        if(!acceptedSourceAnchor && explicit){
            const diff = currentDate ? dateDiffDays(currentDate, explicit) : null;
            const rowText = sourceTextForTime(r.source);
            const strong = hasStrongRolloverEvidenceText(rowText);
            if(!currentDate || diff===0 || (diff===1 && strong)){
                if(currentDate !== explicit){
                    diagnostics.push({
                        type:'explicit_date_override',
                        source:r.source,
                        content:`${currentDate||'无日期'} → ${explicit}`,
                        reason:'事件文本绝对日期通过连续性验证'
                    });
                    explicitOverrides++;
                }
                currentDate = explicit;
            } else {
                diagnostics.push({
                    type:'explicit_date_rejected',
                    source:r.source,
                    content:`候选 ${explicit}，维持 ${currentDate}`,
                    reason:'事件文本日期缺少跨日连续性证据'
                });
            }
        }

        // 2) 明确“次日/第二天/翌日”等，相对语义可推进一天。
        if(!acceptedSourceAnchor && currentDate && hasVerifiedRelativeNextDayCue(r)){
            const nd=addDaysISO(currentDate,1) || currentDate;
            if(nd!==currentDate){
                currentDate=nd;
                midnightRollovers++;

                {
                    const consumedIndex = sourceLast(r.source);
                    if (Number.isFinite(consumedIndex) && consumedIndex >= 0) {
                        lastConsumedRolloverIndex = Math.max(
                            Number.isInteger(lastConsumedRolloverIndex) ? lastConsumedRolloverIndex : -1,
                            consumedIndex
                        );
                    }
                }

                diagnostics.push({
                    type:'relative_next_day_rollover',
                    source:r.source,
                    content:`推进至 ${currentDate}`,
                    reason:'检测到明确“次日/第二天/翌日/隔天”语义'
                });
            }
        }
        // 3) 直接回查原始聊天 source 边界。
        // 不依赖 timeline 摘要是否把 #240-#242 / #243 拆成相邻两条。
        else if(!acceptedSourceAnchor && currentDate && prev){
            const rawBoundary = detectRawSourceBoundaryRollover(prev, r);
            if(rawBoundary){
                const nd=addDaysISO(currentDate,1) || currentDate;
                if(nd!==currentDate){
                    currentDate=nd;
                    midnightRollovers++;

                    if (Number.isInteger(rawBoundary.wake_index)) {
                        lastConsumedRolloverIndex = Math.max(
                            Number.isInteger(lastConsumedRolloverIndex) ? lastConsumedRolloverIndex : -1,
                            rawBoundary.wake_index
                        );
                    }

                    diagnostics.push({
                        type:'raw_source_sleep_wake_rollover',
                        source:r.source,
                        content:`${rawBoundary.night_source} 夜间/入睡 → ${rawBoundary.wake_source} 醒来/上午；推进至 ${currentDate}`,
                        reason:'直接检查原始聊天 source 边界，确认夜间/入睡后进入醒来后的新一天'
                    });
                }
            }
            // 若没有 raw source 边界证据，再退回 timeline source 原文连续性。
            else if(hasVerifiedWakeAfterNight(prev, r)){
                const nd=addDaysISO(currentDate,1) || currentDate;
                if(nd!==currentDate){
                    currentDate=nd;
                    midnightRollovers++;

                    {
                        const consumedIndex = sourceLast(r.source);
                        if (Number.isFinite(consumedIndex) && consumedIndex >= 0) {
                            lastConsumedRolloverIndex = Math.max(
                                Number.isInteger(lastConsumedRolloverIndex) ? lastConsumedRolloverIndex : -1,
                                consumedIndex
                            );
                        }
                    }

                    diagnostics.push({
                        type:'verified_sleep_wake_rollover',
                        source:r.source,
                        content:`${prev.time||'夜间'} → ${r.time||'醒来/上午'}；推进至 ${currentDate}`,
                        reason:'source 原文明确从夜间/入睡进入醒来后的新一天'
                    });
                }
            }
            // 仍无睡醒证据时，最后再检查原文可验证的具体晚间→凌晨钟点。
            else if(
                prev.__clock != null &&
                r.__clock != null &&
                prev.__clock >= 21 * 60 &&
                r.__clock <= 5 * 60 + 59
            ){
                const nd=addDaysISO(currentDate,1) || currentDate;
                if(nd!==currentDate){
                    currentDate=nd;
                    midnightRollovers++;

                    {
                        const consumedIndex = sourceLast(r.source);
                        if (Number.isFinite(consumedIndex) && consumedIndex >= 0) {
                            lastConsumedRolloverIndex = Math.max(
                                Number.isInteger(lastConsumedRolloverIndex) ? lastConsumedRolloverIndex : -1,
                                consumedIndex
                            );
                        }
                    }

                    diagnostics.push({
                        type:'verified_midnight_rollover',
                        source:r.source,
                        content:`${prev.time||''} → ${r.time||''}；推进至 ${currentDate}`,
                        reason:'source 原文验证的具体钟点由深夜进入凌晨'
                    });
                }
            }
        }

        if(!currentDate) currentDate = storyStart || oldDate || null;

        if(currentDate){
            if(oldDate !== currentDate){
                changed++;
                diagnostics.push({
                    type:'date_reassigned_by_continuity',
                    source:r.source,
                    content:`${oldDate||'无日期'} → ${currentDate}`,
                    reason:'按候选日期锚点 + 连续性验证重新归属日期'
                });
            }
            r.date=currentDate;
        }

        // 4) 同日时间冲突只做提示，source 顺序不变。
        if(prev && r.date===prev.date && prev.__clock!=null && r.__clock!=null &&
           r.__src>=prev.__src && r.__clock < prev.__clock &&
           !/回忆|此前|过去|之前/.test(`${r.event||''}`)){
            diagnostics.push({
                type:'clock_text_conflict',
                source:r.source,
                content:`source ${prev.source||''} → ${r.source||''}; 时间 ${prev.time||''} → ${r.time||''}`,
                reason:'时间文本与 source 顺序冲突；不改变 source 顺序'
            });
        }

        prev=r;
    }

    mem.timeline=rows.map(({__i,__src,__clock,__oldDate,__explicitDate,__sourceDate,...e})=>{
        const te=classifySourceTimeEvidence(e);
        return {
            ...e,
            time_evidence:te.level,
            time_evidence_label:te.label,
            time_evidence_reason:te.reason
        };
    });

    mem.source_axis={
        version:'0.7.2',
        at:new Date().toISOString(),
        changed,
        midnight_rollovers:midnightRollovers,
        explicit_overrides:explicitOverrides,
        source_anchor_accepted:sourceAnchorAccepted,
        source_anchor_rejected:sourceAnchorRejected,
        diagnostics:diagnostics.slice(-250)
    };
    return mem.source_axis;
}
function calibrateTimeline(mem=M(), {allowCrossMidnight=true}={}) {
    const input=Array.isArray(mem.timeline)?mem.timeline:[];
    const rows=input.map((e,i)=>({...e,__i:i,__src:sourceFirst(e.source),__last:sourceLast(e.source),__clock:verifiedStoryClock(e)}));

    // 1) Merge only strong duplicates, in source order.
    const merged=[];
    let duplicateMerged=0;
    for(const row of rows.sort((a,b)=>(a.__src-b.__src)||(a.__i-b.__i))){
        let hit=null;
        for(let j=merged.length-1;j>=Math.max(0,merged.length-12);j--){
            const prev=merged[j];
            const nearSource=row.__src!==Number.MAX_SAFE_INTEGER && prev.__src!==Number.MAX_SAFE_INTEGER &&
                             Math.abs(row.__src-prev.__src)<=8;
            const overlap=sourceIndexes(row.source).some(x=>sourceIndexes(prev.source).includes(x));
            const sim=textSimilarity(prev.event,row.event);
            if((overlap && sim>=0.50) || (nearSource && sim>=0.74)){ hit=prev; break; }
        }
        if(hit){
            if(String(row.event||'').length>String(hit.event||'').length) hit.event=row.event;
            hit.source=mergeSources(hit.source,row.source);
            if(!hit.time && row.time) hit.time=row.time;
            if(!explicitDateFromEvent(hit) && explicitDateFromEvent(row)) hit.date=explicitDateFromEvent(row);
            hit.__src=Math.min(hit.__src,row.__src);
            duplicateMerged++;
        } else merged.push(row);
    }
    mem.timeline=merged.map(({__i,__src,__last,__clock,...e})=>e);

    // 2) Reconstruct calendar ownership from source chronology.
    // "凌晨/半夜" alone NEVER increments the date.
    const axis=rebuildDatesBySourceAxis(mem);

    // 3) Preserve source order inside each date. Time text is diagnostic only.
    mem.timeline=(mem.timeline||[]).sort((a,b)=>{
        const da=isoDateFromAny(a.date)||'9999-99-99', db=isoDateFromAny(b.date)||'9999-99-99';
        if(da!==db) return da.localeCompare(db);
        const sa=sourceFirst(a.source), sb=sourceFirst(b.source);
        if(sa!==sb) return sa-sb;
        const ca=verifiedStoryClock(a), cb=verifiedStoryClock(b);
        if(ca!=null && cb!=null && ca!==cb) return ca-cb;
        return 0;
    });

    mem.timeline_calibration={
        version:'0.7.2',
        at:new Date().toISOString(),
        duplicate_merged:duplicateMerged,
        date_reassigned:Number(axis.changed||0),
        date_islands_fixed:0,
        explicit_date_overrides:Number(axis.explicit_overrides||0),
        confirmed_rollovers:Number(axis.midnight_rollovers||0),
        source_anchor_accepted:Number(axis.source_anchor_accepted||0),
        source_anchor_rejected:Number(axis.source_anchor_rejected||0),
        ordering:'source_first_date_axis',
        diagnostics:(axis.diagnostics||[]).slice(-150)
    };
    return mem.timeline_calibration;
}


function latestTimelineDateBySource(mem=M()) {
    const rows = (mem.timeline || []).map((e,i)=>({
        e,
        i,
        date: isoDateFromAny(e?.date),
        last: sourceLast(e?.source),
        first: sourceFirst(e?.source)
    })).filter(x=>x.date);

    if (!rows.length) return null;

    // 优先使用 source 最靠后的时间线记录，代表当前主线最近发生的事件。
    const withSource = rows.filter(x=>Number.isFinite(x.last) && x.last >= 0);
    if (withSource.length) {
        withSource.sort((a,b)=>(a.last-b.last)||(a.first-b.first)||(a.i-b.i));
        return withSource[withSource.length-1].date;
    }

    // 没有 source 时才退回时间线中的最大日期。
    return rows.map(x=>x.date).sort().at(-1) || null;
}

function syncCurrentDateFromTimeline(mem=M(), modelDate=null) {
    const timelineDate = latestTimelineDateBySource(mem);
    const normalizedModel = normalizeDateInput(modelDate || '')?.iso || null;

    if (!timelineDate) return {
        changed:false,
        timeline_date:null,
        model_date:normalizedModel,
        current:mem.current_story_date || null
    };

    const before = mem.current_story_date || null;
    mem.current_story_date = timelineDate;

    if (before !== timelineDate || (normalizedModel && normalizedModel !== timelineDate)) {
        mem.audit = Array.isArray(mem.audit) ? mem.audit : [];
        mem.audit.push({
            at:new Date().toISOString(),
            type:'current_date_synced_from_timeline',
            before,
            model_date:normalizedModel,
            timeline_date:timelineDate,
            reason:'以 source 最靠后的已校准 timeline 日期同步 current_story_date，避免模型 current_story_date 与时间线脱节'
        });
    }

    return {
        changed:before !== timelineDate,
        timeline_date:timelineDate,
        model_date:normalizedModel,
        current:timelineDate
    };
}


// =========================================================
// v0.8.5 状态层
// =========================================================

function validMemorySourceV085(source) {
    const src = String(source || '').trim();

    if (!src) return false;

    if (/主线总结|剧情总结|历史总结|summary/i.test(src)) {
        return false;
    }

    return /#\d+/.test(src);
}

function relationshipSourceLastV085(x) {
    const indexes = sourceIndexes(x?.source);
    return indexes.length ? indexes[indexes.length - 1] : -1;
}

function normalizeRelationshipsV085(mem) {
    const input = Array.isArray(mem.relationships)
        ? mem.relationships
        : [];

    const map = new Map();
    let rejected = 0;

    for (const raw of input) {
        if (!raw || typeof raw !== 'object') continue;

        // 主线总结、无 source 等旧污染不再作为当前关系状态。
        if (!validMemorySourceV085(raw.source)) {
            rejected++;
            continue;
        }

        const people = Array.isArray(raw.people)
            ? raw.people.map(canonicalPersonName)
                      .filter(Boolean)
            : [];

        const unique = [...new Set(people)];

        // relationships 只保存明确的双人关系。
        // 多人同场/群体互动应该由 timeline 保存。
        if (unique.length !== 2) {
            rejected++;
            continue;
        }

        const normalized = {
            ...raw,
            people: unique
        };

        const key = [...unique]
            .sort((a,b)=>a.localeCompare(b,'zh-CN'))
            .join(' ↔ ');

        const old = map.get(key);

        if (!old) {
            map.set(key, normalized);
            continue;
        }

        // source 靠后的记录代表更新后的关系快照。
        const oldLast = relationshipSourceLastV085(old);
        const newLast = relationshipSourceLastV085(normalized);

        if (newLast >= oldLast) {
            map.set(key, normalized);
        }
    }

    mem.relationships = [...map.values()];

    return {
        before: input.length,
        after: mem.relationships.length,
        removed: Math.max(0, input.length - mem.relationships.length),
        rejected
    };
}

function normalizeCharactersV085(mem) {
    const old = mem.characters && typeof mem.characters === 'object'
        ? mem.characters
        : {};

    const out = {};

    for (const [name, data] of Object.entries(old)) {
        const canon = canonicalPersonName(name);

        out[canon] = {
            ...(out[canon] || {}),
            ...(data && typeof data === 'object' ? data : {})
        };
    }

    mem.characters = out;

    return {
        before: Object.keys(old).length,
        after: Object.keys(out).length
    };
}


function normalizeOpenLoopsV085(mem) {
    const input = Array.isArray(mem.open_loops)
        ? mem.open_loops
        : [];

    const migratedClosed = migrateClosedLoopsToTombstonesV0106(mem);
    const map = new Map();

    let waitingMigrated = 0;
    let terminalRemoved = 0;
    let invalidStatusNormalized = 0;
    let tombstonedRemoved = 0;

    for (const rawInput of input) {
        if (!rawInput || typeof rawInput !== 'object') continue;

        const raw = {...rawInput};
        let status = String(raw.status || '').trim().toLowerCase();

        if (status === 'waiting_condition') {
            status = 'pending';
            raw.status = 'pending';
            waitingMigrated++;
        }

        const terminal = loopTerminalStatusV086(status);

        if (terminal) {
            rememberLoopTombstoneV0106(mem, raw, terminal);
            terminalRemoved++;
            continue;
        }

        const desc = String(raw.description || '').trim();
        if (!desc) continue;

        if (
            status !== 'pending' &&
            status !== 'in_progress' &&
            status !== 'at_risk'
        ) {
            status = 'pending';
            invalidStatusNormalized++;
        }

        raw.status = status;

        if (loopIsTombstonedV0106(mem, raw)) {
            tombstonedRemoved++;
            continue;
        }

        const key = loopKeyV086(raw);
        if (!key) continue;

        const old = map.get(key);
        map.set(key, old ? {...old, ...raw} : raw);
    }

    mem.open_loops = [...map.values()];
    mem.closed_loops = [];

    if (
        migratedClosed ||
        waitingMigrated ||
        terminalRemoved ||
        invalidStatusNormalized ||
        tombstonedRemoved
    ) {
        mem.audit = Array.isArray(mem.audit) ? mem.audit : [];
        mem.audit.push({
            at: new Date().toISOString(),
            type: 'open_loop_normalize_v0106',
            legacy_closed_to_tombstones: migratedClosed,
            waiting_condition_to_pending: waitingMigrated,
            terminal_removed: terminalRemoved,
            invalid_status_to_pending: invalidStatusNormalized,
            tombstoned_reopen_blocked: tombstonedRemoved
        });
        if (mem.audit.length > 50) mem.audit = mem.audit.slice(-50);
    }

    return {
        before: input.length,
        after: mem.open_loops.length,
        legacy_closed_migrated: migratedClosed,
        waiting_migrated: waitingMigrated,
        terminal_removed: terminalRemoved,
        invalid_status_normalized: invalidStatusNormalized,
        tombstoned_removed: tombstonedRemoved
    };
}

function cleanQuarantineV085(mem) {
    const input = Array.isArray(mem.quarantined)
        ? mem.quarantined
        : [];

    const out=[];
    const seen=new Set();

    let autoRemoved=0;
    let duplicateRemoved=0;

    function compactText(x){
        return String(x||'')
            .toLowerCase()
            .replace(/[\s，。；：、,.!！?？"'“”‘’（）()[\]【】]/g,'');
    }

    function isPseudoQuarantine(x){
        const reason=String(x?.reason||'').trim();
        const content=String(x?.content||'').trim();
        const joined=(reason+' '+content).toLowerCase();

        // v0.8.7：
        // “没有冲突 / 当前进行中 / 不构成矛盾”绝不是隔离项。
        if (
            /暂无需要隔离|无需要隔离|无未确认内容|无明显冲突|本轮.*无.*冲突|不构成(?:事实)?矛盾|非矛盾|当前情节进行中|属于对话互动细节/.test(joined)
        ) {
            return true;
        }

        // 日期漂移已经由 source_axis / timeline_calibration 专门审计，
        // 不再重复塞进 quarantined。
        if (
            /时间漂移|日期漂移|绝对剧情日期.*冲突|当前绝对日期.*冲突|可靠日期.*冲突|<date>标签.*忽略|忽略.*<date>/.test(joined)
        ) {
            return true;
        }

        // v0.8.2 已处理的旧 timeline source 污染。
        if (
            reason === 'timeline_source_invalid_v0.8.2' ||
            /主线总结|剧情总结|历史总结|summary/i.test(String(x?.source||''))
        ) {
            return true;
        }

        return false;
    }

    function quarantineKey(x){
        const reason=String(x?.reason||'').trim();
        const content=compactText(x?.content);
        const due=String(x?.original_due||x?.due||'').trim();

        // Generic future-leak de-duplication. Public builds must never contain
        // story-specific people, places or event names.
        if (/future_leak_without_current_timeline_support_v0\.8\.6/.test(reason)) {
            const date =
                due.match(/20\d{2}-\d{2}-\d{2}/)?.[0] ||
                String(x?.content||'').match(/20\d{2}-\d{2}-\d{2}/)?.[0] ||
                '';

            const topic = content
                .replace(/20\d{2}\d{1,2}\d{1,2}/g,'')
                .replace(/\d{1,2}(?:点|时)\d{0,2}分?/g,'')
                .slice(0,80);

            return JSON.stringify([
                'future_leak',
                topic,
                date
            ]);
        }

        return JSON.stringify([
            reason,
            content,
            String(x?.source||'').trim()
        ]);
    }

    for(const raw of input){
        if(!raw || typeof raw!=='object') continue;

        if(isPseudoQuarantine(raw)){
            autoRemoved++;
            continue;
        }

        const key=quarantineKey(raw);

        if(seen.has(key)){
            duplicateRemoved++;
            continue;
        }

        seen.add(key);
        out.push(raw);
    }

    mem.quarantined=out;

    return {
        before:input.length,
        after:out.length,
        auto_removed:autoRemoved,
        duplicate_removed:duplicateRemoved
    };
}

function normalizeMemoryStateV085(mem=M()) {
    const characters = normalizeCharactersV085(mem);
    const relationships = normalizeRelationshipsV085(mem);
    const openLoops = normalizeOpenLoopsV085(mem);
    const quarantined = cleanQuarantineV085(mem);

    mem.audit = Array.isArray(mem.audit) ? mem.audit : [];

    mem.audit.push({
        at:new Date().toISOString(),
        type:'memory_state_normalized_v0.8.5',
        characters,
        relationships,
        open_loops:openLoops,
        quarantined
    });

    if (mem.audit.length > 50) {
        mem.audit = mem.audit.slice(-50);
    }

    return {
        characters,
        relationships,
        open_loops:openLoops,
        quarantined
    };
}



// =========================================================
// v0.8.6 open_loops lifecycle
// =========================================================

function loopTerminalStatusV086(status) {
    const s = String(status || '').trim().toLowerCase();

    // "closed" 仅作旧数据兼容，统一视为 completed。
    if (/^(completed|done|resolved|closed|已完成|完成|已解决|已关闭)$/.test(s)) {
        return 'completed';
    }

    if (/^(cancelled|canceled|已取消|取消)$/.test(s)) {
        return 'cancelled';
    }

    if (/^(missed|错过|失约)$/.test(s)) {
        return 'missed';
    }

    if (/^(superseded|replaced|已替代|被替代)$/.test(s)) {
        return 'superseded';
    }

    if (/^(invalidated|失效|无法执行)$/.test(s)) {
        return 'invalidated';
    }

    return null;
}

function isStableLoopIdV0105(id) {
    const s = String(id || '').trim();

    if (!s) return false;

    // loop / loop_1 / loop-23 等属于模型常见临时编号，
    // 不能拿来阻止未来完全不同的新事项重新打开。
    return !/^loop(?:[_-]?\d+)?$/i.test(s);
}

function loopKeyV086(x) {
    const id = String(x?.id || '').trim();

    if (isStableLoopIdV0105(id)) {
        return 'id:' + id.toLowerCase();
    }

    const desc = String(x?.description || '')
        .trim()
        .toLowerCase()
        .replace(/[\s，。；：、,.!！?？"'“”‘’（）()\[\]【】]/g, '')
        .slice(0, 160);

    return desc ? 'desc:' + desc : '';
}

function loopDueSignatureV0106(loop) {
    if (!loop || typeof loop !== 'object') return '';

    return [
        loop.due,
        loop.scheduled_time,
        loop.datetime,
        loop.due_date,
        loop.date,
        loop.due_time,
        loop.time
    ]
        .filter(v => v != null && String(v).trim())
        .map(v => String(v).trim().toLowerCase())
        .join('|')
        .replace(/\s+/g,' ')
        .slice(0,120);
}

function loopIdentityV0106(loop) {
    const key = loopKeyV086(loop);
    if (!key) return '';
    return JSON.stringify([key, loopDueSignatureV0106(loop)]);
}

function rememberLoopTombstoneV0106(mem, loop, status='closed') {
    const identity = loopIdentityV0106(loop);
    if (!identity) return false;

    mem.loop_tombstones = Array.isArray(mem.loop_tombstones)
        ? mem.loop_tombstones
        : [];

    const stableId = isStableLoopIdV0105(loop?.id)
        ? String(loop.id).trim()
        : null;

    const row = {
        key: identity,
        stable_id: stableId,
        status: String(status || 'closed'),
        due: loopDueSignatureV0106(loop) || null,
        at_story_date: mem.current_story_date || null
    };

    const oldIndex = mem.loop_tombstones.findIndex(x => x?.key === identity);
    if (oldIndex >= 0) mem.loop_tombstones.splice(oldIndex, 1);
    mem.loop_tombstones.push(row);
    mem.loop_tombstones = mem.loop_tombstones.slice(-80);
    return true;
}

function loopIsTombstonedV0106(mem, loop) {
    const rows = Array.isArray(mem?.loop_tombstones)
        ? mem.loop_tombstones
        : [];
    const identity = loopIdentityV0106(loop);
    if (identity && rows.some(x => x?.key === identity)) return true;

    const stableId = isStableLoopIdV0105(loop?.id)
        ? String(loop.id).trim()
        : '';
    if (!stableId) return false;

    const due = loopDueSignatureV0106(loop);
    return rows.some(x =>
        String(x?.stable_id || '') === stableId &&
        String(x?.due || '') === due
    );
}

function migrateClosedLoopsToTombstonesV0106(mem) {
    const old = Array.isArray(mem.closed_loops) ? mem.closed_loops : [];
    let migrated = 0;

    for (const row of old) {
        if (!row || typeof row !== 'object') continue;
        if (rememberLoopTombstoneV0106(mem, row, row.status || 'closed')) migrated++;
    }

    mem.closed_loops = [];
    return migrated;
}

function closeLoopV086(mem, oldLoop, update, terminalStatus) {
    const row = {
        ...(oldLoop && typeof oldLoop === 'object' ? oldLoop : {}),
        ...(update && typeof update === 'object' ? update : {}),
        status: terminalStatus
    };

    return rememberLoopTombstoneV0106(mem, row, terminalStatus);
}

function storyDatePartsV0104(value) {
    const text = String(value || '').trim();

    const m = text.match(
        /(20\d{2})[-\/.年](\d{1,2})[-\/.月](\d{1,2})/
    );

    if (!m) return null;

    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);

    if (
        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        !Number.isInteger(day) ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31
    ) {
        return null;
    }

    return {
        year,
        month,
        day,
        key: year * 10000 + month * 100 + day
    };
}

function storyTimeMinutesV0104(value) {
    const text = String(value || '').trim();

    const m = text.match(/(?:^|[^\d])(\d{1,2}):(\d{2})(?:[^\d]|$)/);

    if (m) {
        const hour = Number(m[1]);
        const minute = Number(m[2]);

        if (
            Number.isInteger(hour) &&
            Number.isInteger(minute) &&
            hour >= 0 &&
            hour <= 23 &&
            minute >= 0 &&
            minute <= 59
        ) {
            return hour * 60 + minute;
        }
    }

    const zh = text.match(
        /(凌晨|清晨|早晨|上午|中午|下午|傍晚|晚上|夜间|夜晚|深夜)?\s*(\d{1,2})\s*(?:点|时)(?:\s*(\d{1,2})\s*分?)?/
    );

    if (!zh) return null;

    const period = zh[1] || '';
    let hour = Number(zh[2]);
    const minute = Number(zh[3] || 0);

    if (
        !Number.isInteger(hour) ||
        !Number.isInteger(minute) ||
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59
    ) {
        return null;
    }

    if (/下午|傍晚|晚上|夜间|夜晚|深夜/.test(period) && hour < 12) {
        hour += 12;
    } else if (/凌晨/.test(period) && hour === 12) {
        hour = 0;
    } else if (/中午/.test(period) && hour < 11) {
        hour += 12;
    }

    return hour * 60 + minute;
}

function loopDuePartsV0104(loop) {
    if (!loop || typeof loop !== 'object') return null;

    const combined = [
        loop.due,
        loop.scheduled_time,
        loop.datetime,
        loop.date,
        loop.due_date,
        loop.due_time,
        loop.time
    ]
        .filter(v => v != null && String(v).trim())
        .map(v => String(v).trim())
        .join(' ');

    if (!combined) return null;

    const date =
        storyDatePartsV0104(combined) ||
        storyDatePartsV0104(loop.due_date) ||
        storyDatePartsV0104(loop.date);

    if (!date) return null;

    const minutes =
        storyTimeMinutesV0104(combined) ??
        storyTimeMinutesV0104(loop.due_time) ??
        storyTimeMinutesV0104(loop.time);

    return {
        date,
        minutes
    };
}

function loopIsClearlyFutureV0104(mem, loop) {
    const currentDate = storyDatePartsV0104(
        mem?.current_story_date
    );

    if (!currentDate) return false;

    const due = loopDuePartsV0104(loop);

    if (!due?.date) return false;

    // 日期明确晚于当前剧情日期：确定是未来。
    if (due.date.key > currentDate.key) {
        return true;
    }

    // 日期已经早于当前剧情日期：不是未来。
    if (due.date.key < currentDate.key) {
        return false;
    }

    // 同一天时，只有双方时间都明确，才判断。
    const currentMinutes = storyTimeMinutesV0104(
        mem?.current_story_time
    );

    if (
        currentMinutes == null ||
        due.minutes == null
    ) {
        return false;
    }

    return due.minutes > currentMinutes;
}


function loopIsClearlyPastV0105(mem, loop) {
    const currentDate = storyDatePartsV0104(
        mem?.current_story_date
    );

    if (!currentDate) return false;

    const due = loopDuePartsV0104(loop);

    if (!due?.date) return false;

    if (due.date.key < currentDate.key) {
        return true;
    }

    if (due.date.key > currentDate.key) {
        return false;
    }

    const currentMinutes = storyTimeMinutesV0104(
        mem?.current_story_time
    );

    if (
        currentMinutes == null ||
        due.minutes == null
    ) {
        return false;
    }

    return due.minutes < currentMinutes;
}

function guardOpenLoopsTemporalV0105(mem=M()) {
    const rows = Array.isArray(mem.open_loops)
        ? mem.open_loops
        : [];

    let futureCorrected = 0;

    for (const loop of rows) {
        if (!loop || typeof loop !== 'object') continue;

        if (
            String(loop.status || '').toLowerCase() === 'in_progress' &&
            loopIsClearlyFutureV0104(mem, loop)
        ) {
            loop.status = 'pending';
            futureCorrected++;
        }
    }

    if (futureCorrected) {
        mem.audit = Array.isArray(mem.audit)
            ? mem.audit
            : [];

        mem.audit.push({
            at: new Date().toISOString(),
            type: 'open_loop_temporal_guard_v0105',
            future_in_progress_to_pending: futureCorrected,
            rule: 'canonical_story_time_only'
        });

        if (mem.audit.length > 50) {
            mem.audit = mem.audit.slice(-50);
        }
    }

    return {
        future_corrected: futureCorrected
    };
}

function pruneExpiredOpenLoopsV0106(mem=M()) {
    const rows = Array.isArray(mem.open_loops) ? mem.open_loops : [];
    const currentDate = storyDatePartsV0104(mem.current_story_date);
    const kept = [];
    let expired = 0;

    for (const loop of rows) {
        if (!loop || typeof loop !== 'object') continue;

        const status = String(loop.status || 'pending').trim().toLowerCase();
        const due = loopDuePartsV0104(loop);
        const past = loopIsClearlyPastV0105(mem, loop);

        let shouldExpire = false;

        if (past && (status === 'pending' || status === 'at_risk')) {
            shouldExpire = true;
        }

        // An in-progress item's due time usually means its start time. Keep it on
        // the same day, but never carry a stale in-progress item into later days.
        if (
            status === 'in_progress' &&
            currentDate &&
            due?.date &&
            due.date.key < currentDate.key
        ) {
            shouldExpire = true;
        }

        if (shouldExpire) {
            rememberLoopTombstoneV0106(mem, loop, 'expired');
            expired++;
        } else {
            kept.push(loop);
        }
    }

    mem.open_loops = kept;
    mem.closed_loops = [];

    if (expired) {
        mem.audit = Array.isArray(mem.audit) ? mem.audit : [];
        mem.audit.push({
            at: new Date().toISOString(),
            type: 'open_loop_expiry_prune_v0106',
            expired_removed: expired,
            rule: 'pending/at_risk past due; in_progress only after calendar day has passed'
        });
        if (mem.audit.length > 50) mem.audit = mem.audit.slice(-50);
    }

    return {expired_removed: expired, open_after: kept.length};
}

function mergeOpenLoopsV086(mem, incoming) {
    const open = Array.isArray(mem.open_loops)
        ? [...mem.open_loops]
        : [];

    const rows = Array.isArray(incoming)
        ? incoming
        : [];

    migrateClosedLoopsToTombstonesV0106(mem);

    const indexByKey = () => {
        const map = new Map();
        open.forEach((x, i) => {
            const k = loopKeyV086(x);
            if (k) map.set(k, i);
        });
        return map;
    };

    let added = 0;
    let updated = 0;
    let removed = 0;
    let waitingMigrated = 0;
    let reopenBlocked = 0;

    for (const raw of rows) {
        if (!raw || typeof raw !== 'object') continue;

        const x = {...raw};
        const terminal = loopTerminalStatusV086(x.status);
        const key = loopKeyV086(x);
        if (!key) continue;

        const map = indexByKey();
        const idx = map.has(key) ? map.get(key) : -1;

        if (terminal) {
            // Only close a real active item. This prevents a hallucinated terminal
            // row from creating history that never existed.
            if (idx >= 0) {
                closeLoopV086(mem, open[idx], x, terminal);
                open.splice(idx, 1);
                removed++;
            }
            continue;
        }

        let rawStatus = String(x.status || '').trim().toLowerCase();
        if (rawStatus === 'waiting_condition') {
            rawStatus = 'pending';
            waitingMigrated++;
        }

        x.status =
            rawStatus === 'in_progress' || rawStatus === 'at_risk'
                ? rawStatus
                : 'pending';

        if (loopIsTombstonedV0106(mem, x)) {
            reopenBlocked++;
            continue;
        }

        if (idx >= 0) {
            open[idx] = {...open[idx], ...x};
            updated++;
        } else {
            open.push(x);
            added++;
        }
    }

    mem.open_loops = open;
    mem.closed_loops = [];

    if (waitingMigrated || reopenBlocked) {
        mem.audit = Array.isArray(mem.audit) ? mem.audit : [];
        mem.audit.push({
            at: new Date().toISOString(),
            type: 'open_loop_merge_guard_v0106',
            waiting_condition_to_pending: waitingMigrated,
            tombstoned_reopen_blocked: reopenBlocked
        });
        if (mem.audit.length > 50) mem.audit = mem.audit.slice(-50);
    }

    return {
        incoming: rows.length,
        added,
        updated,
        removed,
        waiting_migrated: waitingMigrated,
        reopen_blocked: reopenBlocked,
        open_after: open.length
    };
}

function mergeCharacterAnchorsV0110(mem, incoming) {
    mem.character_anchors = Array.isArray(mem.character_anchors) ? mem.character_anchors : [];
    const map = new Map();
    for (const row of mem.character_anchors) {
        const name = canonicalPersonName(row?.name || '');
        if (name) map.set(name, {...row, name});
    }

    for (const raw of (Array.isArray(incoming) ? incoming : [])) {
        const name = canonicalPersonName(raw?.name || '');
        if (!name) continue;
        const old = map.get(name) || {name};
        const next = {...old, name};

        // Core identity fields are sticky: summaries may fill blanks, not casually rewrite them.
        for (const field of ['core_personality','speech_style','decision_style','emotional_style','hard_boundaries']) {
            if ((!next[field] || !String(next[field]).trim()) && raw?.[field] != null && String(raw[field]).trim()) {
                next[field] = raw[field];
            }
        }

        // Relationship dynamics can evolve with story evidence.
        if (raw?.relationship_dynamic != null && String(raw.relationship_dynamic).trim()) {
            next.relationship_dynamic = raw.relationship_dynamic;
        }

        for (const field of ['signature_behaviors','do_not_drift']) {
            const vals = [
                ...(Array.isArray(old?.[field]) ? old[field] : []),
                ...(Array.isArray(raw?.[field]) ? raw[field] : [])
            ].map(x => String(x || '').trim()).filter(Boolean);
            next[field] = [...new Set(vals)].slice(-16);
        }

        if (raw?.source) next.source = raw.source;
        map.set(name, next);
    }

    mem.character_anchors = [...map.values()].slice(-30);
}

function mergeActiveArcsV0110(mem, incoming) {
    if (!Array.isArray(incoming)) return;
    const seen = new Set();
    const out = [];
    for (const raw of incoming) {
        if (!raw || typeof raw !== 'object') continue;
        const title = String(raw.title || '').trim();
        const summary = String(raw.summary || '').trim();
        if (!title || !summary) continue;
        const id = String(raw.id || title).trim().toLowerCase();
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({...raw, id: String(raw.id || title).trim()});
        if (out.length >= 6) break;
    }
    mem.active_arcs = out;
}

function mergeItemsV0110(mem, incoming) {
    const oldRows = Array.isArray(mem.items) ? mem.items : [];
    const map = new Map();
    const keyOf = x => String(x?.name || '').trim().toLowerCase().replace(/\s+/g,'');
    for (const row of oldRows) {
        const key = keyOf(row);
        if (key) map.set(key, {...row});
    }
    for (const raw of (Array.isArray(incoming) ? incoming : [])) {
        const key = keyOf(raw);
        if (!key) continue;
        const old = map.get(key) || {};
        const next = {...old, ...raw};
        const oldOwner = String(old.owner || '').trim();
        const newOwner = String(raw.owner || '').trim();
        const transfer = String(raw.transfer_evidence || '').trim();

        if (oldOwner && newOwner && oldOwner !== newOwner && !transfer) {
            next.owner = old.owner; // use/holding/location never implies ownership transfer
        } else if (oldOwner && newOwner && oldOwner !== newOwner && transfer) {
            next.source_owner = next.source_owner || old.owner;
        }

        // Empty transient fields should not erase a known value unless the model explicitly says "none".
        for (const field of ['holder','user','location','source_owner']) {
            if (raw[field] == null || String(raw[field]).trim() === '') {
                if (old[field] !== undefined) next[field] = old[field];
            }
        }
        map.set(key, next);
    }
    mem.items = [...map.values()];
}

function mergeResult(mem, r, endIndex) {
    // A chronological state change is not a contradiction.
    // Only keep conflicts that survive the continuity filter.
    const conflictFilter = filterConflictsForStoryContinuity(r.conflicts);
    r.conflicts = conflictFilter.keep;

    if (conflictFilter.evolved.length) {
        mem.audit.push({
            at: new Date().toISOString(),
            type: 'temporal_evolution_not_conflict',
            items: conflictFilter.evolved
        });
    }

    // v0.8.2：timeline source 防火墙。
    // timeline 必须能够追溯到真实原始聊天 #编号。
    // “主线总结（X）”等模型内部摘要标签不得作为历史事件重新进入 timeline。
    const validTimelineSource = (source) => {
        const src = String(source || '').trim();
        if (!src) return false;

        // 明确拒绝模型生成的摘要/总结伪来源。
        if (/主线总结|剧情总结|历史总结|summary/i.test(src)) return false;

        // 至少必须包含真实聊天楼层编号，如 #101、#101-#104、#101,#103。
        return /#\d+/.test(src);
    };

    const incomingTimeline = Array.isArray(r.timeline) ? r.timeline : [];
    const acceptedTimeline = [];
    const rejectedTimeline = [];

    for (const e of incomingTimeline) {
        if (validTimelineSource(e?.source)) {
            acceptedTimeline.push(e);
        } else {
            rejectedTimeline.push(e);
        }
    }

    // 同时清除旧版本已经写入 timeline 的伪来源。
    const existingTimeline = Array.isArray(mem.timeline) ? mem.timeline : [];
    const cleanedExistingTimeline = [];
    const removedExistingTimeline = [];

    for (const e of existingTimeline) {
        if (validTimelineSource(e?.source)) {
            cleanedExistingTimeline.push(e);
        } else {
            removedExistingTimeline.push(e);
        }
    }

    mem.timeline = uniqMerge(
        cleanedExistingTimeline,
        acceptedTimeline,
        x => JSON.stringify([x.date, x.time, x.event, x.source])
    );

    // 被拒绝的 timeline 不直接丢失，写入 quarantined 供人工检查。
    mem.quarantined = Array.isArray(mem.quarantined) ? mem.quarantined : [];

    const timelineRejected = [...removedExistingTimeline, ...rejectedTimeline];

    for (const e of timelineRejected) {
        mem.quarantined = uniqMerge(
            mem.quarantined,
            [{
                content: String(e?.event || ''),
                reason: 'timeline_source_invalid_v0.8.2',
                source: String(e?.source || ''),
                original_date: e?.date || null,
                original_time: e?.time || null
            }],
            x => JSON.stringify([x.content, x.reason, x.source])
        );
    }

    if (timelineRejected.length) {
        mem.audit = Array.isArray(mem.audit) ? mem.audit : [];
        mem.audit.push({
            at: new Date().toISOString(),
            type: 'timeline_source_firewall_v0.8.2',
            removed_existing: removedExistingTimeline.length,
            rejected_incoming: rejectedTimeline.length,
            accepted_incoming: acceptedTimeline.length,
            reason: 'timeline 仅接受可追溯至真实聊天 #编号的 source'
        });
    }
    mem.semantic_anchors = Array.isArray(mem.semantic_anchors)
        ? mem.semantic_anchors
        : [];

    if (Array.isArray(r.semantic_anchors)) {
        mem.semantic_anchors = uniqMerge(
            mem.semantic_anchors,
            r.semantic_anchors,
            x => String(x?.id || JSON.stringify([
                x?.event,
                x?.intent,
                x?.source
            ]))
        );

        mem.audit = Array.isArray(mem.audit) ? mem.audit : [];
        if (r.semantic_anchors.length) {
            mem.audit.push({
                at: new Date().toISOString(),
                type: 'semantic_anchor_v0102',
                added_candidates: r.semantic_anchors.length
            });
        }
    }

    mergeCharacterAnchorsV0110(mem, r.character_anchors);
    mergeActiveArcsV0110(mem, r.active_arcs);

    mem.facts = uniqMerge(mem.facts, r.facts, x => JSON.stringify([x.fact, x.source]));
    mem.events = uniqMerge(mem.events, r.events, x => JSON.stringify([x.date, x.title, x.source]));
    // v0.8.5：relationships 是“当前关系状态”，不是历史流水。
    // 先接收本批候选，随后 normalizeMemoryStateV085() 按人物对只保留最新快照。
    mem.relationships = uniqMerge(
        mem.relationships,
        r.relationships,
        x => JSON.stringify([x.people, x.state, x.change, x.source])
    );
    // v0.8.6：待办使用生命周期合并。
    const loopLifecycleV086 = mergeOpenLoopsV086(mem, r.open_loops);
    mem.locations = uniqMerge(mem.locations, r.locations, x => JSON.stringify([x.name, x.fact]));
    mergeItemsV0110(mem, r.items);
    mem.conflicts = uniqMerge(mem.conflicts, r.conflicts, x => JSON.stringify([x.topic, x.old_value, x.new_value, x.source]));
    mem.quarantined = uniqMerge(mem.quarantined, r.quarantined, x => JSON.stringify([x.content, x.reason, x.source]));

    // v0.8.8：人物资料与当前状态分层处理。
    //
    // characters 只保存人物自身资料和当前状态。
    // relationships / todo / agreements 不再允许混入人物卡。
    if (r.characters && typeof r.characters === 'object' && !Array.isArray(r.characters)) {
        mem.characters =
            mem.characters && typeof mem.characters === 'object'
                ? mem.characters
                : {};

        const stableFieldsV088 = new Set([
            'age',
            'gender',
            'identity',
            'personality'
        ]);

        const transientFieldsV088 = new Set([
            'location',
            'companion',
            'physiology',
            'physiological',
            'outfit',
            'clothing'
        ]);

        const forbiddenFieldsV088 = new Set([
            'relationship',
            'relationships',
            'todo',
            'to_do',
            'agreement',
            'agreements'
        ]);

        for (const [rawName, rawState] of Object.entries(r.characters)) {
            if (
                !rawState ||
                typeof rawState !== 'object' ||
                Array.isArray(rawState)
            ) {
                continue;
            }

            const name = canonicalPersonName(rawName);
            if (!name) continue;

            const oldState =
                mem.characters[name] &&
                typeof mem.characters[name] === 'object'
                    ? mem.characters[name]
                    : {};

            const next = { ...oldState };

            // 稳定资料：仅在有明确非空新值时更新。
            for (const field of stableFieldsV088) {
                const value = rawState[field];

                if (
                    value !== undefined &&
                    value !== null &&
                    String(value).trim() !== ''
                ) {
                    next[field] = value;
                }
            }

            // 当前状态：本轮明确提供时覆盖旧值。
            for (const field of transientFieldsV088) {
                if (
                    !Object.prototype.hasOwnProperty.call(
                        rawState,
                        field
                    )
                ) {
                    continue;
                }

                const value = rawState[field];

                if (
                    value === undefined ||
                    value === null ||
                    String(value).trim() === ''
                ) {
                    delete next[field];
                } else {
                    next[field] = value;
                }
            }

            // 禁止这些生命周期/关系字段继续存在人物卡。
            for (const field of forbiddenFieldsV088) {
                delete next[field];
            }

            mem.characters[name] = next;
        }

        // 清除没有在本轮出现的人物身上的旧污染字段。
        for (const state of Object.values(mem.characters)) {
            if (
                !state ||
                typeof state !== 'object' ||
                Array.isArray(state)
            ) {
                continue;
            }

            for (const field of forbiddenFieldsV088) {
                delete state[field];
            }
        }

        // 统一人物别名。
        normalizeCharactersV085(mem);
    }
    if (r.current_scene && typeof r.current_scene === 'object') {
        // current_scene is a snapshot, not an accumulating history object.
        mem.current_scene = { ...r.current_scene };
    }
    // story_start is a user-controlled hard anchor. Once established it must not drift
    // because of model summaries. Model output may only fill an empty anchor.
    const lockedStart = String(S().storyStart || mem.story_start || '').trim();
    if (lockedStart) {
        mem.story_start = lockedStart;
    } else if (typeof r.story_start === 'string' && r.story_start.trim()) {
        mem.story_start = r.story_start.trim();
    }
    const previousStoryDateV097 = mem.current_story_date || null;
    const previousStoryTimeV097 = mem.current_story_time || null;
    let modelCurrentDate = null;
    if (typeof r.current_story_date === 'string' && r.current_story_date.trim()) {
        const d = normalizeDateInput(r.current_story_date.trim());
        if (d) {
            modelCurrentDate = d.iso;
            mem.current_story_date = d.iso;
        }
    }
    if (typeof r.current_story_time === "string" && r.current_story_time.trim()) { const t=r.current_story_time.trim(), oldClock=parseStoryClock(previousStoryTimeV097), newClock=parseStoryClock(t), advanced=acceptedTimeline.some(e=>{const d=normalizeDateInput(e?.date);return d && previousStoryDateV097 && d.iso>previousStoryDateV097;}); if (!(oldClock!=null && newClock!=null && newClock<oldClock && !advanced)) mem.current_story_time=t; }

    // v0.8.5：每次新增总结后自动维护人物、关系、待办和隔离状态。
    normalizeMemoryStateV085(mem);

    calibrateTimeline(mem, {allowCrossMidnight:true});

    // 关键同步：模型给出的 current_story_date 不能脱离已校准 timeline 单独前进。
    // 以 source 最靠后的 timeline 事件日期作为当前主线绝对日期。
    syncCurrentDateFromTimeline(mem, modelCurrentDate);

    // v0.10.6：
    // 只有 timeline/date 校准完成后，才用 canonical story time
    // 纠正“明确未来却被标成 in_progress”的确定性矛盾。
    guardOpenLoopsTemporalV0105(mem);
    pruneExpiredOpenLoopsV0106(mem);

    mem.last_processed_index = endIndex - 1;
    mem.audit.push({ at: new Date().toISOString(), processed_to: mem.last_processed_index });
    if (mem.audit.length > 50) mem.audit = mem.audit.slice(-50);

    const s = S();
    // v0.6.6: 历史时间线是持久数据，禁止按 maxTimeline 截断。
    // maxTimeline 只用于喂给模型的上下文窗口，不能用于删除已重建历史。
    // 否则达到 50 条后，最早日期（例如剧情起点）会永久消失。
    mem.facts = mem.facts.slice(-Math.max(10, Number(s.maxFacts)||60));
    mem.events = mem.events.slice(-Math.max(10, Number(s.maxEvents)||40));
    mem.open_loops = mem.open_loops
        .filter(x => !loopTerminalStatusV086(x?.status))
        .slice(-Math.max(10, Number(s.maxLoops)||30));
}

const SYSTEM_PROMPT = `你是长线角色扮演的“剧情记忆审计器”。你不是文学总结器，而是事实数据库更新器。

绝对规则：
1. 酒馆消息发送时间/楼层时间戳不是剧情时间，禁止据此推断剧情日期。
2. 时间证据优先级：用户正文明确时间 > 正文明确相对推进（第二天/几小时后/跨午夜） > 可验证事件连续性 > AI正文中的<date>标签。
3. 如果上一场景是夜晚，后文明确“半夜2点/凌晨2点”等，必须考虑跨日。
3A. 月份锁：若已有可靠记忆处于某月，而“新增原始聊天”没有明确出现新的年月日、明确“下个月/数周后/一个月后”等跨月推进证据，禁止自行改变月份。
3B. 单独出现“17日/周五/早晨”等信息时，默认继承当前可靠月份；不得仅凭 AI 的 <date> 标签把 9 月推成 10 月。
3C. AI 的 <date> 只属于低优先级证据；若它造成无正文证据的跨月、倒退或大跨度跳跃，必须忽略该日期，并维持上一可靠时间。
3D. 若新增批次提及过去已经发生的日期，只能作为旧事件/回忆补充写入 timeline，不得把 current_story_time 倒退。当前剧情时间必须沿主线单向推进，除非正文明确进入闪回并明确标记。
4. 不得把尚未在“新增原始聊天”中发生的预测、计划、旧总结预告写成已发生事实。
5. 角色的猜测、医学推断、心理推测等，不可直接升级成事实。
6. conflicts 的定义必须极严格：只有“同一时间点/同一事实维度上，两条已经确定的剧情事实无法同时成立”才写入 conflicts。
   下列情况绝对不算冲突：前后时序中的状态变化、关系发展、情绪变化、地点移动、衣着变化、行为/性爱玩法变化、角色改变主意、计划更新、从A阶段进入B阶段。它们属于 timeline/events/relationships 的剧情演进。
   例如“上午在宿舍→下午去教室”“关系冷淡→后来亲密”“先采用A行为→后来改为B行为”都不是冲突。
   明显错误/超前、尚未由正文确认的候选事实才写入 quarantined。
6A. quarantined 只保存真正需要隔离的可疑事实，不是诊断日志。
6B. “没有冲突”“不构成矛盾”“当前剧情进行中”“无需隔离”等内容禁止写入 quarantined。
6C. 时间/日期漂移如果已经可以直接忽略错误 <date> 并维持可靠日期，不要再写入 quarantined；日期审计由插件专门处理。
6D. 只有可能污染未来记忆的错误事实、超前事实、无法确认但若采信会影响连续性的候选事实，才允许写入 quarantined。
6E. 同一可疑事实不得因措辞不同重复生成多条 quarantined。
7. USER 的元指令（要求 AI 修改/重写/续写/调整回复、OOC 指令、文风/格式/尺度/生成规则、临时写作要求）不是剧情事实：不得写入 timeline/facts/events/characters/relationships/open_loops/locations/items/conflicts/quarantined/semantic_anchors，也不得据此改写 current_story_date/current_story_time/current_scene。若 USER 消息同时含元指令和角色在剧情中的言行，只忽略元指令部分，保留真实剧情内容。
8. “角色在剧情中改变主意/规则/约定”属于剧情事实；“用户要求模型把上一回复改成另一版本”属于元指令。必须区分二者。
9. 只记录对后续连续性有价值的信息。闲聊、重复描写、纯修辞可省略。
9A. 任何被写成“过去已经发生”的具体事实，都必须由本批新增原始聊天的真实 source，或【已有可靠记忆】中的明确事实/semantic_anchors 支持。禁止为了叙事连贯自行补写过去的对话、约定、物品来源、动机、关系历史、接触、主动/被动或同意/拒绝状态。
9B. 当前回复中的无害文学性细节若不影响连续性，可以不记录；不得把没有可靠依据的新装饰性细节升级成 timeline/facts/events/semantic_anchors 中的既定历史。证据不足时保持模糊。
9C. <thinking>/<think>、HTML 草稿注释、故事考据、campus_gossip、小剧场、UpdateVariable、Analysis、JSONPatch、状态占位符、写作规划等辅助/元数据块不是 canonical 剧情正文，即使其中出现人物、地点、日期或行为，也不得进入长期记忆；只有真正正文 <content> 或无标签的剧情正文可作为事实来源。
10. relationships 只记录文本已经支持的关系状态，不擅自把暧昧升级成恋爱/伴侣。
10A. characters 只保存人物自身资料与当前即时状态。
10B. characters 中只允许稳定字段 age/gender/identity/personality，以及当前状态字段 location/companion/physiology/outfit。
10C. 禁止在 characters 中输出 relationship/relationships/todo/to_do/agreement/agreements；人物关系必须写入顶层 relationships，未来事项必须写入 open_loops。
10D. 当前状态必须基于本批新增原始聊天；不要把旧人物卡里的 location/companion/physiology/outfit 原样复制成“当前状态”。
10E. 若本批没有足够证据确认某个瞬时字段，不得猜测。
10F. character_anchors 保存“角色在长篇剧情中不能被压缩掉的行为身份”：核心人格、说话节奏/语言习惯、决策方式、情绪表达、硬边界、关系互动模式、标志性行为、明确禁止漂移的 OOC 模式。
10G. 角色卡/世界书是基础人设的最高优先级；character_anchors 只补充剧情长期验证出的表现，不得改写角色卡。单次场景、单次情绪或单次性行为不能定义整个人格。
10H. 如果已有 character_anchor，除非新增正文出现长期、明确、反复验证的发展证据，否则不要改写其核心人格/语言/决策/边界。
10I. active_arcs 最多保留 3-6 条真正仍在发展的“主线”：外部冲突、长期目标、关系转折、谜团、权力/身份压力或尚未解决的重要后果。吃饭、洗澡、睡觉、上药、通勤、普通课程等日常动作不能单独成为 active_arc。
10J. active_arcs 只描述“正在发展的剧情压力/方向”，不是强制任务。局部场景自然结束后应允许剧情进入下一有意义节点，避免连续多轮用重复日常行为替代主线发展。
10K. items 必须严格区分：owner=真正所有者；holder=当前持有者；user=当前使用者；location=当前位置；source_owner=赠予/转移前所有者。角色拿过、使用过、保管过某物绝不等于 owner 改变。
10L. owner 默认稳定；只有正文明确出现赠予、转让、归还、所有权变化时才允许修改 owner，并在 transfer_evidence 写明证据。地点绝不能写入 owner。
11. open_loops 保存“已经由正文明确成立、但尚未确认结束的连续性事项”，不是普通任务清单，也不是所有叙事悬念。
11A. 允许的 type：
     appointment = 明确约定/会面
     promise = 明确承诺
     deadline = 有明确截止时间或时点的事项
     conditional = 只有条件满足后才进入执行阶段
     unresolved = 已明确成立、仍待解决的连续性问题
11B. 允许的开放状态只有：
     pending / in_progress / at_risk
11C. 允许的终止状态只有：
     completed / cancelled / missed / superseded / invalidated
11D. pending：事项已经成立，但尚未出现明确开始、完成、取消、替代、失效或明确风险证据。
11E. in_progress：新增原始聊天明确显示该事项已经开始执行。
11F. at_risk：正文已经出现具体、可确认的阻碍或无法按原计划完成的风险，但事项尚未终止。不得仅凭“可能赶不上”“时间临近”“角色也许不去”自行预测风险。
11G. completed：新增原始聊天明确确认原事项已经完成。
11H. cancelled：新增原始聊天明确取消原事项。
11I. missed：只有新增正文明确确认“该事项没有发生/明确错过”时才使用。插件会另外清理已经过期的活动事项，因此不得仅凭时钟自行编造 missed 这一剧情结论。
11J. superseded：后续出现了新的明确安排，并且该新安排实际取代旧安排。必须尽量填写 superseded_by 与 close_reason。仅仅发生了其他事情，不等于旧事项被替代。
11K. invalidated：后续已确定事实使旧事项客观上无法继续成立。不能基于猜测判 invalidated。
11L. conditional 类型仍使用 status="pending"；trigger.kind="condition" 保存明确条件。条件未满足时不得强行推进。
11M. 有明确时点的事项使用 trigger.kind="time"；无明确时点不要编造具体时间。
11N. trigger 只记录正文已经明确给出的触发条件或时间，不得推测。
11O. open_loops 不是给主聊天模型的强制任务列表。它们只用于连续性参考，不得为了“完成待办”强行推进剧情。
11P. 更新或关闭旧事项时必须尽量复用旧 id；不要每批随意更换 id。
11Q. 若旧事项被新事项替代，旧事项输出 status="superseded"，并填写 superseded_by；新事项作为独立 open_loop 保留。
11R. 若 due 已经过期且事项没有明确处于正在执行状态，不再作为未来 open_loop 保留；同时不得凭空补写 completed/missed/cancelled/invalidated。重要的实际结果若已发生，应由真实 source 进入 timeline/events 等正常长期记忆。
11S. 禁止输出 waiting_condition；旧数据中的 waiting_condition 由插件兼容迁移为 pending。
12A. 关键事件必须保留事件性质、因果关系、行为发起者和角色当时的明确意愿状态。
12B. 对涉及逃跑、拒绝、反抗、惩罚、胁迫、同意、撤回同意或被控制行动的事件，不得只保存最终结果。
12C. “事件最终发生”不等于“角色自愿”。不得因为角色后来停止反抗、顺从、关系变亲密、继续互动或态度改变，反向改写此前事件的性质。
12D. 若原文存在明确逃跑、拒绝、挣扎、哭喊、抓咬、被追赶、被抓回、被限制行动等事实，必须保留这些能够决定事件性质的证据。
12E. 后续聊天对旧事件的回忆，如果补充了与原事件一致的新细节，应作为历史事件的补充证据，不得另行创造矛盾版本。
12F. 后来的态度变化不得覆盖事件发生当时的意愿状态。
12G. 生理反应、关系亲密程度、后续配合或后续情绪不得被用来反推此前存在同意。
12H. semantic_anchors 专门保存不能因摘要压缩而丢失的连续性事实。仅记录真正影响未来剧情理解的重要事件。
12I. semantic_anchors 中 intent 只能使用：
     "consensual"、"non_consensual"、"ambiguous"、"mixed_or_changed"、"not_applicable"。
12J. 若没有足够文本证据判断意愿，不得猜测，使用 "ambiguous"。
12K. 每个 semantic_anchor 必须尽量包含 source，且 source 必须指向真实聊天楼层。
12. 必须输出 JSON 对象，不要输出 Markdown。`;

function schema() {
    const nullable = (type='string') => ({type:[type,'null']});

    return {
        name: 'StoryMemoryDelta',
        strict: true,
        value: {
            '$schema':'http://json-schema.org/draft-04/schema#',
            type:'object',
            properties:{
                story_start: nullable(),
                current_story_date: nullable(),
                current_story_time: nullable(),
                current_scene:{type:'object',additionalProperties:true},
                timeline:{type:'array',items:{type:'object',properties:{
                    date:nullable(), time:nullable(), event:{type:'string'}, source:nullable()
                },required:['date','time','event','source']}},
                facts:{type:'array',items:{type:'object',properties:{
                    fact:{type:'string'}, source:nullable()
                },required:['fact','source']}},
                events:{type:'array',items:{type:'object',properties:{
                    date:nullable(), title:{type:'string'}, result:{type:'string'}, source:nullable()
                },required:['date','title','result','source']}},
                characters:{type:'object',additionalProperties:true},
                relationships:{type:'array',items:{type:'object',properties:{
                    people:{type:'array',items:{type:'string'}}, state:{type:'string'}, change:{type:'string'}, source:nullable()
                },required:['people','state','change','source']}},
                character_anchors:{type:'array',items:{type:'object',properties:{
                    name:{type:'string'},
                    core_personality:{type:'string'},
                    speech_style:{type:'string'},
                    decision_style:{type:'string'},
                    emotional_style:{type:'string'},
                    hard_boundaries:{type:'string'},
                    relationship_dynamic:{type:'string'},
                    signature_behaviors:{type:'array',items:{type:'string'}},
                    do_not_drift:{type:'array',items:{type:'string'}},
                    source:nullable()
                },required:['name','core_personality','speech_style','decision_style','emotional_style','hard_boundaries','relationship_dynamic','signature_behaviors','do_not_drift','source']}},
                active_arcs:{type:'array',items:{type:'object',properties:{
                    id:{type:'string'}, title:{type:'string'}, summary:{type:'string'}, stakes:{type:'string'}, source:nullable()
                },required:['id','title','summary','stakes','source']}},
                open_loops:{type:'array',items:{type:'object',properties:{
                    id:{type:'string'},
                    type:{
                        type:'string',
                        enum:['appointment','promise','deadline','conditional','unresolved']
                    },
                    description:{type:'string'},
                    status:{
                        type:'string',
                        enum:[
                            'pending','in_progress','at_risk',
                            'completed','cancelled','missed',
                            'superseded','invalidated'
                        ]
                    },
                    due:nullable(),
                    trigger:{
                        type:['object','null'],
                        additionalProperties:true
                    },
                    source:nullable(),
                    superseded_by:nullable(),
                    close_reason:nullable()
                },required:[
                    'id','type','description','status','due',
                    'trigger','source','superseded_by','close_reason'
                ]}},
                locations:{type:'array',items:{type:'object',properties:{
                    name:{type:'string'}, fact:{type:'string'}
                },required:['name','fact']}},
                items:{type:'array',items:{type:'object',properties:{
                    name:{type:'string'}, owner:nullable(), holder:nullable(), user:nullable(),
                    location:nullable(), source_owner:nullable(), status:{type:'string'}, source:nullable(), transfer_evidence:nullable()
                },required:['name','owner','holder','user','location','source_owner','status','source','transfer_evidence']}},
                conflicts:{type:'array',items:{type:'object',properties:{
                    topic:{type:'string'}, old_value:{type:'string'}, new_value:{type:'string'}, source:nullable()
                },required:['topic','old_value','new_value','source']}},
                quarantined:{type:'array',items:{type:'object',properties:{
                    content:{type:'string'}, reason:{type:'string'}, source:nullable()
                },required:['content','reason','source']}},
                semantic_anchors:{type:'array',items:{type:'object',properties:{
                    id:{type:'string'},
                    event:{type:'string'},
                    intent:{
                        type:'string',
                        enum:[
                            'consensual','non_consensual','ambiguous',
                            'mixed_or_changed','not_applicable'
                        ]
                    },
                    causal_chain:{type:'array',items:{type:'string'}},
                    actors:{type:'array',items:{type:'string'}},
                    evidence:{type:'array',items:{type:'string'}},
                    continuity_rule:{type:'string'},
                    source:nullable()
                },required:[
                    'id','event','intent','causal_chain',
                    'actors','evidence','continuity_rule','source'
                ]}}
            },
            required:[
                'story_start',
                'current_story_date',
                'current_story_time',
                'current_scene',
                'timeline',
                'facts',
                'events',
                'characters',
                'relationships',
                'character_anchors',
                'active_arcs',
                'open_loops',
                'locations',
                'items',
                'conflicts',
                'quarantined',
                'semantic_anchors'
            ]
        }
    };
}

function compact(mem) {
    // v0.11.0 trusted-core profile: old low-confidence facts/current-scene notes are
    // deliberately not fed back into the summarizer. This breaks contamination loops.
    return {
        story_start: mem.story_start,
        current_story_date: mem.current_story_date || isoDateFromAny(mem.current_story_time),
        current_story_time: mem.current_story_time,
        current_scene_core: currentSceneCoreV0110(mem.current_scene),
        character_anchors: (mem.character_anchors || []).slice(-20),
        active_arcs: (mem.active_arcs || []).slice(0, 6),
        semantic_anchors: (mem.semantic_anchors || []).slice(-24),
        timeline: (mem.timeline || []).slice(-16),
        characters: stableCharactersForPromptV0110(mem),
        relationships: (mem.relationships || []).slice(-16),
        open_loops: (mem.open_loops || []).slice(-12)
    };
}

const SMM_GENERATE_TIMEOUT_MS = 120000;

function smmTimeoutError(label='模型请求') {
    const e = new Error(`${label}超过120秒仍未返回`);
    e.name = 'StoryMemoryTimeoutError';
    e.isStoryMemoryTimeout = true;
    return e;
}

function withSmmTimeout(promise, ms=SMM_GENERATE_TIMEOUT_MS, label='模型请求') {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(smmTimeoutError(label)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isSmmTimeout(e) {
    return !!(e && (e.isStoryMemoryTimeout || e.name === 'StoryMemoryTimeoutError'));
}

// =========================================================
// v0.9.3 独立总结 Connection Profile
// =========================================================

let SMM_CONNECTION_SERVICE = null;

async function getSmmConnectionServiceV093() {
    if (SMM_CONNECTION_SERVICE) return SMM_CONNECTION_SERVICE;

    const mod = await import('/scripts/extensions/shared.js');

    if (!mod?.ConnectionManagerRequestService) {
        throw new Error('无法加载 ConnectionManagerRequestService');
    }

    SMM_CONNECTION_SERVICE = mod.ConnectionManagerRequestService;
    return SMM_CONNECTION_SERVICE;
}

async function smmGenerateV093({
    prompt='',
    systemPrompt='',
    jsonSchema=null,
    responseLength=null
}={}) {
    const s = S();
    const provider = String(s.summaryProvider || 'current');

    // 默认：完全保持原来的当前聊天模型行为。
    if (provider !== 'profile') {
        return await C().generateRaw({
            prompt,
            systemPrompt,
            jsonSchema,
            responseLength
        });
    }

    const profileId = String(s.summaryProfileId || '').trim();

    if (!profileId) {
        throw new Error('已选择独立总结 Profile，但尚未设置 summaryProfileId');
    }

    try {
        const Service = await getSmmConnectionServiceV093();

        const messages = [
            ...(systemPrompt
                ? [{role:'system', content:String(systemPrompt)}]
                : []),
            {role:'user', content:String(prompt)}
        ];

        const maxTokens = Math.max(
            512,
            Number(responseLength || s.summaryMaxTokens || 4096)
        );

        const response = await Service.sendRequest(
            profileId,
            messages,
            maxTokens,
            {
                extractData:true,
                includePreset:true,
                stream:false
            }
        );

        const text =
            response?.content ??
            response?.text ??
            response?.message ??
            '';

        if (!String(text).trim()) {
            throw new Error('独立总结 Profile 返回为空');
        }

        return String(text);

    } catch (e) {
        const fallback = String(s.summaryFallback || 'stop');

        if (fallback === 'fallback') {
            console.warn(
                '[StoryMemory] profile summary failed; fallback to current model',
                e
            );

            return await C().generateRaw({
                prompt,
                systemPrompt,
                jsonSchema,
                responseLength
            });
        }

        throw new Error(
            '独立总结 Profile 请求失败：' + (e?.message || e)
        );
    }
}

async function summarizeRange(start, end) {
    const c = C();
    const mem = M();
    const prompt = `【已有可靠记忆】
${JSON.stringify(compact(mem), null, 2)}

【新增原始聊天】
${messagesText(start, end)}

请只从“新增原始聊天”更新记忆。旧记忆只用于对照，不允许把旧记忆中尚未发生的未来内容变成事实。

【source 强制规则】
1. timeline 中每一条事件的 source 必须直接引用“新增原始聊天”中的真实 #消息编号。
2. 合法示例：#101、#101-#104、#101,#102,#104。
3. 禁止使用“主线总结（1）”“主线总结（12-16）”“剧情总结”“历史总结”“summary”等摘要名称作为 source。
4. 禁止把【已有可靠记忆】中的总结条目重新包装成新的 timeline 事件。
5. 旧 timeline 只能用于判断连续性、去重和状态演进，不能作为新增事件的事实来源。
6. 如果某条事件无法对应到本批新增原始聊天中的真实 #消息编号，则不要生成该 timeline 条目。
7. source 不得编造消息编号；只能使用输入中实际存在的 #编号。
8. 一个事件跨越多条连续消息时，应使用真实范围，例如 #101-#104；若证据来自不连续消息，则使用 #101,#103,#106。
9. timeline 的 event 必须概括 source 所指向的原始聊天事实，不得把旧总结中的内容移植到当前日期。
10. current_story_date/current_story_time 必须依据新增原始聊天与可靠连续性推进，不得依据旧总结的日期直接推进。
【结构化记忆规范】
- 必须单独输出 current_story_date，格式严格为 YYYY-MM-DD；这是机器计算使用的绝对剧情日期。
- current_story_time 可以保留“秋季学期 周X HH:MM”作为显示时间，但不能代替 current_story_date。
- 时间线必须尽量给出具体 YYYY-MM-DD；“秋季学期/周五/上午”只能作为附加描述，不能替代日期。
- 人物资料分稳定资料与当前状态。地点、衣着、陪伴者、身体状态属于当前状态，后文更新时覆盖，不要不断堆成数组。
- 人物别名必须归一；同一人物不得因中英文名/昵称拆成多个实体。
- 人物关系只有在明确两个人之间存在关系时才记录；多人同场、群体互动不得自动生成多边关系链。
- open_loops / 未完成事项采用严格模式：只有明确未来承诺、预约、任务且尚未发生的事项才保留。
- 新增剧情若完成/取消/错过/替代/确定使旧待办失效，必须复用旧 id 并返回 terminal status：completed/cancelled/missed/superseded/invalidated。
- terminal status 只用于通知插件关闭当前活动事项；插件随后直接从活动事项池删除，并仅保留不注入模型的轻量去重标记。
- 如果只是存在无法完成的风险，使用 at_risk，不得提前判 invalidated。
- 禁止把纯叙事悬念、猜测、可能性写入 open_loops。
- “正在进行”“尚未回答”“等待回应”“关系确认”“已经完成的性行为/课程/会面/讨论”都不能长期留作未来待办。
- timeline 中同一段剧情只能保留一条主事件；如果多条消息只是补充同一事件，请合并为一条并合并 source，不要重复写近义事件。
- source 对应原始聊天顺序，是同一天内剧情先后的最高优先级证据。禁止因为摘要中的 22:00、22:30 等时间文本而把后出现的 source 移到前面。
- 如果 source 顺序与时间文本冲突，保留 source 顺序，并在时间字段中谨慎描述；不要为了“钟点看起来顺”而改剧情先后。
- 日期归属同样服从 source 连续性。禁止仅因为出现“凌晨”“半夜”就自动进入下一天。
- 只有明确绝对日期、明确“次日/第二天/翌日/隔天”，或正文明确描述跨过午夜/零点，才允许日期推进。
- 若较早 source 位于较晚 source 之前，即使较早摘要写“凌晨”、较晚摘要写“晚间22:00”，也不得仅凭钟点把较早 source 推到下一日。
- 若 source 连续顺序出现“晚间/深夜 → 凌晨/半夜”，视为跨过午夜并推进一天；推进后，后续上午/下午/晚间仍保持该新日期，除非再次出现新的明确跨午夜证据。
- 同一 source 序列中只允许在真实的“晚间/深夜 → 凌晨/半夜”边界处推进日期，不能因为“凌晨 → 晚间”再次加一天。
- 若前一事件为深夜/23点后，后续原始消息明确出现“凌晨/半夜/次日/第二天”，必须把日期推进到下一天，不能继续挂在前一天。
- 如果正文是在回忆过去，timeline 可记录过去日期，但 current_story_date 不得倒退。
- time 字段必须“抽取，不猜测”：原始 source 没有明确钟点时，不得自行补 22:00、22:30、19:45 等具体时间；只有原文明确出现的时段词才可写“凌晨/上午/晚间”等。
- AI 的 <date> 是候选日期，不是绝对真相。若 <date> 相比上一可靠日期 +1，但 source 连续剧情没有“第二天/次日/睡醒进入次日/跨过零点/可靠具体钟点跨午夜”等证据，必须维持上一可靠日期，并把该 <date> 视为疑似漂移。

- 如果后文已经完成、取消、错过、替代或使某事项失效，必须用 terminal status 关闭它，不得重复保留。
- 若事项 due 已经明确早于当前 canonical 剧情时间且没有明确正在执行，不要继续输出为 open_loop；不要为了清理事项而编造它最终发生了什么。
- quarantined 不是错误日志。不要输出“无冲突”“不构成矛盾”“当前情节进行中”等说明。
- 普通日期漂移由插件日期轴审计处理，不要重复写入 quarantined。
- 只有真正可能污染长期记忆的未确认/超前/错误事实才进入 quarantined。
- 禁止把新增原始聊天和已有可靠记忆都没有支持的“过去细节”补写成既定事实；无来源的叙事性补全不得进入 timeline/facts/events/relationships/semantic_anchors。
- character_anchors 只保存稳定的人物声音与行为身份；不要用本轮临时情绪覆盖。若旧 anchor 已存在，默认继承。
- active_arcs 只保留 3-6 条真正推动后续故事的宏观主线；已经解决的主线直接移除，不保留“完成历史”。
- 若近期剧情连续多轮停留在重复日常微动作，active_arcs 应指出尚未展开的真实主线压力，但不得虚构新事件。
- items 的 owner/holder/user/location 必须严格分离；没有明确所有权转移证据时 owner 不得改变。
特别检查日期连续性：没有新增原始聊天中的明确跨月证据，就必须继承已有可靠月份；禁止仅凭 AI <date> 或自行推算跨月。`;
    let raw;
    let parsed = null;
    let firstError = null;
    let secondError = null;

    // 第1次：优先使用结构化输出。
    try {
        raw = await withSmmTimeout(
            smmGenerateV093({ systemPrompt:SYSTEM_PROMPT, prompt, jsonSchema:schema() }),
            SMM_GENERATE_TIMEOUT_MS,
            `结构化总结 #${start+1}-#${end}`
        );
        parsed = filterMetaSignals(parseJSON(raw));
    } catch (e) {
        if (isSmmTimeout(e)) throw e;
        firstError = e;
    }

    // 第2次：兼容不支持 structured output 的后端。
    if (!parsed) {
        try {
            raw = await withSmmTimeout(smmGenerateV093({
                systemPrompt:SYSTEM_PROMPT,
                prompt: prompt + '\n\n只返回一个合法 JSON 对象，不要解释、不要 Markdown、不要代码围栏。字段必须包含 story_start,current_story_date,current_story_time,current_scene,timeline,facts,events,characters,relationships,character_anchors,active_arcs,open_loops,locations,items,conflicts,quarantined,semantic_anchors。'
            }), SMM_GENERATE_TIMEOUT_MS, `兼容总结 #${start+1}-#${end}`);
            parsed = filterMetaSignals(parseJSON(raw));
        } catch (e) {
            if (isSmmTimeout(e)) throw e;
            secondError = e;
        }
    }

    // 第3次：只修复“上一份非 JSON 响应”的格式，不重新总结原剧情。
    if (!parsed) {
        const bad = String(raw ?? '').slice(0, 12000);
        const repairPrompt = `下面是一份本应为 JSON 的剧情记忆总结，但格式不合法。
请只做格式修复，不增加新事实，不删除已有事实，不解释。
只返回一个合法 JSON 对象，不要 Markdown、不要代码围栏。

必须保留/补齐这些字段：
story_start,current_story_date,current_story_time,current_scene,timeline,facts,events,characters,relationships,character_anchors,active_arcs,open_loops,locations,items,conflicts,quarantined,semantic_anchors

原始响应：
${bad}`;

        try {
            const repaired = await withSmmTimeout(
                smmGenerateV093({ systemPrompt:SYSTEM_PROMPT, prompt: repairPrompt, jsonSchema:schema() }),
                SMM_GENERATE_TIMEOUT_MS,
                `JSON修复 #${start+1}-#${end}`
            );
            parsed = filterMetaSignals(parseJSON(repaired));
        } catch (e) {
            if (isSmmTimeout(e)) throw e;
            const e1 = firstError?.message || '无';
            const e2 = secondError?.message || '无';
            throw new Error(`连续3次未获得合法 JSON。第一次：${e1}；第二次：${e2}；修复：${e.message || e}`);
        }
    }

    mergeResult(mem, parsed, end);
    await saveMeta();
}

let BUSY = false;
let HISTORY_RUNNING = false;
let HISTORY_STOP_REQUESTED = false;

async function summarizeNew(force=false) {
    if (BUSY) return;
    const c = C(), s = S(), mem = M(), chat = c.chat || [];
    const start = Math.max(0, Number(mem.last_processed_index ?? -1) + 1);
    const pending = chat.length - start;
    if (!force && pending < Math.max(1, Number(s.triggerMessages)||8)) return;
    if (pending <= 0) return toast('当前没有新的消息。');

    BUSY = true;
    try {
        let pos = start;
        const batch = Math.max(4, Number(s.batchMessages)||20);
        while (pos < chat.length) {
            const end = Math.min(chat.length, pos + batch);
            await summarizeRange(pos, end);
            pos = end;
            refresh();
            if (!force) break;
        }
        try {
            await autoHideSummarizedV0101();
        } catch (hideError) {
            console.error('[StoryMemory] auto hide failed', hideError);
            toast('总结已完成，但自动隐藏失败：' + (hideError?.message || hideError), 'warning');
        }

        toast('剧情记忆已更新。','success');
    } catch(e) {
        console.error('[StoryMemory] summarize failed', e);
        toast(`总结失败：${e.message || e}`,'error');
    } finally {
        BUSY = false;
    }
}

async function rebuildAll() {
    if (BUSY) return;
    const c = C();
    if (!(c.chat||[]).length) return toast('当前聊天为空。','warning');
    if (!confirm('重新扫描会重建“本聊天”的插件记忆，但不会删除或修改原聊天。继续吗？')) return;
    c.chatMetadata[META_KEY] = freshMemory();
    await saveMeta();
    await summarizeNew(true);
}

function exportMemory() {
    const blob = new Blob([JSON.stringify(M(), null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `story-memory-${Date.now()}.json`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

function normalizeImported(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('文件不是 JSON 记忆对象');
    // Accept both this plugin's schema and the cleaned v2 file prepared earlier.
    if (obj.schema === 'story_memory_manager_v2') return obj;

    const m = freshMemory();
    m.story_start = obj?.scope?.story_start || obj.story_start || obj?.canonical_anchor?.story_start || null;
    m.current_story_time = obj?.scope?.story_current || obj.current_story_time || obj?.canonical_anchor?.current_story_time || null;
    m.timeline = Array.isArray(obj.timeline) ? obj.timeline : [];
    m.characters = obj.characters && typeof obj.characters === 'object' ? obj.characters : {};
    m.relationships = Array.isArray(obj.relationship_state) ? obj.relationship_state :
                      (Array.isArray(obj.relationships) ? obj.relationships : []);
    m.open_loops = Array.isArray(obj.open_loops) ? obj.open_loops : [];
    m.current_scene = obj.current_scene || obj.current_state || {};
    m.conflicts = Array.isArray(obj.major_conflicts) ? obj.major_conflicts :
                  (Array.isArray(obj.conflicts) ? obj.conflicts : []);
    m.quarantined = Array.isArray(obj.invalid_or_quarantined_memory) ? obj.invalid_or_quarantined_memory : [];
    m.last_processed_index = (C().chat||[]).length - 1; // Imported memory describes current chat endpoint.
    return m;
}

function importMemory() {
    const i = document.createElement('input');
    i.type='file'; i.accept='.json,application/json';
    i.onchange = async () => {
        try {
            const f = i.files?.[0]; if (!f) return;
            const obj = JSON.parse(await f.text());
            C().chatMetadata[META_KEY] = normalizeImported(obj);
            await saveMeta();
            refresh();
            toast('记忆导入成功。','success');
        } catch(e) { toast(`导入失败：${e.message}`,'error'); }
    };
    i.click();
}

async function clearMemory() {
    if (!confirm('只清空插件记忆，不会删除聊天。确定吗？')) return;
    C().chatMetadata[META_KEY] = freshMemory();
    await saveMeta();
    refresh();
    toast('当前聊天的插件记忆已清空。','success');
}

function memoryForPrompt() {
    const m = compact(M());
    return `<STORY_MEMORY>
以下是“当前聊天专属”的剧情状态数据库。它不能覆盖原始聊天中的明确事实。
时间规则：current_story_date（绝对日期）用于机器计算；current_story_time（学期/星期/时分）仅用于显示。用户正文明确时间 > 相对时间推进 > 连续事件 > AI的<date>；禁止使用酒馆楼层发送时间作为剧情时间。
如 conflicts/quarantined 与正文发生冲突，以正文为准。
${JSON.stringify(m, null, 2)}
</STORY_MEMORY>`;
}

/*
 * Prompt injection:
 * SillyTavern's official interceptor API permits modifying the prompt-building chat array.
 * We insert a temporary system record, then remove it immediately after prompt construction
 * (with generation-end cleanup as a second safety net). We never call saveChat().
 */
globalThis.storyMemoryManagerInterceptor = async function(chat, contextSize, abort, type) {
    // v0.6.9 SAFE MODE:
    // Never mutate the chat array from an interceptor.
    // The previous implementation inserted/removed a transient system message with chat.splice().
    // Until the exact SillyTavern interceptor array ownership contract is verified,
    // prompt injection is disabled to protect the original JSONL chat.
    return;
};

function stat() {
    const m=M(), total=(C().chat||[]).length;
    return {
        time:m.current_story_time || '未建立',
        done:Math.max(0,(m.last_processed_index??-1)+1),
        total,
        pending:Math.max(0,total-((m.last_processed_index??-1)+1)),
        events:(m.events||[]).length,
        loops:(m.open_loops||[]).length,
        conflicts:(m.conflicts||[]).length + (m.quarantined||[]).length
    };
}

function panelHTML() {
    return `<div id="${PANEL_ID}" class="smm2-hidden">
      <div class="smm2-card">
        <div class="smm2-head"><div class="smm105-title-wrap"><b>剧情自动记忆</b><span class="smm105-version-badge">v0.10.7</span></div><button id="smm2_close">×</button></div>
        <div id="smm2_stats" class="smm2-stats"></div>
        <div class="smm2-grid">
          <button id="smm2_new">总结新增</button>
          <button id="smm2_rebuild">重扫整条聊天</button>
          <button id="smm2_import">导入记忆 JSON</button>
          <button id="smm2_export">导出记忆 JSON</button>
          <button id="smm2_view">查看记忆</button>
          <button id="smm2_clear">清空本聊天记忆</button>
        </div>
        <hr>
        <label><input id="smm2_enabled" type="checkbox"> 启用插件</label>
        <input id="smm2_inject" type="checkbox" hidden aria-hidden="true">
        <label><input id="smm2_auto" type="checkbox"> 自动增量总结</label>
        <label>每 <input id="smm2_trigger" type="number" min="1" max="50"> 条新消息总结一次</label>
        <label>每批最多 <input id="smm2_batch" type="number" min="4" max="60"> 条消息</label>
        <label>剧情起点（建立记忆后自动锁定）<input id="smm2_start" type="text" placeholder="如 2026-01-01"></label>
        <div class="smm2-note">记忆按“聊天”隔离。同一角色开新聊天，也会得到另一套记忆。酒馆楼层时间不会作为剧情时间。</div>
      </div>
    </div>`;
}





function normalizeDateInput(s) {
    const m = String(s || '').trim().match(/^(\d{4})[-\/年](\d{1,2})[-\/月](\d{1,2})(?:日)?$/);
    if (!m) return null;
    return {
        y: Number(m[1]), m: Number(m[2]), d: Number(m[3]),
        iso: `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`,
        cn: `${m[1]}年${Number(m[2])}月${Number(m[3])}日`
    };
}

function replaceDateFormsInString(text, from, to) {
    if (typeof text !== 'string') return text;
    const forms = [
        [from.iso, to.iso],
        [from.cn, to.cn],
        [`${from.y}/${String(from.m).padStart(2,'0')}/${String(from.d).padStart(2,'0')}`,
         `${to.y}/${String(to.m).padStart(2,'0')}/${String(to.d).padStart(2,'0')}`],
        [`${from.y}/${from.m}/${from.d}`, `${to.y}/${to.m}/${to.d}`]
    ];
    let out = text;
    for (const [a,b] of forms) out = out.split(a).join(b);
    return out;
}

function deepReplaceDate(value, from, to) {
    if (typeof value === 'string') return replaceDateFormsInString(value, from, to);
    if (Array.isArray(value)) return value.map(v => deepReplaceDate(v, from, to));
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k,v] of Object.entries(value)) out[k] = deepReplaceDate(v, from, to);
        return out;
    }
    return value;
}

async function correctMemoryDate() {
    if (HISTORY_RUNNING || BUSY) {
        toast('请先暂停历史重建，等待当前批次结束后再修正时间。', 'warning');
        return;
    }

    const fromEl = document.getElementById('smm2_fix_from');
    const toEl = document.getElementById('smm2_fix_to');
    const from = normalizeDateInput(fromEl?.value);
    const to = normalizeDateInput(toEl?.value);

    if (!from || !to) {
        toast('日期格式请填写为 YYYY-MM-DD，例如 2025-10-17。', 'warning');
        return;
    }
    if (from.iso === to.iso) {
        toast('错误日期和正确日期相同，无需修正。', 'warning');
        return;
    }

    const mem = M();
    const snapshot = JSON.parse(JSON.stringify(mem));
    const corrected = deepReplaceDate(snapshot, from, to);

    // Keep a compact rollback record in audit without duplicating the whole memory.
    corrected.audit = Array.isArray(corrected.audit) ? corrected.audit : [];
    corrected.audit.push({
        at: new Date().toISOString(),
        type: 'manual_date_correction',
        from: from.iso,
        to: to.iso,
        processed_to: Number(mem.last_processed_index ?? -1)
    });
    if (corrected.audit.length > 50) corrected.audit = corrected.audit.slice(-50);

    C().chatMetadata[META_KEY] = corrected;
    await saveMeta();
    refresh();
    refreshNative();

    const box = document.getElementById('smm2_native_memory_box');
    if (box?.dataset.open === '1') {
        box.innerHTML = memoryReadableHTML();
        if (M().schema===SMM4_SCHEMA) bindHistoryBrowserV4(); else bindHistoryBrowserLegacy();
    }

    toast(`时间修正完成：${from.iso} → ${to.iso}。聊天原文未修改。`, 'success');
}


function parseClockMinutes(s) {
    const text = String(s || '');
    const m = text.match(/(\d{1,2})[:：](\d{2})/);
    if (!m) {
        if (/凌晨/.test(text)) return 120;
        if (/早晨|清晨/.test(text)) return 420;
        if (/上午/.test(text)) return 540;
        if (/中午/.test(text)) return 720;
        if (/下午/.test(text)) return 900;
        if (/傍晚/.test(text)) return 1080;
        if (/晚上|夜间|夜晚/.test(text)) return 1260;
        if (/深夜/.test(text)) return 1380;
        return 720;
    }
    let h = Number(m[1]);
    const min = Number(m[2]);
    if (/下午|傍晚|晚上|夜间|夜晚|深夜/.test(text) && h < 12) h += 12;
    if (/凌晨/.test(text) && h === 12) h = 0;
    return h * 60 + min;
}

function storyDateParts(item) {
    const text = [item?.date, item?.time, item?.event, item?.title, item?.result]
        .filter(Boolean).join(' ');
    let m = text.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/);
    if (!m) m = text.match(/(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (!m) return null;
    return {
        y: Number(m[1]),
        m: Number(m[2]),
        d: Number(m[3]),
        label: `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`,
        key: `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`,
        minutes: parseClockMinutes(text)
    };
}

function chronologicalCopy(items) {
    return (Array.isArray(items) ? items : [])
        .map((item, index) => {
            const p = storyDateParts(item);
            const sortKey = p
                ? Date.UTC(p.y, p.m - 1, p.d, Math.floor(p.minutes/60), p.minutes%60)
                : Number.MAX_SAFE_INTEGER;
            return { item, index, known: !!p, sortKey };
        })
        .sort((a,b) => {
            if (a.known && b.known) return a.sortKey - b.sortKey || a.index - b.index;
            if (a.known !== b.known) return a.known ? -1 : 1;
            return a.index - b.index;
        })
        .map(x => x.item);
}

function groupTimelineByDay(items) {
    const sorted = chronologicalCopy(items);
    const groups = [];
    const byKey = new Map();

    for (const item of sorted) {
        const p = storyDateParts(item);
        const key = p?.key || '__unknown__';
        if (!byKey.has(key)) {
            const g = {
                key,
                label: p?.label || '日期未确定',
                items: []
            };
            byKey.set(key, g);
            groups.push(g);
        }
        byKey.get(key).items.push(item);
    }
    return groups;
}

function dailyTimelineHTML(items) {
    const groups = groupTimelineByDay(items);
    if (!groups.length) return '<div class="smm2-empty">暂无时间线</div>';

    return groups.slice(-30).map(g => {
        const rows = g.items.map(x => {
            const t = esc(x.time || '');
            const e = esc(x.event || '');
            return `<div class="smm2-day-row">${t ? `<b>${t}</b>　` : ''}${e}</div>`;
        }).join('');

        return `
          <details open class="smm2-day-card">
            <summary>${esc(g.label)} <span class="smm2-day-count">${g.items.length} 条</span></summary>
            <div class="smm2-day-body">${rows}</div>
          </details>
        `;
    }).join('');
}

function countStoredTimeBacktracks(items) {
    let last = null, count = 0;
    for (const item of (items || [])) {
        const p = storyDateParts(item);
        if (!p) continue;
        const k = Date.UTC(p.y, p.m - 1, p.d, Math.floor(p.minutes/60), p.minutes%60);
        if (last !== null && k < last) count++;
        last = k;
    }
    return count;
}


function isoDateFromAny(value) {
    const p = storyDateParts({date:String(value || '')});
    return p?.key || null;
}

function dateRangeAudit() {
    const m = M();
    const start = isoDateFromAny(S().storyStart || m.story_start);
    const end = m.current_story_date || isoDateFromAny(m.current_story_time);
    if (!start || !end) return {start, end, days:[], missing:[]};

    const a = new Date(`${start}T00:00:00Z`);
    const b = new Date(`${end}T00:00:00Z`);
    if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime()) || b < a) {
        return {start, end, days:[], missing:[]};
    }

    const present = new Set((m.timeline || []).map(x => storyDateParts(x)?.key).filter(Boolean));
    const days = [];
    for (let d = new Date(a); d <= b && days.length < 3700; d.setUTCDate(d.getUTCDate()+1)) {
        const key = d.toISOString().slice(0,10);
        days.push({key, present:present.has(key)});
    }
    return {start, end, days, missing:days.filter(x=>!x.present)};
}

function canonicalPersonName(name) {
    // Public build: do not hard-code aliases from any specific story.
    // The summarizer is instructed to use one canonical name consistently.
    const raw = String(name || '').trim();
    return raw || '未命名人物';
}

function mergedCharactersView() {
    const groups = new Map();
    for (const [name, data] of Object.entries(M().characters || {})) {
        const canon = canonicalPersonName(name);
        if (!groups.has(canon)) groups.set(canon, {name:canon, aliases:new Set(), states:[]});
        const g = groups.get(canon);
        if (name !== canon) g.aliases.add(name);
        g.states.push(data);
    }
    return [...groups.values()];
}

function relationKey(x) {
    const people = (x?.people || x?.pair || []).map(canonicalPersonName).filter(Boolean);
    return [...new Set(people)].sort((a,b)=>a.localeCompare(b,'zh-CN')).join(' ↔ ');
}

function mergedRelationshipsView() {
    const map = new Map();
    for (const x of (M().relationships || [])) {
        const key = relationKey(x) || '关系对象未确定';
        if (!map.has(key)) map.set(key, {key, history:[]});
        map.get(key).history.push(x);
    }
    return [...map.values()];
}

function classifyOpenLoop(x) {
    const status = String(x?.status || '').trim().toLowerCase();

    if (status === 'in_progress') {
        return 'active';
    }

    if (
        (status === 'pending' || status === 'at_risk' || !status) &&
        loopIsClearlyPastV0105(M(), x)
    ) {
        return 'overdue';
    }

    const text = `${x?.description || ''} ${x?.due || ''} ${status}`;

    if (
        /明天|明日|后天|约定|预约|会面|课程|上课|计划|等待.*时间/i.test(text) ||
        loopDuePartsV0104(x)?.date
    ) {
        return 'future';
    }

    return 'unresolved';
}

function cleanLoopTitle(x) {
    let s = String(x?.id || '').trim();
    if (/^loop_/i.test(s)) s = '';
    return s || String(x?.description || '未命名事项').replace(/[，。；：:].*$/,'').slice(0,26) || '未命名事项';
}

function mergedOpenLoopsView() {
    const map = new Map();
    for (const x of (M().open_loops || [])) {
        const desc = String(x?.description || '').trim();
        const key = desc.toLowerCase().replace(/\s+/g,'').slice(0,80) || String(x?.id || '');
        if (!map.has(key)) map.set(key, x);
        else map.set(key, {...map.get(key), ...x});
    }
    const groups = {future:[], active:[], unresolved:[], overdue:[]};
    for (const x of map.values()) groups[classifyOpenLoop(x)].push(x);
    return groups;
}

function historyBrowserHTML() {
    return `
      <details class="smm2-memory-details smm2-history-browser">
        <summary>历史记忆浏览器</summary>
        <div class="smm2-history-tools">
          <input id="smm2_history_search" type="search" placeholder="搜索日期、人物、事件、关键词">
          <select id="smm2_history_type">
            <option value="all">全部类型</option>
            <option value="timeline">时间线</option>
            <option value="character">人物</option>
            <option value="relationship">人物关系</option>
          </select>
        </div>
        <div id="smm2_history_results"></div>
      </details>`;
}

function historyRecords() {
    const m=M(), out=[];
    for (const x of chronologicalCopy(m.timeline||[])) {
        const p=storyDateParts(x);
        out.push({type:'timeline', label:`${p?.label || x.date || '日期未定'} ${x.time || ''}`, text:x.event || '', raw:x});
    }
    for (const g of mergedCharactersView()) {
        out.push({type:'character', label:g.name, text:JSON.stringify(g.states), raw:g});
    }
    for (const g of mergedRelationshipsView()) {
        out.push({type:'relationship', label:g.key, text:JSON.stringify(g.history), raw:g});
    }
    return out;
}

function refreshHistoryBrowser() {
    const host=document.getElementById('smm2_history_results');
    if (!host) return;
    const q=String(document.getElementById('smm2_history_search')?.value || '').trim().toLowerCase();
    const type=document.getElementById('smm2_history_type')?.value || 'all';
    const rows=historyRecords().filter(r =>
        (type==='all' || r.type===type) &&
        (!q || `${r.label} ${r.text}`.toLowerCase().includes(q))
    );
    host.innerHTML = rows.length ? rows.slice(-500).map(r =>
        `<div class="smm2-history-row"><b>${esc(r.label)}</b><br>${esc(r.text)}</div>`
    ).join('') : '<div class="smm2-empty">没有匹配的历史记忆</div>';
}

function bindHistoryBrowser() {
    const s=document.getElementById('smm2_history_search');
    const t=document.getElementById('smm2_history_type');
    if (s) s.oninput=refreshHistoryBrowser;
    if (t) t.onchange=refreshHistoryBrowser;
    refreshHistoryBrowser();
}


const SMM4_SCHEMA = 'story_memory_manager_v4';

function stableId(prefix, text) {
    let h = 2166136261;
    const s = String(text || '');
    for (let i=0;i<s.length;i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return `${prefix}_${(h>>>0).toString(36)}`;
}

function personAliasKey(name) {
    return String(name || '')
        .trim()
        .toLowerCase()
        .replace(/[·•.\s_'’\-]/g,'');
}

function aliasDictionary() {
    // Legacy v4 read compatibility only. Story-specific aliases were removed
    // from the public release.
    return new Map();
}

function canonicalPersonV4(name) {
    const raw = String(name || '').trim();
    if (!raw) return null;
    const key = personAliasKey(raw);
    return aliasDictionary().get(key) || raw;
}

function emptyV4MemoryFromLegacy(mem) {
    return {
        schema: SMM4_SCHEMA,
        version: 4,
        story_start: mem.story_start || S().storyStart || null,
        current_story_date: mem.current_story_date || isoDateFromAny(mem.current_story_time) || null,
        current_story_time: mem.current_story_time || null,
        current_scene: mem.current_scene || {},
        last_processed_index: Number(mem.last_processed_index ?? -1),

        days: {},
        characters_v4: {},
        relationships_v4: {},
        tasks_v4: [],
        unresolved_v4: [],
        quarantined: Array.isArray(mem.quarantined) ? mem.quarantined : [],
        conflicts: Array.isArray(mem.conflicts) ? mem.conflicts : [],
        audit: Array.isArray(mem.audit) ? mem.audit : []
    };
}

function mergeScalarState(target, source) {
    if (!source || typeof source !== 'object') return target;
    for (const [k,v] of Object.entries(source)) {
        if (v === undefined || v === null || v === '' || k === 'name') continue;
        if (k === 'relationship' || k === 'relationships') continue;
        if (k === 'to_do') continue;
        target[k] = v;
    }
    return target;
}

function addCharacterStateV4(v4, sourceName, sourceData) {
    const canon = canonicalPersonV4(sourceName || sourceData?.name);
    if (!canon) return;
    const id = stableId('char', canon);
    if (!v4.characters_v4[id]) {
        v4.characters_v4[id] = {
            id,
            name: canon,
            aliases: [],
            profile: {},
            current_state: {},
            history: []
        };
    }
    const c = v4.characters_v4[id];
    const alias = String(sourceName || '').trim();
    if (alias && alias !== canon && !c.aliases.includes(alias)) c.aliases.push(alias);

    const arr = Array.isArray(sourceData) ? sourceData : [sourceData];
    for (const st of arr) {
        if (!st || typeof st !== 'object') continue;
        const stableFields = ['age','gender','identity','personality'];
        for (const f of stableFields) {
            if (st[f] !== undefined && st[f] !== null && st[f] !== '') c.profile[f] = st[f];
        }

        const transient = {};
        for (const f of ['location','companion','physiological','clothing','agreement']) {
            if (st[f] !== undefined && st[f] !== null && st[f] !== '') transient[f] = st[f];
        }
        mergeScalarState(c.current_state, transient);

        if (Object.keys(transient).length) {
            c.history.push({
                at: M().current_story_time || null,
                state: transient
            });
        }
        if (c.history.length > 100) c.history = c.history.slice(-100);
    }
}

function normalizeRelationshipPeople(raw) {
    let people = [];
    if (Array.isArray(raw?.people)) people = raw.people;
    else if (Array.isArray(raw?.pair)) people = raw.pair;
    else if (typeof raw?.people === 'string') people = raw.people.split(/[↔、,，/&]+/);
    return [...new Set(people.map(canonicalPersonV4).filter(Boolean))];
}

function addRelationshipV4(v4, raw) {
    const people = normalizeRelationshipPeople(raw);
    // Critical rule: only explicit two-person relationships are stored here.
    if (people.length !== 2) {
        if (people.length > 2) {
            v4.quarantined.push({
                type:'relationship_group_ignored',
                reason:'多人同场/群体文本不能自动转为双人关系',
                raw
            });
        }
        return;
    }
    const [a,b] = [...people].sort((x,y)=>x.localeCompare(y,'zh-CN'));
    const key = `${a} ↔ ${b}`;
    const id = stableId('rel', key);
    if (!v4.relationships_v4[id]) {
        v4.relationships_v4[id] = {
            id, people:[a,b], current:null, history:[]
        };
    }
    const r = v4.relationships_v4[id];
    const state = String(raw?.state || '').trim() || null;
    const change = String(raw?.change || '').trim() || null;
    if (state) r.current = state;
    if (state || change) {
        r.history.push({
            at: raw?.date || raw?.time || M().current_story_time || null,
            state, change
        });
    }
    if (r.history.length > 100) r.history = r.history.slice(-100);
}

function addTimelineV4(v4, raw) {
    const p = storyDateParts(raw);
    if (!p) {
        v4.quarantined.push({type:'timeline_without_date', raw});
        return;
    }
    if (!v4.days[p.key]) {
        v4.days[p.key] = {date:p.key, events:[]};
    }
    const signature = `${raw?.time||''}|${raw?.event||''}`.trim();
    if (!v4.days[p.key].events.some(e => `${e.time||''}|${e.event||''}` === signature)) {
        v4.days[p.key].events.push({
            time: raw?.time || '',
            event: raw?.event || '',
            source: raw?.source || null
        });
    }
    v4.days[p.key].events.sort((x,y)=>parseClockMinutes(x.time)-parseClockMinutes(y.time));
}

function explicitFutureTask(raw, currentIso) {
    const desc = String(raw?.description || '').trim();
    const dueText = String(raw?.due || '').trim();
    const due = isoDateFromAny(dueText);
    const futureWords = /明天|明日|后天|下周|约定|预约|会面|面试|课程|上课|截止|需前往|等待.*到来/i.test(`${dueText} ${desc}`);
    const completionWords = /已完成|完成|已经发生|已结束|已赴约|已上课|已会面|已解决/i.test(desc);

    if (completionWords) return false;
    if (due && currentIso && due < currentIso) return false;
    return !!(futureWords || (due && (!currentIso || due >= currentIso)));
}

function migrateLegacyToV4({force=false}={}) {
    const mem = M();
    if (mem.schema === SMM4_SCHEMA && !force) return mem;

    const v4 = emptyV4MemoryFromLegacy(mem);

    for (const x of (mem.timeline || [])) addTimelineV4(v4, x);

    for (const [name,data] of Object.entries(mem.characters || {})) {
        addCharacterStateV4(v4, name, data);
    }

    for (const rel of (mem.relationships || [])) addRelationshipV4(v4, rel);

    const currentIso = isoDateFromAny(mem.current_story_time);
    for (const loop of (mem.open_loops || [])) {
        // Strict migration: retain only explicit future tasks.
        if (explicitFutureTask(loop, currentIso)) {
            const sig = `${loop?.due||''}|${loop?.description||''}`.toLowerCase().replace(/\s+/g,'');
            if (!v4.tasks_v4.some(t => t.signature === sig)) {
                v4.tasks_v4.push({
                    id: stableId('task', sig),
                    title: cleanLoopTitle(loop),
                    due: loop?.due || null,
                    description: loop?.description || '',
                    status: 'pending',
                    signature: sig,
                    source: loop?.source || null
                });
            }
        }
    }

    v4.audit.push({
        at:new Date().toISOString(),
        type:'migration_to_v4',
        note:'legacy memory normalized into date/person/relationship/task structure'
    });
    if (v4.audit.length > 100) v4.audit = v4.audit.slice(-100);

    C().chatMetadata[META_KEY] = v4;
    return v4;
}

async function migrateToV4Now() {
    if (HISTORY_RUNNING || BUSY) {
        toast('请先暂停历史重建，等待当前请求结束后再进行数据重构。','warning');
        return;
    }
    const before = JSON.parse(JSON.stringify(M()));
    // Backup in metadata; compact but complete for rollback.
    C().chatMetadata[`${META_KEY}_legacy_backup`] = before;
    migrateLegacyToV4({force:true});
    await saveMeta();
    refresh();
    refreshNative();

    const box=document.getElementById('smm2_native_memory_box');
    if (box?.dataset.open==='1') {
        box.innerHTML=memoryReadableHTML();
        if (M().schema===SMM4_SCHEMA) bindHistoryBrowserV4(); else bindHistoryBrowserLegacy();
    }
    toast('v4 数据重构完成。旧记忆已备份，可继续检查后再重建。','success');
}


function extractDateTagFromMessage(text) {
    const s = String(text || '');

    // 支持：
    // <date>2025年9月13日</date>
    // <date>2025年9月13日 清晨</date>
    // <date>2025年9月13日 周日 上午</date>
    let m = s.match(
        /<date>\s*(20\d{2})年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s+[^<]*)?\s*<\/date>/i
    );

    // 同时兼容 2025-09-13 / 2025/09/13，并允许后附时段文字。
    if (!m) {
        m = s.match(
            /<date>\s*(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})(?:\s+[^<]*)?\s*<\/date>/i
        );
    }

    if (!m) return null;

    return `${m[1]}-${String(Number(m[2])).padStart(2,'0')}-${String(Number(m[3])).padStart(2,'0')}`;
}

function detectCurrentDateFromRecentChat() {
    const chat = C().chat || [];
    for (let i=chat.length-1; i>=0; i--) {
        const d = extractDateTagFromMessage(cleanMes(chat[i]));
        if (d) return {date:d, source:`#${i} <date>`};
    }
    return null;
}

function effectiveCurrentDate(mem=M()) {
    return mem.current_story_date ||
           detectCurrentDateFromRecentChat()?.date ||
           isoDateFromAny(mem.current_story_time) ||
           null;
}

function combinedStoryTime(mem=M()) {
    const d = effectiveCurrentDate(mem);
    const t = String(mem.current_story_time || '').trim();
    return d ? `${d}${t ? '｜'+t : ''}` : (t || '未建立');
}

function cleanLegacyTasksForThisChat(mem=M()) {
    if (mem.schema !== SMM4_SCHEMA) return {kept:0, archived:0};

    const current = effectiveCurrentDate(mem);
    const kept = [];
    let archived = 0;

    for (const t of (mem.tasks_v4 || [])) {
        const due = isoDateFromAny(t?.due);
        const status = String(t?.status || '').toLowerCase();
        const terminal = /^(completed|done|resolved|closed|cancelled|canceled|missed|superseded|replaced|invalidated)$/.test(status);
        const clearlyPast = !!(due && current && due < current);

        if (terminal || clearlyPast) archived++;
        else kept.push(t);
    }

    mem.tasks_v4 = kept;
    return {kept: kept.length, archived};
}

function v4DaysSorted(mem=M()) {
    return Object.values(mem.days || {}).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
}

function v4TimelineHTML(mem=M()) {
    const days=v4DaysSorted(mem);
    if (!days.length) return '<div class="smm2-empty">暂无标准化时间线</div>';
    return days.slice(-60).map(day=>`
      <details class="smm2-day-card">
        <summary>${esc(day.date)} <span class="smm2-day-count">${day.events.length} 条</span></summary>
        <div class="smm2-day-body">
          ${day.events.map(e=>`<div class="smm2-day-row">${e.time?`<b>${esc(e.time)}</b>　`:''}${esc(e.event||'')}</div>`).join('')}
        </div>
      </details>`).join('');
}

function v4CharactersHTML(mem=M()) {
    const chars=Object.values(mem.characters_v4 || {}).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
    if (!chars.length) return '<div class="smm2-empty">暂无人物档案</div>';
    return chars.map(c=>`
      <details class="smm2-memory-details smm2-person-card">
        <summary>${esc(c.name)}</summary>
        ${c.aliases?.length?`<div class="smm2-alias">别名：${esc(c.aliases.join(' / '))}</div>`:''}
        <div class="smm2-v4-section"><b>稳定资料</b><pre>${esc(JSON.stringify(c.profile||{},null,2))}</pre></div>
        <div class="smm2-v4-section"><b>当前状态</b><pre>${esc(JSON.stringify(c.current_state||{},null,2))}</pre></div>
        ${c.history?.length?`<details><summary>状态历史 ${c.history.length} 条</summary><pre>${esc(JSON.stringify(c.history.slice(-30),null,2))}</pre></details>`:''}
      </details>`).join('');
}

function v4RelationshipsHTML(mem=M()) {
    const rels=Object.values(mem.relationships_v4 || {});
    if (!rels.length) return '<div class="smm2-empty">暂无明确双人关系</div>';
    return rels.sort((a,b)=>a.people.join('').localeCompare(b.people.join(''),'zh-CN')).map(r=>`
      <details class="smm2-memory-details smm2-relation-card">
        <summary>${esc(r.people.join(' ↔ '))}</summary>
        <div><b>当前：</b>${esc(r.current || '未确定')}</div>
        ${r.history?.length?`<details><summary>关系发展 ${r.history.length} 条</summary>
          ${r.history.map(h=>`<div class="smm2-relation-history">${h.at?esc(h.at)+'｜':''}${esc(h.state||'')}${h.change?'｜'+esc(h.change):''}</div>`).join('')}
        </details>`:''}
      </details>`).join('');
}

function v4TasksHTML(mem=M()) {
    const tasks=(mem.tasks_v4 || []).filter(t=>t.status==='pending');
    if (!tasks.length) return '<div class="smm2-empty">当前没有明确待办事项</div>';
    return tasks.map(t=>`
      <div class="smm2-memory-item">
        <b>${esc(t.title || '待办')}</b>${t.due?`｜${esc(t.due)}`:''}<br>
        ${esc(t.description||'')}
      </div>`).join('');
}

function v4DateAudit(mem=M()) {
    const start=isoDateFromAny(mem.story_start || S().storyStart);
    const current=effectiveCurrentDate(mem);
    if (!start || !current) return {ok:false, message:'当前剧情时间尚未标准化为具体日期，暂不能检查缺失日期。'};
    const present=new Set(Object.keys(mem.days||{}));
    const a=new Date(`${start}T00:00:00Z`), b=new Date(`${current}T00:00:00Z`);
    if (b<a) return {ok:false,message:'当前剧情时间早于剧情起点，需要人工检查。'};
    const missing=[], all=[];
    for(let d=new Date(a);d<=b && all.length<3700;d.setUTCDate(d.getUTCDate()+1)){
        const k=d.toISOString().slice(0,10);
        all.push(k);
        if(!present.has(k)) missing.push(k);
    }
    return {ok:true,start,current,all,missing};
}

function historyRecordsV4() {
    const m=M(), out=[];
    for(const day of v4DaysSorted(m)){
        for(const e of day.events||[]) out.push({type:'timeline',label:`${day.date} ${e.time||''}`,text:e.event||''});
    }
    for(const c of Object.values(m.characters_v4||{})){
        out.push({type:'character',label:c.name,text:JSON.stringify({profile:c.profile,current_state:c.current_state})});
    }
    for(const r of Object.values(m.relationships_v4||{})){
        out.push({type:'relationship',label:r.people.join(' ↔ '),text:JSON.stringify({current:r.current,history:r.history})});
    }
    for(const t of (m.tasks_v4||[])){
        out.push({type:'task',label:t.title||'待办',text:`${t.due||''} ${t.description||''}`});
    }
    return out;
}

function bindHistoryBrowserV4() {
    const s=document.getElementById('smm4_history_search');
    const t=document.getElementById('smm4_history_type');
    const host=document.getElementById('smm4_history_results');
    const render=()=>{
        if(!host) return;
        const q=String(s?.value||'').trim().toLowerCase();
        const ty=t?.value||'all';
        const rows=historyRecordsV4().filter(r=>(ty==='all'||r.type===ty)&&(!q||`${r.label} ${r.text}`.toLowerCase().includes(q)));
        host.innerHTML=rows.length?rows.slice(-600).map(r=>`<div class="smm2-history-row"><b>${esc(r.label)}</b><br>${esc(r.text)}</div>`).join(''):'<div class="smm2-empty">没有匹配的历史记忆</div>';
    };
    if(s) s.oninput=render;
    if(t) t.onchange=render;
    render();
}

function legacyDaysGrouped(mem=M()) {
    // 查看模式不得修改真实记忆。过去这里直接 calibrateTimeline(mem)
    // 会在“仅仅打开时间线”时重新写入日期/合并事件。
    const view = JSON.parse(JSON.stringify(mem || {}));
    calibrateTimeline(view, {allowCrossMidnight:false});
    const groups = new Map();
    for (const e of (view.timeline || [])) {
        const d = isoDateFromAny(e.date) || isoDateFromAny(`${e.date||''} ${e.time||''}`) || '日期未定';
        if (!groups.has(d)) groups.set(d, []);
        groups.get(d).push(e);
    }
    const keys=[...groups.keys()].sort((a,b)=>{
        if(a==='日期未定') return 1;
        if(b==='日期未定') return -1;
        return a.localeCompare(b);
    });
    return keys.map(date=>{
        const events=groups.get(date).sort((a,b)=>{
            const sa=sourceFirst(a.source), sb=sourceFirst(b.source);
            const aHasSource=sa!==Number.MAX_SAFE_INTEGER, bHasSource=sb!==Number.MAX_SAFE_INTEGER;
            if(aHasSource && bHasSource && sa!==sb) return sa-sb;
            if(aHasSource && !bHasSource) return -1;
            if(!aHasSource && bHasSource) return 1;

            const ca=verifiedStoryClock(a), cb=verifiedStoryClock(b);
            if(ca!=null && cb!=null && ca!==cb) return ca-cb;
            if(ca!=null && cb==null) return -1;
            if(ca==null && cb!=null) return 1;
            return 0;
        });
        return {date,events};
    });
}

function legacyHistoryRecords() {
    const m=M(), out=[];
    for(const day of legacyDaysGrouped(m)){
        for(const e of day.events||[]) out.push({
            type:'timeline',
            label:`${day.date} ${e.time||''}`.trim(),
            text:e.event||''
        });
    }
    for(const [name,c] of Object.entries(m.characters||{})){
        out.push({type:'character',label:name,text:JSON.stringify(c||{})});
    }
    for(const r of (m.relationships||[])){
        const people=Array.isArray(r.people)?r.people.join(' ↔ '):'人物关系';
        out.push({type:'relationship',label:people,text:`${r.state||''} ${r.change||''}`.trim()});
    }
    for(const t of (m.open_loops||[])){
        out.push({type:'task',label:t.description||t.id||'待办',text:`${t.due||''} ${t.status||''}`.trim()});
    }
    for(const q of (m.quarantined||[])){
        out.push({type:'quarantine',label:'隔离项',text:`${q.content||''} ${q.reason||''}`.trim()});
    }
    return out;
}

function bindHistoryBrowserLegacy() {
    const s=document.getElementById('smm52_history_search');
    const t=document.getElementById('smm52_history_type');
    const host=document.getElementById('smm52_history_results');
    const render=()=>{
        if(!host) return;
        const q=String(s?.value||'').trim().toLowerCase();
        const ty=t?.value||'all';
        const rows=legacyHistoryRecords().filter(r=>(ty==='all'||r.type===ty)&&(!q||`${r.label} ${r.text}`.toLowerCase().includes(q)));
        host.innerHTML=rows.length
          ? rows.slice(-800).map(r=>`<div class="smm2-history-row"><b>${esc(r.label)}</b><br>${esc(r.text)}</div>`).join('')
          : '<div class="smm2-empty">当前已重建部分没有匹配的记忆</div>';
    };
    if(s) s.oninput=render;
    if(t) t.onchange=render;
    render();
}

function legacyTimelineHTML(mem=M()) {
    const days=legacyDaysGrouped(mem);
    if(!days.length) return '<div class="smm2-empty">当前安全重建尚未生成时间线。</div>';
    return days.map(day=>`
      <details class="smm2-day">
        <summary>${esc(day.date)} <span class="smm2-count">${day.events.length} 条</span></summary>
        <div class="smm2-day-body">
          ${day.events.map(e=>`
            <div class="smm2-event">
              <b>
                ${esc(e.time||'时间未定')}
                ${e.time_evidence_label
                    ? `<small class="smm-time-badge smm-time-${esc(e.time_evidence||'unverified')}" title="${esc(e.time_evidence_reason||'')}">${esc(e.time_evidence_label)}</small>`
                    : ''}
              </b>
              <span>${esc(e.event||'')}</span>
              ${e.source?`<small>${esc(e.source)}</small>`:''}
            </div>`).join('')}
        </div>
      </details>`).join('');
}

function legacyCharactersHTML(mem=M()) {
    const rows=Object.entries(mem.characters||{});
    if(!rows.length) return '<div class="smm2-empty">当前已重建部分尚未识别人物资料。</div>';
    return rows.sort((a,b)=>a[0].localeCompare(b[0])).map(([name,data])=>`
      <details class="smm2-person">
        <summary>${esc(name)}</summary>
        <pre>${esc(JSON.stringify(data||{},null,2))}</pre>
      </details>`).join('');
}

function legacyRelationshipsHTML(mem=M()) {
    const rows=(mem.relationships||[]);
    if(!rows.length) return '<div class="smm2-empty">当前已重建部分尚未识别人物关系。</div>';
    return rows.map(r=>{
        const people=Array.isArray(r.people)?r.people.join(' ↔ '):'人物关系';
        return `<details class="smm2-person">
          <summary>${esc(people)}</summary>
          <div class="smm52-rel"><b>状态：</b>${esc(r.state||'')}<br><b>变化：</b>${esc(r.change||'')}${r.source?`<br><small>${esc(r.source)}</small>`:''}</div>
        </details>`;
    }).join('');
}

function legacyTasksHTML(mem=M()) {
    const rows = Array.isArray(mem.open_loops)
        ? mem.open_loops
        : [];

    if (!rows.length) {
        return '<div class="smm2-empty">当前没有明确未完成事项。</div>';
    }

    return rows.map(t => {
        const rawStatus = String(t?.status || 'pending');
        const overdue =
            (rawStatus === 'pending' || rawStatus === 'at_risk') &&
            loopIsClearlyPastV0105(mem, t);

        const statusText = overdue
            ? `${rawStatus} · 已过期，待剧情确认`
            : rawStatus;

        return `
          <div class="smm52-task">
            <b>${esc(t.description||t.id||'待办')}</b>
            ${t.due?`<div>时间：${esc(t.due)}</div>`:''}
            <div>状态：${esc(statusText)}</div>
          </div>`;
    }).join('');
}

function legacyReadableHTML(mem=M()) {
    const processed=Math.max(0,Number(mem.last_processed_index??-1)+1);
    const total=(C().chat||[]).length;
    const state=mem.rebuild_state||{};
    const date=mem.current_story_date || isoDateFromAny(mem.current_story_time) || '尚未建立';
    const stateStatus=String(state.status||'').toLowerCase();
    const viewLabel =
        stateStatus === 'complete'
            ? '当前长期记忆（安全重建已完成）'
            : (HISTORY_RUNNING || ['starting','resuming','running','checkpoint','normalizing'].includes(stateStatus))
                ? '安全重建中的工作记忆'
                : '当前长期记忆';

    const checkpointText =
        stateStatus === 'complete'
            ? `complete｜已完成 ${processed}/${total}`
            : `${state.status||'未建立'}｜下一条 ${Number(state.next_index??processed)+1}`;

    const anchors = Array.isArray(mem.semantic_anchors) ? mem.semantic_anchors : [];
    const anchorHtml = anchors.length
        ? anchors.slice(-40).map(a => `
            <div class="smm53-warning">
              <b>${esc(a.event || a.id || '连续性锚点')}</b>
              ${a.continuity_rule ? `<br>${esc(a.continuity_rule)}` : ''}
              ${a.source ? `<br><small>${esc(a.source)}</small>` : ''}
            </div>`).join('')
        : '<div class="smm2-empty">当前没有语义锚点。</div>';

    return `
      <div class="smm2-memory-view">
        <div class="smm2-memory-top smm52-live-view">
          <div><b>查看模式：</b>${esc(viewLabel)}</div>
          <div><b>已重建：</b>${processed}/${total} 条</div>
          <div><b>剧情起点：</b>${esc(mem.story_start||S().storyStart||'未建立')}</div>
          <div><b>当前绝对日期：</b>${esc(date)}</div>
          <div><b>显示时间：</b>${esc(mem.current_story_time||'未建立')}</div>
          <div><b>安全断点：</b>${esc(checkpointText)}</div>
          <div class="smm2-note">这里只展示适合人工核对的长期剧情记忆。待办、隔离、冲突和内部审计仍在后台工作，不占用日常查看界面。</div>
        </div>

        <details open class="smm2-memory-details smm2-history-browser">
          <summary>历史记忆浏览器</summary>
          <div class="smm2-history-tools">
            <input id="smm52_history_search" type="search" placeholder="搜索日期、人物、事件、关键词">
            <select id="smm52_history_type">
              <option value="all">全部类型</option>
              <option value="timeline">时间线</option>
              <option value="character">人物</option>
              <option value="relationship">人物关系</option>
            </select>
          </div>
          <div id="smm52_history_results"></div>
        </details>

        <details open class="smm2-memory-details">
          <summary>时间线（${(mem.timeline||[]).length}）</summary>
          ${legacyTimelineHTML(mem)}
        </details>

        <details class="smm2-memory-details">
          <summary>人物（${Object.keys(mem.characters||{}).length}）</summary>
          ${legacyCharactersHTML(mem)}
        </details>

        <details class="smm2-memory-details">
          <summary>人物关系（${(mem.relationships||[]).length}）</summary>
          ${legacyRelationshipsHTML(mem)}
        </details>

        <details open class="smm2-memory-details">
          <summary>当前主线（${(mem.active_arcs||[]).length}）</summary>
          ${(mem.active_arcs||[]).length ? (mem.active_arcs||[]).map(a => `<div class="smm53-warning"><b>${esc(a.title||a.id||'主线')}</b><br>${esc(a.summary||'')}${a.stakes?`<br><small>压力：${esc(a.stakes)}</small>`:''}</div>`).join('') : '<div class="smm2-empty">尚未建立主线锚点；下一次干净总结后会逐步建立。</div>'}
        </details>

        <details class="smm2-memory-details">
          <summary>核心人物锚点（${(mem.character_anchors||[]).length}）</summary>
          ${(mem.character_anchors||[]).length ? (mem.character_anchors||[]).map(a => `<details class="smm2-memory-details smm2-person-card"><summary>${esc(a.name||'人物')}</summary><div><b>核心：</b>${esc(a.core_personality||'')}</div><div><b>说话：</b>${esc(a.speech_style||'')}</div><div><b>决策：</b>${esc(a.decision_style||'')}</div><div><b>情绪：</b>${esc(a.emotional_style||'')}</div><div><b>关系动态：</b>${esc(a.relationship_dynamic||'')}</div>${a.do_not_drift?.length?`<div><b>禁止漂移：</b>${esc(a.do_not_drift.join('；'))}</div>`:''}</details>`).join('') : '<div class="smm2-empty">尚未建立人物锚点；角色卡/世界书仍为基础人设最高优先级。</div>'}
        </details>

        <details class="smm2-memory-details">
          <summary>关键连续性锚点（${anchors.length}）</summary>
          ${anchorHtml}
        </details>
      </div>`;
}

function memoryReadableHTML() {
    const mem = M();

    if (mem.schema !== SMM4_SCHEMA) {
        return legacyReadableHTML(mem);
    }

    const audit=v4DateAudit(mem);
    const auditHtml=audit.ok
      ? `<div class="smm2-date-audit"><b>日期完整性：</b>${esc(audit.start)} → ${esc(audit.current)}
          ${audit.missing.length
            ? `<details><summary>⚠ ${audit.missing.length} 个无记录日期（只提示，不补写）</summary>
                 <div class="smm2-missing-days">${audit.missing.map(x=>`<span>${esc(x)}</span>`).join('')}</div>
               </details>`
            : `<span>✓ 未发现缺失日期</span>`}
         </div>`
      : `<div class="smm2-date-audit">${esc(audit.message)}</div>`;

    return `
      <div class="smm2-memory-view">
        <div class="smm2-memory-top">
          <div><b>数据结构：</b>v4 标准化</div>
          <div><b>剧情起点：</b>${esc(mem.story_start || '未建立')} <span class="smm2-lock">🔒</span></div>
          <div><b>当前剧情日期：</b>${esc(effectiveCurrentDate(mem) || '未建立')}</div>
          <div><b>显示时间：</b>${esc(mem.current_story_time || '未建立')}</div>
          <div><b>计算时间基准：</b>${esc(combinedStoryTime(mem))}</div>
          <div><b>已处理到：</b>${Math.max(0, Number(mem.last_processed_index ?? -1)+1)} 条</div>
          ${auditHtml}
        </div>

        <details class="smm2-memory-details smm2-history-browser">
          <summary>历史记忆浏览器</summary>
          <div class="smm2-history-tools">
            <input id="smm4_history_search" type="search" placeholder="搜索日期、人物、事件、关键词">
            <select id="smm4_history_type">
              <option value="all">全部类型</option>
              <option value="timeline">时间线</option>
              <option value="character">人物</option>
              <option value="relationship">人物关系</option>
            </select>
          </div>
          <div id="smm4_history_results"></div>
        </details>

        <details open class="smm2-memory-details">
          <summary>时间线</summary>
          ${v4TimelineHTML(mem)}
        </details>

        <details class="smm2-memory-details">
          <summary>人物（${Object.keys(mem.characters_v4||{}).length}）</summary>
          ${v4CharactersHTML(mem)}
        </details>

        <details class="smm2-memory-details">
          <summary>人物关系（${Object.keys(mem.relationships_v4||{}).length}）</summary>
          ${v4RelationshipsHTML(mem)}
        </details>

      </div>`;
}

function toggleReadableMemory() {
    const box = document.getElementById('smm2_native_memory_box');
    if (!box) return;

    if (box.dataset.open === '1') {
        box.innerHTML = '';
        box.dataset.open = '0';
        return;
    }

    box.innerHTML = memoryReadableHTML();
    box.dataset.open = '1';

    const migrateBtn=document.getElementById('smm4_migrate_now');
    if(migrateBtn) migrateBtn.onclick=migrateToV4Now;
    if(M().schema===SMM4_SCHEMA) bindHistoryBrowserV4();
    else bindHistoryBrowserLegacy();

    const raw = document.getElementById('smm2_raw_json');
    if (raw) {
        raw.onclick = () => {
            const blob = new Blob([JSON.stringify(M(), null, 2)], {type:'application/json'});
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        };
    }
}

function countTrueConflicts() {
    const m = M();
    return (m.conflicts?.length || 0);
}


function exportRawChat() {
    const c = C();
    const payload = {
        exported_at: new Date().toISOString(),
        chat_name: c?.name || null,
        story_start: M().story_start || S().storyStart || null,
        messages: (c.chat || []).map((m,i)=>({
            index:i,
            role:m.is_user ? 'user' : (m.is_system ? 'system' : 'assistant'),
            name:m.name || null,
            mes:m.mes || '',
            send_date:m.send_date || null
        }))
    };
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=`story-raw-chat-${Date.now()}.json`; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

function safeRebuildFreshMemory(anchor, currentDate) {
    const m=freshMemory();
    m.story_start=anchor;
    m.current_story_date=anchor;
    m.current_story_time=null;
    m.rebuild_target_date=currentDate || null;
    m.rebuild_mode='safe_v062';
    m.audit.push({at:new Date().toISOString(),type:'safe_rebuild_started',anchor,target_date:currentDate||null});
    return m;
}

async function safeHistoryRun({fresh=false}={}) {
    if (HISTORY_RUNNING || BUSY) return toast('当前有任务正在运行。若页面曾卡死，请刷新页面后再点“继续安全重建”。','warning');
    const c=C(), chat=c.chat||[];
    if (!chat.length) return toast('当前聊天为空。','warning');

    const existing=M();
    const anchor=(existing.story_start || S().storyStart || '').trim();
    if (!anchor) return toast('请先设置并保存剧情起点（YYYY-MM-DD），再开始安全重建。','warning');
    const target=existing.current_story_date || detectCurrentDateFromRecentChat()?.date || null;

    if (fresh) {
        if (!confirm(`将从第1条原始聊天重新开始安全重建。\\n剧情起点锁定：${anchor}\\n\\n现有记忆会备份，然后重新从0开始。继续吗？`)) return;
        const old=JSON.parse(JSON.stringify(existing));
        c.chatMetadata[META_KEY+'_backup_v062_'+Date.now()]=old;
        c.chatMetadata[META_KEY]=safeRebuildFreshMemory(anchor,target);
        M().rebuild_mode='safe_v062';
        M().rebuild_state={status:'starting',next_index:0,last_error:null,updated_at:new Date().toISOString()};
        await saveMeta();
    } else {
        const mem=M();
        const next=Math.max(0,Number(mem.last_processed_index??-1)+1);
        if (next>=chat.length) return toast('安全重建已经完成全部原始聊天。','success');
        mem.story_start=anchor;
        mem.rebuild_mode='safe_v062';
        mem.rebuild_state=mem.rebuild_state||{};
        mem.rebuild_state.status='resuming';
        mem.rebuild_state.next_index=next;
        mem.rebuild_state.last_error=null;
        mem.rebuild_state.updated_at=new Date().toISOString();
        await saveMeta();
    }

    HISTORY_RUNNING=true; HISTORY_STOP_REQUESTED=false; BUSY=true; refreshNative();
    let start=Math.max(0,Number(M().last_processed_index??-1)+1);
    toast(`${fresh?'安全重建已从头启动':'安全重建已从断点继续'}：下一批第 ${start+1} 条。`,'success');

    try {
        while(start<chat.length && !HISTORY_STOP_REQUESTED){
            const batch=Math.max(4,Number(S().batchMessages)||20);
            const end=Math.min(chat.length,start+batch);
            const mem=M();
            mem.rebuild_state={status:'running',next_index:start,current_range:[start+1,end],last_error:null,updated_at:new Date().toISOString()};
            await saveMeta();
            refresh(); refreshNative();

            const beforeDate=M().current_story_date;
            await summarizeRange(start,end);
            const after=M().current_story_date;
            M().story_start=anchor;
            if (beforeDate && after && after < beforeDate) {
                M().quarantined.push({content:`批次 #${start+1}-#${end} 尝试将当前日期 ${beforeDate} 倒退为 ${after}`,
                    reason:'v0.6.0 单向时间守卫：当前主线日期禁止倒退',source:`#${start+1}-#${end}`});
                M().current_story_date=beforeDate;
            }
            if (M().current_story_date && M().current_story_date < anchor) M().current_story_date=anchor;

            calibrateTimeline(M(), {allowCrossMidnight:true});
            // 二次校准后再次同步 current_story_date，确保顶部日期与 timeline 最新 source 一致。
            syncCurrentDateFromTimeline(M(), M().current_story_date);
            start=Math.max(end,Number(M().last_processed_index??end-1)+1);
            M().rebuild_state={status:'checkpoint',next_index:start,last_success_range:[end-batch+1,end],last_error:null,updated_at:new Date().toISOString()};
            await saveMeta();
            refresh(); refreshNative();
            await new Promise(r=>setTimeout(r,500));
        }

        if (HISTORY_STOP_REQUESTED) {
            M().rebuild_state={...(M().rebuild_state||{}),status:'paused',next_index:start,updated_at:new Date().toISOString()};
            await saveMeta();
            toast(`安全重建已暂停。断点保存在第 ${start} 条之后。`,'info');
        } else if (start>=chat.length) {
            M().rebuild_state={
                ...(M().rebuild_state||{}),
                status:'normalizing',
                next_index:start,
                updated_at:new Date().toISOString()
            };
            await saveMeta();

            // v0.10.6：
            // v2 canonical memory 就是正式长期记忆。
            // 不再调用已废弃/不完整的 v4 自动迁移。
            normalizeMemoryStateV085(M());
            calibrateTimeline(M(), {allowCrossMidnight:true});
            syncCurrentDateFromTimeline(M(), M().current_story_date);
            guardOpenLoopsTemporalV0105(M());

            M().rebuild_state={
                ...(M().rebuild_state||{}),
                status:'complete',
                next_index:chat.length,
                updated_at:new Date().toISOString()
            };
            await saveMeta();

            toast(
                '安全历史重建完成。当前长期记忆已完成归一化、日期轴校准与待办状态校验。',
                'success'
            );
        }
    } catch(e){
        console.error('[StoryMemory] safe rebuild failed',e);
        const at=Math.max(0,Number(M().last_processed_index??-1)+1);
        M().rebuild_state={status:'error',next_index:at,last_error:String(e?.message||e),updated_at:new Date().toISOString()};
        await saveMeta();
        if (isSmmTimeout(e)) {
            toast(`第 ${at+1} 条附近的模型请求超时，已安全暂停。已完成数据不会丢失；请稍后点“继续安全重建”。`,'warning');
        } else {
            toast(`安全历史重建已在断点处暂停：${e.message||e}`,'error');
        }
    } finally {
        HISTORY_RUNNING=false; BUSY=false; refreshNative(); refresh();
    }
}

async function safeHistoryRebuild() { return safeHistoryRun({fresh:true}); }
async function resumeSafeHistoryRebuild() { return safeHistoryRun({fresh:false}); }

function stopHistoryRebuild() {
    if (!HISTORY_RUNNING) {
        toast('当前没有正在运行的历史重建。');
        return;
    }
    HISTORY_STOP_REQUESTED = true;
    toast('将在当前批次完成后暂停。', 'info');
}

function nativeManagerHTML() {
    return `
      <div id="smm2_native_stats" class="smm2-stats"></div>

      <!-- v0.9.2 mobile UI cleanup -->
      <div class="smm2-native-grid smm2-main-actions">
        <button id="smm2_native_new" class="menu_button smm2-primary-tool">总结新增</button>
        <button id="smm2_native_view" class="menu_button">查看 / 收起记忆</button>
      </div>

      <div id="smm2_native_memory_box" data-open="0"></div>

      <details class="smm2-tool-card smm2-more-tools">
        <summary>
          <span class="smm2-tool-title">更多工具</span>
          <span class="smm2-tool-subtitle">数据、时间与历史维护</span>
        </summary>

        <div class="smm2-tool-body">

          <details class="smm2-tool-card">
            <summary>
              <span class="smm2-tool-title">数据管理</span>
              <span class="smm2-tool-subtitle">导入、导出与备份</span>
            </summary>
            <div class="smm2-tool-body">
              <button id="smm2_native_export" class="menu_button">导出记忆 JSON</button>
              <button id="smm2_native_import" class="menu_button">导入记忆 JSON</button>
              <button id="smm50_export_raw" class="menu_button">导出原始聊天 JSON</button>
            </div>
          </details>

          <details class="smm2-tool-card">
            <summary>
              <span class="smm2-tool-title">时间与维护</span>
              <span class="smm2-tool-subtitle">日期校准与时间线修复</span>
            </summary>

            <div class="smm2-tool-body">

              <details class="smm2-tool-card smm2-time-fix">
                <summary>
                  <span class="smm2-tool-title">时间修正</span>
                  <span class="smm2-tool-subtitle">修正错误剧情日期</span>
                </summary>

                <div class="smm2-tool-body">
                  <div class="smm2-note">
                    只修正插件记忆，不修改原聊天。历史重建暂停后再执行。
                  </div>

                  <div class="smm2-fix-grid">
                    <label>
                      <span>错误日期</span>
                      <input id="smm2_fix_from" type="text" placeholder="2025-10-17">
                    </label>

                    <div class="smm2-fix-arrow">→</div>

                    <label>
                      <span>正确日期</span>
                      <input id="smm2_fix_to" type="text" placeholder="2025-09-17">
                    </label>
                  </div>

                  <button id="smm2_native_fix_time" class="menu_button smm2-primary-tool">执行时间修正</button>
                </div>
              </details>

              <button id="smm53_calibrate" class="menu_button">重建当前日期轴</button>
              <button id="smm84_clean_orphans" class="menu_button">清理旧版主线总结</button>

            </div>
          </details>

          <details class="smm2-tool-card">
            <summary>
              <span class="smm2-tool-title">历史重建</span>
              <span class="smm2-tool-subtitle">断点续跑与完整重建</span>
            </summary>

            <div class="smm2-tool-body">
              <button id="smm51_native_resume" class="menu_button">从断点继续安全重建</button>
              <button id="smm2_native_stop" class="menu_button">暂停当前重建</button>
            </div>
          </details>

          <details class="smm2-tool-card">
            <summary>
              <span class="smm2-tool-title">危险操作</span>
              <span class="smm2-tool-subtitle">可能覆盖或清除现有记忆</span>
            </summary>

            <div class="smm2-tool-body">
              <button id="smm2_native_rebuild" class="menu_button">从第 1 条重新安全重建</button>
              <button id="smm2_native_clear" class="menu_button">清空本聊天记忆</button>
            </div>
          </details>

        </div>
      </details>

      <div class="smm2-native-settings smm107-settings-stack">
        <section class="smm107-settings-card smm107-core-card">
          <div class="smm107-card-head">
            <div>
              <div class="smm107-card-title">自动管理</div>
              <div class="smm107-card-subtitle">日常使用只需要这里</div>
            </div>
          </div>

          <label class="smm107-switch-row">
            <input id="smm2_native_enabled" type="checkbox">
            <span><b>启用插件</b><small>SMM 总开关</small></span>
          </label>

          <input id="smm2_native_inject" type="checkbox" hidden aria-hidden="true">

          <label class="smm107-switch-row">
            <input id="smm2_native_auto" type="checkbox">
            <span><b>自动增量总结</b><small>达到阈值后自动处理新增剧情</small></span>
          </label>

          <label class="smm107-switch-row">
            <input id="smm100_safe_inject" type="checkbox">
            <span><b>生成时注入剧情记忆</b><small>把可靠长期记忆提供给主聊天模型</small></span>
          </label>

          <label class="smm107-switch-row">
            <input id="smm100_auto_hide" type="checkbox">
            <span><b>总结后自动隐藏旧楼层</b><small>仅在安全记忆注入开启时生效</small></span>
          </label>

          <div class="smm107-inline-setting">
            <label for="smm100_keep_recent">保留最近原文</label>
            <div class="smm107-number-unit">
              <input id="smm100_keep_recent" type="number" min="10" max="200" step="5">
              <span>楼</span>
            </div>
          </div>

          <div id="smm100_hide_status" class="smm2-note smm107-status-note">
            自动隐藏默认关闭。建议先启用安全记忆注入并验证后再开启。
          </div>

          <details class="smm107-inline-details">
            <summary>隐藏楼层管理</summary>
            <button id="smm100_unhide_all" class="menu_button">恢复全部隐藏楼层</button>
          </details>
        </section>

        <details class="smm2-tool-card smm107-settings-card">
          <summary>
            <span class="smm2-tool-title">总结模型</span>
            <span class="smm2-tool-subtitle">独立 Profile、失败策略与 Token</span>
          </summary>

          <div class="smm2-tool-body">
            <label>
              总结通道
              <select id="smm93_summary_provider">
                <option value="current">跟随当前聊天模型</option>
                <option value="profile">独立 Connection Profile</option>
              </select>
            </label>

            <label id="smm93_profile_row">
              总结 Profile
              <select id="smm93_summary_profile"></select>
            </label>

            <button id="smm96_create_profile" class="menu_button">
              将当前 API / 模型保存为总结 Profile
            </button>

            <div class="smm2-note" id="smm96_create_profile_note">
              先把 SillyTavern 切到想用于总结的 API / 模型，再点此按钮；创建后可把主聊天连接切回原模型。
            </div>

            <label id="smm93_fallback_row">
              独立 Profile 失败时
              <select id="smm93_summary_fallback">
                <option value="stop">暂停总结，不回退</option>
                <option value="fallback">回退当前聊天模型</option>
              </select>
            </label>

            <label>
              最大输出 Token
              <input id="smm93_summary_tokens" type="number" min="512" max="32768" step="256">
            </label>

            <div id="smm93_summary_status" class="smm2-note"></div>
          </div>
        </details>

        <details class="smm2-tool-card smm107-settings-card">
          <summary>
            <span class="smm2-tool-title">总结节奏与剧情起点</span>
            <span class="smm2-tool-subtitle">一般无需频繁调整</span>
          </summary>
          <div class="smm2-tool-body smm107-advanced-grid">
            <label>
              每多少条新消息总结一次
              <input id="smm2_native_trigger" type="number" min="1" max="50">
            </label>

            <label>
              每批最多消息数
              <input id="smm2_native_batch" type="number" min="4" max="60">
            </label>

            <label class="smm107-span-all">
              剧情起点（建立记忆后自动锁定）
              <input id="smm2_native_start" type="text" placeholder="如 2026-01-01">
            </label>

            <div class="smm2-note smm107-span-all">
              记忆按“聊天”隔离。同一角色开新聊天，也会得到另一套记忆。酒馆楼层发送时间不作为剧情时间。
            </div>
          </div>
        </details>
      </div>
    `;
}

function bindNativeManager() {
    const q = id => document.getElementById(id);
    if (!q('smm2_native_new')) return;

    q('smm2_native_new').onclick = () => summarizeNew(true);

    // v0.9.4：总结专用 Connection Profile UI
    const providerEl=q('smm93_summary_provider');
    const profileEl=q('smm93_summary_profile');
    const fallbackEl=q('smm93_summary_fallback');
    const tokensEl=q('smm93_summary_tokens');
    const createProfileEl=q('smm96_create_profile');

    const refreshSummaryProfileUIV094=()=>{
        const settings=S();
        const cm=C().extensionSettings?.connectionManager || {};
        const profiles=Array.isArray(cm.profiles) ? cm.profiles : [];

        if(profileEl){
            profileEl.innerHTML = [
                '<option value="">请选择 Profile</option>',
                ...profiles.map(p=>{
                    const label=[
                        p.name || p.id || '未命名 Profile',
                        p.model ? '('+p.model+')' : ''
                    ].filter(Boolean).join(' ');

                    return '<option value="'+esc(p.id||'')+'">'+esc(label)+'</option>';
                })
            ].join('');

            profileEl.value=String(settings.summaryProfileId||'');
        }

        if(providerEl){
            providerEl.value=String(settings.summaryProvider||'current');
        }

        if(fallbackEl){
            fallbackEl.value=String(settings.summaryFallback||'stop');
        }

        if(tokensEl){
            tokensEl.value=Math.max(512,Number(settings.summaryMaxTokens||4096));
        }

        const usingProfile=String(settings.summaryProvider||'current')==='profile';

        const profileRow=q('smm93_profile_row');
        const fallbackRow=q('smm93_fallback_row');

        if(profileRow) profileRow.style.display=usingProfile ? '' : 'none';
        if(fallbackRow) fallbackRow.style.display=usingProfile ? '' : 'none';

        const status=q('smm93_summary_status');

        if(status){
            if(!usingProfile){
                status.textContent='当前：总结跟随主聊天模型。';
            }else{
                const p=profiles.find(x=>x.id===settings.summaryProfileId);
                status.textContent=p
                    ? '当前：'+(p.name||'未命名 Profile')+(p.model?' · '+p.model:'')
                    : '当前：尚未选择有效的总结 Profile。';
            }
        }
    };

    if(providerEl){
        providerEl.onchange=e=>{
            const settings=S();
            settings.summaryProvider=e.target.value==='profile' ? 'profile' : 'current';
            saveSettings();
            refreshSummaryProfileUIV094();
        };
    }

    if(profileEl){
        profileEl.onchange=e=>{
            S().summaryProfileId=String(e.target.value||'');
            saveSettings();
            refreshSummaryProfileUIV094();
        };
    }

    if(fallbackEl){
        fallbackEl.onchange=e=>{
            S().summaryFallback=e.target.value==='fallback' ? 'fallback' : 'stop';
            saveSettings();
        };
    }

    if(tokensEl){
        tokensEl.onchange=e=>{
            S().summaryMaxTokens=Math.max(
                512,
                Math.min(32768,Number(e.target.value)||4096)
            );
            saveSettings();
            tokensEl.value=S().summaryMaxTokens;
        };
    }

    refreshSummaryProfileUIV094();

    // v0.9.6：一键创建总结 Profile。
    // 复用 SillyTavern 官方 /profile-create，不自行保存 API Key。
    if(createProfileEl){
        createProfileEl.onclick=async()=>{
            try{
                const ctx=C();
                const cm=ctx.extensionSettings?.connectionManager;

                if(!cm || !Array.isArray(cm.profiles)){
                    toast('Connection Manager 尚未初始化，请稍后再试。','warning');
                    return;
                }

                const base='StoryMemory Summary';
                const names=new Set(cm.profiles.map(p=>String(p?.name||'')));
                let name=base;
                let n=2;
                while(names.has(name)){
                    name=base+' ('+(n++)+')';
                }

                createProfileEl.disabled=true;
                createProfileEl.textContent='正在创建总结 Profile…';

                const exec =
                    typeof ctx.executeSlashCommands === 'function'
                        ? ctx.executeSlashCommands.bind(ctx)
                        : null;

                if(!exec){
                    throw new Error('当前 SillyTavern 未暴露 executeSlashCommands');
                }

                await exec('/profile-create '+name);

                await new Promise(r=>setTimeout(r,250));

                const cm2=C().extensionSettings?.connectionManager || {};
                const profiles=Array.isArray(cm2.profiles) ? cm2.profiles : [];
                const created=
                    profiles.find(p=>p?.name===name) ||
                    profiles.find(p=>p?.id===cm2.selectedProfile);

                if(!created?.id){
                    throw new Error('命令已执行，但没有检测到新建 Profile');
                }

                const settings=S();
                settings.summaryProvider='profile';
                settings.summaryProfileId=String(created.id);
                saveSettings();

                refreshSummaryProfileUIV094();

                toast(
                    '已创建并选中总结 Profile：'+
                    String(created.name||name)+
                    (created.model ? ' · '+created.model : ''),
                    'success'
                );
            }catch(e){
                console.error('[StoryMemory] create summary profile failed',e);
                toast('创建总结 Profile 失败：'+(e?.message||e),'error');
            }finally{
                createProfileEl.disabled=false;
                createProfileEl.textContent='将当前 API / 模型保存为总结 Profile';
            }
        };
    }

    // v0.9.5：Connection Manager 可能晚于本插件完成初始化。
    // 监听 Profile 生命周期事件，并在稍后再次刷新一次。
    try {
        const ctx=C();
        const source=ctx.eventSource;
        const types=ctx.event_types || {};

        const profileEvents=[
            types.CONNECTION_PROFILE_LOADED,
            types.CONNECTION_PROFILE_CREATED,
            types.CONNECTION_PROFILE_UPDATED,
            types.CONNECTION_PROFILE_DELETED
        ].filter(Boolean);

        for(const evt of profileEvents){
            source?.on?.(evt, ()=>{
                setTimeout(refreshSummaryProfileUIV094, 50);
            });
        }
    } catch(e) {
        console.warn('[StoryMemory] profile event listener unavailable', e);
    }

    // 页面初始化顺序不固定，做几次轻量延迟刷新。
    setTimeout(refreshSummaryProfileUIV094, 300);
    setTimeout(refreshSummaryProfileUIV094, 1000);
    setTimeout(refreshSummaryProfileUIV094, 2500);

    // v0.9.1：旧版 history 入口已从 UI 移除。
    q('smm2_native_stop').onclick = stopHistoryRebuild;
    q('smm2_native_rebuild').onclick = safeHistoryRebuild;
    q('smm51_native_resume').onclick = resumeSafeHistoryRebuild;
    const cleanOrphansBtn=q('smm84_clean_orphans');
    if(cleanOrphansBtn) cleanOrphansBtn.onclick=async()=>{
        const mem=M();
        const rows=Array.isArray(mem.timeline)?mem.timeline:[];

        const invalid=e=>{
            const src=String(e?.source||'').trim();
            return !/#\d+/.test(src) || /主线总结|剧情总结|历史总结|summary/i.test(src);
        };

        const removed=rows.filter(invalid);
        const keep=rows.filter(e=>!invalid(e));

        if(!removed.length){
            toast('没有发现需要清理的旧版主线总结。','success');
            return;
        }

        if(!confirm(
            '检测到 '+removed.length+' 条旧版主线总结/非法 source。\n\n'+
            '将从正式时间线移出并备份到隔离区。\n'+
            '不会修改原聊天，也不会调用模型。\n\n继续吗？'
        )) return;

        mem.quarantined=Array.isArray(mem.quarantined)?mem.quarantined:[];

        for(const e of removed){
            mem.quarantined=uniqMerge(
                mem.quarantined,
                [{
                    content:String(e?.event||''),
                    reason:'legacy_timeline_orphan_removed_v0.8.4',
                    source:String(e?.source||''),
                    original_date:e?.date||null,
                    original_time:e?.time||null
                }],
                x=>JSON.stringify([x.content,x.reason,x.source])
            );
        }

        mem.timeline=keep;

        const r=calibrateTimeline(mem,{allowCrossMidnight:true});
        const sync=syncCurrentDateFromTimeline(mem,mem.current_story_date);

        mem.audit=Array.isArray(mem.audit)?mem.audit:[];
        mem.audit.push({
            at:new Date().toISOString(),
            type:'legacy_timeline_orphan_cleanup_v0.8.4',
            removed:removed.length,
            remaining:keep.length,
            synced_current_date:sync.current||null
        });

        await saveMeta();
        refresh();
        refreshNative();

        const box=document.getElementById('smm2_native_memory_box');
        if(box?.dataset.open==='1'){
            box.innerHTML=memoryReadableHTML();
            if(M().schema===SMM4_SCHEMA) bindHistoryBrowserV4();
            else bindHistoryBrowserLegacy();
        }

        toast(
            '局部清理完成：移出 '+removed.length+
            ' 条旧版主线总结，保留 '+keep.length+
            ' 条真实 source 时间线。',
            'success'
        );
    };

    q('smm53_calibrate').onclick = async () => {
        const r=calibrateTimeline(M(),{allowCrossMidnight:true});
        const sync=syncCurrentDateFromTimeline(M(), M().current_story_date);
        M().audit=Array.isArray(M().audit)?M().audit:[];
        M().audit.push({at:new Date().toISOString(),type:'timeline_calibration_v053',
            duplicate_merged:r.duplicate_merged,date_reassigned:r.date_reassigned,date_islands_fixed:r.date_islands_fixed,confirmed_rollovers:r.confirmed_rollovers,
            synced_current_date:sync.current||null, diagnostics_count:r.diagnostics.length});
        await saveMeta();
        refresh(); refreshNative();
        const box=document.getElementById('smm2_native_memory_box');
        if(box?.dataset.open==='1'){
            box.innerHTML=memoryReadableHTML();
            if(M().schema===SMM4_SCHEMA) bindHistoryBrowserV4(); else bindHistoryBrowserLegacy();
        }
        toast(`日期轴重建完成：合并重复 ${r.duplicate_merged}，跨午夜 ${r.confirmed_rollovers||0}，日期变更 ${r.date_reassigned||0}，日期锚点接受 ${r.source_anchor_accepted||0}，拒绝 ${r.source_anchor_rejected||0}，异常提示 ${r.diagnostics.length}。`,'success');
    };
    const raw50=q('smm50_export_raw'); if(raw50) raw50.onclick=exportRawChat;
    q('smm2_native_import').onclick = importMemory;
    q('smm2_native_export').onclick = exportMemory;
    q('smm2_native_clear').onclick = clearMemory;

    q('smm2_native_view').onclick = toggleReadableMemory;
    const migrateNative = document.getElementById('smm4_native_migrate');
    if (migrateNative) migrateNative.onclick = migrateToV4Now;
    const detectDateBtn = document.getElementById('smm41_detect_date');
    if (detectDateBtn) detectDateBtn.onclick = () => {
        const found = detectCurrentDateFromRecentChat();
        const el = document.getElementById('smm41_current_date');
        if (found) {
            if (el) el.value = found.date;
            toast(`已从 ${found.source} 识别当前剧情日期：${found.date}`,'success');
        } else {
            toast('最近聊天中没有找到 <date>YYYY年MM月DD日</date>，请手动填写当前剧情日期。','warning');
        }
    };
    const repairTimeBtn = document.getElementById('smm41_repair_time');
    if (repairTimeBtn) repairTimeBtn.onclick = repairTimeBaselineV041;

    q('smm2_native_fix_time').onclick = correctMemoryDate;

    const s = S();

    q('smm2_native_enabled').onchange = e => {
        s.enabled = e.target.checked;
        saveSettings();
        refreshNative();
    };

    q('smm2_native_inject').onchange = e => {
        s.injectMemory = false; e.target.checked = false;
        saveSettings();
    };

    q('smm2_native_auto').onchange = e => {
        s.autoSummarize = e.target.checked;
        saveSettings();
    };

    const safeInjectEl = q('smm100_safe_inject');
    const autoHideEl = q('smm100_auto_hide');
    const keepRecentEl = q('smm100_keep_recent');
    const unhideBtn = q('smm100_unhide_all');

    if (unhideBtn) {
        unhideBtn.onclick = async () => {
            if (BUSY) {
                toast('当前有任务正在运行，请稍后再试。', 'warning');
                return;
            }

            BUSY = true;
            unhideBtn.disabled = true;

            try {
                await restoreSmmHiddenMessagesV0101();
            } catch (e) {
                console.error('[StoryMemory] restore hidden failed', e);
                toast('恢复隐藏楼层失败：' + (e?.message || e), 'error');
            } finally {
                BUSY = false;
                unhideBtn.disabled = false;
                refreshNative();
            }
        };
    }


    if (safeInjectEl) {
        safeInjectEl.onchange = e => {
            s.safeMemoryInject = !!e.target.checked;
            saveSettings();
            refreshSafeMemoryInjectionV0100();
            refreshNative();
        };
    }

    if (autoHideEl) {
        autoHideEl.onchange = e => {
            if (e.target.checked && !s.safeMemoryInject) {
                e.target.checked = false;
                s.autoHideSummarized = false;
                saveSettings();
                toast('请先启用“生成时注入剧情记忆”，验证正常后再开启自动隐藏。', 'warning');
                return;
            }

            s.autoHideSummarized = !!e.target.checked;
            saveSettings();
            refreshNative();
        };
    }

    if (keepRecentEl) {
        keepRecentEl.onchange = e => {
            s.keepRecentMessages = Math.max(
                10,
                Math.min(200, Number(e.target.value) || 30)
            );
            e.target.value = s.keepRecentMessages;
            saveSettings();
            refreshNative();
        };
    }


    q('smm2_native_trigger').onchange = e => {
        s.triggerMessages = Math.max(1, Number(e.target.value) || 8);
        saveSettings();
    };

    q('smm2_native_batch').onchange = e => {
        s.batchMessages = Math.max(4, Number(e.target.value) || 20);
        saveSettings();
    };

    q('smm2_native_start').onchange = async e => {
        const proposed = e.target.value.trim();
        const m = M();
        const existing = String(m.story_start || s.storyStart || '').trim();
        if (existing && m.last_processed_index >= 0 && proposed !== existing) {
            toast(`剧情起点已锁定为 ${existing}。如确需修改，请先清空本聊天记忆后重新建立。`, 'warning');
            e.target.value = existing;
            return;
        }
        s.storyStart = proposed;
        saveSettings();
        m.story_start = proposed || null;
        await saveMeta();
        refreshNative();
    };
}

function refreshNative() {
    const stats = document.getElementById('smm2_native_stats');
    if (!stats) return;

    const s = S();

    stats.innerHTML = statsHTMLV0105();

    const setChecked = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.checked = !!val;
    };

    const setValue = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val ?? '';
    };

    setChecked('smm2_native_enabled', s.enabled);
    setChecked('smm2_native_inject', false);
    setChecked('smm2_native_auto', s.autoSummarize);
    setChecked('smm100_safe_inject', s.safeMemoryInject);
    setChecked('smm100_auto_hide', s.autoHideSummarized);
    setValue('smm100_keep_recent', s.keepRecentMessages);

    const hideStatus = document.getElementById('smm100_hide_status');

    if (hideStatus) {
        const hiddenInfo = getSmmAutoHiddenInfoV0101();

        hideStatus.textContent = s.safeMemoryInject
            ? (s.autoHideSummarized
                ? '自动隐藏已开启；保留最近 ' + s.keepRecentMessages
                    + ' 楼。当前已隐藏 ' + hiddenInfo.count
                    + (hiddenInfo.last >= 0 ? ' 楼，至 #' + hiddenInfo.last : ' 楼。')
                : '安全记忆注入已开启；自动隐藏仍关闭。当前已隐藏 '
                    + hiddenInfo.count + ' 楼。')
            : '安全记忆注入未开启；自动隐藏不可启用。';
    }

    setValue('smm2_native_trigger', s.triggerMessages);
    setValue('smm2_native_batch', s.batchMessages);
    setValue('smm2_native_start', s.storyStart);
}

function installNativeExtensionEntry() {
    try { refreshSafeMemoryInjectionV0100(); } catch (e) { console.warn('[StoryMemory] safe memory injection refresh failed', e); }
    const host =
        document.querySelector('#extensions_settings2') ||
        document.querySelector('#extensions_settings') ||
        document.querySelector('#extensionsMenu');

    if (!host) return;

    let wrap = document.getElementById('smm2_native_entry');

    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'smm2_native_entry';
        wrap.className = 'inline-drawer';

        wrap.innerHTML = `
          <div class="inline-drawer-toggle inline-drawer-header">
            <div class="smm105-title-wrap"><b>剧情自动记忆</b><span class="smm105-version-badge">v0.10.7</span></div>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
          </div>
          <div class="inline-drawer-content">
            ${nativeManagerHTML()}
          </div>
        `;

        host.appendChild(wrap);
    } else {
        const content = wrap.querySelector('.inline-drawer-content');
        if (content) content.innerHTML = nativeManagerHTML();
    }

    bindNativeManager();
    refreshNative();
}

function installUI() {
    // Keep floating button for desktop, but the native Extensions entry is the primary mobile path.
    if (!document.getElementById(BUTTON_ID)) {
        const b=document.createElement('button');
        b.id=BUTTON_ID; b.textContent='记忆';
        b.title='剧情自动记忆';

        const placeMemoryButton = () => {
            const mobile = window.matchMedia?.('(max-width: 800px)')?.matches ?? (window.innerWidth <= 800);
            if (mobile) {
                b.style.display = 'none';
            } else {
                Object.assign(b.style, {
                    position:'fixed',
                    left:'auto',
                    right:'12px',
                    bottom:'96px',
                    zIndex:'9998',
                    display:'block',
                    visibility:'visible',
                    opacity:'1',
                    transform:'none'
                });
            }
        };

        placeMemoryButton();
        window.addEventListener('resize', placeMemoryButton, { passive:true });
        window.addEventListener('orientationchange', () => setTimeout(placeMemoryButton, 150), { passive:true });

        document.body.appendChild(b);
        b.onclick=()=>{
            const panel = document.getElementById(PANEL_ID);
            if (!panel) return;
            panel.classList.toggle('smm2-hidden');
            if (!panel.classList.contains('smm2-hidden')) {
                const card = panel.querySelector('.smm2-card');
                if (card) card.scrollTop = 0;
            }
        };
    }

    if (!document.getElementById(PANEL_ID)) {
        document.body.insertAdjacentHTML('beforeend', panelHTML());
    }

    installNativeExtensionEntry();
    bind();
    refresh();
}

function bind() {
    const $=id=>document.getElementById(id);
    $('smm2_close').onclick=()=>$(PANEL_ID).classList.add('smm2-hidden');
    $('smm2_new').onclick=()=>summarizeNew(true);
    $('smm2_rebuild').onclick=rebuildAll;
    $('smm2_import').onclick=importMemory;
    $('smm2_export').onclick=exportMemory;
    $('smm2_clear').onclick=clearMemory;
    $('smm2_view').onclick=()=>{
        const w=window.open('','_blank');
        if (!w) return toast('浏览器阻止了弹窗。','warning');
        w.document.write(`<pre style="white-space:pre-wrap;font-family:monospace">${esc(JSON.stringify(M(),null,2))}</pre>`);
    };
    const s=S();
    $('smm2_enabled').onchange=e=>{s.enabled=e.target.checked;saveSettings();};
    $('smm2_inject').onchange=e=>{s.injectMemory=false;e.target.checked=false;saveSettings();toast('安全模式：记忆自动注入已禁用，避免修改原始 chat 数组。','info');};
    $('smm2_auto').onchange=e=>{s.autoSummarize=e.target.checked;saveSettings();};
    $('smm2_trigger').onchange=e=>{s.triggerMessages=Math.max(1,Number(e.target.value)||8);saveSettings();};
    $('smm2_batch').onchange=e=>{s.batchMessages=Math.max(4,Number(e.target.value)||20);saveSettings();};
    $('smm2_start').onchange=e=>{
        s.storyStart=e.target.value.trim(); saveSettings();
        const m=M(); if (m.last_processed_index<0) {m.story_start=s.storyStart||null;saveMeta();}
    };
}


function smmCountV0104(field) {
    try {
        const mem = M();
        return Array.isArray(mem?.[field])
            ? mem[field].length
            : 0;
    } catch {
        return 0;
    }
}

function rebuildStatusLabelV0105(mem=M()) {
    if (HISTORY_RUNNING) return '运行中';

    const status = String(mem?.rebuild_state?.status || '').toLowerCase();

    if (status === 'complete') return '已完成';
    if (status === 'paused') return '已暂停';
    if (status === 'error') return '错误暂停';
    if (status === 'normalizing') return '归一化中';
    if (status === 'starting' || status === 'resuming' || status === 'running' || status === 'checkpoint') {
        return '等待继续';
    }

    return '未运行';
}

function rebuildCheckpointHTMLV0105(mem=M(), total=(C().chat||[]).length) {
    const state = mem?.rebuild_state;

    if (!state) return '';

    const status = String(state.status || '').toLowerCase();

    if (status === 'complete') {
        return `<div class="smm105-stat-line">安全重建：complete　${Math.min(total, Math.max(0, Number(state.next_index ?? total)))}/${total}</div>`;
    }

    const next = Math.max(0, Number(state.next_index ?? 0)) + 1;

    return `<div class="smm105-stat-line">安全断点：${esc(state.status || '')}　下一条 ${next}${state.last_error ? `<br>上次错误：${esc(state.last_error)}` : ''}</div>`;
}

function statsHTMLV0105() {
    const st = stat();
    const mem = M();
    const hidden = getSmmAutoHiddenInfoV0101();
    const date = mem.current_story_date || '未建立';
    const people = Object.keys(mem.characters || {}).length;
    const relations = Array.isArray(mem.relationships) ? mem.relationships.length : 0;
    const anchors = Array.isArray(mem.semantic_anchors) ? mem.semantic_anchors.length : 0;
    const continuityNeedsReview =
        (Array.isArray(mem.conflicts) ? mem.conflicts.length : 0) +
        (Array.isArray(mem.quarantined) ? mem.quarantined.length : 0);

    return [
        `<div class="smm105-stat-line"><b>剧情：</b>${esc(date)}　${esc(st.time)}</div>`,
        `<div class="smm105-stat-line"><b>处理：</b>${st.done}/${st.total}　待总结 ${st.pending}　已隐藏 ${hidden.count}</div>`,
        `<div class="smm105-stat-line"><b>记忆：</b>事件 ${st.events}　人物 ${people}　关系 ${relations}　锚点 ${anchors}</div>`,
        `<div class="smm105-stat-line"><b>连续性：</b>${continuityNeedsReview ? '后台有待核查项' : '正常'}</div>`,
        `<div class="smm105-stat-line"><b>历史重建：</b>${esc(rebuildStatusLabelV0105(mem))}</div>`,
        rebuildCheckpointHTMLV0105(mem, st.total)
    ].filter(Boolean).join('');
}

function refresh() {
    refreshNative();

    if (!document.getElementById(PANEL_ID)) return;

    const s=S();
    document.getElementById('smm2_stats').innerHTML = statsHTMLV0105();
    document.getElementById('smm2_enabled').checked=!!s.enabled;
    document.getElementById('smm2_inject').checked=false;
    document.getElementById('smm2_auto').checked=!!s.autoSummarize;
    document.getElementById('smm2_trigger').value=s.triggerMessages;
    document.getElementById('smm2_batch').value=s.batchMessages;
    document.getElementById('smm2_start').value=s.storyStart||'';
}

async function maybeAuto() {
    const s=S(); if (!s.enabled || !s.autoSummarize || BUSY) return;
    const st=stat();
    if (st.pending >= Math.max(1,Number(s.triggerMessages)||8)) await summarizeNew(false);
}



let INITIALIZED = false;

function initializeExtension() {
    if (INITIALIZED) return;

    // Do not mark initialized until SillyTavern context is actually ready.
    if (!globalThis.SillyTavern || typeof SillyTavern.getContext !== 'function') {
        setTimeout(initializeExtension, 500);
        return;
    }

    let c;
    try {
        c = C();
        if (!c) throw new Error('SillyTavern context unavailable');
        S();
    } catch (e) {
        console.warn('[StoryMemory] context not ready yet', e);
        setTimeout(initializeExtension, 700);
        return;
    }

    INITIALIZED = true;

    const safeOn = (eventName, handler) => {
        try {
            const evt = c.event_types?.[eventName];
            if (evt && c.eventSource?.on) c.eventSource.on(evt, handler);
        } catch (e) {
            console.warn('[StoryMemory] event registration failed:', eventName, e);
        }
    };

    safeOn('CHAT_CHANGED', () => setTimeout(() => { installUI(); refresh(); }, 150));
    safeOn('MESSAGE_RECEIVED', () => setTimeout(async () => { refresh(); await maybeAuto(); }, 100));
    safeOn('MESSAGE_SENT', () => setTimeout(refresh, 50));
    safeOn('MESSAGE_EDITED', () => setTimeout(refresh, 50));
    safeOn('MESSAGE_DELETED', () => setTimeout(refresh, 50));
    safeOn('APP_READY', () => setTimeout(() => { installUI(); refresh(); }, 100));
    safeOn('APP_INITIALIZED', () => setTimeout(() => { installUI(); refresh(); }, 100));

    try {
        installUI();
        refresh();
        console.log('[StoryMemory] v0.10.8 loaded successfully');
    } catch (e) {
        console.error('[StoryMemory] UI initialization failed', e);
    }
}

// Compatibility boot:
// works whether SillyTavern loads this file as a classic script or as an ES module.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initializeExtension, 100), { once: true });
} else {
    setTimeout(initializeExtension, 100);
}

// Additional retries for mobile / slow-loading builds.
setTimeout(initializeExtension, 1000);
setTimeout(initializeExtension, 2500);
