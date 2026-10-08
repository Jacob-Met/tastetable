/* Independent actual Chromium + unchanged native FastAPI in explicit mock mode.
 * Usage: node probe_browser.cjs SOURCE_ROOT NEW_OUTPUT_DIRECTORY
 * Dependencies are read-only existing runtime paths, overridable by TT_REVIEW_*.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

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
const names = ['app.py', 'agent.py', 'constraints.py', 'personas.py', 'qloo_client.py', 'fixtures/qloo_fixtures.json',
  'static/app.js', 'static/index.html', 'static/style.css', 'static/calendar.js', 'static/calendar.css',
  'static/plan-request.js', 'static/week_plan.mjs', 'static/week_file.mjs', 'static/venue_followup.mjs', 'static/venue_followup.css'];
const pins = () => Object.fromEntries(names.map(name => [name, sha(fs.readFileSync(path.join(root, name)))]));
const result = { schema: 'independent-tastetable-browser-receiving-v1', sourceRoot: root,
  sourceBefore: pins(), cases: [], nativeResponses: [], authoredResponseFixtures: [], downloads: [],
  pageErrors: [], externalRequests: [], observations: {}, node: process.version,
  boundary: 'Actual local Chromium and native FastAPI mock planner. Duplicate saved file and failed response are explicitly authored controls; no live venues, providers, shared browser, or physical print claim.' };
let server, browser, page, origin, serverLog = '', savedPath;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function check(name, run) {
  try { await run(); result.cases.push({ name, passed: true }); }
  catch (error) { result.cases.push({ name, passed: false, error: error.stack }); }
}
const card = key => page.locator(`[data-contact-key="${key}"]`);
const reply = key => card(key).locator('[data-contact-field="reply"]');
const move = (key, day) => page.locator(`#weekOrganizer select[data-pick-key="${key}"]`).selectOption(day);
const date = value => page.locator('#weekDate').fill(value);
async function download(selector, file) {
  const waiting = page.waitForEvent('download');
  await page.locator(selector).click();
  const received = await waiting;
  const destination = path.join(output, file);
  await received.saveAs(destination);
  const bytes = fs.readFileSync(destination);
  result.downloads.push({ file, suggestedFilename: received.suggestedFilename(), bytes: bytes.length, sha256: sha(bytes) });
  return bytes;
}
async function openSaved(file) {
  const waiting = page.waitForEvent('filechooser');
  await page.locator('#openWeek').click();
  await (await waiting).setFiles(file);
  await page.waitForFunction(() => document.querySelector('#requestStatus').textContent.startsWith('Saved week opened.'));
}
async function sample(file) {
  await page.locator('#personaSel').selectOption('rosa');
  const waiting = page.waitForResponse(response => response.url() === `${origin}/api/plan/sample/rosa`);
  await page.locator('#sampleBtn').click();
  const received = await waiting;
  assert.equal(received.status(), 200);
  const bytes = await received.body();
  const body = JSON.parse(bytes);
  assert.equal(body.mock, true);
  fs.writeFileSync(path.join(output, file), bytes, { flag: 'wx' });
  result.nativeResponses.push({ file, status: received.status(), sha256: sha(bytes), meals: body.plan.meals.length });
  await page.locator('#results').waitFor({ state: 'visible' });
  return body;
}

(async () => {
  const allocator = http.createServer();
  await new Promise(resolve => allocator.listen(0, '127.0.0.1', resolve));
  const port = allocator.address().port;
  await new Promise(resolve => allocator.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  const env = { ...process.env, PYTHONPATH: pythonPath, PYTHONDONTWRITEBYTECODE: '1', TASTETABLE_LIVE: '0',
    QLOO_API_KEY: '', QLOO_BASE_URL: 'http://127.0.0.1:0', TASTETABLE_LLM_BASE_URL: '' };
  delete env.TASTETABLE_LLM_API_KEY;
  delete env.TASTETABLE_LLM_MODEL;
  server = spawn(process.env.TT_REVIEW_PYTHON || 'python3', ['-B', '-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', String(port), '--log-level', 'warning'],
    { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', data => { serverLog += data; });
  server.stderr.on('data', data => { serverLog += data; });
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw Error(`Native app exited: ${serverLog}`);
    try { const health = await fetch(origin + '/api/health').then(r => r.json()); assert.equal(health.qloo_mode, 'mock'); ready = true; break; }
    catch { await sleep(100); }
  }
  assert.ok(ready, 'Native mock app did not become ready.');
  browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
  result.chromium = browser.version();
  const context = await browser.newContext({ viewport: { width: 1160, height: 900 }, acceptDownloads: true });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    result.externalRequests.push(route.request().url());
    return route.abort();
  });
  page = await context.newPage();
  page.on('pageerror', error => result.pageErrors.push(error.message));
  await page.goto(origin);
  await page.waitForFunction(() => !document.querySelector('#sampleBtn').disabled);
  const native = await sample('native-plan-1.json');
  await date('2026-12-28');
  assert.equal(await card('pick-0').count(), 1);
  assert.equal(await page.locator('[data-contact-key]').count(), 5);
  result.observations.nativePositiveControl = { meals: native.plan.meals.length, worksheetVisits: 5, source: await page.locator('[data-contact-source]').innerText() };

  await check('editable question and earlier reply remain distinguishable through the actual user interface', async () => {
    const editor = card('pick-0').getByRole('textbox', { name: /question/i });
    result.observations.editableQuestionCount = await editor.count();
    assert.equal(await editor.count(), 1, 'The agreed editable visit question has no user-facing editor.');
    const a = 'REVIEW QUESTION A: Is the east entrance step-free?';
    const b = 'REVIEW QUESTION B: Can lower-salt soup be prepared?';
    const answer = 'REVIEW REPLY A: Staff described the entrance, not the soup.';
    await editor.fill(a);
    await reply('pick-0').fill(answer);
    await card('pick-0').locator('[data-contact-field="status"]').selectOption('reply_recorded');
    await editor.fill(b);
    assert.equal(await card('pick-0').locator('[data-contact-field="status"]').inputValue(), 'follow_up');
    const text = (await download('[data-contact-download]', 'question-change.txt')).toString();
    for (const literal of [a, b, answer]) assert.ok(text.includes(literal), literal);
  });

  await check('literal leading line break survives a schedule refresh and a subsequent edit', async () => {
    const entered = '\nA literal first-line break belongs to this reply.';
    await reply('pick-0').fill(entered);
    const before = await reply('pick-0').inputValue();
    await move('pick-0', 'Thursday');
    await move('pick-0', 'Monday');
    const redisplayed = await reply('pick-0').inputValue();
    const printedBeforeEdit = await card('pick-0').locator('[data-contact-print="reply"]').textContent();
    await reply('pick-0').fill(redisplayed + ' [continued]');
    const printedAfterEdit = await card('pick-0').locator('[data-contact-print="reply"]').textContent();
    result.observations.leadingLineBreak = { entered, before, redisplayed, printedBeforeEdit, printedAfterEdit };
    assert.equal(redisplayed, entered, 'HTML textarea parsing removed the leading line break during re-render.');
    assert.equal(printedAfterEdit, entered + ' [continued]');
  });

  await check('move, omission, restore and another week preserve notes only at their original occurrence/date', async () => {
    const monday = 'REVIEW-MONDAY-ONLY', thursday = 'REVIEW-THURSDAY-ONLY';
    await reply('pick-0').fill(monday);
    await move('pick-0', 'Thursday');
    assert.equal(await reply('pick-0').inputValue(), '');
    await reply('pick-0').fill(thursday);
    await move('pick-0', '');
    assert.equal(await card('pick-0').count(), 0);
    const omitted = (await download('[data-contact-download]', 'omitted-call-sheet.txt')).toString();
    assert.ok(!omitted.includes(monday) && !omitted.includes(thursday));
    await page.locator('#resetWeek').click();
    assert.equal(await reply('pick-0').inputValue(), monday);
    await date('2027-01-04');
    assert.equal(await reply('pick-0').inputValue(), '');
    await date('2026-12-28');
    assert.equal(await reply('pick-0').inputValue(), monday);
    await date('');
    assert.equal(await page.locator('[data-contact-download]').isEnabled(), false);
    assert.equal(await page.locator('[data-contact-list]').isVisible(), false);
    await date('2026-12-28');
    assert.equal(await reply('pick-0').inputValue(), monday);
  });

  await check('literal markup is inert and preserved in actual print CSS and a downloaded call sheet', async () => {
    const literal = '<img src=x onerror="window.__independentNoteExecuted=true"> & "quoted"\nSecond line.';
    await reply('pick-0').fill(literal);
    await page.locator('#resetWeek').click();
    assert.equal(await reply('pick-0').inputValue(), literal);
    assert.equal(await page.evaluate(() => window.__independentNoteExecuted), undefined);
    assert.equal(await card('pick-0').locator('img,script').count(), 0);
    await page.emulateMedia({ media: 'print' });
    const print = card('pick-0').locator('[data-contact-print="reply"]');
    assert.equal(await print.isVisible(), true);
    assert.equal(await print.textContent(), literal);
    for (const editor of await card('pick-0').locator('.contact-edit').all()) {
      assert.equal(await editor.isVisible(), false);
    }
    assert.ok((await page.locator('[data-contact-source]').innerText()).includes('fictional'));
    result.observations.print = { method: 'Actual Chromium print-media CSS and DOM; no physical printer or PDF.', literalReply: await print.textContent() };
    await page.emulateMedia({ media: 'screen' });
    const text = (await download('[data-contact-download]', 'literal-call-sheet.txt')).toString();
    assert.ok(text.includes(literal.split('\n').map(line => '  ' + line).join('\n')));
    assert.ok(text.includes(native.plan.meals[0].why));
  });

  await check('saved-week open, repeated open, input retirement and a newly accepted native plan start blank notes', async () => {
    const sentinel = 'REVIEW-LOCAL-NOTE-NOT-IN-WEEK-FILE';
    await reply('pick-0').fill(sentinel);
    const bytes = await download('#saveWeek', 'independent-saved-week.json');
    savedPath = path.join(output, 'independent-saved-week.json');
    assert.ok(!bytes.toString().includes(sentinel));
    await page.locator('#form [name="city"]').fill('Another synthetic city');
    assert.equal(await page.locator('#venueFollowup').isVisible(), false);
    assert.equal(await page.locator('[data-contact-key]').count(), 0);
    await openSaved(savedPath);
    assert.equal(await reply('pick-0').inputValue(), '');
    assert.ok((await page.locator('[data-contact-source]').innerText()).includes('independent-saved-week.json'));
    await reply('pick-0').fill(sentinel);
    await openSaved(savedPath);
    assert.equal(await reply('pick-0').inputValue(), '');
    await reply('pick-0').fill(sentinel);
    await sample('native-plan-2.json');
    assert.equal(await reply('pick-0').inputValue(), '');
  });

  await check('two authored saved-plan occurrences at the same venue and date retain distinct user replies', async () => {
    assert.ok(savedPath, 'The preceding actual save must supply the native input envelope.');
    const { readWeekFile, makeWeekFile } = await import(pathToFileURL(path.join(root, 'static/week_file.mjs')));
    const { createWeekPlan } = await import(pathToFileURL(path.join(root, 'static/week_plan.mjs')));
    const opened = readWeekFile(fs.readFileSync(savedPath, 'utf8'));
    const duplicate = structuredClone(opened.response);
    duplicate.plan.meals[1] = { ...structuredClone(duplicate.plan.meals[0]), day: 'Monday' };
    const state = createWeekPlan(duplicate, '2026-12-28');
    const file = makeWeekFile({ response: duplicate, inputs: opened.inputs, receivedAt: opened.receivedAt, calendarId: opened.calendarId, state });
    const location = path.join(output, 'authored-duplicate-week.json');
    fs.writeFileSync(location, file.text, { flag: 'wx' });
    result.authoredResponseFixtures.push({ kind: 'duplicate saved week derived from the original native mock response', file: path.basename(location), sha256: sha(Buffer.from(file.text)) });
    await openSaved(location);
    assert.equal(await card('pick-0').getAttribute('data-contact-date'), await card('pick-1').getAttribute('data-contact-date'));
    await reply('pick-0').fill('REVIEW-FIRST-OCCURRENCE');
    assert.equal(await reply('pick-1').inputValue(), '');
    await reply('pick-1').fill('REVIEW-SECOND-OCCURRENCE');
    await move('pick-0', '');
    assert.equal(await reply('pick-1').inputValue(), 'REVIEW-SECOND-OCCURRENCE');
    await page.locator('#resetWeek').click();
    assert.equal(await reply('pick-0').inputValue(), 'REVIEW-FIRST-OCCURRENCE');
    assert.equal(await reply('pick-1').inputValue(), 'REVIEW-SECOND-OCCURRENCE');
    const text = (await download('[data-contact-download]', 'duplicate-call-sheet.txt')).toString();
    assert.ok(text.includes('Suggested visit 1;') && text.includes('Suggested visit 2;'));
    assert.ok(text.includes('authored-duplicate-week.json') && text.includes('not been run again'));
  });

  await check('a failed replacement leaves the prior worksheet retired', async () => {
    await reply('pick-0').fill('REVIEW-MUST-RETIRE-ON-REPLACEMENT');
    await page.route('**/api/plan', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Independent authored failure control' }) }));
    result.authoredResponseFixtures.push({ kind: 'browser-intercepted HTTP 500 replacement control', nativeBackendResponse: false });
    await page.locator('#form button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('#requestStatus').textContent.startsWith('We could not prepare this plan:'));
    assert.equal(await page.locator('#results').isVisible(), false);
    assert.equal(await page.locator('#venueFollowup').isVisible(), false);
    assert.equal(await page.locator('[data-contact-key]').count(), 0);
    assert.equal(await page.locator('[data-contact-download]').isEnabled(), false);
    assert.equal(await page.locator('#printWeek').isEnabled(), false);
    await page.unroute('**/api/plan');
  });
})().catch(error => { result.harnessError = error.stack; }).finally(async () => {
  if (browser) await browser.close();
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([new Promise(resolve => server.once('exit', resolve)), sleep(3000)]);
    if (server.exitCode === null) server.kill('SIGKILL');
  }
  result.sourceAfter = pins();
  result.sourceUnchanged = JSON.stringify(result.sourceBefore) === JSON.stringify(result.sourceAfter);
  result.passed = result.cases.filter(c => c.passed).length;
  result.failed = result.cases.filter(c => !c.passed).length;
  result.skipped = 0;
  result.liveVenueOrProviderCalls = 0;
  fs.writeFileSync(path.join(output, 'server.log'), serverLog, { flag: 'wx' });
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  fs.rmSync(temporary, { recursive: true, force: true });
  console.log(JSON.stringify({ passed: result.passed, failed: result.failed, harnessError: result.harnessError || null,
    sourceUnchanged: result.sourceUnchanged, externalRequests: result.externalRequests.length, pageErrors: result.pageErrors.length,
    result: path.join(output, 'result.json') }));
  process.exitCode = result.failed || result.harnessError || !result.sourceUnchanged || result.externalRequests.length || result.pageErrors.length ? 1 : 0;
});
