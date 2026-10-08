import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createWeekPlan, setPickDay, setWeek } from "../static/week_plan.mjs";
import { makeWeekFile, readWeekFile } from "../static/week_file.mjs";
import { createVenueFollowup } from "../static/venue_followup.mjs";
import { makeVenueNoteFile } from "../static/venue_note_file.mjs";
import { prepareWeekContactReport } from "../static/week_contact_report.mjs";
import { renderSavedWeekReport } from "../static/week_report.mjs";

function fixture() {
  const response = JSON.parse(readFileSync(new URL("./fixtures/saved-week-response.json", import.meta.url), "utf8"));
  response.plan.meals[1].name = response.plan.meals[0].name = "Same café 海";
  response.plan.meals[1].entity_id = response.plan.meals[0].entity_id;
  const origin = { response, inputs: { cuisines: [], music: [], films: [], city: "", constraints: response.comparison.constraints },
    receivedAt: "2026-10-08T10:00:00.000Z", calendarId: null };
  const state = setPickDay(createWeekPlan(response, "2026-12-28"), "pick-1", "Monday");
  const model = createVenueFollowup(state), now = new Date("2026-10-08T10:10:00.000Z");
  const week = (value = state) => makeWeekFile({ ...origin, state: value }, now).text;
  const notes = () => makeVenueNoteFile({ origin, state, model }, now).text;
  return { origin, state, model, week, notes };
}
const prepare = (week, notes) => prepareWeekContactReport(readWeekFile(week), { text: notes });

test("same-name same-date occurrences retain separate records and scheduled order", () => {
  const f = fixture(), entries = f.model.entries(f.state);
  f.model.setField(f.state, "pick-0", entries[0].date, "reply", "First answer");
  f.model.setField(f.state, "pick-1", entries[1].date, "reply", "Second answer");
  const before = f.week(), result = prepare(before, f.notes());
  assert.deepEqual(result.scheduled.slice(0, 2).map((x) => [x.key, x.note.reply, x.savedRecord]),
    [["pick-0", "First answer", true], ["pick-1", "Second answer", true]]);
  assert.equal(result.records, 2); assert.equal(result.matchedRecords, 2); assert.equal(result.retainedRecords, 0);
  assert.equal(f.week(), before);
});

test("moved, omitted and different-week records never become current replies", () => {
  const f = fixture(), date = "2026-12-28";
  f.model.setField(f.state, "pick-0", date, "reply", "Old date");
  f.model.setField(f.state, "pick-1", date, "reply", "Omitted occurrence");
  const later = setWeek(f.state, "2027-01-04");
  f.model.setField(later, "pick-0", "2027-01-04", "reply", "Other week");
  const arrangement = setPickDay(setPickDay(f.state, "pick-0", "Friday"), "pick-1", null);
  const result = prepare(f.week(arrangement), f.notes());
  assert.equal(result.records, 3); assert.equal(result.matchedRecords, 0); assert.equal(result.retainedRecords, 3);
  assert.deepEqual(result.retained.map((x) => [x.key, x.date, x.note.reply]),
    [["pick-0", date, "Old date"], ["pick-1", date, "Omitted occurrence"], ["pick-0", "2027-01-04", "Other week"]]);
  const current = result.scheduled.find((x) => x.key === "pick-0");
  assert.equal(current.date, "2027-01-01"); assert.equal(current.note.reply, ""); assert.equal(current.savedRecord, false);
  assert.match(result.retained[1].retainedReason, /kept off/);
  const html = renderSavedWeekReport(f.week(arrangement), { venueNotes: { text: f.notes() } }).html;
  assert.equal((html.match(/class="pick retained-contact"/g) || []).length, 3);
  assert.match(html, /not notes for a current displayed visit/);
});

