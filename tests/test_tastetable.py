import json
import sys
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import agent  # noqa: E402
from constraints import evaluate, filter_entities  # noqa: E402
from personas import PERSONAS  # noqa: E402
from qloo_client import (FixtureTransport, QlooClient, QlooError, parse_entity,  # noqa: E402
                         http_transport, parse_insights, parse_search, parse_tags)


@pytest.fixture
def mock():
    t = FixtureTransport()
    return QlooClient(api_key="TEST", transport=t), t


# ---------------------------------------------------------------- client parsing

def test_parse_insights_documented_shape():
    payload = {"success": True, "results": {"entities": [
        {"entity_id": "X1", "name": "Cafe", "types": ["urn:entity:place"], "popularity": 0.8,
         "query": {"affinity": 0.91}, "tags": [{"tag_id": "t1", "name": "Cuban", "type": "x"}],
         "properties": {"keywords": [{"name": "flan", "count": 3}]}}]}}
    [e] = parse_insights(payload)
    assert (e.entity_id, e.name, e.affinity, e.popularity) == ("X1", "Cafe", 0.91, 0.8)
    assert e.tag_names == ["Cuban"] and e.tag_ids == ["t1"]


def test_parse_tolerates_list_results_and_missing_fields():
    assert [e.name for e in parse_search({"results": [{"id": "a", "name": "A"}]})] == ["A"]
    e = parse_entity({"entity_id": "b", "name": "B", "affinity": 0.5})
    assert e.affinity == 0.5 and e.tags == [] and e.types == []
    assert parse_search({}) == []


def test_parse_tags_and_error_envelope():
    tags = parse_tags({"results": {"tags": [{"id": "urn:tag:x", "name": "X", "type": "t"}]}})
    assert tags == [{"tag_id": "urn:tag:x", "name": "X", "type": "t"}]
    with pytest.raises(QlooError):
        parse_insights({"success": False, "errors": ["bad"]})


def test_client_sends_documented_params_and_auth(mock):
    client, t = mock
    client.insights("urn:entity:place", signal_entities=["A", "B"],
                    filter_tags=["urn:tag:genre:restaurant:Cuban"], location_query="Pasadena", take=4)
    req = t.log[-1]
    assert req["path"] == "/v2/insights"
    assert req["params"] == {"filter.type": "urn:entity:place", "take": 4,
                             "signal.interests.entities": "A,B",
                             "filter.tags": "urn:tag:genre:restaurant:Cuban",
                             "filter.location.query": "Pasadena"}
    assert "X-Api-Key" not in json.dumps(t.log)  # headers never logged


def test_missing_key_is_401_and_bad_type_rejected():
    c = QlooClient(api_key="", transport=FixtureTransport())
    with pytest.raises(QlooError) as ei:
        c.search("Casablanca")
    assert ei.value.status == 401 and not ei.value.retryable
    with pytest.raises(ValueError):
        QlooClient(api_key="k", transport=FixtureTransport()).insights("urn:entity:music")


def test_search_and_tags_resolve(mock):
    client, _ = mock
    assert client.search("celia", types="urn:entity:artist")[0].entity_id == "FIX-A-celia"
    assert client.find_tags("soul food")[0]["name"] == "Southern"


def test_client_caches_identical_requests(mock):
    client, t = mock
    client.search("Casablanca")
    client.search("Casablanca")
    assert len(t.log) == 1


def test_default_from_env_is_mock(monkeypatch):
    monkeypatch.delenv("TASTETABLE_LIVE", raising=False)
    assert QlooClient.from_env().is_mock


def test_live_mode_requires_both_explicit_opt_ins(monkeypatch):
    monkeypatch.setenv("QLOO_API_KEY", "unit-test-only")
    monkeypatch.delenv("TASTETABLE_LIVE", raising=False)
    monkeypatch.delenv("QLOO_BASE_URL", raising=False)
    assert QlooClient.from_env().is_mock

    monkeypatch.setenv("TASTETABLE_LIVE", "1")
    client = QlooClient.from_env()
    assert not client.is_mock
    assert client.base_url == "https://hackathon.api.qloo.com"


