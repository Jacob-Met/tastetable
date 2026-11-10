const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { chromium } = require(process.env.TASTETABLE_PLAYWRIGHT_MODULE || "playwright");
const out = process.env.TASTETABLE_EVIDENCE || "/tmp/tastetable-planning-context";
(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.TASTETABLE_REVIEW_CHROMIUM, headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("dialog", dialog => dialog.accept());
    await page.goto(process.env.TASTETABLE_REVIEW_URL || "http://127.0.0.1:8993");
    await page.locator("#sampleBtn").click();
    await page.locator("#results").waitFor({ state: "visible" });
    const city = await page.locator('[name="city"]').inputValue();
    const originalWeek = await page.locator("#weekDays").innerText();
    const originalSummary = await page.locator(".planning-context-summary").innerText();
    const note = page.locator('[data-contact-field="reply"]').first();
    await note.fill("Entrance works; call again before Thursday.");
    await page.locator('[name="city"]').fill("Changed city for next request");
    assert.equal(await page.locator("#results").isVisible(), true);
    assert.equal(await page.locator("#weekDays").innerText(), originalWeek);
    assert.equal(await note.inputValue(), "Entrance works; call again before Thursday.");
    assert.equal(await page.locator(".planning-context-summary").innerText(), originalSummary);
    await page.locator('#planningContext[data-changed="true"]').waitFor();
    assert.match(await page.locator(".planning-context-changes").innerText(), /Changed city/);
    await page.locator(".planning-context-actions button").click();
    assert.equal(await page.locator('[name="city"]').inputValue(), city);
    assert.equal(await page.locator("#planningContext").getAttribute("data-changed"), "false");
    assert.equal(await note.inputValue(), "Entrance works; call again before Thursday.");

    await page.route("**/api/plan", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Temporary test unavailability" }) }));
    await page.locator('[name="city"]').fill("Another city");
    await page.locator('#form button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector("#form").getAttribute("aria-busy") === "false");
    assert.equal(await page.locator("#results").isVisible(), true);
    assert.equal(await page.locator("#weekDays").innerText(), originalWeek);
    assert.equal(await note.inputValue(), "Entrance works; call again before Thursday.");
    assert.match(await page.locator("#requestStatus").innerText(), /could not|unavailable/i);
    await page.unroute("**/api/plan");

    let release;
    const blocked = new Promise(resolve => { release = resolve; });
    let seen;
    const requestSeen = new Promise(resolve => { seen = resolve; });
    await page.route("**/api/plan", async route => { seen(); await blocked; await route.abort().catch(() => {}); });
    await page.locator('#form button[type="submit"]').click();
    await requestSeen;
    assert.equal(await page.locator("#results").isVisible(), true);
    assert.equal(await page.locator("#planningContext").getAttribute("data-pending"), "true");
    await page.locator("#cancelPlan").click();
    release();
    await page.waitForFunction(() => document.querySelector("#form").getAttribute("aria-busy") === "false");
    assert.equal(await page.locator("#results").isVisible(), true);
    assert.equal(await note.inputValue(), "Entrance works; call again before Thursday.");
    await page.locator(".planning-context-actions button").click();
    assert.equal(await page.locator('[name="city"]').inputValue(), city);
    await page.locator("#planningContext").scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: out + "/phone-preferences.png" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: out + "/desktop-preferences.png" });
    assert.deepEqual(errors, []);
    await fs.writeFile(out + "/receipt.json", JSON.stringify({
      browser: await browser.version(), errors,
      checks: ["actual fixture entry", "draft city retains current week", "venue reply retained", "accepted baseline remains readable", "restore preferences", "failed replacement retains week and notes", "canceled replacement retains week and notes", "phone and desktop"],
    }, null, 2));
    console.log("PASS planning preferences actual Chrome");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
