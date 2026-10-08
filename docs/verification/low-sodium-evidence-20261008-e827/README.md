# Explicit low-sodium evidence — 2026-10-08

## Problem and resulting behavior

The existing classifier treated `no low sodium options` as positive evidence
because it contained the substring `low sodium`. Its actual offline planner
then displayed `Low sodium: pass (lower-sodium signals: no low sodium options)`
for a selected meal. In the retained synthetic reproduction, this denied cue
also overrode the existing high-sodium keyword `ramen`.

The correction removes explicitly negated occurrences of the existing positive
cues from the positive evidence set. It recognizes immediately preceding
`no`, `no longer`, `not` and `without`, with an optional `any`, `a` or `an`;
it also recognizes local `unavailable`, `not available` and `not offered`
suffixes, optionally after short descriptors such as `options` or `preparation`.
Each occurrence is checked independently. A separate affirmative occurrence
can still contribute positive evidence, including a later occurrence within
the same keyword.

The existing policy determines the result after that filtering:

| Synthetic evidence | Existing result | Corrected result |
| --- | --- | --- |
| `no low sodium options` | pass, with the denial cited as positive | unknown; ask for low-salt preparation |
| `ramen`, `no low sodium options` | pass | fail from the existing high-sodium signal |
| `ramen`, `no low sodium options`, `steamed vegetables` | pass, citing both the denial and affirmative cue | pass, citing the affirmative cue |
| `ramen`, `low sodium options` | pass | pass |
| `seasonal menu` | unknown | unknown |

An unknown dietary check remains permitted by the existing planner policy.
The actual native consumer test therefore keeps the denial-only synthetic
venue in its plan, with an accurate unknown explanation. The case containing
the existing high cue is rejected and records that cue as the reason.

This is a bounded keyword interpretation, not a general language parser.
The existing vocabulary and its nutritional assumptions are unchanged. These
synthetic controls establish software behavior; they do not validate venue
data or a health outcome.

## Source and ownership

Ownership is recorded in [issue #22](https://github.com/Jacob-Met/tastetable/issues/22)
for `estate-e82707f2bc62`. The receiving source is
[main at `0758d2cca881fb5b5041f80bae2174cf485f4bdd`](https://github.com/Jacob-Met/tastetable/tree/0758d2cca881fb5b5041f80bae2174cf485f4bdd),
tree `5760b8268b1a4b8f5ef919861a118c5900fec87d`.

Only the positive-evidence call within `check_low_sodium` changes, together
with its dedicated `_positive_low_sodium_hits` helper and the standard-library
`re` import. All other top-level source syntax trees are equal to the receiving
source. The shared `_hits`, high-sodium vocabulary, `check_soft_foods`,
`check_wheelchair`, `STRICT`, `evaluate`, agent, provider client, fixtures and
UI retain their behavior and source spans. In particular, the wheelchair work
in #20/#21 retains its separate ownership.

| File | Frozen Git blob |
| --- | --- |
| Original `constraints.py` | `53138a106455cc3fa40d812d1ade3c60fcbbb916` |
| Author-qualified `constraints.py` | `5d1570db8af6dd167909e7f289dec2fc81f8f21e` |
| `tests/test_low_sodium_evidence.py` | `89b3daa81b235807c13ef53ea4a99142c1fbec10` |

The source freeze records the complete SHA-256 hashes, selected source pins,
source-scope check, and ordinary output hashes.

### Publication composition

Publication receives current main
`9930c0a18f339ca00bb7c43b4defd5b0d61ae56c`, tree
`e3e3e48675f9f4ce1f5c139ad24f8c1c640f01dd`, after the separate native CLI and
wheelchair PR #21 integrated. The parent's `constraints.py` blob is
`941ccc6f21c72d9563388301609ef978894336ca`. The published composition is blob
`cab2cecbe4c3a6112022d194a927b9025ec67ab6`.

The frozen low-sodium helper and function are inserted into that exact parent
source. Its existing single `re` import and the complete wheelchair function
are retained. Removing this contribution's helper and restoring its one
function yields the exact parent bytes. `receiving-composition.json` records
that check and both source identities. The original author freeze and its
test evidence remain unchanged. No local tests are repeated for this
composition; the existing full hosted pytest workflow must receive it.

## Local qualification

All local cases use Python 3.12 and standard-library execution. The existing
`FixtureTransport`, `QlooClient`, `ScriptedModel` and `run_agent` implement the
native planner paths. The fixtures are explicitly synthetic. No live model or
provider is selected, and the receivers prohibit network use.

| Receiving check | Original source | Frozen candidate |
| --- | --- | --- |
| Original three-method evidence/admission reproduction | 1 passed, 2 failed; no errors or skips | 3 passed; no errors or skips |
| Same nine-method native regression file | 3 passed, 6 failed; no errors or skips | 9 passed; no errors or skips |
| Complete result for each of the three shipped synthetic personas | Captured as the reference | All three byte-identical, including plans, explanations and traces |

These are separate observations with overlapping behavioral coverage; their
method counts are not combined. The original failing logs and actual native
plan JSON remain in the evidence archive. Source and synthetic input bytes
remain unchanged during execution.

The native regression file runs without extra dependencies:

```sh
python -m unittest discover -s tests -p test_low_sodium_evidence.py -v
```

The repository's existing full `python -m pytest -q` CI is a required receiving
gate. The local environment has no pytest installation, so the local result
does not substitute for that hosted gate. Independent receiving and hosted
CI results are separate from this frozen author receipt. No deployment or
live-provider acceptance is claimed.

## Evidence

`source-freeze.json` binds the candidate and tests to the exact receiving
source. `receiving-evidence.zip` retains the original and candidate logs,
the three-method reproduction, complete native plan outputs, all three
ordinary persona outputs on each source, selected source pinning, and the
scope patch. Its member manifest records each file's size and SHA-256 hash.
