import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { renderVisitRecordCsv } from "../static/visit_record_csv.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const cli = path.join(root, "tools/visit_record_to_csv.mjs");
const original = fs.readFileSync(path.join(root, "tests/fixtures/visit-record-csv.json"));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
function fixture(t, content = original) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "taste-visit-csv-"));
  t.after(() => fs.rmSync(dir, {recursive:true,force:true}));
  const input = path.join(dir,"visits.json"), output = path.join(dir,"visits.csv");
  fs.writeFileSync(input,content);
  return {dir,input,output};
}
const run = args => spawnSync(process.execPath,[cli,...args],{cwd:root,encoding:"utf8",timeout:10000});
const argv = f => ["--input",f.input,"--output",f.output];
function unchanged(f, bytes = original) {
  assert.deepEqual(fs.readFileSync(f.input), bytes);
  assert.equal(fs.readdirSync(f.dir).filter(name=>name.startsWith(".tastetable-visits-")).length,0);
}
test("actual command publishes complete CSV and byte-bound receipt without changing input", t => {
  const f=fixture(t), result=run(argv(f));
  assert.equal(result.status,0,result.stderr);assert.equal(result.stderr,"");
  const bytes=fs.readFileSync(f.output), receipt=JSON.parse(result.stdout);
  assert.equal(bytes.toString("utf8"),renderVisitRecordCsv(original.toString("utf8")).csv);
  assert.deepEqual(receipt,{format:"tastetable.visit-csv.v1",input:f.input,inputSha256:hash(original),output:f.output,
    outputSha256:hash(bytes),outputBytes:bytes.length,rows:3,weekStart:"2024-02-26",sourceMode:"mock",recordSavedAt:"2024-03-03T12:00:00.000Z"});
  unchanged(f);
});
test("existing file, input alias and directory destinations refuse without replacement", t => {
  const f=fixture(t);fs.writeFileSync(f.output,"previous CSV\r\n");
  assert.equal(run(argv(f)).status,2);assert.equal(fs.readFileSync(f.output,"utf8"),"previous CSV\r\n");
  assert.equal(run(["--input",f.input,"--output",f.input]).status,2);
  assert.equal(run(["--input",f.input,"--output",f.dir]).status,2);unchanged(f);
});
test("invalid UTF-8, oversize, malformed or unsupported input never creates output", t => {
  for(const content of [Buffer.from([0xc3,0x28]),Buffer.alloc(8*1024*1024+1,32),Buffer.from(""),Buffer.from("{}"),Buffer.from("{"),Buffer.from(original.toString().replace("tastetable.visit-record.v1","other"))]){
    const f=fixture(t,content), result=run(argv(f));
    assert.equal(result.status,2,result.stderr);assert.equal(result.stdout,"");assert(!fs.existsSync(f.output));unchanged(f,content);
  }
});
test("input BOM is decoded but receipt hashes exact original bytes", t => {
  const bytes=Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),original]), f=fixture(t,bytes);
  const result=run(argv(f));assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).inputSha256,hash(bytes));
  assert(!fs.readFileSync(f.output).subarray(0,3).equals(Buffer.from([0xef,0xbb,0xbf])));
  unchanged(f,bytes);
});
test("two actual concurrent commands publish one complete file without overwrite", async t => {
  const f=fixture(t);
  const invoke=()=>new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,[cli,...argv(f)],{cwd:root,stdio:["ignore","pipe","pipe"]});
    let out="",err="";child.stdout.on("data",x=>out+=x);child.stderr.on("data",x=>err+=x);
    child.on("error",reject);child.on("close",status=>resolve({status,out,err}));
  });
  const results=await Promise.all([invoke(),invoke()]);
  assert.deepEqual(results.map(x=>x.status).sort(),[0,2]);
  assert.equal(fs.readFileSync(f.output,"utf8"),renderVisitRecordCsv(original.toString("utf8")).csv);
  unchanged(f);
});
test("argument, missing-file, non-file and missing-parent refusals leave source intact", t => {
  const f=fixture(t);
  for(const args of [[],["--input"],["--bad","x"],["--input","-","--output",f.output],
    ["--input",f.input,"--input",f.input,"--output",f.output],["--input",f.dir,"--output",f.output],
    ["--input",path.join(f.dir,"absent"),"--output",f.output]]){
    assert.equal(run(args).status,2);assert(!fs.existsSync(f.output));
  }
  assert.equal(run(["--input",f.input,"--output",path.join(f.dir,"absent","out.csv")]).status,1);
  assert.equal(run(["--help"]).status,0);unchanged(f);
});
test("publication failure removes its private stage and preserves another writer's destination", t => {
  const f=fixture(t);
  const code=`import fs from "node:fs/promises";
    const args=JSON.parse(process.env.TASTE_ARGS);
    fs.link=async (_source,destination)=>{await fs.writeFile(destination,"other writer",{flag:"wx"});const e=new Error("race");e.code="EEXIST";throw e};
    const {main}=await import(process.env.TASTE_CLI);
    process.exitCode=await main(args);`;
  const result=spawnSync(process.execPath,["--input-type=module","-e",code],{encoding:"utf8",timeout:10000,
    env:{...process.env,TASTE_ARGS:JSON.stringify(argv(f)),TASTE_CLI:pathToFileURL(cli).href}});
  assert.equal(result.status,2,result.stderr);assert.equal(fs.readFileSync(f.output,"utf8"),"other writer");unchanged(f);
});
test("failed final cleanup reports the completed file rather than claiming no publication", t => {
  const f=fixture(t);
  const code=`import fs from "node:fs/promises";
    fs.rm=async()=>{throw new Error("injected cleanup failure")};
    const {main}=await import(process.env.TASTE_CLI);
    process.exitCode=await main(JSON.parse(process.env.TASTE_ARGS));`;
  const result=spawnSync(process.execPath,["--input-type=module","-e",code],{encoding:"utf8",timeout:10000,
    env:{...process.env,TASTE_ARGS:JSON.stringify(argv(f)),TASTE_CLI:pathToFileURL(cli).href}});
  assert.equal(result.status,1);assert.match(result.stderr,/CSV report was created/);assert.equal(result.stdout,"");
  assert.equal(fs.readFileSync(f.output,"utf8"),renderVisitRecordCsv(original.toString("utf8")).csv);
  assert.deepEqual(fs.readFileSync(f.input),original);
});
