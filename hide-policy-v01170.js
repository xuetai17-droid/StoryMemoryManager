// Pure planning only. Unprocessed, uncovered and deferred messages stay visible.
export function planSummarizedHideV01170({chatLength=0,processed=-1,keep=30,coveredRanges=[],deferredRanges=[],gaps=[]}={}) {
    const length=Math.max(0,Math.floor(Number(chatLength)||0));
    const cursor=Number.isFinite(Number(processed))?Math.min(length-1,Math.floor(Number(processed))):-1;
    const recent=Math.max(10,Math.min(200,Math.floor(Number(keep)||30)));
    const limit=Math.min(cursor,length-recent-1);
    const selected=new Set(),blocked=new Set();
    const add=(target,ranges)=>{for(const range of ranges){
        const a=Number(Array.isArray(range)?range[0]:range?.start),b=Number(Array.isArray(range)?range[1]:range?.end);
        if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<a) continue;
        for(let i=a;i<=Math.min(b,limit);i++) target.add(i);
    }};
    add(selected,coveredRanges);add(blocked,deferredRanges);add(blocked,gaps);
    const ids=[...selected].filter(i=>!blocked.has(i)).sort((a,b)=>a-b),ranges=[];
    for(const id of ids){const last=ranges.at(-1);if(last&&id===last[1]+1)last[1]=id;else ranges.push([id,id]);}
    return {ids,ranges,processed:cursor,keep:recent,keepStart:Math.max(0,length-recent),
        eligible:ids.length,unprocessed:Math.max(0,length-cursor-1),retainedOlder:Math.max(0,limit+1-ids.length)};
}
