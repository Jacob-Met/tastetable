#!/usr/bin/env python3
"""Verify the frozen current-source composition and captured calendar results without launching the product."""
from __future__ import annotations
import argparse, datetime, difflib, hashlib, io, json, re, tarfile, zipfile
from pathlib import PurePosixPath,Path
DAYS=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
CAUTION="Suggested outing only; no booking or opening hours confirmed. Not medical or dietary advice. Confirm accessibility, texture and sodium needs with the venue and the person's care team."
DEMO="DEMO: synthetic Qloo fixture; these venues are fictional."
def require(ok,message):
 if not ok:raise ValueError(message)
def sha(b):return hashlib.sha256(b).hexdigest()
def git(b):return hashlib.sha1(b"blob "+str(len(b)).encode()+b"\0"+b).hexdigest()
def read_packet(path):
 with tarfile.open(path,"r:xz") as archive:
  members=archive.getmembers();names=[m.name for m in members]
  require(len(names)==len(set(names)),"duplicate archive member")
  data={}
  for m in members:
   p=PurePosixPath(m.name)
   require(m.isfile() and not p.is_absolute() and ".." not in p.parts,"unsafe archive member")
   data[m.name]=archive.extractfile(m).read()
 manifest=json.loads(data["native-manifest.json"])
 require(set(manifest["files"])==set(data)-{"native-manifest.json"},"raw manifest denominator")
 for name,pin in manifest["files"].items():
  require(len(data[name])==pin["bytes"] and sha(data[name])==pin["sha256"],"raw artifact mismatch: "+name)
 return data,manifest
def json_at(data,name):return json.loads(data[name])
def counts(report):
 rows=report["checks"]
 return {"passed":sum(bool(x["pass"]) for x in rows),"failed":sum(not x["pass"] for x in rows)}
def unescape(value):
 return re.sub(r"\\([\\,;n])",lambda m:"\n" if m[1]=="n" else m[1],value)
def events(raw):
 require(raw.endswith(b"\r\n"),"calendar trailing CRLF")
 require(b"\n" not in raw.replace(b"\r\n",b"") and b"\r" not in raw.replace(b"\r\n",b""),"calendar line endings")
 require(all(len(line)<=75 for line in raw.split(b"\r\n")),"UTF-8 fold width")
 text=re.sub(r"\r\n[ \t]","",raw.decode("utf-8"))
 lines=text.split("\r\n")
 require(lines[:4]==["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//TasteTable//Suggested weekly plan//EN","CALSCALE:GREGORIAN"] and lines[-2]=="END:VCALENDAR","calendar envelope")
 out=[];entry=None
 for line in lines:
  if line=="BEGIN:VEVENT":require(entry is None,"nested event");entry={}
  elif line=="END:VEVENT":require(entry is not None,"orphan event end");out.append(entry);entry=None
  elif entry is not None:
   key,sep,value=line.partition(":");require(bool(sep) and key not in entry,"duplicate/invalid event property");entry[key]=value
 require(entry is None,"truncated event")
 return out
def check_calendar(raw,saved):
 plan=saved["response"]["plan"]
 require(saved["response"]["mock"] is True,"calendar source must remain fictional")
 original=plan["meals"]+([plan["outing"]] if plan.get("outing") else [])
 rows=[(i,p,saved["week"]["assignments"]["pick-"+str(i)]) for i,p in enumerate(original)]
 rows=[x for x in rows if x[2] is not None]
 rows.sort(key=lambda x:(DAYS.index(x[2]),x[0]))
 actual=events(raw);require(len(actual)==len(rows),"included event count")
 start=datetime.date.fromisoformat(saved["week"]["start"])
 require(start.weekday()==0,"week start must be Monday")
 stamp=re.sub(r"\.\d{3}Z$","Z",saved["receivedAt"].replace("-","").replace(":",""))
 require(re.fullmatch("[0-9a-f]{32}",saved["calendarId"]) is not None,"calendar identity")
 for event,(i,pick,day) in zip(actual,rows):
  date=start+datetime.timedelta(days=DAYS.index(day));end=date+datetime.timedelta(days=1)
  description="\n\n".join([DEMO,CAUTION,"Qloo entity ID: "+pick["entity_id"],
    "Originally suggested for: "+pick["day"]+". Arranged for: "+day+" "+date.isoformat()+".",
    "Why this suggestion: "+pick["why"],*["Plan note: "+note for note in plan["notes"]]])
  expected={"UID":saved["calendarId"]+"-"+start.strftime("%Y%m%d")+"-pick-"+str(i)+"@tastetable.invalid",
    "DTSTAMP":stamp,"DTSTART;VALUE=DATE":date.strftime("%Y%m%d"),"DTEND;VALUE=DATE":end.strftime("%Y%m%d"),
    "SUMMARY":"[DEMO] TasteTable suggestion: "+pick["name"],"DESCRIPTION":description,
    "STATUS":"TENTATIVE","TRANSP":"TRANSPARENT","CLASS":"PRIVATE"}
  require(set(event)==set(expected),"calendar event fields")
  for key,want in expected.items():
   value=unescape(event[key]) if key in ("SUMMARY","DESCRIPTION") else event[key]
   require(value==want,"calendar "+key+" differs from the saved original and arrangement")
 require(len({x["UID"] for x in actual})==len(actual),"duplicate occurrence identity")
 return actual
