#!/usr/bin/env node
/** Native browser receiving. Requires an installed Chromium and a saved-week file. */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm, statfs } from "node:fs/promises";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve, dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { readVisitRecord } from "../static/visit_record.mjs";

const options = {};
for (let i=2;i<process.argv.length;i+=2) {
  assert.ok(["--browser","--browser-workdir","--week","--output"].includes(process.argv[i]) && process.argv[i+1], "Use --browser PATH --browser-workdir DIR --week FILE --output NEW_DIR");
  assert.ok(!Object.hasOwn(options,process.argv[i]),"Do not repeat options."); options[process.argv[i]]=process.argv[i+1];
}
for (const key of ["--browser","--browser-workdir","--week","--output"]) assert.ok(options[key],"Missing "+key);
const root=resolve(dirname(fileURLToPath(import.meta.url)),".."),output=resolve(options["--output"]);
const sha=b=>createHash("sha256").update(b).digest("hex"),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const paths=["static/visit-record.html","static/visit_record.css","static/visit_record_ui.mjs","static/visit_record.mjs","static/week_file.mjs","static/week_plan.mjs","static/index.html"];
const pins=await Promise.all(paths.map(async path=>({path,sha256:sha(await readFile(join(root,path)))})));
const original=await readFile(resolve(options["--week"]));
await mkdir(output);
const browserRoot=await mkdtemp(join(resolve(options["--browser-workdir"]),"tastetable-visit-check-"));
const profile=join(browserRoot,"profile"),downloads=join(browserRoot,"downloads"),week=join(browserRoot,"source-week.json");
await mkdir(profile);await mkdir(downloads);await writeFile(week,original);
const space=await statfs(browserRoot);assert.ok(space.bavail*space.bsize>200*1024*1024,"Browser workspace needs 200MiB free.");
const report={schema:"tastetable.visit_record.author_browser.v1",startedAt:new Date().toISOString(),status:"running",checks:[],sourcePins:pins,original:{path:resolve(options["--week"]),bytes:original.length,sha256:sha(original)},pageErrors:[],externalRequests:[],downloads:[],screenshots:[]};
const server=createServer(async(req,res)=>{try {
  const url=new URL(req.url,"http://127.0.0.1"),path=resolve(root,"."+decodeURIComponent(url.pathname));
  if(!path.startsWith(root+"/")){res.writeHead(403).end();return;}
  const bytes=await readFile(path);res.writeHead(200,{"Content-Type":({".html":"text/html",".mjs":"text/javascript",".css":"text/css"}[extname(path)]||"application/octet-stream")+";charset=utf-8"}).end(bytes);
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,"127.0.0.1",r));const origin="http://127.0.0.1:"+server.address().port;
let browser,socket,sessionId,nextId=0,browserLog="";
const pending=new Map(),events=new Map();
async function waitFor(fn,label,attempts=150){let last;for(let i=0;i<attempts;i++){try{const value=await fn();if(value)return value;}catch(e){last=e;}await sleep(100);}throw new Error("Timed out: "+label+(last?" "+last.message:""));}
function command(method,params={},scoped=true){const id=++nextId;return new Promise((yes,no)=>{const timer=setTimeout(()=>{pending.delete(id);no(new Error("CDP timeout "+method));},12000);pending.set(id,{yes,no,timer});socket.send(JSON.stringify({id,method,params,...(scoped&&sessionId?{sessionId}:{})}));});}
async function evaluate(expression){const r=await command("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function press(selector){await evaluate("document.querySelector("+JSON.stringify(selector)+").focus()");for(const type of ["keyDown","keyUp"])await command("Input.dispatchKeyEvent",{type,key:"Enter",code:"Enter",windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,...(type==="keyDown"?{text:"\r",unmodifiedText:"\r"}:{})});}
async function setFile(selector,path){const {root:document}=await command("DOM.getDocument");const {nodeId}=await command("DOM.querySelector",{nodeId:document.nodeId,selector});await command("DOM.setFileInputFiles",{nodeId,files:[path]});}
async function edit(selector,value,event="input"){await evaluate("(()=>{const n=document.querySelector("+JSON.stringify(selector)+");n.value="+JSON.stringify(value)+";n.dispatchEvent(new Event("+JSON.stringify(event)+",{bubbles:true}));})()");}
async function screenshot(name){
 await command("Page.bringToFront");await evaluate("new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");await sleep(150);
 const bytes=Buffer.from((await command("Page.captureScreenshot",{format:"png",captureBeyondViewport:false})).data,"base64");await writeFile(join(output,name),bytes);
 report.screenshots.push({path:name,bytes:bytes.length,sha256:sha(bytes)});
}
async function download(){
 const before=new Set(events.keys());await press("#saveRecord");
 const event=await waitFor(()=>[...events.values()].find(e=>!before.has(e.guid)&&e.state==="completed"),"physical visit-record download");
 const bytes=await readFile(join(downloads,event.guid)),name="download-"+(report.downloads.length+1)+".json";await writeFile(join(output,name),bytes);
 report.downloads.push({path:name,physicalPath:join(downloads,event.guid),suggestedFilename:event.suggestedFilename,bytes:bytes.length,sha256:sha(bytes)});
 return {path:join(downloads,event.guid),record:readVisitRecord(bytes.toString("utf8")).record};
}
try {
 browser=spawn(options["--browser"],["--headless=new","--disable-gpu","--disable-background-networking","--disable-component-update","--disable-sync","--no-first-run","--no-default-browser-check","--remote-debugging-address=127.0.0.1","--remote-debugging-port=0","--user-data-dir="+profile,"about:blank"],{stdio:["ignore","ignore","pipe"]});
 browser.stderr.on("data",b=>{browserLog=(browserLog+b.toString()).slice(-6000);});let launchError;browser.on("error",e=>{launchError=e;});
 const port=await waitFor(async()=>{if(launchError)throw launchError;if(browser.exitCode!==null)throw new Error("Browser exited "+browser.exitCode);return(await readFile(join(profile,"DevToolsActivePort"),"utf8")).trim().split("\n");},"browser launch",450);
 socket=new WebSocket("ws://127.0.0.1:"+port[0]+port[1]);
 socket.addEventListener("message",event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.no(new Error(m.error.message)):p.yes(m.result);}
 else if(m.method==="Runtime.exceptionThrown")report.pageErrors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
 else if(m.method==="Network.requestWillBeSent"){const u=m.params.request.url;if(/^https?:/.test(u)&&!u.startsWith(origin+"/"))report.externalRequests.push(u);}
 else if(m.method==="Browser.downloadWillBegin"||m.method==="Browser.downloadProgress")events.set(m.params.guid,{...events.get(m.params.guid),...m.params});});
 await new Promise((yes,no)=>{socket.addEventListener("open",yes,{once:true});socket.addEventListener("error",no,{once:true});});
 report.browser=await command("Browser.getVersion",{},false);report.browserPid=browser.pid;
 const {targetId}=await command("Target.createTarget",{url:"about:blank"},false);({sessionId}=await command("Target.attachToTarget",{targetId,flatten:true},false));
 for(const method of ["Page.enable","Runtime.enable","DOM.enable","Network.enable"])await command(method);
 await command("Browser.setDownloadBehavior",{behavior:"allowAndName",downloadPath:downloads,eventsEnabled:true},false);
 await command("Emulation.setDeviceMetricsOverride",{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
 await command("Page.navigate",{url:origin+"/static/visit-record.html"});
 await waitFor(()=>evaluate('document.readyState==="complete" && document.querySelector("#openWeek")'),"page ready");
 await setFile("#weekFile",week);await waitFor(()=>evaluate('!document.querySelector("#preview").hidden'),"source preview");
 assert.equal(await evaluate('document.querySelector("#record").hidden'),true);
 await press("#useRecord");await waitFor(()=>evaluate('document.querySelectorAll(".visit-card").length>0'),"source accepted");
 assert.equal(await evaluate('document.querySelectorAll(".visit-card").length'),5);
 assert.match(await evaluate('document.querySelector("#sourceFacts").textContent'),/Demo plan/);
 assert.match(await evaluate('document.querySelector(".notice").textContent'),/have not been rerun/);
 assert.match(await evaluate('document.querySelector("[data-key=pick-0] .planned").textContent'),/2026-10-18/);
 assert.match(await evaluate('document.querySelector("[data-key=pick-1] .planned").textContent'),/Not scheduled/);
 await edit("#pick-0-outcome","went","change");await edit("#pick-0-date","2026-11-02");await edit("#pick-0-note","  Remember <literal> & café 🙂\nnext time  ");
 await edit("#pick-1-outcome","did_not_go","change");
 const first=await download();assert.equal(first.record.source.weekText,original.toString("utf8"));
 assert.deepEqual(first.record.visits[0],{key:"pick-0",outcome:"went",date:"2026-11-02",note:"  Remember <literal> & café 🙂\nnext time  "});
 assert.equal(first.record.visits[1].outcome,"did_not_go");assert.equal(first.record.visits[1].date,null);
 report.checks.push({name:"actual original Save-week bytes → explicit Use → per-occurrence edits → physical visit-record file",status:"passed"});
 await evaluate('document.querySelector(".record-toolbar").scrollIntoView({block:"start"})');await screenshot("desktop-record.png");
 await edit("#pick-0-date","2023-02-29");assert.equal(await evaluate('document.querySelector("#saveRecord").disabled && document.querySelector("#printRecord").disabled'),true);
 await setFile("#recordFile",first.path);await waitFor(()=>evaluate('!document.querySelector("#preview").hidden'),"record preview while invalid");
 assert.equal(await evaluate('document.querySelector("#pick-0-date").value'),"2023-02-29");
 await press("#cancelOpen");assert.equal(await evaluate('document.querySelector("#pick-0-date").value'),"2023-02-29");
 await edit("#pick-0-date","2026-11-03");assert.equal(await evaluate('document.querySelector("#saveRecord").disabled'),false);
 await evaluate('document.querySelector("#recordFile").value=""');await setFile("#recordFile",first.path);await waitFor(()=>evaluate('!document.querySelector("#preview").hidden'),"record preview");
 assert.equal(await evaluate('document.querySelector("#pick-0-date").value'),"2026-11-03");
 await press("#useRecord");assert.equal(await evaluate('document.querySelector("#pick-0-date").value'),"2026-11-02");
 const second=await download();assert.deepEqual(second.record,first.record);
 report.checks.push({name:"invalid draft blocks exports; cancel preserves it; explicit reopen restores exact recorded values",status:"passed"});
 await command("Emulation.setDeviceMetricsOverride",{width:375,height:820,deviceScaleFactor:1,mobile:true});
 await evaluate('document.querySelector(".record-toolbar").scrollIntoView({block:"start"})');
 assert.equal(await evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),true);
 await screenshot("mobile-record.png");
 await command("Emulation.setEmulatedMedia",{media:"print"});
 assert.equal(await evaluate('getComputedStyle(document.querySelector(".visit-fields")).display'),"none");
 assert.equal(await evaluate('getComputedStyle(document.querySelector(".print-values")).display'),"block");
 const pdf=Buffer.from((await command("Page.printToPDF",{printBackground:true,preferCSSPageSize:true})).data,"base64");await writeFile(join(output,"record-print.pdf"),pdf);
 report.print={path:"record-print.pdf",bytes:pdf.length,sha256:sha(pdf)};
 report.checks.push({name:"narrow viewport stays in bounds; native print contains explicit outcomes",status:"passed"});
 assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.externalRequests,[]);
 for(const pin of pins)assert.equal(sha(await readFile(join(root,pin.path))),pin.sha256);
 report.status="passed";report.sourceFilesUnchanged=true;
} catch(error){report.status="failed";report.error=error.stack;report.browserLog=browserLog;console.error(error.stack);process.exitCode=1;}
finally {
 if(socket?.readyState===WebSocket.OPEN)try{await command("Browser.close",{},false);}catch{}
 socket?.close();for(const p of pending.values())clearTimeout(p.timer);
 if(browser&&browser.exitCode===null&&browser.signalCode===null)browser.kill("SIGTERM");
 for(let i=0;browser&&browser.exitCode===null&&browser.signalCode===null&&i<30;i++)await sleep(100);
 report.browserExited=!browser||browser.exitCode!==null||browser.signalCode!==null;
 if(report.browserExited){await rm(profile,{recursive:true,force:true});report.ownedProfileRemoved=true;}else{report.cleanupError="Owned browser still running; profile retained.";process.exitCode=1;}
 server.closeAllConnections();await new Promise(r=>server.close(r));report.serverClosed=true;
 report.receiverSha256=sha(await readFile(fileURLToPath(import.meta.url)));report.finishedAt=new Date().toISOString();
 await writeFile(join(output,"receipt.json"),JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({status:report.status,checks:report.checks,receiptSha256:sha(await readFile(join(output,"receipt.json"))),browserExited:report.browserExited,ownedProfileRemoved:report.ownedProfileRemoved}));
}
