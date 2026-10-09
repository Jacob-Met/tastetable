// Independent TasteTable installed use under the frozen original-only contract.
// The qualified Chrome/CDP transport comes from RecallWeave bab37b9983310d096313ca83f076734ac587ca27.
// No original or candidate application module is imported as an oracle.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const CFG=JSON.parse(fs.readFileSync(path.join(ROOT,'AUTHORITY.json'),'utf8'));
const INSTALL='/Users/me/Applications/TasteTableVisitRecord-c945953fdeb7';
const AUTHOR='/Users/me/Developer/tastetable-visit-record-local-c945953fdeb7';
const ENTRY=path.join(INSTALL,'Open TasteTable Visit Record.command');
const PYTHON='/Library/Frameworks/Python.framework/Versions/3.13/bin/python3';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN='http://127.0.0.1:48661/';
const EDITOR=ORIGIN+'static/visit-record.html';
const OUTPUT=path.join(ROOT,'results'), BROWSER=path.join(ROOT,'browser');
const CONTRACT='e194d0bae55e9a1b3a2b97d4accd2c1b81a8ae0e';
const NOTE='Receiver note: café, "shared table".\nPlease keep the saved week.';
const ORIGINAL_NOTE='He said "yes", then went.';
const MIN_DISK=256*1024**2,MIN_MEMORY=2*1024**3,STATIC_CAP=2*1024**2,BROWSER_CAP=96*1024**2;
const processStart=performance.now();
const receipt={format:'tastetable.independent-installed-receiving.v1',receiver:'estate-c945953fdeb7/research_execution_next',contract:CONTRACT,
 accepted:false,groups:{},failure:null,actions:[],guards:[],servers:[],browsers:[],comparators:[],downloads:[],observations:{exceptions:[],console:[],log:[],requests:[],responses:[],loading_failed:[],downloads:[],input_events:[]},
 scope:'one fixed note edit, one Undo/Redo, physical JSON and CSV, new browser/server session and physical JSON recovery; no original matrix or candidate module imports'};
