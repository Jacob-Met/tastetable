#!/usr/bin/env python3
"""One bounded author installation and exact existing-target refusal; no product/browser run."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import time

STAGE = Path("/Users/me/Developer/tastetable-visit-record-local-c945953fdeb7")
TARGET = Path("/Users/me/Applications/TasteTableVisitRecord-c945953fdeb7")
PYTHON = "/Library/Frameworks/Python.framework/Versions/3.13/bin/python3"
CAP = 2 * 1024 * 1024

def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def pin_bytes(data):
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
            "git_blob": hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()}

def read_file(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_size > CAP:
        raise ValueError("Unexpected input file: " + str(path))
    with path.open("rb") as stream:
        data = stream.read(CAP + 1)
    if len(data) != info.st_size:
        raise ValueError("Input changed while reading: " + str(path))
    return data

def census(root):
    if not root.exists():
        return []
    result = []
    for directory, folders, files in os.walk(root, followlinks=False):
        for name in folders:
            if (Path(directory) / name).is_symlink():
                raise ValueError("Linked directory in owned target")
        for name in sorted(files):
            path = Path(directory) / name
            data = read_file(path)
            info = path.lstat()
            result.append({"path": path.relative_to(root).as_posix(), **pin_bytes(data),
                           "mode": format(stat.S_IMODE(info.st_mode), "04o"),
                           "mtime_ns": str(info.st_mtime_ns)})
    return sorted(result, key=lambda row: row["path"])

def guard():
    disk = shutil.disk_usage(STAGE).free
    result = subprocess.run(["/usr/bin/vm_stat"], capture_output=True, check=True, timeout=5)
    raw = result.stdout.decode("ascii")
    page_size = int(re.search(r"page size of (\d+) bytes", raw).group(1))
    memory = page_size * sum(int(re.search(re.escape(key) + r":\s+(\d+)\.", raw).group(1))
        for key in ("Pages free", "Pages inactive", "Pages speculative"))
    if disk < 256 * 1024 * 1024 or memory < 2 * 1024 * 1024 * 1024:
        raise ValueError("Author initial capacity floor not met")
    return {"free_disk_bytes": disk, "conservative_memory_bytes": memory,
            "vm_stat_exit": result.returncode}

def new_file(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
        os.fchmod(stream.fileno(), 0o444)
    return {"path": path.relative_to(STAGE).as_posix(), **pin_bytes(data)}

def invoke(label, command, evidence):
    started = stamp()
    tick = time.monotonic()
    child = subprocess.Popen(command, cwd="/tmp", stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             start_new_session=True)
    timed_out = False
    try:
        stdout, stderr = child.communicate(timeout=20)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(child.pid, signal.SIGKILL)
        stdout, stderr = child.communicate(timeout=5)
    logs = [new_file(evidence / (label + ".stdout.txt"), stdout),
            new_file(evidence / (label + ".stderr.txt"), stderr)]
    try:
        os.kill(child.pid, 0)
        absent = False
    except ProcessLookupError:
        absent = True
    return {"label": label, "command": command, "cwd": "/tmp", "pid": child.pid,
            "started_at": started, "finished_at": stamp(),
            "elapsed_seconds": time.monotonic() - tick, "exit_code": child.returncode,
            "timed_out": timed_out, "pid_absent": absent, "logs": logs,
            "stdout": stdout.decode("utf-8", "strict"),
            "stderr": stderr.decode("utf-8", "strict")}

def main():
    receipt = {"format": "tastetable.visit-record-local-author.v1", "started_at": stamp(),
               "controller_pid": os.getpid(), "stage": str(STAGE), "target": str(TARGET),
               "no_server_or_browser_invocation": True, "calls": [], "status": "FAIL"}
    receipt["admission"] = guard()
    if os.path.lexists(TARGET):
        raise FileExistsError("Target exists before the one author installation; no writes made")
    before = census(STAGE)
    if sum(p["bytes"] for p in before) > CAP // 2:
        raise ValueError("Author source stage leaves insufficient bounded evidence room")
    receipt["stage_before"] = before
    evidence = STAGE / "author"
    os.mkdir(evidence, 0o700)
    command = [PYTHON, "-I", "-B", str(STAGE / "source" / "install.py"),
               "--capsule", str(STAGE / "ORIGINAL-CAPSULE.json")]
    try:
        first = invoke("install", command, evidence)
        receipt["calls"].append(first)
        if first["exit_code"] != 0 or first["timed_out"] or not first["pid_absent"] or first["stderr"]:
            raise ValueError("The one installation did not complete cleanly")
        installation = json.loads(first["stdout"])
        if installation["status"] != "installed":
            raise ValueError("Unexpected installer status")
        receipt["installation"] = installation
        installed = census(TARGET)
        receipt["installed_after_success"] = installed
        marker = json.loads(read_file(TARGET / "INSTALLATION.json"))
        declared = {row["path"]: row for row in marker["files"]}
        if len(installed) != len(declared) + 1 or installation["files_including_marker"] != len(installed):
            raise ValueError("Actual installed file count differs from the recorded completion")
        for row in installed:
            if row["path"] != "INSTALLATION.json" and row != declared[row["path"]]:
                raise ValueError("An actual installed file differs from its recorded identity")
        second = invoke("existing-target-refusal", command, evidence)
        receipt["calls"].append(second)
        if (second["exit_code"] != 1 or second["timed_out"] or not second["pid_absent"]
                or second["stdout"] or "Refusing existing target" not in second["stderr"]):
            raise ValueError("Existing-target refusal did not match the literal boundary")
        after = census(TARGET)
        receipt["installed_after_refusal"] = after
        if installed != after:
            raise ValueError("Existing-target refusal changed the installation")
        stage_after = {row["path"]: row for row in census(STAGE)}
        for row in before:
            if stage_after.get(row["path"]) != row:
                raise ValueError("Author invocation changed a preparation input")
        receipt["all_preparation_inputs_unchanged"] = True
        receipt["all_installed_files_unchanged_on_refusal"] = True
        receipt["owned_payload_bytes_before_receipt"] = sum(row["bytes"] for row in stage_after.values()) + sum(row["bytes"] for row in after)
        receipt["budget_bytes"] = CAP
        receipt["status"] = "PASS"
    except Exception as error:
        receipt["error"] = str(error)
    receipt["finished_at"] = stamp()
    encoded = (json.dumps(receipt, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    used = sum(row["bytes"] for row in census(STAGE)) + sum(row["bytes"] for row in census(TARGET))
    if used + len(encoded) > CAP:
        raise ValueError("Receipt would exceed the owned cap; complete receipt follows stdout: "
                         + json.dumps(receipt, ensure_ascii=False))
    receipt_pin = new_file(STAGE / "AUTHOR-RECEIPT.json", encoded)
    print(json.dumps({"status": receipt["status"], "controller_pid": os.getpid(),
                      "receipt": receipt_pin, "calls": [{"pid": row["pid"], "exit_code": row["exit_code"],
                      "timed_out": row["timed_out"], "pid_absent": row["pid_absent"]} for row in receipt["calls"]],
                      "owned_bytes_including_receipt": used + len(encoded),
                      "installed_file_count": len(receipt.get("installed_after_refusal", []))}))
    return 0 if receipt["status"] == "PASS" else 1

if __name__ == "__main__":
    raise SystemExit(main())
