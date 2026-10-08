/** Native Windows file-URL receiving; uses only new owned browser/output state. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "file:///C:/hamon-receiving-b47cbcf18759/dependencies/playwright-core-1.62.1/index.mjs";
import { createWeekPlan, setPickDay, setWeek } from "../../../static/week_plan.mjs";
import { readWeekFile, makeWeekFile } from "../../../static/week_file.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const out = resolve(process.argv[2] || join(here, "browser-v1"));
await fs.mkdir(out); // Each attempt keeps its own evidence.
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourcePaths = ["static/week_report.mjs", "tools/saved_week_to_html.mjs", "static/week_file.mjs", "static/week_plan.mjs"];
const sourceHashes = Object.fromEntries(sourcePaths.map((path) => [path, hash(readFileSync(join(root, path)))]));
const originalText = await fs.readFile(join(here, "baseline-saved-week.json"), "utf8");
const original = readWeekFile(originalText);
const inputs = {}, reports = {}, groups = [], errors = [], network = [];
let browser;

function record(label, details = {}) {
  groups.push({ label, pass: true, ...details });
}
async function report(name, text) {
  const input = join(out, name + ".json");
  const output = join(out, name + ".html");
  await fs.writeFile(input, text, { flag: "wx" });
  const run = spawnSync(process.execPath, [join(root, "tools/saved_week_to_html.mjs"), "--input", input, "--output", output],
    { cwd: out, encoding: "utf8", timeout: 15000 });
  assert.equal(run.status, 0, run.stderr);
  const receipt = JSON.parse(run.stdout);
  assert.equal(receipt.inputSha256, hash(Buffer.from(text)));
  assert.equal(await fs.readFile(input, "utf8"), text);
  inputs[name] = { sha256: receipt.inputSha256, bytes: Buffer.byteLength(text), receipt };
  reports[name] = { sha256: hash(await fs.readFile(output)), path: output };
  return output;
}
function encode(saved) {
  return makeWeekFile(saved, new Date("2026-10-08T12:00:00.000Z")).text;
}
async function open(page, filename) {
  await page.goto(pathToFileURL(filename).href, { waitUntil: "load" });
  assert.equal(await page.locator("script,img,iframe,object,link,form,a").count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
}

try {
  const ordinary = await report("native-mei", originalText);
  browser = await chromium.launch({
    headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    args: ["--no-sandbox", "--disable-background-networking", "--no-first-run"],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, offline: true });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!request.url().startsWith(pathToFileURL(out).href + "/")) network.push(request.url());
  });
  await open(page, ordinary);
  assert.equal(await page.locator(".day").count(), 7);
  assert.equal(await page.locator("[data-occurrence]").count(), original.state.picks.length);
  assert((await page.locator("body").innerText()).includes(original.receivedAt));
  for (const item of original.state.picks) {
    assert.equal(await page.locator('[data-occurrence="' + item.key + '"] .explanation').textContent(), item.pick.why);
  }
  await page.screenshot({ path: join(out, "desktop.png"), fullPage: true });
  record("actual native producer -> saved-week converter -> new CLI -> offline browser", { picks: original.state.picks.length });

  const edited = readWeekFile(originalText);
  const payload = '<script>window.REPORT_INJECTED=true</script><img src="https://invalid.example/x"> & café 老朋友\nsecond line';
  edited.response.plan.meals[0].name = payload;
  edited.response.plan.meals[0].why = payload;
  edited.response.plan.meals[1].name = payload;
  edited.response.plan.meals[1].why = payload;
  edited.response.plan.meals[1].entity_id = edited.response.plan.meals[0].entity_id;
  edited.response.plan.notes.push(payload);
  edited.state = createWeekPlan(edited.response, "2026-12-31");
  edited.state = setPickDay(setPickDay(edited.state, "pick-0", "Sunday"), "pick-1", null);
  const arranged = await report("edited-literal-duplicates", encode(edited));
  await open(page, arranged);
  assert.equal(await page.locator('.day').last().locator('[data-occurrence="pick-0"]').count(), 1);
  assert.equal(await page.locator('.omitted [data-occurrence="pick-1"]').count(), 1);
  assert.equal(await page.locator('[data-occurrence="pick-0"] h4').textContent(), payload);
  assert.equal(await page.locator('[data-occurrence="pick-0"] .explanation').textContent(), payload);
  assert.equal(await page.evaluate(() => window.REPORT_INJECTED), undefined);
  assert((await page.locator("body").innerText()).includes("2027-01-03"));
  record("cross-year arrangement and repeated venues retain distinct literal occurrences");
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, arranged);
  await page.screenshot({ path: join(out, "phone.png"), fullPage: true });
  record("390px reader fits the viewport and keeps source text");
  await page.emulateMedia({ media: "print" });
  const visibleDays = await page.locator(".day").evaluateAll((nodes) => nodes.filter((node) => getComputedStyle(node).display !== "none").length);
  assert.equal(visibleDays, 7);
  assert.equal(await page.locator(".omitted").isVisible(), true);
  await page.pdf({ path: join(out, "handoff.pdf"), format: "A4", printBackground: true });
  record("print media retains seven dates and omitted occurrences in an actual PDF");
  await page.emulateMedia({ media: "screen" });

  for (const [name, mock, expected] of [["live", false, "Saved live-source label"], ["unknown", undefined, "Saved source unknown"]]) {
    const changed = readWeekFile(originalText);
    if (mock === undefined) delete changed.response.mock;
    else changed.response.mock = mock;
    changed.state = createWeekPlan(changed.response, changed.state.weekStart);
    const filename = await report("authored-label-" + name, encode(changed));
    await open(page, filename);
    assert.equal(await page.locator(".badge").innerText(), expected);
    assert((await page.locator("body").innerText()).includes("original checks have not been rerun"));
    record("authored " + name + " marker stays a saved-source label");
  }

  const allOff = readWeekFile(originalText);
  for (const { key } of allOff.state.picks) allOff.state = setPickDay(allOff.state, key, null);
  await open(page, await report("all-off", encode(allOff)));
  assert.equal(await page.locator(".day .pick").count(), 0);
  assert.equal(await page.locator(".day .empty").count(), 7);
  assert.equal(await page.locator(".omitted .pick").count(), allOff.state.picks.length);
  record("all-omitted arrangement has seven open days and complete omitted source");
  const empty = readWeekFile(originalText);
  empty.response.plan.meals = [];
  empty.response.plan.outing = null;
  empty.response.plan.notes = ["No matching venues in the original response."];
  empty.state = createWeekPlan(empty.response, empty.state.weekStart);
  await open(page, await report("empty", encode(empty)));
  assert.equal(await page.locator(".pick").count(), 0);
  assert.equal(await page.locator(".day .empty").count(), 7);
  assert((await page.locator("body").innerText()).includes(empty.response.plan.notes[0]));
  record("empty native-shape response stays empty and keeps its original note");
  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
  for (const [path, expected] of Object.entries(sourceHashes)) assert.equal(hash(await fs.readFile(join(root, path))), expected);
  assert.equal(await fs.readFile(join(here, "baseline-saved-week.json"), "utf8"), originalText);
  const artifacts = {};
  for (const filename of await fs.readdir(out)) {
    const bytes = await fs.readFile(join(out, filename));
    artifacts[filename] = { bytes: bytes.length, sha256: hash(bytes) };
  }
  const receipt = { status: "passed", when: new Date().toISOString(), node: process.version,
    chrome: await browser.version(), offline: true, groups, errors, unexpectedRequests: network,
    sourceHashes, inputs, reports, artifacts };
  await fs.writeFile(join(out, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ status: receipt.status, groups: groups.length, chrome: receipt.chrome,
    artifacts: Object.keys(artifacts).length, errors: errors.length, unexpectedRequests: network.length }));
} catch (error) {
  await fs.writeFile(join(out, "failure.json"), JSON.stringify({ when: new Date().toISOString(),
    message: error.message, stack: error.stack, groups, errors, unexpectedRequests: network, sourceHashes, inputs, reports }, null, 2));
  throw error;
} finally {
  if (browser) await browser.close();
}
