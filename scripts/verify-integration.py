#!/usr/bin/env python3
"""Checks the running lab without exporting credentials or clinical payloads."""
import json
import subprocess
import urllib.request
from evidence import COMPOSE, DOCKER, query

def sql(statement):
    result = subprocess.run(COMPOSE + ['exec', '-T', 'postgres', 'psql', '-U', 'lab_owner', '-d', 'healthlab', '-Atc', statement],
                            check=True, capture_output=True, text=True)
    return result.stdout.strip()

assert sql('SELECT count(*) FROM prontuarios') == '100'
assert sql('SELECT count(*) FROM professionals') == '3'
assert sql("SELECT has_table_privilege('clinical_reader','prontuarios','SELECT'), has_table_privilege('clinical_reader','prontuarios','INSERT'), has_table_privilege('clinical_reader','prontuarios','UPDATE'), has_table_privilege('clinical_reader','prontuarios','DELETE')") == 't|f|f|f'
denied = subprocess.run(COMPOSE + ['exec', '-T', 'postgres', 'psql', '-U', 'lab_owner', '-d', 'healthlab', '-v', 'ON_ERROR_STOP=1', '-c',
    'BEGIN; SET LOCAL ROLE clinical_reader; UPDATE prontuarios SET resumo=resumo WHERE id=1; ROLLBACK;'], capture_output=True, text=True)
assert denied.returncode != 0 and 'permission denied' in denied.stderr, 'Credencial da API deve ter escrita recusada'
subprocess.run(COMPOSE + ['exec', '-T', 'postgres', 'sh', '/docker-entrypoint-initdb.d/001-init.sh'],
               check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
assert sql('SELECT count(*) FROM prontuarios') == '100', 'Inicialização não pode duplicar dados'
assert sql('SELECT count(*) FROM professionals') == '3'
subprocess.run(COMPOSE + ['exec', '-T', 'lab', 'node', 'dist/apps/lab/cli.js', 'check-api'], check=True)
for path in ['/health/live', '/health/ready', '/openapi.json', '/runbook']:
    with urllib.request.urlopen('http://127.0.0.1:3000' + path, timeout=5) as response:
        assert response.status == 200, f'Endpoint local deve funcionar: {path}'
with urllib.request.urlopen('http://127.0.0.1:3001/api/health', timeout=5) as response:
    assert response.status == 200
targets = query('up')['result']
assert len(targets) == 7 and all(float(item['value'][1]) == 1 for item in targets), 'Sete alvos devem responder'
assert float(query('lab:collection_coverage_percent')['result'][0]['value'][1]) == 100
containers = query('count by(container_label_com_docker_compose_service)(container_memory_working_set_bytes{container_label_com_docker_compose_project="governanca-saude"})')['result']
assert {item['metric']['container_label_com_docker_compose_service'] for item in containers} == {'api', 'postgres', 'lab', 'prometheus', 'grafana', 'node-exporter', 'cadvisor'}
ids = subprocess.run(COMPOSE + ['ps', '-q'], check=True, capture_output=True, text=True).stdout.split()
published = []
memory = 0
cpus = 0
for container_id in ids:
    state = json.loads(subprocess.run(DOCKER + ['inspect', container_id, '--format',
        '{"ports":{{json .HostConfig.PortBindings}},"memory":{{.HostConfig.Memory}},"cpus":{{.HostConfig.NanoCpus}}}'],
        check=True, capture_output=True, text=True).stdout)
    memory += state['memory']
    cpus += state['cpus']
    for bindings in (state['ports'] or {}).values():
        for binding in bindings or []:
            assert binding['HostIp'] == '127.0.0.1'
            published.append(binding['HostPort'])
assert sorted(published) == ['3000', '3001']
assert memory <= 8 * 1024**3 and cpus <= 6 * 10**9
print(json.dumps({'result': 'passed', 'records': 100, 'identities': 3, 'targets': 7,
                  'container_metrics': 7, 'published_loopback_ports': published,
                  'cpu_limit': cpus / 10**9, 'memory_limit_gib': memory / 1024**3}))
