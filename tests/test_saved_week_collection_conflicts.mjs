import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createDraft, validateDraft } from "../static/saved_weeks.mjs";
import { createWeekPlan } from "../static/week_plan.mjs";
import { COLLECTION_FORMAT, readCollectionBackup, planCollectionRestore } from "../static/saved_week_collection.mjs";
import { createSavedWeekStore } from "../static/saved_week_store.mjs";
import { createSavedWeekCollectionUI } from "../static/saved_week_collection_ui.mjs";

// Independent literal expectations were frozen before candidate exposure.
// The unchanged native constructors establish admitted fictional records; they
// do not generate expected conflict labels, field sets or action outcomes.
const response = JSON.parse(readFileSync(new URL("./fixtures/saved-week-response.json", import.meta.url)));
const date = "2026-10-14T04:00:00.000Z";
const earlier = "2026-10-13T04:00:00.000Z";
const later = "2026-10-15T05:00:00.000Z";
const base = createDraft({ id: "conflict_base", name: "Original saved week", response,
  inputs: { cuisines: [], music: [], films: [], city: "Pasadena", constraints: ["soft_foods", "low_sodium", "wheelchair"] },
  weekState: createWeekPlan(response, "2026-12-31"), receivedAt: date,
  calendarId: "0123456789abcdef0123456789abcdef", now: new Date(date) });
const record = (id, name = id) => ({ ...base, id, name });
const backup = (records) => JSON.stringify({ format: COLLECTION_FORMAT, savedAt: date, records });
const encoded = (text) => new TextEncoder().encode(text).buffer;
const rows = (records) => records.map((draft) => ({ id: draft.id, draft }));
const labels = ["Saved name", "Created date", "Updated date", "Stored week text"];
const textNotice = "The stored week text differs. Formatting alone can cause this; this does not compare planned visits.";
const oldSide = "Currently saved in this browser";
const newSide = "In this backup";

function withCreated(value, createdAt) {
  // Native admission requires this same timestamp inside the portable text.
  const parsed = JSON.parse(value.text);
  parsed.savedAt = createdAt;
  return { ...value, createdAt, text: JSON.stringify(parsed, null, 2) + "\n" };
}

// Retained transaction fixture API from the existing selection tests. The
// actual store owns token comparison and add-missing behavior, not this double.
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

// The semantic DOM fixture retains the existing text/append/replace/event APIs.
// Native disclosure state and local whitespace presentation are observable;
// there is no browser layout, HTML parser, keyboard or IndexedDB claim here.
class Element {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase(); this.nodeType = 1; this.children = []; this.events = {};
    this.disabled = false; this.hidden = false; this.value = ""; this.checked = false; this.open = false; this._text = "";
    this.attributes = new Map();
    this._style = { setProperty(name, value) { this[name] = String(value); } };
  }
  get style() { return this._style; }
  set style(value) { this._style.cssText = String(value); }
  set textContent(value) { this._text = String(value); this.replaceChildren(); }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(""); }
  set innerHTML(_value) { assert.fail("Conflict preview must not parse HTML"); }
  insertAdjacentHTML() { assert.fail("Conflict preview must not parse HTML"); }
  append(...children) {
    for (let child of children) {
      if (typeof child === "string") child = new Text(child);
      child.remove(); child.parentNode = this; this.children.push(child);
    }
  }
  replaceChildren(...children) { for (const child of this.children) child.parentNode = null; this.children = []; this.append(...children); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this); this.parentNode = null; }
  addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
  emit(name) { return Promise.all((this.events[name] || []).map((fn) => fn({ target: this, currentTarget: this, type: name }))); }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "open") this.open = true;
    if (name === "id") this.id = String(value);
    if (name === "style") this.style.cssText = String(value);
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  hasAttribute(name) { return name === "open" ? this.open : this.attributes.has(name); }
  querySelector(selector) { return walk(this).find((element) => selector.startsWith("#") ? `#${element.id}` === selector : element.tagName === selector.toUpperCase()) || null; }
}
class Text extends Element {
  constructor(value) { super("#text"); this.nodeType = 3; this._text = String(value); }
}
function walk(element) { return [element, ...element.children.flatMap(walk)]; }
const byTag = (element, tag) => walk(element).filter((node) => node.tagName === tag.toUpperCase());

