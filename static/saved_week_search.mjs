/** Search display names only; rows and their store order remain untouched. */
export function filterSavedWeekRows(rows, query) {
  const normalize = (text) => text.trim().replace(/\s+/g, " ").toLowerCase();
  const needle = normalize(query);
  return rows.filter((row) => !needle || normalize(row.draft
    ? row.draft.name : (row.label || "Unreadable saved record")).includes(needle));
}
