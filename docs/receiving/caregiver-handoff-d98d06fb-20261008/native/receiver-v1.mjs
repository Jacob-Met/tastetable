#!/usr/bin/env node
/** Editable caregiver handoff #55: real local app/file controls.
 * CDP infrastructure adapted from the maintained venue-note receiver at 328df51.
 * CDP helpers adapted from the maintained native-plan-week receiver (cf8447be).
 * Uses an unchanged, already-published native saved-week artifact. No fresh Python,
 * FastAPI, live Qloo, venue contact or deployment claim.
 */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {spawn} from "node:child_process";
import {createServer} from "node:http";
import {readFile,writeFile,mkdir,mkdtemp,rm,readdir,statfs} from "node:fs/promises";
import {freemem} from "node:os";
import {dirname,extname,join,resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
const args=process.argv.slice(2),opt=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const root=dirname(fileURLToPath(import.meta.url));
const project=resolve(opt("--project",join(root,"..")));
const output=resolve(opt("--output",join(process.cwd(),"caregiver-handoff-receiving")));
const executable=opt("--browser","google-chrome");
const hash=b=>createHash("sha256").update(b).digest("hex");
const disk=await statfs(root);
assert.ok(Number(disk.bavail)*Number(disk.bsize)>=768*1024**2&&freemem()>=1536*1024**2,"Native resource reserve");
await mkdir(output);const downloadPath=join(output,"downloads");await mkdir(downloadPath);
const profile=await mkdtemp(join(output,"profile-"));
const sourcePaths=["static/index.html","static/style.css","static/calendar.js","static/calendar.css","static/venue_followup.css","static/plan-request.js","tests/venue_followup.test.mjs","static/venue_followup.mjs","static/week_plan.mjs","static/week_file.mjs","static/app.js","static/venue_note_file.mjs","tests/venue_note_file.test.mjs","static/caregiver_handoff.mjs","tests/caregiver_handoff.test.mjs","tools/check_caregiver_handoff_browser.mjs"];
const weekFixture=resolve(opt('--week',join(project,'docs/venue-followup-6c20bb4b010e/author/final/saved-composition-week.json')));
const fixtureBytes=await readFile(weekFixture);
const fixtureBlob=createHash('sha1').update(Buffer.from('blob '+fixtureBytes.length+'\0')).update(fixtureBytes).digest('hex');
assert.equal(fixtureBlob,'8b14090030201d6e8d69cd5bca380a9a71a4da0d','Use the pinned original native week artifact');
const report={schema:"tastetable.caregiver-handoff-browser/1",status:"running",project,node:process.version,
 baseCommit:"328df51af830e91f304417a66d74f43d94ae0c02",
 input:{path:"fixtures/received-week.json",publishedPath:"docs/venue-followup-6c20bb4b010e/author/final/saved-composition-week.json",git_blob:"8b14090030201d6e8d69cd5bca380a9a71a4da0d",attribution:"Unchanged published native saved-week artifact; this invocation does not run its producer."},
 bootstrap:"Authored GET-only mock health/personas and exact project static files; no FastAPI or provider.",
 checks:[],artifacts:[],requests:[],externalRequests:[],serverRequests:[],sourceSha256:{},sourceUnchanged:false};
for(const name of sourcePaths)report.sourceSha256[name]=hash(await readFile(join(project,name)));
report.input.actualPath=weekFixture;report.input.sha256=hash(fixtureBytes);
const sourceBefore={...report.sourceSha256};
const downloads=new Map(),chooserEvents=[],pageErrors=[],pending=new Map();
let pageRequests=[],browser,socket,sessionId,browserLog="",sequence=0;
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const server=createServer(async(req,res)=>{try{
 const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
 report.serverRequests.push({method:req.method,path:pathname});
 if(req.method!=="GET"){res.writeHead(405).end();return;}
 if(pathname==="/api/health"||pathname==="/api/personas"){res.writeHead(200,{"Content-Type":"application/json"}).end(pathname==="/api/health"?'{"qloo_mode":"mock"}':"[]");return;}
 const relative=pathname==="/"?"static/index.html":pathname.slice(1);
 if(!relative.startsWith("static/")||!sourcePaths.includes(relative)){res.writeHead(404).end();return;}
 const body=await readFile(join(project,relative));
 const mime={".html":"text/html",".mjs":"text/javascript",".js":"text/javascript",".css":"text/css"}[extname(relative)];
 res.writeHead(200,{"Content-Type":mime+";charset=utf-8","Cache-Control":"no-store"}).end(body);
 }catch{res.writeHead(404).end();}});
await new Promise(done=>server.listen(0,"127.0.0.1",done));const base="http://127.0.0.1:"+server.address().port;
async function waitFor(check, label, attempts = 120) {
  let lastError;
  for (let step = 0; step < attempts; step++) {
    try { if (await check()) return; } catch (error) { lastError = error; }
    await sleep(100);
  }
  throw new Error('Timed out: ' + label + (lastError ? ' (' + lastError.message + ')' : ''));
}
function command(method, params = {}, scoped = true) {
  const id = ++sequence;
  return new Promise((resolve_, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id); reject(new Error('CDP timeout: ' + method));
    }, 15000);
    pending.set(id, {resolve: resolve_, reject, timer});
    socket.send(JSON.stringify({id, method, params, ...(scoped && sessionId ? {sessionId} : {})}));
  });
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description
    ?? result.exceptionDetails.text);
  return result.result.value;
}
async function key(key_, code, virtualKey, modifiers = 0) {
  for (const type of ['keyDown', 'keyUp']) {
    await command('Input.dispatchKeyEvent', {type, key: key_, code,
      windowsVirtualKeyCode: virtualKey, nativeVirtualKeyCode: virtualKey, modifiers,
      ...(key_ === 'Enter' && type === 'keyDown' ? {text: '\r', unmodifiedText: '\r'} : {})});
  }
}
async function activate(selector) {
  const exists = await evaluate('(() => { const node = document.querySelector(' +
    JSON.stringify(selector) + '); if (!node || node.matches(":disabled") || !node.getClientRects().length) return false; ' +
    'node.scrollIntoView({block:"center"}); node.focus(); return true; })()');
  assert.ok(exists, 'Available keyboard control: ' + selector);
  await key('Enter', 'Enter', 13);
}
async function click(selector) {
  const box = await evaluate('(() => { const node = document.querySelector(' +
    JSON.stringify(selector) + '); if (!node || node.matches(":disabled")) return null; ' +
    'node.scrollIntoView({block:"center"}); const b = node.getBoundingClientRect(); ' +
    'return {x:b.x+b.width/2,y:b.y+b.height/2,width:b.width,height:b.height}; })()');
  assert.ok(box && box.width > 0 && box.height > 0, 'Visible pointer control: ' + selector);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await command('Input.dispatchMouseEvent', {type, x: box.x, y: box.y,
      button: 'left', clickCount: 1});
  }
}
async function textInput(selector, value) {
  await evaluate('(() => {const node=document.querySelector(' + JSON.stringify(selector) +
    '); if(!node) throw new Error("Missing input"); node.scrollIntoView({block:"center"}); node.focus();})()');
  await key('a', 'KeyA', 65, 2);
  await command('Input.insertText', {text: value});
  assert.equal(await evaluate('document.querySelector(' + JSON.stringify(selector) + ').value'), value);
}
async function navigate(url, readySelector, width = 1280, height = 1000) {
  await command('Emulation.setEmulatedMedia', {media: ''});
  await command('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false});
  pageRequests = [];
  await command('Page.navigate', {url});
  await waitFor(() => evaluate('document.URL === ' + JSON.stringify(url) +
    ' && document.readyState === "complete" && !!document.querySelector(' +
    JSON.stringify(readySelector) + ')'), 'actual page ' + url);
}
async function saveArtifact(name, bytes, details = {}) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  assert.ok(buffer.length <= (name === 'oversized-handoff.json' ? 6 * 1024 * 1024 + 1 : 2 * 1024 * 1024), 'Bounded artifact: ' + name);
  await writeFile(join(output, name), buffer);
  const value = {name, bytes: buffer.length, sha256: hash(buffer), ...details};
  report.artifacts.push(value);
  return value;
}
async function screenshot(name, selector = null) {
  if (selector) await evaluate('document.querySelector(' + JSON.stringify(selector) +
    ').scrollIntoView({block:"start"})');
  const {data} = await command('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false});
  return saveArtifact(name, Buffer.from(data, 'base64'), {kind: 'actual Chrome screenshot'});
}
const passed = name => { report.checks.push(name); console.log('PASS ' + name); };

async function downloaded(button, name) {
  const prior = new Set(downloads.keys());
  await activate(button);
  let actual;
  await waitFor(() => {
    actual = [...downloads.values()].find(value => !prior.has(value.guid) && value.state === 'completed');
    return !!actual;
  }, 'actual download ' + name);
  const bytes = await readFile(join(downloadPath, actual.guid));
  await saveArtifact(name, bytes, {kind: 'actual browser download',
    suggestedFilename: actual.suggestedFilename});
  return {bytes, file: join(output, name), suggestedFilename: actual.suggestedFilename};
}
async function chooseFile(file, button = '#openWeek', inputSelector = '#weekFile') {
  const count = chooserEvents.length;
  await activate(button);
  await waitFor(() => chooserEvents.length > count, 'native saved-week file chooser');
  const event = chooserEvents.at(-1);
  assert.equal(event.mode, 'selectSingle');
  let identity = {backendNodeId: event.backendNodeId};
  if (!event.backendNodeId) {
    const {root} = await command('DOM.getDocument');
    const {nodeId} = await command('DOM.querySelector', {nodeId: root.nodeId, selector: inputSelector});
    identity = {nodeId};
  }
  const {node} = await command('DOM.describeNode', identity);
  const attributes = Object.fromEntries(Array.from({length: node.attributes.length / 2},
    (_, index) => node.attributes.slice(index * 2, index * 2 + 2)));
  assert.equal(attributes.id, inputSelector.slice(1));
  assert.equal(attributes.type, 'file');
  await command('DOM.setFileInputFiles', {files: file ? [file] : [], ...identity});
}

async function recordExisting(name, details = {}) {
  const bytes = await readFile(join(output, name));
  report.artifacts.push({name, bytes: bytes.length, sha256: hash(bytes), ...details});
  return bytes;
}

async function selectValue(selector, value) {
  const index = await evaluate('(() => {const s=document.querySelector('+JSON.stringify(selector)+');s.scrollIntoView({block:"center"});s.focus();return Array.from(s.options).findIndex(o=>o.value==='+JSON.stringify(value)+');})()');
  assert.ok(index>=0,"Available select value");
  await key("Home","Home",36);
  for(let n=0;n<index;n++)await key("ArrowDown","ArrowDown",40);
  await key("Tab","Tab",9);
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(selector)+').value'),value);
}
async function openWeek(file, count) {
  await chooseFile(file);
  await waitFor(()=>evaluate('!document.querySelector("#venueFollowup").hidden && document.querySelectorAll("[data-contact-key]").length==='+count),"selected week accepted");
}
async function openNotes(file) {
  await chooseFile(file,"[data-contact-file-open]","#venueNotesFile");
}
async function waitPreview() {
  await waitFor(()=>evaluate('!document.querySelector("[data-contact-file-preview]").hidden'),"notes replacement preview");
}
async function savedNotes(name) {
  const download=await downloaded("[data-contact-file-save]",name);
  return {...download,value:JSON.parse(download.bytes.toString("utf8"))};
}
async function holdNextNotes(filename) {
  await evaluate('(() => {const original=File.prototype.arrayBuffer;window.__venueHeld=null;File.prototype.arrayBuffer=function(){const actual=original.call(this);if(this.name!=='+JSON.stringify(filename)+')return actual;File.prototype.arrayBuffer=original;return actual.then(bytes=>new Promise(resolve=>{window.__venueHeld=()=>resolve(bytes);}));};})()');
}
async function releaseNotes() {
  await evaluate('window.__venueHeld();window.__venueHeld=null');
  await sleep(100);
}


