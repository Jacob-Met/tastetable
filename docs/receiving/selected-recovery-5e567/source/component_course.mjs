// Finite TasteTable143 component course. The separate native owner admits the
// browser/server, owns their complete lifetime, and supplies one retained CDP session.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const FIXTURES = Object.freeze({
  'initial-records.json': [32633,'aa29653a619579b13f0662f749fbaab90e89e814e69c01c2fd4c4037e21900ab'],
  'mixed-backup.json': [66480,'1d5809777396524a0b789c49429e3cf88f444eadb8665659aa30735e08c4aeb2'],
  'stale-backup.json': [16473,'b7dd5124f3539681fcf39c969b318131bfefb80ce4e60a73c1ef16da806db111'],
  'replacement-identical-backup.json': [16454,'424cdc8c3c278bd6d119133d648dfa38a16b9f911a0bf95766b69a3bf7ff03a5'],
  'external-addition.json': [16319,'2b89248cbdd58ae0bce2d9b4c1f4fe6b78cefeb3cbf4930061ba3c54eadb8090'],
  'expected-after-selected.json': [66282,'500900f9022dd89741ce5ff0b4b7e8147906c680db08e6322b22bb5a96bd0a9f'],
  'expected-after-stale-refusal.json': [82620,'174cfec2013ad7c9de1c4a95f7cb2597b7bf498d12f51de7a04cf94b5d479fb8']
});
const FIELDS = ['format','version','id','name','createdAt','updatedAt','text'].sort();
const HOST = {
  selectedID:'selected_A',dirtyRename:'Retained unsaved rename',search:'unchanged',
  order:'name',activeWeek:'original fictional week',venueNotes:'original fictional notes'
};
const DATABASE = 'hamon.tastetable143.5e5670099628.component-v1';
const TITLE = 'TasteTable — isolated saved-week recovery fixture';
const byID = (a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const control = (view,id) => {
  const rows=view.controls.filter(row=>row.id===id); assert.equal(rows.length,1); return rows[0];
};
function recordsExactly(actual, expected) {
  assert(Array.isArray(actual));
  assert.equal(actual.length,expected.length);
  for (const row of actual) {
    assert(row && typeof row==='object' && !Array.isArray(row));
    assert.deepEqual(Object.keys(row).sort(),FIELDS);
  }
  assert.deepEqual([...actual].sort(byID),[...expected].sort(byID));
}
function checkboxesExactly(view, ids, selected) {
  assert.deepEqual(view.checkboxes.map(row=>row.value),ids);
  for (const row of view.checkboxes) {
    assert.equal(row.type,'checkbox'); assert.equal(row.disabled,false);
    assert.equal(row.visible,true); assert.equal(row.checked,selected.includes(row.value));
    assert.equal(row.labels.length,1); assert(row.labels[0].includes(' · ID '+row.value));
    assert(row.box.width>0 && row.box.height>0 && row.labelBox.width>0 && row.labelBox.height>0);
  }
}
function selectedSummary(selected,current) {
  return selected+' missing selected; '+current+' currently saved; '+(current+selected)+
    ' after this selected addition. Other backup records are excluded.';
}
export async function runComponentCourse({root,page,call,evaluate,settle,timeLeft,receipt}) {
  assert.match(page,/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/$/);
  assert(Number(new URL(page).port)<=65535);
  const before={}, fixture={};
  for (const [name,[bytes,digest]] of Object.entries(FIXTURES)) {
    const file=path.join(root,'fixtures',name);
    const raw=fs.readFileSync(file);
    assert.equal(raw.length,bytes); assert.equal(sha(raw),digest);
    before[name]=raw; fixture[name]=JSON.parse(raw.toString('utf8'));
  }
  assert.deepEqual(fixture['mixed-backup.json'].records.map(x=>x.id),
    ['selected_D','selected_A','selected_B','selected_C']);
  receipt.component={schema:'hamon.tastetable143.component-course/1',page,database:DATABASE,
    fixtures:FIXTURES,observations:[],actions:[],captures:[],storage:[],externalWriter:null,
    outcome:'FAIL',boundary:'Real component UI/store only. File admission uses CDP DOM.setFileInputFiles; this does not exercise the operating-system file chooser. Native keyboard events and IndexedDB are required. Full application, provider and caregiver campaign are outside this course.'};
  const course=receipt.component;
  const observeExpression='(() => { const f=window.taste143Fixture, status=document.getElementById("fixtureState"), phase=status?.dataset.state ?? null; return {location:location.href,ready:document.readyState,schema:f?.schema ?? null,database:f?.databaseName ?? null,phase,status:status?.textContent ?? null,view:phase==="ready"&&f?f.snapshotDOM():null}; })()';
  async function observe(label, allowStarting=false) {
    timeLeft(); assert(course.observations.length<120);
    const value=await evaluate(observeExpression);
    course.observations.push({label,value});
    assert.equal(value.location,page);
    if (value.phase==='failed') throw new Error('Component fixture failed: '+value.status);
    if (allowStarting && (value.ready!=='complete' || !value.view ||
        value.view.fixtureState==='starting')) return null;
    assert.equal(value.ready,'complete');
    assert.equal(value.schema,'hamon.tastetable143.component-observation/1');
    assert.equal(value.database,DATABASE);
    const view=value.view;
    assert(view); assert.equal(view.fixtureError,null); assert.equal(view.fixtureState,'ready');
    assert.equal(view.title,TITLE); assert.equal(view.state.disposed,false);
    assert.deepEqual(view.host,HOST);
    return view;
  }
  async function waitFor(label,predicate,allowStarting=false) {
    for (let attempt=0;attempt<40;attempt++) {
      const view=await observe(label+'-'+attempt,allowStarting);
      if (view && predicate(view)) return view;
      await new Promise(resolve=>setTimeout(resolve,Math.min(100,timeLeft())));
    }
    throw new Error('Observed state deadline: '+label);
  }
  const idle=view=>view.state.ready && !view.state.busy && view.pendingActions===0;
  async function readStorage(label,expected) {
    const rows=await evaluate('window.taste143Fixture.readStorage()',true);
    assert(Array.isArray(rows));
    for (const row of rows) {
      assert.deepEqual(Object.keys(row).sort(),['draft','id']);
      assert.equal(row.id,row.draft.id);
    }
    recordsExactly(rows.map(row=>row.draft),expected);
    course.storage.push({label,rows});
  }
  async function key(key,shift=false) {
    assert(['Tab',' '].includes(key)); assert(course.actions.length<80);
    const spec={key,code:key==='Tab'?'Tab':'Space',windowsVirtualKeyCode:key==='Tab'?9:32,
      nativeVirtualKeyCode:key==='Tab'?9:32,modifiers:shift?8:0,autoRepeat:false,isKeypad:false,isSystemKey:false};
    const action={kind:'native-key',key,shift,before:course.observations.length-1};
    course.actions.push(action);
    action.down=await call('Input.dispatchKeyEvent',{...spec,type:'keyDown',...(key===' '?{text:' ',unmodifiedText:' '}:{})});
    action.up=await call('Input.dispatchKeyEvent',{...spec,type:'keyUp'});
    await settle();
    const view=await observe('after-key-'+course.actions.length);
    action.after=course.observations.length-1;
    return view;
  }
  function isFocus(view,identity) {
    return identity.startsWith('selected_')
      ? view.active.tag==='INPUT' && view.active.value===identity &&
        view.checkboxes.some(row=>row.value===identity && row.focused)
      : view.active.id===identity;
  }
  async function focusByTab(identity,{backward=false}={}) {
    let view=await observe('focus-search-'+identity);
    for (let attempt=0;attempt<12;attempt++) {
      if (isFocus(view,identity)) return view;
      view=await key('Tab',backward);
    }
    assert(isFocus(view,identity),'Keyboard could not reach '+identity+' within twelve Tab presses');
    return view;
  }
  async function select(id,ids,selected,current,{backward=false}={}) {
    const beforeView=await focusByTab(id,{backward});
    checkboxesExactly(beforeView,ids,selected);
    assert(!selected.includes(id));
    const view=await key(' ');
    checkboxesExactly(view,ids,[...selected,id]);
    assert(isFocus(view,id));
    assert.equal(view.selectionSummary,selectedSummary(selected.length+1,current));
    assert.equal(control(view,'addSelectedMissingSavedWeeks').disabled,false);
    return view;
  }
  async function activate(id) {
    const view=await focusByTab(id);
    const c=control(view,id); assert.equal(c.disabled,false); assert.equal(c.visible,true);
    return await key(' ');
  }
  async function openFile(name,expectedIDs,rows,current) {
    assert(['mixed-backup.json','stale-backup.json','replacement-identical-backup.json'].includes(name));
    const view=await observe('before-file-'+name);
    assert(idle(view)); assert.equal(control(view,'collectionBackupFile').disabled,false);
    const doc=await call('DOM.getDocument',{depth:0});
    assert(Number.isInteger(doc.root.nodeId) && doc.root.nodeId>0);
    const node=await call('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#collectionBackupFile'});
    assert(Number.isInteger(node.nodeId) && node.nodeId>0);
    const action={kind:'real-file-input',name,nodeId:node.nodeId,before:course.observations.length-1};
    course.actions.push(action);
    action.result=await call('DOM.setFileInputFiles',{nodeId:node.nodeId,files:[path.join(root,'fixtures',name)]});
    const after=await waitFor('preview-'+name,v=>idle(v) && v.previewVisible &&
      v.completeRows.length===rows && JSON.stringify(v.checkboxes.map(x=>x.value))===JSON.stringify(expectedIDs));
    action.after=course.observations.length-1;
    checkboxesExactly(after,expectedIDs,[]);
    assert.equal(after.selectionSummary,selectedSummary(0,current));
    assert.equal(control(after,'addSelectedMissingSavedWeeks').disabled,true);
    assert.equal(control(after,'cancelCollectionBackup').disabled,false);
    return after;
  }
  async function capture(name,width,height) {
    assert(course.captures.length<2);
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await settle();
    const view=await observe('capture-'+name);
    checkboxesExactly(view,['selected_D','selected_C'],['selected_D','selected_C']);
    assert(idle(view)); assert.equal(view.restoreCalls.length,0); assert.equal(view.refreshCount,1);
    assert.equal(control(view,'addMissingSavedWeeks').disabled,true);
    assert.equal(control(view,'addSelectedMissingSavedWeeks').disabled,false);
    assert.equal(view.selectionSummary,selectedSummary(2,2));
    await readStorage('before-capture-'+name,fixture['initial-records.json']);
    assert.equal(view.viewport.width,width); assert.equal(view.viewport.height,height);
    const layout=await call('Page.getLayoutMetrics');
    const content=layout.cssContentSize;
    assert(content);
    const clip={x:0,y:0,width:Math.ceil(content.width),height:Math.ceil(content.height),scale:1};
    assert(clip.width>0 && clip.width<=1600 && clip.height>0 && clip.height<=4096);
    const result=await call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:true,clip});
    assert.match(result.data,/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
    const raw=Buffer.from(result.data,'base64');
    assert(raw.length>24 && raw.length<=8*1024*1024);
    assert.equal(raw.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(raw.readUInt32BE(16),clip.width); assert.equal(raw.readUInt32BE(20),clip.height);
    fs.writeFileSync(path.join(root,name),raw,{flag:'wx'});
    course.captures.push({name,bytes:raw.length,sha256:sha(raw),clip,layout,
      observation:course.observations.length-1,documentOverflow:view.viewport.documentWidth>width});
    // Preserve the original capture before an overflow assertion, for actual visual review.
    assert(view.viewport.documentWidth<=width,'Component has horizontal document overflow at '+width);
  }
  try {
    let view=await waitFor('ready',v=>idle(v) && v.fixtureState==='ready',true);
    assert.equal(view.refreshCount,1); assert.equal(view.restoreCalls.length,0);
    assert.equal(view.previewVisible,false); assert.equal(view.checkboxes.length,0);
    await readStorage('seed-A-B',fixture['initial-records.json']);

    view=await openFile('mixed-backup.json',['selected_D','selected_C'],4,2);
    const expectedRows=fixture['mixed-backup.json'].records.map((row,i)=>
      row.name+' · ID '+row.id+' · created '+row.createdAt+' · updated '+row.updatedAt+
      ' · week of 2026-12-28 · '+['Missing','Conflicting','Already identical','Missing'][i]+
      (i===1?' · Existing: Current A, updated 2026-10-14T04:00:00.000Z.':''));
    assert.deepEqual(view.completeRows,expectedRows);
    assert.equal(control(view,'addMissingSavedWeeks').disabled,true);
    assert.equal(view.summary,'2 missing · 1 already identical · 1 conflicting. 2 currently saved; 4 after adding missing records. Backup created 2026-10-14T04:00:00.000Z.');
    assert.deepEqual(view.checkboxes.map(x=>x.labels[0]),[
      ' Missing D · ID selected_D',' <literal> café 雪 & "C" · ID selected_C']);
    await select('selected_C',['selected_D','selected_C'],[],2);
    await select('selected_D',['selected_D','selected_C'],['selected_C'],2,{backward:true});
    await capture('01-selected-desktop.png',1280,960);
    await capture('02-selected-narrow.png',390,844);
    await call('Emulation.setDeviceMetricsOverride',{width:1280,height:960,deviceScaleFactor:1,mobile:false});
    await settle();
    await activate('addSelectedMissingSavedWeeks');
    view=await waitFor('selected-commit',v=>idle(v) && !v.previewVisible && v.restoreCalls.length===1);
    assert.equal(view.refreshCount,2); assert.equal(view.checkboxes.length,0);
    assert.equal(control(view,'addSelectedMissingSavedWeeks').disabled,true);
    assert.equal(view.status,'Added 2 selected missing saved weeks. Other backup records were not added or resolved. The active week and venue notes are unchanged. Your saved-name search may hide added records.');
    const first=view.restoreCalls[0];
    assert.deepEqual(first.backup,{format:fixture['mixed-backup.json'].format,
      savedAt:fixture['mixed-backup.json'].savedAt,
      records:[fixture['mixed-backup.json'].records[0],fixture['mixed-backup.json'].records[3]]});
    assert.deepEqual(first.expected,fixture['initial-records.json']);
    await readStorage('selected-A-B-C-D',fixture['expected-after-selected.json']);

    await openFile('stale-backup.json',['selected_F'],1,4);
    await select('selected_F',['selected_F'],[],4);
    course.externalWriter={before:course.observations.length-1,
      result:await evaluate('window.taste143Fixture.addExternalRecord()',true)};
    assert.deepEqual(course.externalWriter.result,fixture['external-addition.json']);
    view=await observe('external-E-committed-stale-F-retained');
    checkboxesExactly(view,['selected_F'],['selected_F']);
    assert.equal(view.selectionSummary,selectedSummary(1,4));
    assert.equal(view.refreshCount,2); assert.equal(view.restoreCalls.length,1);
    assert.equal(view.events.filter(x=>x.kind==='external-writer-committed').length,1);
    course.externalWriter.after=course.observations.length-1;
    await readStorage('external-E-before-stale-action',fixture['expected-after-stale-refusal.json']);
    await activate('addSelectedMissingSavedWeeks');
    view=await waitFor('stale-refused',v=>idle(v) && !v.previewVisible && v.restoreCalls.length===2);
    assert.equal(view.refreshCount,2); assert.equal(view.checkboxes.length,0);
    assert.equal(control(view,'addSelectedMissingSavedWeeks').disabled,true);
    assert.equal(view.status,'Could not add selected missing saved weeks: Saved weeks changed since this preview. Open the backup again before adding anything. Open the backup again to review current storage.');
    assert.deepEqual(view.restoreCalls[1].backup,fixture['stale-backup.json']);
    assert.deepEqual(view.restoreCalls[1].expected,fixture['expected-after-selected.json']);
    await readStorage('stale-F-absent',fixture['expected-after-stale-refusal.json']);

    await openFile('stale-backup.json',['selected_F'],1,5);
    await select('selected_F',['selected_F'],[],5);
    await activate('cancelCollectionBackup');
    view=await waitFor('cancelled',v=>idle(v) && !v.previewVisible);
    assert.equal(view.status,'Collection preview cancelled. Nothing was changed.');
    assert.equal(view.checkboxes.length,0); assert.equal(view.restoreCalls.length,2);
    assert.equal(control(view,'cancelCollectionBackup').disabled,true);
    assert.equal(control(view,'addSelectedMissingSavedWeeks').disabled,true);

    view=await openFile('replacement-identical-backup.json',[],1,5);
    assert.equal(view.completeRows[0],'Current B identical · ID selected_B · created 2026-10-14T04:00:00.000Z · updated 2026-10-14T04:00:00.000Z · week of 2026-12-28 · Already identical');
    assert.equal(view.summary,'0 missing · 1 already identical · 0 conflicting. 5 currently saved; 5 after adding missing records. Backup created 2026-10-14T04:00:00.000Z.');
    assert.equal(view.status,'No missing records to add. Nothing was changed.');
    assert.equal(control(view,'addMissingSavedWeeks').disabled,true);
    assert.equal(control(view,'addSelectedMissingSavedWeeks').disabled,true);
    assert.equal(view.restoreCalls.length,2); assert.equal(view.refreshCount,2);
    assert.equal(view.events.filter(x=>x.kind==='restore-submitted').length,2);
    assert.equal(view.events.filter(x=>x.kind==='restore-committed').length,1);
    assert.equal(view.events.filter(x=>x.kind==='restore-refused').length,1);
    assert.equal(view.events.filter(x=>x.kind==='action-start').length,2);
    assert.equal(view.events.filter(x=>x.kind==='action-finished').length,2);
    assert.deepEqual(view.events.map(x=>x.kind),[
      'initial-seed-committed','refresh','action-start','restore-submitted','restore-committed',
      'refresh','action-finished','external-writer-start','external-writer-committed',
      'action-start','restore-submitted','restore-refused','action-finished']);
    assert.deepEqual(view.events.filter(x=>x.kind==='restore-committed'),
      [{kind:'restore-committed',added:2,alreadyPresent:0}]);
    await readStorage('replacement-left-A-B-C-D-E-exact',fixture['expected-after-stale-refusal.json']);
    assert.equal(course.captures.length,2);
    assert.equal(course.actions.filter(x=>x.kind==='real-file-input').length,4);
    timeLeft();
    course.outcome='PASS';
    return course;
  } finally {
    course.fixturesUnchanged=true;
    for (const [name,raw] of Object.entries(before)) {
      try { if (!fs.readFileSync(path.join(root,'fixtures',name)).equals(raw)) course.fixturesUnchanged=false; }
      catch(error) { course.fixturesUnchanged=false; course.fixturePreservationError=String(error); }
    }
    if (!course.fixturesUnchanged) course.outcome='FAIL';
    assert.equal(course.fixturesUnchanged,true);
  }
}

