"""Real launcher shutdown: a stop must release its app's listening port."""
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
import urllib.request

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "tools" / "serve_fixture_demo.py"


@pytest.mark.skipif(os.name != "posix", reason="POSIX process signals")
@pytest.mark.parametrize("stop_signal", [signal.SIGTERM, signal.SIGINT, signal.SIGHUP])
def test_stop_releases_port_and_can_restart(tmp_path, stop_signal):
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    for attempt in range(2):
        with (tmp_path / f"server-{attempt}.log").open("w+") as log:
            child = subprocess.Popen(
                [sys.executable, "-B", str(SCRIPT), "--port", str(port)],
                cwd=tmp_path, stdout=log, stderr=subprocess.STDOUT,
                start_new_session=True,
            )
            try:
                deadline = time.monotonic() + 15
                while time.monotonic() < deadline:
                    assert child.poll() is None, "launcher exited before serving"
                    try:
                        with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=.3) as response:
                            assert response.status == 200
                            break
                    except OSError:
                        time.sleep(.05)
                else:
                    pytest.fail("app did not start")
                child.send_signal(stop_signal)
                assert child.wait(timeout=10) == 128 + stop_signal
                with socket.socket() as probe:
                    probe.settimeout(.3)
                    assert probe.connect_ex(("127.0.0.1", port)) != 0, "server survived its launcher"
            finally:
                # Only the fresh session created by this test; also reap on failures.
                try:
                    os.killpg(child.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
                child.wait(timeout=10)
