"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createWeekExport } = require("../static/calendar.js");

const OPTIONS = { id: "0123456789abcdef0123456789abcdef", createdAt: new Date("2026-10-08T12:34:56Z") };
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
// Literal calendar dates keep the receiving expectations independent of writer arithmetic.
const DATES = {
  "2026-10-12": ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"],
  "2024-12-30": ["2024-12-30", "2024-12-31", "2025-01-01", "2025-01-02", "2025-01-03", "2025-01-04", "2025-01-05"],
};

function fixture() {
  const meal = (day, id) => ({ day, kind: "restaurant", entity_id: id, name: "Venue " + id,
    why: "Qloo affinity; verify needs with the venue." });
  const sourcePlan = {
    meals: [meal("Monday", "FIX-MON"), meal("Wednesday", "FIX-WED"), meal("Friday", "FIX-FRI"), meal("Sunday", "FIX-SUN")],
    outing: { day: "Saturday", kind: "outing", entity_id: "FIX-SAT", name: "Fictional museum", why: "Qloo affinity; music taste signal." },
    notes: ["Confirm transport before deciding."],
  };
  return withSource(sourcePlan);
}

function withSource(sourcePlan, sourceMode = "mock") {
  const picks = [...sourcePlan.meals, ...(sourcePlan.outing ? [sourcePlan.outing] : [])]
    .map((pick, index) => ({ key: "pick-" + index, originalDay: pick.day, pick }));
  return { weekStart: "2026-10-12", sourceMode, constraints: [], sourcePlan, picks,
    assignments: Object.fromEntries(picks.map(({ key, originalDay }) => [key, originalDay])) };
}

// These small carriers exercise the public schema. Independent composition
// review additionally executes the pinned native weekRows/setPickDay/resetDays.
function rows(state) {
  return DAYS.map((day, index) => ({ day, date: DATES[state.weekStart][index],
    picks: state.picks.filter(({ key }) => state.assignments[key] === day) }));
}
function assigned(state, changes) { return { ...state, assignments: { ...state.assignments, ...changes } }; }

function events(file) {
  const lines = file.text.replace(/\r\n[ \t]/g, "").split("\r\n");
  const result = [];
  let current;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { assert.equal(current, undefined); current = {}; }
    else if (line === "END:VEVENT") { assert.ok(current); result.push(current); current = undefined; }
    else if (current) {
      const colon = line.indexOf(":");
      assert.ok(colon > 0);
      const key = line.slice(0, colon);
      assert.equal(current[key], undefined);
      current[key] = line.slice(colon + 1);
    }
  }
  assert.equal(current, undefined);
  return result;
}
const unescapeText = (value) => value.replace(/\\([nN,;\\])/g, (_, c) => /[nN]/.test(c) ? "\n" : c);
const byUid = (file) => new Map(events(file).map((event) => [event.UID, event]));

test("the writer receives the existing week and preserves checked source details", () => {
  const state = fixture();
  const session = createWeekExport(state, OPTIONS);
  assert.equal(session.totalCount, 5);
  assert.equal(Object.isFrozen(session), true);
  const file = session.download(state, rows(state));
  assert.equal(file.filename, "tastetable-demo-2026-10-12.ics");
  assert.deepEqual(session.preview(state, rows(state)).map((item) => item.date), [
    "2026-10-12", "2026-10-14", "2026-10-16", "2026-10-17", "2026-10-18",
  ]);
  for (const event of events(file)) {
    const description = unescapeText(event.DESCRIPTION);
    const original = state.picks.find((item) => event.UID.includes("-" + item.key + "@"));
    assert.ok(original);
    assert.ok(description.includes("Qloo entity ID: " + original.pick.entity_id));
    assert.ok(description.includes("Why this suggestion: " + original.pick.why));
    assert.ok(description.includes("Plan note: " + state.sourcePlan.notes[0]));
    assert.ok(description.includes("Originally suggested for: " + original.originalDay));
    assert.match(description, /synthetic Qloo fixture; these venues are fictional/);
    assert.equal(event.STATUS, "TENTATIVE");
    assert.equal(event.TRANSP, "TRANSPARENT");
    assert.equal(event.CLASS, "PRIVATE");
  }
});

