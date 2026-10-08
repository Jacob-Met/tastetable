"""Recommendation completion notes over actual native fixture/client boundaries."""
from __future__ import annotations

import copy
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

SOURCE = Path(os.environ.get("TASTETABLE_SOURCE_ROOT", Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(SOURCE))
import agent
from personas import PERSONAS
from qloo_client import FixtureTransport, QlooClient, QlooError


class ScheduledFixture(FixtureTransport):
    """The native base transport logs a real invocation before these outcomes."""
    def __init__(self, outcomes=()):
        super().__init__()
        self.outcomes = list(outcomes)

    def _insights(self, params):
        outcome = self.outcomes.pop(0) if self.outcomes else "ok"
        if outcome == "error":
            raise QlooError(503, "INTERNAL_PROVIDER_DETAIL")
        if outcome == "empty":
            return {"success": True, "results": {"entities": []}}
        if outcome == "bad_affinity":
            return {"success": True, "results": {"entities": [
                {"entity_id": "BROKEN", "name": "Malformed", "query": {"affinity": "INTERNAL_RESPONSE_DETAIL"}},
            ]}}
        if outcome == "bad_types":
            return {"success": True, "results": {"entities": [
                {"entity_id": "BROKEN", "name": "Malformed", "types": 7},
            ]}}
        result = super()._insights(params)
        if outcome == "rejected":
            result["results"]["entities"] = [entity for entity in result["results"]["entities"]
                                                 if entity["entity_id"] == "FIX-P-02"]
        return result


class RecommendationNotesTests(unittest.TestCase):
    def setUp(self):
        self.addCleanup(patch.stopall)
        patch.object(agent.os, "environ", {}).start()
        patch("urllib.request.urlopen", side_effect=AssertionError("Network forbidden in native notes tests")).start()

    def toolbox(self, outcomes=()):
        fixture = ScheduledFixture(outcomes)
        state = agent.AgentState(persona=copy.deepcopy(PERSONAS["rosa"]))
        tools = agent.Toolbox(QlooClient(api_key="SYNTHETIC-NOTES", transport=fixture), state)
        return tools, state, fixture

    def native(self, outcomes=(), persona="rosa"):
        fixture = ScheduledFixture(outcomes)
        result = agent.run_agent(PERSONAS[persona],
                                 qloo=QlooClient(api_key="SYNTHETIC-NOTES", transport=fixture),
                                 model=agent.ScriptedModel())
        self.assertTrue(result["mock"])
        self.assertLessEqual(len(self.requests(fixture)), 3)
        return result, fixture

    @staticmethod
    def requests(fixture):
        return [row for row in fixture.log if row["path"] == "/v2/insights"]

    @staticmethod
    def note_text(plan):
        return "\n".join(plan["notes"])

    def complete_checks(self, tools, candidates):
        return tools.run("constraint_check", {
            "entity_ids": [item["entity_id"] for item in candidates["candidates"]],
            "constraints": PERSONAS["rosa"]["constraints"], "kind": "restaurant",
        })

    def assert_neutral_missing(self, notes):
        self.assertIn("checked restaurant", notes)
        self.assertIn("left open", notes)
        self.assertNotIn("unsafe", notes)
        self.assertNotIn("passed every constraint", notes)

    def test_outing_completion_problem_is_visible_and_retains_checked_meals(self):
        healthy, _ = self.native()
        result, fixture = self.native(["ok", "ok", "error"])
        self.assertEqual(result["plan"]["meals"], healthy["plan"]["meals"])
        self.assertIsNone(result["plan"]["outing"])
        notes = self.note_text(result["plan"])
        self.assertIn("outing recommendation lookup could not be completed", notes)
        self.assertNotIn("restaurant recommendation lookup could not be completed", notes)
        self.assertNotIn("INTERNAL_PROVIDER_DETAIL", notes)
        self.assertTrue(any("INTERNAL_PROVIDER_DETAIL" in row["result_summary"] for row in result["trace"]))
        self.assertEqual(len(self.requests(fixture)), 3)

    def test_all_refused_lookups_do_not_claim_constraint_rejection(self):
        result, fixture = self.native(["error", "error", "error"])
        self.assertEqual(result["plan"]["meals"], [])
        self.assertIsNone(result["plan"]["outing"])
        notes = self.note_text(result["plan"])
        self.assertIn("restaurant recommendation lookup could not be completed", notes)
        self.assertIn("outing recommendation lookup could not be completed", notes)
        self.assert_neutral_missing(notes)
        self.assertNotIn("did not pass the requested checks", notes)
        self.assertNotIn("returned no candidates", notes)
        self.assertNotIn("INTERNAL_PROVIDER_DETAIL", notes)
        self.assertEqual(len(self.requests(fixture)), 3)

    def test_restaurant_completion_problems_keep_the_checked_outing(self):
        healthy, _ = self.native()
        result, _ = self.native(["error", "error", "ok"])
        self.assertEqual(result["plan"]["outing"], healthy["plan"]["outing"])
        self.assertEqual(result["plan"]["meals"], [])
        notes = self.note_text(result["plan"])
        self.assertIn("restaurant recommendation lookup could not be completed", notes)
        self.assertNotIn("outing recommendation lookup could not be completed", notes)
        self.assert_neutral_missing(notes)

    def test_successful_empty_responses_are_described_as_observed_empty_results(self):
        result, fixture = self.native(["empty", "empty", "empty"])
        notes = self.note_text(result["plan"])
        self.assertIn("completed restaurant recommendation lookup returned no candidates", notes)
        self.assertIn("completed outing recommendation lookup returned no candidates", notes)
        self.assertNotIn("could not be completed", notes)
        self.assertNotIn("did not pass the requested checks", notes)
        self.assert_neutral_missing(notes)
        self.assertEqual(len(self.requests(fixture)), 3)

    def test_actual_rejection_note_requires_checked_rejected_candidate_evidence(self):
        tools, state, fixture = self.toolbox(["rejected"])
        candidates = tools.run("qloo_recs", {"filter_type": "urn:entity:place", "purpose": "restaurant", "take": 50})
        verdicts = self.complete_checks(tools, candidates)
        self.assertEqual([item["entity_id"] for item in candidates["candidates"]], ["FIX-P-02"])
        self.assertFalse(verdicts["verdicts"][0]["ok"])
        plan = agent.assemble_plan(state)
        notes = self.note_text(plan)
        self.assertIn("restaurant candidates did not pass the requested checks", notes)
        self.assertNotIn("could not be completed", notes)
        self.assertNotIn("returned no candidates", notes)
        self.assert_neutral_missing(notes)
        self.assertEqual(len(self.requests(fixture)), 1)

    def test_fetched_but_unchecked_candidates_are_not_reported_as_rejections(self):
        tools, state, _ = self.toolbox()
        result = tools.run("qloo_recs", {"filter_type": "urn:entity:place", "purpose": "restaurant", "take": 50})
        self.assertTrue(result["candidates"])
        plan = agent.assemble_plan(state)
        self.assertEqual(plan["meals"], [])
        notes = self.note_text(plan)
        self.assertNotIn("did not pass the requested checks", notes)
        self.assertNotIn("returned no candidates", notes)
        self.assertNotIn("could not be completed", notes)
        self.assert_neutral_missing(notes)

    def test_invalid_native_inputs_make_no_lookup_completion_claim_or_request(self):
        base = {"filter_type": "urn:entity:place", "purpose": "restaurant", "take": 50}
        cases = [
            {"filter_type": "urn:entity:place"},
            {**base, "purpose": []},
            {**base, "purpose": "meal"},
            {**base, "filter_type": "not-supported"},
            {**base, "filter_type": {}},
            {**base, "tag_ids": [1]},
            {**base, "signal_entity_ids": [{}]},
            {**base, "location": object()},
        ]
        for args in cases:
            with self.subTest(args=args):
                tools, state, fixture = self.toolbox()
                result = tools.run("qloo_recs", args)
                self.assertIn("error", result)
                self.assertEqual(fixture.log, [])
                self.assertEqual(state.candidates, {})
                self.assertEqual(state.verdicts, {})
                notes = self.note_text(agent.assemble_plan(state))
                self.assertNotIn("could not be completed", notes)
                self.assertNotIn("returned no candidates", notes)
                self.assertNotIn("did not pass the requested checks", notes)
                self.assert_neutral_missing(notes)

    def test_same_query_recovery_normalizes_empty_options_and_respects_native_cache(self):
        tools, state, fixture = self.toolbox(["error", "ok"])
        args = {"filter_type": "urn:entity:place", "purpose": "restaurant", "take": 50}
        failed = tools.run("qloo_recs", {**args, "tag_ids": None, "signal_entity_ids": None, "location": None})
        self.assertIn("error", failed)
        self.assertIn("restaurant recommendation lookup could not be completed", self.note_text(agent.assemble_plan(state)))
        empty_options = {**args, "tag_ids": [], "signal_entity_ids": [], "location": ""}
        recovered = tools.run("qloo_recs", empty_options)
        self.complete_checks(tools, recovered)
        before = agent.assemble_plan(state)
        self.assertEqual(len(before["meals"]), 4)
        self.assertNotIn("restaurant recommendation lookup could not be completed", self.note_text(before))
        self.assertEqual(tools.run("qloo_recs", empty_options), recovered)
        self.assertEqual(agent.assemble_plan(state), before)
        self.assertEqual(len(self.requests(fixture)), 2)

    def test_success_for_a_different_query_does_not_erase_an_incomplete_lookup(self):
        tools, state, fixture = self.toolbox(["error", "ok"])
        args = {"filter_type": "urn:entity:place", "purpose": "restaurant"}
        self.assertIn("error", tools.run("qloo_recs", {**args, "take": 10}))
        recovered = tools.run("qloo_recs", {**args, "take": 50})
        self.complete_checks(tools, recovered)
        plan = agent.assemble_plan(state)
        self.assertEqual(len(plan["meals"]), 4)
        notes = self.note_text(plan)
        self.assertIn("restaurant recommendation lookup could not be completed", notes)
        self.assertNotIn("provider unavailable", notes)
        self.assertNotIn("service unavailable", notes)
        self.assertEqual(len(self.requests(fixture)), 2)

    def test_malformed_response_is_incomplete_not_successfully_empty_or_rejected(self):
        for outcome, error_type in [("bad_affinity", "ValueError"), ("bad_types", "TypeError")]:
            with self.subTest(outcome=outcome):
                tools, state, fixture = self.toolbox([outcome])
                result = tools.run("qloo_recs", {"filter_type": "urn:entity:place", "purpose": "restaurant", "take": 50})
                self.assertIn(error_type, result["error"])
                self.assertEqual(len(self.requests(fixture)), 1)
                notes = self.note_text(agent.assemble_plan(state))
                self.assertIn("restaurant recommendation lookup could not be completed", notes)
                self.assertNotIn("returned no candidates", notes)
                self.assertNotIn("did not pass the requested checks", notes)
                self.assertNotIn("INTERNAL_RESPONSE_DETAIL", notes)
                self.assert_neutral_missing(notes)

    def test_an_invalid_attempt_does_not_clear_an_earlier_incomplete_lookup(self):
        tools, state, fixture = self.toolbox(["error"])
        args = {"filter_type": "urn:entity:place", "purpose": "restaurant", "take": 50}
        tools.run("qloo_recs", args)
        tools.run("qloo_recs", {**args, "tag_ids": [1]})
        self.assertEqual(len(self.requests(fixture)), 1)
        self.assertIn("restaurant recommendation lookup could not be completed", self.note_text(agent.assemble_plan(state)))

    def test_bookkeeping_does_not_consume_single_pass_or_custom_id_carriers(self):
        cases = [
            ("tag_ids", "filter.tags", "urn:tag:genre:restaurant:cuban", 2),
            ("signal_entity_ids", "signal.interests.entities", "FIX-A-01", 1),
        ]
        class ProbeList(list):
            def __init__(self, values):
                super().__init__(values)
                self.iterations = 0

            def __iter__(self):
                self.iterations += 1
                return super().__iter__()

        for name, parameter, identity, metadata_iterations in cases:
            for carrier in ("generator", "custom_list"):
                with self.subTest(name=name, carrier=carrier):
                    values = (value for value in [identity]) if carrier == "generator" else ProbeList([identity])
                    tools, _, fixture = self.toolbox()
                    result = tools.run("qloo_recs", {"filter_type": "urn:entity:place",
                        "purpose": "restaurant", "take": 50, name: values})
                    self.assertIn("candidates", result)
                    self.assertEqual(self.requests(fixture)[0]["params"][parameter], identity)
                    if carrier == "custom_list":
                        # Native client joins once, then native Toolbox copies
                        # the carrier for each candidate's existing metadata.
                        self.assertEqual(values.iterations, 1 + metadata_iterations * len(result["candidates"]))

    def test_healthy_personas_keep_complete_plans_without_new_notes(self):
        for persona in PERSONAS:
            with self.subTest(persona=persona):
                result, _ = self.native(persona=persona)
                self.assertEqual(len(result["plan"]["meals"]), 4)
                self.assertIsNotNone(result["plan"]["outing"])
                self.assertEqual(result["plan"]["notes"], [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
