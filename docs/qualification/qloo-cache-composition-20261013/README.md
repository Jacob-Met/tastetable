# Qloo explicit recovery with isolated caller results

This integration combines PR95, already merged at
`59dbb0c4348b9a0374da4f05f95c23eef6080521`, with original PR96
`656ad3220bb0d8f2cb1584377898c692c512ca71`.

A rejected response no longer traps later explicit calls in a poisoned cache.
The next identical call can fetch a corrected response. Every successful public
return remains a deep copy of its parsed result, including nested mutable data.
No automatic retry, parser admission, request identity, live-provider behavior,
dependency or workflow changes are introduced.

## Exact integration

The combined `qloo_client.py` is 12,554 bytes, SHA-256
`bcabc1fa1a2440e19028ac6e5ec21e9ff8ab049276920f225d968eda84141573`,
Git blob `01739846920c467fbac11717458d294bd0aacacf`.
Compared with PR96 it adds only the deepcopy import and the three public result
wrappers from PR95.

The maintained isolation test still checks exact exception identity on repeated
parse failures; it explicitly changes the request-count expectation from one to
two because rejected payloads are no longer admitted. Two new maintained
interaction tests exercise recovery followed by edits to nested metadata,
scalar affinity and result-list membership. Original frozen receivers,
qualification logs and source pins for both contributions remain unchanged.

## Qualification on the intended estate computer

Root received exact source snapshots into an exclusive directory on the
verified hamon-thinkpad, Python 3.14.4.

- Current main's original 12 isolation tests passed.
- The combined focused selection passed **52 tests and 34 subtests**.
- One FastAPI-dependent API method was unavailable in this environment. The
  wider attempt is retained verbatim in `root/native-receipt.json`; it reports
  52 passes plus that one import failure and therefore correctly has
  `passed: false`. The explicitly narrowed successful run is separately
  recorded in `root/focused-receipt.json`.
- All original nine recovery tests and both new interaction tests passed in
  genuine optimized Python processes using unittest checks.
- Source bytes stayed unchanged.

Anvil independently froze a public-API witness before seeing the composition.
Isolation-only source fails explicit retry; recovery-only source fails nested
caller isolation. The combined source passes both endpoints in normal and
optimized cloud Python 3.12.14 and native ThinkPad Python 3.14.4. Each endpoint
uses exactly two explicit transport calls and preserves the transport payload.
See [the independent acceptance](independent/qloo-composition-independent-acceptance.md).

These are synthetic client and application-focused checks; no full FastAPI
suite pass, live provider call or installed-service upgrade is claimed.

## Reproduce from this integrated repository

Run from the repository root with pytest available:

```sh
python3 -B -m pytest -q -p no:cacheprovider tests/test_qloo_cache_isolation.py tests/test_qloo_cache_recovery.py tests/test_qloo_cache_composition.py tests/test_qloo_http_lifetime.py tests/test_model_selection.py tests/test_recommendation_notes.py tests/test_recommendation_purpose.py tests/test_tool_error_continuation.py -k 'not test_api_recovers_a_valid_checked_meal_after_a_malformed_recommendation'
python3 -B -O tests/test_qloo_cache_recovery.py
python3 -B -O tests/test_qloo_cache_composition.py
python3 -B docs/qualification/qloo-cache-composition-20261013/independent/qloo-composed-public-receive.py --client qloo_client.py --expected-sha256 bcabc1fa1a2440e19028ac6e5ec21e9ff8ab049276920f225d968eda84141573 --output new-composition-normal.json
python3 -B -O docs/qualification/qloo-cache-composition-20261013/independent/qloo-composed-public-receive.py --client qloo_client.py --expected-sha256 bcabc1fa1a2440e19028ac6e5ec21e9ff8ab049276920f225d968eda84141573 --output new-composition-optimized.json
```

The original root receiving harness and its exact public-source input packet
are preserved under `root/`. Its absolute task-owned staging path records the
actual run; use the commands above for portable replay. Historical receipt paths
identify evidence locations and are not installation destinations.

## Original contribution

The [original recovery qualification](../qloo-cache-recovery-20261013/README.md)
and [original isolation receiving](../../receiving/qloo-cache-isolation-1caa1d8e028a/README.md)
remain available at their original pins. Their earlier hash-pinned receivers do
not qualify this combined production source. This directory does.
