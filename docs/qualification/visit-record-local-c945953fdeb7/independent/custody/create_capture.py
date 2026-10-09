import base64,datetime,hashlib,io,json,os,pathlib,re,stat,subprocess,sys,zipfile
ROOT=pathlib.Path("/Users/me/Developer/tastetable-visit-record-receiving-c945953fdeb7")
DEST=ROOT/"custody"
def pins(b):return {"bytes":len(b),"sha256":hashlib.sha256(b).hexdigest(),"git_blob":hashlib.sha1(b"blob "+str(len(b)).encode()+b"\0"+b).hexdigest()}
def require(ok,msg):
    if not ok:raise RuntimeError(msg)
def read(p):
    a=p.lstat();require(stat.S_ISREG(a.st_mode) and not p.is_symlink() and a.st_size<2*1024**2,"bounded plain original")
    b=p.read_bytes();z=p.lstat()
    require((a.st_ino,a.st_size,a.st_mtime_ns)==(z.st_ino,z.st_size,z.st_mtime_ns) and len(b)==a.st_size,"original changed while read")
    return b,{"mode":format(stat.S_IMODE(a.st_mode),"04o"),"mtime_ns":str(a.st_mtime_ns)}
require(sys.platform=="darwin" and not os.path.lexists(DEST),"exclusive native custody output")
r=subprocess.run(["/usr/bin/vm_stat"],capture_output=True,text=True,check=True,timeout=5);v=r.stdout
page=int(re.search(r"page size of (\d+) bytes",v).group(1))
parts={k:int(re.search(r"^"+re.escape(k)+r":\s+(\d+)",v,re.M).group(1)) for k in ("Pages free","Pages inactive","Pages speculative")}
disk=os.statvfs(ROOT);guard={"utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"free_disk_bytes":disk.f_bavail*disk.f_frsize,"conservative_memory_bytes":sum(parts.values())*page,"vm_stat_stdout":v,"memory_pages":parts,"page_bytes":page}
require(guard["free_disk_bytes"]>=256*1024**2 and guard["conservative_memory_bytes"]>=2*1024**3,"native custody resource guard")
paths=[]
for parent,dirs,names in os.walk(ROOT,followlinks=False):
    dirs[:]=[d for d in dirs if pathlib.Path(parent,d)!=ROOT/"browser"]
    for d in dirs:require(not pathlib.Path(parent,d).is_symlink(),"plain source directory")
    for n in names:paths.append(pathlib.Path(parent,n))
record=json.loads((ROOT/"results/RECEIPT.json").read_text())
require(record["accepted"] and len(record["downloads"])==3,"completed fixed receiving packet")
for item in record["downloads"]:
    p=pathlib.Path(item["path"]);require(p.is_relative_to(ROOT/"browser"),"owned physical download")
    b,_=read(p);require(pins(b)==item["pin"],"original physical export pin")
    paths.append(p)
require(len(set(paths))==len(paths),"unique original capture paths")
members={};table={}
for p in sorted(paths):
    b,identity=read(p);name=p.relative_to(ROOT).as_posix()
    members[name]=b;table[name]={**pins(b),**identity,"native_path":str(p)}
mapping={"format":"tastetable.original-receiving-capture-map.v1","root":str(ROOT),"contract":"e194d0bae55e9a1b3a2b97d4accd2c1b81a8ae0e","files":table,"guard":guard,"scope":"Exact completed source, receipts, screenshots and three physical exports; no profile/cache collection and no app/browser execution.","git_id_note":"Member Git IDs are computed identities until an explicit repository create/read acknowledgement is recorded."}
map_bytes=(json.dumps(mapping,ensure_ascii=False,indent=2)+"\n").encode("utf-8")
buf=io.BytesIO()
with zipfile.ZipFile(buf,"w",zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for name,b in members.items():
        info=zipfile.ZipInfo(name,date_time=(2026,10,9,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,b)
    info=zipfile.ZipInfo("NATIVE-MAP.json",date_time=(2026,10,9,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,map_bytes)
zipped=buf.getvalue();encoded=base64.b64encode(zipped).decode("ascii")
carrier=("\n".join(encoded[i:i+4096] for i in range(0,len(encoded),4096))+"\n").encode("ascii")
nonbrowser=sum(len(b) for name,b in members.items() if not name.startswith("browser/"))
require(nonbrowser+len(map_bytes)+len(carrier)<2*1024**2,"complete native custody disk budget")
for name,b in members.items():require(read(ROOT/name)[0]==b,"original after-capture identity "+name)
os.mkdir(DEST,0o700)
for name,b in (("NATIVE-MAP.json",map_bytes),("original-receiving.zip.b64",carrier)):
    fd=os.open(DEST/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o400)
    with os.fdopen(fd,"wb") as stream:stream.write(b)
print(json.dumps({"completed":True,"controller_pid":os.getpid(),"original_member_count":len(members),"original_member_bytes":sum(map(len,members.values())),"native_map":pins(map_bytes),"carrier":pins(carrier),"zip":pins(zipped),"carrier_lines":carrier.count(b"\n"),"owned_evidence_bytes_after":nonbrowser+len(map_bytes)+len(carrier),"original_members_unchanged":True,"application_or_browser_invocations":0,"guard":guard,"outer_exit_pending_until_tool_completion":True},ensure_ascii=False))
