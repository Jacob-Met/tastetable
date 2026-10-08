# TasteTable offline arrangement recovery — #32

A caregiver can recover an accidental move, omission, week change or **Restore suggested days**
without losing the original recorded recommendations. **Undo change** and **Redo change**
operate on the currently accepted recording or saved-week session.

The qualification source parent is [TasteTable 1a609bfdd77dc07222eb70f8a4a1f565a8bc8fa0](https://github.com/Jacob-Met/tastetable/commit/1a609bfdd77dc07222eb70f8a4a1f565a8bc8fa0),
tree `ef80f9f0134d613571861278978477152548a5ed`.
Scope and ownership were recorded in [#32](https://github.com/Jacob-Met/tastetable/issues/32)
and [the existing Save/Open owner's #26 coordination thread](https://github.com/Jacob-Met/tastetable/issues/26#issuecomment-6062915399).
The frozen contract predates implementation and is retained in the evidence archive.

## Behavior and source custody

The page retains the latest **20 distinct arrangement changes**. A change is a successful
different normalized week or occurrence assignment. Restoring suggested days is one atomic
change. The combined past and redo history never exceeds the bound.

A repeated assignment, already-restored arrangement or another date in the same displayed
week consumes no history and keeps Redo available. The last case can update the valid
displayed date anchor. A distinct edit after Undo discards the abandoned redo branch.

Invalid dates remain unaccepted drafts under the existing Save/Print refusal. Explicit
Undo or Redo restores the recorded valid state and date. Saving, printing and downloading
the original record do not consume history when the arrangement is unchanged.

Reading, previewing, canceling or refusing a file preserves the current history.
Undo/Redo retire pending reads and previews through the existing opening controller.
Only **Replace displayed week** accepts the file and starts new empty history, including
a file from the same recording. Showing a recording again, restoring profile defaults,
changing profile/constraints or reloading also starts a new session or retires the old one.
An old entry cannot silently apply to the newly accepted source.

The original `week_plan.mjs`, `week_file.mjs`, `saved_week.mjs`, `catalogue.mjs`,
catalogue and all 24 source recordings retain their exact parent bytes. Source labels,
explanations, accepted timestamps, saved-copy labels and calendar identities are preserved.
History is transient page state and is excluded from the existing saved-week envelope.
The UI uses native buttons with normal Enter/Space behavior, status text and focus; it
does not intercept a page-wide undo shortcut.

## Actual qualification

All runs used the existing native Mac runtime: Node **26.3.0**, Python **3.13.7** and
Chrome **154.0.8037.98**. Existing Playwright was reused. No dependencies were installed.

| Evidence | Actual result and scope |
| --- | --- |
| Frozen original browser baseline | Two preceding groups passed, then the required Undo control was absent (`0 !== 1`). The driver, failing log, screenshot, actual saved file and 42-input stability proof are retained. |
| Same original browser driver on candidate | **3/3 groups passed**, child exit **0**: real move/omit/Save/reset and keyboard Undo restored the exact prior arrangement, source and displayed date. |
| Native contract tests | **36/36 passed**, child exit **0**: eight new history cases plus 28 unchanged catalogue/Save-Open cases. Tests use actual admitted recordings and the unchanged organizer/codec. |
| Existing portable receiver | **39 files**, **78 exact HTTP readbacks** across installation and restoration, with actual rollback HTTP **404**. Child exit **0**. Both targets are isolated owned directories. |
| Focused browser receiving on restored portable files | **7 groups passed**, child exit **0**. Six actual downloads, one native-produced Mei/calendar file, two screenshots, zero page errors and zero API/provider/external requests. |
| ZIP member receiving | Every one of the **39 ZIP members** equals the corresponding browser-qualified portable file and final source byte-for-byte. |
| Source composition | The reconstructed parent tree matches the GitHub tree. The text patch passes `git apply --check`; all 296 unowned parent leaves are preserved. |

The original failed browser driver's enclosing launcher did not capture an OS child exit
code; its failed receipt and exact assertion are retained. The subsequent native/browser
launchers waited for and recorded their actual child exit codes. No failed source result
was replaced by a successful log.

The native cases receive complete multi-action recovery, no-op redo, branching, 25 actual
occurrence edits with only the last 20 recoverable, source-factory refusal, invalid dates,
unchanged saved envelopes and all-omitted recovery.

The focused browser groups receive real resave/source custody; no-op Save/Print and
invalid-date recovery; preview/cancel/refusal; pending actual file reads retired by both
Undo and Redo; explicit same/different-source replacement; profile/default/reload
invalidation; and 390px Enter/Tab/Space focus, 44px controls and print exclusion.
The only browser fault injection holds named actual File.arrayBuffer promises so their
late completion can be observed. The product has no test hooks.

The 45-input native/original-replay phase ran before the final documentation command and
new permanent browser helper were added. The product runtime and native tests are unchanged.
The 46-input focused-browser phase binds the final documentation and helper. The final ZIP
was then built from the 39 already received files; it is the 47th selected source artifact.

## Portable artifact

`web-demo-offline/dist/tastetable-offline-studio.zip` is rebuilt deterministically
with the existing directory prefix and file modes. It contains the complete currently
qualified offline studio.

The exact parent ZIP had 35 members and an earlier 10,305-byte app; it omitted the merged
Save/Open modules. This refresh preserves 31 member bytes, updates the four current UI/docs
members and includes `saved_week.mjs`, `week_file.mjs`, `week-file-source.json`
alongside the new history module. It does not regenerate the catalogue or raw recordings.

The existing portable receiver's only source change adds the new module to its explicit
runtime list and updates the required total from 38 to 39 files. Its ownership, rollback,
regular-file checks and HTTP behavior are unchanged.

## Reproduce the source qualification

From the repository root, with the project's existing native runtime:

```sh
node --test \
  web-demo-offline/tests/catalogue.test.mjs \
  web-demo-offline/tests/saved_week.test.mjs \
  web-demo-offline/tests/arrangement_history.test.mjs

python3 web-demo-offline/tools/receive_static.py \
  web-demo-offline /tmp/tastetable-history-studio-new /tmp/tastetable-history-static-new

TASTETABLE_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
TASTETABLE_BROWSER_EXECUTABLE=/absolute/path/to/chrome \
  node web-demo-offline/tools/check_arrangement_history_browser.mjs \
  /tmp/tastetable-history-studio-new /tmp/tastetable-history-browser-new
```

Output directories must be new. The portable and browser receivers use only owned
directories, ephemeral loopback HTTP servers and the fictional bundled recordings.

## Independent receiving

The independent receiver froze its expectations before reading the new implementation or
author tests. It used a Python chronological timeline and cursor, distinct from the
implementation's two stacks, with exact native Rosa-7 and Mei-0 saved-week fixtures.

That frozen oracle passed **six scenarios and 128 transitions** on Node 26.3.0. The
receiver then ran only four remaining browser checkpoints: an explicit asynchronous
File.arrayBuffer rejection with redo available, late rejections after Undo and Redo
retired the read, and fresh preview/cancel followed by recovery and a real saved-file
readback. Two actual downloads retained the exact original response, inputs, accepted
timestamp and calendar identity. These were explicit NotReadableError injections on
real selected Files; no physical disk-permission failure is claimed.

The receiver accepted all nine product pins, the bounded/source-factory semantics and
the unchanged native/data inputs, with no product finding or edit. Its original blind
manifest, oracle, native/browser evidence and acceptance remain intact inside the copied
independent archive. The initial source-only probe stopped on an unmaterialized baseline
receiver file; its preserved correction reverse-reconstructed the authoritative before
blob exactly. This was a receiving fixture gap, not a product failure.

## Current receiving parent

After qualification, main advanced to
[689ddc9a6a4f5f12068e1e99127cc77482c53924](https://github.com/Jacob-Met/tastetable/commit/689ddc9a6a4f5f12068e1e99127cc77482c53924),
tree 25b453e345bedd3f280e3d555df12561ef084cc6, with 324 leaves. Its complete 24-path
saved-week-comparison delta changes separate shared-page, global documentation, test,
tool, workflow and evidence paths. Every one of the 42 frozen offline before-inputs and
all nine product before-images remains exact. Both current trees contain no AGENTS.md
or CONTINUE.md.

The final publication packet composes the unchanged accepted product and three unique
evidence paths onto that current tree, preserving **all 318 unowned current leaves**.
The comparison's workflow also excludes the offline namespace. No runtime suite was
repeated for this unrelated source advance; its full tree and exact drift receipt are
retained. The product-only source manifest keeps the original qualification parent so
the historical execution scope is explicit.

## Evidence boundaries

`source-manifest.json` pins the nine product files and their exact receiving
before-images. `native-evidence.tar.gz` retains the contract, baseline input
map, original failure, all actual qualification logs/receipts/downloads/captures, parent
source/gate observations, archive equality and independent receiving.

The current automatic `ci.yml` runs Python 3.12 `python -m pytest -q`
on pull requests and main. The separate `native-plan-week-browser.yml` path filter
does not include this offline namespace. No hosted CI result or public deployment is
claimed by these native receipts. Root owns source publication, expected-head integration
and the existing project delivery route.
