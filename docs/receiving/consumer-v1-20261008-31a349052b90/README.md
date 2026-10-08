# TasteTable consumer-v1 late-render receiving packet

This additive evidence packet records **8/8 passing actual Chromium histories**, 32 actual ICS downloads, and 24 authored plan responses against the existing composition owner's frozen `consumer-v1` source. The archive carries the exact 12 owner files, the executable receiver and authored fixtures, all downloaded calendars, complete DOM report, source-preservation receipts, and the unchanged preparation/preflight packet.

See [RECEIVING_REVIEW.md](RECEIVING_REVIEW.md) for the tested contract, case table, provenance, limits and replay command. The actual owner freeze is authenticated by its [candidate manifest](owner-candidate-v1.json), not by an invented application commit.

- Owner manifest SHA256: `9843dad9ce68a55d14b0091e1c08481d83407c299810f0a4dadf9d4f3f223c9d`.
- App SHA256: `faa47a7c5b71a5c12f004868e68b71df33d4486002b983943185c3d9928dd5e1`; Git blob `1709ed872442b10e17f8a85491cc92526db361a0`.
- Archive: [receiver-packet.tar.gz](receiver-packet.tar.gz), 95,149 bytes and 80 verified members.
- Archive SHA256: `0a6c4cfff3b1207f5cdd6524f2a0ee633328bf2d1bf84baf4e683aa525d0907f`.
- Archive Git blob: `db6945ae9442dd8562010c84961554bbd06408b7`.
- [MANIFEST.json](MANIFEST.json) inventories the extracted archive; [archive-receipt.json](archive-receipt.json) records its verified digest.

The old negative-control source and unchanged original browser runners remain in the [earlier atomic-render packet](https://github.com/Jacob-Met/tastetable/tree/e1994ba62621bd09fa50e576bf8d022ecec0c552/docs/receiving/atomic-render-20261008-31a349052b90). No application files change in this evidence branch and no competing application PR is created. The existing owner retains composition, publication and integration authority. This result does not qualify live providers, deployed behavior, real calendar import, or the separately owned saved-week continuation.
