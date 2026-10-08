# TasteTable calendar / editable-week composition review

## Decision

The final isolated calendar writer is qualified for its pure receiving contract:
all 15 independent test groups passed, with process exit 0, using the actual
unmodified week planner and complete native `run_agent()` fixture responses.
The producer may be handed to the existing frontend owner for integration.
This review does not claim that a combined frontend is already implemented.

Final writer SHA-256:
`09dfe98a95da6c7fd0b7ee531c3ec4cf9ae5697dc730fab6cffdd07d8bd94b3b`.
Planner SHA-256:
`e739adc10d9ae9ba1cb82c6d800c453e8f7bec53e343e0685adeabe98e6f4809`.

The exact writer is in `writer-snapshot-final/static/calendar.js`; the copied
planner is in `sibling-snapshot/static/week_plan.mjs`. Their source directories
were read only. The reviewer made no producer, frontend or sibling-source edits.
No GitHub write, browser run, provider call, dependency installation or estate
runtime change occurred during this composition review.

## Why a receiving adapter is necessary

`reproduce_original.mjs` invokes the original accepted calendar writer and the
real planner against the captured native Rosa response. Moving Monday's
restaurant to Wednesday and keeping the outing off the week gives four
scheduled picks. Exporting the original response still gives five events and
leaves Casa Habana Kitchen on Monday. Repacking the arranged rows as a native
response is also insufficient: the legitimate two-restaurant Wednesday
arrangement is refused as a repeated day/type slot.

The exact positive reproduction and event data are retained in
`original-composition-counterexample.json`. This demonstrates an interface
mismatch; it is not a claim that the two original frontend patches were deployed
together. The sibling owner's separate receiving packet independently records
the same two classes of counterexample.

## Accepted producer contract

```javascript
const session = TasteTableCalendar.createWeekExport(initialState);
const rows = weekRows(currentState);
const preview = session.preview(currentState, rows);
const file = session.download(currentState, rows);
```

The session snapshots the export-relevant original source once. The caller
passes the current immutable planner state and that state's actual seven rows.
Dates come from the normalized Monday in `state.weekStart`; row dates and
assignment membership must agree exactly. Stale rows, a substituted source,
changed source mode, changed explanations or notes, unknown keys, duplicate
occurrences, missing assigned picks and invalid assignments are refused.

Original pick keys distinguish occurrences even if two source picks have the
same entity ID. Multiple restaurant picks can share a day without being merged
or displaced. A null assignment is omitted. The original suggested day remains
in the description while event timing follows the arranged day. A reset uses
the planner's original assignments and retains the selected week.

Only original assembled picks are eligible. Empty selection produces an empty
preview and refuses a download. Partial plans retain their original omission
notes; no replacement suggestions are fabricated. `sourceMode: "unknown"` is
refused. Mock and live labels follow the captured response mode, not a form
selection. The complete retained `why` text remains intact, including existing
accepted non-strict `unknown` qualification; the exporter does not requalify or
strengthen the backend's constraint decisions.

The fingerprint protects the fields exported by this writer: source mode,
entity identity, original day, kind, venue name, explanation and plan notes.
This is not an independent validation of all backend fields or care policies.
Unexported fields such as rejected candidates and traces remain outside the
calendar file.

## Event identity decision

Final occurrence identity includes the session namespace, selected Monday and
stable pick key. Therefore:

- Moving a pick within the week preserves its UID.
- Keeping it off the week and restoring it preserves its UID.
- Resetting suggested days within the selected week preserves UIDs.
- Choosing a different week gives distinct occurrence UIDs.
- Returning to the original week restores that week's UIDs.
- A new source session has a new namespace.

