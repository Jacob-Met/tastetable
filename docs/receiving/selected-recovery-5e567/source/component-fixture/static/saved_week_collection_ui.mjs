import { draftSummary, MAX_DRAFTS } from "./saved_weeks.mjs";
import { MAX_COLLECTION_BYTES, makeCollectionBackup, readCollectionBackup, planCollectionRestore } from "./saved_week_collection.mjs";

/** Collection-only controls. The existing host owns all planner and copy actions. */
export function createSavedWeekCollectionUI({ root, store, state, run, refresh }) {
  const $ = (selector) => root.querySelector(selector);
  if (!$("#savedWeekCollection")) return Object.freeze({ controls() {}, invalidate() {} });
  let generation = 0, reading = false, preview = null;
  const selection = document.createElement("fieldset");
  selection.id = "collectionMissingSelection";
  const legend = document.createElement("legend");
  legend.textContent = "Choose missing saved weeks";
  const help = document.createElement("p");
  help.textContent = "Select only the missing records you want to add. Identical and conflicting records remain in the complete preview above and cannot be selected here. Other records stay in your backup.";
  const selectionList = document.createElement("ul");
  selectionList.id = "collectionMissingSelectionRecords";
  const selectionStatus = document.createElement("p");
  selectionStatus.id = "collectionMissingSelectionStatus";
  selectionStatus.role = "status";
  selectionStatus.ariaLive = "polite";
  const addSelected = document.createElement("button");
  addSelected.id = "addSelectedMissingSavedWeeks";
  addSelected.type = "button";
  addSelected.textContent = "Add selected missing weeks";
  selection.append(legend, help, selectionList, selectionStatus, addSelected);
  $("#collectionBackupPreview").append(selection);
  const notice = (text) => { if (!state().disposed) $("#collectionBackupStatus").textContent = text; };
  function controls() {
    const { busy, ready, disposed } = state();
    $("#downloadCollectionBackup").disabled = disposed || busy || !ready;
    $("#collectionBackupFile").disabled = disposed || busy;
    $("#addMissingSavedWeeks").disabled = disposed || busy || !ready || !preview?.plan.canApply;
    $("#cancelCollectionBackup").disabled = disposed || busy || (!preview && !reading);
    const selected = preview?.selected.size || 0;
    const current = preview?.plan.expected.length || 0;
    selection.disabled = disposed || busy || !ready || !preview;
    addSelected.disabled = selection.disabled || selected === 0 || current + selected > MAX_DRAFTS;
    for (const checkbox of preview?.checkboxes || []) checkbox.disabled = selection.disabled;
    selectionStatus.textContent = preview
      ? `${selected} missing selected; ${current} currently saved; ${current + selected} after this selected addition. Other backup records are excluded.`
        + (current + selected > MAX_DRAFTS ? ` Choose fewer records to stay within ${MAX_DRAFTS} saved weeks.` : "")
      : "Open a collection backup to choose missing records. Nothing is selected.";
  }
  function invalidate(message = "") {
    generation++;
    reading = false;
    preview = null;
    $("#collectionBackupFile").value = "";
    $("#collectionBackupPreview").hidden = true;
    $("#collectionBackupRecords").replaceChildren();
    selectionList.replaceChildren();
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
    preview = { backup, plan, selected: new Set(), checkboxes: [] };
    const reviewed = preview, ticket = generation;
    selectionList.replaceChildren();
    for (const record of plan.missing) {
      const item = document.createElement("li");
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = false;
      checkbox.value = record.id;
      const caption = document.createElement("span");
      caption.textContent = ` ${record.name} · ID ${record.id}`;
      label.append(checkbox, caption);
      item.append(label);
      selectionList.append(item);
      reviewed.checkboxes.push(checkbox);
      checkbox.addEventListener("change", () => {
        const { busy, ready, disposed } = state();
        if (preview !== reviewed || generation !== ticket || disposed || busy || !ready) return;
        if (checkbox.checked) reviewed.selected.add(record.id);
        else reviewed.selected.delete(record.id);
        controls();
      });
    }
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
  addSelected.addEventListener("click", () => {
    const { busy, ready, disposed } = state();
    if (disposed || busy || !ready || !preview || preview.selected.size === 0
        || preview.plan.expected.length + preview.selected.size > MAX_DRAFTS) return;
    const reviewed = preview;
    // Capture before run() retires this preview. Keep the complete store token,
    // and retain incoming order even when checkboxes were toggled out of order.
    const records = reviewed.backup.records.filter((record) => reviewed.selected.has(record.id));
    const selectedBackup = { format: reviewed.backup.format, savedAt: reviewed.backup.savedAt, records };
    void run(async (active) => {
      let committed;
      try {
        committed = await store.restoreMissing(selectedBackup, reviewed.plan.expected);
        if (!active()) return;
        await refresh();
        if (active()) notice(`Added ${committed.added} selected missing saved ${committed.added === 1 ? "week" : "weeks"}. Other backup records were not added or resolved. The active week and venue notes are unchanged. Your saved-name search may hide added records.`);
      } catch (error) {
        if (!active()) return;
        if (committed) {
          invalidate(`Added ${committed.added} selected missing saved ${committed.added === 1 ? "week" : "weeks"}, but the saved-week list refresh failed: ${error.message} Refresh the list to inspect the committed addition.`);
        } else {
          invalidate(`Could not add selected missing saved weeks: ${error.message} Open the backup again to review current storage.`);
        }
      }
    });
  });
  controls();
  return Object.freeze({ controls, invalidate });
}
