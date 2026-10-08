/* Exercise the actual served UI. No application source or rendered DOM is replaced. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {spawn, execFileSync} = require('node:child_process');
const {chromium} = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const root = __dirname;
const source = '/workspace/scratch/6e5752b49b6f/agents/github_integration/tastetable-candidate';
const expectedCommit = '2ab4bc187f47acbf4ec193be33f57163c67a9e0c';
const python = '/workspace/scratch/6e5752b49b6f/agents/github_integration/venv/bin/python';
const executable = '/tmp/hamon-project-browser-ce7eb129730f/portable-153/chromium';
const out = path.join(root, 'results');
fs.mkdirSync(out, {recursive:true});
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const jsonFile = (name, object) => fs.writeFileSync(path.join(out, name), JSON.stringify(object, null, 2) + '\n');
const git = (...args) => execFileSync('git', args, {cwd:source});
assert.equal(git('rev-parse', 'HEAD').toString().trim(), expectedCommit);
git('diff', '--exit-code', 'HEAD', '--', 'app.py', 'agent.py', 'qloo_client.py', 'static');
fs.writeFileSync(path.join(out, 'mode.txt'), 'healthy\n');
for (const name of ['server.json', 'transport.jsonl']) {
  const file = path.join(out, name);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
const logfd = fs.openSync(path.join(out, 'server.log'), 'w');
const server = spawn(python, ['-u', path.join(root, 'serve_receiving.py'), source, out], {
  cwd:root, stdio:['ignore', logfd, logfd], env:{PATH:'/usr/bin:/bin', LANG:'C.UTF-8', PYTHONUNBUFFERED:'1'}
});

const report = {started_at:new Date().toISOString(), source_commit:expectedCommit,
  source_tree:git('rev-parse','HEAD^{tree}').toString().trim(),
  browser:{executable, executable_sha256:sha256(fs.readFileSync(executable)),
    playwright:require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json').version},
  source_assets:{}, cases:[], page_errors:[], console_errors:[], dialogs:[], blocked_requests:[]};
let browser;
let exitCode = 0;

async function main() {
  const readyDeadline = Date.now() + 15000;
  while (!fs.existsSync(path.join(out, 'server.json'))) {
    if (server.exitCode !== null) throw new Error(`backend exited ${server.exitCode}`);
    if (Date.now() > readyDeadline) throw new Error('backend readiness deadline exceeded');
    await new Promise(resolve=>setTimeout(resolve, 25));
  }
  const serverInfo = JSON.parse(fs.readFileSync(path.join(out, 'server.json')));
  const origin = `http://127.0.0.1:${serverInfo.port}`;
  report.server = serverInfo;
  while (true) {
    try { if ((await fetch(origin + '/api/health')).ok) break; } catch {}
    if (Date.now() > readyDeadline) throw new Error('backend health deadline exceeded');
    await new Promise(resolve=>setTimeout(resolve, 25));
  }
  browser = await chromium.launch({executablePath:executable, headless:true,
    args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu',
      '--disable-background-networking','--no-first-run','--no-default-browser-check']});
  report.browser.version = browser.version();
  const context = await browser.newContext({viewport:{width:1365,height:1050},
    deviceScaleFactor:1, reducedMotion:'reduce', serviceWorkers:'block'});
  await context.route('**/*', route => {
    const url = route.request().url();
    if (new URL(url).origin === origin) return route.continue();
    report.blocked_requests.push(url);
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  page.on('pageerror', err => report.page_errors.push(String(err)));
  page.on('console', message => {if(message.type() === 'error') report.console_errors.push(message.text());});
  page.on('dialog', async dialog => {report.dialogs.push({type:dialog.type(),message:dialog.message()}); await dialog.dismiss();});
  const assetPaths = {'/':'static/index.html','/static/app.js':'static/app.js','/static/style.css':'static/style.css'};
  const assetPromises = [];
  page.on('response', response => {
    const relative = new URL(response.url()).pathname;
    if (assetPaths[relative]) assetPromises.push((async()=>{
      const filename = assetPaths[relative];
      const bytes = await response.body();
      const pinned = git('show', `${expectedCommit}:${filename}`);
      assert.equal(response.status(), 200);
      assert.equal(sha256(bytes), sha256(pinned), `served asset differs: ${filename}`);
      report.source_assets[relative] = {file:filename, sha256:sha256(bytes), bytes:bytes.length,
        git_blob:git('rev-parse', `${expectedCommit}:${filename}`).toString().trim()};
    })());
  });
  await page.goto(origin, {waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelectorAll('#personaSel option').length === 3);
  assert.equal(await page.locator('#personaSel').inputValue(), 'rosa');
  assert.match(await page.locator('#mode').innerText(), /recorded synthetic fixture/);
  await Promise.all(assetPromises);
  assert.equal(Object.keys(report.source_assets).length, 3);

  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const normal = text => text.replace(/\s+/g,' ').trim();

  async function captureCase(name, mode, expectedPicks, expectedErrors, submit = false) {
    fs.writeFileSync(path.join(out, 'mode.txt'), mode + '\n');
    const route = submit ? '/api/plan' : '/api/plan/sample/rosa';
    const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === route && response.request().method() === 'POST');
    await page.locator(submit ? '#form button[type=submit]' : '#sampleBtn').click();
    const response = await responsePromise;
    assert.equal(response.status(), 200);
    const payload = await response.json();
    jsonFile(`${name}-response.json`, payload);
    const expectedItems = [...payload.plan.meals, ...(payload.plan.outing ? [payload.plan.outing] : [])]
      .sort((a,b)=>days.indexOf(a.day)-days.indexOf(b.day));
    assert.equal(expectedItems.length, expectedPicks);
    await page.waitForFunction(count => !document.querySelector('#results').hidden &&
      document.querySelectorAll('#plan > li').length === count, expectedPicks);
    const displayed = (await page.locator('#plan > li').allTextContents()).map(normal);
    assert.equal(displayed.length, expectedPicks);
    for (let i=0; i<expectedItems.length; i++) {
      const expected = expectedItems[i];
      assert.ok(displayed[i].includes(`${expected.day} · ${expected.name}`), `item ${i} source name/day mismatch`);
      assert.ok(displayed[i].includes(`Qloo id: ${expected.entity_id}`), `item ${i} source entity mismatch`);
      assert.ok(displayed[i].includes(`affinity ${expected.affinity.toFixed(2)}`), `item ${i} source affinity mismatch`);
    }
    const trace = payload.trace.filter(row=>row.result_summary.startsWith('QlooError:'));
    assert.equal(trace.length, expectedErrors);
    const errorRows = page.locator('#trace > li').filter({hasText:'QlooError:'});
    assert.equal(await errorRows.count(), expectedErrors);
    const traceDetails = page.locator('details').filter({has:page.locator('#trace')});
    assert.equal(await traceDetails.getAttribute('open'), null);
    const visibleErrorRows = [];
    for (let i=0; i<await errorRows.count(); i++) visibleErrorRows.push(await errorRows.nth(i).isVisible());
    const visibleBody = await page.locator('body').innerText();
    const baselines = await page.locator('#baseline > li').allTextContents();
    assert.equal(baselines.length, 5);
    assert.equal(await page.locator('#baseline .badge.bad').count(), 5);
    assert.ok(baselines.every(text=>text.includes('unverified')));
    const groundedPicks = await page.locator('#compare tr').filter({hasText:'Picks'}).locator('td').nth(1).innerText();
    assert.equal(groundedPicks, String(expectedPicks));
    assert.equal(await page.locator('#sampleBtn').isEnabled(), true);
    assert.equal(await page.locator('#form button[type=submit]').isEnabled(), true);
    const formState = await page.locator('#form').evaluate(form=>({
      cuisines:form.cuisines.value, music:form.music.value, films:form.films.value, city:form.city.value,
      constraints:[...form.querySelectorAll('[name=constraints]:checked')].map(input=>input.value),
      top:form.getBoundingClientRect().top, disabled:form.matches(':disabled')
    }));
    const result = {name, mode, status:response.status(), request_route:route,
      request_body:response.request().postDataJSON(), grounded_items:expectedItems,
      displayed_grounded_items:displayed, grounded_picks_table:Number(groundedPicks),
      baseline_items:baselines.map(normal), baseline_label:await page.locator('.baseline h2').innerText(),
      notes:await page.locator('#notes').innerText(), error_trace:trace,
      trace_open_initially:false, error_rows_initially_visible:visibleErrorRows,
      visible_error_message:visibleBody.includes('QlooError:') || visibleBody.includes('authored receiving refusal'),
      form:formState, controls_enabled:true};
    fs.writeFileSync(path.join(out, `${name}-visible.txt`), visibleBody + '\n');
    await page.screenshot({path:path.join(out,`${name}.png`),fullPage:true,animations:'disabled'});
    if (expectedErrors) {
      await traceDetails.locator('summary').click();
      for (let i=0; i<expectedErrors; i++) assert.equal(await errorRows.nth(i).isVisible(), true);
      result.error_visible_after_opening_trace = true;
      result.open_trace_text = await traceDetails.innerText();
      await traceDetails.screenshot({path:path.join(out,`${name}-trace-open.png`),animations:'disabled'});
      await traceDetails.locator('summary').click();
    }
    report.cases.push(result);
    return payload;
  }

  const healthy = await captureCase('01-complete-persona','healthy',5,0);
  const partial = await captureCase('02-outing-refusal','outing_fail',4,1);
  assert.deepEqual(partial.plan.meals, healthy.plan.meals);
  assert.equal(partial.plan.outing, null);
  const empty = await captureCase('03-all-recommendations-refused','all_fail',0,3);
  assert.deepEqual(empty.plan.meals, []);
  assert.equal(empty.plan.outing, null);
  assert.equal(await page.locator('#plan').innerText(), '');
  await page.locator('#form input[name=music]').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('#form input[name=music]').isEditable(), true);
  await page.locator('#form input[name=music]').fill('Celia Cruz, Frank Sinatra');
  await page.screenshot({path:path.join(out,'04-return-to-editing.png'),animations:'disabled'});
  const recovery = await captureCase('05-edited-form-recovery','healthy',5,0,true);
  const recoveryCase = report.cases.at(-1);
  assert.deepEqual(recoveryCase.request_body.music, ['Celia Cruz','Frank Sinatra']);
  assert.equal(await page.locator('#form input[name=music]').inputValue(), 'Celia Cruz, Frank Sinatra');
  assert.equal(recovery.plan.meals.length, 4);
  assert.ok(recovery.plan.outing);
  report.recovery = {edited_field:'music', before:'Celia Cruz', after:'Celia Cruz, Frank Sinatra',
    route:'/api/plan', status:200, grounded_picks:5,
    mechanism:'Scroll back to the still-present form, edit an input, click Plan my week'};
  report.qualification = {
    exact_served_assets:true, default_persona_complete:true, partial_meals_preserved:true,
    missing_outing_not_invented:true, all_error_plan_empty_without_stale_items:true,
    comparison_labels_unverified_items:true, error_evidence_available_in_collapsed_trace:true,
    errors_visible_without_expanding_trace:false, form_recovery_verified:true,
    docker:'unavailable; no container execution claimed'};
  assert.deepEqual(report.page_errors, []);
  assert.deepEqual(report.console_errors, []);
  assert.deepEqual(report.dialogs, []);
  assert.deepEqual(report.blocked_requests, []);
  await context.close();
}

