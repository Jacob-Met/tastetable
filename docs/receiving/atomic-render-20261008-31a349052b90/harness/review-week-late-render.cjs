"use strict";

// Independent browser receiving checks. All plan responses below are authored
// fixtures; every browser HTTP request outside the isolated origin is blocked.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { chromium } = require(require.resolve("playwright", {
  paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || process.cwd()],
}));

const option = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const root = path.resolve(option("--root", path.join(__dirname, "organizer-snapshot")));
const output = path.resolve(option("--output", path.join(__dirname, "evidence")));
const executable = option("--browser", "/workspace/scratch/0c6c4d37eb0f/native-product-worker/browser-runtime/chromium");
const malformedProbe = true;
const requireCalendar = process.argv.includes("--require-calendar");
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
fs.mkdirSync(output, { recursive: true });

function fixture(label, mealDays = DAYS, outingDay = "Saturday") {
  const meals = mealDays.map((day, index) => ({
    day, kind: "restaurant", entity_id: index === 2 ? `${label}-meal-0` : `${label}-meal-${index}`,
    name: `${label} restaurant ${day}`, affinity: 0.61 + index / 100,
    why: `Authored original explanation for ${label} meal occurrence ${index}.`, fallback: index === 1,
  }));
  const outing = outingDay === null ? null : {
    day: outingDay, kind: "outing", entity_id: `${label}-outing`, name: `${label} cultural outing`,
    affinity: 0.75, why: `Authored original explanation for ${label} outing.`, fallback: false,
  };
  const count = meals.length + Number(outing !== null);
  return {
    mock: true,
    plan: { meals, outing, notes: [`${label}: authored fixture; no provider or venue lookup occurred.`], rejected: [] },
    llm_only: {
      meals: [{ day: "Monday", name: `${label} unverified comparison meal`, why: "Comparison fixture only." }],
      outing: { day: "Sunday", name: `${label} unverified comparison outing`, why: "Comparison fixture only." },
    },
    comparison: {
      constraints: ["wheelchair"],
      grounded: { picks: count, with_qloo_entity_id: count, with_affinity_evidence: count, constraint_checked: count, unsafe_candidates_rejected: 0 },
      llm_only: { picks: 2 },
    },
    trace: [{ tool: "authored_fixture", args: {}, result_summary: "No external calls." }],
  };
}

const initial = fixture("Initial");
const personas = [{ id: "authored", label: "Authored fictional browser fixture", city: "Fixture city", cuisines: ["Fixture cuisine"], music: [], films: [], constraints: ["wheelchair"] }];
let activeFixture = initial;
let defaultResponse = initial;
const queued = [];
const timers = new Set();
const report = {
  kind: malformedProbe ? "supplemental staged-render failure controls" : "independent organizer browser receiving checks",
  sourceRoot: root, sourceFiles: {}, fixtureOrigin: "authored locally; no native provider call",
  harnessSha256: crypto.createHash("sha256").update(fs.readFileSync(__filename)).digest("hex"),
  browser: null, checks: [], apiRequests: [], externalRequestsBlocked: [], pageErrors: [],
  calendarCoherence: requireCalendar ? "required" : "not qualified: frozen organizer has no composed calendar seam",
};
for (const name of fs.readdirSync(path.join(root, "static"))) {
  const p = path.join(root, "static", name);
  if (fs.statSync(p).isFile()) report.sourceFiles[`static/${name}`] = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}
fs.writeFileSync(path.join(output, "authored-fixture.json"), JSON.stringify({ initial, personas }, null, 2) + "\n");

const server = http.createServer(async (req, res) => {
  const route = new URL(req.url, "http://fixture.invalid").pathname;
  const json = (value, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(value));
  };
  if (route === "/api/health") return json({ qloo_mode: "mock" });
  if (route === "/api/personas") return json(personas);
  if (req.method === "POST" && (route === "/api/plan" || route.startsWith("/api/plan/sample/"))) {
    let body = "";
    for await (const chunk of req) body += chunk;
    report.apiRequests.push({ path: route, body: body ? JSON.parse(body) : null });
    const reply = queued.shift() || { data: defaultResponse };
    const finish = () => json(reply.error ? { detail: reply.error } : reply.data, reply.error ? 503 : 200);
    if (reply.delay) {
      const timer = setTimeout(() => { timers.delete(timer); finish(); }, reply.delay);
      timers.add(timer);
    } else finish();
    return;
  }
  const filename = route === "/" ? "index.html" : route.startsWith("/static/") ? route.slice(8) : "";
  if (!filename || !/^[a-zA-Z0-9_.-]+$/.test(filename)) { res.writeHead(404); return res.end(); }
  const file = path.join(root, "static", filename);
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  const mime = /\.(m?js)$/.test(filename) ? "text/javascript" : filename.endsWith(".css") ? "text/css" : "text/html";
  res.writeHead(200, { "Content-Type": mime + "; charset=utf-8" });
  res.end(fs.readFileSync(file));
});

