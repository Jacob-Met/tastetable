import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createSavedWeeksUI } from "../static/saved_week_ui.mjs";
import { createDraft } from "../static/saved_weeks.mjs";
import { createWeekPlan } from "../static/week_plan.mjs";

// These controlled DOM/store adapters invoke the real maintained handlers.
// Native focus, layout, keyboard and IndexedDB require separate browser evidence.
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
    // Deliberately allow dispatch to disabled controls to exercise handler guards.
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
  focus() { this.onFocus?.(); }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const settle = async () => { await tick(); await tick(); };
const sha = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const response = JSON.parse(readFileSync(new URL("./fixtures/saved-week-response.json", import.meta.url)));
const snapshot = {
  response,
  inputs: { cuisines: ["Cuban"], music: [], films: [], city: "Pasadena", constraints: ["soft_foods", "low_sodium", "wheelchair"] },
  weekState: createWeekPlan(response, "2026-12-28"), receivedAt: "2026-10-08T10:00:00.000Z",
  calendarId: "0123456789abcdef0123456789abcdef",
};
const a = createDraft({ ...snapshot, id: "record_alpha", name: "Alpha <draft> 雪", now: new Date("2026-10-12T00:00:00.000Z") });
const b = createDraft({ ...snapshot, id: "record_beta", name: "Beta second", now: new Date("2026-10-11T00:00:00.000Z") });
const originals = [{ id: a.id, draft: a }, { id: b.id, draft: b }, { id: "record_broken", label: "Unreadable <literal> copy", error: "Original fixture refusal" }];
const confirmationIDs = ["savedWeekRemoval", "savedWeekRemovalName", "confirmRemoveSavedWeek", "keepSavedWeek"];
const baseIDs = ["savedWeeks", "savedWeeksStatus", "saveCurrentWeek", "savedWeekName", "openSavedWeek", "renameSavedWeek", "removeSavedWeek", "savedWeeksSearch", "clearSavedWeeksSearch", "savedWeeksOrder", "savedWeekPreview", "renameSavedWeekName", "savedPreviewDays", "savedPreviewTitle", "savedPreviewSummary", "savedPreviewSource", "savedPreviewOmitted", "savedWeeksSearchCount", "savedWeeksNoMatches", "savedWeeksList", "savedWeeksEmpty", "refreshSavedWeeks", "importSavedWeekFile", "importSavedWeekName", "saveImportedWeek", "cancelImportedWeek", "importSavedWeekPreview", "importSavedWeekStatus", "importSavedWeekDays", "importSavedWeekSummary", "importSavedWeekSource", "importSavedWeekOmitted"];
const collectionIDs = ["savedWeekCollection", "downloadCollectionBackup", "collectionBackupFile", "addMissingSavedWeeks", "cancelCollectionBackup", "collectionBackupStatus", "collectionBackupPreview", "collectionBackupRecords", "collectionBackupSummary"];
const buttonIDs = ["saveCurrentWeek", "openSavedWeek", "renameSavedWeek", "removeSavedWeek", "clearSavedWeeksSearch", "refreshSavedWeeks", "saveImportedWeek", "cancelImportedWeek", "confirmRemoveSavedWeek", "keepSavedWeek"];

