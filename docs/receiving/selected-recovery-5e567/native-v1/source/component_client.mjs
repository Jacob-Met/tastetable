// One isolated TasteTable143 component; the native owner admits the loopback
// endpoint, fresh profile, exact listener/process identities and complete lifetime.
// This client never parses native file identities or process FILETIME records.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const ROOT = String.raw`C:\Users\jacob\hamon-remote-receiving-5e5670099628-tastetable143-v1`;
const began = performance.now();
assert.equal(process.argv.length,5);
const endpoint = process.argv[2], budget = Number(process.argv[3]), readySHA = process.argv[4];
assert(Number.isInteger(budget) && budget>0 && budget<=180000);
const deadline = began + budget;
assert.match(endpoint,/^ws:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/devtools\/browser\/[A-Za-z0-9-]+$/);
assert(Number(new URL(endpoint).port)<=65535);
assert.match(readySHA,/^[0-9a-f]{64}$/);
assert.equal(process.version,'v24.14.0');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const originals = new Map();
function checkedFile(name,bytes,digest) {
  const file=path.join(ROOT,name), stat=fs.lstatSync(file);
  assert(stat.isFile() && !stat.isSymbolicLink()); assert.equal(stat.size,bytes);
  const raw=fs.readFileSync(file);
  assert.equal(raw.length,bytes); assert.equal(sha(raw),digest);
  originals.set(name,raw); return raw;
}
const READY_NAME='server/ready.json';
const readyStat=fs.lstatSync(path.join(ROOT,READY_NAME));
assert(readyStat.isFile() && !readyStat.isSymbolicLink() && readyStat.size>0 && readyStat.size<=16384);
const readyRaw=checkedFile(READY_NAME,readyStat.size,readySHA);
const ready=JSON.parse(readyRaw.toString('utf8'));
assert.deepEqual(Object.keys(ready).sort(),['manifest_sha256','pid','routes','schema','token','url']);
assert.equal(ready.schema,'tastetable143.component-server-ready/1');
assert.equal(ready.token,'hamon-taste143-component-v1-5e567');
assert(Number.isSafeInteger(ready.pid) && ready.pid>0);
const PAGE=ready.url;
assert.match(PAGE,/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/$/);
assert(Number(new URL(PAGE).port)<=65535);
assert.equal(ready.manifest_sha256,'13d4ce90a5a4dc13bd1ca441afb18baae15e19a5436fa49f8fbfbba464d2d06a');
const manifestRaw=checkedFile('component-fixture/component-freeze.json',2298,ready.manifest_sha256);
const manifest=JSON.parse(manifestRaw.toString('utf8'));
assert.equal(manifest.schema,'tastetable143.native-component-host-freeze/1');
const ASSETS = {
  '/': ['index.html','Document','text/html'],
  '/component-host.mjs': ['component-host.mjs','Script','text/javascript'],
  '/static/saved_week_collection_ui.mjs': ['static/saved_week_collection_ui.mjs','Script','text/javascript'],
  '/static/saved_week_store.mjs': ['static/saved_week_store.mjs','Script','text/javascript'],
  '/static/saved_week_collection.mjs': ['static/saved_week_collection.mjs','Script','text/javascript'],
  '/static/saved_weeks.mjs': ['static/saved_weeks.mjs','Script','text/javascript'],
  '/static/week_file.mjs': ['static/week_file.mjs','Script','text/javascript'],
  '/static/week_plan.mjs': ['static/week_plan.mjs','Script','text/javascript'],
  '/static/style.css': ['static/style.css','Stylesheet','text/css'],
  '/static/saved_weeks.css': ['static/saved_weeks.css','Stylesheet','text/css'],
  '/fixtures/initial-records.json': ['fixtures/initial-records.json','Fetch','application/json'],
  '/fixtures/external-addition.json': ['fixtures/external-addition.json','Fetch','application/json']
};
assert.deepEqual(Object.keys(manifest.files).sort(),Object.values(ASSETS).map(row=>row[0]).sort());
assert.deepEqual(ready.routes,[...Object.keys(ASSETS),'/index.html'].sort());
for(const [name,pin] of Object.entries(manifest.files)) checkedFile('component-fixture/'+name,pin.bytes,pin.sha256);
const FIXTURES={
  'initial-records.json':[32633,'aa29653a619579b13f0662f749fbaab90e89e814e69c01c2fd4c4037e21900ab'],
  'mixed-backup.json':[66480,'1d5809777396524a0b789c49429e3cf88f444eadb8665659aa30735e08c4aeb2'],
  'stale-backup.json':[16473,'b7dd5124f3539681fcf39c969b318131bfefb80ce4e60a73c1ef16da806db111'],
  'replacement-identical-backup.json':[16454,'424cdc8c3c278bd6d119133d648dfa38a16b9f911a0bf95766b69a3bf7ff03a5'],
  'external-addition.json':[16319,'2b89248cbdd58ae0bce2d9b4c1f4fe6b78cefeb3cbf4930061ba3c54eadb8090'],
  'expected-after-selected.json':[66282,'500900f9022dd89741ce5ff0b4b7e8147906c680db08e6322b22bb5a96bd0a9f'],
  'expected-after-stale-refusal.json':[82620,'174cfec2013ad7c9de1c4a95f7cb2597b7bf498d12f51de7a04cf94b5d479fb8']
};
for(const [name,[bytes,digest]] of Object.entries(FIXTURES)) checkedFile('fixtures/'+name,bytes,digest);
checkedFile('component_course.mjs',18698,'872a84c3fcc584f50e2961e80a7683e4cb738ea5cd63bbe49326c90b8350de8a');
// The admitted module only declares the fixed course; it has no launcher.
const {runComponentCourse}=await import(pathToFileURL(path.join(ROOT,'component_course.mjs')).href);
assert.equal(typeof runComponentCourse,'function');
const receipt={
  schema:'hamon.tastetable143.node-course/1',outcome:'FAIL',started_utc:new Date().toISOString(),
  endpoint,page:PAGE,ready,ready_sha256:readySHA,
  node:{version:process.version,executable:process.execPath},
  before:Object.fromEntries([...originals].map(([name,raw])=>[name,{bytes:raw.length,sha256:sha(raw)}])),
  protocol_events:[],requests:[],responses:[],completions:[],response_bodies:[],favicon:[],close:null,error:null,
  network_policy:'Exactly twelve fixed HTTP asset URLs, one GET each with admitted resource type, status200, no redirects/request body/cache/service worker. One optional empty literal data:, favicon. Every actual page request is checked; this is an observed allowlist plus the fixed server/CSP, not an external network firewall.',
  boundary:'One real component UI/store course only. Transport/file assignment is CDP; operating-system chooser, full app/provider/caregiver workflow are unassessed.'
};
const allowedURLs=new Map(Object.entries(ASSETS).map(([route,values])=>[new URL(route,PAGE).href,values]));
const requestRows=new Map(),requestedURLs=new Set();
let faviconRequest=null;

