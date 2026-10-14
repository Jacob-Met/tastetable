import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createDraft } from "../static/saved_weeks.mjs";
import { createWeekPlan } from "../static/week_plan.mjs";
import { COLLECTION_FORMAT } from "../static/saved_week_collection.mjs";
import { createSavedWeekCollectionUI } from "../static/saved_week_collection_ui.mjs";

const response = JSON.parse(readFileSync(new URL("./fixtures/saved-week-response.json", import.meta.url)));
const date = "2026-10-14T04:00:00.000Z";
const a = createDraft({ id: "collection_test_A", name: "<literal> café", response,
  inputs: { cuisines: [], music: [], films: [], city: "Pasadena", constraints: ["soft_foods", "low_sodium", "wheelchair"] },
  weekState: createWeekPlan(response, "2026-12-31"), receivedAt: date,
  calendarId: "0123456789abcdef0123456789abcdef", now: new Date(date) });
const b = { ...a, id: "collection_test_B", name: "Other saved week" };
const backup = (records) => JSON.stringify({ format: COLLECTION_FORMAT, savedAt: date, records });
const bytes = (text) => new TextEncoder().encode(text).buffer;
const rows = (values) => values.map((draft) => ({ id: draft.id, draft }));

class Element {
  constructor() { this.children = []; this.events = {}; this.disabled = false; this.hidden = false; this.value = ""; this.textContent = ""; }
  addEventListener(name, fn) { this.events[name] = fn; }
  emit(name) { return this.events[name]?.(); }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  remove() { this.removed = true; }
}
function setup(t, saved = [a]) {
  const ids = ["savedWeekCollection", "downloadCollectionBackup", "collectionBackupFile", "addMissingSavedWeeks", "cancelCollectionBackup",
    "collectionBackupPreview", "collectionBackupRecords", "collectionBackupStatus", "collectionBackupSummary"];
  const elements = new Map(ids.map((id) => [`#${id}`, new Element()]));
  const root = { querySelector: (key) => elements.get(key) || null };
  const original = { document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL, timer: globalThis.setTimeout };
  const anchors = [], blobs = [], revoked = [], actions = [];
  let clickFailure = false, listFailure = false, restoreFailure = false, reads = 0, writes = 0, refreshes = 0;
  const state = { busy: false, ready: true, disposed: false };
  globalThis.document = { body: new Element(), createElement(tag) {
    const element = new Element();
    if (tag === "a") { anchors.push(element); element.click = () => { if (clickFailure) throw new Error("click refused"); }; }
    return element;
  } };
  URL.createObjectURL = (blob) => { blobs.push(blob); return `blob:fixture-${blobs.length}`; };
  URL.revokeObjectURL = (url) => revoked.push(url);
  globalThis.setTimeout = (fn) => { fn(); return 0; };
  t.after(() => { globalThis.document = original.document; URL.createObjectURL = original.create; URL.revokeObjectURL = original.revoke; globalThis.setTimeout = original.timer; });
  const store = {
    async list() { reads++; if (listFailure) throw new Error("unreadable source"); return structuredClone(rows(saved)); },
    async restoreMissing(backup, expected) {
      writes++;
      if (restoreFailure) throw new Error("Saved weeks changed since this preview");
      assert.deepEqual(expected, [...saved].sort((a, b) => a.id < b.id ? -1 : 1));
      const added = backup.records.filter((record) => !saved.some((old) => old.id === record.id));
      saved.push(...added); return { added: added.length, alreadyPresent: backup.records.length - added.length };
    },
  };
  let ui;
  async function run(task) {
    if (state.busy || state.disposed) return;
    ui.invalidate(); state.busy = true; ui.controls();
    const pending = (async () => {
      try { await task(() => !state.disposed); }
      finally { state.busy = false; ui.controls(); }
    })();
    actions.push(pending); await pending;
  }
  ui = createSavedWeekCollectionUI({ root, store, state: () => state, run, async refresh() { refreshes++; ui.invalidate(); } });
  const $ = (id) => elements.get(`#${id}`);
  return { $, ui, saved, state, anchors, blobs, revoked, actions,
    counts: () => ({ reads, writes, refreshes }),
    failClick: () => { clickFailure = true; }, failList: () => { listFailure = true; }, failRestore: () => { restoreFailure = true; },
    async choose(text) {
      $("collectionBackupFile").files = [{ size: bytes(text).byteLength, arrayBuffer: async () => bytes(text) }];
      await $("collectionBackupFile").emit("change");
    },
  };
}

