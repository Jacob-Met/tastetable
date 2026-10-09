import pathlib,json,hashlib,subprocess,shutil
r=pathlib.Path(__file__).parent;s=r/'source';e=r/'evidence'
(s/'docs').mkdir(exist_ok=True);shutil.copyfile(r/'guide.txt',s/'docs/VENUE_NOTE_REPLACEMENT.md')
base=json.loads((e/'baseline-transfer.json').read_text(encoding='utf-8')); originals={x['path']:x['content'] for x in base['files']}
old=originals['static/venue_note_file.mjs'];new=(s/'static/venue_note_file.mjs').read_text(encoding='utf-8')
def outside(t):
 a=t.index('  function showFile(');b=t.index('\n  save.addEventListener',a);return t[:a]+t[b:]
assert outside(new).replace('import { compareVenueNotes } from "./venue_note_changes.mjs";\n','')==outside(old)
for path in originals:
 if path not in ('static/venue_note_file.mjs','static/index.html','static/venue_followup.css','tools/check_native_plan_week_browser.mjs'):assert (s/path).read_bytes()==originals[path].encode()
assert (s/'static/index.html').read_text(encoding='utf-8').replace('Inspect notes to add, change, remove or keep','Inspect the file’s note records')==originals['static/index.html']
assert (s/'static/venue_followup.css').read_text(encoding='utf-8').startswith(originals['static/venue_followup.css'])
assert (s/'tools/check_native_plan_week_browser.mjs').read_text(encoding='utf-8').replace(', "static/venue_note_changes.mjs"','')==originals['tools/check_native_plan_week_browser.mjs']
paths=['static/venue_note_changes.mjs','static/venue_note_file.mjs','static/index.html','static/venue_followup.css','tools/check_native_plan_week_browser.mjs','tests/venue_note_changes.test.mjs','tools/venue_note_changes_fixture.mjs','tools/check_venue_note_changes_browser.py','docs/VENUE_NOTE_REPLACEMENT.md']
rows=[]
for path in paths:
 data=(s/path).read_bytes(); rows.append({'path':path,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'blob':hashlib.sha1(b'blob '+str(len(data)).encode()+bytes([0])+data).hexdigest()})
print(json.dumps({'source_freeze':rows,'outside_showFile_exact':True,'unchanged_original_files':14}),flush=True)
(e/'source-freeze.json').write_text(json.dumps({'base':base['base'],'files':rows,'source_closure_only':True,'outside_showFile_and_import_exact':True,'unchanged_original_files':14},indent=2)+'\n',encoding='utf-8')
p=subprocess.run(['git','diff','--'],cwd=s,capture_output=True,text=True,encoding='utf-8');assert p.returncode==0;(e/'source.diff').write_text(p.stdout,encoding='utf-8')
for cmd in [['git','add','--']+paths,['git','commit','-m','Show exact venue-note additions changes removals before replacement'],['git','status','--short'],['git','rev-parse','HEAD']]:
 p=subprocess.run(cmd,cwd=s,capture_output=True,text=True,encoding='utf-8');print(json.dumps({'cmd':cmd,'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr}),flush=True);assert p.returncode==0
