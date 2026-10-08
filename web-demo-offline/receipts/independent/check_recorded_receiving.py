#!/usr/bin/env python3
"""Independent finite-record receiving checks, without rerunning the agent capture."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import socket
import sys
import unittest
import urllib.request

ROOT = Path("/tmp/tastetable-offline-81ba1ed0179c/source")
SURFACE = ROOT / "web-demo-offline"
EVIDENCE = Path(__file__).resolve().parent
PIN = json.loads((SURFACE / "source-pin.json").read_text())
CATALOGUE_BYTES = (SURFACE / "data/catalogue.json").read_bytes()
CATALOGUE = json.loads(CATALOGUE_BYTES)
CAPTURE = json.loads((SURFACE / "data/capture-receipt.json").read_text())
CONSTRAINTS = ("soft_foods", "low_sodium", "wheelchair")
NETWORK_ATTEMPTS = []
VERIFIED_SOURCE = {}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()

for entry in PIN["files"]:
    data = (ROOT / entry["path"]).read_bytes()
    assert blob(data) == entry["git_sha"], entry["path"]
    VERIFIED_SOURCE[entry["path"]] = sha(data)

def deny_network(*args, **kwargs):
    NETWORK_ATTEMPTS.append("blocked")
    raise AssertionError("Independent receiving must not call the network")

urllib.request.urlopen = deny_network
socket.create_connection = deny_network
sys.path.insert(0, str(ROOT))
from constraints import evaluate
from personas import PERSONAS
from qloo_client import FixtureTransport, parse_entity

FIXTURE_PATH = ROOT / "fixtures/qloo_fixtures.json"
RAW_PLACES = json.loads(FIXTURE_PATH.read_text())["places"]
ENTITIES = {raw["entity_id"]: parse_entity(raw) for raw in RAW_PLACES}
RETRIEVED = {}
INSIGHT_REPLAYS = 0
for record in CATALOGUE["records"]:
    transport = FixtureTransport(FIXTURE_PATH)
    returned = {}
    for call in record["fixture_calls"]:
        if call["path"] == "/v2/insights":
            result = transport(call["path"], call["params"], {"X-Api-Key": "synthetic-fixture"})
            INSIGHT_REPLAYS += 1
            for raw in result["results"]["entities"]:
                returned.setdefault(raw["entity_id"], parse_entity(raw))
    RETRIEVED[record["key"]] = returned

def picks(record):
    plan = record["response"]["plan"]
    return plan["meals"] + ([plan["outing"]] if plan["outing"] else [])

class RecordedReceivingTests(unittest.TestCase):
    def test_downloads_are_exact_catalogue_objects(self):
        self.assertEqual(sha(CATALOGUE_BYTES), CAPTURE["catalogue_sha256"])
        for record in CATALOGUE["records"]:
            with self.subTest(record=record["key"]):
                data = (SURFACE / "data/records" / (record["key"] + ".json")).read_bytes()
                self.assertEqual(json.loads(data), record)
                self.assertEqual(sha(data), CAPTURE["record_hashes"][record["key"]])

    def test_profiles_and_finite_choices_match_native_personas(self):
        self.assertEqual(CATALOGUE["profiles"], list(PERSONAS.values()))
        self.assertEqual(CATALOGUE["constraints"], list(CONSTRAINTS))
        expected = {f"{profile}-{mask}" for profile in PERSONAS for mask in range(8)}
        self.assertEqual({r["key"] for r in CATALOGUE["records"]}, expected)
        self.assertEqual(len(CATALOGUE["records"]), len(expected))
        for record in CATALOGUE["records"]:
            chosen = [c for bit, c in enumerate(CONSTRAINTS) if record["constraint_mask"] & (1 << bit)]
            self.assertEqual(record["constraints"], chosen)
            self.assertEqual(record["response"]["comparison"]["constraints"], chosen)
            self.assertIs(record["response"]["mock"], True)

    def test_visible_identity_affinity_and_verdicts_bind_native_evidence(self):
        for record in CATALOGUE["records"]:
            expected = []
            for pick in picks(record):
                with self.subTest(record=record["key"], pick=pick["entity_id"]):
                    entity = RETRIEVED[record["key"]][pick["entity_id"]]
                    self.assertEqual(pick["name"], entity.name)
                    self.assertEqual(pick["affinity"], entity.affinity)
                    verdict = evaluate(ENTITIES[pick["entity_id"]], record["constraints"], pick["kind"]).to_dict()
                    self.assertIs(verdict["ok"], True)
                    expected.append(verdict)
            self.assertEqual(record["pick_verdicts"], expected)

    def test_dietary_and_outing_checks_keep_native_semantics(self):
        for record in CATALOGUE["records"]:
            for pick, verdict in zip(picks(record), record["pick_verdicts"]):
                expected = [c for c in record["constraints"]
                            if not (pick["kind"] == "outing" and c in ("soft_foods", "low_sodium"))]
                self.assertEqual([c["constraint"] for c in verdict["checks"]], expected)
                for check in verdict["checks"]:
                    self.assertNotEqual(check["status"], "fail")
                    if check["constraint"] == "wheelchair":
                        self.assertEqual(check["status"], "pass")

    def test_retained_unknown_dietary_results_keep_their_actual_reason(self):
        unknown = []
        for record in CATALOGUE["records"]:
            for pick, verdict in zip(picks(record), record["pick_verdicts"]):
                for check in verdict["checks"]:
                    if check["status"] == "unknown":
                        unknown.append((record["key"], pick["entity_id"], check["constraint"]))
                        self.assertIn(check["constraint"], ("soft_foods", "low_sodium"))
                        self.assertIn("unknown", pick["why"])
                        self.assertIn(check["reason"], pick["why"])
        self.assertEqual(len(unknown), 12)
        self.assertIn(("rosa-1", "FIX-P-10", "soft_foods"), unknown)
        self.assertIn(("rosa-2", "FIX-P-02", "low_sodium"), unknown)

    def test_comparison_counts_describe_visible_recorded_picks(self):
        for record in CATALOGUE["records"]:
            response = record["response"]
            visible = picks(record)
            counts = response["comparison"]
            self.assertEqual(counts["grounded"], {
                "picks": len(visible),
                "with_qloo_entity_id": sum(bool(p["entity_id"]) for p in visible),
                "with_affinity_evidence": sum(p.get("affinity") is not None for p in visible),
                "constraint_checked": len(visible),
                "unsafe_candidates_rejected": len(response["plan"]["rejected"]),
            })
            baseline = response["llm_only"]
            self.assertEqual(counts["llm_only"]["picks"], len(baseline["meals"]) + bool(baseline["outing"]))
            for name in ("with_qloo_entity_id", "with_affinity_evidence", "constraint_checked", "unsafe_candidates_rejected"):
                self.assertEqual(counts["llm_only"][name], 0)

    def test_reused_runtime_files_preserve_pinned_source_bytes(self):
        for source, target in (("static/week_plan.mjs", "week_plan.mjs"),
                               ("static/style.css", "style.css"), ("LICENSE", "LICENSE")):
            self.assertEqual((ROOT / source).read_bytes(), (SURFACE / target).read_bytes())
        self.assertFalse(NETWORK_ATTEMPTS)
        for path, digest in VERIFIED_SOURCE.items():
            self.assertEqual(sha((ROOT / path).read_bytes()), digest)

if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(RecordedReceivingTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    receipt = {
        "schema": "hamon.tastetable.independent-recorded-receiving.v1",
        "utc": datetime.now(timezone.utc).isoformat(),
        "source_commit": PIN["commit"],
        "catalogue_sha256": sha(CATALOGUE_BYTES),
        "checks_source_sha256": sha(Path(__file__).read_bytes()),
        "tests": result.testsRun, "failures": len(result.failures), "errors": len(result.errors),
        "recorded_choices": len(CATALOGUE["records"]),
        "visible_picks": sum(len(picks(r)) for r in CATALOGUE["records"]),
        "native_recorded_insight_replays": INSIGHT_REPLAYS,
        "native_full_agent_capture_runs": 0,
        "network_attempts": len(NETWORK_ATTEMPTS),
        "pinned_source_sha256": VERIFIED_SOURCE,
        "runtime_sha256": {name: sha((SURFACE / name).read_bytes())
                          for name in ("app.mjs", "catalogue.mjs", "index.html", "offline.css", "week_plan.mjs", "style.css")},
        "boundary": "Downloads and visible identity/affinity/verdicts checked against native fixture and evaluator; browser and installation owned by coordination",
    }
    (EVIDENCE / "native-checks-receipt.json").write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
    print(json.dumps({key: receipt[key] for key in ("tests", "failures", "errors", "recorded_choices", "visible_picks", "native_recorded_insight_replays", "network_attempts")}))
    raise SystemExit(not result.wasSuccessful())
