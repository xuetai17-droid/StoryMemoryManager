
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
        current_story_date: null,
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
    if(/凌晨|半夜/.test(s)) return 120;
    if(/清晨|早晨|早上/.test(s)) return 420;
    if(/上午/.test(s)) return 600;
    if(/中午/.test(s)) return 720;
    if(/下午/.test(s)) return 900;
    if(/傍晚/.test(s)) return 1080;
    if(/晚上|晚间|深夜/.test(s)) return 1260;
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
 * v0.5.9 夜间归属修正：
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
    const blob=`${e?.date||''} ${e?.time||''} ${e?.event||''}`;
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
function rebuildDatesBySourceAxis(mem=M()) {
    const rows=(mem.timeline||[]).map((e,i)=>({
        ...e,
        __i:i,
        __src:sourceFirst(e.source),
        __clock:parseStoryClock(e.time),
        __oldDate:isoDateFromAny(e.date),
        __explicitDate:explicitDateFromEvent(e)
    })).sort((a,b)=>(a.__src-b.__src)||(a.__i-b.__i));

    if(!rows.length) return {
        changed:0,midnight_rollovers:0,explicit_overrides:0,diagnostics:[]
    };

    const diagnostics=[];
    let changed=0, midnightRollovers=0, explicitOverrides=0;

    const storyStart = normalizeDateInput(mem.story_start||S().storyStart)?.iso || null;

    function isEarlyNight(r){
        const blob=`${r.time||''} ${r.event||''}`;
        if(r.__clock!=null && r.__clock <= 5*60) return true;
        return /凌晨|半夜|午夜后|零点后|清晨0[0-5]?[:：]?/.test(blob);
    }
    function isLateNight(r){
        const blob=`${r.time||''} ${r.event||''}`;
        if(r.__clock!=null && r.__clock >= 21*60) return true;
        return /晚间|深夜|晚上|夜间/.test(blob) && !/凌晨|半夜/.test(blob);
    }
    function isMorningOrDay(r){
        const blob=`${r.time||''} ${r.event||''}`;
        if(r.__clock!=null && r.__clock >= 6*60 && r.__clock < 21*60) return true;
        return /早晨|早上|上午|中午|下午|傍晚/.test(blob);
    }

    // Find a reasonable initial date from the earliest row's soft date, else story start.
    let currentDate = rows.find(r=>r.__oldDate)?.__oldDate || storyStart;
    let prev = null;
    let justRolledAtSource = null;

    for(const r of rows){
        const oldDate = r.__oldDate;
        const explicit = r.__explicitDate;

        // 1) Explicit absolute date in event/time text wins.
        if(explicit){
            if(currentDate !== explicit){
                diagnostics.push({
                    type:'explicit_date_override',
                    source:r.source,
                    content:`${currentDate||'无日期'} → ${explicit}`,
                    reason:'事件文本包含明确绝对日期'
                });
                explicitOverrides++;
            }
            currentDate = explicit;
            justRolledAtSource = null;
        }
        // 2) Explicit relative next-day cue advances once.
        else if(currentDate && hasStrongNextDayCue(r) && !hasStrongSameDayCue(r)){
            currentDate = addDaysISO(currentDate,1) || currentDate;
            midnightRollovers++;
            justRolledAtSource = r.__src;
            diagnostics.push({
                type:'relative_next_day_rollover',
                source:r.source,
                content:`推进至 ${currentDate}`,
                reason:'检测到“次日/第二天/翌日/隔天”等明确跨日语义'
            });
        }
        // 3) Source-order state machine:
        // late night -> early morning means a single midnight crossing.
        else if(currentDate && prev && isLateNight(prev) && isEarlyNight(r)){
            currentDate = addDaysISO(currentDate,1) || currentDate;
            midnightRollovers++;
            justRolledAtSource = r.__src;
            diagnostics.push({
                type:'midnight_state_rollover',
                source:r.source,
                content:`${prev.time||'晚间'} → ${r.time||'凌晨'}；推进至 ${currentDate}`,
                reason:'source 连续剧情由晚间/深夜进入凌晨，判定跨过午夜'
            });
        }

        // 4) Important guard:
        // after a rollover into early morning, later daytime/evening remains SAME DATE.
        // Do not advance again merely because clock increases from early morning to 22:00.
        if(currentDate){
            if(oldDate !== currentDate){
                changed++;
                diagnostics.push({
                    type:'date_reassigned_by_midnight_state',
                    source:r.source,
                    content:`${oldDate||'无日期'} → ${currentDate}`,
                    reason:'按 source 顺序和跨午夜状态机重新归属日期'
                });
            }
            r.date = currentDate;
        } else if(oldDate){
            currentDate = oldDate;
            r.date = oldDate;
        } else if(storyStart){
            currentDate = storyStart;
            r.date = storyStart;
            changed++;
        }

        // 5) Clock regression diagnostics only; never reorder source.
        if(prev && r.date===prev.date && prev.__clock!=null && r.__clock!=null &&
           r.__src>=prev.__src && r.__clock < prev.__clock &&
           !(isLateNight(prev) && isEarlyNight(r)) &&
           !/回忆|此前|过去|之前/.test(`${r.event||''}`)){
            diagnostics.push({
                type:'clock_text_conflict',
                source:r.source,
                content:`source ${prev.source||''} → ${r.source||''}; 时间 ${prev.time||''} → ${r.time||''}`,
                reason:'同日时间文本倒退，但不满足跨午夜条件；保留 source 顺序'
            });
        }

        prev = r;
    }

    mem.timeline=rows.map(({__i,__src,__clock,__oldDate,__explicitDate,...e})=>e);
    mem.source_axis={
        version:'0.5.9',
        at:new Date().toISOString(),
        changed,
        midnight_rollovers:midnightRollovers,
        explicit_overrides:explicitOverrides,
        diagnostics:diagnostics.slice(-200)
    };
    return mem.source_axis;
}
function calibrateTimeline(mem=M(), {allowCrossMidnight=true}={}) {
    const input=Array.isArray(mem.timeline)?mem.timeline:[];
    const rows=input.map((e,i)=>({...e,__i:i,__src:sourceFirst(e.source),__last:sourceLast(e.source),__clock:parseStoryClock(e.time)}));

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
        const ca=parseStoryClock(a.time), cb=parseStoryClock(b.time);
        if(ca!=null && cb!=null && ca!==cb) return ca-cb;
        return 0;
    });

    mem.timeline_calibration={
        version:'0.5.9',
        at:new Date().toISOString(),
        duplicate_merged:duplicateMerged,
        date_reassigned:Number(axis.changed||0),
        date_islands_fixed:0,
        explicit_date_overrides:Number(axis.explicit_overrides||0),
        confirmed_rollovers:Number(axis.midnight_rollovers||0),
        ordering:'source_first_date_axis',
        diagnostics:(axis.diagnostics||[]).slice(-150)
    };
    return mem.timeline_calibration;
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
    if (typeof r.current_story_date === 'string' && r.current_story_date.trim()) {
        const d = normalizeDateInput(r.current_story_date.trim());
        if (d) mem.current_story_date = d.iso;
    }
    if (typeof r.current_story_time === 'string' && r.current_story_time.trim()) mem.current_story_time = r.current_story_time.trim();

    calibrateTimeline(mem, {allowCrossMidnight:true});

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
        current_story_date: mem.current_story_date || isoDateFromAny(mem.current_story_time),
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

