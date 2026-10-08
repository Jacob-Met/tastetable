import fs from "node:fs";
import {execFileSync} from "node:child_process";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,"../../..");
const doc=join(root,"docs/NATIVE_PLAN_CLI.md");
const current=fs.readFileSync(doc,"utf8");
const marker="\n## Read a saved week as a standalone handoff";
const index=current.indexOf(marker);
if(index<0)throw Error("Missing owned append.");
const original=execFileSync("git",["show","HEAD:docs/NATIVE_PLAN_CLI.md"],{cwd:root});
let append=current.slice(index).replace(/\r\n/g,"\n");
append=append.replace("A UTF-8 BOM is accepted.","A UTF-8 BOM is accepted. Displayed carriage returns are preserved as HTML character references. Displayed NUL or unpaired UTF-16 surrogate characters are refused because HTML cannot preserve them.");
fs.writeFileSync(doc,Buffer.concat([original,Buffer.from(append)]));
const own=["static/week_report.mjs","tools/saved_week_to_html.mjs","tests/test_week_report.mjs","tests/test_saved_week_to_html.mjs"];
const changed=[];
for(const path of own){
 const full=join(root,path),text=fs.readFileSync(full,"utf8");
 const normalized=text.replace(/\r\n/g,"\n");
 if(text!==normalized){fs.writeFileSync(full,normalized);changed.push(path);}
}
console.log(JSON.stringify({normalizedOwnedPaths:changed,docPrefixExact:fs.readFileSync(doc).subarray(0,original.length).equals(original),docPrefixBytes:original.length}));
