const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const source = path.resolve(process.argv[2]);
const output = path.resolve(process.argv[3]);
const personas = [
  { id: 'sample-a', label: 'Fictional A', cuisines: ['Cuisine A'], music: ['Artist A'], films: ['Film A'], city: 'City A', constraints: ['wheelchair'] },
  { id: 'sample-b', label: 'Fictional B', cuisines: ['Cuisine B'], music: ['Artist B'], films: ['Film B'], city: 'City B', constraints: ['low_sodium'] },
];
const requests = [];
function payload(name) {
  return {
    plan: { meals: [{ day: 'Monday', name, kind: 'restaurant', affinity: 0.75, entity_id: 'INDEPENDENT-FIXTURE', why: 'Synthetic receiving response' }], outing: null, notes: [], rejected: [] },
    llm_only: { meals: [], outing: { day: 'Friday', name: 'Fictional baseline', why: 'Synthetic receiving response' } },
    comparison: { grounded: { picks: 1, with_qloo_entity_id: 1, with_affinity_evidence: 1, constraint_checked: 1, unsafe_candidates_rejected: 0 }, llm_only: { picks: 1 } },
    trace: [{ tool: 'independent_fixture', args: {}, result_summary: 'No provider call' }],
  };
}
const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/api/plan')) {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    requests.push({ url: req.url, body });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload(req.url.endsWith('/sample-a') ? 'A plan' : req.url.endsWith('/sample-b') ? 'B plan' : 'Initial plan')));
    return;
  }
  const json = req.url === '/api/health' ? { qloo_mode: 'mock' } : req.url === '/api/personas' ? personas : null;
  if (json) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(json)); return; }
  const file = req.url === '/' ? 'static/index.html' : /^\/static\/[a-z.-]+$/.test(req.url) ? req.url.slice(1) : null;
  if (!file || !fs.existsSync(path.join(source, file))) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' });
  res.end(fs.readFileSync(path.join(source, file)));
});

async function snapshot(page) {
  return page.evaluate(() => ({
    persona: document.querySelector('#personaSel').value,
    form: Object.fromEntries(['cuisines', 'music', 'films', 'city'].map(name => [name, document.querySelector(`[name=${name}]`).value])),
    constraints: [...document.querySelectorAll('[name=constraints]:checked')].map(x => x.value),
    resultsHidden: document.querySelector('#results').hidden,
    plan: document.querySelector('#plan').textContent.trim(),
    status: document.querySelector('#requestStatus').textContent,
    busy: document.querySelector('#form').getAttribute('aria-busy'),
    cancelHidden: document.querySelector('#cancelPlan').hidden,
    traceExpanded: document.querySelector('#trace').closest('details').open,
    reads: window.__receivingReads.map(x => ({ url: x.url, aborted: x.signal?.aborted || false, released: x.released })),
  }));
}
async function release(page, index) {
  await page.evaluate(i => window.__receivingReads[i].release(), index);
  await page.waitForFunction(i => window.__receivingReads[i].released, index);
  await page.evaluate(() => new Promise(requestAnimationFrame));
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: '/workspace/scratch/b0e250296538/browser/chromium', args: ['--no-sandbox'] });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.__receivingReads = [];
    window.fetch = async (url, options) => {
      const response = await nativeFetch(url, options);
      if (options?.method === 'POST' && String(url).startsWith('/api/plan')) {
        const read = response.json.bind(response);
        response.json = async () => {
          const data = await read();
          const record = { url: String(url), signal: options.signal, released: false };
          const gate = new Promise(resolve => { record.release = resolve; });
          window.__receivingReads.push(record);
          await gate;
          record.released = true;
          return data;
        };
      }
      return response;
    };
  });
  let receipt;
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => document.querySelector('#personaSel').options.length === 2);
    await page.locator('[name=cuisines]').fill('Manual cuisine');
    await page.locator('[name=city]').fill('Manual City');
    await page.locator('#form button[type=submit]').click();
    await page.waitForFunction(() => window.__receivingReads.length === 1);
    await release(page, 0);
    await page.locator('details:has(#trace) summary').click();
    const ordinary = await snapshot(page);
    assert.equal(ordinary.form.city, 'Manual City');
    assert.equal(ordinary.resultsHidden, false);
    assert.equal(ordinary.traceExpanded, true);

    await page.locator('#sampleBtn').click();
    await page.waitForFunction(() => window.__receivingReads.length === 2);
    const pendingA = await snapshot(page);
    await page.locator('#personaSel').selectOption('sample-b');
    const afterSelection = await snapshot(page);
    const requestCountAfterSelection = requests.length;
    await release(page, 1);
    const afterLateA = await snapshot(page);
    await page.screenshot({ path: path.join(output, 'after-late-a.png'), fullPage: true });

    await page.locator('#sampleBtn').click();
    await page.waitForFunction(() => window.__receivingReads.length === 3);
    await release(page, 2);
    const currentB = await snapshot(page);
    assert.equal(requestCountAfterSelection, 2, 'Selection alone must not start another plan request');
    assert.deepEqual(afterSelection.form, pendingA.form, 'Selection must preserve current editable inputs');
    assert.deepEqual(afterSelection.constraints, pendingA.constraints);
    assert.equal(currentB.resultsHidden, false);
    assert.match(currentB.plan, /B plan/);
    assert.equal(currentB.form.city, 'City B');
    assert.deepEqual(currentB.constraints, ['low_sodium']);
    assert.equal(currentB.traceExpanded, true, 'Existing expanded trace widget state must survive');
    assert.deepEqual(errors, []);
    const sourceHashes = Object.fromEntries(['app.js', 'index.html', 'plan-request.js'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(source, 'static', file))).digest('hex')]));
    receipt = {
      reviewer: 'chatgpt-a2eaaec253d8/mac_production', checkedAt: new Date().toISOString(), source, sourceHashes,
      scenario: 'Two fictional personas; parsed HTTP response A waits past persona selection B; explicit next sample succeeds and expanded trace/input state persists.',
      asynchronousBoundary: 'Actual loopback fetch and Response.json parse complete before delayed reader resolves; abort cannot remove the authored delayed completion.',
      requests, ordinary, pendingA, afterSelection, afterLateA, currentB, errors,
      checks: { selectionStartsNoRequest: requestCountAfterSelection === 2, selectionPreservesFields: JSON.stringify(afterSelection.form) === JSON.stringify(pendingA.form), selectionAbortsA: afterSelection.reads[1].aborted, lateAHidden: afterLateA.resultsHidden, currentBShown: /B plan/.test(currentB.plan) && !currentB.resultsHidden, expandedTracePreserved: currentB.traceExpanded },
      limits: ['Synthetic fixture responses; no backend, provider or recommendation-quality check.', 'Organizer/calendar owner composition is not present in this frozen source; this test preserves the existing trace disclosure widget.'],
    };
    receipt.passed = Object.values(receipt.checks).every(Boolean);
    fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify({ passed: receipt.passed, checks: receipt.checks, afterSelection, afterLateA, receipt: path.join(output, 'receipt.json') }, null, 2));
    if (!receipt.passed) process.exitCode = 1;
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.closeAllConnections(); server.close(); });
