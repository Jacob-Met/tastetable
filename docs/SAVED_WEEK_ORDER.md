# Browse saved browser copies by name

In **Saved in this browser**, use **Order saved records** to choose how the list
is arranged. This helps you browse named copies without hiding records, including
an imported portable week whose original saved date places it farther down the
default list.

- **Original saved date (newest first)** is the default. It restores the exact
  order supplied by the existing saved-record store.
- **Saved name** orders the displayed names, including the visible labels of
  unreadable records. Equal normalized names retain their order from the latest
  store result.

Your selected preview and unfinished rename stay open. The current-save name,
portable-file review and its name, active planner and venue notes are unchanged.
The control only repositions the list rows already on the page. It does not open
a copy, save a preference, read or write storage, or request a new plan.

## Use ordering together with search

Ordering includes every saved row, even one hidden by **Search saved names**.
Changing order preserves your search text, its match count and the selected
preview. **Clear search** reveals the complete list in the chosen order. Changing
the search does not reset that order.

After an ordinary successful **Refresh saved weeks**, or an existing Save,
Rename, Remove or Import action that refreshes the list, the chosen order is
applied to the new store result. The action otherwise keeps its original
selection, transaction, admission and error behavior. Renaming a stored record
can therefore move that row when Saved name is selected; merely typing an
unfinished rename does not change the stored label or reorder it.

The control is unavailable before the list loads, after a list-read failure,
during a collection mutation and while the document is retired. A failed read
does not turn the collection into an empty successful list. Use the existing
refresh action to retry.

## What the two orders mean

The default uses the store's existing sequence without sorting dates again. That
sequence is newest original `createdAt` first, with its existing ID tie break
and unreadable-record placement. Importing a portable file retains its original
saved date; neither the date label nor this order describes the import time.
No ordering establishes which saved copy is authoritative or fresh.

Saved name uses the same label and text normalization as search: a readable
record's name, or an unreadable record's visible label (falling back to
`Unreadable saved record`). It trims the ends, collapses repeated JavaScript
whitespace to one space, and lowercases the result. Whitespace is normalized,
not removed: `CarePlan` and `Care Plan` remain different.

Comparison is locale-independent UTF-16 code-unit order. It is not a
language-specific alphabet or natural numeric sort: `week 10` appears before
`week 2`, and accented characters are not reduced to unaccented ones. Punctuation
is literal. No Unicode normalization, filename interpretation or deduplication
is applied. For equal normalized labels, the latest store order is the tie break.

Your choice belongs only to this document. A new UI instance starts with the
default. The same document restored from the browser's back-forward cache can
retain its choice while refreshing through the original lifecycle. Nothing is
written to localStorage, IndexedDB, the URL or a server as an order preference.

## Maintained source and focused checks

`static/saved_week_order.mjs` exports
`orderSavedWeekRows(rows, mode = "newest")`. It returns a new array containing
the same row references in the chosen order and never modifies its inputs.
Newest mode copies the supplied sequence without inspecting names, dates or
payloads. Name mode reads the existing display labels only. An unsupported mode
throws `TypeError`; this helper is not another saved-record validator.

The existing search module remains unchanged. Its normalizer is local to that
function, so the new ordering helper uses the identical normalization expression.
The UI repositions existing `li` elements and retains their handlers and hidden
state. Older component hosts without the optional order control keep the original
store order.

From a repository checkout with Node available:

```sh
node --test tests/test_saved_week_order.mjs tests/test_saved_week_import.mjs
```

The dedicated tests check exact default restoration, normalized stable ties,
unreadable labels and unsupported modes, then exercise the actual UI handlers
with controlled elements and a store. They check preserved fields and node
identities, no extra store/capture calls on ordering, refresh/error handling,
mutation disabling and document retirement/restoration. The unchanged import
tests cover the shared UI's existing import behavior. Controlled tests do not
establish browser, IndexedDB, keyboard, focus or layout acceptance; any actual
browser receiving is recorded separately with its exact source and environment.

The planner, codec, store, collection model, existing search/import helpers and
selected-copy Download reservation retain their separate ownership and behavior.
