import { draftSummary, MAX_DRAFTS } from "./saved_weeks.mjs";
import { MAX_COLLECTION_BYTES, makeCollectionBackup, readCollectionBackup, planCollectionRestore } from "./saved_week_collection.mjs";

/** Collection-only controls. The existing host owns all planner and copy actions. */
export function createSavedWeekCollectionUI({ root, store, state, run, refresh }) {
  const $ = (selector) => root.querySelector(selector);
  if (!$("#savedWeekCollection")) return Object.freeze({ controls() {}, invalidate() {} });
  let generation = 0, reading = false, preview = null;
  const notice = (text) => { if (!state().disposed) $("#collectionBackupStatus").textContent = text; };
  function controls() {
    const { busy, ready, disposed } = state();
    $("#downloadCollectionBackup").disabled = disposed || busy || !ready;
    $("#collectionBackupFile").disabled = disposed || busy;
    $("#addMissingSavedWeeks").disabled = disposed || busy || !ready || !preview?.plan.canApply;
    $("#cancelCollectionBackup").disabled = disposed || busy || (!preview && !reading);
  }
  function invalidate(message = "") {
    generation++;
    reading = false;
    preview = null;
    $("#collectionBackupFile").value = "";
    $("#collectionBackupPreview").hidden = true;
    $("#collectionBackupRecords").replaceChildren();
    notice(message);
    controls();
  }
  function show(backup, plan) {
    const list = $("#collectionBackupRecords");
    const missing = new Set(plan.missing.map((record) => record.id));
    const conflicts = new Map(plan.conflicts.map((pair) => [pair.incoming.id, pair.existing]));
    list.replaceChildren();
    for (const record of backup.records) {
      const item = document.createElement("li");
      const summary = draftSummary(record);
      const existing = conflicts.get(record.id);
      const disposition = existing ? "Conflicting" : missing.has(record.id) ? "Missing" : "Already identical";
      item.textContent = `${record.name} · ID ${record.id} · created ${record.createdAt} · updated ${record.updatedAt} · week of ${summary.weekStart} · ${disposition}`;
      if (existing) item.textContent += ` · Existing: ${existing.name}, updated ${existing.updatedAt}.`;
      list.append(item);
    }
    $("#collectionBackupSummary").textContent = `${plan.missing.length} missing · ${plan.identical.length} already identical · ${plan.conflicts.length} conflicting. ${plan.expected.length} currently saved; ${plan.totalAfter} after adding missing records. Backup created ${backup.savedAt}.`;
    preview = { backup, plan };
    reading = false;
    $("#collectionBackupPreview").hidden = false;
    notice(plan.conflicts.length ? "Conflicting identities were found. Nothing was added. Keep both files and resolve the difference deliberately; this tool never overwrites saved weeks."
      : plan.totalAfter > MAX_DRAFTS ? `The complete addition would exceed ${MAX_DRAFTS} saved weeks. Nothing was added.`
      : !plan.missing.length ? "No missing records to add. Nothing was changed."
      : "Review every record before adding the missing saved weeks. Your active week, selection and venue notes are unchanged.");
    controls();
  }
  $("#collectionBackupFile").addEventListener("change", async () => {
    const file = $("#collectionBackupFile").files?.[0];
    $("#collectionBackupFile").value = "";
    if (state().disposed || state().busy) return;
    invalidate();
    if (!file) return;
    const ticket = generation;
    reading = true;
    notice("Reading the collection backup. Nothing has been added.");
    controls();
    const active = () => ticket === generation && !state().disposed;
    try {
      if (file.size > MAX_COLLECTION_BYTES) throw new TypeError("Choose a collection backup of at most 32 MiB.");
      const bytes = await file.arrayBuffer();
      if (!active()) return;
      if (bytes.byteLength > MAX_COLLECTION_BYTES) throw new TypeError("Choose a collection backup of at most 32 MiB.");
      let text;
      try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
      catch { throw new TypeError("Choose a collection backup encoded as valid UTF-8."); }
      const backup = readCollectionBackup(text);
      const rows = await store.list();
      if (!active()) return;
      show(backup, planCollectionRestore(backup, rows));
    } catch (error) { if (active()) invalidate(`Could not review the collection backup: ${error.message}`); }
  });
  $("#cancelCollectionBackup").addEventListener("click", () => {
    if (!state().disposed && !state().busy) invalidate("Collection preview cancelled. Nothing was changed.");
  });
  $("#downloadCollectionBackup").addEventListener("click", () => {
    if (state().disposed || state().busy || !state().ready) return;
    void run(async (active) => {
      const ticket = generation;
      try {
        const rows = await store.list();
        if (!active() || ticket !== generation) return;
        const savedAt = new Date().toISOString();
        const text = makeCollectionBackup(rows, savedAt);
        const blob = new Blob([text], { type: "application/json;charset=utf-8" });
        let url, anchor;
        try {
          url = URL.createObjectURL(blob);
          anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = `tastetable-saved-weeks-${savedAt.slice(0, 10)}.json`;
          document.body.append(anchor);
          anchor.click();
          notice(`Download requested for ${rows.length} saved ${rows.length === 1 ? "week" : "weeks"}. The complete collection was captured; saved-name search and ordering do not limit it.`);
        } finally {
          anchor?.remove();
          if (url) setTimeout(() => URL.revokeObjectURL(url), 0);
        }
      } catch (error) { if (active() && ticket === generation) notice(`Could not back up saved weeks: ${error.message}`); }
    });
  });
  $("#addMissingSavedWeeks").addEventListener("click", () => {
    if (state().disposed || state().busy || !state().ready || !preview?.plan.canApply) return;
    const reviewed = preview;
    void run(async (active) => {
      try {
        const result = await store.restoreMissing(reviewed.backup, reviewed.plan.expected);
        if (!active()) return;
        await refresh();
        if (active()) notice(`Added ${result.added} missing saved ${result.added === 1 ? "week" : "weeks"}; ${result.alreadyPresent} already identical. The active week and venue notes are unchanged. Your saved-name search may hide added records.`);
      } catch (error) {
        if (active()) invalidate(`Could not add missing saved weeks: ${error.message} Open the backup again to review current storage.`);
      }
    });
  });
  controls();
  return Object.freeze({ controls, invalidate });
}
