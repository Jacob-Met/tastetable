"""A model can correct malformed arguments without losing checked work."""
from __future__ import annotations

import copy
import json
import os
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SOURCE = Path(os.environ.get("TASTETABLE_SOURCE_ROOT", Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(SOURCE))
import agent
from personas import PERSONAS
from qloo_client import FixtureTransport, QlooClient


def malformed(raw="{\"filter_type\":", name="qloo_recs", call_id="malformed"):
    return {"id": call_id, "type": "function", "function": {"name": name, "arguments": raw}}


def fetched():
    return agent._call("fetched", "qloo_recs", {
        "filter_type": "urn:entity:place", "purpose": "restaurant",
        "tag_ids": ["urn:tag:genre:restaurant:Cuban"]})


def checked():
    return agent._call("checked", "constraint_check", {
        "entity_ids": ["FIX-P-01", "FIX-P-04"],
        "constraints": PERSONAS["rosa"]["constraints"], "kind": "restaurant"})


class Replies:
    def __init__(self, batches):
        self.batches = iter(batches)
        self.messages = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, **kwargs):
        self.messages.append(copy.deepcopy(kwargs["messages"]))
        batch = next(self.batches, [])
        return agent._completion("Completed authored correction" if not batch else None,
                                 tool_calls=batch)


