from pathlib import Path, PurePosixPath
import hashlib, json, os, platform, subprocess, sys
root=Path('/home/jacob/hamon/receiving/root-d3745-qloo-composition')
packet=json.loads((root/'source-packet.json').read_text())
receipt={'host':platform.node(),'uid':os.getuid(),'python':platform.python_version(),'baseline_sha':packet['baseline_sha'],'recovery_sha':packet['recovery_sha'],'snapshots':{},'courses':[]}
for label,files in packet['snapshots'].items():
    destination=root/label
    destination.mkdir(exist_ok=False)
    hashes={}
    for name,text in files.items():
        rel=PurePosixPath(name)
        if rel.is_absolute() or '..' in rel.parts: raise ValueError(name)
        path=destination/name
        path.parent.mkdir(parents=True,exist_ok=True)
        data=text.encode()
        path.write_bytes(data)
        hashes[name]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'git_blob':hashlib.sha1(('blob '+str(len(data))+'\0').encode()+data).hexdigest()}
    receipt['snapshots'][label]=hashes
env=os.environ.copy()
for key in ('QLOO_API_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY'):
    env.pop(key,None)
env.update(PYTHONDONTWRITEBYTECODE='1',PYTEST_DISABLE_PLUGIN_AUTOLOAD='1',TASTETABLE_LIVE='0')
courses=[
 ('main-isolation','main',[sys.executable,'-m','pytest','-q','-p','no:cacheprovider','tests/test_qloo_cache_isolation.py']),
 ('combined-focused','combined',[sys.executable,'-m','pytest','-q','-p','no:cacheprovider','tests']),
 ('combined-recovery-optimized','combined',[sys.executable,'-O','tests/test_qloo_cache_recovery.py']),
 ('combined-interaction-optimized','combined',[sys.executable,'-O','tests/test_qloo_cache_composition.py']),
]
for label,source,command in courses:
    result=subprocess.run(command,cwd=root/source,env=env,capture_output=True,text=True,timeout=120)
    entry={'label':label,'command':command,'cwd':str(root/source),'exit_code':result.returncode,'stdout':result.stdout,'stderr':result.stderr}
    receipt['courses'].append(entry)
    print(json.dumps(entry),flush=True)
unchanged=True
for label,files in receipt['snapshots'].items():
    for name,evidence in files.items():
        unchanged &= hashlib.sha256((root/label/name).read_bytes()).hexdigest()==evidence['sha256']
receipt['source_unchanged']=unchanged
receipt['passed']=unchanged and all(c['exit_code']==0 for c in receipt['courses'])
(root/'receiving-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'passed':receipt['passed'],'source_unchanged':unchanged,'receipt':str(root/'receiving-receipt.json')}),flush=True)
raise SystemExit(0 if receipt['passed'] else 1)
