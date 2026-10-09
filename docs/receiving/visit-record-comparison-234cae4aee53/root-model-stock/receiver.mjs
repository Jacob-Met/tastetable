import fs from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import assert from "node:assert/strict";

const root = resolve(process.argv[2] || "");
const ownedRoot = "/dev/shm/tastetable-model-stock-234cae4aee53";
assert.equal(root, ownedRoot, "Only the prepared owned root is admitted.");
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
    "path": "docs/receiving/visit-record-comparison-234cae4aee53/peer-recovery/model-oracle-v1.mjs",
    "bytes": 14260,
    "sha256": "d507a0e78b53019bbda10ecc55b51832eb9da4b173038879cdfc49f2b5e9190c",
    "gitBlob": "1dcf2b4e10b05560960063dec0d263a42c69cb4e"
  },
  {
    "path": "tests/test_visit_record_compare_oracle.mjs",
    "bytes": 2815,
    "sha256": "cfd689bcf71e750d7a1268b229c3cfebdb716ae8d045420a0bd0484d7756d905",
    "gitBlob": "829bc786ad5b375e7471261f5d74b273047cdcd6"
  }
];
const sha = data => createHash("sha256").update(data).digest("hex");
const git = data => createHash("sha1").update(Buffer.from("blob " + data.length)).update(Buffer.from([0])).update(data).digest("hex");
const inspect = () => expected.map(pin => {
  try {
    const path = join(root, pin.path), info = fs.lstatSync(path), bytes = fs.readFileSync(path);
    return { path: pin.path, bytes: bytes.length, sha256: sha(bytes), gitBlob: git(bytes),
      mode: info.mode & 0o777, regular: info.isFile(), symbolic: info.isSymbolicLink() };
  } catch (error) {
    return { path: pin.path, error: { name: error.name, code: error.code ?? null, message: error.message } };
  }
});
const matches = items => items.length === expected.length && items.every((item, index) => {
  const pin = expected[index];
  return item.path === pin.path && item.bytes === pin.bytes && item.sha256 === pin.sha256
    && item.gitBlob === pin.gitBlob && item.mode === 0o644 && item.regular && !item.symbolic;
});
const destination = join(root, "raw-receipt.json.gz");
assert.equal(fs.existsSync(destination), false, "Do not replace an earlier receipt.");
const collector = fs.readFileSync(fileURLToPath(import.meta.url));
const sourceManifest = fs.readFileSync(join(root, "SOURCE.json"));
const receipt = {
  schema: "tastetable.root-ordinary-model-receiving/1",
  purpose: "New ordinary-file execution of the new maintained adapter; not recovery of lost historical raw packets.",
  root, startedAt: new Date().toISOString(),
  node: process.version, versions: process.versions, platform: process.platform, arch: process.arch,
  executable: process.execPath, collectorArgv: process.argv, collectorCwd: process.cwd(),
  collector: { bytes: collector.length, sha256: sha(collector), gitBlob: git(collector) },
  sourceManifest: { bytes: sourceManifest.length, sha256: sha(sourceManifest), value: JSON.parse(sourceManifest) },
  expected, before: inspect(), after: null, process: null, testCounts: null, diagnostic: null,
  sourceUnchanged: false, accepted: false, failure: null,
  boundary: "Six ordinary source files; no loader, filesystem adapter, large CLI input, browser, hosted workflow or installed-client run. Generated oracle fixture values are new values from this invocation, not recovered old physical files."
};
try {
  assert.ok(matches(receipt.before), "Before-source pins/modes differ.");
  const space = fs.statfsSync(root);
  receipt.freeBytesBefore = space.bavail * space.bsize;
  assert.ok(receipt.freeBytesBefore >= 32768, "At least 32 KiB must remain for receipt custody.");
  const env = { ...process.env, NO_COLOR: "1" };
  for (const key of ["NODE_OPTIONS", "NODE_COMPILE_CACHE", "NODE_V8_COVERAGE", "FORCE_COLOR"]) delete env[key];
  const args = ["--test", "--test-reporter=tap", "--test-concurrency=1", "tests/test_visit_record_compare_oracle.mjs"];
  const start = new Date().toISOString();
  const child = spawnSync(process.execPath, args, { cwd: root, env, timeout: 60000, maxBuffer: 1024 * 1024 });
  const finished = new Date().toISOString();
  const stream = value => {
    const bytes = value ?? Buffer.alloc(0);
    return { bytes: bytes.length, sha256: sha(bytes), base64: bytes.toString("base64"), utf8: bytes.toString("utf8") };
  };
  receipt.process = {
    executable: process.execPath, argv: args, cwd: root, startedAt: start, finishedAt: finished, pid: child.pid ?? null,
    timeoutMs: 60000, maxBufferBytes: 1024 * 1024,
    environment: { NO_COLOR: "1", NODE_OPTIONS: null, NODE_COMPILE_CACHE: null, NODE_V8_COVERAGE: null, FORCE_COLOR: null },
    status: child.status, signal: child.signal,
    error: child.error ? { name: child.error.name, code: child.error.code ?? null, message: child.error.message } : null,
    stdout: stream(child.stdout), stderr: stream(child.stderr),
    rawStreamsComplete: !child.error
  };
  receipt.after = inspect();
  receipt.sourceUnchanged = matches(receipt.after) && JSON.stringify(receipt.before) === JSON.stringify(receipt.after);
  const stdout = receipt.process.stdout.utf8;
  const counts = {};
  for (const label of ["tests", "pass", "fail", "cancelled", "skipped", "todo"]) {
    const found = stdout.match(new RegExp("^# " + label + " (\\d+)\\s*$", "m"));
    counts[label] = found ? Number(found[1]) : null;
  }
  receipt.testCounts = counts;
  const diagnostics = stdout.split(/\r?\n/).map(line => line.replace(/^\s*#\s?/, ""))
    .filter(line => line.startsWith('{"adapter":')).map(line => JSON.parse(line));
  assert.equal(child.status, 0);
  assert.equal(child.signal, null);
  assert.equal(child.error, undefined);
  assert.equal(receipt.process.stderr.bytes, 0);
  assert.ok(receipt.process.rawStreamsComplete);
  assert.ok(receipt.sourceUnchanged);
  assert.deepEqual(counts, { tests: 1, pass: 1, fail: 0, cancelled: 0, skipped: 0, todo: 0 });
  assert.equal(diagnostics.length, 1);
  const diagnostic = diagnostics[0];
  receipt.diagnostic = diagnostic;
  assert.equal(diagnostic.adapter, "new maintained test using ordinary module imports");
  assert.equal(diagnostic.groups.length, 7);
  assert.deepEqual(diagnostic.calls, { compare: 60, render: 41 });
  assert.equal(diagnostic.oracle.before, expected[4].sha256);
  assert.equal(diagnostic.oracle.after, expected[4].sha256);
  assert.equal(diagnostic.checks.length, 1);
  const check = diagnostic.checks[0];
  assert.deepEqual(check.literalCounts, { total: 5, changed: 4, unchanged: 1, outcomeChanged: 2, dateChanged: 2, noteChanged: 2 });
  assert.equal(check.refusals, 15);
  assert.equal(check.identityVariants, 8);
  assert.equal(check.fieldPairs, 7);
  assert.equal(check.maximumRows, 100);
  receipt.accepted = true;
} catch (error) {
  receipt.failure = { name: error.name, code: error.code ?? null, message: error.message, stack: error.stack };
  if (!receipt.after) receipt.after = inspect();
}
receipt.finishedAt = new Date().toISOString();
const raw = Buffer.from(JSON.stringify(receipt, null, 2) + "\n");
const gzip = gzipSync(raw, { level: 9 });
fs.writeFileSync(destination, gzip, { flag: "wx", mode: 0o600 });
assert.equal(sha(fs.readFileSync(destination)), sha(gzip));
console.log(JSON.stringify({
  accepted: receipt.accepted, testCounts: receipt.testCounts, calls: receipt.diagnostic?.calls ?? null,
  status: receipt.process?.status ?? null, sourceUnchanged: receipt.sourceUnchanged, failure: receipt.failure,
  rawBytes: raw.length, rawSha256: sha(raw), gzipBytes: gzip.length, gzipSha256: sha(gzip),
  destination, rawGzipBase64: gzip.toString("base64")
}));
process.exitCode = receipt.accepted ? 0 : 1;
