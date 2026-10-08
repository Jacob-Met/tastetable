"""Independent literal-evidence and native-agent receiving for low-sodium cues."""

from __future__ import annotations

import copy
import hashlib
import json
import os
import tempfile
import unittest
from pathlib import Path

import agent
from constraints import check_low_sodium, evaluate, filter_entities
from qloo_client import FixtureTransport, QlooClient, parse_entity

SOURCE_ROOT = Path(agent.__file__).resolve().parent
SOURCE_FILES = ("constraints.py", "agent.py", "qloo_client.py")


def entity(identifier: str, keywords: list):
    return parse_entity({
        "entity_id": identifier, "name": identifier, "types": ["urn:entity:place"],
        "properties": {"keywords": keywords},
    })


def native_fixture() -> dict:
    restaurant_tag = {
        "tag_id": "urn:tag:genre:restaurant:Diner", "name": "Diner",
        "type": "urn:tag:genre:place:restaurant",
    }
    outing_tag = {
        "tag_id": "urn:tag:genre:place:cinema", "name": "cinema",
        "type": "urn:tag:genre:place",
    }
    places = []
    rows = (
        ("PEER-NEGATED", "Withheld Steam Kitchen", ["not steamed", "rich broth"], 0.99),
        ("PEER-HIGH", "High Cue Kitchen", ["rich broth"], 0.97),
        ("PEER-MIXED", "Mixed Evidence Kitchen",
         ["no low sodium options; made to order", "olives"], 0.93),
        ("PEER-POSITIVE", "Affirmative Kitchen", ["heart-healthy", "ramen"], 0.88),
        ("PEER-UNKNOWN", "Unknown Kitchen", ["no low sodium options"], 0.75),
        ("PEER-BACKUP", "Plain Keyword Kitchen", ["seasonal tasting plates"], 0.62),
    )
    for identifier, name, words, affinity in rows:
        places.append({
            "entity_id": identifier, "name": name, "types": ["urn:entity:place"],
            "popularity": 0.5, "tags": [copy.deepcopy(restaurant_tag)],
            "properties": {"geocode": {"city": "Peer City"},
                           "keywords": [{"name": word, "count": 1} for word in words]},
            "_signals": {"PEER-ARTIST": affinity},
        })
    places.append({
        "entity_id": "PEER-OUTING", "name": "Peer Cinema", "types": ["urn:entity:place"],
        "popularity": 0.5, "tags": [copy.deepcopy(outing_tag)],
        "properties": {"geocode": {"city": "Peer City"}, "keywords": ["ramen"]},
        "_signals": {"PEER-ARTIST": 0.81},
    })
    return {
        "_note": "Independent synthetic receiving fixture; no actual venue or person.",
        "search_entities": [{"entity_id": "PEER-ARTIST", "name": "Peer Ensemble",
                             "types": ["urn:entity:artist"], "tags": []}],
        "tags": [{"id": value["tag_id"], "name": value["name"], "type": value["type"]}
                 for value in (restaurant_tag, outing_tag)],
        "places": places,
    }