function setup(t, initial) {
  const originalDocument = globalThis.document;
  globalThis.document = { body: new Element("body"), createElement: (tag) => new Element(tag), createTextNode: (value) => new Text(value) };
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
  let reads = 0, refreshes = 0, runs = 0, ui;
  const host = { selectedID: initial[0]?.id, activeWeek: "unchanged week", venueNotes: "unchanged notes", dirtyRename: "retained unsaved rename", search: "kept", order: "name" };
  const hostBefore = structuredClone(host);
  const store = {
    async list() { reads++; return realStore.list(); },
    async restoreMissing(input, expected) {
      calls.push({ input: structuredClone(input), expected: structuredClone(expected) });
      return realStore.restoreMissing(input, expected);
    },
  };
  function run(task) {
    if (state.busy || state.disposed) return;
    runs++; ui.invalidate(); state.busy = true; ui.controls();
    const pending = (async () => {
      try { await task(() => !state.disposed); }
      finally { state.busy = false; ui.controls(); }
    })();
    actions.push(pending); return pending;
  }
  ui = createSavedWeekCollectionUI({ root, store, state: () => state, run,
    async refresh() { refreshes++; ui.invalidate(); } });
  const $ = (id) => root.querySelector(`#${id}`);
  const checks = () => byTag($("collectionMissingSelectionRecords"), "input");
  return { root, $, ui, state, host, hostBefore, native, calls, actions, checks,
    counts: () => ({ reads, writes: calls.length, runs, refreshes }),
    select(id) { const node = checks().find((entry) => entry.value === id); assert.ok(node); node.checked = true; node.emit("change"); return node; },
    async choose(text) { const bytes = encoded(text); $("collectionBackupFile").files = [{ size: bytes.byteLength, arrayBuffer: async () => bytes }]; await $("collectionBackupFile").emit("change"); },
    async click(id = "addSelectedMissingSavedWeeks") { await $(id).emit("click"); await Promise.all(actions); },
  };
}

function disclosure(item, expectedLabels) {
  const details = byTag(item, "details");
  assert.equal(details.length, 1, "one disclosure per conflict");
  const node = details[0], summaries = byTag(node, "summary");
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].textContent, "Why this ID conflicts");
  assert.equal(node.open, false, "initial disclosure is closed");
  const actual = labels.filter((label) => node.textContent.includes(label));
  assert.deepEqual(actual, expectedLabels);
  let last = -1;
  for (const label of expectedLabels) {
    const position = node.textContent.indexOf(label);
    assert.ok(position > last, "changed fields follow the fixed user-facing order"); last = position;
    assert.equal(node.textContent.indexOf(label, position + label.length), -1, "field is listed once");
  }
  for (const element of walk(node)) assert.deepEqual(Object.keys(element.events), [], "disclosure adds no action listener");
  return node;
}
function orderedText(node, parts) {
  let offset = 0;
  for (const value of parts) {
    const position = node.textContent.indexOf(value, offset);
    assert.ok(position >= offset, `missing or reversed literal part ${JSON.stringify(value)}`);
    offset = position + value.length;
  }
}
function literalWhitespace(node, value) {
  const leaves = walk(node).filter((entry) => entry._text.includes(value));
  assert.ok(leaves.length > 0, "exact admitted value is retained in a text assignment");
  assert.ok(leaves.some((leaf) => {
    for (let current = leaf; current; current = current.parentNode) {
      const style = current.style;
      if (current.tagName === "PRE" || ["pre", "pre-wrap", "break-spaces"].includes(style.whiteSpace)
          || ["pre", "pre-wrap", "break-spaces"].includes(style["white-space"])
          || /white-space\s*:\s*(?:pre-wrap|break-spaces|pre)(?:\s*;|\s*$)/.test(style.cssText || "")) return true;
      if (current === node) break;
    }
    return false;
  }), "local text presentation retains internal whitespace");
}

