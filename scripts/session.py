#!/usr/bin/env python3
"""A real one-hour session. No synthetic/backfilled monitoring timestamps."""
import datetime as dt
import json
import pathlib
import signal
import subprocess
import time

from evidence import ROOT, COMPOSE, export, query

def lab(*args):
    subprocess.run([str(ROOT / 'scripts/lab.sh'), *args], check=True)

start = time.monotonic()
stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
folder = ROOT / 'evidence' / 'runs' / ('session-' + stamp)
folder.mkdir(parents=True)
events = []

def mark(event):
    item = {'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'elapsed_seconds': round(time.monotonic()-start, 2), 'event': event}
    events.append(item)
    (folder / 'session.json').write_text(json.dumps(events, indent=2) + '\n')
    print(json.dumps(item), flush=True)

def wait_until(seconds):
    while time.monotonic() - start < seconds:
        time.sleep(max(0, min(5, seconds - (time.monotonic() - start))))

def stop(_signal, _frame):
    raise KeyboardInterrupt

signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
try:
    lab('check-api')
    coverage = query('lab:collection_coverage_percent')['result']
    if not coverage or float(coverage[0]['value'][1]) != 100:
        raise RuntimeError('Inicie a sessão somente com cobertura de coleta de 100%')
    mark('session_started')
    lab('load', '1', '7200')
    wait_until(600)
    mark('load_5rps_started')
    lab('load', '5', '600')
    wait_until(1200)
    lab('load', '1', '7200')
    mark('load_5rps_finished')
    wait_until(1500)
    lab('invalid-logins')
    mark('ten_invalid_logins_completed')
    wait_until(1800)
    mark('postgres_outage_started')
    lab('fail-db', '120')
    mark('postgres_restart_requested')
    wait_until(2100)
    lab('check-api')
    mark('clinical_recovery_verified')
    wait_until(2400)
    mark('collector_outage_started')
    lab('fail-collector', '90')
    mark('collector_restart_requested')
    wait_until(3600)
    lab('check-api')
    mark('session_completed')
    export(folder)
except BaseException:
    mark('session_interrupted_or_failed')
    raise
finally:
    subprocess.run(COMPOSE + ['start', 'postgres', 'lab'], check=False)
