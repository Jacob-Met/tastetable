/** One explicit local file for an arranged week and its source-bound venue notes. */
import { makeWeekFile, readWeekFile } from "./week_file.mjs";
import { makeVenueNoteFile, readVenueNoteFile } from "./venue_note_file.mjs";
import { CONTACT_STATES, createVenueFollowup } from "./venue_followup.mjs";
import { offWeekPicks, weekRows } from "./week_plan.mjs";

export const CAREGIVER_HANDOFF_FORMAT = "tastetable.caregiver-handoff.v1";
export const CAREGIVER_HANDOFF_BYTE_LIMIT = 6 * 1024 * 1024;
const bytes = (text) => new TextEncoder().encode(text).byteLength;
const exact = (value, names) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === names.length && names.every((name) => Object.hasOwn(value, name));
const json = (value) => JSON.stringify(value, null, 2) + "\n";
function requireValue(condition, message) { if (!condition) throw new TypeError(message); }

/** Both native sections and their full source binding are admitted in isolation. */
export function readCaregiverHandoff(text) {
  requireValue(typeof text === "string" && bytes(text) <= CAREGIVER_HANDOFF_BYTE_LIMIT,
    "Choose a caregiver handoff JSON file no larger than 6 MiB.");
  let envelope;
  try { envelope = JSON.parse(text.replace(/^\uFEFF/, "")); }
  catch { throw new TypeError("The caregiver handoff file is not valid JSON."); }
  requireValue(exact(envelope, ["format", "savedAt", "week", "venueNotes"])
    && envelope.format === CAREGIVER_HANDOFF_FORMAT,
  "Choose a TasteTable caregiver-handoff file in the supported v1 format.");
  requireValue(typeof envelope.savedAt === "string" && Number.isFinite(new Date(envelope.savedAt).getTime())
    && new Date(envelope.savedAt).toISOString() === envelope.savedAt,
  "The caregiver handoff has an invalid saved timestamp.");
  const opened = readWeekFile(json(envelope.week));
  const origin = { response: opened.response, inputs: opened.inputs,
    receivedAt: opened.receivedAt, calendarId: opened.calendarId };
  const savedSource = `Saved caregiver handoff (saved ${envelope.savedAt}). Source labels and checks are retained from the file; they have not been run again.`;
  const model = createVenueFollowup(opened.state, savedSource);
  const notes = readVenueNoteFile(json(envelope.venueNotes), { origin, state: opened.state, model });
  model.replaceRecords(notes.records);
  return Object.freeze({ ...opened, origin, model, records: notes.records,
    handoffSavedAt: envelope.savedAt, notesSavedAt: notes.savedAt });
}

export function makeCaregiverHandoff(context, now = new Date()) {
  const envelope = { format: CAREGIVER_HANDOFF_FORMAT, savedAt: now.toISOString(),
    week: JSON.parse(makeWeekFile({ ...context.origin, state: context.state }, now).text),
    venueNotes: JSON.parse(makeVenueNoteFile(context, now).text) };
  const text = json(envelope);
  readCaregiverHandoff(text);
  return { filename: `tastetable-caregiver-handoff-${context.state.weekStart}.json`, text };
}

