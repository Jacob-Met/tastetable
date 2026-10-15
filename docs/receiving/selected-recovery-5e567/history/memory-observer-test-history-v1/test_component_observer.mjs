// Source-exposed, isolated observer check. This never imports or runs the course,
// product modules, host, server, browser, IndexedDB or any native interface.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const filename = path.join(directory, 'component_course.mjs');
const original = fs.readFileSync(filename);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(original.length, 18704);
assert.equal(sha(original), '3545d503fc3afa9b2f2a2dd8dd1b19d96a9290e42af130a5475327f95a39285f');
const source = original.toString('utf8');
const declarations = [...source.matchAll(/^  const observeExpression='[^'\n]*';$/gm)];
assert.equal(declarations.length, 1);
const declaration = declarations[0][0];
const start = source.indexOf('  async function observe(label, allowStarting=false) {');
const stop = source.indexOf('  async function waitFor(', start);
assert(start >= 0 && stop > start);
assert.equal(source.indexOf('  async function observe(', start + 1), -1);
const observer = source.slice(start, stop);
assert(observer.endsWith('  }\n'));

const PAGE = 'http://127.0.0.1:43210/';
const DATABASE = 'hamon.tastetable143.5e5670099628.component-v1';
const SCHEMA = 'hamon.tastetable143.component-observation/1';
const TITLE = 'TasteTable — isolated saved-week recovery fixture';
const HOST = Object.freeze({
  selectedID: 'selected_A', dirtyRename: 'Retained unsaved rename', search: 'unchanged',
  order: 'name', activeWeek: 'original fictional week', venueNotes: 'original fictional notes'
});

function environment(phase, statusText, readyView = null) {
  const result = { snapshotCalls: 0, deadlineChecks: 0, evaluations: 0,
    statusReads: [], course: { observations: [] } };
  const browser = {
    location: { href: PAGE },
    document: {
      readyState: 'complete',
      getElementById(id) {
        result.statusReads.push(id);
        assert.equal(id, 'fixtureState');
        return { dataset: { state: phase }, textContent: statusText };
      }
    },
    window: { taste143Fixture: {
      schema: SCHEMA, databaseName: DATABASE,
      snapshotDOM() {
        result.snapshotCalls++;
        if (!readyView) throw new TypeError('Selection DOM has not been created');
        return readyView;
      }
    } }
  };
  result.observe = vm.runInNewContext(
    `(function () {\n${declaration}\n${observer}\nreturn observe;\n})()`,
    {
      assert, course: result.course, page: PAGE, HOST, DATABASE, TITLE,
      timeLeft() { result.deadlineChecks++; return 1000; },
      async evaluate(expression) {
        result.evaluations++;
        return vm.runInNewContext(expression, browser, { timeout: 100 });
      }
    },
    { timeout: 100 }
  );
  return result;
}

function retained(result, phase, text, view) {
  assert.equal(result.deadlineChecks, 1);
  assert.equal(result.evaluations, 1);
  assert.deepEqual(result.statusReads, ['fixtureState']);
  assert.equal(result.course.observations.length, 1);
  const observed = result.course.observations[0].value;
  assert.equal(observed.location, PAGE);
  assert.equal(observed.ready, 'complete');
  assert.equal(observed.schema, SCHEMA);
  assert.equal(observed.database, DATABASE);
  assert.equal(observed.phase, phase);
  assert.equal(observed.status, text);
  assert.strictEqual(observed.view, view);
}

const cases = [];
try {
  const starting = environment('starting', 'Preparing the isolated fixture.');
  assert.strictEqual(await starting.observe('starting-api-before-controls', true), null);
  assert.equal(starting.snapshotCalls, 0);
  retained(starting, 'starting', 'Preparing the isolated fixture.', null);
  cases.push({ name: 'starting API before selection DOM', outcome: 'PASS', snapshotCalls: 0 });

  const failed = environment('failed', 'Fixture stopped: synthetic inventory failure');
  await assert.rejects(failed.observe('failed-before-controls', true), {
    name: 'Error',
    message: 'Component fixture failed: Fixture stopped: synthetic inventory failure'
  });
  assert.equal(failed.snapshotCalls, 0);
  retained(failed, 'failed', 'Fixture stopped: synthetic inventory failure', null);
  cases.push({ name: 'failed fixture is retained and rejected immediately', outcome: 'PASS', snapshotCalls: 0 });

  const readyView = Object.freeze({ title: TITLE, fixtureState: 'ready', fixtureError: null,
    state: Object.freeze({ ready: true, busy: false, disposed: false }),
    host: HOST, pendingActions: 0 });
  const ready = environment('ready', 'Ready — isolated fictional fixture.', readyView);
  assert.strictEqual(await ready.observe('ready-full-snapshot'), readyView);
  assert.equal(ready.snapshotCalls, 1);
  retained(ready, 'ready', 'Ready — isolated fictional fixture.', readyView);
  cases.push({ name: 'ready fixture invokes one full snapshot', outcome: 'PASS', snapshotCalls: 1 });
} finally {
  assert(fs.readFileSync(filename).equals(original), 'Observer source changed during pure check');
}

process.stdout.write(JSON.stringify({
  schema: 'hamon.tastetable143.pure-observer-check/1',
  source: { bytes: original.length, sha256: sha(original) },
  fragments: { declarationBytes: Buffer.byteLength(declaration), declarationSha256: sha(declaration),
    observerBytes: Buffer.byteLength(observer), observerSha256: sha(observer) },
  outcome: 'PASS', cases,
  boundary: 'Only the extracted source observer expression and observe function ran against explicit in-memory stubs. No course/module import, product, host, server, browser, IndexedDB or native operation.'
}, null, 2) + '\n');
