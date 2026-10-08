/* Independent supplementary receiving for the disclosed question editor.
 * The original browser probe remains unchanged. This one uses the actual
 * visible disclosure before editing, and checks its question/reply boundary.
 * node probe_question_disclosure.cjs SOURCE_ROOT NEW_OUTPUT_DIRECTORY
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = fs.realpathSync(process.argv[2]);
const output = path.resolve(process.argv[3]);
fs.mkdirSync(output);
const temporary = path.join(output, 'tmp');
fs.mkdirSync(temporary);
process.env.TMPDIR = temporary;
const { chromium } = require(process.env.TT_REVIEW_PLAYWRIGHT || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const chrome = process.env.TT_REVIEW_CHROMIUM || '/tmp/hamon-project-browser-ce7eb129730f/portable-153/chromium';
const pythonPath = process.env.TT_REVIEW_PYTHONPATH || '/dev/shm/estate-60b2c08feb01-runtime/suite-venv/lib/python3.12/site-packages';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const names = ['app.py','agent.py','constraints.py','personas.py','qloo_client.py','fixtures/qloo_fixtures.json','static/app.js','static/index.html','static/style.css','static/calendar.js','static/calendar.css','static/plan-request.js','static/week_plan.mjs','static/week_file.mjs','static/venue_followup.mjs','static/venue_followup.css'];
const pins = () => Object.fromEntries(names.map(name => [name,sha(fs.readFileSync(path.join(root,name)))]));
const result = { schema:'independent-tastetable-question-disclosure-v1', sourceRoot:root, sourceBefore:pins(), probeSha256:sha(fs.readFileSync(__filename)), node:process.version,
  boundary:'Actual private Chromium and native FastAPI mock planner. This supplements, without changing, the original direct-textbox probe. No live venue/provider, physical printer, PDF or shared-browser claim.',
  passed:0, failed:0, skipped:0, pageErrors:[], externalRequests:[] };
let server, browser, serverLog='';
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  const allocator=http.createServer();
  await new Promise(resolve=>allocator.listen(0,'127.0.0.1',resolve));
  const port=allocator.address().port;
  await new Promise(resolve=>allocator.close(resolve));
  const origin='http://127.0.0.1:'+port;
  const env={...process.env,PYTHONPATH:pythonPath,PYTHONDONTWRITEBYTECODE:'1',TASTETABLE_LIVE:'0',QLOO_API_KEY:'',QLOO_BASE_URL:'http://127.0.0.1:0',TASTETABLE_LLM_BASE_URL:''};
  delete env.TASTETABLE_LLM_API_KEY; delete env.TASTETABLE_LLM_MODEL;
  server=spawn(process.env.TT_REVIEW_PYTHON||'python3',['-B','-m','uvicorn','app:app','--host','127.0.0.1','--port',String(port),'--log-level','warning'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  server.stdout.on('data',x=>{serverLog+=x;}); server.stderr.on('data',x=>{serverLog+=x;});
  let ready=false;
  for(let i=0;i<80;i++){
    if(server.exitCode!==null) throw Error('Native app exited: '+serverLog);
    try{const health=await fetch(origin+'/api/health').then(x=>x.json());assert.equal(health.qloo_mode,'mock');ready=true;break;}catch{await sleep(100);}
  }
  assert.ok(ready,'Native mock app did not become ready.');
  browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
  result.chromium=browser.version();
  const context=await browser.newContext({viewport:{width:1160,height:900},acceptDownloads:true});
  await context.route('**/*',route=>{
    if(new URL(route.request().url()).origin===origin) return route.continue();
    result.externalRequests.push(route.request().url());return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',x=>result.pageErrors.push(x.message));
  await page.goto(origin);
  await page.waitForFunction(()=>!document.querySelector('#sampleBtn').disabled);
  await page.locator('#personaSel').selectOption('rosa');
  const nativeWaiting=page.waitForResponse(r=>r.url()===origin+'/api/plan/sample/rosa');
  await page.locator('#sampleBtn').click();
  const native=await nativeWaiting;assert.equal(native.status(),200);
  const nativeBytes=await native.body(), nativeBody=JSON.parse(nativeBytes);assert.equal(nativeBody.mock,true);
  fs.writeFileSync(path.join(output,'native-plan.json'),nativeBytes,{flag:'wx'});
  result.nativeResponse={status:200,bytes:nativeBytes.length,sha256:sha(nativeBytes),meals:nativeBody.plan.meals.length};
  await page.locator('#results').waitFor({state:'visible'});
  await page.locator('#weekDate').fill('2026-12-28');
  const visit=page.locator('[data-contact-key="pick-0"]');
  const disclosure=visit.locator('summary').filter({hasText:'Edit questions for this visit'});
  assert.equal(await disclosure.count(),1);
  assert.equal(await disclosure.isVisible(),true);
  result.initiallyExposedQuestionTextboxes=await visit.getByRole('textbox',{name:/question/i}).count();
  await disclosure.click();
  const question=visit.getByRole('textbox',{name:/question/i});
  assert.equal(await question.count(),1);assert.equal(await question.isVisible(),true);
  const reply=visit.locator('[data-contact-field="reply"]'), status=visit.locator('[data-contact-field="status"]');
  const a='DISCLOSURE QUESTION A: Is the east entrance step-free?';
  const b='DISCLOSURE QUESTION B: Can lower-salt soup be prepared?';
  const answer='DISCLOSURE REPLY A: Staff described the entrance, not the soup.';
  await question.fill(a);await reply.fill(answer);await status.selectOption('reply_recorded');await question.fill(b);
  assert.equal(await status.inputValue(),'follow_up');
  assert.equal(await visit.locator('[data-contact-earlier]').isVisible(),true);
  assert.equal(await visit.locator('[data-contact-reply-questions]').textContent(),a);
  assert.equal(await visit.locator('[data-contact-print="reply"]').textContent(),answer);
  await status.selectOption('reply_recorded');
  assert.equal(await status.inputValue(),'follow_up');
  assert.match(await page.locator('[data-contact-status]').textContent(),/Update the reply for the revised questions/);
  await visit.locator('[data-contact-field="nextStep"]').fill('Ask separately about the revised question.');
  assert.equal(await visit.locator('[data-contact-earlier]').isVisible(),true);
  assert.equal(await visit.locator('[data-contact-reply-questions]').textContent(),a);
  assert.equal(await reply.inputValue(),answer);
  await page.emulateMedia({media:'print'});
  for(const item of await visit.locator('.contact-edit').all()) assert.equal(await item.isVisible(),false);
  for(const text of [a,b,answer]) assert.ok((await visit.innerText()).includes(text),text);
  result.printBoundary='Actual Chromium print-media CSS and DOM; no physical printer or PDF.';
  await page.emulateMedia({media:'screen'});
  const downloadWaiting=page.waitForEvent('download');
  await page.locator('[data-contact-download]').click();
  const download=await downloadWaiting, destination=path.join(output,'question-change.txt');
  await download.saveAs(destination);
  const downloaded=fs.readFileSync(destination), content=downloaded.toString();
  for(const text of [a,b,answer]) assert.ok(content.includes(text),text);
  result.download={file:'question-change.txt',bytes:downloaded.length,sha256:sha(downloaded),suggestedFilename:download.suggestedFilename()};
  const revised='DISCLOSURE REPLY B: Staff separately answered the soup question.';
  await reply.fill(revised);await status.selectOption('reply_recorded');
  assert.equal(await status.inputValue(),'reply_recorded');
  assert.equal(await visit.locator('[data-contact-earlier]').isVisible(),false);
  assert.equal(await visit.locator('[data-contact-print="reply"]').textContent(),revised);
  result.observed={namedDisclosureOpened:true,questionEditable:true,earlierQuestionAndReplyRetained:true,falseReplyRecordedRefused:true,nextStepCannotRebindReply:true,explicitReplyEditRebindsCurrentQuestion:true};
  assert.deepEqual(result.pageErrors,[]);assert.deepEqual(result.externalRequests,[]);
  result.passed=1;
})().catch(error=>{result.failed=1;result.error=error.stack;}).finally(async()=>{
  if(browser) await browser.close();
  if(server&&server.exitCode===null){server.kill('SIGTERM');await Promise.race([new Promise(resolve=>server.once('exit',resolve)),sleep(2000)]);}
  result.sourceAfter=pins();result.sourceUnchanged=JSON.stringify(result.sourceBefore)===JSON.stringify(result.sourceAfter);
  result.liveVenueOrProviderCalls=0;
  fs.writeFileSync(path.join(output,'server.log'),serverLog,{flag:'wx'});
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  fs.rmSync(temporary,{recursive:true,force:true});
  console.log(JSON.stringify({passed:result.passed,failed:result.failed,sourceUnchanged:result.sourceUnchanged,pageErrors:result.pageErrors.length,externalRequests:result.externalRequests.length,result:path.join(output,'result.json')}));
  process.exitCode=result.failed||!result.sourceUnchanged||result.pageErrors.length||result.externalRequests.length?1:0;
});
