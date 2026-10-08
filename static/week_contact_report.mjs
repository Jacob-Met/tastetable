/** Admit an optional companion using the existing source/occurrence/date contract. */
import { createVenueFollowup } from "./venue_followup.mjs";
import { readVenueNoteFile } from "./venue_note_file.mjs";
import { calendarWeek, setWeek, setPickDay } from "./week_plan.mjs";

export function prepareWeekContactReport(saved, { text, sourceName = "Saved venue notes", sourceSha256 = null } = {}) {
  if (typeof sourceName !== "string") throw new TypeError("The venue notes source name must be text.");
  if (sourceSha256 !== null && (typeof sourceSha256 !== "string" || !/^[0-9a-f]{64}$/.test(sourceSha256))) {
    throw new TypeError("The venue notes fingerprint must be a lowercase SHA-256 value.");
  }
  const { state } = saved;
  const model = createVenueFollowup(state);
  const admitted = readVenueNoteFile(text, { origin: saved, state, model });
  model.replaceRecords(admitted.records);
  const identity = ({ key, date }) => JSON.stringify([key, date]);
  const stored = new Set(admitted.records.map(identity));
  const scheduled = model.entries(state).map((entry) => Object.freeze({
    ...entry, savedRecord: stored.has(identity(entry)),
  }));
  const current = new Set(scheduled.map(identity));
  const retained = admitted.records.filter((row) => !current.has(identity(row))).map((row) => {
    // Use the native model to reconstruct the record's own dated questions,
    // without moving a record or changing the saved arrangement.
    const day = calendarWeek(row.date).find((item) => item.date === row.date).day;
    const dated = setPickDay(setWeek(state, row.date), row.key, day);
    const entry = model.entries(dated).find((item) => identity(item) === identity(row));
    return Object.freeze({ ...entry, savedRecord: true,
      retainedReason: state.assignments[row.key] === null
        ? "This occurrence is kept off the displayed week."
        : "This record belongs to another date, not the displayed scheduled visit.",
    });
  });
  return Object.freeze({
    sourceName, sourceSha256, savedAt: admitted.savedAt,
    scheduled: Object.freeze(scheduled), retained: Object.freeze(retained),
    records: admitted.records.length,
    matchedRecords: scheduled.filter((entry) => entry.savedRecord).length,
    retainedRecords: retained.length,
  });
}
