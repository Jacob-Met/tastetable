import pathlib,subprocess,json,hashlib,sys
r=pathlib.Path(__file__).parent;s=r/'source';e=r/'evidence';node='C:/Program Files/nodejs/node.EXE'
commands=[('candidate-model',[node,'--test','tests/venue_followup.test.mjs','tests/venue_note_file.test.mjs','tests/venue_note_changes.test.mjs']),('baseline-browser',[sys.executable,'-X','utf8','-B',str(s/'tools/check_venue_note_changes_browser.py'),'--root',str(r/'baseline-browser-source'),'--fixtures',str(e/'fixtures'),'--output',str(e/'browser-baseline-v1'),'--baseline']),('candidate-browser',[sys.executable,'-X','utf8','-B',str(s/'tools/check_venue_note_changes_browser.py'),'--root',str(s),'--fixtures',str(e/'fixtures'),'--output',str(e/'browser-candidate-v1')])]
for name,cmd in commands:
 p=subprocess.run(cmd,cwd=s,text=True,capture_output=True,encoding='utf-8',timeout=240)
 print(json.dumps({'phase':name,'exit':p.returncode,'stdout_tail':p.stdout[-5000:],'stderr_tail':p.stderr[-3000:]},ensure_ascii=False),flush=True)
 (e/(name+'.stdout')).write_text(p.stdout,encoding='utf-8');(e/(name+'.stderr')).write_text(p.stderr,encoding='utf-8')
 (e/(name+'.json')).write_text(json.dumps({'command':cmd,'exit':p.returncode},indent=2),encoding='utf-8')
 if p.returncode:sys.exit(p.returncode)