test("moved picks share a day without collisions and keep their original explanations", () => {
  const original = fixture();
  const session = createWeekExport(original, OPTIONS);
  const state = assigned(original, { "pick-0": "Tuesday", "pick-1": "Tuesday" });
  const moved = session.preview(state, rows(state)).filter((item) => item.day === "Tuesday");
  assert.deepEqual(moved.map((item) => [item.key, item.originalDay, item.date, item.endDate]), [
    ["pick-0", "Monday", "2026-10-13", "2026-10-14"],
    ["pick-1", "Wednesday", "2026-10-13", "2026-10-14"],
  ]);
  const file = session.download(state, rows(state));
  assert.equal(file.count, 5);
  assert.equal(new Set(events(file).map((event) => event.UID)).size, 5);
  const movedEvents = events(file).filter((event) => event["DTSTART;VALUE=DATE"] === "20261013");
  assert.equal(movedEvents.length, 2);
  assert.ok(movedEvents.every((event) => unescapeText(event.DESCRIPTION).includes("Arranged for: Tuesday 2026-10-13.")));
});

test("off-week picks are absent, and reset restores byte-identical content and identities", () => {
  const original = fixture();
  const session = createWeekExport(original, OPTIONS);
  const before = session.download(original, rows(original));
  const omitted = assigned(original, { "pick-0": null, "pick-4": null });
  assert.equal(session.download(omitted, rows(omitted)).count, 3);
  assert.doesNotMatch(session.download(omitted, rows(omitted)).text, /FIX-MON|FIX-SAT/);
  const empty = assigned(original, Object.fromEntries(original.picks.map(({ key }) => [key, null])));
  assert.deepEqual(session.preview(empty, rows(empty)), []);
  assert.throws(() => session.download(empty, rows(empty)), /no checked suggestions/);
  assert.deepEqual(session.download(original, rows(original)), before);
});

test("moves preserve a weekly pick's UID, while other weeks and new plans get distinct identities", () => {
  const original = fixture();
  const session = createWeekExport(original, OPTIONS);
  const before = byUid(session.download(original, rows(original)));
  const movedState = assigned(original, { "pick-0": "Sunday" });
  const withinWeek = byUid(session.download(movedState, rows(movedState)));
  assert.deepEqual([...withinWeek.keys()].sort(), [...before.keys()].sort());
  const next = { ...movedState, weekStart: "2024-12-30" };
  const after = byUid(session.download(next, rows(next)));
  assert.ok([...after.keys()].every((uid) => !before.has(uid)));
  const moved = [...after.values()].find((event) => event.UID.includes("-pick-0@"));
  assert.equal(moved["DTSTART;VALUE=DATE"], "20250105");
  assert.equal(moved["DTEND;VALUE=DATE"], "20250106");
  assert.throws(() => session.download(next, rows(original)), /arranged week/);
  assert.deepEqual(byUid(session.download(original, rows(original))), before);
  const replacement = createWeekExport(original, { ...OPTIONS, id: "f".repeat(32) });
  assert.ok([...byUid(replacement.download(original, rows(original))).keys()].every((uid) => !before.has(uid)));
});

test("repeated source entities remain separate stable picks when arranged together", () => {
  const plan = fixture().sourcePlan;
  plan.meals[1] = { ...plan.meals[0], day: "Wednesday" };
  const original = withSource(plan);
  const session = createWeekExport(original, OPTIONS);
  const state = assigned(original, { "pick-0": "Thursday", "pick-1": "Thursday" });
  const together = events(session.download(state, rows(state))).filter((event) => event["DTSTART;VALUE=DATE"] === "20261015");
  assert.equal(together.length, 2);
  assert.notEqual(together[0].UID, together[1].UID);
  assert.ok(together.every((event) => unescapeText(event.DESCRIPTION).includes("Qloo entity ID: FIX-MON")));
});

test("partial and empty checked source plans remain partial and empty", () => {
  const plan = fixture().sourcePlan;
  plan.meals = [];
  plan.notes = ["No restaurant passed; meal days remain open."];
  const state = withSource(plan);
  const session = createWeekExport(state, OPTIONS);
  assert.equal(session.totalCount, 1);
  const [event] = events(session.download(state, rows(state)));
  assert.equal(event["DTSTART;VALUE=DATE"], "20261017");
  assert.match(unescapeText(event.DESCRIPTION), /meal days remain open/);
  const empty = withSource({ meals: [], outing: null, notes: [] });
  const emptySession = createWeekExport(empty, OPTIONS);
  assert.equal(emptySession.totalCount, 0);
  assert.deepEqual(emptySession.preview(empty, rows(empty)), []);
  assert.throws(() => emptySession.download(empty, rows(empty)), /no checked suggestions/);
});

