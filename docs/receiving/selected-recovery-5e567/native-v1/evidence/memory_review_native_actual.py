"""Independent passive joins of original Taste143 component observations."""
from pathlib import Path
import base64
from datetime import datetime, timezone
import hashlib
import json
import struct
import zipfile

TR = Path(__file__).resolve().parent
T = Path('/workspace/scratch/5e5670099628/remote-recovery-20261015/tastetable143-native')
D = T / 'native-extracted'
WIN = r'C:\Users\jacob\hamon-remote-receiving-5e5670099628-tastetable143-v1'
checks = []

def pin(value):
    raw = value.read_bytes() if isinstance(value, Path) else value
    return {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}

def readj(path):
    return json.loads(path.read_bytes())

def check(name, condition):
    if not condition:
        raise AssertionError(name)
    checks.append(name)

def exact(a, b):
    if type(a) is not type(b):
        return False
    if isinstance(a, dict):
        return a.keys() == b.keys() and all(exact(a[k], b[k]) for k in a)
    if isinstance(a, list):
        return len(a) == len(b) and all(exact(x, y) for x, y in zip(a, b))
    return a == b

node = readj(D / 'node-receipt.json')
browser = readj(D / 'browser-receipt.json')
parent = readj(D / 'parent-receipt.json')
course = node['component']
check('Original Node PASS and component PASS', node['outcome'] == course['outcome'] == 'PASS' and node['error'] is None)
check('Original parent/browser pending pixel gate with no errors', parent['outcome'] == browser['outcome'] == 'PASS_PENDING_VISUAL_REVIEW' and parent['errors'] == browser['errors'] == [])
check('Whole original receipt chains', pin(D / 'node-receipt.json') == browser['node_receipt'] == parent['node_receipt'] and pin(D / 'browser-receipt.json') == parent['browser_receipt'])
check('Original Node stdout equals complete receipt and stderr is empty', (D / 'node.stdout.bin').read_bytes() == (D / 'node-receipt.json').read_bytes() and (D / 'node.stderr.bin').read_bytes() == b'')
check('All 22 input identities and complete before/after states preserved', node['before'] == node['after'] and len(node['before']) == 22 and node['inputs_unchanged'] is True and browser['before'] == browser['after'] and parent['before'] == parent['after'])
for name, record in node['before'].items():
    check('Whole actual Node input ' + name, pin(D / name) == record)
check('Corrected reviewed parent/evidence and frozen client/course actually received',
      pin(D / 'receive_taste.py')['sha256'] == '9e8b3737820970fcf3d83c7776412c24354a5502387644271a5dd4514447a258' and
      pin(D / 'component_evidence.py')['sha256'] == '9ffa2dc13915b7fff27dc5b0c707e31e080e5e015484854d821c579a4975b603' and
      pin(D / 'component_client.mjs')['sha256'] == '16186666f590a26681b04134aeca47b8aef25f078641a09788d31add4f81f806' and
      pin(D / 'component_course.mjs')['sha256'] == '872a84c3fcc584f50e2961e80a7683e4cb738ea5cd63bbe49326c90b8350de8a')

protocol_raw = (D / 'cdp-transcript.ndjson').read_bytes()
protocol = [json.loads(line) for line in protocol_raw.splitlines()]
sends = [row['value'] for row in protocol if row['direction'] == 'send']
received = [row['value'] for row in protocol if row['direction'] == 'receive']
responses = {row['id']: row for row in received if 'id' in row}
check('Whole bounded original protocol with unique correlated response IDs', len(protocol_raw) == node['transcript_bytes'] < 64 * 1024 * 1024 and len(sends) == node['commands'] == 209 and len(responses) == len([row for row in received if 'id' in row]))

def answer(request):
    response = responses[request['id']]
    check('Successful response ' + str(request['id']), response.get('sessionId') == request.get('sessionId') and 'error' not in response)
    return response['result']

