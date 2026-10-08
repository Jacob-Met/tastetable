# Native multi-profile week bundles

A caregiver planning for several people can run the existing fictional-fixture planner once per explicit profile and receive one ordered bundle. Each successful entry contains the exact native result and a saved week produced by the existing converter. The command does not combine people, choose shared venues, or change their individual constraints.

## Run

Use Python 3.10+ and an existing Node.js 18+ executable. No additional packages are required. Start in the repository root:

```sh
python3 tastetable_batch.py \
  --profile examples/native-profile.json \
  --profile ./another-profile.json \
  --week 2026-10-08 \
  --output ./week-bundle.zip
```

Repeat `--profile` in the order you want to receive the plans. Choose one through twenty explicit local regular files; each uses the existing native profile format and 64 KiB input limit. The command does not scan directories or read profiles from stdin. Repeated paths are deliberate separate entries, including separate calendar identities. `--week` accepts any actual date in the desired Monday–Sunday week through the existing week model.

`--node /path/to/node` selects an existing Node executable when it is not on PATH. The week, output, and Node options may each appear only once. The output directory must already exist, and the filename must be unused.

## Receive the bundle

Extract the ZIP and read `READ-ME.txt`. It names every requested input in order and clearly labels the whole bundle as all saved, partial, or no profiles saved. `index.json` carries the same status, counts, input labels, captured input byte hashes, output byte hashes, and per-input failure details.

Successful entries use fixed numbered folders:

```text
profiles/001/native-plan.json
profiles/001/saved-week.json
profiles/002/native-plan.json
profiles/002/saved-week.json
```

Use **Open saved week** in the regular TasteTable app to open the appropriate `saved-week.json`. The complete original response, profile, mock label, dates, and existing calendar identity semantics travel through the unchanged saved-week codec. The companion native result retains the existing outer fixture provenance.

An input filename is a label, not a person identifier. Identically named files in different folders remain separate entries. Hashes describe the exact profile bytes captured for that entry; editing the original file after capture cannot replace the bytes passed to its producer. Normalization and admission still belong to the existing native CLI.

These remain fictional-fixture plans from `ScriptedModel` and `FixtureTransport`. Existing heuristic checks, incomplete-plan notes, and source explanations are retained. This command performs no new provider or venue verification. It adds no account, booking, clinical, shared-group, or live-planning behavior.

## Partial outcomes and retries

| Exit | Meaning | Output |
| --- | --- | --- |
| `0` | Every requested profile was saved. | Complete bundle and JSON receipt on stdout. |
| `3` | At least one profile failed, including when all failed. | Bundle contains the ordered status index and any successful native/week pairs; stdout reports the same counts and stderr calls out failures. |
| `2` | The invocation was refused, for example an invalid week, repeated singular option, too many profiles, or occupied destination. | No new bundle is published. An existing destination stays unchanged. |
| `1` | Setup, archive publication, cleanup, or receipt delivery failed. | The diagnostic explicitly identifies an already-published bundle if cleanup or receipt delivery failed after publication. |

One refused profile does not discard a later successful profile. A failed entry names the read, producer, or converter stage and retains the child exit code when available. It contains no saved output pair. Fix that profile and choose a new output filename for a retry.

A completed archive is published into an unused name. Existing files, directories, dangling symlinks, and a destination created by another writer are never replaced. If the command says **Bundle was created**, inspect that file before retrying; the same filename will be refused. Each successful conversion creates the same fresh calendar identity that the standalone converter would create, so a new batch is a new set of saved weeks.

## Verify locally

```sh
python3 -m unittest discover -s tests -p 'test_native_plan_batch.py' -v
python3 -m unittest discover -s tests -p 'test_native_plan_cli.py' -v
```

The batch receiving suite requires an existing Node executable. It runs real producer and converter subprocesses, reopens every successful week through the native strict reader, and challenges input snapshots, partial results, publication races, partial writes, cleanup, and receipt delivery. It uses only authored synthetic profiles and explicit network refusal controls for Python producer processes.
