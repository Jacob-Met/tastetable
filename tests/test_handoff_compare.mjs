import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createWeekPlan, setPickDay, setWeek } from "../static/week_plan.mjs";
import { createVenueFollowup } from "../static/venue_followup.mjs";
import { makeCaregiverHandoff, CAREGIVER_HANDOFF_BYTE_LIMIT } from "../static/caregiver_handoff.mjs";
import { readHandoffForComparison, compareCaregiverHandoffs } from "../static/handoff_compare.mjs";
import { mountHandoffComparison } from "../static/handoff_compare_ui.mjs";

const copy = value => structuredClone(value);
const saved = new Date("2026-10-14T01:00:00.000Z");
const emptyNote = () => ({ status: "not_contacted", question: null, reply: "", replyQuestions: null, nextStep: "" });
// Synthetic two-occurrence source, shaped like the maintained caregiver-handoff fixture.
function context(mutate = () => {}) {
  const counts = { picks: 2, with_qloo_entity_id: 2, with_affinity_evidence: 0, constraint_checked: 2, unsafe_candidates_rejected: 0 };
  const inputs = { cuisines: ["Fictional"], music: ["海", "B"], films: [], city: "Authored comparison", constraints: [] };
  const response = { mock: true, plan: { meals: [
    { day: "Monday", kind: "restaurant", entity_id: "same-id", name: "Café <b>海</b>", why: "First occurrence", affinity: null },
    { day: "Tuesday", kind: "restaurant", entity_id: "same-id", name: "Café <b>海</b>", why: "Second occurrence", affinity: null },
  ], outing: null, notes: [], rejected: [] }, comparison: { constraints: [], grounded: counts, llm_only: copy(counts) },
  llm_only: { meals: [], outing: { day: "Friday", name: "Fixture", why: "Synthetic" } }, trace: [{ tool: "fixture", args: [1, 2], result_summary: "No provider" }] };
  const origin = { inputs, response, receivedAt: "2026-10-14T00:00:00.000Z", calendarId: "0123456789abcdef0123456789abcdef" };
  mutate(origin);
  const state = createWeekPlan(origin.response, "2026-12-28");
  return { origin, state, model: createVenueFollowup(state) };
}
const text = ctx => makeCaregiverHandoff(ctx, saved).text;
const open = (value, side = "earlier") => readHandoffForComparison(value, side);
function withRecords(ctx, records) { ctx.model.replaceRecords(records); return ctx; }
const record = (key, date, note = emptyNote()) => ({ key, date, note });
const literal = "\nLiteral 海 <img src=x onerror=alert(1)>\r\n  trailing space ";

test("comparison preserves repeated occurrences and all source/state/note values", () => {
  const a = context(), b = context();
  b.state = setPickDay(setPickDay(b.state, "pick-0", "Friday"), "pick-1", null);
  const before = open(text(a)), after = open(text(b), "revised");
  const retained = JSON.stringify([before.origin, before.state, before.records, after.origin, after.state, after.records]);
  const result = compareCaregiverHandoffs(before, after);
  assert.equal(result.paired, true);
  assert.deepEqual(result.arrangement.counts, { unchanged: 0, moved: 1, scheduled: 0, omitted: 1 });
  assert.deepEqual(result.arrangement.changes.map(r => [r.key, r.status, r.before.date, r.after.date]), [
    ["pick-0", "moved", "2026-12-28", "2027-01-01"], ["pick-1", "omitted", "2026-12-29", null],
  ]);
  assert.equal(result.arrangement.changes[0].pick.entity_id, result.arrangement.changes[1].pick.entity_id);
  assert.equal(JSON.stringify([before.origin, before.state, before.records, after.origin, after.state, after.records]), retained);
});

test("a changed week changes exact dates; returning an omitted visit is scheduled", () => {
  const a = context(), b = context(); a.state = setPickDay(a.state, "pick-1", null); b.state = setWeek(b.state, "2027-01-04");
  const result = compareCaregiverHandoffs(open(text(a)), open(text(b), "revised"));
  assert.deepEqual(result.arrangement.changes.map(r => [r.status, r.after.date]), [["moved", "2027-01-04"], ["scheduled", "2027-01-05"]]);
});

