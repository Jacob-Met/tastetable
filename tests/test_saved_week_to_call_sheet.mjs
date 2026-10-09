import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readWeekFile } from "../static/week_file.mjs";
import { createVenueFollowup } from "../static/venue_followup.mjs";
import { readVenueNoteFile } from "../static/venue_note_file.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "tools/saved_week_to_call_sheet.mjs");
const sha = value => createHash("sha256").update(value).digest("hex");
const json = value => JSON.stringify(value, null, 2) + "\n";
const blank = () => ({ status: "not_contacted", question: null, reply: "", replyQuestions: null, nextStep: "" });
function fixture() {
  const counts = { picks: 3, with_qloo_entity_id: 3, with_affinity_evidence: 0, constraint_checked: 3, unsafe_candidates_rejected: 0 };
  const response = {
    mock: true,
    plan: { meals: [0, 1, 2].map(i => ({ name: 'Fictional "Maple", café 雨', entity_id: "fictional-same-place",
      kind: "restaurant", day: "Monday", why: "Original occurrence " + (i + 1), affinity: 0, fallback: false })),
      outing: null, notes: ["Fictional authored CLI control."], rejected: [] },
    llm_only: { meals: [], outing: { name: "Fictional comparator", why: "No recommendation", day: "Sunday" } },
    comparison: { constraints: ["wheelchair"], grounded: counts, llm_only: { ...counts } },
    trace: [{ tool: "authored_fixture", args: { retained: { marker: "exact-original-source" } }, result_summary: "No provider call." }],
  };
  const week = { format: "tastetable.saved-week.v1", receivedAt: "2026-10-01T10:00:00.000Z",
    savedAt: "2026-10-01T11:00:00.000Z", calendarId: "0123456789abcdef0123456789abcdef",
    inputs: { city: "Fictional City", cuisines: [], music: [], films: [], constraints: ["wheelchair"] },
    response, week: { start: "2026-10-05", assignments: { "pick-0": "Tuesday", "pick-1": "Tuesday", "pick-2": null } } };
  const origin = structuredClone(Object.fromEntries(["receivedAt", "calendarId", "inputs", "response"].map(k => [k, week[k]])));
  const notes = { format: "tastetable.venue-notes.v1", savedAt: "2026-10-02T12:00:00.000Z", origin, records: [
    { key: "pick-0", date: "2026-10-06", note: { status: "follow_up", question: "Revised entrance?\nSecond line.",
      reply: 'Earlier "reply", café 雨', replyQuestions: "Earlier question?", nextStep: "Ask again." } },
    { key: "pick-1", date: "2026-10-06", note: { ...blank(), question: "" } },
    { key: "pick-0", date: "2026-09-29", note: { ...blank(), nextStep: "HISTORICAL_ONLY_MARKER" } },
    { key: "pick-2", date: "2026-10-06", note: { ...blank(), nextStep: "OMITTED_ONLY_MARKER" } },
  ] };
  return { week, notes };
}
function context(t, values = fixture()) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tastetable-call-sheet-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const p = { dir, week: path.join(dir, "saved café.json"), notes: path.join(dir, "notes.json"), output: path.join(dir, "sheet.txt"), ...values };
  p.weekFile = path.join(dir, "saved café.json"); p.notesFile = path.join(dir, "notes.json");
  fs.writeFileSync(p.weekFile, json(values.week)); fs.writeFileSync(p.notesFile, json(values.notes));
  return p;
}
function argv(p, output = p.output) { return ["--input", p.weekFile, "--venue-notes", p.notesFile, "--output", output]; }
function run(args, options = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", timeout: 10000, ...options });
  assert.equal(result.error, undefined, result.error?.message); assert.equal(result.signal, null);
  return result;
}
function exactText(p) {
  const opened = readWeekFile(fs.readFileSync(p.weekFile, "utf8"));
  const saved = "Saved copy opened from “" + path.basename(p.weekFile) + "” (saved " + opened.savedAt
    + "). Source labels and checks below are retained from the file; they have not been run again.";
  const model = createVenueFollowup(opened.state, saved);
  const notes = readVenueNoteFile(fs.readFileSync(p.notesFile, "utf8"), { origin: opened, state: opened.state, model });
  model.replaceRecords(notes.records);
  return model.text(opened.state);
}
function refusal(p, expected = 2) {
  const r = run(argv(p)); assert.equal(r.status, expected, r.stderr); assert.equal(r.stdout, "");
  assert.match(r.stderr, /^tastetable-call-sheet:/); assert.equal(fs.existsSync(p.output), false);
  assert.deepEqual(fs.readdirSync(p.dir).filter(n => n.startsWith(".tastetable-call-sheet-")), []);
  return r;
}
function hooked(p, mode) {
  const script = path.join(p.dir, "hook.mjs"), audit = path.join(p.dir, "hook-audit.json");
  const source = [
    'import fs from "node:fs"; import fsp from "node:fs/promises"; import {syncBuiltinESMExports} from "node:module";',
    'const mode=' + JSON.stringify(mode) + ', args=' + JSON.stringify(argv(p)) + ', audit=' + JSON.stringify(audit) + ';',
    'const real={open:fsp.open.bind(fsp),link:fsp.link.bind(fsp),unlink:fsp.unlink.bind(fsp),write:fs.writeSync,append:fsp.appendFile.bind(fsp),writeFile:fsp.writeFile.bind(fsp)};',
    'let hits=0, sourceOpens=0;',
    'fsp.open=async function(file,...rest){',
    ' if(String(file)===args[1] && ++sourceOpens===2 && mode==="source-change"){hits++;await real.append(file," ");}',
    ' const h=await real.open(file,...rest);',
    ' if(String(file).endsWith("completed.txt") && ["write","sync"].includes(mode)){const key=mode==="write"?"writeFile":"sync";h[key]=async()=>{hits++;throw Object.assign(new Error("selected "+mode+" refusal"),{code:"EIO"});};}',
    ' return h;};',
    'fsp.link=async function(from,to){if(mode==="collision"){hits++;await real.writeFile(to,"FOREIGN", {flag:"wx"});}if(mode==="link"){hits++;throw Object.assign(new Error("selected link refusal"),{code:"EIO"});}return real.link(from,to);};',
    'fsp.unlink=async function(file){if(mode==="cleanup"&&String(file).endsWith("completed.txt")){hits++;throw Object.assign(new Error("selected cleanup refusal"),{code:"EIO"});}return real.unlink(file);};',
    'fs.writeSync=function(fd,...rest){if((mode==="stdout"||mode==="help")&&fd===1){hits++;throw Object.assign(new Error("selected stdout refusal"),{code:"EIO"});}if(mode==="stderr"&&fd===2){hits++;throw Object.assign(new Error("selected stderr refusal"),{code:"EIO"});}return real.write(fd,...rest);};syncBuiltinESMExports();',
    'const {main}=await import(' + JSON.stringify(pathToFileURL(cli).href) + ');',
    'const code=await main(mode==="help"?["--help"]:mode==="stderr"?["--bad"]:args);',
    'fs.writeFileSync(audit,JSON.stringify({hits,code,sourceOpens}));process.exitCode=code;',
  ].join("\n");
  fs.writeFileSync(script, source);
  const r = spawnSync(process.execPath, [script], { encoding: "utf8", timeout: 10000 });
  assert.equal(r.error, undefined); assert.equal(r.signal, null);
  const observation = JSON.parse(fs.readFileSync(audit, "utf8")); assert.ok(observation.hits > 0, mode + " hook must run");
  assert.equal(r.status, observation.code); return { ...r, observation };
}

