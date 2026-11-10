/** Read-only presentation of original optional structured evidence; old files keep their paragraph. */
const labels = {soft_foods: "Soft foods", low_sodium: "Low sodium", wheelchair: "Wheelchair access"};
export function structuredEvidence(pick) {
  const e = pick?.evidence;
  if (e?.format !== "tastetable.pick-evidence.v1" || typeof e.taste_reason !== "string"
    || !Array.isArray(e.checks) || !e.checks.every(check => check && typeof check.constraint === "string"
      && ["pass", "fail", "unknown"].includes(check.status) && typeof check.reason === "string")) return null;
  return e;
}
export function evidenceMarkup(pick, esc) {
  const e = structuredEvidence(pick);
  if (!e) return `<p class="why">${esc(pick.why)}</p>`;
  return `<div class="source-evidence">
    <p class="why taste-reason">${esc(e.taste_reason)}</p>
    <h5>Original care checks</h5>
    ${e.checks.length ? `<dl class="care-checks">${e.checks.map(check => `<div>
      <dt>${esc(labels[check.constraint] || check.constraint)} <span class="check-result">Tag/keyword check: ${esc(check.status)}</span></dt>
      <dd>${esc(check.reason)}</dd>
    </div>`).join("")}</dl>` : '<p class="why">No care constraints were checked for this pick.</p>'}
    <p class="check-limit">Based on the original venue tags and keywords. Confirm current food and access needs with the venue.</p>
  </div>`;
}