let group='admission',before=null,intervalStart=null,boundaryError=null,deadlineTimer=null,growthTimer=null;
let chrome=null,chromeExit=null,connection=null,session=null,server=null,serverExit=null;
let profile=null,downloadDir=null,chromeStdout='',chromeStderr='',serverStdout='',serverStderr='';
let chromeRecord=null,serverRecord=null,sessionNumber=0,closing=false,serverReady=null;
const watchPids=new Set();
function require(ok,msg){if(!ok)throw new Error(msg);}
function pin(b){return {bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex'),git_blob:crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex')};}
function samePin(a,b){return ['bytes','sha256','git_blob'].every(k=>a[k]===b[k]);}
function writefile(name,b){const p=path.join(OUTPUT,name);require(!name.includes('..')&&!path.isAbsolute(name),'owned output path');fs.writeFileSync(p,b,{flag:'wx',mode:0o600});return pin(b);}
function jsonfile(name,value){return writefile(name,Buffer.from(JSON.stringify(value,null,2)+'\n'));}
function fileIdentity(p,cap=2*1024**2){
 const a=fs.lstatSync(p,{bigint:true});require(a.isFile()&&!a.isSymbolicLink()&&a.size<=BigInt(cap),'bounded regular input '+p);
 const fd=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let b,opened;
 try{opened=fs.fstatSync(fd,{bigint:true});b=fs.readFileSync(fd);}finally{fs.closeSync(fd);}
 const z=fs.lstatSync(p,{bigint:true});
 require(a.ino===opened.ino&&a.dev===opened.dev&&a.ino===z.ino&&a.size===z.size&&a.mtimeNs===z.mtimeNs&&BigInt(b.length)===a.size,'file changed during read '+p);
 return {...pin(b),mode:Number(a.mode&0o7777n).toString(8).padStart(4,'0'),mtime_ns:a.mtimeNs.toString()};
}
function census(root){const out={};function walk(p,rel){for(const n of fs.readdirSync(p).sort()){const q=path.join(p,n),r=rel?rel+'/'+n:n,s=fs.lstatSync(q);require(!s.isSymbolicLink(),'unexpected linked source '+q);if(s.isDirectory())walk(q,r);else{require(s.isFile(),'special source '+q);out[r]=fileIdentity(q);}}}walk(root,'');return out;}
function ownedSize(root,skipBrowser=false){let total=0;if(!fs.existsSync(root))return 0;function walk(p){let names;try{names=fs.readdirSync(p);}catch(e){if(e.code==='ENOENT')return;throw e;}for(const n of names){const q=path.join(p,n);if(skipBrowser&&q===BROWSER)continue;let st;try{st=fs.lstatSync(q);}catch(e){if(e.code==='ENOENT')continue;throw e;}if(st.isSymbolicLink())continue;if(st.isDirectory())walk(q);else if(st.isFile())total+=st.size;}}walk(root);return total;}
function ps(){const r=spawnSync('/bin/ps',['-axo','pid=,ppid=,command='],{encoding:'utf8',timeout:5000,maxBuffer:2*1024**2});require(r.status===0,'process observer failed');return r.stdout.split('\n').map(l=>{const m=l.trim().match(/^(\d+)\s+(\d+)\s+([\s\S]*)$/);return m?{pid:+m[1],ppid:+m[2],command:m[3]}:null;}).filter(Boolean);}
function trackProcesses(){const a=ps();if(chrome?.pid){watchPids.add(chrome.pid);let added=true;while(added){added=false;for(const p of a)if((watchPids.has(p.ppid)||(profile&&p.command.includes('--user-data-dir='+profile)))&&!watchPids.has(p.pid)){watchPids.add(p.pid);added=true;}}}return a;}
function resourceSnapshot(label){
 const code="import json,os,re,subprocess,datetime\ns=os.statvfs('/Users/me');r=subprocess.run(['/usr/bin/vm_stat'],capture_output=True,text=True,check=True,timeout=5);v=r.stdout\np=int(re.search(r'page size of (\\d+) bytes',v).group(1));parts={k:int(re.search(r'^'+re.escape(k)+r':\\s+(\\d+)',v,re.M).group(1)) for k in ('Pages free','Pages inactive','Pages speculative')}\nprint(json.dumps({'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'free_disk_bytes':s.f_bavail*s.f_frsize,'conservative_memory_bytes':sum(parts.values())*p,'page_bytes':p,'memory_pages':parts,'memory_basis':'free + inactive + speculative','vm_stat_stdout':v,'vm_stat_stderr':r.stderr,'vm_stat_exit':r.returncode}))";
 const r=spawnSync(PYTHON,['-I','-B','-c',code],{encoding:'utf8',timeout:7000,maxBuffer:65536});
 require(r.status===0,'capacity observer failed '+r.stderr);
 const g={label,...JSON.parse(r.stdout),receiver_bytes:ownedSize(ROOT,true),browser_bytes:ownedSize(BROWSER)};receipt.guards.push(g);
 require(g.free_disk_bytes>=MIN_DISK&&g.conservative_memory_bytes>=MIN_MEMORY&&g.receiver_bytes<=STATIC_CAP&&g.browser_bytes<=BROWSER_CAP,'resource guard refused '+label);return g;
}
function portAdmission(label){
 const code="import json,socket\ns=socket.socket();s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)\ntry:\n s.bind(('127.0.0.1',48661));print(json.dumps({'bind_only':True,'listen_created':False,'host':'127.0.0.1','port':48661}))\nfinally:s.close()";
 const r=spawnSync(PYTHON,['-I','-B','-c',code],{encoding:'utf8',timeout:5000,maxBuffer:65536});
 const a={label,pid:r.pid,exit:r.status,stdout:r.stdout,stderr:r.stderr};
 receipt.actions.push({action:'ordinary_bind_only_port_admission',...a});
 require(r.status===0&&!r.error,'fixed port unavailable '+label);
 return a;
}
function inventory(){return {installed:census(INSTALL),author_source:census(path.join(AUTHOR,'source')),author_originals:census(path.join(AUTHOR,'originals')),
 author_capsule:fileIdentity(path.join(AUTHOR,'ORIGINAL-CAPSULE.json')),author_contract:fileIdentity(path.join(AUTHOR,'RECEIVING-CONTRACT.md')),
 receiver_source:fileIdentity(fileURLToPath(import.meta.url)),comparator_source:fileIdentity(path.join(ROOT,'compare.py')),
 runtime:{node:fileIdentity(fs.realpathSync(process.execPath),256*1024**2),python:fileIdentity(fs.realpathSync(PYTHON)),chrome_entry:fileIdentity(fs.realpathSync(CHROME),256*1024**2)}};}
