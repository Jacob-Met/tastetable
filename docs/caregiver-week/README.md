# Caregiver week: receiving packet

The frozen candidate turns TasteTable's checked suggestions into a dated
Monday–Sunday organizer. A caregiver can move a pick, share a day, leave a pick
off the week, restore it, and print the current week. Reset restores the original
suggested weekdays while keeping the chosen week.

Each action preserves the response's original suggestions in a detached, frozen
`sourcePlan`. Assignments refer to those suggestions by position. Scheduled and
omitted cards retain the original entity ID, affinity, widened marker, and exact
check explanation. The original suggestions, rejected candidates, comparison,
and tool trace remain available in the evidence panel. Dates and assignments are
local to the current page visit.

The print handoff includes the chosen dates, open days, scheduled and omitted
picks, requested constraints, source notes, and the response's demo/live/unknown
provenance. The existing planning and care caveats remain visible. Invalid dates
preserve the prior state and hold the application's Print week control until a
valid date is supplied. A late older response cannot replace a newer response or
the caregiver's subsequent edits.

## Receiving identity

The target is `Jacob-Met/tastetable` main at
[`8fdd78dbd1bd7e72385b2f5bd684e02b0971fa14`](https://github.com/Jacob-Met/tastetable/tree/8fdd78dbd1bd7e72385b2f5bd684e02b0971fa14),
tree `e1bf3ec58b743e2b43d52ff79d52daf0116ef264`. A fresh read confirmed this
23-blob base after the separate owner changes were merged. All four existing
week before-images, including the root README, remain identical to the original
base. No source or README hunk recomposition was required. The six candidate
files remain byte-identical to local commit
`02c5e91f2c3e7220162b651ba3c1ec589ac2eea2`.

The local snapshot has separate ancestry from GitHub. The original
[candidate_manifest.json](candidate_manifest.json) and raw evidence retain their
historical `d1c7a4e…` base. The same six exact blobs are received on the current
base; [composition-receipt.json](composition-receipt.json) records that movement.
The local commit identifies the frozen source and is not a published GitHub
revision. Current native fixture replay is labeled separately below.

| Path | Receiving action |
| --- | --- |
| `README.md` | Update usage documentation |
| `static/app.js` | Add organizer handlers and print handoff |
| `static/index.html` | Add week, scheduling, and print controls |
| `static/style.css` | Add organizer and print presentation |
| `static/week_plan.mjs` | Add immutable source and calendar state helper |
| `tests/test_week_plan.mjs` | Add 11 focused state and date tests |

All 19 other files in the current receiving tree retain their owner blobs,
including the merged model selection, recommendation-error continuation,
constraint binding, purpose validation, Docker/CI, and related tests. This packet
adds no server, model, recommendation, constraint, persona, or fixture source
change. The separately owned calendar export contribution is also excluded.
[receiving-source.json](receiving-source.json) records each source hash, before
blob, retained file, and byte-preservation check.

## Existing verification

This packet combines already completed author and independent-review evidence.
Packaging added no tests, changed no source or test implementation, and ran no
new test suite. Reconciliation separately executed the three current native
fixture responses described below; browser, Node, and independent suites were
not repeated.

| Evidence | Recorded result | Readable record |
| --- | --- | --- |
| Author Node state/calendar suite | 11 pass, zero failures or skips | [Node log](author-node-tests.log) |
| Existing Python regression selection | 18 pass, one web test deselected | [Python log](author-python-regression.log) |
| Native Chromium baseline | Two checkpoints pass | `author/baseline-browser.json` in the archive |
| Native Chromium candidate | 11 checkpoints pass | [Final browser report](browser-final.json) |
| Independent state and handler review | Nine pass, zero failures or skips | [Review](independent-REVIEW.md), [log](independent-review.log), [run receipt](independent-review-run.json) |
| Current receiving native fixture comparison | All three complete persona responses equal the frozen browser inputs | [Receiving response snapshot](receiving-native-fixtures.json), [composition receipt](composition-receipt.json) |

The receiving comparison used the exact current `agent.py` blob
`15ae2c26dd14a8eec43dc328e87d6f12c8d460d2` with its unchanged native client,
evaluator, personas, and fixture. Explicit `ScriptedModel` and `FixtureTransport`
calls produced complete Rosa, Harold, and Mei responses equal to the originals
in the frozen browser fixture. This establishes compatibility for those three
synthetic responses while preserving the original browser and review source
pins. It is not a replay of the owner's broader backend test suite.

The author drove Chromium `153.0.8010.47` with Node `22.22.1`, a fresh profile,
and an ephemeral loopback server serving captured native synthetic responses.
The checks cover actual keyboard focus, local scheduling without additional API
calls, date validity, print visibility, a 390px layout, stale response ordering,
failed response preservation, hostile literal strings, and an empty native plan.
The archived screenshots and two-page fixture PDF were inspected by the author;
the print text extraction is preserved beside them.

The independent review used Node `24.19.0`, 159 Python-derived calendar vectors,
and 900 deterministic transitions across all three native synthetic persona
responses. It exercised the actual application handlers through an observational
DOM harness, including source conservation, print provenance, invalid dates,
response ordering, and request fields. Local edit/date/print actions made zero
fetches after that harness's two initialization calls. Its layout and print
findings are source and captured-markup checks; the author supplies the browser
and PDF evidence.

The original independent review predates the final browser-harness disposition
and remains unchanged. The later final browser report records all 11 checkpoints
passing. The retained earlier reports show two corrected harness assumptions:
focus was expected to stay on a pick after an explicit sample-button click, and
Chromium's embedded `data:image/svg+xml` date icon was classified as external.
The final harness permits embedded data URLs while rejecting external page
requests. The application files remained unchanged across those runs.

## Preserved raw evidence and replay

[evidence/raw-reviews.tar.gz](evidence/raw-reviews.tar.gz) contains **34 unchanged
raw files**: all 22 author files under `author/` and all 12 independent files
under `independent/`. It includes the original manifests, failed and successful
browser reports, exact harnesses, fixture inputs, source snapshot, patch,
screenshots, PDF, independent oracle, and review logs. The original nested
archives remain intact. Tar owner/time metadata is normalized; file contents
are preserved.

Archive SHA-256:
`1c3d99c81641fbb7966c2e50932e169f489f6c0b99881e34c75c5b09630113c9`.
[The archive manifest](evidence/archive-manifest.json) lists every member and
hash. [REPLAY.md](REPLAY.md) gives extraction and runtime commands using a fresh
output directory. [publication-files.json](publication-files.json) lists only
the six active paths and this receiving documentation/evidence directory.

The Python web test was deselected because FastAPI/httpx were unavailable in the
author's test runtime. Browser API responses and independent inputs are explicit
fixtures. The evidence establishes the stated source behavior; it does not
establish a deployed FastAPI service, current live venue data, provider adoption,
reservations, or clinical suitability. No installed source, service, or live
calendar was changed. Root owns repository publication and integration.
