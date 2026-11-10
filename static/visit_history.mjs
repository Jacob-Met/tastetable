/** Session-only attendance context. Never sent to the planner or serialized. */
import { readVisitRecord, visitRecordRows, VISIT_RECORD_LIMITS } from "./visit_record.mjs";
import { readWeekFile } from "./week_file.mjs";

// Canonicalize source objects so whitespace/key order changes do not duplicate a week.
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === "object" && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);

export class VisitHistoryConflict extends Error {
  constructor(conflicts, summaries) {
    super("These records disagree. Review the conflicting files shown here, then reopen the selection with the correct versions.");
    this.name = "VisitHistoryConflict";
    this.conflicts = conflicts;
    this.summaries = summaries;
  }
}

export function readVisitHistories(texts) {
  if (!texts.length || texts.length > 20) throw new Error("Choose between 1 and 20 visit records.");
  const occurrences = new Map(), venues = new Map(), sources = new Map();
  let mode = null, duplicates = 0;
  const summaries = [], conflicts = [];
  for (const [recordIndex, text] of texts.entries()) {
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
      const value = { key: JSON.stringify([row.pick.kind, row.pick.entity_id]), outcome: row.outcome, date: row.date, recordIndex };
      if (occurrences.has(identity)) {
        const prior = occurrences.get(identity);
        if (prior.outcome !== value.outcome || prior.date !== value.date)
          conflicts.push({ name: row.pick.name, first: { recordIndex: prior.recordIndex, outcome: prior.outcome, date: prior.date }, second: { recordIndex, outcome: row.outcome, date: row.date } });
        if (value.outcome === "went") duplicates++;
      } else occurrences.set(identity, value);
    }
  }
  if (conflicts.length) throw new VisitHistoryConflict(conflicts, summaries);
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
  let active = null, pending = null, revision = 0, selection = null;
  const status = q("[data-history-status]"), preview = q("[data-history-preview]");
  const conflictView = q("[data-history-conflicts]");
  const clearPending = () => {
    pending = null; preview.hidden = true; q("[data-history-records]").replaceChildren();
  };
  const clearReview = () => {
    clearPending(); selection = null;
    if (conflictView) { conflictView.hidden = true; conflictView.replaceChildren(); }
  };
  const cancelReview = () => {
    ++revision; clearReview();
    status.textContent = active ? "File review canceled. Current visit context remains in use." : "File review canceled.";
  };
  const appendVisits = (container, rows) => {
    const list = document.createElement("ul");
    for (const row of rows) {
      const item = document.createElement("li");
      item.textContent = row.name + " · " + (row.date || "date not recorded"); list.append(item);
    }
    if (!rows.length) {
      const item = document.createElement("li"); item.textContent = "No visits marked went."; list.append(item);
    }
    container.append(list);
  };
  const renderSelection = (conflicts = []) => {
    if (!conflictView || !selection) return;
    conflictView.replaceChildren(); conflictView.hidden = false;
    const title = document.createElement("h3"), instruction = document.createElement("p");
    title.textContent = conflicts.length ? "Resolve conflicting records" : "Review your file choices";
    instruction.textContent = "Choose which whole files to keep, then review the kept files. Nothing changes until you choose Use. Omitting a file excludes all its entries; the same visits may still be present in another kept copy.";
    conflictView.append(title, instruction);
    if (conflicts.length) {
      const list = document.createElement("ol"); list.className = "history-conflict-list";
      const labels = { went: "Went", did_not_go: "Did not go", unrecorded: "Not recorded" };
      for (const conflict of conflicts) {
        const item = document.createElement("li"), venue = document.createElement("strong");
        venue.textContent = conflict.name; item.append(venue);
        for (const entry of [conflict.first, conflict.second]) {
          const line = document.createElement("p"), identity = document.createElement("span"), value = document.createElement("span");
          identity.textContent = "File " + (entry.position + 1) + ": " + selection.files[entry.position].name;
          value.className = "history-conflict-value";
          value.textContent = labels[entry.outcome] + " · " + (entry.date || "date not recorded");
          line.append(identity, value); item.append(line);
        }
        list.append(item);
      }
      conflictView.append(list);
    }
    const fieldset = document.createElement("fieldset"), legend = document.createElement("legend");
    fieldset.className = "history-file-choices"; legend.textContent = "Files to keep"; fieldset.append(legend);
    const otherFiles = document.createElement("details"), otherSummary = document.createElement("summary");
    const otherIndices = selection.files.map((_, i) => i).filter(i => !selection.involved.has(i));
    const updateOtherSummary = () => { otherSummary.textContent = otherIndices.length + (otherIndices.length === 1 ? " other file · " : " other files · ") + otherIndices.filter(i => selection.keep[i]).length + " kept"; };
    updateOtherSummary(); otherFiles.append(otherSummary);
    selection.files.forEach((file, index) => {
      const row = document.createElement("div"), label = document.createElement("label"), checkbox = document.createElement("input");
      checkbox.type = "checkbox"; checkbox.checked = selection.keep[index]; checkbox.dataset.historyKeep = String(index);
      const name = document.createElement("span"); name.textContent = "File " + (index + 1) + ": " + file.name;
      label.append(checkbox, name); row.append(label);
      const consequence = document.createElement("p"), details = document.createElement("details"), summary = document.createElement("summary");
      const visits = selection.summaries[index] || [];
      const updateConsequence = () => {
        consequence.textContent = (checkbox.checked ? "Keeping" : "Omitting") + " this whole file · " + visits.length + (visits.length === 1 ? " entry" : " entries") + " marked went.";
      };
      updateConsequence();
      summary.textContent = "Inspect visits in this file"; details.append(summary); appendVisits(details, visits);
      row.append(consequence, details); (selection.involved.has(index) ? fieldset : otherFiles).append(row);
      checkbox.addEventListener("change", () => {
        if (!selection) return;
        selection.keep[index] = checkbox.checked; ++revision; clearPending(); updateConsequence(); updateOtherSummary();
        status.textContent = "File choices changed. Review the kept files before choosing Use." + (active ? " Current visit context remains in use." : "");
      });
    });
    if (otherIndices.length) fieldset.append(otherFiles);
    const review = document.createElement("button"), cancel = document.createElement("button");
    review.type = cancel.type = "button"; review.textContent = "Review kept files"; review.dataset.historyReviewKept = "";
    cancel.textContent = "Cancel file review";
    review.addEventListener("click", () => {
      if (!selection) return;
      const positions = selection.keep.flatMap((keep, i) => keep ? [i] : []);
      if (!positions.length) { clearPending(); status.textContent = "Keep at least one file, or cancel this review."; return; }
      reviewFiles(positions.map(i => selection.files[i]), positions);
    });
    cancel.addEventListener("click", cancelReview);
    conflictView.append(fieldset, review, cancel);
  };
  const reviewFiles = async (files, positions = files.map((_, i) => i)) => {
    const token = ++revision; clearPending();
    status.textContent = "Reading visit records locally…";
    try {
      if (files.length > 20) throw new Error("Choose at most 20 visit records.");
      if (files.some(file => file.size > VISIT_RECORD_LIMITS.fileBytes)) throw new Error("Choose visit records smaller than 8 MiB each.");
      if (files.reduce((sum, file) => sum + file.size, 0) > 32 * 1024 * 1024) throw new Error("Choose at most 32 MiB of visit records in one selection.");
      const history = readVisitHistories(await Promise.all(files.map(file => file.text())));
      if (token !== revision) return;
      pending = { history, name: files.length === 1 ? files[0].name : files.length + " visit records" };
      q("[data-history-summary]").textContent = files.map((file, i) => "File " + (positions[i] + 1) + ": " + file.name).join(", ") + ": " + history.venues.size
        + " previously visited " + (history.venues.size === 1 ? "venue" : "venues") + " (" + (history.mode === "mock" ? "fictional demo" : "live Qloo") + "). "
        + history.duplicates + " repeated attendance " + (history.duplicates === 1 ? "entry" : "entries") + " from the same saved week counted once. "
        + (selection ? (selection.files.length - files.length) + (selection.files.length - files.length === 1 ? " whole file omitted. " : " whole files omitted. ") : "")
        + "Different saved weeks remain separate records. Review the visits below for overlap. Only combine records you know belong to the same person; these files do not identify the person.";
      const list = q("[data-history-records]");
      history.summaries.forEach((rows, index) => {
        const details = document.createElement("details"), heading = document.createElement("summary");
        heading.textContent = "File " + (positions[index] + 1) + ": " + files[index].name + " · " + rows.length + " recorded " + (rows.length === 1 ? "visit" : "visits");
        details.append(heading); appendVisits(details, rows); list.append(details);
      });
      if (selection) renderSelection();
      preview.hidden = false;
      status.textContent = active ? "Current visit context stays in use until you choose Use." : "Review the files, then choose Use to mark matching venues.";
    } catch (error) {
      if (token !== revision) return;
      if (error instanceof VisitHistoryConflict && conflictView) {
        if (!selection) selection = { files, summaries: error.summaries, keep: files.map(() => true), involved: new Set(error.conflicts.flatMap(c => [c.first.recordIndex, c.second.recordIndex])) };
        renderSelection(error.conflicts.map(conflict => ({
          ...conflict,
          first: { ...conflict.first, position: positions[conflict.first.recordIndex] },
          second: { ...conflict.second, position: positions[conflict.second.recordIndex] },
        })));
      }
      status.textContent = error instanceof VisitHistoryConflict && conflictView
        ? (active ? "Your current visit context is still in use." : "No visit context is in use.")
        : "Could not open visit record: " + error.message + (active ? " Your current visit context is still in use." : "");
    }
  };
  q("[data-history-open]").addEventListener("click", () => { q("input").value = ""; q("input").click(); });
  q("input").addEventListener("change", () => {
    const files = [...q("input").files]; if (!files.length) return;
    clearReview(); reviewFiles(files); q("[data-history-clear]").disabled = false;
  });
  q("[data-history-use]").addEventListener("click", () => {
    if (!pending) return;
    active = pending.history;
    status.textContent = "Using " + pending.name + " for this tab's current and later plans. " + active.venues.size
      + " previously visited " + (active.venues.size === 1 ? "venue" : "venues") + ". Notes stay private; recommendations and checks are unchanged.";
    ++revision; clearReview(); q("[data-history-clear]").disabled = false; changed();
  });
  q("[data-history-cancel]").addEventListener("click", cancelReview);
  q("[data-history-clear]").addEventListener("click", () => {
    ++revision; active = null; clearReview(); q("input").value = "";
    q("[data-history-clear]").disabled = true; status.textContent = "Visit context cleared from this tab."; changed();
  });
  window.addEventListener("pagehide", () => { ++revision; active = null; clearReview(); });
  return { label: (mode, pick) => priorVisitLabel(active, mode, pick) };
}
