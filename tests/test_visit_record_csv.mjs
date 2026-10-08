import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderVisitRecordCsv, VISIT_CSV_COLUMNS } from "../static/visit_record_csv.mjs";

const text = readFileSync(new URL("./fixtures/visit-record-csv.json", import.meta.url), "utf8");
const header = '"source_name","week_start","source_mode","source_received_at","source_saved_at","record_saved_at","occurrence_key","venue_name","entity_id","kind","original_day","planned_day","planned_date","outcome","actual_date","note","original_explanation"\r\n';
const prefix = '" original,week.json ","2024-02-26","mock","2024-02-01T00:00:00.000Z","2024-02-25T18:00:00.000Z","2024-03-03T12:00:00.000Z",';
const expected = header
  + prefix + '"pick-0","Café, ""Same""","same-id","restaurant","Monday","Thursday","2024-02-29","went","2024-03-01","He said ""yes"", then went.","  First\r\nreason  "\r\n'
  + prefix + '"pick-1","Café, ""Same""","same-id","restaurant","Tuesday","","","did_not_go","2024-03-02","  A\rB\r\nC\n🙂\t ","Second reason"\r\n'
  + prefix + '"pick-2","Third café","third-id","restaurant","Friday","Friday","2024-03-01","unrecorded","","","Third reason"\r\n';
function changeWeek(mutator) {
  const envelope = JSON.parse(text), week = JSON.parse(envelope.source.weekText);
  mutator(week, envelope);
  envelope.source.weekText = JSON.stringify(week);
  return JSON.stringify(envelope);
}
test("exact CSV retains all occurrences, original order, planned/actual dates and literal source text", () => {
  assert.deepEqual(renderVisitRecordCsv(text), {
    csv: expected, rowCount: 3, weekStart: "2024-02-26", sourceMode: "mock",
    savedAt: "2024-03-03T12:00:00.000Z",
  });
  assert.equal(VISIT_CSV_COLUMNS.length, 17);
  assert(Object.isFrozen(VISIT_CSV_COLUMNS));
});
test("source labels follow unchanged saved-week admission without inferred authenticity", () => {
  for (const [mock, label] of [[true,"mock"],[false,"live"],[null,"unknown"]]) {
    const input = changeWeek(week => { week.response.mock = mock; });
    const report = renderVisitRecordCsv(input);
    assert.equal(report.sourceMode, label);
    assert(report.csv.includes(',"' + label + '",'));
  }
});
test("an admitted week with zero occurrences produces only its exact header", () => {
  const input = changeWeek((week, record) => {
    week.response.plan.meals = []; week.week.assignments = {}; record.visits = [];
  });
  assert.equal(renderVisitRecordCsv(input).csv, header);
  assert.equal(renderVisitRecordCsv(input).rowCount, 0);
});
test("identifiers and formula-like notes remain exact text, without spreadsheet inference", () => {
  const envelope = JSON.parse(text), week = JSON.parse(envelope.source.weekText);
  week.response.plan.meals[0].entity_id = "000123";
  envelope.source.weekText = JSON.stringify(week);
  envelope.visits.find(row => row.key === "pick-0").note = "=literal\t+text";
  const report = renderVisitRecordCsv(JSON.stringify(envelope));
  assert(report.csv.includes(',"000123","restaurant",'));
  assert(report.csv.includes(',"=literal\t+text",'));
});
test("all original codec refusals happen before a CSV is returned", () => {
  for (const input of ["", "{}", "[1]", "{", text + " trailing"]) assert.throws(() => renderVisitRecordCsv(input));
  for (const alter of [
    value => { value.visits.pop(); },
    value => { value.visits[0].key = "pick-1"; },
    value => { value.visits[0].outcome = "inferred"; },
    value => { value.visits[0].date = "2024-02-30"; },
    value => { value.extra = true; },
  ]) {
    const value = JSON.parse(text); alter(value);
    assert.throws(() => renderVisitRecordCsv(JSON.stringify(value)));
  }
});
test("a lone surrogate in an inherited pick is refused instead of silently replaced in UTF-8", () => {
  assert.throws(() => renderVisitRecordCsv(changeWeek(week => { week.response.plan.meals[0].name = "\ud800"; })), /Unicode/);
});
test("a BOM on a valid record is admitted and export stays deterministic", () => {
  assert.equal(renderVisitRecordCsv("\uFEFF" + text).csv, expected);
  assert.equal(renderVisitRecordCsv(text).csv, expected);
});
