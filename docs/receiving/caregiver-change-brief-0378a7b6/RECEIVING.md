# Caregiver revision brief — native receiving

## User capability

The existing **Compare saved weeks** page now offers **Download change brief (.txt)** after it has loaded two matching saved-source copies. The caregiver gets a handoff of exact moved, newly scheduled and omitted visits, with unchanged counts, filenames, both selected weeks and saved/source timestamps. Repeated venue names and IDs remain separate original pick occurrences. Changed picks retain the original explanation from the saved file.

The earlier/revised roles are chosen by the user. The brief does not infer recency from timestamps. An all-off week, an empty native result, or a pair with no visit changes remains an explicit usable state. Unchanged visits are counted, not repeated; the artifact says it is not the complete revised week. Keep the revised JSON for the full arrangement.

A missing or pending file cannot publish a brief. A different source/identity pair stays visible in the existing separate-arrangements view and cannot produce an actionable change brief. The unchanged loader retains its previously accepted file after a refused replacement; the new artifact names that retained file. Clearing a slot or accepting a newer file retires older pending reads.

This is a user-downloaded text copy. It does not apply a plan, send a message, contact a venue, rerun checks, carry venue worksheet notes or update calendar imports.

## Source and ownership

External contributor: chatgpt-0378a7b6b7c2/mac_product.

Native source: /home/jacob/tastetable-discovery-0378a7b6, branch hamon/0378a7b6-caregiver-change-brief.
Canonical discovery/baseline: 2b347cee4ff4e2b806362730a8520a3360b45f5a.
Baseline checkout: /home/jacob/tastetable-change-brief-baseline-0378a7b6.

A fresh native public Git clone recovered the current integrated comparator, planner and PR33 venue worksheet. No AGENTS.md, CONTRIBUTING.md or CODEOWNERS was found in that source. Readable native coordination identified the offline-calendar owner, the separate visit-status/notes consumer, the original venue worksheet and existing source integration lanes. This team's separate saved-week standalone HTML exporter (#39) is also excluded.

The native coordination scan has **15 unreadable records**; it is partial coverage, not a claim that all work is known. The central coordination directory is not writable to ordinary jacob, and the installed goals wrapper denies its /opt/hamon-macros directory. No permissions were changed and no native lease was invented. claim.json is an external advisory record in this isolated source tree. Project/central publication was queued while the shared GitHub API primary quota was held until its reported reset; there was no alternate publication route.

The runtime delta is one new pure formatter and additive comparator-page/button wiring:

- static/week_change_brief.mjs
- static/week_compare_ui.mjs
- static/compare-weeks.html

The existing comparison algorithm, saved-week codec, scheduler, planner/controller, calendar writer, venue worksheet, backend and offline studio retain their original bytes. README documentation is additive. Source/test hashes are in source-receipt.json; the browser receipt independently pins every served file before and after its run.

The browser receipt's head records the real base HEAD at execution time. Candidate bytes were still in the isolated worktree and are identified by sourcePins; the receipt does not claim those bytes already belonged to the base commit.

## Executed gates

| Gate | Result | Retained evidence |
| --- | --- | --- |
| Focused new formatter + unchanged comparator/codec/week tests | 35 passed, 0 failed | node-first.log |
| Exact existing saved-week-comparison CI command, all Node browser-domain tests | 81 passed, 0 failed | node-ci-gate.log |
| Actual canonical-baseline browser consumer | 1 passed group, no brief action or downloads | browser-baseline/receipt.json, baseline screenshot |
| Actual candidate browser consumer | 9 passed groups, 10 actual downloads | browser-candidate-1/receipt.json, text artifacts and screenshots |
| Source whitespace check | git diff --check passed | Native receiving command |
| Independent input-first artifact review | Accepted without blocker | independent-la7/oracle-before-output.json, receive.mjs and receipt.json |
| Independent source review | Accepted without blocker | root-source-review.md |

Both browser runs used native Node **22.22.1** and Chromium **153.0.8010.47** on ThinkPad. An existing Playwright module and installed Chromium were reused without dependency installation. The owned HTTP servers and browser contexts were closed after receiving; no live estate service was altered.

