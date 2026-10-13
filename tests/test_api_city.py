"""Receive city normalization through the actual offline FastAPI planner."""
from __future__ import annotations

from copy import deepcopy
import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import app as web
from personas import PERSONAS
from qloo_client import FixtureTransport, QlooClient

_MISSING = object()


class ApiCityInput(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {}, clear=True)
        environment.start()
        self.addCleanup(environment.stop)
        network = patch("urllib.request.urlopen",
                        side_effect=AssertionError("network forbidden"))
        network.start()
        self.addCleanup(network.stop)
        self.client = TestClient(web.app, raise_server_exceptions=False)
        self.addCleanup(self.client.close)

    def request_plan(self, profile):
        fixture = FixtureTransport()
        qloo = QlooClient(api_key="authored-fixture-key", transport=fixture)
        with patch.object(web.QlooClient, "from_env", return_value=qloo):
            response = self.client.post("/api/plan", json=profile)
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertTrue(result["mock"])
        queries = [row["params"] for row in fixture.log if row["path"] == "/v2/insights"]
        self.assertTrue(queries, "the real scripted policy must request recommendations")
        return result, queries

    def test_pasted_city_keeps_each_complete_fictional_plan(self):
        for pid, persona in PERSONAS.items():
            with self.subTest(persona=pid):
                profile = deepcopy(persona)
                profile["city"] = "Pasadena"
                ordinary, ordinary_queries = self.request_plan(profile)
                self.assertEqual(ordinary["comparison"]["grounded"]["picks"], 5)
                for city in (" Pasadena ", "\t\r\nPasadena\u00a0\u3000",
                             " " * 61 + "Pasadena" + " " * 61):
                    with self.subTest(city=repr(city)):
                        profile["city"] = city
                        pasted, pasted_queries = self.request_plan(profile)
                        self.assertEqual(pasted, ordinary)
                        self.assertEqual(pasted_queries, ordinary_queries)
                        for query in pasted_queries:
                            self.assertEqual(query["filter.location.query"], "Pasadena")

    def test_exact_city_default_empty_text_and_slice_boundaries(self):
        # Expected values are literal protocol outcomes, not a second normalizer.
        cases = [
            ("missing", _MISSING, "Pasadena"),
            ("null", None, None),
            ("empty", "", None),
            ("only-boundary-whitespace", " \t\r\n\u00a0\u3000", None),
            ("case", " pAsAdEnA ", "pAsAdEnA"),
            ("interior-spaces", " New  York ", "New  York"),
            ("interior-tab", " New\tYork ", "New\tYork"),
            ("literal-unicode", " Cafe\u0301 界 ", "Cafe\u0301 界"),
            ("zero-width-is-not-whitespace", " \u200bPasadena\u200b ",
             "\u200bPasadena\u200b"),
            ("strip-before-cap", " " * 59 + "Pasadena", "Pasadena"),
            ("python-code-point-cap", "界" * 59 + "😀" + "Z", "界" * 59 + "😀"),
            ("no-second-strip", "A" * 59 + " B", "A" * 59 + " "),
        ]
        for label, city, expected in cases:
            with self.subTest(case=label):
                profile = deepcopy(PERSONAS["rosa"])
                if city is _MISSING:
                    profile.pop("city", None)
                else:
                    profile["city"] = city
                _, queries = self.request_plan(profile)
                for query in queries:
                    if expected is None:
                        self.assertNotIn("filter.location.query", query)
                    else:
                        self.assertEqual(query["filter.location.query"], expected)

    def test_invalid_requests_still_stop_before_provider_factories(self):
        with patch.object(web.QlooClient, "from_env",
                          side_effect=AssertionError("unexpected Qloo factory")), \
                patch.object(web, "model_from_env",
                             side_effect=AssertionError("unexpected model factory")):
            cases = [
                ({}, 400),
                ({"cuisines": ["Cuban"], "constraints": ["unsupported"]}, 400),
                ({"cuisines": ["Cuban"], "city": ["Pasadena"]}, 422),
            ]
            for profile, status in cases:
                with self.subTest(profile=profile):
                    response = self.client.post("/api/plan", json=profile)
                    self.assertEqual(response.status_code, status, response.text)
            self.assertEqual(self.client.post("/api/plan/sample/missing").status_code, 404)


if __name__ == "__main__":
    unittest.main(verbosity=2)
