"""A malformed recommendation must not poison a later valid model repair."""
import copy
import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

SOURCE = Path(os.environ.get("TASTETABLE_SOURCE_ROOT", Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(SOURCE))

import agent
from personas import PERSONAS
from qloo_client import FixtureTransport, QlooClient


class RepairModel:
    def __init__(self):
        self.turn = 0
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, **kwargs):
        calls = [
            ("qloo_recs", {"filter_type": "urn:entity:place", "purpose": None, "take": 50}),
            ("qloo_recs", {"filter_type": "urn:entity:place", "purpose": "restaurant", "take": 50}),
            ("constraint_check", {"entity_ids": ["FIX-P-01"], "constraints": [], "kind": "restaurant"}),
        ]
        message = {"role": "assistant", "content": "Finished"}
        if self.turn < len(calls):
            name, args = calls[self.turn]
            message["tool_calls"] = [{"id": f"repair-{self.turn}", "type": "function",
                                      "function": {"name": name, "arguments": json.dumps(args)}}]
        self.turn += 1
        return {"choices": [{"message": message}]}


class RecommendationPurposeTests(unittest.TestCase):
    def setUp(self):
        self.persona = copy.deepcopy(PERSONAS["rosa"])
        self.addCleanup(patch.stopall)
        patch.object(agent.os, "environ", {}).start()
        patch("urllib.request.urlopen", side_effect=AssertionError("provider network forbidden")).start()

    def test_api_recovers_a_valid_checked_meal_after_a_malformed_recommendation(self):
        from fastapi.testclient import TestClient
        import app

        fixture = FixtureTransport()
        client = QlooClient(api_key="synthetic-fixture-only", transport=fixture)
        with patch.object(app.QlooClient, "from_env", return_value=client), \
             patch.object(app, "model_from_env", return_value=RepairModel()):
            response = TestClient(app.app).post("/api/plan", json=self.persona)
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual([m["entity_id"] for m in result["plan"]["meals"]], ["FIX-P-01"])
        self.assertIsNone(result["plan"]["outing"])
        self.assertIn("ValueError", result["trace"][0]["result_summary"])
        self.assertIn("purpose", result["trace"][0]["result_summary"])
        for label in ("Soft foods", "Low sodium", "Wheelchair"):
            self.assertIn(f"{label}: pass", result["plan"]["meals"][0]["why"])

    def test_invalid_purposes_cannot_fetch_or_reserve_candidate_state(self):
        fixture = FixtureTransport()
        client = QlooClient(api_key="synthetic-fixture-only", transport=fixture)
        state = agent.AgentState(persona=self.persona)
        tools = agent.Toolbox(client, state)
        for purpose in (None, "", "meal", True, 0, [], {}):
            with self.subTest(purpose=purpose):
                before = copy.deepcopy((state.candidates, state.verdicts))
                result = tools.run("qloo_recs", {"filter_type": "urn:entity:place",
                                                "purpose": purpose, "take": 50})
                self.assertIn("error", result)
                self.assertEqual(fixture.log, [])
                self.assertEqual((state.candidates, state.verdicts), before)


if __name__ == "__main__":
    unittest.main(verbosity=2)
