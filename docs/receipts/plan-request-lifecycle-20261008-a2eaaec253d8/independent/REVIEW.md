# TasteTable independent receiving review

## Decision

Accept exact revised source `e2489f3ecc18b57d8ffd461aafc741000a56554f`, tree `f4b3e4d08c06aaae419ca5a23549f15ac68e5d74`, for composition by the existing organizer owner. The predecessor `184186da3805bb2f434d2219ec0dc3f2f7b8e472` failed the independent persona-edit criterion.

The author reported that published head `7d123e9d9d402ed3c7018ef0921a8b38bba74463` still represents that predecessor. This acceptance must not be attached to the older published source. Publication remains subject to the coordinated GitHub rate-limit backoff.

## Independent finding and correction

The frozen candidate invalidated form input but did not observe the sample selector outside the form. In an actual browser, the reviewer first established an ordinary successful manual plan and expanded its trace disclosure. A sample A request then completed its loopback HTTP fetch and JSON parse, while the harness held the reader's asynchronous completion. Selecting fictional B left A active; releasing A displayed its result and the ready status beside selected B. The editable form correctly retained A, which made this a selector/request ambiguity under the required persona-edit contract rather than field corruption.

The author added exactly three application lines: a `personaSel` change listener calls the existing invalidation path and explicitly instructs the user to use Try a sample persona. Form values and constraints are preserved, and changing the selector sends no request.

The same independent browser history was executed once against the revision. All six checks passed: selection starts no request, preserves fields, aborts A, keeps its late completion hidden, permits a later explicit B request, and retains the expanded trace disclosure. The browser reported no page errors. This deliberately tests a response reader that completes after abort, beyond cancellation of the network request itself.

## Source and behavioral review

The request generation guard prevents stale success, failure and idle callbacks from changing current UI state. The form input path includes constraints; pagehide also invalidates outstanding work. Current failure and explicit Stop waiting preserve form values and return the request UI to idle. The application renderer is byte-identical to the original `d1c7a4e39cfdc0bb5b9fe026bc9660b75b456e81` renderer.

Runtime SHA-256 values for accepted source:

| File | SHA-256 |
|---|---|
| static/app.js | a77c583b2d7991ccfd401c96b01f09ebdd70c1ce7edab4c4181a9d751311ab54 |
| static/index.html | 34827c57d1bb3b81f11a56b5f4c905b2c88491c84bb1c8991ad61bca8dbe8f51 |
| static/plan-request.js | b35d09ca6270cf6150bcc40501d2d6a6728aa592597bb8d3e49aa3ae26cdf995 |

## Evidence and limits

`integration-ready-receipt.json` binds the decision to source and driver hashes. `frozen-evidence/receipt.json` retains the failure, and `candidate-evidence/receipt.json` retains the passing history, including selected persona, complete editable fields, constraint checks, active signal state, status, actual requests and disclosure state. `persona-invalidation.cjs` is the independent driver. Both evidence directories also hold the browser view after the delayed A completion.

This review used synthetic loopback responses and tested the request lifecycle and existing trace disclosure. It did not execute a provider or qualify recommendation output. The other owner's organizer/calendar implementation is absent from this frozen source; its final composition requires a receiving check for those widgets. The reviewer only wrote to this separate review directory and did not modify the author's source.
