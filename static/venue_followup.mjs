/** A caregiver's visit notes. No venue contact, recommendation or storage calls. */
import { calendarWeek, setWeek, weekRows } from "./week_plan.mjs";
import { mountVenueNoteFiles } from "./venue_note_file.mjs";

export const CONTACT_STATES = Object.freeze({
  not_contacted: "Not contacted",
  awaiting_reply: "Awaiting reply",
  reply_recorded: "Reply recorded",
  follow_up: "Needs follow-up",
});

const EMPTY_NOTE = Object.freeze({ status: "not_contacted", question: null, reply: "", replyQuestions: null, nextStep: "" });
const QUESTIONS = Object.freeze({
  soft_foods: "Which soft-food options could you prepare? Confirm the required texture with the care team.",
  low_sodium: "Can the kitchen prepare a lower-salt option, and how would it be prepared?",
  wheelchair: "Is there step-free access to the entrance, seating and facilities needed for this visit?",
});
const SOURCES = Object.freeze({
  mock: "Demo plan: fictional venues and synthetic source data. Use this sheet to practise the workflow.",
  live: "Plan returned by Qloo. Venue details and availability still need confirmation.",
  unknown: "The response did not specify its data source. Establish the venue's identity before using this plan.",
});
const NOTE_LIMITS = Object.freeze({ question: 2000, reply: 2000, nextStep: 500 });
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const indent = (value) => String(value).split(/\r?\n/).map((line) => `  ${line}`).join("\n");

