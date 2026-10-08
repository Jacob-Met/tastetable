# Calendar writer for TasteTable's arranged week

This packet publishes the tested iCalendar producer and its receiving contract for the existing week organizer. The frontend composition remains with the owner coordinating in [issue #4](https://github.com/Jacob-Met/tastetable/issues/4#issuecomment-6056207260). No application handler, date selector, stylesheet or page markup is changed by this packet.

The writer consumes the accepted plan's immutable source and the organizer's current assignments. It supports multiple checked picks on one day, omissions and reset, preserves source explanations and notes, and refuses unknown provenance or inconsistent state/rows. Calendar events are tentative all-day suggestions, with exclusive next-day ends. No reservation, opening time, calendar account action or synchronization is inferred.

## Producer interface

```js
const session = TasteTableCalendar.createWeekExport(initialWeekState);
const preview = session.preview(weekState, weekRows(weekState));
const file = session.download(weekState, weekRows(weekState));
// file.filename, file.text, file.count
```

Create one session for each newly accepted source plan. Retain it through arrangement edits; retire it when that source is cleared, replaced or invalidated. Use the organizer's single date control and actual `weekRows(state)` output. A current invalid date input must keep download unavailable even after a move or reset. Revalidate the current state on the download gesture. The detailed [producer handoff](producer-HANDOFF.md) describes the complete contract and its original local source pins.

Occurrence IDs combine a fresh session namespace, the selected Monday and the stable pick key. Moving, omitting and restoring a pick within one week preserve its ID. Selecting a different week produces different IDs; returning to the earlier week restores that week's IDs. File imports do not provide synchronization or cancellation, and importer behavior has not been qualified.

## Exact qualification

| Boundary | Result |
| --- | --- |
| Final `static/calendar.js` | SHA256 `09dfe98a95da6c7fd0b7ee531c3ec4cf9ae5697dc730fab6cffdd07d8bd94b3b`; Git blob `dbed22d2cb91090bccec9472fbffd2854eed2722` |
| Retained and arranged writer tests | 23 passed, no failures or skips |
| Independent actual planner receiving tests | 15 passed, no failures or skips |
| Fresh backend receiving at `8fdd78dbd1bd7e72385b2f5bd684e02b0971fa14` | Four native scenarios and seven calendar outcomes passed |
| Existing owner's composed frontend `consumer-v1` | 14 independent real-browser checkpoints passed; 18 actual calendar downloads |
| Actual planner reference | Git blob `8ed28163e0273c510fdd8e6f7c5d1c8476efb862`; SHA256 `e739adc10d9ae9ba1cb82c6d800c453e8f7bec53e343e0685adeabe98e6f4809` |

The backend cases include complete suggestions, unavailable outing recommendations, unavailable restaurant recommendations, and all recommendation calls failing. Only surviving checked picks are exported. Fresh Rosa, Harold and Mei fixture responses and an arranged week were received. Requirements, purpose authority, trace evidence and request bounds remain native backend behavior. Backend `agent.py` is not changed here.

The independent planner copy under `review/sibling-snapshot/` is a pinned test reference from the week owner's source, now integrated through PR #9. It is not a second production planner. The duplicate writer files under `review/` retain exact tested and negative-control source. Their locations allow the unchanged independent carrier to be rerun.

```sh
node --test tests/calendar.test.cjs tests/calendar-week.test.cjs
node --test docs/verification/calendar-writer-9e05-20261008/review/composition.test.mjs
```

The second command recreates the test's observation JSON in its evidence directory. The original writer's failed receiving assumptions can be reproduced with `review/reproduce_original.mjs`: exporting the raw plan ignores moved or omitted picks, and repacking edited rows wrongly rejects two restaurants sharing a day.

[Author manifest](author-manifest.json), [author output](author-tests.tap), [independent review](review/REVIEW.md) and [independent receipt](review/qualification.json) retain exact source provenance. The [fresh backend review](current-main/REVIEW.md) is separate from the earlier backend stack and does not extend old evidence to untested source.

## Composed frontend receiving

The existing frontend owner's frozen `consumer-v1` composition passed the unchanged independent real-browser carrier on 2026-10-08. Its app SHA256 is `faa47a7c5b71a5c12f004868e68b71df33d4486002b983943185c3d9928dd5e1`. This receives the exact writer above, the published native week module, the accepted request controller and the staged renderer. The [composed browser review](composed-browser/REVIEW.md) links exact inputs, the unchanged carrier, raw results, screenshots and all downloaded files.

All 14 checkpoints passed, with 18 actual `.ics` downloads, 36 UI snapshots and an 88-event request timeline. Downloaded events followed moves, co-scheduling, omissions, reset and week changes. Invalid visible dates stayed held through move/reset. Partial, empty and malformed replacements and late native streamed JSON readers could not restore a retired export. Source pins remained unchanged, and no page errors or dialogs were recorded.

These results apply to that exact frontend with the documented synthetic native responses from backend `8fdd78dbd1bd7e72385b2f5bd684e02b0971fa14`. They do not extend to the later backend-note change. Frontend source integration remains with the existing composition owner; this producer PR has no app/index/style edits. This packet does not claim deployment or calendar-application import acceptance.