async function summarizeRange(start, end) {
    const c = C();
    const mem = M();
    const prompt = `【已有可靠记忆】
${JSON.stringify(compact(mem), null, 2)}

【新增原始聊天】
${messagesText(start, end)}

请只从“新增原始聊天”更新记忆。source 使用 #消息编号。旧记忆只用于对照，不允许把旧记忆中尚未发生的未来内容变成事实。
【v4数据规范】
- 必须单独输出 current_story_date，格式严格为 YYYY-MM-DD；这是机器计算使用的绝对剧情日期。
- current_story_time 可以保留“秋季学期 周X HH:MM”作为显示时间，但不能代替 current_story_date。
- 时间线必须尽量给出具体 YYYY-MM-DD；“秋季学期/周五/上午”只能作为附加描述，不能替代日期。
- 人物资料分稳定资料与当前状态。地点、衣着、陪伴者、身体状态属于当前状态，后文更新时覆盖，不要不断堆成数组。
- 人物别名必须归一；同一人物不得因中英文名/昵称拆成多个实体。
- 人物关系只有在明确两个人之间存在关系时才记录；多人同场、群体互动不得自动生成多边关系链。
- open_loops / 未完成事项采用严格模式：只有明确未来承诺、预约、任务且尚未发生的事项才保留。
- “正在进行”“尚未回答”“等待回应”“关系确认”“已经完成的性行为/课程/会面/讨论”都不能长期留作未来待办。
- timeline 中同一段剧情只能保留一条主事件；如果多条消息只是补充同一事件，请合并为一条并合并 source，不要重复写近义事件。
- source 对应原始聊天顺序，是同一天内剧情先后的最高优先级证据。禁止因为摘要中的 22:00、22:30 等时间文本而把后出现的 source 移到前面。
- 如果 source 顺序与时间文本冲突，保留 source 顺序，并在时间字段中谨慎描述；不要为了“钟点看起来顺”而改剧情先后。
- 日期归属同样服从 source 连续性。禁止仅因为出现“凌晨”“半夜”就自动进入下一天。
- 只有明确绝对日期、明确“次日/第二天/翌日/隔天”，或正文明确描述跨过午夜/零点，才允许日期推进。
- 若 #71-#79 位于 #80 之前，即使 #71 摘要写“凌晨”、#80 写“晚间22:00”，也不得仅凭钟点把 #71-#79 推到下一日。
- 若 source 连续顺序出现“晚间/深夜 → 凌晨/半夜”，视为跨过午夜并推进一天；推进后，后续上午/下午/晚间仍保持该新日期，除非再次出现新的明确跨午夜证据。
- 同一 source 序列中只允许在真实的“晚间/深夜 → 凌晨/半夜”边界处推进日期，不能因为“凌晨 → 晚间”再次加一天。
- 若前一事件为深夜/23点后，后续原始消息明确出现“凌晨/半夜/次日/第二天”，必须把日期推进到下一天，不能继续挂在前一天。
- 如果正文是在回忆过去，timeline 可记录过去日期，但 current_story_date 不得倒退。
- 如果后文已经完成某事项，必须删除/关闭对应 open_loop，不得重复保留。
特别检查日期连续性：没有新增原始聊天中的明确跨月证据，就必须继承已有可靠月份；禁止仅凭 AI <date> 或自行推算跨月。`;
    let raw;
    try {
        raw = await withSmmTimeout(c.generateRaw({ systemPrompt:SYSTEM_PROMPT, prompt, jsonSchema:schema() }), SMM_GENERATE_TIMEOUT_MS, `结构化总结 #${start+1}-#${end}`);
        let r = filterMetaSignals(parseJSON(raw));
        mergeResult(mem, r, end);
    } catch (e) {
        if (isSmmTimeout(e)) throw e;
        // Fallback for models/backends without structured output.
        raw = await withSmmTimeout(c.generateRaw({
            systemPrompt:SYSTEM_PROMPT,
            prompt: prompt + '\n\n请严格返回合法 JSON，字段必须包含 story_start,current_story_date,current_story_time,current_scene,timeline,facts,events,characters,relationships,open_loops,locations,items,conflicts,quarantined。'
        }), SMM_GENERATE_TIMEOUT_MS, `兼容总结 #${start+1}-#${end}`);
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
    return new Map([
        ['xueling','薛伶'],
        ['薛伶','薛伶'],
        ['deioncarter','迪恩·卡特'],
        ['迪恩卡特','迪恩·卡特'],
        ['迪恩·卡特','迪恩·卡特'],
        ['colebrady','科尔·布雷迪'],
        ['科尔布雷迪','科尔·布雷迪'],
        ['科尔·布雷迪','科尔·布雷迪'],
        ['nicosolano','尼科·索拉诺'],
        ['尼科索拉诺','尼科·索拉诺'],
        ['尼科·索拉诺','尼科·索拉诺'],
        ['jacksonobrien','杰克森·奥布莱恩'],
        ['杰克森奥布莱恩','杰克森·奥布莱恩'],
        ['杰克森·奥布莱恩','杰克森·奥布莱恩'],
        ['eliasvolkov','伊利亚·沃尔科夫'],
        ['伊利亚沃尔科夫','伊利亚·沃尔科夫'],
        ['伊利亚·沃尔科夫','伊利亚·沃尔科夫'],
        ['olivergrey','奥利弗·格雷'],
        ['奥利弗格雷','奥利弗·格雷'],
        ['奥利弗·格雷','奥利弗·格雷'],
        ['verasong','薇拉·宋'],
        ['薇拉宋','薇拉·宋'],
        ['薇拉·宋','薇拉·宋']
    ]);
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
    let m = s.match(/<date>\s*(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日\s*<\/date>/i);
    if (!m) m = s.match(/<date>\s*(20\d{2})[-\/](\d{1,2})[-\/](\d{1,2})\s*<\/date>/i);
    if (!m) return null;
    return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
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
    const archived = [];

    for (const t of (mem.tasks_v4 || [])) {
        const text = `${t.title||''} ${t.due||''} ${t.description||''}`;
        const due = isoDateFromAny(t.due);

        // This chat has one user-confirmed unresolved appointment:
        // Vera meeting. Preserve it unless later explicitly resolved.
        const isVeraMeeting = /薇拉|vera/i.test(text) && /会面|见面|KKI|KKT/i.test(text);

        const clearlyPast = !!(due && current && due < current);
        const historicalState = /确立.*关系|已经|已完成|完成性|已结束|发生第一次|今晚.*性行为|游泳课|游泳练习|学习海豚打腿/i.test(text);

        if (isVeraMeeting && !/已会面|会面完成|已取消|取消会面/i.test(text)) {
            kept.push({...t, status:'pending'});
        } else if (clearlyPast || historicalState || !isVeraMeeting) {
            archived.push({...t, status:'archived_by_v041'});
        } else {
            kept.push(t);
        }
    }

    if (archived.length) {
        mem.quarantined = Array.isArray(mem.quarantined) ? mem.quarantined : [];
        mem.quarantined.push(...archived.map(t => ({
            type:'legacy_task_archived',
            reason:'v0.5.9 严格待办清洗：非用户确认的真实未来待办，移出待办区',
            task:t
        })));
    }
    mem.tasks_v4 = kept;
    return {kept:kept.length, archived:archived.length};
}

async function repairTimeBaselineV041() {
    if (HISTORY_RUNNING || BUSY) {
        toast('请先暂停历史重建，等待当前请求结束。','warning');
        return;
    }
    const mem = M();
    if (mem.schema !== SMM4_SCHEMA) {
        toast('请先执行 v4 数据重构。','warning');
        return;
    }

    const startEl = document.getElementById('smm41_story_start');
    const dateEl = document.getElementById('smm41_current_date');
    const start = normalizeDateInput(startEl?.value || '2025-09-10');
    const detected = detectCurrentDateFromRecentChat();
    const cur = normalizeDateInput(dateEl?.value || detected?.date || '');

    if (!start) return toast('剧情起点格式必须为 YYYY-MM-DD。','warning');
    if (!cur) return toast('当前剧情日期无法自动识别，请手动填写 YYYY-MM-DD。','warning');

    const backupKey = `${META_KEY}_pre_v041_time_repair`;
    C().chatMetadata[backupKey] = JSON.parse(JSON.stringify(mem));

    mem.story_start = start.iso;
    mem.current_story_date = cur.iso;

    // Keep the display-form worldbook time, but absolute date is authoritative.
    if (!mem.current_story_time) mem.current_story_time = cur.iso;

    const taskResult = cleanLegacyTasksForThisChat(mem);
    mem.audit = Array.isArray(mem.audit) ? mem.audit : [];
    mem.audit.push({
        at:new Date().toISOString(),
        type:'v041_time_baseline_repair',
        story_start:start.iso,
        current_story_date:cur.iso,
        date_source: detected?.source || 'manual',
        tasks_kept:taskResult.kept,
        tasks_archived:taskResult.archived
    });

    await saveMeta();
    refresh();
    refreshNative();
    const box=document.getElementById('smm2_native_memory_box');
    if (box?.dataset.open==='1') {
        box.innerHTML=memoryReadableHTML();
        if (M().schema===SMM4_SCHEMA) bindHistoryBrowserV4(); else bindHistoryBrowserLegacy();
    }
    toast(`时间基准已修复：起点 ${start.iso}，当前日期 ${cur.iso}；待办保留 ${taskResult.kept} 条。`,'success');
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
    calibrateTimeline(mem, {allowCrossMidnight:false});
    const groups = new Map();
    for (const e of (mem.timeline || [])) {
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

            const ca=parseStoryClock(a.time), cb=parseStoryClock(b.time);
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
              <b>${esc(e.time||'时间未定')}</b>
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
    const rows=(mem.open_loops||[]);
    if(!rows.length) return '<div class="smm2-empty">当前已重建部分没有待办/未完成事项。</div>';
    return rows.map(t=>`
      <div class="smm52-task">
        <b>${esc(t.description||t.id||'待办')}</b>
        ${t.due?`<div>时间：${esc(t.due)}</div>`:''}
        ${t.status?`<div>状态：${esc(t.status)}</div>`:''}
      </div>`).join('');
}

function legacyReadableHTML(mem=M()) {
    const processed=Math.max(0,Number(mem.last_processed_index??-1)+1);
    const total=(C().chat||[]).length;
    const state=mem.rebuild_state||{};
    const date=mem.current_story_date || isoDateFromAny(mem.current_story_time) || '尚未建立';
    return `
      <div class="smm2-memory-view">
        <div class="smm2-memory-top smm52-live-view">
          <div><b>查看模式：</b>安全重建中的临时记忆</div>
          <div><b>已重建：</b>${processed}/${total} 条</div>
          <div><b>剧情起点：</b>${esc(mem.story_start||S().storyStart||'未建立')}</div>
          <div><b>当前绝对日期：</b>${esc(date)}</div>
          <div><b>显示时间：</b>${esc(mem.current_story_time||'未建立')}</div>
          <div><b>安全断点：</b>${esc(state.status||'未建立')}｜下一条 ${Number(state.next_index??processed)+1}</div>
          <div class="smm2-note">这是安全重建正在使用的数据本体，可直接检查；不需要先执行 v4 数据重构。</div>
        </div>
        ${(()=>{
          const c=mem.timeline_calibration||{};
          const ds=Array.isArray(c.diagnostics)?c.diagnostics:[];
          return `<details class="smm2-memory-details smm53-audit" ${ds.length?'open':''}>
            <summary>日期轴检查｜重复合并 ${Number(c.duplicate_merged||0)}｜跨午夜 ${Number(c.confirmed_rollovers||0)}｜日期变更 ${Number(c.date_reassigned||0)}｜异常 ${ds.length}</summary>
            <div class="smm2-note">按原始聊天 source 顺序运行跨午夜状态机：晚间/深夜 → 凌晨/半夜只跨日一次；凌晨后的白天和晚间仍属于同一天。时间文本只辅助判断，不会打乱 source 顺序。</div>
            ${ds.length?ds.slice(-30).map(d=>`<div class="smm53-warning"><b>${esc(d.reason||d.type)}</b><br>${esc(d.content||'')}${d.source?`<br><small>${esc(d.source)}</small>`:''}</div>`).join(''):'<div class="smm2-empty">当前没有检测到时间倒退异常。</div>'}
          </details>`;
        })()}

        <details open class="smm2-memory-details smm2-history-browser">
          <summary>历史记忆浏览器（当前已重建部分）</summary>
          <div class="smm2-history-tools">
            <input id="smm52_history_search" type="search" placeholder="搜索日期、人物、事件、关键词">
            <select id="smm52_history_type">
              <option value="all">全部类型</option>
              <option value="timeline">时间线</option>
              <option value="character">人物</option>
              <option value="relationship">人物关系</option>
              <option value="task">待办</option>
              <option value="quarantine">隔离</option>
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
          <summary>待办 / 未完成（${(mem.open_loops||[]).length}）</summary>
          ${legacyTasksHTML(mem)}
        </details>

        <details class="smm2-memory-details">
          <summary>隔离 / 待人工检查（${(mem.quarantined||[]).length}）</summary>
          <pre>${esc(JSON.stringify((mem.quarantined||[]).slice(-100),null,2))}</pre>
        </details>

        <details class="smm2-memory-details">
          <summary>当前场景</summary>
          <pre>${esc(JSON.stringify(mem.current_scene||{},null,2))}</pre>
        </details>

        <button id="smm2_raw_json" class="menu_button">查看当前重建 JSON</button>
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
              <option value="task">待办</option>
            </select>
          </div>
          <div id="smm4_history_results"></div>
        </details>

        <details open class="smm2-memory-details">
          <summary>当前场景</summary>
          <pre>${esc(JSON.stringify(mem.current_scene||{},null,2))}</pre>
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

        <details open class="smm2-memory-details">
          <summary>待办事项（严格模式）</summary>
          ${v4TasksHTML(mem)}
        </details>

        <details class="smm2-memory-details">
          <summary>隔离 / 待人工检查（${(mem.quarantined||[]).length}）</summary>
          <pre>${esc(JSON.stringify((mem.quarantined||[]).slice(-100),null,2))}</pre>
        </details>

        <button id="smm2_raw_json" class="menu_button">查看原始 JSON</button>
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
    m.rebuild_mode='safe_v050';
    m.audit.push({at:new Date().toISOString(),type:'safe_rebuild_started',anchor,target_date:currentDate||null});
    return m;
}

async function safeHistoryRun({fresh=false}={}) {
    if (HISTORY_RUNNING || BUSY) return toast('当前有任务正在运行。若页面曾卡死，请刷新页面后再点“继续安全重建”。','warning');
    const c=C(), chat=c.chat||[];
    if (!chat.length) return toast('当前聊天为空。','warning');

    const existing=M();
    const anchor=(existing.story_start || S().storyStart || '2025-09-10').trim();
    const target=existing.current_story_date || detectCurrentDateFromRecentChat()?.date || null;

    if (fresh) {
        if (!confirm(`将从第1条原始聊天重新开始安全重建。\\n剧情起点锁定：${anchor}\\n\\n现有记忆会备份，然后重新从0开始。继续吗？`)) return;
        const old=JSON.parse(JSON.stringify(existing));
        c.chatMetadata[META_KEY+'_backup_v059_'+Date.now()]=old;
        c.chatMetadata[META_KEY]=safeRebuildFreshMemory(anchor,target);
        M().rebuild_mode='safe_v059';
        M().rebuild_state={status:'starting',next_index:0,last_error:null,updated_at:new Date().toISOString()};
        await saveMeta();
    } else {
        const mem=M();
        const next=Math.max(0,Number(mem.last_processed_index??-1)+1);
        if (next>=chat.length) return toast('安全重建已经完成全部原始聊天。','success');
        mem.story_start=anchor;
        mem.rebuild_mode='safe_v059';
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
                    reason:'v0.5.9 单向时间守卫：当前主线日期禁止倒退',source:`#${start+1}-#${end}`});
                M().current_story_date=beforeDate;
            }
            if (M().current_story_date && M().current_story_date < anchor) M().current_story_date=anchor;

            calibrateTimeline(M(), {allowCrossMidnight:true});
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
            M().rebuild_state={...(M().rebuild_state||{}),status:'normalizing',next_index:start,updated_at:new Date().toISOString()};
            await saveMeta();
            try { await rebuildV4Data(); } catch(e) { console.warn('[StoryMemory] v4 normalize after safe rebuild',e); }
            M().rebuild_state={...(M().rebuild_state||{}),status:'complete',next_index:chat.length,updated_at:new Date().toISOString()};
            await saveMeta();
            toast('v0.5.9 安全历史重建完成。已执行时间线排序、去重与跨日检查。','success');
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
        <button id="smm51_native_resume" class="menu_button">继续安全重建（断点续跑）</button>
        <button id="smm53_calibrate" class="menu_button">重建当前日期轴（source跨午夜状态机）</button>
        <button id="smm2_native_rebuild" class="menu_button">重新安全重建（从第1条）</button>
        <button id="smm50_export_raw" class="menu_button">导出原始聊天 JSON</button>
        <button id="smm2_native_import" class="menu_button">导入记忆 JSON</button>
        <button id="smm2_native_export" class="menu_button">导出记忆 JSON</button>
        <button id="smm2_native_view" class="menu_button">查看/收起记忆</button>
        <button id="smm2_native_clear" class="menu_button">清空本聊天记忆</button>
      </div>

      <div id="smm2_native_memory_box" data-open="0"></div>
      <details class="smm2-tool-card">
        <summary>
          <span class="smm2-tool-title">数据重构</span>
          <span class="smm2-tool-subtitle">升级旧记忆为 v4 标准结构</span>
        </summary>
        <div class="smm2-tool-body">
          <div class="smm2-note">会先备份当前旧记忆，再转换时间线、人物、双人关系和严格待办。不会修改原聊天。</div>
          <button id="smm4_native_migrate" class="menu_button smm2-primary-tool">执行数据重构</button>
        </div>
      </details>
      <details class="smm2-tool-card" open>
        <summary>
          <span class="smm2-tool-title">时间基准修复 v0.5.9</span>
          <span class="smm2-tool-subtitle">绝对日期用于计算，学期时间用于显示</span>
        </summary>
        <div class="smm2-tool-body">
          <div class="smm2-note">
            会修正插件记忆，不修改原聊天。优先从最近聊天的 &lt;date&gt; 标签读取绝对日期；读取不到时可手动填写。
          </div>
          <div class="smm41-grid">
            <label><span>剧情起点</span><input id="smm41_story_start" type="text" value="2025-09-10"></label>
            <label><span>当前剧情日期</span><input id="smm41_current_date" type="text" placeholder="如 2025-09-20"></label>
          </div>
          <button id="smm41_detect_date" class="menu_button">从最近聊天同步日期</button>
          <button id="smm41_repair_time" class="menu_button smm2-primary-tool">执行时间基准修复 + 清洗旧待办</button>
        </div>
      </details>



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
    q('smm2_native_history').onclick = () => toast('这是旧版入口。请使用“继续安全重建（断点续跑）”。','warning');
    q('smm2_native_stop').onclick = stopHistoryRebuild;
    q('smm2_native_rebuild').onclick = safeHistoryRebuild;
    q('smm51_native_resume').onclick = resumeSafeHistoryRebuild;
    q('smm53_calibrate').onclick = async () => {
        const r=calibrateTimeline(M(),{allowCrossMidnight:true});
        M().audit=Array.isArray(M().audit)?M().audit:[];
        M().audit.push({at:new Date().toISOString(),type:'timeline_calibration_v053',
            duplicate_merged:r.duplicate_merged,date_reassigned:r.date_reassigned,date_islands_fixed:r.date_islands_fixed,confirmed_rollovers:r.confirmed_rollovers,
            diagnostics_count:r.diagnostics.length});
        await saveMeta();
        refresh(); refreshNative();
        const box=document.getElementById('smm2_native_memory_box');
        if(box?.dataset.open==='1'){
            box.innerHTML=memoryReadableHTML();
            if(M().schema===SMM4_SCHEMA) bindHistoryBrowserV4(); else bindHistoryBrowserLegacy();
        }
        toast(`日期轴重建完成：合并重复 ${r.duplicate_merged}，跨午夜 ${r.confirmed_rollovers||0}，日期变更 ${r.date_reassigned||0}，异常提示 ${r.diagnostics.length}。`,'success');
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
        `历史重建：<b>${HISTORY_RUNNING ? '运行中' : '已暂停/未运行'}</b>` +
            (M().rebuild_state ? `<br>安全断点：${esc(M().rebuild_state.status||'')}｜下一条 ${Number(M().rebuild_state.next_index||0)+1}${M().rebuild_state.last_error?`<br>上次错误：${esc(M().rebuild_state.last_error)}`:''}` : '');

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
