# Calendar export with the received arrangement history

This packet preserves the author’s current-source composition for TasteTable issue #34. It adds an explicit preview and calendar-file download to the offline studio while retaining the separately received Undo/Redo behavior from issue #32. The user chooses whether to import the downloaded file in a calendar application. These runs made only local static GET requests and local browser downloads.

The original feature source and its original author packet remain unchanged in the sibling original-author record. This supplement is qualified against canonical parent **e0f6fbaf1f81fbb1e9926948294549c744228def**, tree **57b0980e39489d48a9bea5c89ae4d463c97944b8**. The independent reviewer received the original source before this composition and owns a separate, bounded review of the current history interaction; this author packet does not stand in for that review.

## Source and ownership

The local current baseline projection is **a66f7d06c983411436498d37924f5eeaad7b0b1d**. The frozen candidate projection is **64171a6690b141ddbd9c430baa315bee38c5e743**, tree **b1b44d6ba387f203f7e2444b1695661ca3177b4a**. These are 52-file and 56-file runtime/test projections, respectively, rather than full repository commits. The complete canonical Git tree and fetched current source texts are preserved in the native archive. Publication must retain every other canonical repository leaf.

The complete 56-file source manifest is exposed as **frozen-source.json**, SHA-256 **81d7e62583bc13a3f9398b010ccf2ff8055c18fc04999f5a27e9573e9660f36c**. Ten repository paths change:

- The new consumer module, unchanged copied writer, writer-source record and focused consumer tests remain byte-identical to original accepted v1.
- The existing app, page, scoped stylesheet, README and static receiver carry the same calendar additions over the current arrangement-history source.
- The portable ZIP is rebuilt from the exact combined runtime.

All 46 current files outside those ten paths are unchanged. In particular, the arrangement-history implementation and its tests/browser driver remain the current canonical bytes. The shared writer is still Git blob **dbed22d2cb91090bccec9472fbffd2854eed2722**; the new offline copy is byte-identical to **static/calendar.js**. The saved-file codec, organizer, catalogue and all 24 captured records remain unchanged.

The complete five-file current-owner patch is preserved and recomputed by the verifier. Removing the calendar import, mounted consumer and three refresh calls reconstructs the current app byte-for-byte, including its history functions. Undo/Redo already finishes through the existing render function, so the calendar refresh follows its recovered state and literal date anchor. No history algorithm was rewritten.

The independent original source review remains bound to projection **e1babdbfa64b63fc1443f4efee44897681545c26**, whose complete frozen manifest is also retained in this archive. The consumer, writer, source pin and test hashes match that original manifest exactly.

## Actual native qualification

All commands ran on the already available Mac runtime with Node 26.3.0 and Chrome 154.0.8037.98. No dependency installation was needed. Each browser process used a private context and owned loopback server, and each server/browser was closed after its run.

| Actual boundary | Result | Retained evidence |
| --- | --- | --- |
| Native writer, calendar-week, catalogue, saved-week, arrangement-history and consumer tests | 69 methods passed; zero failures or skips | Full command, output and all 55 text-source hashes before/after |
| Original calendar browser criteria on the current source | 12 groups, 73 checks, 19 actual downloads | Complete browser report, files, requests, screenshot and command |
| Bounded history/calendar interaction | 19 checks, 16 actual downloads | Complete report, all downloaded bytes and fresh 375px screenshot |
| Static receiver and rollback | 42 files, 84 exact HTTP readbacks, then 404 after removal | Actual receiver receipt and invocation |
| Extracted portable ZIP through Python’s actual web server | 7 checks, 3 actual downloads | Server stdout/stderr, browser report, files and actual launch/teardown |

The full calendar browser driver has five mechanical changes from its original run: source root, output root, qualification-manifest path, parent label and source-count label. Reversing those five changes reconstructs the exact original driver, SHA-256 **ce45dbe00df827e5fff4d46beef1f03f64500920ac402947bbe16b65eb282489**. Its scenario criteria are unchanged.

The history run covers calendar preparation without an Undo entry; same-week moves; Undo and Redo returning exact prior file bytes; week-specific UIDs; invalid date drafts recovered through Redo; omitted visits and their restoration; retiring a pending saved-week replacement; and new-source identity/history reset. The original calendar run separately covers repeated export, fresh-context saved-file reopening, stale source and invalid date retirement, failed URL preparation with explicit retry, source changes during preparation, keyboard use, print behavior and mobile fit.

