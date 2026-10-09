"""Pure receiving-only qualification on preserved PDF-origin records; no PDF parsing."""
import copy,hashlib,importlib.util,json,math,pathlib,traceback
R=pathlib.Path(__file__).resolve().parent
def sha(b):return hashlib.sha256(b).hexdigest()
def git(b):return hashlib.sha1(b"blob "+str(len(b)).encode()+b"\0"+b).hexdigest()
def load(n,p):
 s=importlib.util.spec_from_file_location(n,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
helper=R/"pdf-visible-separators-quantized-r1.py";assert git(helper.read_bytes())=="a7e6e981164f012ddb9d518aa96a7b6d689275b1"
frozen=R/"pdf-visible-separators-r0.py";assert git(frozen.read_bytes())=="2b60e392c939621c4220fe1e8255ead36a93eab3"
f=load("frozen",frozen);q=load("quantized",helper)
pins={
"collector-qualification-r0/original-0-origins.json":"559fbd7616bbc8616f68af95a936504b38ba044b10a2bf60991c23bec984479e",
"collector-qualification-r0/original-1-origins.json":"f2a8dcf68c25c46a7fc9f69d8a60c3371c6521ccbb6d1841bfee268210939f74",
"corrected-originals-r3/original-0-origins.json":"f3ac117538dd54dd07561f47518a420c72942f63fe3e00bd982aefd9d3212222",
"corrected-originals-r3/original-1-origins.json":"fa55a50ba0187f929e105e98406cf87a5feaa5bcfc78867872faf74b5bec1a13"}
for p,h in pins.items():assert sha((R/p).read_bytes())==h,p
paths=[R/p for p in pins]+[helper,frozen,pathlib.Path(__file__).resolve()]
before=[{"path":str(p),"sha256":sha(p.read_bytes())} for p in paths]
r={"passed":False,"scope":"Pure record quantization correction; original frozen failures retained","actualCorrected":[],"oldCollapsedRefusals":[],"controlledPositives":[],"controlledRefusals":[]}
def fixture(case,phase):
 lines=[];records=[]
 for i,marker in enumerate(case["markers"]):
  unit=math.floor(1000+phase+i*24.8);y=unit*.75
  lines.append({"page":1,"order":i,"text":marker,"baseline":y,"fontSize":12.0})
  records.append({"page":1,"order":i,"text":marker,"rawVisitorText":marker,"rawFontSize":16.0,
   "tm":[1,0,0,-1,0,unit],"cm":[.75,0,0,-.75,0,792],"combined":[.75,0,0,.75,0,792-y]})
 return {"lines":lines,"visitorRecords":records}
def refuse(label,data,case):
 try:q.check_case(data,case)
 except ValueError as e:r["controlledRefusals"].append({"label":label,"case":case["field"],"error":str(e)})
 else:raise AssertionError("Accepted negative "+label)
try:
 for case in f.CASES:
  old=json.loads((R/("collector-qualification-r0/original-%d-origins.json"%case["pdf"])).read_text())
  try:q.check_case(old,case)
  except ValueError as e:r["oldCollapsedRefusals"].append({"field":case["field"],"error":str(e)})
  else:raise AssertionError("Old collapsed product accepted")
  new=json.loads((R/("corrected-originals-r3/original-%d-origins.json"%case["pdf"])).read_text())
  r["actualCorrected"].append(q.check_case(new,case))
  for phase in [0,.2,.4,.6,.8]:
   data=fixture(case,phase);r["controlledPositives"].append({"field":case["field"],"phase":phase,"result":q.check_case(data,case)})
  for label in ["collapsed-first","double-first","all-double","cumulative-drift","reversed","missing","duplicate","cross-page","order","nonfinite","raw-leading-newline","raw-two-trailing-newlines","wrong-grid"]:
   d=fixture(case,0)
   if label=="collapsed-first":d["lines"][1]["baseline"]=d["lines"][0]["baseline"]
   elif label=="double-first":
    for row in d["lines"][1:]:row["baseline"]+=18.6
   elif label=="all-double":
    for i,row in enumerate(d["lines"]):row["baseline"]=750+37.2*i
   elif label=="cumulative-drift":
    for i,row in enumerate(d["lines"]):row["baseline"]=750+18*i
   elif label=="reversed":d["lines"][1]["baseline"]=d["lines"][0]["baseline"]-18.6
   elif label=="missing":d["lines"].pop(1)
   elif label=="duplicate":d["lines"].append(copy.deepcopy(d["lines"][0]))
   elif label=="cross-page":d["lines"][1]["page"]=2;d["visitorRecords"][1]["page"]=2
   elif label=="order":d["lines"][0]["order"]=99;d["visitorRecords"][0]["order"]=99
   elif label=="nonfinite":d["lines"][1]["baseline"]=float("nan")
   elif label=="raw-leading-newline":d["visitorRecords"][1]["rawVisitorText"]="\n"+d["visitorRecords"][1]["text"]
   elif label=="raw-two-trailing-newlines":d["visitorRecords"][1]["rawVisitorText"]+="\n\n"
   elif label=="wrong-grid":d["visitorRecords"][1]["combined"][3]=1
   refuse(label,d,case)
 r["passed"]=True
except BaseException as e:r["failure"]={"type":type(e).__name__,"message":str(e),"traceback":traceback.format_exc()}
after=[{"path":str(p),"sha256":sha(p.read_bytes())} for p in paths];r["inputBefore"]=before;r["inputAfter"]=after;r["inputsUnchanged"]=before==after
if before!=after:r["passed"]=False
target=R/"quantized-separator-receiving-r1.json";assert not target.exists();target.write_text(json.dumps(r,ensure_ascii=True,indent=2)+"\n",encoding="utf-8")
print(json.dumps({"passed":r["passed"],"actualCorrected":r["actualCorrected"],"oldRefusals":len(r["oldCollapsedRefusals"]),"controlledPositives":len(r["controlledPositives"]),"controlledRefusals":len(r["controlledRefusals"]),"inputsUnchanged":r["inputsUnchanged"],"failure":r.get("failure"),"receiptBytes":len(target.read_bytes()),"receiptSha256":sha(target.read_bytes())}))
raise SystemExit(0 if r["passed"] else 1)
