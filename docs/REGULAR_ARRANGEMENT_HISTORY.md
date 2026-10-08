# Undo changes to your arranged week

After TasteTable displays a plan or opens a saved week, use **Undo change** to
recover an earlier arrangement and **Redo change** to reapply it. The controls
are beside **Restore suggested days**. They work with a keyboard as ordinary
buttons, and the week status names the change you just recovered.

History keeps up to 20 distinct changes in the current plan: moving or omitting
a pick, changing the Monday–Sunday week, and restoring all suggested days.
Restoring several picks is one change, so one Undo recovers the complete prior
arrangement. Choosing the same assignment or another date in the same week does
not use a history entry. A new arrangement change after Undo replaces the redo
choices.

Undo and Redo recover the whole arrangement and a valid date. If the date field
is incomplete or invalid, Print, Save and calendar export remain unavailable.
When an Undo or Redo is available, using it restores that entry's valid date too.
Otherwise, enter a valid date to continue. Invalid draft text is never saved as a
history entry.

The original suggestions, explanations and source labels stay attached to the
same picks. Print, Save week and calendar export use the recovered arrangement.
Venue-call notes still belong to their original occurrence and date: returning
to that date reveals its existing note. Editing those notes is outside the
arrangement history.

History stays in this tab. It is cleared when you start another plan or saved-file
read, change the planning inputs, stop waiting, or leave the page. An unsuccessful
Open does not restore the earlier plan. Save week keeps the current arrangement,
original inputs and response, but does not include Undo/Redo history or venue-call
notes. Opening that file starts a fresh history.

## Maintainer contract and receiving

Scope: [issue #40](https://github.com/Jacob-Met/tastetable/issues/40). The regular
consumer starts from main `2b347cee4ff4e2b806362730a8520a3360b45f5a` with the landed
venue worksheet. `static/arrangement_history.mjs` copies the received offline
helper (Git `ef1e8643370045c021e820cc7919a5692ede44bc`) with only its leading comment
changed from an offline recording to an accepted plan. Its runtime body and the
native week model are unchanged. No offline file is edited.

One complete transition passes through `renderWeek`: prepare the view, record a
semantically distinct state for the current accepted source, commit the view,
refresh calendar/save/worksheet consumers, then refresh the history controls.
Undo/Redo uses that same path. Existing worksheet mount/accept/sync/retire calls
remain in place. Availability #36 owns its future Apply and preview binding;
composition with its actual source is a separate receiving step.

Run the focused native controller/codec checks with Node 22 or newer:

```sh
node --experimental-vm-modules --test tests/test_regular_arrangement_consumer.mjs
```

The Python test wrapper runs the same command under the ordinary pytest suite.
The JavaScript receiver evaluates the exact application modules and uses the
real week codec, request controller and calendar writer. Its DOM, fixture
transport, print sink and worksheet mount are explicit test doubles. It does not
qualify real browser input/focus/layout, physical downloads or the worksheet DOM.
Actual Chromium 153 / Node 22 receiving on the unchanged current-main composition
completed six interaction groups: real saved-file admission and physical outputs,
whole-arrangement and occurrence/date note recovery, same-week/no-op Redo,
invalid-date recovery, desktop/390 px keyboard controls, and source retirement.
The final process retained exit 1 because its last URL assertion omitted Chromium's
inline calendar SVG. A separate five-check recorded-evidence audit verified that
exact non-executable icon, the loopback-only GET traffic, all 15 source guards,
eight physical outputs and owned browser cleanup. The original failure and the
audit remain separately attributed; no browser interaction was replayed for the
audit. Independent review accepted the source, observed behavior and complete
packet membership. The earlier pointer-receiver failure is also retained.

Date values in this browser receiver use native DOM input/change events; it does
not qualify the operating system's date-picker UI. Print uses the ordinary product
handler with a capture sink and the actual print-media worksheet projection; no
operating-system print dialog or paper is claimed. The physical JSON, ICS and
call-sheet downloads were read back. No provider or account was contacted.

See the [receiving record](receiving/regular-undo-3dab-20261008/README.md) for exact
source pins, raw results, limits and independent review. Availability #36 and the
separately owned venue-note file companion retain their future integration scopes;
their unpublished source is not included in this qualification.
