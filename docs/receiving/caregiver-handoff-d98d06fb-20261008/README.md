# Editable caregiver handoff — held source custody

This branch carries the #55 implementation and its exact receiving history. **The complete physical browser gate is still pending.** The source is available for the existing project receiver and later owner composition. PR creation, main updates, merge, deployment and Actions remain held.

The candidate adds **Save caregiver handoff → Open caregiver handoff → review → Replace week and notes** to the regular planner. It packages the existing saved-week-v1 and venue-notes-v1 objects in one versioned local file. Both complete sections and their original accepted-plan binding are validated in a separate worksheet model. Only explicit, still-current replacement commits the prepared week, original inputs and complete note set. An empty incoming set clears current notes at that step.

## Source and parent

- Original native receiving base: `328df51af830e91f304417a66d74f43d94ae0c02`, tree `df0251092f77d96169daa097abaec409ecabe6ba`.
- Custody parent: `145d27981b3c5fe6afa72e205b42582fd72c7734`, tree `71f2c5b144e2a54787cb92b37d6e639bbfef6ba6`.
- Branch: `work/astra-caregiver-handoff-custody-d98d06fb-20261008`.
- Since the native receiving base, current main adds 19 native plan batch paths and 13 visit-record CSV paths and changes README. This custody tree retains all 32 additions and the complete current README, with the caregiver paragraph added. All existing planner runtime files and workflows are unchanged from the original receiving base; the new visit-record CSV module is retained.
- The four product runtime files and the model gate retain their exact native candidate bytes. The browser receiver has separately attributed v2/v3/v4 corrections below. The original native README is retained under `native/README.candidate-v1.md` and remains pinned in its source manifest; the custody README composition is strictly additive.
- The prior session's approved #55 scope was recovered; no earlier candidate or browser execution was recovered. All runs below are newly identified attempts.

[CUSTODY-MANIFEST.json](CUSTODY-MANIFEST.json) lists every owned payload with byte length, SHA-256 and Git blob identity. The source envelope, native codec limits and user workflow are explained in [CAREGIVER_HANDOFF.md](../../CAREGIVER_HANDOFF.md). [COMPOSITION.md](COMPOSITION.md) gives the exact pending owner seams.

## Recorded qualification

| Receiving | Exact outcome | Boundary |
| --- | --- | --- |
| Original native model gate | 32/32 pass | Existing week, worksheet and companion tests on unchanged 328df source. |
| Original physical browser | 4 groups pass | Actual separate week/notes downloads, fresh-page chooser/replacement and original missing combined controls. Source unchanged. |
| Candidate model gate | 40/40 pass | Eight new handoff boundary cases plus the 32 maintained cases; both native codecs unchanged. |
| Independent source review | No blocking source finding | Isolated complete admission, pure preparation, explicit synchronous replacement, empty set, generation/read invalidation and existing-flow preservation. See [source-review.json](review/source-review.json). The receipt covers the unchanged seven native product/doc/model files and the historical v3 receiver; v4's receiver-only delta is recorded separately. |
| Candidate browser v1 | Failed after 4 completed groups | Existing note entry and separate saves, plus the combined physical save and literal review/cancel, completed. The receiver then waited for the wrong date-error text. |
| Candidate browser v2 | Failed before page creation | No DevToolsActivePort within the inherited 12-second startup window; zero requests, choosers or product checks. Source unchanged. |
| Receiver v4 | Unexecuted | Corrected native path and literal-filename handling for the existing Windows receiving surface. The complete 14-group gate remains pending. |

The v1 negative file was refused by the maintained calendar validator with `Choose a valid calendar date for your week.` Its diagnostic records `accepted:false`; the receiver expected the shorter fragment `invalid date`. v2 corrects only that expectation and captures UI details on failure. No product code changed.

v2's exact owned profile was absent after completion and no browser process matched its exact user-data directory. No process was killed or changed during the diagnosis. A later fresh check found free memory below the unchanged 1.5 GiB reserve, so no further ThinkPad browser was launched.

v3 uses `node:path.basename(file)` for its held-reader filename instead of splitting only on slash. This supports the existing Windows file path representation. v4 changes the authored literal filename to `handoff-&lt;literal&gt;-海.json`, avoiding Windows-forbidden angle brackets while retaining a literal entity/Unicode filename check. Unchanged note text still contains actual HTML markup. The v1, v2 and v3 executable receivers and all failed-attempt records are retained. No product code, startup window or resource reserve changed.

The desktop review screenshot was visually inspected. Complete physical Apply, stale-reader, fresh-page restore, empty-set replacement, final phone and print acceptance remain pending; completed early groups do not establish those results.

## Remaining physical receive

The existing native Windows contributor `chatgpt:c77045b4:windows` owns the complementary #54 readable companion handoff, with its already available desktop/phone/print surface recorded in that project scope. #39 previously records native Node 24 and Chrome 154 on that surface. The receiver must record its actual current runtime and resource admission before a new attempt.

Use the frozen v4 program in `tools/check_caregiver_handoff_browser.mjs` against this exact custody source in a new, exclusive output directory on the same owned volume as the project, using the owner's already installed Chromium-compatible browser:

~~~text
node tools/check_caregiver_handoff_browser.mjs --project <exact-custody-source> --output <new-owned-output-directory> --browser <already-installed-browser>
~~~

This is a new, explicitly identified receiving attempt. Preserve its command, source/fixture hashes, actual outputs, failures and closure status. The earlier completed v1/v2 failures remain historical records. No unknown browser attempt is to be replayed.

The full 14 groups exercise actual keyboard entry, native file choosers and physical downloads; complete malformed/mismatched/UTF-8/oversized refusal; review/cancel/apply; exact calendar bytes across reopening; empty-note replacement; deliberately held actual file reads and competing sources; note/day/source/input/navigation invalidation; download retry; 390 px review; actual TXT and Chromium print outputs. The date-input event and one-shot download failure are explicitly authored receiving controls.

The runner requires 768 MiB free disk and 1.5 GiB free memory, uses the installed Node 22+ WebSocket implementation, and retains its startup and artifact limits. A failed reserve or unavailable surface leaves the receive pending. No new runtime, credentials, resource workaround or blanket cleanup is part of this handoff.

The browser serves exact project static files and authored local health/persona responses. Its original saved-week input is the unchanged retained native artifact at Git blob `8b14090030201d6e8d69cd5bca380a9a71a4da0d`. This invocation does not run Python plan generation, FastAPI or a provider. It keeps local GET traffic, empty automatic browser storage and literal file text under observation.

## Actions and integration boundary

All three workflows at the custody parent were inspected by exact blob:

| Workflow | Blob | Trigger relevant here |
| --- | --- | --- |
| ci.yml | `0e6273139a9bf417a4ee42f4501d067b1c9d95a0` | Main push; pull_request. |
| native-plan-week-browser.yml | `d674f2698d1b048075a1c49c2035b1096be668f2` | Main push or pull_request with path filters including static files. |
| week-compare.yml | `e591fca2db970460611269ad7d1c53a6bc70f028` | Main push or pull_request with static/test path filters. |

This new custody branch has no PR. Its ordinary non-main push does not match these predicates. Recheck the actual ref, workflow tree and PR state before another write; preserve required gates while their execution is held. Absent CI has no passing status.

Raw native records are under [native](native). They include the original contract, source receipt, model outputs, original browser result, both failed candidate results, exact diagnoses and the historical continuity status. Their original paths and timestamps remain unchanged.
