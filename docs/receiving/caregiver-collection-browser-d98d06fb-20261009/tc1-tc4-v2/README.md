# Caregiver and collection browser receiver: TC1–TC4 source amendment

Status: INDEPENDENT SOURCE REVIEW ACCEPTED FOR TC1–TC4; BROWSER AND NATIVE RECEIVING REMAIN UNEXECUTED. The original 14 caregiver scenarios and six combined scenarios have not been executed by this amendment or its independent reviewer. Syntax parsing and source review do not establish native browser qualification.

## Exact product and receiver

The v2 receiver is bound to the installed TasteTable product base `a8dae9841044d8475c7afc641b4704e77153350d`, tree `6c62db79b15e47cd656fce39ab84da3aae858901`, including corrected `static/app.js` blob `1d5ac7bea1d7ee485ff5db20379d7c715c3df0d6`. Its 20 inherited source inputs were compared with the complete published tree and are guarded by exact Git blob identity before browser spawn. The v2 driver/helper pair also requires exact outer source admission; the driver does not embed its own hash recursively.

| File | Exact Git blob | Status |
| --- | --- | --- |
| `tools/check_caregiver_collection_browser_v2.mjs` | `bab795b6f0e255a0c4695306c6cb2d87f30df539` | Source only; unexecuted |
| `tools/caregiver_collection_browser_cases_v2.mjs` | `1ae59a9419f0f9c0ff2fd0b46cc9a6178ef8472b` | Source only; unexecuted |

## Bounded changes

| Finding | Source amendment |
| --- | --- |
| TC1 | Independently snapshot every input, select and textarea in the form before and after current refusal and cancellation. Compare complete ordered state, including values and checked state. |
| TC2 | Preserve a physical calendar download while B is already accepted in the existing scenario. Require the final B calendar to equal those bytes and still differ from A. |
| TC3 | Mark cleanup responsibility before admission dispatch; match exact hold identity; record native transaction completion/abort separately from requests, exceptions and unresolved admission. Enter bounded cleanup after failed or unreturned admission. Unknown closure prevents another case or admission. |
| TC4 | Independently require the old preview to be hidden and Apply to be disabled at each retirement boundary. Preserve all three positive pending-preview assertions. |

Five new driver edits and fourteen chronological case edits are reversible to the complete original combined sources. The prior packet's five edits then recover the original caregiver v4 driver. Its 14 original pass sites and the helper's five sites (one reached by each of two unchanged outcomes) preserve the original 14+6 scenario set. These are source cardinalities, not runtime results.

## Evidence and retained limitations

- `CONTRACT.original.json` and `PACKET.original.json` are unchanged original source artifacts.
- `INTERFACE.frozen.json` fixed the TC1–TC4 review boundary before the amended bodies were supplied to the independent reviewer.
- `SOURCE.forward-inverse.json` contains the complete edit proof; `original/` retains both original combined source bodies.
- `SYNTAX-ONLY.custody.json` contains complete actual commands and results. Node v24.19.0 constructed only unlinked `vm.SourceTextModule` objects. It never linked or evaluated either driver. Both parser processes exited 0; the original warnings remain.
- `history/cases.initial-syntax-draft.mjs.txt` preserves the first amended case body. Source inspection identified a canceled-before-open-success admission promise that could remain pending; the final body explicitly rejects it before recording termination without an owned transaction. This was a source finding, not a browser reproduction.
- `PACKET.pre-review.json` preserves the original source freeze and its historical peer-pending status. `PEER.source-review.json` records the subsequent independent source disposition (`a71383cf7dad8650d631ed88f1b957dba41c6564`). Its reviewer read the frozen interface and original findings before the amended bodies, then independently verified byte hashes, both directions of every edit, the v4 recovery and the unchanged caller interface in one data-only process (`6fe9d7`, exit 0). The `PEER.*` artifacts preserve that verifier and its actual evidence; the reviewer did not replay syntax or evaluate the candidate.

Only actual handlers installed on the owned native transaction set completion or abort closure fields. A terminal open that creates no owned transaction is labeled separately. Calling `abort()`, requesting a connection close, observing a blocked request or reaching a timer cannot establish native transaction or outer browser closure. A witnessed transaction may close while its open request is still pending, particularly after an unexpected-upgrade refusal; request terminality and outer closure remain separate in the observation. The original 8000 ms in-page deadline and inherited wait/CDP limits remain; they are not an OS hard deadline.

The original normal Chrome sandbox, GET-only static serving, 768 MiB disk / 1536 MiB free-memory floors, nominal 12 s startup, 15 s CDP timeout, 2 MiB ordinary artifact limit, original 6 MiB + 1 byte oversized fixture exception and 8 MiB aggregate limit remain exact. The extra B baseline download consumes the same existing limits. No new scenario, producer, model or resource allocation is introduced.

## Native receiving remains held

The existing owner is `chatgpt:c77045b4:windows`, routed through TasteTable #54/#55. Source publication is not a resident runtime lease or admission. The original v1/v2 failures, unexecuted v4/combined successor and every unknown or unreturned attempt remain retained.

Before any later native attempt, the existing owner must reconcile prior requested effects and current process/artifact/lease facts, including the previously identified `caregiver-e67e7d83-v4-windows-1`. Missing evidence remains unknown and cannot justify replay. Any later work requires the already mandated exact source and current resource/lifecycle admission; this directory supplies no new execution or allocation authorization.

This source addition does not alter the owner's optional read-only HTML/CLI scope, product files, existing receivers, tests, workflows or settings.
