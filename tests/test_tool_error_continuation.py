"""Structured recommendation errors over synthetic fixtures, with no network."""
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

SOURCE=Path(os.environ.get('TASTETABLE_SOURCE_ROOT',Path(__file__).resolve().parents[1]))
sys.path.insert(0,str(SOURCE))
import agent
from personas import PERSONAS
from qloo_client import FixtureTransport,QlooClient,QlooError


class FailingFixture(FixtureTransport):
    def __init__(self,failures):
        super().__init__()
        self.failures=failures
        self.insights_calls=[]
    def __call__(self,path,params,headers):
        if path=='/v2/insights':
            number=len(self.insights_calls)+1
            self.insights_calls.append(dict(params))
            if number in self.failures:
                raise QlooError(self.failures[number],'authored fixture refusal')
        return super().__call__(path,params,headers)


class ToolErrorContinuation(unittest.TestCase):
    def setUp(self):
        self.addCleanup(patch.stopall)
        patch.object(agent.os,'environ',{}).start()
        patch('urllib.request.urlopen',side_effect=AssertionError('network forbidden')).start()
    def plan(self,failures,persona='rosa'):
        fixture=FailingFixture(failures)
        result=agent.run_agent(PERSONAS[persona],qloo=QlooClient(api_key='synthetic-fixture-only',transport=fixture))
        self.assertTrue(result['mock'])
        self.assertLessEqual(len(fixture.insights_calls),3)
        return result,fixture
    def errors(self,result):
        return [row for row in result['trace'] if row['tool']=='qloo_recs' and row['result_summary'].startswith('QlooError:')]

    def test_primary_error_returns_fallback_picks_and_error_trace(self):
        result,fixture=self.plan({1:429})
        self.assertTrue(result['plan']['meals'])
        self.assertTrue(result['plan']['outing'])
        self.assertEqual(len(self.errors(result)),1)
        self.assertIn('429',self.errors(result)[0]['result_summary'])
        checks=[r for r in result['trace'] if r['tool']=='constraint_check']
        self.assertEqual(checks[0]['args']['entity_ids'],[])
        self.assertEqual(checks[0]['result_summary'],'0/0 passed')
        self.assertNotEqual(fixture.insights_calls[0]['filter.tags'],fixture.insights_calls[1]['filter.tags'])

    def test_outing_error_preserves_the_checked_meals(self):
        healthy,_=self.plan({})
        failed,fixture=self.plan({3:503})
        self.assertEqual(failed['plan']['meals'],healthy['plan']['meals'])
        self.assertIsNone(failed['plan']['outing'])
        self.assertEqual(len(self.errors(failed)),1)
        self.assertEqual(len(fixture.insights_calls),3)
        self.assertEqual(failed['comparison']['grounded']['picks'],len(failed['plan']['meals']))

    def test_all_recommendations_refused_leave_all_slots_empty(self):
        result,fixture=self.plan({1:429,2:429,3:429})
        self.assertEqual(result['plan']['meals'],[])
        self.assertIsNone(result['plan']['outing'])
        self.assertEqual(result['comparison']['grounded']['picks'],0)
        self.assertEqual(len(self.errors(result)),3)
        self.assertEqual(len(fixture.insights_calls),3)
        self.assertTrue(result['plan']['notes'])
        self.assertTrue(all(r['args']['entity_ids']==[] for r in result['trace'] if r['tool']=='constraint_check'))

    def test_existing_fallback_error_retains_primary_picks(self):
        healthy,_=self.plan({})
        result,_=self.plan({2:500})
        primary=[m for m in healthy['plan']['meals'] if not m['fallback']]
        self.assertEqual(result['plan']['meals'],primary)
        self.assertEqual(result['plan']['outing'],healthy['plan']['outing'])
        self.assertEqual(len(self.errors(result)),1)

    def test_healthy_fixture_plans_are_still_complete(self):
        for persona in PERSONAS:
            with self.subTest(persona=persona):
                result,_=self.plan({},persona)
                self.assertEqual(len(result['plan']['meals']),4)
                self.assertIsNotNone(result['plan']['outing'])
                self.assertEqual(self.errors(result),[])

if __name__=='__main__':unittest.main(verbosity=2)
