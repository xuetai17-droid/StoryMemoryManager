
// ===== Story Memory Manager v0.2.3 diagnostic boot =====
// This block intentionally does NOT depend on SillyTavern.getContext().
(function SMM_DIAGNOSTIC_BOOT() {
    const ID = 'smm_diagnostic_boot_button';
    function mountDiagnostic() {
        if (!document.body || document.getElementById(ID)) return;
        const b = document.createElement('button');
        b.id = ID;
        b.textContent = 'SMM诊断';
        b.setAttribute('data-version', '0.2.3');
        Object.assign(b.style, {
            position: 'fixed',
            left: '10px',
            right: 'auto',
            bottom: '165px',
            zIndex: '2147483647',
            padding: '10px 14px',
            border: '2px solid #fff',
            borderRadius: '10px',
            background: '#d97706',
            color: '#fff',
            fontWeight: '700',
            fontSize: '14px',
            boxShadow: '0 3px 16px rgba(0,0,0,.45)'
        });
        b.onclick = () => {
            alert('Story Memory Manager v0.2.3 的 index.js 已成功加载。');
        };
        document.body.appendChild(b);
        try {
            if (window.matchMedia?.('(max-width: 800px)')?.matches ?? (window.innerWidth <= 800)) {
                b.style.display = 'none';
            }
        } catch {}
        console.log('[StoryMemory] DIAGNOSTIC BOOT v0.2.3 mounted');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountDiagnostic, { once: true });
    } else {
        mountDiagnostic();
    }
    setTimeout(mountDiagnostic, 500);
    setTimeout(mountDiagnostic, 1500);
})();


const MODULE = 'story_memory_manager_v2';
const META_KEY = 'story_memory_manager_v2';
const PANEL_ID = 'smm2_panel';
const BUTTON_ID = 'smm2_fab';

const DEFAULTS = Object.freeze({
    enabled: true,
    autoSummarize: true,
    triggerMessages: 8,
    batchMessages: 20,
    injectMemory: true,
    maxTimeline: 50,
    maxFacts: 60,
    maxEvents: 40,
    maxLoops: 30,
    storyStart: '',
    currentStoryTime: '',
    ignoreMessageTimestamps: true
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
        current_story_time: S().currentStoryTime || null,
        last_processed_index: -1,
        timeline: [],
        facts: [],
        events: [],
        characters: {},
        relationships: [],
        open_loops: [],
        locations: [],
        items: [],
        conflicts: [],
        quarantined: [],
        current_scene: {},
        audit: []
    };
}

