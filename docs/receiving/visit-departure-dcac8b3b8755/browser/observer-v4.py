import argparse,datetime,functools,hashlib,http.server,json,os,platform,threading,traceback,sys
from pathlib import Path
from playwright.sync_api import sync_playwright,Error as BrowserError
ap=argparse.ArgumentParser()
ap.add_argument("--source",required=True);ap.add_argument("--manifest",required=True);ap.add_argument("--fixtures",required=True);ap.add_argument("--output",required=True)
ap.add_argument("--mode",choices=("original","candidate"),required=True);ap.add_argument("--chrome",required=True)
args=ap.parse_args();source=Path(args.source).resolve();fixtures=Path(args.fixtures).resolve();out=Path(args.output).resolve();out.mkdir(exist_ok=False)
manifest=json.loads(Path(args.manifest).read_text(encoding="utf-8"))
expected=json.loads((fixtures/"original-record.json").read_text(encoding="utf-8"))
expected_visits=sorted(expected["visits"],key=lambda x:int(x["key"].split("-")[1]))
receipt={"schema":"tastetable-visit-departure-browser/1","mode":args.mode,"source":manifest,"started":datetime.datetime.now(datetime.timezone.utc).isoformat(),"device":{"node":platform.node(),"uid":os.getuid(),"python":platform.python_version()},"checks":[],"departures":[],"downloads":[],"requests":[],"page_errors":[],"outside_requests":[],"print_observations":[],"browser_disconnected":False,"os_browser_exit_code":None}
def require(name,value,detail=None):
 receipt["checks"].append({"name":name,"pass":bool(value),"detail":detail})
 if not value:raise RuntimeError(name)
def identity(p):
 b=p.read_bytes();s=p.stat()
 return {"bytes":len(b),"sha256":hashlib.sha256(b).hexdigest(),"git":hashlib.sha1(b"blob "+str(len(b)).encode()+b"\0"+b).hexdigest(),"mode":s.st_mode,"mtime_ns":s.st_mtime_ns,"inode":s.st_ino}
def inventory():
 return {str(p):identity(p) for p in sorted(list(source.rglob("*"))+list(fixtures.rglob("*"))+[Path(args.manifest)]) if p.is_file()}
def snapshot(p):
 return p.evaluate("""() => ({documentIdentity:window.__receivingDocumentId,url:location.href,shown:!document.querySelector('#record').hidden,
 fields:[...document.querySelectorAll('#visits [data-field]')].map(e=>({key:e.dataset.key,field:e.dataset.field,value:e.value,invalid:e.getAttribute('aria-invalid')})),
 source:document.querySelector('#sourceName').textContent,summary:document.querySelector('#recordSummary').textContent,
 local:Object.fromEntries(Object.entries(localStorage)),session:Object.fromEntries(Object.entries(sessionStorage))})""")
class Handler(http.server.SimpleHTTPRequestHandler):
 extensions_map={**http.server.SimpleHTTPRequestHandler.extensions_map,".mjs":"text/javascript",".json":"application/json"}
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path=="/departed.html":
   b=b"<!doctype html><title>Owned receiving destination</title><p>Departure completed</p>";self.send_response(200);self.send_header("Content-Type","text/html");self.send_header("Content-Length",str(len(b)));self.end_headers();self.wfile.write(b);return
  return super().do_GET()
