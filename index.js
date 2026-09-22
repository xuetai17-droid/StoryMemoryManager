// Story Memory Manager v0.11.48
// 30-message historical catch-up / 10-message automatic batches
// does not rewrite original chat JSONL

const MODULE = 'story_memory_manager_v2';
const META_KEY = 'story_memory_manager_v2';
const PANEL_ID = 'smm2_panel';
const BUTTON_ID = 'smm2_fab';

const DEFAULTS = Object.freeze({
    enabled: false,
    autoSummarize: false,
    triggerMessages: 8,
    batchMessages: 30,
    injectMemory: false,
    maxTimeline: 50,
    maxFacts: 60,
    maxEvents: 40,
    maxLoops: 30,
    // Legacy compatibility only. Since v0.11.28 the story-start anchor belongs
    // to chatMetadata and must never be reused as a cross-chat global default.
    storyStart: '',
    currentStoryTime: '',
    ignoreMessageTimestamps: true,

    // v0.11.36: a real semantic summary reuses the active chat model through
    // SillyTavern's quiet-generation path. No separate API/Profile is required.
    // The old local extractor remains available only as an experimental tool.
    summaryMode: 'ai',              // local | ai
    summaryEngineV01136: 'quiet_current_single_request',

    // v0.9.3：总结模型通道
    summaryProvider: 'current',      // current | profile | external
    summaryProfileId: '',
    summaryFallback: 'stop',         // retained for settings compatibility; v0.11.40 never auto-falls back
    summaryMaxTokens: 3072,
    summaryTransportPolicyV01140: 'compact_guarded_single_request',
    summaryTransportPolicyV01141: 'profile_circuit_breaker_one_click_one_call',
    summaryProfileCircuitOpen: false,
    summaryProfileCircuitReason: '',
    summaryProfileCircuitAt: '',
    summaryProfileCircuitProfileId: '',
    summaryTransportPolicyV01142: 'direct_external_api_verified_single_request',
    summaryTransportPolicyV01143: 'fetch_models_then_select',
    recapClockPolicyV01144: 'assistant_recap_date_time_before_message_timestamp',
    summaryBatchPolicyV01145: 'one_time_manual_50_then_auto_10',
    oneTimeManualBatch50V01145: true,
    autoBatchMessagesV01145: 10,
    summaryBatchPolicyV01146: 'manual_history_50_until_snapshot_then_auto_10',
    costProtectionPolicyV01147: 'disabled_user_requested',
    summaryBatchPolicyV01148: 'manual_history_30_until_snapshot_then_auto_10',
    historyBatchMessagesV01148: 30,
    summaryExternalApiUrl: '',
    summaryExternalApiKey: '',
    summaryExternalApiModel: '',
    summaryExternalModels: [],
    summaryExternalModelsBase: '',
    summaryExternalModelsFetchedAt: '',
    summaryExternalVerifiedFingerprint: '',
    summaryExternalVerifiedAt: '',
    summaryExternalCircuitOpen: false,
    summaryExternalCircuitReason: '',
    summaryExternalCircuitAt: '',

    // v0.10.0
    safeMemoryInject: false,
    autoHideSummarized: false,
    keepRecentMessages: 30
});

function C() { return SillyTavern.getContext(); }

function S() {
    const c = C();
    if (!c.extensionSettings[MODULE]) c.extensionSettings[MODULE] = structuredClone(DEFAULTS);
    // v0.11.29 migration: existing installs did not have an explicit summary
    // mode. Move those installs to the requested 0-API daily workflow and raise
    // the untouched legacy batch default from 20 to 30 messages.
    const upgradingToV01129 = !Object.hasOwn(c.extensionSettings[MODULE], 'summaryMode');
    if (upgradingToV01129) {
        c.extensionSettings[MODULE].summaryMode = 'local';
        if (Number(c.extensionSettings[MODULE].batchMessages) === 20) {
            c.extensionSettings[MODULE].batchMessages = 30;
        }
    }
    // v0.11.36 migration: v0.11.29-v0.11.35 made the rule-based local parser
    // the daily default. It cannot perform a genuine semantic summary and could
    // commit a partial assistant/user fragment as though it were one. Move that
    // legacy default to the current chat model's quiet-generation channel.
    // This does not require a second API key or Connection Profile.
    const upgradingToV01136 = !Object.hasOwn(c.extensionSettings[MODULE], 'summaryEngineV01136');
    if (upgradingToV01136) {
        c.extensionSettings[MODULE].summaryEngineV01136 = 'quiet_current_single_request';
        const usedLegacyLocalDefault=String(c.extensionSettings[MODULE].summaryMode||'local')!=='ai';
        if(usedLegacyLocalDefault){
            c.extensionSettings[MODULE].summaryMode = 'ai';
            c.extensionSettings[MODULE].summaryProvider = 'current';
            c.extensionSettings[MODULE].summaryFallback = 'stop';
        }
        try { c.saveSettingsDebounced?.(); } catch (_) {}
    }
    const upgradingToV01140 = !Object.hasOwn(c.extensionSettings[MODULE], 'summaryTransportPolicyV01140');
    const upgradingToV01141 = !Object.hasOwn(c.extensionSettings[MODULE], 'summaryTransportPolicyV01141');
    const upgradingToV01142 = !Object.hasOwn(c.extensionSettings[MODULE], 'summaryTransportPolicyV01142');
    const upgradingToV01143 = !Object.hasOwn(c.extensionSettings[MODULE], 'summaryTransportPolicyV01143');
    const upgradingToV01144 = !Object.hasOwn(c.extensionSettings[MODULE], 'recapClockPolicyV01144');
    const upgradingToV01145 = !Object.hasOwn(c.extensionSettings[MODULE], 'summaryBatchPolicyV01145');
    const upgradingToV01146 = !Object.hasOwn(c.extensionSettings[MODULE], 'summaryBatchPolicyV01146');
    const upgradingToV01147 = !Object.hasOwn(c.extensionSettings[MODULE], 'costProtectionPolicyV01147');
    const upgradingToV01148 = !Object.hasOwn(c.extensionSettings[MODULE], 'summaryBatchPolicyV01148');
    for (const [k,v] of Object.entries(DEFAULTS)) {
        if (!Object.hasOwn(c.extensionSettings[MODULE], k)) c.extensionSettings[MODULE][k] = v;
    }
    // v0.11.40 migration: an independent summary failure must never trigger a
    // second paid generation. Clamp legacy oversized output settings locally;
    // Connection Profile/API credentials and the selected profile are untouched.
    if (upgradingToV01140) {
        c.extensionSettings[MODULE].summaryTransportPolicyV01140 = 'compact_guarded_single_request';
        c.extensionSettings[MODULE].summaryFallback = 'stop';
        c.extensionSettings[MODULE].summaryMaxTokens = Math.max(
            512,
            Math.min(6144, Number(c.extensionSettings[MODULE].summaryMaxTokens) || 4096)
        );
        try { c.saveSettingsDebounced?.(); } catch (_) {}
    }
    if (upgradingToV01141) {
        c.extensionSettings[MODULE].summaryTransportPolicyV01141 = 'profile_circuit_breaker_one_click_one_call';
        c.extensionSettings[MODULE].summaryFallback = 'stop';
        c.extensionSettings[MODULE].summaryMaxTokens = Math.max(
            512,
            Math.min(3072, Number(c.extensionSettings[MODULE].summaryMaxTokens) || 3072)
        );
        // Existing independent profiles require one explicit local unlock after
        // upgrading. This prevents an automatic/accidental paid request on load.
        if (String(c.extensionSettings[MODULE].summaryProvider||'current') === 'profile') {
            c.extensionSettings[MODULE].summaryProfileCircuitOpen = true;
            c.extensionSettings[MODULE].summaryProfileCircuitReason = '升级到 v0.11.41 后等待手动确认';
            c.extensionSettings[MODULE].summaryProfileCircuitAt = new Date().toISOString();
            c.extensionSettings[MODULE].summaryProfileCircuitProfileId = String(c.extensionSettings[MODULE].summaryProfileId||'');
        }
        try { c.saveSettingsDebounced?.(); } catch (_) {}
    }
    if (upgradingToV01142) {
        c.extensionSettings[MODULE].summaryTransportPolicyV01142 = 'direct_external_api_verified_single_request';
        // Do not silently migrate or copy credentials from another extension.
        // Direct API remains unavailable until the user explicitly configures it
        // and passes the non-completion /models verification gate.
        c.extensionSettings[MODULE].summaryExternalVerifiedFingerprint='';
        c.extensionSettings[MODULE].summaryExternalVerifiedAt='';
        c.extensionSettings[MODULE].summaryExternalCircuitOpen=false;
        c.extensionSettings[MODULE].summaryExternalCircuitReason='';
        c.extensionSettings[MODULE].summaryExternalCircuitAt='';
        try { c.saveSettingsDebounced?.(); } catch (_) {}
    }
    if (upgradingToV01143) {
        c.extensionSettings[MODULE].summaryTransportPolicyV01143='fetch_models_then_select';
        c.extensionSettings[MODULE].summaryExternalModels=[];
        c.extensionSettings[MODULE].summaryExternalModelsBase='';
        c.extensionSettings[MODULE].summaryExternalModelsFetchedAt='';
        c.extensionSettings[MODULE].summaryExternalVerifiedFingerprint='';
        c.extensionSettings[MODULE].summaryExternalVerifiedAt='';
        try { c.saveSettingsDebounced?.(); } catch (_) {}
    }
    if (upgradingToV01145) {
        c.extensionSettings[MODULE].summaryBatchPolicyV01145='one_time_manual_50_then_auto_10';
        c.extensionSettings[MODULE].oneTimeManualBatch50V01145=true;
        c.extensionSettings[MODULE].autoBatchMessagesV01145=10;
        c.extensionSettings[MODULE].triggerMessages=10;
        try { c.saveSettingsDebounced?.(); } catch (_) {}
    }
    if (upgradingToV01146) {
        c.extensionSettings[MODULE].summaryBatchPolicyV01146='manual_history_50_until_snapshot_then_auto_10';
        c.extensionSettings[MODULE].autoBatchMessagesV01145=10;
        c.extensionSettings[MODULE].triggerMessages=10;
        try { c.saveSettingsDebounced?.(); } catch (_) {}
    }
    if (upgradingToV01147) {
        c.extensionSettings[MODULE].costProtectionPolicyV01147='disabled_user_requested';
        c.extensionSettings[MODULE].summaryProfileCircuitOpen=false;
        c.extensionSettings[MODULE].summaryProfileCircuitReason='';
        c.extensionSettings[MODULE].summaryProfileCircuitAt='';
        c.extensionSettings[MODULE].summaryProfileCircuitProfileId='';
        c.extensionSettings[MODULE].summaryExternalCircuitOpen=false;
        c.extensionSettings[MODULE].summaryExternalCircuitReason='';
        c.extensionSettings[MODULE].summaryExternalCircuitAt='';
        try { c.saveSettingsDebounced?.(); } catch (_) {}
    }
    if (upgradingToV01148) {
        c.extensionSettings[MODULE].summaryBatchPolicyV01148='manual_history_30_until_snapshot_then_auto_10';
        c.extensionSettings[MODULE].historyBatchMessagesV01148=30;
        c.extensionSettings[MODULE].autoBatchMessagesV01145=10;
        try { c.saveSettingsDebounced?.(); } catch (_) {}
    }
    if (upgradingToV01144) {
        c.extensionSettings[MODULE].recapClockPolicyV01144='assistant_recap_date_time_before_message_timestamp';
        try { c.saveSettingsDebounced?.(); } catch (_) {}
    }
    return c.extensionSettings[MODULE];
}

function freshMemory() {
    return {
        schema: 'story_memory_manager_v2',
        version: 2,
        // Per-chat hard anchor. v0.11.28 initializes this from the opening
        // scene immediately before the first incremental summary.
        story_start: null,
        current_story_date: null,
        current_story_time: null,
        // v0.11.30 separates the active narrative/scene calendar from a card's
        // underlying MVU reality clock.  A historical simulation or dungeon may
        // therefore be "2003" while /world/reality-time remains in 2026.
        current_reality_date: null,
        current_reality_time: null,
        last_processed_index: -1,
        timeline: [],
        facts: [],
        events: [],
        characters: {},
        // Minor/secondary characters live in a separate compact registry.
        // They must never be merged into the primary-character state table.
        npcs: {},
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
        stage_summaries: [],
        stage_summary_last_index: -1,
        stage_summary_updated_at: null,
        local_coverage_ranges: [],
        local_deferred_ranges: [],
        audit: []
    };
}

function M() {
    const c = C();
    if (!c.chatMetadata[META_KEY]) c.chatMetadata[META_KEY] = freshMemory();
    const mem = c.chatMetadata[META_KEY];
    if (!Array.isArray(mem.character_anchors)) mem.character_anchors = [];
    if (!Array.isArray(mem.active_arcs)) mem.active_arcs = [];
    if (!Array.isArray(mem.stage_summaries)) mem.stage_summaries = [];
    if (!Number.isInteger(mem.stage_summary_last_index)) mem.stage_summary_last_index = -1;
    if (!Object.hasOwn(mem, 'stage_summary_updated_at')) mem.stage_summary_updated_at = null;
    if (!Array.isArray(mem.local_coverage_ranges)) mem.local_coverage_ranges = [];
    if (!Array.isArray(mem.local_deferred_ranges)) mem.local_deferred_ranges = [];
    if (!mem.npcs || typeof mem.npcs !== 'object' || Array.isArray(mem.npcs)) mem.npcs = {};
    if (mem.schema === 'story_memory_manager_v4' && (!mem.npcs_v4 || typeof mem.npcs_v4 !== 'object' || Array.isArray(mem.npcs_v4))) mem.npcs_v4 = cloneJSONV0112(mem.npcs);
    if (!Object.hasOwn(mem, 'current_reality_date')) mem.current_reality_date = null;
    if (!Object.hasOwn(mem, 'current_reality_time')) mem.current_reality_time = null;
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

// =========================================================
// v0.11.37: primary-character / NPC separation.
// Adapted from Memory Palace's useful rule: a recurring name that belongs to
// the active character card/world-book cast is a primary character; other
// minor participants receive a compact independent NPC record.
// =========================================================
function personNameKeyV01137(value) {
    return String(value||'').trim().toLowerCase().replace(/[·•.．\s_'’\-—–]/g,'');
}

function activeRoleNamesV01137() {
    const c=C();
    const primary=new Set();
    const users=new Set();
    const add=(set,value)=>{
        const s=String(value||'').trim();
        if(s && !/^(?:user|用户|你|主角|角色|character)$/i.test(s)) set.add(s);
    };
    const active=Array.isArray(c?.characters)?c.characters?.[c.characterId]:null;
    add(primary,active?.name);
    for(const x of (Array.isArray(active?.alternative_names)?active.alternative_names:[])) add(primary,x);
    add(primary,c?.name2);
    add(users,c?.name1);
    add(users,c?.user_name);
    add(users,c?.powerUserSettings?.persona_name);
    for(const m of (c?.chat||[])){
        if(m?.is_user) add(users,m?.name);
    }
    // Some test/custom contexts do not expose characterId. The assistant author
    // is still the active role, not an NPC mentioned inside the prose.
    const assistantAuthors=new Map();
    for(const m of (c?.chat||[])) if(m && !m.is_user){
        const n=String(m.name||'').trim();
        if(n) assistantAuthors.set(n,(assistantAuthors.get(n)||0)+1);
    }
    for(const [name,count] of assistantAuthors) if(count>=2 || assistantAuthors.size===1) add(primary,name);
    return {primary:[...primary],users:[...users]};
}

function collectMainCharacterCandidatesV01137(mem=M()) {
    const c=C();
    const direct=activeRoleNamesV01137();
    const out=new Set([...direct.primary,...direct.users]);
    const add=value=>{
        const s=String(value||'').trim();
        if(s && s.length<=48 && !/^(?:user|用户|你|主角|角色|character)$/i.test(s)) out.add(s);
    };
    for(const ch of (Array.isArray(c?.characters)?c.characters:[])){
        add(ch?.name);
        for(const x of (Array.isArray(ch?.alternative_names)?ch.alternative_names:[])) add(x);
    }
    const wi=c?.worldInfo;
    const entries=(wi&&(wi.entries||wi.worldInfo||wi))||[];
    if(Array.isArray(entries)) for(const entry of entries){
        for(const field of ['keys','key','keywords']){
            const values=Array.isArray(entry?.[field])?entry[field]:[];
            for(const value of values) add(value);
        }
    }
    for(const row of (Array.isArray(mem?.character_anchors)?mem.character_anchors:[])) add(row?.name);
    return [...out];
}

function nameMatchesV01137(a,b) {
    const x=personNameKeyV01137(a),y=personNameKeyV01137(b);
    if(!x||!y) return false;
    if(x===y) return true;
    return Math.min(x.length,y.length)>=2 && (x.includes(y)||y.includes(x));
}

function countNameFrequencyV01137(name,chat=C().chat||[]) {
    const needle=String(name||'').trim();
    if(!needle) return 0;
    let count=0;
    for(const m of (Array.isArray(chat)?chat:[])){
        const text=String(cleanMesForSummaryV0110(m)||m?.mes||'');
        if(text.includes(needle)) count++;
    }
    return count;
}

function isMainCharacterV01137(name,chat=C().chat||[],mem=M()) {
    const raw=String(name||'').trim();
    if(!raw) return false;
    const direct=activeRoleNamesV01137();
    if([...direct.primary,...direct.users].some(x=>nameMatchesV01137(x,raw))) return true;
    const candidates=collectMainCharacterCandidatesV01137(mem);
    return candidates.some(x=>nameMatchesV01137(x,raw)) && countNameFrequencyV01137(raw,chat)>=2;
}

function npcClassificationContextV01137(mem=M()) {
    const direct=activeRoleNamesV01137();
    return {
        user_names:direct.users,
        active_role_names:direct.primary,
        main_character_candidates:collectMainCharacterCandidatesV01137(mem).slice(0,60),
        rule:'active user/role are never NPC; other card/world-book candidates are main only when repeatedly present in the real chat'
    };
}

function relevantNpcsForPromptV01137(mem=M()) {
    const recentChat=(C().chat||[]).slice(-8)
        .map(m=>String(cleanMesForSummaryV0110(m)||m?.mes||''))
        .join('\n');
    const sceneText=JSON.stringify(currentSceneCoreV0110(mem?.current_scene)||{});
    const haystack=`${recentChat}\n${sceneText}`.toLowerCase();
    const rows=[];
    for(const [key,raw] of Object.entries(mem?.npcs||{})){
        if(!raw||typeof raw!=='object'||Array.isArray(raw)) continue;
        const name=String(raw.name||key||'').trim();
        if(!name) continue;
        const triggers=[name,raw.identity,...(Array.isArray(raw.aliases)?raw.aliases:[])]
            .map(x=>String(x||'').trim())
            .filter(x=>x.length>=2 && !/^(?:npc|人物|角色|对方|男人|女人|他|她)$/i.test(x));
        if(!triggers.some(x=>haystack.includes(x.toLowerCase()))) continue;
        rows.push({
            name,
            identity:String(raw.identity||'').trim()||null,
            brief:String(raw.brief||'').trim().slice(0,260)||null,
            current_status:String(raw.current_status||'').trim().slice(0,180)||null
        });
    }
    return rows
        .sort((a,b)=>sourceLast(mem?.npcs?.[b.name]?.last_source||mem?.npcs?.[b.name]?.source)-sourceLast(mem?.npcs?.[a.name]?.last_source||mem?.npcs?.[a.name]?.source))
        .slice(0,6);
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

function stageSummariesForPromptV01121(mem=M()) {
    const rows = Array.isArray(mem?.stage_summaries) ? mem.stage_summaries : [];
    if (!rows.length) return [];
    const chosen = rows.length <= 5 ? rows : [rows[0], ...rows.slice(-4)];
    return chosen.map(x=>({
        title:String(x?.title||'剧情阶段').slice(0,80),
        summary:String(x?.summary||'').slice(0,360),
        range:String(x?.source_range||''),
        end_state:String(x?.state_at_end||'').slice(0,240),
        open_threads:Array.isArray(x?.open_threads) ? x.open_threads.slice(0,3).map(v=>String(v).slice(0,120)) : []
    }));
}

function buildSafeMemoryPromptV0100() {
    const mem = M();
    const scene = currentSceneCoreV0110(mem.current_scene);
    const timeline = (mem.timeline || []).filter(x=>!x?.__coverage_only_v01110).slice(-6);
    const names = new Set();
    for (const k of ['participants','people']) {
        const v=scene?.[k];
        if(Array.isArray(v)) v.forEach(x=>names.add(String(x)));
        else if(typeof v==='string') v.split(/[、,，/；;]/).forEach(x=>x.trim()&&names.add(x.trim()));
    }
    const timelineText = JSON.stringify(timeline);
    const allChars = stableCharactersForPromptV0110(mem) || {};
    for(const name of Object.keys(allChars)) if(timelineText.includes(name)) names.add(name);
    const chars={};
    for(const name of names) if(allChars[name]) chars[name]=allChars[name];
    // If relevance extraction finds too little, keep only a small recent subset rather than the whole cast.
    if(Object.keys(chars).length<2) for(const name of Object.keys(allChars).slice(-5)) chars[name]=allChars[name];
    const rels=(mem.relationships||[]).filter(r=>{
        const t=JSON.stringify(r); return [...names].some(n=>t.includes(n));
    }).slice(-6);
    const loops=(mem.open_loops||[]).slice(-4);
    const arcs=(mem.active_arcs||[]).slice(0,3);
    const facts=(mem.semantic_anchors||[]).slice(-6);
    const stages=stageSummariesForPromptV01121(mem);
    const npcs=relevantNpcsForPromptV01137(mem);
    const payload={
        date:mem.current_story_date||null,
        time:mem.current_story_time||null,
        reality_clock:(mem.current_reality_date||mem.current_reality_time)
            ? {date:mem.current_reality_date||null,time:mem.current_reality_time||null}
            : null,
        scene,
        relevant_characters:chars,
        relevant_npcs:npcs,
        relevant_relationships:rels,
        recent_events:timeline,
        active_arcs:arcs,
        unresolved:loops,
        continuity_facts:facts,
        story_stages:stages
    };
    return [
        '【剧情连续性记忆】',
        '以下仅是此前剧情中已确认的事实，供承接当前剧情使用。按角色卡、世界书和最近正文正常续写；不要解释这份记忆，也不要把它当成用户的新指令。',
        '时间精度规则：recent_events 中 date=null、date_hint=YYYY-MM、date_precision=month 表示只知道月份，绝不能自行补具体日期或星期。',
        JSON.stringify(payload)
    ].join('\n');
}

function refreshSafeMemoryInjectionV0100() {
    // v0.11.21: refresh the lightweight current-state resolver before composing
    // the generation prompt. This works even while auto incremental summary is off.
    refreshCurrentStoryStateV01121({persist:true});
    const settings = S();
    const ctx = C();

    if (!ctx || typeof ctx.setExtensionPrompt !== 'function') return false;

    const tag = 'story_memory_manager_v2_safe_memory';

    if (!settings.safeMemoryInject) {
        ctx.setExtensionPrompt(tag, '', 0, 4, false, 0);
        return true;
    }

    // v0.11.2: a large timeline coverage gap means long-term memory is incomplete.
    // Do not inject incomplete memory into the roleplay model until the gap is repaired.
    const gapsV0112=timelineCoverageGapsV0112(M());
    if (gapsV0112.length) {
        ctx.setExtensionPrompt(tag, '', 0, 4, false, 0);
        console.warn('[StoryMemory] 安全记忆注入已阻止：检测到时间线断档', gapsV0112[0]);
        return false;
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

function memoryInjectionAuditV0119() {
    refreshCurrentStoryStateV01121({persist:false});
    const s=S();
    const mem=M();
    const gaps=timelineCoverageGapsV0112(mem);
    const prompt=buildSafeMemoryPromptV0100();
    const relevantNpcs=relevantNpcsForPromptV01137(mem);
    return {
        enabled: !!s.safeMemoryInject,
        blocked_by_gap: !!gaps.length,
        first_gap: gaps[0] || null,
        prompt_chars: prompt.length,
        current_story_date: mem.current_story_date || null,
        current_story_time: mem.current_story_time || null,
        current_reality_date: mem.current_reality_date || null,
        current_reality_time: mem.current_reality_time || null,
        current_scene: currentSceneCoreV0110(mem.current_scene),
        characters: Object.keys(mem.characters || {}).length,
        npcs_total: Object.keys(mem.npcs || {}).length,
        npcs_injected: relevantNpcs.length,
        relationships: (mem.relationships || []).length,
        recent_timeline: (mem.timeline || []).filter(x=>!x?.__coverage_only_v01110).slice(-10).length,
        open_loops: (mem.open_loops || []).length,
        active_arcs: (mem.active_arcs || []).length,
        stage_summaries: (mem.stage_summaries || []).length,
        prompt
    };
}

function renderMemoryInjectionAuditV0119() {
    const box=document.getElementById('smm119_injection_audit');
    if(!box) return;
    const a=memoryInjectionAuditV0119();
    const state=!a.enabled ? '关闭：主聊天模型不会收到 SMM 长期记忆'
        : a.blocked_by_gap ? `已开启但被时间线断档保护阻止：#${a.first_gap.start}-#${a.first_gap.end}`
        : '已开启：本轮会提供 SMM 长期剧情记忆';
    const location=a.current_scene?.location || '未建立';
    const empty=a.characters+a.npcs_injected+a.relationships+a.recent_timeline+a.open_loops+a.active_arcs+a.stage_summaries===0;
    const note=!a.enabled
        ? '当前关闭生成时记忆注入。'
        : a.blocked_by_gap
            ? '检测到历史时间线断档，为避免把不完整长期记忆提供给主模型，本轮注入已自动阻止。'
            : empty
                ? '当前还没有可用的长期剧情记忆；主模型将主要依靠最近原文继续剧情。'
                : `本轮将注入 ${a.prompt_chars} 字符的连续性事实。`;
    box.innerHTML=`
      <div class="smm119-state"><b>状态：</b>${esc(state)}</div>
      <div class="smm119-audit-grid">
        <div><span>注入长度</span><b>${a.prompt_chars} 字符</b></div>
        <div><span>当前剧情日期</span><b>${esc(a.current_story_date||'未建立')}</b></div>
        <div><span>当前剧情时间</span><b>${esc(a.current_story_time||'未建立')}</b></div>
        <div><span>当前剧情地点</span><b>${esc(location)}</b></div>
        ${(a.current_reality_date||a.current_reality_time)?`<div><span>MVU现实时间轴</span><b>${esc([a.current_reality_date,a.current_reality_time].filter(Boolean).join(' '))}</b></div>`:''}
      </div>
      <div class="smm119-counts">人物 ${a.characters} · NPC ${a.npcs_total}（本轮相关 ${a.npcs_injected}） · 关系 ${a.relationships} · 近期事件 ${a.recent_timeline} · 主线 ${a.active_arcs} · 阶段总结 ${a.stage_summaries} · 待办 ${a.open_loops}</div>
      <div class="smm119-note">${esc(note)}</div>
      <details class="smm119-raw-details">
        <summary>查看原始注入文本（调试）</summary>
        <pre>${esc(a.enabled && !a.blocked_by_gap ? a.prompt : '（当前不会注入）')}</pre>
      </details>`;
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
    let hideEnd = Math.min(processed, keepStart - 1);

    // v0.11.2: never auto-hide across a large source-coverage gap.
    // Keep the raw messages from the first suspicious gap onward until that range is repaired.
    const gaps = timelineCoverageGapsV0112(mem);
    if (gaps.length) {
        hideEnd = Math.min(hideEnd, gaps[0].start - 1);
        console.warn('[StoryMemory] 自动隐藏已受保护性断点限制', gaps[0]);
    }

    // A 0-API pass may conservatively defer ambiguous prose instead of
    // inventing a fact. Such source text is not "summarized" and therefore must
    // remain visible until it is reprocessed or explicitly completed by AI.
    const deferred=(Array.isArray(mem.local_deferred_ranges)?mem.local_deferred_ranges:[])
        .map(r=>Number(r?.[0])).filter(Number.isInteger).sort((a,b)=>a-b)[0];
    if(Number.isInteger(deferred)) hideEnd=Math.min(hideEnd,deferred-1);

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
        'StatusPlaceHolderImpl', 'status', 'status_rule', 'thinking', 'think'
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

    // Script/style payloads belong to presentation widgets, not the story.
    t = t.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    t = t.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

    // Orphan wrappers left by malformed templates.
    t = t.replace(/<\/?(?:campus_gossip|UpdateVariable|JSONPatch|Analysis|StatusPlaceHolderImpl|status|status_rule)\b[^>]*>/gi, '');
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

// v0.11.33: many role cards expose their trustworthy end-of-reply clock and
// location through a compact <status> block.  This is not a plot summary, and
// fields such as inner thoughts, headlines, comments and todo lists must never
// enter canonical memory.  Admit only the explicitly allow-listed time and
// location rows.
function extractRoleplayStatusMetadataV01133(m, index=-1) {
    if (!m || m.is_user) return null;
    const raw=String(m?.mes||'');
    if(!raw) return null;
    const blocks=[];
    const re=/<status\b[^>]*>([\s\S]*?)<\/status>/gi;
    let hit;
    while((hit=re.exec(raw))) blocks.push(String(hit[1]||''));
    if(!blocks.length) return null;

    let date=null,time=null,timeRaw=null;
    const locations=[];
    for(const block of blocks){
        const tm=block.match(/\$(?:2|T)\s*(?:时间|时空)\s*丨\s*([^丨\r\n]{2,140}?)\s*丨/i);
        if(tm){
            timeRaw=sanitizeWorldMetaValueV0112(tm[1],140);
            date=normalizeSummaryDateLocalV0115(timeRaw)||date;
            time=normalizeNarrativeClockV01130(timeRaw)||time;
        }
        const lr=/\$([A-Za-z0-9]*)\s*([^丨\r\n$]{0,36}?)(?:地点|位置)\s*丨\s*([^丨\r\n]{1,180}?)\s*丨/g;
        let lm;
        while((lm=lr.exec(block))){
            const label=sanitizeWorldMetaValueV0112(lm[2],48);
            const value=sanitizeWorldMetaValueV0112(lm[3],180);
            if(!value||/^(?:未建立|未知|不明|无|暂无|（.*当前地点.*）|\(.*当前地点.*\))$/.test(value)) continue;
            locations.push({code:String(lm[1]||'').trim(),label:label||'',value});
        }
    }

    const unique=[];
    const seen=new Set();
    for(const row of locations){
        const key=`${row.label}\u0000${row.value}`;
        if(seen.has(key)) continue;
        seen.add(key); unique.push(row);
    }
    const assistantName=String(m?.name||'').trim();
    let selected=null;
    if(unique.length===1) selected=unique[0];
    if(!selected){
        const prose=plainTextLocalV0114(cleanMesForSummaryV0110(m));
        const mentioned=unique.filter(x=>x.label&&prose.includes(x.label));
        if(mentioned.length===1) selected=mentioned[0];
    }
    if(!selected&&assistantName){
        const named=unique.filter(x=>x.label&&(assistantName.includes(x.label)||x.label.includes(assistantName)));
        // A multi-character status represents parallel locations. Never pick
        // the card's default H row merely because the card itself has that name.
        if(named.length===1&&unique.length===1) selected=named[0];
    }

    if(!date&&!time&&!selected&&!unique.length) return null;
    return {
        index,
        date:date||null,
        time:time||null,
        time_raw:timeRaw||null,
        location:selected?.value||null,
        location_character:selected?.label||null,
        locations:unique,
        kind:'roleplay_status'
    };
}

function latestRoleplayStatusSameSourceV01133(indexes) {
    const chat=C().chat||[];
    for(const i of [...new Set(indexes||[])].sort((a,b)=>b-a)){
        const meta=extractRoleplayStatusMetadataV01133(chat[i],i);
        if(meta) return meta;
    }
    return null;
}

// v0.11.2: structured world-state metadata bridge.
// UpdateVariable / JSONPatch remains excluded from canonical story prose. We only
// read an explicit allow-list of time/location paths as non-canonical
// end-of-message metadata.
//
// v0.11.30: some MVU cards expose two clocks. `/世界/现实时间` is admitted as
// trusted MVU metadata, but it is stored separately when the active narrative
// has its own fully dated scene calendar. Dungeon day counters remain excluded.
const WORLD_STATE_PATHS_V0112 = Object.freeze({
    '/世界/当前日期':Object.freeze({field:'date',axis:'world',rank:20}),
    '/世界/当前时间':Object.freeze({field:'time',axis:'world',rank:20}),
    '/世界/当前地点':Object.freeze({field:'location',axis:'world',rank:20}),
    '/世界/现实日期':Object.freeze({field:'date',axis:'reality',rank:40}),
    '/世界/现实时间':Object.freeze({field:'datetime',axis:'reality',rank:50}),
    '/世界/现实时间/日期':Object.freeze({field:'date',axis:'reality',rank:50}),
    '/世界/现实时间/时间':Object.freeze({field:'time',axis:'reality',rank:50}),
    '/世界/现实地点':Object.freeze({field:'location',axis:'reality',rank:40})
});

function normalizeWorldStatePathV01127(value) {
    let path=String(value||'').trim();
    if(!path) return '';
    path=path.replace(/^\$\.?/,'').replace(/[.．]/g,'/');
    if(!path.startsWith('/')) path='/'+path;
    path=path.replace(/\/{2,}/g,'/').replace(/\/$/,'');
    return path.replace(/~1/g,'/').replace(/~0/g,'~');
}

function dateInsideWorldValueV01127(value) {
    const direct=normalizeDateInput(value);
    if(direct) return direct.iso;
    const m=String(value||'').match(/(20\d{2})[年\-\/.](\d{1,2})[月\-\/.](\d{1,2})日?/);
    if(!m) return null;
    return normalizeDateInput(`${m[1]}-${String(Number(m[2])).padStart(2,'0')}-${String(Number(m[3])).padStart(2,'0')}`)?.iso||null;
}

function clockInsideWorldValueV01127(value) {
    const s=String(value||'');
    const m=s.match(/(?:^|[^\d])([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)(?!\d)/);
    if(!m) return null;
    return `${String(Number(m[1])).padStart(2,'0')}:${m[2]}`;
}

function splitRealityDateTimeV01127(value) {
    if(value && typeof value==='object' && !Array.isArray(value)){
        const dateRaw=value.日期 ?? value.date ?? value.现实日期 ?? value.current_date ?? null;
        const timeRaw=value.时间 ?? value.time ?? value.时刻 ?? value.clock ?? value.current_time ?? null;
        return {
            date:dateInsideWorldValueV01127(dateRaw),
            time:clockInsideWorldValueV01127(timeRaw) || sanitizeWorldMetaValueV0112(timeRaw,100)
        };
    }
    return {
        date:dateInsideWorldValueV01127(value),
        time:clockInsideWorldValueV01127(value)
    };
}

function sanitizeWorldMetaValueV0112(value, maxLen=180) {
    if (value === undefined || value === null) return null;
    const s = String(value)
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return s ? s.slice(0, maxLen) : null;
}

function extractWorldStateMetadataV0112(m) {
    // Only assistant/model replies may contribute UpdateVariable metadata.
    if (!m || m.is_user) return null;
    const raw = String(m?.mes ?? '');
    if (!raw) return null;

    const out = {
        date:null, time:null, location:null,
        date_path:null, time_path:null, location_path:null,
        date_reality:false, time_reality:false, location_reality:false,
        reality_axis:false
    };
    const ranks={date:-1,time:-1,location:-1};
    const blocks = [];
    for(const tag of ['JSONPatch','UpdateVariable']){
        const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,'gi');
        let match;
        while ((match = re.exec(raw))) blocks.push(match[1]);
    }
    if (!blocks.length) return null;

    const setField=(field,value,spec,path)=>{
        if(!['date','time','location'].includes(field)) return;
        if(value===undefined||value===null||String(value).trim()==='') return;
        const rank=Number(spec?.rank||0);
        if(rank<ranks[field]) return;
        ranks[field]=rank;
        out[field]=value;
        out[`${field}_path`]=path;
        out[`${field}_reality`]=spec?.axis==='reality';
        if(spec?.axis==='reality') out.reality_axis=true;
    };

    const acceptOperation = (op) => {
        if (!op || typeof op !== 'object' || Array.isArray(op)) return;
        const kind = String(op.op || '').trim().toLowerCase();
        if (!['replace','insert','add'].includes(kind)) return;
        const path=normalizeWorldStatePathV01127(op.path);
        const spec = WORLD_STATE_PATHS_V0112[path];
        if (!spec) return;

        if(spec.field==='datetime'){
            const dt=splitRealityDateTimeV01127(op.value);
            if(dt.date) setField('date',dt.date,spec,path);
            if(dt.time) setField('time',dt.time,spec,path);
            return;
        }

        let value=sanitizeWorldMetaValueV0112(op.value,spec.field==='location'?180:100);
        if(!value) return;
        if(spec.field==='date'){
            value=dateInsideWorldValueV01127(value);
            if(!value) return;
        }
        setField(spec.field,value,spec,path);
    };

    for (const blockRaw of blocks) {
        const block = String(blockRaw || '')
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();
        if (!block) continue;

        let parsed = null;
        try {
            parsed = JSON.parse(block);
        } catch (_) {
            const a = block.indexOf('['), b = block.lastIndexOf(']');
            if (a >= 0 && b > a) {
                try { parsed = JSON.parse(block.slice(a,b+1)); } catch (_) {}
            }
        }
        if (Array.isArray(parsed)) {
            for (const op of parsed) acceptOperation(op);
            continue;
        }

        // Conservative fallback for a partially malformed array: only parse
        // individual JSON objects; never regex arbitrary prose into metadata.
        for (const objText of (block.match(/\{[^{}]{1,2000}\}/g) || [])) {
            try { acceptOperation(JSON.parse(objText)); } catch (_) {}
        }
    }

    return (out.date || out.time || out.location) ? out : null;
}

function worldStateMetaForSourceV0112(source) {
    const chat = C().chat || [];
    const rows = [];
    for (const i of sourceIndexes(source)) {
        const meta = extractWorldStateMetadataV0112(chat[i]);
        if (meta) rows.push({index:i, ...meta});
    }
    return rows;
}

function latestWorldStateMetaForSourceV0112(source) {
    const rows = worldStateMetaForSourceV0112(source);
    return rows.length ? rows[rows.length-1] : null;
}

function latestWorldStateMetaInRangeV0112(start, endExclusive) {
    const chat = C().chat || [];
    for (let i=Math.min(endExclusive,chat.length)-1; i>=Math.max(0,start); i--) {
        const meta = extractWorldStateMetadataV0112(chat[i]);
        if (meta) return {index:i, ...meta};
    }
    return null;
}

function worldStateMetaPromptLineV0112(m, idx) {
    const meta = extractWorldStateMetadataV0112(m);
    if (!meta) return '';
    const parts=[];
    if(meta.reality_axis && (meta.date_reality||meta.time_reality)){
        const value=[meta.date_reality?meta.date:null,meta.time_reality?meta.time:null].filter(Boolean).join(' ');
        if(value) parts.push(`${meta.time_path||meta.date_path||'/世界/现实时间'}=${value}（MVU现实主时间轴；与当前场景日历分开）`);
    }else{
        if (meta.date) parts.push(`${meta.date_path||'/世界/当前日期'}=${meta.date}`);
        if (meta.time) parts.push(`${meta.time_path||'/世界/当前时间'}=${meta.time}`);
    }
    if (meta.location) parts.push(`${meta.location_path||'/世界/当前地点'}=${meta.location}`);
    return parts.length
        ? `[SMM_WORLD_STATE_META #${idx} | assistant reply end-state only | ${parts.join(' | ')}]`
        : '';
}

function roleCardRecapTimePromptLineV01144(m,idx) {
    if(!m||m.is_user) return '';
    const recs=roleCardRecapRecordsV01135(m,null,M());
    const rec=recs.at(-1);
    if(!rec||(!rec.date&&!rec.time)) return '';
    const parts=[];
    if(rec.date) parts.push(`剧情日期=${rec.date}`);
    if(rec.time) parts.push(`剧情时间=${rec.time}`);
    if(rec.recap_start_date&&rec.recap_end_date&&rec.recap_start_date!==rec.recap_end_date){
        parts.push(`摘要日期范围=${rec.recap_start_date}→${rec.recap_end_date}`);
    }
    return `[SMM_ROLE_RECAP_TIME #${idx} | assistant recap, not message timestamp | ${parts.join(' | ')}]`;
}

function isMissingStoryValueV0112(value) {
    const s=String(value ?? '').trim();
    return !s || /^(?:null|undefined|unknown|未知|未明确|无法验证|未建立)(?:[（(].*[）)])?$/i.test(s);
}

function mergeCurrentSceneSnapshotV01129(previous, incoming) {
    const oldScene=(previous && typeof previous==='object' && !Array.isArray(previous))
        ? previous : {};
    if(!incoming || typeof incoming!=='object' || Array.isArray(incoming)) {
        return {...oldScene};
    }

    // `current_scene` remains a snapshot: arrays and transient fields from the
    // new batch may genuinely become empty. Only the three continuity anchors
    // inherit their last confirmed value when a model/local batch says
    // "unknown", "not established", null, or an empty string.
    const next={...incoming};
    for(const key of ['location','date','time']){
        if(isMissingStoryValueV0112(next[key]) && !isMissingStoryValueV0112(oldScene[key])){
            next[key]=oldScene[key];
        }
    }
    return next;
}

function isUnresolvedStoryTimeV0112(value) {
    const s=String(value ?? '').trim();
    if (isMissingStoryValueV0112(s)) return true;
    // A fuzzy display such as “下午（具体时间未明确）” may be safely upgraded
    // by same-source structured HH:MM metadata; a real existing clock is kept.
    return parseStoryClock(s)==null && /(?:具体)?时间[^。；]*?(?:未明确|无法验证|未知)/.test(s);
}

function applyWorldStateMetadataFallbackV0112(parsed, start, endExclusive) {
    if (!parsed || typeof parsed !== 'object') return parsed;
    const chat = C().chat || [];

    const narrativeRecAt=(idx)=>{
        const msg=chat[idx];
        if(!msg||msg.is_user) return null;
        const prev=(idx>0&&chat[idx-1]?.is_user)?chat[idx-1]:null;
        return narrativeSummaryRecordsV01130(msg,prev,M()).at(-1)||null;
    };

    // Fill timeline date/time from the same source.  An explicit preset scene
    // summary wins; otherwise the MVU world/reality clock remains the fallback.
    if (Array.isArray(parsed.timeline)) {
        for (const e of parsed.timeline) {
            const idx = [...sourceIndexes(e?.source)].sort((a,b)=>b-a)
                .find(i => i>=start && i<endExclusive && (narrativeRecAt(i)||extractWorldStateMetadataV0112(chat[i])));
            if (!Number.isInteger(idx)) continue;
            const meta = extractWorldStateMetadataV0112(chat[idx]);
            const narrative=narrativeRecAt(idx);
            if(narrative?.date) e.date=narrative.date;
            else if (meta?.date && (meta.date_reality || isMissingStoryValueV0112(e?.date))) e.date=meta.date;
            if(narrative?.time) e.time=narrative.time;
            else if ((isMissingStoryValueV0112(e?.time) || (isUnresolvedStoryTimeV0112(e?.time) && parseStoryClock(meta?.time)!=null)) && meta?.time) e.time=meta.time;
        }
    }

    // Top-level current story state uses world metadata only as a fallback.
    // v0.11.30 no longer lets /world/reality-time overwrite an explicit dated
    // narrative scene (for example a 2003 simulation inside a 2026 card).
    const latest = latestWorldStateMetaInRangeV0112(start,endExclusive);
    let latestNarrative=null;
    for(let i=Math.min(endExclusive,chat.length)-1;i>=Math.max(0,start);i--){
        const rec=narrativeRecAt(i);
        if(rec&&(rec.date||rec.time)){latestNarrative={index:i,...rec};break;}
    }
    if (latest||latestNarrative) {
        const parsedDate=normalizeDateInput(parsed.current_story_date||'')?.iso||null;
        const latestDate=normalizeDateInput(latest?.date||'')?.iso||null;
        if(latestNarrative?.date) parsed.current_story_date=latestNarrative.date;
        else if(latest?.date && (isMissingStoryValueV0112(parsed.current_story_date) ||
            (latest?.date_reality&&parsedDate&&latestDate&&parsedDate.slice(0,4)===latestDate.slice(0,4)&&latestDate>=parsedDate)))
            parsed.current_story_date=latest.date;
        if(latestNarrative?.time) parsed.current_story_time=latestNarrative.time;
        else if (latest?.time && ((latest?.time_reality&&!latestNarrative) || isMissingStoryValueV0112(parsed.current_story_time) ||
            (isUnresolvedStoryTimeV0112(parsed.current_story_time) && parseStoryClock(latest?.time)!=null)))
            parsed.current_story_time=latest.time;
        if (latest?.location && parsed.current_scene && typeof parsed.current_scene==='object' &&
            isMissingStoryValueV0112(parsed.current_scene.location)) {
            parsed.current_scene.location=latest.location;
        }
    }
    return parsed;
}

function messagesText(start, end) {
    const chat = C().chat || [];
    return chat.slice(start, end).map((m, j) => {
        const idx = start + j;
        const who = m.is_user ? 'USER' : (m.name || 'CHARACTER');
        const body = cleanMesForSummaryV0110(m);
        const meta = worldStateMetaPromptLineV0112(m, idx);
        const recapTime = roleCardRecapTimePromptLineV01144(m,idx);
        return `[#${idx} ${who}]\n${body}${recapTime ? `\n${recapTime}` : ''}${meta ? `\n${meta}` : ''}`;
    }).join('\n\n');
}

// v0.11.28: initialize the immutable story-start anchor once per chat.
// The opening scan is intentionally small: a date introduced much later may be
// the current scene date rather than the date on which this chat began.
const AUTO_STORY_START_LABEL_V01128 = '本聊天剧情正式起点';

function openingStoryDateEvidenceV01128(maxMessages=8) {
    const chat = C().chat || [];
    const end = Math.min(chat.length, Math.max(1, Number(maxMessages)||8));

    for (let i=0; i<end; i++) {
        const m = chat[i];
        const raw = String(m?.mes || '');
        const canonical = String(cleanMesForSummaryV0110(m) || '')
            .replace(/\s+/g, ' ')
            .trim();
        const meta = extractWorldStateMetadataV0112(m);

        // On a dual-clock MVU card the reality clock is authoritative, even if
        // the same reply also displays a dungeon-local day or clock.
        if (meta?.date_reality && meta.date) {
            return {
                date:meta.date,
                source:`#${i} ${meta.date_path || meta.time_path || '/世界/现实时间'}`,
                kind:'world_reality_meta'
            };
        }

        const tagged = extractDateTagFromMessage(raw);
        if (tagged) {
            return {date:tagged, source:`#${i} <date>`, kind:'date_tag'};
        }

        // Only accept a prose date near the beginning of the canonical body.
        // Dates buried in recollections, lore or future plans are not anchors.
        const dm = canonical.slice(0,520)
            .match(/(20\d{2})[年\-\/.](\d{1,2})[月\-\/.](\d{1,2})日?/);
        if (dm) {
            const iso = normalizeDateInput(
                `${dm[1]}-${String(Number(dm[2])).padStart(2,'0')}-${String(Number(dm[3])).padStart(2,'0')}`
            )?.iso || null;
            if (iso) return {date:iso, source:`#${i} 正文开场`, kind:'opening_prose'};
        }

        // Ordinary single-clock world metadata is a conservative final choice
        // for this same opening message.
        if (meta?.date) {
            return {
                date:meta.date,
                source:`#${i} ${meta.date_path || '/世界/当前日期'}`,
                kind:'world_state_meta'
            };
        }

        // v0.11.32: month precision is real information.  When the opening
        // establishes only "2003 年 10 月", preserve that precision instead of
        // inventing a day such as the 1st or borrowing a later scene's day.
        const month = normalizeMonthInputV01132(canonical.slice(0,520));
        if (month) {
            return {month:month.key, source:`#${i} 正文开场月份`, kind:'opening_prose_month'};
        }
    }
    return null;
}

function autoInitializeStoryStartV01128(mem=M()) {
    const existing = String(mem?.story_start || '').trim();
    if (existing) return {changed:false, anchor:existing, reason:'already_established'};

    // Never reinterpret an established long chat's current date as its origin.
    if (Number(mem?.last_processed_index ?? -1) >= 0) {
        return {changed:false, anchor:null, reason:'chat_already_processed'};
    }
    if (!(C().chat || []).length) return {changed:false, anchor:null, reason:'empty_chat'};

    const evidence = openingStoryDateEvidenceV01128(8);
    const anchor = evidence?.date
        ? `${evidence.date} / ${AUTO_STORY_START_LABEL_V01128}`
        : evidence?.month
            ? `${evidence.month} / ${AUTO_STORY_START_LABEL_V01128}（具体日期未明确）`
            : AUTO_STORY_START_LABEL_V01128;

    mem.story_start = anchor;
    mem.audit = Array.isArray(mem.audit) ? mem.audit : [];
    mem.audit.push({
        at:new Date().toISOString(),
        type:'story_start_auto_initialized_v01128',
        anchor,
        date:evidence?.date || null,
        month:evidence?.month || null,
        date_precision:evidence?.date ? 'day' : (evidence?.month ? 'month' : 'unknown'),
        source:evidence?.source || 'opening_without_absolute_date',
        evidence_kind:evidence?.kind || 'undated_opening'
    });
    if (mem.audit.length > 50) mem.audit = mem.audit.slice(-50);
    return {changed:true, anchor, evidence};
}

function repairJSONStringLocalV01118(input) {
    let s=String(input??'').replace(/^\uFEFF/,'').trim();
    s=s.replace(/^```(?:json|javascript|js)?\s*/i,'').replace(/\s*```$/,'').trim();

    const a=s.indexOf('{'), b=s.lastIndexOf('}');
    if(a<0||b<=a) return s;
    s=s.slice(a,b+1);

    // v0.11.22: repair unescaped ASCII double quotes inside JSON string values.
    // Example model leak: "summary":"被称为"新女王蜂"，随后……"
    // A real JSON closing quote must be followed by structural punctuation; a quote
    // followed by ordinary prose is treated as content and escaped locally.
    // IMPORTANT: Chinese curly quotes “ ” are valid string content and must NOT be
    // globally converted to ASCII quotes (the old conversion could corrupt valid JSON).
    const isWs=(ch)=>ch===' '||ch==='\n'||ch==='\r'||ch==='\t';
    const looksLikeStructuralClose=(quoteIndex)=>{
        let j=quoteIndex+1;
        while(j<s.length && isWs(s[j])) j++;
        if(j>=s.length) return true;
        const nx=s[j];
        if(nx===':' || nx==='}' || nx===']') return true;
        if(nx!==',') return false;

        let k=j+1;
        while(k<s.length && isWs(s[k])) k++;
        if(k>=s.length) return true;
        const c=s[k];
        if(c==='"' || c==='{' || c==='[' || c==='}' || c===']' || c==='-' || /[0-9]/.test(c)) return true;
        if(s.startsWith('true',k) || s.startsWith('false',k) || s.startsWith('null',k)) return true;
        // Also allow a bare property name here; a later repair step will quote it.
        const tail=s.slice(k,k+160);
        if(/^[A-Za-z_$\u4e00-\u9fff][A-Za-z0-9_$\u4e00-\u9fff]*\s*:/.test(tail)) return true;
        return false;
    };

    let out='', inStr=false, escp=false;
    for(let i=0;i<s.length;i++){
        const ch=s[i];
        if(inStr){
            if(escp){ out+=ch; escp=false; continue; }
            if(ch==='\\'){ out+=ch; escp=true; continue; }
            if(ch==='"'){
                if(looksLikeStructuralClose(i)){ out+=ch; inStr=false; }
                else out+='\\"';
                continue;
            }
            if(ch==='\n'){ out+='\\n'; continue; }
            if(ch==='\r'){ continue; }
            if(ch==='\t'){ out+='\\t'; continue; }
            const code=ch.charCodeAt(0);
            if(code<0x20){ out+=' '; continue; }
            out+=ch; continue;
        }
        if(ch==='"'){ inStr=true; out+=ch; continue; }
        out+=ch;
    }
    s=out;

    // Remove JS-style comments only outside strings.
    out=''; inStr=false; escp=false;
    for(let i=0;i<s.length;i++){
        const ch=s[i], nx=s[i+1];
        if(inStr){
            out+=ch;
            if(escp){escp=false;continue;}
            if(ch==='\\'){escp=true;continue;}
            if(ch==='"') inStr=false;
            continue;
        }
        if(ch==='"'){inStr=true;out+=ch;continue;}
        if(ch==='/'&&nx==='/'){ while(i<s.length&&s[i]!=='\n') i++; out+='\n'; continue; }
        if(ch==='/'&&nx==='*'){ i+=2; while(i<s.length-1&&!(s[i]==='*'&&s[i+1]==='/')) i++; i++; continue; }
        out+=ch;
    }
    s=out;

    // Drop standalone internal/debug note tokens accidentally emitted as object members.
    s=s.replace(/,\s*"__[^"]+"\s*(?=[,}])/g,'');
    s=s.replace(/,\s*__[A-Za-z0-9_]+\s*(?=[,}])/g,'');

    // Quote bare property names and remove trailing commas. These transformations are
    // intentionally limited to structural positions, not string contents.
    s=s.replace(/([,{]\s*)([A-Za-z_$\u4e00-\u9fff][A-Za-z0-9_$\u4e00-\u9fff]*)(\s*:)/g,'$1"$2"$3');
    s=s.replace(/,\s*([}\]])/g,'$1');
    // A naked '-' as a value is invalid JSON and is usually an unfinished placeholder.
    s=s.replace(/:\s*-(?=\s*[,}])/g,': null');
    return s;
}

function parseJSON(text) {
    let t = String(text ?? '').trim();
    if (!t) throw new Error('模型返回为空，无法解析 JSON');

    t = t.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) t = t.slice(a, b + 1);
    else {
        const preview = t.replace(/\s+/g, ' ').slice(0, 240);
        throw new Error(`模型未返回 JSON 对象：${preview}`);
    }

    let obj, firstErr=null;
    try { obj = JSON.parse(t); }
    catch (e) { firstErr=e; }

    // v0.11.18: locally repair common model JSON mistakes before spending another API call.
    if(!obj){
        const repaired=repairJSONStringLocalV01118(t);
        try { obj=JSON.parse(repaired); }
        catch(e){
            const preview=t.replace(/\s+/g,' ').slice(0,240);
            throw new Error(`JSON 解析失败：${firstErr?.message||'未知'}；本地修复后仍失败：${e.message}；响应开头：${preview}`);
        }
    }

    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('返回内容不是 JSON 对象');
    return obj;
}

const SUMMARY_KEYS_V01118=new Set([
    'story_start','current_story_date','current_story_time','current_scene','timeline','facts','events','characters','npcs','relationships',
    'character_anchors','active_arcs','open_loops','locations','items','conflicts','quarantined','semantic_anchors'
]);
function sanitizeSummaryObjectV01118(obj){
    if(!obj||typeof obj!=='object'||Array.isArray(obj)) return obj;
    // Known harmless aliases produced by some backends. Map before the whitelist pass.
    if(!obj.current_scene && obj.current_scene_core && typeof obj.current_scene_core==='object') obj.current_scene=obj.current_scene_core;
    const clean={};
    for(const [k,v] of Object.entries(obj)) if(SUMMARY_KEYS_V01118.has(k)) clean[k]=v;
    const arr=['timeline','facts','events','npcs','relationships','character_anchors','active_arcs','open_loops','locations','items','conflicts','quarantined','semantic_anchors'];
    for(const k of arr) if(!Array.isArray(clean[k])) clean[k]=[];
    if(!clean.characters||typeof clean.characters!=='object'||Array.isArray(clean.characters)) clean.characters={};
    if(!clean.current_scene||typeof clean.current_scene!=='object'||Array.isArray(clean.current_scene)) clean.current_scene={};
    for(const k of ['story_start','current_story_date','current_story_time']) if(!(k in clean)) clean[k]=null;
    return clean;
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
        'npcs',
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

// =========================================================
// v0.11.2 batch commit guard / source coverage / gap repair
// =========================================================

function validRealSourceV0112(source) {
    const src = String(source || '').trim();
    if (!src) return false;
    if (/主线总结|剧情总结|历史总结|summary/i.test(src)) return false;
    return sourceIndexes(src).length > 0;
}

function sourceWithinBatchV0112(source, start, endExclusive) {
    if (!validRealSourceV0112(source)) return false;
    const idx = sourceIndexes(source);
    return idx.length > 0 && idx.every(i => i >= start && i < endExclusive);
}

// v0.11.3: tolerate common model-only source formatting variants without
// weakening the actual batch boundary. We only recover integers that fall
// inside the currently summarized batch, so dates/times/out-of-range numbers
// cannot become valid message sources.
function looseSourceIndexesV0113(source, start, endExclusive) {
    const raw = String(source || '').trim();
    if (!raw) return [];
    if (/主线总结|剧情总结|历史总结|summary/i.test(raw)) return [];

    const inBatch = (n) => Number.isInteger(n) && n >= start && n < endExclusive;
    const out = [];

    // First honor the canonical #123 / #123-#126 syntax. If the model
    // explicitly referenced any #floor outside this batch, reject the whole
    // source rather than silently trimming it into an apparently valid one.
    const canonicalIdx=sourceIndexes(raw);
    if (canonicalIdx.length) {
        if (!canonicalIdx.every(inBatch)) return [];
        for (const n of canonicalIdx) out.push(n);
    }

    // Recover explicit range forms such as 1489-1508, #1489-1508,
    // 1489~1508, 1489至1508. Expansion is bounded to the current batch.
    const rangeRe = /#?(\d{1,7})\s*(?:-|–|—|~|～|至|到)\s*#?(\d{1,7})/g;
    let m;
    while ((m = rangeRe.exec(raw))) {
        const a = Number(m[1]), b = Number(m[2]);
        if (!inBatch(a) || !inBatch(b)) continue;
        const lo = Math.min(a,b), hi = Math.max(a,b);
        for (let i=lo; i<=hi && i<endExclusive; i++) out.push(i);
    }

    // Finally accept standalone source-like integers only if they are inside
    // the current batch. This safely handles "1489,1490" or "楼层 1489".
    for (const mm of raw.matchAll(/\d{1,7}/g)) {
        const n = Number(mm[0]);
        if (inBatch(n)) out.push(n);
    }

    return [...new Set(out)].sort((a,b)=>a-b);
}

function canonicalSourceV0113(indexes) {
    const xs=[...new Set((indexes||[]).filter(Number.isInteger))].sort((a,b)=>a-b);
    if (!xs.length) return null;
    if (xs.length===1) return `#${xs[0]}`;
    let sequential=true;
    for (let i=1;i<xs.length;i++) if (xs[i]!==xs[i-1]+1) { sequential=false; break; }
    return sequential ? `#${xs[0]}-#${xs[xs.length-1]}` : xs.map(x=>`#${x}`).join(',');
}

function normalizeTimelineSourcesV0113(delta, start, endExclusive) {
    if (!delta || !Array.isArray(delta.timeline)) return {normalized:0, unresolved:0};
    let normalized=0, unresolved=0;
    for (const e of delta.timeline) {
        const before=String(e?.source ?? '').trim();
        if (sourceWithinBatchV0112(before,start,endExclusive)) continue;
        const idx=looseSourceIndexesV0113(before,start,endExclusive);
        const canonical=canonicalSourceV0113(idx);
        if (canonical) {
            e.source=canonical;
            normalized++;
        } else {
            unresolved++;
        }
    }
    return {normalized, unresolved};
}

function canonicalBatchStatsV0112(start, endExclusive) {
    const chat = C().chat || [];
    const indexes = [];
    let chars = 0;
    for (let i = start; i < endExclusive && i < chat.length; i++) {
        const text = cleanMesForSummaryV0110(chat[i]);
        if (!text) continue;
        indexes.push(i);
        chars += text.length;
    }
    return { message_count:indexes.length, chars, indexes };
}

function validateBatchCommitV0112(delta, start, endExclusive) {
    const sourceNormalizationV0113 = normalizeTimelineSourcesV0113(delta, start, endExclusive);
    const incoming = Array.isArray(delta?.timeline) ? delta.timeline : [];
    const accepted = incoming.filter(e => sourceWithinBatchV0112(e?.source, start, endExclusive));
    const rejected = incoming.filter(e => !sourceWithinBatchV0112(e?.source, start, endExclusive));
    const canonical = canonicalBatchStatsV0112(start, endExclusive);

    // A real RP batch must leave at least one traceable timeline node.
    // Otherwise the cursor must not advance: this is the silent-drop bug fixed in v0.11.2.
    if (canonical.message_count > 0 && accepted.length === 0) {
        const err = new Error(
            `批次 #${start}-#${Math.max(start,endExclusive-1)} 没有任何可追溯到本批原文的 timeline，已拒绝提交，游标未推进。`
        );
        err.smmBatchCommitFailure = {
            start,
            end: Math.max(start,endExclusive-1),
            canonical_messages: canonical.message_count,
            canonical_chars: canonical.chars,
            timeline_incoming: incoming.length,
            timeline_accepted: 0,
            timeline_rejected: rejected.length,
            source_normalized_v0113: sourceNormalizationV0113.normalized,
            source_unresolved_v0113: sourceNormalizationV0113.unresolved,
            rejected_sources: rejected.slice(0,8).map(x=>String(x?.source||'')),
            incoming_preview: incoming.slice(0,4).map(x=>({event:String(x?.event||'').slice(0,180),source:String(x?.source||'')}))
        };
        throw err;
    }

    return {
        canonical,
        timeline_incoming: incoming.length,
        timeline_accepted: accepted.length,
        timeline_rejected: rejected.length,
        source_normalized_v0113: sourceNormalizationV0113.normalized,
        source_unresolved_v0113: sourceNormalizationV0113.unresolved
    };
}

function cloneJSONV0112(x) {
    return JSON.parse(JSON.stringify(x));
}

function restoreObjectInPlaceV0112(target, snapshot) {
    for (const key of Object.keys(target || {})) delete target[key];
    Object.assign(target, cloneJSONV0112(snapshot));
    return target;
}

function addLocalCoverageRangeV01129(mem, start, endInclusive) {
    const incoming=[];
    for(const row of (Array.isArray(mem?.local_coverage_ranges)?mem.local_coverage_ranges:[])){
        const a=Number(row?.[0]), b=Number(row?.[1]);
        if(Number.isInteger(a)&&Number.isInteger(b)&&a>=0&&b>=a) incoming.push([a,b]);
    }
    if(Number.isInteger(start)&&Number.isInteger(endInclusive)&&start>=0&&endInclusive>=start){
        incoming.push([start,endInclusive]);
    }
    incoming.sort((x,y)=>x[0]-y[0]||x[1]-y[1]);
    const merged=[];
    for(const [a,b] of incoming){
        const last=merged.at(-1);
        if(last&&a<=last[1]+1) last[1]=Math.max(last[1],b);
        else merged.push([a,b]);
    }
    mem.local_coverage_ranges=merged;
    return merged;
}

function replaceLocalDeferredRangeV01129(mem,start,endInclusive,newRanges=[]) {
    const kept=[];
    for(const row of (Array.isArray(mem?.local_deferred_ranges)?mem.local_deferred_ranges:[])){
        const a=Number(row?.[0]),b=Number(row?.[1]);
        if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<a) continue;
        if(b<start||a>endInclusive){kept.push([a,b]);continue;}
        if(a<start) kept.push([a,start-1]);
        if(b>endInclusive) kept.push([endInclusive+1,b]);
    }
    for(const row of (Array.isArray(newRanges)?newRanges:[])){
        const a=Math.max(start,Number(row?.[0])),b=Math.min(endInclusive,Number(row?.[1]));
        if(Number.isInteger(a)&&Number.isInteger(b)&&a>=0&&b>=a) kept.push([a,b]);
    }
    kept.sort((x,y)=>x[0]-y[0]||x[1]-y[1]);
    const merged=[];
    for(const [a,b] of kept){
        const last=merged.at(-1);
        if(last&&a<=last[1]+1) last[1]=Math.max(last[1],b);
        else merged.push([a,b]);
    }
    mem.local_deferred_ranges=merged;
    return merged;
}

function timelineCoverageGapsV0112(mem=M()) {
    const processed = Math.max(-1, Number(mem?.last_processed_index ?? -1));
    if (processed < 0) return [];

    const covered = new Set();
    for (const e of (Array.isArray(mem?.timeline) ? mem.timeline : [])) {
        for (const i of sourceIndexes(e?.source)) {
            if (i >= 0 && i <= processed) covered.add(i);
        }
    }
    // v0.11.15: code-mode may deliberately refuse to invent a visible timeline
    // event for semantically ambiguous rows. Those rows are still inspected and
    // tracked as coverage, with a separate needs-AI queue. Coverage must never be
    // faked by an empty/placeholder timeline node.
    for (const a of (Array.isArray(mem?.audit) ? mem.audit : [])) {
        if (String(a?.type||'') !== 'local_code_coverage_v01111') continue;
        const r=Array.isArray(a?.range)?a.range:[];
        const x=Number(r[0]), y=Number(r[1]);
        if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<x) continue;
        for(let i=x;i<=Math.min(y,processed);i++) covered.add(i);
    }
    // v0.11.29 stores durable 0-API coverage outside the short rolling audit.
    // This prevents a long local-only chat from appearing to develop gaps after
    // old audit entries are trimmed.
    for(const row of (Array.isArray(mem?.local_coverage_ranges)?mem.local_coverage_ranges:[])){
        const x=Number(row?.[0]), y=Number(row?.[1]);
        if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<x) continue;
        for(let i=x;i<=Math.min(y,processed);i++) covered.add(i);
    }

    const sorted = [...covered].sort((a,b)=>a-b);
    if (!sorted.length) return [];

    const threshold = Math.max(60, (Number(S().batchMessages)||30) * 3);
    const gaps = [];

    for (let k=1; k<sorted.length; k++) {
        const a = sorted[k-1], b = sorted[k];
        const missing = b-a-1;
        if (missing >= threshold) {
            gaps.push({start:a+1,end:b-1,count:missing,before:a,after:b});
        }
    }

    const tail = processed - sorted[sorted.length-1];
    if (tail >= threshold) {
        gaps.push({
            start: sorted[sorted.length-1]+1,
            end: processed,
            count: tail,
            before: sorted[sorted.length-1],
            after: null
        });
    }

    return gaps;
}

function filterRowsBeforeIndexV0112(rows, start) {
    return (Array.isArray(rows) ? rows : []).filter(row => {
        const last = sourceLast(row?.source);
        return last >= 0 && last < start;
    });
}

function historicalWorkingMemoryV0112(original, start) {
    const w = cloneJSONV0112(original);
    w.timeline = filterRowsBeforeIndexV0112(original.timeline, start);
    w.facts = filterRowsBeforeIndexV0112(original.facts, start);
    w.events = filterRowsBeforeIndexV0112(original.events, start);
    w.relationships = filterRowsBeforeIndexV0112(original.relationships, start);
    w.semantic_anchors = filterRowsBeforeIndexV0112(original.semantic_anchors, start);
    w.character_anchors = filterRowsBeforeIndexV0112(original.character_anchors, start);
    w.items = filterRowsBeforeIndexV0112(original.items, start);
    w.conflicts = filterRowsBeforeIndexV0112(original.conflicts, start);
    w.quarantined = filterRowsBeforeIndexV0112(original.quarantined, start);

    // Current/future lifecycle state must never leak backward into a historical repair.
    w.current_scene = {};
    w.active_arcs = [];
    w.stage_summaries = [];
    w.stage_summary_last_index = -1;
    w.stage_summary_updated_at = null;
    w.open_loops = [];
    w.closed_loops = [];
    w.loop_tombstones = [];
    w.audit = [];
    delete w.rebuild_state;

    const prior = [...w.timeline]
        .filter(e => sourceLast(e?.source) >= 0)
        .sort((a,b)=>sourceLast(a?.source)-sourceLast(b?.source))
        .at(-1);

    const priorDate = normalizeDateInput(prior?.date);
    w.current_story_date = priorDate?.iso || isoDateFromAny(original.story_start) || null;
    w.current_story_time = prior?.time || null;
    w.last_processed_index = start - 1;
    return w;
}

function rowTouchesRangeV0112(row, start, endInclusive) {
    const idx = sourceIndexes(row?.source);
    return idx.some(i => i >= start && i <= endInclusive);
}

function mergeHistoricalBackfillV0112(target, repaired, start, endInclusive) {
    const counts = {};
    const select = (field) => (Array.isArray(repaired?.[field]) ? repaired[field] : [])
        .filter(row => rowTouchesRangeV0112(row,start,endInclusive));

    const tl = select('timeline');
    const facts = select('facts');
    const events = select('events');
    const rel = select('relationships');
    const anchors = select('semantic_anchors');
    const charAnchors = select('character_anchors');
    const conflicts = select('conflicts');
    const quarantined = select('quarantined');

    const before = {
        timeline:(target.timeline||[]).length,
        facts:(target.facts||[]).length,
        events:(target.events||[]).length,
        relationships:(target.relationships||[]).length,
        semantic_anchors:(target.semantic_anchors||[]).length,
        character_anchors:(target.character_anchors||[]).length
    };

    target.timeline = uniqMerge(target.timeline, tl, x=>JSON.stringify([x.date,x.time,x.event,x.source]));
    target.facts = uniqMerge(target.facts, facts, x=>JSON.stringify([x.fact,x.source]));
    target.events = uniqMerge(target.events, events, x=>JSON.stringify([x.date,x.title,x.source]));
    target.relationships = uniqMerge(target.relationships, rel, x=>JSON.stringify([x.people,x.state,x.change,x.source]));
    target.semantic_anchors = uniqMerge(target.semantic_anchors, anchors, x=>String(x?.id||JSON.stringify([x?.event,x?.source])));
    mergeCharacterAnchorsV0110(target, charAnchors);
    target.conflicts = uniqMerge(target.conflicts, conflicts, x=>JSON.stringify([x.topic,x.old_value,x.new_value,x.source]));
    target.quarantined = uniqMerge(target.quarantined, quarantined, x=>JSON.stringify([x.content,x.reason,x.source]));

    // Stable character identity may be filled, but historical repair must not rewind current transient state.
    target.characters = target.characters && typeof target.characters==='object' ? target.characters : {};
    for (const [name,row] of Object.entries(repaired?.characters||{})) {
        if (!row || typeof row!=='object' || Array.isArray(row)) continue;
        const canon = canonicalPersonName(name);
        const old = target.characters[canon] && typeof target.characters[canon]==='object'
            ? target.characters[canon] : {};
        const next = {...old};
        for (const key of ['age','gender','identity','personality']) {
            if ((next[key]===undefined || next[key]===null || String(next[key]).trim()==='') &&
                row[key]!==undefined && row[key]!==null && String(row[key]).trim()!=='') {
                next[key]=row[key];
            }
        }
        target.characters[canon]=next;
    }

    // New historical world locations are additive.
    target.locations = uniqMerge(target.locations, repaired?.locations, x=>JSON.stringify([x.name,x.fact]));

    // Items are source-ordered. Older repaired snapshots may add missing items, but never overwrite a newer snapshot.
    const itemMap = new Map((Array.isArray(target.items)?target.items:[]).map(x=>[String(x?.name||'').trim().toLowerCase(),x]));
    for (const item of select('items')) {
        const key=String(item?.name||'').trim().toLowerCase();
        if(!key) continue;
        const old=itemMap.get(key);
        if(!old || sourceLast(item?.source) > sourceLast(old?.source)) itemMap.set(key,item);
    }
    target.items=[...itemMap.values()];

    // Relationship snapshots are source-ordered, so a repaired older row cannot replace a newer row.
    normalizeRelationshipsV085(target);
    normalizeCharactersV085(target);
    cleanQuarantineV085(target);
    unifiedPostProcessV01114(target,{range:[start,endInclusive],audit:false});

    counts.timeline=(target.timeline||[]).length-before.timeline;
    counts.facts=(target.facts||[]).length-before.facts;
    counts.events=(target.events||[]).length-before.events;
    counts.relationships=(target.relationships||[]).length-before.relationships;
    counts.semantic_anchors=(target.semantic_anchors||[]).length-before.semantic_anchors;
    counts.character_anchors=(target.character_anchors||[]).length-before.character_anchors;
    return counts;
}
function mergeSources(a,b) {
    const x=[...new Set([...sourceIndexes(a),...sourceIndexes(b)])].sort((m,n)=>m-n);
    return x.length ? x.map(n=>`#${n}`).join(',') : (a||b||null);
}

function stripGeneratedSummaryBlocksForTimeEvidenceV01131(text) {
    let t=String(text||'');
    // These blocks are model-generated recaps, not evidence that the narrated
    // scene itself stated an exact clock.  Keeping them here would let a time
    // invented by a recap verify itself.
    for(const tag of ['abstract','meow_FM','scene_summary','memory_summary','story_summary','plot_summary','剧情摘要']){
        const paired=new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`,'gi');
        t=t.replace(paired,'');
    }
    return t.trim();
}

function sourceTextForTime(source) {
    const chat = C().chat || [];
    // Canonical story evidence only. Auxiliary UpdateVariable/JSONPatch blocks
    // are handled separately by worldStateMetaForSourceV0112(). Generated
    // summaries are removed as well, so an inferred recap time cannot verify
    // itself as if it had appeared in the original scene prose.
    return sourceIndexes(source)
        .map(i => stripGeneratedSummaryBlocksForTimeEvidenceV01131(cleanMesForSummaryV0110(chat[i])))
        .filter(Boolean)
        .join('\n');
}

function sourceWorldMetaTextV0112(source) {
    return worldStateMetaForSourceV0112(source)
        .map(x => [x.date,x.time,x.location].filter(Boolean).join(' | '))
        .filter(Boolean)
        .join('\n');
}

function sourceRoleplayStatusTextV01133(source) {
    const chat=C().chat||[];
    return sourceIndexes(source)
        .map(i=>extractRoleplayStatusMetadataV01133(chat[i],i))
        .filter(Boolean)
        .map(x=>[x.time_raw||[x.date,x.time].filter(Boolean).join(' '),x.location].filter(Boolean).join(' | '))
        .filter(Boolean)
        .join('\n');
}

function sourcePresetSummaryTimeTextV01144(source) {
    const chat=C().chat||[];
    return sourceIndexes(source).map(i=>{
        const msg=chat[i];
        if(!msg||msg.is_user) return '';
        const prev=i>0&&chat[i-1]?.is_user?chat[i-1]:null;
        return narrativeSummaryRecordsV01130(msg,prev,M())
            .map(rec=>[rec?.date,rec?.time].filter(Boolean).join(' '))
            .filter(Boolean).join('\n');
    }).filter(Boolean).join('\n');
}

function temporalTextContainsClockV01131(text,targetMinutes) {
    const src=String(text||'');
    if(!src||targetMinutes==null) return false;
    const targetH=Math.floor(targetMinutes/60), targetM=targetMinutes%60;
    const colon=/(凌晨|半夜|清晨|早晨|早上|上午|中午|正午|下午|傍晚|晚上|晚间|夜间|夜晚|深夜)?\s*([01]?\d|2[0-3])\s*[:：]\s*([0-5]\d)/g;
    let activePeriod='',lastEnd=-999;
    for(const m of src.matchAll(colon)){
        if(m.index-lastEnd>32||/[。！？!?\n]/.test(src.slice(Math.max(0,lastEnd),m.index))) activePeriod='';
        if(m[1]) activePeriod=m[1];
        let h=Number(m[2]), min=Number(m[3]);
        const period=m[1]||activePeriod;
        if(/下午|傍晚|晚上|晚间|夜间|夜晚|深夜/.test(period)&&h<12) h+=12;
        if(/中午|正午/.test(period)&&h<11) h+=12;
        if(/凌晨|半夜/.test(period)&&h===12) h=0;
        if(h===targetH&&min===targetM) return true;
        lastEnd=(m.index||0)+m[0].length;
    }

    const chinese=/(凌晨|半夜|清晨|早晨|早上|上午|中午|正午|下午|傍晚|晚上|晚间|夜间|夜晚|深夜)\s*([0-9]{1,2}|[零〇一二两三四五六七八九十]{1,3})\s*(?:点|时)(?:\s*([0-9]{1,2}|[零〇一二两三四五六七八九十]{1,3})\s*分)?/g;
    for(const m of src.matchAll(chinese)){
        let h=chineseNumberToInt(m[2]);
        const min=m[3]?chineseNumberToInt(m[3]):0;
        if(h==null||min==null||min<0||min>=60) continue;
        if(/下午|傍晚|晚上|晚间|夜间|夜晚|深夜/.test(m[1])&&h<12) h+=12;
        if(/中午|正午/.test(m[1])&&h<11) h+=12;
        if(/凌晨|半夜/.test(m[1])&&h===12) h=0;
        if(h===targetH&&min===targetM) return true;
    }
    return false;
}

function classifySourceTimeEvidence(e) {
    const time = String(e?.time || '').trim();
    if (!time) {
        return {level:'none', label:'无时间', reason:'记忆没有 time 字段'};
    }

    const src = sourceTextForTime(e?.source);
    const worldMeta = sourceWorldMetaTextV0112(e?.source);
    const statusMeta = sourceRoleplayStatusTextV01133(e?.source);
    const presetMeta = sourcePresetSummaryTimeTextV01144(e?.source);
    const meta=[worldMeta,statusMeta,presetMeta].filter(Boolean).join('\n');
    if (!src && !meta) {
        return {level:'unverified', label:'无法验证', reason:'找不到 source 对应的原始聊天或世界状态元数据'};
    }

    // Exact clock candidates, including 22:00, 下午3:00 and
    // 下午3:30-5:00. Period prefixes must be resolved before verification.
    const preciseClocks=clockCandidatesFromTimelineTime(time);
    if (preciseClocks.length) {
        const checks = preciseClocks.map(minutes => {
            const hh2=String(Math.floor(minutes/60)).padStart(2,'0');
            const mm=String(minutes%60).padStart(2,'0');
            return {
                clock:hh2+':'+mm,
                inCanonical:temporalTextContainsClockV01131(src,minutes),
                inMeta:temporalTextContainsClockV01131(meta,minutes),
                inStatus:temporalTextContainsClockV01131(statusMeta,minutes),
                inPreset:temporalTextContainsClockV01131(presetMeta,minutes)
            };
        });
        const missing=checks.filter(x=>!x.inCanonical&&!x.inMeta);
        if (!missing.length) {
            const allCanonical=checks.every(x=>x.inCanonical);
            const anyCanonical=checks.some(x=>x.inCanonical);
            if (allCanonical) return {
                level:'explicit',
                label:checks.length>1?'原文时间范围已验证':'原文明确时间',
                reason:'source canonical 正文中找到全部时间：'+checks.map(x=>x.clock).join('、')
            };
            return {
                level:anyCanonical?'partial':'structured',
                label:anyCanonical?'原文/状态时间已验证':(checks.some(x=>x.inPreset)?'角色卡摘要时间':(checks.some(x=>x.inStatus)?'角色卡状态栏时间':'变量状态时间')),
                reason:'时间由 canonical 正文、角色卡状态栏与/或 UpdateVariable 白名单字段验证：'+checks.map(x=>x.clock).join('、')
            };
        }
        const found=checks.filter(x=>x.inCanonical||x.inMeta);
        if (found.length) return {
            level:'partial', label:'部分时间已验证',
            reason:'已验证 '+found.map(x=>x.clock).join('、')+'；未验证 '+missing.map(x=>x.clock).join('、')
        };
        return {
            level:'inferred', label:'总结推测时间',
            reason:'时间 '+checks.map(x=>x.clock).join('、')+' 未在 canonical 正文或允许的世界状态元数据中找到'
        };
    }

    const chineseHour = time.match(/(?:凌晨|半夜|早晨|早上|上午|中午|下午|傍晚|晚上|晚间|夜间|深夜)?\s*(\d{1,2})(?:点|时)/);
    if (chineseHour) {
        const token=chineseHour[0].replace(/\s+/g,''), c=(src||'').replace(/\s+/g,''), m=(meta||'').replace(/\s+/g,''), st=(statusMeta||'').replace(/\s+/g,''), ps=(presetMeta||'').replace(/\s+/g,'');
        if (c.includes(token)) return {level:'explicit',label:'原文明确时间',reason:`source canonical 正文中找到“${token}”`};
        if (ps.includes(token)) return {level:'structured',label:'角色卡摘要时间',reason:`同 source 的角色卡摘要时间字段中找到“${token}”`};
        if (st.includes(token)) return {level:'structured',label:'角色卡状态栏时间',reason:`同 source 的 <status> 白名单时间字段中找到“${token}”`};
        if (m.includes(token)) return {level:'structured',label:'变量状态时间',reason:`UpdateVariable 世界状态元数据中找到“${token}”`};
        return {level:'inferred',label:'总结推测时间',reason:'具体钟点只存在于记忆 time 字段'};
    }

    const dayparts=['凌晨','半夜','清晨','早晨','早上','上午','中午','下午','傍晚','晚上','晚间','夜间','深夜'];
    const hit=dayparts.find(x=>time.includes(x));
    if (hit) {
        if ((src||'').includes(hit)) return {level:'fuzzy',label:'原文模糊时段',reason:`source canonical 正文中存在“${hit}”`};
        if ((presetMeta||'').includes(hit)) return {level:'structured',label:'角色卡摘要时间',reason:`同 source 的角色卡摘要时间字段中存在“${hit}”`};
        if ((statusMeta||'').includes(hit)) return {level:'structured',label:'角色卡状态栏时段',reason:`同 source 的 <status> 白名单时间字段中存在“${hit}”`};
        if ((meta||'').includes(hit)) return {level:'structured',label:'变量状态时段',reason:`UpdateVariable 世界状态元数据中存在“${hit}”`};
        return {level:'inferred',label:'总结推测时段',reason:`“${hit}”只存在于记忆 time 字段`};
    }

    return {level:'unverified',label:'时间无法验证',reason:'无法在 canonical 正文或允许的世界状态元数据中验证该时间'};
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

    // 先抽 HH:MM，包括 21:07-21:55 / 下午3:00-5:00。时段前缀
    // 必须参与 12/24 小时换算，否则“下午3:00”会被误读为凌晨。
    const re=/(凌晨|半夜|清晨|早晨|早上|上午|中午|正午|下午|傍晚|晚上|晚间|夜间|夜晚|深夜)?\s*([01]?\d|2[0-3])[:：]([0-5]\d)/g;
    let activePeriod='',lastEnd=-999;
    for (const m of s.matchAll(re)) {
        if(m.index-lastEnd>24||/[。！？!?\n]/.test(s.slice(Math.max(0,lastEnd),m.index))) activePeriod='';
        if(m[1]) activePeriod=m[1];
        let h = Number(m[2]);
        const min = Number(m[3]);
        const period=m[1]||activePeriod;
        if(/下午|傍晚|晚上|晚间|夜间|夜晚|深夜/.test(period)&&h<12) h+=12;
        if(/中午|正午/.test(period)&&h<11) h+=12;
        if(/凌晨|半夜/.test(period)&&h===12) h=0;
        const total = h * 60 + min;
        if (!out.includes(total)) out.push(total);
        lastEnd=(m.index||0)+m[0].length;
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
    const canonical = sourceTextForTime(source);
    const meta = sourceWorldMetaTextV0112(source);
    const status = sourceRoleplayStatusTextV01133(source);
    const preset = sourcePresetSummaryTimeTextV01144(source);
    const src = [canonical, meta, status, preset].filter(Boolean).join('\n');
    return temporalTextContainsClockV01131(src,targetMinutes);
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

    // v0.11.30: timeline.date is the active narrative/scene calendar.  A preset
    // summary attached to the same source is therefore stronger for the story
    // browser than an underlying MVU reality clock.  The latter is retained in
    // separate reality_date/reality_time fields by the v0.11.30 repair layer.
    for (const i of [...indexes].sort((a,b)=>b-a)) {
        const msg=chat[i];
        if(!msg || msg.is_user) continue;
        const prev=(i>0&&chat[i-1]?.is_user)?chat[i-1]:null;
        const recs=narrativeSummaryRecordsV01130(msg,prev,M());
        const rec=[...recs].reverse().find(x=>normalizeDateInput(x?.date||''));
        if(rec?.date){
            return {
                date:normalizeDateInput(rec.date)?.iso,
                source_index:i,
                source:'#'+i+' <'+(rec.tag||'abstract')+'> time',
                distance:Math.abs(indexes[0]-i),
                text:String(rec.event||''),
                kind:'preset_summary_time'
            };
        }
    }

    // 2) A recognised world/reality clock is authoritative when the active
    // narrative summary does not provide its own absolute scene date.
    for (const i of [...indexes].sort((a,b)=>b-a)) {
        const meta=extractWorldStateMetadataV0112(chat[i]);
        if (meta?.date && meta.date_reality) {
            return {
                date:meta.date,
                source_index:i,
                source:'#'+i+' '+(meta.date_path||'/世界/现实时间'),
                distance:Math.abs(indexes[0]-i),
                text:cleanMesForSummaryV0110(chat[i]),
                kind:'world_reality_meta'
            };
        }
    }

    // 3) A canonical <date> attached to the same source has highest priority
    // for ordinary single-clock cards.
    for (const i of [...indexes].sort((a,b)=>b-a)) {
        const text=stripAuxiliaryBlocksV0110(cleanMes(chat[i]));
        const d=extractDateTagFromMessage(text);
        if (d) return {date:d,source_index:i,source:'#'+i+' <date>',distance:Math.abs(indexes[0]-i),text,kind:'date_tag'};
    }

    // 4) Structured JSONPatch world date is an end-state candidate for the same
    // source. It never bypasses validateSourceDateAnchor() continuity checks.
    for (const i of [...indexes].sort((a,b)=>b-a)) {
        const meta=extractWorldStateMetadataV0112(chat[i]);
        if (meta?.date) {
            return {
                date:meta.date,
                source_index:i,
                source:'#'+i+' JSONPatch '+(meta.date_path||'/世界/当前日期'),
                distance:Math.abs(indexes[0]-i),
                text:cleanMesForSummaryV0110(chat[i]),
                kind:'world_state_meta'
            };
        }
    }

    // 5) Fallback to the nearest earlier canonical <date> tag.
    const first=indexes[0];
    for (let i=first-1;i>=0;i--) {
        const text=stripAuxiliaryBlocksV0110(cleanMes(chat[i]));
        const d=extractDateTagFromMessage(text);
        if (d) return {date:d,source_index:i,source:'#'+i+' <date>',distance:first-i,text,kind:'date_tag'};
    }
    return null;
}

function sourceTextAround(index, before=2, after=2) {
    const chat = C().chat || [];
    const a = Math.max(0, Number(index||0) - before);
    const b = Math.min(chat.length, Number(index||0) + after + 1);
    return chat.slice(a,b).map((m,j)=>cleanMes(m)).filter(Boolean).join('\n');
}

function hasExplicitMidnightCrossingCueV0112(text) {
    const t=String(text||'');
    const re=/(?:跨过(?:午夜|零点)|过了(?:午夜|零点)|午夜之后|零点之后|零点刚过)/g;
    let m;
    while((m=re.exec(t))){
        const prefix=t.slice(Math.max(0,m.index-10),m.index);
        // Reject explicit negation such as “没有跨过午夜 / 并未发生跨零点”.
        if (/(?:没有|并没有|未|并未|不曾|从未|没有发生|并未发生)\s*$/.test(prefix)) continue;
        return true;
    }
    return false;
}

function hasStrongRolloverEvidenceText(text) {
    const t = String(text||'');
    if (/(?:^|[。！？\n])\s*(?:次日|第二天|翌日|隔天|第二日)(?:早晨|清晨|上午|醒来|起床)?/.test(t)) return true;
    if (hasExplicitMidnightCrossingCueV0112(t) || /00[:：]\d{2}/.test(t)) return true;
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
        const text = cleanMesForSummaryV0110(chat[i]);
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
        if (hasExplicitMidnightCrossingCueV0112(text)) {
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
    if (cand.kind === 'preset_summary_time' && diff != null) {
        return {
            accept:true,
            reason:diff<0
                ? `authoritative_calendar_segment_switch_${Math.abs(diff)}d`
                : `authoritative_scene_summary_advance_${diff}d`
        };
    }
    if (diff != null && diff < 0) {
        // v0.11.30: source chronology can legitimately enter a historical
        // simulation, flashback route, or dated dungeon.  A same-source preset
        // end summary is strong enough to open a new narrative calendar segment
        // even though its year is numerically older. The MVU reality clock stays
        // monotonic on its own separate axis.
        // Bare prose mentions remain blocked below as possible recollections.
        return {accept:false, reason:'candidate_regression'};
    }

    // v0.11.27: `/世界/现实时间` is an end-state value, not a prose guess.
    // Accept any monotonic advance, including a new wash/round several days
    // later. A backwards value remains blocked above unless the story explicitly
    // implements time travel in a future dedicated mechanism.
    if (cand.kind === 'world_reality_meta' && diff != null && diff > 0) {
        return {accept:true, reason:`primary_reality_axis_advance_${diff}d`};
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

        if (hasExplicitMidnightCrossingCueV0112(joined)) {
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
    if (hasExplicitMidnightCrossingCueV0112(src)) return true;

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

    const storyStart = isoDateFromAny(mem.story_start) || null;

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

    // 3) v0.11.30: source order is the story order, even across calendar
    // segments.  A plot can move 2026 -> a dated 2003 scenario -> 2026; sorting
    // by ISO date would place the scenario before the opening and corrupt
    // continuity.  Clock text remains diagnostic only.
    mem.timeline=(mem.timeline||[]).sort((a,b)=>{
        const sa=sourceFirst(a.source), sb=sourceFirst(b.source);
        if(sa!==sb) return sa-sb;
        const da=isoDateFromAny(a.date)||'9999-99-99', db=isoDateFromAny(b.date)||'9999-99-99';
        if(da!==db) return da.localeCompare(db);
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
        ordering:'narrative_source_order',
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

    const before = normalizeDateInput(mem.current_story_date || '')?.iso || null;
    // v0.11.21: timeline is a historical floor, not an authority allowed to drag
    // a newer current state backwards. Advance from timeline when it is newer;
    // otherwise preserve the already-established later current date.
    let next = timelineDate;
    let blockedRegression = false;
    if (before && timelineDate < before) {
        next = before;
        blockedRegression = true;
    }
    mem.current_story_date = next;

    if (before !== next || blockedRegression || (normalizedModel && normalizedModel !== timelineDate)) {
        mem.audit = Array.isArray(mem.audit) ? mem.audit : [];
        mem.audit.push({
            at:new Date().toISOString(),
            type: blockedRegression ? 'current_date_timeline_regression_blocked_v01121' : 'current_date_synced_from_timeline',
            before,
            model_date:normalizedModel,
            timeline_date:timelineDate,
            current:next,
            reason: blockedRegression
                ? '旧 timeline 日期不得覆盖更新的 current_story_date'
                : '以 source 最靠后的已校准 timeline 日期推进 current_story_date'
        });
        if (mem.audit.length > 50) mem.audit = mem.audit.slice(-50);
    }

    return {
        changed:before !== next,
        blocked_regression:blockedRegression,
        timeline_date:timelineDate,
        model_date:normalizedModel,
        current:next
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

function npcKeyForNameV01137(mem,name) {
    for(const key of Object.keys(mem?.npcs||{})){
        const row=mem.npcs[key];
        if(nameMatchesV01137(key,name)||nameMatchesV01137(row?.name,name)) return key;
        if((Array.isArray(row?.aliases)?row.aliases:[]).some(x=>nameMatchesV01137(x,name))) return key;
    }
    return null;
}

function removeNpcFromPrimaryCharactersV01137(mem,r,name) {
    for(const target of [mem?.characters,r?.characters]){
        if(!target||typeof target!=='object'||Array.isArray(target)) continue;
        for(const key of Object.keys(target)) if(nameMatchesV01137(key,name)) delete target[key];
    }
}

function npcHasSourceEvidenceV01137(raw,source) {
    const triggers=[raw?.name,raw?.identity,...(Array.isArray(raw?.aliases)?raw.aliases:[])]
        .map(x=>String(x||'').trim().toLowerCase())
        .filter(x=>x.length>=2 && !/^(?:npc|人物|角色|路人|男人|女人|他|她|对方)$/.test(x));
    if(!triggers.length) return false;
    const chat=C().chat||[];
    return sourceIndexes(source).some(index=>{
        const message=chat[index];
        if(!message) return false;
        const author=String(message?.name||'');
        const body=String(cleanMesForSummaryV0110(message)||message?.mes||'');
        const text=`${author}\n${body}`.toLowerCase();
        return triggers.some(trigger=>text.includes(trigger));
    });
}

function mergeNpcsV01137(mem,incoming,startIndex,endIndex,r) {
    if(!mem.npcs||typeof mem.npcs!=='object'||Array.isArray(mem.npcs)) mem.npcs={};
    const accepted=[];
    const rejected=[];
    const promoted=[];
    const validSource=source=>startIndex==null
        ? validRealSourceV0112(source)
        : sourceWithinBatchV0112(source,startIndex,endIndex);

    // A person promoted into the active/card cast must not remain duplicated in
    // the NPC registry. This check is deterministic and independent of model labels.
    for(const key of Object.keys(mem.npcs)){
        const row=mem.npcs[key];
        const name=String(row?.name||key||'').trim();
        if(name&&isMainCharacterV01137(name,C().chat||[],mem)){
            delete mem.npcs[key];
            promoted.push(name);
        }
    }

    for(const raw of (Array.isArray(incoming)?incoming:[])){
        if(!raw||typeof raw!=='object'||Array.isArray(raw)) continue;
        const rawName=String(raw.name||'').trim();
        const source=String(raw.source||'').trim();
        if(!rawName||!validSource(source)){
            rejected.push({name:rawName||'未命名',source,reason:'npc_source_invalid'});
            continue;
        }
        if(!npcHasSourceEvidenceV01137(raw,source)){
            rejected.push({name:rawName,source,reason:'npc_not_mentioned_in_source'});
            continue;
        }
        const name=canonicalPersonName(rawName);
        if(isMainCharacterV01137(name,C().chat||[],mem)){
            const oldKey=npcKeyForNameV01137(mem,name);
            if(oldKey) delete mem.npcs[oldKey];
            // Preserve a reliable identity if the model accidentally placed a
            // primary role in npcs. It is repaired into the primary table, not
            // accepted as an NPC.
            if(r?.characters&&typeof r.characters==='object'&&!Array.isArray(r.characters)){
                const state=r.characters[name]&&typeof r.characters[name]==='object'?r.characters[name]:{};
                const identity=String(raw.identity||'').trim();
                r.characters[name]={...state,...(identity?{identity}:{})};
            }
            promoted.push(name);
            continue;
        }

        const oldKey=npcKeyForNameV01137(mem,name);
        const old=oldKey&&mem.npcs[oldKey]&&typeof mem.npcs[oldKey]==='object'?mem.npcs[oldKey]:{};
        const aliases=[
            ...(Array.isArray(old.aliases)?old.aliases:[]),
            ...(Array.isArray(raw.aliases)?raw.aliases:[]),
            ...(rawName!==name?[rawName]:[])
        ].map(x=>String(x||'').trim()).filter(Boolean);
        const identity=String(raw.identity||'').trim();
        const brief=String(raw.brief||'').trim().replace(/\s+/g,' ').slice(0,260);
        const currentStatus=String(raw.current_status||'').trim().replace(/\s+/g,' ').slice(0,180);
        if(!identity&&!brief&&!currentStatus){
            rejected.push({name,source,reason:'npc_empty'});
            continue;
        }
        if(oldKey&&oldKey!==name) delete mem.npcs[oldKey];
        mem.npcs[name]={
            name,
            identity:identity||old.identity||null,
            brief:brief||old.brief||null,
            current_status:currentStatus||old.current_status||null,
            aliases:[...new Set(aliases)].slice(-12),
            first_source:old.first_source||old.source||source,
            last_source:source,
            source
        };
        removeNpcFromPrimaryCharactersV01137(mem,r,name);
        accepted.push(name);
    }

    const ordered=Object.entries(mem.npcs).sort((a,b)=>{
        const ar=sourceLast(a[1]?.last_source||a[1]?.source);
        const br=sourceLast(b[1]?.last_source||b[1]?.source);
        return br-ar;
    }).slice(0,80);
    mem.npcs=Object.fromEntries(ordered);

    if(accepted.length||rejected.length||promoted.length){
        mem.audit=Array.isArray(mem.audit)?mem.audit:[];
        mem.audit.push({
            at:new Date().toISOString(),type:'npc_partition_v01137',
            accepted:[...new Set(accepted)],
            promoted_to_primary:[...new Set(promoted)],
            rejected
        });
    }
    return {accepted,rejected,promoted};
}

function mergeResult(mem, r, endIndex, options={}) {
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
    const startIndexV0112 = Number.isInteger(options?.startIndex) ? options.startIndex : null;
    const validTimelineSource = (source) => validRealSourceV0112(source);
    const validIncomingTimelineSource = (source) => {
        if (!validTimelineSource(source)) return false;
        return startIndexV0112 == null
            ? true
            : sourceWithinBatchV0112(source, startIndexV0112, endIndex);
    };

    // NPC classification is committed before primary character state. Accepted
    // NPC names are removed from characters, while active/card roles are repaired
    // back into the primary table. This mirrors Memory Palace's separated store.
    mergeNpcsV01137(mem,r.npcs,startIndexV0112,endIndex,r);

    const incomingTimeline = Array.isArray(r.timeline) ? r.timeline : [];
    const acceptedTimeline = [];
    const rejectedTimeline = [];

    for (const e of incomingTimeline) {
        if (validIncomingTimelineSource(e?.source)) {
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
        // Preserve a previously confirmed place/date/time when a later batch
        // merely omitted it or returned an unknown placeholder. This fixes the
        // "known location -> not established" regression without accumulating
        // transient scene fields across snapshots.
        mem.current_scene = mergeCurrentSceneSnapshotV01129(mem.current_scene,r.current_scene);
    }
    // story_start is a per-chat hard anchor. Once established it must not drift
    // because of model summaries. Model output may only fill an empty legacy
    // memory; new chats are initialized locally before their first request.
    const lockedStart = String(mem.story_start || '').trim();
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

    // v0.11.30 restores the active scene calendar after legacy continuity
    // calibration.  This is date/time metadata repair only; events and sources
    // are preserved.
    repairNarrativeCalendarV01130(mem,endIndex-1);

    // The latest source row, not the numerically greatest ISO date, represents
    // the active story scene.
    syncCurrentDateFromTimeline(mem, modelCurrentDate);
    resolveCurrentNarrativeStateV01130(mem,endIndex-1);

    // v0.10.6：
    // 只有 timeline/date 校准完成后，才用 canonical story time
    // 纠正“明确未来却被标成 in_progress”的确定性矛盾。
    guardOpenLoopsTemporalV0105(mem);
    pruneExpiredOpenLoopsV0106(mem);
    unifiedPostProcessV01114(mem,{range:startIndexV0112==null?null:[startIndexV0112,endIndex-1],audit:false});
    repairNarrativeCalendarV01130(mem,endIndex-1);
    resolveCurrentNarrativeStateV01130(mem,endIndex-1);
    restoreMissingCurrentLocationV01129(mem,endIndex-1);

    if (options?.advanceCursor !== false) {
        mem.last_processed_index = endIndex - 1;
        mem.audit.push({
            at: new Date().toISOString(),
            processed_to: mem.last_processed_index,
            type: 'batch_commit_v0112',
            timeline_accepted: acceptedTimeline.length,
            timeline_rejected: rejectedTimeline.length,
            range: startIndexV0112 == null ? null : [startIndexV0112, endIndex-1]
        });
    }
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
2A. 双时间轴：timeline.date、current_story_date 和 current_story_time 表示“当前正在演出的剧情/场景时间”；/世界/现实时间表示 MVU 底层现实钟，插件会另行保存。若剧情明确进入带完整绝对日期的历史副本、模拟场景或闪回（例如从 2026 进入 2003），必须保留该场景日期，不能因为年份较小而改回 2026；“副本第N天/倒计时”仍不能自行推算绝对日期。
2B. 时间精度必须服从证据：只有同 source 的 canonical 正文、角色回复中明确标注“时间/日期”的结构化剧情摘要，或允许的当前状态元数据明确出现具体钟点，timeline.time 才能写 HH:MM。只知道时段时写“早晨/上午/中午/下午/晚间/深夜”；连时段也无法确认时写“时间未明确”。没有时间字段支持而由摘要模型自行补出的 15:00、15:20 等分钟不得伪装成“原文明示”。SillyTavern 消息头/发送时间始终不是剧情时间。
3. 如果上一场景是夜晚，后文明确“半夜2点/凌晨2点”等，必须考虑跨日。
3A. 月份锁：若已有可靠记忆处于某月，而“新增原始聊天”没有明确出现新的年月日、明确“下个月/数周后/一个月后”等跨月推进证据，禁止自行改变月份。
3B. 单独出现“17日/周五/早晨”等信息时，默认继承当前可靠月份；不得仅凭 AI 的 <date> 标签把 9 月推成 10 月。
3C. AI 的 <date> 只属于低优先级证据；若它造成无正文证据的跨月、倒退或大跨度跳跃，必须忽略该日期，并维持上一可靠时间。
3D. 若新增批次只是提及过去日期，只能作为旧事件/回忆补充，不得倒退当前状态；但同 source 的当前状态、结构化剧情摘要或明确场景标记若显示已经进入历史日历，则这是新的剧情时间段，应按 source 顺序采用。
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
9D. 唯一例外：插件可能提供 [SMM_WORLD_STATE_META #N ...]，它只含白名单中的 /世界/当前日期、/世界/当前时间、/世界/当前地点、/世界/现实日期、/世界/现实时间、/世界/现实地点，且只用于校准该 #N assistant 回复结束时的 date/time/location；不得据此创造剧情事实、关系变化、人物行为或其他变量。普通世界状态元数据与正文冲突时正文优先；/世界/现实时间是独立 MVU 现实钟。若同 source 的预设剧情摘要明确给出当前场景的完整日期，则 timeline/current_story 使用场景日期，现实钟不得覆盖它。
9E. 本批输出必须是“语义总结”，不是逐楼摘抄。把连续 USER/CHARACTER 往来合并成少量完整事件，保留参与者、关键行动、原因、结果和对后续有用的状态变化；不要逐句复制玩家原话。
9F. USER 提议、询问、打算或尝试做某事，不自动等于该事已经完成；只有后续正文确认或明确描写结果时，才能把结果写成已发生事实。若 USER 消息本身以剧情正文明确完成了其角色动作，可以记录该动作，但仍应与后续回应合并概括。
9G. timeline 每条必须脱离上下文也能独立理解。30 条消息通常只保留真正有连续性价值的少量事件；同一场景的补充描写必须合并，不得形成变量流水账或聊天复述。
10. relationships 只记录文本已经支持的关系状态，不擅自把暧昧升级成恋爱/伴侣。
10A. characters 只保存人物自身资料与当前即时状态。
10B. characters 中只允许稳定字段 age/gender/identity/personality，以及当前状态字段 location/companion/physiology/outfit。
10C. 禁止在 characters 中输出 relationship/relationships/todo/to_do/agreement/agreements；人物关系必须写入顶层 relationships，未来事项必须写入 open_loops。
10D. 当前状态必须基于本批新增原始聊天；不要把旧人物卡里的 location/companion/physiology/outfit 原样复制成“当前状态”。
10E. 若本批没有足够证据确认某个瞬时字段，不得猜测。
10E-1. characters 只用于玩家、当前角色卡角色及反复参与主线的主要角色；次要人物必须写入顶层 npcs，不得同时出现在 characters 与 npcs。
10E-2. npcs 每项格式为 name/identity/brief/current_status/aliases/source。brief 只用一句紧凑事实说明其剧情作用，不建立完整人物卡，不推测人格或未来行为。
10E-3. 玩家、当前角色卡角色永远不是 NPC。角色卡/世界书候选名只有在真实聊天中反复出现，才可作为主要角色；其他已实际登场的次要参与者归入 npcs。
10E-4. 只有本批新增原始聊天中实际登场或被明确提及的人物才能新增为 NPC；世界书、隐藏规则、NPC 模板里尚未发生的名字严禁写入。
10E-5. 每个 NPC 必须提供本批内真实 source；没有可追溯 source 就不要输出。
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
                npcs:{type:'array',items:{type:'object',properties:{
                    name:{type:'string'}, identity:nullable(), brief:{type:'string'},
                    current_status:nullable(), aliases:{type:'array',items:{type:'string'}}, source:nullable()
                },required:['name','identity','brief','current_status','aliases','source']}},
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
                'npcs',
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
        stage_summaries: stageSummariesForPromptV01121(mem),
        semantic_anchors: (mem.semantic_anchors || []).slice(-24),
        timeline: (mem.timeline || []).slice(-16),
        characters: stableCharactersForPromptV0110(mem),
        npcs: Object.fromEntries(Object.entries(mem.npcs || {}).slice(-30)),
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

function errorTextDeepV01141(value) {
    const out=[];
    const seen=new WeakSet();
    const visit=(x,depth=0)=>{
        if(x==null||depth>5||out.join('\n').length>48000) return;
        if(typeof x==='string'||typeof x==='number'||typeof x==='boolean'){
            out.push(String(x)); return;
        }
        if(typeof x!=='object') return;
        if(seen.has(x)) return;
        seen.add(x);
        for(const key of ['name','message','stack','status','statusCode','code','body','data','response','cause','error','details']){
            try{ if(Object.hasOwn(x,key)) visit(x[key],depth+1); }catch(_){}
        }
        try{
            for(const key of Object.keys(x).slice(0,24)){
                if(['name','message','stack','status','statusCode','code','body','data','response','cause','error','details'].includes(key)) continue;
                visit(x[key],depth+1);
            }
        }catch(_){}
    };
    visit(value);
    return out.join('\n').slice(0,48000);
}

function cloudflareCodeV01141(value) {
    const text=errorTextDeepV01141(value);
    const patterns=[
        /error\s*code\s*(52[0-6])\b/i,
        /errorcode[_\s-]*(52[0-6])\b/i,
        /cloudflare[^\n]{0,300}\b(52[0-6])\b/i,
        /\b(?:http(?:\s+status)?|status|error)\s*[:=_-]?\s*(52[0-6])\b/i,
        /cloudflare-5xx-errors\/error-(52[0-6])\b/i
    ];
    for(const re of patterns){ const m=text.match(re); if(m) return Number(m[1]); }
    return null;
}

function isUpstreamGatewayFailureV01129(value) {
    if(value?.isStoryMemoryGatewayFailure) return true;
    return Number.isInteger(cloudflareCodeV01141(value));
}

function upstreamGatewayErrorV01129(value,label='总结接口') {
    if(value?.isStoryMemoryGatewayFailure) return value;
    const code=cloudflareCodeV01141(value);
    const e=new Error(`${label}返回 Cloudflare ${code||'5xx'}（上游服务异常）；本批未写入，也不会自动重复请求。`);
    e.name='StoryMemoryGatewayError';
    e.isStoryMemoryGatewayFailure=true;
    e.smmGatewayCode=code;
    return e;
}

function rejectGatewayPayloadV01129(value,label='总结接口') {
    if(isUpstreamGatewayFailureV01129(value)) throw upstreamGatewayErrorV01129(value,label);
    return value;
}

function costProtectionDisabledV01147(s=S()) {
    return String(s?.costProtectionPolicyV01147||'')==='disabled_user_requested';
}

function summaryProfileCircuitOpenV01141(s=S()) {
    if(costProtectionDisabledV01147(s)) return false;
    if(String(s.summaryProvider||'current')!=='profile') return false;
    if(!s.summaryProfileCircuitOpen) return false;
    const lockedProfile=String(s.summaryProfileCircuitProfileId||'');
    const selected=String(s.summaryProfileId||'');
    return !lockedProfile || !selected || lockedProfile===selected;
}

function lockSummaryProfileV01141(reason,value=null) {
    const s=S();
    if(String(s.summaryProvider||'current')!=='profile') return;
    if(costProtectionDisabledV01147(s)){
        s.summaryProfileCircuitOpen=false;
        s.summaryProfileCircuitReason='';
        s.summaryProfileCircuitAt='';
        s.summaryProfileCircuitProfileId='';
        try{ saveSettings(); }catch(_){}
        return;
    }
    const code=cloudflareCodeV01141(value);
    s.summaryProfileCircuitOpen=true;
    s.summaryProfileCircuitReason=code ? `Cloudflare ${code}` : String(reason||'独立 API 请求失败').slice(0,180);
    s.summaryProfileCircuitAt=new Date().toISOString();
    s.summaryProfileCircuitProfileId=String(s.summaryProfileId||'');
    try{ saveSettings(); }catch(_){}
}

function unlockSummaryProfileV01141() {
    const s=S();
    s.summaryProfileCircuitOpen=false;
    s.summaryProfileCircuitReason='';
    s.summaryProfileCircuitAt='';
    s.summaryProfileCircuitProfileId='';
    try{ saveSettings(); }catch(_){}
}

function assertSummaryProfileUnlockedV01141() {
    const s=S();
    if(!summaryProfileCircuitOpenV01141(s)) return;
    const reason=String(s.summaryProfileCircuitReason||'上次独立 API 请求失败');
    const e=new Error(`独立 API 已被费用保护锁定（${reason}）。本次未调用 API、未扣费。请在“总结模型”中手动解除锁定后再操作。`);
    e.name='StoryMemoryProfileCircuitOpenError';
    e.isStoryMemoryProfileCircuitOpen=true;
    throw e;
}

// =========================================================
// v0.11.42 direct external API transport
// Mirrors Memory Palace's minimal OpenAI-compatible request shape instead of
// routing the request through ConnectionManagerRequestService.
// =========================================================
function normalizeExternalApiBaseV01142(value='') {
    return String(value||'').trim()
        .replace(/\/+$/,'')
        .replace(/\/chat\/completions$/i,'')
        .replace(/\/completions$/i,'')
        .replace(/\/models$/i,'');
}

function externalApiChatUrlV01142(value='') {
    const base=normalizeExternalApiBaseV01142(value);
    return base ? `${base}/chat/completions` : '';
}

function externalApiModelsUrlV01142(value='') {
    const base=normalizeExternalApiBaseV01142(value);
    return base ? `${base}/models` : '';
}

function externalApiFingerprintV01142(s=S()) {
    return JSON.stringify([
        normalizeExternalApiBaseV01142(s.summaryExternalApiUrl||''),
        String(s.summaryExternalApiModel||'').trim()
    ]);
}

function externalApiVerifiedV01142(s=S()) {
    if(!normalizeExternalApiBaseV01142(s.summaryExternalApiUrl||'') || !String(s.summaryExternalApiModel||'').trim()) return false;
    const fp=externalApiFingerprintV01142(s);
    return fp===String(s.summaryExternalVerifiedFingerprint||'');
}

function externalApiCircuitOpenV01142(s=S()) {
    if(costProtectionDisabledV01147(s)) return false;
    return !!s.summaryExternalCircuitOpen;
}

function lockExternalApiV01142(reason,value=null) {
    const s=S();
    if(costProtectionDisabledV01147(s)){
        s.summaryExternalCircuitOpen=false;
        s.summaryExternalCircuitReason='';
        s.summaryExternalCircuitAt='';
        try{ saveSettings(); }catch(_){}
        return;
    }
    const code=cloudflareCodeV01141(value);
    s.summaryExternalCircuitOpen=true;
    s.summaryExternalCircuitReason=code?`Cloudflare ${code}`:String(reason||'直接外部 API 请求失败').slice(0,180);
    s.summaryExternalCircuitAt=new Date().toISOString();
    try{ saveSettings(); }catch(_){}
}

function unlockExternalApiV01142() {
    const s=S();
    s.summaryExternalCircuitOpen=false;
    s.summaryExternalCircuitReason='';
    s.summaryExternalCircuitAt='';
    try{ saveSettings(); }catch(_){}
}

function invalidateExternalApiVerificationV01142({clearCircuit=true}={}) {
    const s=S();
    s.summaryExternalVerifiedFingerprint='';
    s.summaryExternalVerifiedAt='';
    if(clearCircuit){
        s.summaryExternalCircuitOpen=false;
        s.summaryExternalCircuitReason='';
        s.summaryExternalCircuitAt='';
    }
    try{ saveSettings(); }catch(_){}
}

function assertExternalApiReadyV01142() {
    const s=S();
    if(externalApiCircuitOpenV01142(s)){
        const e=new Error(`直接外部 API 已被费用保护锁定（${String(s.summaryExternalCircuitReason||'上次请求失败')}）。本次未调用 API、未扣费。请先重新执行“检查连接与模型”。`);
        e.name='StoryMemoryExternalCircuitOpenError';
        e.isStoryMemoryExternalCircuitOpen=true;
        throw e;
    }
    if(!externalApiVerifiedV01142(s)){
        const e=new Error('直接外部 API 尚未通过“检查连接与模型”。本次未调用 Chat Completion、未产生总结费用。');
        e.name='StoryMemoryExternalNotVerifiedError';
        e.isStoryMemoryExternalNotVerified=true;
        throw e;
    }
}

async function fetchWithTimeoutV01142(url,options={},timeoutMs=20000) {
    const controller=typeof AbortController==='function'?new AbortController():null;
    const timer=setTimeout(()=>controller?.abort(),timeoutMs);
    try{
        return await fetch(url,{...options,...(controller?{signal:controller.signal}:{})});
    }catch(e){
        if(e?.name==='AbortError') throw new Error(timeoutMs<=20000?'连接检查超过20秒':'请求超时');
        throw e;
    }finally{
        clearTimeout(timer);
    }
}

async function fetchExternalModelsV01143() {
    const s=S();
    const url=externalApiModelsUrlV01142(s.summaryExternalApiUrl||'');
    if(!url) throw new Error('请先填写直接 API 地址，例如 https://api.example.com/v1');
    // Model discovery is a non-completion GET. It never submits chat content.
    invalidateExternalApiVerificationV01142({clearCircuit:false});
    s.summaryExternalModels=[];
    s.summaryExternalModelsBase='';
    s.summaryExternalModelsFetchedAt='';
    const headers={};
    const key=String(s.summaryExternalApiKey||'').trim();
    if(key) headers.Authorization=`Bearer ${key}`;
    let response;
    try{
        response=await fetchWithTimeoutV01142(url,{method:'GET',headers},20000);
    }catch(e){
        invalidateExternalApiVerificationV01142({clearCircuit:false});
        throw new Error(`无法连接 /models：${e?.message||e}`);
    }
    const raw=await response.text();
    if(!response.ok){
        const err=new Error(`连接检查失败：HTTP ${response.status}`);
        err.status=response.status;
        err.body=raw;
        invalidateExternalApiVerificationV01142({clearCircuit:false});
        if(isUpstreamGatewayFailureV01129(err)) throw upstreamGatewayErrorV01129(err,'直接 API /models');
        throw err;
    }
    let data;
    try{ data=JSON.parse(raw); }catch(_){ throw new Error('/models 返回的不是 JSON；未发送 Chat Completion。'); }
    const rows=Array.isArray(data?.data)?data.data:(Array.isArray(data?.models)?data.models:[]);
    const models=[...new Set(rows.map(x=>String(typeof x==='string'?x:(x?.id||x?.name||'')).trim()).filter(Boolean))]
        .sort((a,b)=>a.localeCompare(b));
    if(!models.length){
        throw new Error('/models 未返回可验证的模型列表；未发送 Chat Completion。');
    }
    s.summaryExternalModels=models;
    s.summaryExternalModelsBase=normalizeExternalApiBaseV01142(s.summaryExternalApiUrl||'');
    s.summaryExternalModelsFetchedAt=new Date().toISOString();
    const selected=String(s.summaryExternalApiModel||'').trim();
    if(selected && models.includes(selected)){
        s.summaryExternalVerifiedFingerprint=externalApiFingerprintV01142(s);
        s.summaryExternalVerifiedAt=new Date().toISOString();
        s.summaryExternalCircuitOpen=false;
        s.summaryExternalCircuitReason='';
        s.summaryExternalCircuitAt='';
    }
    try{ saveSettings(); }catch(_){ }
    return {models,url,selected:models.includes(selected)?selected:''};
}

function selectExternalModelV01143(modelValue) {
    const s=S();
    const model=String(modelValue||'').trim();
    const models=Array.isArray(s.summaryExternalModels)?s.summaryExternalModels:[];
    const currentBase=normalizeExternalApiBaseV01142(s.summaryExternalApiUrl||'');
    if(!model || !models.includes(model) || currentBase!==String(s.summaryExternalModelsBase||'')){
        s.summaryExternalApiModel=model;
        invalidateExternalApiVerificationV01142({clearCircuit:false});
        throw new Error('所选模型不是本次 /models 拉取结果，请重新拉取模型。');
    }
    s.summaryExternalApiModel=model;
    s.summaryExternalVerifiedFingerprint=externalApiFingerprintV01142(s);
    s.summaryExternalVerifiedAt=new Date().toISOString();
    s.summaryExternalCircuitOpen=false;
    s.summaryExternalCircuitReason='';
    s.summaryExternalCircuitAt='';
    try{ saveSettings(); }catch(_){}
    return {model,models};
}

async function verifyExternalApiV01142() {
    const s=S();
    const model=String(s.summaryExternalApiModel||'').trim();
    if(!model) throw new Error('请先拉取模型并从下拉列表选择一个模型。');
    const result=await fetchExternalModelsV01143();
    if(!result.models.includes(model)){
        throw new Error(`模型“${model}”不在 /models 返回列表中。可用示例：${result.models.slice(0,8).join('、')}`);
    }
    return {...result,...selectExternalModelV01143(model)};
}

function externalResponseTextV01142(data) {
    if(typeof data==='string') return data;
    const content=data?.choices?.[0]?.message?.content;
    if(typeof content==='string') return content;
    if(Array.isArray(content)){
        const text=content.map(x=>typeof x==='string'?x:String(x?.text||'')).filter(Boolean).join('\n');
        if(text) return text;
    }
    if(Array.isArray(data?.content)){
        const text=data.content.map(x=>typeof x==='string'?x:String(x?.text||'')).filter(Boolean).join('\n');
        if(text) return text;
    }
    if(typeof data?.content==='string') return data.content;
    if(typeof data?.output_text==='string') return data.output_text;
    return '';
}

async function generateViaExternalApiV01142({prompt='',systemPrompt='',jsonSchema=null}={}) {
    const s=S();
    assertExternalApiReadyV01142();
    const url=externalApiChatUrlV01142(s.summaryExternalApiUrl||'');
    const key=String(s.summaryExternalApiKey||'').trim();
    const model=String(s.summaryExternalApiModel||'').trim();
    const requestPrompt=promptWithCompactJsonSkeletonV01140(prompt,jsonSchema);
    const merged=[String(systemPrompt||'').trim(),String(systemPrompt||'').trim()?'---':'',requestPrompt]
        .filter(Boolean).join('\n\n');
    const messages=[{role:'user',content:merged}];
    assertRequestSizeV01140(messages,'直接外部 API 请求');
    const headers={'Content-Type':'application/json'};
    if(key) headers.Authorization=`Bearer ${key}`;
    // Memory Palace compatibility: minimal body only. Do not attach schema,
    // presets, instruct metadata or provider-specific response_format fields.
    const body={messages};
    if(model) body.model=model;
    let response;
    try{
        response=await fetchWithTimeoutV01142(url,{method:'POST',headers,body:JSON.stringify(body)},SMM_GENERATE_TIMEOUT_MS);
        const raw=await response.text();
        if(!response.ok){
            const err=new Error(`直接外部 API 请求失败：HTTP ${response.status}`);
            err.status=response.status;
            err.body=raw;
            throw err;
        }
        let data;
        try{ data=JSON.parse(raw); }catch(_){
            const err=new Error('直接外部 API 返回的不是 JSON');
            err.body=raw;
            throw err;
        }
        const text=externalResponseTextV01142(data);
        if(!String(text).trim()) throw new Error('直接外部 API 返回正文为空');
        rejectGatewayPayloadV01129(text,'直接外部 API');
        return String(text);
    }catch(e){
        if(e?.isStoryMemoryRequestTooLarge||e?.isStoryMemoryRequestCancelled||e?.isStoryMemoryExternalNotVerified||e?.isStoryMemoryExternalCircuitOpen) throw e;
        lockExternalApiV01142('直接外部 API 请求失败',e);
        if(isUpstreamGatewayFailureV01129(e)) throw upstreamGatewayErrorV01129(e,'直接外部 API');
        throw new Error(`直接外部 API 请求失败；费用保护已关闭，本次未自动重试、未写入记忆、未推进游标：${e?.message||e}`);
    }
}

function usingPaidProviderV01142(s=S()) {
    return String(s.summaryMode||'ai')==='ai' && ['profile','external'].includes(String(s.summaryProvider||'current'));
}

function selectedPaidProviderLockedV01142(s=S()) {
    const provider=String(s.summaryProvider||'current');
    if(provider==='external') return externalApiCircuitOpenV01142(s)||!externalApiVerifiedV01142(s);
    if(provider==='profile') return summaryProfileCircuitOpenV01141(s);
    return false;
}

function selectedPaidProviderReasonV01142(s=S()) {
    const provider=String(s.summaryProvider||'current');
    if(provider==='external'){
        if(externalApiCircuitOpenV01142(s)) return String(s.summaryExternalCircuitReason||'上次直接 API 请求失败');
        if(!externalApiVerifiedV01142(s)) return '尚未通过“检查连接与模型”';
    }
    if(provider==='profile'&&summaryProfileCircuitOpenV01141(s)) return String(s.summaryProfileCircuitReason||'上次 Profile 请求失败');
    return '';
}

function lockSelectedPaidProviderV01142(reason,value=null) {
    const provider=String(S().summaryProvider||'current');
    if(provider==='external') lockExternalApiV01142(reason,value);
    else if(provider==='profile') lockSummaryProfileV01141(reason,value);
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

// v0.11.36 follows SillyTavern Memory Palace's proven transport pattern:
// generateQuietPrompt accepts one `quietPrompt` field, so the system and user
// instructions must be merged before the call.  Keeping this in one request is
// important for unreliable/slow upstreams and prevents a malformed response
// from silently spending two more generations.
function generationTextV01136(value) {
    if (typeof value === 'string') return value;
    const structured = x => {
        if (!x || typeof x !== 'object') return '';
        try { return JSON.stringify(x); } catch (_) { return ''; }
    };
    const candidates = [
        value?.content,
        value?.text,
        value?.output_text,
        value?.message?.content,
        value?.data?.content,
        value?.data?.text,
        value?.choices?.[0]?.message?.content,
        value?.choices?.[0]?.text
    ];
    for (const item of candidates) {
        if (typeof item === 'string' && item.trim()) return item;
        const encoded = structured(item);
        if (encoded) return encoded;
    }
    return '';
}

// v0.11.40: Connection Profile backends do not share one structured-output
// dialect. Never attach a provider-specific response schema and never paste the
// full descriptive JSON Schema into the prompt. A compact example skeleton is
// enough to communicate the required shape; SMM still validates locally.
const SMM_INPUT_TOKEN_LIMIT_V01140 = 30000;
const SMM_INPUT_BYTE_LIMIT_V01140 = 120000;
const SMM_PROFILE_OUTPUT_TOKEN_LIMIT_V01140 = 3072;
// Legacy numeric limits are retained for compatibility, but v0.11.47 disabled
// size blocking. v0.11.48 uses this context only to show per-batch confirmation.
const SMM_HISTORY_BATCH_TOKEN_LIMIT_V01148 = 120000;
const SMM_HISTORY_BATCH_BYTE_LIMIT_V01148 = 480000;
let SMM_ACTIVE_HISTORY_BATCH_V01146 = null;

function compactSchemaExampleV01140(node, depth=0) {
    if (!node || typeof node !== 'object' || depth > 8) return null;
    const rawType=Array.isArray(node.type) ? node.type.find(x=>x!=='null') : node.type;
    if (rawType === 'object' || node.properties) {
        const out={};
        const props=node.properties && typeof node.properties==='object' ? node.properties : {};
        const keys=Array.isArray(node.required) && node.required.length ? node.required : Object.keys(props);
        for (const key of keys) if (Object.hasOwn(props,key)) out[key]=compactSchemaExampleV01140(props[key],depth+1);
        return out;
    }
    if (rawType === 'array') return [compactSchemaExampleV01140(node.items||{},depth+1)];
    if (Array.isArray(node.enum) && node.enum.length) return node.enum[0];
    if (rawType === 'boolean') return false;
    if (rawType === 'integer' || rawType === 'number') return 0;
    if (Array.isArray(node.type) && node.type.includes('null')) return null;
    return '';
}

function promptWithCompactJsonSkeletonV01140(prompt='', jsonSchema=null) {
    const shape=jsonSchema ? compactSchemaExampleV01140(jsonSchema?.value||jsonSchema) : null;
    return [
        jsonSchema ? '【输出 JSON 骨架（仅示例结构，不是待填写正文）】' : '',
        jsonSchema ? JSON.stringify(shape) : '',
        jsonSchema ? '只输出同结构的一个 JSON 对象；骨架中的数组示例项用于展示元素字段，无内容时改为空数组。没有内容的对象用 {}，可空标量用 null。不要输出 Markdown、代码围栏、前言或解释。字段语义、枚举和事实规则以上文任务要求为准。' : '',
        jsonSchema ? '---' : '',
        String(prompt || '').trim()
    ].filter(Boolean).join('\n\n');
}

function requestSizeStatsV01140(messages=[]) {
    const text=(Array.isArray(messages)?messages:[]).map(x=>String(x?.content||'')).join('\n');
    let ascii=0, nonAscii=0;
    for (const ch of text) {
        if (ch.codePointAt(0)<=0x7f) ascii++;
        else nonAscii++;
    }
    const estimatedTokens=Math.ceil(ascii/4 + nonAscii*1.1 + 64);
    const bytes=typeof TextEncoder==='function' ? new TextEncoder().encode(text).length : text.length*3;
    return {characters:text.length,bytes,estimatedTokens};
}

function assertRequestSizeV01140(messages,label='总结请求') {
    const stats=requestSizeStatsV01140(messages);
    const protectionDisabled=costProtectionDisabledV01147();
    const historicalBatch=!!SMM_ACTIVE_HISTORY_BATCH_V01146?.historicalBatch;
    const tokenLimit=historicalBatch?SMM_HISTORY_BATCH_TOKEN_LIMIT_V01148:SMM_INPUT_TOKEN_LIMIT_V01140;
    const byteLimit=historicalBatch?SMM_HISTORY_BATCH_BYTE_LIMIT_V01148:SMM_INPUT_BYTE_LIMIT_V01140;
    if (!protectionDisabled&&(stats.estimatedTokens>tokenLimit || stats.bytes>byteLimit)) {
        const e=new Error(
            `${label}在发送前已被本地阻止：预计输入约 ${stats.estimatedTokens.toLocaleString()} tokens、${stats.bytes.toLocaleString()} bytes，超过安全上限。`+
            '本次未调用 API、未扣费；未写入记忆、未推进游标，原楼层仍保留。请缩小每批楼层数后重试。'
        );
        e.name='StoryMemoryRequestTooLargeError';
        e.isStoryMemoryRequestTooLarge=true;
        e.smmRequestStatsV01140=stats;
        throw e;
    }
    if(historicalBatch&&!SMM_ACTIVE_HISTORY_BATCH_V01146.confirmed){
        const ctx=SMM_ACTIVE_HISTORY_BATCH_V01146;
        const accepted=confirm(
            `准备发送历史补总结（本批实际 ${ctx.count} 条，#${ctx.start}-#${ctx.end-1}）。\n\n`+
            `预计输入：${stats.estimatedTokens.toLocaleString()} tokens / ${stats.bytes.toLocaleString()} bytes。\n\n`+
            `历史范围还剩 ${ctx.remainingBefore} 条（本批后预计剩 ${Math.max(0,ctx.remainingBefore-ctx.count)} 条）。\n\n`+
            '费用保护已全部关闭：本次没有输入长度上限，失败后也不会锁定接口。请求可能在已经计费后返回 520/524；插件不会自动重试，失败也不会写入记忆或推进游标。\n\n确定发送这一次付费请求吗？'
        );
        if(!accepted){
            const e=new Error('你已取消本次历史补总结。本次未调用 API、未扣费，游标未推进。');
            e.name='StoryMemoryRequestCancelledError';
            e.isStoryMemoryRequestCancelled=true;
            throw e;
        }
        ctx.confirmed=true;
    }
    return stats;
}

async function generateCurrentQuietV01136({prompt='', systemPrompt='', jsonSchema=null}={}) {
    const context = C();
    if (!context || typeof context.generateQuietPrompt !== 'function') {
        throw new Error('当前 SillyTavern 未提供 generateQuietPrompt，无法复用当前聊天模型进行静默总结。');
    }
    const requestPrompt=promptWithCompactJsonSkeletonV01140(prompt,jsonSchema);
    const merged = [
        String(systemPrompt || '').trim(),
        String(systemPrompt || '').trim() ? '---' : '',
        requestPrompt
    ].filter(Boolean).join('\n\n');
    if (!merged) throw new Error('总结提示词为空');
    assertRequestSizeV01140([{role:'user',content:merged}],'当前模型总结请求');
    const result = await context.generateQuietPrompt({quietPrompt: merged});
    const text = generationTextV01136(result);
    if (!String(text).trim()) throw new Error('当前聊天模型返回为空');
    return String(text);
}

async function smmGenerateV093({
    prompt='',
    systemPrompt='',
    jsonSchema=null,
    responseLength=null
}={}) {
    const s = S();
    const provider = String(s.summaryProvider || 'current');

    if(provider==='external'){
        return await generateViaExternalApiV01142({prompt,systemPrompt,jsonSchema});
    }

    // Default: reuse the already configured chat model.  This is a quiet
    // background generation, not a separate API/Profile.
    if (provider !== 'profile') {
        return await generateCurrentQuietV01136({prompt, systemPrompt, jsonSchema});
    }

    const profileId = String(s.summaryProfileId || '').trim();

    if (!profileId) {
        throw new Error('已选择独立总结 Profile，但尚未设置 summaryProfileId');
    }

    assertSummaryProfileUnlockedV01141();

    let requestStarted=false;
    try {
        const Service = await getSmmConnectionServiceV093();

        const profilePrompt=promptWithCompactJsonSkeletonV01140(prompt,jsonSchema);
        const messages = [
            ...(systemPrompt
                ? [{role:'system', content:String(systemPrompt)}]
                : []),
            {role:'user', content:profilePrompt}
        ];

        const maxTokens = Math.max(512,Math.min(
            SMM_PROFILE_OUTPUT_TOKEN_LIMIT_V01140,
            Number(responseLength || s.summaryMaxTokens || 3072)
        ));

        // This check runs before Service.sendRequest. A rejected oversized batch
        // therefore cannot consume provider credits and remains retryable.
        const requestStats=assertRequestSizeV01140(messages,'独立总结 API 请求');

        const profile = typeof Service.getProfile === 'function' ? Service.getProfile(profileId) : null;
        // Keep transport metadata for diagnostics, but never attach a generic
        // json_schema override. Connection Manager can route the same Profile
        // through OpenAI, Claude, Gemini or a compatible gateway, whose native
        // response-schema dialects are not interchangeable.
        let selectedApiMap = null;
        try { selectedApiMap = typeof Service.validateProfile === 'function' ? Service.validateProfile(profile) : null; } catch (_) {}
        const overridePayload = {};
        if (jsonSchema) {
            console.debug('[StoryMemory] v0.11.41 summary transport', {
                profileId,
                profileMode: profile?.mode || null,
                selected: selectedApiMap?.selected || null,
                source: selectedApiMap?.source || null,
                structuredJson: false,
                schemaDelivery: 'compact_skeleton',
                requestStats,
                maxTokens
            });
        }

        requestStarted=true;
        const response = await Service.sendRequest(
            profileId,
            messages,
            maxTokens,
            {
                extractData:true,
                // A summary profile should provide its API/model connection only.
                // Loading the saved RP/chat preset can inject unrelated generation
                // behavior and make JSON-only summary jobs drift into prose.
                includePreset:false,
                // Keep instruct formatting for text-completion profiles; chat-completion
                // profiles ignore this setting.
                includeInstruct:true,
                stream:false
            },
            overridePayload
        );

        // v0.11.40: independent profiles receive only a compact JSON skeleton and
        // are validated locally, avoiding provider-specific response_schema failures.
        // v0.11.23: ConnectionManager's extracted response may legally separate
        // final content and reasoning. Some reasoning-capable profiles occasionally
        // return an empty `content` while putting the requested JSON in `reasoning`.
        // Prefer final content, but recover a JSON payload from reasoning instead of
        // treating a successful request as an empty response.
        const pickString = (...xs) => {
            for (const x of xs) {
                if (typeof x === 'string' && x.trim()) return x;
            }
            return '';
        };

        const stringifyStructured = (x) => {
            if (!x || typeof x !== 'object') return '';
            try { return JSON.stringify(x); } catch (_) { return ''; }
        };

        let text = pickString(
            typeof response === 'string' ? response : '',
            typeof response?.content === 'string' ? response.content : '',
            stringifyStructured(response?.content),
            response?.text,
            typeof response?.message === 'string' ? response.message : '',
            typeof response?.message?.content === 'string' ? response.message.content : '',
            stringifyStructured(response?.message?.content),
            typeof response?.data?.content === 'string' ? response.data.content : '',
            stringifyStructured(response?.data?.content),
            response?.data?.text,
            typeof response?.choices?.[0]?.message?.content === 'string' ? response.choices[0].message.content : '',
            stringifyStructured(response?.choices?.[0]?.message?.content),
            response?.choices?.[0]?.text
        );

        if (!text) {
            const reasoning = pickString(
                response?.reasoning,
                response?.message?.reasoning,
                response?.message?.reasoning_content,
                response?.state?.reasoning,
                response?.choices?.[0]?.message?.reasoning,
                response?.choices?.[0]?.message?.reasoning_content
            );

            if (reasoning) {
                let usable = false;
                try {
                    // Summary requests are JSON-oriented. Only consume reasoning when
                    // it actually contains a recoverable JSON object; do not promote
                    // arbitrary chain-of-thought prose into canonical memory.
                    parseJSON(reasoning);
                    usable = true;
                } catch (_) {}

                if (usable) {
                    console.warn('[StoryMemory] v0.11.29 profile content empty; recovered JSON from reasoning channel');
                    text = reasoning;
                }
            }
        }

        if (!String(text).trim()) {
            const contentLen = typeof response?.content === 'string' ? response.content.length : 0;
            const reasoningLen = typeof response?.reasoning === 'string' ? response.reasoning.length : 0;
            console.warn('[StoryMemory] v0.11.29 empty profile response', {
                contentLen, reasoningLen, responseKeys: response && typeof response === 'object' ? Object.keys(response) : []
            });
            throw new Error('独立总结 Profile 正文为空，且未找到可恢复的 JSON 输出');
        }

        return String(text);

    } catch (e) {
        // v0.11.40: every failure is terminal for this batch. 400, 524, timeout,
        // empty/non-JSON responses and local preflight rejection must never turn
        // into an automatic second paid generation through another connection.
        if(e?.isStoryMemoryRequestTooLarge||e?.isStoryMemoryRequestCancelled) throw e;
        if(e?.isStoryMemoryProfileCircuitOpen) throw e;
        if(requestStarted) lockSummaryProfileV01141('独立 API 请求失败',e);
        if(isUpstreamGatewayFailureV01129(e)) throw upstreamGatewayErrorV01129(e,'独立总结 Profile');
        throw new Error(
            '独立总结 Profile 请求失败；费用保护已关闭，本次未自动重试或回退：' + (e?.message || e)
        );
    }
}


// =========================================================
// v0.11.21 stage / chapter summaries
// Built from existing canonical long-term memory only; never re-reads or rewrites
// the original chat JSONL. This is a compression layer above timeline events.
// =========================================================
function stageSummarySchemaV01121() {
    const nullable=()=>({type:['string','null']});
    return {
        name:'StoryMemoryStageSummaries',
        strict:true,
        value:{
            '$schema':'http://json-schema.org/draft-04/schema#',
            type:'object',
            properties:{
                stages:{
                    type:'array', minItems:1, maxItems:3,
                    items:{
                        type:'object',
                        properties:{
                            title:{type:'string'},
                            summary:{type:'string'},
                            start_source:{type:'string'},
                            end_source:{type:'string'},
                            start_date:nullable(),
                            end_date:nullable(),
                            key_events:{type:'array',items:{type:'string'}},
                            relationship_changes:{type:'array',items:{type:'string'}},
                            state_at_end:{type:'string'},
                            open_threads:{type:'array',items:{type:'string'}}
                        },
                        required:['title','summary','start_source','end_source','start_date','end_date','key_events','relationship_changes','state_at_end','open_threads']
                    }
                }
            },
            required:['stages']
        }
    };
}

function stageTimelineRowsV01121(mem=M()) {
    return (Array.isArray(mem?.timeline) ? mem.timeline : [])
        .filter(e=>e && typeof e==='object' && String(e.event||'').trim() && validRealSourceV0112(e.source))
        .map((e,i)=>({...e,__i:i,__first:sourceFirst(e.source),__last:sourceLast(e.source)}))
        .filter(e=>Number.isFinite(e.__first) && e.__first>=0 && Number.isFinite(e.__last) && e.__last>=0)
        .sort((a,b)=>(a.__first-b.__first)||(a.__last-b.__last)||(a.__i-b.__i));
}

function stageSummaryReadinessV01121(mem=M()) {
    const rows=stageTimelineRowsV01121(mem);
    const gaps=timelineCoverageGapsV0112(mem);
    const deferred=localDeferredCountV01133(mem);
    const last=rows.length ? Math.max(...rows.map(x=>x.__last)) : -1;
    if(deferred) return {ready:false,reason:`仍有 ${deferred} 楼已扫描但尚未形成记忆；请先运行“补录已跳过楼层（0 API）”`,events:rows.length,last};
    if(gaps.length) return {ready:false,reason:`时间线仍有断档 #${gaps[0].start}-#${gaps[0].end}`,events:rows.length,last};
    if(rows.length<6) return {ready:false,reason:`有效时间线只有 ${rows.length} 条；建议至少积累 6 条后再生成`,events:rows.length,last};
    return {ready:true,reason:'可以生成阶段大总结',events:rows.length,last};
}

function chunkStageTimelineV01121(rows) {
    // v0.11.26: deterministic macro-stage input windows. One AI result is requested
    // per window, so we keep each request small enough to avoid long-form drift while
    // still producing roughly 8-15 macro stages for a very long RP.
    const chunks=[];
    let cur=[];
    let first=null;
    const flush=()=>{ if(cur.length){ chunks.push(cur); cur=[]; first=null; } };
    for(const row of rows){
        if(first==null) first=row.__first;
        const span=row.__last-first;
        if(cur.length && (cur.length>=30 || (span>300 && cur.length>=10))){ flush(); first=row.__first; }
        cur.push(row);
    }
    flush();
    return chunks;
}

function stageRelevantAnchorsV01121(mem,start,end) {
    const anchors=Array.isArray(mem?.semantic_anchors)?mem.semantic_anchors:[];
    return anchors.filter(a=>{
        const f=sourceFirst(a?.source), l=sourceLast(a?.source);
        return Number.isFinite(f)&&Number.isFinite(l)&&l>=start&&f<=end;
    }).slice(-20).map(a=>({event:a.event,intent:a.intent,continuity_rule:a.continuity_rule,source:a.source}));
}

function sanitizeStageTextV01121(v,max=600) {
    return String(v??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}

function stageArrayFromParsedV01125(parsed) {
    if(!parsed || typeof parsed!=='object') return [];
    const candidates=[
        parsed.stages,
        parsed.stage_summaries,
        parsed.chapters,
        parsed.value?.stages,
        parsed.data?.stages,
        parsed.result?.stages
    ];
    for(const x of candidates) if(Array.isArray(x)) return x;
    return [];
}


function stageSummarySchemaV01126() {
    const nullable=()=>({type:['string','null']});
    return {
        name:'StoryMemorySingleStage',
        strict:true,
        value:{
            '$schema':'http://json-schema.org/draft-04/schema#',
            type:'object',
            additionalProperties:false,
            properties:{
                title:{type:'string'},
                summary:{type:'string'},
                key_events:{type:'array',maxItems:6,items:{type:'string'}},
                relationship_changes:{type:'array',maxItems:4,items:{type:'string'}},
                state_at_end:{type:'string'},
                open_threads:{type:'array',maxItems:4,items:{type:'string'}}
            },
            required:['title','summary','key_events','relationship_changes','state_at_end','open_threads']
        }
    };
}

function stageObjectFromParsedV01126(parsed) {
    if(!parsed || typeof parsed!=='object') return null;
    const directCandidates=[
        parsed,
        parsed.stage,
        parsed.chapter,
        parsed.value,
        parsed.data,
        parsed.result,
        parsed.value?.stage,
        parsed.data?.stage,
        parsed.result?.stage
    ];
    for(const x of directCandidates){
        if(x && typeof x==='object' && !Array.isArray(x) && String(x.summary||'').trim()) return x;
    }
    const arr=stageArrayFromParsedV01125(parsed);
    if(!arr.length) return null;
    const valid=arr.filter(x=>x&&typeof x==='object'&&String(x.summary||'').trim());
    if(!valid.length) return null;
    if(valid.length===1) return valid[0];
    // A provider may ignore the requested single-stage schema and still return an
    // array. Merge it locally instead of failing the entire long-chat job.
    return {
        title:valid.map(x=>sanitizeStageTextV01121(x.title,45)).filter(Boolean).join(' → ').slice(0,90),
        summary:valid.map(x=>sanitizeStageTextV01121(x.summary,420)).filter(Boolean).join('；').slice(0,900),
        key_events:valid.flatMap(x=>Array.isArray(x.key_events)?x.key_events:[]).slice(0,8),
        relationship_changes:valid.flatMap(x=>Array.isArray(x.relationship_changes)?x.relationship_changes:[]).slice(0,6),
        state_at_end:sanitizeStageTextV01121(valid.at(-1)?.state_at_end,360),
        open_threads:valid.flatMap(x=>Array.isArray(x.open_threads)?x.open_threads:[]).slice(-5)
    };
}

function representativeStageRowsV01126(chunk, max=6) {
    if(!Array.isArray(chunk)||!chunk.length) return [];
    if(chunk.length<=max) return [...chunk];
    const idx=new Set([0,chunk.length-1]);
    for(let i=1;i<max-1;i++) idx.add(Math.round(i*(chunk.length-1)/(max-1)));
    return [...idx].sort((a,b)=>a-b).slice(0,max).map(i=>chunk[i]).filter(Boolean);
}

function stageOpenThreadsLocalV01126(mem,start,end) {
    const loops=Array.isArray(mem?.open_loops)?mem.open_loops:[];
    return loops.filter(x=>{
        if(!x||typeof x!=='object') return false;
        const f=sourceFirst(x.source), l=sourceLast(x.source);
        if(!Number.isFinite(f)||!Number.isFinite(l)) return false;
        return l>=start && f<=end;
    }).map(x=>sanitizeStageTextV01121(x.description,160)).filter(Boolean).slice(0,4);
}

function localStageFallbackV01126(chunk, mem=M(), chunkNo=1, reason='') {
    const start=Math.min(...chunk.map(x=>x.__first));
    const end=Math.max(...chunk.map(x=>x.__last));
    const reps=representativeStageRowsV01126(chunk,6);
    const firstDate=chunk.map(r=>normalizeDateInput(r.date||'')?.iso).find(Boolean)||null;
    const lastDate=[...chunk].reverse().map(r=>normalizeDateInput(r.date||'')?.iso).find(Boolean)||null;
    const keyEvents=reps.map(r=>sanitizeStageTextV01121(r.event,180)).filter(Boolean);
    const relationshipChanges=chunk
        .filter(r=>/(关系|承诺|约定|信任|暧昧|恋|婚|亲吻|冲突|决裂|同盟|伴侣|背叛|和解|好感)/.test(String(r.event||'')))
        .map(r=>sanitizeStageTextV01121(r.event,180)).filter(Boolean).slice(0,4);
    const tail=chunk.slice(-2).map(r=>sanitizeStageTextV01121(r.event,180)).filter(Boolean);
    const dateLabel=firstDate ? (lastDate&&lastDate!==firstDate?`${firstDate} → ${lastDate}`:firstDate) : `#${start}-#${end}`;
    return {
        id:`stage_${start}_${end}`,
        title:`剧情阶段 ${chunkNo} · ${dateLabel}`.slice(0,90),
        summary:keyEvents.join('；').slice(0,850) || `该阶段覆盖已确认长期记忆 #${start}-#${end}。`,
        start_index:start,
        end_index:end,
        source_range:`#${start}-#${end}`,
        start_date:firstDate,
        end_date:lastDate,
        key_events:keyEvents.slice(0,6),
        relationship_changes:relationshipChanges,
        state_at_end:tail.join('；').slice(0,360),
        open_threads:stageOpenThreadsLocalV01126(mem,start,end),
        generation_mode:'local_fallback',
        fallback_reason:sanitizeStageTextV01121(reason,180)
    };
}

function normalizeSingleStageV01126(parsed, chunk, chunkNo) {
    const x=stageObjectFromParsedV01126(parsed);
    if(!x) throw new Error(`第 ${chunkNo} 组没有返回可识别的阶段对象`);
    const start=Math.min(...chunk.map(r=>r.__first));
    const end=Math.max(...chunk.map(r=>r.__last));
    const firstDate=chunk.map(r=>normalizeDateInput(r.date||'')?.iso).find(Boolean)||null;
    const lastDate=[...chunk].reverse().map(r=>normalizeDateInput(r.date||'')?.iso).find(Boolean)||null;
    const title=sanitizeStageTextV01121(x.title,90)||`剧情阶段 ${chunkNo}`;
    const summary=sanitizeStageTextV01121(x.summary,850);
    if(!summary || isMetaInstructionSignal({title,summary})) throw new Error(`第 ${chunkNo} 组阶段正文为空或含元指令`);
    return {
        id:`stage_${start}_${end}`,
        title,
        summary,
        start_index:start,
        end_index:end,
        source_range:`#${start}-#${end}`,
        start_date:firstDate,
        end_date:lastDate,
        key_events:(Array.isArray(x.key_events)?x.key_events:[]).map(v=>sanitizeStageTextV01121(v,180)).filter(Boolean).slice(0,6),
        relationship_changes:(Array.isArray(x.relationship_changes)?x.relationship_changes:[]).map(v=>sanitizeStageTextV01121(v,180)).filter(Boolean).slice(0,4),
        state_at_end:sanitizeStageTextV01121(x.state_at_end,360),
        open_threads:(Array.isArray(x.open_threads)?x.open_threads:[]).map(v=>sanitizeStageTextV01121(v,160)).filter(Boolean).slice(0,4),
        generation_mode:'ai'
    };
}

function normalizeStageChunkV01121(parsed, chunk, chunkNo) {
    const raw=stageArrayFromParsedV01125(parsed);
    if(!raw.length) throw new Error(`第 ${chunkNo} 组没有返回 stages`);
    const min=Math.min(...chunk.map(x=>x.__first));
    const max=Math.max(...chunk.map(x=>x.__last));
    const out=[];
    for(let i=0;i<raw.length;i++){
        const x=raw[i];
        if(!x||typeof x!=='object') continue;
        let a=sourceFirst(x.start_source), b=sourceLast(x.end_source);
        if(!Number.isFinite(a)||a<min||a>max) a=min;
        if(!Number.isFinite(b)||b<a||b>max) b=max;
        const inside=chunk.filter(r=>r.__last>=a&&r.__first<=b);
        const firstDate=inside.map(r=>normalizeDateInput(r.date||'')?.iso).find(Boolean)||null;
        const lastDate=[...inside].reverse().map(r=>normalizeDateInput(r.date||'')?.iso).find(Boolean)||null;
        const title=sanitizeStageTextV01121(x.title,90)||`剧情阶段 ${chunkNo}.${i+1}`;
        const summary=sanitizeStageTextV01121(x.summary,700);
        if(!summary || isMetaInstructionSignal({title,summary})) continue;
        out.push({
            id:`stage_${a}_${b}`,
            title,
            summary,
            start_index:a,
            end_index:b,
            source_range:`#${a}-#${b}`,
            start_date:normalizeDateInput(x.start_date||'')?.iso||firstDate,
            end_date:normalizeDateInput(x.end_date||'')?.iso||lastDate,
            key_events:(Array.isArray(x.key_events)?x.key_events:[]).map(v=>sanitizeStageTextV01121(v,180)).filter(Boolean).slice(0,8),
            relationship_changes:(Array.isArray(x.relationship_changes)?x.relationship_changes:[]).map(v=>sanitizeStageTextV01121(v,180)).filter(Boolean).slice(0,6),
            state_at_end:sanitizeStageTextV01121(x.state_at_end,360),
            open_threads:(Array.isArray(x.open_threads)?x.open_threads:[]).map(v=>sanitizeStageTextV01121(v,160)).filter(Boolean).slice(0,5)
        });
    }
    if(!out.length) throw new Error(`第 ${chunkNo} 组返回内容无法形成可靠阶段总结`);
    out.sort((a,b)=>(a.start_index-b.start_index)||(a.end_index-b.end_index));
    out[0].start_index=min;
    for(let i=1;i<out.length;i++){
        const prev=out[i-1], cur=out[i];
        if(cur.start_index>prev.end_index+1) prev.end_index=cur.start_index-1;
    }
    out[out.length-1].end_index=max;
    for(const x of out){
        x.source_range=`#${x.start_index}-#${x.end_index}`;
        x.id=`stage_${x.start_index}_${x.end_index}`;
    }
    return out;
}

function normalizeAllStageSummariesV01121(rows) {
    const sorted=[...(rows||[])].sort((a,b)=>(a.start_index-b.start_index)||(a.end_index-b.end_index));
    const out=[];
    for(const x of sorted){
        if(!x||!Number.isInteger(x.start_index)||!Number.isInteger(x.end_index)) continue;
        const prev=out.at(-1);
        if(prev && x.start_index<=prev.end_index){
            // Keep the clearer/larger summary for heavily overlapping model splits.
            const overlap=Math.min(prev.end_index,x.end_index)-Math.max(prev.start_index,x.start_index)+1;
            const small=Math.min(prev.end_index-prev.start_index+1,x.end_index-x.start_index+1);
            if(small>0 && overlap/small>0.7){
                if(String(x.summary||'').length>String(prev.summary||'').length) out[out.length-1]=x;
                continue;
            }
            x.start_index=prev.end_index+1;
            if(x.start_index>x.end_index) continue;
            x.source_range=`#${x.start_index}-#${x.end_index}`;
            x.id=`stage_${x.start_index}_${x.end_index}`;
        }
        out.push(x);
    }
    // A long RP should remain navigable. Cap at 15 macro stages; if the model
    // produced more, merge the oldest adjacent pairs locally without inventing facts.
    while(out.length>15){
        let best=0, span=Infinity;
        for(let i=0;i<out.length-1;i++){
            const s=(out[i+1].end_index-out[i].start_index);
            if(s<span){span=s;best=i;}
        }
        const a=out[best],b=out[best+1];
        const merged={
            ...b,
            id:`stage_${a.start_index}_${b.end_index}`,
            title:`${a.title} → ${b.title}`.slice(0,90),
            summary:`${a.summary}；${b.summary}`.slice(0,900),
            start_index:a.start_index,
            source_range:`#${a.start_index}-#${b.end_index}`,
            start_date:a.start_date||b.start_date||null,
            key_events:[...(a.key_events||[]),...(b.key_events||[])].slice(0,8),
            relationship_changes:[...(a.relationship_changes||[]),...(b.relationship_changes||[])].slice(0,6),
            open_threads:[...(a.open_threads||[]),...(b.open_threads||[])].slice(-5),
            generation_mode:(String(a.generation_mode||'').startsWith('local')||String(b.generation_mode||'').startsWith('local'))
                ? (a.generation_mode==='local_zero_api'&&b.generation_mode==='local_zero_api'?'local_zero_api':'local_fallback')
                : 'ai',
            fallback_reason:[a.fallback_reason,b.fallback_reason].filter(Boolean).join('；').slice(0,180)
        };
        out.splice(best,2,merged);
    }
    return out;
}

async function generateStageSummariesV01121() {
    if(BUSY||HISTORY_RUNNING||GAP_REPAIR_RUNNING_V0112) return toast('当前已有总结/重建任务在运行。','warning');
    const mem=M();
    const ready=stageSummaryReadinessV01121(mem);
    if(!ready.ready) return toast('阶段大总结暂不生成：'+ready.reason,'warning');
    const rows=stageTimelineRowsV01121(mem);
    const chunks=chunkStageTimelineV01121(rows);
    const status=document.getElementById('smm121_stage_status');
    BUSY=true;
    const previous=cloneJSONV0112(mem.stage_summaries||[]);
    try{
        const collected=[];
        const zeroApiMode=localSummaryModeV01129();
        let aiCount=0, aiAttempts=0, fallbackCount=0, consecutiveAiFailures=0, aiDisabledForRun=zeroApiMode;
        for(let ci=0;ci<chunks.length;ci++){
            const chunk=chunks[ci];
            const start=Math.min(...chunk.map(x=>x.__first));
            const end=Math.max(...chunk.map(x=>x.__last));
            if(status) status.textContent=`正在生成阶段大总结：${ci+1}/${chunks.length}（#${start}-#${end}）·${zeroApiMode?'0 API 本地事实':'AI + 本地保底'}…`;
            const payload=chunk.map(x=>({date:x.date||null,time:x.time||null,event:x.event,source:x.source}));
            const anchors=stageRelevantAnchorsV01121(mem,start,end).slice(-12);
            const prompt=`你正在为长期角色扮演聊天制作一个“阶段大总结”。\n\n【输入来源】\n以下只包含 SMM 已确认并可追溯到真实楼层的长期记忆，不是原始聊天全文。不得补写输入中不存在的事实。\n\n【本阶段时间线 #${start}-#${end}】\n${JSON.stringify(payload,null,2)}\n\n【关键连续性锚点】\n${JSON.stringify(anchors,null,2)}\n\n【任务】\n只总结这一个阶段窗口，不再自行切分。\n- title：简短阶段名称。\n- summary：概括发生了什么、为什么重要、结束后剧情处于什么状态；控制在约 250-500 中文字，不逐条复述。\n- key_events：最多 6 条，只保留影响后续承接的关键事实。\n- relationship_changes：最多 4 条，只写输入中明确发生的关系变化；没有则空数组。\n- state_at_end：阶段结束时的可靠状态。\n- open_threads：最多 4 条，只写输入中确有依据且仍未解决的事项；没有则空数组。\n- 不得输出 source 范围，范围由 SMM 本地确定。\n- 不得输出 thinking、幕后说明、写作规则或推测。\n- 必须返回标准 JSON 对象；不要 Markdown、代码围栏、前言或解释。\n- 只返回 JSON。`;

            let stage=null;
            let failReason='';
            if(!aiDisabledForRun){
                try{
                    aiAttempts++;
                    const raw=await withSmmTimeout(
                        smmGenerateV093({
                            systemPrompt:'你是长期剧情记忆压缩器。只压缩已确认事实。输出一个紧凑 JSON 对象，不做文学创作。',
                            prompt,
                            jsonSchema:stageSummarySchemaV01126(),
                            responseLength:3600
                        }),
                        SMM_GENERATE_TIMEOUT_MS,
                        `阶段大总结 #${start}-#${end}`
                    );
                    rejectGatewayPayloadV01129(raw,'阶段大总结');
                    const parsed=parseJSON(raw);
                    stage=normalizeSingleStageV01126(parsed,chunk,ci+1);
                    consecutiveAiFailures=0;
                }catch(e){
                    consecutiveAiFailures++;
                    failReason=String(e?.message||e||'未知错误');
                    console.warn(`[StoryMemory] v0.11.29 stage chunk ${ci+1} AI output unusable; local canonical fallback`,e);
                    if(isSmmTimeout(e)||isUpstreamGatewayFailureV01129(e)||consecutiveAiFailures>=2){
                        aiDisabledForRun=true;
                        console.warn('[StoryMemory] v0.11.29 stage AI circuit breaker opened; remaining chunks use canonical local fallback');
                    }
                }
            }else{
                failReason=zeroApiMode
                    ? '0 API 本地总结模式：直接使用已确认 canonical 事实'
                    : '本轮 AI 已熔断，剩余阶段使用本地事实保底';
            }

            if(!stage){
                stage=localStageFallbackV01126(chunk,mem,ci+1,failReason);
                if(zeroApiMode) stage.generation_mode='local_zero_api';
                fallbackCount++;
            }else{
                aiCount++;
            }
            collected.push(stage);
        }
        const normalized=normalizeAllStageSummariesV01121(collected);
        if(!normalized.length) throw new Error('没有生成任何可靠阶段总结');
        mem.stage_summaries=normalized;
        mem.stage_summary_last_index=ready.last;
        mem.stage_summary_updated_at=new Date().toISOString();
        mem.audit=Array.isArray(mem.audit)?mem.audit:[];
        mem.audit.push({
            at:mem.stage_summary_updated_at,
            type:'stage_summaries_generated_v01126',
            events:rows.length,
            chunks:chunks.length,
            stages:normalized.length,
            summary_mode:zeroApiMode?'local':'ai',
            api_attempts:aiAttempts,
            ai_chunks:aiCount,
            local_fallback_chunks:fallbackCount,
            covered_to:ready.last,
            source:'existing_canonical_memory_only'
        });
        if(mem.audit.length>50) mem.audit=mem.audit.slice(-50);
        await saveMeta();
        refresh(); refreshNative();
        const box=document.getElementById('smm2_native_memory_box');
        if(box?.dataset.open==='1'){
            box.innerHTML=memoryReadableHTML();
            if(M().schema===SMM4_SCHEMA) bindHistoryBrowserV4(); else bindHistoryBrowserLegacy();
        }
        const fallbackNote=zeroApiMode
            ? `；全部使用 0 API 本地已确认事实`
            : (fallbackCount?`；其中 ${fallbackCount} 组使用本地事实保底，可日后再次更新升级`:'；全部由总结模型生成');
        if(status) status.textContent=`已生成 ${normalized.length} 个阶段大总结，覆盖至 #${ready.last}${fallbackNote}。未重扫原聊天。`;
        toast(`阶段大总结完成：${normalized.length} 段${zeroApiMode?'（0 API 本地事实）':(fallbackCount?`（本地保底 ${fallbackCount} 组）`:'')}。`,'success');
        return normalized;
    }catch(e){
        mem.stage_summaries=previous;
        console.error('[StoryMemory] v0.11.29 stage summary failed',e);
        const fullErr=String(e?.message||e||'未知错误');
        const shortErr=fullErr.length>180 ? fullErr.slice(0,180)+'…' : fullErr;
        if(status) status.textContent='阶段大总结失败：'+shortErr+'；旧阶段总结已保留。详细错误见浏览器控制台。';
        toast('阶段大总结失败：'+shortErr+'；旧结果已保留。','error');
        return null;
    }finally{
        BUSY=false;
        refreshNative();
    }
}


function stageSummariesHTMLV01121(mem=M()) {
    const rows=Array.isArray(mem?.stage_summaries)?mem.stage_summaries:[];
    if(!rows.length) return '<div class="smm2-empty">尚未生成阶段大总结。它会在已有长期记忆之上做章节级压缩，不会修改原聊天。</div>';
    return rows.map((x,i)=>`
      <details class="smm2-memory-details smm121-stage-card" ${i===rows.length-1?'open':''}>
        <summary>${esc(x.title||`剧情阶段 ${i+1}`)} <span class="smm2-day-count">${esc(x.source_range||'')}</span></summary>
        <div class="smm121-stage-summary">${esc(x.summary||'')}</div>
        ${(x.start_date||x.end_date)?`<div class="smm121-stage-meta">时间：${esc(x.start_date||'未明确')}${x.end_date&&x.end_date!==x.start_date?` → ${esc(x.end_date)}`:''}</div>`:''}
        ${x.generation_mode==='local_zero_api'?`<div class="smm121-stage-meta">生成方式：0 API 本地已确认事实</div>`:(x.generation_mode==='local_fallback'?`<div class="smm121-stage-meta">生成方式：本地事实保底（未采用异常模型输出）</div>`:'')}
        ${x.key_events?.length?`<div><b>关键事件：</b>${esc(x.key_events.join('；'))}</div>`:''}
        ${x.relationship_changes?.length?`<div><b>关系变化：</b>${esc(x.relationship_changes.join('；'))}</div>`:''}
        ${x.state_at_end?`<div><b>阶段结束状态：</b>${esc(x.state_at_end)}</div>`:''}
        ${x.open_threads?.length?`<div><b>仍有效线索：</b>${esc(x.open_threads.join('；'))}</div>`:''}
      </details>`).join('');
}

function refreshStageSummaryStatusV01121() {
    const host=document.getElementById('smm121_stage_status');
    if(!host) return;
    const mem=M(), ready=stageSummaryReadinessV01121(mem);
    const count=(mem.stage_summaries||[]).length;
    const covered=Number(mem.stage_summary_last_index??-1);
    const mode=localSummaryModeV01129()?'0 API 本地事实':'AI + 本地保底';
    if(count){
        const stale=ready.last>covered;
        host.textContent=`当前方式：${mode}。已有 ${count} 个阶段大总结，覆盖至 #${covered}${stale?`；现有时间线已到 #${ready.last}，可更新`:''}。`;
    }else{
        host.textContent=ready.ready
            ? `当前方式：${mode}。现有 ${ready.events} 条有效时间线，可以生成阶段大总结。`
            : `当前方式：${mode}。尚未满足生成条件：${ready.reason}。`;
    }
}

function timelineOnlySchemaV0113() {
    return {
        name:'StoryMemoryTimelineRepair',
        strict:true,
        value:{
            '$schema':'http://json-schema.org/draft-04/schema#',
            type:'object',
            properties:{
                timeline:{
                    type:'array',
                    minItems:1,
                    items:{
                        type:'object',
                        properties:{
                            date:{type:['string','null']},
                            time:{type:['string','null']},
                            event:{type:'string'},
                            source:{type:'string'}
                        },
                        required:['date','time','event','source']
                    }
                }
            },
            required:['timeline']
        }
    };
}

async function retryTimelineOnlyV0113(start,endExclusive,reason='') {
    const allowed=[];
    for(let i=start;i<endExclusive;i++) allowed.push(`#${i}`);
    const prompt=`你只做一件事：从下面这批原始聊天中抽取可追溯的剧情时间线。

【允许使用的 source 楼层】
${allowed.join(', ')}

【原始聊天】
${messagesText(start,endExclusive)}

【硬规则】
1. timeline 必须至少有 1 条，只要这批聊天存在剧情动作、对白、决定、地点/时间推进或关系变化。
2. 每条 source 只能引用上方允许列表中的真实楼层；格式优先使用 #123、#123-#126、#123,#125。
3. 禁止使用日期、摘要名、角色名或任何不在允许列表里的编号作为 source。
4. event 只概括 source 对应的真实正文，不得使用 thinking、campus_gossip、故事考据、UpdateVariable 或其他辅助块作为剧情事实。
5. 相邻多楼属于同一事件时合并成一条，source 合并对应楼层。
6. time/date 无法确认可为 null；不要猜测。
7. 只返回 JSON 对象 {"timeline":[...]}，不要解释，不要 Markdown。

上一次校验失败原因（仅用于避免重复格式错误）：${String(reason||'').slice(0,800)}`;

    let raw=null, parsed=null;
    try{
        raw=await withSmmTimeout(
            smmGenerateV093({systemPrompt:'你是剧情事实抽取器。严格服从 source 楼层约束，不进行文学创作。',prompt,jsonSchema:timelineOnlySchemaV0113(),responseLength:2200}),
            SMM_GENERATE_TIMEOUT_MS,
            `timeline source 修复 #${start}-#${endExclusive-1}`
        );
        parsed=parseJSON(raw);
    }catch(e){
        throw new Error(`timeline 专用请求未获得合法 JSON；未自动重试：${e?.message||e}`);
    }
    if(!parsed || !Array.isArray(parsed.timeline)) throw new Error('timeline 专用重试未返回 timeline 数组');
    normalizeTimelineSourcesV0113(parsed,start,endExclusive);
    applyWorldStateMetadataFallbackV0112(parsed,start,endExclusive);
    return parsed.timeline;
}

async function summarizeRange(start, end, options={}) {
    const c = C();
    const mem = M();
    const prompt = `【已有可靠记忆】
${JSON.stringify(compact(mem))}

【本聊天人物 / NPC 分类参考】
${JSON.stringify(npcClassificationContextV01137(mem))}

分类参考只用于区分主要角色与次要 NPC，不能当作剧情事实。候选名仍必须在“新增原始聊天”中实际出现，才能写入本批结果。

【新增原始聊天】
${messagesText(start, end)}

【SMM_WORLD_STATE_META 使用边界】
- 该行由插件从同一条 assistant 回复的 <JSONPatch>/<UpdateVariable> 中只提取白名单路径：/世界/当前日期、/世界/当前时间、/世界/当前地点，以及 MVU 双时间轴使用的 /世界/现实日期、/世界/现实时间、/世界/现实地点。
- 它不是 canonical 剧情正文，禁止转写为对白、动作、人物动机、facts/events/relationships/semantic_anchors。
- 它只可作为“该 assistant 回复结束时”的结构化日期/时间/地点候选证据。
- 普通 /世界/当前日期、当前时间、当前地点与 canonical 正文冲突时，以正文事实为准；不得让它覆盖“第二天/跨午夜/到达新地点”等明确叙事。
- 若元数据标记“MVU现实主时间轴”，只表示它是底层世界现实钟；同 source 的预设剧情摘要若明确给出当前场景完整日期（例如 2003-10-28），timeline/current_story 必须采用场景日期，MVU现实钟由插件另存。只有“副本第N天/倒计时”而没有完整日期时，仍不得自行换算绝对日期。
- timeline 事件的 source 若包含该 assistant 回复且 time/date 为空，可使用同 source 的结构化元数据补齐；不得把后续楼层的元数据倒灌到更早事件。
- 除上述白名单路径外，任何 JSONPatch 变量（好感度、状态、数值、分析等）都没有被提供给总结器，也不得进入长期记忆。

【SMM_ROLE_RECAP_TIME 使用边界】
- 该行只从同一条 assistant 回复中明确标注“摘要/时间/日期”的角色卡剧情摘要提取剧情日期与时分，例如 2026-09-20 07:51—23:47。
- 它属于该 source 的剧情时间证据，优先于 SillyTavern 消息头日期和现实发送时间；消息头时间禁止用于剧情时间。
- 它只可校准 date/time，不得据此额外创造摘要正文没有发生的动作、关系或人物状态。

请只从“新增原始聊天”更新记忆。旧记忆只用于对照，不允许把旧记忆中尚未发生的未来内容变成事实。

【剧情起点规则】
- 【已有可靠记忆】中的 story_start 是插件按当前聊天单独建立的硬锚点，必须原样返回。
- 禁止把当前批次日期、最近日期、副本第几天或模型推测日期改写成新的 story_start。
- story_start 为“本聊天剧情正式起点”且未带日期时，表示开场没有可靠绝对日期；不得为了补全字段自行添加日期。
- story_start 形如“2003-10 / 本聊天剧情正式起点（具体日期未明确）”时，只确认到月份；禁止补成 2003-10-01、2003-10-15 或任何具体日期。

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
- 旧 timeline 若出现 date=null、date_hint=YYYY-MM、date_precision=month，表示该事件只确认到月份。不得借用后续事件的具体日补写它；新输出的 date 应保持 null。
- current_story_time 保存当前正在演出的场景钟点，可以保留“秋季学期 周X HH:MM”作为显示时间，但不能代替 current_story_date。
- 时间线必须尽量给出具体 YYYY-MM-DD；“秋季学期/周五/上午”只能作为附加描述，不能替代日期。
- 双时间轴中，timeline.date 属于当前剧情场景；若场景只有“副本第N天”而没有完整日历，可在 time 中保留该标签但不得推算日期。/世界/现实时间由插件作为 parallel reality clock 单独保存。
- timeline.time 只有在同 source 正文、同楼明确标注时间的角色卡剧情摘要，或允许的同楼状态元数据明确出现钟点时才写 HH:MM；没有这些字段支持、仅由总结模型自行推测的精确分钟必须降级为“下午（具体时刻未明确）”等时段。不得使用酒馆消息头时间。
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
    // v0.11.36: one batch means exactly one model generation.  Local JSON
    // cleanup still handles fences/trailing commas, but invalid output is not
    // sent back to the model for a second or third paid attempt.
    let raw;
    try {
        raw = await withSmmTimeout(
            smmGenerateV093({ systemPrompt:SYSTEM_PROMPT, prompt, jsonSchema:schema() }),
            SMM_GENERATE_TIMEOUT_MS,
            `静默总结 #${start+1}-#${end}`
        );
        rejectGatewayPayloadV01129(raw,'静默总结');
    } catch (e) {
        if(usingPaidProviderV01142(S()) && !e?.isStoryMemoryRequestTooLarge && !e?.isStoryMemoryRequestCancelled && !e?.isStoryMemoryProfileCircuitOpen && !e?.isStoryMemoryExternalCircuitOpen && !e?.isStoryMemoryExternalNotVerified){
            lockSelectedPaidProviderV01142(isSmmTimeout(e)?'独立 API 请求超时':'独立 API 请求失败',e);
        }
        if (isUpstreamGatewayFailureV01129(e)) throw upstreamGatewayErrorV01129(e,'静默总结');
        throw e;
    }

    let parsed;
    try {
        parsed = sanitizeSummaryObjectV01118(filterMetaSignals(parseJSON(raw)));
    } catch (e) {
        if(usingPaidProviderV01142(S())) lockSelectedPaidProviderV01142('独立 API 返回非 JSON',e);
        const err = new Error(`当前模型本批输出不是可用 JSON；未写入记忆，待总结楼层仍保留。本批只调用了 1 次：${e?.message||e}`);
        err.smmSingleRequestInvalidJsonV01136 = true;
        throw err;
    }

    // v0.11.2: fill only missing date/time/location from the same-source
    // structured world-state metadata. Canonical story prose remains the authority.
    applyWorldStateMetadataFallbackV0112(parsed, start, end);

    let validation;
    try {
        validation = validateBatchCommitV0112(parsed, start, end);
    } catch (e) {
        if (e?.smmBatchCommitFailure) {
            if(usingPaidProviderV01142(S())) lockSelectedPaidProviderV01142('独立 API 输出未通过 source/提交校验',e);
            mem.audit = Array.isArray(mem.audit) ? mem.audit : [];
            mem.audit.push({
                at:new Date().toISOString(),
                type:'batch_commit_rejected_single_request_v01136',
                ...cloneJSONV0112(e.smmBatchCommitFailure),
                model_calls:1,
                cursor_preserved:Number(mem.last_processed_index??-1)
            });
            if (mem.audit.length > 50) mem.audit = mem.audit.slice(-50);
            if (options?.save !== false) await saveMeta();
            const err=new Error(`${e.message} 本批只调用了 1 次；请稍后重试。`);
            err.smmBatchCommitFailureV01136=cloneJSONV0112(e.smmBatchCommitFailure);
            throw err;
        } else {
            throw e;
        }
    }

    const beforeMerge = cloneJSONV0112(mem);
    try {
        mergeResult(mem, parsed, end, {startIndex:start, advanceCursor:true});
    } catch (e) {
        restoreObjectInPlaceV0112(mem, beforeMerge);
        throw e;
    }

    if (options?.save !== false) await saveMeta();
    const provider=String(S().summaryProvider||'current');
    return {...validation,mode:'ai',api_calls:1,transport:provider==='external'?'external_direct':(provider==='profile'?'profile':'current_quiet')};
}

let BUSY = false;
let HISTORY_RUNNING = false;
let HISTORY_STOP_REQUESTED = false;
let GAP_REPAIR_RUNNING_V0112 = false;

async function summarizeGapRangeAdaptiveV0113(start,endExclusive,depth=0) {
    // v0.11.40: the caller chooses the batch. A malformed/source-invalid result
    // no longer triggers automatic splitting, because that silently turns one
    // failed paid request into two or more paid requests.
    return await summarizeRange(start,endExclusive,{save:false});
}


// =========================================================
// v0.11.8 structured local code-only gap backfill / rebuild (0 API)
// =========================================================

function plainTextLocalV0114(text) {
    return String(text || '')
        .replace(/```[a-z0-9_-]*\s*/gi, '')
        .replace(/```/g, '')
        .replace(/<date\b[^>]*>([\s\S]*?)<\/date>/gi, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\*\*|__|~~/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{2,}/g, '\n')
        .trim();
}

function tagBodyLocalV0114(raw, tag) {
    const out=[];
    const re=new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,'gi');
    let m;
    while((m=re.exec(String(raw||'')))){
        const v=plainTextLocalV0114(stripAuxiliaryBlocksV0110(m[1]));
        if(v) out.push(v);
    }
    return out;
}

function embeddedSummaryLocalV0114(m) {
    if(!m || m.is_user) return '';
    const raw=String(m?.mes||'');
    // Prefer summaries already generated by the roleplay preset. These cost no API
    // and are much safer than re-summarizing prose locally.
    for(const tag of ['abstract','meow_FM','scene_summary','memory_summary','story_summary','plot_summary','剧情摘要']){
        const parts=tagBodyLocalV0114(raw,tag);
        if(parts.length) return parts.join('；').slice(0,700);
    }
    return '';
}


function summaryBlocksLocalV0115(m) {
    if(!m || m.is_user) return [];
    const raw=String(m?.mes||'');
    const out=[];
    for(const tag of ['abstract','meow_FM','scene_summary','memory_summary','story_summary','plot_summary','剧情摘要']){
        const re=new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,'gi');
        let hit;
        while((hit=re.exec(raw))){
            const text=plainTextLocalV0114(stripAuxiliaryBlocksV0110(hit[1]));
            if(text) out.push({tag,text});
        }
    }
    return out;
}

function normalizeSummaryDateLocalV0115(raw) {
    const m=String(raw||'').match(/(20\d{2})[年\-\/.](\d{1,2})[月\-\/.](\d{1,2})日?/);
    if(!m) return null;
    return normalizeDateInput(`${m[1]}-${String(Number(m[2])).padStart(2,'0')}-${String(Number(m[3])).padStart(2,'0')}`)?.iso||null;
}

function parseSummaryTimePrefixLocalV0115(text) {
    const src=String(text||'').trim();
    const patterns=[
        /^((?:[01]?\d|2[0-3])[:：][0-5]\d\s*(?:-|~|～|—|–|至|到)\s*(?:[01]?\d|2[0-3])[:：][0-5]\d)\s+/,
        /^((?:[01]?\d|2[0-3])[:：][0-5]\d)\s+/,
        /^((?:凌晨|清晨|早晨|早上|上午|中午|下午|傍晚|晚上|晚间|夜间|深夜)(?:\s*(?:[01]?\d|2[0-3])[:：][0-5]\d)?)\s+/
    ];
    for(const re of patterns){
        const m=src.match(re);
        if(m) return {time:m[1].replace(/：/g,':').replace(/\s+/g,' ').trim(),rest:src.slice(m[0].length).trim()};
    }
    return {time:null,rest:src};
}

function knownStoryNamesLocalV0115(userMsg,assistantMsg,mem=M()) {
    const set=new Set();
    const add=x=>{ const v=String(x||'').trim(); if(v&&v.length>=2) set.add(v); };
    add(userMsg?.name); add(assistantMsg?.name);
    for(const k of Object.keys(mem?.characters||{})){
        add(k);
        const bits=String(k||'').split(/[·・\s()（）/]/).filter(Boolean);
        for(const b of bits) if(b.length>=2) add(b);
    }
    return [...set].sort((a,b)=>b.length-a.length);
}

function splitLocationPrefixLocalV0115(rest,userMsg,assistantMsg,mem=M()) {
    const src=String(rest||'').trim();
    if(!src) return {location:null,event:''};
    let best=-1;
    for(const name of knownStoryNamesLocalV0115(userMsg,assistantMsg,mem)){
        const i=src.indexOf(name);
        if(i>0 && (best<0 || i<best)) best=i;
    }
    if(best>0){
        const prefix=src.slice(0,best).trim().replace(/[|｜]+$/,'').trim();
        const event=src.slice(best).trim();
        const locationLike=/宅邸|房|室|厅|楼|馆|校|院|店|餐厅|Bistro|车内|车上|路|街|广场|机场|车站|宿舍|教室|图书馆|食堂|体育|中心|医院|诊所|公园|海滩|码头|酒吧|咖啡|实验室|办公室|后台|包间|走廊|厨房|卧室|客厅|地下室/i.test(prefix);
        if(prefix.length<=70 && event.length>=8 && (locationLike || prefix.length<=35)) return {location:prefix,event};
    }
    return {location:null,event:src};
}

function structuredSummaryRecordsLocalV0115(m,userMsg=null,mem=M()) {
    const out=[];
    const assistantMsg=m;
    for(const block of summaryBlocksLocalV0115(m)){
        const text=String(block.text||'').trim();
        if(!text) continue;
        // Typical preset record: 049 2025-09-23 | 12:55-13:00 地点 事件；050 2025-09-23 | ...
        const marker=/(?:^|[\n\r；;])\s*(?:(\d{1,4})\s+)?((?:20\d{2})[年\-\/.]\d{1,2}[月\-\/.]\d{1,2}日?)\s*[|｜]\s*/g;
        const hits=[]; let h;
        while((h=marker.exec(text))) hits.push({index:h.index,bodyStart:marker.lastIndex,no:h[1]||null,dateRaw:h[2]});
        if(!hits.length) continue;
        for(let i=0;i<hits.length;i++){
            const cur=hits[i], next=hits[i+1];
            let body=text.slice(cur.bodyStart,next?next.index:text.length).trim();
            body=body.replace(/^[；;\s]+|[；;\s]+$/g,'').trim();
            if(!body) continue;
            const t=parseSummaryTimePrefixLocalV0115(body);
            const split=splitLocationPrefixLocalV0115(t.rest,userMsg,assistantMsg,mem);
            let event=String(split.event||'').replace(/^[|｜:：\-–—\s]+/,'').trim();
            if(!event) event=t.rest;
            if(event.length>520) event=event.slice(0,520).replace(/[，、,:：;；]?[^。！？!?]*$/,'')||event.slice(0,520);
            out.push({
                tag:block.tag,
                record_no:cur.no,
                date:normalizeSummaryDateLocalV0115(cur.dateRaw),
                time:t.time,
                location:split.location,
                event
            });
        }
    }
    return out;
}

function sentenceCandidatesLocalV0114(text) {
    const clean=plainTextLocalV0114(text);
    if(!clean) return [];
    return clean
        .split(/(?<=[。！？!?；;])|\n+/)
        .map(x=>x.trim())
        .filter(x=>x.length>=6 && x.length<=220)
        .filter(x=>!/^\s*(?:SYSTEM|USER|ASSISTANT|CHOIR|Analysis|JSONPatch|UpdateVariable)\b/i.test(x));
}

function scoreSentenceLocalV0114(s, pos, total) {
    let score=0;
    const len=s.length;
    if(len>=18 && len<=120) score+=3;
    else if(len>=10 && len<=170) score+=2;
    else score+=1;

    const action=/来到|到达|离开|进入|返回|前往|醒来|睡去|入睡|发现|遇到|收到|告诉|询问|回答|答应|拒绝|决定|确认|约定|开始|结束|继续|停止|带(?:着|回|去)|抱(?:起|回|到)|亲吻|拥抱|上课|训练|购买|送给|拿出|放下|开车|停车|下车|回到|搬到|检查|治疗|受伤|发生|争吵|和好|表白|邀请|警告|承诺|选择|提出|要求|同意|不同意|说明|解释|得知|意识到/;
    if(action.test(s)) score+=4;
    if(/第二天|次日|翌日|隔天|凌晨|早晨|上午|中午|下午|傍晚|晚间|深夜|\d{1,2}[:：]\d{2}/.test(s)) score+=1.5;
    if(/学校|校园|宅邸|宿舍|房间|教室|图书馆|食堂|医院|诊所|车内|餐厅|体育馆|水上中心|商店|机场|车站/.test(s)) score+=1;
    if(/[“”"']/g.test(s)) score-=0.3; // dialogue may matter, but pure quotes are weak timeline anchors
    if(/乳头|阴道|小穴|肉棒|龟头|精液|潮吹|自慰|抽插|后庭|子宫|阴蒂/.test(s)) score-=1.2; // prefer plot-level actions over anatomical micro-detail
    if(pos===0) score+=0.8;
    if(pos===total-1) score+=0.5;
    return score;
}

function extractiveSummaryLocalV0114(m, maxLen=360) {
    const body=cleanMesForSummaryV0110(m);
    const candidates=sentenceCandidatesLocalV0114(body);
    if(!candidates.length) return plainTextLocalV0114(body).slice(0,maxLen);
    const ranked=candidates.map((s,i)=>({s,i,score:scoreSentenceLocalV0114(s,i,candidates.length)}))
        .sort((a,b)=>b.score-a.score || a.i-b.i)
        .slice(0,3)
        .sort((a,b)=>a.i-b.i);
    let out=ranked.map(x=>x.s).join(' ');
    if(out.length>maxLen) out=out.slice(0,maxLen).replace(/[，、,:：;；]?[^。！？!?]*$/,'') || out.slice(0,maxLen);
    return out.trim();
}

function userActionLocalV0114(m, maxLen=220) {
    if(!m) return '';
    let t=plainTextLocalV0114(cleanMesForSummaryV0110(m));
    // Avoid saving obvious OOC/editing commands as story events in code mode.
    if(/^(?:请|帮我|重新|重写|修改|改成|预设|世界书|提示词|SMM|OOC|作者)/i.test(t) &&
       /(?:回复|文本|格式|文风|代码|规则|提示|总结|变量|预设|世界书|楼层)/i.test(t)) return '';
    if(t.length>maxLen){
        const parts=sentenceCandidatesLocalV0114(t).slice(0,2);
        t=(parts.join(' ')||t).slice(0,maxLen);
    }
    return t.trim();
}

function responseActionLocalV0114(m, maxLen=220) {
    if(!m) return '';
    const candidates=sentenceCandidatesLocalV0114(cleanMesForSummaryV0110(m));
    if(!candidates.length) return '';
    const mem=M();
    const names=[...new Set(Object.keys(mem?.characters||{}).flatMap(x=>{
        const full=String(x||'').trim();
        const short=full.split(/[·・\s]/)[0]?.trim();
        return [full,short].filter(y=>y&&y.length>=2);
    }))];
    const escRe=x=>String(x).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const nameRe=names.length ? new RegExp(names.map(escRe).join('|')) : null;
    const ranked=candidates.map((s,i)=>{
        let score=scoreSentenceLocalV0114(s,i,candidates.length);
        if(nameRe?.test(s)) score+=5;
        if(/说|问|答|看|转头|回头|伸手|握|拿|放|开|关|停|走|抱|亲|拒绝|同意|答应|提醒|警告|解释|决定/.test(s)) score+=2;
        if(s.length>150) score-=1.5;
        return {s,i,score};
    }).sort((a,b)=>b.score-a.score||a.i-b.i);
    let out=ranked[0]?.s||'';
    if(out.length>maxLen) out=out.slice(0,maxLen);
    return out.trim();
}

function localEventForPairV0114(userMsg, assistantMsg) {
    const embedded=embeddedSummaryLocalV0114(assistantMsg);
    if(embedded) return embedded;

    const u=userActionLocalV0114(userMsg,220);
    const a=responseActionLocalV0114(assistantMsg,220);
    const userName=String(userMsg?.name||'USER').trim()||'USER';

    if(u && a) return `${userName}：${u}；${a}`.slice(0,460);
    if(u) return `${userName}：${u}`.slice(0,360);
    if(a) return a.slice(0,360);

    const fallback=assistantMsg ? extractiveSummaryLocalV0114(assistantMsg,320) :
        (userMsg ? extractiveSummaryLocalV0114(userMsg,260) : '');
    return fallback || '本地代码补档：原消息存在，但未提取到可用正文。';
}

function explicitDateSameMessagesV0114(indexes) {
    const chat=C().chat||[];
    for(const i of [...indexes].sort((a,b)=>b-a)){
        const raw=String(chat[i]?.mes||'');
        const status=extractRoleplayStatusMetadataV01133(chat[i],i);
        if(status?.date) return status.date;
        const d=extractDateTagFromMessage(raw);
        if(d) return d;
        const meta=extractWorldStateMetadataV0112(chat[i]);
        if(meta?.date) return meta.date;
    }
    return null;
}

function directCanonicalDateCueV0114(indexes) {
    const chat=C().chat||[];
    for(const i of [...indexes].sort((a,b)=>b-a)){
        const txt=cleanMesForSummaryV0110(chat[i]);
        const m=String(txt||'').match(/(20\d{2})[年\-\/.](\d{1,2})[月\-\/.](\d{1,2})日?/);
        if(m){
            const iso=`${m[1]}-${String(Number(m[2])).padStart(2,'0')}-${String(Number(m[3])).padStart(2,'0')}`;
            const d=normalizeDateInput(iso)?.iso;
            if(d) return d;
        }
    }
    return null;
}

function dateDiffDaysLocalV0114(a,b) {
    const da=normalizeDateInput(a)?.iso, db=normalizeDateInput(b)?.iso;
    if(!da||!db) return null;
    return Math.round((Date.parse(db+'T00:00:00Z')-Date.parse(da+'T00:00:00Z'))/86400000);
}

function chooseLocalDateV0114(candidate,currentDate,combined,prevTime,nextTime,indexes) {
    const cand=normalizeDateInput(candidate)?.iso||null;
    const cur=normalizeDateInput(currentDate)?.iso||null;
    if(!cand) return hasNextDayCueTextV0114(combined)&&cur ? addDaysISO(cur,1) : cur;
    if(!cur) return cand;
    const diff=dateDiffDaysLocalV0114(cur,cand);
    if(diff===0) return cur;
    if(diff<0) return cur; // never let stale metadata drag historical backfill backward
    const chat=C().chat||[];
    const primaryReality=[...new Set(indexes||[])].some(i=>{
        const meta=extractWorldStateMetadataV0112(chat[i]);
        return !!(meta?.date_reality && normalizeDateInput(meta.date)?.iso===cand);
    });
    if(primaryReality) return cand;
    const canonicalDate=directCanonicalDateCueV0114(indexes);
    if(canonicalDate===cand) return cand;
    if(diff===1){
        if(hasNextDayCueTextV0114(combined)) return cand;
        const p=parseStoryClock(prevTime), n=parseStoryClock(nextTime);
        if(p!=null && n!=null && p>=18*60 && n<=8*60) return cand;
        return cur;
    }
    return cur;
}

function localTimeSameMessagesV0114(indexes) {
    const chat=C().chat||[];
    for(const i of [...indexes].sort((a,b)=>b-a)){
        const status=extractRoleplayStatusMetadataV01133(chat[i],i);
        if(status?.time) return status.time;
        const meta=extractWorldStateMetadataV0112(chat[i]);
        if(meta?.time) return meta.time;
    }
    const txt=indexes.map(i=>cleanMesForSummaryV0110(chat[i])).join('\n');
    let m=txt.match(/(?:凌晨|早晨|早上|上午|中午|下午|傍晚|晚上|晚间|深夜)?\s*([01]?\d|2[0-3])[:：]([0-5]\d)/);
    if(m) return `${String(Number(m[1])).padStart(2,'0')}:${m[2]}`;
    m=txt.match(/(凌晨|清晨|早晨|早上|上午|中午|下午|傍晚|晚上|晚间|夜间|深夜)/);
    return m?.[1]||null;
}

function localLocationSameMessagesV0114(indexes) {
    const chat=C().chat||[];
    for(const i of [...indexes].sort((a,b)=>b-a)){
        const status=extractRoleplayStatusMetadataV01133(chat[i],i);
        if(status?.location) return status.location;
        const meta=extractWorldStateMetadataV0112(chat[i]);
        if(meta?.location) return meta.location;
    }
    return null;
}

function priorReliableDateV0114(mem,start) {
    const prior=[...(Array.isArray(mem?.timeline)?mem.timeline:[])]
        .filter(e=>sourceLast(e?.source)>=0 && sourceLast(e?.source)<start)
        .sort((a,b)=>sourceLast(a?.source)-sourceLast(b?.source))
        .at(-1);
    return normalizeDateInput(prior?.date)?.iso || isoDateFromAny(mem?.story_start) || null;
}

function hasNextDayCueTextV0114(text) {
    return /第二天|次日|翌日|隔天|第二日/.test(String(text||''));
}

function mergeLocalTimelineNodesV0114(nodes) {
    const out=[];
    for(const raw of (nodes||[])){
        const node={...raw};
        const prev=out.at(-1);
        const prevParts=Number(prev?.__local_parts_v0114||1);
        const sameDate=prev && String(prev.date||'')===String(node.date||'');
        const adjacent=prev && sourceLast(prev.source)+1===sourceFirst(node.source);
        if(prev && sameDate && adjacent && prevParts<2){
            const idx=[...sourceIndexes(prev.source),...sourceIndexes(node.source)];
            prev.source=canonicalSourceV0113(idx)||prev.source;
            const a=String(prev.event||'').trim(), b=String(node.event||'').trim();
            prev.event=(a && b ? `${a}；${b}` : (a||b)).slice(0,720);
            prev.time=node.time||prev.time||null;
            prev.location=node.location||prev.location||null;
            prev.__local_parts_v0114=prevParts+1;
            const te=classifySourceTimeEvidence(prev);
            prev.time_evidence=te.level;
            prev.time_evidence_label=te.label;
            prev.time_evidence_reason=te.reason;
        }else{
            node.__local_parts_v0114=1;
            out.push(node);
        }
    }
    return out.map(({__local_parts_v0114,...x})=>x);
}

function makeLocalTimelineNodesV0114(start,endInclusive,mem=M()) {
    const chat=C().chat||[];
    const nodes=[];
    const triage={reliable:[],needsAI:[],presetPlotNodes:0,factualFallbackNodes:0};
    let currentDate=priorReliableDateV0114(mem,start);
    let previousTime=null;
    let i=start;

    while(i<=endInclusive){
        let a=i, b=i;
        let userMsg=null, assistantMsg=null;
        const first=chat[i];

        if(first?.is_user && i+1<=endInclusive && chat[i+1] && !chat[i+1].is_user){
            userMsg=first; assistantMsg=chat[i+1]; b=i+1;
        }else if(!first?.is_user){
            assistantMsg=first;
            if(i>start && chat[i-1]?.is_user && i-1>=start){ a=i-1; userMsg=chat[i-1]; }
        }else{
            userMsg=first;
        }

        const indexes=[];
        for(let k=a;k<=b;k++) indexes.push(k);
        const combined=indexes.map(k=>cleanMesForSummaryV0110(chat[k])).join('\n');
        const time=localTimeSameMessagesV0114(indexes);
        const candidateDate=explicitDateSameMessagesV0114(indexes);
        const date=chooseLocalDateV0114(candidateDate,currentDate,combined,previousTime,time,indexes);
        if(date) currentDate=date;
        if(time) previousTime=time;

        const event=localEventForPairV0114(userMsg,assistantMsg);
        const location=localLocationSameMessagesV0114(indexes);
        const source=canonicalSourceV0113(indexes) || `#${i}`;
        const node={date:date||null,time:time||null,event,source};
        if(location) node.location=location; // harmless extra field; useful for audit/export
        const te=classifySourceTimeEvidence(node);
        node.time_evidence=te.level;
        node.time_evidence_label=te.label;
        node.time_evidence_reason=te.reason;
        nodes.push(node);

        i=(b>=i?b+1:i+1);
    }
    return mergeLocalTimelineNodesV0114(nodes);
}


function dedupeStructuredLocalV0115(nodes) {
    const out=[];
    const map=new Map();
    for(const raw of (nodes||[])){
        const node={...raw};
        if(node.__local_kind_v0115==='structured'){
            const key=JSON.stringify([
                String(node.date||''),String(node.time||''),
                String(node.location||''),String(node.event||'').replace(/\s+/g,' ').trim()
            ]);
            const prev=map.get(key);
            if(prev){
                const idx=[...sourceIndexes(prev.source),...sourceIndexes(node.source)];
                prev.source=canonicalSourceV0113(idx)||prev.source;
                continue;
            }
            map.set(key,node);
        }
        out.push(node);
    }
    return out;
}

function mergeFallbackLocalV0115(nodes) {
    const out=[];
    for(const raw of nodes||[]){
        const node={...raw};
        const prev=out.at(-1);
        const sameFallback=prev?.__local_kind_v0115==='fallback' && node.__local_kind_v0115==='fallback';
        const parts=Number(prev?.__local_parts_v0115||1);
        const adjacent=prev && sourceLast(prev.source)+1===sourceFirst(node.source);
        const sameDate=prev && String(prev.date||'')===String(node.date||'');
        if(sameFallback && adjacent && sameDate && parts<2){
            const idx=[...sourceIndexes(prev.source),...sourceIndexes(node.source)];
            prev.source=canonicalSourceV0113(idx)||prev.source;
            prev.event=`${String(prev.event||'').trim()}；${String(node.event||'').trim()}`.slice(0,720);
            prev.time=node.time||prev.time||null;
            prev.location=node.location||prev.location||null;
            prev.__local_parts_v0115=parts+1;
            const te=classifySourceTimeEvidence(prev);
            prev.time_evidence=te.level; prev.time_evidence_label=te.label; prev.time_evidence_reason=te.reason;
        }else{
            node.__local_parts_v0115=1;
            out.push(node);
        }
    }
    return out;
}

function finalizeLocalNodesV0115(nodes) {
    const deduped=dedupeStructuredLocalV0115(nodes);
    const merged=mergeFallbackLocalV0115(deduped);
    return merged.map(({__local_kind_v0115,__local_parts_v0115,...x})=>x);
}

function makeLocalTimelineNodesV0115(start,endInclusive,mem=M()) {
    const chat=C().chat||[];
    const nodes=[];
    let currentDate=priorReliableDateV0114(mem,start);
    let previousTime=null;
    let i=start;

    while(i<=endInclusive){
        let a=i,b=i,userMsg=null,assistantMsg=null;
        const first=chat[i];
        if(first?.is_user && i+1<=endInclusive && chat[i+1] && !chat[i+1].is_user){
            userMsg=first; assistantMsg=chat[i+1]; b=i+1;
        }else if(!first?.is_user){
            assistantMsg=first;
            if(i>start && chat[i-1]?.is_user && i-1>=start){ a=i-1; userMsg=chat[i-1]; }
        }else userMsg=first;

        const indexes=[]; for(let k=a;k<=b;k++) indexes.push(k);
        const source=canonicalSourceV0113(indexes)||`#${i}`;
        const combined=indexes.map(k=>cleanMesForSummaryV0110(chat[k])).join('\n');
        const pairMetaTime=localTimeSameMessagesV0114(indexes);
        const pairMetaDate=explicitDateSameMessagesV0114(indexes);
        const pairMetaLocation=localLocationSameMessagesV0114(indexes);
        const records=structuredSummaryRecordsLocalV0115(assistantMsg,userMsg,mem);

        if(records.length){
            for(const rec of records){
                const nextTime=rec.time||pairMetaTime||null;
                const candidateDate=rec.date||pairMetaDate||null;
                const date=chooseLocalDateV0114(candidateDate,currentDate,`${combined}\n${rec.event||''}`,previousTime,nextTime,indexes);
                if(date) currentDate=date;
                if(nextTime) previousTime=nextTime;
                const node={
                    date:date||null,
                    time:nextTime,
                    event:String(rec.event||'').trim(),
                    source,
                    __local_kind_v0115:'structured'
                };
                const loc=rec.location||pairMetaLocation;
                if(loc) node.location=loc;
                if(rec.time){
                    node.time_evidence='structured';
                    node.time_evidence_label='预设摘要时间';
                    node.time_evidence_reason=`来自本批 source 的 <${rec.tag}> 结构化记录${rec.record_no?` #${rec.record_no}`:''}`;
                }else{
                    const te=classifySourceTimeEvidence(node);
                    node.time_evidence=te.level; node.time_evidence_label=te.label; node.time_evidence_reason=te.reason;
                }
                if(node.event){ nodes.push(node); triage.presetPlotNodes += rec.__direct_preset_plot_v0119?1:0; for(const q of indexes) triage.reliable.push(q); }
            }
        }else{
            const date=chooseLocalDateV0114(pairMetaDate,currentDate,combined,previousTime,pairMetaTime,indexes);
            if(date) currentDate=date;
            if(pairMetaTime) previousTime=pairMetaTime;
            const event=localEventForPairV0114(userMsg,assistantMsg);
            const node={date:date||null,time:pairMetaTime||null,event,source,__local_kind_v0115:'fallback'};
            if(pairMetaLocation) node.location=pairMetaLocation;
            const te=classifySourceTimeEvidence(node);
            node.time_evidence=te.level; node.time_evidence_label=te.label; node.time_evidence_reason=te.reason;
            nodes.push(node);
        }
        i=(b>=i?b+1:i+1);
    }
    return finalizeLocalNodesV0115(nodes);
}



// v0.11.8: deterministic local fact compression.
// The goal is not to infer new facts, only to shorten already-present prose into
// compact timeline text suitable for long-term memory.
function stripQuotedDialogueLocalV0116(text) {
    return String(text||'')
        .replace(/“[^”]{0,500}”/g,' ')
        .replace(/「[^」]{0,500}」/g,' ')
        .replace(/『[^』]{0,500}』/g,' ')
        .replace(/\"[^\"\n]{0,500}\"/g,' ')
        .replace(/'{1}[^'\n]{0,300}'{1}/g,' ')
        .replace(/[!！?？]{2,}/g,'。')
        .replace(/[…]{2,}/g,'。')
        .replace(/\s+/g,' ')
        .trim();
}

function normalizePerspectiveLocalV0116(text,userName='') {
    let s=String(text||'').trim();
    const u=String(userName||'').trim();
    if(!u) return s;
    const esc=u.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const speakerRe=new RegExp(esc+'\\s*[:：]');
    // Preset abstracts often switch into first/second person after naming the user.
    // Only normalize POV when the user's name is explicitly present as a speaker anchor.
    if(speakerRe.test(s)){
        s=s.replace(new RegExp(esc+'\\s*[:：]\\s*','g'),u+' ');
        s=s.replace(/你的/g,u+'的').replace(/你/g,u).replace(/我的/g,u+'的').replace(/我/g,u);
    }
    return s;
}

function compressEventLocalV0116(text,userName='',maxLen=190) {
    let src=normalizePerspectiveLocalV0116(stripQuotedDialogueLocalV0116(text),userName)
        .replace(/\s+/g,' ')
        .replace(/[：:；;，,\s]+$/g,'')
        .trim();
    if(!src) return '';

    const micro=/乳头|阴道|小穴|肉棒|龟头|精液|潮吹|自慰|抽插|后庭|子宫|阴蒂|体液|穴口|插入|震动棒|振动棒|玩具.*体内|高潮|淫水|红肿/i;
    const action=/被.{0,18}(?:按|压|推|拖|拽|带|抱|袭击|伤害|威胁|控制|困住|救下|救出)|赶到|抵达|逼近|踹开|闯入|救下|救出|带离|带回|送往|联系|检查|治疗|固定|警告|威胁|决定|确认|约定|答应|拒绝|提出|要求|通知|召集|追赶|逃离|阻止|保护|报警|昏厥|昏迷|恢复|醒来|离开|返回|进入|前往|发现|遭到|遭受|受伤/;
    const weak=/^(?:[^，。；]{0,10})?(?:哭|哭着|摇头|仰头|呻吟|尖叫|喘息|看着|望着|愣住|发抖|颤抖)/;
    const location=/包间|房间|走廊|宅邸|医院|诊所|餐厅|教室|校园|车内|车上|图书馆|食堂|体育馆|水上中心|卧室|客厅|地下室/;

    const clauses=src.split(/[。！？!?；;，,]+/)
        .map(x=>x.trim().replace(/^[：:\s]+|[：:\s]+$/g,''))
        .filter(x=>x.length>=7 && x.length<=180)
        .filter(x=>!micro.test(x));

    const scored=clauses.map((x,i)=>{
        let score=0;
        if(action.test(x)) score+=7;
        if(location.test(x)) score+=1.5;
        if(/[\u4e00-\u9fa5A-Za-z·]{2,10}(?:被|将|带|让|赶到|抵达|联系|检查|治疗|警告|救|离开|返回|进入)/.test(x)) score+=2;
        if(x.length>=12&&x.length<=75) score+=2;
        if(weak.test(x)&&!action.test(x)) score-=5;
        if(/情趣|杀意|毫不掩饰|极度|疯狂|粗暴/.test(x)) score-=0.5;
        return {x,i,score};
    }).filter(x=>x.score>=3)
      .sort((a,b)=>b.score-a.score||a.i-b.i)
      .slice(0,4)
      .sort((a,b)=>a.i-b.i);

    let out=scored.map(x=>x.x).join('；').trim();
    if(userName){
        const esc=String(userName).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        out=out.replace(new RegExp('(?:'+esc+')\\s+(?:'+esc+')','g'),String(userName));
    }
    if(!out){
        // Conservative fallback: use the first non-anatomical factual sentence,
        // still capped aggressively. No invented bridge text is added.
        const fallback=src.split(/(?<=[。！？!?；;])/).map(x=>x.trim()).find(x=>x.length>=10&&!micro.test(x))||src;
        out=fallback;
    }
    out=out.replace(/\s+/g,' ').replace(/；{2,}/g,'；').trim();
    if(out && !/[。！？!?]$/.test(out)) out+='。';
    if(out.length>maxLen){
        let cut=out.slice(0,maxLen);
        const stop=Math.max(cut.lastIndexOf('。'),cut.lastIndexOf('；'));
        out=(stop>=Math.floor(maxLen*0.55)?cut.slice(0,stop+1):cut).trim();
        if(out&&!/[。！？!?]$/.test(out)) out+='。';
    }
    return out;
}

function sourceTemporalMetaLocalV0116(indexes,mem=M()) {
    const chat=C().chat||[];
    const sorted=[...new Set(indexes)].sort((a,b)=>b-a);
    const out={date:null,time:null,location:null,kind:null,reason:null,reality_axis:false,date_reality:false,time_reality:false};

    // 1) Exact UpdateVariable world-state metadata from the same source.
    for(const i of sorted){
        const meta=extractWorldStateMetadataV0112(chat[i]);
        if(!meta) continue;
        if(!out.date&&meta.date){ out.date=meta.date; out.date_reality=!!meta.date_reality; }
        if(!out.time&&meta.time){ out.time=meta.time; out.time_reality=!!meta.time_reality; }
        if(!out.location&&meta.location) out.location=meta.location;
        if(meta.reality_axis) out.reality_axis=true;
        if(out.time){
            out.kind=meta.time_reality||meta.date_reality?'world_reality_meta':'world_meta';
            out.reason=`同 source #${i} 的 ${meta.time_path||meta.date_path||'/世界/当前时间'}`;
            break;
        }
    }

    // 2) Existing preset summaries such as <abstract> with structured time.
    if(!out.time || !out.date || !out.location){
        for(const i of sorted){
            const m=chat[i];
            if(!m || m.is_user) continue;
            const prev=(i>0&&chat[i-1]?.is_user)?chat[i-1]:null;
            const recs=structuredSummaryRecordsLocalV0115(m,prev,mem);
            if(!recs.length) continue;
            const rec=recs[recs.length-1]; // source end-state
            if(!out.date&&rec.date) out.date=rec.date;
            if(!out.time&&rec.time){ out.time=rec.time; out.kind='preset_summary'; out.reason=`同 source #${i} 的 <${rec.tag}> 时间`; }
            if(!out.location&&rec.location) out.location=rec.location;
            if(out.time&&out.date&&out.location) break;
        }
    }

    // 3) Raw same-source clock/date fallback; never consult unrelated later rows.
    if(!out.time){
        const t=localTimeSameMessagesV0114(sorted);
        if(t){ out.time=t; out.kind='raw_source'; out.reason='同 source 原文中的时间'; }
    }
    if(!out.date){
        const d=explicitDateSameMessagesV0114(sorted)||directCanonicalDateCueV0114(sorted);
        if(d) out.date=d;
    }
    if(!out.location){
        const l=localLocationSameMessagesV0114(sorted);
        if(l) out.location=l;
    }
    return out;
}

function repairExistingTimelineTemporalV0116(mem,start=0,endInclusive=null) {
    const rows=Array.isArray(mem?.timeline)?mem.timeline:[];
    const chat=C().chat||[];
    const maxEnd=Number.isInteger(endInclusive)?endInclusive:Math.max(0,chat.length-1);
    let timeFixed=0,dateFixed=0,locationFixed=0,scanned=0;
    for(const e of rows){
        const all=[...sourceIndexes(e?.source)].sort((a,b)=>a-b);
        const idx=all.filter(i=>i>=start&&i<=maxEnd);
        if(!idx.length) continue;
        scanned++;
        const needTime=isMissingStoryValueV0112(e?.time)||isUnresolvedStoryTimeV0112(e?.time);
        const needDate=isMissingStoryValueV0112(e?.date);
        const needLocation=isMissingStoryValueV0112(e?.location);
        if(!needTime&&!needDate&&!needLocation) continue;
        const meta=sourceTemporalMetaLocalV0116(idx,mem);
        if(needDate&&meta.date){ e.date=meta.date; dateFixed++; }
        if(needTime&&meta.time){
            e.time=meta.time; timeFixed++;
            if(meta.kind==='world_meta'){
                e.time_evidence='structured';
                e.time_evidence_label='变量状态时间';
            }else if(meta.kind==='preset_summary'){
                e.time_evidence='structured';
                e.time_evidence_label='预设摘要时间';
            }else{
                const te=classifySourceTimeEvidence(e);
                e.time_evidence=te.level; e.time_evidence_label=te.label;
            }
            e.time_evidence_reason=meta.reason||'同 source 时间修复';
        }
        if(needLocation&&meta.location){ e.location=meta.location; locationFixed++; }
    }
    return {scanned,timeFixed,dateFixed,locationFixed,start,endInclusive:maxEnd};
}


function syncCurrentStoryStateFromLatestMetaV0116(mem,endInclusive) {
    const end=Math.max(0,Number(endInclusive)||0);
    const latest=latestWorldStateMetaInRangeV0112(0,end+1);
    if(!latest) return {found:false,index:null,date:false,time:false,location:false};
    let date=false,time=false,location=false;
    if(latest.date){
        const cur=normalizeDateInput(mem?.current_story_date)?.iso||null;
        const next=normalizeDateInput(latest.date)?.iso||null;
        if(next && (!cur || dateDiffDaysLocalV0114(cur,next)>=0)){
            if(mem.current_story_date!==next){ mem.current_story_date=next; date=true; }
        }
    }
    if(latest.time && String(mem?.current_story_time||'')!==String(latest.time)){
        mem.current_story_time=latest.time; time=true;
    }
    if(latest.location && mem?.current_scene && typeof mem.current_scene==='object' &&
       String(mem.current_scene.location||'')!==String(latest.location)){
        mem.current_scene.location=latest.location; location=true;
    }
    return {found:true,index:latest.index,date,time,location,meta:{date:latest.date,time:latest.time,location:latest.location}};
}


// =========================================================
// v0.11.21 current story-state resolver
// Recent canonical prose > recent ordinary world-state metadata > stored state.
// v0.11.27 exception: a recognised `/世界/现实时间` owns the primary calendar
// and clock when prose on the same floor is describing a dungeon-local time.
// This is intentionally conservative: it never edits the chat JSONL and only
// upgrades current state when the evidence is newer than the stored timeline.
// =========================================================
function currentStoryCueFromMessageV01121(m, index) {
    if (!m) return null;
    const raw = String(m?.mes || '');
    const text = cleanMesForSummaryV0110(m);
    if (!text) return null;

    const flat = String(text).replace(/\s+/g, ' ').trim();
    const head = flat.slice(0, 520);
    const lead = flat.slice(0, 280);
    const out = {index, date:null, time:null, location:null, next_day:false, evidence:[]};

    // Absolute date: prefer explicit <date>, then a canonical date near the start
    // of the actual story prose. Dates buried deep in a reply are more likely to
    // be recalled/quoted history and are not promoted to current state here.
    const tagged = extractDateTagFromMessage(raw);
    if (tagged) {
        out.date = tagged;
        out.evidence.push('正文 <date>');
    } else {
        const dm = head.match(/(20\d{2})[年\-\/.](\d{1,2})[月\-\/.](\d{1,2})日?/);
        if (dm) {
            const iso = `${dm[1]}-${String(Number(dm[2])).padStart(2,'0')}-${String(Number(dm[3])).padStart(2,'0')}`;
            out.date = normalizeDateInput(iso)?.iso || null;
            if (out.date) out.evidence.push('正文绝对日期');
        } else {
            const md=head.match(/(?:^|[^\d])(\d{1,2})月\s*(\d{1,2})日/);
            const base=normalizeDateInput(M()?.current_story_date||'');
            if(md&&base){
                const iso=`${base.y}-${String(Number(md[1])).padStart(2,'0')}-${String(Number(md[2])).padStart(2,'0')}`;
                out.date=normalizeDateInput(iso)?.iso||null;
                if(out.date) out.evidence.push('正文月日（沿用已建立年份）');
            }
        }
    }

    // Relative day rollover is accepted only as scene-setting narration. USER
    // future plans such as “第二天我会……” are deliberately not used as current time.
    if (!out.date && !m.is_user && /^\s*(?:#+\s*)?(?:第二天|次日|翌日|隔天|第二日)(?:[，,。.!！\s]|$)/.test(lead)) {
        out.next_day = true;
        out.evidence.push('正文次日推进');
    }

    // Prefer a time contained in <date> when the preset emits one.
    const dateBlock = raw.match(/<date\b[^>]*>([\s\S]*?)<\/date>/i)?.[1] || '';
    const timeSource = String(dateBlock || lead);
    let tm = timeSource.match(/(?:凌晨|清晨|早晨|早上|上午|中午|下午|傍晚|晚上|晚间|夜间|夜晚|深夜)?\s*([01]?\d|2[0-3])[:：]([0-5]\d)/);
    if (tm) {
        const beforeTm=timeSource.slice(Math.max(0,(tm.index||0)-24),tm.index||0);
        const currentContext=!!dateBlock || (tm.index||0)<42 || /现在|此时|此刻|眼下|已经是|已是|时间来到|时间到了|正值|正是/.test(beforeTm);
        if(currentContext){
            let prefix = timeSource.slice(Math.max(0, tm.index - 8), tm.index + tm[0].length);
            const period = prefix.match(/凌晨|清晨|早晨|早上|上午|中午|下午|傍晚|晚上|晚间|夜间|夜晚|深夜/)?.[0] || '';
            let h = Number(tm[1]);
            if (/下午|傍晚|晚上|晚间|夜间|夜晚|深夜/.test(period) && h < 12) h += 12;
            if (/凌晨/.test(period) && h === 12) h = 0;
            out.time = `${period ? period+' ' : ''}${String(h).padStart(2,'0')}:${tm[2]}`.trim();
            out.evidence.push('正文明确时分');
        }
    }
    if(!out.time){
        const sceneTime = lead.match(/(?:^|[，,。.!！；;：:\s])(?:现在|此时|此刻|眼下|已经是|已是|时间来到|时间到了|正值|正是)?\s*(凌晨|清晨|早晨|早上|上午|中午|正午|下午|傍晚|晚上|晚间|夜间|夜晚|深夜)(?=[，,。.!！；;：:\s]|$)/);
        if (sceneTime && (sceneTime.index||0)<110) {
            out.time = sceneTime[1] === '正午' ? '中午' : sceneTime[1];
            out.evidence.push('正文明确时段');
        }
    }

    // Conservative current-location cues. Only explicit arrival/return/enter
    // transitions near the start of canonical prose are accepted. A bare place
    // name or “离开 X” is not enough to establish the new current location.
    const locHeader=lead.match(/(?:^|[\n，,。；;])\s*(?:地点|场景|位置)\s*[:：]\s*([^，。！？!?；;]{2,80})/);
    const loc = lead.match(/(?:来到|抵达|到达|进入|走进|踏进|回到|返回到?|回了)\s*([^，。！？!?；;]{2,46}?(?:房间|卧室|客厅|办公室|教室|宿舍|走廊|大厅|餐厅|食堂|图书馆|体育馆|医院|诊所|校园|宅邸|公寓|别墅|酒店|酒吧|咖啡馆|会所|车内|车上|楼层|\d+楼|\d+层))/);
    if (locHeader || loc) {
        out.location = sanitizeWorldMetaValueV0112((locHeader||loc)[1], 120);
        if (out.location) out.evidence.push(locHeader?'正文地点标记':'正文明确地点移动');
    }

    return (out.date || out.time || out.location || out.next_day) ? out : null;
}

function latestTimelineStateV01121(mem=M()) {
    const rows = (Array.isArray(mem?.timeline) ? mem.timeline : [])
        .map((e,i)=>({e,i,last:sourceLast(e?.source),first:sourceFirst(e?.source)}))
        .filter(x=>Number.isFinite(x.last) && x.last >= 0)
        .sort((a,b)=>(a.last-b.last)||(a.first-b.first)||(a.i-b.i));
    const row = rows.at(-1)?.e || null;
    return {
        index: rows.at(-1)?.last ?? -1,
        date: normalizeDateInput(row?.date)?.iso || null,
        time: row?.time || null,
        location: row?.location || null
    };
}

function latestWorldStateFieldsInRangeV01121(start,endExclusive) {
    const chat=C().chat||[];
    const out={
        date:null,time:null,location:null,
        date_index:-1,time_index:-1,location_index:-1,
        date_reality:false,time_reality:false,
        date_path:null,time_path:null,location_path:null
    };
    for(let i=Math.min(endExclusive,chat.length)-1;i>=Math.max(0,start);i--){
        const meta=extractWorldStateMetadataV0112(chat[i]);
        if(!meta) continue;
        if(!out.date&&meta.date){out.date=meta.date;out.date_index=i;out.date_reality=!!meta.date_reality;out.date_path=meta.date_path;}
        if(!out.time&&meta.time){out.time=meta.time;out.time_index=i;out.time_reality=!!meta.time_reality;out.time_path=meta.time_path;}
        if(!out.location&&meta.location){out.location=meta.location;out.location_index=i;out.location_path=meta.location_path;}
        if(out.date&&out.time&&out.location) break;
    }
    return (out.date||out.time||out.location)?out:null;
}

function composeCurrentStoryTimeV01121(date,time,previous='') {
    const t=String(time||'').trim();
    if(!t || /周[日一二三四五六天]/.test(t)) return t||null;
    const d=normalizeDateInput(date||'');
    if(!d) return t;
    const weekdays=['周日','周一','周二','周三','周四','周五','周六'];
    const wd=weekdays[new Date(d.iso+'T00:00:00Z').getUTCDay()];
    const prev=String(previous||'').trim();
    const prefix=(prev.match(/^(.{1,24}?)(?=\s*周[日一二三四五六天])/)?.[1]||'').trim();
    const safePrefix=/学期|春季|夏季|秋季|冬季|第.{0,4}周/.test(prefix)?prefix:'';
    return [safePrefix,wd,t].filter(Boolean).join(' ');
}

function resolveCurrentStoryStateV01121(mem=M()) {
    const chat = C().chat || [];
    const tl = latestTimelineStateV01121(mem);
    const end = chat.length - 1;
    if (end < 0) return {changed:false, source:'none'};
    const storyStartDate=isoDateFromAny(mem?.story_start);
    const hasRealityAxis=!!realityAxisStateV01129(end).found;

    // Inspect a narrow recent window plus a few messages overlapping the latest
    // timeline source. This catches a date/time stated in the very source that was
    // summarized incorrectly without re-scanning a 1700-floor chat every refresh.
    const scanStart = (!normalizeDateInput(mem?.current_story_date||'') && tl.index<0)
        ? 0
        : Math.max(0, end - 79, (tl.index >= 0 ? tl.index - 6 : 0));
    let rawDate = null, rawDateIndex = -1, rawDateReason = null;
    let rawTime = null, rawTimeIndex = -1, rawTimeReason = null;
    let rawLocation = null, rawLocationIndex = -1, rawLocationReason = null;

    let rollingDate = normalizeDateInput(mem?.current_story_date)?.iso || tl.date || null;
    for (let i=scanStart; i<=end; i++) {
        const cue = currentStoryCueFromMessageV01121(chat[i], i);
        if (!cue) continue;
        let cueRejectedAsPast=false;
        let cueUsesSecondaryCalendar=false;
        if (cue.date) {
            const cur = rollingDate;
            const diff = cur ? dateDiffDaysLocalV0114(cur, cue.date) : null;
            // Current story date is monotonic. An older explicit date in recent prose
            // is treated as recollection unless the memory has no date at all.
            if (!cur || diff == null || diff >= 0) {
                rollingDate = cue.date;
                rawDate = cue.date;
                rawDateIndex = i;
                rawDateReason = cue.evidence.join(' / ');
            } else {
                // In a declared reality-axis chat, a calendar older than the
                // immutable story start is usually the active dungeon/scenario
                // calendar. It may update the current place, but never the main
                // date or reality clock.
                cueUsesSecondaryCalendar=!!(hasRealityAxis&&storyStartDate&&cue.date<storyStartDate);
                cueRejectedAsPast=!cueUsesSecondaryCalendar;
            }
        } else if (cue.next_day && i > tl.index && rollingDate) {
            rollingDate = addDaysISO(rollingDate, 1) || rollingDate;
            rawDate = rollingDate;
            rawDateIndex = i;
            rawDateReason = cue.evidence.join(' / ');
        }
        // If the same canonical cue explicitly points to an older date, its time
        // and location belong to that recollection, not to the current scene.
        if (!cueRejectedAsPast && !cueUsesSecondaryCalendar && cue.time) {
            rawTime = cue.time;
            rawTimeIndex = i;
            rawTimeReason = cue.evidence.join(' / ');
        }
        if (!cueRejectedAsPast && cue.location) {
            rawLocation = cue.location;
            rawLocationIndex = i;
            rawLocationReason = cue.evidence.join(' / ');
        }
    }

    const latestMeta = latestWorldStateFieldsInRangeV01121(scanStart, end + 1);
    const storedDate = normalizeDateInput(mem?.current_story_date)?.iso || null;
    const metaDate = normalizeDateInput(latestMeta?.date)?.iso || null;

    let nextDate = storedDate || tl.date || null;
    let dateSource = nextDate ? 'stored/timeline' : 'none';
    // Canonical prose wins when it is the same/newer evidence. A later variable
    // snapshot may still ADVANCE the state after that prose; otherwise an explicit
    // date mentioned 50 floors ago would freeze current_story_date forever.
    let chosenDate = null, chosenDateIndex = -1, chosenDateKind = 'none';
    if (rawDate) {
        chosenDate = rawDate;
        chosenDateIndex = rawDateIndex;
        chosenDateKind = 'raw';
    }
    if (metaDate) {
        const metaIsLaterEvidence = latestMeta.date_index > chosenDateIndex;
        const metaAdvancesDate = !chosenDate || metaDate > chosenDate;
        const realityOwnsSameFloor = latestMeta.date_reality && latestMeta.date_index >= chosenDateIndex;
        if (!chosenDate || realityOwnsSameFloor || (metaIsLaterEvidence && metaAdvancesDate)) {
            chosenDate = metaDate;
            chosenDateIndex = latestMeta.date_index;
            chosenDateKind = latestMeta.date_reality ? 'world_reality_meta' : 'world_meta';
        }
    }
    if (chosenDate) {
        const diff = nextDate ? dateDiffDaysLocalV0114(nextDate, chosenDate) : null;
        if (!nextDate || diff == null || diff >= 0) {
            nextDate = chosenDate;
            dateSource = `${chosenDateKind}#${chosenDateIndex}`;
        }
    } else if (!nextDate && tl.date) {
        nextDate = tl.date;
        dateSource = `timeline#${tl.index}`;
    }

    let nextTime = mem?.current_story_time || tl.time || null;
    let timeSource = nextTime ? 'stored/timeline' : 'none';
    const rawTimeUsable = !!rawTime && rawTimeIndex >= Math.max(scanStart, tl.index - 6);
    const metaTimeUsable = !!latestMeta?.time;
    const realityTimeOwnsSameFloor = metaTimeUsable && latestMeta.time_reality && latestMeta.time_index >= rawTimeIndex;
    if (realityTimeOwnsSameFloor) {
        nextTime = latestMeta.time;
        timeSource = `world_reality_meta#${latestMeta.time_index}`;
    } else if (rawTimeUsable && (!metaTimeUsable || rawTimeIndex >= latestMeta.time_index)) {
        nextTime = rawTime;
        timeSource = `raw#${rawTimeIndex}`;
    } else if (metaTimeUsable) {
        nextTime = latestMeta.time;
        timeSource = `world_meta#${latestMeta.time_index}`;
    }

    // If the absolute date advanced but no new-day time evidence exists, do not
    // carry an old precise clock onto the new date. A stale 19:45 on “the next day”
    // is more harmful than an intentionally unknown time.
    if (storedDate && nextDate && nextDate > storedDate) {
        const newestTimeIndex = Math.max(rawTimeIndex, Number(latestMeta?.time ? latestMeta.time_index : -1));
        const dateEvidenceIndex = rawDateIndex >= 0 ? rawDateIndex : Number(latestMeta?.date ? latestMeta.date_index : -1);
        if (newestTimeIndex < dateEvidenceIndex) {
            nextTime = null;
            timeSource = 'date_advanced_time_unknown';
        }
    }
    if(nextTime && (timeSource.startsWith('raw#') || timeSource.startsWith('world_meta#') || timeSource.startsWith('world_reality_meta#'))){
        nextTime=composeCurrentStoryTimeV01121(nextDate,nextTime,mem?.current_story_time||'');
    }

    let nextLocation = (mem?.current_scene && typeof mem.current_scene === 'object')
        ? (mem.current_scene.location || tl.location || null)
        : (tl.location || null);
    let locationSource = nextLocation ? 'stored/timeline' : 'none';
    // Same-floor conflicts prefer canonical prose. A later variable snapshot can
    // update the location once the story has moved on without another prose header.
    if (rawLocation && (!latestMeta?.location || rawLocationIndex >= latestMeta.location_index)) {
        nextLocation = rawLocation;
        locationSource = `raw#${rawLocationIndex}`;
    } else if (latestMeta?.location) {
        nextLocation = latestMeta.location;
        locationSource = `world_meta#${latestMeta.location_index}`;
    }

    const before = {
        date: mem.current_story_date || null,
        time: mem.current_story_time || null,
        location: mem?.current_scene?.location || null
    };
    let changed = false;
    if ((nextDate || null) !== (before.date || null)) {
        mem.current_story_date = nextDate || null;
        changed = true;
    }
    if ((nextTime || null) !== (before.time || null)) {
        mem.current_story_time = nextTime || null;
        changed = true;
    }
    if (!mem.current_scene || typeof mem.current_scene !== 'object' || Array.isArray(mem.current_scene)) mem.current_scene = {};
    if ((nextLocation || null) !== (before.location || null)) {
        if (nextLocation) mem.current_scene.location = nextLocation;
        else delete mem.current_scene.location;
        changed = true;
    }

    if (changed) {
        mem.audit = Array.isArray(mem.audit) ? mem.audit : [];
        mem.audit.push({
            at:new Date().toISOString(),
            type:'current_story_state_resolved_v01121',
            scan:[scanStart,end],
            before,
            after:{date:mem.current_story_date||null,time:mem.current_story_time||null,location:mem.current_scene.location||null},
            evidence:{
                date:dateSource,
                date_reason:rawDateReason,
                time:timeSource,
                time_reason:rawTimeReason,
                location:locationSource,
                location_reason:rawLocationReason
            }
        });
        if (mem.audit.length > 50) mem.audit = mem.audit.slice(-50);
    }

    return {
        changed,
        date:mem.current_story_date||null,
        time:mem.current_story_time||null,
        location:mem.current_scene.location||null,
        evidence:{date:dateSource,time:timeSource,location:locationSource},
        scan:[scanStart,end]
    };
}

function repairRealityAxisTimelineV01127(mem=M()) {
    const timeline=Array.isArray(mem?.timeline)?mem.timeline:[];
    if(!timeline.length) return {found:false,changed:false,anchors:0};

    const anchors=[];
    for(const e of timeline){
        for(const i of sourceIndexes(e?.source)){
            const meta=extractWorldStateMetadataV0112((C().chat||[])[i]);
            if(meta?.date_reality && meta.date){
                anchors.push(`${i}:${meta.date}:${meta.time_reality?meta.time||'':''}`);
            }
        }
    }
    const unique=[...new Set(anchors)].sort();
    if(!unique.length) return {found:false,changed:false,anchors:0};

    const fingerprint=JSON.stringify([
        Number(mem?.last_processed_index??-1),
        timeline.length,
        unique
    ]);
    if(mem?.temporal_axis_v01127?.fingerprint===fingerprint){
        return {found:true,changed:false,anchors:unique.length,cached:true};
    }

    const before=JSON.stringify(timeline.map(e=>[e?.source||null,e?.date||null,e?.time||null]));
    calibrateTimeline(mem,{allowCrossMidnight:true});
    const dateSync=syncCurrentDateFromTimeline(mem,null);
    const after=JSON.stringify((mem.timeline||[]).map(e=>[e?.source||null,e?.date||null,e?.time||null]));
    const changed=before!==after || !!dateSync?.changed;

    const finalFingerprint=JSON.stringify([
        Number(mem?.last_processed_index??-1),
        (mem.timeline||[]).length,
        unique
    ]);
    mem.temporal_axis_v01127={
        version:'0.11.27',
        at:new Date().toISOString(),
        fingerprint:finalFingerprint,
        anchors:unique.length,
        timeline_changed:before!==after,
        current_date_changed:!!dateSync?.changed
    };
    mem.audit=Array.isArray(mem.audit)?mem.audit:[];
    mem.audit.push({
        at:new Date().toISOString(),
        type:'dual_time_axis_calibrated_v01127',
        anchors:unique.length,
        timeline_changed:before!==after,
        current_date_changed:!!dateSync?.changed,
        reason:'以 /世界/现实时间 校准绝对日期；副本内时间仅保留为场景第二时间轴'
    });
    if(mem.audit.length>50) mem.audit=mem.audit.slice(-50);
    return {found:true,changed:true,content_changed:changed,anchors:unique.length};
}

// =========================================================
// v0.11.29 dual-calendar hard guard
// A card may keep a real-world clock under /world/reality-time while the active
// dungeon has its own historical calendar. The reality axis owns timeline.date
// and current_story_date; the dungeon calendar is retained visibly in time.
// =========================================================
function realityAxisStateV01129(endInclusive=null) {
    const chat=C().chat||[];
    const cap=endInclusive==null
        ? chat.length-1
        : Math.min(chat.length-1,Math.max(-1,Number(endInclusive)));
    const dateAnchors=[];
    let latestDate=null,latestDateIndex=-1,latestTime=null,latestTimeIndex=-1;
    let found=false;
    for(let i=0;i<=cap;i++){
        const meta=extractWorldStateMetadataV0112(chat[i]);
        if(!meta || (!meta.date_reality&&!meta.time_reality)) continue;
        found=true;
        if(meta.date_reality&&meta.date){
            const date=normalizeDateInput(meta.date)?.iso||isoDateFromAny(meta.date);
            if(date){
                latestDate=date; latestDateIndex=i;
                dateAnchors.push({index:i,date});
            }
        }
        if(meta.time_reality&&meta.time){
            const time=sanitizeWorldMetaValueV0112(meta.time,100);
            if(time){latestTime=time;latestTimeIndex=i;}
        }
    }
    return {
        found,dateAnchors,latestDate,latestDateIndex,latestTime,latestTimeIndex,
        signature:dateAnchors.map(x=>`${x.index}:${x.date}`).concat(
            latestTimeIndex>=0?[`t${latestTimeIndex}:${latestTime}`]:[]
        )
    };
}

function secondarySceneTimeLabelV01129(date,time) {
    const d=normalizeDateInput(date)?.iso||isoDateFromAny(date)||String(date||'').trim();
    let t=String(time||'').trim();
    if(t.includes(d) && /(?:副本|场景|第二)时间轴/.test(t)) return t;
    t=t.replace(/^\[\s*|\s*\]$/g,'').trim();
    const body=[d,t].filter(Boolean).join(' ');
    return body?`[场景第二时间轴·${body}]`:null;
}

function repairSecondaryCalendarLeakV01129(mem=M(),endInclusive=null) {
    const timeline=Array.isArray(mem?.timeline)?mem.timeline:[];
    const maxSource=timeline.reduce((n,e)=>Math.max(n,Number(sourceLast(e?.source))),-1);
    const processed=Math.max(-1,Number(mem?.last_processed_index??-1),maxSource);
    const cap=endInclusive==null?processed:Math.max(processed,Number(endInclusive)||-1);
    const axis=realityAxisStateV01129(cap);
    const startDate=isoDateFromAny(mem?.story_start);
    if(!axis.found || (!startDate&&!axis.latestDate)){
        return {found:axis.found,changed:false,rows_fixed:0};
    }

    const stateBefore=[mem?.current_story_date||null,mem?.current_story_time||null];
    const inputFingerprint=JSON.stringify([
        processed,startDate,axis.signature,stateBefore,
        timeline.map(e=>[e?.source||null,e?.date||null,e?.time||null])
    ]);
    if(mem?.secondary_calendar_guard_v01129?.fingerprint===inputFingerprint){
        return {found:true,changed:false,rows_fixed:0,cached:true};
    }

    const ordered=timeline.map((e,i)=>({e,i,first:sourceFirst(e?.source),last:sourceLast(e?.source)}))
        .sort((a,b)=>(a.first-b.first)||(a.last-b.last)||(a.i-b.i));
    let rollingDate=startDate||axis.dateAnchors[0]?.date||null;
    let anchorPos=0;
    let rowsFixed=0;
    const repairs=[];
    for(const row of ordered){
        const rowEnd=Number.isFinite(row.last)?row.last:row.first;
        while(anchorPos<axis.dateAnchors.length && axis.dateAnchors[anchorPos].index<=rowEnd){
            rollingDate=axis.dateAnchors[anchorPos].date||rollingDate;
            anchorPos++;
        }
        const rowDate=normalizeDateInput(row.e?.date||'')?.iso||isoDateFromAny(row.e?.date);
        if(!rowDate||!rollingDate||rowDate>=rollingDate) continue;

        const priorTime=row.e.time||null;
        row.e.date=rollingDate;
        row.e.time=secondarySceneTimeLabelV01129(rowDate,priorTime);
        row.e.time_evidence='structured';
        row.e.time_evidence_label='场景第二时间轴';
        row.e.time_evidence_reason='该聊天存在明确 /世界/现实时间；较早日历保留为副本/场景时间，不占用现实日期';
        rowsFixed++;
        repairs.push({source:String(row.e.source||''),from:rowDate,to:rollingDate});
    }

    const primaryDate=axis.latestDate||rollingDate||startDate||null;
    const currentDate=normalizeDateInput(mem?.current_story_date||'')?.iso||isoDateFromAny(mem?.current_story_date);
    let dateFixed=false,timeFixed=false;
    if(primaryDate && (!currentDate || currentDate<primaryDate)){
        mem.current_story_date=primaryDate;
        dateFixed=true;
    }
    if(axis.latestTime && (!currentDate||!primaryDate||currentDate<=primaryDate||dateFixed)){
        const composed=composeCurrentStoryTimeV01121(mem.current_story_date||primaryDate,axis.latestTime,mem.current_story_time||'');
        if(composed && String(mem.current_story_time||'')!==String(composed)){
            mem.current_story_time=composed;
            timeFixed=true;
        }
    }
    if(rowsFixed) syncCurrentDateFromTimeline(mem,primaryDate);

    const changed=!!(rowsFixed||dateFixed||timeFixed);
    const finalFingerprint=JSON.stringify([
        processed,startDate,axis.signature,
        [mem?.current_story_date||null,mem?.current_story_time||null],
        timeline.map(e=>[e?.source||null,e?.date||null,e?.time||null])
    ]);
    mem.secondary_calendar_guard_v01129={
        version:'0.11.29',at:new Date().toISOString(),fingerprint:finalFingerprint,
        reality_anchors:axis.dateAnchors.length,rows_fixed:rowsFixed,date_fixed:dateFixed,time_fixed:timeFixed
    };
    if(changed){
        mem.audit=Array.isArray(mem.audit)?mem.audit:[];
        mem.audit.push({
            at:new Date().toISOString(),type:'secondary_calendar_guard_v01129',
            reality_anchors:axis.dateAnchors.length,rows_fixed:rowsFixed,
            current_date_fixed:dateFixed,current_time_fixed:timeFixed,
            repairs:repairs.slice(0,12),
            reason:'现实时间为主轴；副本/场景日历降级为第二时间轴'
        });
        if(mem.audit.length>50) mem.audit=mem.audit.slice(-50);
    }
    return {found:true,changed,rows_fixed:rowsFixed,date_fixed:dateFixed,time_fixed:timeFixed};
}

function restoreMissingCurrentLocationV01129(mem=M(),endInclusive=null) {
    if(!mem.current_scene||typeof mem.current_scene!=='object'||Array.isArray(mem.current_scene)) mem.current_scene={};
    if(!isMissingStoryValueV0112(mem.current_scene.location)) return {changed:false,reason:'already_known'};

    const chat=C().chat||[];
    const cap=endInclusive==null
        ? Math.min(chat.length-1,Math.max(-1,Number(mem?.last_processed_index??-1)))
        : Math.min(chat.length-1,Math.max(-1,Number(endInclusive)));
    const candidates=[];
    for(const e of (Array.isArray(mem?.timeline)?mem.timeline:[])){
        const idx=sourceLast(e?.source);
        if(Number.isFinite(idx)&&idx<=cap&&!isMissingStoryValueV0112(e?.location)){
            candidates.push({index:idx,rank:1,value:String(e.location).trim(),source:'timeline'});
        }
    }
    for(let i=0;i<=cap;i++){
        const meta=extractWorldStateMetadataV0112(chat[i]);
        if(meta?.location&&!isMissingStoryValueV0112(meta.location)){
            candidates.push({index:i,rank:2,value:String(meta.location).trim(),source:meta.location_path||'world_meta'});
        }
        const cue=currentStoryCueFromMessageV01121(chat[i],i);
        if(cue?.location&&!isMissingStoryValueV0112(cue.location)){
            candidates.push({index:i,rank:3,value:String(cue.location).trim(),source:'canonical_prose'});
        }
    }
    candidates.sort((a,b)=>(a.index-b.index)||(a.rank-b.rank));
    const chosen=candidates.at(-1);
    if(!chosen) return {changed:false,reason:'no_reliable_location'};

    mem.current_scene.location=chosen.value;
    mem.audit=Array.isArray(mem.audit)?mem.audit:[];
    mem.audit.push({
        at:new Date().toISOString(),type:'current_location_restored_v01129',
        location:chosen.value,evidence:`${chosen.source}#${chosen.index}`,
        reason:'后续批次的空值/未建立不得抹除已确认地点'
    });
    if(mem.audit.length>50) mem.audit=mem.audit.slice(-50);
    return {changed:true,location:chosen.value,evidence:`${chosen.source}#${chosen.index}`};
}

// =========================================================
// v0.11.30 narrative-calendar repair
//
// story_start is an immutable origin, not a permanent minimum date.  A card can
// start in 2026 and then enter a fully dated 2003 simulation.  timeline.date and
// current_story_date follow the active narrative scene; an MVU reality clock is
// retained separately as reality_date/reality_time.
// =========================================================
function normalizeNarrativeClockV01130(value) {
    const src=String(value||'').replace(/：/g,':').replace(/[|｜·]/g,' ').trim();
    if(!src) return null;
    const re=/(凌晨|清晨|早晨|早上|上午|中午|正午|下午|傍晚|晚上|晚间|夜间|夜晚|深夜)?\s*([01]?\d|2[0-3]):([0-5]\d)/g;
    const hits=[];
    let m;
    while((m=re.exec(src))){
        let h=Number(m[2]);
        const period=m[1]||'';
        if(/下午|傍晚|晚上|晚间|夜间|夜晚|深夜/.test(period)&&h<12) h+=12;
        if(/凌晨/.test(period)&&h===12) h=0;
        const clock=`${String(h).padStart(2,'0')}:${m[3]}`;
        hits.push({period:period==='正午'?'中午':period,clock});
    }
    if(hits.length){
        const first=[hits[0].period,hits[0].clock].filter(Boolean).join(' ');
        if(hits.length===1) return first;
        const second=[hits[1].period&&hits[1].period!==hits[0].period?hits[1].period:'',hits[1].clock].filter(Boolean).join(' ');
        return `${first}-${second}`;
    }
    const fuzzy=src.match(/(?:凌晨|清晨|早晨|早上|上午|中午|正午|下午|傍晚|晚上|晚间|夜间|夜晚|深夜)/)?.[0];
    return fuzzy==='正午'?'中午':(fuzzy||null);
}

function safeTimelineTimeInfoV01131(entry) {
    const raw=String(entry?.time||'').trim();
    const evidence=classifySourceTimeEvidence(entry);
    if(!raw) return {time:null,evidence,downgraded:false};

    const clocks=clockCandidatesFromTimelineTime(raw);
    const sceneDate=normalizeDateInput(entry?.date||'')?.iso||null;
    const sourceMeta=worldStateMetaForSourceV0112(entry?.source);
    const realityDate=normalizeDateInput(
        entry?.reality_date||[...sourceMeta].reverse().find(x=>x?.date_reality&&x?.date)?.date||''
    )?.iso||null;
    const separateReality=entry?.calendar_axis==='scene'||!!(sceneDate&&realityDate&&sceneDate!==realityDate);
    const canonical=sourceTextForTime(entry?.source);
    const allCanonical=clocks.length>0&&clocks.every(x=>temporalTextContainsClockV01131(canonical,x));
    const recapTrusted=evidence.level==='structured'&&/角色卡摘要|预设摘要/.test(String(evidence.label||''));
    const exactTrusted=clocks.length>0&&(allCanonical||recapTrusted||(!separateReality&&evidence.level==='structured'));
    if(exactTrusted) return {
        time:ensureWeekdayTimelineTimeLocalV0119(raw,entry?.date),
        evidence,downgraded:false
    };

    if(clocks.length){
        const parts=[...new Set(clocks.map(timelineDaypartLocalV01118).filter(Boolean))];
        const base=parts.length===1?`${parts[0]}（具体时刻未明确）`:'时间未明确';
        return {
            time:ensureWeekdayTimelineTimeLocalV0119(base,entry?.date),
            evidence:{
                level:'inferred',
                label:parts.length===1?'总结推测时段':'时间未明确',
                reason:'具体钟点未在 source 正文或允许的同楼状态元数据中得到验证，已移除精确分钟'
            },
            downgraded:true
        };
    }

    const part=raw.match(/(?:凌晨|半夜|清晨|早晨|早上|上午|中午|正午|下午|傍晚|晚上|晚间|夜间|夜晚|深夜)/)?.[0]||null;
    if(part&&(evidence.level==='inferred'||evidence.level==='unverified')){
        const normalizedPart=part==='正午'?'中午':part;
        const base=/具体时刻未明确|具体时间未明确/.test(raw)?raw:`${normalizedPart}（具体时刻未明确）`;
        return {
            time:ensureWeekdayTimelineTimeLocalV0119(base,entry?.date),
            evidence:{
                level:'inferred',label:'总结推测时段',
                reason:'原文未明确具体钟点；仅保留低精度时段，不作为钟点锚点'
            },
            downgraded:base!==raw
        };
    }

    return {time:raw,evidence,downgraded:false};
}

function applyTimelineTimePrecisionV01131(entry) {
    if(!entry||typeof entry!=='object') return {changed:false,downgraded:false};
    const info=safeTimelineTimeInfoV01131(entry);
    let changed=false;
    if((entry.time??null)!==(info.time??null)){entry.time=info.time;changed=true;}
    for(const [key,value] of [
        ['time_evidence',info.evidence.level],
        ['time_evidence_label',info.evidence.label],
        ['time_evidence_reason',info.evidence.reason]
    ]){
        if(entry[key]!==value){entry[key]=value;changed=true;}
    }
    return {changed,downgraded:info.downgraded,time:info.time,evidence:info.evidence};
}

function repairTimelinePrecisionV01131(mem=M(),endInclusive=null,{audit=false}={}) {
    const chat=C().chat||[];
    const cap=endInclusive==null
        ? Math.min(chat.length-1,Math.max(-1,Number(mem?.last_processed_index??chat.length-1)))
        : Math.min(chat.length-1,Math.max(-1,Number(endInclusive)));
    const rows=Array.isArray(mem?.timeline)?mem.timeline:[];
    let scanned=0,changed=0,downgraded=0;
    for(const e of rows){
        const last=sourceLast(e?.source);
        if(last<0||last>cap) continue;
        scanned++;
        const result=applyTimelineTimePrecisionV01131(e);
        if(result.changed) changed++;
        if(result.downgraded) downgraded++;
    }
    if(audit&&changed){
        mem.audit=Array.isArray(mem.audit)?mem.audit:[];
        mem.audit.push({
            at:new Date().toISOString(),type:'timeline_precision_repaired_v01131',
            scanned,changed,downgraded,api_calls:0,
            reason:'无同楼原文/状态依据的精确钟点已降级为时段或时间未明确；推测分钟不再作为时间锚点'
        });
        if(mem.audit.length>50) mem.audit=mem.audit.slice(-50);
    }
    return {scanned,changed,downgraded,api_calls:0};
}

function narrativeSummaryRecordsV01130(m,userMsg=null,mem=M()) {
    if(!m||m.is_user) return [];
    const direct=[];
    for(const block of rawSummaryBlocksLocalV0119(m)){
        const serial=childTagTextLocalV0119(block.raw,'serial');
        const timeRaw=childTagTextLocalV0119(block.raw,'time');
        const scene=childTagTextLocalV0119(block.raw,'scene');
        const plot=childTagTextLocalV0119(block.raw,'plot');
        if(!plot) continue;
        direct.push({
            tag:block.tag,
            record_no:serial.match(/(\d{1,6})/)?.[1]||null,
            date:normalizeSummaryDateLocalV0115(timeRaw),
            time:normalizeNarrativeClockV01130(timeRaw),
            location:scene||null,
            event:cleanupPresetPlotLocalV0119(plot,280),
            __direct_preset_plot_v0119:true
        });
    }
    if(direct.length) return direct;
    // v0.11.44: a bounded assistant-authored recap panel is reliable metadata
    // for its labelled story date/time. It is not a SillyTavern message header.
    const roleCard=roleCardRecapRecordsV01135(m,userMsg,mem);
    if(roleCard.length) return roleCard;
    const labeled=labeledSummaryRecordsLocalV01133(m,userMsg,mem);
    if(labeled.length) return labeled;
    return structuredSummaryRecordsLocalV0119(m,userMsg,mem).map(rec=>({
        ...rec,
        date:normalizeDateInput(rec?.date||'')?.iso||null,
        time:normalizeNarrativeClockV01130(rec?.time)||rec?.time||null
    }));
}

function markedCurrentStatusV01130(m,index=-1) {
    if(!m||m.is_user) return null;
    const roleStatus=extractRoleplayStatusMetadataV01133(m,index);
    if(roleStatus&&(roleStatus.date||roleStatus.time||roleStatus.location)) return roleStatus;
    const visible=cleanMes(m)
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
    const text=plainTextLocalV0114(stripAuxiliaryBlocksV0110(visible));
    if(!text) return null;
    const patterns=[
        /(?:即时状态|当前状态|场景档案)[\s\S]{0,260}?(?:当前)?时间\s*[:：]\s*((?:20\d{2})[年\-\/.]\d{1,2}[月\-\/.]\d{1,2}日?)([\s\S]{0,55}?)(?=(?:地点|位置|在场|人物|状态|动作|剧情摘要|世界动态)\s*[:：]?|$)/gi,
        /(?:当前时间|剧情时间|故事时间|时间)\s*[:：]\s*((?:20\d{2})[年\-\/.]\d{1,2}[月\-\/.]\d{1,2}日?)([^\n]{0,55})/gi
    ];
    const hits=[];
    for(const re of patterns){
        let match;
        while((match=re.exec(text))){
            const date=normalizeSummaryDateLocalV0115(match[1]);
            const time=normalizeNarrativeClockV01130(match[2]);
            if(date) hits.push({at:match.index,date,time});
        }
    }
    if(!hits.length) return null;
    const best=hits.sort((a,b)=>a.at-b.at).at(-1);
    const tail=text.slice(best.at,Math.min(text.length,best.at+650));
    const loc=tail.match(/(?:地点|位置)\s*[:：]\s*([\s\S]{2,180}?)(?=\s*(?:在场|人物|状态|动作|剧情摘要|世界动态)\s*[:：]?|$)/i)?.[1]||null;
    return {
        index,date:best.date,time:best.time,
        location:loc?sanitizeWorldMetaValueV0112(loc,180):null,
        kind:'marked_current_status'
    };
}

function unpackSecondarySceneTimeV01130(value) {
    const raw=String(value||'').trim();
    const m=raw.match(/^\[\s*(?:场景第二时间轴|副本|场景时间)[·：:]\s*((?:20\d{2})-\d{2}-\d{2})(?:\s+([\s\S]*?))?\s*\]$/);
    if(!m) return null;
    return {date:normalizeDateInput(m[1])?.iso||null,time:String(m[2]||'').trim()||null};
}

function bestNarrativeSummaryForRowV01130(e,mem=M()) {
    const chat=C().chat||[];
    const candidates=[];
    for(const i of sourceIndexes(e?.source)){
        const msg=chat[i];
        if(!msg||msg.is_user) continue;
        const prev=(i>0&&chat[i-1]?.is_user)?chat[i-1]:null;
        for(const rec of narrativeSummaryRecordsV01130(msg,prev,mem)){
            if(!rec.date&&!rec.time&&!rec.location) continue;
            const similarity=textSimilarity(String(e?.event||''),String(rec?.event||''));
            candidates.push({...rec,index:i,similarity});
        }
    }
    candidates.sort((a,b)=>(a.index-b.index)||(a.similarity-b.similarity));
    return candidates.at(-1)||null;
}

function narrativeEvidenceForRowV01130(e,mem=M()) {
    const chat=C().chat||[];
    const indexes=[...sourceIndexes(e?.source)].sort((a,b)=>a-b);
    const summary=bestNarrativeSummaryForRowV01130(e,mem);
    const unpacked=unpackSecondarySceneTimeV01130(e?.time);
    let status=null;
    let prose=null;
    for(const i of [...indexes].reverse()){
        if(!status) status=markedCurrentStatusV01130(chat[i],i);
        const cue=currentStoryCueFromMessageV01121(chat[i],i);
        if(cue?.date){prose={...cue,kind:'canonical_scene_cue'};break;}
    }
    const world=exactWorldStateMetaSameSourceV0117(indexes);
    let primary=null;
    if(summary&&(summary.date||summary.time)) primary={...summary,kind:'preset_summary'};
    else if(unpacked?.date) primary={...unpacked,index:sourceLast(e?.source),kind:'v01129_secondary_label'};
    else if(status?.date) primary=status;
    else if(prose?.date) primary=prose;
    else if(world.date||world.time) primary={
        date:world.date||null,time:world.time||null,location:world.location||null,
        index:world.index,kind:world.date_reality||world.time_reality?'world_reality_meta':'world_meta'
    };
    return {
        primary,
        reality_date:world.date_reality?world.date||null:null,
        reality_time:world.time_reality?world.time||null:null,
        reality_index:world.index
    };
}

function repairNarrativeCalendarV01130(mem=M(),endInclusive=null) {
    const timeline=Array.isArray(mem?.timeline)?mem.timeline:[];
    const chat=C().chat||[];
    const cap=endInclusive==null
        ? Math.min(chat.length-1,Math.max(-1,Number(mem?.last_processed_index??chat.length-1)))
        : Math.min(chat.length-1,Math.max(-1,Number(endInclusive)));
    if(!timeline.length) return {found:false,changed:false,rows_fixed:0};

    const fingerprint=JSON.stringify([
        cap,mem?.story_start||null,timeline.map(e=>[
            e?.source||null,e?.date||null,e?.date_hint||null,
            e?.date_precision||null,e?.time||null
        ])
    ]);
    if(mem?.narrative_calendar_v01130?.version==='0.11.44'&&mem?.narrative_calendar_v01130?.input_fingerprint===fingerprint){
        return {found:true,changed:false,rows_fixed:0,cached:true};
    }

    const allRows=timeline.map((e,pos)=>({e,pos,first:sourceFirst(e?.source),last:sourceLast(e?.source)}))
        .filter(x=>x.first>=0&&x.first<=cap)
        .sort((a,b)=>(a.first-b.first)||(a.last-b.last)||(a.pos-b.pos));
    const priorRun=mem?.narrative_calendar_v01130;
    const fullUpgrade=priorRun?.version!=='0.11.44'||!Number.isInteger(priorRun?.processed_to)||Number(priorRun.processed_to)>cap;
    const scanFrom=fullUpgrade?0:Math.max(0,Number(priorRun.processed_to)-6);
    const rows=allRows.filter(x=>x.last>=scanFrom);
    const earlier=allRows.filter(x=>x.last<scanFrom);
    let changed=false,rowsFixed=0,timeFixed=0,realityStored=0,timePrecisionDowngraded=0;
    let segments=earlier.reduce((n,x)=>Math.max(n,Number(x.e?.calendar_segment||0)),0);
    let directCount=0;
    const storyStartInfo=storyStartDescriptorV01132(mem?.story_start);
    const storyStartMonth=storyStartInfo.precision==='month'?storyStartInfo.month:null;
    let rollingDate=normalizeDateInput(earlier.at(-1)?.e?.date||'')?.iso||isoDateFromAny(mem?.story_start)||null;
    let previousDirectDate=rollingDate;

    for(const row of rows){
        const evidence=narrativeEvidenceForRowV01130(row.e,mem);
        row.evidence=evidence;
        const p=evidence.primary;
        if(p?.date){
            const date=normalizeDateInput(p.date)?.iso||null;
            if(date){
                directCount++;
                if(previousDirectDate){
                    const diff=dateDiffDaysLocalV0114(previousDirectDate,date);
                    if(diff!=null&&(diff<0||Math.abs(diff)>62)) segments++;
                }
                previousDirectDate=date;
                rollingDate=date;
                if(normalizeDateInput(row.e.date||'')?.iso!==date){row.e.date=date;changed=true;rowsFixed++;}
                if(clearTimelineMonthPrecisionV01132(row.e)) changed=true;
                const directDateReason=`同 source 的${p.kind==='preset_summary'?'预设剧情摘要':'正文/状态'}明确给出完整日期`;
                for(const [key,value] of [
                    ['date_evidence','explicit'],
                    ['date_evidence_label','原文明确日期'],
                    ['date_evidence_reason',directDateReason]
                ]){
                    if(row.e[key]!==value){row.e[key]=value;changed=true;}
                }
                if(Number(row.e.calendar_segment??-1)!==segments){row.e.calendar_segment=segments;changed=true;}
                const axisLabel=(evidence.reality_date&&evidence.reality_date!==date)?'scene':'narrative';
                if(row.e.calendar_axis!==axisLabel){row.e.calendar_axis=axisLabel;changed=true;}
                row.direct=true;
            }
        }
        if(p?.time&&(p.kind==='preset_summary'||p.kind==='v01129_secondary_label')){
            const time=normalizeNarrativeClockV01130(p.time)||String(p.time||'').trim();
            const safe=safeTimelineTimeInfoV01131({
                ...row.e,time,
                reality_date:evidence.reality_date||row.e.reality_date||null,
                reality_time:evidence.reality_time||row.e.reality_time||null,
                calendar_axis:(evidence.reality_date&&row.e.date&&evidence.reality_date!==row.e.date)?'scene':row.e.calendar_axis
            });
            if(safe.downgraded) timePrecisionDowngraded++;
            const normalized=safe.time;
            if(normalized&&String(row.e.time||'')!==normalized){row.e.time=normalized;changed=true;timeFixed++;}
            if(row.e.time_evidence!==safe.evidence.level||row.e.time_evidence_label!==safe.evidence.label||row.e.time_evidence_reason!==safe.evidence.reason){
                row.e.time_evidence=safe.evidence.level;
                row.e.time_evidence_label=safe.evidence.label;
                row.e.time_evidence_reason=safe.evidence.reason;
                changed=true;
            }
        }
        if(p?.location&&isMissingStoryValueV0112(row.e.location)){
            row.e.location=String(p.location).trim();changed=true;
        }
        if(evidence.reality_date){
            if(row.e.reality_date!==evidence.reality_date){row.e.reality_date=evidence.reality_date;changed=true;realityStored++;}
        }
        if(evidence.reality_time){
            if(row.e.reality_time!==evidence.reality_time){row.e.reality_time=evidence.reality_time;changed=true;}
        }
    }

    // Fill unlabelled rows only after the first direct scene anchor.  This keeps
    // the opening 2026 segment intact while repairing rows between 2003 preset
    // summaries without inventing a new calendar transition.
    rollingDate=normalizeDateInput(earlier.at(-1)?.e?.date||'')?.iso||null;
    let rollingSegment=Number(earlier.at(-1)?.e?.calendar_segment||0);
    const nextDirectByPosition=new Array(rows.length).fill(null);
    let nextDirect=null;
    for(let pos=rows.length-1;pos>=0;pos--){
        nextDirectByPosition[pos]=nextDirect;
        if(rows[pos].direct) nextDirect=rows[pos];
    }
    let previousDirect=null;
    for(let pos=0;pos<rows.length;pos++){
        const row=rows[pos];
        if(row.direct){
            rollingDate=normalizeDateInput(row.e.date||'')?.iso||rollingDate;
            rollingSegment=Number(row.e.calendar_segment||0);
            previousDirect=row;
            continue;
        }

        // A month-only opening remains month-only until the first independently
        // dated source.  This is the normal representation for a story known to
        // start in October 2003 when its exact opening day was never stated.
        if(!rollingDate&&storyStartMonth){
            if(setTimelineMonthPrecisionV01132(row.e,storyStartMonth,{
                evidence:'story_start_month',
                label:'剧情起点月份',
                reason:'剧情起点只确认到月份；等待后续原文建立具体日期'
            })){
                changed=true;rowsFixed++;
            }
            continue;
        }
        if(!rollingDate) continue;

        // A source-only row can sit just before the first dated reply of a new
        // calendar segment. Keeping the previous (for example 2026) date would
        // be a false assertion. When it is decisively closer to the following
        // direct scene anchor, attach it only to that scene's MONTH.  Borrowing
        // the later anchor's exact day would fabricate precision for the older
        // row; an exact clock is likewise forbidden unless independently verified.
        const following=nextDirectByPosition[pos];
        const followingDate=normalizeDateInput(following?.e?.date||'')?.iso||null;
        const followingSegment=Number(following?.e?.calendar_segment||0);
        if(previousDirect&&following&&followingDate&&followingSegment!==rollingSegment){
            const previousDistance=Math.max(0,row.first-previousDirect.last);
            const followingDistance=Math.max(0,following.first-row.last);
            if(followingDistance+2<previousDistance){
                const followingMonth=followingDate.slice(0,7);
                if(setTimelineMonthPrecisionV01132(row.e,followingMonth,{
                    evidence:'contextual_month',
                    label:'邻近场景月份',
                    reason:`source 更接近后续明确场景 #${following.first}；仅继承场景月份，具体日期未明确`
                })){
                    changed=true;rowsFixed++;
                }
                if(Number(row.e.calendar_segment??-1)!==followingSegment){row.e.calendar_segment=followingSegment;changed=true;}
                const nextAxis=following.e.calendar_axis||'scene';
                if(row.e.calendar_axis!==nextAxis){row.e.calendar_axis=nextAxis;changed=true;}
                continue;
            }
        }

        const sourceText=sourceTextForTime(row.e.source);
        if(hasNextDayCueTextV0114(sourceText)) rollingDate=addDaysISO(rollingDate,1)||rollingDate;
        const old=normalizeDateInput(row.e.date||'')?.iso||null;
        if(old!==rollingDate){row.e.date=rollingDate;row.e.calendar_segment=rollingSegment;changed=true;rowsFixed++;}
        if(row.e.time){
            const normalized=ensureWeekdayTimelineTimeLocalV0119(row.e.time,row.e.date);
            if(normalized&&normalized!==row.e.time){row.e.time=normalized;changed=true;timeFixed++;}
        }
    }

    // v0.11.32: sanitize every referenced historical row, including rows that
    // have no old preset summary. Exact recap guesses are reduced to a broad
    // daypart (or unknown) and therefore cannot drive later clock continuity.
    const precision=repairTimelinePrecisionV01131(mem,cap,{audit:false});
    if(precision.changed) changed=true;
    const precisionDowngraded=timePrecisionDowngraded+precision.downgraded;

    timeline.sort((a,b)=>(sourceFirst(a?.source)-sourceFirst(b?.source))||(sourceLast(a?.source)-sourceLast(b?.source)));
    const reality=realityAxisStateV01129(cap);
    if(reality.latestDate&&mem.current_reality_date!==reality.latestDate){mem.current_reality_date=reality.latestDate;changed=true;}
    if(reality.latestTime&&mem.current_reality_time!==reality.latestTime){mem.current_reality_time=reality.latestTime;changed=true;}

    const finalFingerprint=JSON.stringify([
        cap,mem?.story_start||null,timeline.map(e=>[
            e?.source||null,e?.date||null,e?.date_hint||null,
            e?.date_precision||null,e?.time||null
        ])
    ]);
    mem.narrative_calendar_v01130={
        version:'0.11.44',at:new Date().toISOString(),input_fingerprint:finalFingerprint,
        processed_to:cap,scan_from:scanFrom,
        direct_anchors:directCount,rows_fixed:rowsFixed,time_fixed:timeFixed,
        time_precision_changed:precision.changed,time_precision_downgraded:precisionDowngraded,
        reality_fields_stored:realityStored,calendar_segments:segments+1
    };
    if(changed){
        mem.audit=Array.isArray(mem.audit)?mem.audit:[];
        mem.audit.push({
            at:new Date().toISOString(),type:'narrative_calendar_repaired_v01132',
            direct_anchors:directCount,rows_fixed:rowsFixed,time_fixed:timeFixed,
            time_precision_changed:precision.changed,time_precision_downgraded:precisionDowngraded,
            calendar_segments:segments+1,
            reason:'剧情时间线按 source 顺序采用场景日历；月份已知但日期未知时保留月级精度；无原文依据的精确分钟降级为低精度时段'
        });
        if(mem.audit.length>50) mem.audit=mem.audit.slice(-50);
    }
    return {
        found:directCount>0||!!storyStartMonth,changed,rows_fixed:rowsFixed,time_fixed:timeFixed,
        time_precision_changed:precision.changed,time_precision_downgraded:precisionDowngraded,
        direct_anchors:directCount,segments:segments+1
    };
}

function resolveCurrentNarrativeStateV01130(mem=M(),endInclusive=null) {
    const chat=C().chat||[];
    const cap=endInclusive==null?chat.length-1:Math.min(chat.length-1,Math.max(-1,Number(endInclusive)));
    const start=Math.max(0,cap-119);
    const candidates=[];
    for(let i=start;i<=cap;i++){
        const msg=chat[i];
        if(!msg||msg.is_user) continue;
        const status=markedCurrentStatusV01130(msg,i);
        if(status) candidates.push({...status,priority:4});
        const prev=(i>0&&chat[i-1]?.is_user)?chat[i-1]:null;
        const rec=narrativeSummaryRecordsV01130(msg,prev,mem).at(-1);
        if(rec&&(rec.date||rec.time||rec.location)) candidates.push({...rec,index:i,kind:'preset_summary',priority:3});
    }
    const latest=latestTimelineStateV01121(mem);
    if(latest.index>=0&&(latest.date||latest.time||latest.location)) candidates.push({...latest,kind:'timeline',priority:2});
    const world=latestWorldStateFieldsInRangeV01121(start,cap+1);
    if(world&&(world.date||world.time||world.location)) candidates.push({
        date:world.date,time:world.time,location:world.location,index:Math.max(world.date_index,world.time_index,world.location_index),
        kind:world.date_reality||world.time_reality?'world_reality_meta':'world_meta',priority:1
    });
    candidates.sort((a,b)=>(Number(a.index)-Number(b.index))||(Number(a.priority)-Number(b.priority)));
    const chosen=candidates.at(-1);
    if(!chosen) return {changed:false,source:'none'};

    const before={date:mem.current_story_date||null,time:mem.current_story_time||null,location:mem?.current_scene?.location||null};
    const nextDate=normalizeDateInput(chosen.date||'')?.iso||before.date||null;
    let nextTime=normalizeNarrativeClockV01130(chosen.time)||chosen.time||before.time||null;
    if(chosen.kind==='preset_summary'&&chosen.time){
        // A recap may state a useful current daypart, but its minute value is
        // not canonical unless the same reply's story body/state confirms it.
        nextTime=safeTimelineTimeInfoV01131({
            date:nextDate,time:nextTime,source:`#${chosen.index}`
        }).time||before.time||null;
    }
    if(nextTime&&nextDate) nextTime=ensureWeekdayTimelineTimeLocalV0119(nextTime,nextDate);
    const nextLocation=!isMissingStoryValueV0112(chosen.location)?String(chosen.location).trim():before.location;
    if(!mem.current_scene||typeof mem.current_scene!=='object'||Array.isArray(mem.current_scene)) mem.current_scene={};
    let changed=false;
    if((mem.current_story_date||null)!==(nextDate||null)){mem.current_story_date=nextDate;changed=true;}
    if((mem.current_story_time||null)!==(nextTime||null)){mem.current_story_time=nextTime;changed=true;}
    if((mem.current_scene.location||null)!==(nextLocation||null)){
        if(nextLocation) mem.current_scene.location=nextLocation; else delete mem.current_scene.location;
        changed=true;
    }
    if(changed){
        mem.audit=Array.isArray(mem.audit)?mem.audit:[];
        mem.audit.push({
            at:new Date().toISOString(),type:'current_narrative_state_resolved_v01131',
            before,after:{date:mem.current_story_date||null,time:mem.current_story_time||null,location:mem.current_scene.location||null},
            source:`${chosen.kind}#${chosen.index}`,
            reason:'当前剧情状态按最新 source 证据选择，允许明确的场景日历切换，不按年份大小判断新旧'
        });
        if(mem.audit.length>50) mem.audit=mem.audit.slice(-50);
    }
    return {changed,source:`${chosen.kind}#${chosen.index}`,date:mem.current_story_date||null,time:mem.current_story_time||null,location:mem.current_scene.location||null};
}

let CURRENT_STATE_SAVE_PENDING_V01121 = false;
function refreshCurrentStoryStateV01121({persist=true}={}) {
    let result;
    try {
        const mem=M();
        // v0.11.30 deliberately does not run the old reality-axis hard guard:
        // it rewrote a valid 2003 scene calendar into 2026.  Repair only the
        // timeline date/time fields from their existing source references.
        const narrativeCalendar=repairNarrativeCalendarV01130(mem);
        result = resolveCurrentNarrativeStateV01130(mem);
        const locationRepair=restoreMissingCurrentLocationV01129(mem);
        result.narrative_calendar=narrativeCalendar;
        result.location_repair=locationRepair;
        if(narrativeCalendar.changed||locationRepair.changed) result.changed=true;
    }
    catch (e) {
        console.warn('[StoryMemory] v0.11.33 current-state resolver failed', e);
        return {changed:false,error:String(e?.message||e)};
    }
    if (result.changed && persist && !CURRENT_STATE_SAVE_PENDING_V01121) {
        CURRENT_STATE_SAVE_PENDING_V01121 = true;
        Promise.resolve(saveMeta())
            .catch(e=>console.warn('[StoryMemory] v0.11.33 current-state save failed',e))
            .finally(()=>{ CURRENT_STATE_SAVE_PENDING_V01121=false; });
    }
    return result;
}

function makeLocalTimelineNodesV0116(start,endInclusive,mem=M()) {
    const nodes=makeLocalTimelineNodesV0115(start,endInclusive,mem);
    const chat=C().chat||[];
    for(const node of nodes){
        const idx=[...sourceIndexes(node?.source)].sort((a,b)=>a-b);
        let userName='';
        for(const i of idx){ if(chat[i]?.is_user){ userName=String(chat[i]?.name||'').trim(); if(userName) break; } }
        const compact=compressEventLocalV0116(node.event,userName,190);
        if(compact) node.event=compact;
    }
    return nodes;
}


// =========================================================
// v0.11.8 unified local temporal calibration + cleaner 0 API compression
// =========================================================

const WEEKDAY_CN_V0117=['周日','周一','周二','周三','周四','周五','周六'];

function weekdayIndexISO_V0117(date){
    const iso=normalizeDateInput(date)?.iso||null;
    if(!iso) return null;
    const t=Date.parse(iso+'T00:00:00Z');
    return Number.isFinite(t)?new Date(t).getUTCDay():null;
}

function weekdayIndexTextV0117(time){
    const m=String(time||'').match(/(?:星期|周)\s*([一二三四五六日天])/);
    if(!m) return null;
    return ({'日':0,'天':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6})[m[1]] ?? null;
}

function weekdayLabelISO_V0117(date){
    const i=weekdayIndexISO_V0117(date);
    return i==null?'':WEEKDAY_CN_V0117[i];
}

function normalizeWeekdayInTimeV0117(time,date){
    let t=String(time||'').trim();
    if(!t||!date) return t||null;
    const label=weekdayLabelISO_V0117(date);
    if(!label) return t;
    if(/星期\s*[一二三四五六日天]/.test(t)) t=t.replace(/星期\s*[一二三四五六日天]/,label);
    else if(/周\s*[一二三四五六日天]/.test(t)) t=t.replace(/周\s*[一二三四五六日天]/,label);
    return t;
}

function exactWorldStateMetaSameSourceV0117(indexes){
    const chat=C().chat||[];
    const out={
        date:null,time:null,location:null,index:null,
        date_path:null,time_path:null,location_path:null,
        date_reality:false,time_reality:false,reality_axis:false
    };
    for(const i of [...new Set(indexes||[])].sort((a,b)=>b-a)){
        const meta=extractWorldStateMetadataV0112(chat[i]);
        if(!meta) continue;
        if(out.index==null) out.index=i;
        if(!out.date&&meta.date){ out.date=meta.date; out.date_path=meta.date_path; out.date_reality=!!meta.date_reality; }
        if(!out.time&&meta.time){ out.time=meta.time; out.time_path=meta.time_path; out.time_reality=!!meta.time_reality; }
        if(!out.location&&meta.location){ out.location=meta.location; out.location_path=meta.location_path; }
        if(meta.reality_axis) out.reality_axis=true;
        if(out.date&&out.time&&out.location) break;
    }
    return out;
}

function structuredSummaryRecordsLocalV0117(m,userMsg=null,mem=M()){
    const old=structuredSummaryRecordsLocalV0115(m,userMsg,mem);
    if(old.length) return old;
    if(!m||m.is_user) return [];
    const out=[];
    for(const block of summaryBlocksLocalV0115(m)){
        const text=String(block.text||'').trim();
        if(!text) continue;
        // Pluto / similar preset abstract:
        // serial:日月华章-047 time:2025-09-22 周一 | 19:30 ... scene: 主场景 - xxx ... plot: ...
        const tm=text.match(/\btime\s*:\s*((?:20\d{2})[\-\/.]\d{1,2}[\-\/.]\d{1,2})\s*((?:星期|周)\s*[一二三四五六日天])?\s*(?:[|｜]\s*)?((?:[01]?\d|2[0-3])[:：][0-5]\d(?:\s*(?:-|~|～|—|–|至|到)\s*(?:[01]?\d|2[0-3])[:：][0-5]\d)?)/i);
        const plot=text.match(/\bplot\s*:\s*([\s\S]*?)$/i);
        if(!tm||!plot) continue;
        const serial=text.match(/\bserial\s*:\s*([^\s]+)/i)?.[1]||'';
        const no=serial.match(/(\d{1,4})$/)?.[1]||null;
        let scene='';
        const sm=text.match(/\bscene\s*:\s*([\s\S]*?)(?=\s+(?:【[^】]*】\s*:|plot\s*:)|$)/i);
        if(sm){
            scene=String(sm[1]||'')
                .replace(/^\s*(?:主场景\s*[-—–:]?\s*)/i,'')
                .replace(/\s*\(\s*停留回合\s*[:：][^)]*\)\s*$/,'')
                .trim();
        }
        let event=String(plot[1]||'')
            .replace(/\b(?:serial|time|NSFW|scene)\s*:[^；;\n]*/gi,' ')
            .replace(/^[|｜:：\-–—\s]+/,'')
            .trim();
        if(!event) continue;
        out.push({
            tag:block.tag,
            record_no:no,
            date:normalizeSummaryDateLocalV0115(tm[1]),
            time:`${tm[2]?tm[2].replace(/\s+/g,''):''}${tm[2]?' ':''}${tm[3].replace(/：/g,':')}`.trim(),
            location:scene||null,
            event
        });
    }
    return out;
}


// =========================================================
// v0.11.15: preset-summary-first 0 API parser.
// Structured <abstract><plot> generated by the active RP preset is already a
// model-written plot summary. Preserve it directly instead of re-extracting
// dialogue fragments from raw prose.
// =========================================================

function childTagTextLocalV0119(raw, tag) {
    const re=new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,'i');
    const m=String(raw||'').match(re);
    if(!m) return '';
    return plainTextLocalV0114(stripAuxiliaryBlocksV0110(m[1])).replace(/\s+/g,' ').trim();
}

function rawSummaryBlocksLocalV0119(m) {
    if(!m || m.is_user) return [];
    const raw=String(m?.mes||'');
    const out=[];
    for(const tag of ['abstract','meow_FM','scene_summary','memory_summary','story_summary','plot_summary','剧情摘要']){
        const re=new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,'gi');
        let hit;
        while((hit=re.exec(raw))) out.push({tag,raw:String(hit[1]||'')});
    }
    return out;
}

function parseAbstractTimeLocalV0119(raw) {
    const src=String(raw||'').replace(/：/g,':').trim();
    const date=normalizeSummaryDateLocalV0115(src);
    const clocks=[...src.matchAll(/(?:^|[^\d])((?:[01]?\d|2[0-3]):[0-5]\d)(?!\d)/g)].map(m=>m[1]);
    let time=null;
    if(clocks.length>=2) time=`${clocks[0]}-${clocks[1]}`;
    else if(clocks.length===1) time=clocks[0];
    else {
        const fuzzy=src.match(/(?:凌晨|清晨|早晨|早上|上午|中午|下午|傍晚|晚上|晚间|夜间|深夜)/);
        if(fuzzy) time=fuzzy[0];
    }
    return {date,time};
}

function cleanupPresetPlotLocalV0119(text,maxLen=280) {
    let s=plainTextLocalV0114(stripAuxiliaryBlocksV0110(String(text||'')))
        .replace(/^\s*(?:plot|剧情|剧情总结)\s*[:：]\s*/i,'')
        .replace(/\s+/g,' ')
        .replace(/；{2,}/g,'；')
        .trim();
    if(!s) return '';
    // PLUTO explicitly asks <plot> to be concise/objective. Do not run the local
    // sentence scorer over it; only cap pathological outputs conservatively.
    if(s.length>maxLen){
        const cut=s.slice(0,maxLen);
        const stop=Math.max(cut.lastIndexOf('。'),cut.lastIndexOf('；'));
        s=(stop>=Math.floor(maxLen*.62)?cut.slice(0,stop+1):cut).trim();
    }
    if(s && !/[。！？!?]$/.test(s)) s+='。';
    return s;
}

function structuredSummaryRecordsLocalV0119(m,userMsg=null,mem=M()) {
    if(m && !m.is_user){
        const out=[];
        for(const block of rawSummaryBlocksLocalV0119(m)){
            if(block.tag!=='abstract') continue;
            const serial=childTagTextLocalV0119(block.raw,'serial');
            const timeRaw=childTagTextLocalV0119(block.raw,'time');
            const scene=childTagTextLocalV0119(block.raw,'scene');
            const plot=childTagTextLocalV0119(block.raw,'plot');
            if(!plot) continue;
            const tm=parseAbstractTimeLocalV0119(timeRaw);
            out.push({
                tag:'abstract',
                record_no:serial.match(/(\d{1,6})/)?.[1]||null,
                date:tm.date,
                time:tm.time,
                location:scene||null,
                event:cleanupPresetPlotLocalV0119(plot,280),
                __direct_preset_plot_v0119:true
            });
        }
        if(out.length) return out;
    }
    // Fall back to legacy/colon-style structured summaries (e.g. older Riyuexi).
    return structuredSummaryRecordsLocalV0117(m,userMsg,mem);
}

// Some presets expose a visible “剧情摘要” panel without an <abstract>/<plot>
// wrapper. Accept only its bounded visible prose. A navigation tab whose only
// content is “即时状态 / 剧情摘要 / 世界动态” is deliberately ignored.
function labeledSummaryRecordsLocalV01133(m,userMsg=null,mem=M()) {
    if(!m||m.is_user) return [];
    const text=plainTextLocalV0114(cleanMesForSummaryV0110(m));
    if(!text) return [];
    const re=/(?:^|[\n。！？!?])\s*(?:剧情摘要|故事摘要|本轮摘要|情节摘要)\s*[:：]?\s*([\s\S]{12,900}?)(?=(?:\n|\s{2,})(?:即时状态|当前状态|场景档案|世界动态|人物状态|今日待办|弹幕|今日头条)\s*[:：]?|$)/gi;
    const out=[];
    let hit;
    while((hit=re.exec(text))){
        let event=String(hit[1]||'').trim();
        if(!event||/(?:输出格式|严格遵守|字段规范|以下示例|<status|status_rule|必须在正文末尾)/i.test(event)) continue;
        if(/^(?:即时状态|剧情摘要|世界动态|[\s·丨|])+$/i.test(event)) continue;
        event=cleanupPresetPlotLocalV0119(event,280);
        if(event.length<12) continue;
        const status=extractRoleplayStatusMetadataV01133(m);
        out.push({
            tag:'labeled_plot_summary',record_no:null,
            date:status?.date||normalizeSummaryDateLocalV0115(event),
            time:status?.time||null,
            location:status?.location||null,
            event,
            __direct_preset_plot_v0119:true,
            __labeled_summary_v01133:true
        });
    }
    return out;
}

function recapDateRangeV01135(text) {
    const src=String(text||'').replace(/：/g,':');
    const range=src.match(/(20\d{2})[年\-\/.](\d{1,2})[月\-\/.](\d{1,2})日?\s*(?:→|~|～|—|–|至|到)\s*(?:(20\d{2})[年\-\/.])?(?:(\d{1,2})[月\-\/.])?(\d{1,2})日?/);
    if(range){
        const sy=Number(range[1]),sm=Number(range[2]),sd=Number(range[3]);
        const ey=Number(range[4]||sy),em=Number(range[5]||sm),ed=Number(range[6]);
        const start=normalizeDateInput(`${sy}-${String(sm).padStart(2,'0')}-${String(sd).padStart(2,'0')}`)?.iso||null;
        const end=normalizeDateInput(`${ey}-${String(em).padStart(2,'0')}-${String(ed).padStart(2,'0')}`)?.iso||null;
        if(start||end) return {start,end:end||start};
    }
    const dates=[...src.matchAll(/(20\d{2})[年\-\/.](\d{1,2})[月\-\/.](\d{1,2})日?/g)]
        .map(x=>normalizeDateInput(`${x[1]}-${String(Number(x[2])).padStart(2,'0')}-${String(Number(x[3])).padStart(2,'0')}`)?.iso||null)
        .filter(Boolean);
    return dates.length?{start:dates[0],end:dates.at(-1)}:{start:null,end:null};
}

function recapClockRangeV01144(text) {
    const src=String(text||'').replace(/：/g,':');
    // Restrict extraction to the recap's labelled time/date row. This avoids
    // treating SillyTavern's message timestamp or numbers in the prose as plot time.
    const labelled=src.match(/(?:时间|日期)\s*[:：]?\s*(?:20\d{2}[年\-\/.]\d{1,2}[月\-\/.]\d{1,2}日?)?([\s\S]{0,150}?)(?=(?:人物|角色|地点|摘要正文|剧情)\s*[:：]?|\n\s*\n|$)/i)?.[1]||'';
    const clocks=[...labelled.matchAll(/(?:^|[^\d])((?:[01]?\d|2[0-3]):[0-5]\d)(?!\d)/g)].map(x=>x[1]);
    if(clocks.length>=2) return `${clocks[0]}-${clocks[1]}`;
    if(clocks.length===1) return clocks[0];
    return null;
}

function cardFooterStoryClockV01144(text) {
    const src=String(text||'').replace(/：/g,':');
    // Opening cards commonly render: 2026-09-20 · 周日 · 07:51↔23:14.
    // Requiring a weekday plus a clock range excludes the ordinary ST header
    // such as “2026年9月22日 14:36”.
    const hit=src.match(/(20\d{2})[年\-\/.](\d{1,2})[月\-\/.](\d{1,2})日?[\s·丨|]*((?:星期|周)\s*[一二三四五六日天])[\s·丨|]*([01]?\d|2[0-3]):([0-5]\d)\s*(?:↔|→|~|～|—|–|至|到)\s*([01]?\d|2[0-3]):([0-5]\d)/i);
    if(!hit) return null;
    const date=normalizeDateInput(`${hit[1]}-${String(Number(hit[2])).padStart(2,'0')}-${String(Number(hit[3])).padStart(2,'0')}`)?.iso||null;
    return {
        date,
        time:`${String(Number(hit[5])).padStart(2,'0')}:${hit[6]}-${String(Number(hit[7])).padStart(2,'0')}:${hit[8]}`,
        weekday:String(hit[4]||'').replace(/\s+/g,'')
    };
}

function cleanRoleCardRecapBlockV01135(raw) {
    let text=String(raw||'')
        .replace(/<!--([\s\S]*?)-->/g,'')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
    text=stripAuxiliaryBlocksV0110(text);
    return plainTextLocalV0114(text)
        .replace(/[ \t]+/g,' ')
        .replace(/\n{3,}/g,'\n\n')
        .trim();
}

// v0.11.35: some cards/presets render an already-written recap panel rather
// than <abstract><plot>. Typical visible form:
// 摘要：标题 / 时间 2026-08-03→08-27 / 人物 ... / recap prose.
// It is canonical assistant output and should outrank sentence extraction.
function roleCardRecapRecordsV01135(m,userMsg=null,mem=M()) {
    if(!m||m.is_user) return [];
    const raw=cleanMes(m);
    if(!raw||/<!doctype\s+html/i.test(raw)&&!/摘要\s*[:：]/.test(raw)) return [];
    const candidates=[];
    const add=(value,kind)=>{
        const v=String(value||'').trim();
        if(v&&/摘要\s*[:：]/.test(v)) candidates.push({raw:v,kind});
    };
    const detailRe=/<details\b[^>]*>[\s\S]*?<\/details>/gi;
    let hit;
    while((hit=detailRe.exec(raw))) add(hit[0],'details');
    for(const tag of ['recap','story_recap','chapter_summary','summary_card','剧情摘要','故事摘要','本轮摘要','情节摘要']){
        const re=new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,'gi');
        while((hit=re.exec(raw))) add(hit[1],tag);
    }
    // Prefer the bounded recap widget.  Scanning the whole reply is only a
    // compatibility fallback for cards whose regex renderer does not leave a
    // dedicated wrapper in the stored message; otherwise unrelated widgets
    // after the recap could be appended to the canonical event.
    if(!candidates.length) add(raw,'visible');

    const status=extractRoleplayStatusMetadataV01133(m);
    const openingClock=cardFooterStoryClockV01144(cleanRoleCardRecapBlockV01135(raw));
    const out=[];
    const seen=new Set();
    for(const candidate of candidates){
        const text=cleanRoleCardRecapBlockV01135(candidate.raw);
        if(!text) continue;
        const header=text.match(/(?:^|\n|[＊*✦❖◈◇]\s*)摘要\s*[:：]\s*(.{1,90}?)(?=\s+(?:时间|日期|人物|角色)\s*[:：]?|\n|$)/i);
        if(!header) continue;
        const fromHeader=text.slice(Math.max(0,header.index||0)).trim();
        const metaWindow=fromHeader.slice(0,700);
        if(!/(?:时间|日期)\s*[:：]?\s*20\d{2}/.test(metaWindow) && !/(?:人物|角色)\s*[:：]?/.test(metaWindow)) continue;
        if(/(?:输出格式|字段规范|以下示例|请生成|必须输出|写作要求|提示词)/i.test(fromHeader.slice(0,260))) continue;

        const title=String(header[1]||'').replace(/[＊*✦❖◈◇]/g,'').trim().slice(0,90);
        const lines=fromHeader.split(/\n+/).map(x=>x.trim()).filter(Boolean);
        const bodyLines=[];
        let headerPassed=false;
        for(const line of lines){
            if(!headerPassed&&/摘要\s*[:：]/.test(line)){headerPassed=true;continue;}
            if(!headerPassed) continue;
            if(/^(?:时间|日期|人物|角色|地点)\s*[:：]?/.test(line)) continue;
            bodyLines.push(line);
        }
        let body=bodyLines.join(' ').replace(/\s+/g,' ').trim();
        if(body.length<35){
            body=fromHeader
                .replace(/^[\s＊*✦❖◈◇]*摘要\s*[:：]\s*.{1,90}?(?=\s+(?:时间|日期|人物|角色)\s*[:：]?|\n|$)/i,'')
                .replace(/(?:时间|日期)\s*[:：]?\s*20\d{2}[\s\S]{0,180}?(?=(?:人物|角色)\s*[:：]?)/i,'')
                .replace(/(?:人物|角色)\s*[:：]?\s*[^。！？!?]{0,220}(?=[。！？!?]|$)/i,'')
                .replace(/\s+/g,' ').trim();
        }
        if(body.length<35) continue;
        if(body.length>760){
            const cut=body.slice(0,760);
            const stop=Math.max(cut.lastIndexOf('。'),cut.lastIndexOf('；'));
            body=(stop>=470?cut.slice(0,stop+1):cut).trim();
        }
        const event=cleanupPresetPlotLocalV0119(`${title?title+'：':''}${body}`,800);
        if(!event||event.length<40) continue;
        const range=recapDateRangeV01135(fromHeader);
        const recapTime=recapClockRangeV01144(metaWindow);
        const key=timelineTextKeyV01114(event);
        if(!key||seen.has(key)) continue;
        seen.add(key);
        out.push({
            tag:'role_card_recap',record_no:null,
            date:range.end||openingClock?.date||status?.date||null,
            time:recapTime||openingClock?.time||status?.time||null,
            location:status?.location||null,
            event,
            recap_start_date:range.start||null,
            recap_end_date:range.end||null,
            __direct_preset_plot_v0119:true,
            __role_card_recap_v01135:true,
            __recap_kind_v01135:candidate.kind
        });
    }
    return out;
}

// v0.11.34: an unconfirmed USER message is a proposed action/dialogue, not a
// canonical outcome.  Earlier local fallback joined USER + ASSISTANT text and
// could therefore fill the timeline with the player's own input whenever the
// reply was hard to parse.  Local extraction must now come from the role reply
// only.  USER text is accepted only as non-persisted context for detecting a
// verbatim echo.
function assistantNarrativeEventLocalV01134(assistantMsg,userMsg=null,userName='',maxLen=230) {
    const assistantRaw=String(assistantMsg?.mes||'');
    if(assistantRaw&&/<!doctype\s+html/i.test(assistantRaw)&&!/<content\b/i.test(assistantRaw)) return '';

    const body=cleanMesForSummaryV0110(assistantMsg);
    const candidates=sentenceCandidatesLocalV0114(body)
        .map((s,i)=>({s:String(s||'').trim(),i}))
        .filter(x=>x.s)
        .filter(x=>!/(?:输出格式|字段规范|严格遵守|点击进入|CLICK TO ENTER|世界书绑定|角色设定|系统提示|status_rule|即时状态|今日待办|观众弹幕|今日头条)/i.test(x.s))
        .filter(x=>!/(?:function\s*\(|const\s+\w+\s*=|document\.|className=|<\/html>)/i.test(x.s));
    if(!candidates.length) return '';

    const assistantName=String(assistantMsg?.name||'').trim();
    const knownNames=[...new Set([assistantName,...Object.keys(M()?.characters||{})]
        .map(x=>String(x||'').trim()).filter(x=>x.length>=2))];
    const escRe=x=>String(x).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const nameRe=knownNames.length?new RegExp(knownNames.map(escRe).join('|')):null;
    const strong=/来到|到达|离开|进入|返回|前往|醒来|睡去|发现|遇到|收到|告诉|询问|回答|答应|拒绝|决定|确认|约定|联系|检查|治疗|受伤|袭击|威胁|救下|保护|表白|邀请|警告|提出|要求|同意|上课|训练|赶到|逃离|推开|打开|关闭|发动|带走|带回|拥抱|抱住|亲吻|吻|承诺|坦白|结婚|分手|死亡|失踪|回家|出发|抵达|搬到|留下|得知|通知|安排|交给|取出|放下|接过|递给|签下|完成|通过|失败/;
    const atmosphere=/^(?:那|这)?(?:声音|风|雨|雪|阳光|月光|灯光|空气|夜色|天色|走廊|房间|窗外|沉默|气氛)[^。！？!?]{0,90}(?:落|照|吹|撞|沉|静|暗|亮|停|散|弥漫)/;
    const userText=userMsg?plainTextLocalV0114(cleanMesForSummaryV0110(userMsg)):'';

    const ranked=candidates.map(x=>{
        let score=scoreSentenceLocalV0114(x.s,x.i,candidates.length);
        if(nameRe?.test(x.s)) score+=4;
        if(strong.test(x.s)) score+=5;
        if(/因此|于是|随后|最终|已经|结果|这才|从此|确认|决定/.test(x.s)) score+=1.5;
        if(atmosphere.test(x.s)) score-=6;
        if(/^(?:他|她|他们|她们|那人|男人|女人)?\s*(?:看着|望着|笑了|沉默|没说话|顿了顿)[^。！？!?]{0,45}[。！？!?]?$/.test(x.s)) score-=4;
        // Some frontends quote the entire USER message inside the assistant
        // payload. A byte-for-byte echo still is not an assistant-confirmed fact.
        const key=timelineTextKeyV01114(x.s);
        const userKey=timelineTextKeyV01114(userText);
        if(key&&userKey&&key.length>=12&&(userKey.includes(key)||timelineDiceV01114(key,userKey)>=0.9)) score-=8;
        return {...x,score,strong:strong.test(x.s)};
    }).sort((a,b)=>b.score-a.score||a.i-b.i);

    const best=ranked[0];
    if(!best || best.score<4.5 || (!best.strong&&!nameRe?.test(best.s)&&best.s.length<45)) return '';
    const selected=[best];
    const second=ranked.find(x=>x!==best&&x.score>=Math.max(5,best.score-2.5)&&Math.abs(x.i-best.i)<=2);
    if(second) selected.push(second);
    selected.sort((a,b)=>a.i-b.i);
    let event=selected.map(x=>x.s).join(' ');

    event=cleanupEventLocalV0117(event,userName);
    if(event.length>maxLen){
        const cut=event.slice(0,maxLen);
        const stop=Math.max(cut.lastIndexOf('。'),cut.lastIndexOf('；'));
        event=(stop>=Math.floor(maxLen*.56)?cut.slice(0,stop+1):cut).trim();
    }
    if(event&&!/[。！？!?]$/.test(event)) event+='。';
    if(!event||event.length<7) return '';
    if(/(?:输出格式|字段规范|严格遵守|点击进入|CLICK TO ENTER|世界书绑定|角色设定|系统提示|status_rule)/i.test(event)) return '';
    if(/(?:function\s*\(|const\s+\w+\s*=|document\.|className=|<\/html>)/i.test(event)) return '';
    if(/乳头|乳尖|阴道|小穴|肉棒|龟头|精液|潮吹|自慰|抽插|后庭|子宫|阴蒂|穴口|爱液|淫水|高潮|体液/i.test(event)) return '';
    const meaningful=/来到|到达|离开|进入|返回|前往|醒来|睡去|发现|遇到|收到|告诉|询问|回答|答应|拒绝|决定|确认|约定|联系|检查|治疗|受伤|袭击|威胁|救下|保护|表白|邀请|警告|提出|要求|同意|上课|训练|赶到|逃离|推开|打开|关闭|发动|带走|带回|拥抱|抱住|亲吻|吻|承诺|坦白|结婚|分手|死亡|失踪|回家|出发/;
    if(!meaningful.test(event)&&event.length<40) return '';
    return event;
}

// Compatibility name retained for older tests/callers. The implementation is
// intentionally assistant-only as of v0.11.34.
function extractiveFallbackEventLocalV01133(userMsg,assistantMsg,userName='') {
    return assistantNarrativeEventLocalV01134(assistantMsg,userMsg,userName,230);
}

function ignorableLocalPairV01133(userMsg,assistantMsg) {
    const raw=String(assistantMsg?.mes||'');
    if(raw&&/<!doctype\s+html/i.test(raw)&&!/<content\b/i.test(raw)) return true;
    const u=userMsg?userActionLocalV0114(userMsg,120):'';
    const a=assistantMsg?plainTextLocalV0114(cleanMesForSummaryV0110(assistantMsg)):'';
    return !u&&!a;
}

function ensureWeekdayTimelineTimeLocalV0119(time,date) {
    let t=String(time||'').trim();
    const iso=normalizeDateInput(date)?.iso||null;
    if(!t || !iso) return t||null;
    // A bracketed secondary clock owns its own weekday/calendar. Never rewrite
    // it to match the outer reality-axis date.
    if(/^\[(?:场景第二时间轴|副本|场景时间)/.test(t)) return t;
    const label=weekdayLabelISO_V0117(iso);
    if(!label) return t;
    if(/星期\s*[一二三四五六日天]/.test(t)) return t.replace(/星期\s*[一二三四五六日天]/,label);
    if(/周\s*[一二三四五六日天]/.test(t)) return t.replace(/周\s*[一二三四五六日天]/,label);
    if(/(?:[01]?\d|2[0-3]):[0-5]\d|凌晨|清晨|早晨|早上|上午|中午|下午|傍晚|晚上|晚间|夜间|深夜/.test(t)) return `${label} ${t}`;
    return t;
}

function fallbackEventLocalV0119(userMsg,assistantMsg,userName='') {
    const strong=/来到|到达|离开|进入|返回|前往|醒来|睡去|发现|遇到|收到|告诉|询问|回答|答应|拒绝|决定|确认|约定|带离|带回|送往|联系|检查|治疗|受伤|袭击|威胁|救下|救出|阻止|保护|召集|表白|邀请|警告|提出|要求|同意|上课|参加训练|进行训练|训练结束|赶到|逃离/;
    const micro=/乳头|乳尖|乳房|阴道|小穴|肉棒|龟头|精液|潮吹|自慰|抽插|后庭|子宫|阴蒂|穴口|爱液|淫水|高潮|体液|红肿|C罩杯/i;
    // Canonical fallback is assistant-only. A USER turn may state an intention,
    // a correction or an attempted action whose outcome the reply rejects.
    const candidates=[];
    if(assistantMsg) candidates.push(responseActionLocalV0114(assistantMsg,300));
    for(const raw of candidates){
        const c=compressEventLocalV0116(raw,userName,190);
        if(c && c.length>=28 && strong.test(c) && !micro.test(c) && !/^[）)】〉》\]，。；:：]/.test(c) && !/没什么区别|像平时.*一样/.test(c)) return cleanupEventLocalV0117(c,userName);
    }
    return '';
}

function timelineDaypartLocalV01118(mins){
    if(mins==null) return null;
    const h=Math.floor(mins/60);
    if(h<5) return '凌晨';
    if(h<9) return '早晨';
    if(h<12) return '上午';
    if(h<14) return '中午';
    if(h<18) return '下午';
    if(h<22) return '晚间';
    return '深夜';
}
function displayTimelineTimeLocalV0119(e) {
    // Defensive rendering: even before an upgraded memory has been persisted,
    // never show an unsupported recap minute as if it were canonical.
    const safe=safeTimelineTimeInfoV01131(e);
    const raw=ensureWeekdayTimelineTimeLocalV0119(safe.time,e?.date)||String(safe.time||'');
    if(!raw) return '';
    // v0.11.18: variable-state minute precision is useful for ordering, but noisy in
    // long-term memory UI. Keep exact source/preset times; show only a natural daypart
    // when the clock came solely from UpdateVariable/world-state metadata.
    const label=String(e?.time_evidence_label||'');
    const level=String(e?.time_evidence||'');
    const structuredOnly=level==='structured' && /变量状态/.test(label) && !/原文|预设/.test(label);
    if(!structuredOnly) return raw;
    const mins=timelineClockMinutesV01114(raw);
    const part=timelineDaypartLocalV01118(mins);
    if(!part) return raw;
    const iso=normalizeDateInput(e?.date)?.iso||null;
    const wd=iso?weekdayLabelISO_V0117(iso):'';
    return `${wd?wd+' ':''}${part}`.trim();
}

function sourceTemporalMetaLocalV0117(indexes,mem=M()){
    const chat=C().chat||[];
    const sorted=[...new Set(indexes||[])].sort((a,b)=>b-a);
    const out={
        date:null,time:null,location:null,kind:null,reason:null,
        reality_axis:false,date_reality:false,time_reality:false,
        reality_date:null,reality_time:null,reality_index:null
    };
    const wm=exactWorldStateMetaSameSourceV0117(sorted);
    if(wm.date_reality&&wm.date) out.reality_date=wm.date;
    if(wm.time_reality&&wm.time) out.reality_time=wm.time;
    if(out.reality_date||out.reality_time) out.reality_index=wm.index;
    out.reality_axis=!!wm.reality_axis;

    // v0.11.30: the preset's same-source story summary describes the active
    // scene clock.  Prefer it for timeline.date/time; keep /world/reality-time
    // separately instead of letting it overwrite a dated scenario.
    for(const i of sorted){
        const m=chat[i];
        if(!m||m.is_user) continue;
        const prev=(i>0&&chat[i-1]?.is_user)?chat[i-1]:null;
        const recs=narrativeSummaryRecordsV01130(m,prev,mem);
        if(!recs.length) continue;
        const rec=recs[recs.length-1];
        if(!out.date&&rec.date){
            out.date=rec.date;
            out.kind='preset_summary';
            out.reason=`同 source #${i} 的 <${rec.tag}> 场景日期`;
        }
        if(!out.time&&rec.time){ out.time=rec.time; out.kind='preset_summary'; out.reason=`同 source #${i} 的 <${rec.tag}> 时间`; }
        if(!out.location&&rec.location) out.location=rec.location;
        if(out.date&&out.time&&out.location) break;
    }

    const status=latestRoleplayStatusSameSourceV01133(sorted);
    if(status){
        if(!out.date&&status.date){ out.date=status.date; out.kind='roleplay_status'; out.reason=`同 source #${status.index} 的 <status> 时间字段`; }
        if(!out.time&&status.time){ out.time=status.time; out.kind='roleplay_status'; out.reason=`同 source #${status.index} 的 <status> 时间字段`; }
        if(!out.location&&status.location) out.location=status.location;
    }

    if(!out.date&&wm.date){ out.date=wm.date; out.date_reality=!!wm.date_reality; }
    if(!out.time&&wm.time){
        out.time=wm.time;
        out.time_reality=!!wm.time_reality;
        out.kind=wm.time_reality||wm.date_reality?'world_reality_meta':'world_meta';
        out.reason=`同 source #${wm.index} 的 ${wm.time_path||wm.date_path||'/世界/当前时间'}`;
    }
    if(!out.location&&wm.location) out.location=wm.location;
    if(!out.time){
        const t=localTimeSameMessagesV0114(sorted);
        if(t){ out.time=t; out.kind='raw_source'; out.reason='同 source 原文中的时间'; }
    }
    if(!out.date){
        const d=explicitDateSameMessagesV0114(sorted)||directCanonicalDateCueV0114(sorted);
        if(d) out.date=d;
    }
    if(!out.location){
        const l=localLocationSameMessagesV0114(sorted);
        if(l) out.location=l;
    }
    return out;
}

function multiDayAdvanceCueLocalV01110(text){
    const s=String(text||'');
    const cue=/(?:两|二|三|四|五|六|七|八|九|十|\d+)\s*(?:天|日)(?:后|以后|之后)|几天后|数日后|一周后|下周|隔了几天|过了几天/g;
    let m;
    while((m=cue.exec(s))){
        const before=s.slice(Math.max(0,m.index-12),m.index);
        if(/(?:没有|并未|未曾|并没有|不是|不曾|没有经过|并非)[^，。；]{0,8}$/.test(before)) continue;
        return true;
    }
    return false;
}

function sameSourceAbsoluteDateCueLocalV01110(text,date){
    const iso=normalizeDateInput(date)?.iso||null;
    if(!iso) return false;
    const [y,m,d]=iso.split('-').map(Number);
    const s=String(text||'');
    const pats=[
        new RegExp(`${y}[年\\-/.]0?${m}[月\\-/.]0?${d}(?:日|号)?`),
        new RegExp(`0?${m}月0?${d}(?:日|号)`)
    ];
    return pats.some(r=>r.test(s));
}

function reconcileTemporalLocalV0117({currentDate=null,previousTime=null,candidateDate=null,candidateTime=null,combined='',authority='raw'}){
    let cur=normalizeDateInput(currentDate)?.iso||null;
    const cand=normalizeDateInput(candidateDate)?.iso||null;
    let date=cur;
    let time=String(candidateTime||'').trim()||null;
    const notes=[];
    const auth=String(authority||'raw');

    if(cand){
        if(!cur) date=cand;
        else{
            const diff=dateDiffDaysLocalV0114(cur,cand);
            if(diff!=null && diff<0){
                if(auth==='structured_summary'||auth==='roleplay_status'){
                    date=cand;
                    notes.push(`按同 source 权威时间进入新场景日历 ${cand}`);
                }else{
                    date=cur; notes.push(`拒绝无场景标记的倒退日期 ${cand}`);
                }
            }else if(diff===0){
                date=cur;
            }else if(auth==='world_reality_meta' && diff!=null && diff>0){
                date=cand; notes.push(`现实主时间轴推进 ${diff} 天至 ${cand}`);
            }else if(diff===1){
                // +1 is accepted for structured summary / explicit source date / next-day semantics.
                if(auth==='structured_summary' || auth==='roleplay_status' || sameSourceAbsoluteDateCueLocalV01110(combined,cand) || hasNextDayCueTextV0114(combined)){
                    date=cand; notes.push(`采用可靠次日日期 ${cand}`);
                }else if(auth==='world_meta'){
                    // World-state metadata is useful, but old presets sometimes carry stale dates.
                    // A one-day move is still allowed when clock progression strongly indicates midnight rollover.
                    const p0=parseStoryClock(previousTime), n0=parseStoryClock(time);
                    if(p0!=null&&n0!=null&&p0>=18*60&&n0<=8*60){ date=cand; notes.push(`世界状态与深夜→凌晨一致，推进至 ${cand}`); }
                    else { date=cur; notes.push(`世界状态日期缺少跨日证据，暂不推进至 ${cand}`); }
                }else date=cand;
            }else if(diff!=null && diff>1){
                // Prevent stale world-state dates (e.g. 周五/09-26) from jumping several days.
                if(auth==='structured_summary' || auth==='roleplay_status' || sameSourceAbsoluteDateCueLocalV01110(combined,cand) || multiDayAdvanceCueLocalV01110(combined)){
                    date=cand; notes.push(`采用同 source 明确多日推进 ${cand}`);
                }else{
                    date=cur; notes.push(`拒绝无剧情证据的跨多日跳转 ${cand}`);
                }
            }
        }
    }else if(cur && hasNextDayCueTextV0114(combined)){
        date=addDaysISO(cur,1); notes.push('相对时间词推进 +1 天');
    }

    let p=parseStoryClock(previousTime), n=parseStoryClock(time);
    // Midnight rollover: even stale same-day world metadata must not pin 03:xx to the previous day.
    if(date&&cur&&date===cur&&p!=null&&n!=null&&p>=18*60&&n<=8*60&&auth!=='world_reality_meta'){
        const rawExplicitSameDay = cand && (auth==='structured_summary'||auth==='roleplay_status');
        if(!rawExplicitSameDay){
            date=addDaysISO(cur,1); notes.push('晚间/深夜→凌晨，按 source 顺序跨日 +1');
        }
    }

    // Weekday is never an authority. It is display-only and must follow the absolute date.
    const wd=weekdayIndexTextV0117(time);
    if(date&&wd!=null){
        const actual=weekdayIndexISO_V0117(date);
        if(actual!=null&&wd!==actual) notes.push(`星期与绝对日期冲突，按 ${date} 的真实日历修正星期`);
    }

    // Block same-day backwards clocks unless this is a genuine midnight rollover handled above.
    p=parseStoryClock(previousTime); n=parseStoryClock(time);
    if(date&&cur&&date===cur&&p!=null&&n!=null&&n<p&&!(p>=18*60&&n<=8*60)&&!hasNextDayCueTextV0114(combined)){
        if(auth==='raw' || auth==='world_meta'){
            time=previousTime||time;
            notes.push('拒绝同日倒退钟点');
        }
    }

    if(date&&time) time=normalizeWeekdayInTimeV0117(time,date);
    return {date:date||cand||cur||null,time,corrected:notes.length>0,reason:notes.join('；')};
}

function keyDialogueFactLocalV0117(text,userName=''){
    const src=plainTextLocalV0114(text);
    const u=String(userName||'').trim()||'USER';
    if(!src) return '';
    const micro=/乳头|阴道|小穴|肉棒|龟头|精液|潮吹|自慰|抽插|后庭|子宫|阴蒂|插入|高潮|淫水/i;
    const matches=[...src.matchAll(/[“「『"]([^”」』"\n]{2,90})[”」』"]/g)];
    for(const m of matches){
        const q=String(m[1]||'').trim();
        if(!q||micro.test(q)) continue;
        if(!/[？?吗呢]|为什么|怎么|是否|要不要|能不能|可不可以|我想|我要|我不|不要|答应|拒绝|愿意|决定|去|来|走|留下|喜欢|爱|需要/.test(q)) continue;
        const before=src.slice(Math.max(0,m.index-32),m.index);
        let target='';
        for(const name of knownStoryNamesLocalV0115(null,null,M())){
            if(name!==u&&before.includes(name)){ target=name; break; }
        }
        const verb=/[？?吗呢]|为什么|怎么|是否|要不要|能不能|可不可以/.test(q)?'询问':'表示';
        return `${u}${verb}${target||''}：“${q.slice(0,68)}${q.length>68?'…':''}”`;
    }
    return '';
}

function cleanupEventLocalV0117(text,userName=''){
    let s=String(text||'')
        .replace(/\bserial\s*:[^\s；;]+/gi,' ')
        .replace(/\btime\s*:\s*20\d{2}[^；;]{0,45}/gi,' ')
        .replace(/\bNSFW\s*:\s*[^；;\s]+/gi,' ')
        .replace(/\bscene\s*:\s*[^；;]{0,120}(?=\bplot\s*:|$)/gi,' ')
        .replace(/\bplot\s*:\s*/gi,' ')
        .replace(/\s+/g,' ')
        .trim();
    const u=String(userName||'').trim();
    if(u){
        const esc=u.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        s=s.replace(new RegExp(`(?:${esc})(?:\\s*[：:]?\\s*${esc})+`,'g'),u);
        s=s.replace(new RegExp(`^${esc}\\s*[：:]\\s*${esc}\\s*`),u+' ');
    }
    s=s.replace(/；\s*[，。；]+/g,'；').replace(/[，；]\s*。/g,'。').replace(/；{2,}/g,'；');
    const parts=s.split('；').map(x=>x.trim()).filter(x=>x.length>=7);
    s=(parts.length?parts.join('；'):s).trim();
    return s;
}

function compressEventLocalV0117(text,userName='',maxLen=170){
    const original=String(text||'');
    let out=compressEventLocalV0116(cleanupEventLocalV0117(original,userName),userName,maxLen);
    out=cleanupEventLocalV0117(out,userName);
    const strong=/来到|到达|离开|进入|返回|前往|醒来|睡去|发现|遇到|收到|告诉|询问|回答|答应|拒绝|决定|确认|约定|开始|结束|带离|带回|送往|联系|检查|治疗|受伤|袭击|威胁|救下|救出|阻止|保护|召集|表白|邀请|警告|提出|要求|同意|发生/;
    const weak=/^(?:[\u4e00-\u9fa5A-Za-z·]{2,10}\s*)?(?:歪着头|咬了咬嘴唇|看着|望着|哭着|摇着头|脸通红|伸手推不动|缩了缩身子)[，。；\s]*$/;
    if((!out||out.length<28||(!strong.test(out)&&weak.test(out)))&&userName){
        const q=keyDialogueFactLocalV0117(original,userName);
        if(q) out=q+'。';
    }
    out=cleanupEventLocalV0117(out,userName);
    if(out.length>maxLen){
        let cut=out.slice(0,maxLen);
        const stop=Math.max(cut.lastIndexOf('。'),cut.lastIndexOf('；'));
        out=(stop>=Math.floor(maxLen*.55)?cut.slice(0,stop+1):cut).trim();
    }
    if(out&&!/[。！？!?]$/.test(out)) out+='。';
    return out;
}


// =========================================================
// v0.11.15: hybrid 0-API triage.
// Reliable preset summaries are accepted directly; conservative factual fallback
// is accepted only when it passes the existing strong-action filter. Everything
// else is covered but queued for optional AI instead of creating fake timeline text.
// =========================================================
function compactRangesLocalV01111(indexes){
    const xs=[...new Set((indexes||[]).filter(Number.isInteger))].sort((a,b)=>a-b);
    const out=[]; if(!xs.length) return out;
    let a=xs[0],b=xs[0];
    for(const x of xs.slice(1)){ if(x===b+1){b=x;continue;} out.push([a,b]); a=b=x; }
    out.push([a,b]); return out;
}
function localTriageStatsV01111(nodes,start,endInclusive){
    const t=nodes?.__smm_triage_v01111||{};
    const reliable=[...new Set(t.reliable||[])];
    const needsAI=[...new Set(t.needsAI||[])];
    const ignored=[...new Set(t.ignored||[])];
    return {
        checked:endInclusive-start+1,
        reliable:reliable.length,
        needs_ai:needsAI.length,
        ignored:ignored.length,
        needs_ai_ranges:compactRangesLocalV01111(needsAI),
        preset_plot_nodes:Number(t.presetPlotNodes||0),
        factual_fallback_nodes:Number(t.factualFallbackNodes||0),
        extractive_nodes:Number(t.extractiveNodes||0),
        status_nodes:Number(t.statusNodes||0),
        role_card_recap_nodes:Number(t.roleCardRecapNodes||0)
    };
}

function makeLocalTimelineNodesV0117(start,endInclusive,mem=M()){
    const chat=C().chat||[];
    const nodes=[];
    const triage={reliable:[],needsAI:[],ignored:[],presetPlotNodes:0,factualFallbackNodes:0,extractiveNodes:0,statusNodes:0,roleCardRecapNodes:0};
    let currentDate=priorReliableDateV0114(mem,start);
    let previousTime=null;
    let i=start;

    while(i<=endInclusive){
        let a=i,b=i,userMsg=null,assistantMsg=null;
        const first=chat[i];
        if(first?.is_user&&i+1<=endInclusive&&chat[i+1]&&!chat[i+1].is_user){ userMsg=first; assistantMsg=chat[i+1]; b=i+1; }
        else if(!first?.is_user){ assistantMsg=first; if(i>start&&chat[i-1]?.is_user&&i-1>=start){ a=i-1; userMsg=chat[i-1]; } }
        else userMsg=first;

        const indexes=[]; for(let k=a;k<=b;k++) indexes.push(k);
        const source=canonicalSourceV0113(indexes)||`#${i}`;
        const combined=indexes.map(k=>cleanMesForSummaryV0110(chat[k])).join('\n');
        const status=latestRoleplayStatusSameSourceV01133(indexes);
        const world=exactWorldStateMetaSameSourceV0117(indexes);
        const rawTime=localTimeSameMessagesV0114(indexes);
        const rawDate=explicitDateSameMessagesV0114(indexes);
        const rawLoc=localLocationSameMessagesV0114(indexes);
        const records=narrativeSummaryRecordsV01130(assistantMsg,userMsg,mem);
        const userName=String(userMsg?.name||'').trim();

        if(records.length){
            let acceptedRecord=false;
            for(const rec of records){
                // v0.11.30: <abstract>/<plot> time is the event's narrative
                // calendar.  /world/reality-time is retained as a parallel clock
                // and only becomes the visible event date when no scene date was
                // emitted by the preset.
                const candidateDate=rec.date||status?.date||world.date||rawDate||null;
                const candidateTimeRaw=rec.time||status?.time||world.time||rawTime||null;
                const candidateTime=safeTimelineTimeInfoV01131({
                    date:candidateDate,time:candidateTimeRaw,source,
                    reality_date:world.date_reality?world.date:null,
                    calendar_axis:(rec.date&&world.date_reality&&world.date&&rec.date!==world.date)?'scene':null
                }).time;
                const authority=rec.date?'structured_summary':(status?.date?'roleplay_status':(world.date?(world.date_reality?'world_reality_meta':'world_meta'):'raw'));
                const tr=reconcileTemporalLocalV0117({currentDate,previousTime,candidateDate,candidateTime,combined:`${combined}\n${rec.event||''}`,authority});
                if(tr.date) currentDate=tr.date;
                if(tr.time) previousTime=tr.time;
                const isCardRecap=!!rec.__role_card_recap_v01135;
                const eventText=isCardRecap
                    ? cleanupPresetPlotLocalV0119(rec.event,800)
                    : (rec.__direct_preset_plot_v0119 ? cleanupPresetPlotLocalV0119(rec.event,280) : compressEventLocalV0117(rec.event,userName,170));
                const node={
                    date:tr.date||null,time:ensureWeekdayTimelineTimeLocalV0119(tr.time,tr.date),event:eventText,source,
                    __local_kind_v0119:isCardRecap?'role_card_recap':(rec.__direct_preset_plot_v0119?'preset_plot':'structured'),
                    event_origin:isCardRecap?'assistant_recap':'assistant_preset'
                };
                if(rec.recap_start_date) node.recap_start_date=rec.recap_start_date;
                if(rec.recap_end_date) node.recap_end_date=rec.recap_end_date;
                const loc=rec.location||status?.location||world.location||rawLoc; if(loc) node.location=loc;
                if(world.date_reality&&world.date) node.reality_date=world.date;
                if(world.time_reality&&world.time) node.reality_time=world.time;
                if(node.reality_date&&node.reality_date!==node.date) node.calendar_axis='scene';
                if(tr.corrected){ node.time_evidence='structured'; node.time_evidence_label='连续性校准时间'; node.time_evidence_reason=tr.reason; }
                else if(rec.time){ node.time_evidence='structured'; node.time_evidence_label='预设摘要时间'; node.time_evidence_reason=`来自本批 source 的 <${rec.tag}> 结构化记录${rec.record_no?` #${rec.record_no}`:''}`; }
                else if(status?.time){ node.time_evidence='structured'; node.time_evidence_label='角色卡状态栏时间'; node.time_evidence_reason=`同 source #${status.index} 的 <status> 白名单时间字段`; }
                else if(world.time){ node.time_evidence='structured'; node.time_evidence_label=world.time_reality?'MVU现实时间':'变量状态时间'; node.time_evidence_reason=`同 source #${world.index} 的 ${world.time_path||'/世界/当前时间'}`; }
                else { const te=classifySourceTimeEvidence(node); node.time_evidence=te.level; node.time_evidence_label=te.label; node.time_evidence_reason=te.reason; }
                applyTimelineTimePrecisionV01131(node);
                if(node.event){
                    nodes.push(node);
                    acceptedRecord=true;
                    if(rec.__direct_preset_plot_v0119) triage.presetPlotNodes++;
                    if(isCardRecap) triage.roleCardRecapNodes++;
                    if(status) triage.statusNodes++;
                }
            }
            if(acceptedRecord){
                for(const q of indexes) triage.reliable.push(q);
            }else{
                for(const q of indexes) triage.needsAI.push(q);
            }
        }else{
            const candidateDate=status?.date||world.date||rawDate||null;
            const candidateTimeRaw=status?.time||world.time||rawTime||null;
            const candidateTime=safeTimelineTimeInfoV01131({
                date:candidateDate,time:candidateTimeRaw,source,
                reality_date:world.date_reality?world.date:null
            }).time;
            const authority=status?.date?'roleplay_status':(world.date?(world.date_reality?'world_reality_meta':'world_meta'):'raw');
            const tr=reconcileTemporalLocalV0117({currentDate,previousTime,candidateDate,candidateTime,combined,authority});
            if(tr.date) currentDate=tr.date;
            if(tr.time) previousTime=tr.time;
            const strongEvent=fallbackEventLocalV0119(userMsg,assistantMsg,userName);
            const event=strongEvent||extractiveFallbackEventLocalV01133(userMsg,assistantMsg,userName);
            if(event){
                const node={date:tr.date||null,time:ensureWeekdayTimelineTimeLocalV0119(tr.time,tr.date),event,source,__local_kind_v0115:'fallback',__local_kind_v0119:strongEvent?'factual':'extractive',event_origin:'assistant_reply'};
                const loc=status?.location||world.location||rawLoc; if(loc) node.location=loc;
                if(world.date_reality&&world.date) node.reality_date=world.date;
                if(world.time_reality&&world.time) node.reality_time=world.time;
                if(tr.corrected){ node.time_evidence='structured'; node.time_evidence_label='连续性校准时间'; node.time_evidence_reason=tr.reason; }
                else if(status?.time){ node.time_evidence='structured'; node.time_evidence_label='角色卡状态栏时间'; node.time_evidence_reason=`同 source #${status.index} 的 <status> 白名单时间字段`; }
                else if(world.time){ node.time_evidence='structured'; node.time_evidence_label=world.time_reality?'MVU现实时间':'变量状态时间'; node.time_evidence_reason=`同 source #${world.index} 的 ${world.time_path||'/世界/当前时间'}`; }
                else { const te=classifySourceTimeEvidence(node); node.time_evidence=te.level; node.time_evidence_label=te.label; node.time_evidence_reason=te.reason; }
                applyTimelineTimePrecisionV01131(node);
                nodes.push(node); triage.factualFallbackNodes++; if(!strongEvent) triage.extractiveNodes++; if(status) triage.statusNodes++; for(const q of indexes) triage.reliable.push(q);
            }else{
                // Do not create a visible blank/placeholder event. This pair is
                // intentionally deferred to the optional AI queue.
                for(const q of indexes) (ignorableLocalPairV01133(userMsg,assistantMsg)?triage.ignored:triage.needsAI).push(q);
            }
        }
        i=(b>=i?b+1:i+1);
    }
    const finalNodes=finalizeLocalNodesV0115(nodes).map(n=>{
        const idx=[...sourceIndexes(n?.source)].sort((a,b)=>a-b);
        let userName=''; for(const j of idx){ if(chat[j]?.is_user){ userName=String(chat[j]?.name||'').trim(); if(userName) break; } }
        const x={...n};
        x.event=x.__local_kind_v0119==='role_card_recap'
            ? cleanupPresetPlotLocalV0119(x.event,800)
            : (x.__local_kind_v0119==='preset_plot'
            ? cleanupPresetPlotLocalV0119(x.event,280)
            : (x.__local_kind_v0119==='extractive'
                ? cleanupEventLocalV0117(x.event,userName).slice(0,230)
                : compressEventLocalV0117(x.event,userName,170)));
        if(x.date&&x.time) x.time=ensureWeekdayTimelineTimeLocalV0119(x.time,x.date);
        return x;
    }).filter(x=>String(x?.event||'').trim());
    // Every source row in the requested range was inspected, but only reliable
    // rows become visible timeline events.
    Object.defineProperty(finalNodes,'__smm_triage_v01111',{value:triage,enumerable:false,configurable:true});
    return finalNodes;
}

function repairExistingTimelineTemporalV0117(mem,start=0,endInclusive=null){
    const rows=Array.isArray(mem?.timeline)?mem.timeline:[];
    const chat=C().chat||[];
    const maxEnd=Number.isInteger(endInclusive)?endInclusive:Math.max(0,chat.length-1);
    // Remove unsupported minute precision before any continuity calculation;
    // otherwise a recap guess such as 15:00 could create false clock rollback
    // or midnight-rollover decisions.
    const precision=repairTimelinePrecisionV01131(mem,maxEnd,{audit:false});
    const ordered=rows.map((e,pos)=>({e,pos,first:sourceFirst(e?.source)})).filter(x=>x.first>=0).sort((a,b)=>a.first-b.first||a.pos-b.pos);
    let currentDate=priorReliableDateV0114(mem,start);
    let previousTime=null;
    let timeFixed=0,dateFixed=0,locationFixed=0,weekdayFixed=0,regressionBlocked=0,scanned=0;

    for(const row of ordered){
        const e=row.e;
        const all=[...sourceIndexes(e?.source)].sort((a,b)=>a-b);
        const idx=all.filter(i=>i>=start&&i<=maxEnd);
        if(!idx.length){
            // v0.11.8: rows outside the requested repair window must not influence
            // the anchor. The anchor is the last reliable timeline date before start.
            continue;
        }
        scanned++;
        const meta=sourceTemporalMetaLocalV0117(idx,mem);
        const oldDate=normalizeDateInput(e?.date)?.iso||null;
        const oldTime=String(e?.time||'').trim()||null;
        const candidateDate=meta.date||oldDate||null;
        let candidateTime=oldTime;
        const needTime=isMissingStoryValueV0112(oldTime)||isUnresolvedStoryTimeV0112(oldTime);
        if((needTime||meta.kind==='roleplay_status')&&meta.time) candidateTime=meta.time;
        // If the existing weekday contradicts a stronger same-source date and the
        // world/preset metadata also has a time, prefer that structured time.
        if(meta.date&&oldTime&&weekdayIndexTextV0117(oldTime)!=null&&weekdayIndexTextV0117(oldTime)!==weekdayIndexISO_V0117(meta.date)&&meta.time){
            candidateTime=meta.time;
        }
        const authority=meta.date?(meta.date_reality?'world_reality_meta':(meta.kind==='preset_summary'?'structured_summary':(meta.kind==='roleplay_status'?'roleplay_status':'world_meta'))):'raw';
        const combined=idx.map(i=>cleanMesForSummaryV0110(chat[i])).join('\n');
        const tr=reconcileTemporalLocalV0117({currentDate,previousTime,candidateDate,candidateTime,combined,authority});

        if(tr.date&&oldDate!==tr.date){ e.date=tr.date; dateFixed++; }
        else if(!oldDate&&tr.date){ e.date=tr.date; dateFixed++; }
        if(tr.time&&oldTime!==tr.time){
            if(oldTime&&parseStoryClock(tr.time)===parseStoryClock(oldTime)&&weekdayIndexTextV0117(oldTime)!==weekdayIndexTextV0117(tr.time)) weekdayFixed++;
            if(tr.reason?.includes('拒绝同日倒退钟点')) regressionBlocked++;
            e.time=tr.time; timeFixed++;
        }
        // v0.11.8 hard post-condition: weekday display is derived only from e.date.
        // Never preserve stale source weekday tokens such as 周五 on 2025-09-22.
        if(e?.date&&e?.time){
            const forced=ensureWeekdayTimelineTimeLocalV0119(e.time,e.date);
            if(forced&&forced!==e.time){ e.time=forced; weekdayFixed++; timeFixed++; }
        }
        if((isMissingStoryValueV0112(e?.location))&&meta.location){ e.location=meta.location; locationFixed++; }
        if(tr.time){
            if(tr.corrected){ e.time_evidence='structured'; e.time_evidence_label='连续性校准时间'; e.time_evidence_reason=tr.reason; }
            else if(meta.kind==='world_meta'||meta.kind==='world_reality_meta'){ e.time_evidence='structured'; e.time_evidence_label=meta.kind==='world_reality_meta'?'MVU现实时间':'变量状态时间'; e.time_evidence_reason=meta.reason||'同 source 世界状态时间'; }
            else if(meta.kind==='preset_summary'){ e.time_evidence='structured'; e.time_evidence_label='预设摘要时间'; e.time_evidence_reason=meta.reason||'同 source 预设摘要时间'; }
            else if(meta.kind==='roleplay_status'){ e.time_evidence='structured'; e.time_evidence_label='角色卡状态栏时间'; e.time_evidence_reason=meta.reason||'同 source <status> 白名单时间字段'; }
        }
        if(tr.date) currentDate=tr.date;
        if(tr.time) previousTime=tr.time;
    }
    return {
        scanned,timeFixed,dateFixed,locationFixed,weekdayFixed,regressionBlocked,
        precision_changed:precision.changed,precision_downgraded:precision.downgraded,
        start,endInclusive:maxEnd
    };
}

function timelineEntryFullyInsideRangeV0115(e,start,endInclusive){
    const idx=sourceIndexes(e?.source);
    return idx.length>0 && idx.every(i=>i>=start && i<=endInclusive);
}

function priorCodeRepairAuditV0115(mem,start,endInclusive){
    return (mem?.audit||[]).some(a=>{
        if(!/^timeline_gap_code_backfill_v011(?:[4-9]|10|11)$/.test(String(a?.type||''))) return false;
        const r=Array.isArray(a?.range)?a.range:[];
        const x=Number(r[0]), y=Number(r[1]);
        return Number.isFinite(x)&&Number.isFinite(y)&&x<=endInclusive&&y>=start;
    });
}


function latestCodeRepairRangeV0115(mem=M()){
    const arr=Array.isArray(mem?.audit)?mem.audit:[];
    for(let i=arr.length-1;i>=0;i--){
        const a=arr[i];
        if(!/^timeline_gap_code_backfill_v011(?:[4-9]|10|11)$/.test(String(a?.type||''))) continue;
        const r=Array.isArray(a?.range)?a.range:[];
        const x=Number(r[0]), y=Number(r[1]);
        if(Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=x) return {start:x,end:y,type:a.type};
    }
    return null;
}

function coverageStatsLocalV0114(nodes,start,endInclusive) {
    const covered=new Set();
    for(const e of nodes||[]) for(const i of sourceIndexes(e?.source)) if(i>=start&&i<=endInclusive) covered.add(i);
    const missing=[];
    for(let i=start;i<=endInclusive;i++) if(!covered.has(i)) missing.push(i);
    return {covered:covered.size,total:endInclusive-start+1,missing};
}

async function repairTimelineGapLocalV0115() {
    if (BUSY || HISTORY_RUNNING || GAP_REPAIR_RUNNING_V0112) {
        return toast('当前已有总结/重建任务在运行。','warning');
    }
    const fromEl=document.getElementById('smm112_gap_from');
    const toEl=document.getElementById('smm112_gap_to');
    const start=Number(fromEl?.value), endInclusive=Number(toEl?.value);
    const chat=C().chat||[];
    if(!Number.isInteger(start)||!Number.isInteger(endInclusive)||start<0||endInclusive<start||endInclusive>=chat.length){
        return toast(`代码补档范围无效。请输入 0-${Math.max(0,chat.length-1)} 之间的 #楼层编号。`,'warning');
    }

    const original=M();
    const hasPrior=priorCodeRepairAuditV0115(original,start,endInclusive);
    const replaceMsg=hasPrior
        ? '\n检测到这个范围之前做过 0 API 代码补档：本次会先移除“完全位于该范围内”的旧代码补档 timeline，再按结构化规则重建。'
        : '\n本次会向该范围补入 timeline；不会修改原聊天。';
    if(!confirm(
        `将以 v0.11.15 本地代码处理 #${start}-#${endInclusive}（0 API）。\n`+
        '三级管线：可靠 <abstract><plot> 直接收录；无摘要但有明确强事实时保守提取；复杂/不确定内容不写假摘要，只加入“需要 AI”队列。\n'+
        '没有结构化摘要的楼层使用原正文事实性抽取；完成后还会修复当前游标之前已有 timeline 的“未明确时间”。'+replaceMsg+'\n\n'+
        '人物/关系/待办/当前游标不会被本地代码重写。继续吗？'
    )) return;

    const c=C();
    const snapshot=cloneJSONV0112(M());
    const backupKey=META_KEY+'_backup_code_gap_v0116_'+Date.now();
    c.chatMetadata[backupKey]=cloneJSONV0112(snapshot);
    GAP_REPAIR_RUNNING_V0112=true; BUSY=true;
    try{
        const status=document.getElementById('smm112_gap_status');
        if(status) status.textContent=`v0.11.15 本地代码正在处理 #${start}-#${endInclusive}（0 API）…`;
        const nodes=makeLocalTimelineNodesV0117(start,endInclusive,snapshot);
        const triage=localTriageStatsV01111(nodes,start,endInclusive);
        // v0.11.15 deliberately permits zero visible nodes when every row is
        // semantically ambiguous. The range is still covered and queued for AI.
        const coverage={covered:triage.checked,total:triage.checked,missing:[]};

        const target=M();
        const oldTimeline=Array.isArray(target.timeline)?target.timeline:[];
        let removed=0;
        if(hasPrior){
            target.timeline=oldTimeline.filter(e=>{
                if(timelineEntryFullyInsideRangeV0115(e,start,endInclusive)){ removed++; return false; }
                return true;
            });
        }
        const before=(target.timeline||[]).length;
        target.timeline=uniqMerge(target.timeline,nodes,x=>JSON.stringify([
            x.date,x.time,x.location||'',String(x.event||'').replace(/\s+/g,' ').trim(),x.source
        ]));
        target.timeline.sort((a,b)=>sourceFirst(a?.source)-sourceFirst(b?.source));

        // Preserve present-state memory. This operation is timeline-only.
        target.last_processed_index=snapshot.last_processed_index;
        target.current_story_date=snapshot.current_story_date;
        target.current_story_time=snapshot.current_story_time;
        target.current_scene=cloneJSONV0112(snapshot.current_scene||{});
        target.active_arcs=cloneJSONV0112(snapshot.active_arcs||[]);
        target.open_loops=cloneJSONV0112(snapshot.open_loops||[]);
        target.closed_loops=cloneJSONV0112(snapshot.closed_loops||[]);
        target.loop_tombstones=cloneJSONV0112(snapshot.loop_tombstones||[]);
        target.audit=Array.isArray(target.audit)?target.audit:[];
        // Hidden coverage + optional AI queue. These records are never injected as
        // story facts and never rendered as timeline events.
        target.audit.push({at:new Date().toISOString(),type:'local_code_coverage_v01111',range:[start,endInclusive],api_calls:0,checked:triage.checked,reliable:triage.reliable,needs_ai:triage.needs_ai});
        target.audit.push({at:new Date().toISOString(),type:'local_needs_ai_v01111',range:[start,endInclusive],api_calls:0,needs_ai:triage.needs_ai,needs_ai_ranges:triage.needs_ai_ranges,preset_plot_nodes:triage.preset_plot_nodes,factual_fallback_nodes:triage.factual_fallback_nodes});
        target.audit.push({
            at:new Date().toISOString(),
            type:'timeline_gap_code_backfill_v01111',
            range:[start,endInclusive],
            api_calls:0,
            structured_parser:true,
            preset_abstract_xml_parser_v0119:true,
            preset_plot_preserved:true,
            local_fact_compression:true,
            unified_temporal_calibration:true,
            weekday_consistency:true,
            replaced_previous_code_nodes:removed,
            nodes_generated:nodes.length,
            nodes_added:(target.timeline||[]).length-before,
            coverage:`${coverage.covered}/${coverage.total}`,
            preserved_cursor:snapshot.last_processed_index
        });
        // v0.11.8: after rebuilding the gap, also repair unresolved time/date on
        // already-existing later timeline nodes using only their own source messages.
        // This is what fixes old #1623+ rows that remained “未明确” even after the gap itself was rebuilt.
        const repairEnd=Math.min(chat.length-1,Math.max(endInclusive,Number(snapshot.last_processed_index)||endInclusive));
        const temporalRepair=repairExistingTimelineTemporalV0117(target,start,repairEnd);
        const currentStateSync=syncCurrentStoryStateFromLatestMetaV0116(target,repairEnd);
        const unifiedV01114=unifiedPostProcessV01114(target,{range:[start,endInclusive],audit:false});
        target.audit.push({
            at:new Date().toISOString(),
            type:'timeline_time_repair_v01111',
            range:[start,repairEnd],
            api_calls:0,
            ...temporalRepair,
            current_state_sync:currentStateSync
        });
        if(target.audit.length>50) target.audit=target.audit.slice(-50);
        await saveMeta();
        refresh(); refreshNative();
        const box=document.getElementById('smm2_native_memory_box');
        if(box?.dataset.open==='1'){
            box.innerHTML=memoryReadableHTML();
            if(M().schema===SMM4_SCHEMA) bindHistoryBrowserV4(); else bindHistoryBrowserLegacy();
        }
        const remaining=timelineCoverageGapsV0112(target);
        if(status) status.textContent=remaining.length
            ? `v0.11.15 代码处理完成，但仍检测到大段缺口：#${remaining[0].start}-#${remaining[0].end}；时间校准 ${temporalRepair.timeFixed} 条、日期校准 ${temporalRepair.dateFixed} 条、星期校准 ${temporalRepair.weekdayFixed} 条${currentStateSync.time?`，当前剧情时间已同步`:''}。`
            : `v0.11.15 代码处理完成：检查 ${triage.checked} 楼：可靠 ${triage.reliable} 楼，需要 AI ${triage.needs_ai} 楼；生成 ${nodes.length} 个 timeline 节点${removed?`，替换旧代码节点 ${removed} 条`:''}；时间校准 ${temporalRepair.timeFixed} 条、日期校准 ${temporalRepair.dateFixed} 条、星期校准 ${temporalRepair.weekdayFixed} 条${currentStateSync.time?`，当前剧情时间已同步`:''}。`;
        toast(`0 API 混合处理完成：#${start}-#${endInclusive}；可靠 ${triage.reliable} 楼，需要 AI ${triage.needs_ai} 楼；生成 ${nodes.length} 条 timeline${removed?`，替换旧结果 ${removed} 条`:''}；时间修复 ${temporalRepair.timeFixed} 条${currentStateSync.time?`，当前剧情时间已同步`:''}。`,'success');
    }catch(e){
        console.error('[StoryMemory] v0.11.15 local code gap repair failed',e);
        c.chatMetadata[META_KEY]=snapshot;
        await saveMeta();
        const status=document.getElementById('smm112_gap_status');
        if(status) status.textContent=`代码处理失败，原记忆已恢复：${String(e?.message||e)}`;
        toast(`代码处理失败，原记忆已恢复：${e?.message||e}`,'error');
    }finally{
        GAP_REPAIR_RUNNING_V0112=false; BUSY=false;
        refresh(); refreshNative();
    }
}


async function repairTimelineTimesLocalV0117() {
    if (BUSY || HISTORY_RUNNING || GAP_REPAIR_RUNNING_V0112) return toast('当前已有总结/重建任务在运行。','warning');
    const chat=C().chat||[];
    const mem=M();
    const end=Math.min(chat.length-1,Math.max(0,Number(mem?.last_processed_index)||chat.length-1));
    if(!confirm(`将以 0 API 扫描当前时间线 #0-#${end}，校准日期+星期+时分：会修复“未明确”、日期分组错误、星期冲突和同日倒退；只使用同 source 原文/预设摘要/世界状态元数据。继续吗？`)) return;
    BUSY=true;
    const snapshot=cloneJSONV0112(mem);
    try{
        const r=repairExistingTimelineTemporalV0117(mem,0,end);
        const currentStateSync=syncCurrentStoryStateFromLatestMetaV0116(mem,end);
        mem.audit=Array.isArray(mem.audit)?mem.audit:[];
        mem.audit.push({at:new Date().toISOString(),type:'timeline_time_repair_v01111',range:[0,end],api_calls:0,...r,current_state_sync:currentStateSync});
        if(mem.audit.length>50) mem.audit=mem.audit.slice(-50);
        await saveMeta(); refresh(); refreshNative();
        const box=document.getElementById('smm2_native_memory_box');
        if(box?.dataset.open==='1'){ box.innerHTML=memoryReadableHTML(); if(M().schema===SMM4_SCHEMA) bindHistoryBrowserV4(); else bindHistoryBrowserLegacy(); }
        toast(`0 API 时间校准完成：时间 ${r.timeFixed} 条，日期 ${r.dateFixed} 条，星期 ${r.weekdayFixed} 条，阻止倒退 ${r.regressionBlocked} 条，地点 ${r.locationFixed} 条${currentStateSync.time?'；当前剧情时间已同步':''}。`,'success');
    }catch(e){
        console.error('[StoryMemory] v0.11.15 timeline time repair failed',e);
        C().chatMetadata[META_KEY]=snapshot; await saveMeta();
        toast(`时间修复失败，原记忆已恢复：${e?.message||e}`,'error');
    }finally{ BUSY=false; refresh(); refreshNative(); }
}

async function repairTimelineGapLocalV0114() {
    if (BUSY || HISTORY_RUNNING || GAP_REPAIR_RUNNING_V0112) {
        return toast('当前已有总结/重建任务在运行。','warning');
    }
    const fromEl=document.getElementById('smm112_gap_from');
    const toEl=document.getElementById('smm112_gap_to');
    const start=Number(fromEl?.value), endInclusive=Number(toEl?.value);
    const chat=C().chat||[];
    if(!Number.isInteger(start)||!Number.isInteger(endInclusive)||start<0||endInclusive<start||endInclusive>=chat.length){
        return toast(`代码补档范围无效。请输入 0-${Math.max(0,chat.length-1)} 之间的 #楼层编号。`,'warning');
    }
    if(!confirm(
        `将以本地代码补档 #${start}-#${endInclusive}（0 API）。\n\n`+
        '优先读取每楼已有 <abstract>/<meow_FM>；没有时只从原正文做抽取式压缩。\n'+
        '只新增 timeline，不重写人物/关系/待办，不修改原聊天，也不改变 last_processed_index。继续吗？'
    )) return;

    const c=C();
    const original=cloneJSONV0112(M());
    const backupKey=META_KEY+'_backup_code_gap_v0114_'+Date.now();
    c.chatMetadata[backupKey]=cloneJSONV0112(original);
    GAP_REPAIR_RUNNING_V0112=true; BUSY=true;
    try{
        const status=document.getElementById('smm112_gap_status');
        if(status) status.textContent=`本地代码正在补档 #${start}-#${endInclusive}（0 API）…`;
        const nodes=makeLocalTimelineNodesV0114(start,endInclusive,original);
        const coverage=coverageStatsLocalV0114(nodes,start,endInclusive);
        if(!nodes.length) throw new Error('本地代码没有生成任何 timeline 节点。');
        if(coverage.missing.length){
            throw new Error(`本地补档覆盖不完整：${coverage.covered}/${coverage.total}，缺少 ${coverage.missing.slice(0,20).map(x=>'#'+x).join(', ')}${coverage.missing.length>20?'…':''}`);
        }

        const target=M();
        const before=(target.timeline||[]).length;
        target.timeline=uniqMerge(target.timeline,nodes,x=>JSON.stringify([x.date,x.time,x.event,x.source]));
        target.timeline.sort((a,b)=>sourceFirst(a?.source)-sourceFirst(b?.source));
        target.last_processed_index=original.last_processed_index;
        target.current_story_date=original.current_story_date;
        target.current_story_time=original.current_story_time;
        target.current_scene=cloneJSONV0112(original.current_scene||{});
        target.active_arcs=cloneJSONV0112(original.active_arcs||[]);
        target.open_loops=cloneJSONV0112(original.open_loops||[]);
        target.closed_loops=cloneJSONV0112(original.closed_loops||[]);
        target.loop_tombstones=cloneJSONV0112(original.loop_tombstones||[]);
        target.audit=Array.isArray(target.audit)?target.audit:[];
        target.audit.push({
            at:new Date().toISOString(),
            type:'timeline_gap_code_backfill_v0114',
            range:[start,endInclusive],
            api_calls:0,
            nodes_generated:nodes.length,
            nodes_added:(target.timeline||[]).length-before,
            coverage:`${coverage.covered}/${coverage.total}`,
            preserved_cursor:original.last_processed_index
        });
        if(target.audit.length>50) target.audit=target.audit.slice(-50);
        await saveMeta();
        refresh(); refreshNative();
        const box=document.getElementById('smm2_native_memory_box');
        if(box?.dataset.open==='1'){
            box.innerHTML=memoryReadableHTML();
            if(M().schema===SMM4_SCHEMA) bindHistoryBrowserV4(); else bindHistoryBrowserLegacy();
        }
        const remaining=timelineCoverageGapsV0112(target);
        if(status) status.textContent=remaining.length
            ? `代码补档完成（0 API），但仍检测到大段缺口：#${remaining[0].start}-#${remaining[0].end}`
            : `代码补档完成（0 API）：检查 ${triage.checked} 楼：可靠 ${triage.reliable} 楼，需要 AI ${triage.needs_ai} 楼；生成 ${nodes.length} 个 timeline 节点。`;
        toast(`代码补档完成：#${start}-#${endInclusive}，0 API，新增 ${(target.timeline||[]).length-before} 条时间线。`,'success');
    }catch(e){
        console.error('[StoryMemory] local code gap repair failed',e);
        c.chatMetadata[META_KEY]=original;
        await saveMeta();
        const status=document.getElementById('smm112_gap_status');
        if(status) status.textContent=`代码补档失败，原记忆已恢复：${String(e?.message||e)}`;
        toast(`代码补档失败，原记忆已恢复：${e?.message||e}`,'error');
    }finally{
        GAP_REPAIR_RUNNING_V0112=false; BUSY=false;
        refresh(); refreshNative();
    }
}

async function repairTimelineGapV0112() {
    if (BUSY || HISTORY_RUNNING || GAP_REPAIR_RUNNING_V0112) {
        return toast('当前已有总结/重建任务在运行。','warning');
    }

    const fromEl=document.getElementById('smm112_gap_from');
    const toEl=document.getElementById('smm112_gap_to');
    const start=Number(fromEl?.value);
    const endInclusive=Number(toEl?.value);
    const chat=C().chat||[];

    if (!Number.isInteger(start) || !Number.isInteger(endInclusive) ||
        start < 0 || endInclusive < start || endInclusive >= chat.length) {
        return toast(`补总结范围无效。请输入 0-${Math.max(0,chat.length-1)} 之间的 #楼层编号。`,'warning');
    }

    const total=endInclusive-start+1;
    if (!confirm(
        `将只补总结 #${start}-#${endInclusive}（${total} 楼）。\n\n`+
        '不会修改原聊天；不会回退 last_processed_index；不会覆盖当前日期、当前场景、当前人物临时状态或当前待办。\n'+
        '开始前会自动备份当前 SMM 记忆。继续吗？'
    )) return;

    const c=C();
    const original=cloneJSONV0112(M());
    const originalCursor=Number(original.last_processed_index??-1);
    const protectedCurrent={
        current_story_date:original.current_story_date,
        current_story_time:original.current_story_time,
        current_scene:cloneJSONV0112(original.current_scene||{}),
        active_arcs:cloneJSONV0112(original.active_arcs||[]),
        open_loops:cloneJSONV0112(original.open_loops||[]),
        closed_loops:cloneJSONV0112(original.closed_loops||[]),
        loop_tombstones:cloneJSONV0112(original.loop_tombstones||[]),
        last_processed_index:originalCursor
    };

    // Keep one automatic rollback snapshot for the latest gap repair.
    for (const key of Object.keys(c.chatMetadata||{})) {
        if (key.startsWith(META_KEY+'_backup_gap_v0112_')) delete c.chatMetadata[key];
    }
    const backupKey=META_KEY+'_backup_gap_v0112_'+Date.now();
    c.chatMetadata[backupKey]=cloneJSONV0112(original);
    await saveMeta();

    const working=historicalWorkingMemoryV0112(original,start);
    GAP_REPAIR_RUNNING_V0112=true;
    BUSY=true;
    let completedTo=start-1;

    try {
        c.chatMetadata[META_KEY]=working;
        let pos=start;
        const batch=Math.max(4,Number(S().batchMessages)||30);

        while(pos<=endInclusive){
            const endExclusive=Math.min(endInclusive+1,pos+batch);
            const status=document.getElementById('smm112_gap_status');
            if(status) status.textContent=`正在补总结 #${pos}-#${endExclusive-1}…`;
            await summarizeGapRangeAdaptiveV0113(pos,endExclusive,0);
            completedTo=endExclusive-1;
            pos=endExclusive;
            await new Promise(r=>setTimeout(r,250));
        }

        const repaired=cloneJSONV0112(working);
        c.chatMetadata[META_KEY]=original;
        const target=M();
        const counts=mergeHistoricalBackfillV0112(target,repaired,start,endInclusive);

        // Historical repair is additive only. Restore all current/lifecycle snapshots exactly.
        target.current_story_date=protectedCurrent.current_story_date;
        target.current_story_time=protectedCurrent.current_story_time;
        target.current_scene=protectedCurrent.current_scene;
        target.active_arcs=protectedCurrent.active_arcs;
        target.open_loops=protectedCurrent.open_loops;
        target.closed_loops=protectedCurrent.closed_loops;
        target.loop_tombstones=protectedCurrent.loop_tombstones;
        target.last_processed_index=protectedCurrent.last_processed_index;
        target.story_start=original.story_start;
        target.audit=Array.isArray(target.audit)?target.audit:[];
        target.audit.push({
            at:new Date().toISOString(),
            type:'timeline_gap_backfill_v0112',
            range:[start,endInclusive],
            preserved_cursor:protectedCurrent.last_processed_index,
            counts
        });
        if(target.audit.length>50) target.audit=target.audit.slice(-50);

        await saveMeta();
        refresh(); refreshNative();
        const box=document.getElementById('smm2_native_memory_box');
        if(box?.dataset.open==='1'){
            box.innerHTML=memoryReadableHTML();
            if(M().schema===SMM4_SCHEMA) bindHistoryBrowserV4(); else bindHistoryBrowserLegacy();
        }

        const remaining=timelineCoverageGapsV0112(target);
        const status=document.getElementById('smm112_gap_status');
        if(status) status.textContent=remaining.length
            ? `补总结完成。仍检测到大段缺口：#${remaining[0].start}-#${remaining[0].end}`
            : '补总结完成；未再检测到大段时间线断档。';
        toast(`缺口补总结完成：#${start}-#${endInclusive}。新增时间线 ${counts.timeline||0} 条；当前游标仍为 #${protectedCurrent.last_processed_index}。`,'success');
    } catch(e) {
        console.error('[StoryMemory] gap repair failed',e);
        c.chatMetadata[META_KEY]=original;
        const target=M();
        target.audit=Array.isArray(target.audit)?target.audit:[];
        target.audit.push({
            at:new Date().toISOString(),
            type:'timeline_gap_backfill_failed_v0112',
            range:[start,endInclusive],
            completed_to:completedTo,
            error:String(e?.message||e)
        });
        if(target.audit.length>50) target.audit=target.audit.slice(-50);
        await saveMeta();
        const status=document.getElementById('smm112_gap_status');
        if(status) status.textContent=`补总结已停止在 #${completedTo}：${String(e?.message||e)}`;
        toast(`补总结失败，原记忆已恢复：${e?.message||e}`,'error');
    } finally {
        GAP_REPAIR_RUNNING_V0112=false;
        BUSY=false;
        refresh(); refreshNative();
    }
}


// =========================================================
// v0.11.15: selective AI completion for the 0-API triage queue.
// Only rows explicitly marked needsAI by the latest local hybrid pass are sent
// to the summarizer. Successful ranges are committed incrementally so a later
// API failure never forces the user to pay for already-completed ranges again.
// =========================================================
function latestNeedsAiQueueV01113(start,endInclusive,mem=M()){
    const audit=Array.isArray(mem?.audit)?mem.audit:[];
    let source=null;
    for(let i=audit.length-1;i>=0;i--){
        const a=audit[i];
        if(a?.type!=='local_needs_ai_v01111') continue;
        const r=Array.isArray(a.range)?a.range:[];
        if(r.length===2 && Number(r[0])<=start && Number(r[1])>=endInclusive){ source=a; break; }
        if(r.length===2 && Number(r[0])===start && Number(r[1])===endInclusive){ source=a; break; }
    }
    if(!source) return {source:null,indexes:[],ranges:[]};
    const xs=[];
    for(const r of (source.needs_ai_ranges||[])){
        if(!Array.isArray(r)||r.length<2) continue;
        const a=Math.max(start,Number(r[0])), b=Math.min(endInclusive,Number(r[1]));
        if(!Number.isInteger(a)||!Number.isInteger(b)||b<a) continue;
        for(let x=a;x<=b;x++) xs.push(x);
    }
    const resolved=new Set();
    for(const a of audit){
        if(a?.type!=='needs_ai_api_resolved_v01113') continue;
        const r=Array.isArray(a.range)?a.range:[];
        if(r.length!==2) continue;
        const aa=Math.max(start,Number(r[0])), bb=Math.min(endInclusive,Number(r[1]));
        if(!Number.isInteger(aa)||!Number.isInteger(bb)||bb<aa) continue;
        for(let x=aa;x<=bb;x++) resolved.add(x);
    }
    const pending=[...new Set(xs)].filter(x=>!resolved.has(x)).sort((a,b)=>a-b);
    return {source,indexes:pending,ranges:compactRangesLocalV01111(pending)};
}

function pairSafeChunksV01113(a,b,maxMessages=24){
    const chat=C().chat||[];
    const out=[];
    let pos=a;
    while(pos<=b){
        let end=Math.min(b,pos+Math.max(4,maxMessages)-1);
        // Avoid cutting between a user message and the immediately following assistant message.
        if(end<b && chat[end]?.is_user && chat[end+1] && !chat[end+1].is_user) end--;
        if(end<pos) end=Math.min(b,pos+1);
        out.push([pos,end]); pos=end+1;
    }
    return out;
}

async function repairNeedsAiOnlyV01113(){
    if(BUSY||HISTORY_RUNNING||GAP_REPAIR_RUNNING_V0112) return toast('当前已有总结/重建任务在运行。','warning');
    const fromEl=document.getElementById('smm112_gap_from');
    const toEl=document.getElementById('smm112_gap_to');
    const start=Number(fromEl?.value), endInclusive=Number(toEl?.value);
    const chat=C().chat||[];
    if(!Number.isInteger(start)||!Number.isInteger(endInclusive)||start<0||endInclusive<start||endInclusive>=chat.length){
        return toast(`范围无效。请输入 0-${Math.max(0,chat.length-1)} 之间的 #楼层编号。`,'warning');
    }
    const q0=latestNeedsAiQueueV01113(start,endInclusive,M());
    if(!q0.source) return toast('这个范围还没有 0 API needsAI 队列。请先运行“代码压缩重建这个范围（0 API）”。','warning');
    if(!q0.indexes.length) return toast('这个范围的 needsAI 队列已经全部处理完成。','success');
    const ranges=q0.ranges;
    const chunks=ranges.flatMap(([a,b])=>pairSafeChunksV01113(a,b,Math.max(8,Number(S().batchMessages)||30)));
    if(!confirm(
        `只把 0 API 判定为“需要 AI”的 ${q0.indexes.length} 楼送给总结模型。\n\n`+
        `可靠楼层不会再次发送；当前共 ${ranges.length} 个连续 needsAI 段，预计最多 ${chunks.length} 个基础批次。任何批次失败都会立即停止，不自动拆分或重试。\n`+
        '每个成功段会立即安全提交；若后续 API 失败，已完成段不会回滚，因此再次运行会自动跳过已付费完成的楼层。继续吗？'
    )) return;

    const c=C();
    const overall=cloneJSONV0112(M());
    const protectedCurrent={
        current_story_date:overall.current_story_date,current_story_time:overall.current_story_time,
        current_scene:cloneJSONV0112(overall.current_scene||{}),active_arcs:cloneJSONV0112(overall.active_arcs||[]),
        open_loops:cloneJSONV0112(overall.open_loops||[]),closed_loops:cloneJSONV0112(overall.closed_loops||[]),
        loop_tombstones:cloneJSONV0112(overall.loop_tombstones||[]),last_processed_index:Number(overall.last_processed_index??-1),story_start:overall.story_start
    };
    BUSY=true; GAP_REPAIR_RUNNING_V0112=true;
    let doneFloors=0, doneChunks=0, apiRanges=[];
    try{
        for(const [a,b] of chunks){
            const status=document.getElementById('smm112_gap_status');
            if(status) status.textContent=`AI 仅补 needsAI：正在处理 #${a}-#${b}（已完成 ${doneFloors}/${q0.indexes.length} 楼）…`;
            const targetBefore=cloneJSONV0112(M());
            const working=historicalWorkingMemoryV0112(targetBefore,a);
            c.chatMetadata[META_KEY]=working;
            try{
                await summarizeGapRangeAdaptiveV0113(a,b+1,0);
                const repaired=cloneJSONV0112(working);
                c.chatMetadata[META_KEY]=targetBefore;
                const target=M();
                const counts=mergeHistoricalBackfillV0112(target,repaired,a,b);
                target.current_story_date=protectedCurrent.current_story_date;
                target.current_story_time=protectedCurrent.current_story_time;
                target.current_scene=cloneJSONV0112(protectedCurrent.current_scene);
                target.active_arcs=cloneJSONV0112(protectedCurrent.active_arcs);
                target.open_loops=cloneJSONV0112(protectedCurrent.open_loops);
                target.closed_loops=cloneJSONV0112(protectedCurrent.closed_loops);
                target.loop_tombstones=cloneJSONV0112(protectedCurrent.loop_tombstones);
                target.last_processed_index=protectedCurrent.last_processed_index;
                target.story_start=protectedCurrent.story_start;
                replaceLocalDeferredRangeV01129(target,a,b,[]);
                target.audit=Array.isArray(target.audit)?target.audit:[];
                target.audit.push({at:new Date().toISOString(),type:'needs_ai_api_resolved_v01113',range:[a,b],counts,preserved_cursor:protectedCurrent.last_processed_index});
                if(target.audit.length>50) target.audit=target.audit.slice(-50);
                await saveMeta();
                doneFloors+=b-a+1; doneChunks++; apiRanges.push([a,b]);
            }catch(e){
                c.chatMetadata[META_KEY]=targetBefore; await saveMeta();
                throw new Error(`needsAI 批次 #${a}-#${b} 失败：${e?.message||e}`);
            }
        }
        const target=M();
        const temporalRepair=repairExistingTimelineTemporalV0117(target,start,Math.min(chat.length-1,Math.max(endInclusive,protectedCurrent.last_processed_index)));
        const currentStateSync=syncCurrentStoryStateFromLatestMetaV0116(target,Math.min(chat.length-1,Math.max(endInclusive,protectedCurrent.last_processed_index)));
        const unifiedV01114=unifiedPostProcessV01114(target,{range:[start,endInclusive],audit:false});
        target.audit=Array.isArray(target.audit)?target.audit:[];
        target.audit.push({at:new Date().toISOString(),type:'needs_ai_selective_complete_v01113',requested_range:[start,endInclusive],resolved_ranges:apiRanges,resolved_floors:doneFloors,chunks:doneChunks,time_repair:temporalRepair,current_state_sync:currentStateSync});
        if(target.audit.length>50) target.audit=target.audit.slice(-50);
        await saveMeta(); refresh(); refreshNative();
        const left=latestNeedsAiQueueV01113(start,endInclusive,target);
        const status=document.getElementById('smm112_gap_status');
        if(status) status.textContent=`v0.11.15 needsAI 精准补总结完成：本次 ${doneFloors} 楼 / ${doneChunks} 批；剩余需要 AI ${left.indexes.length} 楼；可靠楼层未重复发送。`;
        toast(`needsAI 精准补总结完成：${doneFloors} 楼，${doneChunks} 批；剩余 ${left.indexes.length} 楼。`,'success');
    }catch(e){
        console.error('[StoryMemory] selective needsAI repair failed',e);
        // Successful previous chunks were already committed. Do not roll them back.
        const target=M();
        target.current_story_date=protectedCurrent.current_story_date;
        target.current_story_time=protectedCurrent.current_story_time;
        target.current_scene=cloneJSONV0112(protectedCurrent.current_scene);
        target.active_arcs=cloneJSONV0112(protectedCurrent.active_arcs);
        target.open_loops=cloneJSONV0112(protectedCurrent.open_loops);
        target.closed_loops=cloneJSONV0112(protectedCurrent.closed_loops);
        target.loop_tombstones=cloneJSONV0112(protectedCurrent.loop_tombstones);
        target.last_processed_index=protectedCurrent.last_processed_index;
        target.story_start=protectedCurrent.story_start;
        target.audit=Array.isArray(target.audit)?target.audit:[];
        target.audit.push({at:new Date().toISOString(),type:'needs_ai_selective_stopped_v01113',requested_range:[start,endInclusive],completed_ranges:apiRanges,completed_floors:doneFloors,error:String(e?.message||e)});
        if(target.audit.length>50) target.audit=target.audit.slice(-50);
        await saveMeta();
        const left=latestNeedsAiQueueV01113(start,endInclusive,target);
        const status=document.getElementById('smm112_gap_status');
        if(status) status.textContent=`needsAI 精准补总结已停止：已安全完成 ${doneFloors} 楼，剩余 ${left.indexes.length} 楼。${e?.message||e}`;
        toast(`needsAI 补总结停止；已完成部分不会重算。剩余 ${left.indexes.length} 楼。`,'warning');
    }finally{ BUSY=false; GAP_REPAIR_RUNNING_V0112=false; refresh(); refreshNative(); }
}

// =========================================================
// v0.11.29: ordinary incremental summary without a model/API.
// Reuses the audited local factual parser already used by 0-API gap repair,
// but commits the processed cursor so it can serve daily automatic summaries.
// =========================================================
function localSummaryModeV01129() {
    return String(S().summaryMode||'ai') !== 'ai';
}

function localDeferredRangesV01133(mem=M()) {
    const chat=C().chat||[];
    const cap=Math.min(chat.length-1,Math.max(-1,Number(mem?.last_processed_index??-1)));
    const rows=[];
    for(const row of (Array.isArray(mem?.local_deferred_ranges)?mem.local_deferred_ranges:[])){
        const a=Math.max(0,Number(row?.[0])),b=Math.min(cap,Number(row?.[1]));
        if(Number.isInteger(a)&&Number.isInteger(b)&&b>=a) rows.push([a,b]);
    }
    const indexes=[];
    for(const [a,b] of rows) for(let i=a;i<=b;i++) indexes.push(i);
    return compactRangesLocalV01111(indexes);
}

function localDeferredCountV01133(mem=M()) {
    return localDeferredRangesV01133(mem).reduce((n,[a,b])=>n+b-a+1,0);
}

function updateCharactersFromStatusRangeV01133(mem,start,endInclusive) {
    const chat=C().chat||[];
    mem.characters=mem.characters&&typeof mem.characters==='object'&&!Array.isArray(mem.characters)?mem.characters:{};
    let changed=0;
    for(let i=Math.max(0,start);i<=Math.min(endInclusive,chat.length-1);i++){
        const status=extractRoleplayStatusMetadataV01133(chat[i],i);
        if(!status) continue;
        for(const loc of (status.locations||[])){
            const rawName=String(loc?.label||'').trim();
            if(!rawName||/^(?:角色|人物|主角|用户|USER|你)$/i.test(rawName)) continue;
            const name=canonicalPersonName(rawName);
            if(!name) continue;
            const old=mem.characters[name]&&typeof mem.characters[name]==='object'?mem.characters[name]:{};
            const oldIndex=sourceLast(old.location_source);
            if(old.location&&oldIndex<0) continue;
            if(oldIndex>i) continue;
            const value=String(loc.value||'').trim();
            if(!value) continue;
            if(old.location!==value||old.location_source!==`#${i}`){
                mem.characters[name]={...old,location:value,location_source:`#${i}`};
                changed++;
            }
        }
    }
    return changed;
}

function persistedLocalTimelineNodeV01129(node) {
    const out={
        date:normalizeDateInput(node?.date||'')?.iso||null,
        time:String(node?.time||'').trim()||null,
        event:String(node?.event||'').replace(/\s+/g,' ').trim(),
        source:String(node?.source||'').trim(),
        generation_mode:'local_zero_api',
        event_origin:String(node?.event_origin||'assistant_reply'),
        local_extraction_version:'v0.11.35'
    };
    if(node?.location) out.location=String(node.location).trim();
    for(const key of [
        'time_evidence','time_evidence_label','time_evidence_reason',
        'date_hint','date_precision','date_evidence','date_evidence_label','date_evidence_reason',
        'reality_date','reality_time','calendar_axis',
        'recap_start_date','recap_end_date'
    ]){
        if(node?.[key]!=null&&String(node[key]).trim()) out[key]=String(node[key]).trim();
    }
    if(Number.isInteger(Number(node?.calendar_segment))) out.calendar_segment=Number(node.calendar_segment);
    return out;
}

function rebuildLocalStagesAfterRecapRepairV01135(mem,targetIndexes) {
    const previous=Array.isArray(mem?.stage_summaries)?mem.stage_summaries:[];
    if(!previous.length) return {before:0,after:0,rebuilt:false,removed:0};
    const hitsTarget=stage=>{
        const a=Number(stage?.start_index),b=Number(stage?.end_index);
        if(!Number.isInteger(a)||!Number.isInteger(b)) return true;
        for(let i=a;i<=b;i++) if(targetIndexes.has(i)) return true;
        return false;
    };
    const allLocal=previous.every(x=>String(x?.generation_mode||'').startsWith('local'));
    if(!allLocal){
        const kept=previous.filter(x=>!hitsTarget(x));
        mem.stage_summaries=kept;
        if(!kept.length){
            mem.stage_summary_last_index=-1;
            mem.stage_summary_updated_at=null;
        }
        return {before:previous.length,after:kept.length,rebuilt:false,removed:previous.length-kept.length};
    }

    const ready=stageSummaryReadinessV01121(mem);
    if(!ready.ready){
        mem.stage_summaries=[];
        mem.stage_summary_last_index=-1;
        mem.stage_summary_updated_at=null;
        return {before:previous.length,after:0,rebuilt:false,removed:previous.length,reason:ready.reason};
    }
    const chunks=chunkStageTimelineV01121(stageTimelineRowsV01121(mem));
    const stages=normalizeAllStageSummariesV01121(chunks.map((chunk,i)=>{
        const row=localStageFallbackV01126(chunk,mem,i+1,'v0.11.35 角色卡摘要优先迁移后本地重建');
        row.generation_mode='local_zero_api';
        return row;
    }));
    mem.stage_summaries=stages;
    mem.stage_summary_last_index=ready.last;
    mem.stage_summary_updated_at=new Date().toISOString();
    return {before:previous.length,after:stages.length,rebuilt:true,removed:0};
}

// One-time per-chat migration for entries created before v0.11.35. It replaces
// only legacy local_zero_api rows. AI memory, manually imported memory, story
// start, characters and the processed cursor are preserved; original chat JSONL
// is never written.
async function repairLegacyLocalTimelineV01135({save=true,notifyUser=false}={}) {
    const mem=M();
    const chat=C().chat||[];
    const cap=Math.min(chat.length-1,Math.max(-1,Number(mem?.last_processed_index??-1)));
    const legacy=(Array.isArray(mem?.timeline)?mem.timeline:[]).filter(x=>
        String(x?.generation_mode||'')==='local_zero_api' &&
        String(x?.local_extraction_version||'')!=='v0.11.35' &&
        validRealSourceV0112(x?.source)
    );
    const alreadyDone=mem?.local_recap_repair_v01135?.complete===true;
    if(!legacy.length){
        if(!alreadyDone){
            const at=new Date().toISOString();
            mem.local_recap_repair_v01135={complete:true,at,legacy_rows:0,api_calls:0};
            // Keep the previous migration marker for compatibility with
            // diagnostics/tests that still display the v0.11.34 repair state.
            mem.local_assistant_only_repair_v01134={complete:true,at,legacy_rows:0,api_calls:0,superseded_by:'v0.11.35'};
            if(save) await saveMeta();
        }
        return {changed:false,removed:0,added:0,deferred:localDeferredCountV01133(mem),legacy:0};
    }
    if(cap<0) return {changed:false,removed:0,added:0,deferred:0,legacy:legacy.length};

    const snapshot=cloneJSONV0112(mem);
    try{
        const targetIndexes=new Set();
        for(const row of legacy){
            for(const i of sourceIndexes(row.source)) if(i>=0&&i<=cap) targetIndexes.add(i);
        }
        const ranges=compactRangesLocalV01111([...targetIndexes]);
        const rebuilt=[];
        let checked=0,reliable=0,ignored=0;
        for(const [start,endInclusive] of ranges){
            const raw=makeLocalTimelineNodesV0117(start,endInclusive,snapshot);
            const triage=localTriageStatsV01111(raw,start,endInclusive);
            const nodes=raw.filter(node=>{
                const ids=sourceIndexes(node?.source);
                return ids.length>0 && ids.every(i=>targetIndexes.has(i));
            }).map(persistedLocalTimelineNodeV01129).filter(x=>x.event&&x.source);
            rebuilt.push(...nodes);
            checked+=triage.checked;
            reliable+=triage.reliable;
            ignored+=triage.ignored||0;
            replaceLocalDeferredRangeV01129(mem,start,endInclusive,triage.needs_ai_ranges);
        }

        const legacySet=new Set(legacy);
        mem.timeline=(Array.isArray(mem.timeline)?mem.timeline:[]).filter(x=>!legacySet.has(x));
        const beforeAdd=mem.timeline.length;
        mem.timeline=uniqMerge(mem.timeline,rebuilt,x=>JSON.stringify([x.date,x.time,x.location||'',x.event,x.source]));
        mem.timeline.sort((a,b)=>sourceFirst(a?.source)-sourceFirst(b?.source));
        const added=Math.max(0,mem.timeline.length-beforeAdd);

        repairExistingTimelineTemporalV0117(mem,0,cap);
        repairNarrativeCalendarV01130(mem,cap);
        syncCurrentDateFromTimeline(mem,null);
        syncCurrentStoryStateFromLatestMetaV0116(mem,cap);
        resolveCurrentNarrativeStateV01130(mem,cap);
        restoreMissingCurrentLocationV01129(mem,cap);
        const stages=rebuildLocalStagesAfterRecapRepairV01135(mem,targetIndexes);

        mem.local_recap_repair_v01135={
            complete:true,at:new Date().toISOString(),legacy_rows:legacy.length,
            rows_added:added,checked,reliable,ignored,
            deferred:localDeferredCountV01133(mem),api_calls:0
        };
        mem.local_assistant_only_repair_v01134={
            ...mem.local_recap_repair_v01135,
            superseded_by:'v0.11.35'
        };
        mem.audit=Array.isArray(mem.audit)?mem.audit:[];
        mem.audit.push({
            at:mem.local_recap_repair_v01135.at,
            type:'role_card_recap_priority_repair_v01135',api_calls:0,
            legacy_rows_removed:legacy.length,assistant_rows_added:added,
            checked,reliable,ignored,deferred:localDeferredCountV01133(mem),
            stages,processed_cursor_preserved:Number(snapshot.last_processed_index??-1),
            original_chat_modified:false
        });
        if(mem.audit.length>50) mem.audit=mem.audit.slice(-50);
        if(save) await saveMeta();
        if(notifyUser){
            toast(`已升级旧版 0 API 时间线：优先读取角色卡摘要，重建 ${added} 条；待补录 ${localDeferredCountV01133(mem)} 楼。`,'success');
        }
        return {changed:true,removed:legacy.length,added,deferred:localDeferredCountV01133(mem),legacy:legacy.length,stages};
    }catch(e){
        restoreObjectInPlaceV0112(mem,snapshot);
        if(save){ try{await saveMeta();}catch(_){} }
        throw e;
    }
}

// Compatibility wrapper kept for v0.11.34 regression callers.
async function repairLegacyUserDerivedTimelineV01134(options={}) {
    return repairLegacyLocalTimelineV01135(options);
}

let LOCAL_RECAP_REPAIR_RUNNING_V01135=false;
async function ensureRoleCardRecapMemoryV01135({notifyUser=true}={}) {
    if(LOCAL_RECAP_REPAIR_RUNNING_V01135||BUSY||HISTORY_RUNNING||GAP_REPAIR_RUNNING_V0112) return null;
    const mem=M();
    const legacy=(Array.isArray(mem?.timeline)?mem.timeline:[]).some(x=>
        String(x?.generation_mode||'')==='local_zero_api' &&
        String(x?.local_extraction_version||'')!=='v0.11.35'
    );
    if(!legacy&&mem?.local_recap_repair_v01135?.complete===true) return null;
    LOCAL_RECAP_REPAIR_RUNNING_V01135=true;
    try{
        const result=await repairLegacyLocalTimelineV01135({save:true,notifyUser:notifyUser&&legacy});
        refresh(); refreshNative();
        return result;
    }catch(e){
        console.error('[StoryMemory] v0.11.35 role-card recap repair failed',e);
        if(notifyUser) toast(`旧版本地摘要修复失败，原记忆已恢复：${e?.message||e}`,'error');
        return null;
    }finally{
        LOCAL_RECAP_REPAIR_RUNNING_V01135=false;
    }
}

async function backfillDeferredLocalV01133({save=true}={}) {
    const mem=M();
    const snapshot=cloneJSONV0112(mem);
    const ranges=localDeferredRangesV01133(mem);
    if(!ranges.length) return {checked:0,added:0,resolved:0,remaining:0,ranges:[]};
    let checked=0,added=0,resolved=0,ignored=0,extractive=0,statusNodes=0,characters=0;
    try{
        for(const [start,endInclusive] of ranges){
            const rawNodes=makeLocalTimelineNodesV0117(start,endInclusive,mem);
            const triage=localTriageStatsV01111(rawNodes,start,endInclusive);
            const nodes=rawNodes
                .filter(n=>sourceWithinBatchV0112(n?.source,start,endInclusive+1))
                .map(persistedLocalTimelineNodeV01129)
                .filter(n=>n.event&&n.source);
            const before=(mem.timeline||[]).length;
            mem.timeline=uniqMerge(mem.timeline,nodes,x=>JSON.stringify([x.date,x.time,x.location||'',x.event,x.source]));
            added+=(mem.timeline||[]).length-before;
            checked+=triage.checked;
            resolved+=triage.reliable;
            ignored+=triage.ignored||0;
            extractive+=triage.extractive_nodes||0;
            statusNodes+=triage.status_nodes||0;
            characters+=updateCharactersFromStatusRangeV01133(mem,start,endInclusive);
            replaceLocalDeferredRangeV01129(mem,start,endInclusive,triage.needs_ai_ranges);
        }
        mem.timeline.sort((a,b)=>sourceFirst(a?.source)-sourceFirst(b?.source));
        const cap=Math.min((C().chat||[]).length-1,Math.max(-1,Number(mem.last_processed_index??-1)));
        repairExistingTimelineTemporalV0117(mem,0,cap);
        repairNarrativeCalendarV01130(mem,cap);
        syncCurrentDateFromTimeline(mem,null);
        syncCurrentStoryStateFromLatestMetaV0116(mem,cap);
        resolveCurrentNarrativeStateV01130(mem,cap);
        restoreMissingCurrentLocationV01129(mem,cap);
        mem.audit=Array.isArray(mem.audit)?mem.audit:[];
        mem.audit.push({
            at:new Date().toISOString(),type:'local_deferred_backfill_v01133',api_calls:0,
            ranges,checked,resolved,ignored,extractive_nodes:extractive,status_nodes:statusNodes,
            characters_updated:characters,nodes_added:added,
            remaining:localDeferredCountV01133(mem),preserved_cursor:Number(snapshot.last_processed_index??-1)
        });
        if(mem.audit.length>50) mem.audit=mem.audit.slice(-50);
        if(save) await saveMeta();
        return {checked,added,resolved,ignored,extractive,statusNodes,characters,remaining:localDeferredCountV01133(mem),ranges};
    }catch(e){
        restoreObjectInPlaceV0112(mem,snapshot);
        if(save){ try{await saveMeta();}catch(_){} }
        throw e;
    }
}

async function runDeferredBackfillV01133() {
    if(BUSY||HISTORY_RUNNING||GAP_REPAIR_RUNNING_V0112) return toast('当前已有总结/重建任务在运行。','warning');
    const count=localDeferredCountV01133(M());
    if(!count) return toast('当前没有被跳过且等待补录的楼层。','success');
    BUSY=true;
    try{
        const result=await backfillDeferredLocalV01133({save:true});
        refresh(); refreshNative();
        const box=document.getElementById('smm2_native_memory_box');
        if(box?.dataset.open==='1'){
            box.innerHTML=memoryReadableHTML();
            if(M().schema===SMM4_SCHEMA) bindHistoryBrowserV4(); else bindHistoryBrowserLegacy();
        }
        toast(`补录完成：检查 ${result.checked} 楼，新增 ${result.added} 条时间线；仍待人工/AI ${result.remaining} 楼。`,'success');
    }catch(e){
        console.error('[StoryMemory] v0.11.33 deferred backfill failed',e);
        toast(`补录失败，原记忆已恢复：${e?.message||e}`,'error');
    }finally{
        BUSY=false; refresh(); refreshNative();
    }
}

async function summarizeRangeLocalV01129(start,end,options={}) {
    const mem=M();
    const snapshot=cloneJSONV0112(mem);
    const endInclusive=Math.max(start,end-1);
    try{
        const rawNodes=makeLocalTimelineNodesV0117(start,endInclusive,snapshot);
        const triage=localTriageStatsV01111(rawNodes,start,endInclusive);
        const nodes=rawNodes
            .filter(n=>sourceWithinBatchV0112(n?.source,start,end))
            .map(persistedLocalTimelineNodeV01129)
            .filter(n=>n.event&&n.source);

        mem.timeline=Array.isArray(mem.timeline)?mem.timeline:[];
        const before=mem.timeline.length;
        mem.timeline=uniqMerge(mem.timeline,nodes,x=>JSON.stringify([
            x.date,x.time,x.location||'',x.event,x.source
        ]));
        mem.timeline.sort((a,b)=>sourceFirst(a?.source)-sourceFirst(b?.source));

        addLocalCoverageRangeV01129(mem,start,endInclusive);
        replaceLocalDeferredRangeV01129(mem,start,endInclusive,triage.needs_ai_ranges);
        mem.last_processed_index=endInclusive;
        const statusCharacters=updateCharactersFromStatusRangeV01133(mem,start,endInclusive);

        const temporalRepair=repairExistingTimelineTemporalV0117(mem,start,endInclusive);
        const narrativeCalendar=repairNarrativeCalendarV01130(mem,endInclusive);
        const dateSync=syncCurrentDateFromTimeline(mem,null);
        const currentStateSync=syncCurrentStoryStateFromLatestMetaV0116(mem,endInclusive);
        const currentResolver=resolveCurrentNarrativeStateV01130(mem,endInclusive);
        const unified=unifiedPostProcessV01114(mem,{range:[start,endInclusive],audit:false});
        const narrativeCalendarFinal=repairNarrativeCalendarV01130(mem,endInclusive);
        const currentResolverFinal=resolveCurrentNarrativeStateV01130(mem,endInclusive);
        const locationRepair=restoreMissingCurrentLocationV01129(mem,endInclusive);

        mem.audit=Array.isArray(mem.audit)?mem.audit:[];
        mem.audit.push({
            at:new Date().toISOString(),
            type:'incremental_local_summary_v01129',
            range:[start,endInclusive],
            api_calls:0,
            checked:triage.checked,
            reliable:triage.reliable,
            deferred:triage.needs_ai,
            deferred_ranges:triage.needs_ai_ranges,
            preset_plot_nodes:triage.preset_plot_nodes,
            factual_fallback_nodes:triage.factual_fallback_nodes,
            extractive_nodes:triage.extractive_nodes||0,
            status_nodes:triage.status_nodes||0,
            ignored:triage.ignored||0,
            status_characters_updated:statusCharacters,
            nodes_generated:nodes.length,
            nodes_added:mem.timeline.length-before,
            temporal_repair:temporalRepair,
            date_sync:dateSync,
            current_state_sync:currentStateSync,
            current_resolver_changed:!!(currentResolver?.changed||currentResolverFinal?.changed),
            unified_changed:!!unified?.changed,
            narrative_calendar:narrativeCalendarFinal?.changed?narrativeCalendarFinal:narrativeCalendar,
            location_repair:locationRepair
        });
        mem.audit.push({
            at:new Date().toISOString(),type:'local_needs_ai_v01111',
            range:[start,endInclusive],api_calls:0,needs_ai:triage.needs_ai,
            needs_ai_ranges:triage.needs_ai_ranges,
            preset_plot_nodes:triage.preset_plot_nodes,
            factual_fallback_nodes:triage.factual_fallback_nodes,
            extractive_nodes:triage.extractive_nodes||0,
            ignored:triage.ignored||0,
            source_mode:'incremental_local_v01129'
        });
        if(mem.audit.length>50) mem.audit=mem.audit.slice(-50);
        if(options?.save!==false) await saveMeta();
        return {
            mode:'local',api_calls:0,start,end:endInclusive,
            nodes:nodes.length,added:mem.timeline.length-before,triage
        };
    }catch(e){
        restoreObjectInPlaceV0112(mem,snapshot);
        if(options?.save!==false){
            try{ await saveMeta(); }catch(_){}
        }
        throw e;
    }
}

async function summarizeRangeConfiguredV01129(start,end,options={}) {
    if(localSummaryModeV01129()) return summarizeRangeLocalV01129(start,end,options);
    try{
        return await summarizeRange(start,end,options);
    }catch(e){
        if(!isSmmTimeout(e)&&!isUpstreamGatewayFailureV01129(e)) throw e;

        // v0.11.36: a transport failure is not a summary.  Preserve both the
        // cursor and the selected current-model mode so retrying later processes
        // the exact same floors instead of committing rule-based fragments.
        const mem=M();
        mem.audit=Array.isArray(mem.audit)?mem.audit:[];
        mem.audit.push({
            at:new Date().toISOString(),type:'ai_gateway_batch_preserved_v01136',
            range:[start,end-1],model_calls:1,switched_mode:false,
            cursor_preserved:Number(mem.last_processed_index??-1),
            reason:isSmmTimeout(e)?'client_timeout_120s':'cloudflare_gateway_timeout'
        });
        if(mem.audit.length>50) mem.audit=mem.audit.slice(-50);
        if(options?.save!==false) await saveMeta();
        const err=new Error(`总结请求${isSmmTimeout(e)?'超过 120 秒':'遇到 Cloudflare 524'}；本批未写入、游标未推进，也未切换 0 API。稍后重试即可。`);
        err.smmBatchPreservedV01136=true;
        throw err;
    }
}

function requeueStartForLocalMemoryV01136(mem=M()) {
    const candidates=[];
    for(const row of (Array.isArray(mem?.timeline)?mem.timeline:[])){
        if(String(row?.generation_mode||'').startsWith('local') || row?.local_extraction_version){
            const first=sourceFirst(row?.source);
            if(Number.isInteger(first)&&first>=0&&first<Number.MAX_SAFE_INTEGER) candidates.push(first);
        }
    }
    for(const field of ['local_coverage_ranges','local_deferred_ranges']){
        for(const range of (Array.isArray(mem?.[field])?mem[field]:[])){
            const first=Number(range?.[0]);
            if(Number.isInteger(first)&&first>=0) candidates.push(first);
        }
    }
    return candidates.length?Math.min(...candidates):null;
}

function hasIncorrectLocalMemoryV01136(mem=M()) {
    return Number.isInteger(requeueStartForLocalMemoryV01136(mem));
}

async function requeueIncorrectLocalMemoryV01136({confirmUser=true,save=true}={}) {
    if(BUSY||HISTORY_RUNNING||GAP_REPAIR_RUNNING_V0112) throw new Error('当前已有总结/重建任务在运行');
    const mem=M();
    const start=requeueStartForLocalMemoryV01136(mem);
    if(!Number.isInteger(start)) return {changed:false,start:null,removed_timeline:0,removed_stages:0};
    const oldCursor=Math.max(-1,Number(mem.last_processed_index??-1));
    if(confirmUser && !confirm(
        `将撤销从 #${start} 起由旧版 0 API 生成的派生记忆，并把这些楼层重新放回“待总结”。\n\n`+
        '会保留剧情起点和原始聊天；不会删除、改写 JSONL。之后请用“当前聊天模型”重新总结。\n\n继续吗？'
    )) return {changed:false,cancelled:true,start};

    const snapshot=cloneJSONV0112(mem);
    const afterStart=row=>{
        const last=sourceLast(row?.source);
        return Number.isInteger(last)&&last>=start;
    };
    try{
        const timeline=Array.isArray(mem.timeline)?mem.timeline:[];
        const removedTimeline=timeline.filter(row=>afterStart(row) || String(row?.generation_mode||'').startsWith('local') || row?.local_extraction_version);
        mem.timeline=timeline.filter(row=>!removedTimeline.includes(row));

        const sourceArrays=['facts','events','relationships','character_anchors','active_arcs','open_loops','locations','items','conflicts','quarantined','semantic_anchors'];
        const removedByField={};
        for(const field of sourceArrays){
            const rows=Array.isArray(mem[field])?mem[field]:[];
            const removed=rows.filter(afterStart);
            if(removed.length) removedByField[field]=removed;
            mem[field]=rows.filter(row=>!removed.includes(row));
        }

        const removedNpcs={};
        for(const [name,row] of Object.entries(mem.npcs||{})){
            if(afterStart({...row,source:row?.last_source||row?.source})){
                removedNpcs[name]=row;
                delete mem.npcs[name];
            }
        }
        if(Object.keys(removedNpcs).length) removedByField.npcs=removedNpcs;

        const stages=Array.isArray(mem.stage_summaries)?mem.stage_summaries:[];
        const removedStages=stages.filter(row=>
            String(row?.generation_mode||'').startsWith('local') ||
            (Number.isInteger(Number(row?.end_index)) && Number(row.end_index)>=start)
        );
        mem.stage_summaries=stages.filter(row=>!removedStages.includes(row));
        const keptStageEnds=mem.stage_summaries.map(x=>Number(x?.end_index)).filter(Number.isFinite);
        mem.stage_summary_last_index=keptStageEnds.length?Math.max(...keptStageEnds):-1;
        mem.stage_summary_updated_at=mem.stage_summaries.length?new Date().toISOString():null;

        // Local status extraction could have written transient character state
        // without field-level provenance. Preserve only stable identity/personality;
        // the current model will rebuild location/outfit/physiology from the text.
        mem.characters=stableCharactersForPromptV0110(mem);
        mem.last_processed_index=Math.min(oldCursor,start-1);
        mem.local_coverage_ranges=[];
        mem.local_deferred_ranges=[];
        mem.current_story_date=null;
        mem.current_story_time=null;
        mem.current_reality_date=null;
        mem.current_reality_time=null;
        mem.current_scene={};

        const latest=mem.timeline
            .filter(x=>sourceLast(x?.source)<=mem.last_processed_index)
            .sort((a,b)=>sourceLast(a?.source)-sourceLast(b?.source)).at(-1);
        if(latest){
            mem.current_story_date=normalizeDateInput(latest?.date||'')?.iso||null;
            mem.current_story_time=String(latest?.time||'').trim()||null;
            mem.current_scene={
                ...(latest?.date?{date:latest.date}:{}),
                ...(latest?.time?{time:latest.time}:{}),
                ...(latest?.location?{location:latest.location}:{})
            };
        }

        mem.requeue_backup_v01136={
            at:new Date().toISOString(),start,old_cursor:oldCursor,
            current_story_date:snapshot.current_story_date||null,
            current_story_time:snapshot.current_story_time||null,
            current_scene:snapshot.current_scene||{},
            timeline:removedTimeline,
            stage_summaries:removedStages,
            removed_by_field:removedByField
        };
        delete mem.local_recap_repair_v01135;
        delete mem.local_assistant_only_repair_v01134;
        delete mem.rebuild_state;
        mem.audit=Array.isArray(mem.audit)?mem.audit:[];
        mem.audit.push({
            at:new Date().toISOString(),type:'local_memory_requeued_v01136',
            start,old_cursor:oldCursor,new_cursor:mem.last_processed_index,
            removed_timeline:removedTimeline.length,removed_stages:removedStages.length,
            original_chat_modified:false
        });
        if(mem.audit.length>50) mem.audit=mem.audit.slice(-50);

        const settings=S();
        settings.summaryMode='ai';
        settings.summaryProvider='current';
        settings.summaryFallback='stop';
        saveSettings();
        if(save) await saveMeta();
        return {changed:true,start,old_cursor:oldCursor,new_cursor:mem.last_processed_index,removed_timeline:removedTimeline.length,removed_stages:removedStages.length};
    }catch(e){
        restoreObjectInPlaceV0112(mem,snapshot);
        if(save){ try{await saveMeta();}catch(_){} }
        throw e;
    }
}

async function runRequeueIncorrectLocalMemoryV01136() {
    try{
        const result=await requeueIncorrectLocalMemoryV01136({confirmUser:true,save:true});
        if(result?.cancelled) return;
        if(!result?.changed) return toast('没有检测到旧版 0 API 派生记忆。','success');
        refresh(); refreshNative();
        toast(`已撤销错误本地记录：从 #${result.start} 起重新排队；移除时间线 ${result.removed_timeline} 条。现在可点“总结新增（当前模型）”。`,'success');
    }catch(e){
        console.error('[StoryMemory] v0.11.36 local-memory requeue failed',e);
        toast(`撤销失败，原记忆已恢复：${e?.message||e}`,'error');
    }
}

function historyCatchupStateV01146(mem=M()) {
    const state=mem?.history_catchup_v01146;
    if(!state||typeof state!=='object') return null;
    const target=Number(state.target_index);
    if(!Number.isInteger(target)||target<0) return null;
    return state;
}

function activeHistoryCatchupV01146(mem=M()) {
    const state=historyCatchupStateV01146(mem);
    if(!state||state.status!=='active') return null;
    const next=Math.max(0,Number(mem?.last_processed_index??-1)+1);
    return next<=Number(state.target_index)?state:null;
}

function beginHistoryCatchupV01146(mem,start,chatLength) {
    const prior=historyCatchupStateV01146(mem);
    if(prior) return prior.status==='active'?prior:null;
    const target=Math.max(-1,Number(chatLength||0)-1);
    if(target<start) return null;
    mem.history_catchup_v01146={
        status:'active',
        start_index:start,
        target_index:target,
        next_index:start,
        created_at:new Date().toISOString(),
        completed_at:null
    };
    return mem.history_catchup_v01146;
}

function completeHistoryCatchupV01146(mem=M()) {
    const state=historyCatchupStateV01146(mem);
    if(!state||state.status!=='active') return false;
    state.status='completed';
    state.next_index=Number(state.target_index)+1;
    state.completed_at=new Date().toISOString();
    return true;
}

async function summarizeNew(force=false) {
    if (BUSY) return;
    const c = C(), s = S(), mem = M(), chat = c.chat || [];
    const usingPaidProvider=String(s.summaryMode||'ai')==='ai' && usingPaidProviderV01142(s);
    if(usingPaidProvider && selectedPaidProviderLockedV01142(s)){
        return toast(`独立 API 尚不可用（${selectedPaidProviderReasonV01142(s)}）。本次未调用总结 API、未产生总结请求费用。`,'warning');
    }
    const start = Math.max(0, Number(mem.last_processed_index ?? -1) + 1);
    const pending = chat.length - start;
    const deferredBefore=localSummaryModeV01129()?localDeferredCountV01133(mem):0;
    if (!force && pending < Math.max(1, Number(s.triggerMessages)||8) && deferredBefore<=0) return;
    if (pending <= 0 && deferredBefore<=0) return toast('当前没有新的消息，也没有待补录楼层。');
    if(usingPaidProvider&&!force&&activeHistoryCatchupV01146(mem)){
        return toast('历史补总结尚未完成。请手动点击按钮继续每批最多30条；历史完成后才恢复每10条自动总结。','warning');
    }

    BUSY = true;
    try {
        // Establish the per-chat anchor before the first model request so the
        // summarizer receives a stable origin and cannot substitute a later
        // current-scene date. The anchor remains editable until the first batch
        // is successfully committed.
        const startInit = autoInitializeStoryStartV01128(mem);
        if (startInit.changed) {
            await saveMeta();
            refresh();
        }

        let backfill=null;
        if(localSummaryModeV01129()&&deferredBefore>0){
            backfill=await backfillDeferredLocalV01133({save:true});
            refresh();
        }

        let pos = start;
        const storedHistoryState=historyCatchupStateV01146(mem);
        if(storedHistoryState?.status==='active'&&pos>Number(storedHistoryState.target_index)){
            completeHistoryCatchupV01146(mem);
            await saveMeta();
        }
        let historyState=activeHistoryCatchupV01146(mem);
        if(usingPaidProvider&&force&&!historyCatchupStateV01146(mem)){
            historyState=beginHistoryCatchupV01146(mem,start,chat.length);
            if(historyState) await saveMeta();
        }

        // The historical target is a per-chat snapshot. New messages arriving
        // during catch-up are excluded and enter the later 10-message routine.
        const configuredBatch=Math.max(4,Number(s.batchMessages)||30);
        const historyCatchup=usingPaidProvider&&force&&!!historyState&&historyState.status==='active'&&pos<=Number(historyState.target_index);
        const historyBatchSize=Math.max(1,Number(s.historyBatchMessagesV01148)||30);
        const paidRoutineBatch=Math.max(1,Number(s.autoBatchMessagesV01145)||10);
        const batch=historyCatchup?historyBatchSize:(usingPaidProvider?paidRoutineBatch:configuredBatch);
        let historyRemainingAfter=null;
        let historyCompletedNow=false;
        while (pos < chat.length) {
            const historyTarget=historyCatchup?Number(historyState.target_index):null;
            const end = historyCatchup
                ? Math.min(chat.length,historyTarget+1,pos+batch)
                : Math.min(chat.length,pos+batch);
            const remainingBefore=historyCatchup?Math.max(0,historyTarget-pos+1):null;
            SMM_ACTIVE_HISTORY_BATCH_V01146=historyCatchup?{
                historicalBatch:true,start:pos,end,count:end-pos,remainingBefore,confirmed:false
            }:null;
            try{
                await summarizeRangeConfiguredV01129(pos, end);
            }finally{
                SMM_ACTIVE_HISTORY_BATCH_V01146=null;
            }
            pos = end;
            if(historyCatchup){
                historyState.next_index=end;
                historyRemainingAfter=Math.max(0,historyTarget-end+1);
                if(historyRemainingAfter===0){
                    historyCompletedNow=completeHistoryCatchupV01146(mem);
                }
                await saveMeta();
            }
            refresh();
            if (!force || usingPaidProvider) break;
        }
        try {
            await autoHideSummarizedV0101();
        } catch (hideError) {
            console.error('[StoryMemory] auto hide failed', hideError);
            toast('总结已完成，但自动隐藏失败：' + (hideError?.message || hideError), 'warning');
        }

        if(backfill){
            toast(`剧情记忆已更新（0 API）：旧楼层新增 ${backfill.added} 条时间线，仍待人工/AI ${backfill.remaining} 楼。`,'success');
        }else{
            toast(localSummaryModeV01129()?'剧情记忆已更新（0 API）。':(
                historyCatchup
                    ? (historyCompletedNow
                        ? '历史待处理范围已全部总结完成；后续新增剧情每10条自动总结。'
                        : `本批历史总结成功；历史范围还剩 ${historyRemainingAfter} 条，请再次手动点击继续。`)
                    : '剧情记忆已更新（AI）。'
            ),'success');
        }
    } catch(e) {
        console.error('[StoryMemory] summarize failed', e);
        toast(`总结失败：${e.message || e}`,'error');
    } finally {
        BUSY = false;
        refreshNative();
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
    m.npcs = obj.npcs && typeof obj.npcs === 'object' && !Array.isArray(obj.npcs) ? obj.npcs : {};
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
        timeline:(m.timeline||[]).filter(x=>!x?.__coverage_only_v01110).length,
        deferred:localDeferredCountV01133(m),
        events:(m.events||[]).length,
        loops:(m.open_loops||[]).length,
        conflicts:(m.conflicts||[]).length + (m.quarantined||[]).length
    };
}

function panelHTML() {
    return `<div id="${PANEL_ID}" class="smm2-hidden">
      <div class="smm2-card">
        <div class="smm2-head"><div class="smm105-title-wrap"><b>剧情自动记忆</b><span class="smm105-version-badge">v0.11.48</span></div><button id="smm2_close">×</button></div>
        <div id="smm2_stats" class="smm2-stats"></div>
        <div class="smm2-grid">
          <button id="smm2_new">总结新增</button>
          <button id="smm136_requeue">撤销错误 0 API 记录并重新排队</button>
          <button id="smm133_backfill">补录已跳过楼层（0 API）</button>
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
        <label>总结方式
          <select id="smm2_mode">
            <option value="ai">AI 语义总结（推荐）</option>
            <option value="local">0 API 规则抽取（实验）</option>
          </select>
        </label>
        <label>每 <input id="smm2_trigger" type="number" min="1" max="50"> 条新消息总结一次</label>
        <label>每批最多 <input id="smm2_batch" type="number" min="4" max="60"> 条消息</label>
        <label>剧情起点（首次自动建立；识别错误可确认修正）<input id="smm2_start" type="text" placeholder="如 2003-10（具体日期未知）"></label>
        <div class="smm2-note">只知道月份时填写 YYYY-MM，例如 2003-10；SMM 会显示“具体日期未明确”，不会补成某一天。修正只作用于当前聊天，不清空记忆、不重总结、不调用 API，也不修改原始 JSONL。</div>
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

// =========================================================
// v0.11.32: partial calendar precision.
// A known month is not an unknown date, but it is also not permission to invent
// a day.  Store the month separately so all existing exact-date code remains
// strict and cannot silently turn 2003-10 into 2003-10-01.
// =========================================================
const STORY_START_MONTH_LABEL_V01132 = '本聊天剧情正式起点（具体日期未明确）';

function normalizeMonthInputV01132(value) {
    const text=String(value||'').trim();
    if(!text) return null;
    const m=text.match(/(?:^|[^0-9])((?:18|19|20|21)\d{2})\s*(?:[-\/.年])\s*(\d{1,2})(?:\s*月)?(?=$|[^0-9])/);
    if(!m) return null;
    const month=Number(m[2]);
    if(month<1||month>12) return null;
    return {
        y:Number(m[1]),m:month,
        key:`${m[1]}-${String(month).padStart(2,'0')}`,
        label:`${m[1]}年${month}月（具体日期未明确）`
    };
}

function storyStartDescriptorV01132(value) {
    const raw=String(value||'').trim();
    if(!raw) return {raw,precision:'unknown',date:null,month:null};
    const exact=isoDateFromAny(raw);
    if(exact) return {raw,precision:'day',date:exact,month:exact.slice(0,7)};
    const month=normalizeMonthInputV01132(raw);
    if(month) return {raw,precision:'month',date:null,month:month.key,label:month.label};
    return {raw,precision:'unknown',date:null,month:null};
}

function normalizeStoryStartValueV01132(value) {
    const raw=String(value||'').trim();
    if(!raw) return '';
    const descriptor=storyStartDescriptorV01132(raw);
    const tail=raw.match(/\s+\/\s+(.+)$/)?.[1]?.trim()||'';
    if(descriptor.precision==='day'){
        return `${descriptor.date} / ${tail||AUTO_STORY_START_LABEL_V01128}`;
    }
    if(descriptor.precision==='month'){
        return `${descriptor.month} / ${tail||STORY_START_MONTH_LABEL_V01132}`;
    }
    return raw;
}

function timelineMonthHintV01132(item) {
    const precision=String(item?.date_precision||'').trim().toLowerCase();
    if(precision&&precision!=='month') return null;
    return normalizeMonthInputV01132(item?.date_hint||'');
}

function timelineDateGroupV01132(item) {
    const exact=normalizeDateInput(item?.date||'');
    if(exact){
        return {
            precision:'day',key:exact.iso,label:exact.cn,
            y:exact.y,m:exact.m,d:exact.d,minutes:parseClockMinutes(item?.time||'')
        };
    }
    const month=timelineMonthHintV01132(item);
    if(month){
        return {
            precision:'month',key:`__month__${month.key}`,label:month.label,
            y:month.y,m:month.m,d:1,minutes:parseClockMinutes(item?.time||'')
        };
    }
    const legacy=storyDateParts(item);
    return legacy?{...legacy,precision:'day'}:null;
}

function stripUnverifiedWeekdayV01132(value) {
    return String(value||'')
        .replace(/(^|\s)周[日一二三四五六天](?=\s|$|[，,。；;])/g,'$1')
        .replace(/\s{2,}/g,' ')
        .trim();
}

function setTimelineMonthPrecisionV01132(item,monthValue,options={}) {
    if(!item||typeof item!=='object') return false;
    const month=normalizeMonthInputV01132(monthValue);
    if(!month) return false;
    let changed=false;
    const set=(key,value)=>{if(item[key]!==value){item[key]=value;changed=true;}};
    set('date',null);
    set('date_hint',month.key);
    set('date_precision','month');
    set('date_evidence',options.evidence||'month_only');
    set('date_evidence_label',options.label||'月份已知·日期未明确');
    set('date_evidence_reason',options.reason||'只确认到月份；禁止推算具体日期');
    const time=stripUnverifiedWeekdayV01132(item.time);
    if(String(item.time||'').trim()!==time){item.time=time||null;changed=true;}
    return changed;
}

function clearTimelineMonthPrecisionV01132(item) {
    if(!item||typeof item!=='object') return false;
    let changed=false;
    for(const key of ['date_hint','date_precision']){
        if(Object.hasOwn(item,key)){delete item[key];changed=true;}
    }
    return changed;
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

function correctStoryStartV01132(mem=M(),proposedValue='') {
    const before=String(mem?.story_start||'').trim();
    const normalized=normalizeStoryStartValueV01132(proposedValue);
    if(!normalized) return {ok:false,changed:false,reason:'empty'};
    if(normalized===before) return {ok:true,changed:false,anchor:normalized,rows_relabelled:0};

    const beforeInfo=storyStartDescriptorV01132(before);
    const nextInfo=storyStartDescriptorV01132(normalized);
    const timeline=Array.isArray(mem?.timeline)?mem.timeline:[];
    const chat=C().chat||[];
    const cap=Math.min(chat.length-1,Math.max(-1,Number(mem?.last_processed_index??chat.length-1)));
    const rows=timeline.map((e,pos)=>({
        e,pos,first:sourceFirst(e?.source),last:sourceLast(e?.source)
    })).filter(x=>x.first>=0&&x.first<=cap)
      .sort((a,b)=>(a.first-b.first)||(a.last-b.last)||(a.pos-b.pos));

    const evidenceRows=rows.map(row=>{
        const evidence=narrativeEvidenceForRowV01130(row.e,mem);
        const directDate=normalizeDateInput(evidence?.primary?.date||'')?.iso||null;
        return {...row,directDate};
    });
    const firstDirectSource=evidenceRows.find(x=>x.directDate)?.first??Number.MAX_SAFE_INTEGER;
    let rowsRelabelled=0;

    mem.story_start=normalized;
    if(nextInfo.precision==='month'){
        for(const row of evidenceRows){
            if(row.directDate){
                if(clearTimelineMonthPrecisionV01132(row.e)) rowsRelabelled++;
                continue;
            }
            if(row.first>=firstDirectSource) continue;
            if(setTimelineMonthPrecisionV01132(row.e,nextInfo.month,{
                evidence:'manual_story_start_month',
                label:'剧情起点月份',
                reason:'用户修正剧情起点：月份已知，具体日期未明确'
            })){
                row.e.calendar_axis='narrative';
                row.e.calendar_segment=0;
                rowsRelabelled++;
            }
        }
    }else if(nextInfo.precision==='day'){
        for(const row of evidenceRows){
            if(row.directDate||row.first>=firstDirectSource) continue;
            const old=normalizeDateInput(row.e.date||'')?.iso||null;
            if(old!==nextInfo.date){row.e.date=nextInfo.date;rowsRelabelled++;}
            clearTimelineMonthPrecisionV01132(row.e);
            row.e.calendar_axis='narrative';
            row.e.calendar_segment=0;
            row.e.date_evidence='manual_story_start_day';
            row.e.date_evidence_label='人工修正剧情起点';
            row.e.date_evidence_reason='用户明确指定了剧情开场日期';
        }
    }

    // A copied/incorrect start can also leave a parallel reality clock behind.
    // Remove it only when this chat itself contains no reality-axis evidence.
    const reality=realityAxisStateV01129(cap);
    let staleRealityCleared=false;
    if(!reality.found){
        if(mem.current_reality_date||mem.current_reality_time) staleRealityCleared=true;
        mem.current_reality_date=null;
        mem.current_reality_time=null;
        for(const row of timeline){
            for(const key of ['reality_date','reality_time']){
                if(Object.hasOwn(row,key)){delete row[key];staleRealityCleared=true;}
            }
        }
    }

    delete mem.narrative_calendar_v01130;
    const repaired=repairNarrativeCalendarV01130(mem,cap);
    const latestDate=latestTimelineDateBySource(mem);
    const currentDate=normalizeDateInput(mem?.current_story_date||'')?.iso||null;
    if(latestDate&&beforeInfo.month&&currentDate?.slice(0,7)===beforeInfo.month){
        mem.current_story_date=latestDate;
    }
    resolveCurrentNarrativeStateV01130(mem,cap);
    restoreMissingCurrentLocationV01129(mem,cap);

    mem.audit=Array.isArray(mem.audit)?mem.audit:[];
    mem.audit.push({
        at:new Date().toISOString(),type:'story_start_corrected_v01132',
        before:before||null,after:normalized,
        precision:nextInfo.precision,rows_relabelled:rowsRelabelled,
        stale_reality_cleared:staleRealityCleared,
        api_calls:0,processed_to:Number(mem.last_processed_index??-1)
    });
    if(mem.audit.length>50) mem.audit=mem.audit.slice(-50);
    return {
        ok:true,changed:true,anchor:normalized,precision:nextInfo.precision,
        rows_relabelled:rowsRelabelled,stale_reality_cleared:staleRealityCleared,
        repaired
    };
}

async function commitStoryStartInputV01132(input,refreshView=refreshNative) {
    if(HISTORY_RUNNING||BUSY){
        toast('请等待当前总结或重建结束后再修正剧情起点。','warning');
        input.value=M().story_start||'';
        return;
    }
    const proposed=normalizeStoryStartValueV01132(input?.value||'');
    const mem=M();
    const existing=String(mem.story_start||'').trim();
    if(!proposed){
        toast('已处理过的聊天不能把剧情起点清空。日期不明确时可填写月份，例如 2003-10。','warning');
        input.value=existing;
        return;
    }
    if(proposed===existing){input.value=existing;return;}

    if(existing&&Number(mem.last_processed_index??-1)>=0){
        const accepted=globalThis.confirm?.(
            `确认修正当前聊天的剧情起点？\n\n原起点：${existing}\n新起点：${proposed}\n\n`+
            '只会修正 SMM 的时间元数据；保留已有事件、人物、关系、处理进度和原始聊天，也不会调用 API。'
        );
        if(!accepted){input.value=existing;return;}
    }

    const result=correctStoryStartV01132(mem,proposed);
    if(!result.ok){input.value=existing;return;}
    await saveMeta();
    refresh();
    refreshNative();
    if(typeof refreshView==='function') refreshView();
    toast(
        `剧情起点已修正为 ${result.anchor}；${result.rows_relabelled} 条开场时间线已按真实精度重标（0 API）。`,
        'success'
    );
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
            const p = timelineDateGroupV01132(item);
            const sortKey = p
                ? Date.UTC(p.y, p.m - 1, p.d, Math.floor(p.minutes/60), p.minutes%60)
                : Number.MAX_SAFE_INTEGER;
            const sourceKey=sourceFirst(item?.source);
            return { item, index, known: !!p, sortKey, sourceKey };
        })
        .sort((a,b) => {
            // v0.11.30: narrative chronology follows source order across dated
            // scenario/calendar switches.  Fall back to ISO time only for old
            // rows that have no usable source.
            const as=Number.isFinite(a.sourceKey)&&a.sourceKey!==Number.MAX_SAFE_INTEGER;
            const bs=Number.isFinite(b.sourceKey)&&b.sourceKey!==Number.MAX_SAFE_INTEGER;
            if(as&&bs&&a.sourceKey!==b.sourceKey) return a.sourceKey-b.sourceKey;
            if(as!==bs) return as?-1:1;
            if (a.known && b.known) return a.sortKey - b.sortKey || a.index - b.index;
            if (a.known !== b.known) return a.known ? -1 : 1;
            return a.index - b.index;
        })
        .map(x => x.item);
}

function groupTimelineByDay(items) {
    const sorted = chronologicalCopy((items||[]).filter(x=>!x?.__coverage_only_v01110));
    const groups = [];

    for (const item of sorted) {
        const p = timelineDateGroupV01132(item);
        const key = p?.key || '__unknown__';
        const segment=Number(item?.calendar_segment||0);
        let g=groups.at(-1);
        if (!g || g.key!==key || g.segment!==segment) {
            g = {
                key,
                label: p?.label || '日期未确定',
                segment,
                items: []
            };
            groups.push(g);
        }
        g.items.push(item);
    }
    return groups;
}

function dailyTimelineHTML(items) {
    const groups = groupTimelineByDay(items);
    if (!groups.length) return '<div class="smm2-empty">暂无时间线</div>';

    return groups.slice(-30).map(g => {
        const rows = g.items.map(x => {
            const t = esc(displayTimelineTimeLocalV0119(x));
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
    const start = isoDateFromAny(m.story_start);
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

function currentUserCanonicalNameV01114() {
    const c = C();
    const direct = String(c?.name1 || c?.userName || '').trim();
    if (direct && !/^(user|用户|主角|玩家|你|您|\{\{user\}\})$/i.test(direct)) return direct;
    const chat = c?.chat || [];
    for (let i = chat.length - 1; i >= 0; i--) {
        if (!chat[i]?.is_user) continue;
        const n = String(chat[i]?.name || '').trim();
        if (n && !/^(user|用户|主角|玩家|你|您|\{\{user\}\})$/i.test(n)) return n;
    }
    return direct || '';
}

function isGenericUserEntityV01115(value) {
    return /^(user|用户|主角|玩家|你|您|\{\{user\}\}|<user>)$/i.test(String(value || '').trim());
}

function isObviousGroupEntityV01115(value) {
    const s=String(value||'').trim();
    if(!s) return false;
    return /(?:五人|四人|三人|两人|众人|全员|成员们|兄弟会成员|Kappa\s*Sigma\s*(?:五人|成员|全员)|KΣ\s*(?:五人|成员|全员))$/i.test(s);
}

function entityAliasMapV01115(mem=M()) {
    const map=new Map();
    const user=currentUserCanonicalNameV01114();
    if(user){
        for(const x of ['User','user','用户','主角','玩家','你','您','{{user}}','<user>']) map.set(x,user);
        map.set(user,user);
    }
    const chars=mem?.characters && typeof mem.characters==='object' && !Array.isArray(mem.characters) ? mem.characters : {};
    const fullByShort=new Map();
    for(const name of Object.keys(chars)){
        const raw=String(name||'').trim();
        if(!raw || isGenericUserEntityV01115(raw) || isObviousGroupEntityV01115(raw)) continue;
        map.set(raw,raw);
        if(raw.includes('·')){
            const short=raw.split('·')[0].trim();
            if(short){
                if(!fullByShort.has(short)) fullByShort.set(short,[]);
                fullByShort.get(short).push(raw);
            }
        }
        const row=chars[name];
        const aliases=Array.isArray(row?.aliases) ? row.aliases : (typeof row?.aliases==='string' ? row.aliases.split(/[\/、,，]/) : []);
        for(const a of aliases.map(x=>String(x||'').trim()).filter(Boolean)) map.set(a,raw);
    }
    // Only infer short->full when exactly one existing full-name entity owns that short name.
    for(const [short,arr] of fullByShort){
        const uniq=[...new Set(arr)];
        if(uniq.length===1) map.set(short,uniq[0]);
    }
    // Generic user aliases must always win over accidental character rows named “你/用户”.
    if(user) for(const x of ['User','user','用户','主角','玩家','你','您','{{user}}','<user>']) map.set(x,user);
    return map;
}

function canonicalPersonName(name) {
    const raw = String(name || '').trim();
    if (!raw) return '未命名人物';
    const user=currentUserCanonicalNameV01114();
    if (isGenericUserEntityV01115(raw)) return user || raw;
    try {
        const mapped=entityAliasMapV01115(M()).get(raw);
        if(mapped) return mapped;
    } catch {}
    return raw;
}

function escapeRegExpV01115(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }

function normalizeEntityAliasTextV01115(value, aliasMap=entityAliasMapV01115(M())) {
    let s=String(value??'');
    const user=currentUserCanonicalNameV01114();
    if(user){
        s=s.replace(/\{\{\s*user\s*\}\}/gi,user)
           .replace(/<\s*user\s*>/gi,user)
           .replace(/\bUser\b/g,user)
           .replace(/用户/g,user)
           .replace(/主角/g,user)
           .replace(/玩家/g,user);
        // Do NOT globally rewrite the pronoun “你/您” in prose: it may occur inside quoted dialogue.
        // Exact entity fields named 你/您 are normalized by canonicalPersonName().
    }
    const aliases=[...aliasMap.entries()]
        .filter(([a,c])=>a&&c&&a!==c&&!isGenericUserEntityV01115(a))
        .sort((a,b)=>b[0].length-a[0].length);
    for(const [alias,canon] of aliases){
        // Avoid expanding an already canonical Chinese transliterated full name twice.
        const suffix=canon.startsWith(alias+'·') ? '(?!·)' : '';
        const re=new RegExp(escapeRegExpV01115(alias)+suffix,'g');
        s=s.replace(re,canon);
    }
    return s;
}

function normalizeUserAliasTextV01114(value) {
    return normalizeEntityAliasTextV01115(value, entityAliasMapV01115(M()));
}

function mergeCharacterStateV01115(canonicalRow, aliasRow){
    const a=canonicalRow && typeof canonicalRow==='object' && !Array.isArray(canonicalRow) ? canonicalRow : {};
    const b=aliasRow && typeof aliasRow==='object' && !Array.isArray(aliasRow) ? aliasRow : {};
    const out={...a};
    for(const [k,v] of Object.entries(b)){
        if(k==='aliases') continue;
        const cur=out[k];
        if(cur===undefined || cur===null || String(cur).trim()==='') out[k]=v;
        else if(Array.isArray(cur) && Array.isArray(v)) out[k]=[...new Set([...cur,...v])];
        else if(cur && v && typeof cur==='object' && typeof v==='object' && !Array.isArray(cur) && !Array.isArray(v)) out[k]={...v,...cur};
        // Conflict: canonical entity row wins. Do not let a stale short-name duplicate overwrite it.
    }
    return out;
}

function normalizeStoryEntitiesV01114(mem=M()) {
    const canonUser=currentUserCanonicalNameV01114();
    const aliasMap=entityAliasMapV01115(mem);
    let changed=0, mergedCharacters=0, removedGroups=0, relationEndpoints=0, textFixes=0;
    const norm=(v)=>{
        if(typeof v!=='string') return v;
        const n=normalizeEntityAliasTextV01115(v,aliasMap);
        if(n!==v){changed++;textFixes++;}
        return n;
    };
    const person=(v)=>{
        const raw=String(v||'').trim(); if(!raw) return raw;
        let n=isGenericUserEntityV01115(raw) ? (canonUser||raw) : (aliasMap.get(raw)||raw);
        if(n!==raw){changed++;relationEndpoints++;}
        return n;
    };
    const normDeep=(value)=>{
        if(typeof value==='string') return norm(value);
        if(Array.isArray(value)) return value.map(normDeep);
        if(value && typeof value==='object'){
            for(const [k,v] of Object.entries(value)){
                if(['source','id','date','time','created_at','updated_at','closed_at_story_date','closed_at_story_time'].includes(k)) continue;
                value[k]=normDeep(v);
            }
        }
        return value;
    };

    // First merge character keys using a deterministic alias map. Full-name/canonical rows win conflicts.
    if(mem.characters && typeof mem.characters==='object' && !Array.isArray(mem.characters)){
        const old=mem.characters, out={};
        const entries=Object.entries(old).sort(([a],[b])=>{
            const aa=aliasMap.get(a)||a, bb=aliasMap.get(b)||b;
            const aCanon=a===aa?0:1, bCanon=b===bb?0:1;
            return aCanon-bCanon;
        });
        for(const [name,row] of entries){
            if(isObviousGroupEntityV01115(name)){ removedGroups++; changed++; continue; }
            const key=person(name)||name;
            const existing=out[key];
            if(existing){ out[key]=mergeCharacterStateV01115(existing,row); mergedCharacters++; changed++; }
            else out[key]=row && typeof row==='object' && !Array.isArray(row) ? {...row} : row;
        }
        mem.characters=out;
    }

    // v0.11.18: historical memories may contain mixed legacy shapes (string + object).
    // Never assign object properties onto primitive strings; normalize them in-place instead.
    if(Array.isArray(mem.timeline)) for(let i=0;i<mem.timeline.length;i++){
        const e=mem.timeline[i];
        if(typeof e==='string'){ mem.timeline[i]={event:norm(e),source:null}; changed++; continue; }
        if(e && typeof e==='object') e.event=norm(e.event);
    }
    if(Array.isArray(mem.facts)) for(let i=0;i<mem.facts.length;i++){
        const f=mem.facts[i];
        if(typeof f==='string'){ mem.facts[i]=norm(f); continue; }
        if(f && typeof f==='object'){
            if(typeof f.fact==='string') f.fact=norm(f.fact);
            else if(typeof f.text==='string') f.text=norm(f.text);
            else if(typeof f.description==='string') f.description=norm(f.description);
        }
    }
    if(Array.isArray(mem.events)) for(let i=0;i<mem.events.length;i++){
        const e=mem.events[i];
        if(typeof e==='string'){ mem.events[i]=norm(e); continue; }
        if(e && typeof e==='object') for(const k of ['title','event','description','summary','result']) if(typeof e[k]==='string') e[k]=norm(e[k]);
    }
    if(Array.isArray(mem.relationships)) for(let i=0;i<mem.relationships.length;i++){
        const r=mem.relationships[i];
        if(typeof r==='string'){ mem.relationships[i]=norm(r); continue; }
        if(!r || typeof r!=='object') continue;
        if(Array.isArray(r.people)) r.people=[...new Set(r.people.map(person).filter(Boolean))];
        if(Array.isArray(r.pair)) r.pair=[...new Set(r.pair.map(person).filter(Boolean))];
        for(const k of ['state','change','description']) if(typeof r[k]==='string') r[k]=norm(r[k]);
    }
    if(Array.isArray(mem.open_loops)) for(let i=0;i<mem.open_loops.length;i++){
        const x=mem.open_loops[i];
        if(typeof x==='string'){ mem.open_loops[i]=norm(x); continue; }
        if(!x || typeof x!=='object') continue;
        for(const k of ['description','title','due']) if(typeof x[k]==='string') x[k]=norm(x[k]);
        for(const k of ['character','person','owner']) if(typeof x[k]==='string') x[k]=person(x[k]);
    }
    for(const key of ['semantic_anchors','active_arcs','items','locations']){
        const arr=mem[key];
        if(!Array.isArray(arr)) continue;
        for(let i=0;i<arr.length;i++){
            if(typeof arr[i]==='string') arr[i]=norm(arr[i]);
            else if(arr[i] && typeof arr[i]==='object') normDeep(arr[i]);
        }
    }
    if(Array.isArray(mem.character_anchors)) for(let i=0;i<mem.character_anchors.length;i++){
        const x=mem.character_anchors[i];
        if(typeof x==='string'){ mem.character_anchors[i]=norm(x); continue; }
        if(!x || typeof x!=='object') continue;
        if(typeof x.character==='string') x.character=person(x.character);
        if(typeof x.name==='string') x.name=person(x.name);
        for(const k of ['anchor','description','behavior','speech']) if(typeof x[k]==='string') x[k]=norm(x[k]);
    }
    if(mem.current_scene && typeof mem.current_scene==='object'){
        for(const [k,v] of Object.entries(mem.current_scene)){
            if(typeof v==='string') mem.current_scene[k]=norm(v);
            else if(Array.isArray(v)) mem.current_scene[k]=v.map(x=>typeof x==='string'?(aliasMap.get(x)||x):x);
        }
    } else if(typeof mem.current_scene==='string') mem.current_scene=norm(mem.current_scene);

    return {canonical_user:canonUser||null, changed, text_fixes:textFixes, merged_characters:mergedCharacters, removed_group_character_rows:removedGroups, canonicalized_entity_fields:relationEndpoints, aliases:[...aliasMap.entries()].filter(([a,c])=>a!==c)};
}

function timelineTextKeyV01114(text) {
    return normalizeUserAliasTextV01114(text)
        .toLowerCase()
        .replace(/[\s\p{P}\p{S}]+/gu,'')
        .replace(/(?:秋季学期|春季学期|本轮|随后|之后|接着|同时|最终|当前)/g,'');
}
function timelineBigramsV01114(text) {
    const s=timelineTextKeyV01114(text); const set=new Set();
    for(let i=0;i<s.length-1;i++) set.add(s.slice(i,i+2));
    return set;
}
function timelineDiceV01114(a,b) {
    const A=timelineBigramsV01114(a), B=timelineBigramsV01114(b);
    if(!A.size||!B.size) return 0;
    let hit=0; for(const x of A) if(B.has(x)) hit++;
    return 2*hit/(A.size+B.size);
}
function timelineClockMinutesV01114(v) {
    const m=String(v||'').match(/(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)/);
    return m ? Number(m[1])*60+Number(m[2]) : null;
}
function timelineSourceBoundsV01114(src) {
    const xs=sourceIndexes(src).sort((a,b)=>a-b);
    return xs.length ? {first:xs[0],last:xs[xs.length-1],xs} : null;
}
function timelineLikelyDuplicateV01114(a,b) {
    if (!a?.event || !b?.event) return false;
    const da=normalizeDateInput(a.date)?.iso||'', db=normalizeDateInput(b.date)?.iso||'';
    if (da && db && da!==db) return false;
    const sa=timelineSourceBoundsV01114(a.source), sb=timelineSourceBoundsV01114(b.source);
    if (!sa || !sb) return false;
    const gap=Math.max(0, Math.max(sa.first,sb.first)-Math.min(sa.last,sb.last)-1);
    if (gap>12) return false;
    const ta=timelineClockMinutesV01114(a.time), tb=timelineClockMinutesV01114(b.time);
    if (ta!=null && tb!=null && Math.abs(ta-tb)>25) return false;
    const A=timelineTextKeyV01114(a.event), B=timelineTextKeyV01114(b.event);
    if (A.length>=10 && B.length>=10 && (A.includes(B) || B.includes(A))) return true;
    return timelineDiceV01114(A,B) >= 0.52;
}
function dedupeTimelineV01114(mem=M()) {
    const input=Array.isArray(mem.timeline)?mem.timeline:[];
    const cleaned=[]; let emptyRemoved=0, merged=0;
    for (const raw of input) {
        if (!raw) continue;
        const e={...raw,event:normalizeUserAliasTextV01114(String(raw.event||'')).trim()};
        if (!e.event || /^本轮未检测到可安全压缩的独立关键事件[。.]?$/.test(e.event)) { emptyRemoved++; continue; }
        let hit=-1;
        for(let j=Math.max(0,cleaned.length-8);j<cleaned.length;j++) {
            if (timelineLikelyDuplicateV01114(cleaned[j],e)) { hit=j; break; }
        }
        if (hit<0) { cleaned.push(e); continue; }
        const old=cleaned[hit];
        const preferNew=String(e.event).length>String(old.event||'').length;
        const keep=preferNew?{...e}:{...old};
        keep.source=mergeSources(old.source,e.source);
        if (!keep.location) keep.location=old.location||e.location||null;
        keep.__dedup_merged_v01114=true;
        cleaned[hit]=keep; merged++;
    }
    mem.timeline=cleaned;
    return {merged,empty_removed:emptyRemoved};
}
function qualityAuditV01114(mem=M()) {
    const tl=Array.isArray(mem.timeline)?mem.timeline:[];
    let genericAliases=0, invalidSources=0, empty=0, duplicateCandidates=0, genericCharacterKeys=0, aliasCharacterDuplicates=0, duplicateRelationshipPairs=0;
    for(let i=0;i<tl.length;i++) {
        const e=tl[i]; const text=String(e?.event||'');
        if(!text.trim()) empty++;
        if(/(?:\{\{\s*user\s*\}\}|\bUser\b|(^|[\s，。！？、：；])(?:用户|主角|玩家)(?=$|[\s，。！？、：；]))/i.test(text)) genericAliases++;
        if(!validRealSourceV0112(e?.source)) invalidSources++;
        for(let j=Math.max(0,i-5);j<i;j++) if(timelineLikelyDuplicateV01114(tl[j],e)){duplicateCandidates++;break;}
    }
    const aliasMap=entityAliasMapV01115(mem);
    const charKeys=Object.keys(mem.characters||{});
    const seenCanon=new Set();
    for(const name of charKeys){
        if(isGenericUserEntityV01115(name)) genericCharacterKeys++;
        const c=aliasMap.get(name)||name;
        if(seenCanon.has(c)) aliasCharacterDuplicates++; else seenCanon.add(c);
    }
    const relSeen=new Set();
    for(const r of (mem.relationships||[])){
        const people=(r?.people||r?.pair||[]).map(x=>aliasMap.get(String(x||'').trim())||String(x||'').trim()).filter(Boolean);
        if(people.length!==2) continue;
        const k=[...new Set(people)].sort((a,b)=>a.localeCompare(b,'zh-CN')).join(' ↔ ');
        if(relSeen.has(k)) duplicateRelationshipPairs++; else relSeen.add(k);
    }
    return {timeline:tl.length,generic_aliases:genericAliases,invalid_sources:invalidSources,empty_events:empty,duplicate_candidates:duplicateCandidates,time_backtracks:countStoredTimeBacktracks(tl),generic_character_keys:genericCharacterKeys,alias_character_duplicates:aliasCharacterDuplicates,duplicate_relationship_pairs:duplicateRelationshipPairs};
}
function unifiedPostProcessV01114(mem=M(), options={}) {
    const entities=normalizeStoryEntitiesV01114(mem);
    normalizeRelationshipsV085(mem);
    normalizeCharactersV085(mem);
    const entitiesSecondPass=normalizeStoryEntitiesV01114(mem);
    normalizeRelationshipsV085(mem);
    normalizeCharactersV085(mem);
    const dedup=dedupeTimelineV01114(mem);
    const audit=qualityAuditV01114(mem);
    entities.second_pass_changed=entitiesSecondPass.changed;
    entities.changed+=entitiesSecondPass.changed;
    entities.merged_characters+=(entitiesSecondPass.merged_characters||0);
    if(options.audit!==false){
        mem.audit=Array.isArray(mem.audit)?mem.audit:[];
        mem.audit.push({at:new Date().toISOString(),type:'unified_postprocess_v01114',range:options.range||null,entities,dedup,quality:audit});
        if(mem.audit.length>50) mem.audit=mem.audit.slice(-50);
    }
    return {entities,dedup,quality:audit};
}

async function runUnifiedPostProcessV01114(){
    const status=document.getElementById('smm112_gap_status');
    if(BUSY||HISTORY_RUNNING||GAP_REPAIR_RUNNING_V0112){
        if(status) status.textContent='统一实体整理未启动：当前已有总结/重建任务在运行。';
        return toast('当前已有总结/重建任务在运行。','warning');
    }
    BUSY=true;
    try {
        if(status) status.textContent='v0.11.18 正在执行：实体统一 / 关系去重 / timeline 去重 / 质量审计（0 API）…';
        toast('开始执行实体与关系整理（0 API）…','info');
        const mem=M();
        if(!mem || typeof mem!=='object') throw new Error('当前记忆对象不可用');
        const before=qualityAuditV01114(mem);
        const result=unifiedPostProcessV01114(mem,{audit:true});
        await saveMeta();
        refresh();
        refreshNative();
        const q=result.quality;
        toast(`统一整理完成：实体修正 ${result.entities.changed} 处（人物别名合并 ${result.entities.merged_characters||0}），合并重复 timeline ${result.dedup.merged} 条，移除空事件 ${result.dedup.empty_removed} 条。`,'success');
        const latestStatus=document.getElementById('smm112_gap_status');
        if(latestStatus) latestStatus.textContent=`v0.11.18 质量审计：timeline ${q.timeline}；主角泛称残留 ${q.generic_aliases}；人物泛称键 ${q.generic_character_keys}；人物别名重复 ${q.alias_character_duplicates}；重复关系对 ${q.duplicate_relationship_pairs}；非法 source ${q.invalid_sources}；空事件 ${q.empty_events}；疑似重复 ${q.duplicate_candidates}；时间倒退 ${q.time_backtracks}。`;
        return {before,...result};
    } catch(e) {
        console.error('[StoryMemory] v0.11.18 unified entity cleanup failed',e);
        const latestStatus=document.getElementById('smm112_gap_status');
        if(latestStatus) latestStatus.textContent='统一实体整理失败：'+(e?.message||e);
        toast('统一实体整理失败：'+(e?.message||e),'error');
        return null;
    } finally {
        BUSY=false;
    }
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
            <option value="npc">NPC</option>
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
        out.push({type:'timeline', label:`${p?.label || x.date || '日期未定'} ${displayTimelineTimeLocalV0119(x) || ''}`, text:x.event || '', raw:x});
    }
    for (const g of mergedCharactersView()) {
        out.push({type:'character', label:g.name, text:JSON.stringify(g.states), raw:g});
    }
    for (const [name,npc] of Object.entries(m.npcs||{})) {
        out.push({type:'npc', label:name, text:JSON.stringify(npc), raw:npc});
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
        story_start: mem.story_start || null,
        current_story_date: mem.current_story_date || isoDateFromAny(mem.current_story_time) || null,
        current_story_time: mem.current_story_time || null,
        current_scene: mem.current_scene || {},
        last_processed_index: Number(mem.last_processed_index ?? -1),

        days: {},
        characters_v4: {},
        npcs_v4: cloneJSONV0112(mem.npcs || {}),
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
          ${day.events.map(e=>`<div class="smm2-day-row">${e.time?`<b>${esc(displayTimelineTimeLocalV0119(e))}</b>　`:''}${esc(e.event||'')}</div>`).join('')}
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
    const start=isoDateFromAny(mem.story_start);
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
        for(const e of day.events||[]) out.push({type:'timeline',label:`${day.date} ${displayTimelineTimeLocalV0119(e)||''}`,text:e.event||''});
    }
    for(const c of Object.values(m.characters_v4||{})){
        out.push({type:'character',label:c.name,text:JSON.stringify({profile:c.profile,current_state:c.current_state})});
    }
    for(const [name,npc] of Object.entries(m.npcs_v4||{})){
        out.push({type:'npc',label:name,text:`${npc?.identity||''} ${npc?.brief||''} ${npc?.current_status||''}`.trim()});
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
    // 查看模式不得修改或重新校准真实记忆。v0.11.30 also keeps
    // sequential calendar segments in source order (2026 opening -> 2003
    // scenario), rather than lexicographically sorting 2003 before 2026.
    const view = JSON.parse(JSON.stringify(mem || {}));
    const ordered=(view.timeline||[]).sort((a,b)=>{
        const sa=sourceFirst(a?.source),sb=sourceFirst(b?.source);
        if(sa!==sb) return sa-sb;
        return sourceLast(a?.source)-sourceLast(b?.source);
    });
    const groups=[];
    for (const e of ordered) {
        const dateGroup=timelineDateGroupV01132(e);
        const d = dateGroup?.precision==='month'
            ? dateGroup.label
            : (dateGroup?.key || '日期未定');
        const segment=Number(e?.calendar_segment||0);
        let group=groups.at(-1);
        if(!group||group.date!==d||group.segment!==segment){
            group={date:d,segment,events:[]};
            groups.push(group);
        }
        group.events.push(e);
    }
    return groups.map(group=>{
        const events=group.events.sort((a,b)=>{
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
        return {date:group.date,segment:group.segment,events};
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
    for(const [name,npc] of Object.entries(m.npcs||{})){
        out.push({type:'npc',label:name,text:`${npc?.identity||''} ${npc?.brief||''} ${npc?.current_status||''}`.trim()});
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
                ${esc(displayTimelineTimeLocalV0119(e)||'时间未定')}
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

function legacyNpcsHTML(mem=M()) {
    const rows=Object.entries(mem.npcs||{});
    if(!rows.length) return '<div class="smm2-empty">尚未识别需要长期保留的次要 NPC。</div>';
    return rows.sort((a,b)=>a[0].localeCompare(b[0],'zh-CN')).map(([name,npc])=>`
      <details class="smm2-person smm2-npc">
        <summary>${esc(name)}${npc?.identity?`｜${esc(npc.identity)}`:''}</summary>
        ${npc?.brief?`<div><b>简述：</b>${esc(npc.brief)}</div>`:''}
        ${npc?.current_status?`<div><b>当前状态：</b>${esc(npc.current_status)}</div>`:''}
        ${npc?.aliases?.length?`<div><b>别名：</b>${esc(npc.aliases.join(' / '))}</div>`:''}
        ${npc?.last_source||npc?.source?`<small>${esc(npc.last_source||npc.source)}</small>`:''}
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
          <div><b>已扫描：</b>${processed}/${total} 条</div>
          <div><b>已形成时间线：</b>${(mem.timeline||[]).filter(x=>!x?.__coverage_only_v01110).length} 条　<b>待补录：</b>${localDeferredCountV01133(mem)} 楼</div>
          <div><b>剧情起点：</b>${esc(mem.story_start||'未建立')}</div>
          <div><b>当前剧情日期：</b>${esc(date)}</div>
          <div><b>显示时间：</b>${esc(mem.current_story_time||'未建立')}</div>
          ${(mem.current_reality_date||mem.current_reality_time)?`<div><b>MVU现实时间轴：</b>${esc([mem.current_reality_date,mem.current_reality_time].filter(Boolean).join(' '))}</div>`:''}
          <div><b>当前地点：</b>${esc(mem.current_scene?.location||'未建立')}</div>
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
              <option value="npc">NPC</option>
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
          <summary>NPC（${Object.keys(mem.npcs||{}).length}）</summary>
          ${legacyNpcsHTML(mem)}
        </details>

        <details class="smm2-memory-details">
          <summary>人物关系（${(mem.relationships||[]).length}）</summary>
          ${legacyRelationshipsHTML(mem)}
        </details>

        <details open class="smm2-memory-details smm121-stage-group">
          <summary>阶段大总结（${(mem.stage_summaries||[]).length}）</summary>
          ${stageSummariesHTMLV01121(mem)}
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
          <div><b>剧情起点：</b>${esc(mem.story_start || '未建立')} <span class="smm2-lock">（可确认修正）</span></div>
          <div><b>当前剧情日期：</b>${esc(effectiveCurrentDate(mem) || '未建立')}</div>
          <div><b>显示时间：</b>${esc(mem.current_story_time || '未建立')}</div>
          <div><b>当前地点：</b>${esc(mem.current_scene?.location||'未建立')}</div>
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
              <option value="npc">NPC</option>
              <option value="relationship">人物关系</option>
            </select>
          </div>
          <div id="smm4_history_results"></div>
        </details>

        <details open class="smm2-memory-details smm121-stage-group">
          <summary>阶段大总结（${(mem.stage_summaries||[]).length}）</summary>
          ${stageSummariesHTMLV01121(mem)}
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
          <summary>NPC（${Object.keys(mem.npcs_v4||{}).length}）</summary>
          ${legacyNpcsHTML({npcs:mem.npcs_v4||{}})}
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
        story_start: M().story_start || null,
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
    m.story_start=String(anchor||'').trim() || null;
    // v0.11.21: a story may begin without an absolute date. Only a parseable
    // YYYY-MM-DD anchor is allowed to seed current_story_date.
    m.current_story_date=isoDateFromAny(anchor) || null;
    m.current_story_time=null;
    m.rebuild_target_date=currentDate || null;
    m.rebuild_mode='safe_v062';
    m.audit.push({at:new Date().toISOString(),type:'safe_rebuild_started',anchor:m.story_start,target_date:currentDate||null});
    return m;
}

async function safeHistoryRun({fresh=false}={}) {
    if (HISTORY_RUNNING || BUSY) return toast('当前有任务正在运行。若页面曾卡死，请刷新页面后再点“继续安全重建”。','warning');
    const c=C(), chat=c.chat||[];
    if (!chat.length) return toast('当前聊天为空。','warning');

    const existing=M();
    const anchor=String(existing.story_start || '').trim();
    const anchorDate=isoDateFromAny(anchor) || null;
    const target=existing.current_story_date || detectCurrentDateFromRecentChat()?.date || null;

    if (fresh) {
        if (!confirm(`将从第1条原始聊天重新开始安全重建。\\n剧情起点：${anchor||'本聊天剧情正式起点（日期未明确）'}\\n\\n现有记忆会备份，然后重新从0开始。继续吗？`)) return;
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
            const batch=Math.max(4,Number(S().batchMessages)||30);
            const end=Math.min(chat.length,start+batch);
            const mem=M();
            mem.rebuild_state={status:'running',next_index:start,current_range:[start+1,end],last_error:null,updated_at:new Date().toISOString()};
            await saveMeta();
            refresh(); refreshNative();

            const beforeDate=M().current_story_date;
            await summarizeRangeConfiguredV01129(start,end);
            const after=M().current_story_date;
            M().story_start=anchor;
            if (beforeDate && after && after < beforeDate) {
                M().quarantined.push({content:`批次 #${start+1}-#${end} 尝试将当前日期 ${beforeDate} 倒退为 ${after}`,
                    reason:'v0.6.0 单向时间守卫：当前主线日期禁止倒退',source:`#${start+1}-#${end}`});
                M().current_story_date=beforeDate;
            }
            if (anchorDate && M().current_story_date && M().current_story_date < anchorDate) M().current_story_date=anchorDate;

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
        <button id="smm136_native_requeue" class="menu_button">撤销错误 0 API 记录并重新排队</button>
        <button id="smm133_native_backfill" class="menu_button smm2-primary-tool">补录已跳过楼层（0 API）</button>
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
              <details class="smm2-tool-card">
                <summary>
                  <span class="smm2-tool-title">补总结缺失楼层</span>
                  <span class="smm2-tool-subtitle">只补时间线断档，不回退当前状态</span>
                </summary>
                <div class="smm2-tool-body">
                  <div class="smm2-note">
                    用于“已处理游标已越过，但时间线中间缺了一大段”的情况。输入时间线显示的 #楼层编号；不会修改原聊天。
                  </div>
                  <div class="smm2-fix-grid">
                    <label><span>起始 #</span><input id="smm112_gap_from" type="number" min="0" step="1" placeholder="1489"></label>
                    <div class="smm2-fix-arrow">→</div>
                    <label><span>结束 #</span><input id="smm112_gap_to" type="number" min="0" step="1" placeholder="1622"></label>
                  </div>
                  <button id="smm114_gap_code_repair" class="menu_button smm2-primary-tool">代码压缩重建这个范围（0 API）</button>
                  <button id="smm116_time_repair" class="menu_button">校准时间线日期/星期/时分（0 API）</button>
                  <button id="smm114_unified_post" class="menu_button">修复全部实体 / 关系去重 / 质量审计（0 API）</button>
                  <button id="smm113_needs_ai_repair" class="menu_button smm2-primary-tool">AI 仅补 needsAI（省 API）</button>
                  <button id="smm112_gap_repair" class="menu_button">API 补总结整个范围（高消耗）</button>
                  <div class="smm2-note">HYBRID：可靠结构化摘要优先；复杂楼层进入 needsAI。所有写入统一经过主角实体归一、source/时间校验与保守去重。可单独运行“修复全部实体 / 关系去重 / 质量审计（0 API）”，不会修改原聊天。</div>
                  <div id="smm112_gap_status" class="smm2-note"></div>
                </div>
              </details>
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

          <div class="smm138-mode-card">
            <div class="smm138-mode-head">
              <label class="smm138-mode-label" for="smm129_summary_mode">总结方式</label>
              <span id="smm138_mode_badge" class="smm138-mode-badge">AI 语义</span>
            </div>
            <select id="smm129_summary_mode">
              <option value="ai">AI 语义总结（推荐）</option>
              <option value="local">0 API 规则抽取（实验）</option>
            </select>
            <div id="smm129_mode_status" class="smm138-mode-help"></div>
          </div>

          <label class="smm107-switch-row">
            <input id="smm100_safe_inject" type="checkbox">
            <span><b>生成时注入剧情记忆</b><small>把可靠长期记忆提供给主聊天模型</small></span>
          </label>

          <details class="smm107-inline-details smm119-audit-details">
            <summary>检查本轮会注入给主模型的记忆</summary>
            <button id="smm119_refresh_injection_audit" class="menu_button smm119-refresh" type="button">刷新诊断</button>
            <div id="smm119_injection_audit" class="smm119-audit"></div>
          </details>

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
            <span class="smm2-tool-subtitle">AI 模式才使用这些设置</span>
          </summary>

          <div class="smm2-tool-body">
            <label>
              总结通道
              <select id="smm93_summary_provider">
                <option value="current">复用当前聊天模型（静默）</option>
                <option value="profile">独立 Connection Profile</option>
                <option value="external">直接外部 API（记忆宫殿兼容）</option>
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

            <div id="smm93_fallback_row" class="smm2-note">
              独立 Profile 任意失败时立即停止；不会自动重试或回退到其他模型，也不会推进游标。
            </div>

            <label id="smm93_tokens_row">
              独立 Profile 最大输出 Token
              <input id="smm93_summary_tokens" type="number" min="512" max="3072" step="256">
            </label>

            <div id="smm142_external_rows" class="smm143-external-api" style="display:none">
              <label>
                直接 API 地址
                <input id="smm142_external_url" type="text" placeholder="https://api.astroflowing.com/v1">
              </label>
              <label>
                API Key
                <input id="smm142_external_key" type="password" autocomplete="off" placeholder="sk-...">
              </label>
              <label>
                总结模型
                <select id="smm142_external_model">
                  <option value="">请先拉取模型</option>
                </select>
              </label>
              <button id="smm142_test_external" class="menu_button smm143-fetch-models">拉取模型（不发送总结）</button>
              <div id="smm142_external_status" class="smm2-note"></div>
              <div class="smm2-note">先填写地址与 Key，再拉取模型并从下拉框选择。拉取只读取 <code>/models</code>，不调用 Chat Completion。API Key 保存在当前 SillyTavern 浏览器设置中。</div>
            </div>

            <div id="smm93_summary_status" class="smm2-note"></div>
            <button id="smm141_unlock_profile" class="menu_button" style="display:none">
              手动解除独立 API 费用锁定
            </button>
            <div class="smm2-note">
              第一次手动总结会锁定安装时尚未处理的历史范围；以后每次手动点击最多处理 30 条，直到该范围全部完成。历史完成后，新增剧情固定每 10 条自动总结一次。每批发送前均显示准确估算并确认；任何失败都不会自动重试或推进游标。
            </div>
            <div class="smm2-note">
              费用保护已按用户要求全部关闭：不限制输入长度，失败后不锁定接口。初次使用仍须拉取并选择模型；一次点击仍只请求一次。
            </div>
          </div>
        </details>

        <details class="smm2-tool-card smm107-settings-card">
          <summary>
            <span class="smm2-tool-title">阶段大总结</span>
            <span class="smm2-tool-subtitle">把零散长期记忆压缩为章节级剧情阶段</span>
          </summary>
          <div class="smm2-tool-body">
            <div class="smm2-note">
              只读取当前 SMM 已确认的长期记忆，不重新扫描原始聊天，也不会修改 JSONL。0 API 模式会直接用已确认事实生成；AI 模式异常时使用本地保底。
            </div>
            <button id="smm121_build_stages" class="menu_button smm2-primary-tool">生成 / 更新阶段大总结</button>
            <div id="smm121_stage_status" class="smm2-note smm107-status-note"></div>
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
              非独立 API 每批最多消息数
              <input id="smm2_native_batch" type="number" min="4" max="60">
            </label>

            <label class="smm107-span-all">
              剧情起点（首次自动建立；识别错误可确认修正）
              <input id="smm2_native_start" type="text" placeholder="如 2003-10（具体日期未知）">
            </label>

            <div class="smm2-note smm107-span-all">
              只知道月份时填写 YYYY-MM，例如 2003-10；SMM 会保留“具体日期未明确”，不会补成某一天。已建立的错误起点也可在确认后安全修正：保留全部记忆和处理进度，0 API，不修改原聊天。
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
    const requeueBtn=q('smm136_native_requeue');
    if(requeueBtn) requeueBtn.onclick=runRequeueIncorrectLocalMemoryV01136;
    const deferredBackfillBtn=q('smm133_native_backfill');
    if(deferredBackfillBtn) deferredBackfillBtn.onclick=runDeferredBackfillV01133;
    const stageBuildBtn=q('smm121_build_stages');
    if(stageBuildBtn) stageBuildBtn.onclick=generateStageSummariesV01121;
    refreshStageSummaryStatusV01121();

    // v0.9.4：总结专用 Connection Profile UI
    const providerEl=q('smm93_summary_provider');
    const profileEl=q('smm93_summary_profile');
    const fallbackEl=q('smm93_summary_fallback');
    const tokensEl=q('smm93_summary_tokens');
    const createProfileEl=q('smm96_create_profile');
    const unlockProfileEl=q('smm141_unlock_profile');
    const externalRows=q('smm142_external_rows');
    const externalUrlEl=q('smm142_external_url');
    const externalKeyEl=q('smm142_external_key');
    const externalModelEl=q('smm142_external_model');
    const testExternalEl=q('smm142_test_external');
    const externalStatusEl=q('smm142_external_status');
    const modeEl=q('smm129_summary_mode');

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
            tokensEl.value=Math.max(512,Math.min(SMM_PROFILE_OUTPUT_TOKEN_LIMIT_V01140,Number(settings.summaryMaxTokens||3072)));
        }

        const usingProfile=String(settings.summaryProvider||'current')==='profile';
        const usingExternal=String(settings.summaryProvider||'current')==='external';
        const usingLocal=String(settings.summaryMode||'ai')!=='ai';
        if(modeEl) modeEl.value=usingLocal?'local':'ai';
        for(const el of [providerEl,profileEl,fallbackEl,tokensEl,createProfileEl]){
            if(el) el.disabled=usingLocal;
        }

        const profileRow=q('smm93_profile_row');
        const fallbackRow=q('smm93_fallback_row');
        const tokensRow=q('smm93_tokens_row');

        if(profileRow) profileRow.style.display=usingProfile ? '' : 'none';
        if(fallbackRow) fallbackRow.style.display=usingProfile ? '' : 'none';
        if(tokensRow) tokensRow.style.display=usingProfile ? '' : 'none';
        if(createProfileEl) createProfileEl.style.display=usingProfile ? '' : 'none';
        const createProfileNote=q('smm96_create_profile_note');
        if(createProfileNote) createProfileNote.style.display=usingProfile ? '' : 'none';
        if(externalRows) externalRows.style.display=usingExternal ? '' : 'none';
        if(externalUrlEl) externalUrlEl.value=String(settings.summaryExternalApiUrl||'');
        if(externalKeyEl) externalKeyEl.value=String(settings.summaryExternalApiKey||'');
        if(externalModelEl){
            const models=Array.isArray(settings.summaryExternalModels)?settings.summaryExternalModels:[];
            const selected=String(settings.summaryExternalApiModel||'');
            externalModelEl.innerHTML=[
                `<option value="">${models.length?'请选择总结模型':'请先拉取模型'}</option>`,
                ...models.map(model=>`<option value="${esc(model)}">${esc(model)}</option>`),
                ...(selected&&!models.includes(selected)?[`<option value="${esc(selected)}">${esc(selected)}（需重新拉取）</option>`]:[])
            ].join('');
            externalModelEl.value=selected;
        }
        for(const el of [externalUrlEl,externalKeyEl,externalModelEl,testExternalEl]) if(el) el.disabled=usingLocal;
        if(externalStatusEl){
            externalStatusEl.textContent=!usingExternal?'':externalApiCircuitOpenV01142(settings)
                ? `费用保护已锁定：${String(settings.summaryExternalCircuitReason||'上次请求失败')}。重新检查连接前不会发送总结。`
                : externalApiVerifiedV01142(settings)
                    ? `已验证：${normalizeExternalApiBaseV01142(settings.summaryExternalApiUrl)} · ${String(settings.summaryExternalApiModel||'')}。检查过程未发送总结。`
                    : (Array.isArray(settings.summaryExternalModels)&&settings.summaryExternalModels.length
                        ? '模型已拉取。请选择总结模型；选择完成前不会发送总结。'
                        : '尚未拉取模型。请先填写地址与 Key，再点击“拉取模型”；不会发送总结。');
        }

        const status=q('smm93_summary_status');

        if(status){
            if(usingLocal){
                status.textContent='当前：实验性 0 API 规则抽取；不能替代模型语义总结。';
            }else if(usingExternal){
                status.textContent=externalApiCircuitOpenV01142(settings)
                    ? `直接 API 已锁定：${String(settings.summaryExternalCircuitReason||'上次请求失败')}。`
                    : externalApiVerifiedV01142(settings)
                        ? '当前：直接外部 API（最小请求体）；每次点击最多 1 个付费批次。'
                        : '当前：直接外部 API 尚未验证；不会发送总结。';
            }else if(!usingProfile){
                status.textContent='当前：复用主聊天已连接的模型静默总结；不需要第二个 API/Profile。每批仅生成 1 次。';
            }else{
                const p=profiles.find(x=>x.id===settings.summaryProfileId);
                const locked=summaryProfileCircuitOpenV01141(settings);
                status.textContent=locked
                    ? `费用保护已锁定：${String(settings.summaryProfileCircuitReason||'上次请求失败')}。解除前不会调用 API。`
                    : p
                    ? '当前：'+(p.name||'未命名 Profile')+(p.model?' · '+p.model:'')+'；每次点击最多 1 个付费批次。'
                    : '当前：尚未选择有效的总结 Profile。';
            }
        }
        if(unlockProfileEl){
            unlockProfileEl.style.display=usingProfile&&summaryProfileCircuitOpenV01141(settings)?'':'none';
            unlockProfileEl.disabled=usingLocal;
        }
    };

    if(modeEl){
        modeEl.onchange=e=>{
            S().summaryMode=e.target.value==='ai'?'ai':'local';
            saveSettings();
            refreshSummaryProfileUIV094();
            refreshNative();
        };
    }

    if(providerEl){
        providerEl.onchange=e=>{
            const settings=S();
            settings.summaryProvider=['profile','external'].includes(e.target.value) ? e.target.value : 'current';
            saveSettings();
            refreshSummaryProfileUIV094();
            refreshNative();
        };
    }

    if(profileEl){
        profileEl.onchange=e=>{
            S().summaryProfileId=String(e.target.value||'');
            saveSettings();
            refreshSummaryProfileUIV094();
            refreshNative();
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
                Math.min(SMM_PROFILE_OUTPUT_TOKEN_LIMIT_V01140,Number(e.target.value)||3072)
            );
            saveSettings();
            tokensEl.value=S().summaryMaxTokens;
        };
    }

    if(unlockProfileEl){
        unlockProfileEl.onclick=()=>{
            const reason=String(S().summaryProfileCircuitReason||'上次请求失败');
            if(!confirm(`当前锁定原因：${reason}\n\n解除锁定本身不会调用 API、不会扣费。解除后，只有你再次点击“总结新增（独立 API）”才会发送 1 个付费批次。确定解除吗？`)) return;
            unlockSummaryProfileV01141();
            refreshSummaryProfileUIV094();
            refreshNative();
            toast('独立 API 锁定已解除；尚未调用 API，也未扣费。','success');
        };
    }

    const saveExternalConnectionSettings=()=>{
        const settings=S();
        const nextUrl=String(externalUrlEl?.value||'').trim();
        const nextKey=String(externalKeyEl?.value||'').trim();
        const changed=nextUrl!==String(settings.summaryExternalApiUrl||'') || nextKey!==String(settings.summaryExternalApiKey||'');
        settings.summaryExternalApiUrl=nextUrl;
        settings.summaryExternalApiKey=nextKey;
        if(changed){
            settings.summaryExternalApiModel='';
            settings.summaryExternalModels=[];
            settings.summaryExternalModelsBase='';
            settings.summaryExternalModelsFetchedAt='';
            invalidateExternalApiVerificationV01142();
        }
        saveSettings();
        refreshSummaryProfileUIV094();
        refreshNative();
    };
    for(const el of [externalUrlEl,externalKeyEl]) if(el) el.onchange=saveExternalConnectionSettings;
    if(externalModelEl){
        externalModelEl.onchange=()=>{
            try{
                const result=selectExternalModelV01143(externalModelEl.value);
                toast(`已选择总结模型：${result.model}。现在可以发送单批总结。`,'success');
            }catch(e){
                toast(e?.message||String(e),'warning');
            }
            refreshSummaryProfileUIV094();
            refreshNative();
        };
    }
    if(testExternalEl){
        testExternalEl.onclick=async()=>{
            saveExternalConnectionSettings();
            testExternalEl.disabled=true;
            if(externalStatusEl) externalStatusEl.textContent='正在拉取 /models；不会发送总结。';
            try{
                const result=await fetchExternalModelsV01143();
                toast(`已拉取 ${result.models.length} 个模型；请选择总结模型。未发送总结。`,'success');
            }catch(e){
                toast(`模型拉取失败：${e?.message||e}。未发送总结。`,'error');
            }finally{
                testExternalEl.disabled=false;
                refreshSummaryProfileUIV094();
                refreshNative();
            }
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
                refreshNative();

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
                setTimeout(()=>{
                    refreshSummaryProfileUIV094();
                    refreshNative();
                }, 50);
            });
        }
    } catch(e) {
        console.warn('[StoryMemory] profile event listener unavailable', e);
    }

    // 页面初始化顺序不固定，做几次轻量延迟刷新。
    const refreshSummaryControlsV01138=()=>{
        refreshSummaryProfileUIV094();
        refreshNative();
    };
    setTimeout(refreshSummaryControlsV01138, 300);
    setTimeout(refreshSummaryControlsV01138, 1000);
    setTimeout(refreshSummaryControlsV01138, 2500);

    // v0.9.1：旧版 history 入口已从 UI 移除。
    q('smm2_native_stop').onclick = stopHistoryRebuild;
    q('smm2_native_rebuild').onclick = safeHistoryRebuild;
    q('smm51_native_resume').onclick = resumeSafeHistoryRebuild;
    const gapCodeRepairBtnV0114=q('smm114_gap_code_repair');
    if(gapCodeRepairBtnV0114) gapCodeRepairBtnV0114.onclick=repairTimelineGapLocalV0115;
    const timeRepairBtnV0116=q('smm116_time_repair');
    if(timeRepairBtnV0116) timeRepairBtnV0116.onclick=repairTimelineTimesLocalV0117;
    const unifiedPostBtnV01114=q('smm114_unified_post');
    if(unifiedPostBtnV01114) unifiedPostBtnV01114.onclick=runUnifiedPostProcessV01114;
    // v0.11.18: DOM re-render fallback; prevents this button from becoming inert.
    if(!window.__SMM_V01116_UNIFIED_DELEGATE__){
        window.__SMM_V01116_UNIFIED_DELEGATE__=true;
        document.addEventListener('click',(ev)=>{
            const btn=ev?.target?.closest?.('#smm114_unified_post');
            if(!btn || typeof btn.onclick==='function') return;
            ev.preventDefault();
            runUnifiedPostProcessV01114();
        });
    }
    const needsAiRepairBtnV01113=q('smm113_needs_ai_repair');
    if(needsAiRepairBtnV01113) needsAiRepairBtnV01113.onclick=repairNeedsAiOnlyV01113;
    const gapRepairBtnV0112=q('smm112_gap_repair');
    if(gapRepairBtnV0112) gapRepairBtnV0112.onclick=repairTimelineGapV0112;
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
    const injectionAuditBtn = document.getElementById('smm119_refresh_injection_audit');
    if (injectionAuditBtn) injectionAuditBtn.onclick = () => {
        try { refreshSafeMemoryInjectionV0100(); renderMemoryInjectionAuditV0119(); }
        catch(e) { toast('注入诊断失败：'+(e?.message||e),'error'); }
    };
    renderMemoryInjectionAuditV0119();

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
            if (e.target.checked) {
                const gaps=timelineCoverageGapsV0112(M());
                if (gaps.length) {
                    e.target.checked=false;
                    s.safeMemoryInject=false;
                    saveSettings();
                    refreshSafeMemoryInjectionV0100();
                    refreshNative();
                    toast(`检测到时间线断档 #${gaps[0].start}-#${gaps[0].end}。请先用“补总结缺失楼层”修复，再开启记忆注入。`,'warning');
                    return;
                }
            }
            s.safeMemoryInject = !!e.target.checked;
            saveSettings();
            refreshSafeMemoryInjectionV0100();
            refreshNative();
            renderMemoryInjectionAuditV0119();
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
        s.batchMessages = Math.max(4, Number(e.target.value) || 30);
        saveSettings();
    };

    q('smm2_native_start').onchange = async e => {
        await commitStoryStartInputV01132(e.target,refreshNative);
    };
}

function refreshNative() {
    const stats = document.getElementById('smm2_native_stats');
    if (!stats) return;

    const s = S();

    stats.innerHTML = statsHTMLV0105();
    refreshStageSummaryStatusV01121();

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
    setValue('smm129_summary_mode', String(s.summaryMode||'ai')==='ai'?'ai':'local');

    const localMode=String(s.summaryMode||'ai')!=='ai';
    const usingSummaryProfile=String(s.summaryProvider||'current')==='profile';
    const usingExternalSummary=String(s.summaryProvider||'current')==='external';
    const usingPaidSummary=usingSummaryProfile||usingExternalSummary;
    const summaryProfileLocked=usingSummaryProfile&&summaryProfileCircuitOpenV01141(s);
    const externalSummaryLocked=usingExternalSummary&&selectedPaidProviderLockedV01142(s);
    const summaryProfiles=Array.isArray(C().extensionSettings?.connectionManager?.profiles)
        ? C().extensionSettings.connectionManager.profiles : [];
    const selectedSummaryProfile=summaryProfiles.find(p=>String(p?.id||'')===String(s.summaryProfileId||''));
    const modeStatus=document.getElementById('smm129_mode_status');
    if(modeStatus) modeStatus.textContent=localMode
        ? '仅做规则抽取，不具备完整语义理解；不建议用于日常长期记忆。'
        : externalSummaryLocked
            ? `直接 API 尚不可用：${selectedPaidProviderReasonV01142(s)}；当前不会发送总结。`
        : summaryProfileLocked
            ? `独立 API 已锁定：${String(s.summaryProfileCircuitReason||'上次请求失败')}；解除前不会调用 API。`
        : usingExternalSummary
            ? `直接外部 API · ${String(s.summaryExternalApiModel||'未填写模型')}；最小请求体，每批只生成 1 次，失败不写入。`
        : usingSummaryProfile
            ? `独立 API${selectedSummaryProfile?.name?` · ${selectedSummaryProfile.name}`:''}；兼容模式，每批只生成 1 次，失败不写入。`
            : '当前聊天模型静默生成；每批只生成 1 次，失败不写入。';
    const modeBadge=document.getElementById('smm138_mode_badge');
    if(modeBadge){
        modeBadge.textContent=localMode?'实验模式':(usingPaidSummary?'独立 API':'AI 语义');
        modeBadge.dataset.mode=localMode?'local':(usingPaidSummary?'profile':'ai');
    }
    const newBtn=document.getElementById('smm2_native_new');
    const catchupState=activeHistoryCatchupV01146(M());
    const catchupEligible=usingPaidSummary&&!historyCatchupStateV01146(M())&&stat().pending>0;
    if(newBtn) newBtn.textContent=localMode
        ? '总结新增（实验性 0 API）'
        : ((summaryProfileLocked||externalSummaryLocked)
            ? '独立 API 未就绪（未调用）'
            : ((catchupState||catchupEligible)
                ? '继续历史补总结（最多30条）'
                : (usingExternalSummary?'总结新增（直接 API · 10条）':(usingSummaryProfile?'总结新增（独立 API · 10条）':'总结新增（当前模型）'))));
    const requeueBtn=document.getElementById('smm136_native_requeue');
    if(requeueBtn) requeueBtn.style.display=hasIncorrectLocalMemoryV01136(M())?'':'none';
    const deferredCount=localDeferredCountV01133(M());
    const deferredBtn=document.getElementById('smm133_native_backfill');
    if(deferredBtn){
        deferredBtn.textContent=deferredCount?`补录已跳过 ${deferredCount} 楼（0 API）`:'没有待补录楼层';
        deferredBtn.disabled=!deferredCount;
    }
    for(const id of ['smm93_summary_provider','smm93_summary_profile','smm93_summary_fallback','smm93_summary_tokens','smm96_create_profile','smm141_unlock_profile','smm142_external_url','smm142_external_key','smm142_external_model','smm142_test_external']){
        const el=document.getElementById(id);
        if(el) el.disabled=localMode;
    }
    const modelStatus=document.getElementById('smm93_summary_status');
    if(modelStatus&&localMode) modelStatus.textContent='当前：实验性 0 API 规则抽取；不能替代模型语义总结。';

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
    setValue('smm2_native_start', M().story_start || '');

    const gapsV0112=timelineCoverageGapsV0112(M());
    const gapStatusV0112=document.getElementById('smm112_gap_status');
    const fromV0112=document.getElementById('smm112_gap_from');
    const toV0112=document.getElementById('smm112_gap_to');
    if(gapsV0112.length){
        const gap=gapsV0112[0];
        if(fromV0112 && !String(fromV0112.value||'').trim()) fromV0112.value=gap.start;
        if(toV0112 && !String(toV0112.value||'').trim()) toV0112.value=gap.end;
        if(gapStatusV0112 && !GAP_REPAIR_RUNNING_V0112) {
            gapStatusV0112.textContent=`检测到大段时间线断档：#${gap.start}-#${gap.end}（${gap.count} 楼）。自动隐藏不会跨过这里。`;
        }
    } else if(!GAP_REPAIR_RUNNING_V0112) {
        const priorRangeV0115=latestCodeRepairRangeV0115(M());
        if(priorRangeV0115){
            if(fromV0112 && !String(fromV0112.value||'').trim()) fromV0112.value=priorRangeV0115.start;
            if(toV0112 && !String(toV0112.value||'').trim()) toV0112.value=priorRangeV0115.end;
            if(gapStatusV0112) gapStatusV0112.textContent=`未检测到当前大段断档；已填入上一次 0 API 代码补档范围 #${priorRangeV0115.start}-#${priorRangeV0115.end}，可直接用 v0.11.15 结构化重建。`;
        }else if(gapStatusV0112) {
            gapStatusV0112.textContent='未检测到超过保护阈值的大段时间线断档。';
        }
    }
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
            <div class="smm105-title-wrap"><b>剧情自动记忆</b><span class="smm105-version-badge">v0.11.48</span></div>
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
    $('smm136_requeue').onclick=runRequeueIncorrectLocalMemoryV01136;
    $('smm133_backfill').onclick=runDeferredBackfillV01133;
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
    $('smm2_mode').onchange=e=>{s.summaryMode=e.target.value==='ai'?'ai':'local';saveSettings();refresh();};
    $('smm2_trigger').onchange=e=>{s.triggerMessages=Math.max(1,Number(e.target.value)||8);saveSettings();};
    $('smm2_batch').onchange=e=>{s.batchMessages=Math.max(4,Number(e.target.value)||30);saveSettings();};
    $('smm2_start').onchange=async e=>{
        await commitStoryStartInputV01132(e.target,refresh);
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
    const catchup=activeHistoryCatchupV01146(mem);
    const hidden = getSmmAutoHiddenInfoV0101();
    const date = mem.current_story_date || '未建立';
    const people = Object.keys(mem.characters || {}).length;
    const npcs = Object.keys(mem.npcs || {}).length;
    const relations = Array.isArray(mem.relationships) ? mem.relationships.length : 0;
    const anchors = Array.isArray(mem.semantic_anchors) ? mem.semantic_anchors.length : 0;
    const continuityNeedsReview =
        (Array.isArray(mem.conflicts) ? mem.conflicts.length : 0) +
        (Array.isArray(mem.quarantined) ? mem.quarantined.length : 0);
    const coverageGapsV0112=timelineCoverageGapsV0112(mem);

    return [
        `<div class="smm105-stat-line"><b>剧情：</b>${esc(date)}　${esc(st.time)}</div>`,
        `<div class="smm105-stat-line"><b>总结方式：</b>${localSummaryModeV01129()?'实验性 0 API 规则抽取':(String(S().summaryProvider||'current')==='external'?'直接外部 API · 单次':(String(S().summaryProvider||'current')==='profile'?'独立总结 Profile · 单次':'当前聊天模型 · 静默单次'))}</div>`,
        `<div class="smm105-stat-line"><b>扫描：</b>${st.done}/${st.total}　待扫描 ${st.pending}　待补录 ${st.deferred}　已隐藏 ${hidden.count}</div>`,
        catchup ? `<div class="smm105-stat-line"><b>历史补总结：</b>进行中　剩余 ${Math.max(0,Number(catchup.target_index)-Number(mem.last_processed_index??-1))} 条　每次手动最多30条</div>` : '',
        `<div class="smm105-stat-line"><b>记忆：</b>时间线 ${st.timeline}　人物 ${people}　NPC ${npcs}　关系 ${relations}　锚点 ${anchors}　阶段 ${(mem.stage_summaries||[]).length}</div>`,
        `<div class="smm105-stat-line"><b>连续性：</b>${st.deferred ? `⚠ ${st.deferred} 楼已扫描但尚未形成记忆` : (coverageGapsV0112.length ? `⚠ 时间线断档 #${coverageGapsV0112[0].start}-#${coverageGapsV0112[0].end}` : (continuityNeedsReview ? '后台有待核查项' : '正常'))}</div>`,
        `<div class="smm105-stat-line"><b>历史重建：</b>${esc(rebuildStatusLabelV0105(mem))}</div>`,
        rebuildCheckpointHTMLV0105(mem, st.total)
    ].filter(Boolean).join('');
}

function refresh() {
    // v0.11.19: extension prompts are chat-scoped in practice; always refresh after
    // chat/message state changes so the main model receives THIS chat's latest memory.
    try { refreshSafeMemoryInjectionV0100(); } catch(e) { console.warn('[StoryMemory] v0.11.36 injection refresh failed', e); }
    refreshNative();
    renderMemoryInjectionAuditV0119();

    if (!document.getElementById(PANEL_ID)) return;

    const s=S();
    document.getElementById('smm2_stats').innerHTML = statsHTMLV0105();
    document.getElementById('smm2_enabled').checked=!!s.enabled;
    document.getElementById('smm2_inject').checked=false;
    document.getElementById('smm2_auto').checked=!!s.autoSummarize;
    document.getElementById('smm2_mode').value=String(s.summaryMode||'ai')==='ai'?'ai':'local';
    document.getElementById('smm2_trigger').value=s.triggerMessages;
    document.getElementById('smm2_batch').value=s.batchMessages;
    document.getElementById('smm2_start').value=M().story_start||'';
    const paidLegacy=usingPaidProviderV01142(s);
    const catchupLegacy=activeHistoryCatchupV01146(M());
    const catchupEligibleLegacy=paidLegacy&&!historyCatchupStateV01146(M())&&stat().pending>0;
    document.getElementById('smm2_new').textContent=localSummaryModeV01129()
        ? '总结新增（实验性 0 API）'
        : ((catchupLegacy||catchupEligibleLegacy)
            ? '继续历史补总结（最多30条）'
            : (String(s.summaryProvider||'current')==='external'?'总结新增（直接 API · 10条）':(String(s.summaryProvider||'current')==='profile'?'总结新增（独立 API · 10条）':'总结新增（当前模型）')));
    const requeueBtn=document.getElementById('smm136_requeue');
    if(requeueBtn) requeueBtn.style.display=hasIncorrectLocalMemoryV01136(M())?'':'none';
    const deferredCount=localDeferredCountV01133(M());
    const deferredBtn=document.getElementById('smm133_backfill');
    if(deferredBtn){
        deferredBtn.textContent=deferredCount?`补录已跳过 ${deferredCount} 楼（0 API）`:'没有待补录楼层';
        deferredBtn.disabled=!deferredCount;
    }
}

async function maybeAuto() {
    const s=S(); if (!s.enabled || !s.autoSummarize || BUSY) return;
    if(usingPaidProviderV01142(s)&&activeHistoryCatchupV01146(M())) return;
    const st=stat();
    const threshold=usingPaidProviderV01142(s)
        ? Math.max(1,Number(s.autoBatchMessagesV01145)||10)
        : Math.max(1,Number(s.triggerMessages)||8);
    if (st.pending >= threshold) await summarizeNew(false);
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
        console.log('[StoryMemory] v0.11.48 loaded successfully');
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
