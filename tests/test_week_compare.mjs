import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createWeekPlan, setPickDay, setWeek } from "../static/week_plan.mjs";
import { makeWeekFile, readWeekFile } from "../static/week_file.mjs";
import { compareSavedWeeks } from "../static/week_compare.mjs";

const response = JSON.parse(readFileSync(new URL("./fixtures/saved-week-response.json", import.meta.url)));
const inputs = { cuisines: ["Cuban"], music: ["Celia Cruz"], films: [], city: "Pasadena", constraints: response.comparison.constraints };
function snapshot(source = response) {
  const value = { response: source, inputs, state: createWeekPlan(source, "2026-12-28"),
    receivedAt: "2026-10-08T10:00:00.000Z", calendarId: "e9a27c3786b649e483a42cc1a0096fb0" };
  return readWeekFile(makeWeekFile(value, new Date("2026-10-08T10:05:00.000Z")).text);
}
function resave(value) {
  return readWeekFile(makeWeekFile(value, new Date("2026-10-09T10:05:00.000Z")).text);
}

test("codec-created copies compare exact moves, omissions and inclusion without mutating inputs", () => {
  const before = snapshot();
  before.state = setPickDay(before.state, "pick-2", null);
  const after = resave(before);
  after.state = setPickDay(setPickDay(setPickDay(after.state, "pick-0", "Tuesday"), "pick-1", null), "pick-2", "Sunday");
  const original = structuredClone({ before, after });
  const result = compareSavedWeeks(before, after);
  assert.equal(result.paired, true);
  assert.deepEqual(result.counts, { unchanged: 2, moved: 1, scheduled: 1, omitted: 1 });
  assert.deepEqual(result.changes.map(x => x.status), ["moved", "omitted", "scheduled", "unchanged", "unchanged"]);
  assert.equal(result.changes[0].before.date, "2026-12-28");
  assert.equal(result.changes[0].after.date, "2026-12-29");
  assert.deepEqual({ before, after }, original);
});

test("different chosen weeks compare actual dates through the year boundary", () => {
  const before = snapshot(), after = resave(before);
  after.state = setWeek(after.state, "2027-01-04");
  const result = compareSavedWeeks(before, after);
  assert.equal(result.counts.moved, 5);
  assert.equal(result.changes[3].before.date, "2027-01-03");
  assert.equal(result.changes[3].after.date, "2027-01-10");
});

test("repeated venue identities retain original occurrence mapping", () => {
  const source = structuredClone(response);
  source.plan.meals[1] = { ...source.plan.meals[0], day: "Wednesday" };
  const before = snapshot(source), after = resave(before);
  after.state = setPickDay(after.state, "pick-1", null);
  const result = compareSavedWeeks(before, after);
  assert.equal(result.changes[0].pick.entity_id, result.changes[1].pick.entity_id);
  assert.equal(result.changes[0].status, "unchanged");
  assert.equal(result.changes[1].status, "omitted");
  assert.equal(result.changes[0].key, "pick-0");
  assert.equal(result.changes[1].key, "pick-1");
});

test("changed response, profile, timestamp or calendar identity prevents inferred movement", () => {
  const before = snapshot();
  for (const edit of [
    v => { v.response.plan.meals[0].why += " Changed source"; },
    v => { v.inputs.city = "Another city"; },
    v => { v.receivedAt = "2026-10-08T10:00:01.000Z"; },
    v => { v.calendarId = null; },
  ]) {
    const after = resave(before); edit(after);
    const result = compareSavedWeeks(before, after);
    assert.equal(result.paired, false);
    assert.deepEqual(result.changes, []);
    assert.equal(result.counts, null);
    assert.equal(result.left.length, 5);
    assert.equal(result.right.length, 5);
  }
});

test("JSON property order is immaterial, source array order is not", () => {
  const before = snapshot(), after = resave(before);
  const reverse = value => Array.isArray(value) ? value.map(reverse)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([k,v]) => [k,reverse(v)])) : value;
  after.response = reverse(after.response);
  after.inputs = reverse(after.inputs);
  assert.equal(compareSavedWeeks(before, after).paired, true);
  after.response.plan.meals.reverse();
  assert.equal(compareSavedWeeks(before, after).paired, false);
});

test("all-omitted arrangements and empty original plans have honest counts", () => {
  const before = snapshot(), after = resave(before);
  for (const { key } of after.state.picks) after.state = setPickDay(after.state, key, null);
  assert.deepEqual(compareSavedWeeks(before, after).counts, { unchanged: 0, moved: 0, scheduled: 0, omitted: 5 });
  const next = resave(after);
  next.state = setWeek(next.state, "2027-01-04");
  assert.deepEqual(compareSavedWeeks(after, next).counts, { unchanged: 5, moved: 0, scheduled: 0, omitted: 0 });
  const empty = structuredClone(response); empty.plan.meals = []; empty.plan.outing = null;
  const a = snapshot(empty);
  assert.deepEqual(compareSavedWeeks(a, resave(a)).counts, { unchanged: 0, moved: 0, scheduled: 0, omitted: 0 });
});

test("unknown source and legacy null calendar IDs remain explicitly saved-source comparisons", () => {
  const source = structuredClone(response); delete source.mock;
  const before = snapshot(source); before.calendarId = null;
  const after = resave(before);
  assert.equal(before.state.sourceMode, "unknown");
  assert.equal(compareSavedWeeks(before, after).paired, true);
  assert.equal(compareSavedWeeks(before, after).counts.unchanged, 5);
});
