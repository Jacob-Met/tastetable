"""Assemble exact authored authorities and check a complete proposed tree locally."""
from pathlib import Path
import base64
import hashlib
import json
import stat
import subprocess
import sys

P = Path(__file__).resolve().parent
OWN = P.parent
B = OWN.parents[1]
TOOLS = OWN / 'preparation/publication-tools-v1'
Q = 'docs/qualification/handoff-compare-forge-d3745/'
ROOT_PREFIX = Q + 'independent-root/'


def encode(value):
    return (json.dumps(value, ensure_ascii=True, sort_keys=True, indent=2) + '\n').encode()


def identity(raw):
    return {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
            'git_blob': hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()}


def capture(path):
    path = Path(path)
    assert stat.S_ISREG(path.lstat().st_mode), path
    raw = path.read_bytes()
    return raw, {**identity(raw), 'native_mode': stat.S_IMODE(path.stat().st_mode)}


def save(name, value):
    path = P / name
    with path.open('xb') as stream:
        stream.write(encode(value))
    return path


config = json.loads((P / 'assembly-config-v1.json').read_bytes())
base = json.loads((P / 'base-commit.json').read_bytes())
tree = json.loads((P / 'base-tree.json').read_bytes())
assert base['sha'] == config['base_commit'] == 'c93c83c4b5f05686dca5810427dd4f5f826709e9'
assert base['tree']['sha'] == tree['sha'] == '5dbdb2e6a1a649ddcf568146911572b5f7a41117'
tool_admission = json.loads((OWN / 'preparation/publication-tools-admission-v1.json').read_bytes())
for row in tool_admission['files']:
    _, got = capture(TOOLS / row['repository_path'])
    assert all(got[k] == row[k] for k in ['bytes', 'sha256', 'git_blob'])
    assert got['native_mode'] == int(row['mode'][-3:], 8)
sys.path.insert(0, str(TOOLS))
from verify_tree_union import admit_snapshot, git_tree_id
prior = admit_snapshot(tree, tree['sha'], 'current base')
assert len(prior) == 1073


def pinned_json(record):
    raw, got = capture(record['path'])
    assert got['sha256'] == record['sha256'] and got['bytes'] == record['bytes']
    return json.loads(raw), got


author, author_identity = pinned_json(config['author'])
independent, independent_identity = pinned_json(config['independent'])
view, view_identity = pinned_json(config['layout_view'])
assert author['counts'] == {'source': 9, 'support': 12, 'total': 21}
assert independent['qualification_prefix'] == view['prefix'] == ROOT_PREFIX
assert len(independent['files']) == len(view['files']) == 66
assert view['original_authority']['sha256'] == independent_identity['sha256']
assert view['original_authority']['bytes'] == independent_identity['bytes']
for original, relative in zip(independent['files'], view['files']):
    assert original['path'].startswith(ROOT_PREFIX)
    restored = dict(relative, path=ROOT_PREFIX + relative['path'])
    assert restored == original, original['path']

selected = []
packet_rows = []
seen = set()
watched = {}


def add(destination, source_path, mode, role, authority, expected=None):
    assert destination not in seen, destination
    assert mode in ('100644', '100755')
    raw, got = capture(source_path)
    assert got['native_mode'] == int(mode[-3:], 8), (source_path, got['native_mode'], mode)
    if expected:
        assert all(got[k] == expected[k] for k in ['bytes', 'sha256', 'git_blob']), destination
    if role != 'source':
        assert destination.startswith(Q) and destination not in prior
    else:
        assert not destination.startswith(Q)
    seen.add(destination)
    watched[str(Path(source_path).resolve())] = got
    selected.append({'path': destination, 'mode': mode, 'role': role, 'authority': authority,
                     'source_path': str(Path(source_path).resolve()), **identity(raw)})
    packet_rows.append({'path': destination, 'mode': mode, 'sha': got['git_blob'],
                        'encoding': 'base64', 'content': base64.b64encode(raw).decode('ascii')})


for row in author['files']:
    assert row['role'] in ('source', 'support')
    add(row['path'], row['source_path'], row['mode'], row['role'], 'original-author21', row)
for row in independent['files']:
    add(row['path'], row['source_path'], row['mode'], 'evidence', 'original-independent66', row)
for row in config['extra_support']:
    add(row['path'], row['source_path'], row['mode'], 'support', row['purpose'], row)
add(Q + 'assembly-config-v1.json', P / 'assembly-config-v1.json', '100644', 'support', 'explicit assembly configuration')
source_rows = [r for r in selected if r['role'] == 'source']
assert {r['path'] for r in source_rows} == set(config['source_fence'])
assert len(source_rows) == 9
assert {r['path'] for r in source_rows if r['path'] in prior} == {'README.md', 'static/index.html'}

