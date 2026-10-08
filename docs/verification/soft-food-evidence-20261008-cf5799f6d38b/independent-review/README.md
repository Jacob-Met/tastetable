# Independent soft-food evidence receiving

## Disposition

No blocker remains within the authored short-keyword repair. On exact candidate `constraints.py` SHA256 `f18e4d5ffa14d8a02db2fe9ec6e97a6c0e45e8ebdab1e158124a66f7dd113efa` (Git blob `e9d5cd1575df72b089273740e4b6a444d0cd21a8`), the corrected independent receiver passes **6/6 methods** in ordinary and optimized Python. The same receiver fails four methods on baseline main `a77175501199ace765cb7ca57742b267351d3e79` (constraints blob `cab2cecbe4c3a6112022d194a927b9025ec67ab6`).

These are actual calls to the unchanged public `evaluate`, `filter_entities` and `agent.run_agent` entry points. The planner uses the real `ScriptedModel`, `QlooClient` and `FixtureTransport` with a separate fictional fixture file. No checker, planner or model shell replaces the project implementation. No provider, network, dependency, installed service or production changes were performed.

## Controls and observed behavior

The six control groups and all assertion calls were authored and frozen before reading the candidate implementation or its tests. The original scope freeze is `scope-freeze.json`; the exact receiver freeze is `receiver-freeze-v1.json`. A later, explicitly recorded fixture correction is described below.

| Independent group | Baseline | Candidate | Meaning |
| --- | --- | --- | --- |
| Multiword local denials | Fail | Pass | Dictionary/case-normalized “GNOCCHI DISHES ARE NOT OFFERED” and “without any refried beans” cannot override a separate firm cue |
| Repeated and independent affirmative occurrences | Pass | Pass | “no soup; soup available” and “no soup; polenta” preserve usable affirmative evidence |
| Non-denial phrases | Pass | Pass | “known soup selections”, “not only soup” and “soup without croutons” retain their existing positive interpretation |
| Unknown admission and outing policy | Fail | Pass | “gnocchi: unavailable” is unknown and permitted; a true firm-only venue is excluded; outings skip dietary checks |
| Coordinated explicit denial | Fail | Pass | “no soup or gnocchi” cannot supply a positive cue that overrides “pressed bread” |
| Native scripted fixture plan | Fail | Pass | The real agent excludes both denied/firm venues and retains the intended positive and unknown picks with truthful explanations |

Each row represents one unittest method; subcase failures are retained separately. For the corrected receiver, both modes report **baseline 2/6 methods versus candidate 6/6**, with no errors, skips or network attempts. The two candidate runs each exit zero.

The synthetic native fixture deliberately gives the two denied/firm venues the highest taste affinities. Baseline includes them in the four-meal plan. Candidate rejects `PEER-COORD` and `PEER-MULTI`, selects `PEER-SAME`, `PEER-MIXED`, `PEER-UNKNOWN` and `PEER-PLAIN`, and still selects `PEER-OUTING`. The unknown meal keeps “Soft foods: unknown”; affirmative meals keep “Soft foods: pass”. The outing has no dietary check label. Native `constraint_check` calls and fixture `/v2/insights` requests are present in the actual trace.

Fixtures and personas remain unchanged after invocation. The persona label does not appear in transport request records. All entities, locations, tastes and affinities used here are fictional. The transport key is a literal fixture sentinel, not a provider credential.

## Retained oracle correction

The first receiver incorrectly used **“refried beans: unavailable”** as a witness with no firm evidence. The unchanged hard-texture lexicon includes `fried`, and the established matcher uses substrings, so `refried` already carries a firm cue. Removing positive soft evidence therefore produces a fail under the preserved algorithm. That result was not a defect introduced by this repair.

The exact original receiver, scope and normal/optimized baseline/candidate outcomes remain in this packet. V1 reports baseline 2/6 and candidate 4/6 methods; its candidate failures concern this mistaken unknown witness and the resulting plan membership/count. They are **receiving-oracle failures**, not unresolved product regressions.

