"""Native controls for explicit negation of existing low-sodium keyword cues."""
import json
import unittest
from unittest.mock import patch

import agent
from constraints import check_low_sodium, evaluate
from personas import PERSONAS
from qloo_client import FixtureTransport, QlooClient, parse_entity


def entity(keywords, *, dictionaries=True):
    values = [{"name": word} for word in keywords] if dictionaries else keywords
    return parse_entity({
        "entity_id": "FIX-LOW-SODIUM-EVIDENCE",
        "name": "Synthetic evidence control",
        "properties": {"keywords": values},
    })


class LowSodiumEvidenceTests(unittest.TestCase):
    def setUp(self):
        guard = patch("urllib.request.urlopen", side_effect=AssertionError("offline test contacted a provider"))
        guard.start()
        self.addCleanup(guard.stop)

    def test_explicit_prefix_denials_are_unknown_not_positive(self):
        phrases = [
            "no low sodium options", "NOT LOW SODIUM", "without any low sodium choices",
            "no longer heart-healthy", "not steamed", "not made to order",
            "not a low sodium dish",
        ]
        for phrase in phrases:
            verdict = evaluate(entity([phrase]), ["low_sodium"])
            self.assertEqual(verdict.checks[0].status, "unknown", phrase)
            self.assertTrue(verdict.ok, "dietary unknown remains permitted")
            self.assertIn("ask for low-salt preparation", verdict.checks[0].reason)

    def test_explicit_unavailability_is_unknown_not_positive(self):
        phrases = [
            "low sodium unavailable", "low sodium options not available",
            "heart-healthy choices are unavailable", "made to order: not offered",
            "steamed preparation is not available", "low sodium (not available)",
        ]
        for phrase in phrases:
            self.assertEqual(check_low_sodium(entity([phrase])).status, "unknown", phrase)

    def test_denied_positive_cue_does_not_override_existing_high_signal(self):
        for dictionaries in (True, False):
            verdict = evaluate(entity(["ramen", "no low sodium options"],
                                      dictionaries=dictionaries), ["low_sodium"])
            self.assertFalse(verdict.ok)
            self.assertEqual(verdict.checks[0].to_dict(), {
                "constraint": "low_sodium", "status": "fail",
                "reason": "high-sodium signals: ramen",
            })

    def test_separate_affirmative_cue_keeps_existing_positive_precedence(self):
        phrases = ["ramen", "no low sodium options", "steamed vegetables"]
        check = check_low_sodium(entity(phrases))
        self.assertEqual(check.status, "pass")
        self.assertEqual(check.reason, "lower-sodium signals: steamed vegetables")
        reordered = check_low_sodium(entity(list(reversed(phrases)), dictionaries=False))
        self.assertEqual(reordered.to_dict(), check.to_dict())

    def test_a_later_affirmative_occurrence_is_not_erased(self):
        for phrase in (
            "no low sodium soup; low sodium options",
            "low sodium options unavailable; steamed vegetables",
        ):
            check = check_low_sodium(entity([phrase]))
            self.assertEqual(check.status, "pass", phrase)
            self.assertEqual(check.reason, "lower-sodium signals: " + phrase)

    def test_unrelated_negation_does_not_erase_affirmative_evidence(self):
        for phrase in (
            "no reservations required; low sodium options",
            "not only low sodium options",
            "steamed vegetables without sauce",
        ):
            self.assertEqual(check_low_sodium(entity([phrase])).status, "pass", phrase)

    def test_existing_unknown_high_and_outing_policies_remain(self):
        for keywords, expected_status, expected_ok in (
            ([], "unknown", True),
            (["seasonal menu"], "unknown", True),
            (["ramen"], "fail", False),
            (["ramen", "low sodium options"], "pass", True),
        ):
            verdict = evaluate(entity(keywords), ["low_sodium"])
            self.assertEqual(verdict.checks[0].status, expected_status)
            self.assertEqual(verdict.ok, expected_ok)
        outing = evaluate(entity(["ramen", "no low sodium options"]),
                          ["low_sodium"], kind="outing")
        self.assertTrue(outing.ok)
        self.assertEqual(outing.checks, [])

    def _native_plan(self, keywords):
        transport = FixtureTransport()
        target = next(place for place in transport.data["places"]
                      if place["entity_id"] == "FIX-P-03")
        target["properties"]["keywords"] = [{"name": word} for word in keywords]
        before = json.dumps(transport.data, sort_keys=True)
        result = agent.run_agent(PERSONAS["rosa"],
                                 qloo=QlooClient(api_key="SYNTHETIC-OFFLINE", transport=transport),
                                 model=agent.ScriptedModel())
        self.assertTrue(result["mock"])
        self.assertTrue(any(item["path"] == "/v2/insights" for item in transport.log))
        self.assertEqual(before, json.dumps(transport.data, sort_keys=True))
        return result["plan"]

    def test_native_plan_rejects_existing_high_signal_despite_denied_cue(self):
        plan = self._native_plan(["caldo de pollo", "ramen", "no low sodium options"])
        self.assertFalse(any(meal["entity_id"] == "FIX-P-03" for meal in plan["meals"]))
        target = [item for item in plan["rejected"] if item["entity_id"] == "FIX-P-03"]
        self.assertEqual(len(target), 1)
        self.assertIn({"constraint": "low_sodium", "status": "fail",
                       "reason": "high-sodium signals: ramen"}, target[0]["failed"])

    def test_native_plan_keeps_unknown_with_an_accurate_explanation(self):
        plan = self._native_plan(["caldo de pollo", "no low sodium options"])
        target = [meal for meal in plan["meals"] if meal["entity_id"] == "FIX-P-03"]
        self.assertEqual(len(target), 1)
        self.assertIn("Low sodium: unknown (no sodium signal; ask for low-salt preparation)",
                      target[0]["why"])
        self.assertNotIn("Low sodium: pass", target[0]["why"])
        self.assertFalse(any(item["entity_id"] == "FIX-P-03" for item in plan["rejected"]))


if __name__ == "__main__":
    unittest.main()
