"""Bind only the owned Edge profile's loopback listener to a retained Job handle."""
import ctypes as C
from ctypes import wintypes as W
import hashlib,re,socket,stat
from pathlib import Path
from job_support import checked
from native_process_diagnostics import retained_identity

class TCP4(C.Structure):
    _fields_=[(name,W.DWORD) for name in ('state','local_address','local_port','remote_address','remote_port','pid')]

class TCP6(C.Structure):
    _fields_=[('local_address',C.c_ubyte*16),('local_scope',W.DWORD),('local_port',W.DWORD),
              ('remote_address',C.c_ubyte*16),('remote_scope',W.DWORD),('remote_port',W.DWORD),
              ('state',W.DWORD),('pid',W.DWORD)]

def listener_rows(port):
    """Bounded read-only table; persist only this newly owned endpoint's port."""
    dll=C.WinDLL('iphlpapi',use_last_error=True)
    get=dll.GetExtendedTcpTable
    get.argtypes=[C.c_void_p,C.POINTER(W.DWORD),W.BOOL,W.ULONG,C.c_int,W.ULONG]
    get.restype=W.DWORD
    rows=[]
    for family,structure in ((2,TCP4),(23,TCP6)):
        size=W.DWORD(0)
        code=get(None,C.byref(size),False,family,3,0) # TCP_TABLE_OWNER_PID_LISTENER
        if code not in (0,122):raise OSError(code,'GetExtendedTcpTable size')
        for attempt in range(3):
            if not 4<=size.value<=4*1024*1024:raise ValueError('TCP table allocation bound')
            buffer=C.create_string_buffer(size.value);capacity=size.value
            code=get(buffer,C.byref(size),False,family,3,0)
            if code==122:continue
            if code:raise OSError(code,'GetExtendedTcpTable listener table')
            count=W.DWORD.from_buffer(buffer).value
            if count>16384 or 4+count*C.sizeof(structure)>capacity:
                raise ValueError('TCP listener table row bound')
            for index in range(count):
                row=structure.from_buffer_copy(buffer,4+index*C.sizeof(structure))
                observed_port=socket.ntohs(row.local_port&0xffff)
                if observed_port!=port:continue
                address=(socket.inet_ntop(socket.AF_INET,row.local_address.to_bytes(4,'little'))
                         if family==2 else socket.inet_ntop(socket.AF_INET6,bytes(row.local_address)))
                rows.append({'family':family,'address':address,'port':observed_port,
                             'state':row.state,'pid':row.pid,
                             'scope_id':None if family==2 else row.local_scope})
            break
        else:raise RuntimeError('TCP table changed beyond bounded attempts')
    return rows

def active_port(path):
    meta=path.lstat()
    if (not stat.S_ISREG(meta.st_mode) or stat.S_ISLNK(meta.st_mode) or
            getattr(meta,'st_file_attributes',0)&1024 or not 1<=meta.st_size<=512):
        raise ValueError('Ordinary bounded DevToolsActivePort file required')
    raw=path.read_bytes()
    key=lambda s:(s.st_mode,s.st_size,s.st_mtime_ns,s.st_ctime_ns,s.st_ino,s.st_dev,getattr(s,'st_file_attributes',0))
    if key(path.lstat())!=key(meta):raise ValueError('DevToolsActivePort changed during read')
    text=raw.decode('ascii')
    match=re.fullmatch(r'([1-9][0-9]{0,4})\r?\n(/devtools/browser/[A-Za-z0-9-]+)\r?\n?',text)
    if not match:raise ValueError('Exact DevToolsActivePort grammar required')
    port=int(match[1])
    if port>65535:raise ValueError('Invalid DevTools port')
    return {'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'text':text,
            'port':port,'browser_path':match[2]}

def bind_endpoint(k,job,observed,profile,edge):
    path=profile/'DevToolsActivePort'
    value=active_port(path);rows=listener_rows(value['port'])
    if not rows or not any(r['family']==2 and r['address']=='127.0.0.1' for r in rows):
        raise ValueError('Owned IPv4 loopback listener absent')
    if any(r['state']!=2 or r['address'] not in ('127.0.0.1','::1') for r in rows):
        raise ValueError('Non-loopback or unexpected listener state')
    identities=[]
    for pid in sorted({r['pid'] for r in rows}):
        candidates=[r for r in observed if r['pid']==pid and k.WaitForSingleObject(r['handle'],0)==258]
        if len(candidates)!=1:raise ValueError('Listener lacks one live retained owned identity')
        identity=retained_identity(k,job,candidates[0])
        if (identity['errors'] or not identity['identity_matches_retained'] or
                identity['wait_result']!=258 or Path(identity['image_path']).resolve()!=edge.resolve()):
            raise ValueError('Listener retained image/creation/Job identity differs')
        identities.append({'pid':pid,'created_filetime':candidates[0]['created_filetime'],
                           'identity':identity})
    if len(identities)!=1:raise ValueError('Ambiguous listener process identities')
    if active_port(path)!=value:raise ValueError('DevToolsActivePort changed during binding')
    return {'active_port':value,'listeners':rows,'retained_listener':identities[0],
            'endpoint':'ws://127.0.0.1:'+str(value['port'])+value['browser_path']}

