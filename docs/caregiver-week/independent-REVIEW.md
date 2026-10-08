# Independent TasteTable receiving review

**Disposition: no receiving blocker found in the frozen six-file candidate.**

Reviewer: `/root/memory_capability`, separate from the product author. Reviewed local commit
`02c5e91f2c3e7220162b651ba3c1ec589ac2eea2` in
`/workspace/scratch/0df473646168/agents/product/tastetable`. The parent commit is the author's
source snapshot of upstream `d1c7a4e39cfdc0bb5b9fe026bc9660b75b456e81`.

The candidate changes only `README.md`, `static/app.js`, `static/index.html`,
`static/style.css`, `static/week_plan.mjs`, and `tests/test_week_plan.mjs`.
No server, recommendation, constraint, fixture, or persona code was changed by the candidate.
The reviewer wrote only to this independent evidence directory. `source-before.json` and
`source-after.json` pin every tracked file; `source-stability.json` records their equality.

## Findings

The state helper stores checked suggestions in a detached, deeply frozen `sourcePlan`.
Calendar assignments live in a separate object keyed by suggestion position, so a move,
omission, restoration, or reset preserves source entity identity, original suggested day,
affinity, fallback marker, and the exact check explanation. `weekRows` and `offWeekPicks`
partition the same source suggestions; they cannot introduce rejected or ungrounded picks.

The page's event handlers use that state and update the organizer. They leave the original
suggestions, comparison, rejected candidates, and tool trace as received. Reset restores the
suggested weekdays while preserving the chosen calendar week. A new form response installs
fresh assignments for its suggestions and keeps the selected week. The request counter
prevents a slower old response from overwriting a newer plan or edits already made to it.

Dates are plain calendar values converted with UTC arithmetic. Invalid dates, including a
week whose final days would exceed year 9999, preserve the prior state and disable the
application's Print week control. A valid replacement recovers normally. The submitted
planning request contains tastes, city, and constraints; the organizer's chosen dates and
assignments are absent.

The print handler reads the current organizer state. Scheduled and omitted cards retain the
source Qloo ID, affinity, and exact escaped explanation; the print view includes requested
constraints, original notes, explicit open days, and the response's demo/live/unknown label.
That label comes from the response's strict boolean `mock` field, independently of the health
endpoint. The print stylesheet hides editing controls and the original comparison while
retaining the caregiver caveats, the synthetic-source label, and the planning-draft notice.

## Independent execution

`independent-review.mjs` passed **9 tests, zero failures or skips** with Node `v24.19.0`.
The command and complete output are preserved in `independent-review-run.json` and
`independent-review.log`.

| Check | Evidence exercised |
| --- | --- |
| Calendar oracle | 159 expected weeks computed with Python `datetime`, including leap-century exceptions, year boundaries, years 0001 and 9999, and rejected overflow weeks |
| Source conservation | 900 deterministic transitions across all three native synthetic persona responses; no lost/duplicated suggestions, original source mutation, or incoming response mutation |
| Actual organizer handlers | Move, omit, restore, reset, chosen week, original panel preservation, scheduled and omitted print provenance |
| Invalid date recovery | Actual date and print handlers preserve assignments, block printing while invalid, and recover with a valid date |
| Source attribution | Actual print handler uses mock/live/absent/nonboolean response mode while the health stub reports live |
| New form response | Actual submit handler sends only existing request fields, preserves week, and resets assignments for the new response |
| Request ordering | Later response and subsequent user edits survive the earlier response completing last |
| Empty week and escaping | All seven days remain explicit after omission; one original suggestion stays off-week; source name, explanation, and note are escaped in rendered markup |
| Print source review | Existing care caveats and explicit source survive the print CSS rules; controls and comparison are hidden |

Native fixture responses were regenerated using the candidate's unchanged `run_agent`,
explicit `FixtureTransport`, and explicit `ScriptedModel`. No provider or model request was
made. `build-fixtures.py` reproduces the fixture responses and date oracle.

The handler tests evaluate the exact production module bytes with `vm.SourceTextModule`.
Only an observational export of the existing state and functions is appended in the test
context. A deliberately small DOM records event handlers, attributes, rendered markup, and
the point at which `window.print()` is called. A fetch recorder accepts explicitly supplied
local responses and fails unexpected calls. Move/omit/restore/reset/date/print made **zero
fetches after the two initialization calls** in these tests.

## Scope limits

This review did not rerun the author's browser suite or produce another PDF. The DOM harness
does not calculate CSS, pagination, browser-native date widgets, or actual print output. The
print-layout findings above are source inspection plus the markup/state captured at the
application's print call. The independent fetch result is a handler-level observation;
it does not resolve or replace the author's separate Chromium request-harness assertion.

There is no claim of live Qloo adoption, live venue availability, medical correctness, or
production deployment. Existing meal constraints, model behavior, venue content, and backend
contracts were outside this requested review and remain unchanged.

## Replay

Run from this evidence directory, with the frozen product checkout available:

```bash
python3 build-fixtures.py
node --experimental-vm-modules --test independent-review.mjs
```

Set `TASTETABLE_REVIEW_SOURCE` to an equivalent checkout if it resides elsewhere. The pinned
fixture inputs and source manifests distinguish this run from any later source revision.
