/** Explicit companion files for an existing accepted plan's editable venue notes. */
import { makeWeekFile } from "./week_file.mjs";
import { compareVenueNotes } from "./venue_note_changes.mjs";

export const VENUE_NOTE_FORMAT = "tastetable.venue-notes.v1";
export const VENUE_NOTE_BYTE_LIMIT = 2 * 1024 * 1024;
export const VENUE_NOTE_RECORD_LIMIT = 256;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value, names) => object(value) && Object.keys(value).length === names.length
  && names.every((name) => Object.hasOwn(value, name));
const bytes = (text) => new TextEncoder().encode(text).byteLength;
function requireValue(condition, message) { if (!condition) throw new TypeError(message); }

function canonical(value, depth = 0) {
  requireValue(depth <= 64, "The notes file contains unsupported nesting.");
  if (Array.isArray(value)) return "[" + value.map((entry) => canonical(entry, depth + 1)).join(",") + "]";
  if (object(value)) return "{" + Object.keys(value).sort().map((key) =>
    JSON.stringify(key) + ":" + canonical(value[key], depth + 1)).join(",") + "}";
  requireValue(value === null || typeof value === "string" || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value)), "The notes file contains a value that is not finite JSON data.");
  return JSON.stringify(value);
}

function planOrigin({ origin, state, model }) {
  model.entries(state); // Retain the original model\'s accepted-plan identity guard.
  // Reuse the maintained complete response/input and immutable week admission.
  const saved = JSON.parse(makeWeekFile({ ...origin, state }).text);
  return { receivedAt: saved.receivedAt, calendarId: saved.calendarId, inputs: saved.inputs, response: saved.response };
}

function readEnvelope(value, context) {
  requireValue(exact(value, ["format", "savedAt", "origin", "records"]) && value.format === VENUE_NOTE_FORMAT,
    "Choose a TasteTable venue-notes file in the supported v1 format.");
  requireValue(typeof value.savedAt === "string" && Number.isFinite(new Date(value.savedAt).getTime())
    && new Date(value.savedAt).toISOString() === value.savedAt, "The notes file has an invalid saved timestamp.");
  requireValue(exact(value.origin, ["receivedAt", "calendarId", "inputs", "response"])
    && canonical(value.origin) === canonical(planOrigin(context)),
  "These notes belong to a different accepted plan. Open the original saved week first.");
  requireValue(Array.isArray(value.records) && value.records.length <= VENUE_NOTE_RECORD_LIMIT,
    "A notes file can contain at most 256 visit/date records.");
  return Object.freeze({ savedAt: value.savedAt, records: context.model.prepareRecords(value.records) });
}

export function makeVenueNoteFile(context, now = new Date()) {
  const envelope = { format: VENUE_NOTE_FORMAT, savedAt: now.toISOString(),
    origin: planOrigin(context), records: context.model.snapshotRecords() };
  readEnvelope(envelope, context);
  const text = JSON.stringify(envelope, null, 2) + "\n";
  requireValue(bytes(text) <= VENUE_NOTE_BYTE_LIMIT, "The complete notes file exceeds 2 MiB. Current notes are unchanged.");
  return { filename: `tastetable-venue-notes-${context.state.weekStart}.json`, text };
}

export function readVenueNoteFile(text, context) {
  requireValue(typeof text === "string" && bytes(text) <= VENUE_NOTE_BYTE_LIMIT,
    "Choose a venue-notes JSON file no larger than 2 MiB.");
  let envelope;
  try { envelope = JSON.parse(text.replace(/^\uFEFF/, "")); }
  catch { throw new TypeError("The venue-notes file is not valid JSON."); }
  return readEnvelope(envelope, context);
}

