/** Native browser receiving: existing mock planner + unchanged saved-week codec. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createWeekPlan, setPickDay, setWeek } from "../static/week_plan.mjs";
import { makeWeekFile } from "../static/week_file.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(process.env.TASTETABLE_RECEIVE_ROOT || repo);
const baseline = process.env.TASTETABLE_RECEIVE_BASELINE === "1";
const out = resolve(process.argv[2] || "docs/receiving/caregiver-change-brief-0378a7b6/browser-" + Date.now());
const { chromium } = await import(process.env.TASTETABLE_PLAYWRIGHT_PATH
  ? pathToFileURL(process.env.TASTETABLE_PLAYWRIGHT_PATH).href : "playwright");
await mkdir(resolve(out, "browser-downloads"), { recursive: true });
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const runtime = ["static/compare-weeks.html", "static/week_compare_ui.mjs", "static/week_change_brief.mjs",
  "static/week_compare.mjs", "static/week_file.mjs", "static/week_plan.mjs", "static/week_compare.css", "static/style.css"];
async function pins() {
  return Object.fromEntries(await Promise.all(runtime.map(async path => {
    try { return [path, hash(await readFile(resolve(root, path)))]; }
    catch (error) { if (baseline && path.endsWith("week_change_brief.mjs") && error.code === "ENOENT") return [path, null]; throw error; }
  })));
}
const sourceBefore = await pins();
function produce(args, input) {
  return JSON.parse(execFileSync(process.env.TASTETABLE_PYTHON || "python3",
    ["tastetable_cli.py", ...args], { cwd: root, input, encoding: "utf8", timeout: 15000 }));
}
const produced = produce(["--persona", "rosa"]);
assert.equal(produced.response.mock, true);
await writeFile(resolve(out, "native-result.json"), JSON.stringify(produced, null, 2) + "\n");
function snapshot(response = structuredClone(produced.response), inputs = structuredClone(produced.profile)) {
  return { response, inputs, state: createWeekPlan(response, "2026-12-28"),
    receivedAt: "2026-10-08T10:00:00.000Z", calendarId: "e9a27c3786b649e483a42cc1a0096fb0" };
}
function encoded(value, name = "week.json") {
  return { name, mimeType: "application/json",
    buffer: Buffer.from(makeWeekFile(value, new Date("2026-10-08T11:00:00.000Z")).text) };
}
const before = snapshot(); before.state = setPickDay(before.state, "pick-2", null);
const after = structuredClone(before);
after.state = setPickDay(setPickDay(setPickDay(after.state, "pick-0", "Tuesday"), "pick-1", null), "pick-2", "Sunday");
const earlier = encoded(before, "earlier.json"), revised = encoded(after, "revised.json");
const inputPins = {};
for (const item of [earlier, revised]) {
  await writeFile(resolve(out, item.name), item.buffer); inputPins[item.name] = hash(item.buffer);
}
const requests = [], external = [], errors = [], groups = [], downloads = [];
const server = createServer(async (req, res) => {
  requests.push(req.url);
  const path = resolve(root, "." + new URL(req.url, "http://local").pathname);
  if (!path.startsWith(root + "/static/")) { res.writeHead(404); res.end(); return; }
  try {
    res.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css" })[extname(path)] || "application/octet-stream");
    res.end(await readFile(path));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const origin = "http://127.0.0.1:" + server.address().port;
let browser, page, browserVersion, failure;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.TASTETABLE_CHROME_PATH,
    downloadsPath: resolve(out, "browser-downloads"), args: ["--disable-dev-shm-usage"] });
  browserVersion = await browser.version();
  const context = await browser.newContext({ acceptDownloads: true });
  await context.addInitScript(() => {
    window.observedStorageWrites = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...args) { window.observedStorageWrites++; return original.apply(this, args); };
  });
  await context.route("**/*", route => {
    if (route.request().url().startsWith(origin + "/")) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  let downloadEvents = 0;
  page.on("download", () => downloadEvents++);
  const text = id => page.locator("#" + id).innerText();
  const button = () => page.locator("#briefDownload");
  async function wait(check, label) {
    const until = Date.now() + 6000;
    while (!await check()) { if (Date.now() > until) throw new Error(label); await new Promise(r => setTimeout(r, 25)); }
  }
  async function load(key, file) {
    await page.locator("#" + key + "File").setInputFiles(file);
    await wait(async () => !(await text(key + "Status")).startsWith("Reading "), "file read did not finish");
  }
  async function capture(action = () => button().click()) {
    const pending = page.waitForEvent("download");
    await action();
    const download = await pending;
    const path = resolve(out, "download-" + (downloads.length + 1) + ".txt");
    await download.saveAs(path);
    assert.equal(await download.failure(), null);
    const bytes = await readFile(path), content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    downloads.push({ file: path.slice(out.length + 1), filename: download.suggestedFilename(), sha256: hash(bytes), bytes: bytes.length });
    return content;
  }
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
  await page.goto(origin + "/static/compare-weeks.html");
  await load("before", earlier); await load("after", revised);
  assert.match(await text("comparisonBody"), /1 moved · 1 newly scheduled · 1 kept off · 2 unchanged/);
  if (baseline) {
    assert.equal(await button().count(), 0);
    assert.equal(downloadEvents, 0);
    await page.screenshot({ path: resolve(out, "baseline.png"), fullPage: true });
    groups.push("canonical baseline compares native planner files but has no revision-brief download");
  } else {
    let copy = await capture();
    assert.match(copy, /1 moved; 1 newly scheduled; 1 kept off the revised week/);
    assert.match(copy, /Earlier: Monday 2026-12-28\n  Revised: Tuesday 2026-12-29/);
    assert.match(copy, /Earlier: Not scheduled\n  Revised: Sunday 2027-01-03/);
    assert.match(copy, /Earlier: Wednesday 2026-12-30\n  Revised: Not scheduled/);
    assert(copy.includes("Earlier file: \"earlier.json\"") && copy.includes("Revised file: \"revised.json\""));
    assert(copy.includes("fictional venues") && copy.includes(JSON.stringify(produced.response.plan.meals[0].why)));
    assert.equal(downloads[0].filename, "tastetable-changes-2026-12-28-to-2026-12-28.txt");
    groups.push("actual mock planner → saved files → displayed exact changes → actual UTF-8 download");
    await page.screenshot({ path: resolve(out, "desktop.png"), fullPage: true });

    const shifted = snapshot(); shifted.state = setWeek(shifted.state, "2027-01-04");
    await load("before", encoded(snapshot(), "original-week.json")); await load("after", encoded(shifted, "next-week.json"));
    copy = await capture();
    assert.match(copy, /5 moved; 0 newly scheduled; 0 kept off/);
    assert.match(copy, /Earlier: Monday 2026-12-28\n  Revised: Monday 2027-01-04/);
    groups.push("same weekdays in a new year/week retain actual changed dates");

    const repeatResponse = structuredClone(produced.response);
    repeatResponse.plan.meals[1] = { ...repeatResponse.plan.meals[0], day: "Wednesday" };
    const repeated = snapshot(repeatResponse), repeatAfter = structuredClone(repeated);
    repeatAfter.state = setPickDay(setPickDay(repeatAfter.state, "pick-0", "Tuesday"), "pick-1", null);
    await load("before", encoded(repeated)); await load("after", encoded(repeatAfter));
    copy = await capture();
    assert(copy.includes("Original pick 1 (pick-0)") && copy.includes("Original pick 2 (pick-1)"));
    assert.equal(copy.split("Source entity ID: " + JSON.stringify(repeatResponse.plan.meals[0].entity_id)).length - 1, 2);
    groups.push("repeated venues stay distinct in the downloaded handoff");

    await load("before", earlier); await load("after", earlier);
    copy = await capture(); assert.match(copy, /No visit date or inclusion changes/);
    assert.match(copy, /5 unchanged \(4 still scheduled; 1 still off the week\)/);
    const off = snapshot(); for (const { key } of off.state.picks) off.state = setPickDay(off.state, key, null);
    const offNext = structuredClone(off); offNext.state = setWeek(offNext.state, "2027-01-04");
    await load("before", encoded(off)); await load("after", encoded(offNext));
    copy = await capture(); assert.match(copy, /5 unchanged \(0 still scheduled; 5 still off the week\)/);
    assert.match(copy, /0 scheduled in the earlier copy; 0 scheduled in the revised copy/);
    const emptyProduced = produce(["--profile", "-"], JSON.stringify({ ...produced.profile, city: "CityWithNoRecordedVenues" }));
    assert.equal(emptyProduced.response.plan.meals.length, 0);
    assert.equal(emptyProduced.response.plan.outing, null);
    await writeFile(resolve(out, "empty-native-result.json"), JSON.stringify(emptyProduced, null, 2) + "\n");
    const empty = encoded(snapshot(emptyProduced.response, emptyProduced.profile), "empty-native-week.json");
    await load("before", empty); await load("after", empty);
    copy = await capture(); assert.match(copy, /No original visits in these saved copies/);
    groups.push("no-change, all-off/week-shift and actual native no-match plans download honest brief states");

    await load("before", earlier);
    const different = structuredClone(after); different.receivedAt = "2026-10-08T10:00:01.000Z";
    await load("after", encoded(different));
    assert.equal(await button().isDisabled(), true);
    const priorDownloads = downloadEvents;
    await button().evaluate(node => node.dispatchEvent(new Event("click")));
    assert.match(await text("briefStatus"), /matching saved sources and identities/);
    assert.equal(downloadEvents, priorDownloads);
    groups.push("different source identity refuses a brief, including a dispatched click");

    await load("after", revised);
    await holdNext(); await page.locator("#afterFile").setInputFiles(earlier);
    await wait(async () => await page.evaluate(() => typeof window.releaseHeldFile === "function"), "held read seam");
    assert.equal(await button().isDisabled(), true);
    await button().evaluate(node => node.dispatchEvent(new Event("click")));
    assert.match(await text("briefStatus"), /Wait until both chosen files are loaded/);
    assert.equal(downloadEvents, priorDownloads);
    await page.locator("#afterClear").click(); await page.evaluate(() => window.releaseHeldFile());
    await page.waitForTimeout(70);
    assert.equal(await text("afterStatus"), "No file selected.");
    assert.equal(await button().isDisabled(), true);
    await load("after", revised);
    await holdNext(); await page.locator("#afterFile").setInputFiles(earlier);
    await wait(async () => await page.evaluate(() => typeof window.releaseHeldFile === "function"), "held old selection");
    await load("after", revised); await page.evaluate(() => window.releaseHeldFile());
    await page.waitForTimeout(70);
    copy = await capture();
    assert(copy.includes("Revised file: \"revised.json\"") && copy.includes("1 moved; 1 newly scheduled"));
    groups.push("pending/clear/newer selection prevent stale brief publication");

    for (const file of [
      { name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{bad") },
      { name: "not-utf8.json", mimeType: "application/json", buffer: Buffer.from([255, 254, 255]) },
      { name: "large.json", mimeType: "application/json", buffer: Buffer.alloc(2 * 1024 * 1024 + 1, 32) },
    ]) {
      await load("after", file);
      assert.match(await text("afterStatus"), /previously loaded file remains shown/);
      assert.equal(await button().isDisabled(), false);
      assert.match(await text("afterSource"), /revised.json/);
    }
    copy = await capture();
    assert(copy.includes("Revised file: \"revised.json\"") && !copy.includes("large.json"));
    groups.push("invalid replacements retain and accurately name the previously accepted files");

    const literalResponse = structuredClone(produced.response);
    literalResponse.plan.meals[0].name = '<img src=x onerror="window.injected=true"> Café 老朋友\nMoved visits (999)';
    literalResponse.plan.meals[0].why = "Literal <script>window.injected=true</script>\nnext line\u2028end";
    const literal = snapshot(literalResponse), literalAfter = structuredClone(literal);
    literalAfter.state = setPickDay(literalAfter.state, "pick-0", "Tuesday");
    await load("before", encoded(literal, 'first "<script>".json')); await load("after", encoded(literalAfter));
    copy = await capture();
    assert(copy.includes(JSON.stringify(literalResponse.plan.meals[0].name)));
    assert(copy.includes("\\nnext line\\u2028end") && !copy.includes("\nMoved visits (999)"));
    assert.equal(await page.locator("#comparisonBody img, #comparisonBody script").count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    groups.push("Unicode/markup and multiline fields remain data in the page and downloaded text");

    await load("before", earlier); await load("after", revised);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await button().focus();
    assert.equal(await button().evaluate(node => document.activeElement === node), true);
    copy = await capture(() => page.keyboard.press("Enter"));
    assert.match(copy, /1 moved; 1 newly scheduled; 1 kept off/);
    await page.screenshot({ path: resolve(out, "mobile.png"), fullPage: true });
    assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length, window.observedStorageWrites]), [0, 0, 0]);
    groups.push("390px layout and keyboard activation deliver the actual brief without storage writes");
    assert.equal(downloadEvents, downloads.length);
  }
  assert(!requests.some(x => x.startsWith("/api/")));
  assert.deepEqual(external, []); assert.deepEqual(errors, []);
  assert.deepEqual(await pins(), sourceBefore);
} catch (error) {
  failure = { name: error.name, message: error.message, stack: error.stack };
  throw error;
} finally {
  const receipt = { baseline, sourceRoot: root, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    browser: browserVersion, node: process.version, groups, pass: groups.length, downloads, inputPins, sourcePins: sourceBefore,
    requests, external, errors, failure: failure || null,
    boundary: "Actual native fictional-fixture planner processes produce complete sources; unchanged codec creates chosen arrangements. Selected repeated/literal cases are explicit edits of synthetic source. Held File.arrayBuffer is an authored asynchronous browser seam. Loopback serves exact static files, with no FastAPI deployment, live provider, venue communication or calendar-account execution." };
  await writeFile(resolve(out, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  if (browser) await browser.close();
  await new Promise(done => server.close(done));
  console.log(JSON.stringify({ baseline, pass: groups.length, downloads: downloads.length, output: out, failure: failure || null }));
}
