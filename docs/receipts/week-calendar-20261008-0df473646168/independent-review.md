# Independent receiving: TasteTable editable week and calendar

**Accepted at unchanged `consumer-v1`.** Four focused methods pass with zero failures. A separate consumer reads fourteen actual calendar files: eleven Blob downloads produced by the composed application's handlers in a controlled runtime, plus three previously downloaded real-Chromium files. A Python standard-library HTML parser separately confirms that the dated picks prepared for printing equal the edited calendar occurrences.

No production files, native week module, producer tests, request controller, backend or evaluator were edited. No new browser/image/PDF run was performed by this reviewer.

## Exact receiving boundary

The composed candidate is `/dev/shm/universal-0df473646168/product/week-calendar-integration/candidate`, based on editable-week PR #9 head `69a8098292da12d4d960118cae072a5885ff5171`, tree `778b466e70b3d69f28dc49f574cb7002adf45c29`. The received request-lifecycle head is `981118bbc2c7a2173e56ac1c26da754803b40b22`.

| Source | SHA256 |
| --- | --- |
| Candidate manifest | `9843dad9ce68a55d14b0091e1c08481d83407c299810f0a4dadf9d4f3f223c9d` |
| Composed `static/app.js` | `faa47a7c5b71a5c12f004868e68b71df33d4486002b983943185c3d9928dd5e1` |
| Unchanged `static/week_plan.mjs` | `e739adc10d9ae9ba1cb82c6d800c453e8f7bec53e343e0685adeabe98e6f4809` |
| Exact received `static/calendar.js` | `09dfe98a95da6c7fd0b7ee531c3ec4cf9ae5697dc730fab6cffdd07d8bd94b3b` |
| Exact received `static/plan-request.js` | `b35d09ca6270cf6150bcc40501d2d6a6728aa592597bb8d3e49aa3ae26cdf995` |
| Unchanged recorded native responses | `c8933cfdc2072901c57e92c124c8cae430859b21233e51b512255987ad99e071` |

The full twelve-file source inventory is preserved in `supporting/candidate-v1.json`. Every file matches before and after receiving. The receiver's SHA256 is `69c5c6d52719332b1d635da6e6b4f962ea5aba8574e074ad6455b7380fec25cf`.

## What passed

The receiver executes the actual app, calendar writer and request controller in a Node VM. The app's sole import is bound to the exact native `week_plan.mjs` exports; a read-only state observer is appended only in memory. Controlled DOM and deferred transport adapters allow old responses to finish after cancellation. The actual download handler creates a real Blob, whose bytes are written unchanged and read by an independent Python consumer.

| Independent method | Cross-feature result |
| --- | --- |
| Edited occurrences, print and UID round trip | Two meals move to the same leap day, an outing is omitted, and the calendar contains exactly those arranged occurrences. Each included pick retains its UID within the selected week. Reset restores the original file bytes; another week gets different UIDs; returning to the original week restores its file bytes. Year-end Sunday has the correct next-day end. Original source details and evidence sections stay unchanged. |
| Invalid date, local edits and empty week | An empty displayed date keeps print and download disabled through move, reset and acceptance of another valid response. Forced click handlers cannot reuse a stale file. A fully omitted week has no calendar to download. Restoring one pick produces exactly that occurrence with its existing weekly UID. |
| Request retirement and staged response failure | New request, input edit, cancellation and current HTTP failure retire the old output. A late response after abort cannot restore it. A single malformed final `trace` field causes an error after earlier fragments have been prepared, without partially committing new evidence. A subsequent valid result starts one new calendar session and fresh assignments while preserving the chosen week and current form values. |
| Existing real-browser files, independent consumer | Three actual Chromium downloads are parsed independently and compared with recorded displayed dates and names. The two exports of one fresh plan retain UIDs across a move; the replacement source uses a different namespace. |

The separate `verify_print_handoff.py` uses Python's `HTMLParser` to read actual app-generated print markup from the run. It verifies all seven consecutive dates and compares the complete dated-name multiset directly with `leap-edited.ics`, preserving duplicate occurrences. This is stronger than checking print-button availability alone.