async function host({ missing = [], initialListPending = false, collection = false } = {}) {
  let focused = null;
  const ids = [...baseIDs, ...confirmationIDs, ...(collection ? collectionIDs : [])].filter(id => !missing.includes(id));
  const nodes = Object.fromEntries(ids.map(id => {
    const node = new Element(); node.id = id; node.onFocus = () => { focused = id; };
    return [id, node];
  }));
  nodes.savedWeekPreview.hidden = true;
  if (nodes.savedWeekRemoval) nodes.savedWeekRemoval.hidden = true;
  nodes.savedWeeks.querySelectorAll = () => buttonIDs.map(id => nodes[id]).filter(Boolean);
  const window = new Element(), previous = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = { createElement: tag => new Element(tag) };
  let rows = structuredClone(originals);
  const active = structuredClone(snapshot), notes = { text: "Planner note remains" };
  const calls = { list: 0, get: [], remove: [], save: [], rename: [], open: 0, close: 0, capture: 0 };
  const gates = {};
  let removeError = null;
  if (initialListPending) gates.list = deferred();
  const wait = async name => { if (gates[name]) await gates[name].promise; };
  const store = {
    async list() { calls.list++; await wait("list"); return structuredClone(rows); },
    async get(id) { calls.get.push(id); await wait("get"); return structuredClone(rows.find(row => row.id === id).draft); },
    async remove(id) {
      calls.remove.push(id); await wait("remove"); if (removeError) throw removeError;
      rows = rows.filter(row => row.id !== id); return id;
    },
    async save(draft) { calls.save.push({ id: draft.id, name: draft.name }); await wait("save"); rows.push({ id: draft.id, draft }); return draft; },
    async rename(id, name) {
      calls.rename.push({ id, name }); await wait("rename");
      const row = rows.find(row => row.id === id); row.draft = { ...row.draft, name };
      return row.draft;
    },
    close() { calls.close++; },
  };
  createSavedWeeksUI({ capture: () => { calls.capture++; return active; }, openSaved: async load => {
    calls.open++; await wait("open"); await load(); return true;
  }, store, root: { querySelector: selector => nodes[selector.slice(1)] || null } });
  if (!initialListPending) await settle();
  const h = {
    nodes, window, calls, active, notes, gates,
    get rows() { return rows; }, get focus() { return focused; },
    delay(name) { return gates[name] = deferred(); },
    release(name) { gates[name].resolve(); delete gates[name]; },
    refuseRemoval(value) { removeError = value; },
    async fire(id, event = "click") { await nodes[id]?.fire(event); },
    async preview(id) {
      const button = nodes.savedWeeksList.children.find(item => item.children[1].dataset.savedWeekId === id).children[1];
      await button.fire("click"); await settle();
    },
    async importPreview() {
      const bytes = new TextEncoder().encode(b.text);
      nodes.importSavedWeekFile.files = [{ name: "portable.json", size: bytes.length, async arrayBuffer() { return bytes.buffer; } }];
      await nodes.importSavedWeekFile.fire("change");
      nodes.importSavedWeekName.value = "Unfinished import name";
      await nodes.importSavedWeekName.fire("input");
    },
    dirty() { nodes.renameSavedWeekName.value = "Unfinished rename"; nodes.savedWeekName.value = "Unfinished current save"; nodes.importSavedWeekName.value = "Unfinished import name"; },
    state() {
      const title = nodes.savedPreviewTitle.textContent;
      const selected = nodes.savedWeekPreview.hidden ? null : rows.find(row => row.draft ? row.draft.name === title : title === `${row.label} — cannot be opened`)?.id || null;
      return {
        removeCalls: calls.remove.slice(), originalRecordsRemaining: originals.filter(old => rows.some(row => row.id === old.id)).map(row => row.id),
        selected, panelHidden: nodes.savedWeekRemoval?.hidden ?? null, target: nodes.savedWeekRemovalName?.textContent ?? null,
        targetChildren: nodes.savedWeekRemovalName?.children.length ?? null,
        confirmDisabled: nodes.confirmRemoveSavedWeek?.disabled ?? null, keepDisabled: nodes.keepSavedWeek?.disabled ?? null,
        removeDisabled: nodes.removeSavedWeek.disabled, focus: focused, previewHidden: nodes.savedWeekPreview.hidden, title,
        rename: nodes.renameSavedWeekName.value, currentSave: nodes.savedWeekName.value, importName: nodes.importSavedWeekName.value,
        importSummary: nodes.importSavedWeekSummary.textContent, importHidden: nodes.importSavedWeekPreview.hidden,
        query: nodes.savedWeeksSearch.value, order: nodes.savedWeeksOrder.value,
        listed: nodes.savedWeeksList.children.map(item => ({ id: item.children[1].dataset.savedWeekId, hidden: item.hidden })),
        status: nodes.savedWeeksStatus.textContent, collectionStatus: nodes.collectionBackupStatus?.textContent ?? null,
        calls: structuredClone(calls), rows: rows.map(row => ({ id: row.id, name: row.draft?.name ?? row.label, sha256: sha(row) })),
        activeSha256: sha(active), notes: structuredClone(notes),
      };
    },
    async cleanup() {
      for (const name of Object.keys(gates)) h.release(name);
      await settle(); await window.fire("pagehide");
      globalThis.window = previous.window; globalThis.document = previous.document;
    },
  };
  return h;
}
const observed = (t, scenario, moment, h) => t.diagnostic("REMOVAL_OBSERVATION " + JSON.stringify({ scenario, moment, ...h.state() }));
const allOriginals = h => assert.deepEqual(h.rows.filter(row => originals.some(old => old.id === row.id)).map(row => row.id), originals.map(row => row.id));
const conservedHost = h => { assert.deepEqual(h.active, snapshot); assert.deepEqual(h.notes, { text: "Planner note remains" }); };
async function withHost(options, fn) {
  const h = await host(options);
  try { await fn(h); }
  finally { await h.cleanup(); }
}

