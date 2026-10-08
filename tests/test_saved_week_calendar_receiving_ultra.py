"""Independent saved-week calendar API/CLI receiving, frozen before candidate exposure.

Ordinary cases invoke real Node processes and unchanged native codecs/writer.
Explicit fault cases below replace only delivery-boundary filesystem/stdout
operations in a child process and retain a trace; they are not ordinary I/O.
No provider, calendar application, installed user data or network is used.
"""
from __future__ import annotations

import copy
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "tools" / "saved_week_to_calendar.mjs"
NODE = shutil.which("node") or "node"
ID = "0123456789abcdef0123456789abcdef"
NEW_ID = "f" * 32
RECEIVED = "2027-12-31T23:59:59.789Z"
SAVED = "2028-02-27T19:08:07.006Z"
CREATED_PREFIX = (
    "tastetable-calendar: Calendar was created, but final cleanup or receipt delivery failed: "
)
NATIVE_PINS = {
    "static/week_plan.mjs": "8ed28163e0273c510fdd8e6f7c5d1c8476efb862",
    "static/week_file.mjs": "420ddb8f63fca264dcf97be7147801105696155d",
    "static/calendar.js": "dbed22d2cb91090bccec9472fbffd2854eed2722",
    "tests/fixtures/saved-week-response.json": "eca4eee4d93d0046833fc798e6c34bf87879c858",
}
RECEIPT_KEYS = {
    "schema", "input", "inputBytes", "inputSha256", "output", "outputBytes",
    "outputSha256", "suggestedFilename", "weekStart", "count", "calendarId",
    "identitySource", "receivedAt", "savedAt", "source", "preview",
}

NODE_ORACLE = r"""
import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {createRequire} from "node:module";
const root = process.argv[1], req = JSON.parse(fs.readFileSync(0, "utf8"));
const {readWeekFile} = await import(pathToFileURL(path.join(root, "static/week_file.mjs")));
const {weekRows} = await import(pathToFileURL(path.join(root, "static/week_plan.mjs")));
const require = createRequire(import.meta.url);
const {createWeekExport} = require(path.join(root, "static/calendar.js"));
try {
  const loaded = readWeekFile(req.text), id = req.id ?? loaded.calendarId;
  const rows = weekRows(loaded.state);
  const writer = createWeekExport(loaded.state, {id, createdAt: new Date(loaded.receivedAt)});
  console.log(JSON.stringify({ok:true, calendar:writer.download(loaded.state, rows),
    preview:writer.preview(loaded.state, rows), source:writer.source,
    weekStart:loaded.state.weekStart, receivedAt:loaded.receivedAt, savedAt:loaded.savedAt,
    calendarId:id, assignments:loaded.state.assignments}));
} catch (error) { console.log(JSON.stringify({ok:false, error:String(error.message)})); }
"""

NODE_API = r"""
import fs from "node:fs";
import path from "node:path";
import {pathToFileURL} from "node:url";
const root = process.argv[1], req = JSON.parse(fs.readFileSync(0, "utf8"));
const {prepareSavedWeekCalendar} = await import(pathToFileURL(path.join(root, "tools/saved_week_to_calendar.mjs")));
try {
  const value = prepareSavedWeekCalendar(req.text, req.options);
  console.log(JSON.stringify({ok:true, value, frozen:{
    result:Object.isFrozen(value), calendar:Object.isFrozen(value.calendar),
    preview:Object.isFrozen(value.preview), records:value.preview.every(Object.isFrozen)}}));
} catch (error) { console.log(JSON.stringify({ok:false, error:String(error.message)})); }
"""

