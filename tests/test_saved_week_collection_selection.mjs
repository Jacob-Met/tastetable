import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createDraft } from "../static/saved_weeks.mjs";
import { createWeekPlan } from "../static/week_plan.mjs";
import { COLLECTION_FORMAT } from "../static/saved_week_collection.mjs";
import { createSavedWeekStore } from "../static/saved_week_store.mjs";
import { createSavedWeekCollectionUI } from "../static/saved_week_collection_ui.mjs";

// Fictional data and expected identities/counts were handwritten before the
// product. These source controls use the real codecs/store and declared doubles;
// they do not claim browser keyboard, layout or native IndexedDB qualification.
const response = JSON.parse(readFileSync(new URL("./fixtures/saved-week-response.json", import.meta.url)));
const date = "2026-10-14T04:00:00.000Z";
const a = createDraft({ id: "selected_A", name: "Existing A", response,
  inputs: { cuisines: [], music: [], films: [], city: "Pasadena", constraints: ["soft_foods", "low_sodium", "wheelchair"] },
  weekState: createWeekPlan(response, "2026-12-31"), receivedAt: date,
  calendarId: "0123456789abcdef0123456789abcdef", now: new Date(date) });
const b = { ...a, id: "selected_B", name: "Existing B" };
const c = { ...a, id: "selected_C", name: "C <literal> 雪", text: "\uFEFF" + a.text.replaceAll("\n", "\r\n") };
const d = { ...a, id: "selected_D", name: "D café" };
const incomingA = { ...a, name: "Incoming A rename" };
const backup = (records) => JSON.stringify({ format: COLLECTION_FORMAT, savedAt: date, records });
const mixed = backup([d, incomingA, b, c]);
const encoded = (text) => new TextEncoder().encode(text).buffer;

// Same transaction model as the maintained collection-store tests: private
// working map, complete cursor scan and commit only at transaction completion.
function transactionFixture(initial) {
  let data = new Map(initial.map((row) => [row.id, structuredClone(row)]));
  const activity = [];
  const db = { objectStoreNames: { contains: () => true }, close() {}, transaction(_name, mode) {
    const working = structuredClone(data);
    let pending = 0, ended = false, scheduled = false;
    const tx = { objectStore: () => store, abort() {
      if (ended) return;
      ended = true; activity.push("abort"); setImmediate(() => tx.onabort?.());
    } };
    function settle() {
      if (scheduled) return;
      scheduled = true;
      setImmediate(() => {
        scheduled = false;
        if (!ended && pending === 0) {
          ended = true;
          if (mode === "readwrite") { data = working; activity.push("commit"); }
          tx.oncomplete?.();
        }
      });
    }
    function queue(fn, request = {}) {
      pending++;
      setImmediate(() => {
        pending--;
        if (ended) return;
        try { request.result = fn(); request.onsuccess?.(); }
        catch (error) { request.error = tx.error = error; tx.abort(); }
        settle();
      });
      return request;
    }
    const store = { keyPath: "id", autoIncrement: false,
      openCursor() {
        const entries = [...working.entries()], request = {}; let index = 0;
        const next = () => queue(() => index >= entries.length ? null : {
          primaryKey: entries[index][0], value: structuredClone(entries[index][1]),
          continue() { index++; next(); },
        }, request);
        next(); return request;
      },
      add(value) { return queue(() => {
        activity.push(`add:${value.id}`);
        if (working.has(value.id)) throw new Error("ConstraintError");
        working.set(value.id, structuredClone(value)); return value.id;
      }); },
    };
    settle(); return tx;
  } };
  return { activity, values: () => [...data.values()], put: (row) => data.set(row.id, structuredClone(row)),
    indexedDB: { open() { const request = {}; setImmediate(() => { request.result = db; request.onsuccess(); }); return request; } } };
}

