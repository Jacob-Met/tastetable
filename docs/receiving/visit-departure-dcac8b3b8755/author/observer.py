import hashlib, json, os, pathlib, platform, shutil, subprocess, sys, time
sys.dont_write_bytecode = True
packet_path = pathlib.Path("/private/var/tmp/hamon-dcac8b3b8755-taste-departure-author-packet.json")
root = pathlib.Path("/private/var/tmp/hamon-dcac8b3b8755-taste-departure-author-v1")
root.mkdir(exist_ok=False)
source = root / "source"
source.mkdir()
def identity(path):
    data = path.read_bytes()
    st = path.stat()
    return {"bytes":len(data), "sha256":hashlib.sha256(data).hexdigest(),
            "git_blob":hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest(),
            "mode":st.st_mode, "mtime_ns":st.st_mtime_ns, "inode":st.st_ino}
def snapshot():
    return {str(p.relative_to(source)):identity(p) for p in sorted(source.rglob("*")) if p.is_file()}
packet_before = identity(packet_path)
packet = json.loads(packet_path.read_text(encoding="utf-8"))
for member in packet["files"]:
    path = pathlib.PurePosixPath(member["path"])
    if path.is_absolute() or any(part in ("", ".", "..") for part in path.parts):
        raise ValueError("Unsafe source member")
    data = member["content"].encode("utf-8")
    blob = hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()
    if len(data) != member["bytes"] or hashlib.sha256(data).hexdigest() != member["sha256"] or blob != member["git_blob_sha1"]:
        raise ValueError("Source identity mismatch")
    dest = source.joinpath(*path.parts)
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("xb") as stream:
        stream.write(data)
    dest.chmod(0o644)
before = snapshot()
node = shutil.which("node")
if not node:
    raise RuntimeError("Existing Node is required")
version = subprocess.run([node, "--version"], capture_output=True, text=True, timeout=10, check=True).stdout.strip()
command = [node, "--test", "tests/test_visit_record.mjs", "tests/test_visit_departure.mjs"]
started = time.time()
child = subprocess.Popen(command, cwd=source, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
try:
    stdout, stderr = child.communicate(timeout=30)
except subprocess.TimeoutExpired:
    child.kill()
    stdout, stderr = child.communicate()
    (root/"test.stdout.txt").write_bytes(stdout)
    (root/"test.stderr.txt").write_bytes(stderr)
    raise
(root/"test.stdout.txt").write_bytes(stdout)
(root/"test.stderr.txt").write_bytes(stderr)
after = snapshot()
receipt = {"schema":"hamon.taste-departure-author/1", "base":packet["base"], "host":platform.node(),
    "uid":os.getuid(), "python":platform.python_version(), "node":version, "node_path":node,
    "command":command, "child_pid":child.pid, "exit_code":child.returncode, "duration_seconds":time.time()-started,
    "source_before":before, "source_after":after, "source_inventory_unchanged":before==after,
    "packet_before":packet_before, "packet_after":identity(packet_path),
    "packet_unchanged":packet_before==identity(packet_path),
    "stdout":identity(root/"test.stdout.txt"), "stderr":identity(root/"test.stderr.txt"),
    "browser_run":False}
receipt["passed"] = child.returncode == 0 and before == after and receipt["packet_unchanged"]
(root/"receiving.json").write_text(json.dumps(receipt,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"passed":receipt["passed"],"child_pid":child.pid,"exit_code":child.returncode,"root":str(root),"node":version,"source_files":len(before),"stdout":stdout.decode("utf-8"),"stderr":stderr.decode("utf-8")}))
sys.exit(0 if receipt["passed"] else 1)
