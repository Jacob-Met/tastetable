/** Read-only arrangement comparison over snapshots admitted by the existing codec. */
import { calendarWeek } from "./week_plan.mjs";

/** JSON object member order is immaterial; array order remains source identity. */
function equal(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a).sort(), bk = Object.keys(b).sort();
  return ak.length === bk.length && ak.every((key, i) => key === bk[i] && equal(a[key], b[key]));
}

export function savedWeekVisits(snapshot) {
  const dates = Object.fromEntries(calendarWeek(snapshot.state.weekStart).map(({ day, date }) => [day, date]));
  return snapshot.state.picks.map(({ key, originalDay, pick }) => {
    const day = snapshot.state.assignments[key];
    return { key, originalDay, pick, day, date: day === null ? null : dates[day] };
  });
}

export function compareSavedWeeks(before, after) {
  const left = savedWeekVisits(before), right = savedWeekVisits(after);
  const paired = before.receivedAt === after.receivedAt
    && before.calendarId === after.calendarId
    && equal(before.inputs, after.inputs) && equal(before.response, after.response);
  if (!paired) return { paired: false, left, right, changes: [], counts: null };
  const counts = { unchanged: 0, moved: 0, scheduled: 0, omitted: 0 };
  const changes = left.map((visit, index) => {
    const next = right[index];
    const status = visit.date === next.date ? "unchanged"
      : visit.date === null ? "scheduled" : next.date === null ? "omitted" : "moved";
    counts[status]++;
    return { key: visit.key, pick: visit.pick, originalDay: visit.originalDay, before: visit, after: next, status };
  });
  return { paired: true, left, right, changes, counts };
}
