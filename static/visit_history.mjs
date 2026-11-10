/** Session-only attendance context. Never sent to the planner or serialized. */
import { readVisitRecord, visitRecordRows, VISIT_RECORD_LIMITS } from "./visit_record.mjs";
import { readWeekFile } from "./week_file.mjs";

export function readVisitHistory(text) {
  const { record } = readVisitRecord(text);
  const mode = readWeekFile(record.source.weekText).state.sourceMode;
  if (!["mock", "live"].includes(mode)) throw new Error("This record does not identify its demo or live source.");
  const venues = new Map();
  for (const row of visitRecordRows(record)) {
    if (row.outcome !== "went") continue;
    const key = JSON.stringify([row.pick.kind, row.pick.entity_id]);
    const prior = venues.get(key) || { count: 0, dates: [], undated: 0 };
    prior.count++;
    if (row.date) prior.dates.push(row.date); else prior.undated++;
    venues.set(key, prior);
  }
  return { mode, venues };
}
export function priorVisitLabel(history, mode, pick) {
  if (!history || history.mode !== mode) return "";
  const prior = history.venues.get(JSON.stringify([pick.kind, pick.entity_id]));
  if (!prior) return "";
  const dates = [...new Set(prior.dates)].sort();
  return "Previously went" + (dates.length ? " · most recent recorded date " + dates.at(-1) : " · date not recorded")
    + (prior.count > 1 ? " · " + prior.count + " recorded visits" : "")
    + (dates.length && prior.undated ? " · " + prior.undated + " without a date" : "")
    + ". From your visit record; not a new venue check.";
}

export function mountVisitHistory(root, changed) {
  const q = selector => root.querySelector(selector);
  let active = null, pending = null, revision = 0;
  const status = q("[data-history-status]"), preview = q("[data-history-preview]");
  const clearPreview = () => { pending = null; preview.hidden = true; };
  q("[data-history-open]").addEventListener("click", () => {
    q("input").value = ""; q("input").click();
  });
  q("input").addEventListener("change", async () => {
    const file = q("input").files[0];
    if (!file) return;
    const token = ++revision;
    clearPreview();
    status.textContent = "Reading visit record locally…";
    try {
      if (file.size > VISIT_RECORD_LIMITS.fileBytes) throw new Error("Choose a visit record smaller than 8 MiB.");
      const history = readVisitHistory(await file.text());
      if (token !== revision) return;
      pending = { history, name: file.name };
      q("[data-history-summary]").textContent = file.name + ": " + history.venues.size
        + " previously visited venues (" + (history.mode === "mock" ? "fictional demo" : "live Qloo") + ").";
      preview.hidden = false;
      status.textContent = active ? "Current visit context stays in use until you choose Use." : "Review the file, then choose Use to mark matching venues.";
    } catch (error) {
      if (token !== revision) return;
      status.textContent = "Could not open visit record: " + error.message + (active ? " Your current visit context is still in use." : "");
    }
  });
  q("[data-history-use]").addEventListener("click", () => {
    if (!pending) return;
    active = pending.history;
    status.textContent = "Using " + pending.name + " for this tab's current and later plans. " + active.venues.size
      + " previously visited venues. Notes stay private; recommendations and checks are unchanged.";
    ++revision; clearPreview(); q("[data-history-clear]").disabled = false; changed();
  });
  q("[data-history-cancel]").addEventListener("click", () => {
    ++revision; clearPreview(); status.textContent = active ? "File review canceled. Current visit context remains in use." : "File review canceled.";
  });
  q("[data-history-clear]").addEventListener("click", () => {
    ++revision; active = null; clearPreview(); q("input").value = "";
    q("[data-history-clear]").disabled = true; status.textContent = "Visit context cleared from this tab."; changed();
  });
  // Clear is available during a read too, so an abandoned read cannot restore context.
  q("input").addEventListener("change", () => { q("[data-history-clear]").disabled = false; });
  window.addEventListener("pagehide", () => { ++revision; active = null; clearPreview(); });
  return { label: (mode, pick) => priorVisitLabel(active, mode, pick) };
}
