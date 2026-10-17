#!/usr/bin/env node
/** Focused native CSV browser check. CDP lifecycle derives from check_visit_record_browser.mjs. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readVisitRecord } from '../static/visit_record.mjs';

const options = {};
for(let i=2;i<process.argv.length;i+=2){
  assert.ok(['--browser','--browser-workdir','--output','--mode'].includes(process.argv[i])&&process.argv[i+1]);
  assert.ok(!Object.hasOwn(options,process.argv[i]));options[process.argv[i]]=process.argv[i+1];
}
for(const key of ['--browser','--browser-workdir','--output'])assert.ok(options[key],key);
const baseline=options['--mode']==='baseline';assert.ok(!options['--mode']||['baseline','candidate'].includes(options['--mode']));
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),output=resolve(options['--output']);
const sha=b=>createHash('sha256').update(b).digest('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const paths=['static/visit-record.html','static/visit_record_ui.mjs','static/visit_record.css','static/visit_record.mjs','static/week_file.mjs','static/week_plan.mjs',...(!baseline?['static/visit_record_csv.mjs']:[])];
const pins=await Promise.all(paths.map(async path=>({path,sha256:sha(await readFile(join(root,path)))})));
await mkdir(output);
const browserRoot=await mkdtemp(join(resolve(options['--browser-workdir']),'tastetable-csv-check-'));
const profile=join(browserRoot,'profile'),downloads=join(browserRoot,'downloads');await mkdir(profile);await mkdir(downloads);
const counts={picks:0,with_qloo_entity_id:0,with_affinity_evidence:0,constraint_checked:0,unsafe_candidates_rejected:0};
const week={format:'tastetable.saved-week.v1',receivedAt:'2024-02-01T00:00:00.000Z',savedAt:'2024-02-25T18:00:00.000Z',calendarId:null,
  inputs:{city:'Fictional City',cuisines:[],music:[],films:[],constraints:[]},
  response:{mock:true,plan:{meals:[
    {name:'Café, "Same"',entity_id:'same-id',kind:'restaurant',day:'Monday',why:'  First\r\nreason  '},
    {name:'Café, "Same"',entity_id:'same-id',kind:'restaurant',day:'Tuesday',why:'Second reason'},
    {name:'Third café',entity_id:'third-id',kind:'restaurant',day:'Friday',why:'Third reason'}],outing:null,notes:[],rejected:[]},
    llm_only:{meals:[],outing:{name:'Comparison',day:'Saturday',why:'Original'}},comparison:{constraints:[],grounded:counts,llm_only:counts},trace:[]},
  week:{start:'2024-02-26',assignments:{'pick-0':'Thursday','pick-1':null,'pick-2':'Friday'}}};
const sourceText='\uFEFF'+JSON.stringify(week,null,2).replaceAll('\n','\r\n')+'\r\n';
const envelope={format:'tastetable.visit-record.v1',savedAt:'2024-03-03T12:00:00.000Z',source:{name:' original,week.json ',weekText:sourceText},visits:[
  {key:'pick-2',outcome:'unrecorded',date:null,note:''},
  {key:'pick-1',outcome:'did_not_go',date:'2024-03-02',note:'  A\rB\r\nC\n🙂\t '},
  {key:'pick-0',outcome:'went',date:'2024-03-01',note:'He said "yes", then went.'}]};
const admitted=readVisitRecord(JSON.stringify(envelope)).record;
const emptyWeek=structuredClone(week);emptyWeek.response.plan.meals=[];emptyWeek.week.assignments={};
const empty={...envelope,source:{name:'empty.json',weekText:JSON.stringify(emptyWeek)},visits:[]};
const stamp='2026-10-08T21:10:11.123Z';
const recordFile=join(browserRoot,'literal-record.json'),emptyFile=join(browserRoot,'empty-record.json');
await writeFile(recordFile,JSON.stringify(envelope));await writeFile(emptyFile,JSON.stringify(empty));
await writeFile(join(output,'fixture-record.json'),JSON.stringify(envelope,null,2)+'\n');
await writeFile(join(output,'fixture-empty.json'),JSON.stringify(empty,null,2)+'\n');
const columns=['source_name','week_start','source_mode','source_received_at','source_saved_at','record_saved_at','occurrence_key','venue_name','entity_id','kind','original_day','planned_day','planned_date','outcome','actual_date','note','original_explanation'];
const quote=v=>'"'+String(v??'').split('"').join('""')+'"';
const header=columns.map(quote).join(',')+'\r\n';
function expected(visits=admitted.visits){
  const dates=['2024-02-29',null,'2024-03-01'];
  return header+visits.map((v,i)=>{const p=week.response.plan.meals[i];return [envelope.source.name,'2024-02-26','mock',week.receivedAt,week.savedAt,stamp,'pick-'+i,p.name,p.entity_id,p.kind,p.day,week.week.assignments['pick-'+i],dates[i],v.outcome,v.date,v.note,p.why].map(quote).join(',')+'\r\n';}).join('');
}
await writeFile(join(output,'expected-original.csv'),expected());
const report={schema:'tastetable.visit_record_csv.author_browser.v1',mode:baseline?'baseline':'candidate',startedAt:new Date().toISOString(),status:'running',sourcePins:pins,checks:[],pageErrors:[],externalRequests:[],downloads:[],screenshots:[]};
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname));if(!path.startsWith(root+'/')){res.writeHead(403).end();return;}const bytes=await readFile(path);res.writeHead(200,{'Content-Type':({'.html':'text/html','.mjs':'text/javascript','.css':'text/css'}[extname(path)]||'application/octet-stream')+';charset=utf-8'}).end(bytes);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
let browser,socket,sessionId,nextId=0,browserLog='';const pending=new Map(),events=new Map();
async function waitFor(fn,label,attempts=200){let last;for(let i=0;i<attempts;i++){try{const v=await fn();if(v)return v;}catch(e){last=e;}await sleep(100);}throw new Error('Timed out: '+label+(last?' '+last.message:''));}
function command(method,params={},scoped=true){const id=++nextId;return new Promise((yes,no)=>{const timer=setTimeout(()=>{pending.delete(id);no(new Error('CDP timeout '+method));},15000);pending.set(id,{yes,no,timer});socket.send(JSON.stringify({id,method,params,...(scoped&&sessionId?{sessionId}:{})}));});}
async function evaluate(expression){const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function press(selector){await evaluate('document.querySelector('+JSON.stringify(selector)+').focus()');for(const type of ['keyDown','keyUp'])await command('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,...(type==='keyDown'?{text:'\r',unmodifiedText:'\r'}:{})});}
async function file(selector,path){const {root:doc}=await command('DOM.getDocument');const {nodeId}=await command('DOM.querySelector',{nodeId:doc.nodeId,selector});await evaluate('document.querySelector('+JSON.stringify(selector)+').value=""');await command('DOM.setFileInputFiles',{nodeId,files:[path]});}
async function edit(selector,value,event='input'){await evaluate('(()=>{const n=document.querySelector('+JSON.stringify(selector)+');n.value='+JSON.stringify(value)+';n.dispatchEvent(new Event('+JSON.stringify(event)+',{bubbles:true}));})()');}
async function download(selector,suffix){const before=new Set(events.keys());await press(selector);const event=await waitFor(()=>[...events.values()].find(e=>!before.has(e.guid)&&e.state==='completed'),'physical download');const bytes=await readFile(join(downloads,event.guid));const path='download-'+(report.downloads.length+1)+'.'+suffix;await writeFile(join(output,path),bytes);report.downloads.push({path,suggestedFilename:event.suggestedFilename,bytes:bytes.length,sha256:sha(bytes)});return {bytes,text:bytes.toString('utf8'),name:event.suggestedFilename};}
async function blocked(){assert.equal(await evaluate('["#saveRecord","#printRecord","#downloadCsv"].every(s=>document.querySelector(s).disabled)'),true);const size=events.size;await evaluate('document.querySelector("#downloadCsv").dispatchEvent(new MouseEvent("click",{bubbles:true}))');await sleep(200);assert.equal(events.size,size);}
async function capture(name){await evaluate('document.querySelector(".record-toolbar").scrollIntoView({block:"start"})');await sleep(200);const bytes=Buffer.from((await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64');await writeFile(join(output,name),bytes);report.screenshots.push({path:name,bytes:bytes.length,sha256:sha(bytes)});}
try{
 browser=spawn(options['--browser'],['--headless=new','--disable-gpu','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
 browser.stderr.on('data',b=>{browserLog=(browserLog+b).slice(-6000);});let launchError;browser.on('error',e=>{launchError=e;});
 const port=await waitFor(async()=>{if(launchError)throw launchError;if(browser.exitCode!==null)throw new Error('Browser exited '+browser.exitCode);return(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');},'browser launch',450);
 socket=new WebSocket('ws://127.0.0.1:'+port[0]+port[1]);socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.no(new Error(m.error.message)):p.yes(m.result);}else if(m.method==='Runtime.exceptionThrown')report.pageErrors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);else if(m.method==='Network.requestWillBeSent'){const u=m.params.request.url;if(/^https?:/.test(u)&&!u.startsWith(origin+'/'))report.externalRequests.push(u);}else if(m.method==='Browser.downloadWillBegin'||m.method==='Browser.downloadProgress')events.set(m.params.guid,{...events.get(m.params.guid),...m.params});});
 await new Promise((yes,no)=>{socket.addEventListener('open',yes,{once:true});socket.addEventListener('error',no,{once:true});});report.browser=await command('Browser.getVersion',{},false);report.browserPid=browser.pid;
 const {targetId}=await command('Target.createTarget',{url:'about:blank'},false);({sessionId}=await command('Target.attachToTarget',{targetId,flatten:true},false));for(const m of ['Page.enable','Runtime.enable','DOM.enable','Network.enable'])await command(m);
 await command('Page.addScriptToEvaluateOnNewDocument',{source:'{const NativeDate=Date;globalThis.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:['+JSON.stringify(stamp)+']));}static now(){return new NativeDate('+JSON.stringify(stamp)+').getTime();}};}'});
 await command('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:downloads,eventsEnabled:true},false);
 await command('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});await command('Page.navigate',{url:origin+'/static/visit-record.html'});
 await waitFor(()=>evaluate('document.readyState==="complete" && document.querySelector("#openRecord")'),'page ready');if(!baseline)await blocked();
 await file('#recordFile',recordFile);await waitFor(()=>evaluate('!document.querySelector("#preview").hidden'),'preview');assert.equal(await evaluate('document.querySelector("#record").hidden'),true);await press('#useRecord');
 await waitFor(()=>evaluate('document.querySelectorAll(".visit-card").length===3'),'accepted record');
 const json=await download('#saveRecord','json');assert.deepEqual(readVisitRecord(json.text).record,admitted);
 report.checks.push('original physical file selection, explicit Use and JSON continuation preserve model/source');
 if(baseline){assert.equal(await evaluate('document.querySelector("#downloadCsv")'),null);report.checks.push('original browser has no CSV download control');}
 else{
  const csv=await download('#downloadCsv','csv');assert.equal(csv.name,'tastetable-visits-2024-02-26.csv');assert.deepEqual(csv.bytes,Buffer.from(expected()));assert.match(await evaluate('document.querySelector("#saveStatus").textContent'),/CSV/);report.checks.push('keyboard CSV physical bytes match17-column expected report,3 distinct occurrences, export timestamp, CRLF/CR/LF and Unicode');
  const visits=structuredClone(admitted.visits);visits[0].outcome='did_not_go';visits[1].date='2025-01-01';await edit('#pick-0-outcome',visits[0].outcome,'change');await edit('#pick-1-date',visits[1].date);
  assert.deepEqual((await download('#downloadCsv','csv')).bytes,Buffer.from(expected(visits)));report.checks.push('unrelated outcome/date edits preserve literal imported note bytes');
  await edit('#pick-0-date','2023-02-29');await blocked();await edit('#pick-2-note','x'.repeat(4001));await blocked();await edit('#pick-0-date','2024-03-01');await blocked();await edit('#pick-2-note','new "note"\nnext');visits[2].note='new "note"\nnext';assert.equal(await evaluate('document.querySelector("#downloadCsv").disabled'),false);assert.deepEqual((await download('#downloadCsv','csv')).bytes,Buffer.from(expected(visits)));report.checks.push('simultaneous invalid date and note drafts guard forced clicks; every draft must recover before export');
  await file('#recordFile',emptyFile);await waitFor(()=>evaluate('!document.querySelector("#preview").hidden'),'replacement preview');assert.deepEqual((await download('#downloadCsv','csv')).bytes,Buffer.from(expected(visits)));assert.equal(await evaluate('document.querySelector("#preview").hidden'),true);await evaluate('document.querySelector("#useRecord").click()');assert.equal(await evaluate('document.querySelectorAll(".visit-card").length'),3);report.checks.push('CSV exports current record and retires pending replacement preview');
  await evaluate('globalThis.originalArrayBuffer=File.prototype.arrayBuffer;File.prototype.arrayBuffer=function(){return new Promise(resolve=>{globalThis.completeHeldRead=()=>originalArrayBuffer.call(this).then(resolve);});}');await file('#recordFile',emptyFile);await waitFor(()=>evaluate('typeof completeHeldRead==="function"'),'held actual file read');assert.deepEqual((await download('#downloadCsv','csv')).bytes,Buffer.from(expected(visits)));await evaluate('File.prototype.arrayBuffer=originalArrayBuffer;completeHeldRead()');await sleep(200);assert.equal(await evaluate('document.querySelector("#preview").hidden'),true);assert.equal(await evaluate('document.querySelectorAll(".visit-card").length'),3);report.checks.push('CSV retires a late physical File read without replacing accepted model');
  const roundtrip=await download('#saveRecord','json');assert.equal(readVisitRecord(roundtrip.text).record.source.weekText,sourceText);assert.deepEqual(readVisitRecord(roundtrip.text).record.visits,visits);assert.deepEqual((await download('#downloadCsv','csv')).bytes,Buffer.from(expected(visits)));report.checks.push('alternating JSON/CSV exports preserve records and yield complete physical files');
  await capture('desktop-csv.png');await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert.equal(await evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),true);assert.equal(await evaluate('(()=>{const r=document.querySelector("#downloadCsv").getBoundingClientRect();return r.width>=44&&r.height>=44;})()'),true);await capture('mobile-csv.png');assert.deepEqual((await download('#downloadCsv','csv')).bytes,Buffer.from(expected(visits)));report.checks.push('390px controls remain in bounds and keyboard export still works');
  await file('#recordFile',emptyFile);await waitFor(()=>evaluate('!document.querySelector("#preview").hidden'),'empty preview');await press('#useRecord');assert.equal(await evaluate('document.querySelectorAll(".visit-card").length'),0);assert.deepEqual((await download('#downloadCsv','csv')).bytes,Buffer.from(header));report.checks.push('explicit empty record replacement yields header-only CSV');
 }
 assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.externalRequests,[]);for(const pin of pins)assert.equal(sha(await readFile(join(root,pin.path))),pin.sha256);report.sourceFilesUnchanged=true;report.status='passed';
}catch(e){report.status='failed';report.error=e.stack;report.browserLog=browserLog;console.error(e.stack);process.exitCode=1;}
finally{
 if(socket?.readyState===WebSocket.OPEN)try{await command('Browser.close',{},false);}catch{}socket?.close();for(const p of pending.values())clearTimeout(p.timer);
 if(browser&&browser.exitCode===null&&browser.signalCode===null)browser.kill('SIGTERM');for(let i=0;browser&&browser.exitCode===null&&browser.signalCode===null&&i<30;i++)await sleep(100);
 report.browserExited=!browser||browser.exitCode!==null||browser.signalCode!==null;if(report.browserExited){await rm(profile,{recursive:true,force:true});report.ownedProfileRemoved=true;}else{report.cleanupError='Owned browser remains; profile retained.';process.exitCode=1;}
 server.closeAllConnections();await new Promise(r=>server.close(r));report.serverClosed=true;report.receiverSha256=sha(await readFile(fileURLToPath(import.meta.url)));report.finishedAt=new Date().toISOString();await writeFile(join(output,'receipt.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length,receiptSha256:sha(await readFile(join(output,'receipt.json'))),browserExited:report.browserExited,ownedProfileRemoved:report.ownedProfileRemoved}));
}
