"""One fixed asset server, isolated Edge tree and Node component client; owned lifetimes only."""
from pathlib import Path
import ctypes as C
from ctypes import wintypes as W
import json,os,stat,subprocess,sys,time,traceback
from component_support import ROOT,EDGE,NODE,PYTHON,PROFILE,WORKING,sha,write_json,file_state,state,admit
from job_support import api,ExtendedLimits,checked,job_pids,observe,resume_owned_primary,utc
from native_process_diagnostics import configure,retained_identity,PROCESSENTRY32W
from process_diagnostics import wait_retained_handles
from browser_endpoint import bind_endpoint,listener_rows
from component_endpoint import bind_server

COURSE_SECONDS=180
STARTUP_SECONDS=30
CLEANUP_SECONDS=20
SERVER_STARTUP_SECONDS=15
SERVER_RUN=ROOT/'server'
SERVER_TOKEN='hamon-taste143-component-v1-5e567'
SERVER_MANIFEST_SHA='13d4ce90a5a4dc13bd1ca441afb18baae15e19a5436fa49f8fbfbba464d2d06a'
NODE_RECEIPT_LIMIT=32*1024*1024
STREAM_LIMITS={'node.stdout.bin':32*1024*1024,'node.stderr.bin':1024*1024,
               'browser.stdout.bin':1024*1024,'browser.stderr.bin':1024*1024,
               'server.stdout.bin':1024*1024,'server.stderr.bin':1024*1024}


def ordinary_directory(path):
    s=path.lstat()
    if not stat.S_ISDIR(s.st_mode) or stat.S_ISLNK(s.st_mode) or getattr(s,'st_file_attributes',0)&1024:
        raise ValueError('Ordinary owned directory required: '+str(path))

def existing_edge(k):
    """Read only same-name process identities; no command line, profile, tab or URL."""
    snap=k.CreateToolhelp32Snapshot(2,0)
    if snap==C.c_void_p(-1).value:raise OSError(C.get_last_error(),'Process identity snapshot')
    candidates=[];count=0;stop=time.monotonic()+2
    try:
        row=PROCESSENTRY32W();row.dwSize=C.sizeof(row)
        ok=k.Process32FirstW(snap,C.byref(row))
        while ok:
            count+=1
            if count>16384 or time.monotonic()>=stop:raise ValueError('Process snapshot bound')
            if row.szExeFile.casefold()=='msedge.exe':candidates.append(int(row.th32ProcessID))
            row.dwSize=C.sizeof(row);ok=k.Process32NextW(snap,C.byref(row))
        if C.get_last_error()!=18:raise OSError(C.get_last_error(),'Process snapshot incomplete')
    finally:checked(k.CloseHandle(snap),'Close identity snapshot')
    result=[]
    for pid in candidates:
        h=k.OpenProcess(0x100000|0x1000,False,pid)
        if not h:
            result.append({'snapshot_pid':pid,'open_error':C.get_last_error(),'retained_identity':False})
            continue
        try:
            actual=k.GetProcessId(h);checked(actual,'Existing Edge GetProcessId')
            if actual!=pid:raise ValueError('Existing opened identity PID mismatch')
            times=[C.c_ulonglong() for _ in range(4)]
            checked(k.GetProcessTimes(h,*(C.byref(x) for x in times)),'Existing Edge creation')
            name=C.create_unicode_buffer(32768);length=W.DWORD(len(name))
            checked(k.QueryFullProcessImageNameW(h,0,name,C.byref(length)),'Existing Edge image')
            if not 0<length.value<len(name):raise ValueError('Existing Edge image bound')
            result.append({'pid':pid,'created_filetime':times[0].value,'image_path':name.value,
                           'wait_result':int(k.WaitForSingleObject(h,0)),'retained_identity':True})
        finally:checked(k.CloseHandle(h),'Close read-only existing Edge handle')
    return result

