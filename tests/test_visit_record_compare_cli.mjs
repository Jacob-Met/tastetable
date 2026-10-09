import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createVisitRecord, updateVisitRecord, makeVisitRecordFile, VISIT_RECORD_LIMITS } from "../static/visit_record.mjs";
import { renderVisitRecordComparisonText } from "../static/visit_record_compare.mjs";

const cli = fileURLToPath(new URL("../tools/compare_visit_records.mjs", import.meta.url));
const cleanEnv = { ...process.env };
delete cleanEnv.NODE_OPTIONS;
delete cleanEnv.NODE_COMPILE_CACHE;
delete cleanEnv.NODE_V8_COVERAGE;
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
function sourceText(number = 4) {
  const counts = {picks:0,with_qloo_entity_id:0,with_affinity_evidence:0,constraint_checked:0,unsafe_candidates_rejected:0};
  const picks = [
    {name:"Café, 杏 🌙",entity_id:"same-venue",kind:"restaurant",day:"Tuesday",why:"Original first explanation",unknown:{ordinal:0,keep:true}},
    {name:"Café, 杏 🌙",entity_id:"same-venue",kind:"restaurant",day:"Thursday",why:"Original second explanation",unknown:{ordinal:1,keep:false}},
    {name:"Name\nwith a line",entity_id:"third",kind:"restaurant",day:"Friday",why:"Original third \u2028 explanation"},
    {name:"Museum",entity_id:"outing",kind:"outing",day:"Sunday",why:"Original outing"}
  ];
  const selected = Array.from({length:number},(_,i)=>i<4?structuredClone(picks[i]):{name:"Extra "+i,entity_id:"extra-"+i,kind:"restaurant",day:"Monday",why:"Unchanged extra "+i});
  // Keep every authored occurrence in native array order; all are meal slots here.
  const envelope = {format:"tastetable.saved-week.v1",receivedAt:"2025-03-20T01:02:03.000Z",savedAt:"2025-03-29T04:05:06.000Z",calendarId:null,
    inputs:{city:"Fictional City",cuisines:["Café"],music:[],films:[],constraints:["wheelchair"],opaque:"retained"},
    response:{mock:true,plan:{meals:selected,outing:null,notes:["Original note"],rejected:[]},llm_only:{meals:[],outing:{name:"Comparison",day:"Saturday",why:"Original comparison"}},comparison:{constraints:["wheelchair"],grounded:counts,llm_only:counts},trace:[],opaque:{literal:"not attendance"}},
    week:{start:"2025-03-31",assignments:Object.fromEntries(selected.map((p,i)=>["pick-"+i,[ "Monday",null,"Saturday","Sunday"][i%4]]))},
    opaque:{sourceFormatting:"preserved"}
  };
  return "\uFEFF"+JSON.stringify(envelope,null,2).replaceAll("\n","\r\n")+"\r\n";
}
function fixturePair() {
  const weekText=sourceText();
  let before=createVisitRecord(weekText," earlier copy.json "), after=createVisitRecord(weekText," renamed copy.json ");
  const left=[{outcome:"unrecorded",date:null,note:"same"},{outcome:"unrecorded",date:null,note:"first\r\nline"},{outcome:"unrecorded",date:null,note:"untouched"},{outcome:"went",date:"2025-04-06",note:"recorded 🌿"}];
  const right=[{outcome:"went",date:null,note:"same"},{outcome:"unrecorded",date:null,note:"first\nline"},{outcome:"unrecorded",date:"2025-05-17",note:"untouched"},{outcome:"unrecorded",date:null,note:""}];
  for(let i=0;i<4;i++){before=updateVisitRecord(before,"pick-"+i,left[i]);after=updateVisitRecord(after,"pick-"+i,right[i]);}
  return {weekText,before,after,beforeText:makeVisitRecordFile(before,new Date("2026-07-02T12:30:00.000Z")).text,afterText:makeVisitRecordFile(after,new Date("2025-07-02T12:30:00.000Z")).text};
}

function sandbox(t) {
  const path = mkdtempSync(join(tmpdir(), "tastetable-visit-compare-"));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  return path;
}
function put(root, name, bytes) {
  const path = join(root, name);
  writeFileSync(path, bytes, { mode: 0o640 });
  return path;
}
function snapshot(path) {
  const bytes = readFileSync(path);
  const info = statSync(path);
  return { bytes: bytes.length, sha256: digest(bytes), mode: info.mode };
}
function unchanged(paths, expected) {
  assert.deepEqual(paths.map(snapshot), expected, "input byte hashes and modes must be unchanged");
}
function run(cwd, args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd, env: cleanEnv, timeout: 10000, maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.error, undefined, "child must start and finish before its deadline");
  assert.equal(result.signal, null, "child must exit normally");
  return result;
}
function accepted(result, expected) {
  assert.equal(result.status, 0, result.stderr.toString("utf8"));
  assert.equal(result.stderr.length, 0);
  assert.deepEqual(result.stdout, Buffer.from(expected, "utf8"));
}
function refused(result) {
  assert.equal(result.status, 2);
  assert.equal(result.stdout.length, 0, "input refusal must not emit a partial success report");
  assert.ok(result.stderr.length > 0);
  assert.match(result.stderr.toString("utf8"), /^tastetable-visit-compare:/);
}

test("CLI help and grammar finish in an empty working directory", t => {
  const root = sandbox(t);
  const help = run(root, ["--help"]);
  assert.equal(help.status, 0);
  assert.equal(help.stderr.length, 0);
  assert.match(help.stdout.toString("utf8"), /--before BEFORE.json --after AFTER.json/);
  for (const args of [
    [], ["--help", "--before", "absent"], ["--unknown"], ["--before"],
    ["--before", ""], ["--before=x", "--after", "y"], ["x", "y"],
    ["--", "--before", "x", "--after", "y"],
    ["--before", "x", "--before", "y", "--after", "z"],
    ["--before", "x", "--after", "y", "--after", "z"],
    ["--before", "-", "--after", "x"], ["--before", "x", "--after", "-"],
  ]) refused(run(root, args));
});

