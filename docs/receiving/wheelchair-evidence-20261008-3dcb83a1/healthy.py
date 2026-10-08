"""Print complete deterministic results for the three existing synthetic personas."""
import json,os,pathlib,sys,urllib.request
sys.dont_write_bytecode=True
sys.path.insert(0,str(pathlib.Path(sys.argv[1]).resolve()))
os.environ["TASTETABLE_LIVE"]="0"
def offline(*args,**kwargs):raise AssertionError("No external requests in this receiver")
urllib.request.urlopen=offline
from agent import ScriptedModel,run_agent
from personas import PERSONAS
from qloo_client import FixtureTransport,QlooClient
results={key:run_agent(persona,qloo=QlooClient(api_key="SYNTHETIC-FIXTURE",transport=FixtureTransport()),model=ScriptedModel())
         for key,persona in sorted(PERSONAS.items())}
print(json.dumps(results,sort_keys=True,ensure_ascii=False,allow_nan=False))
