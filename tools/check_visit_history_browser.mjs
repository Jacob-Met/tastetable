import { createServer } from "node:http";
import { readFile, writeFile, mkdir, readdir, statfs } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
const [root, output, browserPath, dependencyPackage] = process.argv.slice(2);
assert(root && output && browserPath && dependencyPackage, "source output browser dependency-package required");
const disk = await statfs(path.parse(output).root);
assert(Number(disk.bavail) * Number(disk.bsize) >= 1024 ** 3, "1 GiB execution floor");
await mkdir(output, {recursive:true});
const { chromium } = createRequire(dependencyPackage)("playwright");
const { fixture } = await import(pathToFileURL(path.join(root, "tests/fixtures/visit-history-a219f250962c.mjs")));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
async function sourceFiles(dir, prefix = "") {
  const result = {};
  for (const entry of await readdir(dir, {withFileTypes:true})) {
    if (entry.name === ".git") continue;
    const rel = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(result, await sourceFiles(path.join(dir,entry.name),rel+"/"));
    else result[rel] = hash(await readFile(path.join(dir,entry.name)));
  }
  return result;
}
const before = await sourceFiles(root), records = {}, raw = fixture();
records["first.json"] = raw.text;
records["renamed.json"] = raw.text;
records["revision.json"] = fixture({outcome:"did_not_go",savedAt:"2020-01-01T00:00:00.000Z"}).text;
records["second-week.json"] = fixture({start:"2026-10-19"}).text;
records["BOM.json"] = "\uFEFF"+raw.text;
records["bad.json"] = "{}";
records["empty.json"] = fixture({count:0}).text;
await mkdir(path.join(output,"inputs"));
for(const [name,text] of Object.entries(records)) await writeFile(path.join(output,"inputs",name),text);
await writeFile(path.join(output,"inputs","invalid-utf8.json"),Buffer.from([0xff,0xfe,0x7b]));
const requests=[], pageErrors=[], external=[], groups=[], hashes={};
let context;
const server=createServer(async(req,res)=>{
  const url=new URL(req.url,"http://127.0.0.1");
  requests.push(url.pathname);
  if(url.pathname==="/favicon.ico"){res.writeHead(204);res.end();return;}
  const rel=decodeURIComponent(url.pathname).replace(/^\//,"");
  if(!rel.startsWith("static/") || rel.includes("..")){res.writeHead(404);res.end();return;}
  try {
    const bytes=await readFile(path.join(root,rel));hashes[rel]=hash(bytes);
    res.writeHead(200,{"Content-Type":rel.endsWith(".mjs")?"text/javascript; charset=utf-8":rel.endsWith(".css")?"text/css; charset=utf-8":"text/html; charset=utf-8"});
    res.end(bytes);
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const origin="http://127.0.0.1:"+server.address().port;
let failure;
try {
  context=await chromium.launchPersistentContext(path.join(output,"profile"),{executablePath:browserPath,headless:true,viewport:{width:1100,height:800}});
  const page=context.pages()[0];
  page.on("pageerror",e=>pageErrors.push(e.message));
  await page.route("**/*",route=>{
    if(route.request().url().startsWith(origin+"/")) return route.continue();
    external.push(route.request().url());return route.abort();
  });
  await page.goto(origin+"/static/visit-history.html");
  const choose=async(names)=>{const chooser=page.waitForEvent("filechooser");await page.locator("#chooseFiles").click();await (await chooser).setFiles(names.map(n=>path.join(output,"inputs",n)));};
  const preview=async()=>page.waitForFunction(()=>!document.getElementById("addFiles").disabled);
  const rows=()=>page.locator("#entries .entry").count();
  const add=async names=>{await choose(names);await preview();await page.locator("#addFiles").click();};
  const check=async(name,run)=>{await run();groups.push({name,passed:true});};
  await check("cancelled preview and explicit accepted multi-file/version identity",async()=>{
    await choose(["first.json"]);await preview();assert.equal(await rows(),0);
    await page.locator("#cancelFiles").click();assert.equal(await rows(),0);
    await add(["first.json"]);
    await choose(["renamed.json","revision.json","second-week.json"]);await preview();
    assert.match(await page.locator("#previewStatus").innerText(),/2 new files; 1 exact-byte/);
    assert.equal(await rows(),3);await page.locator("#addFiles").click();
    assert.equal(await rows(),9);assert.equal(await page.locator("#fileList .file").count(),3);
    assert.equal(await page.locator("#overlapWarning").isVisible(),true);
    assert.equal(await page.locator("#entries img,#entries script").count(),0);
    const note=await page.locator("#entries .visit-note").first().textContent();assert.equal(note,"Visit note: "+raw.record.visits[0].note);
  });
  await check("whole-batch and invalid UTF-8 refusal preserve collection",async()=>{
    for(const names of [["BOM.json","bad.json"],["invalid-utf8.json"]]){
      await choose(names);await page.waitForFunction(()=>!document.getElementById("loadError").hidden);
      assert.equal(await rows(),9);assert.equal(await page.locator("#fileList .file").count(),3);
    }
  });
  await check("entered-date filters, invalid print refusal, explicit reset and literal search",async()=>{
    await page.locator("#from").fill("2024-02-29");await page.locator("#to").fill("2024-02-29");
    assert.equal(await page.locator("#printView").isDisabled(),true);
    await page.locator("#filters button[type=submit]").click();
    assert.equal(await rows(),3);assert.match(await page.locator("#entries").innerText(),/Unrecorded/);
    await page.locator("#from").fill("2023-02-29");await page.locator("#filters button[type=submit]").click();
    assert.equal(await rows(),3);assert.equal(await page.locator("#printView").isDisabled(),true);
    await page.emulateMedia({media:"print"});assert.equal(await page.locator("#printRefusal").isVisible(),true);
    assert.equal(await page.locator("#entries").isVisible(),false);await page.emulateMedia({media:"screen"});
    await page.locator("#resetFilters").click();assert.equal(await rows(),9);
    await page.locator("#query").fill("<img");await page.locator("#filters button[type=submit]").click();
    assert.equal(await rows(),3);assert.equal(await page.locator("#entries img").count(),0);
    await page.locator("#resetFilters").click();
  });
  await check("BOM variant remains a separate snapshot; source and warnings survive print",async()=>{
    await add(["BOM.json"]);assert.equal(await rows(),12);
    await page.emulateMedia({media:"print"});
    assert.equal(await page.locator("#fileList").isVisible(),true);
    assert.equal(await page.locator("#overlapWarning").isVisible(),true);
    assert.match(await page.locator("#fileList").innerText(),/Original mock suggestions; venue confirmation pending/);
    assert.equal(await page.locator("#preview").isVisible(),false);
    await page.pdf({path:path.join(output,"history.pdf"),format:"A4",printBackground:true});
    await page.emulateMedia({media:"screen"});
  });
  await check("late reads cannot restore a cleared collection or supersede a newer preview",async()=>{
    await page.evaluate(()=>{
      const original=File.prototype.arrayBuffer;
      window.historyReadGate={armed:true,releases:[]};
      File.prototype.arrayBuffer=function(){
        const bytes=original.call(this);
        if(window.historyReadGate.armed && this.name==="second-week.json")
          return new Promise(resolve=>window.historyReadGate.releases.push(async()=>resolve(await bytes)));
        return bytes;
      };
    });
    await choose(["second-week.json"]);
    await page.waitForFunction(()=>window.historyReadGate.releases.length===1);
    await page.locator("#clearFiles").click();
    await page.evaluate(async()=>{await window.historyReadGate.releases.shift()();});
    await page.waitForFunction(()=>document.getElementById("preview").hidden);
    assert.equal(await rows(),0);
    await choose(["second-week.json"]);await page.waitForFunction(()=>window.historyReadGate.releases.length===1);
    await choose(["empty.json"]);await preview();assert.match(await page.locator("#previewFiles").innerText(),/empty.json/);
    await page.evaluate(async()=>{window.historyReadGate.armed=false;await window.historyReadGate.releases.shift()();});
    assert.match(await page.locator("#previewFiles").innerText(),/empty.json/);
    await page.locator("#addFiles").click();assert.equal(await rows(),0);assert.equal(await page.locator("#fileList .file").count(),1);
    await page.locator("#clearFiles").click();await add(["first.json","second-week.json"]);
  });
  await check("desktop and phone readable layout, keyboard filter and removal, fresh reload",async()=>{
    await page.screenshot({path:path.join(output,"desktop.png"),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.locator("#query").focus();await page.keyboard.type("Date alone");await page.keyboard.press("Enter");
    assert.equal(await rows(),2);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.evaluate(()=>{window.deliveredResetClicks=0;document.getElementById("resetFilters").addEventListener("click",()=>window.deliveredResetClicks++);});
    await page.locator("#resetFilters").click();
    assert.equal(await page.evaluate(()=>window.deliveredResetClicks),1);assert.equal(await rows(),6);
    await page.getByRole("button",{name:"Remove record-1",exact:true}).click();
    assert.equal(await rows(),3);
    await page.screenshot({path:path.join(output,"phone.png"),fullPage:true});
    await page.reload();assert.equal(await rows(),0);assert.equal(await page.locator("#fileList .file").count(),0);
  });
  assert.deepEqual(pageErrors,[]);assert.deepEqual(external,[]);
  for(const [file,sha] of Object.entries(hashes)) assert.equal(sha,before[file],"served exact source "+file);
}catch(error){failure={name:error.name,message:error.message,stack:error.stack};}
finally{
  if(context)await context.close();
  await new Promise(resolve=>server.close(resolve));
  const after=await sourceFiles(root);
  const unchanged=JSON.stringify(before)===JSON.stringify(after);
  const receipt={at:new Date().toISOString(),groups,accepted:!failure&&unchanged,failure,source:before,sourceUnchanged:unchanged,served:hashes,requests,pageErrors,external,
    fixtures:Object.fromEntries(Object.entries(records).map(([n,t])=>[n,hash(Buffer.from(t))])),mode:"Windows installed Chrome; private HTTP/profile; real file-input paths; controlled late-read fixture; physical PDF and screenshots; no provider calls"};
  await writeFile(path.join(output,"receipt.json"),JSON.stringify(receipt,null,2)+"\n");
  console.log(JSON.stringify({accepted:receipt.accepted,groups,failure,sourceUnchanged:unchanged}));
  if(!receipt.accepted)process.exitCode=1;
}