# Synthetic delivery faults only. This fixture never changes candidate source.
# Both fs callback/sync and fs/promises are covered so the oracle does not select
# the author's implementation style. Native link and publication remain real.
DELIVERY_PRELOAD = r"""
const fs = require("node:fs"), fsp = require("node:fs/promises");
const path = require("node:path"), crypto = require("node:crypto");
const {syncBuiltinESMExports} = require("node:module");
const mode = process.env.TT_REVIEW_FAULT, out = path.resolve(process.env.TT_REVIEW_OUTPUT);
const tracePath = process.env.TT_REVIEW_TRACE;
const realWrite = fs.writeFileSync.bind(fs);
const trace = {mode, linkCalls:[], published:false, cleanupAttempts:0, stdoutAttempts:0,
  initialEntries:fs.readdirSync(path.dirname(out))};
let staged = null, stageContainer = null;
const norm = p => path.resolve(String(p));
function failure(message, code) { return Object.assign(new Error(message), {code}); }
function beforeLink(a,b) {
  if (norm(b) !== out) return;
  staged = norm(a);
  stageContainer = path.dirname(staged) === path.dirname(out) ? staged : path.dirname(staged);
  const openStageFds = fs.readdirSync("/proc/self/fd").filter(fd => {
    try { return fs.readlinkSync("/proc/self/fd/" + fd) === staged; } catch { return false; }
  });
  trace.linkCalls.push({stage:staged, stageContainer, output:norm(b), openStageFds,
    regularStage:fs.lstatSync(a).isFile(),
    sha256:crypto.createHash("sha256").update(fs.readFileSync(a)).digest("hex")});
  if (mode === "race") realWrite(out, "independent competing destination\n", {flag:"wx"});
  if (mode === "link-failure") throw failure("independent unavailable hard link", "EXDEV");
}
function afterLink(b) { if (norm(b) === out) trace.published = true; }
const linkSync = fs.linkSync;
fs.linkSync = function(a,b) { beforeLink(a,b); const v=linkSync.call(this,a,b); afterLink(b); return v; };
const link = fs.link;
fs.link = function(a,b,cb) {
  try { beforeLink(a,b); } catch(e) { queueMicrotask(()=>cb(e)); return; }
  return link.call(this,a,b,e=>{ if(!e) afterLink(b); cb(e); });
};
const plink = fsp.link;
fsp.link = async function(a,b) { beforeLink(a,b); const v=await plink.call(this,a,b); afterLink(b); return v; };
function cleanup(p) {
  if (trace.published && [staged, stageContainer].includes(norm(p))) {
    trace.cleanupAttempts++;
    if (mode === "cleanup") throw failure("independent stage cleanup refusal", "EPERM");
  }
}
for (const name of ["unlinkSync", "rmSync"]) {
  const original=fs[name];
  fs[name]=function(p,...args) { cleanup(p); return original.call(this,p,...args); };
}
for (const name of ["unlink", "rm"]) {
  const original=fs[name];
  fs[name]=function(p,...args) {
    try { cleanup(p); } catch(e) { queueMicrotask(()=>args.at(-1)(e)); return; }
    return original.call(this,p,...args);
  };
  const poriginal=fsp[name];
  fsp[name]=async function(p,...args) { cleanup(p); return await poriginal.call(this,p,...args); };
}
const writeSync = fs.writeSync;
fs.writeSync = function(fd, ...args) {
  if (fd === 1 && trace.published && mode === "receipt") {
    trace.stdoutAttempts++;
    throw failure("independent receipt delivery refusal", "EPIPE");
  }
  return writeSync.call(this, fd, ...args);
};
const write = process.stdout.write;
process.stdout.write = function(...args) {
  if (trace.published && mode === "receipt") {
    trace.stdoutAttempts++;
    throw failure("independent receipt delivery refusal", "EPIPE");
  }
  return write.apply(this,args);
};
syncBuiltinESMExports();
process.on("exit",()=>realWrite(tracePath, JSON.stringify(trace)+"\n"));
"""

def _sha(data):
    return hashlib.sha256(data).hexdigest()


