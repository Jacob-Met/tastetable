"""Receive the model/error fixes through the real FastAPI routes, offline.

Set TASTETABLE_SOURCE_ROOT to run this unchanged test against a different
checkout. The configured-model test authors chat replies in memory; it does
not call or qualify a live model/provider.
"""
from __future__ import annotations

import io
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

SOURCE = Path(os.environ.get("TASTETABLE_SOURCE_ROOT", Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(SOURCE))

from fastapi.testclient import TestClient
import app as web
from personas import PERSONAS
from qloo_client import FixtureTransport, QlooClient, QlooError


class RefusingFixture(FixtureTransport):
    def __init__(self, refused=()):
        super().__init__()
        self.refused = set(refused)
        self.insights_calls = []

    def __call__(self, path, params, headers):
        if path == "/v2/insights":
            self.insights_calls.append(dict(params))
            if len(self.insights_calls) in self.refused:
                raise QlooError(503, "authored receiving refusal")
        return super().__call__(path, params, headers)


class ApiReceiving(unittest.TestCase):
    def setUp(self):
        self.addCleanup(patch.stopall)
        # The application's actual factories run with only authored variables.
        patch.dict(os.environ, {}, clear=True).start()
        patch("urllib.request.urlopen", side_effect=AssertionError("network forbidden")).start()
        self.client = TestClient(web.app, raise_server_exceptions=False)
        self.addCleanup(self.client.close)

    def request_plan(self, pid="rosa", *, sample=False, refused=()):
        fixture = RefusingFixture(refused)
        qloo = QlooClient(api_key="authored-fixture-key", transport=fixture)
        with patch.object(web.QlooClient, "from_env", return_value=qloo):
            if sample:
                response = self.client.post(f"/api/plan/sample/{pid}")
            else:
                response = self.client.post("/api/plan", json=PERSONAS[pid])
        return response, fixture

    def assert_success(self, response):
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertTrue(result["mock"])
        return result

    def test_sample_and_form_routes_return_same_complete_fixture_plan(self):
        for pid in PERSONAS:
            with self.subTest(persona=pid):
                form = self.assert_success(self.request_plan(pid)[0])
                sample = self.assert_success(self.request_plan(pid, sample=True)[0])
                self.assertEqual(form, sample)
                self.assertEqual(len(form["plan"]["meals"]), 4)
                self.assertIsNotNone(form["plan"]["outing"])
                self.assertEqual(form["comparison"]["grounded"]["picks"], 5)

    def test_outing_refusal_preserves_checked_meals_through_both_routes(self):
        for sample in (False, True):
            with self.subTest(sample=sample):
                healthy = self.assert_success(self.request_plan(sample=sample)[0])
                response, fixture = self.request_plan(sample=sample, refused={3})
                result = self.assert_success(response)
                self.assertEqual(result["plan"]["meals"], healthy["plan"]["meals"])
                self.assertIsNone(result["plan"]["outing"])
                self.assertEqual(result["comparison"]["grounded"]["picks"], 4)
                errors = [row for row in result["trace"]
                          if row["result_summary"].startswith("QlooError:")]
                self.assertEqual(len(errors), 1)
                self.assertEqual(errors[0]["args"]["purpose"], "outing")
                self.assertIn("503", errors[0]["result_summary"])
                self.assertEqual(len(fixture.insights_calls), 3)

    def test_all_recommendation_refusals_return_an_empty_plan_with_evidence(self):
        response, fixture = self.request_plan(refused={1, 2, 3})
        result = self.assert_success(response)
        self.assertEqual(result["plan"]["meals"], [])
        self.assertIsNone(result["plan"]["outing"])
        self.assertTrue(result["plan"]["notes"])
        self.assertEqual(result["comparison"]["grounded"]["picks"], 0)
        self.assertEqual(result["comparison"]["grounded"]["with_qloo_entity_id"], 0)
        errors = [row for row in result["trace"]
                  if row["result_summary"].startswith("QlooError:")]
        self.assertEqual(len(errors), 3)
        self.assertEqual(len(fixture.insights_calls), 3)

    def test_configured_model_reaches_every_step_from_both_api_routes(self):
        for sample in (False, True):
            with self.subTest(sample=sample):
                posted = []

                def completion(request, timeout):
                    self.assertEqual(request.full_url, "https://receiving.invalid/v1/chat/completions")
                    self.assertEqual(request.get_method(), "POST")
                    self.assertNotIn("Authorization", request.headers)
                    body = json.loads(request.data)
                    posted.append(body)
                    step = len(posted)
                    message = {"role": "assistant", "content": None}
                    if step == 1:
                        name = "qloo_recs"
                        args = {"filter_type": "urn:entity:place", "purpose": "restaurant",
                                "tag_ids": ["urn:tag:genre:restaurant:Cuban"], "take": 10}
                    elif step == 2:
                        candidates = json.loads(body["messages"][-1]["content"])["candidates"]
                        name = "constraint_check"
                        args = {"entity_ids": [entry["entity_id"] for entry in candidates],
                                "constraints": PERSONAS["rosa"]["constraints"], "kind": "restaurant"}
                    elif step == 3:
                        message["content"] = "authored receiving completion"
                    else:
                        self.fail("agent exceeded the authored three-step exchange")
                    if step < 3:
                        message["tool_calls"] = [{"id": f"receiving-{step}", "type": "function",
                                                  "function": {"name": name,
                                                               "arguments": json.dumps(args)}}]
                    return io.BytesIO(json.dumps({"choices": [{"message": message}]}).encode())

                authored_env = {"TASTETABLE_LLM_BASE_URL": "https://receiving.invalid/v1",
                                "TASTETABLE_LLM_MODEL": "receiving-configured-model"}
                with patch.dict(os.environ, authored_env, clear=True), \
                        patch("urllib.request.urlopen", side_effect=completion):
                    response, fixture = self.request_plan(sample=sample)
                result = self.assert_success(response)
                self.assertEqual([body["model"] for body in posted], ["receiving-configured-model"] * 3)
                self.assertEqual(result["model_message"], "authored receiving completion")
                self.assertTrue(result["plan"]["meals"])
                self.assertEqual(len(fixture.insights_calls), 1)
                persona_message = next(message for message in posted[0]["messages"]
                                       if message["role"] == "user")
                self.assertEqual(set(json.loads(persona_message["content"])),
                                 {"cuisines", "music", "films", "constraints", "city"})

    def test_invalid_requests_stop_before_provider_factories(self):
        with patch.object(web.QlooClient, "from_env", side_effect=AssertionError("unexpected Qloo factory")), \
                patch.object(web, "model_from_env", side_effect=AssertionError("unexpected model factory")):
            self.assertEqual(self.client.post("/api/plan", json={}).status_code, 400)
            self.assertEqual(self.client.post("/api/plan", json={"cuisines": ["Cuban"],
                                                               "constraints": ["unsupported"]}).status_code, 400)
            self.assertEqual(self.client.post("/api/plan/sample/missing").status_code, 404)


if __name__ == "__main__":
    unittest.main(verbosity=2)
