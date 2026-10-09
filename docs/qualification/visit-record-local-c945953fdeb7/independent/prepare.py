import sys,json,hashlib,os,pathlib,stat,subprocess,re,datetime,traceback
ROOT=pathlib.Path("/Users/me/Developer/tastetable-visit-record-receiving-c945953fdeb7")
EXPECTED=json.loads(sys.argv[1])
PYTHON=pathlib.Path("/Library/Frameworks/Python.framework/Versions/3.13/bin/python3.13")
def emit(o):print("RECEIVING_JSON "+json.dumps(o,ensure_ascii=False,separators=(",",":")),flush=True)
def pins(b):return {"bytes":len(b),"sha256":hashlib.sha256(b).hexdigest(),"git_blob":hashlib.sha1(b"blob "+str(len(b)).encode()+b"\0"+b).hexdigest()}
def require(ok,message):
    if not ok:raise RuntimeError(message)
def guard():
    s=os.statvfs("/Users/me")
    r=subprocess.run(["/usr/bin/vm_stat"],capture_output=True,text=True,check=True,timeout=5)
    p=int(re.search(r"page size of (\d+) bytes",r.stdout).group(1))
    parts={k:int(re.search(r"^"+re.escape(k)+r":\s+(\d+)",r.stdout,re.M).group(1)) for k in ("Pages free","Pages inactive","Pages speculative")}
    g={"utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"free_disk_bytes":s.f_bavail*s.f_frsize,"conservative_memory_bytes":sum(parts.values())*p,"page_bytes":p,"memory_pages":parts,"vm_stat_stdout":r.stdout,"vm_stat_stderr":r.stderr,"vm_stat_exit":r.returncode}
    require(g["free_disk_bytes"]>=256*1024**2 and g["conservative_memory_bytes"]>=2*1024**3,"Fresh native preparation guard refused")
    return g
require(sys.platform=="darwin" and sys.version_info[:3]==(3,13,7),"Fixed native Python platform/version")
require(pathlib.Path(sys.executable).resolve()==PYTHON,"Fixed native interpreter")
require(pins(PYTHON.read_bytes())=={"bytes":119600,"sha256":"406d73d07e33e164d986326fde00b85c2b8f4ed2c33278142c8431588fe2df14","git_blob":"6690f22e3a54a2af9c3b6c71f44c9099d6ccfa6b"},"Existing Python byte identity")
for parent in [ROOT.parent,*ROOT.parent.parents]:
    st=parent.lstat();require(stat.S_ISDIR(st.st_mode) and not parent.is_symlink(),"Plain existing parent")
require(not os.path.lexists(ROOT),"Exclusive receiver path already exists; refused")
require(set(EXPECTED)=={"receive.mjs","compare.py","run.py","prepare.py","AUTHORITY.json","CONTRACT.md","ORIGINAL-CAPSULE.json"},"Fixed receiving source set")
require(sum(p["bytes"] for p in EXPECTED.values())<512*1024,"Bounded prepared payload")
admission=guard()
os.mkdir(ROOT,0o700)
written={}
emit({"ready":True,"controller_pid":os.getpid(),"root":str(ROOT),"admission":admission,"files_expected":len(EXPECTED),"server_or_browser_invocations":0})
for line in sys.stdin:
    try:
        req=json.loads(line)
        if req.get("op")=="put":
            name=req["path"];require(name in EXPECTED and name not in written,"Exact fresh prepared file")
            data=req["content"].encode("utf-8","strict")
            require(pins(data)==EXPECTED[name],"Prepared source byte pin "+name)
            fd=os.open(ROOT/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
            with os.fdopen(fd,"wb") as stream:stream.write(data);stream.flush();os.fsync(stream.fileno());os.fchmod(stream.fileno(),0o400)
            st=(ROOT/name).lstat();written[name]={**pins(data),"mode":"0400","mtime_ns":str(st.st_mtime_ns)}
            emit({"written":name,**pins(data)})
        elif req.get("op")=="finish":
            require(set(written)==set(EXPECTED),"Complete fixed receiving source closure")
            require({p.name for p in ROOT.iterdir()}==set(EXPECTED),"No unexpected prepared file")
            for name,p in EXPECTED.items():require(pins((ROOT/name).read_bytes())==p,"Prepared readback "+name)
            result={"format":"tastetable.independent-receiver-preparation.v1","controller_pid":os.getpid(),"completed_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"root":str(ROOT),"contract":"e194d0bae55e9a1b3a2b97d4accd2c1b81a8ae0e","admission":admission,"files":written,"payload_bytes":sum(p["bytes"] for p in written.values()),"server_or_browser_invocations":0,"original_or_candidate_application_imports":0,"outer_exit_pending_until_tool_completion":True}
            raw=(json.dumps(result,ensure_ascii=False,indent=2)+"\n").encode("utf-8")
            fd=os.open(ROOT/"SOURCE-PREPARATION.json",os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o400)
            with os.fdopen(fd,"wb") as stream:stream.write(raw)
            emit({"prepared":True,"receipt":pins(raw),"files":len(written),"payload_bytes":result["payload_bytes"]})
            break
        else:raise ValueError("Unknown fixed preparation operation")
    except Exception as error:
        emit({"failure":type(error).__name__,"message":str(error),"traceback":traceback.format_exc(),"retained_files":list(written),"no_retry":True})
        raise SystemExit(1)
