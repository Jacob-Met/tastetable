import hashlib, json, os, pathlib, signal, subprocess, time
ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'candidate'
OUT = ROOT / 'author-v1'
OUT.mkdir(exist_ok=False)
def inventory():
    rows=[]
    for path in sorted(SOURCE.rglob('*')):
        if path.is_file():
            raw=path.read_bytes()
            rows.append(dict(path=path.relative_to(SOURCE).as_posix(), bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest(), git_blob=hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest(), mode=path.stat().st_mode & 0o777))
    return rows
before=inventory()
argv=['node','--test','--test-reporter=tap','tests/test_handoff_compare.mjs','tests/caregiver_handoff.test.mjs']
receipt=dict(schema='forge.tastetable.handoff-author.v1', started_at=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()), argv=argv, cwd=str(SOURCE), source_before=before, accepted=False)
with (OUT/'stdout.txt').open('wb') as stdout, (OUT/'stderr.txt').open('wb') as stderr:
    child=subprocess.Popen(argv,cwd=SOURCE,stdout=stdout,stderr=stderr,start_new_session=True)
    receipt['pid']=child.pid
    try: receipt['exit_code']=child.wait(timeout=60)
    except subprocess.TimeoutExpired:
        receipt['timeout']=True; os.killpg(child.pid,signal.SIGTERM)
        try: child.wait(timeout=2)
        except subprocess.TimeoutExpired: os.killpg(child.pid,signal.SIGKILL);child.wait()
        receipt['exit_code']=child.returncode
try: os.killpg(child.pid,0); receipt['group_absent']=False
except ProcessLookupError: receipt['group_absent']=True
receipt['source_after']=inventory()
for key in ['stdout','stderr']:
    raw=(OUT/(key+'.txt')).read_bytes()
    receipt[key]=dict(path=str(OUT/(key+'.txt')),bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),text=raw.decode())
receipt['accepted']=receipt['exit_code']==0 and receipt['group_absent'] and before==receipt['source_after']
receipt['completed_at']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
(OUT/'receipt.json').write_text(json.dumps(receipt,ensure_ascii=True,indent=2)+'\n')
print(json.dumps({k:receipt[k] for k in ['accepted','pid','exit_code','group_absent']}))
print(receipt['stdout']['text'])
print(receipt['stderr']['text'])
raise SystemExit(0 if receipt['accepted'] else 1)
