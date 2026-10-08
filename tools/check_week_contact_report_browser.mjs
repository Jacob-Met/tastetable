#!/usr/bin/env node
/** Actual file-URL receiving of the optional caregiver-note handoff. Node 22+. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createWeekPlan, setPickDay, setWeek } from "../static/week_plan.mjs";
import { makeWeekFile } from "../static/week_file.mjs";
import { createVenueFollowup } from "../static/venue_followup.mjs";
import { makeVenueNoteFile } from "../static/venue_note_file.mjs";
const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const chrome = process.argv[2], output = path.resolve(process.argv[3] || "week-contact-browser");
if (!chrome) throw Error("Usage: node tools/check_week_contact_report_browser.mjs CHROME OUTPUT_DIRECTORY");
fs.mkdirSync(output, { recursive: true });
const profile = path.join(output, "profile");
if (fs.existsSync(profile)) throw Error("Choose a fresh output directory; no profile reuse.");
fs.mkdirSync(profile);
const hash = (b) => createHash("sha256").update(b).digest("hex");
const sourcePaths = ["static/week_plan.mjs", "static/week_file.mjs", "static/venue_followup.mjs", "static/venue_note_file.mjs",
  "static/week_report.mjs", "static/week_contact_report.mjs", "tools/saved_week_to_html.mjs", "tools/check_week_contact_report_browser.mjs"];
const before = Object.fromEntries(sourcePaths.map((p) => [p, hash(fs.readFileSync(path.join(repo, p)))]));
const response = JSON.parse(fs.readFileSync(path.join(repo, "tests/fixtures/saved-week-response.json"), "utf8"));
response.plan.meals[0].name = response.plan.meals[1].name = "Repeated café 海 <literal>";
response.plan.meals[1].entity_id = response.plan.meals[0].entity_id;
const origin = { response, inputs: { cuisines: [], music: [], films: [], city: "Authored fixture", constraints: response.comparison.constraints },
  receivedAt: "2026-10-08T10:00:00.000Z", calendarId: null };
let state = setPickDay(createWeekPlan(response, "2026-12-28"), "pick-1", "Monday");
const model = createVenueFollowup(state), date = "2026-12-28";
const reply = "Reply <script>literal</script> & 🧭\r\n  unchanged";
model.setField(state, "pick-0", date, "question", "Original?\r\n  keep spacing 海");
model.setField(state, "pick-0", date, "reply", reply);
model.setField(state, "pick-0", date, "status", "reply_recorded");
model.setField(state, "pick-0", date, "question", "Revised?\r\n  follow up 海");
model.setField(state, "pick-0", date, "nextStep", "Long_" + "x".repeat(480));
model.setField(state, "pick-1", date, "reply", "Second same-day occurrence");
const later = setWeek(state, "2027-01-04");
model.setField(later, "pick-0", "2027-01-04", "reply", "Other-week record stays historical");
const third = model.entries(state).find((x) => x.key === "pick-2");
model.setField(state, third.key, third.date, "reply", "Omitted occurrence stays historical");
state = setPickDay(state, "pick-2", null);
const week = makeWeekFile({ ...origin, state }, new Date("2026-10-08T10:05:00.000Z")).text;
const notes = makeVenueNoteFile({ origin, state, model }, new Date("2026-10-08T10:10:00.000Z")).text;
const input = path.join(output, "saved week 海.json"), companion = path.join(output, "venue notes 海.json"), html = path.join(output, "contact handoff 海.html");
fs.writeFileSync(input, week); fs.writeFileSync(companion, notes);
const cli = spawnSync(process.execPath, [path.join(repo, "tools/saved_week_to_html.mjs"), "--input", input, "--output", html, "--venue-notes", companion],
  { encoding: "utf8", timeout: 20000 });
fs.writeFileSync(path.join(output, "cli.json"), JSON.stringify({ status: cli.status, stdout: cli.stdout, stderr: cli.stderr }, null, 2));
assert.equal(cli.status, 0, cli.stderr);
const cliReceipt = JSON.parse(cli.stdout);
assert.deepEqual([cliReceipt.venueNotes.records, cliReceipt.venueNotes.matchedRecords, cliReceipt.venueNotes.retainedRecords], [4, 2, 2]);
const checks = [], errors = [], requests = [], blocked = [], observed = {};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, label) { for (let i = 0; i < 200; i++) { const value = await fn(); if (value) return value; await wait(40); } throw Error("Timeout " + label); }
const child = spawn(chrome, ["--headless=new", "--remote-debugging-port=0", "--user-data-dir=" + profile, "--no-first-run",
  "--no-default-browser-check", "--disable-background-networking", "about:blank"], { stdio: ["ignore", "pipe", "pipe"] });
const stderr = []; child.stderr.on("data", (b) => stderr.push(b));
let ws, id = 0; const pending = new Map();
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(Error("CDP timeout " + method)); }, 20000);
  pending.set(key, { resolve, reject, timer }); ws.send(JSON.stringify({ id: key, method, params, ...(sessionId ? { sessionId } : {}) }));
});
let version, failure;
try {
  const parts = await until(() => { const p = path.join(profile, "DevToolsActivePort"); return fs.existsSync(p) && fs.readFileSync(p, "utf8").split(/\r?\n/); }, "Chrome");
  ws = new WebSocket("ws://127.0.0.1:" + parts[0] + parts[1]);
  await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
  ws.addEventListener("message", (event) => {
    const m = JSON.parse(event.data);
    if (m.id) { const p = pending.get(m.id); if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); } return; }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.text);
    if (m.method === "Network.requestWillBeSent") requests.push(m.params.request.url);
    if (m.method === "Fetch.requestPaused") {
      const r = m.params;
      if (/^(file:|data:)/.test(r.request.url)) send("Fetch.continueRequest", { requestId: r.requestId }, m.sessionId).catch(() => {});
      else { blocked.push(r.request.url); send("Fetch.failRequest", { requestId: r.requestId, errorReason: "BlockedByClient" }, m.sessionId).catch(() => {}); }
    }
  });
  version = await send("Browser.getVersion");
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const call = (method, params = {}) => send(method, params, sessionId);
  const evaluate = async (expression) => {
    const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value;
  };
  for (const name of ["Page.enable", "Runtime.enable", "Network.enable"]) await call(name);
  await call("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
  await call("Page.navigate", { url: pathToFileURL(html).href });
  await until(() => evaluate('document.readyState==="complete"'), "physical handoff");
  await call("Page.bringToFront");
  const dom = await evaluate('({title:document.title,scripts:document.scripts.length,days:document.querySelectorAll(".day").length,current:Array.from(document.querySelectorAll(".day .contact-note"),e=>({key:e.dataset.contactKey,date:e.dataset.contactDate,text:e.textContent,fields:Array.from(e.querySelectorAll("dd"),x=>x.textContent)})),retained:Array.from(document.querySelectorAll(".retained-contact"),e=>({key:e.querySelector(".contact-note").dataset.contactKey,date:e.querySelector(".contact-note").dataset.contactDate,text:e.textContent})),body:document.body.textContent})');
  observed.dom = dom;
  assert.equal(dom.scripts, 0); assert.equal(dom.days, 7); assert.equal(dom.current.length, 4);
  assert.deepEqual(dom.current.slice(0, 2).map((x) => [x.key, x.date]), [["pick-0", date], ["pick-1", date]]);
  assert(dom.current[0].fields.includes(reply)); assert(dom.current[0].fields.includes("Original?\r\n  keep spacing 海"));
  assert(dom.current[0].fields.includes("Revised?\r\n  follow up 海")); assert(dom.current[0].text.includes("Needs follow-up"));
  assert(dom.current[1].text.includes("Second same-day occurrence"));
  assert(!dom.current[1].text.includes(reply)); assert(!dom.current[0].text.includes("Other-week record stays historical"));
  checks.push("physical CLI HTML preserves separate same-day repeated occurrences, literal CR/Unicode/markup and revised/earlier questions");
  assert.deepEqual(dom.retained.map((x) => [x.key, x.date]), [["pick-0", "2027-01-04"], ["pick-2", third.date]]);
  assert(dom.retained[0].text.includes("Other-week record stays historical")); assert(dom.retained[1].text.includes("kept off"));
  assert(dom.current.slice(2).every((x) => x.text.includes("No saved caregiver record")));
  assert(dom.body.includes(hash(Buffer.from(week))) && dom.body.includes(hash(Buffer.from(notes))));
  assert(dom.body.includes("4 saved records") && dom.body.includes("2 retained outside this arrangement"));
  checks.push("all four saved records accounted for once, other-date/omitted appendix isolated, unsaved defaults and both raw-byte fingerprints visible");
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 920, deviceScaleFactor: 1, mobile: false });
  await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }).then((r) => fs.writeFileSync(path.join(output, "desktop.png"), Buffer.from(r.data, "base64")));
  await evaluate('document.querySelector(".contact-note").scrollIntoView()');
  await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }).then((r) => fs.writeFileSync(path.join(output, "contact-detail.png"), Buffer.from(r.data, "base64")));
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true);
  await evaluate('document.querySelector(".contact-note").scrollIntoView()');
  await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }).then((r) => fs.writeFileSync(path.join(output, "phone.png"), Buffer.from(r.data, "base64")));
  checks.push("390px actual layout has no horizontal overflow with long unbroken notes; desktop and phone screenshots retained");
  await call("Emulation.setEmulatedMedia", { media: "print" });
  assert.equal(await evaluate('document.querySelector(".contact-note").offsetHeight>0 && document.querySelector(".retained-contact").offsetHeight>0'), true);
  const pdf = await call("Page.printToPDF", { printBackground: true, preferCSSPageSize: true });
  const bytes = Buffer.from(pdf.data, "base64"); assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  fs.writeFileSync(path.join(output, "printed-handoff.pdf"), bytes);
  checks.push("actual print media retains current and historical notes and physically generates a PDF");
  assert.deepEqual(errors, []); assert.deepEqual(blocked, []); assert(!requests.some((u) => /^https?:/.test(u)));
  checks.push("standalone file output has no scripts, runtime errors, HTTP requests or remote dependencies");
} catch (error) { failure = { message: error.message, stack: error.stack }; process.exitCode = 1; }
finally {
  if (ws?.readyState === WebSocket.OPEN) { await send("Browser.close").catch(() => {}); ws.close(); }
  const after = Object.fromEntries(sourcePaths.map((p) => [p, hash(fs.readFileSync(path.join(repo, p)))]));
  const inputsUnchanged = fs.readFileSync(input, "utf8") === week && fs.readFileSync(companion, "utf8") === notes;
  assert.deepEqual(after, before); assert(inputsUnchanged);
  const receipt = { at: new Date().toISOString(), node: process.version, version, checks, passed: !failure, failure, observed,
    errors, requests, blocked, inputsUnchanged, sourceSha256: before, sourceAfterSha256: after, htmlSha256: hash(fs.readFileSync(html)),
    outputFiles: fs.readdirSync(output).filter((x) => x !== "profile") };
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(receipt, null, 2) + "\n");
  fs.writeFileSync(path.join(output, "chrome-stderr.log"), Buffer.concat(stderr));
  console.log(JSON.stringify({ passed: receipt.passed, groups: checks.length, failure, version, htmlSha256: receipt.htmlSha256 }));
}
