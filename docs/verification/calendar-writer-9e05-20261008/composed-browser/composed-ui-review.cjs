"use strict";

// External-source browser receiver. The supplied product is served unchanged.
// This file does not implement, inject or patch an app/controller/calendar API.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { parseArgs } = require("node:util");

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileHash = (filename) => sha256(fs.readFileSync(filename));
const readJSON = (filename) => JSON.parse(fs.readFileSync(filename, "utf8"));
const clone = (value) => structuredClone(value);
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function argumentsForRun() {
  const { values } = parseArgs({ options: {
    root: { type: "string" }, fixtures: { type: "string" }, config: { type: "string" },
    pin: { type: "string" }, artifacts: { type: "string" },
    playwright: { type: "string" }, chromium: { type: "string" },
    "pin-only": { type: "boolean", default: false },
  }, allowPositionals: false });
  for (const key of ["root", "fixtures", "config", "pin"]) {
    assert.ok(values[key] && path.isAbsolute(values[key]), `--${key} requires an absolute path`);
  }
  if (!values["pin-only"]) {
    for (const key of ["artifacts", "playwright", "chromium"]) {
      assert.ok(values[key] && path.isAbsolute(values[key]), `--${key} requires an explicit existing absolute path`);
    }
  }
  return values;
}

function staticFiles(root) {
  const found = [];
  function walk(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, item.name);
      assert.ok(!item.isSymbolicLink(), `Refusing a symlink inside supplied static source: ${absolute}`);
      if (item.isDirectory()) walk(absolute);
      else if (item.isFile()) found.push(path.relative(root, absolute).split(path.sep).join("/"));
    }
  }
  walk(path.join(root, "static"));
  assert.ok(found.includes("static/index.html"), "The supplied source needs its actual static/index.html");
  return found.sort();
}

function validateInputs(args) {
  const config = readJSON(args.config);
  const fixtures = readJSON(args.fixtures);
  assert.equal(config.schema, "tastetable-composed-browser-config.v1");
  assert.equal(fixtures.passed, true, "The native fixture capture must have a successful receipt");
  assert.ok(fixtures.results && Array.isArray(fixtures.personas) && Array.isArray(fixtures.imports),
    "Fixture bundle requires results, personas and source-hashed imports");
  assert.ok(fixtures.imports.length >= 4, "Fixture capture must pin its actual backend imports");
  for (const key of ["primary", "secondary", "partial", "outingOnly", "empty"]) {
    const response = fixtures.results[config.cases[key]];
    assert.ok(response?.plan && Array.isArray(response.plan.meals), `Missing native fixture: ${key}`);
    assert.equal(response.mock, true, `Native fixture ${key} must explicitly be synthetic`);
  }
  assert.ok(fixtures.results[config.cases.primary].plan.meals.length >= 2,
    "The primary native fixture needs two restaurant picks for co-scheduling");
  assert.equal(fixtures.results[config.cases.empty].plan.meals.length, 0);
  assert.equal(fixtures.results[config.cases.empty].plan.outing, null);
  for (const key of ["persona", "sample", "week", "reset", "dayRows", "organizer", "download", "results", "status", "form", "abandonInput"]) {
    assert.equal(typeof config.selectors[key], "string", `Concrete selector required: ${key}`);
    assert.ok(config.selectors[key].trim(), `Empty selector: ${key}`);
  }
  for (const [key, value] of Object.entries(config.selectors)) {
    assert.ok(!String(value).includes("REPLACE_WITH_"), `Resolve the frozen source's actual ${key} selector before pinning`);
  }
  assert.equal(typeof config.lifecycle.requireCancel, "boolean");
  if (config.lifecycle.requireCancel) assert.ok(config.selectors.cancel, "Required cancellation needs its actual selector");
  for (const key of ["pending", "failure", "cancel"]) {
    assert.ok(["hide", "hold"].includes(config.lifecycle[key]), `Declare the source owner's ${key} visibility policy`);
  }
  const hashes = {};
  const actualStatic = staticFiles(args.root);
  for (const relative of ["static/calendar.js", "static/week_plan.mjs", "static/plan-request.js"]) {
    assert.ok(actualStatic.includes(relative), `The external composed source has not supplied ${relative}`);
  }
  for (const relative of actualStatic) hashes[relative] = fileHash(path.join(args.root, relative));
  for (const imported of fixtures.imports) {
    assert.equal(typeof imported.module, "string");
    assert.match(imported.module, /^[A-Za-z_][A-Za-z0-9_]*$/);
    assert.match(imported.sha256, /^[a-f0-9]{64}$/);
    const relative = imported.relative_path || imported.module + ".py";
    assert.match(relative, /^[A-Za-z_][A-Za-z0-9_]*\.py$/, "Backend import needs a direct source path");
    const actual = fileHash(path.join(args.root, relative));
    assert.equal(actual, imported.sha256, `Fixture/source mismatch for ${relative}`);
    hashes[relative] = actual;
  }
  assert.ok(Array.isArray(fixtures.fixture_files) && fixtures.fixture_files.length, "Fixture capture must pin its fixture data files");
  for (const fixture of fixtures.fixture_files) {
    assert.match(fixture.relative_path, /^fixtures\/[A-Za-z0-9_-]+\.json$/);
    const actual = fileHash(path.join(args.root, fixture.relative_path));
    assert.equal(actual, fixture.sha256, "Fixture data file differs from source capture");
    hashes[fixture.relative_path] = actual;
  }
  return { config, fixtures, pin: {
    schema: "tastetable-composed-browser-input-pin.v1",
    source_sha256: hashes,
    fixture_bundle_sha256: fileHash(args.fixtures),
    config_sha256: fileHash(args.config),
    harness_sha256: fileHash(__filename),
  } };
}

