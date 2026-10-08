# TasteTable Offline Studio

A portable static version of the TasteTable organizer, driven by **24 finite native recordings**: three existing fictional taste profiles × all eight combinations of the existing soft-food, low-sodium and wheelchair flags.

Open a profile and constraint combination, inspect its recorded recommendation and explanations, and arrange the suggested picks into a dated week. Move or omit a pick, restore its suggested day, and print your current arrangement. Use **Save week** to keep that arrangement in a file, then **Open saved week** to preview and restore it. **Download source record** saves the exact original native scenario, response, verdicts and fixture transport trace; schedule edits belong to the printed arrangement and your separate saved-week file.

This page selects previously recorded outputs. It does **not** run fresh backend planning, query Qloo, call a model, use account credentials or send form information to a server. The only requests are static files. Tastes are fixed to the chosen fictional profile; the interface accepts no personal details.

## Run

Extract the static artifact, then serve its directory:

```sh
cd web-demo-offline
python3 -m http.server 8000 --bind 127.0.0.1
```

Open http://127.0.0.1:8000. A static HTTP server is needed for the module and JSON loads; there is no application backend or dependency install.

The actual receiving browser is native macOS Chrome 154.0.8037.98 with Node 26.3.0. The recorder runs on Python 3.13.7 using the standard library.

## What the recordings mean

The shipped source pin is `Jacob-Met/tastetable@59a5b23cedbd758945a1c80bcc9d83a6f564b819`. [source-pin.json](source-pin.json) identifies all 12 source/fixture/UI blobs used for this contribution.

The actual unchanged `run_agent` executes with explicitly constructed `ScriptedModel` and `FixtureTransport` objects. Fictional venue IDs start with `FIX-`; affinities are hand-set fixture values. No claim of real Qloo recommendation quality is made.

The existing constraints are tag/keyword heuristics. A retained dietary **unknown** is allowed by that source; its reason still tells the reader to ask the venue. A wheelchair **unknown** is rejected. The interface retains the original explanation, including unknowns, widening and missing slots. For example, the strict Mei recording has only three meal picks; a relaxed recording has four. These are observations of the pinned fixture pipeline, not dietary or accessibility advice. Confirm actual needs with the venue and care team.

The comparison column is the source's fixed ungrounded template, not a live model run. Recorded dates are not appointments: the week date and assignments are local planning choices, and no opening hours or reservations are inferred.

## Reuse and scope

Only the new `web-demo-offline/` namespace is changed.

- `week_plan.mjs`, `style.css` and `LICENSE` are exact copies of the pinned existing files.
- `index.html` and `app.mjs` continue the existing markup and organizer rendering. They select a finite catalogue instead of calling `/api/*`, retire a prior result when its controls change, and expose the exact source download.
- `offline.css` adds the standalone layout. `catalogue.mjs` validates and selects records; it implements no venue-selection or constraint algorithm.
- The existing backend, shared `static/` organizer/calendar/request work, shared landing page and workflows remain at their own source paths. A recorded static artifact is not a new hosted deployment.

The source contribution is separate from the settled failed native goal `goal_dfd9988c10364357b171`. That goal was not restarted, replayed or assigned to this external contributor.

## Recapture from the pinned source

The recorder requires a separate checkout containing the exact 12 pinned files. From an existing complete repository, create a detached worktree for the source pin, then invoke the recorder from this contribution:

```sh
git worktree add --detach /tmp/tastetable-source-59a5b23c 59a5b23cedbd758945a1c80bcc9d83a6f564b819
python3 web-demo-offline/tools/capture_catalogue.py \
  --source-root /tmp/tastetable-source-59a5b23c \
  --output /tmp/tastetable-recording-new
```

Both paths must be new. The recorder verifies the source blobs before importing and after all 24 runs, explicitly denies network entry points, validates each retained pick against the unchanged constraint function, and refuses an existing output directory. It creates the full catalogue, 24 individual source records and a receipt with their SHA-256 values. Capture time and runtime/tool metadata can change; the complete record payloads reproduce exactly.

The checked-in `data/capture-receipt.json` came from the native run. It is not a test expectation invented by the browser.

## Tests and receiving

The catalogue tests need only Node:

```sh
node --test web-demo-offline/tests/catalogue.test.mjs
```

They cover all supported source downloads, choice validation, malformed catalogue refusal, immutable source versus local week edits, the real missing-meal case, and year/leap date boundaries.

The browser receiver uses an already installed Playwright module and Chromium executable; it installs nothing:

```sh
TASTETABLE_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
TASTETABLE_BROWSER_EXECUTABLE=/absolute/path/to/chrome \
node web-demo-offline/tools/check_browser.mjs \
  web-demo-offline /tmp/tastetable-browser-receipt-new
```

It uses fresh profiles and an ephemeral loopback server, verifies all 24 desktop choices plus narrow-screen cases, exact raw downloads, invalidation, calendar edits, dietary unknowns, print media and unavailable-catalogue states. It records actual requests and closes the browser and server.

