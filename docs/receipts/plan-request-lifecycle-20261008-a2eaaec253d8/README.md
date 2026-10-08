# TasteTable current-input request lifecycle

Contributor: `chatgpt-a2eaaec253d8 / production_receiving`, 2026-10-08.

## User-visible correction

An earlier plan request could finish after a later request and replace its results.
The previous plan also remained visible during a replacement request and after a
replacement failed. For a visitor who has changed tastes or care constraints, the
visible plan could therefore describe inputs that are no longer selected.

The native JavaScript controller uses request identity as well as best-effort
AbortController cancellation. Only the current request may render a result or
error. Starting another plan, editing the input form, stopping the wait, or leaving
the page invalidates older requests and hides their results. Request errors remain
beside the editable form; deliberate API validation details use `textContent`.
Sample selection stays disabled until its choices load. No automatic retry is added.

## Source and ownership

The original is complete Git source at
`d1c7a4e39cfdc0bb5b9fe026bc9660b75b456e81`, fetched and checked against the live
default branch and `git ls-remote` before edits. The full tree contains no
`AGENTS.md`. Original `static/app.js` is blob
`2e6aa8b39d300c3d7dbd5f5bf7d9d819d835f132`.

Scope was announced before editing in
[TasteTable #4 comment 6055204594](https://github.com/Jacob-Met/tastetable/issues/4#issuecomment-6055204594).
At that check, open PR #1 touched CI/Docker only; #2/#3 touched the agent and their
focused tests. The calendar contributor owns its exporter/render hooks. A later
[week-organizer coordination record](https://github.com/Jacob-Met/tastetable/issues/4#issuecomment-6055338617)
explicitly accepts this lifecycle controller superseding that candidate's small
request-token guard during reviewed composition. The organizer/calendar receiving
owner retains that composition. This packet does not claim it has been performed.

The production delta is `static/plan-request.js`, the request handlers and small
status hooks in `static/app.js`, and the status/cancel/script hooks in
`static/index.html`. The original `render()` function is byte-identical, as recorded
in `source-manifest.json`; backend/provider/constraint source is unchanged.
The original and candidate browser receipts describe the actual working-source
bytes, rather than incorrectly treating the base HEAD as the modified source.

## Verification

| Boundary | Original | Candidate |
| --- | --- | --- |
| Adverse request order: newer response, then older response | Older plan replaces the newest inputs | Latest plan remains visible |
| Pending replacement, then HTTP 503 with HTML body | Old plan remains visible in both states | Old plan hidden; inline error; inputs preserved |
| Native request-controller suite | Controller does not exist in original | 8 tests pass, zero skips |
| Native Chromium acceptance | Both adverse controls fail with process exit 1 | 7 scenarios pass with process exit 0; zero page errors |
| Static-source custody during browser run | Before/after hashes match | Before/after hashes match |

The browser suite exercises the actual page, request handlers and renderer through
a temporary loopback HTTP server. Its plan bodies are authored synthetic responses
with the current `restaurant` kind and explicit mock source. The key adverse-order
controls deliberately use a fetch wrapper that ignores AbortSignal, proving that
request identity suppresses late completion independently of network cancellation.
A separate phone control uses the browser's actual fetch and AbortController,
observes an AbortError, and successfully requests a fresh plan afterward.

Other controls cover input changes while a response is pending, stale sample
errors after a manual request, useful HTTP 400 details rendered as plain text,
and pagehide invalidation followed by a new usable request. Desktop and 390-pixel
phone captures are retained. The phone case has no horizontal overflow.

The exact environment is recorded in the receipts: Node v24.19.0 and Chromium
153.0.8010.0. `node --check` succeeds for both production JavaScript files, and
`git diff --check` is clean. No backend source or backend test scope was changed;
these results do not represent a full Python/provider test run or hosted CI.

## Reproduce

```bash
node --test tests/plan-request.test.cjs
node tools/check_plan_request_browser.cjs
```

The browser command requires Playwright and Chromium. Set `TASTETABLE_PLAYWRIGHT`
to an installed module path and `TASTETABLE_CHROMIUM` to its executable if they are
not discoverable normally. Set `TASTETABLE_EVIDENCE_DIR` to a new receipt directory.
The harness starts and closes only its own browser and loopback server.

To repeat the negative controls, make a separate worktree at the original commit,
set `TASTETABLE_SOURCE_ROOT` to that directory, and execute the candidate's harness
with `--baseline`. The expected result is two observed failures and process exit 1;
the flag selects the two common controls and does not turn failures into passes.

## Receiving contract and limits

`TasteTablePlanRequests.create({send, onStart, onResult, onError, onIdle})` returns
`run(url, body)`, `invalidate()`, and `dispose()`. `send` receives the original URL,
body and AbortSignal. Callbacks are synchronous. `run` resolves true only when its
current response was rendered; a stale, abandoned or failed request resolves false.
`invalidate` aborts and retires pending work but permits later requests. `dispose`
also refuses future requests. Old completion cannot clear the newer loading state.

The application calls `invalidate` for input edits, Stop waiting and pagehide;
using invalidation on pagehide allows a preserved page to submit again. Organizer
controls belong outside the tastes/constraints form. During composition, hide the
shared results container and retire any separate export draft on invalidation so
old handoff controls cannot remain usable for superseded inputs. Keep the latest
accepted response as the only source for new week/calendar state.

Stopping a browser wait is not proof that server/provider work already started
has stopped. No provider call, real venue data, reservation, account or deployment
is used by this qualification. The pagehide check dispatches a native
`PageTransitionEvent` with `persisted: true`; actual browser back-forward-cache
admission is not established. Recommendation and care-constraint quality remain
outside this browser lifecycle qualification.

## Retained evidence

- `source-manifest.json`: base commit, runtime/test hashes and unchanged renderer.
- `original/browser-receipt.json`: exact-source negative reproduction.
- `candidate/browser-receipt.json`: exact-source seven-scenario acceptance.
- `candidate/controller-tests.log`: eight native JavaScript controls, zero skips.
- `candidate/latest-plan-desktop.png`, `candidate/fresh-plan-phone.png`: actual
  Chromium renders using fictional local fixtures.