test("import has no command execution or file I/O", () => {
  const script = 'import fs from "node:fs/promises";for(const k of ["open","readFile","writeFile","lstat","mkdtemp","link"])fs[k]=()=>{throw new Error("unexpected I/O "+k)};const m=await import('
    + JSON.stringify(pathToFileURL(cli).href) + ');if(typeof m.main!=="function")throw Error("missing main");';
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout, ""); assert.equal(r.stderr, "");
});
test("real command retains exact native UTF-8 and complete receipt with unchanged inputs", t => {
  const p = context(t), before = [p.weekFile, p.notesFile].map(f => fs.readFileSync(f));
  const expected = Buffer.from(exactText(p)), r = run(argv(p));
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stderr, "");
  assert.deepEqual(fs.readFileSync(p.output), expected);
  assert.deepEqual(JSON.parse(r.stdout), {
    format: "tastetable.venue-call-sheet.v1", input: p.weekFile, inputSha256: sha(before[0]),
    venueNotes: p.notesFile, venueNotesSha256: sha(before[1]), output: p.output,
    outputSha256: sha(expected), outputBytes: expected.length, weekStart: "2026-10-05", sourceMode: "mock",
    savedWeekAt: p.week.savedAt, venueNotesSavedAt: p.notes.savedAt, originalPicks: 3, scheduledVisits: 2,
    omittedPicks: 1, retainedNoteRecords: 4, currentNoteRecords: 2, excludedNoteRecords: 2,
  });
  assert.ok(r.stdout.endsWith("\n"));
  [p.weekFile, p.notesFile].forEach((f, i) => assert.deepEqual(fs.readFileSync(f), before[i]));
  assert.deepEqual(fs.readdirSync(p.dir).sort(), ["notes.json", "saved café.json", "sheet.txt"].sort());
});
test("same-name occurrences, revised reply and explicit empty questions stay distinct", t => {
  const p = context(t); assert.equal(run(argv(p)).status, 0);
  const text = fs.readFileSync(p.output, "utf8");
  assert.match(text, /Suggested visit 1; Qloo entity: fictional-same-place/);
  assert.match(text, /Suggested visit 2; Qloo entity: fictional-same-place/);
  assert.match(text, /Questions for the earlier reply \/ notes:\n  Earlier question\?/);
  assert.match(text, /No questions entered\./); assert.match(text, /Earlier "reply", café 雨/);
  assert.doesNotMatch(text, /HISTORICAL_ONLY_MARKER|OMITTED_ONLY_MARKER|Suggested visit 3;/);
});
test("empty matching notes remain valid; all omitted arrangements refuse", t => {
  const f = fixture(); f.notes.records = []; const p = context(t, f);
  assert.equal(run(argv(p)).status, 0); assert.match(fs.readFileSync(p.output, "utf8"), /Will you be open on 2026-10-06/);
  const q = context(t); for (const key of Object.keys(q.week.week.assignments)) q.week.week.assignments[key] = null;
  fs.writeFileSync(q.weekFile, json(q.week)); refusal(q);
});
test("complete origin and complete record admission precede output", t => {
  for (const mutate of [
    x => { x.notes.origin.response.trace[0].args.retained.marker = "different"; },
    x => { x.notes.records.push(structuredClone(x.notes.records[0])); },
    x => { x.notes.records[0].note.status = "reply_recorded"; },
    x => { x.notes.records[0].key = "pick-999"; },
    x => { x.notes.records[0].note.replyQuestions = null; },
    x => { x.notes.records[0].date = "2026-02-30"; },
  ]) { const f = fixture(); mutate(f); refusal(context(t, f)); }
});
test("strict UTF-8, native single BOM and raw-byte receipts", t => {
  const p = context(t);
  for (const f of [p.weekFile, p.notesFile]) fs.writeFileSync(f, Buffer.concat([Buffer.from([239,187,191]), fs.readFileSync(f)]));
  const r = run(argv(p)); assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).inputSha256, sha(fs.readFileSync(p.weekFile)));
  for (const bytes of [Buffer.from([0xff]), Buffer.from("\ufeff\ufeff"+json(fixture().notes)), Buffer.from(json(fixture().notes), "utf16le")]) {
    const q = context(t); fs.writeFileSync(q.notesFile, bytes); refusal(q);
  }
});
test("raw file byte caps admit the boundary and refuse one extra byte", t => {
  const p = context(t);
  for (const [f, size] of [[p.weekFile, 4194304], [p.notesFile, 2097152]]) {
    const bytes = fs.readFileSync(f); fs.writeFileSync(f, Buffer.concat([bytes, Buffer.alloc(size-bytes.length, 32)]));
  }
  assert.equal(run(argv(p)).status, 0);
  for (const [key, size] of [["weekFile", 4194304], ["notesFile", 2097152]]) {
    const q = context(t), bytes = fs.readFileSync(q[key]);
    fs.writeFileSync(q[key], Buffer.concat([bytes, Buffer.alloc(size+1-bytes.length, 32)])); refusal(q);
  }
});
test("acquired regular-file admission allows source symlinks and refuses directories/FIFO", t => {
  const p = context(t), link = path.join(p.dir, "linked.json");
  if (process.platform !== "win32") {
    fs.symlinkSync(p.weekFile, link); const a = argv(p); a[1] = link; assert.equal(run(a).status, 0);
  }
  const q = context(t); q.weekFile = q.dir; refusal(q);
  if (process.platform !== "win32") {
    const r = context(t), fifo = path.join(r.dir, "input.fifo");
    const made = spawnSync("mkfifo", [fifo], { encoding: "utf8" });
    assert.equal(made.status, 0, made.stderr); r.weekFile = fifo; refusal(r);
  }
});
test("existing output, input alias, hard link, symlink and directory never get replaced", t => {
  for (const kind of ["file", "week", "hardlink", "directory", ...(process.platform==="win32"?[]:["symlink", "dangling"])]) {
    const p = context(t), original = fs.readFileSync(p.weekFile);
    if (kind === "file") fs.writeFileSync(p.output, "UNCHANGED");
    if (kind === "week") p.output = p.weekFile;
    if (kind === "hardlink") fs.linkSync(p.weekFile, p.output);
    if (kind === "directory") fs.mkdirSync(p.output);
    if (kind === "symlink") fs.symlinkSync(p.weekFile, p.output);
    if (kind === "dangling") fs.symlinkSync(path.join(p.dir, "absent"), p.output);
    const before = fs.lstatSync(p.output), r = run(argv(p));
    assert.equal(r.status, 2, kind+":"+r.stderr); assert.equal(r.stdout, "");
    assert.equal(fs.lstatSync(p.output).ino, before.ino); assert.deepEqual(fs.readFileSync(p.weekFile), original);
    if (kind === "file") assert.equal(fs.readFileSync(p.output,"utf8"), "UNCHANGED");
  }
});
test("complete argv validation runs before attempted input admission", () => {
  for (const args of [[], ["--bad"], ["--help", "--input", "none"], ["--input","-","--venue-notes","none","--output","none"],
    ["--input","none","--input","none"], ["--input","none","--venue-notes","none","--output",""],
    ["--input","none","--venue-notes","none","--output","none","trailing"]]) {
    const r=run(args); assert.equal(r.status,2); assert.equal(r.stdout,""); assert.doesNotMatch(r.stderr,/Cannot read/);
  }
  const help=run(["--help"]); assert.equal(help.status,0); assert.equal(help.stderr,""); assert.match(help.stdout,/other-date|Other-date/);
});
test("selected source mutation refuses before any output publication", t => {
  const p=context(t), before=fs.readFileSync(p.weekFile), r=hooked(p,"source-change");
  assert.equal(r.status,2,r.stderr); assert.match(r.stderr,/input changed/i); assert.equal(r.stdout,""); assert.equal(fs.existsSync(p.output),false);
  assert.deepEqual(fs.readFileSync(p.weekFile),Buffer.concat([before,Buffer.from(" ")]));
});
test("exclusive-link race preserves the independently created destination", t => {
  const p=context(t),r=hooked(p,"collision"); assert.equal(r.status,2,r.stderr); assert.equal(r.stdout,"");
  assert.equal(fs.readFileSync(p.output,"utf8"),"FOREIGN"); assert.deepEqual(fs.readdirSync(p.dir).filter(n=>n.startsWith(".tastetable-call-sheet-")),[]);
});
test("selected write, sync and link failures produce no partial final file", t => {
  for(const mode of ["write","sync","link"]){const p=context(t),r=hooked(p,mode);assert.equal(r.status,1,r.stderr);assert.equal(r.stdout,"");assert.equal(fs.existsSync(p.output),false);assert.deepEqual(fs.readdirSync(p.dir).filter(n=>n.startsWith(".tastetable-call-sheet-")),[]);}
});
test("post-publication cleanup and receipt failures retain complete TXT and truthful diagnostics", t => {
  for(const mode of ["cleanup","stdout"]){const p=context(t),expected=exactText(p),r=hooked(p,mode);
    assert.equal(r.status,1,r.stderr);assert.equal(r.stdout,"");assert.equal(fs.readFileSync(p.output,"utf8"),expected);
    assert.match(r.stderr,/was created, but final cleanup or receipt delivery failed/);}
});
test("help delivery failure is 1; primary usage refusal stays 2 if diagnostic fails", t => {
  const p=context(t),help=hooked(p,"help");assert.equal(help.status,1);assert.equal(help.stdout,"");assert.equal(fs.existsSync(p.output),false);
  const q=context(t),bad=hooked(q,"stderr");assert.equal(bad.status,2);assert.equal(bad.stdout,"");assert.equal(bad.stderr,"");assert.equal(fs.existsSync(q.output),false);
});
test("actual unavailable output device preserves post-publication truth", {skip:process.platform==="win32"||!fs.existsSync("/dev/full")}, t => {
  const p=context(t),fd=fs.openSync("/dev/full","w");
  try {const r=run(argv(p),{stdio:["ignore",fd,"pipe"]});assert.equal(r.status,1,r.stderr);assert.match(r.stderr,/was created/);assert.equal(fs.readFileSync(p.output,"utf8"),exactText(p));}
  finally {fs.closeSync(fd);}
});
