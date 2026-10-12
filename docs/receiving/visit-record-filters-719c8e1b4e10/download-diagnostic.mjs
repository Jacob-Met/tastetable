#!/usr/bin/env node
/** Native Chrome/Chromium receiving through Node's built-in CDP WebSocket. */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve, dirname, join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const options = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  if (key === "--expect-absent") { assert.ok(!options[key]); options[key] = true; continue; }
  assert.ok(["--browser", "--output", "--source-root"].includes(key) && process.argv[i + 1],
    "Use --browser PATH --output NEW_DIR [--source-root DIR] [--expect-absent]");
  assert.ok(!Object.hasOwn(options, key), "Do not repeat options."); options[key] = process.argv[++i];
}
assert.ok(options["--browser"] && options["--output"], "Browser and output are required.");
const root = resolve(options["--source-root"] || join(dirname(fileURLToPath(import.meta.url)), ".."));
const output = resolve(options["--output"]), sha = value => createHash("sha256").update(value).digest("hex");
const {createVisitRecord, updateVisitRecord, makeVisitRecordFile, readVisitRecord} =
  await import(pathToFileURL(join(root, "static/visit_record.mjs")));
await mkdir(output);
const owned = await mkdtemp(join(output, "browser-"));
const profile = join(owned, "profile"), downloads = join(output, "downloads");
await mkdir(profile); await mkdir(downloads);
const paths = ["static/visit-record.html", "static/visit_record.css", "static/visit_record_ui.mjs",
  "static/visit_record.mjs", "static/week_file.mjs", "static/week_plan.mjs"];
if (!options["--expect-absent"]) paths.push("static/visit_record_filter.mjs", "static/visit_record_filter.css");
const pins = await Promise.all(paths.map(async path => ({path, sha256: sha(await readFile(join(root, path)))})));

