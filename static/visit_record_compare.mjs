/** Read-only differences between two admitted copies of one original visit record. */
import { readVisitRecord, visitRecordRows } from "./visit_record.mjs";
import { readWeekFile } from "./week_file.mjs";

const FIELD_ORDER = Object.freeze(["outcome", "date", "note"]);

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function fields(row) {
  return { outcome: row.outcome, date: row.date, note: row.note };
}

/** Roles follow the caller; save timestamps do not establish chronology or authority. */
export function compareVisitRecords(beforeText, afterText) {
  const before = readVisitRecord(beforeText);
  const after = readVisitRecord(afterText);
  if (before.record.source.weekText !== after.record.source.weekText) {
    throw new TypeError("Choose two visit records made from the same exact original saved-week file, including its formatting.");
  }
  const weekText = before.record.source.weekText;
  const saved = readWeekFile(weekText);
  const left = visitRecordRows(before.record);
  const right = visitRecordRows(after.record);
  const counts = {
    total: left.length, changed: 0, unchanged: 0,
    outcomeChanged: 0, dateChanged: 0, noteChanged: 0,
  };
  const rows = left.map((row, index) => {
    const next = right[index];
    const changedFields = FIELD_ORDER.filter(field => row[field] !== next[field]);
    counts[changedFields.length ? "changed" : "unchanged"]++;
    for (const field of changedFields) counts[field + "Changed"]++;
    return {
      key: row.key, originalDay: row.originalDay,
      plannedDay: row.plannedDay, plannedDate: row.plannedDate, pick: row.pick,
      before: fields(row), after: fields(next), changedFields,
    };
  });
  return freeze({
    format: "tastetable.visit-record-comparison.v1",
    source: {
      weekText, weekStart: saved.state.weekStart, sourceMode: saved.state.sourceMode,
      receivedAt: saved.receivedAt, savedAt: saved.savedAt,
      constraints: structuredClone(saved.state.constraints),
    },
    before: { sourceName: before.record.source.name, savedAt: before.savedAt },
    after: { sourceName: after.record.source.name, savedAt: after.savedAt },
    counts, rows,
  });
}

// JSON quoting preserves literal data while keeping every field on one report line.
function quote(value) {
  return JSON.stringify(value).replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029");
}

/** A change brief, not an editable backup or a fresh verification of the original plan. */
export function renderVisitRecordComparisonText(beforeText, afterText) {
  const result = compareVisitRecords(beforeText, afterText);
  const { source, counts } = result;
  const lines = [
    "TasteTable visit-record changes",
    "",
    "Before and after are caller-selected roles; saved timestamps do not establish chronology or authority.",
    "Before source: " + quote(result.before.sourceName),
    "Before record saved at: " + quote(result.before.savedAt),
    "After source: " + quote(result.after.sourceName),
    "After record saved at: " + quote(result.after.savedAt),
    "",
    "Common original week: " + quote(source.weekStart),
    "Original source mode: " + quote(source.sourceMode),
    "Original source received at: " + quote(source.receivedAt),
    "Original week saved at: " + quote(source.savedAt),
    "Original requested constraints: " + source.constraints.map(quote).join(", "),
    "",
    "Occurrences: " + counts.total + "; changed: " + counts.changed + "; unchanged: " + counts.unchanged + ".",
    "Field changes (counts can overlap): outcome " + counts.outcomeChanged
      + "; actual date " + counts.dateChanged + "; note " + counts.noteChanged + ".",
  ];
  if (!counts.changed) lines.push("", "No visit fields changed.");
  for (const row of result.rows) {
    if (!row.changedFields.length) continue;
    lines.push(
      "",
      "Occurrence " + quote(row.key) + ": " + quote(row.pick.name),
      "  Original entity ID: " + quote(row.pick.entity_id),
      "  Original kind: " + quote(row.pick.kind),
      "  Original suggested day: " + quote(row.originalDay),
      "  Planned day: " + quote(row.plannedDay),
      "  Planned date: " + quote(row.plannedDate),
      "  Original explanation: " + quote(row.pick.why),
      "  Changed fields: " + row.changedFields.join(", "),
      "  Before outcome: " + quote(row.before.outcome),
      "  Before actual date: " + quote(row.before.date),
      "  Before note: " + quote(row.before.note),
      "  After outcome: " + quote(row.after.outcome),
      "  After actual date: " + quote(row.after.date),
      "  After note: " + quote(row.after.note),
    );
  }
  lines.push(
    "",
    "Outcomes, actual dates and notes are independently entered values; planned dates do not imply attendance.",
    "Original source labels and explanations are retained; checks were not rerun. Mock sources are fictional demonstrations.",
    "This brief does not replace either record, confirm a venue or update a calendar.",
    "Keep both original JSON files as the editable records; unchanged occurrences are counted rather than expanded here.",
    "",
  );
  return lines.join("\n");
}
