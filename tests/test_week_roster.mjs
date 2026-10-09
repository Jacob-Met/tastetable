import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createWeekPlan, setPickDay } from "../static/week_plan.mjs";
import { makeWeekFile, readWeekFile } from "../static/week_file.mjs";
import { renderSavedWeekRoster } from "../static/week_roster.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/saved-week-response.json", import.meta.url), "utf8"));
function source({ response = structuredClone(fixture), anchor = "2026-12-31", arrange = (state) => state,
  sourceName = "saved-week.json", sourceSha256 = "a".repeat(64), inputs } = {}) {
  inputs ??= { city: "Pasadena", cuisines: ["Cuban"], music: [], films: [], constraints: [...response.comparison.constraints] };
  return { sourceName, sourceSha256, text: makeWeekFile({ response, inputs,
    state: arrange(createWeekPlan(response, anchor)), receivedAt: "2026-10-08T10:00:00.000Z", calendarId: null,
  }, new Date("2026-10-08T10:05:00.000Z")).text };
}
const count = (html, token) => html.split(token).length - 1;

test("same-week roster retains ordered sources and each scheduled or omitted occurrence exactly once", () => {
  const a = source({ arrange: (state) => setPickDay(setPickDay(state, "pick-0", "Saturday"), "pick-1", null) });
  const response = structuredClone(fixture);
  response.comparison.constraints = ["source-two-only"];
  response.plan.meals[1] = { ...response.plan.meals[0], day: "Wednesday" };
  const b = source({ response, sourceSha256: "b".repeat(64), arrange: (state) => setPickDay(state, "pick-0", null) });
  const before = structuredClone([a, b]);
  const roster = renderSavedWeekRoster([a, b]);
  assert.deepEqual([roster.weekStart, roster.picks, roster.scheduled, roster.omitted], ["2026-12-28", 10, 8, 2]);
  assert.deepEqual(roster.sources.map((s) => [s.ordinal, s.sourceName, s.omitted]), [[1, "saved-week.json", 1], [2, "saved-week.json", 1]]);
  assert.equal(count(roster.html, 'data-occurrence="'), 10);
  for (const s of [1, 2]) for (let p = 0; p < 5; p++) assert.equal(count(roster.html, `data-source="${s}" data-occurrence="pick-${p}"`), 1);
  const saturday = roster.html.split('data-date="2027-01-02"')[1].split('data-date="2027-01-03"')[0];
  assert(saturday.includes('data-source="1" data-occurrence="pick-0"'));
  assert(saturday.indexOf('data-source="1"') < saturday.indexOf('data-source="2"'));
  const off = roster.html.split('<section class="omitted"')[1].split('aria-labelledby="sources-heading"')[0];
  assert(off.includes('data-source="1" data-occurrence="pick-1"'));
  assert(off.includes('data-source="2" data-occurrence="pick-0"'));
  const sourceOne = roster.html.split('data-source-summary="1"')[1].split('data-source-summary="2"')[0];
  assert(sourceOne.includes("low_sodium") && !sourceOne.includes("source-two-only"));
  const sourceTwo = roster.html.split('data-source-summary="2"')[1];
  assert(sourceTwo.includes("source-two-only"));
  assert.deepEqual([a, b], before);
});

test("repeated identical files remain deliberate separate inputs without person inference", () => {
  const a = source();
  const roster = renderSavedWeekRoster([a, a, a]);
  assert.equal(roster.picks, 15);
  assert.deepEqual(roster.sources.map((s) => s.ordinal), [1, 2, 3]);
  assert.equal(count(roster.html, 'data-occurrence="'), 15);
  assert(roster.html.includes("Filenames are labels, not person identifiers"));
  assert.deepEqual(renderSavedWeekRoster([a, a, a]), roster);
});

test("all seven dates survive empty and wholly omitted sources across a year boundary", () => {
  const empty = structuredClone(fixture); empty.plan.meals = []; empty.plan.outing = null;
  const off = source({ arrange: (state) => state.picks.reduce((s, p) => setPickDay(s, p.key, null), state) });
  const roster = renderSavedWeekRoster([source({ response: empty }), off]);
  assert.deepEqual([roster.scheduled, roster.omitted], [0, 5]);
  assert.equal(count(roster.html, "No visit scheduled from these sources."), 7);
  for (const date of ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]) assert(roster.html.includes(`data-date="${date}"`));
});

test("week mismatch is refused rather than shifted, including an empty source", () => {
  const a = source();
  const response = structuredClone(fixture); response.plan.meals = []; response.plan.outing = null;
  const b = source({ response, anchor: "2027-01-04" });
  assert.throws(() => renderSavedWeekRoster([a, b]), /Source 2.*2027-01-04.*2026-12-28/);
  assert.equal(readWeekFile(b.text).state.weekStart, "2027-01-04");
});

