
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

function mergeResult(mem, r, endIndex) {
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
    if (typeof r.story_start === 'string' && r.story_start.trim()) mem.story_start = r.story_start.trim();
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
4. 不得把尚未在“新增原始聊天”中发生的预测、计划、旧总结预告写成已发生事实。
5. 角色的猜测、医学推断、心理推测等，不可直接升级成事实。
6. 与已有记忆冲突时，写入 conflicts；明显错误/超前记忆写入 quarantined。
7. 只记录对后续连续性有价值的信息。闲聊、重复描写、纯修辞可省略。
8. relationships 只记录文本已经支持的关系状态，不擅自把暧昧升级成恋爱/伴侣。
9. open_loops 保存约定、任务、秘密、待处理矛盾、明确的未来约会。
10. 必须输出 JSON 对象，不要输出 Markdown。`;

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

请只从“新增原始聊天”更新记忆。source 使用 #消息编号。旧记忆只用于对照，不允许把旧记忆中尚未发生的未来内容变成事实。`;
    let raw;
    try {
        raw = await c.generateRaw({ systemPrompt:SYSTEM_PROMPT, prompt, jsonSchema:schema() });
        let r = parseJSON(raw);
        mergeResult(mem, r, end);
    } catch (e) {
        // Fallback for models/backends without structured output.
        raw = await c.generateRaw({
            systemPrompt:SYSTEM_PROMPT,
            prompt: prompt + '\n\n请严格返回合法 JSON，字段必须包含 story_start,current_story_time,current_scene,timeline,facts,events,characters,relationships,open_loops,locations,items,conflicts,quarantined。'
        });
        let r = parseJSON(raw);
        mergeResult(mem, r, end);
    }
    await saveMeta();
}

let BUSY = false;

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
        <label>新聊天剧情起点（可空）<input id="smm2_start" type="text" placeholder="如 2025-09-10 / 架空历法"></label>
        <div class="smm2-note">记忆按“聊天”隔离。同一角色开新聊天，也会得到另一套记忆。酒馆楼层时间不会作为剧情时间。</div>
      </div>
    </div>`;
}



function nativeManagerHTML() {
    return `
      <div id="smm2_native_stats" class="smm2-stats"></div>

      <div class="smm2-native-grid">
        <button id="smm2_native_new" class="menu_button">总结新增</button>
        <button id="smm2_native_rebuild" class="menu_button">重扫整条聊天</button>
        <button id="smm2_native_import" class="menu_button">导入记忆 JSON</button>
        <button id="smm2_native_export" class="menu_button">导出记忆 JSON</button>
        <button id="smm2_native_view" class="menu_button">查看记忆</button>
        <button id="smm2_native_clear" class="menu_button">清空本聊天记忆</button>
      </div>

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
          新聊天剧情起点（可空）
          <input id="smm2_native_start" type="text" placeholder="如 2025-09-10 / 架空历法">
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
    q('smm2_native_rebuild').onclick = rebuildAll;
    q('smm2_native_import').onclick = importMemory;
    q('smm2_native_export').onclick = exportMemory;
    q('smm2_native_clear').onclick = clearMemory;

    q('smm2_native_view').onclick = () => {
        const text = JSON.stringify(M(), null, 2);
        const w = window.open('', '_blank');
        if (!w) return toast('浏览器阻止了弹窗。', 'warning');
        w.document.write(`<pre style="white-space:pre-wrap;font-family:monospace">${esc(text)}</pre>`);
    };

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
        s.storyStart = e.target.value.trim();
        saveSettings();
        const m = M();
        if (m.last_processed_index < 0 || !m.story_start) {
            m.story_start = s.storyStart || null;
            await saveMeta();
        }
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
        `事件：${st.events}　未完成：${st.loops}　冲突/隔离：${st.conflicts}`;

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
