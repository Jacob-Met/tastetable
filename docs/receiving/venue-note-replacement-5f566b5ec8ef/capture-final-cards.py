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
  report['phase']='visual-only-final'
  page.locator('[data-note-change="changed"]').screenshot(path=str(out/'desktop-changed-card.png'))
  page.locator('[data-note-change="removed"]').nth(1).screenshot(path=str(out/'desktop-removed-old-date.png'))
  page.set_viewport_size({'width':390,'height':844})
  page.locator('[data-note-change="changed"]').screenshot(path=str(out/'phone-changed-card.png'))
  page.locator('[data-contact-file-description]').screenshot(path=str(out/'phone-replacement-summary.png'))
  check('visual-only exact current review rendered without page errors',not report['page_errors'] and not report['external_requests'])
  context.close()
 check('all source bytes preserved during visual-only capture',all(hashlib.sha256(allowed[k].read_bytes()).hexdigest()==v for k,v in pins.items()))
 report['status']='passed'
except BaseException as e:
 report['status']='failed';report['error']=repr(e);report['traceback']=traceback.format_exc();print(report['traceback'],flush=True)
finally:
 server.shutdown();server.server_close()
 print(json.dumps({'status':report['status'],'checks':len(report['checks']),'error':report.get('error')}),flush=True)
 (out/'receipt.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
sys.exit(0 if report['status']=='passed' else 1)
