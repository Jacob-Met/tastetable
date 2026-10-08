/** A tabular report of admitted visit records; not a replacement backup format. */
import { readVisitRecord, visitRecordRows } from "./visit_record.mjs";
import { readWeekFile } from "./week_file.mjs";

export const VISIT_CSV_COLUMNS = Object.freeze([
  "source_name", "week_start", "source_mode", "source_received_at", "source_saved_at",
  "record_saved_at", "occurrence_key", "venue_name", "entity_id", "kind",
  "original_day", "planned_day", "planned_date", "outcome", "actual_date", "note",
  "original_explanation",
]);

function field(value) {
  if (value === null) return '""';
  if (typeof value !== "string" || !value.isWellFormed()) {
    throw new TypeError("CSV fields must contain valid Unicode text.");
  }
  return '"' + value.replaceAll('"', '""') + '"';
}
const line = values => values.map(field).join(",") + "\r\n";

/** Emit one row per original occurrence, including omitted and unrecorded picks. */
export function renderVisitRecordCsv(text) {
  const { record, savedAt } = readVisitRecord(text);
  const saved = readWeekFile(record.source.weekText);
  const rows = visitRecordRows(record);
  let csv = line(VISIT_CSV_COLUMNS);
  for (const row of rows) {
    csv += line([
      record.source.name, saved.state.weekStart, saved.state.sourceMode,
      saved.receivedAt, saved.savedAt, savedAt, row.key, row.pick.name,
      row.pick.entity_id, row.pick.kind, row.originalDay, row.plannedDay,
      row.plannedDate, row.outcome, row.date, row.note, row.pick.why,
    ]);
  }
  return Object.freeze({
    csv, rowCount: rows.length, weekStart: saved.state.weekStart,
    sourceMode: saved.state.sourceMode, savedAt,
  });
}
