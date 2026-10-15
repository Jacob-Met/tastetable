import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { describeCollection, selectStoredWeek, writeNew, main } from '../tools/collection_week.mjs';

// Independently authored fictional fixtures. No candidate function constructs
// their expected metadata, stored text, byte identity or receipt semantics.
const WEEK_TEXT = "\ufeff{\r\n  \"note\": \"Fictional recovery example \u2014 preserve this exact text\",\r\n  \"format\": \"tastetable.saved-week.v1\",\r\n  \"receivedAt\": \"2026-10-14T11:59:00.000Z\",\r\n  \"savedAt\": \"2026-10-14T12:00:00.000Z\",\r\n  \"calendarId\": \"0123456789abcdef0123456789abcdef\",\r\n  \"inputs\": {\"city\":\"Fictional \u96ea\",\"cuisines\":[\"Cafe\"],\"music\":[],\"films\":[],\"constraints\":[\"Vegetarian\"]},\r\n  \"response\": {\r\n    \"mock\": true,\r\n    \"plan\": {\"meals\":[{\"name\":\"Fictional Lantern Cafe\",\"why\":\"Stored example, not a venue recommendation\",\"entity_id\":\"fictional-cafe-01\",\"kind\":\"restaurant\",\"day\":\"Monday\",\"affinity\":0.8,\"fallback\":true}],\"outing\":null,\"notes\":[\"Supplied fictional response\"],\"rejected\":[]},\r\n    \"llm_only\": {\"meals\":[],\"outing\":{\"name\":\"Fictional park\",\"why\":\"Comparison placeholder\",\"day\":\"Tuesday\"}},\r\n    \"comparison\": {\"constraints\":[\"Vegetarian\"],\"grounded\":{\"picks\":1,\"with_qloo_entity_id\":1,\"with_affinity_evidence\":1,\"constraint_checked\":1,\"unsafe_candidates_rejected\":0},\"llm_only\":{\"picks\":1,\"with_qloo_entity_id\":0,\"with_affinity_evidence\":0,\"constraint_checked\":0,\"unsafe_candidates_rejected\":0}},\r\n    \"trace\": [{\"tool\":\"fictional-source\",\"args\":{\"label\":\"\u96ea\",\"kept\":true},\"result_summary\":\"No provider called\"}],\r\n    \"unknownStoredField\": {\"retain\":[1,true,null],\"label\":\"\ud83d\ude00\"}\r\n  },\r\n  \"week\": {\"start\":\"2026-10-12\",\"assignments\":{\"pick-0\":\"Friday\"}}\r\n}\r\n";
const SECOND_TEXT = "{\"format\":\"tastetable.saved-week.v1\",\"receivedAt\":\"2026-10-13T08:00:00.000Z\",\"savedAt\":\"2026-10-13T08:01:00.000Z\",\"calendarId\":null,\"inputs\":{\"city\":\"Fictional Delta\",\"cuisines\":[],\"music\":[],\"films\":[],\"constraints\":[]},\"response\":{\"plan\":{\"meals\":[],\"outing\":null,\"notes\":[],\"rejected\":[]},\"llm_only\":{\"meals\":[],\"outing\":{\"name\":\"Fictional empty comparison\",\"why\":\"No actual plan\",\"day\":\"Monday\"}},\"comparison\":{\"constraints\":[],\"grounded\":{\"picks\":0,\"with_qloo_entity_id\":0,\"with_affinity_evidence\":0,\"constraint_checked\":0,\"unsafe_candidates_rejected\":0},\"llm_only\":{\"picks\":0,\"with_qloo_entity_id\":0,\"with_affinity_evidence\":0,\"constraint_checked\":0,\"unsafe_candidates_rejected\":0}},\"trace\":[]},\"week\":{\"start\":\"2026-10-12\",\"assignments\":{}},\"literalEscapedSurrogate\":\"\\ud800\"}";
const BACKUP_TEXT = "\ufeff{\n  \"format\": \"tastetable.browser-week-collection.v1\",\n  \"savedAt\": \"2026-10-15T02:00:00.000Z\",\n  \"records\": [\n    {\n      \"format\": \"tastetable.browser-week\",\n      \"version\": 1,\n      \"id\": \"week_zeta_01\",\n      \"name\": \"Fictional snow week \u96ea\",\n      \"createdAt\": \"2026-10-14T12:00:00.000Z\",\n      \"updatedAt\": \"2026-10-15T01:00:00.000Z\",\n      \"text\": \"\ufeff{\\r\\n  \\\"note\\\": \\\"Fictional recovery example \u2014 preserve this exact text\\\",\\r\\n  \\\"format\\\": \\\"tastetable.saved-week.v1\\\",\\r\\n  \\\"receivedAt\\\": \\\"2026-10-14T11:59:00.000Z\\\",\\r\\n  \\\"savedAt\\\": \\\"2026-10-14T12:00:00.000Z\\\",\\r\\n  \\\"calendarId\\\": \\\"0123456789abcdef0123456789abcdef\\\",\\r\\n  \\\"inputs\\\": {\\\"city\\\":\\\"Fictional \u96ea\\\",\\\"cuisines\\\":[\\\"Cafe\\\"],\\\"music\\\":[],\\\"films\\\":[],\\\"constraints\\\":[\\\"Vegetarian\\\"]},\\r\\n  \\\"response\\\": {\\r\\n    \\\"mock\\\": true,\\r\\n    \\\"plan\\\": {\\\"meals\\\":[{\\\"name\\\":\\\"Fictional Lantern Cafe\\\",\\\"why\\\":\\\"Stored example, not a venue recommendation\\\",\\\"entity_id\\\":\\\"fictional-cafe-01\\\",\\\"kind\\\":\\\"restaurant\\\",\\\"day\\\":\\\"Monday\\\",\\\"affinity\\\":0.8,\\\"fallback\\\":true}],\\\"outing\\\":null,\\\"notes\\\":[\\\"Supplied fictional response\\\"],\\\"rejected\\\":[]},\\r\\n    \\\"llm_only\\\": {\\\"meals\\\":[],\\\"outing\\\":{\\\"name\\\":\\\"Fictional park\\\",\\\"why\\\":\\\"Comparison placeholder\\\",\\\"day\\\":\\\"Tuesday\\\"}},\\r\\n    \\\"comparison\\\": {\\\"constraints\\\":[\\\"Vegetarian\\\"],\\\"grounded\\\":{\\\"picks\\\":1,\\\"with_qloo_entity_id\\\":1,\\\"with_affinity_evidence\\\":1,\\\"constraint_checked\\\":1,\\\"unsafe_candidates_rejected\\\":0},\\\"llm_only\\\":{\\\"picks\\\":1,\\\"with_qloo_entity_id\\\":0,\\\"with_affinity_evidence\\\":0,\\\"constraint_checked\\\":0,\\\"unsafe_candidates_rejected\\\":0}},\\r\\n    \\\"trace\\\": [{\\\"tool\\\":\\\"fictional-source\\\",\\\"args\\\":{\\\"label\\\":\\\"\u96ea\\\",\\\"kept\\\":true},\\\"result_summary\\\":\\\"No provider called\\\"}],\\r\\n    \\\"unknownStoredField\\\": {\\\"retain\\\":[1,true,null],\\\"label\\\":\\\"\ud83d\ude00\\\"}\\r\\n  },\\r\\n  \\\"week\\\": {\\\"start\\\":\\\"2026-10-12\\\",\\\"assignments\\\":{\\\"pick-0\\\":\\\"Friday\\\"}}\\r\\n}\\r\\n\"\n    },\n    {\n      \"format\": \"tastetable.browser-week\",\n      \"version\": 1,\n      \"id\": \"week_alpha_02\",\n      \"name\": \"Fictional empty week\",\n      \"createdAt\": \"2026-10-13T08:01:00.000Z\",\n      \"updatedAt\": \"2026-10-13T08:01:00.000Z\",\n      \"text\": \"{\\\"format\\\":\\\"tastetable.saved-week.v1\\\",\\\"receivedAt\\\":\\\"2026-10-13T08:00:00.000Z\\\",\\\"savedAt\\\":\\\"2026-10-13T08:01:00.000Z\\\",\\\"calendarId\\\":null,\\\"inputs\\\":{\\\"city\\\":\\\"Fictional Delta\\\",\\\"cuisines\\\":[],\\\"music\\\":[],\\\"films\\\":[],\\\"constraints\\\":[]},\\\"response\\\":{\\\"plan\\\":{\\\"meals\\\":[],\\\"outing\\\":null,\\\"notes\\\":[],\\\"rejected\\\":[]},\\\"llm_only\\\":{\\\"meals\\\":[],\\\"outing\\\":{\\\"name\\\":\\\"Fictional empty comparison\\\",\\\"why\\\":\\\"No actual plan\\\",\\\"day\\\":\\\"Monday\\\"}},\\\"comparison\\\":{\\\"constraints\\\":[],\\\"grounded\\\":{\\\"picks\\\":0,\\\"with_qloo_entity_id\\\":0,\\\"with_affinity_evidence\\\":0,\\\"constraint_checked\\\":0,\\\"unsafe_candidates_rejected\\\":0},\\\"llm_only\\\":{\\\"picks\\\":0,\\\"with_qloo_entity_id\\\":0,\\\"with_affinity_evidence\\\":0,\\\"constraint_checked\\\":0,\\\"unsafe_candidates_rejected\\\":0}},\\\"trace\\\":[]},\\\"week\\\":{\\\"start\\\":\\\"2026-10-12\\\",\\\"assignments\\\":{}},\\\"literalEscapedSurrogate\\\":\\\"\\\\ud800\\\"}\"\n    }\n  ]\n}\r\n";
const EXPECTED_INDEX = {"format": "tastetable.collection-index.v1", "savedAt": "2026-10-15T02:00:00.000Z", "count": 2, "records": [{"id": "week_zeta_01", "name": "Fictional snow week \u96ea", "createdAt": "2026-10-14T12:00:00.000Z", "updatedAt": "2026-10-15T01:00:00.000Z"}, {"id": "week_alpha_02", "name": "Fictional empty week", "createdAt": "2026-10-13T08:01:00.000Z", "updatedAt": "2026-10-13T08:01:00.000Z"}]};
const INDEX_KEYS = ['format', 'savedAt', 'count', 'records'];
const META_KEYS = ['id', 'name', 'createdAt', 'updatedAt'];
const RECEIPT_KEYS = ['format', 'input', 'inputSha256', 'output', 'outputBytes', 'outputSha256', 'record'];
const INDEX_TEXT = JSON.stringify(EXPECTED_INDEX, null, 2) + '\n';
const REPO = fileURLToPath(new URL('../', import.meta.url));
const TOOL = path.join(REPO, 'tools', 'collection_week.mjs');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const parsedBackup = () => JSON.parse(BACKUP_TEXT.replace(/^\uFEFF/, ''));
const backupWith = (change) => { const value = parsedBackup(); change(value); return JSON.stringify(value); };
const errorWithCode = (message, code) => Object.assign(new Error(message), { code });