class LowSodiumPeerTests(unittest.TestCase):
    observations: list[dict] = []

    def check(self, identifier: str, keywords: list) -> dict:
        value = entity(identifier, keywords)
        before = copy.deepcopy(value.to_dict())
        result = check_low_sodium(value).to_dict()
        self.observations.append({"case": self._testMethodName, "entity": before,
                                  "check": result})
        self.assertEqual(value.to_dict(), before)
        return result

    def test_each_existing_cue_can_be_explicitly_negated(self) -> None:
        negatives = (
            "NO low sodium options", "NOT heart-healthy", "without steamed dishes",
            "not made to order",
        )
        checks = [self.check(f"PEER-N{index}", [{"name": text}, "pickled cabbage"])
                  for index, text in enumerate(negatives)]
        self.assertEqual([item["status"] for item in checks], ["fail"] * len(negatives))
        for item in checks:
            self.assertIn("pickled cabbage", item["reason"])
            self.assertNotIn("lower-sodium signals", item["reason"])

    def test_independent_affirmative_cues_keep_the_existing_precedence(self) -> None:
        cases = (
            (["no low sodium options; made to order", "olives"], "made to order"),
            (["not steamed; heart-healthy choices", "rich broth"], "heart-healthy"),
            (["low sodium", "no steamed options", "ramen"], "low sodium"),
            (["not only low sodium", "ramen"], "low sodium"),
            (["known low sodium dishes", "pickled cabbage"], "low sodium"),
        )
        checks = [self.check(f"PEER-A{index}", words)
                  for index, (words, _cue) in enumerate(cases)]
        self.assertEqual([item["status"] for item in checks], ["pass"] * len(cases))
        for item, (_words, cue) in zip(checks, cases):
            self.assertIn(cue, item["reason"])
        self.assertNotIn("no steamed options", checks[2]["reason"])

    def test_missing_affirmative_evidence_retains_unknown_admission_policy(self) -> None:
        value = entity("PEER-U", [{"name": "low sodium options not available"}])
        verdict = evaluate(value, ["low_sodium"])
        self.observations.append({"case": self._testMethodName, "entity": value.to_dict(),
                                  "verdict": verdict.to_dict()})
        self.assertEqual(verdict.checks[0].status, "unknown")
        self.assertTrue(verdict.ok, "The existing low-sodium unknown policy stays permissive")
        high = entity("PEER-H", ["not made to order", "rich broth"])
        kept, verdicts = filter_entities([value, high], ["low_sodium"])
        self.assertEqual([item.entity_id for item in kept], ["PEER-U"])
        self.assertEqual([item.ok for item in verdicts], [True, False])
        outing = evaluate(high, ["low_sodium"], kind="outing")
        self.assertTrue(outing.ok)
        self.assertEqual(outing.checks, [])

    def test_native_agent_rejects_false_positive_and_retains_unknown_pick(self) -> None:
        data = native_fixture()
        persona = {
            "label": "Synthetic Peer", "city": "Peer City", "cuisines": ["Diner"],
            "music": ["Peer Ensemble"], "films": [], "constraints": ["low_sodium"],
        }
        persona_before = copy.deepcopy(persona)
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory) / "peer-fixture.json"
            fixture.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8", newline="")
            original = fixture.read_bytes()
            transport = FixtureTransport(fixture)
            client = QlooClient(api_key="SYNTHETIC-LOCAL-ONLY", transport=transport)
            result = agent.run_agent(persona, qloo=client, model=agent.ScriptedModel())
            unchanged = fixture.read_bytes() == original
        self.observations.append({
            "case": self._testMethodName, "fixture": data,
            "fixture_sha256": hashlib.sha256(original).hexdigest(),
            "fixture_unchanged": unchanged, "persona_unchanged": persona == persona_before,
            "result": result, "fixture_transport_requests": transport.log,
        })
        self.assertTrue(unchanged)
        self.assertEqual(persona, persona_before)
        self.assertTrue(result["mock"])
        meals = {row["entity_id"]: row for row in result["plan"]["meals"]}
        self.assertEqual(set(meals), {
            "PEER-MIXED", "PEER-POSITIVE", "PEER-UNKNOWN", "PEER-BACKUP",
        })
        self.assertIn("Low sodium: unknown", meals["PEER-UNKNOWN"]["why"])
        self.assertIn("Low sodium: pass", meals["PEER-POSITIVE"]["why"])
        self.assertIn("made to order", meals["PEER-MIXED"]["why"])
        rejected = {row["entity_id"]: row for row in result["plan"]["rejected"]}
        self.assertEqual(set(rejected), {"PEER-NEGATED", "PEER-HIGH"})
        self.assertEqual(rejected["PEER-NEGATED"]["failed"][0]["status"], "fail")
        self.assertEqual(result["plan"]["outing"]["entity_id"], "PEER-OUTING")
        self.assertEqual(result["comparison"]["grounded"]["with_qloo_entity_id"], 5)
        self.assertTrue(any(row["tool"] == "constraint_check" for row in result["trace"]))
        self.assertTrue(any(row["path"] == "/v2/insights" for row in transport.log))
        self.assertNotIn("Synthetic Peer", json.dumps(transport.log))


if __name__ == "__main__":
    before = {name: hashlib.sha256((SOURCE_ROOT / name).read_bytes()).hexdigest()
              for name in SOURCE_FILES}
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(LowSodiumPeerTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    after = {name: hashlib.sha256((SOURCE_ROOT / name).read_bytes()).hexdigest()
             for name in SOURCE_FILES}
    destination = os.environ.get("TASTE_PEER_EVIDENCE")
    if destination:
        path = Path(destination)
        path.mkdir(parents=True, exist_ok=True)
        (path / "receiving.json").write_text(json.dumps({
            "source": str(SOURCE_ROOT), "source_sha256": before,
            "source_unchanged": before == after,
            "test_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "tests": result.testsRun, "failures": len(result.failures),
            "errors": len(result.errors), "skipped": len(result.skipped),
            "passed": result.testsRun - len(result.failures) - len(result.errors),
            "observations": LowSodiumPeerTests.observations,
            "scope": "Synthetic literal keywords and existing native offline fixture agent only.",
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    raise SystemExit(0 if result.wasSuccessful() and before == after else 1)