test("notes retain original ordering, omitted/other dates, literal reply history and all five fields", () => {
  const a = withRecords(context(), [record("pick-1", "2026-12-29"), record("pick-0", "2027-01-04"),
    record("pick-0", "2026-12-28", { status: "reply_recorded", question: "Old questions?", reply: literal, replyQuestions: "Old questions?", nextStep: "Keep literal" })]);
  const b = withRecords(context(), [record("pick-0", "2026-12-28", { status: "follow_up", question: "Revised questions?", reply: literal, replyQuestions: "Old questions?", nextStep: "" }),
    record("pick-0", "2027-01-04"), record("pick-1", "2027-01-05")]);
  b.state = setPickDay(b.state, "pick-0", null);
  const result = compareCaregiverHandoffs(open(text(a)), open(text(b), "revised"));
  assert.deepEqual(result.notes.counts, { added: 1, removed: 1, changed: 1, unchanged: 1 });
  assert.deepEqual(result.notes.records.map(r => [r.key, r.date, r.change]), [
    ["pick-1", "2026-12-29", "removed"], ["pick-0", "2027-01-04", "unchanged"],
    ["pick-0", "2026-12-28", "changed"], ["pick-1", "2027-01-05", "added"],
  ]);
  const changed = result.notes.records[2];
  assert.deepEqual(changed.changedFields, ["status", "question", "nextStep"]);
  assert.equal(changed.after.reply, literal); assert.equal(changed.after.replyQuestions, "Old questions?");
  assert.deepEqual(Object.keys(changed.after), ["status", "question", "reply", "replyQuestions", "nextStep"]);
});

test("missing records, explicit default records and null versus empty questions stay distinct", () => {
  const a = context(), b = withRecords(context(), [record("pick-0", "2026-12-28")]);
  assert.equal(compareCaregiverHandoffs(open(text(a)), open(text(b))).notes.records[0].change, "added");
  const c = withRecords(context(), [record("pick-0", "2026-12-28", { ...emptyNote(), question: "" })]);
  const row = compareCaregiverHandoffs(open(text(b)), open(text(c))).notes.records[0];
  assert.deepEqual(row.changedFields, ["question"]); assert.equal(row.before.question, null); assert.equal(row.after.question, "");
});

test("complete origin mismatches and array order refuse matching without discarding independent arrangements", () => {
  const original = open(text(context()));
  const changes = [o => { o.receivedAt = "2026-10-14T00:00:00.001Z"; }, o => { o.calendarId = null; },
    o => { o.inputs.music.reverse(); }, o => { o.response.trace[0].args.reverse(); },
    o => { o.response.plan.meals.reverse(); }, o => { o.response.plan.notes.push("New source note"); }];
  for (const change of changes) {
    const result = compareCaregiverHandoffs(original, open(text(context(change)), "revised"));
    assert.equal(result.paired, false); assert.equal(result.notes, null); assert.equal(result.arrangement.counts, null);
    assert.deepEqual(result.arrangement.changes, []); assert.equal(result.arrangement.left.length, 2); assert.equal(result.arrangement.right.length, 2);
  }
  const reordered = context(o => { o.inputs = Object.fromEntries(Object.entries(o.inputs).reverse()); });
  assert.equal(compareCaregiverHandoffs(original, open(text(reordered))).paired, true);
});

test("saved timestamps are metadata; same copies and empty sets are successful distinct results", () => {
  const raw = text(context()), envelope = JSON.parse(raw);
  envelope.savedAt = envelope.week.savedAt = envelope.venueNotes.savedAt = "2026-10-13T00:00:00.000Z";
  const same = compareCaregiverHandoffs(open(raw), open(JSON.stringify(envelope)));
  assert.equal(same.paired, true); assert.equal(same.arrangement.counts.unchanged, 2); assert.equal(same.notes.records.length, 0);
  const empty = context(o => { o.response.plan.meals = []; });
  const result = compareCaregiverHandoffs(open(text(empty)), open(text(empty)));
  assert.equal(result.paired, true); assert.deepEqual(result.arrangement.changes, []); assert.deepEqual(result.notes.records, []);
});

test("full native admission errors identify side, including late invalid note and within-file source mismatch", () => {
  assert.throws(() => open("{"), /^Error: Earlier copy: /);
  assert.throws(() => open("{", "revised"), /^Error: Revised copy: /);
  assert.throws(() => open("{}", "other"), TypeError);
  const late = JSON.parse(text(context())); late.venueNotes.records.push(record("pick-99", "2026-12-28"));
  assert.throws(() => open(JSON.stringify(late), "revised"), /Revised copy: .*unknown pick/);
  const foreign = JSON.parse(text(context())); foreign.venueNotes.origin.receivedAt = "2026-10-14T00:00:00.001Z";
  assert.throws(() => open(JSON.stringify(foreign)), /Earlier copy: .*different accepted plan/);
  assert.throws(() => open(" ".repeat(CAREGIVER_HANDOFF_BYTE_LIMIT + 1)), /Earlier copy: .*6 MiB/);
});

