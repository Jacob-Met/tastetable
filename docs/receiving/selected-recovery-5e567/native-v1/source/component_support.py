"""TasteTable143 bounded source/runtime/policy and known-consumer custody; no app calls."""
from pathlib import Path
import hashlib,json,os,stat,sys,winreg
ROOT=Path(r'C:\Users\jacob\hamon-remote-receiving-5e5670099628-tastetable143-v1')
EDGE=Path(r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')
NODE=Path(r'C:\Program Files\nodejs\node.exe')
PYTHON=Path(r'C:\Users\jacob\AppData\Local\Programs\Python\Python312\python.exe')
ADMISSION_SOURCE=Path(r'C:\Users\jacob\hamon-taste143-admission-v1.py')
FRESH_CARRIER=Path(r'C:\Users\jacob\hamon-taste143-fresh-v1.json')
PROFILE=ROOT/'edge-profile'
WORKING=ROOT/'working'
TOOLS=Path(r'C:\Users\jacob\.local\share\hamon-tools')
RUNTIME_PINS={
    str(EDGE):{'bytes':5403976,'sha256':'f530bafcdb7e529bd21dd8be46e20c82b5c70fa0ffd770fe4c45a5c2c054c211'},
    str(NODE):{'bytes':91380224,'sha256':'63c259c81e5d472b5f11c8d506070130cb04a1ecf84b80377a34ed6ec9048088'},
    str(PYTHON):{'bytes':103192,'sha256':'624bbc0586d8855633b875e911883bbef8a0e8b8711e11126df480dd86f54181'},
}
sha=lambda raw:hashlib.sha256(raw).hexdigest()

def exclusive(path,raw):
    with path.open('xb') as stream:
        if stream.write(raw)!=len(raw):raise OSError('Short exclusive file write')
        stream.flush();os.fsync(stream.fileno())
    return {'bytes':len(raw),'sha256':sha(raw)}

def write_json(path,value):
    return exclusive(path,(json.dumps(value,ensure_ascii=True,indent=2)+'\n').encode())

def file_state(path):
    before=path.lstat()
    if not stat.S_ISREG(before.st_mode) or stat.S_ISLNK(before.st_mode) or getattr(before,'st_file_attributes',0)&1024:
        raise ValueError('Ordinary file required: '+str(path))
    raw=path.read_bytes();after=path.lstat()
    fields=lambda s:(s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_mode)
    if fields(before)!=fields(after):raise ValueError('File changed during read: '+str(path))
    return {'bytes':len(raw),'sha256':sha(raw),
            'git_blob':hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest(),
            'mode':after.st_mode,'mtime_ns':after.st_mtime_ns,'inode':after.st_ino,'device':after.st_dev}

def ordinary_directory(path):
    s=path.lstat()
    if not stat.S_ISDIR(s.st_mode) or stat.S_ISLNK(s.st_mode) or getattr(s,'st_file_attributes',0)&1024:
        raise ValueError('Ordinary directory required: '+str(path))
    return {'mode':s.st_mode,'mtime_ns':s.st_mtime_ns,'inode':s.st_ino,'device':s.st_dev}

def tree_state(root):
    result={'directories':{'.':ordinary_directory(root)},'files':{}}
    for base,dirs,names in os.walk(root,followlinks=False):
        for name in sorted(dirs):
            p=Path(base)/name;result['directories'][p.relative_to(root).as_posix()]=ordinary_directory(p)
        for name in sorted(names):
            p=Path(base)/name;result['files'][p.relative_to(root).as_posix()]=file_state(p)
    return result


def prior_v1_state(spec):
    """Read only the fixed original failed allocation and two exact external files."""
    prior=Path(spec['root']);current=tree_state(prior)
    if set(current['files'])!=set(spec['files']) or set(current['directories'])!=set(spec['directories']):
        raise ValueError('Original V1 closed file/directory membership differs')
    for name,pin in spec['files'].items():
        if any(current['files'][name][key]!=value for key,value in pin.items()):
            raise ValueError('Original V1 file bytes differ: '+name)
    for name,value in spec['known_file_metadata'].items():
        if current['files'][name]!=value:raise ValueError('Original V1 recorded file identity differs: '+name)
    for name,value in spec['known_directory_metadata'].items():
        if current['directories'][name]!=value:raise ValueError('Original V1 recorded directory identity differs: '+name)
    external={name:file_state(Path(name)) for name in spec['external']}
    if external!=spec['external']:raise ValueError('Original V1 preparer/archive identity differs')
    return {'root':str(prior),'tree':current,'external':external}

def prior_v2_state(spec):
    """Read only the fixed original failed allocation and two exact external files."""
    prior=Path(spec['root']);current=tree_state(prior)
    if set(current['files'])!=set(spec['files']) or set(current['directories'])!=set(spec['directories']):
        raise ValueError('Original V2 closed file/directory membership differs')
    for name,pin in spec['files'].items():
        if any(current['files'][name][key]!=value for key,value in pin.items()):
            raise ValueError('Original V2 file bytes differ: '+name)
    for name,value in spec['known_file_metadata'].items():
        if current['files'][name]!=value:raise ValueError('Original V2 recorded file identity differs: '+name)
    for name,value in spec['known_directory_metadata'].items():
        if current['directories'][name]!=value:raise ValueError('Original V2 recorded directory identity differs: '+name)
    external={name:file_state(Path(name)) for name in spec['external']}
    if external!=spec['external']:raise ValueError('Original V2 preparer/archive identity differs')
    return {'root':str(prior),'tree':current,'external':external}

def prior_v3_state(spec):
    """Read only the fixed original completed allocation and four exact external files."""
    prior=Path(spec['root']);current=tree_state(prior)
    if set(current['files'])!=set(spec['files']) or set(current['directories'])!=set(spec['directories']):
        raise ValueError('Original V3 closed file/directory membership differs')
    for name,pin in spec['files'].items():
        if any(current['files'][name][key]!=value for key,value in pin.items()):
            raise ValueError('Original V3 file bytes differ: '+name)
    for name,value in spec['known_file_metadata'].items():
        if current['files'][name]!=value:raise ValueError('Original V3 recorded file identity differs: '+name)
    for name,value in spec['known_directory_metadata'].items():
        if current['directories'][name]!=value:raise ValueError('Original V3 recorded directory identity differs: '+name)
    external={name:file_state(Path(name)) for name in spec['external']}
    if external!=spec['external']:raise ValueError('Original V3 preparer/archive identity differs')
    return {'root':str(prior),'tree':current,'external':external}

def policies():
    """Only the five previously reviewed Edge policy names; no policy mutation."""
    base=r'SOFTWARE\Policies\Microsoft\Edge'
    result={}
    for label,hive in (('HKLM',winreg.HKEY_LOCAL_MACHINE),('HKCU',winreg.HKEY_CURRENT_USER)):
        values={}
        for name in ('HeadlessModeEnabled','RemoteDebuggingAllowed','DeveloperToolsAvailability'):
            try:
                with winreg.OpenKey(hive,base,0,winreg.KEY_READ|winreg.KEY_WOW64_64KEY) as key:
                    value,kind=winreg.QueryValueEx(key,name)
                values[name]={'present':True,'type':kind,'value':value}
            except FileNotFoundError:values[name]={'present':False}
        for name in ('DeveloperToolsAvailabilityAllowlist','DeveloperToolsAvailabilityBlocklist'):
            try:
                with winreg.OpenKey(hive,base+'\\'+name,0,winreg.KEY_READ|winreg.KEY_WOW64_64KEY) as key:
                    # Presence alone stops this course; no unknown URL-list interpretation.
                    values[name]={'present':True}
            except FileNotFoundError:values[name]={'present':False}
        result[label]=values
    if any(item['present'] for values in result.values() for item in values.values()):
        raise ValueError('Reviewed absent policy baseline changed; no policy override permitted')
    return result

def ambient_admit():
    # Node built-in imports and loopback WebSocket must not be altered by ambient
    # preloads, module lookup, proxy opt-in, or writes to an external coverage/cache path.
    names=('NODE_OPTIONS','NODE_PATH','NODE_USE_ENV_PROXY','NODE_V8_COVERAGE','NODE_COMPILE_CACHE')
    present=[name for name in names if os.environ.get(name)]
    if present:raise ValueError('Unsupported ambient Node override names: '+','.join(present))
    return {'checked_names':list(names),'nonempty_names':[]}

def runtimes():
    result={}
    for name,pin in RUNTIME_PINS.items():
        value=file_state(Path(name))
        if any(value[key]!=expected for key,expected in pin.items()):
            raise ValueError('Pinned runtime differs: '+name)
        result[name]=value
    return result

def known_consumers():
    inventory=json.loads((ROOT/'reference/current-consumer-inventory.json').read_bytes())
    files={name:file_state(Path(name)) for name in inventory['files']}
    directories={name:ordinary_directory(Path(name)) for name in inventory['directories']}
    capture={name:file_state(Path(name)) for name in inventory['capture_files']}
    if files!=inventory['files'] or directories!=inventory['directories'] or capture!=inventory['capture_files']:
        raise ValueError('Retained known-consumer baseline differs')
    parent=ordinary_directory(TOOLS)
    if parent!=inventory['target_parent']:raise ValueError('Known version parent identity differs')
    versions={}
    for name in directories:
        root=Path(name)
        if root.name=='api-client':continue
        current=tree_state(root)
        expected={Path(p).relative_to(root).as_posix() for p in files if Path(p).is_relative_to(root)}
        if set(current['files'])!=expected:raise ValueError('Known version membership differs')
        versions[name]=current
    return {'files':files,'directories':directories,'capture_files':capture,'parent':parent,'versions':versions}

def frozen_files():
    pins=json.loads((ROOT/'packet-freeze.json').read_bytes())['files']
    result={}
    for name,pin in pins.items():
        p=Path(name)
        if p.is_absolute() or '..' in p.parts:raise ValueError('Frozen name escapes allocation')
        value=file_state(ROOT/p)
        if value['bytes']!=pin['bytes'] or value['sha256']!=pin['sha256']:
            raise ValueError('Frozen source/input differs: '+name)
        result[name]=value
    return result

def admit():
    if os.name!='nt' or sys.version_info[:3]!=(3,12,2) or Path(sys.executable).resolve()!=PYTHON.resolve():
        raise ValueError('Exact Python3.12.2 controller required')
    return {'runtimes':runtimes(),'policies':policies(),'ambient':ambient_admit(),'frozen':frozen_files()}

def state():
    base=admit()
    base['known_consumers']=known_consumers()
    prior_spec=json.loads((ROOT/'reference/prior-v1-preservation.json').read_bytes())
    base['prior_v1']=prior_v1_state(prior_spec)
    prior_v2_spec=json.loads((ROOT/'reference/prior-v2-preservation.json').read_bytes())
    base['prior_v2']=prior_v2_state(prior_v2_spec)
    prior_v3_spec=json.loads((ROOT/'reference/prior-v3-preservation.json').read_bytes())
    base['prior_v3']=prior_v3_state(prior_v3_spec)
    fresh=json.loads((ROOT/'fresh-admission.json').read_bytes())
    if fresh.get('schema')!='hamon.tastetable143.fresh/1' or fresh.get('outcome')!='PASS' or base['prior_v1']!=fresh['current']['prior_v1']:
        raise ValueError('Full admitted original V1 metadata drifted')
    if base['prior_v2']!=fresh['current']['prior_v2']:
        raise ValueError('Full admitted original V2 metadata drifted')
    if base['prior_v3']!=fresh['current']['prior_v3']:
        raise ValueError('Full admitted original V3 metadata drifted')
    base['admission_source']=file_state(ADMISSION_SOURCE)
    if base['admission_source']!=fresh['current']['admission_source'] or any(base['admission_source'][k]!=base['frozen']['fresh_admission.py'][k] for k in ('bytes','sha256')):
        raise ValueError('Exact external admission source identity changed')
    preparation=json.loads((ROOT/'data-preparation.json').read_bytes())
    base['fresh_carrier']=file_state(FRESH_CARRIER)
    if base['fresh_carrier']!=preparation['fresh_carrier'] or FRESH_CARRIER.read_bytes()!=(ROOT/'fresh-admission.json').read_bytes():
        raise ValueError('Exact external raw fresh carrier changed')
    return base
