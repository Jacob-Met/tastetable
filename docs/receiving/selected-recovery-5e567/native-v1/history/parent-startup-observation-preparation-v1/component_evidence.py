"""Independent literal-fixture, actual protocol and component result joins; no app calls."""
from pathlib import Path
import base64,json,math
from component_support import ROOT,sha

FIELDS={'format','version','id','name','createdAt','updatedAt','text'}
HOST={'selectedID':'selected_A','dirtyRename':'Retained unsaved rename','search':'unchanged',
      'order':'name','activeWeek':'original fictional week','venueNotes':'original fictional notes'}
TITLE='TasteTable — isolated saved-week recovery fixture'
DATABASE='hamon.tastetable143.5e5670099628.component-v1'

def verify_component(course,protocol,page,check,capture_records,png_size):
    fixtures={name:json.loads((ROOT/'fixtures'/name).read_bytes()) for name in course['fixtures']}
    for name,pin in course['fixtures'].items():
        raw=(ROOT/'fixtures'/name).read_bytes()
        check('fixture whole '+name,[len(raw),sha(raw)]==pin)
    check('exact seven fixture closure',set(fixtures)=={
        'initial-records.json','mixed-backup.json','stale-backup.json',
        'replacement-identical-backup.json','external-addition.json',
        'expected-after-selected.json','expected-after-stale-refusal.json'})
    check('component result and real native boundary',course['schema']=='hamon.tastetable143.component-course/1' and
          course['outcome']=='PASS' and course['page']==page and course['database']==DATABASE and
          course['fixturesUnchanged'] is True)
    sends=[x['value'] for x in protocol if x['direction']=='send']
    replies={}
    for entry in protocol:
        value=entry['value']
        if entry['direction']=='receive' and 'id' in value:
            check('unique protocol response '+str(value['id']),value['id'] not in replies)
            replies[value['id']]=value
    def answer(request):
        response=replies.get(request['id'])
        check('whole successful correlated response '+str(request['id']),response is not None and
              response.get('sessionId')==request.get('sessionId') and 'error' not in response)
        return response['result']
    evaluates=[x for x in sends if x['method']=='Runtime.evaluate']
    returned=[]
    for request in evaluates:
        result=answer(request)
        check('evaluation has no exception '+str(request['id']),'exceptionDetails' not in result)
        if 'value' in result['result']:
            returned.append((request,result['result']['value']))
    observations=course['observations']
    check('bounded actual component observations',type(observations) is list and 1<=len(observations)<=120)
    observed_raw=[value for request,value in returned if 'snapshotDOM()' in request['params']['expression']]
    check('all saved observations equal ordered actual protocol values',observed_raw==[x['value'] for x in observations])
    views=[]
    for index,observation in enumerate(observations):
        value=observation['value'];view=value['view'];views.append(view)
        check('observation '+str(index)+' exact location and no fixture failure',
              value['location']==page and value['phase']!='failed')
        if view is None or view.get('fixtureState')=='starting':
            check('only initial ready wait may observe startup',observation['label'].startswith('ready-'))
            continue
        check('observation '+str(index)+' actual native host and sentinels',
              value['ready']=='complete' and value['phase']=='ready' and
              value['schema']=='hamon.tastetable143.component-observation/1' and
              value['database']==DATABASE and view['title']==TITLE and
              view['fixtureError'] is None and view['fixtureState']=='ready' and
              view['state']['disposed'] is False and view['host']==HOST)
    def control(view,name):
        matches=[x for x in view['controls'] if x['id']==name]
        check('one observed control '+name,len(matches)==1)
        return matches[0]
    def boxes(view,ids,selected):
        check('exact ordered missing checkbox identities', [x['value'] for x in view['checkboxes']]==ids)
        for row in view['checkboxes']:
            check('literal visible checkbox '+row['value'],row['type']=='checkbox' and
                  row['disabled'] is False and row['visible'] is True and
                  row['checked'] is (row['value'] in selected) and len(row['labels'])==1 and
                  ' · ID '+row['value'] in row['labels'][0] and
                  all(row[k]['width']>0 and row[k]['height']>0 for k in ('box','labelBox')))
    def records(actual,expected,label):
        check(label+' full native seven-field records',type(actual) is list and
              all(type(x) is dict and set(x)==FIELDS for x in actual) and
              sorted(actual,key=lambda x:x['id'])==sorted(expected,key=lambda x:x['id']))
    storage=course['storage']
    wanted_storage=[('seed-A-B','initial-records.json'),
        ('before-capture-01-selected-desktop.png','initial-records.json'),
        ('before-capture-02-selected-narrow.png','initial-records.json'),
        ('selected-A-B-C-D','expected-after-selected.json'),
        ('external-E-before-stale-action','expected-after-stale-refusal.json'),
        ('stale-F-absent','expected-after-stale-refusal.json'),
        ('replacement-left-A-B-C-D-E-exact','expected-after-stale-refusal.json')]
    check('seven storage observations in fixed order',[x['label'] for x in storage]==[x[0] for x in wanted_storage])
    raw_storage=[value for request,value in returned if request['params']['expression']=='window.taste143Fixture.readStorage()']
    check('all native storage values equal actual awaited protocol returns',raw_storage==[x['rows'] for x in storage])
    for item,(_,name) in zip(storage,wanted_storage):
        rows=item['rows']
        check(item['label']+' native store wrapper',all(set(x)=={'id','draft'} and x['id']==x['draft']['id'] for x in rows))
        records([x['draft'] for x in rows],fixtures[name],item['label'])
    actions=course['actions']
    check('bounded fixed action types',type(actions) is list and len(actions)<=80 and
          all(x['kind'] in ('native-key','real-file-input') for x in actions))
    file_actions=[x for x in actions if x['kind']=='real-file-input']
    names=['mixed-backup.json','stale-backup.json','stale-backup.json','replacement-identical-backup.json']
    check('four fixed real file-input assignments',[x['name'] for x in file_actions]==names)
    file_sends=[x for x in sends if x['method']=='DOM.setFileInputFiles']
    check('four actual file protocol calls',len(file_sends)==4)
    for i,(action,request) in enumerate(zip(file_actions,file_sends)):
        check('file '+str(i)+' exact bound node and one path',request['params']=={
            'nodeId':action['nodeId'],'files':[str(ROOT/'fixtures'/action['name'])]} and
            type(action['nodeId']) is int and action['nodeId']>0 and answer(request)==action['result'])
        before=views[action['before']];view=views[action['after']]
        check('file '+str(i)+' observed enabled input and completed idle preview',
              control(before,'collectionBackupFile')['disabled'] is False and
              view['state']['ready'] is True and view['state']['busy'] is False and
              view['pendingActions']==0 and view['previewVisible'] is True and
              control(view,'addSelectedMissingSavedWeeks')['disabled'] is True)
        boxes(view,[['selected_D','selected_C'],['selected_F'],['selected_F'],[]][i],[])
    mixed=views[file_actions[0]['after']]
    expected_rows=[row['name']+' · ID '+row['id']+' · created '+row['createdAt']+' · updated '+row['updatedAt']+
        ' · week of 2026-12-28 · '+['Missing','Conflicting','Already identical','Missing'][i]+
        (' · Existing: Current A, updated 2026-10-14T04:00:00.000Z.' if i==1 else '')
        for i,row in enumerate(fixtures['mixed-backup.json']['records'])]
    check('whole literal mixed rows and hostile-looking text stay data',mixed['completeRows']==expected_rows and
          [x['labels'][0] for x in mixed['checkboxes']]==[
          ' Missing D · ID selected_D',' <literal> café 雪 & "C" · ID selected_C'])
    check('mixed conflict blocks add-all',control(mixed,'addMissingSavedWeeks')['disabled'] is True and
          mixed['summary']=='2 missing · 1 already identical · 1 conflicting. 2 currently saved; 4 after adding missing records. Backup created 2026-10-14T04:00:00.000Z.')
    keys=[x for x in actions if x['kind']=='native-key']
    requests=[x for x in sends if x['method']=='Input.dispatchKeyEvent']
    check('each keyboard action has exactly two actual requests',len(requests)==2*len(keys))
    spaces=[]
    for i,action in enumerate(keys):
        key=action['key'];shift=action['shift']
        check('fixed keyboard key and modifier',key in ('Tab',' ') and type(shift) is bool)
        spec={'key':key,'code':'Tab' if key=='Tab' else 'Space','windowsVirtualKeyCode':9 if key=='Tab' else 32,
              'nativeVirtualKeyCode':9 if key=='Tab' else 32,'modifiers':8 if shift else 0,
              'autoRepeat':False,'isKeypad':False,'isSystemKey':False}
        down={**spec,'type':'keyDown'}
        if key==' ':down.update(text=' ',unmodifiedText=' ')
        up={**spec,'type':'keyUp'}
        check('key '+str(i)+' raw down and up exact',requests[2*i]['params']==down and
              requests[2*i+1]['params']==up and answer(requests[2*i])==action['down'] and
              answer(requests[2*i+1])==action['up'])
        check('key '+str(i)+' saved before and after indexes',type(action['before']) is int and
              type(action['after']) is int and 0<=action['before']<action['after']<len(views))
        if key==' ':
            before=views[action['before']];after=views[action['after']]
            active=before['active'];role=active['value'] if active['tag']=='INPUT' and active['value'] in ('selected_C','selected_D','selected_F') else active['id']
            spaces.append((role,action,before,after))
            if role.startswith('selected_'):
                rows=[x for x in before['checkboxes'] if x['value']==role]
                check('Space has actual selected checkbox focus',len(rows)==1 and rows[0]['focused'] is True and rows[0]['checked'] is False)
                check('Space toggled same focused checkbox',any(x['value']==role and x['checked'] is True and x['focused'] is True for x in after['checkboxes']))
            else:
                c=control(before,role)
                check('Space has actual enabled visible control focus',c['disabled'] is False and c['visible'] is True)
    check('literal native Space action order',[x[0] for x in spaces]==[
        'selected_C','selected_D','addSelectedMissingSavedWeeks','selected_F',
        'addSelectedMissingSavedWeeks','selected_F','cancelCollectionBackup'])
    boxes(spaces[0][3],['selected_D','selected_C'],['selected_C'])
    boxes(spaces[1][3],['selected_D','selected_C'],['selected_C','selected_D'])
    check('backward Tab used between C and D selection',any(x['key']=='Tab' and x['shift'] is True and
          spaces[0][1]['after']<=x['before']<spaces[1][1]['before'] for x in keys))
    external=course['externalWriter']
    external_calls=[(request,value) for request,value in returned if request['params']['expression']=='window.taste143Fixture.addExternalRecord()']
    check('one explicitly awaited external writer',len(external_calls)==1 and
          external_calls[0][0]['params'].get('awaitPromise') is True and
          external_calls[0][1]==external['result']==fixtures['external-addition.json'] and
          spaces[3][1]['after']<=external['before']<external['after']<=spaces[4][1]['before'])
    ev=views[external['after']]
    boxes(ev,['selected_F'],['selected_F'])
    check('E committed while stale F preview remained selected',ev['refreshCount']==2 and len(ev['restoreCalls'])==1 and
          ev['selectionSummary']=='1 missing selected; 4 currently saved; 5 after this selected addition. Other backup records are excluded.' and
          [x['kind'] for x in ev['events']].count('external-writer-committed')==1)
    completed=[v for v in views if v and len(v.get('restoreCalls',[]))==1 and not v['previewVisible'] and v['pendingActions']==0]
    check('observed completed first commit',bool(completed))
    commit=completed[0]
    check('selected commit literal status and one refresh',commit['refreshCount']==2 and
          commit['status']=='Added 2 selected missing saved weeks. Other backup records were not added or resolved. The active week and venue notes are unchanged. Your saved-name search may hide added records.')
    first=commit['restoreCalls'][0];mixed_fixture=fixtures['mixed-backup.json']
    check('D then C submission with complete original expected token',first=={
        'backup':{'format':mixed_fixture['format'],'savedAt':mixed_fixture['savedAt'],
                  'records':[mixed_fixture['records'][0],mixed_fixture['records'][3]]},
        'expected':fixtures['initial-records.json']})
    stale=[v for v in views if v and v.get('status')=='Could not add selected missing saved weeks: Saved weeks changed since this preview. Open the backup again before adding anything. Open the backup again to review current storage.']
    check('explicit stale refusal observed',bool(stale))
    check('stale refusal used full F and original A B C D expectation',stale[-1]['restoreCalls']==[
        first,{'backup':fixtures['stale-backup.json'],'expected':fixtures['expected-after-selected.json']}])
    cancelled=[v for v in views if v and v.get('status')=='Collection preview cancelled. Nothing was changed.']
    check('cancel retires selected preview without another restore',bool(cancelled) and
          cancelled[-1]['checkboxes']==[] and cancelled[-1]['previewVisible'] is False and
          len(cancelled[-1]['restoreCalls'])==2 and control(cancelled[-1],'cancelCollectionBackup')['disabled'] is True)
    final=views[file_actions[-1]['after']]
    check('replacement identical B resets selection and add controls',final['checkboxes']==[] and
          final['status']=='No missing records to add. Nothing was changed.' and final['refreshCount']==2 and
          len(final['restoreCalls'])==2 and control(final,'addMissingSavedWeeks')['disabled'] is True and
          control(final,'addSelectedMissingSavedWeeks')['disabled'] is True and
          final['summary']=='0 missing · 1 already identical · 0 conflicting. 5 currently saved; 5 after adding missing records. Backup created 2026-10-14T04:00:00.000Z.')
    check('exact final host event order',[x['kind'] for x in final['events']]==[
        'initial-seed-committed','refresh','action-start','restore-submitted','restore-committed',
        'refresh','action-finished','external-writer-start','external-writer-committed',
        'action-start','restore-submitted','restore-refused','action-finished'])
    check('only successful restore result exact',[x for x in final['events'] if x['kind']=='restore-committed']==[
        {'kind':'restore-committed','added':2,'alreadyPresent':0}])
    captures=course['captures'];image_sends=[x for x in sends if x['method']=='Page.captureScreenshot']
    check('two original capture roles',[x['name'] for x in captures]==['01-selected-desktop.png','02-selected-narrow.png'] and len(image_sends)==2)
    for i,(image,request) in enumerate(zip(captures,image_sends)):
        raw=(ROOT/image['name']).read_bytes();dimensions=png_size(raw);clip=image['clip'];view=views[image['observation']]
        content=image['layout']['cssContentSize'];width,height=[(1280,960),(390,844)][i]
        check(image['name']+' original protocol screenshot bytes',base64.b64decode(answer(request)['data'],validate=True)==raw and
              len(raw)==image['bytes'] and sha(raw)==image['sha256'] and 24<len(raw)<=8*1024*1024)
        check(image['name']+' actual full document clip',clip=={'x':0,'y':0,'width':math.ceil(content['width']),
              'height':math.ceil(content['height']),'scale':1} and dimensions==[clip['width'],clip['height']] and
              0<clip['width']<=1600 and 0<clip['height']<=4096 and request['params']=={
              'format':'png','fromSurface':True,'captureBeyondViewport':True,'clip':clip})
        boxes(view,['selected_D','selected_C'],['selected_D','selected_C'])
        check(image['name']+' exact viewport and precommit storage state',view['viewport']['width']==width and
              view['viewport']['height']==height and view['viewport']['documentWidth']<=width and
              image['documentOverflow'] is False and view['restoreCalls']==[] and view['refreshCount']==1 and
              view['selectionSummary']=='2 missing selected; 2 currently saved; 4 after this selected addition. Other backup records are excluded.' and
              control(view,'addMissingSavedWeeks')['disabled'] is True and
              control(view,'addSelectedMissingSavedWeeks')['disabled'] is False)
        capture_records.append({'file':image['name'],'bytes':len(raw),'sha256':sha(raw),'dimensions':dimensions,'clip':clip})