test("fresh complete backup requests exact stored text and releases its temporary anchor and URL", async (t) => {
  const h = setup(t, [b, a]);
  h.$("downloadCollectionBackup").emit("click"); await Promise.all(h.actions);
  const value = JSON.parse(await h.blobs[0].text());
  assert.deepEqual(value.records, [a, b]); assert.equal(value.format, COLLECTION_FORMAT);
  assert.equal(h.anchors[0].download, `tastetable-saved-weeks-${value.savedAt.slice(0, 10)}.json`);
  assert.ok(h.anchors[0].removed); assert.deepEqual(h.revoked, ["blob:fixture-1"]);
  assert.match(h.$("collectionBackupStatus").textContent, /Download requested/);
  assert.deepEqual(h.counts(), { reads: 1, writes: 0, refreshes: 0 });
});

test("failed read emits no Blob; failed anchor click cleans up and re-enables controls", async (t) => {
  const h = setup(t); h.failClick();
  h.$("downloadCollectionBackup").emit("click"); await Promise.all(h.actions);
  assert.match(h.$("collectionBackupStatus").textContent, /Could not back up/);
  assert.ok(h.anchors[0].removed); assert.equal(h.revoked.length, 1);
  assert.equal(h.$("downloadCollectionBackup").disabled, false);
  h.failList(); h.$("downloadCollectionBackup").emit("click"); await Promise.all(h.actions);
  assert.equal(h.blobs.length, 1); assert.equal(h.counts().writes, 0);
});

test("preview is literal, includes every record and writes only after explicit add", async (t) => {
  const h = setup(t);
  await h.choose(backup([b, a]));
  assert.equal(h.$("collectionBackupRecords").children.length, 2);
  assert.match(h.$("collectionBackupRecords").children[1].textContent, /<literal> café.*Already identical/);
  assert.match(h.$("collectionBackupSummary").textContent, /1 missing · 1 already identical · 0 conflicting/);
  assert.equal(h.counts().writes, 0); assert.equal(h.$("addMissingSavedWeeks").disabled, false);
  h.$("addMissingSavedWeeks").emit("click"); await Promise.all(h.actions);
  assert.deepEqual(h.saved, [a, b]); assert.equal(h.counts().writes, 1); assert.equal(h.counts().refreshes, 1);
  assert.equal(h.$("collectionBackupPreview").hidden, true);
  assert.match(h.$("collectionBackupStatus").textContent, /Added 1 missing/);
});

test("conflicting, empty, identical and malformed previews never write", async (t) => {
  const h = setup(t);
  for (const records of [[{ ...a, name: "Incoming rename" }, b], [], [a]]) {
    await h.choose(backup(records));
    assert.equal(h.$("addMissingSavedWeeks").disabled, true);
    h.$("addMissingSavedWeeks").emit("click");
  }
  await h.choose("not JSON");
  assert.equal(h.$("collectionBackupPreview").hidden, true);
  assert.match(h.$("collectionBackupStatus").textContent, /Could not review/);
  assert.equal(h.counts().writes, 0); assert.deepEqual(h.saved, [a]);
});

test("cancel, replacement and external invalidation retire pending file reads", async (t) => {
  const h = setup(t); let release;
  h.$("collectionBackupFile").files = [{ size: 20, arrayBuffer: () => new Promise((resolve) => { release = resolve; }) }];
  const old = h.$("collectionBackupFile").emit("change");
  assert.equal(h.$("cancelCollectionBackup").disabled, false);
  h.$("cancelCollectionBackup").emit("click");
  await h.choose(backup([a]));
  release(bytes(backup([b]))); await old;
  assert.match(h.$("collectionBackupSummary").textContent, /0 missing · 1 already identical/);
  h.ui.invalidate();
  assert.equal(h.$("collectionBackupPreview").hidden, true); assert.equal(h.counts().writes, 0);
});

test("stale restore clears preview; pagehide retires a pending read without changing storage", async (t) => {
  const h = setup(t); await h.choose(backup([b])); h.failRestore();
  h.$("addMissingSavedWeeks").emit("click"); await Promise.all(h.actions);
  assert.match(h.$("collectionBackupStatus").textContent, /changed since.*Open the backup again/);
  assert.equal(h.$("collectionBackupPreview").hidden, true); assert.deepEqual(h.saved, [a]);
  let release;
  h.$("collectionBackupFile").files = [{ size: 1, arrayBuffer: () => new Promise((resolve) => { release = resolve; }) }];
  const pending = h.$("collectionBackupFile").emit("change");
  h.state.disposed = true; h.ui.invalidate(); release(bytes(backup([b]))); await pending;
  assert.equal(h.$("collectionBackupPreview").hidden, true); assert.equal(h.$("downloadCollectionBackup").disabled, true);
  assert.deepEqual(h.saved, [a]);
});

test("old component hosts without collection controls remain optional", () => {
  const ui = createSavedWeekCollectionUI({ root: { querySelector: () => null } });
  ui.controls(); ui.invalidate();
});
