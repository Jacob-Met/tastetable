import test from "node:test";
import assert from "node:assert/strict";
import { filterSavedWeekRows } from "../static/saved_week_search.mjs";

const rows = Object.freeze([
  Object.freeze({ id: "one", draft: Object.freeze({ name: "Sunday  Café", text: "hidden meadow" }) }),
  Object.freeze({ id: "two", label: "Archived [care]*", error: "Unsupported version" }),
  Object.freeze({ id: "three", draft: Object.freeze({ name: "CAFÉ\tvisits" }) }),
  Object.freeze({ id: "four", label: "Old\n  visits", error: "Unreadable" }),
  Object.freeze({ id: "five", error: "Unreadable" }),
]);
const ids = (query) => filterSavedWeekRows(rows, query).map((row) => row.id);

test("blank queries retain every original row and order without mutation", () => {
  for (const query of ["", "  \t\n", "\u00a0"]) {
    const result = filterSavedWeekRows(rows, query);
    assert.deepEqual(result, rows);
    assert.notEqual(result, rows);
    result.forEach((row, index) => assert.equal(row, rows[index]));
  }
});
test("normalize case and whitespace on both sides while retaining accents", () => {
  assert.deepEqual(ids("  SUNDAY\n café  "), ["one"]);
  assert.deepEqual(ids("café"), ["one", "three"]);
  assert.deepEqual(ids("cafe"), []);
  assert.deepEqual(ids("OLD\tVISITS"), ["four"]);
});
test("punctuation is literal and unreadable labels remain findable", () => {
  assert.deepEqual(ids("[care]*"), ["two"]);
  assert.deepEqual(ids(".*"), []);
  assert.deepEqual(ids("Unreadable saved"), ["five"]);
});
test("only displayed names participate, with distinct empty and unmatched results", () => {
  assert.deepEqual(ids("meadow"), []);
  assert.deepEqual(ids("unsupported"), []);
  assert.deepEqual(ids("two"), []);
  assert.deepEqual(filterSavedWeekRows([], "anything"), []);
  assert.deepEqual(ids("visits"), ["three", "four"]);
});
