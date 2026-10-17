# Read a saved collection without restoring browser storage

Use this command when you have a TasteTable saved-week collection backup and
want one readable view of all its named copies. The report keeps the backup's
record order, every scheduled or omitted occurrence, and the saved source labels.
It does not restore the collection or change the current planner.

```sh
node tools/collection_backup_report.mjs --input saved-weeks.json --output collection.html
```

Open `collection.html` in a browser. The linked index jumps to one named copy;
names may repeat, so record numbers and stored IDs remain visible. Each section
shows its seven planned dates and the complete original suggestion objects.
Omitted suggestions appear separately. Closed **Stored portable-week text**
disclosures retain the entire saved string for detailed inspection.

Text values use JSON notation. Quotes and escape sequences make newlines,
controls and unusual Unicode units visible as data. `<script>`-looking names
are never interpreted as page markup. A source's explanation or saved `live`
flag is historical information, not a new venue check or recommendation.

## Keep the original backup

**Download original collection backup** contains every byte of the supplied
UTF-8 backup, including its BOM, line endings, whitespace and JSON key order.
It is the full backup even when you are reading just one section. Treat the
report and its embedded backup as containing the same private planning data.
The report does not add a download of a newly serialized equivalent file.

For one editable portable-week file, use the maintained
[collection recovery command](COLLECTION_WEEK_RECOVERY.md). To compare two
backups, use [collection comparison](COLLECTION_BACKUP_COMPARISON.md). Browser
backup and recovery remain in [Saved-week collection](SAVED_WEEK_COLLECTION.md).

## Runtime and file behavior

Node.js 18 or later is required to create a report; no npm installation is needed.
Keep the tool in its repository layout beside `collection_week.mjs` and the
existing `static/` modules. The caller's working directory may be elsewhere.
The generated HTML needs no Node runtime, server or network connection to read.
It has no scripts or external resources. The only file operation initiated by
the page itself is the reader's explicit original-backup download.

Use a new output filename in an existing directory. The maintained writer closes
a private same-directory staging file before publishing it with a create-only
hard link. Existing files, directories and symlinks are not replaced. Filesystem
hard-link support is required. The source backup remains unchanged.

`--input` and `--output` each take one separate argument and must appear exactly
once. Unknown, repeated, missing and positional arguments are refused. `-` does
not mean stdin/stdout. Spell paths beginning with `--` as, for example,
`./--saved-weeks.json`. The sole `--help` option performs no input read.

The input must be a completed regular UTF-8 file, at most 32 MiB. Direct symlinks,
directories and other nonregular files are refused. The inherited reader checks
the open descriptor's identity, size and modification/change timestamps around
one bounded read; this is not an atomic lock against a concurrent writer.

The unchanged collection codec admits all records before output: at most 50
distinct saved IDs and 512 KiB per stored record, valid source dates and native
saved-week arrangements, supported format and duplicate outer-key checks. An
invalid record anywhere refuses the entire report. A valid empty collection
produces an explicit empty state and its complete original download.

The complete HTML must fit 64 MiB, including escaped text and the embedded
download. Some otherwise valid collections expand beyond this limit and are
refused before publication. No record, field or download is clipped to fit.

## Receipt and failures

Success writes a JSON receipt with schema `tastetable.collection-report.v1`,
absolute input/output paths, complete byte counts/SHA256 and the record count.
Receipt paths describe the local command and are not embedded into the HTML.
Identical original backup bytes produce identical report bytes.

Exit 0 means the full output and receipt completed. Exit 2 means argument,
input/native admission, HTML size or occupied-destination refusal before
publication. Exit 1 covers other publication/cleanup/reporting errors and every
failure after publication. A late failure can leave the complete new report at
the requested path; its diagnostic says it was created. Inspect it before
choosing another name. The command does not delete it, retry or choose a fallback.
Broken stderr may prevent a diagnostic but cannot turn failure into success.

## API and verification

`renderCollectionBackup(text)` returns the complete HTML string without file
access. Its string must round-trip through UTF-8 exactly; raw unpaired surrogate
units are refused instead of being replaced. Ordinary ASCII JSON escape sequences
remain unchanged. Importing the module does not invoke its CLI.

`main(argv, {fs, write})` returns the documented exit code. Optional fs/write
objects are focused fault-test seams; normal invocation uses the Node standard
library and the maintained file reader/publisher.

```sh
node --test tests/test_collection_backup_report.mjs
```

All six focused groups passed on the first controlled course with no skips.
They checked complete independent inventories/downloads, native admission, the
50-record boundary and 64 MiB refusal, an actual CLI from another directory, and
publication/receipt failures. The separately retained fictional CLI example is
pending. Browser, assistive-technology and physical print acceptance remain
separate from generated source/string checks.
