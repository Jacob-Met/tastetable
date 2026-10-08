import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root='C:/Users/minec/hamon-0378a7b6-tastetable', out=path.dirname(fileURLToPath(import.meta.url));
const base='e0f6fbaf1f81fbb1e9926948294549c744228def', accepted='9d296340272ff6860da94290986bc8d5cc655bca', current='2b347cee4ff4e2b806362730a8520a3360b45f5a';
const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',maxBuffer:16*1024*1024}).trim();
const leaves=ref=>new Map(git('ls-tree','-r',ref).split('\n').map(line=>{const [spec,name]=line.split('\t');return [name,spec]}));
const changed=new Set(git('diff','--name-only',base,accepted).split('\n'));
const candidate=leaves(accepted), parent=leaves(current), composedTree=git('write-tree'), composed=leaves(composedTree);
for(const name of changed) assert.equal(composed.get(name),candidate.get(name),name);
let preserved=0;
for(const [name,entry] of parent) if(!changed.has(name)){assert.equal(composed.get(name),entry,name);preserved++;}
for(const [name] of composed) assert.ok(parent.has(name)||changed.has(name),'unexpected leaf '+name);
for(const [name,hash] of [
 ['static/week_report.mjs','6fa8de588fbce5d3dce39826feb7ff06e7430fd2006c34b68d570b314a240210'],
 ['tools/saved_week_to_html.mjs','1bda236e85c515d3680bbf6c56d6e49bb156a8840635de1571307d131de148d7']
])assert.equal(createHash('sha256').update(await fs.readFile(path.join(root,name))).digest('hex'),hash);
const tests=(await fs.readdir(path.join(root,'tests'))).filter(name=>/\.(mjs|cjs)$/.test(name)).map(name=>'tests/'+name);
const run=spawnSync(process.execPath,['--test',...tests],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
await fs.writeFile(path.join(out,'node-tests.stdout.txt'),run.stdout||'');
await fs.writeFile(path.join(out,'node-tests.stderr.txt'),run.stderr||'');
const receipt={at:new Date().toISOString(),base,accepted,current,composedTree,acceptedPathsPreserved:changed.size,currentUnownedLeavesPreserved:preserved,node:process.version,testFiles:tests,testExit:run.status,passed:run.status===0};
await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));
assert.equal(run.status,0);
