"use strict";

// Native-browser receiving of the composed UI. Static source and fixture inputs
// are pinned; all application HTTP requests stay on this isolated loopback server.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { chromium } = require(require.resolve("playwright", {
  paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || process.cwd()],
}));

const root = __dirname;
const source = path.resolve(process.argv[2] || path.join(root, "candidate"));
const output = path.resolve(process.argv[3] || path.join(root, "evidence", "author-browser-v1"));
const expectedApp = process.argv[4] || "faa47a7c5b71a5c12f004868e68b71df33d4486002b983943185c3d9928dd5e1";
const executable = process.env.TASTETABLE_CHROMIUM ||
  "/workspace/scratch/0c6c4d37eb0f/native-product-worker/browser-runtime/chromium";
const hash = (data) => crypto.createHash("sha256").update(data).digest("hex");
const clone = (data) => JSON.parse(JSON.stringify(data));
const nativeFile = path.join(root, "evidence", "native-responses.json");
const native = JSON.parse(fs.readFileSync(nativeFile, "utf8"));
const sourceManifest = () => Object.fromEntries(fs.readdirSync(path.join(source, "static")).sort()
  .filter((name) => /\.(?:m?js|html|css)$/.test(name))
  .map((name) => ["static/" + name, hash(fs.readFileSync(path.join(source, "static", name)))]));
const before = sourceManifest();
assert.equal(before["static/app.js"], expectedApp);
assert.equal(before["static/calendar.js"], "09dfe98a95da6c7fd0b7ee531c3ec4cf9ae5697dc730fab6cffdd07d8bd94b3b");
assert.equal(before["static/plan-request.js"], "b35d09ca6270cf6150bcc40501d2d6a6728aa592597bb8d3e49aa3ae26cdf995");
assert.equal(before["static/week_plan.mjs"], "e739adc10d9ae9ba1cb82c6d800c453e8f7bec53e343e0685adeabe98e6f4809");
assert(!fs.existsSync(output), "Use a new evidence directory");
fs.mkdirSync(output, { recursive: true });

const personas = [
  { id: "rosa", label: "Fictional Rosa fixture", cuisines: ["Cuban", "Mexican"], music: ["Celia Cruz"],
    films: ["West Side Story"], city: "Pasadena", constraints: ["soft_foods", "low_sodium", "wheelchair"] },
  { id: "harold", label: "Fictional Harold fixture", cuisines: ["Italian"], music: [], films: [],
    city: "Fixture city", constraints: ["wheelchair"] },
];
let pendingResponse = { body: native.rosa, status: 200, hold: false };
const held = [];
const requests = [];
const assets = {};
const errors = [];
const external = [];
const checkpoints = [];
const files = {};
const snapshots = {};
const fixtures = {};
let origin, browser, context, page;
let failure = null;

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://fixture.invalid");
    if (request.method === "POST" && url.pathname.startsWith("/api/plan")) {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      requests.push({ path: url.pathname, body: raw ? JSON.parse(raw) : null });
      const selected = clone(pendingResponse);
      const send = () => {
        if (response.destroyed) return;
        response.writeHead(selected.status, { "Content-Type": "application/json" });
        response.end(JSON.stringify(selected.body));
      };
      if (selected.hold) held.push(send);
      else send();
      return;
    }
    const json = url.pathname === "/api/health" ? { qloo_mode: "mock", ok: true }
      : url.pathname === "/api/personas" ? personas : null;
    if (json) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(json));
      return;
    }
    const file = url.pathname === "/" ? "static/index.html"
      : /^\/static\/[A-Za-z0-9_-]+\.(?:m?js|css)$/.test(url.pathname) ? url.pathname.slice(1) : null;
    if (!file || !fs.existsSync(path.join(source, file))) {
      response.writeHead(404); response.end(); return;
    }
    const bytes = fs.readFileSync(path.join(source, file));
    assets[file] = hash(bytes);
    response.writeHead(200, { "Content-Type": /\.m?js$/.test(file) ? "text/javascript"
      : file.endsWith(".css") ? "text/css" : "text/html" });
    response.end(bytes);
  } catch (error) {
    errors.push("Fixture server: " + error.message);
    response.writeHead(500); response.end();
  }
});

