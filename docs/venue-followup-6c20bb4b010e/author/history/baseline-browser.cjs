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
  "static/venue_followup.mjs", "static/venue_followup.css"];
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
  let rosa;
  await group("unchanged native planner and existing arranged-week positive control", async () => {
    rosa = await nativeSample("rosa");
    assert.equal(rosa.plan.meals.length, 4);
    assert.ok(rosa.plan.outing);
    assert.equal(await page.locator("#weekOrganizer select[data-pick-key]").count(), 5);
    await date("2026-12-30");
    assert.equal(await page.locator("#calendarDownload").isEnabled(), true);
    assert.equal(await page.locator("#printWeek").isEnabled(), true);
  });
  await group("caregiver can prepare questions for every actual native scheduled pick", async () => {
    assert.equal(await page.locator("#venueFollowup").count(), 1, "The native plan has no venue-call worksheet");
    assert.equal(await page.locator("#venueFollowup").isVisible(), true);
    assert.equal(await page.locator("[data-contact-key]").count(), 5);
    assert.equal(await card("pick-0").locator(".contact-questions li").count(), 4);
    assert.equal(await card("pick-4").locator(".contact-questions li").count(), 2);
    for (const [index, pick] of [...rosa.plan.meals, rosa.plan.outing].entries()) {
      assert.ok((await card(`pick-${index}`).locator(".contact-explanation").innerText()).includes(pick.why));
    }
    assert.match(await page.locator("[data-contact-source]").innerText(), /fictional venues/);
  });
  await group("reply editing, move, return, omission and export preserve exact visit/date custody", async () => {
    const requestsBefore = planRequests;
    await reply("pick-0").fill('A fixture reply: <img src=x onerror="window.__noteExecuted=true">\nCall again before Monday.');
    await card("pick-0").locator('[data-contact-field="nextStep"]').fill("Ask about the step-free entrance.");
    await card("pick-0").locator('[data-contact-field="status"]').selectOption("follow_up");
    await move("pick-0", "Thursday");
    assert.equal(await reply("pick-0").inputValue(), "");
    await reply("pick-0").fill("This reply concerns Thursday only.");
    await move("pick-0", "Monday");
    assert.match(await reply("pick-0").inputValue(), /before Monday/);
    assert.equal(await page.evaluate(() => window.__noteExecuted), undefined);
    const active = await downloadSheet("native-current-call-sheet.txt");
    assert.ok(active.includes("Monday 2026-12-28"));
    assert.ok(active.includes("before Monday"));
    assert.ok(!active.includes("Thursday only"));
    await move("pick-0", "");
    assert.equal(await card("pick-0").count(), 0);
    assert.ok(!(await downloadSheet("native-omitted-call-sheet.txt")).includes("before Monday"));
    await page.locator("#resetWeek").click();
    assert.match(await reply("pick-0").inputValue(), /before Monday/);
    assert.equal(planRequests, requestsBefore);
    await page.locator("#venueFollowup").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, "desktop.png") });
  });
  await group("invalid dates and different weeks do not relabel an existing reply", async () => {
    await date("");
    assert.equal(await page.locator("[data-contact-download]").isEnabled(), false);
    assert.equal(await page.locator("[data-contact-list]").isVisible(), false);
    await move("pick-0", "Thursday");
    await page.locator("#resetWeek").click();
    assert.equal(await page.locator("[data-contact-download]").isEnabled(), false);
    assert.equal(await page.locator("#printWeek").isEnabled(), false);
    await date("2027-01-04");
    assert.equal(await reply("pick-0").inputValue(), "");
    await date("2026-12-30");
    assert.match(await reply("pick-0").inputValue(), /before Monday/);
  });
  await group("native dietary unknown remains visible on screen and printed caregiver handoff", async () => {
    const mei = await nativeSample("mei");
    const unknownIndex = mei.plan.meals.findIndex((pick) => pick.why.includes("unknown"));
    assert.ok(unknownIndex >= 0);
    assert.equal(await reply("pick-0").inputValue(), "");
    const key = `pick-${unknownIndex}`;
    assert.match(await card(key).locator(".contact-explanation").innerText(), /unknown/);
    await reply(key).fill("No texture details received yet.\nAsk the venue before deciding.");
    await card(key).locator('[data-contact-field="status"]').selectOption("awaiting_reply");
    await page.emulateMedia({ media: "print" });
    assert.equal(await card(key).locator(".contact-edit").isVisible(), false);
    assert.equal(await card(key).locator(".contact-print-note").isVisible(), true);
    assert.match(await card(key).locator('[data-contact-print="reply"]').innerText(), /No texture details received yet/);
    assert.match(await card(key).locator(".contact-explanation").innerText(), /unknown/);
    await card(key).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, "print.png") });
    await page.emulateMedia({ media: "screen" });
    await page.setViewportSize({ width: 390, height: 844 });
    await card(key).scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(output, "phone.png") });
    assert.ok((await downloadSheet("native-unknown-call-sheet.txt")).includes(mei.plan.meals[unknownIndex].why));
  });
  await group("source invalidation and replacement retire notes; an empty native plan stays empty", async () => {
    await page.locator('#form [name="city"]').fill("No recorded fixture city");
    assert.equal(await page.locator("#results").isVisible(), false);
    assert.equal(await page.locator("[data-contact-key]").count(), 0);
    const received = page.waitForResponse((response) => response.url() === `${origin}/api/plan`);
    await page.locator('#form button[type="submit"]').click();
    const body = await (await received).json();
    result.nativeResponses.push({ id: "empty-city", body, sha256: sha(Buffer.from(JSON.stringify(body))) });
    await page.locator("#results").waitFor({ state: "visible" });
    assert.equal(body.plan.meals.length, 0);
    assert.equal(body.plan.outing, null);
    assert.equal(await page.locator("[data-contact-key]").count(), 0);
    assert.equal(await page.locator("[data-contact-download]").isEnabled(), false);
    await nativeSample("rosa");
    assert.equal(await reply("pick-0").inputValue(), "");
  });
  await group("authored duplicate-entity occurrences retain distinct notes and downloadable identity", async () => {
    const derived = structuredClone(rosa);
    derived.plan.meals = [structuredClone(rosa.plan.meals[0]), { ...structuredClone(rosa.plan.meals[0]), why: "Authored second occurrence for identity receiving." }];
    derived.plan.outing = null;
    result.derivedDuplicateFixture = { origin: "Two authored occurrences derived from the native Rosa response; not a fresh planner result.", body: derived };
    await page.route("**/api/plan/sample/rosa", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(derived) }));
    await page.locator("#sampleBtn").click();
    await page.waitForFunction(() => document.querySelectorAll("[data-contact-key]").length === 2);
    await reply("pick-0").fill("First visit's reply.");
    await reply("pick-1").fill("Second visit's reply.");
    const content = await downloadSheet("authored-duplicate-call-sheet.txt");
    assert.match(content, /Suggested visit 1;/);
    assert.match(content, /Suggested visit 2;/);
    assert.equal(content.split("First visit's reply.").length - 1, 1);
    assert.equal(content.split("Second visit's reply.").length - 1, 1);
    await page.reload();
    await page.waitForFunction(() => !document.querySelector("#sampleBtn").disabled);
    assert.equal(await page.locator("#venueFollowup").isVisible(), false);
    assert.equal(await page.locator("[data-contact-key]").count(), 0);
  });
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
