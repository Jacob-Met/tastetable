# Independent browser acceptance: composed TasteTable week and calendar

**Accepted: all 14 independent browser checkpoints passed against the existing owner's exact frozen `consumer-v1` source.** The unchanged receiver downloaded 18 real calendar files, recorded 36 UI snapshots and preserved an 88-event request timeline. No product source was edited. This directory adds evidence to the calendar producer PR without replacing the existing owner's frontend composition or changing runtime files.

## Source and execution boundary

The actual receiving source came from the existing owner's frozen `week-calendar-integration/candidate` packet. Its HANDOFF identifies `consumer-v1`; all 12 files matched [owner-candidate-v1.json](owner-candidate-v1.json). The base is organizer PR #9 head `69a8098292da12d4d960118cae072a5885ff5171`, tree `778b466e70b3d69f28dc49f574cb7002adf45c29`.

| Input | SHA256 |
| --- | --- |
| Composed app.js | `faa47a7c5b71a5c12f004868e68b71df33d4486002b983943185c3d9928dd5e1` |
| Owner manifest | `9843dad9ce68a55d14b0091e1c08481d83407c299810f0a4dadf9d4f3f223c9d` |
| Received calendar.js | `09dfe98a95da6c7fd0b7ee531c3ec4cf9ae5697dc730fab6cffdd07d8bd94b3b` |
| Native week_plan.mjs | `e739adc10d9ae9ba1cb82c6d800c453e8f7bec53e343e0685adeabe98e6f4809` |
| Received plan-request.js | `b35d09ca6270cf6150bcc40501d2d6a6728aa592597bb8d3e49aa3ae26cdf995` |
| Fresh native fixture bundle | `b3907f9924267e9e386c9054daf7ac486fc3a8f38ad87e1756b9af52b46d7ce7` |
| Unchanged independent harness | `d9db7574071ab3c3b5570c44b492492b37c399c8a7457ec7da0812129d48fc09` |
| Complete input pin | `1e310b55e8e91e8ccda5194414e2a80254e2a648da7a0dca48645a28d0633a72` |

The [assembly receipt](assembly-receipt.json) records seven actual static files plus four unchanged Python imports and fixture JSON used to validate the captured native responses. No substitute app, controller, calendar implementation, fetch or JSON reader was supplied. Backend capture is from `8fdd78dbd1bd7e72385b2f5bd684e02b0971fa14`, using explicit `ScriptedModel` and `FixtureTransport`; the harness checks its import/data hashes. This does not qualify the separate later backend-note change.

The actual controls are `#calendarDownload`, `#calendarSource` and the single visible `#weekDate`. Source inspection confirmed that download revalidates the visible date and actual native state/rows, with controller and writer scripts loaded before the app module.

Execution: **2026-10-08T10:08:23.768Z–10:08:32.597Z**, exit 0, existing Mac Chromium **153.0.8010.12**, Playwright **1.62.0**, Node **v26.3.0**, macOS arm64. The receiver used a fresh browser/context and owned loopback fixture server, blocked external page requests and service workers, and made no provider call.

## Decisive observations

| Checkpoint | Observation |
| --- | --- |
| Initial result and one date picker | Actual downloaded dates/names matched the displayed arranged week; exactly one date picker was visible. |
| Moves and shared days | Two restaurant picks moved to Wednesday produced two distinct events that day. |
| Invalid date through move/reset | Empty visible date disabled export. Move and reset did not re-enable it; correction recovered. |
| Omissions and restoration | Omitted picks stayed out; all picks off-week disabled download; reset restored exact bytes and UIDs. |
| Selected week and identity | Another week received distinct UIDs. Reset kept that week; returning to the previous week restored exact bytes. 2027-01-01 resolved to Monday 2026-12-28. |
| Native partial and empty results | Restaurant-only, outing-only and all-unavailable responses replaced previous occurrences with 4, 1 and 0 picks. |
| Provenance and malformed replacement | Missing `mock` provenance and `plan.notes=null` could not retain old export; valid recovery succeeded. |
| Older held headers | Releasing an older response after a newer accepted result left the newer calendar byte-identical. |
| Older native JSON reader | Releasing an older half-delivered JSON response left the newer calendar byte-identical. |
| Older reader while newer request waits | The newer request retained busy state and retired export when the older reader settled. |
| Explicit cancellation | Export stayed retired through the old native reader's completion; a new request recovered. |
| Current-input change | Export stayed retired through the abandoned native reader's completion. |
| HTTP failure and recovery | A current failure could not expose an old plan's export; a valid response recovered. |
| Mobile and script errors | The 390px document had no horizontal overflow; original screenshots were inspected; page errors and dialogs were empty. |

