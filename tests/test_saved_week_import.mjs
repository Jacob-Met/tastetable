import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createImportedDraft } from "../static/saved_week_import.mjs";
import { createSavedWeeksUI } from "../static/saved_week_ui.mjs";
import { createDraft, validateDraft, MAX_DRAFT_BYTES } from "../static/saved_weeks.mjs";
import { makeWeekFile } from "../static/week_file.mjs";
import { createWeekPlan, setPickDay } from "../static/week_plan.mjs";

const response = JSON.parse(readFileSync(new URL("./fixtures/saved-week-response.json", import.meta.url)));
const inputs = { cuisines: ["Cuban"], music: [], films: [], city: "Pasadena", constraints: ["soft_foods", "low_sodium", "wheelchair"] };
const state = createWeekPlan(response, "2026-12-28");
const snapshot = { response, inputs, weekState: state, receivedAt: "2026-10-08T10:00:00.000Z", calendarId: "0123456789abcdef0123456789abcdef" };
const savedAt = "2026-10-09T03:04:05.000Z";
function portable() {
  const changed = setPickDay(state, state.picks[0].key, null);
  const made = makeWeekFile({ ...snapshot, state: changed }, new Date(savedAt));
  const envelope = JSON.parse(made.text);
  envelope.extension = { literal: "é <tag> & quoted\ntext", absent: null, enabled: false, count: 0 };
  return "\uFEFF" + JSON.stringify(envelope, null, 3) + "\n\n";
}
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }

test("imports exact decoded portable text with original dates and explicit normalized name", () => {
  const text = portable();
  const draft = createImportedDraft({ text, name: "  Family file  ", id: "imported_001" });
  assert.deepEqual(draft, { format: "tastetable.browser-week", version: 1, id: "imported_001", name: "Family file", createdAt: savedAt, updatedAt: savedAt, text });
  assert.deepEqual(validateDraft(draft), draft);
  assert.ok(draft.text.startsWith("\uFEFF"));
  assert.ok(draft.text.endsWith("\n\n"));
});

test("keeps codec, name, identity and byte-limit refusals authoritative", () => {
  const common = { text: portable(), name: "File", id: "imported_002" };
  for (const name of ["", "  ", "a\nb", "a".repeat(121)]) assert.throws(() => createImportedDraft({ ...common, name }));
  assert.throws(() => createImportedDraft({ ...common, id: "tiny" }), /identity/);
  assert.throws(() => createImportedDraft({ ...common, text: "{}" }), /supported v1/);
  assert.throws(() => createImportedDraft({ ...common, text: "x".repeat(MAX_DRAFT_BYTES + 1) }), /512 KiB/);
  assert.throws(() => createImportedDraft({ ...common, text: "é".repeat(MAX_DRAFT_BYTES / 2 + 1) }), /512 KiB/);
});

