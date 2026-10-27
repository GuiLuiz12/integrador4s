import math
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'scripts'))
from analyze_sprint2 import alert_episodes, points, risk_level, statistics_of


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


if __name__ == '__main__':
    unittest.main()
