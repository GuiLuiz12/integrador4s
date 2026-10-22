#!/usr/bin/env python3
"""Bounded, allowlisted exports. No history interpolation or secret configuration dump."""
import argparse
import datetime as dt
import hashlib
import json
import math
import pathlib
import shutil
import subprocess
import uuid

from evidence_catalog import RAW, DERIVED, SERVICES, P95

ROOT = pathlib.Path(__file__).resolve().parents[1]
DOCKER = [str(ROOT / 'scripts/docker.sh')]
COMPOSE = DOCKER + ['compose', '--env-file', str(ROOT / '.env'), '-f', str(ROOT / 'infra/compose.yaml')]
UTC = dt.timezone.utc
ALLOWED = {'time', 'level', 'event', 'correlation_id', 'traffic', 'status', 'duration_ms', 'service', 'instance_id'}


def write_json(path, data):
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    temporary.replace(path)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def iso(timestamp):
    return dt.datetime.fromtimestamp(timestamp, UTC).isoformat()


def timestamp(value):
    if isinstance(value, (int, float)):
        return float(value)
    parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('Informe o fuso horário nas datas ISO 8601.')
    return parsed.timestamp()


def interval(start=None, end=None):
    if (start is None) != (end is None):
        raise ValueError('Informe --from e --to juntos.')
    finish = dt.datetime.now(UTC).timestamp() if end is None else timestamp(end)
    begin = finish - 3600 if start is None else timestamp(start)
    if not all(math.isfinite(x) for x in (begin, finish)) or begin >= finish:
        raise ValueError('O início deve ser anterior ao fim.')
    if finish > dt.datetime.now(UTC).timestamp() + 1:
        raise ValueError('O fim não pode estar no futuro.')
    return begin, finish


def monitoring(command, *arguments):
    result = subprocess.run(COMPOSE + ['exec', '-T', 'lab', 'node', 'dist/apps/lab/cli.js', command, *map(str, arguments)],
                            check=True, capture_output=True, text=True, timeout=90)
    body = json.loads(result.stdout)
    if body.get('status') != 'success':
        raise RuntimeError('Consulta Prometheus falhou')
    return body['data']


def query(expression, at=None):
    return monitoring('query', expression, *([] if at is None else [at]))


def query_range(expression, start, end, step=15):
    # Prometheus rounds evaluation timestamps to milliseconds. Preserve the requested bounds.
    return clip(monitoring('query-range', expression, start, end, step), start, end)


def clip(data, start, end, include_end=True):
    """Filter original samples, without resampling; an empty result stays empty."""
    if data.get('resultType') != 'matrix':
        raise ValueError('Esperada uma matriz de amostras originais.')
    result = []
    for series in data['result']:
        values = [sample for sample in series['values']
                  if start <= sample[0] and (sample[0] <= end if include_end else sample[0] < end)]
        if values:
            result.append({'metric': series['metric'], 'values': values})
    return {'resultType': 'matrix', 'result': result}


def filter_events(output, start, end):
    events = []
    for line in output.splitlines():
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(item, dict) or item.get('event') not in {'authentication', 'record_access', 'request_error'}:
            continue
        time = item.get('time')
        if isinstance(time, (int, float)) and math.isfinite(time) and start * 1000 <= time <= end * 1000:
            events.append({key: value for key, value in item.items() if key in ALLOWED})
    return events


def context(folder):
    """Capture only selected metadata; never persist inspect/config/environment output."""
    names = ['package.json', 'package-lock.json', 'tsconfig.json', 'infra/compose.yaml',
             'infra/Dockerfile', 'infra/postgres/001-init.sh', 'monitoring/prometheus.yml',
             'monitoring/rules.yml', 'dashboards/saude.json']
    sources = sorted([*ROOT.glob('apps/**/*.ts'), *ROOT.glob('scripts/*.py'),
                      *ROOT.glob('scripts/*.sh'), *ROOT.glob('scripts/*.mjs')])
    for name in names:
        source = ROOT / name
        target = folder / 'configuration' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    code_hashes = {str(p.relative_to(ROOT)): digest(p) for p in sources}
    commit = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip()
    changes = subprocess.run(['git', 'status', '--porcelain'], cwd=ROOT, check=True, capture_output=True, text=True).stdout
    ids = subprocess.run(COMPOSE + ['ps', '-q'], check=True, capture_output=True, text=True).stdout.split()
    assets = []
    template = ('{"service":{{json (index .Config.Labels "com.docker.compose.service")}},'
                '"image_ref":{{json .Config.Image}},"image_id":{{json .Image}},'
                '"cpu_limit_nanocpus":{{json .HostConfig.NanoCpus}},"memory_limit_bytes":{{json .HostConfig.Memory}},'
                '"published_ports":{{json .HostConfig.PortBindings}}}')
    for container in ids:
        asset = json.loads(subprocess.run(DOCKER + ['inspect', '--format', template, container],
                                         check=True, capture_output=True, text=True).stdout)
        if asset['service'] not in SERVICES:
            continue
        asset['asset_id'] = 'governanca-saude/' + asset['service']
        asset['image_digests'] = json.loads(subprocess.run(DOCKER + ['image', 'inspect', '--format', '{{json .RepoDigests}}', asset['image_id']],
                                                          check=True, capture_output=True, text=True).stdout) or []
        assets.append(asset)
    if {a['service'] for a in assets} != set(SERVICES):
        raise ValueError('São necessários os sete serviços ativos para registrar o inventário.')
    host = json.loads(subprocess.run(DOCKER + ['info', '--format', '{"os":{{json .OperatingSystem}},"architecture":{{json .Architecture}},"cpus":{{json .NCPU}},"memory_bytes":{{json .MemTotal}},"docker_version":{{json .ServerVersion}}}'],
                                    check=True, capture_output=True, text=True).stdout)
    return {'observed_at': iso(dt.datetime.now(UTC).timestamp()), 'commit': commit,
            'working_tree_dirty': bool(changes.strip()), 'source_sha256': code_hashes,
            'assets': sorted(assets, key=lambda a: a['service']), 'host': host}


