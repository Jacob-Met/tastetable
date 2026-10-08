import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { chooseRecord, validateCatalogue } from "../catalogue.mjs";
import { DAYS, createWeekPlan, offWeekPicks, resetDays, setPickDay, setWeek, weekRows } from "../week_plan.mjs";
import { inputsForRecord, readOfflineWeek, saveOfflineWeek } from "../saved_week.mjs";
import {
  ARRANGEMENT_HISTORY_LIMIT, canRedoArrangement, canUndoArrangement,
  createArrangementHistory, recordArrangement, redoArrangement, undoArrangement,
} from "../arrangement_history.mjs";

const catalogue = validateCatalogue(JSON.parse(fs.readFileSync(new URL("../data/catalogue.json", import.meta.url))));
const record = chooseRecord(catalogue, "rosa", ["soft_foods"]);
const anchor = "2026-10-21";
const initial = () => createWeekPlan(record.response, anchor);
const change = (history, state, label, date = history.present.date) =>
  recordArrangement(history, state, date, label);
const differentDay = (day) => DAYS[(DAYS.indexOf(day) + 1) % DAYS.length];

test("a caregiver can undo and redo move, omission, week change, and atomic Restore suggested days", () => {
  const original = initial();
  let history = createArrangementHistory(original, anchor);
  const moved = setPickDay(original, "pick-0", differentDay(original.assignments["pick-0"]));
  history = change(history, moved, "Move first pick");
  const omitted = setPickDay(moved, "pick-1", null);
  history = change(history, omitted, "Keep second pick off this week");
  const anotherWeek = setWeek(omitted, "2026-11-04");
  history = change(history, anotherWeek, "Change week", "2026-11-04");
  const restored = resetDays(anotherWeek);
  history = change(history, restored, "Restore suggested days");

  assert.equal(history.past.length, 4);
  history = undoArrangement(history);
  assert.equal(history.present.state, anotherWeek);
  assert.equal(history.present.date, "2026-11-04");
  assert.equal(offWeekPicks(history.present.state)[0].key, "pick-1");
  assert.deepEqual(weekRows(history.present.state), weekRows(anotherWeek));
  history = redoArrangement(history);
  assert.equal(history.present.state, restored);
  assert.equal(offWeekPicks(history.present.state).length, 0);

  for (const expected of [anotherWeek, omitted, moved, original]) {
    history = undoArrangement(history);
    assert.equal(history.present.state, expected);
    assert.equal(history.present.state.sourcePlan, original.sourcePlan);
    assert.equal(history.present.state.picks, original.picks);
    assert.equal(history.present.state.constraints, original.constraints);
  }
  assert.equal(history.present.date, anchor);
  assert.equal(canUndoArrangement(history), false);
  assert.equal(history.future.length, 4);
  for (const expected of [moved, omitted, anotherWeek, restored]) {
    history = redoArrangement(history);
    assert.equal(history.present.state, expected);
  }
  assert.equal(canRedoArrangement(history), false);
  assert.deepEqual(original.sourcePlan, record.response.plan);
});

test("assignment, reset, and same-week no-ops preserve redo while keeping a valid date anchor", () => {
  const state = initial();
  let history = createArrangementHistory(state, anchor);
  const moved = setPickDay(state, "pick-0", differentDay(state.assignments["pick-0"]));
  history = undoArrangement(change(history, moved, "Move first pick"));
  const before = history;
  history = change(history, setPickDay(history.present.state, "pick-0", state.assignments["pick-0"]), "Same day");
  assert.equal(history, before);
  history = change(history, resetDays(history.present.state), "Already restored");
  assert.equal(history, before);
  history = change(history, setWeek(history.present.state, "2026-10-25"), "Same week", "2026-10-25");
  assert.equal(history.past.length, 0);
  assert.equal(history.future, before.future);
  assert.equal(history.present.state, state);
  assert.equal(history.present.date, "2026-10-25");
  history = redoArrangement(history);
  assert.equal(history.present.state, moved);
  assert.equal(history.present.date, anchor);
  history = undoArrangement(history);
  assert.equal(history.present.state, state);
  assert.equal(history.present.date, "2026-10-25");
});

test("a distinct edit after Undo replaces the abandoned branch without losing the current arrangement", () => {
  const state = initial();
  let history = createArrangementHistory(state, anchor);
  const moved = setPickDay(state, "pick-0", differentDay(state.assignments["pick-0"]));
  history = change(history, moved, "Move first pick");
  history = change(history, setPickDay(moved, "pick-1", null), "Omit second pick");
  history = undoArrangement(history);
  const branch = setPickDay(history.present.state, "pick-2", null);
  history = change(history, branch, "Omit third pick");
  assert.equal(history.future.length, 0);
  assert.equal(redoArrangement(history), history);
  assert.equal(history.present.state.assignments["pick-1"], state.assignments["pick-1"]);
  assert.equal(history.present.state.assignments["pick-2"], null);
  history = undoArrangement(history);
  assert.equal(history.present.state, moved);
  history = redoArrangement(history);
  assert.equal(history.present.state, branch);
});

