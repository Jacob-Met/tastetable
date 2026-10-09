#!/usr/bin/env python3
"""Bounded outer process receiver; no application imports."""
import datetime, hashlib, json, os, pathlib, re, selectors, shutil, signal, stat, subprocess, sys, time, traceback
ROOT=pathlib.Path(__file__).resolve().parent
NODE="/opt/homebrew/bin/node"
STATIC_CAP=2*1024**2
BROWSER_CAP=96*1024**2
def pins(b):
    return {"bytes":len(b),"sha256":hashlib.sha256(b).hexdigest(),"git_blob":hashlib.sha1(b"blob "+str(len(b)).encode()+b"\0"+b).hexdigest()}
def size(root,skip_browser=False):
    total=0
    for parent,dirs,names in os.walk(root,followlinks=False):
        dirs[:]=[d for d in dirs if not pathlib.Path(parent,d).is_symlink() and not(skip_browser and pathlib.Path(parent,d)==ROOT/"browser")]
        for name in names:
            p=pathlib.Path(parent,name)
            try:s=p.lstat()
            except FileNotFoundError:continue
            if stat.S_ISREG(s.st_mode):total+=s.st_size
    return total
def guard():
    s=os.statvfs("/Users/me")
    r=subprocess.run(["/usr/bin/vm_stat"],capture_output=True,text=True,check=True,timeout=5)
    page=int(re.search(r"page size of (\d+) bytes",r.stdout).group(1))
    parts={k:int(re.search(r"^"+re.escape(k)+r":\s+(\d+)",r.stdout,re.M).group(1)) for k in ("Pages free","Pages inactive","Pages speculative")}
    g={"utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"free_disk_bytes":s.f_bavail*s.f_frsize,"conservative_memory_bytes":sum(parts.values())*page,"page_bytes":page,"memory_pages":parts,"vm_stat_stdout":r.stdout,"vm_stat_stderr":r.stderr,"vm_stat_exit":r.returncode,"receiver_bytes":size(ROOT,True),"browser_bytes":size(ROOT/"browser")}
    if g["free_disk_bytes"]<256*1024**2 or g["conservative_memory_bytes"]<2*1024**3 or g["receiver_bytes"]>STATIC_CAP or g["browser_bytes"]>BROWSER_CAP:raise RuntimeError("Fresh outer resource guard refused")
    return g
def frozen_files():
    preparation=json.loads((ROOT/"SOURCE-PREPARATION.json").read_text())
    result={}
    for name,pin in preparation["files"].items():
        p=ROOT/name;s=p.lstat()
        if not stat.S_ISREG(s.st_mode) or p.is_symlink() or s.st_size>STATIC_CAP:raise ValueError("Regular fixed source required: "+name)
        b=p.read_bytes();actual=pins(b)
        if actual!={k:pin[k] for k in actual}:raise ValueError("Prepared source changed: "+name)
        result[name]={**actual,"mode":format(stat.S_IMODE(s.st_mode),"04o"),"mtime_ns":str(s.st_mtime_ns)}
    return result
def main():
    if sys.platform!="darwin" or str(ROOT)!="/Users/me/Developer/tastetable-visit-record-receiving-c945953fdeb7":raise RuntimeError("Fixed native receiver boundary")
    if (ROOT/"OUTER-RECEIPT.json").exists() or (ROOT/"results").exists() or (ROOT/"browser").exists():raise FileExistsError("Original receiving attempt already allocated; no rerun")
    admission=guard();before=frozen_files()
    started=time.monotonic()
    child=subprocess.Popen([NODE,str(ROOT/"receive.mjs")],cwd="/tmp",stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
    select=selectors.DefaultSelector()
    select.register(child.stdout,selectors.EVENT_READ,"stdout");select.register(child.stderr,selectors.EVENT_READ,"stderr")
    output={"stdout":bytearray(),"stderr":bytearray()}
    signals=[];boundary=None;term_at=None
    def stop(reason):
        nonlocal boundary,term_at
        if boundary is None:boundary=reason
        if term_at is None and child.poll() is None:
            term_at=time.monotonic()
            try:os.killpg(child.pid,signal.SIGTERM);signals.append({"signal":"SIGTERM","elapsed_seconds":time.monotonic()-started,"reason":reason})
            except ProcessLookupError:pass
    while select.get_map() or child.poll() is None:
        elapsed=time.monotonic()-started
        if child.poll() is None and elapsed>=175:stop("175-second outer stop threshold inside 180-second ceiling")
        if child.poll() is None and (elapsed>=180 or (term_at is not None and time.monotonic()-term_at>=3)):
            try:os.killpg(child.pid,signal.SIGKILL);signals.append({"signal":"SIGKILL","elapsed_seconds":elapsed,"reason":boundary or "hard deadline"})
            except ProcessLookupError:pass
        if size(ROOT,True)>STATIC_CAP or size(ROOT/"browser")>BROWSER_CAP:stop("Owned on-disk budget exceeded")
        for key,_ in select.select(0.1):
            b=os.read(key.fileobj.fileno(),65536)
            if not b:select.unregister(key.fileobj);key.fileobj.close();continue
            output[key.data].extend(b)
            if sum(map(len,output.values()))>262144:stop("Outer captured-output budget exceeded")
        if term_at is not None and time.monotonic()-term_at>8 and child.poll() is not None:break
    actual_exit=child.wait(timeout=2)
    after=frozen_files()
    record={"format":"tastetable.independent-outer-receiving.v1","controller_pid":os.getpid(),"started_guard":admission,"executable":NODE,"args":[str(ROOT/"receive.mjs")],"cwd":"/tmp","node_pid":child.pid,"actual_node_exit":actual_exit,"elapsed_seconds":time.monotonic()-started,"boundary_failure":boundary,"owned_signals":signals,"stdout":bytes(output["stdout"]).decode("utf-8","strict"),"stderr":bytes(output["stderr"]).decode("utf-8","strict"),"source_before":before,"source_after":after,"source_unchanged":before==after,"receiver_bytes":size(ROOT,True),"browser_bytes":size(ROOT/"browser"),"finished_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"outer_exit_pending_until_tool_completion":True}
    raw=(json.dumps(record,ensure_ascii=False,indent=2)+"\n").encode("utf-8")
    if size(ROOT,True)+len(raw)>STATIC_CAP:raise RuntimeError("Final outer receipt would exceed budget")
    fd=os.open(ROOT/"OUTER-RECEIPT.json",os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"wb") as stream:stream.write(raw)
    success=actual_exit==0 and boundary is None and before==after
    print(json.dumps({"outer_success":success,"node_exit":actual_exit,"node_pid":child.pid,"elapsed_seconds":record["elapsed_seconds"],"receipt":pins(raw),"receiver_bytes":size(ROOT,True),"browser_bytes":record["browser_bytes"],"boundary_failure":boundary},ensure_ascii=False))
    return 0 if success else 1
if __name__=="__main__":
    try:raise SystemExit(main())
    except Exception:
        traceback.print_exc()
        raise SystemExit(1)
