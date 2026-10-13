#!/usr/bin/env python3
"""Verify the TasteTable source/evidence companion without executing a browser."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent

def require(ok, message):
    if not ok:
        raise ValueError(message)

def sha(b):
    return hashlib.sha256(b).hexdigest()

def blob(b):
    return hashlib.sha1(b"blob " + str(len(b)).encode("ascii") + b"\0" + b).hexdigest()

def verify():
    manifest = json.loads((ROOT / "MANIFEST.json").read_text(encoding="utf-8"))
    require(manifest["schema"] == "hamon.tastetable.departure-package.v1", "Unknown manifest")
    for name, h in manifest["files"].items():
        p = ROOT / name
        require(p.is_file() and not p.is_symlink() and p.resolve().is_relative_to(ROOT), "Missing regular payload: " + name)
        b = p.read_bytes()
        require(len(b) == h["bytes"] and sha(b) == h["sha256"], "Changed payload: " + name)
    pins = json.loads((ROOT / "SOURCE-PINS.json").read_text(encoding="utf-8"))
    for name, h in pins["files"].items():
        require(blob((ROOT / name).read_bytes()) == h["git_blob"], "Published blob differs: " + name)
    packet = json.loads((ROOT / "source-packet.json").read_text(encoding="utf-8"))
    require(len(packet["files"]) == 19 and len(packet["candidate"]) == 4, "Native source closure differs")
    for kind in ["files", "candidate"]:
        for f in packet[kind]:
            folder = "base" if kind == "files" else "candidate"
            b = (ROOT / "source" / folder / f["path"]).read_bytes()
            require(b == f["content"].encode("utf-8"), "Native source-packet differs: " + f["path"])
    evidence = ROOT / "evidence"
    receipt = json.loads((evidence / "native-receipt.json").read_text(encoding="utf-8"))
    require(sha((evidence / "native/receive-departure.cjs").read_bytes()) == receipt["driver"]["sha256"], "Native driver differs")
    downloads = 0
    for variant, expected_passed in [("original", 2), ("candidate", 9)]:
        folder = evidence / "native" / (variant + "-browser-qualified")
        result = json.loads((folder / "result.json").read_text(encoding="utf-8"))
        require(len(result["groups"]) == 9 and sum(g["status"] == "passed" for g in result["groups"]) == expected_passed, variant + " group result differs")
        require(not result["pageErrors"] and result["externalRequests"] == [] and result["sourceUnchanged"], variant + " browser boundary differs")
        for name, expected in result["sources"].items():
            path = ROOT / "source/candidate" / name
            if variant == "original" or not path.exists():
                path = ROOT / "source/base" / name
            require(sha(path.read_bytes()) == expected, variant + " tested source differs: " + name)
        for entry in result["artifacts"]:
            b = (folder / entry["name"]).read_bytes()
            require(len(b) == entry["bytes"] and sha(b) == entry["sha256"], variant + " actual download differs")
            json.loads(b)
            downloads += 1
    independent = json.loads((evidence / "independent-review.json").read_text(encoding="utf-8"))
    require(independent["status"] == "passed" and len(independent["checks"]) == 13, "Independent model review differs")
    return {
        "status": "passed", "payloads_verified": len(manifest["files"]),
        "published_blobs_verified": len(pins["files"]), "original_source_files": 19,
        "candidate_overlay_files": 4, "original_passed_groups": 2, "candidate_passed_groups": 9,
        "retained_actual_downloads": downloads, "independent_model_checks": 13,
        "qualification": "Source custody and recorded native evidence; no new browser or deployment"
    }

if __name__ == "__main__":
    try:
        print(json.dumps(verify(), indent=2))
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print("Receiving failed: " + str(exc), file=sys.stderr)
        sys.exit(1)
