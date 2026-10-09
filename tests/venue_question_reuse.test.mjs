import assert from "node:assert/strict";
import test from "node:test";
import { createWeekPlan, setPickDay, setWeek } from "../static/week_plan.mjs";
import { createVenueFollowup } from "../static/venue_followup.mjs";
import { createQuestionReuse, mountQuestionReuse, questionReuseChoices } from "../static/venue_question_reuse.mjs";

const question = "\r\nCan we keep CRLF?\rKeep this lone CR.\nKeep LF, <em>literal</em> & café 🧭.\r\n";
function setup() {
  const response = { mock: true, comparison: { constraints: ["wheelchair"] }, plan: {
    meals: [
      { day: "Monday", kind: "restaurant", entity_id: "same", name: "Same café", why: "Original first visit." },
      { day: "Tuesday", kind: "restaurant", entity_id: "same", name: "Same café", why: "Original second visit." },
    ], notes: [], rejected: [],
  } };
  const original = createWeekPlan(response, "2026-12-28"), model = createVenueFollowup(original);
  model.setField(original, "pick-0", "2026-12-28", "question", question);
  model.setField(original, "pick-0", "2026-12-28", "reply", "Monday reply");
  model.setField(original, "pick-0", "2026-12-28", "nextStep", "Monday only");
  model.setField(original, "pick-0", "2026-12-28", "status", "reply_recorded");
  let context = { model, state: setPickDay(original, "pick-0", "Thursday"), key: "pick-0", date: "2026-12-31" };
  let applies = 0;
  const reuse = createQuestionReuse(() => context, (value) => {
    applies++;
    context.model.setField(context.state, context.key, context.date, "question", value);
    return true;
  });
  return { response, original, model, reuse, get context() { return context; }, set context(value) { context = value; }, get applies() { return applies; } };
}
const noteAt = (model, state, key = "pick-0") => model.entries(state).find((entry) => entry.key === key).note;

test("eligible choices keep exact occurrence/date identity, empty values and duplicate text dates", () => {
  const x = setup();
  const records = x.model.snapshotRecords();
  x.model.replaceRecords([...records,
    { key: "pick-0", date: "2027-01-04", note: { status: "not_contacted", question: "", reply: "", replyQuestions: null, nextStep: "" } },
    { key: "pick-0", date: "2027-01-11", note: { status: "not_contacted", question, reply: "", replyQuestions: null, nextStep: "" } },
    { key: "pick-0", date: "2027-01-18", note: { status: "not_contacted", question: null, reply: "", replyQuestions: null, nextStep: "" } },
    { key: "pick-1", date: "2026-12-28", note: { status: "not_contacted", question: "Other occurrence", reply: "", replyQuestions: null, nextStep: "" } },
  ]);
  x.model.setField(x.context.state, "pick-0", "2026-12-31", "question", "Current date");
  assert.deepEqual([...x.reuse.choices()].sort((a,b) => a.date.localeCompare(b.date)), [
    { date: "2026-12-28", question }, { date: "2027-01-04", question: "" }, { date: "2027-01-11", question },
  ]);
  assert.deepEqual(questionReuseChoices(x.model.snapshotRecords(), "missing", "2026-12-31"), []);
});

test("prepare/cancel are read-only; Apply preserves literal CR/LF and copies only questions", () => {
  const x = setup(), before = x.model.snapshotRecords(), source = noteAt(x.model, x.original);
  assert.deepEqual(x.reuse.prepare("2026-12-28"), { sourceDate: "2026-12-28", targetDate: "2026-12-31", question });
  assert.deepEqual(x.model.snapshotRecords(), before);
  x.reuse.cancel(); assert.equal(x.reuse.use(), false); assert.equal(x.applies, 0);
  x.reuse.prepare("2026-12-28"); assert.equal(x.reuse.use(), true);
  assert.deepEqual(noteAt(x.model, x.context.state), { status: "not_contacted", question, reply: "", replyQuestions: null, nextStep: "" });
  assert.deepEqual(noteAt(x.model, x.original), source);
  assert.equal(x.reuse.use(), false); assert.equal(x.applies, 1);
});

