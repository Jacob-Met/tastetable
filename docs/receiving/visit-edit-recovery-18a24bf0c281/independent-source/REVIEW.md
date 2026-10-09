# Independent source review — TasteTable visit edit recovery

Result: accepted within the reviewed source composition; no blocking source defect found. This is a read-only source review, not an additional native/browser execution, production adoption, or merge approval. The separately frozen independent browser receiver remains its own gate.

Issue: https://github.com/Jacob-Met/TasteTable/issues/70
Reviewed author publication packet: 253825 bytes, SHA-256 fec605baa1f6eb4ee8bada2dc80d4c2d26b0089813986447fe3c377e1f961fef. The packet contains 16 entries. Only the three production sources, guide, README and source metadata were read for this audit; author test implementations and browser predicates were not used as independent evidence.

## Exact composition

Canonical main: 145d27981b3c5fe6afa72e205b42582fd72c7734, tree 71f2c5b144e2a54787cb92b37d6e639bbfef6ba6.
Retained CSV prerequisite: PR61 head 994c03aef94b711d6dcbbeb6bbbc6a4b85a6a3ad, tree 82a5b1f002284b34b2807ff965cfb736d02d1458; its direct parent is the stated main. This review does not relabel that prerequisite as merged.

| Production path | PR61 preimage Git blob | Candidate Git blob |
|---|---|---|
| static/visit_edit_history.mjs | New | 4f7ad84daa26198dfb7e787def085d563af72119 |
| static/visit_record_ui.mjs | bf37dae707f91781247d13685b44a63dccc12ad0 | fb2ab7743e0369e76fd84ee3dfd023de708d4c47 |
| static/visit-record.html | d65e132119dd543dfcd8d7513fd75eb2beaf0760 | a128989f95e7846d90bf6b3fd95815ac91dbd86c |

Candidate sizes/SHA-256, in that order: 2094 / eb4f3d9b101bfd8483dd43f5161d07b15a4fc7be05f922a29e0a826abf4c2fc2; 11976 / de5b41ea4f6921ed63ff250397e8ed0adbaec1c1ea8e9b182a1414e523254b82; 4734 / fb538ba2f96fb4c30ea5b53b4459d17c8d00fb0e23becf8046b27a80b8c726d2.

The original UI/page were independently fetched from GitHub at the PR61 pin. A direct PR61 static-directory listing binds all seven original source blobs. The five candidate support files were independently read, compared to original bytes and hashed to those canonical Git identities:

| Unchanged path | Git blob |
|---|---|
| static/visit_record.mjs | 2b5b37e3d4a227e00a5b0052a962d13512b53e48 |
| static/visit_record_csv.mjs | b001286f411bec6a9088b1902e9455f2fc3540c2 |
| static/week_file.mjs | 420ddb8f63fca264dcf97be7147801105696155d |
| static/week_plan.mjs | 8ed28163e0273c510fdd8e6f7c5d1c8476efb862 |
| static/visit_record.css | cf2ed8fc0871196a55ceef4e0aa0cab09d1fcfeb |

## Scope and owner preservation

An exact textual inverse of nine UI change spans reconstructs the complete 10229-byte PR61 controller (SHA-256 717be547c5833c1baca6f5b9c79791b28c3928dfcefe48666eeabf97a7a63836 / bf37dae). Removing only the two recovery buttons and help paragraph reconstructs the complete 4338-byte PR61 HTML (SHA-256 a9b59ef15324068998a8fa23c6c745329b036f40e7210bd92f3747538d9721f4 / d65e132).

Separate exact comparisons cover the CSV import, eligibility assignment and whole download handler; JSON download handler; Print handler; generation retirement function; and picker/cancel handlers. The full HTML inverse includes unchanged CSV control/help and all original labels. The renderer itself is byte-identical. The capture-phase history closure added for button actions does not replace any retained download/print handler.

README c0ebf40a3b97f3efedffbc85561a6af153cc97ef -> 1691e9f6715c66cd0932815f258f3804cff1dd4c is exactly one additive 346-byte recovery subsection; deleting it restores the full prior README. The new guide is blob 7f89202e224f5e06ebd4cac86e78344642b5bbed. The 16-entry publication whitelist introduces no model, codec, renderer, stylesheet, provider, dependency or workflow replacement. This is a packet-scope observation; a future complete-tree publication still needs its own preservation check.

## Receiving-side source conclusions

1. Validated snapshots: UI lines 89–92 call the unchanged full-record validator before history admission. Its returned records are recursively frozen. The helper stores those complete records, never raw form controls, and documents that validation belongs to the model. Its structural equality includes exact source name/week text and every occurrence key, outcome, date and note.

2. Grouping and order: date/note inputs use the same field target until blur or an explicit button action closes the group. Outcome changes close immediately. Targets include occurrence keys, so repeated venue names are not conflated. At commit the oldest past entry is removed above 20; Undo first closes any active group, so the active change cannot create a 21st recoverable entry.

3. No-op and branching: an exact return to the group's starting record does not push history or clear future. An actual committed change clears future; redo is unavailable while a real active change exists. Undo/Redo transfer full snapshots and preserve their affected field target.

4. Invalid drafts: validation throws before admission. The existing invalid map retains the actual invalid field text in the DOM, and the new controls plus recover guard block recovery until corrected. The visible help explains this restriction. A blur may close earlier accepted changes, but it does not admit or silently discard invalid text.

5. Import lifecycle: starting an open closes the current edit group without resetting history. Selection, cancellation, failed reads and unconfirmed previews preserve it. Only successful explicit Use resets history, even for an equal record. Recovery calls the unchanged retire() before restoring a snapshot: it increments generation and clears pending preview. The existing post-await version checks prevent an older read from later becoming applicable.

6. Literal data: undo/redo restores the frozen model rather than reconstructing it from textarea values. Imported source text, BOM within that source, CR, CRLF, null dates, empty notes, sibling values and occurrence order survive structurally. Ordinary unrelated edits still read only the edited field. The unchanged model validates all snapshots without trimming or newline conversion.

7. Consumer semantics: JSON/CSV/Print consume the restored current model through their unchanged handlers. The exact null/empty distinction is a model/JSON claim: the existing CSV renderer intentionally formats a null date as an empty quoted field. Browser textarea display may normalize line endings; this review does not claim visual CR glyph preservation or raw imported JSON envelope-byte replay. Download timestamps remain the existing save-time behavior.

8. Accessibility: the new controls are native type=button elements with descriptive names, disabled state and aria-describedby pointing to visible help. Recovery focuses the affected field with preventScroll and restores viewport scroll; the existing polite save-status announces Undo/Redo. Existing field labels/error associations, 44px button minimum, focus-visible styling and responsive wrap rules remain exact. The code adds no global keyboard interceptor. Actual focus, keyboard activation and layout are the separate browser gate.

9. Session boundary: history is cleared on pagehide, with no local/session storage or backend added. This can leave a bfcache-restored model without history, consistently with the documented history ending when the page is left. Confirmed file replacement remains the sole ordinary data-replacement boundary.

## Review limits and custody

No candidate code was executed or evaluated; only source-string inverse/hash calculations ran in the review tool. No native files, source, browser, tests or workflows were changed or launched. The review did not read author tests or expand the independent receiver.

One first static inverse attempt stopped on a non-unique generic close-line matcher before any comparison result or native support read. It was corrected to match the unique async-open prefix; the candidate bytes and all criteria stayed unchanged. This was a reviewer extraction error, not a product failure.

The compact machine receipt records every inverse span and retained-span hash. This audit and receipt are held in review memory for root custody; no new native placement is claimed.
