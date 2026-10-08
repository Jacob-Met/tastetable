# An edited week shared consistently by print and calendar

This composition connects TasteTable's existing editable caregiver week to calendar export and the accepted request lifecycle. The visible date and current occurrence assignments control both outputs. Moving two picks onto one day keeps two events; omitting a pick removes its event. A replacement request, input change, cancellation or current error retires the previous handoff. Response-dependent fragments are prepared before the displayed result is committed.

## Exact source and attribution

The ten source paths are recorded in [production-paths.json](production-paths.json). Their four before-images match receiving main `9f9105c29ab1a68a501b5f4c0b7180f0db968d38`, tree `778b466e70b3d69f28dc49f574cb7002adf45c29`; the six added paths are absent there. The native week module and all backend/provider/evaluator files are inherited.

- Calendar writer and two test modules are byte-identical to [producer PR #10](https://github.com/Jacob-Met/tastetable/pull/10), head `674e67aa7cc5c1d7618da9cc9ba3047ebca73206`.
- Request controller and its test are byte-identical to [lifecycle PR #7](https://github.com/Jacob-Met/tastetable/pull/7), head `981118bbc2c7a2173e56ac1c26da754803b40b22`.
- Calendar CSS comes from `universal-9e05c01af69c`'s original source handoff and the recorded intake manifest; it is not a file in PR #10.
- The staged renderer is received from `estate-31a349052b90`'s [source and evidence packet](https://github.com/Jacob-Met/tastetable/tree/e1994ba62621bd09fa50e576bf8d022ecec0c552/docs/receiving/atomic-render-20261008-31a349052b90).

[Source proof](source-proof.json) records those exact identities. [HANDOFF.md](HANDOFF.md) explains the consumer contract, original ownership, API and reproduction. The source remains the qualified `consumer-v1` app, SHA256 `faa47a7c5b71a5c12f004868e68b71df33d4486002b983943185c3d9928dd5e1`.

## Receiving and evidence

The received calendar/request modules pass 31 native Node tests. The composed app passes nine author Chromium scenarios with ten actual downloads, plus the unchanged request-owner driver with nineteen checks and three downloads, executed by the product worker. Four separate receiving methods independently parse fourteen calendar files and compare the complete edited occurrence set against print markup using Python's standard HTML parser. Author browser/PDF evidence and independent module receiving retain separate attribution.

The complete [raw-reviews.tar.gz](raw-reviews.tar.gz) archive preserves 55 outer files, including original source, both browser drivers, original counterexamples, receipts, actual downloads, screenshots, print PDF/text and the 54-file independent review archive. Its 1,486,669 bytes have SHA256 `6479c93ff3d353906693be5796e9c5be7b8b75298f606edc43d81575fa180b03`. Every archived member matches its source bytes. [Independent review](independent-review.md) and [disposition](independent-disposition.json) are available separately for inspection.

The archive is a reproducing packet. Extract it to a fresh directory before using the commands in its HANDOFF; absolute paths in frozen manifests describe the original receiving workspace. The directly readable [browser driver](review-consumer-browser.cjs) is the exact archived author driver. Hosted checks belong to the source pull request and are not claimed by these local receipts.

## Practical limits

The browser used an isolated loopback fixture server and fresh Chromium profiles. These results qualify the composed source; they do not demonstrate external providers, a deployed service, a physical printer or import into a calendar account. Downloaded files do not synchronize or cancel earlier imports. Existing source labels and care cautions remain attached to the suggestions.

