#!/usr/bin/env node
/** Make a create-only printable roster from explicit saved-week files. */
import fs from "node:fs/promises";
import { writeSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_ROSTER_SOURCES, MAX_ROSTER_HTML_BYTES, renderSavedWeekRoster } from "../static/week_roster.mjs";

const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_INPUT_BYTES = 16 * 1024 * 1024;
const USAGE = [
  "Usage:",
  "  node tools/saved_weeks_to_roster.mjs --input A.json --input B.json --output ROSTER.html",
  "",
  "Read 1–20 same-week saved files through TasteTable's existing codec and make a",
  "standalone day-by-day roster. Open it in a browser to read or print offline.",
  "Inputs are completed regular UTF-8 files: 4 MiB each, 16 MiB total; no stdin.",
  "The output parent must exist and its filename must be unused.",
  "",
  "Preserves arranged dates, original explanations, saved/source timestamps and",
  "source labels per ordered input. Repeated inputs stay separate. No new checks,",
  "provider calls, inferred person identities or shared-venue decisions. Venue worksheet notes are not included.",
  "Requires Node.js 18+ with no npm dependencies.",
  "",
].join("\n");

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

function argsFor(argv) {
  if (argv.length === 1 && argv[0] === "--help") return null;
  const args = { inputs: [] };
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    if (option !== "--input" && option !== "--output") throw new InputError("Unknown option: " + option + ". Use --help.");
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new InputError("A value is required for " + option + ".");
    if (value === "-") throw new InputError("Choose explicit files; streams are not accepted.");
    if (option === "--input") {
      args.inputs.push(value);
      if (args.inputs.length > MAX_ROSTER_SOURCES) throw new InputError("Choose at most 20 saved weeks.");
    } else {
      if (Object.hasOwn(args, "output")) throw new InputError("Repeated option: --output.");
      args.output = value;
    }
  }
  if (!args.inputs.length || !args.output) throw new InputError("--input and --output are required. Use --help.");
  return args;
}

async function readInput(filename) {
  let handle;
  try {
    if (!(await fs.stat(filename)).isFile()) throw new Error("Choose a regular file.");
    handle = await fs.open(filename, "r");
    if (!(await handle.stat()).isFile()) throw new Error("Choose a regular file.");
    const buffer = Buffer.alloc(MAX_INPUT_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const result = await handle.read(buffer, length, buffer.length - length, null);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length > MAX_INPUT_BYTES) throw new Error("Saved week exceeds 4 MiB.");
    const bytes = buffer.subarray(0, length);
    return {
      bytes: length,
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch (error) {
    throw new InputError("Cannot read saved week: " + error.message);
  } finally {
    if (handle) await handle.close();
  }
}

async function createOnly(filename, html, markPublished) {
  try {
    await fs.lstat(filename);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return publish();
  }
  throw new InputError("Output already exists; choose a new filename.");

  async function publish() {
    // Use the existing converter's create-only delivery convention: close the
    // completed stage before a same-filesystem hard link admits the final name.
    const stage = await fs.mkdtemp(join(dirname(filename), ".tastetable-roster-"));
    try {
      const stagedFile = join(stage, "completed.html");
      await fs.writeFile(stagedFile, html, { encoding: "utf8", flag: "wx" });
      try {
        await fs.link(stagedFile, filename);
        markPublished();
      } catch (error) {
        if (error.code === "EEXIST") throw new InputError("Output appeared while rendering; choose a new filename.");
        throw error;
      }
    } finally {
      await fs.rm(stage, { recursive: true, force: true });
    }
  }
}

export async function main(argv = process.argv.slice(2)) {
  let published = false;
  try {
    const args = argsFor(argv);
    if (args === null) {
      write(1, USAGE);
      return 0;
    }
    const inputs = [];
    let total = 0;
    for (const [index, path] of args.inputs.entries()) {
      let input;
      try { input = await readInput(path); }
      catch (error) { throw new InputError("Source " + (index + 1) + " (" + path + "): " + error.message); }
      total += input.bytes;
      if (total > MAX_TOTAL_INPUT_BYTES) throw new InputError("Combined saved weeks exceed 16 MiB.");
      inputs.push({ text: input.text, sourceName: basename(path), sourceSha256: input.sha256 });
    }
    let report;
    try {
      report = renderSavedWeekRoster(inputs);
      if (Buffer.byteLength(report.html, "utf8") > MAX_ROSTER_HTML_BYTES) throw new Error("Rendered roster exceeds 32 MiB.");
    } catch (error) {
      throw new InputError("Cannot render roster: " + error.message);
    }
    const output = resolve(args.output);
    await createOnly(output, report.html, () => { published = true; });
    write(1, JSON.stringify({
      format: "tastetable.week-roster.v1",
      sources: report.sources.map((source, index) => ({ ...source, input: resolve(args.inputs[index]) })),
      output,
      weekStart: report.weekStart,
      picks: report.picks,
      scheduled: report.scheduled,
      omitted: report.omitted,
    }) + "\n");
    return 0;
  } catch (error) {
    const prefix = published ? "HTML roster was created, but final cleanup or receipt delivery failed: " : "";
    try { write(2, "tastetable-roster: " + prefix + (error?.message || String(error)) + "\n"); }
    catch { /* A failed diagnostic must not turn refusal into success. */ }
    return !published && error instanceof InputError ? 2 : 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = await main();
}
