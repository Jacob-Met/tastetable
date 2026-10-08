
const fs=require("node:fs"),vm=require("node:vm"),crypto=require("node:crypto"),assert=require("node:assert/strict");
const packet=JSON.parse(fs.readFileSync(0,"utf8")),hash=b=>crypto.createHash("sha256").update(b).digest("hex");
(async()=>{
const source={};for(const [path,file]of Object.entries(packet.files)){const bytes=Buffer.from(file.text);const git=crypto.createHash("sha1").update(Buffer.from("blob "+bytes.length+"\0")).update(bytes).digest("hex");assert.equal(git,file.git_blob);source[path]={bytes:bytes.length,sha256:hash(bytes),git_blob:git};}
const context=vm.createContext({structuredClone,Date,TextEncoder,Uint8Array,Buffer,process,console});
const modules=new Map();
function original(path){if(modules.has(path))return modules.get(path);const mod=new vm.SourceTextModule(packet.files[path].text,{context,identifier:"file:///primary/"+path,initializeImportMeta(meta){meta.url="file:///primary/"+path;}});modules.set(path,mod);return mod;}
async function link(spec,ref){if(spec.startsWith("node:")){const imported=await import(spec);return new vm.SyntheticModule(Object.keys(imported),function(){for(const k of Object.keys(imported))this.setExport(k,imported[k]);},{context});}return original(new URL(spec,ref.identifier).pathname.replace(/^\/primary\//,""));}
const saved=original("static/week_file.mjs");await saved.link(link);await saved.evaluate();
const plan=original("static/week_plan.mjs").namespace,codec=saved.namespace;
context.module={exports:{}};new vm.Script(packet.files["static/calendar.js"].text,{filename:"static/calendar.js"}).runInContext(context);
const calendar=context.module.exports,response=JSON.parse(packet.files["tests/fixtures/saved-week-response.json"].text),before=hash(JSON.stringify(response));
const inputs={cuisines:["Cuban"],music:["Celia Cruz"],films:["West Side Story"],constraints:structuredClone(response.comparison.constraints),city:"Pasadena"};
const calendarId="0123456789abcdef0123456789abcdef",receivedAt="2026-10-08T08:09:10.123Z";
const initial=plan.createWeekPlan(response,"2026-10-08");
const ordinary=calendar.createWeekExport(initial,{id:calendarId,createdAt:new Date(receivedAt)}).download(initial,plan.weekRows(initial));
assert.equal(ordinary.count,5);
let state=plan.setPickDay(initial,"pick-0","Tuesday");state=plan.setPickDay(state,"pick-1","Tuesday");state=plan.setPickDay(state,"pick-2",null);
const file=codec.makeWeekFile({response,inputs,state,receivedAt,calendarId},new Date("2026-10-08T09:10:11.456Z"));
const restored=codec.readWeekFile(file.text);assert.equal(restored.calendarId,calendarId);assert.equal(JSON.stringify(restored.response),JSON.stringify(response));
const writer=calendar.createWeekExport(restored.state,{id:restored.calendarId,createdAt:new Date(restored.receivedAt)}),rows=plan.weekRows(restored.state),preview=writer.preview(restored.state,rows),output=writer.download(restored.state,rows);
assert.equal(output.count,4);assert.equal(preview.filter(p=>p.date==="2026-10-06").length,2);
const unfolded=output.text.replace(/\r\n /g,""),uids=[...unfolded.matchAll(/^UID:(.+)$/gm)].map(x=>x[1].replace(/\r$/,""));assert.equal(new Set(uids).size,4);assert(!uids.some(x=>x.includes("pick-2@")));
assert.equal(before,hash(JSON.stringify(response)));assert.equal(packet.missing_in_complete_tree,true);
const converter=original("tools/native_plan_to_week.mjs");await converter.link(link);await converter.evaluate();
const unsupported=await converter.namespace.main(["--input","not-opened-saved-week.json","--week","2026-10-08","--output","not-created.ics","--format","calendar"]);assert.equal(unsupported,2);
process.stdout.write(JSON.stringify({schema:"tastetable-saved-week-calendar-before.v1",node:process.version,execution:"Exact primary module bytes evaluated by Node vm.SourceTextModule with an in-memory relative import map; no files written, no browser or provider used.",base:packet.base,tree:packet.tree,source,missing_consumer:{path:packet.missing_path,complete_tree_leaves:packet.leaf_count,absent:packet.missing_in_complete_tree,existing_converter_calendar_option_exit:unsupported},controls:{ordinary_events:ordinary.count,arranged_events:output.count,same_day_occurrences:preview.filter(p=>p.date==="2026-10-06").map(p=>p.key),omitted:"pick-2",calendar_identity:restored.calendarId,receivedAt:restored.receivedAt,response_unchanged:before===hash(JSON.stringify(response)),unique_uids:uids},saved_week:{text:file.text,bytes:Buffer.byteLength(file.text),sha256:hash(file.text)},calendar:{filename:output.filename,text:output.text,bytes:Buffer.byteLength(output.text),sha256:hash(output.text)},completed:true},null,2)+"\n");
})().catch(error=>{console.error(error);process.exitCode=1;});
