/** Independent consumer checks. Fixtures and expected rows were frozen before candidate exposure. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { compareCollections, main } from '../tools/compare_collection_backups.mjs';
import { readCollectionInput, CollectionInputError } from '../tools/collection_week.mjs';

const WEEK_TEXT = "{\"format\":\"tastetable.saved-week.v1\",\"receivedAt\":\"2026-10-14T12:00:00.000Z\",\"savedAt\":\"2026-10-14T12:00:00.000Z\",\"calendarId\":null,\"inputs\":{\"cuisines\":[],\"music\":[],\"films\":[],\"constraints\":[],\"city\":\"Fictional snow town \u96ea\"},\"response\":{\"mock\":true,\"plan\":{\"meals\":[],\"outing\":null,\"notes\":[\"Fictional empty plan; no venue claims.\"],\"rejected\":[]},\"llm_only\":{\"meals\":[],\"outing\":{\"name\":\"Fictional placeholder\",\"why\":\"No recommendation\",\"day\":\"Monday\"}},\"comparison\":{\"constraints\":[],\"grounded\":{\"picks\":0,\"with_qloo_entity_id\":0,\"with_affinity_evidence\":0,\"constraint_checked\":0,\"unsafe_candidates_rejected\":0},\"llm_only\":{\"picks\":0,\"with_qloo_entity_id\":0,\"with_affinity_evidence\":0,\"constraint_checked\":0,\"unsafe_candidates_rejected\":0}},\"trace\":[]},\"week\":{\"start\":\"2026-10-12\",\"assignments\":{}}}";
const SPACED_WEEK_TEXT = "\ufeff{\r\n  \"format\": \"tastetable.saved-week.v1\",\r\n  \"receivedAt\": \"2026-10-14T12:00:00.000Z\",\r\n  \"savedAt\": \"2026-10-14T12:00:00.000Z\",\r\n  \"calendarId\": null,\r\n  \"inputs\": {\r\n    \"cuisines\": [],\r\n    \"music\": [],\r\n    \"films\": [],\r\n    \"constraints\": [],\r\n    \"city\": \"Fictional snow town \u96ea\"\r\n  },\r\n  \"response\": {\r\n    \"mock\": true,\r\n    \"plan\": {\r\n      \"meals\": [],\r\n      \"outing\": null,\r\n      \"notes\": [\r\n        \"Fictional empty plan; no venue claims.\"\r\n      ],\r\n      \"rejected\": []\r\n    },\r\n    \"llm_only\": {\r\n      \"meals\": [],\r\n      \"outing\": {\r\n        \"name\": \"Fictional placeholder\",\r\n        \"why\": \"No recommendation\",\r\n        \"day\": \"Monday\"\r\n      }\r\n    },\r\n    \"comparison\": {\r\n      \"constraints\": [],\r\n      \"grounded\": {\r\n        \"picks\": 0,\r\n        \"with_qloo_entity_id\": 0,\r\n        \"with_affinity_evidence\": 0,\r\n        \"constraint_checked\": 0,\r\n        \"unsafe_candidates_rejected\": 0\r\n      },\r\n      \"llm_only\": {\r\n        \"picks\": 0,\r\n        \"with_qloo_entity_id\": 0,\r\n        \"with_affinity_evidence\": 0,\r\n        \"constraint_checked\": 0,\r\n        \"unsafe_candidates_rejected\": 0\r\n      }\r\n    },\r\n    \"trace\": []\r\n  },\r\n  \"week\": {\r\n    \"start\": \"2026-10-12\",\r\n    \"assignments\": {}\r\n  }\r\n}\r\n";
const NEW_DATE_WEEK_TEXT = "{\"format\":\"tastetable.saved-week.v1\",\"receivedAt\":\"2026-10-14T12:00:00.000Z\",\"savedAt\":\"2026-10-15T09:00:00.000Z\",\"calendarId\":null,\"inputs\":{\"cuisines\":[],\"music\":[],\"films\":[],\"constraints\":[],\"city\":\"Fictional snow town \u96ea\"},\"response\":{\"mock\":true,\"plan\":{\"meals\":[],\"outing\":null,\"notes\":[\"Fictional empty plan; no venue claims.\"],\"rejected\":[]},\"llm_only\":{\"meals\":[],\"outing\":{\"name\":\"Fictional placeholder\",\"why\":\"No recommendation\",\"day\":\"Monday\"}},\"comparison\":{\"constraints\":[],\"grounded\":{\"picks\":0,\"with_qloo_entity_id\":0,\"with_affinity_evidence\":0,\"constraint_checked\":0,\"unsafe_candidates_rejected\":0},\"llm_only\":{\"picks\":0,\"with_qloo_entity_id\":0,\"with_affinity_evidence\":0,\"constraint_checked\":0,\"unsafe_candidates_rejected\":0}},\"trace\":[]},\"week\":{\"start\":\"2026-10-12\",\"assignments\":{}}}";
const fixtureRecord = (id,name,text=WEEK_TEXT,createdAt='2026-10-14T12:00:00.000Z',updatedAt=createdAt) => ({format:'tastetable.browser-week',version:1,id,name,createdAt,updatedAt,text});
const LEFT_VALUE = {format:"tastetable.browser-week-collection.v1",savedAt:"2026-10-16T01:00:00.000Z",records:[
  fixtureRecord("only_left_z","Shared display",WEEK_TEXT,"2026-10-14T12:00:00.000Z","2026-10-14T12:00:00.000Z"),
  fixtureRecord("same_week_1","Unchanged \u96ea",WEEK_TEXT,"2026-10-14T12:00:00.000Z","2026-10-14T12:00:00.000Z"),
  fixtureRecord("rename_week","Before name",WEEK_TEXT,"2026-10-14T12:00:00.000Z","2026-10-14T12:00:00.000Z"),
  fixtureRecord("text_week_1","Spacing case",WEEK_TEXT,"2026-10-14T12:00:00.000Z","2026-10-14T12:00:00.000Z"),
  fixtureRecord("all_fields1","Before all",WEEK_TEXT,"2026-10-14T12:00:00.000Z","2026-10-14T12:00:00.000Z"),
  fixtureRecord("updated_id1","Updated only",WEEK_TEXT,"2026-10-14T12:00:00.000Z","2026-10-14T12:00:00.000Z"),
  fixtureRecord("only_left_a","Same name different ID",WEEK_TEXT,"2026-10-14T12:00:00.000Z","2026-10-14T12:00:00.000Z")
]};
const RIGHT_VALUE = {format:"tastetable.browser-week-collection.v1",savedAt:"2026-10-15T11:00:00.000Z",records:[
  fixtureRecord("only_right_z","Shared display",WEEK_TEXT,"2026-10-14T12:00:00.000Z","2026-10-14T12:00:00.000Z"),
  fixtureRecord("all_fields1","After \u96ea <tag>",NEW_DATE_WEEK_TEXT,"2026-10-15T09:00:00.000Z","2026-10-15T10:00:00.000Z"),
  fixtureRecord("text_week_1","Spacing case",SPACED_WEEK_TEXT,"2026-10-14T12:00:00.000Z","2026-10-14T12:00:00.000Z"),
  fixtureRecord("same_week_1","Unchanged \u96ea",WEEK_TEXT,"2026-10-14T12:00:00.000Z","2026-10-14T12:00:00.000Z"),
  fixtureRecord("only_right_a","Same name different ID",WEEK_TEXT,"2026-10-14T12:00:00.000Z","2026-10-14T12:00:00.000Z"),
  fixtureRecord("rename_week","After name",WEEK_TEXT,"2026-10-14T12:00:00.000Z","2026-10-14T12:00:00.000Z"),
  fixtureRecord("updated_id1","Updated only",WEEK_TEXT,"2026-10-14T12:00:00.000Z","2026-10-15T10:00:00.000Z")
]};
const LEFT_TEXT = '\uFEFF'+JSON.stringify(LEFT_VALUE,null,2)+'\r\n';
const RIGHT_TEXT = JSON.stringify(RIGHT_VALUE)+'\n';
const INVALID_RIGHT_TEXT = JSON.stringify({...RIGHT_VALUE,records:[...RIGHT_VALUE.records,fixtureRecord('invalid_id1','Invalid later unshared record','{}')]},null,2)+'\n';
const EXPECTED_TEXT = "{\n  \"format\": \"tastetable.collection-comparison.v1\",\n  \"left\": {\n    \"savedAt\": \"2026-10-16T01:00:00.000Z\",\n    \"count\": 7\n  },\n  \"right\": {\n    \"savedAt\": \"2026-10-15T11:00:00.000Z\",\n    \"count\": 7\n  },\n  \"counts\": {\n    \"same\": 1,\n    \"leftOnly\": 2,\n    \"rightOnly\": 2,\n    \"changed\": 4\n  },\n  \"records\": [\n    {\n      \"id\": \"only_left_z\",\n      \"status\": \"left-only\",\n      \"changedFields\": [],\n      \"left\": {\n        \"name\": \"Shared display\",\n        \"createdAt\": \"2026-10-14T12:00:00.000Z\",\n        \"updatedAt\": \"2026-10-14T12:00:00.000Z\"\n      },\n      \"right\": null\n    },\n    {\n      \"id\": \"same_week_1\",\n      \"status\": \"same\",\n      \"changedFields\": [],\n      \"left\": {\n        \"name\": \"Unchanged \u96ea\",\n        \"createdAt\": \"2026-10-14T12:00:00.000Z\",\n        \"updatedAt\": \"2026-10-14T12:00:00.000Z\"\n      },\n      \"right\": {\n        \"name\": \"Unchanged \u96ea\",\n        \"createdAt\": \"2026-10-14T12:00:00.000Z\",\n        \"updatedAt\": \"2026-10-14T12:00:00.000Z\"\n      }\n    },\n    {\n      \"id\": \"rename_week\",\n      \"status\": \"changed\",\n      \"changedFields\": [\n        \"name\"\n      ],\n      \"left\": {\n        \"name\": \"Before name\",\n        \"createdAt\": \"2026-10-14T12:00:00.000Z\",\n        \"updatedAt\": \"2026-10-14T12:00:00.000Z\"\n      },\n      \"right\": {\n        \"name\": \"After name\",\n        \"createdAt\": \"2026-10-14T12:00:00.000Z\",\n        \"updatedAt\": \"2026-10-14T12:00:00.000Z\"\n      }\n    },\n    {\n      \"id\": \"text_week_1\",\n      \"status\": \"changed\",\n      \"changedFields\": [\n        \"text\"\n      ],\n      \"left\": {\n        \"name\": \"Spacing case\",\n        \"createdAt\": \"2026-10-14T12:00:00.000Z\",\n        \"updatedAt\": \"2026-10-14T12:00:00.000Z\"\n      },\n      \"right\": {\n        \"name\": \"Spacing case\",\n        \"createdAt\": \"2026-10-14T12:00:00.000Z\",\n        \"updatedAt\": \"2026-10-14T12:00:00.000Z\"\n      }\n    },\n    {\n      \"id\": \"all_fields1\",\n      \"status\": \"changed\",\n      \"changedFields\": [\n        \"name\",\n        \"createdAt\",\n        \"updatedAt\",\n        \"text\"\n      ],\n      \"left\": {\n        \"name\": \"Before all\",\n        \"createdAt\": \"2026-10-14T12:00:00.000Z\",\n        \"updatedAt\": \"2026-10-14T12:00:00.000Z\"\n      },\n      \"right\": {\n        \"name\": \"After \u96ea <tag>\",\n        \"createdAt\": \"2026-10-15T09:00:00.000Z\",\n        \"updatedAt\": \"2026-10-15T10:00:00.000Z\"\n      }\n    },\n    {\n      \"id\": \"updated_id1\",\n      \"status\": \"changed\",\n      \"changedFields\": [\n        \"updatedAt\"\n      ],\n      \"left\": {\n        \"name\": \"Updated only\",\n        \"createdAt\": \"2026-10-14T12:00:00.000Z\",\n        \"updatedAt\": \"2026-10-14T12:00:00.000Z\"\n      },\n      \"right\": {\n        \"name\": \"Updated only\",\n        \"createdAt\": \"2026-10-14T12:00:00.000Z\",\n        \"updatedAt\": \"2026-10-15T10:00:00.000Z\"\n      }\n    },\n    {\n      \"id\": \"only_left_a\",\n      \"status\": \"left-only\",\n      \"changedFields\": [],\n      \"left\": {\n        \"name\": \"Same name different ID\",\n        \"createdAt\": \"2026-10-14T12:00:00.000Z\",\n        \"updatedAt\": \"2026-10-14T12:00:00.000Z\"\n      },\n      \"right\": null\n    },\n    {\n      \"id\": \"only_right_z\",\n      \"status\": \"right-only\",\n      \"changedFields\": [],\n      \"left\": null,\n      \"right\": {\n        \"name\": \"Shared display\",\n        \"createdAt\": \"2026-10-14T12:00:00.000Z\",\n        \"updatedAt\": \"2026-10-14T12:00:00.000Z\"\n      }\n    },\n    {\n      \"id\": \"only_right_a\",\n      \"status\": \"right-only\",\n      \"changedFields\": [],\n      \"left\": null,\n      \"right\": {\n        \"name\": \"Same name different ID\",\n        \"createdAt\": \"2026-10-14T12:00:00.000Z\",\n        \"updatedAt\": \"2026-10-14T12:00:00.000Z\"\n      }\n    }\n  ]\n}\n";

const L = '2026-10-16T01:00:00.000Z';
const R = '2026-10-15T11:00:00.000Z';
const A = '2026-10-14T12:00:00.000Z';
const EXPECTED = JSON.parse(EXPECTED_TEXT);
const LEFT = JSON.parse(LEFT_TEXT.replace(/^\uFEFF/, ''));
const RIGHT = JSON.parse(RIGHT_TEXT);
const hash = value => createHash('sha256').update(value).digest('hex');
const clone = value => structuredClone(value);
const json = value => JSON.stringify(value, null, 2) + '\n';
const envelope = (records, savedAt = L) => JSON.stringify({format:'tastetable.browser-week-collection.v1', savedAt, records});
const emptyReport = {
  format:'tastetable.collection-comparison.v1',
  left:{savedAt:L,count:0}, right:{savedAt:R,count:0},
  counts:{same:0,leftOnly:0,rightOnly:0,changed:0}, records:[],
};

function streams(maximum = Infinity) {
  const chunks = {1:[],2:[]};
  return {
    write(fd, buffer, offset, length) {
      assert.ok(fd === 1 || fd === 2);
      const size = Math.min(maximum, length);
      chunks[fd].push(Buffer.from(buffer.subarray(offset, offset + size)));
      return size;
    },
    bytes(fd) { return Buffer.concat(chunks[fd]); },
    text(fd) { return this.bytes(fd).toString('utf8'); },
  };
}

async function temporary(body) {
  const folder = await fs.mkdtemp(join(tmpdir(), 'tastetable-comparison-test-'));
  try { return await body(folder); }
  finally { await fs.rm(folder, {recursive:true,force:true}); }
}

function fileReport(left, right) {
  return {...clone(EXPECTED), inputs:{
    left:{path:resolve(left),sha256:hash(Buffer.from(LEFT_TEXT))},
    right:{path:resolve(right),sha256:hash(Buffer.from(RIGHT_TEXT))},
  }};
}

function receipt(output, bytes) {
  return {format:'tastetable.collection-comparison-receipt.v1', output:resolve(output),
    outputBytes:bytes.length, outputSha256:hash(bytes), counts:{same:1,leftOnly:2,rightOnly:2,changed:4}};
}

test('mixed classification preserves exact fields and caller order', () => {
  const result = compareCollections(LEFT_TEXT, RIGHT_TEXT);
  assert.deepEqual(result, EXPECTED);
  assert.equal(json(result), EXPECTED_TEXT, 'all property order and literal values are fixed');
  assert.deepEqual(result.records.map(row => row.id), [
    'only_left_z','same_week_1','rename_week','text_week_1','all_fields1',
    'updated_id1','only_left_a','only_right_z','only_right_a',
  ]);
  assert.equal(result.left.count, result.counts.same + result.counts.changed + result.counts.leftOnly);
  assert.equal(result.right.count, result.counts.same + result.counts.changed + result.counts.rightOnly);
  for (const row of result.records) {
    assert.deepEqual(Object.keys(row), ['id','status','changedFields','left','right']);
    for (const side of [row.left,row.right]) {
      if (side !== null) assert.deepEqual(Object.keys(side), ['name','createdAt','updatedAt']);
    }
  }
  assert.ok(!JSON.stringify(result).includes('Fictional empty plan; no venue claims.'));
  assert.equal(compareCollections(RIGHT_TEXT, LEFT_TEXT).records[0].id, 'only_right_z', 'Left is a role, not an inferred older side');
});

test('empty, identical, exact code units and whole native refusals', () => {
  assert.deepEqual(compareCollections(envelope([]), envelope([],R)), emptyReport);
  const reordered = {...clone(LEFT),savedAt:R,records:clone(LEFT.records).reverse()};
  const same = compareCollections(LEFT_TEXT, JSON.stringify(reordered));
  assert.deepEqual(same.counts, {same:7,leftOnly:0,rightOnly:0,changed:0});
  assert.equal(same.left.savedAt,L); assert.equal(same.right.savedAt,R);
  assert.deepEqual(same.records.map(row=>row.id), LEFT.records.map(row=>row.id));
  assert.ok(same.records.every(row => row.status === 'same' && row.changedFields.length === 0));

  // Stored texts can parse to the same week while differing in exact spelling.
  assert.deepEqual(JSON.parse(LEFT.records[3].text), JSON.parse(RIGHT.records[2].text.replace(/^\uFEFF/,'')));
  assert.notEqual(LEFT.records[3].text, RIGHT.records[2].text);
  const base = clone(LEFT.records[1]);
  const week = JSON.parse(base.text);
  week.response.plan.notes = ['UNIT'];
  const escaped = JSON.stringify(week).replace('UNIT','\\ud800');
  const rawHigh = JSON.stringify(week).replace('UNIT','\ud800');
  const rawLow = JSON.stringify(week).replace('UNIT','\udc00');
  const replacement = JSON.stringify(week).replace('UNIT','\ufffd');
  assert.deepEqual(Buffer.from(rawHigh),Buffer.from(rawLow), 'UTF-8 hashes would lose the distinction');
  for (const text of [rawLow,replacement,escaped]) {
    const result = compareCollections(envelope([{...base,text:rawHigh}]),envelope([{...base,text}],R));
    assert.equal(result.records[0].status,'changed');
    assert.deepEqual(result.records[0].changedFields,['text']);
    assert.deepEqual(result.counts,{same:0,leftOnly:0,rightOnly:0,changed:1});
  }
  const loneName = {...base,name:'Fictional \ud800 name',text:rawHigh};
  const lone = compareCollections(envelope([loneName]),envelope([loneName],R));
  assert.equal(lone.records[0].left.name,'Fictional \ud800 name');
  assert.match(JSON.stringify(lone),/\\ud800/);
  assert.equal(lone.records[0].status,'same');

  assert.throws(()=>compareCollections(LEFT_TEXT, INVALID_RIGHT_TEXT),TypeError,
    'an invalid otherwise unshared record invalidates the complete Right backup');
  assert.throws(()=>compareCollections(INVALID_RIGHT_TEXT,RIGHT_TEXT),TypeError);
  assert.throws(()=>compareCollections(envelope([base,base]),RIGHT_TEXT),TypeError);
  const duplicateKey = '{"format":"tastetable.browser-week-collection.v1","savedAt":"'+L+'","records":[],"recor\\u0064s":[]}';
  assert.throws(()=>compareCollections(envelope([]),duplicateKey),TypeError);
  assert.throws(()=>compareCollections(null,envelope([])),TypeError);
});

test('public file, publication and stream boundaries retain correct outcomes', async () => {
  assert.equal(typeof readCollectionInput,'function');
  assert.ok(new CollectionInputError('fixture') instanceof Error);
  let unexpectedFS = 0;
  const forbiddenFS = new Proxy({}, {get() { unexpectedFS++; throw new Error('Arguments must refuse before filesystem access'); }});
  const malformed = [[], ['--help','--left','x'], ['--left=x','--right','r','--output','o'],
    ['--left','l','--right','r'], ['--left','l','--left','x','--right','r','--output','o'],
    ['--left','','--right','r','--output','o'], ['--left','-','--right','r','--output','o'],
    ['--left','--unknown','--right','r','--output','o'], ['left','right','out'], [null],
    ['--left','l','--right','r','--output','o','--unknown','value']];
  for (const argv of malformed) {
    const sink = streams();
    assert.equal(await main(argv,{fs:forbiddenFS,write:sink.write}),2);
    assert.equal(sink.bytes(1).length,0);
    assert.ok(sink.bytes(2).length > 0);
  }
  assert.equal(unexpectedFS,0);
  const broken = streams();
  assert.equal(await main([],{fs:forbiddenFS,write(fd,...args) {
    if (fd === 2) throw new Error('stderr unavailable');
    return broken.write(fd,...args);
  }}),2);
  assert.equal(broken.bytes(1).length,0);
  assert.equal(await main(['--help'],{fs:forbiddenFS,write(){return 0;}}),1);

  await temporary(async folder => {
    const left = join(folder,'left 雪.json'), right = join(folder,'right 雪.json');
    await fs.writeFile(left,LEFT_TEXT); await fs.writeFile(right,RIGHT_TEXT);
    const argv = output => ['--output',output,'--right',right,'--left',left];
    const expectedBytes = Buffer.from(json(fileReport(left,right)));
    const opened = [], closed = [];
    const observedFS = {...fs, async open(path,...args) {
      opened.push(String(path));
      const handle = await fs.open(path,...args);
      return {stat:handle.stat.bind(handle),read:handle.read.bind(handle),
        async close(){closed.push(String(path));return handle.close();}};
    }};
    const output = join(folder,'complete 雪.json'), sink = streams(3);
    assert.equal(await main(argv(output),{fs:observedFS,write:sink.write}),0);
    assert.deepEqual(opened,[left,right]); assert.deepEqual(closed,[left,right]);
    assert.deepEqual(await fs.readFile(output),expectedBytes);
    assert.equal(sink.text(1),json(receipt(output,expectedBytes)));
    assert.equal(sink.bytes(2).length,0);

    const occupied = streams();
    assert.equal(await main(argv(output),{write:occupied.write}),2);
    assert.equal(occupied.bytes(1).length,0);
    assert.deepEqual(await fs.readFile(output),expectedBytes);

    const invalid = join(folder,'bad UTF8.json'); await fs.writeFile(invalid,Buffer.from([0xc3,0x28]));
    const invalidOut = join(folder,'never-created.json'), refused = streams();
    assert.equal(await main(['--left',invalid,'--right',right,'--output',invalidOut],{write:refused.write}),2);
    assert.equal(existsSync(invalidOut),false);

    // A competing final is retained, including the native error classification.
    const raceOutput = join(folder,'competing.json'), raceBytes=Buffer.from('competing content\n');
    const race = streams();
    assert.equal(await main(argv(raceOutput),{fs:{...fs,async link(_from,to) {
      await fs.writeFile(to,raceBytes,{flag:'wx'});
      throw Object.assign(new Error('competing final'),{code:'EEXIST'});
    }},write:race.write}),2);
    assert.deepEqual(await fs.readFile(raceOutput),raceBytes);
    assert.equal(race.bytes(1).length,0);

    const failedOutput=join(folder,'failed-before-link.json'), failed=streams();
    assert.equal(await main(argv(failedOutput),{fs:{...fs,async link(){throw new Error('fixture link failure');}},write:failed.write}),1);
    assert.equal(existsSync(failedOutput),false);
    assert.equal(failed.bytes(1).length,0);

    for (const failure of ['cleanup','stdout']) {
      const lateOutput=join(folder,'published-'+failure+'.json'), late=streams();
      const injectedFS = failure === 'cleanup'
        ? {...fs, async rm(){throw new Error('fixture cleanup failure');}} : fs;
      const write = (fd,...args) => {
        if (failure === 'stdout' && fd === 1) throw new Error('fixture stdout failure');
        return late.write(fd,...args);
      };
      assert.equal(await main(argv(lateOutput),{fs:injectedFS,write}),1);
      assert.deepEqual(await fs.readFile(lateOutput),expectedBytes);
      assert.ok(late.text(2).includes('Comparison report was created at '+resolve(lateOutput)));
    }
    assert.deepEqual(await fs.readFile(left),Buffer.from(LEFT_TEXT));
    assert.deepEqual(await fs.readFile(right),Buffer.from(RIGHT_TEXT));
  });
});

test('four bounded CLI calls retain exact report and refusal evidence', () => {
  const retained = process.env.TASTETABLE_COLLECTION_COMPARISON_ARTIFACT_DIR;
  const folder = retained ? resolve(retained) : mkdtempSync(join(tmpdir(),'tastetable-comparison-cli-'));
  if (retained) mkdirSync(folder,{recursive:false});
  const script = fileURLToPath(new URL('../tools/compare_collection_backups.mjs',import.meta.url));
  const left=join(folder,'fictional-left.json'),right=join(folder,'fictional-right.json');
  const invalid=join(folder,'fictional-invalid-right.json'),output=join(folder,'comparison-report.json');
  const invalidOutput=join(folder,'invalid-must-not-exist.json');
  const before = new Map([[left,Buffer.from(LEFT_TEXT)],[right,Buffer.from(RIGHT_TEXT)],[invalid,Buffer.from(INVALID_RIGHT_TEXT)]]);
  try {
    for (const [path,bytes] of before) writeFileSync(path,bytes,{flag:'wx'});
    writeFileSync(join(folder,'expected-pure-report.json'),EXPECTED_TEXT,{flag:'wx'});
    function run(name,args,expectedCode) {
      const course=join(folder,name);mkdirSync(course);
      const command=[process.execPath,script,...args];
      writeFileSync(join(course,'intent.json'),json({command,cwd:folder,timeoutMs:10000,expectedCode}));
      const started=process.hrtime.bigint();
      const result=spawnSync(command[0],command.slice(1),{cwd:folder,timeout:10000,
        killSignal:'SIGKILL',maxBuffer:2*1024*1024,windowsHide:true});
      const stdout=Buffer.from(result.stdout||[]),stderr=Buffer.from(result.stderr||[]);
      writeFileSync(join(course,'stdout.bin'),stdout);writeFileSync(join(course,'stderr.bin'),stderr);
      writeFileSync(join(course,'result.json'),json({pid:result.pid,status:result.status,signal:result.signal,
        error:result.error ? {name:result.error.name,message:result.error.message,code:result.error.code}:null,
        seconds:Number(process.hrtime.bigint()-started)/1e9,
        stdout:{bytes:stdout.length,sha256:hash(stdout)},stderr:{bytes:stderr.length,sha256:hash(stderr)}}));
      assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,expectedCode);
      return {stdout,stderr};
    }
    const args=['--left',left,'--right',right,'--output',output];
    const success=run('01-success',args,0),expectedBytes=Buffer.from(json(fileReport(left,right)));
    assert.equal(success.stderr.length,0);
    assert.deepEqual(readFileSync(output),expectedBytes);
    assert.equal(success.stdout.toString('utf8'),json(receipt(output,expectedBytes)));
    const occupied=run('02-occupied',args,2);
    assert.equal(occupied.stdout.length,0);assert.ok(occupied.stderr.length>0);
    assert.deepEqual(readFileSync(output),expectedBytes);
    const refused=run('03-invalid',['--left',left,'--right',invalid,'--output',invalidOutput],2);
    assert.equal(refused.stdout.length,0);assert.ok(refused.stderr.length>0);
    assert.equal(existsSync(invalidOutput),false);
    const help=run('04-help',['--help'],0);
    assert.equal(help.stderr.length,0);
    for (const word of ['--left','--right','--output']) assert.ok(help.stdout.toString('utf8').includes(word));
    for (const [path,bytes] of before) assert.deepEqual(readFileSync(path),bytes);
    writeFileSync(join(folder,'actual-artifact.json'),json({
      report:{path:output,bytes:expectedBytes.length,sha256:hash(readFileSync(output))},
      inputAfter:[...before.keys()].map(path=>({path,bytes:readFileSync(path).length,sha256:hash(readFileSync(path))})),
      expectedCodes:[0,2,2,0],source:'Four ordinary bounded CLI calls; fictional inputs and independent literal report.',
    }));
  } finally { if (!retained) rmSync(folder,{recursive:true,force:true}); }
});
