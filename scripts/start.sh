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
echo '[start] Aguardando os sete alvos e as métricas dos sete serviços (até 120 segundos).'
for ((attempt=0; attempt<24; attempt++)); do
  response="$(bash scripts/lab.sh query 'lab:collection_coverage_percent' 2>/dev/null || true)"
  if python3 -c 'import json,sys; r=json.load(sys.stdin)["data"]["result"]; sys.exit(0 if len(r)==1 and float(r[0]["value"][1])==100 else 1)' <<< "$response" 2>/dev/null; then
    containers="$(bash scripts/lab.sh query 'count by(container_label_com_docker_compose_service)(container_memory_working_set_bytes{container_label_com_docker_compose_project="governanca-saude"})' 2>/dev/null || true)"
    if ! python3 -c 'import json,sys; r=json.load(sys.stdin)["data"]["result"]; expected={"api","postgres","lab","prometheus","grafana","node-exporter","cadvisor"}; sys.exit(0 if {i["metric"].get("container_label_com_docker_compose_service") for i in r}==expected else 1)' <<< "$containers" 2>/dev/null; then
      sleep 5
      continue
    fi
    curl --fail --silent --show-error http://127.0.0.1:3001/api/health >/dev/null
    echo '[start] Pronto: consulta autenticada, Grafana, cobertura 100% e métricas dos sete serviços.'
    bash scripts/lab.sh access
    printf '\nO gerador produz uma consulta fictícia por segundo. Gráficos de cinco minutos precisam desse histórico.\nAcompanhar: npm run status | Encerrar preservando dados: npm stop\n'
    exit 0
  fi
  sleep 5
done
echo '[start] A coleta não chegou a 100% ou faltam métricas dos contêineres. Consulte npm run status e npm run logs -- cadvisor; preserve os volumes.' >&2
exit 1
