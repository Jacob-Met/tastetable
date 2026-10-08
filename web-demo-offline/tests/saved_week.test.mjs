import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { DAYS, createWeekPlan, setPickDay, setWeek } from "../week_plan.mjs";
import { makeWeekFile, readWeekFile, WEEK_FILE_FORMAT } from "../week_file.mjs";
import { MAX_WEEK_FILE_BYTES, inputsForRecord, saveOfflineWeek, readOfflineWeek, readOfflineWeekFile } from "../saved_week.mjs";

const catalogue = JSON.parse(fs.readFileSync(new URL("../data/catalogue.json", import.meta.url)));
const originalJSON = JSON.stringify(catalogue);
const receivedAt = "2026-10-08T13:00:00.000Z";
const savedAt = new Date("2026-10-08T13:30:00.000Z");
const record = catalogue.records.find((value) => value.key === "rosa-1");
const create = (r = record) => createWeekPlan(r.response, "2027-02-10");
const save = (r = record, state = create(r)) => saveOfflineWeek(catalogue, r, state, receivedAt, null, savedAt);
const value = () => JSON.parse(save().text);
const file = (text) => new Blob([text], {type: "application/json"});

test("shared saved-week codec and organizer retain their exact upstream Git blobs", () => {
  for (const [name, expected] of [["week_file.mjs", "420ddb8f63fca264dcf97be7147801105696155d"], ["week_plan.mjs", "8ed28163e0273c510fdd8e6f7c5d1c8476efb862"]]) {
    const bytes = fs.readFileSync(new URL("../" + name, import.meta.url));
    const sha = crypto.createHash("sha1").update("blob " + bytes.length + "\0").update(bytes).digest("hex");
    assert.equal(sha, expected);
  }
});

test("all 24 native records round-trip with date, co-located days, omissions and complete source", () => {
  for (const r of catalogue.records) {
    let state = create(r);
    state = setPickDay(state, "pick-0", "Saturday");
    state = setPickDay(state, "pick-1", "Saturday");
    state = setPickDay(state, "pick-2", null);
    const saved = save(r, state), envelope = JSON.parse(saved.text);
    assert.equal(envelope.format, WEEK_FILE_FORMAT);
    assert.deepEqual(envelope.response, r.response);
    assert.deepEqual(envelope.inputs, inputsForRecord(catalogue, r));
    assert.equal(envelope.calendarId, null);
    assert.equal(envelope.receivedAt, receivedAt);
    assert.equal(envelope.savedAt, savedAt.toISOString());
    assert.equal(saved.filename, "tastetable-week-2027-02-08.json");
    assert.ok(Buffer.byteLength(saved.text) < MAX_WEEK_FILE_BYTES);
    const restored = readOfflineWeek(saved.text, catalogue);
    assert.equal(restored.record, r);
    assert.deepEqual(restored.state, state);
    assert.equal(restored.receivedAt, receivedAt);
    assert.equal(Object.isFrozen(restored.state), true);
    assert.equal(Object.isFrozen(restored.state.assignments), true);
    assert.deepEqual(readWeekFile(saved.text).response, r.response);
  }
  assert.equal(JSON.stringify(catalogue), originalJSON);
});

test("all omitted weeks and leap/year boundaries retain the accepted organizer semantics", () => {
  for (const anchor of ["0001-01-01", "2000-02-29", "2024-12-31", "9999-12-20"]) {
    let state = setWeek(create(), anchor);
    for (const {key} of state.picks) state = setPickDay(state, key, null);
    assert.deepEqual(readOfflineWeek(save(record, state).text, catalogue).state, state);
  }
});

test("shared-codec files are admitted with canonical complete inputs and a retained calendar identity", () => {
  const saved = makeWeekFile({response: record.response, inputs: inputsForRecord(catalogue, record),
    state: create(), receivedAt, calendarId: "1234567890abcdef1234567890abcdef"}, savedAt);
  const restored = readOfflineWeek(saved.text, catalogue);
  assert.equal(restored.calendarId, "1234567890abcdef1234567890abcdef");
  const again = saveOfflineWeek(catalogue, restored.record, restored.state, restored.receivedAt, restored.calendarId, savedAt);
  assert.deepEqual(JSON.parse(again.text), JSON.parse(saved.text));
});

test("reordered JSON object keys open and can be saved again without weakening array/field identity", () => {
  const reverse = (item) => Array.isArray(item) ? item.map(reverse) : item && typeof item === "object"
    ? Object.fromEntries(Object.keys(item).reverse().map((key) => [key, reverse(item[key])])) : item;
  const source = reverse(value());
  const restored = readOfflineWeek(JSON.stringify(source), catalogue);
  assert.deepEqual(restored.state, create());
  assert.equal(restored.record, record);
  assert.deepEqual(JSON.parse(saveOfflineWeek(catalogue, restored.record, restored.state, restored.receivedAt, restored.calendarId, savedAt).text), value());
});

test("any changed explanation, trace, model/source flag, comparison, or extra response field is refused", () => {
  const changes = [
    (v) => { v.response.plan.meals[0].why += " verified today"; },
    (v) => { v.response.trace[0].args = null; },
    (v) => { v.response.model_message += " changed"; },
    (v) => { v.response.mock = false; },
    (v) => { v.response.comparison.grounded.with_affinity_evidence++; },
    (v) => { v.response.extra = "different source"; },
    (v) => { v.response.plan.notes.push("New backend advice"); },
    (v) => { v.response.plan.meals.reverse(); },
  ];
  for (const change of changes) {
    const v = value(); change(v);
    assert.throws(() => readOfflineWeek(JSON.stringify(v), catalogue), /match a recording/);
  }
});

