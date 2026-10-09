/** Ordered, read-only same-week handoffs using the canonical saved-week codec. */
import { readWeekFile } from "./week_file.mjs";
import { weekRows, offWeekPicks } from "./week_plan.mjs";

export const MAX_ROSTER_SOURCES = 20;
export const MAX_ROSTER_HTML_BYTES = 32 * 1024 * 1024;

// Match the existing week-report literal text contract, including CR retention.
function escapeText(value) {
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0) throw new TypeError("A displayed field contains NUL, which cannot be preserved in HTML.");
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new TypeError("A displayed field contains an unpaired UTF-16 surrogate.");
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError("A displayed field contains an unpaired UTF-16 surrogate.");
    }
  }
  return text.replace(/[&<>"'\r]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "\r": "&#13;",
  })[character]);
}
const literal = (value) => '<span class="literal">' + escapeText(value) + "</span>";
function list(append, values, empty = "None recorded.") {
  if (!values.length) { append('<p class="empty">' + escapeText(empty) + "</p>"); return; }
  append("<ul>");
  for (const value of values) append("<li>" + literal(value) + "</li>");
  append("</ul>");
}
const sourceTitle = (source) => "Source " + source.ordinal + " · " + literal(source.sourceName);
const sourceLabel = (mode) => ({
  mock: "Saved fictional demo: venues are fictional and affinities are hand-set.",
  live: "Saved live-source label: this label is not authenticated and provider data has not been refreshed.",
  unknown: "Saved source unknown: the file does not establish whether its source was mock or live.",
})[mode];

function pickHtml(append, source, { key, originalDay, pick }) {
  append('<article class="pick" data-source="' + source.ordinal + '" data-occurrence="' + key + '">' +
    '<p class="source-tag">' + sourceTitle(source) + "</p>" +
    "<h4>" + literal(pick.name) + "</h4>" +
    '<p class="meta">' + (pick.kind === "outing" ? "Cultural outing" : "Restaurant") +
    " · Original suggestion: " + escapeText(originalDay) + " · Occurrence " + key + "</p>" +
    "<p>" + sourceLabel(source.saved.state.sourceMode) + "</p>" +
    '<div class="constraints"><strong>Requested constraints for this source (as saved)</strong>');
  list(append, source.saved.inputs.constraints, "No constraints were requested.");
  append("</div>" +
    "<dl><dt>Original Qloo ID</dt><dd>" + literal(pick.entity_id) + "</dd>" +
    "<dt>Original affinity</dt><dd>" + (pick.affinity == null ? "Not recorded" : escapeText(pick.affinity)) + "</dd></dl>" +
    (pick.fallback === true ? '<p class="meta">Original search was widened.</p>' : "") +
    '<p class="explanation literal">' + escapeText(pick.why) + "</p></article>");
}

function sourceHtml(append, source) {
  const { inputs, receivedAt, savedAt, response, state } = source.saved;
  append('<section class="source" data-source-summary="' + source.ordinal + '">' +
    "<h3>" + sourceTitle(source) + "</h3><p>" + sourceLabel(state.sourceMode) + "</p>" +
    "<p>" + (state.picks.length - source.omitted.length) + " scheduled · " + source.omitted.length + " kept off this week</p>" +
    "<dl><dt>Original received timestamp</dt><dd>" + escapeText(receivedAt) + "</dd>" +
    "<dt>Saved-copy timestamp</dt><dd>" + escapeText(savedAt) + "</dd>" +
    "<dt>Source file SHA-256</dt><dd class=\"digest\">" + (source.sourceSha256 ?? "Not supplied") + "</dd>" +
    "<dt>City</dt><dd>" + (inputs.city ? literal(inputs.city) : "No location specified") + "</dd></dl>" +
    "<h4>Requested constraints (as saved)</h4>");
  list(append, inputs.constraints, "No constraints were requested.");
  for (const [label, values] of [["Cuisines", inputs.cuisines], ["Music", inputs.music], ["Films", inputs.films]]) {
    append("<h4>" + label + "</h4>"); list(append, values);
  }
  append("<h4>Original plan notes</h4>");
  list(append, response.plan.notes, "No original plan notes were recorded.");
  append("<h4>Original rejected candidates</h4><p class=\"meta\">These original reasons have not been reevaluated.</p>");
  if (!response.plan.rejected.length) append('<p class="empty">No rejected candidates were recorded.</p>');
  for (const candidate of response.plan.rejected) {
    append("<article><h5>" + literal(candidate.name) + "</h5>");
    if (candidate.failed.length) {
      append("<ul>");
      for (const check of candidate.failed) append("<li>" + literal(check.constraint) + " · " + literal(check.status) + ": " + literal(check.reason) + "</li>");
      append("</ul>");
    } else append('<p class="empty">No failed-check detail was recorded.</p>');
    append("</article>");
  }
  append("</section>");
}

