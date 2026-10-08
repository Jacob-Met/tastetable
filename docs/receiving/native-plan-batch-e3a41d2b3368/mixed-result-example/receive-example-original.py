import pathlib,json,hashlib,subprocess,sys,os,zipfile,ast,datetime
root=pathlib.Path('/home/jacob/hamon-universal-e3a41d2b3368-tastetable-batch')
source=root/'candidate'
baseline=pathlib.Path('/home/jacob/hamon-universal-e3a41d2b3368-tastetable-batch-baseline')
evidence=root/'mixed-result-example';evidence.mkdir(exist_ok=False)
manifest=json.loads((root/'authored-v1/SOURCE.json').read_text())
def sha(raw):return hashlib.sha256(raw).hexdigest()
def unchanged():
 return all(sha((source/p).read_bytes())==v['sha256'] for p,v in manifest['files'].items())
assert unchanged()
profiles=[]
for label in ['a','invalid','b']:
 raw=(baseline/'profiles'/label/'profile.json').read_bytes()
 p=evidence/'profiles'/label/'profile.json';p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(raw)
 profiles.append(p)
args=[sys.executable,'-B',str(source/'tastetable_batch.py'),'--node','/usr/bin/node']
for p in profiles:args+=['--profile',str(p.relative_to(evidence))]
args+=['--week','2026-10-08','--output','caregiver-week-example.zip']
env=os.environ.copy();env.update(PYTHONDONTWRITEBYTECODE='1')
result=subprocess.run(args,cwd=evidence,env=env,capture_output=True,timeout=60)
(evidence/'command.stdout').write_bytes(result.stdout);(evidence/'command.stderr').write_bytes(result.stderr)
assert result.returncode==3,(result.returncode,result.stderr)
receipt=json.loads(result.stdout);assert(receipt['requested'],receipt['succeeded'],receipt['failed'],receipt['status'])==(3,2,1,'partial')
bundle=evidence/'caregiver-week-example.zip'
with zipfile.ZipFile(bundle) as archive:
 assert archive.testzip()is None
 index=json.loads(archive.read('index.json'))
 assert [i['status']for i in index['entries']]==['saved','failed','saved']
 assert(index['requested'],index['succeeded'],index['failed'],index['weekStart'])==(3,2,1,'2026-10-05')
 expected={'index.json','READ-ME.txt'}
 for i in index['entries']:
  p=profiles[i['position']-1]
  assert i['input']['sha256']==sha(p.read_bytes())
  if i['status']=='saved':
   for key in ['nativePlan','savedWeek']:
    pin=i[key];raw=archive.read(pin['file'])
    assert len(raw)==pin['bytes'] and sha(raw)==pin['sha256']
    expected.add(pin['file'])
   label='a'if i['position']==1 else'b'
   assert json.loads(archive.read(i['nativePlan']['file']))==json.loads((baseline/'baseline-evidence'/('single-'+label+'.stdout')).read_bytes())
 assert set(archive.namelist())==expected
 archive.extractall(evidence/'extracted')
tree=ast.parse((source/'tests/test_native_plan_batch.py').read_text())
node_source=next(ast.literal_eval(node.value) for node in tree.body if isinstance(node,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='READ_WEEKS'for t in node.targets))
(evidence/'receive-saved-weeks.mjs').write_text(node_source)
node=subprocess.run(['/usr/bin/node','--input-type=module','--eval',node_source,str(source/'static/week_file.mjs'),str(evidence/'extracted')],capture_output=True,timeout=20)
(evidence/'codec.stdout').write_bytes(node.stdout);(evidence/'codec.stderr').write_bytes(node.stderr)
assert node.returncode==0,node.stderr
weeks=json.loads(node.stdout);assert[len(weeks),len({w['calendarId']for w in weeks})]==[2,2]
assert unchanged()
proof={'result':'pass','kind':'authored ordinary mixed-result output; no fault hooks','sourceSha256':manifest['files']['tastetable_batch.py']['sha256'],'inputArguments':[str(p.relative_to(evidence))for p in profiles],'exit':result.returncode,'status':receipt['status'],'requested':3,'saved':2,'failed':1,'sourceUnchanged':True,'fullNativeResultsMatchOriginalProducerWitness':True,'strictWeekReaderAccepted':2,'calendarIdentitiesIndependent':True,'bundle':{'path':bundle.name,'bytes':bundle.stat().st_size,'sha256':sha(bundle.read_bytes())},'stdoutSha256':sha(result.stdout),'stderrSha256':sha(result.stderr),'codecReceiptSha256':sha(node.stdout),'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
(evidence/'receipt.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps({'receipt':str(evidence/'receipt.json'),'receiptSha256':sha((evidence/'receipt.json').read_bytes()),'proof':proof},indent=2))
