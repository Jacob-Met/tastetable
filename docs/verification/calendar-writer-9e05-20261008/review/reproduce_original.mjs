import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import {
  createWeekPlan, setPickDay, setWeek, weekRows,
} from "./sibling-snapshot/static/week_plan.mjs";

const require = createRequire(import.meta.url);
const writer = require("./original-writer/calendar.js");
const response = JSON.parse(readFileSync(new URL("./native_results.json", import.meta.url))).results.rosa;
const initial = createWeekPlan(response, "2026-10-08");
const changed = setPickDay(setPickDay(initial, "pick-0", "Wednesday"), "pick-4", null);
const session = writer.createPlanExport(response, {
  id: "a".repeat(32), createdAt: new Date("2026-10-08T08:00:00Z"),
});
const expected = weekRows(changed).flatMap(({ day, date, picks }) => picks.map(({ key, pick }) => ({ key, day, date, name: pick.name })));
const originalPreview = session.preview(changed.weekStart);
assert.equal(expected.length, 4);
assert.equal(originalPreview.length, 5);
assert.equal(expected.find(({ key }) => key === "pick-0").day, "Wednesday");
assert.equal(originalPreview.find(({ name }) => name === "Casa Habana Kitchen").day, "Monday");

// Repacking arranged rows as a new raw native plan is also not a valid adapter:
// the existing writer refuses the legitimate two-restaurant Wednesday schedule.
const repacked = structuredClone(response);
repacked.plan.meals = weekRows(changed).flatMap(({ day, picks }) => picks.filter(({ pick }) => pick.kind === "restaurant").map(({ pick }) => ({ ...pick, day })));
repacked.plan.outing = null;
let repackError;
try { writer.createPlanExport(repacked, { id: "a".repeat(32) }); }
catch (error) { repackError = error.message; }
assert.match(repackError, /repeats a day and type/);

const uids = (output) => [...output.text.replace(/\r\n /g, "").matchAll(/^UID:(.*)$/gm)].map((match) => match[1].trim());
const oldIDs = uids(session.download(initial.weekStart));
const nextWeek = setWeek(initial, "2026-10-15");
const newIDs = uids(session.download(nextWeek.weekStart));
assert.notDeepEqual(oldIDs, newIDs);
const evidence = {
  schema: "calendar-original-composition-counterexample.v1",
  node: process.version,
  original_writer_sha256: createHash("sha256").update(readFileSync(new URL("./original-writer/calendar.js", import.meta.url))).digest("hex"),
  planner_sha256: createHash("sha256").update(readFileSync(new URL("./sibling-snapshot/static/week_plan.mjs", import.meta.url))).digest("hex"),
  expected_arrangement: expected,
  raw_response_export_preview: originalPreview,
  arranged_response_repack_error: repackError,
  same_source_old_week_uids: oldIDs,
  same_source_new_week_uids: newIDs,
  actual_product_integration_claim: false,
  conclusion: "The original writer cannot consume arranged week state. Raw-response export ignores move/omission, repacking rejects legitimate same-kind co-scheduling, and original event identity changes with the week.",
};
writeFileSync(new URL("./original-composition-counterexample.json", import.meta.url), JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify({ reproduced: true, raw_response_event_count: originalPreview.length, arranged_event_count: expected.length, repackError, unchanged_week_uids: false }));
