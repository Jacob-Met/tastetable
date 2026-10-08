/** A portable caregiver handoff over snapshots admitted by readWeekFile. */
import { calendarWeek } from "./week_plan.mjs";
import { compareSavedWeeks } from "./week_compare.mjs";

const SOURCE = Object.freeze({
  mock: "Demo / synthetic source: fictional venues.",
  live: "Saved live-source label; venue details have not been checked again.",
  unknown: "Source mode unknown in the saved response.",
});
const LABELS = Object.freeze({
  moved: "Moved visits",
  scheduled: "Newly scheduled visits",
  omitted: "Visits kept off the revised week",
});
// Quote file-supplied text so newlines and control characters cannot become
// headings in this plain-text handoff. Unicode text otherwise remains readable.
const quote = value => JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
const dateLabel = visit => visit.date === null ? "Not scheduled" : visit.day + " " + visit.date;

/**
 * before/after are {name, snapshot} entries already admitted by the existing
 * file reader. Matching is owned by compareSavedWeeks, not reimplemented here.
 */
export function makeWeekChangeBrief(before, after, now = new Date()) {
  if (typeof before?.name !== "string" || typeof after?.name !== "string") {
    throw new TypeError("Both loaded saved weeks need a filename.");
  }
  const createdAt = now.toISOString();
  const result = compareSavedWeeks(before.snapshot, after.snapshot);
  if (!result.paired) {
    throw new Error("A change brief needs matching saved sources and identities. Different sources remain separate arrangements.");
  }
  const a = before.snapshot, b = after.snapshot;
  const range = snapshot => calendarWeek(snapshot.state.weekStart);
  const left = range(a), right = range(b);
  const counts = result.counts;
  const unchangedOff = result.changes.filter(x => x.status === "unchanged" && x.after.date === null).length;
  const lines = [
    "TasteTable — caregiver revision brief",
    "Prepared at: " + createdAt,
    "Earlier file: " + quote(before.name),
    "Revised file: " + quote(after.name),
    "Earlier week: " + left[0].date + " to " + left[6].date,
    "Revised week: " + right[0].date + " to " + right[6].date,
    "Earlier copy saved at: " + a.savedAt,
    "Revised copy saved at: " + b.savedAt,
    "Shared source received at: " + a.receivedAt,
    "Shared source label: " + SOURCE[a.state.sourceMode],
    "Matching original response, inputs and source identity. Original pick occurrences are compared, including repeated venues.",
    "",
    "Arrangement changes",
    counts.moved + " moved; " + counts.scheduled + " newly scheduled; " + counts.omitted + " kept off the revised week.",
    counts.unchanged + " unchanged (" + (counts.unchanged - unchangedOff) + " still scheduled; " + unchangedOff + " still off the week).",
    result.left.filter(x => x.date !== null).length + " scheduled in the earlier copy; "
      + result.right.filter(x => x.date !== null).length + " scheduled in the revised copy.",
    "",
  ];
  if (!result.changes.length) {
    lines.push("No original visits in these saved copies.", "");
  } else if (counts.moved + counts.scheduled + counts.omitted === 0) {
    lines.push("No visit date or inclusion changes. Unchanged visits are not repeated in this brief.", "");
  }
  if (a.state.weekStart !== b.state.weekStart) {
    lines.push("The selected week changed. The dates below include that change.", "");
  }
  for (const [status, label] of Object.entries(LABELS)) {
    const changes = result.changes.map((change, index) => ({ ...change, occurrence: index + 1 }))
      .filter(change => change.status === status);
    if (!changes.length) continue;
    lines.push(label + " (" + changes.length + ")");
    for (const change of changes) {
      lines.push("Original pick " + change.occurrence + " (" + change.key + "): " + quote(change.pick.name),
        "  Kind: " + quote(change.pick.kind),
        "  Source entity ID: " + quote(change.pick.entity_id),
        "  Earlier: " + dateLabel(change.before),
        "  Revised: " + dateLabel(change.after),
        "  Original explanation from the saved file: " + quote(change.pick.why), "");
    }
  }
  lines.push(
    "Using this copy",
    "Unchanged visits are counted above. This brief is not the complete revised week.",
    "The earlier and revised roles come from the files you chose; timestamps do not establish which arrangement is current.",
    "Saved files are editable planning information, not authenticated venue records. No source or care checks were rerun.",
    "Dates are planning suggestions, not reservations or confirmed opening hours. Confirm details and care needs with the venue and care team.",
    "Venue worksheet notes are not included in these saved-week files.",
    "This download does not apply a week, contact a venue or update or cancel calendar imports. Later edits do not update this copy.",
    "File-supplied text is quoted; backslash escapes preserve embedded line breaks and control characters.",
  );
  return Object.freeze({
    filename: "tastetable-changes-" + a.state.weekStart + "-to-" + b.state.weekStart + ".txt",
    text: lines.join("\n") + "\n",
  });
}
