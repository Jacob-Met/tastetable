import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

// An independent disk-file consumer. Children load only the published native
// modules; the parent compares their files without importing those modules.
const self = fileURLToPath(import.meta.url);
const expectedFreeze = 'e846337117171e02b21788bff561f1f9648b6d8ae5763d57992e0d01cf84bd67';
const nativePaths = ['static/week_file.mjs', 'static/week_plan.mjs', 'static/calendar.js'];
const receivedAt = '2026-10-08T09:12:13.456Z';
const firstSavedAt = '2026-10-08T10:00:00.000Z';
const secondSavedAt = '2026-10-08T10:30:00.000Z';
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const readJson = filename => JSON.parse(fs.readFileSync(filename, 'utf8'));
const writeText = (filename, value) => fs.writeFileSync(filename, value, { flag: 'wx' });
const writeJson = (filename, value) => writeText(filename, JSON.stringify(value, null, 2) + '\n');
const identity = filename => {
  const bytes = fs.readFileSync(filename);
  return { bytes: bytes.length, sha256: sha256(bytes), git_blob: crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex') };
};

function fixtures(candidate) {
  const folder = path.join(candidate, 'tests/fixtures');
  const recovery = readJson(path.join(folder, 'saved-week-recovery.json'));
  return [
    { name: 'complete-week', response: readJson(path.join(folder, 'saved-week-response.json')), inputs: recovery.cases[0].inputs, id: '0123456789abcdef0123456789abcdef' },
    ...recovery.cases.map((item, index) => ({ ...item, name: item.case, id: index === 0 ? '123456789abcdef0123456789abcdef0' : '23456789abcdef0123456789abcdef01' })),
  ];
}

async function child(phase, candidate, output, caseName) {
  const { makeWeekFile, readWeekFile } = await import(pathToFileURL(path.join(candidate, nativePaths[0])));
  const { createWeekPlan, setPickDay, weekRows } = await import(pathToFileURL(path.join(candidate, nativePaths[1])));
  const require = createRequire(import.meta.url);
  const { createWeekExport } = require(path.join(candidate, nativePaths[2]));
  const spec = fixtures(candidate).find(item => item.name === caseName);
  assert.ok(spec, 'named native fixture exists');
  const file = name => path.join(output, name);
  let details;
  if (phase === 'produce') {
    const original = createWeekPlan(spec.response, '2026-10-08');
    const writer = createWeekExport(original, { id: spec.id, createdAt: new Date(receivedAt) });
    writeText(file('original-calendar.ics'), writer.download(original, weekRows(original)).text);
    let arranged = setPickDay(original, original.picks[0].key, 'Tuesday');
    if (original.picks.length > 1) {
      arranged = setPickDay(arranged, original.picks[1].key, null);
      arranged = setPickDay(arranged, original.picks.at(-1).key, 'Tuesday');
    }
    const saved = makeWeekFile({ response: spec.response, inputs: spec.inputs, state: arranged, receivedAt, calendarId: spec.id }, new Date(firstSavedAt));
    const calendar = writer.download(arranged, weekRows(arranged));
    writeText(file('saved-week.json'), saved.text);
    writeText(file('arranged-calendar.ics'), calendar.text);
    writeJson(file('arranged-state.json'), arranged);
    details = { filename: saved.filename, calendar_filename: calendar.filename, calendar_count: calendar.count };
  } else if (phase === 'restore-edit') {
    const opened = readWeekFile(fs.readFileSync(file('ordinary-rewritten-week.json'), 'utf8'));
    writeJson(file('opened-week.json'), opened);
    const writer = createWeekExport(opened.state, { id: opened.calendarId, createdAt: new Date(opened.receivedAt) });
    const restoredCalendar = writer.download(opened.state, weekRows(opened.state));
    writeText(file('restored-calendar.ics'), restoredCalendar.text);
    const unchangedState = JSON.stringify(opened.state);
    let edited = setPickDay(opened.state, opened.state.picks[0].key, 'Friday');
    if (opened.state.picks.length > 1) edited = setPickDay(edited, opened.state.picks[1].key, 'Sunday');
    assert.equal(JSON.stringify(opened.state), unchangedState, 'native editing preserves the previously restored state');
    const saved = makeWeekFile({ ...opened, state: edited }, new Date(secondSavedAt));
    const calendar = writer.download(edited, weekRows(edited));
    writeText(file('resaved-week.json'), saved.text);
    writeText(file('edited-calendar.ics'), calendar.text);
    details = { filename: saved.filename, calendar_filename: calendar.filename, calendar_count: calendar.count };
  } else if (phase === 'reopen') {
    const opened = readWeekFile(fs.readFileSync(file('resaved-week.json'), 'utf8'));
    const writer = createWeekExport(opened.state, { id: opened.calendarId, createdAt: new Date(opened.receivedAt) });
    const calendar = writer.download(opened.state, weekRows(opened.state));
    writeJson(file('reopened-week.json'), opened);
    writeText(file('reopened-calendar.ics'), calendar.text);
    details = { calendar_filename: calendar.filename, calendar_count: calendar.count };
  } else {
    throw new Error('Unknown review phase');
  }
  const receipt = { phase, case: caseName, pid: process.pid, node: process.version, native_modules: nativePaths.map(item => ({ path: item, ...identity(path.join(candidate, item)) })), ...details };
  writeJson(file(phase + '.json'), receipt);
  process.stdout.write(JSON.stringify({ phase, case: caseName, pid: process.pid, calendar_count: details.calendar_count }) + '\n');
}

function reverseObjectOrder(value) {
  if (Array.isArray(value)) return value.map(reverseObjectOrder);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverseObjectOrder(item)]));
  return value;
}

