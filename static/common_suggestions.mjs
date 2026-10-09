/** Common literal suggestion identities across independently admitted saved weeks. */
import {readWeekFile} from "./week_file.mjs";
import {savedWeekVisits} from "./week_compare.mjs";

const encoder = new TextEncoder();
const MAX_BYTES = 2 * 1024 * 1024;
function requireValue(condition, message) {
  if (!condition) throw new TypeError(message);
}

/** Shared admission for one UI slot; the comparison still revalidates every text. */
export function readSuggestionSource(entry) {
  requireValue(entry !== null && typeof entry === "object" && !Array.isArray(entry),
    "Each source must supply a label and saved-week text.");
  requireValue(typeof entry.label === "string", "A source label must be a string.");
  requireValue(entry.label.length <= 1024 && encoder.encode(entry.label).length <= 1024,
    "A source label exceeds 1024 UTF-8 bytes.");
  requireValue(typeof entry.text === "string", "A saved week must be text.");
  requireValue(entry.text.length <= MAX_BYTES && encoder.encode(entry.text).length <= MAX_BYTES,
    "A saved week exceeds 2 MiB of UTF-8 text.");
  const snapshot = readWeekFile(entry.text);
  requireValue(snapshot.state.picks.length <= 500,
    "A saved week exceeds this comparison's 500 original-pick limit.");
  return {label: entry.label, snapshot};
}

export function compareSavedSuggestions(entries) {
  requireValue(Array.isArray(entries) && entries.length >= 2 && entries.length <= 6,
    "Choose between two and six saved weeks.");
  const sources = [];
  for (let index = 0; index < entries.length; index += 1) {
    requireValue(Object.hasOwn(entries, index), "Every source position must be present.");
    const {label, snapshot} = readSuggestionSource(entries[index]);
    sources.push({index, label, snapshot});
  }
  const groups = sources.map(({snapshot}) => {
    const byIdentity = new Map();
    for (const visit of savedWeekVisits(snapshot)) {
      const identity = JSON.stringify([visit.pick.kind, visit.pick.entity_id]);
      if (!byIdentity.has(identity)) byIdentity.set(identity, []);
      byIdentity.get(identity).push(visit);
    }
    return byIdentity;
  });
  const matches = [];
  for (const [identity, first] of groups[0]) {
    if (!groups.every((group) => group.has(identity))) continue;
    const occurrences = [];
    for (const {index} of sources) {
      for (const visit of groups[index].get(identity)) {
        occurrences.push({
          sourceIndex: index, key: visit.key, originalDay: visit.originalDay,
          day: visit.day, date: visit.date, pick: visit.pick,
        });
      }
    }
    matches.push({
      kind: first[0].pick.kind, entityId: first[0].pick.entity_id, occurrences,
    });
  }
  return {
    format: "tastetable.common-suggestions.v1", sources, matches,
    counts: {
      sources: sources.length, commonIdentities: matches.length,
      occurrences: matches.reduce((sum, match) => sum + match.occurrences.length, 0),
    },
  };
}
