"""One local server course with three declared cases; no browser or JS execution."""
from pathlib import Path
import base64
import datetime
import hashlib
import http.client
import json
import os
import socket
import subprocess
import sys
import time
import traceback
import zipfile

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "component-fixture"
SERVER = ROOT / "serve_component.py"
OUTPUT = ROOT / "server-qualification-v1"
PYTHON = Path(os.environ["CODEX_PRIMARY_RUNTIME_PYTHON"])
SERVER_PIN = {"bytes": 10474, "sha256": "bd1b6a8a834144531337be32eb8ea14d7d8c729db6b70390d3bae70d157829c5"}
MANIFEST_PIN = {"bytes": 2298, "sha256": "13d4ce90a5a4dc13bd1ca441afb18baae15e19a5436fa49f8fbfbba464d2d06a"}
DESIGN_PIN = {"bytes": 1758, "sha256": "c3cf9f3e322b7e8eeaa5f75b0e00f6035372210bb55369c881fb9abab5fadbfa"}

def pin(path):
    raw = path.read_bytes()
    return {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}

def write(path, value):
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, indent=2, ensure_ascii=True)
        stream.write("\n")

def require(value, label):
    if not value:
        raise AssertionError(label)

def main():
    require(pin(SERVER) == SERVER_PIN, "server source")
    require(pin(ASSETS / "component-freeze.json") == MANIFEST_PIN, "component freeze")
    require(pin(ROOT / "server-qualification-design.json") == DESIGN_PIN, "literal design")
    manifest = json.loads((ASSETS / "component-freeze.json").read_bytes())
    design = json.loads((ROOT / "server-qualification-design.json").read_bytes())
    subjects = [SERVER, ASSETS / "component-freeze.json",
                ROOT / "server-qualification-design.json", Path(__file__).resolve()]
    subjects += [ASSETS / name for name in manifest["files"]]
    before = {str(p): pin(p) for p in subjects}
    for name, wanted in manifest["files"].items():
        require(pin(ASSETS / name) == wanted, "frozen asset " + name)
    OUTPUT.mkdir()
    intent = {"schema": "tastetable143.local-server-course-intent/1",
              "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "runtime": {"path": str(PYTHON), **pin(PYTHON)},
              "subjects": before, "cases": design["cases"],
              "scope": "Actual owned local HTTP server only; no browser, native Windows, IndexedDB or JavaScript execution."}
    write(OUTPUT / "intent.json", intent)
    actual = []
    course_failure = None
    for index, case in enumerate(design["cases"]):
        case_dir = OUTPUT / ("%02d-" % (index + 1) + case["name"])
        case_dir.mkdir()
        native_dir = case_dir / "server"
        token = "taste143-local-server-" + str(index + 1)
        argv = [str(PYTHON), "-B", "-s", str(SERVER), "--root", str(ASSETS),
                "--manifest-sha256", MANIFEST_PIN["sha256"],
                "--run-dir", str(native_dir), "--token", token]
        row = {"name": case["name"], "argv": argv, "outcome": "FAIL"}
        write(case_dir / "intent.json", row)
        proc = None
        stdout = stderr = b""
        started = time.monotonic()
        forced = False
        try:
            proc = subprocess.Popen(argv, cwd=ROOT, stdin=subprocess.DEVNULL,
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            row["pid"] = proc.pid
            write(case_dir / "started.json", {"pid": proc.pid})
            ready = None
            deadline = started + 10
            while time.monotonic() < min(deadline, started + 4):
                if proc.poll() is not None:
                    raise RuntimeError("Server exited before ready")
                try:
                    ready = json.loads((native_dir / "ready.json").read_bytes())
                    break
                except (FileNotFoundError, json.JSONDecodeError):
                    time.sleep(0.01)
            require(ready is not None, "server readiness deadline")
            require(ready["pid"] == proc.pid and ready["token"] == token, "exact owned ready identity")
            require(ready["manifest_sha256"] == MANIFEST_PIN["sha256"], "ready manifest")
            url = ready["url"]
            require(url.startswith("http://127.0.0.1:") and url.endswith("/"), "loopback URL")
            port = int(url.split(":")[2][:-1])
            expected_routes = {"/" + name: name for name in manifest["files"]}
            expected_routes["/"] = "index.html"
            require(ready["routes"] == sorted(expected_routes), "closed route map")
            row["ready"] = ready
            if index == 0:
                observed = []
                for route, name in sorted(expected_routes.items()):
                    require(time.monotonic() < deadline, "overall case deadline")
                    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
                    try:
                        connection.request("GET", route)
                        response = connection.getresponse()
                        expected = (ASSETS / name).read_bytes()
                        body = response.read(len(expected) + 1)
                        require(response.status == 200 and body == expected, "exact response " + route)
                        require(response.getheader("Content-Length") == str(len(expected)), "response length")
                        require(response.getheader("Cache-Control") == "no-store", "response no-store")
                        observed.append({"route": route, "status": response.status,
                                         "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()})
                    finally:
                        connection.close()
                row["responses"] = observed
                write(native_dir / "stop.json",
                      {"schema": "tastetable143.component-stop/1", "token": token})
            else:
                route = "/index.html?unapproved=1" if index == 1 else "/"
                request = ("GET " + route + " HTTP/1.1\r\nHost: 127.0.0.1:" + str(port) + "\r\n")
                if index == 1:
                    request += "\r\n"
                with socket.create_connection(("127.0.0.1", port), timeout=3) as client:
                    client.settimeout(3)
                    client.sendall(request.encode("ascii"))
                    body = client.recv(1024)
                    require(body == b"", "refused/expired request supplied no response bytes")
                row["refusal_request"] = request
                row["refusal_response_bytes"] = len(body)
            remaining = deadline - time.monotonic()
            require(remaining > 0, "remaining terminal deadline")
            stdout, stderr = proc.communicate(timeout=remaining)
            result = json.loads((native_dir / "result.json").read_bytes())
            row["server_result"] = result
            require(result["pid"] == proc.pid and result["token"] == token, "result owned identity")
            require(result["before"] == result["after"] == manifest["files"], "all original asset pins")
            require(stderr == b"", "no unexpected stderr")
            if index == 0:
                require(proc.returncode == 0 and result["outcome"] == "PASS"
                        and result["stop_seen"] is True and result["errors"] == [], "normal served stop")
                require(len(result["requests"]) == 13 and all(r["status"] == 200 for r in result["requests"]),
                        "all thirteen exact requests recorded")
            else:
                require(proc.returncode == 1 and result["outcome"] == "FAIL"
                        and result["stop_seen"] is False, "intended refusal terminal")
                if index == 1:
                    require(any(isinstance(e, dict) and e.get("message") == "Unexpected host or route"
                                for e in result["errors"]), "route refusal retained")
                else:
                    require(any(isinstance(e, dict) and e.get("phase") == "http-handler"
                                and "timed out" in e.get("message", "").lower()
                                for e in result["errors"]), "partial-header timeout retained")
            row["outcome"] = "PASS"
        except BaseException:
            row["failure"] = traceback.format_exc()
            course_failure = row["failure"]
        finally:
            if proc is not None:
                if proc.poll() is None:
                    forced = True
                    proc.kill()
                tail_out, tail_err = proc.communicate(timeout=2)
                if not stdout:
                    stdout = tail_out
                if not stderr:
                    stderr = tail_err
            (case_dir / "stdout.bin").write_bytes(stdout)
            (case_dir / "stderr.bin").write_bytes(stderr)
            row.update({"returncode": None if proc is None else proc.returncode,
                        "forced_cleanup": forced, "elapsed_seconds": time.monotonic() - started,
                        "stdout": pin(case_dir / "stdout.bin"), "stderr": pin(case_dir / "stderr.bin")})
            if forced:
                row["outcome"] = "FAIL"
                course_failure = course_failure or "Forced cleanup was required"
            write(case_dir / "result.json", row)
            actual.append(row)
        if course_failure:
            break
    after = {str(p): pin(p) for p in subjects}
    result = {"schema": "tastetable143.local-server-course-result/1",
              "outcome": "PASS" if not course_failure and before == after and len(actual) == 3 else "FAIL",
              "cases": actual, "before": before, "after": after,
              "all_subjects_unchanged": before == after, "failure": course_failure,
              "scope": intent["scope"]}
    write(OUTPUT / "result.json", result)
    archive = ROOT / "server-qualification-v1-complete.zip"
    with zipfile.ZipFile(archive, "x", compression=zipfile.ZIP_DEFLATED) as z:
        for p in sorted(OUTPUT.rglob("*")):
            if p.is_file():
                z.write(p, "course/" + p.relative_to(OUTPUT).as_posix())
        for p in subjects:
            z.write(p, "source/" + p.relative_to(ROOT).as_posix())
    print(json.dumps({"outcome": result["outcome"], "case_outcomes": [
        {"name": row["name"], "outcome": row["outcome"], "returncode": row["returncode"],
         "forced_cleanup": row["forced_cleanup"], "elapsed_seconds": row["elapsed_seconds"]}
        for row in actual], "result": pin(OUTPUT / "result.json"),
        "checkpoint": {"path": str(archive), **pin(archive),
                       "base64": base64.b64encode(archive.read_bytes()).decode("ascii")}}))
    return 0 if result["outcome"] == "PASS" else 1

if __name__ == "__main__":
    raise SystemExit(main())

