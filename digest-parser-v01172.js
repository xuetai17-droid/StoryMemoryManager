// Pure parser for an existing preset recap. No API or storage operations.
// Labels are retained as recap annotations, never asserted as verified facts.
export function parseDigestTemporalLabelV01172(value) {
    const label=String(value||'').replace(/：/g,':');
    const match=label.match(/^(\s*\d{4}[年\-/]\d{1,2}[月\-/]\d{1,2}日?)(?:\s|[·|｜])*((?:(?:周|星期)[一二三四五六日天])?\s*)/);
    const date=match?dateLabelV01165(match[1]):null;
    if(!date)return {date:null,time:null,start:null,end:null,location:label.trim()};
    const tail=label.slice(match[0].length);
    const clock=tail.match(/^((?:[01]?\d|2[0-3]):[0-5]\d)(?!\d)(?:\s*(?:-|—|–|~|～|↔|→|至|到)\s*((?:[01]?\d|2[0-3]):[0-5]\d)(?!\d))?(?=\s|$|[，,·｜|/])/);
    const start=clock?.[1]?.padStart(5,'0')||null,end=clock?.[2]?.padStart(5,'0')||start;
    return {date,start,end,time:start?(start===end?start:start+'-'+end):null,
        crosses_midnight:!!(start&&end&&start>end),
        location:tail.slice(clock?.[0]?.length||0).trim()};
}

export function parseLiteraryDigestV01165(message, sourceIndex) {
    if (!message || message.is_user || message.role==='user' || message.role==='system' || !Number.isInteger(sourceIndex) || sourceIndex < 0) return [];
    const raw=String(message.mes || '')
        .replace(/<(thinking|think|analysis)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
    const out=[];
    for(const hit of raw.matchAll(/<摘要(?:\s[^>]*)?>([\s\S]*?)<\/摘要\s*>/g)) {
        const body=hit[1].trim(), slash=body.indexOf('/');
        if(slash < 1) continue;
        const firstHash=body.indexOf('#',slash+1), secondHash=body.indexOf('#',firstHash+1);
        if(firstHash<0 || secondHash<0) continue;
        const title=body.slice(0,slash).trim();
        const temporalLabel=body.slice(slash+1,firstHash).trim();
        const portraits=body.slice(firstHash+1,secondHash).trim();
        const text=body.slice(secondHash+1).trim();
        if(!title || !temporalLabel || !portraits || !text || /\$[1-4]|摘要正文内容|时间与地点/.test(body)) continue;
        const temporal=parseDigestTemporalLabelV01172(temporalLabel);
        const annotatedDate=temporal.date,annotatedTime=temporal.crosses_midnight?null:temporal.end;
        out.push({title,temporal_label:temporalLabel,annotated_date:annotatedDate,annotated_time:annotatedTime,
            annotated_time_range:temporal.time,annotated_start_time:temporal.start,
            time_crosses_midnight:temporal.crosses_midnight,annotated_location:temporal.location,
            portraits,text,source:'#'+sourceIndex,provenance:'preset_literary_digest',
            requires_story_verification:true});
    }
    return out;
}

function dateLabelV01165(text) {
    const m=String(text||'').match(/(\d{4})[年\-/](\d{1,2})[月\-/](\d{1,2})日?/);
    if(!m) return null;
    const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]),dt=new Date(Date.UTC(y,mo-1,d));
    return dt.getUTCFullYear()===y && dt.getUTCMonth()===mo-1 && dt.getUTCDate()===d
        ? `${m[1]}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}` : null;
}

function presetMemoryRowsV01165(raw) {
    const out=[];
    for(const hit of String(raw||'').matchAll(/<Memory\b[^>]*>([\s\S]*?)<\/Memory>/gi)) {
        const section=hit[1].match(/#剧情摘要([\s\S]*?)(?=\r?\n\s*#(?!主线摘要)|$)/)?.[1];
        if(!section) continue;
        let priorDate=null;
        const re=/\[([^\]\r\n]{2,80})\]\s*\|\s*内容\s*[:：]([\s\S]*?)(?=\[[^\]\r\n]{2,80}\]\s*\|\s*内容\s*[:：]|$)/g;
        for(const record of section.matchAll(re)) {
            const date=dateLabelV01165(record[1])||priorDate;
            if(date) priorDate=date;
            const clocks=[...record[1].matchAll(/(?:^|[^\d])((?:[01]?\d|2[0-3]):[0-5]\d)(?!\d)/g)].map(x=>x[1].padStart(5,'0'));
            const event=record[2].replace(/<!--|-->/g,'').replace(/\s+/g,' ').trim();
            if(date && event && event.length<=2000) out.push({date,time:clocks.length>1?clocks[0]+'-'+clocks.at(-1):clocks[0]||null,end_time:clocks.at(-1)||null,event});
        }
    }
    return out;
}

