import assert from "node:assert/strict";
import test from "node:test";
import { createWeekPlan, resetDays, setPickDay, setWeek } from "../static/week_plan.mjs";
import { CONTACT_STATES, createVenueFollowup } from "../static/venue_followup.mjs";

function response() {
  return {
    mock: true,
    comparison: { constraints: ["soft_foods", "low_sodium", "wheelchair"] },
    plan: {
      meals: [
        { day: "Monday", kind: "restaurant", entity_id: "FIX-repeat", name: "Fictional café", why: "Soft foods: unknown (ask the venue)." },
        { day: "Tuesday", kind: "restaurant", entity_id: "FIX-repeat", name: "Fictional café", why: "Original second occurrence." },
      ],
      outing: { day: "Saturday", kind: "outing", entity_id: "FIX-museum", name: "Fictional museum", why: "Wheelchair: pass (fixture tag)." },
      notes: ["A synthetic, heuristic plan."], rejected: [],
    },
  };
}
const week = () => createWeekPlan(response(), "2026-12-30");

test("questions use the native purpose and constraints; original unknown explanation survives", () => {
  const state = week();
  const entries = createVenueFollowup(state).entries(state);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].date, "2026-12-28");
  assert.equal(entries[0].questions.length, 4);
  assert.match(entries[0].questions[0], /2026-12-28/);
  assert.equal(entries[2].questions.length, 2);
  assert.match(entries[2].questions[1], /step-free/);
  assert.match(entries[0].pick.why, /unknown/);
});

test("a different date starts a separate note; returning restores only that occurrence's note", () => {
  const initial = week(), contacts = createVenueFollowup(initial);
  contacts.setField(initial, "pick-0", "2026-12-28", "reply", "Monday response");
  const moved = setPickDay(initial, "pick-0", "Thursday");
  assert.equal(contacts.entries(moved).find((entry) => entry.key === "pick-0").note.reply, "");
  contacts.setField(moved, "pick-0", "2026-12-31", "reply", "Thursday response");
  assert.equal(contacts.entries(resetDays(moved))[0].note.reply, "Monday response");
  assert.equal(contacts.entries(moved).find((entry) => entry.key === "pick-0").note.reply, "Thursday response");
});

test("two occurrences sharing an entity and date retain distinct caregiver notes", () => {
  const initial = week(), state = setPickDay(initial, "pick-1", "Monday");
  const contacts = createVenueFollowup(initial);
  contacts.setField(state, "pick-0", "2026-12-28", "reply", "First visit");
  contacts.setField(state, "pick-1", "2026-12-28", "reply", "Second visit");
  const entries = contacts.entries(state);
  assert.deepEqual(entries.slice(0, 2).map((entry) => [entry.occurrence, entry.note.reply]), [[1, "First visit"], [2, "Second visit"]]);
});

test("omitted picks have no active contact card or exported note, and restore retains its date", () => {
  const initial = week(), contacts = createVenueFollowup(initial);
  contacts.setField(initial, "pick-0", "2026-12-28", "reply", "Keep this original note");
  const omitted = setPickDay(initial, "pick-0", null);
  assert.equal(contacts.entries(omitted).length, 2);
  assert.doesNotMatch(contacts.text(omitted), /Keep this original note/);
  assert.throws(() => contacts.setField(omitted, "pick-0", "2026-12-28", "reply", "Stale edit"), /no longer scheduled/);
  assert.equal(contacts.entries(resetDays(omitted))[0].note.reply, "Keep this original note");
});

test("another week has separate notes even when weekday and occurrence are unchanged", () => {
  const initial = week(), contacts = createVenueFollowup(initial);
  contacts.setField(initial, "pick-0", "2026-12-28", "status", "reply_recorded");
  const later = setWeek(initial, "2027-01-04");
  assert.equal(contacts.entries(later)[0].note.status, "not_contacted");
  assert.equal(contacts.entries(setWeek(later, "2026-12-30"))[0].note.status, "reply_recorded");
});

