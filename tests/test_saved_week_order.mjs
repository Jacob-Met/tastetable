import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { orderSavedWeekRows } from "../static/saved_week_order.mjs";
import { createSavedWeeksUI } from "../static/saved_week_ui.mjs";
import { createDraft } from "../static/saved_weeks.mjs";
import { createWeekPlan } from "../static/week_plan.mjs";

test("default copies exact source order and reads no name or date", () => {
  const opaque = Object.freeze({ get draft() { throw new Error("must not inspect"); } });
  const rows = Object.freeze([opaque, Object.freeze({ id: "unreadable" }), opaque]);
  const actual = orderSavedWeekRows(rows);
  assert.notEqual(actual, rows);
  assert.deepEqual(actual, rows);
  assert.equal(actual[0], opaque);
  assert.equal(actual[2], opaque);
  assert.deepEqual(orderSavedWeekRows([], "newest"), []);
});

test("name order uses literal normalized labels and stable original ties", () => {
  const names = ["Zoo", "  CARE   plan ", "care plan", "CarePlan", "week 2", "week 10", "é", "e\u0301"];
  const rows = names.map((name, id) => Object.freeze({ id, draft: Object.freeze({ name }) }));
  rows.push(Object.freeze({ id: 8, label: "  aardvark damaged " }));
  rows.push(Object.freeze({ id: 9, label: "" }));
  Object.freeze(rows);
  const before = JSON.stringify(rows);
  const ordered = orderSavedWeekRows(rows, "name");
  assert.deepEqual(ordered.map(row => row.id), [8, 1, 2, 3, 7, 9, 5, 4, 0, 6]);
  assert.equal(new Set(ordered).size, rows.length);
  assert.ok(ordered.every(row => rows.includes(row)));
  assert.equal(JSON.stringify(rows), before);
  assert.deepEqual(orderSavedWeekRows(rows, "newest"), rows);
});

test("unsupported modes refuse without changing rows", () => {
  const rows = Object.freeze([Object.freeze({ label: "Literal" })]);
  for (const mode of ["", "oldest", "NAME", null, 0, false]) {
    assert.throws(() => orderSavedWeekRows(rows, mode), TypeError);
    assert.equal(rows[0].label, "Literal");
  }
});

