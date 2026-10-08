"""Independent combined receiving for the actual current-main composition.

The real FastAPI handlers, configured-model factory/client, tool loop and final
assembly run with serialized authored model replies and synthetic local venues.
No provider request is sent. Production files remain exact source-pin bytes.
"""
from __future__ import annotations

import io
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

SOURCE = Path(os.environ.get("TASTETABLE_SOURCE_ROOT", Path(__file__).parent / "candidate"))
sys.path.insert(0, str(SOURCE))

from fastapi.testclient import TestClient
import app
from personas import PERSONAS
from qloo_client import FixtureTransport, QlooClient, QlooError

RECEIPTS = []


class InterruptedFixture(FixtureTransport):
    def __init__(self):
        super().__init__()
        self.insights = []

    def __call__(self, path, params, headers):
        if path == "/v2/insights":
            self.insights.append(dict(params))
            if len(self.insights) in (1, 3):
                raise QlooError(503, "independent authored composition refusal")
        return super().__call__(path, params, headers)


class CurrentComposition(unittest.TestCase):
    def test_configured_model_repairs_invalid_purpose_and_refusal_without_weakening_care(self):
        results = []
        for sample in (False, True):
            with self.subTest(sample=sample):
                fixture = InterruptedFixture()
                qloo = QlooClient(api_key="synthetic-fixture-only", transport=fixture)
                posted = []
                recs = {"filter_type": "urn:entity:place", "take": 50}
                calls = [
                    ("qloo_recs", {**recs, "purpose": None}),
                    ("qloo_recs", {**recs, "purpose": "restaurant"}),
                    ("qloo_recs", {**recs, "purpose": "restaurant"}),
                    ("constraint_check", {"entity_ids": ["FIX-P-01", "FIX-P-04"],
                                          "constraints": [], "kind": "outing"}),
                    ("qloo_recs", {**recs, "purpose": ""}),
                    ("constraint_check", {"entity_ids": ["FIX-P-04"],
                                          "constraints": [], "kind": "restaurant"}),
                    ("qloo_recs", {**recs, "purpose": "outing"}),
                ]

                def completion(request, timeout):
                    self.assertEqual(request.full_url, "https://composition.invalid/v1/chat/completions")
                    self.assertEqual(request.get_method(), "POST")
                    self.assertNotIn("Authorization", request.headers)
                    body = json.loads(request.data)
                    self.assertEqual(body["model"], "current-composition-authored-model")
                    posted.append(body)
                    turn = len(posted) - 1
                    self.assertLessEqual(turn, len(calls))
                    message = {"role": "assistant", "content": "authored combined receiving complete"}
                    if turn < len(calls):
                        name, args = calls[turn]
                        message["tool_calls"] = [{"id": f"composition-{turn}", "type": "function",
                            "function": {"name": name, "arguments": json.dumps(args)}}]
                    return io.BytesIO(json.dumps({"choices": [{"message": message}]}).encode())

                env = {"TASTETABLE_LLM_BASE_URL": "https://composition.invalid/v1",
                       "TASTETABLE_LLM_MODEL": "current-composition-authored-model"}
                with patch.dict(os.environ, env, clear=True), \
                        patch("urllib.request.urlopen", side_effect=completion), \
                        patch.object(app.QlooClient, "from_env", return_value=qloo), \
                        TestClient(app.app, raise_server_exceptions=False) as client:
                    response = (client.post("/api/plan/sample/rosa") if sample else
                                client.post("/api/plan", json=PERSONAS["rosa"]))
                self.assertEqual(response.status_code, 200, response.text)
                result = response.json()
                self.assertEqual(len(posted), 8)
                self.assertEqual(len(fixture.insights), 3,
                                 "malformed purposes must not contact or shift the provider sequence")
                trace = result["trace"]
                self.assertEqual(len(trace), 7)
                self.assertEqual([row["args"] for row in trace], [args for _, args in calls])
                for index in (0, 4):
                    self.assertEqual(trace[index]["result_summary"],
                                     "ValueError: purpose must be restaurant or outing")
                for index in (1, 6):
                    self.assertIn("QlooError:", trace[index]["result_summary"])
                    self.assertIn("503", trace[index]["result_summary"])
                self.assertEqual(trace[3]["result_summary"], "1/2 passed")
                self.assertEqual(trace[5]["result_summary"], "0/1 passed")
                self.assertEqual([meal["entity_id"] for meal in result["plan"]["meals"]], ["FIX-P-01"])
                self.assertEqual([meal["day"] for meal in result["plan"]["meals"]], ["Monday"])
                self.assertIsNone(result["plan"]["outing"])
                self.assertEqual([row["entity_id"] for row in result["plan"]["rejected"]], ["FIX-P-04"])
                self.assertEqual({row["constraint"] for row in result["plan"]["rejected"][0]["failed"]},
                                 set(PERSONAS["rosa"]["constraints"]))
                for label in ("Soft foods", "Low sodium", "Wheelchair"):
                    self.assertIn(f"{label}: pass", result["plan"]["meals"][0]["why"])
                self.assertEqual(result["comparison"]["grounded"]["picks"], 1)
                self.assertEqual(result["comparison"]["grounded"]["constraint_checked"], 1)
                self.assertEqual(result["model_message"], "authored combined receiving complete")
                self.assertEqual(result["comparison"]["constraints"], PERSONAS["rosa"]["constraints"])
                self.assertTrue(result["mock"])
                RECEIPTS.append({"sample_route": sample, "status_code": response.status_code,
                    "model_names": [body["model"] for body in posted],
                    "insights_attempts": fixture.insights, "result": result})
                results.append(result)
        self.assertEqual(results[0], results[1], "sample and form routes must enforce identical requirements")


if __name__ == "__main__":
    program = unittest.main(verbosity=2, exit=False)
    output = os.environ.get("TASTETABLE_COMPOSITION_RECEIPT")
    if output:
        Path(output).write_text(json.dumps({"source": str(SOURCE),
            "status": "pass" if program.result.wasSuccessful() else "fail",
            "python": sys.version, "optimized": sys.flags.optimize,
            "routes": RECEIPTS}, indent=2) + "\n")
    sys.exit(0 if program.result.wasSuccessful() else 1)
