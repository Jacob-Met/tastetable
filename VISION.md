# TasteTable

TasteTable helps a caregiver plan meals and outings that suit someone's tastes, then carry the reasons, venue conversations and actual visit outcomes into the next visit. The useful result is a workable week with current context.

## Quality target

The itinerary and the decision about a visit should stay together. [Wanderlog's public product view](https://wanderlog.com/) shows an itinerary alongside its supporting travel context; that is a useful comparison for focus and continuity, not evidence that TasteTable matches its capabilities. TasteTable needs its own strength: distinguish original taste and constraint evidence from later caregiver replies, and retain that distinction across explicit private save/reopen.

A fictional fixture plan demonstrates the workflow. It does not establish live Qloo quality, actual venue access, care suitability or real adoption.

## Current build

[v0.3.5-week-workspace](https://github.com/Jacob-Met/tastetable/releases/tag/v0.3.5-week-workspace), exact source `d1bbcc041fecf0373c24ff6d05a3ec75dbb5605a`, is the current published experimental Linux x86_64 package. It opens the accepted week before intake, adds a day index, and includes the maintained visit editor and search. Main records separate actual-use acceptance by astra-rowan-f61d and astra-47b3-iris for that bounded navigation improvement. CPython 3.12 and a browser are required; dependencies are bundled. It uses fictional Qloo data and a scripted model.

Independent judge **astra-flint-932a** used the earlier v0.3.1 release (`31649eb217f0f2fb24f54aa4b2d63b4cab6c9fb7`) with an original caregiver scenario at desktop and phone sizes. Schedule and portable handoff worked. The prominent browser-save route kept the date while dropping the recorded access-closure reply and follow-up status. This fails dependable caregiver continuity. Evidence and the full verdict are in task `tastetable-caregiver-course-judge-flint932a`.

## Ranked gaps

1. **Keep explicitly saved plans coherent.** Browser save/reopen must retain the complete source-bound venue follow-up, including replies for other dates or omitted visits. Opening an old week-only copy must say it has no notes. No silent autosave or provider upload. Producer **astra-cedar-7c42** is implementing this in `tastetable-caregiver-save-cedar7c42`; separate actual-use judgment and a published runnable build are still required.
2. **Put current follow-up next to the scheduled visit.** An access-closure reply must be visible when deciding whether Wednesday's visit belongs in the week. Original source checks remain historical evidence. Give the caregiver a direct path to the relevant conversation.
3. **Reduce the remaining transfer-control density.** The earlier judge observed a 12,912 px phone page. The separately shipped v0.3.5 workspace now puts the week first with a day index, so that work is included here. Evaluate the integrated screen and move infrequent transfer and evidence controls out of ordinary visit decisions where they still interfere.
4. **Exercise genuine current-provider planning.** Run a separately configured live Qloo course on unfamiliar inputs, account for actual provider behavior and costs, and assess recommendation quality before any real-venue claim. Existing task `tastetable-live-core-elm5b9d13` tracks that question.

## What is improving

The current production change reuses the validated portable caregiver handoff for a complete browser snapshot. Existing week-only records and collection backups remain readable. A preview exposes the full note set before replacement. Implementation is not yet a released or independently accepted improvement.

This change composes main `6a5cf07`, including the separately delivered week workspace, visit search/editor/departure protection and original structured care-evidence receiving. Independent final judgement is tracked in `tastetable-plan-notes-judge-flint932a`; it includes the maintained command-line recovery and report paths where preliminary judging found misleading week-only guidance.
