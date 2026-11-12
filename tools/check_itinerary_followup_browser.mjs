import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(process.env.TASTETABLE_PLAYWRIGHT_MODULE || "playwright");
const url = process.env.TASTETABLE_REVIEW_URL;
if (!url) throw new Error("Set TASTETABLE_REVIEW_URL to the maintained fixture app.");
const out = process.env.TASTETABLE_REVIEW_OUTPUT || "out/itinerary-followup-browser";
await mkdir(out, {recursive:true});
const cdp = process.env.TASTETABLE_REVIEW_CDP;
const browser = cdp ? await chromium.connectOverCDP(cdp) : await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.TASTETABLE_REVIEW_CHROMIUM ? {executablePath:process.env.TASTETABLE_REVIEW_CHROMIUM} : {})});
const context = await browser.newContext({viewport:{width:1365,height:950}});
let page = await context.newPage();
const errors = [];
function observe(p) { p.setDefaultTimeout(45000); p.on("pageerror", e => errors.push(e.message)); }
observe(page);
const slot = () => page.locator('[data-itinerary-key="pick-1"]');
try {
  await page.goto(url);
  await page.locator("#sampleBtn").click();
  await page.locator("#results").waitFor({state:"visible"});
  assert.equal(await page.locator('#caregiverHandoff').evaluate(n => Boolean(n.closest('#weekOrganizer'))), true,
    "the complete file stays beside the week it saves");
  const visitButtons = page.locator('#venueFollowup [data-contact-nav] button');
  assert.equal(await visitButtons.count(), 5, "all five visits have reachable conversation tabs");
  await visitButtons.nth(1).click();
  assert.equal(await visitButtons.nth(1).getAttribute("aria-pressed"), "true");
  await slot().getByRole("button", {name:/Edit venue note/}).click();
  const form = page.locator('#venueFollowup [data-contact-key="pick-1"]');
  const originalDate = await form.getAttribute("data-contact-date");
  assert.equal(await form.locator('[data-contact-field="status"]').evaluate(n => n === document.activeElement), true);
  await form.locator('[data-contact-field="status"]').selectOption("follow_up");
  const reply = "The entrance is closed until Friday. The side door has steps; call to confirm the reopening before travelling.";
  await form.locator('[data-contact-field="reply"]').fill(reply);
  await form.locator('[data-contact-field="nextStep"]').fill("Move this visit to Friday and confirm step-free entry.");
  await form.locator("[data-return-to-visit]").click();
  await page.waitForFunction(() => document.querySelector('[data-itinerary-key="pick-1"]').textContent.includes("Move this visit"));
  assert.match(await slot().innerText(), /Your venue note · Needs follow-up/);
  assert.equal(await slot().getAttribute("data-itinerary-date"), originalDate);
  assert.equal(await slot().getByRole("button").evaluate(n => n === document.activeElement), true);
  const titleBox = await slot().locator("..").locator("h4").boundingBox();
  assert.ok(titleBox.y >= 60, "Back keeps venue identity visible below sticky navigation");
  await slot().locator("details summary").click();
  assert.equal(await slot().locator(".itinerary-contact-reply").innerText(), reply);
  await page.screenshot({path:out+"/desktop-current-note.png"});
  await page.setViewportSize({width:390,height:844});
  await slot().scrollIntoViewIfNeeded();
  const phoneSize = await page.evaluate(() => ({
    bodyWidth: document.documentElement.scrollWidth,
    handoffTop: document.querySelector('#caregiverHandoff').getBoundingClientRect().top + scrollY,
    worksheetHeight: document.querySelector('#venueFollowup').getBoundingClientRect().height,
  }));
  assert.equal(phoneSize.bodyWidth, 390, "the 390px page must not overflow horizontally");
  assert.ok(phoneSize.handoffTop < 4500, "the complete handoff is part of this week, not buried after every call form");
  assert.ok(phoneSize.worksheetHeight < 3500, "the venue forms are one focused visit, not five vertically stacked forms");
  await page.screenshot({path:out+"/phone-current-note.png"});
  await slot().getByRole("button").click();
  const control = form.locator('[data-contact-field="status"]');
  const box = await control.boundingBox();
  assert.ok(box.y > 56 && box.y + box.height < 844, "direct edit control stays visible below sticky navigation");
  await form.locator("[data-return-to-visit]").click();
  await page.locator('select[data-pick-key="pick-1"]').selectOption("Friday");
  await page.waitForFunction(() => document.querySelector('[data-itinerary-key="pick-1"]').textContent.includes("Not contacted"));
  assert.doesNotMatch(await slot().innerText(), /entrance is closed|Move this visit/);
  assert.notEqual(await slot().getAttribute("data-itinerary-date"), originalDate);
  await page.locator("#undoWeek").click();
  await page.waitForFunction(() => document.querySelector('[data-itinerary-key="pick-1"]').textContent.includes("Move this visit"));
  const download = page.waitForEvent("download");
  await page.locator("#saveCaregiverHandoff").click();
  await (await download).saveAs(out+"/caregiver-handoff.json");
  await page.close();
  page = await context.newPage(); observe(page);
  await page.goto(url);
  await page.locator("#caregiverHandoffFile").setInputFiles(out+"/caregiver-handoff.json");
  await page.locator("[data-handoff-apply]").click();
  await page.waitForFunction(() => document.querySelector('[data-itinerary-key="pick-1"]')?.textContent.includes("Move this visit"));
  assert.equal(await slot().getAttribute("data-itinerary-date"), originalDate);
  await slot().scrollIntoViewIfNeeded();
  await page.screenshot({path:out+"/reopened-note.png"});
  await page.locator("#personaSel").selectOption("mei");
  await page.locator("#sampleBtn").click();
  await page.waitForFunction(() => document.querySelector('[data-itinerary-key="pick-1"]')?.textContent.includes("Not contacted"));
  assert.doesNotMatch(await page.locator("#weekDays").innerText(), /entrance is closed|Move this visit/);
  assert.deepEqual(errors, []);
  await writeFile(out+"/result.json", JSON.stringify({browser:await browser.version(),url,checks:["current exact-date status and next action","full original reply disclosure","keyboard focus Edit/back","390px no overflow and focused control visible","move clears old-date note; Undo restores it","actual portable caregiver handoff reopens summary","new accepted plan retires previous summary"],errors},null,2));
  console.log("Actual itinerary follow-up course passed");
} catch (error) {
  await page.screenshot({path:out+"/failure.png"}).catch(()=>{});
  await writeFile(out+"/failure.json",JSON.stringify({error:String(error),stack:error.stack,errors},null,2));
  console.error(error); process.exitCode=1;
} finally { await context.close(); if(!cdp) await browser.close(); process.exit(process.exitCode||0); }
