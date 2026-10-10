"""CommonGround least-satisfied negotiation: mock-only, no live Qloo calls."""
import os
import unittest
from unittest import mock

import commonground as cg
from qloo_client import Entity, QlooClient


class FakeClient:
    """Returns canned per-party venue sets; records calls so tests can assert binding."""

    def __init__(self, table):
        self.table = table  # signal-key -> list[Entity]
        self.calls = []
        self.is_mock = True

    def insights(self, filter_type, *, signal_entities=None, filter_tags=None,
                 location_query=None, take=10):
        key = tuple(signal_entities or [])
        self.calls.append((filter_type, key))
        return list(self.table.get(key, []))


def venue(eid, affinity, tags=()):
    return Entity(entity_id=eid, name=eid, types=[cg.PLACE_TYPE], affinity=affinity, tags=[{"name": t} for t in tags])


class LeastSatisfiedTests(unittest.TestCase):
    def test_min_affinity_wins_over_average(self):
        a = cg.Party("a", signal_entity_ids=["sa"])
        b = cg.Party("b", signal_entity_ids=["sb"])
        client = FakeClient({
            ("sa",): [venue("lopsided", 0.99), venue("fair", 0.6)],
            ("sb",): [venue("lopsided", 0.05), venue("fair", 0.6)],
        })
        out = cg.find_common_ground([a, b], client=client)
        ranked = [r["entity_id"] for r in out["results"]]
        # fair: min(0.6,0.6)=0.6 beats lopsided: min(0.99,0.05)=0.05
        self.assertEqual(ranked, ["fair", "lopsided"])
        self.assertEqual(out["results"][0]["score"], 0.6)
        self.assertEqual(out["results"][1]["score"], 0.05)

    def test_requires_two_parties_and_unique_ids(self):
        with self.assertRaises(ValueError):
            cg.find_common_ground([cg.Party("solo", signal_entity_ids=["x"])], client=FakeClient({}))
        with self.assertRaises(ValueError):
            cg.find_common_ground([cg.Party("dup", ["x"]), cg.Party("dup", ["y"])], client=FakeClient({}))

    def test_only_shared_venues_are_considered(self):
        a = cg.Party("a", signal_entity_ids=["sa"])
        b = cg.Party("b", signal_entity_ids=["sb"])
        client = FakeClient({("sa",): [venue("only-a", 0.9)], ("sb",): [venue("only-b", 0.9)]})
        out = cg.find_common_ground([a, b], client=client)
        self.assertEqual(out["results"], [])
        self.assertEqual(out["shared_candidates"], 0)

    def test_default_client_is_mock_without_env(self):
        env = {k: v for k, v in os.environ.items() if k not in ("QLOO_API_KEY", "TASTETABLE_LIVE")}
        with mock.patch.dict(os.environ, env, clear=True):
            self.assertTrue(QlooClient.from_env().is_mock)


if __name__ == "__main__":
    unittest.main()
