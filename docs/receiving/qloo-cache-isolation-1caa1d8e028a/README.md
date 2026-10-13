# Qloo result/cache isolation: receiving record

Issue: [#94](https://github.com/Jacob-Met/tastetable/issues/94). Source author:
`1caa1d8e028a/source_delivery`; independent receiver:
`1caa1d8e028a/remote_consumer`.

Editing nested metadata in a returned entity used to change the cached response
and the fixture or supplied transport's own data. A later identical request
could therefore return the caller's annotation as if it were provider metadata.
The repair copies parsed results at the three public client return boundaries.
The [usage guide](../../QLOO_CACHE_ISOLATION.md) describes the ownership contract.

## Exact source

Baseline commit: `368da250717cc9d1859253ac08a2f4783cd17560`;
canonical tree: `4b94ecb13f6cefdc32f1c27335f9bca2130a0912`.
The [source projection](source-projection.json) identifies all nine unchanged
inputs used to exercise the client, existing Python consumers and offline CLI.
It is a bounded projection, not a full repository checkout.

| File | Candidate SHA-256 |
|---|---|
| `qloo_client.py` | `22b6d5ee7664f37d4477d0e0973727d36f07d862a455a1ff9d7e7d2b4acc79eb` |
| `tests/test_qloo_cache_isolation.py` | `6533dc8542f0eae105ce4cb0b0b2c89d3bea7735e921d97240e2535a422c69db` |
| `docs/QLOO_CACHE_ISOLATION.md` | `89498b4ce56cb4a27bc6c29324d2da57eef41639d7597faa6805ac2d53903bf0` |
| `README.md` | `2ec72ed2f29eef6c4e91083c5b924defdd6de07790fd28a8e5d03c526879893f` |

Original `qloo_client.py` SHA-256:
`a7b3362896273e05782e789cb1f89f053f32c4e1b766ae5998e19ed9fab103f9`.
The [frozen review inputs](candidate-source-freeze.json) retain their original
pre-review status; the completed [independent review](independent/source-review.json)
records the subsequent acceptance of those exact bytes.

The complete production diff is one standard-library import and three public
return wrappers. `_get`, direct parsers, metric conversion, request construction
and transport/error handling are unchanged. Optional metric work retained by
[#85](https://github.com/Jacob-Met/tastetable/issues/85) is neither adopted nor
modified. The public copy happens after parsing, preserving raw cache reparsing.

## Executed results

| Boundary | Original | Candidate |
|---|---|---|
| Same authored cache-isolation tests | 7 failed, 5 passed | 12 passed |
| Existing client, planner, constraints and local HTTP lifetime tests | Not rerun as a baseline | 22 passed; 1 web endpoint test explicitly deselected |
| Actual offline persona CLI, Rosa/Harold/Mei | All three exit 0 | All three exit 0; stdout bytes exactly equal to original for each persona |
| Independently frozen public-method receiver | 7/10 pass; 3 nested ownership failures | 10/10 pass |

Author pytest runs used CPython 3.12.14 and pytest 9.1.1 with external plugin
autoload disabled. An earlier startup attempt could not import pytest because a
shared package cache had disappeared; it executed no tests. Both failed startup
logs are retained. A read-only installed package closure was copied into an
owned temporary directory for the successful runs, then removed after testing
to recover capacity. Its package inventory and version result remain recorded.

The independent receiver was frozen and executed against the original before
candidate source, tests or guide were inspected. Its ten contracts cover nested
search, insights and tolerant tag results; earlier and later caller values;
transport data; cache keys and request counts; raw metric conversion on repeated
reads; declared/parse/transport errors; unsupported type refusal; and existing
empty-result behavior. The nested tag-name fixture is a tolerant-parser control,
not an assertion about the provider's schema. `Entity.to_dict()` still exposes
the current entity's own fields.

Both independent runs preserve source bytes, mtime, mode and inode. The exact
oracle is [receive_cache.py](independent/receive_cache.py), SHA-256
`f1b2a0f0f63a1ed0be21afd80ea3b45cfba54837b8c1a2281085903c187db830`.
This frozen oracle qualifies PR #95 source `d2a3d26cb686b568ed0db0509f152e6c24e260cc`
(and merge `59dbb0c4348b9a0374da4f05f95c23eef6080521`). Later PR #96 intentionally
changes parser-error cache admission and repeated-error transport counts. For that
composition, use its [separate qualification](../../qualification/qloo-cache-composition-20261013/README.md).
To rerun this historical oracle, use the exact PR #95 source and a fresh output directory:

```sh
python -B -S docs/receiving/qloo-cache-isolation-1caa1d8e028a/independent/receive_cache.py --source qloo_client.py --out /tmp/tastetable-cache-receiving-new
```

## Raw evidence

- [Author archive](author-results.tar.gz), SHA-256
  `135ec6065a4f316fbc2501ecda4fad0c789e0ee41c54ffea97e9a0059ff8e802`:
  31 exact files, 182,398 uncompressed bytes. Contains source pins and diff,
  original reproduction, successful and failed test-start logs, all six CLI
  stdout/stderr captures, per-process results and package provenance.
  [Inventory](author-inventory.json) binds every archive member; archive readback
  checked every byte, size and stored mode.
- Independent [original receipt](independent/original/receipt.json), SHA-256
  `2b535f75750b3e01173d2a2cb25721b1892f38bd8972f8fc93409007be042621`;
  [candidate receipt](independent/candidate/receipt.json), SHA-256
  `312e4900c576630bf4ace46251f5df1ec01f514013c15bfa4424cfe436c32ca0`.
  Each directory also retains its exact process record and stdout/stderr.
- [Independent source review](independent/source-review.json), SHA-256
  `6205b911fe32fe2479ef30295187a03d479b5a0e037b09839975efb9c401c79b`.
  It binds all four frozen code, test and documentation files.

These results qualify cloud Linux source execution with fictional in-memory and
fixture data, plus an authored loopback HTTP server. They do not claim live Qloo
or model responses, browser receiving, a full repository suite, installed-device
adoption, recommendation quality or clinical validation. No provider credentials
were used and no GitHub Actions execution was requested.

## Isolated native follow-up

The [ThinkPad receiving record](../qloo-cache-isolation-native-1caa1d8e028a/README.md)
qualifies the same exact PR #95 source on native Linux/Python 3.14.4: the unchanged
oracle passes 10/10, and three actual offline persona outputs match the saved
cloud results byte for byte. That record preserves all source and receipt pins,
raw routed completion evidence, and the later PR #96 composition boundary. It
does not claim installed-consumer adoption.

