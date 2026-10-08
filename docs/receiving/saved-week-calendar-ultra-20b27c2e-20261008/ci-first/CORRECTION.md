# First hosted run and API receiver correction

The unchanged `ci` workflow ran `python -m pytest -q` on actual checkout `2162a14ed49ed1fe5291add56bfde3fdbcdaa8cf` (head `eb3228b7c9bccff0419002133b935ea93e1a34fd`, base `2b347cee4ff4e2b806362730a8520a3360b45f5a`, tree `49b62360fda6f2d2d689f854a04b751541e2a470`). The retained raw log reports **2 failed, 181 passed, 241 subtests passed**, one inherited Starlette deprecation warning, and exit 1. This failed run is not relabelled as success.

Both failures were authored API-wrapper setup: `test_existing_identity_cannot_be_replaced_even_explicitly` and `test_pure_api_with_explicit_new_identity_matches_unchanged_writer`. The `node -e` wrapper passed the imported command path in `process.argv[1]`. That made the command's conventional main-module guard enter the CLI with no input argument. The emitted `--input is required` error occurred before the API assertions.

The successor changes exactly two wrapper lines: it passes literal `api-receiver` before the import target, and reads the target from `process.argv.slice(2)`. All 20 test methods and their semantic assertions remain unchanged. Installed Node confirmed the argv layout; Python AST parsing accepted the successor. These checks are setup/syntax evidence, not replacement process/filesystem qualification. The next ordinary hosted run supplies that qualification.

Product runtime remains Git blob `d8d910eb315c4ffc58a3e37d58cbe4de6be84b4d`, SHA256 `a1e5bd2283db04629249b80aec9d21ff3c08a1a4b848bde23b0872f6a387da80`. The original executed test remains reachable at the original commit and blob named in `run.json`. The raw log contains GitHub's already-masked `AUTHORIZATION: basic ***`; no credential value is included.

## Current source composition

Receiving base `7a0c55c4e608ae4e910745a97270fde966575cd0`, tree `d98738c38c4bc5ea31ce246a9e2aefcf16b3eb15`, has 627 complete leaves. The caregiver change brief's new and changed files are preserved. All three saved-week/calendar helpers, the synthetic saved response, native planner converter and existing CI workflow are byte-identical to the original base. README uses the complete current owner content plus the same saved-calendar pointer; removing that exact suffix restores current README blob `ef24a2f094ba5819caacb4ceaa59f15fd008bace`.

The first packet and before evidence remain historical records of their original source. Independent receiving is still pending; the pull request remains draft.
