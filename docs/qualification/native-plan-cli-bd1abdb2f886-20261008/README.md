# Native offline planner qualification

This contribution implements [TasteTable #19](https://github.com/Jacob-Met/tastetable/issues/19): a maintained native command for selecting an existing fictional persona or supplying an authored profile file/stdin. It runs the existing planner with an explicitly selected fixture transport and scripted model, and returns an offline-labeled envelope containing the complete original response.

[Command usage](../../NATIVE_PLAN_CLI.md) · [Frozen native evidence](evidence.tar.gz)

## Source boundary

Native execution is pinned to **`0836a562f790adc4519b934f242ba3c1a78290f8`**, tree `5236a1aaf096a1b5188dbea26f33d00dc41062f5`. The isolated five-file runtime materialization preserves these exact original blobs:

| Unchanged native input | Git blob |
| --- | --- |
| `agent.py` | `883aff984464f2d43cda18f8e60b81240d6c3fb3` |
| `qloo_client.py` | `cca322e0c9af96c481ba8f7ef286e85d3b90cfd2` |
| `constraints.py` | `53138a106455cc3fa40d812d1ade3c60fcbbb916` |
| `personas.py` | `1eb6768780cafaf9b1666e39b7fc17aa21204f16` |
| `fixtures/qloo_fixtures.json` | `60c5d92f905755454bb280b8181f8836a74bd955` |

The four additive product/test/usage inputs are:

| New file | Qualified Git blob |
| --- | --- |
| `tastetable_cli.py` | `d375cb64c6c631cccca2bb43db286e8efd21eedb` |
| `tests/test_native_plan_cli.py` | `202ba42feffc662e46f5df9d22ae67640104cf58` |
| `docs/NATIVE_PLAN_CLI.md` | `757b3da6a6ae22fc6eae4f83a1e92c557537d9ca` |
| `examples/native-profile.json` | `42bbbd183986f6e3e5014172d595b0168aeafb9f` |

The publication parent is `0758d2cca881fb5b5041f80bae2174cf485f4bdd`, tree `5760b8268b1a4b8f5ef919861a118c5900fec87d`. Its five selected runtime blobs remain exact. The separate finite browser studio, saved-week/calendar/request lifecycle and venue worksheet retain their code and ownership. The affirmative wheelchair-evidence work in #20/#21 remains with its existing owner. This consumer does not replace planner, provider, API or care-check implementations.

## Existing capability and missing command

Three native original/reference processes established the gap. The original `python3 agent.py` demonstration returns Rosa's plan; adding `--persona mei` does not change it. Explicitly invoking unchanged `run_agent` with Mei produces a different complete response. The original demo did not promise an argument interface, so this is a new consumer rather than a regression claim.

The new command accepts exactly one profile source. Arguments and the entire bounded profile are admitted before fixture loading or planning. It does not read provider/model selection from the environment. Its output preserves the complete native `plan`, `llm_only`, `comparison`, `trace`, `model_message` and `mock` fields under `response`, beside the normalized input and explicit fixture provenance.

## Actual native results

Execution used Python **3.13.7** on the existing Mac, entirely within `/Users/me/tastetable-native-plan-bd1abdb2f886-20261008`. No additional package installation was required.

| Gate | Observed result |
| --- | --- |
| Maintained process suite | **16/16 methods pass**, including profile and argument matrices. |
| Direct script invocation | **6/6 actual CLI commands** return their expected success or input-error status. |
| Complete producer equality | Three complete responses match the unchanged original producer: Mei, the checked-in example profile and an authored unknown-city profile. |
| File/stdin equivalence | The same example produces byte-identical complete output through a file and stdin. |
| Native original producers | Two distinct additional original-source producer processes support the example and authored-profile comparisons; the already recorded original Mei result is reused. |
| Admission before effects | Dual-source arguments exit while stdin stays open without bytes; oversized input produces no JSON and no fixture read. |
| Offline boundary | Synthetic live-provider/model settings are present; all audited processes record **zero network attempts**. |
| Source and input preservation | All five original runtime inputs, all nine candidate inputs and the authored input files remain exact. |

The maintained suite additionally covers all three personas, actual changed constraints, sparse plans for unknown locations, minimal inputs and null-city behavior, Unicode text, strict type/name/duplicate/numeric admission, exact 65,536-byte input, malformed/deep JSON, missing files, invalid arguments with open stdin, help, broken stdout, closed stderr and a missing fixture. Complete response assertions use the unchanged native producer rather than a substitute plan implementation.

The maintained tests run the actual entry point in separate Python processes with an audit wrapper. The separate receiver launches `python3 /absolute/path/tastetable_cli.py` directly and installs only an owned startup audit hook. The frozen receiver preserves every stdout, stderr and audit record in the archive.

## Exact receipts

| Artifact | SHA-256 |
| --- | --- |
| Original/reference baseline | `e1ec2550792ba516fc143259f6fb4b18c626e504a39dfb077b999e1fe85b09e1` |
| Initial maintained-suite receipt | `97e97f5ed6bb41ec46b046d3faea5747359e842359a3c86d0d16033d156abf7e` |
| Final 16-method receipt | `4c35bbc2264f32f32e8203cf49ce06e76e498d26bc143f2793b05d2d1195cd53` |
| Final suite transcript | `0fa8b66eaaffef1f09560822afc45bf50505ac4d2bc7a906f26f33aaa2c045dd` |
| Direct CLI receiving receipt | `aee17187553e6727211caf46693dd043f4e6a50e6690a7409b6dfc2abe938fca` |
| Direct CLI receiver | `9445f764adcd01caca37eae16a5f4bb5a54b0ab3a2c067f499e68db42202e26d` |
| Complete evidence archive | `5f7bd285eed663a2732168ecf0f16be53b160ec7e52b3920c1142a8329ef22da` |

The archive is **62,099 bytes**, with 55 regular-file members. Its manifest identifies the other 54 members by byte count, SHA-256 and Git blob; every member was read back and verified after export. Source bundles, frozen drivers, original/final receipts, raw process streams, audit records and retained failed attempts are included. Native drivers retain their original absolute paths; the maintained command/test instructions provide the ordinary fresh-checkout workflow.

## Retained corrections and failures

The first maintained run passed 15 methods and failed one diagnostic assertion. Python 3.13 accepted a 2,000-deep array as JSON and then correctly refused its non-object profile shape. The expected exit 2, empty stdout and absence of fixture/network effects had already passed. The corrected test permits either parser-depth refusal or non-object profile refusal while retaining those effects and status requirements. **Consumer source did not change.** The original test, transcript and receipt remain in the archive.

Two attempts stopped at the existing disk-space guard before tests. A prematurely launched dependent receiver then stopped on its missing prerequisite receipt before any candidate command ran. The subsequent explicit return-code/receipt gate ran the final suite and receiver successfully. These failed attempts remain separate.

Independent review also found that a shared review export had normalized the fixture's CRLF bytes and added a final LF. The native baseline and candidate had always retained the exact **21,190-byte, 1,026-CRLF** fixture, Git blob `60c5d92f905755454bb280b8181f8836a74bd955`, SHA-256 `5eaa5d2f32a6e4522ecc4f6c69e84dc110be031c3cdf5737ac52f9fabb99fed0`. Direct native readback confirmed both files; only the shared export was corrected. The mistaken export and correction record are retained. All nine corrected shared files now match final native qualification.

## Interpretation

These results qualify the new local consumer against the stated native source and synthetic fixture data. Existing heuristic checks and sparse-result notes remain visible; no live venue/provider validation, clinical conclusion, web-format compatibility or installed-service adoption is implied. Applicable hosted tests and independent final published-source review remain separate integration gates.
