#!/usr/bin/env python3
"""Serve only the verified, immutable TasteTable visit-record installation."""
import argparse
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
from urllib.parse import urlsplit

INPUTS_SHA256 = "235d59bc7bc2538f8974804ed92198046a990c26e52924c42e37d260c5a75192"
ROOT = Path(__file__).resolve().parent.parent
MAX_FILE_BYTES = 2 * 1024 * 1024

def digest(data):
    return hashlib.sha256(data).hexdigest()

def git_blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()

def read_regular(path):
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or before.st_size > MAX_FILE_BYTES:
        raise ValueError("Expected a bounded regular file: " + str(path))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        opened = os.fstat(stream.fileno())
        if (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino):
            raise ValueError("File identity changed while opening: " + str(path))
        data = stream.read(MAX_FILE_BYTES + 1)
    after = path.lstat()
    if len(data) > MAX_FILE_BYTES or (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (
        after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns
    ):
        raise ValueError("File changed while reading: " + str(path))
    return data, after

def check_pin(data, pin, label):
    if len(data) != pin["bytes"] or digest(data) != pin["sha256"]:
        raise ValueError("Byte or SHA256 mismatch: " + label)
    if pin.get("git_blob") and git_blob(data) != pin["git_blob"]:
        raise ValueError("Git blob mismatch: " + label)

def runtime_identity(config):
    expected = config["runtime"]
    if sys.platform != "darwin" or ".".join(map(str, sys.version_info[:3])) != expected["version"]:
        raise ValueError("The specified existing macOS Python runtime is required")
    path = Path(sys.executable).resolve()
    if str(path) != expected["resolved_path"] or Path(expected["configured_path"]).resolve() != path:
        raise ValueError("Existing Python runtime path changed")
    check_pin(read_regular(path)[0], expected, "existing Python")

def capacity(config):
    disk = shutil.disk_usage(ROOT).free
    proc = subprocess.run(["/usr/bin/vm_stat"], capture_output=True, check=True, timeout=5)
    raw = proc.stdout.decode("ascii", "strict")
    page_size = int(re.search(r"page size of (\d+) bytes", raw).group(1))
    pages = sum(int(re.search(re.escape(key) + r":\s+(\d+)\.", raw).group(1))
                for key in ("Pages free", "Pages inactive", "Pages speculative"))
    memory = pages * page_size
    limits = config["limits"]
    if disk < limits["free_disk_floor"] or memory < limits["conservative_memory_floor"]:
        raise ValueError("Capacity floor not met: disk=" + str(disk) + ", memory=" + str(memory))
    return {"free_disk_bytes": disk, "conservative_memory_bytes": memory,
            "memory_basis": "vm_stat free + inactive + speculative pages", "vm_stat_exit": proc.returncode}

def verify_installation():
    for parent in [ROOT, *ROOT.parents]:
        info = parent.lstat()
        if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode):
            raise ValueError("Installation must use plain existing directories")
    input_data, _ = read_regular(ROOT / "source" / "INPUTS.json")
    if digest(input_data) != INPUTS_SHA256:
        raise ValueError("INPUTS.json differs from the maintained server pin")
    config = json.loads(input_data)
    if str(ROOT) != config["target"]:
        raise ValueError("Server must run from the reserved installed target")
    runtime_identity(config)
    marker_data, marker_stat = read_regular(ROOT / "INSTALLATION.json")
    if stat.S_IMODE(marker_stat.st_mode) != 0o444:
        raise ValueError("Completion marker is not in its installed read-only mode")
    marker = json.loads(marker_data)
    if (marker["format"] != "tastetable.visit-record-local-installation.v1"
            or marker["target"] != config["target"]
            or marker["qualified_parent"] != config["qualified_parent"]
            or marker["qualified_tree"] != config["qualified_tree"]
            or marker["origin"] != config["origin"] or marker["entry"] != config["entry"]
            or marker["source_capsule"] != config["original_capsule"]):
        raise ValueError("Installation completion marker provenance mismatch")
    original_names = {p["path"] for p in config["original_files"]}
    asset_names = {p for p in original_names if not p.startswith("reference/")}
    expected_paths = (
        {"app/" + name for name in asset_names}
        | {"source/" + name for name in config["source_files"]}
        | {"original/" + name for name in original_names}
        | {"app/index.html", "original/ORIGINAL-CAPSULE.json", config["entry"]}
    )
    declared = {}
    for item in marker["files"]:
        name = item["path"]
        if name in declared or name not in expected_paths:
            raise ValueError("Unknown or duplicate installed path")
        declared[name] = item
    if set(declared) != expected_paths:
        raise ValueError("Installation completion marker is incomplete")
    actual_paths = set()
    for directory, folders, files in os.walk(ROOT, followlinks=False):
        for name in folders:
            path = Path(directory) / name
            if path.is_symlink():
                raise ValueError("Unexpected linked installation directory")
        for name in files:
            actual_paths.add((Path(directory) / name).relative_to(ROOT).as_posix())
    if actual_paths != expected_paths | {"INSTALLATION.json"}:
        raise ValueError("Installation file set differs from the completion marker")
    contents = {}
    for name in sorted(expected_paths):
        data, info = read_regular(ROOT / name)
        pin = declared[name]
        check_pin(data, pin, name)
        mode = 0o700 if name == config["entry"] else 0o444
        if stat.S_IMODE(info.st_mode) != mode or pin["mode"] != format(mode, "04o"):
            raise ValueError("Installed mode changed: " + name)
        if str(info.st_mtime_ns) != pin["mtime_ns"]:
            raise ValueError("Installed modification time changed: " + name)
        contents[name] = data
    if sum(map(len, contents.values())) + len(marker_data) > config["limits"]["installed_payload_cap"]:
        raise ValueError("Installed payload exceeds its admitted cap")
    check_pin(contents["original/ORIGINAL-CAPSULE.json"], config["original_capsule"], "recovery capsule")
    for pin in config["original_files"]:
        check_pin(contents["original/" + pin["path"]], pin, "original/" + pin["path"])
        if pin["path"] in asset_names and pin["path"] != config["navigation"]["original_path"]:
            if contents["app/" + pin["path"]] != contents["original/" + pin["path"]]:
                raise ValueError("An unchanged app asset differs from its original")
    nav = config["navigation"]
    original = contents["original/" + nav["original_path"]]
    installed = contents["app/" + nav["original_path"]]
    old, new = nav["original_span"].encode("utf-8"), nav["installed_span"].encode("utf-8")
    if original.count(old) != 1 or installed.count(new) != 1 or original.replace(old, new, 1) != installed:
        raise ValueError("Installed navigation is not the exact one-anchor change")
    if installed.replace(new, old, 1) != original:
        raise ValueError("Installed navigation inverse differs from the complete original")
    check_pin(installed, {"bytes": nav["installed_bytes"], "sha256": nav["installed_sha256"]},
              "installed navigation")
    if contents["app/index.html"] != contents["source/index.html"]:
        raise ValueError("Local home differs from its maintained source")
    return config, marker_data, contents

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-open", action="store_true", help="Serve the same fixed local home without opening a browser")
    args = parser.parse_args()
    try:
        config, marker_data, contents = verify_installation()
        admission = capacity(config)
    except Exception as error:
        print(json.dumps({"status": "refused", "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1
    routes = {"/": (contents["app/index.html"], "text/html; charset=utf-8"),
              "/index.html": (contents["app/index.html"], "text/html; charset=utf-8"),
              "/LICENSE": (contents["app/LICENSE"], "text/plain; charset=utf-8")}
    for pin in config["original_files"]:
        name = pin["path"]
        if name.startswith("static/"):
            mime = ("text/html; charset=utf-8" if name.endswith(".html") else
                    "text/css; charset=utf-8" if name.endswith(".css") else
                    "text/javascript; charset=utf-8")
            routes["/" + name] = (contents["app/" + name], mime)
    expected_host = config["host"] + ":" + str(config["port"])

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.0"
        timeout = 2  # Bound an idle local connection during controlled shutdown.

        def log_message(self, format_string, *values):
            # Ordinary request logs belong to the caller's stdout/stderr, never to installed files.
            print(json.dumps({"request": format_string % values}, ensure_ascii=False), flush=True)

        def respond(self, body, content_type, status=200):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            if status != 204:
                self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Connection", "close")
            self.end_headers()
            if self.command != "HEAD" and body:
                try:
                    self.wfile.write(body)
                except (BrokenPipeError, ConnectionResetError):
                    pass

        def do_GET(self):
            if self.headers.get("Host") != expected_host:
                self.respond(b"Unexpected local host\n", "text/plain; charset=utf-8", 400)
                return
            parsed = urlsplit(self.path)
            if parsed.scheme or parsed.netloc:
                self.respond(b"Local paths only\n", "text/plain; charset=utf-8", 400)
                return
            if parsed.path == "/favicon.ico":
                self.respond(b"", "image/x-icon", 204)
                return
            selected = routes.get(parsed.path)
            if selected is None:
                self.respond(b"Not found\n", "text/plain; charset=utf-8", 404)
                return
            self.respond(*selected)

        do_HEAD = do_GET

    class LocalServer(HTTPServer):
        allow_reuse_address = True

    try:
        server = LocalServer((config["host"], config["port"]), Handler)
    except OSError as error:
        print(json.dumps({"status": "refused", "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1
    stopping = {"signal": None}
    def stop(signum, _frame):
        stopping["signal"] = signal.Signals(signum).name
    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    server.timeout = 0.25
    ready = {"status": "serving", "pid": os.getpid(), "origin": config["origin"],
             "entry": str(ROOT / config["entry"]), "no_open": args.no_open,
             "marker_sha256": digest(marker_data), "verified_files": len(contents) + 1,
             "admission": admission}
    print(json.dumps(ready, ensure_ascii=False), flush=True)
    if not args.no_open:
        try:
            opened = subprocess.run(["/usr/bin/open", config["origin"]], capture_output=True, timeout=10)
            print(json.dumps({"opener_exit": opened.returncode,
                              "opener_stderr": opened.stderr.decode("utf-8", "replace")}), flush=True)
        except (OSError, subprocess.TimeoutExpired) as error:
            print(json.dumps({"opener_error": str(error), "manual_url": config["origin"]}), flush=True)
    try:
        while stopping["signal"] is None:
            server.handle_request()
    finally:
        server.server_close()
        print(json.dumps({"status": "closed", "pid": os.getpid(), "signal": stopping["signal"]}), flush=True)
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
