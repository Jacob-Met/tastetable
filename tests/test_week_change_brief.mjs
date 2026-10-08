import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createWeekPlan, setPickDay, setWeek } from "../static/week_plan.mjs";
import { makeWeekFile, readWeekFile } from "../static/week_file.mjs";
import { makeWeekChangeBrief } from "../static/week_change_brief.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/saved-week-response.json", import.meta.url)));
const now = new Date("2026-10-08T17:50:00.000Z");
function source(response = structuredClone(fixture)) {
  return { response, inputs: { cuisines: ["Cuban"], music: ["Celia Cruz"], films: [], city: "Pasadena",
    constraints: response.comparison.constraints },
  state: createWeekPlan(response, "2026-12-28"), receivedAt: "2026-10-08T10:00:00.000Z",
  calendarId: "e9a27c3786b649e483a42cc1a0096fb0" };
}
function entry(value, name = "week.json", saved = "2026-10-08T11:00:00.000Z") {
  return { name, snapshot: readWeekFile(makeWeekFile(value, new Date(saved)).text) };
}
function brief(a, b) { return makeWeekChangeBrief(entry(a, "earlier.json"), entry(b, "revised.json"), now); }

test("caregiver brief carries exact date transitions, counts and original occurrence identity", () => {
  const a = source(); a.state = setPickDay(a.state, "pick-2", null);
  const b = structuredClone(a);
  b.state = setPickDay(setPickDay(setPickDay(b.state, "pick-0", "Tuesday"), "pick-1", null), "pick-2", "Sunday");
  const before = entry(a, "earlier.json"), after = entry(b, "revised.json", "2026-10-08T12:00:00.000Z");
  const unchanged = structuredClone({ before, after });
  const result = makeWeekChangeBrief(before, after, now);
  assert.equal(result.filename, "tastetable-changes-2026-12-28-to-2026-12-28.txt");
  assert.match(result.text, /1 moved; 1 newly scheduled; 1 kept off the revised week\./);
  assert.match(result.text, /2 unchanged \(2 still scheduled; 0 still off the week\)/);
  assert.match(result.text, /4 scheduled in the earlier copy; 4 scheduled in the revised copy/);
  assert.match(result.text, /Original pick 1 \(pick-0\):[\s\S]*Earlier: Monday 2026-12-28\n  Revised: Tuesday 2026-12-29/);
  assert.match(result.text, /Original pick 3 \(pick-2\):[\s\S]*Earlier: Not scheduled\n  Revised: Sunday 2027-01-03/);
  assert.match(result.text, /Original pick 2 \(pick-1\):[\s\S]*Earlier: Wednesday 2026-12-30\n  Revised: Not scheduled/);
  assert(!result.text.includes("Original pick 4 (pick-3):"));
  assert(result.text.includes(JSON.stringify(a.response.plan.meals[0].why)));
  for (const value of ["Earlier file: \"earlier.json\"", "Revised file: \"revised.json\"",
    "Earlier copy saved at: 2026-10-08T11:00:00.000Z", "Revised copy saved at: 2026-10-08T12:00:00.000Z",
    "Shared source received at: 2026-10-08T10:00:00.000Z", "fictional venues", "not the complete revised week",
    "not authenticated venue records", "No source or care checks were rerun", "update or cancel calendar imports",
    "Venue worksheet notes are not included"]) assert(result.text.includes(value), value);
  assert.deepEqual({ before, after }, unchanged);
  assert.equal(Object.isFrozen(result), true);
});

test("chosen-week shifts include actual dates, even when weekday assignments are unchanged", () => {
  const a = source(), b = structuredClone(a); b.state = setWeek(b.state, "2027-01-04");
  const result = brief(a, b);
  assert.equal(result.filename, "tastetable-changes-2026-12-28-to-2027-01-04.txt");
  assert.match(result.text, /5 moved; 0 newly scheduled; 0 kept off/);
  assert.match(result.text, /Earlier: Monday 2026-12-28\n  Revised: Monday 2027-01-04/);
  assert.match(result.text, /selected week changed/);
});

