/* Keep browser temporary files and evidence export inside one exec lifetime. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const [sourceArgument, evidenceArgument] = process.argv.slice(2);
if (!sourceArgument || !evidenceArgument) throw new Error("Usage: node run_with_ephemeral_profile.cjs SOURCE_ROOT NEW_EVIDENCE_DIRECTORY");
const source = fs.realpathSync(sourceArgument);
const evidence = path.resolve(evidenceArgument);
fs.mkdirSync(evidence);
const temporary = `/dev/hamon-tastetable-6c20bb4b010e-${process.pid}`;
fs.mkdirSync(temporary);
const output = path.join(temporary, "receiving");
const execution = spawnSync(process.execPath, [path.join(source, "tests/venue_followup.browser.cjs"), source, output], {
  cwd: source, env: process.env, encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
});
const files = [];
if (fs.existsSync(output)) {
  for (const entry of fs.readdirSync(output, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const bytes = fs.readFileSync(path.join(output, entry.name));
    fs.writeFileSync(path.join(evidence, entry.name), bytes, { flag: "wx" });
    files.push({ path: entry.name, bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") });
  }
}
fs.writeFileSync(path.join(evidence, "runner.stdout.txt"), execution.stdout || "", { flag: "wx" });
fs.writeFileSync(path.join(evidence, "runner.stderr.txt"), execution.stderr || "", { flag: "wx" });
fs.writeFileSync(path.join(evidence, "ephemeral-export.json"), JSON.stringify({
  scope: "The unchanged native browser driver ran in a fresh exclusive regular directory on ephemeral /dev tmpfs; only final flat evidence files were copied to persistent scratch before this exec ended. No device nodes or services were changed.",
  source, temporaryOutput: output, evidence, exitCode: execution.status, signal: execution.signal,
  error: execution.error ? String(execution.error) : null, files,
}, null, 2) + "\n", { flag: "wx" });
fs.rmSync(temporary, { recursive: true, force: true });
process.stdout.write(execution.stdout || "");
process.stderr.write(execution.stderr || "");
process.exitCode = execution.status === 0 ? 0 : 1;
