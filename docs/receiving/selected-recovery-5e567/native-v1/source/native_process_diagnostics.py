"""Read-only retained-handle diagnostics; no subprocess or product import."""
import ctypes as C
from ctypes import wintypes as W
import time


class PROCESSENTRY32W(C.Structure):
    _fields_ = [('dwSize', W.DWORD), ('cntUsage', W.DWORD),
                ('th32ProcessID', W.DWORD), ('th32DefaultHeapID', C.c_size_t),
                ('th32ModuleID', W.DWORD), ('cntThreads', W.DWORD),
                ('th32ParentProcessID', W.DWORD), ('pcPriClassBase', W.LONG),
                ('dwFlags', W.DWORD), ('szExeFile', W.WCHAR * 260)]


def configure(k):
    for name, args, result in [
        ('GetProcessId', [W.HANDLE], W.DWORD),
        ('QueryFullProcessImageNameW', [W.HANDLE, W.DWORD, W.LPWSTR, C.POINTER(W.DWORD)], W.BOOL),
        ('Process32FirstW', [W.HANDLE, C.POINTER(PROCESSENTRY32W)], W.BOOL),
        ('Process32NextW', [W.HANDLE, C.POINTER(PROCESSENTRY32W)], W.BOOL),
        ('GetExitCodeProcess', [W.HANDLE, C.POINTER(W.DWORD)], W.BOOL),
    ]:
        f = getattr(k, name)
        f.argtypes, f.restype = args, result


def retained_identity(k, job, row):
    """Use only the already membership-confirmed retained kernel handle."""
    h = row['handle']
    result = {'handle_pid': None, 'created_filetime': None,
              'in_owned_job': None, 'wait_result': None,
              'image_path': None, 'image_characters': None,
              'identity_matches_retained': False, 'errors': []}

    def attempt(phase, function):
        try:
            function()
        except BaseException as error:
            result['errors'].append({'phase': phase, 'error': repr(error)})

    def pid():
        value = k.GetProcessId(h)
        if not value:
            raise OSError(C.get_last_error(), 'GetProcessId retained handle')
        result['handle_pid'] = value

    def creation():
        values = [C.c_ulonglong() for _ in range(4)]
        if not k.GetProcessTimes(h, *(C.byref(x) for x in values)):
            raise OSError(C.get_last_error(), 'GetProcessTimes retained handle')
        result['created_filetime'] = values[0].value

    def membership():
        value = W.BOOL()
        if not k.IsProcessInJob(h, job, C.byref(value)):
            raise OSError(C.get_last_error(), 'IsProcessInJob retained handle')
        result['in_owned_job'] = bool(value.value)

    def wait():
        value = k.WaitForSingleObject(h, 0)
        result['wait_result'] = value
        if value == 0xffffffff:
            raise OSError(C.get_last_error(), 'WaitForSingleObject retained diagnostic')

    def image():
        buf = C.create_unicode_buffer(32768)
        count = W.DWORD(len(buf))
        if not k.QueryFullProcessImageNameW(h, 0, buf, C.byref(count)):
            raise OSError(C.get_last_error(), 'QueryFullProcessImageNameW retained diagnostic')
        if not 0 < count.value < len(buf):
            raise ValueError('Full image query length outside fixed buffer')
        result['image_path'] = buf.value
        result['image_characters'] = count.value

    for phase, function in [('pid', pid), ('creation', creation),
                            ('membership', membership), ('wait', wait), ('image', image)]:
        attempt(phase, function)
    result['identity_matches_retained'] = (
        result['handle_pid'] == row['pid'] and
        result['created_filetime'] == row['created_filetime'] and
        result['in_owned_job'] is True)
    return result


def snapshot_parents(k, members):
    """One bounded internal snapshot; persist only requested owned PID rows."""
    wanted = set(members)
    result = {'scope': 'snapshot_only_not_retained_parent_identity',
              'requested_pids': list(members), 'rows': [], 'complete': False,
              'enumerated_entries': 0, 'entry_limit': 16384,
              'processing_budget_seconds': 2.0, 'errors': []}
    stop = time.monotonic() + 2.0
    snap = k.CreateToolhelp32Snapshot(2, 0)
    if snap == C.c_void_p(-1).value:
        raise OSError(C.get_last_error(), 'CreateToolhelp32Snapshot process diagnostic')
    try:
        entry = PROCESSENTRY32W()
        entry.dwSize = C.sizeof(entry)
        ok = k.Process32FirstW(snap, C.byref(entry))
        while ok:
            if result['enumerated_entries'] >= 16384 or time.monotonic() >= stop:
                result['errors'].append({'phase': 'budget', 'error': 'Process snapshot processing bound reached'})
                break
            result['enumerated_entries'] += 1
            if entry.th32ProcessID in wanted:
                result['rows'].append({'snapshot_pid': entry.th32ProcessID,
                                       'snapshot_parent_pid': entry.th32ParentProcessID,
                                       'snapshot_image_basename': entry.szExeFile})
            entry.dwSize = C.sizeof(entry)
            ok = k.Process32NextW(snap, C.byref(entry))
        else:
            error = C.get_last_error()
            if error == 18:
                result['complete'] = True
            else:
                result['errors'].append({'phase': 'enumeration', 'error': error})
    except BaseException as error:
        result['errors'].append({'phase': 'snapshot', 'error': repr(error)})
    finally:
        if not k.CloseHandle(snap):
            result['errors'].append({'phase': 'snapshot_close', 'error': C.get_last_error()})
    return result
