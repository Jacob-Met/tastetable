const {chromium}=await import(process.env.TASTETABLE_PLAYWRIGHT_MODULE || 'playwright');
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createVisitRecord,updateVisitRecord,makeVisitRecordFile} from '../static/visit_record.mjs';
await mkdir('docs/inplace-history',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.TASTETABLE_REVIEW_CHROMIUM,headless:true,chromiumSandbox:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(process.env.TASTETABLE_REVIEW_URL||'http://127.0.0.1:8878');
 await page.locator('#sampleBtn').click();
 await page.locator('#results').waitFor({state:'visible'});
 const download=page.waitForEvent('download');await page.locator('#saveWeek').click();
 const weekText=await readFile(await(await download).path(),'utf8');
 const payload=(name,record)=>({name,mimeType:'application/json',buffer:Buffer.from(makeVisitRecordFile(record).text)});
 let old=createVisitRecord(weekText,'Rosa original.json');
 old=updateVisitRecord(old,'pick-0',{outcome:'went',date:'2026-10-25',note:'PRIVATE caregiver detail'});
 old=updateVisitRecord(old,'pick-1',{outcome:'went',date:'2026-10-26'});
 const older=payload('Rosa-October-draft.json',old);
 const correctedRecord=updateVisitRecord(updateVisitRecord(old,'pick-0',{outcome:'went',date:'2026-10-27',note:'PRIVATE updated detail'}),'pick-1',{outcome:'did_not_go',date:'2026-10-26'});
 const corrected=payload('Rosa-October-draft.json',correctedRecord);
 await page.locator('#visitHistory summary').first().click();
 await page.locator('#visitHistory input[type="file"]').setInputFiles(older);
 await page.locator('[data-history-use]').click();
 const initial=await page.locator('.prior-visit').allTextContents();
 const files=[older];
 for(let i=0;i<10;i++){const w=JSON.parse(weekText);w.savedAt='2026-11-'+String(i+1).padStart(2,'0')+'T00:00:00.000Z';files.push(payload('Other-week-'+i+'.json',createVisitRecord(JSON.stringify(w),'Another week.json')));}
 files.push(corrected);
 await page.locator('#visitHistory input[type="file"]').setInputFiles(files);
 await page.getByText(/current visit context is still in use/).waitFor();
 assert.deepEqual(await page.locator('.prior-visit').allTextContents(),initial);
 await page.locator('#visitHistory').scrollIntoViewIfNeeded();
 if(process.env.TASTETABLE_CAPTURE_BEFORE){
  await page.screenshot({path:'docs/inplace-history/before.png'});
  console.log(JSON.stringify({knownFailure:true,error:await page.locator('[data-history-status]').innerText(),files:files.length,conflictingNamesExposed:await page.getByText('Rosa-October-confirmed.json',{exact:false}).count()}));
 }else{
  const section=page.locator('[data-history-conflicts]');
  await section.waitFor({state:'visible'});
  const details=await section.innerText();
  assert.match(details,/Rosa-October-draft.json/);assert.match(details,/File 12: Rosa-October-draft.json/);
  assert.match(details,/2026-10-25/);assert.match(details,/2026-10-27/);
  assert.ok(!details.includes('PRIVATE'));
  await page.screenshot({path:'docs/inplace-history/desktop.png'});
  await page.setViewportSize({width:390,height:844});await section.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:'docs/inplace-history/phone.png'});

  const choices=page.locator('[data-history-keep]');
  assert.equal(await choices.count(),12);
  assert.match(await section.innerText(),/2 entries marked went/);
  await page.locator('[data-history-keep="0"]').uncheck();
  assert.equal(await page.locator('[data-history-preview]').isVisible(),false);
  assert.match(await section.innerText(),/Omitting this whole file · 2 entries marked went/);
  await page.screenshot({path:'docs/inplace-history/omission-phone.png'});
  await page.locator('[data-history-review-kept]').click();
  await page.locator('[data-history-preview]').waitFor({state:'visible'});
  assert.match(await page.locator('[data-history-summary]').innerText(),/1 whole file omitted/);
  assert.deepEqual(await page.locator('.prior-visit').allTextContents(),initial);
  // Changing any choice invalidates a previously reviewed selection.
  await page.locator('[data-history-keep="0"]').check();
  assert.equal(await page.locator('[data-history-preview]').isVisible(),false);
  await page.locator('[data-history-review-kept]').click();
  await page.getByRole('heading',{name:'Resolve conflicting records'}).waitFor();
  assert.equal(await page.locator('[data-history-preview]').isVisible(),false);
  await page.locator('[data-history-keep="0"]').uncheck();
  await page.locator('[data-history-review-kept]').click();
  await page.locator('[data-history-preview]').waitFor({state:'visible'});
  await page.locator('[data-history-use]').click();
  assert.equal(await section.isVisible(),false);
  assert.match((await page.locator('.prior-visit').allTextContents()).join(' '),/2026-10-27/);
  assert.ok(!(await page.locator('.prior-visit').allTextContents()).join(' ').includes('2026-10-25'));

  const applied=await page.locator('.prior-visit').allTextContents();
  await page.locator('#visitHistory input[type="file"]').setInputFiles(files);
  await page.getByRole('heading',{name:'Resolve conflicting records'}).waitFor();
  await page.getByText(/10 other files · 10 kept/).click();
  for(let i=0;i<12;i++) await page.locator('[data-history-keep="'+i+'"]').uncheck();
  await page.locator('[data-history-review-kept]').click();
  await page.getByText('Keep at least one file, or cancel this review.',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-history-preview]').isVisible(),false);
  assert.deepEqual(await page.locator('.prior-visit').allTextContents(),applied);
  await page.getByRole('button',{name:'Cancel file review',exact:true}).click();
  assert.equal(await section.isVisible(),false);
  assert.deepEqual(await page.locator('.prior-visit').allTextContents(),applied);
  assert.deepEqual(errors,[]);
  console.log('12-file in-place recovery, whole-file impact and review invalidation passed',await browser.version());
 }
}finally{await browser.close();}