// A small DOM fixture drives actual listeners; it rejects unsafe HTML APIs outright.
class Node {
  constructor(tag) { this.tagName = tag; this.children = []; this.listeners = {}; this.dataset = {}; this.hidden = false; this.disabled = false; this.value = ""; this.files = []; this.text = ""; }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(n => n.textContent).join(""); }
  set innerHTML(_) { throw new Error("File-derived HTML is forbidden"); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.text = ""; this.children = nodes; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  dispatch(type) { return Promise.all((this.listeners[type] ?? []).map(fn => fn({ target: this }))); }
}
function ui() {
  const ids = ["earlierFile", "earlierClear", "earlierStatus", "earlierSource", "revisedFile", "revisedClear", "revisedStatus", "revisedSource", "comparisonStatus", "comparison", "arrangementChanges", "noteChanges"];
  const nodes = Object.fromEntries(ids.map(id => [id, new Node("div")])), created = [], view = new Node("window");
  const doc = { defaultView: view, getElementById(id) { assert.ok(nodes[id], id); return nodes[id]; }, createElement(tag) { const n = new Node(tag); created.push(n); return n; } };
  mountHandoffComparison(doc, view);
  return { nodes, created, view, choose(side, file) { const input = nodes[side + "File"]; input.files = file ? [file] : []; return input.dispatch("change"); } };
}
function file(name, value, extras = {}) {
  const bytes = new TextEncoder().encode(value);
  return { name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer, ...extras };
}
function deferredFile(name, value) {
  let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { file: file(name, value, { arrayBuffer: () => promise }), resolve: () => resolve(new TextEncoder().encode(value).buffer), reject };
}
const tree = node => ({ tag: node.tagName, text: node.text, data: node.dataset, children: node.children.map(tree) });

test("UI shows literal complete note history and distinguishes missing/null/empty values without active markup", async () => {
  const u = ui(), earlier = withRecords(context(), [record("pick-0", "2026-12-28")]);
  const revised = withRecords(context(), [record("pick-0", "2026-12-28", { status: "follow_up", question: "", reply: literal, replyQuestions: "Old <script>questions</script>", nextStep: "" }), record("pick-1", "2027-01-05")]);
  assert.equal(u.nodes.earlierClear.disabled, true); assert.equal(u.nodes.comparison.hidden, true);
  await u.choose("earlier", file("<img earlier>.json", text(earlier))); await u.choose("revised", file("海 revised.json", text(revised)));
  assert.equal(u.nodes.comparison.hidden, false); assert.match(u.nodes.noteChanges.textContent, /1 added · 0 removed · 1 changed · 0 unchanged/);
  assert.ok(u.created.some(n => n.tagName === "pre" && n.textContent === literal));
  assert.match(u.nodes.noteChanges.textContent, /Original suggested questions/); assert.match(u.nodes.noteChanges.textContent, /No recorded reply questions/);
  assert.match(u.nodes.noteChanges.textContent, /Empty text/); assert.match(u.nodes.noteChanges.textContent, /No saved note record/);
  assert.match(u.nodes.noteChanges.textContent, /Other date or omitted visit/);
  assert.ok(u.created.every(n => !["script", "img", "iframe", "object"].includes(n.tagName)));
  assert.match(u.nodes.earlierSource.textContent, /<img earlier>.json/);
});

test("invalid replacement retains prior accepted pair and names the affected side; corrected retry succeeds", async () => {
  const u = ui(), raw = text(context());
  await u.choose("earlier", file("a.json", raw)); await u.choose("revised", file("b.json", raw));
  const before = JSON.stringify([tree(u.nodes.earlierSource), tree(u.nodes.revisedSource), tree(u.nodes.arrangementChanges), tree(u.nodes.noteChanges)]);
  await u.choose("revised", file("bad.json", "{"));
  assert.match(u.nodes.revisedStatus.textContent, /^Revised copy: /); assert.match(u.nodes.revisedStatus.textContent, /previously accepted/);
  assert.equal(JSON.stringify([tree(u.nodes.earlierSource), tree(u.nodes.revisedSource), tree(u.nodes.arrangementChanges), tree(u.nodes.noteChanges)]), before);
  assert.equal(u.nodes.comparison.hidden, false);
  await u.choose("revised", file("corrected.json", raw)); assert.equal(u.nodes.revisedStatus.textContent, "Revised copy: loaded corrected.json.");
});

