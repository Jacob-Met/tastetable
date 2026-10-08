#!/usr/bin/env node
/** Actual saved-file browser receiving. Authored delay/failure injection only affects File.arrayBuffer. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import {pathToFileURL} from "node:url";

const [rootArg,outArg]=process.argv.slice(2);
if(!rootArg||!outArg) throw new Error("usage: check_saved_week_browser.mjs STATIC_ROOT NEW_RECEIPT_DIR");
const root=path.resolve(rootArg),out=path.resolve(outArg);
await fs.mkdir(out);
const hash=b=>crypto.createHash("sha256").update(b).digest("hex");
const catalogueBytes=await fs.readFile(path.join(root,"data/catalogue.json"));
const catalogue=JSON.parse(catalogueBytes);
const {makeWeekFile}=await import(pathToFileURL(path.join(root,"week_file.mjs")));
const {createWeekPlan,setPickDay}=await import(pathToFileURL(path.join(root,"week_plan.mjs")));
const {inputsForRecord}=await import(pathToFileURL(path.join(root,"saved_week.mjs")));
const receipt={schema:"tastetable.offline-week-browser.v1",started_at:new Date().toISOString(),source:root,
  source_sha256:{},catalogue_sha256:hash(catalogueBytes),checks:[],downloads:[],authored_files:[],
  requests:[],external_requests:[],page_errors:[],complete:false,
  fault_injection:"Explicit receiver-only held/rejected File.arrayBuffer promises; product code has no test hooks."};
for(const name of ["index.html","app.mjs","saved_week.mjs","week_file.mjs","week_plan.mjs","offline.css","style.css"])
  receipt.source_sha256[name]=hash(await fs.readFile(path.join(root,name)));
const server=http.createServer(async(req,res)=>{try{
  const pathname=new URL(req.url,"http://127.0.0.1").pathname;
  const file=path.resolve(root,"."+decodeURIComponent(pathname==="/"?"/index.html":pathname));
  if(!file.startsWith(root+path.sep)) return res.writeHead(403).end();
  const mime={".html":"text/html",".mjs":"text/javascript",".css":"text/css",".json":"application/json",".md":"text/plain"};
  res.writeHead(200,{"Content-Type":mime[path.extname(file)]||"application/octet-stream","Cache-Control":"no-store"}).end(await fs.readFile(file));
}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
const {chromium}=await import(pathToFileURL(process.env.TASTETABLE_PLAYWRIGHT_MODULE));
let browser;
const contexts=[];
const checked=(name,details={})=>receipt.checks.push({name,pass:true,...details});
async function newPage(viewport,tag){
  const context=await browser.newContext({viewport,reducedMotion:"reduce",locale:"en-US",timezoneId:"UTC"});
  contexts.push(context);
  await context.addInitScript(()=>{
    const original=Blob.prototype.arrayBuffer;
    window.__weekReads=new Map();
    Blob.prototype.arrayBuffer=function(){
      if(this.name==="authored-unreadable.json") return Promise.reject(new Error("Authored file read failure"));
      const bytes=original.call(this);
      if(!this.name?.startsWith("held-")) return bytes;
      return new Promise((resolve,reject)=>window.__weekReads.set(this.name,{bytes,resolve,reject}));
    };
  });
  const page=await context.newPage();
  page.on("pageerror",error=>receipt.page_errors.push({tag,message:error.message}));
  page.on("request",request=>{
    const url=new URL(request.url());
    receipt.requests.push({tag,method:request.method(),origin:url.origin,path:url.pathname});
  });
  await page.route("**/*",route=>{
    const url=route.request().url();
    if(new URL(url).origin===origin) return route.continue();
    receipt.external_requests.push(url);return route.abort();
  });
  await page.goto(origin);await page.locator("#results:not([hidden])").waitFor();
  return page;
}
async function show(page,key){
  const r=catalogue.records.find(item=>item.key===key);
  await page.selectOption("#personaSel",r.profile_id);
  for(const name of catalogue.constraints) await page.locator('input[name=constraints][value="'+name+'"]').setChecked(r.constraints.includes(name));
  await page.click("#showPlan");
  await page.waitForFunction(key=>!document.querySelector("#results").hidden&&document.querySelector("#results").dataset.recordKey===key,key);
  return r;
}
async function snapshot(page){
  return page.evaluate(()=>({
    hidden:document.querySelector("#results").hidden,key:document.querySelector("#results").dataset.recordKey,
    profile:document.querySelector("#personaSel").value,
    inputs:[...document.querySelectorAll("#form input[readonly]")].map(input=>[input.name,input.value]),
    constraints:[...document.querySelectorAll("input[name=constraints]:checked")].map(input=>input.value),
    date:document.querySelector("#weekDate").value,
    assignments:Object.fromEntries([...document.querySelectorAll("select[data-pick-key]")].map(input=>[input.dataset.pickKey,input.value])),
    original:document.querySelector(".original-evidence").innerHTML,
    copy:document.querySelector("#openedCopy").textContent,
    source:document.querySelector("#weekSource").textContent,
    invalid:document.querySelector("#weekDate").getAttribute("aria-invalid")
  }));
}
async function download(page,selector,tag){
  const wait=page.waitForEvent("download");await page.click(selector);
  const item=await wait;const target=path.join(out,tag+"-"+item.suggestedFilename());await item.saveAs(target);
  const bytes=await fs.readFile(target);receipt.downloads.push({tag,filename:item.suggestedFilename(),saved_path:target,bytes:bytes.length,sha256:hash(bytes)});
  return {path:target,bytes,value:JSON.parse(bytes)};
}
async function chooseFile(page,payload){
  const wait=page.waitForEvent("filechooser");await page.click("#openWeek");
  const chooser=await wait;await chooser.setFiles(payload);
}
async function openPreview(page,payload){
  await chooseFile(page,payload);await page.locator("#weekPreview:not([hidden])").waitFor();
}
async function assertArrangement(page,envelope,recordKey){
  assert.equal(await page.locator("#results").getAttribute("data-record-key"),recordKey);
  assert.equal(await page.locator("#weekDate").inputValue(),envelope.week.start);
  const actual=(await snapshot(page)).assignments;
  assert.deepEqual(actual,Object.fromEntries(Object.entries(envelope.week.assignments).map(([key,value])=>[key,value??""])));
  const record=catalogue.records.find(item=>item.key===recordKey);
  assert.equal(await page.locator("#personaSel").inputValue(),record.profile_id);
  assert.deepEqual((await snapshot(page)).constraints,record.constraints);
  const text=await page.locator("#weekOrganizer").textContent();
  for(const pick of [...record.response.plan.meals,...(record.response.plan.outing?[record.response.plan.outing]:[])]) {
    assert.ok(text.includes(pick.name));assert.ok(text.includes(pick.entity_id));assert.ok(text.includes(pick.why));
  }
  assert.match(text,/fictional venues/);assert.match(text,/Opened a saved copy/);
}
async function authoredFile(name,bytes){
  const target=path.join(out,name);await fs.writeFile(target,bytes);
  receipt.authored_files.push({name,bytes:Buffer.byteLength(bytes),sha256:hash(bytes)});
  return target;
}
async function releaseRead(page,name){
  await page.evaluate(async name=>{
    const item=window.__weekReads.get(name);if(!item)throw new Error("Missing held read");
    const bytes=await item.bytes;item.resolve(bytes);window.__weekReads.delete(name);
    await new Promise(resolve=>requestAnimationFrame(resolve));
  },name);
}
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.TASTETABLE_BROWSER_EXECUTABLE,
    downloadsPath:path.join(out,"browser-downloads")});
  receipt.browser_version=await browser.version();
  const page=await newPage({width:1440,height:1000},"desktop");
  const rosa=await show(page,"rosa-1");
  await page.locator("#weekDate").fill("2027-02-10");
  await page.locator('[data-pick-key="pick-0"]').selectOption("Saturday");
  await page.locator('[data-pick-key="pick-1"]').selectOption("");
  const arranged=await snapshot(page);
  const saved=await download(page,"#saveWeek","desktop-arranged");
  assert.equal(saved.value.format,"tastetable.saved-week.v1");
  assert.deepEqual(saved.value.response,rosa.response);
  assert.deepEqual(saved.value.inputs,inputsForRecord(catalogue,rosa));
  assert.equal(saved.value.week.start,"2027-02-08");
  assert.equal(saved.value.week.assignments["pick-0"],"Saturday");
  assert.equal(saved.value.week.assignments["pick-1"],null);
  assert.equal(saved.value.calendarId,null);
  checked("Actual Save week download includes date, day, omission and complete original response", {bytes:saved.bytes.length});

  await page.reload();await page.locator("#results:not([hidden])").waitFor();
  assert.notEqual((await snapshot(page)).date,"2027-02-10");
  const before=await snapshot(page);await openPreview(page,saved.path);
  assert.deepEqual(await snapshot(page),before);
  assert.match(await page.locator("#previewSummary").textContent(),/Rosa.*soft foods/);
  assert.match(await page.locator("#previewWhen").textContent(),/Feb 8, 2027.*1 kept off/);
  assert.ok((await page.locator("#previewOmitted").textContent()).includes(rosa.response.plan.meals[1].name));
  assert.equal(await page.evaluate(()=>document.activeElement.id),"weekPreviewTitle");
  await page.locator(".week-files").screenshot({path:path.join(out,"desktop-saved-week-preview.png")});
  checked("Real downloaded file reopens after reload as a focused preview without replacing the current plan");
  await page.keyboard.press("Tab");assert.equal(await page.evaluate(()=>document.activeElement.id),"replaceWeek");
  await page.keyboard.press("Enter");
  await assertArrangement(page,saved.value,rosa.key);
  assert.equal(await page.evaluate(()=>document.activeElement.id),"weekTitle");
  assert.equal(await page.locator("#weekPreview").isVisible(),false);
  checked("Keyboard confirmation restores canonical profile, constraints, source and exact arrangement");

  const restored=await snapshot(page);
  await openPreview(page,saved.path);await page.click("#cancelWeek");
  assert.deepEqual(await snapshot(page),restored);
  assert.equal(await page.evaluate(()=>document.activeElement.id),"openWeek");
  assert.equal(await page.locator("#weekPreview").isVisible(),false);
  checked("Cancel preserves the accepted draft and returns focus to Open saved week");

  const again=await download(page,"#saveWeek","desktop-resaved");
  const withoutSavedAt=value=>{const copy=structuredClone(value);delete copy.savedAt;return copy;};
  assert.deepEqual(withoutSavedAt(again.value),withoutSavedAt(saved.value));
  const raw=await download(page,"#downloadRecord","retained-original-record");
  assert.deepEqual(raw.bytes,await fs.readFile(path.join(root,"data/records",rosa.key+".json")));
  assert.ok(!Object.hasOwn(raw.value,"week"));
  checked("Resave retains original acceptance/source metadata; original raw download stays byte-exact");

  const unknown=rosa.response.plan.meals.find(pick=>/unknown.*ask the venue/i.test(pick.why));
  assert.ok(unknown);
  const unknownCard=page.locator(".scheduled-pick").filter({has:page.locator("h4",{hasText:unknown.name})});
  assert.equal(await unknownCard.isVisible(),true);
  assert.ok((await unknownCard.textContent()).includes(unknown.why));
  await page.emulateMedia({media:"print"});
  assert.equal(await unknownCard.isVisible(),true);
  assert.equal(await page.locator("#openedCopy").isVisible(),true);
  assert.equal(await page.locator(".week-files").isVisible(),false);
  assert.ok((await unknownCard.textContent()).includes("ask the venue"));
  const pdf=await page.pdf({path:path.join(out,"restored-week-print.pdf"),format:"A4",printBackground:true});
  receipt.print_pdf={bytes:pdf.length,sha256:hash(pdf)};
  await page.screenshot({path:path.join(out,"restored-week-print.png"),fullPage:true});
  await page.emulateMedia({media:"screen"});
  checked("Restored unknown dietary reason, ask-venue text and saved-copy label survive actual print media and PDF");

  const reverse=item=>Array.isArray(item)?item.map(reverse):item&&typeof item==="object"
    ?Object.fromEntries(Object.keys(item).reverse().map(key=>[key,reverse(item[key])])):item;
  const reordered=await authoredFile("reordered-saved-week.json",JSON.stringify(reverse(saved.value)));
  await openPreview(page,reordered);await page.click("#replaceWeek");
  const reorderedSave=await download(page,"#saveWeek","reordered-resaved");
  assert.deepEqual(withoutSavedAt(reorderedSave.value),withoutSavedAt(saved.value));
  checked("Object-key-reordered file is admitted and can be saved again with canonical source order");

  const refused=[
    ["different-source.json",()=>{const v=structuredClone(saved.value);v.response.plan.meals[0].why+=" verified now";return JSON.stringify(v);}],
    ["different-inputs.json",()=>{const v=structuredClone(saved.value);v.inputs.city="Another city";return JSON.stringify(v);}],
    ["incomplete-arrangement.json",()=>{const v=structuredClone(saved.value);delete v.week.assignments["pick-1"];return JSON.stringify(v);}],
    ["nonfinite-source.json",()=>{const v=structuredClone(saved.value);v.response.llm_only.meals[0].verified.entity_id="__AUTHORED_OVERFLOW__";return JSON.stringify(v).replace('"__AUTHORED_OVERFLOW__"',"1e400");}],
    ["numeric-markup.json",()=>{const v=structuredClone(saved.value);v.response.comparison.grounded.picks="<img src=x onerror=alert(1)>";return JSON.stringify(v);}],
    ["wrong-format.json",()=>JSON.stringify({format:"other.v1"})],
    ["not-json.json",()=>"{not valid"],
    ["invalid-utf8.json",()=>Buffer.from([0xc3,0x28])],
    ["oversized.json",()=>Buffer.alloc(128*1024+1,0x20)],
    ["authored-unreadable.json",()=>saved.bytes]
  ];
  for(const [name,make] of refused){
    await openPreview(page,saved.path);
    const expected=await snapshot(page);
    const file=await authoredFile(name,make());
    await chooseFile(page,file);await page.waitForFunction(()=>document.querySelector("#fileError").textContent.length>0);
    assert.equal(await page.locator("#weekPreview").isVisible(),false);
    assert.equal(await page.locator("#replaceWeek").isDisabled(),true);
    assert.deepEqual(await snapshot(page),expected);
    assert.equal(await page.locator(".week-files img").count(),0);
    if(name==="nonfinite-source.json") assert.match(await page.locator("#fileError").textContent(),/non-finite number/);
    checked("Refused file preserves draft and retires previous preview: "+name);
  }

  await openPreview(page,saved.path);
  const beforeChooser=await snapshot(page);
  await chooseFile(page,[]);
  assert.equal(await page.locator("#weekPreview").isVisible(),false);
  assert.deepEqual(await snapshot(page),beforeChooser);
  checked("Opening and cancelling another file chooser retires the prior preview");

  for(const [name,edit] of [
    ["date",async()=>page.locator("#weekDate").fill("2028-03-01")],
    ["day",async()=>page.locator('[data-pick-key="pick-0"]').selectOption("Friday")],
    ["restore days",async()=>page.click("#resetWeek")],
    ["profile",async()=>page.selectOption("#personaSel","mei")],
    ["constraints",async()=>page.locator('input[name=constraints][value="low_sodium"]').check()],
    ["show record",async()=>page.click("#showPlan")],
    ["profile defaults",async()=>page.click("#sampleBtn")]
  ]){
    await show(page,rosa.key);await openPreview(page,saved.path);await edit();
    assert.equal(await page.locator("#weekPreview").isVisible(),false);
    assert.equal(await page.locator("#replaceWeek").isDisabled(),true);
    checked("Current "+name+" edit retires a prepared saved-week preview");
  }

  await show(page,rosa.key);
  const heldCancel=await authoredFile("held-cancel.json",saved.bytes);
  const beforeHeld=await snapshot(page);await chooseFile(page,heldCancel);
  await page.waitForFunction(()=>window.__weekReads.has("held-cancel.json"));
  await page.click("#cancelWeek");await releaseRead(page,"held-cancel.json");
  assert.equal(await page.locator("#weekPreview").isVisible(),false);
  assert.deepEqual(await snapshot(page),beforeHeld);
  checked("Cancelling an actual selected but held file read prevents its later completion from changing state");

  const heldEdit=await authoredFile("held-edit.json",saved.bytes);
  await chooseFile(page,heldEdit);await page.waitForFunction(()=>window.__weekReads.has("held-edit.json"));
  await page.locator('[data-pick-key="pick-0"]').selectOption("Friday");
  const edited=await snapshot(page);await releaseRead(page,"held-edit.json");
  assert.equal(await page.locator("#weekPreview").isVisible(),false);
  assert.deepEqual(await snapshot(page),edited);
  checked("A day edit while a file read is pending remains authoritative after the old read completes");

  const mei=catalogue.records.find(record=>record.key==="mei-0");
  let meiState=createWeekPlan(mei.response,"2028-02-29");
  meiState=setPickDay(meiState,"pick-0","Sunday");
  const meiEnvelope=makeWeekFile({response:mei.response,inputs:inputsForRecord(catalogue,mei),state:meiState,
    receivedAt:saved.value.receivedAt,calendarId:"1234567890abcdef1234567890abcdef"},new Date(saved.value.savedAt));
  const meiFile=await authoredFile("authored-valid-mei-week.json",meiEnvelope.text);
  const heldOld=await authoredFile("held-older-choice.json",saved.bytes);
  await chooseFile(page,heldOld);await page.waitForFunction(()=>window.__weekReads.has("held-older-choice.json"));
  await openPreview(page,meiFile);assert.match(await page.locator("#previewSummary").textContent(),/Mei/);
  await releaseRead(page,"held-older-choice.json");
  assert.match(await page.locator("#previewSummary").textContent(),/Mei/);
  await page.click("#replaceWeek");await assertArrangement(page,JSON.parse(meiEnvelope.text),mei.key);
  checked("A newer selected file wins over late completion of the older file, including different profile and constraints");

  await page.locator("#weekDate").fill("");
  assert.equal(await page.locator("#saveWeek").isDisabled(),true);
  assert.equal(await page.locator("#printWeek").isDisabled(),true);
  await openPreview(page,saved.path);await page.click("#replaceWeek");await assertArrangement(page,saved.value,rosa.key);
  checked("An invalid draft date blocks Save; explicit valid saved-week replacement restores a valid week");

  for(const key of Object.keys(saved.value.week.assignments)) await page.locator('[data-pick-key="'+key+'"]').selectOption("");
  const allOff=await download(page,"#saveWeek","all-off-week");
  assert.ok(Object.values(allOff.value.week.assignments).every(day=>day===null));
  await openPreview(page,allOff.path);await page.click("#replaceWeek");
  assert.equal(await page.locator("#weekDays .scheduled-pick").count(),0);
  assert.equal(await page.locator("#omittedPicks .scheduled-pick").count(),Object.keys(allOff.value.week.assignments).length);
  checked("An explicitly all-omitted arrangement survives a real download and reopen");

  const phone=await newPage({width:390,height:844},"phone");
  await show(phone,mei.key);
  await phone.locator("#weekDate").fill("2028-02-29");
  await phone.locator('[data-pick-key="pick-0"]').selectOption("Sunday");
  await phone.locator('[data-pick-key="pick-1"]').selectOption("");
  const phoneSave=await download(phone,"#saveWeek","phone-arranged");
  await phone.reload();await phone.locator("#results:not([hidden])").waitFor();
  await openPreview(phone,phoneSave.path);
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.match(await phone.locator("#previewWhen").textContent(),/Feb 28, 2028/);
  await phone.locator(".week-files").screenshot({path:path.join(out,"phone-saved-week-preview.png")});
  await phone.click("#replaceWeek");await assertArrangement(phone,phoneSave.value,mei.key);
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await phone.screenshot({path:path.join(out,"phone-restored-week.png"),fullPage:true});
  for(const selector of ["#saveWeek","#openWeek"]){
    const box=await phone.locator(selector).boundingBox();assert.ok(box.width>=40&&box.height>=40);
  }
  checked("Phone real Save/Open/Replace retains leap-week arrangement and readable nonoverflowing preview");

  for(const p of [page,phone]){
    assert.deepEqual(await p.evaluate(()=>({local:localStorage.length,session:sessionStorage.length})),{local:0,session:0});
  }
  assert.equal(receipt.page_errors.length,0);
  assert.equal(receipt.external_requests.length,0);
  assert.ok(receipt.requests.every(request=>request.method==="GET"&&!request.path.startsWith("/api/")));
  checked("Fresh browser contexts make no API/external requests or automatic local/session writes");
  receipt.complete=true;
}catch(error){receipt.error=error.stack;throw error;}
finally{
  for(const context of contexts) await context.close().catch(()=>{});
  await browser?.close();await new Promise(resolve=>server.close(resolve));
  receipt.finished_at=new Date().toISOString();
  await fs.writeFile(path.join(out,"receipt.json"),JSON.stringify(receipt,null,2)+"\n");
}
console.log(JSON.stringify({complete:receipt.complete,checks:receipt.checks.length,downloads:receipt.downloads.length,
  page_errors:receipt.page_errors.length,external_requests:receipt.external_requests.length,receipt:path.join(out,"receipt.json")}));
