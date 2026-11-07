// Retrieval only: original event/source records are never promoted to knowledge
// states or edited. A query changes selection, not the truth of an event.
const normalize=value=>String(value||'').toLowerCase().replace(/哥哥|大哥|兄长/g,'哥哥')
    .replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const generic=new Set(['他们','两人','自己','一个','这个','那个','时候','然后','已经','可以','现在','没有','什么','知道','说了','觉得','不是','就是','还是','起来','一下','看着','继续','她的','他的','的是','这是','那是']);
function tokens(value,ignored=[]) {
    let text=normalize(value);
    for(const name of ignored.filter(x=>String(x).length>=2))text=text.split(normalize(name)).join(' ');
    const out=new Set();
    for(const match of text.matchAll(/[\p{Script=Han}]{2,}|[a-z][a-z0-9_]{2,}/gu)) {
        const word=match[0];
        if(/^[a-z]/.test(word)){out.add(word);continue;}
        for(let n=2;n<=3;n++)for(let i=0;i<=word.length-n;i++) {
            const part=word.slice(i,i+n);if(!generic.has(part))out.add(part);
        }
    }
    return out;
}
function lastSource(value) {
    const indexes=[...String(value||'').matchAll(/#(\d+)/g)].map(x=>Number(x[1]));
    return indexes.length?Math.max(...indexes):-1;
}
function contactMilestone(text) {
    // Select an existing, attributed event, not infer who knows it. Require
    // family context AND an explicit communication/introduction action.
    return /哥哥|大哥|家人|父亲|母亲|父母|姐姐|弟弟|妹妹|家长/.test(text)
        && /互加微信|加.{0,8}微信|添加.{0,8}好友|交换.{0,8}(?:联系|微信)|通话|视频连线|介绍.{0,12}(?:男友|女友|对象)|告知.{0,12}(?:家人|父母)/.test(text);
}
export function selectHistoricalEventsV01173(mem,{query='',ignoredNames=[],recentCount=5,limit=5,includeMilestones=true}={}) {
    const cursor=Number(mem?.last_processed_index??-1);
    const all=(mem?.timeline||[]).filter(x=>x&&!x.__coverage_only_v01110&&x.event&&lastSource(x.source)>=0&&lastSource(x.source)<=cursor);
    const recent=new Set(recentCount>0?all.slice(-recentCount):[]),wanted=tokens(String(query).slice(-5000),ignoredNames);
    const ranked=all.filter(x=>!recent.has(x)).map((entry,index)=>{
        const bag=tokens(entry.event,ignoredNames),matches=[...wanted].filter(x=>bag.has(x));
        const specificity=matches.filter(x=>x.length>=3).length;
        const score=matches.length+specificity*2;
        return {entry,index,score,matched:matches.length,specificity,milestone:contactMilestone(entry.event)};
    });
    const related=ranked.filter(x=>x.matched>=2&&(x.specificity>=1||x.matched>=3))
        .sort((a,b)=>b.score-a.score||b.index-a.index).slice(0,3);
    const milestones=includeMilestones?ranked.filter(x=>x.milestone).slice(-3):[];
    const selected=new Map();
    for(const value of [...milestones,...related])selected.set(value.entry.source+'|'+value.entry.event,value);
    // Highest relevance survives bounded prompt trimming; milestone-only rows
    // are still included when the new query does not mention family contacts.
    return [...selected.values()].sort((a,b)=>(b.score+(b.milestone?3:0))-(a.score+(a.milestone?3:0))||b.index-a.index)
        .slice(0,limit).reverse().map(x=>({entry:x.entry,reason:x.matched>=2?'本轮话题相关':'已记载的重要交流',score:x.score}));
}
