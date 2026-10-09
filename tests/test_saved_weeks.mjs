import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { createWeekPlan, setPickDay, setWeek, weekRows } from "../static/week_plan.mjs";
import { makeWeekFile, readWeekFile } from "../static/week_file.mjs";
import { createDraft, openDraft, renameDraft, draftSummary, validateDraft, MAX_DRAFT_BYTES } from "../static/saved_weeks.mjs";
const require = createRequire(import.meta.url);
const calendar = require("../static/calendar.js");
const fixture = JSON.parse(readFileSync(new URL("./fixtures/saved-week-response.json", import.meta.url), "utf8"));
const recovery = JSON.parse(readFileSync(new URL("./fixtures/saved-week-recovery.json", import.meta.url), "utf8"));
const inputs = { cuisines: ["Cuban", "Mexican"], music: ["Celia Cruz"], films: ["West Side Story"], city: "Pasadena", constraints: ["soft_foods", "low_sodium", "wheelchair"] };
const receivedAt = "2026-10-08T10:00:00.000Z";
const calendarId = "0123456789abcdef0123456789abcdef";
const now = new Date("2026-10-08T18:45:00.000Z");
const clone = structuredClone;
function snapshot(response = clone(fixture), originalInputs = clone(inputs)) {
  let weekState = createWeekPlan(response, "2026-12-31");
  if (weekState.picks[0]) weekState = setPickDay(weekState, weekState.picks[0].key, "Saturday");
  if (weekState.picks[1]) weekState = setPickDay(weekState, weekState.picks[1].key, "Saturday");
  if (weekState.picks[2]) weekState = setPickDay(weekState, weekState.picks[2].key, null);
  return { response, inputs: originalInputs, weekState, receivedAt, calendarId };
}
function draft(s = snapshot()) { return createDraft({ ...s, name: "December caregiver week", id: "draft_test_0001", now }); }
function ics(state, id = calendarId, time = receivedAt) {
  return calendar.createWeekExport(state, { id, createdAt: new Date(time) }).download(state, weekRows(state)).text;
}

test("named copy contains exactly the existing portable producer's text and detached accepted state", () => {
  const s = snapshot(); const saved = draft(s);
  const canonical = makeWeekFile({ ...s, state: s.weekState }, now);
  assert.equal(saved.text, canonical.text);
  const opened = openDraft(saved);
  assert.deepEqual(opened.response, s.response); assert.deepEqual(opened.inputs, s.inputs);
  assert.deepEqual(opened.weekState, s.weekState);
  assert.equal(opened.calendarId, calendarId); assert.equal(opened.receivedAt, receivedAt);
  assert.equal(opened.savedAt, now.toISOString());
  s.response.plan.notes.push("Later source mutation"); s.inputs.city = "Later input";
  assert.notDeepEqual(opened.response, s.response); assert.notDeepEqual(opened.inputs, s.inputs);
  assert.equal(saved.text, canonical.text);
});

test("reopening and metadata rename preserve exact ICS and accepted/calendar identities", () => {
  const s = snapshot(); const original = draft(s);
  const renamed = renameDraft(original, "Different caregiver label", new Date("2026-10-09T10:00:00.000Z"));
  const opened = openDraft(renamed);
  assert.equal(renamed.text, original.text); assert.equal(renamed.createdAt, original.createdAt);
  assert.equal(ics(opened.state, opened.calendarId, opened.receivedAt), ics(s.weekState));
  assert.equal(original.name, "December caregiver week");
  assert.equal(renameDraft(renamed, "Clock rollback", new Date("2020-01-01T00:00:00.000Z")).updatedAt, renamed.updatedAt);
});

test("continued arrangement changes resave through the canonical format without changing original evidence", () => {
  const opened = openDraft(draft());
  const next = setPickDay(setWeek(opened.state, "2027-02-02"), "pick-0", "Sunday");
  const saved = createDraft({ ...opened, weekState: next, name: "February copy", id: "draft_test_0002", now: new Date("2026-10-09T10:00:00.000Z") });
  const received = readWeekFile(saved.text);
  assert.deepEqual(received.state, next); assert.deepEqual(received.response, opened.response);
  assert.deepEqual(received.inputs, opened.inputs); assert.equal(received.receivedAt, receivedAt);
  assert.equal(received.calendarId, calendarId); assert.equal(received.savedAt, "2026-10-09T10:00:00.000Z");
});

for (const c of recovery.cases) test(`canonical native recovered response survives named storage: ${c.case}`, () => {
  const s = snapshot(clone(c.response), clone(c.inputs)); const saved = draft(s); const opened = openDraft(saved);
  assert.deepEqual(opened.response, c.response); assert.deepEqual(opened.inputs, c.inputs);
  assert.deepEqual(opened.state, s.weekState); assert.deepEqual(readWeekFile(saved.text).response.trace, c.response.trace);
});

test("corrupt, stale-format, invalid metadata and oversized records refuse without mutation", () => {
  const source = draft();
  const changes = [d => { d.version = 99; }, d => { d.format = "tastetable.saved-week"; },
    d => { d.id = "bad"; }, d => { d.name = " "; }, d => { d.createdAt = "2026-10-07T10:00:00.000Z"; },
    d => { d.text = "not JSON"; }, d => { const p = JSON.parse(d.text); p.response.plan.notes = null; d.text = JSON.stringify(p); },
    d => { const p = JSON.parse(d.text); delete p.week.assignments["pick-0"]; d.text = JSON.stringify(p); },
    d => { d.text += " ".repeat(MAX_DRAFT_BYTES); }];
  for (const edit of changes) {
    const bad = clone(source); edit(bad); const before = clone(bad);
    assert.throws(() => validateDraft(bad)); assert.deepEqual(bad, before);
  }
  assert.deepEqual(validateDraft(source), source);
});

test("all-omitted and unknown-source copies retain the native source and every occurrence", () => {
  const response = clone(fixture); delete response.mock;
  const s = snapshot(response);
  for (const pick of s.weekState.picks) s.weekState = setPickDay(s.weekState, pick.key, null);
  const saved = draft(s), opened = openDraft(saved), summary = draftSummary(saved);
  assert.deepEqual(opened.response, response); assert.deepEqual(opened.state, s.weekState);
  assert.equal(summary.sourceMode, "unknown"); assert.equal(summary.scheduled, 0);
  assert.equal(summary.omitted.length, s.weekState.picks.length);
});

test("duplicate entity identities remain distinct occurrence assignments in the named payload", () => {
  const response = clone(fixture); response.plan.meals[1].entity_id = response.plan.meals[0].entity_id;
  const s = snapshot(response), saved = draft(s), opened = openDraft(saved);
  assert.equal(opened.state.picks[0].pick.entity_id, opened.state.picks[1].pick.entity_id);
  assert.notEqual(opened.state.picks[0].key, opened.state.picks[1].key);
  assert.deepEqual(opened.state.assignments, s.weekState.assignments);
  assert.equal(saved.text, makeWeekFile({ ...s, state: s.weekState }, now).text);
});
