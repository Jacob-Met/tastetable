# Start the regular app with fictional fixtures

Use this foreground launcher when you want the maintained TasteTable app to use
its fictional fixtures even if your shell is configured for live providers:

```sh
python -B tools/serve_fixture_demo.py
```

Once Uvicorn reports successful startup, open <http://127.0.0.1:8000> manually.
Choose **Try a sample persona** to run the existing deterministic fixture planner.
The page should report demo mode. The launcher does not open a browser for you.
Stop it with **Ctrl+C** in the terminal where it is running.

Use another explicit port if 8000 is already occupied:

```sh
python -B tools/serve_fixture_demo.py --port 8017
```

Then open <http://127.0.0.1:8017>. Valid ports are 1 through 65535. A bind conflict
is a startup failure; this command never searches for or stops the process using
that port. It does not install a service or change a shared server configuration.

## Existing application and dependencies

Run this from a complete repository checkout with the normal Python 3.12,
FastAPI and Uvicorn dependencies already installed. The launcher uses the same
Python executable that invoked it. It does not install packages. An absent
Uvicorn module or missing application dependency is reported by that Python
process and startup fails.

The launcher locates the repository from its own file and passes that root as
both the child's working directory and Uvicorn's application directory. Calling
it by an absolute path from another directory therefore uses this checkout.
It starts the unchanged `app:app` on `127.0.0.1`, with one worker and no reload.
The regular app serves its actual `static/index.html` and modules; this is not
the separate `web-demo-offline` recording player or a rewritten UI host.

The existing app, planner, fixture transport, scripted model, constraints,
personas and browser modules remain unchanged. Requests execute the normal
fixture planner, including its original explanations and limitations. Fictional
venues and heuristic checks do not establish real availability, dietary
suitability, accessibility or a booking. Confirm real needs separately.

## Configuration applies only to the child

The launcher omits these environment names before passing the remaining
environment to the child:

- `QLOO_API_KEY`, `QLOO_BASE_URL`, `TASTETABLE_LIVE`.
- `TASTETABLE_LLM_BASE_URL`, `TASTETABLE_LLM_MODEL`, `TASTETABLE_LLM_API_KEY`.
- All names starting with `UVICORN_`, and `WEB_CONCURRENCY`.

Names are compared without letter case. Excluded values are never looked up
or printed. Other entries pass through without interpretation, and the parent
shell's environment is not modified. The existing provider selectors then use
`FixtureTransport` and `ScriptedModel`. Inherited Uvicorn settings cannot turn
on reload, choose another application or change the binding through this command.

This is explicit application configuration, not an operating-system network
sandbox or authentication boundary. It does not inspect credentials, edit
configuration files, change browser profiles or contact a provider. If you
want the normal environment-selected startup, the existing README command
remains available independently.

The launcher waits for its child and returns that process's status. Invalid
arguments return 2 without starting it. An operating-system failure to start
the child returns 1 with a bounded diagnostic; an interrupted launcher returns
130. Console output from the application remains on the same terminal.

## Qualification and retained ownership

Focused launcher checks use only the standard library:

```sh
python -B -m unittest discover -s tests -p test_fixture_demo_launcher.py -v
```

These checks control the child call to examine its arguments, environment,
error handling and refusal before launch. They do not start FastAPI, prove an
HTTP response or exercise a browser. Any separately recorded localhost HTTP
receiving must identify its actual source, runtime, responses and cleanup.

The full-app and physical caregiver browser receiving retained by issues #55
and #54 remains a separate gate, including the unresolved original run
`caregiver-e67e7d83-v4-windows-1`. This launcher does not replay that campaign
or establish collection, browser, installed deployment or provider acceptance.
