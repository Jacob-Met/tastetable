import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { validateCatalogue } from "../catalogue.mjs";
import { createWeekPlan, setPickDay, setWeek, resetDays, weekRows } from "../week_plan.mjs";
import { readOfflineWeek, saveOfflineWeek } from "../saved_week.mjs";
import { prepareOfflineCalendar, previewOfflineCalendar } from "../offline_calendar.mjs";

const require = createRequire(import.meta.url);
const calendar = require("../calendar.js");
const catalogue = validateCatalogue(JSON.parse(readFileSync(new URL("../data/catalogue.json", import.meta.url), "utf8")));
const fixedId = "0123456789abcdef0123456789abcdef";
const receivedAt = "2026-10-08T12:34:56.789Z";
const sourceText = readFileSync(new URL("../calendar.js", import.meta.url));
function context(record = catalogue.records[0], anchor = "2026-10-07") {
  return { record, state: createWeekPlan(record.response, anchor), anchor, receivedAt, calendarId: null };
}
function events(text) {
  assert.ok(text.endsWith("\r\n"));
  assert.equal(text.replaceAll("\r\n", "").includes("\n"), false);
  for (const line of text.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75);
  const lines = text.replace(/\r\n[ \t]/g, "").split("\r\n");
  const result = [];
  let current = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { assert.equal(current, null); current = {}; }
    else if (line === "END:VEVENT") { assert.ok(current); result.push(current); current = null; }
    else if (current) {
      const colon = line.indexOf(":");
      assert.ok(colon > 0);
      const key = line.slice(0, colon);
      assert.equal(Object.hasOwn(current, key), false, "Calendar event property is not duplicated");
      current[key] = line.slice(colon + 1);
    }
  }
  assert.equal(current, null);
  return result;
}
function unescapeText(value) { return value.replace(/\\([\\,;n])/g, (_, c) => c === "n" ? "\n" : c); }
function dateAfter(date) {
  const value = new Date(date + "T00:00:00.000Z");
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10).replaceAll("-", "");
}
function assertArrangement(output, c) {
  const expected = weekRows(c.state).flatMap(row => row.picks.map(entry => ({ row, entry })));
  const actual = events(output.text);
  assert.equal(output.count, expected.length);
  assert.equal(actual.length, expected.length);
  assert.equal(new Set(actual.map(event => event.UID)).size, actual.length);
  actual.forEach((event, index) => {
    const { row, entry } = expected[index];
    assert.equal(event["DTSTART;VALUE=DATE"], row.date.replaceAll("-", ""));
    assert.equal(event["DTEND;VALUE=DATE"], dateAfter(row.date));
    assert.equal(event.DTSTAMP, "20261008T123456Z");
    assert.equal(event.UID, output.calendarId + "-" + c.state.weekStart.replaceAll("-", "") + "-" + entry.key + "@tastetable.invalid");
    assert.equal(event.STATUS, "TENTATIVE");
    assert.equal(event.TRANSP, "TRANSPARENT");
    assert.equal(event.CLASS, "PRIVATE");
    assert.equal(unescapeText(event.SUMMARY), "[DEMO] TasteTable suggestion: " + entry.pick.name);
    const description = unescapeText(event.DESCRIPTION);
    assert.ok(description.includes("DEMO: synthetic Qloo fixture; these venues are fictional."));
    assert.ok(description.includes("Qloo entity ID: " + entry.pick.entity_id));
    assert.ok(description.includes("Originally suggested for: " + entry.originalDay + ". Arranged for: " + row.day + " " + row.date + "."));
    assert.ok(description.includes("Why this suggestion: " + entry.pick.why));
    assert.ok(description.includes("Not medical or dietary advice."));
    for (const note of c.state.sourcePlan.notes) assert.ok(description.includes("Plan note: " + note));
  });
  return actual;
}

test("the existing calendar writer is copied byte-for-byte at its declared canonical Git pin", () => {
  const pin = JSON.parse(readFileSync(new URL("../calendar-source.json", import.meta.url), "utf8"));
  const git = createHash("sha1").update("blob " + sourceText.length + "\0").update(sourceText).digest("hex");
  assert.equal(pin.commit, "689ddc9a6a4f5f12068e1e99127cc77482c53924");
  assert.equal(pin.path, "static/calendar.js");
  assert.equal(git, "dbed22d2cb91090bccec9472fbffd2854eed2722");
  assert.equal(git, pin.git_blob);
  assert.equal(sourceText.length, pin.bytes);
});

