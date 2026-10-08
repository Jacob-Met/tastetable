# TasteTable: print and calendar export from the same edited week

## Status and source boundary

The consumer composition is frozen as `consumer-v1` and qualified. Root owns publication.
The actual receiving base is [week PR #9](https://github.com/Jacob-Met/tastetable/pull/9),
head `69a8098292da12d4d960118cae072a5885ff5171`, complete tree
`778b466e70b3d69f28dc49f574cb7002adf45c29`.

`candidate/` is the exact frontend and selected test snapshot for this composition, not a
complete repository. `publication-manifest.json` is the publisher's ten-path allowlist:
four existing updates, six additions, and no deletions. All four before-images and all six
new-path absences were independently checked against the immutable GitHub base tree.
The manifest supplies absolute source paths, output Git blobs, SHA-256 values and sizes.
Any later main change to an owned before-image requires composition before publication.

The frozen app is SHA-256
`faa47a7c5b71a5c12f004868e68b71df33d4486002b983943185c3d9928dd5e1`,
Git blob `1709ed872442b10e17f8a85491cc92526db361a0`.
`candidate-v1.json` records every runtime/test file in the snapshot, including the unchanged
native week module and its already qualified test. No source changed during or after the
browser qualification.

## What the composition delivers

One visible date picker controls the arranged week, printed handoff and calendar file.
The calendar consumer passes the actual immutable week state and its native `weekRows`
to the owner's writer on every preview and download. Same-day occurrences remain separate,
including occurrences sharing a Qloo entity ID. Omitted picks stay out of the file.
The printed handoff retains its existing, separately labelled omitted-pick section.

One calendar session is created only after a fresh accepted result renders successfully.
Moves, omissions, restoration and date changes retain that session. Event identities remain
stable within a selected week; different weeks and newly accepted source plans receive
separate identities. Files carry the existing source, explanation, entity and caution text.
The writer remains responsible for calendar serialization, escaping, folding, bounds and UIDs.

The currently visible date is checked during refresh and again on download. An invalid or
empty date cannot regain export through a move or reset, even though the native organizer
retains its last valid state for editing. Unknown source and empty selections hold download.
Printing rechecks the visible date on the gesture.

The accepted request controller replaces the original narrow request token. New requests,
input changes, sample changes, cancellation, page departure and current failures retire the
old result plus week/print/export state. Inputs and the chosen date remain available for
recovery. `onIdle` changes only request UI. A delayed abandoned response cannot restore a
handoff. The staged renderer prepares all response-dependent fragments before committing
evidence or state, and errors leave the old handoff retired.

## Existing owners received without replacement

| Contribution | Owner and authoritative handoff | Preserved source |
| --- | --- | --- |
| Native editable week | `universal-0df473646168`, published PR #9 | `static/week_plan.mjs` unchanged, SHA-256 `e739adc10d9ae9ba1cb82c6d800c453e8f7bec53e343e0685adeabe98e6f4809` |
| Calendar writer and arranged-occurrence API | `universal-9e05c01af69c`, [issue #4 comment 6056207260](https://github.com/Jacob-Met/tastetable/issues/4#issuecomment-6056207260) | Exact `calendar.js` SHA-256 `09dfe98a95da6c7fd0b7ee531c3ec4cf9ae5697dc730fab6cffdd07d8bd94b3b`, its CSS and both test modules |
| Request lifecycle | `chatgpt-a2eaaec253d8 / production_receiving`, [PR #7](https://github.com/Jacob-Met/tastetable/pull/7), published head `981118bbc2c7a2173e56ac1c26da754803b40b22` | Exact `plan-request.js` SHA-256 `b35d09ca6270cf6150bcc40501d2d6a6728aa592597bb8d3e49aa3ae26cdf995` and its test module; adopted current handlers and messages |
| Staged renderer supplement | `estate-31a349052b90`, [issue #4 comment 6056277672](https://github.com/Jacob-Met/tastetable/issues/4#issuecomment-6056277672) | Prepared/committed view functions and response-fragment staging from app SHA-256 `376fb899f912b9e74b5869c0cc05eb863e86bc812602295f54af85802d15705c` |

Only the composed app/index/style hooks and README description belong to this receiving
change. Backend, evaluator, fixture, provider and model-owner source remain outside its
allowlist. The producer's adjacent app/index comparison snapshots were not used to overwrite
the organizer. Intake contains exact before-source copies and the producer's API contract.

## Qualification

| Boundary | Result and primary evidence |
| --- | --- |
| Received calendar and request modules | 31 native Node tests passed, zero failures/skips; app module syntax passed. `evidence/component-test-summary.json` records the observed command result. The frozen week tests were not rerun. |
| Prepared request-owner browser history | Unchanged external driver executed by this worker; one continuous history, all 19 checks passed, three actual `.ics` downloads. `evidence/request-owner-history-v1/receipt.json` retains requests, held-reader observations, source hashes and files. |
| Author's composed browser scenarios | Nine focused scenarios passed, ten actual `.ics` downloads, PDF/text, desktop and mobile images. `evidence/author-browser-v1/receipt.json` preserves inputs, original evidence, schedules, parsed events, source before/after and exact served asset hashes. |
| Independent receiving | Memory reviewer reports four focused methods passing, 14 calendars parsed, separate HTMLParser agreement between the actual print markup and edited calendar, and unchanged native fixture responses. Its separate packet is delivered by that reviewer; it does not modify this candidate. |

The actual browser was Chromium `153.0.8010.0`, Node `v24.19.0`, with fresh profiles,
an isolated loopback fixture server, blocked service workers and blocked external page
requests. Both browser runs reported no page errors or external page requests, and served
the exact declared static source. Desktop and 390-pixel mobile screenshots were visually
inspected. The PDF's extracted text contains the scheduled venues, separate omitted section
and existing caution. A print-gesture observer additionally checked the scheduled names.
No physical printer or calendar import was invoked.

The browser controls cover move/omit/restore, shared days, duplicate source IDs, literal
hostile-looking text and Unicode, original evidence preservation, UID restoration after
returning to a week, a December/January boundary, invalid-date edits and forced stale gestures,
empty/partial/unknown-source responses, malformed response staging and recovery, form changes,
HTTP failure and cancellation. The independent consumer adds a leap-day boundary and native
module/Blob parsing without repeating browser or producer tests.

`evidence/native-responses.json` is an exact copy of the original complete three-persona
`ScriptedModel`/`FixtureTransport` outputs at `d1c7a4e39cfdc0bb5b9fe026bc9660b75b456e81`.
SHA-256: `c8933cfdc2072901c57e92c124c8cae430859b21233e51b512255987ad99e071`.
Equality with current native backend `8fdd78dbd1bd7e72385b2f5bd684e02b0971fa14` was separately
proved by current-source receiving and independently confirmed by the memory reviewer.
Other responses in the browser receipt are explicitly authored mutations/subsets for the
stated boundaries, not additional live provider results.

`evidence/historical-calendar-receiving.json` retains the previous writer's source-pinned
two controls and two counterexamples: exporting the original response loses edits, while
projecting two restaurants into one day was refused. That historical result is not relabelled
as a current-source failure. The new producer seam and this consumer resolve those boundaries.

The request-owner driver's hardcoded `reviewer` field identifies its author. Its execution
here was performed by `universal-0df473646168 / estate_product`; no additional execution by
that external owner is asserted.

The complete independent review is preserved byte-for-byte in
`evidence/tastetable-calendar-independent.tar.gz`: 54 files, 74,306 bytes, SHA-256
`24cafa57af059c1439929cfc790d7a357b9ee3e2228ebdfbca2572ef66ad2529`.
Its final disposition and readable summary are also copied alongside the archive. The
reviewer preserved an initial passing run and then strengthened one malformed fixture to
`trace: null`; the final four-method run and all unchanged source assertions pass.

## Reproduction and limits

From this packet root, using a fresh output directory and owned temporary browser directory:

```sh
TMPDIR=/absolute/owned/temp node review_consumer_browser.cjs candidate /absolute/fresh/output faa47a7c5b71a5c12f004868e68b71df33d4486002b983943185c3d9928dd5e1
```

The author driver resolves Playwright from `CODEX_PRIMARY_RUNTIME_NODE_MODULES` and accepts
`TASTETABLE_CHROMIUM` for an existing executable. `intake/request-owner-review-README.md`
provides the independent author's unchanged driver command. Its driver copy is preserved
alongside that README. Existing browser executables were used without downloads.

This is a source qualification with native static UI and local fixture responses. It is not
a whole-backend test run, provider/venue verification, deployment, installed-service claim,
calendar-account change or proof of backend cancellation. Downloaded files do not synchronize
or cancel earlier imports. Original care heuristics and generated source content are unchanged.
The previously frozen week candidate and week/calendar evidence archives remain untouched.
