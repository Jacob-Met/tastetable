import test from "node:test";
import assert from "node:assert/strict";
import { compareVenueNotes, NOTE_FIELDS } from "../static/venue_note_changes.mjs";
import { createWeekPlan, setPickDay, setWeek } from "../static/week_plan.mjs";
import { createVenueFollowup } from "../static/venue_followup.mjs";
const note=(extra={})=>({status:"not_contacted",question:null,reply:"",replyQuestions:null,nextStep:"",...extra});
const row=(key,date,n=note())=>({key,date,note:n});
const a=row("pick-0","2026-12-28"), b=row("pick-1","2026-12-28"), c=row("pick-0","2027-01-04");
test("union classifies exact identities without dropping current-only records",()=>{
 const current=[a,b,c], incoming=[{...a,note:note({nextStep:"Call"})},c,row("pick-2","2026-12-29")];
 const result=compareVenueNotes(current,incoming);
 assert.deepEqual(result.counts,{added:1,removed:1,changed:1,unchanged:1});
 assert.deepEqual(result.records.map(x=>[x.key,x.date,x.change]),[
 ["pick-0","2026-12-28","changed"],["pick-1","2026-12-28","removed"],
 ["pick-0","2027-01-04","unchanged"],["pick-2","2026-12-29","added"]]);
 assert.deepEqual(result.records[0].changedFields,["nextStep"]);
 assert.equal(result.records[1].after,null); assert.deepEqual(result.records[1].before,b.note);
 assert.equal(result.records[3].before,null);
});
test("empty replacement exposes every deletion; empty current exposes every addition",()=>{
 assert.deepEqual(compareVenueNotes([a,b,c],[]).counts,{added:0,removed:3,changed:0,unchanged:0});
 assert.deepEqual(compareVenueNotes([],[a,b,c]).counts,{added:3,removed:0,changed:0,unchanged:0});
 assert.deepEqual(compareVenueNotes([],[]).records,[]);
});
test("reordering alone never changes notes and retains stable current order",()=>{
 const r=compareVenueNotes([a,b,c],[c,a,b]);
 assert.deepEqual(r.counts,{added:0,removed:0,changed:0,unchanged:3});
 assert.deepEqual(r.records.map(x=>[x.key,x.date]),[a,b,c].map(x=>[x.key,x.date]));
});
test("all five stored fields compare exactly, including null versus empty",()=>{
 for(const field of NOTE_FIELDS){
  const after=note({[field]:field==="status"?"awaiting_reply":""});
  const before=note({[field]:field==="status"?"not_contacted":null});
  if(["reply","nextStep"].includes(field)){ before[field]=" "; }
  const result=compareVenueNotes([row("pick-0","2026-12-28",before)],[row("pick-0","2026-12-28",after)]);
  assert.deepEqual(result.records[0].changedFields,[field]); assert.equal(result.records[0].change,"changed");
 }
});
test("literal Unicode, markup, spacing and CRLF are retained without normalization",()=>{
 const content='\n海 🧭 </pre><img src=x>\r\n  keep  ';
 const current=row("pick-0","2026-12-28",note({reply:content,replyQuestions:"q"}));
 const incoming=structuredClone(current);incoming.note.reply=content.replace("\r\n","\n");
 const result=compareVenueNotes([current],[incoming]);
 assert.equal(result.records[0].before.reply,content);assert.equal(result.records[0].after.reply,incoming.note.reply);
 assert.deepEqual(result.records[0].changedFields,["reply"]);
});
test("projection is detached, deeply frozen and cannot mutate either input",()=>{
 const current=[structuredClone(a)],incoming=[row("pick-0","2026-12-28",note({nextStep:"Next"}))];
 const result=compareVenueNotes(current,incoming), snapshot=structuredClone(result);
 current[0].note.question="Later";incoming[0].note.nextStep="Later";
 assert.deepEqual(result,snapshot);
 assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.counts)&&Object.isFrozen(result.records));
 for(const r of result.records)assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.changedFields)&&Object.isFrozen(r.before)&&Object.isFrozen(r.after));
 assert.throws(()=>{result.records[0].before.reply="No";},TypeError);
});
test("unexpected missing fields and duplicate identities refuse instead of hiding records",()=>{
 assert.throws(()=>compareVenueNotes([a,a],[]),/Repeated/);
 assert.throws(()=>compareVenueNotes([],[a,a]),/Repeated/);
 assert.throws(()=>compareVenueNotes(null,[]),TypeError);
 assert.throws(()=>compareVenueNotes([{...a,note:{status:"not_contacted"}}],[]),TypeError);
});
test("actual native model records include omitted visits and old dates without mutation",()=>{
 const response={mock:true,plan:{meals:[
 {day:"Monday",kind:"restaurant",entity_id:"same",name:"same",why:"one"},
 {day:"Monday",kind:"restaurant",entity_id:"same",name:"same",why:"two"}],outing:null},comparison:{constraints:[]}};
 let state=createWeekPlan(response,"2026-12-28"); const model=createVenueFollowup(state);
 model.setField(state,"pick-0","2026-12-28","reply","First");
 model.setField(state,"pick-1","2026-12-28","reply","Second");
 state=setWeek(state,"2027-01-04");model.setField(state,"pick-0","2027-01-04","reply","Later");
 state=setPickDay(state,"pick-0",null);
 const before=model.snapshotRecords(),after=model.prepareRecords([before[1]]);
 const compared=compareVenueNotes(before,after);
 assert.equal(compared.counts.removed,2);assert.equal(compared.counts.unchanged,1);
 assert.equal(compared.records[2].date,"2027-01-04");assert.equal(compared.records[2].before.reply,"Later");
 assert.deepEqual(model.snapshotRecords(),before);assert.equal(state.assignments["pick-0"],null);
});
