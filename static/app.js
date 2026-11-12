import { carePrompt, evidenceMarkup } from "./pick_evidence.mjs";
import { mountItineraryFollowup } from "./itinerary_followup.mjs";
import { mountVisitHistory } from "./visit_history.mjs";
import { DAYS, createWeekPlan, localDate, offWeekPicks, resetDays, setPickDay, setWeek, weekRows } from "./week_plan.mjs";
import { makeWeekFile, readWeekFile } from "./week_file.mjs";
import { mountVenueFollowup } from "./venue_followup.mjs";
import { mountCaregiverHandoff } from "./caregiver_handoff.mjs";
import { createSavedWeeksUI } from "./saved_week_ui.mjs";
import { openDraft } from "./saved_weeks.mjs";
import { canRedoArrangement, canUndoArrangement, createArrangementHistory, recordArrangement, redoArrangement, undoArrangement } from "./arrangement_history.mjs";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const byDay = (a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
const split = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
let personas = [];
let weekState = null;
let preferredWeekStart = null;
let weekDateInitialized = false;
let calendarSession = null;
let acceptedPlan = null;
let arrangementHistory = null;
let historyPlan = null;
let requestKind = "plan";
let savedWeeks = null;
const OPEN_SAVED_WEEK = Symbol("open saved week");
// The same handoff reader must be reachable before planning (to reopen a file)
// and beside the accepted week (to save it). Never duplicate its controls.
const handoffHome = document.createComment("caregiver handoff home");
$("#caregiverHandoff").before(handoffHome);
function placeHandoffWithWeek(active) {
  const handoff = $("#caregiverHandoff");
  if (active) {
    $("#weekTools").append(handoff);
    handoff.classList.add("handoff-in-week");
  } else {
    handoffHome.after(handoff);
    handoff.classList.remove("handoff-in-week");
  }
}
// Fragment navigation must reveal the actual existing controls, not a blank
// location inside a closed native disclosure.
document.querySelectorAll?.('.record-paths a')?.forEach((link) => {
  link.addEventListener('click', () => {
    if (link.hash === '#caregiverHandoff' && weekState) $("#weekTools").open = true;
    if (link.hash === '#savedWeekCollection') $("#savedWeekCollection").open = true;
  });
});
let caregiverHandoff = null;
let itineraryFollowup = null;
const venueFollowup = mountVenueFollowup($("#venueFollowup"), () => ({ state: weekState, date: $("#weekDate").value, origin: acceptedPlan }), () => {
  caregiverHandoff?.changed();
  // Notes notify before committing an input. Read their final state after this event,
  // without rerendering the form or disturbing the caregiver's typing.
  queueMicrotask(() => itineraryFollowup?.refresh());
});
itineraryFollowup = mountItineraryFollowup($("#weekOrganizer"), $("#venueFollowup"), () => venueFollowup.snapshot());
// Print still includes complete venue questions and replies, even when the
// editor is collapsed on screen. Return to its previous screen state afterward.
let venueWasOpenAtPrint = null;
window.addEventListener("beforeprint", () => {
  const editor = $("#venueFollowup");
  venueWasOpenAtPrint = editor.open;
  editor.open = true;
});
window.addEventListener("afterprint", () => {
  if (venueWasOpenAtPrint !== null) $("#venueFollowup").open = venueWasOpenAtPrint;
  venueWasOpenAtPrint = null;
});

// Enter the original private record picker from the decision itself. There is
// one importer, one review and one session-only history, not a second store.
let returnToWeekAfterHistory = false;
const historyRoot = $("#visitHistory");
const visitHistory = mountVisitHistory(historyRoot, () => {
  if (weekState) renderWeek();
  if (returnToWeekAfterHistory && weekState) {
    returnToWeekAfterHistory = false;
    $("#weekTitle").focus({ preventScroll: true });
    $("#weekTitle").scrollIntoView({ block: "start" });
  }
});
$("#weekHistoryOpen").addEventListener("click", () => {
  returnToWeekAfterHistory = true;
  historyRoot.open = true;
  historyRoot.scrollIntoView({ block: "start" });
  historyRoot.querySelector("[data-history-open]").click();
});
historyRoot.querySelector("[data-history-cancel]").addEventListener("click", () => {
  returnToWeekAfterHistory = false;
});

function newCalendarId() {
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  } catch { return null; } // Calendar support is optional; the week can still be saved.
}

