import { createVisitRecord, updateVisitRecord, makeVisitRecordFile } from "../../static/visit_record.mjs";
export function fixture({ start = "2026-10-12", count = 3, savedAt = "2026-10-20T00:00:00.000Z",
  outcome = "went", note = "  Café <img src=x onerror=alert(1)>\rA\r\nB\n🙂  ", padding = "" } = {}) {
  const checks = { picks: count, with_qloo_entity_id: count, with_affinity_evidence: 0, constraint_checked: 0, unsafe_candidates_rejected: 0 };
  const meals = Array.from({ length: count }, (_, i) => ({ name: "Café Same", entity_id: "same-id",
    kind: "restaurant", day: i % 2 ? "Friday" : "Monday", why: "Original evidence " + i, ordinal: i,
    checks: [{ constraint: "soft_foods", status: "unknown", reason: "Confirm with the venue" }] }));
  const week = { format: "tastetable.saved-week.v1", receivedAt: "2026-10-01T00:00:00.000Z",
    savedAt: "2026-10-02T00:00:00.000Z", calendarId: null,
    inputs: { city: "Example City", cuisines: ["Cuban"], music: ["Earth, Wind & Fire"], films: [], constraints: [] },
    response: { mock: true, plan: { meals, outing: null, notes: ["Original mock suggestions; venue confirmation pending."], rejected: [] },
      llm_only: { meals: [], outing: { name: "Comparison", day: "Saturday", why: "Not selected" } },
      comparison: { constraints: [], grounded: checks, llm_only: checks }, trace: [], padding },
    week: { start, assignments: Object.fromEntries(meals.map((_, i) => ["pick-" + i, i === 1 ? null : "Sunday"])) } };
  const weekText = "\uFEFF" + JSON.stringify(week, null, 2).replaceAll("\n", "\r\n") + "\r\n";
  let record = createVisitRecord(weekText, "original-" + start + ".json");
  if (count) record = updateVisitRecord(record, "pick-0", { outcome, date: "2026-10-25", note });
  if (count > 1) record = updateVisitRecord(record, "pick-1", { date: "2024-02-29", note: "Date alone is not attendance." });
  return { record, weekText, text: makeVisitRecordFile(record, new Date(savedAt)).text };
}
