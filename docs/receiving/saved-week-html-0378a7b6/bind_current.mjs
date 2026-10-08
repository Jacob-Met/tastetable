import assert from "node:assert/strict";
import fs from "node:fs";
import {createHash} from "node:crypto";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {renderSavedWeekReport} from "../../../static/week_report.mjs";
const here=dirname(fileURLToPath(import.meta.url)), out=join(here,"browser-v2");
const sha=x=>createHash("sha256").update(x).digest("hex");
const prior=JSON.parse(fs.readFileSync(join(out,"receipt.json"),"utf8"));
const results=[];
for(const [name,expected] of Object.entries(prior.reports)) {
 const bytes=fs.readFileSync(join(out,name+".json"));
 const actual=renderSavedWeekReport(bytes.toString("utf8"),{sourceName:name+".json",sourceSha256:sha(bytes)});
 assert.equal(sha(Buffer.from(actual.html)),expected.sha256);
 results.push({name,unchangedHtmlSha256:expected.sha256});
}
fs.writeFileSync(join(here,"current-browser-output-equivalence.json"),JSON.stringify({when:new Date().toISOString(),moduleSha256:sha(fs.readFileSync(join(here,"../../../static/week_report.mjs"))),currentReportOutputsEqual:results},null,2)+"\n");
const first=join(here,"codepoints-baseline");
for(const [from,to] of [["nul.json","reserved-nul-name-input.json"],["nul.html","reserved-nul-name-output.html"]]) {
 if(fs.existsSync(join(first,from))) fs.renameSync(join(first,from),join(first,to));
}
fs.writeFileSync(join(first,"receiving-failure.json"),JSON.stringify({message:"The first codepoint receiver used nul.html as a case filename. Chromium refused the Windows reserved DOS name with net::ERR_FILE_NOT_FOUND. Product source remained unchanged. The receiver was corrected to nul-character; all three baseline mismatches were then observed in codepoints-baseline-v2. Original bytes renamed to portable reserved-nul-name-input.json and reserved-nul-name-output.html.",phase:"receiver setup failure; not a product-fidelity result"},null,2)+"\n");
console.log(JSON.stringify({identicalBrowserOutputs:results.length}));