test("all 24 actual recorded plans export the exact current dates, occurrences and source descriptions", () => {
  for (const record of catalogue.records) {
    let c = context(record);
    c.state = setPickDay(c.state, "pick-0", "Sunday");
    c.state = setPickDay(c.state, "pick-1", "Sunday");
    c.state = setPickDay(c.state, "pick-2", null);
    const before = JSON.stringify(c);
    const preview = previewOfflineCalendar(c, calendar);
    assert.equal(preview.items.length, c.state.picks.length - 1);
    assert.equal(preview.totalCount, c.state.picks.length);
    assert.equal(preview.items.filter(item => item.day === "Sunday").length >= 2, true);
    const output = prepareOfflineCalendar(c, calendar, () => fixedId);
    assert.equal(output.filename, "tastetable-demo-2026-10-05.ics");
    assert.equal(output.calendarId, fixedId);
    assertArrangement(output, c);
    assert.equal(JSON.stringify(c), before, "Preview/preparation must leave all source and saved metadata unchanged");
  }
});

test("preview allocates no identity, and repeated prepared exports use the retained identity", () => {
  const c = context();
  previewOfflineCalendar(c, calendar);
  assert.equal(c.calendarId, null);
  let allocations = 0;
  const first = prepareOfflineCalendar(c, calendar, () => { allocations++; return fixedId; });
  assert.equal(allocations, 1);
  assert.equal(c.calendarId, null);
  const retained = { ...c, calendarId: first.calendarId };
  const second = prepareOfflineCalendar(retained, calendar, () => { throw new Error("Must reuse identity"); });
  assert.equal(second.text, first.text);
  assert.equal(second.filename, first.filename);
});

test("moves and omissions retain occurrence UIDs within a week, while another week changes them", () => {
  const c = { ...context(), calendarId: fixedId };
  const initial = events(prepareOfflineCalendar(c, calendar).text);
  const moved = { ...c, state: setPickDay(c.state, "pick-0", "Sunday") };
  const movedEvents = events(prepareOfflineCalendar(moved, calendar).text);
  assert.deepEqual(movedEvents.map(event => event.UID).sort(), initial.map(event => event.UID).sort());
  const omitted = { ...moved, state: setPickDay(moved.state, "pick-0", null) };
  const omittedEvents = events(prepareOfflineCalendar(omitted, calendar).text);
  assert.equal(omittedEvents.some(event => event.UID.endsWith("-pick-0@tastetable.invalid")), false);
  const restored = { ...omitted, state: resetDays(omitted.state) };
  assert.equal(prepareOfflineCalendar(restored, calendar).text, prepareOfflineCalendar(c, calendar).text);
  const nextWeek = { ...c, anchor: "2026-10-14", state: setWeek(c.state, "2026-10-14") };
  const nextIds = events(prepareOfflineCalendar(nextWeek, calendar).text).map(event => event.UID);
  assert.ok(nextIds.every(id => !initial.some(event => event.UID === id)));
});

test("Save week and unchanged offline admission preserve the complete calendar after reopening", () => {
  const c = context();
  c.state = setPickDay(c.state, "pick-0", "Friday");
  c.state = setPickDay(c.state, "pick-1", null);
  const first = prepareOfflineCalendar(c, calendar, () => fixedId);
  const saved = saveOfflineWeek(catalogue, c.record, c.state, c.receivedAt, first.calendarId,
    new Date("2026-10-08T14:00:00.000Z"));
  const reopened = readOfflineWeek(saved.text, catalogue);
  assert.equal(reopened.calendarId, fixedId);
  assert.equal(reopened.receivedAt, c.receivedAt);
  const second = prepareOfflineCalendar({ ...reopened, anchor: reopened.state.weekStart }, calendar,
    () => { throw new Error("Saved calendar identity must not be replaced"); });
  assert.equal(second.text, first.text);
  assert.equal(second.filename, first.filename);
  const oldSaved = saveOfflineWeek(catalogue, c.record, c.state, c.receivedAt, null,
    new Date("2026-10-08T14:00:00.000Z"));
  const oldReopened = readOfflineWeek(oldSaved.text, catalogue);
  assert.equal(oldReopened.calendarId, null);
  assert.equal(prepareOfflineCalendar({ ...oldReopened, anchor: oldReopened.state.weekStart }, calendar,
    () => fixedId).calendarId, fixedId);
});

