#!/usr/bin/env node
// Run against local static source and authored responses; never calls a provider.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(process.env.TASTETABLE_SOURCE_ROOT || path.join(__dirname, '..'));
const output = path.resolve(process.env.TASTETABLE_EVIDENCE_DIR || path.join(root, 'out', 'plan-request-browser'));
const baseline = process.argv.includes('--baseline');
const { chromium } = require(process.env.TASTETABLE_PLAYWRIGHT || 'playwright');
const personas = [{ id: 'sample-a', label: 'Fictional sample A', cuisines: ['Fixture cuisine'],
  music: [], films: [], city: 'Sample City', constraints: ['wheelchair'] }];
const pending = [];
const results = [];
const pageErrors = [];

function sourceManifest() {
  return fs.readdirSync(path.join(root, 'static')).filter(file => /\.(m?js|css|html)$/.test(file)).sort()
    .map(file => ({ file: `static/${file}`,
      sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'static', file))).digest('hex') }));
}
const initialSources = sourceManifest();
const verifierSha256 = crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');

function plan(name) {
  const meal = { day: 'Monday', name, kind: 'restaurant', affinity: 0.8,
    entity_id: 'FIX-LIFECYCLE', why: 'Authored request-lifecycle fixture.', fallback: false };
  return { mock: true, plan: { meals: [meal], outing: null, notes: [], rejected: [] },
    llm_only: { meals: [], outing: { day: 'Friday', name: 'Unverified fixture', why: 'Fixture only.' } },
    comparison: { constraints: [], grounded: { picks: 1, with_qloo_entity_id: 1, with_affinity_evidence: 1,
      constraint_checked: 1, unsafe_candidates_rejected: 0 }, llm_only: { picks: 1 } }, trace: [] };
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://fixture.invalid');
  response.on('error', () => {});
  if (request.method === 'POST' && url.pathname.startsWith('/api/plan')) {
    let body = '';
    for await (const chunk of request) body += chunk;
    pending.push({ path: url.pathname, body: body ? JSON.parse(body) : null, response, released: false });
    return;
  }
  const json = url.pathname === '/api/health' ? { ok: true, qloo_mode: 'mock' }
    : url.pathname === '/api/personas' ? personas : null;
  if (json) {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(json));
    return;
  }
  const file = url.pathname === '/' ? 'static/index.html'
    : /^\/static\/[a-z0-9_-]+\.(m?js|css)$/.test(url.pathname) ? url.pathname.slice(1) : null;
  if (!file || !fs.existsSync(path.join(root, file))) {
    response.writeHead(404); response.end(); return;
  }
  response.writeHead(200, { 'Content-Type': /\.m?js$/.test(file) ? 'text/javascript'
    : file.endsWith('.css') ? 'text/css' : 'text/html' });
  response.end(fs.readFileSync(path.join(root, file)));
});

async function waitForRequest(index) {
  const deadline = Date.now() + 5000;
  while (!pending[index]) {
    if (Date.now() > deadline) throw new Error(`Request ${index} did not arrive`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return pending[index];
}

async function release(page, request, name, status = 200, detail = null) {
  const before = await page.evaluate(() => window.__planReadsFinished);
  request.released = true;
  request.response.writeHead(status, { 'Content-Type': status === 200 || detail ? 'application/json' : 'text/html' });
  request.response.end(status === 200 ? JSON.stringify(plan(name))
    : detail ? JSON.stringify({ detail }) : '<h1>Fixture service unavailable</h1>');
  await page.waitForFunction(count => window.__planReadsFinished > count, before);
}

async function freshPage(browser, origin, { ignoreAbort = true, viewport = { width: 1280, height: 1000 } } = {}) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('dialog', dialog => dialog.dismiss());
  await page.addInitScript(({ ignoreAbort }) => {
    const original = window.fetch.bind(window);
    window.__planReadsFinished = 0;
    window.__planFetchAborted = 0;
    window.fetch = async (url, options) => {
      const isPlan = String(url).startsWith('/api/plan');
      try {
        const response = await original(url, isPlan && ignoreAbort ? { ...options, signal: undefined } : options);
        if (isPlan) {
          const read = response.json.bind(response);
          response.json = async () => { try { return await read(); } finally { window.__planReadsFinished++; } };
        }
        return response;
      } catch (error) {
        if (isPlan && error.name === 'AbortError') window.__planFetchAborted++;
        throw error;
      }
    };
  }, { ignoreAbort });
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelector('#personaSel').options.length === 1);
  await page.locator('[name=cuisines]').fill('Fixture cuisine');
  return page;
}

