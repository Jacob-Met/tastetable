import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {chromium} from "file:///C:/hamon-receiving-b47cbcf18759/dependencies/playwright-core-1.62.1/index.mjs";
import {readWeekFile,makeWeekFile} from "../../../static/week_file.mjs";
import {createWeekPlan} from "../../../static/week_plan.mjs";
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,"../../..");
const phase=process.argv[2]||"baseline";
assert(["baseline","fixed"].includes(phase));
const out=join(here,process.argv[3]||"codepoints-"+phase);
await fs.mkdir(out);
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const units=text=>Array.from({length:text.length},(_,i)=>text.charCodeAt(i));
const original=await fs.readFile(join(here,"baseline-saved-week.json"),"utf8");
const receipt={phase,sourceHashes:{},cases:[]};
for(const path of ["static/week_report.mjs","tools/saved_week_to_html.mjs","static/week_file.mjs","static/week_plan.mjs"]) receipt.sourceHashes[path]=sha(await fs.readFile(join(root,path)));
const browser=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",args:["--no-sandbox"]});
try {
  const context=await browser.newContext({offline:true});
  const page=await context.newPage();
  for(const [name,value,field,selector] of [
    ["carriage-return","first\rsecond","name",'[data-occurrence="pick-0"] h4'],
    ["nul-character","first\u0000second","name",'[data-occurrence="pick-0"] h4'],
    ["lone-surrogate","first\uD800second","why",'[data-occurrence="pick-0"] .explanation'],
  ]) {
    const saved=readWeekFile(original);
    saved.response.plan.meals[0][field]=value;
    saved.state=createWeekPlan(saved.response,saved.state.weekStart);
    const text=makeWeekFile(saved,new Date("2026-10-08T12:00:00.000Z")).text;
    const decoded=readWeekFile(text).response.plan.meals[0][field];
    assert.equal(decoded,value);
    const input=join(out,name+".json"),output=join(out,name+".html");
    await fs.writeFile(input,text,{flag:"wx"});
    const result=spawnSync(process.execPath,[join(root,"tools/saved_week_to_html.mjs"),"--input",input,"--output",output],{encoding:"utf8"});
    const item={name,codecAdmitted:true,sourceUnits:units(value),exit:result.status,stderr:result.stderr,inputSha256:sha(Buffer.from(text))};
    if(phase==="baseline"||name==="carriage-return") {
      assert.equal(result.status,0,result.stderr);
      await page.goto(pathToFileURL(output).href);
      const displayed=await page.locator(selector).textContent();
      item.receivedUnits=units(displayed);
      item.exact=displayed===value;
      assert.equal(item.exact,phase==="fixed");
      item.htmlSha256=sha(await fs.readFile(output));
    } else {
      assert.equal(result.status,2,result.stderr);
      assert.equal(result.stdout,"");
      assert.equal(await fs.stat(output).then(()=>true,()=>false),false);
      item.refusedWithoutOutput=true;
    }
    assert.equal(await fs.readFile(input,"utf8"),text);
    receipt.cases.push(item);
  }
  receipt.chrome=await browser.version();
  receipt.status="passed";
  await fs.writeFile(join(out,"receipt.json"),JSON.stringify(receipt,null,2)+"\n");
  console.log(JSON.stringify(receipt));
} finally {await browser.close();}
