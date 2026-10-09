import { createVisitHistory, previewHistoryAddition, acceptHistoryAddition, removeHistoryFile,
  filterVisitHistory, overlappingHistoryFiles, HISTORY_LIMITS } from "./visit_history.mjs";
import { VISIT_RECORD_LIMITS } from "./visit_record.mjs";

const $ = id => document.getElementById(id);
const labels = { went: "Went", did_not_go: "Did not go", unrecorded: "Unrecorded" };
let history = createVisitHistory(), pending = null, generation = 0, applied = {}, invalidFilters = false;
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function error(id, value = "") { $(id).textContent = value; $(id).hidden = !value; }
function retire(message = "") {
  generation++; pending = null;
  $("preview").hidden = true; $("addFiles").disabled = true;
  $("previewFiles").replaceChildren(); $("loadStatus").textContent = message;
}
function options() { return Object.fromEntries(["query", "outcome", "datePresence", "from", "to", "order"].map(id => [id, $(id).value])); }
function describeFilters(value) {
  const outcome = value.outcome && value.outcome !== "all" ? labels[value.outcome] : "All outcomes";
  const date = value.from || value.to ? "Entered actual / decision date " + (value.from || "any start") + " to " + (value.to || "any end") + ", inclusive; undated excluded"
    : value.datePresence === "undated" ? "Undated entries only"
    : value.datePresence === "dated" ? "Dated entries only" : "All dates, including undated";
  const order = value.order === "date_asc" ? "Entered date, oldest first; undated last"
    : value.order === "date_desc" ? "Entered date, newest first; undated last" : "File selection and original occurrence order";
  return outcome + ". " + date + ". " + order + "." + (value.query ? " Search: " + value.query : "");
}
function markInvalid(message = "") {
  invalidFilters = Boolean(message); error("filterError", message);
  document.body.classList.toggle("invalid-filters", invalidFilters);
  $("printView").disabled = invalidFilters || history.files.length === 0;
}
function render() {
  const rows = filterVisitHistory(history, applied);
  $("collectionSummary").textContent = history.files.length + " record files; " + history.files.reduce((n, file) => n + file.rows.length, 0)
    + " original record entries. These are not unique visit totals.";
  $("clearFiles").disabled = history.files.length === 0;
  const overlaps = overlappingHistoryFiles(history);
  $("overlapWarning").hidden = overlaps.length === 0;
  $("overlapWarning").textContent = "Overlapping snapshots: " + overlaps.join(", ")
    + " cover overlapping original planned-week ranges. Their recorded entries may describe the same visits. All versions remain separate; none is treated as newer or authoritative.";
  $("fileList").replaceChildren();
  for (const file of history.files) {
    const section = node("section", undefined, "file"); section.dataset.fileId = file.id;
    section.append(node("h3", file.id + " · " + file.name));
    section.append(node("p", "Original source: " + file.sourceName + " · Original planned week " + file.weekStart + " to " + file.weekEnd + " · Source mode: " + file.sourceMode, "meta"));
    section.append(node("p", "Visit record saved: " + file.savedAt + " (file timestamp, not a visit date)", "meta"));
    section.append(node("p", "Original inputs: " + JSON.stringify(file.inputs), "literal"));
    section.append(node("p", "Original plan notes: " + (file.planNotes.length ? file.planNotes.join("\n") : "None recorded"), "literal"));
    const remove = node("button", "Remove " + file.id, "controls"); remove.type = "button";
    remove.addEventListener("click", () => {
      retire("Removed " + file.name + " from this view. The file is unchanged.");
      history = removeHistoryFile(history, file.id); render();
    });
    section.append(remove); $("fileList").append(section);
  }
  $("filterSummary").textContent = describeFilters(applied);
  const counts = { went: 0, did_not_go: 0, unrecorded: 0 };
  rows.forEach(({ row }) => counts[row.outcome]++);
  $("entrySummary").textContent = rows.length + " matching record entries: " + counts.went + " went, "
    + counts.did_not_go + " did not go, " + counts.unrecorded + " unrecorded.";
  $("entries").replaceChildren();
  for (const { file, row } of rows) {
    const article = node("article", undefined, "entry");
    article.dataset.fileId = file.id; article.dataset.key = row.key;
    article.append(node("h3", row.pick.name));
    article.append(node("p", file.id + " · " + file.name + " · " + row.key + " · " + file.sourceName, "meta"));
    article.append(node("p", "Recorded outcome: " + labels[row.outcome] + ". Entered actual / decision date: " + (row.date ?? "Not entered") + "."));
    article.append(node("p", "Saved plan: " + (row.plannedDate ? row.plannedDay + " " + row.plannedDate : "Omitted from arranged week")
      + ". Original suggestion: " + row.originalDay + "."));
    article.append(node("p", "Visit note: " + (row.note || "No note recorded"), "literal visit-note"));
    article.append(node("p", "Original explanation: " + row.pick.why, "literal"));
    article.append(node("p", "Original venue identity: " + row.pick.entity_id + " · " + row.pick.kind, "meta"));
    // Opaque original fields (including checks/fallback provenance) remain available as literal data.
    article.append(node("p", "Complete original pick: " + JSON.stringify(row.pick), "literal meta"));
    $("entries").append(article);
  }
  $("printView").disabled = invalidFilters || history.files.length === 0;
}
$("chooseFiles").addEventListener("click", () => {
  retire(); error("loadError"); $("recordFiles").value = ""; $("recordFiles").click();
});
$("recordFiles").addEventListener("cancel", () => retire("File selection cancelled. Existing records are unchanged."));
$("recordFiles").addEventListener("change", async () => {
  retire(); error("loadError");
  const files = [...$("recordFiles").files], ticket = generation;
  if (!files.length) { $("loadStatus").textContent = "No files selected."; return; }
  try {
    if (files.length > HISTORY_LIMITS.files || files.some(file => file.size > VISIT_RECORD_LIMITS.fileBytes)
      || files.reduce((n, file) => n + file.size, 0) > HISTORY_LIMITS.bytes) {
      throw new TypeError("Choose at most 20 files, each at most 8 MiB, with at most 32 MiB in the selection.");
    }
    $("preview").hidden = false; $("previewStatus").textContent = "Reading selected files…";
    const inputs = [];
    for (const file of files) {
      if (ticket !== generation) return;
      const bytes = await file.arrayBuffer();
      if (ticket !== generation) return;
      // Preserve a leading UTF-8 BOM, so exact-text duplicate identity is exact valid UTF-8 byte identity.
      const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      inputs.push({ name: file.name, text });
    }
    const preview = previewHistoryAddition(history, inputs);
    if (ticket !== generation) return;
    pending = preview;
    $("previewStatus").textContent = preview.added.length + " new files; " + preview.duplicates.length
      + " exact-byte duplicates will be skipped. Different versions stay separate.";
    for (const file of preview.added) $("previewFiles").append(node("li", "Add " + file.name + " · week " + file.weekStart
      + " · " + file.rows.length + " original entries · saved " + file.savedAt));
    for (const file of preview.duplicates) $("previewFiles").append(node("li", "Skip exact duplicate " + file.name
      + " (already included as " + file.existingId + " · " + file.existingName + ")"));
    $("addFiles").disabled = false;
  } catch (cause) {
    if (ticket !== generation) return;
    retire("Nothing from this selection was added. Existing records are unchanged.");
    error("loadError", cause instanceof TypeError && /encoded data/.test(cause.message)
      ? "Choose files encoded as valid UTF-8." : cause.message);
  }
});
$("cancelFiles").addEventListener("click", () => retire("Selection cancelled. Existing records are unchanged."));
$("addFiles").addEventListener("click", () => {
  if (!pending) return;
  try {
    const added = pending.added.length, duplicates = pending.duplicates.length;
    history = acceptHistoryAddition(history, pending);
    retire("Added " + added + " files. Skipped " + duplicates + " exact-byte duplicates.");
    render();
  } catch (cause) { retire(); error("loadError", cause.message); }
});
$("clearFiles").addEventListener("click", () => {
  retire("Cleared this view. Original files are unchanged."); history = createVisitHistory(); render();
});
$("filters").addEventListener("input", () => {
  // A partially edited filter is not represented by the last applied report.
  markInvalid("Filter controls have changed. Apply them or reset before printing.");
});
$("filters").addEventListener("submit", event => {
  event.preventDefault();
  try { const next = options(); filterVisitHistory(history, next); applied = next; markInvalid(); render(); }
  catch (cause) { markInvalid(cause.message); }
});
$("resetFilters").addEventListener("click", () => {
  $("filters").reset(); applied = {}; markInvalid(); render();
});
$("printView").addEventListener("click", () => { if (!invalidFilters && history.files.length) window.print(); });
window.addEventListener("pagehide", () => retire());
render();
