import hashlib,json,os,subprocess,sys
from pathlib import Path
root=Path("/tmp/tastetable-soft-cue-review-cf5799f6d38b")
root.mkdir(exist_ok=False)
x=json.loads(Path(str(root)+"-transfer.json").read_text())
for variant in ("baseline","candidate"):
 for item in x["baseline"]:
  b=item["content"].encode()
  actual=hashlib.sha1(b"blob "+str(len(b)).encode()+b"\0"+b).hexdigest()
  if actual!=item["sha"]: raise RuntimeError("transfer mismatch "+item["path"])
  p=root/variant/item["path"];p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
(root/"candidate/constraints.py").write_text(x["candidate_constraints"])
(root/"candidate/tests/test_soft_food_evidence.py").write_text(x["candidate_test"])
(root/"review-freeze-v2.json").write_text(x["review_freeze"])
freeze=json.loads(x["review_freeze"])
def pin(p):
 b=p.read_bytes();return {"bytes":len(b),"sha256":hashlib.sha256(b).hexdigest(),"git_blob":hashlib.sha1(b"blob "+str(len(b)).encode()+b"\0"+b).hexdigest()}
for variant,rows in freeze["source"].items():
 for item in rows:
  if pin(root/variant/item["path"])!={k:item[k] for k in ("bytes","sha256","git_blob")}:raise RuntimeError("freeze mismatch "+variant+"/"+item["path"])
out=root/"qualification";out.mkdir()
runtime="/tmp/canvaspilot-receiving-cf5799f6d38b-9VQmAF/venv/bin/python3"
boot='import hashlib,json,pathlib,sys; sys.path.insert(0,sys.argv[1]); import constraints,pytest; print(json.dumps({"constraints":constraints.__file__,"sha256":hashlib.sha256(pathlib.Path(constraints.__file__).read_bytes()).hexdigest(),"pytest":pytest.__version__,"python":sys.version})); raise SystemExit(pytest.main(sys.argv[2:]))'
rows=[]
for variant in ("baseline","candidate"):
 for optimized in (False,True):
  source=root/variant;label=variant+("-optimized" if optimized else "-normal")
  env=dict(os.environ,PYTHONDONTWRITEBYTECODE="1",PYTEST_DISABLE_PLUGIN_AUTOLOAD="1",PYTHONPATH=str(source))
  command=[runtime,"-B"]+(["-O"] if optimized else [])+["-c",boot,str(source),"-q","-p","no:cacheprovider",str(source/"tests/test_wheelchair_evidence.py"),str(source/"tests/test_low_sodium_evidence.py"),str(source/"tests/test_low_sodium_peer.py"),str(source/"tests/test_native_plan_cli.py"),str(root/"candidate/tests/test_soft_food_evidence.py")]
  result=subprocess.run(command,cwd=source,env=env,capture_output=True,timeout=180)
  (out/(label+".stdout")).write_bytes(result.stdout);(out/(label+".stderr")).write_bytes(result.stderr)
  row={"variant":variant,"optimized":optimized,"command":command,"exit_code":result.returncode,"stdout":pin(out/(label+".stdout")),"stderr":pin(out/(label+".stderr"))}
  rows.append(row);print(json.dumps({"variant":variant,"optimized":optimized,"exit_code":result.returncode,"last_lines":result.stdout.decode().splitlines()[-4:]}),flush=True)
unchanged=all(pin(root/v/r["path"])=={k:r[k] for k in ("bytes","sha256","git_blob")} for v,items in freeze["source"].items() for r in items)
receipt={"schema":"tastetable.soft-food-preserved-pytest-receiving.v1","root":str(root),"python":sys.version,"source_unchanged":unchanged,"source_freeze_sha256":hashlib.sha256((root/"review-freeze-v2.json").read_bytes()).hexdigest(),"results":rows,"scope":"Actual pytest runner and five exact suites; FastAPI unavailable, no app server or full-repository test claim."}
(out/"receipt.json").write_text(json.dumps(receipt,indent=2)+"\n")
print(json.dumps({"receipt":str(out/"receipt.json"),"source_unchanged":unchanged}),flush=True)
raise SystemExit(0 if unchanged and all(r["exit_code"]==(1 if r["variant"]=="baseline" else 0) for r in rows) else 1)
