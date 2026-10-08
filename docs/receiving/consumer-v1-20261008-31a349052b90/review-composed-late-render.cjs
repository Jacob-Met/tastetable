"use strict";
// Receiving-only driver. It serves the owner's pinned source unchanged.
// All HTTP plan bodies are authored fixtures; no app/controller/fetch hook is replaced.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { fixture, cases, personas, DAYS } = require("./fixtures.cjs");
const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
const digest = data => crypto.createHash("sha256").update(data).digest("hex");
function listFiles(root, relative = "") {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap(entry => {
    const name = relative ? relative + "/" + entry.name : entry.name;
    return entry.isDirectory() ? listFiles(root, name) : [name];
  }).sort();
}
function readPin(root, filename) {
  const pin = JSON.parse(fs.readFileSync(filename, "utf8"));
  if (pin.ownerFreeze) {
    assert.equal(pin.ownerCommit ?? null, null, "An unpublished freeze must not claim a Git commit");
    assert.match(pin.ownerManifestSha256 || "", /^[0-9a-f]{64}$/, "Resolve the owner's literal manifest SHA256");
    assert.ok(pin.ownerManifestFile, "Supply the frozen owner manifest");
    const manifestBytes = fs.readFileSync(path.resolve(path.dirname(filename), pin.ownerManifestFile));
    assert.equal(digest(manifestBytes), pin.ownerManifestSha256, "Owner freeze manifest changed");
    const manifest = JSON.parse(manifestBytes);
    assert.equal(manifest.revision, pin.ownerFreeze, "Owner freeze identity mismatch");
    for (const item of manifest.files) {
      const bytes = fs.readFileSync(path.join(root, item.path));
      assert.equal(bytes.length, item.after.bytes, "Owner frozen file length changed: " + item.path);
      assert.equal(digest(bytes), item.after.sha256, "Owner frozen file SHA256 changed: " + item.path);
      assert.equal(crypto.createHash("sha1").update("blob " + bytes.length + "\0").update(bytes).digest("hex"), item.after.git_blob,
        "Owner frozen Git blob changed: " + item.path);
    }
  } else {
    assert.match(pin.ownerCommit || "", /^[0-9a-f]{40}$/, "A real frozen owner commit is required");
  }
  const selectors = pin.selectors;
  for (const name of ["download", "requestStatus", "form", "sample", "source"]) {
    assert.ok(typeof selectors?.[name] === "string" && selectors[name] && !selectors[name].includes("REPLACE"), "Resolve owner selector: " + name);
  }
  const actual = listFiles(path.join(root, "static")).map(name => "static/" + name);
  assert.deepEqual(Object.keys(pin.sourcePins || {}).sort(), actual, "Pin every static source file");
  for (const filename of actual) {
    assert.match(pin.sourcePins[filename] || "", /^[0-9a-f]{64}$/, "Resolve source SHA256: " + filename);
    assert.equal(digest(fs.readFileSync(path.join(root, filename))), pin.sourcePins[filename], "Frozen source changed: " + filename);
  }
  const published = JSON.parse(fs.readFileSync(path.join(__dirname, "published-modules.json"), "utf8"));
  for (const item of published.files) assert.equal(pin.sourcePins[item.path], item.sha256, "Changed producer needs a separate receiving decision: " + item.path);
  return pin;
}
function unescapeText(value) { return value.replace(/\\([nN,;\\])/g, (_match, c) => c.toLowerCase() === "n" ? "\n" : c); }
function calendarEvents(text) {
  return [...text.replace(/\r\n[ \t]/g, "").matchAll(/BEGIN:VEVENT\r\n([\s\S]*?)\r\nEND:VEVENT/g)].map(match => {
    const lines = match[1].split("\r\n");
    const field = key => { const line = lines.find(line => line.startsWith(key + ":")); assert.ok(line, "Missing calendar field " + key); return line.slice(key.length + 1); };
    return { uid: field("UID"), start: field("DTSTART;VALUE=DATE"), end: field("DTEND;VALUE=DATE"),
      summary: unescapeText(field("SUMMARY")), description: unescapeText(field("DESCRIPTION")), status: field("STATUS") };
  });
}
async function main() {
  const root = path.resolve(arg("--root") || "");
  assert.ok(arg("--root") && arg("--pin"), "Supply --root and an owner-resolved --pin");
  const pin = readPin(root, arg("--pin"));
  if (process.argv.includes("--check-pin")) { console.log("PIN VERIFIED " + (pin.ownerFreeze || pin.ownerCommit)); return; }
  assert.ok(arg("--output") && arg("--chromium"), "Supply new --output and existing --chromium");
  const output = path.resolve(arg("--output"));
  assert.ok(!output.startsWith(root + path.sep), "Evidence must be outside product source");
  fs.mkdirSync(output, { recursive: false });
  const playwright = arg("--playwright") ? require(path.resolve(arg("--playwright")))
    : require(require.resolve("playwright", { paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || process.cwd()] }));
  const report = { kind: "frozen composed late-render browser receiving", ownerCommit: pin.ownerCommit ?? null,
    ownerFreeze: pin.ownerFreeze ?? null, ownerManifestSha256: pin.ownerManifestSha256 ?? null, sourcePins: pin.sourcePins,
    harnessSha256: digest(fs.readFileSync(__filename)), fixtureSha256: digest(fs.readFileSync(path.join(__dirname, "fixtures.cjs"))),
    fixtureOrigin: "Authored local responses; not native backend/provider results", cases: [], apiRequests: [], pageErrors: [], externalRequests: [], downloads: [], cleanup: [] };
  fs.writeFileSync(path.join(output, "authored-fixtures.json"), JSON.stringify({ personas, cases: cases() }, null, 2) + "\n");
  const queued = [];
  let context, page, profile, server, origin, active = fixture("Initial");
  const selectors = pin.selectors;
  const snapshot = () => page.evaluate(s => {
    const byId = id => document.getElementById(id);
    return {
      hidden: byId("results").hidden, date: byId("weekDate").value,
      dates: [...document.querySelectorAll("#weekDays time")].map(t => t.dateTime),
      assignments: [...document.querySelectorAll("#weekOrganizer select[data-pick-key]")].map(select => ({ key: select.dataset.pickKey, day: select.value })),
      printDisabled: byId("printWeek").disabled, downloadDisabled: document.querySelector(s.download).disabled,
      source: document.querySelector(s.source).textContent,
      status: document.querySelector(s.requestStatus).textContent,
      busy: document.querySelector(s.form).getAttribute("aria-busy"),
      fragments: Object.fromEntries(["plan", "notes", "compare", "baseline", "rejected", "trace", "weekDays", "omittedPicks"].map(id => [id, byId(id).innerHTML])),
    };
  }, selectors);
  const show = async data => {
    queued.push(data);
    const response = page.waitForResponse(r => new URL(r.url()).pathname.startsWith("/api/plan") && r.request().method() === "POST", { timeout: 7000 });
    await page.locator(selectors.sample).click();
    await (await response).finished();
    await page.waitForFunction(selector => document.querySelector(selector).getAttribute("aria-busy") !== "true", selectors.form, { timeout: 7000 });
  };
  const checkCalendar = async label => {
    const state = await snapshot();
    assert.equal(state.hidden, false, label + ": accepted result is hidden");
    assert.equal(state.dates.length, 7);
    assert.equal(state.dates[0], "2026-12-28", label + ": chosen week was lost");
    const sourcePicks = [...active.plan.meals, ...(active.plan.outing ? [active.plan.outing] : [])];
    const expected = state.assignments.filter(a => a.day).map(a => ({ ...sourcePicks[Number(a.key.slice(5))], key: a.key, day: a.day, date: state.dates[DAYS.indexOf(a.day)] }));
    assert.equal(state.assignments.length, sourcePicks.length);
    assert.equal(state.downloadDisabled, expected.length === 0);
    if (!expected.length) return [];
    const waiting = page.waitForEvent("download", { timeout: 5000 });
    await page.locator(selectors.download).click();
    const download = await waiting;
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);
    const events = calendarEvents(bytes.toString("utf8"));
    assert.equal(events.length, expected.length, label + ": stale or missing calendar occurrences");
    assert.equal(new Set(events.map(e => e.uid)).size, events.length);
    for (const item of expected) {
      const event = events.find(e => e.uid.endsWith("-20261228-" + item.key + "@tastetable.invalid"));
      assert.ok(event, label + ": missing occurrence " + item.key);
      assert.equal(event.start, item.date.replaceAll("-", ""));
      const next = new Date(item.date + "T12:00:00Z"); next.setUTCDate(next.getUTCDate() + 1);
      assert.equal(event.end, next.toISOString().slice(0, 10).replaceAll("-", ""));
      assert.equal(event.summary, (active.mock ? "[DEMO] " : "") + "TasteTable suggestion: " + item.name);
      assert.ok(event.description.includes("Qloo entity ID: " + item.entity_id));
      assert.ok(event.description.includes("Why this suggestion: " + item.why));
      assert.ok(event.description.includes("Originally suggested for: " + sourcePicks[Number(item.key.slice(5))].day));
      assert.equal(event.status, "TENTATIVE");
    }
    const filename = label.replace(/[^a-zA-Z0-9_-]/g, "_") + ".ics";
    fs.writeFileSync(path.join(output, filename), bytes);
    report.downloads.push({ label, filename, sha256: digest(bytes), suggestedFilename: download.suggestedFilename(), events });
    await download.delete();
    return events.map(e => e.uid);
  };
  try {
    server = http.createServer(async (req, res) => {
      const route = new URL(req.url, "http://fixture.invalid").pathname;
      const json = data => { res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(data)); };
      if (route === "/api/health") return json({ qloo_mode: "mock" });
      if (route === "/api/personas") return json(personas);
      if (req.method === "POST" && route.startsWith("/api/plan")) {
        let body = ""; for await (const chunk of req) body += chunk;
        report.apiRequests.push({ route, body: body ? JSON.parse(body) : null });
        if (!queued.length) {
          report.unexpectedPlanRequest = true;
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ detail: "Unexpected recommendation request from local editing" }));
          return;
        }
        return json(queued.shift());
      }
      const relative = route === "/" ? "static/index.html" : route.slice(1);
      if (!Object.hasOwn(pin.sourcePins, relative)) { res.writeHead(404); res.end(); return; }
      const type = /\.(m?js)$/.test(relative) ? "text/javascript" : relative.endsWith(".css") ? "text/css" : "text/html";
      res.writeHead(200, { "Content-Type": type + "; charset=utf-8" });
      res.end(fs.readFileSync(path.join(root, relative)));
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    origin = "http://127.0.0.1:" + server.address().port;
    profile = fs.mkdtempSync(path.join(output, "chromium-profile-"));
    context = await playwright.chromium.launchPersistentContext(profile, {
      executablePath: arg("--chromium"), headless: true, acceptDownloads: true, serviceWorkers: "block",
      viewport: { width: 1200, height: 950 }, downloadsPath: path.join(profile, "downloads"),
      args: ["--disable-gpu", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"],
    });
    report.browser = context.browser().version();
    page = await context.newPage();
    page.on("pageerror", error => report.pageErrors.push(error.message));
    await page.route("**/*", route => {
      const url = route.request().url();
      if (url.startsWith(origin + "/")) return route.continue();
      report.externalRequests.push(url); return route.abort("blockedbyclient");
    });
    await page.goto(origin);
    await page.waitForFunction(() => document.querySelector("#personaSel").options.length > 0);
    for (const [index, item] of cases().entries()) {
      const record = { field: item.field };
      report.cases.push(record);
      try {
        active = item.stable;
        await show(active);
        await page.locator("#weekDate").fill("2026-12-30");
        for (const key of ["pick-0", "pick-2", "pick-7"]) await page.locator('[data-pick-key="' + key + '"]').selectOption("Thursday");
        await page.locator('[data-pick-key="pick-1"]').selectOption("");
        record.before = await snapshot();
        const oldIds = await checkCalendar("case-" + index + "-before");
        assert.equal(record.before.hidden, false);
        await show(item.malformed);
        record.rejected = await snapshot();
        assert.equal(record.rejected.hidden, true, item.field + ": rejected response left visible source/arrangement state");
        assert.equal(record.rejected.printDisabled, true, item.field + ": print was not retired");
        assert.equal(record.rejected.downloadDisabled, true, item.field + ": export was not retired");
        assert.equal(record.rejected.date, record.before.date, item.field + ": chosen-week preference changed on error");
        assert.ok(record.rejected.status.trim(), item.field + ": current failure has no status");
        assert.equal(await page.locator(selectors.requestStatus).isVisible(), true, item.field + ": failure status is hidden");
        active = item.recovery;
        await show(active);
        record.recovered = await snapshot();
        assert.equal(record.recovered.hidden, false);
        assert.equal(record.recovered.assignments.length, active.plan.meals.length + Number(active.plan.outing !== null));
        const expectedDays = [...active.plan.meals, ...(active.plan.outing ? [active.plan.outing] : [])].map((p, i) => ({ key: "pick-" + i, day: p.day }));
        assert.deepEqual(record.recovered.assignments.slice().sort((a,b) => a.key.localeCompare(b.key)), expectedDays);
        assert.ok(record.recovered.fragments.plan.includes("Recovered-" + index));
        assert.ok(!record.recovered.fragments.plan.includes("Stable-" + index));
        const freshIds = await checkCalendar("case-" + index + "-recovered");
        assert.ok(freshIds.every(id => !oldIds.includes(id)), "A newly accepted source reused the retired export session");
        const requests = report.apiRequests.length;
        await page.locator('[data-pick-key="pick-0"]').selectOption("Saturday");
        const movedIds = await checkCalendar("case-" + index + "-moved");
        assert.deepEqual(movedIds.slice().sort(), freshIds.slice().sort(), "Local move changed current source identity");
        await page.locator("#resetWeek").click();
        const resetIds = await checkCalendar("case-" + index + "-reset");
        assert.deepEqual(resetIds.slice().sort(), freshIds.slice().sort(), "Reset changed current source identity");
        assert.equal(report.apiRequests.length, requests, "Local recovery edit/reset requested another plan");
        record.status = "passed"; console.log("PASS " + item.field);
      } catch (error) { record.status = "failed"; record.error = error.stack || String(error); console.error("FAIL " + item.field + ": " + error.message); }
    }
    assert.notEqual(report.unexpectedPlanRequest, true, "Local editing issued an unexpected plan request");
    assert.deepEqual(report.pageErrors, [], "Unhandled browser errors");
    assert.deepEqual(report.externalRequests, [], "External page request attempted");
    assert.equal(report.cases.filter(c => c.status === "failed").length, 0, "Inspect failed composed render histories");
    report.status = "passed";
  } catch (error) { report.status = "failed"; report.error = error.stack || String(error); process.exitCode = 1; }
  finally {
    try { if (context) await context.close(); report.cleanup.push("browser closed"); } catch(error) { report.cleanup.push(String(error)); report.status = "failed"; process.exitCode = 1; }
    try { if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } report.cleanup.push("server closed"); } catch(error) { report.cleanup.push(String(error)); report.status = "failed"; process.exitCode = 1; }
    if (profile) fs.rmSync(profile, { recursive: true, force: true });
    fs.writeFileSync(path.join(output, "composed-late-render-report.json"), JSON.stringify(report, null, 2) + "\n");
  }
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