def test_http_transport_uses_get_and_sends_key_only_as_header(monkeypatch):
    captured = {}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return b'{"success":true}'

    def fake_urlopen(request, timeout):
        captured["request"] = request
        captured["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr("qloo_client.urllib.request.urlopen", fake_urlopen)
    result = http_transport("https://hackathon.api.qloo.com")(
        "/v2/insights",
        {"filter.type": "urn:entity:place", "take": 2, "ignored": None},
        {"X-Api-Key": "unit-test-only", "accept": "application/json"},
    )

    request = captured["request"]
    headers = {key.lower(): value for key, value in request.header_items()}
    assert request.get_method() == "GET"
    assert urlsplit(request.full_url).scheme == "https"
    assert urlsplit(request.full_url).netloc == "hackathon.api.qloo.com"
    assert urlsplit(request.full_url).path == "/v2/insights"
    assert parse_qs(urlsplit(request.full_url).query) == {
        "filter.type": ["urn:entity:place"], "take": ["2"]}
    assert headers["x-api-key"] == "unit-test-only"
    assert "unit-test-only" not in request.full_url
    assert captured["timeout"] == 15.0
    assert result == {"success": True}


# ---------------------------------------------------------------- constraints

def _ents(client):
    return {e.name: e for e in client.insights("urn:entity:place", take=50)}


def test_constraint_filtering(mock):
    ents = _ents(mock[0])
    v = evaluate(ents["Malecon Sandwich Shop"], ["soft_foods", "low_sodium", "wheelchair"])
    status = {c.constraint: c.status for c in v.checks}
    assert not v.ok and status == {"soft_foods": "fail", "low_sodium": "fail",
                                   "wheelchair": "unknown"}
    assert evaluate(ents["Casa Habana Kitchen"], ["soft_foods", "wheelchair"]).ok
    assert not evaluate(ents["La Paloma Cantina"], ["wheelchair"]).ok  # steps at entrance


def test_outing_skips_dietary_checks(mock):
    ents = _ents(mock[0])
    v = evaluate(ents["Rialto Revival Cinema (fictional)"], ["soft_foods", "low_sodium", "wheelchair"],
                 kind="outing")
    assert v.ok and [c.constraint for c in v.checks] == ["wheelchair"]


def test_filter_entities_and_unknown_constraint(mock):
    ents = list(_ents(mock[0]).values())
    kept, verdicts = filter_entities(ents, ["wheelchair"])
    assert len(verdicts) == len(ents) and 0 < len(kept) < len(ents)
    with pytest.raises(ValueError):
        evaluate(ents[0], ["gluten_free"])


# ---------------------------------------------------------------- agent + plan

@pytest.mark.parametrize("pid", list(PERSONAS))
def test_plan_assembly_respects_constraints(pid, mock):
    res = agent.run_agent(PERSONAS[pid], qloo=mock[0])
    plan = res["plan"]
    assert len(plan["meals"]) == len(agent.MEAL_DAYS)
    assert [m["day"] for m in plan["meals"]] == agent.MEAL_DAYS
    assert plan["outing"] and plan["outing"]["day"] == agent.OUTING_DAY
    items = plan["meals"] + [plan["outing"]]
    assert len({i["entity_id"] for i in items}) == len(items)  # no duplicates
    ents = _ents(QlooClient(api_key="k", transport=FixtureTransport()))
    by_id = {e.entity_id: e for e in ents.values()}
    for m in plan["meals"]:
        assert evaluate(by_id[m["entity_id"]], PERSONAS[pid]["constraints"]).ok
        assert "Qloo affinity" in m["why"]
    assert res["comparison"]["grounded"]["with_qloo_entity_id"] == len(items)
    assert res["comparison"]["llm_only"]["with_qloo_entity_id"] == 0


def test_rosa_rejects_unsafe_and_widens(mock):
    plan = agent.run_agent(PERSONAS["rosa"], qloo=mock[0])["plan"]
    rejected = {r["name"] for r in plan["rejected"]}
    assert {"Malecon Sandwich Shop", "La Paloma Cantina"} <= rejected
    names = [m["name"] for m in plan["meals"]]
    assert names[0] == "Casa Habana Kitchen"  # highest Celia Cruz affinity, passes all
    assert any(m["fallback"] for m in plan["meals"])  # had to widen beyond Cuban/Mexican
    assert not any(m["fallback"] for m in plan["meals"][:2])  # primary cuisines first


def test_agent_sends_no_persona_label_to_qloo(mock):
    client, t = mock
    agent.run_agent(PERSONAS["harold"], qloo=client)
    assert "Harold" not in json.dumps(t.log)


def test_scripted_model_speaks_openai_shape():
    m = agent.ScriptedModel()
    resp = m.chat.completions.create(model="x", messages=[
        {"role": "system", "content": "s"}, {"role": "user", "content": json.dumps(PERSONAS["mei"])}],
        tools=agent.TOOLS)
    msg = resp["choices"][0]["message"]
    assert resp["object"] == "chat.completion" and msg["role"] == "assistant"
    assert all(tc["type"] == "function" and json.loads(tc["function"]["arguments"])
               for tc in msg["tool_calls"])


def test_assemble_plan_leaves_days_open_when_too_few_pass():
    st = agent.AgentState(persona={"cuisines": []})
    e = parse_entity({"entity_id": "Z", "name": "Only", "query": {"affinity": 0.7}})
    st.candidates["Z"] = {"entity": e, "purpose": "restaurant", "query_tags": [], "signals": []}
    st.verdicts["Z"] = {"entity_id": "Z", "name": "Only", "ok": True, "checks": []}
    plan = agent.assemble_plan(st)
    assert len(plan["meals"]) == 1 and plan["outing"] is None and plan["notes"]


# ---------------------------------------------------------------- web

def test_web_endpoints():
    from fastapi.testclient import TestClient
    from app import app
    c = TestClient(app)
    assert c.get("/").status_code == 200 and "Try a sample persona" in c.get("/").text
    assert "Not medical or dietary advice" in c.get("/").text
    assert len(c.get("/api/personas").json()) == 3
    r = c.post("/api/plan/sample/rosa")
    assert r.status_code == 200 and r.json()["mock"] is True
    r = c.post("/api/plan", json={"cuisines": ["Italian"], "films": ["Roman Holiday"],
                                  "constraints": ["soft_foods"]})
    assert r.status_code == 200 and r.json()["plan"]["meals"]
    assert c.post("/api/plan", json={"constraints": ["x"]}).status_code == 400
    assert c.post("/api/plan", json={}).status_code == 400
