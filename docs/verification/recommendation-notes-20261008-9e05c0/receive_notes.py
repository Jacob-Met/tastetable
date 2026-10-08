"""Independent native note-provenance cases; never contact a live provider.

TASTETABLE_NOTES_SOURCE selects a directory containing the receiving source.
The unmodified native QlooClient and FixtureTransport exercise validation,
request/cache behavior, response parsing and the actual tool-calling loop.
"""

import copy
import json
import os
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
SOURCE = Path(os.environ.get("TASTETABLE_NOTES_SOURCE", HERE / "baseline"))
sys.path.insert(0, str(SOURCE))
import agent
from personas import PERSONAS
from qloo_client import FixtureTransport, QlooClient, QlooError

RAW = "RAW_REVIEW_PROVIDER_DETAIL synthetic.invalid/internal-diagnostic"
FAILED_R = "A restaurant recommendation lookup could not be completed; any checked suggestions are retained."
FAILED_O = "An outing recommendation lookup could not be completed; any checked suggestions are retained."
REJECTED = {"FIX-P-02", "FIX-P-04", "FIX-P-06", "FIX-P-08", "FIX-P-10",
            "FIX-P-12", "FIX-P-13", "FIX-V-04"}
R_TAGS = ["urn:tag:genre:restaurant:" + kind for kind in
          ("Cuban", "Mexican", "Southern", "Diner", "Japanese", "Italian")]
O_TAGS = ["urn:tag:category:place:" + kind for kind in
          ("jazz_club", "movie_theater", "museum", "concert_hall")]


class FaultFixture(FixtureTransport):
    def __init__(self, actions=None):
        super().__init__(SOURCE / "fixtures/qloo_fixtures.json")
        self.actions = copy.deepcopy(actions or {})
        self.attempts = []

    def _insights(self, params):
        purpose = "outing" if "urn:tag:category:place:" in params.get("filter.tags", "") else "restaurant"
        queue = self.actions.get(purpose, [])
        action = queue.pop(0) if queue else "fixture"
        # FixtureTransport.__call__ has already logged this actual request.
        self.attempts.append({"purpose": purpose, "action": action, "params": dict(params)})
        if action == "503":
            raise QlooError(503, RAW)
        if action == "oserror":
            raise OSError(110, RAW)
        if action == "empty":
            return {"success": True, "results": {"entities": []}}
        if action == "parse_error":
            return {"success": True, "results": {"entities": [
                {"entity_id": "MALFORMED-FIXTURE", "name": "synthetic malformed response",
                 "query": {"affinity": "not-a-number"}}]}}
        result = super()._insights(params)
        if action == "rejected":
            result["results"]["entities"] = [entity for entity in result["results"]["entities"]
                                              if entity["entity_id"] in REJECTED]
        if action == "one":
            result["results"]["entities"] = [entity for entity in result["results"]["entities"]
                                              if entity["entity_id"] == "FIX-P-01"]
        return result


def tool_call(cid, name, args):
    return {"id": cid, "type": "function",
            "function": {"name": name, "arguments": json.dumps(args)}}


def completion(calls=None, text="Review inputs gathered."):
    message = {"role": "assistant", "content": None if calls else text}
    if calls:
        message["tool_calls"] = calls
    return {"choices": [{"message": message}]}


def rec(purpose, **overrides):
    return {"filter_type": "urn:entity:place", "purpose": purpose,
            "tag_ids": R_TAGS if purpose == "restaurant" else O_TAGS,
            "location": "Pasadena", "take": 20, **overrides}


class CountingScript:
    def __init__(self, invalid=None, final_text=None):
        self.native = agent.ScriptedModel()
        self.invalid, self.final_text, self.calls = invalid, final_text, 0
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, **kwargs):
        self.calls += 1
        result = self.native.chat.completions.create(**kwargs)
        message = result["choices"][0]["message"]
        for call in message.get("tool_calls", []):
            if call["function"]["name"] == "qloo_recs" and self.invalid:
                args = json.loads(call["function"]["arguments"])
                args.update(self.invalid)
                call["function"]["arguments"] = json.dumps(args)
        if not message.get("tool_calls") and self.final_text:
            message["content"] = self.final_text
        return result


