# Compare two caregiver handoffs

Use **Compare caregiver handoffs (new tab)** beside the planner's Save/Open caregiver handoff controls. The separate page is also at `/static/compare-handoffs.html` when the normal TasteTable application is running. Choose two files made by **Save caregiver handoff**: one as **Earlier copy**, one as **Revised copy**. The page reads local files and does not upload, restore, edit or merge them. Your current worksheet stays in its original tab.

The labels describe the roles you choose. Save timestamps remain visible; the page does not establish which copy is newer or who edited it. A handoff includes the arranged saved week and the complete set of venue notes. A saved-week file or a notes-only companion is not a combined handoff and will be refused on the side where it was selected.

## Read the comparison

The arranged-week section follows each **original occurrence**, not a venue name or ID. Repeated suggestions for the same venue remain separate. It reports unchanged dates, moved visits, newly scheduled visits and visits kept off the week. A different week changes the exact dates even if weekdays remain the same. The original explanation is available in each card.

The notes section compares exact **occurrence and date** pairs, including other dates and omitted visits. Added or removed means a *saved note record* was added or removed; it does not mean a visit was added or canceled. The page shows all five stored fields on each side: contact status, questions, reply/notes, questions associated with that reply, and next step. An older question attached to a reply remains visible even when the current question changed.

Literal note text is retained, including Unicode, line endings and surrounding spaces. Text that resembles markup is displayed as text. A missing record is labeled separately from an explicit record with empty/default values. A null question is labeled **Original suggested questions**, a null reply-question history is **No recorded reply questions**, and an explicit empty string is **Empty text**. The raw contact status is shown with its familiar label. Unchanged note records are available in a disclosure; an empty set is called out explicitly.

## When files cannot be compared

Both files must first pass the existing complete combined-handoff reader. It checks the envelope and both native formats, the complete binding between week and notes, and every note record. The 6 MiB combined envelope limit and the nested format limits still apply. Invalid UTF-8, malformed data and unsupported versions identify the affected side.

Two valid files are matched only when their original response, original inputs, received timestamp and calendar identity match exactly under the maintained saved-week comparator. Array order is significant; object property order is not. Differences in handoff/week/note save timestamps alone do not prevent comparison.

If sources differ, the page says **These handoffs have different saved sources. Changes cannot be matched.** Both file summaries remain available, but no change counts or guessed venue matches are shown. Choose two copies derived from the same original saved source if you want a change comparison.

While a replacement file is being read, the prior accepted source summary remains visible and comparison is temporarily hidden. A failed replacement retains that prior copy and restores any previous valid comparison. Clear removes only its own side. A newer selection, Clear, or page departure invalidates an older unfinished read. No browser storage is used; closing the page loses these selections, not the original files.

## Scope and source reuse

This page shows differences between saved data. It does not verify the truth of notes, rerun source checks, contact venues, suggest care decisions or establish safety or reservations. Use the original worksheet to edit a handoff. Existing **Compare saved weeks** remains the separate arrangement-only comparison and change-brief workflow.

The implementation reuses the unchanged `readCaregiverHandoff`, `compareSavedWeeks` and native formats. The pure `venue_note_changes.mjs` projection is reused byte-for-byte from the note-replacement owner in issue68, commit `975bf346cc300f50abfac3c3ebac2fc492077091`, blob `9d7153966d16d61a3089e1df2454a7d3b3806d96`. No editor changes from that branch are included. This preserves a common definition of added/removed/changed/unchanged notes for the two distinct workflows.

The new model exports `readHandoffForComparison(text, side)` for side-labeled admission and `compareCaregiverHandoffs(earlier, revised)` for already admitted snapshots. The latter returns `{ paired, arrangement, notes }`, with `notes: null` for a valid source mismatch; it is not an arbitrary-object validator. Browser file admission uses the same maintained reader.

Run the focused model and DOM-listener controls from the repository root:

```sh
node --test tests/test_handoff_compare.mjs
```

These controls include literal field/history retention, occurrence/date ordering, complete source mismatch, invalid replacement, latest-read/clear/departure behavior, and byte/UTF-8 boundaries. They are distinct from an actual browser receiving course.
