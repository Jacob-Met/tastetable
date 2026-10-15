/** Local scheduling of an existing checked plan. No recommendation or provider calls. */
export const DAYS = Object.freeze([
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
]);

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function dateKey(date) {
  const year = date.getUTCFullYear();
  if (year < 1 || year > 9999) throw new RangeError("Choose a week within years 0001–9999.");
  return date.toISOString().slice(0, 10);
}

function parseDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError("Choose a valid calendar date for your week.");
  }
  const date = new Date(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || dateKey(date) !== value) {
    throw new RangeError("Choose a valid calendar date for your week.");
  }
  return date;
}

/** Calendar dates use UTC arithmetic so a daylight-saving change cannot skip a day. */
export function calendarWeek(anchor) {
  const date = parseDate(anchor);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return DAYS.map((day) => {
    const row = Object.freeze({ day, date: dateKey(date) });
    date.setUTCDate(date.getUTCDate() + 1);
    return row;
  });
}

/** Use the browser's current calendar date, not the UTC date near local midnight. */
export function localDate(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new RangeError("A valid current date is required.");
  }
  return `${String(now.getFullYear()).padStart(4, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function createWeekPlan(response, anchor = localDate()) {
  if (!response?.plan || !Array.isArray(response.plan.meals)) {
    throw new TypeError("The response does not contain a weekly plan.");
  }
  const sourcePlan = structuredClone(response.plan);
  const picks = [...sourcePlan.meals, ...(sourcePlan.outing ? [sourcePlan.outing] : [])]
    .map((pick, index) => {
      if (!pick || !DAYS.includes(pick.day) || !["restaurant", "outing"].includes(pick.kind)
          || typeof pick.entity_id !== "string" || !pick.entity_id.trim()) {
        throw new TypeError("A suggested pick is missing its source identity, kind or day.");
      }
      return { key: `pick-${index}`, originalDay: pick.day, pick };
    });
  return freeze({
    weekStart: calendarWeek(anchor)[0].date,
    sourceMode: response.mock === true ? "mock" : response.mock === false ? "live" : "unknown",
    constraints: structuredClone(response.comparison?.constraints ?? []),
    sourcePlan,
    picks,
    assignments: Object.fromEntries(picks.map(({ key, originalDay }) => [key, originalDay])),
  });
}

export function setWeek(state, anchor) {
  return freeze({ ...state, weekStart: calendarWeek(anchor)[0].date });
}

/** Multiple checked picks may share a day; no pick is duplicated or displaced. */
export function setPickDay(state, key, day) {
  if (!state.picks.some((pick) => pick.key === key)) throw new RangeError("Unknown suggested pick.");
  if (day !== null && !DAYS.includes(day)) throw new RangeError("Choose a weekday or leave this pick off the week.");
  return freeze({ ...state, assignments: { ...state.assignments, [key]: day } });
}

export function resetDays(state) {
  return freeze({
    ...state,
    assignments: Object.fromEntries(state.picks.map(({ key, originalDay }) => [key, originalDay])),
  });
}

export function weekRows(state) {
  return calendarWeek(state.weekStart).map((row) => ({
    ...row, picks: state.picks.filter(({ key }) => state.assignments[key] === row.day),
  }));
}

export function offWeekPicks(state) {
  return state.picks.filter(({ key }) => state.assignments[key] === null);
}
