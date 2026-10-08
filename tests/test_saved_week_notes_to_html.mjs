import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createWeekPlan } from "../static/week_plan.mjs";
import { makeWeekFile } from "../static/week_file.mjs";
import { createVenueFollowup } from "../static/venue_followup.mjs";
import { makeVenueNoteFile } from "../static/venue_note_file.mjs";

const cli = fileURLToPath(new URL("../tools/saved_week_to_html.mjs", import.meta.url));
const digest = (value) => createHash("sha256").update(value).digest("hex");
async function setup(t) {
  const dir = await fs.mkdtemp(join(tmpdir(), "tastetable-notes-海-")); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const response = JSON.parse(readFileSync(new URL("./fixtures/saved-week-response.json", import.meta.url), "utf8"));
  const inputs = { cuisines: [], music: [], films: [], city: "", constraints: response.comparison.constraints };
  const origin = { response, inputs, receivedAt: "2026-10-08T10:00:00.000Z", calendarId: null };
  const state = createWeekPlan(response, "2026-12-28"), model = createVenueFollowup(state);
  model.setField(state, "pick-0", "2026-12-28", "reply", "Authored reply 海\r\n  exact");
  const week = makeWeekFile({ ...origin, state }, new Date("2026-10-08T10:05:00.000Z")).text;
  const notes = makeVenueNoteFile({ origin, state, model }, new Date("2026-10-08T10:10:00.000Z")).text;
  const input = join(dir, "week 海.json"), companion = join(dir, "notes 海.json"), output = join(dir, "handoff 海.html");
  await fs.writeFile(input, week); await fs.writeFile(companion, notes);
  return { dir, input, companion, output, week, notes };
}
function run(f, args = ["--input", f.input, "--output", f.output, "--venue-notes", f.companion]) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", timeout: 15000 });
}
async function unchanged(f) {
  assert.equal(await fs.readFile(f.input, "utf8"), f.week);
  assert(!(await fs.readdir(f.dir)).some((x) => x.startsWith(".tastetable-report-")));
}

test("real CLI physically publishes exact companion identity and counts", async (t) => {
  const f = await setup(t), result = run(f);
  assert.equal(result.status, 0, result.stderr); const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.venueNotes.input, f.companion);
  assert.equal(receipt.venueNotes.inputSha256, digest(f.notes));
  assert.deepEqual([receipt.venueNotes.records, receipt.venueNotes.matchedRecords, receipt.venueNotes.retainedRecords], [1, 1, 0]);
  const html = await fs.readFile(f.output, "utf8"); assert.match(html, /Authored reply 海&#13;\n  exact/);
  assert(html.includes(digest(f.notes))); assert(html.includes(digest(f.week)));
  assert.equal(await fs.readFile(f.companion, "utf8"), f.notes); await unchanged(f);
});

test("bad companion bytes/schema/origin refuse with no artifact or input change", async (t) => {
  const f = await setup(t), mismatch = JSON.parse(f.notes); mismatch.origin.receivedAt = "2026-10-08T10:00:00.001Z";
  const invalid = ["{", JSON.stringify(mismatch), Buffer.from([0xff]), Buffer.alloc(2 * 1024 * 1024 + 1, 32)];
  const unrepresentable = JSON.parse(f.notes); unrepresentable.records[0].note.nextStep = "\0";
  invalid.push(JSON.stringify(unrepresentable));
  for (const bytes of invalid) {
    await fs.writeFile(f.companion, bytes); const result = run(f);
    assert.equal(result.status, 2, result.stderr); assert.equal(result.stdout, "");
    assert.equal(await fs.stat(f.output).then(() => true, () => false), false);
    assert.equal(digest(await fs.readFile(f.companion)), digest(bytes)); await unchanged(f);
  }
});

test("missing/directory notes and strict option refusals preserve the filesystem", async (t) => {
  const f = await setup(t);
  for (const companion of [join(f.dir, "absent.json"), f.dir, "-"]) {
    const result = run({ ...f, companion }); assert.equal(result.status, 2); assert.equal(result.stdout, "");
  }
  for (const tail of [["--venue-notes"], ["--venue-notes", f.companion, "--venue-notes", f.companion]]) {
    assert.equal(run(f, ["--input", f.input, "--output", f.output, ...tail]).status, 2);
  }
  assert.equal(await fs.stat(f.output).then(() => true, () => false), false); await unchanged(f);
});

test("occupied output and notes/input aliases retain their exact bytes", async (t) => {
  const f = await setup(t); await fs.writeFile(f.output, "Keep the old handoff");
  const alias = join(f.dir, "notes hardlink.json"); await fs.link(f.companion, alias);
  for (const output of [f.output, f.companion, f.input, alias, f.dir]) {
    assert.equal(run({ ...f, output }).status, 2);
  }
  assert.equal(await fs.readFile(f.output, "utf8"), "Keep the old handoff");
  assert.equal(await fs.readFile(f.companion, "utf8"), f.notes);
  assert.equal(await fs.readFile(alias, "utf8"), f.notes); await unchanged(f);
});

test("BOM companion fingerprints raw bytes and no-companion receipt remains unchanged in shape", async (t) => {
  const f = await setup(t), bytes = Buffer.from("\uFEFF" + f.notes);
  await fs.writeFile(f.companion, bytes); const result = run(f);
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).venueNotes.inputSha256, digest(bytes));
  const plain = run(f, ["--input", f.input, "--output", join(f.dir, "plain.html")]);
  assert.equal(plain.status, 0, plain.stderr); assert(!Object.hasOwn(JSON.parse(plain.stdout), "venueNotes"));
  assert.equal(await fs.readFile(f.companion).then(digest), digest(bytes)); await unchanged(f);
});