def _git(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def _run_node(script, value):
    p = subprocess.run(
        [NODE, "--input-type=module", "-e", script, str(ROOT)],
        input=json.dumps(value, ensure_ascii=True).encode(), capture_output=True,
        cwd=ROOT, timeout=15,
    )
    assert p.returncode == 0, (p.returncode, p.stdout.decode(errors="replace"), p.stderr.decode(errors="replace"))
    return json.loads(p.stdout)


def _oracle(text, identifier=None):
    return _run_node(NODE_ORACLE, {"text": text, "id": identifier})


def _api(text, **options):
    return _run_node(NODE_API, {"text": text, "options": options})


def _text(value, bom=False):
    return ("\ufeff" if bom else "") + json.dumps(value, ensure_ascii=True, separators=(",", ":")) + "\n"


@pytest.fixture
def week():
    response = json.loads((ROOT / "tests/fixtures/saved-week-response.json").read_text())
    # Keep native fictional provenance, but distinguish independent text and
    # occurrence arrangement from the inherited source/author's expected values.
    response["plan"]["meals"][0]["name"] = "Independent café, bowl; 🦉 " + "界" * 28
    response["plan"]["meals"][1]["why"] = "Literal comma, semicolon; slash\\ and line\r\nSecond line."
    response["plan"]["notes"] = ["Independent local review; no booking.", "<markup stays text>"]
    return {
        "format": "tastetable.saved-week.v1",
        "receivedAt": RECEIVED, "savedAt": SAVED, "calendarId": ID,
        "inputs": {"cuisines": ["Cuban"], "music": ["Celia Cruz"], "films": [],
                   "constraints": copy.deepcopy(response["comparison"]["constraints"]), "city": "Pasadena"},
        "response": response,
        "week": {"start": "2028-02-28", "assignments": {
            "pick-0": "Thursday", "pick-1": "Monday", "pick-2": None,
            "pick-3": None, "pick-4": "Monday",
        }},
    }


@pytest.fixture(autouse=True)
def source_custody(request, capsys):
    paths = [ROOT / p for p in NATIVE_PINS]
    if CLI.exists():
        paths.append(CLI)
    before = {str(p.relative_to(ROOT)): _sha(p.read_bytes()) for p in paths}
    yield
    after = {str(p.relative_to(ROOT)): _sha(p.read_bytes()) for p in paths}
    assert after == before
    with capsys.disabled():
        print("TASTETABLE_INDEPENDENT_SOURCE " + json.dumps({
            "case": request.node.nodeid, "sha256": after, "unchanged": after == before,
        }, sort_keys=True), flush=True)


def _snapshot(directory):
    result = {}
    for p in sorted(directory.rglob("*")):
        st = p.lstat()
        if stat.S_ISLNK(st.st_mode):
            value = ["symlink", os.readlink(p)]
        elif stat.S_ISREG(st.st_mode):
            value = ["file", _sha(p.read_bytes()), st.st_size]
        elif stat.S_ISDIR(st.st_mode):
            continue
        else:
            value = ["special", stat.S_IFMT(st.st_mode)]
        result[str(p.relative_to(directory))] = value + [st.st_ino, st.st_mtime_ns]
    return result


def _files(tmp_path, text):
    directory = tmp_path / "files"
    directory.mkdir()
    source = directory / "arranged week.json"
    source.write_bytes(text.encode("utf-8"))
    return directory, source, directory / "calendar result.ics"


def _cli(args, *, cwd=ROOT, preload=None, extra_env=None, timeout=15):
    command = [NODE]
    if preload is not None:
        command += ["--require", str(preload)]
    command += [str(CLI), *map(str, args)]
    env = os.environ.copy()
    env.update(extra_env or {})
    return subprocess.run(command, input=b"", capture_output=True, cwd=cwd, env=env, timeout=timeout)


def _assert_receipt(p, source, output, text, expected, identity="saved", identifier=ID):
    assert p.returncode == 0, (p.returncode, p.stdout, p.stderr)
    assert p.stderr == b""
    assert p.stdout.endswith(b"\n") and len(p.stdout.splitlines()) == 1
    r = json.loads(p.stdout)
    assert set(r) == RECEIPT_KEYS
    content = expected["calendar"]["text"].encode("utf-8")
    assert output.read_bytes() == content
    assert r == {
        "schema": "tastetable.saved-week-calendar-receipt.v1",
        "input": os.path.abspath(source), "output": os.path.abspath(output),
        "inputBytes": len(text.encode()), "inputSha256": _sha(text.encode()),
        "outputBytes": len(content), "outputSha256": _sha(content),
        "suggestedFilename": expected["calendar"]["filename"],
        "weekStart": "2028-02-28", "count": 3, "calendarId": identifier,
        "identitySource": identity, "receivedAt": RECEIVED, "savedAt": SAVED,
        "source": expected["source"], "preview": expected["preview"],
    }
    return r


def _manual_native_assertions(result):
    assert result["ok"] is True
    preview = result["preview"]
    assert [r["key"] for r in preview] == ["pick-1", "pick-4", "pick-0"]
    assert [r["date"] for r in preview] == ["2028-02-28", "2028-02-28", "2028-03-02"]
    assert [r["endDate"] for r in preview] == ["2028-02-29", "2028-02-29", "2028-03-03"]
    assert [r["originalDay"] for r in preview] == ["Wednesday", "Saturday", "Monday"]
    assert [r["kind"] for r in preview] == ["restaurant", "outing", "restaurant"]
    wire = result["calendar"]["text"].encode()
    assert wire.endswith(b"\r\n") and b"\n" not in wire.replace(b"\r\n", b"")
    assert all(len(line) <= 75 for line in wire.split(b"\r\n"))
    assert b"\r\n " in wire  # actual folding, including multibyte source
    unfolded = wire.replace(b"\r\n ", b"").decode()
    assert re.findall(r"^UID:([^\r\n]+)\r?$", unfolded, re.MULTILINE) == [
        result["calendarId"] + "-20280228-" + key + "@tastetable.invalid"
        for key in ["pick-1", "pick-4", "pick-0"]
    ]
    assert unfolded.count("DTSTAMP:20271231T235959Z\r\n") == 3
    assert "pick-2@tastetable.invalid" not in unfolded and "pick-3@tastetable.invalid" not in unfolded
    assert unfolded.count("STATUS:TENTATIVE\r\n") == 3
    assert unfolded.count("TRANSP:TRANSPARENT\r\n") == 3
    assert "Literal comma\\, semicolon\\; slash\\\\ and line\\nSecond line." in unfolded
    assert "Not medical or dietary advice" in unfolded
    assert result["calendar"]["count"] == 3


@pytest.mark.parametrize("live", [False, True])
def test_native_codec_writer_controls_and_manual_occurrences(week, live):
    for path, expected in NATIVE_PINS.items():
        assert _git((ROOT / path).read_bytes()) == expected
    week["response"]["mock"] = not live
    result = _oracle(_text(week))
    _manual_native_assertions(result)
    assert ("DEMO:" in result["source"]) is (not live)


@pytest.mark.parametrize("kind", ["mock", "live", "bom"])
def test_public_api_preserves_exact_native_bytes_and_frozen_receipt_fields(week, kind):
    if kind == "live":
        week["response"]["mock"] = False
    text = _text(week, bom=kind == "bom")
    expected = _oracle(text)
    result = _api(text)
    assert result["ok"] is True
    value = result["value"]
    assert result["frozen"] == dict.fromkeys(["result", "calendar", "preview", "records"], True)
    for key in ["calendar", "preview", "source", "weekStart", "receivedAt", "savedAt", "calendarId"]:
        assert value[key] == expected[key]
    assert value["identitySource"] == "saved"
    assert value["inputBytes"] == len(text.encode())
    assert value["inputSha256"] == _sha(text.encode())
    wire = expected["calendar"]["text"].encode()
    assert value["outputBytes"] == len(wire)
    assert value["outputSha256"] == _sha(wire)
    _manual_native_assertions(expected)


@pytest.mark.parametrize("bom", [False, True])
def test_actual_cli_exact_file_receipt_and_repeat_identity(week, tmp_path, bom):
    text = _text(week, bom=bom)
    expected = _oracle(text)
    directory, source, output = _files(tmp_path, text)
    before = _snapshot(directory)
    p = _cli(["--input", source.name, "--output", output.name], cwd=directory)
    _assert_receipt(p, source, output, text, expected)
    second = directory / "second.ics"
    q = _cli(["--output", second, "--input", source])
    _assert_receipt(q, source, second, text, expected)
    assert output.read_bytes() == second.read_bytes()
    after = _snapshot(directory)
    assert {k: after[k] for k in before} == before
    assert set(after) - set(before) == {output.name, second.name}


def test_null_identity_requires_explicit_api_choice_and_retains_timestamps(week):
    week["calendarId"] = None
    text = _text(week)
    assert _api(text)["ok"] is False
    result = _api(text, newCalendarId=NEW_ID)
    assert result["ok"] is True
    assert result["value"]["identitySource"] == "new"
    expected = _oracle(text, NEW_ID)
    for key in ["calendar", "preview", "calendarId", "receivedAt", "savedAt"]:
        assert result["value"][key] == expected[key]


@pytest.mark.parametrize("override", [ID, NEW_ID])
def test_existing_identity_refuses_even_equal_api_override(week, override):
    assert _api(_text(week), newCalendarId=override)["ok"] is False


@pytest.mark.parametrize("bad_id", ["", "ABCDEF0123456789ABCDEF0123456789AB", "a" * 31, 7, None])
def test_new_api_identity_must_be_explicit_native_identifier(week, bad_id):
    week["calendarId"] = None
    assert _api(_text(week), newCalendarId=bad_id)["ok"] is False


def test_actual_cli_explicit_new_calendar_repeated_creations_are_distinct(week, tmp_path):
    week["calendarId"] = None
    text = _text(week)
    directory, source, output = _files(tmp_path, text)
    before = _snapshot(directory)
    refused = _cli(["--input", source, "--output", output])
    assert refused.returncode == 2 and refused.stdout == b""
    assert _snapshot(directory) == before
    identities = []
    for target in [output, directory / "another.ics"]:
        p = _cli(["--input", source, "--output", target, "--new-calendar"])
        assert p.returncode == 0, (p.returncode, p.stdout, p.stderr)
        identifier = json.loads(p.stdout)["calendarId"]
        assert re.fullmatch("[0-9a-f]{32}", identifier)
        identities.append(identifier)
        _assert_receipt(p, source, target, text, _oracle(text, identifier), "new", identifier)
    assert len(set(identities)) == 2
    assert _snapshot(directory)[source.name] == before[source.name]


BAD_NATIVE = [
    "unknown-source", "all-omitted", "invalid-date", "extra-assignment",
    "missing-calendar-id", "mismatched-constraints", "control-in-omitted-pick",
    "surrogate-in-source", "duplicate-original-slot", "empty-plan",
]


def _bad_week(week, case):
    v = copy.deepcopy(week)
    if case == "unknown-source":
        del v["response"]["mock"]
    elif case == "all-omitted":
        v["week"]["assignments"] = dict.fromkeys(v["week"]["assignments"], None)
    elif case == "invalid-date":
        v["week"]["start"] = "2028-02-30"
    elif case == "extra-assignment":
        v["week"]["assignments"]["pick-999"] = "Monday"
    elif case == "missing-calendar-id":
        del v["calendarId"]
    elif case == "mismatched-constraints":
        v["inputs"]["constraints"] = []
    elif case == "control-in-omitted-pick":
        v["response"]["plan"]["meals"][2]["why"] = "not visible\u0000still invalid"
    elif case == "surrogate-in-source":
        v["response"]["plan"]["meals"][0]["name"] = "\ud800"
    elif case == "duplicate-original-slot":
        v["response"]["plan"]["meals"][1]["day"] = "Monday"
    elif case == "empty-plan":
        v["response"]["plan"]["meals"] = []
        v["response"]["plan"]["outing"] = None
        v["week"]["assignments"] = {}
    else:
        raise AssertionError(case)
    return _text(v)


@pytest.mark.parametrize("case", BAD_NATIVE)
def test_original_native_rejects_whole_invalid_arrangement_control(week, case):
    assert _oracle(_bad_week(week, case))["ok"] is False


@pytest.mark.parametrize("case", BAD_NATIVE)
def test_public_api_and_cli_refuse_whole_native_invalid_input(week, tmp_path, case):
    text = _bad_week(week, case)
    directory, source, output = _files(tmp_path, text)
    before = _snapshot(directory)
    assert _api(text)["ok"] is False
    p = _cli(["--input", source, "--output", output])
    assert p.returncode == 2 and p.stdout == b"", (p.returncode, p.stdout, p.stderr)
    assert p.stderr.startswith(b"tastetable-calendar: ") and not p.stderr.startswith(CREATED_PREFIX.encode())
    assert _snapshot(directory) == before


@pytest.mark.parametrize("case", ["trailing-junk", "double-bom", "invalid-utf8", "overlong-utf8", "utf8-surrogate", "oversize"])
def test_actual_cli_strict_bytes_and_size_are_atomic(week, tmp_path, case):
    text = _text(week)
    data = text.encode()
    if case == "trailing-junk":
        data += b"{}"
    elif case == "double-bom":
        data = b"\xef\xbb\xbf\xef\xbb\xbf" + data
    elif case == "invalid-utf8":
        data = data.replace(b"Pasadena", b"Pasa\xffdena")
    elif case == "overlong-utf8":
        data = data.replace(b"Pasadena", b"Pasa\xc0\xafdena")
    elif case == "utf8-surrogate":
        data = data.replace(b"Pasadena", b"Pasa\xed\xa0\x80dena")
    elif case == "oversize":
        data += b" " * (4 * 1024 * 1024 + 1 - len(data))
    directory, source, output = _files(tmp_path, text)
    source.write_bytes(data)
    before = _snapshot(directory)
    p = _cli(["--input", source, "--output", output])
    assert p.returncode == 2 and p.stdout == b"", (p.returncode, p.stderr)
    assert _snapshot(directory) == before


def test_exact_four_mib_valid_input_is_accepted_without_rewrite(week, tmp_path):
    text = _text(week)
    text += " " * (4 * 1024 * 1024 - len(text.encode()))
    directory, source, output = _files(tmp_path, text)
    before = _snapshot(directory)
    expected = _oracle(text)
    p = _cli(["--input", source, "--output", output])
    _assert_receipt(p, source, output, text, expected)
    assert _snapshot(directory)[source.name] == before[source.name]


@pytest.mark.parametrize("case", ["file", "directory", "symlink", "dangling", "hardlink-input", "input-itself"])
def test_occupied_output_and_input_aliases_never_replace(week, tmp_path, case):
    text = _text(week)
    directory, source, output = _files(tmp_path, text)
    if case == "file":
        output.write_bytes(b"preexisting calendar sentinel\n")
    elif case == "directory":
        output.mkdir()
        (output / "keep").write_bytes(b"occupied directory\n")
    elif case == "symlink":
        output.symlink_to(source)
    elif case == "dangling":
        output.symlink_to(directory / "absent-target")
    elif case == "hardlink-input":
        os.link(source, output)
    elif case == "input-itself":
        output = source
    before = _snapshot(directory)
    p = _cli(["--input", source, "--output", output])
    assert p.returncode == 2 and p.stdout == b"", (p.returncode, p.stderr)
    assert _snapshot(directory) == before


@pytest.mark.parametrize("case", ["directory", "fifo", "missing"])
def test_nonregular_or_missing_input_is_bounded_refusal(week, tmp_path, case):
    text = _text(week)
    directory, source, output = _files(tmp_path, text)
    source.unlink()
    if case == "directory":
        source.mkdir()
    elif case == "fifo":
        os.mkfifo(source)
    before = _snapshot(directory)
    p = _cli(["--input", source, "--output", output], timeout=5)
    assert p.returncode == 2 and p.stdout == b"", (p.returncode, p.stderr)
    assert _snapshot(directory) == before


@pytest.mark.parametrize("case", [
    "none", "unknown", "duplicate-input", "duplicate-output", "duplicate-new",
    "help-mixed", "stdin", "existing-new", "missing-output",
])
def test_actual_argument_refusals_leave_no_output(week, tmp_path, case):
    text = _text(week)
    directory, source, output = _files(tmp_path, text)
    args = ["--input", source, "--output", output]
    if case == "none":
        args = []
    elif case == "unknown":
        args += ["--timezone", "UTC"]
    elif case == "duplicate-input":
        args += ["--input", source]
    elif case == "duplicate-output":
        args += ["--output", output]
    elif case == "duplicate-new":
        args += ["--new-calendar", "--new-calendar"]
    elif case == "help-mixed":
        args += ["--help"]
    elif case == "stdin":
        args = ["--input", "-", "--output", output]
    elif case == "existing-new":
        args += ["--new-calendar"]
    elif case == "missing-output":
        args = ["--input", source]
    before = _snapshot(directory)
    p = _cli(args)
    assert p.returncode == 2 and p.stdout == b"", (p.returncode, p.stdout, p.stderr)
    assert _snapshot(directory) == before


def test_help_is_standalone_and_creates_nothing(tmp_path):
    before = _snapshot(tmp_path)
    p = _cli(["--help"], cwd=tmp_path)
    assert p.returncode == 0 and p.stderr == b"" and b"--input" in p.stdout and b"--output" in p.stdout
    assert _snapshot(tmp_path) == before


@pytest.mark.parametrize("mode", ["observe", "race", "link-failure", "cleanup", "receipt"])
def test_explicit_delivery_fault_boundaries_and_completed_file_diagnostic(week, tmp_path, mode, capsys):
    text = _text(week)
    expected = _oracle(text)
    directory, source, output = _files(tmp_path, text)
    before = _snapshot(directory)
    preload = tmp_path / "delivery-preload.cjs"
    preload.write_text(DELIVERY_PRELOAD)
    trace_path = tmp_path / "delivery-trace.json"
    p = _cli(["--input", source, "--output", output], preload=preload, extra_env={
        "TT_REVIEW_FAULT": mode, "TT_REVIEW_OUTPUT": str(output), "TT_REVIEW_TRACE": str(trace_path),
    })
    assert trace_path.is_file(), (p.returncode, p.stdout, p.stderr)
    trace = json.loads(trace_path.read_text())
    assert len(trace["linkCalls"]) == 1, trace
    observed = trace["linkCalls"][0]
    container = Path(observed["stageContainer"])
    assert container.parent == output.parent
    assert container.name not in trace["initialEntries"]
    assert Path(observed["stage"]) == container or Path(observed["stage"]).parent == container
    assert observed["regularStage"] is True
    assert Path(observed["stage"]) not in [source, output]
    assert observed["openStageFds"] == [], trace
    assert observed["sha256"] == _sha(expected["calendar"]["text"].encode())
    assert _snapshot(directory)[source.name] == before[source.name]
    if mode == "observe":
        assert trace["published"] is True
        _assert_receipt(p, source, output, text, expected)
        assert set(_snapshot(directory)) == {source.name, output.name}
    elif mode == "race":
        assert p.returncode == 2 and p.stdout == b"", (p.returncode, p.stderr)
        assert trace["published"] is False
        assert output.read_bytes() == b"independent competing destination\n"
        assert set(_snapshot(directory)) == {source.name, output.name}
        assert not p.stderr.startswith(CREATED_PREFIX.encode())
    elif mode == "link-failure":
        assert p.returncode == 1 and p.stdout == b"", (p.returncode, p.stderr)
        assert trace["published"] is False and not output.exists()
        assert _snapshot(directory) == before
        assert not p.stderr.startswith(CREATED_PREFIX.encode())
    else:
        assert p.returncode == 1 and p.stdout == b"", (p.returncode, p.stdout, p.stderr)
        assert trace["published"] is True
        assert output.read_bytes() == expected["calendar"]["text"].encode()
        assert p.stderr.decode().startswith(CREATED_PREFIX), p.stderr
        if mode == "cleanup":
            assert trace["cleanupAttempts"] >= 1
        else:
            assert trace["stdoutAttempts"] >= 1
    with capsys.disabled():
        print("TASTETABLE_INDEPENDENT_DELIVERY " + json.dumps({
            "mode": mode, "status": p.returncode, "trace": trace,
            "output_sha256": _sha(output.read_bytes()) if output.is_file() else None,
        }, sort_keys=True), flush=True)
