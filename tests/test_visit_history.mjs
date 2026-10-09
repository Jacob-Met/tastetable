import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures/visit-history-a219f250962c.mjs";
import { readVisitRecord } from "../static/visit_record.mjs";
import { createVisitHistory, previewHistoryAddition, acceptHistoryAddition, removeHistoryFile,
  filterVisitHistory, overlappingHistoryFiles } from "../static/visit_history.mjs";
const input = (text, name = "visits.json") => ({ name, text });
const add = (history, inputs) => acceptHistoryAddition(history, previewHistoryAddition(history, inputs));
const sample = fixture();
test("existing native codec receives the fixture and preserves its BOM/CRLF source", () => {
  assert.equal(readVisitRecord(sample.text).record.source.weekText, sample.weekText);
});
test("preview is immutable and has no collection effect until explicit acceptance", () => {
  const old = createVisitHistory(), preview = previewHistoryAddition(old, [input(sample.text)]);
  assert.equal(old.files.length, 0); assert.equal(preview.added.length, 1);
  assert.throws(() => preview.added[0].rows[0].note = "changed", TypeError);
  assert.equal(acceptHistoryAddition(old, preview).files.length, 1);
});
test("renamed exact byte duplicates skip visibly; BOM and whitespace differences remain separate", () => {
  let h = add(createVisitHistory(), [input(sample.text, "first.json")]);
  const p = previewHistoryAddition(h, [input(sample.text, "renamed.json"), input("\uFEFF" + sample.text, "BOM.json"), input(sample.text + " ", "space.json")]);
  assert.deepEqual(p.duplicates, [{name:"renamed.json",existingId:"record-1",existingName:"first.json"}]);
  h = acceptHistoryAddition(h,p); assert.equal(h.files.length,3);
  assert.equal(h.files[1].text,"\uFEFF"+sample.text);
  assert.deepEqual(overlappingHistoryFiles(h), ["record-1","record-2","record-3"]);
});
test("same-selection duplicates produce one file and no added occurrence count", () => {
  const p=previewHistoryAddition(createVisitHistory(),[input(sample.text,"a"),input(sample.text,"b")]);
  assert.equal(p.added.length,1); assert.equal(p.duplicates.length,1);
  assert.equal(filterVisitHistory(p.next).length,3);
});
test("same source with conflicting outcomes and inverted saved times keeps both versions", () => {
  const revision=fixture({outcome:"did_not_go",savedAt:"2020-01-01T00:00:00.000Z"});
  const h=add(createVisitHistory(),[input(sample.text),input(revision.text)]);
  assert.deepEqual(filterVisitHistory(h).filter(x=>x.row.key==="pick-0").map(x=>x.row.outcome),["went","did_not_go"]);
  assert.equal(new Set(filterVisitHistory(h).map(x=>x.file.id+":"+x.row.key)).size,6);
  assert.deepEqual(overlappingHistoryFiles(h),["record-1","record-2"]);
});
test("different weeks never merge repeated venue IDs or reused occurrence keys", () => {
  const h=add(createVisitHistory(),[input(sample.text),input(fixture({start:"2026-10-19"}).text)]);
  assert.equal(filterVisitHistory(h).length,6); assert.equal(overlappingHistoryFiles(h).length,0);
  assert.deepEqual(h.files.map(f=>f.weekStart),["2026-10-12","2026-10-19"]);
});
test("default contains undated and omitted; recorded dates do not imply went", () => {
  const h=add(createVisitHistory(),[input(sample.text)]), rows=filterVisitHistory(h);
  assert.equal(rows.length,3); assert.equal(rows[1].row.plannedDate,null);
  assert.equal(rows[1].row.outcome,"unrecorded"); assert.equal(rows[1].row.date,"2024-02-29");
  assert.equal(rows[2].row.date,null);
  assert.deepEqual(filterVisitHistory(h,{outcome:"went"}).map(x=>x.row.key),["pick-0"]);
});
test("entered date range is inclusive, leap-safe, and separate from saved/planned dates", () => {
  const h=add(createVisitHistory(),[input(sample.text)]);
  assert.deepEqual(filterVisitHistory(h,{from:"2024-02-29",to:"2024-02-29"}).map(x=>x.row.key),["pick-1"]);
  assert.equal(filterVisitHistory(h,{from:"2026-10-18",to:"2026-10-18"}).length,0);
  assert.deepEqual(filterVisitHistory(h,{datePresence:"undated"}).map(x=>x.row.key),["pick-2"]);
  for(const opts of [{from:"2023-02-29"},{from:"0000-01-01"},{from:"2026-02-30"},{from:"2026-02-01",to:"2025-01-01"},{datePresence:"undated",from:"2026-01-01"}]) assert.throws(()=>filterVisitHistory(h,opts));
});
test("literal Unicode note/name/source searches do not alter exact notes or source", () => {
  const h=add(createVisitHistory(),[input(sample.text,"<script>literal</script>.json")]);
  assert.equal(filterVisitHistory(h,{query:"cAFÉ"}).length,3);
  assert.equal(filterVisitHistory(h,{query:"<img"}).length,1);
  assert.equal(filterVisitHistory(h,{query:"<script>"}).length,3);
  assert.equal(filterVisitHistory(h,{query:"original-2026"}).length,3);
  assert.equal(h.files[0].rows[0].note,sample.record.visits[0].note);
  assert.equal(h.files[0].text,sample.text); assert.equal(h.files[0].weekText,sample.weekText);
  assert.throws(()=>filterVisitHistory(h,{query:"x".repeat(513)}));
});
test("date ordering keeps null last, stable ties, and does not mutate original order", () => {
  const h=add(createVisitHistory(),[input(sample.text),input(fixture({start:"2026-10-19"}).text)]);
  assert.deepEqual(filterVisitHistory(h,{order:"date_asc"}).map(x=>x.file.id+":"+x.row.key),
    ["record-1:pick-1","record-2:pick-1","record-1:pick-0","record-2:pick-0","record-1:pick-2","record-2:pick-2"]);
  assert.deepEqual(filterVisitHistory(h,{order:"date_desc"}).map(x=>x.row.key),["pick-0","pick-0","pick-1","pick-1","pick-2","pick-2"]);
  assert.equal(filterVisitHistory(h)[0].row.key,"pick-0");
});
test("one malformed file refuses the whole batch and preserves the original collection", () => {
  const h=add(createVisitHistory(),[input(sample.text)]);
  const before=JSON.stringify(h);
  assert.throws(()=>previewHistoryAddition(h,[input(fixture({start:"2026-10-19"}).text),input("{}")]));
  assert.equal(JSON.stringify(h),before);
  for(const bad of [new Array(1),[undefined],[],[input(sample.text,"\0bad")],[input(sample.text+"\ud800")]])
    assert.throws(()=>previewHistoryAddition(h,bad));
});
test("removal/clear/new acceptance retires stale previews and never reuses a removed ID", () => {
  const h=add(createVisitHistory(),[input(sample.text)]);
  const p=previewHistoryAddition(h,[input(fixture({start:"2026-10-19"}).text)]);
  const removed=removeHistoryFile(h,"record-1");
  assert.throws(()=>acceptHistoryAddition(removed,p));
  assert.throws(()=>acceptHistoryAddition(createVisitHistory(),p));
  const next=add(removed,[input(sample.text)]);
  assert.equal(next.files[0].id,"record-2");
  assert.throws(()=>acceptHistoryAddition(next,p)); assert.throws(()=>removeHistoryFile(next,"unknown"));
});
test("20 files/2000 rows are supported; a 21st distinct file refuses without effect", () => {
  const h=add(createVisitHistory(),Array.from({length:20},(_,i)=>input(fixture({count:100,savedAt:new Date(Date.UTC(2026,0,i+1)).toISOString()}).text,"record"+i)));
  assert.equal(h.files.length,20);assert.equal(filterVisitHistory(h).length,2000);
  assert.throws(()=>previewHistoryAddition(h,[input(fixture({count:100,savedAt:"2027-01-01T00:00:00.000Z"}).text)]));
  assert.equal(h.files.length,20);
  assert.throws(()=>previewHistoryAddition(createVisitHistory(),Array(21).fill(input(sample.text))));
});
test("byte limits count complete UTF-8 selection and retained collection", () => {
  assert.throws(()=>previewHistoryAddition(createVisitHistory(),[input(" ".repeat(8*1024*1024+1))]));
  const large=fixture({padding:"🙂".repeat(450000)}).text;
  const batches=Array.from({length:19},(_,i)=>input(large+" ".repeat(i),"large"+i));
  assert.throws(()=>previewHistoryAddition(createVisitHistory(),batches),/32 MiB/);
  const half=add(createVisitHistory(),batches.slice(0,9));
  assert.throws(()=>previewHistoryAddition(half,batches.slice(9)),/32 MiB/);
  assert.equal(half.files.length,9);
});
test("empty native records are retained as files with no invented entries", () => {
  const h=add(createVisitHistory(),[input(fixture({count:0}).text)]);
  assert.equal(h.files.length,1);assert.deepEqual(filterVisitHistory(h),[]);
});

test("original planned-week interval warns across BOM/reformatting, while adjacent weeks remain distinct", () => {
  const sourceBom=JSON.parse(sample.text); sourceBom.source.weekText=sourceBom.source.weekText.slice(1);
  const reformatted=JSON.parse(sample.text); reformatted.source.weekText=JSON.stringify(JSON.parse(reformatted.source.weekText.slice(1)));
  const h=add(createVisitHistory(),[input(sample.text),input(JSON.stringify(sourceBom)),input(JSON.stringify(reformatted)),input(fixture({start:"2026-10-19"}).text)]);
  assert.deepEqual(overlappingHistoryFiles(h),["record-1","record-2","record-3"]);
  assert.deepEqual(h.files.map(file=>[file.weekStart,file.weekEnd]),[["2026-10-12","2026-10-18"],["2026-10-12","2026-10-18"],["2026-10-12","2026-10-18"],["2026-10-19","2026-10-25"]]);
  assert.equal(filterVisitHistory(h).length,12);
});
