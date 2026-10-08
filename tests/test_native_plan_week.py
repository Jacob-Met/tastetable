"""Actual native planner -> saved-week command -> existing consumer receiving.

No provider or application server is needed. The original producer and existing
saved-week/calendar modules are independent oracles; the new command is always
executed as a separate Node process.
"""
from __future__ import annotations

import copy
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
COMMAND = ROOT / "tools" / "native_plan_to_week.mjs"
MAX_INPUT_BYTES = 2 * 1024 * 1024
SOURCE_PATHS = (
    "tastetable_cli.py", "agent.py", "constraints.py", "qloo_client.py",
    "personas.py", "fixtures/qloo_fixtures.json", "static/week_plan.mjs",
    "static/week_file.mjs", "static/calendar.js", "static/app.js",
    "static/index.html", "static/plan-request.js",
)

CONSUMER = r"""
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {createRequire} from "node:module";
const [root, filename, operation] = process.argv.slice(1);
const week = await import(pathToFileURL(resolve(root, "static/week_file.mjs")));
const plan = await import(pathToFileURL(resolve(root, "static/week_plan.mjs")));
const restored = week.readWeekFile(readFileSync(filename, "utf8"));
if (operation === "edit") {
  let state = plan.setPickDay(restored.state, restored.state.picks[0].key, "Thursday");
  if (state.picks.length > 1)
    state = plan.setPickDay(state, state.picks.at(-1).key, null);
  const output = week.makeWeekFile({...restored, state}, new Date(restored.savedAt));
  const reopened = week.readWeekFile(output.text);
  const calendar = createRequire(import.meta.url)(resolve(root, "static/calendar.js"));
  const options = {id: restored.calendarId, createdAt: new Date(restored.receivedAt)};
  const before = calendar.createWeekExport(state, options).download(state, plan.weekRows(state));
  const after = calendar.createWeekExport(reopened.state, options)
    .download(reopened.state, plan.weekRows(reopened.state));
  console.log(JSON.stringify({restored, state, reopened, output, before, after}));
} else {
  console.log(JSON.stringify(restored));
}
"""

