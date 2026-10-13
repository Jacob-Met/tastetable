"""Recovery and caller isolation must hold in the same client lifetime."""
from copy import deepcopy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from qloo_client import QlooClient


class QlooCacheCompositionTests(unittest.TestCase):
    def check_recovery_then_isolation(self, method):
        entity = {
            "entity_id": "FIX-composition",
            "name": "Fictional hall",
            "types": ["urn:entity:place"],
            "query": {"affinity": 0.75},
            "tags": [{"name": "Jazz", "metadata": {"labels": ["original"]}}],
            "properties": {"source_data": {"affinity": {"score": 0.75}}},
        }
        good = {"results": {"entities": [entity]}}
        pristine = deepcopy(good)
        bad = {"results": {"entities": [entity, None]}}
        calls = []

        def transport(path, params, headers):
            calls.append((path, deepcopy(params)))
            if len(calls) == 1:
                return bad
            if len(calls) == 2:
                return good
            raise AssertionError("An accepted response must remain cached")

        client = QlooClient(api_key="fixture-not-a-key", transport=transport)
        def request():
            if method == "search":
                return client.search("fictional hall")
            return client.insights("urn:entity:place", location_query="Fictional City")

        with self.assertRaises(AttributeError):
            request()
        self.assertEqual(len(calls), 1, "No automatic retry after malformed payload")
        recovered = request()
        expected = deepcopy([item.to_dict() for item in recovered])
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0], calls[1])

        for returned in (recovered, request()):
            returned[0].properties["source_data"]["affinity"]["score"] = -1
            returned[0].tags[0]["metadata"]["labels"].append("local")
            returned[0].affinity = -1
            returned.append(returned[0])
            self.assertEqual([item.to_dict() for item in request()], expected)
            self.assertEqual(good, pristine, "Caller edits must not reach transport data")
            self.assertEqual(len(calls), 2)

    def test_search_recovery_keeps_nested_caller_edits_local(self):
        self.check_recovery_then_isolation("search")

    def test_insights_recovery_keeps_nested_caller_edits_local(self):
        self.check_recovery_then_isolation("insights")


if __name__ == "__main__":
    unittest.main(verbosity=2)
