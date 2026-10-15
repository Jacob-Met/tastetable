import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
const base='/dev/shm/hamon-memory-tastetable-selective-recovery-5e567/original';
const root=path.dirname(fileURLToPath(import.meta.url));
const pins=JSON.parse(fs.readFileSync('/dev/shm/hamon-memory-tastetable-selective-recovery-5e567/original-source-pins.json','utf8'));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const relevant=['static/saved_weeks.mjs','static/week_plan.mjs','static/week_file.mjs','static/saved_week_collection.mjs','tests/fixtures/saved-week-response.json'];
for(const name of relevant){const row=pins.files.find(x=>x.path===name);assert(row);const b=fs.readFileSync(path.join(base,name));assert.equal(b.length,row.bytes);assert.equal(sha(b),row.sha256);}
const {createDraft,validateDraft}=await import(pathToFileURL(path.join(base,'static/saved_weeks.mjs')).href);
const {createWeekPlan}=await import(pathToFileURL(path.join(base,'static/week_plan.mjs')).href);
const {COLLECTION_FORMAT,readCollectionBackup,planCollectionRestore}=await import(pathToFileURL(path.join(base,'static/saved_week_collection.mjs')).href);
const response=JSON.parse(fs.readFileSync(path.join(base,'tests/fixtures/saved-week-response.json'),'utf8'));
const date='2026-10-14T04:00:00.000Z';
const a=createDraft({id:'selected_A',name:'Current A',response,inputs:{cuisines:[],music:[],films:[],city:'Pasadena',constraints:['soft_foods','low_sodium','wheelchair']},weekState:createWeekPlan(response,'2026-12-31'),receivedAt:date,calendarId:'0123456789abcdef0123456789abcdef',now:new Date(date)});
const b={...a,id:'selected_B',name:'Current B identical'};
const c={...a,id:'selected_C',name:'<literal> café 雪 & "C"',text:'\uFEFF'+a.text.replace(/\n/g,'\r\n')};
const d={...a,id:'selected_D',name:'Missing D'};
const e={...a,id:'selected_E',name:'Added after preview by another writer'};
const f={...a,id:'selected_F',name:'Must remain absent after stale refusal'};
const incomingA={...a,name:'Conflicting incoming A'};
for(const record of [a,b,c,d,e,f,incomingA]) assert.deepEqual(validateDraft(record),record);
const envelope=records=>({format:COLLECTION_FORMAT,savedAt:date,records});
const current=[a,b],mixed=envelope([d,incomingA,b,c]),stale=envelope([f]),replacement=envelope([b]);
const mixedText=JSON.stringify(mixed,null,2)+'\n';
assert.deepEqual(readCollectionBackup(mixedText),mixed);
const plan=planCollectionRestore(mixed,current.map(draft=>({id:draft.id,draft})));
assert.deepEqual(plan.missing.map(x=>x.id),['selected_D','selected_C']);
assert.deepEqual(plan.identical.map(x=>x.id),['selected_B']);
assert.deepEqual(plan.conflicts.map(x=>x.incoming.id),['selected_A']);
assert.deepEqual(plan.expected.map(x=>x.id),['selected_A','selected_B']);
assert.equal(plan.canApply,false);
assert.equal(plan.totalAfter,4);
const cases={'initial-records.json':current,'mixed-backup.json':mixed,'stale-backup.json':stale,'replacement-identical-backup.json':replacement,'external-addition.json':e,'expected-after-selected.json':[a,b,c,d],'expected-after-stale-refusal.json':[a,b,c,d,e]};
const out=path.join(root,'fixtures');fs.mkdirSync(out);
const artifacts={};
for(const [name,value] of Object.entries(cases)){
 const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');
 fs.writeFileSync(path.join(out,name),bytes,{flag:'wx'});
 artifacts[name]={bytes:bytes.length,sha256:sha(bytes)};
}
for(const name of relevant){const row=pins.files.find(x=>x.path===name);const data=fs.readFileSync(path.join(base,name));assert.equal(sha(data),row.sha256);}
const result={schema:'tastetable143.original-fixture-admission/1',utc:new Date().toISOString(),source: pins.base,scope:'One original-helper fixture construction/admission; no candidate, collection UI, IndexedDB, browser, backend or provider call.',originals:relevant.map(name=>pins.files.find(x=>x.path===name)),fixture_records:7,artifacts,mixed:{missing:['selected_D','selected_C'],identical:['selected_B'],conflicting:['selected_A'],expected:['selected_A','selected_B'],canApply:false,totalAfter:4},literalC:{startsWithBOM:c.text.startsWith('\uFEFF'),containsCRLF:c.text.includes('\r\n'),textBytes:Buffer.byteLength(c.text),textSha256:sha(Buffer.from(c.text))}};
fs.writeFileSync(path.join(root,'fixture-admission.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
process.stdout.write(JSON.stringify(result)+'\n');

