const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../static/plan-request.js');

function fixture(overrides = {}) {
  const calls = [];
  const events = [];
  const controller = create({
    send(url, body, signal) {
      return new Promise((resolve, reject) => calls.push({ url, body, signal, resolve, reject }));
    },
    onStart: () => events.push(['start']),
    onResult: value => events.push(['result', value]),
    onError: error => events.push(['error', error.message]),
    onIdle: () => events.push(['idle']),
    ...overrides,
  });
  return { calls, events, controller };
}

test('only newest result commits when earlier transport ignores abort', async () => {
  const { calls, events, controller } = fixture();
  const older = controller.run('/api/plan', { city: 'Older' });
  const newer = controller.run('/api/plan', { city: 'Newer' });
  assert.equal(calls[0].signal.aborted, true);
  assert.equal(calls[1].signal.aborted, false);
  calls[1].resolve('newer');
  assert.equal(await newer, true);
  calls[0].resolve('older');
  assert.equal(await older, false);
  assert.deepEqual(events, [['start'], ['start'], ['result', 'newer'], ['idle']]);
});

test('stale errors cannot clear newer loading state or replace its result', async () => {
  const { calls, events, controller } = fixture();
  const older = controller.run('/api/plan/sample/a');
  const newer = controller.run('/api/plan', { city: 'Current' });
  calls[0].reject(new Error('stale sample error'));
  assert.equal(await older, false);
  assert.deepEqual(events, [['start'], ['start']]);
  calls[1].resolve('current');
  await newer;
  assert.deepEqual(events, [['start'], ['start'], ['result', 'current'], ['idle']]);
});

test('input invalidation suppresses a response already being read', async () => {
  const { calls, events, controller } = fixture();
  const submitted = controller.run('/api/plan');
  controller.invalidate();
  assert.equal(calls[0].signal.aborted, true);
  calls[0].resolve('late parsed body');
  assert.equal(await submitted, false);
  assert.deepEqual(events, [['start'], ['idle']]);
});

test('invalidated failure remains silent and a later request can succeed', async () => {
  const { calls, events, controller } = fixture();
  const submitted = controller.run('/api/plan');
  controller.invalidate();
  const next = controller.run('/api/plan/sample/a');
  calls[0].reject(new Error('abandoned failure'));
  await submitted;
  calls[1].resolve('next');
  assert.equal(await next, true);
  assert.deepEqual(events, [['start'], ['idle'], ['start'], ['result', 'next'], ['idle']]);
});

test('disposal blocks new work and suppresses all pending completion callbacks', async () => {
  const { calls, events, controller } = fixture();
  const pending = controller.run('/api/plan');
  controller.dispose();
  controller.dispose();
  assert.equal(await controller.run('/api/plan/sample/a'), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].signal.aborted, true);
  calls[0].resolve('unmounted result');
  await pending;
  assert.deepEqual(events, [['start'], ['idle']]);
});

test('current transport error is reported once and returns to idle', async () => {
  const { calls, events, controller } = fixture();
  const pending = controller.run('/api/plan');
  calls[0].reject(new Error('service unavailable'));
  assert.equal(await pending, false);
  assert.deepEqual(events, [['start'], ['error', 'service unavailable'], ['idle']]);
});

test('a malformed current result cannot leave the request busy', async () => {
  const failures = [];
  const { calls, events, controller } = fixture({
    onResult: () => { throw new Error('unreadable plan'); },
    onError: error => failures.push(error.message),
  });
  const pending = controller.run('/api/plan');
  calls[0].resolve({});
  assert.equal(await pending, false);
  assert.deepEqual(failures, ['unreadable plan']);
  assert.deepEqual(events, [['start'], ['idle']]);
});

test('actual AbortSignal rejection from supersession is not a user error', async () => {
  const errors = [];
  let accepted;
  const controller = create({
    send: (url, body, signal) => new Promise((resolve, reject) => {
      if (url === 'new') accepted = resolve;
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }),
    onError: error => errors.push(error),
  });
  const older = controller.run('old');
  const newer = controller.run('new');
  assert.equal(await older, false);
  accepted('current');
  assert.equal(await newer, true);
  assert.deepEqual(errors, []);
});
