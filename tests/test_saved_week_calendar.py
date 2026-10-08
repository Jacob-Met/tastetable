"""Actual saved-week calendar command, with the existing codec/writer as oracle.

Only temporary fictional saved files are used. Node is already required by the
maintained native-week tests. This file is selected by the unchanged pytest CI.
"""
from __future__ import annotations

import copy
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
COMMAND = ROOT / "tools" / "saved_week_to_calendar.mjs"
MAX_INPUT_BYTES = 4 * 1024 * 1024
SOURCE_PATHS = (
    "static/week_file.mjs", "static/week_plan.mjs", "static/calendar.js",
    "tools/native_plan_to_week.mjs", "tastetable_cli.py",
)

ORACLE = r"""
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {createRequire} from "node:module";
const [root, mode, explicitId] = process.argv.slice(1);
const plan = await import(pathToFileURL(resolve(root, "static/week_plan.mjs")));
const codec = await import(pathToFileURL(resolve(root, "static/week_file.mjs")));
const calendar = createRequire(import.meta.url)(resolve(root, "static/calendar.js"));
if (mode === "fixture") {
  const response = JSON.parse(readFileSync(resolve(root, "tests/fixtures/saved-week-response.json"), "utf8"));
  const inputs = {cuisines:["Cuban"], music:["Celia Cruz"], films:["West Side Story"],
    constraints:structuredClone(response.comparison.constraints), city:"Pasadena"};
  const state = plan.createWeekPlan(response, "2026-10-08");
  process.stdout.write(codec.makeWeekFile({
    response, inputs, state, receivedAt:"2026-10-08T08:09:10.123Z",
    calendarId:"0123456789abcdef0123456789abcdef",
  }, new Date("2026-10-08T09:10:11.456Z")).text);
} else {
  const raw = readFileSync(0);
  const restored = codec.readWeekFile(new TextDecoder("utf-8", {fatal:true, ignoreBOM:true}).decode(raw));
  const session = calendar.createWeekExport(restored.state, {
    id:explicitId || restored.calendarId, createdAt:new Date(restored.receivedAt),
  });
  const rows = plan.weekRows(restored.state);
  process.stdout.write(JSON.stringify({
    calendar:session.download(restored.state, rows),
    preview:session.preview(restored.state, rows),
    source:session.source,
  }) + "\n");
}
"""

API = r"""
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
const [filename] = process.argv.slice(2);
const {prepareSavedWeekCalendar} = await import(pathToFileURL(filename));
const request = JSON.parse(readFileSync(0, "utf8"));
try {
  const value = prepareSavedWeekCalendar(request.text, request.options);
  console.log(JSON.stringify({accepted:true, value}));
} catch (error) {
  console.log(JSON.stringify({accepted:false, message:error.message}));
}
"""

GUARD = r"""
const fs = require("node:fs");
const child = require("node:child_process");
const net = require("node:net");
const http = require("node:http");
const https = require("node:https");
const {syncBuiltinESMExports} = require("node:module");
function refuse(name) {
  return () => {
    fs.appendFileSync(process.env.SAVED_WEEK_CALENDAR_EFFECT_LOG, name + "\n");
    throw Error("Receiving refused an unexpected external effect: " + name);
  };
}
for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"])
  child[name] = refuse("child_process." + name);
for (const name of ["connect", "createConnection"]) net[name] = refuse("net." + name);
for (const api of [http, https])
  for (const name of ["get", "request"]) api[name] = refuse("http." + name);
globalThis.fetch = refuse("fetch");
syncBuiltinESMExports();
"""


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


class SavedWeekCalendarTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.node = shutil.which("node")
        if cls.node is None:
            raise AssertionError("Saved-week calendar receiving requires installed Node.js.")
        cls.sources = {name: digest((ROOT / name).read_bytes()) for name in SOURCE_PATHS}
        result = subprocess.run(
            [cls.node, "--input-type=module", "-e", ORACLE, str(ROOT), "fixture"],
            cwd=ROOT, capture_output=True, timeout=20,
        )
        if result.returncode:
            raise AssertionError(result.stderr.decode("utf-8", "replace"))
        cls.original = result.stdout
        cls.envelope = json.loads(cls.original)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="tastetable-calendar-test-")
        self.addCleanup(self.temp.cleanup)
        self.owned = Path(self.temp.name)
        self.input = self.owned / "saved-week.json"
        self.output = self.owned / "calendar.ics"
        self.input.write_bytes(self.original)
        self.guard = self.owned / "network-guard.cjs"
        self.guard.write_text(GUARD, encoding="utf-8")
        self.effects = self.owned / "external-effects.txt"
        self.env = {
            **os.environ, "PYTHONDONTWRITEBYTECODE": "1",
            "SAVED_WEEK_CALENDAR_EFFECT_LOG": str(self.effects),
            "QLOO_API_KEY": "synthetic-not-a-key", "TASTETABLE_LIVE": "1",
            "TASTETABLE_LLM_BASE_URL": "https://invalid.example.test/no-call",
        }

    def tearDown(self):
        self.assertFalse(self.effects.exists(), self.effects.read_text() if self.effects.exists() else "")
        self.assertEqual(self.sources, {name: digest((ROOT / name).read_bytes()) for name in SOURCE_PATHS})

    def fixture(self, value):
        raw = json.dumps(value, ensure_ascii=False, indent=2).encode("utf-8") + b"\n"
        self.input.write_bytes(raw)
        return raw

    def command(self, args=None, *, fault=None, stdout=subprocess.PIPE, stderr=subprocess.PIPE):
        argv = [self.node, "--require", str(self.guard)]
        if fault is not None:
            preload = self.owned / "fault.cjs"
            preload.write_text(fault, encoding="utf-8")
            argv += ["--require", str(preload)]
        argv += [str(COMMAND)]
        argv += args if args is not None else ["--input", str(self.input), "--output", str(self.output)]
        before = self.input.read_bytes()
        result = subprocess.run(
            argv, cwd=ROOT, env=self.env, stdout=stdout, stderr=stderr, timeout=20,
        )
        self.assertEqual(self.input.read_bytes(), before)
        return result

    def oracle(self, raw=None, explicit_id=None):
        result = subprocess.run(
            [self.node, "--require", str(self.guard), "--input-type=module", "-e",
             ORACLE, str(ROOT), "receive", explicit_id or ""],
            input=raw if raw is not None else self.input.read_bytes(),
            cwd=ROOT, env=self.env, capture_output=True, timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8", "replace"))
        return json.loads(result.stdout)

    def accepted(self, result, output=None, explicit_id=None):
        self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8", "replace"))
        self.assertEqual(result.stderr, b"")
        self.assertTrue(result.stdout.endswith(b"\n"))
        receipt = json.loads(result.stdout)
        actual = (output or self.output).read_bytes()
        expected = self.oracle(explicit_id=explicit_id)
        self.assertEqual(actual, expected["calendar"]["text"].encode("utf-8"))
        self.assertEqual(receipt["preview"], expected["preview"])
        self.assertEqual(receipt["source"], expected["source"])
        self.assertEqual(receipt["count"], expected["calendar"]["count"])
        self.assertEqual(receipt["inputSha256"], digest(self.input.read_bytes()))
        self.assertEqual(receipt["inputBytes"], len(self.input.read_bytes()))
        self.assertEqual(receipt["outputSha256"], digest(actual))
        self.assertEqual(receipt["outputBytes"], len(actual))
        self.assertEqual(receipt["receivedAt"], self.envelope["receivedAt"])
        self.assertEqual(receipt["savedAt"], self.envelope["savedAt"])
        self.assertEqual(list(self.owned.glob(".tastetable-calendar-*")), [])
        return receipt, actual

    def refused(self, result, code=2):
        self.assertEqual(result.returncode, code, result.stderr.decode("utf-8", "replace"))
        self.assertEqual(result.stdout, b"")
        self.assertTrue(result.stderr.startswith(b"tastetable-calendar: "))
        self.assertFalse(self.output.exists())
        self.assertEqual(list(self.owned.glob(".tastetable-calendar-*")), [])

    def api(self, text, options=None):
        result = subprocess.run(
            [self.node, "--require", str(self.guard), "--input-type=module", "-e",
             API, "api-receiver", str(COMMAND)],
            input=json.dumps({"text": text, "options": options if options is not None else {}}).encode(),
            cwd=ROOT, env=self.env, capture_output=True, timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8", "replace"))
        return json.loads(result.stdout)

    def test_ordinary_calendar_is_byte_exact_and_retains_original_identity(self):
        receipt, actual = self.accepted(self.command())
        self.assertEqual(receipt["identitySource"], "saved")
        self.assertEqual(receipt["calendarId"], self.envelope["calendarId"])
        self.assertEqual(receipt["count"], 5)
        self.assertIn(b"DTSTAMP:20261008T080910Z\r\n", actual)
        self.assertTrue(actual.endswith(b"END:VCALENDAR\r\n"))

    def test_same_day_occurrences_omissions_and_order_reach_the_native_writer(self):
        value = copy.deepcopy(self.envelope)
        value["week"]["assignments"].update({"pick-0": "Tuesday", "pick-1": "Tuesday", "pick-2": None})
        self.fixture(value)
        receipt, actual = self.accepted(self.command())
        self.assertEqual([item["key"] for item in receipt["preview"]], ["pick-0", "pick-1", "pick-4", "pick-3"])
        self.assertEqual([item["date"] for item in receipt["preview"]][:2], ["2026-10-06", "2026-10-06"])
        unfolded = actual.replace(b"\r\n ", b"")
        ids = [line for line in unfolded.split(b"\r\n") if line.startswith(b"UID:")]
        self.assertEqual(len(set(ids)), 4)
        self.assertNotIn(b"-pick-2@tastetable.invalid", unfolded)

    def test_repeat_with_saved_identity_is_identical_across_timezone_and_output_name(self):
        _, first = self.accepted(self.command())
        second = self.owned / "same saved source.ics"
        self.env["TZ"] = "Pacific/Kiritimati"
        result = self.command(["--output", str(second), "--input", str(self.input)])
        _, again = self.accepted(result, second)
        self.assertEqual(first, again)

    def test_literal_unicode_and_native_text_escaping_are_not_rewritten(self):
        value = copy.deepcopy(self.envelope)
        value["response"]["plan"]["meals"][0]["name"] = "Café 🦊; A,B\\C"
        value["response"]["plan"]["meals"][0]["why"] = "Original\r\nsecond\rlast\n<&literal> " + "é🦊" * 40
        value["response"]["plan"]["notes"] = ["Raw , ; \\ and CR\rretained by the native escape rules."]
        self.fixture(value)
        _, actual = self.accepted(self.command())
        self.assertIn("Café".encode(), actual)
        self.assertTrue(all(len(line) <= 75 for line in actual.split(b"\r\n")))

    def test_null_identity_requires_explicit_new_calendar_and_is_not_written_back(self):
        value = copy.deepcopy(self.envelope)
        value["calendarId"] = None
        self.fixture(value)
        self.refused(self.command())
        self.assertIn(b"--new-calendar", self.command().stderr)
        ids = []
        for name in ["first.ics", "second.ics"]:
            target = self.owned / name
            result = self.command(["--input", str(self.input), "--new-calendar", "--output", str(target)])
            self.assertEqual(result.returncode, 0, result.stderr.decode())
            receipt = json.loads(result.stdout)
            self.assertRegex(receipt["calendarId"], r"^[0-9a-f]{32}$")
            self.assertEqual(receipt["identitySource"], "new")
            self.accepted(result, target, receipt["calendarId"])
            ids.append(receipt["calendarId"])
        self.assertNotEqual(ids[0], ids[1])
        self.assertIsNone(json.loads(self.input.read_bytes())["calendarId"])

    def test_existing_identity_cannot_be_replaced_even_explicitly(self):
        result = self.command(["--input", str(self.input), "--output", str(self.output), "--new-calendar"])
        self.refused(result)
        self.assertIn(b"already has a calendar identity", result.stderr)
        fixed = self.envelope["calendarId"]
        response = self.api(self.input.read_text(), {"newCalendarId": fixed})
        self.assertFalse(response["accepted"])

    def test_pure_api_with_explicit_new_identity_matches_unchanged_writer(self):
        value = copy.deepcopy(self.envelope)
        value["calendarId"] = None
        raw = self.fixture(value)
        identity = "fedcba9876543210fedcba9876543210"
        result = self.api(raw.decode(), {"newCalendarId": identity})
        self.assertTrue(result["accepted"], result)
        self.assertEqual(result["value"]["calendar"], self.oracle(explicit_id=identity)["calendar"])
        self.assertEqual(result["value"]["identitySource"], "new")
        for bad in ["", "F" * 32, "g" * 32, "a" * 31, None, 12]:
            with self.subTest(identity=bad):
                self.assertFalse(self.api(raw.decode(), {"newCalendarId": bad})["accepted"])
        self.assertFalse(self.api(raw.decode(), {"unsupported": True})["accepted"])

    def test_empty_omitted_unknown_source_and_native_text_refusals(self):
        variants = []
        omitted = copy.deepcopy(self.envelope)
        omitted["week"]["assignments"] = {key: None for key in omitted["week"]["assignments"]}
        variants.append(("omitted", omitted))
        empty = copy.deepcopy(self.envelope)
        empty["response"]["plan"]["meals"] = []
        empty["response"]["plan"]["outing"] = None
        empty["week"]["assignments"] = {}
        variants.append(("empty", empty))
        unknown = copy.deepcopy(self.envelope)
        del unknown["response"]["mock"]
        variants.append(("unknown-source", unknown))
        control = copy.deepcopy(self.envelope)
        control["response"]["plan"]["meals"][0]["name"] = "unrepresentable\0name"
        variants.append(("native-control", control))
        invalid_day = copy.deepcopy(self.envelope)
        invalid_day["week"]["start"] = "2026-10-06"
        variants.append(("not-monday", invalid_day))
        for name, value in variants:
            with self.subTest(case=name):
                self.fixture(value)
                self.refused(self.command())

    def test_complete_saved_file_admission_uses_the_original_codec(self):
        variants = []
        for field in ["format", "receivedAt", "calendarId", "inputs", "response", "week"]:
            value = copy.deepcopy(self.envelope)
            del value[field]
            variants.append((field, value))
        missing_pick = copy.deepcopy(self.envelope)
        del missing_pick["week"]["assignments"]["pick-0"]
        variants.append(("missing-pick", missing_pick))
        extra_pick = copy.deepcopy(self.envelope)
        extra_pick["week"]["assignments"]["extra"] = "Monday"
        variants.append(("extra-pick", extra_pick))
        bad_id = copy.deepcopy(self.envelope)
        bad_id["calendarId"] = "not-an-id"
        variants.append(("bad-id", bad_id))
        for label, value in variants:
            with self.subTest(field=label):
                self.fixture(value)
                self.refused(self.command())

    def test_strict_utf8_and_exact_zero_one_two_bom_boundary(self):
        for count in [0, 1]:
            with self.subTest(boms=count):
                self.input.write_bytes(b"\xef\xbb\xbf" * count + self.original)
                self.accepted(self.command())
                self.output.unlink()
        for raw in [b"\xef\xbb\xbf" * 2 + self.original, b"\xff" + self.original,
                    b"\xc0\xaf" + self.original, self.original + b"\xff",
                    self.original + b"{}", b"{", b""]:
            with self.subTest(prefix=raw[:8]):
                self.input.write_bytes(raw)
                self.refused(self.command())

    def test_input_byte_limit_accepts_exact_boundary_without_truncating_extra_data(self):
        padded = self.original + b" " * (MAX_INPUT_BYTES - len(self.original))
        self.input.write_bytes(padded)
        self.accepted(self.command())
        self.output.unlink()
        self.input.write_bytes(padded + b" ")
        self.refused(self.command())

    def test_help_argument_refusal_and_nonfile_inputs_do_not_publish(self):
        help_result = self.command(["--help"])
        self.assertEqual(help_result.returncode, 0)
        self.assertIn(b"--new-calendar", help_result.stdout)
        self.assertIn(b"not saved back", help_result.stdout)
        self.assertFalse(self.output.exists())
        cases = [
            [], ["--input", str(self.input)], ["--output", str(self.output)],
            ["--input", "-","--output", str(self.output)], ["--help", "--new-calendar"],
            ["--input", str(self.input), "--output", str(self.output), "--unknown"],
            ["--input", str(self.input), "--input", str(self.input), "--output", str(self.output)],
            ["--input", str(self.input), "--output", str(self.output), "--new-calendar", "--new-calendar"],
            ["--input", str(self.owned), "--output", str(self.output)],
            ["--input", str(self.owned / "missing.json"), "--output", str(self.output)],
        ]
        for args in cases:
            with self.subTest(args=args):
                self.refused(self.command(args))

    def test_occupied_files_directories_links_and_input_aliases_are_preserved(self):
        occupied = self.owned / "occupied.ics"
        occupied.write_bytes(b"unrelated existing output\r\n")
        directory = self.owned / "directory"
        directory.mkdir()
        link = self.owned / "input-link"
        link.symlink_to(self.input)
        dangling = self.owned / "dangling"
        dangling.symlink_to(self.owned / "absent")
        hardlink = self.owned / "input-hardlink"
        os.link(self.input, hardlink)
        targets = [occupied, directory, link, dangling, self.input, hardlink]
        for target in targets:
            with self.subTest(target=target.name):
                result = self.command(["--input", str(self.input), "--output", str(target)])
                self.assertEqual(result.returncode, 2, result.stderr.decode())
                self.assertEqual(result.stdout, b"")
                self.assertIn(b"already exists", result.stderr)
                self.assertEqual(list(self.owned.glob(".tastetable-calendar-*")), [])
        self.assertEqual(occupied.read_bytes(), b"unrelated existing output\r\n")
        self.assertTrue(directory.is_dir())
        self.assertEqual(os.readlink(link), str(self.input))
        self.assertTrue(dangling.is_symlink())
        self.assertEqual(hardlink.read_bytes(), self.original)

    def test_competing_destination_gets_kernel_create_only_refusal(self):
        fault = r"""
const fs = require("node:fs/promises");
const link = fs.link.bind(fs);
fs.link = async (source, destination) => {
  await fs.writeFile(destination, "competing creator\n", {flag:"wx"});
  return link(source, destination);
};
"""
        result = self.command(fault=fault)
        self.assertEqual(result.returncode, 2, result.stderr.decode())
        self.assertEqual(result.stdout, b"")
        self.assertEqual(self.output.read_bytes(), b"competing creator\n")
        self.assertIn(b"appeared during conversion", result.stderr)
        self.assertEqual(list(self.owned.glob(".tastetable-calendar-*")), [])

    def test_actual_partial_stage_is_removed_after_injected_write_failure(self):
        fault = r"""
const fs = require("node:fs/promises");
const write = fs.writeFile.bind(fs);
fs.writeFile = async (filename, bytes, options) => {
  await write(filename, bytes.subarray(0, 31), options);
  throw Object.assign(Error("injected failure after a real partial stage write"), {code:"EIO"});
};
"""
        result = self.command(fault=fault)
        self.refused(result, 1)
        self.assertIn(b"real partial stage write", result.stderr)

    def test_unavailable_hard_link_does_not_fall_back_to_overwriting(self):
        fault = r"""
const fs = require("node:fs/promises");
fs.link = async () => {throw Object.assign(Error("injected hard-link refusal"), {code:"ENOTSUP"});};
"""
        self.refused(self.command(fault=fault), 1)

    def test_cleanup_failure_after_actual_publication_reports_created_file_and_preserves_retry(self):
        fault = r"""
const fs = require("node:fs/promises");
fs.rm = async () => {throw Object.assign(Error("injected stage cleanup refusal"), {code:"EACCES"});};
"""
        result = self.command(fault=fault)
        self.assertEqual(result.returncode, 1, result.stderr.decode())
        self.assertEqual(result.stdout, b"")
        self.assertIn(b"Calendar was created", result.stderr)
        expected = self.oracle()["calendar"]["text"].encode()
        self.assertEqual(self.output.read_bytes(), expected)
        stages = list(self.owned.glob(".tastetable-calendar-*"))
        self.assertEqual(len(stages), 1)
        self.assertEqual((stages[0] / "completed.ics").read_bytes(), expected)
        retry = self.command()
        self.assertEqual(retry.returncode, 2)
        self.assertIn(b"already exists", retry.stderr)
        self.assertEqual(self.output.read_bytes(), expected)

    def test_real_broken_receipt_pipe_reports_completed_calendar(self):
        read_fd, write_fd = os.pipe()
        os.close(read_fd)
        try:
            result = self.command(stdout=write_fd)
        finally:
            os.close(write_fd)
        self.assertEqual(result.returncode, 1, result.stderr.decode())
        self.assertIn(b"Calendar was created", result.stderr)
        self.assertEqual(self.output.read_bytes(), self.oracle()["calendar"]["text"].encode())
        self.assertEqual(list(self.owned.glob(".tastetable-calendar-*")), [])

    def test_closed_diagnostics_preserve_refusal_code(self):
        self.input.write_bytes(b"{")
        read_fd, write_fd = os.pipe()
        os.close(read_fd)
        try:
            result = self.command(stderr=write_fd)
        finally:
            os.close(write_fd)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, b"")
        self.assertFalse(self.output.exists())

    def test_missing_output_parent_reports_delivery_failure_without_creating_directories(self):
        destination = self.owned / "missing" / "calendar.ics"
        result = self.command(["--input", str(self.input), "--output", str(destination)])
        self.assertEqual(result.returncode, 1, result.stderr.decode())
        self.assertFalse(destination.parent.exists())
        self.assertEqual(result.stdout, b"")


if __name__ == "__main__":
    unittest.main()
