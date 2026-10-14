import { CAREGIVER_HANDOFF_BYTE_LIMIT } from "./caregiver_handoff.mjs";
import { CONTACT_STATES } from "./venue_followup.mjs";
import { calendarWeek } from "./week_plan.mjs";
import { NOTE_FIELDS } from "./venue_note_changes.mjs";
import { readHandoffForComparison, compareCaregiverHandoffs } from "./handoff_compare.mjs";

const SIDE_LABELS = Object.freeze({ earlier: "Earlier copy", revised: "Revised copy" });
const ARRANGEMENT_LABELS = Object.freeze({ unchanged: "Unchanged", moved: "Moved", scheduled: "Newly scheduled", omitted: "Kept off the week" });
const NOTE_LABELS = Object.freeze({ added: "Note record added", removed: "Note record removed", changed: "Note record changed", unchanged: "Note record unchanged" });
const FIELD_LABELS = Object.freeze({ status: "Contact status", question: "Questions", reply: "Reply / notes", replyQuestions: "Questions associated with that reply", nextStep: "Next step" });

/** The page owns only these local file slots. Existing worksheet state is never opened or changed. */
export function mountHandoffComparison(doc, view = doc.defaultView) {
  const slots = Object.fromEntries(Object.keys(SIDE_LABELS).map(side => [side, { generation: 0, pending: false, value: null }]));
  const byId = id => doc.getElementById(id);
  function element(tag, text, className) {
    const node = doc.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function field(list, label, value) { list.append(element("dt", label), element("dd", value, "literal")); }
  function dateLabel(visit) { return visit.date === null ? "Not scheduled" : visit.day + " · " + visit.date; }
  function renderSource(side) {
    const slot = slots[side], target = byId(side + "Source");
    target.replaceChildren();
    byId(side + "Clear").disabled = !slot.pending && !slot.value;
    if (!slot.value) return;
    const { snapshot, name, bytes } = slot.value;
    target.append(element("p", name, "file-name"));
    if (slot.pending) target.append(element("p", "Previously accepted copy shown while the replacement is read."));
    const data = element("dl"), days = calendarWeek(snapshot.state.weekStart);
    field(data, "Week", days[0].date + " to " + days[6].date);
    field(data, "Source label", snapshot.state.sourceMode === "mock" ? "Demo / synthetic source"
      : snapshot.state.sourceMode === "live" ? "Saved live-source label" : "Source mode unknown");
    field(data, "Handoff saved", snapshot.handoffSavedAt);
    field(data, "File size", bytes + " bytes");
    field(data, "Saved note records", String(snapshot.records.length));
    target.append(data);
    const metadata = element("details"), extra = element("dl");
    metadata.append(element("summary", "Source and saved-copy details"));
    field(extra, "Week saved", snapshot.savedAt); field(extra, "Notes saved", snapshot.notesSavedAt);
    field(extra, "Original plan received", snapshot.receivedAt);
    field(extra, "Calendar identity", snapshot.calendarId === null ? "Not recorded" : snapshot.calendarId);
    field(extra, "Original inputs (as saved)", JSON.stringify(snapshot.inputs, null, 2));
    metadata.append(extra);
    const visits = element("ol");
    for (const [index, item] of snapshot.state.picks.entries()) {
      visits.append(element("li", "Original occurrence " + (index + 1) + " · " + item.pick.name
        + " · " + (snapshot.state.assignments[item.key] ?? "Not scheduled") + " · source ID " + item.pick.entity_id));
    }
    metadata.append(element("p", snapshot.state.picks.length ? "Original visits in file order:" : "No original visits in this saved source."), visits);
    target.append(metadata);
  }
  function renderArrangement(result) {
    const target = byId("arrangementChanges"), c = result.counts;
    target.append(element("p", c.moved + " moved · " + c.scheduled + " newly scheduled · " + c.omitted + " kept off · " + c.unchanged + " unchanged", "summary"));
    if (!result.changes.length) target.append(element("p", "No original visits in these saved copies."));
    for (const [index, change] of result.changes.entries()) {
      const card = element("article", undefined, "change-card"); card.dataset.occurrence = change.key;
      card.append(element("span", ARRANGEMENT_LABELS[change.status], "badge"),
        element("h3", "Original occurrence " + (index + 1) + " · " + change.pick.name));
      const dates = element("dl"); field(dates, "Earlier copy", dateLabel(change.before)); field(dates, "Revised copy", dateLabel(change.after));
      card.append(dates);
      const details = element("details"), data = element("dl");
      details.append(element("summary", "Original suggestion"));
      field(data, "Original day", change.originalDay); field(data, "Source entity ID", change.pick.entity_id);
      field(data, "Explanation from file", change.pick.why); details.append(data); card.append(details);
      target.append(card);
    }
  }
  function noteSide(note, side, changedFields) {
    const section = element("section", undefined, "record-side");
    section.append(element("h4", SIDE_LABELS[side]));
    if (note === null) { section.append(element("p", "No saved note record for this occurrence and date.")); return section; }
    const data = element("dl");
    for (const name of NOTE_FIELDS) {
      const value = note[name], term = element("dt", FIELD_LABELS[name]), description = element("dd");
      description.dataset.field = name;
      description.dataset.valueKind = value === null ? "null" : value === "" ? "empty" : "text";
      if (changedFields.includes(name)) { term.className = "field-changed"; description.className = "field-changed"; }
      if (value === null) description.append(element("p", name === "question" ? "Original suggested questions" : "No recorded reply questions", "empty-value"));
      else if (value === "") description.append(element("p", "Empty text", "empty-value"));
      else description.append(element("pre", value, "literal"));
      if (name === "status") description.append(element("small", CONTACT_STATES[value]));
      data.append(term, description);
    }
    section.append(data); return section;
  }
  function noteCard(row, arrangement) {
    const index = arrangement.left.findIndex(visit => visit.key === row.key), visit = arrangement.left[index];
    const card = element("article", undefined, "change-card");
    card.dataset.occurrence = row.key; card.dataset.noteDate = row.date; card.dataset.change = row.change;
    card.append(element("span", NOTE_LABELS[row.change], "badge"),
      element("h3", "Original occurrence " + (index + 1) + " · " + visit.pick.name + " · " + row.date));
    for (const [side, visits] of [["earlier", arrangement.left], ["revised", arrangement.right]]) {
      const scheduled = visits.find(item => item.key === row.key).date === row.date;
      card.append(element("p", SIDE_LABELS[side] + ": " + (scheduled ? "This note date matches the scheduled visit." : "Other date or omitted visit.")));
    }
    if (row.changedFields.length) card.append(element("p", "Changed fields: " + row.changedFields.map(name => FIELD_LABELS[name]).join("; ") + "."));
    const values = element("div", undefined, "value-grid");
    values.append(noteSide(row.before, "earlier", row.changedFields), noteSide(row.after, "revised", row.changedFields));
    card.append(values); return card;
  }
  function renderComparison() {
    const section = byId("comparison"), status = byId("comparisonStatus");
    byId("arrangementChanges").replaceChildren(); byId("noteChanges").replaceChildren(); section.hidden = true;
    if (Object.values(slots).some(slot => slot.pending)) { status.textContent = "Reading a selected file. Comparison will return when the read finishes."; return; }
    if (!slots.earlier.value || !slots.revised.value) { status.textContent = "Choose both saved handoffs to compare them."; return; }
    const result = compareCaregiverHandoffs(slots.earlier.value.snapshot, slots.revised.value.snapshot);
    if (!result.paired) { status.textContent = "These handoffs have different saved sources. Changes cannot be matched."; return; }
    status.textContent = "Matching saved source and identity. Changes follow each original visit and each saved note date.";
    section.hidden = false; renderArrangement(result.arrangement);
    const target = byId("noteChanges"), c = result.notes.counts;
    target.append(element("p", c.added + " added · " + c.removed + " removed · " + c.changed + " changed · " + c.unchanged + " unchanged note records", "summary"));
    if (!result.notes.records.length) { target.append(element("p", "No saved note records in either copy.")); return; }
    if (c.added + c.removed + c.changed === 0) target.append(element("p", "No saved note fields changed. The unchanged records are available below."));
    const unchanged = element("details"); unchanged.append(element("summary", c.unchanged + " unchanged note records"));
    for (const row of result.notes.records) (row.change === "unchanged" ? unchanged : target).append(noteCard(row, result.arrangement));
    if (c.unchanged) target.append(unchanged);
  }
  async function selectFile(side, file) {
    if (!file) return;
    const slot = slots[side], generation = ++slot.generation;
    slot.pending = true; byId(side + "Status").textContent = SIDE_LABELS[side] + ": reading " + file.name + "…";
    renderSource(side); renderComparison();
    try {
      if (file.size > CAREGIVER_HANDOFF_BYTE_LIMIT) throw new Error("Choose a caregiver handoff no larger than 6 MiB.");
      const bytes = await file.arrayBuffer();
      if (slot.generation !== generation) return;
      if (bytes.byteLength > CAREGIVER_HANDOFF_BYTE_LIMIT) throw new Error("Choose a caregiver handoff no larger than 6 MiB.");
      let text;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch { throw new Error("The file must contain valid UTF-8 text."); }
      const snapshot = readHandoffForComparison(text, side);
      slot.value = { name: file.name, bytes: bytes.byteLength, snapshot };
      byId(side + "Status").textContent = SIDE_LABELS[side] + ": loaded " + file.name + ".";
    } catch (error) {
      if (slot.generation !== generation) return;
      const message = String(error?.message ?? "The selected file could not be read.");
      byId(side + "Status").textContent = (message.startsWith(SIDE_LABELS[side] + ": ") ? message : SIDE_LABELS[side] + ": " + message)
        + (slot.value ? " The previously accepted copy remains shown." : " Choose a valid saved caregiver handoff.");
    } finally {
      if (slot.generation === generation) { slot.pending = false; renderSource(side); renderComparison(); }
    }
  }
  function clear(side) {
    const slot = slots[side]; slot.generation++; slot.pending = false; slot.value = null;
    byId(side + "File").value = ""; byId(side + "Status").textContent = SIDE_LABELS[side] + ": no file selected.";
    renderSource(side); renderComparison();
  }
  for (const side of Object.keys(slots)) {
    byId(side + "File").addEventListener("change", event => {
      const file = event.target.files?.[0]; event.target.value = ""; return selectFile(side, file);
    });
    byId(side + "Clear").addEventListener("click", () => clear(side));
  }
  function retire() {
    for (const [side, slot] of Object.entries(slots)) {
      slot.generation++;
      if (slot.pending) byId(side + "Status").textContent = SIDE_LABELS[side] + ": pending selection canceled on page departure.";
      slot.pending = false; renderSource(side);
    }
    renderComparison();
  }
  view?.addEventListener("pagehide", retire);
  for (const side of Object.keys(slots)) renderSource(side);
  renderComparison();
  return Object.freeze({ retire });
}

if (typeof document !== "undefined") mountHandoffComparison(document);
