#!/usr/bin/env node
/** Compare fully admitted collection backups without choosing or changing a copy. */
import fsDefault from "node:fs/promises";
import { writeSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readCollectionBackup } from "../static/saved_week_collection.mjs";
import { readCollectionInput, CollectionInputError, writeNew } from "./collection_week.mjs";

const USAGE = [
  "Usage:",
  "  node tools/compare_collection_backups.mjs --left LEFT.json --right RIGHT.json --output NEW.json",
  "  node tools/compare_collection_backups.mjs --help",
  "",
  "Compare two complete TasteTable collection backups by exact record ID and stored fields.",
  "Left and Right are your chosen roles, not a chronology or a preferred copy.",
  "Use completed regular UTF-8 inputs, at most 32 MiB each; no stdin or direct symlinks.",
  "Both complete backups must pass native validation. No browser storage is read or changed.",
  "Choose an unused output in an existing directory; same-directory hard links are required.",
  "Requires Node.js 18+ and no npm dependencies.",
  "",
].join("\n");

const fields = ["name", "createdAt", "updatedAt", "text"];
const metadata = (record) => record === null ? null : {
  name: record.name, createdAt: record.createdAt, updatedAt: record.updatedAt,
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const message = (error) => error?.message || String(error);

/** Native admission owns validity; exact strings own record equivalence. */
export function compareCollections(leftText, rightText) {
  const left = readCollectionBackup(leftText);
  const right = readCollectionBackup(rightText);
  const byRight = new Map(right.records.map((record) => [record.id, record]));
  const leftIDs = new Set(left.records.map((record) => record.id));
  const counts = { same: 0, leftOnly: 0, rightOnly: 0, changed: 0 };
  const records = left.records.map((record) => {
    const other = byRight.get(record.id) ?? null;
    const changedFields = other === null ? [] : fields.filter((field) => record[field] !== other[field]);
    const status = other === null ? "left-only" : changedFields.length ? "changed" : "same";
    counts[status === "left-only" ? "leftOnly" : status]++;
    return { id: record.id, status, changedFields, left: metadata(record), right: metadata(other) };
  });
  for (const record of right.records) {
    if (!leftIDs.has(record.id)) {
      counts.rightOnly++;
      records.push({ id: record.id, status: "right-only", changedFields: [],
        left: null, right: metadata(record) });
    }
  }
  return { format: "tastetable.collection-comparison.v1",
    left: { savedAt: left.savedAt, count: left.records.length },
    right: { savedAt: right.savedAt, count: right.records.length }, counts, records };
}

function parseArguments(argv) {
  if (!Array.isArray(argv) || !argv.every((value) => typeof value === "string")) {
    throw new CollectionInputError("Arguments must be strings. Use --help.");
  }
  if (argv.length === 1 && argv[0] === "--help") return null;
  const keys = new Map([["--left", "left"], ["--right", "right"], ["--output", "output"]]);
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index], key = keys.get(option);
    if (!key) throw new CollectionInputError("Unknown option: " + option + ". Use --help.");
    if (Object.hasOwn(args, key)) throw new CollectionInputError("Repeated option: " + option + ".");
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new CollectionInputError("A value is required for " + option + ".");
    if (value === "-") throw new CollectionInputError("Choose explicit file paths; streams are not accepted.");
    args[key] = value;
  }
  for (const key of ["left", "right", "output"]) {
    if (!Object.hasOwn(args, key)) throw new CollectionInputError("--" + key + " is required. Use --help.");
  }
  return args;
}

function emit(write, fd, text) {
  const bytes = Buffer.from(text, "utf8");
  let offset = 0;
  while (offset < bytes.length) {
    const count = write(fd, bytes, offset, bytes.length - offset);
    if (!Number.isInteger(count) || count <= 0 || count > bytes.length - offset) {
      throw new Error("Output accepted an invalid byte count.");
    }
    offset += count;
  }
}

export async function main(argv = process.argv.slice(2), { fs = fsDefault, write = writeSync } = {}) {
  let published = false, output;
  try {
    const args = parseArguments(argv);
    if (args === null) { emit(write, 1, USAGE); return 0; }
    const left = await readCollectionInput(args.left, fs);
    const right = await readCollectionInput(args.right, fs);
    let comparison;
    try { comparison = compareCollections(left.text, right.text); }
    catch (error) { throw new CollectionInputError("Cannot compare collection backups: " + message(error)); }
    const report = { ...comparison, inputs: {
      left: { path: resolve(args.left), sha256: left.sha256 },
      right: { path: resolve(args.right), sha256: right.sha256 },
    } };
    const text = JSON.stringify(report, null, 2) + "\n";
    const bytes = Buffer.from(text, "utf8");
    output = resolve(args.output);
    await writeNew(output, text, { fs, onPublished: () => { published = true; } });
    emit(write, 1, JSON.stringify({
      format: "tastetable.collection-comparison-receipt.v1", output,
      outputBytes: bytes.length, outputSha256: hash(bytes), counts: comparison.counts,
    }, null, 2) + "\n");
    return 0;
  } catch (error) {
    const prefix = published ? "Comparison report was created at " + output
      + ", but final cleanup or receipt delivery failed: " : "";
    try { emit(write, 2, "tastetable-collection-compare: " + prefix + message(error) + "\n"); }
    catch { /* Keep the failure status if stderr cannot accept the diagnostic. */ }
    return published ? 1 : (error instanceof CollectionInputError || error?.exitCode === 2 ? 2 : 1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = await main();
}
