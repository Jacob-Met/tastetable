import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, mkdir, readdir, lstat, link, rm, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderVisitRecordReport } from "../static/visit_record_report.mjs";
const cli=fileURLToPath(new URL("../tools/visit_record_to_html.mjs",import.meta.url));
const fixture=await readFile(new URL("./fixtures/visit-record-csv.json",import.meta.url));
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
async function temp(t){const root=await mkdtemp(join(tmpdir(),"tastetable-visit-html-"));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
function run(args,options={}) {const r=spawnSync(process.execPath,[cli,...args],{encoding:"utf8",timeout:10000,maxBuffer:2*1024**2,...options});assert.equal(r.error,undefined);assert.equal(r.signal,null);return r;}
async function absent(path){await assert.rejects(lstat(path),{code:"ENOENT"});}
async function noStages(root){assert.ok(!(await readdir(root)).some(x=>x.startsWith(".tastetable-visit-html-")));}

test("actual CLI creates exact standalone bytes and a bound receipt without changing input",async t=>{
  const root=await temp(t),input=join(root,"visits café.json"),output=join(root,"report.html");await writeFile(input,fixture);
  const r=run(["--output",output,"--input",input]);assert.equal(r.status,0);assert.equal(r.stderr,"");
  const receipt=JSON.parse(r.stdout),bytes=await readFile(output);
  assert.deepEqual(receipt,{format:"tastetable.visit-html.v1",input:resolve(input),inputSha256:sha(fixture),output:resolve(output),outputSha256:sha(bytes),outputBytes:bytes.length,rows:3,weekStart:"2024-02-26",sourceMode:"mock",recordSavedAt:"2024-03-03T12:00:00.000Z"});
  assert.equal(bytes.toString("utf8"),renderVisitRecordReport(fixture.toString("utf8"),{recordName:"visits café.json",recordSha256:sha(fixture)}).html);
  assert.deepEqual(await readFile(input),fixture);await noStages(root);
});

test("help and invalid options have no filesystem effects",async t=>{
  const root=await temp(t),input=join(root,"input.json"),output=join(root,"report.html");await writeFile(input,fixture);
  const help=run(["--help"]);assert.equal(help.status,0);assert.match(help.stdout,/Usage:/);assert.equal(help.stderr,"");
  for(const args of [[],["--input",input],["--output",output],["--help","--input",input],["--input","-","--output",output],["--input",input,"--output","-"],["--input",input,"--input",input,"--output",output],["--input",input,"--output",output,"--output",output],["--input",input,"--output"],["input.json"],["--wat","x"],["--input",input,"--output",output,"trailing"],["--input","","--output",output]]){
    const r=run(args);assert.equal(r.status,2,JSON.stringify(args));assert.equal(r.stdout,"");assert.ok(r.stderr);
    await absent(output);assert.deepEqual(await readFile(input),fixture);
  }
  await noStages(root);
});

test("malformed/invalid UTF8/oversized/nonregular input never replaces an existing output",async t=>{
  const root=await temp(t),input=join(root,"bad.json"),output=join(root,"keep.html"),fresh=join(root,"fresh.html");await writeFile(output,"KEEP");
  const bads=[Buffer.from("{}"),Buffer.from("[]"),Buffer.from([0xc3,0x28]),Buffer.from("\uFEFF\uFEFF"+fixture.toString("utf8")),Buffer.alloc(8*1024**2+1,32)];
  for(const bytes of bads){
    await writeFile(input,bytes);const before=sha(bytes);
    for(const destination of [output,fresh]){const r=run(["--input",input,"--output",destination]);assert.equal(r.status,2);assert.equal(r.stdout,"");assert.ok(r.stderr);}
    assert.equal((await readFile(output)).toString(),"KEEP");await absent(fresh);assert.equal(sha(await readFile(input)),before);await noStages(root);
  }
  const dir=join(root,"directory");await mkdir(dir);
  assert.equal(run(["--input",dir,"--output",fresh]).status,2);
  assert.equal(run(["--input",join(root,"missing"),"--output",fresh]).status,2);await absent(fresh);
});

test("single BOM is admitted but its raw bytes remain part of fingerprint",async t=>{
  const root=await temp(t),input=join(root,"bom.json"),output=join(root,"bom.html"),bytes=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),fixture]);await writeFile(input,bytes);
  const r=run(["--input",input,"--output",output]);assert.equal(r.status,0);const receipt=JSON.parse(r.stdout);
  assert.equal(receipt.inputSha256,sha(bytes));assert.notEqual(receipt.inputSha256,sha(fixture));
  assert.match((await readFile(output,"utf8")),new RegExp(sha(bytes)));
});

test("create-only publication preserves ordinary, input and hardlink-alias destinations",async t=>{
  const root=await temp(t),input=join(root,"input.json"),alias=join(root,"alias.json"),output=join(root,"keep.html"),dir=join(root,"dir");
  await writeFile(input,fixture);await link(input,alias);await writeFile(output,"KEEP");await mkdir(dir);
  for(const destination of [input,alias,output,dir]){const r=run(["--input",input,"--output",destination]);assert.equal(r.status,2);assert.equal(r.stdout,"");}
  assert.deepEqual(await readFile(input),fixture);assert.deepEqual(await readFile(alias),fixture);assert.equal(await readFile(output,"utf8"),"KEEP");
  const missingParent=run(["--input",input,"--output",join(root,"absent","report.html")]);assert.equal(missingParent.status,1);await noStages(root);
});

test("two actual publisher processes produce one complete winner without a partial final file",async t=>{
  const root=await temp(t),input=join(root,"input.json"),output=join(root,"race.html");await writeFile(input,fixture);
  function child(){return new Promise((resolve_,reject)=>{let stdout="",stderr="";const p=spawn(process.execPath,[cli,"--input",input,"--output",output],{stdio:["ignore","pipe","pipe"]});const timer=setTimeout(()=>{p.kill();reject(new Error("CLI race timeout"));},10000);p.stdout.on("data",b=>stdout+=b);p.stderr.on("data",b=>stderr+=b);p.once("error",reject);p.once("close",(status,signal)=>{clearTimeout(timer);resolve_({status,signal,stdout,stderr});});});}
  const results=await Promise.all([child(),child()]);assert.deepEqual(results.map(x=>x.status).sort(),[0,2]);assert.ok(results.every(x=>x.signal===null));
  const winner=results.find(x=>x.status===0),loser=results.find(x=>x.status===2),receipt=JSON.parse(winner.stdout);assert.equal(winner.stderr,"");assert.equal(loser.stdout,"");
  const bytes=await readFile(output);assert.equal(sha(bytes),receipt.outputSha256);assert.equal(bytes.length,receipt.outputBytes);assert.ok(bytes.toString().endsWith("</html>\n"));
  assert.deepEqual(await readFile(input),fixture);await noStages(root);
});

test("failed stdout after publication returns nonzero and retains the complete report",async t=>{
  const root=await temp(t),input=join(root,"input.json"),output=join(root,"report.html"),readonly=join(root,"stdout-readonly");
  await writeFile(input,fixture);await writeFile(readonly,"DO NOT CHANGE");
  const h=await open(readonly,"r");let r;try{r=run(["--input",input,"--output",output],{stdio:["ignore",h.fd,"pipe"]});}finally{await h.close();}
  assert.equal(r.status,1);assert.match(r.stderr,/HTML report was created, but final cleanup or receipt delivery failed/);
  assert.equal(await readFile(readonly,"utf8"),"DO NOT CHANGE");assert.ok((await readFile(output,"utf8")).endsWith("</html>\n"));await noStages(root);
});
