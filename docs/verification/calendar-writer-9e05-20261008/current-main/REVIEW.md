# Current TasteTable main: partial plans received by the calendar writer

**The merged backend and the frozen arranged-week writer are compatible in this native fixture receiving check.** Four backend scenarios and seven calendar receiving outcomes pass. This review uses freshly executed current source, and does not extend the earlier stacked PR #3 review by assumption.

## Exact source

- Connected main pin: [`8fdd78dbd1bd7e72385b2f5bd684e02b0971fa14`](https://github.com/Jacob-Met/tastetable/commit/8fdd78dbd1bd7e72385b2f5bd684e02b0971fa14), including merged PR #5 constraint/purpose binding, PR #2 model selection and PR #3 recommendation-error continuation.
- Native `agent.py`: Git blob `15ae2c26dd14a8eec43dc328e87d6f12c8d460d2`; SHA256 `b301247b8e9459327afa19964d02a9647c0d39f36e55c380115af3b30d538817`.
- Calendar writer: SHA256 `09dfe98a95da6c7fd0b7ee531c3ec4cf9ae5697dc730fab6cffdd07d8bd94b3b`.
- Read-only native `week_plan.mjs`: SHA256 `e739adc10d9ae9ba1cb82c6d800c453e8f7bec53e343e0685adeabe98e6f4809`, from the existing week owner's pinned local commit `02c5e91f2c3e7220162b651ba3c1ec589ac2eea2`.
- All 23 main-source files match their connected Git tree blobs and SHA256 values in `source-manifest.json`.

## Native receiving execution

`python3 -B capture_current.py` executes the unchanged native `run_agent(persona, qloo=None, model=None, model_name=None)` with explicit `ScriptedModel` and `FixtureTransport`. The transport classifies actual restaurant and outing query tags and injects only the selected synthetic refusal. Network is forbidden. The six captured responses are newly generated Rosa, Harold and Mei healthy outputs plus three Rosa failure variants.

| Backend scenario | Checked result | Preserved error trace | Calendar result |
| --- | --- | --- | --- |
| All fixture recommendations available | Four meals and one outing | No synthetic error | Five all-day events |
| Outing recommendation unavailable | Four checked meals, equal to the fresh healthy meals | One error | Four meal events |
| Restaurant recommendations unavailable | One checked outing, equal to the fresh healthy outing | Two errors and meal omission note | One outing event |
| All recommendation classes unavailable | No checked suggestions | Three errors and meal omission note | Empty preview; download refused |

Every response retains the saved caregiver constraint list and the actual native recommendation purpose sequence. Pick counts agree with the returned plan. Rosa retains the existing restaurant/restaurant/outing sequence and three-request bound. This is a current-source receiving check, not a new claim about live provider selection or medical suitability.

## Calendar receiving execution

`node receive_calendar.cjs` runs the actual pinned native `createWeekPlan`, `weekRows` and `setPickDay` together with the frozen `createWeekExport` writer. All six current response shapes are accepted appropriately, including the empty-plan refusal. Each emitted event retains its native Qloo entity ID, full explanation, plan notes and demo/tentative labels.

A seventh outcome arranges the fresh Rosa result: its Monday meal moves onto Wednesday beside the existing Wednesday meal, and the outing is left off the week. Four events remain, two on Wednesday, with distinct stable weekly pick IDs and no invented replacement outing. The existing week supplies all dates. The explicit review week and calendar timestamp are deterministic synthetic test values.

`evidence/calendar-receiving.json` contains counts, dates and source hashes; the six emitted `.ics` artifacts preserve the receiving output. `evidence/fixture-bundle.json` has SHA256 `b3907f9924267e9e386c9054daf7ac486fc3a8f38ad87e1756b9af52b46d7ce7`. It includes `results`, the native `/api/personas` list, exact imported module paths and hashes, fixture data hashes, generation signature, and native scenario results. The browser reviewer can verify those relative source paths against an externally supplied composed frontend root before using the responses.

## Scope and custody

No application source was edited. No provider, calendar account, remote message or deployment action occurred. FastAPI route execution and a composed editable frontend are outside this receiving check; the existing frontend owner and browser reviewer handle that integration separately. The original stacked-parent PR #3 counterexample remains independently scoped to its earlier parent and head.

The shared workspace filesystem was byte-full, while inodes remained available. This small source and evidence packet was created once under the contributor-owned `/dev/shm/tastetable-current-main-9e05c01af69c-estate` directory. No other contributor's files were changed or deleted. Root coordinates durable publication of the owned source and evidence.