async function openHandoff(file) {
  await chooseFile(file,"#openCaregiverHandoff","#caregiverHandoffFile");
}
async function handoffPreview() {
  await waitFor(()=>evaluate('!document.querySelector("[data-handoff-preview]").hidden'),"complete handoff preview");
}
async function savedHandoff(name) {
  const result=await downloaded("#saveCaregiverHandoff",name);
  return {...result,value:JSON.parse(result.bytes.toString("utf8"))};
}
async function uiState() {
  return evaluate('JSON.stringify({resultsHidden:document.querySelector("#results").hidden,results:document.querySelector("#results").innerHTML,inputs:Array.from(document.querySelectorAll("#form input")).map(n=>[n.name,n.type,n.value,n.checked]),values:Array.from(document.querySelectorAll("#results input,#results select,#results textarea")).map(n=>[n.id,n.dataset.pickKey,n.dataset.contactField,n.value])})');
}
function sameHandoff(actual, expected) {
  for(const key of ["receivedAt","calendarId","inputs","response","week"])assert.deepEqual(actual.week[key],expected.week[key]);
  assert.deepEqual(actual.venueNotes.origin,expected.venueNotes.origin);
  assert.deepEqual(actual.venueNotes.records,expected.venueNotes.records);
}
async function restoreHandoff(file) {
  await openHandoff(file);await handoffPreview();await activate("[data-handoff-apply]");
  await waitFor(()=>evaluate('document.querySelector("[data-handoff-status]").textContent.includes("Caregiver handoff opened.")'),"complete handoff accepted");
}
async function heldHandoff(file) {
  await holdNextNotes(file.split("/").at(-1));
  await openHandoff(file);
  await waitFor(()=>evaluate('typeof window.__venueHeld==="function"'),"authored pause after actual selected file read");
}

