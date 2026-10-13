"""Receive caller-relative Node selection through the ordinary offline batch."""
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
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NODE = shutil.which("node")
PROFILE = {"cuisines": ["Cuban"], "music": ["Celia Cruz"], "films": [],
           "constraints": [], "city": "Pasadena"}
GUARD = '''import sys
def guard(event, args):
    if event in ("socket.connect", "socket.connect_ex", "socket.getaddrinfo", "urllib.Request"):
        raise RuntimeError("network refused by batch path receiver")
sys.addaudithook(guard)
'''


@unittest.skipUnless(NODE, "an existing Node.js 18+ executable is required")
class NativeBatchNodePathTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory(prefix="tastetable-node-path-")
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.work = self.root / "caller"
        self.work.mkdir()
        self.profile = self.work / "profile.json"
        self.profile.write_text(json.dumps(PROFILE) + "\n", encoding="utf-8")
        self.profile_bytes = self.profile.read_bytes()
        self.output = self.work / "week.zip"
        self.node = Path(NODE).absolute()
        guard = self.root / "guard"
        guard.mkdir()
        (guard / "sitecustomize.py").write_text(GUARD, encoding="utf-8")
        self.env = {k: v for k, v in os.environ.items()
                    if not k.startswith(("PYTHON", "QLOO_", "TASTETABLE_"))
                    and k != "NODE_OPTIONS"}
        self.env.update(PYTHONDONTWRITEBYTECODE="1", PYTHONPATH=str(guard),
                        TMPDIR=str(self.root))

    def link(self, target, link, directory=False):
        try:
            link.symlink_to(target, target_is_directory=directory)
        except (OSError, NotImplementedError) as exc:
            self.skipTest(f"this filesystem cannot create the required symlink: {exc}")

    def invoke(self, node):
        result = subprocess.run(
            [sys.executable, "-B", str(ROOT / "tastetable_batch.py"),
             "--node", node, "--profile", "profile.json", "--week", "2026-10-13",
             "--output", self.output.name],
            cwd=self.work, env=self.env, stdin=subprocess.DEVNULL,
            capture_output=True, timeout=30,
        )
        self.assertEqual(self.profile.read_bytes(), self.profile_bytes)
        self.assertFalse(list(self.work.glob(".tastetable-batch-*")))
        return result

    def receive_success(self, node):
        result = self.invoke(node)
        self.assertEqual(result.returncode, 0, result.stderr.decode(errors="replace"))
        self.assertEqual(result.stderr, b"")
        receipt = json.loads(result.stdout)
        self.assertEqual(receipt, {
            "output": str(self.output), "format": "tastetable.native-batch.v1",
            "status": "complete", "requested": 1, "succeeded": 1, "failed": 0,
            "weekStart": "2026-10-12", "index": "index.json",
        })
        with zipfile.ZipFile(self.output) as archive:
            self.assertEqual(set(archive.namelist()), {
                "index.json", "READ-ME.txt", "profiles/001/native-plan.json",
                "profiles/001/saved-week.json",
            })
            index = json.loads(archive.read("index.json"))
            self.assertEqual((index["status"], index["requested"], index["succeeded"], index["failed"]),
                             ("complete", 1, 1, 0))
            item, = index["entries"]
            self.assertEqual(item["input"], {
                "path": "profile.json", "bytes": len(self.profile_bytes),
                "sha256": hashlib.sha256(self.profile_bytes).hexdigest(),
            })
            for field in ("nativePlan", "savedWeek"):
                pin = item[field]
                raw = archive.read(pin["file"])
                self.assertEqual(len(raw), pin["bytes"])
                self.assertEqual(hashlib.sha256(raw).hexdigest(), pin["sha256"])
            native = json.loads(archive.read(item["nativePlan"]["file"]))
            week = json.loads(archive.read(item["savedWeek"]["file"]))
            self.assertEqual(native["profile"], PROFILE)
            self.assertEqual(native["provenance"]["mode"], "offline-fixtures")
            self.assertIs(native["response"]["mock"], True)
            self.assertEqual(week["inputs"], native["profile"])
            self.assertEqual(week["response"], native["response"])
            self.assertEqual(week["calendarId"], item["conversion"]["calendarId"])
            self.assertEqual(index["weekStart"], item["conversion"]["weekStart"])

    def test_relative_explicit_node_path_uses_caller_directory(self):
        toolchain = self.work / "tool chain"
        toolchain.mkdir()
        self.link(self.node, toolchain / "node")
        self.receive_success("./tool chain/node")

    def test_absolute_explicit_node_path_is_preserved(self):
        self.receive_success(str(self.node))

    def test_bare_node_name_keeps_path_lookup(self):
        self.env["PATH"] = str(self.node.parent) + os.pathsep + self.env.get("PATH", "")
        self.receive_success(self.node.name)

    def test_parent_component_keeps_directory_symlink_semantics(self):
        physical = self.root / "physical toolchain"
        (physical / "child").mkdir(parents=True)
        self.link(self.node, physical / "node")
        self.link(physical / "child", self.work / "alias", directory=True)
        # Resolving alias/.. lexically would select caller/node, which is absent.
        self.assertFalse((self.work / "node").exists())
        self.receive_success("alias/../node")

    def test_missing_explicit_executable_still_refuses_without_bundle(self):
        result = self.invoke("./absent/node")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, b"")
        self.assertIn(b"tastetable-batch:", result.stderr)
        self.assertFalse(self.output.exists())

    def test_file_path_trailing_separator_and_dot_remain_refused(self):
        toolchain = self.work / "toolchain"
        toolchain.mkdir()
        selected = toolchain / "node"
        self.link(self.node, selected)
        for number, name in enumerate((str(selected) + "/", str(selected) + "/.",
                                       "./toolchain/node/", "./toolchain/node/.")):
            with self.subTest(path=name):
                self.output = self.work / f"refusal-{number}.zip"
                result = self.invoke(name)
                self.assertEqual(result.returncode, 1)
                self.assertEqual(result.stdout, b"")
                self.assertIn(b"tastetable-batch:", result.stderr)
                self.assertFalse(self.output.exists())


if __name__ == "__main__":
    unittest.main()