test("conflicts explain exactly the differing native fields and both literal sides in order", async (t) => {
  const name = record("conflict_name", "Old label"), update = record("conflict_update", "Update case");
  const created = record("conflict_created", "Creation case"), all = record("conflict_all", "Old all-fields label");
  const identical = record("conflict_identical", "Identical week"), missing = record("conflict_missing", "Missing week");
  const incomingName = { ...name, name: "Incoming label" }, incomingUpdate = { ...update, updatedAt: later };
  const incomingCreated = withCreated(created, earlier);
  const incomingAll = { ...withCreated(all, earlier), name: "Incoming all-fields label", updatedAt: later };
  const initial = [all, created, identical, name, update];
  const incoming = [missing, incomingName, identical, incomingUpdate, incomingCreated, incomingAll];
  const before = structuredClone({ initial, incoming });
  for (const value of [...initial, ...incoming]) assert.deepEqual(validateDraft(value), value);
  const h = setup(t, initial); await h.choose(backup(incoming));
  const list = h.$("collectionBackupRecords").children;
  assert.equal(list.length, 6);
  for (let index = 0; index < incoming.length; index++) assert.ok(list[index].textContent.includes(`ID ${incoming[index].id}`));
  assert.equal(byTag(list[0], "details").length, 0); assert.match(list[0].textContent, /Missing/);
  assert.equal(byTag(list[2], "details").length, 0); assert.match(list[2].textContent, /Already identical/);
  const nameDetail = disclosure(list[1], ["Saved name"]);
  orderedText(nameDetail, ["Saved name", oldSide, "Old label", newSide, "Incoming label"]);
  const updateDetail = disclosure(list[3], ["Updated date"]);
  orderedText(updateDetail, ["Updated date", oldSide, date, newSide, later]);
  const createdDetail = disclosure(list[4], ["Created date", "Stored week text"]);
  orderedText(createdDetail, ["Created date", oldSide, date, newSide, earlier, "Stored week text", textNotice]);
  const allDetail = disclosure(list[5], labels);
  orderedText(allDetail, ["Saved name", oldSide, all.name, newSide, incomingAll.name,
    "Created date", oldSide, date, newSide, earlier, "Updated date", oldSide, date, newSide, later, "Stored week text", textNotice]);
  assert.match(h.$("collectionBackupSummary").textContent, /^1 missing · 1 already identical · 4 conflicting/);
  assert.deepEqual(h.checks().map((entry) => [entry.value, entry.checked]), [[missing.id, false]]);
  assert.equal(h.$("addMissingSavedWeeks").disabled, true);
  assert.deepEqual(h.counts(), { reads: 1, writes: 0, runs: 0, refreshes: 0 });
  assert.deepEqual(h.native.values(), initial); assert.deepEqual(h.host, h.hostBefore);
  assert.deepEqual({ initial, incoming }, before);
});

test("format-only text conflict retains parsed equality without exposing either full portable body", async (t) => {
  const old = record("conflict_format", "Same metadata");
  const incoming = { ...old, text: "\uFEFF" + old.text.replaceAll("\n", "\r\n") };
  assert.notEqual(incoming.text, old.text);
  assert.deepEqual(JSON.parse(incoming.text.replace(/^\uFEFF/, "")), JSON.parse(old.text));
  assert.deepEqual(validateDraft(incoming), incoming);
  const plan = planCollectionRestore(readCollectionBackup(backup([incoming])), rows([old]));
  assert.deepEqual(plan.conflicts, [{ existing: old, incoming }]);
  const h = setup(t, [old]); await h.choose(backup([incoming]));
  const detail = disclosure(h.$("collectionBackupRecords").children[0], ["Stored week text"]);
  orderedText(detail, ["Stored week text", textNotice]);
  assert.equal(detail.textContent.includes(old.text), false); assert.equal(detail.textContent.includes(incoming.text), false);
  assert.equal(detail.textContent.includes('"tastetable.saved-week.v1"'), false);
  assert.equal(h.checks().length, 0); await h.click(); await h.click("addMissingSavedWeeks");
  assert.deepEqual(h.counts(), { reads: 1, writes: 0, runs: 0, refreshes: 0 });
  assert.deepEqual(h.native.values(), [old]); assert.deepEqual(h.host, h.hostBefore);
});

test("Unicode and hostile-looking metadata stays literal with preserved internal whitespace", async (t) => {
  const oldName = '<img src=x onerror="boom"> café  雪\u00a0A';
  const newName = '<script>alert("x")</script> & Δ  雪\u00a0B';
  const old = record("conflict_literal", oldName), incoming = { ...old, name: newName };
  assert.deepEqual(validateDraft(old), old); assert.deepEqual(validateDraft(incoming), incoming);
  const h = setup(t, [old]); await h.choose(backup([incoming]));
  const detail = disclosure(h.$("collectionBackupRecords").children[0], ["Saved name"]);
  orderedText(detail, ["Saved name", oldSide, oldName, newSide, newName]);
  literalWhitespace(detail, oldName); literalWhitespace(detail, newName);
  assert.equal(walk(h.root).some((node) => ["IMG", "SCRIPT", "IFRAME", "OBJECT"].includes(node.tagName)), false);
  const before = { counts: h.counts(), status: h.$("collectionBackupStatus").textContent, summary: h.$("collectionBackupSummary").textContent };
  detail.open = true; await detail.emit("toggle"); detail.open = false; await detail.emit("toggle");
  assert.deepEqual({ counts: h.counts(), status: h.$("collectionBackupStatus").textContent, summary: h.$("collectionBackupSummary").textContent }, before);
  assert.deepEqual(h.native.values(), [old]); assert.deepEqual(h.host, h.hostBefore);
  assert.deepEqual(incoming, { ...old, name: newName });
});

