import importlib.util,json,os,sys,unittest
from pathlib import Path
source=Path(sys.argv[1]);sys.path.insert(0,str(source))
class ObservedResult(unittest.TextTestResult):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,**kwargs);self.subtests=[]
    def addSubTest(self,test,subtest,err):
        self.subtests.append({"method":test.id(),"subtest":str(subtest),"passed":err is None})
        super().addSubTest(test,subtest,err)
spec=importlib.util.spec_from_file_location("received_test_api_city",source/"tests"/"test_api_city.py")
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
suite=unittest.defaultTestLoader.loadTestsFromModule(module)
result=unittest.TextTestRunner(verbosity=2,resultclass=ObservedResult).run(suite)
summary={"methods_run":result.testsRun,"failures":len(result.failures),"errors":len(result.errors),"skips":len(result.skipped),"subtests":result.subtests,"successful":result.wasSuccessful()}
with Path(sys.argv[2]).open("x",encoding="utf-8") as stream:json.dump(summary,stream,indent=2,ensure_ascii=True)
raise SystemExit(0 if result.wasSuccessful() else 1)