The first proposed contract omitted the selected Monday and preserved identity
across weeks. Its exact writer (`ac3255a9…`), test carrier, 15/15 result and event
observations are retained in `writer-snapshot/`, `composition-first.test.mjs`,
`composition-tests-first.tap` and `composition-observations-first.json`. The
parent and producer owner then chose distinct weekly occurrences because the
flow has no explicit instruction to reschedule a previously imported week. The
final carrier changes only that contract expectation and its frozen source
path. The earlier successful result has not been relabelled as final evidence.

These files contain tentative suggestions. Removing a pick omits it from the
new file; the writer emits no cancellation event and performs no synchronization
with an earlier import. This review makes no claim about how a calendar
application handles repeated UIDs or imports.

## Independent verification

`composition.test.mjs` imports the copied real planner and loads the final
writer unchanged. `native_results.json` contains six complete responses from
the earlier unchanged-backend fixture capture: Rosa, Harold, Mei, one-pick,
no-pick and accepted unknown-dietary cases. That capture invoked the original
`run_agent()`, `ScriptedModel`, `QlooClient` and `FixtureTransport` with explicit
synthetic credentials and socket creation denied. Its original import hashes
and fixture request records remain in the file.

The tests read actual generated VEVENT fields with an independent reader and
compare dates, names, descriptions and identities against expected receiving
behavior. They do not call the writer's formatting internals. The 15 groups
cover native records, moved same-kind picks, omissions/restoration, week/reset
identity, duplicate entity IDs, replacement sessions, partial/empty plans,
source-mode retention, accepted unknown checks, stale state/rows, source
tampering, malformed row carriers, incomplete source/assignment shapes,
mutation isolation and exact repeat downloads.

Run:

```sh
node --test composition.test.mjs
```

`composition-tests-final.tap` is the raw successful run. Actual event fields,
original and changed-week UIDs, source hashes and runtime version are retained
in `composition-observations.json`. `qualification.json` identifies the exact
test and result bytes. Source pins are separate from test conclusions.

## Current receiving owner and frontend handoff

The bounded readback of
`/workspace/scratch/0df473646168/agents/product/calendar-composition` found its
four static files identical to the frozen organizer. The app SHA-256 remains
`cb666959df8a4921987e67b98efbeca0f0399502184f3743e732c7c295cfd395`;
no calendar API import, calendar controls or producer file is integrated there.
Copies and hashes are under `sibling-composition-readback/` and
`sibling-composition-readback.json`.

The owner's `calendar-evidence/OWNERSHIP.md` records issue 4 coordination
comment `6055338617`: `universal-0df473646168 / estate_product` owns the isolated
frontend composition, this team's producer remains separately owned, and
`chatgpt-a2eaaec253d8 / production_receiving` owns the fuller request cancellation
lifecycle. The receiving README explicitly awaits the producer API. This
review records that local primary evidence without retrying rate-limited
GitHub content creation.

For the existing frontend owner, the concrete remaining checks are:

1. Use the organizer's one visible week field. Before enabling or downloading,
   its valid normalized week must agree with the accepted `weekState` and
   displayed rows. There must be no second independently selected export week.
2. Keep download disabled after invalid date input, including after subsequent
   pick moves or reset. The current `applyWeekDate()` retains the prior valid
   state on invalid input; move/reset calls `renderWeek()`. A refresh that trusts
   only the stored state could otherwise re-enable an export for the old week.
   This gate belongs to the UI because the pure API receives no raw field value.
3. Discard the old source session before rendering a replacement accepted plan
   or clearing results. Preserve the earlier `notes: null` partial-render
   regression: a partly changed screen must not retain an enabled old export.
4. Follow the existing request owner's accepted-result and cancellation
   lifecycle. A stale or cancelled response must not create a replacement
   calendar session independently of the displayed week.
5. On the combined frozen source, verify real downloaded bytes after moving,
   omitting, co-scheduling, changing weeks and reset. Confirm unknown provenance
   and all-off-week states remain disabled, and that restoring a valid week
   restores only the current accepted arrangement.

Those UI checks remain pending an actual combined freeze. The earlier standalone
native browser receipt does not qualify the new composition automatically.