const dateLabel = (date) => new Intl.DateTimeFormat(undefined, {
  year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
}).format(new Date(`${date}T12:00:00Z`));

function pickCard({ key, pick }, day, sourceMode, date = null, constraints = []) {
  const priorVisit = visitHistory.label(sourceMode, pick);
  return `<article class="scheduled-pick">
    <div class="pick-identity">
      <h4>${esc(pick.name)}</h4>
      <p class="pick-meta">${esc(pick.kind)}</p>
    </div>
    <label class="pick-control">Schedule
      <select data-pick-key="${key}" aria-label="Day for ${esc(pick.name)}">
        ${DAYS.map((value) => `<option value="${value}"${day === value ? " selected" : ""}>${value}</option>`).join("")}
        <option value=""${day === null ? " selected" : ""}>Keep off this week</option>
      </select>
    </label>
    ${priorVisit ? `<p class="prior-visit">${esc(priorVisit)}</p>` : ""}
    ${carePrompt(pick, constraints, esc)}
    ${date ? `<div class="itinerary-contact" data-itinerary-contact data-itinerary-key="${esc(key)}" data-itinerary-date="${esc(date)}" hidden></div>` : ""}
    <details class="pick-evidence" data-evidence-key="${key}">
      <summary aria-label="Why ${esc(pick.name)} was suggested and original checks">Why this pick · original checks</summary>
      ${evidenceMarkup(pick, esc)}
      ${pick.fallback ? '<p class="why">A wider search supplied this suggestion.</p>' : ''}
      ${typeof pick.affinity === "number" ? `<p class="why">Original taste affinity: ${esc(pick.affinity.toFixed(2))}</p>` : ''}
      <p class="why mono">Qloo id: ${esc(pick.entity_id)}</p>
    </details>
  </article>`;
}

// Prepare every response-dependent value before changing the displayed plan.
// A malformed successful response must not mix new source evidence with the
// previous week's local assignments.
function prepareWeekView(state, message = "") {
  const rows = weekRows(state);
  const omitted = offWeekPicks(state);
  const count = state.picks.length - omitted.length;
  const source = {
    mock: "Demo plan: fictional venues from a synthetic fixture.",
    live: "Plan returned by Qloo. Venue details and availability need confirmation.",
    unknown: "The response did not specify its data source.",
  }[state.sourceMode];
  const labels = { soft_foods: "soft foods", low_sodium: "low sodium", wheelchair: "wheelchair access" };
  const constraints = state.constraints.length
    ? `Requested constraints: ${state.constraints.map((value) => labels[value] || value).join(", ")}.`
    : "No constraints listed in the response.";
  const days = rows.map((row) => `<li class="week-day" data-day="${row.day}">
    <h3>${row.day} <time datetime="${row.date}">${esc(dateLabel(row.date))}</time></h3>
    ${row.picks.length ? row.picks.map((pick) => pickCard(pick, row.day, state.sourceMode, row.date, state.constraints)).join("") : '<p class="open-day">Open day <span>No pick scheduled.</span></p>'}
  </li>`).join("");
  return {
    text: {
      "#weekTitle": `Week of ${dateLabel(rows[0].date)}`,
      "#weekRange": `${dateLabel(rows[0].date)} – ${dateLabel(rows[6].date)}`,
      "#weekSummary": `${count} of ${state.picks.length} suggested picks scheduled. ${rows.filter((row) => !row.picks.length).length} open days.`,
      "#weekSource": source,
      "#weekConstraints": constraints,
      "#weekStatus": message,
    },
    html: {
      "#weekDays": days,
      "#omittedPicks": omitted.map((pick) => `<li>${pickCard(pick, null, state.sourceMode, null, state.constraints)}</li>`).join(""),
      "#weekNotes": (state.sourcePlan.notes || []).map((note) => `<p class="why">Original recommendation note: ${esc(note)}</p>`).join(""),
    },
    omittedHidden: !omitted.length,
  };
}

function commitWeekView(view) {
  for (const [selector, value] of Object.entries(view.text)) $(selector).textContent = value;
  for (const [selector, value] of Object.entries(view.html)) $(selector).innerHTML = value;
  $("#omittedSection").hidden = view.omittedHidden;
}

