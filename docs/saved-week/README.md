# Saved weeks that reopen for continued editing

Contribution: `universal-0df473646168 / memory_capability`.
[Scope and ownership](https://github.com/Jacob-Met/tastetable/issues/4#issuecomment-6057603876).

A caregiver can now save an arranged week, leave the page, and explicitly reopen
the file to continue editing it. The original response and inputs stay with the
arrangement. Save/open are local file operations; neither requests another plan,
writes browser storage, nor sends the file to the backend.

The source stacks on the accepted calendar/lifecycle composition, published on
`work/edited-week-calendar-0df473646168` as
`614aa0a98429ba52182376e38a57e32d01b461b9` with tree
`299cabf86343faab77b78bd1cd9e9f8847c7b81d`. Its parent is the PR11 receiving main
`b8d384e5522e17cf15d73e8b06adbe6665e4bdcc`. Publication of that parent source is
distinct from its pending PR/merge and deployment.

## File contract

`static/week_file.mjs` uses ordinary UTF-8 JSON, accepting an optional byte-order
mark and different indentation. A v1 file has these fields:

| Field | Meaning |
|---|---|
| `format` | The literal `tastetable.saved-week.v1` |
| `receivedAt` | The browser's original response-reception timestamp |
| `savedAt` | The timestamp of this save gesture |
| `calendarId` | The plan's existing 32-hex-character calendar identity, or null if unavailable |
| `inputs` | The associated cuisines, music, films, city and constraints |
| `response` | The complete parsed response, including plan, comparison and diagnostic trace |
| `week.start` | The selected Monday as `YYYY-MM-DD` |
| `week.assignments` | Every native occurrence key mapped to a weekday or null |

The complete parsed response is preserved; the original HTTP byte formatting is
not recorded. Extra response fields are retained. Native `createWeekPlan` and
`setPickDay` reconstruct the immutable state, including distinct occurrences of
the same venue and picks left off the week. Serialized derived pick objects are
not used as another planning authority.

The file's inputs must match the response's constraint list. Required native
response fields must have their expected renderable types. Counts are nonnegative
safe integers, and the unchanged planner checks original pick kind, day and source
identity. Tool diagnostic arguments retain any parsed JSON value, including the
null and list values deliberately emitted by PR11 recovery. Source text remains
data and uses the existing escaped rendering path.

A saved file is an editable snapshot, not an authenticated provider receipt.
The page and printed handoff identify the file and say that its source labels and
checks have not been rerun. Client timestamps do not establish provider freshness.
The existing care/demo caveats remain visible. Unknown source and empty calendar
selections keep the existing writer's refusal behavior.

## Receiving behavior

Opening uses the unchanged `TasteTablePlanRequests` controller. It retires the
old result on start and permits only the current operation to commit. A later
input edit, request, cancellation or page departure invalidates an older file
read even if that read completes after abort. A failed open leaves the result
retired and preserves the editable inputs. A valid open restores its own inputs,
date, source evidence and arrangement before normal local editing continues.

Saving uses the current valid date; an invalid visible date stays invalid after
moving or resetting picks. Fully omitted and empty weeks can still be saved.
Calendar downloads keep their separate eligibility rules.

The writer already accepts `id` and `createdAt`. Passing the retained identity
and original reception time preserves unchanged calendar output on reopen and
same-week occurrence UIDs during later moves. Different weeks still have different
UIDs. No calendar-app synchronization, cancellation or import-update behavior is
claimed. `calendar.js`, `week_plan.mjs` and `plan-request.js` remain byte-identical
to their attributed predecessors.

## Evidence and its limits

The author ran the actual browser app with the unchanged original three-persona
native response fixture. The later PR11 cases were produced by a new execution
of its exact five-file native dependency closure using `FixtureTransport`, then
received by the file module. All data describes fictional fixtures.

| Observation | Result |
|---|---|
| Original browser continuation | No save/open controls; edited arrangement is unavailable after reload |
| Final native file/state suite | 10 passing methods |
| Final v3 complete browser workflow | 7 passing groups; actual downloads, reload/open, resumed editing, print provenance, delayed reads and unchanged request bodies |
| Native PR11 module receiving | Both actual recovered partial plans save/reopen with their complete null/list diagnostic arguments |
| Final v3 native-response browser receiving | Both real captured partial plans pass the actual generated-plan/save/open/resave UI, retaining the complete error trace and usable checked pick |
| Final v3 HTML input boundary | The unchanged witness passes: both count strings are rejected before commit and literal source text remains literal |
| Calendar output before/after reopen | Actual downloaded files are byte-identical for an unchanged arranged week |
| Source custody | All static hashes remain unchanged within each captured run; all nine unmodified predecessor companions remain exact |

The original HTML-boundary failure is retained. In the first saved-file successor,
string values in two comparison counts became image markup and ran a harmless
in-page marker. The revised saved-response checks reject both before commit; the
unchanged witness passes on v2 and v3, and literal source text stays literal. The v3
change only admits native diagnostic argument values and leaves these count and
pick checks intact.

The first schema revision also wrongly required diagnostic arguments to be
objects. Fresh main PR11 intentionally emits null/list/scalar values when tools
recover. Both real native responses were refused on the preserved v2 source and
pass the unchanged receiving driver on v3. The original nine-method test file and
its one obsolete-null-fixture assertion failure on v3 are retained. That single
invalid fixture now omits the required `args` field; its assertion is unchanged.
An additional method retains both actual native recovery responses.

Two v3 browser follow-ups initially hit recorded Chromium `Target crashed` errors as the
shared RAM filesystem reached 100% use (22,088 KiB available). Serial retries also
failed before their new assertions completed. They remain recorded runtime
failures. After ordinary capacity became available, the unchanged source and
driver passed the HTML witness and both native partial-response browser cases.
Those later receipts are separate from the earlier failures. No permission or
runtime configuration change was used, and no other worker's files were removed.

Root will append separately attributed independent receiving. These authored
fixtures and local executions establish the stated source behavior, not live
provider outcomes, deployment, real care suitability or calendar-app adoption.

## Replay

The directly runnable module suite needs Node.js 18+ and no npm package:

```sh
node --test tests/test_week_file.mjs
```

The evidence archive preserves the baseline, prior candidates, raw failures and
receipts, final source, native capture, exact runners and fixtures. Extract it to
a fresh owned directory. The layout is the same as the original working packet:

```sh
node tests/check_native_recovery.mjs candidate-v3 fresh-native-receiving.json
```

That driver reads the retained actual native result and writes only the supplied
new receipt. The native capture intentionally refuses to overwrite its original
receipt. For a new native execution, create a fresh directory with `intake/`,
`tests/` and an empty `evidence/`; copy `intake/native-b8/`,
`intake/native-b8-source.json` and `tests/capture_native_b8.py` to their matching
locations, then run `python3 -B tests/capture_native_b8.py` there.

The actual browser driver uses Playwright and a locally available Chromium. Point
`TASTETABLE_CHROMIUM` at that executable and provide an ordinary writable `TMPDIR`:

```sh
node tests/browser_saved_week.cjs candidate-v3 fresh-browser-output
node tests/browser_saved_week.cjs candidate-v3 fresh-html-output --html-boundary
node tests/browser_saved_week.cjs candidate-v3 fresh-native-browser-output --native-recovery
```

Each output directory must be new. The driver blocks external browser requests,
serves exact static files and fictional native responses on loopback, records
before/after hashes, and retains the actual downloaded JSON/ICS files and print
output. Its explicit delayed-file control wraps `File.prototype.text`; the app's
request controller remains unchanged.
