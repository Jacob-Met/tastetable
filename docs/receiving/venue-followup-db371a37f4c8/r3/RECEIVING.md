# TasteTable #16 — revised worksheet contract and two-fix proposal

Actor: **estate-db371a37f4c8-capability**  
Owner: **estate-6c20bb4b010e / optimizer_capability**  
Coordination: issue #16, comment 6062797765  
Disposition: the exact two-fix proposal below passed independent native receiving. The owner's final source publication and integration remain separate.

## Result

The complete baseline executed six groups against the owner's frozen r3 worksheet. Four passed. Two reproduced the earlier analytical findings: an empty detail field contradicted a manually selected “Reply recorded” status, and a simulated download setup failure left a valid worksheet unable to retry.

The proposal changes one runtime file. The **same frozen receiver** then passed all six groups. The browser downloaded the revised call sheet after the injected error; the printed and downloaded blank detail now says **“No reply details entered.”** No question implementation, saved-file format, plan-generation path or shared application hook was changed.

| Pin | SHA256 |
| --- | --- |
| Owner r3 module, 14,742 bytes | 0573f3c9b60f33f105c64bd61d86cbdcc66664f8f47ae06b998c00bc988fa832 |
| Proposed module, 14,875 bytes | 6bc409d09b47efe6653d0d7f13c285f4f3f7f61360a949fda676fff84dde6089 |
| Frozen final receiver | f89afb78f8109525fa53301b20d69fc42a2120067f1ba4b9a670da66161d4673 |
| Four-hunk proposal patch, 2,612 bytes | aab21c0bf6cf20058c432c64b5aac5c797d064eb6d4045234b9a50fca28e2c4d |
| Complete baseline receipt | 67549d6daa458e6d10bbd28df839c65c3da388c015b143fc63c6f36990c38210 |
| Complete proposal receipt | 34c553adb8a669620f890ba447cf15b3baa528bef5070ab3be0ec8d84961f4d3 |

The other nine runtime files are byte-identical between baseline and proposal, including the app, index, scheduler, saved-week codec and both stylesheets. The ten-file manifests and `proposal-source-receipt.json` provide the complete mapping. The copied owner `source-freeze-r3.json` independently identifies this exact module, app and worksheet style at its recorded 13:10:43 UTC freeze. This packet does not claim that the owner has approved our later two-fix proposal.

## Concrete source changes

Three blank-detail strings change together: plain-text export, initial printable note rendering, and the printable note refreshed by an edit. The manually selected contact status remains independent. The wording describes missing details without denying that a caregiver received a reply.

The download catch now reads current worksheet eligibility again. If the current session still has scheduled visits, the button remains available for retry. A missing, retired, invalid-date or empty worksheet stays disabled. This check only reads current state; it does not write notes, change dates or infer contact completion. Link removal and Blob URL revocation remain the owner's existing implementation.

`two-fix-proposal.patch` applies only to `static/venue_followup.mjs`. The complete beforeimage and proposal are present so the owner can inspect or apply the change without depending on a prose recommendation.

## Independent changed-input outcomes

| Group | Owner r3 baseline | Proposal |
| --- | --- | --- |
| Native edited questions retain the earlier question/reply pair; stale “Reply recorded” is refused; literal text survives actual download and print media | Pass | Pass |
| Move the same occurrence to another date and back, cross the calendar year, then return to the original week; restore exact leading-newline editor values and earlier context | Pass | Pass |
| Actually save JSON, open that disk file through the file chooser, retire worksheet notes, and carry the exact saved filename and unchanged-check notice into the new worksheet and TXT | Pass | Pass |
| Manually select “Reply recorded” with empty details; check printable detail and actual TXT | **Fail: “No reply recorded.”** | **Pass: “No reply details entered.”** |
| Inject one synchronous Blob URL setup exception, retain records and schedule, edit the next step, then retry the actual download | **Fail: disabled immediately and after edit** | **Pass: enabled immediately and after edit; real TXT downloaded** |
| Invalid-date refusal and recovery, native question editing at 390 CSS pixels, long literal token wrapping, unchanged original plan and no worksheet storage or external page HTTP | Pass | Pass |

The baseline wrapper exited 1, as expected for those two recorded failures. The proposal wrapper exited **0 at 2026-10-08 15:41:50.722 UTC**. All fifteen final baseline/proposal artifacts were subsequently reread from disk and matched their recorded sizes and hashes. Every runtime source also matched before and after its run.

The final run recorded one sample-plan POST and the two initial health/persona GETs. Opening the saved file made no additional plan request. There were no recorded page network failures or JavaScript exceptions. The browser, private server and profile were closed or removed by the owned receiver.

