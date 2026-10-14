import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createWeekPlan, setPickDay} from './baseline/week_plan.mjs';
import {createVenueFollowup} from './baseline/venue_followup.mjs';
import {makeCaregiverHandoff, readCaregiverHandoff} from './baseline/caregiver_handoff.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const output=path.join(root,'fixtures-v2');fs.mkdirSync(output);
const counts={picks:4,with_qloo_entity_id:4,with_affinity_evidence:0,constraint_checked:4,unsafe_candidates_rejected:0};
const response={mock:true,plan:{meals:Array.from({length:4},(_,i)=>({name:i<2?'Repeated café 海':'Fictional stop '+i,entity_id:i<2?'same-id':'fixture-'+i,kind:'restaurant',day:['Monday','Tuesday','Wednesday','Sunday'][i],why:'Original occurrence '+i,affinity:null})),outing:null,notes:['Synthetic receiving fixture.'],rejected:[]},llm_only:{meals:[],outing:{name:'Synthetic comparison',day:'Friday',why:'Retained'}},comparison:{constraints:[],grounded:counts,llm_only:counts},trace:[{tool:'receiving_fixture',args:{source:{ordinal:[1,2],label:'literal source'}},result_summary:'Synthetic original source'}]};
const inputs={city:'Fixture city',cuisines:['A','B'],music:[],films:[],constraints:[]};
const origin={response,inputs,receivedAt:'2026-10-01T12:00:00.000Z',calendarId:'0123456789abcdef0123456789abcdef'};
let state=createWeekPlan(response,'2026-12-28');
for (const [key,day] of Object.entries({'pick-0':'Monday','pick-1':'Tuesday','pick-2':null,'pick-3':'Sunday'}))state=setPickDay(state,key,day);
const envelope=JSON.parse(makeCaregiverHandoff({origin,state,model:createVenueFollowup(state)},new Date('2026-10-14T00:00:00.000Z')).text);
const clone=v=>structuredClone(v);
const empty={status:'not_contacted',question:null,reply:'',replyQuestions:null,nextStep:''};
envelope.venueNotes.records=[
 {key:'pick-0',date:'2026-12-28',note:{...empty,status:'awaiting_reply',nextStep:'Call before noon'}},
 {key:'pick-1',date:'2026-12-29',note:{...empty}},
 {key:'pick-2',date:'2026-11-02',note:{...empty}},
 {key:'pick-0',date:'2026-11-30',note:{...empty,question:'Earlier date question'}},
];
const revised=clone(envelope);revised.savedAt='2026-10-13T00:00:00.000Z';
revised.week.week.assignments={'pick-0':'Thursday','pick-1':null,'pick-2':'Saturday','pick-3':'Sunday'};
const revisedNote={status:'follow_up',question:' New question?\r\n海 🙂  ',reply:'Reply: <strong>literal text</strong>\n  retained spaces  ',replyQuestions:'Earlier recorded question?\r\nOriginal',nextStep:'Next: verify the entered note'};
revised.venueNotes.records=[clone(envelope.venueNotes.records[2]),{key:'pick-0',date:'2026-12-28',note:revisedNote},{key:'pick-3',date:'2027-01-03',note:{...empty}},clone(envelope.venueNotes.records[3])];
const cases={earlier:envelope,revised};
const emptySource=clone(envelope);emptySource.week.response.plan.meals=[];emptySource.week.response.plan.outing=null;emptySource.week.week.assignments={};emptySource.venueNotes.origin.response=clone(emptySource.week.response);emptySource.venueNotes.records=[];cases.empty=emptySource;
const shifted=clone(envelope);shifted.week.week.start='2027-01-04';cases['week-shift']=shifted;
const nullEmpty=clone(envelope);nullEmpty.venueNotes.records[2].note.question='';cases['empty-question']=nullEmpty;
const historyA=clone(envelope);historyA.venueNotes.records[0].note={...revisedNote,replyQuestions:'Historical A'};
const historyB=clone(historyA);historyB.venueNotes.records[0].note.replyQuestions='Historical B';cases['history-a']=historyA;cases['history-b']=historyB;
function reordered(v){if(Array.isArray(v))return v.map(reordered);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).reverse().map(k=>[k,reordered(v[k])]));return v;}
cases['property-order']=reordered(envelope);
for(const [label,mutate] of [
 ['source-deep',v=>{v.week.response.trace[0].args.source.ordinal=[2,1];v.venueNotes.origin.response=clone(v.week.response)}],
 ['source-inputs',v=>{v.week.inputs.cuisines.reverse();v.venueNotes.origin.inputs=clone(v.week.inputs)}],
 ['source-received',v=>{v.week.receivedAt='2026-10-01T12:00:00.001Z';v.venueNotes.origin.receivedAt=v.week.receivedAt}],
 ['source-calendar',v=>{v.week.calendarId=null;v.venueNotes.origin.calendarId=null}],
]){const v=clone(envelope);mutate(v);cases[label]=v;}
const invalid={};invalid.format={...clone(envelope),format:'other'};invalid.binding=clone(envelope);invalid.binding.venueNotes.origin.inputs.city='Different';invalid.duplicate=clone(envelope);invalid.duplicate.venueNotes.records.push(clone(invalid.duplicate.venueNotes.records[0]));
const manifest=[];
function save(name,body,admitted){fs.writeFileSync(path.join(output,name),body,{flag:'wx'});manifest.push({name,bytes:body.length,sha256:crypto.createHash('sha256').update(body).digest('hex'),admitted});}
for(const [name,value]of Object.entries(cases)){const text=JSON.stringify(value,null,2)+'\n';readCaregiverHandoff(text);save(name+'.json',Buffer.from(text),true);}
for(const[name,value]of Object.entries(invalid)){const text=JSON.stringify(value,null,2)+'\n';let refused=false;try{readCaregiverHandoff(text)}catch{refused=true}if(!refused)throw Error('Invalid fixture admitted: '+name);save('invalid-'+name+'.json',Buffer.from(text),false);}
save('invalid-json.json',Buffer.from('{'),false);save('invalid-utf8.json',Buffer.from([0xc3,0x28]),false);
const facts={arrangement:{moved:1,omitted:1,scheduled:1,unchanged:1},notes:{added:1,removed:1,changed:1,unchanged:2},noteOrder:[['pick-0','2026-12-28','changed'],['pick-1','2026-12-29','removed'],['pick-2','2026-11-02','unchanged'],['pick-0','2026-11-30','unchanged'],['pick-3','2027-01-03','added']],changedFields:['status','question','reply','replyQuestions','nextStep'],revisedNote,shiftedDates:['2027-01-04','2027-01-05',null,'2027-01-10']};
fs.writeFileSync(path.join(root,'expected-facts-v2.json'),JSON.stringify(facts,null,2)+'\n',{flag:'wx'});
fs.writeFileSync(path.join(root,'fixture-admission-v2.json'),JSON.stringify({schema:'hamon.handoff-compare-fixture-admission/1',scope:'Independent fixtures admitted with unchanged original reader before candidate exposure; no candidate execution.',source:'c93c83c4b5f05686dca5810427dd4f5f826709e9',files:manifest},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({fixtures:manifest.length,valid:manifest.filter(x=>x.admitted).length,invalid:manifest.filter(x=>!x.admitted).length}));
