import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readVisitRecord, updateVisitRecord, makeVisitRecordFile } from "../static/visit_record.mjs";
import { createVisitDepartureGuard } from "../static/visit_departure.mjs";

const fixture = readFileSync(new URL("./fixtures/visit-record-csv.json", import.meta.url), "utf8");
const original = readVisitRecord(fixture).record;
class WindowProbe extends EventTarget {
  adds = 0; removes = 0;
  addEventListener(type, listener) {
    assert.equal(type, "beforeunload"); this.adds++;
    super.addEventListener(type, listener);
  }
  removeEventListener(type, listener) {
    assert.equal(type, "beforeunload"); this.removes++;
    super.removeEventListener(type, listener);
  }
  requested() {
    const event = new Event("beforeunload", { cancelable: true });
    Object.defineProperty(event, "returnValue", { value: false, writable: true });
    this.dispatchEvent(event);
    assert.equal(event.returnValue, event.defaultPrevented);
    return event.defaultPrevented;
  }
}
function session(record = original) {
  const target = new WindowProbe(), guard = createVisitDepartureGuard(target);
  guard.accept(record);
  return { target, guard };
}

test("no session or an explicitly opened record has no departure listener", () => {
  const target = new WindowProbe(), guard = createVisitDepartureGuard(target);
  assert.equal(guard.update(null), false);
  assert.equal(target.requested(), false);
  guard.accept(original);
  assert.equal(guard.update(readVisitRecord(fixture).record), false);
  assert.equal(target.adds, 0);
});

for (const [field, value] of [["outcome", "did_not_go"], ["date", "2024-03-10"], ["note", "New note"]]) {
  test("an accepted " + field + " change requests confirmation and exact reversion clears it", () => {
    const { target, guard } = session();
    const changed = updateVisitRecord(original, "pick-0", { [field]: value });
    assert.equal(guard.update(changed), true);
    assert.equal(target.requested(), true);
    const reverted = updateVisitRecord(changed, "pick-0", { [field]: original.visits[0][field] });
    assert.equal(guard.update(reverted), false);
    assert.equal(target.requested(), false);
    assert.deepEqual([target.adds, target.removes], [1, 1]);
  });
}

test("all changed occurrences must revert, including a duplicate omitted suggestion", () => {
  const { target, guard } = session();
  let changed = updateVisitRecord(original, "pick-0", { note: "First" });
  changed = updateVisitRecord(changed, "pick-1", { note: "Omitted duplicate" });
  guard.update(changed);
  changed = updateVisitRecord(changed, "pick-0", { note: original.visits[0].note });
  assert.equal(guard.update(changed), true);
  changed = updateVisitRecord(changed, "pick-1", { note: original.visits[1].note });
  assert.equal(guard.update(changed), false);
  assert.equal(target.requested(), false);
});

test("an invalid draft protects the tab even when the admitted record is unchanged", () => {
  const { target, guard } = session();
  assert.equal(guard.update(original, true), true);
  assert.equal(target.requested(), true);
  assert.equal(guard.update(original, false), false);
  assert.equal(target.requested(), false);
});

test("correcting an invalid draft does not clear other accepted edits", () => {
  const { target, guard } = session();
  const changed = updateVisitRecord(original, "pick-2", { date: "2024-03-15" });
  guard.update(changed, true);
  assert.equal(guard.update(changed, false), true);
  assert.equal(target.requested(), true);
  guard.update(original, true);
  assert.equal(target.requested(), true);
  guard.update(original, false);
  assert.equal(target.requested(), false);
});

test("literal imported CR and CRLF notes are not normalized by unrelated edits", () => {
  const { target, guard } = session();
  const before = JSON.stringify(original);
  assert.match(original.visits[1].note, /\rB\r\nC\n/u);
  const changed = updateVisitRecord(original, "pick-1", { outcome: "went" });
  guard.update(changed);
  const reverted = updateVisitRecord(changed, "pick-1", { outcome: "did_not_go" });
  assert.equal(guard.update(reverted), false);
  assert.equal(target.requested(), false);
  assert.equal(reverted.visits[1].note, original.visits[1].note);
  assert.equal(JSON.stringify(original), before);
});

test("repeated refreshes install only one listener and explicit replacement removes it", () => {
  const { target, guard } = session();
  const changed = updateVisitRecord(original, "pick-2", { note: "A second record" });
  for (let i = 0; i < 5; i++) guard.update(changed, i % 2 === 0);
  assert.equal(target.adds, 1);
  guard.accept(changed);
  assert.equal(target.requested(), false);
  assert.deepEqual([target.adds, target.removes], [1, 1]);
  guard.update(original);
  assert.equal(target.requested(), true);
});

test("exporting and reading a copy does not mark the current edited session saved", () => {
  const { target, guard } = session();
  const changed = updateVisitRecord(original, "pick-0", { note: "Keep this copy" });
  guard.update(changed);
  const saved = makeVisitRecordFile(changed, new Date("2026-10-13T00:00:00.000Z"));
  const reopened = readVisitRecord(saved.text).record;
  assert.deepEqual(reopened, changed);
  assert.equal(guard.update(changed), true);
  assert.equal(target.requested(), true);
  guard.accept(reopened);
  assert.equal(target.requested(), false);
  assert.equal(reopened.source.weekText, original.source.weekText);
});