// Independent, deliberately small consumer for the writer's all-day events.
function calendarEvents(filename) {
  const text = fs.readFileSync(filename, 'utf8');
  assert.ok(text.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!text.replaceAll('\r\n', '').includes('\n'), 'calendar retains CRLF physical lines');
  const lines = text.replace(/\r\n[ \t]/g, '').split('\r\n');
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  const events = [];
  let current = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { assert.equal(current, null); current = {}; }
    else if (line === 'END:VEVENT') { assert.ok(current); events.push(current); current = null; }
    else if (current) {
      const split = line.indexOf(':');
      assert.ok(split > 0);
      const name = line.slice(0, split);
      assert.ok(!Object.hasOwn(current, name), 'single-valued calendar property');
      current[name] = line.slice(split + 1).replace(/\\([\\;,nN])/g, (_, escaped) => /[nN]/.test(escaped) ? '\n' : escaped);
    }
  }
  assert.equal(current, null);
  assert.equal(new Set(events.map(item => item.UID)).size, events.length, 'event UIDs are unique');
  return events;
}

function verifyCalendar(filename, spec, assignments) {
  const events = calendarEvents(filename);
  const picks = [...spec.response.plan.meals, ...(spec.response.plan.outing ? [spec.response.plan.outing] : [])];
  const dates = { Monday: '20261005', Tuesday: '20261006', Wednesday: '20261007', Thursday: '20261008', Friday: '20261009', Saturday: '20261010', Sunday: '20261011' };
  const expected = picks.map((pick, index) => ({ pick, key: 'pick-' + index })).filter(item => assignments[item.key] !== null);
  assert.equal(events.length, expected.length, 'only scheduled checked picks are exported');
  for (const { pick, key } of expected) {
    const uid = `${spec.id}-20261005-${key}@tastetable.invalid`;
    const event = events.find(item => item.UID === uid);
    assert.ok(event, `original per-pick UID retained: ${key}`);
    assert.equal(event['DTSTART;VALUE=DATE'], dates[assignments[key]]);
    assert.equal(event.DTSTAMP, '20261008T091213Z');
    assert.equal(event.STATUS, 'TENTATIVE');
    assert.equal(event.TRANSP, 'TRANSPARENT');
    assert.equal(event.CLASS, 'PRIVATE');
    assert.equal(event.SUMMARY, '[DEMO] TasteTable suggestion: ' + pick.name);
    assert.ok(event.DESCRIPTION.includes('DEMO: synthetic Qloo fixture; these venues are fictional.'));
    assert.ok(event.DESCRIPTION.includes('Qloo entity ID: ' + pick.entity_id));
    assert.ok(event.DESCRIPTION.includes('Why this suggestion: ' + pick.why));
    assert.ok(event.DESCRIPTION.includes('Originally suggested for: ' + pick.day + '. Arranged for: ' + assignments[key]));
    for (const note of spec.response.plan.notes) assert.ok(event.DESCRIPTION.includes('Plan note: ' + note), 'native plan note preserved in exported event');
  }
  return events;
}

function runChild(phase, candidate, output, caseName) {
  const run = spawnSync(process.execPath, [self, '--child', phase, candidate, output, caseName], { encoding: 'utf8', timeout: 15000 });
  writeText(path.join(output, phase + '.stdout.log'), run.stdout || '');
  writeText(path.join(output, phase + '.stderr.log'), run.stderr || '');
  assert.ifError(run.error);
  assert.equal(run.status, 0, `${phase} process exited successfully: ${run.stderr}`);
  return readJson(path.join(output, phase + '.json'));
}