def verify(path):
 data,manifest=read_packet(path)
 frozen=json_at(data,"current-frozen-manifest.json")
 inp=json_at(data,"current-composition-input.json")
 original=json_at(data,"original-candidate-frozen-manifest.json")
 base=json_at(data,"baseline-source.json")
 proof=json_at(data,"current-evidence/source-proof.json")
 require(inp["parent"]==frozen["canonical_parent"]==proof["canonical_parent"]=="e0f6fbaf1f81fbb1e9926948294549c744228def","qualified canonical parent")
 require(inp["tree"]["sha"]==frozen["canonical_tree"]==proof["canonical_tree"]=="57b0980e39489d48a9bea5c89ae4d463c97944b8","qualified canonical tree")
 require(not inp["tree"]["truncated"],"complete canonical tree")
 leaves={x["path"]:x for x in inp["tree"]["tree"] if x["type"]=="blob"}
 require(not any(PurePosixPath(n).name=="AGENTS.md" for n in leaves),"applicable instruction discovery changed")
 parent={n:s.encode() for n,s in base["files"].items()}
 parent.update({n:s.encode() for n,s in inp["current_files"].items()})
 zipname="web-demo-offline/dist/tastetable-offline-studio.zip"
 parent[zipname]=data["current-evidence/parent-portable-studio.zip"]
 require(len(parent)==52 and len(frozen["source_files"])==56 and len(frozen["scope"])==10,"source denominators")
 def pin_matches(raw,pin):
  return len(raw)==pin["bytes"] and sha(raw)==pin["sha256"] and git(raw)==pin["git_blob"]
 for name,raw in parent.items():
  require(git(raw)==leaves[name]["sha"] and leaves[name]["mode"]=="100644","canonical parent source "+name)
  if name!=zipname:require(pin_matches(raw,proof["parent_files"][name]),"recorded parent source "+name)
 for name,pin in frozen["source_files"].items():
  raw=data["current-source/"+name]
  require(pin_matches(raw,pin) and pin["mode"]=="100644","frozen source "+name)
  if name!=zipname:require(pin_matches(raw,proof["source_files"][name]),"qualified source "+name)
 for name,pin in frozen["scope"].items():
  require(pin_matches(data["current-source/"+name],pin),"scope source "+name)
  require(pin["before_git_blob"]==leaves.get(name,{}).get("sha"),"scope parent "+name)
 require(set(frozen["scope"])==set(inp["composed_files"])|{zipname},"composition source scope")
 for name,text in inp["composed_files"].items():
  require(text.encode()==data["current-source/"+name],"composed carrier "+name)
 unowned=set(parent)-set(frozen["scope"])
 require(len(unowned)==46 and unowned==set(frozen["unowned_current_files_preserved"])==set(proof["unowned_current_files"]),"unowned current scope")
 for name in unowned:require(parent[name]==data["current-source/"+name],"changed unowned source "+name)
 require(sha(data["original-candidate-frozen-manifest.json"])==frozen["original_accepted_manifest_sha256"]=="856b8761f80276fec0b32496144c7c40b9090ef38b9333a2effd2216772dc50b","original freeze identity")
 require(len(frozen["original_new_files_unchanged"])==4,"unchanged new source denominator")
 for name in frozen["original_new_files_unchanged"]:
  require(pin_matches(data["current-source/"+name],original["scope"][name]),"original new source drift "+name)
 require(data["current-source/web-demo-offline/calendar.js"]==data["current-source/static/calendar.js"],"unchanged received writer")
 require(git(data["current-source/static/calendar.js"])=="dbed22d2cb91090bccec9472fbffd2854eed2722","writer producer identity")
 # Removing only the original calendar additions reconstructs the current owner's app.
 app=data["current-source/web-demo-offline/app.mjs"].decode()
 addition='import { mountOfflineCalendar } from "./offline_calendar.mjs";\n'
 require(app.count(addition)==1,"calendar import count")
 stripped=app.replace(addition,"")
 start=stripped.index("function calendarContext() {");end=stripped.index("function retireOpening(",start)
 stripped=stripped[:start]+stripped[end:]
 require(stripped.count("offlineCalendar.refresh();")==3,"calendar refresh hook count")
 stripped=stripped.replace("    offlineCalendar.refresh();\n","").replace("  offlineCalendar.refresh();\n","")
 require(stripped.encode()==parent["web-demo-offline/app.mjs"],"current arrangement-history app reconstruction")
 # Recompute the complete five-file source patch from independently pinned parent bytes.
 patch=data["current-evidence/current-owner-calendar-hooks.patch"].decode()
 changed_existing=sorted(set(frozen["scope"])&set(parent)-{zipname})
 expected_patch="".join("".join(difflib.unified_diff(parent[n].decode().splitlines(True),data["current-source/"+n].decode().splitlines(True),fromfile="current/"+n,tofile="composed/"+n)) for n in changed_existing)
 require(len(changed_existing)==5 and patch==expected_patch,"exact complete owner source patch")
 bindings=json_at(data,"current-evidence/browser-bindings.json")
 driver=data["current-evidence/browser-driver.mjs"].decode()
 require(len(bindings["bindings"])==5,"browser mechanical binding count")
 for before,after in reversed(bindings["bindings"]):
  require(driver.count(after)==1,"unique browser mechanical binding")
  driver=driver.replace(after,before)
 require(driver.encode()==data["original-browser-driver.mjs"] and sha(driver.encode())==bindings["originalDriverSha256"]=="ce45dbe00df827e5fff4d46beef1f03f64500920ac402947bbe16b65eb282489","unchanged original browser criteria")
 # Both original/current portable artifacts are retained, independently of old v1 history.
 portable=json_at(data,"current-evidence/portable.json")
 rawzip=data["current-source/"+zipname]
 require(pin_matches(rawzip,portable["archive"]),"current ZIP identity")
 with zipfile.ZipFile(io.BytesIO(rawzip)) as z:
  names=z.namelist();require(len(names)==len(set(names))==42 and set(names)==set(portable["members"]),"current ZIP member denominator")
  for name in names:require(z.read(name)==data["current-source/"+name] and pin_matches(z.read(name),portable["members"][name]),"current ZIP member "+name)
 with zipfile.ZipFile(io.BytesIO(parent[zipname])) as z:
  names=z.namelist();require(len(names)==len(set(names))==39,"current parent ZIP member denominator")
  for name in names:require(z.read(name)==parent[name],"current parent ZIP already matched source "+name)
 require(pin_matches(parent[zipname],portable["parent_archive"]),"current parent ZIP identity")
 received=json_at(data,"current-evidence/static/receipt.json")
 require(received["complete"] and received["rollback_http_status"]==404 and len(received["files"])==42 and len(received["http"])==84,"static receiver counts")
 for phase in ("installed","restored"):
  rows=[x for x in received["http"] if x["phase"]==phase]
  require(len(rows)==42 and {x["path"] for x in rows}==set(received["files"]),"static phase denominator")
  for row in rows:require(row["status"]==200 and row["sha256"]==sha(data["current-source/web-demo-offline/"+row["path"]]),"static actual response identity")
 unit=json_at(data,"current-evidence/unit.json");log=data["current-evidence/unit.log"]
 require(unit["returncode"]==0 and sha(log)==unit["log_sha256"] and len(log)==unit["log_bytes"],"native unit invocation")
 for label,want in (("tests",69),("pass",69),("fail",0),("skipped",0)):
  require(re.search(r"(?m)^ℹ "+label+" "+str(want)+"$",log.decode()) is not None,"native unit count "+label)
 require(set(unit["before"])==set(frozen["source_files"])-{zipname},"native tested source denominator")
 for name,pin in unit["before"].items():
  require(unit["after"][name]==pin and pin_matches(data["current-source/"+name],pin),"native source stability "+name)
 for stem,drivername in (("browser","browser-driver.mjs"),("history-browser","history-browser-driver.mjs"),("portable-python-browser","portable-python-browser.mjs")):
  command=json_at(data,"current-evidence/"+stem+"-command.json")
  log=data["current-evidence/"+stem+".log"];driver=data["current-evidence/"+drivername]
  require(command["returncode"]==0 and sha(log)==command["log_sha256"] and len(log)==command["log_bytes"],"browser invocation "+stem)
  require(command["argv"]==["/opt/homebrew/bin/node","/Users/me/tastetable-calendar-066deeadcc8b/current-evidence/"+drivername],"recorded browser entry point "+stem)
  if "driver_sha256" in command:
   require(sha(driver)==command["driver_sha256"] and len(driver)==command["driver_bytes"],"browser driver "+stem)
  else:
   require(stem=="history-browser","unexpected missing invocation driver hash")
   require(sha(driver)==manifest["files"]["current-evidence/"+drivername]["sha256"],"preserved history driver bytes")
 browser_specs=[("browser-v1",73,19,55,"sourceBefore","sourceAfter"),("history-browser-v1",19,16,55,"before","after"),("portable-python-browser",7,3,42,"sourceBefore","sourceAfter")]
 for directory,checks,downloads,sourcecount,before,after in browser_specs:
  report=json_at(data,"current-evidence/"+directory+"/report.json")
  require(counts(report)=={"passed":checks,"failed":0} and len(report["downloads"])==downloads,"browser actual check/download denominator "+directory)
  require(not report["errors"],"browser exception "+directory)
  require(all(x["method"]=="GET" and x["url"].startswith("http://127.0.0.1:") for x in report["requests"]),"unexpected external/mutating request")
  require(len(report[before])==sourcecount and report[before]==report[after],"browser source count/stability "+directory)
  for name,pin in report[before].items():require(pin==sha(data["current-source/"+name]),"browser source binding "+name)
  for download in report["downloads"]:
   raw=data["current-evidence/"+directory+"/"+download["path"]]
   require(sha(raw)==download["sha256"] and len(raw)==download["bytes"],"actual downloaded bytes "+download["path"])
 packaged=json_at(data,"current-evidence/portable-python-browser/report.json")
 server=packaged["pythonServer"]
 require(server["argv"][:7]==["python3","-u","-m","http.server","0","--bind","127.0.0.1"],"documented Python server")
 require(server["signal"]=="SIGTERM" and server["exitCode"] is None and "private static server" in server["teardown"],"explicit own-server teardown")
 require(b"Serving HTTP" in data["current-evidence/portable-python-browser/python-server.stdout"] and b" 200 " in data["current-evidence/portable-python-browser/python-server.stderr"],"actual Python server evidence")
 # Recompute every complete ICS event against actual saved records and arrangements.
 prefix="current-evidence/browser-v1/"
 pairs=[("02-first-calendar.ics","03-after-calendar.json"),("04-repeated-calendar.ics","03-after-calendar.json"),("06-reopened-calendar.ics","07-reopened-week.json"),("08-moved-calendar.ics","09-moved-week.json"),("10-next-week-calendar.ics","11-next-week.json"),("12-mei-calendar.ics","13-mei-week.json"),("15-retry-calendar.ics","16-retry-week.json"),("18-phone-keyboard-calendar.ics","19-phone-week.json")]
 values={};event_count=0
 for calendar,saved in pairs:
  values[calendar]=check_calendar(data[prefix+calendar],json_at(data,prefix+saved));event_count+=len(values[calendar])
 require(data[prefix+"02-first-calendar.ics"]==data[prefix+"04-repeated-calendar.ics"]==data[prefix+"06-reopened-calendar.ics"],"repeat/Open byte identity")
 def ids(rows):return {x["UID"] for x in rows}
 require(ids(values["02-first-calendar.ics"])==ids(values["08-moved-calendar.ics"]),"move UID continuity")
 require(not ids(values["08-moved-calendar.ics"])&ids(values["10-next-week-calendar.ics"]),"new week UID separation")
 require(data[prefix+"05-original-source.json"]==data["current-source/web-demo-offline/data/records/rosa-7.json"],"original recorded source download")
 for name in ("01-before-calendar.json","14-after-refusal.json","17-after-source-replacement.json"):
  require(json_at(data,prefix+name)["calendarId"] is None,"premature identity retention")
 prefix="current-evidence/history-browser-v1/"
 hpairs=[("01-initial.ics","02-initial.json"),("03-moved.ics","04-moved.json"),("05-undone.ics","02-initial.json"),("06-redone.ics","04-moved.json"),("07-next-week.ics","08-next-week.json"),("09-old-week.ics","04-moved.json"),("10-valid-redone.ics","08-next-week.json"),("11-omitted.ics","12-omitted.json"),("13-restored.ics","08-next-week.json"),("14-after-pending-open.ics","04-moved.json"),("15-new-source.ics","16-new-source.json")]
 hvalues={}
 for calendar,saved in hpairs:
  hvalues[calendar]=check_calendar(data[prefix+calendar],json_at(data,prefix+saved));event_count+=len(hvalues[calendar])
 for group in (("01-initial.ics","05-undone.ics"),("03-moved.ics","06-redone.ics","09-old-week.ics","14-after-pending-open.ics"),("07-next-week.ics","10-valid-redone.ics","13-restored.ics")):
  require(len({data[prefix+n] for n in group})==1,"history exact restored bytes")
 require(ids(hvalues["01-initial.ics"])==ids(hvalues["03-moved.ics"]),"history same-week UIDs")
 require(not ids(hvalues["03-moved.ics"])&ids(hvalues["07-next-week.ics"]),"history new-week UIDs")
 require(ids(hvalues["11-omitted.ics"])<ids(hvalues["07-next-week.ics"]),"history omitted occurrence")
 require(not ids(hvalues["15-new-source.ics"])&ids(hvalues["01-initial.ics"]),"new source identity")
 prefix="current-evidence/portable-python-browser/";saved=json_at(data,prefix+"saved-week.json")
 for name in ("first-calendar.ics","reopened-calendar.ics"):event_count+=len(check_calendar(data[prefix+name],saved))
 require(data[prefix+"first-calendar.ics"]==data[prefix+"reopened-calendar.ics"],"fresh package Open byte identity")
 return {"format":"tastetable.offline-calendar-current-verification/1","qualified_parent":frozen["canonical_parent"],"source_projection":frozen["local_projection_commit"],
  "raw_archive":{"bytes":path.stat().st_size,"sha256":sha(path.read_bytes()),"ordinary_members":len(data),"listed_artifacts":len(manifest["files"])},
  "source":{"current_parent_files":52,"frozen_source_files":56,"scoped_paths":10,"unowned_current_files_preserved":46,"unchanged_original_new_files":4,"current_app_reconstructs_parent":True,"original_browser_criteria_reconstructed":True},
  "native_unit":{"methods":69,"passed":69,"failed":0},
  "actual_browser":{"full_checks":73,"history_checks":19,"python_package_checks":7,"actual_downloads":38,"calendar_downloads":21,"recomputed_complete_events":event_count,"application_errors":0},
  "portable":{"current_parent_members":39,"qualified_members":42,"actual_static_readbacks":84,"rollback_status":404,"fresh_python_http_server":True},
  "interpretation":"This is saved-evidence verification, not an additional application run or independent review. Original v1 evidence and peer acceptance remain separately scoped; these actual current-source runs cover the arrangement-history composition."}
if __name__=="__main__":
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("archive",type=Path);args=parser.parse_args()
 print(json.dumps(verify(args.archive),indent=2,ensure_ascii=False))