function renderWeek(message = "") {
  // Never write a partial visual state if the new arrangement is invalid.
  const view = prepareWeekView(weekState, message);
  const current = currentArrangementHistory();
  const next = current
    ? recordArrangement(current, weekState, arrangementDate(weekState), message || "Change the week.")
    : arrangementHistory;
  const expanded = new Set([...document.querySelectorAll(".pick-evidence[open]")].map(item => item.dataset.evidenceKey));
  commitWeekView(view);
  for (const item of document.querySelectorAll(".pick-evidence")) item.open = expanded.has(item.dataset.evidenceKey);
  arrangementHistory = next;
  refreshCalendar();
  refreshWeekSave();
  venueFollowup.sync();
  refreshArrangementHistory();
}

function currentArrangementHistory() {
  const origin = arrangementHistory?.origin;
  return origin && historyPlan === acceptedPlan && acceptedPlan && weekState
    && origin.sourcePlan === weekState.sourcePlan && origin.picks === weekState.picks
    && origin.constraints === weekState.constraints && origin.sourceMode === weekState.sourceMode
    ? arrangementHistory : null;
}

function arrangementDate(state) {
  const input = $("#weekDate");
  try {
    if (input.checkValidity() && setWeek(state, input.value).weekStart === state.weekStart) return input.value;
  } catch { /* Invalid draft is not a committed history state. */ }
  return arrangementHistory?.present.state.weekStart === state.weekStart
    ? arrangementHistory.present.date : state.weekStart;
}

function refreshArrangementHistory() {
  const history = currentArrangementHistory();
  $("#undoWeek").disabled = !canUndoArrangement(history);
  $("#redoWeek").disabled = !canRedoArrangement(history);
  $("#undoWeek").title = history?.past.at(-1)?.label || "";
  $("#redoWeek").title = history?.future.at(-1)?.label || "";
}

function restoreArrangement(direction) {
  const history = currentArrangementHistory();
  const undo = direction === "undo";
  if (!(undo ? canUndoArrangement(history) : canRedoArrangement(history))) return;
  const label = (undo ? history.past : history.future).at(-1).label;
  arrangementHistory = undo ? undoArrangement(history) : redoArrangement(history);
  weekState = arrangementHistory.present.state;
  $("#weekDate").value = arrangementHistory.present.date;
  preferredWeekStart = weekState.weekStart;
  $("#weekDate").removeAttribute("aria-invalid");
  $("#weekError").textContent = "";
  $("#printWeek").disabled = false;
  renderWeek((undo ? "Undid" : "Redid") + ": " + label);
  const button = $(undo ? "#undoWeek" : "#redoWeek");
  if (button.disabled) $(undo ? "#redoWeek" : "#undoWeek").focus();
}

function refreshWeekSave() {
  savedWeeks?.refreshCurrent();
  $("#saveWeek").disabled = true;
  if (!acceptedPlan || !weekState) return;
  try {
    const shown = setWeek(weekState, $("#weekDate").value);
    $("#saveWeek").disabled = !$("#weekDate").checkValidity() || shown.weekStart !== weekState.weekStart;
  } catch { /* The existing week-date message explains the invalid date. */ }
}

function clearCalendar() {
  calendarSession = null;
  $("#calendarDownload").disabled = true;
  $("#calendarPreview").replaceChildren();
  $("#calendarSource").textContent = "";
  $("#calendarStatus").textContent = "";
}

function currentCalendarState() {
  if (!weekState || !calendarSession) throw new Error("Generate a checked plan before downloading.");
  const displayedWeek = setWeek(weekState, $("#weekDate").value);
  if (!$("#weekDate").checkValidity() || displayedWeek.weekStart !== weekState.weekStart) {
    throw new Error("Choose a valid date in the displayed week before downloading.");
  }
  return weekState;
}

function refreshCalendar() {
  $("#calendarDownload").disabled = true;
  $("#calendarPreview").replaceChildren();
  if (!calendarSession) return false;
  try {
    const state = currentCalendarState();
    const items = calendarSession.preview(state, weekRows(state));
    for (const item of items) {
      const row = document.createElement("li");
      row.textContent = item.day + " " + item.date + " — " + item.name + " (all-day suggestion)";
      $("#calendarPreview").append(row);
    }
    $("#calendarStatus").textContent = items.length
      ? items.length + " suggested events for the week beginning " + state.weekStart + ". Omitted picks stay out of the file."
      : "No checked suggestions are scheduled for export. Unavailable days and omitted picks stay open.";
    $("#calendarDownload").disabled = items.length === 0;
    return items.length > 0;
  } catch (error) {
    $("#calendarStatus").textContent = "Calendar download unavailable: " + error.message;
    return false;
  }
}

