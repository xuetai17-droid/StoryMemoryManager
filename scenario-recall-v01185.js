// Source-grounded recurrence lookup. No model calls, writes, or hidden rule
// generation. Names and boundaries must appear explicitly in saved evidence.
const normalize=s=>String(s||'').replace(/\s+/g,'').toLowerCase();
const meaningful=s=>typeof s==='string'&&s.trim().length>0;
const isPlan=text=>/(?:准备|打算|计划|想要|考虑|如果|假如|尚未|还没|不再|没有).{0,8}(?:进入|重返|离开|通关|完成)/.test(text);
const closing=text=>!isPlan(text)&&/通关|完成(?:了)?(?:该|此|本|首次|第一次|初次)?副本|离开(?:了)?(?:该|此|本)?副本|副本(?:结束|结算)|结束.{0,4}副本/.test(text);
const opening=text=>!isPlan(text)&&/(?:进入|入场|重返|再入|抵达)|(?:副本名称|副本名)[：:]/.test(text);
function explicitNames(text){
    const names=[];
    for(const hit of String(text||'').matchAll(/(?:副本(?:名称|名)?\s*[:：]?\s*|(?:首次|初次|第一次|再次|第二次)?(?:进入|重返|再入)\s*(?:副本\s*)?)[《「“]([^》」”\r\n]{2,24})[》」”]/g))names.push(hit[1].trim());
    for(const hit of String(text||'').matchAll(/(?:副本(?:名称|名)?\s*[:：]\s*|(?:首次|初次|第一次|再次|第二次)?(?:进入|重返|再入)(?:了)?\s*(?:副本\s*)?)([\p{Script=Han}A-Za-z0-9·]{2,16})(?=[，。；;\n]|$)/gu))names.push(hit[1].trim());
    return [...new Set(names)].filter(x=>!/(?:副本|房间|状态|场景|酒馆|通道|大门)$/.test(x)&&!/^未知|^随机/.test(x));
}
function key(row){return JSON.stringify([row.source,String(row.event).replace(/\s+/g,' ').trim()]);}

export function selectScenarioReturnV01185({timeline=[],recaps=[],query='',scene='',entryContext=[],cursor,spans,budget=2400,limit=5}){
    if(!Number.isSafeInteger(cursor)||cursor<0)return {name:null,rows:[],episodes:[]};
    const unique=new Map();
    for(const row of [...timeline,...recaps]){
        if(!meaningful(row?.event)||row.__coverage_only_v01110)continue;
        const refs=spans(row.source);
        if(!refs.length||refs.some(([,b])=>b>cursor))continue;
        unique.set(key(row),{entry:row,start:Math.min(...refs.map(([a])=>a)),end:Math.max(...refs.map(([,b])=>b))});
    }
    const items=[...unique.values()].sort((a,b)=>a.start-b.start||a.end-b.end);
    const known=new Set(items.flatMap(x=>explicitNames(x.entry.event)));
    for(const name of explicitNames(query))known.add(name);
    // A recent explicit entry can keep the connection when a few follow-up
    // replies use pronouns. A later explicit completion cancels that fallback.
    let recentEntry=null;
    for(const text of entryContext){
        const names=explicitNames(text);
        if(opening(text)&&names.length)recentEntry=names.at(-1);
        if(closing(text))recentEntry=null;
    }
    if(recentEntry)known.add(recentEntry);
    const context=normalize(query),where=normalize(scene);
    let matches=[...known].filter(n=>context.includes(normalize(n)));
    if(matches.length)matches.sort((a,b)=>context.lastIndexOf(normalize(b))-context.lastIndexOf(normalize(a)));
    else matches=[...known].filter(n=>where.includes(normalize(n))).sort((a,b)=>b.length-a.length);
    const name=matches[0]||recentEntry;
    if(!name)return {name:null,rows:[],episodes:[]};
    const needle=normalize(name),episodes=[];
    let active=null;
    for(const item of items){
        const text=item.entry.event,hasName=normalize(text).includes(needle);
        const namedOpening=opening(text)&&explicitNames(text).length>0;
        if(namedOpening){
            const belongs=hasName;
            if(active&&item.start>active.start){
                // A different entry alone is insufficient proof that everything
                // in between was part of the preceding dungeon.
                active=null;
            }
            if(belongs&&!active)active={start:item.start,end:null};
        }
        if(active&&item.start>=active.start&&closing(text)){
            const names=explicitNames(text);
            if(!names.length||hasName){
                active.end=item.end;
                episodes.push(active);
                active=null;
            }
        }
    }
    const inEpisode=item=>episodes.some(e=>item.start>=e.start&&item.end<=e.end);
    const pool=items.filter(item=>inEpisode(item)||normalize(item.entry.event).includes(needle));
    const older=pool.filter(item=>item.end<cursor-4);
    // On entry, prefer concluded earlier visits to the just-started visit.
    const candidates=(older.length?older:pool).filter(x=>x.entry.event.length<=1200);
    if(!candidates.length)return {name,rows:[],episodes};
    const priorities=[];
    const add=x=>{if(x&&!priorities.includes(x))priorities.push(x);};
    // Preserve an explicit discovery/rule, outcome, and opening before filling
    // remaining slots. Every passage is original source text, never a new rule.
    add(candidates.find(x=>/规则|确认|发现|验证|得知|禁忌|线索|密码/.test(x.entry.event)));
    add(candidates.findLast(x=>closing(x.entry.event)));
    add(candidates.find(x=>opening(x.entry.event)));
    candidates.filter(x=>/约定|承诺|带走|获得|交换|身份|关系|代价|惩罚|未解决|失败/.test(x.entry.event)).forEach(add);
    candidates.forEach(add);
    const chosen=[];
    let chars=0;
    for(const item of priorities){
        if(chars+item.entry.event.length>budget)continue;
        chosen.push(item);chars+=item.entry.event.length;
        if(chosen.length===limit)break;
    }
    return {name,episodes,rows:chosen.sort((a,b)=>a.start-b.start||a.end-b.end).map(item=>({
        entry:item.entry,reason:inEpisode(item)?'同名副本的已结束经历':'原记录明确提到该副本'
    }))};
}