(async()=>{
  try {await main(); report.completed_at = new Date().toISOString(); report.status='completed_with_display_finding';}
  catch(error) {report.status='harness_failed';report.failure=String(error.stack || error);exitCode=1;}
  finally {
    if(browser) await browser.close();
    server.kill('SIGTERM');
    await new Promise(resolve=>{if(server.exitCode!==null || server.signalCode) return resolve();server.once('exit',resolve);});
    fs.closeSync(logfd);
    if(fs.existsSync(path.join(out,'transport.jsonl'))) {
      report.transport_events=fs.readFileSync(path.join(out,'transport.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
      if(report.transport_events.some(event=>event.event==='forbidden_outbound_attempt')) {report.status='harness_failed';exitCode=1;}
    }
    try {git('diff','--exit-code','HEAD','--','app.py','agent.py','qloo_client.py','static');report.production_sources_unchanged=true;}
    catch(error) {report.production_sources_unchanged=false;exitCode=1;}
    jsonFile('browser-receiving.json',report);
    console.log(JSON.stringify({status:report.status, source_commit:report.source_commit,
      cases:report.cases.map(c=>({name:c.name,picks:c.grounded_picks_table,errors:c.error_trace.length,errors_visible:c.visible_error_message})),
      result:path.join(out,'browser-receiving.json'),failure:report.failure},null,2));
    process.exitCode=exitCode;
  }
})();