Across the three current browser runs there are **38 actual browser downloads**: **21 calendar files and 17 JSON files**. The standard-library verifier independently recomputes all **97 complete events** in those 21 calendar files against the actual downloaded saved records. It checks dates and exclusive all-day ends, week/pick UID identity, received timestamp, literal venue and entity identity, original day, arranged day, original explanation, every plan note, demo label, care cautions, and tentative/transparent/private fields. Its byte comparisons confirm all recorded Undo/Redo and Save/Open identities. Running the verifier does not create another download or application run.

Both current-source 375px screenshots were visually inspected: the action, demo statement, literal dates and venue names are readable and fit the viewport. Recorded geometry separately shows zero horizontal overflow. These captures are actual browser images, not renderings constructed by a reporting helper.

## The portable artifact

The current candidate ZIP is **108,205 bytes**, SHA-256 **024f2787700897d7f96b9289390d054603b54edad42df6db2cd9284137852392**, Git blob **100561cc6ba28292865061206185517163b54852**. All 42 members match the qualified source and the static receiver’s installed/read-back bytes.

The current parent ZIP is preserved unchanged: **98,872 bytes**, SHA-256 **911a41c71e19855a9759c2a9fceca17ba5e0ce59ed7cde3c7fd23c8b9f9ec979**, Git blob **6a8affc08decdc9510b00410e94efa1495520bd6**. All 39 of its members already matched the current parent source. The earlier 35-file stale package found during original v1 discovery belongs to the older 689ddc9a baseline and remains documented in the separate original author packet; it is not attributed to the current parent.

The final cold-start check extracted the actual 42-member candidate ZIP into an owned directory and launched:

    python3 -u -m http.server 0 --bind 127.0.0.1 --directory <extracted web-demo-offline>

The browser followed the actual selected loopback port after the server’s startup output. It arranged a week crossing the March daylight-saving boundary, moved one occurrence to Sunday, omitted another, downloaded four all-day suggestions, saved the prepared identity, and reopened that saved file in a fresh browser context. The second calendar file was byte-identical to the first. This route uses the documented Python server and its actual MIME responses; it does not substitute the custom author server used in the larger browser controls.

The server’s SIGTERM in the receipt is intentional teardown of that private server after the browser closed. It is not a product crash.

## Custody and verification

**native-current.tar.xz** is **500,316 bytes**, SHA-256 **27b6d0b1dfb5b0a0117fbfba5e44f639b01789022891c781d5c14d22eb6bdaf0**. It has **131 ordinary members**: a complete native manifest and all 130 listed artifacts. It contains the 56-file source, full primary-source carriers, original source identity, all current application reports/downloads/commands, exact package bytes, source proofs and screenshots.

Run saved-evidence verification without launching the application:

    python3 -B verify-current-author.py native-current.tar.xz
    python3 -B -O verify-current-author.py native-current.tar.xz

Both modes exit zero and reproduce **verification.json**, SHA-256 **fd3613b6d07921cbfe0a14ce2423b0bc305f82776f676d466e6c1be7f806db2f**, byte-for-byte. The verifier checks each ordinary archive member, complete manifest denominator, source hashes and Git blobs, current parent reconstruction, retained unowned source, all native/browser counts, actual file contents, all package members and all complete calendar events. It does not invoke app code, Chrome, a calendar provider or the network.

The history command captured its actual entry-point path, exit, times and raw log, but did not separately include an invocation-time driver hash. Its exact driver bytes are retained and hashed in the native manifest after the run. The other two browser commands also recorded the driver hash directly. The verifier preserves this distinction.

Three preparation limitations are retained explicitly:

- The first metadata-only source-freeze helper used an escaped backslash in its Git hash calculation. It stopped at the first canonical-file comparison before creating a Git repository or modifying source. The corrected helper uses the actual NUL separator; both the failure and corrected script are retained.
- The first saved-evidence verifier assumed that all three command receipts had a driver-hash field. The history receipt did not. The original verifier and complete failure output remain beside the corrected verifier, which binds that run to its actual entry point and preserved driver bytes. No application criterion, source file or captured run changed.
- Two small metadata writes encountered ENOSPC. Only three completed, owned installation/extracted-package duplicates were reclaimed after every byte matched the retained ZIP: 126 files and 2,675,883 file bytes. All original/current source, freezes, raw evidence, actual downloads, archives and peer directories were preserved. The before/after receipt is inside the native archive.

The ThinkPad was offline when the narrow native registry append was requested. Issue #34 remains the exact ownership claim, and root retains the pending native scope. This packet makes no claim of production activation, calendar import, venue booking, live recommendation or medical/dietary accuracy.
