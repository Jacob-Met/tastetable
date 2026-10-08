"""Compare complete CLI bytes on the three original fictional profiles and fixture."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

from receive_native_cli import CLI_GUARD, pin

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "positive-corpus-receiving"
OUTPUT.mkdir(exist_ok=False)
env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1", TASTETABLE_LIVE="1",
           QLOO_API_KEY="SYNTHETIC-POSITIVE-CONTROL",
           QLOO_BASE_URL="https://must-not-contact.invalid",
           TASTETABLE_LLM_BASE_URL="https://must-not-contact.invalid")
rows = []
comparisons = []
for persona in ("rosa", "harold", "mei"):
    bodies = []
    for variant in ("baseline", "candidate"):
        for optimized in (False, True):
            source = ROOT / variant
            label = persona + "-" + variant + ("-optimized" if optimized else "-normal")
            audit = OUTPUT / (label + ".audit.json")
            command = ([sys.executable, "-B"] + (["-O"] if optimized else [])
                       + ["-c", CLI_GUARD, str(source / "tastetable_cli.py"),
                          str(audit), "--persona", persona])
            result = subprocess.run(command, cwd=OUTPUT, env=env,
                                    capture_output=True, timeout=20)
            stdout = OUTPUT / (label + ".stdout")
            stderr = OUTPUT / (label + ".stderr")
            stdout.write_bytes(result.stdout)
            stderr.write_bytes(result.stderr)
            parsed = json.loads(result.stdout)
            audit_value = json.loads(audit.read_text())
            passed = (result.returncode == 0 and not result.stderr
                      and parsed["response"]["mock"] is True
                      and audit_value == {"network_attempts": [], "fixture_reads": 1})
            rows.append({"persona": persona, "variant": variant, "optimized": optimized,
                         "command": command, "exit_code": result.returncode,
                         "stdout": {"path": stdout.name, **pin(stdout)},
                         "stderr": {"path": stderr.name, **pin(stderr)},
                         "audit": audit_value, "pass": passed})
            bodies.append(result.stdout)
    comparisons.append({"persona": persona,
                        "all_four_complete_native_responses_byte_identical": all(body == bodies[0] for body in bodies)})
source_pins = {variant: {name: pin(ROOT / variant / name)
                        for name in ("constraints.py", "fixtures/qloo_fixtures.json", "personas.py")}
               for variant in ("baseline", "candidate")}
receipt = {"schema": "tastetable.preserved-native-persona-corpus.v1",
           "python": sys.version, "source_pins": source_pins,
           "results": rows, "comparisons": comparisons,
           "scope": "Original fictional fixture and all three original personas; actual audited offline CLI, without an authored fixture modification."}
(OUTPUT / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({"receipt": str(OUTPUT / "receipt.json"), "comparisons": comparisons,
                  "successful_processes": sum(row["pass"] for row in rows)}, indent=2))
raise SystemExit(0 if all(row["pass"] for row in rows)
                 and all(row["all_four_complete_native_responses_byte_identical"]
                         for row in comparisons) else 1)
