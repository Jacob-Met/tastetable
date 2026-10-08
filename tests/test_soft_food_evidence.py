"""Native soft-food evidence controls; all venues and keywords are authored fixtures."""
import copy
import unittest
from unittest.mock import patch

import agent
from constraints import SOFT_TEXTURE, evaluate
from personas import PERSONAS
from qloo_client import FixtureTransport, QlooClient, parse_entity


def entity(words, *, dictionaries=True):
    keywords = [{"name": word} for word in words] if dictionaries else words
    return parse_entity({
        "entity_id": "FIX-SOFT-FOOD-EVIDENCE",
        "name": "Authored soft-food evidence",
        "properties": {"keywords": keywords},
    })


class SoftFoodEvidenceTests(unittest.TestCase):
    def setUp(self):
        guard = patch("urllib.request.urlopen",
                      side_effect=AssertionError("offline test contacted a provider"))
        guard.start()
        self.addCleanup(guard.stop)

    def test_direct_prefix_denials_are_unknown_without_firm_evidence(self):
        phrases = ["no soup", "NOT RISOTTO", "without any tofu",
                   "no longer made to order", "not a soup", "without steamed options"]
        for phrase in phrases:
            for dictionaries in (False, True):
                with self.subTest(phrase=phrase, dictionaries=dictionaries):
                    verdict = evaluate(entity([phrase], dictionaries=dictionaries),
                                       ["soft_foods"])
                    self.assertEqual(verdict.checks[0].status, "unknown")
                    self.assertTrue(verdict.ok, "the existing dietary unknown policy stays intact")
                    self.assertIn("ask the venue", verdict.checks[0].reason)

    def test_direct_unavailability_is_not_a_positive_signal(self):
        phrases = ["soup unavailable", "risotto options not available",
                   "tofu choices are unavailable", "steamed preparation is not available",
                   "made to order: not offered", "soup (not available)"]
        for phrase in phrases:
            with self.subTest(phrase=phrase):
                verdict = evaluate(entity([phrase]), ["soft_foods"])
                self.assertEqual(verdict.checks[0].status, "unknown")
                self.assertTrue(verdict.ok)

    def test_denied_soft_cue_does_not_override_existing_firm_signal(self):
        for phrase in ("no soup", "soup unavailable", "without any risotto"):
            with self.subTest(phrase=phrase):
                verdict = evaluate(entity(["burger", phrase]), ["soft_foods"])
                self.assertFalse(verdict.ok)
                self.assertEqual(verdict.checks[0].status, "fail")
                self.assertEqual(verdict.checks[0].reason,
                                 "menu signals are mostly firm: burger")

    def test_separate_affirmative_cue_keeps_existing_precedence(self):
        verdict = evaluate(entity(["burger", "no soup", "risotto"]), ["soft_foods"])
        self.assertTrue(verdict.ok)
        self.assertEqual(verdict.checks[0].status, "pass")
        self.assertEqual(verdict.checks[0].reason, "soft options listed: risotto")

    def test_later_affirmative_occurrence_remains_usable(self):
        for phrase in ("no soup; soup available", "soup unavailable; soup made to order"):
            with self.subTest(phrase=phrase):
                verdict = evaluate(entity([phrase]), ["soft_foods"])
                self.assertEqual(verdict.checks[0].status, "pass")
                self.assertTrue(verdict.ok)

    def test_unrelated_negation_does_not_erase_existing_cues(self):
        for phrase in ("no reservations needed; soup", "not only risotto",
                       "without music; tofu", "soup with no onions"):
            with self.subTest(phrase=phrase):
                self.assertEqual(evaluate(entity([phrase]), ["soft_foods"])
                                 .checks[0].status, "pass")

    def test_local_plural_list_and_compound_denials_preserve_separate_evidence(self):
        denied = ("soups unavailable", "no soup or risotto",
                  "soup and risotto unavailable", "not steamed tofu")
        for phrase in denied:
            with self.subTest(phrase=phrase):
                verdict = evaluate(entity([phrase]), ["soft_foods"])
                self.assertEqual(verdict.checks[0].status, "unknown")
                self.assertTrue(verdict.ok)
                firm = evaluate(entity(["burger", phrase]), ["soft_foods"])
                self.assertEqual(firm.checks[0].status, "fail")
                self.assertFalse(firm.ok)
        for phrase in ("soup without risotto", "no soup; soup available",
                       "no soup but risotto"):
            with self.subTest(phrase=phrase):
                verdict = evaluate(entity(["burger", phrase]), ["soft_foods"])
                self.assertEqual(verdict.checks[0].status, "pass")
                self.assertTrue(verdict.ok)

    def test_original_vocabulary_unknown_and_outing_policies_remain(self):
        for cue in SOFT_TEXTURE:
            with self.subTest(cue=cue):
                verdict = evaluate(entity([cue]), ["soft_foods"])
                self.assertTrue(verdict.ok)
                self.assertEqual(verdict.checks[0].status, "pass")
                self.assertEqual(verdict.checks[0].reason, "soft options listed: " + cue)
        for words, status, allowed in (([], "unknown", True),
                                       (["seasonal menu"], "unknown", True),
                                       (["burger"], "fail", False),
                                       (["burger", "soup"], "pass", True)):
            with self.subTest(words=words):
                verdict = evaluate(entity(words), ["soft_foods"])
                self.assertEqual(verdict.checks[0].status, status)
                self.assertEqual(verdict.ok, allowed)
        outing = evaluate(entity(["burger", "no soup"]), ["soft_foods"], kind="outing")
        self.assertTrue(outing.ok)
        self.assertEqual(outing.checks, [])

    def _native_plan(self, words):
        transport = FixtureTransport()
        place = next(item for item in transport.data["places"]
                     if item["entity_id"] == "FIX-P-03")
        place["properties"]["keywords"] = [{"name": word} for word in words]
        before = copy.deepcopy(transport.data)
        result = agent.run_agent(
            PERSONAS["rosa"],
            qloo=QlooClient(api_key="SYNTHETIC-OFFLINE", transport=transport),
            model=agent.ScriptedModel(),
        )
        self.assertTrue(result["mock"])
        self.assertTrue(any(row["path"] == "/v2/insights" for row in transport.log))
        self.assertEqual(before, transport.data)
        return result["plan"]

    def test_actual_planner_keeps_unknown_with_accurate_explanation(self):
        plan = self._native_plan(["no soup"])
        retained = [meal for meal in plan["meals"] if meal["entity_id"] == "FIX-P-03"]
        self.assertEqual(len(retained), 1)
        self.assertIn("Soft foods: unknown (no texture signal in Qloo keywords; ask the venue)",
                      retained[0]["why"])
        self.assertNotIn("Soft foods: pass", retained[0]["why"])
        self.assertFalse(any(row["entity_id"] == "FIX-P-03" for row in plan["rejected"]))

    def test_actual_planner_rejects_firm_signal_after_denied_soft_cue(self):
        plan = self._native_plan(["burger", "no soup"])
        self.assertFalse(any(meal["entity_id"] == "FIX-P-03" for meal in plan["meals"]))
        rejected = [row for row in plan["rejected"] if row["entity_id"] == "FIX-P-03"]
        self.assertEqual(len(rejected), 1)
        self.assertIn({"constraint": "soft_foods", "status": "fail",
                       "reason": "menu signals are mostly firm: burger"}, rejected[0]["failed"])


if __name__ == "__main__":
    unittest.main()

