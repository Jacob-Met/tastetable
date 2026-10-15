"""Serve the fixed TasteTable component fixture on one owned loopback socket."""
from pathlib import Path, PurePosixPath
from http.server import HTTPServer, BaseHTTPRequestHandler
import argparse
import datetime
import hashlib
import json
import os
import stat
import time

def pin(raw):
    return {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}

def write_new(path, value):
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, indent=2, ensure_ascii=True)
        stream.write("\n")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--manifest-sha256", required=True)
    parser.add_argument("--run-dir", type=Path, required=True)
    parser.add_argument("--token", required=True)
    args = parser.parse_args()
    if (len(args.manifest_sha256) != 64 or any(c not in "0123456789abcdef" for c in args.manifest_sha256)
            or not 1 <= len(args.token) <= 80 or not all(c.isalnum() or c in "-_" for c in args.token)):
        parser.error("Expected exact SHA-256 and bounded alphanumeric run token.")
    root = args.root.absolute()
    if root.is_symlink() or not root.is_dir():
        parser.error("Fixture root must be a real directory.")
    manifest_raw = (root / "component-freeze.json").read_bytes()
    if hashlib.sha256(manifest_raw).hexdigest() != args.manifest_sha256:
        raise ValueError("Fixture manifest digest mismatch")
    manifest = json.loads(manifest_raw)
    if manifest["schema"] != "tastetable143.native-component-host-freeze/1":
        raise ValueError("Wrong component manifest")
    files = manifest["files"]
    if not isinstance(files, dict) or not 1 <= len(files) <= 32:
        raise ValueError("Fixture membership bound")

    def read_member(name):
        pure = PurePosixPath(name)
        if pure.is_absolute() or "\\" in name or not name or any(x in ("", ".", "..") for x in name.split("/")):
            raise ValueError("Non-relative fixture member")
        path = root
        for component in pure.parts:
            path = path / component
            if path.is_symlink():
                raise ValueError("Symlink fixture member")
        if not stat.S_ISREG(path.stat().st_mode):
            raise ValueError("Nonregular fixture member")
        expected = files[name]
        if (type(expected["bytes"]) is not int or not 0 <= expected["bytes"] <= 2 * 1024 * 1024
                or path.stat().st_size != expected["bytes"]):
            raise ValueError("Fixture size mismatch")
        raw = path.read_bytes()
        if pin(raw) != expected:
            raise ValueError("Fixture byte mismatch: " + name)
        return raw

    before = {name: pin(read_member(name)) for name in files}
    if sum(row["bytes"] for row in before.values()) > 4 * 1024 * 1024:
        raise ValueError("Fixture payload bound")
    run = args.run_dir.absolute()
    run.mkdir()
    started = time.monotonic()
    requests = []
    errors = []
    response_bytes = 0
    stop_seen = False
    allowed_types = {
        ".html": "text/html; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
    }
    for name in files:
        if Path(name).suffix not in allowed_types:
            raise ValueError("Unsupported fixture MIME type")
    route_map = {"/" + name: name for name in files}
    route_map["/"] = "index.html"

    class Server(HTTPServer):
        allow_reuse_address = False
        def verify_request(self, request, address):
            request.settimeout(2)
            return address[0] == "127.0.0.1"

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.0"
        server_version = "TasteTableComponentFixture/1"
        sys_version = ""
        def log_message(self, *_args):
            pass

        def send_error(self, code, message=None, explain=None):
            row = {"method": getattr(self, "command", None),
                   "path": getattr(self, "path", None), "http_error": code}
            if len(requests) < 128:
                requests.append(row)
            errors.append(row)
            return super().send_error(code, message, explain)

        def do_GET(self):
            nonlocal response_bytes
            row = {"method": "GET", "path": self.path, "host": self.headers.get("Host"),
                   "elapsed_seconds": time.monotonic() - started}
            if len(requests) >= 128:
                errors.append("Request-count bound")
                self.close_connection = True
                return
            requests.append(row)
            try:
                expected_host = "127.0.0.1:" + str(self.server.server_port)
                if self.headers.get("Host") != expected_host or self.path not in route_map:
                    raise ValueError("Unexpected host or route")
                if time.monotonic() - started >= 180:
                    raise TimeoutError("Fixture course deadline")
                name = route_map[self.path]
                body = read_member(name)
                if response_bytes + len(body) > 32 * 1024 * 1024:
                    raise ValueError("Total response-byte bound")
                self.send_response(200)
                self.send_header("Content-Type", allowed_types[Path(name).suffix])
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.send_header("Content-Security-Policy",
                                 "default-src 'self'; img-src data:; object-src 'none'; "
                                 "base-uri 'none'; frame-src 'none'; form-action 'none'")
                self.end_headers()
                self.wfile.write(body)
                response_bytes += len(body)
                row.update({"status": 200, "file": name, **pin(body)})
            except Exception as exc:
                row["error"] = {"type": type(exc).__name__, "message": str(exc)}
                errors.append(row["error"])
                self.close_connection = True

        def reject_method(self):
            if len(requests) < 128:
                requests.append({"method": self.command, "path": self.path,
                                 "elapsed_seconds": time.monotonic() - started})
            errors.append("Unexpected method: " + self.command)
            self.close_connection = True

        do_POST = do_PUT = do_DELETE = do_HEAD = do_OPTIONS = do_PATCH = reject_method

    server = None
    intent = {
        "schema": "tastetable143.component-server-intent/1",
        "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "pid": os.getpid(), "root": str(root), "token": args.token,
        "manifest": pin(manifest_raw), "before": before,
        "bind": "127.0.0.1:0", "course_seconds": 180,
        "request_socket_timeout_seconds": 2, "request_limit": 128,
        "scope": "Fixed fictional component assets only; no directory listing, provider, full app or existing storage."
    }
    write_new(run / "intent.json", intent)
    try:
        server = Server(("127.0.0.1", 0), Handler)
        server.timeout = 0.2
        ready = {"schema": "tastetable143.component-server-ready/1",
                 "pid": os.getpid(), "token": args.token,
                 "url": "http://127.0.0.1:" + str(server.server_port) + "/",
                 "routes": sorted(route_map), "manifest_sha256": args.manifest_sha256}
        write_new(run / "ready.json", ready)
        print(json.dumps(ready), flush=True)
        while time.monotonic() - started < 180:
            marker = run / "stop.json"
            if marker.exists():
                if marker.is_symlink() or not marker.is_file() or marker.stat().st_size > 256:
                    raise ValueError("Invalid stop marker")
                stop = json.loads(marker.read_bytes())
                if stop != {"schema": "tastetable143.component-stop/1", "token": args.token}:
                    raise ValueError("Wrong stop marker")
                stop_seen = True
                break
            if errors:
                break
            server.handle_request()
        if not stop_seen:
            errors.append("No exact parent stop marker before shutdown")
    except BaseException as exc:
        errors.append({"type": type(exc).__name__, "message": str(exc)})
    finally:
        if server is not None:
            server.server_close()
        after = {}
        for name in files:
            try:
                after[name] = pin(read_member(name))
            except Exception as exc:
                errors.append({"file": name, "type": type(exc).__name__, "message": str(exc)})
        if before != after:
            errors.append("Fixture source changed during serving")
        try:
            if hashlib.sha256((root / "component-freeze.json").read_bytes()).hexdigest() != args.manifest_sha256:
                errors.append("Fixture manifest changed during serving")
        except Exception as exc:
            errors.append({"file": "component-freeze.json", "type": type(exc).__name__, "message": str(exc)})
        result = {"schema": "tastetable143.component-server-result/1",
                  "outcome": "PASS" if not errors and stop_seen else "FAIL",
                  "pid": os.getpid(), "token": args.token,
                  "elapsed_seconds": time.monotonic() - started,
                  "stop_seen": stop_seen, "requests": requests,
                  "response_bytes": response_bytes, "errors": errors,
                  "before": before, "after": after,
                  "scope": "Server integrity/lifetime only. A successful server does not establish product or visual acceptance."}
        write_new(run / "result.json", result)
        print(json.dumps(result), flush=True)
    return 0 if result["outcome"] == "PASS" else 1

if __name__ == "__main__":
    raise SystemExit(main())

