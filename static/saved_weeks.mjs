import { makeWeekFile, readWeekFile } from "./week_file.mjs";
import { makeCaregiverHandoff, readCaregiverHandoff } from "./caregiver_handoff.mjs";
import { weekRows, offWeekPicks } from "./week_plan.mjs";

// Version 1 is the existing portable week. Version 2 keeps the already validated
// complete caregiver handoff inside the same atomic browser record.
export const DRAFT_FORMAT = "tastetable.browser-week";
export const DRAFT_VERSION = 1;
export const CAREGIVER_DRAFT_VERSION = 2;
export const MAX_DRAFT_BYTES = 512 * 1024;
export const MAX_DRAFTS = 50;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{7,79}$/;
function fail(message) { throw new TypeError(message); }
function timestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
      || new Date(value).toISOString() !== value) fail("This saved week has an invalid date.");
}
function content(value) {
  return value.version === CAREGIVER_DRAFT_VERSION
    ? readCaregiverHandoff(value.text) : readWeekFile(value.text);
}
export function draftName(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 120
      || /[\u0000-\u001f\u007f]/.test(value)) fail("Use a saved week name of 1–120 characters without control characters.");
  return value.trim();
}
export function validateDraft(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || value.format !== DRAFT_FORMAT
      || ![DRAFT_VERSION, CAREGIVER_DRAFT_VERSION].includes(value.version)) {
    fail("This browser record uses an unsupported format or version.");
  }
  if (typeof value.id !== "string" || !ID.test(value.id)) fail("This saved week has an invalid identity.");
  if (draftName(value.name) !== value.name) fail("The saved week name is not normalized.");
  timestamp(value.createdAt); timestamp(value.updatedAt);
  if (value.updatedAt < value.createdAt) fail("This saved week has inconsistent dates.");
  if (typeof value.text !== "string" || new TextEncoder().encode(value.text).byteLength > MAX_DRAFT_BYTES) {
    fail("This saved week exceeds the 512 KiB browser-copy limit.");
  }
  const opened = content(value);
  if (opened.savedAt !== value.createdAt
      || (value.version === CAREGIVER_DRAFT_VERSION && opened.handoffSavedAt !== value.createdAt)) {
    fail("The browser record and its saved copy have different dates.");
  }
  return { format: value.format, version: value.version, id: value.id, name: value.name,
    createdAt: value.createdAt, updatedAt: value.updatedAt, text: value.text };
}
export function createDraft({ name, response, inputs, weekState, receivedAt, calendarId, venueModel,
  id = globalThis.crypto.randomUUID(), now = new Date() }) {
  const origin = { response, inputs, receivedAt, calendarId };
  const includesNotes = venueModel !== undefined;
  const output = includesNotes
    ? makeCaregiverHandoff({ origin, state: weekState, model: venueModel }, now)
    : makeWeekFile({ ...origin, state: weekState }, now);
  const createdAt = now.toISOString();
  return validateDraft({ format: DRAFT_FORMAT,
    version: includesNotes ? CAREGIVER_DRAFT_VERSION : DRAFT_VERSION, id,
    name: draftName(name), createdAt, updatedAt: createdAt, text: output.text });
}
export function openDraft(value) {
  const draft = validateDraft(value);
  const opened = content(draft);
  return { draft, ...opened, weekState: opened.state,
    includesNotes: draft.version === CAREGIVER_DRAFT_VERSION };
}
export function renameDraft(value, name, now = new Date()) {
  const draft = validateDraft(value);
  draft.name = draftName(name);
  draft.updatedAt = [draft.updatedAt, now.toISOString()].sort().at(-1);
  return validateDraft(draft);
}
export function draftSummary(value) {
  const { draft, weekState, includesNotes, records = [] } = openDraft(value);
  const omitted = offWeekPicks(weekState);
  return { id: draft.id, name: draft.name, createdAt: draft.createdAt,
    weekStart: weekState.weekStart, sourceMode: weekState.sourceMode,
    constraints: weekState.constraints, rows: weekRows(weekState), omitted,
    includesNotes, noteCount: records.length,
    suggested: weekState.picks.length, scheduled: weekState.picks.length - omitted.length };
}
