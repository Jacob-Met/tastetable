# TasteTable calendar writer for the editable week

The owned adaptation is ready for the existing editable-week owner to integrate. The exact delta is `static/calendar.js` plus the new `tests/calendar-week.test.cjs`. The rest of this isolated candidate preserves the accepted standalone calendar snapshot for comparison; it is not a replacement frontend packet.

## Source pins and evidence

| Source | Pin |
| --- | --- |
| Accepted calendar before adaptation | SHA256 `22234deea83994607c4a6441a711224e303da256d2a3781670a17b00278fa3c4` |
| Adapted writer | SHA256 `09dfe98a95da6c7fd0b7ee531c3ec4cf9ae5697dc730fab6cffdd07d8bd94b3b`; Git blob `dbed22d2cb91090bccec9472fbffd2854eed2722` |
| New arranged-week tests | SHA256 `0169b753f81431545669cd97a0765ee469b36112c06c93e6285f92869f334adf`; Git blob `49bc39f7665683696708692989f1d5921c8ed587` |
| Read-only native planner reference | Local commit `02c5e91f2c3e7220162b651ba3c1ec589ac2eea2`; `static/week_plan.mjs` SHA256 `e739adc10d9ae9ba1cb82c6d800c453e8f7bec53e343e0685adeabe98e6f4809` |

The writer and tests are in `tastetable/`. `candidate-manifest.json` records the exact freeze. `evidence/calendar-tests.tap` records 23 passing tests: 13 retained calendar tests and 10 new arranged-week groups, with zero failures or skips. The old `createPlanExport` output remains byte-identical for actual Rosa, Harold and Mei fixture responses plus all four PR #3 partial-result scenarios. The final source also passes 15 independent groups against the actual pinned native planner; its exact source copy, raw test log and event observations are in /workspace/scratch/9e05c01af69c/review/calendar-composition/. All 20 other candidate files and the accepted source remain unchanged. The read-only planner reference is evidence only; it has not been republished as owned source.

## API contract

```js
const exportSession = TasteTableCalendar.createWeekExport(initialWeekState);

// Each call receives the same current native state and its own native rows.
const items = exportSession.preview(weekState, weekRows(weekState));
const file = exportSession.download(weekState, weekRows(weekState));
// file: { filename, text, count }
```

The frozen session also exposes `source` (the source label) and `totalCount` (the number of original checked suggestions, including any subsequently left off the week). Preview returns an array of current arranged items. Each item has `key`, `originalDay`, arranged `day`, `date`, exclusive `endDate`, `kind`, `entityId`, `name`, `why` and `summary`. Returned preview objects can be changed by callers without changing the stored source.

Create one session after a new checked source plan has successfully produced the native week state. Keep that session while `setWeek`, `setPickDay` and `resetDays` produce new states. Discard it whenever the source plan is cleared or replaced. The optional second argument supports deterministic test metadata: `{ id: <32 lowercase hex characters>, createdAt: <Date> }`. Normal application calls omit that argument.

The session copies only the validated `sourcePlan`, `sourceMode` and stable pick wrappers. `sourceMode` must be exactly `mock` or `live`; `unknown` is refused. `picks` must retain the native source order of meals followed by the optional outing. Every key is unique and contains 1–64 ASCII letters, digits, underscores or hyphens, beginning with a letter or digit. Each wrapper's original day and source details must match its original checked pick. Changing provenance, source notes, source identity or key mapping requires a new session.

`state.weekStart` supplies the only calendar week. The writer requires a valid Monday in ISO form and verifies that all seven native rows match its consecutive dates and weekday names. Every non-null assignment must appear exactly once in the corresponding row, and null assignments must be absent. Row wrappers must still match the checked source. This rejects stale rows, missing picks, duplicate keys, altered source descriptions and inconsistent dates before producing any file.

Several checked picks, including picks of the same kind or with the same Qloo entity ID, can share a day. Their UIDs use the session namespace, the selected week's Monday, and each stable pick key. A move, omission and restoration, or reset within one week preserves that identity. Selecting another week produces distinct IDs, matching the accepted calendar's behavior for separate weekly occurrences. Returning to the same week restores that week's IDs. A newly created session receives a new namespace. Date-only starts and exclusive next-day ends remain independent of timezone or daylight-saving time.

Descriptions preserve source mode, Qloo entity ID, original explanation, plan notes and the existing tentative suggestion caution. They also state the original suggested weekday and the user's arranged day and date. The existing escaping, UTF-8 folding, field bounds and invalid-character refusal apply to both writer APIs.

## Frontend receiving contract

Use the editable week's existing date control and `weekRows` output to render the dated preview and prepare the local download. This adaptation does not mount another picker. The existing `createPlanExport` and `mount` functions remain compatible for the accepted standalone snapshot; the composed editable frontend uses `createWeekExport`.

The native date handler retains the previous `weekState` when a new date input is invalid. Therefore a current-input validity gate must be checked before enabling or executing calendar download. Moving a suggestion or resetting days while that date input remains invalid must leave download disabled. Rechecking only `weekState.weekStart` would export the previous accepted week while the control displays a different invalid input.

Disable download before refreshing preview. All creation, preview and download validation failures throw synchronously and should produce a visible error with download disabled. Preview of an empty or entirely off-week plan is `[]`; download throws the readable “no checked suggestions” error. Recheck current input validity and current rows on the download gesture rather than reusing a previously prepared file.

A new request, cleared result, failed rendering, cancelled request, or superseded response must invalidate the old export session together with the old plan. The request lifecycle owner supplies those transitions. The writer performs no network requests, storage, provider calls or calendar account operations. The existing local Blob download mechanism can consume `file.text` and `file.filename` after validation.

A local calendar file does not synchronize changes or cancel earlier imports. Stable UIDs identify each week's suggestions within this session; calendar application import behavior remains outside this writer's qualification. The earlier namespace-plus-pick-key policy is preserved in `earlier-contract/` for traceability; the current week-qualified policy is the integration contract.

## Integration ownership

The existing editable-week contributor owns the composed frontend, including date controls and app/request handlers. This packet contains only the calendar writer adaptation and its tests. Root coordinates publication and source integration. GitHub content creation was paused after the observed secondary rate limit; this local packet does not assert that a coordination reply or owner acknowledgment was published.