// These controlled elements exercise the actual maintained handlers. They are
// not browser, IndexedDB, layout, keyboard or file-chooser qualification.
class Element {
  constructor(tag = "div") { this.tag = tag; this.value = ""; this.hidden = false; this.disabled = false; this.children = []; this.dataset = {}; this.handlers = new Map(); this.textContent = ""; this.files = []; }
  addEventListener(name, handler) { const all = this.handlers.get(name) || []; all.push(handler); this.handlers.set(name, all); }
  async fire(name, event = {}) { await Promise.all((this.handlers.get(name) || []).map(handler => handler(event))); }
  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  focus() { this.focused = true; }
}
async function host() {
  const ids = ["savedWeeks", "savedWeeksStatus", "saveCurrentWeek", "savedWeekName", "openSavedWeek", "renameSavedWeek", "removeSavedWeek", "savedWeeksSearch", "clearSavedWeeksSearch", "savedWeekPreview", "renameSavedWeekName", "savedPreviewDays", "savedPreviewTitle", "savedPreviewSummary", "savedPreviewSource", "savedPreviewOmitted", "savedWeeksSearchCount", "savedWeeksNoMatches", "savedWeeksList", "savedWeeksEmpty", "refreshSavedWeeks", "importSavedWeekFile", "importSavedWeekName", "saveImportedWeek", "cancelImportedWeek", "importSavedWeekPreview", "importSavedWeekStatus", "importSavedWeekDays", "importSavedWeekSummary", "importSavedWeekSource", "importSavedWeekOmitted"];
  const nodes = Object.fromEntries(ids.map(id => [id, new Element()]));
  const buttons = ["saveCurrentWeek", "openSavedWeek", "renameSavedWeek", "removeSavedWeek", "clearSavedWeeksSearch", "refreshSavedWeeks", "saveImportedWeek", "cancelImportedWeek"];
  nodes.savedWeeks.querySelectorAll = () => buttons.map(id => nodes[id]);
  const window = new Element();
  const previous = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = { createElement: tag => new Element(tag) };
  const a = createDraft({ ...snapshot, id: "existing_a01", name: "Selected A", now: new Date("2026-10-10T00:00:00.000Z") });
  const records = [a];
  const calls = { save: [], open: 0, close: 0 };
  let saveGate = null, saveFailure = null;
  const store = {
    async list() { return records.map(draft => ({ id: draft.id, draft })); },
    async get(id) { return records.find(draft => draft.id === id); },
    async save(draft) { calls.save.push(structuredClone(draft)); if (saveGate) await saveGate.promise; if (saveFailure) throw saveFailure; records.push(validateDraft(draft)); },
    async rename() { throw new Error("unexpected rename"); },
    async remove() { throw new Error("unexpected remove"); },
    close() { calls.close++; },
  };
  const active = structuredClone(snapshot), notes = { text: "unsaved active B notes" };
  createSavedWeeksUI({ capture: () => active, openSaved: async () => { calls.open++; return true; }, store, root: { querySelector: s => nodes[s.slice(1)] } });
  await tick();
  async function choose(file) { nodes.importSavedWeekFile.files = [file]; nodes.importSavedWeekFile.value = "chosen.json"; return nodes.importSavedWeekFile.fire("change"); }
  return { nodes, window, calls, records, active, notes, choose,
    delaySave() { saveGate = deferred(); return saveGate; },
    failSave(value) { saveFailure = value; },
    async cleanup() { await window.fire("pagehide"); globalThis.window = previous.window; globalThis.document = previous.document; },
  };
}
function file(text = portable(), name = "chosen.json") { const b = new TextEncoder().encode(text); return { name, size: b.byteLength, async arrayBuffer() { return b.buffer; } }; }

test("review and cancel do not save, chooser clears synchronously and same-file retry works", async () => {
  const h = await host();
  try {
    const gate = deferred();
    const run = h.choose({ ...file(), arrayBuffer: () => gate.promise });
    assert.equal(h.nodes.importSavedWeekFile.value, "");
    assert.equal(h.nodes.cancelImportedWeek.disabled, false);
    await h.nodes.cancelImportedWeek.fire("click");
    gate.resolve(new TextEncoder().encode(portable()).buffer); await run;
    assert.equal(h.nodes.importSavedWeekPreview.hidden, true);
    assert.equal(h.nodes.saveImportedWeek.disabled, true);
    assert.equal(h.calls.save.length, 0);
    await h.choose(file());
    assert.equal(h.nodes.importSavedWeekPreview.hidden, false);
    assert.equal(h.nodes.importSavedWeekName.value, "");
    assert.equal(h.nodes.saveImportedWeek.disabled, true);
    await h.nodes.cancelImportedWeek.fire("click");
    assert.equal(h.nodes.importSavedWeekPreview.hidden, true);
    assert.equal(h.calls.save.length, 0);
  } finally { await h.cleanup(); }
});

test("latest file wins and pagehide retires outstanding reads across pageshow", async () => {
  const h = await host();
  try {
    const first = deferred(), second = deferred();
    const a = h.choose({ ...file(undefined, "first.json"), arrayBuffer: () => first.promise });
    const b = h.choose({ ...file(undefined, "second.json"), arrayBuffer: () => second.promise });
    second.resolve(new TextEncoder().encode(portable()).buffer); await b;
    assert.match(h.nodes.importSavedWeekSummary.textContent, /^second.json/);
    first.resolve(new TextEncoder().encode(portable()).buffer); await a;
    assert.match(h.nodes.importSavedWeekSummary.textContent, /^second.json/);
    const later = deferred();
    const pending = h.choose({ ...file(), arrayBuffer: () => later.promise });
    await h.window.fire("pagehide");
    await h.window.fire("pageshow", { persisted: true }); await tick();
    later.resolve(new TextEncoder().encode(portable()).buffer); await pending;
    assert.equal(h.nodes.importSavedWeekPreview.hidden, true);
    assert.equal(h.nodes.saveImportedWeek.disabled, true);
    assert.equal(h.nodes.cancelImportedWeek.disabled, true);
    assert.equal(h.calls.save.length, 0);
  } finally { await h.cleanup(); }
});

