#!/usr/bin/env python3
"""Independent physical TasteTable export comparison; Python standard library only."""
import argparse, copy, csv, datetime, hashlib, io, json, os, pathlib, stat, sys, traceback
ROOT = pathlib.Path(__file__).resolve().parent
INSTALL = pathlib.Path("/Users/me/Applications/TasteTableVisitRecord-c945953fdeb7")
NOTE = 'Receiver note: café, "shared table".\nPlease keep the saved week.'
HEADERS = ["source_name","week_start","source_mode","source_received_at","source_saved_at","record_saved_at","occurrence_key","venue_name","entity_id","kind","original_day","planned_day","planned_date","outcome","actual_date","note","original_explanation"]
def require(condition, message):
    if not condition: raise AssertionError(message)
def pins(data):
    return {"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest(),"git_blob":hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()}
def read(path):
    before=path.lstat()
    require(stat.S_ISREG(before.st_mode) and not path.is_symlink() and before.st_size<=2*1024**2,"bounded regular file required")
    with path.open("rb") as stream: data=stream.read(2*1024**2+1)
    after=path.lstat()
    require((before.st_ino,before.st_size,before.st_mtime_ns)==(after.st_ino,after.st_size,after.st_mtime_ns),"input changed during read")
    require(len(data)==before.st_size,"input byte length")
    return data
def time_bound(value, record):
    require(isinstance(value,str),"timestamp must be a string")
    parsed=datetime.datetime.fromisoformat(value.replace("Z","+00:00"))
    require(parsed.tzinfo==datetime.timezone.utc and value.endswith("Z"),"UTC timestamp required")
    require(len(value)==24 and value[19]=="." and value[20:23].isdigit(),"original millisecond ISO format")
    actual=parsed.timestamp()*1000
    require(record["before_ms"]-1000<=actual<=record["after_ms"]+1000,"timestamp outside its own actual export interval")
    require(record["before_ms"]<=record["after_ms"],"clock interval order")
    return {"value":value,"before_ms":record["before_ms"],"after_ms":record["after_ms"],"allowance_ms":1000}
def check_export(record, original, saved):
    path=pathlib.Path(record["path"])
    require(path.is_absolute() and path.is_relative_to(ROOT/"browser"),"physical download inside receiver browser tree")
    data=read(path)
    require(pins(data)==record["pin"],"physical download differs from witnessed identity")
    result={"kind":record["kind"],"physical_path":str(path),"pin":pins(data)}
    if record["kind"] in ("json","recovered_json"):
        text=data.decode("utf-8","strict")
        value=json.loads(text)
        bound=time_bound(value["savedAt"],record)
        expected=copy.deepcopy(original)
        expected["visits"][0]["note"]=NOTE
        expected["savedAt"]=value["savedAt"]
        require(value==expected,"complete JSON envelope differs beyond fixed note and bounded savedAt")
        expected_bytes=(json.dumps(expected,ensure_ascii=False,indent=2)+"\n").encode("utf-8")
        require(data==expected_bytes,"complete original JSON serialization differs")
        require(value["source"]["name"]==" original,week.json ","literal source name")
        require(value["source"]["weekText"]==original["source"]["weekText"],"literal BOM/CRLF embedded week")
        require(value["visits"][1]["note"]=="  A\rB\r\nC\n🙂\t ","untouched mixed-line-ending note")
        require(value["visits"][2]["date"] is None and value["visits"][2]["note"]=="","null date and empty note")
        result.update({"pass":True,"timestamp":bound,"whole_envelope_equal":True,"whole_serialization_equal":True,"source_week_text_exact":True,"untouched_mixed_note_exact":True,"visits":3})
        return result
    require(record["kind"]=="csv","fixed export kind")
    text=data.decode("utf-8","strict")
    table=list(csv.reader(io.StringIO(text,newline=""),strict=True))
    require(len(table)==4 and table[0]==HEADERS and all(len(row)==17 for row in table),"exact 17-column/three-row CSV shape")
    stamps={row[5] for row in table[1:]}
    require(len(stamps)==1,"one timestamp within this CSV export")
    stamp=next(iter(stamps));bound=time_bound(stamp,record)
    week_start=saved["week"]["start"]
    require(week_start=="2024-02-26" and saved["response"]["mock"] is True,"fixed original week and mock mode")
    plan=saved["response"]["plan"]["meals"]
    require(len(plan)==3 and saved["response"]["plan"]["outing"] is None,"fixed original occurrence closure")
    planned=["Thursday",None,"Friday"]
    dates=["2024-02-29",None,"2024-03-01"]
    rows=[HEADERS]
    for i,(pick,visit) in enumerate(zip(plan,original["visits"],strict=True)):
        key="pick-"+str(i)
        require(visit["key"]==key and saved["week"]["assignments"][key]==planned[i],"original occurrence/assignment identity")
        fields=[original["source"]["name"],week_start,"mock",saved["receivedAt"],saved["savedAt"],stamp,key,pick["name"],pick["entity_id"],pick["kind"],pick["day"],planned[i],dates[i],visit["outcome"],visit["date"],NOTE if i==0 else visit["note"],pick["why"]]
        rows.append(["" if value is None else value for value in fields])
    require(table==rows,"complete CSV field values/order differ")
    expected=io.StringIO(newline="")
    writer=csv.writer(expected,quoting=csv.QUOTE_ALL,lineterminator="\r\n",doublequote=True)
    writer.writerows(rows)
    require(data==expected.getvalue().encode("utf-8"),"complete quoted UTF-8/CRLF CSV serialization differs")
    result.update({"pass":True,"timestamp":bound,"whole_fields_equal":True,"whole_serialization_equal":True,"columns":17,"rows":3,"untouched_mixed_note_exact":table[2][15]==original["visits"][1]["note"]})
    return result
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--phase",choices=("initial","recovery"),required=True)
    args=parser.parse_args()
    original_bytes=read(INSTALL/"original/reference/saved-record.json")
    require(pins(original_bytes)=={"bytes":2691,"sha256":"89f03111e1eeffe3716055ff5f8e5d5bbd7b8a78ee5ba38b364a58f3e8e61e9d","git_blob":"4b8eed772a811f5d7ef7da10e0106d9cb90b11fd"},"original physical reference identity")
    original=json.loads(original_bytes.decode("utf-8","strict"))
    require(original["format"]=="tastetable.visit-record.v1" and len(original["visits"])==3,"original record closure")
    week=original["source"]["weekText"]
    require(week.startswith("\ufeff") and "\r\n" in week,"original BOM/CRLF disclosure")
    saved=json.loads(week[1:])
    manifest=json.loads(read(ROOT/"results"/("downloads-"+args.phase+".json")))
    required=["json","csv"] if args.phase=="initial" else ["recovered_json"]
    require([item["kind"] for item in manifest]==required,"fixed phase export order")
    result={"phase":args.phase,"pass":True,"original_reference":pins(original_bytes),"application_imports":0,"results":[check_export(record,original,saved) for record in manifest],"completed_utc":datetime.datetime.now(datetime.timezone.utc).isoformat()}
    print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=="__main__":
    try: main()
    except Exception:
        traceback.print_exc()
        raise SystemExit(1)
