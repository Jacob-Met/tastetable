#!/usr/bin/env node
/** Prepare an explicit saved week through the unchanged native calendar writer. */
import fs from "node:fs/promises";
import {writeSync} from "node:fs";
import {createHash, randomBytes} from "node:crypto";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {readWeekFile} from "../static/week_file.mjs";
import {weekRows} from "../static/week_plan.mjs";
import calendar from "../static/calendar.js";

const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const USAGE = [
  "Usage:",
  "  node tools/saved_week_to_calendar.mjs --input WEEK.json --output WEEK.ics [--new-calendar]",
  "  node tools/saved_week_to_calendar.mjs --help",
  "",
  "Create the native calendar writer's exact all-day suggestions from one saved",
  "TasteTable week. No server, planner, provider or calendar account is contacted.",
  "Review the resulting file before importing it into a calendar application.",
  "",
  "The stored calendar identity and original receivedAt are preserved.",
  "A file with calendarId:null requires --new-calendar to create a fresh identity.",
  "That flag is refused when an identity already exists. The new identity is",
  "reported but is not saved back into the input. Repeating --new-calendar can",
  "create distinct import identities; it does not update or cancel earlier imports.",
  "",
  "Requires Node.js 18+. Input must be a regular, strict UTF-8 saved-week v1 file",
  "of at most 4 MiB (one initial BOM allowed). Stdin is not accepted. The complete",
  "calendar is limited to 16 MiB. The output parent must exist and its name must",
  "be unused; existing files, links and directories are never replaced.",
  "",
  "Exit 0: complete file and JSON receipt delivered, or help displayed.",
  "Exit 2: argument, saved-input or occupied-name refusal.",
  "Exit 1: runtime or delivery failure. A diagnostic explicitly reports when",
  "publication succeeded before a final cleanup or receipt failure.",
  "",
  "Saved source labels and heuristic checks are retained, not authenticated or",
  "rerun. Suggestions are not bookings, verified opening hours or care advice.",
  "",
].join("\n");

class InputError extends Error {}
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function write(fd, text) {
  const bytes = Buffer.from(text, "utf8");
  let offset = 0;
  while (offset < bytes.length) {
    const count = writeSync(fd, bytes, offset, bytes.length - offset);
    if (count === 0) throw new Error("Output accepted no bytes.");
    offset += count;
  }
}

function diagnostic(message) {
  try { write(2, "tastetable-calendar: " + message + "\n"); }
  catch { /* A closed diagnostic stream must not change the failure status. */ }
}

function argumentsFor(argv) {
  if (argv.length === 1 && argv[0] === "--help") return null;
  const values = {};
  const seen = new Set();
  for (let index = 0; index < argv.length; index++) {
    const option = argv[index];
    if (!["--input", "--output", "--new-calendar"].includes(option)) {
      throw new InputError("Unknown option: " + option + ". Use --help.");
    }
    if (seen.has(option)) throw new InputError("Repeated option: " + option + ".");
    seen.add(option);
    if (option === "--new-calendar") {
      values.newCalendar = true;
      continue;
    }
    const value = argv[++index];
    if (typeof value !== "string" || !value || value.startsWith("--")) {
      throw new InputError("A value is required for " + option + ".");
    }
    if (value === "-") throw new InputError("Choose an explicit file for " + option + "; streams are not accepted.");
    values[option.slice(2)] = value;
  }
  for (const name of ["input", "output"]) {
    if (!Object.hasOwn(values, name)) throw new InputError("--" + name + " is required. Use --help.");
  }
  return values;
}

/** Return the original writer's complete bytes and preview without filesystem effects.
 * A stored identity cannot be overridden. For calendarId:null, the caller must
 * supply a fresh explicit 32-hex newCalendarId; the input is never rewritten.
 */
