"""Validate the independent punctuation finding without repeating accepted original runs."""
from pathlib import Path
from datetime import datetime, timezone
import difflib, hashlib, json, os, shutil, subprocess, sys
ROOT = Path(__file__).resolve().parent
MIN_FREE = 512 * 1024 * 1024
MAX_OWN = 16 * 1024 * 1024
ENV = {**os.environ, "TASTETABLE_LIVE": "0", "PYTHONDONTWRITEBYTECODE": "1"}
records = []
def sha(b): return hashlib.sha256(b).hexdigest()
def blob(b): return hashlib.sha1(b"blob " + str(len(b)).encode() + b"\0" + b).hexdigest()
def guard():
    free = shutil.disk_usage(ROOT).free
    own = sum(p.stat().st_size for p in ROOT.rglob("*") if p.is_file())
    assert free >= MIN_FREE and own <= MAX_OWN, (free, own)
    return {"free_bytes": free, "own_bytes": own}
def run(name, argv, cwd, expected):
    before = guard()
    p = subprocess.run(argv, cwd=cwd, env=ENV, capture_output=True, text=True, timeout=45)
    r = {"name": name, "command": argv, "cwd": str(cwd), "returncode": p.returncode,
         "expected_returncode": expected, "stdout": p.stdout, "stderr": p.stderr,
         "stdout_sha256": sha(p.stdout.encode()), "before": before, "after": guard()}
    records.append(r)
    assert p.returncode == expected, r
    print(json.dumps({"name": name, "returncode": p.returncode, "summary": p.stdout.splitlines()[-1:]}), flush=True)
    return p.stdout
pins = json.loads((ROOT / "source-pins.json").read_text())
oldpins = json.loads((ROOT / "candidate-v1/product-pins.json").read_text())
for row in oldpins["product_files"]:
    assert sha((ROOT / "candidate-v1/source" / row["path"]).read_bytes()) == row["sha256"]
for row in pins["files"]:
    assert blob((ROOT / "baseline" / row["path"]).read_bytes()) == row["git_blob"]
    if row["path"] != "constraints.py":
        assert blob((ROOT / "source" / row["path"]).read_bytes()) == row["git_blob"]
control = ROOT / "punctuation-v1-control"
shutil.copytree(ROOT / "candidate-v1/source", control)
newtest = (ROOT / "source/tests/test_wheelchair_evidence.py").read_bytes()
(control / "tests/test_wheelchair_evidence.py").write_bytes(newtest)
python = "/usr/bin/python3"
try:
    run("independent_punctuation_regressions_on_v1",
        [python, "-B", "-m", "pytest", "-q", "-p", "no:cacheprovider",
         "tests/test_wheelchair_evidence.py", "-k", "punctuated_mixed"], control, 1)
    run("v2_planner_and_constraint_tests",
        [python, "-B", "-m", "pytest", "-q", "-p", "no:cacheprovider",
         "tests/test_tastetable.py", "tests/test_constraint_binding.py",
         "tests/test_wheelchair_evidence.py", "-k", "not web_endpoints"], ROOT / "source", 0)
    before = guard()
    p = subprocess.run([python, "-B", str(ROOT / "healthy.py"), str(ROOT / "source")],
                       cwd=ROOT, env=ENV, capture_output=True, timeout=45)
    expected = (ROOT / "healthy-original.json").read_bytes()
    records.append({"name": "v2_complete_persona_output_matches_retained_original",
                    "command": [python, "-B", str(ROOT / "healthy.py"), str(ROOT / "source")],
                    "cwd": str(ROOT), "returncode": p.returncode, "stdout_sha256": sha(p.stdout),
                    "expected_sha256": sha(expected), "byte_identical": p.stdout == expected,
                    "stdout_bytes": len(p.stdout), "stderr": p.stderr.decode(),
                    "before": before, "after": guard()})
    assert p.returncode == 0 and p.stdout == expected
    (ROOT / "healthy-candidate.json").write_bytes(p.stdout)
    for row in oldpins["product_files"]:
        assert sha((ROOT / "candidate-v1/source" / row["path"]).read_bytes()) == row["sha256"]
    for row in pins["files"]:
        assert blob((ROOT / "baseline" / row["path"]).read_bytes()) == row["git_blob"]
        if row["path"] != "constraints.py":
            assert blob((ROOT / "source" / row["path"]).read_bytes()) == row["git_blob"]
finally:
    receipt = {"at": datetime.now(timezone.utc).isoformat(), "base": pins["base"], "tree": pins["tree"],
               "python": sys.version, "commands": records, "guards": {"minimum_free_bytes": MIN_FREE,
               "maximum_own_bytes": MAX_OWN, "command_timeout_seconds": 45},
               "runner_sha256": sha(Path(__file__).read_bytes()),
               "finding": "Independent actual planner receiver found a period/colon on a mixed wheelchair access label did not cancel separate affirmative evidence.",
               "previous_candidate_source": oldpins["product_files"][0],
               "scope": "English accessibility word recognition across punctuation only; same exact positive admission and steps precedence. Historical original/v1 tests remain in native-results.json."}
    (ROOT / "punctuation-results.json").write_text(json.dumps(receipt, indent=2) + "\n")
diff = list(difflib.unified_diff((ROOT / "baseline/constraints.py").read_text().splitlines(True),
                               (ROOT / "source/constraints.py").read_text().splitlines(True),
                               fromfile="a/constraints.py", tofile="b/constraints.py"))
diff += list(difflib.unified_diff([], newtest.decode().splitlines(True),
                                fromfile="/dev/null", tofile="b/tests/test_wheelchair_evidence.py"))
(ROOT / "product.diff").write_text("".join(diff))
products = [{"path": path, "git_blob": blob((ROOT / "source" / path).read_bytes()),
             "sha256": sha((ROOT / "source" / path).read_bytes()), "bytes": (ROOT / "source" / path).stat().st_size}
            for path in ["constraints.py", "tests/test_wheelchair_evidence.py"]]
final = {"base": pins["base"], "tree": pins["tree"], "product_files": products,
         "diff_sha256": sha((ROOT / "product.diff").read_bytes()), "unchanged_selected_files": 8,
         "healthy_complete_results_byte_identical": True, "healthy_sha256": sha(expected),
         "healthy_bytes": len(expected), "source_pins_unchanged": True, "resource": guard(),
         "candidate_version": 2, "previous_candidate_source_sha256": oldpins["product_files"][0]["sha256"],
         "punctuation_results_sha256": sha((ROOT / "punctuation-results.json").read_bytes())}
(ROOT / "product-pins.json").write_text(json.dumps(final, indent=2) + "\n")
print(json.dumps(final), flush=True)
