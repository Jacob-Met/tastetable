/** Session-only attendance context. Never sent to the planner or serialized. */
import { readVisitRecord, visitRecordRows, VISIT_RECORD_LIMITS } from "./visit_record.mjs";
import { readWeekFile } from "./week_file.mjs";

// Canonicalize source objects so whitespace/key order changes do not duplicate a week.
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === "object" && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);

export function readVisitHistories(texts) {
  if (!texts.length || texts.length > 20) throw new Error("Choose between 1 and 20 visit records.");
  const occurrences = new Map(), venues = new Map(), sources = new Map();
  let mode = null, duplicates = 0;
  const summaries = [];
  for (const text of texts) {
    const { record } = readVisitRecord(text);
    const sourceMode = readWeekFile(record.source.weekText).state.sourceMode;
    if (!["mock", "live"].includes(sourceMode)) throw new Error("This record does not identify its demo or live source.");
    if (mode && mode !== sourceMode) throw new Error("Demo and live records cannot be combined. Choose records from one source.");
    mode = sourceMode;
    const source = canonical(JSON.parse(record.source.weekText.replace(/^\uFEFF/, "")));
    if (!sources.has(source)) sources.set(source, sources.size);
    const rows = visitRecordRows(record);
    summaries.push(rows.filter(row => row.outcome === "went").map(row => ({ name: row.pick.name, date: row.date })));
    for (const row of rows) {
      const identity = JSON.stringify([sources.get(source), row.key]);
      const value = { key: JSON.stringify([row.pick.kind, row.pick.entity_id]), outcome: row.outcome, date: row.date };
      if (occurrences.has(identity)) {
        const prior = occurrences.get(identity);
        if (prior.outcome !== value.outcome || prior.date !== value.date)
          throw new Error("These records disagree about a visit in the same saved week. Choose the correct version of that week and reopen the selection.");
        if (value.outcome === "went") duplicates++;
      } else occurrences.set(identity, value);
    }
  }
  for (const row of occurrences.values()) {
    if (row.outcome !== "went") continue;
    const prior = venues.get(row.key) || { count: 0, dates: [], undated: 0 };
    prior.count++;
    if (row.date) prior.dates.push(row.date); else prior.undated++;
    venues.set(row.key, prior);
  }
  // Source text and private notes are discarded; only attendance totals survive.
  return { mode, venues, duplicates, records: texts.length, summaries };
}
export function readVisitHistory(text) { return readVisitHistories([text]); }
export function priorVisitLabel(history, mode, pick) {
  if (!history || history.mode !== mode) return "";
  const prior = history.venues.get(JSON.stringify([pick.kind, pick.entity_id]));
  if (!prior) return "";
  const dates = [...new Set(prior.dates)].sort();
  return "Visited" + (dates.length ? " · " + dates.at(-1) : " · date not recorded")
    + (prior.count > 1 ? " · " + prior.count + " visits" : "")
    + (dates.length && prior.undated ? " · " + prior.undated + " without a date" : "")
    + ".";
}

export function mountVisitHistory(root, changed) {
  const q = selector => root.querySelector(selector);
  let active = null, pending = null, revision = 0;
  const status = q("[data-history-status]"), preview = q("[data-history-preview]");
  const clearPreview = () => { pending = null; preview.hidden = true; q("[data-history-records]").replaceChildren(); };
  q("[data-history-open]").addEventListener("click", () => {
    q("input").value = ""; q("input").click();
  });
  q("input").addEventListener("change", async () => {
    const files = [...q("input").files];
    if (!files.length) return;
    const token = ++revision;
    clearPreview();
    status.textContent = "Reading visit records locally…";
    try {
      if (files.length > 20) throw new Error("Choose at most 20 visit records.");
      if (files.some(file => file.size > VISIT_RECORD_LIMITS.fileBytes)) throw new Error("Choose visit records smaller than 8 MiB each.");
      if (files.reduce((sum, file) => sum + file.size, 0) > 32 * 1024 * 1024) throw new Error("Choose at most 32 MiB of visit records in one selection.");
      const history = readVisitHistories(await Promise.all(files.map(file => file.text())));
      if (token !== revision) return;
      pending = { history, name: files.length === 1 ? files[0].name : files.length + " visit records" };
      q("[data-history-summary]").textContent = files.map(file => file.name).join(", ") + ": " + history.venues.size
        + " previously visited venues (" + (history.mode === "mock" ? "fictional demo" : "live Qloo") + "). "
        + history.duplicates + " repeated attendance entries from the same saved week counted once. "
        + "Different saved weeks remain separate records. Review the visits below for overlap. Only combine records you know belong to the same person; these files do not identify the person.";
      const list = q("[data-history-records]");
      history.summaries.forEach((rows, index) => {
        const details = document.createElement("details"), heading = document.createElement("summary");
        heading.textContent = files[index].name + " · " + rows.length + " recorded visits";
        const entries = document.createElement("ul");
        for (const row of rows) {
          const item = document.createElement("li");
          item.textContent = row.name + " · " + (row.date || "date not recorded");
          entries.append(item);
        }
        if (!rows.length) { const item = document.createElement("li"); item.textContent = "No visits marked went."; entries.append(item); }
        details.append(heading, entries); list.append(details);
      });
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
