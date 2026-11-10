import test from "node:test";
import assert from "node:assert/strict";
import { readVisitHistory, priorVisitLabel } from "../static/visit_history.mjs";
import { createVisitRecord, updateVisitRecord, makeVisitRecordFile } from "../static/visit_record.mjs";
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

function history(mock=true) {
 let week=JSON.parse(savedText().replace(/^\uFEFF/,"")); week.response.mock=mock;
 let record=createVisitRecord(JSON.stringify(week),"unfamiliar-week.json");
 record=updateVisitRecord(record,"pick-0",{outcome:"went",date:"2024-03-02",note:"PRIVATE health note"});
 record=updateVisitRecord(record,"pick-1",{outcome:"went"});
 record=updateVisitRecord(record,"pick-2",{outcome:"did_not_go",date:"2024-03-05"});
 return readVisitHistory(makeVisitRecordFile(record).text);
}
test("exact provenance and identity, not a matching venue name, determines history",()=>{
 const h=history();
 assert.match(priorVisitLabel(h,"mock",{kind:"restaurant",entity_id:"same-id"}),/2 recorded visits/);
 assert.equal(priorVisitLabel(h,"live",{kind:"restaurant",entity_id:"same-id"}),"");
 assert.equal(priorVisitLabel(h,"mock",{kind:"outing",entity_id:"same-id"}),"");
 assert.equal(priorVisitLabel(h,"mock",{kind:"restaurant",entity_id:"different",name:"Same café"}),"");
 assert.equal(priorVisitLabel(h,"mock",{kind:"restaurant",entity_id:"id-2"}),"");
});
test("actual dated and undated attendance remain distinct; notes are not retained",()=>{
 const h=history(), label=priorVisitLabel(h,"mock",{kind:"restaurant",entity_id:"same-id"});
 assert.match(label,/2024-03-02/); assert.match(label,/1 without a date/);
 assert.equal(JSON.stringify([...h.venues]).includes("PRIVATE"),false);
 assert.equal(JSON.stringify(h).includes("weekText"),false);
});
test("unknown source is refused; clearing means no markers",()=>{
 assert.throws(()=>history(null),/source/);
 assert.equal(priorVisitLabel(null,"mock",{kind:"restaurant",entity_id:"same-id"}),"");
});
