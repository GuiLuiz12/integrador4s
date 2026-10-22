import copy
import json
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'scripts'))
from evidence import clip, filter_events, interval, digest, export, query_range
from evidence_analysis import counter_change, response_events, verify_manifest, summarize


class EvidenceTests(unittest.TestCase):
    def test_explicit_interval_requires_timezone_and_both_ends(self):
        for start, end in [('2026-01-01', '2026-01-02'), ('2026-01-01T00:00:00Z', None), (10, 5)]:
            with self.assertRaises(ValueError):
                interval(start, end)
        self.assertEqual(interval('2026-01-01T00:00:00Z', '2026-01-01T00:01:00Z')[1] - interval('2026-01-01T00:00:00Z', '2026-01-01T00:01:00Z')[0], 60)

    def test_clip_keeps_gaps_and_original_timestamps(self):
        source = {'resultType': 'matrix', 'result': [{'metric': {'job': 'probe'}, 'values': [[0, '1'], [15, '1'], [120, '0'], [135, '1']]}]}
        original = copy.deepcopy(source)
        result = clip(source, 15, 120)
        self.assertEqual(result['result'][0]['values'], [[15, '1'], [120, '0']])
        self.assertEqual(source, original)
        self.assertEqual(clip(source, 16, 119)['result'], [])

    def test_prometheus_rounding_cannot_export_an_out_of_window_point(self):
        data = {'resultType': 'matrix', 'result': [{'metric': {}, 'values': [[1.123, '5'], [16.123, '7']]}]}
        with patch('evidence.monitoring', return_value=data):
            self.assertEqual(query_range('up', 1.1235, 20)['result'][0]['values'], [[16.123, '7']])

    def test_logs_are_bounded_and_secrets_are_removed(self):
        lines = [json.dumps({'time': time, 'event': 'authentication', 'password': 'NEVER_EXPORT', 'status': 401}) for time in [999, 1000, 2000, 2001]]
        events = filter_events('\n'.join(lines) + '\nnot-json\n[]', 1, 2)
        self.assertEqual([e['time'] for e in events], [1000, 2000])
        self.assertNotIn('NEVER_EXPORT', json.dumps(events))

    def test_restarts_and_error_diagnostics_do_not_duplicate_requests(self):
        event = {'event': 'record_access', 'service': 'api', 'instance_id': 'first', 'correlation_id': 'req-1', 'status': 503}
        diagnostic = {**event, 'event': 'request_error'}
        restarted = {**event, 'instance_id': 'second'}
        self.assertEqual(len(response_events([event, diagnostic, event, restarted])), 2)
        self.assertEqual(counter_change([[0, '10'], [15, '14'], [120, '2'], [135, '5']]), {'observed_increment': 9.0, 'resets': 1})

    def test_manifest_detects_corruption_and_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = pathlib.Path(directory)
            files = {}
            for name in ['metrics.json', 'series.json', 'derived.json', 'inventory.json', 'events.jsonl']:
                p = folder / name; p.write_text('{}')
                files[name] = {'sha256': digest(p), 'bytes': 2}
            manifest = {'schema_version': 1, 'status': 'completed', 'files': files}
            (folder / 'manifest.json').write_text(json.dumps(manifest))
            verify_manifest(folder)
            (folder / 'metrics.json').write_text('{ }')
            with self.assertRaises(ValueError): verify_manifest(folder)
            (folder / 'metrics.json').write_text('{}')
            manifest['files']['../outside'] = {'sha256': '', 'bytes': 0}
            (folder / 'manifest.json').write_text(json.dumps(manifest))
            with self.assertRaises(ValueError): verify_manifest(folder)

    def test_export_does_not_overwrite_destination(self):
        with tempfile.TemporaryDirectory() as directory:
            p = pathlib.Path(directory) / 'original.txt'; p.write_text('preserve')
            with self.assertRaises(ValueError): export(directory, 1, 2)
            self.assertEqual(p.read_text(), 'preserve')

    def test_incomplete_new_export_cannot_fall_back_to_historical(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = pathlib.Path(directory)
            (folder / 'run.json').write_text('{}')
            with self.assertRaisesRegex(ValueError, 'manifesto ausente'): summarize(folder)

    def test_historical_sources_are_read_without_changes(self):
        folder = pathlib.Path(__file__).resolve().parents[1] / 'evidence/validated/sprint1/historico-20260910'
        before = {str(p): digest(p) for p in folder.rglob('*') if p.is_file()}
        result = summarize(folder)
        self.assertEqual((result['observations'], result['successful_probes'], result['invalid_login_events']), (234, 226, 10))
        self.assertEqual(before, {str(p): digest(p) for p in folder.rglob('*') if p.is_file()})


if __name__ == '__main__': unittest.main()
