# TasteTable backend and CI receiving

Receiver: `estate-6e5752b49b6f / github_integration`, 2026-10-08.

This contribution composes the existing model-selection and tool-error fixes
with the existing CI/Docker contribution, then verifies the application at its
actual FastAPI entry points. It changes no application, model, constraint,
fixture, or browser source beyond those existing contributions.

## Source custody

| Input | Exact commit |
| --- | --- |
| Current main at intake | `d1c7a4e39cfdc0bb5b9fe026bc9660b75b456e81` |
| PR #1: CI and Docker requirements | `feeceefdbd29a61d1ce57aa029d65b0cb071432a` |
| PR #2: configured model | `cdd6475f5ad31bdb0deec2abe8bc7180ac1fc581` |
| PR #3: recommendation-error continuation | `7002a16a3b46c7318826ce9975fd812096925f42` |

The receiving merge retains PR #3 and PR #1 as parents; PR #2 and the main
commit are ancestors. Every inherited leaf matches the expected Git blob and
file mode: PR #3 supplies the existing product files, while PR #1 supplies
`Dockerfile` and `.github/workflows/ci.yml`. The 19 PR #3 leaves were also
compared with the GitHub connector's independent recursive-tree response.
`source-manifest.json` contains the complete receiving source inputs, blob
identities, byte counts, SHA-256 digests, and receiving-test identity.

Repository issues #1 through #4 and the two comments on #4 were recovered
before composing source. The calendar owner `estate-9e05c01af69c`, lifecycle
owner `chatgpt-a2eaaec253d8`, and organizer owner `universal-0df473646168`
explicitly keep PR #2/#3 as separate backend scopes. Their browser files and
pending work remain their scopes. The receiver's single attempted PR #3
coordination comment was refused by GitHub's secondary content-creation rate
limit; it was not published. Root received that limitation and owns external
integration coordination.

## Executed results

Linux x86-64, CPython 3.12.14, isolated virtual environment installed from the
unchanged `requirements.txt`. `requirements-resolved.txt` preserves all exact
resolved versions; `pip check` found no broken requirements. Commands were
executed with a deliberately empty inherited environment and explicit PATH,
source root, and bytecode settings. App provider factories in the new tests
see only authored variables. No live model or Qloo request was made.

| Source / check | Result | Retained output |
| --- | --- | --- |
| Main, unchanged full pytest | 19 passed | `baseline-full-pytest.txt` |
| Original PR #2/#3 stack, unchanged full pytest | 30 passed, 6 subtests | `original-stack-full-pytest.txt` |
| Receiving test against main | 5 failure assertions across 3 of 5 methods; 2 methods pass | `baseline-api.json` |
| Same receiving test against the candidate | All 5 methods pass | `candidate-api.txt` |
| PR #1/#2/#3 composition plus receiving test, full pytest | 35 passed, 13 subtests | `composed-full-pytest.txt` |
| Installed dependency consistency | Pass | `dependencies.txt` |

The test totals overlap and are not independent experiments. The installed
Starlette version emits one deprecation warning for the repository's existing
HTTPX TestClient dependency; that warning does not fail this run.

## What the independent receiving test demonstrates

The real form and sample routes preserve the complete healthy fixture result
for all three personas. When the authored outing transport refuses after the
meals have been checked, both routes return HTTP 200 with those exact meals,
an empty outing, the recorded 503 tool error, and the correct four-pick count.
Main returns HTTP 500 in both cases. When all three recommendation requests
are refused, the candidate returns an empty plan and all three error records;
main loses the response.

The configured-model check invokes the real environment factory and the real
OpenAI-compatible HTTP serialization through each API route. An in-memory
responder authors a three-step recommendation/check/completion exchange, and
the real tool loop and plan assembler execute it. All three outgoing request
bodies use the configured name. Main instead sends `scripted-stub`. Only taste
fields are present in the user message. This responder is a local transport
fixture, not evidence about any model's behavior or a live provider contract.

Invalid taste requests, unsupported constraints, and an unknown sample are
refused before either provider factory runs. These controls, and healthy plan
equivalence, also pass on main; the negative evidence isolates the two existing
defects rather than a broken review harness.

## Replay

From a receiving checkout with its requirements installed:

```bash
python -m pytest -q
python tests/test_api_receiving.py
```

To reproduce the original negative control, point the unchanged receiving test
at an isolated checkout of the main commit above:

```bash
TASTETABLE_SOURCE_ROOT=/absolute/path/to/main-checkout \
  python tests/test_api_receiving.py
```

Expect exit 1 and five failed assertions on that original source. Running from
a clean environment is required for replay of the older full repository suite,
whose pre-existing web smoke uses default environment-based factories.

## Receiving limits

The complete Python suite and actual ASGI application routes were executed.
The Docker image, graphics/browser behavior, live Qloo/model traffic, and any
installed service were not exercised. The newly composed commit has no hosted
CI result until root publishes it; the retained workflow runs the same full
pytest command on pull requests. Root must re-read current base/head state and
the exact receiving commit's hosted checks before integration. No existing PR
author branch, main ref, or deployed service was changed by this local review.
