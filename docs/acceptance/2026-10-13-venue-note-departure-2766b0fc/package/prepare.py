#!/usr/bin/env python3
"""Create a new receiving workspace from exact original files and candidate overlay."""
import json
from pathlib import Path
import shutil
import sys
from verify import ROOT, verify

def prepare(destination):
    verify()
    destination = Path(destination).resolve()
    if destination.exists():
        raise ValueError("Choose a new, nonexistent receiving directory")
    destination.mkdir()
    try:
        shutil.copytree(ROOT / "source/base", destination / "original")
        shutil.copytree(ROOT / "source/base", destination / "candidate")
        for f in (ROOT / "source/candidate").rglob("*"):
            if f.is_file():
                target = destination / "candidate" / f.relative_to(ROOT / "source/candidate")
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(f, target)
        for name in ["receive-departure.cjs", "run-native.cjs"]:
            shutil.copyfile(ROOT / "evidence/native" / name, destination / name)
        shutil.copyfile(ROOT / "source-packet.json", destination / "source-packet.json")
    except Exception:
        # Leave any partial work visible for diagnosis; never remove a caller's path.
        raise
    return destination

if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: python -B prepare.py NEW_RECEIVING_DIRECTORY")
        p = prepare(sys.argv[1])
        print(json.dumps({
            "status": "prepared", "directory": str(p), "model_working_directory": str(p / "candidate"),
            "model_command": "node --test tests/venue_followup.test.mjs tests/venue_note_departure.test.mjs",
            "browser_note": "Frozen driver retains MSI installed Playwright/Chrome paths. See OPEN.txt before a distinct browser run.",
            "execution": "No model or browser run performed by preparation"
        }, indent=2))
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print("Preparation failed: " + str(exc), file=sys.stderr)
        sys.exit(1)