test("an identical newly accepted response cannot inherit or access the prior worksheet", () => {
  const initial = week(), replacement = week(), contacts = createVenueFollowup(initial);
  contacts.setField(initial, "pick-0", "2026-12-28", "reply", "Old source response");
  assert.throws(() => contacts.entries(replacement), /different accepted plan/);
  assert.throws(() => contacts.text(replacement), /different accepted plan/);
  assert.equal(createVenueFollowup(replacement).entries(replacement)[0].note.reply, "");
});

test("source provenance cannot be relabeled while borrowing the original source objects", () => {
  const initial = week(), contacts = createVenueFollowup(initial);
  assert.throws(() => contacts.text({ ...initial, sourceMode: "live" }), /different accepted plan/);
});

test("an event still carrying the old date cannot update the newly scheduled visit", () => {
  const initial = week(), contacts = createVenueFollowup(initial);
  const moved = setPickDay(initial, "pick-0", "Thursday");
  assert.throws(() => contacts.setField(moved, "pick-0", "2026-12-28", "reply", "Stale DOM event"), /no longer scheduled/);
  assert.equal(contacts.entries(moved).find((entry) => entry.key === "pick-0").note.reply, "");
});

test("the printable export carries exact source, dates and labeled multiline caregiver notes", () => {
  const initial = week(), sourceBefore = JSON.stringify(initial), contacts = createVenueFollowup(initial);
  contacts.setField(initial, "pick-0", "2026-12-28", "reply", "No answer yet.\nTry the venue again.");
  contacts.setField(initial, "pick-0", "2026-12-28", "nextStep", "Call on Friday.");
  contacts.setField(initial, "pick-0", "2026-12-28", "status", "follow_up");
  const output = contacts.text(initial);
  assert.match(output, /Demo plan: fictional venues/);
  assert.match(output, /Monday 2026-12-28 — Fictional café/);
  assert.match(output, /Soft foods: unknown \(ask the venue\)\./);
  assert.match(output, /Caregiver contact status: Needs follow-up/);
  assert.match(output, /Venue reply \/ your notes:\n  No answer yet\.\n  Try the venue again\./);
  assert.match(output, /not a safety check, reservation or confirmation by TasteTable/);
  assert.equal(JSON.stringify(initial), sourceBefore);
  assert.ok(!Object.values(CONTACT_STATES).some((value) => /safe|verified|confirmed/i.test(value)));
});

test("empty scheduled weeks cannot create an apparently populated call sheet", () => {
  const initial = week(), contacts = createVenueFollowup(initial);
  const empty = initial.picks.reduce((state, pick) => setPickDay(state, pick.key, null), initial);
  assert.deepEqual(contacts.entries(empty), []);
  assert.throws(() => contacts.text(empty), /at least one pick/);
});

test("unknown fields, status values and oversized notes do not modify a retained note", () => {
  const initial = week(), contacts = createVenueFollowup(initial);
  contacts.setField(initial, "pick-0", "2026-12-28", "reply", "Preserve me");
  for (const [field, value] of [["verified", "true"], ["status", "safe"], ["nextStep", "x".repeat(501)], ["reply", "x".repeat(2001)], ["reply", false]]) {
    assert.throws(() => contacts.setField(initial, "pick-0", "2026-12-28", field, value));
  }
  assert.equal(contacts.entries(initial)[0].note.reply, "Preserve me");
  assert.throws(() => { contacts.entries(initial)[0].note.reply = "mutated"; }, TypeError);
});

test("a reopened source retains its filename, age and unchanged-check label in the call sheet", () => {
  const state = week();
  const label = 'Saved copy opened from “caregiver-week.json” (saved 2026-10-08T12:00:00.000Z). Source labels and checks below are retained from the file; they have not been run again.';
  const contacts = createVenueFollowup(state, label);
  assert.ok(contacts.text(state).includes(label));
  assert.ok(contacts.sourceLabel.includes(label));
  assert.ok(contacts.text(setWeek(state, "2027-01-04")).includes(label));
  assert.equal(contacts.entries(state)[0].note.reply, "");
});

