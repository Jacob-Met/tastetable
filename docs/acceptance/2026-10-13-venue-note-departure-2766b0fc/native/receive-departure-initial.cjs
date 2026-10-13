const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),http=require("node:http"),os=require("node:os"),assert=require("node:assert/strict");
const {chromium}=require("C:/HAMON/acceptance/status-download-2766b0fc/node_modules/playwright");
const root=__dirname,variant=process.argv[2],project=path.join(root,variant),out=path.join(root,variant+"-browser");
if(!["original","candidate"].includes(variant))throw Error("Choose original or candidate");
fs.mkdirSync(out,{recursive:true});
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
const packet=JSON.parse(fs.readFileSync(path.join(root,"source-packet.json"),"utf8"));
const allowed=new Set(packet.files.map(x=>x.path).filter(x=>x.startsWith("static/")));
const fixture=path.join(project,"docs/venue-followup-6c20bb4b010e/author/final/saved-composition-week.json");
const result={schema:"tastetable-venue-departure-receiving/1",variant,base:packet.base,started:new Date().toISOString(),runtime:{node:process.version,os:os.type(),release:os.release(),arch:os.arch(),user:os.userInfo().username,playwright:require("C:/HAMON/acceptance/status-download-2766b0fc/node_modules/playwright/package.json").version},bootstrap:"Exact static app; authored GET-only mock health/personas. Existing Git-pinned native saved-week fixture imported through actual file chooser. No FastAPI/provider execution.",fixture:{bytes:fs.statSync(fixture).size,sha256:sha(fs.readFileSync(fixture))},sources:{},groups:[],pageErrors:[],requests:[],serverRequests:[],artifacts:[]};
for(const p of allowed)result.sources[p]=sha(fs.readFileSync(path.join(project,p)));
const server=http.createServer((req,res)=>{try{
const u=new URL(req.url,"http://localhost");result.serverRequests.push({method:req.method,path:u.pathname});
if(req.method!=="GET"){res.writeHead(405).end();return;}
if(u.pathname==="/api/health"||u.pathname==="/api/personas"){res.writeHead(200,{"Content-Type":"application/json"}).end(u.pathname==="/api/health"?'{"qloo_mode":"mock"}':"[]");return;}
if(u.pathname==="/left.html"){res.writeHead(200,{"Content-Type":"text/html"}).end("<!doctype html><title>Departure received</title><h1>Departure received</h1>");return;}
const p=u.pathname==="/"? "static/index.html":u.pathname.slice(1);
if(!allowed.has(p)){res.writeHead(404).end();return;}
res.writeHead(200,{"Content-Type":({".html":"text/html",".js":"text/javascript",".mjs":"text/javascript",".css":"text/css"})[path.extname(p)]+";charset=utf-8","Cache-Control":"no-store"}).end(fs.readFileSync(path.join(project,p)));
}catch(e){res.writeHead(500).end(String(e));}});
let browser,base;
async function openWeek(page){
const [chooser]=await Promise.all([page.waitForEvent("filechooser"),page.click("#openWeek")]);
await chooser.setFiles(fixture);
await page.waitForFunction(()=>!document.querySelector("#venueFollowup").hidden&&document.querySelectorAll("[data-contact-field=reply]").length>0);
}
async function departure(page,{expected=true,decision="dismiss",kind="reload"}={}){
const seen=[];const handler=async d=>{seen.push({type:d.type(),message:d.message(),decision});assert.equal(d.type(),"beforeunload");await d[decision]();};
page.on("dialog",handler);let error=null;
try{if(kind==="reload")await page.reload({waitUntil:"domcontentloaded",timeout:5000});else await page.goto(base+"/left.html",{waitUntil:"domcontentloaded",timeout:5000});}
catch(e){error=String(e);}
page.off("dialog",handler);
if(error&&!(seen.length&&decision==="dismiss"&&/ERR_ABORTED|interrupted|cancelled|canceled/.test(error)))throw Error(error);
assert.equal(seen.length,expected?1:0,"actual browser departure dialog count");
return {kind,seen,error};
}
async function download(page,selector,name){
const [d]=await Promise.all([page.waitForEvent("download"),page.click(selector)]);
const f=path.join(out,name);await d.saveAs(f);const b=fs.readFileSync(f);
result.artifacts.push({name,bytes:b.length,sha256:sha(b),suggestedFilename:d.suggestedFilename()});return {f,b};
}
async function group(name,fn){const entry={name,status:"running",observations:[]};result.groups.push(entry);
const context=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:900}});
const page=await context.newPage();page.on("pageerror",e=>result.pageErrors.push({group:name,error:String(e)}));
page.on("request",r=>result.requests.push({group:name,url:r.url(),method:r.method()}));
try{await page.goto(base);await page.waitForFunction(()=>document.querySelector("#mode").textContent.includes("Demo mode"));await page.click("h1");await fn(page,entry);entry.status="passed";}
catch(e){entry.status="failed";entry.error=String(e);try{await page.screenshot({path:path.join(out,name+"-failure.png"),fullPage:true});}catch{}}
finally{await context.close();}}
(async()=>{try{
await new Promise(r=>server.listen(0,"127.0.0.1",r));base="http://127.0.0.1:"+server.address().port;result.baseUrl=base;
browser=await chromium.launch({executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});result.runtime.browser=browser.version();
await group("empty-and-reverted",async(page,g)=>{
g.observations.push(await departure(page,{expected:false,decision:"accept"}));await openWeek(page);
const reply=page.locator('[data-contact-field="reply"]').first();await reply.fill("temporary");await reply.fill("");
const status=page.locator('[data-contact-field="status"]').first();await status.selectOption("awaiting_reply");await status.selectOption("not_contacted");
await page.locator(".contact-question-editor summary").first().click();const q=page.locator('[data-contact-field="question"]').first(), original=await q.inputValue();
await q.fill("temporary question");await q.fill(original);
g.observations.push(await departure(page,{expected:false,decision:"accept"}));assert.equal(await page.locator("#results").isHidden(),true);
});
await group("reply-cancel-export-and-leave",async(page,g)=>{
await openWeek(page);const reply=page.locator('[data-contact-field="reply"]').first();await reply.fill("Synthetic receiving note.\nKeep after cancellation.");
const before=await page.locator("#weekTitle").textContent();g.observations.push(await departure(page));
assert.equal(await reply.inputValue(),"Synthetic receiving note.\nKeep after cancellation.");assert.equal(await page.locator("#weekTitle").textContent(),before);
const d=await download(page,"[data-contact-file-save]","retained-venue-notes.json");const envelope=JSON.parse(d.b);assert.ok(envelope.records.some(r=>r.note.reply==="Synthetic receiving note.\nKeep after cancellation."));
g.observations.push(await departure(page));assert.equal(await reply.inputValue(),"Synthetic receiving note.\nKeep after cancellation.");
await page.screenshot({path:path.join(out,"retained-notes.png"),fullPage:true});
g.observations.push(await departure(page,{decision:"accept"}));assert.equal(await page.locator("#results").isHidden(),true);
g.observations.push(await departure(page,{expected:false,decision:"accept"}));
});
for(const [field,value] of [["status","awaiting_reply"],["nextStep","Ask the venue later"],["question",""]]){
await group("field-"+field,async(page,g)=>{
await openWeek(page);if(field==="question")await page.locator(".contact-question-editor summary").first().click();
const f=page.locator('[data-contact-field="'+field+'"]').first();const original=await f.inputValue();
if(field==="status")await f.selectOption(value);else await f.fill(value);
g.observations.push(await departure(page,{kind:"navigate"}));assert.equal(await f.inputValue(),value);
if(field==="status")await f.selectOption(original);else await f.fill(original);
g.observations.push(await departure(page,{kind:"navigate",expected:false,decision:"accept"}));assert.match(await page.title(),/Departure received/);
});}
await group("retained-hidden-date-and-invalid-date",async(page,g)=>{
await openWeek(page);await page.locator('[data-contact-field="reply"]').first().fill("Retained off-week note");
const first=page.locator("select[data-pick-key]").first();const day=await first.inputValue();const key=await first.getAttribute("data-pick-key");
await first.selectOption("");g.observations.push(await departure(page));assert.equal(await page.locator('#omittedPicks select[data-pick-key="'+key+'"]').inputValue(),"");
await page.fill("#weekDate","2027-01-04");g.observations.push(await departure(page));
await page.fill("#weekDate","");g.observations.push(await departure(page));assert.equal(await page.locator("#weekDate").inputValue(),"");
g.observations.push({originalDay:day,retainedRecordProtectedAcrossThreeViews:true});
});
await group("import-and-empty-replacement",async(page,g)=>{
await openWeek(page);await page.locator('[data-contact-field="reply"]').first().fill("Imported synthetic note");
const d=await download(page,"[data-contact-file-save]","imported-venue-notes.json");const empty=JSON.parse(d.b);empty.records=[];const emptyPath=path.join(out,"empty-venue-notes.json");fs.writeFileSync(emptyPath,JSON.stringify(empty,null,2)+"\n");
async function replace(file){const [chooser]=await Promise.all([page.waitForEvent("filechooser"),page.click("[data-contact-file-open]")]);await chooser.setFiles(file);await page.waitForSelector("[data-contact-file-apply]:not([disabled])");await page.click("[data-contact-file-apply]");}
await replace(emptyPath);assert.equal(await page.locator('[data-contact-field="reply"]').first().inputValue(),"");
g.observations.push(await departure(page,{expected:false,decision:"accept"}));await openWeek(page);await replace(d.f);
assert.equal(await page.locator('[data-contact-field="reply"]').first().inputValue(),"Imported synthetic note");
g.observations.push(await departure(page));
const malformed=path.join(out,"malformed.json");fs.writeFileSync(malformed,"{");
const [chooser]=await Promise.all([page.waitForEvent("filechooser"),page.click("[data-contact-file-open]")]);await chooser.setFiles(malformed);
await page.waitForFunction(()=>document.querySelector("[data-contact-file-status]").textContent.includes("could not"));
g.observations.push(await departure(page));assert.equal(await page.locator('[data-contact-field="reply"]').first().inputValue(),"Imported synthetic note");
await replace(emptyPath);g.observations.push(await departure(page,{expected:false,decision:"accept"}));
});
await group("explicit-plan-retirement",async(page,g)=>{
await openWeek(page);await page.locator('[data-contact-field="reply"]').first().fill("Retired with plan");
await page.locator("#form [name=city]").fill("Changed synthetic city");assert.equal(await page.locator("#results").isHidden(),true);
g.observations.push(await departure(page,{expected:false,decision:"accept"}));
});
result.externalRequests=result.requests.filter(r=>!r.url.startsWith(base+"/"));
assert.equal(result.externalRequests.length,0);assert.equal(result.pageErrors.length,0);
result.sourceUnchanged=[...allowed].every(p=>result.sources[p]===sha(fs.readFileSync(path.join(project,p))));
assert.equal(result.sourceUnchanged,true);result.status=result.groups.every(g=>g.status==="passed")?"passed":"failed";
}catch(e){result.status="failed";result.fatal=String(e);}finally{
result.finished=new Date().toISOString();fs.writeFileSync(path.join(out,"result.json"),JSON.stringify(result,null,2)+"\n");
if(browser)await browser.close();await new Promise(r=>server.close(r));
console.log(JSON.stringify({variant,status:result.status,groups:result.groups.map(g=>({name:g.name,status:g.status,error:g.error})),pageErrors:result.pageErrors,externalRequests:result.externalRequests?.length,started:result.started,finished:result.finished}));
process.exitCode=result.status==="passed"?0:1;}})();