returned = []
for request in sends:
    if request['method'] == 'Runtime.evaluate':
        result = answer(request)
        check('Evaluation without exception ' + str(request['id']), 'exceptionDetails' not in result and request['params'].get('returnByValue') is True)
        if 'value' in result['result']:
            returned.append((request, result['result']['value']))
raw_observations = [value for request, value in returned if 'snapshotDOM()' in request['params']['expression']]
check('All 57 saved observations equal ordered actual protocol values', exact(raw_observations, [row['value'] for row in course['observations']]) and len(raw_observations) == 57)
views = [row['view'] for row in raw_observations]
host = {'selectedID': 'selected_A', 'dirtyRename': 'Retained unsaved rename', 'search': 'unchanged', 'order': 'name', 'activeWeek': 'original fictional week', 'venueNotes': 'original fictional notes'}
check('Actual fixed page/database and whole host state across every observation', course['page'] == node['page'] == browser['server_endpoint']['ready']['url'] and course['database'] == 'hamon.tastetable143.5e5670099628.component-v1' and all(row['location'] == node['page'] and row['ready'] == 'complete' and row['phase'] == 'ready' and row['view']['host'] == host and row['view']['fixtureError'] is None for row in raw_observations))

fixtures = {}
for name, record in course['fixtures'].items():
    original = TR / 'fixtures' / name
    check('Whole admitted original fixture ' + name, (D / 'fixtures' / name).read_bytes() == original.read_bytes() and [pin(original)['bytes'], pin(original)['sha256']] == record)
    fixtures[name] = readj(original)
check('Exact seven fixture closure unchanged', len(fixtures) == 7 and course['fixturesUnchanged'] is True)
storage_labels = ['seed-A-B', 'before-capture-01-selected-desktop.png', 'before-capture-02-selected-narrow.png', 'selected-A-B-C-D', 'external-E-before-stale-action', 'stale-F-absent', 'replacement-left-A-B-C-D-E-exact']
storage_fixtures = ['initial-records.json'] * 3 + ['expected-after-selected.json'] + ['expected-after-stale-refusal.json'] * 3
storage_raw = [(request, value) for request, value in returned if request['params']['expression'] == 'window.taste143Fixture.readStorage()']
check('Seven ordered awaited real IndexedDB read returns', [row['label'] for row in course['storage']] == storage_labels and len(storage_raw) == 7 and all(request['params']['awaitPromise'] is True for request, value in storage_raw) and exact([value for request, value in storage_raw], [row['rows'] for row in course['storage']]))
fields = {'format', 'version', 'id', 'name', 'createdAt', 'updatedAt', 'text'}
for item, name in zip(course['storage'], storage_fixtures):
    records = item['rows']
    check('Exact seven fields and wrapper ' + item['label'], all(set(row) == {'id', 'draft'} and row['id'] == row['draft']['id'] and set(row['draft']) == fields for row in records))
    check('Whole native stored records ' + item['label'], exact(sorted([row['draft'] for row in records], key=lambda row: row['id']), sorted(fixtures[name], key=lambda row: row['id'])))
selected_c = next(row['draft'] for row in course['storage'][3]['rows'] if row['id'] == 'selected_C')
check('Literal C name and complete BOM/CRLF stored text retained', selected_c['name'] == '<literal> café 雪 & "C"' and selected_c['text'].startswith('\ufeff') and '\r\n' in selected_c['text'])

def control(view, name):
    rows = [row for row in view['controls'] if row['id'] == name]
    check('Unique observed control ' + name, len(rows) == 1)
    return rows[0]

file_actions = [row for row in course['actions'] if row['kind'] == 'real-file-input']
file_requests = [row for row in sends if row['method'] == 'DOM.setFileInputFiles']
file_names = ['mixed-backup.json', 'stale-backup.json', 'stale-backup.json', 'replacement-identical-backup.json']
check('Exactly four real file assignments in frozen order', [row['name'] for row in file_actions] == file_names and len(file_requests) == 4)
for action, request in zip(file_actions, file_requests):
    check('Exact file request and observed target ' + action['name'], request['params'] == {'nodeId': action['nodeId'], 'files': [WIN + '\\fixtures\\' + action['name']]} and answer(request) == action['result'] and control(views[action['before']], 'collectionBackupFile')['disabled'] is False)