class Element {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase(); this.children = []; this.events = {};
    this.disabled = false; this.hidden = false; this.value = ""; this.checked = false; this._text = "";
  }
  set textContent(value) { this._text = String(value); this.replaceChildren(); }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(""); }
  append(...children) { for (const child of children) { child.remove(); child.parentNode = this; this.children.push(child); } }
  replaceChildren(...children) { for (const child of this.children) child.parentNode = null; this.children = []; this.append(...children); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this); this.parentNode = null; }
  addEventListener(name, fn) { this.events[name] = fn; }
  emit(name) { return this.events[name]?.({ target: this, currentTarget: this, type: name }); }
  querySelector(selector) { return walk(this).find((element) => `#${element.id}` === selector) || null; }
}
function walk(element) { return [element, ...element.children.flatMap(walk)]; }

function setup(t, initial = [a, b]) {
  const originalDocument = globalThis.document;
  globalThis.document = { body: new Element("body"), createElement: (tag) => new Element(tag) };
  t.after(() => { globalThis.document = originalDocument; });
  const root = new Element("section"); root.id = "savedWeekCollection";
  const nodes = {};
  for (const id of ["downloadCollectionBackup", "collectionBackupFile", "addMissingSavedWeeks", "cancelCollectionBackup",
    "collectionBackupPreview", "collectionBackupRecords", "collectionBackupStatus", "collectionBackupSummary"]) {
    const node = new Element(); node.id = id; nodes[id] = node; root.append(node);
  }
  nodes.collectionBackupPreview.append(nodes.collectionBackupSummary, nodes.collectionBackupRecords, nodes.addMissingSavedWeeks);
  nodes.collectionBackupPreview.hidden = true;
  const native = transactionFixture(initial), realStore = createSavedWeekStore({ indexedDB: native.indexedDB });
  t.after(() => realStore.close());
  const calls = [], actions = [], state = { busy: false, ready: true, disposed: false };
  const host = { selectedID: a.id, dirtyRename: "Retained unsaved rename", search: "unchanged", order: "name", activeWeek: "original week", venueNotes: "original notes" };
  const hostBefore = structuredClone(host);
  let refreshFailure = false, refreshes = 0, heldResult = null, ui;
  const store = {
    list: () => realStore.list(),
    async restoreMissing(input, expected) {
      calls.push({ input: structuredClone(input), expected: structuredClone(expected) });
      const result = await realStore.restoreMissing(input, expected);
      if (heldResult) { const held = heldResult; heldResult = null; held.ready(result); await held.wait; }
      return result;
    },
  };
  function run(task) {
    if (state.busy || state.disposed) return;
    ui.invalidate(); state.busy = true; ui.controls();
    const pending = (async () => {
      try { await task(() => !state.disposed); }
      finally { state.busy = false; ui.controls(); }
    })();
    actions.push(pending); return pending;
  }
  ui = createSavedWeekCollectionUI({ root, store, state: () => state, run,
    async refresh() { refreshes++; if (refreshFailure) throw new Error("injected list refresh failure"); ui.invalidate(); } });
  const $ = (id) => root.querySelector(`#${id}`);
  const checks = () => walk($("collectionMissingSelectionRecords")).filter((node) => node.tagName === "INPUT");
  return { root, $, ui, state, host, hostBefore, native, calls, actions, checks,
    refreshes: () => refreshes, failRefresh: () => { refreshFailure = true; },
    select(id, checked = true) { const node = checks().find((entry) => entry.value === id); assert.ok(node); node.checked = checked; node.emit("change"); return node; },
    async choose(text) { const bytes = encoded(text); $("collectionBackupFile").files = [{ size: bytes.byteLength, arrayBuffer: async () => bytes }]; await $("collectionBackupFile").emit("change"); },
    async click(id = "addSelectedMissingSavedWeeks") { $(id).emit("click"); await Promise.all(actions); },
    holdResult() {
      let ready, release;
      const committed = new Promise((resolve) => { ready = resolve; });
      const wait = new Promise((resolve) => { release = resolve; });
      heldResult = { ready, wait }; return { committed, release };
    },
  };
}

