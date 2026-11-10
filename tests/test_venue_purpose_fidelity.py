"""A genuine caregiver input must not turn cultural venues into meal stops."""
import unittest

from agent import run_agent
from qloo_client import FixtureTransport, QlooClient


class VenuePurposeFidelityTests(unittest.TestCase):
    def test_music_only_week_uses_dining_places_and_keeps_a_real_outing(self):
        profile = {"cuisines": [], "music": ["Celia Cruz"], "films": [],
                   "city": "Pasadena", "constraints": ["wheelchair"]}
        result = run_agent(profile, qloo=QlooClient("TEST", transport=FixtureTransport()))
        plan = result["plan"]
        self.assertEqual(len(plan["meals"]), 4)
        self.assertTrue(all(item["entity_id"].startswith("FIX-P-") for item in plan["meals"]))
        self.assertTrue(plan["outing"]["entity_id"].startswith("FIX-V-"))
        excluded = plan["category_exclusions"]
        self.assertTrue(any(item["entity_id"].startswith("FIX-V-") and
                            item["purpose"] == "restaurant" for item in excluded))
        self.assertEqual(len(result["llm_only"]["meals"]), 4)
        self.assertEqual(result["comparison"]["llm_only"]["picks"], 5)
        self.assertEqual(result["comparison"]["grounded"]["unsafe_candidates_rejected"],
                         len(plan["rejected"]))

    def test_film_only_week_rejects_cinema_for_meals(self):
        profile = {"cuisines": [], "music": [], "films": ["Casablanca"],
                   "city": "Pasadena", "constraints": []}
        result = run_agent(profile, qloo=QlooClient("TEST", transport=FixtureTransport()))
        plan = result["plan"]
        self.assertEqual(len(plan["meals"]), 4)
        self.assertFalse(any("Cinema" in x["name"] for x in plan["meals"]))
        self.assertEqual(len(result["llm_only"]["meals"]), 4)
        self.assertIn("No cuisine preference", result["llm_only"]["meals"][0]["why"])
        self.assertTrue(any("Cinema" in x["name"] and x["purpose"] == "restaurant"
                            for x in plan["category_exclusions"]))


if __name__ == "__main__":
    unittest.main()
