"""Authored offline accessibility-tag receiving through the actual planner."""
import copy,json,os,pathlib,sys,urllib.request
os.environ["TASTETABLE_LIVE"]="0"
sys.dont_write_bytecode=True
source=pathlib.Path(sys.argv[1]).resolve()
sys.path.insert(0,str(source))
from agent import ScriptedModel,run_agent
from constraints import evaluate
from personas import PERSONAS
from qloo_client import Entity,FixtureTransport,QlooClient

external=[]
def refuse_network(*args,**kwargs):
    external.append("urlopen")
    raise AssertionError("offline receiving cannot dispatch network requests")
urllib.request.urlopen=refuse_network

tags={
 "affirmative":{"tag_id":"urn:tag:accessibility:place:wheelchair_accessible_entrance","name":"Wheelchair accessible entrance"},
 "negated":{"tag_id":"urn:tag:accessibility:place:no_wheelchair_access","name":"Not wheelchair accessible"},
 "unrelated":{"tag_id":"urn:tag:amenity:place:wheelchair_rental","name":"Wheelchair rental"},
 "partial":{"tag_id":"urn:tag:accessibility:place:wheelchair_accessible_restroom","name":"Wheelchair accessible restroom only"},
 "missing":None,
}
cases=[]
for label,tag in tags.items():
    transport=FixtureTransport()
    for place in transport.data["places"]:
        place["tags"]=[t for t in place["tags"] if not t["tag_id"].startswith("urn:tag:accessibility:")]
        if tag is not None:
            place["tags"].append(copy.deepcopy(tag))
    client=QlooClient(api_key="SYNTHETIC-FIXTURE",transport=transport)
    result=run_agent(copy.deepcopy(PERSONAS["rosa"]),qloo=client,model=ScriptedModel())
    plan=result["plan"]
    picks=plan["meals"]+([plan["outing"]] if plan["outing"] else [])
    direct=evaluate(Entity(entity_id="AUTHORED",name="Authored venue",tags=[] if tag is None else [copy.deepcopy(tag)]),["wheelchair"])
    cases.append({"label":label,"authored_tag":tag,"direct":direct.to_dict(),
                  "picked_count":len(picks),"first_why":picks[0]["why"] if picks else None,
                  "rejected_count":len(plan["rejected"]),"fixture_requests":len(transport.log),
                  "returned_mock_label":result["mock"]})
print(json.dumps({"source":str(source),"cases":cases,"external_calls":len(external)},indent=2))
