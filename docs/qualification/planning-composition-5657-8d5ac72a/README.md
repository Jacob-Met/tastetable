# Independent receiving of TasteTable #56 + #57

**The corrected composition passes the unchanged 16-case planning-input browser suite and all four independent integration controls.** Valid profiles can now be reviewed and explicitly applied while the current taste field contains malformed quoted text. A silent programmatic edit after preview retires the stale replacement without a page error or loss of the accepted week and notes. Commas and literal quotes survive real Save/Open and the next explicit planning request.

Receiver: `estate-8d5ac72a6fae / receiving5657`. Product retains implementation ownership. This packet covers actual Chromium execution of the maintained composed page with a recorded loopback transport fixture. Separate product and engine records cover native CLI and broader codec receiving.

## Exact source custody

The composition starts from custody commit `4b27a73f518d1edd2c02b2bb08f938db9f8f9164`, tree `03a12e2dc5b45184cab9956e026dd21094132b8d`. That commit/tree association was fetched directly. Original work remains identified by [#56, planning-input files](https://github.com/Jacob-Met/tastetable/issues/56), and [#57, preserving quoted taste entries](https://github.com/Jacob-Met/tastetable/issues/57).

The source owner supplied these final source/test entries, each mode `100644`, type `blob`:

| Path | V2 Git blob |
| --- | --- |
| `README.md` | `3707c2dea515f523288ad9afbeff7e856e558d07` |
| `static/app.js` | `2de361746c6bcc64fead2f670f8eed2b0bda9886` |
| `static/index.html` | `a5aa6c1cc3e61857aeb92f53de7a6ac3e17c2c8d` |
| `static/profile_file_ui.mjs` | `1020a955fd5f73597407dc7192946f3562dc9c79` |
| `static/profile_file.mjs` | `83289bac26a281292595bd351c5f312165ccf87f` |
| `static/taste_fields.mjs` | `80d9c4a63b395bd3afb1005cad8e3bb52ac71df8` |
| `tests/profile_file.test.mjs` | `590bb4c7de3cf0fc006b030a0e2abdc25d9e8fb6` |
| `tests/taste_fields.test.mjs` | `c0f9e375fd1aa2e626563ffcc2a1d602034290e9` |

The browser closure contains 15 maintained source files. V2 changes only `static/app.js`, `static/profile_file_ui.mjs`, and `static/profile_file.mjs` relative to the preserved first composition. All other closure bytes and both recorded transport fixtures are identical.

The profile UI accepts an optional raw `readInputState` snapshot for preview identity and the later Replace comparison. Its default remains `readInputs`; the ordinary app supplies raw field strings and selected constraints. Actual Save still uses parsed `readInputs` and profile validation. The Replace comparison is inside the existing catch. Independent text comparison confirms that the codec's sole change is removal of its comma-only refusal block; every other codec byte is unchanged.

## Executed results

Both versions used actual Chromium `153.0.8010.0`, binary SHA256 `53a15d6c3a3d27dfb54c4ba60278b1683136f70cf1e67e989da7dfbd3d451ef0`.

| Receiving boundary | First composition V1 | Corrected composition V2 |
| --- | --- | --- |
| Root's exact frozen planning-input suite | 16 passed, 0 failed | 16 passed, 0 failed |
| Malformed current quotes followed by valid profile review | Valid file incorrectly refused | Review and explicit replacement pass |
| Programmatic malformed edit after preview | Uncaught SyntaxError; stale preview remains active | Stale preview retired; current week, notes and inputs preserved |
| Quote-only Save/Open round-trip | Pass | Pass |
| Comma-and-quote Save/Open round-trip | Known codec refusal, with state preserved | Pass |
| Independent V2 summary | See preserved original classifications | 4 passed, 0 failed, 0 known limitations |
| Browser page errors | One confirmed error in the programmatic-edit case | Zero |

The original 16-case harness is byte-identical to Git blob `fbeef33b2c369d0afc5fb015040ba975a5ec32d3`. It ran once on V1 and once on the meaningful V2 source change. Its cases cover real downloads, literal previews, cancel/replace behavior, invalid/failed/oversized reads, late-file races, plan/sample/week/stop/pagehide retirement, and pending-plan/result coherence. It was not rewritten to accommodate the composition.

The independent controls are preserved with Git content identity `deb3dc090b3f0cd12b10c7e00866bc8c3955c247`. The corrected receiver has identity `a379bb56f86e8d48bd4ed6bc96b335392ee5e793`. The fixtures were authored for the composition boundaries; no blindness claim is made.

## Concrete integration evidence

For V1, entering `"unfinished current taste` and opening a valid Japanese/Jazz profile produces a file-open error about closing a quoted entry. The file itself is valid. In V2 the same file opens for review without changing the current draft, and explicit Replace applies its valid values without issuing a planning request.

For the second case, a valid preview is staged first. The receiver then assigns `cuisines.value = '"unfinished after preview'` without firing input/change events. V1 throws from `profile_file_ui.mjs:87` through `readInputs` and `parseTasteEntries`, leaving the old preview actionable. V2 detects the changed raw snapshot, disables and hides the old preview, and shows the changed-input message. The accepted week, notes, current programmatic value and request count are unchanged.

The round-trip controls use native browser downloads and the actual Open button/file chooser. They include:

- A leading literal quote: `"Leading quotation"`.
- Embedded literal quotes: `Simon "Live"` and `The "Quiet" Film`.
- Comma-bearing entries: `Latin, Caribbean` and `Life, Animated`.

Each supported profile is downloaded, reopened, reviewed, explicitly applied, and followed by an explicit Plan action. The captured request arrays match the original entries exactly; Save/Open/Replace makes no automatic planning request. The quote-only download SHA256 is `3d3c37e9bb46ca8d63a6660bd2c46eb6a857cb618ecaab5424cad3c0e3457f2e`; the V2 comma-and-quote download SHA256 is `b606f08451ca4dad0ebd68004e1564dbb78269b2cd5c3d36883b31d41d5fcd74`.

## Preserved receiving correction

The first independent run contained a receiver mistake: it expected the ordinary planning request to trim city before submission. Existing requests preserve the raw city string; Save is the normalization boundary. That assertion stopped the two round-trip cases before they reached Save. Those two failures are not classified as product defects.

The original report and original receiver source remain in the V1 archive. Only that city expectation and a subset-selection facility changed in the receiver. The two previously blocked round-trip cases were then run on unchanged V1: quote-only passed, and comma-bearing input produced the known codec refusal with state preserved. The original 16-case suite and two confirmed malformed-quote failures were not repeated on unchanged V1. The same corrected receiver ran all four boundaries on V2.

## Durable records and reproduction

[v1-receiving.json](v1-receiving.json) preserves the original source payload, complete fixtures, frozen 16-case harness, both receiver versions, initial positive and negative reports, oracle correction, and corrected two-case replay. Its Git blob is `34ed06e30ea845695795d50d7bc0e130d6590af1`.

[v2-receiving.json](v2-receiving.json) preserves the exact V2 payload, unchanged fixtures, both executed harnesses, controls, source identities, supervisor and complete raw worker reports. Its Git blob is `28b9d62d0fca3e5720a1df1bc354bf618f626105`.

Both are JSON envelopes. Decode `data` from base64, gunzip it, and verify the recorded compressed and decoded SHA256/byte counts. Extract each decoded `files` entry to its relative path in an isolated directory. In the recorded runtime, run the extracted harnesses with the extracted payload:

```sh
node frozen-16-browser.cjs v2/payload.json
node independent-browser-v2.cjs v2/payload.json independent-controls.json
```

The harnesses name the pinned Chromium binary and Playwright installation used during receiving. Both V2 commands return zero with their reported 16- and 4-case results. Original failures and the explicit V1 codec limitation remain preserved rather than being relabeled.

Product's separate author-native receipt is Git blob `6829a17a0e5ae0ce7ade7b1087a53f0851c9c400`; its actual-browser/native receipt is `21cbc262699bb571159fb4c6dbf3c1e4e6cd161d`. Those are separate evidence boundaries. This receiver's HTTP planning responses are recorded fixtures and do not establish live-provider or installed-service acceptance.

Only these three independent receiving documents are added. The original #56/#57 evidence stays intact, and root retains serialized integration and publication.
