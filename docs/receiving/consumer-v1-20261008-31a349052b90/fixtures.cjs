"use strict";
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
function fixture(label, mealDays = DAYS, outingDay = "Saturday") {
  const meals = mealDays.map((day, index) => ({
    day, kind: "restaurant", entity_id: label + "-meal-" + (index === 2 ? 0 : index),
    name: label + " restaurant " + day, affinity: 0.61 + index / 100,
    why: "Authored original explanation for " + label + " meal occurrence " + index + ".",
    fallback: index === 1,
  }));
  const outing = outingDay === null ? null : {
    day: outingDay, kind: "outing", entity_id: label + "-outing",
    name: label + " cultural outing", affinity: 0.75,
    why: "Authored original explanation for " + label + " outing.", fallback: false,
  };
  const count = meals.length + Number(outing !== null);
  return {
    mock: true,
    plan: { meals, outing, notes: [label + ": authored fixture; no provider or venue lookup occurred."], rejected: [] },
    llm_only: {
      meals: [{ day: "Monday", name: label + " unverified comparison meal", why: "Comparison fixture only." }],
      outing: { day: "Sunday", name: label + " unverified comparison outing", why: "Comparison fixture only." },
    },
    comparison: {
      constraints: ["wheelchair"],
      grounded: { picks: count, with_qloo_entity_id: count, with_affinity_evidence: count, constraint_checked: count, unsafe_candidates_rejected: 0 },
      llm_only: { picks: 2 },
    },
    trace: [{ tool: "authored_fixture", args: {}, result_summary: "No external calls." }],
  };
}
function cases() {
  const mutations = [
    ["plan.notes = null", r => { r.plan.notes = null; }],
    ["trace = null", r => { r.trace = null; }],
    ["comparison.constraints = string", r => { r.comparison.constraints = "wheelchair"; }],
    ["comparison.constraints = array-like object", r => { r.comparison.constraints = { 0: "wheelchair", length: 1 }; }],
    ["llm_only.meals = null", r => { r.llm_only.meals = null; }],
    ["llm_only.outing = null", r => { r.llm_only.outing = null; }],
    ["plan.meals[0].affinity = string", r => { r.plan.meals[0].affinity = "0.90"; }],
    ["plan.rejected[0].failed = null", r => { r.plan.rejected = [{ name: "Authored rejected candidate", failed: null }]; }],
  ];
  return mutations.map(([field, mutate], index) => {
    const stable = fixture("Stable-" + index);
    stable.mock = false; // Authored source-label control, not an actual provider result.
    const malformed = fixture("Incoming-" + index);
    mutate(malformed);
    const recovery = index % 2 ? fixture("Recovered-" + index, [], "Sunday")
      : fixture("Recovered-" + index, ["Monday", "Friday"], null);
    return { field, stable, malformed, recovery };
  });
}
const personas = [{ id: "authored", label: "Authored fictional receiving fixture", city: "Fixture city", cuisines: ["Fixture cuisine"], music: [], films: [], constraints: ["wheelchair"] }];
module.exports = { DAYS, fixture, cases, personas };
