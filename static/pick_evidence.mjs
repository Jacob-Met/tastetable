/** Read-only presentation of original optional structured evidence; old files keep their paragraph. */
const labels = {soft_foods: "Soft foods", low_sodium: "Low sodium", wheelchair: "Wheelchair access"};
export function structuredEvidence(pick) {
  const e = pick?.evidence;
  if (e?.format !== "tastetable.pick-evidence.v1" || typeof e.taste_reason !== "string"
    || !Array.isArray(e.checks) || !e.checks.every(check => check && typeof check.constraint === "string"
      && ["pass", "fail", "unknown"].includes(check.status) && typeof check.reason === "string")) return null;
  return e;
}
/** The original screen is only a tag/keyword guess, never a current venue answer. */
export function carePrompt(pick, constraints, esc) {
  if (!Array.isArray(constraints)) return "";
  const requested = [...new Set(constraints.filter((value) => typeof value === "string" && value))];
  if (!requested.length) return "";
  const evidence = structuredEvidence(pick);
  const recorded = new Map(evidence?.checks.map((check) => [check.constraint, check.status]) || []);
  const names = (items) => items.map((value) => labels[value] || value).join(", ");
  const concern = requested.filter((value) => recorded.get(value) === "fail");
  const unanswered = requested.filter((value) => !recorded.has(value) || recorded.get(value) === "unknown");
  const cautions = [];
  if (concern.length) cautions.push(`Original tags raised concerns about ${names(concern)}.`);
  if (unanswered.length) cautions.push(`Original data could not establish ${names(unanswered)}.`);
  const summary = cautions.join(" ") || "Original tags and keywords suggested a fit.";
  const state = concern.length ? "concern" : unanswered.length ? "unknown" : "screened";
  return `<p class="care-prompt" data-care-prompt data-check-status="${state}">
    <strong>Confirm with the venue:</strong> ${esc(names(requested))}.
    <span class="care-method">${esc(summary)} These checks are not a current venue confirmation.</span>
  </p>`;
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
