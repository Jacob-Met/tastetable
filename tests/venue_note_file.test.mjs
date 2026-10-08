import assert from "node:assert/strict";
import test from "node:test";
import { createWeekPlan, setPickDay, setWeek } from "../static/week_plan.mjs";
import { makeWeekFile, readWeekFile } from "../static/week_file.mjs";
import { createVenueFollowup } from "../static/venue_followup.mjs";
import { makeVenueNoteFile, readVenueNoteFile, VENUE_NOTE_BYTE_LIMIT } from "../static/venue_note_file.mjs";

const copy = (value) => structuredClone(value);
const now = new Date("2026-10-08T18:00:00.000Z");
function fixture() {
  const counts = { picks: 2, with_qloo_entity_id: 2, with_affinity_evidence: 0, constraint_checked: 2, unsafe_candidates_rejected: 0 };
  const inputs = { cuisines: ["Fictional"], music: [], films: [], city: "Authored fixture", constraints: ["soft_foods", "wheelchair"] };
  const response = {
    mock: true, plan: {
      meals: [
        { day: "Monday", kind: "restaurant", entity_id: "FIX-same", name: "Fixture café 海", why: "Original first occurrence; ask the venue.", affinity: null },
        { day: "Tuesday", kind: "restaurant", entity_id: "FIX-same", name: "Fixture café 海", why: "Different original occurrence.", affinity: null },
      ], outing: null, notes: ["Synthetic input; no venue finding."], rejected: [],
    },
    comparison: { constraints: inputs.constraints, grounded: counts, llm_only: counts },
    llm_only: { meals: [], outing: { day: "Friday", name: "Ungrounded fixture", why: "No source." } },
    trace: [{ tool: "authored_fixture", args: { witness: "original" }, result_summary: "Fictional input" }],
  };
  const origin = { response, inputs, receivedAt: "2026-10-08T17:00:00.000Z", calendarId: "0123456789abcdef0123456789abcdef" };
  const state = createWeekPlan(response, "2026-12-28");
  return { origin, state, model: createVenueFollowup(state) };
}
function reopened(context, state = context.state) {
  const original = readWeekFile(makeWeekFile({ ...context.origin, state }, now).text);
  return { origin: { response: original.response, inputs: original.inputs, receivedAt: original.receivedAt, calendarId: original.calendarId },
    state: original.state, model: createVenueFollowup(original.state) };
}
function record(context, key = "pick-0", reply = "A recorded reply") {
  const entry = context.model.entries(context.state).find((row) => row.key === key);
  context.model.setField(context.state, key, entry.date, "reply", reply);
  return entry;
}

test("companion restores all exact records across reopening, omitted visits and other dates", () => {
  const first = fixture();
  record(first, "pick-0", "\nRéponse 海 🧭\n  keep this space ");
  first.model.setField(first.state, "pick-0", "2026-12-28", "status", "reply_recorded");
  first.model.setField(first.state, "pick-0", "2026-12-28", "question", "Revised question?\r\nNot yet answered.");
  const later = { ...first, state: setWeek(setPickDay(first.state, "pick-1", "Monday"), "2027-01-04") };
  record(later, "pick-1", "Another dated occurrence");
  first.model.setField(later.state, "pick-1", "2027-01-04", "nextStep", "Call later\n  留");
  const notesBefore = first.model.snapshotRecords(), originalBefore = JSON.stringify(first.origin);
  const output = makeVenueNoteFile(later, now);
  const target = reopened(later, setPickDay(later.state, "pick-1", null));
  assert.deepEqual(target.model.snapshotRecords(), []);
  const prepared = readVenueNoteFile(output.text, target);
  assert.deepEqual(target.model.snapshotRecords(), [], "reading alone cannot replace notes");
  const stateBefore = target.state;
  target.model.replaceRecords(prepared.records);
  assert.equal(target.state, stateBefore);
  assert.deepEqual(target.model.snapshotRecords(), notesBefore);
  const earlier = setWeek(target.state, "2026-12-28");
  const old = target.model.entries(earlier).find((row) => row.key === "pick-0");
  assert.equal(old.note.reply, "\nRéponse 海 🧭\n  keep this space ");
  assert.equal(old.questionsChangedAfterReply, true);
  assert.equal(old.note.status, "follow_up");
  assert.notEqual(old.note.replyQuestions, old.questionText);
  assert.equal(JSON.stringify(first.origin), originalBefore);
});

test("same venue, day and visible name keep their separate original occurrence identities", () => {
  const source = fixture(); source.state = setPickDay(source.state, "pick-1", "Monday");
  record(source, "pick-0", "First visit's answer");
  record(source, "pick-1", "Second visit's answer");
  const target = reopened(source);
  target.model.replaceRecords(readVenueNoteFile(makeVenueNoteFile(source, now).text, target).records);
  assert.deepEqual(target.model.entries(target.state).map((row) => row.note.reply), ["First visit's answer", "Second visit's answer"]);
  const moved = setPickDay(target.state, "pick-0", "Friday");
  assert.equal(target.model.entries(moved).find((row) => row.key === "pick-0").note.reply, "");
  assert.equal(target.model.entries(moved).find((row) => row.key === "pick-1").note.reply, "Second visit's answer");
  assert.equal(target.model.entries(target.state)[0].note.reply, "First visit's answer");
});

