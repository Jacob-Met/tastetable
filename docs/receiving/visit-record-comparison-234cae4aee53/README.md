# Visit-record comparison: recovered source and native receiving

This detached source history combines exact recovered production/source tree `88577222cd9a3d6d94b497f74e78ad79bcb5923f`, exact peer-oracle recovery tree `96741f02b57ecde36d4de9418a94dacc039cc437`, and NEW maintained model-adapter tree `d6e0891b39e473f0ffa4690944a91d6f155c24ec`. The actual new model run below is separately attributed to its own source and receipt. Main integration, installed use and the ordinary-file CLI gate are not established by this source custody.

The production model, CLI, supplied seven-group CLI test, all three original codecs and recovered independent oracle retain their original Git blob identities. The current guide names both supplied maintained test files. Earlier guides remain at [recovery/original-guide-v2.md](recovery/original-guide-v2.md) and [recovery/original-guide-v3.md](recovery/original-guide-v3.md); [the v4 guide-change record](recovery/guide-v4-change.json) explains this documentation-only update.

## What is retained and what was lost

[Checkpoint loss](recovery/checkpoint-loss.json) describes the first recovery snapshot. The complete old author and peer archives, the old authored model-test source, and full independent raw result packets remain unavailable. Historical passing observations are disclosed as such. The original loss inventory is preserved unchanged; its statement that a guide successor was still required refers to that first snapshot. This snapshot supplies that successor.

The [peer recovery](peer-recovery/README.md) contains the exact independent model/report oracle and its hash-only recovery result. That recovery did not execute the oracle. The NEW maintained adapter uses it for a separately qualified run; neither that new run, hash verification nor a historical passing summary restores the lost old outputs.

## Two distinct receiving gates

Root's first ordinary-import model-adapter run passed on 2026-10-08 at 23:39:59.991–23:40:00.751 UTC. Its [complete actual receipt and receiving record](root-model-stock/README.md) are preserved separately from the lost historical packets. The external owner's first ordinary-file CLI run remains a separate acceptance/execution task. The earlier pending documentation checkpoint remains [preserved verbatim](root-model-stock/README-before-model-run.md).

| Gate | Expected native work | Actual boundary required | Status |
| --- | --- | --- | --- |
| Root model adapter | One native test containing seven oracle groups; 60 comparison and 41 rendering calls | Six ordinary source files and unchanged independent literal assertions | Passed once; complete new receipt preserved |
| External CLI owner | Seven native test groups containing 42 CLI child processes | Ordinary source and input files, including 8 MiB boundaries | Pending separate owner acceptance/execution |

### NEW maintained model regression

`tests/test_visit_record_compare_oracle.mjs` is a new adapter, not a reconstruction of the unavailable authored model test. Its [provenance and full physical closure pins](maintained-model-adapter.json) were frozen before execution. The six-file closure is 40,419 bytes and creates no large input fixture files.

From an ordinary staged root, the separately authorized command is:

```bash
node --test --test-reporter=tap tests/test_visit_record_compare_oracle.mjs
```

Use an existing Node.js 22+ runtime with loader/cache environment variables removed. The adapter passes four ordinary imported module namespaces directly to the byte-exact independent oracle, observes its results, and checks all seven exact returned group names, the 60/41 call counts and the oracle file hash before/after. Its diagnostics contain observed group names, call counts, check hashes and oracle hashes.

The unchanged oracle still returns a hardcoded description of its historical in-memory-loader boundary. The adapter deliberately does not print or adopt that string. A new receiver must retain its own runtime/timestamps, complete stdout/stderr, source pins before/after, process result and actual physical-import provenance. One native test is not reported as seven native tests.

This adapter is not silently added to the external CLI owner's seven-group command. Its result cannot qualify the CLI's ordinary-file acquisition, and the CLI report-equality checks do not replace the oracle's independent literal model expectations.

## First ordinary-file CLI receiving

