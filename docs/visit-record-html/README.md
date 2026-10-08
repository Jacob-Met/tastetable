# Saved visit-record HTML

Export one existing visit-record JSON file into a readable offline handoff:

```sh
node tools/visit_record_to_html.mjs --input "visits.json" --output "visits.html"
```

Requires Node.js 22 or newer and no installed packages. Choose an unused output filename in an existing directory. Open the resulting HTML in any browser; use its Print command to print or save a PDF. The HTML contains its styles and uses no scripts, external assets, service or connection.

The report keeps every original occurrence in its original order, including repeated venue identities, picks omitted from the saved week, and unrecorded visits. It shows the original name/ID/kind, suggested day, saved planned day and date, recorded outcome and actual date, literal note and original explanation. An actual date is never copied from the planned date. A date and outcome can remain independently recorded, including an outcome without a date.

Saved source mode and timestamps describe the input file. They do not authenticate the source or verify a visit. The report makes no new recommendation or interpretation of an outcome. Notes and other displayed values are escaped text; Unicode, spaces, tabs and line breaks are retained. This is a readable report, not a replacement backup: retain the original visit-record JSON for editing and the complete original source/trace.

The file's basename and SHA-256 appear in the report. The successful command writes a JSON receipt to stdout with the absolute input/output paths, exact input/output hashes, output bytes, number of original occurrences, saved week start, source mode and record save timestamp.

## Admission and publication

The existing visit-record and saved-week codecs validate the complete record. The command reads only an explicitly selected regular UTF-8 file, at most 8 MiB; a single initial UTF-8 BOM is accepted and included in the input hash. It preserves the codec's original source, occurrence and note limits. NUL or unpaired UTF-16 in a displayed field is refused because HTML cannot preserve it. A filename used as the displayed record name must be nonblank, no longer than 512 Unicode code points and contain no control characters.

The HTML output is limited to 32 MiB. It is written and synced in a temporary directory next to the destination, then published with a create-only hard link. Existing files, directories, symlinks and input aliases are never overwritten. Competing exporters can publish at most one completed file at a destination. Filesystems that do not support the required operation refuse safely.

`--help` alone exits 0 without reading or writing. Success exits 0. Invalid flags/input and an existing output exit 2; other filesystem or output failures exit 1. No stdin or stdout data-stream input/output is supported. An error before publication leaves an existing destination unchanged. If cleanup or delivery of the success receipt fails after publication, the command returns nonzero and reports that the complete HTML was already created, when stderr is available. Check that file before retrying with another output name.

## Native checks

```sh
node --test tests/test_visit_record_report.mjs tests/test_visit_record_to_html.mjs
```

The model tests cover native record identity, separate dates/outcomes, literal text, refusal and limits. CLI tests exercise actual child processes, raw-byte fingerprints, overwrite refusal, concurrent create-only publication and post-publication receipt failure. Physical browser/print receiving is recorded separately; a passing Node test is not a browser or PDF claim.
