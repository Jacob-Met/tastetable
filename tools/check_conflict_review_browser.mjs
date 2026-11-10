const {chromium}=await import(process.env.TASTETABLE_PLAYWRIGHT_MODULE || 'playwright');
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createVisitRecord,updateVisitRecord,makeVisitRecordFile} from '../static/visit_record.mjs';
await mkdir('docs/conflict-review',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.TASTETABLE_REVIEW_CHROMIUM,headless:true,chromiumSandbox:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(process.env.TASTETABLE_REVIEW_URL||'http://127.0.0.1:8876');
 await page.locator('#sampleBtn').click();
 await page.locator('#results').waitFor({state:'visible'});
 const download=page.waitForEvent('download');await page.locator('#saveWeek').click();
 const weekText=await readFile(await(await download).path(),'utf8');
 const payload=(name,record)=>({name,mimeType:'application/json',buffer:Buffer.from(makeVisitRecordFile(record).text)});
 let old=createVisitRecord(weekText,'Rosa original.json');
 old=updateVisitRecord(old,'pick-0',{outcome:'went',date:'2026-10-25',note:'PRIVATE caregiver detail'});
 const older=payload('Rosa-October-draft.json',old);
 const corrected=payload('Rosa-October-confirmed.json',updateVisitRecord(old,'pick-0',{outcome:'went',date:'2026-10-27',note:'PRIVATE updated detail'}));
 await page.locator('#visitHistory summary').first().click();
 await page.locator('#visitHistory input').setInputFiles(older);
 await page.locator('[data-history-use]').click();
 const initial=await page.locator('.prior-visit').allTextContents();
 const files=[older];
 for(let i=0;i<10;i++){const w=JSON.parse(weekText);w.savedAt='2026-11-'+String(i+1).padStart(2,'0')+'T00:00:00.000Z';files.push(payload('Other-week-'+i+'.json',createVisitRecord(JSON.stringify(w),'Another week.json')));}
 files.push(corrected);
 await page.locator('#visitHistory input').setInputFiles(files);
 await page.getByText(/Could not open visit record:/).waitFor();
 assert.deepEqual(await page.locator('.prior-visit').allTextContents(),initial);
 await page.locator('#visitHistory').scrollIntoViewIfNeeded();
 if(process.env.TASTETABLE_CAPTURE_BEFORE){
  await page.screenshot({path:'docs/conflict-review/before.png'});
  console.log(JSON.stringify({knownFailure:true,error:await page.locator('[data-history-status]').innerText(),files:files.length,conflictingNamesExposed:await page.getByText('Rosa-October-confirmed.json',{exact:false}).count()}));
 }else{
  const section=page.locator('[data-history-conflicts]');
  await section.waitFor({state:'visible'});
  const details=await section.innerText();
  assert.match(details,/Rosa-October-draft.json/);assert.match(details,/Rosa-October-confirmed.json/);
  assert.match(details,/2026-10-25/);assert.match(details,/2026-10-27/);
  assert.ok(!details.includes('PRIVATE'));
  await page.screenshot({path:'docs/conflict-review/desktop.png'});
  await page.setViewportSize({width:390,height:844});await section.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'docs/conflict-review/phone.png'});
  await page.locator('#visitHistory input').setInputFiles(files.slice(1));
  await page.locator('[data-history-use]').click();
  assert.equal(await section.isVisible(),false);
  assert.match((await page.locator('.prior-visit').allTextContents()).join(' '),/2026-10-27/);
  assert.ok(!(await page.locator('.prior-visit').allTextContents()).join(' ').includes('2026-10-25'));
  assert.deepEqual(errors,[]);
  console.log('12-file conflict review and correct-file recovery passed',await browser.version());
 }
}finally{await browser.close();}
