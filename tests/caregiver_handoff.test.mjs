import assert from "node:assert/strict";
import test from "node:test";
import { createWeekPlan, setPickDay, setWeek } from "../static/week_plan.mjs";
import { makeWeekFile, readWeekFile } from "../static/week_file.mjs";
import { createVenueFollowup } from "../static/venue_followup.mjs";
import { makeVenueNoteFile } from "../static/venue_note_file.mjs";
import { CAREGIVER_HANDOFF_FORMAT, CAREGIVER_HANDOFF_BYTE_LIMIT, makeCaregiverHandoff, readCaregiverHandoff } from "../static/caregiver_handoff.mjs";

// Authored two-occurrence model fixture, adapted from the maintained companion gate.
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

function record(context, key, reply) {
  const entry = context.model.entries(context.state).find((item) => item.key === key);
  context.model.setField(context.state, key, entry.date, "reply", reply);
  return entry;
}
const envelope = (context = fixture()) => JSON.parse(makeCaregiverHandoff(context, now).text);

test("one editable handoff preserves both native formats, original inputs and calendar identity", () => {
  const context = fixture();
  context.origin.inputs.music = ["Earth, Wind & Fire", "Café 海"];
  context.origin.response.trace[0].args = ["literal <img>", null, { source: "retained" }];
  context.state = createWeekPlan(context.origin.response, "2026-12-28");
  context.model = createVenueFollowup(context.state);
  const entry = record(context, "pick-0", "\nReply 海 🧭\n  trailing space ");
  context.model.setField(context.state, entry.key, entry.date, "question", "Revised question?\r\nFollow up.");
  context.state = setPickDay(context.state, "pick-1", "Sunday");
  record(context, "pick-1", "Separate Sunday answer.");
  context.state = setPickDay(context.state, "pick-1", null);
  const before = { origin: copy(context.origin), state: copy(context.state), notes: context.model.snapshotRecords() };
  const saved = makeCaregiverHandoff(context, now);
  const value = JSON.parse(saved.text);
  assert.equal(value.format, CAREGIVER_HANDOFF_FORMAT);
  assert.equal(saved.filename, "tastetable-caregiver-handoff-2026-12-28.json");
  assert.deepEqual(value.week, JSON.parse(makeWeekFile({ ...context.origin, state: context.state }, now).text));
  assert.deepEqual(value.venueNotes, JSON.parse(makeVenueNoteFile(context, now).text));
  const opened = readCaregiverHandoff(saved.text);
  assert.deepEqual(opened.origin, context.origin);
  assert.deepEqual(opened.state, context.state);
  assert.deepEqual(opened.model.snapshotRecords(), before.notes);
  assert.equal(opened.model.entries(opened.state)[0].questionsChangedAfterReply, true);
  assert.equal(opened.model.entries(opened.state)[0].note.replyQuestions, entry.questionText);
  assert.deepEqual(context.origin, before.origin);
  assert.deepEqual(context.state, before.state);
  assert.deepEqual(context.model.snapshotRecords(), before.notes);
  assert.equal(makeCaregiverHandoff({ origin: opened.origin, state: opened.state, model: opened.model }, now).text, saved.text);
});

test("same named venue occurrences, omitted visits and earlier weeks keep distinct records", () => {
  const context = fixture();
  context.state = setPickDay(context.state, "pick-1", "Monday");
  record(context, "pick-0", "First occurrence");
  record(context, "pick-1", "Second occurrence");
  context.state = setWeek(context.state, "2027-01-04");
  record(context, "pick-0", "Following week");
  context.state = setPickDay(context.state, "pick-0", null);
  const opened = readCaregiverHandoff(makeCaregiverHandoff(context, now).text);
  assert.equal(opened.model.snapshotRecords().length, 3);
  const earlier = setWeek(setPickDay(opened.state, "pick-0", "Monday"), "2026-12-28");
  assert.deepEqual(opened.model.entries(earlier).map((item) => item.note.reply), ["First occurrence", "Second occurrence"]);
  assert.equal(opened.model.entries(setPickDay(opened.state, "pick-0", "Monday"))[0].note.reply, "Following week");
});

test("a valid week paired with another source's notes is wholly refused", () => {
  const original = envelope();
  const changes = [
    (value) => { value.venueNotes.origin.receivedAt = "2026-10-08T17:00:00.001Z"; },
    (value) => { value.venueNotes.origin.calendarId = null; },
    (value) => { value.venueNotes.origin.inputs.city = "Another original request"; },
    (value) => { value.venueNotes.origin.inputs.music.push("Another input"); },
    (value) => { value.venueNotes.origin.response.trace[0].args.witness = "Different response"; },
    (value) => { value.venueNotes.origin.response.plan.meals.reverse(); },
    (value) => { value.venueNotes.origin.response.mock = false; },
  ];
  for (const mutate of changes) {
    const value = copy(original); mutate(value);
    assert.throws(() => readCaregiverHandoff(JSON.stringify(value)), /different accepted plan/);
  }
});