export function prepareSavedWeekCalendar(savedText, options = {}) {
  try {
    if (typeof savedText !== "string") throw new Error("The saved week must be UTF-8 JSON text.");
    if (Buffer.byteLength(savedText, "utf8") > MAX_INPUT_BYTES) throw new Error("Saved week exceeds 4 MiB.");
    if (Buffer.from(savedText, "utf8").toString("utf8") !== savedText) {
      throw new Error("The saved week must contain lossless UTF-8 text.");
    }
    if (options === null || typeof options !== "object" || Array.isArray(options) ||
        Object.keys(options).some((key) => key !== "newCalendarId")) {
      throw new Error("Only the newCalendarId option is supported.");
    }
    const supplied = Object.hasOwn(options, "newCalendarId");
    if (supplied && (typeof options.newCalendarId !== "string" || !/^[0-9a-f]{32}$/.test(options.newCalendarId))) {
      throw new Error("newCalendarId must be exactly 32 lowercase hexadecimal characters.");
    }
    const restored = readWeekFile(savedText);
    let id = restored.calendarId;
    if (id === null) {
      if (!supplied) throw new Error("The saved week has no calendar identity. Use --new-calendar to explicitly create one.");
      id = options.newCalendarId;
    } else if (supplied) {
      throw new Error("The saved week already has a calendar identity. Do not use --new-calendar or newCalendarId.");
    }
    const writer = calendar.createWeekExport(restored.state, {
      id, createdAt: new Date(restored.receivedAt),
    });
    const rows = weekRows(restored.state);
    const preview = writer.preview(restored.state, rows);
    const output = writer.download(restored.state, rows);
    const bytes = Buffer.byteLength(output.text, "utf8");
    if (bytes > MAX_OUTPUT_BYTES) throw new Error("The complete calendar exceeds 16 MiB.");
    return Object.freeze({
      calendar: Object.freeze(output),
      preview: Object.freeze(preview.map((item) => Object.freeze(item))),
      weekStart: restored.state.weekStart,
      calendarId: id,
      identitySource: supplied ? "new" : "saved",
      source: writer.source,
      receivedAt: restored.receivedAt,
      savedAt: restored.savedAt,
      inputBytes: Buffer.byteLength(savedText, "utf8"),
      inputSha256: sha256(savedText),
      outputBytes: bytes,
      outputSha256: sha256(output.text),
    });
  } catch (error) {
    throw new InputError("Cannot prepare saved-week calendar: " + (error?.message || String(error)));
  }
}

async function readSavedWeek(filename) {
  try {
    let handle;
    try {
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
      if (length > MAX_INPUT_BYTES) throw new Error("Saved week exceeds 4 MiB.");
      // The unchanged reader consumes one optional BOM. Preserve it here so a
      // second leading BOM cannot be silently admitted by two separate layers.
      return new TextDecoder("utf-8", {fatal: true, ignoreBOM: true}).decode(buffer.subarray(0, length));
    } finally {
      if (handle) await handle.close();
    }
  } catch (error) {
    throw new InputError("Cannot read saved week: " + (error?.message || String(error)));
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
    const stage = await fs.mkdtemp(join(dirname(filename), ".tastetable-calendar-"));
    let failure;
    try {
      const stagedFile = join(stage, "completed.ics");
      await fs.writeFile(stagedFile, bytes, {flag: "wx"});
      try {
        await fs.link(stagedFile, filename);
        markPublished();
      } catch (error) {
        if (error.code === "EEXIST") throw new InputError("Output appeared during conversion; choose a new filename.");
        throw error;
      }
    } catch (error) {
      failure = error;
    }
    try {
      await fs.rm(stage, {recursive: true, force: true});
    } catch (error) {
      if (failure) throw new Error((failure?.message || String(failure)) + "; temporary-stage cleanup also failed: " + error.message);
      throw error;
    }
    if (failure) throw failure;
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
    const text = await readSavedWeek(args.input);
    const options = args.newCalendar ? {newCalendarId: randomBytes(16).toString("hex")} : {};
    const prepared = prepareSavedWeekCalendar(text, options);
    const destination = resolve(args.output);
    await createOnly(destination, Buffer.from(prepared.calendar.text, "utf8"), () => { published = true; });
    write(1, JSON.stringify({
      schema: "tastetable.saved-week-calendar-receipt.v1",
      input: resolve(args.input),
      inputBytes: prepared.inputBytes,
      inputSha256: prepared.inputSha256,
      output: destination,
      outputBytes: prepared.outputBytes,
      outputSha256: prepared.outputSha256,
      suggestedFilename: prepared.calendar.filename,
      weekStart: prepared.weekStart,
      count: prepared.calendar.count,
      calendarId: prepared.calendarId,
      identitySource: prepared.identitySource,
      receivedAt: prepared.receivedAt,
      savedAt: prepared.savedAt,
      source: prepared.source,
      preview: prepared.preview,
    }) + "\n");
    return 0;
  } catch (error) {
    diagnostic((published ? "Calendar was created, but final cleanup or receipt delivery failed: " : "")
      + (error?.message || String(error)));
    return error instanceof InputError ? 2 : 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = await main();
}
