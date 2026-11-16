import json
import pathlib
import sys
import unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'scripts'))
from evidence_loki import entries
from evidence_catalog import inventory_profile


class LokiExportTests(unittest.TestCase):
    def test_pagination_preserves_tied_timestamps_and_deduplicates(self):
        original = [(1, 'a'), (2, 'b'), (2, 'c'), (4, 'd'), (7, 'e')]
        def fetch(path, args):
            rows = [(str(at), line) for at, line in original if int(args['start']) <= at < int(args['end'])]
            return {'resultType':'streams','result':[{'stream':{'service':'api'},'values':rows[:int(args['limit'])]}]}
        result, calls = entries('{service="api"}', 0, 8, 3, fetch)
        self.assertEqual([(int(r['timestamp_ns']),r['line']) for r in result], original)
        self.assertGreater(calls, 1)

    def test_saturated_single_timestamp_fails_instead_of_losing_events(self):
        def fetch(path, args):
            return {'resultType':'streams','result':[{'stream':{},'values':[['1','a'],['1','b']]}]}
        with self.assertRaisesRegex(ValueError, 'truncamento'):
            entries('{}', 1, 1, 2, fetch)

    def test_historical_profile_is_not_reinterpreted(self):
        self.assertEqual(len(inventory_profile({'schema_version':1})['jobs']),7)
        self.assertEqual(len(inventory_profile({'schema_version':2,'inventory_profile':'sprint3'})['jobs']),9)
        with self.assertRaises(ValueError): inventory_profile({'schema_version':2,'inventory_profile':'unknown'})


if __name__ == '__main__': unittest.main()
