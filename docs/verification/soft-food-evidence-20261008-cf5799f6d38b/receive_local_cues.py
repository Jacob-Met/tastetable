from pathlib import Path
import hashlib,json,sys
sys.path.insert(0,str(Path(sys.argv[1]).resolve()))
import constraints
from qloo_client import parse_entity
cases=[
 ("soups unavailable","unknown"),
 ("no soup or risotto","unknown"),
 ("soup and risotto unavailable","unknown"),
 ("not steamed tofu","unknown"),
 ("soup without risotto","pass"),
 ("no soup; soup available","pass"),
]
rows=[]
for phrase,expected in cases:
 e=parse_entity({"entity_id":"FIX-LOCAL-SOFT-CUE","name":"Authored local-cue control","properties":{"keywords":[phrase]}})
 c=constraints.check_soft_foods(e)
 rows.append({"phrase":phrase,"expected":expected,"actual":c.to_dict(),"pass":c.status==expected})
out={"schema":"tastetable.soft-food-local-cue-controls.v1","source_sha256":hashlib.sha256(Path(constraints.__file__).read_bytes()).hexdigest(),
     "cases":rows,"passed":sum(r["pass"] for r in rows),"failed":sum(not r["pass"] for r in rows)}
print(json.dumps(out,indent=2));sys.exit(1 if out["failed"] else 0)

