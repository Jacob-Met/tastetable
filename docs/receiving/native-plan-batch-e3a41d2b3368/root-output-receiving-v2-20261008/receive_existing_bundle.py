from pathlib import Path
import datetime,hashlib,json,os,re,subprocess,sys,traceback,zipfile
ROOT=Path("/home/jacob/hamon-universal-e3a41d2b3368-tastetable-batch")
OUT=Path(__file__).resolve().parent
PINS=json.loads("[{\"path\":\"tastetable_batch.py\",\"sha256\":\"7f36651d98c66ae3d0ccc4228c72172d53f0b803fd8b1d4cd9a8e3906ed583ae\",\"gitBlob\":\"5035e393de9854acd9739fb5996aa54c2b4ef7a3\"},{\"path\":\"tests/test_native_plan_batch.py\",\"sha256\":\"57ee06369e752ed0d0739c5b6c78f8967c47405a72dc040a272e45995900631b\",\"gitBlob\":\"6a72c0190666d45017935b318ae95ba5d84b978f\"},{\"path\":\"docs/NATIVE_PLAN_BATCH.md\",\"sha256\":\"b48fcc57c5c9a1b0bb0efaf7643af2f95327df254aa7ee261a8e61c84fda7b69\",\"gitBlob\":\"1dcf4b0ed6bfd357fc117870848873df9e695911\"},{\"path\":\"README.md\",\"sha256\":\"aeb8451823433120f5e8067b116d7a0c18bd023e78d141e5e4f73fcb8654bf8c\",\"gitBlob\":\"90a7a8bc8d0d2103c74eedac91dcb17e6f0c17ee\"},{\"path\":\"tastetable_cli.py\",\"sha256\":\"5244b5d5108eb60a5c79dbe76d5abc352a9145915a5851c2f69a57e90aa71e3f\",\"gitBlob\":\"d375cb64c6c631cccca2bb43db286e8efd21eedb\"},{\"path\":\"agent.py\",\"sha256\":\"fae9eced334ec58c23af301166f6c62dd2b6ff1991bebc6e8e4d9139d3f5b4b3\",\"gitBlob\":\"883aff984464f2d43cda18f8e60b81240d6c3fb3\"},{\"path\":\"constraints.py\",\"sha256\":\"f18e4d5ffa14d8a02db2fe9ec6e97a6c0e45e8ebdab1e158124a66f7dd113efa\",\"gitBlob\":\"e9d5cd1575df72b089273740e4b6a444d0cd21a8\"},{\"path\":\"qloo_client.py\",\"sha256\":\"88d951b6271460f17aa307d4979fe23d8cf3a674afa30dd7324f95424dd0ec9b\",\"gitBlob\":\"cca322e0c9af96c481ba8f7ef286e85d3b90cfd2\"},{\"path\":\"personas.py\",\"sha256\":\"caef501a8af8abc5f9553e425eaf4ecaadcaf94e0d5c5b6e74d821dac86b24e2\",\"gitBlob\":\"1eb6768780cafaf9b1666e39b7fc17aa21204f16\"},{\"path\":\"fixtures/qloo_fixtures.json\",\"sha256\":\"5eaa5d2f32a6e4522ecc4f6c69e84dc110be031c3cdf5737ac52f9fabb99fed0\",\"gitBlob\":\"60c5d92f905755454bb280b8181f8836a74bd955\"},{\"path\":\"tools/native_plan_to_week.mjs\",\"sha256\":\"bbdf06cf5f358ef5eb3d0875d6f2182382a625b246f0c39df159b6b15b025563\",\"gitBlob\":\"cf9fc5e0ecde5a839e6e6a577039b88bcc31f302\"},{\"path\":\"static/week_file.mjs\",\"sha256\":\"914291b97250a97f6e09f47e6fed58b607b3b1ed9e4c60e3242ff39546913614\",\"gitBlob\":\"420ddb8f63fca264dcf97be7147801105696155d\"},{\"path\":\"static/week_plan.mjs\",\"sha256\":\"e739adc10d9ae9ba1cb82c6d800c453e8f7bec53e343e0685adeabe98e6f4809\",\"gitBlob\":\"8ed28163e0273c510fdd8e6f7c5d1c8476efb862\"},{\"path\":\"tests/test_native_plan_cli.py\",\"sha256\":\"f69958f8d0e5d34cbacc243cc3fffb260fe17c717d3b28c437f5e45df9134fe5\",\"gitBlob\":\"202ba42feffc662e46f5df9d22ae67640104cf58\"},{\"path\":\"examples/native-profile.json\",\"sha256\":\"8c7f05f6dbc49f624386784c5454bc1e5f7f77c13e638e2228b12ef31118119b\",\"gitBlob\":\"42bbbd183986f6e3e5014172d595b0168aeafb9f\"}]")
ZIP=ROOT/"mixed-result-example/caregiver-week-example.zip"
EXPECTED_ZIP="e53f8bc2f3482e9436bd1ed851705a33d24207d04af814c479aac8ce28441516"
def require(ok,message):
    if not ok:raise RuntimeError(message)
