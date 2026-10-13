# Qloo cache recovery

The client used to cache transport payloads before endpoint parsing. An insights
error envelope, malformed entity, or malformed tag list could therefore make
every later identical request fail from the cached response, even when a caller
explicitly attempted recovery.

The request cache now admits a response only after the existing endpoint parser
returns successfully. A failed parse or transport call keeps its existing
exception and does not trigger an automatic retry. An explicit later call for the
same request fetches again. Successful responses, including supported empty
results, remain cacheable. Cache hits reparse the raw payload as before, so each
call still receives fresh top-level result objects.

No parser admission rules, provider retry policy, HTTP response ownership,
planner constraints, browser code, or workflows change.

## Reproduce

From the repository root, using Python 3.10 or newer:

```sh
python -B -m unittest discover -s tests -p 'test_qloo*.py' -v
```

This runs the nine cache-recovery controls and the four retained loopback HTTP
response-lifetime controls. The new controls cover rejected insight envelopes,
search conversion failures, partial entity/tag lists, invalid top-level payloads,
unrelated cached requests, transport refusal, valid empty results, and fresh
result objects on cache hits.

## Qualification

Base: `368da250717cc9d1859253ac08a2f4783cd17560`.
Original `qloo_client.py` Git blob:
`612243c34e879684c303ab60f0f8404f7ac3aa34`.

On Linux with CPython 3.12.14, the unchanged new course produced **three passes
and six recovery errors** against the original source, then **nine passes**
against the repair. The four retained Qloo HTTP tests, six model-selection tests,
five tool-error-continuation tests, and thirteen recommendation-note tests also
passed: **37 tests in total**.

A separate wider discovery attempt passed 38 methods and could not run one
FastAPI-dependent method because FastAPI was not installed. The full pytest/API
suite and live provider behavior are outside this local qualification. All
provider payloads were authored fixtures or loopback responses; no live Qloo or
model call was used.

The source/test freeze and original/candidate logs are retained with the
receiving handoff. Review and publication details follow the exact commit linked
from that handoff.

## Independent receiving

Root independently reviewed the authenticated original, complete diff, existing
parsers and new tests. Its actual urllib/loopback HTTP 200 witness covers search,
tags and insights: the original repeats each parser refusal from one request;
the candidate preserves the first error, succeeds on the explicit second call,
and uses the cache on the third call. Supported empty results remain cached.
The exact executed witness and result are retained under `root/`.

Anvil independently received the real Toolbox and plan assembler, including
changed-query isolation, no partial candidate admission, honest incomplete notes,
explicit original-query recovery and cached success. Eight portable courses
passed on cloud CPython 3.12.14 and again on native ThinkPad CPython 3.14.4,
including genuine optimized subprocesses. See
[independent receiving](independent/qloo-independent-receiving.md) for exact
scope, hashes and reproduction commands. Keep the two portable scripts together;
the original baseline is included at `baseline/qloo_client.py`.

Nested returned-value isolation is separately owned by issue #94 / PR #95.
That work overlaps the three public return expressions. This original recovery
freeze does not adopt it; combined-source qualification belongs to integration.
