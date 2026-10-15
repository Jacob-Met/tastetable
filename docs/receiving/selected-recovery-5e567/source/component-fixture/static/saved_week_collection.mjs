import { MAX_DRAFTS, validateDraft } from "./saved_weeks.mjs";

export const COLLECTION_FORMAT = "tastetable.browser-week-collection.v1";
export const MAX_COLLECTION_BYTES = 32 * 1024 * 1024;
const fields = ["format", "version", "id", "name", "createdAt", "updatedAt", "text"];
const fail = (message) => { throw new TypeError(message); };
const size = (text) => new TextEncoder().encode(text).byteLength;
const byID = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const same = (a, b) => fields.every((key) => a[key] === b[key]);

function exactObject(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
      || Object.keys(value).length !== keys.length
      || !keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))) {
    fail(`The ${label} has unsupported or missing fields.`);
  }
}
function boundedArray(value) {
  if (!Array.isArray(value) || value.length > MAX_DRAFTS
      || Object.keys(value).length !== value.length
      || !Array.from({ length: value.length }, (_, index) => Object.prototype.hasOwnProperty.call(value, index)).every(Boolean)) {
    fail(`A collection must contain at most ${MAX_DRAFTS} complete saved records.`);
  }
}
function records(value) {
  boundedArray(value);
  const ids = new Set();
  return value.map((record) => {
    exactObject(record, fields, "saved record");
    const draft = validateDraft(record);
    if (ids.has(draft.id)) fail("The collection contains a duplicate saved-week identity.");
    ids.add(draft.id);
    return draft;
  });
}
function envelope(value) {
  exactObject(value, ["format", "savedAt", "records"], "collection backup");
  if (value.format !== COLLECTION_FORMAT) fail("This file is not a supported saved-week collection backup.");
  if (typeof value.savedAt !== "string" || !Number.isFinite(Date.parse(value.savedAt))
      || new Date(value.savedAt).toISOString() !== value.savedAt) {
    fail("The collection backup has an invalid saved date.");
  }
  const result = { format: COLLECTION_FORMAT, savedAt: value.savedAt, records: records(value.records) };
  if (size(JSON.stringify(result, null, 2) + "\n") > MAX_COLLECTION_BYTES) {
    fail("The complete collection backup exceeds 32 MiB.");
  }
  return result;
}

// JSON.parse owns JSON grammar. This second, bounded walk checks decoded object
// keys before admission; embedded portable-week text remains an opaque string.
function uniqueKeys(text) {
  let index = 0;
  const space = () => { while (/\s/.test(text[index] || "") && index < text.length) index++; };
  function string() {
    const start = index++;
    while (index < text.length) {
      const char = text[index++];
      if (char === "\\") index++;
      else if (char === '"') return JSON.parse(text.slice(start, index));
    }
  }
  function value(depth) {
    if (depth > 8) fail("The collection backup has an unsupported nested structure.");
    space();
    if (text[index] === '"') { string(); return; }
    if (text[index] === "{") {
      index++; space();
      const seen = new Set();
      if (text[index] === "}") { index++; return; }
      while (index < text.length) {
        space();
        const key = string();
        if (seen.has(key)) fail("The collection backup contains a duplicate JSON field.");
        seen.add(key); space(); index++; value(depth + 1); space();
        if (text[index++] === "}") return;
      }
    } else if (text[index] === "[") {
      index++; space();
      if (text[index] === "]") { index++; return; }
      while (index < text.length) {
        value(depth + 1); space();
        if (text[index++] === "]") return;
      }
    } else {
      while (index < text.length && !/[\s,\]}]/.test(text[index])) index++;
    }
  }
  value(0);
}

function currentRecords(rows) {
  boundedArray(rows);
  const values = rows.map((row) => {
    if (!row || row.error || !row.draft) fail("A saved record is unreadable. The complete collection was left unchanged.");
    const draft = validateDraft(row.draft);
    if (row.id !== draft.id) fail("A saved record key does not match its identity. The collection was left unchanged.");
    return draft;
  });
  return records(values).sort(byID);
}

/** Complete fresh-list backup, independent of visible order and filtering. */
export function makeCollectionBackup(rows, savedAt = new Date().toISOString()) {
  return JSON.stringify(envelope({ format: COLLECTION_FORMAT, savedAt, records: currentRecords(rows) }), null, 2) + "\n";
}

export function readCollectionBackup(text) {
  if (typeof text !== "string" || size(text) > MAX_COLLECTION_BYTES) fail("Choose a collection backup of at most 32 MiB.");
  const input = text.replace(/^\uFEFF/, "");
  let value;
  try { value = JSON.parse(input); }
  catch { fail("The collection backup is not valid JSON."); }
  uniqueKeys(input);
  return envelope(value);
}

/** A preview token covers the complete admitted collection, not a selected row. */
export function planCollectionRestore(backup, rows) {
  const admitted = envelope(backup);
  const incoming = admitted.records;
  const expected = envelope({ ...admitted, records: currentRecords(rows) }).records;
  const current = new Map(expected.map((record) => [record.id, record]));
  const missing = [], identical = [], conflicts = [];
  for (const record of incoming) {
    const existing = current.get(record.id);
    if (!existing) missing.push(record);
    else if (same(existing, record)) identical.push(record);
    else conflicts.push({ existing, incoming: record });
  }
  const totalAfter = expected.length + missing.length;
  return { expected, missing, identical, conflicts, totalAfter,
    canApply: missing.length > 0 && conflicts.length === 0 && totalAfter <= MAX_DRAFTS };
}
