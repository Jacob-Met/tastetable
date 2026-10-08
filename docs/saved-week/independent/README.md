# Saved-week v3: independent cross-process file consumer

## Result

All three workflows passed on their first execution with Node **24.19.0** on
2026-10-08. Nine fresh Node subprocesses used the actual frozen native modules to
save, restore, edit, re-save, and reopen ordinary JSON files. The parent process
independently compared the returned files and parsed the generated calendar
events. The receiver does not import or rerun the author's tests.

| Native fixture | Original events | Saved arrangement | Restored and edited | Result |
| --- | ---: | ---: | ---: | --- |
| Complete checked week | 5 | 4 | 5 | Original evidence and every original per-pick UID retained |
| PR11 invalid-JSON recovery | 1 | 1 | 1 | Original null trace arguments and calendar identity retained |
| PR11 decoded-list recovery | 1 | 1 | 1 | Original list trace arguments and calendar identity retained |

The ordinary file rewrite adds a UTF-8 BOM, changes physical JSON newlines to
CRLF, uses tabs, and reverses every object's property order without changing
JSON values or array order. The native reader reconstructs the exact saved
arrangement in a fresh process. A second save and third-process reload retain
the edited arrangement, original response, inputs, calendar identifier, and
received timestamp. The save timestamp correctly changes on re-save.

The complete fixture first moves a meal to Tuesday, omits another meal, and
places the outing on the same day. After reopening, a meal moves to Friday and
the omitted meal returns on Sunday. The consumer checks the original names,
entity IDs, explanations, plan notes, source label, dates, tentative/private
calendar status, and original per-pick UIDs. Both same-arrangement calendar
exports are byte-identical across their process/file boundaries. The full
original checked response, including rejection and constraint evidence, trace,
comparison, and model message, remains deeply equal to the native fixture.

## Exact receiving source

Candidate: `/dev/shm/universal-0df473646168/memory-week-file/candidate-v3`

- Freeze SHA256: `e846337117171e02b21788bff561f1f9648b6d8ae5763d57992e0d01cf84bd67`.
- Receiving base commit: `614aa0a98429ba52182376e38a57e32d01b461b9`.
- Receiving base tree: `299cabf86343faab77b78bd1cd9e9f8847c7b81d`.
- Native PR11 parent: `b8d384e5522e17cf15d73e8b06adbe6665e4bdcc`.
- File module SHA256: `914291b97250a97f6e09f47e6fed58b607b3b1ed9e4c60e3242ff39546913614`.
- Native week module SHA256: `e739adc10d9ae9ba1cb82c6d800c453e8f7bec53e343e0685adeabe98e6f4809`.
- Native calendar writer SHA256: `09dfe98a95da6c7fd0b7ee531c3ec4cf9ae5697dc730fab6cffdd07d8bd94b3b`.
- Receiver SHA256: `7c1820be31f9c12e569653e1c76ea04d0e07d223aaaead25aea1afb007104921`.

All sixteen files listed by the frozen source/dependency manifest matched
their expected identities before and after execution. The receiver also stayed
byte-identical. No production source, author tests, fixtures, or author packet
was changed. Each child records its actual PID, native module hashes, Node
version, and returned file metadata in the retained raw evidence.

## Replay and evidence

Run the command in `command.txt` with an unused output directory. Replays load
the exact modules and fixtures from the separately supplied candidate and
refuse a changed source freeze. No package installation is required.

`qualified/receipt.json` records all observed workflow results and source pins.
`qualified/source-before.json` and `qualified/source-after.json` contain the
sixteen measured source identities. `review.log` is the unchanged first-run
log. The raw output tree retains every native JSON/calendar file and child
receipt; `raw-manifest.json` pins those files. `consumer-artifacts.json` is a
compact, byte-preserving JSON envelope containing the actual final native
reader result and calendar text for each workflow, with matching raw file
identities. It is generated from the observed files, not recomputed through the
production code. The complete archive includes the raw tree for replay and
receiving review. `delivery.json` identifies a smaller readable publication
set so integration does not require dozens of empty or repetitive log paths.

## Boundaries

This is a distinct file consumer on three synthetic native fixtures. It does
not repeat the author's native suite, browser workflows, HTML regression,
validation matrix, or initial browser-capacity failures. It does not generate
live Qloo results, call any server, verify venue information, import a calendar
into a third-party application, or independently revalidate saved evidence.
The explicit saved calendar-ID path is tested; the UI's null-ID fallback is
outside this receiver's scope. No failure or source change was observed in
these receiving cases.

All new files and processes stayed inside the authorized owned RAM scratch
area. The source was read from the frozen candidate. No live data store, user
file, credential, browser session, or network service was accessed. The raw
fixture content is native synthetic demo data, and the fixed identifiers and
timestamps belong only to these test cases. This packet is separate from the
author's unchanged nineteen-path packet and is not a publication or deployment
claim.
