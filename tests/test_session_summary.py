"""Synthetic fixtures test acceptance rules, never serve as collected evidence."""
import json
import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'scripts'))
from evidence import digest, iso, write_json
from evidence_analysis import summarize
from evidence_catalog import RAW, DERIVED, SERVICES, JOBS

START = 1_760_000_000


def fixture(folder, kind):
    duration = 1800 if kind == 'baseline' else 3600
    end = START + duration
    times = list(range(START + 5, end, 15))
    def series(labels=None, value=lambda t: 1, selected=None):
        return {'metric': labels or {}, 'values': [[t, str(value(t - START))] for t in (times if selected is None else selected)]}
    def matrix(items):
        return {'data': {'resultType': 'matrix', 'result': items}}
    raw = {name: matrix([series()]) for name in RAW}
    raw['alert_history'] = matrix([])
    raw['probe_history'] = matrix([series({'job': 'probe'})])
    raw['load_attempts'] = matrix([series({'result': 'success'}, lambda t: t)])
    for name in ['targets', 'collection_history']:
        raw[name] = matrix([series({'job': job}) for job in JOBS])
    for name in ['container_cpu', 'container_memory', 'container_network_receive', 'container_network_transmit']:
        raw[name] = matrix([series({'container_label_com_docker_compose_service': service}, lambda t: t) for service in SERVICES])
    events = [{'time': t * 1000, 'service': 'api', 'instance_id': 'synthetic', 'correlation_id': str(t),
               'event': 'record_access', 'traffic': 'clinical', 'status': 200} for t in times]
    timeline = [{'event': 'session_completed', 'at': iso(end)}]
    if kind == 'experiment':
        raw['probe_history'] = matrix([series({'job': 'probe'}, lambda t: 0 if 1800 <= t < 1920 else 1,
                                             [t for t in times if not 2400 <= t - START < 2490])])
        raw['load_history'] = matrix([series(value=lambda t: 5 if 600 <= t < 1200 else 1)])
        for name in ['targets', 'collection_history']:
            raw[name] = matrix([series({'job': job}, (lambda t: 0 if 2400 <= t < 2490 else 1) if job == 'probe' else (lambda t: 1)) for job in JOBS])
        raw['alert_history'] = matrix([
            series({'alertname': 'ConsultaAssistencialIndisponivel', 'alertstate': 'firing'}, selected=[START + 1870, START + 1885]),
            series({'alertname': 'FalhaDeColeta', 'alertstate': 'firing', 'job': 'probe'}, selected=[START + 2470, START + 2485])])
        for i in range(10):
            events.append({'time': (START + 1500 + i) * 1000, 'service': 'api', 'instance_id': 'synthetic',
                           'correlation_id': f'auth-{i}', 'event': 'authentication', 'status': 401})
        for i in range(120):
            events.append({'time': (START + 1800 + i) * 1000, 'service': 'api', 'instance_id': 'synthetic',
                           'correlation_id': f'error-{i}', 'event': 'record_access', 'traffic': 'clinical', 'status': 503})
        for name, offset in [('load_5rps_started', 600), ('load_5rps_finished', 1200),
                             ('postgres_outage_confirmed', 1800), ('postgres_restart_requested', 1920),
                             ('probe_outage_confirmed', 2400), ('probe_restore_requested', 2490)]:
            timeline.append({'event': name, 'at': iso(START + offset)})
    inventory = {'source_sha256': {'synthetic.ts': 'test-only'}, 'assets': [{'service': s, 'image_id': s} for s in SERVICES]}
    write_json(folder / 'series.json', {'queries': raw})
    write_json(folder / 'metrics.json', {})
    write_json(folder / 'derived.json', {'queries': {name: matrix([series()]) for name in DERIVED}})
    write_json(folder / 'inventory.json', inventory)
    write_json(folder / 'inventory-start.json', inventory)
    write_json(folder / 'session.json', timeline)
    write_json(folder / 'run.json', {})
    (folder / 'events.jsonl').write_text(''.join(json.dumps(e) + '\n' for e in events))
    manifest = {'schema_version': 1, 'kind': kind, 'status': 'completed', 'session_id': 'synthetic-test-only',
                'range_start': iso(START), 'range_end': iso(end), 'indicator_sources': {},
                'phases': [{'id': kind, 'started_at': iso(START), 'ended_at': iso(end)}],
                'parameters': {'collector_alert_jobs': ['probe']}}
    write_json(folder / 'manifest.json', manifest)
    rehash(folder)


