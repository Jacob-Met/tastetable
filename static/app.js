import { DAYS, createWeekPlan, localDate, offWeekPicks, resetDays, setPickDay, setWeek, weekRows } from "./week_plan.mjs";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const byDay = (a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
const split = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
let personas = [];
let weekState = null;
let requestNumber = 0;

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
}

function applyWeekDate() {
  if (!weekState) return false;
  try {
    weekState = setWeek(weekState, $("#weekDate").value);
    $("#weekDate").removeAttribute("aria-invalid");
    $("#weekError").textContent = "";
    $("#printWeek").disabled = false;
    renderWeek();
    return true;
  } catch (error) {
    $("#weekDate").setAttribute("aria-invalid", "true");
    $("#weekError").textContent = error.message;
    $("#printWeek").disabled = true;
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
}

function fillForm(p) {
  const f = $("#form");
  f.cuisines.value = p.cuisines.join(", ");
  f.music.value = p.music.join(", ");
  f.films.value = p.films.join(", ");
  f.city.value = p.city || "";
  f.querySelectorAll("[name=constraints]").forEach((c) => (c.checked = p.constraints.includes(c.value)));
}

async function post(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(j.detail || r.statusText);
  return j;
}

function render(res) {
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
    ["Picks", "picks"], ["Tied to a Qloo entity ID", "with_qloo_entity_id"],
    ["Has affinity evidence", "with_affinity_evidence"], ["Constraint-checked", "constraint_checked"],
    ["Unsafe candidates caught", "unsafe_candidates_rejected"]];
  $("#compare").innerHTML = `<tr><th></th><th>Qloo-grounded</th><th>LLM-only</th></tr>` +
    rows.map(([l, k]) => `<tr><td>${l}</td><td>${c.grounded[k]}</td><td>${k === "picks" ? c.llm_only[k] : (c.llm_only[k] || "&mdash;")}</td></tr>`).join("");
  $("#rejected").innerHTML = p.rejected.map((r) => `<li>${esc(r.name)}: ${r.failed.map((f) => esc(f.constraint + " " + f.status + " - " + f.reason)).join("; ")}</li>`).join("") || "<li>None</li>";
  $("#trace").innerHTML = res.trace.map((t) => `<li>${esc(t.tool)}(${esc(JSON.stringify(t.args))}) &rarr; ${esc(t.result_summary)}</li>`).join("");
  weekState = nextWeek;
  if (!$("#weekDate").value) $("#weekDate").value = nextWeek.weekStart;
  renderWeek();
  applyWeekDate();
  $("#results").hidden = false;
  $("#results").scrollIntoView({ behavior: "smooth" });
}

async function requestPlan(url, body) {
  const request = ++requestNumber;
  $("#requestStatus").textContent = "Preparing your checked suggestions…";
  $("#results").setAttribute("aria-busy", "true");
  try {
    const response = await post(url, body);
    if (request !== requestNumber) return;
    render(response);
    $("#requestStatus").textContent = "Suggestions ready. Arrange the picks in your week below.";
  } catch (error) {
    if (request === requestNumber) $("#requestStatus").textContent = `Could not prepare a new plan: ${error.message}`;
  } finally {
    if (request === requestNumber) $("#results").removeAttribute("aria-busy");
  }
}

$("#sampleBtn").addEventListener("click", async () => {
  const id = $("#personaSel").value;
  const persona = personas.find((p) => p.id === id);
  if (!persona) return;
  fillForm(persona);
  await requestPlan(`/api/plan/sample/${encodeURIComponent(id)}`);
});

$("#form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  const body = { cuisines: split(f.cuisines.value), music: split(f.music.value), films: split(f.films.value),
    city: f.city.value, constraints: [...f.querySelectorAll("[name=constraints]:checked")].map((c) => c.value) };
  await requestPlan("/api/plan", body);
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

init().catch((error) => { $("#requestStatus").textContent = `Could not load sample choices: ${error.message}`; });
