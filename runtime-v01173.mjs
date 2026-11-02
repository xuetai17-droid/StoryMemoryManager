import fs from 'node:fs';import vm from 'node:vm';
import * as retrieval from '../history-selection-v01173.js';
import * as d from '../digest-parser-v01172.js';import * as a from '../character-archive-v01172.js';import * as c from '../calendar-evidence-v01172.js';import * as t from '../time-evidence-v01172.js';import * as h from '../hide-policy-v01170.js';import * as s from '../summary-policy-v01169.js';
export function runtime(mem,raw,entry='index-v0.11.73.js'){
 const chat=raw.map(m=>({...m,is_user:m.role==='user',is_system:!!m.is_hidden}));
 const ctx={chat,chatMetadata:{story_memory_manager_v2:mem},extensionSettings:{},saveMetadata:async()=>{},saveSettingsDebounced:()=>{},name1:'薛伶',name2:'蔚野'};
 const box={...retrieval,...d,...a,...c,...t,...h,...s,SillyTavern:{getContext:()=>ctx},structuredClone,TextEncoder,URL,Blob,console,
 document:{getElementById:()=>null,querySelectorAll:()=>[]},fetch:()=>{throw Error('NETWORK FORBIDDEN')},setTimeout:()=>0,clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{}};box.window=box;vm.createContext(box);
 const code=fs.readFileSync(new URL('../'+entry,import.meta.url),'utf8').replace(/^import .*;\n/gm,'').split('// Compatibility boot:')[0];
 vm.runInContext(code+'\nrefresh=()=>{};globalThis.test={buildSafeMemoryPromptV0100,repairNarrativeCalendarV01130,refreshCurrentStoryStateV01121,repairStoryCalendarOnceV01155,legacyTimelineHTML,displayTimelineTimeLocalV0119,checkSmmWorldbookActivationV01166,syncSmmWorldbookV01163,legacyReadableHTML,...(typeof managedWorldbookContentV01173==="function"?{managedWorldbookContentV01173,repairTimeAndBookV01173}:{})};',box);
 return {ctx,box,test:box.test};
}
