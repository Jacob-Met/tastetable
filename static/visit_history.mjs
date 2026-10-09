/** Read-only collections of existing visit files. Native record/week codecs stay authoritative. */
import { readVisitRecord, visitRecordRows, VISIT_RECORD_LIMITS } from "./visit_record.mjs";
import { readWeekFile } from "./week_file.mjs";
import { calendarWeek } from "./week_plan.mjs";

export const HISTORY_LIMITS = Object.freeze({ files: 20, bytes: 32 * 1024 * 1024, queryCodePoints: 512 });
const encoder = new TextEncoder();
const histories = new WeakSet(), previews = new WeakMap();
const requireValue = (ok, message) => { if (!ok) throw new TypeError(message); };
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function state(files, nextId) {
  const value = freeze({ files, nextId, bytes: files.reduce((sum, file) => sum + file.bytes, 0) });
  histories.add(value); return value;
}
function current(value) { requireValue(histories.has(value), "Use a current visit-history collection."); }
function fileName(name) {
  requireValue(typeof name === "string" && name.isWellFormed() && name.trim()
    && [...name].length <= 512 && !/[\u0000-\u001f\u007f]/u.test(name),
  "Choose a nonblank filename of at most 512 characters without control characters.");
}
function date(value) {
  requireValue(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith("0000"),
    "Use real filter dates in YYYY-MM-DD form, within years 0001–9999.");
  const parsed = new Date(value + "T12:00:00.000Z");
  requireValue(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value,
    "Use a real calendar date for the filter.");
  return value;
}
export function createVisitHistory() { return state([], 1); }

/** Validate the complete batch before returning any proposed replacement state. */
export function previewHistoryAddition(history, inputs) {
  current(history);
  requireValue(Array.isArray(inputs) && inputs.length > 0 && inputs.length <= HISTORY_LIMITS.files,
    "Choose between 1 and 20 visit-record files.");
  const checked = []; let batchBytes = 0;
  for (const input of inputs) {
    requireValue(input && typeof input === "object", "Each selected file needs a name and UTF-8 text.");
    fileName(input.name);
    requireValue(typeof input.text === "string" && input.text.isWellFormed(), "Choose valid UTF-8 visit-record text.");
    const bytes = encoder.encode(input.text).byteLength;
    requireValue(bytes <= VISIT_RECORD_LIMITS.fileBytes, "A visit-record file exceeds the 8 MiB limit.");
    batchBytes += bytes;
    requireValue(batchBytes <= HISTORY_LIMITS.bytes, "A selection may contain at most 32 MiB.");
    const parsed = readVisitRecord(input.text);
    const saved = readWeekFile(parsed.record.source.weekText);
    checked.push({ name: input.name, text: input.text, bytes, savedAt: parsed.savedAt,
      sourceName: parsed.record.source.name, weekText: parsed.record.source.weekText,
      weekStart: saved.state.weekStart, weekEnd: calendarWeek(saved.state.weekStart).at(-1).date, sourceMode: saved.state.sourceMode, inputs: saved.inputs,
      planNotes: saved.response.plan.notes, rows: visitRecordRows(parsed.record) });
  }
  const files = [...history.files], added = [], duplicates = []; let nextId = history.nextId;
  for (const candidate of checked) {
    const exact = files.find(file => file.text === candidate.text);
    if (exact) { duplicates.push({ name: candidate.name, existingId: exact.id, existingName: exact.name }); continue; }
    const entry = freeze({ ...candidate, id: "record-" + nextId++ });
    files.push(entry); added.push(entry);
  }
  requireValue(files.length <= HISTORY_LIMITS.files, "The collection may contain at most 20 different files. Remove a file first.");
  const next = state(files, nextId);
  requireValue(next.bytes <= HISTORY_LIMITS.bytes, "The collection may contain at most 32 MiB. Remove a file first.");
  const preview = freeze({ added, duplicates, next });
  previews.set(preview, history);
  return preview;
}

/** A preview cannot be applied after removal, clearing or another accepted addition. */
export function acceptHistoryAddition(history, preview) {
  current(history);
  requireValue(previews.get(preview) === history, "The collection changed. Preview these files again.");
  return preview.next;
}
export function removeHistoryFile(history, id) {
  current(history);
  requireValue(history.files.some(file => file.id === id), "Choose a file in the current collection.");
  return state(history.files.filter(file => file.id !== id), history.nextId);
}

/** These are overlapping record snapshots, not evidence of unique or duplicate real visits. */
export function overlappingHistoryFiles(history) {
  current(history);
  return Object.freeze(history.files.filter(file =>
    history.files.some(other => other.id !== file.id && other.weekStart <= file.weekEnd && file.weekStart <= other.weekEnd)).map(file => file.id));
}

export function filterVisitHistory(history, options = {}) {
  current(history);
  const { outcome = "all", datePresence = "all", from = "", to = "", query = "", order = "files" } = options;
  requireValue(["all", "unrecorded", "went", "did_not_go"].includes(outcome), "Choose a recorded outcome.");
  requireValue(["all", "dated", "undated"].includes(datePresence), "Choose an entered-date filter.");
  requireValue(["files", "date_asc", "date_desc"].includes(order), "Choose a supported ordering.");
  requireValue(typeof query === "string" && query.isWellFormed()
    && [...query].length <= HISTORY_LIMITS.queryCodePoints, "Search with at most 512 valid Unicode characters.");
  requireValue(typeof from === "string" && typeof to === "string", "Use date text for the filter.");
  if (from) date(from); if (to) date(to);
  requireValue(!from || !to || from <= to, "The start date must not be after the end date.");
  requireValue(datePresence !== "undated" || (!from && !to), "Clear the date range to show undated entries.");
  const needle = query.toLocaleLowerCase("en-US");
  let rows = history.files.flatMap(file => file.rows.map(row => ({ file, row }))).filter(({ file, row }) => {
    if (outcome !== "all" && row.outcome !== outcome) return false;
    if (datePresence === "dated" && row.date === null) return false;
    if (datePresence === "undated" && row.date !== null) return false;
    if ((from || to) && row.date === null) return false;
    if (from && row.date < from || to && row.date > to) return false;
    return [file.name, file.sourceName, file.inputs.city, row.pick.name, row.pick.entity_id, row.pick.why, row.note]
      .some(value => value.toLocaleLowerCase("en-US").includes(needle));
  });
  if (order !== "files") rows = rows.toSorted((a, b) => {
    if (a.row.date === null) return b.row.date === null ? 0 : 1;
    if (b.row.date === null) return -1;
    const comparison = a.row.date.localeCompare(b.row.date);
    return order === "date_asc" ? comparison : -comparison;
  });
  return freeze(rows);
}