Receiver v2 changes only that witness to **“gnocchi: unavailable”**, plus the versioned scope filename and output plumbing. All **20 assertion-call ASTs** remain identical, as recorded in `receiver-freeze-v2.json`. Both sources were replayed with the corrected receiver; no product file changed. V2 was frozen after the candidate had been read, which its top-level `frozen_before_candidate_read: false` records. Its inherited `basis` object refers to the original pre-implementation control selection, not to the timing of the later witness correction.

V2 receiver SHA256: `767b023cc5c1d32a97f2e30a226bbfa64ff812ba46767738f6b76800ed45c1f1`.

## Exact source and preserved scopes

The author freeze `owner-review-freeze-v2.json` pins a **16-file baseline capture** and a **17-file candidate capture**. Candidate changes only `constraints.py` and adds `tests/test_soft_food_evidence.py`. This receiving claim names that captured source closure; it is not a claim to have tested every file in a complete repository checkout.

All captured bytes and Git blob identities were verified when materialized on the Mac, before/after every run, and at final readback. The author's original local 16/17 files also remain exact. The baseline and candidate constraints bytes are included as small source snapshots; full source/dependency trees are excluded.

Static comparison independently establishes byte-identical bodies for:

- `_positive_low_sodium_hits`, `check_low_sodium` and `check_wheelchair`.
- `evaluate` and `filter_entities`.
- All six vocabulary/policy assignments: `HARD_TEXTURE`, `SOFT_TEXTURE`, `HIGH_SODIUM`, `LOW_SODIUM`, `SUPPORTED` and `STRICT`.

The exact source diff and per-scope hashes are preserved. This review does not propose broader prose parsing, vocabulary changes, a different unknown-admission policy or medical classification guarantees. The inherited substring behavior, including the `refried`/`fried` overlap, remains visible rather than being silently reinterpreted.

## Execution and reproduction

Native runtime: the already qualified Mac Python **3.12.8**, with no dependency installation. Only standard-library modules and the actual project modules are required by this independent receiver. The exact source imports and executable path are in every receipt. Ordinary and `-O` executions run the same unittest assertions.

Original native review root:

`/tmp/tastetable-soft-peer-cf5799f6d38b-zw1slszb`

The source snapshots are its `baseline/` and `candidate/` directories. To reproduce elsewhere, materialize the 16 or 17 file entries from `owner-review-freeze-v2.json` into an empty source directory, checking each byte count/SHA256/Git blob. Baseline files are pinned to main a771755; the candidate overlays the two authored files recorded by the enclosing source publication. Use the source directory without an unrelated working tree or dependency directory inside it: the receiver hashes every supplied source file.

Run the published receiver bytes directly with Python; the archival suffix does not affect execution:

```text
python3 -B independent_soft_food_v2.py.txt ABSOLUTE_SOURCE_DIR NEW_OUTPUT_DIR
python3 -B -O independent_soft_food_v2.py.txt ABSOLUTE_SOURCE_DIR ANOTHER_NEW_OUTPUT_DIR
```

Keep the adjacent `scope-v2.json` in place. Each output directory must be new. The receiver supplies the fictional fixture transport and explicit scripted model; it also records and refuses network audit events. The native setup driver clears Qloo/live-model environment controls before invocation. Exact argv, timing, exit codes, source pins, complete native results and raw stderr/stdout are retained for all eight historical executions.

The four Python receiving/setup files are archived unchanged as `.py.txt`, with explicit native-to-publication mappings in the external review manifest. They are historical execution artifacts, not new application modules or test-suite policy changes.

## Packet boundaries

The external `review-manifest.json` lists the exact declared publication files with source paths, byte counts, SHA256, Git blob identities and modes; it is not itself one of those files. Baseline/candidate source trees, environment directories and duplicate dependency captures are not included. All original failed outcomes, both receiver versions and the corrected before/after results are retained. No additional source, CLI, frontend or browser reruns are claimed from another owner's work.