function parseEvents(text) {
  const unfolded = text.replace(/\r\n[ \t]/g, "");
  return [...unfolded.matchAll(/BEGIN:VEVENT\r\n([\s\S]*?)END:VEVENT\r\n/g)].map((match) => {
    const fields = {};
    for (const line of match[1].split("\r\n").filter(Boolean)) {
      const colon = line.indexOf(":");
      assert.ok(colon > 0, "Calendar field has no separator");
      const name = line.slice(0, colon).split(";")[0];
      assert.ok(!Object.hasOwn(fields, name), `Duplicate event field: ${name}`);
      fields[name] = line.slice(colon + 1).replace(/\\([nN,;\\])/g, (_, c) => /[nN]/.test(c) ? "\n" : c);
    }
    return fields;
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function deadline(promise, label, milliseconds = 12000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out awaiting ${label}`)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

async function main() {
  const args = argumentsForRun();
  const inputs = validateInputs(args);
  if (args["pin-only"]) {
    assert.ok(!fs.existsSync(args.pin), "Refusing to overwrite an existing freeze pin");
    fs.writeFileSync(args.pin, JSON.stringify(inputs.pin, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ mode: "pin-only", browser_executed: false, pin: args.pin, source_files: Object.keys(inputs.pin.source_sha256).length }));
    return;
  }
  assert.deepEqual(readJSON(args.pin), inputs.pin, "External source, fixture, selector contract or harness changed after freeze");
  assert.ok(!fs.existsSync(args.artifacts), "A new artifact directory is required to preserve earlier results");
  const relativeArtifacts = path.relative(args.root, args.artifacts);
  assert.ok(relativeArtifacts.startsWith(".." + path.sep) || path.isAbsolute(relativeArtifacts), "Artifacts must be outside product source");
  assert.ok(fs.statSync(args.chromium).isFile(), "An existing Chromium executable is required");
  const { chromium } = require(args.playwright);
  assert.ok(chromium, "The supplied existing module must expose Chromium");
  fs.mkdirSync(args.artifacts, { recursive: true });

  const { config, fixtures } = inputs;
  const selectors = config.selectors;
  const report = {
    schema: "tastetable-composed-native-browser-review.v1", started_at: new Date().toISOString(),
    root: args.root, input_pin: inputs.pin, node: process.version,
    platform: process.platform, architecture: process.arch,
    browser_executable: args.chromium, playwright_module: args.playwright,
    source_or_page_script_modified: false, upstream_provider_calls: false,
    browser_profile: "Fresh Playwright browser and context; no existing session",
    request_reader_method: "Actual app fetch and JSON reader over streamed loopback HTTP; no fetch or reader override",
    checks: [], request_history: [], checkpoints: [], downloads: [],
    page_errors: [], dialogs: [], browser_requests: [], response_mutations: [],
    pending_requirements: [], failure: null,
  };
  let server, browser, context, page, origin;
  let scenario = "setup", requestSerial = 0;
  const queue = [], jobs = [], sockets = new Set();
  const history = (type, detail = {}) => report.request_history.push({ sequence: report.request_history.length + 1, at: new Date().toISOString(), scenario, type, ...detail });
  const source = (key) => clone(fixtures.results[config.cases[key]]);
  const primary = source("primary"), secondary = source("secondary");

  function enqueue(label, response, mode = "immediate", status = 200) {
    const job = { label, response, mode, status, received: deferred(), prefix: deferred(), browserHeaders: deferred(), release: deferred(), settled: deferred() };
    if (mode === "immediate") job.release.resolve();
    queue.push(job); jobs.push(job);
    return job;
  }

  async function handle(request, response) {
    const route = new URL(request.url, "http://127.0.0.1").pathname;
    request.resume();
    const json = (value, status = 200) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(value)); };
    if (request.method === "GET" && route === "/api/health") return json({ ok: true, qloo_mode: "mock" });
    if (request.method === "GET" && route === "/api/personas") return json(fixtures.personas);
    if (request.method === "POST" && (route === "/api/plan" || route.startsWith("/api/plan/sample/"))) {
      const job = queue.shift();
      if (!job) { history("unexpected_plan_request", { route }); return json({ detail: "No fixture scheduled for this request" }, 409); }
      job.id = ++requestSerial;
      history("request_received", { id: job.id, label: job.label, route, delivery: job.mode });
      response.once("finish", () => { history("response_finished", { id: job.id }); job.settled.resolve(); });
      response.once("close", () => { history("response_closed", { id: job.id, fully_written: response.writableFinished }); job.settled.resolve(); });
      response.on("error", (error) => history("response_stream_error", { id: job.id, error: error.message }));
      job.received.resolve();
      const bytes = Buffer.from(JSON.stringify(job.response));
      if (job.mode === "headers") {
        history("headers_held", { id: job.id });
        await job.release.promise;
      }
      if (response.destroyed) { history("release_after_client_close", { id: job.id }); job.prefix.resolve(); return; }
      response.writeHead(job.status, { "Content-Type": "application/json", "Cache-Control": "no-store", "Content-Length": bytes.length, "X-TasteTable-QA-Request": String(job.id) });
      response.flushHeaders();
      if (job.mode === "body") {
        const boundary = Math.min(bytes.length - 1, Math.max(1, Math.floor(bytes.length / 2)));
        response.write(bytes.subarray(0, boundary));
        history("json_prefix_sent_reader_pending", { id: job.id, prefix_bytes: boundary, total_bytes: bytes.length });
        job.prefix.resolve();
        await job.release.promise;
        history("json_tail_released", { id: job.id, client_closed: response.destroyed });
        if (!response.destroyed) response.end(bytes.subarray(boundary));
      } else {
        job.prefix.resolve();
        response.end(bytes);
      }
      return;
    }
    const relative = route === "/" ? "static/index.html" : route.replace(/^\//, "");
    if (request.method === "GET" && relative.startsWith("static/") && Object.hasOwn(inputs.pin.source_sha256, relative)) {
      const type = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" }[path.extname(relative)] || "application/octet-stream";
      response.writeHead(200, { "Content-Type": type + "; charset=utf-8", "Cache-Control": "no-store" });
      response.end(fs.readFileSync(path.join(args.root, relative)));
      return;
    }
    response.writeHead(404); response.end("Not found");
  }

  async function snapshot(label) {
    const value = await page.evaluate((s) => {
      const node = (selector) => selector ? document.querySelector(selector) : null;
      const visible = (element) => Boolean(element && !element.hidden && element.getClientRects().length);
      const button = node(s.download);
      return {
        week_input: node(s.week)?.value,
        form_busy: node(s.form)?.getAttribute("aria-busy"),
        results_visible: visible(node(s.results)),
        download_exists: Boolean(button), download_disabled: button?.disabled ?? true,
        download_visible: visible(button), status: node(s.status)?.textContent,
        source: node(s.source)?.textContent,
        rows: [...document.querySelectorAll(s.dayRows)].map((row) => ({
          day: row.getAttribute("data-day"), date: row.querySelector("time")?.getAttribute("datetime"),
          keys: [...row.querySelectorAll("select[data-pick-key]")].map((select) => ({ key: select.dataset.pickKey, selected: select.value })),
        })),
      };
    }, selectors);
    const record = { label, scenario, at: new Date().toISOString(), ...value };
    report.checkpoints.push(record);
    return record;
  }

  async function settleRendering() {
    await deadline(page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))), "render opportunity after native response delivery");
  }

  async function waitForReceived(job) {
    await deadline(job.received.promise, `actual UI submission of ${job.label}`);
  }

  async function clickPlan(job, persona = config.primaryPersona) {
    await page.locator(selectors.persona).selectOption(persona);
    await page.locator(selectors.sample).click();
    await waitForReceived(job);
  }

  async function waitDisplayed(response) {
    const name = response.plan.meals[0]?.name || response.plan.outing?.name;
    if (name) {
      await page.waitForFunction(({ organizer, name, form, results }) => {
        const result = document.querySelector(results);
        return result && !result.hidden && document.querySelector(form)?.getAttribute("aria-busy") !== "true"
          && document.querySelector(organizer)?.textContent.includes(name);
      }, { organizer: selectors.organizer, name, form: selectors.form, results: selectors.results });
    } else {
      await page.waitForFunction((s) => {
        const results = document.querySelector(s.results);
        return results && !results.hidden && document.querySelector(s.form)?.getAttribute("aria-busy") !== "true"
          && !document.querySelector(`${s.organizer} select[data-pick-key]`);
      }, selectors);
    }
    await settleRendering();
  }

  async function show(label, response, persona) {
    const job = enqueue(label, response);
    await clickPlan(job, persona);
    await deadline(job.settled.promise, `${job.label} response completion`);
    await waitDisplayed(response);
    return job;
  }

  async function disabled(label) {
    const state = await snapshot(label);
    assert.equal(state.download_disabled, true, `${label}: old calendar action is still enabled`);
  }

  async function lifecycleHeld(label, policy) {
    const state = await snapshot(label);
    assert.equal(state.download_disabled, true, `${label}: calendar action remains enabled`);
    if (policy === "hide") assert.equal(state.results_visible, false, `${label}: source lifecycle requires old results hidden`);
  }

  async function download(label) {
    const beforeRequests = requestSerial;
    const pending = page.waitForEvent("download", { timeout: 12000 });
    await page.locator(selectors.download).click();
    const event = await pending;
    const destination = path.join(args.artifacts, `${report.downloads.length + 1}-${label}.ics`);
    await event.saveAs(destination);
    const bytes = fs.readFileSync(destination);
    const result = { label, filename: event.suggestedFilename(), path: destination, sha256: sha256(bytes), bytes: bytes.length, events: parseEvents(bytes.toString("utf8")) };
    assert.equal(requestSerial, beforeRequests, "Downloading the arranged week must not ask for another plan");
    report.downloads.push(result);
    return result;
  }

  async function agreesWithScreen(label, response) {
    const screen = await snapshot(label + "-screen");
    assert.equal(screen.results_visible, true);
    assert.equal(screen.rows.length, 7);
    assert.deepEqual(screen.rows.map(({ day }) => day), DAYS);
    assert.equal(screen.download_disabled, false);
    const original = [...response.plan.meals, ...(response.plan.outing ? [response.plan.outing] : [])];
    const expected = screen.rows.flatMap((row) => row.keys.map(({ key, selected }) => {
      assert.equal(selected, row.day);
      const match = /^pick-(\d+)$/.exec(key);
      assert.ok(match, "Screen uses an unknown occurrence key contract");
      const pick = original[Number(match[1])];
      assert.ok(pick, "Screen contains a pick absent from the accepted native response");
      return { key, date: row.date.replaceAll("-", ""), pick };
    }));
    const file = await download(label);
    assert.equal(file.events.length, expected.length);
    assert.equal(new Set(file.events.map(({ UID }) => UID)).size, expected.length);
    assert.ok(file.filename.endsWith(screen.rows[0].date + ".ics"));
    const actual = file.events.map((event) => ({ date: event.DTSTART, name: event.SUMMARY.replace(/^\[DEMO\] /, "").replace(/^TasteTable suggestion: /, "") })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const wanted = expected.map(({ date, pick }) => ({ date, name: pick.name })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    assert.deepEqual(actual, wanted, "Actual download disagrees with the currently displayed arranged week");
    for (const { pick } of expected) {
      const event = file.events.find(({ SUMMARY }) => SUMMARY.endsWith(pick.name));
      assert.ok(event.DESCRIPTION.includes(pick.entity_id));
      assert.ok(event.DESCRIPTION.includes(pick.why));
      for (const note of response.plan.notes) assert.ok(event.DESCRIPTION.includes(note));
      assert.equal(event.STATUS, "TENTATIVE");
      if (response.mock) assert.match(event.DESCRIPTION, /synthetic|fictional/i);
    }
    return file;
  }

  async function check(name, action) {
    scenario = name;
    await action();
    report.checks.push({ name, passed: true });
    console.log(JSON.stringify({ checkpoint: name, passed: true }));
  }

  async function delayedSupersession(mode) {
    await show(`seed-${mode}`, primary);
    await page.locator(selectors.week).fill("2026-10-08");
    const old = enqueue(`older-native-${mode}`, primary, mode);
    await clickPlan(old);
    if (mode === "body") {
      await deadline(old.prefix.promise, "actual JSON prefix delivery");
      await deadline(old.browserHeaders.promise, "native browser receipt of response headers");
      await settleRendering();
      history("review_observed_native_reader_window", { id: old.id });
    }
    await lifecycleHeld(`older-${mode}-pending`, config.lifecycle.pending);
    const newer = enqueue(`newer-native-${mode}`, secondary);
    await clickPlan(newer, config.secondaryPersona);
    await deadline(newer.settled.promise, "newer native response completion");
    await waitDisplayed(secondary);
    const beforeRelease = await agreesWithScreen(`newer-before-${mode}-release`, secondary);
    history("review_releases_older_request", { id: old.id, after_newer: newer.id });
    old.release.resolve();
    await deadline(old.settled.promise, "released older native response completion");
    await settleRendering();
    const afterRelease = await agreesWithScreen(`newer-after-${mode}-release`, secondary);
    assert.equal(afterRelease.sha256, beforeRelease.sha256, "An older response or reader replaced the accepted export");
  }

  try {
    server = http.createServer((request, response) => { handle(request, response).catch((error) => { history("server_error", { error: error.message }); if (!response.headersSent) response.writeHead(500); response.end(); }); });
    server.on("connection", (socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
    await deadline(new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); }), "owned loopback server start");
    origin = "http://127.0.0.1:" + server.address().port;
    report.loopback_origin = origin;
    browser = await chromium.launch({ executablePath: args.chromium, headless: true, chromiumSandbox: true,
      args: ["--disable-background-networking", "--disable-component-update"] });
    report.browser_version = browser.version();
    report.playwright_version = readJSON(path.join(args.playwright, "package.json")).version;
    context = await browser.newContext({ viewport: { width: 1280, height: 1100 }, acceptDownloads: true, serviceWorkers: "block" });
    await context.route("**/*", (route) => route.request().url().startsWith(origin + "/") ? route.continue() : route.abort());
    page = await context.newPage();
    page.setDefaultTimeout(12000);
    page.on("pageerror", (error) => report.page_errors.push({ scenario, message: error.message }));
    page.on("dialog", async (dialog) => { report.dialogs.push({ scenario, message: dialog.message() }); await dialog.dismiss(); });
    page.on("response", (response) => {
      if (!response.url().includes("/api/plan")) return;
      const id = Number(response.headers()["x-tastetable-qa-request"]);
      report.browser_requests.push({ scenario, event: "headers_received", id, url: response.url(), at: new Date().toISOString() });
      jobs.find((job) => job.id === id)?.browserHeaders.resolve();
    });
    page.on("requestfinished", (request) => { if (request.url().includes("/api/plan")) report.browser_requests.push({ scenario, event: "finished", url: request.url(), at: new Date().toISOString() }); });
    page.on("requestfailed", (request) => { if (request.url().includes("/api/plan")) report.browser_requests.push({ scenario, event: "failed", url: request.url(), failure: request.failure(), at: new Date().toISOString() }); });

    await check("real_composed_source_and_first_native_plan", async () => {
      await page.goto(origin, { waitUntil: "networkidle" });
      await page.waitForFunction((selector) => document.querySelector(selector)?.options.length > 1, selectors.persona);
      await show("first-native-plan", primary);
      await page.locator(selectors.week).fill("2026-10-08");
      assert.equal(await page.locator('input[type="date"]').evaluateAll((nodes) => nodes.filter((node) => !node.hidden && node.getClientRects().length).length), 1,
        "The combined flow must expose one authoritative week picker");
      await agreesWithScreen("initial-week", primary);
    });

    let sameWeekFile;
    await check("moved_and_co_scheduled_picks_match_actual_download", async () => {
      const before = requestSerial;
      await page.locator(`${selectors.organizer} select[data-pick-key="pick-0"]`).selectOption("Wednesday");
      await page.locator(`${selectors.organizer} select[data-pick-key="pick-1"]`).selectOption("Wednesday");
      const screen = await snapshot("two-restaurants-wednesday");
      assert.ok(screen.rows[2].keys.some(({ key }) => key === "pick-0"));
      assert.ok(screen.rows[2].keys.some(({ key }) => key === "pick-1"));
      sameWeekFile = await agreesWithScreen("co-scheduled", primary);
      assert.equal(requestSerial, before);
    });

    await check("invalid_date_stays_disabled_after_move_and_reset_until_corrected", async () => {
      await page.locator(selectors.week).fill("");
      await disabled("invalid-date");
      await page.locator(`${selectors.organizer} select[data-pick-key="pick-0"]`).selectOption("Friday");
      await disabled("invalid-date-after-move");
      await page.locator(selectors.reset).click();
      await disabled("invalid-date-after-reset");
      await page.locator(selectors.week).fill("2026-10-08");
      const restored = await agreesWithScreen("valid-date-restored", primary);
      const priorByName = new Map(sameWeekFile.events.map((event) => [event.SUMMARY, event.UID]));
      for (const event of restored.events) assert.equal(event.UID, priorByName.get(event.SUMMARY));
      sameWeekFile = restored;
    });

    await check("off_week_and_restore_preserve_pick_identity", async () => {
      await page.locator(`${selectors.organizer} select[data-pick-key="pick-0"]`).selectOption("");
      const omitted = await agreesWithScreen("one-pick-off-week", primary);
      assert.equal(omitted.events.length, sameWeekFile.events.length - 1);
      assert.ok(!omitted.events.some(({ SUMMARY }) => SUMMARY.endsWith(primary.plan.meals[0].name)));
      for (let index = 1; index < sameWeekFile.events.length; index++) {
        await page.locator(`${selectors.organizer} select[data-pick-key="pick-${index}"]`).selectOption("");
      }
      await disabled("all-picks-off-week");
      await page.locator(selectors.reset).click();
      const reset = await agreesWithScreen("off-week-reset", primary);
      assert.equal(reset.sha256, sameWeekFile.sha256);
    });

    await check("one_visible_week_controls_dates_and_distinct_occurrence_uids", async () => {
      await page.locator(selectors.week).fill("2027-01-01");
      const next = await agreesWithScreen("next-selected-week", primary);
      assert.ok(next.filename.endsWith("2026-12-28.ics"));
      const previous = new Set(sameWeekFile.events.map(({ UID }) => UID));
      for (const event of next.events) assert.ok(!previous.has(event.UID));
      await page.locator(selectors.reset).click();
      assert.equal((await agreesWithScreen("reset-same-selected-week", primary)).sha256, next.sha256);
      await page.locator(selectors.week).fill("2026-10-08");
      assert.equal((await agreesWithScreen("return-original-week", primary)).sha256, sameWeekFile.sha256);
    });

    await check("native_partial_and_empty_responses_replace_old_occurrences", async () => {
      for (const key of ["partial", "outingOnly"]) {
        const partial = source(key);
        await show(`native-${key}`, partial);
        const file = await agreesWithScreen(`native-${key}`, partial);
        assert.equal(file.events.length, partial.plan.meals.length + (partial.plan.outing ? 1 : 0));
      }
      await show("native-empty", source("empty"));
      await disabled("native-empty");
    });

    await check("unknown_source_and_partial_render_failure_cannot_keep_old_export", async () => {
      await show("restore-before-unknown", primary);
      const unknown = clone(secondary); delete unknown.mock;
      report.response_mutations.push({ scenario, basis: config.cases.secondary, changes: "Removed response.mock to test missing provenance" });
      const unknownJob = enqueue("unknown-provenance", unknown);
      await clickPlan(unknownJob, config.secondaryPersona);
      await deadline(unknownJob.settled.promise, "unknown provenance response completion");
      await settleRendering();
      await disabled("unknown-source");
      await show("restore-before-partial-render", primary);
      const malformed = clone(secondary); malformed.plan.notes = null;
      report.response_mutations.push({ scenario, basis: config.cases.secondary, changes: "Set plan.notes=null to reproduce a late native render error" });
      const malformedJob = enqueue("malformed-partial-render", malformed);
      await clickPlan(malformedJob, config.secondaryPersona);
      await deadline(malformedJob.settled.promise, "malformed replacement response completion");
      await settleRendering();
      await disabled("malformed-partial-render");
      await show("restore-after-malformed", primary);
      await agreesWithScreen("recovered-after-malformed", primary);
    });

    await check("older_request_released_after_newer_native_plan_is_inert", () => delayedSupersession("headers"));
    await check("older_native_json_reader_released_after_newer_plan_is_inert", () => delayedSupersession("body"));

    await check("older_reader_settlement_cannot_release_a_newer_pending_calendar", async () => {
      await show("seed-overlapping-current-inputs", primary);
      const older = enqueue("older-same-input-reader", primary, "body");
      await clickPlan(older);
      await deadline(older.prefix.promise, "older same-input JSON prefix delivery");
      await deadline(older.browserHeaders.promise, "older same-input browser header receipt");
      await settleRendering();
      const newer = enqueue("newer-same-input-request", primary, "headers");
      // Repeat the actual request button without changing the persona first.
      // This reaches run() supersession directly instead of the separate input
      // invalidation callback, and both responses match that native persona.
      await page.locator(selectors.sample).click();
      await waitForReceived(newer);
      older.release.resolve();
      await deadline(older.settled.promise, "older same-input reader settlement");
      await settleRendering();
      await lifecycleHeld("older-reader-settled-newer-still-pending", config.lifecycle.pending);
      const pendingState = await snapshot("newer-busy-after-older-settlement");
      assert.equal(pendingState.form_busy, "true", "An old finally callback released the newer request's busy state");
      newer.release.resolve();
      await deadline(newer.settled.promise, "newer same-input completion");
      await waitDisplayed(primary);
      await agreesWithScreen("newer-same-input-accepted", primary);
    });

    if (config.selectors.cancel) {
      await check("explicit_cancel_holds_calendar_after_native_reader_completion", async () => {
        await show("seed-cancel", primary);
        const pending = enqueue("cancelled-native-reader", secondary, "body");
        await clickPlan(pending, config.secondaryPersona);
        await deadline(pending.prefix.promise, "cancellable native JSON prefix delivery");
        await deadline(pending.browserHeaders.promise, "native browser receipt before explicit cancellation");
        await settleRendering();
        await lifecycleHeld("reader-before-cancel", config.lifecycle.pending);
        await page.locator(selectors.cancel).click();
        await lifecycleHeld("reader-cancelled", config.lifecycle.cancel);
        history("review_releases_cancelled_reader", { id: pending.id });
        pending.release.resolve();
        await deadline(pending.settled.promise, "cancelled native reader completion");
        await settleRendering();
        await lifecycleHeld("cancelled-reader-after-release", config.lifecycle.cancel);
        await show("new-source-after-cancel", primary);
        await agreesWithScreen("new-source-after-cancel", primary);
      });
    } else {
      report.pending_requirements.push("Explicit cancellation selector was not supplied; this run cannot qualify that lifecycle action.");
    }

    await check("current_input_change_holds_calendar_after_native_reader_completion", async () => {
      await show("seed-input-reset", primary);
      const pending = enqueue("input-abandoned-native-reader", secondary, "body");
      await clickPlan(pending, config.secondaryPersona);
      await deadline(pending.prefix.promise, "input-abandoned native JSON prefix delivery");
      await deadline(pending.browserHeaders.promise, "native browser receipt before input change");
      await settleRendering();
      await page.locator(selectors.abandonInput).fill("Changed while the native response body is pending");
      await lifecycleHeld("native-reader-inputs-changed", config.lifecycle.cancel);
      history("review_releases_input_abandoned_reader", { id: pending.id });
      pending.release.resolve();
      await deadline(pending.settled.promise, "input-abandoned native reader completion");
      await settleRendering();
      await lifecycleHeld("input-abandoned-reader-after-release", config.lifecycle.cancel);
    });

    await check("failed_native_request_cannot_leave_calendar_for_unaccepted_source", async () => {
      const job = enqueue("deliberate-http-failure", { detail: "Deliberate local fixture failure" }, "immediate", 503);
      await clickPlan(job);
      await deadline(job.settled.promise, "failed response completion");
      await settleRendering();
      await lifecycleHeld("request-failed", config.lifecycle.failure);
      await show("final-accepted-source", secondary, config.secondaryPersona);
      await agreesWithScreen("final-accepted-source", secondary);
    });

    await check("mobile_receiving_view_and_unexpected_script_errors", async () => {
      assert.deepEqual(report.page_errors, []);
      await page.setViewportSize({ width: 390, height: 844 });
      await settleRendering();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(args.artifacts, "composed-calendar-mobile.png"), fullPage: true });
      await page.setViewportSize({ width: 1280, height: 1100 });
      await page.locator(selectors.organizer).screenshot({ path: path.join(args.artifacts, "composed-week-desktop.png") });
    });
  } catch (error) {
    report.failure = { scenario, name: error.name, message: error.message, stack: error.stack };
    if (page) {
      try { await snapshot("failure-state"); await page.screenshot({ path: path.join(args.artifacts, "failure.png"), fullPage: true }); }
      catch (captureError) { report.failure.capture_error = captureError.message; }
    }
  } finally {
    for (const job of jobs) job.release.resolve();
    report.cleanup = [];
    for (const [resource, close] of [
      ["context", context && (() => context.close())],
      ["browser", browser && (() => browser.close())],
      ["loopback_server", server && (() => {
        for (const socket of sockets) socket.destroy();
        return new Promise((resolve) => server.close(resolve));
      })],
    ]) {
      if (!close) continue;
      try { await deadline(close(), `cleanup of ${resource}`); report.cleanup.push({ resource, closed: true }); }
      catch (error) { report.cleanup.push({ resource, closed: false, error: error.message }); }
    }
    try {
      report.source_unchanged = JSON.stringify(validateInputs(args).pin) === JSON.stringify(inputs.pin);
    } catch (error) { report.source_unchanged = false; report.source_check_error = error.message; }
    report.finished_at = new Date().toISOString();
    report.passed = !report.failure && report.source_unchanged && report.cleanup.every(({ closed }) => closed) && (!config.lifecycle.requireCancel || !report.pending_requirements.length);
    fs.writeFileSync(path.join(args.artifacts, "composed-ui-result.json"), JSON.stringify(report, null, 2) + "\n");
  }
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failure: report.failure, pending_requirements: report.pending_requirements, artifact_directory: args.artifacts }));
  process.exitCode = report.passed ? 0 : 1;
}

if (require.main === module) main().catch((error) => { console.error(error.stack); process.exitCode = 1; });
module.exports = { validateInputs, parseEvents, staticFiles };