async function scratch(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tastetable-recovery-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

function fileHandle(handle, overrides) {
  return new Proxy(handle, { get(target, name) {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    const value = Reflect.get(target, name, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
}

function statWith(stat, changes) {
  return new Proxy(stat, { get(target, name) {
    if (Object.hasOwn(changes, name)) return changes[name];
    const value = Reflect.get(target, name, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
}

function increment(value) { return typeof value === 'bigint' ? value + 1n : value + 1; }

async function callMain(argv, { filesystem = fs, transform } = {}) {
  const chunks = { 1: [], 2: [] };
  const append = (fd, buffer, offset, length) => {
    assert.ok(fd === 1 || fd === 2);
    assert.ok(Buffer.isBuffer(buffer));
    assert.ok(Number.isInteger(offset) && Number.isInteger(length));
    assert.ok(offset >= 0 && length >= 0 && offset + length <= buffer.length);
    chunks[fd].push(Buffer.from(buffer.subarray(offset, offset + length)));
    return length;
  };
  const write = transform ? transform(append) : append;
  const status = await main(argv, { fs: filesystem, write });
  return { status, stdout: Buffer.concat(chunks[1]), stderr: Buffer.concat(chunks[2]) };
}

async function identity(filename) {
  const bytes = await fs.readFile(filename);
  const s = await fs.stat(filename, { bigint: true });
  return { bytes: bytes.length, sha256: sha(bytes), size: String(s.size), mode: String(s.mode),
    inode: String(s.ino), device: String(s.dev), mtime_ns: String(s.mtimeNs), ctime_ns: String(s.ctimeNs) };
}

test('complete native listing and admission preserve metadata and stored order', () => {
  assert.equal(Buffer.byteLength(BACKUP_TEXT), 3074);
  assert.equal(sha(Buffer.from(BACKUP_TEXT)), '4b15dbb1104ce101a44d492238509c151b7e435ba448fb306b55693b13ed46ff');
  const index = describeCollection(BACKUP_TEXT);
  assert.deepEqual(index, EXPECTED_INDEX);
  assert.deepEqual(Object.keys(index), INDEX_KEYS);
  for (const record of index.records) assert.deepEqual(Object.keys(record), META_KEYS);
  assert.deepEqual(index.records.map((r) => r.id), ['week_zeta_01', 'week_alpha_02']);
  assert.equal(Object.hasOwn(index.records[0], 'text'), false);
  assert.equal(JSON.stringify(index, null, 2) + '\n', INDEX_TEXT);
  assert.equal(sha(Buffer.from(INDEX_TEXT)), '6724cc5887bd70f54130e514a25d16f034399b5a5d9884f2e0cf7f6bcc11b92f');
  const empty = backupWith((value) => { value.records = []; });
  assert.deepEqual(describeCollection(empty), {
    format: 'tastetable.collection-index.v1', savedAt: '2026-10-15T02:00:00.000Z', count: 0, records: [],
  });
  assert.throws(() => selectStoredWeek(empty, 'week_zeta_01'), TypeError);
  const invalid = [
    null, 17, '{',
    backupWith((v) => { v.records[1].text = '{broken unselected week'; }),
    backupWith((v) => { v.records[1].id = v.records[0].id; }),
    backupWith((v) => { v.records[0].name = ' unnormalized '; }),
    backupWith((v) => { v.records[0].createdAt = '2026-10-14T12:00:01.000Z'; }),
    backupWith((v) => { v.records[0].updatedAt = '2026-10-13T12:00:00.000Z'; }),
    backupWith((v) => { v.records[0].text = WEEK_TEXT.replace('2026-10-12', '2026-10-13'); }),
    backupWith((v) => { v.records[0].text = WEEK_TEXT.replace('"pick-0":"Friday"', '"pick-0":"Notaday"'); }),
    backupWith((v) => { v.savedAt = 'not a date'; }),
    backupWith((v) => { v.format = 'other'; }),
    backupWith((v) => { v.extra = true; }),
    backupWith((v) => { v.records = Array.from({ length: 51 }, (_, i) => ({ ...v.records[0], id: `record_${String(i).padStart(4, '0')}` })); }),
    backupWith((v) => { v.records[0].text = ' '.repeat(512 * 1024 + 1); }),
    '{"format":"tastetable.browser-week-collection.v1","savedAt":"2026-10-15T02:00:00.000Z","\\u0073avedAt":"2026-10-15T02:00:00.000Z","records":[]}',
  ];
  for (const text of invalid) {
    assert.throws(() => describeCollection(text));
    // A valid first ID cannot bypass complete admission of the backup.
    assert.throws(() => selectStoredWeek(text, 'week_zeta_01'));
  }
});

test('selection retains exact stored UTF8 text and distinguishes raw surrogate units', () => {
  const chosen = selectStoredWeek(BACKUP_TEXT, 'week_zeta_01');
  assert.deepEqual(Object.keys(chosen), ['record', 'text']);
  assert.deepEqual(Object.keys(chosen.record), META_KEYS);
  assert.deepEqual(chosen.record, EXPECTED_INDEX.records[0]);
  assert.equal(chosen.text, WEEK_TEXT);
  assert.equal(chosen.text.charCodeAt(0), 0xFEFF);
  assert.ok(chosen.text.includes('\r\n') && chosen.text.endsWith('\r\n'));
  assert.equal(chosen.text.replace(/\r\n/g, '').includes('\n'), false);
  assert.ok(chosen.text.includes('"pick-0":"Friday"'));
  assert.ok(chosen.text.includes('"unknownStoredField"'));
  assert.ok(chosen.text.includes('😀'));
  assert.equal(Buffer.byteLength(chosen.text), 1362);
  assert.equal(sha(Buffer.from(chosen.text)), 'f54b1e2e964dca024a76c4eca1cd5918f567688b5e6087719747111b2662c7cb');
  const second = selectStoredWeek(BACKUP_TEXT, 'week_alpha_02');
  assert.deepEqual(second.record, EXPECTED_INDEX.records[1]);
  assert.equal(second.text, SECOND_TEXT);
  assert.ok(second.text.includes('\\ud800'));
  assert.equal(sha(Buffer.from(second.text)), '1b0e1ac89e2945224f5351062eb290a2d78dd6e13f1c8a08d3297daee57be2d2');
  for (const id of [undefined, null, 0, true, {}, ['week_zeta_01'], 'week_zeta_01 ', 'WEEK_ZETA_01', 'absent_id']) {
    assert.throws(() => selectStoredWeek(BACKUP_TEXT, id), TypeError);
  }
  for (const raw of ['\uD800', '\uDC00', 'x\uD800y', '\uD800\uD800']) {
    const malformedSelected = backupWith((v) => { v.records[0].text = WEEK_TEXT.replace('preserve this exact text', raw); });
    assert.deepEqual(describeCollection(malformedSelected), EXPECTED_INDEX);
    assert.throws(() => selectStoredWeek(malformedSelected, 'week_zeta_01'), TypeError);
  }
  const rawUnselected = backupWith((v) => { v.records[1].text = SECOND_TEXT.replace('Fictional Delta', 'raw \uDC00'); });
  assert.deepEqual(describeCollection(rawUnselected), EXPECTED_INDEX);
  assert.equal(selectStoredWeek(rawUnselected, 'week_zeta_01').text, WEEK_TEXT);
  assert.throws(() => selectStoredWeek(rawUnselected, 'week_alpha_02'), TypeError);
  chosen.record.name = 'caller mutation';
  assert.deepEqual(describeCollection(BACKUP_TEXT), EXPECTED_INDEX);
});

test('create-only publication and declared fs/write seams retain correct failure boundaries', async (t) => {
  const directory = await scratch(t);
  const input = path.join(directory, 'complete backup 雪.json');
  await fs.writeFile(input, BACKUP_TEXT, { flag: 'wx' });
  const inputBefore = await identity(input);
  let noEffectCalls = 0;
  const noEffects = new Proxy({}, { get() { return () => { noEffectCalls++; throw new Error('unexpected fs effect'); }; } });
  for (const bad of [null, 1, {}, '\uD800', '\uDC00']) {
    await assert.rejects(() => writeNew(path.join(directory, 'bad.json'), bad, { fs: noEffects }), TypeError);
  }
  assert.equal(noEffectCalls, 0);
  const fresh = path.join(directory, 'exact recovered.json');
  const order = [];
  const notificationFs = { ...fs,
    async link(...args) { await fs.link(...args); order.push('link'); },
    async rm(...args) { order.push('cleanup'); return fs.rm(...args); },
  };
  assert.equal(await writeNew(fresh, WEEK_TEXT, { fs: notificationFs, onPublished() {
    order.push('published'); assert.equal(existsSync(fresh), true);
  } }), undefined);
  assert.deepEqual(order, ['link', 'published', 'cleanup']);
  assert.deepEqual(await fs.readFile(fresh), Buffer.from(WEEK_TEXT));
  const freshBefore = await identity(fresh);
  const occupiedDirectory = path.join(directory, 'existing directory');
  await fs.mkdir(occupiedDirectory);
  for (const destination of [fresh, occupiedDirectory]) await assert.rejects(() => writeNew(destination, 'replacement'));
  assert.deepEqual(await identity(fresh), freshBefore);
  assert.deepEqual(await fs.readdir(occupiedDirectory), []);
  let hookCalls = 0;
  const hookFile = path.join(directory, 'hook failure.json');
  await assert.rejects(() => writeNew(hookFile, WEEK_TEXT, { onPublished() {
    hookCalls++; assert.equal(existsSync(hookFile), true); throw new Error('hook-probe');
  } }), /hook-probe/);
  assert.equal(hookCalls, 1);
  assert.deepEqual(await fs.readFile(hookFile), Buffer.from(WEEK_TEXT));
  const raceFile = path.join(directory, 'race winner.json');
  await assert.rejects(() => writeNew(raceFile, WEEK_TEXT, { fs: { ...fs, async link(stage, target) {
    await fs.writeFile(target, 'race winner', { flag: 'wx' }); throw errorWithCode('race occupied', 'EEXIST');
  } } }));
  assert.equal(await fs.readFile(raceFile, 'utf8'), 'race winner');
  const beforeWriteFailure = (await fs.readdir(directory)).sort();
  await assert.rejects(() => writeNew(path.join(directory, 'write failure.json'), WEEK_TEXT,
    { fs: { ...fs, async writeFile() { throw new Error('stage-write-probe'); } } }), /stage-write-probe/);
  assert.deepEqual((await fs.readdir(directory)).sort(), beforeWriteFailure);
  await assert.rejects(() => writeNew(path.join(directory, 'absent-parent', 'week.json'), WEEK_TEXT));
  assert.equal(existsSync(path.join(directory, 'absent-parent')), false);

  const invalidArguments = [[], ['--input=x'], ['--unknown', 'x'], ['positional'], ['--input', '-'],
    ['--input', ''], ['--input', '--output'], ['--help', '--input', input],
    ['--input', input, '--input', input], ['--input', input, '--id', 'week_zeta_01'],
    ['--input', input, '--output', 'some.json'], ['--input', input, '--id', 'week_zeta_01', '--output', '-']];
  for (const argv of invalidArguments) {
    const result = await callMain(argv, { filesystem: noEffects });
    assert.equal(result.status, 2); assert.equal(result.stdout.length, 0); assert.ok(result.stderr.length > 0);
  }
  assert.equal(noEffectCalls, 0);
  const help = await callMain(['--help'], { filesystem: noEffects });
  assert.equal(help.status, 0); assert.equal(help.stderr.length, 0); assert.match(help.stdout.toString(), /--input/);
  assert.equal(noEffectCalls, 0);

  // Observe the declared standard FileHandle surface, without private helper names.
  const captured = { opens: 0, closes: 0, lengths: [], flags: null };
  const descriptorFs = { ...fs,
    async readFile() { throw new Error('input must use its admitted descriptor'); },
    async open(filename, flags, ...rest) {
      captured.opens++; captured.flags = flags;
      const handle = await fs.open(filename, flags, ...rest);
      return fileHandle(handle, {
        async read(...args) {
          const options = args[0] && !ArrayBuffer.isView(args[0]) ? args[0] : null;
          const result = await handle.read(...args);
          const buffer = options?.buffer ?? (ArrayBuffer.isView(args[0]) ? args[0] : result.buffer);
          const offset = options?.offset ?? (ArrayBuffer.isView(args[0]) ? args[1] ?? 0 : 0);
          const length = options?.length ?? (ArrayBuffer.isView(args[0]) ? args[2] : undefined) ?? (buffer.byteLength - offset);
          captured.lengths.push(length);
          return result;
        },
        async close() { captured.closes++; return handle.close(); },
      });
    },
  };
  const short = await callMain(['--input', input], { filesystem: descriptorFs,
    transform: (append) => (fd, buffer, offset, length) => append(fd, buffer, offset, Math.min(length, 7)) });
  assert.equal(short.status, 0); assert.deepEqual(short.stdout, Buffer.from(INDEX_TEXT)); assert.equal(short.stderr.length, 0);
  assert.equal(captured.opens, 1); assert.equal(captured.closes, 1);
  assert.equal(typeof captured.flags, 'number');
  assert.equal(captured.flags & constants.O_NONBLOCK, constants.O_NONBLOCK);
  assert.ok(captured.lengths.length > 0 && captured.lengths.every((length) => Number.isInteger(length) && length > 0 && length <= 32 * 1024 * 1024 + 1));

  const noOutput = path.join(directory, 'input refusal output.json');
  const extraction = (source = input, output = noOutput) => ['--input', source, '--id', 'week_zeta_01', '--output', output];
  const invalidUtf8 = path.join(directory, 'invalid UTF8.json');
  await fs.writeFile(invalidUtf8, Buffer.from([0xc3, 0x28]));
  for (const source of [invalidUtf8, directory]) {
    const result = await callMain(extraction(source));
    assert.equal(result.status, 2); assert.equal(result.stdout.length, 0); assert.equal(existsSync(noOutput), false);
  }
  for (const scenario of ['changed metadata', 'descriptor identity', 'read error', 'close error']) {
    let statCalls = 0, closes = 0;
    const filesystem = { ...fs, async open(...args) {
      const handle = await fs.open(...args);
      return fileHandle(handle, {
        async stat(...options) {
          const s = await handle.stat(...options); statCalls++;
          if (scenario === 'descriptor identity') return statWith(s, { ino: increment(s.ino) });
          if (scenario === 'changed metadata' && statCalls >= 2) {
            return statWith(s, { mtimeMs: increment(s.mtimeMs), ctimeMs: increment(s.ctimeMs),
              ...(s.mtimeNs !== undefined ? { mtimeNs: increment(s.mtimeNs), ctimeNs: increment(s.ctimeNs) } : {}) });
          }
          return s;
        },
        async read(...args) { if (scenario === 'read error') throw new Error('input-read-probe'); return handle.read(...args); },
        async close() { closes++; await handle.close(); if (scenario === 'close error') throw new Error('input-close-probe'); },
      });
    } };
    const result = await callMain(extraction(), { filesystem });
    assert.equal(result.status, 2, scenario); assert.equal(result.stdout.length, 0, scenario);
    assert.ok(closes >= 1, scenario); assert.equal(existsSync(noOutput), false, scenario);
  }
  let symlinkOpens = 0;
  const symlinkRefusal = await callMain(extraction(), { filesystem: { ...fs,
    async lstat(...args) { const s = await fs.lstat(...args); return statWith(s, { isSymbolicLink: () => true }); },
    async open() { symlinkOpens++; throw new Error('must not open a direct symlink'); },
  } });
  assert.equal(symlinkRefusal.status, 2); assert.equal(symlinkOpens, 0); assert.equal(existsSync(noOutput), false);

  const occupied = await callMain(extraction(input, fresh));
  assert.equal(occupied.status, 2); assert.equal(occupied.stdout.length, 0); assert.deepEqual(await identity(fresh), freshBefore);
  const beforeLink = await callMain(extraction(), { filesystem: { ...fs,
    async mkdtemp() { throw new Error('stage-create-probe'); },
  } });
  assert.equal(beforeLink.status, 1); assert.equal(beforeLink.stdout.length, 0);
  assert.doesNotMatch(beforeLink.stderr.toString(), /Recovered week was created/);
  assert.equal(existsSync(noOutput), false);
  const bothErrors = await callMain(extraction(), { filesystem: { ...fs,
    async writeFile() { throw new Error('original-write-probe'); },
    async rm() { throw new Error('cleanup-secondary-probe'); },
  } });
  assert.equal(bothErrors.status, 1); assert.equal(bothErrors.stdout.length, 0);
  assert.match(bothErrors.stderr.toString(), /original-write-probe/);
  assert.match(bothErrors.stderr.toString(), /cleanup-secondary-probe/);
  assert.doesNotMatch(bothErrors.stderr.toString(), /Recovered week was created/);
  assert.equal(existsSync(noOutput), false);
  const lateCleanupFile = path.join(directory, 'published despite cleanup.json');
  const lateCleanup = await callMain(extraction(input, lateCleanupFile), { filesystem: { ...fs,
    async rm() { throw new Error('late-cleanup-probe'); },
  } });
  assert.equal(lateCleanup.status, 1); assert.equal(lateCleanup.stdout.length, 0);
  assert.match(lateCleanup.stderr.toString(), /Recovered week was created/);
  assert.ok(lateCleanup.stderr.toString().includes(path.resolve(lateCleanupFile)));
  assert.deepEqual(await fs.readFile(lateCleanupFile), Buffer.from(WEEK_TEXT));
  const lateStdoutFile = path.join(directory, 'published despite stdout.json');
  const lateStdout = await callMain(extraction(input, lateStdoutFile), {
    transform: (append) => (fd, buffer, offset, length) => { if (fd === 1) throw new Error('stdout-probe'); return append(fd, buffer, offset, length); },
  });
  assert.equal(lateStdout.status, 1); assert.equal(lateStdout.stdout.length, 0);
  assert.match(lateStdout.stderr.toString(), /Recovered week was created/);
  assert.ok(lateStdout.stderr.toString().includes(path.resolve(lateStdoutFile)));
  assert.deepEqual(await fs.readFile(lateStdoutFile), Buffer.from(WEEK_TEXT));
  for (const invalidWriteResult of [0, undefined, NaN, -1, 1000000]) {
    const result = await callMain(['--input', input], {
      transform: (append) => (fd, buffer, offset, length) => fd === 1 ? invalidWriteResult : append(fd, buffer, offset, length),
    });
    assert.equal(result.status, 1); assert.equal(result.stdout.length, 0); assert.ok(result.stderr.length > 0);
  }
  const failedDiagnostic = await callMain([], {
    transform: () => (fd) => { assert.equal(fd, 2); throw new Error('stderr-probe'); },
  });
  assert.equal(failedDiagnostic.status, 2); assert.equal(failedDiagnostic.stdout.length, 0);
  assert.deepEqual(await identity(input), inputBefore);
});

test('four bounded real CLI calls list, recover, preserve occupied output and reject a bad complete backup', async (t) => {
  const requested = process.env.TASTETABLE_COLLECTION_RECOVERY_ARTIFACT_DIR;
  let directory;
  if (requested) { directory = path.resolve(requested); await fs.mkdir(directory); }
  else { directory = await scratch(t); }
  const input = path.join(directory, 'fictional collection 雪.json');
  const invalid = path.join(directory, 'invalid collection.json');
  const recovered = path.join(directory, 'recovered week 雪.json');
  const refused = path.join(directory, 'must remain absent.json');
  await fs.writeFile(input, BACKUP_TEXT, { flag: 'wx' });
  await fs.writeFile(invalid, backupWith((v) => { v.records[1].text = '{broken unselected week'; }), { flag: 'wx' });
  await fs.writeFile(path.join(directory, 'expected stored week.json'), WEEK_TEXT, { flag: 'wx' });
  const before = { input: await identity(input), invalid: await identity(invalid) };
  const childRecords = [];
  async function child(label, args) {
    const childDirectory = path.join(directory, label);
    await fs.mkdir(childDirectory);
    const argv = [TOOL, ...args];
    const intent = { executable: process.execPath, argv, cwd: directory, timeout_ms: 10000, max_buffer: 2 * 1024 * 1024 };
    await fs.writeFile(path.join(childDirectory, 'intent.json'), JSON.stringify(intent, null, 2) + '\n', { flag: 'wx' });
    const started = process.hrtime.bigint();
    const result = spawnSync(process.execPath, argv, { cwd: directory, timeout: 10000, maxBuffer: 2 * 1024 * 1024 });
    const stdout = result.stdout ?? Buffer.alloc(0), stderr = result.stderr ?? Buffer.alloc(0);
    const record = { ...intent, pid: result.pid, status: result.status, signal: result.signal,
      error: result.error ? { name: result.error.name, message: result.error.message, code: result.error.code } : null,
      duration_ms: Number(process.hrtime.bigint() - started) / 1e6,
      stdout: { bytes: stdout.length, sha256: sha(stdout) }, stderr: { bytes: stderr.length, sha256: sha(stderr) } };
    // Retain complete raw streams and process outcome before assertions.
    await fs.writeFile(path.join(childDirectory, 'stdout.bin'), stdout, { flag: 'wx' });
    await fs.writeFile(path.join(childDirectory, 'stderr.bin'), stderr, { flag: 'wx' });
    await fs.writeFile(path.join(childDirectory, 'result.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    childRecords.push({ label, ...record });
    assert.equal(record.error, null, label); assert.equal(record.signal, null, label);
    return { status: result.status, stdout, stderr };
  }
  try {
    const listed = await child('01-list', ['--input', input]);
    assert.equal(listed.status, 0); assert.equal(listed.stderr.length, 0);
    assert.deepEqual(listed.stdout, Buffer.from(INDEX_TEXT));
    await fs.writeFile(path.join(directory, 'observed-index.json'), listed.stdout, { flag: 'wx' });
    const restored = await child('02-recover', ['--input', input, '--id', 'week_zeta_01', '--output', recovered]);
    assert.equal(restored.status, 0); assert.equal(restored.stderr.length, 0);
    assert.deepEqual(await fs.readFile(recovered), Buffer.from(WEEK_TEXT));
    const expectedReceipt = {
      format: 'tastetable.collection-week-recovery.v1', input: path.resolve(input),
      inputSha256: '4b15dbb1104ce101a44d492238509c151b7e435ba448fb306b55693b13ed46ff',
      output: path.resolve(recovered), outputBytes: 1362,
      outputSha256: 'f54b1e2e964dca024a76c4eca1cd5918f567688b5e6087719747111b2662c7cb',
      record: EXPECTED_INDEX.records[0],
    };
    assert.deepEqual(restored.stdout, Buffer.from(JSON.stringify(expectedReceipt, null, 2) + '\n'));
    assert.deepEqual(Object.keys(JSON.parse(restored.stdout)), RECEIPT_KEYS);
    await fs.writeFile(path.join(directory, 'observed-recovery-receipt.json'), restored.stdout, { flag: 'wx' });
    const createdBefore = await identity(recovered);
    const occupied = await child('03-occupied', ['--input', input, '--id', 'week_zeta_01', '--output', recovered]);
    assert.equal(occupied.status, 2); assert.equal(occupied.stdout.length, 0); assert.ok(occupied.stderr.length > 0);
    assert.deepEqual(await identity(recovered), createdBefore);
    const bad = await child('04-invalid', ['--input', invalid, '--id', 'week_zeta_01', '--output', refused]);
    assert.equal(bad.status, 2); assert.equal(bad.stdout.length, 0); assert.ok(bad.stderr.length > 0);
    assert.equal(existsSync(refused), false);
    assert.deepEqual({ input: await identity(input), invalid: await identity(invalid) }, before);
    assert.deepEqual(childRecords.map((r) => r.status), [0, 0, 2, 2]);
  } finally {
    const summary = { schema: 'tastetable.collection-recovery.independent-cli/1',
      fixture_origin: 'Handwritten fictional backup and literal expected stored text; no provider or browser calls',
      before, after: { input: await identity(input), invalid: await identity(invalid) }, children: childRecords,
      recovered: existsSync(recovered) ? await identity(recovered) : null,
      refused_output_exists: existsSync(refused) };
    await fs.writeFile(path.join(directory, 'test-artifact-summary.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
  }
});
