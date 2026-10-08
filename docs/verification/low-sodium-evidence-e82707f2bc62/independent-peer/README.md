# Independent low-sodium evidence receiving

This packet qualifies the original TasteTable issue #22 candidate against four independently authored cases. The same test bytes produced **four failures on the baseline and four passes on the candidate**, with no errors or skips. Original logs, complete literal inputs, native agent output, fixture request trace, and source hashes are preserved in [peer-evidence.zip](peer-evidence.zip). The compact source-bound result is [peer-receipt.json](peer-receipt.json).

## What the cases establish

1. All four existing positive cues can be explicitly denied. `NO low sodium options`, `NOT heart-healthy`, `without steamed dishes`, and `not made to order` no longer override a separate existing high-sodium cue.
2. Independent affirmative cues retain the existing positive-over-high policy, including a mixed phrase and the affirmative controls `not only low sodium` and `known low sodium dishes`. A separately negated keyword is excluded from the positive explanation.
3. An unavailable positive cue produces `unknown` when no high cue exists. The existing permissive unknown admission policy and outing exemption remain intact.
4. A wholly new seven-place fixture runs through the actual repository `FixtureTransport`, `QlooClient`, `ScriptedModel`, and `run_agent`. The repaired candidate rejects the high-ranked falsely positive venue, retains four grounded meals and the outing, preserves independent positive precedence, and labels an admitted unknown venue honestly. Persona, fixture, source files, and transport grounding remain unchanged.

The positive-precedence method already kept its affirmative statuses on the baseline; its baseline failure specifically records the falsely positive explanation of a separate negated keyword. The suite distinguishes evidence labeling from the existing admission policy.

## Exact source and native test

Baseline commit: `0758d2cca881fb5b5041f80bae2174cf485f4bdd`.
Original candidate `constraints.py` blob: `5d1570db8af6dd167909e7f289dec2fc81f8f21e`.
Unchanged peer test SHA256: `a0748ab61b8c49f4b7f56d823ffabba40bf7d82401ae10084d47777df1a4cb58`.

Only `check_low_sodium` and the new dedicated helper differ among the original source's function/class AST nodes. Other constraint functions, agent behavior, and provider code are unchanged by this candidate. The later wheelchair composition is a separate receiving boundary; the published current-main source must pass the existing hosted gate.

From the repository root, the checked-in copy is runnable with:

```sh
python -m unittest discover -s tests -p test_low_sodium_peer.py -v
```

The test uses normal repository imports and standard-library fixtures. Setting `TASTE_PEER_EVIDENCE` to an output directory when directly executing the test saves its detailed receipt. The local baseline/candidate runs selected the exact source directory through `PYTHONPATH`; the test itself has no scratch-directory dependency.

This is the project's established offline fixture path (`mock: true`). It does not claim live Qloo, model, UI, deployment, or clinical verification. Hosted pytest for the final published composition remains the publisher's next gate. No additional local run or production edit was made while packaging these frozen results.
