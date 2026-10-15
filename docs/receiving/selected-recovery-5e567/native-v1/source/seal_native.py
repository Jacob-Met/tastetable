"""Passively seal the original terminal outcome; never launches an application."""
from pathlib import Path
import json,os,stat,sys,zipfile
from component_support import ROOT,PYTHON,sha,write_json,file_state,tree_state,frozen_files
ARCHIVE=ROOT.with_name(ROOT.name+'-native.zip')

def main():
    if os.name!='nt' or sys.version_info[:3]!=(3,12,2) or Path(sys.executable).resolve()!=PYTHON.resolve():
        raise ValueError('Exact retained interpreter required')
    if sys.argv[1:]!=['--seal-terminal']:raise ValueError('Terminal-only passive seal required')
    if os.path.lexists(ARCHIVE) or os.path.lexists(ROOT/'seal-result.json') or os.path.lexists(ROOT/'seal-intent.json'):
        raise FileExistsError('Original seal destination already exists')
    outer=json.loads((ROOT/'receive-command/result.json').read_bytes())
    if outer.get('returncode') is None or outer.get('job_active_at_teardown')!=[]:
        raise ValueError('Outer owned Job/process terminal not established')
    browser_path=ROOT/'browser-receipt.json'
    browser=json.loads(browser_path.read_bytes()) if browser_path.exists() else None
    if browser:
        for group in browser['groups'].values():
            if group.get('direct_returncode') is None or group.get('job_active_at_teardown')!=[]:
                raise ValueError('Owned browser/client terminal not established')
            waits=group.get('retained_waits')
            if not waits or not all(x['wait_result']==0 and x['closed'] for x in waits['handles']):
                raise ValueError('Every retained process handle must have terminal evidence')
    selected=set(frozen_files())|{'packet-freeze.json'}
    for name in ('fresh-admission.json','data-preparation.json','parent-receipt.json','browser-receipt.json',
                 'node-receipt.json','browser.stdout.bin','browser.stderr.bin','node.stdout.bin','node.stderr.bin',
                 'lifetime-events.ndjson','cdp-transcript.ndjson','01-selected-desktop.png','02-selected-narrow.png','server.stdout.bin','server.stderr.bin'):
        if (ROOT/name).exists():selected.add(name)
    for folder in ('parent-course','receive-command','server'):
        path=ROOT/folder
        if path.exists():
            tree=tree_state(path)
            selected.update(folder+'/'+name for name in tree['files'])
    if (ROOT/'edge-profile').exists():
        profile=tree_state(ROOT/'edge-profile')
        write_json(ROOT/'profile-inventory.json',profile)
        selected.add('profile-inventory.json')
    files={}
    for name in sorted(selected):
        pin=file_state(ROOT/name);files[name]={'bytes':pin['bytes'],'sha256':pin['sha256']}
    intent={'schema':'hamon.tastetable143.native-seal/1','scope':'Original terminal evidence, including failure; profile bytes remain in the owned native allocation.',
            'outer_accepted':outer.get('accepted'),'browser_outcome':None if browser is None else browser.get('outcome'),
            'files':files,'archive':str(ARCHIVE)}
    write_json(ROOT/'seal-intent.json',intent)
    pin=file_state(ROOT/'seal-intent.json');files['seal-intent.json']={'bytes':pin['bytes'],'sha256':pin['sha256']}
    parent_path=ROOT/'parent-receipt.json'
    parent=json.loads(parent_path.read_bytes()) if parent_path.exists() else {}
    overall='PASS_PENDING_VISUAL_REVIEW' if (outer.get('accepted') is True and browser is not None and
             browser.get('outcome')=='PASS_PENDING_VISUAL_REVIEW' and
             parent.get('outcome')=='PASS_PENDING_VISUAL_REVIEW') else 'FAIL'
    manifest={'schema':'hamon.tastetable143.native-evidence/1','files':files,
              'outcome':overall,'outer_accepted':outer.get('accepted')}
    with zipfile.ZipFile(ARCHIVE,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        for name in sorted(files):
            raw=(ROOT/name).read_bytes()
            if {'bytes':len(raw),'sha256':sha(raw)}!=files[name]:raise ValueError('Source changed while sealing: '+name)
            info=zipfile.ZipInfo(name,(2026,10,15,0,0,0));info.create_system=3
            info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
            archive.writestr(info,raw)
        info=zipfile.ZipInfo('MANIFEST.json',(2026,10,15,0,0,0));info.create_system=3
        info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
        archive.writestr(info,(json.dumps(manifest,ensure_ascii=True,indent=2)+'\n').encode())
    with zipfile.ZipFile(ARCHIVE) as archive:
        if archive.testzip() is not None or set(archive.namelist())!=set(files)|{'MANIFEST.json'}:
            raise ValueError('Closed native archive CRC/member verification failed')
        for name,pin in files.items():
            raw=archive.read(name)
            if {'bytes':len(raw),'sha256':sha(raw)}!=pin:raise ValueError('Native archive complete member differs')
    result={'schema':'hamon.tastetable143.seal-result/1','archive':str(ARCHIVE),'pin':file_state(ARCHIVE),
            'members':len(files)+1,'payloads':len(files),'outcome':manifest['outcome'],
            'outer_accepted':outer.get('accepted'),'application_calls':0}
    write_json(ROOT/'seal-result.json',result)
    print(json.dumps(result,ensure_ascii=True),flush=True)
    return 0
if __name__=='__main__':raise SystemExit(main())

