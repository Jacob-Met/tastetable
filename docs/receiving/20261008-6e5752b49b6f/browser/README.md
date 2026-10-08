# TasteTable: independent browser receiving

## Outcome

The real application preserves the backend's checked results correctly. The default fictional Rosa persona produced four meals and one outing. An authored refusal of the outing recommendation produced those same four meals and no outing. Refusing all three recommendation calls produced an empty grounded plan and cleared the previous result. Editing the still-present form and submitting it produced a fresh complete plan.

One concrete display issue remains: recommendation failures are shown only inside the collapsed **Agent tool trace**. The partial result has no visible explanation for the missing outing. The completely empty result displays a constraint-related note even though all recommendation requests failed before any candidate could be checked. This is a failure-disclosure issue in the existing display, with a reproducible owner handoff below.

No application code was changed by this review. Existing calendar, organizer, and request-lifecycle ownership was preserved. No provider traffic, external browser requests, publication, or container changes were made.

## Exact receiving input

| Input | Pin |
| --- | --- |
| Repository | `Jacob-Met/tastetable` |
| Composed commit | `2ab4bc187f47acbf4ec193be33f57163c67a9e0c` |
| Composed tree | `e54fd1389040be1f8a7d321b8583283976910a9f` |
| Parent carrying PR2 + PR3 | `7002a16a3b46c7318826ce9975fd812096925f42` |
| Parent carrying PR1 | `feeceefdbd29a61d1ce57aa029d65b0cb071432a` |
| Served HTML blob | `08451f60a6ae9b5a00353ef7b5f1f3fa016bda0f` |
| Served JavaScript blob | `2e6aa8b39d300c3d7dbd5f5bf7d9d819d835f132` |
| Served CSS blob | `e45dd6186df8e513aabecadd88c55b3e6f58d0cc` |
| Chromium | `153.0.8010.0` |
| Chromium executable SHA-256 | `53a15d6c3a3d27dfb54c4ba60278b1683136f70cf1e67e989da7dfbd3d451ef0` |
| Playwright | `1.62.1` |
| Result JSON SHA-256 | `62f815c745095e1c8852d8b2b51997efa327e5796ced0d7fed7ef4c57f554004` |

The server imported the actual candidate `app.py` and `agent.py`; their paths and hashes are recorded in `results/server.json` and the main report. Each HTML, JavaScript, and CSS response was captured from the actual page load and byte-hashed against `git show` of the pinned commit. The production tree had no tracked changes before or after receiving. The unrelated untracked `baseline-api.txt` receipt already present in the candidate was left untouched.

## What ran

`serve_receiving.py` starts the real FastAPI application on a freshly allocated loopback port. It clears its environment before importing application modules and replaces only `QlooClient.from_env` with a factory returning a fresh synthetic `FixtureTransport` for each request. A mode file chooses ordinary fixture responses, refusal of the third `/v2/insights` call, or refusal of all three calls. Refusals raise the real `QlooError(503, "authored receiving refusal")` class. The application's routes, validation, scripted model, tool loop, assembler, static server, HTML, CSS, and rendering JavaScript remain unchanged.

The launcher rejects every `urllib.request.urlopen` call. A new Chromium context blocks requests outside the isolated server origin. There were zero provider network attempts, zero blocked external page requests, zero JavaScript errors, zero console errors, and zero alert dialogs. Server transport receipts record fixture calls and refusal positions without headers or credentials. The authored key string is an inert fixture input, not a credential.

`receive_browser.cjs` loads the actual page, waits for its three personas and demo-mode notice, and uses real button clicks and a real form submission. It never substitutes a mocked API response in the browser and never injects a replacement renderer. It compares each displayed grounded item's name, day, entity ID, and rounded affinity to the actual HTTP response, checks the comparison count, and captures screenshots and visible page text.

| Scenario | Actual request | Grounded output | Trace errors | Error visible on initial display |
| --- | --- | --- | --- | --- |
| Default Rosa persona | Sample button | Four meals + one outing | 0 | Not applicable |
| Outing refused | Sample button | Exact same four meals; no outing | 1 × 503 | No |
| All recommendations refused | Sample button | Empty; no stale items | 3 × 503 | No |
| Edit after failure | Form submit | Four meals + one outing | 0 | Not applicable |

