# Saved-week taste entry preservation

Source parent: `328df51af830e91f304417a66d74f43d94ae0c02`.
Scope: TasteTable issue57, contributor `product-saved-week-taste-fields-8d5ac72a6fae`.

The ordinary page reopened a valid native saved-week profile containing
`["Earth, Wind & Fire", "Celia Cruz"]`, then silently submitted three interests
when the caregiver requested another week without changing the names. The
unchanged saved-week codec retained the two original values, including in an
actual re-save download. The mismatch occurred between form display and request
parsing.

The correction formats comma/quote-bearing and edge-whitespace entries visibly as
quoted fields, doubles literal quotes, and parses that representation on submit.
Ordinary unquoted lists and mid-entry quotes retain their prior behavior. A
malformed quoted edit names and focuses the field before a new request can begin.
The existing actual input-event retirement remains unchanged.

## Actual receiving

- `original-before.json`: unchanged original receiver; ordinary control passes
  and the comma-bearing native profile fails, exit1.
- `original-after.json`: the same receiver/source expectations and original two
  cases both pass, exit0.
- `quoted-edit-receiving.json`: actual comma/quote-bearing artist and film names,
  real saved download and subsequent request; edited quoted entries; malformed
  submissions in all three fields with zero new requests, unchanged displayed
  week/venue reply, retained raw input and correct focus; then correction and the
  existing real input-event retirement. Exit0.
- `author-unit-receiving.json`: final eight native Node groups pass. The initial
  seven-pass/one-failure author oracle and its precise fixture correction are
  retained. No parser-source change was required.
- `line-break-before.json` and `line-break-after.json`: a valid native entry
  containing internal CR/LF is sanitized by the existing single-line HTML input.
  Both receipts retain the same failure and exit1. This remains outside the
  comma/quote correction; arbitrary native text is not claimed to round-trip.

Every browser group used actual Chromium153.0.8010.0 and Node24.19.0. The local
API transport invoked the unchanged Python3.12.14 CLI for each real submitted
request with explicit ScriptedModel/FixtureTransport. Original source, native
responses, valid saved files, real re-save downloads, request bodies, raw
stdout/stderr and hashes are retained in each packet. No page errors or external
browser requests occurred. All execution source files stayed hash-identical.

Each JSON envelope contains a base64-encoded gzip packet. Its gzip SHA256 and byte
size are recorded beside the content; decompression produces a JSON files map.
The original two-case witness is additionally retained in immutable Git blob
`67f4cc2a31a1f86ba8d7b0757b52c5f831afc298`.

These are local native/browser results. They establish neither a hosted
deployment nor real provider behavior. Root's pre-exposure independent grammar
oracle is blob `e560b77c27ee603d826e0f197b02821ca36dfc10`; its result and the
separate composition with frozen profile files #56 belong to root's receiving.
No #56 codec/admission or neighboring week/notes/history/provider source changed.
