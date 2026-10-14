/** Read-only comparison of two saved combined handoffs. Admission stays with the native reader. */
import { readCaregiverHandoff } from "./caregiver_handoff.mjs";
import { compareSavedWeeks } from "./week_compare.mjs";
import { compareVenueNotes } from "./venue_note_changes.mjs";

export function readHandoffForComparison(text, side) {
  if (side !== "earlier" && side !== "revised") throw new TypeError("Choose the earlier or revised comparison side.");
  try { return readCaregiverHandoff(text); }
  catch (error) {
    throw new Error((side === "earlier" ? "Earlier copy: " : "Revised copy: ") + error.message, { cause: error });
  }
}

/** Arguments must already be admitted snapshots; this does not validate arbitrary objects. */
export function compareCaregiverHandoffs(earlier, revised) {
  const arrangement = compareSavedWeeks(earlier, revised);
  return Object.freeze({
    paired: arrangement.paired,
    arrangement,
    notes: arrangement.paired ? compareVenueNotes(earlier.records, revised.records) : null,
  });
}
