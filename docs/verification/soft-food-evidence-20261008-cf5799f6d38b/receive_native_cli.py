"""Receive explicit soft-cue evidence through the existing offline CLI and week codec.

Usage: python [-O] receive_native_cli.py SOURCE NEW_OUTPUT
The four altered fixture files are test inputs. Product files are copied exactly;
the public CLI, planner, scripted policy, fixture transport and writer are used.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys


FILES = ("agent.py", "constraints.py", "qloo_client.py", "personas.py",
         "tastetable_cli.py", "fixtures/qloo_fixtures.json")
WRITER_FILES = ("tools/native_plan_to_week.mjs", "static/week_plan.mjs",
                "static/week_file.mjs")
CASES = (
    ("denied", ["no soup"], "unknown", True),
    ("unavailable", ["soup unavailable"], "unknown", True),
    ("firm-and-denied", ["burger", "no soup"], "fail", False),
    ("firm-and-affirmative", ["burger", "soup"], "pass", True),
)
CLI_GUARD = r"""
import atexit, json, pathlib, runpy, sys
script, audit_path = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
sys.argv = [str(script), *sys.argv[3:]]
sys.path.insert(0, str(script.parent))
events = {"network_attempts": [], "fixture_reads": 0}
def audit(event, args):
    if event in ("socket.connect", "socket.getaddrinfo", "urllib.Request"):
        events["network_attempts"].append(event)
        raise RuntimeError("provider access forbidden in offline receiving")
    if event == "open" and isinstance(args[0], str) and args[0].endswith("/fixtures/qloo_fixtures.json"):
        events["fixture_reads"] += 1
sys.addaudithook(audit)
atexit.register(lambda: audit_path.write_text(json.dumps(events), encoding="utf-8"))
runpy.run_path(str(script), run_name="__main__")
"""
REOPEN = r"""
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
const [modulePath, nativePath, savedPath] = process.argv.slice(1);
const {readWeekFile} = await import(pathToFileURL(modulePath));
const native = JSON.parse(fs.readFileSync(nativePath, 'utf8'));
const saved = fs.readFileSync(savedPath, 'utf8');
const restored = readWeekFile(saved);
if (JSON.stringify(restored.response) !== JSON.stringify(native.response)) {
  throw new Error('The reopened response changed.');
}
if (JSON.stringify(restored.inputs) !== JSON.stringify(native.profile)) {
  throw new Error('The reopened profile changed.');
}
if (restored.state.weekStart !== '2026-10-05') throw new Error('The week changed.');
console.log(JSON.stringify({response_preserved: true, inputs_preserved: true,
  weekStart: restored.state.weekStart, picks: restored.state.picks,
  constraints: restored.state.constraints}));
