#!/usr/bin/env python3
"""Recompute the captured author packet without launching TasteTable or a browser."""
from __future__ import annotations
import argparse, datetime, hashlib, io, json, re, tarfile, zipfile
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
 baseline=json_at(data,"baseline-source.json")
 baseline_manifest=json_at(data,"evidence/baseline-source-manifest.json")
 frozen=json_at(data,"candidate-frozen-manifest.json")
 primary=json_at(data,"evidence/source-and-coordination.json")["canonicalTree"]
 leaves={x["path"]:x for x in primary["tree"] if x["type"]=="blob"}
 require(primary["sha"]==baseline["tree"]==frozen["canonical_tree"]=="25b453e345bedd3f280e3d555df12561ef084cc6","canonical tree identity")
 require(baseline["commit"]==frozen["canonical_parent"]=="689ddc9a6a4f5f12068e1e99127cc77482c53924","canonical commit identity")
 require(len(baseline["files"])==48 and len(frozen["source_files"])==53 and len(frozen["scope"])==10,"source scope denominator")
 for name,text in baseline["files"].items():
  b=text.encode();pin=baseline_manifest["files"][name]
  require(git(b)==pin["git_blob"]==leaves[name]["sha"] and sha(b)==pin["sha256"] and len(b)==pin["bytes"],"baseline file identity: "+name)
 for name,pin in frozen["source_files"].items():
  b=data["source/"+name]
  require(git(b)==pin["git_blob"] and sha(b)==pin["sha256"] and len(b)==pin["bytes"],"candidate file identity: "+name)
 unowned=0
 for name,text in baseline["files"].items():
  if name not in frozen["scope"]:
   require(data["source/"+name]==text.encode(),"unowned source changed: "+name);unowned+=1
 require(unowned==43,"unowned baseline file count")
 require(data["source/web-demo-offline/calendar.js"]==data["source/static/calendar.js"],"writer copy differs")
 require(git(data["source/web-demo-offline/calendar.js"])=="dbed22d2cb91090bccec9472fbffd2854eed2722","received writer identity")
 delta=json_at(data,"evidence/candidate-source-v1.json")["files"]
 require(set(delta)==set(frozen["scope"])-{"web-demo-offline/dist/tastetable-offline-studio.zip"},"source input carrier scope")
 for name,text in delta.items():require(text.encode()==data["source/"+name],"source input carrier differs: "+name)
 # Source reconstruction makes the small existing-owner seam directly reviewable.
 original_app=baseline["files"]["web-demo-offline/app.mjs"]
 candidate_app=data["source/web-demo-offline/app.mjs"].decode()
 addition='import { mountOfflineCalendar } from "./offline_calendar.mjs";\n'
 require(candidate_app.count(addition)==1,"owned import count")
 stripped=candidate_app.replace(addition,"")
 start=stripped.index("function calendarContext() {")
 end=stripped.index("function retireOpening(",start)
 stripped=stripped[:start]+stripped[end:]
 require(stripped.count("offlineCalendar.refresh();")==3,"owned refresh hook count")
 stripped=stripped.replace("    offlineCalendar.refresh();\n","").replace("  offlineCalendar.refresh();\n","")
 require(stripped==original_app,"existing app reconstruction")
 # Complete source/ZIP/receiving custody.
 portable=json_at(data,"evidence/portable-v1.json")
 archive=data["source/web-demo-offline/dist/tastetable-offline-studio.zip"]
 require(sha(archive)==portable["archive"]["sha256"] and git(archive)==portable["archive"]["git_blob"],"portable archive identity")
 with zipfile.ZipFile(io.BytesIO(archive)) as z:
  names=z.namelist();require(len(names)==41 and set(names)==set(portable["members"]),"portable member denominator")
  for name in names:
   b=z.read(name);pin=portable["members"][name]
   require(b==data["source/"+name] and sha(b)==pin["sha256"] and len(b)==pin["bytes"],"portable byte mismatch: "+name)
 old=data["evidence/baseline-portable-studio.zip"]
 require(git(old)=="2743449261da7f61a18bac12337b0f6e1582f388","historical package identity")
 with zipfile.ZipFile(io.BytesIO(old)) as z:require(len(z.namelist())==35,"historical package count")
 installed=json_at(data,"evidence/static-receiver-v1/receipt.json")
 require(installed["complete"] and installed["rollback_http_status"]==404 and len(installed["files"])==41 and len(installed["http"])==82,"native installation/rollback result")
 for phase in ("installed","restored"):
  rows=[x for x in installed["http"] if x["phase"]==phase]
  require(len(rows)==41 and {x["path"] for x in rows}==set(installed["files"]),"HTTP readback denominator")
  for row in rows:
   require(row["status"]==200 and row["sha256"]==sha(data["source/web-demo-offline/"+row["path"]]),"HTTP content identity")
 # Native unit output is a captured run, not a new run of the product.
 unit=json_at(data,"evidence/candidate-unit-v1.json")
 log=data["evidence/candidate-unit-v1.log"]
 require(unit["returncode"]==0 and sha(log)==unit["log_sha256"] and len(log)==unit["log_bytes"],"native unit command/log")
 for label,value in (("tests",61),("pass",61),("fail",0),("skipped",0)):
  require(re.search(r"(?m)^ℹ "+label+r" "+str(value)+r"$",log.decode()) is not None,"native unit "+label)
 for name,pin in unit["before"].items():
  require(unit["after"][name]==pin and pin["sha256"]==sha(data["source/"+name]),"unit source custody")
 base_browser=json_at(data,"evidence/baseline-browser/report.json")
 require(counts(base_browser)=={"passed":9,"failed":1},"baseline browser counts")
 failed=[x for x in base_browser["checks"] if not x["pass"]]
 require(failed[0]["name"]=="offline studio offers calendar export for this valid displayed arrangement" and failed[0]["actual"]==0,"baseline failure attribution")
 candidate=json_at(data,"evidence/candidate-browser-v1/report.json")
 packaged=json_at(data,"evidence/portable-browser-v1/report.json")
 require(counts(candidate)=={"passed":73,"failed":0} and len(candidate["downloads"])==19,"candidate browser counts")
 require(counts(packaged)=={"passed":7,"failed":0} and len(packaged["downloads"])==3,"portable browser counts")
 for report,prefix in ((base_browser,"evidence/baseline-browser/"),(candidate,"evidence/candidate-browser-v1/"),(packaged,"evidence/portable-browser-v1/")):
  require(not report["errors"],"browser application error")
  require(all(x["method"]=="GET" and x["url"].startswith("http://127.0.0.1:") for x in report["requests"]),"unexpected browser request")
  for download in report["downloads"]:
   b=data[prefix+download["path"]]
   require(sha(b)==download["sha256"] and len(b)==download["bytes"],"actual download custody")
  require(report["sourceBefore"]==report["sourceAfter"],"browser source changed")
  for name,pin in report["sourceBefore"].items():
   if report is base_browser:
    expected_hash=sha(baseline["files"][name].encode())
   else:
    expected_hash=sha(data["source/"+name])
   require(pin==expected_hash,"browser source binding: "+name)
 # Recompute exact descriptions and original identifiers for every calendar download.
 prefix="evidence/candidate-browser-v1/"
 pairs=[("02-first-calendar.ics","03-after-calendar.json"),("04-repeated-calendar.ics","03-after-calendar.json"),
        ("06-reopened-calendar.ics","07-reopened-week.json"),("08-moved-calendar.ics","09-moved-week.json"),
        ("10-next-week-calendar.ics","11-next-week.json"),("12-mei-calendar.ics","13-mei-week.json"),
        ("15-retry-calendar.ics","16-retry-week.json"),("18-phone-keyboard-calendar.ics","19-phone-week.json")]
 event_count=0;values={}
 for calendar,saved in pairs:
  values[calendar]=check_calendar(data[prefix+calendar],json_at(data,prefix+saved));event_count+=len(values[calendar])
 require(data[prefix+"02-first-calendar.ics"]==data[prefix+"04-repeated-calendar.ics"]==data[prefix+"06-reopened-calendar.ics"],"repeat/reopen calendar bytes")
 require({x["UID"] for x in values["02-first-calendar.ics"]}=={x["UID"] for x in values["08-moved-calendar.ics"]},"move changed occurrence identity")
 require(not ({x["UID"] for x in values["08-moved-calendar.ics"]}&{x["UID"] for x in values["10-next-week-calendar.ics"]}),"changed week reused event identity")
 require(data[prefix+"05-original-source.json"]==data["source/web-demo-offline/data/records/rosa-7.json"],"original source download changed")
 for name in ("01-before-calendar.json","14-after-refusal.json","17-after-source-replacement.json"):
  require(json_at(data,prefix+name)["calendarId"] is None,"premature calendar identity")
 portable_prefix="evidence/portable-browser-v1/"
 psaved=json_at(data,portable_prefix+"saved-week.json")
 for name in ("first-calendar.ics","reopened-calendar.ics"):
  event_count+=len(check_calendar(data[portable_prefix+name],psaved))
 require(data[portable_prefix+"first-calendar.ics"]==data[portable_prefix+"reopened-calendar.ics"],"portable reopened bytes")
 return {"format":"tastetable.offline-calendar-author-verification/1","source_projection":frozen["local_projection_commit"],
  "raw_archive":{"bytes":path.stat().st_size,"sha256":sha(path.read_bytes()),"ordinary_members":len(data),"listed_artifacts":len(manifest["files"])},
  "source":{"canonical_parent":frozen["canonical_parent"],"baseline_files":48,"candidate_files":53,"scoped_paths":10,"unowned_files_preserved":43,"calendar_writer_git":"dbed22d2cb91090bccec9472fbffd2854eed2722","existing_app_reconstructs_exactly":True},
  "qualification":{"native_unit_methods":61,"baseline_browser":{"passed":9,"missing_capability":1},"candidate_browser":{"checks":73,"actual_calendar_downloads":8,"actual_saved_week_downloads":10,"actual_source_downloads":1},"portable_browser":{"checks":7,"actual_calendar_downloads":2,"actual_saved_week_downloads":1},"calendar_events_recomputed":event_count,"exact_complete_descriptions":True,"static_files":41,"http_readbacks":82,"rollback_status":404},
  "interpretation":"Saved native author evidence recomputed without running the application, writer, browser or tests. Independent receiving is a separate packet."}
if __name__=="__main__":
 parser=argparse.ArgumentParser();parser.add_argument("archive",type=Path);args=parser.parse_args()
 print(json.dumps(verify(args.archive),indent=2,ensure_ascii=False))