This requires separate owner acceptance. The [project request](https://github.com/Jacob-Met/tastetable/issues/63#issuecomment-6070936392) and central pointer do not constitute acceptance or execution. Use an existing Node.js 22+ runtime, with no installs, hosted Actions, source loader or file-handle adapter.

Stage these six ordinary files in a fresh owner-controlled source directory, preserving relative paths and verifying every byte count and SHA-256/Git blob against the snapshot:

| Path | Bytes | Git blob |
| --- | ---: | --- |
| static/visit_record.mjs | 7525 | 2b5b37e3d4a227e00a5b0052a962d13512b53e48 |
| static/week_file.mjs | 6642 | 420ddb8f63fca264dcf97be7147801105696155d |
| static/week_plan.mjs | 3913 | 8ed28163e0273c510fdd8e6f7c5d1c8476efb862 |
| static/visit_record_compare.mjs | 5264 | 83de5285cfc48c77be44f24bea2729fefd591d7d |
| tools/compare_visit_records.mjs | 4792 | 560bce0a3f61faec8d68d78686037616076e4184 |
| tests/test_visit_record_compare_cli.mjs | 10638 | 0275beaec2490dad52d83b7802a7299d7867b432 |

Total source: 38,774 bytes. Require at least 20 MiB free in an empty owner-controlled temporary parent before accepting the task. Set TMPDIR, TMP and TEMP to that parent. Unset NODE_OPTIONS, NODE_COMPILE_CACHE and NODE_V8_COVERAGE before starting.

From the staged source root, the stock invocation is:

```bash
node --test --test-reporter=tap tests/test_visit_record_compare_cli.mjs
```

Run it once and preserve failures without silently repairing or repeating. Seven groups perform 42 ordinary CLI child invocations: 13 help/grammar, 3 Unicode/order/reversal, 2 literal-hyphen/same-file, 14 admission/UTF-8, 4 missing/directory, 4 exact-8-MiB and 2 oversized controls.

Each group creates its own mkdtemp directory and removes only that directory in t.after, including on a failed group. Input preservation is asserted through hashes and modes before cleanup. The receiving record therefore retains executed source, full TAP/process streams and source guards; it does not claim retained physical input fixtures. The expected report delegates to the public renderer, appropriate for this filesystem boundary and separate from independent model correctness.

Retain runtime/version/platform/executable, the exact invocation and environment sanitization, start/end timestamps, complete stdout and stderr, normal exit/signal/error, TAP tests/pass/fail counts, source hashes and modes before/after, and any remaining own-temporary entries. Acceptance requires exit 0, no signal/process error, empty stderr, tests 7/pass 7/fail 0, unchanged source pins and clean own temporary directories.

## Optional exact preserved CLI collector

[stock/receiver.mjs](stock/receiver.mjs) is the exact pre-refresh 4,743-byte collector, SHA-256 `ab03afa7eacc1f9d9ee26f9da736d18e4768d9a40256e7da4e063e009be83023`. Recovery rehashed it without execution. It verifies six source pins, runs the command above once, captures stdout/stderr as UTF-8 strings, and emits a gzip/base64 serialization of that JSON. The gzip encoding preserves the captured JSON; it does not by itself prove byte-exact original process-stream capture. A post-run source-read exception can also occur before its receipt is emitted. The receiving owner's independent complete-byte and first-failure capture requirement governs. Its intrinsic guard is 10 MiB; the receiving request conservatively requires 20 MiB before launch.

The collector was authored as an **eval script**: process.argv[1] must be the staged source root. Do not invoke it directly as `node stock/receiver.mjs ROOT`. Load its exact text into Node's --eval argument and supply the source root as the next argument. A small ordinary-filesystem launcher can read the collector text and use spawnSync(process.execPath, ["--input-type=module", "--eval", collectorText, sourceRoot], {stdio:"inherit"}). This only launches the collector; all tested product modules and input files must remain ordinary filesystem files.

If used, its compressed JSON result must be retained with the outer process record, decoded and checked against its raw/gzip digests. Retain the owner's original process bytes and any pre-receipt failure independently. A future result has new native timestamps and artifacts. It must never be presented as the lost original model or CLI run.
