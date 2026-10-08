"""Receive the frozen classifier alongside current planner completion notes."""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,os,shutil,subprocess
ROOT=Path(__file__).resolve().parent
MIN_FREE=512*1024*1024;MAX_OWN=16*1024*1024
def sha(b):return hashlib.sha256(b).hexdigest()
def blob(b):return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def guard(enforce=True):
 free=shutil.disk_usage(ROOT).free
 own=sum(p.stat().st_size for p in ROOT.rglob('*') if p.is_file())
 if enforce:assert free>=MIN_FREE and own<=MAX_OWN,(free,own)
 return dict(free_bytes=free,own_bytes=own)
data=json.loads((ROOT/'current-input.json').read_text())
out=ROOT/'current-composition.json'
assert not out.exists()
before=guard()
destination=ROOT/'current-composed'
shutil.copytree(ROOT/'source',destination)
for row in data['files']:
 b=row['content'].encode();assert blob(b)==row['sha'],row['path']
 path=destination/row['path'];path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(b)
assert sha((destination/'constraints.py').read_bytes())=='248789e3a4a31b7dcab499d8e3d445f566e26927c5fc4706c6a76a0e7ac6069f'
def selected():
 out={}
 for path in destination.rglob('*'):
  if not path.is_file():continue
  rel=path.relative_to(destination).as_posix();b=path.read_bytes()
  if rel not in {'constraints.py','tests/test_wheelchair_evidence.py'}:assert blob(b)==data['current_blobs'][rel],rel
  out[rel]=dict(sha256=sha(b),git_blob=blob(b),bytes=len(b))
 return out
pins=selected()
harness=ROOT/'independent/receive-final.py'
assert sha(harness.read_bytes())=='f9e3ca06f0ace6edfcd6dc8648ef10f51c662f959546984ccf0752bf117c1067'
raw=ROOT/'current-planner-receiving.json'
commands=[
 ['/usr/bin/python3','-B','-m','pytest','-q','-p','no:cacheprovider','tests/test_recommendation_notes.py'],
 ['/usr/bin/python3','-B',str(harness),str(destination),str(raw),'248789e3a4a31b7dcab499d8e3d445f566e26927c5fc4706c6a76a0e7ac6069f'],
]
env={**os.environ,'TASTETABLE_LIVE':'0','PYTHONDONTWRITEBYTECODE':'1','TASTETABLE_SOURCE_ROOT':str(destination)}
records=[]
try:
 for argv in commands:
  previous=guard()
  p=subprocess.run(argv,cwd=destination,env=env,capture_output=True,text=True,timeout=45)
  row=dict(command=argv,cwd=str(destination),returncode=p.returncode,stdout=p.stdout,stderr=p.stderr,before=previous,after=guard(False))
  records.append(row)
  print(json.dumps(dict(returncode=p.returncode,summary=p.stdout.splitlines()[-2:] or p.stderr.splitlines()[-2:])),flush=True)
  assert p.returncode==0,row
  guard()
 assert pins==selected()
finally:
 receipt=dict(at=datetime.now(timezone.utc).isoformat(),current_base=data['base'],current_tree=data['tree'],source=str(destination),source_files=pins,commands=records,before=before,after=guard(False),guards=dict(minimum_free_bytes=MIN_FREE,maximum_own_bytes=MAX_OWN,command_timeout_seconds=45),runner_sha256=sha(Path(__file__).read_bytes()),execution_by='production_scope author; unchanged independently authored eight-case planner receiver replayed for new current planner-note composition',boundary='Original root independent acceptance remains at b8d384; this is additional author current-source compatibility receiving, not another independent review. Current planner code is byte-preserved, and no external provider/browser/install outcome is implied.')
 if raw.exists():
  receiving=json.loads(raw.read_text())
  receipt['planner_receipt_sha256']=sha(raw.read_bytes())
  receipt['planner_receiving']=receiving
 out.write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(dict(current=data['base'],files_checked=len(pins),receipt_sha256=sha(out.read_bytes()))),flush=True)
