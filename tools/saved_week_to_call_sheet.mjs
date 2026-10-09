#!/usr/bin/env node
/** Project an explicitly selected saved week and matching notes into native TXT. */
import fs from "node:fs/promises";
import { constants, writeSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readWeekFile } from "../static/week_file.mjs";
import { createVenueFollowup } from "../static/venue_followup.mjs";
import { readVenueNoteFile, VENUE_NOTE_BYTE_LIMIT } from "../static/venue_note_file.mjs";

const WEEK_BYTE_LIMIT = 4 * 1024 * 1024;
const OUTPUT_BYTE_LIMIT = 32 * 1024 * 1024;
const USAGE = [
  "Usage:",
  "  node tools/saved_week_to_call_sheet.mjs --input WEEK.json --venue-notes NOTES.json --output NEW.txt",
  "",
  "Read a saved TasteTable week and its matching saved venue-note companion.",
  "Write the unchanged native UTF-8 call sheet for scheduled occurrence/date pairs.",
  "Other-date and omitted-visit records are admitted but excluded from this TXT.",
  "Keep both original JSON files for all retained history and future editing.",
  "Input limits: week 4 MiB; venue notes 2 MiB. Regular UTF-8 files only; no stdin.",
  "Output limit: 32 MiB. Its parent must exist and its filename must be unused.",
  "No recommendations, venue contact, source rechecks or saved-input changes.",
  "A recorded reply is not a safety check, reservation or current confirmation.",
  "Requires Node.js 22+; no npm dependencies. Success prints one JSON receipt.",
  "",
].join("\n");

class Refusal extends Error {}
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
function deliver(fd, text) {
  const bytes = Buffer.from(text, "utf8");
  for (let offset = 0; offset < bytes.length;) {
    const count = writeSync(fd, bytes, offset, bytes.length - offset);
    if (!Number.isInteger(count) || count <= 0) throw new Error("Output accepted no bytes.");
    offset += count;
  }
}
function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--help") return null;
  const names = new Map([["--input", "input"], ["--venue-notes", "notes"], ["--output", "output"]]);
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index], name = names.get(option);
    if (!name) throw new Refusal("Unknown option: " + option + ". Use --help.");
    if (Object.hasOwn(result, name)) throw new Refusal("Repeated option: " + option + ".");
    const value = argv[index + 1];
    if (typeof value !== "string" || !value || value.startsWith("--")) {
      throw new Refusal("A value is required for " + option + ".");
    }
    if (value === "-") throw new Refusal("Choose explicit files; streams are not accepted.");
    result[name] = resolve(value);
  }
  if (!result.input || !result.notes || !result.output) {
    throw new Refusal("--input, --venue-notes and --output are required. Use --help.");
  }
  return result;
}
async function readRegular(filename, limit, label) {
  let handle, answer, failure;
  try {
    handle = await fs.open(filename, constants.O_RDONLY | (constants.O_NONBLOCK || 0));
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error("Choose a regular file.");
    if (stat.size > limit) throw new Error("File exceeds " + limit + " bytes.");
    const buffer = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > limit) throw new Error("File exceeds " + limit + " bytes.");
    const bytes = buffer.subarray(0, length);
    // Keep any BOM in the string: each unchanged native codec admits one itself.
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    answer = { bytes, text, sha256: digest(bytes) };
  } catch (error) { failure = error; }
  finally {
    if (handle) {
      try { await handle.close(); }
      catch (error) { failure ||= error; }
    }
  }
  if (failure) throw new Refusal("Cannot read " + label + ": " + failure.message);
  return answer;
}
async function createOnly(filename, bytes, markPublished) {
  try {
    await fs.lstat(filename);
    throw new Refusal("Output already exists; choose a new filename.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const stage = await fs.mkdtemp(join(dirname(filename), ".tastetable-call-sheet-"));
  const stagedFile = join(stage, "completed.txt");
  let failure;
  try {
    const handle = await fs.open(stagedFile, "wx");
    try { await handle.writeFile(bytes); await handle.sync(); }
    finally { await handle.close(); }
    try { await fs.link(stagedFile, filename); markPublished(); }
    catch (error) {
      if (error.code === "EEXIST") throw new Refusal("Output appeared while exporting; choose a new filename.");
      throw error;
    }
  } catch (error) { failure = error; }
  finally {
    try { await fs.unlink(stagedFile); }
    catch (error) { if (error.code !== "ENOENT") failure ||= error; }
    try { await fs.rmdir(stage); }
    catch (error) { failure ||= error; }
  }
  if (failure) throw failure;
}
export async function main(argv = process.argv.slice(2)) {
  let published = false;
  try {
    const args = parseArgs(argv);
    if (args === null) { deliver(1, USAGE); return 0; }
    const week = await readRegular(args.input, WEEK_BYTE_LIMIT, "saved week");
    const notes = await readRegular(args.notes, VENUE_NOTE_BYTE_LIMIT, "venue notes");
    let opened, checked, model, text, entries;
    try {
      opened = readWeekFile(week.text);
      const savedSource = "Saved copy opened from “" + basename(args.input) + "” (saved " + opened.savedAt
        + "). Source labels and checks below are retained from the file; they have not been run again.";
      model = createVenueFollowup(opened.state, savedSource);
      checked = readVenueNoteFile(notes.text, { origin: opened, state: opened.state, model });
      model.replaceRecords(checked.records);
      text = model.text(opened.state);
      entries = model.entries(opened.state);
    } catch (error) { throw new Refusal("Cannot prepare call sheet: " + error.message); }
    const bytes = Buffer.from(text, "utf8");
    if (bytes.length > OUTPUT_BYTE_LIMIT) throw new Refusal("Call sheet exceeds 32 MiB.");
    const weekAgain = await readRegular(args.input, WEEK_BYTE_LIMIT, "saved week");
    const notesAgain = await readRegular(args.notes, VENUE_NOTE_BYTE_LIMIT, "venue notes");
    if (!week.bytes.equals(weekAgain.bytes) || !notes.bytes.equals(notesAgain.bytes)) {
      throw new Refusal("An input changed while preparing the call sheet; choose stable saved files.");
    }
    const current = new Set(entries.map(({ key, date }) => JSON.stringify([key, date])));
    const currentRecords = checked.records.filter(({ key, date }) => current.has(JSON.stringify([key, date]))).length;
    await createOnly(args.output, bytes, () => { published = true; });
    deliver(1, JSON.stringify({
      format: "tastetable.venue-call-sheet.v1",
      input: args.input, inputSha256: week.sha256,
      venueNotes: args.notes, venueNotesSha256: notes.sha256,
      output: args.output, outputSha256: digest(bytes), outputBytes: bytes.length,
      weekStart: opened.state.weekStart, sourceMode: opened.state.sourceMode,
      savedWeekAt: opened.savedAt, venueNotesSavedAt: checked.savedAt,
      originalPicks: opened.state.picks.length, scheduledVisits: entries.length,
      omittedPicks: opened.state.picks.length - entries.length,
      retainedNoteRecords: checked.records.length, currentNoteRecords: currentRecords,
      excludedNoteRecords: checked.records.length - currentRecords,
    }) + "\n");
    return 0;
  } catch (error) {
    const prefix = published ? "Call sheet was created, but final cleanup or receipt delivery failed: " : "";
    try { deliver(2, "tastetable-call-sheet: " + prefix + (error?.message || String(error)) + "\n"); }
    catch { /* A failed diagnostic must not hide the primary nonzero result. */ }
    return error instanceof Refusal ? 2 : 1;
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = await main();
}
