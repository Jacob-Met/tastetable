# Compare two saved visit-record copies

Use this terminal command when you have two TasteTable visit-record JSON files made from the same original saved week and want a readable account of what changed.

Requires Node.js 22 or later. No npm dependencies, application server, account or provider request is needed.

```bash
node tools/compare_visit_records.mjs --before "visits earlier.json" --after "visits revised.json"
```

Choose the roles yourself. **Before** and **after** mean the two paths you supplied. The command never decides that a later saved timestamp is more authoritative, nor infers who entered a value. The labels in the report are the files' embedded original-week source names, not authenticated identities or a claim about the current input filenames.

For a text copy, choose a new destination:

```bash
node tools/compare_visit_records.mjs --before "visits earlier.json" --after "visits revised.json" > "new visit changes.txt"
```

A shell can truncate or replace a redirected destination before this command starts, even when input admission later fails. Keep both original JSON files, never redirect into either input, and use a new filename or an explicit staging path. The command itself has no output-file writer.

## What the brief shows

The brief identifies the original week, recorded source mode, original received/saved timestamps, both visit-record save timestamps and source labels. It counts all original occurrences, including off-week and unrecorded visits. Repeated venue IDs or names remain separate occurrences.

For every changed occurrence it shows its exact original key, venue name and entity ID, suggested/planned day and date, original explanation, changed fields and both complete field triples:

- **Outcome:** unrecorded, went or did_not_go.
- **Actual date:** the explicitly entered date, or null when none was entered.
- **Note:** the exact stored text, including an empty string.

These fields are independent. A planned date does not establish attendance, an entered date does not change an outcome, and clearing a field is a visible change. An actual date can lie outside the planned week. No checks are rerun and the report does not confirm a venue or update a calendar.

The number of changed occurrences is separate from field-change counts: one occurrence can change all three fields. Unchanged occurrences are counted rather than expanded in this change brief. Zero changes is stated explicitly.

Source strings are shown as quoted JSON string literals. A stored line break therefore appears as an escape such as `\n` or `\r\n`; it does not become a report heading. Quotes, backslashes and Unicode separator characters are also escaped where needed. Ordinary Unicode and emoji remain readable. This presentation preserves the distinction between composed/decomposed text and CRLF/LF notes.

## Which files can be paired

Both files must pass the existing visit-record v1 reader in full. Their embedded `source.weekText` strings must then be exactly equal, including the original BOM, whitespace, line endings, arrangement, inputs and recorded response.

The visit-record editor retains this original text when saving another version. Different record source names, file-level save timestamps or the order of a valid visits array do not prevent comparison. The native reader restores the original occurrence order.

Two semantically equivalent original weeks with different formatting are deliberately refused. Different weeks, arrangements or original evidence are not paired by venue name, entity ID or timestamp. Select two visit-record copies derived from the same exact original saved-week file. This command does not merge records, compare distinct weeks or select a newest copy.

The original JSON files remain the editable records; a change brief is not a backup.

## Admission and exit status

Supply exactly one `--before` and one `--after`, in either order. Flags and values are separate arguments. Quote paths containing spaces. The next token is the literal path even if it starts with a hyphen. A path of `-` is refused; stdin is not read.

`--help` works alone. Missing, repeated or unknown flags, positional arguments, equals syntax and a mixed help request refuse before input files are opened.

Each acquired input must be a regular file of at most 8 MiB of raw UTF-8 bytes. A BOM is accepted and counts toward the byte limit. Damaged UTF-8, malformed JSON and unsupported native records refuse. Both inputs and the complete report are prepared before success stdout. Reads are sequential and do not lock other writers or promise an atomic two-file snapshot.

| Exit | Meaning |
| --- | --- |
| 0 | Complete brief or help delivered to stdout |
| 2 | Command or input refusal; diagnostic on stderr and no success stdout |
| 1 | Output delivery or internal failure; diagnostic when possible |

An output failure can occur after part of a brief was written; a nonzero exit never establishes complete delivery.

## Native interface and verification

`static/visit_record_compare.mjs` exports `compareVisitRecords(beforeText, afterText)` and `renderVisitRecordComparisonText(beforeText, afterText)`. The comparison result is deeply frozen and contains every native original pick projection, exact before/after values, fixed-order changed-field names and counts. The renderer is the same function used by the CLI.

Maintained checks:

```bash
node --test tests/test_visit_record_compare.mjs tests/test_visit_record_compare_cli.mjs
```

The CLI test file uses disposable normal files and includes the 8 MiB boundary; allow at least 20 MiB of temporary space. It removes only its own temporary directory.

Receiving records and their actual execution boundaries belong in [the scoped evidence directory](receiving/visit-record-comparison-234cae4aee53/). In-memory source loading and controlled file-handle adapters are explicitly distinct from ordinary filesystem source/input qualification. No hosted or installed-client acceptance is implied by this guide.
