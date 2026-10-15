"""Owned suspended-process/Job lifecycle from the retained MAL64 controller.
No old allocation, interpreter, admission or source address is reused.
"""
import ctypes as C
from ctypes import wintypes as W
from pathlib import Path
from datetime import datetime, timezone
import shutil
ROOT=Path(r"C:\Users\jacob\hamon-remote-receiving-5e5670099628-vicon-view288-v3")
def utc():
    return datetime.now(timezone.utc).isoformat()
def api():
    k = C.WinDLL("kernel32", use_last_error=True)
    k.CreateJobObjectW.argtypes = [C.c_void_p, W.LPCWSTR]
    k.CreateJobObjectW.restype = W.HANDLE
    k.SetInformationJobObject.argtypes = [W.HANDLE, C.c_int, C.c_void_p, W.DWORD]
    k.SetInformationJobObject.restype = W.BOOL
    k.AssignProcessToJobObject.argtypes = [W.HANDLE, W.HANDLE]
    k.AssignProcessToJobObject.restype = W.BOOL
    k.IsProcessInJob.argtypes = [W.HANDLE, W.HANDLE, C.POINTER(W.BOOL)]
    k.IsProcessInJob.restype = W.BOOL
    k.QueryInformationJobObject.argtypes = [W.HANDLE, C.c_int, C.c_void_p, W.DWORD, C.c_void_p]
    k.QueryInformationJobObject.restype = W.BOOL
    k.TerminateJobObject.argtypes = [W.HANDLE, W.UINT]
    k.TerminateJobObject.restype = W.BOOL
    k.CloseHandle.argtypes = [W.HANDLE]
    k.CloseHandle.restype = W.BOOL
    k.CreateToolhelp32Snapshot.argtypes = [W.DWORD, W.DWORD]
    k.CreateToolhelp32Snapshot.restype = W.HANDLE
    k.Thread32First.argtypes = [W.HANDLE, C.c_void_p]
    k.Thread32First.restype = W.BOOL
    k.Thread32Next.argtypes = [W.HANDLE, C.c_void_p]
    k.Thread32Next.restype = W.BOOL
    k.OpenThread.argtypes = [W.DWORD, W.BOOL, W.DWORD]
    k.OpenThread.restype = W.HANDLE
    k.GetProcessIdOfThread.argtypes = [W.HANDLE]
    k.GetProcessIdOfThread.restype = W.DWORD
    k.ResumeThread.argtypes = [W.HANDLE]
    k.ResumeThread.restype = W.DWORD
    k.OpenProcess.argtypes = [W.DWORD, W.BOOL, W.DWORD]
    k.OpenProcess.restype = W.HANDLE
    k.WaitForSingleObject.argtypes = [W.HANDLE, W.DWORD]
    k.WaitForSingleObject.restype = W.DWORD
    k.GetProcessTimes.argtypes = [W.HANDLE, C.c_void_p, C.c_void_p, C.c_void_p, C.c_void_p]
    k.GetProcessTimes.restype = W.BOOL
    k.GlobalMemoryStatusEx.argtypes = [C.c_void_p]
    k.GlobalMemoryStatusEx.restype = W.BOOL
    return k

class Memory(C.Structure):
    _fields_ = [("length", W.DWORD), ("load", W.DWORD)] + [
        (n, C.c_ulonglong) for n in
        ("total_phys", "avail_phys", "total_page", "avail_page", "total_virtual", "avail_virtual", "avail_extended")]

class BasicLimits(C.Structure):
    _fields_ = [("process_time", C.c_longlong), ("job_time", C.c_longlong),
                ("flags", W.DWORD), ("min_ws", C.c_size_t), ("max_ws", C.c_size_t),
                ("active_limit", W.DWORD), ("affinity", C.c_size_t),
                ("priority", W.DWORD), ("scheduling", W.DWORD)]

class IOCounters(C.Structure):
    _fields_ = [(n, C.c_ulonglong) for n in ("read_ops", "write_ops", "other_ops", "read_bytes", "write_bytes", "other_bytes")]

class ExtendedLimits(C.Structure):
    _fields_ = [("basic", BasicLimits), ("io", IOCounters),
                ("process_memory", C.c_size_t), ("job_memory", C.c_size_t),
                ("peak_process", C.c_size_t), ("peak_job", C.c_size_t)]

class ThreadEntry(C.Structure):
    _fields_ = [("size", W.DWORD), ("usage", W.DWORD), ("tid", W.DWORD),
                ("owner", W.DWORD), ("base_priority", W.LONG),
                ("delta_priority", W.LONG), ("flags", W.DWORD)]

