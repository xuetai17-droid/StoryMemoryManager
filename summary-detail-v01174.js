// Output guidance and read-only diagnostics for the external semantic route.
export const DIRECT_SUMMARY_DETAIL_RULES_V01174 = `
【记忆详略：以日后能接续情节为准】
- 逐段检查本批所有真实正文，包括接近末尾的内容。先识别其中每个独立进展，再按自然事件合并；不要固定每两楼一条，也不要把有不同结果的多件事压成同一句。
- 每条 T 应能独立读懂：谁参与、事情因何发生、如何推进、关键对白表达了什么、产生了什么结果。原文有明确证据时，写出决定或拒绝的理由、人物态度的变化、交换了什么信息或物品，以及对下一幕仍有影响的约定、条件、限制与未解决事项。
- 关键对白优先保留明确意思与说话人、对象；原词影响后续时可保留一句短原话。区分谁亲历、谁被告知、谁尚不知情；区分已发生事实、角色推测与尚未兑现的计划。
- 有多个有效细节的事件可以写几句完整话，一般约 120–300 汉字，内容复杂可更长；简单过场可短。篇幅按信息量决定，不凑字，不因整批篇幅省略关键事件；重复动作和修辞只留有后续意义的部分。
- 旧记忆仅用于理解背景，不模仿它的长度。本批每个有实质推进的段落都应被恰当的 T 来源覆盖；正文无依据的因果、内心和结局不补写，纯格式指令和辅助块不必覆盖。
例：甲为核对明天的出发时间向乙索要车票；乙解释旧票已取消，交给甲一张新票并约好八点在北门会合。甲已收票；会合仍是未发生的约定。`;

const normalized=value=>String(value??'').trim().replace(/\s+/g,' ');

export function exactTimelineEvidenceDuplicateV01174(a,b,sourceIndexes) {
    if(!normalized(a?.event)||normalized(a.event)!==normalized(b?.event))return false;
    for(const field of ['date','time','location','calendar_axis','reality_date','reality_time']){
        const left=normalized(a?.[field]),right=normalized(b?.[field]);
        if(left!==right)return false;
    }
    if(JSON.stringify(a.date_range||null)!==JSON.stringify(b.date_range||null))return false;
    const xs=[...new Set(sourceIndexes(a.source))].sort((x,y)=>x-y);
    const ys=[...new Set(sourceIndexes(b.source))].sort((x,y)=>x-y);
    return xs.length>0&&xs.length===ys.length&&xs.every((x,i)=>x===ys[i]);
}

export function inspectSummaryCompletionV01174(data) {
    const values=[data?.choices?.[0]?.finish_reason,data?.finish_reason,data?.stop_reason,
        data?.candidates?.[0]?.finishReason,data?.incomplete_details?.reason];
    const known=new Set(['stop','end_turn','stop_sequence','completed','length','max_tokens','max_output_tokens','max_completion_tokens']);
    const reasons=values.filter(x=>typeof x==='string').map(x=>x.trim().toLowerCase()).filter(Boolean);
    const lengthReason=reasons.find(x=>['length','max_tokens','max_output_tokens','max_completion_tokens'].includes(x));
    return {truncated:!!lengthReason,reason:lengthReason||reasons.find(x=>known.has(x))||(reasons.length?'other':null)};
}

export function summarizeTimelineCoverageV01174(rows,canonicalIndexes,sourceIndexes) {
    const canonical=new Set(canonicalIndexes),referenced=new Set();
    let eventCount=0,eventCharacters=0;
    for(const row of rows){
        if(!normalized(row?.event))continue;
        const indexes=sourceIndexes(row.source).filter(i=>canonical.has(i));
        if(!indexes.length)continue;
        eventCount++;eventCharacters+=String(row.event).length;
        indexes.forEach(i=>referenced.add(i));
    }
    return {timeline_events:eventCount,event_characters:eventCharacters,canonical_floors:canonical.size,
        timeline_referenced_floors:referenced.size,unreferenced_floors:[...canonical].filter(i=>!referenced.has(i))};
}