mixed = views[file_actions[0]['after']]
check('Only missing D/C have labeled selectable checkboxes', [row['value'] for row in mixed['checkboxes']] == ['selected_D', 'selected_C'] and [row['labels'] for row in mixed['checkboxes']] == [[' Missing D · ID selected_D'], [' <literal> café 雪 & "C" · ID selected_C']] and all(row['visible'] and not row['disabled'] and not row['checked'] for row in mixed['checkboxes']))
check('Conflicting A and identical B remain visible while all-record action is disabled', len(mixed['completeRows']) == 4 and 'Conflicting' in mixed['completeRows'][1] and 'Already identical' in mixed['completeRows'][2] and control(mixed, 'addMissingSavedWeeks')['disabled'] is True)

keys = [row for row in course['actions'] if row['kind'] == 'native-key']
key_requests = [row for row in sends if row['method'] == 'Input.dispatchKeyEvent']
check('Exactly 31 keyboard actions with corresponding 62 protocol key events and no mouse calls', len(keys) == 31 and len(key_requests) == 62 and not any(row['method'] == 'Input.dispatchMouseEvent' for row in sends))
spaces = []
for index, action in enumerate(keys):
    key = action['key']; shift = action['shift']
    spec = {'key': key, 'code': 'Tab' if key == 'Tab' else 'Space', 'windowsVirtualKeyCode': 9 if key == 'Tab' else 32, 'nativeVirtualKeyCode': 9 if key == 'Tab' else 32, 'modifiers': 8 if shift else 0, 'autoRepeat': False, 'isKeypad': False, 'isSystemKey': False}
    down = {**spec, 'type': 'keyDown'}
    if key == ' ':
        down.update(text=' ', unmodifiedText=' ')
    up = {**spec, 'type': 'keyUp'}
    check('Exact actual key pair ' + str(index), key in ('Tab', ' ') and type(shift) is bool and key_requests[2 * index]['params'] == down and key_requests[2 * index + 1]['params'] == up and answer(key_requests[2 * index]) == action['down'] and answer(key_requests[2 * index + 1]) == action['up'])
    if key == ' ':
        before, after = views[action['before']], views[action['after']]
        active = before['active']
        role = active['value'] if active['tag'] == 'INPUT' else active['id']
        spaces.append((role, action, before, after))
check('Actual Space order C then D, commit, F stale attempt, F cancel', [row[0] for row in spaces] == ['selected_C', 'selected_D', 'addSelectedMissingSavedWeeks', 'selected_F', 'addSelectedMissingSavedWeeks', 'selected_F', 'cancelCollectionBackup'])
for role, action, before, after in spaces:
    if role.startswith('selected_'):
        check('Actual focus and checkbox toggle ' + role + str(action['before']), any(row['value'] == role and row['focused'] and not row['checked'] for row in before['checkboxes']) and any(row['value'] == role and row['focused'] and row['checked'] for row in after['checkboxes']))
    else:
        check('Actual enabled button focus ' + role + str(action['before']), before['active']['id'] == role and control(before, role)['disabled'] is False)
check('Backward keyboard navigation between C and D', any(row['key'] == 'Tab' and row['shift'] is True and spaces[0][1]['after'] <= row['before'] < spaces[1][1]['before'] for row in keys))

