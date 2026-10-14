import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createDraft, MAX_DRAFTS } from "../static/saved_weeks.mjs";
import { createWeekPlan } from "../static/week_plan.mjs";
import { COLLECTION_FORMAT, MAX_COLLECTION_BYTES, makeCollectionBackup, readCollectionBackup, planCollectionRestore } from "../static/saved_week_collection.mjs";

const response = JSON.parse(readFileSync(new URL("./fixtures/saved-week-response.json", import.meta.url)));
const date = "2026-10-14T04:00:00.000Z";
const inputs = { cuisines: ["Cuban"], music: ["Celia Cruz"], films: [], city: "Pasadena", constraints: ["soft_foods", "low_sodium", "wheelchair"] };
function draft(id = "collection_test_A") {
  return createDraft({ id, name: "Café <literal>", response, inputs, weekState: createWeekPlan(response, "2026-12-31"),
    receivedAt: "2026-10-08T10:00:00.000Z", calendarId: "0123456789abcdef0123456789abcdef", now: new Date(date) });
}
const row = (draft) => ({ id: draft.id, draft });
const backup = (records) => ({ format: COLLECTION_FORMAT, savedAt: date, records });

test("complete fresh collection keeps original text and metadata, independent of listing order", () => {
  const a = draft(), b = draft("collection_test_B");
  const portable = JSON.parse(a.text); portable.extra = { literal: "Unknown Ω\r\nnext" };
  a.text = "\uFEFF" + JSON.stringify(portable, null, 2).replaceAll("\n", "\r\n");
  const before = structuredClone([a, b]);
  const text = makeCollectionBackup([row(b), row(a)], date);
  assert.deepEqual(readCollectionBackup(text), backup(before));
  assert.equal(text, JSON.stringify(backup(before), null, 2) + "\n");
  assert.equal(makeCollectionBackup([row(a), row(b)], date), text);
  assert.deepEqual([a, b], before);
  assert.deepEqual(readCollectionBackup("\uFEFF" + text), backup(before));
});

test("empty backup and exact 50-record boundary remain useful", () => {
  assert.deepEqual(readCollectionBackup(makeCollectionBackup([], date)), backup([]));
  const entries = Array.from({ length: MAX_DRAFTS }, (_, n) => draft(`collection_${String(n).padStart(3, "0")}`));
  assert.equal(readCollectionBackup(makeCollectionBackup(entries.map(row), date)).records.length, 50);
  assert.throws(() => makeCollectionBackup([...entries, draft("extra_record")].map(row), date));
});

test("complete backup refuses unreadable records, mismatched keys, duplicates and invalid dates", () => {
  const a = draft();
  for (const rows of [[row(a), { id: "bad", error: "unreadable" }], [{ id: "different", draft: a }], [row(a), row(a)]]) {
    const before = structuredClone(rows);
    assert.throws(() => makeCollectionBackup(rows, date));
    assert.deepEqual(rows, before);
  }
  assert.throws(() => makeCollectionBackup([], "2026-10-14"));
  assert.throws(() => makeCollectionBackup(new Array(2), date));
});

test("new envelope refuses duplicate decoded keys at both levels, foreign fields and invalid embedded data", () => {
  const text = JSON.stringify(backup([draft()]));
  for (const bad of [text.replace('"format":', '"format":"ignored","format":'),
    text.replace('"records":', '"rec\\u006frds":[],"records":'),
    text.replace('"name":', '"name":"first","name":'),
    JSON.stringify({ ...backup([]), other: true }), JSON.stringify(backup([{ ...draft(), other: true }])),
    JSON.stringify(backup([{ ...draft(), text: "broken" }])), JSON.stringify(backup([draft(), draft()])),
    "{}", "null", "[1]", "{", JSON.stringify({ ...backup([]), format: "future" })]) {
    assert.throws(() => readCollectionBackup(bad), TypeError);
  }
});

test("byte limit is UTF-8, and generated escaping cannot silently exceed it", () => {
  assert.throws(() => readCollectionBackup("é".repeat(MAX_COLLECTION_BYTES / 2 + 1)));
  const a = draft();
  // Valid portable text can contain much JSON whitespace; control characters
  // require escaping in the outer backup and can exceed its independent limit.
  a.text += "\t".repeat(500000);
  const rows = Array.from({ length: 50 }, (_, n) => row({ ...a, id: `large_record_${n}` }));
  assert.throws(() => makeCollectionBackup(rows, date), /32 MiB/);
});

test("preview distinguishes exact identical, rename and literal-text conflicts without mutation", () => {
  const a = draft(), b = draft("collection_test_B"), c = draft("collection_test_C");
  const renamed = { ...a, name: "Different name", updatedAt: "2026-10-15T04:00:00.000Z" };
  const textChanged = { ...b, text: b.text + "\n" };
  const incoming = backup([c, renamed, textChanged]);
  const rows = [row(b), row(a)], original = structuredClone({ incoming, rows });
  const plan = planCollectionRestore(incoming, rows);
  assert.deepEqual(plan.expected, [a, b]); assert.deepEqual(plan.missing, [c]);
  assert.deepEqual(plan.identical, []);
  assert.deepEqual(plan.conflicts, [{ existing: a, incoming: renamed }, { existing: b, incoming: textChanged }]);
  assert.equal(plan.totalAfter, 3); assert.equal(plan.canApply, false);
  assert.deepEqual({ incoming, rows }, original);
  assert.deepEqual(planCollectionRestore(backup([a, c]), rows), {
    expected: [a, b], missing: [c], identical: [a], conflicts: [], totalAfter: 3, canApply: true,
  });
});

test("identical and empty are no-ops; insufficient combined capacity is a whole-plan refusal", () => {
  const a = draft(), rows = [row(a)];
  assert.equal(planCollectionRestore(backup([a]), rows).canApply, false);
  assert.equal(planCollectionRestore(backup([]), rows).canApply, false);
  const full = Array.from({ length: 50 }, (_, n) => row(draft(`full_record_${n}`)));
  const plan = planCollectionRestore(backup([a]), full);
  assert.equal(plan.totalAfter, 51); assert.equal(plan.canApply, false); assert.equal(plan.missing.length, 1);
});
