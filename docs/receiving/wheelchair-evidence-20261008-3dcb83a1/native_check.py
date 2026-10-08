"""Native core validation with exact source pins and bounded resource checks."""
import difflib,hashlib,json,os,pathlib,shutil,subprocess,sys
from datetime import datetime,timezone
ROOT=pathlib.Path(__file__).resolve().parent
ENV={**os.environ,"TASTETABLE_LIVE":"0","PYTHONDONTWRITEBYTECODE":"1"}
MIN_FREE=512*1024*1024
MAX_OWN=16*1024*1024
records=[]
def sha(b):return hashlib.sha256(b).hexdigest()
def blob(b):return hashlib.sha1(b"blob "+str(len(b)).encode()+b"\0"+b).hexdigest()
def guard():
    free=shutil.disk_usage(ROOT).free
    own=sum(p.stat().st_size for p in ROOT.rglob("*") if p.is_file())
    assert free>=MIN_FREE and own<=MAX_OWN,(free,own)
    return {"free_bytes":free,"own_bytes":own}
def run(name,command,cwd,expected,keep_stdout=True):
    before=guard()
    result=subprocess.run(command,cwd=cwd,env=ENV,capture_output=True,text=True,timeout=45)
    record={"name":name,"command":command,"cwd":str(cwd),"returncode":result.returncode,
            "expected_returncode":expected,"stdout":result.stdout if keep_stdout else None,
            "stdout_sha256":sha(result.stdout.encode()),"stderr":result.stderr,
            "before":before,"after":guard()}
    records.append(record)
    assert result.returncode==expected,record
    print(json.dumps({"name":name,"returncode":result.returncode,
                      "summary":result.stdout.splitlines()[-1:] if keep_stdout else "retained complete healthy output by hash"}),flush=True)
    return result.stdout

pins=json.loads((ROOT/"source-pins.json").read_text())
for row in pins["files"]:
    b=(ROOT/"baseline"/row["path"]).read_bytes()
    assert blob(b)==row["git_blob"]
    if row["path"]!="constraints.py":assert (ROOT/"source"/row["path"]).read_bytes()==b
control=ROOT/"baseline-control"
shutil.copytree(ROOT/"baseline",control)
newtest=(ROOT/"source/tests/test_wheelchair_evidence.py").read_bytes()
(control/"tests/test_wheelchair_evidence.py").write_bytes(newtest)
python="/usr/bin/python3"
base_tests=["tests/test_tastetable.py","tests/test_constraint_binding.py"]
try:
    run("original_planner_and_constraint_tests",
        [python,"-B","-m","pytest","-q","-p","no:cacheprovider",*base_tests,"-k","not web_endpoints"],ROOT/"baseline",0)
    run("new_controls_on_original",
        [python,"-B","-m","pytest","-q","-p","no:cacheprovider","tests/test_wheelchair_evidence.py"],control,1)
    run("candidate_planner_and_constraint_tests",
        [python,"-B","-m","pytest","-q","-p","no:cacheprovider",*base_tests,
         "tests/test_wheelchair_evidence.py","-k","not web_endpoints"],ROOT/"source",0)
    receiving=run("candidate_actual_planner_receiving",
        [python,"-B",str(ROOT/"reproduce.py"),str(ROOT/"source")],ROOT,0)
    original=run("original_complete_persona_outputs",
        [python,"-B",str(ROOT/"healthy.py"),str(ROOT/"baseline")],ROOT,0,False)
    candidate=run("candidate_complete_persona_outputs",
        [python,"-B",str(ROOT/"healthy.py"),str(ROOT/"source")],ROOT,0,False)
    (ROOT/"healthy-original.json").write_text(original)
    (ROOT/"healthy-candidate.json").write_text(candidate)
    assert original==candidate,"healthy complete persona results changed"
    for row in pins["files"]:
        assert blob((ROOT/"baseline"/row["path"]).read_bytes())==row["git_blob"]
        assert blob((control/row["path"]).read_bytes())==row["git_blob"]
        if row["path"]!="constraints.py":assert blob((ROOT/"source"/row["path"]).read_bytes())==row["git_blob"]
finally:
    import pytest
    result={"at":datetime.now(timezone.utc).isoformat(),"base":pins["base"],"tree":pins["tree"],
            "python":sys.version,"pytest":pytest.__version__,"commands":records,
            "source_collection":"9 exact selected text files; original control overlays only the new test",
            "native_check_sha256":sha(pathlib.Path(__file__).read_bytes()),
            "guards":{"minimum_free_bytes":MIN_FREE,"maximum_own_bytes":MAX_OWN,"command_timeout_seconds":45},
            "scope":"Native stdlib planner/Qloo fixture and constraint tests. One FastAPI test is explicitly deselected because FastAPI/httpx are absent; no HTTP/browser/deployment/full-suite claim."}
    (ROOT/"native-results.json").write_text(json.dumps(result,indent=2)+"\n")
diff=list(difflib.unified_diff((ROOT/"baseline/constraints.py").read_text().splitlines(True),
                               (ROOT/"source/constraints.py").read_text().splitlines(True),
                               fromfile="a/constraints.py",tofile="b/constraints.py"))
diff+=list(difflib.unified_diff([],newtest.decode().splitlines(True),
                              fromfile="/dev/null",tofile="b/tests/test_wheelchair_evidence.py"))
(ROOT/"product.diff").write_text("".join(diff))
products=[{"path":path,"git_blob":blob((ROOT/"source"/path).read_bytes()),
           "sha256":sha((ROOT/"source"/path).read_bytes()),"bytes":(ROOT/"source"/path).stat().st_size}
          for path in ["constraints.py","tests/test_wheelchair_evidence.py"]]
receipt={"base":pins["base"],"tree":pins["tree"],"product_files":products,
         "diff_sha256":sha((ROOT/"product.diff").read_bytes()),"unchanged_selected_files":8,
         "healthy_complete_results_byte_identical":True,"healthy_sha256":sha(original.encode()),
         "healthy_bytes":len(original.encode()),"source_pins_unchanged":True,"resource":guard()}
(ROOT/"product-pins.json").write_text(json.dumps(receipt,indent=2)+"\n")
print(json.dumps(receipt),flush=True)
