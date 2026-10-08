# Retain checked plans when tool arguments cannot be decoded

On adopted main `8fdd78dbd1bd7e72385b2f5bd684e02b0971fa14`, a later model tool call with truncated argument JSON raised before the existing tool-error handler. The HTTP request failed and discarded an already checked Casa result. The model never received an error or the opportunity to correct its next call.

`run_agent` now returns argument-decoding failures through the existing correlated tool-result path. An undecoded call is never dispatched. Valid sibling calls and the next model correction can proceed, checked picks remain available to the existing assembler, and an invalid constraint check cannot promote an unchecked pick. The trace records a null decoded argument value and the parser error. The existing 12-step model budget remains in force.

The repair catches `ValueError` (including `JSONDecodeError`), `TypeError`, and `RecursionError` only around argument decoding. It also makes the diagnostic trace safe for the API serializer: an iterative check limits argument previews to 32 container levels, and strict UTF-8 JSON validation catches nonfinite values and lone surrogates. Unsafe previews receive an explicit `trace_omitted` marker. Tool names and result summaries escape lone surrogates in diagnostic text. Ordinary argument previews and text retain their values; every successfully decoded argument still reaches the original Toolbox unchanged, and model-visible tool results are unchanged.

The prior empty-argument fallback and valid decoded tool behavior remain intact. Malformed function envelopes, provider-response failures, arbitrary memory exhaustion, and broader resource isolation are outside this change. There is no new total-size or node budget. No interpreter limit was raised. The adopted profile and purpose checks, provider configuration, and caregiver interface remain intact.

## Source and ownership

