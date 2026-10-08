# Replay the frozen caregiver week evidence

Use a complete checkout containing the six files in `candidate_manifest.json`.
The packaging directory is an allowlist source, not a complete checkout. The
candidate's local identity is `02c5e91f2c3e7220162b651ba3c1ec589ac2eea2`;
the original evidence base is `d1c7a4e39cfdc0bb5b9fe026bc9660b75b456e81`.
The current receiving base is `8fdd78dbd1bd7e72385b2f5bd684e02b0971fa14`.
Its six active week files match the frozen candidate, while the backend includes
other owners' merged repairs. Compare source hashes and use the correct base
before attributing a replay to either recorded source.

The commands below are replay guidance. Packaging did not rerun the browser,
Node, Python test selection, or independent review. The separately recorded
current native fixture comparison executed only the three persona responses.

## Extract the raw records

From the complete checkout root, create a fresh evidence directory:

```sh
tastetable_source="$(pwd)"
tastetable_evidence="$(mktemp -d)"
tar -xzf docs/caregiver-week/evidence/raw-reviews.tar.gz -C "$tastetable_evidence"
```

The archive contains `author/` and `independent/`. All 34 file hashes are listed
in `evidence/archive-manifest.json`; the original 21-entry author manifest plus
itself account for 22 files, and the original 11-entry independent manifest plus
itself account for 12. Historical source and output paths inside the records
remain unchanged.

If the original source snapshot is needed, extract it into another fresh
directory. It contains all 19 tracked files from the original candidate and
does not include the later backend repairs:

```sh
mkdir "$tastetable_evidence/source"
tar -xzf "$tastetable_evidence/author/source-snapshot.tar.gz" -C "$tastetable_evidence/source"
```

## State and native regression tests

From the complete candidate checkout, with its existing Python dependencies:

```sh
node --test tests/test_week_plan.mjs
PYTHONDONTWRITEBYTECODE=1 python3 -m pytest -q -p no:cacheprovider tests/test_tastetable.py -k 'not web'
```

The recorded results are 11 Node tests passing and 18 selected Python cases
passing, with the web test deselected. The Python command expresses that same
selection; the retained log does not include its original outer launch argv.
The FastAPI route test requires the missing web dependencies and is outside the
recorded regression result.

## Independent review

The independent run used Node `24.19.0` and passed nine tests. Always supply
`TASTETABLE_REVIEW_SOURCE` after extraction because the original scripts retain
their historical default checkout path:

```sh
TASTETABLE_REVIEW_SOURCE="$tastetable_source" node --experimental-vm-modules --test "$tastetable_evidence/independent/independent-review.mjs"
```

The preserved fixture responses and date oracle are ready to use. To reproduce
them in the extracted directory before another review run:

```sh
TASTETABLE_REVIEW_SOURCE="$tastetable_source" python3 -B "$tastetable_evidence/independent/build-fixtures.py"
```

The fixture builder explicitly uses `FixtureTransport` and `ScriptedModel`.
The historical `fixture-replay.json` records byte-identical regeneration of both
inputs. The independent harness evaluates the production module bytes and
observes actual handlers through a small DOM; it does not perform browser
layout, PDF pagination, or a production HTTP-service check.

## Chromium and the printed handoff

The final author harness requires Node 22+ and a Chromium executable. Keep
`author/check_browser.mjs` beside `author/browser_fixture.json`, and use a fresh
output directory:

```sh
node "$tastetable_evidence/author/check_browser.mjs" --root "$tastetable_source" --output "$tastetable_evidence/browser-new" --browser /absolute/path/to/chromium
```

The original result is `author/browser-final.json`; the raw directory also
contains the desktop/mobile images, fixture PDF, and `print-extraction.md`.
The report records the exact static-source hashes and synthetic fixture hash.
The harness serves fixtures on loopback and terminates its owned browser and
server after the run.

For the baseline, use the untouched static inputs from the original browser
packet with the final harness:

```sh
mkdir "$tastetable_evidence/initial-inputs"
tar -xzf "$tastetable_evidence/author/browser-inputs.tar.gz" -C "$tastetable_evidence/initial-inputs"
node "$tastetable_evidence/author/check_browser.mjs" --root "$tastetable_evidence/initial-inputs/baseline" --output "$tastetable_evidence/browser-baseline-new" --browser /absolute/path/to/chromium --baseline
```

The original packet also retains the initial harness. Earlier focus and request
predicate failures remain as historical evidence; the final harness hash is
`67be1f4a23f2e1e789173b53c95dfcbd3a8be842ffa373650e577f269c3e78d2`.
Source behavior, handler evidence, native browser evidence, and live-service
adoption remain separately attributable to their recorded scope.

## Current receiving fixture comparison

`receiving-native-fixtures.json` contains all three complete results from the
current backend source and their equality checks against the frozen browser
fixture. `composition-receipt.json` records the exact source blobs, command,
result hashes, and execution disposition. It used the existing native
`run_agent`, an explicit `ScriptedModel`, and an explicit `FixtureTransport`;
neither a browser nor a live service was involved.

The original raw archive and directly copied author/independent records remain
byte-identical. Use the original source snapshot to reproduce those historical
runs, and the current receiving checkout to reproduce the separately labeled
native comparison.
