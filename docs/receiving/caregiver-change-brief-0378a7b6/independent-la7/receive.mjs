import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const rawRoot=path.join(root,'../browser-candidate-1');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=['earlier.json','revised.json','download-1.txt'];
const expected=['707bc803293f046213703ae6d4053e0adc95ce37f22c46d585d8a4ac8d9e7828','d2eb4c1982a68a94ae71450f220d71ab3d3bdb34e99d821bd1ebb9d3b1c93cf1','2a602138cd3d5d181b29938371a6d974479d91c433ad447c0f94f7fe0dfde1e2'];
const bytes=await Promise.all(files.map(file=>fs.readFile(path.join(rawRoot,file))));
bytes.forEach((value,index)=>assert.equal(sha(value),expected[index]));
const before=JSON.parse(bytes[0]),after=JSON.parse(bytes[1]),text=bytes[2].toString('utf8');
const oracleBytes=await fs.readFile(path.join(root,'oracle-before-output.json'));
assert.equal(sha(oracleBytes),'2f62f7a68074b1392929f3f495ea93300afbe800108f3bc5dc2826bae42b978a');
const oracle=JSON.parse(oracleBytes);
const blocks=[...text.matchAll(/^Original pick (\d+) \((pick-\d+)\): (.+)\n((?:(?!\n\n)[\s\S])*)/gm)];
assert.equal(blocks.length,3);
const picks=[...before.response.plan.meals,before.response.plan.outing];
for(const row of oracle.rows.filter(row=>row.status!=='unchanged')){
 const block=blocks.find(item=>item[2]===row.id);assert.ok(block,row.id);
 assert.equal(JSON.parse(block[3]),row.name);
 assert.equal(Number(block[1]),Number(row.id.slice(5))+1);
 const kind=block[4].match(/^  Kind: (.+)$/m);
 const entity=block[4].match(/^  Source entity ID: (.+)$/m);
 const why=block[4].match(/^  Original explanation from the saved file: (.+)$/m);
 assert.equal(JSON.parse(kind[1]),row.kind);
 assert.equal(JSON.parse(entity[1]),row.entity_id);
 assert.equal(JSON.parse(why[1]),picks[Number(row.id.slice(5))].why);
 assert.ok(block[4].includes('  Earlier: '+(row.before_day===null?'Not scheduled':row.before_day+' '+row.before_date)));
 assert.ok(block[4].includes('  Revised: '+(row.after_day===null?'Not scheduled':row.after_day+' '+row.after_date)));
}
assert.ok(text.includes('1 moved; 1 newly scheduled; 1 kept off the revised week.'));
assert.ok(text.includes('2 unchanged (2 still scheduled; 0 still off the week).'));
assert.ok(text.includes('4 scheduled in the earlier copy; 4 scheduled in the revised copy.'));
assert.ok(text.includes('Shared source label: Demo / synthetic source: fictional venues.'));
for(const phrase of [
 'Unchanged visits are counted above. This brief is not the complete revised week.',
 'timestamps do not establish which arrangement is current.',
 'not authenticated venue records. No source or care checks were rerun.',
 'Dates are planning suggestions, not reservations or confirmed opening hours.',
 'Venue worksheet notes are not included in these saved-week files.',
 'This download does not apply a week, contact a venue or update or cancel calendar imports.',
 'Later edits do not update this copy.',
 'File-supplied text is quoted; backslash escapes preserve embedded line breaks and control characters.'
])assert.ok(text.includes(phrase),phrase);
assert.ok(text.includes('Earlier copy saved at: '+before.savedAt));
assert.ok(text.includes('Revised copy saved at: '+after.savedAt));
assert.ok(text.includes('Shared source received at: '+before.receivedAt));
assert.deepEqual(before.response,after.response);assert.deepEqual(before.inputs,after.inputs);
for(let i=0;i<files.length;i++)assert.equal(sha(await fs.readFile(path.join(rawRoot,files[i]))),expected[i]);
const receipt={at:new Date().toISOString(),reviewer:'chatgpt-0378a7b6b7c2/la7',kind:'Independent exact-input/physical-download consumer review; source and browser execution reviewed separately by their owners',input_sha256:{earlier:expected[0],revised:expected[1]},output_sha256:expected[2],oracle_sha256:sha(oracleBytes),driver_sha256:sha(await fs.readFile(fileURLToPath(import.meta.url))),counts:oracle.counts,checked_changed_occurrences:3,checked_literal_explanations:3,passed:true,limitations:'This receives one authored native mock-plan input pair and its actual downloaded brief. No additional browser, malformed-input, repeated-venue or full-source acceptance is claimed.'};
await fs.writeFile(path.join(root,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(receipt,null,2));
