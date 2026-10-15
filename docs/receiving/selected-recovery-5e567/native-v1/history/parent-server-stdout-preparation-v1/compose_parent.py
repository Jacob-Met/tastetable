"""Compose only source; no product, server, browser or native import."""
from pathlib import Path
import ast,difflib,hashlib,json
H=Path(__file__).resolve().parent
old=(H/'inheritance/receive_view.py').read_text()
new=old[:old.index('def project_metric(')]+old[old.index('def main():'):]
new=new.replace('single saved view288 browser course','single TasteTable143 component browser course')
new=new.replace('from browser_support import ROOT,PYTHON,EDGE,INPUT,sha,write_json,file_state,state',
    'from component_support import ROOT,PYTHON,EDGE,sha,write_json,file_state,state\nfrom component_evidence import verify_component')
new=new.replace('hamon.view288.parent/3','hamon.tastetable143.parent/1')
new=new.replace("str(ROOT/'receive_browser.py')","str(ROOT/'receive_component.py')")
new=new.replace('deadline=210','deadline=220')
new=new.replace("check('one browser and Node',browser['browser_launches']==browser['node_launches']==1)",
    "check('one fixed server browser and Node',browser['server_launches']==browser['browser_launches']==browser['node_launches']==1)")
new=new.replace("for name in ('browser','node'):","for name in ('server','browser','node'):")
new=new.replace("node['schema']=='hamon.view288.node-course/3'","node['schema']=='hamon.tastetable143.node-course/1'")
new=new.replace("node['input_unchanged'] is True","node['inputs_unchanged'] is True")
new=new.replace('expected_url=INPUT.as_uri()',"expected_url=browser['server_endpoint']['url']")
start=new.index("        check('single exact local navigation and request'")
end=new.index("        transcript=(ROOT/'cdp-transcript.ndjson').read_bytes()",start)
new=new[:start]+new[end:]
new=new.replace('len(transcript)<=32*1024*1024','len(transcript)<=64*1024*1024')
new=new.replace("('Page.','Network.','Emulation.','Runtime.','Input.')","('Page.','Network.','Emulation.','Runtime.','Input.','DOM.')")
start=new.index("        pointer=[x for x in sends if x['method']=='Input.dispatchMouseEvent']")
end=new.index("        record['browser_receipt']=",start)
block=r'''        check('no pointer automation in keyboard component course',not any(x['method']=='Input.dispatchMouseEvent' for x in sends))
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
'''
new=new[:start]+block+new[end:]
ast.parse(new)
(H/'candidate/receive_taste.py').write_text(new)
(H/'inheritance/receive-taste.diff').write_text(''.join(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='V3/receive_view.py',tofile='Taste143/receive_taste.py')))
child=(H/'inheritance/child_lifecycle.py').read_text()
successor=child.replace('from browser_support import','from component_support import').replace('> 2 * 1024**2','> 8 * 1024**2')
ast.parse(successor)
(H/'candidate/child_lifecycle.py').write_text(successor)
(H/'inheritance/child-lifecycle.diff').write_text(''.join(difflib.unified_diff(child.splitlines(True),successor.splitlines(True),fromfile='V3/child_lifecycle.py',tofile='Taste143/child_lifecycle.py')))
pins={}
for name in ('receive_taste.py','component_evidence.py','child_lifecycle.py'):
    path=H/'candidate'/name;raw=path.read_bytes();ast.parse(raw)
    pins[name]={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
(H/'parent-composition.json').write_text(json.dumps({'application_calls':0,'files':pins},indent=2)+'\n')
print(json.dumps(pins,indent=2))
