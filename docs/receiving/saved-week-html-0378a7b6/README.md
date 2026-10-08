# Saved-week HTML handoff — Windows receiving

Contributor: `chatgpt-0378a7b6b7c2/la7`, under Jacob's standing HAMON execution mandate.

## Product outcome

A caregiver can convert an existing arranged saved-week v1 JSON into a standalone readable HTML handoff. The new Node consumer uses the existing saved-week codec and scheduler, creates an unused output file, and reports its exact input SHA-256. Recipients need only a browser to read or print the file offline.

The seven actual dates, individual scheduled/omitted occurrences, original Qloo IDs/affinities/explanations, requested tastes/constraints, timestamps, source labels, original plan notes and rejected-check details remain visible. The report does not rerun checks or authenticate the saved source. Visit-only venue question/reply notes are absent from the existing v1 file and are explicitly excluded. The original JSON remains the editable full response, comparison and tool-trace source.

## Source and isolation

Base: `Jacob-Met/tastetable@e0f6fbaf1f81fbb1e9926948294549c744228def`, tree `57b0980e39489d48a9bea5c89ae4d463c97944b8`.

New product paths are `static/week_report.mjs` and `tools/saved_week_to_html.mjs`; new tests are `tests/test_week_report.mjs` and `tests/test_saved_week_to_html.mjs`. The existing native CLI guide gains only the appended usage section. No existing runtime source is changed. After receiving, all **433 unowned original files** match their native before-hashes; the sole changed original file is the planned documentation append. The clean isolated clone's configuration was set with its own `core.autocrlf=false` before the baseline.

The complete original tree has434 leaves and no AGENTS.md. Current project issues/open PRs, #16's owner/receiver discussion and all551 retrieved central HAMON#140 comments were reviewed. #16/PR33's worksheet and final integration remain with their owner. Source publication requires a fresh overlap/current-parent check. `CLAIM.md` preserves the bounded advisory and the first GitHub content-limit refusal; it is not a resident task lease or installed authority.

Native source/evidence root: `C:/Users/minec/hamon-0378a7b6-tastetable`. No migration, shared service, scheduler or worker state changed. Only owned test processes and files were used.

## Actual verification

| Boundary | Recorded outcome |
| --- | --- |
| Original native producer/converter | Python3.13.15 ran `tastetable_cli.py --persona mei` and Node24.21.0 ran the unchanged converter successfully. The proposed HTML command was absent with `MODULE_NOT_FOUND`. `baseline.json` retains exits, original input SHA-256 and434 source hashes. |
| New command on that native file | Created the first complete HTML without changing saved-week bytes. Saved input SHA-256 is `006b8be543c60a0b645326fc6d6a54bc30809ef8ec46dc76a24e4f5d3e793160`. The first output `caregiver-handoff.html` is the pre-CSS-correction v1 artifact. Current accepted output is `browser-v2/native-mei.html`. |
| Maintained native Node tests | **42 passed, zero failures/skips:** 21 new report/CLI tests plus 21 unchanged codec/scheduler tests. The earlier 39-case receipt/log retain their v1 filenames. `native-tests.log` and `native-verification.json` bind this result to exact source hashes. |
| Windows Chrome154.0.8037.98 | **Eight groups passed**, using file URLs with browser offline mode, zero page exceptions and zero unexpected requests. The actual producer-to-converter-to-CLI output, changed dates/repeated venues, literal Unicode/markup,390px layout, print PDF, authored live/unknown labels, all-omitted and empty arrangements were exercised. `browser-v2/receipt.json` hashes the15 produced artifacts and all four executed source modules. |
| Delivery failure boundaries | Actual subprocess tests preserve occupied files/directories/input aliases, refuse unsupported/invalid UTF-8/over-limit input, handle a real competing publication name, remove a partially written stage, and label a complete final report when cleanup fails after publication. The failed output name is not overwritten on retry. |

The CLI imposes a4MiB strict UTF-8 input and32MiB rendered output limit. It closes an owned staged file before the existing same-filesystem create-only hard-link convention publishes it. It makes no network/provider calls and needs no npm packages.

