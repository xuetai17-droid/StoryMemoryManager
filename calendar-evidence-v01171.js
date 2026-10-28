import { parseLiteraryDigestV01165 } from './digest-parser-v01171.js';

const normalize=value=>String(value||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
export function validCalendarDateV01171(year,month,day) {
    const y=Number(year),m=Number(month),d=Number(day),date=new Date(Date.UTC(y,m-1,d));
    return y>=100&&date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d
        ? `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`:null;
}
export function parseCalendarEntryDateV01171(text,year,month) {
    const value=normalize(text);
    let hit=value.match(/^(\d{4})[年\-/](\d{1,2})[月\-/](\d{1,2})日?/);
    if(hit)return {date:validCalendarDateV01171(hit[1],hit[2],hit[3]),prefix:hit[0]};
    hit=value.match(/^(\d{1,2})月\s*(\d{1,2})日/);
    if(hit)return {date:validCalendarDateV01171(year,hit[1],hit[2]),prefix:hit[0]};
    if(/^\d{1,2}月/.test(value))return null; // Month-only appointment is not a day cell.
    hit=value.match(/^(\d{1,2})(?:日)?(?=\D|$)/);
    return hit?{date:validCalendarDateV01171(year,month,hit[1]),prefix:hit[0]}:null;
}
export function taggedCalendarV01171(message) {
    if(!message||message.is_user||message.role==='user'||message.role==='system')return null;
    const raw=String(message.mes||'').replace(/<(thinking|think|analysis)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
    const calendars=[];
    for(const hit of raw.matchAll(/<日历(?:\s[^>]*)?>([\s\S]*?)<\/日历\s*>/g)){
        const today=hit[1].match(/<今日(?:\s[^>]*)?>([\s\S]*?)<\/今日\s*>/)?.[1]||'';
        const date=normalize(today).match(/(\d{4})[年\-/](\d{1,2})[月\-/](\d{1,2})日?/);
        const current=date&&validCalendarDateV01171(date[1],date[2],date[3]);
        if(!current)continue;
        const events=hit[1].match(/<事件(?:\s[^>]*)?>([\s\S]*?)<\/事件\s*>/)?.[1]||'';
        const entries=[];
        for(const row of events.replace(/<br\s*\/?\s*>/gi,'\n').split(/\r?\n/)){
            const parsed=parseCalendarEntryDateV01171(row,date[1],date[2]);
            if(parsed?.date){const label=normalize(row).slice(parsed.prefix.length).trim();if(label)entries.push({date:parsed.date,label,future:parsed.date>current});}
        }
        calendars.push({current,entries,kind:'tagged_story_calendar'});
    }
    if(!calendars.length)return null;
    const dates=[...new Set(calendars.map(x=>x.current))];
    return dates.length===1?calendars.at(-1):{current:null,entries:[],conflict:true};
}
export function sourceCalendarEvidenceV01171(message,index) {
    if(!message||message.is_user||message.role==='user'||message.role==='system')return null;
    const calendar=taggedCalendarV01171(message),digest=parseLiteraryDigestV01165(message,index).at(-1);
    if(calendar?.conflict)return {index,conflict:true};
    if(calendar?.current&&digest?.annotated_date&&calendar.current!==digest.annotated_date)return {index,conflict:true};
    const date=calendar?.current||digest?.annotated_date;
    if(!date)return null;
    return {index,date,time:digest?.annotated_time||null,text:digest?.text||'',origin:calendar?.current?'同楼 <日历>/<今日>':'同楼 <摘要> 日期'};
}
function previousWeekday(anchor,day) {
    const date=new Date(anchor+'T00:00:00Z'),target='日一二三四五六'.indexOf(day);
    if(target<0||!Number.isFinite(date.getTime()))return null;
    date.setUTCDate(date.getUTCDate()-(date.getUTCDay()-target+7)%7);
    return date.toISOString().slice(0,10);
}
function narratedWeekdays(text) {
    const clean=String(text||'').replace(/[“「『"]([^”」』"\n]*)[”」』"]/g,'');
    return [...new Set([...clean.matchAll(/(?:^|[。；;\n])\s*周([一二三四五六日天])(?!(?:见|将|计划|预约|打算|待定|约定))/g)].map(x=>x[1]==='天'?'日':x[1]))];
}
export function chooseRowCalendarV01171(row,evidence,similarity) {
    const reliable=evidence.filter(x=>x&&!x.conflict&&x.date);
    if(!reliable.length||evidence.some(x=>x?.conflict))return null;
    const target=String(row?.event||'');
    const ranked=reliable.map(x=>({...x,score:similarity(target,x.text)})).sort((a,b)=>(b.score-a.score)||(b.index-a.index));
    let best=ranked[0];const dates=[...new Set(reliable.map(x=>x.date))].sort();
    if(dates.length>1){
        const other=ranked.find(x=>x.date!==best.date);
        if(best.score<0.12||(other&&best.score-other.score<0.05))return {range:[dates[0],dates.at(-1)],sources:reliable.map(x=>x.index),reason:'本条来源跨多个明确日期，无法唯一归日'};
    }else best=[...reliable].sort((a,b)=>b.index-a.index)[0];
    const prefix=target.match(/^\s*周([一二三四五六日天])/);
    const days=narratedWeekdays(best.text);
    if(prefix&&days.includes(prefix[1]==='天'?'日':prefix[1])){
        const resolved=previousWeekday(best.date,prefix[1]==='天'?'日':prefix[1]);
        if(resolved&&resolved!==best.date)return {date:resolved,sources:[best.index],reason:'同楼摘要明确回叙周'+prefix[1]+'，依同楼绝对日期解析',clearTime:true};
    }
    const targetDays=[...new Set([...target.matchAll(/周([一二三四五六日天])/g)].map(x=>x[1]==='天'?'日':x[1]))];
    if(targetDays.filter(day=>days.includes(day)).length>=2){
        const past=days.map(day=>previousWeekday(best.date,day)).filter(Boolean).sort();
        if(past.length>1&&past[0]!==past.at(-1))return {range:[past[0],past.at(-1)],sources:[best.index],reason:'同楼摘要与本条均明确回叙多个星期日，保留跨日范围'};
    }
    return {date:best.date,sources:[best.index],reason:dates.length>1?'按本条内容最匹配的同楼日期，不借用范围末尾另一事件的日期':best.origin,clearTime:dates.length>1};
}
