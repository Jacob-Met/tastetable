"""Serve the exact candidate, varying only an offline Qloo transport factory."""
from __future__ import annotations

import hashlib
import itertools
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import urllib.request

SOURCE = Path(sys.argv[1]).resolve()
OUTPUT = Path(sys.argv[2]).resolve()
OUTPUT.mkdir(parents=True, exist_ok=True)
os.environ.clear()
sys.path.insert(0, str(SOURCE))


def append_event(event):
    with (OUTPUT / "transport.jsonl").open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(event, sort_keys=True) + "\n")


def no_network(*args, **kwargs):
    append_event({"event": "forbidden_outbound_attempt"})
    raise AssertionError("Receiving forbids outbound provider network access")


urllib.request.urlopen = no_network

import app as web
import agent
from qloo_client import FixtureTransport, QlooClient, QlooError
import uvicorn

sequence = itertools.count(1)


class AuthoredTransport(FixtureTransport):
    def __init__(self, mode):
        super().__init__()
        self.mode = mode
        self.fixture_id = next(sequence)
        self.insights_count = 0
        append_event({"event": "factory", "fixture_id": self.fixture_id, "mode": mode})

    def __call__(self, path, params, headers):
        refused = False
        if path == "/v2/insights":
            self.insights_count += 1
            refused = self.mode == "all_fail" or (
                self.mode == "outing_fail" and self.insights_count == 3
            )
        append_event({"event": "transport", "fixture_id": self.fixture_id,
                      "mode": self.mode, "path": path, "params": params,
                      "insights_count": self.insights_count, "refused": refused})
        if refused:
            raise QlooError(503, "authored receiving refusal")
        return super().__call__(path, params, headers)


def authored_factory(cls):
    mode = (OUTPUT / "mode.txt").read_text(encoding="utf-8").strip()
    if mode not in {"healthy", "outing_fail", "all_fail"}:
        raise ValueError("Unknown receiving fixture mode")
    return QlooClient(api_key="AUTHORED-FIXTURE-NOT-A-SECRET", transport=AuthoredTransport(mode))


QlooClient.from_env = classmethod(authored_factory)

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.bind(("127.0.0.1", 0))
manifest = {
    "source": str(SOURCE),
    "commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=SOURCE, text=True).strip(),
    "app_module": web.__file__,
    "agent_module": agent.__file__,
    "environment": "cleared before application import",
    "outbound_provider_transport": "urllib.request.urlopen rejects every call",
    "fixture_factory": "new recorded synthetic FixtureTransport per request, authored refusal injection",
    "app_sha256": hashlib.sha256(Path(web.__file__).read_bytes()).hexdigest(),
    "agent_sha256": hashlib.sha256(Path(agent.__file__).read_bytes()).hexdigest(),
    "port": sock.getsockname()[1],
}
(OUTPUT / "server.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
uvicorn.Server(uvicorn.Config(web.app, log_level="info", access_log=True)).run(sockets=[sock])
