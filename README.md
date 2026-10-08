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

### Arrange and print your week

After generating a plan, choose any date to display its Monday–Sunday week. Each checked pick
has a day selector: move it to another day, combine several picks on the same day, or choose
**Keep off this week**. Omitted picks remain available below the calendar so you can put them
back. **Restore suggested days** restores the original assignments while keeping your chosen
week. Open days are shown explicitly, including when too few recommendations pass the checks.

**Print week** opens the browser's print dialog for a dated caregiver handoff. It includes the
scheduled picks, their original Qloo IDs, affinity and check explanations, the requested
constraints, any omitted picks, and the response's demo/live/unknown source label. The original
suggestions, comparison, rejected candidates and tool trace remain in a collapsible panel;
their counts describe the original recommendation, even after you rearrange your week.

Scheduling runs in the browser and uses only the returned suggestions. It does not make another
Qloo/model request, alter the checks, or send the chosen dates to the server. Edits last for
the current page visit; an accepted new plan starts fresh assignments. Dates are planning
choices, not reservations or verified venue availability. Printed copies retain the existing
care and synthetic-fixture caveats.

**Download calendar (.ics)** exports the same currently scheduled picks and dates shown in
your week. Review the calendar dates below the week before downloading, then open the file
in a calendar app to review and import its all-day suggestions. Moving several picks onto
one day keeps each occurrence distinct; picks kept off the week stay out of the file. The
file retains original explanations, entity IDs, source notes and demo/live provenance.
An invalid date, an unknown source or no scheduled picks keeps download unavailable.

The existing week picker controls both printing and export. Moves, omissions and restores
within a week retain calendar event identities for this page's current plan; another week or
a newly accepted plan receives separate event identities. Downloading a file does not update
or cancel earlier imports. Calendar-app import behavior is outside TasteTable's control.

Changing tastes or constraints, choosing another sample, starting a replacement request,
or selecting **Stop waiting** retires the old result and its print/export state. Editable
inputs and your chosen week date remain available for the next request. Only the latest
accepted response creates a fresh week; a late abandoned response cannot restore a stale
plan. Stopping the browser's wait is not proof that a server or provider stopped its work.
If a replacement fails or cannot render, the old handoff remains retired and you can retry
from the preserved inputs.

The state, calendar writer and request controller checks use Node.js 18+ with no npm dependencies:

```bash
node --test tests/test_week_plan.mjs tests/calendar.test.cjs tests/calendar-week.test.cjs tests/plan-request.test.cjs
```

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
