"""Launcher configuration checks; no application server is started here."""
from __future__ import annotations

from collections.abc import Mapping
import contextlib
import importlib.util
import io
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "tools" / "serve_fixture_demo.py"
SPEC = importlib.util.spec_from_file_location("fixture_demo_launcher", SCRIPT)
launcher = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(launcher)


class RejectExcludedReads(Mapping):
    def __init__(self):
        self.names = [
            "QLOO_API_KEY", "qloo_base_url", "TASTETABLE_LIVE",
            "TASTETABLE_LLM_BASE_URL", "TASTETABLE_LLM_MODEL",
            "TASTETABLE_LLM_API_KEY", "WEB_CONCURRENCY",
            "UVICORN_RELOAD", "uvicorn_env_file", "PATH", "APP_NOTE",
        ]
        self.reads = []

    def __iter__(self):
        return iter(self.names)

    def __len__(self):
        return len(self.names)

    def __getitem__(self, name):
        self.reads.append(name)
        if name not in ("PATH", "APP_NOTE"):
            raise AssertionError("an excluded value was read")
        return {"PATH": "unchanged path", "APP_NOTE": "literal 海"}[name]


class FixtureDemoLauncherTests(unittest.TestCase):
    def test_excluded_values_are_not_read(self):
        original = RejectExcludedReads()
        result = launcher.fixture_environment(original)
        self.assertEqual(result, {"PATH": "unchanged path", "APP_NOTE": "literal 海"})
        self.assertEqual(original.reads, ["PATH", "APP_NOTE"])
        self.assertEqual(len(original), 11)

    def test_environment_is_a_separate_copy_and_parent_is_preserved(self):
        original = {"PATH": "p", "TASTETABLE_LIVE": "1", "UVICORN_WORKERS": "9",
                    "TASTETABLE_OTHER": "retained", "EMPTY": ""}
        before = original.copy()
        result = launcher.fixture_environment(original)
        self.assertEqual(result, {"PATH": "p", "TASTETABLE_OTHER": "retained", "EMPTY": ""})
        result["PATH"] = "changed only in the copy"
        self.assertEqual(original, before)

    def test_default_command_binds_actual_project_and_fixed_server_options(self):
        original = {"PATH": "p", "QLOO_API_KEY": "fictional-test-value",
                    "TASTETABLE_LIVE": "1", "TASTETABLE_LLM_BASE_URL": "http://invalid.example",
                    "UVICORN_HOST": "0.0.0.0", "WEB_CONCURRENCY": "7"}
        root = Path("project with spaces").absolute()
        with patch.object(launcher, "PROJECT_ROOT", root), patch.dict(os.environ, original, clear=True), \
             patch.object(launcher.subprocess, "call", return_value=0) as child:
            before = dict(os.environ)
            self.assertEqual(launcher.main([]), 0)
            self.assertEqual(dict(os.environ), before)
        child.assert_called_once_with(
            [sys.executable, "-B", "-m", "uvicorn", "app:app", "--app-dir", str(root),
             "--host", "127.0.0.1", "--port", "8000", "--workers", "1"],
            cwd=root, env={"PATH": "p"},
        )

    def test_explicit_port_and_child_failure_are_forwarded(self):
        with patch.object(launcher.subprocess, "call", return_value=1) as child:
            self.assertEqual(launcher.main(["--port", "9017"]), 1)
        command = child.call_args.args[0]
        self.assertEqual(command[command.index("--port") + 1], "9017")
        self.assertEqual(child.call_count, 1)
        self.assertNotIn("shell", child.call_args.kwargs)

    def test_port_limits_are_admitted(self):
        self.assertEqual(launcher._port("1"), 1)
        self.assertEqual(launcher._port("65535"), 65535)
        self.assertEqual(launcher._port("08000"), 8000)

    def test_invalid_arguments_do_not_start_a_child(self):
        cases = [["--port", value] for value in ("0", "65536", "-1", "+8000", "1.5", "\u0661")]
        cases.extend([["--host", "0.0.0.0"], ["--reload"], ["--por", "8000"]])
        for args in cases:
            with self.subTest(args=args), patch.object(launcher.subprocess, "call") as child, \
                 contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as refused:
                    launcher.main(args)
                self.assertEqual(refused.exception.code, 2)
                child.assert_not_called()

    def test_help_does_not_start_a_child(self):
        output = io.StringIO()
        with patch.object(launcher.subprocess, "call") as child, contextlib.redirect_stdout(output):
            with self.assertRaises(SystemExit) as completed:
                launcher.main(["--help"])
        self.assertEqual(completed.exception.code, 0)
        self.assertIn("No browser is opened", output.getvalue())
        child.assert_not_called()

    def test_child_start_error_is_a_bounded_diagnostic(self):
        output = io.StringIO()
        with patch.object(launcher.subprocess, "call", side_effect=OSError("missing executable")), \
             contextlib.redirect_stderr(output):
            self.assertEqual(launcher.main([]), 1)
        self.assertEqual(output.getvalue(), "fixture demo could not start: missing executable\n")

    def test_keyboard_interrupt_returns_conventional_status(self):
        with patch.object(launcher.subprocess, "call", side_effect=KeyboardInterrupt):
            self.assertEqual(launcher.main([]), 130)


if __name__ == "__main__":
    unittest.main()