/** Bind notes to the accepted source, pick occurrence and exact scheduled date. */
export function createVenueFollowup(initial, savedSource = "") {
  if (typeof savedSource !== "string") throw new TypeError("The saved-source label must be text.");
  const source = initial.sourcePlan;
  const picks = initial.picks;
  const constraints = initial.constraints;
  const sourceMode = initial.sourceMode;
  const sourceLabel = [SOURCES[sourceMode], savedSource].filter(Boolean).join("\n");
  let records = new Map();

  function suggestedQuestions(pick, date) {
    return [
      `Will you be open on ${date}, and do we need to book?`,
      ...constraints.filter((constraint) => QUESTIONS[constraint]
        && (pick.kind === "restaurant" || constraint === "wheelchair")).map((constraint) => QUESTIONS[constraint]),
    ];
  }

  function entries(state) {
    if (state?.sourcePlan !== source || state.picks !== picks || state.constraints !== constraints || state.sourceMode !== sourceMode) {
      throw new Error("This worksheet belongs to a different accepted plan.");
    }
    return weekRows(state).flatMap(({ day, date, picks: scheduled }) => scheduled.map(({ key, pick }) => {
      const questionsForVisit = suggestedQuestions(pick, date);
      const note = records.get(JSON.stringify([key, date])) || EMPTY_NOTE;
      const questionText = note.question ?? questionsForVisit.join("\n");
      return {
        key, day, date, pick, occurrence: picks.findIndex((item) => item.key === key) + 1,
        questionText, questions: questionText.split(/\r?\n/).filter((line) => line.trim()), note,
        questionsChangedAfterReply: Boolean(note.reply.trim() && note.replyQuestions !== questionText),
      };
    }));
  }

  function setField(state, key, date, field, value) {
    const entry = entries(state).find((item) => item.key === key && item.date === date);
    if (!entry) throw new Error("That visit is no longer scheduled on this date.");
    if (typeof value !== "string") throw new TypeError("Enter a text value for the venue note.");
    if (field === "status") {
      if (!Object.hasOwn(CONTACT_STATES, value)) throw new RangeError("Choose a listed contact status.");
      if (value === "reply_recorded" && entry.questionsChangedAfterReply) {
        throw new Error("Update the reply for the revised questions before marking a reply recorded.");
      }
    } else if (!Object.hasOwn(NOTE_LIMITS, field) || value.length > NOTE_LIMITS[field]) {
      throw new RangeError("The venue note field is unknown or too long.");
    }
    const updated = { ...entry.note, [field]: value };
    if (field === "reply") updated.replyQuestions = value.trim() ? entry.questionText : null;
    if (field === "question" && value !== entry.questionText && updated.reply.trim() && updated.replyQuestions !== value) {
      updated.status = "follow_up";
    }
    const note = Object.freeze(updated);
    records.set(JSON.stringify([key, date]), note);
    return note;
  }

  function text(state) {
    const visits = entries(state);
    if (!visits.length) throw new Error("Schedule at least one pick to prepare a call sheet.");
    const lines = [
      "TasteTable — venue call sheet", `Week beginning ${state.weekStart}`, sourceLabel,
      "Caregiver-entered notes. A recorded reply is not a safety check, reservation or confirmation by TasteTable.",
      "Confirm venue details and care needs before going. Do not include names or private health information.",
      "Notes apply to the pick occurrence and date shown. Later edits do not update this copy.", "",
    ];
    for (const entry of visits) {
      lines.push(`${entry.day} ${entry.date} — ${entry.pick.name}`,
        `Suggested visit ${entry.occurrence}; Qloo entity: ${entry.pick.entity_id}`,
        "Original plan explanation (heuristic):", indent(entry.pick.why), "Questions to ask:",
        ...(entry.questions.length ? entry.questions.map((question) => `  • ${question}`) : ["  No questions entered."]),
        `Caregiver contact status: ${CONTACT_STATES[entry.note.status]}`,
        ...(entry.questionsChangedAfterReply ? [
          "Questions changed after these notes were entered. Follow up on the revised questions.",
          "Questions for the earlier reply / notes:", indent(entry.note.replyQuestions),
          "Earlier reply / notes (for the previous questions):",
        ] : ["Venue reply / your notes:"]), indent(entry.note.reply || "No reply details entered."),
        "Next step:", indent(entry.note.nextStep || "No next step recorded."), "");
    }
    return lines.join("\n");
  }


  /** Copy every retained occurrence/date record, including visits currently omitted. */
  function snapshotRecords() {
    return Object.freeze([...records].map(([identity, note]) => {
      const [key, date] = JSON.parse(identity);
      return Object.freeze({ key, date, note: Object.freeze({ ...note }) });
    }));
  }

  /** Validate a complete replacement without changing any live note. */
  function prepareRecords(rows) {
    if (!Array.isArray(rows)) throw new TypeError("The notes file must contain a list of visit records.");
    const seen = new Set();
    const fields = ["status", "question", "reply", "replyQuestions", "nextStep"];
    const exact = (value, names) => value !== null && typeof value === "object" && !Array.isArray(value)
      && Object.keys(value).length === names.length && names.every((name) => Object.hasOwn(value, name));
    return Object.freeze(rows.map((row) => {
      if (!exact(row, ["key", "date", "note"])) throw new TypeError("A venue record has unsupported fields.");
      const item = picks.find(({ key }) => key === row.key);
      if (!item || typeof row.date !== "string" || !calendarWeek(row.date).some(({ date }) => date === row.date)) {
        throw new TypeError("A venue record has an unknown pick or invalid date.");
      }
      const identity = JSON.stringify([row.key, row.date]);
      if (seen.has(identity)) throw new TypeError("The notes file repeats a pick and date.");
      seen.add(identity);
      const note = row.note;
      if (!exact(note, fields) || typeof note.status !== "string" || !Object.hasOwn(CONTACT_STATES, note.status)
          || (note.question !== null && (typeof note.question !== "string" || note.question.length > NOTE_LIMITS.question))
          || typeof note.reply !== "string" || note.reply.length > NOTE_LIMITS.reply
          || typeof note.nextStep !== "string" || note.nextStep.length > NOTE_LIMITS.nextStep
          || (note.replyQuestions !== null && (typeof note.replyQuestions !== "string" || note.replyQuestions.length > NOTE_LIMITS.question))) {
        throw new TypeError("A venue note has an unsupported status, field type or length.");
      }
      const hasReply = Boolean(note.reply.trim());
      const questionText = note.question ?? suggestedQuestions(item.pick, row.date).join("\n");
      if (hasReply !== (note.replyQuestions !== null)
          || (hasReply && note.replyQuestions !== questionText && note.status === "reply_recorded")) {
        throw new TypeError("A venue note has an inconsistent reply and question history.");
      }
      return Object.freeze({ key: row.key, date: row.date, note: Object.freeze({ ...note }) });
    }));
  }

  function replaceRecords(rows) {
    const prepared = prepareRecords(rows);
    const replacement = new Map(prepared.map(({ key, date, note }) => [JSON.stringify([key, date]), note]));
    records = replacement;
  }

  return Object.freeze({ entries, setField, text, sourceLabel, snapshotRecords, prepareRecords, replaceRecords });
}

