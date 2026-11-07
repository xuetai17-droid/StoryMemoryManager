import {HISTORICAL_RECAP_FIELD_V01175, readHistoricalRecapV01175} from './historical-recaps-v01175.js';

const normalizedEvent=value=>String(value||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const noteKey=row=>JSON.stringify([row?.source,row?.kind,row?.title,row?.event]);
const isReply=message=>!!message&&!message.is_user&&message.role!=='user'&&message.role!=='system';
const yieldToBrowser=()=>new Promise(resolve=>setTimeout(resolve,0));
const stale=()=>Error('聊天、原楼或保存状态已变化，请重新预览。');

export async function scanAllHistoricalRecapsV01176(chat,mem,sourceIndexes,{assertCurrent=()=>{},onProgress=()=>{},yieldToUi=yieldToBrowser}={}) {
    const cursor=Number(mem?.last_processed_index??-1),end=Math.min(cursor,chat.length-1);
    if(!Number.isInteger(end)||end<0)throw Error('当前聊天还没有可补充的已总结楼层。');
    const messages=Array.from({length:end+1},(_,i)=>{
        const m=chat[i];
        return m?{mes:m.mes,role:m.role,is_user:m.is_user}:null;
    });
    const savedInput=mem[HISTORICAL_RECAP_FIELD_V01175],timelineInput=mem.timeline;
    const savedKeys=Array.isArray(savedInput)?savedInput.map(noteKey):[];
    const saved=new Set(savedKeys);
    const evidence=new Map();
    const timeline=(Array.isArray(timelineInput)?timelineInput:[]).map(x=>[x?.source,x?.event]);
    for(const [source,event] of timeline){
        const key=normalizedEvent(event);
        if(!key)continue;
        if(!evidence.has(key))evidence.set(key,[]);
        evidence.get(key).push(source);
    }
    const sourceCache=new Map();
    const hasSameTimelineText=(note,i)=>(evidence.get(note.event)||[]).some(source=>{
        if(!sourceCache.has(source))sourceCache.set(source,new Set(sourceIndexes(source)));
        return sourceCache.get(source).has(i);
    });
    const rows=[],missing=[],duplicates=[];
    assertCurrent();
    for(let i=0;i<=end;i++){
        const message=messages[i];
        if(isReply(message)){
            const note=readHistoricalRecapV01175(message,i);
            if(!note)missing.push(i);
            else if(saved.has(noteKey(note))||hasSameTimelineText(note,i))duplicates.push(i);
            else rows.push(note);
        }
        if((i+1)%64===0&&i<end){
            onProgress(i+1,end+1);
            await yieldToUi();
            assertCurrent();
        }
    }
    onProgress(end+1,end+1);
    assertCurrent();
    if(Number(mem.last_processed_index)!==cursor||mem[HISTORICAL_RECAP_FIELD_V01175]!==savedInput||mem.timeline!==timelineInput
        ||(Array.isArray(savedInput)&&(savedInput.length!==savedKeys.length||savedInput.some((x,i)=>noteKey(x)!==savedKeys[i])))
        ||(Array.isArray(timelineInput)&&(timelineInput.length!==timeline.length||timelineInput.some((x,i)=>x?.source!==timeline[i][0]||x?.event!==timeline[i][1])))
        ||messages.some((m,i)=>m?(!chat[i]||m.mes!==chat[i].mes||m.role!==chat[i].role||m.is_user!==chat[i].is_user):!!chat[i])){
        throw stale();
    }
    return {start:0,end,cursor,rows,missing,duplicates};
}

export function sameHistoricalRecapPlanV01176(a,b){
    const equalList=(x,y,eq)=>x.length===y.length&&x.every((v,i)=>eq(v,y[i]));
    const same=(x,y)=>x===y;
    return a.start===b.start&&a.end===b.end&&a.cursor===b.cursor
        &&equalList(a.missing,b.missing,same)&&equalList(a.duplicates,b.duplicates,same)
        &&equalList(a.rows,b.rows,(x,y)=>x.source===y.source&&x.kind===y.kind&&x.title===y.title&&x.event===y.event);
}

export function formatHistoricalRecapFloorsV01176(floors){
    const spans=[];
    for(let i=0;i<floors.length;){
        const first=floors[i++];
        let last=first;
        while(i<floors.length&&floors[i]===last+1)last=floors[i++];
        spans.push(first===last?'#'+first:'#'+first+'–#'+last);
    }
    return spans.join('、');
}
