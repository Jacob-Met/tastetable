"""Actual local file/keyboard receiving of the separate note replacement preview."""
import argparse, pathlib, json, hashlib, threading, http.server, urllib.parse, traceback, sys, shutil
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--fixtures',required=True);p.add_argument('--output',required=True);p.add_argument('--baseline',action='store_true');a=p.parse_args()
src=pathlib.Path(a.root);fixture=pathlib.Path(a.fixtures);out=pathlib.Path(a.output);out.mkdir(exist_ok=False)
assert shutil.disk_usage(out).free > 2*1024**3
allowed={x.relative_to(src).as_posix():x for x in (src/'static').iterdir() if x.is_file()}
pins={k:hashlib.sha256(v.read_bytes()).hexdigest() for k,v in allowed.items()}
report={'phase':'baseline' if a.baseline else 'candidate','source':str(src),'source_sha256':pins,'checks':[],'page_errors':[],'external_requests':[],'server_requests':[],'status':'running'}
expected=json.loads((fixture/'expected.json').read_text(encoding='utf-8'));counter=0
class Handler(http.server.BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  path=urllib.parse.urlsplit(self.path).path;report['server_requests'].append(path)
  if path in ('/api/health','/api/personas'):
   data=b'{"qloo_mode":"mock"}' if path.endswith('health') else b'[]';mime='application/json'
  else:
   key='static/index.html' if path=='/' else path.lstrip('/')
   if key not in allowed:self.send_error(404);return
   data=allowed[key].read_bytes();mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css'}[allowed[key].suffix]
  self.send_response(200);self.send_header('Content-Type',mime+'; charset=utf-8');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
 def do_POST(self):self.send_error(405)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();base='http://127.0.0.1:'+str(server.server_port)
def check(name,condition=True):
 assert condition,name
 report['checks'].append(name);print('PASS '+name,flush=True)
try:
 with sync_playwright() as pw:
  context=pw.chromium.launch_persistent_context(str(out/'profile'),executable_path='C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',headless=True,viewport={'width':1280,'height':900},accept_downloads=True,args=['--no-first-run','--no-default-browser-check'])
  report['browser']=context.browser.version if context.browser else 'persistent Chromium'
  page=context.pages[0];page.on('pageerror',lambda e:report['page_errors'].append(str(e)))
  def route(r):
   if r.request.url.startswith(base+'/'):r.continue_()
   else:report['external_requests'].append(r.request.url);r.abort()
  context.route('**/*',route)
  def keyclick(selector):
   page.locator(selector).focus();page.locator(selector).press('Enter')
  def choose(button,name):
   with page.expect_file_chooser() as event:keyclick(button)
   event.value.set_files(str(fixture/name))
  def load_current():
   choose('#openWeek','week.json');page.locator('#venueFollowup').wait_for(state='visible')
   choose('[data-contact-file-open]','current.json');page.locator('[data-contact-file-preview]').wait_for(state='visible')
   keyclick('[data-contact-file-apply]');page.locator('[data-contact-file-preview]').wait_for(state='hidden')
  def download(selector,label):
   global counter
   with page.expect_download() as event:keyclick(selector)
   d=event.value;counter+=1;dest=out/(str(counter)+'-'+label+'.json');d.save_as(dest)
   return json.loads(dest.read_text(encoding='utf-8'))
  def records(label):return download('[data-contact-file-save]',label)['records']
  def reveal():
   s=page.locator('[data-contact-file-preview] details summary')
   if not page.locator('[data-contact-file-preview] details').evaluate('(e)=>e.open'):s.focus();s.press('Enter')
  page.goto(base+'/',wait_until='networkidle');load_current()
  check('real saved-week and current-note import preserves all four authored records',records('initial')==expected['current'])
  before_week=download('#saveWeek','before-week')
  choose('[data-contact-file-open]','incoming.json');page.locator('[data-contact-file-preview]').wait_for(state='visible');reveal()
  preview=page.locator('[data-contact-file-preview]')
  if a.baseline:
   check('baseline shows incoming notes but omits current-only removal details','ADD_OMITTED_DATE_SENTINEL' in preview.inner_text() and 'REMOVE_CURRENT_ONLY_SENTINEL' not in preview.inner_text())
   check('baseline omits the previous changed reply','BEFORE_CHANGED' not in preview.inner_text())
   page.screenshot(path=str(out/'baseline-desktop.png'),full_page=True)
   check('baseline reading leaves current notes exact',records('baseline-read')==expected['current'])
  else:
   check('all added changed removed and unchanged counts are visible','2 added, 1 changed, 2 removed, 1 unchanged' in preview.inner_text())
   check('all six distinct occurrence/date records are reviewed',page.locator('[data-note-change]').count()==6)
   check('both current-only removals remain readable','REMOVE_CURRENT_ONLY_SENTINEL' in preview.inner_text() and 'REMOVE_OLD_DATE_SENTINEL' in preview.inner_text())
   check('changed card exposes five exact field changes and clearing',all(s in page.locator('[data-note-change="changed"]').inner_text() for s in ['Changed fields: Contact status, Questions, Reply / notes, Questions associated with that reply, Next step.','BEFORE_CHANGED','explicit empty override','No earlier-question snapshot']))
   check('literal names and notes do not create markup',page.locator('#venueFollowup img').count()==0 and page.evaluate('window.injected') is None)
   check('review alone preserves every current record',records('review')==expected['current'])
   preview.scroll_into_view_if_needed();page.screenshot(path=str(out/'candidate-desktop.png'),full_page=True)
   keyclick('[data-contact-file-cancel]');check('keyboard Cancel preserves current records',records('cancel')==expected['current'])
   for name in ('wrong-origin.json','malformed.json'):
    choose('[data-contact-file-open]',name);page.wait_for_function("document.querySelector('[data-contact-file-status]').textContent.startsWith('Venue notes not opened:')")
    check(name+' refusal preserves current records',records(name)==expected['current'])
   choose('[data-contact-file-open]','incoming.json');preview.wait_for(state='visible')
   page.locator('[data-contact-key="pick-0"] [data-contact-field="nextStep"]').fill('Edited after review')
   check('editing a note retires the replacement preview',preview.is_hidden() and page.locator('[data-contact-file-apply]').is_disabled())
   edited=records('edited');check('the edit survives with no incoming replacement',edited[0]['note']['nextStep']=='Edited after review' and edited[1]==expected['current'][1])
   load_current();choose('[data-contact-file-open]','incoming.json');preview.wait_for(state='visible')
   page.locator('#weekDate').fill('2027-01-04');page.locator('#weekDate').press('Tab')
   check('changing the week retires the preview and retains old-date records',preview.is_hidden() and records('moved-date')==expected['current'])
   load_current();choose('[data-contact-file-open]','incoming.json');preview.wait_for(state='visible');reveal()
   page.set_viewport_size({'width':390,'height':844});preview.scroll_into_view_if_needed()
   check('390px review keeps all record cards within the viewport',page.locator('[data-note-change]').evaluate_all('(es)=>es.every(e=>e.getBoundingClientRect().left>=0&&e.getBoundingClientRect().right<=390)'))
   page.screenshot(path=str(out/'candidate-phone.png'),full_page=True)
   page.set_viewport_size({'width':1280,'height':900})
   keyclick('[data-contact-file-apply]');check('explicit keyboard Replace applies exactly the incoming records',records('applied')==expected['incoming'])
   after_week=download('#saveWeek','after-week');before_week.pop('savedAt');after_week.pop('savedAt')
   check('note replacement preserves complete saved week and calendar identity',before_week==after_week)
   choose('[data-contact-file-open]','empty.json');preview.wait_for(state='visible');reveal()
   check('empty file names every current record that will be removed',page.locator('[data-note-change="removed"]').count()==4 and '4 removed' in preview.inner_text())
   keyclick('[data-contact-file-cancel]');check('cancelling empty replacement retains all notes',records('empty-cancel')==expected['incoming'])
   choose('[data-contact-file-open]','empty.json');preview.wait_for(state='visible');keyclick('[data-contact-file-apply]')
   check('only explicit Replace clears the complete note set',records('empty-applied')==[])
   load_current();choose('[data-contact-file-open]','equal.json');preview.wait_for(state='visible')
   check('identical companion keeps every record unchanged',page.locator('[data-note-change="unchanged"]').count()==4 and '0 added, 0 changed, 0 removed, 4 unchanged' in preview.inner_text())
   keyclick('[data-contact-file-cancel]')
   page.evaluate("""() => { const native=File.prototype.arrayBuffer; window.releaseNoteRead=null; File.prototype.arrayBuffer=function(){ const f=this; File.prototype.arrayBuffer=native; return new Promise(resolve=>{window.releaseNoteRead=async()=>resolve(await native.call(f));});};}""")
   choose('[data-contact-file-open]','incoming.json');page.wait_for_function('window.releaseNoteRead!==null')
   page.locator('[data-contact-key="pick-0"] [data-contact-field="nextStep"]').fill('Edit while file read waits')
   page.evaluate('window.releaseNoteRead()');page.wait_for_timeout(100)
   check('late deferred real-file read cannot restore retired review',preview.is_hidden() and page.locator('[data-contact-file-apply]').is_disabled())
   check('late read leaves the exact current edit in place',records('late-read')[0]['note']['nextStep']=='Edit while file read waits')
  check('no page exception or external network request',not report['page_errors'] and not report['external_requests'])
  context.close()
 check('all served runtime source bytes remain exact',all(hashlib.sha256(allowed[k].read_bytes()).hexdigest()==v for k,v in pins.items()))
 report['status']='passed'
except BaseException as e:
 report['status']='failed';report['error']=repr(e);report['traceback']=traceback.format_exc();print(report['traceback'],flush=True)
finally:
 server.shutdown();server.server_close()
 print(json.dumps({'status':report['status'],'checks':len(report['checks']),'error':report.get('error')}),flush=True)
 (out/'receipt.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
sys.exit(0 if report['status']=='passed' else 1)
