import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import {
  createWeekPlan, offWeekPicks, resetDays, setPickDay, setWeek, weekRows,
} from "./sibling-snapshot/static/week_plan.mjs";

// Independent receiving tests: the planner is an unmodified source copy, and
// fixtures are complete real run_agent() responses captured before this adapter.
const require = createRequire(import.meta.url);
const writerPath = fileURLToPath(new URL("./writer-snapshot-final/static/calendar.js", import.meta.url));
const calendar = require(writerPath);
const fixturePath = fileURLToPath(new URL("./native_results.json", import.meta.url));
const fixtures = JSON.parse(readFileSync(fixturePath, "utf8"));
const clone = (value) => structuredClone(value);
const source = (name = "rosa") => clone(fixtures.results[name]);
const options = (id = "a".repeat(32)) => ({ id, createdAt: new Date("2026-10-08T08:00:00Z") });
const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const observations = [];

function setup(name = "rosa", anchor = "2026-10-08") {
  const response = source(name);
  const state = createWeekPlan(response, anchor);
  return { response, state, session: calendar.createWeekExport(state, options()) };
}

// Read actual generated events. This is deliberately separate from the writer's
// formatting helpers and makes dates, descriptions and stable identities visible.
function events(output) {
  const unfolded = output.text.replace(/\r\n[ \t]/g, "");
  return [...unfolded.matchAll(/BEGIN:VEVENT\r\n([\s\S]*?)END:VEVENT\r\n/g)].map((match) => {
    const result = {};
    for (const line of match[1].split("\r\n").filter(Boolean)) {
      const colon = line.indexOf(":");
      const key = line.slice(0, colon).split(";")[0];
      assert.ok(!Object.hasOwn(result, key), `Duplicate event field ${key}`);
      result[key] = line.slice(colon + 1).replace(/\\([nN,;\\])/g, (_, c) => /[nN]/.test(c) ? "\n" : c);
    }
    return result;
  });
}

function checkOutput(session, state, expected) {
  const rows = weekRows(state);
  const preview = session.preview(state, rows);
  assert.deepEqual(preview.map(({ key, date, name }) => ({ key, date, name })), expected);
  const output = session.download(state, rows);
  const actual = events(output);
  assert.equal(output.count, expected.length);
  assert.equal(actual.length, expected.length);
  assert.match(output.filename, new RegExp(`${state.weekStart}\\.ics$`));
  assert.deepEqual(actual.map(({ DTSTART, SUMMARY }) => ({ date: DTSTART, name: SUMMARY.replace(/^\[DEMO\] /, "").replace(/^TasteTable suggestion: /, "") })),
    expected.map(({ date, name }) => ({ date: date.replaceAll("-", ""), name })));
  assert.equal(new Set(actual.map(({ UID }) => UID)).size, actual.length);
  return { output, actual, preview };
}

function expectRefusal(session, state, rows, label) {
  assert.throws(() => session.preview(state, rows), undefined, `${label}: preview`);
  assert.throws(() => session.download(state, rows), undefined, `${label}: download`);
}

test("native picks are exported from the arranged rows with full receiving evidence", () => {
  for (const name of ["rosa", "harold", "mei"]) {
    const { state, session } = setup(name);
    const preview = session.preview(state, weekRows(state));
    const output = session.download(state, weekRows(state));
    const actual = events(output);
    assert.equal(actual.length, 5);
    assert.equal(session.totalCount, 5);
    assert.equal(Object.isFrozen(session), true);
    for (let i = 0; i < preview.length; i++) {
      const original = state.picks.find(({ key }) => key === preview[i].key);
      assert.equal(preview[i].originalDay, original.originalDay);
      assert.ok(actual[i].DESCRIPTION.includes(original.pick.entity_id));
      assert.ok(actual[i].DESCRIPTION.includes(original.pick.why));
      for (const note of state.sourcePlan.notes) assert.ok(actual[i].DESCRIPTION.includes(note));
      assert.match(actual[i].DESCRIPTION, /synthetic Qloo fixture/);
      assert.equal(actual[i].STATUS, "TENTATIVE");
    }
  }
});

test("moving Monday's pick onto Wednesday retains two separate restaurant events", () => {
  const { state, session } = setup();
  const moved = setPickDay(state, "pick-0", "Wednesday");
  assert.equal(weekRows(moved)[2].picks.length, 2);
  const checked = checkOutput(session, moved, [
    { key: "pick-0", date: "2026-10-07", name: "Casa Habana Kitchen" },
    { key: "pick-1", date: "2026-10-07", name: "Abuela's Table" },
    { key: "pick-2", date: "2026-10-09", name: "Blue Plate Diner" },
    { key: "pick-4", date: "2026-10-10", name: "Arroyo Museum of Latin Music (fictional)" },
    { key: "pick-3", date: "2026-10-11", name: "Trattoria Nonna Lucia" },
  ]);
  assert.match(checked.actual[0].DESCRIPTION, /Originally suggested for: Monday\. Arranged for: Wednesday 2026-10-07\./);
  observations.push({ case: "two_restaurants_one_day", preview: checked.preview, events: checked.actual });
});

