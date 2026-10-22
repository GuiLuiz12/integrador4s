"""Offline verification of exported sources. Requires only Python's standard library."""
import json
import math
import pathlib

from evidence import digest, timestamp, iso
from evidence_catalog import RAW, DERIVED, SERVICES, JOBS

# cAdvisor uses exporter timestamps and dynamic housekeeping (up to 60 s),
# with jitter up to another interval. Allow two scrape cycles of margin.
CONTAINER_MAX_GAP_SECONDS = 150
from legacy_summary import summarize_legacy


def require(condition, message):
    if not condition:
        raise ValueError(message)


def verify_manifest(folder):
    manifest = json.loads((folder / 'manifest.json').read_text())
    require(manifest.get('schema_version') == 1, 'Versão de manifesto não suportada.')
    require(manifest.get('status') == 'completed', 'Sessão incompleta ou restauração pendente.')
    require({'metrics.json', 'series.json', 'derived.json', 'inventory.json', 'events.jsonl'} <= manifest['files'].keys(), 'Fontes obrigatórias ausentes no manifesto.')
    for name, expected in manifest['files'].items():
        path = folder / name
        require(path.resolve().is_relative_to(folder.resolve()) and not path.is_symlink(), f'Caminho inválido: {name}')
        require(path.is_file(), f'Arquivo ausente: {name}')
        require(path.stat().st_size == expected['bytes'] and digest(path) == expected['sha256'], f'Integridade inválida: {name}')
    return manifest


def counter_change(samples):
    """Observed increments, handling resets; no extrapolation across missing samples."""
    total = 0.0
    resets = 0
    for left, right in zip(samples, samples[1:]):
        a, b = float(left[1]), float(right[1])
        if not math.isfinite(a) or not math.isfinite(b):
            continue
        require(right[0] > left[0], 'Amostras do contador fora de ordem.')
        if b < a:
            resets += 1
            total += b
        else:
            total += b - a
    return {'observed_increment': total, 'resets': resets}


def response_events(events):
    """An error diagnostic is not another request; instance IDs scope request IDs."""
    responses = {}
    for event in events:
        if event.get('event') not in {'authentication', 'record_access'}:
            continue
        key = (event.get('service'), event.get('instance_id'), event.get('correlation_id'))
        require(all(key), 'Evento de resposta sem serviço, instância ou correlação.')
        if key in responses:
            require(responses[key] == event, 'Respostas conflitantes para a mesma requisição.')
        responses[key] = event
    return list(responses.values())


def samples(queries, name, **labels):
    return sorted([value for series in queries[name]['data']['result']
                   if all(series['metric'].get(k) == v for k, v in labels.items()) for value in series['values']], key=lambda x: x[0])


def validate_series(queries, start, end):
    for name in RAW:
        require(name in queries, f'Família ausente: {name}')
        result = queries[name]['data']['result']
        if name != 'alert_history':
            require(bool(result), f'Sem amostras de {name}; exportação não sustenta a análise.')
        for series in result:
            values = series['values']
            require(bool(values) and all(math.isfinite(float(p[1])) for p in values), f'Amostras inválidas: {name}')
            require(all(start <= p[0] <= end for p in values), f'Amostras fora do intervalo: {name}')
            require(all(a[0] < b[0] for a, b in zip(values, values[1:])), f'Amostras duplicadas ou fora de ordem: {name}')
        for series in queries[name].get('context_data', {}).get('result', []):
            require(all(start - 300 <= p[0] < start for p in series['values']), f'Contexto fora da janela: {name}')
    for name in ('container_cpu', 'container_memory', 'container_network_receive', 'container_network_transmit'):
        services = {item['metric'].get('container_label_com_docker_compose_service') for item in queries[name]['data']['result']}
        require(set(SERVICES) <= services, f'Métricas incompletas dos sete serviços: {name}')


