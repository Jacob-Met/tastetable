const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const byDay = (a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
const split = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
let personas = [];

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
  $("#results").hidden = false;
  $("#results").scrollIntoView({ behavior: "smooth" });
}

const planRequests = TasteTablePlanRequests.create({
  send: post,
  onStart() {
    $("#results").hidden = true;
    $("#form").setAttribute("aria-busy", "true");
    $("#cancelPlan").hidden = false;
    $("#requestStatus").textContent = "Planning with the current tastes and constraints…";
  },
  onResult(res) {
    render(res);
    $("#requestStatus").textContent = "Plan ready for the current inputs.";
  },
  onError(error) {
    $("#results").hidden = true;
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
  $("#results").hidden = true;
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
$("#cancelPlan").addEventListener("click", () => {
  clearPlan("Stopped waiting. Generate another plan when you are ready.");
});
window.addEventListener("pagehide", () => {
  clearPlan("Generate a new plan for the current inputs.");
});

init().catch(() => {
  $("#sampleBtn").disabled = true;
  $("#mode").textContent += " Sample personas could not load. Enter your own tastes to request a plan.";
});
