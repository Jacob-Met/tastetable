"use strict";
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
const crypto = require("node:crypto");
const { createWeekExport } = require("./reference/calendar.js");

function events(file) {
  const values = [];
  let current;
  for (const line of file.text.replace(/\r\n[ \t]/g, "").split("\r\n")) {
    if (line === "BEGIN:VEVENT") { assert.equal(current, undefined); current = {}; }
    else if (line === "END:VEVENT") { assert.ok(current); values.push(current); current = undefined; }
    else if (current) {
      const colon = line.indexOf(":");
      const key = line.slice(0, colon);
      assert.ok(colon > 0);
      assert.equal(current[key], undefined);
      current[key] = line.slice(colon + 1);
    }
  }
  assert.equal(current, undefined);
  return values;
}
const unescapeText = (value) => value.replace(/\\([nN,;\\])/g, (_, c) => /[nN]/.test(c) ? "\n" : c);

(async () => {
  const week = await import(pathToFileURL(path.join(__dirname, "reference/week_plan.mjs")));
  const bundle = JSON.parse(fs.readFileSync("evidence/fixture-bundle.json", "utf8"));
  assert.equal(bundle.passed, true);
  const observations = [];
  let index = 0;
  for (const [name, result] of Object.entries(bundle.results)) {
    const state = week.createWeekPlan(result, "2026-10-12");
    const session = createWeekExport(state, {
      id: String(++index).padStart(32, "0"), createdAt: new Date("2026-10-08T12:00:00Z"),
    });
    const rows = week.weekRows(state);
    const checked = [...result.plan.meals, ...(result.plan.outing ? [result.plan.outing] : [])];
    assert.equal(session.totalCount, checked.length);
    assert.equal(session.preview(state, rows).length, checked.length);
    if (!checked.length) {
      assert.throws(() => session.download(state, rows), /no checked suggestions/);
      observations.push({ name, count: 0, download: "refused", passed: true });
      continue;
    }
    const file = session.download(state, rows);
    const parsed = events(file);
    assert.equal(parsed.length, checked.length);
    for (const original of state.picks) {
      const event = parsed.find((item) => item.UID.includes("-" + original.key + "@"));
      assert.ok(event);
      const description = unescapeText(event.DESCRIPTION);
      assert.ok(description.includes("Qloo entity ID: " + original.pick.entity_id));
      assert.ok(description.includes("Why this suggestion: " + original.pick.why));
      for (const note of result.plan.notes) assert.ok(description.includes("Plan note: " + note));
      assert.match(event.SUMMARY, /^\[DEMO\]/);
      assert.equal(event.STATUS, "TENTATIVE");
    }
    assert.ok(!file.text.includes("fresh-main synthetic refusal:"));
    fs.writeFileSync("evidence/" + name + ".ics", file.text);
    observations.push({ name, count: file.count, starts: parsed.map((item) => item["DTSTART;VALUE=DATE"]), passed: true });
    if (name === "rosa") {
      let arranged = week.setPickDay(state, "pick-0", "Wednesday");
      arranged = week.setPickDay(arranged, "pick-4", null);
      const movedFile = session.download(arranged, week.weekRows(arranged));
      const moved = events(movedFile);
      assert.equal(moved.length, 4);
      assert.equal(moved.filter((item) => item["DTSTART;VALUE=DATE"] === "20261014").length, 2);
      assert.equal(new Set(moved.map((item) => item.UID)).size, 4);
      assert.ok(moved.every((item) => parsed.some((old) => old.UID === item.UID)));
      fs.writeFileSync("evidence/rosa-arranged.ics", movedFile.text);
      observations.push({ name: "rosa_arranged", count: 4, two_restaurants_on_wednesday: true,
        outing_omitted: true, weekly_ids_retained: true, passed: true });
    }
  }
  const report = { source: bundle.source, fixture_sha256: crypto.createHash("sha256").update(fs.readFileSync("evidence/fixture-bundle.json")).digest("hex"),
    calendar_sha256: crypto.createHash("sha256").update(fs.readFileSync("reference/calendar.js")).digest("hex"),
    planner_sha256: crypto.createHash("sha256").update(fs.readFileSync("reference/week_plan.mjs")).digest("hex"),
    cases: observations, passed: true };
  fs.writeFileSync("evidence/calendar-receiving.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
