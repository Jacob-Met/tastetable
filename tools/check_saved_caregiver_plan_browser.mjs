#!/usr/bin/env node
/** Exercise the maintained fixture app through real browser gestures.
 * PLAYWRIGHT_MODULE and CHROME_EXECUTABLE select existing fleet test dependencies.
 * No provider substitution or request mocking is used by this course.
 */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.TASTETABLE_TEST_URL || "http://127.0.0.1:8942";
const out = resolve(process.env.TASTETABLE_TEST_OUTPUT || "/tmp/tastetable-caregiver-save-course");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_EXECUTABLE || "/opt/google/chrome/chrome",
  headless: true, args: ["--no-sandbox"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 },
  recordVideo: { dir: join(out, "video"), size: { width: 1440, height: 1000 } } });
const page = await context.newPage();
const errors = [], posted = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => { if (request.method() === "POST") posted.push(request.postData() || ""); });
page.on("dialog", (dialog) => dialog.accept());
const note = "The step-free entrance is closed until Friday. Do not visit Wednesday.";
const next = "Call on Friday before moving this visit.";
const entry = () => page.locator('.contact-visit[data-contact-key="pick-0"]');
const field = (name) => entry().locator('[data-contact-field="' + name + '"]');
const savedRow = (name) => page.locator("#savedWeeksList > li").filter({ hasText: name });
async function storage(currentPage = page) {
  return currentPage.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open("tastetable.saved-weeks", 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const query = db.transaction("drafts", "readonly").objectStore("drafts").getAll();
      query.onsuccess = () => { db.close(); resolve(query.result); };
      query.onerror = () => { db.close(); reject(query.error); };
    };
  }));
}
async function download(button, filename) {
  const [file] = await Promise.all([page.waitForEvent("download"), page.locator(button).click()]);
  const path = join(out, filename);
  await file.saveAs(path);
  return path;
}
async function preview(name) {
  await savedRow(name).getByRole("button", { name: "Preview saved week" }).click();
  await page.locator("#savedWeekPreview").waitFor({ state: "visible" });
}
async function open(name) {
  await preview(name);
  await page.locator("#openSavedWeek").click();
  await page.waitForFunction(() => !document.querySelector("#results").hidden
    && document.querySelector("#requestStatus").textContent.includes("opened"));
}
try {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator('#form [name="cuisines"]').fill("Japanese, vegetarian");
  await page.locator('#form [name="music"]').fill("Nina Simone");
  await page.locator('#form [name="films"]').fill("Roman Holiday");
  await page.locator('#form [name="city"]').fill("Pasadena");
  await page.locator('#form [name="constraints"][value="wheelchair"]').check();
  await page.locator('#form button[type="submit"]').click();
  await page.locator("#results").waitFor({ state: "visible" });
  await page.locator("#weekDate").fill("2027-02-01");
  await page.locator("#weekDate").blur();
  await page.locator('[data-pick-key="pick-0"]').selectOption("Wednesday");
  await field("reply").fill(note);
  await field("status").selectOption("follow_up");
  await field("nextStep").fill(next);
  assert.equal((await storage()).length, 0, "editing private follow-up must not autosave");
  const legacyPath = await download("#saveWeek", "legacy-week.json");
  await page.locator("#savedWeekName").fill("Wednesday access question");
  await page.locator("#saveCurrentWeek").click();
  await page.waitForFunction(() => document.querySelector("#savedWeeksStatus").textContent.includes("with the complete venue follow-up"));
  let records = await storage();
  assert.equal(records.length, 1);
  assert.equal(records[0].version, 2);
  const complete = JSON.parse(records[0].text);
  assert.equal(complete.format, "tastetable.caregiver-handoff.v1");
  assert.equal(complete.venueNotes.records[0].note.reply, note);
  await field("reply").fill("Unsaved later edit");
  await preview("Wednesday access question");
  assert.equal(await field("reply").inputValue(), "Unsaved later edit", "preview must not replace current work");
  assert.match(await page.locator("#savedPreviewNotes").innerText(), /Do not visit Wednesday/);
  await page.locator("#savedWeekPreview").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(out, "complete-plan-preview.png") });
  await page.reload({ waitUntil: "networkidle" });
  await open("Wednesday access question");
  assert.equal(await page.locator('[data-pick-key="pick-0"]').inputValue(), "Wednesday");
  assert.equal(await field("reply").inputValue(), note);
  assert.equal(await field("status").inputValue(), "follow_up");
  assert.equal(await field("nextStep").inputValue(), next);
  assert.equal(await page.locator('#form [name="music"]').inputValue(), "Nina Simone");
  assert.match(await page.locator("#weekSource").innerText(), /fictional/i);
  await page.setViewportSize({ width: 390, height: 844 });
  await entry().scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(out, "reopened-followup-phone.png") });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "phone must not overflow horizontally");
  await page.locator("#importSavedWeekFile").setInputFiles(legacyPath);
  await page.locator("#importSavedWeekPreview").waitFor({ state: "visible" });
  await page.locator("#importSavedWeekName").fill("Legacy schedule only");
  await page.locator("#saveImportedWeek").click();
  await savedRow("Legacy schedule only").waitFor();
  assert.equal(await field("reply").inputValue(), note, "legacy import must not replace current notes");
  await preview("Legacy schedule only");
  assert.match(await page.locator("#savedPreviewSummary").innerText(), /Week-only copy.*clears current venue notes/);
  await page.screenshot({ path: join(out, "legacy-week-warning-phone.png") });
  await page.locator("#openSavedWeek").click();
  await page.waitForFunction(() => document.querySelector("#requestStatus").textContent.includes("week-only copy"));
  assert.equal(await field("reply").inputValue(), "");
  assert.equal(await field("status").inputValue(), "not_contacted");
  await page.locator("#savedWeekName").fill("Plan without recorded notes");
  await page.locator("#saveCurrentWeek").click();
  await savedRow("Plan without recorded notes").waitFor();
  await open("Wednesday access question");
  assert.equal(await field("reply").inputValue(), note);
  await preview("Plan without recorded notes");
  assert.match(await page.locator("#savedPreviewNotes").innerText(), /No venue notes/);
  await page.locator("#openSavedWeek").click();
  await page.waitForFunction(() => document.querySelector("#requestStatus").textContent.includes("Saved care plan opened"));
  assert.equal(await field("reply").inputValue(), "", "complete empty set must clear previous source notes");
  const backupPath = await download("#downloadCollectionBackup", "mixed-plan-backup.json");
  const backup = JSON.parse(await readFile(backupPath, "utf8"));
  assert.deepEqual(backup.records.map((record) => record.version).sort(), [1, 2, 2]);
  const freshContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const fresh = await freshContext.newPage();
  await fresh.goto(base, { waitUntil: "networkidle" });
  await fresh.locator("#collectionBackupFile").setInputFiles(backupPath);
  await fresh.locator("#collectionBackupPreview").waitFor({ state: "visible" });
  await fresh.locator("#addMissingSavedWeeks").click();
  await fresh.locator("#savedWeeksList > li").filter({ hasText: "Wednesday access question" })
    .getByRole("button", { name: "Preview saved week" }).click();
  await fresh.locator("#openSavedWeek").click();
  await fresh.locator("#results").waitFor({ state: "visible" });
  assert.equal(await fresh.locator('.contact-visit[data-contact-key="pick-0"] [data-contact-field="reply"]').inputValue(), note);
  assert.equal((await storage(fresh)).length, 3);
  const finalFull = (await storage(fresh)).find((record) => record.name === "Wednesday access question");
  assert.equal(finalFull.text, records[0].text, "transfer must retain complete original source and date-bound notes");
  assert.ok(posted.every((body) => !body.includes("step-free entrance") && !body.includes("Call on Friday")), "private notes must never enter provider requests");
  assert.deepEqual(errors, []);
  await freshContext.close();
  const report = { result: "PASS", actualEntry: base, providerMode: "maintained fictional fixtures and scripted model",
    cases: ["explicit save only", "complete dated follow-up restore", "read-only complete preview", "legacy week-only warning and open", "complete empty note replacement", "mixed collection transfer into fresh browser", "source evidence retained", "phone fit", "no note upload"],
    storedVersions: backup.records.map((record) => record.version), pageErrors: errors };
  await writeFile(join(out, "result.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally {
  await context.close();
  await browser.close();
}
