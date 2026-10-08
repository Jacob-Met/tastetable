# Soft-food evidence: explicit denial receiving

TasteTable previously reported `no soup` and `soup unavailable` as positive soft-food evidence. With the existing firm cue `burger`, the denied soft cue also took precedence and kept the fictional venue in the assembled plan. The candidate removes explicit local denial or unavailability from the existing positive keyword evidence.

The production change is confined to `constraints.py`: one private helper and the soft-food check's positive-evidence call. The existing keyword vocabularies, firm-food check, dietary unknown policy, affirmative-evidence precedence, outing skip, wheelchair check and low-sodium check are preserved. The new regression file is `tests/test_soft_food_evidence.py`. No provider, planner, application, scheduling, saved-file or UI source is changed.

## Source boundary

| Input | Exact identity |
|---|---|
| Repository | `Jacob-Met/tastetable` |
| Captured main | `a77175501199ace765cb7ca57742b267351d3e79` |
| Captured complete Git tree | `2031698fbc8fcf94ad9af06117c2d9858bc83190` |
| Original `constraints.py` blob | `cab2cecbe4c3a6112022d194a927b9025ec67ab6` |
| Candidate `constraints.py` blob | `e9d5cd1575df72b089273740e4b6a444d0cd21a8` |
| Candidate `constraints.py` SHA256 | `f18e4d5ffa14d8a02db2fe9ec6e97a6c0e45e8ebdab1e158124a66f7dd113efa` |
| New regression file blob | `ca77fabe3d44d8f807c05b52b87a7f713ae9c92d` |
| Original fictional fixture blob | `60c5d92f905755454bb280b8181f8836a74bd955` |
| Publication-base read | `1a609bfdd77dc07222eb70f8a4a1f565a8bc8fa0`, tree `ef80f9f0134d613571861278978477152548a5ed` |

`review-freeze-v2.json` binds 16 exact captured main files and 17 candidate files. This is the source closure captured for receiving, not a claim that the whole repository was installed or tested. `parent-tree.json` retains the complete captured Git tree. The sole modified existing file is `constraints.py`; the only added product test is `tests/test_soft_food_evidence.py`.

The publication-base read includes the unrelated offline-week PR28 merge. All 16 captured input blobs remain identical there; the new test and documentation paths are absent. The overlay preserves every unrelated current-tree leaf. The receiving boundary remains the captured a771 source closure, which is byte-identical on that later main for every captured input.

