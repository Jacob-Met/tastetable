# Venue questions and caregiver call sheets

This contribution implements [TasteTable #16](https://github.com/Jacob-Met/tastetable/issues/16). A caregiver can prepare editable questions for each scheduled visit, record a contact state, reply notes and a next step, then include them in Print week or a separate text call sheet. The original recommendation and heuristic explanation remain visible.

Questions and notes belong to one accepted plan, one pick occurrence and its exact date. Repeated suggestions for the same venue remain distinct. Moving a visit starts a separate note; returning during the current planning visit restores that date's note. Omitted visits are absent from the current handoff. Invalid displayed dates keep the worksheet unavailable.

When a question changes after a reply, the earlier question and reply remain together and the visit needs follow-up. A next-step or contact-state edit cannot rebind the old reply. The caregiver must edit the reply for the revised question before marking it Reply recorded. Returning to the earlier question removes the mismatch without inferring that contact is complete.

Notes stay in the current tab and planning visit. Source-input edits, replacement plans, opening saved files and leaving the page retire them. The interface explains this lifetime and provides print/download. Existing saved-week and calendar files exclude contact notes. A reopened saved week starts a fresh worksheet while retaining its filename, saved timestamp and unchanged-check label. These are caregiver-entered records; they do not verify nutrition, accessibility, availability, safety or reservations.

## Source and integration

The latest composition and maintained browser correction are recorded in [integration-02](integration-02/README.md). The source and publication pins below describe the initial r4 packet; the latest publication manifest accounts for current-main README/index composition and the receiver's new asset entries.

The seven final product/test files are pinned by [source-freeze-r4.json](source-freeze-r4.json). The native app adds six lines for import, mount, rendering, retirement, invalid-date handling and accepted results. Its index adds one section and stylesheet. The new module owns that section and its private in-memory records.

Author receiving used native parent d66ab91d62ba243cef2ba387cea73a684fa3b04e. Its incoming constraints.py correction (Git blob cab2cecbe4c3a6112022d194a927b9025ec67ab6) remained unedited. Main a77175501199ace765cb7ca57742b267351d3e79 / tree 2031698fbc8fcf94ad9af06117c2d9858bc83190 has the same 16 relevant parent blobs; root independently verified them and the absence of all four new feature paths. [The composition record](current-main-composition.json) is byte-identity evidence, not another execution of the full newer checkout.

Backend/provider code, constraints, calendar generation, the week model, saved-week admission/storage and the separate offline studio retain their existing source. Coordination: [saved-week owner](https://github.com/Jacob-Met/tastetable/issues/4#issuecomment-6059548484) and [HAMON topic](https://github.com/Jacob-Met/hamon/issues/140#issuecomment-6059565762). Every unowned path must be preserved against the actual integration parent.

The initial publication parent is 1a609bfdd77dc07222eb70f8a4a1f565a8bc8fa0 / tree ef80f9f0134d613571861278978477152548a5ed. Its #28 merge changed only the separate offline-studio files. Root verified all 16 native parent pins again; no native source or receiving dependency changed. The publication manifest records this later composition.

## Receiving results

| Receiving | Result | Evidence |
| --- | --- | --- |
| Original native baseline | Five scheduled picks and existing calendar/print controls work; the worksheet is absent | [Original result](author/before-native-result.json) |
| Final r4 model | 15 passed, zero failures or skips | [Model output](author/model-tests.stdout.txt) |
| Final native FastAPI and Chromium | 10 browser groups passed; zero page errors or external browser requests | [Raw result](author/final/result.json), [author receipt](author/receipt-r4.json) |
| Native source identity | All 16 runtime hashes unchanged during that run | Final raw result |
| Existing Save/Open | Original seven-key envelope retained, notes excluded, calendar bytes identical before and after | JSON and ICS files in author/final |
| Independent review | Original failures retained; unchanged focused r4 disclosure probe passes 1/1 | [Independent review](independent/README.md), [final receipt](independent/review-final-receipt.json) |

Author flows cover actual native nonempty and empty mock plans, unknown dietary checks, editable questions and earlier replies, literal text, phone layout, print media, leading newlines through textarea redisplay and subsequent editing, date/week/source boundaries, saved-file retirement and duplicate occurrence identity. Four responses came from the native mock planner; the fifth POST used an explicitly authored duplicate fixture derived from a native response.

The independent reviewer found the missing question editor and leading-newline loss in r2. R3 added the editor and prior-question relationship, assigned textarea values through DOM properties, and repaired long-token wrapping. A further actual-disclosure check found that a paired event overwrote the explanation for a correctly refused status change. R4 handles selects on change and textareas on input. The unchanged focused probe now completes the refusal-notice, earlier-context, print, TXT-download and explicit reply-rebinding checks. Six unaffected independent browser groups were not rerun on r4; independent and author totals are separate.

## Reproduction and limits

The final author run used Node 24.19.0, Playwright 1.62.1, Chromium 153.0.8010.0, Python 3.12.14, FastAPI 0.142.4, uvicorn 0.54.0 and Pydantic 2.13.5. Apply the seven final files to the declared native parent and use a new output directory:

~~~sh
node --test tests/venue_followup.test.mjs
TASTETABLE_PLAYWRIGHT=/path/to/node_modules/playwright \
TASTETABLE_CHROMIUM=/path/to/chromium \
TASTETABLE_PYTHON=/path/to/python \
node tests/venue_followup.browser.cjs /path/to/app /path/to/new-output
~~~

The Python interpreter must supply the native dependencies; TASTETABLE_PYTHONPATH selects an existing dependency directory when needed. The author driver starts the actual app in explicit mock mode, clears optional live model settings, uses a private browser profile, blocks external browser requests, hashes source before/after and closes its own processes. The independent README gives the separate unchanged probe invocation and actual runtime origins.

The older Python dependency path later lacked uvicorn. That failed peer startup is retained and made no product claim. The successful peer replay used an existing read-only dependency installation with declared mixed module origins. Matching version strings do not establish identical third-party bytes, and no replacement environment was installed.

The initial venue Node/browser receiving was executed explicitly. PR33 subsequently exposed a dependency in the existing hosted native-week browser receiver; [integration-02](integration-02/README.md) retains the failed job, two-path correction and fresh composed receiving. Hosted outcomes belong to the precise PR head that ran them.

[HISTORY.md](HISTORY.md) distinguishes real product failures, obsolete probe assumptions, startup failures and packaging limits. Raw observations remain unchanged. This selected text packet retains source, hashes, logs and literal downloads. Screenshots were inspected locally and remain ancillary; inventories can name their hashes without implying those PNGs are included.

Receiving used local fictional/mock data. Print checks used Chromium print-media CSS/DOM, with no physical printer, PDF generation or calendar-service import. No live venue/provider/account operation, deployment, medical suitability or designated-hub adoption is established.