class SequenceModel:
    def __init__(self, queries, repeat=False):
        self.queries, self.repeat, self.calls = queries, repeat, 0
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, messages, **kwargs):
        step = self.calls
        self.calls += 1
        if self.repeat:
            return completion([tool_call("budget_%s" % step, "qloo_recs",
                                         rec("restaurant", take=10 + step))])
        if step < len(self.queries):
            args = self.queries[step]
            return completion([tool_call(args["purpose"] + "_%s" % step, "qloo_recs", args)])
        if step == len(self.queries):
            calls = []
            for purpose in ("restaurant", "outing"):
                ids = []
                for message in messages:
                    if message.get("role") == "tool" and message.get("tool_call_id", "").startswith(purpose + "_"):
                        ids.extend(entity["entity_id"] for entity in
                                   json.loads(message["content"]).get("candidates", []))
                calls.append(tool_call("check_" + purpose, "constraint_check",
                                       {"entity_ids": sorted(set(ids)), "kind": purpose,
                                        "constraints": PERSONAS["rosa"]["constraints"]}))
            return completion(calls)
        return completion()


def run_case(actions=None, model=None):
    transport = FaultFixture(actions)
    model = model or CountingScript()
    qloo = QlooClient(api_key="SYNTHETIC-REVIEW-NOT-A-KEY", transport=transport)
    with patch("urllib.request.urlopen", side_effect=AssertionError("Live network forbidden in review")):
        result = agent.run_agent(copy.deepcopy(PERSONAS["rosa"]), qloo=qloo, model=model)
    return {"result": result, "requests": transport.log,
            "insight_attempts": transport.attempts, "model_calls": model.calls}


def run_iterable_case(single_pass):
    """Direct native Toolbox callers already accept single-use ID iterables."""
    transport = FaultFixture()
    qloo = QlooClient(api_key="SYNTHETIC-REVIEW-NOT-A-KEY", transport=transport)
    state = agent.AgentState(copy.deepcopy(PERSONAS["rosa"]))
    toolbox = agent.Toolbox(qloo, state)
    tag_ids = ["urn:tag:genre:restaurant:Cuban"]
    signals = ["FIX-A-celia"]
    if single_pass == "tags":
        tag_ids = (value for value in tag_ids)
    else:
        signals = (value for value in signals)
    with patch("urllib.request.urlopen", side_effect=AssertionError("Live network forbidden in review")):
        found = toolbox.qloo_recs("urn:entity:place", "restaurant", tag_ids=tag_ids,
                                 signal_entity_ids=signals, location="Pasadena", take=20)
        checked = toolbox.constraint_check([item["entity_id"] for item in found["candidates"]],
                                           PERSONAS["rosa"]["constraints"], "restaurant")
        result = {"plan": agent.assemble_plan(state), "tool_result": found,
                  "check_result": checked, "trace": state.trace,
                  "candidate_queries": {
                      eid: {key: candidate[key] for key in
                            ("purpose", "query_tags", "signals", "fallback")}
                      for eid, candidate in state.candidates.items()}}
    return {"result": result, "requests": transport.log,
            "insight_attempts": transport.attempts, "model_calls": 0}


def collect():
    cases = {
        "healthy": run_case(),
        "all_503": run_case({"restaurant": ["503", "503"], "outing": ["503"]}),
        "all_oserror": run_case({"restaurant": ["oserror", "oserror"], "outing": ["oserror"]}),
        "model_prose": run_case({"restaurant": ["503", "503"], "outing": ["503"]},
            CountingScript(final_text="All restaurants are unsafe. " + RAW)),
        "empty_success": run_case({"restaurant": ["empty", "empty"], "outing": ["empty"]}),
        "constraint_rejection": run_case({"restaurant": ["rejected", "rejected"], "outing": ["rejected"]}),
        "outing_failure": run_case({"outing": ["503"]}),
        "partial_restaurants": run_case({"restaurant": ["one", "503"]}),
        "invalid_filter": run_case(model=CountingScript(invalid={"filter_type": "unsupported-review-type"})),
        "invalid_ids": run_case(model=CountingScript(invalid={"tag_ids": [123]})),
        "parsed_response_failure": run_case({"restaurant": ["parse_error", "parse_error"], "outing": ["parse_error"]}),
        "same_query_recovery": run_case({"restaurant": ["503", "fixture"]},
            SequenceModel([rec("restaurant"), rec("restaurant"), rec("outing")])),
        "different_query_success": run_case({"restaurant": ["503", "fixture"]},
            SequenceModel([rec("restaurant"), rec("restaurant", take=19), rec("outing")])),
        "empty_after_failure": run_case({"restaurant": ["503", "empty"]},
            SequenceModel([rec("restaurant"), rec("restaurant"), rec("outing")])),
        "optional_input_recovery": run_case({"restaurant": ["503", "fixture"]},
            SequenceModel([
                {"filter_type": "urn:entity:place", "purpose": "restaurant"},
                {"filter_type": "urn:entity:place", "purpose": "restaurant", "tag_ids": [],
                 "signal_entity_ids": [], "location": "", "take": 10}])),
        "budget": run_case({"restaurant": ["503"] * 12}, SequenceModel([], repeat=True)),
        "single_pass_tags": run_iterable_case("tags"),
        "single_pass_signals": run_iterable_case("signals"),
    }
    return cases


