"""Process regressions for the explicitly offline native plan consumer."""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from agent import ScriptedModel, run_agent
from personas import PERSONAS
from qloo_client import FixtureTransport, QlooClient

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "tastetable_cli.py"
WRAPPER = r"""
import atexit, json, pathlib, runpy, sys
script, audit_path = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
sys.argv = [str(script), *sys.argv[3:]]
sys.path.insert(0, str(script.parent))
events = {"network_attempts": [], "fixture_reads": 0}
def audit(event, args):
    if event in ("socket.connect", "socket.getaddrinfo", "urllib.Request"):
        events["network_attempts"].append(event)
        raise RuntimeError("network forbidden by CLI regression")
    if event == "open" and isinstance(args[0], str) and args[0].endswith("/fixtures/qloo_fixtures.json"):
        events["fixture_reads"] += 1
sys.addaudithook(audit)
atexit.register(lambda: audit_path.write_text(json.dumps(events), encoding="utf-8"))
runpy.run_path(str(script), run_name="__main__")
"""


def expected(profile):
    return run_agent(profile, qloo=QlooClient(api_key="MOCK-NOT-A-KEY",
                                            transport=FixtureTransport()),
                     model=ScriptedModel())


class NativePlanCLITests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="tastetable-cli-")
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)
        self.counter = 0
        self.env = dict(os.environ)
        self.env.update(
            PYTHONDONTWRITEBYTECODE="1",
            TASTETABLE_LIVE="1",
            QLOO_API_KEY="SYNTHETIC-TEST-VALUE",
            QLOO_BASE_URL="https://must-not-contact.invalid",
            TASTETABLE_LLM_BASE_URL="https://must-not-contact.invalid",
            TASTETABLE_LLM_MODEL="must-not-run",
        )

    def command(self, args, script=CLI):
        self.counter += 1
        audit = self.work / f"audit-{self.counter}.json"
        return [sys.executable, "-c", WRAPPER, str(script), str(audit), *args], audit

    def receive(self, args, data=None, *, code=0, fixture_reads=1,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, script=CLI):
        command, audit = self.command(args, script)
        result = subprocess.run(command, input=data, cwd=self.work, env=self.env,
                                stdout=stdout, stderr=stderr, timeout=15)
        self.assertEqual(result.returncode, code, result.stderr)
        self.assertEqual(json.loads(audit.read_text()), {
            "network_attempts": [], "fixture_reads": fixture_reads,
        })
        if code:
            self.assertIn(result.stdout, (None, b""))
        return result

    def parse(self, result):
        envelope = json.loads(result.stdout)
        self.assertEqual(set(envelope), {"provenance", "profile", "response"})
        self.assertEqual(envelope["provenance"]["mode"], "offline-fixtures")
        self.assertIn("fictional", envelope["provenance"]["data"])
        self.assertTrue(envelope["response"]["mock"])
        self.assertEqual(set(envelope["response"]), {
            "plan", "llm_only", "comparison", "trace", "model_message", "mock",
        })
        return envelope

    def test_each_persona_is_the_exact_existing_native_response(self):
        responses = []
        for name, profile in PERSONAS.items():
            with self.subTest(persona=name):
                result = self.receive(["--persona", name])
                self.assertEqual(result.stderr, b"")
                envelope = self.parse(result)
                self.assertEqual(envelope["response"], expected(profile))
                responses.append(envelope["response"])
        self.assertNotEqual(responses[0], responses[-1])

    def test_authored_file_stdin_and_repeat_preserve_the_same_real_response(self):
        raw = json.dumps({"cuisines": [" Japanese "], "music": ["The Beatles"],
                          "films": [], "constraints": ["soft_foods"], "city": " Pasadena "},
                         ensure_ascii=False).encode()
        path = self.work / "profile with spaces.json"
        path.write_bytes(raw)
        file_result = self.receive(["--profile", str(path)])
        stdin_result = self.receive(["--profile", "-"], raw)
        repeat_result = self.receive(["--profile", str(path)])
        self.assertEqual(file_result.stdout, stdin_result.stdout)
        self.assertEqual(file_result.stdout, repeat_result.stdout)
        envelope = self.parse(file_result)
        profile = {"cuisines": ["Japanese"], "music": ["The Beatles"], "films": [],
                   "constraints": ["soft_foods"], "city": "Pasadena"}
        self.assertEqual(envelope["profile"], profile)
        self.assertEqual(envelope["response"], expected(profile))
        self.assertEqual(path.read_bytes(), raw)

    def test_authored_constraints_are_received_by_the_unchanged_planner(self):
        profile = {key: PERSONAS["rosa"][key]
                   for key in ("cuisines", "music", "films", "constraints", "city")}
        constrained = self.parse(self.receive(["--profile", "-"], json.dumps(profile).encode()))
        profile["constraints"] = []
        relaxed = self.parse(self.receive(["--profile", "-"], json.dumps(profile).encode()))
        self.assertEqual(relaxed["response"], expected(profile))
        self.assertNotEqual(constrained["response"]["plan"], relaxed["response"]["plan"])

    def test_unknown_city_is_a_valid_sparse_plan(self):
        profile = {"cuisines": ["Japanese"], "music": [], "films": [], "constraints": [],
                   "city": "No Fixture City"}
        envelope = self.parse(self.receive(["--profile", "-"], json.dumps(profile).encode()))
        self.assertEqual(envelope["response"], expected(profile))
        self.assertEqual(envelope["response"]["plan"]["meals"], [])
        self.assertIsNone(envelope["response"]["plan"]["outing"])
        self.assertTrue(envelope["response"]["plan"]["notes"])

    def test_minimal_music_profile_and_null_city_have_explicit_defaults(self):
        envelope = self.parse(self.receive(["--profile", "-"],
                                          b'{"music":["The Beatles"],"city":null}'))
        profile = {"cuisines": [], "music": ["The Beatles"], "films": [],
                   "constraints": [], "city": ""}
        self.assertEqual(envelope["profile"], profile)
        self.assertEqual(envelope["response"], expected(profile))

    def test_unicode_profile_text_is_preserved_with_character_limits(self):
        profile = {"cuisines": ["Japanese"], "music": ["🎵" * 60], "films": [],
                   "constraints": [], "city": "Pasadena"}
        raw = json.dumps(profile, ensure_ascii=False).encode("utf-8")
        envelope = self.parse(self.receive(["--profile", "-"], raw))
        self.assertEqual(envelope["profile"], profile)
        self.assertEqual(envelope["response"], expected(profile))

    def test_invalid_profile_shapes_stop_before_fixture_loading(self):
        invalid = [
            [], None, True, 17, {}, {"cuisines": "Japanese"},
            {"cuisines": ["Japanese"], "typo": []},
            {"cuisines": [False]}, {"cuisines": [1]}, {"cuisines": [None]},
            {"cuisines": [" "]}, {"cuisines": ["a" * 61]},
            {"cuisines": ["Japanese"] * 6},
            {"cuisines": ["Japanese"], "constraints": None},
            {"cuisines": ["Japanese"], "constraints": ["unknown"]},
            {"cuisines": ["Japanese"], "constraints": [False]},
            {"cuisines": ["Japanese"], "constraints": ["wheelchair", "wheelchair"]},
            {"cuisines": ["Japanese"], "constraints": ["soft_foods"] * 4},
            {"cuisines": ["Japanese"], "city": False},
            {"cuisines": ["Japanese"], "city": "a" * 61},
        ]
        for profile in invalid:
            with self.subTest(profile=profile):
                result = self.receive(["--profile", "-"], json.dumps(profile).encode(),
                                      code=2, fixture_reads=0)
                self.assertIn(b"tastetable:", result.stderr)
                self.assertNotIn(b"Traceback", result.stderr)

    def test_invalid_json_text_stops_before_fixture_loading(self):
        for raw, reason in [
            (b"", b"invalid profile JSON"),
            (b'{"cuisines":[', b"invalid profile JSON"),
            (b"\xff", b"invalid profile JSON"),
            (b'{"cuisines":["\\ud800"]}', b"valid Unicode"),
            (b'{"cuisines":["Japanese"],"cuisines":["Italian"]}', b"duplicate"),
            (b'{"cuisines":["Japanese"],"city":NaN}', b"non-finite"),
            (b'{"cuisines":["Japanese"],"city":Infinity}', b"non-finite"),
            (b"[" * 2000 + b"]" * 2000,
             (b"invalid profile JSON", b"profile must be a JSON object")),
        ]:
            with self.subTest(reason=reason):
                result = self.receive(["--profile", "-"], raw, code=2, fixture_reads=0)
                if isinstance(reason, tuple):
                    self.assertTrue(any(item in result.stderr for item in reason), result.stderr)
                else:
                    self.assertIn(reason, result.stderr)

    def test_byte_limit_is_checked_before_decoding_and_accepts_exact_boundary(self):
        raw = b'{"cuisines":["Japanese"]}'
        exact = raw + b" " * (65536 - len(raw))
        self.parse(self.receive(["--profile", "-"], exact))
        for oversized in (exact + b" ", b"\xff" * 65537):
            result = self.receive(["--profile", "-"], oversized, code=2, fixture_reads=0)
            self.assertIn(b"exceeds 65536 bytes", result.stderr)

    def test_missing_file_and_directory_are_input_errors(self):
        for path in (self.work / "missing.json", self.work):
            result = self.receive(["--profile", str(path)], code=2, fixture_reads=0)
            self.assertIn(b"cannot read profile", result.stderr)

    def test_argument_errors_exit_without_waiting_for_open_stdin(self):
        invalid = [
            ["--profile", "-", "--persona", "mei"],
            ["--profile", "-", "--unexpected"],
            ["--profile", "-", "trailing"],
            ["--persona", "unknown"], ["--pers", "mei"], [],
        ]
        for args in invalid:
            with self.subTest(args=args):
                command, audit = self.command(args)
                proc = subprocess.Popen(command, cwd=self.work, env=self.env,
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=subprocess.PIPE)
                try:
                    proc.wait(timeout=5)
                    proc.stdin.close()
                    proc.stdin = None
                    out, err = proc.communicate(timeout=5)
                finally:
                    if proc.poll() is None:
                        proc.kill()
                        proc.communicate()
                self.assertEqual(proc.returncode, 2, err)
                self.assertEqual(out, b"")
                self.assertIn(b"tastetable:", err)
                self.assertEqual(json.loads(audit.read_text()),
                                 {"network_attempts": [], "fixture_reads": 0})

    def test_help_is_offline_and_needs_no_profile(self):
        result = self.receive(["--help"], fixture_reads=0)
        self.assertIn(b"fictional fixtures", result.stdout)
        self.assertIn(b"--profile", result.stdout)
        self.assertIn(b"--persona", result.stdout)
        self.assertEqual(result.stderr, b"")

    def test_broken_stdout_returns_runtime_error_without_shutdown_traceback(self):
        read_fd, write_fd = os.pipe()
        os.close(read_fd)
        try:
            result = self.receive(["--persona", "mei"], code=1, stdout=write_fd)
        finally:
            os.close(write_fd)
        self.assertIn(b"cannot write result", result.stderr)
        self.assertNotIn(b"Traceback", result.stderr)
        self.assertNotIn(b"Exception ignored", result.stderr)

    def test_closed_stderr_preserves_argument_error_exit(self):
        read_fd, write_fd = os.pipe()
        os.close(read_fd)
        try:
            self.receive(["--unknown"], code=2, fixture_reads=0, stderr=write_fd)
        finally:
            os.close(write_fd)

    def test_broken_help_stdout_does_not_load_fixtures(self):
        read_fd, write_fd = os.pipe()
        os.close(read_fd)
        try:
            result = self.receive(["--help"], code=1, fixture_reads=0, stdout=write_fd)
        finally:
            os.close(write_fd)
        self.assertIn(b"cannot write help", result.stderr)

    def test_missing_fixture_is_runtime_failure_with_no_partial_json(self):
        source = self.work / "missing-fixture-source"
        source.mkdir()
        for path in ("tastetable_cli.py", "agent.py", "qloo_client.py",
                     "constraints.py", "personas.py"):
            shutil.copyfile(ROOT / path, source / path)
        result = self.receive(["--persona", "mei"], code=1, fixture_reads=1,
                              script=source / "tastetable_cli.py")
        self.assertIn(b"planning failed: FileNotFoundError", result.stderr)
        self.assertNotIn(b"Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
