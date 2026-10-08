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
const malformedProbe = process.argv.includes("--probe-malformed");
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
  kind: malformedProbe ? "malformed-success atomic-render probe" : "independent organizer browser receiving checks",
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

  if (malformedProbe) {
    await page.locator('[data-pick-key="pick-0"]').selectOption("Thursday");
    const before = await snapshot();
    const malformed = fixture("Incoming");
    malformed.plan.notes = null;
    await show(malformed);
    const after = await snapshot();
    report.counterexample = { malformedField: "plan.notes = null", before, after, status: await page.locator("#requestStatus").textContent() };
    assert.match(report.counterexample.status, /Could not prepare a new plan/);
    if (after.visible) {
      assert.deepEqual(after.assignments, before.assignments, "existing edited schedule changed on a rejected render");
      assert.deepEqual(after.original, before.original, "failed new render left original evidence from a different plan beside the existing edited week");
    }
    report.checks.push({ name: "failed new render preserves the entire displayed plan", status: "passed" });
  } else {
    await check("all eight meal/outing occurrences move to every weekday without displacing another occurrence", async () => {
      const requestsBefore = report.apiRequests.length;
      for (let i = 0; i < picks().length; i++) {
        const key = `pick-${i}`;
        for (const day of DAYS) {
          const before = await snapshot();
          await page.locator(`[data-pick-key="${key}"]`).selectOption(day);
          const after = await snapshot();
          assert.equal(after.assignments.length, 8);
          assert.equal(new Set(after.assignments.map((a) => a.key)).size, 8);
          assert.deepEqual(asMap(after), { ...asMap(before), [key]: day });
          assert.equal(after.assignments.find((a) => a.key === key).row, day);
          assert.deepEqual(after.original, first.original);
          assert.equal(await page.evaluate(() => document.activeElement.dataset.pickKey), key);
          await calendarCoherent();
        }
      }
      assert.equal(report.apiRequests.length, requestsBefore, "local scheduling made a plan request");
      assert.equal(await page.locator('[data-day="Sunday"] .scheduled-pick').count(), 8);
      report.allDayMoves = 56;
    });
    await check("all occurrences can be omitted and restored on one occupied day", async () => {
      for (let i = 0; i < 8; i++) await page.locator(`[data-pick-key="pick-${i}"]`).selectOption("");
      const omitted = await snapshot();
      assert.equal(omitted.omitted, 8);
      assert.equal(omitted.names.length, 0);
      assert.match(omitted.summary, /0 of 8/);
      await calendarCoherent();
      for (let i = 0; i < 8; i++) {
        await page.locator(`#omittedPicks [data-pick-key="pick-${i}"]`).selectOption("Wednesday");
        await calendarCoherent();
      }
      assert.equal(await page.locator('[data-day="Wednesday"] .scheduled-pick').count(), 8);
      assert.deepEqual((await snapshot()).original, first.original);
    });
    await check("restore uses original weekdays while retaining the selected week across a year boundary", async () => {
      await page.locator("#weekDate").fill("2026-12-31");
      expectedMonday = "2026-12-28";
      await page.locator("#resetWeek").click();
      const reset = await snapshot();
      assert.deepEqual(asMap(reset), asMap(first));
      assert.deepEqual(reset.dates, ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
      await calendarCoherent();
    });
    await check("a partial new result replaces occurrence identity and starts fresh assignments", async () => {
      const partial = fixture("Replacement", ["Tuesday", "Friday"], "Sunday");
      await show(partial);
      const next = await snapshot();
      assert.deepEqual(asMap(next), { "pick-0": "Tuesday", "pick-1": "Friday", "pick-2": "Sunday" });
      assert.equal(next.omitted, 0);
      assert.ok(next.names.every((name) => name.startsWith("Replacement")));
      assert.ok(!next.original.plan.includes("Initial"));
      assert.equal(next.dates[0], expectedMonday);
      await calendarCoherent();
    });
    for (const oldError of [false, true]) {
      await check(`late older ${oldError ? "failure" : "success"} cannot replace a newer edited plan`, async () => {
        const newest = fixture(oldError ? "NewerAfterError" : "Newest", ["Monday", "Friday"], "Saturday");
        queued.push(oldError ? { error: "Old authored failure", delay: 350 } : { data: fixture("Obsolete"), delay: 350 });
        queued.push({ data: newest });
        const oldResponse = page.waitForResponse(async (r) => {
          if (!r.url().includes("/api/plan/sample/")) return false;
          const body = await r.json();
          return oldError ? body.detail === "Old authored failure" : body.plan?.meals[0]?.name.startsWith("Obsolete");
        });
        await page.locator("#sampleBtn").click();
        await page.locator("#sampleBtn").click();
        await page.waitForFunction((name) => document.querySelector("#weekDays h4")?.textContent === name, newest.plan.meals[0].name);
        activeFixture = newest;
        await page.locator('[data-pick-key="pick-0"]').selectOption("Thursday");
        const edited = await snapshot();
        await (await oldResponse).finished();
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.deepEqual(await snapshot(), edited);
        assert.match(await page.locator("#requestStatus").textContent(), /Suggestions ready/);
        await calendarCoherent();
      });
    }
    await check("authored empty results leave seven open days and no stale picks", async () => {
      await show(fixture("Empty", [], null));
      const empty = await snapshot();
      assert.equal(empty.assignments.length, 0);
      assert.equal(empty.names.length, 0);
      assert.equal(empty.omitted, 0);
      assert.equal(await page.locator("#weekDays .open-day").count(), 7);
      assert.ok(empty.original.plan === "");
      await calendarCoherent();
    });
    await check("browser run has no unhandled page errors or external page requests", async () => {
      assert.deepEqual(report.pageErrors, []);
      assert.deepEqual(report.externalRequestsBlocked, []);
    });
  }
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
  const target = path.join(output, malformedProbe ? "malformed-render-report.json" : "browser-receiving-report.json");
  fs.writeFileSync(target, JSON.stringify(report, null, 2) + "\n");
  console.log(report.status.toUpperCase() + ": report written to " + target);
});
