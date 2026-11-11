# TasteTable

TasteTable helps a caregiver plan meals and outings that suit someone's tastes, then carry the reasons, venue conversations and actual visit outcomes into the next visit. The useful result is a workable week with current context.

## Quality target

The itinerary and the decision about a visit should stay together. [Wanderlog's public product view](https://wanderlog.com/) shows an itinerary alongside its supporting travel context; that is a useful comparison for focus and continuity, not evidence that TasteTable matches its capabilities. TasteTable needs its own strength: distinguish original taste and constraint evidence from later caregiver replies, and retain that distinction across explicit private save/reopen.

A fictional fixture plan demonstrates the workflow. It does not establish live Qloo quality, actual venue access, care suitability or real adoption.

## Current build

[v0.3.7-coherent-caregiver-plans](https://github.com/Jacob-Met/tastetable/releases/tag/v0.3.7-coherent-caregiver-plans) is the current experimental Linux x86_64 release, packaged from `760cd3b9e55ff9619621a90ffb5cbfebc225e30c` and merged in PR177. CPython 3.12 and a browser are required; dependencies are bundled. It uses fictional Qloo data and a scripted model.

The main week combines the existing week-first workspace and current dated itinerary follow-up with complete browser saves. Explicit Save retains every source-bound note; Preview exposes its full contents; reopen restores replies, questions, status and next steps, including omitted visits and other dates. Old week-only records and collection backups remain readable. Complete empty-note copies visibly clear current notes when opened.

Independent judge **astra-flint-932a** first found the real continuity failure in v0.3.1: schedule save survived while the contrary access-closure reply was lost. Separate task `tastetable-plan-notes-judge-flint932a` accepted the fix, the original v1 browser profile, fresh-browser transfer, CLI recovery/report, and final composed source760's dated itinerary return. Producer **astra-cedar-7c42** ran the 97-test composed native save/collection/handoff suite and actual browser course. The [downloaded release course](https://github.com/Jacob-Met/tastetable/releases/download/v0.3.7-coherent-caregiver-plans/published-runtime.json) subsequently passed through the bundled launcher in a fresh Chrome context after all eight original public assets were downloaded and checked.

[Watch the actual save-and-return course](https://github.com/Jacob-Met/tastetable/releases/download/v0.3.7-coherent-caregiver-plans/caregiver-save-and-return.mp4) · [Desktop](https://github.com/Jacob-Met/tastetable/releases/download/v0.3.7-coherent-caregiver-plans/restored-visit-desktop.png) · [Phone](https://github.com/Jacob-Met/tastetable/releases/download/v0.3.7-coherent-caregiver-plans/restored-visit-phone.png). The clip uses fictional data, real interactions and captions; it is silent. Flint independently inspected its final encoded frames and accepted the readable framing.

## Ranked gaps

1. **Originate a useful week without provider access.** The maintained app can arrange and retain supplied suggestions, but it cannot originate a caregiver's known places. The finite Studio recordings intentionally reject arbitrary replacement names. Independent task `tastetable-own-place-judge-flint932a` established this actual obstruction. Producer `tastetable-own-places-cedar7c42` is extending the existing planner with distinct local place/visit identities, honest caregiver provenance, repeated visits and retained dated notes. This capability is not in the current release.
2. **Exercise genuine current-provider planning.** Run a separately configured live Qloo course on unfamiliar inputs, account for actual provider behavior and costs, and judge recommendation quality before any real-venue claim. Existing task `tastetable-live-core-elm5b9d13` tracks that question. The fixture release makes no live quality claim.
3. **Reduce the remaining transfer-control density.** Week-first navigation and current follow-up are now composed with complete saves. Infrequent file, evidence and comparison controls still occupy too much of the ordinary visit workflow. Judge the actual desktop and phone experience against the best itinerary tools before changing the hierarchy.

## What is better since last time

A caregiver can explicitly save an access-closure reply, leave, and return to the same visit with that reply and its next action intact. Original recommendation evidence stays distinct from later venue statements. Week-only export labels now describe their actual scope, and command-line recovery directs a complete saved plan to the caregiver-handoff route. These are accepted continuity improvements; they do not establish real-world care outcomes or adoption.
