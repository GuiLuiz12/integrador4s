#!/usr/bin/env python3
"""Real baseline (30 min) or experiment (60 min), after 5 min of stabilization."""
import argparse
import datetime as dt
import fcntl
import pathlib
import signal
import subprocess
import time
import uuid

from evidence import ROOT, COMPOSE, context, export, query, write_json


def lab(*args):
    subprocess.run([str(ROOT / 'scripts/lab.sh'), *map(str, args)], check=True, timeout=90)


def probe_control(seconds):
    subprocess.run(COMPOSE + ['exec', '-T', 'lab', 'node', 'dist/apps/lab/cli.js', 'probe-control', str(seconds)],
                   check=True, timeout=90)


def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def wait(seconds):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        time.sleep(min(5, max(0, deadline - time.monotonic())))


def ensure_healthy():
    coverage = query('lab:collection_coverage_percent')['result']
    clinical = query('lab:clinical_available')['result']
    if len(coverage) != 1 or float(coverage[0]['value'][1]) != 100 or len(clinical) != 1 or float(clinical[0]['value'][1]) != 1:
        raise RuntimeError('Estabilização exige cobertura 100% e consulta assistencial disponível.')


def interrupted(_signal, _frame):
    raise KeyboardInterrupt


class Session:
    def __init__(self, kind):
        self.kind = kind
        self.session_id = str(uuid.uuid4())
        self.folder = ROOT / 'evidence/runs' / f'{kind}-{self.session_id}'
        self.folder.mkdir(parents=True)
        print(f'Diretório da sessão: {self.folder}', flush=True)
        self.start = time.monotonic()
        self.events = []
        self.run = {'session_id': self.session_id, 'kind': kind, 'status': 'preparing', 'phases': [],
                    'parameters': {'warmup_seconds': 300, 'duration_seconds': 1800 if kind == 'baseline' else 3600,
                                   'normal_rate': 1, 'load_rate': 5, 'load_seconds': 600,
                                   'db_outage_seconds': 120, 'probe_outage_seconds': 90,
                                   'collector_alert_jobs': ['probe'], 'response_actor': 'session_runner'}}

    def save(self):
        write_json(self.folder / 'session.json', self.events)
        write_json(self.folder / 'run.json', self.run)

    def mark(self, event, asset=None):
        item = {'at': utc(), 'elapsed_seconds': round(time.monotonic() - self.start, 3),
                'event': event, 'actor': 'session_runner', 'phase': self.run['phases'][-1]['id'] if self.run['phases'] else 'preparation'}
        if asset:
            item['asset_id'] = f'governanca-saude/{asset}'
        self.events.append(item)
        self.save()
        print(item, flush=True)
        return item

    def phase(self, name, rate=1):
        now = utc()
        if self.run['phases']:
            self.run['phases'][-1]['ended_at'] = now
        self.run['phases'].append({'id': name, 'started_at': now, 'ended_at': None, 'configured_rate': rate})
        self.save()

    def until(self, seconds):
        wait(max(0, self.start + seconds - time.monotonic()))

    def execute(self):
        changed_load = False
        database_stopped = False
        probe_disabled = False
        try:
            lab('check-api')
            ensure_healthy()
            write_json(self.folder / 'inventory-start.json', context(self.folder / 'start'))
            lab('load', 1, 7200)
            changed_load = True
            self.mark('warmup_started')
            for _ in range(20):
                wait(15)
                ensure_healthy()
            self.mark('warmup_completed')
            self.start = time.monotonic()
            self.run['status'] = 'running'
            self.phase('baseline' if self.kind == 'baseline' else 'normal_before_load')
            self.run['started_at'] = self.mark('session_started')['at']
            if self.kind == 'experiment':
                self.until(600)
                lab('load', 5, 600)
                self.phase('load', 5)
                self.mark('load_5rps_started', 'lab')
                self.until(1200)
                lab('load', 1, 7200)
                self.mark('load_5rps_finished', 'lab')
                self.phase('normal_after_load')
                self.until(1500)
                self.phase('invalid_logins')
                self.mark('invalid_logins_started', 'api')
                lab('invalid-logins')
                self.mark('ten_invalid_logins_completed', 'api')
                self.phase('normal_before_db_outage')
                self.until(1800)
                self.phase('db_outage')
                self.mark('postgres_stop_requested', 'postgres')
                database_stopped = True
                subprocess.run(COMPOSE + ['stop', '-t', '5', 'postgres'], check=True, timeout=90)
                self.mark('postgres_outage_confirmed', 'postgres')
                wait(120)
                self.mark('postgres_restart_requested', 'postgres')
                subprocess.run(COMPOSE + ['start', 'postgres'], check=True, timeout=90)
                database_stopped = False
                self.mark('postgres_restart_confirmed', 'postgres')
                self.phase('db_recovery')
                self.until(2100)
                lab('check-api')
                self.mark('clinical_recovery_verified', 'api')
                self.phase('normal_before_probe_outage')
                self.until(2400)
                self.phase('probe_outage')
                self.mark('probe_outage_requested', 'lab')
                probe_disabled = True
                probe_control(90)
                self.mark('probe_outage_confirmed', 'lab')
                wait(90)
                self.mark('probe_restore_requested', 'lab')
                probe_control(0)
                probe_disabled = False
                self.mark('probe_restore_confirmed', 'lab')
                self.phase('normal_after_recovery')
            self.until(self.run['parameters']['duration_seconds'])
            lab('check-api')
            ensure_healthy()
            self.run['ended_at'] = self.mark('session_completed')['at']
            self.run['phases'][-1]['ended_at'] = self.run['ended_at']
            self.run['status'] = 'completed'
        except BaseException:
            self.run['status'] = 'interrupted_or_failed'
            self.mark('session_interrupted_or_failed')
            raise
        finally:
            self.save()
            # Each restoration is attempted even if another one fails.
            failures = []
            for needed, restore in ((database_stopped, lambda: subprocess.run(COMPOSE + ['start', 'postgres'], check=True, timeout=90)),
                                    (probe_disabled, lambda: probe_control(0)),
                                    (changed_load, lambda: lab('load', 1, 7200))):
                if needed:
                    try:
                        restore()
                    except (OSError, subprocess.SubprocessError) as error:
                        failures.append(type(error).__name__)
            if failures:
                self.run['status'] = 'restoration_failed'
                self.save()
                raise RuntimeError('Restauração pendente. Use db:restore e probe:restore; confira o laboratório.')
        export(self.folder, self.run['started_at'], self.run['ended_at'], self.run)
        from evidence_analysis import summarize
        write_json(self.folder / 'summary.json', summarize(self.folder))
        print(f'Sessão validada: {self.folder}', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', action='store_true')
    args = parser.parse_args()
    for name in (signal.SIGINT, signal.SIGTERM):
        signal.signal(name, interrupted)
    runs = ROOT / 'evidence/runs'
    runs.mkdir(parents=True, exist_ok=True)
    with (runs / '.session.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            parser.exit(1, 'Já existe uma sessão de evidência em execução neste checkout.\n')
        Session('baseline' if args.baseline else 'experiment').execute()


if __name__ == '__main__':
    main()
