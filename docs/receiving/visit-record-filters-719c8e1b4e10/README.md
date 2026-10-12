# Visit-record filter browser checkpoint

**Status: blocked; complete browser acceptance has not been obtained.**

This independently executes the existing receiver for [TasteTable PR #88](https://github.com/Jacob-Met/tastetable/pull/88), preserving its authored source. The source owner and earlier source review retain their attribution. This checkpoint adds receiving evidence only.

## Exact source

- Original: `bce1c08618a208b2d80f3e36e747ae7315616038`.
- Candidate: `db9ec366ea0b0a82f729ef61700e31842168da0a`.
- Candidate tree: `6e563492e887128c35bafb14965ae4526f5e36ca`.
- Authored receiver blob: `299c663abcdc4ac7b9ed70a9902afebd565bfec1`.
- Authored receiver SHA-256: `98a48b4507a55655cff20dc5a501a6001d1791d619454bd9a0fd75da9c7fba55`.

Fifteen original/candidate source placements (ten distinct blobs) were admitted with their byte lengths, Git blob IDs and SHA-256 hashes. They include six original browser assets, eight candidate assets and the receiver. Every placement remained byte-identical after execution on both machines.

## Observed results

| Native route | Original | Candidate |
| --- | --- | --- |
| ThinkPad: Node 22.22.1, Chromium 153.0.8010.47 snap | Six-occurrence file opened; filter controls absent; exit 0 | First two behavior groups completed, then full-record download wait failed; exit 1 |
| Mac: Node 26.11.0, Google Chrome 154.0.8037.99 | Same original absence check passed; exit 0 | `CDP timeout Page.navigate` before candidate assertions; exit 1 |

The two completed Linux groups cover literal/Unicode venue and note matching, every outcome, intersection, no-match recovery, stable original numbers, focused edits, and invalid-draft visibility with the existing export refusal.

The download observer confirmed an enabled visible save button, zero invalid fields, one actual click and the application's **Download requested** status. Chromium emitted a download for the expected **3,887 bytes**, then canceled it at **0 bytes received**. The fresh temporary browser's own downloads page reported **Failed - Download error**, with recorded dangerType `0`. The underlying cause remains unresolved. No physical completed download was obtained.

One alternative used the unchanged authored receiver with its output inside Chromium's writable application area. The same download wait failed. One separate native Mac route was then attempted; its candidate navigation failed before download testing. Neither route is relabeled as acceptance.

The original and candidate courses create fictional files and temporary browser profiles. Both authored receivers reported browser exit; a subsequent process check found **zero matching owned browser processes** on both machines. Their temporary loopback servers ended with the receiver processes. Page-level external-request and error observations are retained in the receipt; they do not constitute a browser-wide network audit.

## Evidence and remaining work

[receiving.json](receiving.json) preserves the command results, original absence controls, partial candidate checks, raw download observations, alternative route and final source/process checks.

[download-diagnostic.mjs](download-diagnostic.mjs) is the final source-observed diagnostic copy of the author's receiver. It records activation and Chromium's canceled-download metadata; it never turns cancellation into a pass. Two earlier diagnostic-only failures—returning a ShadowRoot by value and serializing internal BigInt metadata—are recorded distinctly and have no product-test credit.

A diagnostic invocation requires an explicitly selected existing browser, source checkout and new output directory:

```sh
node docs/receiving/visit-record-filters-719c8e1b4e10/download-diagnostic.mjs --browser /path/to/chrome --source-root /path/to/source --output /new/receiving-directory
```

Physical full-record download, print/PDF, later replacement and keyboard/viewport checks, and the empty-record course remain unqualified. The earlier author's 165 Node tests and source review are not rerun or claimed as this checkpoint's results.

All product files and the owner's PR head remain unchanged. No PR comment, ref update to the owner branch, main adoption, workflow run or installed-service change is part of this checkpoint. The three exact workflow files were read and select PRs or main pushes only.
