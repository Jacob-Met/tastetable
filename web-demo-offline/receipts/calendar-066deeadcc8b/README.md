# Offline calendar export: publication continuation

This draft preserves the accepted calendar source and both complete author packets for [TasteTable issue 34](https://github.com/Jacob-Met/tastetable/issues/34). The independent receiver's complete raw packet has not yet been transferred and committed. Keep this pull request in draft until that evidence dependency and the normal exact-head receiving checks are resolved.

## What the feature does

The offline studio previews the events for the exact displayed week and offers an explicit **Download calendar (.ics)** action. It uses the unchanged `static/calendar.js` writer, copied byte for byte into the offline package. Dates, omitted picks, venue descriptions and demo source labels follow the existing retained plan and arranged week. All-day events retain exclusive end dates. The download is a local artifact; this change does not post events to a calendar service.

The retained calendar identity survives a repeated export and Save/Open. Same-week moves, omissions and Undo/Redo retain each pick's identity; another week has different event identifiers. Invalid dates and a replacement source retire stale previews. The original receipt time supplies DTSTAMP. Existing saved-week and arrangement-history code remains unchanged.

## Exact source and current parent

The source was natively qualified in a partial runtime/test projection at `64171a6690b141ddbd9c430baa315bee38c5e743`, against canonical parent `e0f6fbaf1f81fbb1e9926948294549c744228def` (tree `57b0980e39489d48a9bea5c89ae4d463c97944b8`). The complete 56-file projection and the ten-file source scope are recorded in [current-author/frozen-source.json](current-author/frozen-source.json), SHA256 `81d7e62583bc13a3f9398b010ccf2ff8055c18fc04999f5a27e9573e9660f36c`.

The publication parent is `2b347cee4ff4e2b806362730a8520a3360b45f5a`, tree `66d62a724c1667913cb581fb35e4b6db6111dae8`, which merges PR33's venue follow-up work. Direct complete Git-tree comparison finds 579 parent blob leaves, four changed existing paths and 145 added paths since the qualified parent. The four changed paths are the root README, `static/app.js`, `static/index.html` and `tools/check_native_plan_week_browser.mjs`. Every one of the 77 previously existing `web-demo-offline/` leaves is identical, including its modes. All 46 unowned files of the qualified source closure and all six existing scope beforeimages match this parent exactly. The static calendar writer remains Git blob `dbed22d2cb91090bccec9472fbffd2854eed2722`. No AGENTS.md exists in the complete publication tree.

This is a source-composition check. The earlier Mac application runs remain attributed to their recorded parent; no new application run is claimed for PR33's separate venue follow-up changes. The overlay preserves the 32 frozen source/author paths unchanged and adds this continuation index. Its intended result is 33 scoped leaves plus all 573 unowned current-parent leaves, with the parent modes preserved.

## Preserved author evidence

- [Original author packet](original-author/README.md): eight ordinary files. Receipt SHA256 `1f1fcfa7fb88ecf3a0602ff7aae35065722c5289bef46ac1819d1d4b85a85542`; raw archive `399c8cf82d10aedae17806dc9b8e1bf1f2b74c3170bf15333756d1a827641f64` contains 105 ordinary members.
- [Current history composition](current-author/README.md): fourteen ordinary files. Receipt SHA256 `ece6ae5391cbe509473ca73cf78dea7ab45a79cb50629cd21c40aa5821af2ff4`; raw archive `27b6d0b1dfb5b0a0117fbfba5e44f639b01789022891c781d5c14d22eb6bdaf0` contains 131 ordinary members.
- Current author execution includes 69 native test methods; the unchanged full calendar browser criteria (12 groups, 73 checks, 19 actual downloads); a focused history run (19 checks, 16 downloads); the 42-file static receiver with 84 exact HTTP comparisons and rollback; and a fresh extracted-package run using Python's HTTP server (7 checks, 3 downloads).
- The current verifier recomputes 38 actual downloads: 21 ICS and 17 JSON, including 97 complete event records. Both standard-library verifiers retain their original byte-identical outputs and their source, report and archive bindings.
- The original operational failures and the current verifier's command-binding correction remain in their respective packets. Those corrections do not alter product source or reattribute failed preparation as a passing application run.

The downloadable ZIP has 42 members, 108,205 bytes and SHA256 `024f2787700897d7f96b9289390d054603b54edad42df6db2cd9284137852392`.

## Independent receiving dependency

The independent receiver reported acceptance of the original source after 48 actual-record API cohorts, ten refusals, three deliberately wrong-calendar controls and eight browser groups with thirteen actual downloads. It separately reported acceptance of the unchanged current history composition after five browser groups and fifteen actual downloads, including exact Undo/Redo calendar bytes, omissions, changed-week identifiers, invalid-date restoration and pending import cancellation. The original API/browser suite was not repeated for that supplement.

These are reported execution results; this draft does **not** claim that the receiver's raw packet has been transferred, sealed or included here. Its Mac host became unavailable before that handoff completed. The initial no-request browser launch failure and later instant-scroll visual captures must remain separately attributed when the receiver's packet is available. A distinct second-platform receiving run may supplement the retained results, with its own source, runtime and raw evidence.

Before merge:

1. Commit the complete immutable independent receiving packet or an explicitly qualified replacement/supplement with honest custody limits.
2. Verify the final current-parent source composition, exact candidate tree and every unowned leaf.
3. Inspect the actual hosted checks for the final head.
4. Use the normal expected-head merge and preserve its exact parents, tree and final receipt.

No independent evidence file is represented by a placeholder.
