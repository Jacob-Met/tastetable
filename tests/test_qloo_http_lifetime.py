"""Receive Qloo HTTP response ownership with authored loopback responses."""
import json
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
import threading
import unittest
import urllib.error
import urllib.parse

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from qloo_client import QlooClient, QlooError


@contextmanager
def responses(statuses):
    requests = []
    retained_errors = []
    release = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *_):
            pass

        def do_GET(self):
            parsed = urllib.parse.urlsplit(self.path)
            requests.append({"method": self.command, "path": parsed.path,
                             "query": urllib.parse.parse_qs(parsed.query),
                             "key": self.headers.get("X-Api-Key"),
                             "accept": self.headers.get("Accept")})
            index = len(requests) - 1
            status = statuses[index] if index < len(statuses) else 500
            payload = ({"results": [{"entity_id": "FIX-received", "name": "Authored result",
                                     "types": ["urn:entity:artist"], "query": {"affinity": 0.5}}]}
                       if status == 200 else {"error": "authored error body"})
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status, "Authored provider refusal" if status != 200 else "OK")
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            try:
                self.wfile.write(body)
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            if status != 200:
                release.wait(2)

    class Server(ThreadingHTTPServer):
        daemon_threads = True

        def handle_error(self, *_):
            pass  # A closed unread authored response can reset its owned socket.

    server = Server(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever,
                              kwargs={"poll_interval": 0.02}, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}", requests, retained_errors
    finally:
        for error in retained_errors:
            error.close()
        release.set()
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
        if thread.is_alive():
            raise RuntimeError("Owned fixture HTTP server did not stop")


class QlooHttpResponseLifetimeTests(unittest.TestCase):
    def assert_error_closed(self, status, retryable):
        with responses([status]) as (url, requests, errors):
            client = QlooClient(api_key="local-fixture-not-a-provider-key", base_url=url)
            with self.assertRaises(QlooError) as caught:
                client.search("A/B & Café", types="urn:entity:artist", take=3)
            translated = caught.exception
            original = translated.__context__
            self.assertIsInstance(original, urllib.error.HTTPError)
            errors.append(original)
            self.assertEqual(str(translated), f"Qloo HTTP {status}: Authored provider refusal")
            self.assertEqual(translated.status, status)
            self.assertEqual(translated.retryable, retryable)
            self.assertIsNone(translated.__cause__)
            self.assertTrue(translated.__suppress_context__)
            self.assertEqual(requests, [{"method": "GET", "path": "/search",
                "query": {"query": ["A/B & Café"], "take": ["3"], "types": ["urn:entity:artist"]},
                "key": "local-fixture-not-a-provider-key", "accept": "application/json"}])
            self.assertTrue(original.closed, "HTTPError response is still open after QlooError translation")
            self.assertTrue(original.fp.closed, "Underlying HTTP response is still open")

    def test_unauthorized_response_closes_before_error_translation_returns(self):
        self.assert_error_closed(401, False)

    def test_throttled_response_closes_and_keeps_retryable_classification(self):
        self.assert_error_closed(429, True)

    def test_server_error_response_closes_and_keeps_retryable_classification(self):
        self.assert_error_closed(503, True)

    def test_refused_search_is_not_cached_and_later_success_is_cached(self):
        with responses([503, 200]) as (url, requests, errors):
            client = QlooClient(api_key="local-fixture-not-a-provider-key", base_url=url)
            with self.assertRaises(QlooError) as caught:
                client.search("fixture")
            errors.append(caught.exception.__context__)
            self.assertEqual(len(requests), 1, "The client must not automatically retry a refusal")
            first = client.search("fixture")
            second = client.search("fixture")
            self.assertEqual([entity.to_dict() for entity in first], [{
                "entity_id": "FIX-received", "name": "Authored result",
                "types": ["urn:entity:artist"], "affinity": 0.5, "popularity": None,
                "tags": [], "properties": {},
            }])
            self.assertEqual([entity.to_dict() for entity in first],
                             [entity.to_dict() for entity in second])
            self.assertEqual(len(requests), 2)
            self.assertEqual(requests[0], requests[1])


if __name__ == "__main__":
    unittest.main()
