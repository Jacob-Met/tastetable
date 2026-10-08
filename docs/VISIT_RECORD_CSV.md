# Export recorded visits to CSV

Use a saved **TasteTable visit record** from the separate Visit record page. This
command reports the recorded outcomes and notes without opening the planner,
requesting recommendations or changing the JSON file.

From a checkout, with Node.js 22 or later:

```sh
node tools/visit_record_to_csv.mjs --input visits.json --output visits.csv
```

The output parent directory must already exist, and the destination filename
must be unused. Quote filenames containing spaces. Use explicit files rather
than stdin or stdout. The command writes a small JSON receipt to stdout after
publishing the CSV, including SHA-256 hashes of the exact input and output bytes,
the row count, displayed week, saved source label and visit-record timestamp.

The CSV contains every original occurrence in original pick order, including
picks omitted from the arranged week and visits still marked `unrecorded`.
Repeated venue names or entity IDs remain separate occurrences. A valid empty
record produces the header alone and a receipt with zero rows.

| Column | Meaning |
| --- | --- |
| source_name | Exact saved source name |
| week_start | Monday of the arranged saved week |
| source_mode | Saved source label: mock, live or unknown |
| source_received_at | Original response's received timestamp |
| source_saved_at | Saved week's timestamp |
| record_saved_at | Visit record's saved timestamp |
| occurrence_key | Original occurrence key, such as pick-0 |
| venue_name | Original venue name |
| entity_id | Original source entity identifier, unchanged |
| kind | Original restaurant or outing kind |
| original_day | Originally suggested weekday |
| planned_day | Arranged weekday, or empty when omitted |
| planned_date | Arranged calendar date, or empty when omitted |
| outcome | Explicit unrecorded, went or did_not_go |
| actual_date | Explicit actual date, or empty when not recorded |
| note | Exact recorded visit note |
| original_explanation | Original saved explanation for the suggestion |

Planned dates never imply attendance. A recorded date or note does not turn an
unrecorded visit into a completed one. Explicit actual dates outside the saved
week remain as recorded. Saved source labels and timestamps do not authenticate
venue information, refresh checks, or establish that an outing occurred.

The file is UTF-8 without a byte order mark. It has comma separators, CRLF record
endings and quoted fields; embedded quotes are doubled. Spaces, tabs, Unicode,
commas and CR/LF within text fields remain exact. Import all columns as **text**
in a spreadsheet to preserve identifiers, date text and literal notes, including
text beginning with an equals sign. CSV quoting does not control a spreadsheet's
formula evaluation or type inference.

Keep the original visit-record JSON to reopen and edit the record. This CSV is a
tabular report, not a backup or TasteTable import format: the complete source
week, tool trace, constraints and additional source properties remain in JSON.

Input must be a completed regular UTF-8 file of at most 8 MiB. Admission reuses
the existing visit-record and saved-week codecs, including the 100-occurrence
limit. Inherited source text that cannot be represented faithfully in UTF-8 is
refused rather than silently replaced. The CSV is limited to 32 MiB.

Invalid inputs and existing destinations refuse without replacing an output.
The exporter completes a private file in the destination directory, then uses a
create-only hard link to publish it. A concurrent creator wins without being
overwritten. Filesystems must support that operation. Do not modify the input
during export; a completed-file contract does not provide a filesystem snapshot
of a concurrent writer. The receipt identifies exactly the bytes read.

Exit 0 means the complete CSV and receipt were delivered. Exit 2 means invalid
arguments, invalid input or an already occupied output name; other I/O failures
return 1. If final cleanup or stdout fails after publication, the diagnostic
states that the CSV was created. Inspect that destination before retrying, using
another filename only when appropriate. No live saved data or provider account
is accessed by the tests.

Run the focused maintained checks with:

```sh
node --test tests/test_visit_record_csv.mjs tests/test_visit_record_to_csv.mjs
```

The ordinary saved-week-comparison CI workflow also discovers these tests.
