import sys,json,hashlib,pathlib,os,re,stat,subprocess,datetime
ROOT=pathlib.Path("/Users/me/Developer/tastetable-visit-record-receiving-c945953fdeb7")
SELECTED=json.loads(sys.argv[1])
def pins(b):return {"bytes":len(b),"sha256":hashlib.sha256(b).hexdigest(),"git_blob":hashlib.sha1(b"blob "+str(len(b)).encode()+b"\0"+b).hexdigest()}
def require(ok,msg):
    if not ok:raise RuntimeError(msg)
r=subprocess.run(["/usr/bin/vm_stat"],capture_output=True,text=True,check=True,timeout=5)
page=int(re.search(r"page size of (\d+) bytes",r.stdout).group(1))
memory=sum(int(re.search(r"^"+re.escape(k)+r":\s+(\d+)",r.stdout,re.M).group(1)) for k in ("Pages free","Pages inactive","Pages speculative"))*page
st=os.statvfs(ROOT)
require(memory>=2*1024**3 and st.f_bavail*st.f_frsize>=256*1024**2,"Read-only custody guard")
raw=(ROOT/"custody/NATIVE-MAP.json").read_bytes()
require(pins(raw)["git_blob"]=="7fe2f44c221da49a17cea91841c3422a7f4c4c1a","Original capture map pin")
mapping=json.loads(raw)
require(len(SELECTED)==25 and len(set(SELECTED))==25,"Fixed missing text selection")
for name in SELECTED:
    require(name in mapping["files"],"Original captured path")
    p=ROOT/name;a=p.lstat();require(stat.S_ISREG(a.st_mode) and not p.is_symlink() and a.st_size<2*1024**2,"Regular original capture member")
    b=p.read_bytes();z=p.lstat()
    require((a.st_ino,a.st_size,a.st_mtime_ns)==(z.st_ino,z.st_size,z.st_mtime_ns),"Capture member changed during read")
    actual=pins(b);require(actual=={k:mapping["files"][name][k] for k in actual},"Complete original member byte identity")
    print("CUSTODY_JSON "+json.dumps({"path":name,"pin":actual,"encoding":"utf-8","content":b.decode("utf-8","strict")},ensure_ascii=False,separators=(",",":")),flush=True)
print("CUSTODY_DONE "+json.dumps({"members":len(SELECTED),"controller_pid":os.getpid(),"utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"filesystem_writes":0,"application_or_browser_invocations":0,"free_disk_bytes":st.f_bavail*st.f_frsize,"conservative_memory_bytes":memory}),flush=True)
