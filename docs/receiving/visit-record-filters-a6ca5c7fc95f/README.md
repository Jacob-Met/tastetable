# Visit record filters: draft source receiving

**Status: source reviewed; 165 local JavaScript tests passed; actual browser
acceptance is pending.** Both available browser setup routes failed before any
TasteTable browser process or assertion ran. This increment is a draft for
review and continued receiving. It does not claim an installed or deployed
product change.

## Scope and ownership

The parent is `bce1c08618a208b2d80f3e36e747ae7315616038` in
[`Jacob-Met/tastetable`](https://github.com/Jacob-Met/tastetable).
[Issue 86](https://github.com/Jacob-Met/tastetable/issues/86) reserves this work
for the `a6ca5c7fc95f/source` worker. The additive HTML links were coordinated
with the Undo/Redo owner in
[issue 70](https://github.com/Jacob-Met/tastetable/issues/70#issuecomment-6132131157).

The new module and stylesheet filter the ordinary single-record editor by
literal venue/note text and outcome. They retain original occurrence order and
numbers, focused edits and invalid cards. View settings remain outside the
record model. Successful explicit replacement resets the view; preview,
cancel, invalid replacement and a Use click without a prepared record retain it.
The intended download and print contract remains the complete record.

The only existing-file change is two asset links in `static/visit-record.html`.
The existing UI, record/week codecs, CSV renderer, Undo/Redo work, backend and
workflows are unchanged. The separately owned multi-file Visit history
workspace keeps its own filtering and print rules.

## Completed checks

- `node --test tests/test_visit_record_filter.mjs`: all 4 tests passed. They
  cover repeated venues, blank/case/Unicode/literal queries, each outcome,
  combined filters, changed observations and exact preservation of original
  frozen values.
- `node --experimental-vm-modules --test tests/*.mjs tests/*.cjs`: all 165
  tests passed, with no failures, skipped tests or cancellations. This is the
  actual local course count for the pinned tree.
- `node --check` passed for the new filter and browser receiver, and
  `git diff --check` passed.
- Root independently reviewed the filter module, stylesheet and two HTML
  links and found no source blocker. Browser acceptance remains a separate
  gate and was not inferred from that review.
- The original UI and model blobs remain
  `b136fa1a9f688d8a27db7d96668ace0895e547ee` and
  `2b5b37e3d4a227e00a5b0052a962d13512b53e48`, respectively.

The current parent does not include a CSV button in this editor. Existing CSV
renderer tests were part of the local course; a CSV browser interaction was
not performed or claimed.

## Browser receiving that remains to run

`tools/check_visit_record_filters_browser.mjs` uses Node 22+ and an existing
Chrome/Chromium executable. It creates fictional files and an owned browser
profile, uses a temporary loopback server, saves physical downloads,
screenshots, a print PDF and a JSON receipt, then closes its own resources.

The course exercises original file opening, literal matching, all outcomes,
intersection, no-match recovery, retained focus, invalid-date correction,
occurrence numbering, full JSON export, print media, explicit replacement
versus preview/cancel/refusal, keyboard order, a narrow viewport and a record
with no occurrences. Its intended assertions are executable source; they have
**not yet run in an actual browser**.

```sh
node tools/check_visit_record_filters_browser.mjs --browser /path/to/chrome --output /new/candidate-receipt
node tools/check_visit_record_filters_browser.mjs --browser /path/to/chrome --source-root /path/to/original-checkout --expect-absent --output /new/original-receipt
```

Each output directory must be new. The original mode first exercises the
existing file-open flow and then checks that filter controls are absent.
Run it with the original source pinned above. The receiver itself belongs to
this candidate and is used for both runs.

`source-closure-manifest.json` preserves the prepublication minimal source
snapshot prepared for transfer: six original assets and the candidate's eight
assets plus receiver, all with SHA256 and Git blob IDs. It deliberately records
that the prepared snapshot was uncommitted; it is not a full repository or an
adoption receipt. The receiver generates its exact fictional inputs itself.

`browser-setup-status.json` preserves the setup failures. Remote Desktop
Commander timed out before launch. Locally, the installed Playwright package's
expected executable was absent, and one bounded HEAD request to its reported
Chromium download URL returned `curl` exit 28, `Proxy CONNECT aborted due to
timeout`. No download, browser launch or browser assertions followed. These
are environment failures, not product receiving results.

## Publication preflight

A fresh fetch still returned parent `bce1c08618a208b2d80f3e36e747ae7315616038`.
Its only workflow files were `ci.yml`, `native-plan-week-browser.yml` and
`week-compare.yml`. Each listens only to `push` on `main` and `pull_request`;
there is no `pull_request_target` or other content-creation trigger. The new
branch is outside `main`, and every new commit carries `[skip ci]` and
`[skip actions]`.

[GitHub's current skip documentation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs)
confirms those markers suppress `push` and `pull_request` runs when included
in the relevant commit, including the head commit of a pull request. Remote
source and workflow-run state must be read back after publication. No
workflow, required check or deployment setting is changed by this increment.