function acceptCalendar() {
  clearCalendar();
  try {
    if (weekState.sourceMode === "unknown") throw new Error("The response did not specify its data source.");
    const options = acceptedPlan?.calendarId
      ? { id: acceptedPlan.calendarId, createdAt: new Date(acceptedPlan.receivedAt) } : {};
    calendarSession = TasteTableCalendar.createWeekExport(weekState, options);
    $("#calendarSource").textContent = calendarSession.source;
    refreshCalendar();
  } catch (error) {
    $("#calendarStatus").textContent = "Calendar download unavailable: " + error.message;
  }
}

function retirePlan() {
  placeHandoffWithWeek(false);
  arrangementHistory = null;
  historyPlan = null;
  refreshArrangementHistory();
  weekState = null;
  venueFollowup.retire();
  acceptedPlan = null;
  clearCalendar();
  $("#results").hidden = true;
  $("#printWeek").disabled = true;
  $("#resetWeek").disabled = true;
  $("#saveWeek").disabled = true;
  $("#savedWeekSource").textContent = "";
  $("#savedWeekSource").hidden = true;
  $("#weekFileStatus").textContent = "";
  savedWeeks?.refreshCurrent();
}

function applyWeekDate() {
  if (!weekState) return false;
  try {
    weekState = setWeek(weekState, $("#weekDate").value);
    preferredWeekStart = weekState.weekStart;
    $("#weekDate").removeAttribute("aria-invalid");
    $("#weekError").textContent = "";
    $("#printWeek").disabled = false;
    renderWeek();
    return true;
  } catch (error) {
    $("#weekDate").setAttribute("aria-invalid", "true");
    $("#weekError").textContent = error.message;
    $("#printWeek").disabled = true;
    refreshCalendar();
    refreshWeekSave();
    venueFollowup.sync();
    refreshArrangementHistory();
    return false;
  }
}

async function init() {
  const h = await fetch("/api/health").then((r) => r.json());
  $("#mode").textContent = h.qloo_mode === "mock"
    ? "Demo mode: Qloo responses come from a recorded synthetic fixture (fictional venues)."
    : "Live mode: results from the Qloo Insights API.";
  personas = await fetch("/api/personas").then((r) => r.json());
  $("#personaSel").innerHTML = personas.map((p) => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join("");
  $("#sampleBtn").disabled = personas.length === 0;
}

function fillForm(p) {
  const f = $("#form");
  f.cuisines.value = p.cuisines.join(", ");
  f.music.value = p.music.join(", ");
  f.films.value = p.films.join(", ");
  f.city.value = p.city || "";
  f.querySelectorAll("[name=constraints]").forEach((c) => (c.checked = p.constraints.includes(c.value)));
}

async function post(url, body, signal) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal });
  const j = await r.json();
  if (!r.ok) {
    const error = new Error(r.statusText);
    if (typeof j.detail === "string" && j.detail.trim()) error.userMessage = j.detail.trim();
    throw error;
  }
  return j;
}

