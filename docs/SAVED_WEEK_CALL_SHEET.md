# Prepare a call sheet from two saved files

Use a saved arranged week and its matching venue-note companion to prepare TasteTable's existing plain-text call sheet without opening the planner again. The command retains original source labels, visit identities, questions and reply history. It does not generate recommendations, contact a venue, check availability or update either input.

You need an existing Node.js 22 or newer runtime and this repository's native modules. No npm dependencies are required.

From the repository root:

~~~sh
node tools/saved_week_to_call_sheet.mjs \
  --input "/path/to/saved-week.json" \
  --venue-notes "/path/to/venue-notes.json" \
  --output "/path/to/new-call-sheet.txt"
~~~

Choose an unused output filename in an existing directory. Quote paths containing spaces. All three named options are required exactly once, in any order. Use standalone --help for help. There is no stdin, "-" path, positional argument, short alias, force, append or TXT-to-stdout mode.

After success, open the new TXT in a UTF-8 text editor or print it. One JSON receipt is written to stdout after publication and temporary-stage cleanup; it is separate from the TXT.

## What appears in the TXT

Output is exactly the existing venue worksheet's model.text(state), encoded as UTF-8: original explanations, scheduled dates, questions, contact statuses, replies, next steps, source description and caregiver caveats. The saved-copy label names the input basename and saved timestamp using the existing app's wording. No wrapper header, appendix, BOM or newline conversion is added.

Notes belong to an **original pick occurrence and exact scheduled date**. Repeated venue names or entity IDs remain separate suggested visits. Output follows displayed weekday order, then original pick order within that day.

Earlier-date and omitted-pick records must still pass complete admission but are excluded from this TXT. They do not become current when a pick moves. The receipt counts exclusions; the original JSON retains those records. Revised questions retain the native distinction between current questions and an earlier reply's questions. An explicitly empty question remains empty. Missing records and native null questions use the existing suggested questions.

A matching notes file with no records is valid. A week with every pick omitted refuses because no visits are scheduled.

**Keep both original JSON files.** TXT is a current-visit projection, not a backup or editable combined handoff. This command does not replace the saved-week HTML converter, its optional notes handoff, or the planner's combined-file workflow.

## Saved-file admission

The command uses unchanged readWeekFile, readVenueNoteFile and createVenueFollowup contracts. Notes must match the complete original receivedAt, calendar identity, inputs and response. Matching filenames, venue names or displayed dates are insufficient.

Every retained record is checked: known original pick, valid exact date, unique occurrence/date pair, supported fields and status, native field limits, and consistency between a reply and its associated questions. The original JSON parsing and duplicate-key semantics are retained; no alternate schema or normalization is introduced.

Only selected regular files are read. Source symlinks resolving to regular files are allowed; directories, FIFOs and other nonregular inputs refuse. Limits count raw bytes, including a BOM:

| Data | Maximum bytes |
|---|---:|
| Saved week | 4,194,304 (4 MiB) |
| Venue notes | 2,097,152 (2 MiB) |
| Rendered TXT | 33,554,432 (32 MiB) |

UTF-8 decoding is strict. The native codecs each admit one leading UTF-8 BOM; a second BOM or malformed UTF-8 refuses. UTF-16 is not converted.

After admission and rendering, both sources are read again with the same bounds and compared byte-for-byte. A change refuses before output staging. This is not a lock or transaction and cannot prevent changes after that final recheck.

## Create-only delivery

Any existing destination refuses: regular file, source path, hard-link alias, directory, symlink or dangling symlink. A destination created by another process during delivery also refuses without replacement.

After admission and source rechecking, the command creates a private temporary directory beside the requested output, writes the complete bytes, syncs and closes the staged file, then exclusively admits the final name with a same-filesystem hard link. It removes only its own staged file and directory.

There is no overwrite or post-publication rollback. If final cleanup or receipt delivery fails, a complete new TXT may already exist. The diagnostic says it was created; inspect it before retrying with another name. Cleanup failure can leave the private stage. Parent-directory fsync and durability through a machine failure are not promised.

## Success receipt

The one-line JSON object has format "tastetable.venue-call-sheet.v1":

| Field | Meaning |
|---|---|
| input, venueNotes, output | Absolute selected paths |
| inputSha256, venueNotesSha256 | SHA256 of exact original bytes, including any BOM |
| outputSha256, outputBytes | SHA256 and byte length of delivered TXT |
| weekStart, sourceMode | Admitted Monday and original mock/live/unknown mode |
| savedWeekAt, venueNotesSavedAt | Original timestamps from the admitted files |
| originalPicks | Every original suggested occurrence |
| scheduledVisits | Occurrences assigned to a displayed weekday |
| omittedPicks | originalPicks minus scheduledVisits |
| retainedNoteRecords | All admitted occurrence/date records |
| currentNoteRecords | Records matching a scheduled occurrence and exact date |
| excludedNoteRecords | retainedNoteRecords minus currentNoteRecords |

A visit with no saved record still appears with native defaults, so currentNoteRecords may be smaller than scheduledVisits. Excluded records remain in the source JSON. Hashes identify bytes; they do not authenticate files, source claims or notes.

## Exit status

| Status | Meaning |
|---|---|
| 0 | Complete TXT and receipt delivery, or successful standalone help |
| 2 | Usage, input/UTF-8/native admission, no scheduled visits, changed source or output collision refusal |
| 1 | Unexpected processing, staging/output/cleanup, successful-path stdout or help-delivery failure |

Errors begin with "tastetable-call-sheet:" on stderr. A known primary refusal remains status 2 if its diagnostic also fails. Post-publication failure is status 1 and warns that the complete file has been created. No success receipt is intentionally emitted on refusal.

The exported async main(argv = process.argv.slice(2)) returns this status. Importing the module does not execute the command or perform file I/O.

## Native checks

~~~sh
node --test tests/test_saved_week_to_call_sheet.mjs
~~~

Maintained tests use fictional authored inputs and actual child Node processes. They cover exact native TXT and receipt fields, occurrence/date/history distinctions, complete admission, encoding and byte bounds, regular-file/no-clobber behavior, a deliberately changed owned input, and selected genuine I/O failures. Test hooks affect only private test files and built-in I/O; they are not product features. POSIX FIFO/symlink and /dev/full controls do not imply those facilities exist on Windows.

A recorded reply is not a safety check, reservation or confirmation by TasteTable. Source labels are retained, not rerun. Confirm venue details and care needs through ordinary channels before a visit, and avoid adding names or private health information.
