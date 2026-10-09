import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {compareSavedSuggestions} from "../static/common_suggestions.mjs";
import {createWeekPlan, setPickDay} from "../static/week_plan.mjs";
import {makeWeekFile, readWeekFile} from "../static/week_file.mjs";

const original = JSON.parse(readFileSync(new URL("./fixtures/saved-week-response.json", import.meta.url), "utf8"));
const pick = (id, day = "Monday", kind = "restaurant", extras = {}) => ({
  kind, entity_id:id, name:"Recorded " + id, why:"Original reason", day, affinity:null, ...extras,
});
function saved(picks, {week="2026-10-12", mode=true, assignments={}, extra={}} = {}) {
  const response = structuredClone(original);
  response.plan.meals = structuredClone(picks);
  response.plan.outing = null;
  response.mock = mode;
  Object.assign(response, extra);
  const inputs = {cuisines:["Italian"], music:[], films:[], city:"Pasadena",
    constraints:structuredClone(response.comparison.constraints)};
  let state = createWeekPlan(response, week);
  for (const [key, day] of Object.entries(assignments)) state = setPickDay(state, key, day);
  return makeWeekFile({response, inputs, state,
    receivedAt:"2026-10-09T06:00:00.000Z", calendarId:null},
    new Date("2026-10-09T06:01:00.000Z")).text;
}
const entry = (text, label="plan.json") => ({text,label});
const pair = (a,b=a) => [entry(a),entry(b)];
const ids = (result) => result.matches.map(({kind,entityId}) => [kind,entityId]);
const refused = (value) => assert.throws(() => compareSavedSuggestions(value),
  (error) => error instanceof TypeError || error instanceof RangeError);

