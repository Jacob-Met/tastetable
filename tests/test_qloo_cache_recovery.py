"""A failed parse must not make later caller-requested recovery impossible."""
import copy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from qloo_client import QlooClient, QlooError


ENTITY = {"entity_id": "fixture-venue", "name": "Authored venue",
          "types": ["urn:entity:place"], "query": {"affinity": 0.75}}
TAG = {"id": "urn:tag:fixture", "name": "Authored tag", "type": "fixture"}


class SequenceTransport:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests = []

    def __call__(self, path, params, headers):
        self.requests.append((path, dict(params)))
        if not self.responses:
            raise AssertionError("Unexpected transport request")
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return copy.deepcopy(response)


class QlooCacheRecoveryTests(unittest.TestCase):
    def assert_recovers(self, request, bad, good, error, expected):
        transport = SequenceTransport(bad, good)
        client = QlooClient(api_key="fixture-not-a-key", transport=transport)
        with self.assertRaises(error):
            request(client)
        self.assertEqual(len(transport.requests), 1,
                         "A failed response must not trigger automatic retries")
        recovered = request(client)
        self.assertEqual(recovered, expected)
        self.assertEqual(request(client), expected)
        self.assertEqual(len(transport.requests), 2,
                         "Recovery must fetch again, then cache the valid response")
        self.assertEqual(transport.requests[0], transport.requests[1])

    def test_insights_error_envelope_can_recover_on_the_same_request(self):
        self.assert_recovers(
            lambda client: [entity.name for entity in client.insights(
                "urn:entity:place", location_query="Pasadena")],
            {"success": False, "errors": ["authored temporary refusal"]},
            {"success": True, "results": {"entities": [ENTITY]}},
            QlooError, ["Authored venue"])

    def test_search_numeric_parse_failure_can_recover(self):
        bad_entity = dict(ENTITY, popularity="not-a-number")
        self.assert_recovers(
            lambda client: [entity.name for entity in client.search("venue")],
            {"results": [bad_entity]}, {"results": [ENTITY]},
            ValueError, ["Authored venue"])

    def test_insights_partial_list_failure_can_recover(self):
        self.assert_recovers(
            lambda client: [entity.name for entity in client.insights("urn:entity:place")],
            {"results": {"entities": [ENTITY, None]}},
            {"results": {"entities": [ENTITY]}},
            AttributeError, ["Authored venue"])

    def test_tag_partial_list_failure_can_recover(self):
        self.assert_recovers(
            lambda client: client.find_tags("authored"),
            {"results": {"tags": [TAG, None]}}, {"results": {"tags": [TAG]}},
            AttributeError,
            [{"tag_id": TAG["id"], "name": TAG["name"], "type": TAG["type"]}])

    def test_wrong_top_level_shape_can_recover(self):
        self.assert_recovers(
            lambda client: [entity.name for entity in client.search("venue")],
            [], {"results": [ENTITY]}, AttributeError, ["Authored venue"])

    def test_transport_refusal_retains_error_and_recovery_behavior(self):
        refusal = QlooError(503, "authored unavailable")
        transport = SequenceTransport(refusal, {"results": [ENTITY]})
        client = QlooClient(api_key="fixture-not-a-key", transport=transport)
        with self.assertRaises(QlooError) as caught:
            client.search("venue")
        self.assertIs(caught.exception, refusal)
        self.assertEqual(caught.exception.status, 503)
        self.assertTrue(caught.exception.retryable)
        self.assertEqual(len(transport.requests), 1)
        self.assertEqual(client.search("venue")[0].name, "Authored venue")
        self.assertEqual(client.search("venue")[0].name, "Authored venue")
        self.assertEqual(len(transport.requests), 2)

    def test_successful_empty_and_missing_results_remain_cacheable(self):
        cases = (
            (lambda client: client.search("none"), {}),
            (lambda client: client.search("none"), {"results": []}),
            (lambda client: client.find_tags("none"), {"results": {"tags": []}}),
            (lambda client: client.insights("urn:entity:place"),
             {"success": True, "results": {"entities": []}}),
        )
        for request, response in cases:
            with self.subTest(response=response):
                transport = SequenceTransport(response)
                client = QlooClient(api_key="fixture-not-a-key", transport=transport)
                self.assertEqual(request(client), [])
                self.assertEqual(request(client), [])
                self.assertEqual(len(transport.requests), 1)

    def test_failed_query_preserves_other_cached_queries(self):
        another = dict(ENTITY, entity_id="fixture-other", name="Other venue")
        transport = SequenceTransport({"results": [ENTITY]},
                                      {"results": [None]},
                                      {"results": [another]})
        client = QlooClient(api_key="fixture-not-a-key", transport=transport)
        self.assertEqual(client.search("first")[0].name, "Authored venue")
        with self.assertRaises(AttributeError):
            client.search("second")
        self.assertEqual(client.search("first")[0].name, "Authored venue")
        self.assertEqual(len(transport.requests), 2)
        self.assertEqual(client.search("second")[0].name, "Other venue")
        self.assertEqual(client.search("second")[0].name, "Other venue")
        self.assertEqual(len(transport.requests), 3)

    def test_cache_hits_still_create_fresh_result_objects(self):
        transport = SequenceTransport({"results": [ENTITY]})
        client = QlooClient(api_key="fixture-not-a-key", transport=transport)
        first = client.search("venue")
        first[0].name = "Edited locally"
        first.append(first[0])
        second = client.search("venue")
        self.assertEqual([entity.name for entity in second], ["Authored venue"])
        self.assertIsNot(first[0], second[0])
        self.assertEqual(len(transport.requests), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