server=None;browser=None;before=None;context=None;pw=None
try:
 require("source is owned ordinary directory",source.is_dir() and not source.is_symlink())
 for row in manifest["closure"]:
  p=source/row["path"];require("source blob "+row["path"],p.is_file() and not p.is_symlink() and identity(p)["git"]==row["git"])
 require("exact runtime membership",set(p.relative_to(source).as_posix() for p in source.rglob("*") if p.is_file())=={x["path"] for x in manifest["closure"]})
 require("original fixture pin",identity(fixtures/"original-record.json")["git"]=="69d1c226ab9b7ed25a08f9372a0534d2be00d27f")
 before=inventory();receipt["inputs_before"]=before
 server=http.server.ThreadingHTTPServer(("127.0.0.1",0),functools.partial(Handler,directory=str(source)))
 threading.Thread(target=server.serve_forever,daemon=True).start()
 origin="http://127.0.0.1:"+str(server.server_port);receipt["origin"]=origin
 pw=sync_playwright().start()
 browser=pw.chromium.launch(executable_path=args.chrome,headless=True)
 browser.on("disconnected",lambda:receipt.__setitem__("browser_disconnected",True));receipt["browser_version"]=browser.version
 context=browser.new_context(viewport={"width":1280,"height":960},timezone_id="UTC",accept_downloads=True)
 context.add_init_script("""window.__receivingDocumentId=crypto.randomUUID();window.__printObservation={calls:0,before:0,after:0};
  addEventListener('beforeprint',()=>window.__printObservation.before++);
  addEventListener('afterprint',()=>window.__printObservation.after++);
  const originalPrint=window.print.bind(window);window.print=()=>{window.__printObservation.calls++;return originalPrint();};""")
 def route(r):
  if r.request.url.startswith(origin+"/"):r.continue_()
  else:receipt["outside_requests"].append(r.request.url);r.abort()
 context.route("http://**/*",route);context.route("https://**/*",route)
 def newpage(name,loaded=True):
  p=context.new_page()
  p.on("request",lambda r:receipt["requests"].append({"case":name,"url":r.url,"method":r.method}))
  p.on("pageerror",lambda e:receipt["page_errors"].append({"case":name,"error":str(e)}))
  p.goto(origin+"/static/visit-record.html",wait_until="networkidle")
  if loaded:
   p.locator("#recordFile").set_input_files(str(fixtures/"original-record.json"));p.locator("#preview").wait_for(state="visible")
   p.locator("#useRecord").click();p.locator("#record").wait_for(state="visible")
   require(name+" imported three separate occurrences",p.locator("#visits .visit-card").count()==3)
   require(name+" preserves literal source filename",p.locator("#sourceName").text_content()==expected["source"]["name"])
  return p
 def changed(p,field="outcome"):
  loc=p.locator('#pick-2-'+field)
  if field=="outcome":loc.select_option("went")
  elif field=="date":loc.fill("2024-03-04")
  else:loc.fill("Fictional note Ω <b>literal</b>")
 def check_download(p,name,wanted):
  with p.expect_download(timeout=5000) as event:p.locator("#saveRecord").click()
  d=event.value;dest=out/(name+".json");d.save_as(str(dest));data=json.loads(dest.read_text(encoding="utf-8"))
  require(name+" complete envelope fields",set(data)=={"format","savedAt","source","visits"})
  require(name+" original source exact",data["source"]==expected["source"])
  require(name+" complete accepted visits exact",data["visits"]==wanted)
  require(name+" untouched CR CRLF tab Unicode note exact",data["visits"][1]["note"]=="  A\rB\r\nC\n🙂\t ")
  require(name+" duplicate occurrence keys retained",[x["key"] for x in data["visits"]]==["pick-0","pick-1","pick-2"])
  receipt["downloads"].append({"path":dest.name,"suggested_filename":d.suggested_filename,"identity":identity(dest)})
 def depart(p,name,action,dirty,choice):
  dialogs=[];error=None;prior=snapshot(p)
  def dialog(d):
   dialogs.append({"type":d.type,"message":d.message,"choice":choice})
   if choice=="stay":d.dismiss()
   else:d.accept()
  p.on("dialog",dialog)
  try:
   if action=="reload":p.reload(wait_until="domcontentloaded",timeout=5000)
   elif action=="navigation":p.goto(origin+"/departed.html",wait_until="domcontentloaded",timeout=5000)
   else:p.close(run_before_unload=True)
  except BrowserError as e:error=str(e)
  if not p.is_closed():
   try:p.wait_for_timeout(180)
   except BrowserError:pass
  p.remove_listener("dialog",dialog)
  guard=dirty and args.mode=="candidate"
  require(name+" expected native confirmation count",len(dialogs)==(1 if guard else 0),dialogs)
  require(name+" only native beforeunload dialogs",all(d["type"]=="beforeunload" for d in dialogs))
  stayed=guard and choice=="stay"
  if stayed:
   require(name+" Stay keeps page open",not p.is_closed())
   require(name+" Stay keeps exact displayed values and storage",snapshot(p)==prior)
  else:
   if action=="close":require(name+" actual page closed",p.is_closed())
   elif action=="navigation":require(name+" actual navigation completed",p.url==origin+"/departed.html")
   else:require(name+" actual reload discards tab record",p.locator("#record").is_hidden())
  if error:
   exact_cancelled_reload = action=="reload" and error=='Page.reload: Timeout 5000ms exceeded.\nCall log:\n  - waiting for navigation until "domcontentloaded"\n'
   require(name+" only cancelled navigation error",stayed and ("ERR_ABORTED" in error or "interrupted" in error.lower() or exact_cancelled_reload),error)
  receipt["departures"].append({"case":name,"action":action,"dirty":dirty,"choice_policy":choice,"dialogs":dialogs,"browser_error":error,"stayed":stayed,"original_missing_protection":bool(dirty and args.mode=="original")})
  return stayed
 def finish(p):
  if not p.is_closed():p.close()
 p=newpage("empty-clean",False);p.locator("h1").click();depart(p,"empty-clean","navigation",False,"stay");finish(p)
 p=newpage("loaded-clean");depart(p,"loaded-clean","reload",False,"stay");finish(p)
 for field,action in (("outcome","reload"),("date","navigation"),("note","close")):
  p=newpage("dirty-"+field);changed(p,field)
  if field=="note":
   p.set_viewport_size({"width":390,"height":960});require("390px page fits",p.evaluate("document.documentElement.scrollWidth<=innerWidth"))
   p.screenshot(path=str(out/"dirty-note-390.png"),full_page=True)
  stayed=depart(p,"dirty-"+field+"-stay",action,True,"stay")
  if stayed:depart(p,"dirty-"+field+"-leave",action,True,"leave")
  finish(p)
 p=newpage("exact-revert")
 for field in ("outcome","date","note"):changed(p,field)
 p.locator("#pick-2-outcome").select_option("unrecorded");p.locator("#pick-2-date").fill("");p.locator("#pick-2-note").fill("")
 check_download(p,"reverted-record",expected_visits)
 depart(p,"exact-revert","reload",False,"stay");finish(p)
 for field,value in (("date","2024-02-30"),("note","X"*4001)):
  name="invalid-"+field;p=newpage(name);p.locator("#pick-2-"+field).fill(value)
  require(name+" invalid draft shown",p.locator("#pick-2-"+field).get_attribute("aria-invalid")=="true")
  require(name+" export blocked",p.locator("#saveRecord").is_disabled() and p.locator("#printRecord").is_disabled())
  depart(p,name,"reload",True,"stay");finish(p)
 for kind in ("preview","cancel","refusal","pending"):
  name="file-"+kind;p=newpage(name);changed(p);saved=snapshot(p)
  if kind in ("preview","cancel"):
   p.locator("#weekFile").set_input_files(str(fixtures/"original-week.json"));p.locator("#preview").wait_for(state="visible")
   if kind=="cancel":p.locator("#cancelOpen").click()
  elif kind=="refusal":
   p.locator("#recordFile").set_input_files(str(fixtures/"refused.json"));p.locator("#fileError").wait_for(state="visible")
   require(name+" refused message",p.locator("#fileError").inner_text().startswith("Could not open"))
  else:
   p.evaluate("""() => {const f=File.prototype.arrayBuffer;window.__realRead=f;
    File.prototype.arrayBuffer=function(){if(this.name!=='pending.json')return f.call(this);
    return new Promise(resolve=>{window.__releaseRead=()=>f.call(this).then(resolve);});};}""")
   p.locator("#recordFile").set_input_files(str(fixtures/"pending.json"))
   p.wait_for_function("typeof window.__releaseRead==='function'")
   require("pending read status visible","Reading file" in p.locator("#fileStatus").inner_text())
  require(name+" displayed record and storage retained",snapshot(p)==saved)
  depart(p,name,"reload",True,"stay");finish(p)
 p=newpage("replacement");changed(p)
 p.locator("#weekFile").set_input_files(str(fixtures/"original-week.json"));p.locator("#preview").wait_for(state="visible");p.locator("#useRecord").click()
 require("replacement baseline unrecorded",p.locator("#pick-2-outcome").input_value()=="unrecorded")
 depart(p,"replacement-clean","reload",False,"stay");finish(p)
 p=newpage("download-retains");changed(p);wanted=json.loads(json.dumps(expected_visits));wanted[2]["outcome"]="went"
 check_download(p,"changed-record",wanted);require("download request status","Download requested" in p.locator("#saveStatus").inner_text())
 depart(p,"download-retains","navigation",True,"stay");finish(p)
 p=newpage("print-retains");changed(p)
 p.locator("#printRecord").click();p.wait_for_timeout(150)
 printed=p.evaluate("window.__printObservation");receipt["print_observations"].append(printed)
 require("Print button invokes native print",printed["calls"]==1)
 depart(p,"print-retains","navigation",True,"stay");finish(p)
 require("no outside requests",not receipt["outside_requests"],receipt["outside_requests"])
 require("no page errors",not receipt["page_errors"],receipt["page_errors"])
 context.close();context=None;browser.close();browser=None
 require("managed browser disconnected",receipt["browser_disconnected"])
 receipt["passed"]=True