def main():
    if os.name!='nt' or sys.version_info[:3]!=(3,12,2) or Path(sys.executable).resolve()!=PYTHON.resolve():
        raise ValueError('Exact Python 3.12.2 controller required')
    if sys.argv[1:]!=['--execute-after-review']:raise ValueError('Reviewed fixed course only')
    admit();before=state()
    for p in (PROFILE,WORKING,SERVER_RUN):
        if os.path.lexists(p):raise FileExistsError('Owned new path already exists: '+str(p))
    PROFILE.mkdir();WORKING.mkdir()
    ordinary_directory(PROFILE);ordinary_directory(WORKING)
    rec={'schema':'hamon.tastetable143.browser-lifetime/1','outcome':'FAIL','started_utc':utc(),
         'controller_pid':os.getpid(),'controller_executable':sys.executable,
         'before':before,'checks':[],'errors':[],'groups':{},'endpoint':None,
         'server_launches':0,'browser_launches':0,'node_launches':0,'forced_cleanup':False,'startup_trace':[],
         'server_endpoint':None,'server_startup_seconds':SERVER_STARTUP_SECONDS,
         'node_receipt_limit':NODE_RECEIPT_LIMIT,'stream_limits':STREAM_LIMITS,
         'whole_seconds':COURSE_SECONDS,'startup_seconds':STARTUP_SECONDS,
         'cleanup_seconds':CLEANUP_SECONDS}
    started=time.monotonic();deadline=started+COURSE_SECONDS
    k=None;groups=[];streams=[];server=None
    events=(ROOT/'lifetime-events.ndjson').open('xb',buffering=0)
    def event(kind,value):
        raw=(json.dumps({'utc':utc(),'elapsed':time.monotonic()-started,'kind':kind,'value':value},ensure_ascii=True)+'\n').encode()
        events.write(raw);os.fsync(events.fileno())
    def safe_event(kind,value):
        try:event(kind,value)
        except BaseException as e:rec['errors'].append({'phase':'event','error':repr(e)})
    def check(name,value):
        row={'name':name,'pass':bool(value)};rec['checks'].append(row);event('check',row)
        if not value:raise AssertionError(name)
    def remaining(cap=COURSE_SECONDS):
        left=min(cap,deadline-time.monotonic())
        if left<=0:raise TimeoutError('Single 180-second receiving deadline')
        return left
    def observe_group(group):
        old=len(group['retained'])
        pids=observe(k,group['job'],group['retained'],group['record']['unknown_snapshots'])
        if len(pids)>128 or len(group['retained'])>512 or len(group['record']['unknown_snapshots'])>512:
            raise ValueError('Owned process observation bound')
        for row in group['retained'][old:]:
            identity=retained_identity(k,group['job'],row)
            value={key:item for key,item in row.items() if key!='handle'}
            value['identity_observation']=identity
            group['record']['retained_identities'].append(value)
            if (row['pid'],row['created_filetime']) in excluded:
                raise ValueError('Pre-existing Edge identity unexpectedly appeared in owned Job')
            event('retained_'+group['name'],value)
        if pids!=group['last_members']:
            group['last_members']=pids
            event('members_'+group['name'],pids)
        return pids
    def create_group(name,argv,image):
        job=k.CreateJobObjectW(None,None);checked(job,'Create owned '+name+' Job')
        group={'name':name,'job':job,'child':None,'assigned':False,'retained':[],'last_members':None,
               'record':{'argv':argv,'cwd':str(WORKING),'image':str(image),'creationflags':0x08000004,
                         'retained_identities':[],'unknown_snapshots':[]}}
        groups.append(group);rec['groups'][name]=group['record']
        limits=ExtendedLimits();limits.basic.flags=0x2000
        checked(k.SetInformationJobObject(job,9,C.byref(limits),C.sizeof(limits)),'Set owned Job kill-on-close')
        out=(ROOT/(name+'.stdout.bin')).open('xb',buffering=0);streams.append(out)
        err=(ROOT/(name+'.stderr.bin')).open('xb',buffering=0);streams.append(err)
        event('launch_'+name,group['record'])
        child=subprocess.Popen(argv,cwd=WORKING,stdin=subprocess.DEVNULL,stdout=out,stderr=err,
                               creationflags=0x08000004,close_fds=True)
        group['child']=child;group['record']['pid']=child.pid
        rec[name+'_launches']+=1
        handle=W.HANDLE(int(child._handle))
        checked(k.AssignProcessToJobObject(job,handle),'Assign newly suspended '+name)
        group['assigned']=True
        observe_group(group)
        direct=[row for row in group['retained'] if row['pid']==child.pid]
        if len(direct)!=1:raise ValueError('Direct child retained identity absent')
        identity=retained_identity(k,job,direct[0])
        if (identity['errors'] or not identity['identity_matches_retained'] or
                identity['wait_result']!=258 or Path(identity['image_path']).resolve()!=image.resolve()):
            raise ValueError('Direct suspended child identity differs')
        group['record']['direct_before_resume']=identity
        group['record']['primary_thread']=resume_owned_primary(k,child.pid,handle,job)
        return group
    def check_stream_caps():
        for name,bound in STREAM_LIMITS.items():
            path=ROOT/name
            if path.exists() and path.stat().st_size>bound:
                raise ValueError('Sampled fixed child stream bound: '+name)
        transcript=ROOT/'cdp-transcript.ndjson'
        if transcript.exists() and transcript.stat().st_size>64*1024*1024:
            raise ValueError('Sampled component transcript bound')
    def server_binding():
        if server is None or server['child'].poll() is not None:
            raise ValueError('Owned fixed asset server exited before normal parent stop')
        observe_group(server)
        if server['record']['unknown_snapshots']:
            raise ValueError('Unattributed owned server process observation')
        return bind_server(k,server['job'],server['retained'],server['child'].pid,
                           SERVER_RUN/'ready.json',PYTHON,SERVER_TOKEN,SERVER_MANIFEST_SHA,
                           expected_routes,file_state)
    def close_handle(h):
        checked(k.CloseHandle(h),'Close retained owned process handle')
    def exit_code(h):
        code=W.DWORD();checked(k.GetExitCodeProcess(h,C.byref(code)),'Retained exit code')
        return int(code.value)
    excluded=set()
    try:
        k=api();configure(k)
        rec['existing_edge_before']=existing_edge(k)
        excluded={(x['pid'],x['created_filetime']) for x in rec['existing_edge_before'] if x['retained_identity']}
        manifest_raw=(ROOT/'component-fixture/component-freeze.json').read_bytes()
        if sha(manifest_raw)!=SERVER_MANIFEST_SHA:raise ValueError('Fixed server manifest differs')
        fixture_manifest=json.loads(manifest_raw);asset_pins=fixture_manifest['files']
        expected_routes=sorted(['/']+['/'+name for name in asset_pins])
        server_argv=[str(PYTHON),'-B','-s',str(ROOT/'serve_component.py'),
                     '--root',str(ROOT/'component-fixture'),'--manifest-sha256',SERVER_MANIFEST_SHA,
                     '--run-dir',str(SERVER_RUN),'--token',SERVER_TOKEN]
        server=create_group('server',server_argv,PYTHON)
        server_stop=min(deadline,time.monotonic()+SERVER_STARTUP_SECONDS)
        while True:
            remaining();check_stream_caps()
            if time.monotonic()>=server_stop:raise TimeoutError('Fixed asset server startup deadline')
            observe_group(server)
            if server['record']['unknown_snapshots']:
                raise ValueError('Unattributed owned server process observation')
            if server['child'].poll() is not None:
                raise RuntimeError('Fixed asset server exited before ready')
            if (SERVER_RUN/'ready.json').exists():
                ordinary_directory(SERVER_RUN)
                rec['server_endpoint']=server_binding()
                remaining()
                if time.monotonic()>=server_stop:raise TimeoutError('Fixed asset server startup deadline')
                break
            time.sleep(min(.1,max(0,server_stop-time.monotonic())))
        event('admitted_server_endpoint',rec['server_endpoint'])
        edge_argv=[str(EDGE),'--headless=new','--remote-debugging-address=127.0.0.1',
                   '--remote-debugging-port=0','--user-data-dir='+str(PROFILE),
                   '--window-size=1280,960','--no-first-run','--no-default-browser-check',
                   '--disable-background-networking','--disable-component-update','--disable-sync',
                   '--metrics-recording-only','about:blank']
        browser=create_group('browser',edge_argv,EDGE)
        startup_started=time.monotonic()
        startup_stop=min(deadline,startup_started+STARTUP_SECONDS)
        portfile=PROFILE/'DevToolsActivePort';previous_startup_key=None
        while True:
            remaining()
            if time.monotonic()>=startup_stop:raise TimeoutError('Owned endpoint startup deadline')
            check_stream_caps()
            observe_group(server)
            if server['child'].poll() is not None or server['record']['unknown_snapshots']:
                raise ValueError('Fixed server lost during owned browser startup')
            members=observe_group(browser)
            if browser['record']['unknown_snapshots']:
                raise ValueError('Unattributed owned startup process observation')
            direct_code=browser['child'].poll()
            if direct_code is not None and (type(direct_code) is not int or direct_code!=0):
                raise RuntimeError('Owned Edge starter exited nonzero before endpoint')
            if not members:raise RuntimeError('Owned Edge Job empty before endpoint')
            identities=[]
            for pid in members:
                matches=[row for row in browser['retained'] if row['pid']==pid and
                         k.WaitForSingleObject(row['handle'],0)==258]
                if len(matches)!=1:raise ValueError('Startup member lacks one live retained identity')
                row=matches[0];identity=retained_identity(k,browser['job'],row)
                if (identity['errors'] or not identity['identity_matches_retained'] or
                        identity['wait_result']!=258 or
                        Path(identity['image_path']).resolve()!=EDGE.resolve()):
                    raise ValueError('Startup retained image/creation/Job identity differs')
                identities.append({'pid':pid,'created_filetime':row['created_filetime'],
                                   'identity':identity})
            present=portfile.exists();observed_at=time.monotonic()
            if observed_at>=startup_stop:raise TimeoutError('Owned endpoint startup deadline')
            state_name=('endpoint_candidate' if present else
                        'waiting_direct' if direct_code is None else 'waiting_owned')
            key=(direct_code,tuple((x['pid'],x['created_filetime']) for x in identities),present)
            if key!=previous_startup_key:
                if len(rec['startup_trace'])>=320:raise ValueError('Owned startup trace bound')
                observation={'elapsed_seconds':observed_at-startup_started,
                             'direct_returncode':direct_code,'current_members':members,
                             'identities':identities,'port_file_present':present,'state':state_name}
                rec['startup_trace'].append(observation);event('startup_state',observation)
                previous_startup_key=key
            remaining()
            if time.monotonic()>=startup_stop:raise TimeoutError('Owned endpoint startup deadline')
            if present:break
            time.sleep(min(.1,max(0,startup_stop-time.monotonic())))
        ordinary_directory(PROFILE)
        observe_group(browser)
        rec['endpoint']=bind_endpoint(k,browser['job'],browser['retained'],PROFILE,EDGE)
        event('admitted_endpoint',rec['endpoint'])
        # Endpoint identity, active-port bytes and all source/runtime pins are rechecked
        # immediately before creating the only client of this private endpoint.
        admit()
        if bind_endpoint(k,browser['job'],browser['retained'],PROFILE,EDGE)!=rec['endpoint']:
            raise ValueError('Endpoint identity changed before client launch')
        if server_binding()!=rec['server_endpoint']:
            raise ValueError('Fixed server ready/listener identity changed before client')
        node_argv=[str(NODE),str(ROOT/'component_client.mjs'),rec['endpoint']['endpoint'],
                   str(int(remaining()*1000)),rec['server_endpoint']['ready_identity']['sha256']]
        node=create_group('node',node_argv,NODE)
        while node['child'].poll() is None:
            remaining()
            for group in groups:observe_group(group)
            check_stream_caps()
            if server['child'].poll() is not None or server['record']['unknown_snapshots']:
                raise ValueError('Fixed server lost during component course')
            time.sleep(.1)
        for group in groups:observe_group(group)
        rec['node_returncode']=node['child'].returncode
        raw=(ROOT/'node-receipt.json').read_bytes()
        check_stream_caps()
        if len(raw)>NODE_RECEIPT_LIMIT:raise ValueError('Node receipt size bound')
        result=json.loads(raw)
        rec['node_receipt']={'bytes':len(raw),'sha256':sha(raw)}
        check('Node receipt schema',result['schema']=='hamon.tastetable143.node-course/1')
        check('Node retained endpoint exact',result['endpoint']==rec['endpoint']['endpoint'])
        check('Node normal exit and semantic course PASS',node['child'].returncode==0 and result['outcome']=='PASS')
        component=result['component']
        check('Node observed terminal socket and exact fixed component course',
              result['socket_terminal_observed'] is True and component['outcome']=='PASS' and
              component['page']==rec['server_endpoint']['url'] and
              len(component['captures'])==2 and len(component['observations'])<=120 and
              len([x for x in component['actions'] if x['kind']=='real-file-input'])==4 and
              component['fixturesUnchanged'] is True)
        check('Fixed server identity retained through component completion',
              server_binding()==rec['server_endpoint'])
        check('Browser.close actually requested',result['close'].get('requested_utc') is not None and
              'result' in result['close'] and 'error' not in result['close'])
        rec['normal_close_requested']=True
        rec['outcome']='PASS_PENDING_OWNED_CLEANUP_AND_VISUAL_REVIEW'
    except BaseException:
        rec['errors'].append({'phase':'course','traceback':traceback.format_exc()})
        safe_event('course_error',rec['errors'][-1])
    finally:
        # A single cleanup deadline covers every owned Job, direct process and retained
        # handle. No existing browser is signaled, closed or terminated.
        cleanup_deadline=time.monotonic()+CLEANUP_SECONDS
        rec['cleanup_deadline_monotonic']=cleanup_deadline
        # The fixed Node may have requested normal browser close before a semantic
        # failure. Read this existing receipt solely to allow bounded normal drainage.
        graceful=bool(rec.get('normal_close_requested'))
        try:
            p=ROOT/'node-receipt.json'
            if p.exists() and p.stat().st_size<=NODE_RECEIPT_LIMIT:
                value=json.loads(p.read_bytes())
                graceful=graceful or (value.get('close',{}).get('requested_utc') is not None
                                      and 'result' in value.get('close',{}))
        except BaseException as e:rec['errors'].append({'phase':'cleanup close evidence','error':repr(e)})
        # Stop only this fixed server through its reviewed data marker. A marker
        # written after an already terminal server would not establish normal stop.
        if server is not None and server['child'] is not None and server['child'].poll() is None:
            try:
                ordinary_directory(SERVER_RUN)
                stop=SERVER_RUN/'stop.json'
                if os.path.lexists(stop):raise FileExistsError('Unexpected existing server stop marker')
                write_json(stop,{'schema':'tastetable143.component-stop/1','token':SERVER_TOKEN})
                rec['server_stop_requested']={'utc':utc(),'identity':file_state(stop)}
                safe_event('server_stop_requested',rec['server_stop_requested'])
            except BaseException as e:rec['errors'].append({'phase':'normal server stop','error':repr(e)})
        if k and (graceful or rec.get('server_stop_requested')):
            grace_stop=cleanup_deadline-5
            try:
                while time.monotonic()<grace_stop:
                    active=[]
                    for group in groups:
                        if not graceful and group['name']!='server':continue
                        if group['assigned']:active.extend(observe_group(group))
                        if group['child'] is not None and group['child'].poll() is None:
                            active.append(group['child'].pid)
                    if not active:break
                    time.sleep(.1)
            except BaseException as e:rec['errors'].append({'phase':'normal drainage','error':repr(e)})
        for group in groups:
            try:
                if group['assigned']:
                    members=observe_group(group)
                    if members:
                        checked(k.TerminateJobObject(group['job'],124),'Terminate only owned '+group['name']+' Job')
                        rec['forced_cleanup']=True;group['record']['forced_cleanup']=True
                child=group['child']
                if child is not None and child.poll() is None and not group['assigned']:
                    child.terminate() # exact still-retained Popen identity, never a PID-only lookup
                    rec['forced_cleanup']=True;group['record']['forced_cleanup']=True
            except BaseException as e:rec['errors'].append({'phase':group['name']+' owned termination','error':repr(e)})
        for group in groups:
            try:
                child=group['child']
                if child is not None:
                    child.wait(timeout=max(0,cleanup_deadline-time.monotonic()))
                    group['record']['direct_returncode']=child.returncode
                if group['assigned']:
                    while job_pids(k,group['job']) and time.monotonic()<cleanup_deadline:
                        observe_group(group);time.sleep(.05)
                    group['record']['job_active_at_teardown']=job_pids(k,group['job'])
                    if group['record']['job_active_at_teardown']:raise RuntimeError('Owned Job failed to empty')
            except BaseException as e:rec['errors'].append({'phase':group['name']+' terminal','error':repr(e)})
            try:
                group['record']['retained_waits']=wait_retained_handles(
                    group['retained'],deadline=cleanup_deadline,forced_cleanup=rec['forced_cleanup'],
                    monotonic=time.monotonic,wait=lambda h,ms:int(k.WaitForSingleObject(h,ms)),
                    exit_code=exit_code,close=close_handle,utc=utc)
            except BaseException as e:rec['errors'].append({'phase':group['name']+' retained waits','error':repr(e)})
            finally:
                if group['child'] is not None:
                    try:
                        group['child']._handle.Close()
                        group['record']['direct_handle_closed']=True
                    except BaseException as e:rec['errors'].append({'phase':group['name']+' direct handle','error':repr(e)})
                try:checked(k.CloseHandle(group['job']),'Close owned '+group['name']+' Job')
                except BaseException as e:rec['errors'].append({'phase':group['name']+' Job handle','error':repr(e)})
        for stream in streams:
            try:stream.close()
            except BaseException as e:rec['errors'].append({'phase':'stream close','error':repr(e)})
        try:
            check_stream_caps()
            result_path=SERVER_RUN/'result.json'
            if not result_path.exists():raise ValueError('Fixed server terminal receipt absent')
            server_raw=result_path.read_bytes()
            if len(server_raw)>1024*1024:raise ValueError('Fixed server terminal receipt bound')
            result=json.loads(server_raw)
            rec['server_result']={'identity':file_state(result_path),'value':result}
            check('Fixed server normal stop and unchanged selected assets',
                  server is not None and result['schema']=='tastetable143.component-server-result/1' and
                  result['outcome']=='PASS' and result['pid']==server['child'].pid and
                  result['token']==SERVER_TOKEN and result['stop_seen'] is True and
                  rec.get('server_stop_requested') is not None and result['errors']==[] and
                  result['before']==asset_pins and result['after']==asset_pins)
            requests=result['requests']
            check('Fixed server bounded actual asset requests',
                  type(requests) is list and 1<=len(requests)<=128)
            total=0
            for row in requests:
                name='index.html' if row['path']=='/' else row['path'][1:]
                expected=asset_pins.get(name)
                check('Fixed served asset '+row['path'],
                      row['method']=='GET' and row['host']=='127.0.0.1:'+str(rec['server_endpoint']['port']) and
                      row['path'] in expected_routes and row.get('status')==200 and
                      row.get('file')==name and expected is not None and
                      {'bytes':row['bytes'],'sha256':row['sha256']}==expected and 'error' not in row)
                total+=row['bytes']
            check('Fixed server exact response-byte accounting',total==result['response_bytes'] and total<=32*1024*1024)
            rec['server_listener_after']=listener_rows(rec['server_endpoint']['port'])
            check('Owned fixed server listener closed',rec['server_listener_after']==[])
        except BaseException:
            rec['errors'].append({'phase':'server final evidence','traceback':traceback.format_exc()})
        try:
            rec['after']=state()
            check('known consumer input runtime and frozen bytes preserved',rec['after']==before)
            if k:rec['existing_edge_after']=existing_edge(k)
            check('one fixed server browser and Node launch',
                  rec['server_launches']==1 and rec['browser_launches']==1 and rec['node_launches']==1)
            check('all captured owned handles terminal with normal cleanup',
                  bool(groups) and all(g['record'].get('retained_waits',{}).get('normal_cleanup') is True
                  and len(g['record']['retained_waits']['handles'])>0 for g in groups))
            check('all owned Jobs empty and direct exits normal zero',
                  len(groups)==3 and all(g['record'].get('job_active_at_teardown')==[] and
                  g['record'].get('direct_returncode')==0 for g in groups))
            check('no forced cleanup',not rec['forced_cleanup'])
        except BaseException:
            rec['errors'].append({'phase':'final preservation/lifetime','traceback':traceback.format_exc()})
        if rec['errors'] or rec['forced_cleanup'] or rec['outcome']!='PASS_PENDING_OWNED_CLEANUP_AND_VISUAL_REVIEW':
            rec['outcome']='FAIL'
        else:rec['outcome']='PASS_PENDING_VISUAL_REVIEW'
        rec['finished_utc']=utc();rec['elapsed_seconds']=time.monotonic()-started
        safe_event('terminal',{'outcome':rec['outcome'],'errors':rec['errors']})
        if rec['errors']:rec['outcome']='FAIL'
        events.close()
        write_json(ROOT/'browser-receipt.json',rec)
        print(json.dumps(rec,ensure_ascii=True),flush=True)
    return 0 if rec['outcome']=='PASS_PENDING_VISUAL_REVIEW' else 1

if __name__=='__main__':raise SystemExit(main())