def without_notes(value):
    value = copy.deepcopy(value)
    value["result"]["plan"].pop("notes")
    return value


CASES = {}
BASELINE = {}


class NoteReceivingTest(unittest.TestCase):
    def notes(self, name):
        return CASES[name]["result"]["plan"]["notes"]

    def no_invented_rejections(self, name):
        text = " ".join(self.notes(name)).lower()
        self.assertNotIn("unsafe", text)
        self.assertNotIn("passed every constraint", text)
        self.assertNotIn("rejected", text)

    def test_all_native_503_failures_have_factual_lookup_notes(self):
        self.assertEqual(len(CASES["all_503"]["insight_attempts"]), 3)
        self.assertIn(FAILED_R, self.notes("all_503"))
        self.assertIn(FAILED_O, self.notes("all_503"))
        self.no_invented_rejections("all_503")

    def test_native_oserror_failures_receive_the_same_plain_explanation(self):
        self.assertIn(FAILED_R, self.notes("all_oserror"))
        self.assertIn(FAILED_O, self.notes("all_oserror"))
        self.no_invented_rejections("all_oserror")

    def test_successful_empty_results_are_not_outages_or_rejections(self):
        self.assertEqual(len(CASES["empty_success"]["insight_attempts"]), 3)
        self.assertNotIn(FAILED_R, self.notes("empty_success"))
        self.assertNotIn(FAILED_O, self.notes("empty_success"))
        self.no_invented_rejections("empty_success")
        self.assertNotEqual(self.notes("empty_success"), self.notes("all_503"))

    def test_genuine_constraint_rejections_keep_their_evidence(self):
        result = CASES["constraint_rejection"]["result"]
        self.assertGreater(len(result["plan"]["rejected"]), 0)
        note_text = " ".join(self.notes("constraint_rejection")).lower()
        self.assertTrue("constraint" in note_text or "requested checks" in note_text)
        self.assertNotIn(FAILED_R, self.notes("constraint_rejection"))
        self.assertNotIn(FAILED_O, self.notes("constraint_rejection"))

    def test_outing_failure_preserves_meals_and_is_purpose_specific(self):
        self.assertEqual(len(CASES["outing_failure"]["result"]["plan"]["meals"]), 4)
        self.assertIsNone(CASES["outing_failure"]["result"]["plan"]["outing"])
        self.assertIn(FAILED_O, self.notes("outing_failure"))
        self.assertNotIn(FAILED_R, self.notes("outing_failure"))

    def test_partial_restaurant_failure_retains_checked_meal_and_outing(self):
        result = CASES["partial_restaurants"]["result"]
        self.assertEqual([item["entity_id"] for item in result["plan"]["meals"]], ["FIX-P-01"])
        self.assertIsNotNone(result["plan"]["outing"])
        self.assertIn(FAILED_R, self.notes("partial_restaurants"))
        self.assertNotIn(FAILED_O, self.notes("partial_restaurants"))

    def test_invalid_pre_request_arguments_do_not_claim_provider_failure(self):
        for name in ("invalid_filter", "invalid_ids"):
            with self.subTest(name=name):
                self.assertEqual(CASES[name]["insight_attempts"], [])
                self.assertNotIn(FAILED_R, self.notes(name))
                self.assertNotIn(FAILED_O, self.notes(name))
                self.no_invented_rejections(name)

    def test_response_parse_failure_is_never_reported_as_empty_or_constraint_rejection(self):
        name = "parsed_response_failure"
        self.assertEqual(len(CASES[name]["insight_attempts"]), 3)
        self.assertTrue(any("ValueError" in row["result_summary"] for row in CASES[name]["result"]["trace"]))
        self.assertIn(FAILED_R, self.notes(name))
        self.assertIn(FAILED_O, self.notes(name))
        self.no_invented_rejections(name)
        self.assertFalse(any("returned no" in note.lower() for note in self.notes(name)))

    def test_same_query_success_clears_failed_lookup_but_another_query_does_not(self):
        self.assertNotIn(FAILED_R, self.notes("same_query_recovery"))
        self.assertEqual(len(CASES["same_query_recovery"]["result"]["plan"]["meals"]), 4)
        self.assertIn(FAILED_R, self.notes("different_query_success"))
        self.assertEqual(len(CASES["different_query_success"]["result"]["plan"]["meals"]), 4)

    def test_empty_same_query_recovery_does_not_retain_stale_failure(self):
        self.assertNotIn(FAILED_R, self.notes("empty_after_failure"))
        self.no_invented_rejections("empty_after_failure")
        self.assertEqual(CASES["empty_after_failure"]["result"]["plan"]["meals"], [])

    def test_optional_input_normalization_matches_actual_native_request(self):
        attempts = CASES["optional_input_recovery"]["insight_attempts"]
        self.assertEqual(len(attempts), 2)
        self.assertEqual(attempts[0]["params"], attempts[1]["params"])
        self.assertNotIn(FAILED_R, self.notes("optional_input_recovery"))

    def test_raw_provider_diagnostics_do_not_enter_plan_notes(self):
        for name, case in CASES.items():
            with self.subTest(name=name):
                text = " ".join(case["result"]["plan"]["notes"])
                self.assertNotIn(RAW, text)
                self.assertNotIn("Qloo HTTP", text)
                self.assertNotIn("synthetic.invalid", text)

    def test_model_final_prose_does_not_determine_plan_notes(self):
        self.assertIn(RAW, CASES["model_prose"]["result"]["model_message"])
        self.assertEqual(self.notes("model_prose"), self.notes("all_503"))

    def test_original_call_budget_is_preserved_without_automatic_retries(self):
        case = CASES["budget"]
        self.assertEqual(agent.MAX_STEPS, 12)
        self.assertEqual(case["model_calls"], 12)
        self.assertEqual(len(case["insight_attempts"]), 12)
        self.assertEqual([row["step"] for row in case["result"]["trace"]], list(range(12)))
        self.assertEqual(self.notes("budget").count(FAILED_R), 1)

    def test_single_pass_toolbox_inputs_preserve_native_request_and_ranking(self):
        for name in ("single_pass_tags", "single_pass_signals"):
            with self.subTest(name=name):
                case = CASES[name]
                self.assertEqual(len(case["insight_attempts"]), 1)
                params = case["insight_attempts"][0]["params"]
                self.assertEqual(params["filter.tags"], "urn:tag:genre:restaurant:Cuban")
                self.assertEqual(params["signal.interests.entities"], "FIX-A-celia")
                self.assertEqual(without_notes(case), without_notes(BASELINE[name]))

    def test_all_non_note_results_traces_and_requests_match_exact_receiving_source(self):
        self.assertEqual(set(CASES), set(BASELINE))
        for name in CASES:
            with self.subTest(name=name):
                self.assertEqual(without_notes(CASES[name]), without_notes(BASELINE[name]))


if __name__ == "__main__":
    CASES = collect()
    output = Path(os.environ.get("TASTETABLE_NOTES_OBSERVATIONS", HERE / "observations.json"))
    output.write_text(json.dumps(CASES, indent=2) + "\n")
    baseline = Path(os.environ.get("TASTETABLE_NOTES_BASELINE_RESULTS", HERE / "baseline-results.json"))
    if SOURCE.resolve() == (HERE / "baseline").resolve() and not baseline.exists():
        baseline.write_text(json.dumps(CASES, indent=2) + "\n")
    BASELINE = json.loads(baseline.read_text())
    unittest.main(verbosity=2)
