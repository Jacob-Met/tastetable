"""Independent native receiving of conflicting accessibility evidence."""
from __future__ import annotations
import copy, hashlib, json, os, pathlib, platform, socket, sys, time
import urllib.request

os.environ["TASTETABLE_LIVE"] = "0"
sys.dont_write_bytecode = True
source = pathlib.Path(sys.argv[1]).resolve()
destination = pathlib.Path(sys.argv[2]).resolve()
expected_constraint_sha = sys.argv[3] if len(sys.argv) > 3 else None

def pins():
    result = {}
    for p in sorted(source.rglob("*")):
        if p.is_file() and p.suffix in (".py", ".json"):
            data = p.read_bytes()
            result[str(p.relative_to(source))] = {
                "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                "git_blob": hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest(),
            }
    return result

before = pins()
if expected_constraint_sha:
    assert before["constraints.py"]["sha256"] == expected_constraint_sha
external = []
def no_network(*args, **kwargs):
    external.append("attempt")
    raise AssertionError("independent receiving uses only the local fixture")
urllib.request.urlopen = no_network
socket.socket.connect = no_network
sys.path.insert(0, str(source))
from agent import ScriptedModel, run_agent
from constraints import evaluate
from personas import PERSONAS
from qloo_client import FixtureTransport, QlooClient, parse_entity

access_id = "urn:tag:accessibility:place:wheelchair_accessible_entrance"
positive = {"tag_id": access_id, "name": "Wheelchair accessible entrance"}
def note(name):
    return {"tag_id": "urn:tag:accessibility:place:entrance_note", "name": name}

cases = [
    ("mixed_period_denial", [positive, note("Not wheelchair accessible.")], "unknown", 0),
    ("mixed_colon_uncertainty", [positive, note("Wheelchair accessibility: unconfirmed")], "unknown", 0),
    ("unlabelled_positive_mixed_denial", [{"tag_id": access_id}, note("No wheelchair access.")], "unknown", 0),
    ("qualified_entrance_only", [note("Wheelchair accessible entrance (advance arrangement required)")], "unknown", 0),
    ("affirmative_and_unrelated_service", [positive, {"tag_id": "urn:tag:amenity:place:wheelchair_rental", "name": "Wheelchair rental"}], "pass", 5),
    ("established_id_without_label", [{"tag_id": access_id}], "pass", 5),
    ("steps_take_precedence", [positive, {"tag_id": "urn:tag:accessibility:place:steps_at_entrance", "name": "Steps at entrance"}], "fail", 0),
]
cases.append(("mixed_accessibility_namespace_denial", [positive, note("Wheelchair users prohibited")], "unknown", 0))
observations = []
start = time.monotonic()
for label, authored_tags, expected_status, expected_picks in cases:
    tags = copy.deepcopy(authored_tags)
    direct = evaluate(parse_entity({"entity_id": "INDEPENDENT-FIXTURE", "name": "Independent fictional venue", "tags": tags}), ["wheelchair"])
    transport = FixtureTransport()
    for place in transport.data["places"]:
        place["tags"] = [t for t in place["tags"] if not str(t.get("tag_id") or t.get("id") or "").startswith("urn:tag:accessibility:")]
        place["tags"].extend(copy.deepcopy(tags))
    result = run_agent(copy.deepcopy(PERSONAS["rosa"]), qloo=QlooClient(api_key="LOCAL-FICTIONAL-FIXTURE", transport=transport), model=ScriptedModel())
    plan = result["plan"]
    picks = plan["meals"] + ([plan["outing"]] if plan["outing"] else [])
    status = direct.checks[0].status
    good = status == expected_status and len(picks) == expected_picks and result["mock"] is True
    observations.append({
        "case": label, "tags": tags, "expected_status": expected_status,
        "actual_verdict": direct.to_dict(), "expected_picks": expected_picks,
        "actual_picks": len(picks), "first_pick_why": picks[0]["why"] if picks else None,
        "rejected": len(plan["rejected"]), "fixture_requests": len(transport.log),
        "mock": result["mock"], "passed": good,
    })
after = pins()
unchanged = before == after
receipt = {
    "source": str(source), "python": sys.version, "platform": platform.platform(),
    "elapsed_seconds": time.monotonic() - start, "cases": observations,
    "passed": sum(o["passed"] for o in observations), "total": len(observations),
    "source_unchanged": unchanged, "external_attempts": len(external),
    "source_pins": before,
}
destination.parent.mkdir(parents=True, exist_ok=True)
with destination.open("x", encoding="utf-8") as output:
    json.dump(receipt, output, indent=2, ensure_ascii=False)
    output.write("\n")
print(json.dumps({"receipt": str(destination), "passed": receipt["passed"], "total": receipt["total"], "source_unchanged": unchanged, "external_attempts": len(external), "cases": [{"case": o["case"], "actual_status": o["actual_verdict"]["checks"][0]["status"], "actual_picks": o["actual_picks"], "passed": o["passed"]} for o in observations]}))
sys.exit(0 if unchanged and not external and all(o["passed"] for o in observations) else 1)
