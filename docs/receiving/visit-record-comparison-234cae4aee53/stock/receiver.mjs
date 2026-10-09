import fs from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

const root = resolve(process.argv[1]);
const expected = [
  {
    "path": "static/visit_record.mjs",
    "bytes": 7525,
    "sha256": "feab129527c2b596cbc64f26c59901dbfb878bf590d3927f1819af4edc1a3b2f",
    "gitBlob": "2b5b37e3d4a227e00a5b0052a962d13512b53e48"
  },
  {
    "path": "static/week_file.mjs",
    "bytes": 6642,
    "sha256": "914291b97250a97f6e09f47e6fed58b607b3b1ed9e4c60e3242ff39546913614",
    "gitBlob": "420ddb8f63fca264dcf97be7147801105696155d"
  },
  {
    "path": "static/week_plan.mjs",
    "bytes": 3913,
    "sha256": "e739adc10d9ae9ba1cb82c6d800c453e8f7bec53e343e0685adeabe98e6f4809",
    "gitBlob": "8ed28163e0273c510fdd8e6f7c5d1c8476efb862"
  },
  {
    "path": "static/visit_record_compare.mjs",
    "bytes": 5264,
    "sha256": "3db538f048db2b7239b95c1e6e8d180701113a73fc77723e4cf68a85bc721275",
    "gitBlob": "83de5285cfc48c77be44f24bea2729fefd591d7d"
  },
  {
    "path": "tools/compare_visit_records.mjs",
    "bytes": 4792,
    "sha256": "cb13f55d4ab3243afdbc527989850fc42f8a039aa258537746dc498f27664839",
    "gitBlob": "560bce0a3f61faec8d68d78686037616076e4184"
  },
  {
    "path": "tests/test_visit_record_compare_cli.mjs",
    "bytes": 10638,
    "sha256": "53701c592d60048882ed0c3e778ee94de720ac76d6f756ba37d427e9ecdb57f3",
    "gitBlob": "0275beaec2490dad52d83b7802a7299d7867b432"
  }
];
const sha = data => createHash("sha256").update(data).digest("hex");
function receive() {
  return expected.map(pin => {
    const file = join(root, pin.path);
    const bytes = fs.readFileSync(file);
    const info = fs.statSync(file);
    return { path: pin.path, bytes: bytes.length, sha256: sha(bytes), mode: info.mode };
  });
}
const before = receive();
const pinErrors = before.filter((item, index) => item.bytes !== expected[index].bytes || item.sha256 !== expected[index].sha256);
if (pinErrors.length) throw new Error("Source pin mismatch: " + JSON.stringify(pinErrors));
const temporary = join(root, "temporary");
fs.mkdirSync(temporary, { recursive: false });
const space = fs.statfsSync(temporary);
const free = space.bavail * space.bsize;
if (free < 10 * 1024 * 1024) {
  fs.rmdirSync(temporary);
  throw new Error("Stock test run refused before child launch: less than 10 MiB available in its own temporary directory.");
}
const env = { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary, NO_COLOR: "1" };
delete env.NODE_OPTIONS;
delete env.NODE_COMPILE_CACHE;
delete env.NODE_V8_COVERAGE;
const startedAt = new Date().toISOString();
const result = spawnSync(process.execPath,
  ["--test", "--test-reporter=tap", "tests/test_visit_record_compare_cli.mjs"],
  { cwd: root, env, encoding: "utf8", timeout: 180000, maxBuffer: 1024 * 1024 });
const finishedAt = new Date().toISOString();
const after = receive();
const sourceUnchanged = JSON.stringify(before) === JSON.stringify(after);
const residue = fs.readdirSync(temporary);
if (residue.length === 0) fs.rmdirSync(temporary);
const count = (label) => {
  const match = result.stdout?.match(new RegExp("^# " + label + " (\\d+)\\s*$", "m"));
  return match ? Number(match[1]) : null;
};
const testCounts = { tests: count("tests"), pass: count("pass"), fail: count("fail") };
const accepted = result.status === 0 && result.signal === null && !result.error
  && result.stderr === "" && sourceUnchanged && residue.length === 0
  && testCounts.tests === 7 && testCounts.pass === 7 && testCounts.fail === 0;
const receipt = {
  schema: "tastetable.visit-record-comparison.stock-cli/1",
  root, startedAt, finishedAt, node: process.version, platform: process.platform,
  arch: process.arch, executable: process.execPath,
  command: ["--test", "--test-reporter=tap", "tests/test_visit_record_compare_cli.mjs"],
  before, after, sourceUnchanged, temporaryFreeBytesBefore: free, temporaryResidue: residue,
  status: result.status, signal: result.signal, error: result.error ? String(result.error) : null,
  stdout: result.stdout, stderr: result.stderr, testCounts, accepted,
  qualification: "One stock Node invocation; six ordinary source files and real temporary input files. No source loader, syscall adapter, browser, full-checkout or hosted claim.",
};
const raw = Buffer.from(JSON.stringify(receipt, null, 2) + "\n");
const compressed = gzipSync(raw);
console.log(JSON.stringify({
  accepted, testCounts, status: result.status, sourceUnchanged,
  rawBytes: raw.length, rawSha256: sha(raw),
  gzipBytes: compressed.length, gzipSha256: sha(compressed),
  gzipBase64: compressed.toString("base64"),
}));
process.exitCode = accepted ? 0 : 1;
