# Planning input files — independent receiving

This contribution implements TasteTable issue [#56](https://github.com/Jacob-Met/tastetable/issues/56): save normalized planning inputs before generating a week, open a native single-profile JSON file, review every value, and explicitly replace the current inputs. Only replacement clears the existing week and venue notes. Requesting a new plan remains a separate user action.

## Source and behavior

The source base is `328df51af830e91f304417a66d74f43d94ae0c02` (tree `df0251092f77d96169daa097abaec409ecabe6ba`). The seven source/test entries in `composition-v1.json` are frozen; the README candidate is `617288516396a8fba4f2c5c51fdf93aca80a566a`. Four entries are additions; three edit existing files. No dependency, backend, profile schema, request-controller module or workflow changes are proposed.

The native five-field profile format is preserved: cuisines, music, films, city and constraints. Saved files contain normalized values and a final newline. This is not a raw-text archive. The browser rejects files above 65,536 bytes, invalid UTF-8/BOM, duplicate or unknown JSON keys, malformed field types and values outside the native constraints. The existing comma-list form imposes a deliberately narrower input envelope: taste entries containing commas, remaining C0/DEL controls and edge U+FEFF taste characters are refused explicitly. City commas and city U+FEFF remain representable. Native defaults, Python stripping behavior and Unicode codepoint limits were independently checked. A separate saved-week taste-field successor is outside this frozen change.

Opening, cancelling, invalid files, read refusal and obsolete asynchronous reads preserve the current form, persona, week and notes. Applying a reviewed profile uses the existing clearing lifecycle, retains the selected week date, fills the form and focuses cuisines. Edits, sample selection, plan submission, opening a saved week, stop, pagehide and a newly accepted result retire older pending reads or previews. Untrusted preview text is rendered literally.

## Verification

| Receiver | Actual result |
| --- | --- |
| Author's native module tests | 12/12 pass, no skips |
| Independent frozen codec corpus | 120 cases, zero candidate mismatches |
| Actual maintained native CLI | 172 processes: 120 originals, 47 normalized outputs, 5 stdin controls |
| Browser baseline | Existing page and plan/notes control passes; three proposed controls absent as expected |
| Candidate Chromium behavior | 16/16 groups pass; no browser page errors |
| Desktop/mobile visual inspection | Actual 1280- and 390-pixel viewport captures inspected; no horizontal document overflow |

The native corpus admits 59 original files; the browser codec admits 47. The 12 differences are the documented browser representation exclusions, not unexplained mismatches. Native execution used the actual CLI with its existing ScriptedModel and FixtureTransport. The corpus was authored before the candidate codec was exposed.

The browser receiver was also frozen before candidate source exposure. It exercised actual maintained modules in Chromium 153.0.8010.0 (binary SHA-256 `53a15d6c3a3d27dfb54c4ba60278b1683136f70cf1e67e989da7dfbd3d451ef0`). Its HTTP plan/persona responses are explicit local recorded fixtures. It tested downloaded bytes, review/cancel/replace, accepted-note preservation, malicious literal text, out-of-order reads, pending-plan cancellation and stale-response suppression. The pagehide check uses a synthetic PageTransitionEvent in a real browser DOM; it does not establish BFCache restoration. No live provider, installed service, hosted route or deployment was exercised.

## Retained evidence and replay

- `baseline-native-v1.json`, `author-node-v1.log` and `manifest-v1.json` preserve author controls and source identities.
- `native-cli-receiving-envelope.json` is a connector-readable envelope for the complete independent native packet. Decode `packet.content` from base64, verify SHA-256 `d7d3ff988eb8a86bc3b2f7d1ed561091c2000c2bc6b5a4405b6ae0cd63936e6b`, gunzip, then parse the JSON files map. It contains the frozen corpus, exact six-file native closure, candidate, executed receiver and all 172 process logs.
- `browser-harness-v1.cjs` and `browser-baseline-v1.json` retain an initial receiver failure: its selector chose an intentionally hidden notes textarea. Version 2 corrects only that selector and the bounded timeout. Product source was unchanged by this correction.
- `browser-harness-v2.cjs`, `browser-baseline-v2.json` and `browser-candidate-v1.json` retain the executed baseline and candidate receiver. `browser-replay-inputs.json` provides exact response/saved-week inputs and source paths for building its JSON payload from this checkout.
- `browser-visual-harness.cjs`, `browser-visual.json` and both JPEG captures preserve the additional visual check. The visual manifest records an earlier PNG output truncation and why the snapshots were repeated in JPEG.

The native packet also retains its evidence-only launcher syntax failure and repaired launcher. The executed receiver, native source, candidate and all original logs were unchanged; the 172 processes were not repeated to repair packaging. A binary GitHub Fetch readback refusal led to the UTF-8 envelope, whose text, decompression and decoded identities were verified.

Run the maintained unit test with `node --test tests/profile_file.test.mjs`. The preserved browser harness consumes a JSON payload path with exact source strings and fixtures. Its recorded environment used Node v24.19.0, the CaaS Playwright install and private /dev staging because the shared overlay was full. Source identities in each result enable receiving against another environment without mislabeling it as the original execution.

## Integration boundary

Worker `estate-8d5ac72a6fae` owns this narrow contribution. Original author changes and independent receiving evidence are preserved on an isolated source branch. The complete base tree is retained except the declared overlay, including all workflow definitions. Their current events are pull_request or push to main; no PR, main update, workflow edit or dispatch is part of this custody operation. This is implemented and locally verified source, pending the estate's receiving/integration process. It is not a deployed or demonstrated live-user improvement.
