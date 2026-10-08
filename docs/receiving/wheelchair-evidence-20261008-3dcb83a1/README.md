# Wheelchair entrance evidence — native receiving

## Observed defect and correction

On exact main `b8d384e5522e17cf15d73e8b06adbe6665e4bdcc`, the original [check_wheelchair](https://github.com/Jacob-Met/tastetable/blob/b8d384e5522e17cf15d73e8b06adbe6665e4bdcc/constraints.py) accepts any tag ID or label containing “wheelchair”. Authored fixture responses labelled “Not wheelchair accessible”, “Wheelchair rental”, and “Wheelchair accessible restroom only” each produced five checked picks through the actual `run_agent → QlooClient → FixtureTransport` path. Each explanation asserted an accessible entrance. The affirmative control also returned five; absent accessibility evidence returned none.

The correction requires the complete established label “Wheelchair accessible entrance”, with harmless case, spacing and hyphen normalization. The exact [existing local fixture](https://github.com/Jacob-Met/tastetable/blob/b8d384e5522e17cf15d73e8b06adbe6665e4bdcc/fixtures/qloo_fixtures.json) identifier is accepted only when unlabelled. An inconsistent label on that identifier, recognized qualified/contrary access wording, or an unrecognized wheelchair identifier or labelled claim in the local accessibility family leaves the result UNKNOWN. Mixed unresolved access claims also remain unknown; an unrelated rental tag does not cancel separate affirmative entrance evidence.

The existing steps-at-entrance refusal still takes precedence. UNKNOWN continues through the existing strict exclusion when wheelchair access is requested. No dietary heuristic, supported constraint, provider call, planner ranking, persona, fixture, UI, calendar or request-lifecycle source changes.

This is an inference over the repository's declared local tag contract. Its accessibility identifiers are explicitly placeholders in the product; these tests do not verify live Qloo identifiers or a real venue's entrance. An accepted signal remains a heuristic, with the existing call-ahead limitations.

## Exact pins

- Original parent: `b8d384e5522e17cf15d73e8b06adbe6665e4bdcc`.
- Actual parent tree: `06409d6f67d0c99ee99305fe4f745963ec2da2a2`.
- Original constraints blob: `53138a106455cc3fa40d812d1ade3c60fcbbb916`.
- Candidate constraints blob: `941ccc6f21c72d9563388301609ef978894336ca`; SHA256 `248789e3a4a31b7dcab499d8e3d445f566e26927c5fc4706c6a76a0e7ac6069f`.
- Candidate new tests blob: `96a8202b1016688405783033b19a50f98ff69649`; SHA256 `f3c8675177b51d508e7d297a3ff07da64fc7b73c03d5b7405493ec3099f3f252`.

Production changes are confined to `check_wheelchair` and one additive test file. All nine selected original source/config/fixture files were checked against Git blobs; all eight untouched candidate files were checked before and after execution. The native collection is sparse, with complete source retained in Git.

## Native verification

| Check | Observed result |
| --- | --- |
| Original planner/constraint test selection | 38 passed, 15 subtests passed, one HTTP test deselected |
| Original 25 new controls over original source | 16 failures; 9 retained controls passed |
| First candidate planner/constraint selection | 63 passed, 15 subtests passed, same HTTP test deselected |
| Two later punctuation regressions over first candidate | Both fail |
| Punctuation correction (v2) planner/constraint selection | 65 passed, 15 subtests passed, same HTTP test deselected |
| Three namespace regressions over v2 | All three fail |
| Final namespace correction (v3) planner/constraint selection | 68 passed, 15 subtests passed, same HTTP test deselected |
| Actual planner replay | Negative, unrelated and partial tag sets each produce zero picks; known affirmative returns five; missing evidence returns zero |
| Complete results for all three existing personas | All 23,132 serialized bytes are identical before/after; SHA256 `3e662d7214c8bb2b946fa335b3680cf5824858c265c4c95edbb481bf92d63a77` |

The 30 maintained cases cover affirmative labels, identifier fallback and alias, contrary labels, unsupported identifiers, negative/partial language, mixed evidence, unrelated rental coexistence, steps precedence, source immutability and absence of a requested wheelchair constraint. The primary planner replay replaces actual fixture accessibility tags, keeps source fixtures unchanged, and observes 14 local fixture calls per case with zero external calls.

The normal full project test command remains `python -m pytest -q`. This author's native environment had Python 3.14.4 and pytest 9.0.2 already installed, with no FastAPI/httpx. Therefore the native selection explicitly deselects `test_web_endpoints`; it is not a complete HTTP/backend suite or browser execution claim. Hosted project CI is separate.

## Independent finding and correction

The root receiver independently combined the exact affirmative tag with a separate entrance-note tag labelled `Not wheelchair accessible.` or `Wheelchair accessibility: unconfirmed`. The first candidate returned five checked picks because whitespace splitting did not recognize an access word touching punctuation. That failing source (SHA256 `43b190472229b560d7090c4d01a90dc8f30d14d7a9e95f485aacfe8cf32e4644`) and its tests/pins remain preserved under `candidate-v1/`.

The corrected candidate recognizes the existing English access vocabulary as letter runs across punctuation. It does not broaden affirmative admission. Two added tests exercise both the direct verdict and actual planner over these mixed tags. The prior candidate fails both; the corrected native selection passes all 65 tests and 15 subtests. A fresh complete healthy output matches the already retained original bytes. No accepted original run was repeated. `punctuation_check.py` and `punctuation-results.json` preserve this exact correction and its commands; `native-results.json` remains the historical original/first-candidate receipt.

The receiver then challenged v2 with the known affirmative tag plus `urn:tag:accessibility:place:entrance_note` labelled `Wheelchair users prohibited`. The planner still returned five picks because that label did not use the ambiguity vocabulary. V3 applies the existing accessibility-family boundary to wheelchair mentions in either an unknown identifier or its label. Such unrecognized claims remain UNKNOWN without expanding a list of negative words. Established affirmative signals and a separate amenity rental remain accepted. Three actual-planner controls (prohibition, pending information and a staff query) all fail on v2 and pass on v3. The final selection passes 68 tests and 15 subtests, and the complete healthy bytes still match. V2 source/tests/pins are retained under `candidate-v2/`; `namespace_check.py` and `namespace-results.json` retain this correction.

Root independently accepted the exact v3 source after eight actual parser/planner cases passed, with source bytes unchanged and zero external attempts. The final cases cover punctuated contradiction, mixed uncertainty, an unlabelled positive plus denial, qualified entrance wording, unrelated amenity rental with a positive, the established unlabelled ID, steps precedence, and the unqualified accessibility-namespace denial. The corrected-fixture original baseline result is 3/7; v2's separately authored namespace challenge is 0/1. These historical selections are kept distinct from the final eight-case acceptance. No acceptance of either failing candidate is inferred.

The unchanged final receiver is `independent/receive-final.py` (SHA256 `f9e3ca06f0ace6edfcd6dc8648ef10f51c662f959546984ccf0752bf117c1067`), and its source-pinned receipt is `independent/candidate-v3.json` (SHA256 `7f7c7ea199632e0e9d63c65a3e19e1d501ff0f957d29162f7b877e1182877b09`). It can be run as `python receive-final.py SOURCE_DIR RECEIPT_JSON EXPECTED_CONSTRAINT_SHA256`. The output path must be new. The receiver uses real local fixtures and rejects attempted external connections.

The independent acceptance and receiver fixture-key correction are recorded in `independent/ACCEPTANCE.md`. Earlier malformed-fixture results remain native and are excluded from the acceptance counts.

## Reproduction and retained evidence

Run `python reproduce.py /absolute/path/to/source` for the five actual planner cases. `healthy.py` prints the complete deterministic results of the existing three personas. Both choose an explicit FixtureTransport and refuse `urlopen`.

`source-pins.json`, `product-pins.json`, `baseline-reproduction.json` and `native-results.json` retain exact source identities, commands and original failures. `native_check.py` is the original one-shot orchestrator, used with adjacent `baseline/` and `source/` directories; it creates a separate test-only overlay of the original source. The full byte-identical healthy result is retained once as `healthy-original.json`; its candidate copy remains native.

Native workspace: `/home/jacob/tastetable-accessibility-3dcb83a1`. Before and after subprocesses, resource checks require 512 MiB free and limit the owned files to 16 MiB; commands have a 45-second timeout. These are checks/deadlines, not kernel quotas. The recorded final candidate owned size was 1,384,146 bytes with approximately 3.02 GB free, including both preserved prior candidates. Packaging adds only compact source/evidence files.

Current ownership reads preserved the calendar/lifecycle/week consumer, saved-week continuation, planner-note wording and integrated model/constraint-binding authors. The initial scope was recorded locally while root's shared GitHub mutation cooldown was active. Source publication and independent receiving are reported by their exact later receipts; no deployment, reservation, actual provider request, native goal lease or observed customer outcome is inferred here.

## Compatibility with current planner notes

Main `f04353ffe4de808543031f56a2a59fac589cb0ab` includes new recommendation-completion bookkeeping and planner notes. An isolated current composition preserves that Agent source byte-for-byte and carries the exact final classifier and tests. Its 13 newly integrated recommendation-note tests and 17 subtests pass. The unchanged independently authored final eight-case parser/planner receiver also passes 8/8 with zero external attempts when replayed by the author against this composition. All 11 selected source/test/fixture files are pinned before and after. `compose_current.py` and `current-composition.json` retain these commands and current-source observations. The original root acceptance stays pinned to the original base; this later replay is author compatibility evidence, with no new browser or live provider claim.
