# Caregiver constraint binding — 2026-10-08

## Source and scope

Contribution owner: `estate-8304a40f6f50/production`, coordinated by its HAMON
execution lead. The source is [main at d1c7a4e39cfdc0bb5b9fe026bc9660b75b456e81](https://github.com/Jacob-Met/tastetable/tree/d1c7a4e39cfdc0bb5b9fe026bc9660b75b456e81).
All 17 source blobs were materialized and checked against their Git blob IDs.
That complete tree has no AGENTS.md.

The implementation changes only `agent.py`'s constraint-check tool description,
the shared candidate verdict calculation, `Toolbox.constraint_check`, and final
plan assembly. `tests/test_constraint_binding.py` adds 20 regression methods.
The existing constraint heuristics and provider client are unchanged.

Current [PR #2](https://github.com/Jacob-Met/tastetable/pull/2) owns model selection
and [PR #3](https://github.com/Jacob-Met/tastetable/pull/3) owns recommendation-error
continuation; their changes occupy separate source spans. The calendar, edited
week and request-lifecycle contributions recorded in
[issue #4](https://github.com/Jacob-Met/tastetable/issues/4) retain their browser
and README scopes. This contribution does not change those files.

## Observed problem

The original native tool trusts the model's `constraints` and `kind` arguments.
For the synthetic `FIX-P-04` Malecon Sandwich Shop, checking Rosa's requested
soft-food, low-sodium and wheelchair needs rejects the venue. A later check with
`constraints=[]` overwrites that failure with `ok=true` and no checks, after
which the final plan emits it as a Monday restaurant. Labeling a meal check as
an outing also skips the dietary checks.

The model can choose which fetched candidates to submit for checking. It cannot
change the caregiver's requirements or the purpose already retained with a
candidate. Checks now derive both values from the agent state; the existing tool
argument shape remains compatible. Malformed argument shapes fail before any
candidate verdict is written, and an unknown entity ID remains a failed lookup.

Final assembly re-evaluates only previously checked candidates against the
current candidate evidence, purpose and caregiver requirements. It uses those
fresh results for acceptance, explanations and rejection details while leaving
the recorded tool verdicts intact. An unchecked or invented candidate cannot
enter the plan.

## Verification

Python 3.12.14 was used. The repository's existing requirements were installed
into an isolated test dependency directory. Relevant installed versions:
FastAPI 0.142.4, Starlette 1.7.0, httpx 0.28.1, pytest 9.1.1 and Pydantic 2.13.5.
Test runs clear provider configuration and forbid real `urllib` network calls.
All venue data and model responses used here are synthetic.

| Source | Check | Result |
| --- | --- | --- |
| Original main | Existing `tests/test_tastetable.py`, including native FastAPI routes | 19 passed |
| Original main | New 20-method constraint suite, normal and optimized Python | 15 methods affected; 20 failure records including subtests, plus 1 error, in each mode |
| Candidate | Full existing and new pytest suite | 39 passed, 15 subtests passed, no skips |
| Candidate | New constraint suite, normal and optimized Python | 20 passed in each mode |
| Candidate composed with exact PR #3 head `7002a16a3b46c7318826ce9975fd812096925f42` | Full pytest suite, including retained PR #2/#3 tests | 50 passed, 21 subtests passed, no skips |
| Same composite | Constraint and recommendation-error controls in optimized Python | 20 and 5 passed |

The inherited and candidate web checks both emit the same Starlette deprecation
warning for its current httpx TestClient adapter. No dependency change is part
of this contribution.

The composite's 19 original blobs were independently checked against PR #3's
tree before the separate constraint patch passed `git apply --check` and was
applied. Both pre-existing agent fixes remain present in that qualified copy.

The controls cover omitted needs, false outing checks for a meal, repeated weaker
checks, missing and unknown IDs, malformed arguments without partial verdict
writes, valid restaurant and reused outing paths, and assembly after the source
evidence, purpose or caregiver requirements change. Complete healthy output
hashes, including explanations and tool traces, remain identical for all three
sample personas:

| Persona | SHA-256 of canonical complete result |
| --- | --- |
| Rosa | `f4cd0ab98b8c8c1c83a11109b275f72680c7f49e390bf7b5ad1a818cd33207be` |
| Harold | `6bef0d4ef7b35136590b291fb8e46705b45d61d318c4854a442546db9b2e7320` |
| Mei | `8bd9fd4d8df0677b391fbc27e2b10353c11ba0a5825f5311a518dff60ff7988c` |

The focused standard-library controls can be run with:

```sh
python -m unittest discover -s tests -p test_constraint_binding.py -v
python -O -m unittest discover -s tests -p test_constraint_binding.py -v
```

This qualification establishes software enforcement of the existing heuristics.
It does not validate live venue data, strengthen those heuristics, or establish
that a deployed service is running this source.

## Follow-on: recover after an invalid recommendation purpose

An actual `POST /api/plan` control found a separate recovery defect in the
verified constraint-binding source above. A model first calls `qloo_recs` with
`purpose=null`, then repairs that call to `purpose="restaurant"` and checks a
valid venue. The first call previously retained the invalid purpose, so the
later check reported `1/1 passed` but the final plan contained no meal. The
first retained candidate record prevented the valid retry from recovering.

`qloo_recs` now validates that its purpose is a string in the already declared
`restaurant | outing` enum before making a provider call or retaining candidates.
The malformed call returns a normal tool error. The repaired call can then
retain the valid restaurant and produce the checked meal. The actual API
reproduction now returns `FIX-P-01` with all three requested checks, and keeps
the earlier refusal in its trace.

`tests/test_recommendation_purpose.py` adds two methods: the real API/model-repair
regression and seven malformed-purpose controls proving no provider request or
candidate mutation. Both methods fail on the prior source (eight failure records
including subtests), and both pass on the successor in normal and optimized
Python. The full successor suite passes **41 methods and 22 subtests**. The same
successor composed with exact PR #3 head passes **52 methods and 28 subtests**.
No skips or new dependency warnings occur.

An independent five-case API/native-loop review confirms that valid mixed
restaurant/outing refetches keep their first retained purpose and final placement.
They do not turn an outing verdict into an accepted meal. Initially labeling a
restaurant-tagged venue as an outing remains a separate venue-classification
limitation of the existing policy; this guard does not introduce a classifier
or change the dietary exemption for outings.
