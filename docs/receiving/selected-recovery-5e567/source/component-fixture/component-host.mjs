// Isolated native receiving host. Product UI, codecs, and store are imported unchanged.
import { createSavedWeekCollectionUI } from "./static/saved_week_collection_ui.mjs";
import { createSavedWeekStore } from "./static/saved_week_store.mjs";

const databaseName = "hamon.tastetable143.5e5670099628.component-v1";
const state = { busy: false, ready: false, disposed: false };
const host = Object.freeze({
  selectedID: "selected_A",
  dirtyRename: "Retained unsaved rename",
  search: "unchanged",
  order: "name",
  activeWeek: "original fictional week",
  venueNotes: "original fictional notes"
});
const events = [];
const restoreCalls = [];
const pending = new Set();
let ui, store, externalStore, externalRecord, externalUsed = false, refreshCount = 0;
let fixtureError = null;
const status = document.querySelector("#fixtureState");

function record(kind, detail = {}) {
  if (events.length >= 80) throw new Error("Fixture event bound exceeded");
  events.push({ kind, ...detail });
}
function fail(error) {
  fixtureError = { name: error.name, message: error.message };
  state.ready = false;
  status.textContent = "Fixture stopped: " + error.message;
  status.dataset.state = "failed";
  ui?.controls();
}
async function jsonFile(path) {
  const response = await fetch(path, { cache: "no-store", credentials: "omit" });
  if (!response.ok) throw new Error("Fixture input response " + response.status + ": " + path);
  return await response.json();
}
async function refresh() {
  ui.invalidate();
  // The real native store must finish a fresh transaction before this host is ready.
  const rows = await store.list();
  refreshCount++;
  record("refresh", { ids: rows.map(row => row.id) });
  state.ready = true;
  ui.controls();
}
function run(task) {
  if (state.busy || state.disposed) return;
  ui.invalidate();
  state.busy = true;
  ui.controls();
  record("action-start");
  const promise = (async () => {
    try { await task(() => !state.disposed); }
    catch (error) { fail(error); }
    finally {
      if (!state.disposed) {
        state.busy = false;
        ui.controls();
      }
      record("action-finished");
    }
  })();
  pending.add(promise);
  void promise.finally(() => pending.delete(promise));
}
function visible(element) {
  if (!element) return false;
  return !element.closest("[hidden]") && element.getClientRects().length > 0;
}
function box(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}
function snapshotDOM() {
  const $ = id => document.getElementById(id);
  const checks = [...document.querySelectorAll("#collectionMissingSelectionRecords input")];
  const active = document.activeElement;
  return {
    title: document.title,
    fixtureState: status.dataset.state,
    state: { ...state },
    fixtureError,
    summary: $("collectionBackupSummary").textContent,
    completeRows: [...$("collectionBackupRecords").children].map(row => row.textContent),
    previewVisible: visible($("collectionBackupPreview")),
    selectionSummary: $("collectionMissingSelectionStatus").textContent,
    status: $("collectionBackupStatus").textContent,
    checkboxes: checks.map((input, index) => ({
      index, type: input.type, value: input.value, checked: input.checked,
      disabled: input.disabled, visible: visible(input),
      labels: [...input.labels].map(label => label.textContent),
      box: box(input), labelBox: box(input.labels[0]),
      focused: input === active
    })),
    controls: ["downloadCollectionBackup", "collectionBackupFile", "cancelCollectionBackup",
      "addMissingSavedWeeks", "addSelectedMissingSavedWeeks"].map(id => ({
        id, disabled: $(id).disabled, visible: visible($(id)), box: box($(id))
      })),
    active: { tag: active?.tagName, id: active?.id, value: active?.value ?? null },
    viewport: { width: innerWidth, height: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight },
    collectionBox: box($("savedWeekCollection")),
    host: { ...host }, refreshCount, restoreCalls: structuredClone(restoreCalls),
    events: structuredClone(events), pendingActions: pending.size
  };
}

const observations = Object.freeze({
  schema: "hamon.tastetable143.component-observation/1",
  databaseName,
  snapshotDOM,
  async readStorage() {
    if (!state.ready || state.busy || state.disposed || fixtureError)
      throw new Error("Fixture is not idle and ready for storage observation");
    return await store.list();
  },
  // One separately declared writer is the fixed stale-state setup, never a UI action.
  async addExternalRecord() {
    if (!state.ready || state.busy || state.disposed || fixtureError || externalUsed)
      throw new Error("External-writer fixture gate refused");
    externalUsed = true;
    record("external-writer-start", { id: externalRecord.id });
    const added = await externalStore.save(externalRecord);
    record("external-writer-committed", { id: added.id });
    return added;
  }
});
Object.defineProperty(window, "taste143Fixture", {
  value: observations, writable: false, configurable: false
});
window.addEventListener("pagehide", () => {
  state.disposed = true;
  ui?.invalidate();
  store?.close();
  externalStore?.close();
}, { once: true });
window.addEventListener("unhandledrejection", event => { fail(event.reason instanceof Error ? event.reason : new Error(String(event.reason))); });
window.addEventListener("error", event => { fail(new Error(event.message)); });

try {
  if (!globalThis.isSecureContext || typeof indexedDB?.databases !== "function")
    throw new Error("Native secure-context IndexedDB inventory is unavailable");
  const names = await indexedDB.databases();
  if (names.some(info => info.name === databaseName))
    throw new Error("Isolated fixture database already exists; no reset or replay");
  const [initial, other] = await Promise.all([
    jsonFile("./fixtures/initial-records.json"),
    jsonFile("./fixtures/external-addition.json")
  ]);
  if (!Array.isArray(initial) || initial.length !== 2 ||
      initial[0].id !== "selected_A" || initial[1].id !== "selected_B" ||
      other.id !== "selected_E")
    throw new Error("Unexpected fixed fixture identity");
  externalRecord = other;
  store = createSavedWeekStore({ name: databaseName });
  externalStore = createSavedWeekStore({ name: databaseName });
  const measuredStore = Object.freeze({
    list: () => store.list(),
    async restoreMissing(backup, expected) {
      restoreCalls.push({ backup: structuredClone(backup), expected: structuredClone(expected) });
      record("restore-submitted", { ids: backup.records.map(row => row.id) });
      try {
        const result = await store.restoreMissing(backup, expected);
        record("restore-committed", result);
        return result;
      } catch (error) {
        record("restore-refused", { message: error.message });
        throw error;
      }
    }
  });
  ui = createSavedWeekCollectionUI({
    root: document.querySelector("#fixtureHost"), store: measuredStore,
    state: () => ({ ...state }), run, refresh
  });
  for (const row of initial) await store.save(row);
  record("initial-seed-committed", { ids: initial.map(row => row.id) });
  await refresh();
  status.textContent = "Ready — fictional records in an isolated browser collection.";
  status.dataset.state = "ready";
} catch (error) {
  fail(error);
}