binding = {'schema': 'forge.tastetable.publication-binding.v1',
           'base_commit': base['sha'], 'base_tree': tree['sha'],
           'original_authority': config['author'], 'independent_authority': config['independent'],
           'maintained_layout_view': config['layout_view'],
           'layout_view_crosswalk': 'All 66 complete destination/identity records equal the unchanged original; only exact prefix stripped for maintained descriptor admission.',
           'source_fence': source_rows, 'extra_support': config['extra_support'],
           'tool_admission': tool_admission,
           'scope': 'Publication only. Original author22, failed V2, source-free transport diagnostic and successful V3/68 remain distinct. No product rerun, remote mutation or prior authority rewrite.'}
binding_path = save('publication-binding-v1.json', binding)
add(Q + 'publication-binding-v1.json', binding_path, '100644', 'support', 'explicit publication binding')

save('selection-authority-v1.json', {'schema': 'forge.tastetable.publication-selection.v1',
                                   'counts': {role: sum(r['role'] == role for r in selected) for role in ['source', 'support', 'evidence']},
                                   'total': len(selected), 'files': selected})
packet_path = save('selected.packet.json', {'schema': 'hamon.source-packet/1',
                                         'source': {'repository': 'Jacob-Met/tastetable', 'commit': base['sha'], 'tree': tree['sha']},
                                         'files': sorted(packet_rows, key=lambda r: r['path'])})
policy_path = save('layout-policy.json', {'schema': 'hamon.publication-layout/1',
                                       'source_files': [r for r in selected if r['role'] == 'source'],
                                       'support_files': [r for r in selected if r['role'] == 'support'],
                                       'evidence_prefix': Q, 'descriptor_schema': view['schema'], 'descriptor_prefix': ROOT_PREFIX})
commands = []


def run(label, tool, args):
    argv = [sys.executable, '-B', str(TOOLS / tool), *map(str, args)]
    result = subprocess.run(argv, capture_output=True, timeout=60)
    for name, body in [('stdout', result.stdout), ('stderr', result.stderr)]:
        with (P / (label + '.' + name)).open('xb') as stream:
            stream.write(body)
    commands.append({'label': label, 'argv': argv, 'exit': result.returncode,
                     'stdout': identity(result.stdout), 'stderr': identity(result.stderr)})
    assert result.returncode == 0, (label, result.stderr)


plan_path = P / 'selected.objects.json'
run('prepare', 'prepare_git_objects.py', [packet_path, '--sha256', identity(packet_path.read_bytes())['sha256'], '--out', plan_path])
plan_pin = identity(plan_path.read_bytes())['sha256']
run('layout', 'validate_publication_layout.py', [plan_path, '--sha256', plan_pin, '--policy', policy_path,
                                               '--policy-sha256', identity(policy_path.read_bytes())['sha256'],
                                               '--descriptor', config['layout_view']['path'], '--descriptor-sha256', view_identity['sha256']])
plan = json.loads(plan_path.read_bytes())
leaves = dict(prior)
for row in plan['tree_entries']:
    leaves[row['path']] = (row['mode'], row['type'], row['sha'])
assert all(leaves[k] == value for k, value in prior.items() if k not in seen)
directories = {''}
for name in leaves:
    parts = name.split('/')
    directories.update('/'.join(parts[:i]) for i in range(1, len(parts)))
assert not set(leaves) & directories
nodes = dict(leaves)
for name in sorted(directories, key=lambda p: (p.count('/'), len(p)), reverse=True):
    children = [(k.rsplit('/', 1)[-1], value) for k, value in nodes.items() if k.rpartition('/')[0] == name]
    sha = git_tree_id(children)
    if name:
        nodes[name] = ('040000', 'tree', sha)
    else:
        root_sha = sha
proposed_path = save('proposed-complete-tree.json', {'sha': root_sha, 'truncated': False,
                                                 'tree': [dict(path=k, mode=v[0], type=v[1], sha=v[2]) for k, v in sorted(nodes.items())]})
assert len(admit_snapshot(json.loads(proposed_path.read_bytes()), root_sha, 'proposal')) == len(leaves)
run('tree', 'verify_publication_tree.py', [plan_path, '--sha256', plan_pin,
                                        '--base', P / 'base-tree.json', tree['sha'], '--proposed', proposed_path, root_sha])
for path, before in watched.items():
    assert capture(path)[1] == before, path
for record in [config['author'], config['independent'], config['layout_view']]:
    pinned_json(record)
receipt = {'schema': 'forge.tastetable.publication-preflight.v1', 'accepted': True,
           'base_commit': base['sha'], 'base_tree': tree['sha'], 'proposed_tree': root_sha,
           'terminal_entries': {'base': len(prior), 'proposed': len(leaves)},
           'selected_files': len(selected), 'unique_blobs': len(plan['blobs']),
           'source': 9, 'evidence': 66, 'support': sum(r['role'] == 'support' for r in selected),
           'plan': identity(plan_path.read_bytes()), 'commands': commands,
           'unselected_preserved': len(prior) - 2, 'source_controls_and_authorities_preserved': True,
           'limits': 'Local complete-plan/layout/tree admission; no Git object/ref change, remote readback or product execution.'}
save('preflight-receipt-v1.json', receipt)
print(json.dumps(receipt, sort_keys=True))