function pinSource(candidate, freeze) {
  return [...freeze.source_paths, ...freeze.unchanged_predecessor_files].map(item => {
    const actual = identity(path.join(candidate, item.path));
    assert.equal(actual.sha256, item.sha256, 'exact frozen source: ' + item.path);
    if (item.git_blob) assert.equal(actual.git_blob, item.git_blob);
    return { path: item.path, ...actual };
  });
}

function runCase(candidate, output, spec) {
  const directory = path.join(output, spec.name);
  fs.mkdirSync(directory);
  const produced = runChild('produce', candidate, directory, spec.name);
  const originalPath = path.join(directory, 'saved-week.json');
  const originalIdentity = identity(originalPath);
  const saved = readJson(originalPath);
  assert.equal(produced.filename, 'tastetable-week-2026-10-05.json');
  assert.equal(saved.savedAt, firstSavedAt);
  assert.equal(saved.receivedAt, receivedAt);
  assert.equal(saved.calendarId, spec.id);
  assert.deepEqual(saved.response, spec.response, 'file contains whole native response, including trace, checks, rejections, comparison, notes and model message');
  assert.deepEqual(saved.inputs, spec.inputs, 'file retains exact original inputs');
  const reordered = reverseObjectOrder(saved);
  assert.deepEqual(reordered, saved, 'ordinary JSON rewriting changes representation only');
  const rewrittenText = '\uFEFF' + JSON.stringify(reordered, null, '\t').replaceAll('\n', '\r\n') + '\r\n';
  const rewrittenPath = path.join(directory, 'ordinary-rewritten-week.json');
  writeText(rewrittenPath, rewrittenText);
  const rewrittenIdentity = identity(rewrittenPath);
  assert.notEqual(rewrittenIdentity.sha256, originalIdentity.sha256, 'file was actually rewritten');
  const restored = runChild('restore-edit', candidate, directory, spec.name);
  const reopened = runChild('reopen', candidate, directory, spec.name);
  assert.equal(new Set([process.pid, produced.pid, restored.pid, reopened.pid]).size, 4, 'each native phase runs in a distinct process');
  const opened = readJson(path.join(directory, 'opened-week.json'));
  const resaved = readJson(path.join(directory, 'resaved-week.json'));
  const again = readJson(path.join(directory, 'reopened-week.json'));
  const initialState = readJson(path.join(directory, 'arranged-state.json'));
  assert.deepEqual(opened.state, initialState, 'file reload derives the exact arranged native state');
  assert.equal(initialState.weekStart, '2026-10-05');
  assert.equal(initialState.sourceMode, 'mock');
  assert.deepEqual(initialState.sourcePlan, spec.response.plan);
  assert.deepEqual(initialState.constraints, spec.inputs.constraints);
  assert.equal(initialState.assignments['pick-0'], 'Tuesday');
  if (initialState.picks.length > 1) {
    assert.equal(initialState.assignments['pick-1'], null);
    assert.equal(initialState.assignments[initialState.picks.at(-1).key], 'Tuesday');
  }
  for (const recovered of [opened, resaved, again]) {
    assert.deepEqual(recovered.response, spec.response, 'whole native response survives read, rewrite, edits and re-save');
    assert.deepEqual(recovered.inputs, spec.inputs);
    assert.equal(recovered.receivedAt, receivedAt);
    assert.equal(recovered.calendarId, spec.id);
  }
  assert.equal(opened.savedAt, firstSavedAt);
  assert.equal(resaved.savedAt, secondSavedAt);
  assert.equal(again.savedAt, secondSavedAt);
  const editedAssignments = { ...initialState.assignments, 'pick-0': 'Friday' };
  if (initialState.picks.length > 1) editedAssignments['pick-1'] = 'Sunday';
  assert.deepEqual(again.state, { ...initialState, assignments: editedAssignments });
  assert.deepEqual(resaved.week.assignments, editedAssignments);
  assert.equal(resaved.week.start, initialState.weekStart);
  assert.equal(fs.readFileSync(path.join(directory, 'arranged-calendar.ics'), 'utf8'), fs.readFileSync(path.join(directory, 'restored-calendar.ics'), 'utf8'), 'unchanged arrangement re-exports byte-identical calendar across process and JSON rewrite');
  assert.equal(fs.readFileSync(path.join(directory, 'edited-calendar.ics'), 'utf8'), fs.readFileSync(path.join(directory, 'reopened-calendar.ics'), 'utf8'), 'edited arrangement re-exports byte-identical calendar after second save/load');
  const originals = Object.fromEntries(initialState.picks.map(item => [item.key, item.originalDay]));
  const originalEvents = verifyCalendar(path.join(directory, 'original-calendar.ics'), spec, originals);
  const beforeEvents = verifyCalendar(path.join(directory, 'restored-calendar.ics'), spec, initialState.assignments);
  const afterEvents = verifyCalendar(path.join(directory, 'reopened-calendar.ics'), spec, editedAssignments);
  assert.deepEqual(afterEvents.map(item => item.UID).sort(), originalEvents.map(item => item.UID).sort(), 'moving and restoring an omitted pick retains every original event UID');
  assert.deepEqual(identity(originalPath), originalIdentity, 'original saved file remains byte-identical');
  assert.deepEqual(identity(rewrittenPath), rewrittenIdentity, 'caller rewritten input remains byte-identical');
  if (spec.name === 'invalid_json') assert.equal(again.response.trace.at(-1).args, null, 'native failed JSON-decode arguments remain null');
  if (spec.name === 'decoded_list') assert.deepEqual(again.response.trace.at(-1).args, [], 'native decoded-list arguments remain an array');
  return { case: spec.name, status: 'passed', child_processes: [produced.pid, restored.pid, reopened.pid], original_events: originalEvents.length, arranged_events: beforeEvents.length, edited_events: afterEvents.length, original_saved_file: originalIdentity, ordinary_rewritten_file: rewrittenIdentity, original_evidence_preserved: true, per_pick_uids_preserved: true, reexport_byte_identical_at_each_arrangement: true };
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--child') return child(...args.slice(1));
  assert.equal(args.length, 3, 'usage: node review_saved_week.mjs CANDIDATE FREEZE OUTPUT');
  const [candidate, freezePath, output] = args.map(item => path.resolve(item));
  fs.mkdirSync(output);
  const freezeIdentity = identity(freezePath);
  assert.equal(freezeIdentity.sha256, expectedFreeze, 'review targets exact v3 freeze');
  const freeze = readJson(freezePath);
  const sourceBefore = pinSource(candidate, freeze);
  writeJson(path.join(output, 'source-before.json'), sourceBefore);
  const receiverBefore = identity(self);
  const startedAt = new Date().toISOString();
  const results = [];
  let failure;
  try {
    for (const spec of fixtures(candidate)) {
      results.push(runCase(candidate, output, spec));
      console.log('PASS ' + spec.name + ': separate save → ordinary JSON rewrite → restore/edit → re-save/reopen; evidence and calendar identity retained.');
    }
  } catch (error) {
    failure = { name: error.name, message: error.message, stack: error.stack };
    process.exitCode = 1;
    console.error(error.stack);
  }
  const sourceAfter = pinSource(candidate, freeze);
  assert.deepEqual(sourceAfter, sourceBefore, 'all sixteen frozen source/dependency paths unchanged');
  assert.deepEqual(identity(self), receiverBefore, 'independent receiver unchanged during execution');
  writeJson(path.join(output, 'source-after.json'), sourceAfter);
  writeJson(path.join(output, 'receipt.json'), {
    schema: 'tastetable.saved-week.independent-cross-process-review.v1',
    status: failure ? 'failed' : 'passed', started_at: startedAt, finished_at: new Date().toISOString(), node: process.version,
    candidate, freeze: { path: freezePath, ...freezeIdentity }, receiving_base_commit: freeze.receiving_base_commit,
    receiving_base_tree: freeze.receiving_base_tree, native_parent: freeze.receiving_parent,
    receiver: { path: self, ...receiverBefore }, workflows: results, workflow_count: results.length,
    child_process_count: results.reduce((count, item) => count + item.child_processes.length, 0),
    source_file_count: sourceBefore.length, source_unchanged: true,
    environment: 'Node subprocesses and ordinary files in authorized owned /dev/shm RAM scratch; no browser, network, API calls or live data stores.',
    limits: ['Three exact native synthetic fixtures; no live data generation or independent source revalidation.', 'Uses the frozen native file and calendar APIs, not browser controls or a third-party calendar importer.', 'Explicit saved calendar ID and receivedAt tested; null calendar-ID UI fallback and author validation cases not repeated.'],
    ...(failure ? { failure } : {}),
  });
}

await main();