test("existing target reply context and next step survive, with native follow-up policy", () => {
  const x = setup(), state = x.context.state;
  for (const [field,value] of [["question","Thursday questions"],["reply","Thursday reply"],["nextStep","Thursday only"],["status","reply_recorded"]]) {
    x.model.setField(state, "pick-0", "2026-12-31", field, value);
  }
  const before = x.model.snapshotRecords();
  x.reuse.prepare("2026-12-28"); assert.deepEqual(x.model.snapshotRecords(), before);
  assert.equal(x.reuse.use(), true);
  assert.deepEqual(noteAt(x.model,state), { status: "follow_up", question, reply: "Thursday reply", replyQuestions: "Thursday questions", nextStep: "Thursday only" });
  assert.throws(() => x.model.setField(state,"pick-0","2026-12-31","status","reply_recorded"), /revised questions/);
  assert.match(x.model.text(state), /Earlier reply \/ notes/);
});

test("identical questions preserve status; explicit empty reuse remains empty", () => {
  const x = setup(), state = x.context.state;
  x.model.setField(state, "pick-0", "2026-12-31", "question", question);
  x.model.setField(state, "pick-0", "2026-12-31", "reply", "Reply to exactly these questions");
  x.model.setField(state, "pick-0", "2026-12-31", "status", "reply_recorded");
  x.reuse.prepare("2026-12-28"); x.reuse.use();
  assert.equal(noteAt(x.model,state).status, "reply_recorded");
  const future = setWeek(state, "2027-01-04");
  x.model.setField(future, "pick-0", "2027-01-07", "question", "");
  x.reuse.prepare("2027-01-07"); x.reuse.use();
  assert.equal(noteAt(x.model,state).question, "");
  assert.equal(noteAt(x.model,state).status, "follow_up");
  assert.equal(noteAt(x.model,state).reply, "Reply to exactly these questions");
});

test("a target edit after preview is preserved and prevents the prepared Apply", () => {
  const x = setup(); x.reuse.prepare("2026-12-28");
  x.model.setField(x.context.state,"pick-0","2026-12-31","nextStep","New target edit");
  assert.throws(() => x.reuse.use(), /changed/);
  assert.equal(x.applies, 0); assert.equal(noteAt(x.model,x.context.state).nextStep,"New target edit");
  assert.equal(noteAt(x.model,x.context.state).question,null);
});

test("a changed or removed source custom value cannot be applied from an old preview", () => {
  for (const change of ["edit","remove"]) {
    const x = setup(); x.reuse.prepare("2026-12-28");
    if (change === "edit") x.model.setField(x.original,"pick-0","2026-12-28","question","Revised source");
    else x.model.replaceRecords([]);
    assert.throws(() => x.reuse.use(), /changed/);
    assert.equal(x.applies,0); assert.equal(noteAt(x.model,x.context.state).question,null);
  }
});

test("moving, omitting or changing week retires the captured target context", () => {
  for (const stateOf of [
    x => setPickDay(x.context.state,"pick-0","Friday"),
    x => setPickDay(x.context.state,"pick-0",null),
    x => setWeek(x.context.state,"2027-01-04"),
  ]) {
    const x = setup(); x.reuse.prepare("2026-12-28");
    x.context = {...x.context,state:stateOf(x)};
    assert.throws(() => x.reuse.use(), /no longer scheduled|changed/); assert.equal(x.applies,0);
  }
});

