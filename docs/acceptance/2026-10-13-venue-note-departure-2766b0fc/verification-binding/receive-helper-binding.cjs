(async()=>{
const fs=require("fs"),path=require("path"),crypto=require("crypto"),http=require("http"),assert=require("assert/strict");
const {chromium}=require("C:/HAMON/acceptance/status-download-2766b0fc/node_modules/playwright");
const root=__dirname,project=path.join(root,"original");
const declared=["static/week_plan.mjs","static/week_file.mjs","static/calendar.js","static/calendar.css","static/app.js","static/index.html","static/venue_followup.mjs","static/venue_followup.css","static/saved_weeks.mjs","static/saved_week_store.mjs","static/saved_week_ui.mjs","static/saved_weeks.css","static/venue_note_file.mjs","static/style.css","static/plan-request.js"];
const report={schema:"tastetable-original-helper-binding-probe/1",base:"95738e812de81e3ace9830cdfabbbe7e39ff4686",source:"Original product in both controls; only the declared HTTP allowlist differs.",started:new Date().toISOString(),node:process.version,groups:[]};
const browser=await chromium.launch({executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});report.browser=browser.version();
for(const repaired of [false,true]){
const paths=new Set(repaired?[...declared,"static/caregiver_handoff.mjs"]:declared),requests=[];
const server=http.createServer((req,res)=>{const u=new URL(req.url,"http://localhost");requests.push(u.pathname);
if(u.pathname==="/api/health"||u.pathname==="/api/personas"){res.writeHead(200,{"Content-Type":"application/json"}).end(u.pathname==="/api/health"?'{"qloo_mode":"mock"}':"[]");return;}
const p=u.pathname==="/"?"static/index.html":u.pathname.slice(1);if(!paths.has(p)){res.writeHead(404).end();return;}
res.writeHead(200,{"Content-Type":({".html":"text/html",".mjs":"text/javascript",".js":"text/javascript",".css":"text/css"})[path.extname(p)]}).end(fs.readFileSync(path.join(project,p)));});
await new Promise(r=>server.listen(0,"127.0.0.1",r));const base="http://127.0.0.1:"+server.address().port;
const context=await browser.newContext(),page=await context.newPage();const responsePromise=page.waitForResponse(r=>r.url().endsWith("/static/caregiver_handoff.mjs"));
await page.goto(base);const status=(await responsePromise).status();
const g={repaired,moduleHttpStatus:status,requests};
if(repaired){assert.equal(status,200);await page.waitForFunction(()=>document.querySelector("#mode").textContent.includes("Demo mode"));const [chooser]=await Promise.all([page.waitForEvent("filechooser"),page.click("#openWeek")]);await chooser.setFiles(path.join(project,"docs/venue-followup-6c20bb4b010e/author/final/saved-composition-week.json"));await page.waitForFunction(()=>!document.querySelector("#results").hidden);g.fileChooserAndNativeWeekOpened=true;}
else{assert.equal(status,404);assert.equal(await page.locator("#mode").textContent(),"");assert.equal(requests.includes("/api/health"),false);g.originalAppInitializationPrevented=true;}
g.status="passed";report.groups.push(g);await context.close();await new Promise(r=>server.close(r));}
await browser.close();report.finished=new Date().toISOString();report.status="passed";fs.writeFileSync(path.join(root,"helper-binding-probe.json"),JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;});
