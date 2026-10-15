"""Independent parent joins for the single TasteTable143 component browser course."""
from pathlib import Path
from urllib.parse import urlsplit
import base64,json,math,os,struct,sys,traceback,zlib
from component_support import ROOT,PYTHON,EDGE,sha,write_json,file_state,state
from component_evidence import verify_component
from child_lifecycle import run_child

def png_size(raw):
    if raw[:8]!=b'\x89PNG\r\n\x1a\n':raise ValueError('PNG signature')
    offset=8;size=None;ended=False
    while offset<len(raw):
        if offset+12>len(raw):raise ValueError('PNG truncated chunk')
        length=struct.unpack('>I',raw[offset:offset+4])[0]
        end=offset+12+length
        if end>len(raw):raise ValueError('PNG chunk bound')
        kind=raw[offset+4:offset+8];data=raw[offset+8:offset+8+length]
        if zlib.crc32(kind+data)&0xffffffff!=struct.unpack('>I',raw[offset+8+length:end])[0]:
            raise ValueError('PNG CRC differs')
        if kind==b'IHDR':
            if size is not None or offset!=8 or length!=13:raise ValueError('PNG IHDR')
            size=list(struct.unpack('>II',data[:8]))
        if kind==b'IEND':
            if length or end!=len(raw):raise ValueError('PNG terminal chunk')
            ended=True
        offset=end
    if not size or not ended:raise ValueError('PNG incomplete')
    return size

