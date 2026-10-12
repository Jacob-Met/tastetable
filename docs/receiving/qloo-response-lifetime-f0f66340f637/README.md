# Qloo HTTP error response lifetime

This source candidate closes an HTTP error response before the transport translates it to `QlooError`. The original HTTP error remains reachable through the translated exception's context even though its traceback display is suppressed with `from None`; retaining that exception could therefore retain an open response. Successful responses already use a context manager.

## Source and scope

- Repository: `Jacob-Met/tastetable`.
- Original main: [`bce1c08618a208b2d80f3e36e747ae7315616038`](https://github.com/Jacob-Met/tastetable/commit/bce1c08618a208b2d80f3e36e747ae7315616038).
- Original `qloo_client.py`: blob `cca322e0c9af96c481ba8f7ef286e85d3b90cfd2`, SHA-256 `88d951b6271460f17aa307d4979fe23d8cf3a674afa30dd7324f95424dd0ec9b`.
- Candidate `qloo_client.py`: blob `612243c34e879684c303ab60f0f8404f7ac3aa34`, SHA-256 `a7b3362896273e05782e789cb1f89f053f32c4e1b766ae5998e19ed9fab103f9`.

The complete production change is one `e.close()` call in `http_transport`'s `HTTPError` handler, immediately before raising the existing `QlooError`. Status, message, retryability classification, request construction, and cache behavior are preserved. No provider call, key setup, dietary interpretation, recommendation change, or deployment is part of this receiving result.

The current optional-metric owner in [issue 85](https://github.com/Jacob-Met/tastetable/issues/85) owns separate `parse_entity` expressions and explicitly leaves transport, cache, and authentication behavior unchanged. This candidate does not adopt that owner's source or release its receiving gate. The intake found no repository instruction or ownership file in the complete source tree.

## Focused receiving

From either the frozen original projection or this candidate projection:

```sh
python -m unittest discover -s tests -p test_qloo_http_lifetime.py -v
```

The exact same authored test bytes were installed in both projections before the production edit. These tests use the real `QlooClient`, its real `http_transport`, and an owned HTTP/1.1 server on `127.0.0.1` with an ephemeral port. They do not mock `urlopen`. The request header contains an explicitly fictional fixture value, not a provider credential.

| Case | Original | Candidate |
| --- | --- | --- |
| 401 response and underlying stream closed before translated error reaches caller; status/message/request preserved | Fails: response still open | Pass |
| 429 response closed; retryable classification preserved | Fails: response still open | Pass |
| 503 response closed; retryable classification preserved | Fails: response still open | Pass |
| Failed request not cached or automatically retried; later explicit success parsed and cached | Pass | Pass |

Observed with CPython 3.12.14: original 1/4 passed, candidate 4/4 passed. The fixture cleanup closes retained errors and stops its owned server. The frozen original intake files and the candidate's unrelated intake files remained byte-identical after execution. This was a three-file source projection, not a full checkout; the full project pytest suite and browser suite were not run in this receipt.

## Evidence custody and release status

`manifest.json` records the source, test, receipt, and unchanged intake identities. `original-tool-receipt.json` preserves the complete merged stdout/stderr copied from the original execution tool's response, with that transfer explicitly recorded; the original was not rerun. `candidate-tool-receipt.json` preserves the direct returned execution result. Neither receipt claims separate native stdout/stderr capture.

## Independent review

A separate source reviewer accepted the exact production bytes after checking the local standard library HTTP error attributes and the existing exception contract. Its unchanged receipt is `independent/source-contract-review.json`.

A separate runtime reviewer authored a frozen contract without reading the maintained author tests. It used a real local HTTP server and real urllib opener, retaining actual response objects and observing both the `QlooError` constructor boundary and the point where the translated error escaped. For HTTP 401, 429, and 503, the original left the error wrapper and underlying response open at both boundaries. The candidate closed both before translation and left the error bodies unread. The original passed 1/4 cases with six failed closure checks; the candidate passed all 4 cases and all 44 checks on CPython 3.12.14.

The independent controls preserved exact diagnostics, status and retryability, the suppressed cause, one GET without automatic retry, dotted query parameters, zero and false values, filtering of empty and null values, synthetic headers, the explicit timeout, and successful UTF-8 JSON decoding and cleanup. All source bytes stayed unchanged and all fixture threads stopped. The independent receiver and its frozen contract and two reports are copied byte for byte under `independent/` and are identified in `manifest.json`.

To receive either pinned source again in a separately owned environment, use the standard-library-only receiver with a fresh receipt path:

```sh
python -B docs/receiving/qloo-response-lifetime-f0f66340f637/independent/receive_http.py qloo_client.py --output /path/to/fresh-receipt.json
```

These are focused source and transport results. They do not claim full project pytest, browser, provider, installation, or deployment acceptance.

## Publication boundary

The exact candidate has separate source-contract and actual-HTTP acceptance. Publication remains a separately verified operation: refresh the current main, ownership and gates, preserve all unrelated source, and confirm exact remote bytes. Complete workflow definitions contain only push/pull-request events; authorized actual source and merge commits must carry `[skip ci] [skip actions]`. No workflow execution is authorized by this packet.