function M() {
    const c = C();
    if (!c.chatMetadata[META_KEY]) c.chatMetadata[META_KEY] = freshMemory();
    return c.chatMetadata[META_KEY];
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

function cleanMes(m) {
    let t = String(m?.mes ?? '').trim();
    if (!t) return '';
    // Keep story content but strip common reasoning blocks if they accidentally appear in mes.
    t = t.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    return t;
}

function messagesText(start, end) {
    const chat = C().chat || [];
    return chat.slice(start, end).map((m, j) => {
        const idx = start + j;
        const who = m.is_user ? 'USER' : (m.name || 'CHARACTER');
        return `[#${idx} ${who}]\n${cleanMes(m)}`;
    }).join('\n\n');
}

function parseJSON(text) {
    let t = String(text ?? '').trim();
    t = t.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) t = t.slice(a, b+1);
    const obj = JSON.parse(t);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('返回内容不是 JSON 对象');
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
    if (Array.isArray(r.conflicts)) r.conflicts = r.conflicts.filter(x => !isMetaInstructionSignal(x));
    if (Array.isArray(r.quarantined)) r.quarantined = r.quarantined.filter(x => !isMetaInstructionSignal(x));
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

    mem.timeline = uniqMerge(mem.timeline, r.timeline, x => JSON.stringify([x.date, x.time, x.event, x.source]));
    mem.facts = uniqMerge(mem.facts, r.facts, x => JSON.stringify([x.fact, x.source]));
    mem.events = uniqMerge(mem.events, r.events, x => JSON.stringify([x.date, x.title, x.source]));
    mem.relationships = uniqMerge(mem.relationships, r.relationships, x => JSON.stringify([x.people, x.state, x.change, x.source]));
    mem.open_loops = uniqMerge(mem.open_loops, r.open_loops, x => String(x.id || x.description));
    mem.locations = uniqMerge(mem.locations, r.locations, x => JSON.stringify([x.name, x.fact]));
    mem.items = uniqMerge(mem.items, r.items, x => JSON.stringify([x.name, x.owner, x.status]));
    mem.conflicts = uniqMerge(mem.conflicts, r.conflicts, x => JSON.stringify([x.topic, x.old_value, x.new_value, x.source]));
    mem.quarantined = uniqMerge(mem.quarantined, r.quarantined, x => JSON.stringify([x.content, x.reason, x.source]));

    if (r.characters && typeof r.characters === 'object' && !Array.isArray(r.characters)) {
        for (const [name, state] of Object.entries(r.characters)) {
            mem.characters[name] = { ...(mem.characters[name] || {}), ...state };
        }
    }
    if (r.current_scene && typeof r.current_scene === 'object') {
        mem.current_scene = { ...mem.current_scene, ...r.current_scene };
    }
    // story_start is a user-controlled hard anchor. Once established it must not drift
    // because of model summaries. Model output may only fill an empty anchor.
    const lockedStart = String(S().storyStart || mem.story_start || '').trim();
    if (lockedStart) {
        mem.story_start = lockedStart;
    } else if (typeof r.story_start === 'string' && r.story_start.trim()) {
        mem.story_start = r.story_start.trim();
    }
    if (typeof r.current_story_time === 'string' && r.current_story_time.trim()) mem.current_story_time = r.current_story_time.trim();

    mem.last_processed_index = endIndex - 1;
    mem.audit.push({ at: new Date().toISOString(), processed_to: mem.last_processed_index });
    if (mem.audit.length > 50) mem.audit = mem.audit.slice(-50);

    const s = S();
    mem.timeline = mem.timeline.slice(-Math.max(10, Number(s.maxTimeline)||50));
    mem.facts = mem.facts.slice(-Math.max(10, Number(s.maxFacts)||60));
    mem.events = mem.events.slice(-Math.max(10, Number(s.maxEvents)||40));
    mem.open_loops = mem.open_loops.filter(x => String(x.status||'').toLowerCase() !== 'resolved')
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
7. USER 的元指令（要求 AI 修改/重写/续写/调整回复、OOC 指令、文风/格式/尺度/生成规则、临时写作要求）不是剧情事实：不得写入 timeline/facts/events/relationships/open_loops/conflicts/quarantined，也不得据此改写 current_story_time/current_scene。若 USER 消息同时含元指令和角色在剧情中的言行，只忽略元指令部分，保留真实剧情内容。
8. “角色在剧情中改变主意/规则/约定”属于剧情事实；“用户要求模型把上一回复改成另一版本”属于元指令。必须区分二者。
9. 只记录对后续连续性有价值的信息。闲聊、重复描写、纯修辞可省略。
10. relationships 只记录文本已经支持的关系状态，不擅自把暧昧升级成恋爱/伴侣。
11. open_loops 保存约定、任务、秘密、待处理矛盾、明确的未来约会。
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
                open_loops:{type:'array',items:{type:'object',properties:{
                    id:{type:'string'}, description:{type:'string'}, status:{type:'string'}, due:nullable()
                },required:['id','description','status','due']}},
                locations:{type:'array',items:{type:'object',properties:{
                    name:{type:'string'}, fact:{type:'string'}
                },required:['name','fact']}},
                items:{type:'array',items:{type:'object',properties:{
                    name:{type:'string'}, owner:nullable(), status:{type:'string'}
                },required:['name','owner','status']}},
                conflicts:{type:'array',items:{type:'object',properties:{
                    topic:{type:'string'}, old_value:{type:'string'}, new_value:{type:'string'}, source:nullable()
                },required:['topic','old_value','new_value','source']}},
                quarantined:{type:'array',items:{type:'object',properties:{
                    content:{type:'string'}, reason:{type:'string'}, source:nullable()
                },required:['content','reason','source']}}
            },
            required:['story_start','current_story_time','current_scene','timeline','facts','events','characters',
                      'relationships','open_loops','locations','items','conflicts','quarantined']
        }
    };
}

