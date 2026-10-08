# Independent TasteTable venue worksheet review

The bounded receiving review is complete. The unchanged focused browser probe passes on r4, including the rejection notice, the earlier question/reply context, print formatting, the downloaded handoff, and explicit reply rebinding. The original r2 and r3 failures remain unchanged in this packet.

## Results and source boundaries

| Retained run | Source parent | Result | Meaning |
| --- | --- | --- | --- |
| Original r2 model probe | 0758d2cc | 1/4 pass | Three assertions expose the one missing editable-question capability. |
| Original r2 browser probe | 0758d2cc | 5/7 groups pass | Missing question editor and leading-line-break loss are reproduced in actual Chromium. |
| Unchanged r3 model probe | 0758d2cc | 3/4 pass | The remaining assertion assumes an unsafe status write is accepted. The implemented refusal is stronger and is validated separately. |
| r3 status-refusal model supplement | 0758d2cc | 1/1 pass | Refusal is atomic; a next-step edit cannot rebind the old reply; an explicit reply edit can. |
| Unchanged r3 browser probe | 0758d2cc | 6/7 groups pass | The remaining assertion asks for an exposed textbox before opening the valid disclosure. The line-break check and the other five applicable groups pass. |
| r3 actual-disclosure browser supplement | 0758d2cc | 0/1 pass | After opening the disclosure, the probe reaches a real notification defect: the second event overwrites the rejection notice. |
| Unchanged r4 actual-disclosure supplement | d66ab91d | 1/1 pass | The notice persists, and the remaining question/reply print, download and rebind checks pass. |

These counts stay separate. The six unaffected browser groups were not rerun on r4. Of the 16 runtime files observed by the independent browser, only the worksheet module and the incoming native constraints.py differ between the retained r3 and r4 sources. The module delta consists of a comment and a control-event filter; the other questionnaire, note, source and scheduling logic is unchanged. The r4 probe exercised the actual current native mock app.

## Consequential findings

1. **Editable questions were absent in r2.** The repair adds per-occurrence/date question editing and preserves the earlier question snapshot when a recorded reply no longer answers the revised question.
2. **A leading line break was lost when a reply was rendered again.** The r3 browser replay confirms that moving a visit away and back, then editing its reply, preserves the original line break. The original r2 failure remains in browser-r2/result.json.
3. **The rejection notice was overwritten in r3.** Selecting Reply recorded after revising the question correctly restored Needs follow-up, but a paired change event replaced the notice with generic success copy. The r4 repair handles selections on change and textareas on input. The exact same supplemental probe now passes.

The original browser's closed-disclosure assumption is not counted as another product defect. The r3 supplemental probe uses an actual click on the visible Edit questions summary. Its first failing assertion concerns the overwritten notice, after it has checked the editor, earlier context and restored status. Later assertions in that r3 supplemental run were not reached; the r4 replay completes them.

## What the browser evidence establishes

The probes load the actual local FastAPI application in explicit mock mode and automate a private Chromium instance. The retained r3 groups cover occurrence/date/source binding; move, omission and restore; another week; duplicate venue IDs as distinct occurrences; fresh notes after Save/Open, repeated Open and a new accepted plan; retirement; literal text; and the call-sheet handoff. The duplicate saved file and intercepted replacement failure are explicitly authored controls. They are not represented as backend-generated outcomes.

The focused r4 control opens the named disclosure, changes a question after entering a reply, verifies the retained earlier context and persistent refusal notice, verifies that editing the next step cannot rebind the reply, checks actual print-media CSS and DOM, downloads the TXT file, and explicitly edits the reply to bind it to the current question. Its native mock response and downloaded file are retained byte for byte.

No live venue or provider calls, shared browser use, physical printing or PDF generation occurred. These are bounded functional cases using authored mock data, not evidence of recommendation quality, medical suitability or task benefit in use.

## Reproduction

Use the matching frozen source revision named by its owner manifest and by each result's sourceBefore/sourceAfter map. Each browser output directory must be new. The original probes intentionally keep their original nonzero results where the table explains them.

    node probe_question_receipt.mjs "$SOURCE_R2_OR_R3"
    node probe_status_refusal.mjs "$SOURCE_R3"
    node probe_browser.cjs "$SOURCE_R2_OR_R3" "$NEW_OUTPUT_DIRECTORY"

The successful focused r4 invocation uses the unchanged probe whose SHA256 is 4c173ace20bdbc775577ade4d85af7560d77cea23beb2c98c477daca32edfd15:

    TT_REVIEW_PYTHON=/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python3 \
    TT_REVIEW_PYTHONPATH=/workspace/scratch/60b2c08feb01/suite-venv/lib/python3.12/site-packages \
    node probe_question_disclosure.cjs "$SOURCE_R4" "$NEW_OUTPUT_DIRECTORY"

The probe also accepts TT_REVIEW_CHROMIUM and TT_REVIEW_PLAYWRIGHT when reconstructing the declared environment elsewhere. The retained run uses Chromium 153.0.8010.0 and Node 24.19.0. The r4 dependency preflight records Python 3.12.14, FastAPI 0.142.4, uvicorn 0.54.0, Pydantic 2.13.5 and Starlette 1.7.0, plus actual entry-point paths and hashes. Uvicorn, FastAPI and Starlette resolve from the read-only scratch installation; Pydantic resolves from the primary runtime. Matching reported versions do not establish a byte-identical third-party dependency closure.

## Retention and limitations

All 45 files from the original r3 retained export remain byte-identical; retained-file-map.json pins them. The r4-startup-blocked folder preserves the real missing-uvicorn startup after the former shared dependency path disappeared. That attempt stopped before browser launch and is not a product failure.

The packet also retains reviewer wrapper errors. One superseded-freeze preflight stopped before execution when the author-only browser driver changed. An initial completed r3 attempt hit an export-size guard before its inner results were retained; no result is claimed for that attempt. The retained r3 results come from the subsequent unchanged replay with lossless chunked export. The r4 preparation records include a helper-construction error and an overly restrictive dependency-origin check, both before browser launch. The successful runtime's mixed entry points are declared in r4/execution.json.

The final receipt names the immutable source pins, archives and limits. Historical receipts retain their original pins and outcomes; the r4 result does not relabel older phases as current-source qualification.
