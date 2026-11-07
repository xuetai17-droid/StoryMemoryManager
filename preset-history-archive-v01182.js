import {readCompletePresetRecapsV01179,isPresetRecapReplyV01179} from './complete-preset-recaps-v01179.js';

export const PRESET_HISTORY_ARCHIVE_FIELD_V01182='preset_history_archive_v01182';
const parseCache=new WeakMap();

export function presetHistoryBlocksV01182(message){
    if(!isPresetRecapReplyV01179(message)||typeof message.mes!=='string')return [];
    const cached=parseCache.get(message);
    if(cached?.raw===message.mes)return cached.blocks;
    const blocks=readCompletePresetRecapsV01179(message).filter(x=>x.kind==='digest'&&x.text?.trim()
        &&!/^\s*\$1\s*\/\s*\$2\s*#\s*\$3\s*#\s*\$4\s*$/.test(x.text)
        &&!/^\s*标题\s*\/\s*时间与地点\s*#\s*人物速写\s*#\s*摘要正文内容\s*$/.test(x.text));
    parseCache.set(message,{raw:message.mes,blocks});
    return blocks;
}

export function archiveRecordsV01182(mem){
    const field=mem?.[PRESET_HISTORY_ARCHIVE_FIELD_V01182];
    return Array.isArray(field)?field.filter(x=>Number.isSafeInteger(x?.floor)&&x.floor>=0&&Array.isArray(x.blocks)&&x.blocks.length
        &&x.blocks.every(b=>typeof b?.text==='string'&&Array.isArray(b.fields)&&(b.fields.length===0||b.fields.length===4)
            &&b.fields.every(f=>typeof f==='string'))):[];
}

export function archiveRecordCurrentV01182(record,chat){
    const live=presetHistoryBlocksV01182(chat[record.floor]);
    return live.length===record.blocks.length&&live.every((block,i)=>block.text===record.blocks[i].text);
}

export async function scanPresetHistoryArchiveV01182(chat,endExclusive,previous,{progress=()=>{},check=()=>{}}={}){
    const seen=new Map(previous.map(record=>[record.floor,record]));
    const snapshot=chat.slice(0,endExclusive).map(m=>m?[m.mes,m.role,m.is_user]:null);
    const missing=[],already=[],additions=[];
    for(let floor=0;floor<endExclusive;floor++){
        const values=snapshot[floor];
        const m=chat[floor];
        if(values&&m&&m.mes===values[0]&&m.role===values[1]&&m.is_user===values[2]&&isPresetRecapReplyV01179(m)){
            const blocks=presetHistoryBlocksV01182(m);
            if(!blocks.length)missing.push(floor);
            else if(seen.has(floor)&&archiveRecordCurrentV01182(seen.get(floor),chat))already.push(floor);
            else additions.push({floor,blocks});
        }
        if((floor+1)%64===0&&floor+1<endExclusive){
            progress(floor+1,endExclusive);
            await new Promise(resolve=>setTimeout(resolve,0));
            check();
        }
    }
    check();
    if(snapshot.length!==endExclusive||snapshot.some((v,i)=>{
        const m=chat[i];
        return v?(!m||v[0]!==m.mes||v[1]!==m.role||v[2]!==m.is_user):!!m;
    }))throw Error('扫描期间旧楼发生变化，请重新补录。');
    for(const row of additions)seen.set(row.floor,row);
    return {records:[...seen.values()].sort((a,b)=>a.floor-b.floor),added:additions.length,missing,already:already.length};
}

export function archiveRecallRowsV01182(mem,chat,limit=1200){
    const rows=[];
    for(const record of archiveRecordsV01182(mem)){
        if(record.floor>Number(mem.last_processed_index??-1)||!archiveRecordCurrentV01182(record,chat))continue;
        // The current original, rather than imported annotations, is the authority.
        for(const block of presetHistoryBlocksV01182(chat[record.floor])){
            const event=(block.fields[3]||block.text).trim();
            if(event&&event.length<=limit)rows.push({source:'#'+record.floor,event});
        }
    }
    return rows;
}
