#!/usr/bin/env node
/** Actual native-result -> saved-week -> unchanged browser consumer receiving.
 * Node 22 with built-in WebSocket, Python and an installed Chrome; no installs.
 * CDP transport helpers follow the independently executed handout receiver.
 */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {spawn, spawnSync} from "node:child_process";
import {createServer} from "node:http";
import {readFile, writeFile, mkdir, mkdtemp, rm, readdir} from "node:fs/promises";
import {dirname, extname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import {createWeekPlan, setPickDay, weekRows} from "../static/week_plan.mjs";
import {readWeekFile} from "../static/week_file.mjs";

const arguments_ = process.argv.slice(2);
const option = (name, fallback) => arguments_.includes(name)
  ? arguments_[arguments_.indexOf(name) + 1] : fallback;
const project = resolve(option("--root", join(dirname(fileURLToPath(import.meta.url)), "..")));
const executable = option("--browser", "google-chrome");
const output = resolve(option("--output", join(project, "native-plan-week-receiving")));
const python = process.env.NATIVE_WEEK_PYTHON || "python3";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
await mkdir(output);
assert.deepEqual(await readdir(output), [], "Receiving output must be a new empty directory");
const downloadPath = join(output, "downloads");
await mkdir(downloadPath);
const profile = await mkdtemp(join(output, "profile-"));
const report = {
  schema: "tastetable.native-plan-week-browser/1", status: "running",
  project, executable, node: process.version, checkout: process.env.GITHUB_SHA ?? null,
  claim: "https://github.com/Jacob-Met/tastetable/issues/25",
  bootstrap: "Unchanged application files; authored GET-only /api/health mock and /api/personas empty responses. No FastAPI/deployment claim.",
  fileSelection: "Actual Open saved week keyboard control, Page.fileChooserOpened and DOM.setFileInputFiles; native File.text is unchanged.",
  checks: [], artifacts: [], programs: [], requests: [], externalRequests: [],
  serverRequests: [], sourceSha256: {}, sourceUnchanged: false,
};
const sourcePaths = [
  "tastetable_cli.py", "agent.py", "constraints.py", "qloo_client.py", "personas.py",
  "fixtures/qloo_fixtures.json", "static/week_plan.mjs", "static/week_file.mjs",
  "static/calendar.js", "static/calendar.css", "static/app.js", "static/index.html",
  "static/venue_followup.mjs", "static/venue_followup.css", "static/venue_note_file.mjs", "static/venue_note_changes.mjs",
  "static/style.css", "static/plan-request.js", "tools/native_plan_to_week.mjs",
  "tests/test_native_plan_week.py", "tools/check_native_plan_week_browser.mjs",
  ".github/workflows/native-plan-week-browser.yml",
];
for (const name of sourcePaths) report.sourceSha256[name] = hash(await readFile(join(project, name)));
const sourceBefore = {...report.sourceSha256};
const downloads = new Map();
const chooserEvents = [];
const pageErrors = [];
let pageRequests = [];
let browser;
let socket;
let sessionId;
let browserLog = "";
let sequence = 0;
const pending = new Map();
const sleep = milliseconds => new Promise(resolve_ => setTimeout(resolve_, milliseconds));
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    report.serverRequests.push({method: request.method, path: pathname});
    if (request.method !== "GET") { response.writeHead(405).end(); return; }
    if (pathname === "/api/health" || pathname === "/api/personas") {
      response.writeHead(200, {"Content-Type": "application/json"});
      response.end(pathname === "/api/health" ? '{"qloo_mode":"mock"}' : "[]");
      return;
    }
    const relative = pathname === "/" ? "static/index.html" : pathname.slice(1);
    if (!sourcePaths.includes(relative) || !relative.startsWith("static/")) {
      response.writeHead(404).end(); return;
    }
    const content = await readFile(join(project, relative));
    const mime = {".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript",
      ".css": "text/css"}[extname(relative)];
    response.writeHead(200, {"Content-Type": mime + "; charset=utf-8", "Cache-Control": "no-store"});
    response.end(content);
  } catch { response.writeHead(404).end("Missing current source."); }
});
await new Promise(resolve_ => server.listen(0, "127.0.0.1", resolve_));
const base = "http://127.0.0.1:" + server.address().port;
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
async function chooseFile(file) {
  const count = chooserEvents.length;
  await activate('#openWeek');
  await waitFor(() => chooserEvents.length > count, 'native saved-week file chooser');
  const event = chooserEvents.at(-1);
  assert.equal(event.mode, 'selectSingle');
  let identity = {backendNodeId: event.backendNodeId};
  if (!event.backendNodeId) {
    const {root} = await command('DOM.getDocument');
    const {nodeId} = await command('DOM.querySelector', {nodeId: root.nodeId, selector: '#weekFile'});
    identity = {nodeId};
  }
  const {node} = await command('DOM.describeNode', identity);
  const attributes = Object.fromEntries(Array.from({length: node.attributes.length / 2},
    (_, index) => node.attributes.slice(index * 2, index * 2 + 2)));
  assert.equal(attributes.id, 'weekFile');
  assert.equal(attributes.type, 'file');
  await command('DOM.setFileInputFiles', {files: file ? [file] : [], ...identity});
}