test("profile, city, taste ordering, selected constraints and extra input fields remain bound", () => {
  const changes = [
    (v) => { v.inputs.cuisines = ["Unrecorded"]; },
    (v) => { v.inputs.city = "Another city"; },
    (v) => { v.inputs.cuisines.reverse(); },
    (v) => { v.inputs.music.push("Unrecorded"); },
    (v) => { v.inputs.extra = "Unrecorded"; },
    (v) => { v.inputs.constraints = []; },
  ];
  for (const change of changes) {
    const v = value(); change(v);
    assert.throws(() => readOfflineWeek(JSON.stringify(v), catalogue));
  }
});

test("a missing or ambiguous catalogue identity cannot become an accepted saved week", () => {
  assert.throws(() => readOfflineWeek(save().text, {...catalogue, records: []}), /match a recording/);
  assert.throws(() => readOfflineWeek(save().text, {...catalogue, records: [...catalogue.records, structuredClone(record)]}), /match a recording/);
  assert.throws(() => saveOfflineWeek(catalogue, {...record, response: {...record.response, mock: false}}, create(), receivedAt), /not a recording/);
});

test("unknown format, invalid dates/timestamps, incomplete or invented assignments are refused by the original codec", () => {
  const changes = [
    (v) => { v.format = "other.v1"; },
    (v) => { v.week.start = "2027-02-09"; },
    (v) => { v.week.start = "2027-02-30"; },
    (v) => { v.receivedAt = "2026-10-08"; },
    (v) => { v.savedAt = "never"; },
    (v) => { v.calendarId = "invented"; },
    (v) => { delete v.week.assignments["pick-0"]; },
    (v) => { v.week.assignments["pick-99"] = "Monday"; },
    (v) => { v.week.assignments["pick-0"] = "Funday"; },
  ];
  for (const change of changes) { const v = value(); change(v); assert.throws(() => readOfflineWeek(JSON.stringify(v), catalogue)); }
  assert.throws(() => readOfflineWeek("{", catalogue), /valid JSON/);
});

test("unsafe numeric/markup substitutions never reach the renderer", () => {
  const v = value(); v.response.comparison.grounded.picks = "<img src=x onerror=alert(1)>";
  assert.throws(() => readOfflineWeek(JSON.stringify(v), catalogue), /comparison counts/);
  const v2 = value(); v2.response.plan.meals[0].name = "<img src=x onerror=alert(1)>";
  assert.throws(() => readOfflineWeek(JSON.stringify(v2), catalogue), /match a recording/);
});

test("UTF-8 and BOM files open while malformed UTF-8 is refused before JSON", async () => {
  assert.equal((await readOfflineWeekFile(file(save().text), catalogue)).record, record);
  assert.equal((await readOfflineWeekFile(file("\uFEFF" + save().text), catalogue)).record, record);
  assert.equal(readOfflineWeek("\uFEFF" + save().text, catalogue).record, record);
  await assert.rejects(readOfflineWeekFile(new Blob([new Uint8Array([0xc3, 0x28])]), catalogue), /UTF-8/);
  await assert.rejects(readOfflineWeekFile(new Blob([new Uint8Array([0xff, 0xfe, 0x7b, 0x00])]), catalogue), /UTF-8/);
});

test("advertised and actual 128 KiB limits both apply; an exact-boundary JSON file is readable", async () => {
  const text = save().text;
  const padded = text + " ".repeat(MAX_WEEK_FILE_BYTES - Buffer.byteLength(text));
  assert.equal((await readOfflineWeekFile(file(padded), catalogue)).record, record);
  await assert.rejects(readOfflineWeekFile(file(padded + " "), catalogue), /128 KiB/);
  assert.throws(() => readOfflineWeek(padded + " ", catalogue), /128 KiB/);
  let called = false;
  await assert.rejects(readOfflineWeekFile({size: MAX_WEEK_FILE_BYTES + 1, arrayBuffer: async () => {called = true;}}, catalogue), /128 KiB/);
  assert.equal(called, false);
  await assert.rejects(readOfflineWeekFile({size: 1, arrayBuffer: async () => new Uint8Array(MAX_WEEK_FILE_BYTES + 1).buffer}, catalogue), /128 KiB/);
});

test("read rejection propagates without changing the previously accepted immutable state or catalogue", async () => {
  const state = create(), before = JSON.stringify(state);
  await assert.rejects(readOfflineWeekFile({size: 1, arrayBuffer: async () => {throw new Error("Authored read failure");}}, catalogue), /Authored read failure/);
  assert.equal(JSON.stringify(state), before);
  assert.equal(JSON.stringify(catalogue), originalJSON);
});

test("nonfinite JSON numbers cannot compare equal to actual recorded nullable fields", () => {
  const r = catalogue.records.find((item) => item.key === "rosa-0");
  const accepted = [];
  for (const position of [0, 1, 2, 3, "outing"]) {
    for (const token of ["1e400", "-1e400"]) {
      const envelope = JSON.parse(save(r).text);
      const pick = position === "outing" ? envelope.response.llm_only.outing : envelope.response.llm_only.meals[position];
      assert.equal(pick.verified.entity_id, null);
      pick.verified.entity_id = "__AUTHORED_OVERFLOW__";
      const text = JSON.stringify(envelope).replace('"__AUTHORED_OVERFLOW__"', token);
      const parsed = JSON.parse(text).response.llm_only;
      const decoded = (position === "outing" ? parsed.outing : parsed.meals[position]).verified.entity_id;
      assert.equal(decoded, token.startsWith("-") ? -Infinity : Infinity);
      try { readOfflineWeek(text, catalogue); accepted.push({position, token}); }
      catch (error) { assert.match(error.message, /non-finite number/); }
    }
  }
  assert.deepEqual(accepted, [], "Changed nonfinite scalars must not match native null.");
});
