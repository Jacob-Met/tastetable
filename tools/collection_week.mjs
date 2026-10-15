#!/usr/bin/env node
/** Recover exact stored portable text from a fully admitted collection backup. */
import fsDefault from "node:fs/promises";
import { constants, writeSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_COLLECTION_BYTES, readCollectionBackup } from "../static/saved_week_collection.mjs";

const USAGE = [
  "Usage:",
  "  node tools/collection_week.mjs --input backup.json",
  "  node tools/collection_week.mjs --input backup.json --id EXACT_ID --output recovered-week.json",
  "  node tools/collection_week.mjs --help",
  "",
  "List a complete TasteTable collection backup, or recover one exact stored week.",
  "The input must be a completed regular UTF-8 file, at most 32 MiB; no stdin or symlinks.",
  "All records are validated before listing or selection. Choose an exact listed ID.",
  "The output parent must exist and the filename must be unused; hard links are required.",
  "No browser storage, active planner, providers, or original saved text are changed.",
  "Requires Node.js 18+ and no npm dependencies.",
  "",
].join("\n");

class InputError extends Error {}
const NO_FAILURE = Symbol("no failure");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const message = (error) => error?.message || String(error);
const metadata = ({ id, name, createdAt, updatedAt }) => ({ id, name, createdAt, updatedAt });

function requireText(text) {
  if (typeof text !== "string") throw new TypeError("Stored week text must be a string.");
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit >= 0xD800 && unit <= 0xDBFF) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) {
        throw new TypeError("Stored week contains an unpaired surrogate; UTF-8 recovery would change it.");
      }
      i++;
    } else if (unit >= 0xDC00 && unit <= 0xDFFF) {
      throw new TypeError("Stored week contains an unpaired surrogate; UTF-8 recovery would change it.");
    }
  }
}

export function describeCollection(text) {
  const backup = readCollectionBackup(text);
  return { format: "tastetable.collection-index.v1", savedAt: backup.savedAt,
    count: backup.records.length, records: backup.records.map(metadata) };
}

export function selectStoredWeek(text, id) {
  const backup = readCollectionBackup(text);
  if (typeof id !== "string") throw new TypeError("Choose an exact saved-week ID from the listing.");
  const selected = backup.records.find((record) => record.id === id);
  if (!selected) throw new TypeError("Saved-week ID was not found in this collection.");
  requireText(selected.text);
  return { record: metadata(selected), text: selected.text };
}

function cleanupFailure(primary, cleanup) {
  if (primary === NO_FAILURE) return cleanup;
  const error = new Error(message(primary) + "; cleanup also failed: " + message(cleanup), { cause: primary });
  error.exitCode = primary instanceof InputError ? 2 : (primary?.exitCode === 2 ? 2 : 1);
  return error;
}

/** Publish a completed stage by hard link; never remove or replace the final name. */
export async function writeNew(filename, text, { fs = fsDefault, onPublished = () => {} } = {}) {
  requireText(text);
  const output = resolve(filename);
  try {
    await fs.lstat(output);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return publish();
  }
  throw new InputError("Output already exists; choose a new filename.");

  async function publish() {
    const stage = await fs.mkdtemp(join(dirname(output), ".tastetable-recovery-"));
    let failure = NO_FAILURE;
    try {
      const completed = join(stage, "completed.json");
      await fs.writeFile(completed, Buffer.from(text, "utf8"), { flag: "wx" });
      try {
        await fs.link(completed, output);
      } catch (error) {
        if (error?.code === "EEXIST") throw new InputError("Output appeared during recovery; choose a new filename.");
        throw error;
      }
      onPublished();
    } catch (error) {
      failure = error;
    } finally {
      try { await fs.rm(stage, { recursive: true, force: true }); }
      catch (error) { failure = cleanupFailure(failure, error); }
    }
    if (failure !== NO_FAILURE) throw failure;
  }
}

