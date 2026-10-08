import { readWeekFile } from "./week_file.mjs";
import { calendarWeek } from "./week_plan.mjs";
import { compareSavedWeeks } from "./week_compare.mjs";

const MAX_BYTES = 2 * 1024 * 1024;
const slots = Object.fromEntries(["before", "after"].map((key) => [key, { generation: 0, pending: false, value: null }]));
const byId = (id) => document.getElementById(id);
const labels = { unchanged: "Unchanged", moved: "Moved", scheduled: "Newly scheduled", omitted: "Kept off the week" };
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function addField(list, name, value) {
  list.append(element("dt", name), element("dd", value));
}
function sourceMode(snapshot) {
  return snapshot.state.sourceMode === "mock" ? "Demo / synthetic source"
    : snapshot.state.sourceMode === "live" ? "Saved live-source label" : "Source mode unknown";
}
function dateLabel(visit) { return visit.date === null ? "Not scheduled" : visit.day + " · " + visit.date; }
function details(visit) {
  const node = element("details", undefined, "visit-details");
  node.append(element("summary", "Original suggestion and explanation"));
  const data = element("dl", undefined, "source-data");
  addField(data, "Original day", visit.originalDay);
  addField(data, "Kind", visit.pick.kind);
  addField(data, "Source entity ID", visit.pick.entity_id);
  addField(data, "Affinity", visit.pick.affinity == null ? "Not recorded" : String(visit.pick.affinity));
  addField(data, "Explanation from file", visit.pick.why);
  node.append(data);
  return node;
}
function renderSource(key) {
  const slot = slots[key], node = byId(key + "Source");
  node.replaceChildren();
  byId(key + "Clear").disabled = !slot.value && !slot.pending;
  if (!slot.value) return;
  const { name, snapshot } = slot.value;
  const dates = calendarWeek(snapshot.state.weekStart);
  node.append(element("p", name, "file-name"));
  const data = element("dl", undefined, "source-data");
  addField(data, "Week", dates[0].date + " to " + dates[6].date);
  addField(data, "Source", sourceMode(snapshot));
  addField(data, "Saved at", snapshot.savedAt);
  addField(data, "Source received at", snapshot.receivedAt);
  for (const [field, label] of [["city", "City"], ["cuisines", "Cuisines"], ["music", "Music"], ["films", "Films"], ["constraints", "Constraints"]]) {
    const value = snapshot.inputs[field];
    addField(data, label, Array.isArray(value) ? value.join(" · ") || "None recorded" : value || "Not recorded");
  }
  node.append(data);
  if (snapshot.response.plan.notes.length) {
    const notes = element("details");
    notes.append(element("summary", "Original plan notes"));
    snapshot.response.plan.notes.forEach((note) => notes.append(element("p", note)));
    node.append(notes);
  }
}
function separateList(title, visits) {
  const section = element("section"); section.append(element("h3", title));
  if (!visits.length) { section.append(element("p", "No original visits in this saved source.")); return section; }
  const list = element("ol");
  for (const visit of visits) {
    const li = element("li");
    li.append(element("strong", visit.pick.name), element("p", dateLabel(visit)), details(visit));
    list.append(li);
  }
  section.append(list); return section;
}
function renderComparison() {
  const output = byId("comparison"), body = byId("comparisonBody"), status = byId("comparisonStatus");
  body.replaceChildren(); output.hidden = true;
  if (Object.values(slots).some((s) => s.pending)) { status.textContent = "Reading a selected file. Comparison will return when the read finishes."; return; }
  if (!slots.before.value || !slots.after.value) { status.textContent = "Choose both saved weeks to compare them."; return; }
  const before = slots.before.value.snapshot, after = slots.after.value.snapshot;
  const result = compareSavedWeeks(before, after);
  output.hidden = false;
  if (!result.paired) {
    byId("comparisonTitle").textContent = "Separate saved arrangements";
    status.textContent = "Different saved source or source identity. Visits are shown separately; no moved, added or omitted visit is inferred between these files.";
    const grid = element("div", undefined, "separate-weeks");
    grid.append(separateList("Earlier file", result.left), separateList("Revised file", result.right));
    body.append(grid); return;
  }
  byId("comparisonTitle").textContent = "Arrangement changes";
  status.textContent = "Matching saved source and identity. Visits are compared by their original occurrence, including repeated venues.";
  const c = result.counts;
  body.append(element("p", c.moved + " moved · " + c.scheduled + " newly scheduled · " + c.omitted + " kept off · " + c.unchanged + " unchanged", "comparison-summary"));
  if (before.state.weekStart !== after.state.weekStart) body.append(element("p", "Week changed from " + before.state.weekStart + " to " + after.state.weekStart + ". Exact dates below include that change."));
  if (!result.changes.length) { body.append(element("p", "No original visits in these saved copies.")); return; }
  const scroll = element("div", undefined, "table-scroll");
  scroll.tabIndex = 0; scroll.setAttribute("role", "region"); scroll.setAttribute("aria-label", "Visit comparison table; scroll horizontally on a narrow screen");
  const table = element("table", undefined, "change-table"), head = element("thead"), header = element("tr");
  ["Visit", "Earlier date", "Revised date", "Change"].forEach((text) => { const th = element("th", text); th.scope = "col"; header.append(th); });
  head.append(header); table.append(head);
  const rows = element("tbody");
  for (const change of result.changes) {
    const row = element("tr"); row.dataset.occurrence = change.key;
    const name = element("th"); name.scope = "row";
    name.append(element("span", change.pick.name), details(change));
    row.append(name, element("td", dateLabel(change.before)), element("td", dateLabel(change.after)), element("td", labels[change.status], "change-label"));
    rows.append(row);
  }
  table.append(rows); scroll.append(table); body.append(scroll);
}
async function selectFile(key, file) {
  if (!file) return;
  const slot = slots[key], generation = ++slot.generation;
  slot.pending = true;
  byId(key + "Status").textContent = "Reading " + file.name + "…";
  renderSource(key); renderComparison();
  try {
    if (file.size > MAX_BYTES) throw new Error("Choose a saved-week file no larger than 2 MiB.");
    const bytes = await file.arrayBuffer();
    if (slot.generation !== generation) return;
    if (bytes.byteLength > MAX_BYTES) throw new Error("Choose a saved-week file no larger than 2 MiB.");
    const snapshot = readWeekFile(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    slot.value = { name: file.name, snapshot };
    byId(key + "Status").textContent = "Loaded " + file.name + ".";
  } catch (error) {
    if (slot.generation !== generation) return;
    byId(key + "Status").textContent = "Could not open " + file.name + ": " + error.message
      + (slot.value ? " The previously loaded file remains shown." : " Choose a valid saved-week file.");
  } finally {
    if (slot.generation === generation) { slot.pending = false; renderSource(key); renderComparison(); }
  }
}
for (const key of Object.keys(slots)) {
  byId(key + "File").addEventListener("change", (event) => {
    const file = event.target.files[0]; event.target.value = ""; selectFile(key, file);
  });
  byId(key + "Clear").addEventListener("click", () => {
    const slot = slots[key]; slot.generation++; slot.pending = false; slot.value = null;
    byId(key + "File").value = ""; byId(key + "Status").textContent = "No file selected.";
    renderSource(key); renderComparison();
  });
}
