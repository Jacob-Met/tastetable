"""Build one create-only bundle from explicit local TasteTable profiles.

The existing native producer and saved-week converter own profile admission,
planning, source labels, and saved-week semantics. This command only sequences
those consumers and packages their completed outputs with an ordered index.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile

from tastetable_cli import MAX_PROFILE_BYTES

ROOT = Path(__file__).resolve().parent
MAX_PROFILES = 20
MAX_NATIVE_BYTES = 2 * 1024 * 1024
MAX_WEEK_BYTES = 4 * 1024 * 1024
CHILD_TIMEOUT = 60
BUNDLE_FORMAT = "tastetable.native-batch.v1"
WEEK_CHECK = """
import {pathToFileURL} from 'node:url';
try {
  if (Number(process.versions.node.split('.')[0]) < 18)
    throw new Error('Node.js 18 or newer is required.');
  const {calendarWeek} = await import(pathToFileURL(process.argv[1]).href);
  const days = calendarWeek(process.argv[2]);
  process.stdout.write(JSON.stringify({weekStart: days[0].date, node: process.version}));
} catch (error) {
  process.stderr.write(error.message + '\\n');
  process.exitCode = 2;
}
"""


class InputError(ValueError):
    """Refuse an invalid invocation without publishing a bundle."""


class ItemError(Exception):
    def __init__(self, stage: str, message: str, exit_code: int | None = None):
        super().__init__(message)
        self.stage = stage
        self.exit_code = exit_code


class ParserExit(Exception):
    def __init__(self, status: int):
        self.status = status


def write(fd: int, message: str) -> None:
    data = memoryview(message.encode("utf-8", errors="backslashreplace"))
    while data:
        count = os.write(fd, data)
        if not count:
            raise OSError("output accepted no bytes")
        data = data[count:]


def diagnostic(message: str) -> None:
    try:
        write(2, "tastetable-batch: " + message + "\n")
    except OSError:
        pass


class Parser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise InputError(message)

    def exit(self, status: int = 0, message: str | None = None) -> None:
        if message:
            write(2, message)
        raise ParserExit(status)

    def _print_message(self, message: str, file=None) -> None:
        if message:
            write(1 if file is sys.stdout else 2, message)


class Once(argparse.Action):
    def __call__(self, parser, namespace, values, option_string=None):
        if getattr(namespace, self.dest) is not None:
            raise InputError(f"{option_string} may be supplied only once")
        setattr(namespace, self.dest, values)


def arguments(argv: list[str] | None) -> argparse.Namespace:
    parser = Parser(
        description="Make an ordered ZIP of fictional-fixture plans and editable "
                    "saved weeks for 1–20 explicit local profiles.",
        epilog="Exit 0: all profiles saved. Exit 3: bundle saved with per-profile "
               "failures. Exit 2: invocation refused. Exit 1: setup/publication "
               "failed (a diagnostic identifies any already-published bundle).",
        allow_abbrev=False,
    )
    parser.add_argument("--profile", action="append", required=True, metavar="FILE",
                        help="local regular profile JSON; repeat in the desired order (no stdin)")
    parser.add_argument("--week", action=Once, required=True, metavar="YYYY-MM-DD",
                        help="any date in the requested Monday–Sunday week")
    parser.add_argument("--output", action=Once, required=True, metavar="BUNDLE.zip",
                        help="unused filename in an existing directory; never overwritten")
    parser.add_argument("--node", action=Once, metavar="EXECUTABLE",
                        help="Node.js 18+ executable (default: node from PATH)")
    args = parser.parse_args(argv)
    if not 1 <= len(args.profile) <= MAX_PROFILES:
        raise InputError(f"choose 1–{MAX_PROFILES} profiles")
    if not args.output or args.output == "-":
        raise InputError("choose a new bundle filename; stdout is not an archive destination")
    if args.node == "":
        raise InputError("--node must name an executable")
    return args


def short_error(value: bytes) -> str:
    text = value.decode("utf-8", errors="replace").strip()
    return text[:4096] + (" [diagnostic truncated]" if len(text) > 4096 else "")


def check_week(node: str, anchor: str) -> dict:
    result = subprocess.run(
        [node, "--input-type=module", "--eval", WEEK_CHECK,
         str(ROOT / "static" / "week_plan.mjs"), anchor],
        cwd=ROOT, stdin=subprocess.DEVNULL, capture_output=True, timeout=CHILD_TIMEOUT,
    )
    if result.returncode:
        raise InputError(short_error(result.stderr) or "the existing week model refused the date")
    value = json.loads(result.stdout)
    if not isinstance(value, dict) or not isinstance(value.get("weekStart"), str):
        raise RuntimeError("the existing week model did not return its selected week")
    return value


def capture_profile(filename: str) -> bytes:
    if not filename or filename == "-":
        raise ItemError("read", "choose a local regular profile file; stdin is not accepted")
    path = Path(filename)
    try:
        if not stat.S_ISREG(path.stat().st_mode):
            raise OSError("choose a regular file")
        # Nonblocking open also refuses a raced-in FIFO without waiting for a writer.
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NONBLOCK", 0))
        with os.fdopen(fd, "rb") as stream:
            if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                raise OSError("choose a regular file")
            raw = stream.read(MAX_PROFILE_BYTES + 1)
    except OSError as exc:
        raise ItemError("read", f"cannot capture profile: {exc}") from None
    if len(raw) > MAX_PROFILE_BYTES:
        raise ItemError("read", f"profile exceeds {MAX_PROFILE_BYTES} bytes")
    return raw


def file_pin(path: Path, member: str, maximum: int) -> dict:
    size = path.stat().st_size
    if size > maximum:
        raise OSError(f"completed output exceeds {maximum} bytes")
    raw = path.read_bytes()
    if len(raw) > maximum:
        raise OSError(f"completed output exceeds {maximum} bytes")
    return {"file": member, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}


def produce(position: int, filename: str, stage: Path, node: str,
            anchor: str, week_start: str) -> tuple[dict, list[tuple[Path, str]]]:
    item = {"position": position, "input": {"path": filename}, "status": "failed"}
    phase = "read"
    try:
        raw = capture_profile(filename)
        item["input"].update(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
        work = stage / f"{position:03d}"
        work.mkdir()
        snapshot = work / "profile.json"
        snapshot.write_bytes(raw)
        native = work / "native-plan.json"
        week = work / "saved-week.json"
        phase = "producer"
        with native.open("xb") as output:
            result = subprocess.run(
                [sys.executable, "-B", str(ROOT / "tastetable_cli.py"),
                 "--profile", str(snapshot)],
                cwd=ROOT, stdin=subprocess.DEVNULL, stdout=output,
                stderr=subprocess.PIPE, timeout=CHILD_TIMEOUT,
            )
        if result.returncode:
            raise ItemError(phase, short_error(result.stderr) or "native planning failed",
                            result.returncode)
        native_pin = file_pin(native, f"profiles/{position:03d}/native-plan.json", MAX_NATIVE_BYTES)
        phase = "converter"
        result = subprocess.run(
            [node, str(ROOT / "tools" / "native_plan_to_week.mjs"),
             "--input", str(native), "--week", anchor, "--output", str(week)],
            cwd=ROOT, stdin=subprocess.DEVNULL, capture_output=True, timeout=CHILD_TIMEOUT,
        )
        if result.returncode:
            raise ItemError(phase, short_error(result.stderr) or "saved-week conversion failed",
                            result.returncode)
        converted = json.loads(result.stdout)
        if (not isinstance(converted, dict) or converted.get("weekStart") != week_start
                or not isinstance(converted.get("calendarId"), str)
                or not isinstance(converted.get("createdAt"), str)):
            raise ItemError(phase, "converter receipt does not identify the requested saved week")
        week_pin = file_pin(week, f"profiles/{position:03d}/saved-week.json", MAX_WEEK_BYTES)
        item.update(
            status="saved", nativePlan=native_pin, savedWeek=week_pin,
            conversion={key: converted[key] for key in ("weekStart", "calendarId", "createdAt")},
        )
        return item, [(native, native_pin["file"]), (week, week_pin["file"])]
    except ItemError as exc:
        error = {"stage": exc.stage, "message": str(exc)}
        if exc.exit_code is not None:
            error["exitCode"] = exc.exit_code
        item["error"] = error
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        item["error"] = {"stage": phase, "message": f"{type(exc).__name__}: {exc}"}
    return item, []


def human_index(index: dict) -> str:
    status = {"complete": "ALL PROFILES SAVED", "partial": "PARTIAL BUNDLE",
              "failed": "NO PROFILES SAVED"}[index["status"]]
    lines = [
        "TasteTable native profile bundle",
        status,
        f"Week beginning {index['weekStart']} (selected date {index['requestedWeek']})",
        f"Requested: {index['requested']} | Saved: {index['succeeded']} | Failed: {index['failed']}",
        "",
        "Each saved entry contains the exact native result and an editable saved week.",
        "Extract the bundle, then use Open saved week in the regular TasteTable app.",
        "These are fictional-fixture plans from the existing scripted producer.",
        "Existing heuristic checks are preserved; no provider or venue verification was performed.",
        "Every requested profile appears below in the original argument order.",
        "Input hashes identify captured bytes, which may differ from a file edited afterward.",
        "Calendar identities are independent conversions, including repeated input paths.",
        "",
    ]
    for item in index["entries"]:
        label = json.dumps(item["input"]["path"], ensure_ascii=True)
        lines.append(f"{item['position']:03d}. {item['status'].upper()} — {label}")
        if item["status"] == "saved":
            lines.extend(["  Native result: " + item["nativePlan"]["file"],
                          "  Open saved week: " + item["savedWeek"]["file"]])
        else:
            message = json.dumps(item["error"]["message"], ensure_ascii=True)
            lines.append("  " + item["error"]["stage"] + ": " + message)
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    published = False
    try:
        args = arguments(argv)
        destination = Path(os.path.abspath(args.output))
        if os.path.lexists(destination):
            raise InputError("output already exists; choose a new filename")
        if not destination.parent.is_dir():
            raise InputError("the output parent must already be a directory")
        node = args.node or "node"
        selected = check_week(node, args.week)
        stage = Path(tempfile.mkdtemp(prefix=".tastetable-batch-", dir=destination.parent))
        try:
            entries, members = [], []
            for position, filename in enumerate(args.profile, 1):
                item, files = produce(position, filename, stage, node,
                                      args.week, selected["weekStart"])
                entries.append(item)
                members.extend(files)
            succeeded = sum(item["status"] == "saved" for item in entries)
            failed = len(entries) - succeeded
            outcome = "complete" if not failed else "partial" if succeeded else "failed"
            index = {
                "format": BUNDLE_FORMAT, "status": outcome,
                "requestedWeek": args.week, "weekStart": selected["weekStart"],
                "requested": len(entries), "succeeded": succeeded, "failed": failed,
                "producer": "tastetable_cli.py (existing offline fixtures)",
                "converter": "tools/native_plan_to_week.mjs (existing saved-week codec)",
                "entries": entries,
            }
            completed = stage / "completed.zip"
            with zipfile.ZipFile(completed, "x", compression=zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("index.json", json.dumps(index, ensure_ascii=True, indent=2) + "\n")
                archive.writestr("READ-ME.txt", human_index(index))
                for path, member in members:
                    archive.write(path, member)
            try:
                os.link(completed, destination)
            except FileExistsError:
                raise InputError("output appeared during planning; choose a new filename") from None
            published = True
        finally:
            shutil.rmtree(stage)
        write(1, json.dumps({
            "output": str(destination), "format": BUNDLE_FORMAT, "status": outcome,
            "requested": len(entries), "succeeded": succeeded, "failed": failed,
            "weekStart": selected["weekStart"], "index": "index.json",
        }, ensure_ascii=True) + "\n")
        if failed:
            diagnostic(f"bundle saved with {failed} failed profile(s); inspect index.json or READ-ME.txt")
        return 3 if failed else 0
    except ParserExit as exc:
        return exc.status
    except Exception as exc:
        prefix = (
            "Bundle was created at " + json.dumps(str(destination), ensure_ascii=True)
            + ", but final cleanup or receipt delivery failed: "
        ) if published else ""
        diagnostic(prefix + str(exc))
        return 1 if published or not isinstance(exc, InputError) else 2


if __name__ == "__main__":
    raise SystemExit(main())
