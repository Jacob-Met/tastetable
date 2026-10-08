import { DAYS, createWeekPlan, localDate, offWeekPicks, resetDays, setPickDay, setWeek, weekRows } from "./week_plan.mjs";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const byDay = (a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
const split = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
let personas = [];
let weekState = null;
let preferredWeekStart = null;
let weekDateInitialized = false;
let calendarSession = null;

const dateLabel = (date) => new Intl.DateTimeFormat(undefined, {
  year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
}).format(new Date(`${date}T12:00:00Z`));

function pickCard({ key, pick }, day) {
  return `<article class="scheduled-pick">
    <h4>${esc(pick.name)}</h4>
    <span class="badge">${esc(pick.kind)}</span>${pick.fallback ? '<span class="badge">widened</span>' : ""}
    ${typeof pick.affinity === "number" ? `<span class="badge ok">affinity ${esc(pick.affinity.toFixed(2))}</span>` : ""}
    <p class="why">${esc(pick.why)}</p>
    <p class="why mono">Qloo id: ${esc(pick.entity_id)}</p>
    <label class="pick-control">Schedule this pick
      <select data-pick-key="${key}" aria-label="Day for ${esc(pick.name)}">
        ${DAYS.map((value) => `<option value="${value}"${day === value ? " selected" : ""}>${value}</option>`).join("")}
        <option value=""${day === null ? " selected" : ""}>Keep off this week</option>
      </select>
    </label>
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
    ${row.picks.length ? row.picks.map((pick) => pickCard(pick, row.day)).join("") : '<p class="open-day">Open day <span>No pick scheduled.</span></p>'}
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
      "#omittedPicks": omitted.map((pick) => `<li>${pickCard(pick, null)}</li>`).join(""),
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
  commitWeekView(prepareWeekView(weekState, message));
  refreshCalendar();
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
    calendarSession = TasteTableCalendar.createWeekExport(weekState);
    $("#calendarSource").textContent = calendarSession.source;
    refreshCalendar();
  } catch (error) {
    $("#calendarStatus").textContent = "Calendar download unavailable: " + error.message;
  }
}

function retirePlan() {
  weekState = null;
  clearCalendar();
  $("#results").hidden = true;
  $("#printWeek").disabled = true;
  $("#resetWeek").disabled = true;
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

function render(res) {
  const nextWeek = createWeekPlan(res, preferredWeekStart || localDate());
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
    rows.map(([l, k]) => `<tr><td>${l}</td><td>${c.grounded[k]}</td><td>${k === "picks" ? c.llm_only[k] : (c.llm_only[k] || "&mdash;")}</td></tr>`).join("");
  fragments["#rejected"] = p.rejected.map((r) => `<li>${esc(r.name)}: ${r.failed.map((f) => esc(f.constraint + " " + f.status + " - " + f.reason)).join("; ")}</li>`).join("") || "<li>None</li>";
  fragments["#trace"] = res.trace.map((t) => `<li>${esc(t.tool)}(${esc(JSON.stringify(t.args))}) &rarr; ${esc(t.result_summary)}</li>`).join("");
  const nextWeekView = prepareWeekView(nextWeek);

  for (const [selector, value] of Object.entries(fragments)) $(selector).innerHTML = value;
  weekState = nextWeek;
  if (!weekDateInitialized) {
    $("#weekDate").value = nextWeek.weekStart;
    weekDateInitialized = true;
  }
  commitWeekView(nextWeekView);
  applyWeekDate();
  $("#resetWeek").disabled = false;
  $("#results").hidden = false;
  $("#results").scrollIntoView({ behavior: "smooth" });
}

const planRequests = TasteTablePlanRequests.create({
  send: post,
  onStart() {
    retirePlan();
    $("#form").setAttribute("aria-busy", "true");
    $("#cancelPlan").hidden = false;
    $("#requestStatus").textContent = "Planning with the current tastes and constraints…";
  },
  onResult(res) {
    render(res);
    acceptCalendar();
    $("#requestStatus").textContent = "Plan ready for the current inputs.";
  },
  onError(error) {
    retirePlan();
    $("#requestStatus").textContent = error?.userMessage
      ? `We could not prepare this plan: ${error.userMessage}. Your inputs are still here.`
      : "We could not prepare this plan. Please try again. Your inputs are still here.";
  },
  onIdle() {
    $("#form").setAttribute("aria-busy", "false");
    $("#cancelPlan").hidden = true;
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
  void planRequests.run(`/api/plan/sample/${encodeURIComponent(id)}`);
});

$("#form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const f = ev.target;
  const body = { cuisines: split(f.cuisines.value), music: split(f.music.value), films: split(f.films.value),
    city: f.city.value, constraints: [...f.querySelectorAll("[name=constraints]:checked")].map((c) => c.value) };
  void planRequests.run("/api/plan", body);
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