async function recordExisting(name, details = {}) {
  const bytes = await readFile(join(output, name));
  report.artifacts.push({name, bytes: bytes.length, sha256: hash(bytes), ...details});
  return bytes;
}
function program(executable_, args, label) {
  const result = spawnSync(executable_, args, {
    cwd: project, env: {...process.env, PYTHONDONTWRITEBYTECODE: "1"},
    timeout: 20000, maxBuffer: 2 * 1024 * 1024,
  });
  report.programs.push({label, executable: executable_, args, status: result.status,
    signal: result.signal, stdoutSha256: hash(result.stdout || Buffer.alloc(0)),
    stderr: result.stderr?.toString("utf8") || "", error: result.error?.message || null});
  assert.equal(result.status, 0, label + ": " + (result.stderr?.toString("utf8") || result.error?.message));
  return result.stdout;
}
async function nativeWeek(tag, city = "Pasadena") {
  const inputs = {
    cuisines: ["Japanese", "Italian"], music: ["海 <keys> Björk"],
    films: ["Roman Holiday"], constraints: ["soft_foods"], city,
  };
  const authoredPath = join(output, tag + "-profile.json");
  await saveArtifact(tag + "-profile.json", JSON.stringify(inputs, null, 2) + "\n", {kind: "authored native input"});
  const nativeBytes = program(python, [join(project, "tastetable_cli.py"), "--profile", authoredPath], tag + " native producer");
  const envelope = JSON.parse(nativeBytes.toString("utf8"));
  assert.equal(envelope.provenance.mode, "offline-fixtures");
  assert.equal(envelope.response.mock, true);
  assert.deepEqual(envelope.profile, inputs);
  await saveArtifact(tag + "-native.json", nativeBytes, {kind: "actual Python CLI stdout"});
  const name = tag + "-converted-week.json";
  const resultBytes = program(process.execPath, [
    join(project, "tools/native_plan_to_week.mjs"), "--input", join(output, tag + "-native.json"),
    "--week", "2026-12-30", "--output", join(output, name),
  ], tag + " actual converter");
  const receipt = JSON.parse(resultBytes.toString("utf8"));
  assert.deepEqual(receipt.provenance, envelope.provenance);
  const bytes = await recordExisting(name, {kind: "actual create-only converter output"});
  const restored = readWeekFile(bytes.toString("utf8"));
  assert.deepEqual(restored.inputs, envelope.profile);
  assert.deepEqual(restored.response, envelope.response);
  assert.equal(restored.state.weekStart, "2026-12-28");
  return {envelope, restored, name, nativeName: tag + "-native.json", bytes};
}
async function opened(file) {
  await chooseFile(file);
  await waitFor(() => evaluate('document.querySelector("#requestStatus").textContent.startsWith("Saved week opened.")'), "actual saved-week acceptance");
}
async function selectValue(selector, value) {
  const index = await evaluate('(() => {const node=document.querySelector(' + JSON.stringify(selector) +
    '); return [...node.options].findIndex(option=>option.value===' + JSON.stringify(value) + ');})()');
  assert.ok(index >= 0, "Existing select option");
  await click(selector);
  await key("Home", "Home", 36);
  for (let step = 0; step < index; step++) await key("ArrowDown", "ArrowDown", 40);
  await key("Enter", "Enter", 13);
  await waitFor(() => evaluate('document.querySelector(' + JSON.stringify(selector) + ').value===' + JSON.stringify(value)), "native select change");
}
async function verifyWeek(expected, sourceName) {
  const observed = await evaluate(`(() => ({
    shown: !document.querySelector("#results").hidden,
    date: document.querySelector("#weekDate").value,
    source: document.querySelector("#weekSource").textContent,
    saved: document.querySelector("#savedWeekSource").textContent,
    picks: [...document.querySelectorAll("#weekOrganizer select[data-pick-key]")].map(node => ({
      key: node.dataset.pickKey, day: node.value || null,
      name: node.closest("article").querySelector("h4").textContent,
      why: node.closest("article").querySelector(".why").textContent,
      identity: node.closest("article").querySelector(".mono").textContent,
    })),
    openDays: document.querySelectorAll("#weekDays .open-day").length,
    calendarDisabled: document.querySelector("#calendarDownload").matches(":disabled"),
    saveDisabled: document.querySelector("#saveWeek").matches(":disabled"),
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    injected: !!document.querySelector("#weekDays script,#weekDays img,#omittedPicks script"),
    inputs: Object.fromEntries(["cuisines","music","films","city"].map(key => [key, document.querySelector("#form").elements[key].value])),
  }))()`);
  assert.equal(observed.shown, true);
  assert.equal(observed.date, expected.weekStart);
  assert.match(observed.source, /fictional/);
  assert.ok(observed.saved.includes(sourceName));
  assert.equal(observed.overflow, false);
  assert.equal(observed.injected, false);
  assert.equal(observed.saveDisabled, false);
  assert.equal(observed.picks.length, expected.picks.length);
  for (const pick of expected.picks) {
    const current = observed.picks.find(value => value.key === pick.key);
    assert.ok(current);
    assert.equal(current.day, expected.assignments[pick.key]);
    assert.equal(current.name, pick.pick.name);
    assert.equal(current.why, pick.pick.why);
    assert.equal(current.identity, "Qloo id: " + pick.pick.entity_id);
  }
  return observed;
}
const calendar = createRequire(import.meta.url)(join(project, "static/calendar.js"));
function expectedCalendar(restored, state) {
  return calendar.createWeekExport(state, {
    id: restored.calendarId, createdAt: new Date(restored.receivedAt),
  }).download(state, weekRows(state));
}
function calendarIds(text) {
  return text.split("\r\n").filter(line => line.startsWith("UID:")).sort();
}
try {
  const chosen = await nativeWeek("authored");
  assert.ok(chosen.restored.state.picks.length >= 2, "Native fixture contains movable and omittable picks");
  const empty = await nativeWeek("empty", "No matching fixture city");
  assert.equal(empty.restored.state.picks.length, 0);
  passed("actual original Python producer and new converter preserve authored and empty native results");
  assert.ok(typeof WebSocket === 'function', 'Use Node 22 or newer with built-in WebSocket');
  browser = spawn(executable, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
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

  await navigate(base + "/", "#openWeek", 1280, 1000);
  await chooseFile(join(output, chosen.nativeName));
  await waitFor(() => evaluate('document.querySelector("#requestStatus").textContent.includes("could not open this saved week")'), "raw native result refusal");
  assert.equal(await evaluate('document.querySelector("#results").hidden'), true);
  passed("actual native file picker refuses the original raw result at the existing saved-week format boundary");

  await opened(join(output, chosen.name));
  const initial = await verifyWeek(chosen.restored.state, chosen.name);
  for (const field of ["cuisines", "music", "films"])
    assert.equal(initial.inputs[field], chosen.envelope.profile[field].join(", "));
  assert.equal(initial.inputs.city, chosen.envelope.profile.city);
  const firstCalendar = await downloaded("#calendarDownload", "original-calendar.ics");
  assert.equal(firstCalendar.bytes.toString("utf8"),
    expectedCalendar(chosen.restored, chosen.restored.state).text);
  passed("converted native file opens with exact original inputs, picks, explanations and current calendar identity");

  const firstKey = chosen.restored.state.picks[0].key;
  const lastKey = chosen.restored.state.picks.at(-1).key;
  await selectValue('select[data-pick-key="' + firstKey + '"]', "Thursday");
  await selectValue('select[data-pick-key="' + lastKey + '"]', "");
  let arranged = setPickDay(chosen.restored.state, firstKey, "Thursday");
  arranged = setPickDay(arranged, lastKey, null);
  await verifyWeek(arranged, chosen.name);
  assert.equal(await evaluate("document.activeElement.dataset.pickKey"), lastKey);
  passed("actual keyboard selection moves and omits distinct occurrences without changing source evidence");

  const saved = await downloaded("#saveWeek", "edited-saved-week.json");
  const resaved = readWeekFile(saved.bytes.toString("utf8"));
  assert.deepEqual(resaved.state, arranged);
  assert.deepEqual(resaved.response, chosen.envelope.response);
  assert.deepEqual(resaved.inputs, chosen.envelope.profile);
  assert.equal(resaved.calendarId, chosen.restored.calendarId);
  assert.equal(resaved.receivedAt, chosen.restored.receivedAt);
  const editedCalendar = await downloaded("#calendarDownload", "edited-calendar.ics");
  const expected = expectedCalendar(chosen.restored, arranged);
  assert.equal(editedCalendar.bytes.toString("utf8"), expected.text);
  const initialIds = calendarIds(firstCalendar.bytes.toString("utf8"));
  const editedIds = calendarIds(editedCalendar.bytes.toString("utf8"));
  assert.equal(editedIds.length, chosen.restored.state.picks.length - 1);
  assert.ok(editedIds.every(id => initialIds.includes(id)));
  assert.ok(editedCalendar.bytes.toString("utf8").includes("DTSTART;VALUE=DATE:20261231"));
  report.savedFile = {name: "edited-saved-week.json", weekStart: arranged.weekStart,
    calendarId: resaved.calendarId, assignments: arranged.assignments,
    sourceProfileUnchanged: true, sourceResponseUnchanged: true};
  passed("real Save week and calendar downloads retain edited dates, complete source and occurrence IDs");

  await evaluate('(() => {const original=window.print; window.__nativeWeekPrints=0; window.print=function(...args){window.__nativeWeekPrints++; return Reflect.apply(original,this,args);};})()');
  await activate("#printWeek");
  await waitFor(() => evaluate("window.__nativeWeekPrints === 1"), "original print call");
  await command("Emulation.setEmulatedMedia", {media: "print"});
  const printState = await evaluate('({form:getComputedStyle(document.querySelector(".taste-form")).display,week:getComputedStyle(document.querySelector("#weekDays")).display,source:document.querySelector("#weekSource").textContent})');
  assert.equal(printState.form, "none");
  assert.notEqual(printState.week, "none");
  assert.match(printState.source, /fictional/);
  const printed = await command("Page.printToPDF", {printBackground: true, preferCSSPageSize: true});
  const pdf = Buffer.from(printed.data, "base64");
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 3000);
  const pages = [...pdf.toString("latin1").matchAll(/\/Type\s*\/Page\b/g)].length;
  assert.ok(pages > 0 && pages <= 12);
  await saveArtifact("arranged-native-week.pdf", pdf, {
    kind: "actual Chrome print PDF", pages,
    boundary: "Generation and print DOM only; no PDF text extraction, physical printer or direct pixel claim.",
  });
  await command("Emulation.setEmulatedMedia", {media: ""});
  await screenshot("desktop-arranged-week.png", "#weekOrganizer");
  passed("existing Print week invokes native print with retained provenance and produces a bounded PDF");

  await navigate(base + "/", "#openWeek", 390, 844);
  await waitFor(() => evaluate('document.querySelector("#results").hidden'), "fresh page before reopen");
  await opened(saved.file);
  report.narrowState = await verifyWeek(arranged, "edited-saved-week.json");
  const reopenedCalendar = await downloaded("#calendarDownload", "reopened-calendar.ics");
  assert.equal(reopenedCalendar.bytes.toString("utf8"), editedCalendar.bytes.toString("utf8"));
  await screenshot("phone-reopened-week.png", "#weekOrganizer");
  passed("actual downloaded week reopens at 390px with the same assignments and byte-identical calendar");

  await opened(join(output, empty.name));
  const emptyState = await verifyWeek(empty.restored.state, empty.name);
  assert.equal(emptyState.openDays, 7);
  assert.equal(emptyState.calendarDisabled, true);
  const emptySaved = await downloaded("#saveWeek", "empty-resaved-week.json");
  const emptyRestored = readWeekFile(emptySaved.bytes.toString("utf8"));
  assert.deepEqual(emptyRestored.state, empty.restored.state);
  assert.deepEqual(emptyRestored.response, empty.envelope.response);
  assert.equal(emptyRestored.calendarId, empty.restored.calendarId);
  await screenshot("phone-empty-week.png", "#weekOrganizer");
  passed("actual native no-match result opens and resaves an empty week without invented calendar events");

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(report.externalRequests, []);
  assert.ok(report.serverRequests.every(request => request.method === "GET" &&
    !request.path.startsWith("/api/plan")));
  assert.deepEqual(await readFile(join(output, chosen.name)), chosen.bytes);
  assert.deepEqual(await readFile(join(output, empty.name)), empty.bytes);
  passed("conversion and browser handoff preserve original files without planner HTTP calls or runtime exceptions");
  report.status = "passed";

} catch (error) {
  report.status = "failed";
  report.error = error.stack ?? String(error);
  report.browserLog = browserLog;
  if (sessionId) {
    try {
      report.lastPage = await evaluate('({url:location.href,focus:document.activeElement?.outerHTML,text:document.body?.innerText.slice(0,9000)})');
      await screenshot("failed-state.png");
    } catch { /* Retain the original failure. */ }
  }
  console.error(report.error);
  process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try { await command("Browser.close", {}, false); } catch { /* Already closed. */ }
  }
  socket?.close();
  for (const request of pending.values()) clearTimeout(request.timer);
  if (browser && browser.exitCode === null) browser.kill("SIGTERM");
  server.closeAllConnections();
  await new Promise(resolve_ => server.close(resolve_));
  await sleep(300);
  await rm(profile, {recursive: true, force: true});
  await rm(downloadPath, {recursive: true, force: true});
  const after = {};
  for (const name of sourcePaths) after[name] = hash(await readFile(join(project, name)));
  report.sourceUnchanged = JSON.stringify(after) === JSON.stringify(sourceBefore);
  if (!report.sourceUnchanged) { report.status = "failed"; process.exitCode = 1; }
  report.pageErrors = pageErrors;
  report.nativeFileChooserEvents = chooserEvents.length;
  report.totalArtifactBytes = report.artifacts.reduce((sum, item) => sum + item.bytes, 0);
  if (report.totalArtifactBytes > 8 * 1024 * 1024) {
    report.status = "failed"; report.artifactLimitExceeded = true; process.exitCode = 1;
  }
  await writeFile(join(output, "receiving-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("NATIVE_WEEK_BROWSER_RESULT " + report.status.toUpperCase() +
    " checks=" + report.checks.length + " artifacts=" + report.artifacts.length +
    " source_unchanged=" + report.sourceUnchanged);
  // Plain metadata, not encoded images: independently readable source/artifact
  // custody even when a GitHub ZIP cannot yet be materialized by a receiver.
  console.log("NATIVE_WEEK_BROWSER_RECEIPT " + JSON.stringify(report));
}
