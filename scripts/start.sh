#!/usr/bin/env bash
set -euo pipefail
LAB_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$LAB_ROOT"
if (( $# )); then echo 'Uso: npm start (sem argumentos).' >&2; exit 2; fi
for dependency in docker python3 curl; do
  command -v "$dependency" >/dev/null || { echo "Falta $dependency. Execute npm run setup." >&2; exit 1; }
done
[[ -f .env && ! -L .env ]] || { echo 'Configuração .env ausente ou inválida. Execute npm run setup.' >&2; exit 1; }
bash scripts/lab.sh config-check
bash scripts/lab.sh up
bash scripts/lab.sh check-api
echo '[start] Aguardando os nove alvos e as métricas dos nove serviços (até 120 segundos).'
for ((attempt=0; attempt<24; attempt++)); do
  response="$(bash scripts/lab.sh query 'lab:collection_coverage_percent' 2>/dev/null || true)"
  if python3 -c 'import json,sys; r=json.load(sys.stdin)["data"]["result"]; sys.exit(0 if len(r)==1 and float(r[0]["value"][1])==100 else 1)' <<< "$response" 2>/dev/null; then
    expected_jobs="$(bash scripts/lab.sh query 'lab:target_expected' 2>/dev/null || true)"
    observed_jobs="$(bash scripts/lab.sh query 'up' 2>/dev/null || true)"
    if ! python3 -c 'import json,sys; expected={"api","probe","lab","node","cadvisor","prometheus","grafana","loki","alloy"}; rows=[json.loads(payload)["data"]["result"] for payload in sys.argv[1:]]; sys.exit(0 if all(len(r)==len(expected) and {i["metric"].get("job") for i in r}==expected and all(float(i["value"][1])==1 for i in r) for r in rows) else 1)' "$expected_jobs" "$observed_jobs" 2>/dev/null; then
      sleep 5
      continue
    fi
    containers="$(bash scripts/lab.sh query 'count by(container_label_com_docker_compose_service)(container_memory_working_set_bytes{container_label_com_docker_compose_project="governanca-saude"})' 2>/dev/null || true)"
    if ! python3 -c 'import json,sys; r=json.load(sys.stdin)["data"]["result"]; expected={"api","postgres","lab","prometheus","grafana","node-exporter","cadvisor","loki","alloy"}; sys.exit(0 if {i["metric"].get("container_label_com_docker_compose_service") for i in r}==expected else 1)' <<< "$containers" 2>/dev/null; then
      sleep 5
      continue
    fi
    if ! scripts/docker.sh compose --env-file .env -f infra/compose.yaml exec -T lab node -e 'Promise.all(["http://loki:3100/ready","http://alloy:12345/-/ready"].map(async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error("not ready")})).catch(()=>process.exit(1))'; then
      sleep 5
      continue
    fi
    curl --fail --silent --show-error http://127.0.0.1:3001/api/health >/dev/null
    echo '[start] Pronto: consulta autenticada, Grafana, Loki/Alloy prontos, cobertura 100% e métricas dos nove serviços.'
    bash scripts/lab.sh access
    printf '\nO gerador produz uma consulta fictícia por segundo. Gráficos de cinco minutos precisam desse histórico.\nAcompanhar: npm run status | Encerrar preservando dados: npm stop\n'
    exit 0
  fi
  sleep 5
done
echo '[start] A coleta não chegou a 100%, faltam os nove alvos esperados ou faltam métricas dos contêineres. Consulte npm run status e npm run logs -- cadvisor. Se alterou configurações montadas, execute npm stop e depois npm start para recarregá-las, preservando os volumes.' >&2
exit 1
