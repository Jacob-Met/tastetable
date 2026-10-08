# Frozen public result shapes

Supplement to PUBLIC_CONTRACT.md, supplied to the independent receiver before
its executable freeze. This specifies observable fields, not implementation.

## prepareSavedWeekCalendar return

The result is a frozen object:

| Field | Type and meaning |
| --- | --- |
| calendar | Frozen native object with string filename, string text and integer count. Text is the complete unchanged calendar writer output. |
| preview | Frozen array of frozen native preview records, in exact native order. |
| weekStart | Monday date string YYYY-MM-DD. |
| calendarId | 32 lowercase hexadecimal characters. |
| identitySource | "saved" or "new". |
| source | Native calendar writer source-label string. |
| receivedAt, savedAt | Original saved-file timestamp strings. |
| inputBytes, outputBytes | Integer UTF-8 byte counts. |
| inputSha256, outputSha256 | 64 lowercase hexadecimal SHA256 strings. |

Each native preview record contains these string fields: key, originalDay, day,
kind, entityId, name, why, date, endDate and summary. Kind is restaurant or outing;
days use native weekday names; date/endDate use YYYY-MM-DD.

Input hashes and byte counts include an accepted initial BOM. Output hashes and
counts include the writer's exact CRLF and line folding. A stored identity cannot
be overridden, even by an equal explicit newCalendarId.

## Successful command receipt

Stdout is one JSON object plus LF with these fields:

- schema: "tastetable.saved-week-calendar-receipt.v1"
- input: absolute lexically resolved supplied input path
- inputBytes, inputSha256
- output: absolute lexically resolved supplied destination
- outputBytes, outputSha256
- suggestedFilename: native calendar.filename
- weekStart, count, calendarId, identitySource
- receivedAt, savedAt, source, preview

Types and meanings follow the API table; count is the native calendar event
count. No calendar body appears on stdout. Resolved paths are lexical paths, not
claims that a symlink was canonicalized or that an inode was locked.

## Publication diagnostics

The exact stderr prefix after a completed publication and subsequent cleanup or
receipt failure is:

    tastetable-calendar: Calendar was created, but final cleanup or receipt delivery failed: 

The actual error message and LF follow; exit is 1. Prepublication failures use
the ordinary "tastetable-calendar: " prefix without that created-file prefix.
A closed stderr can prevent diagnostic delivery but must retain the intended
status. Existing-output refusal is exit 2 with no stdout or replacement.
Standalone help is exit 0 text and creates no file.
