import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const source=path.resolve(process.argv[2]||'C:\\Users\\minec\\tastetable-venue-resume-3dcb83a1\\candidate');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const git=b=>crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');
const clone=x=>structuredClone(x);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const st=fs.statfsSync(root);
if(st.bavail*st.bsize<1024**3||os.freemem()<2*1024**3)throw Error('Resource guard refused');
const pins={
 'static/venue_followup.mjs':{git:'0c1923ecdad8fe9b14f0193a6aba5f3a1e2b9d63',sha:'61bb9cf497b5a37a32afd1b23729e128aed2631cf2c570a1485ca4f0ffbe632c'},
 'static/venue_note_file.mjs':{git:'f8406cb540d52222996c585666ae1a55a1030def',sha:'7b099b0dcbbd714bc63497932787d20127236d82784e76861ae9f3a32f146af1'},
 'static/week_file.mjs':{git:'420ddb8f63fca264dcf97be7147801105696155d'},
 'static/week_plan.mjs':{git:'8ed28163e0273c510fdd8e6f7c5d1c8476efb862'}
};
const readPins=()=>Object.entries(pins).map(([relative,expected])=>{
 const p=path.join(source,relative),b=fs.readFileSync(p);assert.equal(git(b),expected.git,relative);if(expected.sha)assert.equal(sha(b),expected.sha,relative);
 return{path:relative,bytes:b.length,sha256:sha(b),git_blob:git(b)};
});
const report={utc:new Date().toISOString(),source,node:process.version,baselineSource:'2b347cee',sourcePins:readPins(),guard:{free_disk:st.bavail*st.bsize,available_memory:os.freemem()},checks:[],refusals:[],artifacts:[],sourceUnchanged:false,
 scope:'Actual public note model/file APIs, maintained saved-week roundtrip, real local JSON write/read and public call-sheet consumer. No browser/provider mocks or source edits.'};
