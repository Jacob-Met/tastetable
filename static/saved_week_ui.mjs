import { createDraft, draftSummary } from "./saved_weeks.mjs";
import { createSavedWeekStore } from "./saved_week_store.mjs";

const sourceLabels = {
  mock: "Demo draft — fictional venues from a synthetic fixture",
  live: "Saved Qloo response — details still need confirmation",
  unknown: "Saved draft — original data source unspecified",
};
const savedDate = (value) => new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium", timeStyle: "short",
}).format(new Date(value));

/** UI for explicit local snapshots; the host retains recommendation and calendar ownership. */
export function createSavedWeeksUI({ capture, openSaved, store = createSavedWeekStore(), root = document }) {
  const $ = (selector) => root.querySelector(selector);
  let selected = null;
  let busy = false;
  let ready = false;
  let disposed = false;
  let refreshGeneration = 0;
  let previewGeneration = 0;
  let lifetime = 0;
  const status = (message) => { if (!disposed) $("#savedWeeksStatus").textContent = message; };

  function current() { try { return capture(); } catch { return null; } }
  function refreshCurrent() {
    if (disposed) return;
    const snapshot = current();
    $("#saveCurrentWeek").disabled = busy || !ready || !snapshot;
    if (snapshot && !$("#savedWeekName").value.trim()) $("#savedWeekName").value = `Week of ${snapshot.weekState.weekStart}`;
  }
  function controls() {
    for (const button of $("#savedWeeks").querySelectorAll("button")) button.disabled = busy;
    $("#openSavedWeek").disabled = busy || !selected?.draft;
    $("#renameSavedWeek").disabled = busy || !selected?.draft;
    $("#removeSavedWeek").disabled = busy || !selected;
    refreshCurrent();
  }
  function clearPreview() {
    selected = null;
    previewGeneration++;
    $("#savedWeekPreview").hidden = true;
    controls();
  }
  function showPreview(row, preserveName = false) {
    // Focus refreshes can finish after typing. Keep a dirty name for the same
    // selected record; explicit Preview still initializes from stored metadata.
    const nameField = $("#renameSavedWeekName");
    const keepName = preserveName && selected?.id === row.id && selected?.draft
      && nameField.value !== selected.draft.name;
    selected = row;
    $("#savedWeekPreview").hidden = false;
    const days = $("#savedPreviewDays");
    days.replaceChildren();
    if (!row.draft) {
      $("#savedPreviewTitle").textContent = `${row.label || "This saved record"} — cannot be opened`;
      $("#savedPreviewSummary").textContent = `${row.error} It has not been changed. You can remove this record explicitly.`;
      $("#savedPreviewSource").textContent = "";
      $("#savedPreviewOmitted").textContent = "";
      $("#renameSavedWeekName").value = "";
      controls();
      return;
    }
    const summary = draftSummary(row.draft);
    $("#savedPreviewTitle").textContent = summary.name;
    $("#savedPreviewSummary").textContent = `Saved ${savedDate(summary.createdAt)}. ${summary.scheduled} of ${summary.suggested} suggestions scheduled for the week of ${summary.weekStart}. Opening uses the saved suggestions and checks; it does not refresh them.`;
    $("#savedPreviewSource").textContent = sourceLabels[summary.sourceMode];
    for (const day of summary.rows) {
      const item = document.createElement("li");
      item.textContent = `${day.day} ${day.date}: ${day.picks.length ? day.picks.map(({ pick }) => pick.name).join("; ") : "Open day"}`;
      days.append(item);
    }
    $("#savedPreviewOmitted").textContent = summary.omitted.length
      ? `Kept off this week: ${summary.omitted.map(({ pick }) => pick.name).join("; ")}.`
      : "No suggestions kept off this week.";
    if (!keepName) nameField.value = summary.name;
    controls();
  }
  async function preview(id) {
    // Retire the old selection before the fresh read, so its controls cannot
    // race a pending Preview of this or another record.
    clearPreview();
    const generation = ++previewGeneration;
    try {
      const draft = await store.get(id);
      if (disposed || generation !== previewGeneration) return;
      showPreview({ id, draft });
    } catch (error) {
      if (disposed || generation !== previewGeneration) return;
      clearPreview();
      status(`Could not preview the saved week: ${error.message}`);
    }
  }
  async function refresh(message) {
    const generation = ++refreshGeneration;
    try {
      const rows = await store.list();
      if (disposed || generation !== refreshGeneration) return;
      ready = true;
      const list = $("#savedWeeksList");
      list.replaceChildren();
      for (const row of rows) {
        const item = document.createElement("li");
        const description = document.createElement("p");
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.savedWeekId = String(row.id);
        if (row.draft) {
          const summary = draftSummary(row.draft);
          description.textContent = `${summary.name} · week of ${summary.weekStart} · saved ${savedDate(summary.createdAt)} · ${sourceLabels[summary.sourceMode]}`;
          button.textContent = "Preview saved week";
          button.addEventListener("click", () => { void preview(row.id); });
        } else {
          description.textContent = `${row.label}: ${row.error}`;
          button.textContent = "Review unreadable record";
          button.addEventListener("click", () => { previewGeneration++; showPreview(row); });
        }
        item.append(description, button);
        list.append(item);
      }
      if (selected) {
        const row = rows.find((item) => item.id === selected.id);
        if (row) showPreview(row, true);
        else clearPreview();
      }
      $("#savedWeeksEmpty").hidden = rows.length > 0;
      status(message || `${rows.length} saved ${rows.length === 1 ? "week" : "weeks"} in this browser.`);
      controls();
    } catch (error) {
      if (disposed || generation !== refreshGeneration) return;
      ready = false;
      clearPreview();
      // Do not replace an unreadable library with a supposedly empty one.
      $("#savedWeeksEmpty").hidden = true;
      status(`Could not read saved weeks: ${error.message} You can keep arranging the current week and retry.`);
      controls();
    }
  }
  async function action(task) {
    if (busy || disposed) return;
    const generation = lifetime;
    const active = () => !disposed && generation === lifetime;
    busy = true;
    controls();
    try { await task(active); }
    catch (error) { if (active()) status(error.message); }
    finally { if (active()) { busy = false; controls(); } }
  }

  $("#saveCurrentWeek").addEventListener("click", () => {
    // Capture synchronously on the gesture. A later request cannot change what
    // this particular Save means while its storage transaction is pending.
    let draft;
    try {
      const snapshot = capture();
      if (!snapshot) throw new Error("Generate or open a week before saving it.");
      draft = createDraft({ ...snapshot, name: $("#savedWeekName").value });
    } catch (error) { status(`Could not save this week: ${error.message}`); return; }
    void action(async (active) => {
      await store.save(draft);
      if (!active()) return;
      await refresh(`Saved “${draft.name}” in this browser. Later edits need another explicit Save.`);
    });
  });
  $("#refreshSavedWeeks").addEventListener("click", () => { void refresh(); });
  $("#openSavedWeek").addEventListener("click", () => {
    if (!selected?.draft || busy) return;
    const id = selected.id;
    void action(async (active) => {
      // The host starts its existing request lifecycle before this fresh read.
      // Its latest-intent check owns retirement, refusal and final restoration.
      const accepted = await openSaved(() => store.get(id));
      if (!active()) return;
      status(accepted
        ? "Opened the browser copy. Its original inputs, checks and arranged week are restored."
        : "The browser copy was not opened. See the planner status for the current request.");
    });
  });

  $("#renameSavedWeek").addEventListener("click", () => {
    if (!selected?.draft) return;
    const id = selected.id, name = $("#renameSavedWeekName").value;
    void action(async (active) => {
      const draft = await store.rename(id, name);
      if (!active()) return;
      await refresh(`Renamed the saved week to “${draft.name}”. Its saved suggestions and dates are unchanged.`);
    });
  });
  $("#removeSavedWeek").addEventListener("click", () => {
    if (!selected) return;
    const id = selected.id, name = selected.draft?.name || selected.label || "unreadable record";
    void action(async (active) => {
      await store.remove(id);
      if (!active()) return;
      clearPreview();
      await refresh(`Removed “${name}” from this browser. The currently open week is unchanged.`);
    });
  });
  const onFocus = () => { if (!busy) void refresh(); };
  const onPageHide = () => {
    disposed = true;
    lifetime++;
    refreshGeneration++;
    previewGeneration++;
    store.close();
  };
  // A page restored from the back-forward cache reuses its document and module.
  const onPageShow = (event) => {
    if (event.persisted) { disposed = false; busy = false; void refresh(); }
  };
  window.addEventListener("focus", onFocus);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  void refresh();
  return Object.freeze({ refreshCurrent });
}