test("explicit save captures reviewed text/name and preserves selected preview, rename, search and active state", async () => {
  const h = await host();
  try {
    const original = structuredClone(h.records[0]), active = structuredClone(h.active), notes = structuredClone(h.notes);
    await h.nodes.savedWeeksList.children[0].children[1].fire("click"); await tick();
    h.nodes.renameSavedWeekName.value = "unfinished A rename";
    h.nodes.savedWeeksSearch.value = "Selected A"; await h.nodes.savedWeeksSearch.fire("input");
    await h.choose(file());
    h.nodes.importSavedWeekName.value = "  Imported C  "; await h.nodes.importSavedWeekName.fire("input");
    assert.equal(h.nodes.saveImportedWeek.disabled, false);
    const gate = h.delaySave();
    await h.nodes.saveImportedWeek.fire("click");
    for (const id of ["importSavedWeekFile", "importSavedWeekName", "saveImportedWeek", "cancelImportedWeek"]) assert.equal(h.nodes[id].disabled, true);
    h.nodes.importSavedWeekName.value = "late programmatic change";
    assert.equal(h.records.length, 1);
    gate.resolve(); await tick(); await tick();
    assert.equal(h.records.length, 2);
    assert.equal(h.calls.save.length, 1);
    const added = h.records[1];
    assert.equal(added.name, "Imported C"); assert.equal(added.text, portable());
    assert.equal(added.createdAt, savedAt); assert.equal(added.updatedAt, savedAt);
    assert.notEqual(added.id, original.id);
    assert.deepEqual(h.records[0], original); assert.deepEqual(h.active, active); assert.deepEqual(h.notes, notes);
    assert.equal(h.calls.open, 0); assert.equal(h.nodes.savedPreviewTitle.textContent, "Selected A");
    assert.equal(h.nodes.renameSavedWeekName.value, "unfinished A rename");
    assert.equal(h.nodes.savedWeeksSearch.value, "Selected A");
    assert.equal(h.nodes.savedWeeksList.children[1].hidden, true);
    assert.equal(h.nodes.importSavedWeekPreview.hidden, true);
    assert.match(h.nodes.importSavedWeekStatus.textContent, /Saved “Imported C”/);
  } finally { await h.cleanup(); }
});

test("invalid UTF-8 and oversized files refuse before save; failed store leaves review retryable", async () => {
  const h = await host();
  try {
    let reads = 0;
    await h.choose({ ...file(), size: MAX_DRAFT_BYTES + 1, async arrayBuffer() { reads++; return new ArrayBuffer(0); } });
    assert.equal(reads, 0); assert.match(h.nodes.importSavedWeekStatus.textContent, /512 KiB/);
    await h.choose({ name: "invalid.json", size: 1, async arrayBuffer() { return Uint8Array.of(255).buffer; } });
    assert.match(h.nodes.importSavedWeekStatus.textContent, /valid UTF-8/);
    assert.equal(h.calls.save.length, 0);
    await h.choose(file()); h.nodes.importSavedWeekName.value = "Retry C"; await h.nodes.importSavedWeekName.fire("input");
    h.failSave(new Error("Controlled transaction refused")); await h.nodes.saveImportedWeek.fire("click"); await tick();
    assert.equal(h.records.length, 1); assert.equal(h.nodes.importSavedWeekPreview.hidden, false);
    assert.equal(h.nodes.importSavedWeekName.value, "Retry C"); assert.equal(h.nodes.saveImportedWeek.disabled, false);
    assert.match(h.nodes.importSavedWeekStatus.textContent, /Controlled transaction refused/);
  } finally { await h.cleanup(); }
});