All three scenarios ran sequentially on the same page, which checks that the empty response actually removes previous grounded picks. The separate comparison column retained its five template suggestions under **LLM-only (no Qloo)**, with all five explicitly marked **unverified**; these were not counted as grounded results. In the recovery case, the music field changed from `Celia Cruz` to `Celia Cruz, Frank Sinatra`; the actual `/api/plan` request contained both artists, the edit remained in the form, and a complete result was rendered.

The form remains available above the results with enabled controls. Scrolling back, editing, and pressing **Plan my week** works. There is no claim that this version has a dedicated return-to-editing control, nor that a person can resolve an external provider outage by changing their preferences.

## Bounded handoff: disclose partial and unavailable results

**Owner coordination:** hand this to the already active request-lifecycle / render owner through the root integrator. Current estate claims cover the request controller and status UI (`chatgpt-a2eaaec253d8 / production_receiving`), calendar integration (`estate-9e05c01af69c`), and organizer rendering (`universal-0df473646168 / estate_product`). This review did not open a competing mutation lane. Earlier GitHub content creation hit a secondary rate limit, so this handoff is preserved locally for root's normal publication procedure.

**Counterexample 1: partial plan.** Start in the ordinary mode and use the default sample. Then use the sample again while refusing only insight call 3. The real response is HTTP 200, retains the exact four checked meals, sets `plan.outing` to `null`, and includes one outing `QlooError` in `trace`. The page shows four meals, no outing, and an empty `#notes` element. The error row exists, but Playwright reports it invisible because its enclosing details element is closed. Opening **Agent tool trace** reveals the error. See `02-outing-refusal.png`, `02-outing-refusal-trace-open.png`, and `02-outing-refusal-response.json`.

**Counterexample 2: completely unavailable recommendations.** Refuse all three insight calls. The response is HTTP 200, with empty meals, no outing, three refusal errors, and zero grounded comparison counts. The initial page displays: “Only 0 restaurants passed every constraint; remaining days left open rather than suggesting an unsafe pick.” No restaurant recommendations were returned for checking. All three provider errors remain hidden in the closed trace. See `03-all-recommendations-refused.png`, `03-all-recommendations-refused-trace-open.png`, and the matching response JSON and visible-text receipt.

**Source connection:** `static/app.js` renders only `plan.notes` into the visible note region and renders error summaries exclusively into `#trace`; `static/index.html` places that trace in a details element without `open`. The request's HTTP 200 status also means the existing `catch`/alert path does not run. This result is therefore consistent with the actual source and observed page, not inferred from HTTP status alone.

**Receiving criteria for an owner fix:** a partial response should visibly explain which recommendation could not be obtained while preserving the checked meals; a fully unavailable response should visibly distinguish recommendation failure from an empty constraint match; expanded diagnostic trace should remain available; retained inputs should remain editable and manual resubmission should work. Repeating this same sequence should prove that missing slots are not filled with unverified picks and old items are not retained. A fix does not require calendar changes, automatic retry traffic, or weakening constraints.

The checked backend composition can be assessed separately from this existing display limitation. This receiving report does not claim that the current UI fully explains degraded recommendation results.

## Evidence and rerun

The main machine-readable result is `results/browser-receiving.json`. It includes exact source and browser pins, served asset hashes, all case observations, actual error traces, request payloads, and all authored transport events. Individual API responses, visible-page text, screenshots, server logs, and the server manifest are beside it. The complete evidence directory is approximately 1.9 MiB.

To reproduce in this workspace:

```sh
cd /workspace/scratch/6e5752b49b6f/agents/github_integration/tastetable-browser-review
node receive_browser.cjs
```

The script pins the candidate commit and explicitly names the existing Python environment, Playwright package, and portable Chromium executable near its top. To run elsewhere, provision those existing project requirements and browser dependencies, update these local runtime paths, and retain the same source pin. The server is a child owned by the receiving script; its browser context and server are closed after execution. No shared running service is touched.

Docker is not installed in this workspace. The existing Dockerfile was therefore not executed and this report makes no container build or deployment claim. A new container system was not bootstrapped.
