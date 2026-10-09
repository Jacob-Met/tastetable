"""Scripted plans require category evidence before assigning a place a role."""
import unittest

from agent import ScriptedModel, run_agent
from qloo_client import FixtureTransport, QlooClient


RESTAURANT_TAG_TYPE = "urn:tag:genre:place:restaurant"
CULTURAL_TAG_TYPE = "urn:tag:category:place"


class ScriptedCategoryAdmissionTests(unittest.TestCase):
    def setUp(self):
        self.transport = FixtureTransport()
        self.client = QlooClient(api_key="MOCK-NOT-A-KEY", transport=self.transport)
        self.restaurant_ids = {
            place["entity_id"] for place in self.transport.data["places"]
            if any(tag.get("type") == RESTAURANT_TAG_TYPE for tag in place["tags"])
        }

    def _plan(self, **changes):
        profile = {"cuisines": [], "music": ["Celia Cruz"], "films": [],
                   "constraints": [], "city": "Pasadena"}
        profile.update(changes)
        return run_agent(profile, qloo=self.client, model=ScriptedModel())["plan"]

    def _assert_filtered_insights(self):
        for request in self.transport.log:
            if request["path"] == "/v2/insights":
                self.assertTrue(request["params"].get("filter.tags"), request)

    def _assert_four_restaurants(self, plan, *, fallback=False):
        meals = plan["meals"]
        self.assertEqual(len(meals), 4)
        ids = [meal["entity_id"] for meal in meals]
        self.assertEqual(len(set(ids)), 4)
        self.assertTrue(set(ids) <= self.restaurant_ids, meals)
        if plan["outing"]:
            self.assertNotIn(plan["outing"]["entity_id"], ids)
        if fallback:
            for meal in meals:
                self.assertTrue(meal["fallback"], meal)
                self.assertIn("Widened pick:", meal["why"])
        self._assert_filtered_insights()

    def test_music_only_keeps_museum_as_cultural_outing(self):
        plan = self._plan()
        self._assert_four_restaurants(plan, fallback=True)
        self.assertEqual(plan["outing"]["entity_id"], "FIX-V-03")

    def test_film_only_keeps_cinema_as_cultural_outing(self):
        plan = self._plan(music=[], films=["Casablanca"])
        self._assert_four_restaurants(plan, fallback=True)
        self.assertEqual(plan["outing"]["entity_id"], "FIX-V-02")

    def test_unmatched_cuisine_uses_tagged_fallback_restaurants(self):
        plan = self._plan(cuisines=["Unmatched Cuisine"])
        self._assert_four_restaurants(plan, fallback=True)
        self.assertEqual(plan["outing"]["entity_id"], "FIX-V-03")

    def test_missing_cuisine_and_fallback_tags_leave_meal_days_open(self):
        self.transport.data["tags"] = [
            tag for tag in self.transport.data["tags"]
            if tag["type"] != RESTAURANT_TAG_TYPE
        ]
        plan = self._plan()
        self.assertEqual(plan["meals"], [])
        self.assertEqual(plan["outing"]["entity_id"], "FIX-V-03")
        self.assertTrue(any("unfilled meal days are left open" in note
                            for note in plan["notes"]))
        self._assert_filtered_insights()

    def test_missing_venue_tags_leave_outing_unavailable(self):
        self.transport.data["tags"] = [
            tag for tag in self.transport.data["tags"]
            if tag["type"] != CULTURAL_TAG_TYPE
        ]
        plan = self._plan(cuisines=["Cuban"])
        self._assert_four_restaurants(plan)
        self.assertIsNone(plan["outing"])
        self.assertIn("No checked outing suggestion is available in this plan.", plan["notes"])

    def test_one_resolved_venue_category_still_supplies_outing(self):
        self.transport.data["tags"] = [
            tag for tag in self.transport.data["tags"]
            if tag["type"] != CULTURAL_TAG_TYPE or tag["name"] == "Museum"
        ]
        plan = self._plan(cuisines=["Cuban"])
        self._assert_four_restaurants(plan)
        self.assertEqual(plan["outing"]["entity_id"], "FIX-V-03")

    def test_no_category_tags_leave_all_slots_open(self):
        self.transport.data["tags"] = []
        plan = self._plan()
        self.assertEqual(plan["meals"], [])
        self.assertIsNone(plan["outing"])
        self.assertFalse(any(request["path"] == "/v2/insights"
                             for request in self.transport.log))
        self.assertTrue(any("unfilled meal days are left open" in note
                            for note in plan["notes"]))
        self.assertIn("No checked outing suggestion is available in this plan.", plan["notes"])

    def test_generic_place_client_still_returns_both_categories(self):
        # The generic client/fixture contract stays useful to other callers.
        entities = self.client.insights(
            "urn:entity:place", signal_entities=["FIX-A-celia"],
            location_query="Pasadena", take=18,
        )
        self.assertEqual(entities[0].entity_id, "FIX-V-03")
        self.assertIn("FIX-P-01", {entity.entity_id for entity in entities})
        self.assertNotIn("filter.tags", self.transport.log[-1]["params"])


if __name__ == "__main__":
    unittest.main()
