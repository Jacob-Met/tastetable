import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createWeekPlan, offWeekPicks, resetDays, setPickDay, setWeek, weekRows } from "../static/week_plan.mjs";
import { WEEK_FILE_FORMAT, makeWeekFile, readWeekFile } from "../static/week_file.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/saved-week-response.json", import.meta.url), "utf8"));
const inputs = {
  cuisines: ["Cuban", "Mexican"], music: ["Celia Cruz"], films: ["West Side Story"],
  city: "Pasadena", constraints: ["soft_foods", "low_sodium", "wheelchair"],
};
const receivedAt = "2026-10-08T10:00:00.000Z";
const calendarId = "e9a27c3786b649e483a42cc1a0096fb0";
const saveTime = new Date("2026-10-08T10:05:00.000Z");
const clone = (value) => structuredClone(value);
function snapshot(response = clone(fixture), sourceInputs = clone(inputs)) {
  return { response, inputs: sourceInputs, state: createWeekPlan(response, "2026-12-31"), receivedAt, calendarId };
}
function file(value = snapshot()) { return makeWeekFile(value, saveTime); }
function altered(edit) {
  const value = JSON.parse(file().text);
  edit(value);
  return JSON.stringify(value);
}

test("native response and edited occurrences round-trip across a new state", () => {
  const original = snapshot();
  const before = clone(original);
  original.state = setPickDay(original.state, "pick-0", "Saturday");
  original.state = setPickDay(original.state, "pick-1", "Saturday");
  original.state = setPickDay(original.state, "pick-2", null);
  const saved = file(original);
  const opened = readWeekFile(saved.text);
  assert.equal(saved.filename, "tastetable-week-2026-12-28.json");
  assert.deepEqual(opened.state, original.state);
  assert.deepEqual(opened.response, fixture);
  assert.deepEqual(opened.inputs, inputs);
  assert.deepEqual(opened.state.sourcePlan, before.response.plan);
  assert.equal(weekRows(opened.state)[5].picks.length, 3);
  assert.equal(offWeekPicks(opened.state)[0].key, "pick-2");
  assert.deepEqual(resetDays(opened.state), before.state);
  assert(Object.isFrozen(opened.state) && Object.isFrozen(opened.state.sourcePlan));
  assert.notEqual(opened.response, original.response);
  assert.equal(opened.receivedAt, receivedAt);
  assert.equal(opened.calendarId, calendarId);
  assert.equal(opened.savedAt, saveTime.toISOString());
});

test("resaving preserves the accepted source and new local arrangement", () => {
  const first = readWeekFile(file().text);
  first.state = setWeek(setPickDay(first.state, "pick-4", null), "2027-01-11");
  const next = makeWeekFile(first, new Date("2026-10-09T08:00:00.000Z"));
  const opened = readWeekFile(next.text);
  assert.equal(opened.receivedAt, receivedAt);
  assert.equal(opened.calendarId, calendarId);
  assert.equal(opened.savedAt, "2026-10-09T08:00:00.000Z");
  assert.equal(opened.state.weekStart, "2027-01-11");
  assert.equal(opened.state.assignments["pick-4"], null);
  assert.deepEqual(opened.response, fixture);
  assert.deepEqual(opened.state.sourcePlan, fixture.plan);
});

test("occurrence keys keep repeated entity IDs distinct after reopening", () => {
  const response = clone(fixture);
  response.plan.meals[1].entity_id = response.plan.meals[0].entity_id;
  response.plan.meals[1].name = response.plan.meals[0].name;
  const value = snapshot(response);
  value.state = setPickDay(setPickDay(value.state, "pick-0", "Tuesday"), "pick-1", null);
  const opened = readWeekFile(file(value).text);
  assert.equal(opened.state.picks[0].pick.entity_id, opened.state.picks[1].pick.entity_id);
  assert.equal(opened.state.assignments["pick-0"], "Tuesday");
  assert.equal(opened.state.assignments["pick-1"], null);
  assert.deepEqual(opened.state.sourcePlan, response.plan);
});

test("UTF-8 JSON with BOM or different indentation preserves source values", () => {
  const response = clone(fixture);
  response.plan.notes.push('Saved text: café, 老朋友, "quoted"; line one\nline two \\ end.');
  response.trace.push({ tool: "fixture_extra", args: { enabled: false, count: 0, missing: null }, result_summary: "retained" });
  response.extra_source_field = { untouched: [false, 0, null, "é"] };
  const saved = file(snapshot(response));
  const parsed = JSON.parse(saved.text);
  assert.equal(parsed.format, WEEK_FILE_FORMAT);
  const opened = readWeekFile("\uFEFF" + JSON.stringify(parsed));
  assert.deepEqual(opened.response, response);
  assert.deepEqual(opened.state.sourcePlan, response.plan);
  assert.deepEqual(opened.inputs, inputs);
});