"""


def pin(path: Path) -> dict:
    data = path.read_bytes()
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
            "git_blob": hashlib.sha1(b"blob " + str(len(data)).encode()
                                     + b"\0" + data).hexdigest()}


def write_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def run(command: list[str], output: Path, stem: str, env: dict) -> dict:
    result = subprocess.run(command, cwd=output, env=env, capture_output=True,
                            timeout=20)
    stdout, stderr = output / (stem + ".stdout"), output / (stem + ".stderr")
    stdout.write_bytes(result.stdout)
    stderr.write_bytes(result.stderr)
    return {"command": command, "exit_code": result.returncode,
            "stdout": {"path": stdout.name, **pin(stdout)},
            "stderr": {"path": stderr.name, **pin(stderr)}}


def main() -> int:
    source, output = (Path(value).resolve() for value in sys.argv[1:3])
    output.mkdir(parents=True, exist_ok=False)
    original_pins = {name: pin(source / name) for name in FILES + WRITER_FILES}
    env = dict(os.environ)
    env.update(PYTHONDONTWRITEBYTECODE="1", TASTETABLE_LIVE="1",
               QLOO_API_KEY="SYNTHETIC-RECEIVING-NOT-A-KEY",
               QLOO_BASE_URL="https://must-not-contact.invalid",
               TASTETABLE_LLM_BASE_URL="https://must-not-contact.invalid")
    python = [sys.executable, "-B"] + (["-O"] if sys.flags.optimize else [])
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Use an existing Node.js 18+ runtime; do not replace the writer.")
    rows = []
    for name, words, status, included in CASES:
        work = output / name
        fixture_source = work / "fixture-source"
        fixture_source.mkdir(parents=True)
        for relative in FILES:
            destination = fixture_source / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source / relative, destination)
        fixture_path = fixture_source / "fixtures/qloo_fixtures.json"
        fixture = json.loads(fixture_path.read_text())
        target = next(row for row in fixture["places"] if row["entity_id"] == "FIX-P-03")
        old_words = target["properties"]["keywords"]
        target["properties"]["keywords"] = [{"name": word} for word in words]
        write_json(fixture_path, fixture)
        fixture_pin = pin(fixture_path)
        fixture_check = json.loads(fixture_path.read_text())
        next(row for row in fixture_check["places"] if row["entity_id"] == "FIX-P-03")["properties"]["keywords"] = old_words
        if fixture_check != json.loads((source / "fixtures/qloo_fixtures.json").read_text()):
            raise RuntimeError("The receiving fixture changed outside its authored keyword field.")
        audit = work / "cli-audit.json"
        cli = run(python + ["-c", CLI_GUARD, str(fixture_source / "tastetable_cli.py"),
                            str(audit), "--persona", "rosa"], work, "native", env)
        if cli["exit_code"]:
            raise RuntimeError("The real CLI failed; preserve " + str(work))
        native_path = work / "native.stdout"
        native = json.loads(native_path.read_text())
        plan = native["response"]["plan"]
        kept = [row for row in plan["meals"] if row["entity_id"] == "FIX-P-03"]
        rejected = [row for row in plan["rejected"] if row["entity_id"] == "FIX-P-03"]
        actual_status = None
        if kept:
            actual_status = next((value for value in ("pass", "fail", "unknown")
                                  if "Soft foods: " + value + " (" in kept[0]["why"]), None)
        elif rejected:
            actual_status = next((check["status"] for check in rejected[0]["failed"]
                                  if check["constraint"] == "soft_foods"), None)
        writer_path = work / "saved-week.json"
        writer = run([node, str(source / "tools/native_plan_to_week.mjs"),
                      "--input", str(native_path), "--week", "2026-10-08",
                      "--output", str(writer_path)], work, "writer", env)
        if writer["exit_code"]:
            raise RuntimeError("The actual week writer failed; preserve " + str(work))
        reopen = run([node, "--input-type=module", "-e", REOPEN,
                      str(source / "static/week_file.mjs"), str(native_path),
                      str(writer_path)], work, "reopen", env)
        audit_value = json.loads(audit.read_text())
        intact = (fixture_pin == pin(fixture_path)
                  and all(pin(fixture_source / p) == original_pins[p]
                          for p in FILES if p != "fixtures/qloo_fixtures.json"))
        passed = (actual_status == status and bool(kept) == included
                  and native["response"]["mock"] is True
                  and audit_value == {"network_attempts": [], "fixture_reads": 1}
                  and reopen["exit_code"] == 0 and intact)
        rows.append({"name": name, "test_only_keywords": words,
                     "fixture": {"path": str(fixture_path.relative_to(output)), **fixture_pin},
                     "expected_status": status, "expected_included": included,
                     "actual_status": actual_status, "actual_kept": kept,
                     "actual_rejected": rejected, "audit": audit_value,
                     "exact_product_copies_and_fixture_intact": intact,
                     "cli": cli, "writer": writer, "reopen": reopen,
                     "saved_week": pin(writer_path), "pass": passed})
    unchanged = all(pin(source / name) == item for name, item in original_pins.items())
    result = {"schema": "tastetable.soft-cue-native-cli-receiving.v1",
              "source": str(source), "python": sys.version, "platform": platform.platform(),
              "optimized": bool(sys.flags.optimize), "node": subprocess.check_output([node, "--version"], text=True).strip(),
              "source_pins": original_pins, "source_unchanged": unchanged,
              "scope": "Actual offline CLI, scripted planner and saved-week writer/reader using four test-only keyword fixture variations; no browser or live-provider claim.",
              "cases": rows, "passed": sum(row["pass"] for row in rows),
              "failed": sum(not row["pass"] for row in rows)}
    write_json(output / "receipt.json", result)
    print(json.dumps({"receipt": str(output / "receipt.json"), "passed": result["passed"],
                      "failed": result["failed"], "source_unchanged": unchanged}))
    return 0 if unchanged and result["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
