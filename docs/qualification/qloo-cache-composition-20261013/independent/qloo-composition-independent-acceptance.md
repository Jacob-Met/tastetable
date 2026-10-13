# Independent Qloo composition acceptance — Anvil

Accepted production bytes: `qloo_client.py`, 12,554 bytes, SHA-256
`bcabc1fa1a2440e19028ac6e5ec21e9ff8ab049276920f225d968eda84141573`,
Git blob `01739846920c467fbac11717458d294bd0aacacf`.

This is a separate composition review. The original source-hardpinned Toolbox
receiver, original eight-course receipts and original recovery kit remain unchanged.

## Source review

Compared with original recovery contribution
`656ad3220bb0d8f2cb1584377898c692c512ca71`, production changes are exactly
`from copy import deepcopy` and a deepcopy around each of the three public
`self._get(..., parse_*)` returns. The existing parsers, request identities,
transport ownership, admission-before-cache behavior and explicit-retry policy
remain unchanged. Cache hits still parse the retained successful raw payload;
each public result is then detached, including nested mutable values.

The original nine-method recovery test is byte-identical: 6,508 bytes,
SHA-256 `e3477c2448de44cc5152ba4265b4b3ebf5819d3f98dd6cab0e33f2bd42a81b33`.
All its assertions use unittest methods or explicit exceptions, so optimization
does not remove its checks.

The original PR95 isolation test differs only by the name/comment of its repeated
parse-failure course and the transport count expectation changing from one to two.
It still requires the original exception object on both explicit calls. Two is
the composed contract: a rejected payload never enters the cache. All other
isolation test bytes are preserved.

The two new maintained interaction tests were read in full: 2,573 bytes,
SHA-256 `10bf7c4eb69a891b46773909d44bbf693b0974e4cf4592ffdd4cd3b91c399321`.
They cover search and insights in one client lifetime, require explicit recovery
at request two, then mutate nested source_data/affinity, tag metadata, scalar
affinity and list membership on transport and cache returns. They require clean
subsequent results, unchanged transport data and exactly two requests. They use
unittest assertions and have no bare assert statements. Root's maintained-test
runs remain root's evidence; this review adds the independent course below.

## Witness frozen before composition exposure

`qloo-composed-public-receive.py`: 7,749 bytes, SHA-256
`6c94c54fd20440fba49e0d246b1099d9e13d1a77864f11fb8d9094696adfea8e`.

The independent witness uses a hand-authored pristine expected Entity dictionary,
not expected values copied from the implementation's first response. It calls only
public search/insights methods and never inspects private cache contents. A
search response with a valid first entity followed by a numeric parse failure,
and an insights declared-failure envelope, each refuse after exactly one request.
An explicit identical call recovers; nested caller mutations after both the first
successful response and a later cache hit cannot contaminate the next result.
The successful payload retained by the authored transport also stays unchanged.

| Source | Cloud normal and -O result | Transport calls per endpoint |
| --- | --- | --- |
| Original recovery only, a8362350…1aaf at PR96 | Recovery passes; subsequent nested isolation fails | 2 |
| Original isolation only, 22b6d5ee…79eb at PR95 d2a3d26c | Explicit retry remains stuck on the rejected cached payload | 1 |
| Composed bcabc1fa…1573 | All four stages pass for both endpoints | 2 |

All three source variants were exercised in fresh cloud Python 3.12.14 processes
normally and with genuine `-O`. The same frozen witness independently passed both
modes against the exact composed source on the RDC ThinkPad with Python 3.14.4.
Native process 2903903 completed exit 0 with empty stderr; source and witness
hashes stayed unchanged. The four native endpoint/mode courses each finish with
two transport calls, no automatic retry, and pristine results after both mutations.

Root's native source was read-only at
`/home/jacob/hamon/receiving/root-d3745-qloo-composition/combined/qloo_client.py`.
Anvil's runner and receipts are isolated at
`/home/jacob/hamon/receiving/anvil-d3745ea0f44f-qloo-composition`.
Both native case receipts were read back and byte-hash verified before handoff.

## Reproduce this bounded receiver

Use a fresh process, an explicit source pin and a new output filename:

```sh
python3 -B qloo-composed-public-receive.py --client /path/to/qloo_client.py --expected-sha256 bcabc1fa1a2440e19028ac6e5ec21e9ff8ab049276920f225d968eda84141573 --output new-normal.json
python3 -B -O qloo-composed-public-receive.py --client /path/to/qloo_client.py --expected-sha256 bcabc1fa1a2440e19028ac6e5ec21e9ff8ab049276920f225d968eda84141573 --output new-optimized.json
```

The witness executes the exact verified source bytes, creates its receipt
exclusively, and returns zero only when both endpoint courses and source
preservation pass. Its explicit checks remain active under `-O`.

These are synthetic public-client receiving checks. No network, live provider,
credential, external model, private-cache read, existing service upgrade or
full FastAPI-suite pass is claimed. Root retains source integration and the
broader maintained-test qualification.
