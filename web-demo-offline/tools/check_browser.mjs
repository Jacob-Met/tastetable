#!/usr/bin/env node
/** Actual native Chromium receiving, fresh profiles and an ephemeral loopback server. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const [rootArg, outArg] = process.argv.slice(2);
if (!rootArg || !outArg) throw new Error("usage: check_browser.mjs STATIC_ROOT NEW_RECEIPT_DIR");
const root = path.resolve(rootArg), out = path.resolve(outArg);
await fs.mkdir(out);
const sourceBytes = await fs.readFile(path.join(root, "data/catalogue.json"));
const dataset = JSON.parse(sourceBytes);
const { chromium } = await import(pathToFileURL(process.env.TASTETABLE_PLAYWRIGHT_MODULE));
const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
const receipt = {schema: "tastetable.native-browser.v1", source_commit: dataset.source.commit,
  catalogue_sha256: hash(sourceBytes), started_at: new Date().toISOString(),
  checks: [], downloads: [], requests: [], errors: [], external_requests: [], complete: false};
const server = http.createServer(async (req, res) => {
  try {
    const uri = new URL(req.url, "http://127.0.0.1");
    let relative = decodeURIComponent(uri.pathname);
    if (relative === "/") relative = "/index.html";
    const file = path.resolve(root, "." + relative);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const bytes = await fs.readFile(file);
    const mime = {".html":"text/html", ".mjs":"text/javascript", ".js":"text/javascript",
      ".css":"text/css", ".json":"application/json", ".md":"text/plain"}[path.extname(file)] || "application/octet-stream";
    res.writeHead(200, {"Content-Type":mime, "Cache-Control":"no-store"}).end(bytes);
  } catch { res.writeHead(404).end("missing"); }
});
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const contexts = [];
function checked(name, details = {}) { receipt.checks.push({name, pass:true, ...details}); }
async function newPage(viewport, tag) {
  const context = await browser.newContext({viewport, reducedMotion:"reduce", locale:"en-US", timezoneId:"UTC"});
  contexts.push(context);
  const page = await context.newPage();
  page.on("pageerror", (error) => receipt.errors.push({tag,message:error.message}));
  page.on("request", (request) => receipt.requests.push({tag,method:request.method(),path:new URL(request.url()).pathname}));
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin !== origin) {
      receipt.external_requests.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  return page;
}
async function show(page, profile, mask) {
  await page.selectOption("#personaSel", profile);
  for (const [bit, name] of dataset.constraints.entries()) {
    await page.locator(`input[name=constraints][value="${name}"]`).setChecked(!!(mask & (1 << bit)));
  }
  await page.click("#showPlan");
  const key = `${profile}-${mask}`;
  await page.waitForFunction((key) => document.querySelector("#results").dataset.recordKey === key &&
    !document.querySelector("#results").hidden, key);
  return dataset.records.find((r) => r.key === key);
}
async function verifyRecord(page, record) {
  const source = record.response.plan;
  const wanted = [...source.meals, ...(source.outing ? [source.outing] : [])];
  const visible = await page.locator("#weekDays .scheduled-pick h4").allTextContents();
  assert.deepEqual(visible.sort(), wanted.map((p) => p.name).sort());
  const details = await page.locator("#weekDays").textContent();
  for (const pick of wanted) { assert.ok(details.includes(pick.entity_id)); assert.ok(details.includes(pick.why)); }
  assert.equal(await page.locator("#weekDays > li").count(), 7);
  assert.equal(await page.locator("#weekDays .open-day").count(), 7 - wanted.length);
  assert.ok((await page.locator("#recordSummary").textContent()).includes(record.profile_id === "rosa" ? "Rosa" : record.profile_id === "mei" ? "Mei" : "Harold"));
  assert.ok((await page.locator("#weekSource").textContent()).includes("fictional venues"));
}
async function download(page, key, tag) {
  const [item] = await Promise.all([page.waitForEvent("download"), page.click("#downloadRecord")]);
  assert.equal(item.suggestedFilename(), `tastetable-${key}-source.json`);
  const target = path.join(out, `${tag}-${key}.json`);
  await item.saveAs(target);
  const bytes = await fs.readFile(target), expected = await fs.readFile(path.join(root, "data/records", key + ".json"));
  assert.deepEqual(bytes, expected);
  receipt.downloads.push({tag,key,bytes:bytes.length,sha256:hash(bytes),filename:item.suggestedFilename()});
}
try {
  browser = await chromium.launch({headless:true, executablePath:process.env.TASTETABLE_BROWSER_EXECUTABLE});
  receipt.browser = await browser.version();
  for (const [tag,viewport] of [["desktop",{width:1440,height:1000}],["phone",{width:390,height:844}]]) {
    const page = await newPage(viewport, tag);
    await page.goto(origin, {waitUntil:"networkidle"});
    await page.waitForSelector("#results:not([hidden])");
    assert.equal(await page.locator("#results").getAttribute("data-record-key"), "rosa-7");
    assert.ok((await page.locator("#mode").textContent()).includes("No fresh backend planning"));
    assert.equal(await page.locator("#form input[readonly]").count(),4);
    checked(tag + ": ready default and finite-record provenance");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement.className), "skip-link");
    await page.keyboard.press("Enter");
    assert.equal(await page.evaluate(() => document.activeElement.id), "form");
    checked(tag + ": actual keyboard skip link");
    const selections = tag === "desktop"
      ? ["rosa","harold","mei"].flatMap((id) => Array.from({length:8},(_,mask)=>[id,mask]))
      : [["rosa",0],["harold",6],["mei",7]];
    for (const [profile,mask] of selections) {
      const record = await show(page,profile,mask); await verifyRecord(page,record);
      checked(`${tag}: ${record.key} matches actual native response`);
    }
    for (const [profile,mask] of [["rosa",7],["harold",6],["mei",7]]) {
      await show(page,profile,mask); await download(page,`${profile}-${mask}`,tag);
    }
    checked(tag + ": three exact raw native downloads");
    await page.locator('input[name=constraints][value="wheelchair"]').uncheck();
    assert.equal(await page.locator("#results").isVisible(), false);
    assert.equal(await page.locator("#downloadRecord").getAttribute("href"), null);
    assert.ok((await page.locator("#requestStatus").textContent()).includes("Constraints changed"));
    await page.click("#showPlan");
    assert.equal(await page.locator("#results").getAttribute("data-record-key"), "mei-3");
    checked(tag + ": changed constraints retire the previous plan");
    await page.selectOption("#personaSel", "rosa");
    assert.equal(await page.locator("#results").isVisible(), false);
    await page.click("#sampleBtn");
    assert.equal(await page.locator("#results").getAttribute("data-record-key"), "rosa-7");
    checked(tag + ": profile changes and explicit default restore");
    await page.locator("#weekDate").fill("2026-12-31");
    assert.equal(await page.locator("#weekDays time").first().getAttribute("datetime"), "2026-12-28");
    assert.equal(await page.locator("#weekDays time").last().getAttribute("datetime"), "2027-01-03");
    await page.selectOption('select[data-pick-key="pick-0"]', "Tuesday");
    assert.equal(await page.evaluate(() => document.activeElement.dataset.pickKey), "pick-0");
    await page.selectOption('select[data-pick-key="pick-1"]', "");
    assert.equal(await page.locator("#omittedPicks .scheduled-pick").count(), 1);
    assert.equal(await page.locator("#weekDays time").first().getAttribute("datetime"), "2026-12-28");
    await page.click("#resetWeek");
    assert.equal(await page.locator("#omittedSection").isVisible(), false);
    assert.equal(await page.locator('select[data-pick-key="pick-0"]').inputValue(), "Monday");
    checked(tag + ": year boundary, move, omit, focus and reset preserve the chosen week");
    await page.locator("#weekDate").fill("");
    assert.ok((await page.locator("#weekError").textContent()).length > 0);
    assert.equal(await page.locator("#printWeek").isDisabled(), true);
    await page.selectOption('select[data-pick-key="pick-0"]', "Tuesday");
    assert.equal(await page.locator("#printWeek").isDisabled(), true);
    await page.locator("#weekDate").fill("2024-02-29");
    assert.equal(await page.locator("#printWeek").isDisabled(), false);
    assert.equal(await page.locator("#weekDays time").last().getAttribute("datetime"), "2024-03-03");
    checked(tag + ": invalid-date refusal and leap-day recovery");
    await page.locator(".original-evidence > summary").click();
    await page.locator('details:has(> summary:text("Recorded native tool trace")) > summary').click();
    assert.ok((await page.locator("#trace").textContent()).includes("constraint_check"));
    assert.ok((await page.locator("#rejected").textContent()).includes("wheelchair"));
    checked(tag + ": native trace, reasons and rejection evidence");
    await show(page,"rosa",1);
    assert.ok((await page.locator("#weekDays").textContent()).includes("Soft foods: unknown"));
    assert.ok((await page.locator("#weekDays").textContent()).includes("ask the venue"));
    checked(tag + ": retained dietary UNKNOWN and ask-venue reason are visible");
    await page.emulateMedia({media:"print"});
    assert.equal(await page.locator(".taste-form").isVisible(), false);
    assert.equal(await page.locator(".original-evidence").isVisible(), false);
    assert.equal(await page.locator("#weekDays").isVisible(), true);
    assert.ok((await page.locator("#weekConstraints").textContent()).includes("soft foods"));
    assert.ok((await page.locator("#weekDays").textContent()).includes("Soft foods: unknown"));
    assert.ok((await page.locator("#weekDays").textContent()).includes("ask the venue"));
    if (tag === "desktop") {
      const pdf = await page.pdf({format:"A4",printBackground:true});
      assert.equal(pdf.subarray(0,4).toString(),"%PDF");
      await fs.writeFile(path.join(out,"arranged-week.pdf"),pdf);
      receipt.print_artifact = {bytes:pdf.length,sha256:hash(pdf)};
    }
    await page.emulateMedia({media:"screen"});
    checked(tag + ": actual native print-media receiving");
    await show(page,"mei",7);
    await page.locator("#weekDate").fill("2026-10-08");
    if (await page.locator(".original-evidence").evaluate((el) => el.open)) await page.locator(".original-evidence > summary").click();
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0,0); });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({path:path.join(out,tag+".png"),fullPage:false});
    if (tag === "phone") {
      await page.locator(".record-note").evaluate((el) => el.scrollIntoView({block:"start"}));
      await page.screenshot({path:path.join(out,"phone-week.png")});
    }
    checked(tag + ": responsive layout without horizontal overflow", {viewport});
  }
  for (const kind of ["http-refusal","wrong-source"]) {
    const page = await newPage({width:390,height:844},kind);
    await page.route("**/data/catalogue.json",(route) => {
      if (kind === "http-refusal") return route.fulfill({status:503,contentType:"application/json",body:'{"unavailable":true}'});
      const changed=structuredClone(dataset);changed.source.commit="0".repeat(40);
      return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(changed)});
    });
    await page.goto(origin,{waitUntil:"networkidle"});
    await page.waitForFunction(() => document.querySelector("#mode").textContent.includes("unavailable"));
    assert.equal(await page.locator("#results").isVisible(),false);
    assert.equal(await page.locator("#showPlan").isDisabled(),true);
    assert.equal(await page.locator("#downloadRecord").getAttribute("href"),null);
    checked(kind + ": explicit unavailable state without a stale plan");
  }
  assert.equal(receipt.errors.length,0);
  assert.equal(receipt.external_requests.length,0);
  assert.equal(receipt.requests.filter((r)=>r.method!=="GET" || r.path.startsWith("/api/")).length,0);
  checked("No browser errors, external requests, backend calls or POSTs");
  receipt.complete=true;
} catch(error) {
  receipt.failure={message:error.message,stack:error.stack};
  throw error;
} finally {
  receipt.finished_at=new Date().toISOString();
  await fs.writeFile(path.join(out,"receipt.json"),JSON.stringify(receipt,null,2)+"\n");
  for(const context of contexts) await context.close();
  if(browser) await browser.close();
  await new Promise((resolve)=>server.close(resolve));
  console.log(JSON.stringify({complete:receipt.complete,checks:receipt.checks.length,downloads:receipt.downloads.length,
    errors:receipt.errors.length,external_requests:receipt.external_requests.length,out}));
}
