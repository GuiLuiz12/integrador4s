#!/usr/bin/env bash
set -euo pipefail
LAB_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$LAB_ROOT"
compose() { "$LAB_ROOT/scripts/docker.sh" compose --env-file "$LAB_ROOT/.env" -f "$LAB_ROOT/infra/compose.yaml" "$@"; }
cli() { compose exec -T lab node dist/apps/lab/cli.js "$@"; }
command="${1:-help}"
shift || true
# Arguments are forwarded only by commands that document them. In particular,
# npm stop -- -v must never become a volume-removal operation.
case "$command" in
  logs|query|load|fail-db|fail-collector|evidence|session-summary|db) ;;
  *) if (( $# )); then echo 'Este comando não aceita argumentos. Consulte npm run help.' >&2; exit 2; fi ;;
esac
case "$command" in
  up) compose up -d --build --wait --wait-timeout 180 ;;
  down) compose down ;;
  status) compose ps ;;
  help) node scripts/help.mjs ;;
  access)
    printf 'Grafana: http://localhost:3001/d/saude-v01 | usuário: admin | senha: GRAFANA_PASSWORD\nOpenAPI: http://localhost:3000/openapi.json\nRecuperação: http://localhost:3000/runbook\nAPI: profissional1 / PROF_1_PASSWORD; profissional2 / PROF_2_PASSWORD; monitor / PROBE_PASSWORD\nPostgreSQL: npm run db | banco: healthlab | administrador: lab_owner / POSTGRES_PASSWORD\nAplicação: clinical_reader / APP_DB_PASSWORD (somente SELECT)\nConsulte as senhas localmente em %s/.env. Nenhum segredo é impresso por este comando.\n' "$LAB_ROOT"
    ;;
  logs)
    if (( $# > 1 )); then echo 'Uso: npm run logs -- [serviço]' >&2; exit 2; fi
    if (( $# )); then
      case "$1" in api|postgres|lab|grafana|prometheus|node-exporter|cadvisor) ;;
        *) echo 'Serviço inválido. Use api, postgres, lab, grafana, prometheus, node-exporter ou cadvisor.' >&2; exit 2 ;;
      esac
    fi
    compose logs --follow --tail 100 "$@"
    ;;
  db)
    if [[ -t 0 ]]; then compose exec postgres psql -U lab_owner -d healthlab "$@";
    else compose exec -T postgres psql -U lab_owner -d healthlab "$@"; fi
    ;;
  health)
    failed=0
    for endpoint in live ready; do
      printf '%s: ' "$endpoint"
      curl --fail-with-body --silent --show-error --max-time 10 "http://127.0.0.1:3000/health/$endpoint" || failed=1
      printf '\n'
    done
    exit "$failed"
    ;;
  check-api) cli check-api ;;
  db-ready) compose exec -T postgres pg_isready -U lab_owner -d healthlab ;;
  restore-db) compose start postgres ;;
  restore-collector) compose start lab ;;
  load)
    (( $# <= 2 )) || { echo 'Uso: npm run simulate:load -- [RATE SECONDS]' >&2; exit 2; }
    cli load "${1:-1}" "${2:-3600}"
    ;;
  invalid-logins) cli invalid-logins ;;
  query)
    (( $# <= 1 )) || { echo 'Passe a expressão PromQL entre aspas. Consulte npm run help.' >&2; exit 2; }
    cli query "${1:-up}"
    ;;
  fail-db|fail-collector)
    (( $# <= 1 )) || { echo 'Informe somente a duração em segundos.' >&2; exit 2; }
    seconds="${1:-120}"
    if [[ ! "$seconds" =~ ^[0-9]+$ ]] || (( seconds < 1 || seconds > 600 )); then
      echo 'Duração deve ser de 1 a 600 segundos.' >&2; exit 2
    fi
    service=postgres
    if [[ "$command" == fail-collector ]]; then service=lab; fi
    timer_pid=''
    restore() {
      trap - EXIT INT TERM
      if [[ -n "$timer_pid" ]]; then
        kill "$timer_pid" 2>/dev/null || true
        wait "$timer_pid" 2>/dev/null || true
      fi
      compose start "$service"
    }
    trap restore EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    printf '%s interrupção de %s por %s s\n' "$(date -u +%FT%TZ)" "$service" "$seconds"
    compose stop -t 5 "$service"
    sleep "$seconds" &
    timer_pid=$!
    wait "$timer_pid"
    timer_pid=''
    ;;
  evidence)
    (( $# <= 1 )) || { echo 'Uso: npm run evidence:export -- [PASTA]' >&2; exit 2; }
    python3 scripts/evidence.py "$@"
    ;;
  session) python3 scripts/session.py "$@" ;;
  session-summary)
    (( $# == 1 )) || { echo 'Uso: npm run session:summary -- evidence/runs/session-<horário>' >&2; exit 2; }
    python3 scripts/summarize-session.py "$@"
    ;;
  rules-test)
    compose run --rm --no-deps --entrypoint promtool -v "$LAB_ROOT/monitoring:/tests:ro" prometheus test rules /tests/rules.test.yml
    ;;
  config-check) compose config --quiet ;;
  *) echo 'Comando desconhecido. Consulte npm run help.' >&2; exit 2 ;;
esac
