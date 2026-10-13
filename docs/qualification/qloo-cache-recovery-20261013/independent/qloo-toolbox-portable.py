"""Independent consumer receiving for TasteTable Qloo parse-before-cache repair."""
from __future__ import annotations
import argparse, copy, hashlib, importlib.util, json, os, platform, sys, urllib.request
from pathlib import Path
def require(ok, message):
    if not ok: raise RuntimeError(message)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
p=argparse.ArgumentParser()
p.add_argument("--source-root", type=Path, required=True)
p.add_argument("--baseline-client", type=Path, required=True)
p.add_argument("--variant",choices=("baseline","candidate"),required=True)
p.add_argument("--malformed",choices=("late_bad_affinity","declared_failure"),required=True)
args=p.parse_args()
root=args.source_root.resolve()
baseline_path=args.baseline_client.resolve()
client_path=root/"qloo_client.py" if args.variant=="candidate" else baseline_path
files=[root/name for name in ("qloo_client.py","agent.py","constraints.py","personas.py","fixtures/qloo_fixtures.json","tests/test_qloo_cache_recovery.py")]+[baseline_path]
before={str(path):sha(path) for path in files}
require(before[str(root/"qloo_client.py")]=="a8362350fd8f549b312255d7c7c5630b111f57e40ab1ec0da7ff9bf7b43b1aaf","candidate pin changed")
require(before[str(baseline_path)]=="a7b3362896273e05782e789cb1f89f053f32c4e1b766ae5998e19ed9fab103f9","baseline pin changed")
os.environ.clear()
def no_network(*a,**kw):raise RuntimeError("Network forbidden in independent receiver")
urllib.request.urlopen=no_network
spec=importlib.util.spec_from_file_location("qloo_client",client_path)
client_module=importlib.util.module_from_spec(spec);sys.modules["qloo_client"]=client_module
spec.loader.exec_module(client_module)
sys.path.insert(0,str(root))
import agent
from personas import PERSONAS
class ScheduledFixture(client_module.FixtureTransport):
    def __init__(self):
        super().__init__(root/"fixtures/qloo_fixtures.json")
        self.issued=0
    def _insights(self,params):
        self.issued+=1
        response=copy.deepcopy(super()._insights(params))
        if self.issued==1:
            if args.malformed=="late_bad_affinity":
                require(len(response["results"]["entities"])>=4,"fixture changed")
                response["results"]["entities"].append({"entity_id":"ANVIL-BROKEN","name":"Malformed tail","query":{"affinity":"ANVIL_RESPONSE_DETAIL"}})
            else:
                response={"success":False,"errors":"ANVIL_RESPONSE_DETAIL"}
        return response
fixture=ScheduledFixture()
client=client_module.QlooClient(api_key="ANVIL-SYNTHETIC",transport=fixture)
state=agent.AgentState(persona=copy.deepcopy(PERSONAS["rosa"]))
tools=agent.Toolbox(client,state)
query={"filter_type":"urn:entity:place","purpose":"restaurant","take":50}
def notes(plan):return "\n".join(plan["notes"])
needle="restaurant recommendation lookup could not be completed"
first=tools.run("qloo_recs",query)
require("error" in first,"first malformed response was accepted")
require(fixture.issued==1,"automatic retry occurred")
require(not state.candidates and not state.verdicts,"partial malformed candidates escaped")
initial_plan=agent.assemble_plan(state)
require(needle in notes(initial_plan),"incomplete lookup was hidden")
require("returned no candidates" not in notes(initial_plan),"failure called successful empty result")
require("did not pass" not in notes(initial_plan),"failure called constraint rejection")
require("ANVIL_RESPONSE_DETAIL" not in notes(initial_plan),"raw diagnostic leaked into plan")
invalid=tools.run("qloo_recs",{**query,"tag_ids":[1]})
require("error" in invalid and fixture.issued==1,"invalid input reached transport")
require(needle in notes(agent.assemble_plan(state)),"invalid input erased incomplete lookup")
other_query={**query,"take":49}
other=tools.run("qloo_recs",other_query)
require("candidates" in other and fixture.issued==2,"distinct query failed to recover independently")
checked=tools.run("constraint_check",{"entity_ids":[e["entity_id"] for e in other["candidates"]],"constraints":state.persona["constraints"],"kind":"restaurant"})
require("verdicts" in checked,"constraint checks failed")
partial_plan=agent.assemble_plan(state)
require(len(partial_plan["meals"])==4,"healthy checked meal fixture changed")
require(needle in notes(partial_plan),"different query erased original incomplete lookup")
explicit=tools.run("qloo_recs",query)
if args.variant=="baseline":
    require("error" in explicit,"baseline unexpectedly recovered")
    require(fixture.issued==2,"baseline malformed cache was not reproduced")
    require(needle in notes(agent.assemble_plan(state)),"baseline failure note disappeared")
    final_plan=agent.assemble_plan(state)
    outcome="reproduced stale malformed cache; explicit original lookup stayed incomplete"
else:
    require("candidates" in explicit,"explicit same-request retry failed")
    require(fixture.issued==3,"explicit retry count differed")
    require(fixture.log[0]==fixture.log[2],"recovery request was not identical")
    require("ANVIL-BROKEN" not in state.candidates,"malformed candidate survived")
    require("error" not in tools.run("constraint_check",{"entity_ids":[e["entity_id"] for e in explicit["candidates"]],"constraints":state.persona["constraints"],"kind":"restaurant"}),"recovered checks failed")
    final_plan=agent.assemble_plan(state)
    require(len(final_plan["meals"])==4,"recovery lost usable checked meals")
    require(needle not in notes(final_plan),"same-query incomplete note was not cleared")
    cached=tools.run("qloo_recs",query)
    require(cached==explicit and fixture.issued==3,"successful lookup was not cached")
    require(agent.assemble_plan(state)==final_plan,"cached repeat altered retained plan")
    one=client.insights("urn:entity:place",take=50)
    original_name=one[0].name;one[0].name="ANVIL-CALLER-MUTATION"
    two=client.insights("urn:entity:place",take=50)
    require(one[0] is not two[0] and two[0].name==original_name and fixture.issued==3,"raw cache did not reparse fresh objects")
    outcome="explicit identical retry recovered checked meals and cleared only matching incomplete lookup"
after={str(path):sha(path) for path in files}
require(before==after,"peer source changed during receiving")
print(json.dumps({"variant":args.variant,"malformed":args.malformed,"python":platform.python_version(),"optimization":sys.flags.optimize,"client_module":str(Path(client_module.__file__).resolve()),"agent_module":str(Path(agent.__file__).resolve()),"outcome":outcome,"first_error_type":first["error"].split(":",1)[0],"request_count":fixture.issued,"requests":fixture.log,"initial_notes":initial_plan["notes"],"different_query_notes":partial_plan["notes"],"final_notes":final_plan["notes"],"checked_meal_ids":[meal["entity_id"] for meal in final_plan["meals"]],"unchanged_files":before,"network_used":False,"automatic_retry":False},sort_keys=True))