const transcript = fs.openSync(path.join(ROOT, 'cdp-transcript.ndjson'), 'wx');
let transcriptBytes = 0, messageBytes = 0, eventCount = 0;
let ws = null, pending = null, nextId = 1, fatal = null, closing = false, closed = false;
let session = null, navigationIssued = false, selectedTarget = null;
const socketListeners = new AbortController();
let resolveClosed;
const closedSignal = new Promise(resolve => { resolveClosed = resolve; });
const requestsSeen = new Set();
function record(direction, value) {
  const row = JSON.stringify({elapsed_ms: performance.now() - began, direction, value}) + '\n';
  transcriptBytes += Buffer.byteLength(row);
  if (transcriptBytes > 64 * 1024 * 1024) throw new Error('Transcript bound exceeded');
  fs.writeSync(transcript, row);
}
function timeLeft(cap = 15000) {
  if (fatal) throw fatal;
  const value = Math.min(cap, Math.floor(deadline - performance.now()));
  if (value <= 0) throw new Error('Whole browser course deadline');
  return value;
}
function fail(error) {
  if (!fatal) fatal = error instanceof Error ? error : new Error(String(error));
  if (pending) { const p = pending; pending = null; clearTimeout(p.timer); p.reject(fatal); }
}
function checkEvent(message) {
  eventCount += 1;
  if(eventCount>2000) throw new Error('CDP event count bound');
  if(message.sessionId && message.sessionId!==session) throw new Error('Foreign CDP session');
  const method=message.method, params=message.params??{};
  if(['Inspector.targetCrashed','Target.targetCrashed','Page.javascriptDialogOpening',
      'Page.windowOpen','Page.downloadWillBegin','Browser.downloadWillBegin','Page.frameAttached',
      'Runtime.exceptionThrown'].includes(method)) throw new Error('Unexpected event: '+method);
  if(method==='Page.frameDetached' && !closing) throw new Error('Unexpected detached frame');
  if(method==='Page.frameNavigated') {
    assert(navigationIssued); assert.equal(params.frame.url,PAGE);
    assert.equal(params.frame.parentId,undefined);
    receipt.protocol_events.push({method,params});
  }
  if(method==='Page.navigatedWithinDocument') throw new Error('Unexpected same-document navigation');
  if(method==='Network.requestWillBeSent') {
    assert(navigationIssued);
    assert(typeof params.requestId==='string' && !requestsSeen.has(params.requestId));
    assert.equal(params.request.method,'GET');
    assert.equal(params.redirectResponse,undefined);
    assert.equal(params.request.postData,undefined);
    assert(!params.request.hasPostData);
    assert(!params.request.postDataEntries || params.request.postDataEntries.length===0);
    assert(typeof params.frameId==='string' && params.frameId.length>0);
    const url=params.request.url, asset=allowedURLs.get(url);
    if(asset) {
      assert(!requestedURLs.has(url),'Repeated HTTP asset request: '+url);
      assert.equal(params.type,asset[1]);
      assert.equal(params.documentURL,PAGE);
      requestedURLs.add(url);
    } else {
      assert.equal(url,'data:,'); assert.equal(faviconRequest,null);
      assert(['Image','Other'].includes(params.type));
      faviconRequest=params.requestId;
      receipt.favicon.push({phase:'request',params});
    }
    requestsSeen.add(params.requestId);
    const row={request_id:params.requestId,url,method:params.request.method,type:params.type,
      frame_id:params.frameId,loader_id:params.loaderId,params,response:null,completion:null};
    requestRows.set(params.requestId,row); receipt.requests.push(row);
  }
  if(method==='Network.responseReceived') {
    const row=requestRows.get(params.requestId);
    assert(row && !row.response); assert.equal(params.response.url,row.url);
    assert.equal(params.type,row.type); assert.equal(params.response.status,200);
    assert(!params.response.fromDiskCache && !params.response.fromServiceWorker && !params.response.fromPrefetchCache);
    if(row.url!=='data:,') {
      const asset=allowedURLs.get(row.url);
      assert.equal(params.response.mimeType,asset[2]);
      assert.equal(params.response.remoteIPAddress,'127.0.0.1');
      assert.equal(params.response.remotePort,Number(new URL(PAGE).port));
    } else receipt.favicon.push({phase:'response',params});
    row.response=params; receipt.responses.push(params);
  }
  if(method==='Network.loadingFinished') {
    const row=requestRows.get(params.requestId);
    assert(row && row.response && !row.completion);
    assert(Number.isFinite(params.encodedDataLength) && params.encodedDataLength>=0);
    row.completion=params; receipt.completions.push(params);
    if(row.url==='data:,') receipt.favicon.push({phase:'completion',params});
  }
  if(method==='Network.requestServedFromCache') throw new Error('Unexpected cached request');
  if(method==='Network.loadingFailed') throw new Error('Page request failed: '+JSON.stringify(params));
  if(method.startsWith('Network.webSocket') || method.startsWith('Network.webTransport') ||
      method.startsWith('Network.directTCP') || method.startsWith('Network.directUDP') ||
      method==='Network.eventSourceMessageReceived') throw new Error('Unexpected page transport event');
}
async function connect() {
  ws = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { fail(new Error('WebSocket open deadline')); reject(fatal); },
      timeLeft());
    ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, {once: true, signal: socketListeners.signal});
    ws.addEventListener('error', () => {
      clearTimeout(timer); fail(new Error('Owned WebSocket error')); reject(fatal);
    }, {once: true, signal: socketListeners.signal});
    ws.addEventListener('message', event => {
      try {
        if (typeof event.data !== 'string') throw new Error('Non-text CDP message');
        const size = Buffer.byteLength(event.data);
        messageBytes += size;
        if (size > 12 * 1024 * 1024 || messageBytes > 60 * 1024 * 1024)
          throw new Error('CDP message byte bound');
        const message = JSON.parse(event.data);
        record('receive', message);
        if (Object.hasOwn(message, 'id')) {
          if (!pending || message.id !== pending.id ||
              (message.sessionId ?? null) !== pending.session)
            throw new Error('Unmatched or duplicated CDP response');
          const p = pending; pending = null; clearTimeout(p.timer);
          if (message.error) p.reject(new Error('CDP error: ' + JSON.stringify(message.error)));
          else p.resolve(message.result ?? {});
        } else {
          if (typeof message.method !== 'string') throw new Error('Invalid CDP event');
          checkEvent(message);
        }
      } catch (error) { fail(error); }
    }, {signal: socketListeners.signal});
    ws.addEventListener('close', event => {
      closed = true;
      try { record('socket-close', {code: event.code, reason: event.reason, clean: event.wasClean}); }
      catch(error) { fail(error); }
      if (closing && pending?.method === 'Browser.close') {
        const p = pending; pending = null; clearTimeout(p.timer);
        p.resolve({connection_closed_before_ack: true, code: event.code});
      } else if (!closing) fail(new Error('Unexpected owned WebSocket closure'));
      resolveClosed();
    }, {signal: socketListeners.signal});
  });
}
async function call(method, params = {}, targetSession = session) {
  timeLeft();
  assert(!pending); assert.equal(ws.readyState, WebSocket.OPEN);
  const id = nextId++;
  assert(id <= 500);
  const message = {id, method, params};
  if (targetSession) message.sessionId = targetSession;
  record('send', message);
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => fail(new Error('CDP response deadline: ' + method)), timeLeft());
    pending = {id, method, session: targetSession, resolve, reject, timer};
    try { ws.send(JSON.stringify(message)); }
    catch (error) { fail(error); }
  });
}
async function evaluate(expression, awaitPromise = false) {
  const result = await call('Runtime.evaluate', {expression, returnByValue: true,
    awaitPromise, userGesture: false, timeout: timeLeft()});
  assert.equal(result.exceptionDetails, undefined);
  assert.equal(result.result.type, 'object');
  assert(Object.hasOwn(result.result, 'value'));
  return result.result.value;
}
async function settle() {
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve({settled:true}))))', true);
}

