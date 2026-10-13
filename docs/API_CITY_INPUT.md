# City input at the planning API

The ordinary planner sends the city field to `POST /api/plan`. The API removes
surrounding whitespace once, then keeps at most 60 Python Unicode code points.
For example, pasting ` Pasadena ` uses the same effective city as `Pasadena`.

These are the exact rules:

- An omitted `city` keeps the existing model default, `Pasadena`.
- Explicit JSON `null`, an empty string, and a whitespace-only string produce
  an empty city. The existing planner then omits the location filter. Blank
  input does not silently select Pasadena.
- Whitespace removal follows Python `str.strip()`; this includes boundary
  nonbreaking and ideographic spaces. A zero-width space is not removed.
- Interior spaces and tabs, capitalization, accents, combining characters and
  other Unicode text are preserved. No spelling correction, case conversion
  or Unicode normalization is performed.
- Trimming precedes the existing silent 60-code-point slice. The result is not
  trimmed again: 59 `A` characters followed by ` B` become 59 `A` characters
  followed by a space. The separator survives because it was inside the input.

This changes the effective city passed to planning, not the browser field or
saved-file formats. The existing taste cleaning, constraint checks, model and
provider selection, sample route and native CLI remain unchanged. The CLI has
its own existing overlength-refusal policy; the API continues to truncate.

## Focused regression checks

`tests/test_api_city.py` uses the real FastAPI `TestClient`, scripted policy and
fictional `FixtureTransport`. It compares complete ordinary and padded plans
for the existing sample profiles and records actual recommendation query
parameters. Query inspection distinguishes an omitted filter from the default
city even though every current fixture venue is in Pasadena. Other checks
cover Unicode and length boundaries and existing invalid-request refusals
before provider factories. Opt-in provider environment variables are cleared
and network access is refused by the test.

Run it in the project's existing Python environment when execution is authorized:

```sh
python -m pytest -q tests/test_api_city.py
```

These source-level checks are distinct from an actual browser interaction,
live-provider result or installed deployment. Their presence does not state
that those receiving steps have run.
