# Local TasteTable visit-record entry

This installs the qualified saved-file visit editor as a separate, usable Mac application entry. It uses the existing Python runtime to serve a small local home and the eight original editor assets. The editor can open a saved TasteTable week or visit record, accept explicit edits, recover an edit with Undo/Redo, and download JSON or CSV.

## Open the installed editor

Run the maintained entry from any working directory:

```sh
'/Users/me/Applications/TasteTableVisitRecord-c945953fdeb7/Open TasteTable Visit Record.command'
```

The entry opens `http://127.0.0.1:48661/` through the existing macOS opener and keeps the local server in the foreground. Choose **Open visit record** on the home page. In the editor, choose a saved visit-record JSON or saved week, inspect the preview, and choose **Use this file**.

Use **Download visit record** to download the JSON you will need to reopen and edit the record later. **Download CSV** makes a tabular report; CSV is not the reopen format. The original editor keeps its current record and edit history only in the page session. Save JSON before returning to the local home, reloading or closing the page. Nothing is automatically uploaded or saved.

Press Control-C in the server's terminal to close it. SIGTERM is also a controlled shutdown. The server does not register itself as a service or start itself at login. A busy fixed port causes refusal; it never switches to another origin or takes over another listener.

For a receiver or a browser you open separately:

```sh
'/Users/me/Applications/TasteTableVisitRecord-c945953fdeb7/Open TasteTable Visit Record.command' --no-open
```

This starts the same foreground server and prints a JSON serving record with the fixed origin. It does not claim that Finder double-click, the default browser profile, or a hosted deployment has been received.

## Source and navigation

The originals come from the qualified #70 handoff at commit `4b9fb4bdf00214d92b821d30200bcaa9dd0bfa32`, tree `744c3a97f7d6b0108b51313fd8a532a638047d20`:

https://github.com/Jacob-Met/tastetable/issues/70#issuecomment-6075750328

That source is based on **open, unmerged PR61** `994c03aef94b711d6dcbbeb6bbbc6a4b85a6a3ad`. The #70 history/source and #60/PR61 CSV contributions remain with their original owners.

The installed copy of `static/visit-record.html` changes exactly one existing anchor label:

```html
<a href="/" class="back-link">TasteTable planner</a>
```

becomes:

```html
<a href="/" class="back-link">Visit record home</a>
```

Its destination remains `/`, now the honest standalone local home. The installer checks that the old anchor occurs once and that reversing the replacement restores every original byte. Original HTML is 4,734 bytes/SHA256 `fb538ba2f96fb4c30ea5b53b4459d17c8d00fb0e23becf8046b27a80b8c726d2`. Installed HTML is 4,733 bytes/SHA256 `ab33e270a69dcba0cd19303dc1ea1ae47b61621fa64d3af3870e6ecb21e4bec1`.

The other seven static files remain exact. The shared repository HTML is not edited. The separate planner, offline studio, providers, model, codec, CSV renderer and history helper are not extended or replaced.

The original qualifications remain as recorded: author Node 12/12; original browser 15/16 with missing recovery controls; author browser 23/24 with one CSV timestamp oracle failure; one separate correction of the retained download; independent original product receiving 56/56. The original 23/24 result stays 23/24 and its earlier lost source-only receipt stays a documented historical loss. This installation does not rerun or replace those campaigns. Its own installed-use results belong in the separate qualification directory.

## Exact original intake

`INPUTS.json` records all eleven original file identities, source paths, qualified parent/tree, original owners, navigation derivation and runtime requirements. The newly assembled original-only capsule is Git blob `f5ceed23b810957cf8e4cb36083fd519f9f03a2d`, 55,094 bytes, SHA256 `724be9c59600c28e0f6a69fefcbf635a321aade0ef5f84c5d402204285224344`. It is an exact source capsule, not a previously qualified ZIP.

The capsule contains the nine original application/license files and two actual original qualification downloads with fictional venue data. The saved-record fixture preserves its exact embedded week text, including a BOM and CRLF, and its untouched mixed-line-ending note. The original CSV records the original export's own timestamp. Later JSON and CSV downloads each generate their own save timestamp.

The eleven original payload files total 47,930 bytes. All originals, the complete capsule and all six maintained source files are retained in the new installation. The MIT license is retained unchanged and available from the local home.

## Install from the maintained source

Use the already present, pinned Python 3.13.7. Do not install another runtime or dependencies. Keep exactly these six source files together: `install.py`, `server.py`, `launch.command.in`, `index.html`, `INPUTS.json`, and this `README.md`. Provide the exact original-only capsule as a separate file.

```sh
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 -I -B /absolute/path/to/tools/visit-record-local/install.py --capsule /absolute/path/to/ORIGINAL-CAPSULE.json
```

The installer targets only `/Users/me/Applications/TasteTableVisitRecord-c945953fdeb7`. It refuses any existing target, including a partial one, and does not overwrite or remove files. The parent must already exist as a plain directory.

Before creating the target, it verifies the existing Python bytes, complete source set, exact capsule, all eleven original files, sole navigation change and complete planned payload. It requires at least 256 MiB free disk and 2 GiB of conservative available memory (free + inactive + speculative pages). The installed payload cap is 1 MiB; the author-stage-plus-install budget is 2 MiB. These are explicit admission limits, not space reservations.

The final `INSTALLATION.json` is written after every payload file. It records paths, sizes, SHA256 and Git identities, modes and string-valued nanosecond modification times. A failed installation leaves any partial owned target in place for inspection. It never supplies a usable completion marker for an incomplete file set.

## Installed layout and recovery

- `app/`: the local home, original license and eight editor assets; only the single installed HTML anchor label differs.
- `source/`: all six exact maintained source files.
- `original/`: the original-only capsule and all eleven exact original files, including the fictional reference downloads.
- `Open TasteTable Visit Record.command`: the executable entry bound to the existing isolated Python runtime and this target.
- `INSTALLATION.json`: the final completion and file-identity record.

Every launch verifies the complete installed file set, original/recovery bytes, modes and modification times, runtime identity, exact navigation inverse and local home before binding the fixed loopback address. It serves in-memory bytes only for the local home, license and eight declared static paths. It cannot browse directories, serve recovery/source files, accept uploads or mutate a user's saved files. A conventional empty favicon response belongs to this new server's routing, not to any claimed original-editor repair.

The original JSON file is read through the browser file input. Edits affect the current in-memory record; downloads create new user files. Retained installation and reference files remain read-only. To recover the exact qualified source, use `original/` or the pinned original-only capsule; do not overwrite an existing installed target or another owner's stage.

## Scope and receiving limits

Reservation: https://github.com/Jacob-Met/tastetable/issues/70#issuecomment-6077679283

Maintained source is confined to `tools/visit-record-local/**`; evidence belongs in `docs/qualification/visit-record-local-c945953fdeb7/**`. New product work does not change an owner ref, repository workflow, PR, package/bin registration, provider or existing installed studio. Root handles any later separately admitted source publication.

The ordinary installed session and physical JSON/CSV handoff are independently received after a frozen contract. Exact observations, any failed attempt, generated timestamps, browser/OS output and measured process closure must be reported literally. This source guide is not an assertion that an unexecuted installed session, Finder interaction, default-profile use or broader product campaign has passed.