except BaseException as e:
 receipt["passed"]=False;receipt["error"]=str(e);receipt["traceback"]=traceback.format_exc()
finally:
 if context:
  try:context.close()
  except Exception as e:receipt["context_cleanup_error"]=str(e);receipt["passed"]=False
 if browser:
  try:browser.close()
  except Exception as e:receipt["browser_cleanup_error"]=str(e);receipt["passed"]=False
 if pw:
  try:pw.stop()
  except Exception as e:receipt["playwright_stop_error"]=str(e);receipt["passed"]=False
 if server:server.shutdown();server.server_close()
 if before:
  receipt["inputs_after"]=inventory();receipt["inputs_preserved"]=receipt["inputs_after"]==before
  if not receipt["inputs_preserved"]:receipt["passed"]=False
 receipt["observer"]=identity(Path(__file__));receipt["finished"]=datetime.datetime.now(datetime.timezone.utc).isoformat()
 (out/"receiving.json").write_text(json.dumps(receipt,indent=2,ensure_ascii=False)+"\n",encoding="utf-8",newline="")
 print(json.dumps({"passed":receipt.get("passed"),"checks":len(receipt["checks"]),"departures":len(receipt["departures"]),"downloads":len(receipt["downloads"]),"inputs_preserved":receipt.get("inputs_preserved"),"error":receipt.get("error"),"browser_disconnected":receipt["browser_disconnected"]}))
sys.exit(0 if receipt.get("passed") else 1)