def checked(ok, label):
    if not ok:
        raise OSError(C.get_last_error(), label)

def resources(k):
    m = Memory()
    m.length = C.sizeof(m)
    checked(k.GlobalMemoryStatusEx(C.byref(m)), "GlobalMemoryStatusEx")
    return {"utc": utc(), "disk_free": shutil.disk_usage(ROOT.parent).free,
            "ram_available": m.avail_phys}

def job_pids(k, job):
    size = 1024
    while size <= 1024 * 1024:
        buf = C.create_string_buffer(size)
        if k.QueryInformationJobObject(job, 3, buf, size, None):
            n = W.DWORD.from_buffer(buf, 4).value
            if 8 + n * C.sizeof(C.c_size_t) > size:
                raise RuntimeError("job PID response overflow")
            return list((C.c_size_t * n).from_buffer(buf, 8))
        if C.get_last_error() != 234:
            raise OSError(C.get_last_error(), "QueryInformationJobObject")
        size *= 2
    raise RuntimeError("job PID enumeration exceeded bounded buffer")

def resume_owned_primary(k, pid, process_handle, job):
    snap = k.CreateToolhelp32Snapshot(4, 0)
    if snap == C.c_void_p(-1).value:
        raise OSError(C.get_last_error(), "thread snapshot")
    tids = []
    try:
        entry = ThreadEntry()
        entry.size = C.sizeof(entry)
        ok = k.Thread32First(snap, C.byref(entry))
        while ok:
            if entry.owner == pid:
                tids.append(entry.tid)
            entry.size = C.sizeof(entry)
            ok = k.Thread32Next(snap, C.byref(entry))
        if C.get_last_error() != 18:
            raise OSError(C.get_last_error(), "thread enumeration")
    finally:
        k.CloseHandle(snap)
    if len(tids) != 1:
        raise RuntimeError(f"suspended child has unexpected thread count: {len(tids)}")
    handle = k.OpenThread(2 | 0x0800, False, tids[0])
    checked(handle, "OpenThread own suspended primary")
    try:
        actual_owner = k.GetProcessIdOfThread(handle)
        if not actual_owner:
            raise OSError(C.get_last_error(), "GetProcessIdOfThread opened primary")
        if actual_owner != pid:
            raise RuntimeError("opened thread belongs to a different process identity")
        membership = W.BOOL()
        checked(k.IsProcessInJob(process_handle, job, C.byref(membership)),
                "IsProcessInJob retained runner before resume")
        if not membership.value or k.WaitForSingleObject(process_handle, 0) != 258:
            raise RuntimeError("retained runner is no longer live in the owned job")
        prior = k.ResumeThread(handle)
        if prior != 1:
            raise RuntimeError(f"unexpected primary suspension count: {prior}")
    finally:
        k.CloseHandle(handle)
    return tids[0]

def observe(k, job, observed, unknown):
    now = utc()
    pids = job_pids(k, job)
    for pid in pids:
        # Retain a membership-confirmed kernel identity, not merely a reusable PID.
        if any(x["pid"] == pid and k.WaitForSingleObject(x["handle"], 0) == 258 for x in observed):
            continue
        h = k.OpenProcess(0x100000 | 0x1000, False, pid)
        if not h:
            unknown.append({"snapshot_pid": pid, "observed_utc": now,
                            "open_error": C.get_last_error(), "owned_identity_attributed": False})
            continue
        membership = W.BOOL()
        if not k.IsProcessInJob(h, job, C.byref(membership)):
            error = C.get_last_error()
            k.CloseHandle(h)
            unknown.append({"snapshot_pid": pid, "observed_utc": now,
                            "membership_error": error, "owned_identity_attributed": False})
            continue
        if not membership.value:
            k.CloseHandle(h)
            unknown.append({"snapshot_pid": pid, "observed_utc": now,
                            "opened_handle_in_owned_job": False, "owned_identity_attributed": False})
            continue
        values = [C.c_ulonglong() for _ in range(4)]
        if not k.GetProcessTimes(h, *(C.byref(x) for x in values)):
            err = C.get_last_error()
            k.CloseHandle(h)
            raise OSError(err, "GetProcessTimes membership-confirmed owned child")
        observed.append({"pid": pid, "handle": h, "created_filetime": values[0].value,
                         "observed_utc": now, "opened_handle_in_owned_job": True})
    return pids