test("25 real occurrence changes retain exactly the last 20 recoverable changes across Undo and Redo", () => {
  assert.equal(ARRANGEMENT_HISTORY_LIMIT, 20);
  const states = [initial()];
  let history = createArrangementHistory(states[0], anchor);
  for (let index = 1; index <= 25; index++) {
    const prior = history.present.state;
    const next = setPickDay(prior, "pick-0", differentDay(prior.assignments["pick-0"]));
    states.push(next);
    history = change(history, next, "Move " + index);
    assert.ok(history.past.length + history.future.length <= 20);
  }
  assert.equal(history.past.length, 20);
  for (let expected = 24; expected >= 5; expected--) {
    history = undoArrangement(history);
    assert.equal(history.present.state, states[expected]);
    assert.equal(history.past.length + history.future.length, 20);
  }
  assert.equal(history.present.state, states[5]);
  assert.equal(canUndoArrangement(history), false);
  assert.equal(undoArrangement(history), history);
  assert.equal(history.future.length, 20);
  for (let expected = 6; expected <= 25; expected++) {
    history = redoArrangement(history);
    assert.equal(history.present.state, states[expected]);
    assert.equal(history.past.length + history.future.length, 20);
  }
  assert.equal(canRedoArrangement(history), false);
  assert.equal(redoArrangement(history), history);
});

test("an explicitly accepted saved week or recording needs fresh history even when its values match", () => {
  const state = initial();
  let history = createArrangementHistory(state, anchor);
  history = change(history, setPickDay(state, "pick-0", null), "Omit first pick");
  const saved = saveOfflineWeek(catalogue, record, history.present.state,
    "2026-10-08T15:00:00.000Z", null, new Date("2026-10-08T15:01:00.000Z"));
  const opened = readOfflineWeek(saved.text, catalogue);
  assert.deepEqual(opened.state, history.present.state);
  assert.throws(() => change(history, opened.state, "Opened copy"), /different accepted source/);
  assert.throws(() => change(history, createWeekPlan(record.response, anchor), "Same recording again"), /different accepted source/);
  const other = chooseRecord(catalogue, "mei", []);
  assert.throws(() => change(history, createWeekPlan(other.response, anchor), "Different recording"), /different accepted source/);
  const replacement = createArrangementHistory(opened.state, opened.state.weekStart);
  assert.equal(canUndoArrangement(replacement), false);
  assert.equal(canRedoArrangement(replacement), false);
  assert.equal(undoArrangement(replacement), replacement);
  assert.equal(history.past.length, 1);
});

test("invalid dates and incomplete native arrangements are refused without mutating retained history", () => {
  const state = initial();
  const history = change(createArrangementHistory(state, anchor), setPickDay(state, "pick-0", null), "Omit first pick");
  const before = JSON.stringify(history);
  for (const date of ["", "2026-02-30", "not-a-date", "9999-12-31"]) {
    assert.throws(() => change(history, history.present.state, "Invalid date", date), RangeError);
  }
  assert.throws(() => change(history, history.present.state, "Mismatched week", "2026-11-04"), /belong to the arranged week/);
  const incomplete = Object.freeze({...state, assignments: Object.freeze({})});
  assert.throws(() => change(history, incomplete, "Incomplete assignments"), /every native occurrence/);
  assert.throws(() => change(history, resetDays(history.present.state), " "), /Describe/);
  assert.equal(JSON.stringify(history), before);
  assert.ok(Object.isFrozen(history) && Object.isFrozen(history.past) && Object.isFrozen(history.present));
  assert.throws(() => { history.present.state.assignments["pick-0"] = "Friday"; }, TypeError);
  assert.equal(undoArrangement(history).present.state, state);
});

test("saving a recovered arrangement retains the original envelope and never serializes recovery history", () => {
  const state = initial();
  let history = createArrangementHistory(state, anchor);
  const moved = setPickDay(state, "pick-0", differentDay(state.assignments["pick-0"]));
  history = change(history, moved, "Move first pick");
  const omitted = setPickDay(moved, "pick-1", null);
  history = change(history, omitted, "Omit second pick");
  history = change(history, resetDays(omitted), "Restore suggested days");
  history = undoArrangement(history);
  const receivedAt = "2026-10-08T15:00:00.000Z";
  const calendarId = "1234567890abcdef1234567890abcdef";
  const now = new Date("2026-10-08T15:01:00.000Z");
  const recovered = saveOfflineWeek(catalogue, record, history.present.state, receivedAt, calendarId, now);
  const expected = saveOfflineWeek(catalogue, record, omitted, receivedAt, calendarId, now);
  assert.equal(recovered.text, expected.text);
  const envelope = JSON.parse(recovered.text);
  assert.deepEqual(envelope.response, record.response);
  assert.deepEqual(envelope.inputs, inputsForRecord(catalogue, record));
  assert.equal(envelope.receivedAt, receivedAt);
  assert.equal(envelope.calendarId, calendarId);
  assert.equal("history" in envelope, false);
  assert.equal("past" in envelope.week, false);
  const readback = readOfflineWeek(recovered.text, catalogue);
  assert.deepEqual(readback.state, omitted);
  assert.equal(readback.record, record);
  assert.equal(history.future.length, 1);
});

test("an all-omitted arrangement is recovered as one complete state after restoring suggested days", () => {
  let state = initial();
  let history = createArrangementHistory(state, anchor);
  for (const {key} of state.picks) {
    state = setPickDay(state, key, null);
    history = change(history, state, "Omit " + key);
  }
  assert.equal(offWeekPicks(state).length, state.picks.length);
  assert.equal(weekRows(state).every((row) => row.picks.length === 0), true);
  history = change(history, resetDays(state), "Restore suggested days");
  assert.equal(offWeekPicks(history.present.state).length, 0);
  history = undoArrangement(history);
  assert.equal(history.present.state, state);
  assert.equal(offWeekPicks(history.present.state).length, state.picks.length);
  assert.equal(history.future.length, 1);
});