test("all-omitted weeks remain previewable but refuse download before allocating an identity", () => {
  const c = context();
  for (const { key } of c.state.picks) c.state = setPickDay(c.state, key, null);
  assert.equal(previewOfflineCalendar(c, calendar).items.length, 0);
  let allocations = 0;
  assert.throws(() => prepareOfflineCalendar(c, calendar, () => { allocations++; return fixedId; }),
    /No visits are scheduled/);
  assert.equal(allocations, 0);
  assert.equal(c.calendarId, null);
});

test("invalid or uncommitted displayed dates cannot export the last valid arrangement", () => {
  const c = context();
  for (const anchor of ["", "2026-02-30", "0000-01-01", "not-a-date", "2026-10-14"]) {
    assert.throws(() => prepareOfflineCalendar({ ...c, anchor }, calendar, () => {
      throw new Error("Invalid date must refuse before identity allocation");
    }), error => !error.message.includes("identity allocation"));
  }
  assertArrangement(prepareOfflineCalendar({ ...c, anchor: "2026-10-11" }, calendar, () => fixedId),
    { ...c, anchor: "2026-10-11" });
});

test("leap, DST and year-change dates use calendar dates and preserve exclusive all-day ends", () => {
  for (const anchor of ["2024-02-29", "2026-03-08", "2026-11-01", "2026-12-31"]) {
    const c = context(catalogue.records[0], anchor);
    c.state = setPickDay(c.state, "pick-0", "Sunday");
    assertArrangement(prepareOfflineCalendar(c, calendar, () => fixedId), c);
  }
  const last = { ...context(), anchor: "9999-12-31" };
  assert.throws(() => prepareOfflineCalendar(last, calendar, () => fixedId), /years 0001–9999|year 10000/);
});

test("unavailable or mismatched source state and malformed metadata refuse before preparation", () => {
  const good = context();
  const changedPlan = structuredClone(good.state);
  changedPlan.sourcePlan.meals[0].why = "A different source explanation";
  const changedConstraints = { ...good.state, constraints: good.state.constraints.length ? [] : ["wheelchair"] };
  const inputs = [
    null, { ...good, record: null }, { ...good, state: null },
    { ...good, record: { ...good.record, response: { ...good.record.response, mock: false } } },
    { ...good, state: { ...good.state, sourceMode: "unknown" } },
    { ...good, state: changedPlan }, { ...good, state: changedConstraints },
    { ...good, receivedAt: null }, { ...good, receivedAt: "2026-10-08" },
    { ...good, calendarId: "" }, { ...good, calendarId: "G".repeat(32) },
    { ...good, calendarId: undefined },
  ];
  for (const input of inputs) {
    let allocated = false;
    assert.throws(() => prepareOfflineCalendar(input, calendar, () => { allocated = true; return fixedId; }));
    assert.equal(allocated, false);
  }
  assert.throws(() => previewOfflineCalendar(good, undefined), /calendar writer is unavailable/);
  assert.throws(() => prepareOfflineCalendar(good, calendar, () => "invalid"), /calendar plan identifier/);
});

test("a new source can receive a new identity without relabeling a previously prepared file", () => {
  const a = context(catalogue.records.find(record => record.key === "rosa-7"));
  const b = context(catalogue.records.find(record => record.key === "mei-7"));
  const savedA = prepareOfflineCalendar(a, calendar, () => fixedId);
  const originalA = savedA.text;
  const savedB = prepareOfflineCalendar(b, calendar, () => "fedcba9876543210fedcba9876543210");
  assert.notEqual(savedB.calendarId, savedA.calendarId);
  assertArrangement(savedA, a);
  assertArrangement(savedB, b);
  assert.equal(savedA.text, originalA);
});
