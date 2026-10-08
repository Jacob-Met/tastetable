/** Select exact, finite native recordings; this module does not plan or check venues. */
export const SOURCE_COMMIT = "59a5b23cedbd758945a1c80bcc9d83a6f564b819";
export const CONSTRAINTS = Object.freeze(["soft_foods", "low_sodium", "wheelchair"]);
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const PROFILES = ["rosa", "harold", "mei"];

function assert(ok, message) {
  if (!ok) throw new TypeError(`Recorded catalogue is unavailable: ${message}`);
}
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function text(value) { return typeof value === "string"; }
function strings(value) { return Array.isArray(value) && value.every(text); }
function pick(value, kind) {
  return value && value.kind === kind && DAYS.includes(value.day) &&
    text(value.name) && text(value.entity_id) && value.entity_id.startsWith("FIX-") &&
    text(value.why) && (value.affinity === null || Number.isFinite(value.affinity));
}
function equals(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

export function recordKey(profileId, constraints) {
  assert(PROFILES.includes(profileId), "choose one of the three recorded profiles.");
  assert(strings(constraints) && new Set(constraints).size === constraints.length &&
    constraints.every((c) => CONSTRAINTS.includes(c)), "unsupported or duplicate constraints.");
  const mask = CONSTRAINTS.reduce((n, name, bit) => n + (constraints.includes(name) ? 1 << bit : 0), 0);
  return `${profileId}-${mask}`;
}

export function validateCatalogue(input) {
  assert(input?.schema === "tastetable.offline-catalogue.v1", "unknown format.");
  assert(input.source?.commit === SOURCE_COMMIT, "source pin mismatch.");
  assert(equals(input.constraints, CONSTRAINTS), "constraint catalogue mismatch.");
  assert(Array.isArray(input.profiles) && input.profiles.length === PROFILES.length, "profile count mismatch.");
  assert(equals(input.profiles.map((p) => p.id).sort(), [...PROFILES].sort()), "profile identity mismatch.");
  for (const p of input.profiles) {
    assert(text(p.label) && text(p.city) && ["cuisines", "music", "films", "constraints"].every((k) => strings(p[k])),
      "invalid profile.");
    recordKey(p.id, p.constraints);
  }
  assert(Array.isArray(input.records) && input.records.length === 24, "expected 24 recorded choices.");
  const seen = new Set();
  for (const r of input.records) {
    assert(r.key === recordKey(r.profile_id, r.constraints) && !seen.has(r.key), "record identity mismatch.");
    assert(Number.isInteger(r.constraint_mask) && r.constraint_mask >= 0 && r.constraint_mask <= 7 &&
      r.key === `${r.profile_id}-${r.constraint_mask}`, "mask mismatch.");
    const canonical = CONSTRAINTS.filter((_, bit) => r.constraint_mask & (1 << bit));
    assert(equals(r.constraints, canonical), "noncanonical constraints.");
    seen.add(r.key);
    const res = r.response;
    assert(res?.mock === true && equals(res.comparison?.constraints, r.constraints), "recorded constraints/source mismatch.");
    assert(res.plan && Array.isArray(res.plan.meals) && res.plan.meals.every((v) => pick(v, "restaurant")) &&
      (res.plan.outing === null || pick(res.plan.outing, "outing")), "invalid source picks.");
    assert(strings(res.plan.notes) && Array.isArray(res.plan.rejected) &&
      res.plan.rejected.every((v) => text(v.name) && Array.isArray(v.failed) &&
        v.failed.every((f) => text(f.constraint) && text(f.status) && text(f.reason))), "invalid rejection evidence.");
    assert(res.llm_only && Array.isArray(res.llm_only.meals) && res.llm_only.outing &&
      [...res.llm_only.meals, res.llm_only.outing].every((v) => DAYS.includes(v.day) && text(v.name) && text(v.why)),
      "invalid fixed comparison template.");
    assert(Array.isArray(res.trace) && res.trace.length > 0 &&
      res.trace.every((v) => text(v.tool) && text(v.result_summary)), "missing native trace.");
    assert(["grounded", "llm_only"].every((k) => res.comparison[k] &&
      ["picks", "with_qloo_entity_id", "with_affinity_evidence", "constraint_checked", "unsafe_candidates_rejected"]
        .every((n) => Number.isInteger(res.comparison[k][n]) && res.comparison[k][n] >= 0)),
      "invalid comparison counts.");
    assert(Array.isArray(r.pick_verdicts) && r.pick_verdicts.length === res.plan.meals.length + Number(!!res.plan.outing) &&
      r.pick_verdicts.every((v) => v.ok === true && Array.isArray(v.checks)), "missing recorded pick verdicts.");
    assert(Array.isArray(r.fixture_calls) && r.fixture_calls.length > 0, "missing fixture transport evidence.");
  }
  for (const id of PROFILES) for (let mask = 0; mask < 8; mask++) {
    assert(seen.has(`${id}-${mask}`), "a supported choice is missing.");
  }
  return freeze(structuredClone(input));
}

export function chooseRecord(catalogue, profileId, constraints) {
  const key = recordKey(profileId, constraints);
  const record = catalogue.records.find((r) => r.key === key);
  assert(record, "this choice was not recorded.");
  return record;
}
