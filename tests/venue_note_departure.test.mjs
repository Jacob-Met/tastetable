import assert from "node:assert/strict";
import test from "node:test";
import { createWeekPlan, setPickDay, setWeek } from "../static/week_plan.mjs";
import { createVenueFollowup } from "../static/venue_followup.mjs";

function fresh() {
  const state = createWeekPlan({ mock: true, comparison: { constraints: [] }, plan: {
    meals: [{ day: "Monday", kind: "restaurant", entity_id: "FIX-LEAVE", name: "Fictional café", why: "Synthetic fixture." }],
    outing: null, notes: [], rejected: [],
  } }, "2026-10-12");
  return { state, model: createVenueFollowup(state) };
}
test("unchanged and explicitly default records have no content to protect", () => {
  const { state, model } = fresh();
  assert.equal(model.hasRecordedNotes(), false);
  for (const [field, value] of [["status","not_contacted"],["reply",""],["nextStep",""],["question",model.entries(state)[0].questionText]]) {
    model.setField(state,"pick-0","2026-10-12",field,value);
    assert.equal(model.hasRecordedNotes(), false, field);
  }
  assert.equal(model.snapshotRecords().length, 1, "default record remains serialized unchanged");
});
test("each independently edited field arms protection and exact reversion releases it", () => {
  for (const [field,value] of [["status","awaiting_reply"],["reply","Venue response"],["nextStep","Call again"],["question",""]]) {
    const { state, model } = fresh(), original = field === "question" ? model.entries(state)[0].questionText : field === "status" ? "not_contacted" : "";
    model.setField(state,"pick-0","2026-10-12",field,value);
    assert.equal(model.hasRecordedNotes(),true,field);
    model.setField(state,"pick-0","2026-10-12",field,original);
    assert.equal(model.hasRecordedNotes(),false,field);
  }
});
test("protection covers retained records beyond visible dates and omitted visits", () => {
  const { state, model } = fresh();
  model.setField(state,"pick-0","2026-10-12","reply","Retain previous-date reply");
  assert.equal(model.entries(setPickDay(state,"pick-0",null)).length,0);
  assert.equal(model.entries(setWeek(state,"2026-10-19"))[0].note.reply,"");
  assert.equal(model.hasRecordedNotes(),true);
});
test("accepted imports and empty replacement update protection without altering serialization", () => {
  const { state, model } = fresh(), imported = fresh().model;
  model.setField(state,"pick-0","2026-10-12","nextStep","Saved next step");
  const rows=model.snapshotRecords(), before=JSON.stringify(rows);
  imported.replaceRecords(rows);
  assert.equal(imported.hasRecordedNotes(),true);
  assert.equal(JSON.stringify(imported.snapshotRecords()),before);
  imported.replaceRecords([]);
  assert.equal(imported.hasRecordedNotes(),false);
});
test("refused edits and invalid imports preserve the admitted note and protection", () => {
  const { state, model } = fresh();
  model.setField(state,"pick-0","2026-10-12","reply","Kept");
  const before=JSON.stringify(model.snapshotRecords());
  assert.throws(()=>model.setField(state,"pick-0","2026-10-12","reply","x".repeat(2001)));
  assert.throws(()=>model.replaceRecords([{key:"not-present",date:"2026-10-12",note:{}}]));
  assert.equal(model.hasRecordedNotes(),true);
  assert.equal(JSON.stringify(model.snapshotRecords()),before);
});
test("question-history status remains meaningful even after restoring original questions", () => {
  const { state, model } = fresh(), original=model.entries(state)[0].questionText;
  model.setField(state,"pick-0","2026-10-12","reply","Earlier reply");
  model.setField(state,"pick-0","2026-10-12","question","Changed questions");
  model.setField(state,"pick-0","2026-10-12","reply","");
  model.setField(state,"pick-0","2026-10-12","question",original);
  assert.equal(model.hasRecordedNotes(),true,"follow_up status is still recorded content");
  model.setField(state,"pick-0","2026-10-12","status","not_contacted");
  assert.equal(model.hasRecordedNotes(),false);
});