test("CLI loads real Unicode paths from another cwd and preserves both input files", t => {
  const root = sandbox(t);
  const pair = fixturePair();
  const before = put(root, "before 杏 🌙.json", pair.beforeText);
  const after = put(root, "after é.json", pair.afterText);
  const paths = [before, after];
  const prior = paths.map(snapshot);
  const cwd = join(root, "empty");
  mkdirSync(cwd);
  accepted(run(cwd, ["--before", before, "--after", after]),
    renderVisitRecordComparisonText(pair.beforeText, pair.afterText));
  accepted(run(cwd, ["--after", after, "--before", before]),
    renderVisitRecordComparisonText(pair.beforeText, pair.afterText));
  accepted(run(cwd, ["--before", after, "--after", before]),
    renderVisitRecordComparisonText(pair.afterText, pair.beforeText));
  unchanged(paths, prior);
});

test("CLI treats hyphen-prefixed filenames literally and accepts the same file twice", t => {
  const root = sandbox(t);
  const pair = fixturePair();
  const paths = [
    put(root, "--after", pair.beforeText), put(root, "--help", pair.afterText),
  ];
  const prior = paths.map(snapshot);
  accepted(run(root, ["--before", "--after", "--after", "--help"]),
    renderVisitRecordComparisonText(pair.beforeText, pair.afterText));
  accepted(run(root, ["--after", "--after", "--before", "--after"]),
    renderVisitRecordComparisonText(pair.beforeText, pair.beforeText));
  unchanged(paths, prior);
});

test("CLI refuses native admission, exact-source mismatch and damaged UTF-8 on either side", t => {
  const root = sandbox(t);
  const pair = fixturePair();
  const valid = put(root, "valid.json", pair.beforeText);
  const sourceChanged = JSON.parse(pair.afterText);
  sourceChanged.source.weekText += "\n";
  const badVisit = JSON.parse(pair.afterText);
  badVisit.visits[0].outcome = "maybe";
  const cases = [
    Buffer.alloc(0),
    Buffer.from("{", "utf8"),
    Buffer.from(JSON.stringify(badVisit), "utf8"),
    Buffer.from(JSON.stringify(sourceChanged), "utf8"),
    Buffer.from([0xc3, 0x28]),
    Buffer.from([0xe2, 0x82]),
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf]), Buffer.from(pair.afterText)]),
  ];
  const validPrior = snapshot(valid);
  for (const [index, bytes] of cases.entries()) {
    const invalid = put(root, "invalid-" + index + ".json", bytes);
    const prior = snapshot(invalid);
    refused(run(root, ["--before", invalid, "--after", valid]));
    refused(run(root, ["--before", valid, "--after", invalid]));
    assert.deepEqual(snapshot(invalid), prior);
  }
  assert.deepEqual(snapshot(valid), validPrior);
});

test("CLI refuses missing paths and acquired directories on either side", t => {
  const root = sandbox(t);
  const valid = put(root, "valid.json", fixturePair().beforeText);
  const prior = snapshot(valid);
  const directory = join(root, "directory");
  mkdirSync(directory);
  for (const invalid of [join(root, "missing.json"), directory]) {
    refused(run(root, ["--before", invalid, "--after", valid]));
    refused(run(root, ["--before", valid, "--after", invalid]));
  }
  assert.deepEqual(snapshot(valid), prior);
  assert.equal(statSync(directory).isDirectory(), true);
});

test("CLI admits exactly 8 MiB of raw UTF-8 and counts a leading BOM", t => {
  const root = sandbox(t);
  const pair = fixturePair();
  const valid = put(root, "valid.json", pair.beforeText);
  const validPrior = snapshot(valid);
  const limit = VISIT_RECORD_LIMITS.fileBytes;
  const boundary = join(root, "boundary.json");
  const report = renderVisitRecordComparisonText(pair.beforeText, pair.afterText);
  for (const bom of [false, true]) {
    const prefix = Buffer.from((bom ? "\uFEFF" : "") + pair.afterText, "utf8");
    const bytes = Buffer.alloc(limit, 0x20);
    prefix.copy(bytes);
    writeFileSync(boundary, bytes, { mode: 0o640 });
    const prior = snapshot(boundary);
    assert.equal(prior.bytes, 8 * 1024 * 1024);
    accepted(run(root, ["--before", valid, "--after", boundary]), report);
    accepted(run(root, ["--before", boundary, "--after", valid]),
      renderVisitRecordComparisonText(pair.afterText, pair.beforeText));
    assert.deepEqual(snapshot(boundary), prior);
  }
  assert.deepEqual(snapshot(valid), validPrior);
});

test("CLI refuses 8 MiB plus one raw byte even when the extra data is JSON whitespace", t => {
  const root = sandbox(t);
  const pair = fixturePair();
  const valid = put(root, "valid.json", pair.beforeText);
  const bytes = Buffer.alloc(VISIT_RECORD_LIMITS.fileBytes + 1, 0x20);
  Buffer.from("\uFEFF" + pair.afterText, "utf8").copy(bytes);
  const oversized = put(root, "oversized.json", bytes);
  const paths = [valid, oversized];
  const prior = paths.map(snapshot);
  refused(run(root, ["--before", oversized, "--after", valid]));
  refused(run(root, ["--before", valid, "--after", oversized]));
  unchanged(paths, prior);
});
