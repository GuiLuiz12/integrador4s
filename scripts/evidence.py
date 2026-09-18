#!/usr/bin/env python3
"""Export only allowlisted monitoring results and structured application logs."""
import datetime as dt
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
DOCKER = [str(ROOT / 'scripts/docker.sh')]
COMPOSE = DOCKER + ['compose', '--env-file', str(ROOT / '.env'), '-f', str(ROOT / 'infra/compose.yaml')]

def query(expression, at=None):
    arguments = ['exec', '-T', 'lab', 'node', 'dist/apps/lab/cli.js', 'query', expression]
    if at is not None:
        arguments.append(str(at))
    result = subprocess.run(COMPOSE + arguments,
                            check=True, capture_output=True, text=True)
    body = json.loads(result.stdout)
    if body.get('status') != 'success':
        raise RuntimeError('Prometheus query failed')
    return body['data']

def export(destination=None):
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    folder = pathlib.Path(destination) if destination else ROOT / 'evidence' / 'runs' / stamp
    folder.mkdir(parents=True, exist_ok=True)
    expressions = {
        'targets': 'up', 'coverage': 'lab:collection_coverage_percent',
        'availability': '100 * avg_over_time(probe_success{job="probe"}[1h])',
        'observations': 'count_over_time(probe_success{job="probe"}[1h])',
        'successes': 'sum_over_time(probe_success{job="probe"}[1h])',
        'probe_history': 'probe_success{job="probe"}[1h]',
        'collection_history': 'lab:target_up[1h]',
        'alert_history': 'ALERTS[1h]',
        'load_history': 'lab_load_rate[1h]',
        'auth_failures': 'clinical_auth_failures_total',
        'p95': 'histogram_quantile(0.95,sum by(le)(rate(clinical_request_duration_seconds_bucket{traffic="clinical"}[5m])))',
        'container_memory': 'container_memory_working_set_bytes{container_label_com_docker_compose_project="governanca-saude"}',
    }
    captured = dt.datetime.now(dt.timezone.utc)
    data = {'captured_at': captured.isoformat(), 'window': '1h',
            'queries': {name: {'promql': expression, 'data': query(expression, captured.timestamp())} for name, expression in expressions.items()}}
    (folder / 'metrics.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    logs = subprocess.run(COMPOSE + ['logs', '--no-color', '--no-log-prefix', '--since', '1h', 'api'],
                          check=True, capture_output=True, text=True)
    events = []
    allowed = {'time', 'level', 'event', 'correlation_id', 'traffic', 'status', 'duration_ms'}
    for line in logs.stdout.splitlines():
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if item.get('event') in {'authentication', 'record_access', 'request_error'}:
            events.append({key: value for key, value in item.items() if key in allowed})
    (folder / 'events.jsonl').write_text(''.join(json.dumps(item, ensure_ascii=False) + '\n' for item in events))
    print(f'Evidências exportadas para {folder.relative_to(ROOT) if folder.is_relative_to(ROOT) else folder}')
    return folder

if __name__ == '__main__':
    export(sys.argv[1] if len(sys.argv) > 1 else None)
