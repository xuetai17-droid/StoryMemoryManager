import { parseLiteraryDigestV01165, parseDigestTemporalLabelV01172 } from './digest-parser-v01172.js';

// Local, source-bound projection only. This module never generates story text,
// advances processing, calls a model, or changes the original messages.
function assistant(message) {
    return message&&!message.is_user&&message.role!=='user'&&message.role!=='system';
}
function sourceIndexes(value) {
    const source=String(value||''),numbers=[...source.matchAll(/#(\d+)/g)].map(x=>Number(x[1]));
    if(numbers.length===2&&/#\d+\s*[-–—]\s*#?\d+/.test(source)) {
        const first=Math.min(...numbers),last=Math.max(...numbers);
        return Array.from({length:Math.min(500,last-first+1)},(_,i)=>first+i);
    }
    return [...new Set(numbers)].sort((a,b)=>a-b);
}
function visibleSource(message) {
    return String(message?.mes||'')
        .replace(/<(thinking|think|analysis)\b[^>]*>[\s\S]*?<\/\1>/gi,'')
        .replace(/<!--[\s\S]*?-->/g,'')
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
}
function weekday(date) {
    return '周'+'日一二三四五六'[new Date(date+'T00:00:00Z').getUTCDay()];
}
function timingFields(row) {
    return Object.fromEntries(['time','time_evidence','time_evidence_label','time_evidence_reason']
        .filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]]));
}
function restoreFields(row,original) {
    for(const key of ['time','time_evidence','time_evidence_label','time_evidence_reason']) {
        if(Object.hasOwn(original,key))row[key]=original[key];else delete row[key];
    }
}

export function sourceTimeEvidenceV01172(message,index,{status=null}={}) {
    if(!assistant(message))return null; // is_system is visibility, not authorship.
    const raw=visibleSource(message),digest=parseLiteraryDigestV01165({...message,mes:raw},index).at(-1);
    const header=raw.match(/(?:^|\n)\s*:::newspaper\s*\n?([^\n#]{0,180})/)?.[1]?.split('/')[0];
    const opening=header?parseDigestTemporalLabelV01172(header.replace(/[|｜]/g,' ')):null;
    const statusTemporal=status?.date&&status?.time
        ?parseDigestTemporalLabelV01172(status.date+' '+status.time):null;
    if(digest?.annotated_date&&digest.annotated_time_range&&!digest.time_crosses_midnight) {
        const temporal=parseDigestTemporalLabelV01172(digest.temporal_label);
        const notes=[];
        for(const [kind,other] of [['开头',opening],['状态栏',statusTemporal]]) {
            if(other?.date&&other.date!==temporal.date)notes.push(kind+'日期与摘要不同');
            else if(other?.start&&(other.start<temporal.start||other.end>temporal.end))notes.push(kind+'钟点在摘要范围外，分别保留，不拼接');
        }
        return {index,date:temporal.date,start:temporal.start,end:temporal.end,
            kind:'preset_digest',notes};
    }
    // A date-only/invalid/cross-midnight digest must not be silently replaced
    // by a clock from some other panel. A genuine missing digest may use a
    // dated, bounded opening/status scene marker as a point anchor.
    if(digest||/<摘要(?:\s[^>]*)?>/.test(raw))return null;
    const points=[opening,statusTemporal].filter(x=>x?.date&&x.start&&!x.crosses_midnight);
    if(!points.length||points.some(x=>x.date!==points[0].date))return null;
    if(points.length>1&&points.some(x=>x.time!==points[0].time))return null;
    return {index,date:points[0].date,start:points[0].start,end:points[0].end,
        kind:opening?.date?'story_opening':'story_status',notes:[]};
}

export function repairTimelineTimesV01172(mem,chat,{cap=Number(mem.last_processed_index??-1),statusAt=null}={}) {
    const cache=new Map(),changes=[];
    const at=index=>{
        if(!cache.has(index))cache.set(index,sourceTimeEvidenceV01172(chat[index],index,{status:statusAt?.(chat[index],index)}));
        return cache.get(index);
    };
    for(let pos=0;pos<(mem.timeline||[]).length;pos++) {
        const row=mem.timeline[pos],before=JSON.stringify(timingFields(row));
        const prior=row.time_evidence_v01172,original=prior?.original||timingFields(row);
        const indexes=sourceIndexes(row.source);
        const date=row.date;
        let proof=null;
        // Date repair deliberately cleared unrelated clocks on these rows.
        // Do not undo that safeguard or borrow a neighboring/future clock.
        if(date&&!row.date_range&&!row.calendar_evidence_v01171?.clearTime&&indexes.length&&indexes.every(i=>i<=cap&&i<chat.length)) {
            const records=indexes.map(at).filter(Boolean);
            if(records.length&&records.every(x=>x.date===date)) {
                const ordered=records.sort((a,b)=>a.index-b.index);
                // Backward jumps in explicit source time require inspection;
                // min/max alone would conceal a flashback or source conflict.
                const forward=ordered.every((x,i)=>!i||x.end>=ordered[i-1].end);
                if(forward) {
                    const start=ordered.reduce((x,y)=>x<y.start?x:y.start,ordered[0].start);
                    const end=ordered.reduce((x,y)=>x>y.end?x:y.end,ordered[0].end);
                    const coverage=start===end?start:start+'-'+end;
                    const time=weekday(date)+' '+coverage;
                    const label=ordered.some(x=>x.kind==='preset_digest')?'预设摘要覆盖时段':'原文场景时间标注';
                    const reason='同 source '+ordered.map(x=>'#'+x.index).join('、')+' 的明确时间标注；覆盖范围不表示期间持续发生，未读取消息发送时间';
                    proof={version:'0.11.72',verified:true,date,time,scope:'source_coverage',
                        sources:ordered.map(x=>({source:'#'+x.index,date:x.date,start:x.start,end:x.end,kind:x.kind})),
                        notes:ordered.flatMap(x=>x.notes.map(note=>'#'+x.index+' '+note)),original};
                    row.time=time;row.time_evidence='structured';row.time_evidence_label=label;row.time_evidence_reason=reason;
                }
            }
        }
        if(proof)row.time_evidence_v01172=proof;
        else if(prior){restoreFields(row,original);delete row.time_evidence_v01172;}
        if(before!==JSON.stringify(timingFields(row)))changes.push({row:pos,source:row.source,
            before:JSON.parse(before),after:timingFields(row)});
    }
    return {changed:changes.length>0,time_fixed:changes.filter(x=>x.before.time!==x.after.time).length,changes,api_calls:0};
}
