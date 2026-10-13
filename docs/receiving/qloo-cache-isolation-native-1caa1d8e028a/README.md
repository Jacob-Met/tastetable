# Qloo isolation: exact PR #95 native receiving

The already merged PR #95 result-isolation repair was received on the ThinkPad's
native Python interpreter in a new, isolated home directory. The unchanged
independent oracle passed all ten contracts, and the Rosa, Harold and Mei offline
CLI outputs were byte-identical to the previously recorded cloud outputs.

## Source and scope

| Item | Qualified identity |
|---|---|
| Source | `d2a3d26cb686b568ed0db0509f152e6c24e260cc` ([PR #95](https://github.com/Jacob-Met/tastetable/pull/95)) |
| Merge | `59dbb0c4348b9a0374da4f05f95c23eef6080521` |
| Source tree | `78515e64cd61965ed15cba4a2601d8feae5ca3e5` |
| Client SHA-256 | `22b6d5ee7664f37d4477d0e0973727d36f07d862a455a1ff9d7e7d2b4acc79eb` |
| Frozen oracle SHA-256 | `f1b2a0f0f63a1ed0be21afd80ea3b45cfba54837b8c1a2281085903c187db830` |
| Native environment | `hamon-thinkpad`, user `jacob`, `/usr/bin/python3`, Python 3.14.4 |
| Isolated workspace | `/home/jacob/hamon-tastetable-native-1caa1d8e028a` |
| Receiving date | 2026-10-13 UTC |

This is historical qualification of those exact source bytes. Main subsequently
advanced through PR #96 to `95738e812de81e3ace9830cdfabbbe7e39ff4686`, adding
successful-parse cache admission. That composition intentionally changes the
repeated parser-error request count from one to two. This unchanged PR #95 oracle
does not qualify that newer behavior; use the separate maintained
[composition qualification](../../qualification/qloo-cache-composition-20261013/README.md)
for it. No current application source is changed by this receiving handoff.

The native workspace contained nine published source/fixture/test/guide files
and the frozen receiver. All nine Git blobs and the receiver blob matched the
published tree. Their bytes, mtime, mode and inode remained unchanged throughout
the four child processes. The controller removed provider-key environment inputs
and selected the existing fictional FixtureTransport/ScriptedModel CLI path.
No dependencies were installed.

## Actual results and independent review

| Native child | Result |
|---|---|
| Frozen public-client oracle | Exit 0; 10/10 checks pass |
| Rosa offline CLI | Exit 0; all 14,470 stdout bytes match cloud |
| Harold offline CLI | Exit 0; all 12,775 stdout bytes match cloud |
| Mei offline CLI | Exit 0; all 9,444 stdout bytes match cloud |

All four stderr captures are empty. Controller PID 2940225 completed with exit 0;
its exact receipt hash was read back through the same native route. Export PID
2948359 also completed with exit 0. The routed preflight confirmed a writable
owned home directory, an absent destination and no ancestor instructions before
staging. The receiving script refuses an existing output rather than reusing it.

The source worker independently inspected the controller and raw routed
completion records, rehashed all 26 archive members, checked all ten source/oracle
Git blobs against the published tree, verified the nested source-transfer ZIP,
checked all ten individual oracle outcomes, and compared the three native stdout
files directly with the retained cloud files. This review did not rerun the
native jobs. See [source review](source-review.json).

## Complete evidence

- [Native evidence ZIP](evidence.zip), 98,971 bytes, SHA-256
  `aa0f4b3e9ca004b7db2eeefec40de325ce1673b55502b80f11ce2bb9264ff8c7`.
  Its 26 members contain the nine exact source files, frozen oracle, controller,
  source-transfer ZIP, staging/start records, native receipt, all child stdout and
  stderr, and the complete ten-check oracle receipt. CRC and member bytes were
  verified after export.
- [Native manifest](manifest.json), SHA-256
  `763892278b9c35b46c990fb1c77ed38eb89b74094e96ae6d78a84125e0ae8822`.
  It binds all 25 non-manifest members; the archive's manifest member equals this
  adjacent file byte for byte.
- [Native receipt](native-receipt.json), SHA-256
  `dfa38681593323f5781de7e1ea1135e58d1188abf45cb6b3cc98ab4bcecdac67`.
- [Raw routed custody](custody.json), SHA-256
  `e5ad924416c25b093384d09ae618a368824016c8bd1e6e368cb5ef95abbe5f1f`.
- [Published source blob pins](published-source-pins.json) and
  [independent custody review](source-review.json).

After extracting the evidence ZIP into a new directory, its historical source
snapshot and portable frozen oracle can be exercised with a fresh output path:

```sh
python3 -B -S receive_cache.py --source source/qloo_client.py --out fresh-oracle-results
python3 -B -S source/tastetable_cli.py --persona rosa
```

The retained `qualify_native.py` controller records the one native course and
uses its original absolute workspace path; the portable commands above avoid
reusing that path. Do not treat the old snapshot as an upgrade over current main.

This qualifies isolated native Linux source execution with fictional inputs.
It does not claim installed-consumer adoption, an existing service update, a
browser flow, live provider access, recommendation quality or clinical validation.
Existing application and installation owners remain unchanged. The original
[cloud/original-first evidence](../qloo-cache-isolation-1caa1d8e028a/README.md)
remains intact.
