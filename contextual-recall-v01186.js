import {selectScenarioReturnV01185} from './scenario-recall-v01185.js';

const plain=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const generic=new Set(['他们','两人','自己','一个','这个','那个','时候','然后','已经','可以','现在','没有','什么','知道','说了','觉得','不是','就是','还是','起来','一下','看着','继续','她的','他的','的是','这是','那是','随后','此前','之前','这次','上次','怎么','为何','为什么','剧情','事件','地点','人物']);
const causeRE=/因为|导致|所以|因此|触发|判定|惩罚|结果|所致|缘由|起因/;
const promiseRE=/约定|答应|承诺|赴约|诺言|兑现|保证|履约/;
const terminalRE=/^(?:completed|done|closed|resolved|cancelled|canceled|superseded|invalidated|missed)$/i;
const keyOf=e=>JSON.stringify([e.source,plain(e.event)]);
const array=value=>Array.isArray(value)?value:[];
const records=value=>Array.isArray(value)?value:(value&&typeof value==='object'?Object.entries(value).map(([name,row])=>({name,...(row&&typeof row==='object'?row:{})})):[]);

function grams(text){
    const out=new Set();
    for(const match of plain(text).matchAll(/[\p{Script=Han}]{2,}|[a-z0-9][a-z0-9_-]{1,}/gu)){
        const word=match[0];
        if(/^[a-z0-9]/.test(word)){out.add(word);continue;}
        for(let n=2;n<=4;n++)for(let i=0;i<=word.length-n;i++){
            const token=word.slice(i,i+n);
            if(!generic.has(token))out.add(token);
        }
    }
    return out;
}

function entityCatalog(mem,rows,scene){
    const all=new Map();
    const add=(name,kind,aliases=[])=>{
        const canonical=plain(name);
        if(canonical.length<2||canonical.length>28||generic.has(canonical)||/^(?:未知|未建立|不明|无|大厅|房间|这里|那里|现场)$/.test(canonical))return;
        const id=kind+':'+canonical;
        const old=all.get(id);
        const values=[canonical,...array(aliases).filter(x=>typeof x==='string').map(plain)].filter(x=>x.length>=2&&x.length<=28);
        all.set(id,{id,kind,name:String(name),aliases:[...new Set([...(old?.aliases||[]),...values])]});
    };
    for(const x of records(mem.characters))add(x.name,'person',x.aliases);
    for(const x of records(mem.npcs))add(x.name,'person',x.aliases);
    for(const x of records(mem.locations))add(x.name,'location',x.aliases);
    for(const x of records(mem.items))add(x.name,'item',x.aliases);
    for(const x of [...array(mem.events),...array(mem.active_arcs)])add(x.title,'topic',x.aliases);
    if(typeof scene?.location==='string')add(scene.location,'location');
    for(const row of rows){
        if(typeof row.entry.location==='string')add(row.entry.location,'location');
        for(const hit of row.entry.event.matchAll(/[《「“]([^》」”\r\n，。！？；：,!?;:]{2,20})[》」”]/g))add(hit[1],'topic');
    }
    const owners=new Map();
    for(const e of all.values())for(const alias of e.aliases){
        if(!owners.has(alias))owners.set(alias,new Set());
        owners.get(alias).add(plain(e.name));
    }
    return [...all.values()].map(e=>({...e,aliases:e.aliases.filter(a=>owners.get(a).size===1)}));
}

