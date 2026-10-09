/** Portable, user-opened snapshots of an existing TasteTable week. */
import { createWeekPlan, setPickDay } from "./week_plan.mjs";

export const WEEK_FILE_FORMAT = "tastetable.saved-week.v1";

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const copy = (value) => structuredClone(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function requireValue(condition, message) {
  if (!condition) throw new TypeError(message);
}

function timestamp(value) {
  requireValue(typeof value === "string", "The saved week is missing a valid timestamp.");
  const date = new Date(value);
  requireValue(Number.isFinite(date.getTime()) && date.toISOString() === value,
    "The saved week is missing a valid timestamp.");
  return value;
}

function readInputs(value) {
  requireValue(object(value), "The saved week is missing its original inputs.");
  for (const key of ["cuisines", "music", "films", "constraints"]) {
    requireValue(Array.isArray(value[key]) && value[key].every((item) => typeof item === "string"),
      "The saved week has invalid " + key + " inputs.");
  }
  requireValue(typeof value.city === "string", "The saved week has an invalid city input.");
  return copy(value);
}

function textFields(value, fields, label) {
  requireValue(object(value) && fields.every((field) => typeof value[field] === "string"),
    "The saved response has invalid " + label + ".");
}

function readResponse(value) {
  requireValue(object(value) && object(value.plan), "The saved week is missing its original response.");
  const plan = value.plan;
  requireValue(Array.isArray(plan.meals) && Array.isArray(plan.notes)
    && plan.notes.every((note) => typeof note === "string") && Array.isArray(plan.rejected),
  "The saved response has an incomplete original plan.");
  for (const pick of [...plan.meals, ...(plan.outing == null ? [] : [plan.outing])]) {
    textFields(pick, ["name", "why", "entity_id", "kind", "day"], "original pick fields");
    requireValue(pick.affinity == null || (typeof pick.affinity === "number" && Number.isFinite(pick.affinity)),
      "The saved response has an invalid affinity value.");
    requireValue(pick.fallback === undefined || typeof pick.fallback === "boolean",
      "The saved response has an invalid fallback value.");
  }
  requireValue(object(value.llm_only) && Array.isArray(value.llm_only.meals),
    "The saved response is missing its original comparison plan.");
  for (const pick of [...value.llm_only.meals, value.llm_only.outing]) {
    textFields(pick, ["name", "why", "day"], "comparison pick fields");
  }
  // These fields are native numeric counts, including two inherited raw HTML
  // interpolation sites. A local file must not supply HTML in their place.
  const counts = ["picks", "with_qloo_entity_id", "with_affinity_evidence", "constraint_checked", "unsafe_candidates_rejected"];
  for (const side of ["grounded", "llm_only"]) {
    const values = value.comparison?.[side];
    requireValue(object(values) && counts.every((key) => Number.isSafeInteger(values[key]) && values[key] >= 0),
      "The saved response has invalid comparison counts.");
  }
  for (const rejected of plan.rejected) {
    textFields(rejected, ["name"], "rejected candidate fields");
    requireValue(Array.isArray(rejected.failed), "The saved response has invalid rejected checks.");
    for (const check of rejected.failed) textFields(check, ["constraint", "status", "reason"], "rejected check fields");
  }
  requireValue(Array.isArray(value.trace), "The saved response is missing its original tool trace.");
  for (const entry of value.trace) {
    textFields(entry, ["tool", "result_summary"], "tool trace fields");
    // Native decoder recovery deliberately retains null, arrays and scalar
    // arguments in diagnostics. JSON.stringify + escaping renders them as data.
    requireValue(Object.hasOwn(entry, "args"), "The saved response is missing tool arguments.");
  }
  return copy(value);
}

function restore(value) {
  requireValue(object(value) && value.format === WEEK_FILE_FORMAT,
    "Choose a TasteTable saved-week file in the supported v1 format.");
  const receivedAt = timestamp(value.receivedAt);
  const savedAt = timestamp(value.savedAt);
  requireValue(value.calendarId === null || (typeof value.calendarId === "string" && /^[0-9a-f]{32}$/.test(value.calendarId)),
    "The saved week has an invalid calendar identity.");
  const inputs = readInputs(value.inputs);
  requireValue(object(value.week) && object(value.week.assignments),
    "The saved week is missing its arrangement.");
  const response = readResponse(value.response);
  let state = createWeekPlan(response, value.week.start);
  requireValue(state.weekStart === value.week.start,
    "The saved week must identify the Monday of its displayed week.");
  requireValue(same(inputs.constraints, state.constraints),
    "The saved inputs and the original response have different constraints.");
  const keys = state.picks.map(({ key }) => key);
  requireValue(Object.keys(value.week.assignments).length === keys.length
    && keys.every((key) => Object.hasOwn(value.week.assignments, key)),
  "The saved arrangement must include every original pick exactly once.");
  for (const key of keys) state = setPickDay(state, key, value.week.assignments[key]);
  return { response, inputs, state, receivedAt, savedAt, calendarId: value.calendarId };
}

/** The response is retained whole, including source explanations and tool trace. */
export function makeWeekFile({ response, inputs, state, receivedAt, calendarId }, now = new Date()) {
  const envelope = {
    format: WEEK_FILE_FORMAT,
    receivedAt,
    savedAt: now.toISOString(),
    calendarId,
    inputs: copy(inputs),
    response: copy(response),
    week: { start: state?.weekStart, assignments: copy(state?.assignments) },
  };
  const restored = restore(envelope);
  requireValue(same(state, restored.state),
    "The arranged week no longer matches its original response.");
  return {
    filename: `tastetable-week-${state.weekStart}.json`,
    text: JSON.stringify(envelope, null, 2) + "\n",
  };
}

/** Recreate native immutable state; serialized derived picks are never trusted. */
export function readWeekFile(text) {
  requireValue(typeof text === "string", "The saved week must be a JSON text file.");
  let value;
  try {
    // A UTF-8 BOM is accepted for ordinary editor/file interoperability.
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new TypeError("This file is not valid JSON. Choose a saved TasteTable week.");
  }
  return restore(value);
}
