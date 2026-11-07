import {parseLiteraryDigestV01165} from './digest-parser-v01172.js';

export const HISTORICAL_RECAP_FIELD_V01175='historical_recap_supplements_v01175';
const plain=value=>String(value||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const key=row=>JSON.stringify([row?.source,row?.kind,row?.title,row?.event]);
const assistant=m=>!!m&&!m.is_user&&m.role!=='user'&&m.role!=='system';

export function readHistoricalRecapV01175(message,index) {
    if(!assistant(message)||!Number.isInteger(index)||index<0)return null;
    const raw=String(message.mes||'')
        .replace(/<!--[^]*?(?:-->|$)/g,'')
        .replace(/<(thinking|think|analysis|system|script|style|memory|UpdateVariable|JSONPatch)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,'');
    const recap=parseLiteraryDigestV01165({...message,mes:raw},index).at(-1);
    let event=plain(recap?.text),title=plain(recap?.title).slice(0,80),kind='literary_digest';
    if(!event){
        const blocks=[...raw.matchAll(/<(abstract|meow_FM|scene_summary|memory_summary|story_summary|plot_summary|剧情摘要)(?:\s[^>]*)?>([\s\S]*?)<\/\1\s*>/gi)];
        const plots=blocks.flatMap(m=>[...m[2].matchAll(/<plot(?:\s[^>]*)?>([\s\S]*?)<\/plot\s*>/gi)]);
        event=plain(plots.at(-1)?.[1]);kind='structured_plot';
    }
    if(!event||event.length>4000||/\$[1-4]|摘要正文内容|时间与地点/.test(event))return null;
    return {source:'#'+index,kind,title,event};
}

export function planHistoricalRecapSupplementV01175(chat,mem,start,end,sourceIndexes) {
    const cursor=Number(mem?.last_processed_index??-1),last=Math.min(cursor,chat.length-1);
    if(!Number.isInteger(last)||last<0)throw Error('当前聊天还没有可补充的已总结楼层。');
    if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>last)throw Error('请输入已总结的楼层范围（0–'+last+'）。');
    if(end-start>=60)throw Error('每次最多预览 60 楼，请缩小范围。');
    const saved=new Set((Array.isArray(mem?.[HISTORICAL_RECAP_FIELD_V01175])?mem[HISTORICAL_RECAP_FIELD_V01175]:[]).map(key));
    const timeline=Array.isArray(mem?.timeline)?mem.timeline:[];
    const rows=[],missing=[],duplicates=[];
    for(let i=start;i<=end;i++){
        if(!assistant(chat[i]))continue;
        const note=readHistoricalRecapV01175(chat[i],i);
        if(!note){missing.push(i);continue;}
        if(saved.has(key(note))||timeline.some(x=>plain(x?.event)===note.event&&sourceIndexes(x.source).includes(i))){duplicates.push(i);continue;}
        rows.push(note);
    }
    return {start,end,cursor,rows,missing,duplicates};
}

export function historicalRecapStillCurrentV01175(note,chat) {
    const match=String(note?.source||'').match(/^#(\d+)$/);
    if(!match)return false;
    const i=Number(match[1]);
    return key(note)===key(readHistoricalRecapV01175(chat[i],i));
}
