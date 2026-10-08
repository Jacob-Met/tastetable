# TasteTable

**Taste-grounded weekly plans for the people you care for.** A caregiver enters an older
adult's tastes (cuisines, the music and films they love) and care constraints (soft foods, low
sodium, wheelchair access). An agent uses the **Qloo Taste AI** Insights API to propose a
week of restaurants plus one cultural outing. It checks every pick against the constraints,
explains each pick using the Qloo signal behind it, and shows the result side by side with
an "LLM-only" plan that has no Qloo grounding.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/).

> **Not medical or dietary advice.** Constraint checks are heuristics over venue tags and
> menu keywords. Confirm needs with the venue and the care team. The sample personas are
> fictional. The app stores nothing, and it never sends names or health details to Qloo.

## Problem

Caregivers plan outings that need to be *enjoyable* (familiar food, music from their youth)
and *safe* (texture, sodium, step-free access). A generic chatbot will suggest "a nice Cuban
restaurant nearby": it may not exist, nothing about it was checked, and nothing explains why it
suits this person. TasteTable grounds each suggestion in a Qloo entity with an affinity score
and checks it before showing it.

## How Qloo powers it

The agent follows the flow from the
[Qloo hackathon developer guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide):
resolve, then ask the taste question, then verify.

| Step | Agent tool | Qloo endpoint | Purpose |
|---|---|---|---|
| 1 | `qloo_search(kind=entity)` | `GET /search` ([docs](https://docs.qloo.com/reference/get-search)) | "Celia Cruz" → artist entity ID; "Casablanca" → movie entity ID |
| 1 | `qloo_search(kind=tag)` | `GET /v2/tags` ([docs](https://docs.qloo.com/reference/get-tags-1)) | "Cuban" → `urn:tag:genre:restaurant:Cuban`; "jazz" → venue tag |
| 2 | `qloo_recs(purpose=restaurant)` | `GET /v2/insights` ([docs](https://docs.qloo.com/reference/insights-api-deep-dive)) with `filter.type=urn:entity:place`, `filter.tags`, `signal.interests.entities`, `filter.location.query`, `take` ([params](https://docs.qloo.com/reference/parameters)) | Restaurants that audiences who love those artists and films have an affinity for |
| 3 | `constraint_check` | (local) | Pass / fail / unknown for each constraint from Qloo tags and keywords. Wheelchair "unknown" counts as a fail |
| 4 | adaptive widening | `/v2/tags` + `/v2/insights` | If fewer than 4 restaurants pass, it widens to soft-food-friendly cuisines and labels those picks "widened" |
| 5 | `qloo_recs(purpose=outing)` + check | `/v2/insights` with venue tags | One cultural outing (jazz club, classic-film cinema, museum, concert hall) |

Every pick in the plan includes its Qloo `entity_id`, its affinity, the signals it came from, the
tag that matched, and the result of each constraint check. Candidates that were rejected, and the
full tool trace, are shown in collapsible panels.

**Request to result (redacted example, Rosa persona).** Rosa likes Celia Cruz, West Side Story,
and Cuban and Mexican food. Constraints: soft foods, low sodium, wheelchair.
`/search` resolves the artist and film. `/v2/tags` resolves Cuban and Mexican.
`/v2/insights?filter.type=urn:entity:place&filter.tags=…Cuban,…Mexican&signal.interests.entities=<celia>,<wss>&filter.location.query=Pasadena`
returns 4 candidates. `constraint_check` rejects a sandwich shop (firm, cured, high sodium) and a
cantina (steps at entrance). Only 2 pass, so the agent widens to Diner and Italian, and the
outing is a Latin-music museum (affinity 0.96 for Celia Cruz fans).

Qloo results describe aggregate affinities. They are not claims about any individual, and the UI
says so ([kit SAFE_USE](https://github.com/qloo/qloo-hackathon-kit/blob/main/docs/SAFE_USE.md)).

## Architecture

```
browser (static/index.html + app.js)
   │  POST /api/plan  (tastes + constraints only)
   ▼
app.py (FastAPI) ──► agent.py  tool loop (OpenAI chat.completions shape)
                        │   model: ScriptedModel (default) | OpenAICompatModel (opt-in)
                        ├─► qloo_client.py ──► Qloo API (live)  |  FixtureTransport (mock)
                        └─► constraints.py
```

* `qloo_client.py` uses only the standard library. It sends `X-Api-Key` auth, makes GET requests
  against `https://hackathon.api.qloo.com`, parses responses loosely, caches results in memory,
  and marks errors as retryable only for 429 and 5xx. Every endpoint cites its documentation URL.
* `fixtures/qloo_fixtures.json` is **synthetic** data: fictional venues, `FIX-` IDs, and
  hand-set affinities, in the documented response shapes. Regenerate it with
  `python scripts/build_fixtures.py`.
* `agent.py`: `ScriptedModel` is a deterministic offline policy behind the same
  `model.chat.completions.create(...)` interface as an OpenAI-compatible client. It makes
  parallel tool calls, reads tool results, and widens the search when needed. Set
  `TASTETABLE_LLM_BASE_URL` (and optionally `TASTETABLE_LLM_MODEL` and `TASTETABLE_LLM_API_KEY`)
  to put a real model behind the same loop. The plan itself is always assembled
  deterministically from tool results, so the model cannot invent a venue.
* The "LLM-only" column is a fixed, ungrounded template that shows what a model without tools
  typically returns. It is not a live model call.

## Setup

Requires Python 3.12.

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000     # open http://localhost:8000 and click "Try a sample persona"
pytest -q                                # run the test suite
```

By default the app runs in **mock mode** (it uses the fixture and makes no network calls).

### Changing or stopping a plan request

The browser shows results only for the newest submitted inputs. Starting another
sample or manual plan hides the previous result. Editing tastes or constraints
also clears the displayed plan and invalidates any pending response, so an older
request cannot restore a plan for inputs that are no longer selected. Request
errors appear beside the form and leave the fields available to correct or retry.

**Stop waiting** abandons the current browser request and permits a fresh one.
The browser requests cancellation, but this does not establish that work already
started by the server or a provider has stopped. There is no automatic retry.
Leaving the page invalidates outstanding responses; returning to a preserved
page allows a new request.

The request controller has dependency-free native JavaScript tests:

```bash
node --test tests/plan-request.test.cjs
```

For browser qualification, `node tools/check_plan_request_browser.cjs` serves the
actual static files on a temporary loopback port and uses authored HTTP responses.
It requires Playwright and Chromium; `TASTETABLE_PLAYWRIGHT` can point to an installed
Playwright module and `TASTETABLE_CHROMIUM` to a Chromium executable. Set
`TASTETABLE_EVIDENCE_DIR` to choose the receipt and screenshot directory. It exercises
out-of-order completions, failures, input edits, sample/manual overlap, real fetch
cancellation and a pagehide lifecycle event without contacting Qloo or a model.
These checks qualify browser request handling, not recommendation or constraint quality.

### Going live with Qloo

```bash
export QLOO_API_KEY=...        # event-issued key; set it in the shell or host secret store, never commit it
export TASTETABLE_LIVE=1       # both variables are required to leave mock mode
# optional: export QLOO_BASE_URL=https://hackathon.api.qloo.com   (the default)
uvicorn app:app --port 8000
```

`/api/health` reports `qloo_mode: live|mock`. The key is read only on the server. It is never
sent to the browser and never logged.

## Deploy plan (free tier)

The app is a single small FastAPI process with no database, so any free container or Python host
will run it. The plan below targets **Render (free web service)**. Fly.io, Railway, and Koyeb work
the same way with the included `Dockerfile`.

1. Push this repo to a public GitHub repository (MIT license included).
2. On Render, choose New → Web Service → connect the repo. Runtime: Docker (uses `Dockerfile`),
   or Python with build command `pip install -r requirements.txt` and start command
   `uvicorn app:app --host 0.0.0.0 --port $PORT`.
3. Add the environment secrets `QLOO_API_KEY` and `TASTETABLE_LIVE=1`.
4. Deploy, then check `https://<app>.onrender.com/api/health` shows `"qloo_mode":"live"`.
5. Free instances sleep when idle. Open the URL once before judging to wake it up.
   Qloo calls are cached in memory to stay within the event quota.

## Known limitations

* The fixture data is synthetic. Live Qloo responses may name fields differently. The parsers
  are tolerant, but check them against one real response before you rely on them.
* Accessibility tag IDs (`urn:tag:accessibility:place:*`) are placeholders. Look up the real ones
  with `/v2/tags` before going live. If Qloo has no accessibility tag for a venue, it shows as
  "unknown" and is excluded when wheelchair access is required.
* Soft-food and sodium checks match keywords. They do not read menus or confirm how food is
  prepared.
* An affinity score means the venue is popular with similar audiences. It does not mean
  "this person will enjoy it."

## License

MIT © 2026 Jacob Scott-Metoyer. See [LICENSE](LICENSE).
