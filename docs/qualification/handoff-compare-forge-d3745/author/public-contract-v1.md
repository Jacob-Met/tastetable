# Compare caregiver handoffs — public contract before implementation

Owner: Forge (`d3745ea0f44f`), with root independent receiving/integration and Loom source review. Repository: Jacob-Met/tastetable. Selected current source: `c93c83c4b5f05686dca5810427dd4f5f826709e9`, complete tree `5dbdb2e6a1a649ddcf568146911572b5f7a41117`.

## User outcome

A caregiver can choose two saved `tastetable.caregiver-handoff.v1` files and understand what changed in the arranged week and the literal saved venue notes. The page is separate from the working worksheet. It never restores, edits, combines or uploads either file. “Earlier copy” and “Revised copy” are user-selected roles, not a determination of chronology. No health, safety, availability, recommendation or venue verification is inferred from note differences.

The current combined-handoff reader already admits the saved week and the complete source-bound note set together. The current saved-week comparison deliberately excludes venue notes. This new page joins those existing, distinct projections for one pair of admitted combined handoffs.

## Exact source fence and prior owners

Six new authored paths: `static/handoff_compare.mjs`, `static/handoff_compare_ui.mjs`, `static/compare-handoffs.html`, `static/handoff_compare.css`, `tests/test_handoff_compare.mjs`, `docs/COMPARE_CAREGIVER_HANDOFFS.md`. Two narrow existing changes: one adjacent comparison link in `static/index.html`, and one additive README usage section. A ninth selected path is the **unchanged** pure `static/venue_note_changes.mjs` helper from the existing #68 owner at `975bf346cc300f50abfac3c3ebac2fc492077091`, Git blob `9d7153966d16d61a3089e1df2454a7d3b3806d96` (2,303 bytes). Do not adopt that branch's editor, index or CSS changes.

Preserve #55 combined handoff admission/restoration, #29/#43 week comparison/change brief, #68 note replacement workflow, #63/#79 post-visit records and #82 handoff call-sheet work. Existing `caregiver_handoff.mjs`, `week_file.mjs`, `venue_note_file.mjs`, `venue_followup.mjs`, `week_plan.mjs`, `week_compare.mjs` and calendar helper remain byte-exact. No app/controller/backend/workflow/settings change. Current open adjacent PR titles/source fences were checked before reservation; this is a bounded ownership check, not a claim about every project activity.

## Public model interface

`static/handoff_compare.mjs` exports:

- `readHandoffForComparison(text, side)`: `side` must be exactly `earlier` or `revised`; delegates all format/size/source/field admission to unchanged `readCaregiverHandoff`. Returns its admitted snapshot unchanged. Invalid input throws an Error whose message starts `Earlier copy: ` or `Revised copy: ` and retains the reader's explanation. Unsupported side throws TypeError.
- `compareCaregiverHandoffs(earlier, revised)`: accepts **already admitted snapshots** from that reader. Returns `{ paired, arrangement, notes }`. `arrangement` is the unchanged `compareSavedWeeks` result. If paired, `notes` is the unchanged `compareVenueNotes(earlier.records, revised.records)` result; if not paired, `notes` is null. This projection does not admit arbitrary objects and does not mutate snapshots.

Pairing uses the existing exact complete original response/inputs/receivedAt/calendarId identity. Object property order is immaterial as in the existing week comparator; all array order and literal string content are retained. Different valid sources are a mismatch, not malformed input. No fallback pairing by venue name or ID.

Arrangement results retain each original occurrence, including repeated venue IDs/names, and the existing unchanged/moved/scheduled/omitted statuses in original order. Exact dates include week changes. Notes match exact occurrence key plus date; counts and records retain the #68 helper's current order first, then genuinely new incoming identities. Added, removed, changed and unchanged remain distinct. All five fields are preserved: status, question, reply, replyQuestions, nextStep. A missing note record is distinct from an explicit record containing default values. Null and empty text remain distinguishable; literal Unicode, whitespace, line endings and markup-like text are never normalized or executed. Other-date and omitted-visit records are included.

## Browser interface and state

Page `/static/compare-handoffs.html`, title and h1 `Compare caregiver handoffs`. Two labeled native file inputs `#earlierFile` and `#revisedFile`; respective clear buttons `#earlierClear`/`#revisedClear`, plain-text role=status elements `#earlierStatus`/`#revisedStatus`, and source summary containers `#earlierSource`/`#revisedSource`. Accepted filenames and source/save metadata are shown on their own side. `#comparisonStatus` is a separate role=status. `#comparison` contains `#arrangementChanges` and `#noteChanges`.

Initial status asks for both saved handoffs; no comparison is shown. Each file is independently bounded by the existing 6 MiB UTF-8 envelope limit before and after `arrayBuffer()`, decoded with fatal UTF-8 and passed to the unchanged reader. A read error identifies its side. Invalid replacement preserves that side's prior accepted copy; after pending work settles, any prior valid pair can be compared again. Pending replacement hides comparison with a reading message, while its prior accepted source summary remains explicitly visible. Clear removes only its own accepted copy and invalidates pending work. Latest selection wins per side; stale successful or failed reads cannot replace newer state. Page departure invalidates pending completions. No browser storage or network request is made by these file actions.

For valid matching sources, show arrangement counts and occurrence cards, then note counts and literal before/after field values for added, removed or changed records. Unchanged note records may be in a labeled disclosure. Null question is labeled `Original suggested questions`; null replyQuestions is labeled `No recorded reply questions`; an empty string has an explicit empty-text label. Show that added/removed refers to the saved record, not a new or canceled visit. Each record identifies original occurrence and exact note date, including omitted/other-date records.

For two valid but different sources, show `These handoffs have different saved sources. Changes cannot be matched.` Retain both side summaries, show no arrangement or note-change counts, and do not infer matches. For paired empty sets, explicitly show no original visits/no saved note records. For unchanged nonempty copies, counts and the unchanged disclosure make “no change” distinguishable from empty, invalid or mismatched input.

All file-derived content uses text nodes/textContent, never innerHTML. Cards and field pairs wrap at desktop and narrow widths; no narrow table compression. Native labels, headings, buttons and disclosures support keyboard use. The page links back to the planner and separately to the existing saved-week comparator. The index link opens a separate tab with `rel=noopener`, preserving the current worksheet.

## Qualification and limits

Author tests will exercise model admission/pairing, repeated occurrences, arrangement changes, complete notes including earlier questions, empty/no-change/mismatch, literal text/input preservation and UI async-selection/clear/error behavior through a small DOM fixture. Root owns a separately frozen actual consumer after candidate source freeze; no duplicate author/browser campaign. Complete original files remain unchanged. No claim that this verifies the truth of entered notes or reruns source checks. Static module delivery remains the existing app/server responsibility. Preserve all GitHub workflow bytes and use the existing no-Actions publication gate.
