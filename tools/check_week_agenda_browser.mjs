import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const {chromium}=await import(process.env.TASTETABLE_PLAYWRIGHT_MODULE || 'playwright');
const out='docs/week-agenda';await mkdir(out,{recursive:true});
const b=await chromium.launch({executablePath:process.env.TASTETABLE_REVIEW_CHROMIUM,headless:true,chromiumSandbox:true});
const page=await b.newPage({viewport:{width:1365,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function open(url){await page.goto(url);await page.locator('#sampleBtn').click();await page.locator('#results').waitFor({state:'visible'});await page.locator('#weekDays').scrollIntoViewIfNeeded();}
try{
 await open(process.env.TASTETABLE_BASELINE_URL || 'http://127.0.0.1:8856');
 const beforeHeight=await page.locator('#weekDays').evaluate(n=>n.getBoundingClientRect().height);
 await page.screenshot({path:out+'/before-desktop.png'});
 const names=await page.locator('.scheduled-pick h4').allTextContents();
 const saveBefore=page.waitForEvent('download');await page.locator('#saveWeek').click();const before=JSON.parse(await readFile(await (await saveBefore).path(),'utf8'));
 await open(process.env.TASTETABLE_REVIEW_URL || 'http://127.0.0.1:8853');
 const afterHeight=await page.locator('#weekDays').evaluate(n=>n.getBoundingClientRect().height);
 assert.deepEqual(await page.locator('.scheduled-pick h4').allTextContents(),names);
 assert.equal(await page.locator('.pick-evidence[open]').count(),0);
 assert.ok(afterHeight<beforeHeight);
 await page.locator('#weekDays').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/desktop.png'});
 const first=page.locator('.pick-evidence').first();
 await first.locator('summary').focus();await page.keyboard.press('Enter');
 assert.equal(await first.getAttribute('open'),'');
 const why=await first.locator('.why').first().innerText();assert.ok(why.length>50);
 await page.locator('select[data-pick-key="pick-0"]').selectOption('Friday');
 assert.equal(await page.locator('[data-evidence-key="pick-0"]').getAttribute('open'),'');
 assert.equal(await page.locator('select[data-pick-key="pick-0"]').evaluate(n=>n===document.activeElement),true);
 await page.locator('#resetWeek').click();
 assert.equal(await page.locator('[data-evidence-key="pick-0"]').getAttribute('open'),'');
 const saveAfter=page.waitForEvent('download');await page.locator('#saveWeek').click();const after=JSON.parse(await readFile(await (await saveAfter).path(),'utf8'));
 const historicalResponse=structuredClone(after.response);
 for(const pick of historicalResponse.plan.meals.concat(historicalResponse.plan.outing?[historicalResponse.plan.outing]:[])) delete pick.evidence;
 const historicalBefore=structuredClone(before.response);
 for(const pick of historicalBefore.plan.meals.concat(historicalBefore.plan.outing?[historicalBefore.plan.outing]:[])) delete pick.evidence;
 assert.deepEqual(historicalResponse,historicalBefore);assert.deepEqual(after.week,before.week);
 await page.locator('[data-evidence-key="pick-0"] summary').click();
 await page.pdf({path:out+'/printed-week.pdf',format:'A4',printBackground:true});
 const printText=execFileSync('pdftotext',[out+'/printed-week.pdf','-'],{encoding:'utf8'});
 for(const pick of after.response.plan.meals.concat(after.response.plan.outing?[after.response.plan.outing]:[])){
  assert.ok(printText.includes(pick.entity_id),'print retains source ID '+pick.entity_id);
  const printed=printText.replace(/\s+/g,' ');
  const pieces=pick.evidence?[pick.evidence.taste_reason,...pick.evidence.checks.flatMap(check=>[check.reason,`Check: ${check.status}`])]:[pick.why];
  for(const piece of pieces) assert.ok(printed.includes(piece.replace(/\s+/g,' ')),'print retains every original evidence part');
 }
 assert.equal(await page.locator('.pick-evidence[open]').count(),0);
 await page.setViewportSize({width:390,height:844});await page.locator('#weekDays').scrollIntoViewIfNeeded();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:out+'/mobile.png'});
 await page.locator('[data-evidence-key="pick-0"] summary').click();
 await page.screenshot({path:out+'/mobile-evidence.png'});
 assert.deepEqual(errors,[]);
 await writeFile(out+'/producer-check.json',JSON.stringify({agent:'astra-47b3-iris',browser:await b.version(),beforeHeight,afterHeight,checks:['same actual fixture response and saved-week assignments','native keyboard evidence disclosure','expanded evidence survives schedule move/reset','schedule focus remains on moved pick','actual PDF contains every full original explanation and source ID','print restores closed screen disclosures','390px no overflow'],errors},null,2));
 console.log(JSON.stringify({beforeHeight,afterHeight,errors,print:'complete original evidence verified'}));
}finally{await b.close();}
