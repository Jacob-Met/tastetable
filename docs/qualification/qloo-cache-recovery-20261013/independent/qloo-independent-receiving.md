# Independent Qloo Toolbox recovery receiving

Anvil independently received Forge's parse-before-cache candidate through the actual
TasteTable Toolbox, Qloo client, fixture transport, caregiver constraints and plan
assembler. The received candidate is SHA-256
`a8362350fd8f549b312255d7c7c5630b111f57e40ab1ec0da7ff9bf7b43b1aaf`
(Git blob `1061f8fda2599100c3af0479588657cc5831c932`).
The baseline and four supporting production/fixture files were authenticated
against published source `368da250717cc9d1859253ac08a2f4783cd17560`.

## Observed consequence

Each course begins with a recommendation response that either includes valid
entities followed by an unparseable affinity, or declares `success: false`.
The first explicit lookup returns an error after exactly one transport call,
admits no partial candidates, and yields an honest incomplete-lookup note.
It does not describe that error as a successful empty result or a constraint
rejection, and the plan does not repeat the authored raw diagnostic.

A subsequent invalid argument makes no request and leaves the note intact.
A different, valid lookup supplies four checked meal suggestions but preserves
the original incomplete note. An explicit retry of the original lookup then:

- **Baseline:** reuses the malformed cache and remains incomplete; two transport
  calls have occurred, including the distinct healthy query.
- **Candidate:** makes a third transport call with the original exact request,
  recovers the checked suggestions and clears the matching incomplete note.
  Further successful repeats use the cache, reparse fresh result objects, and
  make no additional transport calls.

No automatic retry or network request was made. The transport is the maintained
local fixture with two deliberately malformed outcomes. The fixture's checked
suggestions are authored test data, not real venue or care advice.

## Retained courses and scope

The original fixed-path receiver and its original 25,859-byte cloud receipt are
preserved unchanged. The portable receiver adds only explicit source-root and
baseline-client arguments. The same eight bounded courses were repeated after
that portability change: baseline/candidate × two malformed outcomes × normal
and optimized Python. All guards are explicit exceptions and remain active
under `-O`; each optimized child reports optimization level 1.

The portable cloud course passed on Python 3.12.14. Separately, the exact same
portable receiver and driver passed all eight courses through Remote Desktop
Commander on verified hamon-thinkpad, Linux x86_64, user jacob (uid 1000),
Python 3.14.4. The new private directory is
`/home/jacob/hamon/receiving/anvil-d3745ea0f44f-qloo-cache`.
Its nine-file transfer receipt validates all sizes, SHA-256 values and available
Git blobs before source use. Every course checks all seven source/test/baseline
files before and after; they remain unchanged.

The native course was process 2789757, completed with exit 0 and empty stderr.
Its complete receipt is 51,102 bytes, SHA-256
`324195f2a7852e49ee903260e02a53ef8c465cb74fdc96a54586b0ed235d2761`.
The source receipt is 2,133 bytes, SHA-256
`01a7bc4303b954c2979915ba235b50036dcc903a1deedab776f01ac33eb5b118`.

This is independent receiving of a frozen source projection. It does not claim
the full pytest/FastAPI suite, a live Qloo account, live recommendations,
an external model, an installed service upgrade or a default-branch merge.
Forge's maintained tests and root's source review retain their own attribution.

## Reproduce the same bounded course

Use Python with no third-party dependencies. Keep the two portable scripts
together. The source root must contain the frozen candidate `qloo_client.py`,
`agent.py`, `constraints.py`, `personas.py`,
`fixtures/qloo_fixtures.json` and `tests/test_qloo_cache_recovery.py`.
Supply the separately preserved baseline `qloo_client.py` from the pinned commit.

```sh
python3 -I -B run-qloo-toolbox-courses.py \
  --source-root /absolute/path/to/candidate-source \
  --baseline-client /absolute/path/to/pinned-baseline-qloo_client.py \
  --output /absolute/path/to/new-receiving-receipt.json
```

Choose a new receipt path. The driver writes the complete command, stdout,
stderr and parsed observation for all eight subprocesses. The receiver refuses
a changed candidate or baseline pin and blocks urllib network access. It imports
the explicit supplied client before the supplied real Toolbox and constraints.
