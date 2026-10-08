/** Browser checks use codec-created local files; no planner/provider request is made. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { createWeekPlan, setPickDay, setWeek } from "../static/week_plan.mjs";
import { makeWeekFile } from "../static/week_file.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(process.argv[2] || "/tmp/tastetable-week-compare-browser");
await mkdir(out, { recursive: true });
const response = JSON.parse(await readFile(resolve(root, "tests/fixtures/saved-week-response.json"), "utf8"));
const inputs = { cuisines: ["Cuban"], music: ["Celia Cruz"], films: [], city: "Pasadena", constraints: response.comparison.constraints };
function snapshot(source = structuredClone(response)) {
  return { response: source, inputs: structuredClone(inputs), state: createWeekPlan(source, "2026-12-28"),
    receivedAt: "2026-10-08T10:00:00.000Z", calendarId: "e9a27c3786b649e483a42cc1a0096fb0" };
}
function encoded(value, name = "week.json") {
  return { name, mimeType: "application/json", buffer: Buffer.from(makeWeekFile(value, new Date("2026-10-08T11:00:00.000Z")).text) };
}
const before = snapshot(), after = snapshot();
after.state = setPickDay(setPickDay(after.state, "pick-0", "Tuesday"), "pick-1", null);
const earlier = encoded(before, "earlier.json"), revised = encoded(after, "revised.json");
const inputPins = {};
for (const item of [earlier, revised]) {
  await writeFile(resolve(out, item.name), item.buffer);
  inputPins[item.name] = createHash("sha256").update(item.buffer).digest("hex");
}
const requests = [], external = [], errors = [], groups = [];
const server = createServer(async (req, res) => {
  requests.push(req.url);
  const path = resolve(root, "." + new URL(req.url, "http://local").pathname);
  if (!path.startsWith(root + "/static/")) { res.writeHead(404); res.end(); return; }
  try {
    const data = await readFile(path);
    res.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css" })[extname(path)] || "application/octet-stream");
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const origin = "http://127.0.0.1:" + server.address().port;
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.TASTETABLE_CHROME_PATH,
    args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const context = await browser.newContext();
  await context.route("**/*", route => {
    if (route.request().url().startsWith(origin + "/")) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  const text = id => page.locator("#" + id).innerText();
  async function wait(check, label) {
    const until = Date.now() + 6000;
    while (!await check()) { if (Date.now() > until) throw new Error(label); await new Promise(r => setTimeout(r, 30)); }
  }
  async function load(key, file) {
    await page.locator("#" + key + "File").setInputFiles(file);
    await wait(async () => !(await text(key + "Status")).startsWith("Reading "), "file read did not finish");
  }
  await page.goto(origin + "/static/compare-weeks.html");
  await load("before", earlier); await load("after", revised);
  assert.match(await text("comparisonBody"), /1 moved · 0 newly scheduled · 1 kept off · 3 unchanged/);
  assert.match(await page.locator('[data-occurrence="pick-0"]').innerText(), /Monday · 2026-12-28.*Tuesday · 2026-12-29/s);
  assert.match(await text("beforeSource"), /Demo \/ synthetic source/);
  groups.push("matching source: exact movement, omission, dates and provenance");
  await page.screenshot({ path: resolve(out, "desktop.png"), fullPage: true });

  const anotherWeek = snapshot(); anotherWeek.state = setWeek(anotherWeek.state, "2027-01-04");
  await load("after", encoded(anotherWeek));
  assert.match(await text("comparisonBody"), /5 moved/);
  assert.match(await text("comparisonBody"), /Week changed from 2026-12-28 to 2027-01-04/);
  groups.push("year-boundary chosen week compares actual dates");

  const different = snapshot(); different.response.plan.meals[0].why += " Changed source";
  different.state = createWeekPlan(different.response, "2026-12-28");
  await load("after", encoded(different));
  assert.equal(await text("comparisonTitle"), "Separate saved arrangements");
  assert.equal(await page.locator(".change-table").count(), 0);
  assert.match(await text("comparisonStatus"), /no moved, added or omitted visit is inferred/);
  groups.push("different source stays separate");

  const repeatedSource = structuredClone(response);
  repeatedSource.plan.meals[1] = { ...repeatedSource.plan.meals[0], day: "Wednesday" };
  const repeated = snapshot(repeatedSource), repeatAfter = structuredClone(repeated);
  repeatAfter.state = setPickDay(repeatAfter.state, "pick-1", null);
  await load("before", encoded(repeated)); await load("after", encoded(repeatAfter));
  assert.match(await page.locator('[data-occurrence="pick-0"]').innerText(), /Unchanged/);
  assert.match(await page.locator('[data-occurrence="pick-1"]').innerText(), /Kept off the week/);
  groups.push("repeated venues retain distinct original occurrences");

  const literalSource = structuredClone(response);
  literalSource.plan.meals[0].name = '<img src=x onerror="window.injected=true"> café 老朋友';
  literalSource.plan.meals[0].why = "Literal <script>window.injected=true</script> & exact explanation";
  const literal = snapshot(literalSource);
  await load("before", encoded(literal, '<img onerror="oops">.json'));
  await load("after", encoded(literal));
  await page.locator(".visit-details summary").first().click();
  assert.match(await text("comparisonBody"), /<img src=x onerror=/);
  assert.match(await text("comparisonBody"), /Literal <script>/);
  assert.equal(await page.locator("#comparisonBody img, #comparisonBody script").count(), 0);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  groups.push("Unicode, markup-like filenames/names/explanations render literally");

  await load("before", earlier); await load("after", revised);
  for (const file of [
    { name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{bad") },
    { name: "not-utf8.json", mimeType: "application/json", buffer: Buffer.from([0xff, 0xfe, 0xff]) },
    { name: "large.json", mimeType: "application/json", buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 32) },
  ]) {
    await load("after", file);
    assert.match(await text("afterStatus"), /Could not open/);
    assert.match(await text("afterStatus"), /previously loaded file remains shown/);
    assert.match(await text("afterSource"), /revised.json/);
    assert.match(await text("comparisonBody"), /1 moved/);
  }
  await load("after", revised);
  groups.push("malformed, invalid UTF-8 and oversized replacement refuse with recovery");

  async function holdNext() {
    await page.evaluate(() => {
      delete window.releaseHeldFile;
      const original = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = function () {
        File.prototype.arrayBuffer = original;
        return original.call(this).then(bytes => new Promise(resolve => { window.releaseHeldFile = () => resolve(bytes); }));
      };
    });
  }
  await holdNext();
  await page.locator("#afterFile").setInputFiles(earlier);
  await wait(async () => await page.evaluate(() => typeof window.releaseHeldFile === "function"), "held read seam");
  await page.locator("#afterClear").click();
  await page.evaluate(() => window.releaseHeldFile());
  await page.waitForTimeout(100);
  assert.equal(await text("afterStatus"), "No file selected.");
  assert.equal(await page.locator("#comparison").isHidden(), true);
  await load("after", revised);
  await holdNext();
  await page.locator("#afterFile").setInputFiles(earlier);
  await wait(async () => (await text("afterStatus")).startsWith("Reading "), "older read pending");
  await load("after", revised);
  await page.evaluate(() => window.releaseHeldFile());
  await page.waitForTimeout(100);
  assert.match(await text("afterSource"), /revised.json/);
  assert.match(await text("comparisonBody"), /1 moved/);
  groups.push("clear and newer file selection retire old asynchronous reads");

  const allOff = snapshot();
  for (const { key } of allOff.state.picks) allOff.state = setPickDay(allOff.state, key, null);
  await load("after", encoded(allOff));
  assert.match(await text("comparisonBody"), /5 kept off/);
  const emptySource = structuredClone(response); emptySource.plan.meals = []; emptySource.plan.outing = null;
  await load("before", encoded(snapshot(emptySource))); await load("after", encoded(snapshot(emptySource)));
  assert.match(await text("comparisonBody"), /No original visits/);
  groups.push("all omitted and empty original plans remain readable");

  await load("before", earlier); await load("after", revised);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const scroll = page.locator(".table-scroll"); await scroll.focus();
  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(100);
  assert(await scroll.evaluate(node => node.scrollLeft) > 0);
  await page.screenshot({ path: resolve(out, "phone.png"), fullPage: true });
  assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
  assert.equal(requests.some(x => x.startsWith("/api/")), false);
  assert.deepEqual(external, []); assert.deepEqual(errors, []);
  groups.push("phone, keyboard table scrolling and no storage/API/external requests");
  await writeFile(resolve(out, "receipt.json"), JSON.stringify({ browser: await browser.version(), groups, pass: groups.length,
    inputPins, requests, external, errors, boundary: "Existing repository response fixture; native unchanged codec makes input files. Held File.arrayBuffer is an explicit asynchronous browser seam." }, null, 2) + "\n");
  console.log(JSON.stringify({ pass: groups.length, groups, output: out }));
} finally {
  if (browser) await browser.close();
  await new Promise(done => server.close(done));
}
