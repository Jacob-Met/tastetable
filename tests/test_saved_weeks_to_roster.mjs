import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { createWeekPlan } from "../static/week_plan.mjs";
import { makeWeekFile } from "../static/week_file.mjs";

const cli = fileURLToPath(new URL("../tools/saved_weeks_to_roster.mjs", import.meta.url));
const fixture = JSON.parse(await fs.readFile(new URL("./fixtures/saved-week-response.json", import.meta.url), "utf8"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function saved(anchor = "2026-10-08") {
  return makeWeekFile({ response: fixture,
    inputs: { city: "Pasadena", cuisines: ["Cuban"], music: [], films: [], constraints: fixture.comparison.constraints },
    state: createWeekPlan(fixture, anchor), receivedAt: "2026-10-08T10:00:00.000Z", calendarId: null,
  }, new Date("2026-10-08T10:05:00.000Z")).text;
}
async function setup(t) {
  const dir = await fs.mkdtemp(join(tmpdir(), "tastetable-roster-test-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const a = join(dir, "first", "saved-week.json"), b = join(dir, "second", "saved-week.json"), output = join(dir, "roster.html");
  await fs.mkdir(dirname(a)); await fs.mkdir(dirname(b));
  await fs.writeFile(a, saved()); await fs.writeFile(b, saved());
  return { dir, a, b, output };
}
function invoke(args, code) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, code ? ["--input-type=module", "-e", code, "--", ...args] : [cli, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    p.stdout.on("data", (data) => { stdout += data; }); p.stderr.on("data", (data) => { stderr += data; });
    p.on("error", reject); p.on("close", (exit, signal) => resolve({ exit, signal, stdout, stderr }));
  });
}
const args = (a, b, output) => ["--input", a, "--input", b, "--output", output];
const absent = async (path) => assert.rejects(fs.lstat(path), { code: "ENOENT" });
const harness = (patch) => `import fs from 'node:fs/promises'; ${patch}\nconst {main}=await import(${JSON.stringify(pathToFileURL(cli).href)}); process.exitCode=await main(process.argv.slice(1));`;

test("actual multi-file CLI preserves captured bytes, ordered equal basenames and repeat paths", async (t) => {
  const { a, b, output } = await setup(t);
  const bytes = await fs.readFile(a), original = await fs.stat(a);
  const result = await invoke([...args(a, b, output), "--input", a]);
  assert.equal(result.exit, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.format, "tastetable.week-roster.v1");
  assert.deepEqual(receipt.sources.map((s) => [s.ordinal, s.input, s.sourceName, s.sourceSha256]),
    [a, b, a].map((path, i) => [i + 1, resolve(path), "saved-week.json", hash(bytes)]));
  assert.deepEqual([receipt.picks, receipt.scheduled, receipt.omitted], [15, 15, 0]);
  assert.equal((await fs.readFile(output, "utf8")).split('data-occurrence="').length - 1, 15);
  assert.deepEqual(await fs.readFile(a), bytes);
  assert.equal((await fs.stat(a)).mtimeMs, original.mtimeMs);
});

test("one through twenty input occurrences are supported with a fresh destination", async (t) => {
  const { a, output, dir } = await setup(t);
  assert.equal((await invoke(["--input", a, "--output", output])).exit, 0);
  const many = await invoke([...Array(20).fill(["--input", a]).flat(), "--output", join(dir, "twenty.html")]);
  assert.equal(many.exit, 0, many.stderr);
  assert.equal(JSON.parse(many.stdout).sources.length, 20);
});

test("mixed weeks and a malformed later source refuse the entire roster before publication", async (t) => {
  const { a, b, output, dir } = await setup(t);
  for (const text of [saved("2026-10-12"), "not JSON", JSON.stringify({ ...JSON.parse(saved()), format: "future" })]) {
    await fs.writeFile(b, text);
    const result = await invoke(args(a, b, output));
    assert.equal(result.exit, 2, result.stderr); assert(result.stderr.includes("Source 2"));
    await absent(output);
    assert(!(await fs.readdir(dir)).some((name) => name.startsWith(".tastetable-roster-")));
  }
});

test("existing outputs, input aliases, directories and dangling symlinks are preserved", async (t) => {
  const { a, b, output, dir } = await setup(t);
  await fs.writeFile(output, "existing sentinel");
  const alias = join(dir, "alias.json"), link = join(dir, "dangling");
  await fs.link(a, alias); await fs.symlink(join(dir, "absent-target"), link);
  const bytes = await fs.readFile(a), stat = await fs.stat(a);
  for (const destination of [output, a, alias, dir, link]) {
    const result = await invoke(args(a, b, destination));
    assert.equal(result.exit, 2, result.stderr); assert(result.stderr.includes("Output already exists"));
  }
  assert.equal(await fs.readFile(output, "utf8"), "existing sentinel");
  assert.deepEqual(await fs.readFile(a), bytes); assert.equal((await fs.stat(a)).ino, stat.ino);
  assert.equal(await fs.readlink(link), join(dir, "absent-target"));
});

test("two actual competing exporters publish exactly one complete roster", async (t) => {
  const { a, b, output } = await setup(t);
  const results = await Promise.all([invoke(args(a, b, output)), invoke(args(a, b, output))]);
  assert.deepEqual(results.map((r) => r.exit).sort(), [0, 2]);
  const html = await fs.readFile(output, "utf8");
  assert(html.endsWith("</main></body></html>\n"));
  assert.equal(html.split('data-occurrence="').length - 1, 10);
});

test("invalid UTF-8 and over-limit individual or combined input bytes refuse", async (t) => {
  const { a, b, output } = await setup(t);
  for (const bytes of [Buffer.from([0xc3, 0x28]), Buffer.alloc(4 * 1024 * 1024 + 1, 32)]) {
    await fs.writeFile(b, bytes);
    const result = await invoke(args(a, b, output));
    assert.equal(result.exit, 2, result.stderr); await absent(output);
  }
  const exact = saved() + " ".repeat(4 * 1024 * 1024 - Buffer.byteLength(saved()));
  await fs.writeFile(a, exact);
  assert.equal((await invoke(["--input", a, "--output", output])).exit, 0);
  await fs.unlink(output);
  const total = await invoke([...Array(5).fill(["--input", a]).flat(), "--output", output]);
  assert.equal(total.exit, 2); assert(total.stderr.includes("16 MiB")); await absent(output);
});

test("rendered size limit refuses expansion without publishing a partial file", async (t) => {
  const { a, output } = await setup(t);
  const file = JSON.parse(saved()); file.response.plan.meals[0].why = "&".repeat(1_800_000);
  await fs.writeFile(a, JSON.stringify(file));
  const result = await invoke([...Array(4).fill(["--input", a]).flat(), "--output", output]);
  assert.equal(result.exit, 2, result.stderr); assert(result.stderr.includes("32 MiB")); await absent(output);
});

test("a compact saved source stops repeated UTF-8 constraint expansion at the existing output cap", async (t) => {
  const { a, output, dir } = await setup(t);
  const file = JSON.parse(saved());
  const constraint = "界".repeat(32768);
  file.inputs.constraints = file.response.comparison.constraints = [constraint];
  file.response.plan.meals = Array.from({ length: 512 }, () => ({ ...fixture.plan.meals[0] }));
  file.response.plan.outing = null;
  file.week.assignments = Object.fromEntries(file.response.plan.meals.map((_, index) => ["pick-" + index, "Monday"]));
  const bytes = Buffer.from(JSON.stringify(file));
  assert(bytes.length < 1024 * 1024, "A compact source, below the existing 4 MiB input admission");
  assert(Buffer.byteLength(constraint) * 512 > 32 * 1024 * 1024,
    "Repeated constraint text alone exceeds the advertised output limit in UTF-8 bytes");
  await fs.writeFile(a, bytes);
  const result = await invoke(["--input", a, "--output", output]);
  assert.equal(result.exit, 2, result.stderr);
  assert(result.stderr.includes("Rendered roster exceeds 32 MiB"));
  await absent(output);
  assert.deepEqual(await fs.readFile(a), bytes);
  assert(!(await fs.readdir(dir)).some((name) => name.startsWith(".tastetable-roster-")));
});

test("UTF-8 BOM, Unicode filenames and readable symlink inputs retain raw byte digests", async (t) => {
  const { a, output, dir } = await setup(t);
  const unicode = join(dir, "café 老朋友.json"), link = join(dir, "alias-week.json");
  const bytes = Buffer.from("\ufeff" + saved());
  await fs.writeFile(unicode, bytes); await fs.symlink(unicode, link);
  const result = await invoke(args(unicode, link, output));
  assert.equal(result.exit, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).sources.map((s) => s.sourceSha256), [hash(bytes), hash(bytes)]);
  assert.equal(await fs.readlink(link), unicode); assert.equal(await fs.readFile(a, "utf8"), saved());
});

test("missing files, parent and nonregular inputs have no final output", async (t) => {
  const { a, b, output, dir } = await setup(t);
  for (const input of [dir, join(dir, "missing.json")]) {
    assert.equal((await invoke(args(a, input, output))).exit, 2); await absent(output);
  }
  const result = await invoke(args(a, b, join(dir, "missing", "roster.html")));
  assert.equal(result.exit, 1); await absent(join(dir, "missing"));
  if (process.platform !== "win32") {
    const fifo = join(dir, "pipe"); await promisify(execFile)("mkfifo", [fifo]);
    assert.equal((await invoke(args(a, fifo, output))).exit, 2); await absent(output);
  }
});

test("strict CLI options refuse empty, unknown, repeated singular and stream arguments", async (t) => {
  const { a, output } = await setup(t);
  for (const invalid of [[], ["--help", "extra"], ["--unknown", "x"], ["--input"], ["--input", ""],
    ["--input", a], ["--output", output], ["--input", "-", "--output", output],
    ["--input", a, "--output", "-"], ["--input", a, "--output", output, "--output", output],
    [...Array(21).fill(["--input", a]).flat(), "--output", output]]) {
    assert.equal((await invoke(invalid)).exit, 2); await absent(output);
  }
  const help = await invoke(["--help"]); assert.equal(help.exit, 0); assert(help.stdout.includes("same-week"));
});

test("write failure before publication removes the stage and publishes nothing", async (t) => {
  const { a, b, output, dir } = await setup(t);
  const result = await invoke(args(a, b, output), harness(`const original=fs.writeFile; fs.writeFile=async(path,data,options)=>{await original(path,data.slice(0,20),options); throw new Error('injected partial write');};`));
  assert.equal(result.exit, 1); assert(result.stderr.includes("injected partial write")); await absent(output);
  assert(!(await fs.readdir(dir)).some((name) => name.startsWith(".tastetable-roster-")));
});

test("a final-name race preserves the other writer and cleans only the owned stage", async (t) => {
  const { a, b, output, dir } = await setup(t);
  const result = await invoke(args(a, b, output), harness(`const original=fs.link; fs.link=async(from,to)=>{await fs.writeFile(to,'other writer',{flag:'wx'}); return original(from,to);};`));
  assert.equal(result.exit, 2); assert.equal(await fs.readFile(output, "utf8"), "other writer");
  assert(!(await fs.readdir(dir)).some((name) => name.startsWith(".tastetable-roster-")));
});

test("post-publication cleanup or receipt failure reports the existing completed roster", async (t) => {
  const { a, b, output, dir } = await setup(t);
  for (const [name, patch] of [
    ["cleanup", "fs.rm=async()=>{throw new Error('injected cleanup failure');};"],
    ["receipt", "const {closeSync}=await import('node:fs'); closeSync(1);"],
  ]) {
    const destination = join(dir, name + ".html");
    const result = await invoke(args(a, b, destination), harness(patch));
    assert.equal(result.exit, 1); assert(result.stderr.includes("HTML roster was created"));
    assert((await fs.readFile(destination, "utf8")).endsWith("</main></body></html>\n"));
    assert.equal((await invoke(args(a, b, destination))).exit, 2);
  }
  await absent(output);
});