function admitPageInventory(infos, expectedURL, expectedAttached, initial = null) {
  assert(Array.isArray(infos) && infos.length >= 1 && infos.length <= 64);
  const ids = new Set();
  for (const item of infos) {
    assert(item && typeof item === 'object' && !Array.isArray(item));
    assert.equal(Object.getPrototypeOf(item), Object.prototype);
    for (const key of ['targetId','browserContextId'])
      assert(typeof item[key] === 'string' && item[key].length > 0 && item[key].length <= 128);
    assert(typeof item.title === 'string' && item.title.length <= 4096);
    assert(typeof item.url === 'string' && item.url.length > 0 && item.url.length <= 4096);
    assert(!ids.has(item.targetId)); ids.add(item.targetId);
    assert(['page','service_worker','background_page'].includes(item.type));
    assert.equal(item.canAccessOpener, false);
    for (const key of ['openerId','openerFrameId','parentId','parentFrameId','subtype'])
      assert(!Object.hasOwn(item, key));
  }
  const pages = infos.filter(item => item.type === 'page');
  assert.equal(pages.length, 1);
  const page = pages[0];
  assert.equal(page.url, expectedURL); assert.equal(page.attached, expectedAttached);
  for (const item of infos) {
    assert.equal(item.browserContextId, page.browserContextId);
    if (item.type === 'page') continue;
    assert.equal(item.attached, false);
    assert(item.url.startsWith('chrome-extension://'));
    const url = new URL(item.url);
    assert.equal(url.protocol, 'chrome-extension:'); assert(url.hostname.length > 0);
    assert.equal(url.username, ''); assert.equal(url.password, ''); assert.equal(url.port, '');
  }
  if (initial !== null) {
    const first = initial.find(item => item.type === 'page');
    assert.equal(page.targetId, first.targetId);
    assert.equal(page.browserContextId, first.browserContextId);
    const projection = list => list.filter(item => item.type !== 'page')
      .map(item => [item.targetId,item.type,item.url,item.browserContextId,item.attached,item.canAccessOpener])
      .sort((a,b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
    assert.deepEqual(projection(infos), projection(initial));
  }
  return page;
}

async function waitForDocument() {
  for(let attempt=0;attempt<60;attempt++) {
    const state=await evaluate('({location:location.href,ready:document.readyState})');
    receipt.protocol_events.push({method:'controller.document-readiness',params:state});
    assert(state.location==='about:blank' || state.location===PAGE);
    if(state.location===PAGE && state.ready==='complete') return;
    await new Promise(resolve=>setTimeout(resolve,Math.min(100,timeLeft())));
  }
  throw new Error('Fixed component document readiness deadline');
}
async function joinNetworkBodies(frameID) {
  for(let attempt=0;attempt<40;attempt++) {
    timeLeft();
    if(requestedURLs.size===12 && [...requestRows.values()].every(row=>row.completion)) break;
    assert(attempt<39,'Exact twelve HTTP assets did not complete');
    await new Promise(resolve=>setTimeout(resolve,Math.min(100,timeLeft())));
  }
  assert.deepEqual([...requestedURLs].sort(),[...allowedURLs.keys()].sort());
  assert.equal(receipt.requests.length,12+(faviconRequest===null?0:1));
  assert.equal(receipt.responses.length,receipt.requests.length);
  assert.equal(receipt.completions.length,receipt.requests.length);
  for(const row of requestRows.values()) {
    assert.equal(row.frame_id,frameID); assert(row.response && row.completion);
    const result=await call('Network.getResponseBody',{requestId:row.request_id});
    assert.equal(typeof result.body,'string'); assert.equal(typeof result.base64Encoded,'boolean');
    if(result.base64Encoded) assert.match(result.body,/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
    const raw=Buffer.from(result.body,result.base64Encoded?'base64':'utf8');
    if(row.url==='data:,') assert.equal(raw.length,0);
    else {
      const name=allowedURLs.get(row.url)[0];
      assert(raw.equals(originals.get('component-fixture/'+name)),'HTTP body differs: '+name);
    }
    receipt.response_bodies.push({request_id:row.request_id,url:row.url,bytes:raw.length,
      sha256:sha(raw),base64Encoded:result.base64Encoded});
  }
}
try {
  await connect();
  receipt.browser_version=await call('Browser.getVersion',{},null);
  const targets=await call('Target.getTargets',{},null);
  receipt.initial_targets=targets;
  selectedTarget=admitPageInventory(targets.targetInfos,'about:blank',false);
  receipt.initial_target=selectedTarget;
  const attached=await call('Target.attachToTarget',{targetId:selectedTarget.targetId,flatten:true},null);
  assert.equal(typeof attached.sessionId,'string'); assert(attached.sessionId.length>0);
  session=attached.sessionId; receipt.session_id=session;
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Network.enable',{maxTotalBufferSize:4*1024*1024,maxResourceBufferSize:1024*1024});
  await call('Network.setCacheDisabled',{cacheDisabled:true});
  await call('Network.setBypassServiceWorker',{bypass:true});
  // Exact HTTP admission is also checked per event; the server's unchanged
  // CSP allows only its own origin and its route map refuses unknown paths.
  await call('Network.setBlockedURLs',{urls:['https://*','ws://*','wss://*','ftp://*','file://*']});
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:960,deviceScaleFactor:1,mobile:false});
  navigationIssued=true;
  const navigated=await call('Page.navigate',{url:PAGE});
  assert.equal(navigated.errorText,undefined);
  assert(navigated.isDownload===undefined || navigated.isDownload===false);
  assert(typeof navigated.frameId==='string' && navigated.frameId.length>0);
  receipt.navigation=navigated;
  await waitForDocument();
  await settle();
  await runComponentCourse({root:ROOT,page:PAGE,call,evaluate,settle,timeLeft,receipt});
  assert.equal(receipt.component.outcome,'PASS');
  assert.equal(receipt.component.fixturesUnchanged,true);
  assert.equal(receipt.component.captures.length,2);
  assert.equal(receipt.component.actions.filter(row=>row.kind==='real-file-input').length,4);
  await joinNetworkBodies(navigated.frameId);
  const frames=await call('Page.getFrameTree');
  receipt.final_frames=frames;
  assert.equal(frames.frameTree.frame.id,navigated.frameId);
  assert.equal(frames.frameTree.frame.url,PAGE);
  assert(!frames.frameTree.childFrames || frames.frameTree.childFrames.length===0);
  const finalTargets=await call('Target.getTargets',{},null);
  receipt.final_targets=finalTargets;
  receipt.final_target=admitPageInventory(finalTargets.targetInfos,PAGE,true,receipt.initial_targets.targetInfos);
  const navigations=receipt.protocol_events.filter(row=>row.method==='Page.frameNavigated');
  assert.equal(navigations.length,1); assert.equal(navigations[0].params.frame.id,navigated.frameId);
  timeLeft(); receipt.outcome='PASS';
} catch(error) {
  receipt.error={name:error.name,message:error.message,stack:error.stack};
  receipt.outcome='FAIL';
} finally {
  // Normal Browser.close is only sent through this retained admitted connection.
  try {
    if(ws?.readyState===WebSocket.OPEN && !pending && !fatal) {
      closing=true;
      receipt.close={requested_utc:new Date().toISOString(),result:await call('Browser.close',{},null)};
    } else receipt.close={requested:false,reason:'Connection unavailable or failed; native owner must preserve failure and perform owned cleanup.'};
  } catch(error) { receipt.close={error:String(error)}; receipt.outcome='FAIL'; }
  if(ws && !closed) {
    try {
      ws.close();
      const remaining=Math.max(0,Math.min(5000,Math.floor(deadline-performance.now())));
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('WebSocket terminal-close deadline')),remaining);
        closedSignal.then(()=>{clearTimeout(timer);resolve();});
      });
    } catch(error) { fail(error); receipt.outcome='FAIL'; }
  }
  receipt.socket_terminal_observed=closed;
  if(ws && !closed) receipt.outcome='FAIL';
  socketListeners.abort();
  receipt.inputs_unchanged=true; receipt.after={};
  for(const [name,raw] of originals) {
    try {
      const after=fs.readFileSync(path.join(ROOT,name));
      receipt.after[name]={bytes:after.length,sha256:sha(after)};
      assert(after.equals(raw),'Input changed: '+name);
    } catch(error) {
      receipt.inputs_unchanged=false; receipt.outcome='FAIL';
      (receipt.input_errors??=[]).push({name,error:String(error)});
    }
  }
  if(fatal) { receipt.protocol_error=String(fatal); receipt.outcome='FAIL'; }
  receipt.elapsed_ms=performance.now()-began; receipt.finished_utc=new Date().toISOString();
  receipt.transcript_bytes=transcriptBytes; receipt.message_bytes=messageBytes;
  receipt.event_count=eventCount; receipt.commands=nextId-1;
  fs.closeSync(transcript);
  let raw=Buffer.from(JSON.stringify(receipt,null,2)+'\n');
  if(raw.length>32*1024*1024) {
    raw=Buffer.from(JSON.stringify({schema:receipt.schema,outcome:'FAIL',
      error:{name:'ReceiptBoundError',message:'Complete receipt exceeds 32MiB; structured course omitted, original CDP transcript retained.'},
      complete_receipt_bytes:raw.length,transcript_bytes:transcriptBytes,message_bytes:messageBytes,
      close:receipt.close,socket_terminal_observed:closed,inputs_unchanged:receipt.inputs_unchanged},null,2)+'\n');
    receipt.outcome='FAIL';
  }
  fs.writeFileSync(path.join(ROOT,'node-receipt.json'),raw,{flag:'wx'});
  process.stdout.write(raw);
  process.exitCode=receipt.outcome==='PASS'?0:1;
}
