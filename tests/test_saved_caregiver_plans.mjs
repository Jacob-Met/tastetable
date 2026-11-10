import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createWeekPlan, setPickDay, setWeek } from "../static/week_plan.mjs";
import { createVenueFollowup } from "../static/venue_followup.mjs";
import { makeCaregiverHandoff, readCaregiverHandoff } from "../static/caregiver_handoff.mjs";
import { createDraft, openDraft, renameDraft, draftSummary, validateDraft, CAREGIVER_DRAFT_VERSION } from "../static/saved_weeks.mjs";
import { makeCollectionBackup, readCollectionBackup, planCollectionRestore } from "../static/saved_week_collection.mjs";
import { createImportedDraft } from "../static/saved_week_import.mjs";
import { makeWeekFile } from "../static/week_file.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/saved-week-response.json", import.meta.url), "utf8"));
const now = new Date("2026-11-10T19:00:00.000Z");
function context() {
  const response = structuredClone(fixture);
  const inputs = { cuisines: ["Cuban", "Mexican"], music: ["Celia Cruz"], films: ["West Side Story"], city: "Pasadena", constraints: ["soft_foods", "low_sodium", "wheelchair"] };
  const origin = { response, inputs, receivedAt: "2026-10-08T10:00:00.000Z", calendarId: "0123456789abcdef0123456789abcdef" };
  const state = setPickDay(createWeekPlan(response, "2027-02-01"), "pick-0", "Wednesday");
  return { origin, state, model: createVenueFollowup(state) };
}
function save(ctx, name = "Wednesday access question") {
  return createDraft({ ...ctx.origin, weekState: ctx.state, venueModel: ctx.model,
    name, id: "caregiver_save_001", now });
}
function note(ctx) {
  const entry = ctx.model.entries(ctx.state).find((item) => item.key === "pick-0");
  ctx.model.setField(ctx.state, entry.key, entry.date, "reply", "Accessible entrance closed until Friday. Do not visit Wednesday.");
  ctx.model.setField(ctx.state, entry.key, entry.date, "status", "follow_up");
  ctx.model.setField(ctx.state, entry.key, entry.date, "nextStep", "Ask about Friday before moving the visit.");
  return entry;
}

test("explicit browser plan retains the contrary reply, follow-up, next action and exact arranged source", () => {
  const ctx = context(); const visit = note(ctx);
  const saved = save(ctx);
  assert.equal(saved.version, CAREGIVER_DRAFT_VERSION);
  assert.equal(saved.text, makeCaregiverHandoff(ctx, now).text);
  const opened = openDraft(saved);
  assert.equal(opened.includesNotes, true);
  assert.deepEqual(opened.origin, ctx.origin);
  assert.deepEqual(opened.state, ctx.state);
  assert.deepEqual(opened.model.snapshotRecords(), ctx.model.snapshotRecords());
  const retained = opened.model.entries(opened.state).find((entry) => entry.key === visit.key);
  assert.equal(retained.day, "Wednesday");
  assert.equal(retained.note.status, "follow_up");
  assert.match(retained.note.reply, /Do not visit Wednesday/);
  assert.equal(retained.note.nextStep, "Ask about Friday before moving the visit.");
  ctx.model.setField(ctx.state, visit.key, visit.date, "reply", "Later unsaved edit");
  const reopened = openDraft(saved);
  assert.match(reopened.model.entries(reopened.state).find((entry) => entry.key === visit.key).note.reply, /Do not visit Wednesday/);
});

test("off-week and omitted notes remain bound to their original occurrence and date", () => {
  const ctx = context(); const first = note(ctx);
  ctx.state = setWeek(ctx.state, "2027-02-08");
  const later = ctx.model.entries(ctx.state).find((item) => item.key === first.key);
  ctx.model.setField(ctx.state, later.key, later.date, "reply", "Next week needs its own confirmation.");
  ctx.state = setPickDay(ctx.state, first.key, null);
  const opened = openDraft(save(ctx));
  assert.equal(opened.records.length, 2);
  assert.deepEqual(opened.model.snapshotRecords(), ctx.model.snapshotRecords());
  assert.equal(draftSummary(save(ctx)).noteCount, 2);
  const earlier = setWeek(setPickDay(opened.state, first.key, "Wednesday"), "2027-02-01");
  assert.match(opened.model.entries(earlier).find((item) => item.key === first.key).note.reply, /Do not visit Wednesday/);
});

test("mixed legacy/full-plan backup and rename retain complete notes without changing old week bytes", () => {
  const ctx = context(); note(ctx);
  const full = save(ctx);
  const legacyText = makeWeekFile({ ...ctx.origin, state: ctx.state }, now).text;
  const legacy = createImportedDraft({ text: legacyText, name: "Old week-only copy", id: "legacy_week_0001" });
  assert.equal(openDraft(legacy).includesNotes, false);
  assert.equal(legacy.text, legacyText);
  const renamed = renameDraft(full, "Access follow-up", new Date("2026-11-11T19:00:00.000Z"));
  assert.equal(renamed.text, full.text);
  const backup = readCollectionBackup(makeCollectionBackup([legacy, renamed].map((draft) => ({ id: draft.id, draft })), now.toISOString()));
  const restored = planCollectionRestore(backup, []).missing;
  assert.equal(restored.length, 2);
  assert.deepEqual(openDraft(restored.find((draft) => draft.id === full.id)).records, openDraft(full).records);
  assert.equal(restored.find((draft) => draft.id === legacy.id).text, legacyText);
});

test("a full plan with no notes remains a complete empty note set, distinct from a legacy week", () => {
  const opened = openDraft(save(context()));
  assert.equal(opened.includesNotes, true);
  assert.deepEqual(opened.records, []);
  assert.equal(draftSummary(opened.draft).noteCount, 0);
});

test("corrupt source binding and version downgrade cannot turn a full plan into a successful week-only restore", () => {
  const ctx = context(); note(ctx);
  const saved = save(ctx);
  const changed = JSON.parse(saved.text);
  changed.venueNotes.origin.inputs.city = "Different source";
  assert.throws(() => validateDraft({ ...saved, text: JSON.stringify(changed) }), /different accepted plan/);
  assert.throws(() => validateDraft({ ...saved, version: 1 }));
  assert.deepEqual(validateDraft(saved), saved);
});

test("collection recovery names the actual handoff and report exposes its dated contrary reply", async () => {
  const { describeCollection, selectStoredWeek } = await import("../tools/collection_week.mjs");
  const { renderCollectionBackup } = await import("../tools/collection_backup_report.mjs");
  const ctx = context(); note(ctx);
  const saved = save(ctx);
  const backup = makeCollectionBackup([{ id: saved.id, draft: saved }], now.toISOString());
  const listed = describeCollection(backup).records[0];
  assert.equal(listed.version, 2);
  assert.equal(listed.contentFormat, "tastetable.caregiver-handoff.v1");
  assert.equal(listed.openWith, "Open caregiver handoff");
  const recovered = selectStoredWeek(backup, saved.id);
  assert.equal(recovered.text, saved.text);
  assert.deepEqual(readCaregiverHandoff(recovered.text).records, openDraft(saved).records);
  const html = renderCollectionBackup(backup);
  assert.match(html, /class="venue-note"/);
  assert.match(html, /2027-02-03/);
  assert.match(html, /Needs follow-up/);
  assert.match(html, /Accessible entrance closed until Friday. Do not visit Wednesday./);
  assert.match(html, /Ask about Friday before moving the visit./);
  assert.match(html, /Stored caregiver-handoff text/);
  assert.match(html, /Reopen the recovered file with Open caregiver handoff/);
});
