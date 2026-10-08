# Native receiving of TasteTable's original backend stack

External contributor: `estate-45d4289ccf6c/github_receiving`.

This packet qualifies the unchanged original configured-model and
recommendation-error contributions for source integration. It introduces no
production-code change. Source integration, installed runtime, real provider
operation and user outcomes remain separate states.

| Source | Exact commit | Native pytest | Identical real-HTTP matrix |
| --- | --- | --- | --- |
| Main | `d1c7a4e39cfdc0bb5b9fe026bc9660b75b456e81` | 19 passed | 7 passed / 19 failed |
| PR #2 | `cdd6475f5ad31bdb0deec2abe8bc7180ac1fc581` | 25 passed | 14 passed / 12 failed |
| PR #3 | `7002a16a3b46c7318826ce9975fd812096925f42` | 30 passed | 26 passed / 0 failed |

The candidate also passes 30 tests under Python optimization, with the native
pytest warning retained. The increasing suite counts include the original
authors' additional tests; the identical 26-case HTTP matrix provides the
comparative behavior. Starlette's httpx TestClient deprecation warning is also
retained. No warning was suppressed or dependency changed for this review.

## Meaningful receiving boundary

`receive_http.py` starts the real FastAPI application through Uvicorn and a
second loopback HTTP server using the OpenAI-compatible model protocol. That
peer refuses any model name except the configured fixture identifier and runs
the source's existing scripted policy. Qloo uses the repository's synthetic
fixtures with independently authored primary, fallback, outing and complete
outages. Every provider environment variable used by this app is removed;
urllib requests are restricted to the one owned loopback model endpoint.

The 26 cases cover three healthy personas and outage/recovery sequences through
both the sample and submitted-form APIs, in default scripted and HTTP-model
modes. The candidate completes all ten model steps with the configured name,
preserves checked meals exactly when outings fail, preserves primary picks
when fallback fails, retains error traces and honest empty slots, stays within
the existing three-insights budget, and restores the exact healthy response
after failures. Both servers stop after each run.

Main produces six scripted outage HTTP 500s and thirteen wrong-model HTTP
failures. PR #2 repairs model identity and leaves twelve outage HTTP 500s across
the two modes. PR #3 resolves those remaining failures. The HTTP picker checks
trace membership; the inherited native suite re-evaluates healthy meal
constraints and the reviewer separately inspected unchanged deterministic
assembly. The fixture policy is not independent inference behavior. This does
not qualify live Qloo, real models, deployment, caregiver outcomes or medical
and scientific validity.

## Independent review and custody

`independent-audit.json` records a second worker's independent replay of all
three suites, all 26 candidate HTTP cases with exact per-case signatures, 15
healthy/recovery parity comparisons, and all 54 original file blobs and modes.
The reviewer found no material defect in original PR #2 followed by #3.

`all-source-verification.json` binds every source leaf. Candidate `agent.py`:
Git blob `fcf867e844835a08496a0fdf8132c69990ccfffc`, SHA-256
`3d12eb0f275516cd8d1b4044d010a8ed914629f427b1cc1490958f865fe31da8`.

`source-receiving-evidence.tar.gz` retains all original logs, full synthetic
response records, exact tree metadata, the original receipt and the independent
review/checker without placing repetitive raw logs in the source tree.
`archive-manifest.json` hashes all 23 archive members and the archive itself:
`96d5fd9dfde73fc2e3e2f2d6cea7b1b0fcbc97669f8bc514ede34f04f11034b1`.
The original first predecessor-copy helper added a final newline; the initial
two suite logs are explicitly excluded. Git identity checks found it, exact
bytes were restored, and both predecessor suites were rerun. The candidate was
exact throughout. This negative preparation evidence is retained in the archive.

## Replay

Prepare isolated source checkouts at the three commits above. Use Python 3.12
and the original requirements; `dependencies.txt` records this run's resolved
versions. No provider account or real data is needed.

```bash
python3.12 -m venv receiving-venv
receiving-venv/bin/python -m pip install -r candidate/requirements.txt
receiving-venv/bin/python -B run_source_tests.py candidate
receiving-venv/bin/python -O -B run_source_tests.py candidate
receiving-venv/bin/python -B receive_http.py candidate --out http-candidate.json
receiving-venv/bin/python -B receive_http.py main-source --out http-main.json
receiving-venv/bin/python -B receive_http.py pr2-source --out http-pr2.json
```

The two predecessor HTTP commands intentionally exit 1; the candidate exits 0.
The source suite runner disables bytecode/cache writes and forbids ordinary
urllib networking. The independent audit archive records exact acceptance
limits rather than treating passing fixture tests as deployed benefit.

Calendar/export, request-lifecycle and edited-week composition owners at
TasteTable #4 retain their source and receiving scopes. This contributor owns
only backend receiving/source integration and this evidence. No browser,
constraint, fixture, provider-configuration or deployment change is included.
