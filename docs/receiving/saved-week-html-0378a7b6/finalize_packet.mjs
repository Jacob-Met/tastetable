import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {dirname,join,resolve,relative} from "node:path";
import {fileURLToPath} from "node:url";
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,"../../..");
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const gitHash=bytes=>createHash("sha1").update(Buffer.from("blob "+bytes.length+"\0")).update(bytes).digest("hex");
const tracked=execFileSync("git",["ls-files","-s"],{cwd:root,encoding:"utf8"}).trim().split("\n");
const nativeProof={rawCanonical:0,crlfOnly:[],intentionalChanged:[]};
for(const line of tracked){
 const [meta,path]=line.split("\t"),blob=meta.split(" ")[1],bytes=fs.readFileSync(join(root,path));
 if(gitHash(bytes)===blob)nativeProof.rawCanonical++;
 else if(gitHash(Buffer.from(bytes.toString("utf8").replace(/\r\n/g,"\n")))==blob)nativeProof.crlfOnly.push(path);
 else nativeProof.intentionalChanged.push(path);
}
fs.writeFileSync(join(here,"native-canonical-correspondence.json"),JSON.stringify(nativeProof,null,2)+"\n");
let readme=fs.readFileSync(join(here,"README.md"),"utf8").replace(/\r\n/g,"\n");
readme=readme.replace("checkout bytes were restored","configuration was set");
readme=readme.replace("**39 passed, zero failures/skips:**18 new report/CLI tests plus21 unchanged codec/scheduler tests.","**42 passed, zero failures/skips:** 21 new report/CLI tests plus 21 unchanged codec/scheduler tests. The earlier 39-case receipt/log retain their v1 filenames.");
const addition="\n### Independent text-fidelity correction\n\nParent source review identified a distinct HTML fidelity risk after the first browser acceptance. The unchanged codec admitted CR, NUL and an unpaired high surrogate. The actual original CLI exited 0 for all three; Chrome changed CR13 to LF10, dropped NUL0, and replaced the unpaired surrogate with U+FFFD. codepoints-baseline-v2/receipt.json retains those exact code units, input/output fingerprints and source pins.\n\nThe final renderer escapes CR as &#13; so the actual HTML DOM retains it. It refuses displayed NUL and unpaired UTF-16 surrogates before publication, using explicit pair validation compatible with the stated Node18 API floor. codepoints-fixed/receipt.json records the actual exact-CR success and two exit2 refusals with no output. Three maintained regression methods cover CR/valid pairs, city/name/why rejection and real CLI no-output behavior; the final native total is42.\n\nAll six original browser-v2 report outputs are byte-identical under the corrected renderer, as compared in current-browser-output-equivalence.json. Their earlier eight browser groups retain the original runtime pin; they are not relabeled as a rerun. The targeted codepoint receiving carries the new renderer pin. A first codepoint harness used the Windows reserved filename nul.html; Chromium refused it. That setup failure and portable renamed artifacts remain in codepoints-baseline; the corrected case name is nul-character.\n\nThe Native CLI guide's exact10418-byte canonical prefix was restored after the append route exposed CRLF churn. Its final diff contains only28 appended lines. native-canonical-correspondence.json distinguishes exact Git blobs from retained native CRLF checkout bytes; the source receipts preserve all actual executed hashes. This receiving/transfer correction changes no product behavior.\n";
readme=readme.replace("\n## Replay and integration state",addition+"\n## Replay and integration state");
readme+="\nSource coordination update: an ordinary paced retry after the shared cooldown created [TasteTable #39](https://github.com/Jacob-Met/tastetable/issues/39) at 2026-10-08T17:28:51Z. Main remained e0f6fbaf1f81fbb1e9926948294549c744228def. Source PR, hosted checks and integration are pending at this freeze.\n";
fs.writeFileSync(join(here,"README.md"),readme);
let claim=fs.readFileSync(join(here,"CLAIM.md"),"utf8").replace(/\r\n/g,"\n");
claim+="\nOrdinary retry after the shared cooldown created https://github.com/Jacob-Met/tastetable/issues/39 at 2026-10-08T17:28:51Z. Current main remained e0f6fbaf1f81fbb1e9926948294549c744228def. Isolated implementation and exact native evidence precede this delayed source publication transparently; no resident lease is asserted.\n";
fs.writeFileSync(join(here,"CLAIM.md"),claim);
const explicit=["static/week_report.mjs","tools/saved_week_to_html.mjs","tests/test_week_report.mjs","tests/test_saved_week_to_html.mjs","docs/NATIVE_PLAN_CLI.md"];
const paths=[...explicit];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=join(dir,entry.name);if(entry.isDirectory())walk(full);else if(entry.name!=="manifest.json")paths.push(relative(root,full).replaceAll("\\","/"));}}
walk(here);
const manifest={sourceBase:"e0f6fbaf1f81fbb1e9926948294549c744228def",selfExcluded:"docs/receiving/saved-week-html-0378a7b6/manifest.json",files:paths.sort().map(path=>{const bytes=fs.readFileSync(join(root,path));return{path,bytes:bytes.length,sha256:sha(bytes)};})};
fs.writeFileSync(join(here,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
console.log(JSON.stringify({canonicalRaw:nativeProof.rawCanonical,crlfOnly:nativeProof.crlfOnly.length,intentionalChanged:nativeProof.intentionalChanged,files:manifest.files.length,bytes:manifest.files.reduce((n,x)=>n+x.bytes,0)}));