function check(group,name,actual,expected){const pass=same(actual,expected);report.checks.push({group,name,pass,actual:clone(actual),expected:clone(expected)});}
const writeArtifact=(name,content)=>{const p=path.join(root,name),b=Buffer.from(content);fs.writeFileSync(p,b,{flag:'wx'});report.artifacts.push({path:name,bytes:b.length,sha256:sha(b),git_blob:git(b)});return p;};
let fatal;
try{
 const {createVenueFollowup}=await import(pathToFileURL(path.join(source,'static/venue_followup.mjs')).href);
 const {makeVenueNoteFile,readVenueNoteFile}=await import(pathToFileURL(path.join(source,'static/venue_note_file.mjs')).href);
 const {createWeekPlan,setWeek,setPickDay}=await import(pathToFileURL(path.join(source,'static/week_plan.mjs')).href);
 const {makeWeekFile,readWeekFile}=await import(pathToFileURL(path.join(source,'static/week_file.mjs')).href);
 const counts={picks:3,with_qloo_entity_id:3,with_affinity_evidence:0,constraint_checked:3,unsafe_candidates_rejected:0};
 const pick=(day,why)=>({name:'Synthetic Cedar Cafe',why,entity_id:'synthetic-shared-venue-01',kind:'restaurant',day,affinity:0.5,fallback:false});
 const response={mock:true,plan:{meals:[pick('Monday','Authored first occurrence.'),pick('Monday','Authored second occurrence.'),pick('Tuesday','Authored omitted occurrence.')],outing:null,notes:['Authored independent fixture.'],rejected:[]},
  llm_only:{meals:[],outing:{name:'Synthetic comparison only',why:'Not a recommendation.',day:'Sunday'}},
  comparison:{constraints:['wheelchair','low_sodium'],grounded:clone(counts),llm_only:{...counts,with_qloo_entity_id:0,constraint_checked:0}},
  trace:[{tool:'synthetic_fixture',args:{request_marker:'original-request',nested:{trace_identity:'trace-one'}},result_summary:'Locally authored fixture; no provider contacted.'}]};
 const inputs={city:'Synthetic Source City',cuisines:['fixture-cuisine'],music:[],films:[],constraints:['wheelchair','low_sodium']};
 const origin={receivedAt:'2026-10-08T12:00:00.000Z',calendarId:'11111111111111111111111111111111',inputs:clone(inputs),response:clone(response)};
 let state=createWeekPlan(response,'2026-10-12');const model=createVenueFollowup(state);
 const [a,b,c]=model.entries(state);
 check('occurrence identity','same venue and date still have different source occurrence keys',[a.pick.entity_id===b.pick.entity_id,a.pick.name===b.pick.name,a.date===b.date,a.key!==b.key],[true,true,true,true]);
 const bBefore=clone(b.note);
 const qOld='\u2003Can the north entrance fit two chairs?\nPlease confirm the quiet table.  ';
 const qNew='Revised: which entrance will be open?\nKeep the exact route in the reply.';
 const reply=' \nPhone reply: "ask for Ana" — α, café 🙂\t ';
 model.setField(state,a.key,a.date,'question',qOld);
 model.setField(state,a.key,a.date,'reply',reply);
 model.setField(state,a.key,a.date,'status','reply_recorded');
 check('occurrence identity','first reply leaves the same-name second visit unchanged',model.entries(state).find(x=>x.key===b.key).note,bBefore);
 model.setField(state,a.key,a.date,'question',qNew);
 model.setField(state,a.key,a.date,'nextStep','Ask again about the revised entrance.');
 model.setField(state,b.key,b.date,'question','Independent second-visit question.');
 model.setField(state,b.key,b.date,'reply','Second visit has a separate reply.');
 model.setField(state,b.key,b.date,'status','reply_recorded');
 model.setField(state,c.key,c.date,'nextStep','Retain this note while the visit is omitted.');
 const previousWeek=setWeek(state,'2026-10-05');
 model.setField(previousWeek,a.key,'2026-10-05','nextStep','Keep the earlier-date record.');
 state=setPickDay(state,c.key,null);
 const aUpdated=model.entries(state).find(x=>x.key===a.key);
 check('reply provenance','revised questions preserve the exact earlier reply questions',aUpdated.note.replyQuestions,qOld);
 check('reply provenance','literal reply survives later question editing',aUpdated.note.reply,reply);
 check('reply provenance','revised-question flag and follow-up status are explicit',[aUpdated.questionsChangedAfterReply,aUpdated.note.status],[true,'follow_up']);
 const sourceRecords=clone(model.snapshotRecords());
 check('full record export','retained record set includes both same-day visits, omitted visit and earlier date',sourceRecords.map(r=>[r.key,r.date]),[[a.key,a.date],[b.key,b.date],[c.key,c.date],[a.key,'2026-10-05']]);
 const context={model,state,date:'2026-10-12',origin};
 const file=makeVenueNoteFile(context,new Date('2026-10-08T13:00:00.000Z'));
 const notesPath=writeArtifact('authored-venue-notes.json',file.text);
 const loadedText=fs.readFileSync(notesPath,'utf8');
 check('full record export','actual JSON file roundtrip retains every complete record',JSON.parse(loadedText).records,sourceRecords);
 const week=makeWeekFile({...origin,state},new Date('2026-10-08T13:00:01.000Z'));
 const weekPath=writeArtifact('authored-saved-week.json',week.text);
 const restored=readWeekFile(fs.readFileSync(weekPath,'utf8'));
 const targetState=restored.state,target=createVenueFollowup(targetState,'Independent reopened week.');
 const targetOrigin={receivedAt:restored.receivedAt,calendarId:restored.calendarId,inputs:restored.inputs,response:restored.response};
 const targetContext={model:target,state:targetState,date:'2026-10-12',origin:targetOrigin};
 target.setField(targetState,a.key,a.date,'nextStep','Local current record before preview.');
 const localFuture=setWeek(targetState,'2026-10-19');
 target.setField(localFuture,b.key,'2026-10-19','nextStep','Local-only record intentionally replaced on explicit apply.');
 const beforePreview=clone(target.snapshotRecords());
 const prepared=readVenueNoteFile(loadedText,targetContext);
 check('explicit replacement','reading and preparing a valid companion does not alter current records',target.snapshotRecords(),beforePreview);
 check('explicit replacement','prepared records are exactly the exported set',prepared.records,sourceRecords);
 target.replaceRecords(prepared.records);
 check('explicit replacement','explicit apply replaces the complete validated record set',target.snapshotRecords(),sourceRecords);
 check('explicit replacement','local-only record is removed only by declared whole-file replacement',target.snapshotRecords().some(r=>r.date==='2026-10-19'),false);
 const reopened=target.entries(targetState),ra=reopened.find(x=>x.key===a.key),rb=reopened.find(x=>x.key===b.key);
 check('reply provenance','first visit retains exact reply and old/current question distinction',[ra.note.reply,ra.note.replyQuestions,ra.questionText,ra.note.status,ra.questionsChangedAfterReply],[reply,qOld,qNew,'follow_up',true]);
 check('occurrence identity','same-name second visit keeps its own reply and original attribution',[rb.note.reply,rb.note.replyQuestions,rb.key,rb.date],['Second visit has a separate reply.','Independent second-visit question.',b.key,b.date]);
 const oldVisit=target.entries(setWeek(targetState,'2026-10-05')).find(x=>x.key===a.key);
 check('full record export','earlier-date record survives fresh-week and companion roundtrip',oldVisit.note.nextStep,'Keep the earlier-date record.');
 const unomitted=target.entries(setPickDay(targetState,c.key,'Tuesday')).find(x=>x.key===c.key);
 check('full record export','omitted record reappears with its exact note when rescheduled',unomitted.note.nextStep,'Retain this note while the visit is omitted.');
 const callSheet=target.text(targetState);
 writeArtifact('reopened-call-sheet.txt',callSheet);
 const indent=s=>s.split(/\r?\n/).map(x=>'  '+x).join('\n');
 check('real native consumer','call sheet names the first and second occurrences',[callSheet.includes('Suggested visit 1;'),callSheet.includes('Suggested visit 2;')],[true,true]);
 check('real native consumer','call sheet preserves the earlier question and literal reply blocks',[callSheet.includes('Questions for the earlier reply / notes:\n'+indent(qOld)),callSheet.includes('Earlier reply / notes (for the previous questions):\n'+indent(reply))],[true,true]);
 check('real native consumer','call sheet retains the revised-question warning',callSheet.includes('Questions changed after these notes were entered.'),true);
 const beforeRefusal=clone(target.snapshotRecords());
 for(const kind of ['original request','original trace']){
  const altered=clone(targetOrigin);
  if(kind==='original request')altered.inputs.city='Different accepted original request';
  else altered.response.trace[0].args.nested.trace_identity='different-trace-only';
  // This remains a structurally valid accepted-origin/week; the refusal must be the companion binding.
  const validOriginWeek=makeWeekFile({...altered,state:targetState},new Date('2026-10-08T13:02:00.000Z'));
  check('full origin refusal',kind+' control retains the same visible week and arrangement',readWeekFile(validOriginWeek.text).state,targetState);
  let error=null;
  try{readVenueNoteFile(loadedText,{...targetContext,origin:altered});}catch(e){error={name:e.name,message:e.message};}
  report.refusals.push({kind,error});
  check('full origin refusal',kind+' mismatch refuses specifically as a different accepted plan',Boolean(error&&error.name==='TypeError'&&error.message.includes('different accepted plan')),true);
  check('full origin refusal',kind+' refusal preserves all current occurrence/date records',target.snapshotRecords(),beforeRefusal);
 }
 check('source custody','original exporting model remains unchanged',model.snapshotRecords(),sourceRecords);
 check('source custody','all four imported source files remain byte-identical',readPins(),report.sourcePins);
 report.sourceUnchanged=same(readPins(),report.sourcePins);
 report.fixture={origin,sourceRecords,exportFilename:file.filename,sourceWeekStart:state.weekStart,sourceAssignments:state.assignments};
 report.finalRecords=clone(target.snapshotRecords());report.originalImportClosureIsUnmodified=true;
}catch(error){fatal=error;report.error={name:error.name,message:error.message,stack:error.stack};}
report.passed=report.checks.filter(x=>x.pass).length;report.failed=report.checks.filter(x=>!x.pass).length;report.completedUTC=new Date().toISOString();
const output=Buffer.from(JSON.stringify(report,null,2)+'\n');fs.writeFileSync(path.join(root,'independent-results.json'),output,{flag:'wx'});
console.log(JSON.stringify({passed:report.passed,failed:report.failed,fatal:report.error??null,sourceUnchanged:report.sourceUnchanged,result:path.join(root,'independent-results.json'),sha256:sha(output)}));
if(fatal||report.failed)process.exitCode=1;
