# Optional venue notes in a portable TasteTable handoff

The existing saved-week-to-HTML command can now include an explicitly selected, matching venue-note companion. The result remains a self-contained, script-free read/print document. Current notes belong to the original occurrence and exact date; retained omitted/other-date records appear separately. Plain saved-week output is unchanged.

Source claim: https://github.com/Jacob-Met/tastetable/issues/54. Base 328df51af830e91f304417a66d74f43d94ae0c02, canonical tree df0251092f77d96169daa097abaec409ecabe6ba, 786 leaves. Original source/contract commit bdcc5e143b907b8ca36d7753fe2886b939b23a95 preceded implementation; original receiving is 9ba89e6. Exact seven-path product source is frozen at native 3f56aced54d31c8df5189d39440adea84910902a. Native history is an isolated runnable closure, not a full project clone or a public commit ancestry.

The original 122-test native Node suite passed. Its actual CLI accepted a plain week but refused --venue-notes with exit 2 and created no artifact. The new 135-test suite passed on Node 24.21.0, including 13 new rendering/actual-process cases. The same original plain HTML remains byte-exact, SHA256 16ff7b881f7f4e3983b25122e9f05c8950f63fc4832e5db913bfd5df95ec6a9a. All 27 unrelated intake files remain exact.

First actual Chrome 154.0.8037.98 receiving passed five groups, native exit 0: physical CLI output; same-day repeated venue occurrences; current versus historical/omitted records; earlier questions/reply history; literal CR/Unicode/markup; both raw-file fingerprints; 390px layout; actual print PDF; and no HTTP request or page error. Desktop/contact-detail and phone screenshots were inspected. Browser source hashes before/after are retained. No failed product or browser candidate was discarded; this first candidate passed. The baseline missing optional consumer remains separate from a regression claim.

The bundle preserves contract, original inputs/complete tree listing, original CLI receipts and HTML, all candidate source/test/driver bytes, raw native logs, selected fictional fixture files, physical generated HTML/PDF, screenshots, and method/fixture/source hashes. Browser profiles are excluded. Clone the complete author bundle into a new directory with Git autocrlf disabled, then inspect repo/ and evidence/. Run the maintained tests from repo/:

```sh
node --test tests/*.mjs tests/*.cjs
node tools/check_week_contact_report_browser.mjs "/path/to/chrome" "/new/output-directory"
```

The unchanged maintained saved-week-comparison workflow collects both new Node test files. The main Python workflow and normal current-parent gates remain separate hosted requirements. Independent receiving, public source publication and merge are pending; no provider call, venue confirmation, care decision, source authentication, deployment or installed-state claim is made.

Existing worksheet model, companion/saved-week codecs, scheduler and other owner spans remain unchanged. New issue55's editable combined handoff is a complementary separate owner; its comment on issue54 preserves this read-only CLI/report fence.

The initial raw tree response requested by commit reported that query ref as its top-level sha. The later canonical-tree.json query uses the actual tree ID and has identical entries. Both are retained without rewriting the original evidence.

The first browser process readback explicitly reported native exit 0. A later attempt to fetch that already-consumed session for local raw custody returned `No session found`; evidence/browser-v1/process-completion.json preserves that later tool refusal, not an exit transcript. The original structured browser result, exact method, artifacts and source bindings are present. Native exit 0 is an observed tool result recorded in acceptance, not inferred from this later refusal.
