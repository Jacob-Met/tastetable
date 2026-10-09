# Scripted category admission: offline qualification

Date: 2026-10-09 UTC. Base: `145d27981b3c5fe6afa72e205b42582fd72c7734`.

## Result and change

The scripted planner now waits for category tags before requesting places for a meal or cultural outing. When the original cuisine lookup supplies no tag, it proceeds through the existing fallback-cuisine stages. When no cultural venue tag resolves, the outing remains unavailable and the existing plan notes explain the empty slot.

The production change is confined to `ScriptedModel._create` phases 2 and 8 in `agent.py`. Both branches use the existing local skipped-search result, which later stages already handle. Client request semantics, generic fixture results, first-purpose retention, caregiver constraint binding, plan assembly, and the model-continuation boundary are unchanged. Eight regression methods are added in `tests/test_scripted_category_admission.py`.

## Observed defect and public CLI comparison

The original public fixture CLI accepted this profile and exited successfully:

```json
{"cuisines":[],"music":["Celia Cruz"],"films":[],"constraints":[],"city":"Pasadena"}
```

It placed fictional museum `FIX-V-03` in Monday's restaurant slot at affinity 0.96. The museum's retained restaurant role then prevented its selection as the outing; the plan instead used cinema `FIX-V-02` at affinity 0.238. This was a semantic failure despite exit code zero. The original output did contain an outing.

| Actual profile | Original meal-category defect | Corrected result |
| --- | --- | --- |
| Music only: Celia Cruz | Museum `FIX-V-03` served as a restaurant | Four labelled fallback restaurants; museum `FIX-V-03` as outing |
| Film only: Casablanca | Cinema `FIX-V-02` served as a restaurant | Four labelled fallback restaurants; cinema `FIX-V-02` as outing |
| Unmatched Cuisine plus Celia Cruz | Museum `FIX-V-03` served as a restaurant | Four labelled fallback restaurants; museum `FIX-V-03` as outing |
| Rosa, Harold, Mei fixture profiles | No category defect in these baselines | Entire CLI stdout byte-identical for all three |

Each of these six profiles was executed once against the original source and once against the candidate through the existing public `--profile -` path. All twelve processes exited zero with empty stderr; the captured source closure remained unchanged. Literal `--persona` option parsing was not exercised by this comparison.

## Independent behavior receiving

A separate reviewer froze twelve behavior cases before candidate exposure. It received the six public CLI pairs above and executed six additional original/candidate pairs: unresolved artist, partial cuisine discovery, no cultural venue tags, one remaining cultural category, no cuisine/fallback tags, and no category tags.

All twelve candidate behaviors were accepted. The six additional candidate cases passed 99 of 99 recorded checks. Their original runs retained 16 failing checks out of 110; the denominator differs because checks include the actual requests and selected items, and corrected empty cases produce fewer of those items. The frozen receiver and assertions were unchanged.

Partial cuisine and partial cultural discovery retained byte-identical outputs. Missing cuisine and fallback tags left meal days open; missing cultural tags left the outing unavailable; absent category tags produced no unrestricted insights requests. The four derived lookup variants changed only in-memory/private fixture tag-lookup rows, preserving every place and affinity. They exercised the Python API with explicit fixture/model injection, not the HTTP application.

## Maintained regression gate

One native unittest invocation ran the following exact modules:

| Module | Methods | Result |
| --- | ---: | --- |
| Existing `test_constraint_binding.py` | 20 | Passed |
| Existing `test_recommendation_notes.py` | 13 | Passed |
| New `test_scripted_category_admission.py` | 8 | Passed |
| Total | 41 | Zero failures, errors, skips, expected failures or unexpected successes |

The existing 33 methods were received byte-for-byte from the base commit. They cover retained purpose, rechecking caregiver requirements and candidate evidence, lookup failure/empty/recovery distinctions, and healthy-persona behavior. The new methods also verify that a generic place query continues to return both restaurant and cultural results for callers that intentionally request them.

To run the new regression in a normal checkout:

```sh
python -m unittest discover -s tests -p test_scripted_category_admission.py -v
```

The recorded gate used the pinned native Python 3.14.3 interpreter with `-I -S -B`, explicit source/test paths, a minimal environment, fresh resource admission, and a 15-second process timeout. Source and test files matched their admitted bytes afterward. The verbose unittest stream is normal stderr output, not an empty-stderr claim for this gate.

## Provenance and scope

| Evidence | SHA-256 |
| --- | --- |
| Candidate `agent.py` | `261e51b3e1e08a93b47da0e530f900d0b00436765c5f2ed39663de619f1f28dc` |
| New regression file | `6ed6a9c55558bf6e7144099fa0fac986b708e6e3a7ba8be7cbfb54d78d7d7e35` |
| Public baseline observation | `c8fd5f0302b0a2e50b52e74118828fb314b68f407b43b74d3c6afa8876c80c2d` |
| Public candidate observation | `8fad8d7311e3b5b29c24a8096705fa4255f0384e27e892aebf34c4e151e21b18` |
| Independent twelve-case review | `58504267627b704e2018a19af359ec84ce09449b1548d3584856d1e28ef6df2d` |
| Actual 41-method receipt | `859d0a51dfb479b5bf9e7f4cc7e1eedd745643dddbb0aab3698796f44bd112f3` |

Raw original and candidate outputs, process receipts, frozen inputs, and independent reviews are retained in the native `tastetable-category-admission-926c3dc2605e` and `tastetable-category-independent-926c3dc2605e` custody packets. The original full source tree was reconstructed to `71f2c5b144e2a54787cb92b37d6e639bbfef6ba6`; execution used its complete six-file CLI closure, then the three named test modules, rather than a full checkout.

This is offline qualification on Python 3.14.3. Python 3.12, full pytest, HTTP/FastAPI, browser, live-provider and deployment gates remain unrun. The known interpreter lacked pytest and httpx; no dependencies or credentials were added. Fixture affinities and heuristic checks provide no live-venue or medical validation.

Native claim Conscience 5373 reserves only these two scripted phases, the new regression, and this documentation namespace. Existing issue 66 and issue 69 owners retain their separate source scopes. Source publication, canonical integration, and owner adoption are separately recorded; this qualification does not establish a merge or deployment.
