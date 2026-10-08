import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  DAYS, calendarWeek, createWeekPlan, localDate, offWeekPicks,
  resetDays, setPickDay, setWeek, weekRows,
} from "../static/week_plan.mjs";

const response = () => ({
  mock: true,
  plan: {
    meals: [
      { day: "Monday", kind: "restaurant", entity_id: "fixture-meal-1", name: "One", affinity: 0.85, fallback: false, why: "Original check evidence.", extra: { preserved: true } },
      { day: "Wednesday", kind: "restaurant", entity_id: "fixture-meal-2", name: "Two", affinity: 0.62, fallback: true, why: "Widened fixture pick." },
    ],
    outing: { day: "Saturday", kind: "outing", entity_id: "fixture-outing-1", name: "Cinema", affinity: null, why: "Access checked; dietary checks do not apply." },
    notes: ["Only two restaurant candidates passed."],
    rejected: [{ entity_id: "rejected-1", name: "Not a suggestion", failed: [{ status: "unknown" }] }],
  },
  comparison: { constraints: ["soft_foods", "wheelchair"] },
});

test("initial week retains every suggestion and exposes all seven dates", () => {
  const source = response();
  const state = createWeekPlan(source, "2026-10-08");
  assert.equal(state.weekStart, "2026-10-05");
  const rows = weekRows(state);
  assert.deepEqual(rows.map(({ day }) => day), DAYS);
  assert.deepEqual(rows.map(({ date }) => date), ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
  assert.equal(rows.filter(({ picks }) => !picks.length).length, 4);
  assert.deepEqual(rows.flatMap(({ picks }) => picks.map(({ pick }) => pick)), [...source.plan.meals, source.plan.outing]);
  assert.deepEqual(state.sourcePlan, source.plan);
});

test("move, omit and restore preserve source evidence and unrelated picks", () => {
  const source = response();
  const original = structuredClone(source);
  const initial = createWeekPlan(source, "2026-10-08");
  const moved = setPickDay(initial, "pick-0", "Wednesday");
  assert.equal(weekRows(moved)[2].picks.length, 2);
  assert.equal(weekRows(moved)[0].picks.length, 0);
  assert.equal(initial.assignments["pick-0"], "Monday");
  const omitted = setPickDay(moved, "pick-1", null);
  assert.deepEqual(offWeekPicks(omitted).map(({ key }) => key), ["pick-1"]);
  assert.deepEqual(weekRows(omitted).flatMap(({ picks }) => picks.map(({ key }) => key)), ["pick-0", "pick-2"]);
  const restored = setPickDay(omitted, "pick-1", "Sunday");
  assert.equal(offWeekPicks(restored).length, 0);
  assert.equal(weekRows(restored)[6].picks[0].pick.entity_id, "fixture-meal-2");
  assert.deepEqual(restored.sourcePlan, original.plan);
  assert.deepEqual(source, original);
  assert.deepEqual(restored.constraints, original.comparison.constraints);
});

test("reset restores original assignments while keeping the chosen week", () => {
  const initial = createWeekPlan(response(), "2026-10-08");
  const changed = setWeek(setPickDay(setPickDay(initial, "pick-0", null), "pick-2", "Tuesday"), "2027-01-01");
  const reset = resetDays(changed);
  assert.equal(reset.weekStart, "2026-12-28");
  assert.deepEqual(reset.assignments, initial.assignments);
  assert.equal(reset.sourcePlan, initial.sourcePlan);
});

test("calendar weeks handle leap days and year boundaries", () => {
  assert.deepEqual(calendarWeek("2024-02-29").map(({ date }) => date), ["2024-02-26", "2024-02-27", "2024-02-28", "2024-02-29", "2024-03-01", "2024-03-02", "2024-03-03"]);
  assert.deepEqual(calendarWeek("2027-01-03").map(({ date }) => date), ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
  assert.equal(calendarWeek("0001-01-01")[0].date, "0001-01-01");
});

test("invalid dates and unknown transitions refuse without changing the plan", () => {
  const state = createWeekPlan(response(), "2026-10-08");
  const before = JSON.stringify(state);
  for (const value of ["", "2026-02-29", "2024-02-30", "2026-13-01", "2026-1-01", "2026-10-08T12:00:00Z", "0000-01-01", "9999-12-31", null]) {
    assert.throws(() => setWeek(state, value), RangeError, String(value));
  }
  assert.throws(() => setPickDay(state, "rejected-1", "Monday"), /Unknown/);
  assert.throws(() => setPickDay(state, "pick-0", "Someday"), RangeError);
  assert.throws(() => setPickDay(state, "pick-0", ""), RangeError);
  assert.equal(JSON.stringify(state), before);
});

test("source plan is a detached immutable snapshot", () => {
  const source = response();
  const state = createWeekPlan(source, "2026-10-08");
  source.plan.meals[0].why = "Changed after receipt";
  source.plan.meals[0].extra.preserved = false;
  source.comparison.constraints.push("new-constraint");
  assert.equal(state.picks[0].pick.why, "Original check evidence.");
  assert.equal(state.sourcePlan.meals[0].extra.preserved, true);
  assert.deepEqual(state.constraints, ["soft_foods", "wheelchair"]);
  assert.throws(() => { state.sourcePlan.meals[0].extra.preserved = false; }, TypeError);
  assert.throws(() => { state.assignments["pick-0"] = "Friday"; }, TypeError);
});

test("empty and partial plans remain honest and rejected candidates cannot be scheduled", () => {
  const source = response();
  source.plan.meals = [];
  source.plan.outing = null;
  const state = createWeekPlan(source, "2026-10-08");
  assert.equal(weekRows(state).filter(({ picks }) => !picks.length).length, 7);
  assert.equal(offWeekPicks(state).length, 0);
  assert.equal(state.sourcePlan.rejected.length, 1);
  assert.throws(() => setPickDay(state, "rejected-1", "Monday"), /Unknown/);
});

test("duplicate source IDs remain distinct suggestions through scheduling", () => {
  const source = response();
  source.plan.meals[1].entity_id = source.plan.meals[0].entity_id;
  const initial = createWeekPlan(source, "2026-10-08");
  const state = setPickDay(initial, "pick-1", "Monday");
  assert.equal(weekRows(state)[0].picks.length, 2);
  assert.equal(weekRows(state)[0].picks[0].pick.name, "One");
  assert.equal(weekRows(state)[0].picks[1].pick.name, "Two");
});

test("mode is retained explicitly and absence is never labeled live", () => {
  for (const [mode, expected] of [[true, "mock"], [false, "live"], [undefined, "unknown"], ["false", "unknown"]]) {
    const source = response();
    source.mock = mode;
    assert.equal(createWeekPlan(source, "2026-10-08").sourceMode, expected);
  }
});

test("missing source identity cannot create a local suggestion", () => {
  const source = response();
  delete source.plan.meals[0].entity_id;
  assert.throws(() => createWeekPlan(source, "2026-10-08"), /source identity/);
});

test("calendar arithmetic stays stable across time zones and daylight-saving boundaries", () => {
  const moduleURL = new URL("../static/week_plan.mjs", import.meta.url).href;
  const script = `import {calendarWeek,localDate} from ${JSON.stringify(moduleURL)}; console.log(JSON.stringify({week:calendarWeek('2026-03-08'),today:localDate(new Date('2026-01-01T00:30:00Z'))}));`;
  const result = (TZ) => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, TZ }, encoding: "utf8" }));
  const west = result("America/Los_Angeles"), east = result("Pacific/Kiritimati");
  assert.deepEqual(west.week, east.week);
  assert.deepEqual(west.week.map(({ date }) => date), ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07", "2026-03-08"]);
  assert.equal(west.today, "2025-12-31");
  assert.equal(east.today, "2026-01-01");
  assert.throws(() => localDate(new Date(NaN)), RangeError);
});