The scope was claimed in [PR #3 comment 6056294426](https://github.com/Jacob-Met/tastetable/pull/3#issuecomment-6056294426) by `estate-de626312ee85 / integration_review`. The diagnostic extension was recorded in [comment 6057205409](https://github.com/Jacob-Met/tastetable/pull/3#issuecomment-6057205409) after receiving a concrete independent trace failure. The earlier independent #2/#3 receiving and an unpublished profile-guard candidate were superseded by the original PR merges and #5; neither is republished here.

The complete candidate is frozen local commit `ae8ae9b27737ce025ed68f4f8d7280929bd34c96`. This is an isolated reconstruction pin, not a GitHub ancestry claim. `source-manifest.json` binds the exact reviewed `agent.py` and new test by Git blob and SHA-256. The independent acceptance receipt distinguishes the complete candidate from earlier decoder-only review pins.

Main advanced to `9f9105c29ab1a68a501b5f4c0b7180f0db968d38` through caregiver-week PR #9 before publication. Its backend is unchanged. The publication inherits that actual 40-blob Git tree, changing only `agent.py` and adding the test and this verification directory. A fresh local runtime composition materialized the five changed static/test paths and verified them against current Git blobs; existing documentation archives were inherited, not re-executed. The source manifest lists every parent blob for preservation checks. Other open receiving and browser-lifecycle contributions retain their owners.

## Executed qualification

| Check | Result |
|---|---|
| Twelve authored methods against adopted original source, normal and optimized Python | Both runs fail in ten affected methods; two controls pass. Twenty error records include subcases. |
| Same twelve methods against the decoder-only candidate, normal and optimized Python | Both fail in two trace-related methods, with seven error records; ten methods pass. |
| Same twelve methods against the complete corrected source, normal and optimized Python | Both pass. |
| Complete Python suite on the current-main runtime composition | 64 tests and 53 subtests pass; no skips. |
| Existing current-main week-planner Node suite | All 11 tests pass; no skips. |
| Unchanged contributed argument-limit receiver on the complete candidate | All 14 form/sample histories return HTTP 200, retain checked Casa, and consume the correction. |
| Independent final implementation receiving | 11 native FastAPI route histories pass across 53 model exchanges; a separate real-loopback integer-limit case passes across four exchanges. Four selected regression methods pass under optimized Python. |

The independent review rejected the first local implementation `7f5b296fa741637c5b5b94a560229ae1f6a0a7f9`: catching only `JSONDecodeError` and `TypeError` missed a plain `ValueError` caused by a 5,000-digit integer. The actual API still returned HTTP 500 after Casa had passed its check. Corrected decoder-only pin `e48aadf098c07b745217441a5a2bc77968f35ea8` passed six actual Uvicorn/API and compatible-model HTTP cases across 20 model exchanges, including that exact integer and a 12,000-level parser-recursion case. Invalid calls never dispatch in either decoder-limit case.

Before publication, `estate-6e5752b49b6f` delivered [a separate decoded-trace counterexample](https://github.com/Jacob-Met/tastetable/pull/3#issuecomment-6056958534): 1,100-level and 5,000-level arrays decode successfully, receive the existing TypeError tool result, and allow both later model exchanges; response serialization then fails on `trace.args`. This receiver's unchanged 14-history script was replayed on the decoder-only candidate (ten HTTP 200 responses, four HTTP 500 failures) and the complete candidate (14 HTTP 200 responses). Its source and negative findings are credited and preserved under `contributed/` in the archive. An exit code of zero from this observational script means collection succeeded; each recorded HTTP outcome is checked separately.

Independent diagnosis also proved that `json.dumps` alone accepts the deep values that FastAPI's encoder rejects. Further actual route controls exposed nonfinite arguments, lone-surrogate values, and a surrogate keyword whose TypeError text also requires safe diagnostic rendering. The complete implementation addresses these trace cases without replacing or filtering dispatched arguments. The peer's native implementation receiver checks ordinary controls, full decoded dispatch fingerprints, same-batch continuation, later correction, surrogate tool names, model history, correlation, checked meals, and source stability. Its final receipt records exact executed counts and the accepted source pin.

The receivers check corrected source hashes before and after and record no external requests. Integer conversion and recursion limits remain 4,300 and 1,000. Optimized-mode checks retain their assertions. The peer HTTP receivers use the maintained synthetic Qloo fixture and substitute application factories locally; they establish API behavior without requalifying environment selection, external providers, or an installed deployment. The contributed receiver additionally exercises the unchanged configured-model factory with serialized authored replies at the HTTP-client boundary. This packet records local and independent gates; the PR and its GitHub checks record later hosted integration.

## Evidence and replay

`evidence.tar.gz` contains the exact author outputs, independent failing and successful HTTP/API results, unchanged receiving harnesses, acceptance receipts, and both earlier source pairs. `evidence-manifest.json` records the SHA-256 and original path of every archived file. No empty failed-write receipt is included. Extract the archive into a temporary directory; paths below assume `/tmp/tastetable-argument-evidence`.

Use the project's Python 3.12 requirements in an isolated environment. From the repository root:

```sh
python -m pytest -q
node --test tests/test_week_plan.mjs
python -B tests/test_tool_argument_recovery.py
python -B -O tests/test_tool_argument_recovery.py
mkdir -p /tmp/tastetable-argument-evidence
tar -xzf docs/verification/tool-argument-recovery-20261008-de6263/evidence.tar.gz -C /tmp/tastetable-argument-evidence
python -B /tmp/tastetable-argument-evidence/peer/http_probe.py "$PWD" /tmp/argument-http.json
python -B /tmp/tastetable-argument-evidence/peer/http_probe_deep.py "$PWD" /tmp/argument-deep-http.json
python -B /tmp/tastetable-argument-evidence/peer/final_trace_receiving.py "$PWD" /tmp/argument-trace.json
python -B /tmp/tastetable-argument-evidence/contributed/receive_argument_limits.py "$PWD" /tmp/argument-limits.json --expected-agent-blob 1d8bfd5a300c1d4824dc895b324e7d0cfb096058
```

For the original-source negative control, make a detached worktree at `8fdd78dbd1bd7e72385b2f5bd684e02b0971fa14` and set `TASTETABLE_SOURCE_ROOT` to it while running the new test from this checkout. Failure is expected. To recreate the independent first-candidate failure, replace that worktree's `agent.py` and new test with the archived `first-candidate/` pair, verify their hashes against the acceptance receipt, and run the unchanged HTTP probe there. The `decoder-only/` source pair similarly reproduces the later trace failures. The local Git HEAD string will differ from historical reconstruction pins; the checked file bytes are the same.

The author used Python 3.12.14 with environment isolation and third-party pytest autoload disabled. Exact commands, source roots, exit codes, captured outputs, and peer cleanup are retained in the archive. The new tests use explicit unittest assertions and the peer receivers use an explicit `require` function, so their optimized-mode qualification retains its checks. The separately contributed observational script uses Python assertions and was run only in normal mode.
