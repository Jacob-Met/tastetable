# Find visits in the record you are editing

Open **Visit record**, select a saved week or existing visit-record JSON, review
the file and choose **Use this file**. Under **Find visits**:

- Enter part of a venue name or note in **Search venue or note**. Matching ignores
  letter case and surrounding search whitespace. Punctuation, accents and other
  text stay literal; this is not a regular-expression or fuzzy search.
- Choose **All outcomes**, **Unrecorded**, **Went** or **Did not go**. The outcome
  and text filters apply together.
- **Clear filters** shows every visit again and moves keyboard focus to search.

The count describes the cards currently visible. Visits retain their original
numbers and order, so repeated venue names and omitted suggestions remain
separate occurrences. A no-match message explains how to restore the list.

While you edit a visible card, it stays visible until focus leaves it even if
the new outcome or note no longer matches. A card with an invalid date or note
also stays visible until corrected. The count explains those exceptions; the
existing editor still blocks downloads and printing while a draft is invalid.

Filters last only in the current page view. A successful **Use this file** resets
them. Selecting, previewing or canceling a replacement does not reset them.
Filtering does not change the record, its source text, any outcome/date/note, or
the original saved week. Downloads and **Print record** include every visit,
regardless of the current filter. No view settings are saved or uploaded.

This is the ordinary single-record editor. The separately owned Visit history
workspace reviews multiple saved files and has its own filtering/printing rules.

## Source and checks

See the [current draft qualification](receiving/visit-record-filters-a6ca5c7fc95f/README.md)
for completed local checks and the browser receiving that remains pending.

The filter is a separate DOM view module and stylesheet. The editor, codecs,
CSV exporter and Undo/Redo source are unchanged. The HTML page adds only the two
asset links. The module observes rendered cards and their displayed inputs;
it never obtains or replaces the private record model.

Run the portable matching checks with:

```sh
node --test tests/test_visit_record_filter.mjs
```

The dedicated browser receiver also exercises actual file selection, edits,
keyboard focus, no-match recovery, replacement, complete JSON downloads and
print rendering on a temporary loopback server. It uses fictional local files
and does not contact a provider or operate an installed service.

With Node 22+ and an existing Chrome/Chromium executable:

```sh
node tools/check_visit_record_filters_browser.mjs --browser /path/to/chrome --output /new/receiving-directory
```

The output directory must not already exist. The receiver saves its fixture,
physical download, screenshots, print PDF and JSON receipt there, and closes its
own browser and loopback server. It changes no source files. To confirm the
original missing controls, add `--source-root /path/to/original-checkout
--expect-absent`; that mode exercises the original file-open flow first.
