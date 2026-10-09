import pathlib,json,hashlib,subprocess,shutil,sys
root=pathlib.Path(__file__).parent; src=root/'source'; packet=json.loads((root/'evidence/baseline-transfer.json').read_text(encoding='utf-8'))
manifest=[]
for row in packet['files']:
 data=row['content'].encode('utf-8'); blob=hashlib.sha1(b'blob '+str(len(data)).encode()+bytes([0])+data).hexdigest()
 assert blob==row['sha'],(row['path'],blob,row['sha'])
 p=src/row['path'];p.parent.mkdir(parents=True,exist_ok=True)
 if p.exists():assert p.read_bytes()==data
 else:p.write_bytes(data)
 manifest.append({'path':row['path'],'blob':blob,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
print(json.dumps({'intake_files':len(manifest),'bytes':sum(x['bytes'] for x in manifest),'git':shutil.which('git')}),flush=True)
(root/'evidence/source-intake.json').write_text(json.dumps({'base':packet['base'],'closure_only':True,'files':manifest},indent=2)+chr(10),encoding='utf-8')
for cmd in [['git','init'],['git','config','core.autocrlf','false'],['git','config','user.name','HAMON external production'],['git','config','user.email','hamon-production@localhost'],['git','add','--']+[x['path'] for x in manifest],['git','commit','-m','Receive exact TasteTable note-review baseline closure']]:
 p=subprocess.run(cmd,cwd=src,text=True,capture_output=True);print(json.dumps({'command':cmd,'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr}),flush=True);assert p.returncode==0
p=subprocess.run(['C:/Program Files/nodejs/node.EXE','--test','tests/venue_followup.test.mjs','tests/venue_note_file.test.mjs'],cwd=src,text=True,capture_output=True,encoding='utf-8');print(json.dumps({'baseline_exit':p.returncode,'tail':p.stdout[-1600:],'stderr':p.stderr}),flush=True)
(root/'evidence/baseline-tests.stdout').write_text(p.stdout,encoding='utf-8');(root/'evidence/baseline-tests.stderr').write_text(p.stderr,encoding='utf-8')
(root/'evidence/baseline-tests.json').write_text(json.dumps({'exit':p.returncode,'source_manifest':'source-intake.json'},indent=2),encoding='utf-8');assert p.returncode==0
