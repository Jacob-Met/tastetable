import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createWeekPlan, setPickDay } from "../static/week_plan.mjs";
import { makeWeekFile } from "../static/week_file.mjs";
import { createVenueFollowup } from "../static/venue_followup.mjs";
import { makeVenueNoteFile } from "../static/venue_note_file.mjs";

const output = resolve(process.argv[2]); mkdirSync(output, { recursive: true });
const counts = { picks: 5, with_qloo_entity_id: 5, with_affinity_evidence: 0, constraint_checked: 5, unsafe_candidates_rejected: 0 };
const inputs = { cuisines: ["Authored fictional"], music: [], films: [], city: "Fixture only", constraints: ["wheelchair"] };
const response = { mock: true, plan: {
  meals: ["Monday","Tuesday","Wednesday","Thursday","Friday"].map((day,i) => ({
    day, kind: "restaurant", entity_id: "SAME-FICTIONAL-ID", name: 'Same café 海 <img src=x onerror="window.injected=1">',
    why: "Authored occurrence " + (i+1) + "; no real venue", affinity: null
  })), outing: null, notes: ["Authored synthetic plan"], rejected: []
}, comparison: {constraints:inputs.constraints, grounded:counts, llm_only:counts},
llm_only: {meals:[], outing:{day:"Friday",name:"Synthetic comparison",why:"No recommendation"}},
trace:[{tool:"authored_fixture",args:{},result_summary:"No provider request"}]};
const origin={response,inputs,receivedAt:"2026-10-08T17:00:00.000Z",calendarId:"0123456789abcdef0123456789abcdef"};
const state=setPickDay(createWeekPlan(response,"2026-12-28"),"pick-3",null);
const model=createVenueFollowup(state), context={origin,state,model}, now=new Date("2026-10-09T01:00:00.000Z");
const note=(reply,nextStep="")=>({status:"follow_up",question:"Question?\r\nKeep exact spacing  ",reply,replyQuestions:"Question?\r\nKeep exact spacing  ",nextStep});
const row=(key,date,n)=>({key,date,note:n});
const current=[
 row("pick-0","2026-12-28",note('BEFORE_CHANGED </pre><img src=x onerror="window.injected=1">\r\n海 🧭',"Call before visiting")),
 row("pick-1","2026-12-29",note("REMOVE_CURRENT_ONLY_SENTINEL","Keep until review")),
 row("pick-2","2026-12-30",note("EXACT_UNCHANGED\r\n  keep  ","Wait")),
 row("pick-3","2027-01-04",note("REMOVE_OLD_DATE_SENTINEL"))
];
const incoming=[
 row("pick-0","2026-12-28",{status:"not_contacted",question:"",reply:"",replyQuestions:null,nextStep:""}),
 current[2],
 row("pick-4","2027-01-01",{status:"not_contacted",question:null,reply:"",replyQuestions:null,nextStep:"New note <b>literal</b>"}),
 row("pick-3","2026-12-31",note("ADD_OMITTED_DATE_SENTINEL"))
];
writeFileSync(resolve(output,"week.json"),makeWeekFile({...origin,state},now).text);
for(const [name,records] of Object.entries({current,incoming,equal:current,empty:[]})){
 model.replaceRecords(records);writeFileSync(resolve(output,name+".json"),makeVenueNoteFile(context,now).text);
}
const wrong=JSON.parse(makeVenueNoteFile(context,now).text);wrong.origin.calendarId="fedcba9876543210fedcba9876543210";
writeFileSync(resolve(output,"wrong-origin.json"),JSON.stringify(wrong));
writeFileSync(resolve(output,"malformed.json"),"{");
writeFileSync(resolve(output,"expected.json"),JSON.stringify({current,incoming,counts:{added:2,removed:2,changed:1,unchanged:1}},null,2));
console.log(JSON.stringify({output,fixtures:8,current:current.length,incoming:incoming.length}));
