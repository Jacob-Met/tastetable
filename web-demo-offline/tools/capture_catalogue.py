#!/usr/bin/env python3
"""Record finite offline choices using the unchanged pinned TasteTable pipeline."""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import platform
import socket
import sys
import urllib.request
from pathlib import Path

SCHEMA = "tastetable.offline-catalogue.v1"
CONSTRAINTS = ("soft_foods", "low_sodium", "wheelchair")


def blob_sha(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def verify_source(root: Path, pin: dict) -> list[dict]:
    verified = []
    for entry in pin["files"]:
        path = root / entry["path"]
        data = path.read_bytes()
        if blob_sha(data) != entry["git_sha"]:
            raise ValueError(f"Source pin mismatch: {entry['path']}")
        verified.append({"path": entry["path"], "git_sha": entry["git_sha"],
                         "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)})
    return verified


def canonical(value) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def capture(source_root: Path, destination: Path) -> dict:
    pin = json.loads((Path(__file__).resolve().parents[1] / "source-pin.json").read_text())
    if destination.exists():
        raise FileExistsError("Capture output must be a new directory.")
    source_root = source_root.resolve()
    before = verify_source(source_root, pin)
    # These fixture recordings have no network path, even in a live-configured shell.
    blocked_calls = []
    def deny_network(*args, **kwargs):
        blocked_calls.append("blocked")
        raise RuntimeError("Network access is disabled for offline capture.")
    urllib.request.urlopen = deny_network
    socket.create_connection = deny_network
    sys.path.insert(0, str(source_root))
    from agent import ScriptedModel, run_agent
    from constraints import evaluate
    from personas import PERSONAS
    from qloo_client import FixtureTransport, QlooClient, parse_entity

    records = []
    for profile_id, profile in PERSONAS.items():
        for mask in range(8):
            chosen = [name for bit, name in enumerate(CONSTRAINTS) if mask & (1 << bit)]
            persona = {**profile, "constraints": chosen}
            transport = FixtureTransport(source_root / "fixtures" / "qloo_fixtures.json")
            client = QlooClient(api_key="synthetic-fixture", transport=transport)
            response = run_agent(persona, qloo=client, model=ScriptedModel())
            if response.get("mock") is not True or response["comparison"]["constraints"] != chosen:
                raise AssertionError("Fixture/source contract changed.")
            entities = {raw["entity_id"]: parse_entity(raw) for raw in transport.data["places"]}
            items = response["plan"]["meals"] + ([response["plan"]["outing"]]
                                               if response["plan"]["outing"] else [])
            verdicts = []
            for pick in items:
                if not pick["entity_id"].startswith("FIX-") or pick["entity_id"] not in entities:
                    raise AssertionError("Non-fixture pick.")
                verdict = evaluate(entities[pick["entity_id"]], chosen, pick["kind"]).to_dict()
                if not verdict["ok"]:
                    raise AssertionError("The pinned plan retained a rejected pick.")
                verdicts.append(verdict)
            if not response["trace"] or not transport.log:
                raise AssertionError("No actual native pipeline trace.")
            records.append({"key": f"{profile_id}-{mask}", "profile_id": profile_id,
                            "constraint_mask": mask, "constraints": chosen,
                            "response": response, "pick_verdicts": verdicts,
                            "fixture_calls": transport.log})
    after = verify_source(source_root, pin)
    if before != after or blocked_calls:
        raise AssertionError("Source changed or a network path was attempted.")
    dataset = {
        "schema": SCHEMA,
        "source": {"repository": pin["repository"], "commit": pin["commit"],
                   "captured_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                   "python": platform.python_version(),
                   "capture_tool_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                   "mode": "authored ScriptedModel + synthetic FixtureTransport; no live calls",
                   "source_files": before},
        "constraints": list(CONSTRAINTS),
        "profiles": list(PERSONAS.values()),
        "records": records,
    }
    destination.mkdir(parents=True)
    data = canonical(dataset)
    (destination / "catalogue.json").write_bytes(data)
    (destination / "records").mkdir()
    for record in records:
        (destination / "records" / (record["key"] + ".json")).write_bytes(canonical(record))
    receipt = {
        "source_commit": pin["commit"], "profiles": len(PERSONAS), "records": len(records),
        "native_pipeline_runs": len(records), "source_blobs_verified_before_and_after": len(before),
        "network_calls_attempted": len(blocked_calls), "catalogue_bytes": len(data),
        "catalogue_sha256": hashlib.sha256(data).hexdigest(),
        "record_hashes": {r["key"]: hashlib.sha256(canonical(r)).hexdigest() for r in records},
        "outcomes": [{"key": r["key"], "meals": len(r["response"]["plan"]["meals"]),
                      "outing": r["response"]["plan"]["outing"] is not None,
                      "rejected": len(r["response"]["plan"]["rejected"]),
                      "fixture_calls": len(r["fixture_calls"])} for r in records],
    }
    (destination / "capture-receipt.json").write_bytes(canonical(receipt))
    return receipt


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(capture(args.source_root, args.output), ensure_ascii=False))
