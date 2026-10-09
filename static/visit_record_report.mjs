/** A read-only, script-free handoff of one canonical saved visit record. */
import { readVisitRecord, visitRecordRows } from "./visit_record.mjs";
import { readWeekFile } from "./week_file.mjs";

function escapeText(value) {
  const text = String(value);
  if (!text.isWellFormed() || text.includes("\0")) {
    throw new TypeError("A displayed field contains NUL or unpaired UTF-16, which cannot be preserved in HTML.");
  }
  // Character references keep original CR/CRLF in DOM text. A lone CR also needs
  // a visible line break; a following LF already supplies that break with pre-wrap.
  return text.replace(/[&<>"'\r]/g, (character, index) => {
    if (character === "\r") return text[index + 1] === "\n" ? "&#13;" : "&#13;<br>";
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character];
  });
}

const CSS = [
  ":root{color-scheme:light;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1e3336;background:#f2f5f3;line-height:1.55}",
  "*{box-sizing:border-box}body{margin:0}main{max-width:960px;margin:0 auto;padding:32px 24px 48px}",
  "h1{font-size:2rem;line-height:1.2;margin:.3em 0}h2{font-size:1.4rem;margin:1.3em 0 .5em}h3{font-size:1.15rem;margin:.2em 0 .6em}",
  "p,dt,dd,h1,h2,h3{overflow-wrap:anywhere}p{margin:.6em 0}.literal{white-space:pre-wrap;overflow-wrap:anywhere;tab-size:4}",
  "header{border-bottom:3px solid #326755;padding-bottom:16px}.eyebrow{font-size:.82rem;letter-spacing:.05em;text-transform:uppercase;color:#326755;font-weight:700}",
  ".notice{border-left:4px solid #947238;background:#fff8e9;padding:12px 16px;margin:18px 0}",
  ".provenance,.visit{border:1px solid #c9d8d0;border-radius:8px;background:#fff;padding:18px 22px;margin:18px 0;min-width:0}",
  ".occurrence{font-family:ui-monospace,monospace;font-size:.85rem;color:#455b5c}.badge{display:inline-block;border:1px solid #496a5e;border-radius:4px;padding:3px 10px;font-weight:650}",
  "dl{display:grid;grid-template-columns:minmax(120px,190px) minmax(0,1fr);gap:8px 16px;margin:12px 0}dt{font-weight:650}dd{margin:0;min-width:0}",
  ".source-hash{font-family:ui-monospace,monospace;font-size:.85rem}.note{border-left:3px solid #cedbd4;padding:8px 12px;margin:.5em 0 1.2em}",
  ".empty,.muted{color:#526364}.schedule{border-bottom:1px solid #dbe3df;padding-bottom:12px}.recorded{margin-top:14px}",
  "footer{border-top:1px solid #c9d8d0;margin-top:28px;padding-top:16px;font-size:.9rem}",
  "@media(max-width:520px){main{padding:20px 14px 32px}h1{font-size:1.6rem}.provenance,.visit{padding:14px}dl{display:block}dt{margin-top:10px}dd{margin-top:2px}}",
  "@page{size:auto;margin:15mm}@media print{:root{background:#fff;color:#000}main{max-width:none;padding:0}.provenance,.visit{background:#fff;border-color:#aaa;break-inside:auto}.notice{background:#fff;border-color:#666}h1,h2,h3,dt{break-after:avoid}p,dd{orphans:2;widows:2}.muted,.empty,.occurrence{color:#333}header{border-color:#444}footer{font-size:.85rem}}",
].join("\n");
const outcomes = Object.freeze({ unrecorded: "Not recorded", went: "Went", did_not_go: "Did not go" });
const sourceLabels = Object.freeze({
  mock: ["Saved fictional demo", "The original file labels its source mock. Its venue suggestions are demo data; this report does not verify visits."],
  live: ["Saved live-source label", "The original file labels its source live. This report does not authenticate that label or refresh provider data."],
  unknown: ["Saved source unknown", "The original file does not establish whether its source was mock or live. This report does not verify visits."],
});

