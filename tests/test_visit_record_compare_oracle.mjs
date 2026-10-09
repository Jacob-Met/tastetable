/**
 * New maintained adapter for the unchanged independent oracle by
 * estate-234cae4aee53 / repo_delivery. This is not the lost authored model test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as comparison from "../static/visit_record_compare.mjs";
import * as record from "../static/visit_record.mjs";
import * as file from "../static/week_file.mjs";
import * as plan from "../static/week_plan.mjs";
import { receive } from "../docs/receiving/visit-record-comparison-234cae4aee53/peer-recovery/model-oracle-v1.mjs";

const ORACLE_SHA256 = "d507a0e78b53019bbda10ecc55b51832eb9da4b173038879cdfc49f2b5e9190c";
const EXPECTED_GROUPS = [
  "literal five-row complete result, duplicate occurrences, native source order and recursive immutability",
  "caller reversal, metadata-only differences and outer-envelope BOM without chronology promotion",
  "independent field transitions, clears, date boundaries and exact Unicode/CR/CRLF/LF comparison",
  "eight independently admitted different originals refused in both caller orders",
  "zero and100 original occurrences, explicit unrecorded values and101-producer refusal",
  "fifteen complete-record refusals preserve native admission on both API sides and renderer",
  "literal JSON-quoted report, separator/injection controls, complete changed triples and explicit no changes"
];
const oracleUrl = new URL(
  "../docs/receiving/visit-record-comparison-234cae4aee53/peer-recovery/model-oracle-v1.mjs",
  import.meta.url,
);
const oracleHash = () => createHash("sha256").update(readFileSync(oracleUrl)).digest("hex");

// Seven oracle groups execute inside one native node:test case.
test("visit-record comparison satisfies the frozen independent oracle", async t => {
  const oracleBefore = oracleHash();
  assert.equal(oracleBefore, ORACLE_SHA256, "The attributed historical oracle must remain byte-exact.");
  const result = await receive({ api: comparison, record, file, plan });
  const oracleAfter = oracleHash();
  assert.equal(oracleAfter, ORACLE_SHA256, "The oracle file must remain unchanged after receiving.");
  assert.equal(result.format, "tastetable-visit-comparison-peer/1");
  assert.equal(result.pass, true);
  assert.deepEqual(result.groups, EXPECTED_GROUPS);
  assert.deepEqual(result.calls, { compare: 60, render: 41 });

  // The oracle's returned boundary string describes its historical loader run.
  // Do not emit or adopt that stale label for this ordinary-import adapter.
  t.diagnostic(JSON.stringify({
    adapter: "new maintained test using ordinary module imports",
    oracle: { before: oracleBefore, after: oracleAfter },
    groups: result.groups,
    calls: result.calls,
    checks: result.checks,
  }));
});