test("review/cancel, one confirmed identity, literal names and search/order conservation", async t => {
  await withHost({}, async h => {
    await h.preview(a.id); await h.importPreview(); h.dirty();
    const before = h.state(), rows = structuredClone(h.rows);
    observed(t, "request-cancel", "before", h);
    await h.fire("removeSavedWeek"); observed(t, "request-cancel", "requested", h);
    assert.equal(h.nodes.savedWeekRemoval.hidden, false); assert.equal(h.nodes.savedWeekRemovalName.textContent, a.name);
    assert.equal(h.nodes.savedWeekRemovalName.children.length, 0); assert.equal(h.focus, "keepSavedWeek");
    assert.equal(h.nodes.confirmRemoveSavedWeek.disabled, false); assert.equal(h.nodes.keepSavedWeek.disabled, false);
    assert.deepEqual(h.calls, before.calls); assert.deepEqual(h.rows, rows);
    await h.fire("keepSavedWeek"); observed(t, "request-cancel", "after", h);
    assert.equal(h.focus, "removeSavedWeek"); assert.equal(h.nodes.savedWeekRemoval.hidden, true);
    const after = h.state();
    for (const key of ["rename", "currentSave", "importName", "importSummary", "importHidden", "query", "order", "listed", "calls", "rows", "activeSha256", "notes", "title"])
      assert.deepEqual(after[key], before[key]);
    assert.equal(h.nodes.confirmRemoveSavedWeek.disabled, true); conservedHost(h);
    await h.fire("removeSavedWeek"); await h.fire("removeSavedWeek"); await h.fire("keepSavedWeek"); await h.fire("confirmRemoveSavedWeek");
    observed(t, "repeated-request", "after", h); assert.deepEqual(h.calls.remove, []); allOriginals(h);
  });
  await withHost({}, async h => {
    await h.preview(a.id); h.dirty(); await h.fire("removeSavedWeek"); h.delay("remove");
    await h.fire("confirmRemoveSavedWeek"); await h.fire("confirmRemoveSavedWeek");
    observed(t, "confirm-once", "pending", h);
    assert.deepEqual(h.calls.remove, [a.id]); assert.equal(h.nodes.savedWeekRemoval.hidden, true);
    assert.equal(h.nodes.confirmRemoveSavedWeek.disabled, true); h.release("remove"); await settle();
    observed(t, "confirm-once", "after", h);
    assert.deepEqual(h.rows, originals.slice(1)); assert.equal(h.nodes.savedWeekPreview.hidden, true);
    assert.match(h.nodes.savedWeeksStatus.textContent, /Removed “Alpha <draft> 雪”/); conservedHost(h);
  });
  await withHost({}, async h => {
    await h.preview(a.id); await h.fire("removeSavedWeek");
    const items = h.nodes.savedWeeksList.children.slice(), calls = structuredClone(h.calls);
    h.nodes.savedWeeksSearch.value = "Beta"; await h.fire("savedWeeksSearch", "input");
    h.nodes.savedWeeksOrder.value = "name"; await h.fire("savedWeeksOrder", "change");
    observed(t, "search-order-retains-target", "filtered", h);
    assert.deepEqual(h.calls, calls); assert.ok(h.nodes.savedWeeksList.children.every(item => items.includes(item)));
    assert.equal(h.nodes.savedWeekRemovalName.textContent, a.name); assert.equal(h.nodes.savedWeekRemoval.hidden, false);
    assert.equal(items.find(item => item.children[1].dataset.savedWeekId === a.id).hidden, true);
    await h.fire("confirmRemoveSavedWeek"); await settle(); observed(t, "search-order-retains-target", "after", h);
    assert.deepEqual(h.calls.remove, [a.id]); assert.deepEqual(h.rows, originals.slice(1)); conservedHost(h);
  });
  await withHost({}, async h => {
    await h.preview("record_broken"); await h.fire("removeSavedWeek"); observed(t, "unreadable-confirm", "requested", h);
    assert.equal(h.nodes.savedWeekRemovalName.textContent, "Unreadable <literal> copy"); assert.equal(h.nodes.savedWeekRemovalName.children.length, 0);
    await h.fire("confirmRemoveSavedWeek"); await settle(); observed(t, "unreadable-confirm", "after", h);
    assert.deepEqual(h.calls.remove, ["record_broken"]); assert.deepEqual(h.rows, originals.slice(0, 2)); conservedHost(h);
  });
});

