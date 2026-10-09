import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderVisitRecordReport } from "../static/visit_record_report.mjs";
const original = await readFile(new URL("./fixtures/visit-record-csv.json", import.meta.url), "utf8");
const mutate = fn => { const value = JSON.parse(original); const week = JSON.parse(value.source.weekText); fn(value, week); value.source.weekText = JSON.stringify(week); return JSON.stringify(value); };
const field = (html, name) => [...html.matchAll(new RegExp('data-field="' + name + '">([\\s\\S]*?)<\\/', 'g'))].map(x => x[1]);
const escape = text => text.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;").replaceAll("\r","&#13;");

test("one report preserves original occurrences, distinct planned/actual values and exact provenance", () => {
  const result = renderVisitRecordReport(original, { recordName: " visits & notes.json ", recordSha256: "a".repeat(64) });
  assert.ok(Object.isFrozen(result)); assert.equal(result.rowCount, 3); assert.equal(result.weekStart, "2024-02-26");
  assert.equal(result.sourceMode, "mock"); assert.equal(result.savedAt, "2024-03-03T12:00:00.000Z");
  assert.deepEqual([...result.html.matchAll(/data-occurrence="([^"]+)"/g)].map(x=>x[1]), ["pick-0","pick-1","pick-2"]);
  assert.deepEqual(field(result.html, "venue_name"), ["Café, &quot;Same&quot;","Café, &quot;Same&quot;","Third café"]);
  assert.deepEqual(field(result.html, "outcome"), ["went","did_not_go","unrecorded"]);
  assert.deepEqual(field(result.html, "actual_date"), ["2024-03-01","2024-03-02","Not recorded"]);
  assert.deepEqual(field(result.html, "planned_day"), ["Thursday","Kept off this week","Friday"]);
  assert.deepEqual(field(result.html, "planned_date"), ["2024-02-29","Kept off this week","2024-03-01"]);
  assert.deepEqual(field(result.html, "source_name"), [" original,week.json "]);
  assert.deepEqual(field(result.html, "record_name"), [" visits &amp; notes.json "]);
  assert.deepEqual(field(result.html, "record_sha256"), ["a".repeat(64)]);
  assert.deepEqual(field(result.html, "note"), ['He said &quot;yes&quot;, then went.', "  A&#13;<br>B&#13;\nC\n🙂\t "]);
  assert.match(result.html, /data-empty-note>No note recorded/);
  assert.equal(renderVisitRecordReport(original).html, renderVisitRecordReport(original).html);
  assert.ok(result.html.endsWith("\n"));
});

test("recorded date and outcome remain independent even when seemingly contradictory", () => {
  const text = mutate(value => {
    value.visits.find(x=>x.key==="pick-0").date = null;
    value.visits.find(x=>x.key==="pick-2").date = "0001-01-01";
  });
  const html = renderVisitRecordReport(text).html;
  assert.deepEqual(field(html,"outcome"),["went","did_not_go","unrecorded"]);
  assert.deepEqual(field(html,"actual_date"),["Not recorded","2024-03-02","0001-01-01"]);
});

test("literal markup, Unicode and CR sequences stay escaped data; report has no executable or external dependency", () => {
  const payload = '  A  B\t日本語🙂\r\n</p><script src="https://example.invalid/x">alert(1)</script> & \' "  ';
  const text = mutate((value,week) => {
    week.response.plan.meals[0].name = payload;
    week.response.plan.meals[0].why = payload;
    week.response.plan.meals[0].entity_id = payload;
    value.visits[0].note = payload;
  });
  const html = renderVisitRecordReport(text).html;
  assert.equal(field(html,"venue_name")[0],escape(payload)); assert.equal(field(html,"entity_id")[0],escape(payload));
  assert.equal(field(html,"original_explanation")[0],escape(payload)); assert.ok(field(html,"note").includes(escape(payload)));
  assert.doesNotMatch(html, /<(script|iframe|form|img|link|object|embed|base)\b/i);
  for (const tag of html.match(/<[^>]+>/g)) assert.doesNotMatch(tag, /\s(?:href|src|onload|onclick|action)\s*=/i);
  assert.match(html, /default-src &#39;none&#39;/); assert.match(html, /white-space:pre-wrap/);
  assert.match(html, /@media print/); assert.match(html, /break-inside:auto/);
});

test("native codec rejection and HTML representation refusal occur before any report is returned", () => {
  for (const text of ["", "[]", original+" trailing", "\uFEFF\uFEFF"+original, mutate(value=>{value.visits.pop();}),
    mutate(value=>{value.visits[0].outcome="maybe";}), mutate(value=>{value.visits[0].date="2025-02-29";}),
    mutate(value=>{value.visits[0].note="x".repeat(4001);}), mutate(value=>{value.extra=true;}),
    mutate((value,week)=>{week.response.plan.meals[0].why="nul\0";}),
    mutate((value,week)=>{week.response.plan.meals[0].name="bad\ud800";})
  ]) assert.throws(()=>renderVisitRecordReport(text));
  assert.equal(renderVisitRecordReport("\uFEFF"+original).rowCount,3);
  for(const recordName of [""," ","x".repeat(513),"a\0b","a\nb","bad\ud800",1]) assert.throws(()=>renderVisitRecordReport(original,{recordName}));
  for(const recordSha256 of ["", "A".repeat(64), "0".repeat(63), 0, {}]) assert.throws(()=>renderVisitRecordReport(original,{recordSha256}));
});

test("mock/live/unknown source labels remain distinct saved claims", () => {
  for (const [mock,mode,label] of [[true,"mock","Saved fictional demo"],[false,"live","Saved live-source label"],[null,"unknown","Saved source unknown"]]) {
    const result=renderVisitRecordReport(mutate((value,week)=>{week.response.mock=mock;}));
    assert.equal(result.sourceMode,mode); assert.deepEqual(field(result.html,"source_mode"),[mode]); assert.ok(result.html.includes(label));
  }
});

test("empty records and the full original-occurrence/note bound remain reportable without truncation", () => {
  const empty=mutate((value,week)=>{week.response.plan.meals=[];week.response.plan.outing=null;week.week.assignments={};value.visits=[];});
  const zero=renderVisitRecordReport(empty);assert.equal(zero.rowCount,0);assert.match(zero.html,/data-empty-record/);
  const note="🙂".repeat(4000);
  const full=mutate((value,week)=>{
    const pick=week.response.plan.meals[0];week.response.plan.meals=Array.from({length:100},()=>({...pick}));week.response.plan.outing=null;
    week.week.assignments=Object.fromEntries(Array.from({length:100},(_,i)=>["pick-"+i,null]));
    value.visits=Array.from({length:100},(_,i)=>({key:"pick-"+i,outcome:"unrecorded",date:null,note}));
  });
  const hundred=renderVisitRecordReport(full);assert.equal(hundred.rowCount,100);
  assert.equal(field(hundred.html,"note").length,100);assert.ok(field(hundred.html,"note").every(x=>x===note));
  assert.equal([...hundred.html.matchAll(/data-occurrence=/g)].length,100);
  assert.ok(Buffer.byteLength(hundred.html)<32*1024**2);
});

test("lone CR has a visible break while CRLF, literal markup and source characters stay distinct", () => {
  const cases = [
    ["first\rsecond", "first&#13;<br>second"],
    ["first\r\nsecond", "first&#13;\nsecond"],
    ["\rfirst\r\rsecond\r", "&#13;<br>first&#13;<br>&#13;<br>second&#13;<br>"],
    ["<br>\r</p>", "&lt;br&gt;&#13;<br>&lt;/p&gt;"],
    ["first\r\n\rsecond", "first&#13;\n&#13;<br>second"],
  ];
  for (const [literal, expected] of cases) {
    const text = mutate((value, week) => {
      week.response.plan.meals[0].name = literal;
      week.response.plan.meals[0].why = literal;
      week.response.plan.meals[0].entity_id = literal;
      value.visits.find(visit => visit.key === "pick-0").note = literal;
    });
    const html = renderVisitRecordReport(text).html;
    for (const name of ["venue_name", "entity_id", "original_explanation", "note"]) {
      assert.equal(field(html, name)[0], expected, name + ": " + JSON.stringify(literal));
    }
    assert.equal(html.includes("\r"), false, "source CR stays encoded until DOM parsing");
  }
});