test("source mode, timestamps, digest, zero affinity, notes and rejection reasons remain per source", () => {
  const sources = [true, false, undefined].map((mock) => {
    const response = structuredClone(fixture);
    if (mock === undefined) delete response.mock; else response.mock = mock;
    response.plan.meals[0].affinity = 0;
    response.plan.meals[1].affinity = null;
    response.plan.notes = ["Original incomplete plan.\nAsk this source's venue."];
    return source({ response });
  });
  const roster = renderSavedWeekRoster(sources);
  assert.deepEqual(roster.sources.map((s) => s.sourceMode), ["mock", "live", "unknown"]);
  for (const label of ["Saved fictional demo", "Saved live-source label", "Saved source unknown", "Original incomplete plan.", "<dt>Original affinity</dt><dd>0</dd>", "<dt>Original affinity</dt><dd>Not recorded</dd>"]) assert(roster.html.includes(label));
  for (const s of roster.sources) {
    assert.equal(s.receivedAt, "2026-10-08T10:00:00.000Z");
    assert.equal(s.savedAt, "2026-10-08T10:05:00.000Z");
    assert.equal(s.sourceSha256, "a".repeat(64));
  }
  for (const candidate of fixture.plan.rejected) for (const check of candidate.failed) assert(roster.html.includes(check.reason.replaceAll("'", "&#39;")));
});

test("all displayed source text is literal, including CR, Unicode and markup", () => {
  const payload = '<script>bad()</script><img src="https://example.invalid/x"> & \' café 老朋友 😀\rsecond\r\nthird';
  const response = structuredClone(fixture);
  for (const pick of [...response.plan.meals, response.plan.outing]) Object.assign(pick, { name: payload, why: payload, entity_id: payload });
  response.plan.notes = [payload];
  response.plan.rejected = [{ name: payload, failed: [{ constraint: payload, status: payload, reason: payload }] }];
  response.comparison.constraints = [payload];
  const inputs = { city: payload, cuisines: [payload], music: [payload], films: [payload], constraints: [payload] };
  const roster = renderSavedWeekRoster([source({ response, inputs, sourceName: payload })]);
  assert(!roster.html.includes("<script") && !roster.html.includes("<img"));
  assert(!/<[^>]*\s(?:src|href|onerror|onclick)=/i.test(roster.html));
  assert(roster.html.includes("&lt;script&gt;bad()&lt;/script&gt;"));
  assert(roster.html.includes("😀&#13;second&#13;\nthird"));
  assert(roster.html.includes("default-src &#39;none&#39;"));
});

test("NUL and unpaired surrogates in displayed text refuse instead of changing source text", () => {
  for (const text of ["x\0y", "\ud800", "\udc00"]) {
    for (const field of ["sourceName", "name", "why", "city", "constraints", "notes"]) {
      const s = source(); const file = JSON.parse(s.text);
      if (field === "sourceName") s.sourceName = text;
      else if (field === "city") file.inputs.city = text;
      else if (field === "notes") file.response.plan.notes = [text];
      else if (field === "constraints") file.inputs.constraints = file.response.comparison.constraints = [text];
      else file.response.plan.meals[0][field] = text;
      s.text = JSON.stringify(file);
      assert.throws(() => renderSavedWeekRoster([s]), /NUL|unpaired UTF-16 surrogate/);
    }
  }
});

test("strict original codec admission applies to every source before publication", () => {
  for (const mutate of [
    (f) => { f.format = "future"; }, (f) => { delete f.week.assignments["pick-0"]; },
    (f) => { f.week.assignments["pick-0"] = "Someday"; }, (f) => { f.inputs.constraints = []; },
    (f) => { f.receivedAt = "2026-10-08"; },
  ]) {
    const s = source(); const f = JSON.parse(s.text); mutate(f); s.text = JSON.stringify(f);
    assert.throws(() => renderSavedWeekRoster([source(), s]), /Source 2/);
  }
  const bom = source(); bom.text = "\uFEFF" + bom.text;
  assert.equal(renderSavedWeekRoster([bom]).picks, 5);
});

test("bounded input list, required labels and optional validated digests have explicit admission", () => {
  const a = source();
  for (const invalid of [null, [], Array(1), [null], [{ text: a.text }], Array(21).fill(a)]) assert.throws(() => renderSavedWeekRoster(invalid));
  assert.equal(renderSavedWeekRoster(Array(20).fill(a)).sources.length, 20);
  assert.throws(() => renderSavedWeekRoster([{ ...a, sourceSha256: "<script>" }]), /fingerprint/);
  assert(renderSavedWeekRoster([{ ...a, sourceSha256: null }]).html.includes("Not supplied"));
});
