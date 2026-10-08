# Saved-week calendar qualification

The implementation adds an explicit saved-week file to calendar command and pure preparation API. It delegates to the existing saved-week codec, arrangement projection and calendar writer, retaining stored identity, original timestamps and exact calendar bytes. Explicit new identity applies only to null-identity input. Create-only publication preserves occupied paths, and post-publication cleanup or receipt failures report that the completed calendar was already created.

## Source

- Product receiving parent: `0f1316eed24611345e722a9938db8ce03c181404`, tree `d9a2cc503ac66d195f93a239ec7eeb1e9f56b955`, 743 original leaves.
- Qualified code/test head: `5f7b6ff109a92f6caf9f665165a305248e667354`, tree `658688113a15d2a0a9b3b8d06c26bf4356feb5b8`.
- Runtime: Git `d8d910eb315c4ffc58a3e37d58cbe4de6be84b4d`, SHA256 `a1e5bd2283db04629249b80aec9d21ff3c08a1a4b848bde23b0872f6a387da80`, 10,400 bytes. It never changed during hosted receiving.
- Authored 20-method receiver: Git `a32b329bb59084cb0aa62e235a731a9449ae2972`; only the original API wrapper invocation was corrected.
- Independently frozen 67-case receiver successor: Git `2d022f47add184d49c31d0e7bf325b219d13a47c`, SHA256 `905c14980b60c6975c4e830347b17f29bf8d0de53df8c40838951be4303ae6ff`.
- The current caregiver change brief, standalone saved-week HTML and offline-calendar work is preserved. All shared codec, writer, fixture and workflow pins are unchanged. README removes to the exact current original by deleting only our appended pointer.

## Actual hosted receiving

All runs use the unchanged project `ci` workflow and `python -m pytest -q`. The tests invoke real Node subprocesses and temporary filesystem fixtures.

| Run | Actual checkout | Result |
| --- | --- | --- |
| 37829507303 | `2162a14ed49ed1fe5291add56bfde3fdbcdaa8cf` | 2 failed, 181 passed, 241 subtests. Two authored API wrappers incorrectly occupied the CLI entry argument. |
| 37830657192 | `5d1b333993b601882da92defc0ac652e09230f8f` | 183 passed, 247 subtests. Same runtime; corrected wrapper. |
| 37832294755 | `f5b5792901ec3fe4daeacd98d247a39f322499fa` | Test-only unchanged product: 12 independent native controls passed; 55 absent-consumer failures. Full suite 175 passed, 202 subtests. |
| 37832815710 | `2bdc6005bd8e95c87858d945e8bc01c3b24f801c` | First unchanged candidate: 5 independent delivery-probe failures, 245 passed, 247 subtests. |
| 37833379798 | `fd3fb0898bacac858105d3ec86926957f464fdc8` | **250 passed, 247 subtests**, including all 20 authored methods and all 67 independent cases. |

Each run has the same inherited Starlette deprecation warning. The final listed checkout's tree equals the qualified head tree exactly and its parents are current product parent `0f1316ee` and head `5f7b6ff1`.

The independent receiver was frozen before candidate or authored-test exposure. Its original driver assumed the closed stage file itself must directly share the output parent, while the runtime uses a newly created private sibling directory containing the closed file. It also targeted file cleanup and `stdout.write`, while the runtime cleans its private directory and uses `fs.writeSync(1)`. The retained correction adjusts only those driver assumptions/hooks and log visibility, preserving all 67 semantic cases and 29 other Python functions. The original failure is retained as receiver evidence; no runtime repair was needed.

The final five logged delivery conditions observe a closed regular stage with exact native SHA256 `900f8707627e600907928f515217ac36519e3aac0045fa0f3c32870438250d18`. Ordinary publication returns 0. The deliberate competing create returns 2 and preserves rival bytes. Injected EXDEV returns 1 with no output. Injected cleanup and receipt failures each return 1 after publication, preserve the complete native file and reach their respective hooks. All 67 source-custody entries report unchanged native and candidate source.

The independent reviewer directly received the full logs, sources and tree and accepted the result in `independent-review/acceptance.json`. The test-only baseline PR50 is closed unmerged; its immutable ancestry and actual failure log remain in this packet. PR46 is the product integration route.

## Limits and preserved originals

The original local before witness was VM/API/argument receiving. A subsequent memory reset lost two original output bodies; their old pins remain in `custody.json`, and they have never been regenerated or relabelled. Three recovered input/receiver/scope files matched their original hashes. The separately identified actual hosted before run supplies filesystem/CLI evidence without replacing those missing historical bytes.

Raw author and independent red/green logs, exact source identities, setup failures and driver correction remain alongside their original checkpoint records. Historical pending labels in the initial README/manifest describe those earlier checkpoints; this qualification records the later actual outcomes.

Qualification is hosted Linux with synthetic fixtures. Error injection is explicit; it does not establish actual disk exhaustion or cross-device volume behavior. No provider/account call, calendar application import, clinical or booking conclusion, native installation or deployment is claimed. No workflow/dependency change was made. Source, guide, receiving tests and evidence are the complete contribution.