test("editable questions remain literal, occurrence/date-bound text alongside unchanged source checks", () => {
  const state = week(), before = JSON.stringify(state), contacts = createVenueFollowup(state);
  const question = 'Is the side entrance available?\nCan we visit before 1pm? <script>literal text</script>';
  contacts.setField(state, "pick-0", "2026-12-28", "question", question);
  const entry = contacts.entries(state)[0];
  assert.equal(entry.questionText, question);
  assert.deepEqual(entry.questions, question.split("\n"));
  assert.ok(contacts.text(state).includes(question.split("\n")[1]));
  assert.notEqual(contacts.entries(state)[1].questionText, question);
  assert.notEqual(contacts.entries(setPickDay(state, "pick-0", "Thursday")).find((item) => item.key === "pick-0").questionText, question);
  assert.equal(contacts.entries(state)[0].questionText, question);
  assert.equal(JSON.stringify(state), before);
});

test("revising questions retains the earlier reply with its actual question context and a follow-up hold", () => {
  const state = week(), contacts = createVenueFollowup(state);
  const original = contacts.entries(state)[0].questionText;
  contacts.setField(state, "pick-0", "2026-12-28", "reply", "The venue replied about the original visit.");
  contacts.setField(state, "pick-0", "2026-12-28", "status", "reply_recorded");
  contacts.setField(state, "pick-0", "2026-12-28", "question", "Is the side entrance open after 6pm?");
  const revised = contacts.entries(state)[0];
  assert.equal(revised.note.status, "follow_up");
  assert.equal(revised.questionsChangedAfterReply, true);
  assert.equal(revised.note.replyQuestions, original);
  assert.equal(revised.note.reply, "The venue replied about the original visit.");
  assert.match(contacts.text(state), /Earlier reply \/ notes \(for the previous questions\)/);
  assert.ok(contacts.text(state).includes(original.split("\n")[0]));
  assert.throws(() => contacts.setField(state, "pick-0", "2026-12-28", "status", "reply_recorded"), /revised questions/);
  contacts.setField(state, "pick-0", "2026-12-28", "nextStep", "Ask again.");
  assert.equal(contacts.entries(state)[0].questionsChangedAfterReply, true);
  contacts.setField(state, "pick-0", "2026-12-28", "reply", "New reply about the side entrance after 6pm.");
  contacts.setField(state, "pick-0", "2026-12-28", "status", "reply_recorded");
  assert.equal(contacts.entries(state)[0].questionsChangedAfterReply, false);
  assert.equal(contacts.entries(state)[0].note.replyQuestions, "Is the side entrance open after 6pm?");
  assert.doesNotMatch(contacts.text(state), /Earlier reply \/ notes \(for the previous questions\)/);
});

test("unchanged questions preserve status; returning to the earlier questions removes only the mismatch", () => {
  const state = week(), contacts = createVenueFollowup(state), original = contacts.entries(state)[0].questionText;
  contacts.setField(state, "pick-0", "2026-12-28", "reply", "An earlier answer.");
  contacts.setField(state, "pick-0", "2026-12-28", "status", "reply_recorded");
  contacts.setField(state, "pick-0", "2026-12-28", "question", original);
  assert.equal(contacts.entries(state)[0].note.status, "reply_recorded");
  contacts.setField(state, "pick-0", "2026-12-28", "question", "Changed question.");
  contacts.setField(state, "pick-0", "2026-12-28", "question", original);
  assert.equal(contacts.entries(state)[0].questionsChangedAfterReply, false);
  assert.equal(contacts.entries(state)[0].note.status, "follow_up");
});
