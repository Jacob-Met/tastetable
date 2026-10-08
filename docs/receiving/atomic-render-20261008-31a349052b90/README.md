# Atomic-render source and receiving evidence

This is the immutable handoff for the staged-render supplement accepted for composition by the existing TasteTable organizer owner in [issue #4 comment 6056696310](https://github.com/Jacob-Met/tastetable/issues/4#issuecomment-6056696310). This branch adds only the receiving packet under this documentation directory. The application's source is unchanged from its parent main commit, `9f9105c29ab1a68a501b5f4c0b7180f0db968d38`.

## Download and inspect

The complete 43-member [receiver-packet.tar.gz](receiver-packet.tar.gz) includes exact baseline and candidate frontend source, the one-file patch, both unchanged browser runners, original and freshly repeated successful and failing controls, full DOM reports, and source provenance. Its SHA256 is `d4d02a047912358ccd76001d85969e495d9535ecbe6196b618efef07e153152b`; its Git blob is `a0e0a0b5186c67da058122e68c22e6579013e15f` (118,908 bytes).

Extract into a new writable directory:

```sh
tar -xzf receiver-packet.tar.gz
cd packet
```

The extracted `README.md` explains exact replay commands, source authority and limitations. [manifest.json](manifest.json) is an exact copy of the archive's manifest and records SHA256, Git blob and size for every other packet member. All 43 archive members were extracted in memory and verified against the frozen source; no browser profile is included.

The [one-file patch](patches/atomic-render.patch), [original browser runner](harness/review-week-browser.cjs), and [late-render runner](harness/review-week-late-render.cjs) are also directly reviewable here. Preserve these runners unchanged when authoring tests for the owner's broader composition. They use authored loopback responses and block external page requests.

## Source and result

The published organizer at the captured main has app SHA256 `cb666959df8a4921987e67b98efbeca0f0399502184f3743e732c7c295cfd395` (Git blob `fab0cb5398d3e6553373a99d9d56afa92f2bfcbb`). All four current frontend files were fetched at that exact commit and verified byte-identical to the previously reviewed organizer. The staged candidate app has SHA256 `376fb899f912b9e74b5869c0cc05eb863e86bc812602295f54af85802d15705c` (Git blob `9f5c4fb39138e07f7243b7aa073740ed66aee655`). Only `static/app.js` differs between the two archived source snapshots. Actual patch application reproduces every candidate source file exactly.

The candidate prepares all original-result markup and the entire next week view before committing response-dependent DOM or state. A malformed response therefore cannot mix new source evidence with a previously edited week.

| Fresh browser control | Captured main | Staged candidate |
| --- | --- | --- |
| Malformed notes after a valid locally edited plan | Fails: mixed visible plan | Pass |
| Original organizer controls, including 56 day moves | Earlier passing control preserved | 8/8 pass |
| Seven additional malformed-response histories | 6 fail; the existing early-failure control passes | 7/7 pass |

Every candidate malformed-response history permits local editing of the retained state and successful recovery to a fresh valid response. All five fresh browser runs report zero unhandled page errors and zero external page request attempts. Expected nonzero exits and complete failing evidence are retained. This receiving replay did not execute the Python backend or hosted CI.

## Receiving boundary

The composition owner retains application integration and is combining the calendar occurrence seam, the published lifecycle controller and this attributed supplement. No separate application PR is created from this evidence branch. The frozen packet captures authority before the later [calendar producer/backend explanation follow-through](https://github.com/Jacob-Met/tastetable/issues/4#issuecomment-6056817650); that additional owner scope does not modify this renderer evidence.

Combined calendar/lifecycle acceptance is still pending a frozen composed source pin. The broader lifecycle intentionally retires old results, week state, print state and export sessions on request start, input invalidation, cancellation and current errors. Its receiving tests must check that retired state cannot reappear or be exported, while preserving the legacy harnesses archived here. The present tests are not a general response-schema validator and do not establish calendar coherence, deployment or provider behavior.

See the original [repair handoff](https://github.com/Jacob-Met/tastetable/issues/4#issuecomment-6056277672) for attribution. The immutable containing commit, archive hash and source pins identify this handoff; any subsequent composition requires its own exact receiving result.
