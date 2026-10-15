"""One reviewed TasteTable143 receive step; actual preparation binding and owned Job."""
from pathlib import Path
import ctypes as C
from ctypes import wintypes as W
import hashlib
import json
import os
import subprocess
import sys
import time
import traceback

ROOT = Path(r'C:\Users\jacob\hamon-remote-receiving-5e5670099628-tastetable143-v1')
PYTHON = Path(r'C:\Users\jacob\AppData\Local\Programs\Python\Python312\python.exe')
FROZEN={'NATIVE-EXPECTATIONS.md': '737c219f40b04a05318eaeb133438624b5b0a0b64788ebe97105abab05cb7ec4', 'NATIVE-START-HERE.md': '9c44a6a73ac31200a29fce0aac46a81e62341af70e1d892625740d29f3e22942', 'OPERATOR-README.md': '2fe111be8d4ea0860e54945fd9f674a527562e764f39b26730caa4f74c66eac8', 'RECEIVING-CONTRACT.md': '2df5286e88842e84fa7bfda78afc04f4dc7c60f4b8c444c983d43a6bc1a44c25', 'browser_endpoint.py': 'ff3e5c3e2e0dc63e71b7da6dbaee5859151bec39a79fad70ccfa55711ddb5986', 'child_lifecycle.py': 'b52825365a9cfa1ee310c4f95eddd69606a66bd320547dc1c111a017eade18f7', 'component-fixture/component-freeze.json': '13d4ce90a5a4dc13bd1ca441afb18baae15e19a5436fa49f8fbfbba464d2d06a', 'component-fixture/component-host.mjs': 'c7ae39ca46475807a09325cdc17fc2d769ef18741f4458af135e86f4ea41cbee', 'component-fixture/fixtures/external-addition.json': '2b89248cbdd58ae0bce2d9b4c1f4fe6b78cefeb3cbf4930061ba3c54eadb8090', 'component-fixture/fixtures/initial-records.json': 'aa29653a619579b13f0662f749fbaab90e89e814e69c01c2fd4c4037e21900ab', 'component-fixture/index.html': '5d589cd0b6bd95931d8d4f03e13f52cb016bc7c3de5429772e714366da1e6420', 'component-fixture/static/saved_week_collection.mjs': '578fdbd327ffb2539bf59432bb70c51d3ea7041459bb009ba5ae50d6fc084a99', 'component-fixture/static/saved_week_collection_ui.mjs': '198cc57031e7a4fbb25cdb8d089278c7bc622c0f8f417396549ca9ad196cef93', 'component-fixture/static/saved_week_store.mjs': '621a1270f4b7771e8b14820cb6b12f35b53af8f45b04ea76da046f111647fa64', 'component-fixture/static/saved_weeks.css': 'f147ebcf6343be774e920766720ec031ccfc3e5d2d68a82c3d3cc4f5e9cf0e63', 'component-fixture/static/saved_weeks.mjs': '258c01226e9cd82f29983726dc6f5152ad7a127b9ab05a0574851c1a447b2bd3', 'component-fixture/static/style.css': '0dcea471f360b3085a70da9154537708bc9c282c5c08b974657dab41224cfc96', 'component-fixture/static/week_file.mjs': '914291b97250a97f6e09f47e6fed58b607b3b1ed9e4c60e3242ff39546913614', 'component-fixture/static/week_plan.mjs': 'e739adc10d9ae9ba1cb82c6d800c453e8f7bec53e343e0685adeabe98e6f4809', 'component_client.mjs': '16186666f590a26681b04134aeca47b8aef25f078641a09788d31add4f81f806', 'component_course.mjs': '872a84c3fcc584f50e2961e80a7683e4cb738ea5cd63bbe49326c90b8350de8a', 'component_endpoint.py': 'b0795c9f582bcb1ba96f60868a4e4139085aa79ab2876bfef3e2d89fd02490c0', 'component_evidence.py': '9ffa2dc13915b7fff27dc5b0c707e31e080e5e015484854d821c579a4975b603', 'component_support.py': '00b3a6009d98048450933170e7e4f868724a7625461b25e85cb771d0fa927976', 'fixtures/expected-after-selected.json': '500900f9022dd89741ce5ff0b4b7e8147906c680db08e6322b22bb5a96bd0a9f', 'fixtures/expected-after-stale-refusal.json': '174cfec2013ad7c9de1c4a95f7cb2597b7bf498d12f51de7a04cf94b5d479fb8', 'fixtures/external-addition.json': '2b89248cbdd58ae0bce2d9b4c1f4fe6b78cefeb3cbf4930061ba3c54eadb8090', 'fixtures/initial-records.json': 'aa29653a619579b13f0662f749fbaab90e89e814e69c01c2fd4c4037e21900ab', 'fixtures/mixed-backup.json': '1d5809777396524a0b789c49429e3cf88f444eadb8665659aa30735e08c4aeb2', 'fixtures/replacement-identical-backup.json': '424cdc8c3c278bd6d119133d648dfa38a16b9f911a0bf95766b69a3bf7ff03a5', 'fixtures/stale-backup.json': 'b7dd5124f3539681fcf39c969b318131bfefb80ce4e60a73c1ef16da806db111', 'fresh_admission.py': 'e11b7d9a175463fed68e538df8bb8002266913159940946fc54d0d04643efe5a', 'job_support.py': 'ef4d2000a2e8c365b52bfbcd2347edc3e7b8ce7150ee1cf81695d625326a42b5', 'memory-native-observation-design.md': '30c36252eee1bdc59812de3df6389aea2a4fbc7483116a7e73536a9f6c422985', 'native_process_diagnostics.py': '84c8ce565cfcd35fd087465684ad86f5444e716b6e63289b2579750534cfeb6d', 'process_diagnostics.py': '9c572d15066b9f859fdbafa0c6c8b64598d3d8e3ff96423e9af75869c9f2e287', 'receive_component.py': '42cd38d7a9c74cac79e2448ebb68167ac3e1212d0e4d90789f5ebe5fa039d3df', 'receive_taste.py': '9e8b3737820970fcf3d83c7776412c24354a5502387644271a5dd4514447a258', 'reference/current-consumer-inventory.json': '12dfceaf02776ad3608d91f1cd218d895c4f014f0536eb95f8df004ae921d510', 'reference/prior-v1-preservation.json': '1544dd05c7ee85e16b00bac6327a9c5227a30dba387caa88891b4fd3378e729e', 'reference/prior-v2-preservation.json': 'cade8df663dc7fc8e873ca03e9653a9ad7b3d4eb13d9ac6a697d7202745508c5', 'reference/prior-v3-preservation.json': '990b269497269c6cfedc74b45603765564cba9775b5a1ed5fd94f632c507e27f', 'seal_native.py': 'c4dc814d46fa401497c13d1373e90733938657fe0c7604c065a5d7cc65f33c0a', 'serve_component.py': 'bd1b6a8a834144531337be32eb8ea14d7d8c729db6b70390d3bae70d157829c5'}
sha = lambda raw: hashlib.sha256(raw).hexdigest()