def digest(raw):return hashlib.sha256(raw).hexdigest()
def snapshot():
    result={}
    for row in PINS:
        path=ROOT/"candidate"/row["path"];raw=path.read_bytes()
        blob=hashlib.sha1(b"blob "+str(len(raw)).encode()+b"\0"+raw).hexdigest()
        require(digest(raw)==row["sha256"] and blob==row["gitBlob"],"Source pin mismatch: "+row["path"])
        result[row["path"]]={"sha256":digest(raw),"gitBlob":blob,"bytes":len(raw)}
    return result
report={"schema":"tastetable.root-existing-bundle-receiving/1","startedAt":datetime.datetime.now(datetime.UTC).isoformat(),"driverSha256":digest(Path(__file__).read_bytes()),"sourceVersionOfOrdinaryZip":"v1","currentSourceVersion":"v2 diagnostic-only successor","batchRerun":False}
try:
    before=snapshot();raw=ZIP.read_bytes();require(digest(raw)==EXPECTED_ZIP,"ZIP pin mismatch")
    report["archive"]={"path":str(ZIP),"bytes":len(raw),"sha256":digest(raw)}
    with zipfile.ZipFile(ZIP) as archive:
        infos=archive.infolist();names=[x.filename for x in infos]
        require(len(names)==len(set(names)),"Duplicate archive members")
        require(sum(x.file_size for x in infos)<20*1024*1024,"Unexpected expanded archive")
        require(all(re.fullmatch(r"(?:index\.json|READ-ME\.txt|profiles/\d{3}/(?:native-plan|saved-week)\.json)",n) for n in names),"Unexpected member path")
        require(archive.testzip() is None,"CRC failure")
        index=json.loads(archive.read("index.json"));readme=archive.read("READ-ME.txt").decode("utf8")
        require(index["format"]=="tastetable.native-batch.v1","Unexpected format")
        require((index["requested"],index["succeeded"],index["failed"],index["status"])==(3,2,1,"partial"),"Incorrect partial index")
        require([x["position"] for x in index["entries"]]==[1,2,3],"Input order changed")
        require([x["status"] for x in index["entries"]]==["saved","failed","saved"],"Middle refusal lost")
        require(index["entries"][1]["error"]["stage"]=="producer","Unexpected refusal stage")
        require("PARTIAL BUNDLE" in readme and "002. FAILED" in readme,"Unreadable refusal")
        expected={"index.json","READ-ME.txt"};pairs=[];input_pins=[]
        for item in index["entries"]:
            label=Path(item["input"]["path"]);source=(label if label.is_absolute() else ZIP.parent/label).resolve()
            require(source.is_relative_to((ROOT/"mixed-result-example").resolve()),"Input outside authored example")
            captured=source.read_bytes()
            require(len(captured)==item["input"]["bytes"] and digest(captured)==item["input"]["sha256"],"Captured input pin mismatch")
            input_pins.append({"path":str(source),"bytes":len(captured),"sha256":digest(captured)})
            if item["status"]!="saved":continue
            texts={}
            for kind in ("nativePlan","savedWeek"):
                pin=item[kind];data=archive.read(pin["file"]);expected.add(pin["file"])
                require(len(data)==pin["bytes"] and digest(data)==pin["sha256"],"Output pin mismatch")
                texts[kind]=data.decode("utf8")
            pairs.append({"position":item["position"],"nativeText":texts["nativePlan"],"weekText":texts["savedWeek"],"conversion":item["conversion"]})
        require(set(names)==expected,"Missing or surplus archive outputs")
    js="""import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {readWeekFile}=await import(pathToFileURL(process.argv[1]).href);
const input=JSON.parse(readFileSync(0,'utf8'));
const result=[];
for(const item of input.pairs){
 const native=JSON.parse(item.nativeText),week=readWeekFile(item.weekText);
 assert.deepEqual(week.inputs,native.profile);
 assert.deepEqual(week.response,native.response);
 assert.equal(week.state.weekStart,input.weekStart);
 assert.equal(week.calendarId,item.conversion.calendarId);
 assert.equal(native.provenance.mode,'offline-fixtures');
 assert.equal(native.response.mock,true);
 result.push({position:item.position,weekStart:week.state.weekStart,calendarId:week.calendarId,picks:week.state.picks.length,profile:native.profile});
}
assert.equal(new Set(result.map(x=>x.calendarId)).size,2);
assert.notDeepEqual(result[0].profile,result[1].profile);
console.log(JSON.stringify({node:process.version,weeks:result.map(({profile,...x})=>x),strictReaderAccepted:true,profilesSeparate:true}));
"""
    command=["/usr/bin/node","--input-type=module","--eval",js,str(ROOT/"candidate/static/week_file.mjs")]
    run=subprocess.run(command,input=json.dumps({"pairs":pairs,"weekStart":index["weekStart"]}),text=True,capture_output=True,timeout=30,cwd=ROOT)
    (OUT/"node.stdout").write_text(run.stdout);(OUT/"node.stderr").write_text(run.stderr)
    report["nodeExit"]=run.returncode;report["command"]=[command[0],command[1],command[2],"<retained inline source>",command[-1]]
    require(run.returncode==0,"Actual strict-reader process failed: "+run.stderr)
    report["receiver"]=json.loads(run.stdout);report["inputPins"]=input_pins;report["archiveMembers"]=names
    require(snapshot()==before,"Source changed during receiving")
    require(digest(ZIP.read_bytes())==EXPECTED_ZIP,"Archive changed during receiving")
    for row in input_pins:require(digest(Path(row["path"]).read_bytes())==row["sha256"],"Input changed during receiving")
    report.update(passed=True,sourceUnchanged=True,archiveUnchanged=True,inputsUnchanged=True,sourcePins=before)
except BaseException as exc:
    report.update(passed=False,error={"type":type(exc).__name__,"message":str(exc),"traceback":traceback.format_exc()})
finally:
    report["finishedAt"]=datetime.datetime.now(datetime.UTC).isoformat()
    data=(json.dumps(report,indent=2,sort_keys=True)+"\n").encode()
    with (OUT/"receipt.json").open("xb") as f:f.write(data);f.flush();os.fsync(f.fileno())
    require((OUT/"receipt.json").read_bytes()==data,"Receipt readback changed")
print(json.dumps({"passed":report["passed"],"receipt":str(OUT/"receipt.json"),"sha256":digest(data),"receiver":report.get("receiver"),"error":report.get("error")}),flush=True)
raise SystemExit(0 if report["passed"] else 1)
