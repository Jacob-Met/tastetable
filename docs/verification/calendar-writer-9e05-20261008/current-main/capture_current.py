"""Bounded receiving check of current TasteTable main; native mock data only."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import inspect
import json
from pathlib import Path
import sys
import traceback
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "main"
sys.path.insert(0, str(SOURCE))
import agent
import constraints
import personas
import qloo_client


def require(value, message):
    if not value:
        raise RuntimeError(message)


class RefuseRecommendationKind(qloo_client.FixtureTransport):
    def __init__(self, kinds=()):
        super().__init__()
        self.kinds = set(kinds)
        self.calls = []

    def __call__(self, path, params, headers):
        if path == "/v2/insights":
            tags = params.get("filter.tags", "").split(",")
            if tags and all(tag.startswith("urn:tag:category:place:") for tag in tags):
                kind = "outing"
            elif tags and all(tag.startswith("urn:tag:genre:restaurant:") for tag in tags):
                kind = "restaurant"
            else:
                raise RuntimeError("Unclassified native fixture query")
            self.calls.append({"kind": kind, "tags": tags})
            if kind in self.kinds:
                raise qloo_client.QlooError(503, "fresh-main synthetic refusal: " + kind)
        return super().__call__(path, params, headers)


def native_result(persona_id, kinds=()):
    transport = RefuseRecommendationKind(kinds)
    with patch.object(agent.os, "environ", {}), patch(
            "urllib.request.urlopen", side_effect=RuntimeError("Network forbidden in receiving review")):
        result = agent.run_agent(
            personas.PERSONAS[persona_id],
            qloo=qloo_client.QlooClient(api_key="SYNTHETIC-RECEIVING", transport=transport),
            model=agent.ScriptedModel())
    require(result["mock"] is True, "Fixture source lost its mock provenance")
    require(len(transport.calls) <= 3, "Unexpected expansion of recommendation budget")
    require(result["comparison"]["constraints"] == personas.PERSONAS[persona_id]["constraints"],
            "Saved caregiver constraints changed in the receiving response")
    recommendations = [entry for entry in result["trace"] if entry["tool"] == "qloo_recs"]
    require([entry["args"]["purpose"] for entry in recommendations] ==
            [entry["kind"] for entry in transport.calls], "Retained recommendation purpose mismatch")
    count = len(result["plan"]["meals"]) + int(bool(result["plan"]["outing"]))
    require(result["comparison"]["grounded"]["picks"] == count, "Displayed pick count mismatch")
    return result, transport.calls


manifest = json.loads((ROOT / "source-manifest.json").read_text())
bundle = {
    "schema_version": 1,
    "captured_at_utc": datetime.now(timezone.utc).isoformat(),
    "source": {"repository": manifest["repository"], "commit": manifest["commit"]},
    "generation": {
        "command": "python3 -B capture_current.py",
        "signature": str(inspect.signature(agent.run_agent)),
        "model": "Explicit native ScriptedModel",
        "transport": "Explicit native FixtureTransport, with selected synthetic recommendation refusals",
        "network": "forbidden",
        "python": sys.version,
    },
    "imports": [],
    "fixture_files": [],
    "personas": list(personas.PERSONAS.values()),
    "results": {},
    "cases": [],
}
for module in (agent, constraints, personas, qloo_client):
    path = Path(module.__file__).resolve()
    bundle["imports"].append({"module": module.__name__, "path": str(path),
                              "relative_path": str(path.relative_to(SOURCE)),
                              "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
fixture = SOURCE / "fixtures/qloo_fixtures.json"
bundle["fixture_files"].append({"path": str(fixture), "relative_path": "fixtures/qloo_fixtures.json",
                                "sha256": hashlib.sha256(fixture.read_bytes()).hexdigest()})

healthy_calls = {}
for persona_id in personas.PERSONAS:
    bundle["results"][persona_id], healthy_calls[persona_id] = native_result(persona_id)

scenarios = [
    ("healthy", "rosa", (), 4, True, 0),
    ("outing_unavailable", "outing_unavailable", ("outing",), 4, False, 1),
    ("restaurants_unavailable", "restaurants_unavailable", ("restaurant",), 0, True, 2),
    ("all_recommendations_unavailable", "all_recommendations_unavailable", ("restaurant", "outing"), 0, False, 3),
]
for name, key, kinds, meals, outing, errors in scenarios:
    row = {"name": name, "result_key": key}
    try:
        if name == "healthy":
            result, calls = bundle["results"]["rosa"], healthy_calls["rosa"]
        else:
            result, calls = native_result("rosa", kinds)
            bundle["results"][key] = result
        require(len(result["plan"]["meals"]) == meals, "Unexpected surviving meal count")
        require(bool(result["plan"]["outing"]) == outing, "Unexpected outing availability")
        actual_errors = sum("fresh-main synthetic refusal:" in entry["result_summary"] for entry in result["trace"])
        require(actual_errors == errors, "Structured error lost from native trace")
        require([entry["kind"] for entry in calls] == ["restaurant", "restaurant", "outing"],
                "Rosa's native recommendation/fallback sequence changed")
        if name == "outing_unavailable":
            require(result["plan"]["meals"] == bundle["results"]["rosa"]["plan"]["meals"],
                    "Outing error changed checked meals")
        if name == "restaurants_unavailable":
            require(result["plan"]["outing"] == bundle["results"]["rosa"]["plan"]["outing"],
                    "Restaurant errors changed checked outing")
        if meals == 0:
            require(bool(result["plan"]["notes"]), "Partial plan lost its omission note")
        row.update(passed=True, meals=meals, outing=outing, trace_errors=actual_errors, calls=calls)
    except Exception as error:
        row.update(passed=False, error_type=type(error).__name__, error=str(error), traceback=traceback.format_exc())
    bundle["cases"].append(row)

bundle["passed"] = all(row["passed"] for row in bundle["cases"])
output = ROOT / "evidence/fixture-bundle.json"
output.write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"source": bundle["source"], "imports": bundle["imports"],
                  "cases": [{k: v for k, v in row.items() if k not in ("calls", "traceback")} for row in bundle["cases"]],
                  "result_keys": list(bundle["results"]), "output": str(output), "passed": bundle["passed"]}, indent=2))
sys.exit(0 if bundle["passed"] else 1)
