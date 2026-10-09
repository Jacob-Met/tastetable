import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const digest = text => createHash('sha256').update(text).digest('hex');
const copy = value => structuredClone(value);
const quote = value => JSON.stringify(value).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const fields = ['outcome','date','note'];
const baseCounts = {total:5,changed:4,unchanged:1,outcomeChanged:2,dateChanged:2,noteChanged:2};
const beforeName = 'Earlier "caption"\u2028', afterName = 'Later 表\u2029';
const beforeSaved = '2030-01-01T00:00:00.000Z', afterSaved = '2020-01-01T00:00:00.000Z';
const sourceReceived = '2026-10-01T12:00:00.000Z', sourceSaved = '2026-10-02T12:00:00.000Z';
const literal = [
{key:'pick-0',originalDay:'Monday',plannedDay:'Wednesday',plannedDate:'2026-10-07',before:{outcome:'unrecorded',date:null,note:''},after:{outcome:'went',date:'2026-10-04',note:' dinner\t🍜\nLiteral <script>&"  '},changedFields:['outcome','date','note']},
{key:'pick-1',originalDay:'Tuesday',plannedDay:'Monday',plannedDate:'2026-10-05',before:{outcome:'went',date:'2026-10-07',note:'same'},after:{outcome:'went',date:'2026-10-07',note:'same'},changedFields:[]},
{key:'pick-2',originalDay:'Wednesday',plannedDay:null,plannedDate:null,before:{outcome:'did_not_go',date:null,note:'cancelled'},after:{outcome:'unrecorded',date:null,note:'cancelled'},changedFields:['outcome']},
{key:'pick-3',originalDay:'Thursday',plannedDay:'Sunday',plannedDate:'2026-10-11',before:{outcome:'went',date:'2026-10-11',note:'unchanged-note'},after:{outcome:'went',date:null,note:'unchanged-note'},changedFields:['date']},
{key:'pick-4',originalDay:'Saturday',plannedDay:'Friday',plannedDate:'2026-10-09',before:{outcome:'unrecorded',date:null,note:'e\u0301\r\n'},after:{outcome:'unrecorded',date:null,note:'é\n'},changedFields:['note']},
];
function deepFrozen(value) {
  if (value && typeof value === 'object') {
    assert.equal(Object.isFrozen(value),true);
    for (const child of Object.values(value)) deepFrozen(child);
  }
}
export function makeIndependentFixture({record,file,plan}, count=5) {
  const counts={picks:count,with_qloo_entity_id:count,with_affinity_evidence:0,constraint_checked:count,unsafe_candidates_rejected:0};
  const picks = Array.from({length:count},(_,index)=>({
    name:index<2?'Café "Loop"':index===4?'Park\u2029heading':'Venue '+index,
    why:index===1?'UNCHANGED_ONLY_EXPLANATION_91e8':index===0?'First\nSOURCE HEADING\u2028 <b>&"':'Reason '+index,
    entity_id:index<2?'venue:same':'venue:'+index,kind:index===4?'outing':'restaurant',
    day:['Monday','Tuesday','Wednesday','Thursday','Saturday'][index%5],
    unknown:{rank:index,evidence:[null,false,{literal:'source-'+index}]} ,
  }));
  const response={mock:true,plan:{meals:picks.filter(p=>p.kind==='restaurant'),outing:picks.find(p=>p.kind==='outing')??null,notes:['Original note'],rejected:[]},
    llm_only:{meals:[],outing:{name:'comparison only',why:'not a native pick',day:'Sunday'}},
    comparison:{constraints:['literal constraint'],grounded:counts,llm_only:counts},trace:[{tool:'fixture',args:null,result_summary:'synthetic original'}]};
  // For large cases keep the native order purely meal-based; the five-row case explicitly exercises its last outing.
  if(count!==5){for(const p of picks)p.kind='restaurant';response.plan.meals=picks;response.plan.outing=null;}
  let state=plan.createWeekPlan(response,'2026-10-05');
  if(count===5){for(const [i,day] of ['Wednesday','Monday',null,'Sunday','Friday'].entries())state=plan.setPickDay(state,'pick-'+i,day);}
  const original=file.makeWeekFile({response,inputs:{city:'Fixture city',cuisines:['x'],music:[],films:[],constraints:['literal constraint'],unknownInput:{retained:true}},state,receivedAt:sourceReceived,calendarId:null},new Date(sourceSaved)).text;
  const empty=record.createVisitRecord(original,beforeName);
  function saved(triples,name=beforeName,when=beforeSaved,reorder=false){
    let value=record.createVisitRecord(original,name);
    for(let i=0;i<triples.length;i++)value=record.updateVisitRecord(value,'pick-'+i,triples[i]);
    const text=record.makeVisitRecordFile(value,new Date(when)).text;
    if(!reorder)return text;
    const parsed=JSON.parse(text);parsed.visits.reverse();return JSON.stringify(parsed)+'\n';
  }
  return {original,picks,response,state,empty,saved};
}
export async function receive({api,record,file,plan}) {
  const groups=[],calls={compare:0,render:0},checks=[];
  const compare=(a,b)=>{calls.compare++;return api.compareVisitRecords(a,b);};
  const render=(a,b)=>{calls.render++;return api.renderVisitRecordComparisonText(a,b);};
  const fixture=makeIndependentFixture({record,file,plan});
  const a=fixture.saved(literal.map(x=>x.before),beforeName,beforeSaved,true);
  const b=fixture.saved(literal.map(x=>x.after),afterName,afterSaved,true);
  const pins={before:digest(a),after:digest(b),week:digest(fixture.original)};
  const expectedRows=literal.map((row,index)=>({...copy(row),pick:copy(fixture.picks[index])}));
  const expected={format:'tastetable.visit-record-comparison.v1',
    source:{weekText:fixture.original,weekStart:'2026-10-05',sourceMode:'mock',receivedAt:sourceReceived,savedAt:sourceSaved,constraints:['literal constraint']},
    before:{sourceName:beforeName,savedAt:beforeSaved},after:{sourceName:afterName,savedAt:afterSaved},counts:baseCounts,rows:expectedRows};
  const result=compare(a,b);assert.deepEqual(result,expected);deepFrozen(result);
  assert.equal(Object.getPrototypeOf(result),Object.prototype);
  assert.equal(result.rows[0].pick.entity_id,result.rows[1].pick.entity_id);
  assert.notEqual(result.rows[0].key,result.rows[1].key);
  assert.throws(()=>{result.rows[0].pick.unknown.rank=123;},TypeError);
  assert.deepEqual(compare(a,b),expected);
  groups.push('literal five-row complete result, duplicate occurrences, native source order and recursive immutability');
  const inverse=compare(b,a);const swapped=copy(expected);swapped.before=expected.after;swapped.after=expected.before;
  swapped.rows=expectedRows.map(row=>({...copy(row),before:copy(row.after),after:copy(row.before)}));
  assert.deepEqual(inverse,swapped);
  const metadata=fixture.saved(literal.map(x=>x.before),afterName,afterSaved);
  const onlyMeta=compare(a,metadata);assert.deepEqual(onlyMeta.counts,{total:5,changed:0,unchanged:5,outcomeChanged:0,dateChanged:0,noteChanged:0});
  assert.deepEqual(onlyMeta.before,expected.before);assert.deepEqual(onlyMeta.after,expected.after);
  assert.ok(onlyMeta.rows.every(row=>row.changedFields.length===0));
  const bomEnvelope=compare('\uFEFF'+a,b);assert.deepEqual(bomEnvelope,result);
  groups.push('caller reversal, metadata-only differences and outer-envelope BOM without chronology promotion');
  const single=makeIndependentFixture({record,file,plan},1);
  const pairs=[
    [{outcome:'went',date:'2024-02-29',note:'kept'},{outcome:'did_not_go',date:'2024-02-29',note:'kept'},['outcome']],
    [{outcome:'unrecorded',date:null,note:''},{outcome:'unrecorded',date:'0001-01-01',note:''},['date']],
    [{outcome:'did_not_go',date:'9999-12-31',note:'keep'},{outcome:'did_not_go',date:null,note:'keep'},['date']],
    [{outcome:'unrecorded',date:null,note:'e\u0301'},{outcome:'unrecorded',date:null,note:'é'},['note']],
    [{outcome:'unrecorded',date:null,note:'a\r\nb'},{outcome:'unrecorded',date:null,note:'a\nb'},['note']],
    [{outcome:'unrecorded',date:null,note:'a\rb'},{outcome:'unrecorded',date:null,note:'a\r\nb'},['note']],
    [{outcome:'went',date:'2026-10-05',note:'clear'},{outcome:'unrecorded',date:null,note:''},fields],
  ];
  for(const [oldValue,newValue,changedFields] of pairs){
    const r=compare(single.saved([oldValue]),single.saved([newValue]));
    assert.deepEqual(r.rows[0].before,oldValue);assert.deepEqual(r.rows[0].after,newValue);
    assert.deepEqual(r.rows[0].changedFields,changedFields);
    assert.deepEqual(r.counts,{total:1,changed:1,unchanged:0,outcomeChanged:+changedFields.includes('outcome'),dateChanged:+changedFields.includes('date'),noteChanged:+changedFields.includes('note')});
  }
  groups.push('independent field transitions, clears, date boundaries and exact Unicode/CR/CRLF/LF comparison');
  const variantWeek=change=>{const parsed=JSON.parse(fixture.original);change(parsed);return JSON.stringify(parsed,null,2)+'\n';};
  const variants=[
    ['trailing whitespace',fixture.original+' '],
    ['source BOM','\uFEFF'+fixture.original],
    ['CRLF',fixture.original.replace(/\n/g,'\r\n')],
    ['arrangement',variantWeek(v=>{v.week.assignments['pick-0']='Monday';})],
    ['input',variantWeek(v=>{v.inputs.city='Elsewhere';})],
    ['unknown response metadata',variantWeek(v=>{v.response.plan.meals[0].unknown.rank=99;})],
    ['source saved timestamp',variantWeek(v=>{v.savedAt='2026-10-03T12:00:00.000Z';})],
    ['source received timestamp',variantWeek(v=>{v.receivedAt='2026-09-30T12:00:00.000Z';})],
  ];
  for(const [name,week] of variants){
    file.readWeekFile(week);
    const alternate=record.makeVisitRecordFile(record.createVisitRecord(week,'different original'),new Date(afterSaved)).text;
    for(const pair of [[a,alternate],[alternate,a]])assert.throws(()=>compare(...pair),error=>error instanceof TypeError&&/same|original|source/i.test(error.message),name);
    assert.throws(()=>render(a,alternate),TypeError,name);
  }
  groups.push('eight independently admitted different originals refused in both caller orders');
  const zero=makeIndependentFixture({record,file,plan},0);
  const z=compare(zero.saved([]),zero.saved([],afterName,afterSaved));
  assert.deepEqual(z.rows,[]);assert.deepEqual(z.counts,{total:0,changed:0,unchanged:0,outcomeChanged:0,dateChanged:0,noteChanged:0});
  const hundred=makeIndependentFixture({record,file,plan},100);
  const blanks=Array.from({length:100},()=>({outcome:'unrecorded',date:null,note:''}));
  const changed=copy(blanks);changed[99]={outcome:'did_not_go',date:null,note:'last only'};
  const hr=compare(hundred.saved(blanks),hundred.saved(changed));
  assert.equal(hr.rows.length,100);assert.deepEqual(hr.rows.map(x=>x.key),Array.from({length:100},(_,i)=>'pick-'+i));
  assert.deepEqual(hr.counts,{total:100,changed:1,unchanged:99,outcomeChanged:1,dateChanged:0,noteChanged:1});
  assert.deepEqual(hr.rows[99].after,changed[99]);assert.throws(()=>makeIndependentFixture({record,file,plan},101),TypeError);
  groups.push('zero and100 original occurrences, explicit unrecorded values and101-producer refusal');
  const altered=fn=>{const value=JSON.parse(a);fn(value);return JSON.stringify(value)+'\n';};
  const bad=[
    ['nonstring',null],['JSON','{'],['format',altered(v=>{v.format='other';})],
    ['noncanonical timestamp',altered(v=>{v.savedAt='2026-01-01';})],
    ['unknown envelope field',altered(v=>{v.extra=true;})],
    ['missing visit',altered(v=>{v.visits.pop();})],
    ['repeated key',altered(v=>{v.visits[0].key=v.visits[1].key;})],
    ['unknown key',altered(v=>{v.visits[0].key='pick-999';})],
    ['outcome',altered(v=>{v.visits[0].outcome='assumed';})],
    ['impossible date',altered(v=>{v.visits[0].date='2025-02-29';})],
    ['note control',altered(v=>{v.visits[0].note='\u0000';})],
    ['lone surrogate',altered(v=>{v.visits[0].note='\ud800';})],
    ['embedded invalid week',altered(v=>{v.source.weekText='{}';})],
    ['extra visit field',altered(v=>{v.visits[0].more='not admitted';})],
    ['invalid source name',altered(v=>{v.source.name='bad\nname';})],
  ];
  for(const [name,text] of bad){
    let originalError;try{record.readVisitRecord(text);}catch(error){originalError=error;}
    assert.ok(originalError,name+' must independently refuse');
    for(const pair of [[text,b],[a,text]]){
      assert.throws(()=>compare(...pair),error=>error.constructor===originalError.constructor&&error.message===originalError.message,name);
      assert.throws(()=>render(...pair),error=>error.constructor===originalError.constructor&&error.message===originalError.message,name);
    }
  }
  groups.push('fifteen complete-record refusals preserve native admission on both API sides and renderer');
  const report=render(a,b);assert.equal(typeof report,'string');assert.ok(report.endsWith('\n'));
  for(const value of [beforeName,afterName,beforeSaved,afterSaved,'mock','2026-10-05',sourceReceived,sourceSaved])assert.ok(report.includes(quote(value)),'quoted metadata '+quote(value));
  for(const row of expectedRows.filter(row=>row.changedFields.length)){
    for(const value of [row.key,row.pick.name,row.pick.entity_id,row.pick.why,row.plannedDate,...fields.map(field=>row.before[field]),...fields.map(field=>row.after[field])])assert.ok(report.includes(quote(value)),'quoted changed content '+quote(value));
  }
  assert.ok(!report.includes('UNCHANGED_ONLY_EXPLANATION_91e8'));
  assert.ok(!report.includes('\u2028')&&!report.includes('\u2029'));
  assert.ok(!report.includes('\nSOURCE HEADING'));
  assert.ok(!report.includes('\nLiteral <script>'));
  assert.match(report,/before/i);assert.match(report,/after/i);
  for(const field of fields)assert.match(report,new RegExp(field+'[^\\n]*2|2[^\\n]*'+field,'i'));
  const unchangedReport=render(a,metadata);assert.match(unchangedReport,/(?:no|zero|0)[^\n]*chang|chang[^\n]*(?:no|zero|0)/i);
  assert.ok(!unchangedReport.includes('UNCHANGED_ONLY_EXPLANATION_91e8'));
  const emptyReport=render(zero.saved([]),zero.saved([]));assert.match(emptyReport,/(?:no|zero|0)[^\n]*chang|chang[^\n]*(?:no|zero|0)/i);
  groups.push('literal JSON-quoted report, separator/injection controls, complete changed triples and explicit no changes');
  assert.deepEqual({before:digest(a),after:digest(b),week:digest(fixture.original)},pins);
  checks.push({literalCounts:result.counts,sourcePins:pins,refusals:bad.length,identityVariants:variants.length,fieldPairs:pairs.length,maximumRows:100,reportBytes:Buffer.byteLength(report),reportSha256:digest(report)});
  return {format:'tastetable-visit-comparison-peer/1',pass:true,node:process.version,platform:process.platform,groups,calls,checks,
    boundary:'Exact module source via declared in-memory path loader. No ordinary-file CLI admission, browser or Actions execution.',
    fixtures:{before:a,after:b,commonWeek:fixture.original,report,unchangedReport,emptyReport}};
}
