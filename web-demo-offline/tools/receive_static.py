#!/usr/bin/env python3
"""Receive a new standalone TasteTable directory, exercise rollback, and read its HTTP bytes."""
from __future__ import annotations

import argparse
import datetime
import functools
import hashlib
import http.server
import json
import threading
import urllib.error
import urllib.request
from pathlib import Path

RUNTIME = ("index.html", "app.mjs", "catalogue.mjs", "week_plan.mjs", "style.css",
           "offline.css", "source-pin.json", "README.md", "LICENSE",
           "week_file.mjs", "saved_week.mjs", "week-file-source.json", "arrangement_history.mjs",
           "calendar.js", "offline_calendar.mjs", "calendar-source.json")


def receive(source: Path, target: Path, output: Path) -> dict:
    source, target, output = source.resolve(), target.resolve(), output.resolve()
    previous = target.with_name(target.name + ".rolled-back")
    if any(path.exists() for path in (target, previous, output)):
        raise FileExistsError("Target, rollback and receipt directories must all be new.")
    paths = [source / name for name in RUNTIME]
    paths.extend(sorted((source / "data").rglob("*.json")))
    if any(path.is_symlink() or not path.is_file() for path in paths):
        raise ValueError("The static artifact must contain regular files.")
    content = {path.relative_to(source).as_posix(): path.read_bytes() for path in paths}
    if len(content) != 42:
        raise ValueError("Expected 16 runtime files and 26 native data files.")
    expected = {name: hashlib.sha256(data).hexdigest() for name, data in content.items()}
    output.mkdir(parents=True)
    record = {"schema": "tastetable.static-receiving.v1", "source": str(source),
              "target": str(target), "rollback": str(previous), "files": expected,
              "started_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "http": [], "complete": False}

    def write_target():
        target.mkdir(parents=True)
        for name, data in content.items():
            destination = target / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *_):
            pass

    write_target()
    handler = functools.partial(Quiet, directory=str(target))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    serving = threading.Thread(target=server.serve_forever, daemon=True)
    serving.start()
    origin = f"http://127.0.0.1:{server.server_port}"
    try:
        for phase in ("installed", "restored"):
            if phase == "restored":
                target.rename(previous)
                try:
                    with urllib.request.urlopen(origin + "/index.html", timeout=5):
                        raise AssertionError("Rolled-back target remained available.")
                except urllib.error.HTTPError as error:
                    if error.code != 404:
                        raise
                    record["rollback_http_status"] = error.code
                if target.exists():
                    raise AssertionError("The owned target remains after rollback.")
                write_target()
            for name, sha in expected.items():
                with urllib.request.urlopen(origin + "/" + name, timeout=5) as response:
                    data = response.read()
                    if response.status != 200 or hashlib.sha256(data).hexdigest() != sha:
                        raise AssertionError(f"HTTP content mismatch: {name}")
                record["http"].append({"phase": phase, "path": name, "status": 200, "sha256": sha})
        record["complete"] = True
    except BaseException as error:
        record["error"] = repr(error)
        raise
    finally:
        server.shutdown()
        server.server_close()
        serving.join(timeout=5)
        record["finished_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        (output / "receipt.json").write_text(json.dumps(record, indent=2) + "\n")
    return record


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("target", type=Path)
    parser.add_argument("receipt", type=Path)
    args = parser.parse_args()
    result = receive(args.source, args.target, args.receipt)
    print(json.dumps({"complete": result["complete"], "files": len(result["files"]),
                      "http_readbacks": len(result["http"]),
                      "rollback_http_status": result["rollback_http_status"],
                      "target": result["target"]}))