def save(path, value):
    raw = (json.dumps(value, ensure_ascii=True, indent=2) + '\n').encode()
    with path.open('xb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    return {'bytes': len(raw), 'sha256': sha(raw)}


def main():
    if os.name != 'nt' or sys.version_info[:3] != (3, 12, 2) or Path(sys.executable).resolve() != PYTHON.resolve():
        raise ValueError('Exact existing standalone interpreter required')
    if len(sys.argv)!=3 or sys.argv[1]!='receive':raise ValueError('Reviewed receive and actual preparation digest required')
    step=sys.argv[1]
    for name,pin in FROZEN.items():
        if sha((ROOT/name).read_bytes())!=pin:raise ValueError('Frozen member differs: '+name)
    sys.path.insert(0,str(ROOT))
    from job_support import api, ExtendedLimits, checked, job_pids, resume_owned_primary
    directory=ROOT/'receive-command'
    directory.mkdir(exist_ok=False)
    argv=[str(PYTHON),'-B','-s',str(ROOT/'receive_taste.py'),'--preparation-sha256',sys.argv[2]]
    step_receipt=ROOT/'parent-receipt.json'
    rec = {'schema': 'hamon.tastetable143.command/1', 'token': 'taste143-' + step + '-20261015-v1',
           'argv': argv, 'cwd': str(ROOT), 'wrapper_sha256': sha(Path(__file__).read_bytes()),
           'frozen_members': FROZEN, 'deadline_seconds': 260, 'cleanup_grace_seconds': 15,
           'completed': False, 'controller_started': False, 'errors': []}
    save(directory / 'started.json', rec)
    k = None
    job = None
    child = None
    assigned = False
    streams = []
    start = time.monotonic()
    try:
        k = api()
        job = k.CreateJobObjectW(None, None)
        checked(job, 'Create outer owned consumer Job')
        limits = ExtendedLimits()
        limits.basic.flags = 0x2000
        checked(k.SetInformationJobObject(job, 9, C.byref(limits), C.sizeof(limits)), 'Set outer kill-on-close')
        for name in ('controller.stdout.bin', 'controller.stderr.bin'):
            streams.append((directory / name).open('xb', buffering=0))
        child = subprocess.Popen(argv, cwd=ROOT, stdin=subprocess.DEVNULL, stdout=streams[0],
            stderr=streams[1], close_fds=True, creationflags=4)
        rec['controller_pid'] = child.pid
        rec['created_suspended'] = True
        save(directory / 'created.json', rec)
        checked(k.AssignProcessToJobObject(job, W.HANDLE(int(child._handle))), 'Assign exact retained suspended controller')
        assigned = True
        rec['primary_thread'] = resume_owned_primary(k, child.pid, W.HANDLE(int(child._handle)), job)
        rec['controller_started'] = True
        save(directory / 'resumed.json', rec)
        print(json.dumps({'token': rec['token'], 'controller_pid': child.pid}), flush=True)
        while child.poll() is None:
            if time.monotonic() - start > 260:
                raise TimeoutError('260-second outer deadline')
            if sum((directory / n).stat().st_size for n in ('controller.stdout.bin', 'controller.stderr.bin')) > 16 * 1024**2:
                raise RuntimeError('Sampled controller log cap exceeded')
            time.sleep(.1)
        rec['completed'] = True
        rec['returncode'] = child.returncode
        rec['terminal_job_snapshot'] = job_pids(k, job)
        if rec['terminal_job_snapshot']:
            raise RuntimeError('Controller exited with owned live descendants')
    except BaseException:
        rec['errors'].append({'phase': 'controller', 'traceback': traceback.format_exc()})
    finally:
        if job:
            try:
                if job_pids(k, job):
                    checked(k.TerminateJobObject(job, 124), 'Terminate only outer owned Job')
                    rec['forced_owned_cleanup'] = True
                end = time.monotonic() + 15
                while job_pids(k, job) and time.monotonic() < end:
                    time.sleep(.1)
                rec['job_active_at_teardown'] = job_pids(k, job)
            except BaseException:
                rec['errors'].append({'phase': 'outer-cleanup', 'traceback': traceback.format_exc()})
            finally:
                try:
                    checked(k.CloseHandle(job), 'Close outer Job handle')
                except BaseException:
                    rec['errors'].append({'phase': 'outer-job-close', 'traceback': traceback.format_exc()})
        if child and child.poll() is None:
            if not assigned:
                try:
                    child.kill()
                    rec['killed_own_unassigned_suspended_controller'] = True
                except BaseException:
                    rec['errors'].append({'phase': 'unassigned-cleanup', 'traceback': traceback.format_exc()})
            try:
                child.wait(timeout=15)
            except BaseException:
                rec['errors'].append({'phase': 'controller-final-wait', 'traceback': traceback.format_exc()})
        rec['returncode'] = None if child is None else child.poll()
        for stream in streams:
            try:
                stream.close()
            except BaseException:
                rec['errors'].append({'phase': 'log-close', 'traceback': traceback.format_exc()})
        rec['duration_s'] = time.monotonic() - start
        rec['logs'] = {}
        for name in ('controller.stdout.bin', 'controller.stderr.bin'):
            path = directory / name
            if path.exists():
                raw = path.read_bytes()
                rec['logs'][name] = {'bytes': len(raw), 'sha256': sha(raw)}
        receipt = step_receipt
        if receipt.exists():
            raw = receipt.read_bytes()
            rec['step_receipt'] = {'bytes': len(raw), 'sha256': sha(raw)}
        rec['accepted'] = bool(rec['completed'] and rec['returncode'] == 0 and rec.get('job_active_at_teardown') == []
            and not rec.get('forced_owned_cleanup') and not rec['errors'] and 'step_receipt' in rec)
        pin = save(directory / 'result.json', rec)
    print(json.dumps({'token': rec['token'], 'accepted': rec['accepted'], 'returncode': rec['returncode'], 'receipt': pin}), flush=True)
    return 0 if rec['accepted'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