def main():
    if len(sys.argv)!=3 or sys.argv[1]!='--preparation-sha256':
        raise ValueError('Actual data preparation digest required')
    preparation=(ROOT/'data-preparation.json').read_bytes()
    if sha(preparation)!=sys.argv[2]:raise ValueError('Actual preparation digest differs')
    ready=json.loads(preparation)
    if ready.get('outcome')!='PASS':raise ValueError('Data preparation was not accepted')
    before=state()
    directory=ROOT/'parent-course';directory.mkdir(exist_ok=False)
    record={'schema':'hamon.tastetable143.parent/1','outcome':'FAIL','preparation_sha256':sys.argv[2],
            'before':before,'checks':[],'children':[],'errors':[],'captures':[]}
    def check(name,value):
        record['checks'].append({'name':name,'pass':bool(value)})
        if not value:raise AssertionError(name)
    try:
        child=run_child('01-browser',[str(PYTHON),'-B','-s',str(ROOT/'receive_component.py'),'--execute-after-review'],
                        dict(os.environ),record['children'],deadline=220)
        check('one controller normal lifecycle and exit zero',child['returncode']==0 and
              child['lifecycle_complete'] and child['job_active_at_teardown']==[] and not child['errors'])
        raw=(ROOT/'browser-receipt.json').read_bytes();browser=json.loads(raw)
        stdout=base64.b64decode(child['logs']['stdout.bin']['base64'],validate=True)
        check('whole stdout equals original browser receipt object',json.loads(stdout)==browser)
        check('browser receipt successful pending original pixels',browser['outcome']=='PASS_PENDING_VISUAL_REVIEW')
        check('browser before state exact',browser['before']==before)
        check('browser final full native state exact',browser['after']==before)
        check('one fixed server browser and Node',browser['server_launches']==browser['browser_launches']==browser['node_launches']==1)
        check('no browser errors or forced cleanup',browser['errors']==[] and browser['forced_cleanup'] is False)
        for name in ('server','browser','node'):
            group=browser['groups'][name];waits=group['retained_waits']
            check(name+' normal direct exit empty owned Job and closed handle',
                  group['direct_returncode']==0 and group['job_active_at_teardown']==[] and
                  group['direct_handle_closed'] is True)
            check(name+' all captured handles observed terminal',
                  waits['normal_cleanup'] is True and waits['forced_cleanup'] is False and
                  len(waits['handles'])>0 and all(x['wait_result']==0 and x['closed'] and not x['errors']
                                                 for x in waits['handles']))
        endpoint=browser['endpoint']
        check('endpoint profile record and owned listener',endpoint['endpoint']=='ws://127.0.0.1:'+
              str(endpoint['active_port']['port'])+endpoint['active_port']['browser_path'] and
              len({x['pid'] for x in endpoint['listeners']})==1 and
              all(x['address'] in ('127.0.0.1','::1') and x['state']==2 for x in endpoint['listeners']))
        listener=endpoint['retained_listener']
        check('listener full retained identity',listener['identity']['identity_matches_retained'] is True and
              listener['identity']['wait_result']==258 and listener['identity']['errors']==[] and
              listener['identity']['created_filetime']==listener['created_filetime'])
        trace=browser['startup_trace']
        check('bounded nonempty owned startup trace',type(trace) is list and 1<=len(trace)<=320)
        retained={(x['pid'],x['created_filetime']) for x in browser['groups']['browser']['retained_identities']}
        excluded={(x['pid'],x['created_filetime']) for x in browser['existing_edge_before']
                  if x['retained_identity']}
        last_elapsed=0;direct_zero_seen=False
        for index,item in enumerate(trace):
            label='startup '+str(index);elapsed=item['elapsed_seconds'];code=item['direct_returncode']
            check(label+' bounded monotonic elapsed',type(elapsed) in (int,float) and
                  math.isfinite(elapsed) and 0<=elapsed<30 and last_elapsed<=elapsed)
            last_elapsed=elapsed
            check(label+' direct starter pending or zero',code is None or type(code) is int and code==0)
            check(label+' terminal starter never returns to pending',not direct_zero_seen or code==0)
            direct_zero_seen=direct_zero_seen or code==0
            members=item['current_members'];identities=item['identities']
            check(label+' nonempty unique bounded members',type(members) is list and
                  1<=len(members)<=128 and all(type(pid) is int and pid>0 for pid in members) and
                  len(set(members))==len(members) and [x['pid'] for x in identities]==members)
            for member in identities:
                identity=member['identity'];pair=(member['pid'],member['created_filetime'])
                check(label+' raw retained live image creation and Job',pair in retained and pair not in excluded and
                      type(member['created_filetime']) is int and member['created_filetime']>0 and
                      identity['handle_pid']==member['pid'] and
                      identity['created_filetime']==member['created_filetime'] and
                      identity['in_owned_job'] is True and identity['identity_matches_retained'] is True and
                      identity['wait_result']==258 and identity['errors']==[] and
                      Path(identity['image_path']).resolve()==EDGE.resolve())
            present=item['port_file_present']
            check(label+' only final port candidate',type(present) is bool and present==(index==len(trace)-1))
            expected_state='endpoint_candidate' if present else 'waiting_direct' if code is None else 'waiting_owned'
            check(label+' literal startup state',item['state']==expected_state)
        check('final startup candidate includes bound retained listener',
              (listener['pid'],listener['created_filetime']) in
              {(x['pid'],x['created_filetime']) for x in trace[-1]['identities']})
        events=[json.loads(line) for line in (ROOT/'lifetime-events.ndjson').read_text(encoding='utf-8').splitlines()]
        check('whole startup event values equal receipt trace',
              [x['value'] for x in events if x['kind']=='startup_state']==trace)
        node_raw=(ROOT/'node-receipt.json').read_bytes();node=json.loads(node_raw)
        check('Node original receipt hash joined',browser['node_receipt']=={'bytes':len(node_raw),'sha256':sha(node_raw)})
        check('Node normal semantic and socket completion',node['schema']=='hamon.tastetable143.node-course/1' and
              node['outcome']=='PASS' and node['error'] is None and node['socket_terminal_observed'] is True and
              node['inputs_unchanged'] is True and 'protocol_error' not in node)
        check('Node exact endpoint',node['endpoint']==endpoint['endpoint'])
        check('Node actual raw stdout object',json.loads((ROOT/'node.stdout.bin').read_bytes())==node)
        expected_url=browser['server_endpoint']['url']
        def target_inventory(label,result,url,attached):
            check(label+' complete inventory result object',type(result) is dict)
            infos=result['targetInfos']
            check(label+' bounded full inventory',type(infos) is list and 1<=len(infos)<=64)
            ids=set()
            for item in infos:
                check(label+' target record',type(item) is dict)
                check(label+' opaque identity and context strings',all(type(item.get(k)) is str and
                      0<len(item[k])<=128 for k in ('targetId','browserContextId')))
                check(label+' title and URL strings',type(item.get('title')) is str and
                      len(item['title'])<=4096 and type(item.get('url')) is str and 0<len(item['url'])<=4096)
                check(label+' unique target ID',item['targetId'] not in ids);ids.add(item['targetId'])
                check(label+' known page or recorded nonpage type',
                      item.get('type') in ('page','service_worker','background_page'))
                check(label+' no opener parent or subtype',item.get('canAccessOpener') is False and
                      all(k not in item for k in ('openerId','openerFrameId','parentId','parentFrameId','subtype')))
            pages=[item for item in infos if item['type']=='page']
            check(label+' exactly one page including ineligible pages',len(pages)==1)
            page=pages[0]
            check(label+' exact page URL and attachment',page['url']==url and page.get('attached') is attached)
            projection=[]
            for item in infos:
                check(label+' single observed context',item['browserContextId']==page['browserContextId'])
                if item['type']=='page':continue
                parsed=urlsplit(item['url'])
                check(label+' untouched unattached extension target',item.get('attached') is False and
                      item['url'].startswith('chrome-extension://') and parsed.scheme=='chrome-extension' and
                      bool(parsed.hostname) and parsed.username is None and parsed.password is None and parsed.port is None)
                projection.append([item[k] for k in ('targetId','type','url','browserContextId','attached','canAccessOpener')])
            return page,sorted(projection,key=lambda row:row[0])
        initial_page,initial_nonpages=target_inventory('initial',node['initial_targets'],'about:blank',False)
        final_page,final_nonpages=target_inventory('final',node['final_targets'],expected_url,True)
        check('complete selected target records joined',node['initial_target']==initial_page and
              node['final_target']==final_page)
        check('same selected page ID and context',initial_page['targetId']==final_page['targetId'] and
              initial_page['browserContextId']==final_page['browserContextId'])
        check('nonpage identities and semantic fields unchanged',initial_nonpages==final_nonpages)
        transcript=(ROOT/'cdp-transcript.ndjson').read_bytes()
        check('complete bounded original CDP transcript',len(transcript)==node['transcript_bytes'] and len(transcript)<=64*1024*1024)
        protocol=[json.loads(line) for line in transcript.splitlines()]
        sends=[x['value'] for x in protocol if x['direction']=='send']
        gets=[x for x in sends if x['method']=='Target.getTargets']
        check('two full unfiltered root target queries',len(gets)==2 and
              all(x['params']=={} and 'sessionId' not in x for x in gets))
        for label,request,wanted in zip(('initial','final'),gets,(node['initial_targets'],node['final_targets'])):
            replies=[x['value'] for x in protocol if x['direction']=='receive' and
                     x['value'].get('id')==request['id']]
            check(label+' complete raw CDP inventory result joined',len(replies)==1 and
                  'error' not in replies[0] and 'sessionId' not in replies[0] and replies[0]['result']==wanted)
        attaches=[x for x in sends if x['method']=='Target.attachToTarget']
        check('only selected page attached once',len(attaches)==1 and 'sessionId' not in attaches[0] and
              attaches[0]['params']=={'targetId':initial_page['targetId'],'flatten':True})
        attached=[x['value'] for x in protocol if x['direction']=='receive' and
                  x['value'].get('id')==attaches[0]['id']]
        check('sole page session bound to actual attach reply',len(attached)==1 and
              'error' not in attached[0] and 'sessionId' not in attached[0] and
              type(node['session_id']) is str and len(node['session_id'])>0 and
              attached[0]['result']['sessionId']==node['session_id'])
        check('only fixed root commands and selected page session',
              [x['method'] for x in sends if 'sessionId' not in x]==[
                  'Browser.getVersion','Target.getTargets','Target.attachToTarget','Target.getTargets','Browser.close'] and
              all(x['sessionId']==node['session_id'] and
                  x['method'].startswith(('Page.','Network.','Emulation.','Runtime.','Input.','DOM.'))
                  for x in sends if 'sessionId' in x))
        check('no pointer automation in keyboard component course',not any(x['method']=='Input.dispatchMouseEvent' for x in sends))
        check('one navigation two captures one owned close',
              [sum(x['method']==name for x in sends) for name in
               ('Page.navigate','Page.captureScreenshot','Browser.close')]==[1,2,1])
        check('one terminal socket event',sum(x['direction']=='socket-close' for x in protocol)==1)
        check('component declared command and event bounds',len(sends)==node['commands']<=500 and
              0<=node['event_count']<=2000 and 0<=node['message_bytes']<=60*1024*1024)
        def answer(request):
            replies=[x['value'] for x in protocol if x['direction']=='receive' and x['value'].get('id')==request['id']]
            check('one raw reply '+str(request['id']),len(replies)==1 and 'error' not in replies[0] and
                  replies[0].get('sessionId')==request.get('sessionId'))
            return replies[0]['result']
        navigation=[x for x in sends if x['method']=='Page.navigate'][0]
        check('exact single fixed HTTP navigation',navigation['params']=={'url':expected_url} and
              answer(navigation)==node['navigation'] and 'errorText' not in node['navigation'])
        frame=node['navigation']['frameId']
        check('same final top frame without children',node['final_frames']['frameTree']['frame']['id']==frame and
              node['final_frames']['frameTree']['frame']['url']==expected_url and
              not node['final_frames']['frameTree'].get('childFrames'))
        ready_path=ROOT/'server/ready.json';ready_raw=ready_path.read_bytes();ready=json.loads(ready_raw)
        server_endpoint=browser['server_endpoint'];server_group=browser['groups']['server']
        check('owner client and original ready object agree',node['ready']==ready==server_endpoint['ready'] and
              node['ready_sha256']==sha(ready_raw)==server_endpoint['ready_identity']['sha256'] and
              file_state(ready_path)==server_endpoint['ready_identity'] and node['page']==expected_url and
              ready['pid']==server_group['pid'] and ready['token']=='hamon-taste143-component-v1-5e567' and
              ready['schema']=='tastetable143.component-server-ready/1')
        raw_line=(ROOT/'server.stdout.bin').read_bytes()
        check('server complete readiness line precedes file admission',0<len(raw_line)<=16384 and
              raw_line.count(b'\n')==1 and raw_line.endswith(b'\n') and json.loads(raw_line)==ready and
              browser['server_ready_stdout']=={'bytes':len(raw_line),'sha256':sha(raw_line),'text':raw_line.decode('utf-8')})
        server_listener=server_endpoint['retained_listener']
        check('server exact loopback listening row',server_endpoint['listeners']==[{
              'family':2,'address':'127.0.0.1','port':server_endpoint['port'],'state':2,
              'pid':server_group['pid'],'scope_id':None}] and
              expected_url=='http://127.0.0.1:'+str(server_endpoint['port'])+'/')
        identity=server_listener['identity']
        check('server retained live exact Python identity',server_listener['pid']==server_group['pid'] and
              identity['handle_pid']==server_group['pid'] and identity['created_filetime']==server_listener['created_filetime'] and
              identity['identity_matches_retained'] is True and identity['in_owned_job'] is True and
              identity['wait_result']==258 and identity['errors']==[] and
              Path(identity['image_path']).resolve()==PYTHON.resolve())
        manifest_raw=(ROOT/'component-fixture/component-freeze.json').read_bytes();manifest=json.loads(manifest_raw)
        check('exact fixed twelve-file server manifest',len(manifest_raw)==2298 and
              sha(manifest_raw)==ready['manifest_sha256']=='13d4ce90a5a4dc13bd1ca441afb18baae15e19a5436fa49f8fbfbba464d2d06a' and len(manifest['files'])==12)
        expected_inputs={('component-fixture/'+name):pin for name,pin in manifest['files'].items()}
        for name in node['component']['fixtures']:
            raw=(ROOT/'fixtures'/name).read_bytes();expected_inputs['fixtures/'+name]={'bytes':len(raw),'sha256':sha(raw)}
        for name in ('component-fixture/component-freeze.json','component_course.mjs','server/ready.json'):
            raw=(ROOT/name).read_bytes();expected_inputs[name]={'bytes':len(raw),'sha256':sha(raw)}
        check('all22 admitted client inputs preserved as whole bytes',len(expected_inputs)==22 and
              node['before']==node['after']==expected_inputs and node['inputs_unchanged'] is True)
        routes=sorted(['/']+['/'+name for name in manifest['files']])
        check('exact thirteen fixed server routes',ready['routes']==routes)
        http=node['requests'];http_rows=[x for x in http if x['url']!='data:,'];data_rows=[x for x in http if x['url']=='data:,']
        expected_urls={expected_url+('' if name=='index.html' else name):name for name in manifest['files']}
        check('all twelve HTTP URLs exactly once',len(http_rows)==12 and len(data_rows)<=1 and
              len(http)==len(node['responses'])==len(node['completions'])==len(node['response_bodies']) and
              sorted(x['url'] for x in http_rows)==sorted(expected_urls) and
              len({x['request_id'] for x in http})==len(http))
        raw_events=[x['value'] for x in protocol if x['direction']=='receive' and 'method' in x['value']]
        for method,values in [('Network.requestWillBeSent',[x['params'] for x in http]),
                              ('Network.responseReceived',node['responses']),('Network.loadingFinished',node['completions'])]:
            check('complete original '+method,[x['params'] for x in raw_events if x['method']==method]==values)
        body_requests=[x for x in sends if x['method']=='Network.getResponseBody']
        check('one original body request per completed asset',len(body_requests)==len(http))
        for row,body,request in zip(http,node['response_bodies'],body_requests):
            label='HTTP '+row['url'];params=row['params'];response=row['response'];completion=row['completion']
            check(label+' raw request identity and safe GET',params['requestId']==row['request_id'] and
                  params['request']['url']==row['url'] and params['request']['method']==row['method']=='GET' and
                  params['frameId']==row['frame_id']==frame and 'redirectResponse' not in params and
                  not params['request'].get('hasPostData') and 'postData' not in params['request'] and
                  not params['request'].get('postDataEntries'))
            check(label+' uncached complete200 response',response in node['responses'] and completion in node['completions'] and
                  response['requestId']==completion['requestId']==row['request_id'] and
                  response['response']['url']==row['url'] and response['response']['status']==200 and
                  not any(response['response'].get(key) for key in ('fromDiskCache','fromServiceWorker','fromPrefetchCache')))
            check(label+' actual body protocol joined',request['params']=={'requestId':row['request_id']})
            result=answer(request)
            check(label+' body encoding type',type(result['base64Encoded']) is bool and type(result['body']) is str)
            raw=base64.b64decode(result['body'],validate=True) if result['base64Encoded'] else result['body'].encode('utf-8')
            check(label+' body receipt exact',body=={'request_id':row['request_id'],'url':row['url'],
                  'bytes':len(raw),'sha256':sha(raw),'base64Encoded':result['base64Encoded']})
            if row['url']=='data:,':
                check('optional only empty literal favicon',raw==b'' and row['type'] in ('Image','Other'))
            else:
                name=expected_urls[row['url']]
                check(label+' exact served file bytes and owned address',raw==(ROOT/'component-fixture'/name).read_bytes() and
                      response['response']['remoteIPAddress']=='127.0.0.1' and
                      response['response']['remotePort']==server_endpoint['port'])
        result_raw=(ROOT/'server/result.json').read_bytes();server_result=json.loads(result_raw)
        check('whole server terminal receipt joined',browser['server_result']=={
              'identity':file_state(ROOT/'server/result.json'),'value':server_result})
        check('server normal fixed stop and full asset custody',server_result['schema']=='tastetable143.component-server-result/1' and
              server_result['outcome']=='PASS' and server_result['errors']==[] and server_result['stop_seen'] is True and
              server_result['pid']==server_group['pid'] and server_result['token']==ready['token'] and
              server_result['before']==server_result['after']==manifest['files'] and browser['server_listener_after']==[])
        stop=ROOT/'server/stop.json'
        check('exact owned stop marker preserved',json.loads(stop.read_bytes())=={
              'schema':'tastetable143.component-stop/1','token':ready['token']} and
              file_state(stop)==browser['server_stop_requested']['identity'])
        requests=server_result['requests'];total=0
        check('exact twelve server-side GETs',len(requests)==12 and sorted(x['path'] for x in requests)==
              sorted('/' if name=='index.html' else '/'+name for name in manifest['files']))
        for row in requests:
            name='index.html' if row['path']=='/' else row['path'][1:];pin=manifest['files'][name]
            check('server actual bytes '+name,row['method']=='GET' and row['host']=='127.0.0.1:'+str(server_endpoint['port']) and
                  row['status']==200 and row['file']==name and 'error' not in row and
                  {k:row[k] for k in ('bytes','sha256')}==pin)
            total+=row['bytes']
        check('server exact total response bytes',total==server_result['response_bytes']<=32*1024*1024)
        verify_component(node['component'],protocol,expected_url,check,record['captures'],png_size)
        record['browser_receipt']={'bytes':len((ROOT/'browser-receipt.json').read_bytes()),
                                   'sha256':sha((ROOT/'browser-receipt.json').read_bytes())}
        record['node_receipt']={'bytes':len(node_raw),'sha256':sha(node_raw)}
        record['outcome']='PASS_PENDING_VISUAL_REVIEW'
    except BaseException:
        record['errors'].append(traceback.format_exc())
    finally:
        try:
            record['after']=state()
            check('final full source/input/runtime/known-consumer preservation',record['after']==before)
        except BaseException:record['errors'].append(traceback.format_exc())
        if record['errors']:record['outcome']='FAIL'
        write_json(ROOT/'parent-receipt.json',record)
        print(json.dumps(record,ensure_ascii=True),flush=True)
    return 0 if record['outcome']=='PASS_PENDING_VISUAL_REVIEW' else 1

if __name__=='__main__':raise SystemExit(main())

