# TasteTable common saved suggestions — public contract v1

Owner: estate-2d2d276bbccc / srs_integration. Independent receiver: root, candidate withheld until an independent oracle freeze.
Canonical baseline: Jacob-Met/tastetable main 145d27981b3c5fe6afa72e205b42582fd72c7734, tree 71f2c5b144e2a54787cb92b37d6e639bbfef6ba6, 818 leaves.

## Beneficiary and source boundary

A caregiver preparing an outing for several people can already generate separate plans and save each arranged week. The native batch guide explicitly does not choose shared venues. A separate local page will show which recorded suggestion identities occur in every explicitly selected saved week, together with each file's own occurrence, explanation and provenance. It is a read-only comparison of saved suggestions, not a new recommendation, common-availability planner, booking or verification.

The original strict readWeekFile in static/week_file.mjs and the original week model remain authoritative. savedWeekVisits from static/week_compare.mjs supplies exact arranged dates and original occurrence keys. All three modules remain byte-identical. No original app lifecycle, planner, model, provider, batch producer/reviewer, profile, venue-note, visit-record, calendar, history or codec is edited.

## Exact public API

New static/common_suggestions.mjs exports compareSavedSuggestions(entries).

entries is a dense Array of 2 through 6 objects. Each object supplies a string label and string text. Extra object properties are ignored. label is a display label, not an identity; empty labels, duplicate labels and repeated file contents remain separate source positions. Its UTF-8 encoded length is at most 1024 bytes. Each text is at most 2 * 1024 * 1024 UTF-8 bytes (inclusive), measured with the ordinary TextEncoder. Each text is admitted by unchanged readWeekFile, including its ordinary BOM support and complete original constraints/response/arrangement admission. At most 500 original pick occurrences per admitted source are accepted by this consumer. Refuse any unsupported count, sparse entry, wrong field type, size or native admission failure as TypeError or RangeError, with no partial returned result.

Return exactly these top-level keys:
- format: the string tastetable.common-suggestions.v1
- sources: ordered array of {index, label, snapshot}. index is the zero-based source position. snapshot is the complete value returned by readWeekFile: response, inputs, state, receivedAt, savedAt and calendarId. Original response fields and tool trace remain present, including model_message if the original response has it.
- matches: ordered array of {kind, entityId, occurrences}. kind and entityId are the exact strings in the matching native pick.kind and pick.entity_id.
- counts: {sources, commonIdentities, occurrences}, each a nonnegative integer. occurrences counts all returned matched original occurrences, not distinct files or people.

The identity key is the exact ordered pair (kind, entity_id). No trimming, case folding, Unicode normalization, label matching, fuzzy match, date or affinity matching. An identity is included once if and only if it occurs at least once in every admitted source. Matching does not authenticate the source or establish that identifiers in unsigned files refer to the same real venue. Source modes may differ; each remains explicit and no mode is promoted or combined.

Group order follows each identity's first appearance in source 0's original pick order. Every duplicate occurrence in every matching source remains present. An occurrence has exactly {sourceIndex, key, originalDay, day, date, pick}, with sourceIndex the zero-based source index and all remaining values from the unchanged savedWeekVisits projection. Occurrences are ordered by source index, then native original pick order. key is the existing pick-N key and is never used as cross-source identity. pick retains the complete original pick object, including literal name, why, affinity, fallback and any admitted additional fields.

All original suggestions participate, including picks kept off the displayed week. Their day and date stay null. Different selected weeks, differently arranged dates and empty plans are admitted: an empty intersection is a successful comparison with no matches. Dates are shown for context and do not establish simultaneous availability. No ranking by affinity or popularity occurs. The API does not mutate entries or share mutable data with caller inputs; separate calls return independent object graphs. There are no clock, random, network, filesystem or storage effects.

## Browser product

New static/common-suggestions.html, static/common_suggestions_ui.mjs and static/common_suggestions.css form a separate page, reachable through one additive separate-tab link in static/index.html and a README append. The page runs from an ordinary static HTTP server with the unchanged modules; it has no external assets, provider requests or automatic storage.

Start with two numbered source slots. Each has a native file chooser, a displayed accepted filename/status and Clear. Add source permits up to six slots. Remove source is available above the minimum of two. Slot position identifies the chosen source; filenames and repeated contents do not establish distinct people. Selecting one file captures at most the declared 2 MiB, performs fatal UTF-8 decoding (ordinary UTF-8 BOM interoperates with the codec), and fully admits it before replacing that slot's accepted input.

