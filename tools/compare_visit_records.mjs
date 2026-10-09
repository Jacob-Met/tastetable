#!/usr/bin/env node
/** Compare two explicit saved visit records; never create or replace an input/output file. */
import fs from "node:fs/promises";
import { constants, writeSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { VISIT_RECORD_LIMITS } from "../static/visit_record.mjs";
import { renderVisitRecordComparisonText } from "../static/visit_record_compare.mjs";

const HELP = [
  "Usage:",
  "  node tools/compare_visit_records.mjs --before BEFORE.json --after AFTER.json",
  "  node tools/compare_visit_records.mjs --help",
  "",
  "Compare recorded outcome, actual date and literal note for each original occurrence.",
  "Choose two visit-record v1 copies with the exact same embedded original saved-week text.",
  "Before/after are your selected roles; saved timestamps do not choose the later record.",
  "Each input must be a regular UTF-8 file of at most 8 MiB. No stdin is read.",
  "The readable change brief is written to stdout; input/usage errors go to stderr.",
  "This command never writes files. Shell > redirection can truncate before it starts:",
  "choose a new destination or staging path and keep both original JSON files.",
  "Requires Node.js 22+; no npm dependencies or provider requests.",
  "",
].join("\n");

class InputError extends Error {}

function argumentsFor(argv) {
  if (argv.length === 1 && argv[0] === "--help") return null;
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (flag !== "--before" && flag !== "--after") {
      throw new InputError("Unknown or misplaced option " + JSON.stringify(flag) + ". Use --help.");
    }
    const key = flag.slice(2);
    if (Object.hasOwn(result, key)) throw new InputError("Repeated option " + flag + ".");
    if (index + 1 === argv.length || argv[index + 1] === "") {
      throw new InputError(flag + " requires a nonempty file path.");
    }
    const value = argv[index + 1];
    if (value === "-") throw new InputError("Choose two explicit files; stdin is not accepted.");
    result[key] = value;
  }
  if (!Object.hasOwn(result, "before") || !Object.hasOwn(result, "after")) {
    throw new InputError("--before and --after are both required. Use --help.");
  }
  return result;
}

async function readInput(filename, role) {
  try {
    const handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NONBLOCK || 0));
    try {
      const info = await handle.stat();
      if (!info.isFile()) throw new Error("Choose a regular file.");
      if (info.size > VISIT_RECORD_LIMITS.fileBytes) throw new Error("Visit record exceeds 8 MiB.");
      const bytes = Buffer.alloc(VISIT_RECORD_LIMITS.fileBytes + 1);
      let length = 0;
      while (length < bytes.length) {
        const part = await handle.read(bytes, length, bytes.length - length, null);
        if (!part.bytesRead) break;
        length += part.bytesRead;
      }
      if (length > VISIT_RECORD_LIMITS.fileBytes) throw new Error("Visit record exceeds 8 MiB.");
      // Retain a decoded leading BOM so the unchanged native codec owns its admission.
      return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, length));
    } finally {
      await handle.close();
    }
  } catch (error) {
    throw new InputError("Cannot read " + role + " input " + JSON.stringify(filename) + ": " + error.message);
  }
}

function write(fd, text) {
  const bytes = Buffer.from(text, "utf8");
  let offset = 0;
  while (offset < bytes.length) {
    const count = writeSync(fd, bytes, offset, bytes.length - offset);
    if (!Number.isInteger(count) || count <= 0 || count > bytes.length - offset) {
      throw new Error("Output did not accept a valid byte count.");
    }
    offset += count;
  }
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const args = argumentsFor(argv);
    if (args === null) { write(1, HELP); return 0; }
    const before = await readInput(args.before, "before");
    const after = await readInput(args.after, "after");
    let report;
    try { report = renderVisitRecordComparisonText(before, after); }
    catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {
        throw new InputError("Cannot compare visit records: " + error.message);
      }
      throw error;
    }
    write(1, report);
    return 0;
  } catch (error) {
    try { write(2, "tastetable-visit-compare: " + (error?.message || String(error)) + "\n"); }
    catch { /* A diagnostic failure must not turn a failed command into success. */ }
    return error instanceof InputError ? 2 : 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = await main();
}