async function submit(page, city) {
  await page.locator('[name=city]').fill(city);
  const index = pending.length;
  await page.locator('#form button[type=submit]').click();
  return waitForRequest(index);
}

async function check(name, run) {
  try { const evidence = await run(); results.push({ name, passed: true, evidence }); }
  catch (error) { results.push({ name, passed: false, error: error.message }); }
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.TASTETABLE_CHROMIUM || undefined,
    args: ['--no-sandbox'] });
  try {
    await check('Newest form request wins when transport ignores abort', async () => {
      const page = await freshPage(browser, origin);
      try {
        const older = await submit(page, 'Older City');
        const latest = await submit(page, 'Latest City');
        await release(page, latest, 'Latest plan');
        await release(page, older, 'Older plan');
        const visiblePlan = await page.locator('#plan').innerText();
        assert.match(visiblePlan, /Latest plan/, `Latest inputs were replaced by: ${visiblePlan}`);
        assert.equal(await page.locator('[name=city]').inputValue(), 'Latest City');
        await page.screenshot({ path: path.join(output, 'latest-plan-desktop.png'), fullPage: true });
        return { visiblePlan, transportIgnoresAbort: true };
      } finally { await page.close(); }
    });

    await check('New request and failure never retain an old visible plan', async () => {
      const page = await freshPage(browser, origin);
      try {
        await release(page, await submit(page, 'First City'), 'First plan');
        const next = await submit(page, 'Changed City');
        const oldVisibleDuringWait = await page.locator('#results').isVisible();
        await release(page, next, '', 503);
        const oldVisibleAfterFailure = await page.locator('#results').isVisible();
        assert.equal(oldVisibleDuringWait, false, `Previous-plan visibility: pending=${oldVisibleDuringWait}, after failure=${oldVisibleAfterFailure}`);
        assert.equal(oldVisibleAfterFailure, false, 'Previous plan remained visible after the newer request failed');
        assert.match(await page.locator('#requestStatus').innerText(), /could not|couldn.t|failed/i);
        assert.equal(await page.locator('[name=city]').inputValue(), 'Changed City');
        assert.equal(await page.locator('#form').getAttribute('aria-busy'), 'false');
        return { oldVisibleDuringWait, oldVisibleAfterFailure, inputsPreserved: true };
      } finally { await page.close(); }
    });

    if (!baseline) {
      await check('Current validation errors stay actionable and render as plain text', async () => {
        const page = await freshPage(browser, origin);
        try {
          const request = await submit(page, 'Correctable City');
          const detail = 'enter at least one cuisine, artist or film <em>fixture</em>';
          await release(page, request, '', 400, detail);
          assert.match(await page.locator('#requestStatus').innerText(), /enter at least one cuisine, artist or film <em>fixture<\/em>/);
          assert.equal(await page.locator('#requestStatus em').count(), 0);
          assert.equal(await page.locator('#results').isVisible(), false);
          assert.equal(await page.locator('[name=city]').inputValue(), 'Correctable City');
          return { validationDetailVisible: true, backendDetailUsesTextContent: true };
        } finally { await page.close(); }
      });

      await check('Editing pending inputs invalidates their eventual result', async () => {
        const page = await freshPage(browser, origin);
        try {
          const request = await submit(page, 'Submitted City');
          await page.locator('[name=constraints][value=wheelchair]').check();
          await release(page, request, 'Superseded constraint plan');
          assert.equal(await page.locator('#results').isVisible(), false);
          assert.match(await page.locator('#requestStatus').innerText(), /inputs changed/i);
          assert.equal(await page.locator('[name=constraints][value=wheelchair]').isChecked(), true);
          return { lateResultHidden: true, changedConstraintPreserved: true };
        } finally { await page.close(); }
      });

      await check('Late sample response and stale error cannot replace a manual plan', async () => {
        const page = await freshPage(browser, origin);
        try {
          const sampleIndex = pending.length;
          await page.locator('#sampleBtn').click();
          const sample = await waitForRequest(sampleIndex);
          const manual = await submit(page, 'Manual City');
          await release(page, manual, 'Manual plan');
          await release(page, sample, '', 503);
          assert.match(await page.locator('#plan').innerText(), /Manual plan/);
          assert.equal(await page.locator('#results').isVisible(), true);
          assert.match(await page.locator('#requestStatus').innerText(), /ready/i);
          return { staleSampleErrorIgnored: true };
        } finally { await page.close(); }
      });

      await check('Stop waiting aborts actual browser fetch and permits a fresh plan', async () => {
        const page = await freshPage(browser, origin, { ignoreAbort: false, viewport: { width: 390, height: 844 } });
        try {
          const old = await submit(page, 'Waiting City');
          await page.locator('#cancelPlan').click();
          await page.waitForFunction(() => window.__planFetchAborted === 1);
          assert.equal(await page.locator('#results').isVisible(), false);
          assert.match(await page.locator('#requestStatus').innerText(), /stopped waiting/i);
          assert.equal(await page.locator('#cancelPlan').isVisible(), false);
          old.released = true; old.response.end(JSON.stringify(plan('Cancelled plan')));
          await release(page, await submit(page, 'Fresh City'), 'Fresh plan');
          assert.match(await page.locator('#plan').innerText(), /Fresh plan/);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
          await page.screenshot({ path: path.join(output, 'fresh-plan-phone.png'), fullPage: true });
          return { browserFetchAborted: true, nextRequestSucceeded: true, mobileNoHorizontalOverflow: true };
        } finally { await page.close(); }
      });

      await check('Pagehide invalidates late work and a restored page remains usable', async () => {
        const page = await freshPage(browser, origin);
        try {
          const request = await submit(page, 'Before Pagehide');
          await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
          await release(page, request, 'Late page result');
          assert.equal(await page.locator('#results').isVisible(), false);
          await release(page, await submit(page, 'After Pagehide'), 'Restored page plan');
          assert.match(await page.locator('#plan').innerText(), /Restored page plan/);
          return { nativeEventDispatched: 'pagehide', persisted: true, actualBackForwardCacheNotClaimed: true };
        } finally { await page.close(); }
      });
    }

    assert.deepEqual(pageErrors, [], 'Unexpected browser page errors');
  } finally {
    const version = await browser.version();
    await browser.close();
    for (const request of pending) if (!request.released) request.response.destroy();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    const sources = sourceManifest();
    const sourceUnchanged = JSON.stringify(sources) === JSON.stringify(initialSources)
      && verifierSha256 === crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
    const receipt = { mode: baseline ? 'original-negative-reproduction' : 'candidate-browser-qualification',
      checkedAt: new Date().toISOString(), node: process.version, chromium: version,
      sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
      sourceIsWorkingTree: true, sourceRoot: root, sources, sourceUnchanged, verifierSha256, results, pageErrors,
      providerCalls: 0, backendExecution: false,
      limits: ['Authored local HTTP responses; no recommendation-model or care-constraint qualification.',
        'Adverse completion controls deliberately use a fetch wrapper that ignores AbortSignal.',
        'Pagehide control dispatches the native event; actual back-forward-cache admission is not established.'] };
    fs.writeFileSync(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify({ mode: receipt.mode, passed: results.filter(result => result.passed).length,
      failed: results.filter(result => !result.passed).length, results, receipt: path.join(output, 'receipt.json') }, null, 2));
    if (!sourceUnchanged || pageErrors.length || results.some(result => !result.passed)) process.exitCode = 1;
  }
})().catch(error => { console.error(error); process.exitCode = 1; server.closeAllConnections(); server.close(); });