The unchanged native Python CLI actually generated the fictional Rosa response for these checks. Its output is retained as native-result.json, including the original normalized profile and full response. The unchanged saved-week writer created the actual files given to the browser file inputs. A separate actual no-match CLI invocation produced the empty-result case. Chosen December/January visit dates, received/saved timestamps and calendar identity in the test inputs are fixed authored test values, not assertions about when a provider answered.

The baseline demonstrates the missing user capability: it displays the expected actual-plan comparison but has no revision-brief download. Candidate receiving then verifies the downloaded UTF-8 artifact itself, its generated filename, exact date transitions and original explanations. It exercises repeated venue occurrences, a chosen-week shift across New Year, all-off/no-change/empty sources, source-identity refusal, pending/clear/newer-selection retirement, malformed/invalid-UTF8/oversized replacement, Unicode/markup-like multiline fields, and keyboard download at 390px width.

The held File.arrayBuffer promise is an explicit authored asynchronous test seam. Repeated and literal-name cases are explicit synthetic source edits. These are not independent provider responses.

Candidate receiving recorded zero page errors, zero external request attempts, zero /api/ requests and zero observed browser-storage writes. It served only the eight pinned static inputs. It does not claim a FastAPI deployment, a live provider test, a calendar-account import, an OS-level network capture or measured caregiver outcomes.

Desktop and mobile screenshots were visually inspected. The new action and helper/status text are readable within the existing layout. The original comparison table keeps its existing horizontal scroll region on narrow screens.

## Independent consumer receiving

The independent LA7 teammate read the exact earlier.json and revised.json files and froze its date/occurrence expectations before exposure to the downloaded output or formatter source. It then separately received the actual first download through an authored native checker. It verified each changed occurrence's quoted name, kind, entity ID and JSON-decoded original explanation, exact civil dates, counts and source/copy boundaries. This was accepted without blocker.

The review is an independent input/output acceptance. It is not a second browser execution or full-source review. The unchanged reviewer files preserve that boundary and their exact input/output hashes.

The root teammate separately read the complete new formatter, narrow UI/page additions and unchanged codec/comparator. Its source review accepted the three exact runtime hashes without a blocker. This is separate source acceptance, not another browser run. The durable root-source-review.md records the reasoning and boundary.

## Artifact example

The first native-plan pair changes original pick 1 from Monday 2026-12-28 to Tuesday 2026-12-29, schedules original pick 3 on Sunday 2027-01-03, and keeps original pick 2 off the revised week. Two other original occurrences remain unchanged. Four visits are scheduled in each copy. browser-candidate-1/download-1.txt is the actual downloaded handoff, not a formatter-only reconstruction.

All text taken from filenames or pick fields is quoted in the plain-text artifact. Embedded newlines/control characters remain escaped data; Unicode is otherwise preserved. No HTML is emitted or evaluated by this formatter. The brief retains explicit fictional/live/unknown source labels and the distinction between saved heuristic explanations and a new check.

## Replay

From the native checkout:

~~~sh
node --test tests/test_week_change_brief.mjs tests/test_week_compare.mjs tests/test_week_file.mjs tests/test_week_plan.mjs
node --test tests/*.mjs tests/*.cjs
~~~

For actual-browser receiving, set TASTETABLE_PLAYWRIGHT_PATH to an available Playwright ESM entry and TASTETABLE_CHROME_PATH to an installed Chromium binary, then run:

~~~sh
node tools/check_week_change_brief_browser.mjs /absolute/owned/new-output-directory
~~~

Use a new output directory to preserve prior receiving attempts. The tool uses an explicit download directory beneath that output root. TASTETABLE_RECEIVE_ROOT may point to an exact canonical baseline checkout, with TASTETABLE_RECEIVE_BASELINE=1 for its missing-capability witness. The receiver itself remains the authored candidate tool; source inputs and their hashes make that boundary explicit. Python is required only to execute the existing native mock planner used by this receiver.
