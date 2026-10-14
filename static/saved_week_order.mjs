/** Reorder store-owned rows for display without changing their contents. */
export function orderSavedWeekRows(rows, mode = "newest") {
  if (mode === "newest") return rows.slice();
  if (mode !== "name") throw new TypeError("Choose a supported saved-record order.");
  const normalize = (text) => text.trim().replace(/\s+/g, " ").toLowerCase();
  return rows.map((row, index) => ({ row, index, name: normalize(row.draft
    ? row.draft.name : (row.label || "Unreadable saved record")) }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.index - b.index))
    .map(({ row }) => row);
}
