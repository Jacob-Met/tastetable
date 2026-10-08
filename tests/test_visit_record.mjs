import test from "node:test";
import assert from "node:assert/strict";
import { readWeekFile } from "../static/week_file.mjs";
import { createVisitRecord, updateVisitRecord, visitRecordRows, makeVisitRecordFile, readVisitRecord } from "../static/visit_record.mjs";

const counts = {picks:0,with_qloo_entity_id:0,with_affinity_evidence:0,constraint_checked:0,unsafe_candidates_rejected:0};
function savedText(number = 3) {
  const meals = Array.from({length:number}, (_, i) => ({
    name:i < 2 ? "Same café" : "Visit " + i, entity_id:i < 2 ? "same-id" : "id-" + i,
    kind:"restaurant",day:["Monday","Wednesday","Friday"][i % 3],
    why:"Original explanation <literal> " + i, extra:{ordinal:i},
  }));
  const envelope = {
    format:"tastetable.saved-week.v1",receivedAt:"2024-02-01T00:00:00.000Z",
    savedAt:"2024-02-25T18:00:00.000Z",calendarId:null,
    inputs:{city:"Example City",cuisines:["Café"],music:[],films:[],constraints:[],opaque:"retained"},
    response:{mock:true,plan:{meals,outing:null,notes:["Original note"],rejected:[]},
      llm_only:{meals:[],outing:{name:"Comparison",day:"Saturday",why:"Original"}},
      comparison:{constraints:[],grounded:counts,llm_only:counts},trace:[],opaque:{escaped:"\\ud800"}},
    week:{start:"2024-02-26",assignments:Object.fromEntries(meals.map((p,i)=>["pick-"+i,i===1?null:"Thursday"]))},
    opaque:{sourceFormatting:"unchanged"},
  };
  return "\uFEFF" + JSON.stringify(envelope,null,2).replaceAll("\n","\r\n") + "\r\n";
}
const source = savedText(), make = () => createVisitRecord(source," original-week.json ");
const clone = value => structuredClone(value);
test("native codec accepts the original fixture before the new module consumes it",()=> {
  assert.equal(readWeekFile(source).state.picks.length,3);
});
test("each occurrence starts unrecorded, including omitted and repeated identities",()=>{
  const record=make();assert.equal(record.source.weekText,source);assert.equal(record.source.name," original-week.json ");
  assert.deepEqual(record.visits,[0,1,2].map(i=>({key:"pick-"+i,outcome:"unrecorded",date:null,note:""})));
  let changed=updateVisitRecord(record,"pick-0",{outcome:"went"});
  assert.equal(changed.visits[1].outcome,"unrecorded");assert.equal(record.visits[0].outcome,"unrecorded");
});
test("projection retains the complete original pick, saved assignments and exact dates",()=>{
  const rows=visitRecordRows(make());
  assert.deepEqual(rows.map(r=>[r.key,r.plannedDay,r.plannedDate]),[["pick-0","Thursday","2024-02-29"],["pick-1",null,null],["pick-2","Thursday","2024-02-29"]]);
  assert.equal(rows[0].originalDay,"Monday");assert.deepEqual(rows[0].pick.extra,{ordinal:0});
  assert.throws(()=>{rows[0].pick.extra.ordinal=8},TypeError);
});
test("date and note do not infer attendance; outside-week dates are explicit",()=>{
  const record=updateVisitRecord(make(),"pick-1",{date:"2025-01-01",note:"We changed our minds."});
  assert.equal(record.visits[1].outcome,"unrecorded");assert.equal(record.visits[1].date,"2025-01-01");
});
test("literal CR/LF, whitespace and astral Unicode survive unrelated updates and export",()=>{
  let record=updateVisitRecord(make(),"pick-0",{note:"  A\rB\r\nC\n🙂\t "});
  record=updateVisitRecord(record,"pick-0",{date:"2024-02-29",outcome:"did_not_go"});
  const reopened=readVisitRecord(makeVisitRecordFile(record,new Date("2024-03-01T12:00:00.000Z")).text);
  assert.deepEqual(reopened.record,record);assert.equal(reopened.record.source.weekText,source);
  assert.equal(reopened.record.visits[0].note,"  A\rB\r\nC\n🙂\t ");
});
test("Gregorian dates admit year endpoints and leap-century rules",()=>{
  for(const date of ["0001-01-01","9999-12-31","2000-02-29","2024-02-29"])assert.equal(updateVisitRecord(make(),"pick-0",{date}).visits[0].date,date);
  for(const date of ["0000-01-01","1900-02-29","2100-02-29","2023-02-29","2024-04-31","2024-13-01","2024-2-01","2024-02-29T00:00:00Z","",42])assert.throws(()=>updateVisitRecord(make(),"pick-0",{date}));
});
test("notes and source names count code points and preserve admitted whitespace",()=>{
  const notes="🙂".repeat(4000);assert.equal(updateVisitRecord(make(),"pick-0",{note:notes}).visits[0].note,notes);
  assert.throws(()=>updateVisitRecord(make(),"pick-0",{note:notes+"a"}));
  assert.equal(createVisitRecord(source,"🙂".repeat(512)).source.name.length,1024);
  assert.throws(()=>createVisitRecord(source,"🙂".repeat(513)));
  for(const bad of [""," \t ","a\n","a\0","a\u007f","\ud800"])assert.throws(()=>createVisitRecord(source,bad));
  for(const bad of ["x\0","x\b","x\u007f","\ud800","\udfff"])assert.throws(()=>updateVisitRecord(make(),"pick-0",{note:bad}));
  assert.throws(()=>createVisitRecord(source+"\ud800","week.json"));
});
test("valid reordered visits are restored to original occurrence order",()=>{
  const record=clone(make());record.visits.reverse();record.visits[0].note="third";
  assert.equal(visitRecordRows(record)[2].note,"third");
  assert.deepEqual(readVisitRecord(makeVisitRecordFile(record).text).record.visits.map(v=>v.key),["pick-0","pick-1","pick-2"]);
});
test("all operations validate full records without mutating a refused input",()=>{
  const invalidRecords=[];
  let r=clone(make());r.extra=1;invalidRecords.push(r);
  r=clone(make());r.source.extra=1;invalidRecords.push(r);
  r=clone(make());delete r.source.name;invalidRecords.push(r);
  r=clone(make());r.visits.pop();invalidRecords.push(r);
  r=clone(make());r.visits[1].key="pick-0";invalidRecords.push(r);
  r=clone(make());r.visits[1].key="pick-100";invalidRecords.push(r);
  r=clone(make());delete r.visits[1].date;invalidRecords.push(r);
  r=clone(make());r.visits[1].extra=true;invalidRecords.push(r);
  for(const bad of invalidRecords){
    const before=JSON.stringify(bad);
    for(const call of [()=>updateVisitRecord(bad,"pick-0",{note:"new"}),()=>visitRecordRows(bad),()=>makeVisitRecordFile(bad)])assert.throws(call);
    assert.equal(JSON.stringify(bad),before);
  }
});
test("invalid patches and unsupported outcomes refuse atomically",()=>{
  const record=make(), before=JSON.stringify(record);
  for(const patch of [{key:"pick-1"},{outcome:"visited"},{date:undefined},{note:undefined},{x:1},[],null])assert.throws(()=>updateVisitRecord(record,"pick-0",patch));
  assert.throws(()=>updateVisitRecord(record,"pick-99",{}));assert.deepEqual(updateVisitRecord(record,"pick-0",{}),record);
  assert.equal(JSON.stringify(record),before);
});
test("record envelope uses an exact field set and canonical finite save time",()=>{
  const good=makeVisitRecordFile(make(),new Date("2024-03-01T00:00:00.000Z"));
  assert.equal(good.filename,"tastetable-visits-2024-02-26.json");
  assert.equal(readVisitRecord(good.text).savedAt,"2024-03-01T00:00:00.000Z");
  for(const patch of [{format:"other"},{savedAt:"2024-03-01"},{savedAt:"invalid"},{extra:true}]){
    assert.throws(()=>readVisitRecord(JSON.stringify({...JSON.parse(good.text),...patch})));
  }
  assert.throws(()=>makeVisitRecordFile(make(),new Date(NaN)));assert.throws(()=>makeVisitRecordFile(make(),"2024-01-01"));
  for(const field of ["format","savedAt","source","visits"]){const data=JSON.parse(good.text);delete data[field];assert.throws(()=>readVisitRecord(JSON.stringify(data)))}
  const extended=makeVisitRecordFile(make(),new Date("+010000-01-01T00:00:00.000Z"));assert.equal(readVisitRecord(extended.text).savedAt,"+010000-01-01T00:00:00.000Z");
});
test("zero and 100 original picks are supported; 101 is refused without changing source",()=>{
  assert.equal(createVisitRecord(savedText(0),"empty.json").visits.length,0);
  assert.equal(createVisitRecord(savedText(100),"full.json").visits.length,100);
  assert.throws(()=>createVisitRecord(savedText(101),"too-many.json"));
});
test("source and file UTF-8 budgets are enforced before parsing",()=>{
  assert.throws(()=>createVisitRecord(" ".repeat(2*1024*1024+1),"large.json"));
  assert.throws(()=>readVisitRecord(" ".repeat(8*1024*1024+1)));
  assert.throws(()=>readVisitRecord("{"));
});
