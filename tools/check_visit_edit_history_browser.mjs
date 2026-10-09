import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
const ROOT=process.argv[2];
if(!ROOT||!path.isAbsolute(ROOT))throw Error('Explicit admitted root required');
const PACKET=JSON.parse(fs.readFileSync(path.join(ROOT,'source-packet.json'),'utf8'));
const POLICY=JSON.parse(fs.readFileSync(path.join(ROOT,'phase.json'),'utf8'));
const E=path.join(ROOT,'evidence'),PROFILE=path.join(ROOT,'profile');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const report={schema:'taste-visit-edit-recovery-browser.v1',source:PACKET.main,prerequisite:PACKET.prerequisite_head,checks:[],requests:[],blocked:[],browserErrors:[],downloads:[],harnessError:null,start:new Date().toISOString(),limits:POLICY.limits};
const check=(name,passed,observed,expected)=>report.checks.push({name,passed:!!passed,observed,expected});
function usedBytes(dir){let n=0;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);try{const s=fs.lstatSync(p);if(s.isDirectory())n+=usedBytes(p);else if(s.isFile())n+=s.size;}catch(err){if(err.code!=='ENOENT')throw err;}}return n;}
function resources(){const v=fs.statfsSync(ROOT),s=fs.statfsSync('/dev/shm');const mem=fs.readFileSync('/proc/meminfo','utf8').match(/^MemAvailable:\s+(\d+)\s+kB$/m);if(!mem)throw Error('Missing memory observation');let available=Number(mem[1])*1024;const cg=fs.readFileSync('/proc/self/cgroup','utf8').split('\n').find(x=>x.startsWith('0::'));if(!cg)throw Error('Missing cgroup');let p=path.join('/sys/fs/cgroup',cg.slice(3));while(p.startsWith('/sys/fs/cgroup')){if(fs.existsSync(path.join(p,'memory.max'))&&fs.existsSync(path.join(p,'memory.current'))){const max=fs.readFileSync(path.join(p,'memory.max'),'utf8').trim();if(max!=='max')available=Math.min(available,Math.max(0,Number(max)-Number(fs.readFileSync(path.join(p,'memory.current'),'utf8'))));}if(p==='/sys/fs/cgroup')break;p=path.dirname(p);}const own=usedBytes(POLICY.root);const observation={volume_available:v.bavail*v.bsize,shm_available:s.bavail*s.bsize,effective_memory:available,owned_bytes:own};if(observation.volume_available<POLICY.floors.volume||observation.shm_available<POLICY.floors.shm||available<POLICY.floors.memory||own>POLICY.owned_cap)throw Error('Task admission/resource floor refused: '+JSON.stringify(observation));return observation;}
function save(name,value){const b=Buffer.isBuffer(value)?value:Buffer.from(typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');if(usedBytes(POLICY.root)+b.length>POLICY.owned_cap)throw Error('Owned evidence byte cap refused');fs.writeFileSync(path.join(E,name),b,{flag:'wx',mode:0o600});}
let browser,ws,server,monitor,wall,fatal=null,base=null,browserClosed=null;
const pending=new Map();let next=0;
let browserExit=Promise.resolve(null);
function cmd(method,params={}){return new Promise((resolve,reject)=>{const id=++next,t=setTimeout(()=>{pending.delete(id);reject(Error('CDP deadline '+method));},POLICY.limits.cdp_ms);pending.set(id,{resolve:v=>{clearTimeout(t);resolve(v);},reject:e=>{clearTimeout(t);reject(e);}});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){if(fatal)throw fatal;const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function until(expression,timeout=POLICY.limits.cdp_ms){const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(expression))return;await sleep(100);}throw Error('DOM wait deadline: '+expression);}
async function click(selector){const point=await evaluate('(()=>{const e=document.querySelector('+JSON.stringify(selector)+');if(!e||e.disabled||!e.getClientRects().length)throw Error("Target unavailable");e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()');for(const type of ['mouseMoved','mousePressed','mouseReleased'])await cmd('Input.dispatchMouseEvent',{type,...point,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});}
async function key(value,code,vk,modifiers=0){for(const type of ['keyDown','keyUp'])await cmd('Input.dispatchKeyEvent',{type,key:value,code,windowsVirtualKeyCode:vk,modifiers});}
async function type(selector,value){await click(selector);await key('a','KeyA',65,2);await cmd('Input.insertText',{text:value});}
async function download(selector,label,extension){const dir=path.join(ROOT,'downloads',label);fs.mkdirSync(dir,{mode:0o700});await cmd('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:dir,eventsEnabled:true});const start=Date.now();await click(selector);let selected=null,lastSize=null,stable=0;while(Date.now()-start<POLICY.limits.cdp_ms){if(fatal)throw fatal;const files=fs.readdirSync(dir);if(files.length===1&&files[0].endsWith(extension)&&!files[0].endsWith('.crdownload')){const p=path.join(dir,files[0]),n=fs.statSync(p).size;if(n===lastSize&&n>0)stable++;else stable=0;lastSize=n;if(stable>=2){selected=p;break;}}await sleep(100);}if(!selected)throw Error('Physical download deadline '+label);const raw=fs.readFileSync(selected);report.downloads.push({label,path:path.relative(ROOT,selected),bytes:raw.length,sha256:sha(raw)});return raw;}
function csvRows(text){const rows=[];let row=[],field='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else quoted=false;}else field+=c;}else if(c==='"'){if(field!=='')throw Error('Malformed CSV field');quoted=true;}else if(c===','){row.push(field);field='';}else if(c==='\r'&&text[i+1]==='\n'){row.push(field);rows.push(row);row=[];field='';i++;}else throw Error('Unexpected unquoted CSV byte');}if(quoted||field||row.length)throw Error('Incomplete CSV');return rows;}
function sameCsvRecords(first, second, earliest, latest) {
  if (!same(first[0], second[0]) || first.length < 2 || first.length !== second.length) return false;
  const index = first[0].indexOf('record_saved_at');
  if (index < 0 || first[0].lastIndexOf('record_saved_at') !== index) return false;
  function validTimestamp(rows) {
    const value = rows[1][index], time = Date.parse(value);
    return Number.isFinite(time) && new Date(time).toISOString() === value &&
      time >= earliest && time <= latest && rows.slice(1).every(row => row[index] === value);
  }
  const stable = rows => rows.map(row => row.filter((_, i) => i !== index));
  return validTimestamp(first) && validTimestamp(second) &&
    Date.parse(second[1][index]) >= Date.parse(first[1][index]) &&
    same(stable(first), stable(second));
}

try{
  fs.mkdirSync(E,{mode:0o700});
  report.admission=resources();
  if(fs.existsSync(PROFILE))throw Error('Profile already exists');
  if(sha(fs.readFileSync(POLICY.browser))!==POLICY.browser_sha256)throw Error('Browser bytes changed');
  const sourceBytes=new Map();
  for(const f of PACKET.files){const b=fs.readFileSync(path.join(ROOT,'source',f.path));if(b.length!==f.bytes||sha(b)!==f.sha256)throw Error('Source changed: '+f.path);sourceBytes.set('/'+path.basename(f.path),b);}
  const inputPath=path.join(ROOT,PACKET.fixture.path),inputBytes=fs.readFileSync(inputPath);
  check('exact-candidate-composition',PACKET.files.length===8&&sha(inputBytes)===PACKET.fixture.sha256,PACKET.files.map(f=>({path:f.path,sha256:f.sha256})),8);
  const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
  server=http.createServer((request,response)=>{const u=new URL(request.url,'http://127.0.0.1');const b=sourceBytes.get(u.pathname);if(request.method!=='GET'||!b){response.writeHead(404);response.end();return;}response.writeHead(200,{'Content-Type':types[path.extname(u.pathname)]||'application/octet-stream','Cache-Control':'no-store'});response.end(b);});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});base='http://127.0.0.1:'+server.address().port;
  fs.mkdirSync(PROFILE,{mode:0o700});fs.mkdirSync(path.join(ROOT,'downloads'),{mode:0o700});
  const argv=['--headless','--no-sandbox','--disable-gpu','--no-zygote','--renderer-process-limit=1','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--disable-breakpad','--disable-crash-reporter','--metrics-recording-only','--disk-cache-size=1048576','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+PROFILE,'--disk-cache-dir='+path.join(PROFILE,'cache'),'--window-size=1280,900','about:blank'];
  save('browser-intent.json',{executable:POLICY.browser,sha256:POLICY.browser_sha256,argv});
  const stdout=fs.openSync(path.join(E,'browser.stdout.txt'),'wx',0o600),stderr=fs.openSync(path.join(E,'browser.stderr.txt'),'wx',0o600);
  browser=spawn(POLICY.browser,argv,{stdio:['ignore',stdout,stderr],env:{...process.env,TMPDIR:path.join(ROOT,'tmp')}});fs.closeSync(stdout);fs.closeSync(stderr);
  browserExit=new Promise(resolve=>browser.once('exit',(code,signal)=>resolve({code,signal})));browser.once('error',e=>{fatal=e;});
  report.browser_pid=browser.pid;
  monitor=setInterval(()=>{try{resources();}catch(e){fatal=e;if(browser.exitCode===null&&browser.signalCode===null)browser.kill('SIGTERM');}},250);
  wall=setTimeout(()=>{fatal=Error('Browser campaign deadline');if(browser.exitCode===null&&browser.signalCode===null)browser.kill('SIGTERM');},POLICY.limits.campaign_ms);
  const pf=path.join(PROFILE,'DevToolsActivePort'),deadline=Date.now()+POLICY.limits.startup_ms;
  while(!fs.existsSync(pf)){if(fatal)throw fatal;if(Date.now()>deadline)throw Error('Browser startup deadline');await sleep(100);}
  const port=Number(fs.readFileSync(pf,'utf8').split('\n')[0]);const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(POLICY.limits.cdp_ms)})).json();const target=targets.find(x=>x.type==='page');if(!target)throw Error('Owned page missing');
  ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('WebSocket open deadline')),POLICY.limits.cdp_ms);ws.addEventListener('open',()=>{clearTimeout(t);resolve();},{once:true});ws.addEventListener('error',e=>{clearTimeout(t);reject(e);},{once:true});});
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result||{});}return;}if(m.method==='Runtime.exceptionThrown')report.browserErrors.push(m.params.exceptionDetails);if(m.method==='Network.requestWillBeSent')report.requests.push({method:m.params.request.method,url:m.params.request.url});if(m.method==='Fetch.requestPaused'){const u=m.params.request.url,allowed=u.startsWith(base+'/')||u.startsWith('blob:'+base+'/');if(!allowed)report.blocked.push(u);cmd(allowed?'Fetch.continueRequest':'Fetch.failRequest',allowed?{requestId:m.params.requestId}:{requestId:m.params.requestId,errorReason:'BlockedByClient'}).catch(e=>{fatal=e;});}});
  await cmd('Network.enable');await cmd('Runtime.enable');await cmd('Page.enable');await cmd('Fetch.enable',{patterns:[{urlPattern:'*'}]});
  await cmd('Page.navigate',{url:base+'/visit-record.html'});await until('document.readyState==="complete" && !!document.querySelector("#recordFile") && !!document.querySelector("#downloadCsv")',POLICY.limits.startup_ms);
  const documentNode=await cmd('DOM.getDocument');const fileNode=await cmd('DOM.querySelector',{nodeId:documentNode.root.nodeId,selector:'#recordFile'});await cmd('DOM.setFileInputFiles',{nodeId:fileNode.nodeId,files:[inputPath]});
  await until('!document.querySelector("#preview").hidden && !document.querySelector("#useRecord").disabled');
  check('preview-before-use',await evaluate('document.querySelector("#record").hidden'),await evaluate('document.querySelector("#previewSummary").textContent'),'Current record remains absent before explicit Use');
  await click('#useRecord');await until('document.querySelectorAll(".visit-card").length===3');
  const expected=PACKET.expected;
  check('original-occurrence-order',same(await evaluate('Array.from(document.querySelectorAll(".visit-card"),e=>e.dataset.key)'),expected.visits.map(x=>x.key)),await evaluate('Array.from(document.querySelectorAll(".visit-card"),e=>e.dataset.key)'),expected.visits.map(x=>x.key));
  check('literal-source-name',await evaluate('document.querySelector("#sourceName").textContent')===expected.source_name,await evaluate('document.querySelector("#sourceName").textContent'),expected.source_name);
  const originalDownload=JSON.parse((await download('#saveRecord','before','.json')).toString('utf8'));
  check('physical-json-preserves-original-values',same(originalDownload.visits,expected.visits),originalDownload.visits,expected.visits);
  check('physical-json-preserves-source',originalDownload.source.weekText===expected.weekText&&originalDownload.source.name===expected.source_name,{name:originalDownload.source.name,weekText_sha256:sha(Buffer.from(originalDownload.source.weekText))},{name:expected.source_name,weekText_sha256:sha(Buffer.from(expected.weekText))});
  await type('#pick-1-note',expected.edit.note);await click('#pick-0-outcome');await key('ArrowDown','ArrowDown',40);await key('Enter','Enter',13);await key('Tab','Tab',9);
  await until('document.querySelector("#pick-0-outcome").value==="did_not_go"');
  check('actual-note-edit',await evaluate('document.querySelector("#pick-1-note").value')===expected.edit.note,await evaluate('document.querySelector("#pick-1-note").value'),expected.edit.note);
  check('actual-outcome-edit',await evaluate('document.querySelector("#pick-0-outcome").value')==='did_not_go',await evaluate('document.querySelector("#pick-0-outcome").value'),'did_not_go');
  const controls=await evaluate('Array.from(document.querySelectorAll("button"),e=>e.textContent.trim())');
  check('application-edit-recovery-available',controls.includes('Undo change')&&controls.includes('Redo change'),controls,'Undo change and Redo change');
  const after=JSON.parse((await download('#saveRecord','after','.json')).toString('utf8'));
  const finalVisits=expected.visits.map(v=>({...v,...(v.key==='pick-1'?{note:expected.edit.note}:{}),...(v.key==='pick-0'?{outcome:'did_not_go'}:{})}));
  check('physical-json-current-edits-only',same(after.visits,finalVisits),after.visits,finalVisits);
  check('physical-json-source-still-exact',same(after.source,originalDownload.source),after.source.name,originalDownload.source.name);
  const csv=csvRows((await download('#downloadCsv','csv','.csv')).toString('utf8'));const headers=csv[0],ix=k=>headers.indexOf(k);const projected=csv.slice(1).map(row=>({key:row[ix('occurrence_key')],outcome:row[ix('outcome')],date:row[ix('actual_date')]||null,note:row[ix('note')]}));
  check('retained-csv-current-edits',csv.length===4&&headers.length===17&&same(projected,finalVisits),projected,finalVisits);
  await click('#undoChange');
  check('undo-outcome',await evaluate('document.querySelector("#pick-0-outcome").value')==='went',await evaluate('document.querySelector("#pick-0-outcome").value'),'went');
  check('outcome-focus-restored',await evaluate('document.activeElement.id')==='pick-0-outcome',await evaluate('document.activeElement.id'),'pick-0-outcome');
  await click('#undoChange');
  check('note-focus-restored',await evaluate('document.activeElement.id')==='pick-1-note',await evaluate('document.activeElement.id'),'pick-1-note');
  const restored=JSON.parse((await download('#saveRecord','restored','.json')).toString('utf8'));
  check('undo-physical-json-entire-original',same(restored.visits,expected.visits)&&same(restored.source,originalDownload.source),{source:restored.source.name,visits:restored.visits},{source:expected.source_name,visits:expected.visits});
  check('undo-exhausted-redo-available',await evaluate('document.querySelector("#undoChange").disabled&&!document.querySelector("#redoChange").disabled'),await evaluate('({undo:document.querySelector("#undoChange").disabled,redo:document.querySelector("#redoChange").disabled})'),{undo:true,redo:false});
  await click('#redoChange');await click('#redoChange');
  const redone=JSON.parse((await download('#saveRecord','redone','.json')).toString('utf8'));
  check('redo-physical-json-entire-edited',same(redone.visits,finalVisits)&&same(redone.source,originalDownload.source),{source:redone.source.name,visits:redone.visits},{source:expected.source_name,visits:finalVisits});
  check('redo-exhausted-undo-available',await evaluate('!document.querySelector("#undoChange").disabled&&document.querySelector("#redoChange").disabled'),await evaluate('({undo:document.querySelector("#undoChange").disabled,redo:document.querySelector("#redoChange").disabled})'),{undo:false,redo:true});
  const recoveredCsv=csvRows((await download('#downloadCsv','redone-csv','.csv')).toString('utf8'));
  check('redo-csv-entire-edited',sameCsvRecords(csv,recoveredCsv,Date.parse(report.start),Date.now()),recoveredCsv,csv);
  check('no-original-input-write',sha(fs.readFileSync(inputPath))===PACKET.fixture.sha256,sha(fs.readFileSync(inputPath)),PACKET.fixture.sha256);
  check('no-source-write',PACKET.files.every(f=>sha(fs.readFileSync(path.join(ROOT,'source',f.path)))===f.sha256),PACKET.files.length,8);
  check('no-provider-or-write-request',report.blocked.length===0&&report.requests.every(r=>r.method==='GET'&&(r.url.startsWith(base+'/')||r.url.startsWith('blob:'+base+'/'))),report.requests,'Only GET requests to owned exact-source server or its blob URLs');
  check('no-browser-exception',report.browserErrors.length===0,report.browserErrors,[]);
  save('final.dom.html',await evaluate('document.documentElement.outerHTML'));const shot=await cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});save('final.png',Buffer.from(shot.data,'base64'));
}catch(e){report.harnessError=String(e?.stack||e);}
finally{
  clearInterval(monitor);clearTimeout(wall);
  if(browser){if(browser.exitCode!==null||browser.signalCode!==null)browserClosed={code:browser.exitCode,signal:browser.signalCode};else{try{if(ws?.readyState===WebSocket.OPEN)await cmd('Browser.close');}catch(e){report.close_message=String(e);}browserClosed=await Promise.race([browserExit,sleep(POLICY.limits.teardown_ms).then(()=>null)]);if(!browserClosed){browser.kill('SIGTERM');browserClosed=await Promise.race([browserExit,sleep(POLICY.limits.teardown_ms).then(()=>null)]);}if(!browserClosed){browser.kill('SIGKILL');browserClosed=await Promise.race([browserExit,sleep(POLICY.limits.teardown_ms).then(()=>null)]);}}}
  ws?.close();for(const p of pending.values())p.reject(Error('Receiver closed'));pending.clear();
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  report.browser_exit=browserClosed;report.browser_closure_known=!!browserClosed;report.resource_failure=fatal?String(fatal):null;report.end=new Date().toISOString();report.summary={checks:report.checks.length,passed:report.checks.filter(c=>c.passed).length,failed:report.checks.filter(c=>!c.passed).length};
  if(fs.existsSync(E)){try{save('browser-report.json',report);}catch(e){report.receipt_write_error=String(e);}}
  console.log(JSON.stringify({schema:report.schema,summary:report.summary,harnessError:report.harnessError,browser_exit:browserClosed,receipt_write_error:report.receipt_write_error??null,report}));
  process.exitCode=report.harnessError||fatal||!browserClosed||report.receipt_write_error?2:report.summary.failed?1:0;
}