export function presetCharacterSnapshotsV01165(message,index) {
    const out=[];
    const fields={'当前位置':'location','着装':'clothing','身份':'identity','年龄':'age','性别':'gender'};
    for(const block of String(message?.mes||'').matchAll(/<Memory\b[^>]*>([\s\S]*?)<\/Memory>/gi)) {
        const section=block[1].match(/#角色档案([\s\S]*?)(?=\r?\n\s*#|$)/)?.[1];
        if(!section) continue;
        for(const line of section.split(/\r?\n/)) {
            const hit=line.match(/^\s*\[([^\]\r\n]{1,40})\]\s*\|(.*)/);
            if(!hit) continue;
            const row={name:hit[1].trim(),source:'#'+index};
            for(const part of hit[2].split('|')) {
                const m=part.match(/^\s*([^：:]+)[：:](.*)/);
                if(m && fields[m[1].trim()] && m[2].trim()) row[fields[m[1].trim()]]=m[2].trim();
            }
            if(Object.keys(row).length>2) out.push(row);
        }
    }
    return out;
}

export function buildPresetDigestPlanV01165(chat,start=0) {
    const rows=[],missing=[],conflicts=[],characters=[];
    let last=-1,digests=0;
    for(let i=Math.max(0,start);i<chat.length;i++) {
        const m=chat[i];
        if(!m || m.is_user || m.role==='user' || m.role==='system') continue;
        const parsed=parseLiteraryDigestV01165(m,i);
        const raw=String(m.mes||'').replace(/<(thinking|think|analysis)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
        if(!parsed.length) {
            if(/<摘要(?:\s[^>]*)?>/.test(raw)) throw new Error('第 #'+i+' 楼摘要格式不完整，未提交本批记忆');
            missing.push(i); continue;
        }
        const digest=parsed.at(-1), memory=presetMemoryRowsV01165(raw), latest=memory.at(-1);
        const location=digest.annotated_location;
        const aligned=latest && latest.date===digest.annotated_date && latest.end_time===digest.annotated_time;
        if(latest && !aligned) conflicts.push({source:'#'+i,digest_time:[digest.annotated_date,digest.annotated_time].filter(Boolean).join(' '),memory_time:latest.date+' '+latest.time});
        const selected=aligned?memory:[{date:digest.annotated_date,time:digest.annotated_time_range,end_time:digest.annotated_time,event:digest.text,
            ...(digest.time_crosses_midnight?{time_crosses_midnight:true}:{})}];
        const prev=i>0 && (chat[i-1]?.is_user || chat[i-1]?.role==='user') && i-1>=start;
        for(let n=0;n<selected.length;n++) {
            const item=selected[n];
            rows.push({...item,source:prev?'#'+(i-1)+',#'+i:'#'+i,digest_source:'#'+i,
                ...(n===selected.length-1 && digest.annotated_date?{location:location||null}:{}),
                digest_title:digest.title,summary_origin:aligned?'preset_memory':'literary_digest',
                contains_recollection:/昨晚|昨夜|昨天|回忆|曾经/.test(item.event),
                generation_mode:'preset_digest_zero_api',event_origin:'assistant_preset',
                time_evidence:'structured',time_evidence_label:'预设摘要标注',
                time_evidence_reason:aligned?'同楼 Memory 主线摘要和文学摘要终点一致':'保留文学摘要自身标注；未将其它来源冲突时间替换进来'});
        }
        characters.push(...presetCharacterSnapshotsV01165(m,i));
        last=i;digests++;
    }
    return {rows,missing:missing.filter(i=>i<=last),conflicts,characters,last,digests};
}