Exercise a new owned installation, rollback and final restored installation:

```sh
python3 web-demo-offline/tools/receive_static.py \
  web-demo-offline /tmp/tastetable-installed-new /tmp/tastetable-receipt-new
```

The receiver refuses pre-existing target, `.rolled-back` or receipt paths. It copies only the explicit static runtime and data files, verifies each through HTTP, moves its own target to `.rolled-back`, verifies HTTP 404, restores exactly the same bytes and verifies them again. It leaves both owned copies for inspection and closes its server. To use the final artifact, serve `/tmp/tastetable-installed-new` with the run command above. A later manual rollback can move that owned installation aside; it has no shared service or configuration to undo.

Source, native recordings, receiving logs and independent review are retained in this contribution's evidence packet. Repository integration and a native static installation do not imply a public deployment.

## Save and reopen an arranged week

Use **Save week** after choosing a date and scheduled days. The browser prepares an explicit JSON file in the existing `tastetable.saved-week.v1` format. The file includes the full original response and taste inputs, the Monday of the arranged week, every scheduled or omitted pick, and the original accepted/saved timestamps. The unchanged **Download source record** still returns the native record without your arrangement.

Use **Open saved week** to choose that file. The studio validates it and shows its profile, constraints, saved time, scheduled days and omitted picks before **Replace displayed week** changes anything. Cancelled, unreadable, oversized or nonmatching files leave the displayed draft in place. A new file, cancellation or a profile, constraint, date, day or reset edit retires an unfinished read and any previous preview. There is no automatic browser storage, upload or new backend planning.

The existing shared `static/week_file.mjs` is copied unchanged. [week-file-source.json](week-file-source.json) records its separate current-source provenance; the original recordings retain their earlier source pin. The offline admission module requires the complete saved response and original inputs to match exactly one of the 24 bundled records. Object key order can vary; array order, values and all fields must match. Overflowing JSON numbers are refused before comparison can normalize them to null. Files from other recorded versions or live responses are refused without replacing the draft. State is rebuilt from the canonical record before applying saved day choices, so reopening and saving again preserves source identity. Existing valid calendar identities are retained, but the offline studio does not create one or offer a calendar action.

Only UTF-8 JSON up to 128 KiB is read; both the advertised and actual byte counts are checked. A saved copy keeps its fictional-recording label and original venue-confirmation reasons on screen and in print. Saving or reopening a week does not confirm current accessibility, dietary suitability or opening hours.

Run the additional native contract and actual-file browser checks:

```sh
node --test web-demo-offline/tests/saved_week.test.mjs
TASTETABLE_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
TASTETABLE_BROWSER_EXECUTABLE=/absolute/path/to/chrome \
node web-demo-offline/tools/check_saved_week_browser.mjs \
  web-demo-offline /tmp/tastetable-saved-week-browser-new
```

The original backend capture and its 24 raw JSON recordings are not regenerated by this increment.

## Undo and redo arrangement changes

**Undo change** recovers the previous unsaved arrangement; **Redo change** reapplies it.
This includes moving a visit, keeping one off the week, changing the displayed week, or
using **Restore suggested days**. Resetting every visit is one change, so one Undo restores
the whole previous arrangement. The controls describe the available change and work with
ordinary keyboard focus and Enter or Space.

The page keeps the latest 20 distinct changes for the current accepted recording. Choosing
the same day, choosing another date within the same displayed week, or restoring days that
already match consumes no history and preserves Redo. A different edit after Undo starts
a new sequence and discards Redo. Invalid dates remain unsaved drafts; Undo or Redo can
restore a prior valid arrangement and its date.

Saving, printing and downloading the original source do not consume history. Reading,
previewing, canceling or refusing a saved-week file leaves the current history available.
An Undo or Redo cancels any pending read/preview before changing the arrangement.
**Replace displayed week**, showing a recording again, or restoring profile defaults starts
fresh history, even when the recording is the same. Profile or constraint changes retire it
immediately. Reloading also starts without history.

History is temporary page state and is excluded from saved-week files. The existing file
format, complete source/input match, original recorded explanations and source-download
bytes remain unchanged. An old undo entry cannot apply to a different accepted source.

The focused native test uses the unchanged organizer and actual finite recordings:

```sh
node --test web-demo-offline/tests/arrangement_history.test.mjs
```


The existing portable receiver includes the recovery module. For a fresh owned directory:

```sh
python3 web-demo-offline/tools/receive_static.py \
  web-demo-offline /tmp/tastetable-studio-new /tmp/tastetable-receipt-new
TASTETABLE_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
TASTETABLE_BROWSER_EXECUTABLE=/absolute/path/to/chrome \
  node web-demo-offline/tools/check_arrangement_history_browser.mjs \
  /tmp/tastetable-studio-new /tmp/tastetable-history-browser-new
```

The browser check uses an already available Playwright/Chrome runtime and the real
offline controls and downloads. It does not install dependencies. Its only fault
injection holds named file reads to check that Undo/Redo retire a late result.