/** File preparation is read-only. Only the explicit, still-current Apply calls accept. */
export function mountCaregiverHandoff(root, { current, prepare, accept }) {
  const save = root.querySelector("[data-handoff-save]");
  const open = root.querySelector("[data-handoff-open]");
  const input = root.querySelector("[data-handoff-input]");
  const preview = root.querySelector("[data-handoff-preview]");
  const description = root.querySelector("[data-handoff-description]");
  const source = root.querySelector("[data-handoff-source]");
  const visits = root.querySelector("[data-handoff-visits]");
  const records = root.querySelector("[data-handoff-records]");
  const apply = root.querySelector("[data-handoff-apply]");
  const cancel = root.querySelector("[data-handoff-cancel]");
  const status = root.querySelector("[data-handoff-status]");
  let revision = 0, pending = null, reading = false;

  function discard(message = "") {
    revision += 1;
    pending = null;
    reading = false;
    cancel.hidden = true;
    preview.hidden = true;
    apply.disabled = true;
    description.textContent = source.textContent = "";
    visits.replaceChildren();
    records.replaceChildren();
    status.textContent = message;
  }
  function refresh() {
    try { const context = current(); context.model.entries(context.state); save.disabled = false; }
    catch { save.disabled = true; }
  }
  function changed() {
    const wasPending = reading || pending !== null || !preview.hidden;
    discard(wasPending ? "The week, inputs or notes changed. Open the handoff again to review it against your current work." : "");
    refresh();
  }
  function snapshot() {
    try { return current(); } catch { return null; }
  }
  function sameCurrent(before) {
    const after = snapshot();
    return before === null ? after === null : after !== null
      && before.origin === after.origin && before.state === after.state && before.model === after.model;
  }
  function showReview(opened, filename) {
    const scheduled = weekRows(opened.state).flatMap((row) =>
      row.picks.map((item) => ({ ...item, date: row.date, day: row.day })));
    const omitted = offWeekPicks(opened.state);
    const matching = opened.records.filter((record) =>
      scheduled.some((item) => item.key === record.key && item.date === record.date)).length;
    description.textContent = `“${filename}” — week beginning ${opened.state.weekStart}. ${scheduled.length} scheduled picks; ${omitted.length} omitted picks. ${opened.records.length} recorded visit/date notes: ${matching} match scheduled visits and ${opened.records.length - matching} are for other dates or omitted visits.`;
    const sourceLabels = {
      mock: "Demo plan: fictional venues from synthetic source data.",
      live: "Plan returned by Qloo. Venue details and availability need confirmation.",
      unknown: "The response did not specify its data source.",
    };
    source.textContent = [
      sourceLabels[opened.state.sourceMode],
      `Handoff saved: ${opened.handoffSavedAt}`,
      `Week saved: ${opened.savedAt}; notes saved: ${opened.notesSavedAt}`,
      `Original plan received: ${opened.receivedAt}`,
      "Original inputs: " + JSON.stringify(opened.inputs),
      "Source labels, explanations and checks come from the file and have not been run again.",
      "Caregiver-entered notes do not establish a reservation or verified venue facts.",
    ].join("\n");
    for (const item of [...scheduled, ...omitted.map((pick) => ({ ...pick, date: null }))]) {
      const row = document.createElement("li");
      row.textContent = `${item.date ? item.day + " " + item.date : "Omitted"} — suggested visit ${opened.state.picks.findIndex((pick) => pick.key === item.key) + 1}: ${item.pick.name}. Qloo id: ${item.pick.entity_id}. Original explanation: ${item.pick.why}`;
      visits.append(row);
    }
    for (const record of opened.records) {
      const item = opened.state.picks.find((pick) => pick.key === record.key);
      const row = document.createElement("li");
      const heading = document.createElement("h4");
      heading.textContent = `Suggested visit ${opened.state.picks.indexOf(item) + 1}: ${item.pick.name} — ${record.date}`;
      const text = document.createElement("pre");
      text.textContent = [
        "Caregiver contact status: " + CONTACT_STATES[record.note.status],
        "Questions: " + (record.note.question === null ? "(Original suggested questions for this visit/date.)" : record.note.question),
        "Questions for the recorded reply: " + (record.note.replyQuestions ?? "(No recorded reply.)"),
        "Venue reply / your notes: " + record.note.reply,
        "Next step: " + record.note.nextStep,
      ].join("\n");
      row.append(heading, text);
      records.append(row);
    }
    if (!opened.records.length) {
      const row = document.createElement("li");
      row.textContent = "This handoff has no recorded notes. Replace will clear all current venue notes.";
      records.append(row);
    }
    reading = false;
    preview.hidden = false;
    cancel.hidden = false;
    cancel.textContent = "Cancel replacement";
    apply.disabled = false;
    status.textContent = "Review the complete handoff. Replace week and notes will replace your current inputs, arrangement and complete note set."
      + (opened.records.length ? "" : " This handoff has no recorded notes; Replace will clear current venue notes.");
    description.focus();
  }

  open.addEventListener("click", () => {
    discard();
    input.value = "";
    input.click();
  });
  input.addEventListener("cancel", () => {
    discard("Opening cancelled. Your current week, inputs and notes are unchanged.");
    refresh();
  });
  input.addEventListener("change", async () => {
    const file = input.files[0];
    discard();
    if (!file) { refresh(); return; }
    const ticket = revision, before = snapshot();
    reading = true;
    cancel.hidden = false;
    cancel.textContent = "Cancel opening";
    status.textContent = "Reading the caregiver handoff for review…";
    try {
      requireValue(file.size <= CAREGIVER_HANDOFF_BYTE_LIMIT,
        "Choose a caregiver handoff JSON file no larger than 6 MiB.");
      const buffer = await file.arrayBuffer();
      if (ticket !== revision || !sameCurrent(before)) return;
      requireValue(buffer.byteLength <= CAREGIVER_HANDOFF_BYTE_LIMIT,
        "Choose a caregiver handoff JSON file no larger than 6 MiB.");
      let text;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
      catch { throw new TypeError("The caregiver handoff file must be valid UTF-8."); }
      const opened = readCaregiverHandoff(text);
      const prepared = prepare(opened, file.name);
      if (ticket !== revision || !sameCurrent(before)) return;
      pending = { ticket, before, prepared };
      showReview(opened, file.name);
    } catch (error) {
      if (ticket !== revision || !sameCurrent(before)) return;
      discard("The caregiver handoff could not be opened: " + error.message + " Your current week, inputs and notes are unchanged.");
    }
    refresh();
  });
  cancel.addEventListener("click", () => {
    discard("Replacement cancelled. Your current week, inputs and notes are unchanged.");
    refresh();
    open.focus();
  });
  apply.addEventListener("click", () => {
    const selected = pending;
    if (!selected || selected.ticket !== revision || !sameCurrent(selected.before)) {
      changed();
      return;
    }
    // All parsing, binding, worksheet preparation and response-view preparation
    // have completed. No asynchronous work occurs between this guard and accept.
    discard();
    accept(selected.prepared);
    refresh();
    status.textContent = "Caregiver handoff opened. Original inputs, arrangement and the complete venue-note set are restored.";
  });
  save.addEventListener("click", () => {
    let url, link;
    try {
      const output = makeCaregiverHandoff(current());
      url = URL.createObjectURL(new Blob([output.text], { type: "application/json;charset=utf-8" }));
      link = document.createElement("a");
      link.href = url;
      link.download = output.filename;
      document.body.append(link);
      link.click();
      status.textContent = "Caregiver handoff prepared. Keep this file to reopen the arranged week and all its venue notes together.";
    } catch (error) {
      status.textContent = "The caregiver handoff could not be prepared: " + error.message;
    } finally {
      link?.remove();
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
      refresh();
    }
  });
  refresh();
  return Object.freeze({ changed, refresh });
}