function preparePlanView(res, restoredWeek = null) {
  const nextWeek = restoredWeek || createWeekPlan(res, preferredWeekStart || localDate());
  const fragments = {};
  const p = res.plan;
  const items = [...p.meals, ...(p.outing ? [p.outing] : [])].sort(byDay);
  fragments["#plan"] = items.map((i) => `<li><strong>${esc(i.day)}</strong> &middot; ${esc(i.name)}
      <span class="badge">${i.kind}</span>${i.fallback ? '<span class="badge">widened</span>' : ""}
      <span class="badge ok">${i.affinity != null ? "affinity " + i.affinity.toFixed(2) : ""}</span>
      <div class="why">${esc(i.why)}</div><div class="why mono">Qloo id: ${esc(i.entity_id)}</div></li>`).join("");
  fragments["#notes"] = p.notes.map((n) => `<p class="why">${esc(n)}</p>`).join("");
  const b = res.llm_only;
  fragments["#baseline"] = [...b.meals, b.outing].sort(byDay).map((i) => `<li><strong>${esc(i.day)}</strong> &middot; ${esc(i.name)}
      <span class="badge bad">unverified</span><div class="why">${esc(i.why)}</div></li>`).join("");
  const c = res.comparison, rows = [
    ["Picks", "picks"], ["Tied to a Qloo entity ID", "with_qloo_entity_id"],
    ["Has affinity evidence", "with_affinity_evidence"], ["Constraint-checked", "constraint_checked"],
    ["Unsafe candidates caught", "unsafe_candidates_rejected"]];
  fragments["#compare"] = `<tr><th></th><th>Qloo-grounded</th><th>LLM-only</th></tr>` +
    rows.map(([l, k]) => `<tr><td>${l}</td><td>${c.grounded[k]}</td><td>${k === "picks" ? c.llm_only[k] : (c.llm_only[k] ?? "&mdash;")}</td></tr>`).join("");
  fragments["#rejected"] = p.rejected.map((r) => `<li>${esc(r.name)}: ${r.failed.map((f) => esc(f.constraint + " " + f.status + " - " + f.reason)).join("; ")}</li>`).join("") || "<li>None</li>";
  fragments["#kindExcluded"] = (p.category_exclusions || []).map((item) => "<li>" + esc(item.name) + " (" + esc(item.purpose) + "): " + esc(item.reason) + "</li>").join("") || "<li>None</li>";
  fragments["#trace"] = res.trace.map((t) => `<li>${esc(t.tool)}(${esc(JSON.stringify(t.args))}) &rarr; ${esc(t.result_summary)}</li>`).join("");
  const nextWeekView = prepareWeekView(nextWeek);
  return { nextWeek, nextWeekView, fragments, restoredWeek: Boolean(restoredWeek) };
}

function commitPlanView({ nextWeek, nextWeekView, fragments, restoredWeek }, { deferWeekRefresh = false } = {}) {
  for (const [selector, value] of Object.entries(fragments)) $(selector).innerHTML = value;
  weekState = nextWeek;
  if (restoredWeek || !weekDateInitialized) {
    $("#weekDate").value = nextWeek.weekStart;
    weekDateInitialized = true;
  }
  commitWeekView(nextWeekView);
  if (!deferWeekRefresh) applyWeekDate();
  $("#resetWeek").disabled = false;
  $("#results").hidden = false;
  placeHandoffWithWeek(true);
  $("#results").scrollIntoView({ behavior: "smooth" });
}

function render(res, restoredWeek = null) {
  commitPlanView(preparePlanView(res, restoredWeek));
}

const planRequests = TasteTablePlanRequests.create({
  async send(url, payload, signal) {
    if (url === OPEN_SAVED_WEEK) {
      try {
        const opened = payload.readDraft ? openDraft(await payload.readDraft()) : readWeekFile(await payload.text());
        const supported = [...$("#form").querySelectorAll("[name=constraints]")].map((field) => field.value);
        if (opened.inputs.constraints.some((value) => !supported.includes(value))) {
          throw new Error("This saved week uses a constraint that this page cannot display.");
        }
        return { ...opened, openedFrom: payload.name };
      } catch (error) {
        error.userMessage = error.message;
        throw error;
      }
    }
    return {
      response: await post(url, payload.body, signal),
      inputs: structuredClone(payload.inputs),
      receivedAt: new Date().toISOString(),
    };
  },
  onStart() {
    retirePlan();
    $("#form").setAttribute("aria-busy", "true");
    $("#cancelPlan").hidden = false;
    $("#requestStatus").textContent = requestKind === "file"
      ? "Opening the saved week…" : "Planning with the current tastes and constraints…";
  },
  onResult(result) {
    render(result.response, result.state);
    if (result.state) fillForm(result.inputs);
    acceptedPlan = {
      response: structuredClone(result.response),
      inputs: structuredClone(result.inputs),
      receivedAt: result.receivedAt,
      calendarId: result.calendarId || newCalendarId(),
    };
    if (result.openedFrom) {
      $("#savedWeekSource").textContent = `Saved copy opened from “${result.openedFrom}” (saved ${result.savedAt}). Source labels and checks below are retained from the file; they have not been run again.`;
      $("#savedWeekSource").hidden = false;
    }
    acceptCalendar();
    if (result.includesNotes) venueFollowup.acceptPrepared(weekState, result.model);
    else venueFollowup.accept(weekState, $("#savedWeekSource").hidden ? "" : $("#savedWeekSource").textContent);
    refreshWeekSave();
    arrangementHistory = createArrangementHistory(weekState, arrangementDate(weekState));
    historyPlan = acceptedPlan;
    refreshArrangementHistory();
    $("#requestStatus").textContent = result.state
      ? result.includesNotes
        ? "Saved care plan opened. Its original inputs, arrangement and complete venue follow-up are restored."
        : "Saved week opened. Its original inputs and your arrangement are restored. This week-only copy has no venue notes."
      : "Plan ready for the current inputs.";
  },
  onError(error) {
    retirePlan();
    $("#requestStatus").textContent = requestKind === "file"
      ? `We could not open this saved week${error?.userMessage ? ": " + error.userMessage : ". Choose a valid TasteTable week file."} Your inputs are still here.`
      : error?.userMessage
      ? `We could not prepare this plan: ${error.userMessage}. Your inputs are still here.`
      : "We could not prepare this plan. Please try again. Your inputs are still here.";
  },
  onIdle() {
    $("#form").setAttribute("aria-busy", "false");
    $("#cancelPlan").hidden = true;
  },
});