function boundedHtml() {
  const chunks = [];
  let bytes = 0, firstItem = true;
  function append(fragment) {
    // Count UTF-8 without allocating an encoded copy. Displayed source strings
    // have already passed escapeText's surrogate/NUL admission.
    for (let i = 0; i < fragment.length; i += 1) {
      const code = fragment.charCodeAt(i);
      bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code >= 0xd800 && code <= 0xdbff ? 4 : 3;
      if (code >= 0xd800 && code <= 0xdbff) i += 1;
      if (bytes > MAX_ROSTER_HTML_BYTES) throw new RangeError("Rendered roster exceeds 32 MiB.");
    }
    chunks.push(fragment);
  }
  function item(fragment = "") {
    if (!firstItem) append("\n");
    firstItem = false;
    append(fragment);
  }
  return { append, item, finish: () => chunks.join("") };
}

const CSS = [
  ":root{color-scheme:light;font:16px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;color:#18332c;background:#f3f6f2}",
  "*{box-sizing:border-box}body{margin:0}main{max-width:960px;margin:auto;padding:32px 24px 56px}header{border-bottom:3px solid #39694c;padding-bottom:20px}",
  "h1{font-size:2rem;line-height:1.15}h2{font-size:1.4rem;margin-top:2em}h3{font-size:1.2rem}h4{font-size:1.08rem}h5{font-size:1rem}h3,h4,h5{margin:.6em 0}",
  "p,li,dd,dt,h1,h2,h3,h4,h5{overflow-wrap:anywhere}.literal{white-space:pre-wrap}ul{padding-left:1.4em}.eyebrow,.source-tag{font-weight:700;color:#315b40}",
  ".notice{border-left:4px solid #9b7227;background:#fff8e8;padding:12px 16px;margin:20px 0}.day,.source,.off-source{background:#fff;border:1px solid #c6d4c5;border-radius:8px;padding:18px 20px;margin:16px 0}",
  ".pick{border-top:1px solid #d7e0d4;padding-top:12px;margin-top:16px;break-inside:avoid}.source-tag{margin:.2em 0}.meta,.empty{color:#475c4f;font-size:.9rem}.empty{font-style:italic}.constraints{border-left:3px solid #c6d4c5;padding-left:12px}.constraints ul{margin:.3em 0}.explanation{border-left:2px solid #c6d4c5;padding-left:12px}",
  "dl{display:grid;grid-template-columns:minmax(110px,190px) 1fr;gap:6px 16px}dt{font-weight:650}dd{margin:0}.digest{font-family:ui-monospace,monospace;font-size:.85rem}footer{border-top:1px solid #c6d4c5;margin-top:28px;padding-top:12px}",
  "@media(max-width:540px){main{padding:20px 14px 36px}.day,.source,.off-source{padding:12px}h1{font-size:1.6rem}dl{display:block}dt{margin-top:10px}}",
  "@page{size:auto;margin:16mm}@media print{:root{color:#000;background:#fff}main{max-width:none;padding:0}.day,.source,.off-source,.notice{background:#fff;border-color:#999}.meta,.empty,.source-tag,.eyebrow{color:#222}h2,h3,h4,h5{break-after:avoid}.day,.source,.off-source{break-inside:auto}}",
].join("\n");