def summarize(folder):
    folder = pathlib.Path(folder)
    if not (folder / 'manifest.json').exists():
        require(not (folder / 'run.json').exists() and not (folder / 'series.json').exists(), 'Exportação nova incompleta: manifesto ausente.')
        return summarize_legacy(folder)
    manifest = verify_manifest(folder)
    start, end = timestamp(manifest['range_start']), timestamp(manifest['range_end'])
    require(start < end, 'Intervalo inválido.')
    raw = json.loads((folder / 'series.json').read_text())['queries']
    validate_series(raw, start, end)
    inventory = json.loads((folder / 'inventory.json').read_text())
    require({a['service'] for a in inventory['assets']} == set(SERVICES), 'Inventário de ativos incompleto.')
    if (folder / 'inventory-start.json').exists():
        initial = json.loads((folder / 'inventory-start.json').read_text())
        require(initial['source_sha256'] == inventory['source_sha256'], 'Código mudou durante a sessão.')
        require([(a['service'], a['image_id']) for a in initial['assets']] == [(a['service'], a['image_id']) for a in inventory['assets']], 'Imagens mudaram durante a sessão.')
        for original in (folder / 'start/configuration').rglob('*'):
            if original.is_file():
                current = folder / 'configuration' / original.relative_to(folder / 'start/configuration')
                require(digest(original) == digest(current), 'Configuração mudou durante a sessão.')
    events = [json.loads(line) for line in (folder / 'events.jsonl').read_text().splitlines()]
    require(all(start * 1000 <= event['time'] <= end * 1000 for event in events), 'Eventos fora do intervalo.')
    responses = response_events(events)
    probes = samples(raw, 'probe_history')
    require(all(float(p[1]) in (0, 1) for p in probes), 'Probe deve ter valor 0 ou 1.')
    count = len(probes)
    successes = sum(int(float(p[1])) for p in probes)
    require(count > 0, 'Sessão sem verificações assistenciais.')
    gaps = [b[0] - a[0] for a, b in zip(probes, probes[1:])]
    expected = (end - start) / 15
    raw_jobs = {s['metric'].get('job') for s in raw['collection_history']['data']['result']}
    require(raw_jobs == set(JOBS), 'Histórico de coleta deve conter os sete alvos.')
    counters = {name: [dict(labels=s['metric'], **counter_change(s['values'])) for s in raw[name]['data']['result']]
                for name, spec in RAW.items() if spec[3] == 'counter'}
    summary = {'result': 'passed', 'schema_version': 1, 'session_id': manifest['session_id'], 'kind': manifest['kind'],
               'analyzer': {'path': 'scripts/evidence_analysis.py', 'sha256': digest(pathlib.Path(__file__)),
                            'source_manifest_sha256': digest(folder / 'manifest.json')},
               'started_at': iso(start), 'completed_at': iso(end), 'duration_seconds': end - start,
               'observations': count, 'successful_probes': successes, 'failed_probes': count - successes,
               'observed_availability_percent': 100 * successes / count,
               'temporal_completeness_percent': min(100, 100 * count / expected),
               'maximum_probe_gap_seconds': max(gaps, default=0), 'response_events': len(responses),
               'invalid_login_events': sum(e['event'] == 'authentication' and e.get('status') == 401 for e in responses),
               'clinical_503_events': sum(e['event'] == 'record_access' and e.get('traffic') == 'clinical' and e.get('status') == 503 for e in responses),
               'counter_observations': counters, 'sources': manifest['indicator_sources'],
               'note': 'Sessão didática; lacunas preservadas. Incrementos observados não equivalem ao increase extrapolado do Prometheus.'}
    derived = json.loads((folder / 'derived.json').read_text())['queries']
    require(set(DERIVED) <= derived.keys(), 'Indicadores derivados ausentes.')
    for name, item in derived.items():
        for series in item['data']['result']:
            require(all(start <= p[0] <= end for p in series['values']), f'Indicador fora do intervalo: {name}')
    if manifest['kind'] == 'export':
        return summary
    require({'run.json', 'session.json', 'inventory-start.json'} <= manifest['files'].keys(), 'Fontes da sessão ausentes.')
    timeline = json.loads((folder / 'session.json').read_text())
    by_event = {item['event']: item for item in timeline}
    require('session_completed' in by_event and 'session_interrupted_or_failed' not in by_event, 'Sessão interrompida.')
    phases = manifest['phases']
    require(bool(phases) and abs(timestamp(phases[0]['started_at']) - start) < 1, 'Fases não começam junto da observação.')
    require(timestamp(phases[-1]['ended_at']) == end, 'Fases não terminam junto da observação.')
    require(all(timestamp(p['started_at']) < timestamp(p['ended_at']) for p in phases), 'Fase sem duração positiva.')
    for left, right in zip(phases, phases[1:]):
        require(left['ended_at'] == right['started_at'], 'Fases têm sobreposição ou lacuna.')
    minimum = 1800 if manifest['kind'] == 'baseline' else 3600
    require(end - start >= minimum - 1 and count / expected >= .9, 'Duração ou completude insuficiente.')
    for job in JOBS:
        values = samples(raw, 'collection_history', job=job)
        require(values and float(values[-1][1]) == 1 and end - values[-1][0] <= 45, f'Alvo sem coleta válida ao final: {job}')
        scrapes = samples(raw, 'targets', job=job)
        require(sum(float(p[1]) == 1 for p in scrapes) / expected >= .9, f'Completude dos scrapes insuficiente: {job}')
    require(float(probes[-1][1]) == 1 and end - probes[-1][0] <= 45, 'Consulta assistencial não recuperada ao final.')
    require(responses and min(e['time'] for e in responses) / 1000 <= start + 45 and max(e['time'] for e in responses) / 1000 >= end - 45, 'Logs não cobrem as bordas da sessão.')
    summary['sample_counts'] = {name: [len(s['values']) for s in item['data']['result']] for name, item in raw.items()}
    for name in ('host_cpu', 'host_memory_available', 'host_memory_total'):
        require(all(n / expected >= .9 for n in summary['sample_counts'][name]), f'Histórico insuficiente para analisar {name}.')
    # Original cAdvisor observations are not one-to-one with Prometheus scrapes.
    # Report cadence and bounds; never invent repeated observations at 15 s.
    summary['container_sampling'] = {}
    for name in ('container_cpu', 'container_memory', 'container_network_receive', 'container_network_transmit'):
        quality = []
        for series in raw[name]['data']['result']:
            values = series['values']
            gaps = [b[0] - a[0] for a, b in zip(values, values[1:])]
            span = (values[-1][0] - values[0][0]) / (end - start)
            maximum_gap = max(gaps, default=end - start)
            first_gap, last_gap = values[0][0] - start, end - values[-1][0]
            require(len(values) >= 2 and span >= .9 and max(maximum_gap, first_gap, last_gap) <= CONTAINER_MAX_GAP_SECONDS,
                    f'Histórico insuficiente para analisar {name}: cadência ou bordas inválidas.')
            quality.append({'labels': series['metric'], 'samples': len(values),
                            'observed_span_percent': 100 * span, 'maximum_gap_seconds': maximum_gap,
                            'first_sample_delay_seconds': first_gap, 'last_sample_age_seconds': last_gap,
                            'accepted_maximum_gap_seconds': CONTAINER_MAX_GAP_SECONDS})
        summary['container_sampling'][name] = quality
    if manifest['kind'] == 'baseline':
        require(count == successes, 'Baseline contém falha assistencial.')
        require(all(float(p[1]) == 1 for p in samples(raw, 'load_history')), 'Baseline contém mudança de carga.')
        require(all(float(p[1]) == 1 for job in JOBS for p in samples(raw, 'collection_history', job=job)), 'Baseline contém falha de coleta.')
        require(not samples(raw, 'alert_history', alertstate='firing'), 'Baseline contém alerta disparado.')
        require(summary['invalid_login_events'] == 0 and summary['clinical_503_events'] == 0, 'Baseline contém eventos de falha.')
        return summary
    require(manifest['kind'] == 'experiment', 'Tipo de sessão desconhecido.')
    def event_time(name):
        require(name in by_event, f'Marcação ausente: {name}')
        value = timestamp(by_event[name]['at'])
        require(start <= value <= end, f'Marcação fora da sessão: {name}')
        return value
    onset, response = event_time('postgres_outage_confirmed'), event_time('postgres_restart_requested')
    require(response - onset >= 120, 'Interrupção do banco inferior a 120 s.')
    load_start, load_end = event_time('load_5rps_started'), event_time('load_5rps_finished')
    require(load_end - load_start >= 599, 'Carga ampliada inferior a 10 min.')
    load_observations = [p for p in samples(raw, 'load_history') if load_start <= p[0] < load_end]
    require(sum(float(p[1]) == 5 for p in load_observations) >= 36, 'Carga de 5/s não comprovada pelas métricas.')
    require(summary['invalid_login_events'] == 10 and summary['clinical_503_events'] >= 60, 'Eventos esperados não foram observados.')
    require(any(onset <= p[0] <= response and float(p[1]) == 0 for p in probes), 'Falha assistencial não observada pelo verificador.')
    clinical = samples(raw, 'alert_history', alertname='ConsultaAssistencialIndisponivel', alertstate='firing')
    detected = next((p[0] for p in clinical if onset <= p[0] <= response + 45), None)
    recovered = next((p[0] for p in probes if p[0] >= response and float(p[1]) == 1), None)
    require(detected is not None and recovered is not None and detected <= recovered, 'Detecção ou recuperação clínica ausente.')
    begin, finish = event_time('probe_outage_confirmed'), event_time('probe_restore_requested')
    require(finish - begin >= 90, 'Falha isolada inferior a 90 s.')
    for job in ('api', 'lab'):
        observed = [p for p in samples(raw, 'collection_history', job=job) if begin <= p[0] <= finish]
        require(len(observed) >= 4 and all(float(p[1]) == 1 for p in observed), f'Coleta de {job} não permaneceu ativa.')
    for job in manifest['parameters']['collector_alert_jobs']:
        require(any(begin <= p[0] <= finish + 45 for p in samples(raw, 'alert_history', alertname='FalhaDeColeta', alertstate='firing', job=job)), f'Alerta de coleta não observado: {job}')
    require(not any(begin <= p[0] <= finish for p in clinical), 'Falha de coleta gerou falso alerta clínico.')
    attempts = [p for p in samples(raw, 'load_attempts', result='success') if begin <= p[0] <= finish]
    require(len(attempts) >= 4 and counter_change(attempts)['observed_increment'] > 0, 'Gerador não continuou durante falha do verificador.')
    require(any(begin <= p[0] <= finish and float(p[1]) == 0 for p in samples(raw, 'targets', job='probe')), 'Falha isolada não foi observada pelo Prometheus.')
    summary['incident_timeline'] = {'asset_id': 'governanca-saude/postgres', 'onset_confirmed_at': iso(onset),
        'detected_at': iso(detected), 'response_started_at': iso(response), 'recovered_at': iso(recovered),
        'response_actor': 'session_runner', 'detection_seconds': detected - onset,
        'recovery_after_detection_seconds': recovered - detected, 'impact_seconds': recovered - onset,
        'sources': ['session.json:postgres_outage_confirmed', 'session.json:postgres_restart_requested',
                    'series.json#/queries/alert_history', 'series.json#/queries/probe_history']}
    summary['probe_outage_generator_active'] = True
    return summary
