# Reviewing visit history

Open **Visit history** from the planner, or open `/static/visit-history.html` on the same local TasteTable server. This separate, read-only page reviews several downloaded `tastetable.visit-record.v1` JSON files together. It does not replace the Visit record editor or change the planner.

Choose files, inspect the proposed selection, then choose **Add reviewed files**. Nothing enters the collection until that explicit action. Every file in the selection must pass the existing visit-record and saved-week readers; one refusal rejects the entire selection. Cancel, a newer selection, removal, clearing and leaving the page retire pending reads. The window never stores or uploads the collection automatically. Reloading clears it; keep the original files.

## File and occurrence identity

The view assigns a temporary `record-N` label to each admitted file. That label and its original `pick-N` occurrence identify each displayed row. A repeated venue name or entity ID never combines occurrences, within one file or across files.

An exact valid UTF-8 byte-for-byte copy is skipped, with its filename and the already included file shown in the preview. A renamed identical file is still a duplicate. A BOM, whitespace or other byte difference makes a separate snapshot, even if its decoded JSON describes the same values. All selected files are decoded with fatal UTF-8 admission and with a leading BOM retained.

Different snapshots remain separate. No saved timestamp wins and no file replaces another. A warning identifies files whose original planned-week date ranges overlap, including records with different BOMs, formatting or source contents. It does not establish that individual visits are duplicates. Counts describe **record entries**, not unique visits or verified attendance. Remove an unwanted version explicitly from this view.

The complete original week text and each literal visit note remain unchanged in memory. This page never reserializes or rewrites the source files. It does not offer a merged editable JSON format. Use the original JSON files in Visit record to edit outcomes.

## Filters and printing

The default includes every original occurrence, including omitted picks, unrecorded outcomes and undated entries. Filters can select the explicit recorded outcome; search venue/name, source, explanation or literal note text; select dated/undated entries; or restrict an inclusive date range.

A date range refers only to the **entered actual / decision date**. It does not use the scheduled date, the original week, or the file's saved timestamp. A range excludes entries without an entered date. Dates and notes do not imply attendance: an entry can remain unrecorded while containing a date. Oldest/newest ordering means the entered date, with undated entries last and equal dates in the original file/occurrence order.

Choose **Apply filters** after editing a filter. Invalid or unapplied filter controls retain the previous displayed result and visibly block printing; reset or apply valid filters to continue. Printing includes only the accepted collection and applied filters. Pending selections never appear. Printed output retains file labels, source names, recorded save timestamps, source mode, original inputs and plan notes, overlap warnings, row explanations and complete original pick data. The report can contain several versions of the same real visit.

These local records do not refresh venue checks, establish a reservation, assess dietary safety, or modify recommendations or preferences. Do not enter private health information into fictional/demo records.

## Limits

- At most 20 files per selection and 20 distinct files in the accepted collection.
- At most 8 MiB per visit-record file; the unchanged native codec additionally limits the embedded saved week to 2 MiB and 100 occurrences.
- At most 32 MiB per selection and 32 MiB of accepted original file text. Duplicate selections still count against the selection limit.
- Filenames: nonblank, valid Unicode, at most 512 code points, without control characters.
- Search: at most 512 Unicode code points. Dates must be real Gregorian dates in years 0001–9999.

No provider, backend, calendar, account or external service call is involved. This is a browser consumer of the existing record codecs; their formats and existing editor/CSV behavior are unchanged.

## Native receiving

Run the dependency-free model controls with Node 22 or newer:

```sh
node --test tests/test_visit_history.mjs
```

The browser receiver accepts explicit installed browser and Playwright dependency paths and creates its own source-bound fictional inputs, private HTTP server/profile, screenshots and PDF:

```sh
node tools/check_visit_history_browser.mjs SOURCE_DIRECTORY NEW_OUTPUT_DIRECTORY INSTALLED_CHROME PLAYWRIGHT_PACKAGE_JSON
```

It neither installs dependencies nor dispatches hosted workflows. The receiver uses physical file-input paths, with an explicitly controlled late-read fixture for asynchronous retirement checks. Source hashes, served bytes, child exit, refusal histories and independently authored receiving remain separately attributable in the evidence packet.