/** Each supplied entry is an occurrence, even when its name, bytes or path repeat. */
export function renderSavedWeekRoster(entries) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > MAX_ROSTER_SOURCES) {
    throw new TypeError("Choose between 1 and 20 explicit saved weeks.");
  }
  const sources = Array.from(entries, (entry, index) => {
    try {
      if (!entry || typeof entry.sourceName !== "string") throw new TypeError("The source name must be text.");
      const sourceSha256 = entry.sourceSha256 ?? null;
      if (sourceSha256 !== null && (typeof sourceSha256 !== "string" || !/^[0-9a-f]{64}$/.test(sourceSha256))) {
        throw new TypeError("The source fingerprint must be a lowercase SHA-256 value.");
      }
      const saved = readWeekFile(entry.text);
      return { ordinal: index + 1, sourceName: entry.sourceName, sourceSha256, saved,
        rows: weekRows(saved.state), omitted: offWeekPicks(saved.state) };
    } catch (error) {
      throw new TypeError("Source " + (index + 1) + ": " + error.message);
    }
  });
  const weekStart = sources[0].saved.state.weekStart;
  for (const source of sources) {
    if (source.saved.state.weekStart !== weekStart) {
      throw new RangeError("Source " + source.ordinal + " is for week " + source.saved.state.weekStart +
        "; every source must match week " + weekStart + ". No dates were changed.");
    }
  }
  const summaries = sources.map(({ ordinal, sourceName, sourceSha256, saved, omitted }) => ({
    ordinal, sourceName, sourceSha256, sourceMode: saved.state.sourceMode,
    receivedAt: saved.receivedAt, savedAt: saved.savedAt, picks: saved.state.picks.length,
    scheduled: saved.state.picks.length - omitted.length, omitted: omitted.length,
  }));
  const picks = summaries.reduce((sum, source) => sum + source.picks, 0);
  const omitted = summaries.reduce((sum, source) => sum + source.omitted, 0);
  const output = boundedHtml();
  const { append, item } = output;
  const opening = [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;">',
    "<title>TasteTable week roster · " + weekStart + "</title><style>" + CSS + "</style></head><body><main>",
    '<header><p class="eyebrow">TasteTable · Caregiver handoff</p><h1>Week roster</h1>',
    "<p>" + weekStart + "–" + sources[0].rows[6].date + " · " + sources.length + " saved sources</p>",
    "<p>" + (picks - omitted) + " scheduled occurrences · " + omitted + " kept off this week</p></header>",
    '<section class="notice" aria-label="About this roster"><p><strong>Saved planning suggestions; original checks have not been rerun.</strong></p>',
    "<p>Source numbers follow your input order. Filenames are labels, not person identifiers. Repeated files and venues remain separate occurrences; this roster does not decide who attends together.</p>",
    "<p>Dates are planning choices, not reservations or verified availability. Food and accessibility checks are heuristics over tags and keywords, not medical or dietary advice. Confirm needs and current details with the venue and care team.</p>",
    "<p>Visit-only venue questions and caregiver reply notes are not stored in saved-week v1 files and are not included here.</p></section>",
    '<section aria-labelledby="days-heading"><h2 id="days-heading">Day-by-day roster</h2>',
  ];
  for (const fragment of opening) item(fragment);
  for (const [index, row] of sources[0].rows.entries()) {
    item('<section class="day" data-date="' + row.date + '"><h3>' + row.day + " · " + row.date + "</h3>");
    let scheduled = false;
    for (const source of sources) for (const pick of source.rows[index].picks) {
      scheduled = true; pickHtml(append, source, pick);
    }
    if (!scheduled) append('<p class="empty">No visit scheduled from these sources.</p>');
    append("</section>");
  }
  item('</section><section class="omitted" aria-labelledby="off-heading"><h2 id="off-heading">Kept off this week</h2>');
  for (const source of sources) {
    item('<section class="off-source" data-omitted-source="' + source.ordinal + '"><h3>' + sourceTitle(source) + "</h3>");
    if (source.omitted.length) for (const pick of source.omitted) pickHtml(append, source, pick);
    else append('<p class="empty">No suggestions from this source are kept off the week.</p>');
    append("</section>");
  }
  item('</section><section aria-labelledby="sources-heading"><h2 id="sources-heading">Separate source records</h2>');
  item("<p>These original timestamps are copied from each saved file. They are not new checks, roster-generation times or proof of authenticity. SHA-256 fingerprints describe the captured input bytes.</p>");
  for (const source of sources) { item(); sourceHtml(append, source); }
  item("</section><footer><p>Keep each original JSON to reopen or rearrange its week and inspect its complete comparison and tool trace. This read-only roster changes no source file.</p>");
  item("<p>Open this HTML in a browser to read or print offline. It contains no scripts, remote assets or automatic network requests.</p></footer></main></body></html>\n");
  const html = output.finish();
  return { html, weekStart, picks, scheduled: picks - omitted, omitted, sources: summaries };
}