The scope was coordinated in [HAMON #140, comment 6062294104](https://github.com/Jacob-Met/hamon/issues/140#issuecomment-6062294104). The separate venue-contact worksheet and offline saved-week owners retain their scopes. This change preserves the previously merged wheelchair and low-sodium repairs.

## Behavior

| Fictional keyword evidence | Original soft-food status | Candidate status | Existing plan policy |
|---|---|---|---|
| `no soup` | pass | unknown | Retained with the existing ask-the-venue explanation |
| `soup unavailable` | pass | unknown | Retained with that same unknown policy |
| `burger`, `no soup` | pass | fail | Excluded by the existing firm-food signal |
| `burger`, `soup` | pass | pass | Affirmative soft evidence keeps its existing precedence |

The helper handles short local phrases such as `not risotto`, `without any tofu`, `no longer made to order`, `soup (not available)`, `soups unavailable`, `no soup or risotto`, and `not steamed tofu`. Adjacent or coordinated cue lists share an explicit denial. Separate affirmative evidence remains usable, including `soup without risotto`, `no soup; soup available`, `no soup but risotto`, and a separate `risotto` keyword beside `no soup`.

This remains a bounded keyword heuristic. It does not parse arbitrary menu prose or add new food vocabulary. Removing positive evidence does not create a new firm-food signal. The existing hard-texture matcher still decides whether a firm cue is present, and the existing unknown policy still decides whether an uncertain candidate can appear. The receiving establishes source behavior on fictional inputs; it does not establish a venue's actual menu, preparation or suitability.

## Native results

All before/after scenarios use unchanged predicates. The first four-case receiver and original failing records are retained. A rejected first implementation passed those four cases but missed plural, coordinated and compound denials; its source and the unchanged six-case failure receipt are also retained.

| Receiving boundary | Original | Candidate | Runtime/mode |
|---|---:|---:|---|
| Actual `evaluate` → `assemble_plan`, four original cases | 1/4 | 4/4 | Python 3.12.14, normal and `-O` |
| Six local cue controls | 2/6 | 6/6 | Python 3.12.14, normal and `-O` |
| Focused native unittest methods | 32/39 methods pass | 39/39 | Python 3.12.14, normal and `-O` |
| Real pytest, including preserved wheelchair, low-sodium and native CLI suites | 62/69 | 69/69 | Python 3.12.8, pytest 8.4.2, normal and `-O` |
| Actual offline CLI → saved-week writer → `readWeekFile`, four cases | 1/4 | 4/4 | Python 3.12.14, normal and `-O`; Node 24.19.0 |
| All three original persona results | Preserved | Preserved | Twelve actual CLI processes; full output bytes match across both versions and both modes |

The unittest failure count is 28 assertion/subtest failures within seven failing methods; the candidate has no errors or skips. The pytest result includes 30 parametrized wheelchair cases in addition to those 39 methods, so these totals overlap. The optimized pytest runs retain pytest's warning that ordinary non-rewritten `assert` statements are disabled by Python `-O`; the unittest checks use `unittest` assertions and the separate native receiving scripts use explicit outcome checks. The preserved CLI suite launches its own normal Python children; the separate CLI receiving explicitly runs both normal and optimized child processes.

### Actual consumer path

`receive_native_cli.py` makes a private copy of the five exact Python product files and the original fictional fixture. Each case changes only `FIX-P-03.properties.keywords` in that test-only fixture. It executes the unchanged `tastetable_cli.py --persona rosa` entry point under a Python audit hook that rejects provider/network access. The CLI explicitly uses the real `ScriptedModel`, `QlooClient` and `FixtureTransport` and invokes the actual planner and checks. Each of the sixteen before/after/mode runs records one fixture read and no network attempts.

The resulting complete native JSON is passed to the unchanged `tools/native_plan_to_week.mjs`. The produced file is then opened through the actual `readWeekFile` function in `static/week_file.mjs`. The receiver verifies that the complete response and profile survive unchanged and that the selected week is restored. The original source's misleading status survives this same consumer path in the retained negative control; the candidate's corrected status survives it in the successor. This is a file-writer/reader qualification, not browser receiving.

The four fixture variants are receiving inputs only. They are not proposed changes to `fixtures/qloo_fixtures.json`. All original persona results use the original fixture without any mutation and are byte-identical across baseline/candidate and normal/optimized execution.

## Reproduce

Use an existing Python 3.12+ environment. For the preserved pytest suite, use one with pytest installed; no dependency replacement is part of this change. Node 18+ is needed only for the existing saved-week writer.

With an exact source checkout selected as `SOURCE`:

```bash
python -B receive_original.py "$SOURCE"
python -B receive_local_cues.py "$SOURCE"
python -B receive_native_cli.py "$SOURCE" /path/to/new-receiving-output
python -B -O receive_native_cli.py "$SOURCE" /path/to/new-optimized-output
PYTHONPATH="$SOURCE" python -B -m pytest -q -p no:cacheprovider \
  "$SOURCE/tests/test_wheelchair_evidence.py" \
  "$SOURCE/tests/test_low_sodium_evidence.py" \
  "$SOURCE/tests/test_low_sodium_peer.py" \
  "$SOURCE/tests/test_native_plan_cli.py" \
  "$SOURCE/tests/test_soft_food_evidence.py"
```

The first three receivers accept the selected source path explicitly. For the original source, use the candidate's identical new test file without changing the original product source. `qualify_local.py` records that exact arrangement. Receiving output directories must be new so a failed run cannot overwrite an earlier receipt.

The preserved pytest suites were run in an existing Mac environment at `/tmp/canvaspilot-receiving-cf5799f6d38b-9VQmAF/venv/bin/python3`. It provides Python 3.12.8 and pytest 8.4.2, but not FastAPI. This packet makes no full server, browser, full-repository test or live-provider claim. Raw optimized warnings, original failures and source readback are retained.

## Acceptance status

The table above reports the source author's native qualification. A separate reviewer froze six control groups before reading this implementation and then exercised the actual public checks and planner. Its corrected receiver passes 6/6 methods on the unchanged candidate in both normal and optimized Python, versus 2/6 on the original source. It verifies multiword denials, shared denial with a firm cue, repeated or separate affirmative evidence, non-denial boundaries, unknown admission, and outing behavior. See [the complete independent review](independent-review/README.md).

The review retains a fixture-oracle correction: `refried beans: unavailable` was initially used as an unknown witness even though the preserved hard-texture matcher contains the substring `fried`. The candidate correctly followed that inherited firm-evidence policy. Both original failed review outcomes remain; only the unknown witness was changed to `gnocchi: unavailable`, with all 20 assertion-call ASTs unchanged. The reviewer made no product-source changes and reported no remaining blocker within this scoped repair.

`review-manifest.json` preserves the exact 62-file independent packet and its aliases. Native transcript bundles retain original text bytes indexed by byte count, SHA256 and Git blob; repeated identical transcripts share one recorded blob. Publication and any deployment are separate from the captured receiving boundary.
