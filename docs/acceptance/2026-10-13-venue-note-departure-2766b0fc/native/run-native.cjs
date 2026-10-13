const cp=require("node:child_process"),fs=require("node:fs"),path=require("node:path");
const variant=process.argv[2],start=new Date().toISOString();
const r=cp.spawnSync(process.execPath,[path.join(__dirname,"receive-departure.cjs"),variant],{encoding:"utf8",timeout:120000});
const receipt={variant,start,finished:new Date().toISOString(),pid:r.pid,exit:r.status,signal:r.signal,error:r.error?String(r.error):null,stdout:r.stdout,stderr:r.stderr};
fs.writeFileSync(path.join(__dirname,variant+"-execution.json"),JSON.stringify(receipt,null,2)+"\n");
console.log(JSON.stringify(receipt));process.exitCode=r.status??1;