test("new previews, same-ID refresh and page restoration retire old confirmation", async t => {
  await withHost({}, async h => {
    await h.preview(a.id); await h.fire("removeSavedWeek"); await h.preview(b.id); await h.fire("confirmRemoveSavedWeek");
    observed(t, "different-preview", "after", h);
    assert.deepEqual(h.calls.remove, []); assert.equal(h.nodes.savedPreviewTitle.textContent, b.name); assert.equal(h.nodes.savedWeekRemoval.hidden, true); allOriginals(h);
  });
  await withHost({}, async h => {
    await h.preview(a.id); h.dirty(); await h.fire("removeSavedWeek"); h.delay("list");
    await h.window.fire("focus"); await h.fire("confirmRemoveSavedWeek"); observed(t, "same-id-refresh", "pending", h);
    assert.equal(h.nodes.savedWeekRemoval.hidden, true); assert.deepEqual(h.calls.remove, []);
    h.release("list"); await settle(); await h.fire("confirmRemoveSavedWeek"); observed(t, "same-id-refresh", "after", h);
    assert.equal(h.nodes.renameSavedWeekName.value, "Unfinished rename"); assert.equal(h.nodes.savedPreviewTitle.textContent, a.name); assert.deepEqual(h.calls.remove, []); allOriginals(h);
  });
  await withHost({}, async h => {
    await h.preview(a.id); await h.fire("removeSavedWeek"); h.delay("get");
    await h.preview(b.id); await h.fire("confirmRemoveSavedWeek"); observed(t, "preview-read-pending", "pending", h);
    assert.equal(h.nodes.savedWeekPreview.hidden, true); assert.equal(h.nodes.savedWeekRemoval.hidden, true); assert.deepEqual(h.calls.remove, []);
    h.release("get"); await settle(); await h.fire("confirmRemoveSavedWeek"); observed(t, "preview-read-pending", "after", h);
    assert.equal(h.nodes.savedPreviewTitle.textContent, b.name); assert.deepEqual(h.calls.remove, []); allOriginals(h);
  });
  await withHost({}, async h => {
    await h.preview(a.id); await h.fire("removeSavedWeek"); await h.window.fire("pagehide"); await h.fire("confirmRemoveSavedWeek");
    observed(t, "pagehide-restoration", "hidden", h); assert.equal(h.nodes.savedWeekRemoval.hidden, true); assert.equal(h.nodes.confirmRemoveSavedWeek.disabled, true);
    await h.window.fire("pageshow", { persisted: true }); await settle(); await h.fire("confirmRemoveSavedWeek");
    observed(t, "pagehide-restoration", "after", h); assert.deepEqual(h.calls.remove, []); allOriginals(h); conservedHost(h);
  });
});

test("existing rename, save, open, import and collection actions retire the request", async t => {
  for (const [scenario, control, gate] of [
    ["rename-retires", "renameSavedWeek", "rename"], ["save-current-retires", "saveCurrentWeek", "save"],
    ["open-retires", "openSavedWeek", "open"], ["import-save-retires", "saveImportedWeek", "save"],
  ]) {
    await withHost({}, async h => {
      await h.preview(a.id); if (scenario === "import-save-retires") await h.importPreview(); h.dirty();
      await h.fire("removeSavedWeek"); h.delay(gate); await h.fire(control); await h.fire("confirmRemoveSavedWeek");
      observed(t, scenario, "pending", h); assert.equal(h.nodes.savedWeekRemoval.hidden, true); assert.deepEqual(h.calls.remove, []);
      h.release(gate); await settle(); await h.fire("confirmRemoveSavedWeek"); observed(t, scenario, "after", h);
      assert.deepEqual(h.calls.remove, []); allOriginals(h); conservedHost(h);
      if (gate === "rename") { assert.deepEqual(h.calls.rename, [{ id: a.id, name: "Unfinished rename" }]); assert.equal(h.rows[0].draft.name, "Unfinished rename"); }
      if (gate === "save") { assert.equal(h.calls.save.length, 1); assert.equal(h.rows.length, 4); }
      if (gate === "open") assert.equal(h.calls.open, 1);
    });
  }
  await withHost({ collection: true }, async h => {
    await h.preview(a.id); await h.fire("removeSavedWeek"); h.delay("list");
    await h.fire("downloadCollectionBackup"); await h.fire("confirmRemoveSavedWeek"); observed(t, "collection-action-retires", "pending", h);
    assert.equal(h.nodes.savedWeekRemoval.hidden, true); assert.deepEqual(h.calls.remove, []);
    h.release("list"); await settle(); observed(t, "collection-action-retires", "after", h);
    // The unchanged collection operation refuses the unreadable original C.
    assert.match(h.nodes.collectionBackupStatus.textContent, /saved record is unreadable/);
    assert.deepEqual(h.calls.remove, []); assert.deepEqual(h.rows, originals); conservedHost(h);
  });
});

