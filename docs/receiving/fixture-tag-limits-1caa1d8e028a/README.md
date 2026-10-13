# Offline tag limits: native receiving record

Issue [#102](https://github.com/Jacob-Met/tastetable/issues/102).
Source author: 1caa1d8e028a/source_delivery. Independent consumer/source reviewer:
1caa1d8e028a/remote_consumer.

The public offline client previously returned all seven bundled tags matching
"a" when its request asked for zero, one, two, three or five. The correction
takes the requested prefix after the fixture's existing name and alias filtering.
It preserves fixture order, original tag fields and a direct transport call
that omits take. The public method still supplies its existing default of three.

## Exact source and scope

Original accepted source: 60d08e7c7c23033a343f1feb3ee67165f07c53f2.
Original tree: 2ce86ab237ba021f875e068984838b9b5aceeed2.
The eight-file source projection was fetched through connected GitHub tools;
every transferred byte was checked against its Git blob before native receiving.

Only one production line changes in qloo_client.py, inside FixtureTransport._tags.
Candidate SHA256: 2927c5f6c924a5d0d31dbadcc8731d10944c07ca6302c814de7544fef4c16610.
The new maintained test and practical guide are bound by
[candidate-source-freeze.json](candidate-source-freeze.json).
Reversing that line restores the complete original qloo_client.py bytes;
the other seven projection files remain unchanged.

This leaves issue #85's optional metric parser and PR #96's cache-recovery
composition unchanged. No provider, planner, agent, fixture-data, HTTP, parser,
dependency, workflow or installed service change is included. The API's existing
integer conversion conventions are reused; no new invalid-input policy is claimed.

## Executed native courses

All product executions below used Python 3.14.4 on the verified Linux ThinkPad
d55b2499-5e82-4805-819a-d0d7ddea1efe, as jacob, under an exclusive new home
capsule. No installation or live network request was required.

| Course | Original | Candidate |
|---|---|---|
| Authored public client plus three ordinary persona CLIs | 8/14 pass; six limit failures | 14/14 pass |
| Independent public-client oracle, frozen before candidate inspection | 3/12 pass; nine limit failures | 12/12 pass |
| New maintained unittest module | Eight methods executed; seven assertion/subtest failures | Eight methods pass |

The author's exact same receiver ran against both sources. Rosa, Harold and Mei
CLI stdout stayed byte-for-byte identical; all three exited zero without stderr.
Original and candidate source/input bytes, modification times, modes and inodes
remained unchanged during receiving.

The [independent final review](independent-review.json) accepts the exact source,
tests and guide. The independent course separately checks the result prefixes, zero and oversized
counts, alias matching before selection, repeated-call caching and returned-data
isolation. Its exact source, both raw receipts and final review are preserved.

## Evidence and reproduction

[raw-results.zip](raw-results.zip) retains complete author and independent course
outputs, receipts and the exact reusable receivers. The adjacent
[raw-manifest.json](raw-manifest.json) lists every archive member's bytes and
SHA256; archive integrity and all member hashes were checked after assembly.
[source-projection.json](source-projection.json) binds original input identities,
and [source.diff](source.diff) preserves the complete production edit.
The raw routed process starts and completions are retained in
[native-custody.json](native-custody.json).

Run the maintained checks from the checked-out repository root:

```sh
python -B -m unittest discover -s tests -p 'test_fixture_tag_limits.py' -v
```

For an original/candidate comparison, extract raw-results.zip and run its
author_receive.py twice, with explicit source directories and new output
directories whose parents already exist:

```sh
python -B author_receive.py --source /path/to/original --out /new/original-run
python -B author_receive.py --source /path/to/candidate --out /new/candidate-run --reference /new/original-run
```

The first command intentionally exits one on the original limit failures.
The corrected source returns zero only when all 14 records and source guards pass.
The practical [fixture guide](../../QLOO_FIXTURE_TAG_LIMITS.md) explains the public
client call and the direct no-take compatibility boundary.

These results qualify the local fictional fixture and the three retained persona
commands. They do not qualify a live Qloo response, venue facts, browser behavior,
Windows runtime or an installed estate service.
