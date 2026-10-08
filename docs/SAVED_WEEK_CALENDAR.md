# Export a saved week to a calendar file

Use the existing TasteTable calendar writer from the terminal, without starting
the application server or opening the planner. The input is an arranged
`tastetable.saved-week.v1` file from **Save week (.json)** or the maintained
native-result converter. The command does not generate recommendations.

Requires an installed Node.js 18+ runtime and no npm dependencies. Receiving
records its actual Node version; it does not qualify every older patch release.

```sh
node tools/saved_week_to_calendar.mjs --input "my week.json" --output "my week.ics"
node tools/saved_week_to_calendar.mjs --help
```

Choose a new output name in an existing directory. After exit 0, review the
calendar file before importing it into a calendar application. Stdout is one JSON
receipt containing the exact input/output hashes and byte counts, actual event
preview and count, week, source label, original timestamps and calendar identity.

## What is preserved

The unchanged saved-week reader reconstructs the arrangement. The unchanged
scheduler and calendar writer then supply the complete calendar bytes, including
CRLF, line folding and the existing text escaping. Moves, same-day occurrences,
omissions, original occurrence order within each day, source entity IDs,
explanations and source/caution text follow those native modules.

Events remain all-day, tentative, transparent suggestions. An export does not
establish opening hours, make a booking, rerun or authenticate saved care checks,
contact a provider or synchronize a calendar account. Downloading another file
does not update or cancel an earlier import. Calendar-application import and
deduplication behavior remains outside TasteTable's control.

The command neither edits the saved week nor changes the displayed plan in any
application. Visit worksheet notes are outside the existing saved-week/calendar
formats and are not inferred or added.

## Calendar identity

For a file with an existing `calendarId`, the command preserves it and the
original `receivedAt` timestamp. The same file therefore produces the same
calendar bytes on repeated exports, even to a different output name. DTSTAMP is
the original received timestamp, not a new venue check or conversion timestamp.

A saved file with `calendarId: null` is refused by default. To deliberately
create a fresh calendar identity for that one export:

```sh
node tools/saved_week_to_calendar.mjs --input "unexported week.json" --output "new calendar.ics" --new-calendar
```

The receipt reports `identitySource: "new"` and the random 32-character lowercase
hexadecimal ID. The input is still unchanged: the new ID is not written back
into it. Repeating this explicit operation produces separate identities and can
create separate events when imported. Keep or copy the completed calendar file
when you want to reuse that particular export. The flag is refused if the saved
week already has an identity; an existing identity cannot be overridden.

## Admission and publication

- Supply `--input FILE` and `--output FILE` exactly once; the optional
  `--new-calendar` flag also occurs at most once. Use `--help` by itself.
  Unknown/repeated options, incomplete arguments and `-` streams are refused.
- Input must be a regular strict UTF-8 file of at most **4 MiB**. One initial BOM
  is accepted by the native reader; a second BOM is not silently consumed by the
  decoder. The complete native calendar is bounded at **16 MiB**.
- The original codec and writer own saved-file, arrangement, date, source and
  text admission. An unknown source, an empty/fully omitted week or text that the
  writer cannot represent is refused. No text is trimmed or silently replaced.
- The output parent must already exist. All output bytes are written and closed
  in a unique temporary directory in that parent, then published through a
  same-filesystem create-only hard link. Existing files, directories, symlinks,
  input aliases and a competing destination are never replaced.
- There is no overwriting fallback if the filesystem does not support the
  required hard-link operation. An ordinary pre-publication failure removes the
  owned stage and leaves no partial accepted calendar.
- If final stage cleanup or receipt delivery fails **after publication**, the
  diagnostic explicitly says that the calendar was created. A cleanup failure
  can leave the uniquely named stage. Inspect the completed calendar before
  deciding what to do next; repeating the command cannot replace it.

| Exit | Meaning |
| --- | --- |
| 0 | Complete calendar and JSON receipt delivered, or help displayed. |
| 2 | Argument, saved-input or occupied-name refusal. |
| 1 | Runtime or delivery failure, including cleanup/receipt failure after publication. |

A closed diagnostic stream preserves the intended failure code. A partially
delivered stdout receipt is not a successful receipt; require exit 0. There is no
automatic retry or provider/account operation.

## Native API

`prepareSavedWeekCalendar(savedText, {newCalendarId} = {})` is exported by
`tools/saved_week_to_calendar.mjs`. It has no filesystem effects. It returns the
native `calendar` object (`filename`, `text`, `count`), exact `preview`,
source/identity/timestamp metadata and input/output byte counts and SHA256 values.

A null-identity file needs an explicit 32-character lowercase hexadecimal
`newCalendarId`; a file with an existing identity refuses that option. The API
does not generate an identity or accept a timestamp override. The CLI supplies
fresh random bytes only for an explicit `--new-calendar` invocation. The input
string and all original modules remain unchanged.

## Maintained receiving

```sh
python3 -m unittest discover -s tests -p test_saved_week_calendar.py -v
```

The unchanged pytest workflow also selects this file. Tests run the actual Node
entry point in separate processes with fictional temporary saved weeks. The
existing reader, scheduler and writer provide an independent byte oracle.
Controls cover identity and timestamp preservation, same-day occurrences and
omissions, literal Unicode/line endings, strict UTF-8/BOM and exact input byte
limits, malformed/unsupported files, occupied destinations and aliases, a
competing creator, actual partial-stage cleanup, unsupported hard links and
post-publication failures.

The partial-write and cleanup tests explicitly inject those failure conditions;
they do not claim a real disk-full incident. The competing destination invokes
the real kernel hard-link refusal, and the broken receipt/diagnostic tests use
real pipes with no readers. Network and child-process guards refuse unexpected
external effects while synthetic live-provider environment settings are present.
