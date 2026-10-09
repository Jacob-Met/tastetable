# Recover an edit in a visit record

After choosing **Use this file** in Visit record, **Undo change** restores the previous accepted outcome, actual date or note. **Redo change** restores an edit you undid. Repeated suggestions for the same venue remain separate visits.

The current tab retains up to 20 changes. Choosing an outcome is one change. Text typed into one date or note field during a single focus visit is one change; leaving that field or choosing an action ends it. Returning to the exact starting value does not use a history step or remove Redo. A different accepted edit after Undo replaces the redo path.

Recovery restores the full accepted record, including untouched visits, omitted picks, null dates, empty notes and literal imported line endings. The field affected by recovery receives focus. Undo and Redo do not change the saved week, rerun checks, infer outcomes, contact a provider or save automatically.

If a date or note is invalid, correct the marked field first. Undo and Redo stay unavailable while invalid text remains, alongside the existing download and print restrictions. Invalid text is not silently discarded or recorded as a successful edit.

Selecting a file, reviewing it, canceling or failing to open it does not erase edit history. Choosing **Use this file** starts a new history, even if the incoming values match the displayed record. Undo or Redo clears an unfinished file read or preview; review the file again before using it.

JSON, CSV and Print use the current accepted record after recovery. Keep the JSON file to continue later. History itself is not included in downloads and ends when you leave the page. Nothing is uploaded or stored automatically.

## Maintainer checks

The history helper consumes the existing model's immutable, validated record snapshots. The model, codecs and CSV renderer remain unchanged.

With Node.js 22 or later, run:

```sh
node --test tests/test_visit_edit_history.mjs
```

`tools/check_visit_edit_history_browser.mjs` receives an explicitly prepared fixture root with exact source, fixture and browser-phase manifests. It uses an existing standalone Chromium and Node's built-in CDP transport, an exclusive profile and loopback server. It does not install a browser. Its native receipts distinguish original missing recovery controls from accepted candidate behavior, preserve physical JSON/CSV downloads, and record process closure and resource limits.
