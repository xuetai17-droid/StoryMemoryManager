// Read saved recap blocks for display. Keep the full saved text; do not
// apply the projection's length limits, flattening, or semantic deduplication.
const reply=m=>!!m&&!m.is_user&&m.role!=='user'&&m.role!=='system';
export const isPresetRecapReplyV01179=reply;

export function readCompletePresetRecapsV01179(message) {
    if(!reply(message)||typeof message.mes!=='string')return [];
    const raw=message.mes;
    const blocks=[];
    const outer=/<!--[^]*?(?:-->|$)|<(thinking|think|analysis|system|script|style|UpdateVariable|JSONPatch)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)|<(摘要|Memory|abstract|meow_FM|scene_summary|memory_summary|story_summary|plot_summary|剧情摘要)(?=[\s>])[^>]*>([\s\S]*?)<\/\2\s*>/gi;
    for(const hit of raw.matchAll(outer)){
        if(!hit[2]||!hit[3]?.trim())continue;
        const tag=hit[2].toLowerCase();
        if(tag==='摘要'){
            const text=hit[3], slash=text.indexOf('/'), first=text.indexOf('#',slash+1), second=text.indexOf('#',first+1);
            const fields=slash>0&&first>slash&&second>first
                ? [text.slice(0,slash),text.slice(slash+1,first),text.slice(first+1,second),text.slice(second+1)] : [];
            blocks.push({kind:'digest',text,fields:fields.every(s=>s.trim())?fields:[]});
        }else if(tag==='memory'){
            // Yuzi's Markdown section is intentionally inside an HTML
            // comment. Only read this known section from this wrapper.
            const text=hit[3].replace(/^\s*<!--/,'').replace(/-->\s*$/,'');
            const section=text.match(/(?:^|\r?\n)[ \t]*#\s*剧情摘要[^\r\n]*\r?\n([\s\S]*?)(?=\r?\n[ \t]*#+[ \t]*(?:角色档案|人物档案|状态记录|待办事项)[^\r\n]*|$)/)?.[1];
            if(section?.trim())blocks.push({kind:'memory',text:section});
        }else{
            const text=hit[3];
            if(/<plot(?=[\s>])[^>]*>[\s\S]*?<\/plot\s*>/i.test(text)||/(?:story_summary|scene_summary|plot_summary|剧情摘要)/i.test(tag)){
                blocks.push({kind:'structured',text});
            }
        }
    }
    return blocks;
}