/** Own only this section; the existing app owns plan acceptance and retirement. */
export function mountVenueFollowup(root, current, onChange = () => {}) {
  const list = root.querySelector("[data-contact-list]");
  const summary = root.querySelector("[data-contact-summary]");
  const status = root.querySelector("[data-contact-status]");
  const source = root.querySelector("[data-contact-source]");
  const download = root.querySelector("[data-contact-download]");
  let session = null;
  const noteFiles = mountVenueNoteFiles(root, () => ({
    state: currentState(), origin: current().origin, model: session,
  }), sync, CONTACT_STATES);

  function currentState() {
    const { state, date } = current();
    if (!session || !state) throw new Error("Generate a plan before preparing venue notes.");
    if (setWeek(state, date).weekStart !== state.weekStart) {
      throw new Error("Choose a date in the displayed week before using venue notes.");
    }
    return state;
  }

  function updateSummary(state) {
    const entries = session.entries(state);
    const count = (value) => entries.filter((entry) => entry.note.status === value).length;
    summary.textContent = `${entries.length} scheduled visits · ${count("not_contacted")} not contacted · ${count("awaiting_reply")} awaiting reply · ${count("reply_recorded")} replies recorded · ${count("follow_up")} need follow-up.`;
  }

  function notePrint({ note, questionsChangedAfterReply }) {
    return `<dl class="contact-print-note">
      <dt>Caregiver contact status</dt><dd data-contact-print="status">${esc(CONTACT_STATES[note.status])}</dd>
      <dt data-contact-reply-label>${questionsChangedAfterReply ? "Earlier reply / notes (for the previous questions)" : "Venue reply / your notes"}</dt><dd data-contact-print="reply">${esc(note.reply || "No reply details entered.")}</dd>
      <dt>Next step</dt><dd data-contact-print="nextStep">${esc(note.nextStep || "No next step recorded.")}</dd>
    </dl>`;
  }

  function sync() {
    noteFiles.changed();
    onChange();
    if (!session) return;
    root.hidden = false;
    download.disabled = true;
    status.textContent = "";
    try {
      const state = currentState();
      const visits = session.entries(state);
      source.textContent = session.sourceLabel;
      list.hidden = false;
      list.innerHTML = visits.map((entry) => {
        const { key, date, day, pick, occurrence, questions, questionsChangedAfterReply, note } = entry;
        return `<li class="contact-visit" data-contact-key="${esc(key)}" data-contact-date="${esc(date)}">
        <h4>${esc(pick.name)} <span>${esc(day)} <time datetime="${date}">${date}</time></span></h4>
        <p class="why mono">Suggested visit ${occurrence} · Qloo id: ${esc(pick.entity_id)}</p>
        <p class="why contact-explanation">Original plan explanation (heuristic): ${esc(pick.why)}</p>
        <h5>Questions to ask</h5><ul class="contact-questions">${questions.length ? questions.map((question) => `<li>${esc(question)}</li>`).join("") : "<li>No questions entered.</li>"}</ul>
        <details class="contact-edit contact-question-editor">
          <summary>Edit questions for this visit</summary>
          <label>Questions for ${esc(pick.name)} on ${date}
            <textarea data-contact-field="question" rows="5" maxlength="${NOTE_LIMITS.question}"></textarea>
          </label>
        </details>
        <div class="contact-earlier-questions" data-contact-earlier${questionsChangedAfterReply ? "" : " hidden"}>
          <p>Questions changed after these notes were entered. Review the earlier notes before following up on the revised questions.</p>
          <h5>Questions for the earlier reply / notes</h5><p data-contact-reply-questions>${esc(note.replyQuestions)}</p>
        </div>
        <div class="contact-edit">
          <label>Contact status for ${esc(pick.name)} on ${date}
            <select data-contact-field="status">${Object.entries(CONTACT_STATES).map(([value, label]) => `<option value="${value}"${value === note.status ? " selected" : ""}>${label}</option>`).join("")}</select>
          </label>
          <label>Venue reply / your notes for ${esc(pick.name)} on ${date}
            <textarea data-contact-field="reply" rows="3" maxlength="${NOTE_LIMITS.reply}" placeholder="Record what the venue said and anything still unclear."></textarea>
          </label>
          <label>Next step for ${esc(pick.name)} on ${date}
            <textarea data-contact-field="nextStep" rows="2" maxlength="${NOTE_LIMITS.nextStep}" placeholder="For example: ask about the entrance before deciding to go."></textarea>
          </label>
        </div>${notePrint(entry)}
      </li>`;
      }).join("");
      // Set values after parsing: HTML strips a leading LF inside <textarea>.
      visits.forEach((entry, index) => {
        const visit = list.children[index];
        visit.querySelector('[data-contact-field="question"]').value = entry.questionText;
        visit.querySelector('[data-contact-field="reply"]').value = entry.note.reply;
        visit.querySelector('[data-contact-field="nextStep"]').value = entry.note.nextStep;
      });
      updateSummary(state);
      root.dataset.empty = String(visits.length === 0);
      download.disabled = visits.length === 0;
      if (!visits.length) status.textContent = "Schedule a suggested pick to prepare questions and venue notes.";
    } catch (error) {
      list.hidden = true;
      summary.textContent = "";
      status.textContent = `Venue worksheet unavailable: ${error.message}`;
    }
  }

  function edit(event) {
    const input = event.target.closest("[data-contact-field]");
    if (!input || !root.contains(input)) return;
    // Commit each native control once; the paired event must not erase a refusal.
    if (event.type !== (input.dataset.contactField === "status" ? "change" : "input")) return;
    const visit = input.closest("[data-contact-key]");
    noteFiles.changed();
    onChange();
    try {
      const state = currentState();
      const note = session.setField(state, visit.dataset.contactKey, visit.dataset.contactDate, input.dataset.contactField, input.value);
      const entry = session.entries(state).find((item) => item.key === visit.dataset.contactKey);
      visit.querySelector('[data-contact-field="status"]').value = note.status;
      visit.querySelector(".contact-questions").innerHTML = entry.questions.length
        ? entry.questions.map((question) => `<li>${esc(question)}</li>`).join("") : "<li>No questions entered.</li>";
      visit.querySelector("[data-contact-earlier]").hidden = !entry.questionsChangedAfterReply;
      visit.querySelector("[data-contact-reply-questions]").textContent = note.replyQuestions || "";
      visit.querySelector("[data-contact-reply-label]").textContent = entry.questionsChangedAfterReply
        ? "Earlier reply / notes (for the previous questions)" : "Venue reply / your notes";
      for (const output of visit.querySelectorAll("[data-contact-print]")) {
        const field = output.dataset.contactPrint;
        output.textContent = field === "status" ? CONTACT_STATES[note.status]
          : note[field] || (field === "reply" ? "No reply details entered." : "No next step recorded.");
      }
      updateSummary(state);
      status.textContent = "Your note is available for this visit in this tab. Save venue notes to edit them later, or print/download a readable call sheet.";
      noteFiles.refresh();
    } catch (error) {
      if (input.dataset.contactField === "status" && session) {
        try {
          const entry = session.entries(currentState()).find((item) => item.key === visit.dataset.contactKey && item.date === visit.dataset.contactDate);
          if (entry) input.value = entry.note.status;
        } catch { /* A retired or moved visit cannot accept this edit. */ }
      }
      status.textContent = `Note not updated: ${error.message}`;
    }
  }

  root.addEventListener("input", edit);
  root.addEventListener("change", edit);
  download.addEventListener("click", () => {
    let url, link;
    try {
      const state = currentState();
      const content = session.text(state);
      url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
      link = document.createElement("a");
      link.href = url;
      link.download = `tastetable-venue-contacts-${state.weekStart}.txt`;
      document.body.append(link);
      link.click();
      status.textContent = "Call sheet prepared. This copy contains your notes and the visit dates shown; later edits do not update it.";
    } catch (error) {
      try {
        download.disabled = session.entries(currentState()).length === 0;
      } catch {
        download.disabled = true;
      }
      status.textContent = `Call sheet unavailable: ${error.message}`;
    } finally {
      link?.remove();
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });

  return Object.freeze({
    accept(state, savedSource = "") { noteFiles.retire(); session = createVenueFollowup(state, savedSource); sync(); },
    snapshot() {
      const state = currentState();
      const origin = current().origin;
      if (!origin) throw new Error("Open or generate a plan before saving a caregiver handoff.");
      session.entries(state);
      return { state, origin, model: session };
    },
    acceptPrepared(state, model) {
      model.entries(state);
      noteFiles.retire();
      session = model;
      sync();
    },
    sync,
    retire() {
      session = null;
      noteFiles.retire();
      root.hidden = true;
      list.replaceChildren();
      summary.textContent = source.textContent = status.textContent = "";
      download.disabled = true;
      onChange();
    },
  });
}
