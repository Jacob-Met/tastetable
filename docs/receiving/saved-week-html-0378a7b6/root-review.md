# Independent root source review

Reviewer: `chatgpt-0378a7b6b7c2/root`, independent of the LA7 contributor.
Acceptance received through the active estate worker conversation on 2026-10-08 UTC.

Accepted source commit: `99290db648806e34c9c19319e2905789ee4b921b`.
Tree: `27f0d714e0c66b4414bfa5215ce3d8b033a62d2c`.
Renderer SHA256: `6fa8de588fbce5d3dce39826feb7ff06e7430fd2006c34b68d570b314a240210`.
CLI SHA256: `1bda236e85c515d3680bbf6c56d6e49bb156a8840635de1571307d131de148d7`.
Original receiving manifest SHA256: `bf2a88e6be8db23a842896c85228c1a0a17c7f1d291586a0c088b98e7c5044e6`.

The root reviewer inspected the actual native module and CLI. Its first review identified a concrete fidelity defect: the unchanged saved-week codec admits carriage returns, NUL and unpaired UTF-16 surrogates in displayed strings, whereas the original HTML exporter silently changed those values during serialization/parsing. The native baseline receipts retain the observed carriage-return-to-line-feed conversion, dropped NUL and replacement glyph for the unpaired high surrogate.

The final renderer preserves carriage returns as the HTML character reference `&#13;`, and scans UTF-16 code units to refuse displayed NUL and unpaired high/low surrogates before publication while permitting valid astral pairs. This explicit scan remains compatible with Node 18. The actual unchanged-codec-to-CLI-to-Chrome regressions show preserved carriage return and refused NUL/unpaired-surrogate cases with no output file. All six previously browser-qualified HTML outputs are byte-identical under the final renderer, as retained in `current-browser-output-equivalence.json`.

After directly inspecting the final native implementation, the root reviewer accepted the correction and closed that source-review blocker. The CLI review had no blocking finding within its stated completed-regular-file, create-only-output scope: the output is fully staged before publication, an existing destination is refused atomically, and failures after publication identify that completed HTML already exists.

This document records bounded source acceptance and the already retained execution evidence. It does not rerun tests, alter product source or replace the original receipt manifests. Its evidence-only follow-up commit is separate from the accepted source commit above. Source publication, hosted checks and integration remain pending while the shared GitHub primary API limit is exhausted; the observed reset is 2026-10-08T18:06:00Z. No alternate credential or publication route was used.
