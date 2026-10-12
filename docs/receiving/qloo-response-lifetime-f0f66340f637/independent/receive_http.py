"""Independent, actual-localhost receiving of TasteTable response lifetime."""
from __future__ import annotations

import argparse
import datetime
import hashlib
import importlib.util
import json
import platform
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.dont_write_bytecode = True


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_source(path):
    spec = importlib.util.spec_from_file_location("independent_qloo_target", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def receive_case(module, status, reason):
    requests = []
    payload = {"results": [{"name": "Caf\u00e9 & tea", "rank": 0}], "success": True}
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if status == 200 else b"unread-error-body-sentinel-7e51"

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_GET(self):
            requests.append({"method": self.command, "path": self.path,
                             "headers": {k.lower(): v for k, v in self.headers.items()}})
            self.send_response(status, reason)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("X-Fixture-Private", "unread-header-sentinel-7e51")
            self.end_headers()
            self.wfile.write(body)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.02}, daemon=True)
    thread.start()
    actual_errors = []
    actual_responses = []
    read_calls = []
    constructor_snapshots = []
    calls = []
    real_urlopen = urllib.request.urlopen
    original_error_class = module.QlooError
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def snapshot():
        return [{"wrapper_closed": bool(error.closed), "underlying_closed": bool(fp.closed)}
                for error, fp in actual_errors]

    def observed_urlopen(request, *args, **kwargs):
        calls.append({"method": request.get_method(), "timeout": kwargs.get("timeout"),
                      "positional_arguments": len(args)})
        try:
            response = opener.open(request, *args, **kwargs)
            actual_responses.append(response)
            return response
        except urllib.error.HTTPError as error:
            fp = error.fp
            actual_errors.append((error, fp))
            original_read = error.read

            def observed_read(*read_args, **read_kwargs):
                read_calls.append({"args": list(read_args), "kwargs": read_kwargs})
                return original_read(*read_args, **read_kwargs)

            error.read = observed_read
            raise

    class ObservedQlooError(original_error_class):
        def __init__(self, *args, **kwargs):
            constructor_snapshots.append(snapshot())
            super().__init__(*args, **kwargs)

    checks = []

    def check(name, condition):
        checks.append({"name": name, "passed": bool(condition)})

    result = None
    translated = None
    unexpected = None
    try:
        urllib.request.urlopen = observed_urlopen
        module.QlooError = ObservedQlooError
        transport = module.http_transport(f"http://127.0.0.1:{server.server_port}", timeout=2.25)
        try:
            result = transport("/v2/insights", {
                "filter.type": "urn:entity:place", "filter.location.query": "Caf\u00e9 & tea",
                "take": 0, "fixture.false": False, "fixture.empty": "", "fixture.none": None,
            }, {"X-Api-Key": "synthetic-local-fixture", "Accept": "application/json"})
        except ObservedQlooError as error:
            translated = error
        except Exception as error:
            unexpected = {"type": type(error).__name__, "message": str(error)}

        check("no-unexpected-exception", unexpected is None)
        check("exactly-one-get-no-retry", len(requests) == len(calls) == 1 and requests[0]["method"] == calls[0]["method"] == "GET")
        check("explicit-timeout-preserved", len(calls) == 1 and calls[0]["timeout"] == 2.25 and calls[0]["positional_arguments"] == 0)
        if requests:
            parsed = urllib.parse.urlsplit(requests[0]["path"])
            query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
            check("path-query-and-filtering-preserved", parsed.path == "/v2/insights" and query == {
                "filter.type": ["urn:entity:place"], "filter.location.query": ["Caf\u00e9 & tea"],
                "take": ["0"], "fixture.false": ["False"],
            })
            check("supplied-headers-preserved", requests[0]["headers"].get("x-api-key") == "synthetic-local-fixture" and requests[0]["headers"].get("accept") == "application/json")
        if status == 200:
            check("successful-json-unchanged", result == payload and translated is None)
            check("success-response-closed", len(actual_responses) == 1 and actual_responses[0].closed)
            check("success-has-no-error-translation", actual_errors == [] and constructor_snapshots == [])
        else:
            closed = [{"wrapper_closed": True, "underlying_closed": True}]
            check("closed-before-qlooerror-construction", constructor_snapshots == [closed])
            check("closed-when-translation-escapes", snapshot() == closed)
            check("error-body-unread", read_calls == [])
            check("exact-status-reason-diagnostic", translated is not None and str(translated) == f"Qloo HTTP {status}: {reason}")
            check("status-and-retryable-preserved", translated is not None and translated.status == status and translated.retryable == (status == 429 or status >= 500))
            check("suppressed-cause-preserved", translated is not None and translated.__cause__ is None and translated.__suppress_context__ is True)
            check("body-and-header-not-in-diagnostic", translated is not None and "unread-error-body-sentinel" not in str(translated) and "unread-header-sentinel" not in str(translated))

        report = {
            "name": f"actual-http-{status}", "status": status, "passed": all(c["passed"] for c in checks),
            "checks": checks, "constructor_close_snapshots": constructor_snapshots,
            "close_state_before_fixture_cleanup": snapshot(), "error_body_read_calls": read_calls,
            "actual_opener_calls": calls, "actual_request_count": len(requests),
            "request_path": requests[0]["path"] if requests else None,
            "diagnostic": str(translated) if translated is not None else None,
            "translation_context": type(translated.__context__).__name__ if translated is not None else None,
            "success_response_closed": [bool(response.closed) for response in actual_responses],
            "unexpected_exception": unexpected,
        }
    finally:
        urllib.request.urlopen = real_urlopen
        module.QlooError = original_error_class
        for error, _fp in actual_errors:
            error.close()
        for response in actual_responses:
            response.close()
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
    report["fixture_thread_stopped"] = not thread.is_alive()
    report["passed"] = report["passed"] and report["fixture_thread_stopped"]
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    source = args.source.resolve()
    contract_path = Path(__file__).with_name("frozen-contract.json")
    contract = json.loads(contract_path.read_text())
    before = sha(source)
    if before not in contract["source_pins"].values():
        raise SystemExit("Source does not match either frozen pin")
    if args.output.exists():
        raise SystemExit("Receipt already exists; inspect instead of replacing")
    module = load_source(source)
    cases = [receive_case(module, status, reason) for status, reason in [
        (401, "Fixture Unauthorized"), (429, "Fixture Rate Limited"),
        (503, "Fixture Unavailable"), (200, "Fixture OK"),
    ]]
    report = {
        "schema": "hamon.independent-http-lifetime-receipt.v1",
        "actor": "chatgpt-f0f66340f637/runtime_integration",
        "completed_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "python": platform.python_version(), "platform": platform.platform(),
        "source": str(source), "source_sha256_before": before, "source_sha256_after": sha(source),
        "contract_sha256": sha(contract_path), "runner_sha256": sha(Path(__file__)),
        "source_unchanged": before == sha(source), "authored_tests_used": False,
        "provider_calls": 0, "network_scope": "actual HTTP to one ephemeral 127.0.0.1 fixture per case; environment proxy disabled",
        "cases": cases, "passed": sum(c["passed"] for c in cases), "total": len(cases),
    }
    report["accepted"] = report["passed"] == report["total"] and report["source_unchanged"]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"receipt": str(args.output), "passed": report["passed"], "total": report["total"],
                      "source_unchanged": report["source_unchanged"], "accepted": report["accepted"],
                      "failed_checks": {c["name"]: [x["name"] for x in c["checks"] if not x["passed"]] for c in cases if not c["passed"]}}))
    return 0 if report["accepted"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
