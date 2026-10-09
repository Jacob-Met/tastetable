import pathlib,json,subprocess,hashlib
r=pathlib.Path(__file__).parent; s=r/'source';b=r/'baseline-browser-source';b.mkdir(exist_ok=False)
for f in json.loads((r/'evidence/baseline-transfer.json').read_text(encoding='utf-8'))['files']:
 p=b/f['path'];p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(f['content'].encode())
p=subprocess.run(['C:/Program Files/nodejs/node.EXE',str(s/'tools/venue_note_changes_fixture.mjs'),str(r/'evidence/fixtures')],cwd=s,capture_output=True,text=True,encoding='utf-8'); print(json.dumps({'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr}),flush=True);assert p.returncode==0
