// Existing, attributed profile records only. No model calls or semantic inference.
import { parseLiteraryDigestV01165 } from './digest-parser-v01165.js';

export function buildPresetCharacterArchivePlanV01168(chat,end=chat.length-1) {
    const characters=[],portraits=[];
    const fields={'当前位置':'location','着装':'clothing','身份':'identity','年龄':'age','性别':'gender','周围角色':'companion'};
    const notes={'人际关系':'relationship_note','好感度':'favorability_note','待办事项':'todo_note'};
    for(let i=0;i<=Math.min(end,chat.length-1);i++) {
        const message=chat[i];
        if(!message || message.is_user || message.role==='user' || message.is_system || message.role==='system') continue;
        const raw=String(message.mes||'').replace(/<(thinking|think|analysis)\b[^>]*>[\s\S]*?<\/\1>/gi,'');
        const digest=parseLiteraryDigestV01165({...message,mes:raw},i).at(-1);
        if(digest?.portraits) portraits.push({text:digest.portraits,source:'#'+i,date:digest.annotated_date,time:digest.annotated_time});
        for(const block of raw.matchAll(/<Memory\b[^>]*>([\s\S]*?)<\/Memory>/gi)) {
            const section=block[1].match(/#角色档案([\s\S]*?)(?=\r?\n\s*#|$)/)?.[1];
            if(!section) continue;
            for(const line of section.replace(/<!--|-->/g,'').split(/\r?\n/)) {
                const hit=line.match(/^\s*\[([^\]\r\n]{1,40})\]\s*\|(.*)/);
                if(!hit) continue;
                const name=hit[1].trim();
                if(!name || ['__proto__','prototype','constructor'].includes(name)) continue;
                const entry={name,source:'#'+i,date:digest?.annotated_date||null,time:digest?.annotated_time||null,notes:{}};
                for(const part of hit[2].split('|')) {
                    const m=part.match(/^\s*([^：:]+)[：:](.*)/);
                    if(!m) continue;
                    const key=m[1].trim(),value=m[2].trim();
                    if(!value || value.length>2400) continue;
                    if(fields[key]) entry[fields[key]]=value;
                    if(notes[key]) entry.notes[notes[key]]=value;
                }
                if(Object.keys(entry).some(k=>Object.values(fields).includes(k)) || Object.keys(entry.notes).length) characters.push(entry);
            }
        }
    }
    return {characters,portraits:portraits.slice(-10)};
}