caregiverHandoff = mountCaregiverHandoff($("#caregiverHandoff"), {
  current: () => venueFollowup.snapshot(),
  prepare(opened, filename) {
    const supported = [...$("#form").querySelectorAll("[name=constraints]")].map((field) => field.value);
    if (opened.inputs.constraints.some((value) => !supported.includes(value))) {
      throw new Error("This handoff uses a constraint that this page cannot display.");
    }
    const view = preparePlanView(opened.response, opened.state);
    opened.model.entries(view.nextWeek);
    return { view, model: opened.model, inputs: structuredClone(opened.inputs),
      origin: structuredClone(opened.origin),
      label: `Caregiver handoff opened from “${filename}” (saved ${opened.handoffSavedAt}). Source labels and checks below are retained from the file; they have not been run again.` };
  },
  accept(prepared) {
    planRequests.invalidate();
    arrangementHistory = null;
    historyPlan = null;
    // Restore the whole handoff before refreshing collection capture or exports.
    commitPlanView(prepared.view, { deferWeekRefresh: true });
    fillForm(prepared.inputs);
    acceptedPlan = prepared.origin;
    $("#savedWeekSource").textContent = prepared.label;
    $("#savedWeekSource").hidden = false;
    venueFollowup.acceptPrepared(weekState, prepared.model);
    acceptCalendar();
    applyWeekDate();
    arrangementHistory = createArrangementHistory(weekState, arrangementDate(weekState));
    historyPlan = acceptedPlan;
    refreshArrangementHistory();
    $("#requestStatus").textContent = "Caregiver handoff opened. Its original inputs, arrangement and venue notes are restored.";
  },
});

// A browser collection Open shares the portable file's admission, retirement,
// input restoration and calendar identity. Start the controller before IDB reads.
savedWeeks = createSavedWeeksUI({
  capture() {
    if (!acceptedPlan || !weekState || $("#results").hidden) return null;
    try {
      const shown = setWeek(weekState, $("#weekDate").value);
      if (!$("#weekDate").checkValidity() || shown.weekStart !== weekState.weekStart) return null;
      return { ...acceptedPlan, weekState, venueModel: venueFollowup.snapshot().model };
    } catch { return null; }
  },
  openSaved(read) {
    requestKind = "file";
    const payload = {
      name: "this browser's saved weeks",
      async readDraft() {
        const draft = await read();
        payload.name = `this browser's saved weeks: ${draft.name}`;
        return draft;
      },
    };
    return planRequests.run(OPEN_SAVED_WEEK, payload);
  },
});

function clearPlan(message) {
  planRequests.invalidate();
  retirePlan();
  $("#requestStatus").textContent = message;
}

$("#sampleBtn").addEventListener("click", () => {
  const id = $("#personaSel").value;
  const persona = personas.find((p) => p.id === id);
  if (!persona) {
    clearPlan("Sample personas are unavailable. Enter tastes and constraints to request a plan.");
    return;
  }
  fillForm(persona);
  const inputs = Object.fromEntries(["cuisines", "music", "films", "city", "constraints"]
    .map((key) => [key, structuredClone(persona[key])]));
  requestKind = "plan";
  void planRequests.run(`/api/plan/sample/${encodeURIComponent(id)}`, { inputs });
});