async function snapshot() {
  return page.evaluate(() => {
    const q = (id) => document.getElementById(id);
    return {
      resultsHidden: q("results").hidden,
      date: q("weekDate").value,
      dates: Array.from(document.querySelectorAll("#weekDays time"), (node) => node.dateTime),
      scheduled: Array.from(document.querySelectorAll("#weekDays .week-day")).flatMap((row) =>
        Array.from(row.querySelectorAll(".scheduled-pick"), (pick) => ({
          key: pick.querySelector("select").dataset.pickKey,
          day: row.dataset.day,
          date: row.querySelector("time").dateTime,
          name: pick.querySelector("h4").textContent,
          entityId: pick.querySelector(".mono").textContent.replace(/^Qloo id: /, ""),
        }))),
      omitted: Array.from(document.querySelectorAll("#omittedPicks select"), (node) => node.dataset.pickKey),
      original: Object.fromEntries(["plan", "notes", "baseline", "compare", "rejected", "trace"].map((id) => [id, q(id).innerHTML])),
      printDisabled: q("printWeek").disabled,
      downloadDisabled: q("calendarDownload").disabled,
      preview: Array.from(document.querySelectorAll("#calendarPreview li"), (node) => node.textContent),
      calendarStatus: q("calendarStatus").textContent,
      source: q("weekSource").textContent,
      weekError: q("weekError").textContent,
      status: q("requestStatus").textContent,
      blobCount: window.__reviewBlobCount,
      prints: window.__reviewPrints,
      openDays: document.querySelectorAll("#weekDays .open-day").length,
    };
  });
}

const decoded = (value) => value.replace(/\\([nN,;\\])/g, (_, c) => /[nN]/.test(c) ? "\n" : c);
function events(text) {
  assert(text.endsWith("\r\n"), "Calendar ends with CRLF");
  for (const line of text.split("\r\n")) assert(Buffer.byteLength(line) <= 75, "Calendar line exceeds native UTF-8 limit");
  const out = [];
  let event = null;
  for (const line of text.replace(/\r\n[ \t]/g, "").split("\r\n")) {
    if (line === "BEGIN:VEVENT") { assert.equal(event, null); event = {}; }
    else if (line === "END:VEVENT") { assert(event); out.push(event); event = null; }
    else if (event) {
      const at = line.indexOf(":");
      assert(at > 0);
      const key = line.slice(0, at);
      assert.equal(event[key], undefined);
      event[key] = line.slice(at + 1);
    }
  }
  assert.equal(event, null);
  return out;
}

