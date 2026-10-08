/** Supplement for the owner's explicit refusal to relabel an earlier reply. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = fs.realpathSync(process.argv[2]);
const sha = raw => crypto.createHash('sha256').update(raw).digest('hex');
const names = ['static/venue_followup.mjs', 'static/week_plan.mjs'];
const pins = () => Object.fromEntries(names.map(name => [name, sha(fs.readFileSync(path.join(root, name)))]));
const sourceBefore = pins();
const { createVenueFollowup } = await import(pathToFileURL(path.join(root, names[0])));
const { createWeekPlan } = await import(pathToFileURL(path.join(root, names[1])));
const state = createWeekPlan({ mock: true, comparison: { constraints: ['wheelchair'] }, plan: {
  meals: [{ day: 'Monday', kind: 'restaurant', entity_id: 'FIX-INDEPENDENT-STATUS', name: 'Fictional status-control venue', why: 'Original source explanation.' }],
  outing: null, notes: [],
} }, '2026-12-28');
const session = createVenueFollowup(state);
const edit = (field, text) => session.setField(state, 'pick-0', '2026-12-28', field, text);
const earlier = 'EARLIER QUESTION: Is the east entrance step-free?';
const current = 'CURRENT QUESTION: Can lower-salt soup be prepared?';
const reply = 'EARLIER REPLY: Staff described the entrance only.';
const result = { schema: 'independent-tastetable-status-refusal-v1', sourceRoot: root, sourceBefore,
  node: process.version, browserExecuted: false, serverExecuted: false, liveVenueOrProviderCalls: 0 };
try {
  edit('question', earlier);
  edit('reply', reply);
  edit('status', 'reply_recorded');
  edit('question', current);
  const before = structuredClone(session.entries(state)[0]);
  assert.equal(before.questionsChangedAfterReply, true);
  assert.equal(before.note.status, 'follow_up');
  let refusal;
  try { edit('status', 'reply_recorded'); } catch (error) { refusal = error; }
  assert.ok(refusal instanceof Error, 'The declared stricter status guard must refuse.');
  result.refusal = { name: refusal.name, message: refusal.message };
  const after = session.entries(state)[0];
  assert.deepEqual(after, before, 'A refused status change must leave the whole entry intact.');
  edit('nextStep', 'Ask the new soup question.');
  assert.equal(session.entries(state)[0].questionsChangedAfterReply, true);
  assert.equal(session.entries(state)[0].note.reply, reply);
  for (const text of [earlier, current, reply]) assert.ok(session.text(state).includes(text));
  edit('reply', 'CURRENT REPLY: Newly entered notes about the soup question.');
  assert.equal(session.entries(state)[0].questionsChangedAfterReply, false);
  result.status = 'passed';
  result.refusalAtomic = true;
  result.earlierQuestionAndReplyRetained = true;
  result.explicitNewReplyBindsCurrentQuestion = true;
} catch (error) {
  result.status = 'failed';
  result.error = error.stack;
  process.exitCode = 1;
}
result.sourceAfter = pins();
assert.deepEqual(result.sourceAfter, sourceBefore);
console.log(JSON.stringify(result, null, 2));