test("changed questions preserve earlier questions, literal replies and follow-up context", () => {
  const f = fixture(), date = "2026-12-28";
  f.model.setField(f.state, "pick-0", date, "question", "Earlier?\r\n  海");
  f.model.setField(f.state, "pick-0", date, "reply", "<script>alert('x')</script>\r\n🧭 & answer");
  f.model.setField(f.state, "pick-0", date, "status", "reply_recorded");
  f.model.setField(f.state, "pick-0", date, "question", "Now?\r\n  revised");
  f.model.setField(f.state, "pick-0", date, "nextStep", "Call later\rKeep CR");
  const result = renderSavedWeekReport(f.week(), { venueNotes: { text: f.notes(), sourceName: "notes <海>.json", sourceSha256: "a".repeat(64) } });
  assert.match(result.html, /Questions for the earlier reply/);
  assert.match(result.html, /Needs follow-up/);
  assert.match(result.html, /Earlier\?&#13;\n  海/);
  assert.match(result.html, /&lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt;&#13;/);
  assert.match(result.html, /Now\?&#13;/); assert.match(result.html, /Call later&#13;Keep CR/);
  assert(!result.html.includes("<script>"));
  assert.match(result.html, /notes &lt;海&gt;.json/); assert.match(result.html, new RegExp("a".repeat(64)));
});

test("empty companion is explicit and does not invent stored caregiver records", () => {
  const f = fixture(), result = prepare(f.week(), f.notes());
  assert.equal(result.records, 0); assert.equal(result.retainedRecords, 0);
  assert(result.scheduled.every((x) => !x.savedRecord && x.note.reply === ""));
  const html = renderSavedWeekReport(f.week(), { venueNotes: { text: f.notes() } }).html;
  assert.match(html, /No saved caregiver record/); assert.match(html, /0 saved records/);
  assert.match(html, /No saved records are outside this arrangement/);
});

test("all omitted visits still preserve every companion record in the appendix", () => {
  const f = fixture(); f.model.setField(f.state, "pick-0", "2026-12-28", "reply", "Retained");
  let state = f.state; for (const item of state.picks) state = setPickDay(state, item.key, null);
  const result = prepare(f.week(state), f.notes()); assert.equal(result.scheduled.length, 0);
  assert.equal(result.retainedRecords, 1); assert.equal(result.retained[0].note.reply, "Retained");
});

test("complete source and native note validation refuse mismatches before rendering", () => {
  const f = fixture(); f.model.setField(f.state, "pick-0", "2026-12-28", "reply", "Answer");
  const baseline = JSON.parse(f.notes());
  const mutations = [
    (v) => { v.origin.inputs.city = "Other"; },
    (v) => { v.origin.response.trace = []; },
    (v) => { v.records.push(structuredClone(v.records[0])); },
    (v) => { v.records[0].key = "pick-999"; },
    (v) => { v.records[0].date = "2026-02-30"; },
    (v) => { v.records[0].note.status = "constructor"; },
    (v) => { v.records[0].note.replyQuestions = null; },
    (v) => { v.extra = 1; },
  ];
  for (const mutate of mutations) {
    const value = structuredClone(baseline); mutate(value);
    assert.throws(() => renderSavedWeekReport(f.week(), { venueNotes: { text: JSON.stringify(value) } }));
  }
  assert.throws(() => prepare(f.week(), " ".repeat(2 * 1024 * 1024 + 1)), /2 MiB/);
});

test("unrepresentable current or retained text and source labels refuse the whole report", () => {
  for (const value of ["\0", "\ud800", "\udfff"]) {
    for (const retained of [false, true]) {
      const f = fixture(); f.model.setField(f.state, "pick-0", "2026-12-28", "reply", value);
      const state = retained ? setPickDay(f.state, "pick-0", null) : f.state;
      assert.throws(() => renderSavedWeekReport(f.week(state), { venueNotes: { text: f.notes() } }), /NUL|surrogate/);
    }
    const f = fixture();
    assert.throws(() => renderSavedWeekReport(f.week(), { venueNotes: { text: f.notes(), sourceName: value } }), /NUL|surrogate/);
  }
});

test("optional metadata validates fingerprints and plain result shape stays inherited", () => {
  const f = fixture();
  assert.deepEqual(Object.keys(renderSavedWeekReport(f.week())), ["html", "weekStart", "sourceMode", "picks", "scheduled", "omitted"]);
  assert.throws(() => renderSavedWeekReport(f.week(), { venueNotes: { text: f.notes(), sourceSha256: "not-a-hash" } }), /fingerprint/);
  assert.throws(() => renderSavedWeekReport(f.week(), { venueNotes: { text: f.notes(), sourceName: 42 } }), /source name/);
  const reordered = JSON.parse(f.notes()); reordered.origin = Object.fromEntries(Object.entries(reordered.origin).reverse());
  assert.doesNotThrow(() => prepare(f.week(), "\uFEFF" + JSON.stringify(reordered)));
});