async function download(label, payload) {
  const visible = await snapshot();
  assert.equal(visible.downloadDisabled, false);
  const [item] = await Promise.all([page.waitForEvent("download"), page.locator("#calendarDownload").click()]);
  const filename = path.join(output, label + ".ics");
  await item.saveAs(filename);
  const text = fs.readFileSync(filename, "utf8");
  const parsed = events(text);
  const original = [...payload.plan.meals, ...(payload.plan.outing ? [payload.plan.outing] : [])];
  assert.equal(parsed.length, visible.scheduled.length);
  assert.equal(new Set(parsed.map((event) => event.UID)).size, parsed.length);
  for (const scheduled of visible.scheduled) {
    const event = parsed.find((entry) => entry.UID.endsWith("-" + scheduled.key + "@tastetable.invalid"));
    assert(event, "No event for " + scheduled.key);
    const pick = original[Number(scheduled.key.slice(5))];
    assert.equal(event["DTSTART;VALUE=DATE"], scheduled.date.replace(/-/g, ""));
    const end = new Date(scheduled.date + "T00:00:00Z");
    end.setUTCDate(end.getUTCDate() + 1);
    assert.equal(event["DTEND;VALUE=DATE"], end.toISOString().slice(0, 10).replace(/-/g, ""));
    assert.equal(decoded(event.SUMMARY), (payload.mock ? "[DEMO] " : "") + "TasteTable suggestion: " + scheduled.name);
    const description = decoded(event.DESCRIPTION);
    assert(description.includes("Qloo entity ID: " + pick.entity_id));
    assert(description.includes("Why this suggestion: " + pick.why));
    assert(description.includes("Originally suggested for: " + pick.day + ". Arranged for: " + scheduled.day + " " + scheduled.date + "."));
    for (const note of payload.plan.notes) assert(description.includes("Plan note: " + note));
    assert.equal(event.STATUS, "TENTATIVE");
    assert.equal(event.TRANSP, "TRANSPARENT");
    assert.equal(event.CLASS, "PRIVATE");
  }
  for (const key of visible.omitted) assert(!parsed.some((event) => event.UID.endsWith("-" + key + "@tastetable.invalid")));
  assert.deepEqual(visible.preview, visible.scheduled.map((item) =>
    item.day + " " + item.date + " — " + item.name + " (all-day suggestion)"));
  files[label] = { path: path.basename(filename), suggestedFilename: item.suggestedFilename(),
    sha256: hash(text), events: parsed, visible };
  return { text, parsed };
}

async function accept(payload, label) {
  pendingResponse = { body: clone(payload), status: 200, hold: false };
  fixtures[label] = clone(payload);
  await page.locator("#sampleBtn").click();
  await page.waitForFunction(() => !document.getElementById("results").hidden &&
    document.getElementById("requestStatus").textContent === "Plan ready for the current inputs." &&
    document.getElementById("form").getAttribute("aria-busy") === "false");
}

async function check(label, action) {
  await action();
  snapshots[label] = await snapshot();
  checkpoints.push({ label, passed: true });
}

async function noDownloadGesture() {
  const count = await page.evaluate(() => window.__reviewBlobCount);
  await page.evaluate(() => document.getElementById("calendarDownload").dispatchEvent(new MouseEvent("click", { bubbles: true })));
  assert.equal(await page.evaluate(() => window.__reviewBlobCount), count);
}

