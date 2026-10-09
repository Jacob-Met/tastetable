import datetime, hashlib, json, os, pathlib, re, shutil, socket, stat, subprocess, sys
home=pathlib.Path("/Users/me")
runtime=pathlib.Path(sys.executable).resolve()
binary=runtime.read_bytes()
proc=subprocess.run(["/usr/bin/vm_stat"],capture_output=True,check=True,timeout=5)
vm=proc.stdout.decode("ascii")
page_size=int(re.search(r"page size of (\d+) bytes",vm).group(1))
mem=page_size*sum(int(re.search(re.escape(k)+r":\s+(\d+)\.",vm).group(1)) for k in ("Pages free","Pages inactive","Pages speculative"))
paths={}
for name in ["/Users/me/Applications","/Users/me/Developer","/Users/me/Applications/TasteTableVisitRecord-c945953fdeb7","/Users/me/Developer/tastetable-visit-record-local-c945953fdeb7"]:
    p=pathlib.Path(name)
    exists=os.path.lexists(p)
    paths[name]={"exists":exists,"is_plain_directory":exists and stat.S_ISDIR(p.lstat().st_mode) and not stat.S_ISLNK(p.lstat().st_mode)}
probe=socket.socket()
try:
    probe.bind(("127.0.0.1",48661))
    port={"port":48661,"bind_probe":"available","listened":False}
except OSError as error:
    port={"port":48661,"bind_probe":"unavailable","error":str(error),"listened":False}
finally:
    probe.close()
disk=shutil.disk_usage(home).free
record={"observed_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"read_only":True,"pid":os.getpid(),"platform":sys.platform,"runtime":{"configured":"/Library/Frameworks/Python.framework/Versions/3.13/bin/python3","resolved":str(runtime),"version":".".join(map(str,sys.version_info[:3])),"bytes":len(binary),"sha256":hashlib.sha256(binary).hexdigest(),"git_blob":hashlib.sha1(b"blob "+str(len(binary)).encode()+b"\0"+binary).hexdigest(),"mode":format(stat.S_IMODE(runtime.stat().st_mode),"04o"),"mtime_ns":str(runtime.stat().st_mtime_ns)},"free_disk_bytes":disk,"conservative_memory_bytes":mem,"disk_floor":268435456,"memory_floor":2147483648,"floors_pass":disk>=268435456 and mem>=2147483648,"paths":paths,"port":port,"vm_stat_exit":proc.returncode,"no_files_written":True}
print(json.dumps(record,separators=(",",":")))
