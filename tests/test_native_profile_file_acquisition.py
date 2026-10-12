"""Process checks for named profile files and deliberate stdin streams."""
from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "tastetable_cli.py"
WRAPPER = r"""
import json, os, pathlib, runpy, sys
script, audit_path = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
mode, args = sys.argv[3], sys.argv[4:]
sys.argv = [str(script), *args]
sys.path.insert(0, str(script.parent))
profile_path = args[args.index('--profile') + 1]
events = {'network_attempts': [], 'fixture_reads': 0, 'replacements': 0}
audit_path.write_text(json.dumps(events))
def audit(event, values):
    if event in ('socket.connect', 'socket.getaddrinfo', 'urllib.Request'):
        events['network_attempts'].append(event)
        audit_path.write_text(json.dumps(events))
        raise RuntimeError('network forbidden by named-profile regression')
    if event != 'open' or not isinstance(values[0], str):
        return
    if values[0].endswith('/fixtures/qloo_fixtures.json'):
        events['fixture_reads'] += 1
        audit_path.write_text(json.dumps(events))
    if mode == 'replace-with-fifo' and values[0] == profile_path and not events['replacements']:
        # This is a real path replacement immediately before the real open.
        # No stat/fstat/read result or acquired file descriptor is mocked.
        os.unlink(profile_path)
        os.mkfifo(profile_path)
        events['replacements'] = 1
        audit_path.write_text(json.dumps(events))
sys.addaudithook(audit)
runpy.run_path(str(script), run_name='__main__')
"""


class NamedProfileAcquisitionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="tastetable-profile-file-")
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)
        self.counter = 0
        self.profile = b'{"cuisines":["Japanese"],"music":["The Beatles"]}'
        self.env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1", TASTETABLE_LIVE="1",
                        QLOO_API_KEY="SYNTHETIC-TEST-VALUE",
                        QLOO_BASE_URL="https://must-not-contact.invalid",
                        TASTETABLE_LLM_BASE_URL="https://must-not-contact.invalid",
                        TASTETABLE_LLM_MODEL="must-not-run")

    def receive(self, path, *, data=None, mode="normal", code=0, fixture_reads=1,
                replacements=0):
        self.counter += 1
        audit = self.work / f"audit-{self.counter}.json"
        command = [sys.executable, "-B", "-c", WRAPPER, str(CLI), str(audit), mode,
                   "--profile", str(path)]
        try:
            result = subprocess.run(command, input=data, cwd=self.work, env=self.env,
                                    capture_output=True, timeout=3)
        except subprocess.TimeoutExpired:
            # subprocess.run kills and reaps the child before raising.
            self.fail("named profile command did not finish within three seconds")
        self.assertEqual(result.returncode, code, result.stderr)
        self.assertEqual(json.loads(audit.read_text()), {
            "network_attempts": [], "fixture_reads": fixture_reads,
            "replacements": replacements,
        })
        if code:
            self.assertEqual(result.stdout, b"")
            self.assertNotIn(b"Traceback", result.stderr)
        return result

    @unittest.skipUnless(hasattr(os, "mkfifo"), "requires a POSIX named pipe")
    def test_named_fifo_without_writer_refuses_before_planning(self):
        path = self.work / "profile.pipe"
        os.mkfifo(path)
        result = self.receive(path, code=2, fixture_reads=0)
        self.assertIn(b"cannot read profile", result.stderr)
        self.assertIn(b"regular file", result.stderr)
        self.assertTrue(path.is_fifo())

    @unittest.skipUnless(hasattr(os, "mkfifo"), "requires a POSIX named pipe")
    def test_symlink_to_fifo_refuses_without_waiting(self):
        path = self.work / "profile.pipe"
        os.mkfifo(path)
        link = self.work / "profile.json"
        link.symlink_to(path.name)
        result = self.receive(link, code=2, fixture_reads=0)
        self.assertIn(b"regular file", result.stderr)
        self.assertTrue(link.is_symlink())
        self.assertTrue(path.is_fifo())

    @unittest.skipUnless(hasattr(os, "mkfifo"), "requires a POSIX named pipe")
    def test_regular_path_replaced_with_fifo_at_acquisition_refuses(self):
        path = self.work / "raced-profile.json"
        path.write_bytes(self.profile)
        result = self.receive(path, mode="replace-with-fifo", code=2,
                              fixture_reads=0, replacements=1)
        self.assertIn(b"regular file", result.stderr)
        self.assertTrue(path.is_fifo())

    def test_regular_file_symlink_and_stdin_keep_the_complete_same_result(self):
        path = self.work / "profile with spaces.json"
        path.write_bytes(self.profile)
        regular = self.receive(path)
        stdin = self.receive("-", data=self.profile)
        self.assertEqual(regular.stdout, stdin.stdout)
        self.assertEqual(path.read_bytes(), self.profile)
        envelope = json.loads(regular.stdout)
        self.assertEqual(envelope["provenance"]["mode"], "offline-fixtures")
        self.assertTrue(envelope["response"]["mock"])
        link = self.work / "profile alias.json"
        try:
            link.symlink_to(path.name)
        except (OSError, NotImplementedError):
            return
        linked = self.receive(link)
        self.assertEqual(linked.stdout, regular.stdout)
        self.assertTrue(link.is_symlink())
        self.assertEqual(path.read_bytes(), self.profile)

    def test_named_regular_file_keeps_the_exact_byte_limit(self):
        path = self.work / "bounded-profile.json"
        exact = self.profile + b" " * (65536 - len(self.profile))
        path.write_bytes(exact)
        self.receive(path)
        self.assertEqual(path.read_bytes(), exact)
        path.write_bytes(exact + b" ")
        result = self.receive(path, code=2, fixture_reads=0)
        self.assertIn(b"exceeds 65536 bytes", result.stderr)
        self.assertEqual(path.read_bytes(), exact + b" ")


if __name__ == "__main__":
    unittest.main()
