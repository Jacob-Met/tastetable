import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { createWeekPlan } from "../static/week_plan.mjs";
import { makeWeekFile, readWeekFile } from "../static/week_file.mjs";

const cli = fileURLToPath(new URL("../tools/saved_week_to_html.mjs", import.meta.url));
const fixture = JSON.parse(readFileSync(new URL("./fixtures/saved-week-response.json", import.meta.url), "utf8"));
const inputs = {
  cuisines: ["Cuban", "Mexican"], music: ["Celia Cruz"], films: ["West Side Story"],
  city: "Pasadena", constraints: ["soft_foods", "low_sodium", "wheelchair"],
};
const source = makeWeekFile({
  response: fixture, inputs, state: createWeekPlan(fixture, "2026-10-08"),
  receivedAt: "2026-10-08T10:00:00.000Z", calendarId: "e9a27c3786b649e483a42cc1a0096fb0",
}, new Date("2026-10-08T10:05:00.000Z")).text;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function setup(t) {
  const directory = await fs.mkdtemp(join(tmpdir(), "tastetable-report-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const input = join(directory, "saved café week.json");
  const output = join(directory, "readable handoff.html");
  await fs.writeFile(input, source);
  return { directory, input, output };
}
function run(files, extra = [], argv = ["--input", files.input, "--output", files.output]) {
  return spawnSync(process.execPath, [...extra, cli, ...argv], {
    cwd: files.directory, encoding: "utf8", timeout: 15000,
  });
}
async function noStage(directory) {
  assert(!(await fs.readdir(directory)).some((name) => name.startsWith(".tastetable-report-")));
}

test("real CLI publishes a UTF-8 handoff and receipt without changing the input", async (t) => {
  const files = await setup(t);
  const result = run(files);
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.inputSha256, digest(source));
  assert.equal(receipt.weekStart, "2026-10-05");
  assert.equal(receipt.scheduled, 5);
  assert.equal(receipt.omitted, 0);
  assert.equal(receipt.sourceMode, "mock");
  assert.equal(receipt.output, resolve(files.output));
  const html = await fs.readFile(files.output, "utf8");
  assert(html.includes("saved café week.json") && html.startsWith("<!doctype html>"));
  assert(html.includes(receipt.inputSha256));
  assert.equal(await fs.readFile(files.input, "utf8"), source);
  assert.deepEqual(readWeekFile(source).response, fixture);
  await noStage(files.directory);
});

test("BOM input is accepted and the receipt fingerprints its exact bytes", async (t) => {
  const files = await setup(t);
  const bytes = Buffer.from("\uFEFF" + source, "utf8");
  await fs.writeFile(files.input, bytes);
  const result = run(files);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).inputSha256, digest(bytes));
  assert.deepEqual(await fs.readFile(files.input), bytes);
});

test("malformed, unsupported, non-UTF8 and over-limit input are refused before output", async (t) => {
  const files = await setup(t);
  const unsupported = JSON.parse(source);
  unsupported.format = "other";
  const invalidInputs = [
    "not JSON", JSON.stringify(unsupported), Buffer.from([0xff, 0xfe]),
    Buffer.alloc(4 * 1024 * 1024 + 1, 0x20),
  ];
  for (const bytes of invalidInputs) {
    await fs.writeFile(files.input, bytes);
    const result = run(files);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(await fs.stat(files.output).then(() => true, () => false), false);
    assert.equal(digest(await fs.readFile(files.input)), digest(bytes));
    await noStage(files.directory);
  }
});

test("missing and directory input are refused with no output", async (t) => {
  const files = await setup(t);
  for (const input of [join(files.directory, "missing.json"), files.directory]) {
    const result = run({ ...files, input });
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, "");
    assert.equal(await fs.stat(files.output).then(() => true, () => false), false);
  }
});

test("occupied file, directory and input aliases retain their original bytes", async (t) => {
  const files = await setup(t);
  await fs.writeFile(files.output, "original handoff");
  assert.equal(run(files).status, 2);
  assert.equal(await fs.readFile(files.output, "utf8"), "original handoff");
  assert.equal(run({ ...files, output: files.directory }).status, 2);
  assert.equal(run({ ...files, output: files.input }).status, 2);
  const alias = join(files.directory, "input-alias.json");
  await fs.link(files.input, alias);
  assert.equal(run({ ...files, output: alias }).status, 2);
  assert.equal(await fs.readFile(files.input, "utf8"), source);
  assert.equal(await fs.readFile(alias, "utf8"), source);
  await noStage(files.directory);
});

