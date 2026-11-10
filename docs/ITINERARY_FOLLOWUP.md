# Current venue follow-up in the week

A scheduled visit shows its current caregiver-entered contact status and next step beside its name and day. This keeps a recorded problem, such as an entrance being closed, visible while arranging the week.

The display reads the existing venue-note model. It is separate from the original tag/keyword checks and does not establish current venue suitability. No new provider call or storage format is introduced.

- **Add note / Edit note** focuses the existing contact-status control for that exact visit and date.
- **Back to this scheduled visit** returns to the venue identity and edit control.
- A recorded next step stays visible. A full reply can be opened in place; a long reply without a next step has a clearly shortened excerpt and a full-text disclosure.
- Moving a visit shows the note for its new date. Moving it back, including Undo, restores the earlier date's note. Different occurrences of the same venue remain separate.
- Reopening a caregiver handoff restores its current note display. Accepting another plan retires the previous notes.
- Existing venue-note print and export behavior is unchanged. The compact screen summary is omitted from print to avoid duplicating the complete call sheet.

## Validation

The existing venue-follow-up model tests cover date, occurrence, omission, question-history and source boundaries:

```sh
node --test tests/venue_followup.test.mjs
```

The actual browser course exercises editing and returning, the phone layout, a move and Undo, a downloaded caregiver handoff, and retirement by another accepted plan:

```sh
TASTETABLE_REVIEW_URL=http://127.0.0.1:8017 \
TASTETABLE_REVIEW_CHROMIUM=/path/to/installed/chrome \
TASTETABLE_PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
node tools/check_itinerary_followup_browser.mjs
```

Set `TASTETABLE_REVIEW_CDP` to reuse an authorized browser with an isolated context, and `TASTETABLE_REVIEW_OUTPUT` for screenshots and results. The browser course uses the maintained fictional fixture app.
