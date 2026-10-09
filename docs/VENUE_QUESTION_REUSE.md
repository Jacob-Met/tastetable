# Reuse questions for another visit date

Move a suggested visit using its usual day control, then open **Edit questions for this visit**. Under **Questions recorded for another date**, choose a recorded date, read the preview and choose **Use questions**. **Cancel reuse** or closing the editor discards the prepared choice.

Only custom questions from the same original suggested visit are offered. Separate occurrences of the same venue stay separate, and identical questions recorded on different dates remain separate choices. A deliberately empty question list is available as an explicitly labeled empty choice. Default suggested questions are not recorded custom history.

The preview identifies both dates. Question text is copied literally, including dates mentioned inside it; review those dates yourself. Reply, contact status, reply context and next step are never copied from the selected source record. If the current date already has a reply to different questions, its existing reply and next step stay intact and the normal worksheet marks it **Needs follow-up**. Applying identical questions preserves the current status.

Ordinary note edits, day/week changes, note-file replacement and source replacement retire a prepared choice. Reopen the preview after such a change. Returning a visit to its original date restores that date's original note.

Reuse changes only this tab's current question record. Use the existing **Save venue notes (.json)** button to keep editable notes, or the existing readable call-sheet download/print controls. It does not contact a venue, regenerate recommendations, change source checks or save automatically.

## Literal text

Saved JSON retains the selected original string, including CR, CRLF, leading/trailing line breaks and Unicode. Browsers display textarea line endings as LF. The existing readable call sheet keeps its established line/bullet formatting; it is not a byte-for-byte representation of the saved question string.

## Native verification

Run the new focused transaction cases with:

```sh
node --test tests/venue_question_reuse.test.mjs
```

The maintained browser receiver uses an already installed Playwright package and Chromium executable. It opens a fictional saved week through the real file control, exercises question reuse and captures physical notes/call-sheet files. It uses only local GET bootstrap responses and rejects provider requests. See `node tools/check_venue_question_reuse_browser.mjs --help` for its explicit paths and resource guards.

The model, saved-note codec and planner remain unchanged. Compatibility with the separate caregiver-handoff owner's hooks is a source-composition proof; this feature does not qualify or adopt that owner's pending combined-file workflow.