test("an identical-looking new accepted model/source cannot inherit the pending Apply", () => {
  const x = setup(); x.reuse.prepare("2026-12-28");
  const state = setPickDay(createWeekPlan(x.response,"2026-12-28"),"pick-0","Thursday");
  const model = createVenueFollowup(state); model.replaceRecords(x.model.snapshotRecords());
  x.context = {...x.context,state,model};
  assert.throws(() => x.reuse.use(), /changed/); assert.equal(x.applies,0);
  assert.equal(noteAt(model,state).question,null);
});

test("record replacement preserves its new target and invalidates an old prepared choice", () => {
  const x = setup(), state = x.context.state;
  x.model.setField(state,"pick-0","2026-12-31","nextStep","Before replacement");
  x.reuse.prepare("2026-12-28");
  const replacement = x.model.snapshotRecords().map(row => row.date === "2026-12-31" ? {...row,note:{...row.note,nextStep:"Replacement target"}} : row);
  x.model.replaceRecords(replacement);
  assert.throws(() => x.reuse.use(), /changed/); assert.equal(x.applies,0);
  assert.equal(noteAt(x.model,state).nextStep,"Replacement target");
});

test("invalid source choice clears a prior preview; a callback refusal is not retried implicitly", () => {
  const x = setup(); x.reuse.prepare("2026-12-28");
  assert.throws(() => x.reuse.prepare("2026-12-31"), /Choose recorded/);
  assert.equal(x.reuse.use(),false); assert.equal(x.applies,0);
  let calls=0;
  const refused = createQuestionReuse(() => x.context, () => { calls++; return false; });
  refused.prepare("2026-12-28"); assert.equal(refused.use(),false); assert.equal(refused.use(),false); assert.equal(calls,1);
});


test("initial mounts add no whole-model projections beyond the admitted sync snapshot", () => {
  // This minimal DOM host isolates initial mounting work; actual Chromium receives
  // the page controls and action lifecycle separately.
  const document = { createElement(tag) {
    return { tag, dataset: {}, style: {}, children: [], attributes: {}, listeners: {},
      append(...children) { this.children.push(...children); },
      setAttribute(key,value) { this.attributes[key]=value; },
      addEventListener(type,listener) { this.listeners[type]=listener; },
    };
  } };
  const original = createWeekPlan({ mock:true, comparison:{constraints:[]}, plan:{
    meals:Array.from({length:8},(_,i)=>({day:"Monday",kind:"restaurant",entity_id:"venue-"+i,name:"Visit "+i,why:"Original suggestion."})),
    rejected:[],notes:[],
  } },"2026-12-28");
  const native = createVenueFollowup(original);
  native.setField(original,"pick-0","2026-12-28","question",question);
  native.setField(original,"pick-1","2026-12-28","question","");
  const state=setWeek(original,"2027-01-04");
  let projections=0,recordSnapshots=0;
  const model={...native,
    entries(value) { projections++; return native.entries(value); },
    snapshotRecords() { recordSnapshots++; return native.snapshotRecords(); },
  };
  const visits=model.entries(state),records=model.snapshotRecords(),editors=[];
  for(const entry of visits){
    const editor=document.createElement("details");
    Object.assign(editor,{ownerDocument:document,isConnected:true,open:false});
    mountQuestionReuse(editor,()=>({model,state,key:entry.key,date:entry.date}),()=>{throw Error("Mount must not edit");},
      questionReuseChoices(records,entry.key,entry.date));
    editors.push(editor);
  }
  assert.equal(projections,1,"eight initial mounts must not add eight complete model projections");
  assert.equal(recordSnapshots,1,"all initial controls share the admitted record snapshot");
  const controls=editors.map(editor=>editor.children[0].children.find(child=>child.tag==="label").children.find(child=>child.tag==="select"));
  assert.deepEqual(controls.map(select=>select.disabled),[false,false,true,true,true,true,true,true]);
  assert.deepEqual(controls[0].children.map(option=>option.value),["","2026-12-28"]);
  assert.match(controls[1].children[1].textContent,/explicitly empty/);
  assert.deepEqual(native.snapshotRecords(),records);
});
