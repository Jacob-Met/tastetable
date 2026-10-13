# Find a saved week by name

In **Saved in this browser**, type in **Search saved names** to narrow the list.
The count shows matching records out of all records returned by the saved-week
store, including unreadable records. **Clear search** restores the full list and
focuses the search field. No matches is different from having no saved weeks.

Search uses the visible saved name, or the visible label of an unreadable record.
It ignores letter case and treats runs of whitespace as one space. It matches
literal text: brackets, asterisks and other punctuation have no special meaning.
Accents remain distinct. It does not search venue names, dates or saved content.
An empty or whitespace-only search shows every record in its original order.

Your selected preview remains open even if its name is filtered out. Its open,
rename and remove controls still refer to that visible preview. Search does not
clear a name you are typing into the rename field or cancel an explicit preview
that is being read. After a rename, the updated record may leave the filtered
list while its preview stays available. Read the preview title before acting.

Refresh, save, rename and remove retain the search text and filter the returned
list again. If the store cannot be read, the existing read error stays visible
and search is unavailable until a successful refresh. A failed read does not
mean the collection is empty. Search is also unavailable during a mutation.

Filtering uses already loaded names and rendered rows. Typing and clearing do
not read or write storage, parse saved plan payloads again, refresh suggestions,
or contact providers. Search text is transient page state; it is not saved in
browser storage or in a downloaded week. Existing storage limits, saved formats,
preview admission and explicit mutation behavior remain unchanged.

## Focused development check

```sh
node --test tests/test_saved_week_search.mjs
```

The pure matcher checks literal matching, case/whitespace normalization, unreadable
labels, unchanged row identity/order and name-only scope. Real browser interaction
and native IndexedDB receiving are separate qualifications; passing this command
alone does not establish them.
