#!/usr/bin/env python3
"""Install the pinned TasteTable visit-record consumer into its exclusive target."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import stat
import subprocess
import sys

INPUTS_SHA256 = "235d59bc7bc2538f8974804ed92198046a990c26e52924c42e37d260c5a75192"
SOURCE_ROOT = Path(__file__).resolve().parent
MAX_FILE_BYTES = 2 * 1024 * 1024

def digest(data):
    return hashlib.sha256(data).hexdigest()

def git_blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()

def read_regular(path, cap=MAX_FILE_BYTES):
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or before.st_size > cap:
        raise ValueError("Expected a bounded regular file: " + str(path))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as stream:
        opened = os.fstat(stream.fileno())
        if (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino):
            raise ValueError("File identity changed while opening: " + str(path))
        data = stream.read(cap + 1)
    after = path.lstat()
    if len(data) > cap or (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (
        after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns
    ):
        raise ValueError("File changed while reading: " + str(path))
    return data

def plain_directory(path):
    for parent in [path, *path.parents]:
        info = parent.lstat()
        if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode):
            raise ValueError("Expected an existing plain directory: " + str(parent))

def check_pin(data, pin, label):
    if len(data) != pin["bytes"] or digest(data) != pin["sha256"]:
        raise ValueError("Byte or SHA256 mismatch: " + label)
    if pin.get("git_blob") and git_blob(data) != pin["git_blob"]:
        raise ValueError("Git blob mismatch: " + label)

def capacity(path, limits):
    disk = shutil.disk_usage(path).free
    proc = subprocess.run(["/usr/bin/vm_stat"], capture_output=True, check=True, timeout=5)
    raw = proc.stdout.decode("ascii", "strict")
    page_size = int(re.search(r"page size of (\d+) bytes", raw).group(1))
    pages = sum(int(re.search(re.escape(key) + r":\s+(\d+)\.", raw).group(1))
                for key in ("Pages free", "Pages inactive", "Pages speculative"))
    memory = pages * page_size
    if disk < limits["free_disk_floor"] or memory < limits["conservative_memory_floor"]:
        raise ValueError("Capacity floor not met: disk=" + str(disk) + ", memory=" + str(memory))
    return {"free_disk_bytes": disk, "conservative_memory_bytes": memory,
            "memory_basis": "vm_stat free + inactive + speculative pages",
            "vm_stat_exit": proc.returncode}

def runtime_identity(config):
    expected = config["runtime"]
    if sys.platform != "darwin" or ".".join(map(str, sys.version_info[:3])) != expected["version"]:
        raise ValueError("This installation requires the specified existing macOS Python runtime")
    actual = Path(sys.executable).resolve()
    if actual != Path(expected["resolved_path"]) or Path(expected["configured_path"]).resolve() != actual:
        raise ValueError("Python path differs from the admitted existing runtime")
    check_pin(read_regular(actual), expected, "existing Python")
    return {"configured_path": expected["configured_path"], "resolved_path": str(actual),
            "version": expected["version"], "bytes": expected["bytes"],
            "sha256": expected["sha256"], "git_blob": expected["git_blob"]}

def write_new(path, data, mode):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
        os.fchmod(stream.fileno(), mode)

def file_pin(path, relative):
    data = read_regular(path)
    info = path.lstat()
    return {"path": relative, "bytes": len(data), "sha256": digest(data), "git_blob": git_blob(data),
            "mode": format(stat.S_IMODE(info.st_mode), "04o"),
            "mtime_ns": str(info.st_mtime_ns)}

def install(capsule_path, requested_target):
    input_data = read_regular(SOURCE_ROOT / "INPUTS.json")
    if digest(input_data) != INPUTS_SHA256:
        raise ValueError("INPUTS.json differs from the maintained installer pin")
    config = json.loads(input_data)
    target = Path(requested_target)
    if str(target) != config["target"]:
        raise ValueError("The target must be the reserved exclusive path: " + config["target"])
    plain_directory(target.parent)
    if os.path.lexists(target):
        raise FileExistsError("Refusing existing target; no file has been changed: " + str(target))
    runtime = runtime_identity(config)
    admission = capacity(target.parent, config["limits"])
    expected_source_names = set(config["source_files"])
    if {p.name for p in SOURCE_ROOT.iterdir()} != expected_source_names:
        raise ValueError("Source directory must contain exactly the six maintained source files")
    source = {name: read_regular(SOURCE_ROOT / name) for name in config["source_files"]}
    if source["INPUTS.json"] != input_data:
        raise ValueError("INPUTS changed during source admission")
    capsule_data = read_regular(capsule_path)
    check_pin(capsule_data, config["original_capsule"], "original-only capsule")
    capsule = json.loads(capsule_data)
    if (capsule["format"] != "tastetable.visit-record-original-capsule.v1"
            or capsule["qualified_parent"] != config["qualified_parent"]
            or capsule["qualified_tree"] != config["qualified_tree"]):
        raise ValueError("Original capsule provenance mismatch")
    expected = {p["path"]: p for p in config["original_files"]}
    originals = {}
    for item in capsule["files"]:
        name = item["path"]
        if name not in expected or name in originals:
            raise ValueError("Unknown or duplicate original capsule path")
        pin = expected[name]
        if any(item.get(k) != pin[k] for k in ("source_path", "git_blob", "bytes", "sha256")):
            raise ValueError("Original capsule identity mismatch: " + name)
        data = item["content"].encode("utf-8", "strict")
        check_pin(data, pin, name)
        originals[name] = data
    if set(originals) != set(expected):
        raise ValueError("Original capsule is incomplete")
    assets = [p for p in expected if not p.startswith("reference/")]
    if set(capsule["original_asset_paths"]) != set(assets):
        raise ValueError("Original app closure differs from the admitted nine files")
    navigation = config["navigation"]
    before = originals[navigation["original_path"]]
    old = navigation["original_span"].encode("utf-8")
    new = navigation["installed_span"].encode("utf-8")
    if before.count(old) != 1 or before.count(new) != 0:
        raise ValueError("Expected exactly one original navigation anchor")
    after = before.replace(old, new, 1)
    if after.replace(new, old, 1) != before:
        raise ValueError("Navigation inverse did not restore the complete original")
    check_pin(after, {"bytes": navigation["installed_bytes"],
                     "sha256": navigation["installed_sha256"]}, "installed navigation HTML")
    template = source["launch.command.in"].decode("utf-8", "strict")
    if template.count("@PYTHON@") != 1 or template.count("@SERVER@") != 1:
        raise ValueError("Unexpected launcher template placeholders")
    entry = template.replace("@PYTHON@", shlex.quote(config["runtime"]["configured_path"]))
    entry = entry.replace("@SERVER@", shlex.quote(str(target / "source" / "server.py"))).encode("utf-8")
    plan = {"app/" + name: data for name, data in originals.items() if name in assets}
    plan["app/" + navigation["original_path"]] = after
    plan["app/index.html"] = source["index.html"]
    plan.update({"source/" + name: data for name, data in source.items()})
    plan.update({"original/" + name: data for name, data in originals.items()})
    plan["original/ORIGINAL-CAPSULE.json"] = capsule_data
    plan[config["entry"]] = entry
    if sum(map(len, plan.values())) > config["limits"]["installed_payload_cap"]:
        raise ValueError("Installed payload exceeds its one-MiB limit")
    # All input bytes and the entire write plan are admitted before this exclusive mkdir.
    os.mkdir(target, 0o700)
    parents = {str(Path(name).parent) for name in plan if str(Path(name).parent) != "."}
    for relative in sorted(parents, key=lambda value: (value.count("/"), value)):
        (target / relative).mkdir(mode=0o700, parents=True, exist_ok=True)
    for name, data in sorted(plan.items()):
        write_new(target / name, data, 0o700 if name == config["entry"] else 0o444)
    files = [file_pin(target / name, name) for name in sorted(plan)]
    marker = {
        "format": "tastetable.visit-record-local-installation.v1",
        "owner": config["owner"], "target": str(target),
        "installed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "qualified_parent": config["qualified_parent"], "qualified_tree": config["qualified_tree"],
        "source_capsule": config["original_capsule"], "runtime": runtime,
        "origin": config["origin"], "entry": config["entry"], "admission": admission,
        "navigation": {**navigation, "whole_file_inverse_exact": True,
                       "unchanged_other_static_files": 7},
        "files": files,
        "recovery": "The exact original source capsule, eleven original files and six maintained source files are retained. An incomplete target is never served or overwritten.",
    }
    marker_data = (json.dumps(marker, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    if sum(map(len, plan.values())) + len(marker_data) > config["limits"]["installed_payload_cap"]:
        raise ValueError("Complete installation would exceed its one-MiB limit; partial target retained")
    # This completion marker is deliberately last. Failure leaves a recoverable partial target.
    write_new(target / "INSTALLATION.json", marker_data, 0o444)
    return {"status": "installed", "target": str(target), "entry": str(target / config["entry"]),
            "origin": config["origin"], "files_including_marker": len(files) + 1,
            "bytes_including_marker": sum(p["bytes"] for p in files) + len(marker_data),
            "marker": file_pin(target / "INSTALLATION.json", "INSTALLATION.json"),
            "navigation_inverse_exact": True, "admission": admission, "runtime": runtime}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capsule", required=True, type=Path, help="Exact original-only JSON capsule")
    parser.add_argument("--target", default="/Users/me/Applications/TasteTableVisitRecord-c945953fdeb7")
    args = parser.parse_args()
    try:
        result = install(args.capsule, args.target)
    except Exception as error:
        print(json.dumps({"status": "refused", "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
