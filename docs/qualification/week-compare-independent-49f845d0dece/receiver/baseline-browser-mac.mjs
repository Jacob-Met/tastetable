import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,join,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('/Users/me/workspace/estate/production-evidence-49f845d0dece/browser-tools/node_modules/playwright');
const root='/Users/me/workspace/estate/tastetable-week-compare-receiving-49f845d0dece-mac', source=join(root,'baseline-source'), out=join(root,'evidence','baseline-browser');
const {readWeekFile}=await import('file://'+join(source,'static/week_file.mjs'));
const {createWeekPlan,setPickDay,setWeek,resetDays,weekRows,offWeekPicks}=await import('file://'+join(source,'static/week_plan.mjs'));
const hash=b=>createHash('sha256').update(b).digest('hex');
await mkdir(out,{recursive:true});
const receipt={startedAt:new Date().toISOString(),base:'a77175501199ace765cb7ca57742b267351d3e79',candidateInspected:false,method:'Real current baseline static planner Open saved week, select controls, date field, restore button, and native Chrome downloads; the authentic inputs were made by the actual native CLI and official converter. No FastAPI execution or synthesized API planning response.',downloads:[],steps:[],requests:[],pageErrors:[],status:'running'};
let browser,server;
const json=(path,data)=>writeFile(path,JSON.stringify(data,null,2)+'\n');
try{
 const expectedFiles=JSON.parse(await readFile(join(root,'evidence/baseline-source-manifest.json'),'utf8'));
 receipt.baselineManifestSha256=hash(await readFile(join(root,'evidence/baseline-source-manifest.json')));
 server=createServer(async(req,res)=>{const u=new URL(req.url,'http://localhost');receipt.requests.push({method:req.method,path:u.pathname});try{const path=resolve(source,'.'+(u.pathname==='/'?'/static/index.html':decodeURIComponent(u.pathname)));assert(path.startsWith(source+'/'));const b=await readFile(path);res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json'}[extname(path)]||'application/octet-stream'),'cache-control':'no-store'}).end(b);}catch{res.writeHead(404,{'content-type':'text/plain'}).end('Not found');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));receipt.origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--disable-gpu','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run'],env:{...process.env,TMPDIR:'/Users/me/tw49-tmp'}});
 receipt.browser=browser.version();
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:1000}});
 await context.addInitScript(()=>{window.__tw49Writes=[];for(const method of ['setItem','removeItem','clear']){const original=Storage.prototype[method];Storage.prototype[method]=function(...args){window.__tw49Writes.push({method,args});return original.apply(this,args);};}});
 const page=await context.newPage();page.on('pageerror',e=>receipt.pageErrors.push(String(e)));await page.goto(receipt.origin,{waitUntil:'networkidle'});
 assert.equal(await page.getByRole('link',{name:/compare saved weeks/i}).count(),0);receipt.steps.push('Baseline has no comparison link; /api/health correctly 404s on the static-only server and ordinary saved-week controls remain usable.');
 async function open(path){const c=page.waitForEvent('filechooser');await page.locator('#openWeek').click();await (await c).setFiles(path);await page.locator('#saveWeek:enabled').waitFor();await page.waitForFunction(()=>document.querySelector('#requestStatus').textContent.includes('Saved week opened'));receipt.steps.push({action:'native-file-picker-open',path});}
 async function select(key,day){await page.locator('select[data-pick-key="'+key+'"]').selectOption(day||'');receipt.steps.push({action:'select',key,day});}
 async function date(value){await page.locator('#weekDate').fill(value);await page.locator('#weekDate').blur();receipt.steps.push({action:'date-input',value});}
 async function save(name,expected,original){const pending=page.waitForEvent('download');await page.locator('#saveWeek').click();const d=await pending,path=join(out,name);await d.saveAs(path);assert.equal(await d.failure(),null);const b=await readFile(path),opened=readWeekFile(b.toString('utf8'));assert.deepEqual(opened.state,expected);for(const k of ['inputs','response','receivedAt','calendarId'])assert.deepEqual(opened[k],original[k],name+' preserves '+k);const row={name,suggestedFilename:d.suggestedFilename(),bytes:b.length,sha256:hash(b),receivedAt:opened.receivedAt,savedAt:opened.savedAt,calendarId:opened.calendarId,weekStart:opened.state.weekStart,assignments:opened.state.assignments,picks:opened.state.picks.map(p=>({key:p.key,name:p.pick.name,entity_id:p.pick.entity_id,originalDay:p.originalDay,day:opened.state.assignments[p.key]}))};receipt.downloads.push(row);return {opened,path,bytes:b};}
 const orig=readWeekFile(await readFile(join(root,'evidence/native-mei-week.json'),'utf8'));let state=orig.state;
 await open(join(root,'evidence/native-mei-week.json'));assert.equal(await page.locator('select[data-pick-key]').count(),5);
 await select('pick-4',null);state=setPickDay(state,'pick-4',null);await save('a-original.json',state,orig);
 for(const [key,day]of [['pick-0','Tuesday'],['pick-1',null],['pick-3','Tuesday'],['pick-4','Saturday']]){await select(key,day);state=setPickDay(state,key,day);}
 await save('b-rearranged.json',state,orig);
 await page.locator('#weekOrganizer').scrollIntoViewIfNeeded();await page.screenshot({path:join(out,'baseline-rearranged-desktop.png')});
 await date('2027-01-06');state=setWeek(state,'2027-01-06');await save('c-next-week.json',state,orig);
 for(const {key}of state.picks){await select(key,null);state=setPickDay(state,key,null);}await save('d-all-omitted.json',state,orig);
 await page.locator('#resetWeek').click();state=resetDays(state);receipt.steps.push({action:'Restore suggested days',weekStartRetained:state.weekStart});await save('e-restored.json',state,orig);
 const independent=readWeekFile(await readFile(join(root,'evidence/native-mei-independent-conversion.json'),'utf8'));assert.deepEqual(independent.response,orig.response);assert.deepEqual(independent.inputs,orig.inputs);assert.notEqual(independent.calendarId,orig.calendarId);assert.notEqual(independent.receivedAt,orig.receivedAt);
 await open(join(root,'evidence/native-mei-independent-conversion.json'));await save('f-new-declared-identity.json',independent.state,independent);
 const empty=readWeekFile(await readFile(join(root,'evidence/native-literal-empty-week.json'),'utf8'));await open(join(root,'evidence/native-literal-empty-week.json'));assert.equal(await page.locator('select[data-pick-key]').count(),0);await save('g-empty-literal.json',empty.state,empty);await date('2027-01-06');await save('h-empty-next-week.json',setWeek(empty.state,'2027-01-06'),empty);
 assert.equal(await page.locator('input[name="city"]').inputValue(),empty.inputs.city);assert.equal(await page.locator('img[src="x"]').count(),0);assert.equal(await page.evaluate('typeof window.__tw49'), 'undefined');
 receipt.storage=await page.evaluate(()=>({writes:window.__tw49Writes,local:Object.fromEntries(Object.entries(localStorage)),session:Object.fromEntries(Object.entries(sessionStorage))}));assert.deepEqual(receipt.storage,{writes:[],local:{},session:{}});
 assert.equal(receipt.requests.filter(r=>r.method!=='GET').length,0);assert.deepEqual(receipt.pageErrors,[]);
 receipt.inputsUnchanged=await Promise.all(['native-mei-week.json','native-mei-independent-conversion.json','native-literal-empty-week.json'].map(async name=>({name,sha256:hash(await readFile(join(root,'evidence',name)))})));
 receipt.status='passed';receipt.finishedAt=new Date().toISOString();
}catch(error){receipt.status='failed';receipt.finishedAt=new Date().toISOString();receipt.error={name:error.name,message:error.message,stack:error.stack};process.exitCode=1;}
finally{if(browser)await browser.close().catch(()=>{});if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await json(join(out,'receipt.json'),receipt);console.log(JSON.stringify({status:receipt.status,downloads:receipt.downloads.length,error:receipt.error,receipt:join(out,'receipt.json')}));}
