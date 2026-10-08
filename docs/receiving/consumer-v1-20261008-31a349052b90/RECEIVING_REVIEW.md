# TasteTable consumer-v1: independent late-render receiving

**PASS — eight actual browser histories, 32 actual calendar downloads, 24 authored plan responses.** The existing composition owner's `consumer-v1` source passed all selected malformed-render, retirement, recovery, date and calendar occurrence controls. Chromium was `153.0.8010.0`; Node was `v24.19.0`. There were zero unhandled page errors and zero external page request attempts. The browser and loopback server were closed after the run.

## Exact receiving authority

The owner froze `consumer-v1` in `HANDOFF.md` under `/dev/shm/universal-0df473646168/product/week-calendar-integration`. The [existing coordination thread](https://github.com/Jacob-Met/tastetable/issues/4#issuecomment-6057473262) supplied its concrete manifest and selectors. The owner then confirmed that the same freeze was being published while saved-week continuation was taken separately in [comment 6057603876](https://github.com/Jacob-Met/tastetable/issues/4#issuecomment-6057603876).

- Owner manifest SHA256: `9843dad9ce68a55d14b0091e1c08481d83407c299810f0a4dadf9d4f3f223c9d`.
- Composed app SHA256: `faa47a7c5b71a5c12f004868e68b71df33d4486002b983943185c3d9928dd5e1`; Git blob: `1709ed872442b10e17f8a85491cc92526db361a0`.
- Full browser report SHA256: `721ec0f10b0ea6c1e399cba37eeb394d9ec3f7b3def00da8462fa3c9fee21d31`.
- Receiver SHA256: `e2618f7b070c8aada20fe6a8d58ffd42b947973216f13365bfa7f7e128067db9`.

All 12 candidate files were copied literally to our separate receiving area. Each file matched the owner's byte length, SHA256 and Git blob both before and after execution; the original owner files and receiving copy still matched after the run. The three producer modules remain the exact published calendar, lifecycle and week modules recorded in `carrier/published-modules.json`. No application, producer, backend, provider or owner-worktree file was edited.

This is acceptance of an **unpublished manifest freeze**. No Git commit has been invented for it. At the receiving read, main was `b8d384e5522e17cf15d73e8b06adbe6665e4bdcc`, tree `06409d6f67d0c99ee99305fe4f745963ec2da2a2`, following the separate model-argument recovery merge. Its app remained the earlier organizer blob `fab0cb5398d3e6553373a99d9d56afa92f2bfcbb`. A later published composition must be bound by exact source readback before carrying this receiving result forward.

## What executed

The driver served all seven static files without replacement or instrumentation and queued authored JSON bodies through ordinary loopback HTTP responses. It did not replace the app, controller, `fetch`, `Response`, event handlers, calendar writer or DOM methods. All plan data was fictional; the `mock: false` source-label control was also authored and does not claim a real provider result. Page requests outside the private fixture origin were blocked and recorded.

Each of these eight incoming malformed bodies followed an accepted, locally arranged week:

| Malformed field | Browser result |
| --- | --- |
| `plan.notes = null` | Passed |
| `trace = null` | Passed |
| `comparison.constraints` as a string | Passed |
| `comparison.constraints` as an array-like object | Passed |
| `llm_only.meals = null` | Passed |
| `llm_only.outing = null` | Passed |
| First meal's affinity as a string | Passed |
| Rejected candidate's `failed = null` | Passed |

For every history, the preceding accepted fixture contained seven meals plus an outing, with two meal occurrences deliberately sharing an entity ID. The driver selected `2026-12-30`, moved two meals and the outing onto Thursday beside its existing meal, and omitted another meal. The actual downloaded calendar contained the seven included occurrences, four on Thursday, with unique occurrence UIDs and dates for the Monday–Sunday week beginning `2026-12-28`.

The malformed replacement then hid results, disabled print and calendar export, and displayed a visible error status. The raw chosen date remained `2026-12-30`. This follows the composition owner's deliberate retirement contract; it does not assert that the old plan remains actionable during or after a failed request.

Every case then accepted a fresh partial fixture, alternating between two meals with no outing and an outing with no meals. Original evidence and assignments came only from that fresh source. Actual calendar bytes matched names, original explanations, entity IDs, dates, exclusive end dates, tentative status and included occurrences. A fresh accepted source produced a new session identity. A subsequent local move and restore kept that accepted source's UIDs stable and issued no additional plan request. Thirty-two downloads contained 92 verified VEVENT records in total.

## Why this supplements the existing receivers

The calendar owner separately received broad arrangement, invalid-date and delayed-reader histories; the lifecycle owner supplied its existing request histories. This packet adds the later renderer exceptions beyond the notes-null case without repeating those wider suites. Stale response/reader behavior, provider execution, native backend results, deployment, real calendar import and saved-week continuation are not newly qualified here.

The preparation preflight already passed three focused native JavaScript checks. Its fixture boundary check showed that seven of these eight malformed render bodies can pass the calendar writer's own input requirements; only notes-null fails there. Actual composed rendering therefore needed this separate receiving run. These preflight results and their unchanged runner are preserved under `preparation/`.

The original standalone atomic-render negative controls and unchanged earlier browser runners remain in the [previous durable receiving packet](https://github.com/Jacob-Met/tastetable/tree/e1994ba62621bd09fa50e576bf8d022ecec0c552/docs/receiving/atomic-render-20261008-31a349052b90). That exact baseline failed the malformed-notes control and six of seven later histories while retaining its already-passing early affinity failure. Those historical baseline failures are not claimed as fresh executions against this combined calendar/lifecycle harness. `original-runners-preserved.json` records that both earlier local scripts remain byte-exact.

## Carrier adaptation and replay

The prepared composed receiver was frozen at SHA256 `0ff45c01f8ed05d5764528335ae8823dd0746b88813aef9132480da44107bf3d`. The receiving copy changed only its authority gate and report identity to authenticate the actual unpublished manifest, validate all 12 frozen files, and avoid claiming a nonexistent commit. Browser histories and assertions are unchanged. `carrier-adaptation.json` and the original prepared driver preserve this adjustment. Selectors resolve to actual `#form`, `#sampleBtn`, `#requestStatus`, `#calendarDownload` and `#calendarSource` controls.

From this packet's extracted root, using an already installed Playwright package and Chromium executable:

```bash
node carrier/review-composed-late-render.cjs --root source --pin resolved-owner-pin.json --check-pin
node carrier/review-composed-late-render.cjs --root source --pin resolved-owner-pin.json --output /absolute/new/output-directory --chromium /absolute/existing/chromium --playwright /absolute/existing/playwright-package
```

The output directory must not exist and its parent must exist. No dependency installation is required by the packet. `source/` contains the exact 12 owner files; `run-v1/` retains the complete report, all authored fixtures and all downloaded calendar bytes. The manifest inventories every packet member by bytes, SHA256 and Git blob. The archive receipt sits outside the archive to avoid a self-referential digest.

Composition authorship and integration remain with the existing owners. This receiver authored the malformed-render tests; the parent authored the staged-render source fix and the existing composition owner integrated it. This run independently receives that owner's later composition. No merge or release acceptance is implied.
