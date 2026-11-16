import copy
import json
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'scripts'))
from analyze_sprint3 import control_assessment, control_counts, action_assessment, incident_from
from evidence import ROOT, iso


class Sprint3AnalysisTests(unittest.TestCase):
    def test_partial_and_unobserved_controls_do_not_inflate_compliance(self):
        definitions = [
            {'id': 'CT-01', 'checks': ['login'], 'risks': ['R-02']},
            {'id': 'CT-02', 'checks': ['central', 'persistent'], 'risks': ['R-05']},
            {'id': 'CT-03', 'checks': ['blocking'], 'risks': ['R-03']},
        ]
        controls = control_assessment(definitions, {'login': True, 'central': True, 'blocking': 'true'}, 'VAL',
                                      {'login': {'result': 'Consulta autenticada confirmada'}, 'central': {'result': 'Eventos consultáveis'}})
        self.assertEqual([c['status'] for c in controls], ['Implementado', 'Parcial', 'Pendente'])
        counts = control_counts(controls, [{'id': 'R-02', 'score': 15}, {'id': 'R-03', 'score': 12}, {'id': 'R-05', 'score': 8}])
        self.assertAlmostEqual(counts['compliance_percent'], 100 / 3)
        self.assertEqual(counts['critical_gaps'], 1)

    def test_split_actions_only_complete_the_observed_component(self):
        actions = action_assessment([
            {'id': 'AC-01', 'checks': ['alert']},
            {'id': 'AC-02', 'checks': ['rate_limit']},
            {'id': 'AC-03', 'checks': ['central', 'persistent']},
        ], {'alert': True, 'central': True}, 'VAL', {'alert': {'result': 'firing e resolução'}, 'central': {'result': 'Eventos consultáveis'}})
        self.assertEqual([a['status'] for a in actions], ['Concluída', 'Planejada', 'Planejada'])
        self.assertTrue(actions[0]['completion_evidence'])
        self.assertEqual(actions[1]['completion_evidence'], [])

    def test_boolean_without_a_technical_observation_is_not_implementation_evidence(self):
        with self.assertRaisesRegex(ValueError, 'sem resultado técnico'):
            control_assessment([{'id': 'CT-01', 'checks': ['login'], 'risks': ['R-02']}], {'login': True}, 'VAL', {})

    def scenario(self):
        start = 1760000000
        names = ['auth_failure_confirmed', 'auth_alert_firing', 'auth_generator_stopped', 'auth_recovery_confirmed']
        session = {'session_id': 'security-case', 'status': 'completed',
                   'timeline': [{'event': name, 'at': iso(start + offset)} for name, offset in zip(names, [0, 30, 31, 100])]}
        events = [{'event': 'authentication', 'status': 401, 'service': 'api', 'instance_id': 'instance-a',
                   'correlation_id': f'req-{i}', 'time': (start + i * 2) * 1000} for i in range(5)]
        raw = {'queries': {'alert_history': {'data': {'result': [
            {'metric': {'alertname': 'FalhasDeLoginRepetidas', 'alertstate': 'firing'}, 'values': [[start + 30, '1'], [start + 45, '1']]}
        ]}}}}
        refs = {'timeline': 'TIM', 'events': 'LOG', 'series': 'SER'}
        return session, events, raw, refs

    def test_response_is_after_detection_and_duplicate_logs_are_not_extra_failures(self):
        session, events, raw, refs = self.scenario()
        events.append(copy.deepcopy(events[0]))
        events.append({**events[0], 'event': 'request_error'})
        incident = incident_from('INC-03', session, events, raw, refs)
        self.assertEqual(incident['failed_logins'], 5)
        self.assertEqual(incident['detection_seconds'], 30)
        self.assertEqual(incident['response_seconds'], 1)
        self.assertEqual(incident['recovery_seconds'], 70)
        self.assertEqual(incident['status'], 'Fechado')

    def test_missing_alert_or_action_before_detection_cannot_close_an_incident(self):
        session, events, raw, refs = self.scenario()
        session['timeline'][2]['at'] = iso(1760000020)
        with self.assertRaisesRegex(ValueError, 'cronologia'):
            incident_from('INC-03', session, events, raw, refs)
        session, events, raw, refs = self.scenario()
        raw['queries']['alert_history']['data']['result'] = []
        with self.assertRaisesRegex(ValueError, 'disparo ausente'):
            incident_from('INC-03', session, events, raw, refs)

    def test_recovery_requires_a_full_quiet_minute_and_completed_session(self):
        session, events, raw, refs = self.scenario()
        session['timeline'][3]['at'] = iso(1760000060)
        with self.assertRaisesRegex(ValueError, '60 segundos'):
            incident_from('INC-03', session, events, raw, refs)
        session, events, raw, refs = self.scenario()
        session['status'] = 'interrupted'
        with self.assertRaisesRegex(ValueError, 'sessão incompleta'):
            incident_from('INC-03', session, events, raw, refs)


if __name__ == '__main__':
    unittest.main()