function compact(mem) {
    const s = S();
    return {
        story_start: mem.story_start,
        current_story_time: mem.current_story_time,
        current_scene: mem.current_scene,
        timeline: mem.timeline.slice(-Math.min(30, Number(s.maxTimeline)||50)),
        facts: mem.facts.slice(-40),
        events: mem.events.slice(-25),
        characters: mem.characters,
        relationships: mem.relationships.slice(-25),
        open_loops: mem.open_loops.slice(-25),
        conflicts: mem.conflicts.slice(-15),
        quarantined: mem.quarantined.slice(-10)
    };
}

async function summarizeRange(start, end) {
    const c = C();
    const mem = M();
    const prompt = `【已有可靠记忆】
${JSON.stringify(compact(mem), null, 2)}

【新增原始聊天】
${messagesText(start, end)}

请只从“新增原始聊天”更新记忆。source 使用 #消息编号。旧记忆只用于对照，不允许把旧记忆中尚未发生的未来内容变成事实。
特别检查日期连续性：没有新增原始聊天中的明确跨月证据，就必须继承已有可靠月份；禁止仅凭 AI <date> 或自行推算跨月。`;
    let raw;
    try {
        raw = await c.generateRaw({ systemPrompt:SYSTEM_PROMPT, prompt, jsonSchema:schema() });
        let r = filterMetaSignals(parseJSON(raw));
        mergeResult(mem, r, end);
    } catch (e) {
        // Fallback for models/backends without structured output.
        raw = await c.generateRaw({
            systemPrompt:SYSTEM_PROMPT,
            prompt: prompt + '\n\n请严格返回合法 JSON，字段必须包含 story_start,current_story_time,current_scene,timeline,facts,events,characters,relationships,open_loops,locations,items,conflicts,quarantined。'
        });
        let r = filterMetaSignals(parseJSON(raw));
        mergeResult(mem, r, end);
    }
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
时间规则：用户正文明确时间 > 相对时间推进 > 连续事件 > AI的<date>；禁止使用酒馆楼层发送时间作为剧情时间。
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
    const s = S();
    if (!s.enabled || !s.injectMemory) return;
    if (type === 'quiet') return; // Don't inject memory into the memory summarizer itself.
    const mem = M();
    if (!mem || (mem.last_processed_index < 0 && !mem.current_story_time)) return;

    const item = {
        name: 'Story Memory',
        is_user: false,
        is_system: true,
        mes: memoryForPrompt(),
        send_date: Date.now(),
        extra: { story_memory_manager_transient: true }
    };
    const pos = Math.max(0, chat.length - 1);
    chat.splice(pos, 0, item);

    const cleanup = () => {
        const idx = chat.indexOf(item);
        if (idx >= 0) chat.splice(idx,1);
    };

    // Allow synchronous prompt construction after interceptors to see the item,
    // then clean the mutable chat array promptly.
    setTimeout(cleanup, 750);

    try {
        const c = C();
        const done = () => {
            cleanup();
            c.eventSource.removeListener(c.event_types.GENERATION_ENDED, done);
            c.eventSource.removeListener(c.event_types.GENERATION_STOPPED, done);
        };
        c.eventSource.on(c.event_types.GENERATION_ENDED, done);
        c.eventSource.on(c.event_types.GENERATION_STOPPED, done);
    } catch {}
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
        <div class="smm2-head"><b>剧情自动记忆</b><button id="smm2_close">×</button></div>
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
        <label><input id="smm2_inject" type="checkbox"> 生成时自动注入记忆</label>
        <label><input id="smm2_auto" type="checkbox"> 自动增量总结</label>
        <label>每 <input id="smm2_trigger" type="number" min="1" max="50"> 条新消息总结一次</label>
        <label>每批最多 <input id="smm2_batch" type="number" min="4" max="60"> 条消息</label>
        <label>剧情起点（建立记忆后自动锁定）<input id="smm2_start" type="text" placeholder="如 2025-09-10"></label>
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
    if (box?.dataset.open === '1') box.innerHTML = memoryReadableHTML();

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
    const end = isoDateFromAny(m.current_story_time);
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
    const raw = String(name || '').trim();
    if (!raw) return '未命名人物';
    const compact = raw.toLowerCase().replace(/[·•.\s_'’\-]/g,'');
    // Known bilingual alias already present in this chat's rebuilt memory.
    if (compact === 'xueling' || raw === '薛伶') return '薛伶';
    return raw;
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
    const text = `${x?.description || ''} ${x?.due || ''} ${x?.status || ''}`;
    const now = isoDateFromAny(M().current_story_time);
    const due = isoDateFromAny(x?.due);
    if (due && now && due < now) return 'overdue';
    if (/明天|明日|后天|约定|预约|会面|课程|上课|计划|等待.*时间/i.test(text) || due) return 'future';
    if (/正在|尚未结束|继续|进行中|等待回应|尚未回答|未正面回答/i.test(text)) return 'active';
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
            <option value="loop">未完成事项</option>
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
    for (const x of (m.open_loops||[])) {
        out.push({type:'loop', label:cleanLoopTitle(x), text:`${x.due||''} ${x.description||''}`, raw:x});
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

function memoryReadableHTML() {
    const m = M();
    const backtrackCount = countStoredTimeBacktracks(m.timeline || []);
    const timeline = dailyTimelineHTML(m.timeline || []);
    const audit = dateRangeAudit();

    const missing = audit.days.length
        ? `<div class="smm2-date-audit">
             <b>日期完整性：</b>${audit.start} → ${audit.end}　
             有记录 ${audit.days.length-audit.missing.length} 天 / 共 ${audit.days.length} 天
             ${audit.missing.length
                ? `<details><summary>⚠ ${audit.missing.length} 个无记录日期（仅提示，不自动编造剧情）</summary>
                    <div class="smm2-missing-days">${audit.missing.map(x=>`<span>${esc(x.key)}</span>`).join('')}</div>
                   </details>`
                : `<span>✓ 未发现缺失日期</span>`}
           </div>`
        : `<div class="smm2-date-audit">日期完整性：需要有效的剧情起点和当前剧情日期后才能检查。</div>`;

    const characters = mergedCharactersView().map(g => {
        const aliases = [...g.aliases];
        const merged = Object.assign({}, ...g.states.filter(x=>x && typeof x==='object'));
        return `<details class="smm2-memory-details smm2-person-card">
            <summary>${esc(g.name)}</summary>
            ${aliases.length ? `<div class="smm2-alias">别名：${esc(aliases.join(' / '))}</div>` : ''}
            <pre>${esc(JSON.stringify(merged, null, 2))}</pre>
         </details>`;
    }).join('') || '<div class="smm2-empty">暂无人物档案</div>';

    const relationships = mergedRelationshipsView().map(g => {
        const latest = g.history[g.history.length-1] || {};
        const history = g.history.map(x =>
            `<div class="smm2-relation-history">${esc(x.state || '')}${x.change ? '｜'+esc(x.change) : ''}</div>`
        ).join('');
        return `<details class="smm2-memory-details smm2-relation-card">
          <summary>${esc(g.key)}</summary>
          <div><b>当前：</b>${esc(latest.state || '未确定')}</div>
          ${g.history.length > 1 ? `<details><summary>关系发展 ${g.history.length} 条</summary>${history}</details>` : history}
        </details>`;
    }).join('') || '<div class="smm2-empty">暂无关系记录</div>';

    const loopGroups=mergedOpenLoopsView();
    const loopBlock=(title, arr) => arr.length ? `
        <details class="smm2-loop-group" open>
          <summary>${title} <span>${arr.length}</span></summary>
          ${arr.map(x=>`<div class="smm2-memory-item">
              <b>${esc(cleanLoopTitle(x))}</b>${x.due ? `｜${esc(x.due)}` : ''}<br>
              ${esc(x.description || '')}
          </div>`).join('')}
        </details>` : '';
    const loops = [
        loopBlock('待办 / 未来事件',loopGroups.future),
        loopBlock('当前进行中的剧情',loopGroups.active),
        loopBlock('悬而未决',loopGroups.unresolved),
        loopBlock('过期 / 待确认',loopGroups.overdue)
    ].join('') || '<div class="smm2-empty">暂无未完成事项</div>';

    const conflicts = [
        ...(m.conflicts || []).map(x => ({title:'冲突', body: JSON.stringify(x)})),
        ...(m.quarantined || []).map(x => ({title:'隔离', body: JSON.stringify(x)}))
    ].map(x =>
        `<div class="smm2-memory-item smm2-memory-warning"><b>${esc(x.title)}</b><br>${esc(x.body)}</div>`
    ).join('') || '<div class="smm2-empty">暂无冲突/隔离记忆</div>';

    return `
      <div class="smm2-memory-view">
        <div class="smm2-memory-top">
          <div><b>剧情起点：</b>${esc(m.story_start || S().storyStart || '未建立')} <span class="smm2-lock">🔒 锁定</span></div>
          <div><b>当前剧情时间：</b>${esc(m.current_story_time || '未建立')}</div>
          <div><b>已处理到：</b>${Math.max(0, Number(m.last_processed_index ?? -1) + 1)} 条</div>
          <div><b>时间线显示：</b>同一天合并显示，日期与时间自动排序</div>
          ${backtrackCount ? `<div class="smm2-memory-warning-text"><b>原始写入顺序存在 ${backtrackCount} 处时间倒退</b>；查看时已自动整理，不会改动原事件。</div>` : ''}
          ${missing}
        </div>

        ${historyBrowserHTML()}

        <details open class="smm2-memory-details">
          <summary>当前场景</summary>
          <pre>${esc(JSON.stringify(m.current_scene || {}, null, 2))}</pre>
        </details>

        <details open class="smm2-memory-details">
          <summary>时间线</summary>
          ${timeline}
        </details>

        <details class="smm2-memory-details">
          <summary>人物（${mergedCharactersView().length}）</summary>
          ${characters}
        </details>

        <details class="smm2-memory-details">
          <summary>人物关系（${mergedRelationshipsView().length}）</summary>
          ${relationships}
        </details>

        <details open class="smm2-memory-details">
          <summary>未完成事项</summary>
          ${loops}
        </details>

        <details open class="smm2-memory-details">
          <summary>冲突 / 隔离</summary>
          ${conflicts}
        </details>

        <button id="smm2_raw_json" class="menu_button">查看原始 JSON</button>
      </div>
    `;
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
    bindHistoryBrowser();

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

async function continueHistoryRebuild() {
    if (HISTORY_RUNNING) {
        toast('历史重建已经在运行。', 'info');
        return;
    }
    if (BUSY) {
        toast('当前有另一项总结任务正在运行，请稍后再试。', 'warning');
        return;
    }

    const chat = C().chat || [];
    const mem = M();
    let start = Math.max(0, Number(mem.last_processed_index ?? -1) + 1);

    if (start >= chat.length) {
        toast('整条聊天已经处理完成。', 'success');
        return;
    }

    HISTORY_RUNNING = true;
    HISTORY_STOP_REQUESTED = false;
    BUSY = true;

    // Critical mobile fix: show RUNNING before waiting for the first model call.
    refreshNative();
    toast(`历史重建已启动：从第 ${start + 1} 条继续。第一批正在总结，请等待模型返回。`, 'success');

    let baselineConflictCount = countTrueConflicts();

    try {
        while (start < chat.length && !HISTORY_STOP_REQUESTED) {
            const batch = Math.max(4, Number(S().batchMessages) || 20);
            const end = Math.min(chat.length, start + batch);

            const stats = document.getElementById('smm2_native_stats');
            if (stats) {
                const st = stat();
                stats.innerHTML =
                    `剧情时间：<b>${esc(st.time)}</b><br>` +
                    `已处理：${st.done}/${st.total}　待总结：${st.pending}<br>` +
                    `事件：${st.events}　未完成：${st.loops}　冲突/隔离：${st.conflicts}<br>` +
                    `历史重建：<b>运行中</b><br>` +
                    `正在处理：第 ${start + 1}–${end} 条`;
            }

            await summarizeRange(start, end);

            // Trust persisted memory index instead of only the local counter.
            start = Math.max(end, Number(M().last_processed_index ?? end - 1) + 1);

            refresh();
            refreshNative();

            const newConflictCount = countTrueConflicts();
            if (newConflictCount > baselineConflictCount) {
                HISTORY_STOP_REQUESTED = true;
                toast('检测到新的剧情事实冲突，历史重建已自动暂停。隔离项不会触发暂停。请先查看记忆。', 'warning');
                break;
            }
            baselineConflictCount = newConflictCount;

            await new Promise(resolve => setTimeout(resolve, 300));
        }

        if (!HISTORY_STOP_REQUESTED && start >= chat.length) {
            toast('历史聊天重建完成。', 'success');
        } else if (HISTORY_STOP_REQUESTED) {
            toast('历史重建已暂停。', 'info');
        }
    } catch (e) {
        console.error('[StoryMemory] history rebuild failed', e);
        toast(`历史重建失败：${e.message || e}`, 'error');
    } finally {
        HISTORY_RUNNING = false;
        BUSY = false;
        refreshNative();
    }
}

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

      <div class="smm2-native-grid">
        <button id="smm2_native_new" class="menu_button">总结新增</button>
        <button id="smm2_native_history" class="menu_button">继续历史重建</button>
        <button id="smm2_native_stop" class="menu_button">暂停历史重建</button>
        <button id="smm2_native_rebuild" class="menu_button">从头重扫整条聊天</button>
        <button id="smm2_native_import" class="menu_button">导入记忆 JSON</button>
        <button id="smm2_native_export" class="menu_button">导出记忆 JSON</button>
        <button id="smm2_native_view" class="menu_button">查看/收起记忆</button>
        <button id="smm2_native_clear" class="menu_button">清空本聊天记忆</button>
      </div>

      <div id="smm2_native_memory_box" data-open="0"></div>

      <details class="smm2-tool-card smm2-time-fix">
        <summary>
          <span class="smm2-tool-title">时间修正</span>
          <span class="smm2-tool-subtitle">修正错误剧情日期</span>
        </summary>
        <div class="smm2-tool-body">
          <div class="smm2-note">只修正插件记忆，不修改原聊天。历史重建暂停后再执行。</div>

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

      <div class="smm2-native-settings">
        <label><input id="smm2_native_enabled" type="checkbox"> 启用插件</label>
        <label><input id="smm2_native_inject" type="checkbox"> 生成时自动注入记忆</label>
        <label><input id="smm2_native_auto" type="checkbox"> 自动增量总结</label>

        <label>
          每
          <input id="smm2_native_trigger" type="number" min="1" max="50">
          条新消息总结一次
        </label>

        <label>
          每批最多
          <input id="smm2_native_batch" type="number" min="4" max="60">
          条消息
        </label>

        <label>
          剧情起点（建立记忆后自动锁定）
          <input id="smm2_native_start" type="text" placeholder="如 2025-09-10">
        </label>

        <div class="smm2-note">
          记忆按“聊天”隔离。同一角色开新聊天，也会得到另一套记忆。
          酒馆楼层发送时间不作为剧情时间。
        </div>
      </div>
    `;
}

function bindNativeManager() {
    const q = id => document.getElementById(id);
    if (!q('smm2_native_new')) return;

    q('smm2_native_new').onclick = () => summarizeNew(true);
    q('smm2_native_history').onclick = continueHistoryRebuild;
    q('smm2_native_stop').onclick = stopHistoryRebuild;
    q('smm2_native_rebuild').onclick = rebuildAll;
    q('smm2_native_import').onclick = importMemory;
    q('smm2_native_export').onclick = exportMemory;
    q('smm2_native_clear').onclick = clearMemory;

    q('smm2_native_view').onclick = toggleReadableMemory;
    q('smm2_native_fix_time').onclick = correctMemoryDate;

    const s = S();

    q('smm2_native_enabled').onchange = e => {
        s.enabled = e.target.checked;
        saveSettings();
        refreshNative();
    };

    q('smm2_native_inject').onchange = e => {
        s.injectMemory = e.target.checked;
        saveSettings();
    };

    q('smm2_native_auto').onchange = e => {
        s.autoSummarize = e.target.checked;
        saveSettings();
    };

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

    const s = S(), st = stat();
    stats.innerHTML =
        `剧情时间：<b>${esc(st.time)}</b><br>` +
        `已处理：${st.done}/${st.total}　待总结：${st.pending}<br>` +
        `事件：${st.events}　未完成：${st.loops}　冲突/隔离：${st.conflicts}<br>` +
        `历史重建：<b>${HISTORY_RUNNING ? '运行中' : '已暂停/未运行'}</b>`;

    const setChecked = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.checked = !!val;
    };
    const setValue = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val ?? '';
    };

    setChecked('smm2_native_enabled', s.enabled);
    setChecked('smm2_native_inject', s.injectMemory);
    setChecked('smm2_native_auto', s.autoSummarize);
    setValue('smm2_native_trigger', s.triggerMessages);
    setValue('smm2_native_batch', s.batchMessages);
    setValue('smm2_native_start', s.storyStart);
}

function installNativeExtensionEntry() {
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
            <b>剧情自动记忆</b>
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
    $('smm2_inject').onchange=e=>{s.injectMemory=e.target.checked;saveSettings();};
    $('smm2_auto').onchange=e=>{s.autoSummarize=e.target.checked;saveSettings();};
    $('smm2_trigger').onchange=e=>{s.triggerMessages=Math.max(1,Number(e.target.value)||8);saveSettings();};
    $('smm2_batch').onchange=e=>{s.batchMessages=Math.max(4,Number(e.target.value)||20);saveSettings();};
    $('smm2_start').onchange=e=>{
        s.storyStart=e.target.value.trim(); saveSettings();
        const m=M(); if (m.last_processed_index<0) {m.story_start=s.storyStart||null;saveMeta();}
    };
}

function refresh() {
    refreshNative();
    if (!document.getElementById(PANEL_ID)) return;
    const s=S(), st=stat();
    document.getElementById('smm2_stats').innerHTML =
        `剧情时间：<b>${esc(st.time)}</b><br>已处理：${st.done}/${st.total}　待总结：${st.pending}<br>事件：${st.events}　未完成：${st.loops}　冲突/隔离：${st.conflicts}`;
    document.getElementById('smm2_enabled').checked=!!s.enabled;
    document.getElementById('smm2_inject').checked=!!s.injectMemory;
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
        console.log('[StoryMemory] v0.2.2 loaded successfully');
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
