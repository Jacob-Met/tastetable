import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),crypto=require("node:crypto"),assert=require("node:assert/strict"),os=require("node:os");
const usage = "node tools/check_venue_question_reuse_browser.mjs --project PATH --output NEW_DIRECTORY --browser INSTALLED_CHROMIUM --playwright INSTALLED_PACKAGE";
const args=process.argv.slice(2), options={};
if(args.length===1 && args[0]==="--help") { console.log(usage); process.exit(0); }
for(let i=0;i<args.length;i+=2) {
 if(!["--project","--output","--browser","--playwright"].includes(args[i])||!args[i+1]||options[args[i].slice(2)]) throw new Error(usage);
 options[args[i].slice(2)]=args[i+1];
}
if(Object.keys(options).length!==4) throw new Error(usage);
const source=path.resolve(options.project),root=path.resolve(options.output),out=path.join(root,"evidence");
if(fs.existsSync(root)) throw new Error("Use a new exclusive output directory.");
const capacity=fs.statfsSync(path.dirname(root));
const available=Number(capacity.bavail)*Number(capacity.bsize);
if(available<224*1024*1024||os.freemem()<1024*1024*1024) throw new Error("Keep 128 MiB disk reserve plus 96 MiB working budget, and at least 1 GiB free memory.");
fs.accessSync(options.browser,fs.constants.X_OK);
const { chromium } = require(path.resolve(options.playwright));
fs.mkdirSync(root,{mode:0o700});
for(const name of ["tmp","downloads","evidence"])fs.mkdirSync(path.join(root,name));
process.env.TMPDIR=process.env.TMP=process.env.TEMP=path.join(root,"tmp");
const paths=["static/index.html","static/app.js","static/week_plan.mjs","static/week_file.mjs","static/venue_followup.mjs","static/venue_question_reuse.mjs","static/venue_note_file.mjs","static/style.css","static/calendar.css","static/venue_followup.css","static/calendar.js","static/plan-request.js","docs/receiving/caregiver-change-brief-0378a7b6/browser-baseline/earlier.json"];
const closure={source:{project:source,scope:"Actual current static page plus original fictional saved-week fixture"},files:paths.map(p=>{const b=fs.readFileSync(path.join(source,p));return{path:p,bytes:b.length,git_blob:crypto.createHash("sha1").update(Buffer.from("blob "+b.length+"\0")).update(b).digest("hex")};})};
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
const git=b=>crypto.createHash("sha1").update(Buffer.from("blob "+b.length+"\0")).update(b).digest("hex");
const pins=()=>closure.files.map(f=>{const b=fs.readFileSync(path.join(source,f.path));assert.equal(b.length,f.bytes);assert.equal(git(b),f.git_blob);return {path:f.path,bytes:b.length,sha256:sha(b),git_blob:git(b)}});
const receipt={format:"tastetable-question-reuse-browser/1",startedAt:new Date().toISOString(),source:closure.source,contract:"Explicit question-only reuse preserves occurrence/date identity and native reply context.",bootstrapStubs:{"GET /api/health":{qloo_mode:"mock"},"GET /api/personas":[]},sourcePinsBefore:[],steps:[],downloads:[],pageErrors:[],blockedRequests:[],servedRequests:[],status:"started"};
let browser,server;
const question="Could we use a quiet table?\nIs the side entrance open on 2026-12-28?";
const reply="Original date reply — keep with Monday.",nextStep="Call again if date changes.";
function check(name,fn){fn();receipt.steps.push({name,status:"pass"});}
async function snapshot(card){return card.evaluate(el=>({key:el.dataset.contactKey,date:el.dataset.contactDate,question:el.querySelector('[data-contact-field="question"]').value,reply:el.querySelector('[data-contact-field="reply"]').value,nextStep:el.querySelector('[data-contact-field="nextStep"]').value,status:el.querySelector('[data-contact-field="status"]').value,editorControls:[...el.querySelectorAll(".contact-question-editor input,.contact-question-editor textarea,.contact-question-editor select,.contact-question-editor button")].map(x=>({tag:x.tagName,field:x.dataset.contactField||null,text:x.tagName==="TEXTAREA"?null:x.textContent.trim()}))}));}
async function download(page,name){
 const wait=page.waitForEvent("download");await page.locator("[data-contact-file-save]").click();const item=await wait;
 const target=path.join(out,name);await item.saveAs(target);assert.equal(await item.failure(),null);
 const b=fs.readFileSync(target),parsed=JSON.parse(b.toString("utf8"));
 receipt.downloads.push({path:name,suggestedFilename:item.suggestedFilename(),bytes:b.length,sha256:sha(b),git_blob:git(b),savedAt:parsed.savedAt,records:parsed.records});
 return parsed;
}
async function main(){
 receipt.sourcePinsBefore=pins();
 server=http.createServer((req,res)=>{
  const u=new URL(req.url,"http://localhost");receipt.servedRequests.push({method:req.method,path:u.pathname});
  if(req.method!=="GET"){receipt.blockedRequests.push({method:req.method,url:req.url,reason:"non-GET"});res.writeHead(405);return res.end();}
  if(u.pathname==="/api/health"){res.setHeader("Content-Type","application/json");return res.end(JSON.stringify({qloo_mode:"mock"}));}
  if(u.pathname==="/api/personas"){res.setHeader("Content-Type","application/json");return res.end("[]");}
  if(u.pathname==="/favicon.ico"){res.writeHead(204);return res.end();}
  const relative=u.pathname==="/"?"static/index.html":u.pathname.replace(/^\/+/,"");
  const f=closure.files.find(f=>f.path===relative&&f.path.startsWith("static/"));
  if(!f){res.writeHead(404);return res.end("Not found");}
  res.setHeader("Content-Type",/\.(mjs|js)$/.test(relative)?"text/javascript; charset=utf-8":relative.endsWith(".css")?"text/css; charset=utf-8":"text/html; charset=utf-8");
  res.end(fs.readFileSync(path.join(source,relative)));
 });
 await new Promise(r=>server.listen(0,"127.0.0.1",r));const origin="http://127.0.0.1:"+server.address().port;
 browser=await chromium.launch({executablePath:path.resolve(options.browser),headless:true,timeout:15000,args:["--no-sandbox","--disable-dev-shm-usage"],downloadsPath:path.join(root,"downloads"),env:{...process.env,TMPDIR:path.join(root,"tmp"),TMP:path.join(root,"tmp"),TEMP:path.join(root,"tmp")}});
 receipt.runtime={node:process.version,chromium:browser.version(),executable:path.resolve(options.browser)};
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1200,height:900}});
 context.setDefaultTimeout(8000);
 await context.route("**/*",route=>{const request=route.request();if(request.url().startsWith(origin+"/")&&request.method()==="GET")return route.continue();receipt.blockedRequests.push({url:request.url(),method:request.method(),reason:"outside-local-GET"});return route.abort();});
 const page=await context.newPage();page.on("pageerror",e=>receipt.pageErrors.push(String(e)));
 await page.goto(origin,{waitUntil:"networkidle"});
 const fixture=closure.files.find(f=>f.path.endsWith("/earlier.json"));
 await page.locator("#weekFile").setInputFiles(path.join(source,fixture.path));
 const oldSelector='#venueFollowup [data-contact-key="pick-0"][data-contact-date="2026-12-28"]';
 let card=page.locator(oldSelector);await card.waitFor({state:"visible"});
 await card.locator(".contact-question-editor summary").click();
 await card.locator('[data-contact-field="question"]').fill(question);
 await card.locator('[data-contact-field="reply"]').fill(reply);
 await card.locator('[data-contact-field="nextStep"]').fill(nextStep);
 await card.locator('[data-contact-field="status"]').selectOption("reply_recorded");
 const edited=await snapshot(card);receipt.edited=edited;
 check("literal custom question and original reply recorded",()=>{assert.equal(edited.question,question);assert.equal(edited.reply,reply);assert.equal(edited.nextStep,nextStep);assert.equal(edited.status,"reply_recorded");});
 const first=await download(page,"01-original-date-notes.json");
 check("physical first notes download retains exact occurrence/date",()=>{assert.equal(first.records.length,1);assert.deepEqual(first.records[0],{key:"pick-0",date:"2026-12-28",note:{status:"reply_recorded",question,reply,replyQuestions:question,nextStep}});});
 await page.locator('#weekOrganizer select[data-pick-key="pick-0"]').selectOption("Thursday");
 card=page.locator('#venueFollowup [data-contact-key="pick-0"][data-contact-date="2026-12-31"]');await card.waitFor({state:"visible"});
 await card.locator(".contact-question-editor summary").click();
 const moved=await snapshot(card);receipt.moved=moved;
 check("new date intentionally starts a fresh note",()=>{assert.notEqual(moved.question,question);assert.match(moved.question,/2026-12-31/);assert.equal(moved.reply,"");assert.equal(moved.nextStep,"");assert.equal(moved.status,"not_contacted");});
 await card.locator("[data-question-reuse-source]").selectOption("2026-12-28");
 const previewText=await card.locator("[data-question-reuse-text]").textContent();
 const contextText=await card.locator("[data-question-reuse-context]").textContent();
 check("source and target dates accompany a literal preview",()=>{assert.equal(previewText,question);assert.match(contextText,/2026-12-28/);assert.match(contextText,/2026-12-31/);});
 await card.locator("[data-question-reuse-cancel]").click();
 assert.equal(await card.locator("[data-question-reuse-apply]").isDisabled(),true);
 assert.equal((await snapshot(card)).question,moved.question);
 await card.locator("[data-question-reuse-source]").selectOption("2026-12-28");
 await card.locator("[data-question-reuse-apply]").click();
 const reused=await snapshot(card);
 check("explicit Apply copies only questions into the fresh target",()=>{assert.equal(reused.question,question);assert.equal(reused.reply,"");assert.equal(reused.nextStep,"");assert.equal(reused.status,"not_contacted");});
 const second=await download(page,"02-fresh-target-notes.json");
 check("physical notes file retains original and exact fresh target",()=>{assert.deepEqual(second.records.find(r=>r.date==="2026-12-28"),first.records[0]);assert.deepEqual(second.records.find(r=>r.date==="2026-12-31"),{key:"pick-0",date:"2026-12-31",note:{status:"not_contacted",question,reply:"",replyQuestions:null,nextStep:""}});});
 await card.locator('[data-contact-field="question"]').fill("Thursday-specific questions.");
 await card.locator('[data-contact-field="reply"]').fill("Thursday reply.");
 await card.locator('[data-contact-field="nextStep"]').fill("Keep Thursday follow-up.");
 await card.locator('[data-contact-field="status"]').selectOption("reply_recorded");
 await card.locator("[data-question-reuse-source]").selectOption("2026-12-28");
 await card.locator("[data-question-reuse-apply]").click();
 const third=await download(page,"03-replied-target-notes.json");
 check("native reply-context policy survives reuse",()=>assert.deepEqual(third.records.find(r=>r.date==="2026-12-31"),{key:"pick-0",date:"2026-12-31",note:{status:"follow_up",question,reply:"Thursday reply.",replyQuestions:"Thursday-specific questions.",nextStep:"Keep Thursday follow-up."}}));
 const txtWait=page.waitForEvent("download");await page.locator("[data-contact-download]").click();const txtDownload=await txtWait;
 await txtDownload.saveAs(path.join(out,"04-existing-call-sheet.txt"));
 const txt=fs.readFileSync(path.join(out,"04-existing-call-sheet.txt"));
 assert.match(txt.toString("utf8"),/Earlier reply \/ notes/);assert.match(txt.toString("utf8"),/Thursday-specific questions/);
 receipt.downloads.push({path:"04-existing-call-sheet.txt",bytes:txt.length,sha256:sha(txt),git_blob:git(txt),suggestedFilename:txtDownload.suggestedFilename()});
 await card.screenshot({path:path.join(out,"03-reused-with-earlier-reply.png")});
 await page.locator('#weekOrganizer select[data-pick-key="pick-0"]').selectOption("Monday");
 card=page.locator(oldSelector);await card.waitFor({state:"visible"});
 const restored=await snapshot(card);receipt.restored=restored;
 check("moving back restores the exact original note",()=>{assert.equal(restored.question,question);assert.equal(restored.reply,reply);assert.equal(restored.nextStep,nextStep);assert.equal(restored.status,"reply_recorded");});
 check("no page errors or provider/nonlocal requests",()=>{assert.deepEqual(receipt.pageErrors,[]);assert.deepEqual(receipt.blockedRequests,[]);});
 receipt.status="pass";
}
(async()=>{try{await main();}catch(e){receipt.status="fail";receipt.error={name:e.name,message:e.message,stack:e.stack};process.exitCode=1;}
 finally{
  if(browser)await browser.close().catch(e=>{receipt.cleanupError=String(e);process.exitCode=1;});
  if(server)await new Promise(r=>server.close(r));
  try{receipt.sourcePinsAfter=pins();assert.deepEqual(receipt.sourcePinsAfter,receipt.sourcePinsBefore);}catch(e){receipt.status="fail";receipt.sourcePinError=String(e);process.exitCode=1;}
  receipt.finishedAt=new Date().toISOString();
  fs.writeFileSync(path.join(out,"QUESTION-REUSE-BROWSER-RESULT.json"),JSON.stringify(receipt,null,2)+"\n");
  process.stdout.write(JSON.stringify({status:receipt.status,steps:receipt.steps.length,downloads:receipt.downloads.length,error:receipt.error||null})+"\n");
 }})();