test("complete native week validation and complete late note validation remain required", () => {
  const context = fixture(); record(context, "pick-0", "Original reply");
  const original = envelope(context), retained = context.model.snapshotRecords();
  const changes = [
    (value) => { value.week.week.start = "2026-12-29"; },
    (value) => { delete value.week.week.assignments["pick-1"]; },
    (value) => { value.week.response.comparison.grounded.picks = "<img>"; },
    (value) => { value.venueNotes.records.push(copy(value.venueNotes.records[0])); },
    (value) => { value.venueNotes.records.push({ ...copy(value.venueNotes.records[0]), key: "pick-99" }); },
    (value) => { value.venueNotes.records.push({ ...copy(value.venueNotes.records[0]), date: "2026-02-30" }); },
    (value) => { value.venueNotes.records[0].note.replyQuestions = null; },
    (value) => { Object.assign(value.venueNotes.records[0].note, { status: "reply_recorded", question: "Revised?" }); },
    (value) => { value.venueNotes.records[0].note.extra = "Unsupported"; },
  ];
  for (const mutate of changes) {
    const value = copy(original); mutate(value);
    assert.throws(() => readCaregiverHandoff(JSON.stringify(value)));
    assert.deepEqual(context.model.snapshotRecords(), retained);
  }
});

test("the new outer version and timestamp do not admit a native section by itself", () => {
  const value = envelope();
  const invalid = [value.week, value.venueNotes, { ...value, format: "tastetable.caregiver-handoff.v2" },
    { ...value, savedAt: "2026-10-08" }, { ...value, savedAt: "invalid" },
    { ...value, extra: true }, { ...value, venueNotes: null }, { ...value, week: null }];
  for (const item of invalid) assert.throws(() => readCaregiverHandoff(JSON.stringify(item)));
  assert.throws(() => readCaregiverHandoff("{"), /valid JSON/);
  assert.throws(() => readCaregiverHandoff(null), /6 MiB/);
  assert.doesNotThrow(() => readCaregiverHandoff("\uFEFF" + JSON.stringify(value)));
});

test("the 6 MiB UTF-8 envelope boundary retains the native 2 MiB notes boundary", () => {
  const text = makeCaregiverHandoff(fixture(), now).text;
  const atLimit = text + " ".repeat(CAREGIVER_HANDOFF_BYTE_LIMIT - Buffer.byteLength(text));
  assert.doesNotThrow(() => readCaregiverHandoff(atLimit));
  assert.throws(() => readCaregiverHandoff(atLimit + " "), /6 MiB/);
  const context = fixture();
  context.origin.inputs.city = "海".repeat(700000);
  const value = { format: CAREGIVER_HANDOFF_FORMAT, savedAt: now.toISOString(),
    week: JSON.parse(makeWeekFile({ ...context.origin, state: context.state }, now).text),
    venueNotes: { format: "tastetable.venue-notes.v1", savedAt: now.toISOString(), origin: context.origin, records: [] } };
  assert.ok(Buffer.byteLength(JSON.stringify(value)) < CAREGIVER_HANDOFF_BYTE_LIMIT);
  assert.throws(() => readCaregiverHandoff(JSON.stringify(value)), /2 MiB/);
  assert.throws(() => makeCaregiverHandoff(context, now), /2 MiB/);
});

test("a prepared empty handoff has an independent empty model and preserves null calendar identity", () => {
  const current = fixture(); record(current, "pick-0", "Current note survives reading");
  const empty = fixture(); empty.origin.calendarId = null;
  empty.state = setPickDay(setPickDay(empty.state, "pick-0", null), "pick-1", null);
  const prepared = readCaregiverHandoff(makeCaregiverHandoff(empty, now).text);
  assert.deepEqual(prepared.model.snapshotRecords(), []);
  assert.deepEqual(prepared.state.assignments, { "pick-0": null, "pick-1": null });
  assert.equal(prepared.calendarId, null);
  assert.equal(JSON.parse(makeWeekFile({ ...prepared.origin, state: prepared.state }, now).text).calendarId, null);
  assert.equal(current.model.snapshotRecords()[0].note.reply, "Current note survives reading");
  assert.notEqual(prepared.model, current.model);
});

test("source labels and source-bound writer guard stay attached to the original response", () => {
  for (const mock of [true, false, undefined]) {
    const context = fixture();
    if (mock === undefined) delete context.origin.response.mock; else context.origin.response.mock = mock;
    context.state = createWeekPlan(context.origin.response, "2026-12-28");
    context.model = createVenueFollowup(context.state);
    const opened = readCaregiverHandoff(makeCaregiverHandoff(context, now).text);
    assert.equal(opened.state.sourceMode, mock === true ? "mock" : mock === false ? "live" : "unknown");
    assert.match(opened.model.sourceLabel, /have not been run again/);
  }
  const context = fixture(), foreign = fixture();
  assert.throws(() => makeCaregiverHandoff({ ...context, model: foreign.model }, now), /different accepted plan/);
});