A malformed, oversized, undecodable or unreadable replacement leaves that slot's previous accepted file intact and shows a literal accessible error. It does not silently remove that participant. New selection, Clear, Remove and a newer selection retire older asynchronous reads; a late result cannot restore a cleared/removed slot or replace a newer accepted file. Clear removes the accepted source. Adding/removing a slot or selecting/clearing a file retires any previous comparison and download, including when a replacement later fails. A canceled native chooser with no selected file is a no-op.

An explicit Compare loaded weeks action is available only when every current slot is accepted and no read is pending. It compares the current 2–6 slots and shows complete result counts and each source's label/position, selected week, saved/received timestamps, mock/live/unknown label, original inputs/constraints and original plan notes. If response.model_message is a nonempty string, disclose it literally as recorded source text. This does not infer completion from pick counts. Source panels may use native details disclosures.

For each common identity, show its exact kind/ID, every source's distinct occurrences and literal names/explanations, original suggested day, current arranged date or explicit off-week state, and nullable affinity/fallback state. Different names or explanations for one matching ID must remain separately visible. No-common-suggestions is an explicit successful empty result, distinguishable from missing/unreadable input.

Download comparison JSON is enabled only for an accepted current comparison and downloads UTF-8 bytes JSON.stringify(result, null, 2) plus one LF, using a fixed harmless filename tastetable-common-suggestions.json. It is an inspection report, not a saved-week file and not an editable replacement for any source; keep the original JSON weeks. Exporting changes no accepted input/result. A failed preparation preserves the current comparison and allows retry. No export of a retired result is allowed.

The page supports ordinary Tab/Enter/Space controls, accessible labels/status, visible focus and a 390px-wide layout without page-level horizontal overflow. File-authored text is rendered literally through text nodes, never interpreted as markup. A Print comparison control uses the browser print flow only after a current result; print CSS exposes complete source and match details and hides input controls. Printing and download do not contact venues or change any source. No print-dialog completion or physical printer claim is made by source tests.

User-facing context must say these are unsigned saved suggestions; existing heuristic checks have not been rerun; matching IDs do not establish current suitability, shared availability, a reservation or medical/dietary advice. Mixed source modes remain visible. These statements explain the comparison's actual limits, rather than blocking ordinary use.

## Source fence and receiving

New owned product paths:
- static/common_suggestions.mjs
- static/common_suggestions_ui.mjs
- static/common-suggestions.html
- static/common_suggestions.css
- tests/test_common_suggestions.mjs
- docs/COMMON_SUGGESTIONS.md
Existing edits are one additive separate-tab link in static/index.html and one README append. Dedicated receiving evidence may be added under docs/receiving/common-suggestions-2d2d276b/. Existing unrelated leaves and all unchanged module bytes must be preserved. No candidate source exists at this freeze.

Author native checks will test this new API, source preservation and narrow UI syntax. Independent receiving freezes its own inputs/expected outcomes before candidate exposure, executes in installed native Node and an actual isolated browser, and receives physical chosen files, actual downloaded bytes, stale-read/refusal/clear lifecycle, duplicates, literal text, mixed source modes, empty intersection, keyboard and narrow pixels. Existing complete backend/model suites and other owners' receiving are not automatically replayed. Original failures remain separate from corrected runs.

Ownership coverage: all 71 current project issues/PRs; current batch #41/#53 and review #64 with its three fresh comments; complete canonical 818-leaf tree with no AGENTS.md; 970 readable top-level native coordination records at Conscience tip 5458 and the last 2000 event positions. Five oversized coordination records were omitted and are not considered abandoned. No matching shared-suggestion scope was found within this bounded coverage. Existing source owners, especially #36/#40/#54/#55/#56/#57/#60–71 and offline studio scopes, remain intact.

All three current complete workflow bodies subscribe to main push and/or pull_request, with no issues or issue_comment trigger. Current rulesets are empty. One project reservation may be posted after an immediate unchanged-base check. Source publication, PR/merge/dispatch and GitHub Actions remain held. All source, builds and artifacts stay in the unique Raider namespace; no ThinkPad writes, LA7 calls, provider/account operation or installed activation.