// Controlled DOM/store objects run the actual maintained handlers. These are
// not browser, IndexedDB, focus, accessibility, layout or file-chooser evidence.
class Element {
  constructor(tag = "div") {
    this.tag = tag; this.value = ""; this.hidden = false; this.disabled = false;
    this.children = []; this.dataset = {}; this.handlers = new Map();
    this.textContent = ""; this.files = []; this.parent = null;
  }
  addEventListener(name, handler) {
    this.handlers.set(name, [...(this.handlers.get(name) || []), handler]);
  }
  async fire(name, event = {}) {
    await Promise.all((this.handlers.get(name) || []).map(handler => handler(event)));
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parent = null;
    this.children = []; this.append(...children);
  }
  append(...children) {
    for (const child of children) {
      assert.ok(child instanceof Element);
      if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
      child.parent = this; this.children.push(child);
    }
  }
  focus() { this.focused = true; }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve; const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const response = JSON.parse(readFileSync(new URL("./fixtures/saved-week-response.json", import.meta.url)));
const inputs = { cuisines: ["Cuban"], music: [], films: [], city: "Pasadena", constraints: ["soft_foods", "low_sodium", "wheelchair"] };
const snapshot = {
  response, inputs, weekState: createWeekPlan(response, "2026-12-28"),
  receivedAt: "2026-10-08T10:00:00.000Z", calendarId: "0123456789abcdef0123456789abcdef",
};
const draft = (id, name, date) => createDraft({ ...snapshot, id, name, now: new Date(date) });
async function host() {
  const ids = ["savedWeeks", "savedWeeksStatus", "saveCurrentWeek", "savedWeekName", "openSavedWeek", "renameSavedWeek", "removeSavedWeek", "savedWeeksSearch", "clearSavedWeeksSearch", "savedWeeksOrder", "savedWeekPreview", "renameSavedWeekName", "savedPreviewDays", "savedPreviewTitle", "savedPreviewSummary", "savedPreviewSource", "savedPreviewOmitted", "savedWeeksSearchCount", "savedWeeksNoMatches", "savedWeeksList", "savedWeeksEmpty", "refreshSavedWeeks", "importSavedWeekFile", "importSavedWeekName", "saveImportedWeek", "cancelImportedWeek", "importSavedWeekPreview", "importSavedWeekStatus", "importSavedWeekDays", "importSavedWeekSummary", "importSavedWeekSource", "importSavedWeekOmitted"];
  const nodes = Object.fromEntries(ids.map(id => [id, new Element()]));
  nodes.savedWeeksOrder.disabled = true;
  const buttonIds = ["saveCurrentWeek", "openSavedWeek", "renameSavedWeek", "removeSavedWeek", "clearSavedWeeksSearch", "refreshSavedWeeks", "saveImportedWeek", "cancelImportedWeek"];
  nodes.savedWeeks.querySelectorAll = () => buttonIds.map(id => nodes[id]);
  const window = new Element();
  const previous = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = { createElement: tag => new Element(tag) };
  const a = draft("record_zulu", "Zulu recent", "2026-10-12T00:00:00.000Z");
  const b = draft("record_beta", "Beta selected", "2026-10-11T00:00:00.000Z");
  const c = draft("record_alpha", "Alpha old", "2026-10-09T00:00:00.000Z");
  let rows = [a, b, c].map(value => ({ id: value.id, draft: value }));
  rows.push({ id: "record_broken", label: "Aardvark damaged", error: "Original fixture refusal" });
  const calls = { list: 0, get: 0, save: 0, rename: 0, remove: 0, close: 0, capture: 0, open: 0 };
  let listError = null, saveGate = null;
  const store = {
    async list() { calls.list++; if (listError) throw listError; return rows.slice(); },
    async get(id) { calls.get++; return rows.find(row => row.id === id).draft; },
    async save() { calls.save++; if (saveGate) await saveGate.promise; },
    async rename() { calls.rename++; throw new Error("unexpected rename"); },
    async remove() { calls.remove++; throw new Error("unexpected remove"); },
    close() { calls.close++; },
  };
  const active = structuredClone(snapshot), notes = { text: "Active host note remains" };
  createSavedWeeksUI({ capture: () => { calls.capture++; return active; }, openSaved: async () => { calls.open++; return true; }, store, root: { querySelector: selector => nodes[selector.slice(1)] } });
  assert.equal(nodes.savedWeeksOrder.disabled, true);
  await tick();
  return {
    nodes, window, calls, active, notes, a, b, c,
    get rows() { return rows; }, setRows(value) { rows = value; },
    failList(value) { listError = value; }, delaySave() { saveGate = deferred(); return saveGate; },
    order() { return nodes.savedWeeksList.children.map(item => item.children[1].dataset.savedWeekId); },
    async choose(mode) { nodes.savedWeeksOrder.value = mode; await nodes.savedWeeksOrder.fire("change"); },
    async refresh() { await nodes.refreshSavedWeeks.fire("click"); await tick(); },
    async cleanup() { await window.fire("pagehide"); globalThis.window = previous.window; globalThis.document = previous.document; },
  };
}

test("changing order moves the same nodes and preserves query, selection and unfinished fields", async () => {
  const h = await host();
  try {
    assert.equal(h.nodes.savedWeeksOrder.value, "newest");
    assert.deepEqual(h.order(), ["record_zulu", "record_beta", "record_alpha", "record_broken"]);
    const nodesById = new Map(h.nodes.savedWeeksList.children.map(item => [item.children[1].dataset.savedWeekId, item]));
    await nodesById.get("record_beta").children[1].fire("click"); await tick();
    h.nodes.renameSavedWeekName.value = "Unfinished rename";
    h.nodes.savedWeekName.value = "Unfinished current save";
    h.nodes.savedWeeksSearch.value = "Beta"; await h.nodes.savedWeeksSearch.fire("input");
    const bytes = new TextEncoder().encode(h.c.text);
    h.nodes.importSavedWeekFile.files = [{ name: "portable.json", size: bytes.length, async arrayBuffer() { return bytes.buffer; } }];
    await h.nodes.importSavedWeekFile.fire("change");
    h.nodes.importSavedWeekName.value = "Unfinished import name"; await h.nodes.importSavedWeekName.fire("input");
    const beforeCalls = { ...h.calls }, active = structuredClone(h.active), notes = structuredClone(h.notes);
    const importSummary = h.nodes.importSavedWeekSummary.textContent;
    await h.choose("name");
    assert.deepEqual(h.order(), ["record_broken", "record_alpha", "record_beta", "record_zulu"]);
    assert.ok(h.nodes.savedWeeksList.children.every(item => nodesById.get(item.children[1].dataset.savedWeekId) === item));
    assert.deepEqual(h.calls, beforeCalls);
    assert.equal(h.nodes.savedWeeksSearchCount.textContent, "Showing 1 of 4 saved records.");
    assert.deepEqual(h.nodes.savedWeeksList.children.filter(item => !item.hidden).map(item => item.children[1].dataset.savedWeekId), ["record_beta"]);
    assert.equal(h.nodes.savedPreviewTitle.textContent, "Beta selected");
    assert.equal(h.nodes.renameSavedWeekName.value, "Unfinished rename");
    assert.equal(h.nodes.savedWeekName.value, "Unfinished current save");
    assert.equal(h.nodes.importSavedWeekName.value, "Unfinished import name");
    assert.equal(h.nodes.importSavedWeekSummary.textContent, importSummary);
    assert.equal(h.nodes.importSavedWeekPreview.hidden, false);
    assert.deepEqual(h.active, active); assert.deepEqual(h.notes, notes);
    await h.nodes.clearSavedWeeksSearch.fire("click");
    assert.equal(h.nodes.savedWeeksSearchCount.textContent, "Showing 4 of 4 saved records.");
    assert.deepEqual(h.order(), ["record_broken", "record_alpha", "record_beta", "record_zulu"]);
    await h.choose("newest");
    assert.deepEqual(h.order(), ["record_zulu", "record_beta", "record_alpha", "record_broken"]);
    assert.deepEqual(h.calls, beforeCalls);
  } finally { await h.cleanup(); }
});

test("refresh reapplies name order, failures disable it and document restoration retains it", async () => {
  const h = await host();
  try {
    await h.choose("name");
    const tie = { id: "record_tie", draft: draft("record_tie", "  ALPHA   old  ", "2026-10-13T00:00:00.000Z") };
    h.setRows([tie, ...h.rows]); await h.refresh();
    assert.deepEqual(h.order(), ["record_broken", "record_tie", "record_alpha", "record_beta", "record_zulu"]);
    await h.choose("newest");
    assert.deepEqual(h.order(), ["record_tie", "record_zulu", "record_beta", "record_alpha", "record_broken"]);
    await h.choose("name"); h.failList(new Error("Controlled read refusal")); await h.refresh();
    assert.equal(h.nodes.savedWeeksOrder.disabled, true);
    h.failList(null); await h.refresh();
    assert.equal(h.nodes.savedWeeksOrder.disabled, false);
    assert.equal(h.nodes.savedWeeksOrder.value, "name");
    await h.window.fire("pagehide");
    assert.equal(h.nodes.savedWeeksOrder.disabled, true);
    await h.window.fire("pageshow", { persisted: true }); await tick();
    assert.equal(h.nodes.savedWeeksOrder.disabled, false);
    assert.equal(h.nodes.savedWeeksOrder.value, "name");
    assert.deepEqual(h.order(), ["record_broken", "record_tie", "record_alpha", "record_beta", "record_zulu"]);
  } finally { await h.cleanup(); }
  const fresh = await host();
  try { assert.equal(fresh.nodes.savedWeeksOrder.value, "newest"); }
  finally { await fresh.cleanup(); }
});

test("ordering is disabled during an existing mutation and restored after its completion", async () => {
  const h = await host();
  try {
    await h.choose("name");
    h.nodes.savedWeekName.value = "Explicit current save";
    const gate = h.delaySave();
    await h.nodes.saveCurrentWeek.fire("click");
    assert.equal(h.nodes.savedWeeksOrder.disabled, true);
    assert.equal(h.calls.save, 1);
    gate.resolve(); await tick(); await tick();
    assert.equal(h.nodes.savedWeeksOrder.disabled, false);
    assert.equal(h.nodes.savedWeeksOrder.value, "name");
    assert.deepEqual(h.order(), ["record_broken", "record_alpha", "record_beta", "record_zulu"]);
  } finally { await h.cleanup(); }
});
