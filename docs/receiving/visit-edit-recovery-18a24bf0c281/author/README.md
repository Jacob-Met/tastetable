# Visit-edit recovery — native author receiving

This proposal adds explicit **Undo change** and **Redo change** for accepted visit outcomes, dates and notes. It retains 20 changes within the current tab and preserves the existing saved-record model and CSV delivery.

The source is composed on TasteTable main `145d27981b3c5fe6afa72e205b42582fd72c7734` plus the exact retained CSV PR61 head `994c03aef94b711d6dcbbeb6bbbc6a4b85a6a3ad`. PR61 adoption and canonical integration are not implied. The CSV import, handler, button and existing eligibility assignment remain exact. The model, CSV renderer, week modules, CSS and workflows are unchanged.

| Receiving | Recorded result | Scope |
|---|---|---|
| Original actual browser | 15 of 16 predicates pass | Existing editing and physical JSON/CSV downloads pass; Undo/Redo are absent. |
| Candidate native Node | 12 of 12 methods pass | Immutable model composition, grouped edits, 20-change boundary, branching, exact strings, null/empty and reset. |
| Candidate actual browser | 23 of 24 predicates pass | Actual Undo/Redo, focus restoration and physical restored JSON pass. One author oracle wrongly required generated CSV save timestamps to be equal. |
| Corrected offline CSV predicate | Pass, one receiving invocation | The already downloaded files retain every stable cell. Each generated timestamp is canonical, consistent within its export and within the captured campaign bounds. |

The original and candidate browser campaigns each ran once. Chromium exited normally with known closure. The corrected CSV predicate was not a browser rerun. Its exact old/new mechanical inverse and original failed report are retained in private custody. The published successor browser driver is syntax checked; only its corrected pure CSV predicate was executed against those existing downloads.

All source and input bytes were checked before and after. The browser used an owned profile and loopback source server, blocked external requests, and made no provider or write request. Resource admission required 256 MiB available on the fixture volume, 128 MiB shared memory and 1 GiB effective available memory. A 20 MiB aggregate owned-file cap was monitored, with no hard quota or zero transient-overshoot claim. Profiles and all raw evidence remain retained; no evidence was deleted.

Public summaries below omit private native roots, device registrations and process identities. They retain the identities of the original raw receipts; they are explicitly derived summaries, not replacement raw logs. Private custody contains complete source, drivers, phase controllers, original failures, actual downloads, DOM and screenshots. The original source-module-only receipt lost during a volatile session reset was not reconstructed or rerun and is not used as this browser acceptance.

Independent recipient receiving is pending. Source installation, hosted Actions, provider operation and canonical branch integration are not claimed.
