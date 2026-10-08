# Resume editable venue notes

Save the arranged week and its venue notes separately. The existing **Save week** file keeps the original accepted response, inputs, arrangement and calendar identity. **Save venue notes (.json)** keeps editable questions, contact status, replies, the questions associated with an earlier reply, and next steps for that same accepted plan.

1. Save the week and venue notes before leaving or replacing the plan.
2. Later, open the matching saved week.
3. Choose **Open venue notes** and inspect the record preview, including notes for omitted visits or other dates.
4. Choose **Replace venue notes** to replace the complete current note set. Save current notes first if you want to keep them. Cancel or simply reading a file does not replace anything.

A matching plan may have a different displayed week or arrangement. Each note keeps its original occurrence and exact planned date; moving a visit does not move its recorded reply. Returning to a prior date restores that date's note. Duplicate venue names remain separate original occurrences. An empty companion clears notes only after explicit replacement.

Editing a note, changing the week or arrangement, accepting a new plan, canceling, or choosing a newer file retires a pending replacement. A refused file leaves current notes intact. If preparing a download fails, the current records remain available for another save attempt.

## Local file contract

The version is `tastetable.venue-notes.v1`. The JSON contains `format`, `savedAt`, `origin` and `records`. Origin includes the complete original `receivedAt`, `calendarId`, `inputs` and `response`; the existing saved-week admission validates this source. Its full values must match the accepted plan. The companion cannot replace the plan, change the arrangement, refresh checks, contact a venue or send a request.

Each retained record is `{key, date, note}`, with the original occurrence key, a real calendar date and the existing five worksheet fields: `status`, `question`, `reply`, `replyQuestions` and `nextStep`. A null question retains the worksheet's suggested-question behavior. The original question snapshot associated with a reply survives later question edits. All records are validated before replacing the map.

Admission is strict UTF-8 JSON, at most 2 MiB and 256 distinct occurrence/date records. The existing worksheet text limits and contact states apply. Unknown fields, duplicate identities, invalid dates, inconsistent reply/question history, unsupported versions, and different original source values are refused. Files are local editable snapshots, not authenticated receipts. They include the original tastes, constraints and response as well as caregiver notes. Avoid names or private health information.

The existing week format, calendar output, readable TXT indentation, contact rules and heuristic checks stay unchanged. Notes are not stored automatically. This companion is separate from the postvisit record page's went/did-not-go status and actual-visit date.

## Replay

The focused state/file check uses Node.js 18+ without npm dependencies:

```sh
node --test tests/venue_followup.test.mjs tests/venue_note_file.test.mjs
```

The maintained author browser receiver uses Node.js 22+ and an installed Chromium/Chrome with its ordinary sandbox. It serves exact local static source and synthetic health/persona bootstrap only. Its input is the existing source-pinned saved-week artifact from the worksheet receiver; it makes no fresh Python, FastAPI, Qloo or venue call.

```sh
node tools/check_venue_note_files_browser.mjs --browser /path/to/chrome --output /path/to/empty-output-directory
```

An explicit `--project` repository directory and `--week` saved-week path are supported. The default saved-week path is `docs/venue-followup-6c20bb4b010e/author/final/saved-composition-week.json`. The receiver checks actual file chooser gestures/downloads, preview/cancel/replacement, stale reads, source refusal, earlier-question attribution, omitted/other-date records, keyboard and 390px behavior, failed-download retry and explicit empty replacement. It retains a compact result and output artifact hashes. Its two explicit fault controls delay completion of a real File read and refuse one local download preparation; they do not replace the application engine or file content.