function argsFor(argv) {
  if (!Array.isArray(argv) || !argv.every((x) => typeof x === "string")) {
    throw new InputError("Arguments must be strings. Use --help.");
  }
  if (argv.length === 1 && argv[0] === "--help") return null;
  const keys = new Map([["--input", "input"], ["--id", "id"], ["--output", "output"]]);
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const option = argv[i], key = keys.get(option);
    if (!key) throw new InputError("Unknown option: " + option + ". Use --help.");
    if (Object.hasOwn(args, key)) throw new InputError("Repeated option: " + option + ".");
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new InputError("A value is required for " + option + ".");
    args[key] = value;
  }
  if (!args.input) throw new InputError("--input is required. Use --help.");
  if (Object.hasOwn(args, "id") !== Object.hasOwn(args, "output")) {
    throw new InputError("Use --id and --output together, or omit both to list the backup.");
  }
  if (args.input === "-" || args.output === "-") throw new InputError("Choose explicit file paths; streams are not accepted.");
  return args;
}

async function readInput(filename, fs) {
  let handle, result;
  let failure = NO_FAILURE;
  try {
    const entry = await fs.lstat(filename, { bigint: true });
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error("Choose a regular file, not a symlink or directory.");
    handle = await fs.open(filename, constants.O_RDONLY | constants.O_NONBLOCK);
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.dev !== entry.dev || before.ino !== entry.ino) {
      throw new Error("The input entry changed before it could be read.");
    }
    if (before.size > BigInt(MAX_COLLECTION_BYTES)) throw new Error("Collection backup exceeds 32 MiB.");
    const buffer = Buffer.alloc(MAX_COLLECTION_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!Number.isInteger(bytesRead) || bytesRead < 0 || bytesRead > buffer.length - length) {
        throw new Error("Input returned an invalid read count.");
      }
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length > MAX_COLLECTION_BYTES) throw new Error("Collection backup exceeds 32 MiB.");
    const after = await handle.stat({ bigint: true });
    if (!after.isFile() || ["dev", "ino", "size", "mtimeNs", "ctimeNs"].some((key) => before[key] !== after[key])
        || BigInt(length) !== after.size) {
      throw new Error("The input changed while it was being read; choose a completed backup.");
    }
    const bytes = buffer.subarray(0, length);
    result = { text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes), sha256: hash(bytes) };
  } catch (error) {
    failure = error;
  } finally {
    if (handle) {
      try { await handle.close(); }
      catch (error) { failure = cleanupFailure(failure, error); }
    }
  }
  if (failure !== NO_FAILURE) throw new InputError("Cannot read collection backup: " + message(failure));
  return result;
}

function emit(write, fd, text) {
  const buffer = Buffer.from(text, "utf8");
  let offset = 0;
  while (offset < buffer.length) {
    const count = write(fd, buffer, offset, buffer.length - offset);
    if (!Number.isInteger(count) || count <= 0 || count > buffer.length - offset) {
      throw new Error("Output accepted an invalid byte count.");
    }
    offset += count;
  }
}

export async function main(argv = process.argv.slice(2), { fs = fsDefault, write = writeSync } = {}) {
  let published = false, output;
  try {
    const args = argsFor(argv);
    if (args === null) { emit(write, 1, USAGE); return 0; }
    const input = await readInput(args.input, fs);
    let result;
    try {
      result = args.id === undefined ? describeCollection(input.text) : selectStoredWeek(input.text, args.id);
    } catch (error) { throw new InputError("Cannot use collection backup: " + message(error)); }
    if (args.id === undefined) {
      emit(write, 1, JSON.stringify(result, null, 2) + "\n");
      return 0;
    }
    output = resolve(args.output);
    const bytes = Buffer.from(result.text, "utf8");
    await writeNew(output, result.text, { fs, onPublished: () => { published = true; } });
    emit(write, 1, JSON.stringify({
      format: "tastetable.collection-week-recovery.v1",
      input: resolve(args.input), inputSha256: input.sha256, output,
      outputBytes: bytes.length, outputSha256: hash(bytes), record: result.record,
    }, null, 2) + "\n");
    return 0;
  } catch (error) {
    const prefix = published ? "Recovered week was created at " + output + ", but final cleanup or receipt delivery failed: " : "";
    try { emit(write, 2, "tastetable-collection: " + prefix + message(error) + "\n"); }
    catch { /* Preserve failure even when stderr cannot accept a diagnostic. */ }
    return published ? 1 : (error instanceof InputError || error?.exitCode === 2 ? 2 : 1);
  }
}

export { readInput as readCollectionInput, InputError as CollectionInputError };

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = await main();
}
