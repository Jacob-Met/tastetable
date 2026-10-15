"""Exact accepted one-child Windows Job lifecycle, scoped to this course."""
from pathlib import Path
import base64,ctypes as C,subprocess,time,traceback
from ctypes import wintypes as W
from component_support import ROOT,sha,write_json
OUT=ROOT/'parent-course'
ARTIFACTS=OUT

def run_child(label, argv, env, records, deadline=40):
    """Start suspended, own the exact child in a kill-on-close Job, preserve its complete logs."""
    from job_support import api, ExtendedLimits, checked, job_pids, resume_owned_primary
    directory = OUT / label
    directory.mkdir(exist_ok=False)
    rec = {'label': label, 'argv': argv, 'cwd': str(ARTIFACTS), 'deadline_seconds': deadline,
           'cleanup_grace_seconds': 5, 'started': False, 'errors': []}
    records.append(rec)
    write_json(directory / 'intent.json', rec)
    k = None
    job = None
    child = None
    assigned = False
    streams = []
    start = time.monotonic()
    try:
        k = api()
        job = k.CreateJobObjectW(None, None)
        checked(job, 'Create owned consumer child Job')
        limits = ExtendedLimits()
        limits.basic.flags = 0x2000
        checked(k.SetInformationJobObject(job, 9, C.byref(limits), C.sizeof(limits)), 'Set kill-on-close')
        for name in ('stdout.bin', 'stderr.bin'):
            streams.append((directory / name).open('xb', buffering=0))
        child = subprocess.Popen(argv, cwd=ARTIFACTS, env=env, stdin=subprocess.DEVNULL,
            stdout=streams[0], stderr=streams[1], close_fds=True, creationflags=4)
        rec['pid'] = child.pid
        rec['created_suspended'] = True
        write_json(directory / 'created.json', rec)
        checked(k.AssignProcessToJobObject(job, W.HANDLE(int(child._handle))), 'Assign exact retained suspended child')
        assigned = True
        rec['primary_thread'] = resume_owned_primary(k, child.pid, W.HANDLE(int(child._handle)), job)
        rec['started'] = True
        write_json(directory / 'resumed.json', rec)
        while child.poll() is None:
            if time.monotonic() - start > deadline:
                raise TimeoutError(str(deadline)+'-second consumer child deadline')
            if sum((directory / n).stat().st_size for n in ('stdout.bin', 'stderr.bin')) > 8 * 1024**2:
                raise RuntimeError('Sampled raw-log limit exceeded')
            time.sleep(.05)
        rec['terminal_job_snapshot'] = job_pids(k, job)
        if rec['terminal_job_snapshot']:
            raise RuntimeError('Child exited with live owned descendants')
    except BaseException:
        rec['errors'].append({'phase': 'child', 'traceback': traceback.format_exc()})
    finally:
        if job:
            try:
                if job_pids(k, job):
                    checked(k.TerminateJobObject(job, 124), 'Terminate only owned consumer Job')
                    rec['forced_owned_cleanup'] = True
                end = time.monotonic() + 5
                while job_pids(k, job) and time.monotonic() < end:
                    time.sleep(.05)
                rec['job_active_at_teardown'] = job_pids(k, job)
            except BaseException:
                rec['errors'].append({'phase': 'cleanup', 'traceback': traceback.format_exc()})
            finally:
                try:
                    checked(k.CloseHandle(job), 'Close owned child Job')
                except BaseException:
                    rec['errors'].append({'phase': 'job-close', 'traceback': traceback.format_exc()})
        if child and child.poll() is None:
            if not assigned:
                try:
                    child.kill()
                    rec['killed_own_unassigned_suspended_child'] = True
                except BaseException:
                    rec['errors'].append({'phase': 'unassigned-cleanup', 'traceback': traceback.format_exc()})
            try:
                child.wait(timeout=5)
            except BaseException:
                rec['errors'].append({'phase': 'child-final-wait', 'traceback': traceback.format_exc()})
        rec['returncode'] = None if child is None else child.poll()
        for stream in streams:
            try:
                stream.close()
            except BaseException:
                rec['errors'].append({'phase': 'raw-log-close', 'traceback': traceback.format_exc()})
        rec['duration_s'] = time.monotonic() - start
        rec['logs'] = {}
        for name in ('stdout.bin', 'stderr.bin'):
            path = directory / name
            if path.exists():
                raw = path.read_bytes()
                rec['logs'][name] = {'bytes': len(raw), 'sha256': sha(raw), 'base64': base64.b64encode(raw).decode('ascii')}
        rec['lifecycle_complete'] = bool(rec['started'] and rec['returncode'] is not None
            and rec.get('job_active_at_teardown') == [] and not rec.get('forced_owned_cleanup') and not rec['errors'])
        write_json(directory / 'result.json', rec)
    if not rec['lifecycle_complete']:
        raise RuntimeError('Owned child lifecycle failed: ' + label)
    return rec