function field(name, label, value, { empty = null, className = "" } = {}) {
  return "<dt>" + label + '</dt><dd class="literal ' + className + '" data-field="' + name + '">' +
    escapeText(value === null ? empty : value) + "</dd>";
}
function visitHtml(row, index) {
  return '<article class="visit" data-occurrence="' + escapeText(row.key) + '">' +
    '<p class="occurrence">Original occurrence ' + (index + 1) + ' · <span data-field="occurrence_key">' + escapeText(row.key) + "</span></p>" +
    '<h2 class="literal" data-field="venue_name">' + escapeText(row.pick.name) + "</h2>" +
    '<dl class="schedule">' +
    field("entity_id", "Original venue ID", row.pick.entity_id) +
    field("kind", "Original kind", row.pick.kind) +
    field("original_day", "Original suggested day", row.originalDay) +
    field("planned_day", "Saved planned day", row.plannedDay, { empty: "Kept off this week" }) +
    field("planned_date", "Saved planned date", row.plannedDate, { empty: "Kept off this week" }) +
    '</dl><section class="recorded" aria-label="Recorded visit">' +
    '<h3>Recorded visit</h3><p class="badge" data-outcome-label>' + outcomes[row.outcome] + "</p><dl>" +
    field("outcome", "Recorded outcome code", row.outcome) +
    field("actual_date", "Actual date", row.date, { empty: "Not recorded" }) +
    '</dl><h3>Visit note</h3>' +
    (row.note === "" ? '<p class="empty" data-empty-note>No note recorded.</p>' :
      '<p class="literal note" data-field="note">' + escapeText(row.note) + "</p>") +
    '</section><h3>Original suggestion explanation</h3><p class="literal" data-field="original_explanation">' +
    escapeText(row.pick.why) + "</p></article>";
}

/** The unchanged codecs reconstruct every source occurrence and saved value. */
export function renderVisitRecordReport(text, { recordName = "Saved visit record", recordSha256 = null } = {}) {
  if (typeof recordName !== "string" || !recordName.isWellFormed() || !recordName.trim() ||
      [...recordName].length > 512 || /[\u0000-\u001f\u007f]/u.test(recordName)) {
    throw new TypeError("Use a nonblank record name of at most 512 characters, without controls.");
  }
  if (recordSha256 !== null && (typeof recordSha256 !== "string" || !/^[0-9a-f]{64}$/.test(recordSha256))) {
    throw new TypeError("The record fingerprint must be a lowercase SHA-256 value.");
  }
  const { record, savedAt } = readVisitRecord(text);
  const saved = readWeekFile(record.source.weekText);
  const rows = visitRecordRows(record), source = sourceLabels[saved.state.sourceMode];
  const html = [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;">',
    "<title>TasteTable visit record · " + escapeText(saved.state.weekStart) + "</title>",
    "<style>" + CSS + "</style></head><body><main>",
    '<header><p class="eyebrow">TasteTable · Recorded visits</p><h1>Saved visit record</h1>',
    '<p class="literal" data-field="record_name">' + escapeText(recordName) + "</p>",
    '<p>Week starting <span data-field="week_start">' + escapeText(saved.state.weekStart) + "</span> · " +
      rows.length + " original " + (rows.length === 1 ? "occurrence" : "occurrences") + "</p></header>",
    '<section class="notice" aria-label="About this record"><h2>' + source[0] + "</h2><p>" + source[1] + "</p>",
    "<p>Planned dates and recorded visits are separate. An unrecorded outcome does not mean a visit did or did not happen. An omitted plan can still have a recorded outcome.</p>",
    "<p>Dates, outcomes and notes below are saved entries, not verified observations or new recommendations.</p></section>",
    '<section class="provenance" aria-label="Saved record provenance"><h2>Saved provenance</h2><dl>',
    field("source_name", "Original saved-week filename", record.source.name),
    field("source_mode", "Saved source mode", saved.state.sourceMode),
    field("source_received_at", "Original response received", saved.receivedAt),
    field("source_saved_at", "Original week saved", saved.savedAt),
    field("record_saved_at", "Visit record saved", savedAt),
    recordSha256 === null ? "" : field("record_sha256", "Visit JSON SHA-256", recordSha256, { className: "source-hash" }),
    "</dl></section>",
    '<section aria-label="Original visit occurrences">',
    rows.length ? rows.map(visitHtml).join("\n") : '<p class="empty" data-empty-record>This record has no original occurrences.</p>',
    "</section><footer>",
    "<p>This report includes the recorded dates, outcomes and notes for every original occurrence, including picks kept off the saved week. Original suggestions remain in their original order.</p>",
    "<p>Keep the original visit-record JSON to reopen or edit it and retain its complete original source and tool trace. This HTML report is not a backup format.</p>",
    "<p>Open this file offline in a browser. Use the browser's Print command to print or save a PDF. No service, script or connection is needed.</p>",
    "</footer></main></body></html>",
    "",
  ].join("\n");
  return Object.freeze({ html, rowCount: rows.length, weekStart: saved.state.weekStart, sourceMode: saved.state.sourceMode, savedAt });
}
