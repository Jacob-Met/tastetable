# First ordinary-file model regression run

This is the **new** execution of the maintained oracle adapter frozen in tree `d6e0891b39e473f0ffa4690944a91d6f155c24ec`. It does not recover or replace the missing older model/CLI raw packets.

## Actual result

On 2026-10-08, the child ran from **23:39:59.991 to 23:40:00.751 UTC** on the existing Node **24.19.0**, Linux x64 runtime:

```text
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node --test --test-reporter=tap --test-concurrency=1 tests/test_visit_record_compare_oracle.mjs
```

The actual cwd was `/dev/shm/tastetable-model-stock-234cae4aee53`. The six ordinary source files total **40,419 bytes** and match every frozen SHA256/Git blob and mode 0644 before and after. There was no source loader or filesystem adapter.

The process exited **0**, with no signal or process error. TAP reports **one test / one pass / zero failures, cancellations, skips or todos**. That single test completed **seven independently defined oracle groups**, observing **60 comparison and 41 rendering calls**. Raw stdout is **1,788 bytes**, SHA256 `cbf920c37f26165f412fd8e8de32e8cbe673a1830ef325af89f396c4dcb08bc7`; stderr is empty. The actual TAP diagnostic contains every group name, call count, check and oracle hash. Both before/after oracle hashes equal `d507a0e78b53019bbda10ecc55b51832eb9da4b173038879cdfc49f2b5e9190c`.

The exact outer tool process result is retained, including chunk `8eb509`, exit 0 and its separately reported wall time 0.751915015 seconds. Do not substitute that duration for the child's wall-clock timestamps.

## Exact original receipt

[raw-receipt.json](raw-receipt.json) is the complete **17,072-byte** original JSON, SHA256 **`59b89efc75222d241ebbe0a3037831e23c3da22b045cf390a5a20191b8ffff09`**. It retains exact base64 process bytes alongside UTF-8 views, runtime/argv/environment/cwd/timestamps/status/signal/error, the collector's own source hash, source manifests and all before/after pins.

The first physical gzip remains at `/dev/shm/tastetable-model-stock-234cae4aee53/raw-receipt.json.gz`: **5,421 bytes**, SHA256 **`6dc7c4a9819c6e7e52c0f2463c03e97cb8192f9741417709edc7bb87ca76e95a`**. It was written and read back before the collector returned. [The complete original process result](original-process-result.json) also retains its original gzip/base64 output.

Root's [read-only receipt reader](read-receipt.py) checked both receipt layers, decoded and rehashed both streams, checked the exact observed counts, and matched all current source bytes without executing the product. It completed with exit 0 (chunk `ef6054`). Independent reviewer `repo_delivery` then read the same known gzip once and separately accepted the complete receipt, stream identities, six source pins, TAP diagnostic and stated boundary. That review is reported here as a received review; the primary executed result is the original receipt above.

## Pre-execution and staging provenance

[receiver.mjs](receiver.mjs), **8,362 bytes**, Git blob `da879d1036dfa2d36bb9101df86bba703b2b9dfc`, SHA256 `32bf968841b10bfdcf23d2af3635e40b6a32f2c7a02ca37391a77f6956f4179c`, and [pre-execution-expectations.json](pre-execution-expectations.json) were frozen in tree `7983de2a790c09c8e54a9dbac8449d4179d6044e` and read back before the product ran. A syntax-only collector check exited0; it did not import the product.

The [exact staging program](stage-source.mjs), [source staging process result](source-staging-process-result.json) and [SOURCE.json](SOURCE.json) preserve the real ordinary-file setup. Staging exited0 at chunk `dba9cb` and launched no product. The manifest is 2,032 bytes, SHA256 `f4e0e110c4267f1214e473edae33850805804c7c6db1bdc5bf66b3e06b94c37e`.

Only **13 exact, root-owned, Git-backed hull source copies** were retired: **80,577 logical bytes / 106,496 allocated bytes**, after complete custody at RecallWeave commit `a9c36fed1a0b9ea53d47d916fb6c944b827b9360` was verified. [The actual relocation record](hull-source-relocation.json) lists every file and pin. The hull's original raw receipt, built HTML page and SOURCE.json remain physically intact. No native output, peer file, cache or environment was removed. After staging, 36,864 bytes remained for this new receipt; the pre-launch guard required 32 KiB.

## Limits

This is ordinary **model-source** qualification. It does not execute the separate seven-group CLI suite, its source-scheduled 42 child invocations or its 8 MiB physical inputs. That request remains pending with the separately approached native owner. It does not qualify browser behavior, a complete checkout, another Node release, a hosted gate, installed use or main integration.

The unchanged oracle's historical loader-boundary string is excluded from the new diagnostics. Its deterministic fixture/report hashes match known historical values, but those are **new values generated during this invocation**, not recovered old physical files or raw packets. The unchanged [loss inventory](../recovery/checkpoint-loss.json) remains authoritative about what was lost.
