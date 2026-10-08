# Native receiving evidence — TasteTable Offline Studio

## Scope and provenance

The qualified runtime is commit `f3beb43f839d93116567712ce48c72637ae8d6cb` in the isolated native Mac worktree `/tmp/tastetable-offline-81ba1ed0179c/source`. Its base `6c164c19c8806d6a0168c4586ccc13f0ae8712cc` is a bounded materialization of 12 exact repository blobs, not a full upstream clone. The upstream source/fixture/UI pin remains `59a5b23cedbd758945a1c80bcc9d83a6f564b819`.

All additions stay under `web-demo-offline/`. Native pipeline and reused UI source remain byte-identical. The independently reviewed six runtime files are unchanged from that frozen candidate; subsequent additions retain evidence and the runnable static ZIP. Publication uses the complete current upstream tree as its parent, preserving concurrent calendar/request and backend contributions.

## Actual recordings and source controls

`data/capture-receipt.json` records 24 runs of the unchanged actual `run_agent`, with explicitly constructed ScriptedModel and FixtureTransport. The 24 complete record payload hashes match the earlier native capture exactly. Capture metadata differs because time and recorder source changed when exact record downloads were added.

The recorder checked all 12 source blobs before and after capture, made no network attempt, and verified every retained pick against the native evaluator. The dataset is finite and synthetic. It is not a live model or Qloo observation.

`capture-guards/` preserves both actual negative controls: a pre-existing capture directory is refused, and a disposable source copy with a changed agent blob is refused before output creation. The authoritative 12 source blobs remained unchanged. These expected refusals exit 1 and are not labeled successful captures.

## Independent source and recorded-data review

The independent production reviewer authored and ran `independent/check_recorded_receiving.py`, without changing this contribution's source.

Seven native standard-library checks passed. They bind all 24 exact downloads to the catalogue and capture hashes; bind 118 retained picks to actual fixture identities, affinities and native verdicts; verify native dietary/outing applicability, 12 retained dietary unknowns, comparison counts, 12 pinned source blobs and three exact copied files. The reviewer replayed 68 recorded fixture insight requests, performed no full-agent capture rerun, and attempted no network access.

`independent/review.json` records accepted source/data semantics, runtime hashes and the receiving boundary left to this lane. A later readback confirmed those same six runtime hashes at frozen candidate f3beb43f.

Dietary unknowns are source behavior: their actual unknown status and ask-venue explanation must remain visible. The source's wheelchair unknown is excluded. The browser receiver explicitly checks the retained dietary unknown on screen and in print media; it does not turn an unknown into a pass.

## Actual installed artifact and browser

`static-receiving.json` records a new owned 35-file installation, 35 initial HTTP SHA-256 readbacks, a rename to its own rollback directory and HTTP 404, followed by a byte-identical reinstall and 35 further HTTP readbacks. It left the final artifact at `/private/tmp/tastetable-offline-81ba1ed0179c/installed`, alongside its owned `.rolled-back` copy. Its ephemeral server was closed.

`browser/receipt.json` is the actual final run against that installed directory using a fresh native Chrome 154.0.8037.98 profile and Node 26.3.0:

- 52 passing receiving groups, with all 24 desktop choices and additional phone choices.
- Six real browser downloads, byte-identical to the original native source-record files.
- Current-control invalidation, default restoration, keyboard focus, year/leap boundaries, day moves/omission/reset, invalid-date refusal/recovery and readable native reasons.
- Explicit retained dietary unknown and ask-venue text on screen and print media.
- Native Chromium print output produced a 291,480-byte PDF, hash `55de05caacc540fb3c7910770add13132ef6913847e7b42db0f50b3913ce6627`. The full PDF is preserved in the native durable packet.
- Missing/wrong-source catalogues refuse to show a plan. No browser errors, external requests, backend requests or POSTs occurred. Browser contexts and the ephemeral server were closed.

[Desktop receiving](browser/desktop.png) and [phone week receiving](browser/phone.png) are the actual native screenshots. Their layout was visually inspected. The first browser run passed 50 groups; the final run adds explicit unknown checks and uses the installed artifact. No earlier failing run is hidden.

`node-tests.log` preserves the 14 passing catalogue/date tests. These test finite selection/download equality, immutable source versus schedule edits, refusal of malformed catalogues, the real missing-meal case and calendar boundaries. They are not a claim of full repository CI.

## Runnable ZIP and durable custody

`dist/tastetable-offline-studio.zip` contains the same 35 static files verified by installed receiving. Its entries are checked byte for byte against that manifest. Extract it and serve the contained `web-demo-offline` directory with `python3 -m http.server 8000 --bind 127.0.0.1`.

The complete bounded Git history, static ZIP, these receipts, original browser recordings/downloads/PDF, negative logs and independent review are retained under the cohort's existing native intake at `/srv/hamon-estate/coord/estate-81ba1ed0179c/tastetable-offline/`. The publication manifest records exact final commit and artifact hashes.

The original failed native goal remains unchanged. This work establishes source and a runnable native static artifact. It does not establish a hosted deployment, confirmed venue suitability or live recommendation performance.