test("valid different sources show a mismatch, while unchanged and empty admitted copies remain useful", async () => {
  const u = ui(); await u.choose("earlier", file("a", text(context())));
  await u.choose("revised", file("foreign", text(context(o => { o.inputs.city = "Different"; }))));
  assert.equal(u.nodes.comparisonStatus.textContent, "These handoffs have different saved sources. Changes cannot be matched.");
  assert.equal(u.nodes.comparison.hidden, true); assert.equal(u.nodes.noteChanges.textContent, "");
  assert.match(u.nodes.revisedSource.textContent, /Different/); assert.match(u.nodes.earlierSource.textContent, /Authored comparison/);
  const same = text(withRecords(context(), [record("pick-0", "2026-12-28")]));
  await u.choose("earlier", file("sameA", same)); await u.choose("revised", file("sameB", same));
  assert.match(u.nodes.noteChanges.textContent, /No saved note fields changed/); assert.match(u.nodes.noteChanges.textContent, /1 unchanged note records/);
  const empty = text(context(o => { o.response.plan.meals = []; }));
  await u.choose("earlier", file("emptyA", empty)); await u.choose("revised", file("emptyB", empty));
  assert.equal(u.nodes.comparison.hidden, false); assert.match(u.nodes.arrangementChanges.textContent, /No original visits/); assert.match(u.nodes.noteChanges.textContent, /No saved note records/);
});

test("pending replacement hides comparison, latest success wins and obsolete failure is silent", async () => {
  const u = ui(), raw = text(context()); await u.choose("earlier", file("baseA", raw)); await u.choose("revised", file("baseB", raw));
  const old = deferredFile("obsolete", raw), oldRead = u.choose("earlier", old.file);
  assert.equal(u.nodes.comparison.hidden, true); assert.match(u.nodes.earlierSource.textContent, /Previously accepted/);
  await u.choose("earlier", file("newest", raw)); old.resolve(); await oldRead;
  assert.match(u.nodes.earlierSource.textContent, /newest/); assert.doesNotMatch(u.nodes.earlierSource.textContent, /obsolete/);
  const failing = deferredFile("old failure", raw), failedRead = u.choose("revised", failing.file);
  await u.choose("revised", file("latestB", raw)); failing.reject(new Error("obsolete error")); await failedRead;
  assert.equal(u.nodes.revisedStatus.textContent, "Revised copy: loaded latestB."); assert.equal(u.nodes.comparison.hidden, false);
});

test("clear and page departure invalidate pending completions without changing the other accepted slot", async () => {
  const u = ui(), raw = text(context()); await u.choose("revised", file("retainedB", raw));
  const pending = deferredFile("cleared", raw), waiting = u.choose("earlier", pending.file);
  assert.equal(u.nodes.earlierClear.disabled, false); await u.nodes.earlierClear.dispatch("click"); pending.resolve(); await waiting;
  assert.equal(u.nodes.earlierSource.textContent, ""); assert.match(u.nodes.revisedSource.textContent, /retainedB/);
  const departing = deferredFile("departing", raw), completion = u.choose("earlier", departing.file);
  await u.view.dispatch("pagehide"); departing.resolve(); await completion;
  assert.equal(u.nodes.earlierSource.textContent, ""); assert.match(u.nodes.earlierStatus.textContent, /canceled on page departure/);
  assert.equal(u.nodes.comparison.hidden, true);
});

test("UI refuses oversize before and after reading and invalid UTF-8, preserving an accepted file", async () => {
  const u = ui(), raw = text(context()); await u.choose("earlier", file("kept", raw));
  let reads = 0;
  await u.choose("earlier", file("large", raw, { size: CAREGIVER_HANDOFF_BYTE_LIMIT + 1, arrayBuffer: () => { reads++; throw Error("must not read"); } }));
  assert.equal(reads, 0); assert.match(u.nodes.earlierStatus.textContent, /Earlier copy: .*6 MiB/);
  await u.choose("earlier", file("understated", raw, { arrayBuffer: async () => new ArrayBuffer(CAREGIVER_HANDOFF_BYTE_LIMIT + 1) }));
  assert.match(u.nodes.earlierStatus.textContent, /Earlier copy: .*6 MiB/);
  await u.choose("earlier", file("bad UTF8", raw, { arrayBuffer: async () => new Uint8Array([0xc3, 0x28]).buffer }));
  assert.match(u.nodes.earlierStatus.textContent, /Earlier copy: .*UTF-8/); assert.match(u.nodes.earlierSource.textContent, /kept/);
  const status = u.nodes.earlierStatus.textContent; await u.choose("earlier", null); assert.equal(u.nodes.earlierStatus.textContent, status);
});

test("page exposes labeled controls and an isolated comparison link; new render code has no upload/storage path", async () => {
  const html = await readFile(new URL("../static/compare-handoffs.html", import.meta.url), "utf8");
  for (const side of ["earlier", "revised"]) {
    assert.ok(html.includes('for="' + side + 'File"')); assert.match(html, new RegExp('id="' + side + 'Status"[^>]*role="status"'));
  }
  const index = await readFile(new URL("../static/index.html", import.meta.url), "utf8");
  assert.match(index, /href="\/static\/compare-handoffs.html" target="_blank" rel="noopener"/);
  const source = await readFile(new URL("../static/handoff_compare_ui.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /innerHTML|\bfetch\s*\(|localStorage|sessionStorage|XMLHttpRequest/);
});