test("late invalid or duplicate records cannot partially replace current notes", () => {
  const target = fixture(); record(target, "pick-0", "Current note must survive");
  const before = target.model.snapshotRecords();
  const rows = copy(before); rows[0].note.reply = "Incoming replacement";
  const invalid = [
    [...rows, { ...rows[0], date: "2026-02-30" }],
    [...rows, { ...rows[0], key: "pick-99" }],
    [...rows, copy(rows[0])],
    [{ ...rows[0], extra: "unsupported" }],
    [{ ...rows[0], note: { ...rows[0].note, extra: "unsupported" } }],
  ];
  for (const records of invalid) {
    assert.throws(() => target.model.replaceRecords(records));
    assert.deepEqual(target.model.snapshotRecords(), before);
  }
});

test("unsupported field types and inconsistent reply history are refused literally", () => {
  const context = fixture(); record(context);
  const file = JSON.parse(makeVenueNoteFile(context, now).text);
  const originals = context.model.snapshotRecords();
  const edits = [
    { status: ["awaiting_reply"] }, { status: "constructor" }, { question: 2 },
    { question: "q".repeat(2001) }, { reply: "r".repeat(2001) }, { nextStep: "n".repeat(501) },
    { replyQuestions: null }, { replyQuestions: 42 }, { replyQuestions: "q".repeat(2001) },
    { reply: " \n", replyQuestions: "Earlier" },
    { status: "reply_recorded", question: "Different?", replyQuestions: "Earlier?" },
  ];
  for (const changes of edits) {
    const value = copy(file); Object.assign(value.records[0].note, changes);
    assert.throws(() => readVenueNoteFile(JSON.stringify(value), context));
    assert.deepEqual(context.model.snapshotRecords(), originals);
  }
});

test("full origin equality accepts reordered JSON keys but refuses another request or response", () => {
  const context = fixture(); record(context);
  const file = JSON.parse(makeVenueNoteFile(context, now).text);
  const mutations = [
    (v) => { v.origin.receivedAt = "2026-10-08T17:00:00.001Z"; },
    (v) => { v.origin.calendarId = "fedcba9876543210fedcba9876543210"; },
    (v) => { v.origin.inputs.music.push("Other input"); },
    (v) => { v.origin.response.trace[0].args.witness = "another origin"; },
    (v) => { v.origin.response.plan.meals.reverse(); },
    (v) => { v.origin.response.mock = false; },
    (v) => { v.origin.response.plan.meals[0].affinity = Infinity; },
  ];
  for (const mutate of mutations) {
    const value = copy(file); mutate(value);
    const text = JSON.stringify(value).replace('"affinity":null', value.origin.response.plan.meals[0].affinity === Infinity ? '"affinity":1e309' : '"affinity":null');
    assert.throws(() => readVenueNoteFile(text, context), /different accepted plan|finite JSON/);
  }
  const reordered = copy(file);
  reordered.origin = Object.fromEntries(Object.entries(reordered.origin).reverse());
  reordered.origin.response = Object.fromEntries(Object.entries(reordered.origin.response).reverse());
  assert.deepEqual(readVenueNoteFile(JSON.stringify(reordered), context).records, context.model.snapshotRecords());
});

test("bounded v1 file admission and explicit empty replacement preserve the original week codec", () => {
  const context = fixture(); record(context);
  const originalWeek = makeWeekFile({ ...context.origin, state: context.state }, now).text;
  const file = JSON.parse(makeVenueNoteFile(context, now).text);
  const invalid = [
    { ...file, format: "tastetable.venue-notes.v2" },
    { ...file, savedAt: "not a timestamp" },
    { ...file, records: {} },
    { ...file, records: Array(257).fill(file.records[0]) },
    { ...file, unexpected: 1 },
  ];
  for (const value of invalid) assert.throws(() => readVenueNoteFile(JSON.stringify(value), context));
  assert.throws(() => readVenueNoteFile("{", context), /valid JSON/);
  assert.throws(() => readVenueNoteFile(" ".repeat(VENUE_NOTE_BYTE_LIMIT + 1), context), /2 MiB/);
  assert.doesNotThrow(() => readVenueNoteFile("\uFEFF" + JSON.stringify(file), context));
  assert.equal(makeWeekFile({ ...context.origin, state: context.state }, now).text, originalWeek);
  const empty = { ...file, records: [] };
  const preview = readVenueNoteFile(JSON.stringify(empty), context);
  assert.equal(context.model.snapshotRecords().length, 1);
  context.model.replaceRecords(preview.records);
  assert.deepEqual(context.model.snapshotRecords(), []);
  assert.equal(makeWeekFile({ ...context.origin, state: context.state }, now).text, originalWeek);
});

test("source-bound model guard and exact existing field limits remain in the new file boundary", () => {
  const context = fixture();
  const entry = context.model.entries(context.state)[0];
  const question = "🧭".repeat(1000), reply = "Ré".repeat(1000), nextStep = " ".repeat(500);
  context.model.setField(context.state, entry.key, entry.date, "question", question);
  context.model.setField(context.state, entry.key, entry.date, "reply", reply);
  context.model.setField(context.state, entry.key, entry.date, "nextStep", nextStep);
  const result = readVenueNoteFile(makeVenueNoteFile(context, now).text, context);
  assert.equal(result.records[0].note.question, question);
  assert.equal(result.records[0].note.reply, reply);
  assert.equal(result.records[0].note.nextStep, nextStep);
  const foreign = fixture();
  assert.throws(() => makeVenueNoteFile({ ...context, state: foreign.state }, now), /different accepted plan/);
  assert.ok(Object.isFrozen(result.records) && Object.isFrozen(result.records[0].note));
});
