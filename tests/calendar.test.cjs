"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createPlanExport } = require("../static/calendar.js");

const OPTIONS = { id: "0123456789abcdef0123456789abcdef", createdAt: new Date("2026-10-08T12:34:56.789Z") };
function response() {
  const meal = (day, id) => ({ day, kind: "restaurant", entity_id: id, name: "Venue " + id,
    why: "Qloo affinity 0.91; verify needs with the venue." });
  return {
    mock: true,
    plan: {
      meals: [meal("Monday", "FIX-MON"), meal("Wednesday", "FIX-WED"), meal("Friday", "FIX-FRI"), meal("Sunday", "FIX-SUN")],
      outing: { day: "Saturday", kind: "outing", entity_id: "FIX-SAT", name: "Fictional museum", why: "Qloo affinity 0.88; music taste signal." },
      notes: ["Confirm transport before deciding."],
      rejected: [{ name: "REJECTED_SENTINEL", entity_id: "REJECTED_ID" }],
    },
    llm_only: { meals: [{ name: "BASELINE_SENTINEL" }] },
    trace: [{ result_summary: "TRACE_SENTINEL" }],
  };
}

// A small independent reader: unfold physical lines, then read RFC property
// names and TEXT escapes. It does not use any writer helpers.
function readCalendar(contents) {
  assert.ok(contents.endsWith("\r\n"));
  assert.equal(contents.replace(/\r\n/g, "").includes("\n"), false);
  const lines = contents.replace(/\r\n[ \t]/g, "").split("\r\n").filter(Boolean);
  assert.equal(lines[0], "BEGIN:VCALENDAR");
  assert.equal(lines.at(-1), "END:VCALENDAR");
  const events = [];
  let current;
  for (const line of lines.slice(1, -1)) {
    if (line === "BEGIN:VEVENT") {
      assert.equal(current, undefined, "nested component");
      current = {};
    } else if (line === "END:VEVENT") {
      assert.ok(current, "event end without start");
      events.push(current);
      current = undefined;
    } else if (current) {
      const colon = line.indexOf(":");
      assert.ok(colon > 0);
      const key = line.slice(0, colon);
      assert.equal(current[key], undefined, "duplicate property " + key);
      current[key] = line.slice(colon + 1);
    }
  }
  assert.equal(current, undefined, "unclosed component");
  return events;
}
function unescapeText(value) {
  return value.replace(/\\([nN,;\\])/g, (_, c) => c === "n" || c === "N" ? "\n" : c);
}
const render = (value = response(), week = "2026-10-12") => createPlanExport(value, OPTIONS).download(week);

test("the native weekday layout becomes five dated all-day suggestions", () => {
  const file = render();
  const events = readCalendar(file.text);
  assert.equal(file.filename, "tastetable-demo-2026-10-12.ics");
  assert.equal(file.count, 5);
  assert.deepEqual(events.map((e) => [e["DTSTART;VALUE=DATE"], e["DTEND;VALUE=DATE"]]), [
    ["20261012", "20261013"], ["20261014", "20261015"], ["20261016", "20261017"],
    ["20261017", "20261018"], ["20261018", "20261019"],
  ]);
  for (const event of events) {
    assert.equal(event.DTSTAMP, "20261008T123456Z");
    assert.equal(event.STATUS, "TENTATIVE");
    assert.equal(event.TRANSP, "TRANSPARENT");
    assert.equal(event.CLASS, "PRIVATE");
    assert.ok(event.SUMMARY.startsWith("[DEMO] TasteTable suggestion:"));
    assert.match(unescapeText(event.DESCRIPTION), /synthetic Qloo fixture; these venues are fictional/);
    assert.match(unescapeText(event.DESCRIPTION), /no booking or opening hours confirmed/);
    assert.match(unescapeText(event.DESCRIPTION), /Not medical or dietary advice/);
  }
  assert.equal(new Set(events.map((event) => event.UID)).size, 5);
  assert.doesNotMatch(file.text, /(?:LOCATION|ATTENDEE|ORGANIZER|METHOD|RRULE|TRIGGER):|BEGIN:VALARM/);
});

