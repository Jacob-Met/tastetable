/** Independent native ESM boundary probe. No DOM, browser, server, or venue calls. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = fs.realpathSync(process.argv[2]);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const paths = ['static/venue_followup.mjs', 'static/week_plan.mjs'];
const pins = () => Object.fromEntries(paths.map(name => [name, sha(fs.readFileSync(path.join(root, name)))]));
const before = pins();
const { createVenueFollowup } = await import(pathToFileURL(path.join(root, paths[0])));
const { createWeekPlan, setPickDay, setWeek } = await import(pathToFileURL(path.join(root, paths[1])));
const response = { mock: true, comparison: { constraints: ['wheelchair'] }, plan: { meals: [
  { day: 'Monday', kind: 'restaurant', name: 'Fictional duplicate venue', entity_id: 'FIX-REVIEW-DUPLICATE', why: 'Original synthetic check reason.' },
  { day: 'Monday', kind: 'restaurant', name: 'Fictional duplicate venue', entity_id: 'FIX-REVIEW-DUPLICATE', why: 'Original second occurrence reason.' },
], outing: null, notes: [] } };
const date = '2026-12-28';
const questionA = 'Independent question A: Is the east entrance step-free?';
const questionB = 'Independent question B: Can the kitchen prepare lower-salt soup?';
const answerA = 'Independent recorded reply A: Staff described the east entrance only.';
const cases = [];
async function check(name, run) {
  try { await run(); cases.push({ name, passed: true }); }
  catch (error) { cases.push({ name, passed: false, error: error.stack }); }
}
function scenario() {
  const state = createWeekPlan(response, date);
  return { state, session: createVenueFollowup(state) };
}
function enteredReply() {
  const { state, session } = scenario();
  session.setField(state, 'pick-0', date, 'question', questionA);
  session.setField(state, 'pick-0', date, 'reply', answerA);
  session.setField(state, 'pick-0', date, 'status', 'reply_recorded');
  return { state, session };
}

await check('user can edit a visit question without changing the original source explanation', () => {
  const { state, session } = scenario();
  session.setField(state, 'pick-0', date, 'question', questionA);
  assert.ok(session.text(state).includes(questionA));
  assert.equal(session.entries(state)[0].pick.why, 'Original synthetic check reason.');
  assert.equal(state.sourcePlan.meals[0].why, response.plan.meals[0].why);
});

await check('a revised question retains the earlier reply with its earlier question and requests follow-up', () => {
  const { state, session } = enteredReply();
  session.setField(state, 'pick-0', date, 'question', questionB);
  const entry = session.entries(state)[0];
  assert.equal(entry.note.reply, answerA);
  assert.equal(entry.note.status, 'follow_up');
  assert.equal(entry.questionsChangedAfterReply, true);
  const text = session.text(state);
  for (const literal of [questionA, questionB, answerA]) assert.ok(text.includes(literal), literal);
});

await check('status and next-step edits cannot rebind an old reply; a new reply edit can', () => {
  const { state, session } = enteredReply();
  session.setField(state, 'pick-0', date, 'question', questionB);
  session.setField(state, 'pick-0', date, 'status', 'reply_recorded');
  session.setField(state, 'pick-0', date, 'nextStep', 'Ask the kitchen about question B.');
  assert.equal(session.entries(state)[0].questionsChangedAfterReply, true);
  assert.equal(session.entries(state)[0].note.reply, answerA);
  session.setField(state, 'pick-0', date, 'reply', 'A new note explicitly addressing question B.');
  assert.equal(session.entries(state)[0].questionsChangedAfterReply, false);
});

await check('positive control: occurrence/date/source identity isolates replies and preserves an original-date return', () => {
  const { state, session } = scenario();
  session.setField(state, 'pick-0', date, 'reply', answerA);
  assert.equal(session.entries(state)[1].note.reply, '');
  const moved = setPickDay(state, 'pick-0', 'Tuesday');
  assert.equal(session.entries(moved).find(e => e.key === 'pick-0').note.reply, '');
  assert.throws(() => session.setField(moved, 'pick-0', date, 'reply', 'stale edit'));
  assert.equal(session.entries(setPickDay(moved, 'pick-0', 'Monday'))[0].note.reply, answerA);
  assert.equal(session.entries(setWeek(state, '2027-01-04'))[0].note.reply, '');
  const newSource = createWeekPlan(response, date);
  assert.throws(() => session.entries(newSource), /different accepted plan/);
  assert.equal(createVenueFollowup(newSource).entries(newSource)[0].note.reply, '');
});

const after = pins();
assert.deepEqual(after, before, 'The reviewed native sources changed during the probe.');
const result = { schema: 'independent-tastetable-question-receipt-v1', source_root: root,
  source_before: before, source_after: after, node: process.version,
  fixture: 'Two explicitly authored occurrences at one fictional venue; native ESM functions only.',
  cases, passed: cases.filter(c => c.passed).length, failed: cases.filter(c => !c.passed).length,
  skipped: 0, browser_executed: false, server_executed: false, live_venue_or_provider_calls: 0 };
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.failed ? 1 : 0;
