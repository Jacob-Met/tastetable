#!/usr/bin/env node
/** Real offline arrangement recovery and saved-file custody, using the native recorded catalogue. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import {pathToFileURL} from "node:url";

const [rootArg,outArg]=process.argv.slice(2);
if(!rootArg||!outArg) throw new Error("usage: check_arrangement_history_browser.mjs STATIC_ROOT NEW_RECEIPT_DIR");
const root=path.resolve(rootArg),out=path.resolve(outArg);
await fs.mkdir(out);
const sha=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
const {chromium}=await import(pathToFileURL(process.env.TASTETABLE_PLAYWRIGHT_MODULE));
const catalogue=JSON.parse(await fs.readFile(path.join(root,"data/catalogue.json"),"utf8"));
const {createWeekPlan,setPickDay}=await import(pathToFileURL(path.join(root,"week_plan.mjs")));
const {inputsForRecord,saveOfflineWeek}=await import(pathToFileURL(path.join(root,"saved_week.mjs")));
const runtime=["index.html","app.mjs","arrangement_history.mjs","catalogue.mjs","week_plan.mjs",
  "week_file.mjs","saved_week.mjs","offline.css","style.css","data/catalogue.json"];
const sourcePins=async()=>Object.fromEntries(await Promise.all(runtime.map(async name=>[name,sha(await fs.readFile(path.join(root,name)))])));
const receipt={format:"tastetable-arrangement-history-browser/1",startedAt:new Date().toISOString(),source:root,
  sourceBefore:await sourcePins(),checks:[],snapshots:{},downloads:[],authoredFiles:[],requests:[],
  externalRequests:[],pageErrors:[],captures:[],complete:false,
  faultInjection:"Only a named actual File.arrayBuffer read is held and released to receive Undo/Redo cancellation; product source has no test hooks."};
const pass=(name,details={})=>{receipt.checks.push({name,...details});console.log("PASS "+name);};
const snapshot=page=>page.evaluate(()=>({
  hidden:document.querySelector("#results").hidden,
  key:document.querySelector("#results").dataset.recordKey,
  profile:document.querySelector("#personaSel").value,
  date:document.querySelector("#weekDate").value,
  invalid:document.querySelector("#weekDate").getAttribute("aria-invalid"),
  assignments:Object.fromEntries([...document.querySelectorAll("select[data-pick-key]")].map(s=>[s.dataset.pickKey,s.value||null])),
  dates:[...document.querySelectorAll("#weekDays time")].map(t=>t.dateTime),
  source:document.querySelector("#weekSource").textContent,
  constraints:document.querySelector("#weekConstraints").textContent,
  notes:document.querySelector("#weekNotes").textContent,
  sourceHref:document.querySelector("#downloadRecord").getAttribute("href"),
  originalEvidence:document.querySelector(".original-evidence").innerHTML,
  openedCopy:document.querySelector("#openedCopy").textContent,
}));
const historyControls=page=>page.evaluate(()=>({
  undoDisabled:document.querySelector("#undoWeek").disabled,redoDisabled:document.querySelector("#redoWeek").disabled,
  undo:document.querySelector("#undoWeek").getAttribute("aria-label"),redo:document.querySelector("#redoWeek").getAttribute("aria-label"),
}));
const sameEnvelope=value=>{const copy=structuredClone(value);delete copy.savedAt;return copy;};
let browser,server;
const contexts=[];
async function makePage(viewport,tag){
  const context=await browser.newContext({viewport,reducedMotion:"reduce",locale:"en-US",timezoneId:"UTC",acceptDownloads:true});
  contexts.push(context);
  await context.addInitScript(()=>{
    const original=Blob.prototype.arrayBuffer;
    window.__historyHeldReads=new Map();
    Blob.prototype.arrayBuffer=function(){
      const bytes=original.call(this);
      if(!this.name?.startsWith("history-held-"))return bytes;
      return new Promise((resolve,reject)=>window.__historyHeldReads.set(this.name,{bytes,resolve,reject}));
    };
  });
  const page=await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror",error=>receipt.pageErrors.push({tag,message:error.message}));
  page.on("request",request=>receipt.requests.push({tag,method:request.method(),url:request.url()}));
  await page.route("**/*",route=>{
    const url=route.request().url();
    if(url.startsWith(receipt.origin+"/")||url.startsWith("blob:"))return route.continue();
    receipt.externalRequests.push(url);return route.abort();
  });
  await page.goto(receipt.origin+"/",{waitUntil:"domcontentloaded",timeout:15000});
  await page.locator("#results:not([hidden])").waitFor();
  return page;
}
async function show(page,key,date){
  const record=catalogue.records.find(r=>r.key===key);assert(record);
  await page.locator("#personaSel").selectOption(record.profile_id);
  for(const constraint of catalogue.constraints)
    await page.locator('input[name=constraints][value="'+constraint+'"]').setChecked(record.constraints.includes(constraint));
  await page.locator("#showPlan").click();
  await page.waitForFunction(key=>!document.querySelector("#results").hidden&&document.querySelector("#results").dataset.recordKey===key,key);
  if(date){
    await page.locator("#weekDate").fill(date);
    await page.locator("#weekDate").blur();
    await page.locator("#showPlan").click(); // Explicitly accepted recording: fresh history at the displayed date.
  }
  assert.equal(await page.locator("#undoWeek").isDisabled(),true);
  assert.equal(await page.locator("#redoWeek").isDisabled(),true);
  return record;
}
async function download(page,selector,name){
  const waiting=page.waitForEvent("download");
  await page.locator(selector).click();
  const item=await waiting,target=path.join(out,name);
  await item.saveAs(target);
  const bytes=await fs.readFile(target);
  receipt.downloads.push({name,suggestedFilename:item.suggestedFilename(),bytes:bytes.length,sha256:sha(bytes)});
  return {path:target,bytes,value:JSON.parse(bytes)};
}
async function chooseFile(page,file){
  const waiting=page.waitForEvent("filechooser");
  await page.locator("#openWeek").click();
  await (await waiting).setFiles(file);
}
async function preview(page,file){
  await chooseFile(page,file);
  await page.locator("#weekPreview:not([hidden])").waitFor();
}
async function release(page,name){
  await page.evaluate(async name=>{
    const pending=window.__historyHeldReads.get(name);
    if(!pending)throw new Error("Missing authored held read");
    pending.resolve(await pending.bytes);
    window.__historyHeldReads.delete(name);
    await new Promise(resolve=>requestAnimationFrame(resolve));
  },name);
}
async function capture(page,name){
  const file=path.join(out,name);
  await page.screenshot({path:file});
  const bytes=await fs.readFile(file);
  receipt.captures.push({name,bytes:bytes.length,sha256:sha(bytes)});
}
function assertOpened(actual,envelope,key){
  assert.equal(actual.key,key);
  assert.equal(actual.date,envelope.week.start);
  assert.deepEqual(actual.assignments,envelope.week.assignments);
  assert.equal(actual.invalid,null);
  assert.match(actual.openedCopy,/Opened a saved copy/);
}
try{
  server=http.createServer(async(req,res)=>{
    try{
      const pathname=new URL(req.url,"http://localhost").pathname;
      const file=path.resolve(root,"."+decodeURIComponent(pathname==="/"?"/index.html":pathname));
      if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
      const bytes=await fs.readFile(file);
      const type={".html":"text/html; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json"}[path.extname(file)]||"application/octet-stream";
      res.writeHead(200,{"Content-Type":type,"Cache-Control":"no-store"}).end(bytes);
    }catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  receipt.origin="http://127.0.0.1:"+server.address().port;
  browser=await chromium.launch({headless:true,executablePath:process.env.TASTETABLE_BROWSER_EXECUTABLE,
    args:["--disable-background-networking","--disk-cache-size=1048576"]});
  receipt.browserVersion=browser.version();
  const page=await makePage({width:1280,height:1000},"desktop");
  const rosa=await show(page,"rosa-1","2028-02-29");
  await page.locator('[data-pick-key="pick-0"]').selectOption("Saturday");
  await page.locator('[data-pick-key="pick-1"]').selectOption("");
  const arranged=await snapshot(page),controlsBeforeSave=await historyControls(page);
  const saved=await download(page,"#saveWeek","arranged-week.json");
  assert.deepEqual(await historyControls(page),controlsBeforeSave);
  assert.deepEqual(saved.value.response,rosa.response);
  assert.deepEqual(saved.value.inputs,inputsForRecord(catalogue,rosa));
  assert.equal(saved.value.week.start,"2028-02-28");
  assert.equal(saved.value.week.assignments["pick-0"],"Saturday");
  assert.equal(saved.value.week.assignments["pick-1"],null);
  await page.locator("#resetWeek").click();
  const reset=await snapshot(page);
  await page.locator("#undoWeek").focus();await page.keyboard.press("Enter");
  assert.deepEqual(await snapshot(page),arranged);
  assert.equal(await page.evaluate(()=>document.activeElement.id),"undoWeek");
  const recovered=await download(page,"#saveWeek","recovered-week.json");
  assert.deepEqual(sameEnvelope(recovered.value),sameEnvelope(saved.value));
  assert.equal("history" in recovered.value,false);
  await page.locator("#redoWeek").click();assert.deepEqual(await snapshot(page),reset);
  await page.locator("#undoWeek").click();assert.deepEqual(await snapshot(page),arranged);
  receipt.snapshots.recovered=arranged;
  await page.locator("#weekTitle").scrollIntoViewIfNeeded();
  await page.locator("#undoWeek").focus();await capture(page,"desktop-recovered-week.png");
  pass("Keyboard recovery and real resave retain the complete leap week, omission, original source and accepted metadata.");

  await show(page,"rosa-1","2028-02-29");
  const initial=await snapshot(page);
  await page.locator('[data-pick-key="pick-0"]').selectOption("Sunday");
  await page.locator("#undoWeek").click();
  const redoBefore=await historyControls(page);
  await page.locator('[data-pick-key="pick-0"]').selectOption(initial.assignments["pick-0"]);
  await page.locator("#resetWeek").click();
  await page.locator("#weekDate").fill("2028-03-05");await page.locator("#weekDate").blur();
  assert.deepEqual(await historyControls(page),redoBefore);
  const sameWeek=await snapshot(page);
  await download(page,"#saveWeek","noop-save-with-redo.json");
  await page.locator("#printWeek").click();
  assert.deepEqual(await historyControls(page),redoBefore);
  await page.locator("#redoWeek").click();await page.locator("#undoWeek").click();
  assert.deepEqual(await snapshot(page),sameWeek);
  await page.locator('[data-pick-key="pick-2"]').selectOption("");
  assert.equal(await page.locator("#redoWeek").isDisabled(),true);
  await page.locator("#weekDate").fill("");
  assert.equal(await page.locator("#saveWeek").isDisabled(),true);
  assert.equal(await page.locator("#printWeek").isDisabled(),true);
  await page.locator("#undoWeek").focus();await page.keyboard.press("Enter");
  assert.deepEqual(await snapshot(page),sameWeek);
  assert.equal(await page.locator("#saveWeek").isDisabled(),false);
  assert.equal(await page.locator("#printWeek").isDisabled(),false);
  assert.equal(await page.evaluate(()=>document.activeElement.id),"redoWeek");
  pass("Same-day/reset/week, Save and Print no-ops preserve redo; a new edit branches and keyboard Undo clears only the invalid date draft.");

  await page.locator('[data-pick-key="pick-0"]').selectOption("Sunday");
  const beforePreview=await snapshot(page),beforePreviewControls=await historyControls(page);
  await preview(page,saved.path);
  assert.deepEqual(await snapshot(page),beforePreview);
  assert.deepEqual(await historyControls(page),beforePreviewControls);
  await page.locator("#cancelWeek").click();
  assert.deepEqual(await snapshot(page),beforePreview);
  assert.deepEqual(await historyControls(page),beforePreviewControls);
  await chooseFile(page,{name:"malformed-history-week.json",mimeType:"application/json",buffer:Buffer.from("{not-json")});
  await page.waitForFunction(()=>document.querySelector("#fileError").textContent.length>0);
  assert.deepEqual(await snapshot(page),beforePreview);
  assert.deepEqual(await historyControls(page),beforePreviewControls);
  await preview(page,saved.path);
  await page.locator("#undoWeek").click();
  const afterUndo=await snapshot(page);
  assert.equal(await page.locator("#weekPreview").isVisible(),false);
  assert.equal(await page.locator("#replaceWeek").isDisabled(),true);
  await page.locator("#redoWeek").click();assert.deepEqual(await snapshot(page),beforePreview);
  for(const [name,button,expected] of [
    ["history-held-undo.json","#undoWeek",afterUndo],
    ["history-held-redo.json","#redoWeek",beforePreview],
  ]){
    await chooseFile(page,{name,mimeType:"application/json",buffer:saved.bytes});
    await page.waitForFunction(name=>window.__historyHeldReads.has(name),name);
    await page.locator(button).click();
    assert.deepEqual(await snapshot(page),expected);
    await release(page,name);
    assert.deepEqual(await snapshot(page),expected);
    assert.equal(await page.locator("#weekPreview").isVisible(),false);
    assert.equal(await page.locator("#replaceWeek").isDisabled(),true);
  }
  pass("Preview, cancellation and refused files preserve history; Undo and Redo retire both prepared previews and late actual file reads.");

  await preview(page,saved.path);await page.locator("#replaceWeek").click();
  assertOpened(await snapshot(page),saved.value,rosa.key);
  assert.equal(await page.locator("#undoWeek").isDisabled(),true);
  assert.equal(await page.locator("#redoWeek").isDisabled(),true);
  const reopened=await download(page,"#saveWeek","same-source-reopened.json");
  assert.deepEqual(sameEnvelope(reopened.value),sameEnvelope(saved.value));

  const mei=catalogue.records.find(r=>r.key==="mei-0");
  let meiState=createWeekPlan(mei.response,"2029-01-03");
  meiState=setPickDay(meiState,"pick-0","Sunday");
  const calendarId="1234567890abcdef1234567890abcdef";
  const meiFile=saveOfflineWeek(catalogue,mei,meiState,saved.value.receivedAt,calendarId,new Date(saved.value.savedAt));
  const meiPath=path.join(out,"native-mei-calendar-week.json");
  await fs.writeFile(meiPath,meiFile.text);
  receipt.authoredFiles.push({name:"native-mei-calendar-week.json",producer:"unchanged native saveOfflineWeek + createWeekPlan/setPickDay",bytes:Buffer.byteLength(meiFile.text),sha256:sha(meiFile.text)});
  await page.locator('[data-pick-key="pick-0"]').selectOption("Friday");
  const beforeDifferent=await snapshot(page),controlsBeforeDifferent=await historyControls(page);
  await preview(page,meiPath);
  assert.deepEqual(await snapshot(page),beforeDifferent);
  assert.deepEqual(await historyControls(page),controlsBeforeDifferent);
  await page.locator("#replaceWeek").click();
  const meiAccepted=await snapshot(page);
  assertOpened(meiAccepted,JSON.parse(meiFile.text),mei.key);
  assert.equal(await page.locator("#undoWeek").isDisabled(),true);
  assert.equal(await page.locator("#redoWeek").isDisabled(),true);
  await page.locator('[data-pick-key="pick-1"]').selectOption("");
  await page.locator("#undoWeek").click();
  assert.deepEqual(await snapshot(page),meiAccepted);
  const meiAgain=await download(page,"#saveWeek","new-source-recovered.json");
  assert.deepEqual(sameEnvelope(meiAgain.value),sameEnvelope(JSON.parse(meiFile.text)));
  assert.equal(meiAgain.value.calendarId,calendarId);
  const raw=await download(page,"#downloadRecord","retained-original-record.json");
  assert.deepEqual(raw.bytes,await fs.readFile(path.join(root,"data/records/"+mei.key+".json")));
  pass("Explicit same-source or different-source replacement starts empty history; new recovery retains the new source, calendar ID and exact raw download.");

  await page.locator('[data-pick-key="pick-1"]').selectOption("");
  await page.locator("#personaSel").selectOption("rosa");
  assert.equal(await page.locator("#results").isVisible(),false);
  assert.equal(await page.locator("#undoWeek").isDisabled(),true);
  assert.equal(await page.locator("#redoWeek").isDisabled(),true);
  await page.locator("#showPlan").click();
  assert.equal(await page.locator("#undoWeek").isDisabled(),true);
  await page.locator('[data-pick-key="pick-1"]').selectOption("");
  const constraint=page.locator('input[name=constraints][value="wheelchair"]');
  await constraint.setChecked(!(await constraint.isChecked()));
  assert.equal(await page.locator("#results").isVisible(),false);
  assert.equal(await page.locator("#undoWeek").isDisabled(),true);
  assert.equal(await page.locator("#redoWeek").isDisabled(),true);
  await page.locator("#showPlan").click();
  await page.locator('[data-pick-key="pick-1"]').selectOption("");
  await page.locator("#showPlan").click();
  assert.equal(await page.locator("#undoWeek").isDisabled(),true);
  await page.locator('[data-pick-key="pick-1"]').selectOption("");
  await page.locator("#sampleBtn").click();
  assert.equal(await page.locator("#undoWeek").isDisabled(),true);
  assert.equal(await page.locator("#redoWeek").isDisabled(),true);
  await page.locator('[data-pick-key="pick-1"]').selectOption("");
  await page.reload();await page.locator("#results:not([hidden])").waitFor();
  assert.equal(await page.locator("#undoWeek").isDisabled(),true);
  assert.equal(await page.locator("#redoWeek").isDisabled(),true);
  pass("Profile/constraint invalidation, explicit recording/defaults and reload clear the old session's history immediately.");

  const phone=await makePage({width:390,height:844},"phone");
  await show(phone,"mei-0","2028-02-29");
  await phone.locator('[data-pick-key="pick-0"]').selectOption("Sunday");
  await phone.locator('[data-pick-key="pick-1"]').selectOption("");
  const phoneArranged=await snapshot(phone);
  await phone.locator("#resetWeek").click();
  const phoneReset=await snapshot(phone);
  await phone.locator("#undoWeek").focus();await phone.keyboard.press("Enter");
  assert.deepEqual(await snapshot(phone),phoneArranged);
  assert.equal(await phone.evaluate(()=>document.activeElement.id),"undoWeek");
  await phone.keyboard.press("Tab");
  assert.equal(await phone.evaluate(()=>document.activeElement.id),"redoWeek");
  await phone.keyboard.press("Space");
  assert.deepEqual(await snapshot(phone),phoneReset);
  assert.equal(await phone.evaluate(()=>document.activeElement.id),"undoWeek");
  await phone.keyboard.press("Space");
  assert.deepEqual(await snapshot(phone),phoneArranged);
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  for(const selector of ["#undoWeek","#redoWeek"]){
    const box=await phone.locator(selector).boundingBox();assert.ok(box.width>=44&&box.height>=44);
  }
  assert.equal(await phone.evaluate(()=>document.activeElement.matches(":focus-visible")),true);
  await phone.locator("#weekTitle").scrollIntoViewIfNeeded();
  await phone.locator("#undoWeek").focus();await capture(phone,"phone-recovered-week.png");
  receipt.snapshots.phoneRecovered=phoneArranged;
  await phone.emulateMedia({media:"print"});
  assert.equal(await phone.locator("#undoWeek").isVisible(),false);
  assert.equal(await phone.locator("#redoWeek").isVisible(),false);
  assert.equal(await phone.locator("#historyHelp").isVisible(),false);
  assert.equal(await phone.locator("#weekDays").isVisible(),true);
  assert.equal(await phone.locator("#weekSource").isVisible(),true);
  await phone.emulateMedia({media:"screen"});
  pass("At 390px native Enter/Tab/Space recovery retains focus, readable 44px controls and arrangement; print excludes recovery controls.");

  for(const current of [page,phone])
    assert.deepEqual(await current.evaluate(()=>({local:localStorage.length,session:sessionStorage.length})),{local:0,session:0});
  assert.deepEqual(receipt.pageErrors,[]);
  assert.deepEqual(receipt.externalRequests,[]);
  assert.ok(receipt.requests.every(request=>request.method==="GET"&&!new URL(request.url).pathname.startsWith("/api/")));
  pass("All received interactions use the existing finite local recordings without API/provider requests or automatic storage writes.");
  receipt.complete=true;
}catch(error){
  receipt.error=error.stack;console.error(error.stack);process.exitCode=1;
}finally{
  for(const context of contexts)await context.close().catch(()=>{});
  await browser?.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  receipt.sourceAfter=await sourcePins();
  receipt.sourceStable=JSON.stringify(receipt.sourceBefore)===JSON.stringify(receipt.sourceAfter);
  if(!receipt.sourceStable){receipt.complete=false;process.exitCode=1;}
  receipt.finishedAt=new Date().toISOString();
  await fs.writeFile(path.join(out,"receipt.json"),JSON.stringify(receipt,null,2)+"\n");
}
console.log(JSON.stringify({complete:receipt.complete,checks:receipt.checks.length,sourceStable:receipt.sourceStable,
  downloads:receipt.downloads.length,captures:receipt.captures.length,pageErrors:receipt.pageErrors.length,
  externalRequests:receipt.externalRequests.length,receipt:path.join(out,"receipt.json")}));
