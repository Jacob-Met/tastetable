"""Offline tag search obeys caller-requested result limits."""
import json
import unittest

from qloo_client import FixtureTransport, QlooClient, QlooError


class FixtureTagLimitTests(unittest.TestCase):
    def setUp(self):
        self.transport = FixtureTransport()
        self.client = QlooClient(api_key="MOCK-NOT-A-KEY", transport=self.transport)

    def names(self, query="a", **kwargs):
        return [tag["name"] for tag in self.client.find_tags(query, **kwargs)]

    def test_public_default_returns_three_matches(self):
        self.assertEqual(self.names(), ["Cuban", "Mexican", "Japanese"])

    def test_explicit_limits_keep_the_original_prefix(self):
        for take, expected in [
            (0, []),
            (1, ["Cuban"]),
            (2, ["Cuban", "Mexican"]),
            (5, ["Cuban", "Mexican", "Japanese", "Italian", "Jazz Club"]),
            (7, ["Cuban", "Mexican", "Japanese", "Italian", "Jazz Club",
                 "Movie Theater", "Concert Hall"]),
            (99, ["Cuban", "Mexican", "Japanese", "Italian", "Jazz Club",
                  "Movie Theater", "Concert Hall"]),
        ]:
            with self.subTest(take=take):
                self.assertEqual(self.names(take=take), expected)

    def test_limit_applies_after_name_and_alias_filtering(self):
        self.transport.data["tags"] = [
            {"id": "first", "name": "Unrelated", "type": "synthetic"},
            {"id": "alias", "name": "First relevant", "type": "synthetic", "aka": ["JAZZ"]},
            {"id": "name", "name": "Jazz second", "type": "synthetic"},
        ]
        self.assertEqual(self.client.find_tags("jazz", take=1), [
            {"tag_id": "alias", "name": "First relevant", "type": "synthetic"}
        ])

    def test_normalized_and_empty_queries_keep_matching_behavior(self):
        self.assertEqual(self.names(" A ", take=2), ["Cuban", "Mexican"])
        self.assertEqual(self.names("not-a-fixture-match", take=2), [])
        self.assertEqual(self.names("", take=2), [])

    def test_direct_transport_without_take_keeps_all_matches(self):
        response = self.transport("/v2/tags", {"filter.query": "a"},
                                  {"X-Api-Key": "MOCK-NOT-A-KEY"})
        self.assertEqual([tag["name"] for tag in response["results"]["tags"]],
                         ["Cuban", "Mexican", "Japanese", "Italian", "Jazz Club",
                          "Movie Theater", "Concert Hall"])

    def test_each_limit_keeps_its_own_cache_entry(self):
        first = self.client.find_tags("a", take=1)
        self.client.find_tags("a", take=2)
        repeated = self.client.find_tags("a", take=1)
        self.assertEqual(first, repeated)
        self.assertEqual(len(self.transport.log), 2)
        self.assertEqual([call["params"]["take"] for call in self.transport.log], [1, 2])

    def test_caller_edits_preserve_fixture_and_warm_result(self):
        raw = json.dumps(self.transport.data, sort_keys=True)
        first = self.client.find_tags("a", take=1)
        first[0]["name"] = "edited by caller"
        first.append({"tag_id": "new", "name": "extra", "type": "synthetic"})
        self.assertEqual(self.client.find_tags("a", take=1)[0]["name"], "Cuban")
        self.assertEqual(json.dumps(self.transport.data, sort_keys=True), raw)
        self.assertEqual(len(self.transport.log), 1)

    def test_request_shape_and_auth_behavior_are_retained(self):
        self.client.find_tags("jazz", tag_type="synthetic", take=1)
        self.assertEqual(self.transport.log, [{"path": "/v2/tags", "params": {
            "filter.query": "jazz", "take": 1, "filter.tag.types": "synthetic"}}])
        with self.assertRaises(QlooError) as caught:
            self.transport("/v2/tags", {"filter.query": "a", "take": 1}, {})
        self.assertEqual(caught.exception.status, 401)


if __name__ == "__main__":
    unittest.main()