test("off-week picks are omitted, all-off-week refuses download, and restore keeps identity", () => {
  const { state, session } = setup();
  const original = events(session.download(state, weekRows(state)));
  const omitted = setPickDay(state, "pick-0", null);
  const output = session.download(omitted, weekRows(omitted));
  assert.equal(output.count, 4);
  assert.equal(offWeekPicks(omitted)[0].key, "pick-0");
  assert.ok(!events(output).some(({ SUMMARY }) => SUMMARY.includes("Casa Habana Kitchen")));
  let empty = state;
  for (const { key } of state.picks) empty = setPickDay(empty, key, null);
  assert.deepEqual(session.preview(empty, weekRows(empty)), []);
  assert.throws(() => session.download(empty, weekRows(empty)), /no checked suggestions/i);
  const restored = resetDays(empty);
  assert.deepEqual(events(session.download(restored, weekRows(restored))), original);
});

test("pick-key UIDs survive within-week moves and reset; selected weeks are distinct occurrences", () => {
  const { state, session } = setup();
  const initial = events(session.download(state, weekRows(state)));
  const byName = new Map(initial.map((event) => [event.SUMMARY, event.UID]));
  const moved = setPickDay(setPickDay(state, "pick-0", "Sunday"), "pick-4", null);
  for (const event of events(session.download(moved, weekRows(moved)))) assert.equal(event.UID, byName.get(event.SUMMARY));
  assert.deepEqual(events(session.download(resetDays(moved), weekRows(resetDays(moved)))), initial);
  let changed = setWeek(moved, "2027-01-01");
  assert.equal(changed.weekStart, "2026-12-28");
  const changedEvents = events(session.download(changed, weekRows(changed)));
  const originalIDs = new Set(byName.values());
  for (const event of changedEvents) assert.ok(!originalIDs.has(event.UID));
  const selectedWeek = setWeek(state, "2027-01-01");
  const selectedWeekByName = new Map(events(session.download(selectedWeek, weekRows(selectedWeek))).map((event) => [event.SUMMARY, event.UID]));
  changed = resetDays(changed);
  assert.equal(changed.weekStart, "2026-12-28");
  const reset = events(session.download(changed, weekRows(changed)));
  for (const event of reset) assert.equal(event.UID, selectedWeekByName.get(event.SUMMARY));
  assert.equal(reset.find(({ SUMMARY }) => SUMMARY.includes("Casa Habana Kitchen")).DTSTART, "20261228");
  assert.equal(reset.find(({ SUMMARY }) => SUMMARY.includes("Latin Music")).DTSTART, "20270102");
  assert.equal(state.weekStart, "2026-10-05");
  const returned = setWeek(changed, state.weekStart);
  assert.deepEqual(events(session.download(returned, weekRows(returned))), initial);
  observations.push({ case: "stable_identity_within_week_distinct_weekly_occurrences", initial, changed: changedEvents, reset });
});