def rehash(folder):
    manifest = json.loads((folder / 'manifest.json').read_text())
    manifest['files'] = {p.name: {'bytes': p.stat().st_size, 'sha256': digest(p)} for p in folder.iterdir() if p.name != 'manifest.json'}
    write_json(folder / 'manifest.json', manifest)


def mutate_raw(folder, callback):
    data = json.loads((folder / 'series.json').read_text())
    callback(data['queries'])
    write_json(folder / 'series.json', data)
    rehash(folder)


class SessionSummaryTests(unittest.TestCase):
    def test_complete_baseline_is_reproducible_without_services(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = pathlib.Path(directory); fixture(folder, 'baseline')
            result = summarize(folder)
            self.assertEqual((result['observations'], result['observed_availability_percent'], result['kind']), (120, 100, 'baseline'))
            self.assertEqual(result, summarize(folder))

    def test_experiment_has_traceable_observed_timings(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = pathlib.Path(directory); fixture(folder, 'experiment')
            result = summarize(folder)
            self.assertEqual((result['invalid_login_events'], result['clinical_503_events']), (10, 120))
            self.assertEqual(result['incident_timeline']['detection_seconds'], 70)
            self.assertEqual(result['incident_timeline']['recovery_after_detection_seconds'], 55)
            self.assertTrue(result['probe_outage_generator_active'])
            self.assertLess(result['temporal_completeness_percent'], 100)

    def test_baseline_rejects_failure_and_insufficient_infrastructure_history(self):
        for family, value, expected in [('probe_history', '0', 'falha assistencial'), ('host_cpu', None, 'Histórico insuficiente')]:
            with self.subTest(family=family), tempfile.TemporaryDirectory() as directory:
                folder = pathlib.Path(directory); fixture(folder, 'baseline')
                def change(raw):
                    samples = raw[family]['data']['result'][0]['values']
                    if value is None: del samples[1:]
                    else: samples[0][1] = value
                mutate_raw(folder, change)
                with self.assertRaisesRegex(ValueError, expected): summarize(folder)

    def test_experiment_rejects_unobserved_load_or_stopped_generator(self):
        for family, expected in [('load_history', 'Carga de 5/s'), ('load_attempts', 'Gerador não continuou')]:
            with self.subTest(family=family), tempfile.TemporaryDirectory() as directory:
                folder = pathlib.Path(directory); fixture(folder, 'experiment')
                def change(raw):
                    for p in raw[family]['data']['result'][0]['values']: p[1] = '1'
                mutate_raw(folder, change)
                with self.assertRaisesRegex(ValueError, expected): summarize(folder)

    def test_code_changes_and_missing_log_edges_are_rejected(self):
        for condition in ['code', 'logs']:
            with self.subTest(condition=condition), tempfile.TemporaryDirectory() as directory:
                folder = pathlib.Path(directory); fixture(folder, 'baseline')
                if condition == 'code':
                    inventory = json.loads((folder / 'inventory.json').read_text())
                    inventory['source_sha256'] = {}
                    write_json(folder / 'inventory.json', inventory)
                else: (folder / 'events.jsonl').write_text('')
                rehash(folder)
                with self.assertRaisesRegex(ValueError, 'Código mudou|Logs não cobrem'): summarize(folder)

    def test_interrupted_session_cannot_pass_even_with_valid_hashes(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = pathlib.Path(directory); fixture(folder, 'baseline')
            write_json(folder / 'session.json', [{'event': 'session_interrupted_or_failed'}])
            rehash(folder)
            with self.assertRaisesRegex(ValueError, 'interrompida'): summarize(folder)


class ContainerCadenceTests(unittest.TestCase):
    def test_exporter_timestamps_can_be_slower_than_scrapes(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = pathlib.Path(directory); fixture(folder, 'baseline')
            def change(raw):
                for name in ['container_cpu', 'container_memory', 'container_network_receive', 'container_network_transmit']:
                    for series in raw[name]['data']['result']: series['values'] = series['values'][::2]
            mutate_raw(folder, change)
            result = summarize(folder)
            self.assertEqual(result['container_sampling']['container_cpu'][0]['samples'], 60)
            self.assertEqual(result['container_sampling']['container_cpu'][0]['maximum_gap_seconds'], 30)
            self.assertEqual(result['observations'], 120)

    def test_container_gap_is_rejected_even_when_scrapes_are_healthy(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = pathlib.Path(directory); fixture(folder, 'baseline')
            def change(raw):
                series=raw['container_cpu']['data']['result'][0]
                series['values']=[p for p in series['values'] if not START + 600 < p[0] < START + 900]
            mutate_raw(folder, change)
            with self.assertRaisesRegex(ValueError, 'cadência ou bordas'): summarize(folder)

if __name__ == '__main__': unittest.main()
