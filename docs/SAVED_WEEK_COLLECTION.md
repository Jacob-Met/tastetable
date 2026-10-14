# Back up and recover the saved-week collection

The **Back up or recover saved weeks** panel works with all named weeks saved in
this browser. It complements the existing single portable-week import and the
separately owned selected-week download. It does not generate a new plan, open a
week, change venue notes, contact a provider or migrate browser storage between
origins automatically.

## Make a complete backup

1. Open the ordinary TasteTable planner on the origin where the weeks are saved.
2. Choose **Back up saved weeks (.json)**. Search, ordering and the selected
   preview do not limit this operation: it reads the complete saved collection.
3. Keep the requested `tastetable-saved-weeks-YYYY-MM-DD.json` file. A
   **Download requested** notice means the browser download was requested;
   confirm the completed file in your browser's downloads.

The backup preserves each record's name, identity, created and updated dates,
and complete original portable-week text. Its separate `savedAt` timestamp is
the backup creation time. Existing dates are not reset. Unknown fields inside
an admitted portable week, its BOM and its line endings remain in that text;
the tool does not regenerate the week. Saved responses and personal labels may
be included, so choose where to keep or share the file deliberately.

A collection can contain up to 50 records, each within the existing 512 KiB
browser-copy limit. The complete UTF-8 collection file and generated backup
must fit within 32 MiB. An empty collection is a valid backup. If any stored
record is unreadable, has a mismatched identity, or exceeds the supported
limits, the whole backup refuses. A filtered list never causes silent omission.

## Recover without replacing existing records

1. On the destination TasteTable origin, choose **Open collection backup** and
   select the file. Nothing is saved by opening it.
2. Review every name, ID, original date and week in the preview. Each record is
   **Missing**, **Already identical** or **Conflicting**. The preview shows
   counts for all records, even if the saved-name search would hide them.
3. If there are missing records, no conflicts, and enough capacity, choose
   **Add missing saved weeks**. Identical records are left untouched. The
   existing list refreshes after the successful addition; a retained search
   may hide newly added records.

Two copies with the same ID are identical only when all seven admitted fields
match exactly. A changed name, updated date or even a different literal
portable-text newline under that ID is a conflict. No automatic winner is
chosen. Keep both files, inspect the difference and resolve it deliberately;
this panel does not overwrite, rename, delete, evict or mint replacement IDs.
An empty or already-identical backup is an explicit no-op.

The final addition uses one IndexedDB readwrite transaction. It rereads and
compares the **whole** saved collection with the preview, then queues only the
missing records. A change in another tab, insufficient capacity, invalid
existing record or failed request aborts all additions. If that happens, open
the backup again to review the current collection; the tool never retries
automatically. If the storage transaction commits but a later list refresh
fails, the existing list reports its read failure; the committed addition is
not undone.

Cancel, a new file, an existing saved-week selection, refresh, mutation or
pagehide retires the pending collection read/preview. An explicitly started
storage transaction may still finish after pagehide; the interface does not
claim to cancel a transaction that has already been submitted. Search and
ordering alone do not change the preview's complete-collection scope.

The active planner, request lifecycle, selected saved-week preview, unfinished
rename, single-week import and venue notes remain under their existing owners.
Collection recovery does not open any recovered record. An ordinary existing
refresh can retire a selected row that no longer exists; the collection tool
does not create an extra selection or planner action.

## File and API boundary

The exact outer fields are `format`, `savedAt` and `records`:

```json
{"format":"tastetable.browser-week-collection.v1","savedAt":"2026-10-14T04:00:00.000Z","records":[]}
```

Each record has exactly the existing `format`, `version`, `id`, `name`,
`createdAt`, `updatedAt` and `text` fields. Duplicate outer or record JSON keys,
duplicate record IDs, unsupported formats and malformed records refuse before
preview. A leading file BOM is accepted. The embedded portable text keeps the
existing portable parser's admission behavior; this feature does not change
that separately owned codec.

`static/saved_week_collection.mjs` exposes `makeCollectionBackup(rows, savedAt)`,
`readCollectionBackup(text)` and `planCollectionRestore(backup, rows)`. Backup
output sorts records by ID using JavaScript string order and ends with one LF.
Incoming record order is preserved in the preview. The plan returns `expected`,
`missing`, `identical`, `conflicts`, `totalAfter` and `canApply`.

`store.restoreMissing(backup, expected)` copies supplied data before awaiting
storage access and returns `{added, alreadyPresent}` only when the transaction
completes. `expected` is a comparison token for the admitted seven fields, not
authentication. No cross-device locking or automatic synchronization is offered.

## Focused development checks

From the repository root, with Node available:

```sh
node --test tests/test_saved_week_collection.mjs tests/test_saved_week_collection_store.mjs tests/test_saved_week_collection_ui.mjs
```

The model checks complete text retention, duplicate/admission boundaries,
identity conflicts and limits. The transactional test double exercises the
actual store method, including a failed later addition and a changed collection.
The DOM double checks literal previews, explicit actions, stale reads and
download cleanup. These checks do not substitute for real IndexedDB/browser
receiving, materialized downloads, layout or the complete live planner.