commit = views[spaces[2][1]['after']]
backup = fixtures['mixed-backup.json']
expected_call = {'backup': {'format': backup['format'], 'savedAt': backup['savedAt'], 'records': [backup['records'][0], backup['records'][3]]}, 'expected': fixtures['initial-records.json']}
check('D then C submitted in backup order with full original A/B token', exact(commit['restoreCalls'], [expected_call]) and commit['refreshCount'] == 2 and not commit['previewVisible'] and commit['pendingActions'] == 0)
external_returns = [(request, value) for request, value in returned if request['params']['expression'] == 'window.taste143Fixture.addExternalRecord()']
external = course['externalWriter']
check('Exactly one awaited E writer with whole original result', len(external_returns) == 1 and external_returns[0][0]['params']['awaitPromise'] is True and exact(external_returns[0][1], external['result']) and exact(external['result'], fixtures['external-addition.json']))
check('External commit lies after F selection and before stale action', spaces[3][1]['after'] <= external['before'] < external['after'] <= spaces[4][1]['before'])
stale = views[spaces[4][1]['after']]
check('Stale F rejected using complete earlier A/B/C/D token', exact(stale['restoreCalls'], [expected_call, {'backup': fixtures['stale-backup.json'], 'expected': fixtures['expected-after-selected.json']}]) and stale['status'] == 'Could not add selected missing saved weeks: Saved weeks changed since this preview. Open the backup again before adding anything. Open the backup again to review current storage.' and stale['refreshCount'] == 2)
cancel = views[spaces[6][1]['after']]
check('Cancellation clears selected preview and performs no further restore', cancel['status'] == 'Collection preview cancelled. Nothing was changed.' and cancel['checkboxes'] == [] and cancel['previewVisible'] is False and len(cancel['restoreCalls']) == 2)
final = views[file_actions[-1]['after']]
check('Replacement identical B has no missing selection or action', final['checkboxes'] == [] and final['status'] == 'No missing records to add. Nothing was changed.' and len(final['restoreCalls']) == 2 and final['refreshCount'] == 2 and control(final, 'addMissingSavedWeeks')['disabled'] is True and control(final, 'addSelectedMissingSavedWeeks')['disabled'] is True)
event_kinds = ['initial-seed-committed', 'refresh', 'action-start', 'restore-submitted', 'restore-committed', 'refresh', 'action-finished', 'external-writer-start', 'external-writer-committed', 'action-start', 'restore-submitted', 'restore-refused', 'action-finished']
check('Exact 13 final events and successful addition count', [row['kind'] for row in final['events']] == event_kinds and [row for row in final['events'] if row['kind'] == 'restore-committed'] == [{'kind': 'restore-committed', 'added': 2, 'alreadyPresent': 0}])

capture_requests = [row for row in sends if row['method'] == 'Page.captureScreenshot']
check('Exactly two original screenshot commands', len(capture_requests) == len(course['captures']) == 2)
capture_pins = []
for index, (image, request) in enumerate(zip(course['captures'], capture_requests)):
    raw = (D / image['name']).read_bytes()
    dimensions = list(struct.unpack('>II', raw[16:24]))
    view = views[image['observation']]
    check('Original screenshot protocol body ' + image['name'], base64.b64decode(answer(request)['data'], validate=True) == raw and pin(raw) == {'bytes': image['bytes'], 'sha256': image['sha256']})
    check('Original full-page image dimensions ' + image['name'], dimensions == [[1265, 1291], [375, 2377]][index] and dimensions == [image['clip']['width'], image['clip']['height']] and image['documentOverflow'] is False)
    check('Captured precommit selected state ' + image['name'], [row['value'] for row in view['checkboxes'] if row['checked']] == ['selected_D', 'selected_C'] and view['restoreCalls'] == [] and view['refreshCount'] == 1 and control(view, 'addSelectedMissingSavedWeeks')['disabled'] is False and control(view, 'addMissingSavedWeeks')['disabled'] is True)
    capture_pins.append({'file': image['name'], **pin(raw), 'dimensions': dimensions})

check('Exactly one ordinary browser/server/Node course with normal close', browser['server_launches'] == browser['browser_launches'] == browser['node_launches'] == 1 and browser['node_returncode'] == 0 and browser['forced_cleanup'] is False and browser['normal_close_requested'] is True and node['socket_terminal_observed'] is True and node['close']['result'] == {})
for name, group in browser['groups'].items():
    check('Normal terminal owned group ' + name, group['direct_returncode'] == 0 and group['job_active_at_teardown'] == [] and group['retained_waits']['all_signaled'] is True and group['retained_waits']['normal_cleanup'] is True and group['retained_waits']['forced_cleanup'] is False)
