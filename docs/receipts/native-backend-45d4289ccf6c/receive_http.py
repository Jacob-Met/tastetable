"""Independent real-HTTP receiving of the existing TasteTable backend stack.

The model peer is a local protocol fixture running the repository's scripted
policy. Qloo responses are the repository's synthetic fixture. No provider or
real recommendation data participates in this test.
"""
from __future__ import annotations

import argparse
import hashlib
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import socket
import sys
import threading
import time
from unittest.mock import patch
import urllib.request


def digest(value):
    data = json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False,
                      separators=(",", ":")).encode()
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    source = args.source.resolve()
    for key in ("QLOO_API_KEY", "QLOO_BASE_URL", "TASTETABLE_LIVE",
                "TASTETABLE_LLM_BASE_URL", "TASTETABLE_LLM_MODEL", "TASTETABLE_LLM_API_KEY"):
        os.environ.pop(key, None)
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(source))
    import agent
    import app as web
    import uvicorn
    from personas import PERSONAS
    from qloo_client import FixtureTransport, QlooClient, QlooError

    active = {"failures": {}, "transport": None, "wire": [], "model_errors": []}
    configured_model = "receiving-configured-model-45d4289ccf6c"

    class OutageFixture(FixtureTransport):
        def __init__(self, failures):
            super().__init__()
            self.failures = dict(failures)
            self.insights = []

        def __call__(self, path, params, headers):
            if path == "/v2/insights":
                self.insights.append(dict(params))
                status = self.failures.get(len(self.insights))
                if status:
                    raise QlooError(status, "independent authored receiving outage")
            return super().__call__(path, params, headers)

    def make_client():
        fixture = OutageFixture(active["failures"])
        active["transport"] = fixture
        return QlooClient(api_key="synthetic-fixture-only", transport=fixture)

    class ModelPeer(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            active["wire"].append({"model": body.get("model"),
                                   "message_count": len(body.get("messages", [])),
                                   "path": self.path,
                                   "authorization_present": bool(self.headers.get("Authorization"))})
            status = 200
            try:
                if self.path != "/v1/chat/completions" or body.get("model") != configured_model:
                    raise ValueError("the configured model did not reach the real HTTP peer")
                result = agent.ScriptedModel().chat.completions.create(**body)
            except Exception as exc:
                status = 422
                result = {"error": f"{type(exc).__name__}: {exc}"}
                active["model_errors"].append(result["error"])
            encoded = json.dumps(result, allow_nan=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

    model_server = ThreadingHTTPServer(("127.0.0.1", 0), ModelPeer)
    model_thread = threading.Thread(target=model_server.serve_forever, daemon=True)
    model_thread.start()
    model_url = f"http://127.0.0.1:{model_server.server_port}/v1"
    original_urlopen = urllib.request.urlopen

    def loopback_only(request, *a, **kw):
        url = request.full_url if hasattr(request, "full_url") else request
        if url != model_url + "/chat/completions":
            raise AssertionError("request outside the owned loopback peer refused")
        return original_urlopen(request, *a, **kw)

    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen(128)
    port = listener.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(web.app, log_level="error", access_log=False))
    server_thread = threading.Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
    records = []
    healthy = {}
    try:
        with patch.object(web.QlooClient, "from_env", side_effect=make_client), \
             patch("urllib.request.urlopen", side_effect=loopback_only):
            server_thread.start()
            deadline = time.monotonic() + 5
            while not server.started and server_thread.is_alive() and time.monotonic() < deadline:
                time.sleep(0.01)
            if not server.started:
                raise RuntimeError("owned ASGI server did not start")

            cases = [("healthy-" + pid, pid, {}, "sample") for pid in PERSONAS]
            cases += [(name, "rosa", failures, route)
                      for route in ("sample", "form")
                      for name, failures in (("primary", {1: 429}), ("fallback", {2: 500}),
                                             ("outing", {3: 503}), ("all", {1: 429, 2: 500, 3: 503}),
                                             ("recovered", {}))]
            for mode in ("scripted", "http-model"):
                if mode == "http-model":
                    os.environ["TASTETABLE_LLM_BASE_URL"] = model_url
                    os.environ["TASTETABLE_LLM_MODEL"] = configured_model
                else:
                    os.environ.pop("TASTETABLE_LLM_BASE_URL", None)
                    os.environ.pop("TASTETABLE_LLM_MODEL", None)
                for name, pid, failures, route in cases:
                    active.update(failures=failures, transport=None, wire=[], model_errors=[])
                    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
                    payload = {k: v for k, v in PERSONAS[pid].items()
                               if k in {"cuisines", "music", "films", "constraints", "city"}}
                    path = f"/api/plan/sample/{pid}" if route == "sample" else "/api/plan"
                    connection.request("POST", path, body=json.dumps(payload),
                                       headers={"Content-Type": "application/json"})
                    response = connection.getresponse()
                    raw = response.read()
                    connection.close()
                    record = {"case": name, "persona": pid, "route": route, "mode": mode,
                              "status": response.status, "wire": list(active["wire"]),
                              "model_errors": list(active["model_errors"]), "violations": []}
                    records.append(record)
                    fail = record["violations"].append
                    if response.status != 200:
                        fail("expected a usable HTTP 200 plan")
                        record["response"] = raw.decode(errors="replace")
                        continue
                    result = json.loads(raw)
                    plan = result["plan"]
                    errors = [row for row in result["trace"]
                              if row["tool"] == "qloo_recs" and row["result_summary"].startswith("QlooError:")]
                    checked = {row["args"]["entity_ids"][i]
                               for row in result["trace"] if row["tool"] == "constraint_check"
                               for i in range(len(row["args"]["entity_ids"]))}
                    picks = plan["meals"] + ([plan["outing"]] if plan["outing"] else [])
                    if result["mock"] is not True:
                        fail("synthetic source label was lost")
                    if len(errors) != len(failures):
                        fail("structured outage evidence was lost or duplicated")
                    if not all(pick["entity_id"] in checked for pick in picks):
                        fail("an unchecked pick was returned")
                    if result["comparison"]["grounded"]["picks"] != len(picks):
                        fail("comparison disagrees with the actual plan")
                    if len(active["transport"].insights) > 3:
                        fail("recommendation request budget grew")
                    if mode == "http-model":
                        if len(active["wire"]) != 10:
                            fail("the complete ten-step HTTP tool loop did not finish")
                        if any(row["model"] != configured_model or row["authorization_present"]
                               for row in active["wire"]):
                            fail("configured model identity or empty test credentials changed")
                    elif active["wire"]:
                        fail("scripted default unexpectedly called the model peer")
                    if name.startswith("healthy-"):
                        if len(plan["meals"]) != 4 or not plan["outing"]:
                            fail("healthy plan lost a pick")
                        healthy[(mode, pid)] = result
                        if mode == "http-model" and result != healthy.get(("scripted", pid)):
                            fail("protocol model and in-process policy return different healthy plans")
                    elif name == "recovered":
                        if result != healthy.get((mode, pid)):
                            fail("an earlier failed request contaminated the recovered healthy plan")
                    elif name == "outing":
                        previous = healthy.get((mode, pid))
                        if previous and plan["meals"] != previous["plan"]["meals"]:
                            fail("checked meals changed after the outing outage")
                        if plan["outing"] is not None:
                            fail("the unavailable outing was fabricated")
                    elif name == "all":
                        if picks or not plan["notes"]:
                            fail("fully unavailable inputs did not retain an honest empty plan")
                    elif name == "fallback":
                        previous = healthy.get((mode, pid))
                        if previous:
                            primary = [p for p in previous["plan"]["meals"] if not p["fallback"]]
                            if plan["meals"] != primary or plan["outing"] != previous["plan"]["outing"]:
                                fail("fallback outage altered already checked primary or outing picks")
                    elif name == "primary" and (not plan["meals"] or not plan["outing"]):
                        fail("the existing independent fallback/outing work was lost")
                    record.update(meal_count=len(plan["meals"]), outing_present=bool(plan["outing"]),
                                  error_count=len(errors), insights_count=len(active["transport"].insights),
                                  response_sha256=digest(result), result=result)
    finally:
        server.should_exit = True
        if server_thread.is_alive():
            server_thread.join(5)
        model_server.shutdown()
        model_server.server_close()
        model_thread.join(5)
        listener.close()
    report = {"source": str(source), "agent_sha256": hashlib.sha256((source / "agent.py").read_bytes()).hexdigest(),
              "synthetic_qloo_and_model": True, "real_loopback_http": True,
              "cases": len(records), "passed": sum(not row["violations"] for row in records),
              "failed": sum(bool(row["violations"]) for row in records),
              "server_stopped": not server_thread.is_alive() and not model_thread.is_alive(),
              "records": records}
    args.out.write_text(json.dumps(report, indent=2, sort_keys=True, allow_nan=False) + "\n")
    print(json.dumps({k: report[k] for k in ("cases", "passed", "failed", "server_stopped")}))
    return 1 if report["failed"] or not report["server_stopped"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
