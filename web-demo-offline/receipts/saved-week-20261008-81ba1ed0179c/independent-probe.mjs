import fs from "node:fs";
import {saveOfflineWeek,readOfflineWeek} from "/tmp/tastetable-offline-81ba1ed0179c/weekly-files/web-demo-offline/saved_week.mjs";
import {createWeekPlan} from "/tmp/tastetable-offline-81ba1ed0179c/weekly-files/web-demo-offline/week_plan.mjs";
const c=JSON.parse(fs.readFileSync("/tmp/tastetable-offline-81ba1ed0179c/weekly-files/web-demo-offline/data/catalogue.json"));
const record=c.records[0], now=new Date("2026-10-08T14:00:00.000Z");
const saved=saveOfflineWeek(c,record,createWeekPlan(record.response,"2026-10-05"),now.toISOString(),null,now);
const v=JSON.parse(saved.text), paths=[];
function scan(x,path=[]){if(x===null){paths.push(path);return;}if(x&&typeof x==="object")for(const k of Object.keys(x))scan(x[k],[...path,k]);}
scan(v.response,["response"]);
let findings=[];
for(const path of paths){
 const copy=JSON.parse(saved.text);let target=copy;for(const k of path.slice(0,-1))target=target[k];target[path.at(-1)]="__NONFINITE_PROBE__";
 const text=JSON.stringify(copy).replace('"__NONFINITE_PROBE__"',"1e400");
 try {const result=readOfflineWeek(text,c);findings.push({path,accepted:true,record:result.record.key});}
 catch(e){findings.push({path,accepted:false,error:e.message});}
}
console.log(JSON.stringify({record:record.key,nullPaths:paths.length,findings}));