function sourceWeek(empty = false) {
  const names = empty ? [] : ["Café Orbit", "Café Orbit", "Garden <literal>", "Harbor", "Small hall", "Orchard"];
  const meals = names.map((name, i) => ({name, entity_id: i < 2 ? "repeat-id" : "id-" + i,
    kind: "restaurant", day: "Monday", why: "Original suggestion " + i}));
  const counts = {picks: 0, with_qloo_entity_id: 0, with_affinity_evidence: 0,
    constraint_checked: 0, unsafe_candidates_rejected: 0};
  const envelope = {
    format: "tastetable.saved-week.v1", receivedAt: "2024-02-01T00:00:00.000Z",
    savedAt: "2024-02-25T18:00:00.000Z", calendarId: null,
    inputs: {city: "Fictional City", cuisines: ["Café"], music: [], films: [], constraints: []},
    response: {mock: true, plan: {meals, outing: null, notes: ["Fictional source for browser checks"], rejected: []},
      llm_only: {meals: [], outing: {name: "Comparison", day: "Saturday", why: "Original"}},
      comparison: {constraints: [], grounded: counts, llm_only: counts}, trace: []},
    week: {start: "2024-02-26", assignments: Object.fromEntries(meals.map((_, i) => ["pick-" + i, i === 1 ? null : "Thursday"]))},
  };
  return "\uFEFF" + JSON.stringify(envelope, null, 2).replaceAll("\n", "\r\n") + "\r\n";
}
const source = sourceWeek();
let original = createVisitRecord(source, "fictional-week.json");
const outcomes = ["went", "unrecorded", "did_not_go", "went", "unrecorded", "unrecorded"];
const notes = ["  Bring the blue bag\r\nKeep 🙂  ", "Call ahead", "Ask <literal>", "Near the harbor", "", "Fresh fruit"];
for (let i = 0; i < outcomes.length; i++) original = updateVisitRecord(original, "pick-" + i, {outcome: outcomes[i], note: notes[i]});
const recordPath = join(output, "original-record.json");
const recordBytes = makeVisitRecordFile(original, new Date("2024-03-02T00:00:00.000Z")).text;
await writeFile(recordPath, recordBytes);
const emptyPath = join(output, "empty-record.json");
await writeFile(emptyPath, makeVisitRecordFile(createVisitRecord(sourceWeek(true), "empty-week.json")).text);
const invalidPath = join(output, "invalid-record.json"); await writeFile(invalidPath, "{not JSON}");
const report = {schema: "tastetable.visit_record_filters.browser.v1", startedAt: new Date().toISOString(),
  sourceRoot: root, sourcePins: pins, checks: [], pageErrors: [], externalRequests: [], downloads: [],
  originalSha256: sha(recordBytes), status: "running"};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/favicon.ico") { res.writeHead(204).end(); return; }
    const path = resolve(root, "." + decodeURIComponent(url.pathname));
    if (!path.startsWith(join(root, "static") + "/")) { res.writeHead(403).end(); return; }
    const data = await readFile(path);
    res.writeHead(200, {"Content-Type": ({".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".css": "text/css"}[extname(path)] || "application/octet-stream") + ";charset=utf-8"}).end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const origin = "http://127.0.0.1:" + server.address().port;
let browser, socket, sessionId, nextId = 0, browserLog = "";
const pending = new Map(), downloadsById = new Map();
async function waitFor(fn, label, attempts = 120) {
  let last;
  for (let i = 0; i < attempts; i++) { try { const value = await fn(); if (value) return value; } catch (e) { last = e; } await sleep(100); }
  throw new Error("Timed out: " + label + (last ? " " + last.message : ""));
}
function command(method, params = {}, scoped = true) {
  const id = ++nextId;
  return new Promise((yes, no) => {
    const timer = setTimeout(() => { pending.delete(id); no(new Error("CDP timeout " + method)); }, 12000);
    pending.set(id, {yes, no, timer});
    socket.send(JSON.stringify({id, method, params, ...(scoped && sessionId ? {sessionId} : {})}));
  });
}
async function evaluate(expression) {
  const result = await command("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true});
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function press(selector) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  for (const type of ["keyDown", "keyUp"]) await command("Input.dispatchKeyEvent", {type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13,
    ...(type === "keyDown" ? {text: "\r", unmodifiedText: "\r"} : {})});
}
async function edit(selector, value, event = "input", focus = false) {
  await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); ${focus ? "node.focus();" : ""}
    node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event(${JSON.stringify(event)}, {bubbles:true})); })()`);
}
async function setFile(path) {
  await evaluate('document.querySelector("#recordFile").value = ""');
  const {root: document} = await command("DOM.getDocument");
  const {nodeId} = await command("DOM.querySelector", {nodeId: document.nodeId, selector: "#recordFile"});
  await command("DOM.setFileInputFiles", {nodeId, files: [path]});
}
const visible = () => evaluate('[...document.querySelectorAll(".visit-card")].filter(n => getComputedStyle(n).display !== "none").map(n => n.dataset.key)');
async function expectVisible(keys) { assert.deepEqual(await visible(), keys); }
async function screenshot(name) {
  await evaluate('document.querySelector("#visitFilters").scrollIntoView({block:"start"})');
  await evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))");
  const bytes = Buffer.from((await command("Page.captureScreenshot", {format: "png"})).data, "base64");
  await writeFile(join(output, name), bytes);
}
async function receive() {
  await setFile(recordPath);
  await waitFor(() => evaluate('!document.querySelector("#preview").hidden'), "original record preview");
  await press("#useRecord");
  await waitFor(() => evaluate('document.querySelectorAll(".visit-card").length === 6'), "six actual cards");
  if (options["--expect-absent"]) {
    assert.equal(await evaluate('document.querySelector("#visitFilterQuery")'), null);
    await expectVisible([0, 1, 2, 3, 4, 5].map(i => "pick-" + i));
    report.checks.push("original editor loads the six-occurrence file; requested filter controls are absent");
    return;
  }
  const all = [0, 1, 2, 3, 4, 5].map(i => "pick-" + i);
  await expectVisible(all);
  await edit("#visitFilterQuery", " CAFÉ "); await expectVisible(["pick-0", "pick-1"]);
  await edit("#visitFilterQuery", "blue bag"); await expectVisible(["pick-0"]);
  await edit("#visitFilterQuery", "<LITERAL>"); await expectVisible(["pick-2"]);
  await edit("#visitFilterQuery", ".*"); await expectVisible([]);
  assert.equal(await evaluate('document.querySelector("#visitFilterEmpty").hidden'), false);
  await press("#clearVisitFilters"); await expectVisible(all);
  assert.equal(await evaluate("document.activeElement.id"), "visitFilterQuery");
  for (const [value, expected] of [["went", [0, 3]], ["did_not_go", [2]], ["unrecorded", [1, 4, 5]]]) {
    await edit("#visitFilterOutcome", value, "change"); await expectVisible(expected.map(i => "pick-" + i));
  }
  await edit("#visitFilterQuery", "café"); await expectVisible(["pick-1"]);
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".visit-card[data-key=pick-1] .visit-heading"), "::before").content'), '"2"');
  report.checks.push("literal/Unicode venue and note matching, every outcome, intersection, no-match recovery and stable numbers");

  await edit("#pick-1-outcome", "went", "change", true); await expectVisible(["pick-1"]);
  assert.match(await evaluate('document.querySelector("#visitFilterStatus").textContent'), /editing stays visible/);
  await evaluate('document.querySelector("#pick-1-note").focus()'); await expectVisible(["pick-1"]);
  await evaluate('document.querySelector("#visitFilterQuery").focus()'); await expectVisible([]);
  await press("#clearVisitFilters");
  await edit("#pick-3-date", "2023-02-29", "input", true);
  assert.equal(await evaluate('document.querySelector("#saveRecord").disabled && document.querySelector("#printRecord").disabled'), true);
  await edit("#visitFilterQuery", "not present", "input", true); await expectVisible(["pick-3"]);
  assert.match(await evaluate('document.querySelector("#visitFilterStatus").textContent'), /fields to correct/);
  await edit("#pick-3-date", "2024-03-04", "input", true); await expectVisible(["pick-3"]);
  await evaluate('document.querySelector("#visitFilterQuery").focus()'); await expectVisible([]);
  assert.equal(await evaluate('document.querySelector("#saveRecord").disabled'), false);
  report.checks.push("focused edits remain usable; invalid drafts stay visible and preserve existing export refusal until corrected");

  await edit("#visitFilterQuery", "orchard"); await expectVisible(["pick-5"]);
  await evaluate("window.__receivingSaveClicks=0; document.querySelector('#saveRecord').addEventListener('click',()=>window.__receivingSaveClicks++)");
  report.beforeSave = await evaluate("JSON.stringify({button:document.querySelector('#saveRecord').outerHTML,buttonDisplay:getComputedStyle(document.querySelector('#saveRecord')).display,active:document.activeElement.id,status:document.querySelector('#saveStatus').textContent,invalid:document.querySelectorAll('[aria-invalid=true]').length,clicks:window.__receivingSaveClicks??0,userActivation:{active:navigator.userActivation.isActive,ever:navigator.userActivation.hasBeenActive}})");
  const before = new Set(downloadsById.keys()); await press("#saveRecord");
  report.afterSave = await evaluate("JSON.stringify({button:document.querySelector('#saveRecord').outerHTML,buttonDisplay:getComputedStyle(document.querySelector('#saveRecord')).display,active:document.activeElement.id,status:document.querySelector('#saveStatus').textContent,invalid:document.querySelectorAll('[aria-invalid=true]').length,clicks:window.__receivingSaveClicks??0,userActivation:{active:navigator.userActivation.isActive,ever:navigator.userActivation.hasBeenActive}})");
  const event = await waitFor(() => [...downloadsById.values()].find(e => !before.has(e.guid) && ["completed", "canceled"].includes(e.state)), "physical full-record download");
  if (event.state === "canceled") {
    const originalSession = sessionId;
    const {targetId: downloadTarget} = await command("Target.createTarget", {url:"chrome://downloads/"}, false);
    ({sessionId} = await command("Target.attachToTarget", {targetId:downloadTarget,flatten:true}, false));
    await waitFor(() => evaluate('Boolean(document.querySelector("downloads-manager")?.shadowRoot)'), "downloads diagnostic page");
    await sleep(300);
    report.downloadPage = await evaluate(`(() => {
      const manager = document.querySelector("downloads-manager");
      return {items:manager.items_?.map(x=>Object.fromEntries(["state","lastReasonText","filePath","dangerType","isMixedContent","fileName"].map(k=>[k,String(x[k])]))), entries:[...manager.shadowRoot.querySelectorAll("downloads-item")].map(x=>({text:x.shadowRoot?.textContent?.slice(-8000)}))};
    })()`);
    sessionId = originalSession;
  }
  assert.equal(event.state, "completed", "Browser must complete the physical record download");
  const bytes = await readFile(join(downloads, event.guid)), reopened = readVisitRecord(bytes.toString("utf8"));
  const expected = updateVisitRecord(updateVisitRecord(original, "pick-1", {outcome: "went"}), "pick-3", {date: "2024-03-04"});
  assert.deepEqual(reopened.record, expected);
  assert.equal(reopened.record.source.weekText, source); assert.equal(reopened.record.visits.length, 6);
  report.downloads.push({guid: event.guid, filename: event.suggestedFilename, bytes: bytes.length, sha256: sha(bytes)});
  await expectVisible(["pick-5"]);
  await command("Emulation.setEmulatedMedia", {media: "print"}); await expectVisible(all);
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#visitFilters")).display'), "none");
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".print-values")).display'), "block");
  const pdf = Buffer.from((await command("Page.printToPDF", {printBackground: true})).data, "base64");
  await writeFile(join(output, "complete-record.pdf"), pdf);
  report.print = {bytes: pdf.length, sha256: sha(pdf)};
  await command("Emulation.setEmulatedMedia", {media: "screen"}); await expectVisible(["pick-5"]);
  report.checks.push("filtered JSON download retains every occurrence and literal source/note; actual print restores the full record");

  await setFile(recordPath); await waitFor(() => evaluate('!document.querySelector("#preview").hidden'), "replacement preview");
  await expectVisible(["pick-5"]); await press("#cancelOpen"); await expectVisible(["pick-5"]);
  await setFile(invalidPath); await waitFor(() => evaluate('document.querySelector("#fileError").textContent.length > 0'), "invalid replacement refusal");
  await expectVisible(["pick-5"]);
  await evaluate('document.querySelector("#useRecord").click()'); await expectVisible(["pick-5"]);
  await setFile(recordPath); await waitFor(() => evaluate('!document.querySelector("#preview").hidden'), "successful replacement preview");
  await press("#useRecord"); await expectVisible(all);
  assert.equal(await evaluate('document.querySelector("#visitFilterQuery").value'), "");
  assert.equal(await evaluate('document.querySelector("#visitFilterOutcome").value'), "all");
  assert.equal(await evaluate('document.querySelector("#pick-1-outcome").value'), "unrecorded");
  report.checks.push("preview/cancel/refusal/forced empty Use preserve filters; successful explicit replacement resets filters");

  await edit("#visitFilterQuery", "Garden <literal>", "input", true);
  await command("Input.dispatchKeyEvent", {type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9});
  await command("Input.dispatchKeyEvent", {type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9});
  assert.equal(await evaluate("document.activeElement.id"), "visitFilterOutcome");
  await screenshot("desktop-filters.png");
  await command("Emulation.setDeviceMetricsOverride", {width: 390, height: 844, deviceScaleFactor: 1, mobile: true});
  assert.equal(await evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"), true);
  await screenshot("mobile-filters.png");
  report.checks.push("keyboard order and 390px layout remain usable");

  await setFile(emptyPath); await waitFor(() => evaluate('!document.querySelector("#preview").hidden'), "empty record preview");
  await press("#useRecord"); await expectVisible([]);
  assert.equal(await evaluate('document.querySelector("#visitFilterQuery").disabled && document.querySelector("#visitFilterOutcome").disabled'), true);
  assert.equal(await evaluate('document.querySelector("#visitFilterEmpty").hidden'), true);
  assert.match(await evaluate('document.querySelector("#visitFilterStatus").textContent'), /no visits to filter/);
  report.checks.push("zero-occurrence record retains its original empty state with disabled filters");
}

try {
  browser = spawn(options["--browser"], ["--headless=new", "--disable-gpu", "--disable-background-networking", "--disable-component-update",
    "--disable-sync", "--no-first-run", "--no-default-browser-check", "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
    "--user-data-dir=" + profile, ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []), "about:blank"], {stdio: ["ignore", "ignore", "pipe"]});
  browser.stderr.on("data", data => { browserLog = (browserLog + data.toString()).slice(-8000); });
  let launchError; browser.on("error", error => { launchError = error; });
  const port = await waitFor(async () => {
    if (launchError) throw launchError;
    if (browser.exitCode !== null) throw new Error("Browser exited " + browser.exitCode);
    return (await readFile(join(profile, "DevToolsActivePort"), "utf8")).trim().split("\n");
  }, "browser launch", 450);
  socket = new WebSocket("ws://127.0.0.1:" + port[0] + port[1]);
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (/^(Browser|Page)\.download/.test(message.method || "")) (report.rawDownloadEvents ||= []).push(message);
    if (message.id) { const entry = pending.get(message.id); if (!entry) return; pending.delete(message.id); clearTimeout(entry.timer);
      message.error ? entry.no(new Error(message.error.message)) : entry.yes(message.result); }
    else if (message.method === "Runtime.exceptionThrown") report.pageErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    else if (message.method === "Network.requestWillBeSent") { const url = message.params.request.url;
      if (/^https?:/.test(url) && !url.startsWith(origin + "/")) report.externalRequests.push(url); }
    else if (["Browser.downloadWillBegin", "Browser.downloadProgress"].includes(message.method)) {
      downloadsById.set(message.params.guid, {...downloadsById.get(message.params.guid), ...message.params});
    }
  });
  await new Promise((yes, no) => { socket.addEventListener("open", yes, {once: true}); socket.addEventListener("error", no, {once: true}); });
  report.browser = await command("Browser.getVersion", {}, false);
  const {targetId} = await command("Target.createTarget", {url: "about:blank"}, false);
  ({sessionId} = await command("Target.attachToTarget", {targetId, flatten: true}, false));
  for (const method of ["Page.enable", "Runtime.enable", "DOM.enable", "Network.enable"]) await command(method);
  await command("Browser.setDownloadBehavior", {behavior: "allowAndName", downloadPath: downloads, eventsEnabled: true}, false);
  await command("Emulation.setDeviceMetricsOverride", {width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false});
  await command("Page.navigate", {url: origin + "/static/visit-record.html"});
  await waitFor(() => evaluate('document.readyState === "complete" && document.querySelector("#openRecord")'), "page ready");
  await receive();
  assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.externalRequests, []);
  for (const pin of pins) assert.equal(sha(await readFile(join(root, pin.path))), pin.sha256);
  assert.equal(sha(await readFile(recordPath)), report.originalSha256);
  report.status = options["--expect-absent"] ? "original-absence-confirmed" : "passed";
} catch (error) { report.status = "failed"; report.error = error.stack; report.browserLog = browserLog; process.exitCode = 1; }
finally {
  report.observedDownloads = [...downloadsById.values()];
  if (socket?.readyState === WebSocket.OPEN) try { await command("Browser.close", {}, false); } catch {}
  socket?.close(); for (const entry of pending.values()) clearTimeout(entry.timer);
  if (browser && browser.exitCode === null && browser.signalCode === null) browser.kill("SIGTERM");
  for (let i = 0; browser && browser.exitCode === null && browser.signalCode === null && i < 30; i++) await sleep(100);
  report.browserExited = !browser || browser.exitCode !== null || browser.signalCode !== null;
  if (report.browserExited) await rm(owned, {recursive: true, force: true});
  else { report.cleanupError = "Owned browser still running; profile retained."; process.exitCode = 1; }
  server.closeAllConnections(); await new Promise(r => server.close(r));
  report.finishedAt = new Date().toISOString(); report.receiverSha256 = sha(await readFile(fileURLToPath(import.meta.url)));
  await writeFile(join(output, "receipt.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({status: report.status, checks: report.checks, output, browserExited: report.browserExited}));
}
