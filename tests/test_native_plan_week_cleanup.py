"""Actual command receiving when publication succeeds but stage cleanup fails.

This separate control was added after source review. The ten original
test_native_plan_week.py methods and their original absence receipt stay frozen.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]

FAULT = r"""
import fs from "node:fs/promises";
import {dirname, resolve} from "node:path";
const actualLink = fs.link.bind(fs);
fs.link = async (source, destination) => {
  await actualLink(source, destination);
  if (resolve(destination) === process.env.NATIVE_WEEK_FAULT_OUTPUT) {
    // The final link really exists. Removing completed.json must now encounter
    // the kernel's EACCES error in this unprivileged process, not a stubbed rm.
    const stage = dirname(source);
    await fs.chmod(stage, 0o500);
    await fs.writeFile(process.env.NATIVE_WEEK_FAULT_RECORD, stage + "\n", {flag: "wx"});
  }
};
"""

RECEIVE = r"""
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
const [root, filename] = process.argv.slice(1);
const {readWeekFile} = await import(pathToFileURL(resolve(root, "static/week_file.mjs")));
console.log(JSON.stringify(readWeekFile(readFileSync(filename, "utf8"))));
"""


class NativePlanWeekCleanupTests(unittest.TestCase):
    @unittest.skipUnless(
        os.name == "posix" and hasattr(os, "geteuid") and os.geteuid() != 0,
        "Real cleanup permission refusal requires unprivileged POSIX.",
    )
    def test_completed_file_is_reported_if_real_stage_cleanup_fails(self):
        node = shutil.which("node")
        self.assertIsNotNone(node, "Native saved-week receiving requires installed Node.js.")
        source_paths = (
            "tastetable_cli.py", "tools/native_plan_to_week.mjs",
            "static/week_plan.mjs", "static/week_file.mjs",
        )
        before = {
            name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
            for name in source_paths
        }
        with tempfile.TemporaryDirectory(prefix="tastetable-week-cleanup-") as temp:
            owned = Path(temp)
            source = owned / "native.json"
            destination = owned / "completed-week.json"
            preload = owned / "cleanup-fault.mjs"
            record = owned / "real-link-stage.txt"
            producer = subprocess.run(
                [sys.executable, str(ROOT / "tastetable_cli.py"), "--persona", "rosa"],
                cwd=ROOT, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"},
                capture_output=True, timeout=20,
            )
            self.assertEqual(producer.returncode, 0, producer.stderr.decode("utf-8", "replace"))
            original = producer.stdout
            source.write_bytes(original)
            envelope = json.loads(original)
            preload.write_text(FAULT, encoding="utf-8")
            command = [
                node, str(ROOT / "tools/native_plan_to_week.mjs"),
                "--input", str(source), "--week", "2026-12-30",
                "--output", str(destination),
            ]
            env = {
                **os.environ,
                "NATIVE_WEEK_FAULT_OUTPUT": str(destination),
                "NATIVE_WEEK_FAULT_RECORD": str(record),
            }
            try:
                result = subprocess.run(
                    [node, "--import", str(preload), *command[1:]],
                    cwd=owned, env=env, capture_output=True, timeout=20,
                )
                self.assertEqual(result.returncode, 1, result.stderr.decode("utf-8", "replace"))
                self.assertEqual(result.stdout, b"")
                self.assertIn(b"Saved week was created", result.stderr)
                self.assertIn(b"EACCES", result.stderr)
                self.assertTrue(destination.is_file(), "The real create-only link must exist.")
                self.assertTrue(record.is_file(), "The post-link native filesystem fault must run.")
                stage = Path(record.read_text(encoding="utf-8").strip())
                self.assertEqual(stage.parent, owned)
                self.assertTrue(stage.name.startswith(".tastetable-week-"))
                self.assertEqual(stage.stat().st_mode & 0o777, 0o500)
                staged_file = stage / "completed.json"
                self.assertEqual(os.stat(staged_file).st_ino, destination.stat().st_ino)
                completed = destination.read_bytes()
                consumer = subprocess.run(
                    [node, "--input-type=module", "-e", RECEIVE, str(ROOT), str(destination)],
                    cwd=owned, capture_output=True, timeout=20,
                )
                self.assertEqual(consumer.returncode, 0, consumer.stderr.decode("utf-8", "replace"))
                restored = json.loads(consumer.stdout)
                self.assertEqual(restored["inputs"], envelope["profile"])
                self.assertEqual(restored["response"], envelope["response"])
                self.assertEqual(restored["state"]["weekStart"], "2026-12-28")
                self.assertTrue(restored["response"]["mock"])
                retry = subprocess.run(command, cwd=owned, capture_output=True, timeout=20)
                self.assertEqual(retry.returncode, 2, retry.stderr.decode("utf-8", "replace"))
                self.assertIn(b"Output already exists", retry.stderr)
                self.assertNotIn(b"Saved week was created", retry.stderr)
                self.assertEqual(retry.stdout, b"")
                self.assertEqual(destination.read_bytes(), completed)
                self.assertEqual(source.read_bytes(), original)
                self.assertEqual(
                    {p.name for p in owned.iterdir()},
                    {"native.json", "completed-week.json", "cleanup-fault.mjs",
                     "real-link-stage.txt", stage.name},
                )
                print("NATIVE_WEEK_CLEANUP_CONTROL real link + kernel EACCES; "
                      "complete native file received; created diagnostic explicit; retry preserves bytes")
            finally:
                # The receiver owns the deliberately restricted stage and restores
                # its permissions solely to clean its TemporaryDirectory.
                for candidate in owned.glob(".tastetable-week-*"):
                    if candidate.is_dir() and not candidate.is_symlink():
                        candidate.chmod(0o700)
            self.assertEqual(
                before,
                {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
                 for name in source_paths},
            )


if __name__ == "__main__":
    unittest.main()
