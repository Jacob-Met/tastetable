import { createVisitRecord, updateVisitRecord, visitRecordRows, makeVisitRecordFile, readVisitRecord, VISIT_RECORD_LIMITS } from "./visit_record.mjs";
import { readWeekFile } from "./week_file.mjs";

const $ = selector => document.querySelector(selector);
const labels = {unrecorded: "Unrecorded", went: "Went", did_not_go: "Did not go"};
let current = null, pending = null, generation = 0, downloadUrl = null;
const invalid = new Map();
function text(tag, value, className) {
  const node = document.createElement(tag); node.textContent = value;
  if (className) node.className = className;
  return node;
}
function retire(message = "") {
  generation++; pending = null;
  $("#preview").hidden = true; $("#cancelOpen").hidden = true;
  $("#fileStatus").textContent = message; $("#fileError").textContent = "";
}
function controls() {
  const blocked = !current || invalid.size > 0;
  $("#saveRecord").disabled = blocked; $("#printRecord").disabled = blocked;
  document.body.classList.toggle("invalid-draft", invalid.size > 0);
  $("#draftError").textContent = invalid.size ? "Correct the marked fields before downloading or printing. Your earlier valid values remain in this tab." : "";
  if (current) {
    const counts = Object.fromEntries(Object.keys(labels).map(outcome => [outcome, current.visits.filter(v => v.outcome === outcome).length]));
    $("#recordSummary").textContent = `${counts.went} went · ${counts.did_not_go} did not go · ${counts.unrecorded} unrecorded`;
  }
}
function printText(row) {
  return `Outcome: ${labels[row.outcome]}\nVisit or decision date: ${row.date ?? "Not recorded"}\nNote: ${row.note || "No note"}`;
}
function render() {
  const saved = readWeekFile(current.source.weekText), rows = visitRecordRows(current);
  $("#emptyState").hidden = true; $("#record").hidden = false;
  $("#recordTitle").textContent = "Week of " + saved.state.weekStart;
  $("#sourceName").textContent = current.source.name;
  const mode = {mock:"Demo plan: fictional venues from a synthetic fixture.",live:"Original live plan.",unknown:"Original source mode was not recorded."}[saved.state.sourceMode];
  $("#sourceFacts").textContent = mode + " " + rows.length + " original picks.";
  $("#sourceProvenance").textContent = "Original response received " + saved.receivedAt + ". Week copy saved " + saved.savedAt + ". Planned dates and explanations below come from that copy.";
  $("#sourceInputs").replaceChildren();
  for (const key of ["city", "cuisines", "music", "films", "constraints"]) {
    const value = saved.inputs[key];
    $("#sourceInputs").append(text("dt", key[0].toUpperCase() + key.slice(1)), text("dd", Array.isArray(value) ? value.join(", ") || "None requested" : value));
  }
  $("#originalNotes").replaceChildren(...saved.response.plan.notes.map(value => text("li", value)));
  $("#visits").replaceChildren();
  for (const row of rows) {
    const card = text("li", "", "visit-card"); card.dataset.key = row.key;
    const heading = text("div", "", "visit-heading");
    heading.append(text("h3", row.pick.name)); card.append(heading);
    card.append(text("p", row.plannedDate ? "Planned: " + row.plannedDay + ", " + row.plannedDate : "Not scheduled in this saved week", "planned"));
    card.append(text("p", "Original suggestion: " + row.originalDay + " · " + row.pick.kind, "muted"));
    card.append(text("p", row.pick.why, "why"));
    const fields = text("div", "", "visit-fields");
    for (const field of ["outcome", "date", "note"]) {
      const label = text("label", {outcome:"Outcome",date:"Visit or decision date (optional)",note:"What would you like to remember?"}[field], field === "note" ? "note-field" : "");
      const input = document.createElement(field === "outcome" ? "select" : field === "note" ? "textarea" : "input");
      input.id = row.key + "-" + field; input.dataset.field = field; input.dataset.key = row.key;
      if (field === "outcome") for (const [value, title] of Object.entries(labels)) { const option = text("option", title); option.value = value; input.append(option); }
      if (field === "date") { input.type = "text"; input.inputMode = "numeric"; input.placeholder = "YYYY-MM-DD"; input.autocomplete = "off"; }
      if (field === "note") input.rows = 3;
      input.value = row[field] ?? "";
      const error = text("span", "", "field-error"); error.id = input.id + "-error";
      input.setAttribute("aria-describedby", error.id + (field === "note" ? " " + input.id + "-help" : ""));
      label.append(input, error);
      if (field === "note") { const help = text("span", "Optional · up to 4,000 characters. Keep private health details out.", "note-help"); help.id = input.id + "-help"; label.append(help); }
      input.addEventListener(field === "outcome" ? "change" : "input", () => edit(row.key, field, input, error, card));
      fields.append(label);
    }
    card.append(fields, text("p", printText(row), "print-values")); $("#visits").append(card);
  }
  if (!rows.length) $("#visits").append(text("li", "This saved week has no original picks. Its source can still be saved with this record.", "card"));
  controls();
}
function edit(key, field, input, error, card) {
  retire("File preview cleared because you edited this record.");
  $("#saveStatus").textContent = "";
  const id = key + ":" + field;
  try {
    // Read only this edited field. In particular, unrelated edits never normalize
    // an imported literal CR/CRLF note through textarea.value.
    const value = field === "date" && input.value === "" ? null : input.value;
    current = updateVisitRecord(current, key, { [field]: value });
    invalid.delete(id); input.removeAttribute("aria-invalid"); error.textContent = "";
    card.querySelector(".print-values").textContent = printText(current.visits.find(v => v.key === key));
  } catch (e) { invalid.set(id, e.message); input.setAttribute("aria-invalid", "true"); error.textContent = e.message; }
  controls();
}
async function open(file, kind) {
  retire(file ? "Reading file… The displayed record stays in place." : "");
  if (!file) return;
  const version = generation;
  $("#cancelOpen").hidden = false;
  try {
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > VISIT_RECORD_LIMITS.fileBytes) throw new TypeError("Choose a JSON file no larger than 8 MiB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > VISIT_RECORD_LIMITS.fileBytes) throw new TypeError("Choose a JSON file no larger than 8 MiB.");
    // ignoreBOM:true retains an initial BOM as part of the original source text.
    let content;
    try { content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch { throw new TypeError("Choose a valid UTF-8 file."); }
    const candidate = kind === "week" ? {record:createVisitRecord(content, file.name), savedAt:null} : readVisitRecord(content);
    if (version !== generation) return;
    const saved = readWeekFile(candidate.record.source.weekText);
    pending = candidate;
    $("#previewSummary").textContent = candidate.record.source.name + " · week of " + saved.state.weekStart + " · " + candidate.record.visits.length + " original picks" + (candidate.savedAt ? " · visit record saved " + candidate.savedAt : " · all outcomes start unrecorded") + ".";
    $("#preview").hidden = false; $("#fileStatus").textContent = "File checked. Review it before using.";
    $("#previewTitle").focus({preventScroll:true});
  } catch (e) {
    if (version !== generation) return;
    pending = null; $("#preview").hidden = true; $("#cancelOpen").hidden = true;
    $("#fileStatus").textContent = ""; $("#fileError").textContent = "Could not open this file: " + e.message;
  }
}
for (const [kind, button, picker] of [["week","#openWeek","#weekFile"],["record","#openRecord","#recordFile"]]) {
  $(button).addEventListener("click", () => { retire(); $(picker).value = ""; $(picker).click(); });
  $(picker).addEventListener("change", () => { void open($(picker).files[0], kind); });
  $(picker).addEventListener("cancel", () => retire("Opening cancelled. Your current record is unchanged."));
}
$("#cancelOpen").addEventListener("click", () => retire("Opening cancelled. Your current record is unchanged."));
$("#useRecord").addEventListener("click", () => {
  if (!pending) return;
  const next = pending.record; retire(); current = next; invalid.clear();
  $("#saveStatus").textContent = ""; render(); $("#recordTitle").focus({preventScroll:true});
});
$("#saveRecord").addEventListener("click", () => {
  if (!current || invalid.size) return;
  retire();
  try {
    const file = makeVisitRecordFile(current);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(new Blob([file.text], {type:"application/json;charset=utf-8"}));
    const link = document.createElement("a"); link.href = downloadUrl; link.download = file.filename;
    document.body.append(link); link.click(); link.remove();
    $("#saveStatus").textContent = "Download requested. Keep the JSON file to reopen this record.";
  } catch (e) { $("#saveStatus").textContent = "Could not save this record: " + e.message; }
});
$("#printRecord").addEventListener("click", () => { if (current && !invalid.size) { retire(); window.print(); } });
window.addEventListener("pagehide", () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); });
