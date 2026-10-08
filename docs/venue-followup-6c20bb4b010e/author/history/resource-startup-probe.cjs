/* Actual FastAPI + browser receiving; all planning stays in native mock mode. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const http = require("node:http");
const { spawn } = require("node:child_process");

const [appArgument, outputArgument] = process.argv.slice(2);
if (!appArgument || !outputArgument) throw new Error("Usage: node venue_followup.browser.cjs APP_ROOT NEW_OUTPUT_DIRECTORY");
const appRoot = fs.realpathSync(appArgument);
const output = path.resolve(outputArgument);
fs.mkdirSync(output);
const temporary = path.join(output, "temporary");
fs.mkdirSync(temporary);
process.env.TMPDIR = temporary;
const { chromium } = require(process.env.TASTETABLE_PLAYWRIGHT || "playwright");
const runtimePaths = ["app.py", "agent.py", "qloo_client.py", "constraints.py", "personas.py", "fixtures/qloo_fixtures.json",
  "static/app.js", "static/index.html", "static/week_plan.mjs", "static/plan-request.js", "static/calendar.js", "static/style.css", "static/calendar.css",
  "static/venue_followup.mjs", "static/venue_followup.css", "static/week_file.mjs"];
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
function sourcePins() {
  return Object.fromEntries(runtimePaths.filter((file) => fs.existsSync(path.join(appRoot, file)))
    .map((file) => [file, sha(fs.readFileSync(path.join(appRoot, file)))]));
}
const result = { appRoot, started: new Date().toISOString(), sourceBefore: sourcePins(), groups: [], nativeResponses: [], pageErrors: [], externalRequests: [], downloads: [] };
let browser, server, serverLog = "", origin, page;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function group(name, action) {
  try { await action(); result.groups.push({ name, passed: true }); }
  catch (error) { result.groups.push({ name, passed: false, error: error.stack }); throw error; }
}
async function nativeSample(id) {
  await page.locator("#personaSel").selectOption(id);
  const received = page.waitForResponse((response) => response.url() === `${origin}/api/plan/sample/${id}`);
  await page.locator("#sampleBtn").click();
  const response = await received;
  assert.equal(response.status(), 200);
  const body = await response.json();
  assert.equal(body.mock, true);
  result.nativeResponses.push({ id, body, sha256: sha(Buffer.from(JSON.stringify(body))) });
  await page.locator("#results").waitFor({ state: "visible" });
  return body;
}
const card = (key) => page.locator(`[data-contact-key="${key}"]`);
const reply = (key) => card(key).locator('[data-contact-field="reply"]');
async function date(value) { await page.locator("#weekDate").fill(value); }
async function move(key, day) { await page.locator(`#weekOrganizer select[data-pick-key="${key}"]`).selectOption(day); }
async function downloadSheet(name) {
  const pending = page.waitForEvent("download");
  await page.locator("[data-contact-download]").click();
  const download = await pending;
  const destination = path.join(output, name);
  await download.saveAs(destination);
  const bytes = fs.readFileSync(destination);
  result.downloads.push({ file: name, suggestedFilename: download.suggestedFilename(), bytes: bytes.length, sha256: sha(bytes) });
  return bytes.toString("utf8");
}

async function existingDownload(selector, name) {
  const pending = page.waitForEvent("download");
  await page.locator(selector).click();
  const download = await pending;
  const destination = path.join(output, name);
  await download.saveAs(destination);
  const bytes = fs.readFileSync(destination);
  result.downloads.push({ file: name, suggestedFilename: download.suggestedFilename(), bytes: bytes.length, sha256: sha(bytes) });
  return bytes;
}

(async () => {
  const allocator = http.createServer();
  await new Promise((resolve) => allocator.listen(0, "127.0.0.1", resolve));
  const port = allocator.address().port;
  await new Promise((resolve) => allocator.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  const env = { ...process.env, PYTHONDONTWRITEBYTECODE: "1", TASTETABLE_LIVE: "0", TASTETABLE_LLM_BASE_URL: "", QLOO_API_KEY: "MOCK-NOT-A-KEY" };
  delete env.TASTETABLE_LLM_API_KEY;
  delete env.TASTETABLE_LLM_MODEL;
  if (process.env.TASTETABLE_PYTHONPATH) env.PYTHONPATH = process.env.TASTETABLE_PYTHONPATH;
  server = spawn(process.env.TASTETABLE_PYTHON || "python3", ["-B", "-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", String(port), "--log-level", "warning"], { cwd: appRoot, env, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (data) => { serverLog += data; });
  server.stderr.on("data", (data) => { serverLog += data; });
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error(`Native app exited: ${serverLog}`);
    try { const health = await fetch(`${origin}/api/health`).then((response) => response.json()); assert.equal(health.qloo_mode, "mock"); ready = true; break; }
    catch { await sleep(100); }
  }
  if (!ready) throw new Error(`Native app did not become ready: ${serverLog}`);
  browser = await chromium.launch({ executablePath: process.env.TASTETABLE_CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  result.browser = browser.version();
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
  await context.route("**/*", (route) => {
    if (route.request().url().startsWith(origin)) return route.continue();
    result.externalRequests.push(route.request().url());
    return route.abort();
  });
  page = await context.newPage();
  page.on("pageerror", (error) => result.pageErrors.push(error.message));
  let planRequests = 0;
  page.on("request", (request) => { if (request.method() === "POST") planRequests++; });
  await page.goto(origin);
  await page.locator("#sampleBtn").waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector("#sampleBtn").disabled);
  await nativeSample("rosa");
  await page.setViewportSize({ width: 390, height: 844 });
  await card("pick-0").locator(".contact-question-editor summary").click();
  await card("pick-0").locator('[data-contact-field="question"]').fill('Is the side entrance open after 6pm?\nLiteral <img src=x onerror="window.__questionExecuted=true">');
  result.overflowBefore = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, elements: [...document.querySelectorAll("#venueFollowup *")].filter(e => e.getBoundingClientRect().right > innerWidth).map(e => ({ tag: e.tagName, className:e.className, right:e.getBoundingClientRect().right, text:e.textContent.slice(0,100) })) }));
  await page.addStyleTag({ content: '.contact-questions li { overflow-wrap:anywhere; }' });
  result.overflowAfter = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(result.overflowBefore.document > result.overflowBefore.width);
  assert.equal(result.overflowAfter.document, result.overflowAfter.width);
  assert.deepEqual(result.pageErrors, []);
  assert.deepEqual(result.externalRequests, []);
  result.planRequests = planRequests;
  result.passed = true;
})().catch((error) => {
  result.passed = false;
  result.error = error.stack;
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => server.once("exit", resolve)), sleep(3000)]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  result.sourceAfter = sourcePins();
  result.sourceUnchanged = JSON.stringify(result.sourceBefore) === JSON.stringify(result.sourceAfter);
  if (!result.sourceUnchanged) { result.passed = false; process.exitCode = 1; }
  result.finished = new Date().toISOString();
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(result, null, 2) + "\n");
  fs.writeFileSync(path.join(output, "native-server.log"), serverLog);
  fs.rmSync(temporary, { recursive: true, force: true });
  console.log(JSON.stringify({ passed: result.passed, groups: result.groups.map(({ name, passed }) => ({ name, passed })), sourceUnchanged: result.sourceUnchanged, error: result.error }));
});