$("#form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const f = ev.target;
  const body = { cuisines: split(f.cuisines.value), music: split(f.music.value), films: split(f.films.value),
    city: f.city.value, constraints: [...f.querySelectorAll("[name=constraints]:checked")].map((c) => c.value) };
  requestKind = "plan";
  void planRequests.run("/api/plan", { body, inputs: body });
});

$("#openWeek").addEventListener("click", () => {
  $("#weekFile").value = "";
  $("#weekFile").click();
});
$("#weekFile").addEventListener("change", () => {
  const file = $("#weekFile").files[0];
  if (!file) return;
  requestKind = "file";
  void planRequests.run(OPEN_SAVED_WEEK, file);
});

$("#form").addEventListener("input", () => {
  clearPlan("Inputs changed. Generate a new plan to use these tastes and constraints.");
});
$("#personaSel").addEventListener("change", () => {
  clearPlan("Sample selection changed. Use Try a sample persona to load it, or enter your own tastes to request a plan.");
});
$("#cancelPlan").addEventListener("click", () => {
  clearPlan("Stopped waiting. Generate another plan when you are ready.");
});
window.addEventListener("pagehide", () => {
  clearPlan("Generate a new plan for the current inputs.");
});

$("#weekDate").addEventListener("input", applyWeekDate);
$("#weekDate").addEventListener("change", applyWeekDate);
$("#undoWeek").addEventListener("click", () => restoreArrangement("undo"));
$("#redoWeek").addEventListener("click", () => restoreArrangement("redo"));
$("#weekOrganizer").addEventListener("change", (event) => {
  const select = event.target.closest("select[data-pick-key]");
  if (!select || !weekState) return;
  const key = select.dataset.pickKey;
  const pick = weekState.picks.find((item) => item.key === key);
  weekState = setPickDay(weekState, key, select.value || null);
  renderWeek(select.value ? `${pick.pick.name} scheduled for ${select.value}.` : `${pick.pick.name} kept off this week. You can put it back below.`);
  $(`#weekOrganizer select[data-pick-key="${key}"]`).focus();
});
$("#resetWeek").addEventListener("click", () => {
  if (!weekState) return;
  weekState = resetDays(weekState);
  renderWeek("All picks restored to their suggested days.");
});
$("#printWeek").addEventListener("click", () => {
  if (applyWeekDate()) window.print();
});

$("#saveWeek").addEventListener("click", () => {
  if (!acceptedPlan || !applyWeekDate()) return;
  let url, link;
  try {
    const output = makeWeekFile({ ...acceptedPlan, state: weekState });
    url = URL.createObjectURL(new Blob([output.text], { type: "application/json;charset=utf-8" }));
    link = document.createElement("a");
    link.href = url;
    link.download = output.filename;
    document.body.append(link);
    link.click();
    $("#weekFileStatus").textContent = "Week file prepared. Keep it and use Open saved week to continue editing later. It includes the original inputs and response.";
  } catch (error) {
    $("#weekFileStatus").textContent = "The week file could not be prepared: " + error.message;
  } finally {
    link?.remove();
    if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
});

$("#calendarDownload").addEventListener("click", () => {
  if (!refreshCalendar()) return;
  let url, link;
  try {
    const state = currentCalendarState();
    const output = calendarSession.download(state, weekRows(state));
    url = URL.createObjectURL(new Blob([output.text], { type: "text/calendar;charset=utf-8" }));
    link = document.createElement("a");
    link.href = url;
    link.download = output.filename;
    document.body.append(link);
    link.click();
    $("#calendarStatus").textContent = "Calendar file prepared. Open it in your calendar app to review and import the suggestions.";
  } catch (error) {
    $("#calendarDownload").disabled = true;
    $("#calendarStatus").textContent = "Calendar download unavailable: " + error.message;
  } finally {
    link?.remove();
    if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
});

init().catch(() => {
  $("#sampleBtn").disabled = true;
  $("#mode").textContent += " Sample personas could not load. Enter your own tastes to request a plan.";
});

// Printed caregiver handoffs retain every original explanation even when folded on screen.
let printEvidence = [];
window.addEventListener("beforeprint", () => {
  printEvidence = [...document.querySelectorAll(".pick-evidence")].map(item => [item, item.open]);
  for (const [item] of printEvidence) item.open = true;
});
window.addEventListener("afterprint", () => {
  for (const [item, open] of printEvidence) item.open = open;
  printEvidence = [];
});
