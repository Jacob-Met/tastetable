# Review a saved browser copy before removing it

The **Saved in this browser** preview now asks you to review the selected copy before removing it. This is a confirmation for one existing saved copy. It does not delete the week currently open in the planner or its venue notes, and it does not add an undo history.

## Use the confirmation

1. In **Saved in this browser**, choose **Preview saved week** for the copy you intend to remove. The preview shows its stored name and original saved information.
2. Choose **Remove saved week**. No saved copy is removed at this step. An inline review names the selected stored copy and explains the effect.
3. Choose **Keep saved copy** to cancel. Keyboard focus begins on this button; cancellation returns focus to **Remove saved week**. The preview and unfinished fields remain available.
4. To proceed, choose **Confirm removal**. The existing browser-storage transaction removes that selected copy once. On success the preview closes and the list refreshes. The current planner and venue notes retain their existing state.

The review uses the stored name, not an unfinished value in **Name for this saved week**. Names such as `Alpha <draft> 雪` are literal text. The same review is available for an unreadable saved record, using the label already provided by the existing storage reader. It does not repair that record.

Before confirming, retain a portable week file or collection backup if you may need the copy again. The confirmation does not create a backup. The existing collection workflow can refuse a backup if any saved record is unreadable; the removal feature does not alter that behavior. See the maintained [collection backup guide](SAVED_WEEK_COLLECTION.md) for the separate backup and recovery workflow.

## Which selection will be removed?

A request is bound to the exact selected preview row and its captured primary key. It does not follow a later selection or read a later name-field value.

| What happens while review is open? | Result |
| --- | --- |
| Choose **Keep saved copy** | Close the review without changing storage. |
| Preview a different copy, or start a fresh Preview read | Retire the review immediately. An old Confirm activation cannot affect the new selection. |
| Refresh the list, including a window-focus refresh | Retire the review even if the new list contains the same ID. Dirty Rename handling stays with the existing refresh logic. |
| Start an existing Save, Rename, Open, import-save, or collection action | Retire the review. That action retains its own existing effects. |
| Search saved names or change list ordering | Keep the same selected target and review. Hiding its list row does not select another copy. |
| Leave the document or restore it from back-forward cache | A new explicit removal request is required. |
| The storage transaction refuses removal | Show the existing error status and keep the selected preview. A new request is needed before retrying. |

Confirm retires its pending request before starting the transaction. Repeated activation cannot submit that request twice. Buttons also have native disabled states, and the handlers separately guard busy, unready, disposed and stale-selection conditions.

This is a selection-bound UI confirmation, not a database version lock. The unchanged `store.remove(id)` transaction remains authoritative if another tab changes storage. There is no new cross-tab conflict resolution, transaction rollback after pagehide, or persisted pending confirmation.

## Component compatibility and source scope

The maintained [index](../static/index.html) supplies the inline review and both buttons. Older controlled component hosts that omit any required confirmation element can still initialize the existing UI and use their other features. Removal fails closed with a readable status; it does not fall back to immediate deletion.

The implementation changes only [saved_week_ui.mjs](../static/saved_week_ui.mjs) and the index markup, with a new [focused test](../tests/test_saved_week_remove_confirmation.mjs) and this guide. The store, portable codec, collection operations, search, ordering, import implementation, provider integration, planner, worksheet, calendar and existing tests are unchanged. The confirmation uses no browser modal, new storage method, network request, automatic backup or additional persistence schema.

From the repository root, the focused controlled-DOM course is:

```sh
node --test --test-concurrency=1 tests/test_saved_week_remove_confirmation.mjs tests/test_saved_week_import.mjs tests/test_saved_week_order.mjs
```

The four new groups cover explicit review/cancel and one-target confirmation, selection and lifecycle retirement, existing action integration, and refusal/compatibility guards. They use the unchanged fictional response fixture and actual maintained UI handlers with explicit DOM/store adapters. They record scenario observations as test diagnostics. The unchanged import and ordering tests cover the two existing initializer paths directly affected by optional new controls. The rest of the historical application suite is outside this bounded course.

These adapters do not qualify native keyboard focus, layout, IndexedDB transactions, the whole FastAPI application, live providers, or deployment. Those claims require separately identified browser or application evidence.

## Receiving status and ownership

The controlled native course is complete. One original-handler characterization confirmed that the prior Remove activation immediately removed the selected A copy, preserving unrelated B/C records and the controlled current planner and note.

The candidate ran once in one Node process: four new confirmation groups and twelve unchanged import/order methods all passed. Thirty-seven saved observations cover the eighteen independently frozen scenarios, including literal stored names, cancel/dirty-field conservation, one confirmed target, different/same-ID preview retirement, existing actions, pagehide/restoration, unreadable records, incomplete controls, refusal and explicit retry. Independent saved-result review checked every scenario, each retained original record hash and complete controlled host/note state.

The original outer receipt is retained as **FAIL**. Its three reporter-dependent checks expected TAP `#` prefixes, while this Node invocation emitted the human-readable `ℹ` reporter. The actual child exited zero, all sixteen named methods passed, and all thirty-seven observations were already present in stdout. A read-only adjudicator extracted those saved results; no product, test, source or original course was rerun or changed. All selected source, input, runtime and original-evidence identities stayed exact. The parent-recorded child completion is the process evidence; no numeric-PID absence inference is made.

The separate component-browser course completed once with 112 successful checks and fifteen complete saved UI states. It used the unchanged native store and real IndexedDB in a fresh isolated browser profile/database, exact candidate markup/modules/styles, fictional A/B records and one explicitly malformed C record, with a controlled active planner and venue note. Native Enter on **Keep saved copy** cancelled without changing any stored record and restored Remove focus. Previewing B retired the earlier A request with its controls hidden and disabled; no hidden-control activation was forced. Search and native list ordering hid A while retaining its pending target. A bounded native Tab sequence followed by Enter confirmed exactly A; a later pointer confirmation removed unreadable C without repair. Complete B, the current planner/note and the unfinished current-save name remained unchanged.

Two original full-page captures were received at 1360- and 390-pixel viewports. Their actual PNG dimensions are 1360 × 2439 and 390 × 3891. The stored literal name and both review buttons fit without horizontal page overflow or overlapping controls; resizing and capture preserved the complete observed component/storage/host state. These are desktop Chrome viewport observations, not physical-mobile, touch or assistive-technology qualification. The component was served over loopback HTTP; a file-URL opening and the whole FastAPI/provider application were not exercised.

The browser's outer process and its direct Node child completed with zero status. All eleven observed owned Chrome identities were terminal at the final observation: ten absent and one with the same creation identity signaled exited zero. Its retained image-query error 31 does not negate the independently observed wait/exit facts. No active or unknown owned identity, owned listener, page error or failed asset remained. All forty-nine selected input identities, three directory maps and the frozen configuration were conserved. A separate read-only audit accepted twenty-four data, interaction, geometry, custody and closure checks. These browser results do not change the earlier native outer FAIL or replace its read-only adjudication.

The reserved source scope is [issue #134](https://github.com/Jacob-Met/tastetable/issues/134). Existing search, import, ordering and collection adoption remain separate. [Issue #55](https://github.com/Jacob-Met/tastetable/issues/55) retains whole-app/collection and caregiver handoff ownership, including its prior unresolved physical receiving campaign. This work does not reuse or declare closure of that campaign. [Issue #110](https://github.com/Jacob-Met/tastetable/issues/110) owns the separate venue-note departure warning.

Source publication, merging, installation and whole-app deployment are distinct steps. This guide does not imply that a held integration, user installation or existing browser session was changed.
