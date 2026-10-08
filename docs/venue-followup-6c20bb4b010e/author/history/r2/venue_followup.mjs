/** A caregiver's visit notes. No venue contact, recommendation or storage calls. */
import { setWeek, weekRows } from "./week_plan.mjs";

export const CONTACT_STATES = Object.freeze({
  not_contacted: "Not contacted",
  awaiting_reply: "Awaiting reply",
  reply_recorded: "Reply recorded",
  follow_up: "Needs follow-up",
});

const EMPTY_NOTE = Object.freeze({ status: "not_contacted", reply: "", nextStep: "" });
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
const NOTE_LIMITS = Object.freeze({ reply: 2000, nextStep: 500 });
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
  const records = new Map();

  function entries(state) {
    if (state?.sourcePlan !== source || state.picks !== picks || state.constraints !== constraints || state.sourceMode !== sourceMode) {
      throw new Error("This worksheet belongs to a different accepted plan.");
    }
    return weekRows(state).flatMap(({ day, date, picks: scheduled }) => scheduled.map(({ key, pick }) => ({
      key, day, date, pick, occurrence: picks.findIndex((item) => item.key === key) + 1,
      questions: [
        `Will you be open on ${date}, and do we need to book?`,
        ...constraints.filter((constraint) => QUESTIONS[constraint]
          && (pick.kind === "restaurant" || constraint === "wheelchair")).map((constraint) => QUESTIONS[constraint]),
      ],
      note: records.get(JSON.stringify([key, date])) || EMPTY_NOTE,
    })));
  }

  function setField(state, key, date, field, value) {
    const entry = entries(state).find((item) => item.key === key && item.date === date);
    if (!entry) throw new Error("That visit is no longer scheduled on this date.");
    if (typeof value !== "string") throw new TypeError("Enter a text value for the venue note.");
    if (field === "status") {
      if (!Object.hasOwn(CONTACT_STATES, value)) throw new RangeError("Choose a listed contact status.");
    } else if (!Object.hasOwn(NOTE_LIMITS, field) || value.length > NOTE_LIMITS[field]) {
      throw new RangeError("The venue note field is unknown or too long.");
    }
    const note = Object.freeze({ ...entry.note, [field]: value });
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
        ...entry.questions.map((question) => `  • ${question}`),
        `Caregiver contact status: ${CONTACT_STATES[entry.note.status]}`,
        "Venue reply / your notes:", indent(entry.note.reply || "No reply recorded."),
        "Next step:", indent(entry.note.nextStep || "No next step recorded."), "");
    }
    return lines.join("\n");
  }

  return Object.freeze({ entries, setField, text, sourceLabel });
}

/** Own only this section; the existing app owns plan acceptance and retirement. */
export function mountVenueFollowup(root, current) {
  const list = root.querySelector("[data-contact-list]");
  const summary = root.querySelector("[data-contact-summary]");
  const status = root.querySelector("[data-contact-status]");
  const source = root.querySelector("[data-contact-source]");
  const download = root.querySelector("[data-contact-download]");
  let session = null;

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

  function notePrint(note) {
    return `<dl class="contact-print-note">
      <dt>Caregiver contact status</dt><dd data-contact-print="status">${esc(CONTACT_STATES[note.status])}</dd>
      <dt>Venue reply / your notes</dt><dd data-contact-print="reply">${esc(note.reply || "No reply recorded.")}</dd>
      <dt>Next step</dt><dd data-contact-print="nextStep">${esc(note.nextStep || "No next step recorded.")}</dd>
    </dl>`;
  }

  function sync() {
    if (!session) return;
    root.hidden = false;
    download.disabled = true;
    status.textContent = "";
    try {
      const state = currentState();
      const visits = session.entries(state);
      source.textContent = session.sourceLabel;
      list.hidden = false;
      list.innerHTML = visits.map(({ key, date, day, pick, occurrence, questions, note }) => `<li class="contact-visit" data-contact-key="${esc(key)}" data-contact-date="${esc(date)}">
        <h4>${esc(pick.name)} <span>${esc(day)} <time datetime="${date}">${date}</time></span></h4>
        <p class="why mono">Suggested visit ${occurrence} · Qloo id: ${esc(pick.entity_id)}</p>
        <p class="why contact-explanation">Original plan explanation (heuristic): ${esc(pick.why)}</p>
        <h5>Questions to ask</h5><ul class="contact-questions">${questions.map((question) => `<li>${esc(question)}</li>`).join("")}</ul>
        <div class="contact-edit">
          <label>Contact status for ${esc(pick.name)} on ${date}
            <select data-contact-field="status">${Object.entries(CONTACT_STATES).map(([value, label]) => `<option value="${value}"${value === note.status ? " selected" : ""}>${label}</option>`).join("")}</select>
          </label>
          <label>Venue reply / your notes for ${esc(pick.name)} on ${date}
            <textarea data-contact-field="reply" rows="3" maxlength="${NOTE_LIMITS.reply}" placeholder="Record what the venue said and anything still unclear.">${esc(note.reply)}</textarea>
          </label>
          <label>Next step for ${esc(pick.name)} on ${date}
            <textarea data-contact-field="nextStep" rows="2" maxlength="${NOTE_LIMITS.nextStep}" placeholder="For example: ask about the entrance before deciding to go.">${esc(note.nextStep)}</textarea>
          </label>
        </div>${notePrint(note)}
      </li>`).join("");
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
    const visit = input.closest("[data-contact-key]");
    try {
      const state = currentState();
      const note = session.setField(state, visit.dataset.contactKey, visit.dataset.contactDate, input.dataset.contactField, input.value);
      for (const output of visit.querySelectorAll("[data-contact-print]")) {
        const field = output.dataset.contactPrint;
        output.textContent = field === "status" ? CONTACT_STATES[note.status]
          : note[field] || (field === "reply" ? "No reply recorded." : "No next step recorded.");
      }
      updateSummary(state);
      status.textContent = "Your note is available for this visit in this tab. Print the week or download the call sheet to keep a copy.";
    } catch (error) {
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
      download.disabled = true;
      status.textContent = `Call sheet unavailable: ${error.message}`;
    } finally {
      link?.remove();
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });

  return Object.freeze({
    accept(state, savedSource = "") { session = createVenueFollowup(state, savedSource); sync(); },
    sync,
    retire() {
      session = null;
      root.hidden = true;
      list.replaceChildren();
      summary.textContent = source.textContent = status.textContent = "";
      download.disabled = true;
    },
  });
}
