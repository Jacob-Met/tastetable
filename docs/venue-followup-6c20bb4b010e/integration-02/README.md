# Current-main composition and maintained browser receiving

PR33 initially published the fully received venue worksheet at head `9e3b074abfebfd63a4d9563088ab16c39df17f00`. Main then advanced to `689ddc9a6a4f5f12068e1e99127cc77482c53924` / tree `25b453e345bedd3f280e3d555df12561ef084cc6` with the saved-week comparison feature.

The current README and index preserve that feature's README section and separate-tab link. Removing the venue additions from each composed file reproduces current main exactly. The venue module, stylesheet, app hooks and two venue tests keep their r4 bytes. All unowned current-main files are preserved.

## Actual hosted failure and correction

[Hosted job113396902773](https://github.com/Jacob-Met/tastetable/actions/runs/37802166908/job/113396902773) ran the PR merge checkout `e036da44da49b69ff49ec3f11571664a2228a581`. The original Python producer/converter group passed, then opening the native saved-week picker timed out. The receiver serves only static files listed in its explicit `sourcePaths`; both new venue assets were requested but omitted. The module graph therefore could not initialize. The original full log remains in [original-hosted-job-113396902773.log](original-hosted-job-113396902773.log). The separate maintained test job113396902824 succeeded.

The integration correction adds just `static/venue_followup.mjs` and `static/venue_followup.css` to that receiver's serving and source-hash list. Existing browser assertions, producer, converter, saved-week codec and application behavior are unchanged by this correction. [Owner coordination](https://github.com/Jacob-Met/tastetable/issues/25#issuecomment-6063725270) records the dependency.

## Current composed receiving

The corrected maintained receiver executed against the exact20-file current runtime subset plus the venue feature and composed index. **All9 groups passed**, with all20 source hashes unchanged, four actual native picker events, zero page errors and zero external page requests. It exercised the original Python producer, actual converter, raw-result refusal, native saved-file selection, keyboard arrangement, real JSON/ICS downloads, print generation, fresh390px reopening and empty results. Edited and reopened calendars are byte-identical (SHA256 `897118b4c349d341769f9d9fc3d53891ea5e61a987ba5e1b12ac8edb95e543e9`).

[The full text packet](native-week-receiving.json) retains source pins, the exact command, raw log, browser receipt and literal JSON/ICS inputs and outputs. Its SHA256 is `fad077af313e49b6960a8de83a2189883d64b80f0f00df294b125d7f75a90342` (111531 bytes). [The outer isolated staging driver](receive-composed-source.py) is retained; the maintained repository driver supplies all behavioral assertions. [composition.json](composition.json) records all24 incoming paths and the exact integration boundary.

This local result used Node24.19.0, Chromium153.0.8010.0 and the existing primary Python runtime. The hosted failure used Node22.23.3, Chrome154.0.8037.97 and Python3.12.3. A later hosted outcome belongs to its exact new PR head and must be read separately.

The receiver's HTTP bootstrap is an authored GET-only health/personas server. It does not run FastAPI or plan requests; the earlier r4 FastAPI and independent venue receipts remain distinct. The comparison page is preserved but not visited here. PDF/PNG artifacts were generated and hashed, then excluded from this text packet; there is no direct pixel/PDF-content or physical-print claim from this run.

## Evidence history

All earlier raw source, author and independent receipts remain intact. Their original source-freeze and publication manifests describe their historical revisions. The manifest in this directory describes the current composed publication and excludes only itself. This record supersedes the initial packet's description of hosted coverage; no old failure is relabeled as a pass.