let context;
let profile;
let page;
let expectedMonday = "2026-10-12";
const snapshot = () => page.evaluate(() => ({
  visible: !document.querySelector("#results").hidden,
  dateInput: document.querySelector("#weekDate").value,
  dateInvalid: document.querySelector("#weekDate").getAttribute("aria-invalid"),
  printDisabled: document.querySelector("#printWeek").disabled,
  omittedHidden: document.querySelector("#omittedSection").hidden,
  weekText: Object.fromEntries(["weekTitle", "weekRange", "weekConstraints", "weekStatus", "weekError"].map((id) => [id, document.getElementById(id).textContent])),
  weekHtml: Object.fromEntries(["weekDays", "omittedPicks"].map((id) => [id, document.getElementById(id).innerHTML])),
  assignments: [...document.querySelectorAll("#weekOrganizer select[data-pick-key]")].map((s) => ({ key: s.dataset.pickKey, day: s.value, row: s.closest(".week-day")?.dataset.day ?? null })),
  dates: [...document.querySelectorAll("#weekDays time")].map((t) => t.dateTime),
  names: [...document.querySelectorAll("#weekDays h4")].map((n) => n.textContent),
  omitted: document.querySelectorAll("#omittedPicks .scheduled-pick").length,
  summary: document.querySelector("#weekSummary").textContent,
  source: document.querySelector("#weekSource").textContent,
  original: Object.fromEntries(["plan", "notes", "compare", "baseline", "rejected", "trace", "weekNotes"].map((id) => [id, document.getElementById(id).innerHTML])),
}));
const picks = () => [...activeFixture.plan.meals, ...(activeFixture.plan.outing ? [activeFixture.plan.outing] : [])];
const asMap = (state) => Object.fromEntries(state.assignments.map(({ key, day }) => [key, day]));
const dateForDay = (day) => {
  const date = new Date(expectedMonday + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + DAYS.indexOf(day));
  return date.toISOString().slice(0, 10);
};

async function calendarCoherent() {
  if (!requireCalendar) return;
  assert.equal(await page.locator("#calendarPreview").count(), 1, "composed calendar preview is absent");
  const state = await snapshot();
  const expected = state.assignments.filter((a) => a.day).map((a) => ({
    ...picks()[Number(a.key.slice(5))], day: a.day, date: dateForDay(a.day),
  }));
  const preview = await page.locator("#calendarPreview li").allTextContents();
  assert.deepEqual(preview.slice().sort(), expected.map((p) => `${p.day} ${p.date} — ${p.name} (all-day suggestion)`).sort());
  assert.equal(await page.locator("#calendarDownload").isDisabled(), expected.length === 0);
  if (!expected.length) return;
  const waiting = page.waitForEvent("download", { timeout: 3000 });
  await page.locator("#calendarDownload").click();
  const download = await waiting;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").replace(/\r\n[ \t]/g, "");
  const events = [...text.matchAll(/BEGIN:VEVENT\r\n([\s\S]*?)\r\nEND:VEVENT/g)].map((match) => match[1]);
  assert.equal(events.length, expected.length);
  const uids = events.map((event) => /^UID:(.+)$/m.exec(event)?.[1]);
  assert.equal(new Set(uids).size, expected.length, "co-scheduled occurrences share a calendar UID");
  for (const p of expected) {
    assert.ok(events.some((event) => event.includes("DTSTART;VALUE=DATE:" + p.date.replaceAll("-", "")) && event.includes("Qloo entity ID: " + p.entity_id) && event.includes("Why this suggestion: " + p.why)), JSON.stringify(p));
  }
  await download.delete();
}

async function show(data) {
  activeFixture = data;
  queued.push({ data });
  const waiting = page.waitForResponse((r) => r.url().includes("/api/plan/sample/"));
  await page.locator("#sampleBtn").click();
  await (await waiting).finished();
  await page.waitForFunction(() => !document.querySelector("#results").hasAttribute("aria-busy"));
}

