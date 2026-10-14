/** Compare two already-admitted note sets from the same accepted plan.
 * This is a read-only projection, never file admission or a replacement policy.
 */
export const NOTE_FIELDS = Object.freeze(["status", "question", "reply", "replyQuestions", "nextStep"]);

function indexRecords(records) {
  if (!Array.isArray(records)) throw new TypeError("Expected admitted venue-note records.");
  const result = new Map();
  for (const row of records) {
    if (!row || typeof row.key !== "string" || typeof row.date !== "string" || !row.note
        || !NOTE_FIELDS.every((field) => Object.hasOwn(row.note, field)
          && (typeof row.note[field] === "string"
            || (["question", "replyQuestions"].includes(field) && row.note[field] === null)))) {
      throw new TypeError("Expected complete admitted venue-note records.");
    }
    const identity = JSON.stringify([row.key, row.date]);
    if (result.has(identity)) throw new TypeError("Repeated venue-note occurrence and date.");
    result.set(identity, Object.freeze({ key: row.key, date: row.date,
      note: Object.freeze(Object.fromEntries(NOTE_FIELDS.map((field) => [field, row.note[field]]))) }));
  }
  return result;
}

/** Current order first, then genuinely new incoming identities in file order. */
export function compareVenueNotes(currentRecords, incomingRecords) {
  const current = indexRecords(currentRecords), incoming = indexRecords(incomingRecords);
  const counts = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  const records = [];
  for (const identity of new Set([...current.keys(), ...incoming.keys()])) {
    const before = current.get(identity), after = incoming.get(identity), row = before || after;
    const changedFields = before && after
      ? NOTE_FIELDS.filter((field) => before.note[field] !== after.note[field]) : [];
    const change = !before ? "added" : !after ? "removed" : changedFields.length ? "changed" : "unchanged";
    counts[change] += 1;
    records.push(Object.freeze({ key: row.key, date: row.date, change,
      changedFields: Object.freeze(changedFields), before: before?.note ?? null, after: after?.note ?? null }));
  }
  return Object.freeze({ currentCount: current.size, incomingCount: incoming.size,
    counts: Object.freeze(counts), records: Object.freeze(records) });
}
