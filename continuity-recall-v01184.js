// Keep the latest distinct source groups visible. A single reply with multiple
// summaries must not occupy all the slots at the expense of its predecessor.
const causal=value=>/触发|导致|因而|于是|判定.{0,8}(?:为假|有误)|惩罚|结果|所致|起因/.test(value);
const progression=row=>2*Number(causal(row.event))+Number(/决定|约定|尚未|准备|完成|拒绝|确认|改变/.test(row.event));

export function activeTimelineRowsV01184(rows,cursor,spans){
    if(!Number.isSafeInteger(cursor)||cursor<0)return [];
    return (Array.isArray(rows)?rows:[]).flatMap((row,index)=>{
        if(typeof row?.event!=='string'||!row.event.trim()||row.__coverage_only_v01110)return [];
        const refs=spans(row.source);
        if(!refs.length||refs.some(([,end])=>end>cursor))return [];
        return [{row,index,end:Math.max(...refs.map(([,b])=>b)),start:Math.min(...refs.map(([a])=>a))}];
    });
}

export function recentContinuityRowsV01184(items,limit=3,budget=2250){
    const groups=new Map();
    for(const item of items){
        if(!groups.has(item.end))groups.set(item.end,[]);
        groups.get(item.end).push(item);
    }
    const picked=[];
    let remaining=budget;
    for(const end of [...groups.keys()].sort((a,b)=>b-a)){
        const next=groups.get(end).sort((a,b)=>progression(b.row)-progression(a.row)
            ||Number(!!b.row.time)-Number(!!a.row.time)||b.start-a.start||b.index-a.index);
        const winner=next.find(x=>x.row.event.length<=Math.min(remaining,1000));
        if(!winner)continue;
        picked.push(winner);
        remaining-=winner.row.event.length;
        if(picked.length===limit)break;
    }
    return picked.reverse().map(x=>x.row);
}
