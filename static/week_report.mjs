/** A read-only, script-free handoff from the existing saved-week format. */
import { readWeekFile } from "./week_file.mjs";
import { weekRows, offWeekPicks } from "./week_plan.mjs";

function escapeText(value) {
  const text = String(value);
  // JSON admits these strings, but HTML/UTF-8 cannot retain NUL or unpaired
  // UTF-16 surrogates. Refuse the report instead of silently changing its text.
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0) throw new TypeError("A displayed field contains NUL, which cannot be preserved in HTML.");
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new TypeError("A displayed field contains an unpaired UTF-16 surrogate.");
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError("A displayed field contains an unpaired UTF-16 surrogate.");
    }
  }
  // Character references are resolved after HTML's CR/CRLF input
  // normalization, preserving the original carriage return in DOM text.
  return text.replace(/[&<>"'\r]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "\r": "&#13;",
  })[character]);
}

const CSS = [
  ":root{color-scheme:light;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#182c32;background:#f3f6f5;line-height:1.55}",
  "*{box-sizing:border-box}body{margin:0}main{max-width:920px;margin:0 auto;padding:32px 24px 56px}",
  "header{border-bottom:3px solid #29695b;padding-bottom:20px}h1{font-size:2rem;line-height:1.15;margin:.35em 0}h2{font-size:1.35rem;margin-top:1.8em}h3{font-size:1.05rem;margin:.2em 0 .7em}",
  "p,li,dd,dt,h1,h2,h3,h4{overflow-wrap:anywhere}p{margin:.6em 0}ul{padding-left:1.3em}.literal{white-space:pre-wrap}",
  ".eyebrow{font-size:.85rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#29695b}",
  ".badge{display:inline-block;border:1px solid #29695b;border-radius:4px;padding:3px 9px;font-weight:650}",
  ".notice{border-left:4px solid #a96b20;background:#fff8e9;padding:12px 16px;margin:18px 0}.muted{color:#475e64}",
  ".day,.omitted,.source-section{background:#fff;border:1px solid #c9d9d3;border-radius:8px;padding:16px 20px;margin:14px 0}",
  ".day>h3{font-size:1.1rem;border-bottom:1px solid #dbe5df;padding-bottom:8px}.pick+.pick{border-top:1px solid #dbe5df;padding-top:16px;margin-top:20px}",
  ".pick{break-inside:avoid}.pick h4{font-size:1.15rem;margin:8px 0}.meta{font-size:.88rem;color:#475e64}.explanation{border-left:2px solid #c9d9d3;padding-left:12px}",
  "dl{display:grid;grid-template-columns:minmax(100px,160px) 1fr;gap:6px 14px;margin:12px 0}dt{font-weight:650}dd{margin:0}.source-id{font-family:ui-monospace,monospace;font-size:.85em}",
  ".empty{font-style:italic;color:#475e64}footer{border-top:1px solid #c9d9d3;margin-top:28px;padding-top:16px;font-size:.88rem}",
  "@media(max-width:520px){main{padding:20px 14px 36px}h1{font-size:1.65rem}.day,.omitted,.source-section{padding:12px}dl{display:block}dt{margin-top:10px}}",
  "@page{size:auto;margin:16mm}@media print{:root{background:#fff;color:#000}main{max-width:none;padding:0}header{border-color:#333}.day,.omitted,.source-section{border-color:#aaa;background:#fff}.notice{background:#fff;border-color:#666}h2,h3,h4{break-after:avoid}.day{break-inside:auto}.muted,.meta,.empty{color:#333}}",
].join("\n");

function literal(value, className = "") {
  return '<span class="literal ' + className + '">' + escapeText(value) + "</span>";
}

function list(values, emptyText) {
  return values.length
    ? "<ul>" + values.map((value) => "<li>" + literal(value) + "</li>").join("") + "</ul>"
    : '<p class="empty">' + escapeText(emptyText) + "</p>";
}

function pickHtml({ key, originalDay, pick }) {
  return '<article class="pick" data-occurrence="' + escapeText(key) + '">' +
    "<h4>" + literal(pick.name) + "</h4>" +
    '<p class="meta">' + escapeText(pick.kind === "outing" ? "Cultural outing" : "Restaurant") +
    " · Original suggestion: " + escapeText(originalDay) +
    " · Occurrence " + escapeText(key) + "</p>" +
    "<dl><dt>Original Qloo ID</dt><dd>" + literal(pick.entity_id, "source-id") + "</dd>" +
    "<dt>Original affinity</dt><dd>" + (pick.affinity == null ? "Not recorded" : escapeText(pick.affinity)) + "</dd></dl>" +
    (pick.fallback === true ? '<p class="meta">Original search was widened.</p>' : "") +
    '<p class="explanation literal">' + escapeText(pick.why) + "</p></article>";
}

function sourceLabel(mode) {
  if (mode === "mock") return {
    title: "Saved fictional demo",
    detail: "The saved source is labeled mock. Venues are fictional and affinities are hand-set.",
  };
  if (mode === "live") return {
    title: "Saved live-source label",
    detail: "The saved file labels its original source live. This report does not authenticate that label or refresh provider data.",
  };
  return {
    title: "Saved source unknown",
    detail: "The saved file does not establish whether its original source was mock or live.",
  };
}