def export(destination=None, start=None, end=None, run=None):
    begin, finish = interval(start, end)
    folder = pathlib.Path(destination) if destination else ROOT / 'evidence/runs' / ('export-' + uuid.uuid4().hex)
    folder.mkdir(parents=True, exist_ok=True)
    if run is None and any(folder.iterdir()):
        raise ValueError('Use uma pasta vazia para a exportação.')
    if any((folder / name).exists() for name in ('manifest.json', 'metrics.json', 'series.json', 'events.jsonl')):
        raise ValueError('O destino já contém evidências. Use uma nova pasta para preservar a origem.')
    inventory = context(folder)
    duration = f'{math.ceil((finish - begin) * 1000)}ms'
    queries = {
        'targets': 'up', 'coverage': 'lab:collection_coverage_percent',
        'availability': f'100 * avg_over_time(probe_success{{job="probe"}}[{duration}])',
        'observations': f'count_over_time(probe_success{{job="probe"}}[{duration}])',
        'successes': f'sum_over_time(probe_success{{job="probe"}}[{duration}])',
        'auth_failures': 'clinical_auth_failures_total', 'p95': P95,
        'container_memory': RAW['container_memory'][0],
    }
    metadata = {'captured_at': iso(dt.datetime.now(UTC).timestamp()), 'range_start': iso(begin),
                'range_end': iso(finish), 'window': duration, 'boundary': 'start <= timestamp <= end'}
    metrics = {**metadata, 'queries': {name: {'promql': expr, 'evaluated_at': iso(finish), 'data': query(expr, finish)} for name, expr in queries.items()}}
    raw = {}
    for name, (selector, unit, scope, metric_type) in RAW.items():
        # Extra 15 seconds protects the inclusive start boundary from range-selector semantics.
        expression = f'{selector}[{math.ceil((finish - begin + 315) * 1000)}ms]'
        result = query(expression, finish)
        raw[name] = {'promql': expression, 'selector': selector, 'unit': unit, 'scope': scope,
                     'metric_type': metric_type, 'kind': 'original_samples',
                     'data': clip(result, begin, finish),
                     'context_data': clip(result, begin - 300, begin, include_end=False)}
        if name in ('probe_history', 'collection_history', 'alert_history', 'load_history'):
            metrics['queries'][name] = {'promql': expression, 'data': raw[name]['data']}
    derived = {name: {'promql': expr, 'unit': unit, 'kind': 'evaluated_series', 'step_seconds': 15,
                      'sources': ['series.json#/queries/' + source for source in sources],
                      'data': query_range(expr, begin, finish)}
               for name, (expr, unit, sources) in DERIVED.items()}
    logs = subprocess.run(COMPOSE + ['logs', '--no-color', '--no-log-prefix', '--since', iso(begin), '--until', iso(finish), 'api'],
                          check=True, capture_output=True, text=True, timeout=90)
    events = filter_events(logs.stdout, begin, finish)
    write_json(folder / 'metrics.json', metrics)
    write_json(folder / 'series.json', {**metadata, 'context_start': iso(begin - 300), 'queries': raw})
    write_json(folder / 'derived.json', {**metadata, 'queries': derived})
    (folder / 'events.jsonl').write_text(''.join(json.dumps(e, ensure_ascii=False) + '\n' for e in events))
    write_json(folder / 'inventory.json', inventory)
    # Manifest is the final commit marker. Interrupted exports have no accepted manifest.
    files = sorted(p for p in folder.rglob('*') if p.is_file() and not p.name.endswith('.tmp'))
    manifest = {'schema_version': 1, 'session_id': (run or {}).get('session_id', str(uuid.uuid4())),
                'kind': (run or {}).get('kind', 'export'), 'status': (run or {}).get('status', 'completed'),
                **metadata, 'scrape_interval_seconds': 15, 'context_seconds': 300,
                'phases': (run or {}).get('phases', []), 'parameters': (run or {}).get('parameters', {}),
                'files': {str(p.relative_to(folder)): {'sha256': digest(p), 'bytes': p.stat().st_size} for p in files},
                'inventory': 'inventory.json',
                'indicator_sources': {'availability': ['series.json#/queries/probe_history'],
                                      'collection': ['series.json#/queries/collection_history'],
                                      'invalid_logins': ['events.jsonl:event=authentication,status=401'],
                                      'clinical_errors': ['events.jsonl:event=record_access,traffic=clinical,status=503'],
                                      **{name: ['derived.json#/queries/' + name] for name in derived}},
                'limitations': ['Host includes workloads outside this project.',
                                'Inventory describes capture time; historical configuration requires a session-start snapshot.',
                                'Derived points do not prove collection completeness; use original samples.',
                                'Missing or rotated source logs cannot be reconstructed.']}
    write_json(folder / 'manifest.json', manifest)
    print(f'Evidências exportadas para {folder}', flush=True)
    return folder


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', nargs='?')
    parser.add_argument('--from', dest='start')
    parser.add_argument('--to', dest='end')
    args = parser.parse_args()
    try:
        export(args.destination, args.start, args.end)
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        parser.exit(1, f'Exportação incompleta: {error}\n')


if __name__ == '__main__':
    main()
