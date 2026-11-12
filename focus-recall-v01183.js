// Only the user's latest visible turn can request explicit floor lookup.
export function requestedFloorsV01183(query,cursor) {
    const floors=[...String(query||'').matchAll(/(?:^|[^\d#＃])(?:#|＃)(\d{1,8})(?!\d)/g)].map(m=>Number(m[1]));
    return [...new Set(floors)].filter(f=>f<=cursor).slice(0,2);
}

export function focusedMemoryRowsV01183({floors,timeline,recaps,cursor,spans,rank,query='',ignoredNames=[]}){
    const active=row=>{
        if(!row?.event||row.__coverage_only_v01110)return null;
        const refs=spans(row.source);
        if(!refs.length||refs.some(([,b])=>b>cursor))return null;
        return {row,refs,width:refs.reduce((n,[a,b])=>n+b-a+1,0)};
    };
    const primary=timeline.map(active).filter(Boolean),secondary=recaps.map(active).filter(Boolean);
    const fits=x=>String(x?.row?.event||'').length<=1600;
    const covers=(x,floor)=>x.refs.some(([a,b])=>a<=floor&&b>=floor);
    const compare=(a,b)=>a.width-b.width;
    const selected=new Map();
    for(const floor of floors){
        const item=primary.filter(x=>covers(x,floor)&&fits(x)).sort(compare)[0]
            ||secondary.filter(x=>covers(x,floor)&&fits(x)).sort(compare)[0];
        if(item){
            const key=memoryFocusKeyV01183(item.row);
            selected.set(key,{entry:item.row,reason:'用户指定 #'+floor});
        }
    }
    if(floors.length||!query.trim())return [...selected.values()];
    // Weight the user's wording separately from prior model replies. In a causal
    // question, a candidate should contain an actual cause or consequence.
    const causal=/为什么|缘由|原因|怎么.{0,9}(?:伤|流血|惩罚|触发)|因何|怎么回事/.test(query);
    const pool=[...primary,...secondary].filter(fits).map(x=>x.row);
    if(!pool.length)return [];
    let choices=rank({timeline:pool,last_processed_index:cursor},
        {query,ignoredNames,recentCount:0,limit:3,includeMilestones:false});
    if(causal){
        const causalPool=pool.filter(e=>/触发|导致|所致|判定.{0,8}(?:为假|有误)|惩罚|起因|之所以|因为/.test(e.event));
        const grounded=rank({timeline:causalPool,last_processed_index:cursor},
            {query,ignoredNames,recentCount:0,limit:1,includeMilestones:false});
        if(grounded.length)choices=grounded;
    }
    const best=choices.at(-1);
    return best?.score>=5?[{entry:best.entry,reason:'对应本轮用户问题'}]:[];
}

export function memoryFocusKeyV01183(row){
    return JSON.stringify([row?.source,String(row?.event||'').replace(/\s+/g,' ').trim()]);
}