### Retained failed approaches

The first report unit-test run passed7/8. Its broad regex incorrectly identified the literal escaped text `src=` as an HTML attribute. The assertion was narrowed to actual HTML tags; production bytes were unchanged by that test correction. Actual browser receiving separately verifies there are no active script/image/iframe/object/link/form/anchor elements.

The first real browser run exposed a **candidate product defect** at390px: a long escaped venue name in an h4 overflowed the page to466px. `browser-v1/failure.json`, `overflow-inspection.json`, `phone-overflow-v1.png` and the original generated HTML retain that failure. The existing overflow-wrap selector omitted h4; the correction adds h4 to that selector only. The unchanged receiver then passed all eight groups in the separate `browser-v2` namespace. Original failed artifacts were not overwritten or relabeled.

The current phone image was directly inspected: the long literal name wraps, each repeated occurrence stays with its own date/omitted section, and source/care/worksheet boundaries remain readable. The PDF is an actual Chrome print artifact; no physical printer or general assistive-technology acceptance is claimed.

### Independent text-fidelity correction

Parent source review identified a distinct HTML fidelity risk after the first browser acceptance. The unchanged codec admitted CR, NUL and an unpaired high surrogate. The actual original CLI exited 0 for all three; Chrome changed CR13 to LF10, dropped NUL0, and replaced the unpaired surrogate with U+FFFD. codepoints-baseline-v2/receipt.json retains those exact code units, input/output fingerprints and source pins.

The final renderer escapes CR as &#13; so the actual HTML DOM retains it. It refuses displayed NUL and unpaired UTF-16 surrogates before publication, using explicit pair validation compatible with the stated Node18 API floor. codepoints-fixed/receipt.json records the actual exact-CR success and two exit2 refusals with no output. Three maintained regression methods cover CR/valid pairs, city/name/why rejection and real CLI no-output behavior; the final native total is42.

All six original browser-v2 report outputs are byte-identical under the corrected renderer, as compared in current-browser-output-equivalence.json. Their earlier eight browser groups retain the original runtime pin; they are not relabeled as a rerun. The targeted codepoint receiving carries the new renderer pin. A first codepoint harness used the Windows reserved filename nul.html; Chromium refused it. That setup failure and portable renamed artifacts remain in codepoints-baseline; the corrected case name is nul-character.

The Native CLI guide's exact10418-byte canonical prefix was restored after the append route exposed CRLF churn. Its final diff contains only28 appended lines. native-canonical-correspondence.json distinguishes exact Git blobs from retained native CRLF checkout bytes; the source receipts preserve all actual executed hashes. This receiving/transfer correction changes no product behavior.

## Replay and integration state

From the repository root, with Node available:

```sh
node --test tests/test_week_plan.mjs tests/test_week_file.mjs tests/test_week_report.mjs tests/test_saved_week_to_html.mjs
node tools/saved_week_to_html.mjs --input docs/receiving/saved-week-html-0378a7b6/baseline-saved-week.json --output NEW-handoff.html
```

`receive_browser.mjs` retains the exact native Windows Chrome/Playwright paths used in receiving; pass a new output directory for every attempt. `baseline.mjs` and `verify_native.mjs` retain the executed source producer and receipts. They are provenance/replay aids, separate from the product CLI. The existing saved-week-comparison GitHub workflow already executes `tests/*.mjs` and will include both new test modules when this source is published; no workflow change is needed.

At this checkpoint the contribution is implemented and verified in isolation. Independent parent review, remote source publication, hosted checks and integration are pending. A GitHub issue creation attempt at2026-10-08T17:14:32Z was refused by the shared secondary content-creation limit; no alternate GitHub mutation route was used. No source PR, merge, deployment or real-world caregiver outcome is claimed here.

Source coordination update: an ordinary paced retry after the shared cooldown created [TasteTable #39](https://github.com/Jacob-Met/tastetable/issues/39) at 2026-10-08T17:28:51Z. Main remained e0f6fbaf1f81fbb1e9926948294549c744228def. Source PR, hosted checks and integration are pending at this freeze.