class ToolArgumentRecovery(unittest.TestCase):
    def setUp(self):
        self.addCleanup(patch.stopall)
        patch.object(agent.os, "environ", {}).start()
        patch("urllib.request.urlopen", side_effect=AssertionError("external network forbidden")).start()

    def run_plan(self, batches):
        fixture = FixtureTransport()
        client = QlooClient(api_key="synthetic-argument-receiving", transport=fixture)
        model = Replies(batches)
        result = agent.run_agent(PERSONAS["rosa"], qloo=client, model=model)
        return result, model, fixture

    def check_one_meal(self, result):
        self.assertEqual([p["entity_id"] for p in result["plan"]["meals"]], ["FIX-P-01"])
        self.assertEqual(result["comparison"]["grounded"]["constraint_checked"], 1)
        self.assertEqual([p["entity_id"] for p in result["plan"]["rejected"]], ["FIX-P-04"])
        self.assertIn("Soft foods: pass", result["plan"]["meals"][0]["why"])
        self.assertTrue(result["mock"])

    def test_later_invalid_json_preserves_already_checked_work(self):
        result, model, fixture = self.run_plan([[fetched()], [checked()], [malformed()]])
        self.check_one_meal(result)
        self.assertEqual(len(fixture.log), 1, "invalid recommendation must not call Qloo")
        self.assertEqual(len(model.messages), 4)
        self.assertIsNone(result["trace"][-1]["args"])
        self.assertTrue(result["trace"][-1]["result_summary"].startswith("JSONDecodeError:"))
        self.assertEqual(result["model_message"], "Completed authored correction")

    def test_model_receives_correlated_error_and_can_correct_its_next_call(self):
        result, model, fixture = self.run_plan([[malformed()], [fetched()], [checked()]])
        self.check_one_meal(result)
        error_message = model.messages[1][-1]
        self.assertEqual((error_message["role"], error_message["tool_call_id"]), ("tool", "malformed"))
        self.assertTrue(json.loads(error_message["content"])["error"].startswith("JSONDecodeError:"))
        self.assertEqual(len(fixture.log), 1)

    def test_decoder_limits_preserve_prior_checked_work(self):
        cases = [
            ("integer", "{\"take\":" + "9" * 5000 + "}", "ValueError:"),
            ("nesting", "{\"take\":" + "[" * 12000 + "0" + "]" * 12000 + "}", "RecursionError:"),
        ]
        limits = (sys.get_int_max_str_digits(), sys.getrecursionlimit())
        for name, raw, error_prefix in cases:
            with self.subTest(case=name):
                result, model, fixture = self.run_plan([[fetched()], [checked()], [malformed(raw)]])
                self.check_one_meal(result)
                self.assertIsNone(result["trace"][-1]["args"])
                self.assertTrue(result["trace"][-1]["result_summary"].startswith(error_prefix))
                self.assertEqual(len(fixture.log), 1)
                self.assertEqual(len(model.messages), 4)
                self.assertEqual((sys.get_int_max_str_digits(), sys.getrecursionlimit()), limits)

    def test_valid_sibling_calls_still_run_once_after_an_invalid_call(self):
        result, model, fixture = self.run_plan([[malformed(), fetched()], [checked()]])
        self.check_one_meal(result)
        replies = [m for m in model.messages[1] if m["role"] == "tool"]
        self.assertEqual([m["tool_call_id"] for m in replies], ["malformed", "fetched"])
        self.assertIn("error", json.loads(replies[0]["content"]))
        self.assertIn("candidates", json.loads(replies[1]["content"]))
        self.assertEqual(len(model.messages), 3)
        self.assertEqual(len(fixture.log), 1)

    def test_nonstring_arguments_are_errors_without_dispatch(self):
        for raw in ({"purpose": "restaurant"}, ["restaurant"], 1, True):
            with self.subTest(raw=raw):
                result, model, fixture = self.run_plan([[malformed(raw)]])
                self.assertEqual(result["plan"]["meals"], [])
                self.assertIsNone(result["plan"]["outing"])
                self.assertEqual(fixture.log, [])
                self.assertEqual(len(model.messages), 2)
                self.assertIsNone(result["trace"][0]["args"])
                self.assertTrue(result["trace"][0]["result_summary"].startswith("TypeError:"))

    def test_decoded_nonobjects_keep_the_existing_tool_error_path(self):
        for raw, decoded in [("[]", []), ("null", None), ("17", 17), ('"text"', "text"), ("", {}), (None, {})]:
            with self.subTest(raw=raw):
                result, model, fixture = self.run_plan([[malformed(raw)]])
                self.assertEqual(result["trace"][0]["args"], decoded)
                self.assertTrue(result["trace"][0]["result_summary"].startswith("TypeError:"))
                self.assertEqual(result["plan"]["meals"], [])
                self.assertEqual(fixture.log, [])

    def test_invalid_check_never_promotes_a_fetched_unchecked_candidate(self):
        result, model, fixture = self.run_plan([[fetched()], [malformed("{", "constraint_check")]])
        self.assertEqual(result["plan"]["meals"], [])
        self.assertIsNone(result["plan"]["outing"])
        self.assertEqual(result["comparison"]["grounded"]["constraint_checked"], 0)
        self.assertTrue(result["plan"]["notes"])
        self.assertEqual(len(fixture.log), 1)

    def test_repeated_bad_arguments_do_not_expand_the_existing_model_budget(self):
        result, model, fixture = self.run_plan([
            [malformed("{", call_id=f"bad-{i}")] for i in range(agent.MAX_STEPS + 2)])
        self.assertEqual(len(model.messages), agent.MAX_STEPS)
        self.assertEqual(len(result["trace"]), agent.MAX_STEPS)
        self.assertTrue(all(t["result_summary"].startswith("JSONDecodeError:") for t in result["trace"]))
        self.assertEqual(result["plan"]["meals"], [])
        self.assertEqual(fixture.log, [])

    def test_real_app_routes_retain_checked_meals_and_the_parse_error(self):
        from fastapi.testclient import TestClient
        import app

        def client():
            return QlooClient(api_key="synthetic-api-receiving", transport=FixtureTransport())

        with patch.object(app.QlooClient, "from_env", side_effect=client), \
             patch.object(app, "model_from_env", side_effect=lambda: Replies([[fetched()], [checked()], [malformed()]])):
            http = TestClient(app.app)
            for route, body in [("/api/plan/sample/rosa", None), ("/api/plan", PERSONAS["rosa"])]:
                with self.subTest(route=route):
                    response = http.post(route, json=body)
                    self.assertEqual(response.status_code, 200)
                    result = response.json()
                    self.check_one_meal(result)
                    self.assertTrue(result["trace"][-1]["result_summary"].startswith("JSONDecodeError:"))

    def test_unrenderable_decoded_arguments_do_not_lose_checked_api_work(self):
        from fastapi.testclient import TestClient
        import app

        cases = [
            ("deep list", "[" * 1100 + "0" + "]" * 1100),
            ("deep object", '{"nested":' * 1100 + "0" + "}" * 1100),
            ("nonfinite scalar", "NaN"),
            ("nonfinite member", '{"unknown":Infinity}'),
            ("surrogate value", '"\\ud800"'),
            ("surrogate keyword and error", '{"\\ud800":1}'),
        ]
        limits = (sys.get_int_max_str_digits(), sys.getrecursionlimit())
        original_dispatch = agent.Toolbox.run
        for label, raw in cases:
            with self.subTest(case=label):
                fixture = FixtureTransport()
                model = Replies([[fetched()], [checked()], [malformed(raw)]])
                dispatched = []

                def dispatch(toolbox, name, args):
                    dispatched.append((name, args))
                    return original_dispatch(toolbox, name, args)

                with patch.object(app.QlooClient, "from_env", return_value=QlooClient(
                        api_key="synthetic-trace-receiving", transport=fixture)), \
                     patch.object(app, "model_from_env", return_value=model), \
                     patch.object(agent.Toolbox, "run", dispatch), \
                     TestClient(app.app) as http:
                    response = http.post("/api/plan", json=PERSONAS["rosa"])
                self.assertEqual(response.status_code, 200)
                result = response.json()
                self.check_one_meal(result)
                self.assertIn("trace_omitted", result["trace"][-1]["args"])
                self.assertTrue(result["trace"][-1]["result_summary"].startswith("TypeError:"))
                self.assertEqual([name for name, _ in dispatched], ["qloo_recs", "constraint_check", "qloo_recs"])
                if label == "deep list":
                    value, depth = dispatched[-1][1], 0
                    while isinstance(value, list):
                        depth += 1
                        value = value[0]
                    self.assertEqual((depth, value), (1100, 0), "dispatch must receive the complete decoded value")
                self.assertEqual(len(fixture.log), 1)
                self.assertEqual(len(model.messages), 4)
                self.assertEqual(result["model_message"], "Completed authored correction")
                correlated = model.messages[-1][-1]
                self.assertEqual(correlated["tool_call_id"], "malformed")
                self.assertTrue(json.loads(correlated["content"])["error"].startswith("TypeError:"))
                self.assertEqual((sys.get_int_max_str_digits(), sys.getrecursionlimit()), limits)

    def test_ordinary_trace_arguments_and_error_text_keep_their_values(self):
        for raw in ('{"unknown":[1,{"label":"caf\\u00e9"}]}', "[]", "17", "null", '"caf\\u00e9"'):
            with self.subTest(raw=raw):
                result, model, fixture = self.run_plan([[fetched()], [checked()], [malformed(raw)]])
                self.check_one_meal(result)
                self.assertEqual(result["trace"][-1]["args"], json.loads(raw))
                tool_error = json.loads(model.messages[-1][-1]["content"])["error"]
                self.assertEqual(result["trace"][-1]["result_summary"], tool_error)
                self.assertEqual(len(fixture.log), 1)

    def test_surrogate_tool_name_is_escaped_only_in_diagnostics(self):
        from fastapi.testclient import TestClient
        import app

        model = Replies([[fetched()], [checked()], [malformed("{}", "unknown-\ud800")]])
        fixture = FixtureTransport()
        with patch.object(app.QlooClient, "from_env", return_value=QlooClient(
                api_key="synthetic-tool-name", transport=fixture)), \
             patch.object(app, "model_from_env", return_value=model), \
             TestClient(app.app) as http:
            response = http.post("/api/plan/sample/rosa")
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.check_one_meal(result)
        self.assertEqual(result["trace"][-1]["tool"], "unknown-\\ud800")
        self.assertEqual(model.messages[-1][-2]["tool_calls"][0]["function"]["name"], "unknown-\ud800")
        self.assertEqual(len(fixture.log), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
