# A shared reading view for separate saved weeks

A caregiver can put explicitly selected, same-week TasteTable files into one printable day-by-day roster. The original plans remain separate sources. Every occurrence carries its source number, filename label, saved constraints and original explanation; suggestions kept off a week remain visible below the seven dates.

## Create the roster

Use an existing Node.js 18+ installation from the repository root. No npm dependencies or server are required:

```sh
node tools/saved_weeks_to_roster.mjs \
  --input ./week-bundle/profiles/001/saved-week.json \
  --input ./week-bundle/profiles/002/saved-week.json \
  --output ./caregiver-roster.html
```

These inputs can come from the [native multi-profile bundle](NATIVE_PLAN_BATCH.md) or from **Save week** in the regular app. Extract a bundle first, then explicitly select its successful saved-week files. This command does not scan folders or silently include every profile in a bundle.

Repeat `--input` in the desired order, one through twenty times. Each input must be a completed regular UTF-8 saved-week v1 file, at most 4 MiB, with at most 16 MiB of captured input bytes overall. The canonical saved-week reader validates every file. All sources must identify the same Monday–Sunday week, including sources with no scheduled picks. A mismatch refuses the whole roster; it does not shift dates or leave a partial roster. A BOM is accepted. Rendered HTML is limited to 32 MiB.

The `--output` option appears once. Its parent directory must exist and its filename must be unused. Existing files, directories, hard-link aliases and dangling symlinks are never replaced. The writer completes and closes a temporary file beside the destination, then publishes with a create-only hard link. Competing writers cannot overwrite the winner. This requires a filesystem that supports hard links; a refusal does not fall back to a weaker overwrite operation.

## Read and print

Open the resulting HTML in a browser, then use the browser's **Print** command or **Save as PDF**. The file includes its styles and works offline without scripts, remote assets or automatic network requests. No calendar or account is written.

The day sections keep source order, then the original occurrence order within each source. The separate source records preserve each file's constraints, tastes, city, source-mode label, original received and saved-copy timestamps, original plan notes, and original rejected-candidate reasons. A SHA-256 fingerprint identifies the exact bytes captured for each input; the JSON receipt on stdout also includes each absolute input path and per-source counts.

Source numbers and filenames are labels, not person identities. Equal filenames, repeated paths, identical bytes and repeated venues remain separate entries. Counts are **occurrences**, not unique people or coordinated visits. The roster does not merge constraints, recommend shared venues, determine who attends together, or change anyone's arrangement. Keep the original JSON files to reopen and edit individual weeks; the HTML is a reading copy, not a saved-week import file.

All timestamps are copied from their sources, not replaced with a roster-generation timestamp. Mock, live and unknown labels remain per source; the labels are not newly authenticated. This operation reruns no provider or venue checks. Saved suggestions are not bookings or verified availability. Visit-only venue worksheet questions and replies are outside saved-week v1 and are not included. The complete comparison and tool trace remain in the original JSON.

Displayed text stays literal, including markup, Unicode, newlines and carriage returns. A displayed NUL or unpaired UTF-16 surrogate is refused because HTML cannot preserve it faithfully.

## Outcomes

| Exit | Meaning |
| --- | --- |
| `0` | A complete roster was created and its JSON receipt was delivered to stdout, or `--help` succeeded. |
| `2` | Arguments, input files, week agreement, text/size limits or an occupied destination were refused. No new roster was published. |
| `1` | Output staging, publication, cleanup or receipt delivery failed. |

If an error says **HTML roster was created**, the completed file already exists and final cleanup or receipt delivery failed afterward. Inspect that file before retrying. Choose a new output filename for another export; the command will refuse the existing one.

## Native checks

```sh
node --test tests/test_week_roster.mjs tests/test_saved_weeks_to_roster.mjs
node --test tests/test_week_file.mjs tests/test_week_plan.mjs tests/test_week_report.mjs
```

The tests exercise actual subprocess exports, separate source context, repeated inputs, date boundaries, text admission, byte limits, input preservation, competing writers and failures before and after publication. They use synthetic saved data and make no provider calls.
