# Visit-record departure protection — native qualification

## Source and consumer

Issue [110](https://github.com/Jacob-Met/tastetable/issues/110) adds a departure
confirmation to the separate visit-record editor. The original source is
`b93fdbbb314cdb0b10b802213741538fbbee1fcc`, tree
`7aab0dec93da6a4d697cbedab1ccf7ad4b9bae76`. The product candidate is
`73586a7319816537d404626aebdb1b87e8c3c068`, tree
`64f052d2b68074ce46698101cd649caa2d98affc`.

The six source/test/guide differences include two new files. All 1,056 unrelated
original blob/mode/type tuples are preserved, with no removals. The existing
visit-record browser helper adds only the new module to its source-hash list;
that earlier browser course is not replayed or relabeled here.

This is separate from the planner's venue-note protection and from the retained
CSV, Undo/Redo, filter and installed-copy owners. No record format, source text,
provider behavior or automatic storage changes.

## Author Node checks

An isolated ten-file source projection on Mac.lan, uid 501, used existing
Node v26.11.0 and CPython 3.13.7. The command was:

```sh
node --test tests/test_visit_record.mjs tests/test_visit_departure.mjs
```

All 23 methods passed: ten new departure cases and thirteen unchanged
visit-record cases. There were no failures or skips; stderr was empty. The
Node child 44041 exited 0, and the collected outer process 44008 exited 0.
This observer did not launch a browser.

The new cases cover clean admission, all three editable fields, complete
reversion across duplicate/omitted occurrences, invalid drafts, correction
while other changes remain, imported literal CR/CRLF notes, listener lifetime,
explicit replacement and real codec export/reopen. All ten staged source files
and the exact input packet retained their bytes, mode, mtime and inode.

| Retained author file | Exact Git blob |
| --- | --- |
| [author/observer.py](author/observer.py) | `0cfbfa02f4b1a3b65c28f82c48fbb6532cc20a6c` |
| [author/receiving.json](author/receiving.json) | `9b888cf74f6074e596f42f1a1009201e6afe1984` |
| [author/test.stdout.txt](author/test.stdout.txt) | `640e6a206ffc3e1f66d7148ba082e53669e52d3c` |
| [author/test.stderr.txt](author/test.stderr.txt) | `e69de29bb2d1d6434b8b29ae775ad8c2e48c5391` |

The executed author observer retains its historical prepared native paths.
It documents this qualification; the ordinary maintained test command above
runs from a checkout. Browser confirmation behavior is qualified separately.

## Independent browser course

Context delivery froze the acceptance record, six original runtime files and
the existing fictional visit-record fixture before seeing the candidate. The
original run used observer `f4df785e260d8102147703eb58b397c2f72d95a0`.
All 109 observation/control checks passed against that original-state oracle:
15 departures completed without a confirmation, including 11 dirty cases.
Those passing observations establish the missing protection, not a working
original feature.

The first candidate attempt preserved a real native beforeunload confirmation
and successful Stay, but stopped after 24 passing checks when the observer
rejected Chrome's exact cancelled-reload timeout string. Its failed 25th check,
raw receipt and executed observer remain intact. Its managed-browser cleanup
was not confirmed: the old Playwright context manager stopped before the
observer's failure cleanup could use it.

The corrected observer `c85e863334408ff57663a74bcb0f6c38b78b9650` admits that exact
reload-only timeout only after the expected native dialog, dismissed Stay and
unchanged displayed values/storage. A per-document UUID also rules out a new
document with matching fields. Playwright remains available until owned
cleanup completes, and cleanup errors force a failed result. These are observer
corrections; all seven candidate runtime files remained unchanged.

Context delivery reported that the corrected candidate run completed 140 total
observer checks and 18 actual departure attempts, with two physical JSON
downloads. It collected native process 93183 at exit 0 after 52.34 seconds and
reported exact input conservation and managed Chrome disconnection. These
counts include admission, controls and conservation; they are not 140 distinct
browser tests. No operating-system browser exit code is claimed.

**Raw final-receipt join is pending.** The final native file read is currently
transport-pending after that completed process. This publication retains the
reported completion separately from the raw original and first-failure records
already reviewed below. Readiness and integration wait for the final raw
receipt, download identities and exact source/conservation binding. The browser
course will not be repeated to replace an unavailable receipt.

Actual Print-button invocation is recorded, without a physical-print claim.
The controlled pending-read case delays only an owned file read. The real
browser still controls whether departure confirmations appear; these results
do not promise crash, forced-close or mobile app-switch recovery. No backend,
provider call, hosted deployment or installed-copy update was performed.

## Retained browser inputs and epochs

The exact original fixture also remains at `tests/fixtures/visit-record-csv.json`.
The saved-week input below is its verbatim `source.weekText`, whose identity
matches the native witness. The pending input is a byte-identical copy of the
record. The observers keep their original portable arguments and require an
existing Python Playwright installation, Chrome, a prepared exact runtime
projection, fixtures and source manifest. They are retained qualification
records; the Node command above is the ordinary checkout test route.

| File | Git blob |
| --- | --- |
| [browser/acceptance-v1.json](browser/acceptance-v1.json) | `977e9f2a6415dc9cf2ec8db0817679a23bbf201a` |
| [browser/observer-v1.py](browser/observer-v1.py) | `f4df785e260d8102147703eb58b397c2f72d95a0` |
| [browser/observer-v4.py](browser/observer-v4.py) | `c85e863334408ff57663a74bcb0f6c38b78b9650` |
| [browser/original/receiving.json](browser/original/receiving.json) | `a92f399bc771871a1d592bc1dac36ad0194972f5` |
| [browser/candidate-first/receiving.json](browser/candidate-first/receiving.json) | `0772e825e36fa37e62230a9187dcad5b980b1662` |
| [browser/fixtures/original-record.json](browser/fixtures/original-record.json) | `69d1c226ab9b7ed25a08f9372a0534d2be00d27f` |
| [browser/fixtures/pending.json](browser/fixtures/pending.json) | `69d1c226ab9b7ed25a08f9372a0534d2be00d27f` |
| [browser/fixtures/original-week.json](browser/fixtures/original-week.json) | `7980f27eaeca995681a2c8a7b68b2ebe57740d95` |