test("mixed backup selects exact missing originals with labels and the complete store token", async (t) => {
  const h = setup(t), before = structuredClone([a, b, c, d, incomingA]);
  await h.choose(mixed);
  assert.equal(h.$("collectionBackupRecords").children.length, 4);
  assert.match(h.$("collectionBackupSummary").textContent, /2 missing · 1 already identical · 1 conflicting/);
  assert.match(h.$("collectionBackupRecords").textContent, /Incoming A rename.*Conflicting/);
  assert.equal(h.$("addMissingSavedWeeks").disabled, true);
  assert.equal(h.$("collectionMissingSelection").tagName, "FIELDSET");
  assert.equal(h.$("collectionMissingSelection").children[0].textContent, "Choose missing saved weeks");
  assert.equal(h.$("collectionMissingSelectionStatus").role, "status");
  assert.equal(h.$("collectionMissingSelectionStatus").ariaLive, "polite");
  assert.deepEqual(h.checks().map((node) => [node.type, node.value, node.checked]), [["checkbox", d.id, false], ["checkbox", c.id, false]]);
  for (const node of h.checks()) {
    assert.equal(node.parentNode.tagName, "LABEL");
    assert.ok(node.parentNode.textContent.includes(node.value));
    assert.ok(node.parentNode.textContent.includes(node.value === c.id ? c.name : d.name));
  }
  assert.equal(h.$("addSelectedMissingSavedWeeks").type, "button");
  await h.click(); assert.equal(h.calls.length, 0);
  h.select(c.id); h.select(d.id);
  assert.match(h.$("collectionMissingSelectionStatus").textContent, /2 missing selected; 2 currently saved; 4 after/);
  assert.equal(h.$("addMissingSavedWeeks").disabled, true);
  await h.click();
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0], { input: { format: COLLECTION_FORMAT, savedAt: date, records: [d, c] }, expected: [a, b] });
  assert.deepEqual(h.native.values(), [a, b, d, c]);
  assert.deepEqual(h.native.activity, [`add:${d.id}`, `add:${c.id}`, "commit"]);
  assert.match(h.$("collectionBackupStatus").textContent, /Added 2 selected missing.*Other backup records were not added or resolved/);
  assert.equal(h.$("collectionBackupPreview").hidden, true);
  assert.equal(h.refreshes(), 1); assert.deepEqual(h.host, h.hostBefore);
  assert.deepEqual([a, b, c, d, incomingA], before); assert.equal(backup([d, incomingA, b, c]), mixed);
});

test("subset capacity, zero selection and full admission guard every selected submission", async (t) => {
  const full = Array.from({ length: 49 }, (_, index) => ({ ...a, id: `full_record_${String(index).padStart(2, "0")}` }));
  const h = setup(t, full); await h.choose(backup([c, d]));
  assert.equal(h.$("addMissingSavedWeeks").disabled, true);
  assert.equal(h.$("addSelectedMissingSavedWeeks").disabled, true);
  h.select(c.id); assert.equal(h.$("addSelectedMissingSavedWeeks").disabled, false);
  h.select(d.id); assert.equal(h.$("addSelectedMissingSavedWeeks").disabled, true);
  assert.match(h.$("collectionMissingSelectionStatus").textContent, /49 currently saved; 51 after.*Choose fewer/);
  await h.click(); assert.equal(h.calls.length, 0); assert.deepEqual(h.native.values(), full);
  h.select(d.id, false);
  const selected = h.checks().find((node) => node.value === c.id);
  selected.value = a.id; selected.emit("change"); // DOM value cannot substitute an ineligible identity.
  await h.click();
  assert.deepEqual(h.calls[0].input.records, [c]); assert.deepEqual(h.calls[0].expected, full);
  assert.deepEqual(h.native.values(), [...full, c]);
  await h.choose(backup([])); await h.click(); assert.equal(h.calls.length, 1);
  await h.choose(backup([c])); assert.equal(h.checks().length, 0); await h.click(); assert.equal(h.calls.length, 1);
  await h.choose(backup([d, { ...c, id: "invalid_record", text: "not a saved week" }]));
  assert.equal(h.$("collectionBackupPreview").hidden, true); assert.equal(h.checks().length, 0);
  assert.match(h.$("collectionBackupStatus").textContent, /Could not review/); await h.click();
  assert.equal(h.calls.length, 1); assert.deepEqual(h.native.values(), [...full, c]);
});