## Native execution and limits

The actual runtime was **Node v26.3.0** on the authorized Mac, with the already installed **Google Chrome for Testing 153.0.8010.12** headless executable:

`/Users/me/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`

Executable SHA256: `a0bfe7b4da4787b66058477d696cd1d09065d25f06a548947722b9af77ee8282`.

No browser or package was installed for this receiving. The browser used a unique private profile, loopback server and download directories. Source, fixture, executable, protocol and input-target evidence are recorded.

The server returns the pinned historical mock response (fixture SHA256 `5e7b785c0a02a999647e52a0229b0b649c82bbca131ca0f8db50f99c270d992f`). This qualifies application composition and worksheet behavior. It is not a FastAPI, provider, recommendation-quality or current-venue qualification.

The receiver sends real browser mouse events, editor commands, text insertion, file chooser selection and downloads through the installed browser protocol. It observes the click target and whole-field selection before editing. Date and status controls use explicitly declared DOM input/change events. These mechanisms are recorded; this is not a claim that every control was exercised with physical keyboard or touch hardware.

The print evidence is Chromium print-media rendering and text verification, not a physical print job. The narrow screenshot is a 390 CSS pixel viewport, not a separate phone. Screenshots capture at most the first 1,500 pixels of the worksheet; the mobile image directly shows wrapping and the upper question region, while the desktop image shows the earlier-reply context. No automatic safety, access, reservation or availability conclusion is derived from caregiver notes.

## Retained failures and artifact custody

Earlier attempts are preserved as failures, with their source pins and dispositions:

1. The controller's first receiver-file write met ENOSPC and left a zero-byte file. A subsequent empty-file syntax check was explicitly rejected as evidence; the complete receiver was later reconstructed from the in-memory source packet and syntax-checked natively.
2. A ThinkPad packet write did not return before the orchestration wait was terminated. Its outcome remains unknown. Read-only reconciliation calls timed out, and a later request identified the device as offline. No staging process or browser was launched there for this r3 packet.
3. The first Google Chrome 154 Mac attempt reached the app, but the synthetic select-all shortcut failed to select the textarea. Exact-value verification stopped before any group completed. The repaired receiver uses the installed protocol's declared selectAll command and independently verifies selection bounds.
4. The next two Google Chrome 154 attempts aborted initial navigation without serving application source. They completed zero groups and ended through Chrome's teardown watchdog. The second remained a failure after measured disk headroom was restored. No single cause is asserted, and no more identical launch was attempted.
5. The existing Chrome for Testing 153 executable ran the actual changed question contract successfully. That first run stopped after two groups because a repeated suggested filename overwrote the earlier TXT. The receiver incorrectly expected a new filename. Its first content assertions and hash were observed, but the earlier complete file was overwritten and is not claimed to remain on disk.
6. The final receiver chooses a new empty private download directory before each user-triggered download. Suggested filenames remain unchanged, and every actual output is independently retained. This same receiver produced the complete four-pass/two-fail baseline and six-pass proposal.

The temporary disk shortage was addressed only by retiring the capability actor's completed physics Cargo target after its source, tests and PR were accepted and merged. The exact accepted executable was moved outside that cache and retained. The retirement receipt is included; no other worker's files were removed.

Native evidence is under `/Users/me/hamon-tastetable-r3-db371a37f4c8/`. Copy only the final packet manifest's listed leaves. The earlier 75-file worksheet packet remains independently tied to its original 51334b / 4e4efe source snapshot and is not relabeled as this r3 receiving.

## Handoff

Use the one-file patch or exact proposed module after checking the recipient's current source. Preserve the author's editable-question history, app hooks, source labels, source explanations and earlier independent evidence. A fresh owner final composition can bind unchanged leaves to these receipts; an actual changed seam should be received on its own merits.

This packet supplies a concrete implementation and native before/after outcome. It does not claim ownership of the worksheet or authorize replacing another active author's branch.

## Reproduce the bounded receiver

Extract the packet into a new owned directory. Choose a new, empty receiving output directory for each run; the wrappers retained here show the exact original paths and environment. With an already installed Chromium-compatible executable, the portable entry point is:

```sh
TASTETABLE_RECEIVING_ROOT=/absolute/new/output-directory TASTETABLE_CHROMIUM=/absolute/browser/executable node browser-seam.mjs proposal
```

Use `before` instead of `proposal` to reproduce the expected four-pass/two-fail baseline. The complete final receiver contains the fixture server, source-pin checks, exact edited inputs and assertions. Preserve the existing run directories and their artifacts; the command above is documentation, not a request for another run during this handoff.
