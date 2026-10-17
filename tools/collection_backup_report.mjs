#!/usr/bin/env node
/** Passive, complete inventory of one retained native collection backup. */
import fsDefault from 'node:fs/promises';
import { writeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCollectionInput, writeNew, CollectionInputError } from './collection_week.mjs';
import { MAX_COLLECTION_BYTES, readCollectionBackup } from '../static/saved_week_collection.mjs';
import { draftSummary } from '../static/saved_weeks.mjs';

export const MAX_REPORT_BYTES = 64 * 1024 * 1024;
export class CollectionReportError extends Error {}
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const message = (error) => error?.message || String(error);
const escape = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const literal = (value) => escape(JSON.stringify(value, null, 2));
const sourceLabels = Object.freeze({
  mock: 'Demo draft — fictional venues from a synthetic fixture',
  live: 'Saved Qloo response — details still need confirmation',
  unknown: 'Saved draft — original data source unspecified',
});
const USAGE = [
  'Usage: node tools/collection_backup_report.mjs --input BACKUP.json --output NEW.html',
  '       node tools/collection_backup_report.mjs --help',
  '',
  'Read every named week in a complete saved collection as one passive HTML report.',
  'Node.js 18+; no npm dependencies, browser storage or provider calls.',
  'Choose a completed regular UTF-8 backup (32 MiB maximum), and an unused output name.',
  'The output parent must exist and support hard links. The original backup is preserved.',
  'The HTML includes a download of the exact complete original backup.',
  '',
].join('\n');

