/** Local, explicit visit outcomes bound to original saved-week occurrences. */
import { readWeekFile } from "./week_file.mjs";
import { calendarWeek } from "./week_plan.mjs";

export const VISIT_RECORD_FORMAT = "tastetable.visit-record.v1";
export const VISIT_RECORD_LIMITS = Object.freeze({
  sourceBytes: 2 * 1024 * 1024, fileBytes: 8 * 1024 * 1024,
  occurrences: 100, nameCodePoints: 512, noteCodePoints: 4000,
});
const outcomes = new Set(["unrecorded", "went", "did_not_go"]);
const utf8 = new TextEncoder();
const fail = (condition, message) => { if (!condition) throw new TypeError(message); };

function fields(value, expected, label) {
  fail(value !== null && typeof value === "object" && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value)),
  label + " must be a plain record.");
  const keys = Reflect.ownKeys(value);
  fail(keys.length === expected.length && expected.every(key => keys.includes(key))
    && expected.every(key => Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), "value")),
  label + " has missing or unsupported fields.");
}
function unicode(text, label) {
  fail(typeof text === "string" && text.isWellFormed(), label + " must contain valid Unicode text.");
}
function boundedText(text, maxBytes, label) {
  unicode(text, label);
  fail(utf8.encode(text).byteLength <= maxBytes, label + " is too large.");
}
function name(value) {
  unicode(value, "Source name");
  fail(value.trim().length > 0 && [...value].length <= VISIT_RECORD_LIMITS.nameCodePoints
    && !/[\u0000-\u001f\u007f]/u.test(value),
  "Use a nonblank source name of at most 512 characters, without control characters.");
  return value;
}
function note(value) {
  unicode(value, "Visit note");
  fail([...value].length <= VISIT_RECORD_LIMITS.noteCodePoints
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value),
  "Use at most 4,000 characters in a note; only tabs and line breaks are allowed as control characters.");
  return value;
}
function visitDate(value) {
  if (value === null) return null;
  fail(typeof value === "string" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)
    && value.slice(0, 4) !== "0000", "Use a real date in YYYY-MM-DD form, within years 0001–9999.");
  const parsed = new Date(value + "T12:00:00.000Z");
  fail(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value,
    "Use a real calendar date in YYYY-MM-DD form.");
  return value;
}
function timestamp(value) {
  fail(typeof value === "string", "The visit record needs a saved timestamp.");
  const date = new Date(value);
  fail(Number.isFinite(date.getTime()) && date.toISOString() === value,
    "The visit record needs a canonical saved timestamp.");
  return value;
}
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function source(value) {
  fields(value, ["name", "weekText"], "Source");
  name(value.name);
  boundedText(value.weekText, VISIT_RECORD_LIMITS.sourceBytes, "Original saved week");
  const saved = readWeekFile(value.weekText);
  fail(saved.state.picks.length <= VISIT_RECORD_LIMITS.occurrences,
    "Choose a saved week with at most 100 original picks.");
  return saved;
}
function entry(value) {
  fields(value, ["key", "outcome", "date", "note"], "Visit");
  fail(typeof value.key === "string" && outcomes.has(value.outcome), "The visit has an unsupported key or outcome.");
  return { key: value.key, outcome: value.outcome, date: visitDate(value.date), note: note(value.note) };
}
function normalize(record) {
  fields(record, ["source", "visits"], "Visit record");
  const saved = source(record.source), keys = saved.state.picks.map(pick => pick.key);
  fail(Array.isArray(record.visits) && record.visits.length === keys.length,
    "Include every original pick exactly once.");
  const entries = new Map();
  for (const raw of record.visits) {
    const value = entry(raw);
    fail(keys.includes(value.key) && !entries.has(value.key), "The visit record has an unknown or repeated pick.");
    entries.set(value.key, value);
  }
  const normalized = freeze({
    source: { name: record.source.name, weekText: record.source.weekText },
    visits: keys.map(key => entries.get(key)),
  });
  return { record: normalized, saved };
}

/** Preserve the complete source text; planned days never imply an outcome or actual date. */
export function createVisitRecord(weekText, sourceName) {
  const original = { name: sourceName, weekText }, saved = source(original);
  return normalize({ source: original, visits: saved.state.picks.map(({ key }) => ({
    key, outcome: "unrecorded", date: null, note: "",
  })) }).record;
}

/** Validate the full input before applying a field-specific, immutable change. */
export function updateVisitRecord(record, occurrenceKey, patch) {
  const current = normalize(record).record;
  fail(patch !== null && typeof patch === "object" && !Array.isArray(patch)
    && [Object.prototype, null].includes(Object.getPrototypeOf(patch)), "Use a visit-field patch.");
  const keys = Reflect.ownKeys(patch);
  fail(keys.every(key => ["outcome", "date", "note"].includes(key)
    && Object.hasOwn(Object.getOwnPropertyDescriptor(patch, key), "value")), "The patch contains an unsupported field.");
  fail(current.visits.some(visit => visit.key === occurrenceKey), "Choose an original pick in this record.");
  return normalize({
    source: current.source,
    visits: current.visits.map(visit => visit.key === occurrenceKey ? { ...visit, ...patch } : visit),
  }).record;
}

/** This public projection retains the original complete pick and exact saved arrangement. */
export function visitRecordRows(record) {
  const { record: current, saved } = normalize(record);
  const dates = Object.fromEntries(calendarWeek(saved.state.weekStart).map(row => [row.day, row.date]));
  return freeze(saved.state.picks.map((original, index) => ({
    key: original.key, originalDay: original.originalDay,
    plannedDay: saved.state.assignments[original.key],
    plannedDate: dates[saved.state.assignments[original.key]] ?? null,
    pick: structuredClone(original.pick),
    outcome: current.visits[index].outcome, date: current.visits[index].date,
    note: current.visits[index].note,
  })));
}

export function makeVisitRecordFile(record, now = new Date()) {
  const { record: current, saved } = normalize(record);
  fail(now instanceof Date && Number.isFinite(now.getTime()), "Use a valid save time.");
  const text = JSON.stringify({
    format: VISIT_RECORD_FORMAT, savedAt: now.toISOString(),
    source: current.source, visits: current.visits,
  }, null, 2) + "\n";
  boundedText(text, VISIT_RECORD_LIMITS.fileBytes, "Visit record file");
  return { filename: `tastetable-visits-${saved.state.weekStart}.json`, text };
}

export function readVisitRecord(text) {
  boundedText(text, VISIT_RECORD_LIMITS.fileBytes, "Visit record file");
  let envelope;
  try { envelope = JSON.parse(text.replace(/^\uFEFF/, "")); }
  catch { throw new TypeError("Choose a valid JSON visit record."); }
  fields(envelope, ["format", "savedAt", "source", "visits"], "Visit record file");
  fail(envelope.format === VISIT_RECORD_FORMAT, "Choose a TasteTable visit record in the supported v1 format.");
  const savedAt = timestamp(envelope.savedAt);
  const record = normalize({ source: envelope.source, visits: envelope.visits }).record;
  return Object.freeze({ record, savedAt });
}