check('Existing Edge identities and server listener preserved/retired', browser['existing_edge_before'] == browser['existing_edge_after'] and browser['server_listener_after'] == [])
server_lines = (D / 'server.stdout.bin').read_bytes().splitlines(keepends=True)
check('Actual server has precisely readiness and terminal JSON stdout lines', len(server_lines) == 2 and all(line.endswith(b'\n') for line in server_lines) and json.loads(server_lines[0]) == readj(D / 'server/ready.json') and json.loads(server_lines[1]) == readj(D / 'server/result.json') == browser['server_result']['value'])
check('Server explicit stop and twelve successful fixed responses', browser['server_result']['value']['outcome'] == 'PASS' and browser['server_result']['value']['stop_seen'] is True and len(browser['server_result']['value']['requests']) == 12)

archive = T / 'tastetable143-native-original.zip'
check('Exact original received archive pin', pin(archive) == {'bytes': 2731277, 'sha256': '587820ceff1e58db143ad187106bc2b85bea4cbe00221f3e9f5fdc09d597c2db'})
with zipfile.ZipFile(archive) as z:
    check('Original archive closed 80-file extraction and valid CRCs', len(z.namelist()) == len(set(z.namelist())) == 80 and z.testzip() is None and set(z.namelist()) == {p.relative_to(D).as_posix() for p in D.rglob('*') if p.is_file()})
    for name in z.namelist():
        check('Original extracted bytes ' + name, z.read(name) == (D / name).read_bytes())

record = {
    'schema': 'hamon.tastetable143.independent-native-actual-review/1',
    'utc': datetime.now(timezone.utc).isoformat(),
    'disposition': 'ACCEPT_COMPONENT_STORAGE_ACTION_AND_ORIGINAL_EVIDENCE',
    'scope': 'Independent passive complete original receipt/protocol parsing and whole fixture/record/action/PNG-byte joins. No browser, product, server, test or device invocation. Pixel readability is separately root-owned.',
    'counts': {'checks': len(checks), 'observations': 57, 'keyboard_actions': 31, 'file_assignments': 4, 'storage_reads': 7, 'captures': 2, 'restores': 2, 'refreshes': 2},
    'checks': checks,
    'artifacts': {name: pin(D / name) for name in ['node-receipt.json', 'cdp-transcript.ndjson', 'parent-receipt.json', 'browser-receipt.json', 'server.stdout.bin']},
    'archive': pin(archive),
    'captures': capture_pins,
    'result': 'C was selected before D using real browser keyboard events; submission preserved D,C backup order and the whole A/B expected token. A/B/C/D retained all seven fields including literal C BOM/CRLF text. Awaited external E committed before stale F submission; stale refusal retained exact A/B/C/D/E and no F. Cancel and replacement performed no additional restore. Host sentinels, fixtures, sources and prior recorded state remained exact.',
    'review_chronology': 'Original root no-defect core receipt 07947d4b is historical. Later independent review found the final server-stdout one-line mismatch; corrected parent 9e8b3737 accepts the actual two-line protocol and was reviewed before this course. Evidence startup-only correction 9ffa2dc1 and fixed client/course are the actual received bytes. No source change or replay follows this original outcome.',
    'limits': 'One isolated real collection UI/IndexedDB component in headless Edge; file selection used DOM.setFileInputFiles, not an operating-system chooser. Full application, provider/caregiver flow, general accessibility audit, and arbitrary concurrency scenarios are outside this result. Parent/browser retained PASS_PENDING_VISUAL_REVIEW; this receipt does not silently rewrite those original outcomes.',
    'findings': []
}
path = T / 'memory-native-actual-review.json'
payload = json.dumps(record, ensure_ascii=False, indent=2).encode() + b'\n'
with path.open('xb') as f:
    f.write(payload)
print(json.dumps({'path': str(path), **pin(payload), 'checks': len(checks)}))
