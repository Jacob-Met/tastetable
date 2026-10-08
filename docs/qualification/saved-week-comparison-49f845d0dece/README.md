# Saved-week comparison — author qualification

The caregiver selects an earlier and revised saved-week JSON file in the separate Compare saved weeks page. Matching saved sources retain occurrence identity and show exact movements, inclusion and omissions; differing source/inputs/receivedAt/calendarId remain separate arrangements. The page reads locally and renders all file strings literally.

## Source custody

Original implementation native commit: 789d17b7c456581e09bed64a6b7aa84376dc84db on a77175501199ace765cb7ca57742b267351d3e79.
Current-main composition: c924cda40d0960d40f723a35ef84037110f06efc, tree b34300fc9caf62c2e1b309ae085dfa13d4e810d5 on 1a609bfdd77dc07222eb70f8a4a1f565a8bc8fa0.
The only intervening main change was the owner's offline Save/Open #28. All nine author leaves and served runtime/domain test bytes stayed exact; all 300 unowned current-main leaves/modes are preserved. source-composed.json gives SHA256/Git blobs; native-provenance.json retains original commit headers and source.patch the exact full-index production/test diff. Native author source remains in its own ThinkPad checkout.

The initial composition command stopped at a shallow-history boundary before any merge. The separate transcript records that failure and the bounded ancestry fetch; no unrelated-history override or owner source rewrite occurred.

## Executed gates

- node-first.log: new model plus unchanged codec/week suites, 28/28.
- node-all.log: node --test tests/*.mjs tests/*.cjs, 59/59.
- browser-first.log and browser/receipt.json: actual Chrome154 local browser, 9/9 groups. These were executed on the exact authored runtime blobs retained by the current-main composition.
- Original earlier/revised input JSON files and both actual desktop/390px screenshots are retained in browser/.

The browser receiver is tools/check_week_compare_browser.mjs. Run with Node22, an available Playwright package, TASTETABLE_CHROME_PATH set to installed Chrome, a short owned TMPDIR, and an output directory argument. Dependencies are reused; no project runtime dependency was added.

The author browser uses the repository's historical synthetic response fixture and the unchanged production makeWeekFile codec, not fresh FastAPI/provider generation. It verifies exact movement/date/provenance, chosen-week year boundary, differing-source nonpairing, repeated venue occurrences, literal text, malformed/oversized/invalid-UTF8 refusal and recovery, stale asynchronous reads, all-omitted/empty states and phone/keyboard interaction. The File.arrayBuffer hold is an explicitly authored asynchronous test seam. No API/provider/external request or storage write occurred. Independent receiving separately owns actual current mock planner-produced files, the existing planner nonmutation seam and final published correspondence; this packet does not claim those gates.

## Ownership and limits

Issue29 owns this read-only consumer and its dedicated additive Node workflow. Existing planner/controller, week model, saved-week codec/schema, calendar writer, backend/check/provider source and offline studio are unchanged. #16 keeps its venue worksheet hooks and visit-only notes. Opening the chosen file in the existing planner remains an explicit later action. Comparison does not authenticate file provenance or rerun venue checks.

The feature source is frozen for independent receiving. Hosted CI and final acceptance are recorded separately at the actual publication head.
