# Owner adoption of TasteTable PR38's two worksheet fixes

This packet applies the external four-hunk proposal to the existing #16/#33
owner's current module. It preserves the paired-event guard that prevents a
second native event from erasing a refused revised-question status change.

## Exact source

- Existing owner frontend: f3e72efb13844b7cd8e5cdd5d14c6a21941351c4.
- Native backend and fixtures: e0f6fbaf1f81fbb1e9926948294549c744228def.
- Current constraints.py: f18e4d5ffa14d8a02db2fe9ec6e97a6c0e45e8ebdab1e158124a66f7dd113efa.
- Before module: 1635bc5f1e4377325528214af071bc1242be65eeaa57ed4e5ac41a350a1cd077.
- Adopted module: b27315a0bc526f44863a9b8b39c0a217208edbd722a25cba72419f6d34456835,
  15,053 bytes, Git blob fa8575ab921070fd008c1e2b45705bf3d4a09d75.
- External patch: aab21c0bf6cf20058c432c64b5aac5c797d064eb6d4045234b9a50fca28e2c4d.

The patch changes the three blank reply-detail outputs to **No reply details
entered.** and recalculates current worksheet eligibility after a download
preparation exception. An eligible sheet can retry. Existing unavailable or
empty sheets remain disabled. Contact status remains caregiver-entered.

The current module minus its exact paired-event guard is the external
qualified r3 beforeimage. The adopted module minus that same guard is the
external browser-qualified proposal byte for byte. The guard occurs once.
The original module, prior authored/independent receipts and other application
files were not edited.

The external report, full 92-file archive and six-group qualification are
preserved in [merged PR38](https://github.com/Jacob-Met/tastetable/pull/38).
That complete receiver is SHA f89afb78f8109525fa53301b20d69fc42a2120067f1ba4b9a670da66161d4673.
The similarly named local browser-seam.mjs was checked and remains the
documented zero-byte failed-write artifact. It was not executed or described
as that qualified receiver.

## Focused current-native receiving

The same newly authored probe, SHA
8bb20ab73e651f64867eb8e66e1d465dfb21e7502afddf62b898fc8ea0669203,
ran against separate before/after source directories. It exercises only the
two changed behaviors. The native FastAPI planner, current constraints and
fixtures executed normally with live provider paths disabled.

| Behavior | Current r4 before | Adopted module |
| --- | --- | --- |
| Manually selected Reply recorded with blank details, initial/updated print text and actual TXT | Fails: No reply recorded. contradicts the status | Pass: No reply details entered. retains the selected status |
| One injected Blob URL setup failure, next-step edit and real retry | Fails: Download disabled immediately and after the edit | Pass: Download remains enabled; actual retry retains the reply and next step |

Before: 0 passed, 2 expected failures. After: 2 passed, 0 failed or skipped.
There were no browser page errors, request failures or external requests.
All 16 runtime files matched before and after each run. The only source
difference between the two directories is the accepted module patch.

Each run used two fresh fictional sample plans. All four actual native
responses were 8,609 bytes with SHA256
ebd767d10908b1712c5249464254d985cb3b7e7db69d223db5ff71316da5666e.
The successful retry produced a 5,033-byte TXT with SHA256
ff3f83d6ad624be2e3ed8167c1111a08c9d7c7edab14852229b7d65ee9bad8a4.

Execution used Linux Node24.19.0, Chromium153.0.8010.0 and Python3.12.14.
Existing Uvicorn0.54.0, FastAPI0.142.4, Starlette1.7.0 and Pydantic2.13.5 entry
paths and hashes are retained in both reports. No runtime package was installed.
The print check is actual Chromium print-media DOM/CSS, without a physical
printer, PDF or screenshot claim. This run does not repeat the unchanged
broader worksheet suite or qualify a provider, venue or live service.

## Reproduce and custody

Use the declared native backend plus the frontend source above. Select the
original module for the expected two-failure baseline or the adopted module
for the passing variant. With the same existing dependencies:

```sh
TT_REVIEW_PYTHON=/absolute/path/to/python3 \
TT_REVIEW_PYTHONPATH=/absolute/path/to/existing/site-packages \
TT_REVIEW_PLAYWRIGHT=/absolute/path/to/playwright \
TT_REVIEW_CHROMIUM=/absolute/path/to/chromium \
node owner-two-fix-probe.cjs /absolute/source/root /absolute/new/output
```

The output directory must be new. The probe serves the actual app on a private
loopback port, uses fresh browser contexts and saves each TXT under a distinct
file name. The probe, native responses, original failures, successful outputs,
process results and source pins are retained without altering them.

focused-packet.json and its gzip contain the complete original result packet.
The plain run files are also extracted for direct inspection. The patched
module and exact external patch accompany the owner acceptance receipt.
The publication manifest excludes itself. CLI relocation and integration
remain with root; this packet edits no tests-to-tools path.
