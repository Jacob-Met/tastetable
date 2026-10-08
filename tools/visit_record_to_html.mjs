#!/usr/bin/env node
/** Export an explicitly selected saved visit record without modifying it. */
import fs from "node:fs/promises";
import { constants, writeSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VISIT_RECORD_LIMITS } from "../static/visit_record.mjs";
import { renderVisitRecordReport } from "../static/visit_record_report.mjs";

const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;
const USAGE = [
  "Usage:",
  "  node tools/visit_record_to_html.mjs --input VISITS.json --output REPORT.html",
  "",
  "Read a saved TasteTable visit-record v1 file (regular UTF-8, at most 8 MiB).",
  "Write an offline printable HTML report with every original occurrence.",
  "Planned dates, actual dates, outcomes and notes remain separate original values.",
  "The output parent must exist and the output filename must be unused. No stdin.",
  "HTML uses UTF-8 without BOM, inline print styles and no script or network assets.",
  "Recorded outcomes/dates stay separate from planned dates. Literal notes remain text.",
  "Keep the original JSON to reopen the record; HTML is a report, not a backup.",
  "Requires Node.js 22+; no npm dependencies or provider requests.",
  "",
].join("\n");

class InputError extends Error {}
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
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
  const names = new Map([["--input", "input"], ["--output", "output"]]);
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = names.get(argv[index]);
    if (!key) throw new InputError("Unknown option: " + argv[index] + ". Use --help.");
    if (Object.hasOwn(args, key)) throw new InputError("Repeated option: " + argv[index] + ".");
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new InputError("A value is required for " + argv[index] + ".");
    if (value === "-") throw new InputError("Choose explicit input and output files; streams are not accepted.");
    args[key] = value;
  }
  if (!args.input || !args.output) throw new InputError("--input and --output are required. Use --help.");
  return args;
}
async function readInput(filename) {
  let handle;
  try {
    // Inspect the acquired file, with nonblocking open where supported, before reading.
    handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NONBLOCK || 0));
    if (!(await handle.stat()).isFile()) throw new Error("Choose a regular file.");
    const buffer = Buffer.alloc(VISIT_RECORD_LIMITS.fileBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const result = await handle.read(buffer, length, buffer.length - length, null);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length > VISIT_RECORD_LIMITS.fileBytes) throw new Error("Visit record exceeds 8 MiB.");
    const bytes = buffer.subarray(0, length);
    return { text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes), sha256: digest(bytes) };
  } catch (error) {
    throw new InputError("Cannot read visit record: " + error.message);
  } finally {
    if (handle) await handle.close();
  }
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
    const stage = await fs.mkdtemp(join(dirname(filename), ".tastetable-visit-html-"));
    try {
      const stagedFile = join(stage, "completed.html");
      const handle = await fs.open(stagedFile, "wx");
      try { await handle.writeFile(bytes); await handle.sync(); }
      finally { await handle.close(); }
      try { await fs.link(stagedFile, filename); markPublished(); }
      catch (error) {
        if (error.code === "EEXIST") throw new InputError("Output appeared while exporting; choose a new filename.");
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
    if (args === null) { write(1, USAGE); return 0; }
    const input = await readInput(args.input);
    let report;
    try { report = renderVisitRecordReport(input.text, { recordName: basename(args.input), recordSha256: input.sha256 }); }
    catch (error) { throw new InputError("Cannot export visit record: " + error.message); }
    const bytes = Buffer.from(report.html, "utf8");
    if (bytes.length > MAX_OUTPUT_BYTES) throw new InputError("HTML report exceeds 32 MiB.");
    const output = resolve(args.output);
    await createOnly(output, bytes, () => { published = true; });
    write(1, JSON.stringify({
      format: "tastetable.visit-html.v1", input: resolve(args.input), inputSha256: input.sha256,
      output, outputSha256: digest(bytes), outputBytes: bytes.length, rows: report.rowCount,
      weekStart: report.weekStart, sourceMode: report.sourceMode, recordSavedAt: report.savedAt,
    }) + "\n");
    return 0;
  } catch (error) {
    const prefix = published ? "HTML report was created, but final cleanup or receipt delivery failed: " : "";
    try { write(2, "tastetable-visit-html: " + prefix + (error?.message || String(error)) + "\n"); }
    catch { /* A failed diagnostic must not turn refusal into success. */ }
    return error instanceof InputError ? 2 : 1;
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = await main();
}
