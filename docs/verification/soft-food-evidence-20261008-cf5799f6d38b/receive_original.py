from pathlib import Path
import hashlib, json, sys
from unittest.mock import patch
ROOT=Path(sys.argv[1]).resolve()
sys.path.insert(0,str(ROOT))
import agent, constraints, qloo_client
cases=[
 ("denied_existing_soft_cue",["no soup"],"unknown",True),
 ("unavailable_existing_soft_cue",["soup unavailable"],"unknown",True),
 ("denied_soft_does_not_erase_firm_signal",["burger","no soup"],"fail",False),
 ("affirmative_soft_keeps_existing_precedence",["burger","soup"],"pass",True),
]
results=[]
with patch("urllib.request.urlopen",side_effect=AssertionError("unexpected provider access")):
 for name,words,status,kept in cases:
  entity=qloo_client.parse_entity({"entity_id":"FICTIONAL-SOFT-"+name,"name":"Authored evidence counterexample","properties":{"keywords":[{"name":x} for x in words]}})
  verdict=constraints.evaluate(entity,["soft_foods"])
  state=agent.AgentState({"constraints":["soft_foods"]})
  state.candidates[entity.entity_id]={"entity":entity,"purpose":"restaurant","signals":[],"query_tags":[]}
  state.verdicts[entity.entity_id]=verdict.to_dict()
  plan=agent.assemble_plan(state)
  included=any(m["entity_id"]==entity.entity_id for m in plan["meals"])
  results.append({"name":name,"keywords":words,"expected_status":status,"expected_included":kept,
   "actual_verdict":verdict.to_dict(),"actual_plan":plan,"pass":verdict.checks[0].status==status and included==kept})
out={"schema":"tastetable.soft-food-original-receiving.v1","source":str(ROOT),"scope":"actual evaluate and assemble_plan with authored entity evidence; no provider/model/health-outcome claim",
     "inputs":[{"path":m.__file__,"sha256":hashlib.sha256(Path(m.__file__).read_bytes()).hexdigest()} for m in (agent,constraints,qloo_client)],
     "cases":results,"passed":sum(r["pass"] for r in results),"failed":sum(not r["pass"] for r in results)}
print(json.dumps(out,indent=2))
sys.exit(0 if not out["failed"] else 1)