test("passive disclosures preserve selected additions, all-record actions and retired previews", async (t) => {
  const a = record("conflict_flow_A", "Existing A"), b = record("conflict_flow_B", "Existing B");
  const c = { ...record("conflict_flow_C", "C café"), text: "\uFEFF" + base.text.replaceAll("\n", "\r\n") };
  const d = record("conflict_flow_D", "D 雪"), e = record("conflict_flow_E", "Later missing E");
  const incomingA = { ...a, name: "Incoming A" }, mixed = backup([d, incomingA, b, c]);
  const h = setup(t, [a, b]); await h.choose(mixed);
  const detail = disclosure(h.$("collectionBackupRecords").children[1], ["Saved name"]);
  assert.deepEqual(h.checks().map((node) => [node.value, node.checked]), [[d.id, false], [c.id, false]]);
  const detached = h.select(c.id); h.select(d.id);
  const selectedStatus = h.$("collectionMissingSelectionStatus").textContent;
  const beforeToggle = h.counts(); detail.open = true; await detail.emit("toggle");
  assert.deepEqual(h.counts(), beforeToggle); assert.equal(h.$("collectionMissingSelectionStatus").textContent, selectedStatus);
  assert.deepEqual(h.checks().map((node) => node.checked), [true, true]);
  await h.click("addMissingSavedWeeks"); assert.equal(h.calls.length, 0);
  await h.click();
  assert.deepEqual(h.calls, [{ input: { format: COLLECTION_FORMAT, savedAt: date, records: [d, c] }, expected: [a, b] }]);
  assert.deepEqual(h.native.values(), [a, b, d, c]);
  assert.deepEqual(h.native.activity, [`add:${d.id}`, `add:${c.id}`, "commit"]);
  assert.equal(h.$("collectionBackupPreview").hidden, true); assert.equal(byTag(h.root, "details").length, 0);
  assert.match(h.$("collectionBackupStatus").textContent, /Added 2 selected missing.*Other backup records were not added or resolved/);
  assert.deepEqual(h.host, h.hostBefore); assert.equal(backup([d, incomingA, b, c]), mixed);

  await h.choose(backup([incomingA, e]));
  const cancelled = disclosure(h.$("collectionBackupRecords").children[0], ["Saved name"]);
  h.select(e.id); await h.$("cancelCollectionBackup").emit("click");
  assert.equal(byTag(h.root, "details").length, 0); assert.equal(h.checks().length, 0);
  await h.choose(backup([incomingA, e]));
  const replacement = disclosure(h.$("collectionBackupRecords").children[0], ["Saved name"]);
  assert.notEqual(replacement, cancelled); assert.equal(replacement.open, false);
  detached.checked = true; await detached.emit("change");
  assert.deepEqual(h.checks().map((node) => [node.value, node.checked]), [[e.id, false]]);
  assert.match(h.$("collectionMissingSelectionStatus").textContent, /^0 missing selected/);
  assert.equal(h.$("addSelectedMissingSavedWeeks").disabled, true);
  h.ui.invalidate("External refresh retires preview"); assert.equal(byTag(h.root, "details").length, 0);

  await h.choose(backup([e, b]));
  assert.equal(byTag(h.root, "details").length, 0); assert.equal(h.$("addMissingSavedWeeks").disabled, false);
  await h.click("addMissingSavedWeeks");
  assert.deepEqual(h.calls[1], { input: { format: COLLECTION_FORMAT, savedAt: date, records: [e, b] }, expected: [a, b, c, d] });
  assert.deepEqual(h.native.values(), [a, b, d, c, e]);
  assert.match(h.$("collectionBackupStatus").textContent, /Added 1 missing saved week; 1 already identical/);

  let release;
  h.$("collectionBackupFile").files = [{ size: 1, arrayBuffer: () => new Promise((resolve) => { release = resolve; }) }];
  const pending = h.$("collectionBackupFile").emit("change");
  h.state.disposed = true; h.ui.invalidate(); release(encoded(mixed)); await pending;
  assert.equal(h.$("collectionBackupPreview").hidden, true); assert.equal(byTag(h.root, "details").length, 0);
  assert.equal(h.$("addSelectedMissingSavedWeeks").disabled, true);
  assert.equal(h.calls.length, 2); assert.deepEqual(h.native.values(), [a, b, d, c, e]);
  assert.deepEqual(h.host, h.hostBefore);
});
