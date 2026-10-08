#!/usr/bin/env node
/** Convert an explicit native offline result using the existing saved-week codec. */
import fs from "node:fs/promises";
import {writeSync} from "node:fs";
import {randomBytes} from "node:crypto";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {calendarWeek, createWeekPlan} from "../static/week_plan.mjs";
import {makeWeekFile, WEEK_FILE_FORMAT} from "../static/week_file.mjs";

const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const PROVENANCE = Object.freeze({
  mode: "offline-fixtures",
  policy: "ScriptedModel",
  transport: "FixtureTransport",
  data: "fictional venues and hand-set affinities",
  checks: "existing heuristics; no live provider validation",
});
const PROFILE_FIELDS = ["cuisines", "music", "films", "constraints", "city"];
const USAGE = `Usage:
  node tools/native_plan_to_week.mjs --input RESULT.json --week YYYY-MM-DD --output WEEK.json

Read a complete result from tastetable_cli.py and create an editable saved-week v1
file using the existing week model and writer. Any date selects its Monday-Sunday
week. The output parent must already exist and the output name must be unused.
Open the new file with Open saved week in the regular TasteTable application.

This is a fictional-fixture snapshot, not a new plan or venue verification.
The original result retains its outer provenance; the saved week preserves the
exact profile and response, including the mock label. File timestamps identify
this conversion and each conversion has a fresh calendar identity.

Requires Node.js 18+. Input is a regular UTF-8 file of at most 2 MiB (no stdin);
the complete saved week is limited to 4 MiB. No dependencies or provider calls.
`;

class InputError extends Error {}

function write(fd, text) {
  const bytes = Buffer.from(text, "utf8");
  let offset = 0;
  while (offset < bytes.length) {
    const count = writeSync(fd, bytes, offset, bytes.length - offset);
    if (!count) throw new Error("Output accepted no bytes.");
    offset += count;
  }
}

function diagnostic(message) {
  try { write(2, "tastetable-week: " + message + "\n"); }
  catch { /* Preserve the actual failure code when diagnostics cannot be delivered. */ }
}

function argumentsFor(argv) {
  if (argv.length === 1 && argv[0] === "--help") return null;
  const names = new Map([["--input", "input"], ["--week", "week"], ["--output", "output"]]);
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const name = names.get(option);
    if (!name) throw new InputError("Unknown option: " + option + ". Use --help.");
    if (Object.hasOwn(values, name)) throw new InputError("Repeated option: " + option + ".");
    const value = argv[index + 1];
    if (typeof value !== "string" || !value || names.has(value) || value === "--help") {
      throw new InputError("A value is required for " + option + ".");
    }
    values[name] = value;
  }
  for (const name of names.values()) {
    if (!Object.hasOwn(values, name)) throw new InputError("--" + name + " is required. Use --help.");
  }
  if (values.input === "-") throw new InputError("Choose a completed native result file; stdin is not accepted.");
  try { calendarWeek(values.week); }
  catch (error) { throw new InputError(error.message); }
  return values;
}

function fields(value, expected, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError(label + " must be an object.");
  }
  const keys = Object.keys(value);
  if (keys.length !== expected.length || expected.some((key) => !Object.hasOwn(value, key))) {
    throw new InputError(label + " has missing or unsupported fields.");
  }
}

async function readResult(filename) {
  let handle;
  let bytes;
  try {
    // Refuse ordinary non-files before opening; verify the opened object as well.
    if (!(await fs.stat(filename)).isFile()) throw new Error("Choose a regular file.");
    handle = await fs.open(filename, "r");
    if (!(await handle.stat()).isFile()) throw new Error("Choose a regular file.");
    const buffer = Buffer.alloc(MAX_INPUT_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const result = await handle.read(buffer, length, buffer.length - length, null);
      if (result.bytesRead === 0) break;
      length += result.bytesRead;
    }
    if (length > MAX_INPUT_BYTES) throw new Error("Native result exceeds 2 MiB.");
    bytes = buffer.subarray(0, length);
  } catch (error) {
    throw new InputError("Cannot read native result: " + error.message);
  } finally {
    if (handle) await handle.close();
  }
  let value;
  try {
    const text = new TextDecoder("utf-8", {fatal: true}).decode(bytes);
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new InputError("Choose a complete UTF-8 JSON result from tastetable_cli.py.");
  }
  fields(value, ["provenance", "profile", "response"], "Native result");
  fields(value.provenance, Object.keys(PROVENANCE), "Native provenance");
  for (const [key, expected] of Object.entries(PROVENANCE)) {
    if (value.provenance[key] !== expected) {
      throw new InputError("Unsupported native provenance marker: " + key + ".");
    }
  }
  fields(value.profile, PROFILE_FIELDS, "Native profile");
  if (value.response === null || typeof value.response !== "object"
      || Array.isArray(value.response) || value.response.mock !== true) {
    throw new InputError("The native response must retain its fictional-fixture mock label.");
  }
  // The existing writer owns input/response/state admission. This does not
  // rerun or independently normalize the Python producer's profile rules.
  return value;
}

async function createOnly(filename, bytes, markPublished) {
  try {
    await fs.lstat(filename);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return publish();
  }
  throw new InputError("Output already exists; choose a new filename.");

  async function publish() {
    // Existing parent only. All staged bytes close successfully before a
    // same-filesystem hard link publishes the unused final name atomically.
    const stage = await fs.mkdtemp(join(dirname(filename), ".tastetable-week-"));
    try {
      const stagedFile = join(stage, "completed.json");
      await fs.writeFile(stagedFile, bytes, {flag: "wx"});
      try {
        await fs.link(stagedFile, filename);
        markPublished();
      }
      catch (error) {
        if (error.code === "EEXIST") {
          throw new InputError("Output appeared during conversion; choose a new filename.");
        }
        throw error;
      }
    } finally {
      await fs.rm(stage, {recursive: true, force: true});
    }
  }
}

export async function main(argv = process.argv.slice(2)) {
  let published = false;
  try {
    const args = argumentsFor(argv);
    if (args === null) {
      write(1, USAGE);
      return 0;
    }
    const result = await readResult(args.input);
    const created = new Date();
    let output;
    let state;
    const calendarId = randomBytes(16).toString("hex");
    try {
      state = createWeekPlan(result.response, args.week);
      output = makeWeekFile({
        response: result.response,
        inputs: result.profile,
        state,
        receivedAt: created.toISOString(),
        calendarId,
      }, created);
      if (Buffer.byteLength(output.text, "utf8") > MAX_OUTPUT_BYTES) {
        throw new Error("Saved week exceeds 4 MiB.");
      }
    } catch (error) {
      throw new InputError("Native result cannot form a saved week: " + error.message);
    }
    const destination = resolve(args.output);
    await createOnly(destination, Buffer.from(output.text, "utf8"), () => { published = true; });
    write(1, JSON.stringify({
      output: destination,
      format: WEEK_FILE_FORMAT,
      weekStart: state.weekStart,
      picks: state.picks.length,
      createdAt: created.toISOString(),
      calendarId,
      provenance: result.provenance,
    }) + "\n");
    return 0;
  } catch (error) {
    diagnostic((published ? "Saved week was created, but final cleanup or receipt delivery failed: " : "")
      + (error?.message || String(error)));
    return error instanceof InputError ? 2 : 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = await main();
}
