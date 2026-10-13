# Recorded venue notes: departure receiving

## Outcome and source

TasteTable's venue worksheet now asks the browser to confirm a reload, navigation or tab close while non-default recorded notes remain. Choosing Stay retains the actual browser document, current week and notes. The listener is removed after complete reversion, an empty accepted notes replacement or normal plan retirement. It covers retained records for omitted visits and other dates. Creating a download does not claim that the user kept the file, so it leaves the reminder active.

- Repository: Jacob-Met/tastetable; issue [97](https://github.com/Jacob-Met/tastetable/issues/97); PR [98](https://github.com/Jacob-Met/tastetable/pull/98).
- Original current source: `95738e812de81e3ace9830cdfabbbe7e39ff4686`.
- Tested candidate: `217447aa17ff741fdeafdd37edbe237b15698c5d`.
- Candidate venue module SHA256: `9cd974e794e17c87e3b51b4ba7820200ce820ae611c8565a5224d68790441d32`.
- Candidate page SHA256: `c5723c1c8ba1c7695c863a400805c5aa75e1f5cd3515cea1137318a96626c567`.
- All four source/test/document bodies were fetched back exactly from that commit. No product code changed during browser receiving.

Only the venue module's content query/listener lifecycle and explanatory page/README text change. The six new model tests are additive. Source recommendation checks, model record mutation, file formats, provider paths, existing app retirement and explicit storage behavior are preserved.

## Native result

The original 19-file closure was reconstructed from exact Git blobs. The browser loads the actual static app over an authored local GET-only server returning mock health and an empty persona list; it imports the already-published native saved-week artifact through the real file chooser. This does not execute a fresh FastAPI backend or live provider. The fixture remains blob `8b14090030201d6e8d69cd5bca380a9a71a4da0d`, 14,602 bytes, SHA256 `55dfb9c7e50b2aff749dbb33835dcc5cf89c7d7f0eaf4e2b68dd957cb319a824`.

Actual MSI / Windows 10.0.26200 x64 / user jacob / Node 24.14.0 / Playwright 1.62.1 / installed Chrome 154.0.8037.97:

| Frozen browser group | Original | Candidate |
| --- | --- | --- |
| Empty page and fully reverted fields | Pass | Pass |
| Reply: Stay, real download, repeat Stay, Leave | Fail: no prompt | Pass |
| Contact status and navigation | Fail: no prompt | Pass |
| Next step and navigation | Fail: no prompt | Pass |
| Changed questions and navigation | Fail: no prompt | Pass |
| Omitted record, changed week, invalid date | Fail: no prompt | Pass |
| Import, empty replacement, malformed-file refusal | Fail: no prompt | Pass |
| Explicit plan retirement | Pass | Pass |
| Actual tab close: Stay then Leave | Fail: tab closes without prompt | Pass |

Candidate 9/9 groups pass, original 2/9 pass with seven consequential failures. Both have no page errors and no external requests. Candidate's 291 browser requests stayed on the temporary loopback server. Static source hashes are unchanged after execution. Candidate child PID114816 exited 0; original child PID117356 exited 1. Exact start/finish times, wrapper receipts, all requests and assertions are retained.

Both actual candidate note downloads are retained: 16,022 bytes SHA256 `5006aa5fd9b7b77c0bb8ad2991dcb8a4adfd05e647bddafcf37633d0fd325c34`, and 15,994 bytes SHA256 `ce088b37496ad46af3326ad2dee6c2c49eaa95557e894709ab470a7523d4e670`. The empty-notes file is an explicitly authored replacement control derived from a valid download, not a browser download. The original also produced one retained 15,994-byte note file before its import-departure failure.

## Other verification and review

Six new model methods and all fifteen existing venue-followup tests pass on local Node24.19.0 and actual native Node24.14.0. These cover exact default reversion, every note field, historical/omitted records, accepted/invalid replacement, rejection atomicity and question-history status. This is the scoped model course, not a claim that the complete Python or browser suite ran locally.

A separate worker reviewed the source and independently authored a thirteen-check model course, including duplicate-venue occurrences, restaurant/outing question differences, original-date defaults, hidden imported records, whitespace, source immutability and file preparation without false clearing. Its exact script and receipt are included. That review did not duplicate the browser run.

The full native retained-notes screenshot was inspected for the existing page, controls and new guidance. The native PNG stays at `C:/HAMON/acceptance/tastetable-notes-leave-2766b0fc/candidate-browser-qualified/retained-notes.png` and may be carried separately in a delivery packet.

## Retained receiver corrections

The initial receiver assumed Playwright reload would reject immediately when the real browser chose Stay. It instead waited for the cancelled navigation and timed out. The corrected receiver only accepts that specific reload timeout after exactly one actual beforeunload dismissal and a direct same-Document identity check; all following notes/export checks must still pass. A second attempt's malformed-file wait used the wrong wording. It was corrected to the current application's existing “Venue notes not opened:” text. Both initial runners and all failed result files are retained; no production change was made to satisfy these receiver mistakes. The final frozen runner also receives actual tab close.

## Use and limits

In the existing TasteTable planner, open or generate a week, enter venue notes and use Save venue notes or Save caregiver handoff to retain editable work. If the browser asks before leaving, choose Stay to finish saving, or Leave when ready. A prepared download leaves the reminder active because the page cannot verify file retention. Empty/default worksheets do not receive this warning.

Browsers control the generic message and may suppress it. The browser API requires prior interaction and is unreliable for some mobile/app-manager shutdowns; it does not provide storage or recovery. See [MDN beforeunload](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event). No physical mobile, Safari, Firefox, assistive-technology, crash recovery, backend deployment, provider or medical assessment is claimed. Changes to planner inputs and other explicit in-page replacements retain their existing behavior; this scope protects page departure only.

## Reproduction and evidence

`native/SOURCE-PINS.json` records the nineteen original paths and Git/SHA256 identities. Fetch those exact files at the original commit into sibling original and candidate directories. Apply the candidate's two static files and additive model test from the tested commit. The frozen `native/receive-departure.cjs` uses its own directory for those stages and records the local server, native inputs, source hashes, actual dialogs, downloads and result. `native/run-native.cjs` bounds execution and retains child exit/stdout/stderr. Its installed Chrome and Playwright paths are the actual MSI bindings; on another machine copy and adapt those paths, recording that distinct driver, instead of claiming the MSI receipt was rerun unchanged.

Run `node --test tests/venue_followup.test.mjs tests/venue_note_departure.test.mjs` in the candidate for the model course. Invoke the native wrapper with original or candidate for the browser course. The original is expected to fail the new protection assertions; do not treat its nonzero exit as an execution failure. All retained original/candidate files remain version-bound evidence, not a hosted deployment.
