# Common saved suggestions

Use this separate page when you have saved TasteTable weeks for two to six chosen plans and want to see which recorded suggestions occur in every file. It keeps each source's explanations, arrangement and provenance beside the match. Files are read locally in the page; there is no upload, provider request or automatic storage.

## Open the page

From the repository root, start an ordinary local static server:

```sh
python -m http.server 8768 --bind 127.0.0.1
```

Open `http://127.0.0.1:8768/static/common-suggestions.html`. Use an unused local port if 8768 is already occupied. The main TasteTable page also has a **Common saved suggestions (new tab)** link. This separate page needs only the adjacent static files and the original saved-week modules; it does not need the TasteTable backend.

1. Choose a TasteTable saved-week JSON in each of the two initial source positions.
2. Use **Add source** for up to six files. Positions are chosen plans, not verified people. Empty or duplicate filenames and loading the same file twice do not merge positions.
3. Check the accepted filenames and statuses, then choose **Compare loaded weeks**.
4. Review the source panels and every occurrence of each common identity.
5. Optionally use **Download comparison JSON** or **Print comparison**. Keep the original saved-week files for reopening or rearranging.

The chooser accepts at most 2 MiB per file, with strict UTF-8 decoding and ordinary UTF-8 BOM support. This consumer accepts at most 500 original pick occurrences per file. The original saved-week codec still validates the complete response, inputs, timestamps and arrangement. An unreadable or refused replacement keeps that position's previously accepted file and displays an error.

Selecting or clearing a file, adding a position or removing one retires the old comparison and its export. A failed replacement does not restore that old result: compare again using the visible accepted inputs. Reads that finish after a newer selection, Clear or Remove cannot restore stale content. Canceling a chooser without selecting a file does not alter the page.

## What a match means

An identity is the exact pair of original `kind` and `entity_id` strings. It must occur in every selected file. Names, labels, dates and affinity values are not identity keys. No whitespace trimming, case folding, Unicode normalization or fuzzy matching is applied.

Groups follow their first appearance in the first source's original pick order. All duplicate occurrences are retained, ordered by source position and then original pick order. The existing `pick-N` keys identify occurrences within a file, not identities across files. Every occurrence retains its full original pick, literal explanation, original suggested day and current arranged date. Picks kept off the week still participate and retain null day/date. Different weeks and empty plans are valid; an empty intersection is a successful result.

Source panels show each file's mode, week, timestamps, complete original inputs/constraints and plan notes. A nonempty recorded model message remains visible. Mock, live and unknown source labels remain separate. The report retains the complete admitted snapshots, including the full response and tool trace.

These unsigned saved suggestions have not had their original heuristic checks rerun. Matching IDs do not authenticate a real venue or establish current suitability, shared availability, a reservation or medical/dietary advice. Confirm needs with the venue and care team. The page does not rank by affinity or invent a common date.

## Export and print

The fixed download name is `tastetable-common-suggestions.json`. Its format is `tastetable.common-suggestions.v1`, with ordered sources, matches and counts. Counts report source positions, common identities and all matching original occurrences. The bytes are the displayed result serialized as two-space JSON with one final LF.

This is an inspection report, not an editable saved-week file. Keep the original JSON weeks. A downloaded or printed copy does not change when the page's inputs change. Export preparation errors preserve the displayed comparison for retry. Print CSS hides input controls and exposes the complete source and match details; browser printing does not verify physical printer completion.

## Programmatic use and checks

`static/common_suggestions.mjs` exports `compareSavedSuggestions(entries)`, where entries is a dense array of two to six `{label, text}` objects. Labels are literal display strings of at most 1024 UTF-8 bytes; empty and repeated labels are valid. Each text is bounded to 2 MiB UTF-8 bytes and admitted by the unchanged original codec. Invalid entries refuse with TypeError or RangeError. The function does not mutate inputs and separate calls return independent graphs.

Run the focused new API checks from the repository root:

```sh
node --test --test-concurrency=1 tests/test_common_suggestions.mjs
node --check static/common_suggestions_ui.mjs
```

Those checks do not establish actual browser file, download, keyboard, layout or print behavior. Independent native receiving records those separate boundaries. The existing planner, model, comparison, codec and provider behavior are unchanged.