/** Own only file controls. The existing worksheet owns note rendering and edits. */
export function mountVenueNoteFiles(root, current, render, states) {
  const save = root.querySelector("[data-contact-file-save]");
  const open = root.querySelector("[data-contact-file-open]");
  const input = root.querySelector("[data-contact-file-input]");
  const preview = root.querySelector("[data-contact-file-preview]");
  const description = root.querySelector("[data-contact-file-description]");
  const list = root.querySelector("[data-contact-file-records]");
  const apply = root.querySelector("[data-contact-file-apply]");
  const cancel = root.querySelector("[data-contact-file-cancel]");
  const status = root.querySelector("[data-contact-file-status]");
  const source = root.querySelector("[data-contact-file-source]");
  let revision = 0, pending = null;

  function discard(message = "") {
    revision += 1;
    pending = null;
    preview.hidden = true;
    list.replaceChildren();
    description.textContent = "";
    apply.disabled = true;
    status.textContent = message;
  }
  function refresh() {
    let available = false;
    try { planOrigin(current()); available = true; } catch { /* The app controls plan/date admission. */ }
    save.disabled = open.disabled = !available;
  }
  function changed() {
    discard(pending ? "The plan or venue notes changed. Open the notes file again to review a new replacement." : "");
    refresh();
  }
  function contextStillCurrent(saved) {
    const next = current();
    requireValue(saved.revision === revision && next.model === saved.context.model
      && next.state === saved.context.state && next.origin === saved.context.origin,
    "The plan or venue notes changed. Open the notes file again.");
    return next;
  }
  function showFile(file, result, context, token) {
    const currentVisits = new Set(context.model.entries(context.state).map(({ key, date }) => JSON.stringify([key, date])));
    const visible = result.records.filter(({ key, date }) => currentVisits.has(JSON.stringify([key, date]))).length;
    const changes = compareVenueNotes(context.model.snapshotRecords(), result.records);
    const labels = { status: "Contact status", question: "Questions", reply: "Reply / notes",
      replyQuestions: "Questions associated with that reply", nextStep: "Next step" };
    const names = { added: "Add", removed: "Remove", changed: "Change", unchanged: "Keep unchanged" };
    description.textContent = `“${file.name}” — saved ${result.savedAt}. ${result.records.length} incoming visit/date records; ${visible} match visits currently scheduled, ${result.records.length - visible} are for other dates or omitted visits. Replacement: ${changes.counts.added} added, ${changes.counts.changed} changed, ${changes.counts.removed} removed, ${changes.counts.unchanged} unchanged. Replace all ${changes.currentCount} current records with this file? The plan and its arrangement stay as they are.`;
    function noteView(note, heading) {
      const section = document.createElement("section"), title = document.createElement("h6"), text = document.createElement("pre");
      title.textContent = heading;
      text.textContent = [
        `Contact status: ${states[note.status]}`,
        "Questions: " + (note.question === null ? "(Original suggested questions for this visit/date; no override.)"
          : note.question === "" ? "(No questions entered; explicit empty override.)" : note.question),
        "Reply / notes: " + (note.reply === "" ? "(No reply details entered.)" : note.reply),
        "Questions associated with that reply: " + (note.replyQuestions === null ? "(No earlier-question snapshot.)"
          : note.replyQuestions === "" ? "(An explicitly empty question snapshot.)" : note.replyQuestions),
        "Next step: " + (note.nextStep === "" ? "(No next step recorded.)" : note.nextStep),
      ].join("\n");
      section.append(title, text); return section;
    }
    for (const record of changes.records) {
      const pick = context.state.picks.find(({ key }) => key === record.key);
      const item = document.createElement("li"), title = document.createElement("h5"), detail = document.createElement("p");
      item.dataset.noteChange = record.change;
      title.textContent = `${names[record.change]} — ${record.date} — suggested visit ${context.state.picks.indexOf(pick) + 1}: ${pick.pick.name}`;
      detail.textContent = `Occurrence ${record.key}; ${currentVisits.has(JSON.stringify([record.key, record.date])) ? "currently scheduled on this date" : "other date or omitted visit"}.`;
      item.append(title, detail);
      if (record.change === "changed") {
        const fields = document.createElement("p");
        fields.textContent = "Changed fields: " + record.changedFields.map((field) => labels[field]).join(", ") + ".";
        item.append(fields, noteView(record.before, "Current notes — before replacement"), noteView(record.after, "Incoming notes — after replacement"));
      } else if (record.change === "removed") {
        item.append(noteView(record.before, "Current record will be removed; this file has no record for this occurrence/date."));
      } else {
        item.append(noteView(record.after, record.change === "added" ? "Incoming record will be added." : "Current and incoming notes are identical."));
      }
      list.append(item);
    }
    pending = { revision: token, context, result, filename: file.name };
    preview.hidden = false;
    apply.disabled = false;
    status.textContent = result.records.length ? "File checked. Review the records before replacing your notes."
      : "This file has no note records. Replace will clear your current notes.";
  }

  save.addEventListener("click", () => {
    let url, link;
    try {
      const output = makeVenueNoteFile(current());
      url = URL.createObjectURL(new Blob([output.text], { type: "application/json;charset=utf-8" }));
      link = document.createElement("a");
      link.href = url; link.download = output.filename;
      document.body.append(link); link.click();
      status.textContent = "Venue notes prepared. Keep this file with the matching saved week to resume editing later.";
    } catch (error) { status.textContent = "Venue notes could not be saved: " + error.message; }
    finally { link?.remove(); if (url) setTimeout(() => URL.revokeObjectURL(url), 1000); refresh(); }
  });
  open.addEventListener("click", () => {
    discard(); input.value = "";
    try { planOrigin(current()); input.click(); }
    catch (error) { status.textContent = "Venue notes unavailable: " + error.message; }
  });
  input.addEventListener("change", async () => {
    const file = input.files?.[0]; input.value = ""; discard();
    if (!file) return;
    const token = revision;
    let context;
    try {
      context = current();
      const captured = { revision: token, context };
      requireValue(file.size <= VENUE_NOTE_BYTE_LIMIT, "Choose a venue-notes file no larger than 2 MiB.");
      status.textContent = "Reading the selected notes file…";
      const buffer = await file.arrayBuffer();
      if (token !== revision) return;
      contextStillCurrent(captured);
      requireValue(buffer.byteLength <= VENUE_NOTE_BYTE_LIMIT, "Choose a venue-notes file no larger than 2 MiB.");
      let text;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
      catch { throw new TypeError("The venue-notes file must contain valid UTF-8 text."); }
      const result = readVenueNoteFile(text, context);
      contextStillCurrent(captured);
      showFile(file, result, context, token);
    } catch (error) {
      if (token === revision) { discard("Venue notes not opened: " + error.message); refresh(); }
    }
  });
  input.addEventListener("cancel", () => discard("No notes file chosen. Current notes are unchanged."));
  cancel.addEventListener("click", () => discard("Replacement cancelled. Current notes are unchanged."));
  apply.addEventListener("click", () => {
    if (!pending) return;
    const saved = pending;
    try {
      const context = contextStillCurrent(saved);
      context.model.replaceRecords(saved.result.records);
      discard();
      render();
      source.textContent = `Venue notes reopened from “${saved.filename}” (saved ${saved.result.savedAt}). These remain editable caregiver records; source checks have not been run again.`;
      source.hidden = false;
      status.textContent = "Venue notes replaced. Plan, dates and original checks are unchanged.";
    } catch (error) { discard("Venue notes not replaced: " + error.message); refresh(); }
  });
  return Object.freeze({ changed, refresh, retire() {
    discard(); input.value = ""; source.textContent = ""; source.hidden = true;
    save.disabled = open.disabled = true;
  } });
}
