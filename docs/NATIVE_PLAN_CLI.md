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