function abortActive(error){if(!boundaryError)boundaryError=error;if(connection)connection.fail(error);if(chrome&&chromeExit===null)chrome.kill('SIGTERM');if(server&&serverExit===null)server.kill('SIGTERM');}
function checkBoundary(){if(closing)return;if(boundaryError)throw boundaryError;if(intervalStart!==null)require(performance.now()-intervalStart<170000,'receiving interval limit');}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
class PipeCDP{
 constructor(child){this.id=0;this.pending=new Map();this.buffer='';this.child=child;
  child.stdio[4].setEncoding('utf8');child.stdio[4].on('data',chunk=>{this.buffer+=chunk;let at;while((at=this.buffer.indexOf('\0'))>=0){const line=this.buffer.slice(0,at);this.buffer=this.buffer.slice(at+1);if(!line)continue;let m;try{m=JSON.parse(line);}catch(e){this.fail(e);continue;}if(m.id){const p=this.pending.get(m.id);if(p){clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result??{});}}else observe(m);}});
  child.stdio[4].on('error',e=>this.fail(e));child.once('exit',()=>this.fail(new Error('owned Chrome pipe closed')));
 }
 fail(e){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(e);}this.pending.clear();}
 send(method,params={},sid=null,timeoutMs=10000){checkBoundary();return new Promise((resolve,reject)=>{const id=++this.id,timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('CDP timeout '+method));},timeoutMs);this.pending.set(id,{resolve,reject,timer});const m={id,method,params};if(sid)m.sessionId=sid;this.child.stdio[3].write(JSON.stringify(m)+'\0');});}
}
function observe(m){const o=receipt.observations,p=m.params||{},s=sessionNumber;
 if(m.method==='Runtime.exceptionThrown')o.exceptions.push({session:s,...p});
 if(m.method==='Runtime.consoleAPICalled')o.console.push({session:s,...p});
 if(m.method==='Log.entryAdded')o.log.push({session:s,...p.entry});
 if(m.method==='Network.requestWillBeSent')o.requests.push({session:s,requestId:p.requestId,url:p.request.url,method:p.request.method,type:p.type});
 if(m.method==='Network.responseReceived')o.responses.push({session:s,requestId:p.requestId,url:p.response.url,status:p.response.status,type:p.type});
 if(m.method==='Network.loadingFailed')o.loading_failed.push({session:s,...p});
 if(m.method==='Browser.downloadWillBegin'||m.method==='Browser.downloadProgress')o.downloads.push({session:s,method:m.method,observed_ms:Date.now(),...p});
}
async function evaluate(expression){const r=await connection.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},session);if(r.exceptionDetails)throw new Error('DOM observation exception '+JSON.stringify(r.exceptionDetails));return r.result?.value;}
async function waitFor(expression,timeoutMs=8000){const t=performance.now();while(performance.now()-t<timeoutMs){checkBoundary();const v=await evaluate(expression);if(v)return v;await pause(50);}throw new Error('DOM condition timeout '+expression);}
async function click(selector){
 const q=JSON.stringify(selector),b=await evaluate("(()=>{const e=document.querySelector("+q+");if(!e||e.disabled)throw Error('missing/disabled '+ "+q+");e.scrollIntoView({block:'center',inline:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return{x,y,visible:r.width>0&&r.height>0&&!!h&&(h===e||e.contains(h)),text:e.textContent};})()");
 require(b.visible,'not visible '+selector);
 for(const type of ['mouseMoved','mousePressed','mouseReleased'])await connection.send('Input.dispatchMouseEvent',{type,x:b.x,y:b.y,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})},session);
 receipt.actions.push({action:'trusted_mouse_click',selector,text:b.text,session:sessionNumber,at:new Date().toISOString()});
}
async function replaceNote(){
 await click('#pick-0-note');
 require(await evaluate("document.querySelector('#pick-0-note').value")===ORIGINAL_NOTE,'original note before edit');
 await connection.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:4,commands:['selectAll']},session);
 await connection.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:4},session);
 const selected=await evaluate("(()=>{const e=document.querySelector('#pick-0-note');return{start:e.selectionStart,end:e.selectionEnd,length:e.value.length,active:document.activeElement===e};})()");
 require(selected.active&&selected.start===0&&selected.end===selected.length,'trusted full note selection');
 await connection.send('Input.insertText',{text:NOTE},session);
 require(await evaluate("document.querySelector('#pick-0-note').value")===NOTE,'literal note input');
 receipt.actions.push({action:'browser_selectAll_and_Input.insertText',selector:'#pick-0-note',text:NOTE,session:sessionNumber,at:new Date().toISOString()});
}
async function screenshot(name){const r=await connection.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,fromSurface:true},session);const b=Buffer.from(r.data,'base64');require(b.length>1000&&b.length<400000,'screenshot cap');return writefile(name,b);}
async function recordDOM(label){
 const r=await evaluate("({url:location.href,title:document.title,recordHidden:document.querySelector('#record').hidden,sourceName:document.querySelector('#sourceName').textContent,sourceFacts:document.querySelector('#sourceFacts').textContent,summary:document.querySelector('#recordSummary').textContent,undoDisabled:document.querySelector('#undoChange').disabled,redoDisabled:document.querySelector('#redoChange').disabled,rows:Array.from(document.querySelectorAll('#visits .visit-card'),e=>({key:e.dataset.key,name:e.querySelector('h3').textContent,planned:e.querySelector('.planned').textContent,outcome:e.querySelector('[data-field=\"outcome\"]').value,date:e.querySelector('[data-field=\"date\"]').value,note:e.querySelector('[data-field=\"note\"]').value}))})");
 jsonfile(label+'.json',r);return r;
}
async function openPhysicalRecord(physicalPath,label){
 const identity=fileIdentity(physicalPath);
 await click('#openRecord');
 const doc=await connection.send('DOM.getDocument',{depth:0},session);
 const node=await connection.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#recordFile'},session);
 require(node.nodeId>0,'original file input');
 await connection.send('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[physicalPath]},session);
 receipt.actions.push({action:'native_physical_file_input',selector:'#recordFile',path:physicalPath,pin:identity,session:sessionNumber});
 await waitFor("!document.querySelector('#preview').hidden&&document.querySelector('#fileError').textContent===''");
 const preview=await evaluate("({summary:document.querySelector('#previewSummary').textContent,recordHidden:document.querySelector('#record').hidden,status:document.querySelector('#fileStatus').textContent})");
 require(preview.recordHidden&&preview.summary.includes(' original,week.json ')&&preview.summary.includes('3 original picks')&&preview.summary.includes('2024-02-26'),'preview before explicit admission');
 jsonfile(label+'-preview.json',preview);
 await click('#useRecord');await waitFor("!document.querySelector('#record').hidden&&document.querySelectorAll('#visits .visit-card').length===3");
 const dom=await recordDOM(label+'-admitted');
 require(dom.sourceName===' original,week.json '&&dom.rows.map(r=>r.key).join(',')==='pick-0,pick-1,pick-2','original distinct occurrence identity');
 require(dom.rows[0].name==='Café, "Same"'&&dom.rows[1].name==='Café, "Same"'&&dom.rows[2].name==='Third café','original names');
 require(dom.rows[1].planned==='Not scheduled in this saved week'&&dom.rows[2].outcome==='unrecorded'&&dom.rows[2].date==='','omitted/unrecorded original occurrence');
 return {preview,dom,physical_path:physicalPath,physical_identity:identity};
}

async function startSession(number){
 require(number===sessionNumber+1&&number<=2,'fixed two-session schedule');
 resourceSnapshot('before-session-'+number);portAdmission('before-session-'+number);
 if(intervalStart===null){
  intervalStart=performance.now();
  deadlineTimer=setTimeout(()=>abortActive(new Error('160-second stop threshold inside 180-second outer ceiling')),160000);
  growthTimer=setInterval(()=>{try{trackProcesses();if(ownedSize(ROOT,true)>STATIC_CAP||ownedSize(BROWSER)>BROWSER_CAP)abortActive(new Error('owned on-disk growth budget exceeded'));}catch(e){abortActive(e);}},500);
 }
 sessionNumber=number;closing=false;serverExit=null;serverReady=null;serverStdout='';serverStderr='';
 server=spawn(ENTRY,['--no-open'],{cwd:'/tmp',stdio:['ignore','pipe','pipe']});
 serverRecord={session:number,command:{executable:ENTRY,args:['--no-open'],cwd:'/tmp'},pid:server.pid,started_utc:new Date().toISOString()};
 server.stdout.on('data',b=>{serverStdout+=b.toString('utf8');if(serverStdout.length>262144)abortActive(new Error('server stdout budget'));for(const line of serverStdout.split('\n')){try{const v=JSON.parse(line);if(v.status==='serving')serverReady=v;}catch{}}});
 server.stderr.on('data',b=>{serverStderr+=b.toString('utf8');if(serverStderr.length>65536)abortActive(new Error('server stderr budget'));});
 server.on('error',e=>abortActive(e));
 server.on('exit',(code,signal)=>{serverExit={pid:server.pid,code,signal,at:new Date().toISOString()};});
 const start=performance.now();
 while(!serverReady&&performance.now()-start<6000){checkBoundary();require(serverExit===null,'installed server exited before readiness');await pause(30);}
 require(serverReady&&serverReady.pid===server.pid&&serverReady.origin===ORIGIN&&serverReady.no_open===true&&serverReady.verified_files===30&&serverReady.marker_sha256===CFG.installed_marker.sha256,'actual installed foreground readiness');
 serverRecord.ready=serverReady;
 resourceSnapshot('before-browser-'+number);
 profile=path.join(BROWSER,'profile-'+number);downloadDir=path.join(BROWSER,'downloads-'+number);
 require(!fs.existsSync(profile)&&!fs.existsSync(downloadDir),'exclusive session profile/download directories');
 fs.mkdirSync(profile,{recursive:true,mode:0o700});fs.mkdirSync(downloadDir,{recursive:true,mode:0o700});
 const args=['--headless=new','--remote-debugging-pipe','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check',
  '--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--disable-default-apps',
  '--metrics-recording-only','--password-store=basic','--use-mock-keychain','--disable-breakpad','--disable-crash-reporter',
  '--disk-cache-size=1048576','--media-cache-size=1048576','about:blank'];
 chromeExit=null;chromeStdout='';chromeStderr='';watchPids.clear();
 chrome=spawn(CHROME,args,{cwd:'/tmp',stdio:['ignore','pipe','pipe','pipe','pipe']});
 chromeRecord={session:number,command:{executable:CHROME,args,cwd:'/tmp',control:'existing private inherited CDP pipe; headless browser'},pid:chrome.pid,profile,downloads:downloadDir,started_utc:new Date().toISOString()};
 chrome.stdout.on('data',b=>{chromeStdout+=b.toString('utf8');if(chromeStdout.length>131072)abortActive(new Error('Chrome stdout budget'));});
 chrome.stderr.on('data',b=>{chromeStderr+=b.toString('utf8');if(chromeStderr.length>131072)abortActive(new Error('Chrome stderr budget'));});
 chrome.on('exit',(code,signal)=>{chromeExit={pid:chrome.pid,code,signal,at:new Date().toISOString()};});
 chrome.on('error',e=>abortActive(e));
 connection=new PipeCDP(chrome);watchPids.add(chrome.pid);
 chromeRecord.version=await connection.send('Browser.getVersion');
 require(chromeRecord.version.product===CFG.chrome_product,'original qualified Chrome product changed');
 await connection.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDir,eventsEnabled:true});
 const target=await connection.send('Target.createTarget',{url:'about:blank'});
 session=(await connection.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
 for(const method of ['Page.enable','Runtime.enable','Network.enable','Log.enable'])await connection.send(method,{},session);
 await connection.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false},session);
 await connection.send('Page.addScriptToEvaluateOnNewDocument',{source:"window.__estateReceivingEvents=[];for(const type of ['click','input','change'])document.addEventListener(type,e=>{const t=e.target;window.__estateReceivingEvents.push({type,isTrusted:e.isTrusted,id:t.id||null,value:t.matches?.('textarea')?t.value:null,fileCount:t.type==='file'?t.files.length:null});},true);"},session);
 await connection.send('Page.navigate',{url:ORIGIN},session);
 await waitFor("document.readyState==='complete'&&document.querySelector('#openVisitRecord')");
 require(await evaluate("location.href")===ORIGIN,'actual installed home URL');
}
async function closeSession(){
 if(!chrome&&!server)return;
 closing=true;
 if(chrome){
  chromeRecord.tracked_processes=trackProcesses().filter(p=>watchPids.has(p.pid));
  if(!chromeExit){try{await connection.send('Browser.close',{},null,1500);chromeRecord.close_requested=true;}catch(e){chromeRecord.close_request_note=String(e);}}
  for(let n=0;n<50&&!chromeExit;n++)await pause(40);
  if(!chromeExit){chromeRecord.owned_sigterm=true;chrome.kill('SIGTERM');for(let n=0;n<50&&!chromeExit;n++)await pause(40);}
  if(!chromeExit){chromeRecord.owned_sigkill=true;chrome.kill('SIGKILL');for(let n=0;n<50&&!chromeExit;n++)await pause(40);}
  let remaining=[];
  for(let n=0;n<25;n++){remaining=ps().filter(p=>watchPids.has(p.pid)||(profile&&p.command.includes('--user-data-dir='+profile)));if(!remaining.length)break;await pause(80);}
  chromeRecord.actual_exit=chromeExit;chromeRecord.remaining_owned_processes=remaining;
  chromeRecord.stdout=writefile('session-'+sessionNumber+'-chrome.stdout.txt',Buffer.from(chromeStdout));
  chromeRecord.stderr=writefile('session-'+sessionNumber+'-chrome.stderr.txt',Buffer.from(chromeStderr));
  receipt.browsers.push(chromeRecord);
  const ok=chromeExit!==null&&remaining.length===0;
  chrome=null;connection=null;session=null;
  require(ok,'owned Chrome process closure incomplete');
 }
 if(server){
  if(!serverExit){serverRecord.owned_sigterm=true;server.kill('SIGTERM');for(let n=0;n<65&&!serverExit;n++)await pause(40);}
  if(!serverExit){serverRecord.owned_sigkill=true;server.kill('SIGKILL');for(let n=0;n<40&&!serverExit;n++)await pause(40);}
  serverRecord.actual_exit=serverExit;
  serverRecord.stdout=writefile('session-'+sessionNumber+'-server.stdout.txt',Buffer.from(serverStdout));
  serverRecord.stderr=writefile('session-'+sessionNumber+'-server.stderr.txt',Buffer.from(serverStderr));
  serverRecord.closed_record=serverStdout.split('\n').map(l=>{try{return JSON.parse(l);}catch{return null;}}).find(r=>r?.status==='closed')||null;
  receipt.servers.push(serverRecord);
  const ok=serverExit!==null&&serverExit.code===0&&serverRecord.closed_record?.pid===serverRecord.pid;
  server=null;
  require(ok,'owned foreground server closure not confirmed');
  portAdmission('after-session-'+sessionNumber+'-closure');
 }
 closing=false;
}
async function physicalDownload(kind,selector){
 const startEvent=receipt.observations.downloads.length;
 const before_ms=Date.now();await click(selector);
 const start=performance.now();let begin=null,finished=null,physical=null;
 while(performance.now()-start<10000){
  checkBoundary();
  const events=receipt.observations.downloads.slice(startEvent).filter(x=>x.session===sessionNumber);
  begin=events.find(x=>x.method==='Browser.downloadWillBegin')||null;
  if(begin){
   finished=events.find(x=>x.method==='Browser.downloadProgress'&&x.guid===begin.guid&&x.state==='completed')||null;
   if(finished){physical=path.join(downloadDir,begin.suggestedFilename);if(fs.existsSync(physical)&&!fs.existsSync(physical+'.crdownload'))break;}
  }
  await pause(40);
 }
 require(begin&&finished&&physical&&fs.existsSync(physical),'actual complete physical '+kind+' download');
 const after_ms=Date.now(),identity=fileIdentity(physical);
 require(begin.suggestedFilename==='tastetable-visits-2024-02-26.'+(kind==='csv'?'csv':'json'),'original suggested export filename');
 require(identity.bytes>0&&identity.bytes===finished.totalBytes,'physical completed download length');
 const witness={kind,path:physical,pin:{bytes:identity.bytes,sha256:identity.sha256,git_blob:identity.git_blob},identity,before_ms,after_ms,begin,completed:finished,session:sessionNumber};
 receipt.downloads.push(witness);return witness;
}
function comparePhase(phase,downloads){
 jsonfile('downloads-'+phase+'.json',downloads);
 const start=performance.now(),args=['-I','-B',path.join(ROOT,'compare.py'),'--phase',phase];
 const r=spawnSync(PYTHON,args,{cwd:'/tmp',encoding:'utf8',timeout:8000,maxBuffer:262144});
 const call={phase,executable:PYTHON,args,cwd:'/tmp',pid:r.pid,exit:r.status,signal:r.signal,elapsed_seconds:(performance.now()-start)/1000,
  stdout:writefile('compare-'+phase+'.stdout.json',Buffer.from(r.stdout||'')),stderr:writefile('compare-'+phase+'.stderr.txt',Buffer.from(r.stderr||'')),error:r.error?String(r.error):null};
 receipt.comparators.push(call);
 require(r.status===0&&!r.error,'independent physical '+phase+' comparison failed');
 const result=JSON.parse(r.stdout);require(result.pass===true&&result.application_imports===0,'independent comparison result');
 return result;
}
async function collectInputWitness(label){
 const events=await evaluate('window.__estateReceivingEvents||[]');
 receipt.observations.input_events.push({session:sessionNumber,label,url:await evaluate('location.href'),events});
 return events;
}
async function main(){
 require(process.platform==='darwin'&&process.version===CFG.node_version,'qualified native Node version');
 require(path.resolve(ROOT)==='/Users/me/Developer/tastetable-visit-record-receiving-c945953fdeb7','exclusive receiver root');
 require(!fs.existsSync(OUTPUT)&&!fs.existsSync(BROWSER),'new receiving output/browser boundary');
 resourceSnapshot('before-receiver-output');
 fs.mkdirSync(OUTPUT,{mode:0o700});
 require(pin(fs.readFileSync(path.join(ROOT,'CONTRACT.md'))).git_blob===CONTRACT,'frozen original-only contract');
 require(samePin(pin(fs.readFileSync(fileURLToPath(import.meta.url))),CFG.receiver_source),'frozen receiving source');
 require(samePin(pin(fs.readFileSync(path.join(ROOT,'compare.py'))),CFG.comparator_source),'frozen independent comparator');
 const capsuleBytes=fs.readFileSync(path.join(ROOT,'ORIGINAL-CAPSULE.json'));
 require(samePin(pin(capsuleBytes),CFG.original_capsule),'original capsule byte identity');
 const capsule=JSON.parse(capsuleBytes),original=JSON.parse(capsule.files.find(f=>f.path==='reference/saved-record.json').content);
 before=inventory();jsonfile('identity-before.json',before);
 group='T1';
 require(samePin(before.installed['INSTALLATION.json'],CFG.installed_marker),'offered actual installed marker identity');
 const marker=JSON.parse(fs.readFileSync(path.join(INSTALL,'INSTALLATION.json')));
 require(marker.format==='tastetable.visit-record-local-installation.v1'&&marker.target===INSTALL&&marker.origin===ORIGIN&&marker.entry===path.basename(ENTRY),'installed marker scope');
 require(Object.keys(before.installed).sort().join('\n')===[...marker.files.map(f=>f.path),'INSTALLATION.json'].sort().join('\n'),'complete 30-file installed inventory');
 require(marker.files.length===29,'declared installed payload count');
 for(const item of marker.files){
  const p=before.installed[item.path];
  require(samePin(p,item)&&p.mode===item.mode&&p.mtime_ns===item.mtime_ns,'installed full identity '+item.path);
  require(BigInt(p.mtime_ns)<=BigInt(before.installed['INSTALLATION.json'].mtime_ns),'marker last relative to payload '+item.path);
 }
 for(const item of capsule.files){
  require(samePin(pin(Buffer.from(item.content)),item),'complete original capsule member '+item.path);
  require(samePin(before.installed['original/'+item.path],item)&&samePin(before.author_originals[item.path],item),'retained physical original '+item.path);
  if(!item.path.startsWith('reference/')&&item.path!=='static/visit-record.html')require(samePin(before.installed['app/'+item.path],item),'unchanged installed original asset '+item.path);
 }
 const old='<a href="/" class="back-link">TasteTable planner</a>',updated='<a href="/" class="back-link">Visit record home</a>';
 const originalHtml=capsule.files.find(f=>f.path==='static/visit-record.html').content;
 require(originalHtml.split(old).length===2&&!originalHtml.includes(updated),'exact original anchor cardinality');
 const derived=originalHtml.replace(old,updated),installedHtml=fs.readFileSync(path.join(INSTALL,'app/static/visit-record.html'),'utf8');
 require(installedHtml===derived&&installedHtml.replace(updated,old)===originalHtml,'whole-file sole navigation replacement and inverse');
 require(pin(Buffer.from(installedHtml)).sha256==='ab33e270a69dcba0cd19303dc1ea1ae47b61621fa64d3af3870e6ecb21e4bec1','declared derived HTML');
 for(const [name,p] of Object.entries(CFG.source_files))require(samePin(before.installed['source/'+name],p)&&samePin(before.author_source[name],p),'maintained installed/author source '+name);
 require(samePin(before.author_capsule,CFG.original_capsule)&&samePin(before.installed['original/ORIGINAL-CAPSULE.json'],CFG.original_capsule),'retained exact capsules');
 require(before.author_contract.git_blob===CONTRACT,'contract retained before installation');
 require(samePin(before.runtime.python,marker.runtime)&&samePin(before.runtime.python,CFG.python),'existing Python bytes');
 const expectedEntry='#!/bin/sh\nexec '+PYTHON+' -I -B '+path.join(INSTALL,'source/server.py')+' "$@"\n';
 require(fs.readFileSync(ENTRY,'utf8')===expectedEntry&&before.installed[path.basename(ENTRY)].mode==='0700','absolute installed shebang/entry');
 require(fs.readFileSync(path.join(INSTALL,'app/index.html')).equals(fs.readFileSync(path.join(INSTALL,'source/index.html'))),'new local home exact');
 receipt.groups.T1={pass:true,installed_files:30,original_members:11,unchanged_static_assets:7,license_exact:true,whole_navigation_inverse_exact:true,absolute_entry:ENTRY,candidate_or_original_application_imports:0};
 jsonfile('T1-source-installation.json',receipt.groups.T1);
 group='T2';await startSession(1);
 const home=await evaluate("({url:location.href,title:document.title,heading:document.querySelector('h1').textContent,href:document.querySelector('#openVisitRecord').href,text:document.querySelector('#openVisitRecord').textContent})");
 require(home.heading==='Visit record home'&&home.href===EDITOR&&home.text==='Open visit record','installed home link');
 receipt.home_screenshot=await screenshot('01-installed-home.png');
 await click('#openVisitRecord');await waitFor("document.readyState==='complete'&&document.querySelector('#openRecord')");
 const back=await evaluate("({url:location.href,text:document.querySelector('.back-link').textContent,href:document.querySelector('.back-link').href})");
 require(back.url===EDITOR&&back.text==='Visit record home'&&back.href===ORIGIN,'visible declared back-link');
 await click('.back-link');await waitFor("document.readyState==='complete'&&document.querySelector('#openVisitRecord')");
 require(await evaluate('location.href')===ORIGIN,'back-link actual home navigation');
 await click('#openVisitRecord');await waitFor("document.readyState==='complete'&&document.querySelector('#openRecord')");
 const admitted=await openPhysicalRecord(path.join(INSTALL,'original/reference/saved-record.json'),'original');
 require(admitted.dom.rows[0].note===ORIGINAL_NOTE&&admitted.dom.undoDisabled&&admitted.dom.redoDisabled,'original record/note and fresh history');
 receipt.groups.T2={pass:true,home,back,admission:admitted};jsonfile('T2-navigation-original-file.json',receipt.groups.T2);
 group='T3';await replaceNote();
 await click('#undoChange');require(await evaluate("document.querySelector('#pick-0-note').value")===ORIGINAL_NOTE,'one Undo restores original note');
 await click('#redoChange');require(await evaluate("document.querySelector('#pick-0-note').value")===NOTE,'one Redo restores fixed note');
 const edited=await recordDOM('edited-record');
 require(edited.rows[0].outcome==='went'&&edited.rows[0].date==='2024-03-01'&&edited.rows[1].outcome==='did_not_go'&&edited.rows[1].date==='2024-03-02','unchanged visible outcomes/dates');
 receipt.edited_screenshot=await screenshot('02-edited-record.png');
 receipt.groups.T3={pass:true,note:NOTE,undo_count:1,redo_count:1,edited};jsonfile('T3-fixed-note-history.json',receipt.groups.T3);
 group='T4';
 const firstJson=await physicalDownload('json','#saveRecord');
 const csv=await physicalDownload('csv','#downloadCsv');
 const initialComparison=comparePhase('initial',[firstJson,csv]);
 const inputs1=await collectInputWitness('after-initial-exports');
 require(inputs1.some(e=>e.id==='pick-0-note'&&e.type==='input'&&e.isTrusted&&e.value===NOTE),'actual trusted note input witness');
 for(const id of ['openRecord','useRecord','undoChange','redoChange','saveRecord','downloadCsv'])require(inputs1.some(e=>e.id===id&&e.type==='click'&&e.isTrusted),'actual trusted button witness '+id);
 receipt.groups.T4={pass:true,comparison:initialComparison,physical_download_count:2};jsonfile('T4-physical-exports.json',receipt.groups.T4);
 await closeSession();resourceSnapshot('between-closed-sessions');
 group='T5';await startSession(2);
 await click('#openVisitRecord');await waitFor("document.readyState==='complete'&&document.querySelector('#openRecord')");
 const recovered=await openPhysicalRecord(firstJson.path,'recovered');
 require(recovered.dom.rows[0].note===NOTE&&recovered.dom.undoDisabled&&recovered.dom.redoDisabled,'physical JSON recovery and empty new history');
 receipt.recovered_screenshot=await screenshot('03-recovered-record.png');
 const recoveredJson=await physicalDownload('recovered_json','#saveRecord');
 const recoveryComparison=comparePhase('recovery',[recoveredJson]);
 await collectInputWitness('after-recovered-export');
 await closeSession();
 require(receipt.servers.length===2&&receipt.browsers.length===2&&receipt.servers.every(x=>x.actual_exit?.code===0)&&receipt.browsers.every(x=>x.actual_exit?.code===0&&x.remaining_owned_processes.length===0),'both actual session closures');
 require(receipt.observations.exceptions.length===0,'unexpected browser exception');
 const foreign=receipt.observations.requests.filter(r=>r.url!=='about:blank'&&!r.url.startsWith(ORIGIN)&&!r.url.startsWith('blob:'+ORIGIN));
 require(foreign.length===0,'page requested an undeclared external resource');
 const unexpectedStatus=receipt.observations.responses.filter(r=>r.status>=400);
 require(unexpectedStatus.length===0,'unexpected page HTTP response');
 const unexpectedFailures=receipt.observations.loading_failed.filter(f=>{
  const req=receipt.observations.requests.find(r=>r.session===f.session&&r.requestId===f.requestId);
  return !(f.errorText==='net::ERR_ABORTED'&&req?.url.startsWith('blob:'+ORIGIN)&&receipt.observations.downloads.some(d=>d.method==='Browser.downloadWillBegin'&&d.url===req.url));
 });
 require(unexpectedFailures.length===0,'unexpected page load failure');
 const after=inventory();jsonfile('identity-after.json',after);
 require(JSON.stringify(after)===JSON.stringify(before),'installed/original/maintained source bytes, modes, mtimes or runtime changed');
 resourceSnapshot('after-both-session-closures');
 receipt.groups.T5={pass:true,recovered,comparison:recoveryComparison,installed_and_source_inventory_unchanged:true,actual_closed_sessions:2,candidate_or_original_application_imports:0};
 jsonfile('T5-recovery-and-closure.json',receipt.groups.T5);
 require(receipt.downloads.length===3,'fixed three-export schedule');
 require(performance.now()-intervalStart<180000,'actual total receiving interval');
 receipt.accepted=true;
}
let outerFailure=null;
try{await main();}
catch(e){outerFailure=e;receipt.failure={group,type:e.name,message:e.message,stack:e.stack};receipt.accepted=false;}
finally{
 try{await closeSession();}catch(e){receipt.closure_failure={type:e.name,message:e.message,stack:e.stack};receipt.accepted=false;}
 if(deadlineTimer)clearTimeout(deadlineTimer);if(growthTimer)clearInterval(growthTimer);
 if(boundaryError){receipt.boundary_failure={type:boundaryError.name,message:boundaryError.message};receipt.accepted=false;}
 if(fs.existsSync(OUTPUT)){
  if(before&&!fs.existsSync(path.join(OUTPUT,'identity-after.json'))){try{const after=inventory();jsonfile('identity-after.json',after);receipt.partial_after_inventory_unchanged=JSON.stringify(after)===JSON.stringify(before);}catch(e){receipt.after_inventory_error=String(e);}}
  receipt.total_seconds=(performance.now()-processStart)/1000;
  receipt.receiving_interval_seconds=intervalStart===null?null:(performance.now()-intervalStart)/1000;
  receipt.completed_utc=new Date().toISOString();receipt.receiver_pid=process.pid;
  receipt.receiver_exit_pending_until_outer_closure=true;
  receipt.owned_final={source_evidence_bytes:ownedSize(ROOT,true),browser_disk_bytes:ownedSize(BROWSER)};
  if(receipt.owned_final.source_evidence_bytes+Buffer.byteLength(JSON.stringify(receipt))*2>STATIC_CAP||receipt.owned_final.browser_disk_bytes>BROWSER_CAP){receipt.accepted=false;receipt.final_budget_failure=true;}
  jsonfile('RECEIPT.json',receipt);
 }
 console.log(JSON.stringify({accepted:receipt.accepted,groups:Object.fromEntries(Object.entries(receipt.groups).map(([k,v])=>[k,v.pass])),failure:receipt.failure,closure_failure:receipt.closure_failure??null,receiver_pid:process.pid,total_seconds:(performance.now()-processStart)/1000,receiving_interval_seconds:receipt.receiving_interval_seconds??null,source_evidence_bytes:ownedSize(ROOT,true),browser_disk_bytes:ownedSize(BROWSER)}));
}
process.exitCode=receipt.accepted?0:1;
