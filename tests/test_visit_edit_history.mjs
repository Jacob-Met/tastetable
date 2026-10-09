import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createVisitEditHistory } from "../static/visit_edit_history.mjs";
import { readVisitRecord, updateVisitRecord, makeVisitRecordFile } from "../static/visit_record.mjs";

const raw = readFileSync(new URL("./fixtures/visit-record-csv.json", import.meta.url), "utf8");
const original = readVisitRecord(raw).record;
const savedAt = new Date("2026-10-09T00:00:00.000Z");
const note = record => record.visits.find(v => v.key === "pick-1").note;
const edit = (history, value, key = "pick-1", field = "note", grouped = true) =>
  history.record(updateVisitRecord(history.current, key, {[field]: value}), key + "-" + field, grouped);

test("one text focus edit restores the complete literal imported record", () => {
  const history = createVisitEditHistory(original);
  for (const value of ["n", "ne", "new"]) edit(history, value);
  assert.equal(history.canUndo, true);
  history.close();
  const undone = history.undo();
  assert.equal(undone.target, "pick-1-note");
  assert.deepEqual(undone.record, original);
  assert.equal(note(undone.record), "  A\rB\r\nC\n🙂\t ");
  assert.equal(history.canUndo, false);
  assert.equal(note(history.redo().record), "new");
  assert.equal(history.canRedo, false);
});

test("twenty retained changes retain the boundary value, not an extra baseline", () => {
  const history = createVisitEditHistory(original);
  for (let i = 1; i <= 21; i++) { edit(history, "Explicit note " + i); history.close(); }
  for (let i = 0; i < 20; i++) assert.ok(history.undo());
  assert.equal(note(history.current), "Explicit note 1");
  assert.equal(history.undo(), null);
  for (let i = 0; i < 20; i++) assert.ok(history.redo());
  assert.equal(note(history.current), "Explicit note 21");
  assert.equal(history.redo(), null);
});

test("returning to the starting exact value is a no-op and preserves Redo", () => {
  const history = createVisitEditHistory(original);
  edit(history, "kept future"); history.close(); history.undo();
  const initial = note(history.current);
  edit(history, "temporary");
  assert.equal(history.canRedo, false);
  edit(history, initial);
  history.close();
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, true);
  assert.equal(note(history.redo().record), "kept future");
});

test("an unchanged accepted patch does not consume history or discard Redo", () => {
  const history = createVisitEditHistory(original);
  edit(history, "future"); history.close(); history.undo();
  edit(history, note(history.current)); history.close();
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, true);
  assert.equal(note(history.redo().record), "future");
});

test("a committed new edit after Undo replaces only the future branch", () => {
  const history = createVisitEditHistory(original);
  edit(history, "first"); history.close();
  edit(history, "second"); history.close();
  history.undo(); edit(history, "alternate"); history.close();
  assert.equal(history.canRedo, false);
  assert.equal(note(history.undo().record), "first");
  assert.equal(note(history.undo().record), note(original));
  assert.equal(note(history.redo().record), "first");
  assert.equal(note(history.redo().record), "alternate");
});

test("different fields and repeated venue occurrences remain separate changes", () => {
  const history = createVisitEditHistory(original);
  edit(history, "first occurrence", "pick-0");
  edit(history, "second occurrence", "pick-1");
  const firstUndo = history.undo();
  assert.equal(firstUndo.target, "pick-1-note");
  assert.equal(firstUndo.record.visits[0].note, "first occurrence");
  assert.equal(firstUndo.record.visits[1].note, original.visits[1].note);
  assert.deepEqual(history.undo().record, original);
});

test("each outcome selection is an atomic change", () => {
  const history = createVisitEditHistory(original);
  edit(history, "did_not_go", "pick-0", "outcome", false);
  edit(history, "unrecorded", "pick-0", "outcome", false);
  assert.equal(history.undo().record.visits[0].outcome, "did_not_go");
  assert.equal(history.undo().record.visits[0].outcome, "went");
  assert.equal(history.undo(), null);
});

test("invalid native model edits cannot replace accepted history", () => {
  const history = createVisitEditHistory(original);
  edit(history, "accepted"); history.close();
  assert.throws(() => edit(history, "2026-02-30", "pick-0", "date"), /calendar date/);
  assert.throws(() => edit(history, "x".repeat(4001)), /4,000/);
  assert.equal(note(history.current), "accepted");
  assert.deepEqual(history.undo().record, original);
});

test("cleared date and empty note restore their exact prior values", () => {
  const history = createVisitEditHistory(original);
  edit(history, null, "pick-1", "date"); history.close();
  edit(history, "", "pick-1", "note"); history.close();
  assert.equal(note(history.current), "");
  assert.equal(history.current.visits[1].date, null);
  assert.equal(note(history.undo().record), note(original));
  assert.deepEqual(history.undo().record, original);
});

test("source text, omitted and untouched siblings survive every recovery", () => {
  const history = createVisitEditHistory(original);
  const before = makeVisitRecordFile(original, savedAt).text;
  edit(history, "replacement"); history.close(); history.undo();
  assert.equal(makeVisitRecordFile(history.current, savedAt).text, before);
  assert.equal(history.current.source.weekText, original.source.weekText);
  assert.deepEqual(history.current.visits[2], original.visits[2]);
  assert.equal(readVisitRecord(raw).record.source.weekText, original.source.weekText);
  assert.ok(Object.isFrozen(history.current));
  assert.ok(Object.isFrozen(history.current.visits[1]));
});

test("explicit Use resets history even when its accepted values match", () => {
  const history = createVisitEditHistory(original);
  edit(history, "temporary"); history.close(); history.undo();
  assert.equal(history.canRedo, true);
  history.reset(readVisitRecord(raw).record);
  assert.equal(history.canRedo, false);
  assert.equal(history.canUndo, false);
  assert.equal(history.undo(), null);
  assert.equal(history.redo(), null);
});

test("an empty editor cannot expose a recovery operation", () => {
  const history = createVisitEditHistory();
  assert.equal(history.current, null);
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
  assert.equal(history.undo(), null);
  assert.equal(history.redo(), null);
  history.reset(original);
  assert.deepEqual(history.current, original);
});
