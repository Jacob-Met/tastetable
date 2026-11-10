#!/usr/bin/env python3
"""Build a Python 3.12/Linux x86_64 fixture app with installed dependencies."""
import argparse
import json
import pathlib
import shutil
import subprocess
import sys
import sysconfig
import tarfile
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument("--output", required=True)
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parent.parent
output = pathlib.Path(args.output).resolve()
if output.exists():
    raise SystemExit("Choose a new output file.")
if sys.version_info[:2] != (3, 12) or sysconfig.get_platform() != "linux-x86_64":
    raise SystemExit("This portable build targets CPython 3.12 on Linux x86_64.")
source = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
with tempfile.TemporaryDirectory(prefix="tastetable-build-") as temp:
    app = pathlib.Path(temp) / "tastetable"
    app.mkdir()
    # Only tracked application files; never copy credentials, worktrees or virtualenvs.
    paths = subprocess.check_output(["git", "ls-files", "-z"], cwd=root).decode().split("\0")
    for name in filter(None, paths):
        if name.startswith(".git"): continue
        target = app / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(root / name, target)
    deps = pathlib.Path(sysconfig.get_path("purelib"))
    shutil.copytree(deps, app / "vendor", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    (app / "BUILD.json").write_text(json.dumps({
        "source": source, "python": sys.version, "platform": sysconfig.get_platform(),
        "mode": "synthetic Qloo fixture and scripted model; no provider requests",
    }, indent=2) + "\n")
    (app / "start.sh").write_text("""#!/bin/sh
set -eu
cd "$(dirname "$0")"
python3 -c 'import sys; assert sys.version_info[:2] == (3,12), "Requires CPython 3.12"'
export PYTHONPATH="$PWD/vendor"
exec python3 -S -B tools/serve_fixture_demo.py "$@"
""")
    (app / "start.sh").chmod(0o755)
    (app / "START.txt").write_text("""TasteTable experimental portable build
Linux x86_64 with CPython 3.12 and a modern browser.
Run ./start.sh --port 8017 then open http://127.0.0.1:8017.
Dependencies are bundled; no pip install, provider key or network needed to run.
The launcher explicitly uses fictional fixtures and a scripted model.
Stop with Ctrl+C. Files stay local unless you explicitly save them.
Prior-visit context is cleared on reload. Read docs/VISIT_HISTORY.md.
BUILD.json records the exact source. No live provider or medical claims.
""")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(output, "x:gz") as archive:
        archive.add(app, arcname="tastetable")
print(output)
