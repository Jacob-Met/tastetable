# Explain incomplete recommendation lookups accurately

TasteTable previously used the same constraint-rejection explanation when every recommendation request failed, when successful requests returned no candidates, and when model arguments never reached a lookup. An outing-only failure could keep four checked meals without explaining the missing outing. This change makes `plan.notes` describe the evidence actually available while keeping the checked plan and its existing diagnostic trace.

The defect was independently observed in [TasteTable #4 comment 6056065906](https://github.com/Jacob-Met/tastetable/issues/4#issuecomment-6056065906). The bounded backend scope was coordinated in [comment 6056817650](https://github.com/Jacob-Met/tastetable/issues/4#issuecomment-6056817650). Implementation and authored tests are by `estate_work / 9e05c01af69c`; the separate native receiving review and its counterexamples are by `memory_path / 9e05c01af69c`. Root controls integration and publication.

## Resulting behavior

| Observed native outcome | Plan explanation |
| --- | --- |
| A preparable restaurant lookup does not complete | `A restaurant recommendation lookup could not be completed; any checked suggestions are retained.` |
| A preparable outing lookup does not complete | `An outing recommendation lookup could not be completed; any checked suggestions are retained.` |
| Completed lookups return no candidates and the purpose still has no retained candidates | `A completed restaurant recommendation lookup returned no candidates.` The outing equivalent names the outing lookup. |
| Some retained candidates have actual failed checks and slots remain missing | `Some restaurant candidates did not pass the requested checks.` The outing equivalent names outing candidates. |
| Fewer than four checked meal suggestions | `The plan contains N checked restaurant suggestions; unfilled meal days are left open.` The singular form is used for one suggestion. |
| No checked outing | `No checked outing suggestion is available in this plan.` |
| Healthy native persona plan | The existing empty notes list remains empty. |

In the captured outing-failure case, all four meals remain identical and the missing outing becomes visible in the notes. In the captured all-failure case, the plan has zero picks and factual lookup-completion notes; it no longer asserts that rejected or unsafe options caused the empty plan. A genuinely empty successful response and a genuinely checked rejection produce different explanations. Unsupported filter types and malformed ID lists make zero native requests and receive only neutral missing-slot notes.

These are statements about completion at the existing `QlooClient.insights` boundary. They do not assert that transport ran, diagnose provider or network availability, or infer a reason from an exception class. A parsed response can raise `ValueError` or `TypeError` after a real request; the same classes can also describe argument preparation failures. Preparable lookups that fail therefore use the neutral completion wording. Raw exception text stays in the existing diagnostic path and is never copied into plan notes.

## Bounded implementation

Only `agent.py` changes at runtime. A private state mapping records the latest outcome for each recommendation purpose and normalized query: a completed candidate count or an incomplete outcome. There is one original client call per invocation, with the original arguments and original exception re-raised unchanged. Assembly derives deterministic notes from these outcomes, the freshly recomputed native verdicts, and the actual retained pick counts.

A later completed repeat of the same normalized query resolves that query's incomplete outcome. Omitted and empty optional filters normalize equivalently. Success for a different query does not erase an earlier incomplete query, so even a filled plan can retain a factual note about that earlier lookup. This is not a retry mechanism or a claim that a service remains unavailable.

Bookkeeping observes only exact built-in JSON carriers: string type and location values, an integer `take`, and optional plain lists of plain string IDs. It opts out before iterating or converting generators, custom containers, subclasses, or other direct-call values. Those values still reach the existing client exactly as before and receive no inferred lookup classification. The existing purpose guard is preserved.

No requirement, purpose, threshold, ranking, source explanation, provider configuration, retry, model budget, or trace behavior is changed. Frontend, calendar writer, request lifecycle, and week organizer files are outside the production patch.

## Exact receiving source

| Item | Pin |
| --- | --- |
| Tested receiving commit | `b8d384e5522e17cf15d73e8b06adbe6665e4bdcc` |
| Tested receiving tree | `06409d6f67d0c99ee99305fe4f745963ec2da2a2` |
| Receiving `agent.py` Git blob | `1d8bfd5a300c1d4824dc895b324e7d0cfb096058` |
| Receiving `agent.py` SHA-256 | `5366635d101cb7010e6ad3586de9a8d76f222b98118cbc5c4bf73ea11b58a903` |
| Composed `agent.py` Git blob | `883aff984464f2d43cda18f8e60b81240d6c3fb3` |
| Composed `agent.py` SHA-256 | `fae9eced334ec58c23af301166f6c62dd2b6ff1991bebc6e8e4d9139d3f5b4b3` |
| New authored notes test SHA-256 | `14d33c42bec3694215b9fdb3118cd1e200a8192f462b4c72ae2d8f1487a4b48b` |
| Unchanged independent verifier SHA-256 | `445069383261f8e25ef79d8a52b4ad3aa23c9fb8a95ed2745d9697fc0b641096` |

The original qualified notes source `4d2b2438...` was prepared on main `9f9105c...`. Before publication, [PR #11](https://github.com/Jacob-Met/tastetable/pull/11) added argument-decoding and diagnostic-trace recovery. The exact notes patch applied cleanly to that new receiving source. Comparing the two before/after source pairs proves the PR #11 delta is unchanged apart from diff locations. Independent inspection also confirms that `run_agent`, `_trace_args`, and `_trace_text` are byte-identical to current receiving main. The original qualified source and its receipt remain separately frozen.

[source-manifest.json](source-manifest.json) records thirteen exact native backend/test files and four exact current static files used only to support native application mounting and route tests. Twelve native files and all four static support files remain unchanged; only `agent.py` and the added `tests/test_recommendation_notes.py` form the source patch. Publication must preserve all other files from its actual parent, including later additive receiving tests.

## Qualification

These are overlapping gates; their counts should not be added together.

| Gate | Outcome |
| --- | --- |
| Complete current Python suite on the composed candidate | **77 tests and 70 subtests passed** |
| Thirteen authored notes methods on the composed candidate | **13/13 passed**, normal and optimized Python |
| Focused retained native subset before the installed API runtime was located | **41/41 passed** |
| Independent unchanged notes verifier against freshly captured receiving main | **16/16 methods passed across 18 scenarios**, normal and optimized Python |
| Complete inherited PR #11 argument/diagnostic suite, independent review | **12/12 passed**, normal and optimized Python, including all three native API methods |
| Fresh receiving-main negative control for the independent verifier | **6 passed / 10 failed methods**, with 11 failed assertion/subtest records, normal and optimized Python |

Across all eighteen independent scenarios, every complete non-note result equals its freshly captured receiving-main counterpart: checked selections, affinities, ordering, rejected verdicts, source metadata, traces, actual native request parameters, and model call counts. Normal and optimized observations agree. The matrix includes healthy plans, lookup exceptions, response-parsing exceptions, empty responses, genuine rejection, partial availability, invalid pre-request arguments, same-query recovery, different-query success, call-budget exhaustion, model-prose independence, and both single-use ID inputs.

The full suite used the existing Python 3.12.14 dependency environment with FastAPI 0.142.4, httpx 0.28.1, and Starlette 1.7.0. Dependencies were reused read-only, bytecode and pytest cache writes were disabled, temporary files stayed in an owned directory, and an explicit guard rejected external `urllib` requests. The fixture transport and synthetic model inputs exercised the real native code. The full suite served the actual current index and exercised the actual plan endpoints. No live provider, live model, or browser execution is claimed for this notes candidate.

## Preserved negative evidence

The evidence archive retains both entire independent review histories, all original author logs, the original qualified source, the first-cut source, and the current receiving snapshots and logs.

- On the original baseline, the thirteen authored methods produced nineteen failed assertion/subtest records, showing the original explanation defect.
- The first-cut `2101ecf2...` bookkeeping helper consumed direct single-use ID iterables before native dispatch. The independent tag control changed a Cuban query from two candidates to eighteen and changed one checked meal to four. The signal control lost the original signal and changed affinities. That exact held source fails two independent methods with four failure records; it is not the accepted source. The repair opts out before consuming non-JSON carriers.
- An early independent lexical assertion required the word `constraint`; the accurate `requested checks` wording was accepted by correcting that assertion. The old oracle and its logs remain in the archive, separate from the real iterable defect.
- During current-source receiving, a full temporary filesystem interrupted an observation write before test execution; the empty interrupted files and receipt are preserved without a success claim.
- The independent backend-only snapshot initially lacked the `static/` directory required at import. Its first PR #11 run had nine passes and three import errors. An empty owned mount directory satisfied the API-only review prerequisite; the successful twelve-method gates are separate. The author full-suite snapshot instead contains all four exact current static files and serves the actual index.

[original-verification.json](original-verification.json) is the unchanged original independent receipt (`cb102ffdb5638ef08ada59e773533ee5674c139a0a85c2c2c11949e81eb60c49`). [receiving-verification.json](receiving-verification.json) is the unchanged current receipt (`b863fc5188087e6011d13c12ee80665e6d7365282d6eb90457c85f38a92cd9d7`). [evidence-manifest.json](evidence-manifest.json) pins every regular file in [evidence.tar.gz](evidence.tar.gz), including empty interrupted artifacts. The separately readable [receive_notes.py](receive_notes.py) is byte-identical to the accepted independent verifier.

## Replay

From a checkout containing the two source changes and its normal installed test dependencies, the production test commands are:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -B tests/test_recommendation_notes.py
PYTHONDONTWRITEBYTECODE=1 python3 -B -O tests/test_recommendation_notes.py
PYTHONDONTWRITEBYTECODE=1 python3 -B -m pytest -p no:cacheprovider tests -q
```

To replay the source-pinned independent receiving gate, extract the archive into a fresh directory, then enter `tastetable-notes-b8d384-review-9e05c01af69c-memory`. Use a new observations filename so existing receipts stay intact:

```bash
mkdir -p tmp
PYTHONDONTWRITEBYTECODE=1 TMPDIR="$PWD/tmp" \
TASTETABLE_NOTES_SOURCE="$PWD/candidate-fae9ec" \
TASTETABLE_NOTES_BASELINE_RESULTS="$PWD/baseline-results.json" \
TASTETABLE_NOTES_OBSERVATIONS="$PWD/replay-observations.json" \
python3 -B test_notes_receiving.py
```

Add `-O` for the optimized gate. Select `baseline` instead of `candidate-fae9ec` for the preserved receiving negative control, writing to a different observations file. The archived independent review documents the original and held-source replays and the inherited PR #11 API gate.

The qualification is complete for the recorded source. Root retains the final publication and current-parent preservation check.