All exported occurrences retained entity IDs, source explanations and native plan notes, with tentative status. Stable bytes were compared within the same accepted session across reset, restored week and delayed-response boundaries. New accepted plans intentionally receive new sessions.

The request trace records 25 native HTTP plan requests, four partial JSON sends and four tail releases, browser-observed `net::ERR_ABORTED` outcomes and whether each socket had already closed. These are observed browser cancellation semantics; no abort-ignoring fetch was substituted, and backend computation cancellation is not inferred. Source pins stayed unchanged. Context, browser and loopback server all closed successfully.

## Evidence files

- [composed-ui-review.cjs](composed-ui-review.cjs): unchanged independently authored executable receiver.
- [input-pin.json](input-pin.json): static source, native imports/data, fixture bundle, selector configuration and harness hashes.
- [assembly-receipt.json](assembly-receipt.json): original paths, all 12 owner checks and explicit fixture-provenance boundary.
- [owner-candidate-v1.json](owner-candidate-v1.json): exact owner before/after source manifest.
- [composed-ui-result.json](composed-ui-result.json): unchanged result, downloaded event records, UI snapshots and request timeline.
- [receiving-packet.tar.gz](receiving-packet.tar.gz): complete source/evidence, fixture bundle, configuration, command/stdout/exit status, 18 calendars and two original screenshots.

The archive is **763,798 bytes**, SHA256 **`eb0ada205521b2ce1fe8f81daa42d688a1a11be7cc6a8ce347b6fb212dbcbc89`**, Git blob **`837528bc7fbcd7c2903d1defb10611ed43862a5e`**. It contains 44 members: 43 manifest-listed payloads plus their manifest. Every payload was byte-verified after transfer from the Mac. Raw result SHA256: `5bd7087964899da3471ab000a20adffe1802a00f55d5be15465bdc9194128c0d`.

Original captures inside the archive: `run-v1/composed-week-desktop.png`, SHA256 `ef5d9465767c16d4848f9ec1a6af33764ad385f20da0cb45b1c7e70c24dfafb1`; and `run-v1/composed-calendar-mobile.png`, SHA256 `2340ab8ce84bef1270569296b939697975e1b4bf05bcbedaed059a130139a393`.

## Reproduction

Verify the archive SHA256, then extract it into a new owned directory. Supply an existing Playwright package and Chromium executable; the receiver neither installs nor downloads browsers. Every argument must be absolute, and the artifact directory must be new and outside `source/`.

```sh
node /absolute/extracted/composed-ui-review.cjs \
  --root /absolute/extracted/source \
  --fixtures /absolute/extracted/fixture-bundle.json \
  --config /absolute/extracted/config.json \
  --pin /absolute/extracted/input-pin.json \
  --artifacts /absolute/new-replay-output \
  --playwright /absolute/existing/playwright/package \
  --chromium /absolute/existing/chromium
```

The pin is portable: it hashes file bytes and relative source paths. Original absolute capture paths remain in the separate provenance receipt. Do not regenerate the pin simply to accept changed inputs. A replay creates fresh session namespaces and timestamps, so separate executions need not produce identical archive bytes; the identity relationships asserted within each session remain the same.

## Coordination and limits

The source pin and scope were delivered before execution in [issue #4 comment 6057473262](https://github.com/Jacob-Met/tastetable/issues/4#issuecomment-6057473262). Acceptance and artifact hashes were delivered to the existing composition owner in [comment 6057746953](https://github.com/Jacob-Met/tastetable/issues/4#issuecomment-6057746953). Existing owners retain composition and source publication. This reviewer made no product edit or frontend merge.

This is source-qualified local browser receiving with explicit synthetic native responses. It is not a deployed endpoint check, real provider or venue verification, proof of backend computation cancellation, real calendar import, physical-print test or qualification of a later backend-note candidate. Downloading a file does not update or cancel earlier imports. Component tests, producer standards checks and author browser evidence remain separately recorded results; this packet records only the independent 14-checkpoint run.

