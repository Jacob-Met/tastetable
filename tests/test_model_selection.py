"""Model routing tests use only synthetic fixtures and an inert URL transport."""
import io
import json
import os
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SOURCE = Path(os.environ.get('TASTETABLE_SOURCE_ROOT', Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(SOURCE))
import agent
from personas import PERSONAS
from qloo_client import FixtureTransport, QlooClient


class ModelSelection(unittest.TestCase):
    def setUp(self):
        # Replace the mapping, so no real provider variables or credentials are read.
        self.addCleanup(patch.stopall)
        patch.object(agent.os, 'environ', {}).start()
        patch('urllib.request.urlopen', side_effect=AssertionError('real network forbidden')).start()

    def fixture_client(self):
        return QlooClient(api_key='synthetic-fixture-only', transport=FixtureTransport())

    def wire_models(self, model, **kwargs):
        captured = []
        replies = [agent._completion(tool_calls=[agent._call('route-test', 'qloo_search', {'query': '', 'kind': 'tag'})]),
                   agent._completion('inert completion')]
        def respond(request, timeout):
            self.assertEqual(request.get_method(), 'POST')
            self.assertNotIn('Authorization', request.headers)
            captured.append(json.loads(request.data))
            return io.BytesIO(json.dumps(replies[len(captured)-1]).encode())
        with patch('urllib.request.urlopen', side_effect=respond):
            result = agent.run_agent(PERSONAS['rosa'], qloo=self.fixture_client(), model=model, **kwargs)
        self.assertEqual(result['model_message'], 'inert completion')
        self.assertEqual(len(captured), 2)
        return [r['model'] for r in captured]

    def test_configured_backend_model_is_used_on_every_step(self):
        model = agent.OpenAICompatModel('https://inert.invalid/v1', 'configured-offline-model')
        self.assertEqual(self.wire_models(model), ['configured-offline-model'] * 2)

    def test_explicit_per_call_model_override_is_preserved(self):
        model = agent.OpenAICompatModel('https://inert.invalid/v1', 'configured-offline-model')
        self.assertEqual(self.wire_models(model, model_name='explicit-offline-override'), ['explicit-offline-override'] * 2)
        self.assertEqual(model.model, 'configured-offline-model')

    def test_environment_factory_custom_model_reaches_wire(self):
        with patch.object(agent.os, 'environ', {'TASTETABLE_LLM_BASE_URL': 'https://inert.invalid/v1',
                                                'TASTETABLE_LLM_MODEL': 'factory-offline-model'}):
            model = agent.model_from_env()
            self.assertEqual(self.wire_models(model), ['factory-offline-model'] * 2)

    def test_environment_factory_default_model_reaches_wire(self):
        with patch.object(agent.os, 'environ', {'TASTETABLE_LLM_BASE_URL': 'https://inert.invalid/v1'}):
            model = agent.model_from_env()
            self.assertEqual(self.wire_models(model), [model.model] * 2)

    def test_backend_without_model_attribute_keeps_scripted_name(self):
        captured = []
        def create(**kwargs):
            captured.append(kwargs['model'])
            return agent._completion('recorded')
        model = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
        agent.run_agent(PERSONAS['rosa'], qloo=self.fixture_client(), model=model)
        agent.run_agent(PERSONAS['rosa'], qloo=self.fixture_client(), model=model, model_name='explicit-recording')
        self.assertEqual(captured, ['scripted-stub', 'explicit-recording'])

    def test_scripted_default_remains_offline_and_matches_explicit_model(self):
        self.assertIsInstance(agent.model_from_env(), agent.ScriptedModel)
        for pid, persona in PERSONAS.items():
            with self.subTest(persona=pid):
                default = agent.run_agent(persona, qloo=self.fixture_client())
                explicit = agent.run_agent(persona, qloo=self.fixture_client(), model_name='scripted-stub')
                self.assertEqual(default, explicit)
                self.assertTrue(default['mock'])
                self.assertEqual(len(default['plan']['meals']), 4)


if __name__ == '__main__':
    unittest.main(verbosity=2)
