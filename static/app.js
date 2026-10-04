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

$("#sampleBtn").addEventListener("click", async () => {
  const id = $("#personaSel").value;
  fillForm(personas.find((p) => p.id === id));
  try { render(await post(`/api/plan/sample/${encodeURIComponent(id)}`)); } catch (e) { alert(e.message); }
});

$("#form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  const body = { cuisines: split(f.cuisines.value), music: split(f.music.value), films: split(f.films.value),
    city: f.city.value, constraints: [...f.querySelectorAll("[name=constraints]:checked")].map((c) => c.value) };
  try { render(await post("/api/plan", body)); } catch (e) { alert(e.message); }
});

init();
