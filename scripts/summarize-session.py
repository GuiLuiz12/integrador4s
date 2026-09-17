#!/usr/bin/env python3
"""Validate a completed real session and summarize its observed evidence."""
import datetime as dt
import json
import pathlib
import sys

folder = pathlib.Path(sys.argv[1])
events = json.loads((folder / 'session.json').read_text())
by_event = {item['event']: item for item in events}
assert 'session_completed' in by_event and 'session_interrupted_or_failed' not in by_event
assert by_event['session_completed']['elapsed_seconds'] >= 3600
assert by_event['load_5rps_finished']['elapsed_seconds'] - by_event['load_5rps_started']['elapsed_seconds'] >= 599
assert by_event['postgres_restart_requested']['elapsed_seconds'] - by_event['postgres_outage_started']['elapsed_seconds'] >= 120
data = json.loads((folder / 'metrics.json').read_text())['queries']

def result(name):
    return data[name]['data']['result']

def scalar(name):
    values = result(name)
    assert len(values) == 1
    return float(values[0]['value'][1])

def event_timestamp(name):
    return dt.datetime.fromisoformat(by_event[name]['at']).timestamp()

def iso(timestamp):
    return dt.datetime.fromtimestamp(timestamp, dt.timezone.utc).isoformat()

observations = int(scalar('observations'))
successes = int(scalar('successes'))
assert 200 <= observations <= 241
assert 0 < successes < observations
availability = 100 * successes / observations
assert abs(availability - scalar('availability')) < 1e-6
assert len(result('targets')) == 7 and all(float(item['value'][1]) == 1 for item in result('targets'))
assert scalar('coverage') == 100
probes = result('probe_history')[0]['values']
assert float(probes[-1][1]) == 1
gaps = [right[0] - left[0] for left, right in zip(probes, probes[1:])]
assert max(gaps) >= 60
alerts = result('alert_history')
clinical_alert = [item for item in alerts if item['metric'].get('alertname') == 'ConsultaAssistencialIndisponivel' and item['metric'].get('alertstate') == 'firing']
assert clinical_alert, 'A indisponibilidade deve gerar alerta real'
collector_alerts = [item for item in alerts if item['metric'].get('alertname') == 'FalhaDeColeta' and item['metric'].get('alertstate') == 'firing']
assert {item['metric'].get('job') for item in collector_alerts} >= {'lab', 'probe'}
collector_start = event_timestamp('collector_outage_started')
collector_restart = event_timestamp('collector_restart_requested')
api_collection = next(item['values'] for item in result('collection_history') if item['metric'].get('job') == 'api')
api_during_gap = [sample for sample in api_collection if collector_start <= sample[0] <= collector_restart]
assert api_during_gap and all(float(sample[1]) == 1 for sample in api_during_gap)
assert not any(collector_start <= sample[0] <= collector_restart for item in clinical_alert for sample in item['values']), 'Falha de coleta não deve criar alerta assistencial'
first_alert = min(sample[0] for item in clinical_alert for sample in item['values'])
last_alert = max(sample[0] for item in clinical_alert for sample in item['values'])
restart = event_timestamp('postgres_restart_requested')
recovered = next(sample[0] for sample in probes if sample[0] >= restart and float(sample[1]) == 1)
assert last_alert < event_timestamp('session_completed') - 600, 'Alerta clínico deve resolver antes do fim'
logs = [json.loads(line) for line in (folder / 'events.jsonl').read_text().splitlines()]
invalid = [item for item in logs if item.get('event') == 'authentication' and item.get('status') == 401]
assert len(invalid) == 10, 'Devem existir exatamente dez eventos de login inválido'
errors = [item for item in logs if item.get('event') == 'record_access' and item.get('traffic') == 'clinical' and item.get('status') == 503]
assert len(errors) >= 60, 'A queda real deve afetar as consultas clínicas'
assert any(float(sample[1]) == 5 for item in result('load_history') for sample in item['values'])
summary = {
    'result': 'passed', 'started_at': by_event['session_started']['at'],
    'completed_at': by_event['session_completed']['at'],
    'duration_seconds': by_event['session_completed']['elapsed_seconds'],
    'observations': observations, 'successful_probes': successes, 'failed_probes': observations-successes,
    'observed_availability_percent': availability, 'maximum_probe_gap_seconds': max(gaps),
    'invalid_login_events': len(invalid), 'clinical_503_events': len(errors),
    'first_clinical_alert_at': iso(first_alert), 'last_clinical_alert_sample_at': iso(last_alert),
    'observed_seconds_to_first_alert': first_alert-event_timestamp('postgres_outage_started'),
    'first_success_after_restart_at': iso(recovered), 'final_collection_coverage_percent': scalar('coverage'),
    'collector_alert_jobs': sorted({item['metric']['job'] for item in collector_alerts}),
    'api_collection_available_during_probe_gap': True,
    'no_false_clinical_alert_during_probe_gap': True,
    'note': 'Medições de uma sessão fictícia; não equivalem a SLA mensal ou MTTD/MTTR médios.',
}
(folder / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(summary, ensure_ascii=False, indent=2))
