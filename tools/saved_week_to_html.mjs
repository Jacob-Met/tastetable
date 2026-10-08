#!/usr/bin/env node
/** Make a standalone HTML handoff from an existing, explicitly selected week. */
import fs from "node:fs/promises";
import { writeSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderSavedWeekReport } from "../static/week_report.mjs";

const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
const USAGE = [
  "Usage:",
  "  node tools/saved_week_to_html.mjs --input WEEK.json --output HANDOFF.html [--venue-notes NOTES.json]",
  "",
  "Read a saved-week v1 JSON through TasteTable's existing codec and make a",
  "standalone readable HTML handoff. Open it in a browser to read or print offline.",
  "The input is a completed regular UTF-8 file, at most 4 MiB; no stdin.",
  "The output parent must exist and its filename must be unused.",
  "",
  "Preserves arranged dates, original explanations, saved/source timestamps and",
  "source labels. Does not rerun checks or make a provider request. Visit-only",
  "venue worksheet notes require an explicitly selected matching companion.",
  "--venue-notes admits a regular strict UTF-8 companion, at most 2 MiB.",
  "Current and retained other-date/omitted records stay separately labelled.",
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
  const names = new Map([["--input", "input"], ["--output", "output"], ["--venue-notes", "venueNotes"]]);
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const key = names.get(option);
    if (!key) throw new InputError("Unknown option: " + option + ". Use --help.");
    if (Object.hasOwn(args, key)) throw new InputError("Repeated option: " + option + ".");
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new InputError("A value is required for " + option + ".");
    args[key] = value;
  }
  if (!args.input || !args.output) throw new InputError("--input and --output are required. Use --help.");
  if (args.input === "-" || args.output === "-" || args.venueNotes === "-") {
    throw new InputError("Choose explicit input and output files; streams are not accepted.");
  }
  return args;
}

async function readInput(filename, limit = MAX_INPUT_BYTES, label = "saved week") {
  let handle;
  try {
    if (!(await fs.stat(filename)).isFile()) throw new Error("Choose a regular file.");
    handle = await fs.open(filename, "r");
    if (!(await handle.stat()).isFile()) throw new Error("Choose a regular file.");
    const buffer = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < buffer.length) {
      const result = await handle.read(buffer, length, buffer.length - length, null);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length > limit) throw new Error(label === "saved week" ? "Saved week exceeds 4 MiB." : "Venue notes exceed 2 MiB.");
    const bytes = buffer.subarray(0, length);
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch (error) {
    throw new InputError("Cannot read " + label + ": " + error.message);
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
    const stage = await fs.mkdtemp(join(dirname(filename), ".tastetable-report-"));
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
    const input = await readInput(args.input);
    const companion = args.venueNotes ? await readInput(args.venueNotes, 2 * 1024 * 1024, "venue notes") : null;
    let report;
    try {
      report = renderSavedWeekReport(input.text, {
        sourceName: basename(args.input),
        sourceSha256: input.sha256,
        ...(companion ? { venueNotes: { text: companion.text, sourceName: basename(args.venueNotes), sourceSha256: companion.sha256 } } : {}),
      });
      if (Buffer.byteLength(report.html, "utf8") > MAX_OUTPUT_BYTES) {
        throw new Error("Rendered handoff exceeds 32 MiB.");
      }
    } catch (error) {
      throw new InputError("Cannot render saved week: " + error.message);
    }
    const output = resolve(args.output);
    await createOnly(output, report.html, () => { published = true; });
    write(1, JSON.stringify({
      format: "tastetable.week-report.v1",
      input: resolve(args.input),
      inputSha256: input.sha256,
      output,
      weekStart: report.weekStart,
      sourceMode: report.sourceMode,
      picks: report.picks,
      scheduled: report.scheduled,
      omitted: report.omitted,
      ...(companion ? { venueNotes: { input: resolve(args.venueNotes), inputSha256: companion.sha256, ...report.venueNotes } } : {}),
    }) + "\n");
    return 0;
  } catch (error) {
    const prefix = published ? "HTML handoff was created, but final cleanup or receipt delivery failed: " : "";
    try { write(2, "tastetable-report: " + prefix + (error?.message || String(error)) + "\n"); }
    catch { /* A failed diagnostic must not turn refusal into success. */ }
    return error instanceof InputError ? 2 : 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = await main();
}
