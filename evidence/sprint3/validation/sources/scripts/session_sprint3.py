#!/usr/bin/env python3
"""One bounded security exercise; restores normal traffic and preserves incomplete runs."""
import argparse
import json
import pathlib
import signal
import subprocess
import time
import urllib.error
import urllib.request
import uuid
from evidence import ROOT, COMPOSE, context, export, iso, query, timestamp, write_json
from evidence_loki import export_logs

ALERT = 'FalhasDeLoginRepetidas'


def invalid_login():
    body = json.dumps({'username': 'sprint3-invalid', 'password': 'deliberately-invalid'}).encode()
    req = urllib.request.Request('http://127.0.0.1:3000/auth/login', data=body, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


def check_flow():
    result = subprocess.run(COMPOSE + ['exec', '-T', 'lab', 'node', 'dist/apps/lab/cli.js', 'check-api'], check=True, capture_output=True, text=True, timeout=30)
    return {'success': True, 'observation': result.stdout.strip()}


def scalar(expression):
    values = query(expression)['result']
    return float(values[0]['value'][1]) if values else 0


def first_firing(start):
    values = query(f'ALERTS{{alertname="{ALERT}",alertstate="firing"}}[5m]')['result']
    times = [point[0] for item in values for point in item['values'] if point[0] >= start and float(point[1]) == 1]
    return min(times) if times else None


def run(folder):
    folder = pathlib.Path(folder)
    folder.mkdir(parents=True, exist_ok=False)
    session = {'session_id': str(uuid.uuid4()), 'kind': 'security', 'status': 'running',
               'started_at': iso(time.time()), 'parameters': {'invalid_login_interval_seconds': 2,
               'detection_timeout_seconds': 120, 'quiet_recovery_seconds': 60, 'response_actor': 'Roteiro automatizado'}, 'timeline': []}
    def mark(event, at=None, **fields):
        row = {'event': event, 'at': iso(time.time() if at is None else at), **fields}
        session['timeline'].append(row)
        write_json(folder / 'session.json', session)
        print(f"{row['at']} {event}", flush=True)
    begin = time.time()
    def interrupted(signum, frame):
        raise InterruptedError(f'Sessão interrompida pelo sinal {signum}.')
    for sig in (signal.SIGINT, signal.SIGTERM): signal.signal(sig, interrupted)
    try:
        initial = folder / 'start'; initial.mkdir()
        write_json(folder / 'inventory-start.json', context(initial))
        mark('session_started', **check_flow())
        # A full quiet minute avoids carrying another exercise into this incident.
        quiet_start = None
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            healthy = scalar('lab:collection_coverage_percent') == 100
            quiet = scalar('sum(increase(clinical_auth_failures_total{stage="login"}[1m]))') == 0
            clear = not query(f'ALERTS{{alertname="{ALERT}",alertstate="firing"}}')['result']
            if healthy and quiet and clear:
                quiet_start = quiet_start or time.monotonic()
                if time.monotonic() - quiet_start >= 60: break
            else: quiet_start = None
            time.sleep(2)
        else: raise TimeoutError('Não foi possível confirmar um minuto inicial normal.')
        mark('normal_window_confirmed')
        begin = time.time() - 60
        session['started_at'] = iso(begin)
        attack_start = time.time(); deadline = time.monotonic() + 120
        attempts = 0; detected = None
        while time.monotonic() < deadline:
            status = invalid_login()
            if status != 401: raise ValueError(f'Tentativa inválida retornou {status}, esperado 401.')
            attempts += 1
            if attempts == 1: mark('auth_failure_confirmed', http_status=401)
            detected = first_firing(attack_start)
            if detected is not None: break
            time.sleep(2)
        if detected is None: raise TimeoutError('Alerta não disparou no limite de 120 segundos.')
        mark('auth_alert_firing', detected, observed_at=iso(time.time()), alert=ALERT)
        # No generator task remains: this is the first instant no more attempts are scheduled.
        stopped = time.time()
        mark('auth_generator_stopped', stopped, attempts=attempts, actor='Roteiro automatizado', action='Interromper a fonte simulada; não é bloqueio na API.')
        flow = check_flow()
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            resolved = not query(f'ALERTS{{alertname="{ALERT}",alertstate="firing"}}')['result']
            if time.time() - stopped >= 60 and resolved:
                recent, _ = export_logs(time.time() - 60, time.time())
                if not any(e['event'] == 'authentication' and e.get('status') == 401 for e in recent): break
            time.sleep(2)
        else: raise TimeoutError('Não foi possível confirmar encerramento e janela sem falhas.')
        if scalar('lab:collection_coverage_percent') != 100:
            raise ValueError('Coleta incompleta no encerramento.')
        flow = check_flow()
        mark('auth_recovery_confirmed', **flow, quiet_seconds=60, alert_resolved=True, collection_coverage_percent=100)
        finish = time.time()
        # Use the API event's original timestamp, not the client's return timestamp.
        time.sleep(3)
        events, _ = export_logs(begin, finish)
        failed = [e for e in events if e['event'] == 'authentication' and e.get('status') == 401]
        if len(failed) != attempts: raise ValueError('Eventos centralizados divergem das tentativas confirmadas.')
        first = min(failed, key=lambda e: e['time'])
        onset = next(row for row in session['timeline'] if row['event'] == 'auth_failure_confirmed')
        onset.update(at=iso(first['time']/1000), correlation_id=first['correlation_id'], instance_id=first['instance_id'], source='events.jsonl')
        session.update(status='completed', ended_at=iso(finish))
        write_json(folder / 'session.json', session)
        export(folder, begin, finish, session)
        print(f'Sessão concluída: {folder} ({attempts} falhas confirmadas)', flush=True)
    except BaseException as error:
        session.update(status='interrupted_or_failed', ended_at=iso(time.time()), error=str(error))
        mark('session_interrupted_or_failed')
        # All attempts are synchronous and bounded; nothing continues producing failures.
        try: export(folder, begin, time.time(), session)
        except Exception as export_error:
            write_json(folder / 'export-error.json', {'error': str(export_error)})
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=pathlib.Path)
    run(parser.parse_args().output)