GUARD = r"""
import fs from "node:fs";
import child from "node:child_process";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import {syncBuiltinESMExports} from "node:module";
function refuse(name) {
  return () => {
    fs.appendFileSync(process.env.TASTETABLE_WEEK_EFFECT_LOG, name + "\n");
    throw new Error("Receiver refused unexpected external effect: " + name);
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


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def snapshot(root: Path) -> dict:
    result = {}
    for path in sorted(root.rglob("*")):
        key = str(path.relative_to(root))
        if path.is_symlink():
            result[key] = ("link", os.readlink(path))
        elif path.is_file():
            result[key] = ("file", digest(path))
        elif path.is_dir():
            result[key] = ("dir",)
    return result


class NativePlanWeekTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.node = shutil.which("node")
        if cls.node is None:
            raise RuntimeError("Native saved-week receiving requires installed Node.js 18+.")
        cls.source_before = {name: digest(ROOT / name) for name in SOURCE_PATHS}
        cls.envelopes = {}
        env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
        for name in ("rosa", "mei"):
            result = subprocess.run(
                [sys.executable, str(ROOT / "tastetable_cli.py"), "--persona", name],
                cwd=ROOT, env=env, capture_output=True, timeout=20,
            )
            if result.returncode:
                raise AssertionError(result.stderr.decode("utf-8", "replace"))
            cls.envelopes[name] = json.loads(result.stdout)
        cls.authored_profile = {
            "cuisines": [" Japanese ", "Italian"],
            "music": ["海 <keys>\nBjörk"],
            "films": ["Roman Holiday"],
            "constraints": ["soft_foods"],
            "city": "Pasadena",
        }
        for name, city in (("authored", "Pasadena"), ("empty", "No matching fixture city")):
            profile = {**cls.authored_profile, "city": city}
            result = subprocess.run(
                [sys.executable, str(ROOT / "tastetable_cli.py"), "--profile", "-"],
                input=json.dumps(profile, ensure_ascii=False).encode("utf-8"),
                cwd=ROOT, env=env, capture_output=True, timeout=20,
            )
            if result.returncode:
                raise AssertionError(result.stderr.decode("utf-8", "replace"))
            cls.envelopes[name] = json.loads(result.stdout)
        if cls.envelopes["empty"]["response"]["plan"]["meals"]:
            raise AssertionError("Native no-match control unexpectedly returned meals.")
        if cls.envelopes["empty"]["response"]["plan"]["outing"] is not None:
            raise AssertionError("Native no-match control unexpectedly returned an outing.")
        print("NATIVE_WEEK_PRODUCER_CONTROL four actual original CLI results retained; no-match plan empty")

    @classmethod
    def tearDownClass(cls):
        after = {name: digest(ROOT / name) for name in SOURCE_PATHS}
        if after != cls.source_before:
            raise AssertionError("Existing native producer/consumer source changed during receiving.")
        print("NATIVE_WEEK_SOURCE_CONTROL all 12 existing producer/consumer inputs unchanged")

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="tastetable-week-test-")
        self.root = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)
        self.guard = self.root / "effect-guard.mjs"
        self.guard.write_text(GUARD, encoding="utf-8")
        self.effects = self.root / "effects.log"

    def native_file(self, name="mei", filename="native result.json"):
        path = self.root / filename
        path.write_text(
            json.dumps(self.envelopes[name], ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        return path

    def convert(self, source, destination, *, week="2026-12-30", guarded=True, **kwargs):
        env = {**os.environ, "TASTETABLE_WEEK_EFFECT_LOG": str(self.effects)}
        command = [self.node]
        if guarded:
            command += ["--import", str(self.guard)]
        command += [str(COMMAND), "--input", str(source), "--week", week,
                    "--output", str(destination)]
        return subprocess.run(
            command, cwd=self.root, env=env, capture_output=True, timeout=20, **kwargs
        )

    def receive(self, path, operation="read"):
        result = subprocess.run(
            [self.node, "--input-type=module", "-e", CONSUMER, str(ROOT), str(path), operation],
            cwd=self.root, capture_output=True, timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8", "replace"))
        return json.loads(result.stdout)

    def assert_success(self, result):
        self.assertEqual(result.returncode, 0, result.stderr.decode("utf-8", "replace"))
        self.assertFalse(self.effects.exists(), "Converter attempted a provider or process call.")

    def assert_refusal(self, result, code=2):
        self.assertEqual(result.returncode, code, result.stderr.decode("utf-8", "replace"))
        self.assertIn(b"tastetable-week:", result.stderr)
        self.assertEqual(result.stdout, b"")

    def test_raw_native_result_is_not_already_a_saved_week(self):
        source = self.native_file()
        original = source.read_bytes()
        result = subprocess.run(
            [self.node, "--input-type=module", "-e", CONSUMER, str(ROOT), str(source), "read"],
            cwd=self.root, capture_output=True, timeout=20,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn(b"saved-week", result.stderr)
        self.assertEqual(source.read_bytes(), original)
        print("NATIVE_WEEK_RAW_FORMAT_CONTROL current readWeekFile refuses actual original CLI envelope")

    def test_actual_producer_results_become_exact_editable_weeks(self):
        for name, original in self.envelopes.items():
            with self.subTest(producer=name):
                source = self.native_file(name, name + ".json")
                destination = self.root / (name + ".week.json")
                before = source.read_bytes()
                result = self.convert(source, destination)
                self.assert_success(result)
                received = self.receive(destination)
                self.assertEqual(received["inputs"], original["profile"])
                self.assertEqual(received["response"], original["response"])
                self.assertEqual(received["state"]["sourceMode"], "mock")
                self.assertEqual(received["state"]["weekStart"], "2026-12-28")
                expected = len(original["response"]["plan"]["meals"]) + (
                    original["response"]["plan"]["outing"] is not None
                )
                self.assertEqual(len(received["state"]["picks"]), expected)
                self.assertEqual(
                    received["state"]["assignments"],
                    {pick["key"]: pick["originalDay"] for pick in received["state"]["picks"]},
                )
                self.assertEqual(source.read_bytes(), before)
        print("NATIVE_WEEK_PIPELINE_CONTROL actual rosa/mei/authored/no-match outputs accepted unchanged")

    def test_existing_consumer_can_move_resave_and_preserve_calendar_identity(self):
        source = self.native_file()
        destination = self.root / "editable.json"
        self.assert_success(self.convert(source, destination))
        observed = self.receive(destination, "edit")
        self.assertEqual(observed["state"], observed["reopened"]["state"])
        self.assertEqual(observed["before"], observed["after"])
        self.assertEqual(observed["reopened"]["response"], self.envelopes["mei"]["response"])
        self.assertEqual(observed["reopened"]["inputs"], self.envelopes["mei"]["profile"])
        self.assertEqual(
            observed["reopened"]["calendarId"], observed["restored"]["calendarId"]
        )
        self.assertIn("Thursday", observed["state"]["assignments"].values())
        self.assertIn(None, observed["state"]["assignments"].values())
        self.assertIn("BEGIN:VEVENT\r\n", observed["after"]["text"])
        print("NATIVE_WEEK_CONSUMER_CONTROL original move/resave/reopen and exact calendar bytes agree")

    def test_literal_response_fields_and_original_order_survive(self):
        envelope = copy.deepcopy(self.envelopes["mei"])
        literal = '海 café & <script>alert("literal")</script>\nSecond line — α'
        envelope["response"]["plan"]["meals"][0]["name"] = literal
        envelope["response"]["plan"]["meals"][0]["why"] = literal + "\nOriginal explanation."
        envelope["response"]["trace"][0]["args"] = [None, literal, {"original": True}]
        envelope["response"]["model_message"] = literal
        source = self.root / "literal.json"
        source.write_text(json.dumps(envelope, ensure_ascii=False), encoding="utf-8")
        before = source.read_bytes()
        destination = self.root / "literal.week.json"
        self.assert_success(self.convert(source, destination, week="0001-01-01"))
        received = self.receive(destination)
        self.assertEqual(received["response"], envelope["response"])
        self.assertEqual(received["inputs"], envelope["profile"])
        self.assertEqual(received["state"]["weekStart"], "0001-01-01")
        self.assertEqual(source.read_bytes(), before)

    def test_incompatible_complete_results_and_dates_publish_nothing(self):
        alterations = {
            "mode": lambda e: e["provenance"].update(mode="live"),
            "policy": lambda e: e["provenance"].update(policy="AnotherModel"),
            "transport": lambda e: e["provenance"].update(transport="NetworkTransport"),
            "data": lambda e: e["provenance"].update(data="verified live venues"),
            "checks": lambda e: e["provenance"].update(checks="clinical validation"),
            "mock": lambda e: e["response"].update(mock=False),
            "missing_marker": lambda e: e["provenance"].pop("checks"),
            "profile_constraints": lambda e: e["profile"].update(constraints=["wheelchair"]),
            "bad_profile": lambda e: e["profile"].update(music=17),
            "late_invalid_trace": lambda e: e["response"]["trace"].append({"tool": "late"}),
            "bad_count": lambda e: e["response"]["comparison"]["grounded"].update(picks="<b>5</b>"),
        }
        for label, alter in alterations.items():
            with self.subTest(label=label):
                envelope = copy.deepcopy(self.envelopes["mei"])
                alter(envelope)
                source = self.root / (label + ".json")
                source.write_text(json.dumps(envelope), encoding="utf-8")
                before = snapshot(self.root)
                result = self.convert(source, self.root / (label + ".week.json"))
                self.assert_refusal(result)
                self.assertEqual(snapshot(self.root), before)
        source = self.native_file()
        for date in ("2026-02-30", "not-a-date", "9999-12-31"):
            with self.subTest(date=date):
                before = snapshot(self.root)
                self.assert_refusal(self.convert(source, self.root / "bad-date.json", week=date))
                self.assertEqual(snapshot(self.root), before)

    def test_existing_outputs_and_input_aliases_are_never_replaced(self):
        source = self.native_file()
        ordinary = self.root / "existing.json"
        ordinary.write_bytes(b"FOREIGN COMPLETED FILE\n")
        hardlink = self.root / "hardlink.json"
        os.link(source, hardlink)
        symlink = self.root / "symlink.json"
        symlink.symlink_to(source)
        dangling = self.root / "dangling.json"
        dangling.symlink_to(self.root / "not-created.json")
        directory = self.root / "existing-directory"
        directory.mkdir()
        for destination in (ordinary, source, hardlink, symlink, dangling, directory):
            with self.subTest(destination=destination.name):
                before = snapshot(self.root)
                self.assert_refusal(self.convert(source, destination))
                self.assertEqual(snapshot(self.root), before)
        missing_parent = self.root / "not-created-parent" / "week.json"
        before = snapshot(self.root)
        self.assert_refusal(self.convert(source, missing_parent), code=1)
        self.assertEqual(snapshot(self.root), before)

    @unittest.skipUnless(os.name == "posix", "RLIMIT_FSIZE is a POSIX receiving control")
    def test_real_partial_write_failure_leaves_no_output_or_temporary_files(self):
        import resource

        source = self.native_file()
        destination = self.root / "partial.week.json"
        before = snapshot(self.root)

        def limited_file_size():
            signal.signal(signal.SIGXFSZ, signal.SIG_IGN)
            resource.setrlimit(resource.RLIMIT_FSIZE, (256, 256))

        result = self.convert(source, destination, guarded=False, preexec_fn=limited_file_size)
        self.assert_refusal(result, code=1)
        self.assertEqual(snapshot(self.root), before)
        self.assert_success(self.convert(source, destination))
        self.assertEqual(self.receive(destination)["response"], self.envelopes["mei"]["response"])

    def test_separate_conversions_get_new_file_identity(self):
        source = self.native_file()
        values = []
        for index in range(2):
            destination = self.root / f"identity-{index}.json"
            self.assert_success(self.convert(source, destination))
            value = self.receive(destination)
            self.assertRegex(value["calendarId"], r"^[0-9a-f]{32}$")
            self.assertEqual(value["receivedAt"], value["savedAt"])
            self.assertRegex(value["receivedAt"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$")
            values.append(value)
        self.assertNotEqual(values[0]["calendarId"], values[1]["calendarId"])
        self.assertEqual(values[0]["response"], values[1]["response"])

    def test_bounded_utf8_input_is_admitted_as_a_whole(self):
        source = self.native_file()
        raw = source.read_bytes()
        source.write_bytes(b"\xef\xbb\xbf" + raw + b" " * (MAX_INPUT_BYTES - len(raw) - 3))
        destination = self.root / "at-limit.json"
        self.assert_success(self.convert(source, destination))
        self.assertEqual(self.receive(destination)["response"], self.envelopes["mei"]["response"])
        for label, data in (
            ("oversize", b" " * (MAX_INPUT_BYTES + 1)),
            ("utf8", raw + b"\xff"),
            ("truncated", raw[:-5]),
            ("trailing", raw + b"{}"),
            ("array", b"[]"),
        ):
            with self.subTest(label=label):
                source = self.root / (label + ".json")
                source.write_bytes(data)
                before = snapshot(self.root)
                self.assert_refusal(self.convert(source, self.root / (label + ".week.json")))
                self.assertEqual(snapshot(self.root), before)

    def test_argument_errors_do_not_wait_for_stdin(self):
        for arguments in (
            [], ["--input", "-"], ["--help", "--unknown"],
            ["--input", "missing.json", "--week", "2026-10-08", "--output", "out.json", "--unknown"],
            ["--input", "missing.json", "--input", "other.json",
             "--week", "2026-10-08", "--output", "out.json"],
        ):
            with self.subTest(arguments=arguments):
                before = snapshot(self.root)
                process = subprocess.Popen(
                    [self.node, str(COMMAND), *arguments], cwd=self.root,
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                )
                try:
                    process.wait(timeout=3)
                    stdout, stderr = process.communicate()
                finally:
                    if process.poll() is None:
                        process.kill()
                        process.communicate()
                self.assertEqual(process.returncode, 2, stderr.decode("utf-8", "replace"))
                self.assertEqual(stdout, b"")
                self.assertIn(b"tastetable-week:", stderr)
                self.assertEqual(snapshot(self.root), before)


if __name__ == "__main__":
    unittest.main(verbosity=2)
