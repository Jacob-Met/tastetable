import {compareSavedSuggestions, readSuggestionSource} from "./common_suggestions.mjs";

const byId = (id) => document.getElementById(id);
const host = byId("source-slots"), add = byId("add-source");
const compare = byId("compare-sources"), download = byId("download-comparison");
const printButton = byId("print-comparison"), status = byId("comparison-status");
const resultPanel = byId("comparison-result");
const slots = [];
let nextId = 0, currentResult = null;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
function button(text, action) {
  const node = element("button", text); node.type = "button";
  node.addEventListener("click", action); return node;
}
function row(list, title, value) {
  list.append(element("dt", title), element("dd", value));
}
function message(error) {
  return error instanceof Error ? error.message : String(error);
}
function retireResult() {
  currentResult = null; resultPanel.hidden = true;
  byId("source-details").replaceChildren(); byId("common-matches").replaceChildren();
  byId("result-summary").textContent = ""; byId("export-status").textContent = "";
  sync();
}
function sync() {
  add.disabled = slots.length >= 6;
  compare.disabled = slots.length < 2 || slots.some((slot) => slot.pending || !slot.accepted);
  download.disabled = currentResult === null; printButton.disabled = currentResult === null;
  slots.forEach((slot, index) => {
    slot.legend.textContent = "Source " + (index + 1);
    slot.label.textContent = "Saved week for source " + (index + 1);
    slot.clear.setAttribute("aria-label", "Clear source " + (index + 1));
    slot.remove.setAttribute("aria-label", "Remove source " + (index + 1));
    slot.clear.disabled = !slot.accepted && !slot.pending;
    slot.remove.disabled = slots.length <= 2;
  });
}
function available(slot, generation) {
  return slots.includes(slot) && slot.generation === generation;
}
function updateAcceptedLabel(slot) {
  slot.acceptedLabel.textContent = slot.accepted
    ? "Accepted file: " + slot.accepted.label : "No accepted file.";
}
function clearSlot(slot) {
  slot.generation += 1; slot.pending = false; slot.accepted = null;
  slot.input.value = ""; slot.state.textContent = "Source cleared.";
  slot.state.classList.remove("error"); updateAcceptedLabel(slot);
  retireResult(); status.textContent = "Choose a saved week for every source, then compare.";
}
function removeSlot(slot) {
  if (slots.length <= 2) return;
  const index = slots.indexOf(slot);
  slot.generation += 1; slots.splice(index, 1); slot.field.remove();
  retireResult(); status.textContent = "Source removed. Compare the remaining accepted weeks again.";
  (slots[Math.min(index, slots.length - 1)]?.input || add).focus();
}
async function choose(slot) {
  const file = slot.input.files?.[0];
  if (!file) return;
  const generation = ++slot.generation;
  slot.pending = true; slot.state.classList.remove("error");
  slot.state.textContent = "Reading selected file…";
  retireResult(); status.textContent = "Reading a replacement. The previous comparison is retired.";
  try {
    if (file.size > 2 * 1024 * 1024) throw new RangeError("The selected file exceeds 2 MiB.");
    const bytes = await file.arrayBuffer();
    if (!available(slot, generation)) return;
    if (bytes.byteLength > 2 * 1024 * 1024) throw new RangeError("The selected file exceeds 2 MiB.");
    // Retain a BOM for the unchanged codec to admit; malformed UTF-8 never repairs silently.
    const text = new TextDecoder("utf-8", {fatal: true, ignoreBOM: true}).decode(bytes);
    const entry = {label: file.name, text};
    const {snapshot} = readSuggestionSource(entry);
    if (!available(slot, generation)) return;
    slot.accepted = entry; slot.pending = false; slot.input.value = "";
    updateAcceptedLabel(slot);
    slot.state.textContent = snapshot.state.picks.length + " original picks · week of "
      + snapshot.state.weekStart + " · " + snapshot.state.sourceMode;
    status.textContent = "Review the accepted files, then choose Compare loaded weeks.";
  } catch (error) {
    if (!available(slot, generation)) return;
    slot.pending = false; slot.input.value = "";
    slot.state.classList.add("error");
    slot.state.textContent = "Could not open that file: " + message(error)
      + (slot.accepted ? " The previous accepted file remains in this source." : " Choose another saved week.");
    status.textContent = "A file was refused. Accepted inputs remain visible; compare again when ready.";
  }
  sync();
}
function addSlot(focus = false) {
  if (slots.length >= 6) return;
  const id = "saved-source-" + (++nextId);
  const slot = {generation: 0, pending: false, accepted: null};
  slot.field = element("fieldset"); slot.legend = element("legend");
  slot.label = element("label"); slot.label.htmlFor = id;
  slot.input = element("input"); slot.input.id = id; slot.input.type = "file";
  slot.input.accept = ".json,application/json"; slot.input.setAttribute("aria-describedby", "limits");
  slot.input.addEventListener("change", () => { void choose(slot); });
  slot.acceptedLabel = element("p", "No accepted file.", "accepted-file literal");
  slot.state = element("p", "Choose a saved-week JSON file.", "slot-state literal");
  slot.state.setAttribute("role", "status"); slot.state.setAttribute("aria-live", "polite");
  slot.clear = button("Clear", () => clearSlot(slot));
  slot.remove = button("Remove", () => removeSlot(slot));
  const actions = element("div", undefined, "actions"); actions.append(slot.clear, slot.remove);
  slot.field.append(slot.legend, slot.label, slot.input, slot.acceptedLabel, slot.state, actions);
  slots.push(slot); host.append(slot.field); retireResult(); sync();
  if (focus) { status.textContent = "Source added. Choose its saved week before comparing."; slot.input.focus(); }
}
function sourceCard(source) {
  const {snapshot, index, label} = source;
  const card = element("section", undefined, "source-card");
  card.append(element("h4", "Source " + (index + 1) + " · " + label, "literal"));
  const facts = element("dl");
  row(facts, "Displayed week", snapshot.state.weekStart);
  row(facts, "Recorded source mode", snapshot.state.sourceMode);
  row(facts, "Received timestamp", snapshot.receivedAt);
  row(facts, "Saved timestamp", snapshot.savedAt);
  row(facts, "Original picks", snapshot.state.picks.length);
  row(facts, "Calendar identity", snapshot.calendarId === null ? "Not recorded" : snapshot.calendarId);
  card.append(facts, element("h4", "Original inputs and constraints"),
    element("pre", JSON.stringify(snapshot.inputs, null, 2)));
  card.append(element("h4", "Original plan notes"));
  if (snapshot.response.plan.notes.length) {
    const notes = element("ul", undefined, "notes");
    snapshot.response.plan.notes.forEach((note) => notes.append(element("li", note)));
    card.append(notes);
  } else card.append(element("p", "No plan notes recorded.", "context"));
  const modelMessage = snapshot.response.model_message;
  if (typeof modelMessage === "string" && modelMessage.length > 0) {
    card.append(element("h4", "Recorded model message"), element("p", modelMessage, "literal"));
  }
  return card;
}
function matchCard(match, sources) {
  const card = element("section", undefined, "match-card");
  card.append(element("h4", match.kind), element("p", match.entityId, "identity"));
  const occurrences = element("ol", undefined, "occurrences");
  for (const occurrence of match.occurrences) {
    const item = element("li"), source = sources[occurrence.sourceIndex];
    item.append(element("h4", "Source " + (source.index + 1) + " · " + occurrence.key, "occurrence-title"));
    item.append(element("p", source.label, "context literal"));
    const facts = element("dl");
    row(facts, "Recorded name", occurrence.pick.name);
    row(facts, "Original explanation", occurrence.pick.why);
    row(facts, "Originally suggested day", occurrence.originalDay);
    row(facts, "Current arrangement", occurrence.date === null
      ? "Kept off the displayed week" : occurrence.day + " · " + occurrence.date);
    row(facts, "Recorded affinity", occurrence.pick.affinity == null ? "Not recorded" : occurrence.pick.affinity);
    row(facts, "Widened / fallback pick", occurrence.pick.fallback === undefined
      ? "Not recorded" : occurrence.pick.fallback ? "Yes" : "No");
    item.append(facts); occurrences.append(item);
  }
  card.append(occurrences); return card;
}
compare.addEventListener("click", () => {
  if (compare.disabled) return;
  retireResult();
  try {
    const result = compareSavedSuggestions(slots.map((slot) => slot.accepted));
    const sourceFragment = document.createDocumentFragment(), matchFragment = document.createDocumentFragment();
    result.sources.forEach((source) => sourceFragment.append(sourceCard(source)));
    result.matches.forEach((match) => matchFragment.append(matchCard(match, result.sources)));
    if (!result.matches.length) {
      matchFragment.append(element("p",
        "No common saved suggestions: no exact kind and entity ID occurs in every chosen source.",
        "empty-result"));
    }
    byId("source-details").replaceChildren(sourceFragment);
    byId("common-matches").replaceChildren(matchFragment);
    byId("result-summary").textContent = result.counts.commonIdentities + " common recorded identities across "
      + result.counts.sources + " sources · " + result.counts.occurrences + " original occurrences retained.";
    currentResult = result; resultPanel.hidden = false;
    status.textContent = "Comparison ready. Original source checks have not been rerun.";
  } catch (error) { status.textContent = "Comparison could not be prepared: " + message(error); }
  sync();
});
download.addEventListener("click", () => {
  if (!currentResult) return;
  let url;
  try {
    const bytes = JSON.stringify(currentResult, null, 2) + "\n";
    url = URL.createObjectURL(new Blob([bytes], {type: "application/json;charset=utf-8"}));
    const link = element("a"); link.href = url; link.download = "tastetable-common-suggestions.json";
    document.body.append(link);
    try { link.click(); } finally { link.remove(); }
    byId("export-status").textContent = "Comparison JSON download requested. Keep the original saved weeks for editing.";
  } catch (error) {
    byId("export-status").textContent = "Download could not be prepared: " + message(error) + " You can retry.";
  } finally { if (url) setTimeout(() => URL.revokeObjectURL(url), 1000); }
});
printButton.addEventListener("click", () => {
  if (!currentResult) return;
  try { window.print(); }
  catch (error) { byId("export-status").textContent = "Printing could not start: " + message(error); }
});
add.addEventListener("click", () => addSlot(true));
addSlot(); addSlot(); sync();
