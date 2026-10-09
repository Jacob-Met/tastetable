import base64,gzip,hashlib,json
from pathlib import Path
root=Path("/dev/shm/tastetable-model-stock-234cae4aee53")
g=(root/"raw-receipt.json.gz").read_bytes()
raw=gzip.decompress(g)
sha=lambda b: hashlib.sha256(b).hexdigest()
assert len(g)==5421 and sha(g)=="6dc7c4a9819c6e7e52c0f2463c03e97cb8192f9741417709edc7bb87ca76e95a"
assert len(raw)==17072 and sha(raw)=="59b89efc75222d241ebbe0a3037831e23c3da22b045cf390a5a20191b8ffff09"
r=json.loads(raw)
for name in ("stdout","stderr"):
 s=r["process"][name];b=base64.b64decode(s["base64"],validate=True)
 assert len(b)==s["bytes"] and sha(b)==s["sha256"]
 assert b.decode("utf-8")==s["utf8"]
assert r["accepted"] and r["sourceUnchanged"] and r["failure"] is None
assert r["process"]["status"]==0 and r["process"]["signal"] is None and r["process"]["error"] is None
assert r["process"]["rawStreamsComplete"] and r["process"]["stderr"]["bytes"]==0
assert r["testCounts"]=={"tests":1,"pass":1,"fail":0,"cancelled":0,"skipped":0,"todo":0}
assert r["diagnostic"]["calls"]=={"compare":60,"render":41} and len(r["diagnostic"]["groups"])==7
source=(root/"SOURCE.json").read_bytes()
assert sha(source)==r["sourceManifest"]["sha256"]
for item in r["after"]:
 b=(root/item["path"]).read_bytes()
 assert len(b)==item["bytes"] and sha(b)==item["sha256"]
relocation=Path("/dev/shm/convex-hull-stock-234cae4aee53/PAYLOAD-RELOCATED.json").read_bytes()
assert sha(relocation)=="8030edbe692a3563b2985b5979fd0aaa9c8a92524008745f14b976ec5f895c28"
print(json.dumps({"rawReceiptText":raw.decode(),"sourceText":source.decode(),"relocationText":relocation.decode(),"verified":True},ensure_ascii=False))
