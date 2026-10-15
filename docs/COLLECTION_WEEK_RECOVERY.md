# Recover one saved week from a collection backup

Use this local command when you have a TasteTable collection-backup JSON and
want one portable saved-week file. You can list the backup, choose its stable
record ID, and recover the original stored text to a new filename. You do not
need to restore the entire collection into browser storage or resolve unrelated
browser conflicts first.

The command requires **Node.js 18 or later**, with no npm dependencies. Run it
from the repository root, keeping `tools/collection_week.mjs` beside the existing
`static/` codec modules. It reads an explicitly named local backup and makes no
network, provider, browser or IndexedDB calls.

## List the backup and choose a record

```bash
node tools/collection_week.mjs --input collection-backup.json
```

The JSON listing contains the backup's `savedAt`, record count, and each record's
exact `id`, `name`, `createdAt` and `updatedAt`. It preserves the order in the
backup; it does not sort records, rename them or infer which version you want.
An empty valid backup produces a listing with no records.

Copy the **exact ID** of the desired record. Names can repeat, so selection uses
the ID rather than the display name or a row number. For example, if your listing
contains the fictional ID `saved-week-zeta`, use:

```bash
node tools/collection_week.mjs --input collection-backup.json --id saved-week-zeta --output recovered-week.json
```

Choose an unused output filename in an existing directory. The tool refuses an
existing file, directory, symlink or hard link; it also refuses an output that
appears while recovery is in progress. It never replaces that entry or changes
the backup. Filesystems must support a same-directory hard link: a completed
private staging file is closed before its final name is admitted.

After success, open the recovered JSON through TasteTable's existing saved-week
file-opening flow. The saved arrangement and retained source information come
from that file. Recovery does not regenerate suggestions, recheck venues,
authenticate stored claims or change your current browser plan by itself.

## What is preserved

The recovered UTF-8 bytes represent the selected record's **stored text** exactly.
No newline is added. A stored BOM, CRLF, whitespace, JSON key order and unknown
portable fields accepted by the existing reader remain intact, along with the
original dates, calendar identity and source labels. The command does not call
the week writer to rebuild an equivalent-looking document.

This is a handoff of the JavaScript string retained inside the backup. It does
not prove the bytes of a file before it was originally imported into browser
storage. A raw unpaired UTF-16 surrogate in the selected stored text is refused
because UTF-8 encoding would replace it. Valid paired surrogates are preserved.
Literal ASCII JSON escape sequences such as `\uD800` remain literal characters
in the stored text and are governed by the existing portable-file reader; they
are not mistaken for raw surrogate code units in the text being written.

The tool validates the **complete collection**, including records you did not
select, using the unchanged collection reader. An invalid unrelated record,
duplicate identity, duplicate outer JSON field, inconsistent date, unsupported
format or invalid saved-week arrangement prevents extraction. There is no
partial salvage mode that skips broken records.

## Listing and extraction receipts

Listing writes a JSON object with format `tastetable.collection-index.v1`:

```json
{
  "format": "tastetable.collection-index.v1",
  "savedAt": "2026-10-15T00:00:00.000Z",
  "count": 0,
  "records": []
}
```

Extraction writes a JSON receipt with format
`tastetable.collection-week-recovery.v1`, the absolute input/output paths, exact
backup-byte SHA256, recovered UTF-8 byte count and SHA256, and the selected
record's unchanged ID/name/dates. The receipt appears only after final publication
and normal staging cleanup. It contains the explicit paths you supplied; keep
that in mind if you share it.

Successful output uses two-space JSON indentation and a final LF. The recovered
week itself uses its original stored text, independently of receipt formatting.

## Limits and refusal behavior

The input must be a completed ordinary regular UTF-8 file of at most **32 MiB**.
Direct symlinks, directories, nonregular files, invalid UTF-8, stdin and compressed
inputs are refused. The native collection rules additionally allow at most
**50 records**, at most **512 KiB per saved record**, and require the canonical
complete collection to fit the same 32 MiB bound. An optional UTF-8 BOM is allowed.

The tool reads one bounded file descriptor and checks its identity, size and
modification/change timestamps before and after. Use a completed backup that
nobody is rewriting. These checks do not promise an atomic snapshot against a
concurrent same-metadata rewrite. The nonblocking open prevents waiting on a
FIFO swapped into the pathname before open; it does not broaden the input types.

Use separate option/value tokens. `--input=x`, unknown or repeated options,
missing values and positional arguments are refused. `--id` and `--output` must
be supplied together. The sole `--help` option displays usage. Input/output `-`
is not a stream shortcut. A path beginning with `--` can be made explicit, for
example `./--backup.json`.

| Exit status | Meaning |
| --- | --- |
| 0 | Help, listing or extraction and its receipt completed successfully. |
| 2 | Arguments, input/native validation, absent ID, selected-text encoding or occupied output were refused. |
| 1 | Other publication, staging cleanup or stdout delivery failed. |

Diagnostics go to stderr. A failure before the final link does not create the
final file. A cleanup or receipt failure **after** publication leaves the complete
recovered file present and returns 1. Its diagnostic says **Recovered week was
created** and names the final path. Inspect that file before choosing a new output;
do not treat the error as proof that nothing was written. A broken stdout can
leave a partial receipt, and broken stderr can prevent the diagnostic itself.
Neither changes the nonzero outcome or removes the recovered file.

Owned staging cleanup is attempted on both success and failure. If a substantive
error and cleanup error occur together, the diagnostic retains the original
failure and adds cleanup context. A failed cleanup can leave a private staging
directory; the final output and pre-existing entries are never deleted as repair.

## Tests and API use

Run the focused self-contained test module from the repository root:

```bash
node --test tests/test_collection_week.mjs
```

The four methods cover full native admission/listing, exact stored-text selection,
create-only publication and failure boundaries, and four bounded real CLI cases.
They use fictional local backups. They do not open the browser, change saved
browser copies, call a provider or rerun a broader application matrix. The optional
`TASTETABLE_COLLECTION_RECOVERY_ARTIFACT_DIR` must name a new directory; it retains
the CLI fixture, observed listing/recovered week/receipts and child logs for review.

The tool exports `describeCollection(text)`, `selectStoredWeek(text, id)`,
`writeNew(filename, text, { fs, onPublished })` and asynchronous
`main(argv, { fs, write })`. Omitted options use the normal Node standard library.
Importing it does not run the CLI. The first two functions are pure and validate
the complete native backup. `writeNew` performs the same create-only publication;
its optional callback reports that the final link exists before cleanup. That
callback cannot revoke publication. The optional fs/write objects support focused
fault tests rather than a separate production I/O implementation.

For the existing browser backup and whole-collection restore flow, see
[Saved-week collection backup](SAVED_WEEK_COLLECTION.md). That flow and the
selected-copy browser Download action retain their own controls and ownership.
This command recovers one record from an already retained backup file.