export function selectContextualRecallV01186({
    mem={},timeline=[],recaps=[],facts=[],scene={},query='',userQuery='',entryContext=[],cursor,
    spans,excludeKeys=new Set(),budget=2600,maxGroups=3
}){
    const docs=new Map();
    const add=(event,source,origin,extra={})=>{
        if(typeof event!=='string'||!event.trim())return;
        const refs=spans(source);
        if(!refs.length||refs.some(([,last])=>last>cursor))return;
        const entry={event,source,...extra};
        const key=keyOf(entry);
        if(!docs.has(key))docs.set(key,{key,entry,origin,refs,first:Math.min(...refs.map(([a])=>a)),last:Math.max(...refs.map(([,b])=>b))});
    };
    for(const e of array(timeline))if(e&&!e.__coverage_only_v01110)add(e.event,e.source,'时间线原记录',{date:e.date,time:e.time,location:e.location});
    for(const e of array(recaps))if(e)add(e.event,e.source,'预设摘要声明',{date:e.date,time:e.time,location:e.location});
    for(const e of array(facts))if(e)add(e.fact,e.source,'已保存事实');
    for(const e of array(mem.events))if(e)add([e.title,e.result].filter(Boolean).join('：'),e.source,'事件结果',{date:e.date});
    for(const e of array(mem.open_loops))if(e)add(e.description,e.source,'约定原记录',{recorded_status:e.status||'未登记'});
    for(const e of array(mem.semantic_anchors))if(e)add(e.event,e.source,'连续性记录');
    const all=[...docs.values()];
    if(!Number.isSafeInteger(cursor)||cursor<0||!all.length)return {groups:[],diagnostic:{candidates:0,selected:0}};
    const catalog=entityCatalog(mem,all,scene);
    const canonicalize=value=>{
        let text=plain(value);
        // Only explicitly saved aliases are normalized. No guessed identity.
        for(const e of catalog)for(const alias of e.aliases)if(alias!==plain(e.name))text=text.split(alias).join(plain(e.name));
        return text;
    };
    const df=new Map();
    for(const d of all){
        d.text=canonicalize(d.entry.event+' '+(d.entry.location||''));
        d.terms=grams(d.text);
        d.entities=new Set(catalog.filter(e=>e.aliases.some(alias=>plain(d.entry.event+' '+(d.entry.location||'')).includes(alias))).map(e=>e.id));
        d.terms.forEach(t=>df.set(t,(df.get(t)||0)+1));
    }
    const entityDf=new Map();
    for(const d of all)for(const id of d.entities)entityDf.set(id,(entityDf.get(id)||0)+1);
    const latest=canonicalize(userQuery),recent=canonicalize(query);
    const queryTerms=grams(latest),contextTerms=grams(recent);
    const currentEntities=catalog.filter(e=>e.aliases.some(a=>plain(userQuery).includes(a)));
    const contextualEntities=catalog.filter(e=>e.aliases.some(a=>plain(query).includes(a)||plain(JSON.stringify(scene)).includes(a)));
    const explicitKinds=new Set(currentEntities.map(e=>e.kind));
    const relevantEntities=[...currentEntities,...contextualEntities.filter(e=>!explicitKinds.has(e.kind))];
    const currentIds=new Set(currentEntities.map(e=>e.id));
    const relevantIds=new Set(relevantEntities.map(e=>e.id));
    const idf=t=>Math.log(1+(all.length+1)/((df.get(t)||0)+1));
    const eventful=d=>causeRE.test(d.entry.event)||promiseRE.test(d.entry.event)||/确认|发现|验证|拒绝|交还|归还|收回|交给|获得|转交|完成|解除|取消|变更|失去/.test(d.entry.event);
    const wantsCause=/原因|为何|为什么|怎么回事|怎么.{0,8}(?:伤|坏|失去|失败)/.test(latest);
    const wantsPromise=promiseRE.test(latest)||/那件事|说好的/.test(latest);
    const relevantPeople=catalog.filter(e=>e.kind==='person'&&relevantIds.has(e.id)
        &&(entityDf.get(e.id)||0)<=Math.max(2,all.length*.35)).map(e=>e.id);
    const strongIds=new Set(relevantEntities.filter(e=>e.kind!=='person').map(e=>e.id));
    for(const d of all){
        let score=0,queryHits=0,contextHits=0;
        // Rarer shared phrases weigh more; common protagonists do not dominate.
        for(const token of d.terms){
            if(queryTerms.has(token)){score+=idf(token)*(token.length>=3?1.4:.45);queryHits++;}
            else if(contextTerms.has(token)){score+=idf(token)*(token.length>=3?.42:.12);contextHits++;}
        }
        d.anchors=[...d.entities].filter(id=>relevantIds.has(id));
        const exactStrong=d.anchors.filter(id=>strongIds.has(id));
        const personMatch=d.anchors.filter(id=>relevantPeople.includes(id));
        score+=exactStrong.reduce((n,id)=>n+(currentIds.has(id)?10:6),0);
        score+=personMatch.length*3;
        if(wantsCause&&causeRE.test(d.entry.event)&&(queryHits>=2||d.anchors.length))score+=5;
        if(wantsPromise&&promiseRE.test(d.entry.event)&&(queryHits>=2||d.anchors.length))score+=5;
        if(d.origin==='约定原记录'&&!terminalRE.test(d.entry.recorded_status)&&wantsPromise&&d.anchors.length)score+=3;
        d.score=score;
        d.grounded=exactStrong.length>0||(personMatch.length>0&&queryHits>=2)||(queryHits>=3&&score>=7)||(contextHits>=4&&score>=9&&eventful(d));
        d.reason=exactStrong.length?'同一'+catalog.find(e=>e.id===exactStrong[0]).kind.replace('location','地点').replace('item','物品').replace('topic','事件')
            :personMatch.length?'同一人物及本轮话题':'本轮话题及原记录';
    }
    const available=d=>!excludeKeys.has(d.key)&&d.entry.event.length<=1200;
    const sorted=all.filter(d=>d.grounded&&available(d)).sort((a,b)=>b.score-a.score||b.last-a.last);
    const groups=[],selectedKeys=new Set();
    let used=0;
    const admit=(list,reason)=>{
        const fresh=list.filter(d=>available(d)&&!selectedKeys.has(d.key));
        if(!fresh.length)return false;
        const characters=fresh.reduce((n,d)=>n+d.entry.event.length+String(d.entry.source).length+60,reason.length+40);
        if(used+characters>budget)return false;
        const entries=fresh.sort((a,b)=>a.first-b.first||a.last-b.last).map(d=>({...d.entry,origin:d.origin}));
        groups.push({reason,entries});
        fresh.forEach(d=>selectedKeys.add(d.key));used+=characters;
        return true;
    };
    // Existing explicit episode evidence is one kind of association, not the
    // entire mechanism; it shares the same bounded output and diagnostics.
    const episode=selectScenarioReturnV01185({timeline,recaps,query,scene:JSON.stringify(scene),entryContext,cursor,spans,budget:Math.min(1600,budget),limit:3});
    if(episode.rows.length){
        const rows=episode.rows.map(x=>docs.get(keyOf(x.entry))).filter(Boolean);
        admit(rows,'明确同名经历：'+episode.name+'（旧经历，非当前状态）');
    }
    const referenceGroups=[];
    for(const a of array(mem.semantic_anchors)){
        const marker=array(a?.evidence).filter(x=>typeof x==='string').flatMap(s=>spans(s));
        const head=spans(a?.source);
        if(!head.length||!marker.length||[...head,...marker].some(([,b])=>b>cursor))continue;
        referenceGroups.push([...head,...marker]);
    }
    const overlaps=(refs,d)=>refs.some(([a,b])=>d.refs.some(([c,e])=>a<=e&&c<=b));
    for(const seed of sorted){
        if(groups.length>=maxGroups)break;
        if(selectedKeys.has(seed.key))continue;
        const linked=[seed],specific=[...seed.entities].filter(id=>strongIds.has(id)||relevantPeople.includes(id));
        const explicitLink=referenceGroups.find(refs=>overlaps(refs,seed));
        if(explicitLink)all.filter(d=>d!==seed&&overlaps(explicitLink,d)&&available(d)).slice(0,2).forEach(d=>linked.push(d));
        // Shared specific entities or an explicit nearby continuation can add
        // evidence. Proximity by itself never establishes a causal link.
        const related=all.filter(d=>d!==seed&&available(d)&&!selectedKeys.has(d.key)&&(
            specific.some(id=>d.entities.has(id))||
            (Math.max(0,Math.max(seed.first,d.first)-Math.min(seed.last,d.last))<=3
                &&/^(?:随后|因此|于是|此处|这里|这时)/.test(d.entry.event)
                &&(!d.entry.location||!seed.entry.location||d.entry.location===seed.entry.location)
                &&![...d.entities].some(id=>id.startsWith('location:')&&!seed.entities.has(id)))
        ));
        // Show earlier grounding and the latest related state where possible.
        const ordered=related.sort((a,b)=>a.first-b.first||a.last-b.last);
        const first=ordered.find(d=>eventful(d))||ordered[0],last=ordered.findLast(d=>eventful(d))||ordered.at(-1);
        for(const d of [first,last])if(d&&!linked.includes(d)&&linked.length<3)linked.push(d);
        if(!admit(linked,seed.reason+'；关联原记录按来源顺序列出，不据此断言因果')){
            admit([seed],seed.reason+'；关联全文超出本轮预算');
        }
    }
    return {groups,diagnostic:{candidates:all.length,selected:selectedKeys.size,groups:groups.length,characters:used}};
}
