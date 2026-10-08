/** Offline admission around the unchanged shipping saved-week codec. */
import { makeWeekFile, readWeekFile } from "./week_file.mjs";
import { createWeekPlan, setPickDay } from "./week_plan.mjs";

export const MAX_WEEK_FILE_BYTES = 128 * 1024;
const requireValue = (condition, message) => { if (!condition) throw new TypeError(message); };
// Object property order is immaterial; array order, every field and every value are retained.
const canonical = (value) => JSON.stringify(value, (_key, item) => {
  requireValue(typeof item !== "number" || Number.isFinite(item),
    "This saved week contains a non-finite number.");
  return item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item;
});
const same = (a, b) => canonical(a) === canonical(b);

export function inputsForRecord(catalogue, record) {
  const profile = catalogue.profiles.find((item) => item.id === record.profile_id);
  requireValue(profile, "This recording has no matching fictional profile.");
  return { cuisines: [...profile.cuisines], music: [...profile.music], films: [...profile.films],
    constraints: [...record.constraints], city: profile.city };
}

/** Download the standard v1 envelope, without changing or recapturing its recommendation. */
export function saveOfflineWeek(catalogue, record, state, receivedAt, calendarId = null, now = new Date()) {
  const original = catalogue.records.find((item) => item.key === record?.key);
  requireValue(original && same(record, original), "The current week is not a recording in this catalogue.");
  const saved = makeWeekFile({response: original.response, inputs: inputsForRecord(catalogue, original),
    state, receivedAt, calendarId}, now);
  requireValue(new TextEncoder().encode(saved.text).length <= MAX_WEEK_FILE_BYTES,
    "This saved week exceeds the offline studio's 128 KiB limit.");
  return saved;
}

/** Admit only an exact original response and profile/constraint input combination. */
export function readOfflineWeek(text, catalogue) {
  requireValue(typeof text === "string", "Choose a UTF-8 TasteTable saved-week file.");
  requireValue(new TextEncoder().encode(text).length <= MAX_WEEK_FILE_BYTES,
    "Choose a saved-week file no larger than 128 KiB.");
  const saved = readWeekFile(text);
  const matches = catalogue.records.filter((record) => same(record.response, saved.response)
    && same(inputsForRecord(catalogue, record), saved.inputs));
  requireValue(matches.length === 1,
    "This saved week does not exactly match a recording and its inputs in this offline catalogue. Your displayed week has not changed.");
  const record = matches[0];
  // Rebuild from canonical bytes, so reordered JSON keys can be opened and saved again.
  let state = createWeekPlan(record.response, saved.state.weekStart);
  for (const {key} of state.picks) state = setPickDay(state, key, saved.state.assignments[key]);
  return {record, state, receivedAt: saved.receivedAt, savedAt: saved.savedAt, calendarId: saved.calendarId};
}

/** Check advertised and actual size, then decode strictly before parsing any JSON. */
export async function readOfflineWeekFile(file, catalogue) {
  requireValue(file && Number.isSafeInteger(file.size) && file.size >= 0
    && file.size <= MAX_WEEK_FILE_BYTES && typeof file.arrayBuffer === "function",
  "Choose a saved-week file no larger than 128 KiB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  requireValue(bytes.byteLength <= MAX_WEEK_FILE_BYTES, "Choose a saved-week file no larger than 128 KiB.");
  let text;
  try { text = new TextDecoder("utf-8", {fatal: true}).decode(bytes); }
  catch { throw new TypeError("This file is not valid UTF-8. Choose a UTF-8 TasteTable saved week."); }
  return readOfflineWeek(text, catalogue);
}
