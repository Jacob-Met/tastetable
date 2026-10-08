#!/usr/bin/env python3
"""Cold, standard-library verification of the new Linux TasteTable peer packet."""
from pathlib import Path, PurePosixPath
import argparse, json, tarfile, hashlib, datetime, re, struct

DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
CAUTION="Suggested outing only; no booking or opening hours confirmed. Not medical or dietary advice. Confirm accessibility, texture and sodium needs with the venue and the person's care team."
SOURCE='DEMO: synthetic Qloo fixture; these venues are fictional.'

def need(value,message):
    if not value: raise ValueError(message)

def same(a,b,message):
    need(a==b,message)

def pin(data):
    return {'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),
            'git_blob':hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()}

def checked_name(name):
    p=PurePosixPath(name)
    need(not p.is_absolute() and '..' not in p.parts and str(p)==name,'Unsafe member '+name)

def json_bytes(data):
    def pairs(items):
        result={}
        for k,v in items:
            need(k not in result,'Duplicate JSON key '+k);result[k]=v
        return result
    def bad(value):raise ValueError('Nonfinite JSON '+value)
    return json.loads(data.decode('utf-8'),object_pairs_hook=pairs,parse_constant=bad)

def when(text):
    return datetime.datetime.fromisoformat(text.replace('Z','+00:00'))

def day(text):
    result=datetime.date.fromisoformat(text);same(result.isoformat(),text,'Literal date');return result

def monday(text):
    d=day(text);return (d-datetime.timedelta(days=d.weekday())).isoformat()

def escape(text):
    return re.sub(r'\r\n|\r|\n',r'\\n',text.replace('\\','\\\\')).replace(';','\\;').replace(',','\\,')

def fold(line):
    parts=[];current='';size=0
    for char in line:
        width=len(char.encode('utf-8'))
        if size+width>75:parts.append(current);current=' ';size=1
        current+=char;size+=width
    parts.append(current);return '\r\n'.join(parts)

def state_for(record,start,assignments=None):
    response=record['response'];plan=response['plan']
    need(response['mock'] is True,'Original fixture mode')
    picks=[{'key':'pick-'+str(i),'originalDay':p['day'],'pick':p}
           for i,p in enumerate(plan['meals']+([plan['outing']] if plan['outing'] else []))]
    base={p['key']:p['originalDay'] for p in picks}
    if assignments is not None:
        same(set(assignments),set(base),'Assignment source keys')
        need(all(v is None or v in DAYS for v in assignments.values()),'Assignment weekday')
        base=dict(assignments)
    same(monday(start),start,'Week starts on Monday')
    return {'weekStart':start,'sourceMode':'mock','constraints':response.get('comparison',{}).get('constraints',[]),
            'sourcePlan':plan,'picks':picks,'assignments':base}

def arranged_rows(state):
    rows=[]
    for index,pick in enumerate(state['picks']):
        weekday=state['assignments'][pick['key']]
        if weekday is None:continue
        ordinal=DAYS.index(weekday);date=day(state['weekStart'])+datetime.timedelta(days=ordinal)
        rows.append({**pick,'index':index,'day':weekday,'ordinal':ordinal,'date':date.isoformat(),
                     'end':(date+datetime.timedelta(days=1)).isoformat()})
    return sorted(rows,key=lambda r:(r['ordinal'],r['index']))