async function check(name, fn) {
  await fn();
  report.checks.push({ name, status: "passed" });
  console.log("PASS " + name);
}

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  profile = fs.mkdtempSync(path.join(output, "chromium-profile-"));
  context = await chromium.launchPersistentContext(profile, {
    executablePath: executable, headless: true, acceptDownloads: true,
    viewport: { width: 1200, height: 950 }, locale: "en-US", serviceWorkers: "block",
    downloadsPath: path.join(profile, "downloads"),
    args: ["--disable-gpu", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--no-first-run"],
  });
  report.browser = context.browser().version();
  page = await context.newPage();
  page.on("pageerror", (error) => report.pageErrors.push(error.message));
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(origin + "/")) return route.continue();
    report.externalRequestsBlocked.push(url);
    return route.abort("blockedbyclient");
  });
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelector("#personaSel").options.length > 0);
  await show(initial);
  await page.locator("#weekDate").fill(expectedMonday);
  const first = await snapshot();
  assert.equal(first.assignments.length, 8);

  const cases = [
    { field: "trace = null", mutate: (r) => { r.trace = null; } },
    { field: 'comparison.constraints = "wheelchair"', mutate: (r) => { r.comparison.constraints = "wheelchair"; } },
    { field: 'comparison.constraints = {0: "wheelchair", length: 1}', mutate: (r) => { r.comparison.constraints = { 0: "wheelchair", length: 1 }; } },
    { field: "llm_only.meals = null", mutate: (r) => { r.llm_only.meals = null; } },
    { field: "llm_only.outing = null", mutate: (r) => { r.llm_only.outing = null; } },
    { field: 'plan.meals[0].affinity = "0.90"', mutate: (r) => { r.plan.meals[0].affinity = "0.90"; } },
    { field: "plan.rejected[0].failed = null", mutate: (r) => { r.plan.rejected = [{ name: "Authored rejected candidate", failed: null }]; } },
  ];
  report.cases = [];
  for (const [index, item] of cases.entries()) {
    const stable = fixture(`Stable-${index}`);
    // Deliberately label the old response differently from the incoming fixture.
    // Both remain authored local test data; no live provider is contacted.
    stable.mock = false;
    await show(stable);
    await page.locator("#weekDate").fill("2026-12-30");
    expectedMonday = "2026-12-28";
    await page.locator('[data-pick-key="pick-0"]').selectOption("Thursday");
    await page.locator('[data-pick-key="pick-1"]').selectOption("");
    await page.locator('[data-pick-key="pick-7"]').selectOption("Thursday");
    const before = await snapshot();
    assert.equal(before.visible, true);
    assert.equal(before.dateInput, "2026-12-30");
    assert.equal(before.dates[0], expectedMonday);
    assert.match(before.source, /returned by Qloo/);
    const malformed = fixture(`Incoming-${index}`);
    item.mutate(malformed);
    const record = { field: item.field, fixture: malformed, before };
    report.cases.push(record);
    try {
      await show(malformed);
      const after = await snapshot();
      record.after = after;
      record.requestStatus = await page.locator("#requestStatus").textContent();
      assert.match(record.requestStatus, /Could not prepare a new plan/);
      assert.deepEqual(after, before, "a rejected render changed the displayed plan, edited assignments, date, source, or controls");
      const requestCount = report.apiRequests.length;
      await page.locator('[data-pick-key="pick-0"]').selectOption("Tuesday");
      const editable = await snapshot();
      assert.deepEqual(asMap(editable), { ...asMap(before), "pick-0": "Tuesday" });
      assert.deepEqual(editable.original, before.original);
      assert.deepEqual(editable.dates, before.dates);
      assert.equal(editable.dateInput, before.dateInput);
      assert.equal(editable.source, before.source);
      assert.equal(report.apiRequests.length, requestCount, "editing the preserved plan sent a new request");
      record.editAfterFailure = editable;
      const recovery = fixture(`Recovered-${index}`, ["Monday", "Friday"], null);
      await show(recovery);
      const recovered = await snapshot();
      record.recovered = recovered;
      assert.match(await page.locator("#requestStatus").textContent(), /Suggestions ready/);
      assert.deepEqual(asMap(recovered), { "pick-0": "Monday", "pick-1": "Friday" });
      assert.equal(recovered.omitted, 0);
      assert.equal(recovered.dateInput, before.dateInput);
      assert.deepEqual(recovered.dates, before.dates);
      assert.match(recovered.source, /Demo plan/);
      assert.ok(recovered.names.every((name) => name.startsWith(`Recovered-${index}`)));
      assert.ok(recovered.original.plan.includes(`Recovered-${index}`));
      assert.ok(!recovered.original.plan.includes(`Stable-${index}`));
      await page.locator('[data-pick-key="pick-0"]').selectOption("Saturday");
      assert.equal(asMap(await snapshot())["pick-0"], "Saturday");
      record.status = "passed";
      report.checks.push({ name: item.field + ": atomic rejection, preserved edits, and successful recovery", status: "passed" });
      console.log("PASS " + item.field);
    } catch (error) {
      record.status = "failed";
      record.error = error.stack || String(error);
      report.checks.push({ name: item.field, status: "failed", error: record.error });
      console.error("FAIL " + item.field + ": " + error.message);
    }
  }
  assert.deepEqual(report.pageErrors, [], "browser emitted an unhandled page error");
  assert.deepEqual(report.externalRequestsBlocked, [], "page attempted an external request");
  assert.equal(report.cases.filter((item) => item.status === "failed").length, 0, "one or more render controls failed; inspect per-case evidence");
  report.status = "passed";
})().catch(async (error) => {
  report.status = "failed";
  report.error = error.stack || String(error);
  if (page) {
    try { report.finalSnapshot = await snapshot(); } catch { /* Preserve the first failure. */ }
  }
  console.error(report.error);
  process.exitCode = 1;
}).finally(async () => {
  if (context) await context.close();
  for (const timer of timers) clearTimeout(timer);
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  if (profile) fs.rmSync(profile, { recursive: true, force: true });
  const target = path.join(output, "late-render-report.json");
  fs.writeFileSync(target, JSON.stringify(report, null, 2) + "\n");
  console.log(report.status.toUpperCase() + ": report written to " + target);
});