test("refusal, incomplete hosts, busy/unready guards and explicit retry fail safely", async t => {
  await withHost({}, async h => {
    await h.preview(a.id); h.dirty(); h.refuseRemoval(new Error("Authored remove refusal"));
    await h.fire("removeSavedWeek"); await h.fire("confirmRemoveSavedWeek"); await settle(); await h.fire("confirmRemoveSavedWeek");
    observed(t, "store-rejection", "after", h);
    assert.deepEqual(h.calls.remove, [a.id]); assert.deepEqual(h.rows, originals); assert.equal(h.nodes.savedWeekPreview.hidden, false);
    assert.equal(h.nodes.renameSavedWeekName.value, "Unfinished rename"); assert.equal(h.nodes.savedWeeksStatus.textContent, "Authored remove refusal");
    assert.equal(h.nodes.savedWeekRemoval.hidden, true); conservedHost(h);
    h.refuseRemoval(null); await h.fire("removeSavedWeek"); await h.fire("confirmRemoveSavedWeek"); await settle();
    observed(t, "store-rejection", "explicit-retry", h); assert.deepEqual(h.calls.remove, [a.id, a.id]); assert.deepEqual(h.rows, originals.slice(1));
  });
  for (const missing of [...confirmationIDs.map(id => [id]), confirmationIDs]) {
    await withHost({ missing }, async h => {
      await h.preview(a.id); await h.fire("removeSavedWeek"); await h.fire("confirmRemoveSavedWeek");
      observed(t, "missing-control-fail-closed", missing.join(","), h);
      assert.deepEqual(h.calls.remove, []); assert.deepEqual(h.rows, originals);
      assert.match(h.nodes.savedWeeksStatus.textContent, /confirmation is unavailable/); conservedHost(h);
    });
  }
  await withHost({}, async h => {
    await h.preview(a.id); h.dirty(); h.delay("save"); await h.fire("saveCurrentWeek");
    assert.equal(h.nodes.removeSavedWeek.disabled, true);
    await h.fire("removeSavedWeek"); await h.fire("confirmRemoveSavedWeek"); observed(t, "busy-request-guard", "pending", h);
    assert.deepEqual(h.calls.remove, []); assert.equal(h.nodes.savedWeekRemoval.hidden, true); allOriginals(h);
    h.release("save"); await settle();
  });
  await withHost({ initialListPending: true }, async h => {
    await h.fire("removeSavedWeek"); await h.fire("confirmRemoveSavedWeek"); observed(t, "unselected-or-unready", "before-ready", h);
    assert.deepEqual(h.calls.remove, []); assert.equal(h.nodes.confirmRemoveSavedWeek.disabled, true);
    h.release("list"); await settle(); await h.fire("removeSavedWeek"); await h.fire("confirmRemoveSavedWeek");
    observed(t, "unselected-or-unready", "after", h); assert.deepEqual(h.calls.remove, []); assert.equal(h.nodes.removeSavedWeek.disabled, true); allOriginals(h);
  });
  const html = readFileSync(new URL("../static/index.html", import.meta.url), "utf8");
  for (const id of confirmationIDs) assert.equal((html.match(new RegExp(`id="${id}"`, "g")) || []).length, 1);
  assert.match(html, /aria-labelledby="savedWeekRemovalTitle" hidden/);
  assert.match(html, />Keep saved copy<\/button>/); assert.match(html, />Confirm removal<\/button>/);
});