/**
 * Read and validate through the canonical v1 codec. Every arrangement is
 * reconstructed by that codec; no serialized derived picks are accepted here.
 */
export function renderSavedWeekReport(text, { sourceName = "Saved week", sourceSha256 = null } = {}) {
  if (typeof sourceName !== "string") throw new TypeError("The source name must be text.");
  if (sourceSha256 !== null && (typeof sourceSha256 !== "string" || !/^[0-9a-f]{64}$/.test(sourceSha256))) {
    throw new TypeError("The source fingerprint must be a lowercase SHA-256 value.");
  }
  const saved = readWeekFile(text);
  const { state, inputs, response, receivedAt, savedAt } = saved;
  const rows = weekRows(state);
  const omitted = offWeekPicks(state);
  const scheduled = state.picks.length - omitted.length;
  const source = sourceLabel(state.sourceMode);
  const rejected = response.plan.rejected;

  const html = [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;">',
    "<title>TasteTable saved week · " + escapeText(state.weekStart) + "</title>",
    "<style>" + CSS + "</style></head><body><main>",
    '<header><p class="eyebrow">TasteTable · Caregiver handoff</p>',
    "<h1>Week of " + escapeText(rows[0].date) + "–" + escapeText(rows[6].date) + "</h1>",
    '<p><span class="badge">' + source.title + "</span></p>",
    '<p class="literal">' + escapeText(sourceName) + "</p>",
    "<p>" + scheduled + " scheduled " + (scheduled === 1 ? "visit" : "visits") + " · " +
      omitted.length + " kept off this week</p></header>",
    '<section class="notice" aria-label="About this saved handoff">',
    "<p><strong>Saved planning suggestions; original checks have not been rerun.</strong> " + source.detail + "</p>",
    "<p>Dates are planning choices, not reservations or verified availability. Food and accessibility checks are heuristics over tags and keywords, not medical or dietary advice. Confirm needs and current details with the venue and care team.</p>",
    "<p>Visit-only venue questions and caregiver reply notes are not stored in the saved-week v1 file and are not included here.</p>",
    "</section>",
    '<section class="source-section" aria-labelledby="source-heading"><h2 id="source-heading">Saved source and requested inputs</h2>',
    "<dl><dt>Original received timestamp</dt><dd>" + escapeText(receivedAt) + "</dd>",
    "<dt>Saved-copy timestamp</dt><dd>" + escapeText(savedAt) + "</dd>",
    "<dt>City</dt><dd>" + (inputs.city ? literal(inputs.city) : "No location specified") + "</dd></dl>",
    "<p class=\"muted\">These timestamps are copied from the saved file. They are not a new venue check, a report-generation time, or proof of source authenticity.</p>",
    "<h3>Requested constraints (as saved)</h3>" + list(inputs.constraints, "No constraints were requested."),
    "<h3>Cuisines</h3>" + list(inputs.cuisines, "None recorded."),
    "<h3>Music</h3>" + list(inputs.music, "None recorded."),
    "<h3>Films</h3>" + list(inputs.films, "None recorded."),
    sourceSha256 ? "<p>Source file SHA-256: <span class=\"source-id\">" + sourceSha256 + "</span></p>" : "",
    "</section>",
    '<section aria-labelledby="arrangement-heading"><h2 id="arrangement-heading">Arranged week</h2>',
    ...rows.map((row) => '<section class="day"><h3>' + escapeText(row.day) + " · " + escapeText(row.date) +
      "</h3>" + (row.picks.length ? row.picks.map(pickHtml).join("") : '<p class="empty">No visit scheduled.</p>') + "</section>"),
    "</section>",
    '<section class="omitted" aria-labelledby="omitted-heading"><h2 id="omitted-heading">Kept off this week</h2>',
    omitted.length ? omitted.map(pickHtml).join("") : '<p class="empty">No suggestions are kept off the week.</p>',
    "</section>",
    '<section class="source-section" aria-labelledby="notes-heading"><h2 id="notes-heading">Original plan notes</h2>',
    list(response.plan.notes, "No original plan notes were recorded."),
    "</section>",
    '<section class="source-section" aria-labelledby="rejected-heading"><h2 id="rejected-heading">Original rejected candidates</h2>',
    "<p class=\"muted\">These reasons belong to the original response. They have not been reevaluated.</p>",
    rejected.length ? rejected.map((candidate) => "<article><h3>" + literal(candidate.name) +
      "</h3>" + (candidate.failed.length ? "<ul>" + candidate.failed.map((check) =>
        "<li>" + literal(check.constraint) + " · " + literal(check.status) + ": " + literal(check.reason) + "</li>"
      ).join("") + "</ul>" : '<p class="empty">No failed-check detail was recorded.</p>') + "</article>").join("")
      : '<p class="empty">No rejected candidates were recorded.</p>',
    "</section>",
    "<footer><p>This read-only handoff preserves the arranged suggestions and displayed source details. Keep the original JSON to reopen or rearrange the week in TasteTable and inspect its complete comparison and tool trace. Rendering this HTML does not change that file.</p>",
    "<p>Open this file in a browser to read or print it offline. It contains no scripts, remote assets or automatic network requests.</p></footer>",
    "</main></body></html>\n",
  ].join("\n");
  return {
    html,
    weekStart: state.weekStart,
    sourceMode: state.sourceMode,
    picks: state.picks.length,
    scheduled,
    omitted: omitted.length,
  };
}