function prepareReport(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_COLLECTION_BYTES) {
    throw new CollectionReportError('Choose a collection backup string of at most 32 MiB.');
  }
  const raw = Buffer.from(text, 'utf8');
  if (raw.toString('utf8') !== text) {
    throw new CollectionReportError('Raw unpaired UTF-16 units cannot be preserved as UTF-8.');
  }
  let backup, summaries;
  try {
    backup = readCollectionBackup(text);
    summaries = backup.records.map((record) => draftSummary(record));
  } catch (error) {
    throw new CollectionReportError('Cannot use the complete collection backup: ' + message(error));
  }
  const parts = [];
  let bytes = 0;
  const add = (chunk) => {
    bytes += Buffer.byteLength(chunk, 'utf8');
    if (bytes > MAX_REPORT_BYTES) throw new CollectionReportError('The complete HTML report exceeds 64 MiB. No records were clipped.');
    parts.push(chunk);
  };
  const field = (key, value) => add(`<dt>${escape(key)}</dt><dd data-field="${escape(key)}"><pre>${literal(value)}</pre></dd>\n`);
  const occurrence = ({ key, pick }) => add(`<li class="occurrence" data-key="${escape(key)}"><h5>${escape(key)}</h5><pre class="pick-json">${literal(pick)}</pre></li>\n`);
  add(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Saved-week collection report</title>
<style>
:root{font-family:system-ui,sans-serif;color:#172d35;background:#f5f7f5;line-height:1.5}
body{max-width:72rem;margin:auto;padding:1.25rem}a{color:#075c79}h1,h2,h3,h4{line-height:1.25}
header,nav,.saved-week{background:white;border:1px solid #c5d4d2;border-radius:.6rem;padding:1.25rem;margin-bottom:1.25rem}
pre{white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;margin:.35rem 0;font:inherit}
dt{font-weight:650}dd{margin:0 0 .65rem}ol,ul{padding-left:1.6rem}.occurrence{margin:.7rem 0}
.day,.omitted{border-top:1px solid #dce4e2;padding-top:.5rem}summary{cursor:pointer;font-weight:650}
details{padding:.8rem;background:#f4f6f4;border:1px solid #dce4e2}code{overflow-wrap:anywhere}
@media print{body{max-width:none;padding:0;background:white}header,nav,.saved-week{border-radius:0}.saved-week{break-before:page}a{color:inherit}}
</style></head><body><header><h1>Saved-week collection report</h1>
<p>Read-only arrangements from one retained backup. Saved dates, source labels and hashes are recorded data, not current venue verification or care advice.</p>
<p>Text values use JSON quotation and escapes so unusual characters remain visible as literal data. The original backup download preserves its exact bytes.</p><dl>
`);
  field('format', backup.format);
  field('savedAt', backup.savedAt);
  field('inputBytes', raw.length);
  field('inputSha256', sha(raw));
  field('records', backup.records.length);
  add(`</dl><p><a id="download-backup" download="collection-backup.json" href="data:application/json;base64,${raw.toString('base64')}">Download original collection backup</a> — the complete original file, including every saved copy.</p></header>\n`);
  if (!backup.records.length) add('<p id="empty-collection">This backup contains no saved weeks.</p>\n');
  else {
    add('<nav aria-label="Saved weeks"><h2>Saved copies in backup order</h2><ol>\n');
    backup.records.forEach((record, index) => add(`<li><a href="#week-${index + 1}">Record ${index + 1} · ${literal(record.name)} · ${literal(summaries[index].weekStart)}</a></li>\n`));
    add('</ol></nav>\n');
  }
  backup.records.forEach((record, index) => {
    const summary = summaries[index];
    add(`<section class="saved-week" id="week-${index + 1}"><h2>Record ${index + 1} · ${literal(record.name)}</h2><dl>\n`);
    for (const key of ['id', 'name', 'createdAt', 'updatedAt']) field(key, record[key]);
    for (const key of ['weekStart', 'sourceMode', 'constraints', 'suggested', 'scheduled']) field(key, summary[key]);
    field('omitted', summary.omitted.length);
    add(`</dl><p class="source-qualification">${escape(sourceLabels[summary.sourceMode])}</p><h3>Planned days</h3>\n`);
    for (const day of summary.rows) {
      add(`<section class="day" data-day="${escape(day.day)}"><h4>${escape(day.day)} · ${escape(day.date)}</h4>\n`);
      if (day.picks.length) {
        add('<ol>\n');day.picks.forEach(occurrence);add('</ol>\n');
      } else add('<p>Open day</p>\n');
      add('</section>\n');
    }
    add('<section class="omitted"><h3>Kept off this week</h3>\n');
    if (summary.omitted.length) {
      add('<ol>\n');summary.omitted.forEach(occurrence);add('</ol>\n');
    } else add('<p>No suggestions kept off this week.</p>\n');
    add(`</section><details class="stored-week"><summary>Stored portable-week text</summary><pre>${literal(record.text)}</pre></details></section>\n`);
  });
  add('</body></html>\n');
  return { html: parts.join(''), records: backup.records.length, inputBytes: raw.length, inputSha256: sha(raw) };
}

/** Return the complete deterministic page; no reads, writes or producer calls. */
export function renderCollectionBackup(text) { return prepareReport(text).html; }

function parseArgs(argv) {
  if (!Array.isArray(argv) || !argv.every((value) => typeof value === 'string')) throw new CollectionReportError('Arguments must be strings. Use --help.');
  if (argv.length === 1 && argv[0] === '--help') return null;
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index], value = argv[index + 1];
    if (!['--input', '--output'].includes(option)) throw new CollectionReportError('Unknown option: ' + option + '. Use --help.');
    const key = option.slice(2);
    if (Object.hasOwn(result, key)) throw new CollectionReportError('Repeated option: ' + option + '.');
    if (!value || value.startsWith('--') || value === '-') throw new CollectionReportError('Choose an explicit path for ' + option + '.');
    result[key] = value;
  }
  if (!result.input || !result.output) throw new CollectionReportError('--input and --output are required. Use --help.');
  return result;
}

function emit(write, fd, text) {
  const buffer = Buffer.from(text, 'utf8');
  let offset = 0;
  while (offset < buffer.length) {
    const count = write(fd, buffer, offset, buffer.length - offset);
    if (!Number.isInteger(count) || count <= 0 || count > buffer.length - offset) throw new Error('Output accepted an invalid byte count.');
    offset += count;
  }
}

export async function main(argv = process.argv.slice(2), { fs = fsDefault, write = writeSync } = {}) {
  let published = false, output;
  try {
    const args = parseArgs(argv);
    if (!args) { emit(write, 1, USAGE); return 0; }
    const input = await readCollectionInput(args.input, fs);
    const report = prepareReport(input.text);
    output = resolve(args.output);
    const bytes = Buffer.from(report.html, 'utf8');
    await writeNew(output, report.html, { fs, onPublished: () => { published = true; } });
    emit(write, 1, JSON.stringify({ schema: 'tastetable.collection-report.v1',
      input: { path: resolve(args.input), bytes: report.inputBytes, sha256: input.sha256 },
      output: { path: output, bytes: bytes.length, sha256: sha(bytes) }, records: report.records,
    }, null, 2) + '\n');
    return 0;
  } catch (error) {
    const prefix = published ? 'Collection report was created at ' + output + ', but final cleanup or receipt delivery failed: ' : '';
    try { emit(write, 2, 'tastetable-collection-report: ' + prefix + message(error) + '\n'); } catch { /* Keep the original nonzero result. */ }
    return published ? 1 : (error instanceof CollectionReportError || error instanceof CollectionInputError || error?.exitCode === 2 ? 2 : 1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) process.exitCode = await main();
