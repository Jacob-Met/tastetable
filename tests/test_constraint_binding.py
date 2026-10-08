"""Caregiver requirements remain authoritative across model tool sequences.

All provider responses are local, synthetic fixture data. These controls exercise
the native agent loop and plan assembly; they do not certify venue information.
"""
from __future__ import annotations

import copy
import hashlib
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import agent
from personas import PERSONAS
from qloo_client import Entity, FixtureTransport, QlooClient


class CallsModel:
    """Return authored calls through the same interface as an external model."""

    def __init__(self, turns):
        self.turns = iter(turns)
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, **kwargs):
        calls = next(self.turns, [])
        message = {"role": "assistant", "content": "Done"}
        if calls:
            message["tool_calls"] = [
                {"id": f"call-{i}", "type": "function", "function": {
                    "name": name, "arguments": json.dumps(args)}}
                for i, (name, args) in enumerate(calls)
            ]
        return {"choices": [{"message": message}]}


class ConstraintBindingTests(unittest.TestCase):
    def setUp(self):
        self.persona = copy.deepcopy(PERSONAS["rosa"])
        self.client = QlooClient(api_key="TEST", transport=FixtureTransport())
        self.state = agent.AgentState(persona=copy.deepcopy(self.persona))
        self.tools = agent.Toolbox(self.client, self.state)
        self.tools.qloo_recs("urn:entity:place", "restaurant", take=50)
        self.bad_id = self._id("Malecon Sandwich Shop")
        self.good_id = self._id("Casa Habana Kitchen")

    def _id(self, name):
        return next(eid for eid, c in self.state.candidates.items()
                    if c["entity"].name == name)

    def _run(self, checks, *, constraints=None):
        persona = copy.deepcopy(self.persona)
        if constraints is not None:
            persona["constraints"] = constraints
        turns = [[("qloo_recs", {"filter_type": "urn:entity:place",
                                "purpose": "restaurant", "take": 50})]]
        turns.extend([[("constraint_check", args)] for args in checks])
        return agent.run_agent(persona, qloo=self.client, model=CallsModel(turns))

    def _check(self, eid, constraints, kind="restaurant"):
        return {"entity_ids": [eid], "constraints": constraints, "kind": kind}

    def test_native_loop_does_not_accept_omitted_requirements(self):
        result = self._run([self._check(self.bad_id, [])])
        self.assertEqual(result["plan"]["meals"], [])
        self.assertEqual(result["plan"]["rejected"][0]["entity_id"], self.bad_id)

    def test_native_loop_does_not_skip_dietary_checks_for_a_meal(self):
        dietary = ["soft_foods", "low_sodium"]
        result = self._run([self._check(self.bad_id, dietary, "outing")],
                           constraints=dietary)
        self.assertEqual(result["plan"]["meals"], [])
        failed = result["plan"]["rejected"][0]["failed"]
        self.assertEqual({c["constraint"] for c in failed}, set(dietary))

    def test_native_loop_cannot_replace_a_failed_check_with_a_weaker_one(self):
        result = self._run([self._check(self.bad_id, self.persona["constraints"]),
                            self._check(self.bad_id, [])])
        self.assertEqual(result["plan"]["meals"], [])
        self.assertEqual(result["trace"][-1]["result_summary"], "0/1 passed")

    def test_native_loop_does_not_admit_an_unchecked_candidate(self):
        result = self._run([])
        self.assertEqual(result["plan"]["meals"], [])
        self.assertIsNone(result["plan"]["outing"])

    def test_native_loop_does_not_admit_an_invented_entity(self):
        result = self._run([self._check("NOT-FETCHED", [])])
        self.assertEqual(result["plan"]["meals"], [])

    def test_legitimate_restaurant_uses_all_requested_checks(self):
        result = self._run([self._check(self.good_id, [])])
        self.assertEqual([m["entity_id"] for m in result["plan"]["meals"]], [self.good_id])
        for label in ("Soft foods", "Low sodium", "Wheelchair"):
            self.assertIn(f"{label}: pass", result["plan"]["meals"][0]["why"])

    def test_unknown_ids_do_not_prevent_checking_a_known_candidate(self):
        result = self.tools.constraint_check(["NOT-FETCHED", self.good_id],
                                             self.persona["constraints"], "restaurant")
        self.assertFalse(result["verdicts"][0]["ok"])
        self.assertEqual(result["verdicts"][0]["error"], "unknown id")
        self.assertTrue(result["verdicts"][1]["ok"])
        self.assertNotIn("NOT-FETCHED", self.state.verdicts)
        self.assertEqual(len(agent.assemble_plan(self.state)["meals"]), 1)

    def test_missing_tool_arguments_fail_without_checking_candidates(self):
        result = self.tools.run("constraint_check", {"entity_ids": [self.good_id]})
        self.assertIn("error", result)
        self.assertEqual(self.state.verdicts, {})
        self.assertEqual(agent.assemble_plan(self.state)["meals"], [])

    def test_malformed_ids_fail_before_any_candidate_is_checked(self):
        for ids in (None, self.good_id, {}, [None], [self.good_id, {}], [self.good_id, ""]):
            with self.subTest(ids=ids):
                self.state.verdicts.clear()
                result = self.tools.run("constraint_check", {
                    "entity_ids": ids, "constraints": self.persona["constraints"],
                    "kind": "restaurant"})
                self.assertIn("error", result)
                self.assertEqual(self.state.verdicts, {})

    def test_malformed_check_arguments_fail_without_a_verdict(self):
        args = [(None, "restaurant"), ("wheelchair", "restaurant"),
                ([None], "restaurant"), ([], None), ([], "skip"), ([], [])]
        for constraints, kind in args:
            with self.subTest(constraints=constraints, kind=kind):
                self.state.verdicts.clear()
                result = self.tools.run("constraint_check", {
                    "entity_ids": [self.good_id], "constraints": constraints, "kind": kind})
                self.assertIn("error", result)
                self.assertEqual(self.state.verdicts, {})

    def test_outing_reused_in_recommendations_keeps_its_checked_purpose(self):
        state = agent.AgentState(persona=copy.deepcopy(self.persona))
        tools = agent.Toolbox(self.client, state)
        tags = [t["tag_id"] for t in self.client.find_tags("cinema")]
        result = tools.qloo_recs("urn:entity:place", "outing", tag_ids=tags)
        eid = result["candidates"][0]["entity_id"]
        tools.constraint_check([eid], self.persona["constraints"], "outing")
        tools.qloo_recs("urn:entity:place", "restaurant", tag_ids=tags)
        verdict = tools.constraint_check([eid], self.persona["constraints"], "restaurant")
        self.assertEqual(state.candidates[eid]["purpose"], "outing")
        self.assertEqual([c["constraint"] for c in verdict["verdicts"][0]["checks"]],
                         ["wheelchair"])
        plan = agent.assemble_plan(state)
        self.assertEqual(plan["meals"], [])
        self.assertEqual(plan["outing"]["entity_id"], eid)

    def test_tool_preserves_a_requirement_omitted_by_the_model(self):
        entity = Entity("LOCAL", "Synthetic cafe", properties={
            "keywords": ["soup", "made to order"]})
        self.state.candidates[entity.entity_id] = {
            "entity": entity, "purpose": "restaurant", "signals": [], "query_tags": []}
        result = self.tools.constraint_check([entity.entity_id],
                                             ["soft_foods", "low_sodium"], "restaurant")
        verdict = result["verdicts"][0]
        self.assertFalse(verdict["ok"])
        self.assertEqual([c["constraint"] for c in verdict["checks"]],
                         self.persona["constraints"])
        self.assertEqual(verdict["checks"][-1]["status"], "unknown")

    def test_each_candidate_uses_its_retained_purpose(self):
        outing_id = self._id("Rialto Revival Cinema (fictional)")
        self.state.candidates[outing_id]["purpose"] = "outing"
        result = self.tools.constraint_check([self.bad_id, outing_id],
                                             self.persona["constraints"], "outing")
        meal, outing = result["verdicts"]
        self.assertFalse(meal["ok"])
        self.assertEqual([c["constraint"] for c in meal["checks"]],
                         self.persona["constraints"])
        self.assertTrue(outing["ok"])
        self.assertEqual([c["constraint"] for c in outing["checks"]], ["wheelchair"])

    def test_a_model_cannot_add_unrequested_requirements(self):
        self.state.persona["constraints"] = ["wheelchair"]
        result = self.tools.constraint_check([self.good_id],
                                             ["unsupported-model-invention"], "restaurant")
        self.assertTrue(result["verdicts"][0]["ok"])
        self.assertEqual([c["constraint"] for c in result["verdicts"][0]["checks"]],
                         ["wheelchair"])

    def test_assembly_rechecks_a_permissive_stored_verdict(self):
        self.state.verdicts[self.bad_id] = {
            "entity_id": self.bad_id, "name": "Malecon Sandwich Shop",
            "ok": True, "checks": []}
        result = agent.assemble_plan(self.state)
        self.assertEqual(result["meals"], [])
        self.assertTrue(result["rejected"][0]["failed"])

    def test_assembly_rechecks_changed_candidate_evidence(self):
        self.tools.constraint_check([self.good_id], self.persona["constraints"], "restaurant")
        original = copy.deepcopy(self.state.verdicts)
        self.state.candidates[self.good_id]["entity"].tags = [
            {"tag_id": "urn:tag:accessibility:place:steps_at_entrance",
             "name": "Steps at entrance"}]
        result = agent.assemble_plan(self.state)
        self.assertEqual(result["meals"], [])
        self.assertEqual(result["rejected"][0]["failed"][0]["constraint"], "wheelchair")
        self.assertEqual(self.state.verdicts, original,
                         "assembling a plan must not rewrite the recorded tool result")

    def test_assembly_rechecks_changed_caregiver_requirements(self):
        self.state.persona["constraints"] = []
        self.tools.constraint_check([self.bad_id], [], "restaurant")
        self.state.persona["constraints"] = ["wheelchair"]
        result = agent.assemble_plan(self.state)
        self.assertEqual(result["meals"], [])
        self.assertEqual(result["rejected"][0]["failed"][0]["constraint"], "wheelchair")

    def test_assembly_rechecks_a_changed_candidate_purpose(self):
        self.state.persona["constraints"] = ["soft_foods", "low_sodium"]
        self.state.candidates[self.bad_id]["purpose"] = "outing"
        self.tools.constraint_check([self.bad_id], self.state.persona["constraints"], "outing")
        self.state.candidates[self.bad_id]["purpose"] = "restaurant"
        self.assertEqual(agent.assemble_plan(self.state)["meals"], [])

    def test_current_source_explanations_are_used_for_accepted_picks(self):
        self.state.persona["constraints"] = []
        self.tools.constraint_check([self.good_id], [], "restaurant")
        self.state.persona["constraints"] = ["wheelchair"]
        result = agent.assemble_plan(self.state)
        self.assertEqual(len(result["meals"]), 1)
        self.assertIn("Wheelchair: pass", result["meals"][0]["why"])

    def test_all_healthy_mock_persona_outputs_remain_unchanged(self):
        expected = {
            "rosa": "f4cd0ab98b8c8c1c83a11109b275f72680c7f49e390bf7b5ad1a818cd33207be",
            "harold": "6bef0d4ef7b35136590b291fb8e46705b45d61d318c4854a442546db9b2e7320",
            "mei": "8bd9fd4d8df0677b391fbc27e2b10353c11ba0a5825f5311a518dff60ff7988c",
        }
        for pid, persona in PERSONAS.items():
            with self.subTest(persona=pid):
                result = agent.run_agent(persona, qloo=QlooClient(
                    api_key="TEST", transport=FixtureTransport()))
                data = json.dumps(result, sort_keys=True, separators=(",", ":"),
                                  ensure_ascii=False).encode()
                self.assertEqual(hashlib.sha256(data).hexdigest(), expected[pid])


if __name__ == "__main__":
    unittest.main()
