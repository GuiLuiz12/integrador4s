import math
import json
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'scripts'))
from analyze_sprint2 import (BASELINE, EXPERIMENT, OUTPUT, build_analysis, indicators,
                            alert_episodes, points, risk_level, statistics_of)


class Sprint2AnalysisTests(unittest.TestCase):
    def test_alert_samples_are_grouped_into_distinct_episodes(self):
        series = [
            {'metric': {'alertname': 'Clinical', 'severity': 'critical', 'job': 'probe', 'alertstate': 'firing'},
             'values': [[0, '1'], [15, '1'], [45, '1'], [90, '1']]},
            {'metric': {'alertname': 'Collection', 'severity': 'warning', 'job': 'probe', 'alertstate': 'pending'},
             'values': [[0, '1'], [15, '1']]},
        ]
        episodes = alert_episodes(series)
        self.assertEqual(len(episodes), 2)
        self.assertEqual([e['last_sample'] for e in episodes], [45, 90])

    def test_phase_boundaries_and_missing_values_do_not_invent_zeroes(self):
        queries = {'cpu': {'data': {'result': [
            {'metric': {'container_label_com_docker_compose_service': 'api'}, 'values': [[0, '1'], [15, '3'], [30, '8']]},
            {'metric': {'container_label_com_docker_compose_service': 'db'}, 'values': [[15, '99']]},
        ]}}}
        selected = points(queries, 'cpu', 'api', 0, 30)
        self.assertEqual(statistics_of(v for _, v in selected), {'mean': 2, 'peak': 3, 'samples': 2})
        self.assertEqual(statistics_of([]), {'mean': None, 'peak': None, 'samples': 0})
        self.assertEqual(statistics_of([1, math.nan])['mean'], 1)

    def test_risk_bands_preserve_documented_boundaries(self):
        self.assertEqual([risk_level(s) for s in [4, 5, 9, 10, 16, 17, 25]],
                         ['Baixo', 'Moderado', 'Moderado', 'Alto', 'Alto', 'Crítico', 'Crítico'])

    def test_preserved_incidents_distinguish_scheduled_response_from_detection(self):
        a = build_analysis(BASELINE, EXPERIMENT, json.loads((OUTPUT/'registers.json').read_text()))
        clinical, observation = a['incidents']
        self.assertAlmostEqual(clinical['response_seconds'], 120.001903, places=4)
        self.assertAlmostEqual(observation['response_seconds'], 90.001834, places=4)
        self.assertLess(observation['response'], observation['detected'])
        self.assertAlmostEqual(a['counts']['mttr_seconds'], 26.043, places=3)
        self.assertEqual(a['quality']['collection_final_percent'], 100)
        self.assertAlmostEqual(a['quality']['collection_minimum_percent'], 600/7)
        self.assertEqual(a['counts']['alerts_by_severity'], {'critical': 1, 'warning': 1})
        self.assertEqual([s['at'] for s in a['incident_timeline']], sorted(s['at'] for s in a['incident_timeline']))

    def test_minimum_indicators_and_conclusions_have_technical_locations(self):
        a = build_analysis(BASELINE, EXPERIMENT, json.loads((OUTPUT/'registers.json').read_text()))
        rows = indicators(a)
        for required in ['Disponibilidade', 'CPU APP-01', 'Memória APP-01', 'Alertas por criticidade',
                         'Vulnerabilidades por severidade', 'Ativos com maior exposição',
                         'Incidentes abertos / fechados', 'MTTD', 'MTTR', 'Riscos altos/críticos',
                         'Riscos com tratamento definido']:
            self.assertTrue(any(required in row['name'] for row in rows), required)
        for record in [*a['vulnerabilities'], *a['risks'], *a['incidents'], *rows]:
            self.assertTrue(record['technical_evidence'])
            for ref in record['technical_evidence']:
                self.assertRegex(ref['source'], r'^[BCE]\d{2}$')
                self.assertTrue(ref['locator'])
                self.assertTrue(ref['observation'])


if __name__ == '__main__':
    unittest.main()