test("duplicate source entity IDs retain distinct keys and UIDs on the same day", () => {
  const response = source();
  response.plan.meals[1].entity_id = response.plan.meals[0].entity_id;
  const state = createWeekPlan(response, "2026-10-08");
  const session = calendar.createWeekExport(state, options());
  const moved = setPickDay(state, "pick-1", "Monday");
  const sameDay = events(session.download(moved, weekRows(moved))).filter(({ DTSTART }) => DTSTART === "20261005");
  assert.equal(sameDay.length, 2);
  assert.notEqual(sameDay[0].UID, sameDay[1].UID);
  assert.match(sameDay[0].SUMMARY, /Casa Habana Kitchen/);
  assert.match(sameDay[1].SUMMARY, /Abuela's Table/);
});

test("new source sessions receive distinct identities and old sessions reject replacement", () => {
  const { state, session } = setup();
  const newState = createWeekPlan(source("harold"), state.weekStart);
  expectRefusal(session, newState, weekRows(newState), "different persona source");
  const newSession = calendar.createWeekExport(newState, options("b".repeat(32)));
  const oldIDs = new Set(events(session.download(state, weekRows(state))).map(({ UID }) => UID));
  for (const { UID } of events(newSession.download(newState, weekRows(newState)))) assert.ok(!oldIDs.has(UID));
  // Independent sessions using actual random identifiers must not collide either.
  const randomOne = calendar.createWeekExport(state);
  const randomTwo = calendar.createWeekExport(state);
  assert.notEqual(events(randomOne.download(state, weekRows(state)))[0].UID,
    events(randomTwo.download(state, weekRows(state)))[0].UID);
});

test("partial and empty native plans preserve omissions without borrowing rejected picks", () => {
  const partial = setup("one_pick");
  const moved = setPickDay(partial.state, "pick-0", "Friday");
  const output = partial.session.download(moved, weekRows(moved));
  assert.equal(output.count, 1);
  const [event] = events(output);
  assert.equal(event.DTSTART, "20261009");
  for (const note of partial.state.sourcePlan.notes) assert.ok(event.DESCRIPTION.includes(note));
  const empty = setup("no_picks");
  assert.equal(empty.session.totalCount, 0);
  assert.deepEqual(empty.session.preview(empty.state, weekRows(empty.state)), []);
  assert.throws(() => empty.session.download(empty.state, weekRows(empty.state)), /no checked suggestions/i);
});

test("source provenance is immutable and unknown sourceMode cannot become live", () => {
  const { state, session } = setup();
  const live = source();
  live.mock = false;
  const liveState = createWeekPlan(live, "2026-10-08");
  const liveSession = calendar.createWeekExport(liveState, options());
  assert.doesNotMatch(liveSession.source, /DEMO/);
  const liveOutput = liveSession.download(liveState, weekRows(liveState));
  assert.match(liveOutput.filename, /^tastetable-2026/);
  assert.doesNotMatch(events(liveOutput)[0].SUMMARY, /DEMO/);
  assert.match(events(liveOutput)[0].DESCRIPTION, /aggregate affinity is not a claim about any individual/);
  expectRefusal(session, liveState, weekRows(liveState), "mock to live source switch");
  for (const mock of [undefined, null, "false", 0, {}]) {
    const response = source(); response.mock = mock;
    const unknown = createWeekPlan(response, "2026-10-08");
    assert.equal(unknown.sourceMode, "unknown");
    assert.throws(() => calendar.createWeekExport(unknown, options()));
  }
});

test("existing accepted unknown qualification is preserved without promoting its status", () => {
  const { state, session } = setup("unknown_dietary");
  const actual = events(session.download(state, weekRows(state)));
  const unknownPicks = state.picks.filter(({ pick }) => /unknown/i.test(pick.why));
  assert.ok(unknownPicks.length > 0, "actual native fixture must contain accepted unknown evidence");
  for (const { pick } of unknownPicks) {
    const found = actual.find(({ SUMMARY }) => SUMMARY.includes(pick.name));
    assert.ok(found?.DESCRIPTION.includes(pick.why));
  }
});

test("stale rows cannot silently export a different week or assignment than current state", () => {
  const { state, session } = setup();
  const rows = weekRows(state);
  const moved = setPickDay(state, "pick-0", "Tuesday");
  expectRefusal(session, moved, rows, "old rows after move");
  const omitted = setPickDay(state, "pick-0", null);
  expectRefusal(session, omitted, rows, "old rows after omission");
  const nextWeek = setWeek(state, "2026-10-15");
  expectRefusal(session, nextWeek, rows, "old rows after new week");
  for (const badWeek of ["2026-10-06", "", "2026-02-30", null, "2026-10-05T00:00:00Z"]) {
    expectRefusal(session, { ...state, weekStart: badWeek }, rows, `invalid week ${badWeek}`);
  }
});

test("changed source, notes, keys, original days and injected rejected picks are refused", () => {
  const { state, session } = setup();
  const cases = [
    ["name", (s) => { s.sourcePlan.meals[0].name = s.picks[0].pick.name = "Unreviewed replacement"; }],
    ["entity", (s) => { s.sourcePlan.meals[0].entity_id = s.picks[0].pick.entity_id = "rejected-foreign"; }],
    ["why", (s) => { s.sourcePlan.meals[0].why = s.picks[0].pick.why = "Verified booking"; }],
    ["note", (s) => { s.sourcePlan.notes.push("New unretained note"); }],
    ["mode", (s) => { s.sourceMode = "live"; }],
    ["original day", (s) => { s.picks[0].originalDay = "Thursday"; }],
    ["key replacement", (s) => { s.picks[0].key = "pick-new"; s.assignments["pick-new"] = s.assignments["pick-0"]; delete s.assignments["pick-0"]; }],
    ["duplicate key", (s) => { s.picks[1].key = s.picks[0].key; }],
    ["extra pick", (s) => { s.picks.push({ key: "rejected", originalDay: "Monday", pick: clone(s.picks[0].pick) }); s.assignments.rejected = "Monday"; }],
  ];
  for (const [label, edit] of cases) {
    const altered = clone(state); edit(altered);
    expectRefusal(session, altered, weekRows(altered), label);
  }
});

test("malformed row carrier cannot lose, duplicate, invent or relabel an accepted pick", () => {
  const { state, session } = setup();
  const cases = [
    ["missing day", (rows) => { rows.pop(); }],
    ["extra day", (rows) => { rows.push(clone(rows[0])); }],
    ["wrong date", (rows) => { rows[0].date = "2026-10-12"; }],
    ["wrong day label", (rows) => { rows[0].day = "Sunday"; }],
    ["missing scheduled pick", (rows) => { rows[0].picks = []; }],
    ["duplicate pick", (rows) => { rows[0].picks.push(clone(rows[0].picks[0])); }],
    ["changed identity", (rows) => { rows[0].picks[0].pick.entity_id = "foreign"; }],
    ["unknown key", (rows) => { rows[0].picks[0].key = "not-a-pick"; }],
    ["wrong carrier type", (rows) => { rows[0].picks = {}; }],
  ];
  for (const [label, edit] of cases) {
    const rows = clone(weekRows(state)); edit(rows);
    expectRefusal(session, state, rows, label);
  }
  for (const value of [null, {}, [], "rows"]) expectRefusal(session, state, value, "invalid rows shape");
});

test("invalid assignments and planner-accepted incomplete native records fail closed", () => {
  const { state, session } = setup();
  const assignmentCases = [
    { ...state.assignments, "foreign-key": "Monday" },
    Object.fromEntries(Object.entries(state.assignments).filter(([key]) => key !== "pick-0")),
    { ...state.assignments, "pick-0": undefined },
    { ...state.assignments, "pick-0": "Someday" },
    null, [],
  ];
  for (const assignments of assignmentCases) {
    const changed = { ...state, assignments };
    expectRefusal(session, changed, weekRows(state), "invalid assignments");
    assert.throws(() => calendar.createWeekExport(changed, options()));
  }
  const sourceCases = [
    (r) => { r.plan.notes = null; },
    (r) => { delete r.plan.meals[0].name; },
    (r) => { r.plan.meals[0].why = ""; },
    (r) => { r.plan.meals[0].kind = "outing"; },
    (r) => { r.plan.meals[1].day = "Monday"; },
    (r) => { r.plan.outing = undefined; },
  ];
  for (const edit of sourceCases) {
    const response = source(); edit(response);
    const malformed = createWeekPlan(response, "2026-10-08");
    assert.throws(() => calendar.createWeekExport(malformed, options()));
  }
});

test("mutable response, returned preview, and cloned state cannot rewrite the session", () => {
  const response = source();
  const state = createWeekPlan(response, "2026-10-08");
  const input = clone(state);
  const session = calendar.createWeekExport(input, options());
  const original = session.download(state, weekRows(state));
  response.plan.meals[0].name = "Response mutation";
  input.sourcePlan.notes.push("Snapshot mutation");
  input.picks[0].pick.why = "Altered explanation";
  const preview = session.preview(state, weekRows(state));
  preview[0].name = "Preview mutation";
  preview[0].day = "Sunday";
  assert.deepEqual(session.download(state, weekRows(state)), original);
  expectRefusal(session, input, weekRows(input), "mutated initial state");
});

test("same accepted arrangement gives exact repeat bytes without mutating source or rows", () => {
  const { state, session } = setup();
  const arranged = setPickDay(setPickDay(state, "pick-0", "Wednesday"), "pick-4", null);
  const rows = weekRows(arranged);
  const before = JSON.stringify({ state, arranged, rows });
  const first = session.download(arranged, rows);
  assert.deepEqual(session.download(arranged, rows), first);
  assert.equal(JSON.stringify({ state, arranged, rows }), before);
  // Rejecting another input must not spoil a later valid download.
  expectRefusal(session, { ...arranged, sourceMode: "unknown" }, rows, "bad provenance");
  assert.deepEqual(session.download(arranged, rows), first);
});

after(() => {
  writeFileSync(new URL("./composition-observations.json", import.meta.url), JSON.stringify({
    schema: "calendar-composition-independent-observations.v1",
    node: process.version,
    writer_sha256: digest(writerPath),
    planner_sha256: digest(fileURLToPath(new URL("./sibling-snapshot/static/week_plan.mjs", import.meta.url))),
    fixture_sha256: digest(fixturePath),
    native_provider_calls: false,
    browser_run: false,
    observations,
  }, null, 2) + "\n");
});