async function run() {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = "http://127.0.0.1:" + server.address().port;
  try {
    browser = await chromium.launch({ executablePath: executable, headless: true,
      args: ["--no-sandbox", "--disable-background-networking", "--disable-component-update", "--disable-sync"] });
    context = await browser.newContext({ viewport: { width: 1280, height: 960 }, acceptDownloads: true, serviceWorkers: "block" });
    page = await context.newPage();
    page.setDefaultTimeout(7000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith(origin + "/") || /^(?:data:|blob:)/.test(url)) return route.continue();
      external.push(url);
      return route.abort();
    });
    await page.addInitScript(() => {
      const nativeCreate = URL.createObjectURL.bind(URL);
      window.__reviewBlobCount = 0;
      URL.createObjectURL = (blob) => { window.__reviewBlobCount++; return nativeCreate(blob); };
      window.__reviewPrints = [];
      window.print = () => window.__reviewPrints.push({
        names: Array.from(document.querySelectorAll("#weekDays h4"), (node) => node.textContent),
        dates: Array.from(document.querySelectorAll("#weekDays time"), (node) => node.dateTime),
      });
    });
    await page.goto(origin);
    await page.waitForFunction(() => document.getElementById("personaSel").options.length === 2);
    assert.equal(await page.locator('input[type="date"]').count(), 1, "One shared date control");

    let first;
    await check("native complete source exports its visible dated occurrences", async () => {
      await accept(native.rosa, "native-rosa");
      await page.locator("#weekDate").fill("2026-10-14");
      first = await download("native-original", native.rosa);
      assert.equal(first.parsed.length, 5);
      assert.equal(files["native-original"].suggestedFilename, "tastetable-demo-2026-10-12.ics");
      assert.deepEqual((await snapshot()).dates, ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
    });

    await check("moving and omitting changes the actual file while preserving original evidence and UIDs", async () => {
      const beforeEdit = await snapshot();
      const requestCount = requests.length;
      await page.locator('[data-pick-key="pick-0"]').selectOption("Wednesday");
      await page.locator('[data-pick-key="pick-2"]').selectOption("");
      const edited = await download("native-arranged", native.rosa);
      assert.equal(edited.parsed.length, 4);
      assert.equal(edited.parsed.filter((item) => item["DTSTART;VALUE=DATE"] === "20261014").length, 2);
      for (const event of edited.parsed) assert(first.parsed.some((old) => old.UID === event.UID));
      assert.deepEqual((await snapshot()).original, beforeEdit.original);
      assert.equal(requests.length, requestCount);
      await page.screenshot({ path: path.join(output, "arranged-desktop.png"), fullPage: true });
      await page.locator("#printWeek").click();
      const printed = (await snapshot()).prints.at(-1);
      assert.deepEqual(printed.names, (await snapshot()).scheduled.map((item) => item.name));
      await page.emulateMedia({ media: "print" });
      const printedVisibility = await page.evaluate(() => ({
        calendar: document.getElementById("calendarExport").getClientRects().length,
        form: document.querySelector(".taste-form").getClientRects().length,
        controls: document.querySelector(".week-controls").getClientRects().length,
      }));
      assert.deepEqual(printedVisibility, { calendar: 0, form: 0, controls: 0 });
      await page.pdf({ path: path.join(output, "arranged-week.pdf"), format: "A4", printBackground: true });
      try {
        const text = execFileSync("pdftotext", [path.join(output, "arranged-week.pdf"), "-"], { encoding: "utf8" });
        for (const item of (await snapshot()).scheduled) assert(text.includes(item.name));
        assert(text.includes("Not scheduled this week"));
        assert(text.includes("Not medical or dietary advice"));
        fs.writeFileSync(path.join(output, "arranged-week.txt"), text);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        files.printTextExtraction = { available: false, reason: "pdftotext not installed" };
      }
      await page.emulateMedia({ media: "screen" });
    });

    await check("invalid visible date stays closed through edits resets and direct handoff gestures", async () => {
      const printCount = (await snapshot()).prints.length;
      await page.locator("#weekDate").fill("");
      await page.locator('[data-pick-key="pick-0"]').selectOption("Tuesday");
      await page.locator("#resetWeek").click();
      let state = await snapshot();
      assert(state.printDisabled && state.downloadDisabled);
      assert.equal(state.preview.length, 0);
      await noDownloadGesture();
      await page.evaluate(() => document.getElementById("printWeek").dispatchEvent(new MouseEvent("click", { bubbles: true })));
      assert.equal((await snapshot()).prints.length, printCount);
      await page.locator("#weekDate").fill("2026-10-14");
      const restored = await download("native-restored", native.rosa);
      assert.equal(restored.text, first.text, "Same source/week restored to exact original bytes");
      await page.evaluate(() => { document.getElementById("weekDate").value = ""; });
      await noDownloadGesture();
      await page.locator("#printWeek").click();
      state = await snapshot();
      assert(state.printDisabled && state.downloadDisabled);
      assert.equal(state.prints.length, printCount);
      await page.locator("#weekDate").fill("2026-10-14");
    });

    await check("separate weeks receive separate identities and returning restores the current session week", async () => {
      await page.locator("#weekDate").fill("2026-12-31");
      const later = await download("year-boundary", native.rosa);
      assert.deepEqual((await snapshot()).dates, ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
      assert(later.parsed.every((item) => !first.parsed.some((old) => old.UID === item.UID)));
      await page.locator("#weekDate").fill("2026-10-14");
      assert.equal((await download("returned-week", native.rosa)).text, first.text);
    });

    await check("all omitted selections stay printable as open days without producing an empty calendar", async () => {
      for (const key of ["pick-0", "pick-1", "pick-2", "pick-3", "pick-4"]) await page.locator('[data-pick-key="' + key + '"]').selectOption("");
      const state = await snapshot();
      assert.equal(state.openDays, 7);
      assert.equal(state.preview.length, 0);
      assert(state.downloadDisabled && !state.printDisabled);
      await noDownloadGesture();
      await page.locator("#resetWeek").click();
    });

    await check("duplicate entity occurrences retain distinct same-day events and text remains literal", async () => {
      const duplicate = clone(native.rosa);
      const name = 'Fictional Café <img src=x onerror="window.__injected=true">, soup; 🌿';
      duplicate.plan.meals[0].name = name;
      duplicate.plan.meals[0].why += "\nLocal fixture text, with semicolon; and backslash\\.\nBEGIN:VEVENT";
      duplicate.plan.meals.push({ ...clone(duplicate.plan.meals[0]), day: "Tuesday" });
      duplicate.comparison.grounded.picks++;
      duplicate.comparison.grounded.with_qloo_entity_id++;
      duplicate.comparison.grounded.with_affinity_evidence++;
      duplicate.comparison.grounded.constraint_checked++;
      await accept(duplicate, "authored-duplicate-source");
      await page.locator('[data-pick-key="pick-0"]').selectOption("Wednesday");
      await page.locator('[data-pick-key="pick-4"]').selectOption("Wednesday");
      const file = await download("duplicate-occurrences", duplicate);
      const repeated = file.parsed.filter((item) => decoded(item.SUMMARY).endsWith(name));
      assert.equal(repeated.length, 2);
      assert.equal(new Set(repeated.map((item) => item.UID)).size, 2);
      assert(repeated.every((item) => item["DTSTART;VALUE=DATE"] === "20261014"));
      assert(file.parsed.every((item) => !first.parsed.some((old) => old.UID === item.UID)));
      assert.equal(await page.locator("#results img").count(), 0);
      assert.equal(await page.evaluate(() => Boolean(window.__injected)), false);
    });

    await check("partial empty and unknown-source responses retire previous exports without inventing events", async () => {
      const partial = clone(native.rosa);
      partial.plan.meals = partial.plan.meals.slice(0, 2);
      partial.plan.outing = null;
      partial.plan.notes = ["Authored partial-response fixture; unavailable slots remain open."];
      for (const key of ["picks", "with_qloo_entity_id", "with_affinity_evidence", "constraint_checked"]) partial.comparison.grounded[key] = 2;
      await accept(partial, "authored-partial");
      assert.equal((await download("partial", partial)).parsed.length, 2);
      const unknown = clone(partial); delete unknown.mock;
      await accept(unknown, "authored-unknown-source");
      assert((await snapshot()).downloadDisabled);
      assert.match((await snapshot()).calendarStatus, /did not specify its data source/);
      await page.locator('[data-pick-key="pick-0"]').selectOption("Thursday");
      await page.locator("#resetWeek").click();
      await noDownloadGesture();
      const empty = clone(partial);
      empty.plan.meals = [];
      for (const key of ["picks", "with_qloo_entity_id", "with_affinity_evidence", "constraint_checked"]) empty.comparison.grounded[key] = 0;
      await accept(empty, "authored-empty");
      assert.equal((await snapshot()).openDays, 7);
      assert.equal((await snapshot()).preview.length, 0);
      assert((await snapshot()).downloadDisabled);
      await noDownloadGesture();
    });

    await check("malformed replacements retire both handoffs and staged evidence remains coherent before recovery", async () => {
      for (const field of ["notes", "trace"]) {
        await accept(native.rosa, "recovery-before-" + field);
        await page.locator('[data-pick-key="pick-0"]').selectOption("Thursday");
        const prior = await snapshot();
        const malformed = clone(native.harold);
        if (field === "notes") malformed.plan.notes = null;
        else malformed.trace = null;
        fixtures["malformed-" + field] = malformed;
        pendingResponse = { body: malformed, status: 200, hold: false };
        await page.locator("#sampleBtn").click();
        await page.waitForFunction(() => document.getElementById("requestStatus").textContent.startsWith("We could not prepare this plan."));
        const failed = await snapshot();
        assert(failed.resultsHidden && failed.printDisabled && failed.downloadDisabled);
        assert.deepEqual(failed.original, prior.original);
        assert.equal(failed.date, prior.date);
        await noDownloadGesture();
        await accept(native.harold, "recovery-after-" + field);
        await download("recovered-" + field, native.harold);
      }
    });

    await check("form edits failures and stopped requests retire exports while preserving a usable next request", async () => {
      const chosenDate = (await snapshot()).date;
      await page.locator('[name="city"]').fill("Authored edited city");
      let state = await snapshot();
      assert(state.resultsHidden && state.printDisabled && state.downloadDisabled);
      assert.equal(state.date, chosenDate);
      pendingResponse = { body: { detail: "Authored service failure" }, status: 503, hold: false };
      await page.locator('#form button[type="submit"]').click();
      await page.waitForFunction(() => document.getElementById("requestStatus").textContent.includes("Authored service failure"));
      state = await snapshot();
      assert(state.resultsHidden && state.printDisabled && state.downloadDisabled);
      assert.equal(await page.locator('[name="city"]').inputValue(), "Authored edited city");
      pendingResponse = { body: clone(native.rosa), status: 200, hold: true };
      await page.locator('#form button[type="submit"]').click();
      await page.locator("#cancelPlan").waitFor({ state: "visible" });
      await page.locator("#cancelPlan").click();
      for (const release of held.splice(0)) release();
      state = await snapshot();
      assert(state.resultsHidden && state.printDisabled && state.downloadDisabled);
      assert.match(state.status, /Stopped waiting/);
      await accept(native.rosa, "fresh-after-cancel");
      await download("fresh-after-cancel", native.rosa);
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(output, "composed-mobile.png"), fullPage: true });
    });

    assert.deepEqual(assets, before, "Browser served every exact declared static source");
    assert.deepEqual(sourceManifest(), before, "Review changed production source");
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
  } catch (error) {
    failure = { name: error.name, message: error.message, stack: error.stack };
    if (page) {
      try { await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }); } catch {}
    }
  } finally {
    const report = {
      executor: "universal-0df473646168/estate_product",
      sourceBase: "69a8098292da12d4d960118cae072a5885ff5171",
      source, sourceBefore: before, sourceAfter: sourceManifest(), servedAssets: assets,
      verifierSha256: hash(fs.readFileSync(__filename)), nativeFixtureSha256: hash(fs.readFileSync(nativeFile)),
      checkedAt: new Date().toISOString(), node: process.version, chromium: browser?.version() || null,
      checkpoints, snapshots, files, fixtures, requests, errors, external, failure,
      passed: !failure && errors.length === 0 && external.length === 0,
      limits: ["Static composed UI with native recorded and explicitly authored fixture responses.",
        "No backend, provider, calendar-account, installed service, physical printer or calendar import is exercised.",
        "window.print is observed with a gesture spy; actual Chromium print media and an exported PDF are checked separately.",
        "Independent request-owner authored browser history is recorded in its own unchanged-driver receipt."],
    };
    fs.writeFileSync(path.join(output, "receipt.json"), JSON.stringify(report, null, 2) + "\n");
    if (browser) await browser.close();
    for (const release of held.splice(0)) release();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    console.log(JSON.stringify({ passed: report.passed, completed: checkpoints.length, failure,
      receipt: path.join(output, "receipt.json") }, null, 2));
    if (!report.passed) process.exitCode = 1;
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; server.closeAllConnections(); server.close(); });