test("each description preserves the selected source and notes, excluding other columns", () => {
  const result = response();
  const events = readCalendar(render(result).text);
  const selected = [...result.plan.meals, result.plan.outing];
  for (const event of events) {
    const description = unescapeText(event.DESCRIPTION);
    const item = selected.find((pick) => description.includes("Qloo entity ID: " + pick.entity_id));
    assert.ok(item);
    assert.ok(description.includes("Why this suggestion: " + item.why));
    assert.ok(description.includes("Plan note: " + result.plan.notes[0]));
  }
  assert.doesNotMatch(render(result).text, /REJECTED_SENTINEL|REJECTED_ID|BASELINE_SENTINEL|TRACE_SENTINEL/);
});

test("partial plans keep missing slots absent and retain the partial-plan note", () => {
  const result = response();
  result.plan.meals = result.plan.meals.slice(0, 1);
  result.plan.outing = null;
  result.plan.notes = ["Only 1 restaurant passed; remaining days left open."];
  const file = render(result);
  const [event] = readCalendar(file.text);
  assert.equal(file.count, 1);
  assert.equal(event["DTSTART;VALUE=DATE"], "20261012");
  assert.match(unescapeText(event.DESCRIPTION), /remaining days left open/);
});

test("an empty checked plan is a readable preview but never a calendar download", () => {
  const result = response();
  result.plan.meals = [];
  result.plan.outing = null;
  const session = createPlanExport(result, OPTIONS);
  assert.equal(session.count, 0);
  assert.deepEqual(session.preview("2026-10-12"), []);
  assert.throws(() => session.download("2026-10-12"), /no checked suggestions/);
});

test("mock provenance comes from the actual response, and live suggestions remain tentative", () => {
  const result = response();
  result.mock = false;
  const file = render(result);
  assert.equal(file.filename, "tastetable-2026-10-12.ics");
  assert.doesNotMatch(file.text, /DEMO|fictional Qloo|synthetic Qloo fixture/);
  for (const event of readCalendar(file.text)) {
    assert.equal(event.STATUS, "TENTATIVE");
    assert.match(unescapeText(event.DESCRIPTION), /aggregate affinity is not a claim about any individual/);
  }
});

test("dates require an explicit valid Monday and reject normalization or injected syntax", () => {
  const session = createPlanExport(response(), OPTIONS);
  for (const week of [undefined, null, "", "2026-10-13", "2026-10-11", "2026-02-30", "2026-13-01",
    "2026-00-01", "0000-01-03", "2026-1-12", "2026-10-12T00:00:00Z", "2026-10-12\r\nBEGIN:VEVENT",
    "9999-12-27"]) {
    assert.throws(() => session.download(week), undefined, String(week));
  }
  assert.equal(session.preview("0001-01-01")[0].date, "0001-01-01");
});

test("leap days, year changes, and DST weeks retain calendar dates", () => {
  const cases = [
    ["2024-02-26", ["20240226", "20240228", "20240301", "20240302", "20240303"], "20240304"],
    ["2024-12-30", ["20241230", "20250101", "20250103", "20250104", "20250105"], "20250106"],
    ["2026-03-02", ["20260302", "20260304", "20260306", "20260307", "20260308"], "20260309"],
    ["2026-10-26", ["20261026", "20261028", "20261030", "20261031", "20261101"], "20261102"],
  ];
  for (const [monday, dates, end] of cases) {
    const events = readCalendar(render(response(), monday).text);
    assert.deepEqual(events.map((event) => event["DTSTART;VALUE=DATE"]), dates);
    assert.equal(events.at(-1)["DTEND;VALUE=DATE"], end);
  }
});

test("calendar bytes do not depend on the host timezone", () => {
  const source = `const c=require(${JSON.stringify(require.resolve("../static/calendar.js"))}); process.stdout.write(c.createPlanExport(${JSON.stringify(response())},{id:${JSON.stringify(OPTIONS.id)},createdAt:new Date("2026-10-08T12:34:56.789Z")}).download("2026-03-02").text);`;
  const outputs = ["UTC", "America/Los_Angeles", "Pacific/Kiritimati"].map((TZ) =>
    execFileSync(process.execPath, ["-e", source], { env: { ...process.env, TZ }, encoding: "utf8" }));
  assert.equal(outputs[0], outputs[1]);
  assert.equal(outputs[0], outputs[2]);
});