test("stale, missing, repeated or altered rows refuse the whole export", () => {
  const state = fixture();
  const session = createWeekExport(state, OPTIONS);
  const mutations = [
    (r) => { r.pop(); },
    (r) => { r.push(structuredClone(r[0])); },
    (r) => { r[0].date = "2026-10-19"; },
    (r) => { r[0].day = "Tuesday"; },
    (r) => { r[0].picks = []; },
    (r) => { r[0].picks.push(structuredClone(r[0].picks[0])); },
    (r) => { r[1].picks.push(r[0].picks.pop()); },
    (r) => { r[0].picks[0].key = "unknown"; },
    (r) => { r[0].picks[0].pick.why = "a different explanation"; },
    (r) => { r[0].picks[0].originalDay = "Friday"; },
    (r) => { r[0].picks = null; },
  ];
  for (const mutate of mutations) {
    const current = structuredClone(rows(state));
    mutate(current);
    assert.throws(() => session.download(state, current));
  }
  assert.throws(() => session.download(state));
  const offWeek = assigned(state, { "pick-0": null });
  assert.throws(() => session.download(offWeek, rows(state)));
});

test("malformed assignments, source identity, provenance and picker dates refuse export", () => {
  const mutations = [
    (s) => { s.sourceMode = "unknown"; },
    (s) => { s.sourceMode = true; },
    (s) => { s.sourcePlan.notes = null; },
    (s) => { s.picks.pop(); },
    (s) => { s.picks[1].key = s.picks[0].key; },
    (s) => { s.picks[0].key = "pick-0\r\nATTENDEE:injected"; },
    (s) => { s.picks[0].pick = { ...s.picks[0].pick, entity_id: "changed" }; },
    (s) => { s.picks[0].originalDay = "Sunday"; },
    (s) => { delete s.assignments["pick-0"]; },
    (s) => { s.assignments.extra = "Monday"; },
    (s) => { s.assignments["pick-0"] = "Tuesday "; },
    (s) => { s.assignments = []; },
    (s) => { s.weekStart = "2026-10-13"; },
    (s) => { s.weekStart = "2026-02-30"; },
  ];
  for (const mutate of mutations) {
    const state = fixture();
    mutate(state);
    assert.throws(() => createWeekExport(state, OPTIONS));
  }
  const original = fixture();
  const session = createWeekExport(original, OPTIONS);
  for (const mutate of [
    (s) => { s.sourceMode = "live"; },
    (s) => { s.sourcePlan.notes.push("new source note"); },
    (s) => { s.sourcePlan.meals[0].name = "changed source venue"; },
  ]) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.throws(() => session.download(changed, rows(changed)));
  }
});

test("source and preview mutations cannot silently change an existing session", () => {
  const original = fixture();
  const unchanged = structuredClone(original);
  const session = createWeekExport(original, OPTIONS);
  const before = session.download(original, rows(original));
  session.preview(original, rows(original))[0].name = "altered preview";
  original.sourcePlan.notes.push("mutated external note");
  assert.throws(() => session.download(original, rows(original)));
  assert.deepEqual(session.download(unchanged, rows(unchanged)), before);
});

test("live source and UTF-8 descriptions keep provenance, escaping and byte limits", () => {
  const plan = fixture().sourcePlan;
  const name = "食事🍜é".repeat(80) + ",;\\\nEND:VEVENT\nBEGIN:VEVENT";
  plan.meals[0].name = name;
  plan.meals[0].why = "音楽;候補\\".repeat(80);
  const state = withSource(plan, "live");
  const oldKey = state.picks[0].key;
  state.picks[0].key = "k".repeat(64);
  state.assignments[state.picks[0].key] = state.assignments[oldKey];
  delete state.assignments[oldKey];
  const session = createWeekExport(state, OPTIONS);
  const file = session.download(state, rows(state));
  assert.doesNotMatch(file.text, /DEMO|synthetic Qloo fixture/);
  assert.equal(events(file).length, 5);
  assert.equal(unescapeText(events(file)[0].SUMMARY), "TasteTable suggestion: " + name);
  assert.match(unescapeText(events(file)[0].DESCRIPTION), /aggregate affinity is not a claim about any individual/);
  for (const line of file.text.split("\r\n")) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75);
    assert.equal(Buffer.from(line, "utf8").toString("utf8"), line);
  }
});
