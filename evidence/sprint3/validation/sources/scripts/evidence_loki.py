#!/usr/bin/env python3
"""Read bounded original Loki entries through the internal Docker network."""
import argparse
import json
import math
import subprocess
import time
from evidence import ALLOWED, COMPOSE, filter_events, iso

LOGQL = '{project="governanca-saude",service="api"}'


def request(path, parameters):
    script = "const u=new URL(process.argv[1], 'http://loki:3100'); for(const [k,v] of Object.entries(JSON.parse(process.argv[2])))u.searchParams.set(k,v); const r=await fetch(u,{signal:AbortSignal.timeout(20000)}); if(!r.ok)throw Error('Loki HTTP '+r.status); console.log(await r.text());"
    result = subprocess.run(COMPOSE + ['exec', '-T', 'lab', 'node', '--input-type=module', '-e', script, path, json.dumps(parameters)], capture_output=True, text=True, check=True, timeout=30)
    body = json.loads(result.stdout)
    if body.get('status') != 'success':
        raise ValueError('Consulta Loki falhou.')
    return body['data']


def entries(logql, start_ns, end_ns, limit=1000, fetch=request):
    """Split inclusive windows; Loki receives an exclusive upper bound (right + 1)."""
    if limit < 2 or start_ns > end_ns:
        raise ValueError('Intervalo ou limite Loki inválido.')
    pending = [(start_ns, end_ns)]
    found = {}
    requests = 0
    while pending:
        left, right = pending.pop()
        data = fetch('/loki/api/v1/query_range', {'query': logql, 'start': str(left), 'end': str(right + 1), 'direction': 'forward', 'limit': str(limit)})
        requests += 1
        if data.get('resultType') != 'streams':
            raise ValueError('Esperados eventos originais, não uma agregação LogQL.')
        rows = [(stream['stream'], int(at), line) for stream in data['result'] for at, line in stream['values']]
        if len(rows) >= limit:
            if left == right:
                raise ValueError('Mais eventos no mesmo timestamp do que o limite; exportação recusada para evitar truncamento.')
            middle = (left + right) // 2
            pending.extend([(middle + 1, right), (left, middle)])
            continue
        for labels, at, line in rows:
            if not left <= at <= right:
                raise ValueError('Loki retornou evento fora da janela solicitada.')
            key = (json.dumps(labels, sort_keys=True), at, line)
            found[key] = {'labels': labels, 'timestamp_ns': str(at), 'line': line}
    return sorted(found.values(), key=lambda row: (int(row['timestamp_ns']), row['line'])), requests


def export_logs(start, end):
    rows, count = entries(LOGQL, math.floor(start * 1e9), math.ceil(end * 1e9))
    for row in rows:
        event = json.loads(row['line'])
        if not isinstance(event, dict) or set(event) - ALLOWED:
            raise ValueError('Evento centralizado fora da lista permitida; não exportado.')
    events = filter_events('\n'.join(row['line'] for row in rows), start, end)
    return events, {'source': 'Loki', 'logql': LOGQL, 'range_start': iso(start), 'range_end': iso(end),
                    'pagination': 'disjoint inclusive nanosecond windows', 'requests': count,
                    'received_entries': len(rows), 'exported_events': len(events), 'entries': rows}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('logql', nargs='?', default=LOGQL)
    p.add_argument('seconds', type=int, nargs='?', default=300)
    args = p.parse_args()
    if not 1 <= args.seconds <= 604800:
        p.error('Janela deve ter de 1 a 604800 segundos.')
    end = time.time_ns()
    rows, _ = entries(args.logql, end - args.seconds * 10**9, end)
    for row in rows:
        print(row['line'])


if __name__ == '__main__':
    main()
