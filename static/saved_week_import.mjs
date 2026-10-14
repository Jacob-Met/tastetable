import { readWeekFile } from "./week_file.mjs";
import { DRAFT_FORMAT, DRAFT_VERSION, MAX_DRAFT_BYTES, draftName, validateDraft } from "./saved_weeks.mjs";

/** Wrap admitted portable text; do not regenerate its saved date or contents. */
export function createImportedDraft({ text, name, id = globalThis.crypto.randomUUID() }) {
  if (typeof text !== "string" || new TextEncoder().encode(text).byteLength > MAX_DRAFT_BYTES) {
    throw new TypeError("This saved week exceeds the 512 KiB browser-copy limit.");
  }
  const { savedAt } = readWeekFile(text);
  return validateDraft({ format: DRAFT_FORMAT, version: DRAFT_VERSION, id,
    name: draftName(name), createdAt: savedAt, updatedAt: savedAt, text });
}
