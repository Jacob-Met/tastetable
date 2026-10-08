/** Bounded, page-local recovery of one accepted plan's arrangement. */
import { calendarWeek, DAYS } from "./week_plan.mjs";

export const ARRANGEMENT_HISTORY_LIMIT = 20;

function snapshot(state, date) {
  if (!state || !Object.isFrozen(state) || !Object.isFrozen(state.assignments)
      || !Array.isArray(state.picks) || !Object.isFrozen(state.picks)) {
    throw new TypeError("History requires an immutable native week state.");
  }
  const keys = state.picks.map((pick) => pick.key);
  if (new Set(keys).size !== keys.length || Object.keys(state.assignments).length !== keys.length
      || keys.some((key) => !Object.hasOwn(state.assignments, key)
        || (state.assignments[key] !== null && !DAYS.includes(state.assignments[key])))) {
    throw new TypeError("History requires every native occurrence assignment.");
  }
  if (calendarWeek(date)[0].date !== state.weekStart) {
    throw new RangeError("The displayed date must belong to the arranged week.");
  }
  return Object.freeze({ state, date });
}

function freezeHistory(origin, present, past = [], future = []) {
  return Object.freeze({
    origin, present,
    past: Object.freeze(past),
    future: Object.freeze(future),
  });
}

function sameSource(origin, state) {
  return state.sourcePlan === origin.sourcePlan && state.picks === origin.picks
    && state.constraints === origin.constraints && state.sourceMode === origin.sourceMode;
}

function sameArrangement(first, second) {
  return first.weekStart === second.weekStart
    && Object.keys(first.assignments).every((key) => first.assignments[key] === second.assignments[key]);
}

/** Each accepted record or explicit saved-week replacement creates a new history. */
export function createArrangementHistory(state, date = state?.weekStart) {
  return freezeHistory(state, snapshot(state, date));
}

/** Only a successful distinct week/assignment change enters history. */
export function recordArrangement(history, state, date, label) {
  if (!history || !sameSource(history.origin, state)) {
    throw new RangeError("Start a new history for a different accepted source.");
  }
  const next = snapshot(state, date);
  if (sameArrangement(history.present.state, state)) {
    // Keep a valid same-week date anchor without consuming an entry or clearing redo.
    if (history.present.date === date) return history;
    return freezeHistory(history.origin,
      snapshot(history.present.state, date), history.past, history.future);
  }
  if (typeof label !== "string" || !label.trim()) {
    throw new TypeError("Describe the arrangement change.");
  }
  const entry = Object.freeze({ ...history.present, label });
  return freezeHistory(history.origin, next,
    [...history.past, entry].slice(-ARRANGEMENT_HISTORY_LIMIT), []);
}

export function canUndoArrangement(history) {
  return Boolean(history?.past.length);
}

export function canRedoArrangement(history) {
  return Boolean(history?.future.length);
}

export function undoArrangement(history) {
  if (!canUndoArrangement(history)) return history;
  const entry = history.past.at(-1);
  const future = [...history.future, Object.freeze({ ...history.present, label: entry.label })];
  return freezeHistory(history.origin, snapshot(entry.state, entry.date),
    history.past.slice(0, -1), future);
}

export function redoArrangement(history) {
  if (!canRedoArrangement(history)) return history;
  const entry = history.future.at(-1);
  const past = [...history.past, Object.freeze({ ...history.present, label: entry.label })];
  return freezeHistory(history.origin, snapshot(entry.state, entry.date),
    past, history.future.slice(0, -1));
}