test("literal kind/ID intersection follows first source identity order", () => {
  const a = saved([pick("B"), pick("A"), pick("B","Tuesday"), pick("same","Monday","outing"),
    pick("same"), pick(" X "), pick("x"), pick("é"), pick("e\u0301")]);
  const b = saved([pick("A"), pick("B"), pick("same"), pick("X"), pick("x"), pick("é")]);
  const out = compareSavedSuggestions(pair(a,b));
  assert.deepEqual(ids(out), [["restaurant","B"],["restaurant","A"],["restaurant","same"],
    ["restaurant","x"],["restaurant","é"]]);
  assert.deepEqual(Object.keys(out), ["format","sources","matches","counts"]);
  assert.equal(out.format,"tastetable.common-suggestions.v1");
  assert.deepEqual(out.counts,{sources:2,commonIdentities:5,occurrences:11});
});
test("all duplicate occurrences retain their own keys, order, dates and off-week state", () => {
  const a = saved([pick("A","Monday"),pick("A","Wednesday")],
    {assignments:{"pick-0":null,"pick-1":"Sunday"}});
  const b = saved([pick("A","Tuesday"),pick("A","Friday"),pick("A","Saturday")],
    {week:"2026-10-19"});
  const out = compareSavedSuggestions(pair(a,b));
  assert.deepEqual(out.matches[0].occurrences.map(({sourceIndex,key,originalDay,day,date}) =>
    ({sourceIndex,key,originalDay,day,date})), [
    {sourceIndex:0,key:"pick-0",originalDay:"Monday",day:null,date:null},
    {sourceIndex:0,key:"pick-1",originalDay:"Wednesday",day:"Sunday",date:"2026-10-18"},
    {sourceIndex:1,key:"pick-0",originalDay:"Tuesday",day:"Tuesday",date:"2026-10-20"},
    {sourceIndex:1,key:"pick-1",originalDay:"Friday",day:"Friday",date:"2026-10-23"},
    {sourceIndex:1,key:"pick-2",originalDay:"Saturday",day:"Saturday",date:"2026-10-24"},
  ]);
  assert.deepEqual(Object.keys(out.matches[0].occurrences[0]),
    ["sourceIndex","key","originalDay","day","date","pick"]);
  assert.deepEqual(out.counts,{sources:2,commonIdentities:1,occurrences:5});
});
test("every selected source participates, while labels and repeated contents remain positions", () => {
  const a = saved([pick("A"),pick("B")]), b=saved([pick("B")]);
  const entries=[entry(a,""),entry(a,"duplicate"),entry(b,"duplicate"),entry(a),entry(a),entry(a)];
  const out=compareSavedSuggestions(entries);
  assert.deepEqual(ids(out),[["restaurant","B"]]);
  assert.deepEqual(out.sources.map(({index,label})=>({index,label})),
    entries.map(({label},index)=>({index,label})));
  assert.equal(out.counts.occurrences,6);
});
test("complete source snapshots, trace, model message and literal pick values survive", () => {
  const text=saved([pick("A","Monday","restaurant",{name:"<img onerror=bad()>",why:"$&\n<&>",
    affinity:0,fallback:false,extra:{verbatim:["α",null]}})],
    {extra:{model_message:"Recorded <failure>\nNo new check.",extra_response:{kept:true}}});
  const out=compareSavedSuggestions(pair(text));
  assert.deepEqual(out.sources[0].snapshot,readWeekFile(text));
  assert.equal(out.matches[0].occurrences[0].pick.name,"<img onerror=bad()>");
  assert.deepEqual(out.matches[0].occurrences[0].pick.extra,{verbatim:["α",null]});
  assert.equal(out.matches[0].occurrences[0].pick.fallback,false);
});
test("mixed mock/live/unknown modes stay separate", () => {
  const out=compareSavedSuggestions([true,false,null].map(mode=>entry(saved([pick("A")],{mode}))));
  assert.deepEqual(out.sources.map(({snapshot})=>snapshot.state.sourceMode),["mock","live","unknown"]);
  assert.equal(out.counts.commonIdentities,1);
});
test("empty plans and disjoint identities are successful empty intersections", () => {
  for(const entries of [pair(saved([])),pair(saved([]),saved([pick("A")])),
    pair(saved([pick("A")]),saved([pick("B")]))]) {
    const out=compareSavedSuggestions(entries);
    assert.deepEqual(out.matches,[]);
    assert.deepEqual(out.counts,{sources:2,commonIdentities:0,occurrences:0});
  }
});
test("caller data stays unchanged and separate calls have independent graphs", () => {
  const entries=pair(saved([pick("A")]));
  entries[0].ignored={untouched:["yes"]};
  const before=JSON.stringify(entries), a=compareSavedSuggestions(entries), b=compareSavedSuggestions(entries);
  a.sources[0].snapshot.response.plan.notes.push("only one result");
  a.sources[0].snapshot.inputs.city="Changed copy";
  assert.equal(JSON.stringify(entries),before);
  assert.notDeepEqual(a.sources[0].snapshot,b.sources[0].snapshot);
  assert.notEqual(a.matches[0].occurrences[0].pick,b.matches[0].occurrences[0].pick);
  assert.deepEqual(b.sources[0].snapshot,readWeekFile(entries[0].text));
});
test("one codec BOM and exact inclusive UTF-8 text limit are admitted", () => {
  const text=saved([pick("A")]), max=2*1024*1024;
  assert.equal(compareSavedSuggestions(pair("\uFEFF"+text)).counts.commonIdentities,1);
  const exact=text+" ".repeat(max-Buffer.byteLength(text));
  assert.equal(Buffer.byteLength(exact),max);
  assert.equal(compareSavedSuggestions(pair(exact)).counts.commonIdentities,1);
  refused(pair(exact+" "));
  refused(pair("\uFEFF"+exact));
});
test("UTF-8 label bound is inclusive and differs from character count", () => {
  const text=saved([]);
  assert.equal(compareSavedSuggestions([entry(text,"α".repeat(512)),entry(text,"")]).sources[0].label.length,512);
  refused([entry(text,"α".repeat(513)),entry(text)]);
  refused([entry(text,"a".repeat(1025)),entry(text)]);
});
test("500 original picks are admitted; 501 are refused even when identities duplicate", () => {
  const text=saved(Array.from({length:500},()=>pick("A")));
  const out=compareSavedSuggestions(pair(text));
  assert.deepEqual(out.counts,{sources:2,commonIdentities:1,occurrences:1000});
  refused(pair(saved(Array.from({length:501},()=>pick("A")))));
});
test("unsupported counts, sparse entries and wrong field types refuse without partial results", () => {
  const valid=entry(saved([])), sparse=[valid,valid];delete sparse[1];
  for(const value of [null,{},[],[valid],Array(7).fill(valid),sparse,[valid,null],[valid,[]],
    [valid,{label:1,text:valid.text}],[valid,{label:"x",text:1}],[valid,{text:valid.text}]]) refused(value);
});
test("native codec keeps malformed response, date, arrangement and constraint refusals authoritative", () => {
  const originalText=saved([pick("A")]);
  refused(pair("{"));
  refused(pair("{}"));
  const mutations=[
    (file)=>{file.week.start="2026-10-13";},
    (file)=>{file.week.assignments["pick-0"]="Funday";},
    (file)=>{file.week.assignments.extra=null;},
    (file)=>{file.inputs.constraints.push("different");},
    (file)=>{file.response.plan.meals[0].affinity="not a number";},
    (file)=>{file.response.trace[0].args=undefined;},
    (file)=>{file.savedAt="yesterday";},
  ];
  for(const mutate of mutations){const file=JSON.parse(originalText);mutate(file);refused(pair(JSON.stringify(file)));}
});
