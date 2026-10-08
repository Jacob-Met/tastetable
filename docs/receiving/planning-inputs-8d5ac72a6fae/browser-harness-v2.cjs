/* Independent TasteTable planning-input browser receiver.
 * Frozen from the proposed public contract before candidate implementation access.
 * Uses actual maintained page/modules in Chromium and a recorded response fixture.
 * Backend transport is an explicit local fixture; no provider/network acceptance.
 */
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const payload = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const scratch = fs.mkdtempSync('/dev/tt-profile-root-8d-');
process.env.TMPDIR = scratch;
const { chromium } = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const gitBlob = value => crypto.createHash('sha1').update('blob ' + Buffer.byteLength(value) + '\0').update(value).digest('hex');
const sourcePins = Object.fromEntries(Object.entries(payload.files).map(([path, content]) => [path,{git_blob:gitBlob(content),sha256:hash(content),bytes:Buffer.byteLength(content)}]));
const calls = [], cases = [], pending = [], errors = [];
let delayedPlan = false;
const response = JSON.parse(payload.response);
const persona = {id:'receiver',label:'Authored receiver sample',cuisines:['Cuban'],music:['Celia Cruz'],films:[],city:'Pasadena',constraints:['soft_foods']};
const server = http.createServer(async (req,res)=>{
  const path = new URL(req.url,'http://localhost').pathname;
  if(path==='/api/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({qloo_mode:'mock'}));return;}
  if(path==='/api/personas'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify([persona]));return;}
  if(path.startsWith('/api/plan')){
    let text='';for await(const chunk of req)text+=chunk;
    calls.push({path,method:req.method,body:text?JSON.parse(text):null});
    const send=()=>{if(!res.destroyed){res.setHeader('Content-Type','application/json');res.end(payload.response);}};
    if(delayedPlan)pending.push(send);else send();
    return;
  }
  const key=path==='/'?'static/index.html':path.slice(1);
  if(!(key in payload.files)){res.writeHead(404);res.end('absent fixture resource');return;}
  res.setHeader('Content-Type',key.endsWith('.css')?'text/css':/\.(?:js|mjs)$/.test(key)?'text/javascript':'text/html');
  res.end(payload.files[key]);
});
const report = {schema:1,mode:payload.mode,baseline:payload.baseline,fixture_boundary:'Actual browser and maintained modules; local recorded HTTP response, no provider or installed service',sourcePins,cases,calls,errors};
let browser;
async function check(name,fn){try{await fn();cases.push({name,status:'pass'});}catch(e){cases.push({name,status:'fail',error:e.stack||String(e)});}}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,70)));}
async function snapshot(page){return page.evaluate(()=>({
  inputs:Object.fromEntries(['cuisines','music','films','city'].map(k=>[k,document.querySelector('#form [name="'+k+'"]').value])),
  constraints:[...document.querySelectorAll('#form [name=constraints]:checked')].map(x=>x.value),
  persona:document.querySelector('#personaSel').value,
  weekDate:document.querySelector('#weekDate').value,
  resultsHidden:document.querySelector('#results').hidden,
  summary:document.querySelector('#weekSummary').textContent,
  notes:[...document.querySelectorAll('#venueFollowup textarea')].map(x=>x.value),
  busy:document.querySelector('#form').getAttribute('aria-busy')
}));}
async function fill(page){for(const [k,v] of Object.entries({cuisines:' Cuban , , Mexican ',music:'Celia Cruz',films:'West Side Story',city:' Pasadena '}))await page.locator('#form [name="'+k+'"]').fill(v);await page.locator('#form [name=constraints][value=soft_foods]').check();}
async function startPage(){
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 page.setDefaultTimeout(4000);
 page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{
  window.__profileReads=[];
  window.__releaseProfileReads=()=>{for(const done of window.__profileReads.splice(0))done();};
  for(const method of ['arrayBuffer','text']){
   const orig=File.prototype[method];
   File.prototype[method]=function(...args){
    if(this.name.startsWith('failed-'))return Promise.reject(new Error('authored read refusal'));
    const ready=orig.apply(this,args);
    if(this.name.startsWith('delayed-'))return new Promise((resolve,reject)=>window.__profileReads.push(()=>ready.then(resolve,reject)));
    return ready;
   };
  }
 });
 await page.route('**/*',r=>r.request().url().startsWith(report.origin)?r.continue():r.abort('blockedbyclient'));
 await page.goto(report.origin,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>document.querySelector('#sampleBtn')&&!document.querySelector('#sampleBtn').disabled);
 return page;
}
function profileFile(name='valid.json',profile={cuisines:['Japanese'],music:['Jazz'],films:['Spirited Away'],city:'Tokyo, JP',constraints:['wheelchair']}){
 return {name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(profile))};
}
async function choose(page,file=profileFile()){await page.locator('#profileFile').setInputFiles(file);await settle(page);}
async function openPlan(page){
 await fill(page);await page.locator('#form button[type=submit]').click();
 await page.waitForFunction(()=>!document.querySelector('#results').hidden);
 const ta=page.locator('#venueFollowup textarea[data-contact-field="reply"]').first();if(await ta.count())await ta.fill('Authored receiver note');
 return snapshot(page);
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 report.origin='http://127.0.0.1:'+server.address().port;
 const executable=payload.browser;
 report.browser={path:executable,sha256:hash(fs.readFileSync(executable))};
 browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking'],env:{...process.env,TMPDIR:scratch}});
 report.browser.version=await browser.version();
 if(payload.mode==='baseline'){
  const page=await startPage();
  await check('original planner accepts recorded native fixture',async()=>{await openPlan(page);assert.equal((await snapshot(page)).resultsHidden,false);assert.equal(calls.length,1);});
  for(const id of ['saveProfile','openProfile','replaceProfile']){
   assert.equal(await page.locator('#'+id).count(),0);
   cases.push({name:'original lacks '+id,status:'expected-missing'});
  }
  await page.close();
 }else{
  await check('save is a real local download of normalized inputs without planning or mutation',async()=>{
   const page=await startPage();await fill(page);const before=await snapshot(page),count=calls.length;
   const [dl]=await Promise.all([page.waitForEvent('download'),page.locator('#saveProfile').click()]);
   const stream=await dl.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);
   const bytes=Buffer.concat(chunks);report.download={filename:dl.suggestedFilename(),sha256:hash(bytes),text:bytes.toString('utf8')};
   assert.equal(dl.suggestedFilename(),'tastetable-profile.json');
   assert.deepEqual(JSON.parse(bytes),{cuisines:['Cuban','Mexican'],music:['Celia Cruz'],films:['West Side Story'],city:'Pasadena',constraints:['soft_foods']});
   assert.deepEqual(await snapshot(page),before);assert.equal(calls.length,count);await page.close();
  });
  await check('preview and cancel preserve accepted week, notes, persona and inputs',async()=>{
   const page=await startPage();const before=await openPlan(page),count=calls.length;
   await choose(page);assert.equal(await page.locator('#profilePreview').evaluate(x=>x.hidden),false);
   assert.deepEqual(await snapshot(page),before);assert.equal(calls.length,count);
   await page.locator('#cancelProfile').click();assert.deepEqual(await snapshot(page),before);
   assert.equal(await page.locator('#profilePreview').evaluate(x=>x.hidden),true);await page.close();
  });
  await check('replace clears old plan only after explicit action and requires explicit next planning',async()=>{
   const page=await startPage();const before=await openPlan(page),count=calls.length;
   await choose(page);await page.locator('#replaceProfile').click();
   const after=await snapshot(page);assert.equal(after.resultsHidden,true);assert.equal(after.weekDate,before.weekDate);
   assert.deepEqual(after.inputs,{cuisines:'Japanese',music:'Jazz',films:'Spirited Away',city:'Tokyo, JP'});assert.deepEqual(after.constraints,['wheelchair']);
   assert.equal(calls.length,count);assert.equal(await page.locator('#form [name=cuisines]').evaluate(x=>x===document.activeElement),true);
   await page.locator('#form button[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#results').hidden);
   assert.equal(calls.length,count+1);assert.deepEqual(calls.at(-1).body,JSON.parse(profileFile().buffer));
   await page.close();
  });
  await check('literal preview cannot execute imported markup',async()=>{
   const page=await startPage();await fill(page);const count=calls.length;
   await choose(page,profileFile('markup.json',{cuisines:['<img src=x onerror=alert(1)>'],city:'<b>City</b>'}));
   assert.equal(await page.locator('#profilePreviewDetails img,#profilePreviewDetails b').count(),0);
   assert.match(await page.locator('#profilePreviewDetails').textContent(),/<img src=x onerror=alert\(1\)>/);
   assert.equal(calls.length,count);await page.close();
  });
  for(const file of [
   {name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"cuisines":["Cuban"],"cuisines":["Japanese"]}')},
   {name:'failed-read.json',mimeType:'application/json',buffer:Buffer.from('{"cuisines":["Cuban"]}')},
   {name:'oversized.json',mimeType:'application/json',buffer:Buffer.alloc(65537,32)}
  ]){
   await check(file.name+' preserves accepted state and retires older preview',async()=>{
    const page=await startPage();const before=await openPlan(page),count=calls.length;
    await choose(page);await choose(page,file);
    assert.deepEqual(await snapshot(page),before);assert.equal(calls.length,count);
    assert.equal(await page.locator('#profilePreview').evaluate(x=>x.hidden),true);await page.close();
   });
  }
  await check('new selection wins over earlier delayed file read',async()=>{
   const page=await startPage();await fill(page);
   await choose(page,profileFile('delayed-A.json',{cuisines:['Old file']}));
   await choose(page,profileFile('new-B.json',{cuisines:['New file']}));
   await page.evaluate(()=>window.__releaseProfileReads());await settle(page);
   const text=await page.locator('#profilePreviewDetails').textContent();assert.match(text,/New file/);assert.doesNotMatch(text,/Old file/);
   await page.locator('#replaceProfile').click();assert.equal((await snapshot(page)).inputs.cuisines,'New file');await page.close();
  });
  for(const action of ['edit','sample-selection','plan','open-week','stop','pagehide']){
   await check(action+' retires a late profile read',async()=>{
    const page=await startPage();await fill(page);
    await choose(page,profileFile('delayed-'+action+'.json',{cuisines:['Stale file']}));
    if(action==='edit')await page.locator('#form [name=cuisines]').fill('Fresh edit');
    if(action==='sample-selection')await page.locator('#personaSel').dispatchEvent('change');
    if(action==='plan')await page.locator('#form button[type=submit]').click();
    if(action==='open-week')await page.locator('#weekFile').setInputFiles({name:'saved.json',mimeType:'application/json',buffer:Buffer.from(payload.savedWeek)});
    if(action==='stop'){delayedPlan=true;await page.locator('#form button[type=submit]').click();await page.locator('#cancelPlan').click();delayedPlan=false;while(pending.length)pending.shift()();}
    if(action==='pagehide')await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
    await page.evaluate(()=>window.__releaseProfileReads());await settle(page);
    assert.equal(await page.locator('#profilePreview').evaluate(x=>x.hidden),true);assert.notEqual((await snapshot(page)).inputs.cuisines,'Stale file');
    await page.close();
   });
  }
  await check('replacing during pending plan ignores the later old result',async()=>{
   const page=await startPage();await fill(page);delayedPlan=true;const before=calls.length;
   await page.locator('#form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#form').getAttribute('aria-busy')==='true');
   await choose(page);assert.equal((await snapshot(page)).busy,'true');
   await page.locator('#replaceProfile').click();delayedPlan=false;while(pending.length)pending.shift()();await settle(page);
   const state=await snapshot(page);assert.equal(state.resultsHidden,true);assert.equal(state.busy,'false');assert.equal(state.inputs.cuisines,'Japanese');assert.equal(calls.length,before+1);
   await page.close();
  });
  await check('newly accepted plan retires an older staged preview',async()=>{
   const page=await startPage();await fill(page);delayedPlan=true;
   await page.locator('#form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#form').getAttribute('aria-busy')==='true');
   await choose(page);assert.equal(await page.locator('#profilePreview').evaluate(x=>x.hidden),false);
   delayedPlan=false;while(pending.length)pending.shift()();await page.waitForFunction(()=>!document.querySelector('#results').hidden);
   assert.equal(await page.locator('#profilePreview').evaluate(x=>x.hidden),true);await page.close();
  });
  assert.equal(errors.length,0,'unexpected browser page errors');
 }
 report.summary={passed:cases.filter(x=>x.status==='pass').length,failed:cases.filter(x=>x.status==='fail').length,expectedMissing:cases.filter(x=>x.status==='expected-missing').length};
 report.sourcePreserved=Object.entries(payload.files).every(([p,c])=>sourcePins[p].sha256===hash(c));
 console.log(JSON.stringify(report));
 process.exitCode=report.summary.failed?1:0;
})().catch(e=>{report.fatal=e.stack||String(e);console.log(JSON.stringify(report));process.exitCode=2;}).finally(async()=>{
 delayedPlan=false;while(pending.length)pending.shift()();
 if(browser)await browser.close();server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));
 fs.rmSync(scratch,{recursive:true,force:true});
});
