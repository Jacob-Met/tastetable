import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createWeekPlan, setPickDay } from "../static/week_plan.mjs";
import { makeWeekFile, readWeekFile } from "../static/week_file.mjs";
import { renderSavedWeekReport } from "../static/week_report.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/saved-week-response.json", import.meta.url), "utf8"));
const inputs = {
  cuisines: ["Cuban", "Mexican"], music: ["Celia Cruz"], films: ["West Side Story"],
  city: "Pasadena", constraints: ["soft_foods", "low_sodium", "wheelchair"],
};
function saved(response = structuredClone(fixture), arrange = (state) => state, profile = inputs) {
  const state = arrange(createWeekPlan(response, "2026-12-31"));
  return makeWeekFile({
    response, inputs: profile, state, receivedAt: "2026-10-08T10:00:00.000Z",
    calendarId: "e9a27c3786b649e483a42cc1a0096fb0",
  }, new Date("2026-10-08T10:05:00.000Z")).text;
}

test("edited arrangement uses the saved seven dates and retains each original occurrence", () => {
  const source = saved(undefined, (state) => setPickDay(setPickDay(setPickDay(state,
    "pick-0", "Saturday"), "pick-1", "Saturday"), "pick-2", null));
  const before = JSON.parse(source);
  const report = renderSavedWeekReport(source);
  assert.equal(report.weekStart, "2026-12-28");
  assert.equal(report.picks, 5);
  assert.equal(report.scheduled, 4);
  assert.equal(report.omitted, 1);
  for (const date of ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]) {
    assert(report.html.includes(date));
  }
  assert.equal((report.html.match(/data-occurrence="/g) || []).length, 5);
  const saturday = report.html.slice(report.html.indexOf("<h3>Saturday"), report.html.indexOf("<h3>Sunday"));
  assert(saturday.includes('data-occurrence="pick-0"') && saturday.includes('data-occurrence="pick-1"'));
  const omitted = report.html.slice(report.html.indexOf('<section class="omitted"'));
  assert(omitted.includes('data-occurrence="pick-2"'));
  assert.deepEqual(JSON.parse(source), before);
  assert.deepEqual(readWeekFile(source).response, fixture);
});

test("repeated venues remain distinct scheduled and omitted occurrences", () => {
  const response = structuredClone(fixture);
  response.plan.meals[1].entity_id = response.plan.meals[0].entity_id;
  response.plan.meals[1].name = response.plan.meals[0].name;
  const report = renderSavedWeekReport(saved(response, (state) =>
    setPickDay(setPickDay(state, "pick-0", "Tuesday"), "pick-1", null)));
  assert.equal((report.html.match(/data-occurrence="/g) || []).length, 5);
  assert(report.html.slice(report.html.indexOf("<h3>Tuesday"), report.html.indexOf("<h3>Wednesday")).includes('data-occurrence="pick-0"'));
  assert(report.html.slice(report.html.indexOf('<section class="omitted"')).includes('data-occurrence="pick-1"'));
  assert.equal(report.scheduled, 4);
});

test("all-omitted and empty files remain readable without inventing a scheduled visit", () => {
  const allOff = renderSavedWeekReport(saved(undefined, (state) => {
    for (const { key } of state.picks) state = setPickDay(state, key, null);
    return state;
  }));
  assert.equal(allOff.scheduled, 0);
  assert.equal(allOff.omitted, 5);
  assert.equal((allOff.html.match(/No visit scheduled\./g) || []).length, 7);
  const response = structuredClone(fixture);
  response.plan.meals = [];
  response.plan.outing = null;
  response.plan.notes = ["No matching venues for this original request."];
  const empty = renderSavedWeekReport(saved(response));
  assert.equal(empty.picks, 0);
  assert.equal((empty.html.match(/No visit scheduled\./g) || []).length, 7);
  assert(empty.html.includes(response.plan.notes[0]));
});

test("mock, live and unknown labels describe saved source rather than fresh verification", () => {
  for (const [mock, mode, label] of [[true, "mock", "Saved fictional demo"], [false, "live", "Saved live-source label"], [undefined, "unknown", "Saved source unknown"]]) {
    const response = structuredClone(fixture);
    if (mock === undefined) delete response.mock;
    else response.mock = mock;
    const report = renderSavedWeekReport(saved(response));
    assert.equal(report.sourceMode, mode);
    assert(report.html.includes(label));
    assert(report.html.includes("original checks have not been rerun"));
    assert(report.html.includes("not reservations or verified availability"));
    assert(report.html.includes("not stored in the saved-week v1 file"));
  }
});

test("source timestamps, constraint text, zero affinity and incomplete notes are preserved", () => {
  const response = structuredClone(fixture);
  response.plan.meals[0].affinity = 0;
  response.plan.meals[1].affinity = null;
  response.plan.notes = ["Only two suitable candidates were found.\nAsk the venue."];
  const report = renderSavedWeekReport(saved(response));
  assert(report.html.includes("2026-10-08T10:00:00.000Z"));
  assert(report.html.includes("2026-10-08T10:05:00.000Z"));
  for (const constraint of inputs.constraints) assert(report.html.includes(constraint));
  assert(report.html.includes("<dt>Original affinity</dt><dd>0</dd>"));
  assert(report.html.includes("<dt>Original affinity</dt><dd>Not recorded</dd>"));
  assert(report.html.includes(response.plan.notes[0]));
  for (const candidate of response.plan.rejected) {
    for (const check of candidate.failed) {
      assert(report.html.includes(check.constraint) && report.html.includes(check.status));
    }
  }
});

test("all file-controlled text stays literal, including markup, quotes, Unicode and newlines", () => {
  const payload = '<script>alert("x")</script><img src=x onerror="oops"> & \' café 老朋友\nnext line';
  const response = structuredClone(fixture);
  for (const pick of [...response.plan.meals, response.plan.outing]) {
    pick.name = payload;
    pick.why = payload;
    pick.entity_id = payload;
  }
  response.plan.notes = [payload];
  response.plan.rejected = [{ name: payload, failed: [{ constraint: payload, status: payload, reason: payload }] }];
  const profile = { ...inputs, cuisines: [payload], films: [payload], music: [payload], city: payload };
  const report = renderSavedWeekReport(saved(response, undefined, profile), { sourceName: payload });
  assert(!report.html.includes("<script") && !report.html.includes("<img"));
  assert(report.html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"));
  assert(report.html.includes("&amp; &#39; café 老朋友\nnext line"));
  assert(!/<[^>]*\s(?:src|href|onerror|onclick)=/i.test(report.html));
  assert(report.html.includes('default-src &#39;none&#39;'));
});

test("the canonical codec rejects malformed files and changed source/arrangement agreement", () => {
  const original = saved();
  const cases = ["not json", "null"];
  for (const change of [
    (value) => { value.format = "tastetable.saved-week.v2"; },
    (value) => { value.week.assignments["pick-0"] = "Someday"; },
    (value) => { value.inputs.constraints = []; },
    (value) => { delete value.week.assignments["pick-0"]; },
  ]) {
    const value = JSON.parse(original);
    change(value);
    cases.push(JSON.stringify(value));
  }
  for (const source of cases) {
    assert.throws(() => readWeekFile(source));
    assert.throws(() => renderSavedWeekReport(source));
  }
  assert.equal(saved(), original);
});

test("the same saved bytes yield a deterministic report with a literal source filename", () => {
  const source = saved();
  const options = { sourceName: 'week "A".json', sourceSha256: "a".repeat(64) };
  const first = renderSavedWeekReport(source, options);
  assert.deepEqual(renderSavedWeekReport(source, options), first);
  assert(first.html.includes("week &quot;A&quot;.json"));
  assert(first.html.includes("a".repeat(64)));
  assert.throws(() => renderSavedWeekReport(source, { sourceSha256: "<script>" }));
  assert.equal(renderSavedWeekReport("\uFEFF" + source).weekStart, first.weekStart);
});

test("carriage returns and valid surrogate pairs retain their literal report text", () => {
  const response = structuredClone(fixture);
  response.plan.meals[0].name = "first\rsecond\r\nthird 😀";
  const report = renderSavedWeekReport(saved(response));
  assert(report.html.includes("first&#13;second&#13;\nthird 😀"));
});

test("displayed NUL and unpaired surrogates admitted by the codec refuse HTML export", () => {
  for (const invalid of ["x\u0000y", "x\uD800y", "x\uDC00y", "\uD800", "\uDC00", "\uD800\uD800"]) {
    for (const field of ["name", "why", "city"]) {
      const response = structuredClone(fixture);
      const profile = structuredClone(inputs);
      if (field === "city") profile.city = invalid;
      else response.plan.meals[0][field] = invalid;
      const text = saved(response, undefined, profile);
      const admitted = readWeekFile(text);
      assert.equal(field === "city" ? admitted.inputs.city : admitted.response.plan.meals[0][field], invalid);
      assert.throws(() => renderSavedWeekReport(text), /NUL|unpaired UTF-16 surrogate/);
    }
  }
});
