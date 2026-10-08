# Editable caregiver handoff

Use **Save caregiver handoff (.json)** to keep the arranged week and its complete venue-note set together. The file includes original tastes and constraints, the complete saved response, source labels and explanations, original calendar identity, week assignments, and retained occurrence/date notes. Notes for omitted visits and other dates remain in the file, including the questions associated with an earlier reply.

To continue later:

1. Choose **Open caregiver handoff**, even before opening or generating a plan.
2. Review the filename, original source, week, scheduled and omitted picks, and complete note records.
3. Choose **Replace week and notes** to replace the current inputs, arrangement and complete note set. **Cancel replacement** keeps the current work. An empty incoming note set clears current notes only at this explicit step.

Opening and reviewing do not change the current plan. A malformed file or a mismatched week/note source is refused before replacement. Editing inputs, the week date, assignments or venue notes, starting another source request, selecting another handoff, cancelling, or leaving the page invalidates a pending read or preview. Reopen the file to review it against the newer work.

The file is read and prepared in the browser. There is no automatic save or upload, and no provider or venue request. Keep the file to resume after closing the page. Original checks are retained without being run again; caregiver notes do not establish verified venue facts or a reservation.

## File contract

The outer UTF-8 JSON envelope is limited to 6 MiB and has exactly four fields:

| Field | Meaning |
| --- | --- |
| `format` | `tastetable.caregiver-handoff.v1` |
| `savedAt` | Canonical ISO timestamp for this handoff save |
| `week` | Unchanged `tastetable.saved-week.v1` object |
| `venueNotes` | Unchanged `tastetable.venue-notes.v1` object |

Both sections pass their existing native codecs. Notes must bind to the complete original response, inputs, received timestamp and calendar identity in the week section. The existing 2 MiB companion limit, 256 occurrence/date record limit, field limits and reply/question-history rules continue to apply. The worksheet model and response-dependent view are prepared before the explicit replacement.

The separate **Save week / Open saved week** and **Save venue notes / Open venue notes** flows retain their formats and behavior. Calendar, readable call sheets, saved-week comparison and post-visit records retain their separate purposes.

## Native receiving

The model gate uses no external packages:

~~~bash
node --test tests/caregiver_handoff.test.mjs tests/test_week_file.mjs tests/venue_followup.test.mjs tests/venue_note_file.test.mjs
~~~

The focused browser gate requires Node 22+ and an installed Chromium-compatible browser. It uses the actual local app, keyboard controls, native file choosers and physical downloads:

~~~bash
node tools/check_caregiver_handoff_browser.mjs --project . --output /absolute/new/receiving-directory --browser /absolute/path/to/chromium
~~~

The receiver serves exact project static files plus authored local health/persona responses. It does not run FastAPI, Python plan generation or a provider. Its original saved-week input is an unchanged retained native artifact, with its Git blob identity checked before use. It records source hashes, actual artifacts, checks, browser version and failures. A new empty output directory and sufficient native resource reserve are required.
