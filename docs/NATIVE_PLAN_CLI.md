# Native offline planning

Use the existing TasteTable planner directly from Python, without starting the application server or configuring a provider. This command always selects the repository's fictional fixture data and scripted planning policy.

From the repository root:

```sh
python3 tastetable_cli.py --persona mei
python3 tastetable_cli.py --profile examples/native-profile.json
python3 tastetable_cli.py --profile - < examples/native-profile.json
python3 tastetable_cli.py --help
```

The persona choices are `rosa`, `harold` and `mei`. Choose exactly one persona or profile source. The command uses only Python's standard library and the existing repository modules; the web application's requirements are not needed for this command.

## Output

A successful invocation writes one JSON object and a final newline to stdout. It has three fields:

| Field | Meaning |
| --- | --- |
| `provenance` | Explicit offline-fixture mode, scripted policy, fictional data and existing heuristic-check labels. |
| `profile` | The normalized taste and constraint input actually sent to the planner. |
| `response` | The complete unchanged native response: `plan`, `llm_only`, `comparison`, `trace`, `model_message` and `mock`. |

The response's `mock` value is true. Tastes and constraints are processed afresh by the existing planner against the local fixtures. This differs from choosing an existing finite recording in the separately maintained offline browser studio. This JSON envelope is a native planner result; the web application's saved-week format remains separate.

The fixture venues are fictional, affinities are hand-set, and the current food/accessibility checks are heuristics. Output retains the planner's original pass/fail/unknown reasons and incomplete-plan notes. An unfamiliar city can produce a valid plan with no matching suggestions. This command does not validate a live venue, contact a provider or establish suitability for a real person's care needs.

## Authored profile

Supply a UTF-8 JSON object of at most **65,536 bytes**. File and stdin inputs use the same admission rules.

| Field | Accepted value | Default when omitted |
| --- | --- | --- |
| `cuisines`, `music`, `films` | Arrays of at most five nonblank strings each. | Empty arrays |
| `constraints` | An array containing any of `soft_foods`, `low_sodium`, `wheelchair`, without repeats. | Empty array |
| `city` | A string, or null to omit the location filter. | `Pasadena` |

At least one cuisine, artist or film is required. Taste strings and city strings are trimmed and limited to **60 Unicode characters after trimming**. A blank city also omits the location filter. Unknown fields, duplicate JSON names, non-finite JSON numbers, invalid Unicode, wrong value types and excess limits are rejected. No input is silently truncated.

`examples/native-profile.json` is a small authored profile using the existing fixture tastes. Labels, personal identities and age fields are not part of this input shape.

## Exit behavior and local effects

| Exit | Meaning |
| --- | --- |
| 0 | A complete response was written, or help was displayed. |
| 2 | Invalid arguments, unreadable input or an inadmissible profile. |
| 1 | Planning, result serialization or output writing failed. |

Arguments are admitted before reading a profile, and the complete profile is admitted before loading fixtures or starting planning. Errors go to stderr with no JSON on stdout before output begins. A failed write can leave a partial stream; consumers should require exit 0 before accepting it. A closed stderr preserves the intended failure code.

The command opens no output file and does not change the input profile, fixtures or shared application state. Shell redirection is performed by the caller's shell, so redirecting stdout to a file can truncate that file before this command starts.

Both the Qloo client and model are supplied explicitly. Provider/model environment settings, including live-mode variables, cannot select a live transport for this command. The existing application API and original `python3 agent.py` demonstration retain their current behavior.

## Maintained receiving

```sh
python3 -m unittest discover -s tests -p test_native_plan_cli.py -v
```

The tests execute the actual command entry point in separate Python processes, compare the complete returned response to the unchanged native producer, and block/record network attempts while synthetic live-provider settings are present. Invalid-profile controls also verify that the fixture has not been opened. They cover exact byte limits, malformed input, open-stdin argument rejection, output/diagnostic failures and a missing fixture.

## Open a native result as an editable week

The optional file converter connects this command's output to the regular TasteTable application's **Open saved week** action. It uses the existing week model and saved-week writer; it does not run the planner again.

