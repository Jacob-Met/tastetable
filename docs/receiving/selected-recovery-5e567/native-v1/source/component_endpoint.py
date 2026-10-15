"""Bind the fixed asset server's ready file and listener to its retained child."""
from pathlib import Path
import json,re
from browser_endpoint import listener_rows
from native_process_diagnostics import retained_identity

def bind_server(k,job,observed,direct_pid,ready_path,python,token,manifest_sha,expected_routes,file_state):
    before=file_state(ready_path)
    if not 1<=before['bytes']<=16384:raise ValueError('Server ready receipt byte bound')
    raw=ready_path.read_bytes()
    if file_state(ready_path)!=before:raise ValueError('Server ready identity changed during read')
    ready=json.loads(raw)
    if type(ready) is not dict or set(ready)!={'schema','pid','token','url','routes','manifest_sha256'}:
        raise ValueError('Server ready closed fields')
    if (ready['schema']!='tastetable143.component-server-ready/1' or
            type(ready['pid']) is not int or ready['pid']!=direct_pid or
            ready['token']!=token or ready['manifest_sha256']!=manifest_sha or
            ready['routes']!=expected_routes or not isinstance(ready['url'],str)):
        raise ValueError('Fixed server ready content differs')
    match=re.fullmatch(r'http://127\.0\.0\.1:([1-9][0-9]{0,4})/',ready['url'])
    if not match or int(match[1])>65535:raise ValueError('Exact server IPv4 loopback URL required')
    port=int(match[1]);rows=listener_rows(port)
    expected={'family':2,'address':'127.0.0.1','port':port,'state':2,'pid':direct_pid,'scope_id':None}
    if rows!=[expected]:raise ValueError('Server listener is not the exact retained direct Python child')
    candidates=[row for row in observed if row['pid']==direct_pid and
                k.WaitForSingleObject(row['handle'],0)==258]
    if len(candidates)!=1:raise ValueError('Server lacks one live retained direct identity')
    identity=retained_identity(k,job,candidates[0])
    if (identity['errors'] or not identity['identity_matches_retained'] or
            identity['wait_result']!=258 or Path(identity['image_path']).resolve()!=python.resolve()):
        raise ValueError('Server retained image/creation/Job identity differs')
    if file_state(ready_path)!=before or ready_path.read_bytes()!=raw:
        raise ValueError('Server ready bytes or identity changed during binding')
    return {'ready':ready,'ready_identity':before,'listeners':rows,
            'retained_listener':{'pid':direct_pid,'created_filetime':candidates[0]['created_filetime'],
                                 'identity':identity},'url':ready['url'],'port':port}
