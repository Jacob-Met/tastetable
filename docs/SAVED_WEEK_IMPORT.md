# Keep a portable week as a named browser copy

Use **Add a portable week to this browser** in **Saved in this browser** when
someone has shared a TasteTable saved-week JSON file and you want to keep it
without replacing the week you are currently arranging.

1. Choose the file with **Choose a portable saved-week file**.
2. Review its filename, original saved date, week, source explanation, scheduled
   suggestions and suggestions kept off the week.
3. Enter **Name for this imported browser copy**.
4. Choose **Save imported browser copy**. A success message appears after the
   browser transaction completes. The new copy is added to your saved list.

Selecting or reviewing the file saves nothing. **Cancel import** discards the
review. You can choose the same file again. A later selected file supersedes an
earlier pending read; an old read cannot restore a cancelled review.

## Your current work stays open

Importing does not open the file, replace the planner, start a recommendation
request or replace current venue notes. It does not use your active week as the
source. Your selected saved-record preview and unfinished rename remain open.
Your saved-name search is also retained, so it may hide the newly added copy.
Clear that search when you want to find the new name.

Opening a saved copy remains the separate existing **Open browser copy** action.
Use it only when you want the planner to restore that saved week. The separate
portable-file and caregiver-handoff opening controls retain their own behavior.
This import does not include a venue-note companion or add a Download action.

## What the browser copy retains

The file must use the existing `tastetable.saved-week.v1` format. The unchanged
portable-file reader validates the original response, inputs and arrangement;
the unchanged browser-record validator applies its existing identity, name,
date and payload rules. This does not introduce another schema or repair an
unsupported file. Saved recommendation and constraint-check results are retained;
importing does not request fresh recommendations or rerun those original venue
checks.

The selected file must be valid UTF-8 and at most **512 KiB (524,288 bytes)**.
A supported UTF-8 BOM is retained. The admitted decoded text is stored exactly,
including whitespace, key order and admitted unknown JSON data. It is not
regenerated through the portable-file writer. This is a decoded-text guarantee,
not a promise to preserve arbitrary original file encodings. The inherited
JSON parser's behavior remains unchanged, including its current treatment of
repeated JSON keys; this feature does not provide duplicate-key validation.

The browser wrapper receives a fresh identity and your explicit name. Names
use the existing rule: nonblank, at most 120 UTF-16 code units before trimming,
and no control characters. Surrounding whitespace is trimmed; other content
is retained. The filename is displayed for review, but is never silently used
as the saved name.

Both wrapper dates retain the file's **original `savedAt`**. The saved list
therefore sorts and displays the original saved date, not the time you imported
it. The import does not renew the response's age or confirm its source or venue
details. The ordinary source labels still distinguish fictional demo data,
saved provider responses and unspecified origins.

## Explicit storage and retry behavior

Only the explicit Save gesture starts a storage mutation. It captures that
reviewed text, wrapper identity and name before awaiting the existing
`store.save` transaction. The store adds a new record; it never replaces an
existing ID, evicts a record or rewrites a cached whole collection. Its existing
50-record limit includes unreadable records. An unavailable library, full
capacity, duplicate identity, quota error or aborted transaction reports a
failure through the existing store.

If saving fails, the review and entered name remain available for correction
or retry. No success is shown. After a successful transaction, the import
review clears and the collection refreshes. A later refresh failure is shown
separately; it does not roll back the already committed browser copy.

File, name, Save and Cancel controls are disabled while a collection mutation
is in progress. Leaving the page retires the import review, including pending
file reads. A page restored from browser history requires a new selection.
An IndexedDB transaction already started by an explicit Save can still commit
after the page is hidden. Retiring the interface does not cancel that commit;
refresh the saved list to inspect it before retrying. There is no automatic
retry or deletion.

Browser storage belongs to this site and browser profile. Clearing site data
removes its saved copies. Nothing here uploads the selected file, changes the
source file, synchronizes browsers or replaces a portable backup.

## Maintained source and focused checks

`static/saved_week_import.mjs` exports
`createImportedDraft({ text, name, id })`. Omitting `id` uses a fresh browser
UUID. It applies the original codec and record validator, keeps the exact text
and original saved date, and returns a canonical wrapper without writing it.
The narrow UI additions use this helper and the unchanged store.

From a repository checkout with Node available:

```sh
node --test tests/test_saved_week_import.mjs
```

The six focused tests exercise wrapper text/date/name semantics and refusal,
then the actual UI handlers with controlled element and store objects. They
cover same-file retry, cancel, newer-file precedence, pagehide retirement,
gesture-captured Save, selected-preview/rename/search preservation and a
retryable transaction failure. They are not browser, IndexedDB, layout,
keyboard or operating-system file-chooser qualification. Any actual browser
receiving is recorded separately with its exact source and environment.

The existing codec, collection model/store, app request lifecycle, planner,
venue notes and selected-copy Download reservation remain separate scopes.