This step uses the APIs available in **Node.js 18+**, with no npm dependencies. Hosted receiving uses the installed Node 22 runtime and records its exact version in the run log; it does not qualify every older patch release. The original Python planner command retains its standard-library-only requirements.

```sh
python3 tastetable_cli.py --profile examples/native-profile.json > native-result.json && \
node tools/native_plan_to_week.mjs --input native-result.json --week 2026-10-08 --output my-week.json
```

Use a completed producer result only after the Python command exits successfully; the `&&` above enforces that order. Choose a new output filename in an existing directory. Any valid date selects its Monday–Sunday week, so this example opens the week beginning 2026-10-05.

In the regular local application, choose **Open saved week** and select `my-week.json`. It restores the exact original inputs, complete response and suggested-day assignments, with the existing fictional-fixture and saved-copy labels. Move or omit picks, print the week, download its calendar, or use **Save week (.json)** to keep the arrangement. A valid no-match result opens as an empty week with the original notes; it does not gain invented suggestions. This targets the regular application, not the separate offline studio's finite-record catalog.

### What the converter preserves

The input must contain exactly the native `provenance`, `profile` and `response` fields. The five fixed provenance markers must match this producer and `response.mock` must remain true. The original saved-week writer then admits the complete response, inputs and reconstructed state, including their constraint agreement. Conversion does not independently trim or normalize the profile, rebuild meals, reinterpret explanations, infer a care verdict or change source order.

These checks validate the declared format; they do not authenticate a hand-edited result. The full original profile and response occupy the existing v1 `inputs` and `response` slots. The saved week's source label comes from the preserved mock marker. Its unchanged v1 format has no slot for the outer native provenance block: retain `native-result.json` as that complete source record. The small JSON receipt on stdout also repeats that declared provenance.

Both saved-file timestamps identify the conversion time, not a provider lookup or a new venue check. Each conversion gets a new calendar identity. Reopening and saving that particular week retains its identity through the existing writer; converting the original result again deliberately creates a separate identity. This does not update or deduplicate anything already imported into a calendar app.

### Admission and output behavior

- All three options are required: `--input FILE`, `--week YYYY-MM-DD`, `--output FILE`. Use `--help` by itself. Repeated or unknown options and stdin input are refused.
- Input is a regular, strict UTF-8 JSON file of at most **2 MiB**; an initial UTF-8 BOM is accepted. The complete serialized saved week is limited to **4 MiB**. Unsupported content or a week extending outside years 0001–9999 is refused before output publication.
- The output parent must exist. The converter writes and closes a unique temporary file in that parent, then publishes it through a same-filesystem create-only hard link. Existing files, directories, input aliases and dangling links are never replaced. Filesystems without the required hard-link operation return a delivery error; there is no overwriting fallback.
- Refusal or a failed file write removes the owned stage and leaves no partial accepted week. The input remains unchanged. Exit **0** means a completed file and its receipt were delivered (or help was displayed); **2** means argument, format or occupied-name refusal; **1** means delivery or another runtime failure. If final cleanup or receipt delivery fails after publication, the diagnostic explicitly says the completed saved week was created. A cleanup failure can leave its uniquely named temporary stage. Inspect the completed file before choosing another output.

The converter does not start a server, make a provider request, store browser state or contact a calendar account. Serving/opening the normal web application keeps its existing setup.

### Maintained converter receiving

```sh
python3 -m unittest discover -s tests -p 'test_native_plan_week*.py' -v
```

These additional tests require installed Node.js as well as Python. They execute the actual native producer and converter, then receive the file through the unchanged week reader, arrangement model and calendar writer. They cover empty results, Unicode/literal fields, identity, exact response preservation, complete-input refusal, occupied outputs and real partial-write cleanup on POSIX. A separate unprivileged-POSIX control makes the completed stage unwritable after the real hard-link operation, then verifies the native cleanup error, valid final content, explicit created-file diagnostic and refusal to replace that file on retry. The original planner-only tests above still require no Node runtime.

The separate `native-plan-week-browser` workflow uses an already cached Node 22 and installed system Chrome. Its actual file-picker, Open/move/save/calendar checks serve the unchanged application files with a read-only loopback health/persona bootstrap; they do not claim an application-server deployment or a live API execution.