try {
  assert.ok(typeof WebSocket === 'function', 'Use Node 22 or newer with built-in WebSocket');
  browser = spawn(executable, [
    '--headless=new', '--disable-gpu',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    '--user-data-dir=' + profile, 'about:blank'
  ], {stdio: ['ignore', 'ignore', 'pipe']});
  let launchError;
  browser.on('error', error => { launchError = error; });
  browser.stderr.on('data', data => { browserLog = (browserLog + data).slice(-6000); });
  let port;
  let endpoint;
  await waitFor(async () => {
    if (launchError) throw launchError;
    if (browser.exitCode !== null) throw new Error('Browser exited: ' + browserLog);
    [port, endpoint] = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).trim().split('\n');
    return !!(port && endpoint);
  }, 'installed browser startup');
  socket = new WebSocket('ws://127.0.0.1:' + port + endpoint);
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    } else if (message.method === 'Browser.downloadWillBegin' ||
               message.method === 'Browser.downloadProgress') {
      const value = message.params;
      downloads.set(value.guid, {...downloads.get(value.guid), ...value});
    } else if (message.method === 'Page.fileChooserOpened') {
      chooserEvents.push(message.params);
    } else if (message.method === 'Runtime.exceptionThrown') {
      pageErrors.push(message.params.exceptionDetails.exception?.description
        ?? message.params.exceptionDetails.text);
    } else if (message.method === "Fetch.requestPaused") {
      const request = message.params.request;
      const allowed = request.method === "GET" && new URL(request.url).origin === base;
      if (!allowed) report.externalRequests.push({url: request.url, method: request.method});
      void command(allowed ? "Fetch.continueRequest" : "Fetch.failRequest", {
        requestId: message.params.requestId, ...(!allowed ? {errorReason: "BlockedByClient"} : {}),
      }).catch(error => pageErrors.push(error.message));
    } else if (message.method === 'Network.requestWillBeSent') {
      pageRequests.push(message.params.request.url);
      report.requests.push({url: message.params.request.url, method: message.params.request.method});
    }
  });
  await new Promise((resolve_, reject) => {
    socket.addEventListener('open', resolve_, {once: true});
    socket.addEventListener('error', reject, {once: true});
  });
  report.browser = await command('Browser.getVersion', {}, false);
  await command('Browser.setDownloadBehavior', {behavior: 'allowAndName', downloadPath, eventsEnabled: true}, false);
  const {targetId} = await command('Target.createTarget', {url: 'about:blank'}, false);
  ({sessionId} = await command('Target.attachToTarget', {targetId, flatten: true}, false));
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Network.enable');
  await command('Page.setInterceptFileChooserDialog', {enabled: true});

  await command("Fetch.enable", {patterns: [{urlPattern: "http*"}]});



  await navigate(base+"/","#openWeek");
  assert.equal(await evaluate('document.querySelector("#saveCaregiverHandoff").disabled'),true);
  await openWeek(weekFixture,4);
  const sourceWeek=JSON.parse(fixtureBytes.toString("utf8"));
  assert.equal(await evaluate('document.querySelector("[data-contact-file-save]").disabled'),false);
  const first='[data-contact-key="pick-0"]';
  const other='[data-contact-key="pick-2"]';
  const originalQuestion="\nWhich exact entrance and meal? 海\nPlease explain <literal>.";
  const revisedQuestion="Revised question: can the side entrance be used?\nKeep the original reply with its earlier questions.";
  const reply="\nVenue’s reported reply — café 🧭\n<img src=x onerror=\"window.__noteInjected=true\">\n  literal trailing space ";
  await activate(first+" .contact-question-editor summary");
  await textInput(first+' [data-contact-field="question"]',originalQuestion);
  await textInput(first+' [data-contact-field="reply"]',reply);
  await selectValue(first+' [data-contact-field="status"]',"reply_recorded");
  await textInput(first+' [data-contact-field="question"]',revisedQuestion);
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(first+' [data-contact-field="status"]')+').value'),"follow_up");
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(first+' [data-contact-reply-questions]')+').textContent'),originalQuestion);
  await textInput(other+' [data-contact-field="nextStep"]',"Original Friday follow-up 海");
  passed("real keyboard edits retain an earlier reply with its exact earlier questions and a distinct second visit note");

  await selectValue('#weekOrganizer select[data-pick-key="pick-0"]',"Sunday");
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(first+' [data-contact-field="reply"]')+').value'),"");
  const sundayReply="Separate Sunday answer — not the Thursday record.";
  await textInput(first+' [data-contact-field="reply"]',sundayReply);
  await selectValue('#weekOrganizer select[data-pick-key="pick-0"]',"");
  const notes=await savedNotes("saved-venue-notes.json");
  assert.equal(notes.value.records.length,3);
  const old=notes.value.records.find(row=>row.key==="pick-0"&&row.date==="2026-12-31");
  assert.equal(old.note.reply,reply);assert.equal(old.note.question,revisedQuestion);
  assert.equal(old.note.replyQuestions,originalQuestion);assert.equal(old.note.status,"follow_up");
  assert.equal(notes.value.records.find(row=>row.key==="pick-0"&&row.date==="2027-01-03").note.reply,sundayReply);
  const saved=await downloaded("#saveWeek","arranged-week.json");
  const arranged=JSON.parse(saved.bytes.toString("utf8"));
  assert.deepEqual(arranged.response,sourceWeek.response);assert.deepEqual(arranged.inputs,sourceWeek.inputs);
  assert.equal(arranged.week.assignments["pick-0"],null);
  assert.equal(Object.hasOwn(arranged,"venueNotes"),false);
  passed("actual notes and week downloads retain all three occurrence/date records separately from the unchanged saved-week format");


  const combined=await savedHandoff("saved-caregiver-handoff.json");
  assert.equal(combined.value.format,"tastetable.caregiver-handoff.v1");
  for(const key of ["receivedAt","calendarId","inputs","response","week"])assert.deepEqual(combined.value.week[key],arranged[key]);
  assert.deepEqual(combined.value.venueNotes.records,notes.value.records);
  assert.deepEqual(combined.value.venueNotes.origin,notes.value.origin);
  const calendarBefore=await downloaded("#calendarDownload","before-handoff.ics");
  passed("one physical caregiver-handoff download contains the exact arranged week and all three source-bound native note records");

  await textInput(other+' [data-contact-field="reply"]',"Current unsaved reply must survive review and refusal.");
  const beforeReview=await uiState();
  const literalName="handoff-<literal>-海.json";
  await saveArtifact(literalName,combined.bytes,{kind:"unchanged actual download copied under a literal filename"});
  await openHandoff(join(output,literalName));await handoffPreview();
  assert.equal(await uiState(),beforeReview);
  const description=await evaluate('document.querySelector("[data-handoff-description]").textContent');
  assert.ok(description.includes(literalName));
  assert.match(description,/3 recorded visit\/date notes: 1 match scheduled visits and 2 are for other dates or omitted visits/);
  await activate("[data-handoff-preview] details:nth-of-type(1) summary");
  await activate("[data-handoff-preview] details:nth-of-type(2) summary");
  const review=await evaluate('document.querySelector("[data-handoff-records]").textContent');
  assert.ok(review.includes(originalQuestion)&&review.includes(revisedQuestion)&&review.includes(reply)&&review.includes(sundayReply));
  assert.equal(await evaluate('!!document.querySelector("#caregiverHandoff literal")||window.__noteInjected===true'),false);
  await screenshot("desktop-handoff-review.png","[data-handoff-preview]");
  await activate("[data-handoff-cancel]");
  assert.equal(await uiState(),beforeReview);
  assert.equal(await evaluate('document.querySelector("[data-handoff-preview]").hidden'),true);
  const current=await savedHandoff("before-refusals-handoff.json");
  passed("actual chooser reviews literal filename, complete hidden-date records and earlier reply questions; explicit Cancel preserves the current week, inputs and notes");

  const invalidCases=[
    ["mismatched-source.json",value=>{value.venueNotes.origin.inputs.city="A different accepted source";},"different accepted plan"],
    ["malformed-week.json",value=>{value.week.response.comparison.grounded.picks="<img>";},"comparison counts"],
    ["late-invalid-note.json",value=>{value.venueNotes.records.push({...structuredClone(value.venueNotes.records[0]),date:"2026-02-30"});},"invalid date"],
    ["duplicate-note.json",value=>{value.venueNotes.records.push(structuredClone(value.venueNotes.records[0]));},"repeats a pick"],
    ["inconsistent-history.json",value=>{value.venueNotes.records[0].note.replyQuestions=null;},"question history"],
    ["unsupported-envelope.json",value=>{value.format="tastetable.caregiver-handoff.v2";},"supported v1"],
  ];
  for(const [name,mutate,message]of invalidCases){
    const value=structuredClone(combined.value);mutate(value);
    await saveArtifact(name,JSON.stringify(value,null,2)+"\n",{kind:"authored negative handoff input"});
    await openHandoff(join(output,name));
    await waitFor(()=>evaluate('document.querySelector("[data-handoff-status]").textContent.includes('+JSON.stringify(message)+')'),"whole handoff refusal "+name);
    assert.equal(await uiState(),beforeReview);
    assert.equal(await evaluate('document.querySelector("[data-handoff-preview]").hidden'),true);
  }
  await saveArtifact("invalid-utf8-handoff.json",Buffer.from([0xff,0xfe,0]),{kind:"authored invalid UTF-8 input"});
  await openHandoff(join(output,"invalid-utf8-handoff.json"));
  await waitFor(()=>evaluate('document.querySelector("[data-handoff-status]").textContent.includes("valid UTF-8")'),"fatal UTF-8 refusal");
  assert.equal(await uiState(),beforeReview);
  await saveArtifact("oversized-handoff.json",Buffer.alloc(6*1024*1024+1),{kind:"authored 6 MiB plus one zero-byte negative input"});
  await openHandoff(join(output,"oversized-handoff.json"));
  await waitFor(()=>evaluate('document.querySelector("[data-handoff-status]").textContent.includes("6 MiB")'),"physical oversized file refused before parsing");
  assert.equal(await uiState(),beforeReview);
  const afterRefusals=await savedHandoff("after-refusals-handoff.json");
  sameHandoff(afterRefusals.value,current.value);
  passed("eight actual file refusals preserve the whole current plan: source mismatch, malformed week, invalid/duplicate/history notes, unsupported version, invalid UTF-8 and 6 MiB plus one byte");

  await restoreHandoff(combined.file);
  const accepted=await savedHandoff("accepted-caregiver-handoff.json");
  sameHandoff(accepted.value,combined.value);
  assert.ok(await evaluate('document.querySelector("#savedWeekSource").textContent.includes("saved-caregiver-handoff.json")'));
  await navigate(base+"/?reopened=1","#openCaregiverHandoff");
  assert.equal(await evaluate('document.querySelector("#saveCaregiverHandoff").disabled'),true);
  assert.equal(await evaluate('document.querySelector("#results").hidden'),true);
  await openHandoff(combined.file);await handoffPreview();
  assert.equal(await evaluate('document.querySelector("#results").hidden'),true);
  await activate("[data-handoff-apply]");
  const reopened=await savedHandoff("reopened-caregiver-handoff.json");
  sameHandoff(reopened.value,combined.value);
  const calendarAfter=await downloaded("#calendarDownload","after-handoff.ics");
  assert.deepEqual(calendarAfter.bytes,calendarBefore.bytes);
  passed("explicit Replace and fresh-page opening restore complete week/notes atomically, with the original calendar export byte-for-byte");

  const empty=structuredClone(combined.value);empty.venueNotes.records=[];
  await saveArtifact("empty-caregiver-handoff.json",JSON.stringify(empty,null,2)+"\n",{kind:"authored explicit-empty-notes handoff"});
  const beforeEmpty=await uiState();
  await openHandoff(join(output,"empty-caregiver-handoff.json"));await handoffPreview();
  assert.match(await evaluate('document.querySelector("[data-handoff-status]").textContent'),/Replace will clear/);
  assert.equal(await uiState(),beforeEmpty);
  await activate("[data-handoff-apply]");
  const emptied=await savedHandoff("accepted-empty-handoff.json");
  assert.deepEqual(emptied.value.venueNotes.records,[]);
  assert.deepEqual(emptied.value.week.week,combined.value.week.week);
  await restoreHandoff(combined.file);
  passed("an empty note set is an explicit complete replacement, including hidden records, and remains reversible by reopening the saved handoff");

  await openHandoff(combined.file);await handoffPreview();
  const beforeChooserCancel=await uiState();
  await openHandoff(null);
  assert.equal(await evaluate('document.querySelector("[data-handoff-preview]").hidden'),true);
  assert.equal(await uiState(),beforeChooserCancel);
  await heldHandoff(combined.file);
  await activate("[data-handoff-cancel]");
  await releaseNotes();
  assert.equal(await evaluate('document.querySelector("[data-handoff-preview]").hidden'),true);
  assert.equal(await uiState(),beforeChooserCancel);
  passed("native chooser cancellation and Cancel opening retire pending replacement and an actual selected-file read held before admission");

  const second=structuredClone(combined.value);
  second.week.receivedAt="2026-10-08T19:00:00.000Z";
  second.week.calendarId="fedcba9876543210fedcba9876543210";
  second.week.inputs.city="Another original caregiver request";
  second.week.response.trace[0].args={authored:"distinct accepted source for concurrency receiving"};
  second.week.week.start="2027-02-01";
  second.venueNotes.origin=Object.fromEntries(["receivedAt","calendarId","inputs","response"].map(key=>[key,structuredClone(second.week[key])]));
  second.venueNotes.records=[];
  await saveArtifact("second-origin-handoff.json",JSON.stringify(second,null,2)+"\n",{kind:"authored valid distinct-origin handoff"});
  await saveArtifact("second-origin-week.json",JSON.stringify(second.week,null,2)+"\n",{kind:"authored native saved-week section for source-lifecycle receiving"});
  const secondFile=join(output,"second-origin-handoff.json");
  await heldHandoff(combined.file);
  await openHandoff(secondFile);await handoffPreview();
  await releaseNotes();
  assert.ok(await evaluate('document.querySelector("[data-handoff-description]").textContent.includes("second-origin-handoff.json")'));
  assert.equal(await evaluate('document.querySelector("#form").city.value'),combined.value.week.inputs.city);
  await activate("[data-handoff-apply]");
  const secondAccepted=await savedHandoff("accepted-second-origin.json");
  sameHandoff(secondAccepted.value,second);
  await restoreHandoff(combined.file);
  passed("two distinct accepted sources remain separate: a later file wins review, a stale earlier completion cannot replace it, and explicit Apply accepts exactly the reviewed origin");

  await openHandoff(secondFile);await handoffPreview();
  await textInput(other+' [data-contact-field="reply"]',"Later note edit after preview.");
  assert.equal(await evaluate('document.querySelector("[data-handoff-preview]").hidden'),true);
  await heldHandoff(secondFile);
  await textInput(other+' [data-contact-field="reply"]',"Later note edit while file is reading.");
  await releaseNotes();
  assert.equal(await evaluate('document.querySelector("[data-handoff-preview]").hidden'),true);
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(other+' [data-contact-field="reply"]')+').value'),"Later note edit while file is reading.");
  await openHandoff(secondFile);await handoffPreview();
  await selectValue('#weekOrganizer select[data-pick-key="pick-2"]',"Sunday");
  assert.equal(await evaluate('document.querySelector("[data-handoff-preview]").hidden'),true);
  await openHandoff(secondFile);await handoffPreview();
  await evaluate('(() => {const date=document.querySelector("#weekDate");date.value="";date.dispatchEvent(new Event("input",{bubbles:true}));})()');
  assert.equal(await evaluate('document.querySelector("[data-handoff-preview]").hidden'),true);
  assert.equal(await evaluate('document.querySelector("#saveCaregiverHandoff").disabled'),true);
  await evaluate('(() => {const date=document.querySelector("#weekDate");date.value="2026-12-28";date.dispatchEvent(new Event("input",{bubbles:true}));})()');
  await restoreHandoff(combined.file);
  passed("actual note edits and day selection, plus an authored native date-input event, invalidate previews or held reads and keep invalid-date saving unavailable");

  await heldHandoff(combined.file);
  await openWeek(join(output,"second-origin-week.json"),3);
  await releaseNotes();
  assert.equal(await evaluate('document.querySelector("[data-handoff-preview]").hidden'),true);
  assert.equal(await evaluate('document.querySelector("#form").city.value'),second.week.inputs.city);
  const afterSource=await savedHandoff("after-later-source.json");
  sameHandoff(afterSource.value,second);
  await openHandoff(combined.file);await handoffPreview();
  await textInput('#form input[name="city"]',"Later editable input");
  assert.equal(await evaluate('document.querySelector("[data-handoff-preview]").hidden'),true);
  assert.equal(await evaluate('document.querySelector("#results").hidden'),true);
  await restoreHandoff(combined.file);
  await heldHandoff(secondFile);
  await navigate(base+"/?reopened=2","#openCaregiverHandoff");
  assert.equal(await evaluate('document.querySelector("#results").hidden'),true);
  assert.equal(await evaluate('document.querySelector("[data-handoff-preview]").hidden'),true);
  await restoreHandoff(combined.file);
  passed("a later native saved-week acceptance or taste edit retires an older handoff, and actual page navigation discards a held read");

  await evaluate('(() => {const original=URL.createObjectURL;URL.createObjectURL=function(){URL.createObjectURL=original;throw new Error("authored one-shot download refusal");};})()');
  await activate("#saveCaregiverHandoff");
  await waitFor(()=>evaluate('document.querySelector("[data-handoff-status]").textContent.includes("authored one-shot")'),"download preparation refusal");
  assert.equal(await evaluate('document.querySelector("#saveCaregiverHandoff").disabled'),false);
  const retried=await savedHandoff("retried-caregiver-handoff.json");
  sameHandoff(retried.value,combined.value);
  passed("a download preparation failure leaves current data and the Save control usable for a physical retry");

  await command("Emulation.setDeviceMetricsOverride",{width:390,height:900,deviceScaleFactor:1,mobile:false});
  await openHandoff(join(output,literalName));await handoffPreview();
  await activate("[data-handoff-preview] details:nth-of-type(1) summary");
  await activate("[data-handoff-preview] details:nth-of-type(2) summary");
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth&&document.body.scrollWidth<=innerWidth'),"390px handoff review does not overflow");
  await screenshot("phone-handoff-review.png","[data-handoff-preview]");
  await activate("[data-handoff-cancel]");
  await selectValue('#weekOrganizer select[data-pick-key="pick-0"]',"Thursday");
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(first+' [data-contact-field="reply"]')+').value'),reply);
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(first+' [data-contact-reply-questions]')+').textContent'),originalQuestion);
  const callSheet=await downloaded("[data-contact-download]","reopened-call-sheet.txt");
  const indented=value=>value.split(/\r?\n/).map(line=>"  "+line).join("\n");
  assert.ok(callSheet.bytes.toString("utf8").includes(indented(reply))&&callSheet.bytes.toString("utf8").includes(indented(originalQuestion)));
  await command("Emulation.setEmulatedMedia",{media:"print"});
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#caregiverHandoff")).display'),"none");
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".contact-print-note")).display'),"block");
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".contact-edit")).display'),"none");
  const print=await command("Page.printToPDF",{printBackground:true,preferCSSPageSize:true});
  await saveArtifact("reopened-caregiver-week.pdf",Buffer.from(print.data,"base64"),{kind:"actual Chromium print projection"});
  await screenshot("print-worksheet.png","#venueFollowup");
  passed("390px keyboard review fits the page, and reopening retains exact earlier-question text in actual call-sheet and print outputs");

  assert.deepEqual(pageErrors,[]);assert.deepEqual(report.externalRequests,[]);
  assert.ok(report.serverRequests.every(r=>r.method==="GET"));
  assert.equal(await evaluate('localStorage.length+sessionStorage.length'),0);
  assert.equal(await evaluate('window.__noteInjected===true'),false);
  passed("complete receiving preserves exact source bytes, local GET-only traffic, empty automatic storage and literal text without page errors");
  report.status="passed";
} catch(error){report.status="failed";report.error=error.stack??String(error);report.browserLog=browserLog;
 if(sessionId){try{await screenshot("observed-state.png","#venueFollowup");}catch{}}
 console.error(report.error);process.exitCode=1;
} finally {
 if(socket?.readyState===WebSocket.OPEN){try{await command("Browser.close",{},false);}catch{}}
 socket?.close();for(const p of pending.values())clearTimeout(p.timer);
 if(browser&&browser.exitCode===null)browser.kill("SIGTERM");
 server.closeAllConnections();await new Promise(done=>server.close(done));await sleep(300);
 try{await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:150});}catch(error){report.profileCleanup=String(error);}
 const after={};for(const name of sourcePaths)after[name]=hash(await readFile(join(project,name)));
 report.sourceUnchanged=JSON.stringify(after)===JSON.stringify(sourceBefore) && hash(await readFile(weekFixture))===report.input.sha256;
 if(!report.sourceUnchanged){report.status="failed";process.exitCode=1;}
 report.pageErrors=pageErrors;report.nativeFileChooserEvents=chooserEvents.length;
 report.artifactBytes=report.artifacts.reduce((n,a)=>n+a.bytes,0);
 if(report.artifactBytes>8*1024**2){report.status="failed";report.limitExceeded=true;process.exitCode=1;}
 await writeFile(join(output,"browser-results.json"),JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({status:report.status,checks:report.checks.length,sourceUnchanged:report.sourceUnchanged,
 fileChoosers:report.nativeFileChooserEvents,artifacts:report.artifacts.length,output}));
}
