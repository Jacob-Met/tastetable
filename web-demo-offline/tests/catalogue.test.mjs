import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { CONSTRAINTS, SOURCE_COMMIT, chooseRecord, recordKey, validateCatalogue } from "../catalogue.mjs";
import { calendarWeek, createWeekPlan, offWeekPicks, resetDays, setPickDay, setWeek, weekRows } from "../week_plan.mjs";

const root = new URL("../", import.meta.url);
const raw = JSON.parse(fs.readFileSync(new URL("data/catalogue.json", root), "utf8"));
const catalogue = validateCatalogue(raw);

test("all 24 supported selections retain the exact native response and download", () => {
  for (const profile of ["rosa", "harold", "mei"]) for (let mask = 0; mask < 8; mask++) {
    const constraints = CONSTRAINTS.filter((_, bit) => mask & (1 << bit));
    const record = chooseRecord(catalogue, profile, constraints);
    assert.equal(record.key, `${profile}-${mask}`);
    const downloaded = JSON.parse(fs.readFileSync(new URL(`data/records/${record.key}.json`, root), "utf8"));
    assert.deepEqual(record, downloaded);
    assert.deepEqual(record.response.comparison.constraints, constraints);
    assert.equal(record.response.mock, true);
  }
});

test("constraint order is canonical; duplicate, foreign and malformed choices are refused", () => {
  assert.equal(recordKey("rosa", ["wheelchair", "soft_foods"]), "rosa-5");
  for (const pair of [["__proto__", []], ["rosa", ["soft_foods", "soft_foods"]],
                      ["rosa", ["diabetes"]], ["rosa", null], ["rosa", "wheelchair"]]) {
    assert.throws(() => recordKey(...pair), /Recorded catalogue/);
  }
});

test("loaded records are immutable and weekly edits cannot change source responses", () => {
  const record = chooseRecord(catalogue, "rosa", CONSTRAINTS);
  const before = JSON.stringify(record);
  assert.throws(() => { record.response.mock = false; }, TypeError);
  let week = createWeekPlan(record.response, "2026-10-08");
  week = setPickDay(week, week.picks[0].key, "Tuesday");
  week = setPickDay(week, week.picks[1].key, null);
  assert.equal(offWeekPicks(week).length, 1);
  assert.equal(JSON.stringify(record), before);
  assert.equal(raw.source.commit, SOURCE_COMMIT);
});

for (const [label, mutate] of [
  ["wrong schema", (x) => { x.schema = "unrelated"; }],
  ["wrong source", (x) => { x.source.commit = "0".repeat(40); }],
  ["missing record", (x) => { x.records.pop(); }],
  ["duplicate record", (x) => { x.records[23] = x.records[0]; }],
  ["wrong profile", (x) => { x.profiles[0].id = "unknown"; }],
  ["false live source", (x) => { x.records[0].response.mock = false; }],
  ["stale constraints", (x) => { x.records[0].response.comparison.constraints = ["wheelchair"]; }],
  ["malformed pick", (x) => { x.records[0].response.plan.meals[0].affinity = "strong"; }],
  ["missing native trace", (x) => { x.records[0].response.trace = []; }],
]) {
  test(`catalogue refuses ${label} before rendering`, () => {
    const copy = structuredClone(raw); mutate(copy);
    assert.throws(() => validateCatalogue(copy), /Recorded catalogue/);
  });
}

test("the strict Mei recording keeps its actual missing meal and explicit note", () => {
  const relaxed = chooseRecord(catalogue, "mei", []);
  const strict = chooseRecord(catalogue, "mei", CONSTRAINTS);
  assert.equal(relaxed.response.plan.meals.length, 4);
  assert.equal(strict.response.plan.meals.length, 3);
  assert.ok(strict.response.plan.notes.some((line) => line.includes("remaining days left open")));
  assert.equal(weekRows(createWeekPlan(strict.response, "2026-10-08")).filter((row) => !row.picks.length).length, 3);
});

test("calendar year/leap boundaries preserve the selected recorded identities", () => {
  const record = chooseRecord(catalogue, "mei", CONSTRAINTS);
  let week = createWeekPlan(record.response, "2026-12-31");
  assert.deepEqual(weekRows(week).map((r) => r.date),
    ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
  week = setPickDay(week, week.picks[0].key, "Tuesday");
  week = setWeek(week, "2024-02-29");
  assert.equal(week.assignments[week.picks[0].key], "Tuesday");
  assert.equal(weekRows(week)[6].date, "2024-03-03");
  assert.deepEqual(resetDays(week).assignments, Object.fromEntries(week.picks.map((p) => [p.key, p.originalDay])));
  for (const date of ["", "2026-02-29", "2026-13-01"]) assert.throws(() => calendarWeek(date), RangeError);
});
