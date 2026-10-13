# City-input receiving on current fixture transport

The maintained city-input course passed on the later main composition, including the PR104 fixture tag-limit correction. This supplements [PR100](https://github.com/Jacob-Met/tastetable/pull/100); the original source owner and earlier receiving retain their attribution.

## Exact received source

- Composition commit: `32aaab5542bca5001215a7cb259f11db21093f9a`.
- Complete tree: `7e36e89f0177bdad3f0c5b8da5ab61608644f239`.
- Ordered parents: main `da02d3572099221b92372f8df573584c8e210b2d`, then PR100 `2a649909951fcb95db1c3d422b110825d0121936`.
- Only the three exact owner app/test/guide blobs differ from that main. The current Qloo blob `c3f3ccb658b4ab019ebafda4593a9206c54ae84c` is retained.
- [selected-source.json](selected-source.json) pins the nine files used by the actual API course. The source packet is a selected-file handoff; its caller-supplied origin metadata is not a repository-authentication claim.

## Actual outcome

Observed on MSI / jacob at 2026-10-13T07:26:55Z, with existing Python3.14.3, FastAPI0.134.0, Pydantic2.13.4, Starlette0.52.1 and HTTPX0.28.1. No dependencies were installed.

The real FastAPI TestClient course passes **3 methods**, with **27 successful subtest events**, no failures/errors/skips. Three of those events are enclosing persona contexts, so this is not a count of27 independent requests or30 test methods. Raw [stderr](api-city-course.stderr), [test-results.json](test-results.json), and [receiving.json](receiving.json) retain the evidence. The test body is the unchanged owner file `tests/test_api_city.py`.

The course compares complete clean/padded fictional plans and actual recommendation filters for all three personas. It checks missing/null/empty cities, literal interior whitespace/case/Unicode, strip-before-60-code-point slicing with no second trim, and invalid requests stopping before provider factories. It uses ScriptedModel and FixtureTransport; the test clears environment variables and makes urllib.request.urlopen fail if called. No live-provider or browser result, installed-app adoption or operating-system-wide network observation is claimed.

The existing maintained packet producer/receiver/verifier from estate-push-tools commit `9518bb8add1396332c83d945179f766850a1887e` ran before the course, and exact source verification ran afterward. All five commands exited0. All nine received source files retained their bytes and modification times. Source packet SHA256: `6657d514c7da4d409885adeca512301ed720c104c756659f5e9fbcb90e834b15` (128,708 bytes).

Root authored/executed this supplementary observer. The distinct runtime_consumer reviewed the full source composition, raw results and custody without duplicating the run. Outer RDC PID135260 and Python PID140608 completed once, exit0; raw unittest time0.188s, whole wrapper3.83s. PIDs are bound to this dated observation and may later be reused.

## Reuse

With the dependencies already installed and this exact composed source checked out, the maintained project test remains:

```sh
python -B -m unittest discover -s tests -p test_api_city.py -v
```

The retained small [observer](run-retained-tests.py) accepts a source directory and a **new** result JSON path. It records method and subtest events separately:

```sh
python -B docs/receiving/api-city-current-main-dcac8b3b8755/run-retained-tests.py . /path/to/new-results.json
```

Its result supplements the raw unittest stream; it does not replace source pinning. This directory preserves the actual original stdout/stderr bytes, including empty files and Windows line endings. Earlier missing-FastAPI and JUnit-wrapper interpretations remain in their original records; neither is overwritten or relabeled by this successful later-main result.
