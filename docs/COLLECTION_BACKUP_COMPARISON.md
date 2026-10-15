# Compare two retained collection backups

Use this local command when two saved collection backups contain different copies
of the same record, or when you want to see which saved IDs exist in each file.
The report identifies exact field differences before you choose a copy to recover.
It leaves both input files and browser storage unchanged.

## Create a report

From the repository root, with Node.js 18 or later:

```bash
node tools/compare_collection_backups.mjs --left "first-backup.json" --right "second-backup.json" --output "collection-comparison.json"
```

No npm installation, server, account or network connection is required. Keep
`tools/collection_week.mjs` and the four native modules under `static/` in their
repository locations. The command reuses their existing input reader, collection
validation and create-only file writer.

Left and Right are the roles you choose in the command. The tool does not decide
which backup is newer, correct, authoritative or present in the browser. It does
not merge records, restore a collection, mint IDs or choose a winning copy.

Choose an unused output filename in an existing directory. The filesystem must
support a hard link within that directory. Existing files, directories, symlinks
and hard links are refused; a destination that appears during publication is not
replaced. The completed report is linked into place after its private staging
file has been fully written and closed.

## Read the comparison

The report's format is `tastetable.collection-comparison.v1`. Its `left` and
`right` summaries show each backup's original `savedAt` and record count.
`counts` gives the totals for `same`, `leftOnly`, `rightOnly` and `changed`.

Each row in `records` contains an exact `id`, a `status`, `changedFields` and the
metadata on each side. A present side contains `name`, `createdAt` and `updatedAt`;
an absent side is `null`. Names can repeat and never determine identity.

| Status | Meaning | `changedFields` |
| --- | --- | --- |
| `same` | Both files contain this ID and all compared fields are identical. | Empty. |
| `left-only` | This ID occurs only in the Left file. | Empty. |
| `right-only` | This ID occurs only in the Right file. | Empty. |
| `changed` | Both contain this ID and at least one compared field differs. | Different fields in the fixed order `name`, `createdAt`, `updatedAt`, `text`. |

Rows preserve all Left records in their admitted order, followed by Right-only
records in Right order. Every admitted ID appears exactly once. Changing record
order or the backup envelope's `savedAt` can leave every shared record `same`.
The counts obey `left.count = same + changed + leftOnly` and the corresponding
Right formula with `rightOnly`.

The `text` label means that the stored portable-week strings differ. It does not
mean their interpreted plans differ: whitespace, a BOM, CRLF, Unicode, JSON key
order or escape spelling can change the string. Comparison uses exact JavaScript
string equality, with no trimming, normalization, second interpretation or lossy
UTF-8 text hash. Native-admitted raw unpaired UTF-16 surrogate units remain
distinct. The report does not reproduce either stored text body.

The final `inputs` object records each resolved input path and the SHA256 of its
captured original file bytes. These identify the inputs to this report; they do
not authenticate a backup or choose its authority. The files are read separately,
Left then Right, so this is not an atomic snapshot of a changing pair.

## Inspect a changed week

Keep both backups. Use the existing [single-week recovery command](COLLECTION_WEEK_RECOVERY.md)
to list each file and recover the desired exact ID to two different unused paths:

```bash
node tools/collection_week.mjs --input "first-backup.json" --id EXACT_ID --output "left-week.json"
node tools/collection_week.mjs --input "second-backup.json" --id EXACT_ID --output "right-week.json"
```

Then use [Compare saved weeks](../README.md#compare-saved-arrangements) in the
full application to examine the recovered arrangements. That separate workflow
compares arrangements only when their original saved source matches; different
sources remain separately identified. Neither workflow reruns venue checks or
includes venue-note companions that are outside the saved-week collection.
Use **Open saved week** only after explicitly choosing the file you want to use.

Raw unpaired surrogate units admitted for comparison cannot be faithfully
encoded by the recovery command as UTF-8. That command refuses such selected
text. A comparison report does not promise that every admitted string can be
recovered as a byte-identical portable file.

For browser collection backup/restore rules and identity conflicts, see the
[collection guide](SAVED_WEEK_COLLECTION.md). This comparison does not inspect
current browser records or predict whether a later restore will succeed.

## Admission and command rules

Both complete backups must pass the unchanged native reader, including records
that have no interesting differences. Empty collections are valid. Invalid
envelopes, duplicate JSON fields or IDs, unsupported record fields, invalid dates,
invalid stored weeks and native size/count limits refuse the comparison.
There is no partial salvage or report for an invalid pair.

Each input must be a completed ordinary regular UTF-8 file, at most 32 MiB. The
reader retains a leading BOM, rejects malformed UTF-8 and direct symlinks, and
checks the captured descriptor's identity, size and modification metadata around
the read. Native limits additionally allow at most 50 records and 512 KiB per
stored record. These checks do not promise an atomic adversarial snapshot.

`--left`, `--right` and `--output` are required exactly once, in any order, as
separate option/value tokens. Quote paths containing spaces. Unknown, repeated,
equals-form or positional options, empty or option-like values and `-` streams
are refused. There are no aliases or end-of-options syntax. `--help` is valid
only by itself and accesses no input files.

## Receipt and failure handling

Successful output is UTF-8 JSON with two-space indentation and a final LF.
Standard output contains only a JSON receipt with format
`tastetable.collection-comparison-receipt.v1`, resolved `output`, `outputBytes`,
`outputSha256` and the four category `counts`. It does not contain the report.

| Exit | Meaning |
| --- | --- |
| `0` | Report publication and receipt delivery completed, or help was delivered. |
| `2` | Arguments, input reading, complete native admission or an occupied/competing output were refused. |
| `1` | Another creation, publication, cleanup or output-stream failure occurred. |

A failure before the final hard link creates no final report. A failure during
staging cleanup or receipt delivery after that link leaves the complete report
in place and returns `1`. Its diagnostic includes **Comparison report was created
at** and the resolved output path. Inspect that file before choosing another
output; no automatic retry, rollback or deletion of the published file occurs.
A broken stdout can leave a partial receipt, and a broken stderr can prevent the
diagnostic itself. The failure status remains nonzero.

## Public API and focused checks

`compareCollections(leftText, rightText)` is a synchronous pure comparison after
native admission of Left then Right. It returns the report without the CLI's
`inputs` field. `main(argv, {fs, write})` supplies the filesystem and checked
synchronous stream seams; defaults are Node's `fs/promises` and `writeSync`.
The adjacent recovery module additionally exports its unchanged reader as
`readCollectionInput(filename, fs)` and its error class as `CollectionInputError`.
The reader requires an explicit filesystem object and returns `{text, sha256}`;
collection-format admission remains separate.

Run the focused self-contained tests from the repository root:

```bash
node --test tests/test_collection_backup_comparison.mjs
```

The four methods cover literal classification/order, empty and exact-text/native
boundaries, inherited file/publication and stream seams, and four bounded actual
CLI children. To retain fictional child artifacts, set
`TASTETABLE_COLLECTION_COMPARISON_ARTIFACT_DIR` to a directory that does not exist.
Ordinary test discovery needs no retained workspace path or artifact variable.
This focused source course does not establish browser import, native desktop
operation, provider results or health/venue suitability.