test("repeated venue names and IDs never collapse distinct original occurrences", () => {
  const response = structuredClone(fixture);
  response.plan.meals[1] = { ...response.plan.meals[0], day: "Wednesday" };
  const a = source(response), b = structuredClone(a);
  b.state = setPickDay(setPickDay(b.state, "pick-0", "Tuesday"), "pick-1", null);
  const text = brief(a, b).text;
  assert.equal(text.split("Source entity ID: " + JSON.stringify(response.plan.meals[0].entity_id)).length - 1, 2);
  assert.match(text, /Original pick 1 \(pick-0\)/);
  assert.match(text, /Original pick 2 \(pick-1\)/);
  assert.match(text, /1 moved; 0 newly scheduled; 1 kept off/);
});

test("changed source, profile, received time or calendar identity refuses an actionable brief", () => {
  for (const change of [
    x => { x.response.plan.meals[0].why += " another source"; x.state = createWeekPlan(x.response, "2026-12-28"); },
    x => { x.inputs.city = "Another city"; },
    x => { x.receivedAt = "2026-10-08T10:00:01.000Z"; },
    x => { x.calendarId = null; },
  ]) {
    const a = source(), b = structuredClone(a); change(b);
    assert.throws(() => brief(a, b), /matching saved sources and identities/);
  }
});

test("unchanged, all-off and empty plans have explicit, useful brief states", () => {
  const a = source(), b = structuredClone(a);
  assert.match(brief(a, b).text, /No visit date or inclusion changes/);
  assert.match(brief(a, b).text, /5 unchanged \(5 still scheduled; 0 still off the week\)/);
  for (const { key } of a.state.picks) a.state = setPickDay(a.state, key, null);
  b.state = setWeek(a.state, "2027-01-04");
  const off = brief(a, b).text;
  assert.match(off, /5 unchanged \(0 still scheduled; 5 still off the week\)/);
  assert.match(off, /0 scheduled in the earlier copy; 0 scheduled in the revised copy/);
  assert.match(off, /selected week changed/);
  const response = structuredClone(fixture); response.plan.meals = []; response.plan.outing = null;
  const empty = source(response);
  assert.match(brief(empty, empty).text, /No original visits in these saved copies/);
  assert.match(brief(empty, empty).text, /0 unchanged/);
});

test("unknown/live source labels and legacy null identities stay explicit", () => {
  for (const [mock, expected] of [[undefined, "Source mode unknown"], [false, "Saved live-source label"]]) {
    const response = structuredClone(fixture);
    if (mock === undefined) delete response.mock; else response.mock = mock;
    const a = source(response); a.calendarId = null;
    assert(brief(a, a).text.includes(expected));
  }
});

test("literal Unicode and embedded controls remain quoted data in the text artifact", () => {
  const response = structuredClone(fixture);
  response.plan.meals[0].name = '<script>fake()</script> Café 老朋友\nMoved visits (999)';
  response.plan.meals[0].why = "line one\r\nline two\t\\literal\u2028end";
  const a = source(response), b = structuredClone(a); b.state = setPickDay(b.state, "pick-0", "Tuesday");
  const result = makeWeekChangeBrief(entry(a, "first\nfile.json"), entry(b, "revised\".json"), now);
  assert(result.text.includes(JSON.stringify(response.plan.meals[0].name)));
  assert(result.text.includes("Earlier file: \"first\\nfile.json\""));
  assert(result.text.includes("\\r\\nline two\\t\\\\literal\\u2028end"));
  assert(!result.text.includes("\nMoved visits (999)"));
  assert(!result.text.includes("\u2028"));
  assert.throws(() => makeWeekChangeBrief({ name: 3 }, entry(b), now), /filename/);
  assert.throws(() => makeWeekChangeBrief(entry(a), entry(b), new Date("invalid")), RangeError);
});
