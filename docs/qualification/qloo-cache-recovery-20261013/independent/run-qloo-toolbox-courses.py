"""Run the eight bounded independent Qloo Toolbox courses; preserve an exact receipt."""
import argparse,datetime,hashlib,json,platform,subprocess,sys
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument("--source-root",type=Path,required=True)
p.add_argument("--baseline-client",type=Path,required=True)
p.add_argument("--output",type=Path,required=True)
args=p.parse_args()
script=Path(__file__).resolve().with_name("qloo-toolbox-portable.py")
courses=[]
for variant in ("baseline","candidate"):
    for malformed in ("late_bad_affinity","declared_failure"):
        for optimized in (False,True):
            cmd=[sys.executable,"-I","-B"]+(["-O"] if optimized else [])+[str(script),"--source-root",str(args.source_root.resolve()),"--baseline-client",str(args.baseline_client.resolve()),"--variant",variant,"--malformed",malformed]
            result=subprocess.run(cmd,cwd="/",text=True,capture_output=True,env={})
            row={"command":cmd,"returncode":result.returncode,"stdout":result.stdout,"stderr":result.stderr}
            if result.returncode==0:row["result"]=json.loads(result.stdout)
            courses.append(row)
receipt={"schema":"hamon.qloo-toolbox-independent-receiving/2","utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"python":platform.python_version(),"platform":platform.platform(),"base_source":"368da250717cc9d1859253ac08a2f4783cd17560","candidate_sha256":"a8362350fd8f549b312255d7c7c5630b111f57e40ab1ec0da7ff9bf7b43b1aaf","receiver_sha256":hashlib.sha256(script.read_bytes()).hexdigest(),"driver_sha256":hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),"scope":"Actual Toolbox, Qloo client, fixture, constraints and plan assembler with synthetic transport. No live provider, full-suite, installed-service or external-model qualification.","courses":courses}
with args.output.open("x") as f:json.dump(receipt,f,indent=2);f.write("\n")
success=all(r["returncode"]==0 for r in courses)
print(json.dumps({"decision":"accepted" if success else "failed","receipt":str(args.output),"bytes":args.output.stat().st_size,"sha256":hashlib.sha256(args.output.read_bytes()).hexdigest(),"courses":len(courses),"python":platform.python_version(),"optimizations":sorted({r["result"]["optimization"] for r in courses if "result" in r})}))
raise SystemExit(0 if success else 1)