test("source text cannot inject events or calendar properties", () => {
  const result = response();
  const name = "Cafe, back\\slash; :quoted \"☕\"\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:injected";
  const why = "Menu\\notes, gentle; literal \\n and a real\nnew line.";
  result.plan.meals[0].name = name;
  result.plan.meals[0].why = why;
  result.plan.meals[0].entity_id = "id,with;delimiters\\and\nnewlines";
  const events = readCalendar(render(result).text);
  assert.equal(events.length, 5);
  assert.equal(unescapeText(events[0].SUMMARY), "[DEMO] TasteTable suggestion: " + name.replace(/\r\n/g, "\n"));
  const description = unescapeText(events[0].DESCRIPTION);
  assert.ok(description.includes("Why this suggestion: " + why));
  assert.ok(description.includes("Qloo entity ID: " + result.plan.meals[0].entity_id));
});

test("UTF-8 folding keeps every physical line at most 75 bytes and every code point intact", () => {
  const result = response();
  const name = "食事🍜é".repeat(80);
  result.plan.meals[0].name = name;
  result.plan.meals[0].why = "前置き " + "🧑🏽‍🦽,音楽;訪問\\".repeat(90);
  const file = render(result);
  for (const line of file.text.split("\r\n")) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75, "physical content line too long");
    assert.equal(Buffer.from(line, "utf8").toString("utf8"), line);
  }
  const first = readCalendar(file.text)[0];
  assert.equal(unescapeText(first.SUMMARY), "[DEMO] TasteTable suggestion: " + name);
  assert.ok(unescapeText(first.DESCRIPTION).includes(result.plan.meals[0].why));
});

test("a displayed plan is immutable and same-week re-exports are byte-stable", () => {
  const result = response();
  const session = createPlanExport(result, OPTIONS);
  const before = session.download("2026-10-12");
  result.plan.meals[0].name = "changed response object";
  result.plan.notes.push("changed note");
  session.preview("2026-10-12")[0].name = "changed preview object";
  assert.deepEqual(session.download("2026-10-12"), before);
  const nextWeek = readCalendar(session.download("2026-10-19").text);
  const original = readCalendar(before.text);
  assert.ok(nextWeek.every((event) => !original.some((old) => old.UID === event.UID)));
  const nextPlan = createPlanExport(response(), { ...OPTIONS, id: "f".repeat(32) });
  assert.notEqual(readCalendar(nextPlan.download("2026-10-12").text)[0].UID, original[0].UID);
});

test("malformed result envelopes and missing provenance refuse the whole export", () => {
  const mutations = [
    (r) => { delete r.mock; },
    (r) => { r.mock = "false"; },
    (r) => { r.plan.meals = null; },
    (r) => { r.plan.notes = "note"; },
    (r) => { delete r.plan.outing; },
    (r) => { r.plan.meals[0].entity_id = ""; },
    (r) => { r.plan.meals[0].name = {}; },
    (r) => { r.plan.meals[0].why = null; },
    (r) => { r.plan.meals[0].day = "monday"; },
    (r) => { r.plan.meals[0].kind = "unverified"; },
    (r) => { r.plan.meals.push(structuredClone(r.plan.meals[0])); },
    (r) => { r.plan.outing.kind = "restaurant"; },
    (r) => { r.plan.notes = Array(33).fill("note"); },
    (r) => { r.plan.meals = Array(8).fill(r.plan.meals[0]); },
  ];
  for (const change of mutations) {
    const result = response();
    change(result);
    assert.throws(() => createPlanExport(result, OPTIONS));
  }
  assert.throws(() => createPlanExport(null, OPTIONS));
});

test("unsupported text, excessive fields, and metadata injection refuse before output", () => {
  for (const bad of ["null\u0000byte", "bad\u000bcontrol", "unpaired\ud800", "unpaired\udfff", "x".repeat(1001)]) {
    const result = response();
    result.plan.meals[0].name = bad;
    assert.throws(() => createPlanExport(result, OPTIONS));
  }
  for (const options of [{ ...OPTIONS, id: "\r\nATTENDEE:bad" }, { ...OPTIONS, createdAt: new Date(NaN) },
    { ...OPTIONS, createdAt: "2026-10-08T12:34:56Z" }]) {
    assert.throws(() => createPlanExport(response(), options));
  }
});