test("stale complete storage and retired callbacks cannot restore or apply an old selection", async (t) => {
  const h = setup(t); await h.choose(mixed);
  const detached = h.select(c.id);
  h.$("cancelCollectionBackup").emit("click"); await h.choose(backup([d]));
  detached.checked = true; detached.emit("change");
  assert.match(h.$("collectionMissingSelectionStatus").textContent, /^0 missing selected/);
  assert.equal(h.$("addSelectedMissingSavedWeeks").disabled, true);
  h.select(d.id);
  for (const flag of ["busy", "unready"]) {
    h.state.busy = flag === "busy"; h.state.ready = flag !== "unready"; h.ui.controls();
    assert.equal(h.$("addSelectedMissingSavedWeeks").disabled, true);
    await h.click(); assert.equal(h.calls.length, 0);
  }
  h.state.busy = false; h.state.ready = true; h.ui.controls();
  h.native.put({ ...a, name: "Excluded record renamed in another tab" });
  await h.click();
  assert.equal(h.calls.length, 1); assert.deepEqual(h.calls[0].expected, [a, b]);
  assert.deepEqual(h.native.values(), [{ ...a, name: "Excluded record renamed in another tab" }, b]);
  assert.ok(!h.native.activity.some((entry) => entry.startsWith("add:")));
  assert.match(h.$("collectionBackupStatus").textContent, /Could not add selected.*changed since.*Open the backup again/);
  assert.equal(h.$("collectionBackupPreview").hidden, true);
  let release;
  h.$("collectionBackupFile").files = [{ size: 1, arrayBuffer: () => new Promise((resolve) => { release = resolve; }) }];
  const oldRead = h.$("collectionBackupFile").emit("change");
  await h.choose(backup([c])); release(encoded(mixed)); await oldRead;
  assert.deepEqual(h.checks().map((node) => node.value), [c.id]);
  assert.match(h.$("collectionMissingSelectionStatus").textContent, /^0 missing selected/);
  h.select(c.id); const held = h.holdResult();
  h.$("addSelectedMissingSavedWeeks").emit("click"); await held.committed;
  h.state.disposed = true; h.ui.invalidate(); const status = h.$("collectionBackupStatus").textContent;
  held.release(); await Promise.all(h.actions);
  assert.equal(h.$("collectionBackupStatus").textContent, status);
  assert.equal(h.$("addSelectedMissingSavedWeeks").disabled, true);
  assert.deepEqual(h.native.values(), [{ ...a, name: "Excluded record renamed in another tab" }, b, c]);
  assert.deepEqual(h.host, h.hostBefore);
});

test("all-record add remains complete and a committed selected addition survives refresh failure", async (t) => {
  const h = setup(t); await h.choose(backup([c, b]));
  assert.equal(h.$("addMissingSavedWeeks").disabled, false);
  assert.equal(h.$("addSelectedMissingSavedWeeks").disabled, true);
  await h.click("addMissingSavedWeeks");
  assert.deepEqual(h.calls[0], { input: { format: COLLECTION_FORMAT, savedAt: date, records: [c, b] }, expected: [a, b] });
  assert.match(h.$("collectionBackupStatus").textContent, /Added 1 missing saved week; 1 already identical/);
  assert.deepEqual(h.native.values(), [a, b, c]);
  await h.choose(backup([d])); h.select(d.id); h.failRefresh(); await h.click();
  assert.equal(h.calls.length, 2); assert.deepEqual(h.calls[1].expected, [a, b, c]);
  assert.deepEqual(h.native.values(), [a, b, c, d]);
  assert.match(h.$("collectionBackupStatus").textContent, /Added 1 selected missing saved week, but.*refresh failed.*inspect the committed addition/);
  assert.doesNotMatch(h.$("collectionBackupStatus").textContent, /Could not add|rolled back/);
  assert.equal(h.$("collectionBackupPreview").hidden, true);
  await h.click(); assert.equal(h.calls.length, 2); assert.equal(h.refreshes(), 2);
  assert.deepEqual(h.host, h.hostBefore);
});
