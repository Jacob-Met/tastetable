import sys,tty,json,pathlib,hashlib,gzip,base64,tempfile,os,subprocess,shutil,time
tty.setraw(sys.stdin.fileno());print("READY",flush=True)
v=json.loads(sys.stdin.buffer.readline()); packed=v["compressed_runtime"];raw=gzip.decompress(base64.b64decode(packed["gzip_base64"]));assert hashlib.sha256(raw).hexdigest()==packed["raw_sha256"]
files=json.loads(raw)+v["files"];assert len(files)==20 and len({x["path"] for x in files})==20
root=pathlib.Path(tempfile.mkdtemp(prefix="hamon-taste-ci-6c20bb4b010e-",dir="/dev"));project=root/"source";project.mkdir();pins=[]
for f in files:
 rel=pathlib.PurePosixPath(f["path"]);assert not rel.is_absolute() and ".." not in rel.parts
 p=project/rel;p.parent.mkdir(parents=True,exist_ok=True);b=f["content"].encode();g=hashlib.sha1(b"blob "+str(len(b)).encode()+b"\0"+b).hexdigest()
 assert g==f.get("expected_git",f.get("git_blob",g)),f["path"]
 with p.open("xb") as out:out.write(b)
 p.chmod(int(f["mode"],8)&0o777);pins.append({"path":f["path"],"mode":f["mode"],"bytes":len(b),"sha256":hashlib.sha256(b).hexdigest(),"git_blob":g})
env=os.environ.copy();env["NATIVE_WEEK_PYTHON"]="/opt/codex/runtimes/codex-primary-runtime/dependencies/python/bin/python3";env["PYTHONDONTWRITEBYTECODE"]="1"
cmd=["/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node",str(project/"tools/check_native_plan_week_browser.mjs"),"--browser","/tmp/hamon-project-browser-ce7eb129730f/portable-153/chromium","--output",str(root/"result")]
before=time.time();r=subprocess.run(cmd,env=env,cwd=project,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=180);elapsed=time.time()-before
for f in pins:assert hashlib.sha256((project/f["path"]).read_bytes()).hexdigest()==f["sha256"],f["path"]
textfiles=[{"path":"receiver.log","content":r.stdout.decode()}];binary=[]
for p in sorted((root/"result").rglob("*")):
 if not p.is_file():continue
 b=p.read_bytes();name=str(p.relative_to(root/"result"));meta={"path":"result/"+name,"bytes":len(b),"sha256":hashlib.sha256(b).hexdigest()}
 if p.suffix.lower() in [".json",".ics",".txt",".log"]:textfiles.append({**meta,"content":b.decode()})
 else:binary.append(meta)
report=json.loads((root/"result/receiving-report.json").read_text()) if (root/"result/receiving-report.json").exists() else None
packet={"schema":"tastetable.root.native-week-composition/1","base":v["base"],"tree":v["tree"],"command":cmd,"elapsed_seconds":elapsed,"exit_code":r.returncode,"source_pins":pins,"source_unchanged":True,"files":textfiles,"binary_artifacts_generated_but_not_in_text_packet":binary}
data=(json.dumps(packet,indent=2)+"\n").encode();compressed=gzip.compress(data,mtime=0)
print(json.dumps({"exit_code":r.returncode,"elapsed_seconds":elapsed,"status":None if report is None else report["status"],"checks":None if report is None else report["checks"],"source_pins":pins,"text_files":len(textfiles),"raw_bytes":len(data),"raw_sha256":hashlib.sha256(data).hexdigest(),"wire_bytes":len(compressed),"gzip_base64":base64.b64encode(compressed).decode()}),flush=True)
shutil.rmtree(root)
