# Regular planner Undo receiving — 2026-10-08

This packet receives [issue #40](https://github.com/Jacob-Met/tastetable/issues/40) on exact main `2b347cee4ff4e2b806362730a8520a3360b45f5a` / tree `66d62a724c1667913cb581fb35e4b6db6111dae8`. The regular planner can recover up to 20 complete arrangement changes within one accepted source. No offline-studio source, worksheet module, scheduler, codec, calendar writer, backend or provider code changes.

## Exact published scope

| Path | Git blob | SHA-256 |
| --- | --- | --- |
| `static/arrangement_history.mjs` | `7a42cb267adaab3db966d02b59326ac6fb8f0426` | `3437096ec4792ce8b2014d37033f1decc516a11434e254da510d4813a4582d2a` |
| `static/app.js` | `2123692c5a1f3a6db12d7a48b380b41342967790` | `8709832ca55b3daa4545d514e9dea825bcdbb7df4d7d236e3a9a5354e7900b8c` |
| `static/index.html` | `850e8c8f479e15096cffba53bdbcbc16b7cd0e6c` | `5ad8a050ebba636f44333e10877c1db1c14e01987863786ddc9fbdc08b7fb593` |
| `tests/test_regular_arrangement_consumer.mjs` | `a07dfe17d4be6af173a0cfdfa10692f6b08f4d37` | `851dbb347195265555bddc78f4ce913d68a92e0037039d01f490e41c8635d1c7` |
| `tests/test_regular_arrangement_history.py` | `2129cf800ffd4901315eb8145c598d884da65cf8` | `fcdd91e36a5ae4fb2160a454d0e2c870fdfee18f0e900469d66e6f8bb775209c` |
| `docs/REGULAR_ARRANGEMENT_HISTORY.md` | `7d77e8d3c385d3465b9dc84021c5d71d35a15678` | `d6152250a4895ab612d0131774f3e780ec9265ced2495944d71e1e9caa363e38` |

The final guide differs from the frozen author guide only to record completed receiving and its limits. The three runtime files and both maintained test files are the exact qualified V1 bytes. All published paths use non-executable Git mode `100644`. ThinkPad's actual copied files had POSIX mode `0664`; the final audit records it and checks the Git execution bit without relabelling the native mode.

## Immutable material

- [packet-v1.zip](packet-v1.zip): **937,152 bytes**, SHA-256 `9c201826d5ff271c9beaf02f6e2f78bea84fd472be09ef05a4fb44e3d6ef5ae6`, Git blob `22f5ba051a1ce6a5951d3139bfecbe9cba131373`.
- [packet-v1.manifest.json](packet-v1.manifest.json): **15,302 bytes**, SHA-256 `9fc2c9bbd4459339e20597d98bdca2ac2935b777c1c22050ed685cfe07e14de2`. All 64 payloads plus the embedded manifest (65 archive members) were individually checked. The nested author archive has 42 exact original members.
- [Independent browser evidence verification](browser-evidence-verification-v1.json): exact root-authored **1,766 bytes**, SHA-256 `7b957824b4030a02088aa6dcca289cf3bb8c37caefb7ec0dd32deda4b47b7e11`. Independent source approval and its exact verification JSON are also preserved verbatim inside the archive.

The independent reviewer also received the complete outer and nested archive memberships, not only summary hashes. Its durable packet-verification receipt SHA-256 is `01638b933e68dc4ff88eead6e6303424878055a8383e127ca867b453a31f36fb`; that later receipt is not represented as an archive member.

## What ran and what failed

The authored native Node consumer receiver completed **8/8 groups**, with exact before/after source maps. It exercises the real app modules, week model, codec, request controller and calendar writer with explicitly declared DOM/worksheet/transport doubles. Both original failing baseline runs and the initial wrapper diagnosis are retained in `author-local-v1.zip`; the corrected wrapper passes.

Actual Chromium **153.0.8010.47** / Node **22.22.1** ran the unchanged app and real worksheet from a unique ThinkPad source/profile and an authored loopback fixture server:

| Subject | Observed result | Disposition |
| --- | --- | --- |
| Browser V1 | 2 completed groups; overall exit 1 | Receiver pointer missed a select after the baseline app's smooth scroll. Original focus/frame/raw error retained. |
| Browser V2 | 6 completed groups; overall exit 1 | Pointer helper alone gained instant scroll, two animation frames and a hit check. All product groups completed, but the final URL assertion omitted Chromium's inline calendar SVG. |
| Recorded audit r1 | Failed | It incorrectly required native POSIX `0644` instead of the non-executable Git mode; native files were `0664`. No source permission was changed. |
| Recorded audit r2 | **5/5 passed** | Checks exact SVG/network records, all 15 source pins, eight physical outputs, four frames and owned browser/profile cleanup. It launches no browser and does not rewrite either raw report. |

V2 repeated the first two groups before the parent's tail-only steering arrived; that repetition is retained accurately. No browser interaction was rerun for the final evidence audit.

The six observed groups cover real saved-file admission, physical JSON/ICS/call-sheet downloads, whole-arrangement reset recovery, exact original response/input/calendar identities, occurrence/date-specific notes, same-week/no-op Redo, invalid-date recovery, keyboard flow and non-overlapping controls at desktop and 390 px, failed Open, changed-input retirement and a fresh history after reopening a physical saved copy. The recorded network comprises 14 allowed loopback GETs and one exact inline two-path calendar SVG; no external HTTP request, provider or account action occurred. All 15 input maps remain exact.

## Qualification limits and owner boundaries

Date values are supplied through native DOM input/change events, not an operating-system date picker. The ordinary Print handler uses a capture sink plus actual print-media worksheet projection; no operating-system print dialog or paper is claimed. Downloads are actual files read back through the real codec and exact byte comparisons.

Current worksheet mount/accept/sync/retire calls remain unchanged. Availability #36 retains its algorithm/proposal/Apply and preview binding: a future complete Apply through `renderWeek` is one history entry, and its future normal refresh must retire stale previews. The venue-notes companion retains its separately claimed snapshot/replace/file controls. Neither unpublished feature is included in this qualification. No future-owner source was copied or modified.

The published draft still requires its ordinary exact-head CI and root integration. Neither of the overall failed browser processes is presented as a green run; acceptance is the six recorded interactions plus the separate successful evidence audit and independent review.

## Publication parent readback

Before creating the draft, main advanced to `0f1316eed24611345e722a9938db8ce03c181404` / tree `d9a2cc503ac66d195f93a239ec7eeb1e9f56b955` with 743 leaves. All nine original source inputs and both browser style dependencies still have their qualified Git blobs and modes; all eight new contribution paths remain absent. The draft applies this same ten-path scope to that current tree, preserving all 741 unrelated leaves. Newly landed caregiver-brief, offline-calendar and standalone-HTML work is retained in full. No native receiver was rerun for those disjoint changes.