test("empty arrangements and unknown source remain usable snapshots", () => {
  const allOff = snapshot();
  for (const { key } of allOff.state.picks) allOff.state = setPickDay(allOff.state, key, null);
  assert.equal(offWeekPicks(readWeekFile(file(allOff).text).state).length, allOff.state.picks.length);
  const empty = clone(fixture);
  empty.plan.meals = [];
  empty.plan.outing = null;
  delete empty.mock;
  const opened = readWeekFile(file(snapshot(empty)).text);
  assert.equal(opened.state.picks.length, 0);
  assert.equal(opened.state.sourceMode, "unknown");
  assert.equal(weekRows(opened.state).length, 7);
  assert.deepEqual(opened.response, empty);
});

test("save refuses a derived week whose original evidence has changed", () => {
  const value = snapshot();
  const before = clone(value);
  value.state = { ...value.state, sourceMode: "live" };
  assert.throws(() => file(value), /no longer matches/);
  value.state = { ...before.state, sourcePlan: { ...before.state.sourcePlan, notes: ["replacement"] } };
  assert.throws(() => file(value), /no longer matches/);
  assert.deepEqual(value.response, before.response);
  assert.deepEqual(value.inputs, before.inputs);
});

test("malformed format, dates, timestamps and inconsistent source inputs fail", () => {
  assert.throws(() => readWeekFile("{invalid"), /not valid JSON/);
  assert.throws(() => readWeekFile("[]"), /supported v1/);
  for (const edit of [
    (v) => { v.format = "tastetable.saved-week.v2"; },
    (v) => { delete v.response; },
    (v) => { v.week.start = "2026-02-30"; },
    (v) => { v.week.start = "2026-12-29"; },
    (v) => { v.savedAt = "yesterday"; },
    (v) => { v.calendarId = "invalid id"; },
    (v) => { delete v.inputs.cuisines; },
    (v) => { v.inputs.constraints = []; },
  ]) assert.throws(() => readWeekFile(altered(edit)));
});

test("missing, additional or invalid occurrence assignments cannot silently drop picks", () => {
  for (const edit of [
    (v) => { delete v.week.assignments["pick-0"]; },
    (v) => { v.week.assignments["pick-999"] = "Monday"; },
    (v) => { v.week.assignments["pick-0"] = "Funday"; },
    (v) => { v.week.assignments["pick-0"] = false; },
  ]) assert.throws(() => readWeekFile(altered(edit)));
  assert.deepEqual(readWeekFile(file().text).response, fixture);
});

test("saved files validate native response types before reaching HTML or late render fields", () => {
  for (const edit of [
    (v) => { v.response.comparison.grounded.picks = '<img src=x onerror="window.marker=true">'; },
    (v) => { v.response.comparison.llm_only.with_affinity_evidence = "<script>marker()</script>"; },
    (v) => { v.response.comparison.grounded.constraint_checked = true; },
    (v) => { v.response.comparison.grounded.picks = -1; },
    (v) => { v.response.plan.meals[0].kind = 'restaurant<img src=x>'; },
    (v) => { v.response.plan.meals[0].affinity = "high"; },
    (v) => { v.response.plan.notes = null; },
    (v) => { v.response.llm_only.outing = null; },
    (v) => { v.response.plan.rejected[0].failed = null; },
    (v) => { v.response.trace = null; },
    (v) => { delete v.response.trace[0].args; },
  ]) assert.throws(() => readWeekFile(altered(edit)));
});

test("current native recovery traces retain null and list args with the checked partial plan", () => {
  const native = JSON.parse(readFileSync(new URL("./fixtures/saved-week-recovery.json", import.meta.url), "utf8"));
  assert.equal(native.source_commit, "b8d384e5522e17cf15d73e8b06adbe6665e4bdcc");
  for (const item of native.cases) {
    const value = snapshot(item.response, item.inputs);
    value.state = setPickDay(value.state, "pick-0", "Sunday");
    const opened = readWeekFile(file(value).text);
    assert.deepEqual(opened.response, item.response);
    assert.deepEqual(opened.response.trace.at(-1).args, item.case === "invalid_json" ? null : []);
    assert.deepEqual(opened.state.sourcePlan, item.response.plan);
    assert.deepEqual(opened.state.picks.map((pick) => pick.pick.entity_id), ["FIX-P-01"]);
    assert.equal(opened.state.assignments["pick-0"], "Sunday");
  }
});
