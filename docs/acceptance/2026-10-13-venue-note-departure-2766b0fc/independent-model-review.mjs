import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createWeekPlan, setWeek, setPickDay } from '/dev/shm/tastetable-notes-leave-2766b0fc/static/week_plan.mjs';
import { createVenueFollowup } from '/dev/shm/tastetable-notes-leave-2766b0fc/static/venue_followup.mjs';
const source = '/dev/shm/tastetable-notes-leave-2766b0fc/static/venue_followup.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const beforeHash = hash(await readFile(source));
assert.equal(beforeHash, '9cd974e794e17c87e3b51b4ba7820200ce820ae611c8565a5224d68790441d32');
const state = createWeekPlan({mock:true, comparison:{constraints:['wheelchair','low_sodium']},
  plan:{meals:[
    {day:'Monday',kind:'restaurant',entity_id:'same-demo-id',name:'Authored venue',why:'Fixture'},
    {day:'Tuesday',kind:'restaurant',entity_id:'same-demo-id',name:'Authored venue',why:'Fixture'}],
    outing:{day:'Wednesday',kind:'outing',entity_id:'demo-outing',name:'Authored outing',why:'Fixture'},
    notes:[], rejected:[]}}, '2026-10-12');
const model = createVenueFollowup(state), results = [];
const check = (label, value) => { assert.ok(value, label); results.push(label); };
const entries = model.entries(state);
for (const entry of entries) model.setField(state,entry.key,entry.date,'question',entry.questionText);
check('Explicit original questions remain unrecorded for restaurant and outing constraints', !model.hasRecordedNotes());
const shifted = setWeek(state,'2026-10-19');
check('Old-date explicit default questions remain default after changing displayed week', !model.hasRecordedNotes() && model.entries(shifted).length===3);
model.setField(state,'pick-1','2026-10-13','nextStep','Keep a separate occurrence');
check('Duplicate venue identity does not merge occurrence content', model.hasRecordedNotes() && model.entries(state)[0].note.nextStep==='' && model.entries(state)[1].note.nextStep!=='');
const omitted = state.picks.reduce((s,p)=>setPickDay(s,p.key,null),shifted);
check('All visits omitted and week changed retains protected historical content', model.entries(omitted).length===0 && model.hasRecordedNotes());
const saved = JSON.stringify(model.snapshotRecords());
const incompatible = model.snapshotRecords().map(r=>({...r,note:{...r.note}}));
incompatible[0].note.replyQuestions='Unpaired reply history';
assert.throws(()=>model.replaceRecords(incompatible));
check('Atomic invalid full replacement retains prior records and protection', JSON.stringify(model.snapshotRecords())===saved && model.hasRecordedNotes());
const imported = createVenueFollowup(state);
imported.replaceRecords(model.snapshotRecords());
check('Accepted hidden-date multi-record import is protected and byte-equivalent', imported.hasRecordedNotes() && JSON.stringify(imported.snapshotRecords())===saved);
const beforeRead = JSON.stringify(imported.snapshotRecords());
imported.text(state);
check('Preparing readable export cannot mark content clean or change records', imported.hasRecordedNotes() && JSON.stringify(imported.snapshotRecords())===beforeRead);
imported.setField(state,'pick-1','2026-10-13','nextStep','');
check('Reverting only nondefault field releases protection despite retained default records', !imported.hasRecordedNotes() && imported.snapshotRecords().length===3);
imported.setField(state,'pick-0','2026-10-12','reply',' ');
check('Whitespace that remains in serialized text is conservatively protected', imported.hasRecordedNotes());
imported.setField(state,'pick-0','2026-10-12','reply','');
check('Removing that recorded whitespace releases protection', !imported.hasRecordedNotes());
const clean = JSON.stringify(imported.snapshotRecords());
assert.throws(()=>imported.setField(state,'pick-0','2026-10-12','reply','x'.repeat(2001)));
check('Refused edit from a clean model stays clean and unchanged', !imported.hasRecordedNotes() && JSON.stringify(imported.snapshotRecords())===clean);
imported.replaceRecords([]);
check('Explicit empty replacement has no retained records or protection', !imported.hasRecordedNotes() && imported.snapshotRecords().length===0);
check('Exact product source unchanged by review', hash(await readFile(source))===beforeHash);
const receipt={schema:'independent-tastetable-departure-review/1',reviewer:'memory_optimizer',status:'passed',node:process.version,
  candidate_sha256:beforeHash,original_sha256:'cfa96d88aeaf06d55c5a4b7ad457f6a693f571ec06ccd8744141e4922ff3b2c3',
  checks:results,source_review:[
    'Mutation, record admission and replacement bodies are unchanged; new observation checks every retained record against per-occurrence original date questions.',
    'Mounted successful edit, sync/import and retire refresh exactly one window listener; failed setField does not modify the prior protection state.',
    'beforeLeave only requests cancellation and has no record or lifecycle mutation. Note-file preview/cancel and readable/download preparation contain no false-clean transition.',
    'Documentation explicitly limits browser reliability and preserves export requirement, hidden-date coverage and in-app plan-retirement behavior.'],
  limitations:'Pure model execution and source review only. No independent DOM, browser prompt, cancellation or file-download execution; author native receiving owns those claims. No provider/storage changes or live care use.'};
const output='/dev/shm/2766b0fc4581-memory-optimizer/tastetable-departure-independent-review.json';
await writeFile(output,JSON.stringify(receipt,null,2)+'\n');
process.stdout.write(JSON.stringify({status:'passed',checks:results.length,path:output,sha256:hash(await readFile(output))})+'\n');
