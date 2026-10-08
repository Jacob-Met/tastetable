"""Run frozen original receivers and focused native unittest suites, preserving exits."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
BOOT = r"""
import importlib.util, json, pathlib, sys, unittest
root = pathlib.Path(sys.argv[1])
sys.path.insert(0, str(root))
suite = unittest.TestSuite()
for index, filename in enumerate(sys.argv[2:]):
    spec = importlib.util.spec_from_file_location('receiving_test_' + str(index), filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    suite.addTests(unittest.defaultTestLoader.loadTestsFromModule(module))
result = unittest.TextTestRunner(verbosity=2).run(suite)
print(json.dumps({'methods': result.testsRun, 'failures': len(result.failures),
                  'errors': len(result.errors), 'skips': len(result.skipped),
                  'success': result.wasSuccessful()}))
raise SystemExit(0 if result.wasSuccessful() else 1)
"""


def main():
    variant = sys.argv[1]
    if variant not in ("baseline", "candidate"):
        raise ValueError("Choose baseline or candidate.")
    source = ROOT / variant
    output = ROOT / ("local-qualification-" + variant)
    output.mkdir(exist_ok=False)
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1", PYTHONPATH=str(source))
    tests = [source / "tests" / name for name in
             ("test_low_sodium_evidence.py", "test_low_sodium_peer.py", "test_native_plan_cli.py")]
    tests.append(ROOT / "candidate/tests/test_soft_food_evidence.py")
    rows = []
    for optimized in (False, True):
        python = [sys.executable, "-B"] + (["-O"] if optimized else [])
        mode = "optimized" if optimized else "normal"
        commands = {
            "original": python + [str(ROOT / "receive_original.py"), str(source)],
            "local-cues": python + [str(ROOT / "receive_local_cues.py"), str(source)],
            "focused-unittest": python + ["-c", BOOT, str(source), *map(str, tests)],
        }
        for name, command in commands.items():
            result = subprocess.run(command, cwd=output, env=env,
                                    capture_output=True, timeout=60)
            stdout = output / (name + "-" + mode + ".stdout")
            stderr = output / (name + "-" + mode + ".stderr")
            stdout.write_bytes(result.stdout)
            stderr.write_bytes(result.stderr)
            parsed = json.loads(result.stdout)
            rows.append({"name": name, "optimized": optimized,
                         "command": command, "exit_code": result.returncode,
                         "stdout": {"path": stdout.name, "sha256": hashlib.sha256(result.stdout).hexdigest()},
                         "stderr": {"path": stderr.name, "sha256": hashlib.sha256(result.stderr).hexdigest()},
                         "result": {key: value for key, value in parsed.items()
                                    if key in ("passed", "failed", "methods", "failures", "errors", "skips", "success")}})
    receipt = {"schema": "tastetable.soft-cue-focused-native-receiving.v1",
               "variant": variant, "python": sys.version, "results": rows}
    (output / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({"receipt": str(output / "receipt.json"),
                      "results": [{k: v for k, v in row.items()
                                   if k in ("name", "optimized", "exit_code", "result")}
                                  for row in rows]}, indent=2))
    expected = 1 if variant == "baseline" else 0
    return 0 if all(row["exit_code"] == expected for row in rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
