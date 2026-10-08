# TasteTable current-main merge receiving

**Decision: the frozen merge preserves the current production fixes and passes
the independent combined API challenge.** The proposed ongoing CI test is
`proposed-tests/test_api_constraint_receiving.py`. Root owns its review and
publication; this receiver made no edits in the integration checkout.

## Exact source and merge review

The reviewed merge is `60bfb7dd3ec11fa2dcd02b4f802dc980dabb9af0`, tree
`b403bc46cf9bc395f3724560669efedc31a2212b`, with parents published receiving
head `1b8e07856b48318974fc20621975536424113cbe` and current main
`8fdd78dbd1bd7e72385b2f5bd684e02b0971fa14`.

The current [main tree](https://github.com/Jacob-Met/tastetable/tree/8fdd78dbd1bd7e72385b2f5bd684e02b0971fa14)
was retrieved independently through GitHub. Every one of its 23 file blobs is
identical in the merge. Both expected parents are ancestors. Added files are
confined to `docs/receiving/20261008-6e5752b49b6f/` and the earlier
`tests/test_api_receiving.py`. There is no AGENTS.md in the source tree.

Production `agent.py` is Git blob
`15ae2c26dd14a8eec43dc328e87d6f12c8d460d2`; `app.py` is
`2c2f1524e62c74db21fdbcc69faec643903c23b8`. Source review confirms the configured
model selection and recommendation-error continuation coexist with
[PR5's caregiver binding](https://github.com/Jacob-Met/tastetable/pull/5):

- Recommendation purpose is validated before the provider is called or any
  candidate is retained.
- Model-supplied check arguments cannot replace the caregiver's requirements
  or the retained candidate purpose.
- Final assembly recomputes verdicts only for previously checked candidates,
  using the current requirements/evidence for admission, rejection and explanation.
- The static application and all existing constraint/model/error tests retain
  their exact current-main bytes.

The 23-file `candidate/` snapshot is 132,716 bytes and contains runtime, tests,
fixtures, static assets and configuration from immutable merge objects. Large
receiving screenshots were not copied. `candidate-manifest.json` records the
whole committed tree as well as the copied file hashes.

## Combined real-API boundary

`test_current_composition.py` runs both `/api/plan` and `/api/plan/sample/rosa`
through the actual FastAPI handlers, configured model factory, serialized
OpenAI-compatible client interface, native tool loop and final assembler.
The test supplies authored chat replies and local synthetic venue data. Its
request stub accepts only the exact authored model endpoint; no provider
request leaves the process.

Each route executes eight configured-model exchanges containing seven tool
calls. An invalid purpose is rejected before fetching. A valid restaurant
request receives a 503, and a later valid request repairs it. A mixed check
then supplies an empty constraint list and the wrong `outing` kind for retained
restaurant candidates. The known fitting fixture remains accepted; the known
failing fixture is rejected against all three caregiver requirements. A second
invalid recommendation cannot disturb retained state. Rechecking the failing
candidate with empty constraints keeps it rejected. Finally, a distinct outing
query receives a 503 while the checked meal remains available.

Both routes passed and returned equal JSON results: exactly one Monday meal
(`FIX-P-01`), rejected `FIX-P-04`, no outing, all three passing caregiver checks
in the accepted meal explanation, two purpose-validation errors, two provider
refusals, and the configured model name in all eight outbound authored payloads.
There are exactly three provider transport attempts; malformed purposes do not
consume them. Unchecked fixture candidates do not fill missing plan slots.

The unchanged challenge was also run against this receiver's earlier production
snapshot after all six relevant module/fixture bytes were checked against
published PR8 head `1b8e078...`. It fails on both routes. Its retained JSON shows
the malformed purpose contacting the provider, both checked restaurants being
admitted, and `FIX-P-04` receiving a permissive recheck. This is the expected
control demonstrating the new current-main protections; it is not a regression
of the reviewed merge. See `combined-before-main.json`, its log, and
`before-main-control.json`.

## Receiver correction and existing suite

The first authored challenge accidentally used the same Qloo parameters for
the outing as for the successful restaurant request. The real client correctly
served its cache, producing two transport attempts instead of the expected
three. The corrected challenge uses the fixture's existing movie-theater tag
for a distinct outing query. The initial harness, failed receipt and explanation
remain preserved as `test_current_composition_r0.py`, `combined-r0.json` and
`receiver-r0-observation.json`. No production change was needed.

Root's exact-merge full-suite receipt was read and retained separately as
`lead-full-pytest-60b.txt`: **57 tests and 35 subtests passed**, with the existing
Starlette/httpx deprecation warning and no skips. This was root's execution,
not a duplicate full-suite run by this receiver. The independent challenge
adds one unittest method with two route subtests. Root will run the new full
suite after accepting the proposed top-level test.

The maintainable proposed file differs from the executed challenge only by its
normal repository-above-tests source lookup and the class name
`ApiConstraintReceiving`. It is compatible with unittest and pytest. Its SHA-256
is `e4495081effbd6acb567051138a2b662a079bdb9f1c00f4b83cfd261473f7525`.

## Replay

Use the existing Python environment with the repository's unchanged requirements:

```sh
TASTETABLE_SOURCE_ROOT="$PWD/candidate" \
TASTETABLE_COMPOSITION_RECEIPT="$PWD/combined-replay.json" \
python -B test_current_composition.py
```

After copying the proposed file to repository `tests/test_api_constraint_receiving.py`,
the repository's normal `python -m pytest -q` discovers it without special
configuration. The optional receipt environment variable applies only to direct
script execution. This packet does not claim a live provider, Docker, current
browser or deployment qualification. The earlier source-pinned browser packet
and its owned error-visibility finding remain separate and unchanged.