The bounded calendar consumer reads UTF-8 file bytes, unfolds content lines, validates calendar dates and UTC stamps, decodes escaped text, checks unique UIDs, and checks the date-only event endpoints. It accepts only the exporter's standalone tentative/private/transparent event schema. Its grammar references [RFC 5545 sections 3.1, 3.3.4, 3.3.11 and 3.6.1](https://www.rfc-editor.org/info/rfc5545/); it does not claim support for arbitrary iCalendar features or an application's import behavior.

## Native backend and attribution

The exact recorded Rosa, Harold and Mei responses used here equal the complete outputs from the earlier current-native receiving run at main `8fdd78dbd1bd7e72385b2f5bd684e02b0971fa14`. The comparison includes plans, explanations, traces and comparison results. `native-backend-preservation.json` records that equality, prior source pins and evidence hashes. This is a preservation check, not a new provider or backend execution. The proposed candidate changes only README, frontend assets and frontend tests; the native week module and its original tests remain unchanged.

Calendar producer code/tests, request-lifecycle code/tests and the staged renderer supplement retain their owners' identities in `supporting/owner-intake-source-manifest.json`, the producer handoff and `review-disposition.json`. The staged supplement's intake hash is `376fb899f912b9e74b5869c0cc05eb863e86bc812602295f54af85802d15705c`.

The author, `/root/estate_product`, separately ran nine Chromium scenarios with ten calendar downloads and print/media evidence. This packet copies its original receipt for attribution and does not rerun those checks. The other browser driver was authored by `chatgpt-a2eaaec253d8/production_receiving` and executed unchanged by `/root/estate_product`. Its raw receipt keeps a hardcoded reviewer field naming the driver author; that field must not be interpreted as a new execution by that owner. This reviewer independently parsed the resulting three files.

## Evidence and replay

`receiving-final/` and `receiving-final.log` are the final run. `print-export-final.json` records the independent print/calendar comparison. `review-disposition.json` gives scope, provenance, source pins and limits.

The first four-method run is preserved under `receiving-initial/`. The final receiver changes exactly one fixture line: the malformed response now has `trace: null`, replacing an early invalid affinity field. Every other receiver byte, including all assertions, is unchanged. This strengthens the staging check by failing after earlier fragments have been prepared. The original receiver and both successful histories remain intact.

To replay, use a writable extracted review directory and a source snapshot matching all candidate pins. The source directory's parent must contain the supplied `candidate-v1.json`; create that layout in isolated scratch rather than modifying an existing repository's metadata. The receiver refuses an existing output directory.

Prepare a browser-evidence input directory by copying `supporting/request-owner-driver-execution.json` as `receipt.json`, and copying these three final files without changing their bytes:

| Preserved file | Replay input name |
| --- | --- |
| `receiving-final/supporting-browser-edited-initial.ics` | `edited-initial.ics` |
| `receiving-final/supporting-browser-fresh-b.ics` | `fresh-b.ics` |
| `receiving-final/supporting-browser-rearranged-b.ics` | `rearranged-b.ics` |

Then run:

```bash
node test_consumer_composition.cjs \
  /path/to/pinned/candidate \
  supporting/native-responses.json \
  /path/to/prepared/browser-evidence \
  /path/to/new/receiving-output
python3 -B verify_print_handoff.py \
  /path/to/new/receiving-output/edited-print-view.json \
  /path/to/new/receiving-output/leap-edited.ics \
  /path/to/new/print-export-result.json
```

Python and Node use standard-library dependencies only. If necessary, `CODEX_PRIMARY_RUNTIME_PYTHON` selects the interpreter used by the Node receiver. The review ran in the authorized ordinary RAM workspace because the shared overlay was full.

The controlled DOM qualifies handler state and generated markup; existing browser work supplies separate browser and print evidence. Neither route establishes calendar-account synchronization, booking availability, physical printing or post-import update behavior. Root owns fresh-base composition, publication and merge. No broad producer, backend or previously accepted week suite needs repetition for this unchanged freeze.
