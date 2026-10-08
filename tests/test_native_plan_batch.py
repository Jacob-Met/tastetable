"""Actual-process receiving for the native multi-profile bundle consumer."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BATCH = ROOT / "tastetable_batch.py"
NODE = shutil.which("node")
A = {"cuisines": ["Japanese", "Italian"], "music": ["The Beatles"],
     "films": ["Roman Holiday"], "constraints": ["soft_foods"], "city": "Pasadena"}
B = {"cuisines": ["Cuban"], "music": ["Celia Cruz"], "films": ["West Side Story"],
     "constraints": ["low_sodium", "wheelchair"], "city": "Pasadena"}
GUARD = """
import json, os, sys
def audit(event, args):
    record = None
    if event in ('socket.connect', 'socket.connect_ex', 'socket.getaddrinfo', 'urllib.Request'):
        record = {'network': event}
    elif event == 'open' and isinstance(args[0], str) and args[0].endswith('/fixtures/qloo_fixtures.json'):
        record = {'fixture': True}
    if record:
        with open(os.environ['TASTETABLE_BATCH_AUDIT'], 'a') as stream:
            stream.write(json.dumps(record) + '\\n')
        if 'network' in record:
            raise RuntimeError('network refused by native batch receiver')
sys.addaudithook(audit)
"""
READ_WEEKS = """
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const {readWeekFile} = await import(pathToFileURL(process.argv[1]).href);
const dir = process.argv[2];
const index = JSON.parse(await readFile(join(dir, 'index.json'), 'utf8'));
const received = [];
for (const item of index.entries.filter(item => item.status === 'saved')) {
  const native = JSON.parse(await readFile(join(dir, item.nativePlan.file), 'utf8'));
  const week = readWeekFile(await readFile(join(dir, item.savedWeek.file), 'utf8'));
  assert.deepEqual(week.inputs, native.profile);
  assert.deepEqual(week.response, native.response);
  assert.equal(week.state.weekStart, index.weekStart);
  assert.equal(native.provenance.mode, 'offline-fixtures');
  assert.equal(native.response.mock, true);
  assert.equal(week.calendarId, item.conversion.calendarId);
  received.push({position: item.position, calendarId: week.calendarId, profile: week.inputs,
                 picks: week.state.picks.length, weekStart: week.state.weekStart});
}
console.log(JSON.stringify(received));
"""


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


@unittest.skipUnless(NODE, "the native converter requires an existing Node.js 18+ executable")
class NativePlanBatchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="tastetable-batch-test-")
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)
        self.a = self.profile("a/profile.json", A)
        self.b = self.profile("b/profile.json", B)
        self.output = self.work / "week bundle.zip"
        self.guard = self.work / "guard"
        self.guard.mkdir()
        (self.guard / "sitecustomize.py").write_text(GUARD)
        self.audit = self.work / "audit.jsonl"
        self.env = dict(os.environ)
        self.env.update(
            PYTHONDONTWRITEBYTECODE="1", PYTHONPATH=str(self.guard),
            TASTETABLE_BATCH_AUDIT=str(self.audit),
            TASTETABLE_LIVE="1", QLOO_API_KEY="SYNTHETIC-NOT-A-KEY",
            QLOO_BASE_URL="https://must-not-contact.invalid",
            TASTETABLE_LLM_BASE_URL="https://must-not-contact.invalid",
            TASTETABLE_LLM_MODEL="must-not-run",
        )
        self.counter = 0

    def profile(self, name, value):
        path = self.work / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, ensure_ascii=False) + "\n")
        return path

    def args(self, *profiles, week="2026-10-08", output=None):
        result = []
        for path in profiles:
            result += ["--profile", str(path)]
        return result + ["--week", week, "--output", str(output or self.output)]

    def command(self, args, hook=None, node=NODE):
        if hook is None:
            command = [sys.executable, "-B", str(BATCH)]
        else:
            wrapper = (
                "import pathlib, runpy, sys\n"
                "script = pathlib.Path(sys.argv[1])\n"
                "sys.argv = [str(script), *sys.argv[2:]]\n"
                "sys.path.insert(0, str(script.parent))\n" + hook + "\n"
                "runpy.run_path(str(script), run_name='__main__')\n"
            )
            command = [sys.executable, "-B", "-c", wrapper, str(BATCH)]
        return command + ["--node", str(node), *args]

    def invoke(self, args, code=0, hook=None, node=NODE):
        result = subprocess.run(self.command(args, hook, node), cwd=self.work,
                                env=self.env, stdin=subprocess.DEVNULL,
                                capture_output=True, timeout=90)
        self.assertEqual(result.returncode, code, result.stderr.decode("utf-8", "replace"))
        events = [json.loads(line) for line in self.audit.read_text().splitlines()] if self.audit.exists() else []
        self.assertFalse([event for event in events if "network" in event], events)
        return result

    def no_stages(self):
        self.assertEqual(list(self.work.glob(".tastetable-batch-*")), [])

    def receive_bundle(self, output=None):
        output = output or self.output
        self.counter += 1
        extract = self.work / f"received-{self.counter}"
        with zipfile.ZipFile(output) as archive:
            self.assertIsNone(archive.testzip())
            names = archive.namelist()
            self.assertEqual(len(names), len(set(names)))
            self.assertTrue(all(re.fullmatch(
                r"(?:index\.json|READ-ME\.txt|profiles/\d{3}/(?:native-plan|saved-week)\.json)", name)
                for name in names), names)
            index = json.loads(archive.read("index.json"))
            self.assertEqual(index["format"], "tastetable.native-batch.v1")
            self.assertEqual(index["requested"], len(index["entries"]))
            self.assertEqual([item["position"] for item in index["entries"]],
                             list(range(1, index["requested"] + 1)))
            saved = [item for item in index["entries"] if item["status"] == "saved"]
            self.assertEqual(index["succeeded"], len(saved))
            self.assertEqual(index["failed"], index["requested"] - len(saved))
            wanted = {"index.json", "READ-ME.txt"}
            native = []
            for item in saved:
                for key in ["nativePlan", "savedWeek"]:
                    pin = item[key]
                    raw = archive.read(pin["file"])
                    self.assertEqual(len(raw), pin["bytes"])
                    self.assertEqual(sha(raw), pin["sha256"])
                    wanted.add(pin["file"])
                native.append(json.loads(archive.read(item["nativePlan"]["file"])))
            self.assertEqual(set(names), wanted)
            text = archive.read("READ-ME.txt").decode()
            archive.extractall(extract)
        read = subprocess.run(
            [NODE, "--input-type=module", "--eval", READ_WEEKS,
             str(ROOT / "static" / "week_file.mjs"), str(extract)],
            cwd=self.work, capture_output=True, timeout=20,
        )
        self.assertEqual(read.returncode, 0, read.stderr)
        return index, native, json.loads(read.stdout), text

    def test_two_real_profiles_same_basename_preserve_native_results_and_week_files(self):
        before = {str(path): path.read_bytes() for path in [self.a, self.b]}
        result = self.invoke(self.args(self.a, self.b))
        receipt = json.loads(result.stdout)
        self.assertEqual((receipt["status"], receipt["succeeded"], receipt["failed"]),
                         ("complete", 2, 0))
        self.assertEqual(result.stderr, b"")
        index, native, weeks, text = self.receive_bundle()
        self.assertEqual([item["input"]["path"] for item in index["entries"]], [str(self.a), str(self.b)])
        self.assertEqual(index["weekStart"], "2026-10-05")
        self.assertIn("ALL PROFILES SAVED", text)
        for pos, path in enumerate([self.a, self.b]):
            direct = subprocess.run([sys.executable, "-B", str(ROOT / "tastetable_cli.py"),
                                     "--profile", str(path)], capture_output=True,
                                    cwd=self.work, env=self.env, timeout=20)
            self.assertEqual(direct.returncode, 0, direct.stderr)
            self.assertEqual(native[pos], json.loads(direct.stdout))
            self.assertEqual(index["entries"][pos]["input"]["sha256"], sha(before[str(path)]))
            self.assertEqual(path.read_bytes(), before[str(path)])
        self.assertNotEqual(weeks[0]["calendarId"], weeks[1]["calendarId"])
        self.no_stages()

    def test_repeated_input_is_an_explicit_second_entry_with_independent_calendar_identity(self):
        self.invoke(self.args(self.a, self.a))
        index, native, weeks, _ = self.receive_bundle()
        self.assertEqual(native[0], native[1])
        self.assertEqual(index["entries"][0]["input"], index["entries"][1]["input"])
        self.assertNotEqual(weeks[0]["calendarId"], weeks[1]["calendarId"])
        self.no_stages()

    def test_invalid_middle_profile_is_visible_and_does_not_drop_later_success(self):
        invalid = self.profile("invalid.json", {"cuisines": ["Japanese"], "constraints": ["unsupported"]})
        result = self.invoke(self.args(self.a, invalid, self.b), code=3)
        self.assertEqual(json.loads(result.stdout)["status"], "partial")
        self.assertIn(b"1 failed profile", result.stderr)
        index, _, weeks, text = self.receive_bundle()
        self.assertEqual([item["status"] for item in index["entries"]], ["saved", "failed", "saved"])
        self.assertEqual(index["entries"][1]["error"]["stage"], "producer")
        self.assertEqual(index["entries"][1]["error"]["exitCode"], 2)
        self.assertEqual(index["entries"][1]["input"]["sha256"], sha(invalid.read_bytes()))
        self.assertEqual([week["position"] for week in weeks], [1, 3])
        self.assertIn("PARTIAL BUNDLE", text)
        self.assertIn("002. FAILED", text)
        self.no_stages()

    def test_all_refused_inputs_still_have_an_ordered_error_bundle_and_nonzero_exit(self):
        duplicate = self.work / "duplicate.json"
        duplicate.write_bytes(b'{"cuisines":["Japanese"],"cuisines":["Cuban"]}')
        nonfinite = self.work / "nonfinite.json"
        nonfinite.write_bytes(b'{"cuisines":["Japanese"],"city":NaN}')
        bad_utf8 = self.work / "bad-utf8.json"
        bad_utf8.write_bytes(b'{"cuisines":["\xff"]}')
        oversized = self.work / "oversized.json"
        oversized.write_bytes(b" " * (64 * 1024 + 1))
        paths = [self.work / "missing.json", self.work, duplicate, nonfinite, bad_utf8, oversized, "-"]
        result = self.invoke(self.args(*paths), code=3)
        self.assertEqual(json.loads(result.stdout)["status"], "failed")
        index, _, weeks, text = self.receive_bundle()
        self.assertEqual((index["succeeded"], index["failed"]), (0, 7))
        self.assertEqual([item["input"]["path"] for item in index["entries"]], list(map(str, paths)))
        self.assertEqual(weeks, [])
        self.assertIn("NO PROFILES SAVED", text)
        self.no_stages()

    def test_single_profile_and_twenty_profile_upper_bound(self):
        first = self.work / "single.zip"
        self.invoke(self.args(self.b, output=first))
        one, _, _, _ = self.receive_bundle(first)
        self.assertEqual(one["requested"], 1)
        self.invoke(self.args(*([self.a] * 20)))
        index, _, weeks, _ = self.receive_bundle()
        self.assertEqual((index["requested"], index["succeeded"]), (20, 20))
        self.assertEqual(len({week["calendarId"] for week in weeks}), 20)
        self.no_stages()

    def test_zero_or_twenty_one_profiles_are_refused_before_output(self):
        self.invoke(["--week", "2026-10-08", "--output", str(self.output)], code=2)
        self.invoke(self.args(*([self.a] * 21)), code=2)
        self.assertFalse(self.output.exists())
        self.no_stages()

    def test_invalid_date_reuses_native_week_refusal_and_leaves_no_bundle(self):
        for value in ["2026-02-29", "2026-13-01", "10/08/2026"]:
            with self.subTest(date=value):
                self.invoke(self.args(self.a, week=value), code=2)
                self.assertFalse(self.output.exists())
                self.no_stages()

    def test_existing_week_model_handles_a_daylight_saving_week(self):
        self.invoke(self.args(self.a, week="2026-03-08"))
        index, _, weeks, _ = self.receive_bundle()
        self.assertEqual(index["weekStart"], "2026-03-02")
        self.assertEqual(weeks[0]["weekStart"], "2026-03-02")

    def test_existing_output_directory_and_input_alias_are_preserved(self):
        occupied = self.work / "occupied.zip"
        occupied.write_bytes(b"existing bundle")
        for output in [occupied, self.work, self.a]:
            before = output.read_bytes() if output.is_file() else None
            with self.subTest(output=str(output)):
                self.invoke(self.args(self.a, output=output), code=2)
                if before is not None:
                    self.assertEqual(output.read_bytes(), before)
                self.no_stages()

    def test_dangling_output_symlink_is_not_followed_or_replaced(self):
        link = self.work / "link.zip"
        try:
            link.symlink_to(self.work / "missing-target.zip")
        except OSError as exc:
            self.skipTest(f"symlink unavailable: {exc}")
        self.invoke(self.args(self.a, output=link), code=2)
        self.assertTrue(link.is_symlink())
        self.assertFalse((self.work / "missing-target.zip").exists())
        self.no_stages()

    @unittest.skipUnless(hasattr(os, "mkfifo"), "FIFO admission is a POSIX receiver control")
    def test_fifo_profile_is_refused_without_waiting_for_a_writer(self):
        fifo = self.work / "profile.fifo"
        os.mkfifo(fifo)
        self.invoke(self.args(fifo, self.a), code=3)
        index, _, _, _ = self.receive_bundle()
        self.assertEqual(index["entries"][0]["error"]["stage"], "read")
        self.assertEqual(index["entries"][1]["status"], "saved")

    def test_missing_node_or_output_parent_never_publishes(self):
        self.invoke(self.args(self.a), code=1, node=self.work / "no-node")
        self.invoke(self.args(self.a, output=self.work / "absent" / "bundle.zip"), code=2)
        self.assertFalse(self.output.exists())
        self.assertFalse((self.work / "absent").exists())
        self.no_stages()

    def test_repeated_singular_options_and_unknown_options_are_refused(self):
        for extra in [["--week", "2026-10-12"], ["--output", str(self.work / "other.zip")],
                      ["--node", NODE], ["--live"], ["--prof", str(self.a)]]:
            with self.subTest(extra=extra):
                self.invoke(self.args(self.a) + extra, code=2)
                self.assertFalse(self.output.exists())
        self.no_stages()

    def test_original_file_replacement_after_capture_does_not_change_consumed_bytes(self):
        before = self.a.read_bytes()
        replacement = self.b.read_bytes()
        hook = (
            "import json\n"
            f"original = pathlib.Path({str(self.a)!r})\n"
            f"replacement = {replacement!r}\n"
            "def interleave(event, args):\n"
            "    if event == 'subprocess.Popen' and any(str(x).endswith('tastetable_cli.py') for x in args[1]):\n"
            "        original.write_bytes(replacement)\n"
            "sys.addaudithook(interleave)\n"
        )
        self.invoke(self.args(self.a), hook=hook)
        index, native, _, _ = self.receive_bundle()
        self.assertEqual(self.a.read_bytes(), replacement)
        self.assertEqual(index["entries"][0]["input"]["sha256"], sha(before))
        self.assertEqual(native[0]["profile"], A)
        self.no_stages()

    def test_one_converter_start_failure_preserves_other_real_conversions(self):
        hook = (
            "calls = 0\n"
            "def interleave(event, args):\n"
            "    global calls\n"
            "    if event == 'subprocess.Popen' and any(str(x).endswith('native_plan_to_week.mjs') for x in args[1]):\n"
            "        calls += 1\n"
            "        if calls == 2: raise OSError('authored converter-start refusal')\n"
            "sys.addaudithook(interleave)\n"
        )
        self.invoke(self.args(self.a, self.b, self.a), code=3, hook=hook)
        index, _, weeks, _ = self.receive_bundle()
        self.assertEqual([item["status"] for item in index["entries"]], ["saved", "failed", "saved"])
        self.assertEqual(index["entries"][1]["error"]["stage"], "converter")
        self.assertEqual([week["position"] for week in weeks], [1, 3])
        self.no_stages()

    def test_actual_output_creation_race_preserves_the_other_writer(self):
        hook = (
            f"destination = pathlib.Path({str(self.output)!r})\n"
            "def race(event, args):\n"
            "    if event == 'os.link' and pathlib.Path(args[1]) == destination:\n"
            "        destination.write_bytes(b'other writer won')\n"
            "sys.addaudithook(race)\n"
        )
        result = self.invoke(self.args(self.a), code=2, hook=hook)
        self.assertEqual(result.stdout, b"")
        self.assertEqual(self.output.read_bytes(), b"other writer won")
        self.assertIn(b"appeared during", result.stderr)
        self.no_stages()

    def test_real_partial_zip_write_failure_removes_own_stage_and_publishes_nothing(self):
        hook = (
            "import zipfile\n"
            "original_write = zipfile.ZipFile.write\n"
            "def fail_after_write(self, *args, **kwargs):\n"
            "    original_write(self, *args, **kwargs)\n"
            "    raise OSError('authored failure after a real ZIP member write')\n"
            "zipfile.ZipFile.write = fail_after_write\n"
        )
        result = self.invoke(self.args(self.a), code=1, hook=hook)
        self.assertEqual(result.stdout, b"")
        self.assertFalse(self.output.exists())
        self.assertIn(b"real ZIP member", result.stderr)
        self.no_stages()

    def test_cleanup_failure_after_publication_reports_the_existing_complete_bundle(self):
        self.output = self.work / 'cleanup "quoted"\nresult.zip'
        hook = (
            "import shutil\n"
            "original_remove = shutil.rmtree\n"
            "def fail_owned_stage(path, *args, **kwargs):\n"
            "    if pathlib.Path(path).name.startswith('.tastetable-batch-'):\n"
            "        raise OSError('authored cleanup refusal')\n"
            "    return original_remove(path, *args, **kwargs)\n"
            "shutil.rmtree = fail_owned_stage\n"
        )
        result = self.invoke(self.args(self.a), code=1, hook=hook)
        self.assertEqual(result.stdout, b"")
        self.assertIn(b"Bundle was created", result.stderr)
        self.assertIn(json.dumps(str(self.output), ensure_ascii=True).encode("ascii"), result.stderr)
        self.assertIn(b"cleanup refusal", result.stderr)
        index, _, _, _ = self.receive_bundle()
        self.assertEqual(index["status"], "complete")
        before = self.output.read_bytes()
        self.invoke(self.args(self.b), code=2)
        self.assertEqual(self.output.read_bytes(), before)
        self.assertEqual(len(list(self.work.glob(".tastetable-batch-*"))), 1)

    def test_broken_receipt_pipe_reports_published_bundle_without_overwriting_on_retry(self):
        self.output = self.work / 'receipt "quoted"\nresult.zip'
        read_fd, write_fd = os.pipe()
        os.close(read_fd)
        try:
            result = subprocess.run(self.command(self.args(self.a)), cwd=self.work,
                                    env=self.env, stdin=subprocess.DEVNULL, stdout=write_fd,
                                    stderr=subprocess.PIPE, timeout=30)
        finally:
            os.close(write_fd)
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn(b"Bundle was created", result.stderr)
        self.assertIn(json.dumps(str(self.output), ensure_ascii=True).encode("ascii"), result.stderr)
        index, _, _, _ = self.receive_bundle()
        self.assertEqual(index["status"], "complete")
        before = self.output.read_bytes()
        self.invoke(self.args(self.a), code=2)
        self.assertEqual(self.output.read_bytes(), before)
        self.no_stages()

    def test_literal_path_labels_cannot_add_archive_members_or_fake_index_rows(self):
        odd = self.profile('label\nFAILED <script>../ profile.json', A)
        self.invoke(self.args(odd, self.b))
        index, _, _, text = self.receive_bundle()
        self.assertEqual(index["entries"][0]["input"]["path"], str(odd))
        self.assertIn(json.dumps(str(odd), ensure_ascii=True), text)
        self.assertNotIn("\nFAILED <script>", text)
        self.no_stages()


if __name__ == "__main__":
    unittest.main()