def calendar_bytes(state,identity,received):
    need(re.fullmatch('[0-9a-f]{32}',identity) is not None,'Calendar identity')
    timestamp=when(received).astimezone(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    rows=arranged_rows(state);need(rows,'Nonempty calendar')
    lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//TasteTable//Suggested weekly plan//EN','CALSCALE:GREGORIAN']
    events=[]
    for r in rows:
        p=r['pick']
        description='\n\n'.join([SOURCE,CAUTION,'Qloo entity ID: '+p['entity_id'],
            'Originally suggested for: '+r['originalDay']+'. Arranged for: '+r['day']+' '+r['date']+'.',
            'Why this suggestion: '+p['why']]+['Plan note: '+n for n in state['sourcePlan']['notes']])
        fields=[
            ('UID',identity+'-'+state['weekStart'].replace('-','')+'-'+r['key']+'@tastetable.invalid'),
            ('DTSTAMP',timestamp),('DTSTART;VALUE=DATE',r['date'].replace('-','')),
            ('DTEND;VALUE=DATE',r['end'].replace('-','')),
            ('SUMMARY',escape('[DEMO] TasteTable suggestion: '+p['name'])),
            ('DESCRIPTION',escape(description)),('STATUS','TENTATIVE'),('TRANSP','TRANSPARENT'),('CLASS','PRIVATE')]
        lines.append('BEGIN:VEVENT');lines.extend(k+':'+v for k,v in fields);lines.append('END:VEVENT')
        events.append(dict(fields))
    lines.append('END:VCALENDAR')
    return ('\r\n'.join(fold(line) for line in lines)+'\r\n').encode('utf-8'),events

def verify_calendar(data,state,identity,received):
    text=data.decode('utf-8')
    need(text.endswith('\r\n') and re.search(r'(?<!\r)\n|\r(?!\n)',text) is None,'Physical CRLF')
    need(all(len(line.encode('utf-8'))<=75 for line in text.split('\r\n')),'Physical 75-octet folding')
    expected,events=calendar_bytes(state,identity,received)
    same(data,expected,'Exact independently reconstructed calendar bytes')
    return events

def main(packet):
    archive=packet/'native-peer.tar.xz'
    raw=archive.read_bytes();manifest=json_bytes((packet/'native-manifest.json').read_bytes())
    rows=manifest['files'];need(isinstance(rows,dict),'Manifest files object')
    files={}
    with tarfile.open(archive,'r:xz') as tar:
        for member in tar.getmembers():
            checked_name(member.name)
            need(member.isfile() and member.name not in files,'Ordinary unique member '+member.name)
            files[member.name]=tar.extractfile(member).read()
    same(set(files),set(rows),'Complete archive member set')
    for name,data in files.items():
        expected=rows[name];actual=pin(data)
        for key in actual:same(actual[key],expected[key],'Manifest '+key+' '+name)
        need(expected['mode'] in ('100644','100755'),'Manifest Git mode '+name)
    def data(name):
        need(name in files,'Missing '+name);return files[name]
    def obj(name):return json_bytes(data(name))
    source=obj('source-freeze.json');receiver=obj('receiver-freeze.json')
    receipt=obj('linux-v1/receipt.json');process=obj('linux-v1-process.json')
    same(receipt['state'],'passed','Actual receiving state');same(process['exit_code'],0,'Actual process exit')
    same(pin(data('source-freeze.json'))['sha256'],receipt['sourceFreezeSha256'],'Receipt source freeze')
    same(pin(data('source-freeze.json'))['sha256'],receiver['source_freeze_sha256'],'Receiver source freeze')
    same(pin(data('receiver-freeze.json'))['sha256'],process['receiver_freeze_sha256'],'Process receiver freeze')
    same(pin(data('receive-linux.mjs'))['sha256'],receiver['receiver']['sha256'],'Frozen receiver bytes')
    same(pin(data('receive-linux.mjs'))['sha256'],process['receiver_sha256'],'Executed receiver bytes')
    same(pin(data('linux-v1.stdout'))['sha256'],process['stdout_sha256'],'Process stdout')
    same(pin(data('linux-v1.stderr'))['sha256'],process['stderr_sha256'],'Process stderr')
    same(data('linux-v1.stderr'),b'','No raw process error')
    need(when(source['frozen_at'])<=when(receiver['frozen_at'])<=when(receipt['started'])<=when(receipt['finished'])<=when(process['finished']),'Freeze/run time order')
    same(receipt['sourceBefore'],receipt['sourceAfter'],'Source before/after')
    same(receipt['sourceBefore'],source['files'],'Source snapshot/freeze')
    same(len(source['files']),104,'Receiving source count')
    for name,value in source['files'].items():
        actual=pin(data(name))
        for key in actual:same(actual[key],value[key],'Source pin '+name)
        same(value['mode'],rows[name]['mode'],'Source mode '+name)
    primary=obj('primary-trees.json')
    maps={key:{x['path']:x for x in primary[key]['tree'] if x['type']!='tree'}
          for key in ('original_tree','current_author_tree','publication_tree')}
    need(all(not primary[key]['truncated'] for key in maps),'Complete primary trees')
    for name,value in source['files'].items():
        if name.startswith('baseline/'):
            path=name[len('baseline/'):];row=maps['original_tree'][path]
            same(value['git_blob'],row['sha'],'Baseline canonical source');same(value['mode'],row['mode'],'Baseline canonical mode')
    cm=obj('source-provenance/current-frozen-manifest.json')
    om=obj('source-provenance/original-frozen-manifest.json')
    same(pin(data('source-provenance/current-frozen-manifest.json'))['sha256'],'81d7e62583bc13a3f9398b010ccf2ff8055c18fc04999f5a27e9573e9660f36c','Current author freeze')
    same(pin(data('source-provenance/original-frozen-manifest.json'))['sha256'],'856b8761f80276fec0b32496144c7c40b9090ef38b9333a2effd2216772dc50b','Original author freeze')
    unowned=0
    for name,value in cm['source_files'].items():
        same(source['files']['candidate/'+name],value,'Current complete source closure')
        if name not in cm['scope']:
            for key in ('current_author_tree','publication_tree'):
                same(value['git_blob'],maps[key][name]['sha'],'Current unowned source '+name)
                same(value['mode'],maps[key][name]['mode'],'Current unowned mode '+name)
            unowned+=1
    same(unowned,46,'Current preserved source count')
    for name,value in cm['scope'].items():
        for key in ('current_author_tree','publication_tree'):
            same(maps[key].get(name,{}).get('sha'),value['before_git_blob'],'Owned before-source pin '+name)
    for name in cm['original_new_files_unchanged']:same(cm['source_files'][name],om['source_files'][name],'Unchanged original new source')
    catalogue=obj('baseline/web-demo-offline/data/catalogue.json')
    records={r['key']:r for r in catalogue['records']};same(len(records),24,'Catalogue cohort count')
    profiles={p['id']:p for p in catalogue['profiles']}
    api=receipt['api'];same(len(api['cases']),48,'API cohort count')
    coverage=set();valid_calendars={};normal_event_count=0
    def receive(path,state,identity,received):
        nonlocal normal_event_count
        actual=data('linux-v1/'+path);events=verify_calendar(actual,state,identity,received)
        need(path not in valid_calendars,'Unique calendar accounting '+path)
        valid_calendars[path]={'state':state,'identity':identity,'received':received,'events':events}
        normal_event_count+=len(events);return events
    for case in api['cases']:
        value=case['context'];record=records[value['record']['key']]
        same(value['record'],record,'API original record')
        start=monday(value['anchor']);state=state_for(record,start)
        variant=case['variant'];need(variant in ('original','arranged'),'Known cohort variant')
        if variant=='arranged':
            keys=[p['key'] for p in state['picks']]
            state['assignments'][keys[0]]='Sunday';state['assignments'][keys[1]]=None;state['assignments'][keys[-1]]='Sunday'
        same(value['state'],state,'API state derived from original record')
        same(case['name'],record['key']+'/'+variant,'API cohort identity');coverage.add((record['key'],variant))
        same(pin(data('linux-v1/'+case['path']))['sha256'],case['sha256'],'API output digest')
        events=receive(case['path'],state,value['calendarId'],value['receivedAt']);same(len(events),case['events'],'API event count')
    same(coverage,{(key,v) for key in records for v in ('original','arranged')},'Every record and arrangement')
    identity=api['identity']
    for which,key in [('first','context'),('later','laterContext')]:
        value=identity[key];entry=identity[which];record=records[value['record']['key']]
        same(value['state'],state_for(record,monday(value['anchor']),value['state']['assignments']),'Identity source')
        same(pin(data('linux-v1/'+entry['path']))['sha256'],entry['sha256'],'Identity output digest')
        receive(entry['path'],value['state'],value['calendarId'],value['receivedAt'])
    old_uids={e['UID'] for e in valid_calendars[identity['first']['path']]['events']}
    new_uids={e['UID'] for e in valid_calendars[identity['later']['path']]['events']}
    need(old_uids.isdisjoint(new_uids),'Changed API week separates identities')
    same({r['name'] for r in api['refusals']},{'empty','blank-date','impossible-date','different-week','missing-record','missing-state','invalid-stamp','invalid-id','different-record','altered-source'},'Recorded refusal cohort')
    need(all(r['message'] for r in api['refusals']),'Recorded refusal diagnostics')
    same(len(api['negativeControls']),3,'Negative controls count')
    for control in api['negativeControls']:
        same(control['state'],'rejected','Actual negative result')
        same(pin(data('linux-v1/'+control['path']))['sha256'],control['sha256'],'Negative bytes')
        value=identity['context'];rejected=False
        try:verify_calendar(data('linux-v1/'+control['path']),value['state'],value['calendarId'],value['receivedAt'])
        except ValueError:rejected=True
        need(rejected,'Cold verifier must reject '+control['name'])
    browser=receipt['browser'];same(len(browser['groups']),11,'Actual browser groups')
    same(len(browser['downloads']),22,'Actual downloads')
    same(len(browser['downloadEvents']),22,'Browser events')
    same(browser['pageErrors'],[],'No JavaScript errors')
    need(all(not re.match(r'^https?:',url) or url.startswith(browser['origin']+'/') for url in browser['requests']),'No external/provider request')
    downloads={entry['path']:entry for entry in browser['downloads']}
    need(len(downloads)==22,'Unique saved downloads')
    for path,entry in downloads.items():
        for key in ('bytes','sha256'):same(pin(data('linux-v1/'+path))[key],entry[key],'Saved download pin')
    saved_values={}
    for path,entry in downloads.items():
        if not entry['suggestedFilename'].endswith('.json'):continue
        value=obj('linux-v1/'+path);same(value['format'],'tastetable.saved-week.v1','Native saved-week format')
        matches=[]
        for record in records.values():
            p=profiles[record['profile_id']]
            inputs={key:p[key] for key in ('cuisines','music','films','city')};inputs['constraints']=record['constraints']
            if record['response']==value['response'] and inputs==value['inputs']:matches.append(record)
        same(len(matches),1,'Exact saved original response and inputs')
        need(when(value['receivedAt'])<=when(value['savedAt']),'Original receipt predates save')
        record=matches[0];state=state_for(record,value['week']['start'],value['week']['assignments'])
        saved_values[path]={'record':record,'state':state,'calendarId':value['calendarId'],'receivedAt':value['receivedAt']}
    same(len(saved_values),7,'Saved JSON count')
    preview=browser['previewBeforeIdentity'];same(saved_values[preview['path']]['calendarId'],None,'No identity during preview')
    pairs={}
    for pair in browser['pairs']:
        value=saved_values[pair['weekPath']]
        same(value['state'],pair['state'],'Paired downloaded source state')
        same(value['calendarId'],pair['calendarId'],'Paired calendar identity')
        same(value['receivedAt'],pair['receivedAt'],'Paired original stamp')
        same(value['record']['key'],pair['recordKey'],'Paired source record')
        same(pair['preview'],[{'date':r['date'],'name':r['pick']['name']} for r in arranged_rows(value['state'])],'Actual preview dates and names')
        events=receive(pair['calendarPath'],value['state'],value['calendarId'],value['receivedAt'])
        same(len(events),pair['events'],'Paired event count');pairs[pair['name']]=pair
    same(set(pairs),{'initial','moved','omitted','other-week','fresh-reopen','replacement-source'},'Browser paired contexts')
    for relation in browser['byteEqualities']:
        same(data('linux-v1/'+relation['path']),data('linux-v1/'+relation['reference']),'Actual '+relation['label'])
        value=valid_calendars[relation['reference']]
        receive(relation['path'],value['state'],value['identity'],value['received'])
    same(len(browser['byteEqualities']),9,'Saved byte-equality transitions')
    for name in ('moved','omitted','other-week','fresh-reopen'):
        same(pairs[name]['calendarId'],pairs['initial']['calendarId'],'History/source retains identity')
    need(pairs['replacement-source']['calendarId']!=pairs['initial']['calendarId'],'New recorded source separates identity')
    same(data('linux-v1/'+pairs['fresh-reopen']['calendarPath']),data('linux-v1/'+pairs['omitted']['calendarPath']),'Fresh actual Save/Open bytes')
    same({p for p in downloads if p.endswith('.ics')},set(valid_calendars)-{case['path'] for case in api['cases']}-{identity['first']['path'],identity['later']['path']},'Every actual browser calendar recomputed')
    same(len(valid_calendars),65,'All valid calendars recomputed')
    for image in browser['screenshots']:
        b=data('linux-v1/'+image['path']);same(pin(b)['sha256'],image['sha256'],'PNG digest')
        same(b[:8],b'\x89PNG\r\n\x1a\n','Actual PNG signature');same(b[12:16],b'IHDR','PNG header')
        width,height=struct.unpack('>II',b[16:24]);same((width,height),(375,1000) if 'phone' in image['path'] else (1280,1000),'Actual image dimensions')
    same(len(browser['screenshots']),2,'Actual rendered images')
    visual=obj('visual-review.json');same(visual['images'],browser['screenshots'],'Root visual pins')
    g=browser['geometry'];need(g['width']==375 and g['scroll']<=375 and g['left']>=-1 and g['right']<=375 and g['bottom']>0 and g['top']<1000,'Actual calendar geometry')
    for request in browser['serverRequests']:
        if request['status']!=200:continue
        path=request['path'].lstrip('/');need(path in source['files'],'Served file in frozen closure')
        same(request['sha256'],source['files'][path]['sha256'],'Exact privately served source')
    result={'schema':'tastetable.root.cold-peer-verification.v1','status':'passed','archive':pin(raw),'ordinary_members':len(files),
            'complete_source_files':104,'baseline_files':48,'current_candidate_files':56,'publication_unowned_sources':46,'owned_before_pins':10,
            'api_cohorts_recomputed':48,'recorded_refusals':10,'constructed_negative_calendars_rejected':3,'identity_calendars_recomputed':2,
            'actual_browser_groups':11,'actual_downloads':22,'browser_calendars_recomputed':15,'saved_weeks_recomputed':7,
            'actual_byte_equalities_recomputed':9,'all_valid_calendars_recomputed':len(valid_calendars),'all_valid_events_recomputed':normal_event_count,
            'source_stable':True,'actual_pngs':2,'actual_phone_width':375,'actual_runtime':{'node':receiver['node_version'],'browser':browser['version']},
            'actual_run':{'started':receipt['started'],'finished':receipt['finished']},'publication_parent':source['publication_parent'],
            'publication_tree':source['publication_tree'],'cold_product_or_browser_runs':0,
            'attribution':'New Linux receiving only. Earlier Mac raw peer outputs remain on the offline Mac and are not recreated or counted here.'}
    return result

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('packet',type=Path);args=parser.parse_args()
    print(json.dumps(main(args.packet),indent=2,sort_keys=True))