test("strict arguments and help do not consume the input or create a report", async (t) => {
  const files = await setup(t);
  const bad = [
    [], ["--input", files.input], ["--output", files.output],
    ["--input", "-", "--output", files.output],
    ["--input", files.input, "--output", "-"],
    ["--input", files.input, "--input", files.input, "--output", files.output],
    ["--help", "--input", files.input], ["--unknown", "x"],
  ];
  for (const argv of bad) {
    const result = run(files, [], argv);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
  }
  const help = run(files, [], ["--help"]);
  assert.equal(help.status, 0);
  assert(help.stdout.includes("saved_week_to_html.mjs"));
  assert.equal(await fs.stat(files.output).then(() => true, () => false), false);
  assert.equal(await fs.readFile(files.input, "utf8"), source);
});

test("missing output parent is a delivery failure without a partially accepted file", async (t) => {
  const files = await setup(t);
  files.output = join(files.directory, "missing", "handoff.html");
  assert.equal(run(files).status, 1);
  assert.equal(await fs.stat(files.output).then(() => true, () => false), false);
  await noStage(files.directory);
});

test("a competing output created before publication is preserved and the stage is removed", async (t) => {
  const files = await setup(t);
  const hook = join(files.directory, "race.mjs");
  await fs.writeFile(hook, [
    'import fs from "node:fs/promises";',
    'const original = fs.link;',
    'fs.link = async (source, destination) => {',
    '  await fs.writeFile(destination, "competing report", { flag: "wx" });',
    '  return original(source, destination);',
    '};',
  ].join("\n"));
  const result = run(files, ["--import", pathToFileURL(hook).href]);
  assert.equal(result.status, 2, result.stderr);
  assert.equal(await fs.readFile(files.output, "utf8"), "competing report");
  assert.equal(await fs.readFile(files.input, "utf8"), source);
  await noStage(files.directory);
});

test("a real partial staged write is removed and never published", async (t) => {
  const files = await setup(t);
  const hook = join(files.directory, "write-failure.mjs");
  await fs.writeFile(hook, [
    'import fs from "node:fs/promises";',
    'const original = fs.writeFile;',
    'fs.writeFile = async (name, bytes, options) => {',
    '  await original(name, bytes.slice(0, 37), options);',
    '  throw Object.assign(new Error("injected full disk after partial write"), { code: "ENOSPC" });',
    '};',
  ].join("\n"));
  const result = run(files, ["--import", pathToFileURL(hook).href]);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(await fs.stat(files.output).then(() => true, () => false), false);
  assert.equal(await fs.readFile(files.input, "utf8"), source);
  await noStage(files.directory);
});

test("failure after publication identifies the complete report and refuses overwrite on retry", async (t) => {
  const files = await setup(t);
  const hook = join(files.directory, "cleanup-failure.mjs");
  await fs.writeFile(hook, [
    'import fs from "node:fs/promises";',
    'fs.rm = async () => { throw new Error("injected cleanup failure"); };',
  ].join("\n"));
  const result = run(files, ["--import", pathToFileURL(hook).href]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert(result.stderr.includes("HTML handoff was created"));
  const report = await fs.readFile(files.output);
  assert(report.toString("utf8").includes("</html>"));
  assert.equal(run(files).status, 2);
  assert.deepEqual(await fs.readFile(files.output), report);
  assert.equal(await fs.readFile(files.input, "utf8"), source);
});

test("unrepresentable displayed JSON text is refused without publishing output", async (t) => {
  const files = await setup(t);
  for (const invalid of ["before\u0000after", "before\uD800after", "before\uDC00after"]) {
    const value = JSON.parse(source);
    value.response.plan.meals[0].why = invalid;
    const bytes = JSON.stringify(value);
    assert.equal(readWeekFile(bytes).response.plan.meals[0].why, invalid);
    await fs.writeFile(files.input, bytes);
    const result = run(files);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /NUL|unpaired UTF-16 surrogate/);
    assert.equal(await fs.stat(files.output).then(() => true, () => false), false);
    assert.equal(await fs.readFile(files.input, "utf8"), bytes);
    await noStage(files.directory);
  }
});
