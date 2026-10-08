# Keep a visit record

Open **Visit record (new tab)** in the TasteTable planner. Start with the JSON produced by **Save week** in the planner or offline studio. The visit-record page also reopens its own downloaded JSON files.

1. Choose **Open saved week** or **Reopen visit record**.
2. Review the source label, planned week and number of original picks. Selecting a file only previews it.
3. Choose **Use this file** to replace the record in this tab. Cancel keeps the current edits.
4. For each original occurrence, choose **Unrecorded**, **Went** or **Did not go**. An optional visit or decision date can be outside the planned week. Notes and dates never infer attendance.
5. **Download visit record** before leaving. **Print record** makes a readable copy; the JSON is the file that can be reopened.
6. **Download CSV** makes a tabular report of the current valid record. It includes every original occurrence, even omitted or unrecorded picks, and keeps planned dates separate from entered actual dates. Import spreadsheet columns as text to preserve literal values. CSV cannot be reopened here; keep the JSON for editing.

Repeated venue names and IDs remain separate occurrences, including picks omitted from the saved schedule. Planned dates and original explanations are displayed beside the new entries. Original source mode, inputs and saved timestamps stay visible. No checks or recommendations are rerun.

This is a local caregiver record, not a safety check, reservation or medical or dietary recommendation. Files can contain the original inputs and notes. Do not include private health information. There is no automatic storage or upload, and changes do not modify the saved week, venue call sheet, calendar or future recommendations.

## File and model contract

The unchanged shared `readWeekFile` codec admits the original source. Its entire decoded source string is retained verbatim, including a UTF-8 BOM, CRLF, unknown metadata, JSON whitespace and escaped values. The file picker uses strict UTF-8 decoding with BOM retention. The displayed filename is provenance supplied by the file picker; it is not a verified identity.

A record has exactly `{source:{name,weekText},visits:[{key,outcome,date,note}]}`. Every native `pick-N` appears once. Valid reordered entries are canonicalized to native original order. No name or entity-ID matching merges entries.

Exported JSON has exactly `{format:"tastetable.visit-record.v1",savedAt,source,visits}`. The saved timestamp records the explicit export time, not a visit date. The filename includes the original planned week. The original saved-week text remains a string inside this separate envelope.

- Original source: at most 2 MiB of UTF-8 and 100 original picks.
- Complete visit-record file: at most 8 MiB of UTF-8.
- Source name: nonblank, at most 512 Unicode code points; leading/trailing whitespace is preserved. C0 controls and DEL are refused.
- Note: at most 4,000 Unicode code points. Whitespace, TAB, LF, CR and CRLF are literal. Other C0 controls, DEL and lone UTF-16 surrogates are refused. Name/source strings must also be well-formed Unicode.
- Date: null or a real Gregorian `YYYY-MM-DD`, years 0001–9999. No timezone conversion or copying from the schedule is performed.
- Outcomes: only `unrecorded`, `went`, `did_not_go`. The initial state has no date or note.
- Record objects must have their documented field sets. Missing or extra fields, missing occurrences, and repeated or unknown occurrence keys are refused. Repeated JSON object member names follow JSON.parse behavior (the last value is used) before field-set validation. All public operations validate the complete input and return immutable records/projections without mutating their input.

The browser may display imported CR or CRLF as normalized textarea line breaks. The original admitted note remains in model state until that specific note is edited. Changing outcome or date, rendering, printing and saving do not read the textarea back. Once the note itself is edited, its displayed value becomes the explicit new note.

An invalid date or note draft blocks JSON, CSV and Print until corrected. New file selections, cancellation and current edits retire pending reads and previews, so a stale completion cannot replace the current record. A valid preview still requires **Use**.

### Public JavaScript API

Import from `static/visit_record.mjs`:

| Function | Result |
| --- | --- |
| `createVisitRecord(weekText, sourceName)` | New unrecorded immutable record |
| `updateVisitRecord(record, occurrenceKey, patch)` | Immutable record; patch accepts only outcome/date/note |
| `visitRecordRows(record)` | Immutable rows in original order |
| `makeVisitRecordFile(record, now = new Date())` | `{filename,text}` |
| `readVisitRecord(text)` | `{record,savedAt}` |

Each row is exactly `{key,originalDay,plannedDay,plannedDate,pick,outcome,date,note}`. The complete native original pick is preserved in `pick`, including its name, explanation and opaque extra fields. Planned day/date are null for omitted picks. The save timestamp is a finite canonical Date ISO string, including extended ISO years where supported; visit dates remain four-digit Gregorian years.

## Run the checks

No new runtime dependencies are required.

```sh
node --test tests/test_visit_record.mjs
```

The authored native-browser check uses the preserved original producer fixture described in the qualification packet: the 2026-10-12 five-pick offline week with pick-0 on Sunday and pick-1 omitted. It verifies physical downloads, explicit Use/reopen, invalid/cancel preservation, narrow layout and native print. It requires an existing Chromium and a browser-readable workspace; Snap Chromium needs a location inside its permitted common directory.

```sh
node tools/check_visit_record_browser.mjs \
  --browser /path/to/chromium \
  --browser-workdir /browser-readable/directory \
  --week /path/to/original-saved-week.json \
  --output /new/evidence/directory
```

The browser runner retains physical downloaded files, PNG screenshots, a PDF, exact source hashes and an exit-bound receipt. It closes its owned browser and removes only its owned profile. Qualification also includes independently sealed public-API and browser oracles, the original unchanged-codec baseline and exact evidence of the integration source.

## CSV report from this tab

The browser uses the same `renderVisitRecordCsv` renderer as the [native CSV command](../VISIT_RECORD_CSV.md), after the unchanged JSON serializer validates the complete current model. `record_saved_at` records the explicit CSV export time, not the timestamp of an earlier opened file or a visit date. An untouched imported note retains its exact CR/LF/CRLF characters through unrelated date or outcome edits. Export never harvests values from untouched textareas.

CSV contains quoted UTF-8 fields with CRLF row terminators. It retains source labels, opaque occurrence and venue identifiers, original explanations and literal notes without inferred attendance or new venue checks. A record with no original picks produces the header only. Downloading retires a pending file preview or read and exports the record already accepted in the tab. It does not replace that record, upload data or save automatically.

A focused actual-browser receiver exercises physical CSV and JSON downloads, invalid drafts, pending replacement retirement, literal notes and narrow controls:

```sh
node tools/check_visit_record_csv_browser.mjs \
  --browser /path/to/chromium \
  --browser-workdir /browser-readable/directory \
  --output /new/evidence/directory
```
