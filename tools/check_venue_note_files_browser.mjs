#!/usr/bin/env node
/** TasteTable venue-note continuation: real local app/file controls.
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
const output=resolve(opt("--output",join(process.cwd(),"venue-notes-receiving")));
const executable=opt("--browser","google-chrome");
const hash=b=>createHash("sha256").update(b).digest("hex");
const disk=await statfs(root);
assert.ok(Number(disk.bavail)*Number(disk.bsize)>=768*1024**2&&freemem()>=1536*1024**2,"Native resource reserve");
await mkdir(output);const downloadPath=join(output,"downloads");await mkdir(downloadPath);
const profile=await mkdtemp(join(output,"profile-"));
const sourcePaths=["static/index.html","static/style.css","static/calendar.js","static/calendar.css","static/venue_followup.css","static/plan-request.js","tests/venue_followup.test.mjs","static/venue_followup.mjs","static/week_plan.mjs","static/week_file.mjs","static/app.js","static/venue_note_file.mjs","tests/venue_note_file.test.mjs"];
const weekFixture=resolve(opt('--week',join(project,'docs/venue-followup-6c20bb4b010e/author/final/saved-composition-week.json')));
const fixtureBytes=await readFile(weekFixture);
const fixtureBlob=createHash('sha1').update(Buffer.from('blob '+fixtureBytes.length+'\0')).update(fixtureBytes).digest('hex');
assert.equal(fixtureBlob,'8b14090030201d6e8d69cd5bca380a9a71a4da0d','Use the pinned original native week artifact');
const report={schema:"tastetable.venue-notes-browser/1",status:"running",project,node:process.version,
 baseCommit:"2b347cee4ff4e2b806362730a8520a3360b45f5a",
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
  assert.ok(buffer.length <= 2 * 1024 * 1024, 'Bounded artifact: ' + name);
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

  await navigate(base+"/","#openWeek");
  await openWeek(saved.file,3);
  const keep="Current unsaved note must survive cancellation/refusal.";
  await textInput(other+' [data-contact-field="reply"]',keep);
  await openNotes(notes.file);await waitPreview();
  assert.match(await evaluate('document.querySelector("[data-contact-file-description]").textContent'),/3 recorded visit\/date notes; 1 match visits currently scheduled, 2 are for other dates or omitted visits/);
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(other+' [data-contact-field="reply"]')+').value'),keep);
  await activate("[data-contact-file-preview] summary");
  const previewText=await evaluate('document.querySelector("[data-contact-file-records]").textContent');
  assert.ok(previewText.includes(originalQuestion)&&previewText.includes(reply));
  assert.equal(await evaluate('window.__noteInjected===true'),false);
  await activate("[data-contact-file-cancel]");
  assert.equal(await evaluate('document.querySelector("[data-contact-file-preview]").hidden'),true);
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(other+' [data-contact-field="reply"]')+').value'),keep);
  passed("real notes chooser previews exact hidden-date/question-history records without applying them, and Cancel preserves current notes");

  await openNotes(notes.file);await waitPreview();
  const edited="A later note edit retires this preview.";
  await textInput(other+' [data-contact-field="reply"]',edited);
  assert.equal(await evaluate('document.querySelector("[data-contact-file-preview]").hidden'),true);
  assert.equal(await evaluate('document.querySelector("[data-contact-file-apply]").disabled'),true);
  await openNotes(notes.file);await waitPreview();
  await selectValue('#weekOrganizer select[data-pick-key="pick-2"]',"Sunday");
  assert.equal(await evaluate('document.querySelector("[data-contact-file-preview]").hidden'),true);
  await selectValue('#weekOrganizer select[data-pick-key="pick-2"]',"Friday");
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(other+' [data-contact-field="reply"]')+').value'),edited);
  passed("ordinary note edits and arrangement changes retire a pending replacement without relabeling dated replies");

  const beforeRefusal=await savedNotes("before-refusal.json");
  const wrong=structuredClone(notes.value);wrong.origin.inputs.city="A different original request";
  const wrongFile=join(output,"different-origin-notes.json");
  await saveArtifact("different-origin-notes.json",JSON.stringify(wrong,null,2)+"\n",{kind:"authored changed-origin negative input"});
  await openNotes(wrongFile);
  await waitFor(()=>evaluate('document.querySelector("[data-contact-file-status]").textContent.includes("different accepted plan")'),"changed-origin refusal");
  assert.equal(await evaluate('document.querySelector("[data-contact-file-preview]").hidden'),true);
  await saveArtifact("invalid-utf8-notes.json",Buffer.from([0xff,0xfe,0x00]),{kind:"authored invalid UTF-8 negative input"});
  await openNotes(join(output,"invalid-utf8-notes.json"));
  await waitFor(()=>evaluate('document.querySelector("[data-contact-file-status]").textContent.includes("valid UTF-8")'),"invalid UTF-8 refusal");
  const afterRefusal=await savedNotes("after-refusal.json");
  assert.deepEqual(afterRefusal.value.records,beforeRefusal.value.records);
  assert.deepEqual(afterRefusal.value.origin,beforeRefusal.value.origin);
  passed("changed source identity and invalid UTF-8 refuse through actual file reads, preserving every current note and origin");

  const newer=structuredClone(notes.value);newer.records[0].note.nextStep="NEWER FILE PREVIEW — preserve this choice.";
  await saveArtifact("newer-notes.json",JSON.stringify(newer,null,2)+"\n",{kind:"authored later valid notes choice"});
  await holdNextNotes("saved-venue-notes.json");
  await openNotes(notes.file);
  await waitFor(()=>evaluate('typeof window.__venueHeld==="function"'),"actual original bytes held after native File.arrayBuffer");
  await openNotes(join(output,"newer-notes.json"));await waitPreview();
  assert.match(await evaluate('document.querySelector("[data-contact-file-description]").textContent'),/newer-notes.json/);
  await releaseNotes();
  assert.match(await evaluate('document.querySelector("[data-contact-file-description]").textContent'),/newer-notes.json/);
  assert.match(await evaluate('document.querySelector("[data-contact-file-records]").textContent'),/NEWER FILE PREVIEW/);
  await activate("[data-contact-file-cancel]");
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(other+' [data-contact-field="reply"]')+').value'),edited);
  passed("a delayed original file completion cannot replace a newer reviewed file or change unsaved notes");

  await holdNextNotes("saved-venue-notes.json");
  await openNotes(notes.file);
  await waitFor(()=>evaluate('typeof window.__venueHeld==="function"'),"second actual file completion held");
  const otherWeek=structuredClone(arranged);otherWeek.receivedAt="2026-10-08T14:24:41.678Z";
  otherWeek.inputs.city="Other accepted local snapshot";
  await saveArtifact("other-accepted-week.json",JSON.stringify(otherWeek,null,2)+"\n",{kind:"authored new accepted-origin negative input"});
  await openWeek(join(output,"other-accepted-week.json"),3);
  await releaseNotes();
  assert.equal(await evaluate('document.querySelector("[data-contact-file-preview]").hidden'),true);
  assert.equal(await evaluate("document.querySelector('input[name=\"city\"]').value"),otherWeek.inputs.city);
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(other+' [data-contact-field="reply"]')+').value'),"");
  await openNotes(notes.file);
  await waitFor(()=>evaluate('document.querySelector("[data-contact-file-status]").textContent.includes("different accepted plan")'),"notes refused for new accepted snapshot");
  passed("a newly accepted saved-week origin retires the old asynchronous note read and refuses its foreign records");

  await openWeek(saved.file,3);
  await openNotes(notes.file);await waitPreview();
  await activate("[data-contact-file-apply]");
  await waitFor(()=>evaluate('document.querySelector("[data-contact-file-status]").textContent.includes("Venue notes replaced")'),"explicit actual replacement");
  assert.equal(await evaluate('document.querySelector("[data-contact-file-preview]").hidden'),true);
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(other+' [data-contact-field="nextStep"]')+').value'),"Original Friday follow-up 海");
  const resumed=await savedNotes("resumed-venue-notes.json");
  assert.deepEqual(resumed.value.records,notes.value.records);
  assert.deepEqual(resumed.value.origin,notes.value.origin);
  const unchangedWeek=JSON.parse((await downloaded("#saveWeek","resumed-week.json")).bytes.toString("utf8"));
  for(const key of ["receivedAt","calendarId","inputs","response","week"])assert.deepEqual(unchangedWeek[key],arranged[key]);
  passed("valid retry and explicit Replace restore the exact complete record set while original week, inputs, checks and calendar identity remain unchanged");

  await selectValue('#weekOrganizer select[data-pick-key="pick-0"]',"Sunday");
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(first+' [data-contact-field="reply"]')+').value'),sundayReply);
  await selectValue('#weekOrganizer select[data-pick-key="pick-0"]',"Thursday");
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(first+' [data-contact-field="reply"]')+').value'),reply);
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(first+' [data-contact-field="question"]')+').value'),revisedQuestion);
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(first+' [data-contact-reply-questions]')+').textContent'),originalQuestion);
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(first+' [data-contact-earlier]')+').hidden'),false);
  const txt=await downloaded("[data-contact-download]","resumed-call-sheet.txt");
  const indented=(value)=>value.split(/\r?\n/).map(line=>"  "+line).join("\n");
  assert.ok(txt.bytes.toString("utf8").includes(indented(reply))&&txt.bytes.toString("utf8").includes(indented(originalQuestion)));
  passed("returning to each original date reveals only its own restored note and the readable TXT keeps the earlier-question explanation");

  await command("Emulation.setDeviceMetricsOverride",{width:390,height:900,deviceScaleFactor:1,mobile:false});
  await openNotes(notes.file);await waitPreview();
  await activate("[data-contact-file-preview] summary");
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth&&document.body.scrollWidth<=innerWidth'),"390px layout does not overflow");
  await screenshot("phone-note-preview.png","[data-contact-file-preview]");
  await activate("[data-contact-file-cancel]");
  await screenshot("phone-resumed-worksheet.png","#venueFollowup");
  passed("390px file preview and worksheet retain literal multiline content, usable keyboard controls and no horizontal overflow");

  await evaluate('(() => {const actual=URL.createObjectURL;URL.createObjectURL=function(){URL.createObjectURL=actual;throw new Error("authored one-shot download preparation refusal");};})()');
  await activate("[data-contact-file-save]");
  await waitFor(()=>evaluate('document.querySelector("[data-contact-file-status]").textContent.includes("authored one-shot")'),"ordinary download preparation failure");
  assert.equal(await evaluate('document.querySelector("[data-contact-file-save]").disabled'),false);
  const retried=await savedNotes("download-retry-notes.json");
  assert.deepEqual(retried.value.records,notes.value.records);
  const empty={...structuredClone(notes.value),records:[]};
  await saveArtifact("empty-notes.json",JSON.stringify(empty,null,2)+"\n",{kind:"authored explicit-clear input"});
  await openNotes(join(output,"empty-notes.json"));await waitPreview();
  assert.match(await evaluate('document.querySelector("[data-contact-file-status]").textContent'),/Replace will clear/);
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(first+' [data-contact-field="reply"]')+').value'),reply);
  await activate("[data-contact-file-apply]");
  assert.ok(await evaluate('Array.from(document.querySelectorAll("[data-contact-field=reply]")).every(n=>n.value==="")'));
  await openNotes(notes.file);await waitPreview();await activate("[data-contact-file-apply]");
  assert.equal(await evaluate('document.querySelector('+JSON.stringify(first+' [data-contact-field="reply"]')+').value'),reply);
  passed("download preparation can retry, and an empty companion clears notes only after explicit Replace before a successful restore");

  assert.deepEqual(pageErrors,[]);assert.deepEqual(report.externalRequests,[]);
  assert.ok(report.serverRequests.every(r=>r.method==="GET"));
  assert.equal(await evaluate('localStorage.length+sessionStorage.length'),0);
  assert.equal(await evaluate('window.__noteInjected===true'),false);
  passed("complete flow preserves source files, local-only GET traffic, empty automatic storage and literal text without page errors");
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
