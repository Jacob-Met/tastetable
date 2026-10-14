"""Retain a selected direct child's raw streams and explicit process outcome."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import io
import json
import math
import os
from pathlib import Path
import stat
import subprocess
import sys
import time


def _json(value):
    return json.dumps(value, ensure_ascii=True, sort_keys=True, indent=2) + "\n"


def _save(path, value):
    with path.open("xb") as stream:
        stream.write(_json(value).encode("ascii"))
        stream.flush()
        os.fsync(stream.fileno())


def _utc():
    return datetime.now(timezone.utc).isoformat()


def _error(stage, error):
    return {"stage": stage, "type": type(error).__name__, "message": str(error)}


def _identity(path):
    with path.open("rb") as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode):
            raise OSError("stream is no longer a regular file")
        digest = hashlib.sha256()
        count = 0
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
            count += len(chunk)
        after = os.fstat(stream.fileno())
    fields = ("st_dev", "st_ino", "st_size", "st_mtime_ns")
    if any(getattr(before, key) != getattr(after, key) for key in fields) or count != after.st_size:
        raise OSError("stream changed during identity capture")
    return {"bytes": count, "sha256": digest.hexdigest()}


def _admit(argv, cwd, output, timeout):
    if not isinstance(argv, (list, tuple)) or not argv or any(type(arg) is not str or "\0" in arg for arg in argv) or not argv[0]:
        raise ValueError("command must be a nonempty string sequence without NUL")
    if type(timeout) not in (int, float) or not math.isfinite(timeout) or not 0 < timeout <= 3600:
        raise ValueError("timeout must be finite and greater than zero, at most 3600 seconds")
    working, destination = Path(cwd), Path(output)
    if not working.is_absolute() or not destination.is_absolute() or not destination.name:
        raise ValueError("cwd and output must be absolute paths")
    if not working.is_dir() or not destination.parent.is_dir():
        raise ValueError("cwd and output parent must already be directories")
    if os.path.lexists(destination):
        raise FileExistsError("output already exists")
    return list(argv), working.resolve(strict=True), destination.parent.resolve(strict=True) / destination.name


def capture(argv, *, cwd, output, timeout):
    """Run one command without a shell; retain created evidence on every failure."""
    command, working, destination = _admit(argv, cwd, output, timeout)
    started, clock = _utc(), time.monotonic()
    destination.mkdir(mode=0o700)
    request = {"schema": "hamon.process-capture-request/1", "argv": command,
               "cwd": str(working), "output": str(destination), "timeout_seconds": timeout,
               "python": sys.version, "started_utc": started}
    _save(destination / "REQUEST.json", request)
    record = dict(request, schema="hamon.process-capture/1", pid=None, returncode=None,
                  state="observer_error", observer_errors=[], stdout=None, stderr=None,
                  descendants_observed=False)
    child = None
    with (destination / "stdout").open("xb") as stdout, (destination / "stderr").open("xb") as stderr:
        try:
            child = subprocess.Popen(command, cwd=working, stdin=subprocess.DEVNULL,
                                     stdout=stdout, stderr=stderr, shell=False)
        except OSError as error:
            record["state"] = "spawn_failed"
            record["observer_errors"].append(_error("spawn", error))
        else:
            record["pid"] = child.pid
            try:
                record["returncode"] = child.wait(timeout=timeout)
                record["state"] = "exited"
            except subprocess.TimeoutExpired:
                record["state"] = "timed_out"
                try:
                    child.kill()
                    record["returncode"] = child.wait(timeout=5)
                except (OSError, subprocess.SubprocessError) as error:
                    record["state"] = "observer_error"
                    record["observer_errors"].append(_error("timeout_reap", error))
                    record["returncode"] = child.poll()
            except (OSError, subprocess.SubprocessError) as error:
                record["observer_errors"].append(_error("wait", error))
                try:
                    if child.poll() is None:
                        child.kill()
                    record["returncode"] = child.wait(timeout=5)
                except (OSError, subprocess.SubprocessError) as reap_error:
                    record["observer_errors"].append(_error("error_reap", reap_error))
                    record["returncode"] = child.poll()
        stdout.flush()
        stderr.flush()
    # A file identity is a snapshot, not proof about unobserved descendants.
    if child is None or record["returncode"] is not None:
        for name in ("stdout", "stderr"):
            try:
                record[name] = _identity(destination / name)
            except OSError as error:
                record["state"] = "observer_error"
                record["observer_errors"].append(_error(name + "_identity", error))
    record["finished_utc"] = _utc()
    record["elapsed_seconds"] = time.monotonic() - clock
    _save(destination / "PROCESS.json", record)
    return record


def _emit(text):
    stream = sys.stdout
    try:
        target = stream.buffer if isinstance(stream, io.TextIOWrapper) else stream
        payload = text.encode("utf-8") if target is not stream else text
        if target is None or target.write(payload) != len(payload):
            raise OSError("required stdout was unavailable or accepted a short write")
        target.flush()
    except (OSError, ValueError, AttributeError, TypeError):
        # Do not let interpreter shutdown retry a failed buffered flush and
        # replace the explicit observer status with Python's exit120.
        try:
            if stream is not None:
                stream.close()
        except (OSError, ValueError, AttributeError, TypeError):
            pass
        raise


def _diagnose(error):
    stream = sys.stderr
    try:
        if stream is not None:
            stream.write("Process capture refused: " + json.dumps(str(error), ensure_ascii=True) + "\n")
            stream.flush()
    except (OSError, ValueError, AttributeError, TypeError):
        try:
            if stream is not None:
                stream.close()
        except (OSError, ValueError, AttributeError, TypeError):
            pass


class _Parser(argparse.ArgumentParser):
    def error(self, message):
        raise ValueError(message)


def main(argv=None):
    arguments = list(sys.argv[1:] if argv is None else argv)
    parser = _Parser(add_help=False, description=__doc__)
    parser.add_argument("--cwd", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--timeout", required=True, type=float)
    try:
        if arguments == ["--help"]:
            _emit(parser.format_help() + "\nAppend -- EXECUTABLE [ARG ...]. Existing output refuses.\n")
            return 0
        if "--" not in arguments:
            raise ValueError("expected -- before the selected command")
        boundary = arguments.index("--")
        options = parser.parse_args(arguments[:boundary])
        record = capture(arguments[boundary + 1:], cwd=options.cwd, output=options.out, timeout=options.timeout)
        _emit(_json(record))
    except (OSError, ValueError, TypeError, AttributeError) as error:
        _diagnose(error)
        return 2
    if record["state"] == "timed_out":
        return 124
    if record["state"] != "exited":
        return 2
    return 0 if record["returncode"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
