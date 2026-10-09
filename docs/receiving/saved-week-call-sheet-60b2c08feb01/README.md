# Saved week and venue notes to a native call sheet

A caregiver can prepare TasteTable's existing plain-text call sheet from an explicitly selected saved week and its matching venue-note file, without reopening the planner or requesting another recommendation. The new command keeps the current scheduled visits, original explanations, source labels, questions, contact states and reply history. Earlier-date and omitted-visit notes remain in the original JSON files. See the [product guide](../../SAVED_WEEK_CALL_SHEET.md) for the command, admission rules, receipt fields and delivery limits.

This is the qualified source contribution for [TasteTable issue 67](https://github.com/Jacob-Met/tastetable/issues/67), based on commit `145d27981b3c5fe6afa72e205b42582fd72c7734`, tree `71f2c5b144e2a54787cb92b37d6e639bbfef6ba6`. The product fence is three new files; the existing saved-week and venue-note codecs, worksheet model, browser, HTML converters, planners, provider paths and workflows remain unchanged. The accompanying repository README pointer is additive.

| Qualified product path | Git blob |
|---|---|
| `tools/saved_week_to_call_sheet.mjs` | `0e676fa055446136af1edf371587546eaeb8415d` |
| `tests/test_saved_week_to_call_sheet.mjs` | `2e50563729878fe2a353b0cfad51970a78a5416b` |
| `docs/SAVED_WEEK_CALL_SHEET.md` | `48932d6929fd1b1416c68b78773b73bf9aec26a6` |

The wrapper uses the unchanged native readers and `createVenueFollowup`, then delivers exactly the model's UTF-8 text. It does not reinterpret matching filenames as shared origin, equate repeated venue names with one occurrence, or promote historical notes into current visits. Complete retained records are admitted before the scheduled-date projection. Empty matching notes use native defaults; a completely omitted week refuses.

The first authored candidate gate ran `node --test tests/test_saved_week_to_call_sheet.mjs` on the existing Linux Node 24.19.0 runtime: **16 passed, zero failed or skipped**, exit 0, empty stderr. Its exact command, source manifests and raw output are preserved in the author archive. No product correction followed this run. A prior guide-creation orchestration expression failed before reaching the controller; it neither created a product file nor executed product code.

Independent receiving used the previously frozen driver, oracle and selected I/O hooks. Its first candidate run passed **8 groups**, with **29 native CLI/fault subprocesses plus one import control**, exit 0 and empty stderr. The ordinary 1,539-byte TXT matched both independently handwritten expectations and the unchanged native pipeline; all 18 receipt fields matched. Cases retained Unicode text, distinct same-name occurrences, revised questions and earlier replies, explicit empty questions, and excluded historical records. Full-origin mismatch, inconsistent history, duplicate occurrence/date records and zero scheduled visits refused.

Further independent cases covered inclusive byte limits, a single BOM, malformed UTF-8, regular-file source symlinks, and existing regular, hardlink, symlink, dangling-symlink and directory destinations. Selected hooks demonstrably triggered changed-source refusal, a competing destination, pre-link staging failure, and failures after successful publication. Known refusal remained status 2 when its diagnostic failed; post-publication failures returned status 1 while retaining the complete TXT and a created-output warning. All checked inherited source hashes stayed exact. Controlled input and destination mutations remain recorded in their individual cases.

Two historical custody limits are explicit. The original discovery's 4,417-byte raw receipt was lost during executor reset before durable upload; its reported successful native observation remains a historical summary, not a recovered raw result. Separately, the initial independent calibration archive and raw records were lost before upload. The three receiver programs were recovered against their previously frozen identities into canonical `78eaf6bf` before candidate disclosure. Calibration was not repeated to replace those lost records. The successful candidate receiving has its own preserved raw receipt, process outputs, fixtures and hook observations.

| Artifact in this directory | Canonical Git blob |
|---|---|
| [public-contract.json](public-contract.json) | `935225216c18877c7c018858c1b80883ac832984` |
| [preparation-evidence.tar.gz](preparation-evidence.tar.gz) | `e8245fb5cea814579ae76707d94c070b5e3ec60a` |
| [author-native-evidence.tar.gz](author-native-evidence.tar.gz) | `90078e8dfdb6646d97fd102f33860152f2c173ff` |
| [independent-recovery-before-candidate.tar.gz](independent-recovery-before-candidate.tar.gz) | `78eaf6bf85de254d8320e7042b0b09cf6c2895b1` |
| [independent-native-evidence.tar.gz](independent-native-evidence.tar.gz) | `5b6655a020a367e757cec3bbdb65b3f7a67fc056` |
| [independent-review.json](independent-review.json) | `327dc45091874c872a2d31f19884e7ccaf234cb2` |
| [root-receiving.json](root-receiving.json) | Root composition and integration receipt; prepared separately |

The independent review approves the exact CLI and complete guide. Its 138-member archive preserves the executed evidence; the 10-member author archive preserves the focused maintained gate. These are Linux Node 24.19.0 results, not Windows, Node 22, every supported runtime, browser adoption, or full-repository qualification. POSIX-specific controls do not establish equivalent Windows behavior.

Source rereading is a prepublication byte check, not a lock. Delivery does not promise parent-directory durability or rollback after publication. TXT is a current-visit projection, not an editable backup, authenticated source, reservation or verified care assessment. No venue, provider or account was contacted; no runtime was installed. At this qualification checkpoint, PR/main integration remained held and root-owned, and no Actions run was triggered. Consult the root receipt for the later exact composition rather than treating source acceptance as an integration or deployment claim.
