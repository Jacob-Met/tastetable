import test from "node:test";
import assert from "node:assert/strict";
import { describePlanningContext, normalizePlanningInputs, readPlanningInputs } from "../static/planning_context.mjs";

const current = { city: "Pasadena", cuisines: ["Cuban", "Mexican"], music: ["Celia Cruz"], films: ["West Side Story"], constraints: ["low_sodium", "wheelchair"] };

test("edited city and removed care needs are clearly separate from the current week", () => {
  const draft = { ...current, city: "Los Angeles", constraints: ["wheelchair"] };
  const state = describePlanningContext({ acceptedInputs: current, draftInputs: draft });
  assert.equal(state.rows.find(row => row.key === "city").value, "Pasadena");
  assert.deepEqual(state.changes, [
    { key: "city", label: "City", before: "Pasadena", after: "Los Angeles" },
    { key: "constraints", label: "Care needs", before: "Low sodium, Wheelchair access", after: "Wheelchair access" },
  ]);
  assert.match(state.notice, /current week still uses/);
  assert.deepEqual(current.constraints, ["low_sodium", "wheelchair"]);
});

test("emptying a field is a real change and keeps accepted details readable", () => {
  const state = describePlanningContext({ acceptedInputs: current, draftInputs: { ...current, cuisines: [], constraints: [] } });
  assert.equal(state.changes.find(row => row.key === "cuisines").after, "Not specified");
  assert.equal(state.changes.find(row => row.key === "constraints").after, "None selected");
  assert.equal(state.rows.find(row => row.key === "cuisines").value, "Cuban, Mexican");
});

test("cosmetic whitespace, order, repeated tastes and checkbox order do not suggest a different request", () => {
  const state = describePlanningContext({ acceptedInputs: current, draftInputs: {
    ...current, city: " Pasadena ", cuisines: ["mexican", " Cuban ", "Cuban"], constraints: ["wheelchair", "low_sodium"],
  } });
  assert.equal(state.changed, false);
  assert.equal(state.changes.length, 0);
});

test("pending and failed/canceled replacement descriptions preserve the original request", () => {
  const draft = { ...current, music: ["Ella Fitzgerald"] };
  const waiting = describePlanningContext({ acceptedInputs: current, draftInputs: draft, pending: true });
  assert.match(waiting.notice, /current week remains available/);
  const canceled = describePlanningContext({ acceptedInputs: current, draftInputs: draft, pending: false });
  assert.equal(canceled.rows.find(row => row.key === "music").value, "Celia Cruz");
  const replaced = describePlanningContext({ acceptedInputs: draft, draftInputs: draft });
  assert.equal(replaced.changed, false);
  assert.equal(replaced.rows.find(row => row.key === "music").value, "Ella Fitzgerald");
});

test("first request never implies that a current plan exists", () => {
  const state = describePlanningContext({ draftInputs: { city: "Pasadena" }, pending: true });
  assert.equal(state.hasCurrentWeek, false);
  assert.equal(state.changed, false);
  assert.equal(state.notice, "Finding a week with these preferences.");
});

test("request reader keeps actual input values and selected care needs", () => {
  const values = { city: { value: " Pasadena " }, cuisines: { value: "Cuban, , Mexican" }, music: { value: "" }, films: { value: "West Side Story" } };
  const form = { elements: { namedItem: name => values[name] }, querySelectorAll: () => [{ value: "wheelchair" }] };
  assert.deepEqual(readPlanningInputs(form), { city: " Pasadena ", cuisines: ["Cuban", "Mexican"], music: [], films: ["West Side Story"], constraints: ["wheelchair"] });
});

test("unfamiliar supported labels remain visible instead of disappearing", () => {
  const normalized = normalizePlanningInputs({ constraints: ["hearing_loop"], films: ["<b>Film</b>"] });
  const state = describePlanningContext({ acceptedInputs: normalized, draftInputs: normalized });
  assert.equal(state.rows.find(row => row.key === "constraints").value, "hearing_loop");
  assert.equal(state.rows.find(row => row.key === "films").value, "<b>Film</b>");
});
