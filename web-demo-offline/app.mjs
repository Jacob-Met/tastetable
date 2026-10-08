import { DAYS, createWeekPlan, localDate, offWeekPicks, resetDays, setPickDay, setWeek, weekRows } from "./week_plan.mjs";

import { CONSTRAINTS, chooseRecord, validateCatalogue } from "./catalogue.mjs";
import { readOfflineWeekFile, saveOfflineWeek } from "./saved_week.mjs";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const byDay = (a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
let personas = [];
let catalogue = null;
let currentRecord = null;
let weekState = null;
let receivedAt = null;
let calendarId = null;
let openedSavedAt = null;
let openingVersion = 0;
let pendingWeek = null;
let downloadUrl = null;

function retireOpening(message = "") {
  openingVersion += 1;
  pendingWeek = null;
  $("#weekPreview").hidden = true;
  $("#replaceWeek").disabled = true;
  $("#cancelWeek").hidden = true;
  $("#weekFile").value = "";
  $("#fileStatus").textContent = message;
  $("#fileError").textContent = "";
  return openingVersion;
}

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

function renderWeek(message = "") {
  const rows = weekRows(weekState);
  const omitted = offWeekPicks(weekState);
  const count = weekState.picks.length - omitted.length;
  $("#weekTitle").textContent = `Week of ${dateLabel(rows[0].date)}`;
  $("#weekRange").textContent = `${dateLabel(rows[0].date)} – ${dateLabel(rows[6].date)}`;
  $("#weekSummary").textContent = `${count} of ${weekState.picks.length} suggested picks scheduled. ${rows.filter((row) => !row.picks.length).length} open days.`;
  $("#weekSource").textContent = {
    mock: "Demo plan: fictional venues from a synthetic fixture.",
    live: "Plan returned by Qloo. Venue details and availability need confirmation.",
    unknown: "The response did not specify its data source.",
  }[weekState.sourceMode];
  const labels = { soft_foods: "soft foods", low_sodium: "low sodium", wheelchair: "wheelchair access" };
  $("#weekConstraints").textContent = weekState.constraints.length
    ? `Requested constraints: ${weekState.constraints.map((value) => labels[value] || value).join(", ")}.`
    : "No constraints listed in the response.";
  $("#weekDays").innerHTML = rows.map((row) => `<li class="week-day" data-day="${row.day}">
    <h3>${row.day} <time datetime="${row.date}">${esc(dateLabel(row.date))}</time></h3>
    ${row.picks.length ? row.picks.map((pick) => pickCard(pick, row.day)).join("") : '<p class="open-day">Open day <span>No pick scheduled.</span></p>'}
  </li>`).join("");
  $("#omittedPicks").innerHTML = omitted.map((pick) => `<li>${pickCard(pick, null)}</li>`).join("");
  $("#omittedSection").hidden = !omitted.length;
  $("#weekNotes").innerHTML = (weekState.sourcePlan.notes || []).map((note) => `<p class="why">Original recommendation note: ${esc(note)}</p>`).join("");
  $("#weekStatus").textContent = message;
  $("#openedCopy").hidden = !openedSavedAt;
  $("#openedCopy").textContent = openedSavedAt
    ? `Opened a saved copy dated ${new Date(openedSavedAt).toLocaleString()}. Its recommendations are the original finite recording; any further arrangement changes need another Save week.`
    : "";
}

function applyWeekDate() {
  if (!weekState) return false;
  try {
    weekState = setWeek(weekState, $("#weekDate").value);
    $("#weekDate").removeAttribute("aria-invalid");
    $("#weekError").textContent = "";
    $("#printWeek").disabled = false;
    $("#saveWeek").disabled = !currentRecord;
    renderWeek();
    return true;
  } catch (error) {
    $("#weekDate").setAttribute("aria-invalid", "true");
    $("#weekError").textContent = error.message;
    $("#printWeek").disabled = true;
    $("#saveWeek").disabled = true;
    return false;
  }
}

async function init() {
  const response = await fetch("./data/catalogue.json");
  if (!response.ok) throw new Error(`Catalogue HTTP ${response.status}`);
  catalogue = validateCatalogue(await response.json());
  personas = catalogue.profiles;
  $("#mode").textContent = "Offline recording: 3 fictional profiles × 8 constraint combinations. No fresh backend planning or external requests.";
  $("#personaSel").innerHTML = personas.map((p) => `<option value="${esc(p.id)}">${esc(p.label)}</option>`).join("");
  ["#personaSel", "#sampleBtn", "#constraintGroup", "#showPlan", "#openWeek"].forEach((selector) => { $(selector).disabled = false; });
  fillForm(personas[0]);
  showRecord(false);
}

function fillForm(p) {
  const f = $("#form");
  f.cuisines.value = p.cuisines.join(", ");
  f.music.value = p.music.join(", ");
  f.films.value = p.films.join(", ");
  f.city.value = p.city || "";
  f.querySelectorAll("[name=constraints]").forEach((c) => (c.checked = p.constraints.includes(c.value)));
}

function render(res, scroll = true) {
  const nextWeek = createWeekPlan(res, weekState?.weekStart || localDate());
  const p = res.plan;
  const items = [...p.meals, ...(p.outing ? [p.outing] : [])].sort(byDay);
  $("#plan").innerHTML = items.map((i) => `<li><strong>${esc(i.day)}</strong> &middot; ${esc(i.name)}
      <span class="badge">${i.kind}</span>${i.fallback ? '<span class="badge">widened</span>' : ""}
      <span class="badge ok">${i.affinity != null ? "affinity " + i.affinity.toFixed(2) : ""}</span>
      <div class="why">${esc(i.why)}</div><div class="why mono">Qloo id: ${esc(i.entity_id)}</div></li>`).join("");
  $("#notes").innerHTML = p.notes.map((n) => `<p class="why">${esc(n)}</p>`).join("");
  const b = res.llm_only;
  $("#baseline").innerHTML = [...b.meals, b.outing].sort(byDay).map((i) => `<li><strong>${esc(i.day)}</strong> &middot; ${esc(i.name)}
      <span class="badge bad">unverified</span><div class="why">${esc(i.why)}</div></li>`).join("");
  const c = res.comparison, rows = [
    ["Picks", "picks"], ["Tied to a synthetic fixture ID", "with_qloo_entity_id"],
    ["Has affinity evidence", "with_affinity_evidence"], ["Constraint-checked", "constraint_checked"],
    ["Candidates rejected by fixture heuristics", "unsafe_candidates_rejected"]];
  $("#compare").innerHTML = `<tr><th></th><th>Synthetic fixture</th><th>Fixed template</th></tr>` +
    rows.map(([l, k]) => `<tr><td>${l}</td><td>${c.grounded[k]}</td><td>${k === "picks" ? c.llm_only[k] : (c.llm_only[k] || "&mdash;")}</td></tr>`).join("");
  $("#rejected").innerHTML = p.rejected.map((r) => `<li>${esc(r.name)}: ${r.failed.map((f) => esc(f.constraint + " " + f.status + " - " + f.reason)).join("; ")}</li>`).join("") || "<li>None</li>";
  $("#trace").innerHTML = res.trace.map((t) => `<li>${esc(t.tool)}(${esc(JSON.stringify(t.args))}) &rarr; ${esc(t.result_summary)}</li>`).join("");
  weekState = nextWeek;
  if (!$("#weekDate").value) $("#weekDate").value = nextWeek.weekStart;
  renderWeek();
  applyWeekDate();
  $("#results").hidden = false;
  if (scroll) $("#results").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function selectedConstraints() {
  return [...$("#form").querySelectorAll("[name=constraints]:checked")].map((c) => c.value);
}

function invalidateSelection(message) {
  retireOpening();
  $("#results").hidden = true;
  $("#saveWeek").disabled = true;
  receivedAt = null;
  calendarId = null;
  openedSavedAt = null;
  currentRecord = null;
  weekState = null;
  $("#downloadRecord").removeAttribute("href");
  $("#requestStatus").textContent = message;
}

function acceptRecord(record, {scroll = true, state = null, originalReceivedAt = new Date().toISOString(),
  savedAt = null, originalCalendarId = null} = {}) {
  currentRecord = record;
  receivedAt = originalReceivedAt;
  calendarId = originalCalendarId;
  openedSavedAt = savedAt;
  if (state) {
    weekState = state;
    $("#weekDate").value = state.weekStart;
  }
  render(record.response, scroll);
  if (state) {
    weekState = state;
    renderWeek("Saved date, scheduled days and off-week picks restored.");
  }
  const profile = personas.find((p) => p.id === record.profile_id);
  const labels = {soft_foods: "soft foods", low_sodium: "low sodium", wheelchair: "wheelchair access"};
  $("#recordSummary").textContent = `${profile.label.split(" (fictional)")[0]} · ${record.constraints.length ? record.constraints.map((c) => labels[c]).join(", ") : "no requested constraints"}`;
  $("#results").dataset.recordKey = record.key;
  $("#downloadRecord").href = `./data/records/${record.key}.json`;
  $("#downloadRecord").download = `tastetable-${record.key}-source.json`;
  $("#requestStatus").textContent = `Loaded native record ${record.key}. Arrange its checked suggestions below.`;
}

function showRecord(scroll = true) {
  retireOpening();
  try {
    if (!catalogue) throw new Error("The recorded catalogue has not loaded.");
    acceptRecord(chooseRecord(catalogue, $("#personaSel").value, selectedConstraints()), {scroll});
  } catch (error) {
    invalidateSelection(`Could not show a recording: ${error.message}`);
  }
}

function showWeekPreview(saved) {
  const profile = personas.find((p) => p.id === saved.record.profile_id);
  const omitted = offWeekPicks(saved.state);
  const labels = {soft_foods: "soft foods", low_sodium: "low sodium", wheelchair: "wheelchair access"};
  $("#previewSummary").textContent = `${profile.label} · ${saved.record.constraints.length ? saved.record.constraints.map((value) => labels[value]).join(", ") : "no requested constraints"}.`;
  $("#previewWhen").textContent = `Saved ${new Date(saved.savedAt).toLocaleString()}. Week of ${dateLabel(saved.state.weekStart)}: ${saved.state.picks.length - omitted.length} scheduled, ${omitted.length} kept off this week.`;
  $("#previewDays").innerHTML = weekRows(saved.state).map((row) =>
    `<li><strong>${row.day}</strong><span>${row.picks.length ? row.picks.map(({pick}) => esc(pick.name)).join(" · ") : "Open day"}</span></li>`).join("");
  $("#previewOmitted").textContent = omitted.length
    ? "Kept off this week: " + omitted.map(({pick}) => pick.name).join(" · ") : "No off-week picks.";
  $("#weekPreview").hidden = false;
  $("#replaceWeek").disabled = false;
  $("#cancelWeek").hidden = false;
  $("#fileStatus").textContent = "The file matches a recording in this catalogue. Review it before replacing your displayed week.";
  $("#weekPreviewTitle").focus({preventScroll: true});
  $("#weekPreview").scrollIntoView({block: "nearest", behavior: "auto"});
}

$("#openWeek").addEventListener("click", () => {
  retireOpening();
  $("#weekFile").click();
});
$("#weekFile").addEventListener("cancel", () => retireOpening("No saved week was opened."));
$("#weekFile").addEventListener("change", async () => {
  const file = $("#weekFile").files[0];
  const version = retireOpening();
  if (!file) return;
  $("#cancelWeek").hidden = false;
  $("#fileStatus").textContent = "Reading saved week… Your displayed week stays in place.";
  try {
    const saved = await readOfflineWeekFile(file, catalogue);
    if (version !== openingVersion) return;
    pendingWeek = saved;
    showWeekPreview(saved);
  } catch (error) {
    if (version !== openingVersion) return;
    $("#cancelWeek").hidden = true;
    $("#fileStatus").textContent = "";
    $("#fileError").textContent = "Could not open this week: " + error.message;
  }
});
$("#cancelWeek").addEventListener("click", () => {
  retireOpening("Opening cancelled. Your displayed week has not changed.");
  $("#openWeek").focus();
});
$("#replaceWeek").addEventListener("click", () => {
  if (!pendingWeek) return;
  const saved = pendingWeek;
  retireOpening();
  $("#personaSel").value = saved.record.profile_id;
  fillForm(personas.find((p) => p.id === saved.record.profile_id));
  $("#form").querySelectorAll("[name=constraints]").forEach((input) => {
    input.checked = saved.record.constraints.includes(input.value);
  });
  acceptRecord(saved.record, {scroll: false, state: saved.state,
    originalReceivedAt: saved.receivedAt, savedAt: saved.savedAt, originalCalendarId: saved.calendarId});
  $("#fileStatus").textContent = "Saved week opened. The original recorded recommendation and source download are retained.";
  $("#weekTitle").focus({preventScroll: true});
  $("#weekOrganizer").scrollIntoView({block: "start", behavior: "auto"});
});
$("#saveWeek").addEventListener("click", () => {
  retireOpening();
  if (!currentRecord || !applyWeekDate()) return;
  try {
    const saved = saveOfflineWeek(catalogue, currentRecord, weekState, receivedAt, calendarId);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(new Blob([saved.text], {type: "application/json;charset=utf-8"}));
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = saved.filename;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    $("#fileStatus").textContent = "Saved-week download ready. Keep the file to reopen this arrangement; further changes need another Save week.";
  } catch (error) {
    $("#fileError").textContent = "Could not save this week: " + error.message;
  }
});
window.addEventListener("pagehide", () => {
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
});

$("#sampleBtn").addEventListener("click", () => {
  const persona = personas.find((p) => p.id === $("#personaSel").value);
  if (!persona) return;
  fillForm(persona);
  showRecord();
});

$("#personaSel").addEventListener("change", () => {
  const persona = personas.find((p) => p.id === $("#personaSel").value);
  if (persona) fillForm(persona);
  invalidateSelection("Taste profile changed. Show its recorded plan when you are ready.");
});

$("#form").addEventListener("change", (event) => {
  if (event.target.matches("[name=constraints]")) {
    invalidateSelection("Constraints changed. Show the matching recorded plan when you are ready.");
  }
});

$("#form").addEventListener("submit", (event) => {
  event.preventDefault();
  showRecord();
});

const editWeekDate = () => { retireOpening(); applyWeekDate(); };
$("#weekDate").addEventListener("input", editWeekDate);
$("#weekDate").addEventListener("change", editWeekDate);
$("#weekOrganizer").addEventListener("change", (event) => {
  const select = event.target.closest("select[data-pick-key]");
  if (!select || !weekState) return;
  retireOpening();
  const key = select.dataset.pickKey;
  const pick = weekState.picks.find((item) => item.key === key);
  weekState = setPickDay(weekState, key, select.value || null);
  renderWeek(select.value ? `${pick.pick.name} scheduled for ${select.value}.` : `${pick.pick.name} kept off this week. You can put it back below.`);
  $(`#weekOrganizer select[data-pick-key="${key}"]`).focus();
});
$("#resetWeek").addEventListener("click", () => {
  if (!weekState) return;
  retireOpening();
  weekState = resetDays(weekState);
  renderWeek("All picks restored to their suggested days.");
});
$("#printWeek").addEventListener("click", () => {
  if (applyWeekDate()) window.print();
});

init().catch((error) => {
  invalidateSelection(`Could not load the recorded catalogue: ${error.message}`);
  $("#mode").textContent = "The recorded catalogue is unavailable. No plan can be shown.";
});
